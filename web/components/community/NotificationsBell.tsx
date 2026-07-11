"use client";

// ────────────────────────────────────────────────────────────────────────────
// <NotificationsBell> — the community notifications indicator + dropdown.
//
// A header-cluster bell (matches the <AccessibilityWidget> / <AiConcierge>
// triggers) that shows the signed-in user's community notifications: someone
// replied to their post, mentioned them (@name), or a moderator flagged their
// content. It POLLS the data layer on mount + every 60s (the community-notify
// trigger writes rows server-side; there is no realtime here — a light poll is
// enough for an ambient bell), surfaces an unread count on the bell, and opens a
// dropdown listing each notification as a Hebrew line + actor + relative time.
// Clicking an unread item marks it read (fetchNotifications / markNotificationRead).
//
// Gating: notifications are per-user (RLS scopes community_notifications to
// auth.uid()), so with no session there is nothing to show — the bell renders
// nothing at all until `useAuth()` reports a user. It never talks to Supabase
// directly; every read/write goes through lib/community.
//
// a11y: a real labelled <button> (aria-haspopup="dialog", aria-expanded), a
// role="dialog" aria-modal panel holding a plain <ul>/<li> list of buttons
// (no arrow-key menu semantics), focus moved in on open / returned to the
// trigger on close, ESC + click-outside close, a Tab focus trap while open,
// visible focus rings, and the unread count announced in the label.
// All text is Hebrew, RTL, token-driven; motion respects the .popover contract
// (which is neutralized under prefers-reduced-motion / the a11y "stop motion").
// ────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useId, useRef, useState } from "react";
import {
  fetchNotifications,
  markNotificationRead,
  type CommunityNotification,
} from "@/lib/community";
import { useAuth } from "@/lib/auth-context";

const POLL_MS = 60_000;

// ── Relative-time (Hebrew) — tiny local helper, no dependency. DELIBERATELY not
// lib/community-render's relativeTime: this variant floors instead of rounding,
// opens with "ממש עכשיו" (vs "לפני רגע"), and bridges the month→year gap, so
// folding it into the shared helper would change the bell's visible copy. ─────
function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "";
  const diff = Date.now() - then;
  // Guard against clock skew (a "future" timestamp) — treat as "just now".
  const sec = Math.max(0, Math.floor(diff / 1000));
  if (sec < 45) return "ממש עכשיו";
  const min = Math.floor(sec / 60);
  if (min < 1) return "ממש עכשיו";
  if (min === 1) return "לפני דקה";
  if (min < 60) return `לפני ${min} דקות`;
  const hr = Math.floor(min / 60);
  if (hr === 1) return "לפני שעה";
  if (hr < 24) return `לפני ${hr} שעות`;
  const day = Math.floor(hr / 24);
  if (day === 1) return "אתמול";
  if (day < 7) return `לפני ${day} ימים`;
  const wk = Math.floor(day / 7);
  if (wk === 1) return "לפני שבוע";
  if (day < 30) return `לפני ${wk} שבועות`;
  const mo = Math.floor(day / 30);
  if (mo === 1) return "לפני חודש";
  // Bridge the 360–364-day gap: day/30 already reads ≥12 months here while
  // day/365 is still 0, so stay on the months phrasing until a full year.
  if (day < 365) return `לפני ${mo} חודשים`;
  // Derive years from months so 12–23 months never rounds down to "0 שנים".
  const yr = Math.floor(mo / 12);
  if (yr === 1) return "לפני שנה";
  return `לפני ${yr} שנים`;
}

// ── Per-kind Hebrew line. The actor (untrusted display name) is rendered
// separately via JSX {} so it is always escaped; this returns only the fixed
// verb copy for the notification's kind. ────────────────────────────────────
function kindLine(kind: CommunityNotification["kind"]): string {
  switch (kind) {
    case "reply":
      return "הגיב/ה על הפוסט שלך";
    case "mention":
      return "הזכיר/ה אותך בתגובה";
    case "flag":
      return "התוכן שלך סומן לבדיקת מנהל";
    case "reaction":
      return "הגיב/ה לתוכן שלך";
    case "like":
      return "עשה/עשתה לייק לפוסט שלך";
    case "pinned":
      return "הפוסט שלך הוצמד לראש הפיד";
    default:
      return "עדכון חדש";
  }
}

export default function NotificationsBell() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<CommunityNotification[]>([]);
  const [loading, setLoading] = useState(false);

  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  // Guards a load from writing state after unmount / user change.
  const mountedRef = useRef(true);
  // Ids the user optimistically marked read this session, with the local
  // read stamp. A poll / on-open refetch returns server rows that may still
  // read as unread (write in-flight or just landed); we force these read when
  // merging so a refetch never resurrects a just-read item back to unread.
  const locallyReadRef = useRef<Map<number, string>>(new Map());

  const baseId = useId();
  const titleId = `${baseId}-title`;
  const menuId = `${baseId}-menu`;

  const unread = items.filter((n) => n.read_at === null).length;

  // ── Poll: load on mount + every 60s while signed in. ────────────────────────
  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const rows = await fetchNotifications(30);
      if (mountedRef.current) {
        // Re-apply optimistic reads: if we marked a row read locally, keep the
        // later (max) read_at so an in-flight/lagging server row can't flip it
        // back to unread.
        const localReads = locallyReadRef.current;
        setItems(
          rows.map((row) => {
            const localStamp = localReads.get(row.id);
            if (!localStamp) return row;
            const serverStamp = row.read_at;
            const merged =
              serverStamp && serverStamp > localStamp ? serverStamp : localStamp;
            return row.read_at === merged ? row : { ...row, read_at: merged };
          }),
        );
      }
    } catch {
      /* fail-soft — keep whatever we last had; the bell is ambient. */
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    mountedRef.current = true;
    if (!user) {
      // Signed out (or switched to a null user): clear so no stale rows linger.
      setItems([]);
      return () => {
        mountedRef.current = false;
      };
    }
    void load();
    const id = window.setInterval(() => void load(), POLL_MS);
    return () => {
      mountedRef.current = false;
      window.clearInterval(id);
    };
  }, [user, load]);

  // ── One header popover open at a time: close when a sibling opens; announce
  // our own open so siblings (a11y widget / AI chat) close. ───────────────────
  useEffect(() => {
    function onSiblingOpen(e: Event) {
      if ((e as CustomEvent<string>).detail !== "notifications") setOpen(false);
    }
    window.addEventListener(
      "switchy:popover-open",
      onSiblingOpen as EventListener,
    );
    return () =>
      window.removeEventListener(
        "switchy:popover-open",
        onSiblingOpen as EventListener,
      );
  }, []);

  // Close + return focus to the trigger (WAI-ARIA menu button).
  const closeMenu = useCallback(() => {
    setOpen(false);
    triggerRef.current?.focus();
  }, []);

  const openMenu = useCallback(() => {
    window.dispatchEvent(
      new CustomEvent("switchy:popover-open", { detail: "notifications" }),
    );
    setOpen(true);
    void load(); // refresh the moment it opens
  }, [load]);

  // Move focus into the panel when it opens (first focusable, else the panel).
  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => {
      const first = panelRef.current?.querySelector<HTMLElement>(
        'button, [href], [tabindex]:not([tabindex="-1"])',
      );
      (first ?? panelRef.current)?.focus();
    }, 20);
    return () => window.clearTimeout(t);
  }, [open]);

  // ESC closes; TAB is trapped within the panel while open.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        closeMenu();
        return;
      }
      if (e.key !== "Tab") return;
      const panel = panelRef.current;
      if (!panel) return;
      const focusables = Array.from(
        panel.querySelectorAll<HTMLElement>(
          'button, [href], [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((el) => !el.hasAttribute("disabled"));
      if (focusables.length === 0) {
        e.preventDefault();
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey) {
        if (active === first || !panel.contains(active)) {
          e.preventDefault();
          last.focus();
        }
      } else if (active === last) {
        e.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, closeMenu]);

  // Click-outside closes (pointerdown, before focus shifts).
  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      const target = e.target as Node;
      if (
        panelRef.current?.contains(target) ||
        triggerRef.current?.contains(target)
      ) {
        return;
      }
      setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  // Mark a single notification read (optimistic; reverts on failure).
  const markRead = useCallback(async (n: CommunityNotification) => {
    if (n.read_at !== null) return;
    const stamp = new Date().toISOString();
    locallyReadRef.current.set(n.id, stamp);
    setItems((prev) =>
      prev.map((x) => (x.id === n.id ? { ...x, read_at: stamp } : x)),
    );
    try {
      await markNotificationRead(n.id);
    } catch {
      // The write failed — forget the optimistic read so a later refetch shows
      // the true (unread) server state and revert the row now.
      locallyReadRef.current.delete(n.id);
      if (mountedRef.current) {
        setItems((prev) =>
          prev.map((x) => (x.id === n.id ? { ...x, read_at: null } : x)),
        );
      }
    }
  }, []);

  // Mark everything unread as read.
  const markAllRead = useCallback(async () => {
    const unreadRows = items.filter((n) => n.read_at === null);
    if (unreadRows.length === 0) return;
    const stamp = new Date().toISOString();
    for (const n of unreadRows) locallyReadRef.current.set(n.id, stamp);
    setItems((prev) =>
      prev.map((x) => (x.read_at === null ? { ...x, read_at: stamp } : x)),
    );
    await Promise.all(
      unreadRows.map((n) =>
        markNotificationRead(n.id).catch(() => {
          // Forget the optimistic read for the rows whose write failed so a
          // later refetch reflects the true server state.
          locallyReadRef.current.delete(n.id);
        }),
      ),
    );
  }, [items]);

  // Nothing to show for signed-out visitors (notifications are per-user).
  if (!user) return null;

  const label =
    unread > 0 ? `התראות · ${unread} חדשות` : "התראות";

  return (
    <>
      {/* Trigger — a 40px round bell in the header end cluster (parity with the
          a11y + AI triggers). Unread count sits as a small badge on the bell. */}
      <button
        ref={triggerRef}
        type="button"
        onClick={() => (open ? closeMenu() : openMenu())}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={label}
        className={[
          "relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full",
          "border border-border bg-surface text-foreground shadow-sm",
          "interactive press hover:bg-background",
          "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
        ].join(" ")}
      >
        <BellGlyph active={unread > 0} />
        {unread > 0 && (
          <span
            aria-hidden="true"
            className={[
              "absolute top-[-2px] end-[-2px]",
              "flex h-4 min-w-4 items-center justify-center rounded-full px-1",
              "bg-accent text-[0.625rem] font-bold leading-none text-accent-contrast",
              "ring-2 ring-surface",
            ].join(" ")}
          >
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          ref={panelRef}
          id={menuId}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          tabIndex={-1}
          style={{ ["--popover-origin" as string]: "top left" }}
          className={[
            "popover",
            // Descends BELOW the sticky header, pinned to the inline-END (RTL:
            // left) gutter of the centered header (max-w-5xl = 64rem) so on wide
            // screens it drops from the bell, not the far edge; 1rem on phones.
            "fixed top-16 z-40 flex w-[min(22rem,calc(100vw-2rem))] flex-col end-[calc(max(0px,(100vw-64rem)/2)+1rem)]",
            "max-h-[min(32rem,calc(100dvh-6rem))] overflow-hidden rounded-2xl",
            "border border-border bg-surface text-foreground shadow-float",
          ].join(" ")}
        >
          {/* Header: title + "mark all read" + close. */}
          <div className="sticky top-0 flex items-center justify-between gap-2 border-b border-border bg-surface px-4 py-3">
            <h2 id={titleId} className="text-base font-semibold text-foreground">
              התראות
            </h2>
            <div className="flex items-center gap-1">
              {unread > 0 && (
                <button
                  type="button"
                  onClick={() => void markAllRead()}
                  className="interactive press rounded-lg px-2 py-1 text-xs font-medium text-accent-text hover:bg-background focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                  סמן הכל כנקרא
                </button>
              )}
              <button
                type="button"
                onClick={closeMenu}
                aria-label="סגירת ההתראות"
                className="interactive press -me-1.5 flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-background hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                <CloseGlyph />
              </button>
            </div>
          </div>

          {/* Body */}
          <div className="overflow-y-auto">
            {items.length === 0 ? (
              <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
                <span
                  aria-hidden="true"
                  className="flex h-12 w-12 items-center justify-center rounded-full bg-background text-muted"
                >
                  <BellGlyph active={false} size={22} />
                </span>
                <p className="text-sm font-medium text-foreground">
                  {loading ? "טוען התראות…" : "אין התראות עדיין"}
                </p>
                {!loading && (
                  <p className="text-xs text-muted">
                    כאן יופיעו תגובות ואזכורים על הפוסטים שלך.
                  </p>
                )}
              </div>
            ) : (
              <ul className="flex flex-col">
                {items.map((n) => {
                  const isUnread = n.read_at === null;
                  return (
                    <li key={n.id}>
                      <button
                        type="button"
                        onClick={() => void markRead(n)}
                        className={[
                          "flex w-full items-start gap-3 border-b border-border px-4 py-3 text-start",
                          "interactive hover:bg-background",
                          "focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent relative",
                          isUnread ? "bg-accent/5" : "bg-surface",
                        ].join(" ")}
                      >
                        {/* Unread dot / kind icon */}
                        <span
                          aria-hidden="true"
                          className={[
                            "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
                            isUnread
                              ? "bg-accent/15 text-accent-text"
                              : "bg-background text-muted",
                          ].join(" ")}
                        >
                          <KindGlyph kind={n.kind} />
                        </span>

                        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                          <span className="text-sm leading-snug text-foreground">
                            {n.actor && (
                              <span className="font-semibold">{n.actor} </span>
                            )}
                            {kindLine(n.kind)}
                          </span>
                          <span className="text-xs text-muted">
                            {relativeTime(n.created_at)}
                          </span>
                        </span>

                        {isUnread && (
                          <span
                            aria-hidden="true"
                            className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-accent"
                          />
                        )}
                        {isUnread && (
                          <span className="sr-only">לא נקרא</span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </>
  );
}

// ── Inline glyphs (drawn to the site's 24×24 / currentColor icon contract, so
// they inherit color + dark-mode safely). Kept local because the shared <Icon>
// set has no bell. All decorative — the surrounding text/labels carry meaning. ─

function BellGlyph({ active, size = 20 }: { active: boolean; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
      {active && <circle cx="18" cy="6" r="3" fill="currentColor" stroke="none" />}
    </svg>
  );
}

function CloseGlyph() {
  return (
    <svg
      width={20}
      height={20}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

function KindGlyph({ kind }: { kind: CommunityNotification["kind"] }) {
  if (kind === "flag") {
    // Shield-alert — moderation flag.
    return (
      <svg
        width={18}
        height={18}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z" />
        <path d="M12 9v3M12 15h.01" />
      </svg>
    );
  }
  if (kind === "mention") {
    // @ — mention.
    return (
      <svg
        width={18}
        height={18}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="4" />
        <path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-4 8" />
      </svg>
    );
  }
  if (kind === "reaction") {
    // Heart — a reaction.
    return (
      <svg
        width={18}
        height={18}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M12 20s-7-4.35-7-9a4 4 0 0 1 7-2.65A4 4 0 0 1 19 11c0 4.65-7 9-7 9z" />
      </svg>
    );
  }
  if (kind === "like") {
    // Thumbs-up — a like.
    return (
      <svg
        width={18}
        height={18}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M7 10v11M7 10l4-7a2 2 0 0 1 2.7 2.5L12 10h5.5a2 2 0 0 1 2 2.5l-1.6 6a2 2 0 0 1-2 1.5H7" />
      </svg>
    );
  }
  if (kind === "pinned") {
    // Pin — a pinned post.
    return (
      <svg
        width={18}
        height={18}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M12 17v5M9 3h6l-1 6 3 3v1H7v-1l3-3-1-6z" />
      </svg>
    );
  }
  // reply — speech bubble.
  return (
    <svg
      width={18}
      height={18}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
    </svg>
  );
}
