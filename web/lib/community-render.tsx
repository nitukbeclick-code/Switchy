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
//   • clip(s, n)        — whitespace-collapsed hard clip with an ellipsis (the
//                         permalink title/description + Q&A hub row formula).
//   • heDate(iso)       — absolute Hebrew date ("6 ביולי 2026") for <time>.
//   • heCount(n, noun)  — a count meeting a Hebrew noun, with real agreement
//                         ("תגובה אחת" / "שתי תגובות" / "7 תגובות").
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

/** Collapse whitespace and hard-clip to `n` chars, appending an ellipsis when
 *  clipped (total length stays ≤ n). The single formula behind the permalink's
 *  title/description/JSON-LD question name and the Q&A hub rows — hoisted here so
 *  the metadata and the rendered body can never disagree on the same text. */
export function clip(s: string, n: number): string {
  const t = (s ?? "").replace(/\s+/g, " ").trim();
  return t.length > n ? t.slice(0, n - 1).trimEnd() + "…" : t;
}

/** Absolute Hebrew date, e.g. "6 ביולי 2026" (for <time> next to permalinks/rows).
 *  Empty string for an unparseable timestamp — never an "Invalid Date" render. */
export function heDate(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  return d.toLocaleDateString("he-IL", { day: "numeric", month: "long", year: "numeric" });
}

// ── Hebrew number agreement ──────────────────────────────────────────────────
// Hebrew does not pluralise like English: a numeral does not just sit in front of
// a fixed plural noun. "1 תגובות" is ungrammatical (it reads roughly like
// "1 replies"), and it is exactly what a low-traffic community renders on almost
// every row — the Q&A hub only lists posts with reply_count >= 1, so the single
// most common badge in the product was the broken one.
//
// The forms we need per noun:
//   1 → the singular WITH its agreeing "one" ("תגובה אחת", "פוסט אחד") — the
//       numeral follows the noun and inflects for gender.
//   2 → the counting form ("שתי תגובות" f. / "שני פוסטים" m.) — a bare "2" is
//       acceptable but the word form is what a Hebrew reader expects.
//   otherwise → numeral + plural noun ("7 תגובות"), which is correct from 3 up.
//
// This is presentation only: the NUMBER is never changed, invented or rounded —
// heCount renders whatever real count it is handed.

/** The three agreement forms of one countable Hebrew noun. */
interface NounForms {
  /** Count of exactly one, e.g. "תגובה אחת". */
  one: string;
  /** Count of exactly two, e.g. "שתי תגובות". */
  two: string;
  /** Plural noun that follows a numeral, e.g. "תגובות". */
  many: string;
}

/** Every counted noun the community surfaces render, with real gender agreement
 *  (תגובה/שיחה are feminine → אחת/שתי; לייק/פוסט are masculine → אחד/שני). */
const HE_NOUNS = {
  reply: { one: "תגובה אחת", two: "שתי תגובות", many: "תגובות" },
  conversation: { one: "שיחה אחת", two: "שתי שיחות", many: "שיחות" },
  like: { one: "לייק אחד", two: "שני לייקים", many: "לייקים" },
  post: { one: "פוסט אחד", two: "שני פוסטים", many: "פוסטים" },
} as const satisfies Record<string, NounForms>;

/** Nouns `heCount` knows how to agree with. */
export type HeNoun = keyof typeof HE_NOUNS;

/** A real count meeting a Hebrew noun, with number + gender agreement.
 *  `heCount(1, "reply")` → "תגובה אחת", `heCount(2, "reply")` → "שתי תגובות",
 *  `heCount(7, "reply")` → "7 תגובות". Non-finite / negative inputs floor to 0
 *  ("0 תגובות") — the helper never invents a count, it only renders one. */
export function heCount(n: number, noun: HeNoun): string {
  const forms = HE_NOUNS[noun];
  const c = Number.isFinite(n) ? Math.max(0, Math.trunc(n)) : 0;
  if (c === 1) return forms.one;
  if (c === 2) return forms.two;
  return `${c.toLocaleString("he-IL")} ${forms.many}`;
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
