// switch-kit.ts `annualSaving` — the THIRD copy of the annual-saving rule.
//
// The rule lives in three TS places (web/lib/recommend.ts, web/lib/switch-kit.ts,
// supabase/functions/_shared/scoring.ts) plus the app's Dart planSaveYear, and
// CLAUDE.md's standing instruction is that changing one means changing all. Until
// now this copy had no direct test — only app/api/switch-kit/route.test.ts
// asserting `annualSavingUpTo` was `> 0` or `undefined`, which would pass just as
// happily on a fabricated number.
//
// So this pins the same fixtures its two siblings are pinned to, including the
// case that actually diverged: an UNSET (or empty-string) priceUnit on an abroad
// plan must not be annualised against a monthly bill.

import { describe, expect, it } from "vitest";
import { annualSaving } from "@/lib/switch-kit";
import type { Plan } from "@/lib/types";

// `Plan.priceUnit` is the literal union PriceUnit, so "" is unreachable for a
// TYPED caller — but these rows come from a free-text `price_unit` DB column that
// TypeScript never sees, so the empty case is reachable at runtime and is cast in
// deliberately below. ScorablePlan (recommend.ts / scoring.ts) types it as a plain
// `string`, where it needs no cast at all.
const plan = (over: Partial<Plan>): Plan => ({ price: 29, cat: "cellular", ...over } as Plan);

describe("switch-kit annualSaving", () => {
  it("is ((bill - price) * 12) clamped ≥ 0 for a flat monthly plan", () => {
    expect(annualSaving(plan({ price: 29, priceUnit: "month" }), 90)).toBe((90 - 29) * 12);
    expect(annualSaving(plan({ price: 120, priceUnit: "month" }), 90)).toBe(0);
  });

  it("returns 0 without a real current bill", () => {
    expect(annualSaving(plan({ price: 29, priceUnit: "month" }), 0)).toBe(0);
    expect(annualSaving(plan({ price: 29, priceUnit: "month" }), undefined)).toBe(0);
  });

  it("returns 0 for non-monthly (per-package/day/minute) plans", () => {
    expect(annualSaving(plan({ price: 29, priceUnit: "package", cat: "abroad" }), 90)).toBe(0);
    expect(annualSaving(plan({ price: 5, priceUnit: "day", cat: "abroad" }), 90)).toBe(0);
    expect(annualSaving(plan({ price: 1, priceUnit: "minute", cat: "abroad" }), 90)).toBe(0);
  });

  // The divergence. `??` passed an EMPTY-STRING unit straight through to the
  // !== "month" check — which happens to yield 0 here, but for the wrong reason,
  // and it disagreed with recommend.ts, which read the same row as monthly and
  // invented a ₪732/yr saving from a per-package price. `||` makes "" as unset as
  // null, matching the app's planHasMonthlyTerm (`unit == null || unit.isEmpty`).
  it("treats an UNSET or empty priceUnit on an abroad plan as non-monthly", () => {
    expect(annualSaving(plan({ price: 29, cat: "abroad", priceUnit: undefined }), 90)).toBe(0);
    expect(annualSaving(plan({ price: 29, cat: "abroad", priceUnit: "" as never }), 90)).toBe(0);
  });

  it("still treats an unset priceUnit as monthly when the plan is NOT abroad", () => {
    expect(annualSaving(plan({ price: 29, cat: "cellular", priceUnit: undefined }), 90)).toBe(
      (90 - 29) * 12,
    );
    // The EMPTY-STRING case is what separates `||` from `??`: with `??` an empty
    // unit survives to the !== "month" check and silently zeroes the saving on a
    // perfectly ordinary cellular plan. Dart's planHasMonthlyTerm treats null and
    // empty identically, and so must this.
    expect(annualSaving(plan({ price: 29, cat: "cellular", priceUnit: "" as never }), 90)).toBe(
      (90 - 29) * 12,
    );
  });

  // The rule that makes the figure honest: net off what the plan really costs over
  // twelve months, not the promo headline multiplied out. This is the exact case
  // CLAUDE.md records — a ₪39 headline against a ₪140 bill claimed ₪1,212/yr when
  // the published ladder only supports ₪212, because the promo expires in month 3.
  it("nets off a published ladder rather than annualising the promo headline", () => {
    const laddered = plan({
      price: 39,
      priceUnit: "month",
      cat: "internet",
      fineLines: ["מדרגות מחיר: ח׳1-2: ₪39 / ח׳3-12: ₪139 / ח׳13+: ₪159"],
    } as Partial<Plan>);
    // 2×39 + 10×139 = 1468 over the horizon ⇒ 140×12 − 1468 = 212.
    expect(annualSaving(laddered, 140)).toBe(212);
    expect(annualSaving(laddered, 140)).toBeLessThan((140 - 39) * 12); // ≪ 1212
  });

  // A promo whose DURATION is unpublished yields a cost RANGE, and the saving must
  // take the costliest end — the smallest defensible claim.
  it("claims the smallest defensible figure when the promo duration is unpublished", () => {
    const openEnded = plan({ price: 39, after: 140, priceUnit: "month", cat: "internet" });
    const saving = annualSaving(openEnded, 200);
    expect(saving).toBeLessThan((200 - 39) * 12);
    expect(saving).toBeGreaterThan(0);
  });
});
