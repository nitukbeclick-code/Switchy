// ────────────────────────────────────────────────────────────────────────────
// community-schema.ts — the SEO decisions of the public Q&A permalink
// (/community/post/[id]), extracted out of the page so they are pure and
// unit-testable:
//
//   • buildQaSchema(post, replies) — the truthful QAPage JSON-LD (real question +
//     real answers only; acceptedAnswer = the author's genuine choice when it is
//     among the visible replies, else the earliest reply; the rest become
//     suggestedAnswer; nothing is fabricated when there are no replies).
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
 *  - `acceptedAnswer` = the reply the POST AUTHOR genuinely chose
 *    (accepted_reply_id, resolved via the shared orderByAccepted so a dangling
 *    id — deleted/flagged-out reply — never elects a wrong answer), falling back
 *    to the earliest reply for SEO completeness when no choice was made,
 *  - `suggestedAnswer` = the remaining replies (omitted when none),
 *  - NO acceptedAnswer/suggestedAnswer at all when there are no replies.
 */
export function buildQaSchema(
  post: QaPostInput,
  replies: QaReplyInput[],
): Record<string, unknown> {
  // The author's ACTUAL choice if it's among the visible replies, else null.
  const { accepted: chosen } = orderByAccepted(replies, post.accepted_reply_id);
  // JSON-LD acceptedAnswer: the author's choice if any, else the earliest reply.
  const accepted = chosen ?? replies[0];
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
      ...(replies.length > 0 && accepted
        ? {
            acceptedAnswer: answerOf(accepted),
            ...(others.length > 0 ? { suggestedAnswer: others.map(answerOf) } : {}),
          }
        : {}),
    },
  };
}
