"use client";

// ────────────────────────────────────────────────────────────────────────────
// <AdminModeration> — the /community/admin moderation dashboard body.
//
// Reads the queue (open reports + flagged posts + flagged replies) from the
// community-admin edge function and dispatches actions back to it. The edge fn is
// the sole authority: it re-verifies is_admin server-side and runs every mutation
// through a SECURITY DEFINER RPC that ALSO re-checks is_admin and writes an audit
// row. This component's is_admin gate is UX only — a forced non-admin still gets
// 401s and an empty/failed load.
//
// SECURITY: all user content (report reasons, post/reply bodies, author names) is
// rendered through JSX {} — React auto-escapes; no raw HTML is ever injected.
//
// Design: premium-2026 tokens only (surface / ink / muted / accent / border /
// danger), rounded-2xl cards, hairline border + soft shadow, RTL logical
// properties, dark mode via tokens, real <button>s with aria-labels + visible
// focus rings, aria-live status region. Destructive actions (remove / ban) use
// the inline two-step armed confirm (CrmTeam's revoke idiom) — first click arms,
// second click within 5s executes, "חזרה" or the timeout disarms — instead of a
// blocking native window.confirm.
// ────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import {
  fetchModerationQueue,
  moderateContent,
  resolveReport,
  setBan,
  type ModerationQueue,
  type ModPost,
  type ModReply,
  type ModReport,
} from "@/lib/community-admin";

// ── helpers ──────────────────────────────────────────────────────────────────

function when(ts: string): string {
  const d = new Date(ts);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleString("he-IL", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

function clip(s: string | null, n = 400): string {
  const t = (s ?? "").replace(/\s+/g, " ").trim();
  return t.length > n ? t.slice(0, n - 1).trimEnd() + "…" : t;
}

const BTN_PRIMARY =
  "interactive inline-flex min-h-11 items-center justify-center rounded-xl bg-accent px-4 py-1.5 text-sm font-semibold text-accent-contrast shadow-[var(--glow-accent)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50 [@media(hover:hover)_and_(pointer:fine)]:hover:bg-accent-hover";
const BTN_GHOST =
  "interactive inline-flex min-h-11 items-center justify-center rounded-xl border border-border px-4 py-1.5 text-sm font-medium text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50 [@media(hover:hover)_and_(pointer:fine)]:hover:bg-accent/10";
const BTN_DANGER =
  "interactive inline-flex min-h-11 items-center justify-center rounded-xl border border-danger/40 px-4 py-1.5 text-sm font-medium text-danger-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50 [@media(hover:hover)_and_(pointer:fine)]:hover:bg-danger/10";

function Card({ children }: { children: React.ReactNode }) {
  return <li className="rounded-2xl border border-border bg-surface p-4 shadow-soft">{children}</li>;
}

/** Two-step destructive button (CrmTeam's confirmRevoke idiom): the idle danger
 *  button ARMS on first click, swapping to a confirming button + a "חזרה" escape;
 *  the second click executes. The parent auto-expires a pending arm after 5s. */
function ConfirmDanger({
  armed,
  disabled,
  label,
  confirmLabel,
  ariaLabel,
  onArm,
  onConfirm,
  onDismiss,
}: {
  armed: boolean;
  disabled: boolean;
  label: string;
  confirmLabel: string;
  ariaLabel: string;
  onArm: () => void;
  onConfirm: () => void;
  onDismiss: () => void;
}) {
  if (!armed) {
    return (
      <button type="button" disabled={disabled} onClick={onArm} className={BTN_DANGER} aria-label={ariaLabel}>
        {label}
      </button>
    );
  }
  return (
    <>
      <button
        type="button"
        disabled={disabled}
        onClick={onConfirm}
        className={`${BTN_DANGER} border-danger/60 bg-danger/10`}
        aria-label={ariaLabel}
      >
        {confirmLabel}
      </button>
      <button type="button" disabled={disabled} onClick={onDismiss} className={BTN_GHOST} aria-label="ביטול הפעולה">
        חזרה
      </button>
    </>
  );
}

function SectionTitle({ children, count }: { children: React.ReactNode; count: number }) {
  return (
    <h2 className="mb-3 mt-8 flex items-center gap-2 font-display text-lg font-bold text-ink">
      {children}
      <span className="inline-flex min-w-6 items-center justify-center rounded-full bg-accent/10 px-2 py-0.5 text-xs font-semibold text-accent-text">
        {count}
      </span>
    </h2>
  );
}

// ── component ────────────────────────────────────────────────────────────────

export default function AdminModeration() {
  const { ready, profile } = useAuth();
  const isAdmin = !!profile?.is_admin;

  const [queue, setQueue] = useState<ModerationQueue | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [notice, setNotice] = useState("");
  // Action key (post:<id> / reply:<id> / ban:<uid>) whose destructive button is
  // ARMED, awaiting the second, confirming click (two-step confirm — same idiom
  // as CrmTeam's revoke; replaces the old blocking window.confirm).
  const [confirmKey, setConfirmKey] = useState<string | null>(null);

  // A pending armed confirm quietly expires if the admin does nothing.
  useEffect(() => {
    if (!confirmKey) return;
    const t = setTimeout(() => setConfirmKey(null), 5000);
    return () => clearTimeout(t);
  }, [confirmKey]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    const q = await fetchModerationQueue();
    if (q) setQueue(q);
    else setError(true);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (ready && isAdmin) void load();
    else if (ready) setLoading(false);
  }, [ready, isAdmin, load]);

  const mark = useCallback((key: string, on: boolean) => {
    setBusy((prev) => {
      const next = new Set(prev);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });
  }, []);

  // Run an action, then mutate local state on success so the row disappears
  // without a full refetch. `key` disables the row's buttons while in flight.
  const run = useCallback(
    async (key: string, fn: () => Promise<boolean>, onOk: () => void, okMsg: string) => {
      setConfirmKey(null); // acting consumes / disarms any pending confirm
      mark(key, true);
      const ok = await fn();
      mark(key, false);
      if (ok) {
        onOk();
        setNotice(okMsg);
      } else {
        setNotice("הפעולה נכשלה. נסו שוב.");
      }
    },
    [mark],
  );

  const onResolve = (r: ModReport, status: "resolved" | "dismissed") =>
    run(
      `report:${r.id}`,
      () => resolveReport(r.id, status),
      () =>
        setQueue((q) => (q ? { ...q, reports: q.reports.filter((x) => x.id !== r.id) } : q)),
      status === "resolved" ? "הדיווח סומן כטופל." : "הדיווח נדחה.",
    );

  // Removal / ban are gated by the inline two-step confirm in the JSX below
  // (ConfirmDanger) — by the time these run, the admin already confirmed.
  const onModeratePost = (p: ModPost, act: "approve" | "remove") =>
    run(
      `post:${p.id}`,
      () => moderateContent("community_posts", p.id, act),
      () =>
        setQueue((q) => (q ? { ...q, flaggedPosts: q.flaggedPosts.filter((x) => x.id !== p.id) } : q)),
      act === "approve" ? "הפוסט אושר." : "הפוסט הוסר.",
    );

  const onModerateReply = (r: ModReply, act: "approve" | "remove") =>
    run(
      `reply:${r.id}`,
      () => moderateContent("community_replies", r.id, act),
      () =>
        setQueue((q) => (q ? { ...q, flaggedReplies: q.flaggedReplies.filter((x) => x.id !== r.id) } : q)),
      act === "approve" ? "התגובה אושרה." : "התגובה הוסרה.",
    );

  const onBan = (userId: string) =>
    run(
      `ban:${userId}`,
      () => setBan(userId, true),
      () =>
        setQueue((q) =>
          q
            ? {
                ...q,
                flaggedPosts: q.flaggedPosts.filter((x) => x.user_id !== userId),
                flaggedReplies: q.flaggedReplies.filter((x) => x.user_id !== userId),
              }
            : q,
        ),
      "המשתמש נחסם.",
    );

  // ── gates ────────────────────────────────────────────────────────────────
  if (!ready || (isAdmin && loading)) {
    return <p className="text-sm text-muted">טוען…</p>;
  }
  if (!isAdmin) {
    return (
      <div className="rounded-2xl border border-border bg-surface p-6 text-center shadow-soft">
        <p className="text-sm text-muted">אין לך הרשאת ניהול. הדף זמין למנהלי הקהילה בלבד.</p>
      </div>
    );
  }
  if (error) {
    return (
      <div className="rounded-2xl border border-border bg-surface p-6 text-center shadow-soft">
        <p className="text-sm text-muted">לא הצלחנו לטעון את התור.</p>
        <button type="button" onClick={() => void load()} className={`${BTN_GHOST} mt-4`}>
          נסו שוב
        </button>
      </div>
    );
  }

  const reports = queue?.reports ?? [];
  const posts = queue?.flaggedPosts ?? [];
  const replies = queue?.flaggedReplies ?? [];
  const empty = reports.length === 0 && posts.length === 0 && replies.length === 0;

  return (
    <div>
      <p role="status" aria-live="polite" className="min-h-5 text-sm text-accent-text">
        {notice}
      </p>

      {empty && (
        <div className="rounded-2xl border border-border bg-surface p-6 text-center shadow-soft">
          <p className="text-sm text-muted">אין דיווחים פתוחים או תוכן מסומן. הכול נקי ✨</p>
        </div>
      )}

      {reports.length > 0 && (
        <>
          <SectionTitle count={reports.length}>דיווחים פתוחים</SectionTitle>
          <ul className="space-y-3">
            {reports.map((r) => {
              const b = busy.has(`report:${r.id}`);
              return (
                <Card key={r.id}>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                    <span className="inline-flex items-center rounded-full border border-border px-2 py-0.5 font-medium">
                      {r.target_type === "reply" ? "תגובה" : "פוסט"}
                    </span>
                    <span className="font-mono">{r.target_id.slice(0, 8)}</span>
                    <span>·</span>
                    <span>{when(r.created_at)}</span>
                  </div>
                  {r.body && <p className="mt-2 whitespace-pre-wrap text-sm text-foreground">{clip(r.body)}</p>}
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={b}
                      onClick={() => onResolve(r, "resolved")}
                      className={BTN_PRIMARY}
                      aria-label="סמן את הדיווח כטופל"
                    >
                      סמן כטופל
                    </button>
                    <button
                      type="button"
                      disabled={b}
                      onClick={() => onResolve(r, "dismissed")}
                      className={BTN_GHOST}
                      aria-label="דחה את הדיווח"
                    >
                      דחה
                    </button>
                  </div>
                </Card>
              );
            })}
          </ul>
        </>
      )}

      {posts.length > 0 && (
        <>
          <SectionTitle count={posts.length}>פוסטים מסומנים</SectionTitle>
          <ul className="space-y-3">
            {posts.map((p) => {
              const b = busy.has(`post:${p.id}`) || busy.has(`ban:${p.user_id}`);
              return (
                <Card key={p.id}>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                    <span className="font-semibold text-ink">{p.author || "משתמש/ת"}</span>
                    <span>·</span>
                    <span className="inline-flex items-center rounded-full border border-border px-2 py-0.5 font-medium">
                      {p.channel}
                    </span>
                    <span>·</span>
                    <span>{when(p.created_at)}</span>
                  </div>
                  <p className="mt-2 whitespace-pre-wrap text-sm text-foreground">{clip(p.body)}</p>
                  {p.moderation_note && (
                    <p className="mt-2 rounded-xl border border-border bg-background px-3 py-2 text-xs text-muted">
                      סיבת הסימון: {p.moderation_note}
                    </p>
                  )}
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button type="button" disabled={b} onClick={() => void onModeratePost(p, "approve")} className={BTN_PRIMARY} aria-label="אשר את הפוסט והסר את הסימון">
                      אשר
                    </button>
                    <ConfirmDanger
                      armed={confirmKey === `post:${p.id}`}
                      disabled={b}
                      label="הסר"
                      confirmLabel="לאשר הסרה לצמיתות?"
                      ariaLabel="הסר את הפוסט לצמיתות"
                      onArm={() => setConfirmKey(`post:${p.id}`)}
                      onConfirm={() => void onModeratePost(p, "remove")}
                      onDismiss={() => setConfirmKey(null)}
                    />
                    <ConfirmDanger
                      armed={confirmKey === `ban:${p.user_id}`}
                      disabled={b}
                      label="חסום משתמש"
                      confirmLabel="לאשר חסימה?"
                      ariaLabel="חסום את מפרסם הפוסט"
                      onArm={() => setConfirmKey(`ban:${p.user_id}`)}
                      onConfirm={() => void onBan(p.user_id)}
                      onDismiss={() => setConfirmKey(null)}
                    />
                  </div>
                </Card>
              );
            })}
          </ul>
        </>
      )}

      {replies.length > 0 && (
        <>
          <SectionTitle count={replies.length}>תגובות מסומנות</SectionTitle>
          <ul className="space-y-3">
            {replies.map((r) => {
              const b = busy.has(`reply:${r.id}`) || busy.has(`ban:${r.user_id}`);
              return (
                <Card key={r.id}>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                    <span className="font-semibold text-ink">{r.author || "משתמש/ת"}</span>
                    <span>·</span>
                    <span>{when(r.created_at)}</span>
                  </div>
                  <p className="mt-2 whitespace-pre-wrap text-sm text-foreground">{clip(r.body)}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button type="button" disabled={b} onClick={() => void onModerateReply(r, "approve")} className={BTN_PRIMARY} aria-label="אשר את התגובה והסר את הסימון">
                      אשר
                    </button>
                    <ConfirmDanger
                      armed={confirmKey === `reply:${r.id}`}
                      disabled={b}
                      label="הסר"
                      confirmLabel="לאשר הסרה לצמיתות?"
                      ariaLabel="הסר את התגובה לצמיתות"
                      onArm={() => setConfirmKey(`reply:${r.id}`)}
                      onConfirm={() => void onModerateReply(r, "remove")}
                      onDismiss={() => setConfirmKey(null)}
                    />
                    <ConfirmDanger
                      armed={confirmKey === `ban:${r.user_id}`}
                      disabled={b}
                      label="חסום משתמש"
                      confirmLabel="לאשר חסימה?"
                      ariaLabel="חסום את מפרסם התגובה"
                      onArm={() => setConfirmKey(`ban:${r.user_id}`)}
                      onConfirm={() => void onBan(r.user_id)}
                      onDismiss={() => setConfirmKey(null)}
                    />
                  </div>
                </Card>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
