import { describe, it, expect } from "vitest";
import {
  buildQaSchema,
  permalinkRobots,
  type QaPostInput,
  type QaReplyInput,
} from "@/lib/community-schema";

// ────────────────────────────────────────────────────────────────────────────
// lib/community-schema.ts — the SEO decisions of the public Q&A permalink,
// extracted pure. The load-bearing invariants pinned here:
//
//  1. THE INDEX GATE (answered-only): a permalink is indexed ONLY when it has at
//     least one visible (non-flagged) reply; otherwise noindex,follow. This is
//     the moderation-safety line for the ONLY indexable UGC surface — weakening
//     it would index unanswered lines that slipped moderation.
//  2. TRUTHFUL QAPage: answerCount = the real visible replies; acceptedAnswer is
//     the AUTHOR's genuine choice (falling back to the earliest reply), the rest
//     are suggestedAnswer, and with ZERO replies no answer node exists at all —
//     nothing is ever fabricated.
// ────────────────────────────────────────────────────────────────────────────

function post(overrides: Partial<QaPostInput> = {}): QaPostInput {
  return {
    author: "דנה",
    channel: "סלולר",
    body: "כמה עולה מסלול סלולר משתלם היום?",
    created_at: "2026-07-01T10:00:00Z",
    accepted_reply_id: null,
    ...overrides,
  };
}

function reply(id: string, overrides: Partial<QaReplyInput> = {}): QaReplyInput {
  return {
    id,
    author: `משיב-${id}`,
    body: `תשובה ${id}`,
    created_at: `2026-07-0${id.length}T12:00:00Z`,
    ...overrides,
  };
}

describe("permalinkRobots — the answered-only index gate", () => {
  it("noindex,follow for a post with NO visible replies (unanswered)", () => {
    expect(permalinkRobots([])).toEqual({ index: false, follow: true });
  });

  it("index,follow the moment there is one real (non-flagged) reply", () => {
    expect(permalinkRobots([reply("a")])).toEqual({ index: true, follow: true });
    expect(permalinkRobots([reply("a"), reply("b")])).toEqual({
      index: true,
      follow: true,
    });
  });

  it("always follow — links stay crawlable even when noindex", () => {
    const r = permalinkRobots([]) as { follow: boolean };
    expect(r.follow).toBe(true);
  });
});

describe("buildQaSchema — truthful QAPage (real question + real answers only)", () => {
  it("emits a QAPage whose Question carries the REAL body, author and date", () => {
    const p = post();
    const schema = buildQaSchema(p, []);
    expect(schema["@context"]).toBe("https://schema.org");
    expect(schema["@type"]).toBe("QAPage");
    const q = schema.mainEntity as Record<string, unknown>;
    expect(q["@type"]).toBe("Question");
    expect(q.text).toBe(p.body); // verbatim — never rewritten
    expect(q.author).toEqual({ "@type": "Person", name: "דנה" });
    expect(q.dateCreated).toBe(p.created_at);
  });

  it("clips the Question name to 120 chars and falls back to the channel for an empty body", () => {
    const long = "א".repeat(200);
    const q = buildQaSchema(post({ body: long }), []).mainEntity as Record<string, unknown>;
    expect((q.name as string).length).toBeLessThanOrEqual(120);
    expect((q.name as string).endsWith("…")).toBe(true);

    const empty = buildQaSchema(post({ body: "" }), []).mainEntity as Record<string, unknown>;
    expect(empty.name).toBe("דיון בערוץ סלולר");
  });

  it("with ZERO replies: answerCount 0 and NO acceptedAnswer/suggestedAnswer (no fabrication)", () => {
    const q = buildQaSchema(post(), []).mainEntity as Record<string, unknown>;
    expect(q.answerCount).toBe(0);
    expect(q.acceptedAnswer).toBeUndefined();
    expect(q.suggestedAnswer).toBeUndefined();
  });

  it("answerCount equals the number of visible replies passed in", () => {
    const q = buildQaSchema(post(), [reply("a"), reply("b"), reply("c")])
      .mainEntity as Record<string, unknown>;
    expect(q.answerCount).toBe(3);
  });

  it("acceptedAnswer = the AUTHOR's chosen reply when accepted_reply_id is among the replies", () => {
    const replies = [reply("a"), reply("b"), reply("c")];
    const q = buildQaSchema(post({ accepted_reply_id: "b" }), replies)
      .mainEntity as Record<string, unknown>;
    const accepted = q.acceptedAnswer as Record<string, unknown>;
    expect(accepted).toMatchObject({
      "@type": "Answer",
      text: "תשובה b",
      author: { "@type": "Person", name: "משיב-b" },
    });
    // The rest become suggestedAnswer, in original (oldest-first) order.
    const suggested = q.suggestedAnswer as Array<Record<string, unknown>>;
    expect(suggested.map((s) => s.text)).toEqual(["תשובה a", "תשובה c"]);
  });

  it("falls back to the EARLIEST reply when the author made no choice", () => {
    const q = buildQaSchema(post({ accepted_reply_id: null }), [reply("a"), reply("b")])
      .mainEntity as Record<string, unknown>;
    expect((q.acceptedAnswer as Record<string, unknown>).text).toBe("תשובה a");
  });

  it("a DANGLING accepted_reply_id (deleted/flagged-out reply) falls back to the earliest reply", () => {
    const q = buildQaSchema(post({ accepted_reply_id: "gone" }), [reply("a"), reply("b")])
      .mainEntity as Record<string, unknown>;
    expect((q.acceptedAnswer as Record<string, unknown>).text).toBe("תשובה a");
  });

  it("omits suggestedAnswer entirely when the accepted reply is the only one", () => {
    const q = buildQaSchema(post(), [reply("a")]).mainEntity as Record<string, unknown>;
    expect(q.acceptedAnswer).toBeDefined();
    expect(q.suggestedAnswer).toBeUndefined();
  });

  it("every Answer carries the reply's REAL body/author/date verbatim", () => {
    const r = reply("a", {
      body: "המסלול של פרטנר ב-₪29",
      author: "יוסי",
      created_at: "2026-07-02T08:30:00Z",
    });
    const q = buildQaSchema(post(), [r]).mainEntity as Record<string, unknown>;
    expect(q.acceptedAnswer).toEqual({
      "@type": "Answer",
      text: "המסלול של פרטנר ב-₪29",
      author: { "@type": "Person", name: "יוסי" },
      dateCreated: "2026-07-02T08:30:00Z",
    });
  });
});
