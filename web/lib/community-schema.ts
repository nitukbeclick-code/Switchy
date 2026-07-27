// ────────────────────────────────────────────────────────────────────────────
// community-schema.ts — the SEO decisions of the public Q&A permalink
// (/community/post/[id]), extracted out of the page so they are pure and
// unit-testable:
//
//   • buildQaSchema(post, replies) — the truthful QAPage JSON-LD (real question +
//     real answers only; acceptedAnswer ONLY when the author genuinely chose a
//     visible reply — otherwise there is no acceptedAnswer key at all and every
//     visible reply is a suggestedAnswer; nothing is fabricated).
//   • permalinkRobots(replies)    — the ANSWERED-ONLY index gate: a permalink is
//     indexed ONLY when it has at least one visible (non-flagged) reply;
//     otherwise noindex,follow. /community itself stays noindex regardless.
//
// INVARIANT (do not weaken): callers must pass ONLY the non-flagged replies they
// actually render (the permalink's fetch already filters is_flagged=false), so
// both the index decision and the schema describe exactly the public page.
// ────────────────────────────────────────────────────────────────────────────

import type { Metadata } from "next";
import { orderByAccepted } from "./community";
import { clip } from "./community-render";

/** The post fields the QAPage schema consumes (a subset of the permalink row). */
export interface QaPostInput {
  author: string;
  channel: string;
  body: string;
  created_at: string;
  accepted_reply_id: string | null;
}

/** The reply fields the QAPage schema consumes (visible, non-flagged replies). */
export interface QaReplyInput {
  id: string;
  author: string;
  body: string;
  created_at: string;
}

/**
 * The answered-only robots decision for a Q&A permalink: index ONLY a post that
 * has at least one real, visible (non-flagged) reply — a genuine Q&A. An
 * unanswered post stays noindex,follow (reduces indexing a lone line that
 * slipped moderation) while its links remain crawlable.
 */
export function permalinkRobots(replies: readonly unknown[]): Metadata["robots"] {
  return { index: replies.length >= 1, follow: true };
}

/** One truthful Answer node from a real reply (verbatim body, real author/date). */
function answerOf(r: QaReplyInput): Record<string, unknown> {
  return {
    "@type": "Answer",
    text: r.body,
    author: { "@type": "Person", name: r.author },
    dateCreated: r.created_at,
  };
}

/**
 * Truthful QAPage JSON-LD for a public community permalink — real question +
 * real answers only, never fabricated:
 *
 *  - `answerCount` = the number of visible replies (exactly what the page shows),
 *  - `acceptedAnswer` = the reply the POST AUTHOR genuinely chose, and ONLY that
 *    (accepted_reply_id, resolved via the shared orderByAccepted, so a dangling
 *    id — reply deleted or flagged out — elects nothing). When the author made no
 *    choice the key is ABSENT; there is no substitute,
 *  - `suggestedAnswer` = every remaining visible reply — which, with no author
 *    choice, means ALL of them (omitted only when the list is empty),
 *  - NO acceptedAnswer/suggestedAnswer at all when there are no replies.
 *
 * DO NOT REINSTATE THE "earliest reply" FALLBACK (removed 2026-07-27). It used to
 * elect `replies[0]` as acceptedAnswer "for SEO completeness" when
 * accepted_reply_id was null or dangling. That is structured data asserting what
 * the visible page denies: the permalink renders the ✓ "התשובה שנבחרה" badge only
 * for an ACTUAL author choice (app/community/post/[id]/page.tsx —
 * `hasChosenAnswer && r.id === post.accepted_reply_id`), so the fallback told
 * search engines a question was resolved by an answer the HTML refuses to mark as
 * accepted — and handed one random replier a "chosen" endorsement they never got.
 * Same defect class as structured data claiming a price the page does not show.
 * An unresolved thread is honestly described by suggestedAnswer alone.
 */
export function buildQaSchema(
  post: QaPostInput,
  replies: QaReplyInput[],
): Record<string, unknown> {
  // The author's ACTUAL choice if it's among the visible replies, else null.
  // No fallback: null here means the page shows no accepted answer, so neither
  // does the schema.
  const { accepted } = orderByAccepted(replies, post.accepted_reply_id);
  const others = replies.filter((r) => r.id !== accepted?.id);

  return {
    "@context": "https://schema.org",
    "@type": "QAPage",
    mainEntity: {
      "@type": "Question",
      name: clip(post.body, 120) || `דיון בערוץ ${post.channel}`,
      text: post.body,
      answerCount: replies.length,
      author: { "@type": "Person", name: post.author },
      dateCreated: post.created_at,
      ...(accepted ? { acceptedAnswer: answerOf(accepted) } : {}),
      ...(others.length > 0 ? { suggestedAnswer: others.map(answerOf) } : {}),
    },
  };
}
