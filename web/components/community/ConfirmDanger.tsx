"use client";

// ────────────────────────────────────────────────────────────────────────────
// <ConfirmDanger> — the shared two-step destructive button (CrmTeam's revoke
// idiom, extracted from <AdminModeration> so post/reply delete use the SAME
// pattern instead of one-click destruction).
//
// First click ARMS: the idle danger button swaps to a confirming button plus a
// "חזרה" escape. The second click (within the TTL) executes onConfirm. Two modes:
//
//   • CONTROLLED — pass `armed` + onArm/onDismiss and own the state upstream
//     (AdminModeration keeps ONE armed key across its whole queue, so arming a
//     second row disarms the first).
//   • UNCONTROLLED — omit `armed`; the component keeps its own armed state and
//     auto-expires it after CONFIRM_TTL_MS of inaction (PostCard / Replies).
//
// Styling defaults to the moderation dashboard's danger/ghost buttons; the
// smaller in-card contexts override via the *ClassName props. All copy Hebrew,
// real <button>s, aria-labels, visible focus rings — no window.confirm.
// ────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useState } from "react";

/** How long an armed confirm waits for the second click before disarming. */
export const CONFIRM_TTL_MS = 5000;

const BTN_DANGER =
  "interactive inline-flex min-h-11 items-center justify-center rounded-xl border border-danger/40 px-4 py-1.5 text-sm font-medium text-danger-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50 [@media(hover:hover)_and_(pointer:fine)]:hover:bg-danger/10";
const BTN_GHOST =
  "interactive inline-flex min-h-11 items-center justify-center rounded-xl border border-border px-4 py-1.5 text-sm font-medium text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50 [@media(hover:hover)_and_(pointer:fine)]:hover:bg-accent/10";

export interface ConfirmDangerProps {
  /** Idle button copy (e.g. "הסר" / "מחיקת הפוסט"). */
  label: string;
  /** Armed button copy (e.g. "לאשר הסרה לצמיתות?"). */
  confirmLabel: string;
  /** Accessible name for the destructive action (both steps). */
  ariaLabel: string;
  disabled?: boolean;
  /** Executes the destructive action (only ever reachable from the armed state). */
  onConfirm: () => void;
  /** CONTROLLED mode: the armed flag lives upstream. Omit for uncontrolled. */
  armed?: boolean;
  /** Controlled-mode arm request (first click). */
  onArm?: () => void;
  /** Controlled-mode disarm ("חזרה" click). Also called on uncontrolled dismiss. */
  onDismiss?: () => void;
  /** Copy for the escape button (default "חזרה"). */
  dismissLabel?: string;
  /** Class overrides for the idle danger / armed confirm / escape buttons. */
  dangerClassName?: string;
  confirmClassName?: string;
  dismissClassName?: string;
}

export default function ConfirmDanger({
  label,
  confirmLabel,
  ariaLabel,
  disabled = false,
  onConfirm,
  armed,
  onArm,
  onDismiss,
  dismissLabel = "חזרה",
  dangerClassName,
  confirmClassName,
  dismissClassName,
}: ConfirmDangerProps) {
  const controlled = armed !== undefined;
  const [selfArmed, setSelfArmed] = useState(false);
  const isArmed = controlled ? !!armed : selfArmed;

  // Uncontrolled: a pending arm quietly expires if nothing happens.
  useEffect(() => {
    if (controlled || !selfArmed) return;
    const t = setTimeout(() => setSelfArmed(false), CONFIRM_TTL_MS);
    return () => clearTimeout(t);
  }, [controlled, selfArmed]);

  const arm = useCallback(() => {
    if (controlled) onArm?.();
    else setSelfArmed(true);
  }, [controlled, onArm]);

  const dismiss = useCallback(() => {
    if (!controlled) setSelfArmed(false);
    onDismiss?.();
  }, [controlled, onDismiss]);

  const confirm = useCallback(() => {
    if (!controlled) setSelfArmed(false);
    onConfirm();
  }, [controlled, onConfirm]);

  if (!isArmed) {
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={arm}
        className={dangerClassName ?? BTN_DANGER}
        aria-label={ariaLabel}
      >
        {label}
      </button>
    );
  }
  return (
    <>
      <button
        type="button"
        disabled={disabled}
        onClick={confirm}
        className={confirmClassName ?? `${BTN_DANGER} border-danger/60 bg-danger/10`}
        aria-label={ariaLabel}
      >
        {confirmLabel}
      </button>
      <button
        type="button"
        disabled={disabled}
        onClick={dismiss}
        className={dismissClassName ?? BTN_GHOST}
        aria-label="ביטול הפעולה"
      >
        {dismissLabel}
      </button>
    </>
  );
}
