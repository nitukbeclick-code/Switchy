// ────────────────────────────────────────────────────────────────────────────
// lib/wallet-stats — the pure honesty gate behind the social-proof block. The
// critical property to lock down is HONESTY: below the publish threshold the
// summary is `published: false` (the UI shows nothing), and every published
// figure is a faithful pass-through of the REAL aggregate — never fabricated.
// ────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import {
  EMPTY_RAW_STATS,
  SOCIAL_PROOF_MIN_MEMBERS,
  ilsStat,
  normalizeRawStats,
  socialProofHeadline,
  summarizeStats,
  type RawSavingsStats,
} from "@/lib/wallet-stats";

function raw(over: Partial<RawSavingsStats> = {}): RawSavingsStats {
  return { ...EMPTY_RAW_STATS, ...over };
}

describe("summarizeStats — honesty gate", () => {
  it("does NOT publish when members are below the threshold", () => {
    const s = summarizeStats(raw({ members: SOCIAL_PROOF_MIN_MEMBERS - 1, medianSaving: 800 }));
    expect(s.published).toBe(false);
  });

  it("publishes once members reach the threshold", () => {
    const s = summarizeStats(raw({ members: SOCIAL_PROOF_MIN_MEMBERS, medianSaving: 800 }));
    expect(s.published).toBe(true);
    expect(s.members).toBe(SOCIAL_PROOF_MIN_MEMBERS);
  });

  it("zero members → not published (empty stats)", () => {
    expect(summarizeStats(EMPTY_RAW_STATS).published).toBe(false);
  });

  it("respects a custom threshold override", () => {
    expect(summarizeStats(raw({ members: 5, medianSaving: 100 }), 3).published).toBe(true);
    expect(summarizeStats(raw({ members: 5, medianSaving: 100 }), 9).published).toBe(false);
  });

  it("uses the MEDIAN as the typical figure, falling back to the mean", () => {
    const withMedian = summarizeStats(
      raw({ members: 50, medianSaving: 720, avgSaving: 1100 }),
    );
    expect(withMedian.typicalSaving).toBe(720); // robust median, not the mean

    const noMedian = summarizeStats(raw({ members: 50, medianSaving: 0, avgSaving: 1100 }));
    expect(noMedian.typicalSaving).toBe(1100); // falls back to the mean
  });

  it("never invents figures — passes real aggregates straight through", () => {
    const s = summarizeStats(
      raw({ members: 40, totalSaving: 48000, avgSaving: 1200, medianSaving: 950 }),
    );
    expect(s.totalSaving).toBe(48000);
    expect(s.avgSaving).toBe(1200);
    expect(s.medianSaving).toBe(950);
  });
});

describe("normalizeRawStats — defensive coercion", () => {
  it("maps a snake_case PostgREST row (string bigints) into clean numbers", () => {
    const r = normalizeRawStats({
      members: "42",
      total_saving: "50400",
      avg_saving: 1200,
      median_saving: "900",
      max_saving: "3000",
      first_at: "2026-01-01T00:00:00.000Z",
      last_at: "2026-06-20T00:00:00.000Z",
    });
    expect(r.members).toBe(42);
    expect(r.totalSaving).toBe(50400);
    expect(r.avgSaving).toBe(1200);
    expect(r.medianSaving).toBe(900);
    expect(r.maxSaving).toBe(3000);
    expect(r.firstAt).toBe("2026-01-01T00:00:00.000Z");
    expect(r.lastAt).toBe("2026-06-20T00:00:00.000Z");
  });

  it("collapses garbage / missing fields to 0 / null (never throws)", () => {
    expect(normalizeRawStats(null)).toEqual(EMPTY_RAW_STATS);
    expect(normalizeRawStats("nope")).toEqual(EMPTY_RAW_STATS);
    const r = normalizeRawStats({ members: -5, total_saving: "abc", first_at: "not-a-date" });
    expect(r.members).toBe(0);
    expect(r.totalSaving).toBe(0);
    expect(r.firstAt).toBeNull();
  });
});

describe("socialProofHeadline — copy honesty", () => {
  it("returns null when not published (UI renders nothing)", () => {
    expect(socialProofHeadline(summarizeStats(raw({ members: 1, medianSaving: 500 })))).toBeNull();
  });

  it("returns null when published but the typical figure is 0", () => {
    const s = summarizeStats(raw({ members: 100, medianSaving: 0, avgSaving: 0 }));
    expect(socialProofHeadline(s)).toBeNull();
  });

  it("frames the figure as based-on-report, not a promise", () => {
    const s = summarizeStats(raw({ members: 120, medianSaving: 840 }));
    const headline = socialProofHeadline(s);
    expect(headline).toContain("מבוסס דיווח");
    expect(headline).toContain("לא הבטחה");
    expect(headline).toContain("120");
    expect(headline).toContain("₪840");
  });
});

describe("ilsStat — he-IL shekel formatting", () => {
  it("groups thousands under he-IL and rounds", () => {
    expect(ilsStat(1234)).toBe("₪1,234");
    expect(ilsStat(840.6)).toBe("₪841");
    expect(ilsStat(0)).toBe("₪0");
  });
});
