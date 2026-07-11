// ────────────────────────────────────────────────────────────────────────────
// Shared community render helpers — the single source of truth for the small
// presentation formulas that PostCard / Replies / ProfileView / the SEO post
// permalink used to each carry as hand-copied private functions (a duplicated
// formula will drift):
//
//   • relativeTime(iso) — relative Hebrew timestamp ("לפני 5 דקות").
//   • initial(name)     — avatar-fallback monogram (first rendered char).
//   • renderBody(body)  — post/reply body split into escaped text + @mention
//                         (bold) [+ optional catalogue-provider link] segments.
//
// NOTE: <NotificationsBell> keeps its OWN relativeTime on purpose — it uses
// floor-based rounding, "ממש עכשיו" phrasing and month→year bridging, so folding
// it in here would change its visible copy. Reconcile deliberately or not at all.
//
// SECURITY: renderBody emits only plain strings placed via JSX {} (React
// auto-escapes them) or a next/link whose children are plain text — raw HTML is
// never injected.
// ────────────────────────────────────────────────────────────────────────────

import type { ReactNode } from "react";
import Link from "next/link";
import { MENTION_RE } from "@/lib/community";
import { matchProviders } from "@/lib/providers.generated";

/** Relative Hebrew timestamp ("לפני 5 דקות"), no external dep. */
export function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "";
  const diff = Date.now() - then;
  const sec = Math.max(0, Math.round(diff / 1000));
  if (sec < 45) return "לפני רגע";
  const min = Math.round(sec / 60);
  if (min < 60) return min === 1 ? "לפני דקה" : `לפני ${min} דקות`;
  const hr = Math.round(min / 60);
  if (hr < 24) return hr === 1 ? "לפני שעה" : `לפני ${hr} שעות`;
  const day = Math.round(hr / 24);
  if (day < 7) return day === 1 ? "אתמול" : `לפני ${day} ימים`;
  const wk = Math.round(day / 7);
  if (wk < 5) return wk === 1 ? "לפני שבוע" : `לפני ${wk} שבועות`;
  const mo = Math.round(day / 30);
  if (mo < 12) return mo === 1 ? "לפני חודש" : `לפני ${mo} חודשים`;
  const yr = Math.round(day / 365);
  return yr === 1 ? "לפני שנה" : `לפני ${yr} שנים`;
}

/** First rendered char of a name, for the avatar fallback monogram. */
export function initial(name: string): string {
  const trimmed = name.trim();
  return trimmed ? Array.from(trimmed)[0].toUpperCase() : "מ";
}

/** Split body into text + @mention (bold) segments; with `linkProviders`,
 *  catalogue-provider names additionally become links (never inside an
 *  @mention span). Every segment is a plain string placed via JSX {} (React
 *  auto-escapes it) or a next/link whose children are plain text — raw HTML is
 *  never injected. `linkClassName` overrides the provider-link classes — the
 *  default is the interactive feed's style; the SEO permalink page passes its
 *  own so its served DOM stays byte-identical. */
export function renderBody(
  body: string,
  {
    linkProviders = false,
    linkClassName = "font-medium text-accent-text underline underline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
  }: { linkProviders?: boolean; linkClassName?: string } = {},
): ReactNode {
  type Span = { start: number; end: number; kind: "mention" | "provider"; slug?: string };
  const spans: Span[] = [];
  // @mentions (bold). matchAll on the shared /g regex — no lastIndex bookkeeping.
  for (const m of body.matchAll(MENTION_RE)) {
    const start = m.index ?? 0;
    spans.push({ start, end: start + m[0].length, kind: "mention" });
  }
  // Catalogue-provider names (link) — never inside an @mention span.
  if (linkProviders) {
    for (const p of matchProviders(body, spans)) {
      spans.push({ start: p.start, end: p.end, kind: "provider", slug: p.slug });
    }
  }
  spans.sort((a, b) => a.start - b.start);

  const nodes: ReactNode[] = [];
  let last = 0;
  let key = 0;
  for (const s of spans) {
    if (s.start < last) continue; // safety: drop any overlap
    if (s.start > last) nodes.push(body.slice(last, s.start));
    const text = body.slice(s.start, s.end);
    if (s.kind === "mention") {
      nodes.push(
        <span key={`s${key++}`} className="font-semibold text-accent-text">
          {text}
        </span>,
      );
    } else {
      nodes.push(
        <Link key={`s${key++}`} href={`/providers/${s.slug}`} className={linkClassName}>
          {text}
        </Link>,
      );
    }
    last = s.end;
  }
  if (last < body.length) nodes.push(body.slice(last));
  return nodes;
}
