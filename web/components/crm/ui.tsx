"use client";

// ────────────────────────────────────────────────────────────────────────────
// Shared CRM-console UI primitives — button recipes, date/relative-time
// formatting, lead-status display metadata, status pills, event tints, KPI stat
// cards, small state panels, and the URL-mirroring helper the list views use to
// keep their filters refresh/tab-switch-proof. One place so every console
// section (dashboard / leads / inbox / analytics) renders consistently against
// the premium-2026 design tokens. Presentation only; all data + authority live
// in crm-api behind the access gate.
// ────────────────────────────────────────────────────────────────────────────

import type { ReactNode } from "react";
import type { CrmFailure, CrmLead, LeadPriority, LeadStatus } from "@/lib/crm-admin";

// Button recipes — identical to the moderation console (AdminModeration.tsx) so
// the whole admin surface feels like one product.
export const BTN_PRIMARY =
  "interactive press inline-flex min-h-11 items-center justify-center rounded-2xl bg-accent px-4 py-2 text-sm font-bold text-accent-contrast shadow-[var(--glow-accent)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50 [@media(hover:hover)_and_(pointer:fine)]:hover:bg-accent-hover";
export const BTN_GHOST =
  "interactive press inline-flex min-h-11 items-center justify-center rounded-2xl border border-border bg-surface px-4 py-2 text-sm font-semibold text-foreground shadow-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50 [@media(hover:hover)_and_(pointer:fine)]:hover:border-accent/40 [@media(hover:hover)_and_(pointer:fine)]:hover:bg-accent/10";

/** he-IL short date-time (e.g. "3 ביולי, 14:05"), or "" for an absent/bad value.
 *  A timestamp from a DIFFERENT year than today's includes the year — "3 ביולי
 *  2025, 14:05" — so an old lead can't masquerade as this year's. */
export function when(ts: string | null | undefined): string {
  if (!ts) return "";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "";
  const opts: Intl.DateTimeFormatOptions = {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  };
  if (d.getFullYear() !== new Date().getFullYear()) opts.year = "numeric";
  return d.toLocaleString("he-IL", opts);
}

/**
 * Short Hebrew relative age ("עכשיו", "לפני 5 דק׳", "לפני שעה", "לפני 3 ימים").
 * Pure over (ts, nowMs) so it is unit-testable without a clock — callers sample
 * Date.now() in an event/continuation (never during render) and pass it in.
 * Beyond ~30 days (or for a future/absent timestamp) it falls back to the
 * absolute `when()` string — a stale "לפני 60 ימים" reads worse than a date.
 */
export function relTime(ts: string | null | undefined, nowMs: number): string {
  if (!ts) return "";
  const t = Date.parse(ts);
  if (!Number.isFinite(t)) return "";
  const diff = nowMs - t;
  if (diff < 0) return when(ts); // future → absolute, never a negative age
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "עכשיו";
  if (mins === 1) return "לפני דקה";
  if (mins < 60) return `לפני ${mins} דק׳`;
  const hours = Math.floor(mins / 60);
  if (hours === 1) return "לפני שעה";
  if (hours < 24) return `לפני ${hours} שע׳`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "אתמול";
  if (days <= 30) return `לפני ${days} ימים`;
  return when(ts);
}

/** A short he-IL duration from minutes ("42 דק׳", "2 שע׳ 5 דק׳"), or "—" for a
 *  null/negative/non-finite value. Mirrors the edge formatMinutes (digests.ts). */
export function formatMinutes(mins: number | null | undefined): string {
  if (mins == null || !Number.isFinite(mins) || mins < 0) return "—";
  const m = Math.round(mins);
  if (m < 60) return `${m} דק׳`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r > 0 ? `${h} שע׳ ${r} דק׳` : `${h} שע׳`;
}

/** Canonical-form UUID check (the grant form validates a pasted uid with this
 *  before ever sending it, so a typo fails fast client-side). */
export function isUuid(v: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

/**
 * Mirror list-view filters into the current URL via a shallow
 * history.replaceState (no Next navigation, no scroll, no history entry), so a
 * refresh or a tab-switch restores the exact view. A null/"" value DELETES its
 * key — default filters keep the URL clean. Other params (?tab=, sibling tabs'
 * filters) are preserved untouched.
 */
export function mirrorUrlParams(entries: Record<string, string | null>): void {
  if (typeof window === "undefined") return;
  const qs = new URLSearchParams(window.location.search);
  for (const [k, v] of Object.entries(entries)) {
    if (v == null || v === "") qs.delete(k);
    else qs.set(k, v);
  }
  const s = qs.toString();
  window.history.replaceState(null, "", s ? `?${s}` : window.location.pathname);
}

type Tone = "neutral" | "info" | "value" | "danger";

// The single source of truth for how a lead stage is shown: Hebrew label + a tone
// that maps to the design tokens (value = win/green, danger = lost/red).
export const LEAD_STATUS_META: Record<LeadStatus, { label: string; tone: Tone }> = {
  new: { label: "חדש", tone: "info" },
  contacted: { label: "יצרנו קשר", tone: "neutral" },
  won: { label: "נסגר בהצלחה", tone: "value" },
  lost: { label: "אבוד", tone: "danger" },
};

export const LEAD_PRIORITY_META: Record<LeadPriority, { label: string; tone: Tone }> = {
  low: { label: "נמוכה", tone: "neutral" },
  normal: { label: "רגילה", tone: "neutral" },
  high: { label: "גבוהה", tone: "info" },
  urgent: { label: "דחופה", tone: "danger" },
};

// Conversation status (whatsapp_conversations.status) is a DIFFERENT enum from the
// lead pipeline — bot/human/open/closed — so it gets its own label map.
export const CONVERSATION_STATUS_META: Record<string, { label: string; tone: Tone }> = {
  bot: { label: "בוט", tone: "neutral" },
  human: { label: "נציג", tone: "info" },
  open: { label: "פתוח", tone: "neutral" },
  closed: { label: "סגור", tone: "neutral" },
};

// Meeting lifecycle (meetings.status) — its own enum again (Zoom bookings).
export const MEETING_STATUS_META: Record<string, { label: string; tone: Tone }> = {
  pending: { label: "ממתין לאישור", tone: "neutral" },
  confirmed: { label: "מאושר", tone: "info" },
  completed: { label: "הושלם", tone: "value" },
  no_rep: { label: "ללא נציג", tone: "danger" },
  cancelled: { label: "בוטל", tone: "danger" },
  expired: { label: "פג תוקף", tone: "neutral" },
};

// Contact lifecycle (whatsapp_contacts.status) — the CRM's fullest status enum.
export const CONTACT_STATUS_META: Record<string, { label: string; tone: Tone }> = {
  new: { label: "חדש", tone: "info" },
  active: { label: "פעיל", tone: "neutral" },
  qualified: { label: "מוכשר", tone: "info" },
  handed_off: { label: "הועבר לנציג", tone: "neutral" },
  won: { label: "נסגר בהצלחה", tone: "value" },
  lost: { label: "אבוד", tone: "danger" },
  blocked: { label: "חסום", tone: "danger" },
};

const TONE_PILL: Record<Tone, string> = {
  neutral: "border-border text-muted",
  info: "border-accent/40 bg-accent/10 text-accent-text",
  value: "border-value/40 bg-value/10 text-value-text",
  danger: "border-danger/40 bg-danger/10 text-danger-text",
};

function Pill({ label, tone }: { label: string; tone: Tone }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${TONE_PILL[tone]}`}>
      {label}
    </span>
  );
}

/** A lead-stage chip. Falls back to the raw status text for unknown values. */
export function StatusPill({ status }: { status: string }) {
  const meta = LEAD_STATUS_META[status as LeadStatus];
  return <Pill label={meta?.label ?? status} tone={meta?.tone ?? "neutral"} />;
}

/** Lead work priority. Unknown wire values remain visible in a neutral tone. */
export function PriorityPill({ priority }: { priority: string }) {
  const meta = LEAD_PRIORITY_META[priority as LeadPriority];
  return <Pill label={`עדיפות ${meta?.label ?? priority}`} tone={meta?.tone ?? "neutral"} />;
}

/** True when an open lead belongs in the rep's immediate work queue. */
export function leadNeedsAttention(
  lead: Pick<CrmLead, "status" | "priority" | "followUpAt" | "createdAt">,
  nowMs: number,
  slaHours: number | null,
): boolean {
  if (lead.status !== "new" && lead.status !== "contacted") return false;
  if (lead.priority === "urgent" || lead.priority === "high") return true;
  const followAt = lead.followUpAt ? Date.parse(lead.followUpAt) : NaN;
  if (Number.isFinite(followAt) && followAt <= nowMs) return true;
  const createdAt = lead.createdAt ? Date.parse(lead.createdAt) : NaN;
  return (
    lead.status === "new" &&
    slaHours != null &&
    slaHours > 0 &&
    Number.isFinite(createdAt) &&
    nowMs - createdAt > slaHours * 3_600_000
  );
}

/** A due-date chip for the next scheduled action. */
export function FollowUpChip({
  followUpAt,
  nowMs,
}: {
  followUpAt: string | null;
  nowMs: number;
}) {
  if (!followUpAt) return null;
  const due = Date.parse(followUpAt);
  if (!Number.isFinite(due)) return null;
  const overdue = nowMs > 0 && due <= nowMs;
  const label = overdue ? `מעקב באיחור · ${relTime(followUpAt, nowMs)}` : `מעקב · ${when(followUpAt)}`;
  return (
    <span
      title={`מועד המעקב: ${when(followUpAt)}`}
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold tabular-nums ${
        overdue ? TONE_PILL.danger : TONE_PILL.info
      }`}
    >
      {label}
    </span>
  );
}

/** A conversation-status chip (bot/human/open/closed). */
export function ConversationStatusPill({ status }: { status: string }) {
  const meta = CONVERSATION_STATUS_META[status];
  return <Pill label={meta?.label ?? status} tone={meta?.tone ?? "neutral"} />;
}

/** A meeting-status chip (pending/confirmed/completed/…). */
export function MeetingStatusPill({ status }: { status: string }) {
  const meta = MEETING_STATUS_META[status];
  return <Pill label={meta?.label ?? status} tone={meta?.tone ?? "neutral"} />;
}

/** A contact lifecycle-status chip (new/active/qualified/…). */
export function ContactStatusPill({ status }: { status: string }) {
  const meta = CONTACT_STATUS_META[status];
  return <Pill label={meta?.label ?? status} tone={meta?.tone ?? "neutral"} />;
}

// Per-event-type tint for the drawers' activity timelines: a saving lands in the
// value tone, a status change in the accent, an undo in danger — so a rep can
// scan the trail's shape without reading every line. Unknown kinds stay neutral.
const EVENT_TINT: Record<string, string> = {
  status_change: "border-accent/30 bg-accent/5",
  claim: "border-accent/30 bg-accent/5",
  saving: "border-value/40 bg-value/5",
  workflow_update: "border-accent/30 bg-accent/5",
  won: "border-value/40 bg-value/5",
  undo: "border-danger/30 bg-danger/5",
  created: "border-accent/30 bg-accent/5",
};

/** Timeline-card border/background classes for a lead/meeting event kind. */
export function eventTint(event: string): string {
  return EVENT_TINT[event] ?? "border-border bg-surface";
}

/**
 * The age of a (new) lead as a chip: relative time since createdAt, flipping to
 * the danger tone + an "SLA" tag once the wait exceeds `slaHours` (from the
 * server's slaMetrics — never a client-invented threshold). Renders nothing
 * until the caller has sampled a clock (nowMs > 0) — no guessed ages.
 */
export function LeadAgeChip({
  createdAt,
  nowMs,
  slaHours,
}: {
  createdAt: string | null;
  nowMs: number;
  slaHours: number | null;
}) {
  if (!createdAt || nowMs <= 0) return null;
  const t = Date.parse(createdAt);
  if (!Number.isFinite(t)) return null;
  const label = relTime(createdAt, nowMs);
  if (!label) return null;
  const breach = slaHours != null && slaHours > 0 && nowMs - t > slaHours * 3_600_000;
  return (
    <span
      title={breach ? `ממתין מעל ${slaHours} שעות — חריגת SLA` : "ממתין מאז שנוצר"}
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold tabular-nums ${
        breach ? TONE_PILL.danger : TONE_PILL.neutral
      }`}
    >
      {breach ? `${label} · SLA` : label}
    </span>
  );
}

/** A KPI stat card: a big number with a label and an optional hint/sub-line.
 *  With `onClick` it renders as a real button (the dashboard's morning-launcher
 *  cards deep-link into their tab) — same visual, keyboard/AT-reachable. */
export function StatCard({
  label,
  value,
  hint,
  tone = "neutral",
  onClick,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  tone?: Tone;
  onClick?: () => void;
}) {
  const accent = tone === "value" ? "text-value-text" : tone === "danger" ? "text-danger-text" : tone === "info" ? "text-accent-text" : "text-ink";
  const body = (
    <>
      <p className="text-xs font-medium text-muted">{label}</p>
      <p className={`mt-1 font-display text-3xl font-bold tabular-nums ${accent}`}>{value}</p>
      {hint && <p className="mt-1 text-xs text-muted tabular-nums">{hint}</p>}
    </>
  );
  const box = "rounded-[var(--radius-lg)] border border-border bg-surface p-5 shadow-soft";
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`${box} interactive block w-full text-start focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent [@media(hover:hover)_and_(pointer:fine)]:hover:border-accent/40`}
      >
        {body}
      </button>
    );
  }
  return <div className={box}>{body}</div>;
}

/** Centered notice card for empty / no-access / error / coming-soon states. */
export function NoticeCard({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="rounded-[var(--radius-lg)] border border-border bg-surface p-7 text-center shadow-soft">
      <p className="text-sm text-muted">{children}</p>
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

/**
 * A load-failure NoticeCard: shows the typed server failure's Hebrew message
 * when one exists (else `fallback`), and offers the retry action ONLY when a
 * retry can actually help — a 401/403 (non-retryable) hides the button instead
 * of inviting a loop that can never succeed.
 */
export function ErrorNotice({
  failure,
  fallback,
  onRetry,
}: {
  failure?: CrmFailure | null;
  fallback: string;
  onRetry?: () => void;
}) {
  const retryable = failure ? failure.retryable : true;
  return (
    <NoticeCard
      action={
        onRetry && retryable ? (
          <button type="button" onClick={onRetry} className={BTN_GHOST}>
            נסו שוב
          </button>
        ) : undefined
      }
    >
      {failure?.message || fallback}
    </NoticeCard>
  );
}
