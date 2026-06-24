import { describe, it, expect } from "vitest";
import {
  buildSwitchKit,
  isSwitchKit,
  isSwitchStepKey,
  resolveProvider,
  annualSaving,
  switchSteps,
  portabilityChecklist,
  keyDates,
  SWITCH_STEP_KEYS,
  SWITCH_DISCLAIMER,
  type SwitchKit,
} from "./switch-kit";
import { getPlans, getProviders, providerOfficialUrl } from "./data";

// ────────────────────────────────────────────────────────────────────────────
// lib/switch-kit — the PURE Switch-Autopilot builder behind the web /switch-kit
// page. It mirrors supabase/functions/_shared/switch.ts: same step keys, same
// honest framing (זכות הניתוק; free number-port via מסלקת הניוד handled by the NEW
// provider; commitment = remaining-commitment only). These tests assert the honest
// framing, that nothing is fabricated (target is a real catalogue row), the saving
// is an upper-bound estimate vs a real bill only, and the tracker step keys are
// stable + in lockstep with the persisted jsonb store contract.
// ────────────────────────────────────────────────────────────────────────────

const PLANS = getPlans();
const PROVIDER_NAMES = getProviders().map((p) => p.name);

/** A real cellular plan id from the bundled catalogue (cheapest cellular). */
function cheapestCellular() {
  return [...PLANS]
    .filter((p) => p.cat === "cellular" && typeof p.price === "number")
    .sort((a, b) => a.price - b.price)[0];
}

const FIXED_NOW = new Date("2026-06-24T09:00:00Z");

function build(overrides: Record<string, unknown> = {}): SwitchKit {
  const target = cheapestCellular();
  const res = buildSwitchKit(
    {
      plans: PLANS,
      providers: PROVIDER_NAMES,
      targetPlanId: target.id,
      now: FIXED_NOW,
      ...overrides,
    },
    providerOfficialUrl,
  );
  if (!isSwitchKit(res)) throw new Error("expected a SwitchKit");
  return res;
}

describe("switch-kit — step keys + helpers (parity with _shared/switch.ts)", () => {
  it("ships exactly the 5 canonical, stable step keys in order", () => {
    expect([...SWITCH_STEP_KEYS]).toEqual([
      "check_terms",
      "compare_alternatives",
      "porting",
      "written_notice",
      "equipment_final_bill",
    ]);
    const steps = switchSteps("סלקום", true);
    expect(steps.map((s) => s.key)).toEqual([...SWITCH_STEP_KEYS]);
    // Every fresh step defaults to 'todo'.
    expect(steps.every((s) => s.status === "todo")).toBe(true);
  });

  it("isSwitchStepKey accepts canonical keys and rejects junk", () => {
    expect(isSwitchStepKey("porting")).toBe(true);
    expect(isSwitchStepKey("nope")).toBe(false);
    expect(isSwitchStepKey(42)).toBe(false);
  });

  it("resolveProvider matches a real provider, case/space-insensitively", () => {
    const real = PROVIDER_NAMES[0];
    expect(resolveProvider(real, PROVIDER_NAMES)).toBe(real);
    expect(resolveProvider("  " + real.toUpperCase() + " ", PROVIDER_NAMES)).toBe(real);
    expect(resolveProvider("definitely-not-a-provider-xyz", PROVIDER_NAMES)).toBeNull();
    expect(resolveProvider("", PROVIDER_NAMES)).toBeNull();
  });

  it("annualSaving is 0 without a bill and an upper bound with one (monthly only)", () => {
    const target = cheapestCellular();
    expect(annualSaving(target, undefined)).toBe(0);
    expect(annualSaving(target, 0)).toBe(0);
    // A bill well above the cheapest cellular plan yields a positive estimate.
    const saving = annualSaving(target, 200);
    expect(saving).toBe(Math.round((200 - target.price) * 12));
    expect(saving).toBeGreaterThan(0);
  });
});

describe("switch-kit — honest framing (mirrors the AEO /switch guide)", () => {
  it("cellular kit explains the NEW provider handles the free port (no pre-disconnect)", () => {
    const kit = build();
    expect(kit.category).toBe("cellular");
    const porting = kit.switchSteps.find((s) => s.key === "porting");
    expect(porting?.text).toContain("מסלקת הניוד");
    expect(porting?.text).toContain("הספק החדש");
    expect(porting?.text).toContain("יום עסקים");
    // The number-port checklist item appears only for cellular.
    expect(kit.portabilityChecklist.some((i) => i.key === "keep_number")).toBe(true);
  });

  it("always carries the legal disclaimer + dates the notice day", () => {
    const kit = build();
    expect(kit.disclaimer).toBe(SWITCH_DISCLAIMER);
    expect(kit.disclaimer).toContain("לא ייעוץ משפטי");
    const noticeDate = kit.keyDates.find((d) => d.key === "notice_date");
    expect(noticeDate?.hint).toContain("2026-06-24");
  });

  it("letter uses placeholders for missing PII and never invents a name/number", () => {
    const kit = build();
    expect(kit.cancellationLetterHe).toContain("[שם מלא]");
    expect(kit.cancellationLetterHe).toContain("תאריך: 2026-06-24");
    // The commitment clause is the neutral wording when commitment is unknown.
    expect(kit.cancellationLetterHe).toContain("ככל שקיימת התחייבות");
  });

  it("fills the customer name + commitment clause when supplied", () => {
    const kit = build({
      profile: { fullName: "ישראל ישראלי", hasCommitment: false },
    });
    expect(kit.cancellationLetterHe).toContain("ישראל ישראלי");
    expect(kit.cancellationLetterHe).toContain("ללא התחייבות");
    expect(kit.cancellationLetterHe).not.toContain("[שם מלא]");
  });
});

describe("switch-kit — real-data grounding + saving", () => {
  it("the target is a REAL catalogue row (provider/plan/price)", () => {
    const target = cheapestCellular();
    const kit = build();
    expect(kit.toPlanId).toBe(String(target.id));
    expect(kit.toProvider).toBe(target.provider);
    expect(kit.price).toBe(target.price);
    expect(kit.price).toBeGreaterThan(0);
  });

  it("surfaces an honest annual saving only when a real bill is given", () => {
    const noBill = build();
    expect(noBill.annualSavingUpTo).toBeUndefined();

    const withBill = build({ profile: { currentBill: 200 } });
    expect(withBill.annualSavingUpTo).toBeGreaterThan(0);
  });

  it("rejects a missing/unknown target with an unavailable result (no fabrication)", () => {
    const noTarget = buildSwitchKit(
      { plans: PLANS, providers: PROVIDER_NAMES },
      providerOfficialUrl,
    );
    expect(isSwitchKit(noTarget)).toBe(false);

    const unknown = buildSwitchKit(
      { plans: PLANS, providers: PROVIDER_NAMES, targetPlanId: "no_such_plan_id" },
      providerOfficialUrl,
    );
    expect(isSwitchKit(unknown)).toBe(false);
  });
});

describe("switch-kit — non-cellular tailoring", () => {
  it("an internet target has no number-port item but has install coordination", () => {
    const internet = [...PLANS]
      .filter((p) => p.cat === "internet" && typeof p.price === "number")
      .sort((a, b) => a.price - b.price)[0];
    if (!internet) return; // catalogue always has internet, but stay defensive
    const res = buildSwitchKit(
      { plans: PLANS, providers: PROVIDER_NAMES, targetPlanId: internet.id, now: FIXED_NOW },
      providerOfficialUrl,
    );
    if (!isSwitchKit(res)) throw new Error("expected a kit");
    expect(res.category).toBe("internet");
    expect(res.portabilityChecklist.some((i) => i.key === "keep_number")).toBe(false);
    expect(res.portabilityChecklist.some((i) => i.key === "install_coordination")).toBe(true);
    // The porting step says there is no number port for this category.
    const porting = res.switchSteps.find((s) => s.key === "porting");
    expect(porting?.text).toContain("אין ניוד מספר");
  });
});

describe("switch-kit — bare helpers", () => {
  it("keyDates gives a cellular porting window vs a non-cellular switch window", () => {
    const cell = keyDates(FIXED_NOW, "cellular");
    expect(cell.some((d) => d.key === "porting_window")).toBe(true);
    const net = keyDates(FIXED_NOW, "internet");
    expect(net.some((d) => d.key === "switch_window")).toBe(true);
    // Both always include the billing-stop honesty note.
    expect(cell.some((d) => d.key === "billing_stop")).toBe(true);
  });

  it("portabilityChecklist reflects a known commitment state honestly", () => {
    const yes = portabilityChecklist("סלקום", "cellular", true);
    expect(yes.find((i) => i.key === "commitment")?.detail).toContain("בהתחייבות");
    const no = portabilityChecklist("סלקום", "cellular", false);
    expect(no.find((i) => i.key === "commitment")?.detail).toContain("ללא התחייבות");
  });
});
