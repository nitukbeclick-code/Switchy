"use client";

// ────────────────────────────────────────────────────────────────────────────
// <UnansweredThreads> — the threads nobody has answered yet, newest first.
//
// WHY THIS IS SEPARATE FROM <AdminModeration>, and not a section inside it:
// AdminModeration's error gate returns EARLY and replaces its whole render, so
// when the community-admin edge function is unavailable the entire dashboard
// collapses to "לא הצלחנו לטעון את התור". This view must survive that, because
// it is the one part of the console that needs no server authority at all:
// community_feed is a public read and FeedQuery already supports unansweredOnly.
// Mounted as a SIBLING, an unreachable moderation queue cannot hide it.
//
// It is also the view that matters most day to day. The moderation queue is
// exception handling — reports and flags, of which there are currently none.
// Unanswered threads are the actual job: today that is 5 of the 7 posts, the
// oldest waiting since 13/07.
//
// Truth-only: "0 threads" and "the query failed" are DIFFERENT states and are
// rendered differently. A failed read must never read as "everything answered".
//
// Design: premium-2026 tokens (surface / ink / muted / accent / border), RTL
// logical properties, dark mode via tokens, and a real listbox — roving
// aria-activedescendant, j/k + arrows to move, Enter/o to open — so the queue
// can be worked from the keyboard instead of hunted with a mouse.
// ────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { type CommunityPost, fetchFeed } from "@/lib/community";

const PAGE = 20;

const BTN_GHOST =
  "interactive inline-flex min-h-11 items-center justify-center rounded-xl border border-border px-4 py-1.5 text-sm font-medium text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50 [@media(hover:hover)_and_(pointer:fine)]:hover:bg-accent/10";

/** Whole days since `iso`, or null when the timestamp is unusable — never a
 *  fabricated 0, which would read as "posted today". */
export function daysWaiting(iso: string, now = Date.now()): number | null {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Math.floor((now - t) / 86_400_000));
}

/** The waiting label. Deliberately blunt — "ממתין 17 ימים" is the whole point of
 *  this view; a soft "לפני שבועיים" hides how long somebody has gone ignored. */
export function waitingLabel(iso: string, now = Date.now()): string {
  const d = daysWaiting(iso, now);
  if (d === null) return "";
  if (d === 0) return "ממתין מהיום";
  if (d === 1) return "ממתין יום";
  return `ממתין ${d} ימים`;
}

function clip(s: string | null | undefined, n = 180): string {
  const t = String(s ?? "").replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n)}…` : t;
}

function Skeleton() {
  return (
    <ul className="space-y-3" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <li key={i} className="rounded-2xl border border-border bg-surface p-4 shadow-soft">
          <div className="flex items-center gap-2">
            <span className="h-4 w-16 animate-pulse rounded-full bg-border/60" />
            <span className="h-3 w-24 animate-pulse rounded bg-border/50" />
          </div>
          <div className="mt-3 space-y-2">
            <span className="block h-3 w-full animate-pulse rounded bg-border/50" />
            <span className="block h-3 w-2/3 animate-pulse rounded bg-border/50" />
          </div>
        </li>
      ))}
    </ul>
  );
}

export default function UnansweredThreads() {
  const { ready, profile, user } = useAuth();
  const isAdmin = !!profile?.is_admin;

  const [rows, setRows] = useState<CommunityPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [sel, setSel] = useState(0);
  const listRef = useRef<HTMLUListElement | null>(null);
  // The clock is captured WHEN THE ROWS LAND, not during render: every row's
  // day-count then comes from one instant (rows reading their own Date.now() can
  // disagree across a midnight boundary), and render stays pure — memoising
  // Date.now() would be an impure call inside useMemo, which is precisely what
  // the react-hooks/purity rule rejects.
  const [loadedAt, setLoadedAt] = useState(() => Date.now());

  const load = useCallback(
    () =>
      fetchFeed({ unansweredOnly: true, limit: PAGE, viewerId: user?.id ?? null }).then((page) => {
        // fetchFeed reports a failed query honestly rather than as an empty feed.
        if (page.error) {
          setError(true);
        } else {
          setRows(page.rows);
          setLoadedAt(Date.now());
          setError(false);
          setSel((s) => Math.min(s, Math.max(0, page.rows.length - 1)));
        }
        setLoading(false);
      }),
    [user?.id],
  );

  const reload = useCallback(() => {
    setLoading(true);
    setError(false);
    void load();
  }, [load]);

  useEffect(() => {
    if (ready && isAdmin) void load();
  }, [ready, isAdmin, load]);

  // Keep the selected row in view when moving by keyboard. Feature-detected:
  // scrollIntoView is absent in jsdom and in older embedded webviews, and this is
  // a cosmetic scroll — it must never throw and take the whole list down with it.
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-idx="${sel}"]`);
    if (el && typeof el.scrollIntoView === "function") el.scrollIntoView({ block: "nearest" });
  }, [sel]);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLUListElement>) => {
      if (rows.length === 0) return;
      const k = e.key;
      if (k === "j" || k === "ArrowDown") {
        e.preventDefault();
        setSel((s) => Math.min(rows.length - 1, s + 1));
      } else if (k === "k" || k === "ArrowUp") {
        e.preventDefault();
        setSel((s) => Math.max(0, s - 1));
      } else if (k === "Home") {
        e.preventDefault();
        setSel(0);
      } else if (k === "End") {
        e.preventDefault();
        setSel(rows.length - 1);
      } else if (k === "Enter" || k === "o") {
        // Follow the selected row's real link rather than pushing a route here,
        // so keyboard and mouse go through exactly one navigation path.
        const link = listRef.current?.querySelector<HTMLAnchorElement>(`[data-idx="${sel}"] a[href]`);
        if (link) {
          e.preventDefault();
          link.click();
        }
      }
    },
    [rows.length, sel],
  );

  if (!ready || (isAdmin && loading)) return <Skeleton />;
  // Silent for non-admins: this is a staff view, and the page it sits on already
  // explains the permission gate once. A second "אין הרשאה" card is just noise.
  if (!isAdmin) return null;

  if (error) {
    return (
      <div className="rounded-2xl border border-border bg-surface p-6 text-center shadow-soft">
        <p className="text-sm text-muted">לא הצלחנו לטעון את השרשורים.</p>
        <button type="button" onClick={reload} className={`${BTN_GHOST} mt-4`}>
          נסו שוב
        </button>
      </div>
    );
  }

  return (
    <section aria-labelledby="unanswered-h">
      <div className="flex items-start justify-between gap-3">
        <h2
          id="unanswered-h"
          className="mb-3 mt-8 flex items-center gap-2 font-display text-lg font-bold text-ink"
        >
          ממתינים למענה
          <span className="inline-flex min-w-6 items-center justify-center rounded-full bg-accent/10 px-2 py-0.5 text-xs font-semibold text-accent-text">
            {rows.length}
          </span>
        </h2>
        <button
          type="button"
          onClick={reload}
          disabled={loading}
          className={`${BTN_GHOST} mt-8`}
          aria-label="רענון רשימת השרשורים ללא מענה"
        >
          רענון
        </button>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-border bg-surface p-6 text-center shadow-soft">
          <p className="text-sm text-muted">כל השרשורים נענו 🎉</p>
        </div>
      ) : (
        <>
          <p className="mb-3 text-xs text-muted">
            חצים או <kbd className="rounded border border-border px-1">j</kbd>/
            <kbd className="rounded border border-border px-1">k</kbd> למעבר,{" "}
            <kbd className="rounded border border-border px-1">Enter</kbd> לפתיחה.
          </p>
          <ul
            ref={listRef}
            role="listbox"
            aria-label="שרשורים ללא מענה"
            aria-activedescendant={rows[sel] ? `unanswered-${rows[sel].id}` : undefined}
            tabIndex={0}
            onKeyDown={onKeyDown}
            className="space-y-3 rounded-2xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            {rows.map((p, i) => {
              const selected = i === sel;
              return (
                <li
                  key={p.id}
                  id={`unanswered-${p.id}`}
                  data-idx={i}
                  role="option"
                  aria-selected={selected}
                  onClick={() => setSel(i)}
                  className={`rounded-2xl border bg-surface p-4 shadow-soft ${
                    selected ? "border-accent ring-1 ring-accent" : "border-border"
                  }`}
                >
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                    <span className="rounded-full bg-accent/10 px-2 py-0.5 font-medium text-accent-text">
                      {p.channel}
                    </span>
                    <span>{p.author}</span>
                    <span aria-hidden="true">·</span>
                    <span className="font-medium text-ink">{waitingLabel(p.created_at, loadedAt)}</span>
                    {p.is_pinned && <span className="text-accent-text">📌 נעוץ</span>}
                  </div>
                  <p className="mt-2 whitespace-pre-wrap text-sm text-ink">{clip(p.body)}</p>
                  <div className="mt-3">
                    <Link
                      href={`/community/post/${p.id}`}
                      className="text-sm font-medium text-accent-text underline underline-offset-4"
                    >
                      פתחו והשיבו ←
                    </Link>
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}
