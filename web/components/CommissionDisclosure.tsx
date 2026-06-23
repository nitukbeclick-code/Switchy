// ────────────────────────────────────────────────────────────────────────────
// <CommissionDisclosure> — Consumer Protection Law §7b / §17 disclosure.
//
// ONE honest Hebrew line, placed PROMINENTLY (never buried): the service is free
// to use, we receive a referral fee from providers when the user switches through
// us, this does NOT affect the price the user pays, and the comparison follows our
// transparent methodology (links /transparency).
//
// HONESTY: this is a paid-relationship disclosure, NOT a neutral "consumer
// advocate" claim. Copy lives in lib/legal.ts (single source of truth, unit-
// tested). Server component — no client state.
//
// `variant`:
//   • "banner"  — full bordered callout (home hero / top of compare hub).
//   • "inline"  — compact muted line (next to a lead CTA / before the hand-off).
// ────────────────────────────────────────────────────────────────────────────

import Link from "next/link";
import {
  COMMISSION_DISCLOSURE_LEAD,
  COMMISSION_DISCLOSURE_BODY,
  COMMISSION_DISCLOSURE_LINK_TEXT,
} from "@/lib/legal";

export interface CommissionDisclosureProps {
  /** Visual treatment. Defaults to the full "banner". */
  variant?: "banner" | "inline";
  /** Optional extra classes on the wrapper. */
  className?: string;
}

// The methodology sentence ends with "...השקופה שלנו." in lib/legal; we render the
// body text up to that anchor phrase, then the phrase as a /transparency link, so
// the disclosure and the link can't drift apart.
const LINK_ANCHOR = COMMISSION_DISCLOSURE_LINK_TEXT;
const bodyBeforeLink = COMMISSION_DISCLOSURE_BODY.slice(
  0,
  COMMISSION_DISCLOSURE_BODY.indexOf(LINK_ANCHOR),
);
const bodyAfterLink = COMMISSION_DISCLOSURE_BODY.slice(
  COMMISSION_DISCLOSURE_BODY.indexOf(LINK_ANCHOR) + LINK_ANCHOR.length,
);

function DisclosureText({ className }: { className?: string }) {
  return (
    <p className={className}>
      <span className="font-semibold text-foreground">
        {COMMISSION_DISCLOSURE_LEAD}
      </span>{" "}
      {bodyBeforeLink}
      <Link
        href="/transparency"
        className="text-accent-text underline hover:text-accent-hover"
      >
        {LINK_ANCHOR}
      </Link>
      {bodyAfterLink}
    </p>
  );
}

export default function CommissionDisclosure({
  variant = "banner",
  className,
}: CommissionDisclosureProps) {
  if (variant === "inline") {
    return (
      <DisclosureText
        className={[
          "text-xs leading-relaxed text-muted",
          className ?? "",
        ]
          .join(" ")
          .trim()}
      />
    );
  }

  return (
    <aside
      aria-label="גילוי נאות — דמי תיווך"
      className={[
        "rounded-xl border border-border bg-surface p-4 text-sm leading-relaxed text-foreground",
        className ?? "",
      ]
        .join(" ")
        .trim()}
    >
      <DisclosureText />
    </aside>
  );
}
