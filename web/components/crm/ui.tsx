"use client";

// ────────────────────────────────────────────────────────────────────────────
// Shared CRM-console UI primitives — button recipes, date formatting, lead-status
// display metadata, status pills, KPI stat cards, and small state panels. One
// place so every console section (dashboard / leads / inbox / analytics) renders
// consistently against the premium-2026 design tokens. Presentation only; all
// data + authority live in crm-api behind the admin gate.
// ────────────────────────────────────────────────────────────────────────────

import type { ReactNode } from "react";
import type { LeadStatus } from "@/lib/crm-admin";

// Button recipes — identical to the moderation console (AdminModeration.tsx) so
// the whole admin surface feels like one product.
export const BTN_PRIMARY =
  "interactive inline-flex min-h-11 items-center justify-center rounded-xl bg-accent px-4 py-1.5 text-sm font-semibold text-accent-contrast shadow-[var(--glow-accent)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50 [@media(hover:hover)_and_(pointer:fine)]:hover:bg-accent-hover";
export const BTN_GHOST =
  "interactive inline-flex min-h-11 items-center justify-center rounded-xl border border-border px-4 py-1.5 text-sm font-medium text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50 [@media(hover:hover)_and_(pointer:fine)]:hover:bg-accent/10";

/** he-IL short date-time (e.g. "3 ביולי, 14:05"), or "" for an absent/bad value. */
export function when(ts: string | null | undefined): string {
  if (!ts) return "";
  const d = new Date(ts);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleString("he-IL", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
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

// Conversation status (whatsapp_conversations.status) is a DIFFERENT enum from the
// lead pipeline — bot/human/open/closed — so it gets its own label map.
export const CONVERSATION_STATUS_META: Record<string, { label: string; tone: Tone }> = {
  bot: { label: "בוט", tone: "neutral" },
  human: { label: "נציג", tone: "info" },
  open: { label: "פתוח", tone: "neutral" },
  closed: { label: "סגור", tone: "neutral" },
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

/** A conversation-status chip (bot/human/open/closed). */
export function ConversationStatusPill({ status }: { status: string }) {
  const meta = CONVERSATION_STATUS_META[status];
  return <Pill label={meta?.label ?? status} tone={meta?.tone ?? "neutral"} />;
}

/** A KPI stat card: a big number with a label and an optional hint/sub-line. */
export function StatCard({
  label,
  value,
  hint,
  tone = "neutral",
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  tone?: Tone;
}) {
  const accent = tone === "value" ? "text-value-text" : tone === "danger" ? "text-danger-text" : tone === "info" ? "text-accent-text" : "text-ink";
  return (
    <div className="rounded-2xl border border-border bg-surface p-4 shadow-soft">
      <p className="text-xs font-medium text-muted">{label}</p>
      <p className={`mt-1 font-display text-3xl font-bold tabular-nums ${accent}`}>{value}</p>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}

/** Centered notice card for empty / no-access / error / coming-soon states. */
export function NoticeCard({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-6 text-center shadow-soft">
      <p className="text-sm text-muted">{children}</p>
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}
