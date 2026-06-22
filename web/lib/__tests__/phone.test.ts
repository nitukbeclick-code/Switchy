import { describe, it, expect } from "vitest";
import { isValidIsraeliPhone, normalizeIsraeliPhone } from "@/lib/phone";

// ────────────────────────────────────────────────────────────────────────────
// Phone parity — the client form's validator (`isValidPhone` → now
// `isValidIsraeliPhone`) and the /api/lead server's `normalizePhone` (→ now
// `normalizeIsraeliPhone`) MUST agree, because both import the single helper.
// These cases pin that contract so a future drift fails the suite.
// ────────────────────────────────────────────────────────────────────────────

const ACCEPT: Array<[string, string]> = [
  ["0501234567", "0501234567"], // 10-digit mobile
  ["050-123-4567", "0501234567"], // separators stripped
  ["+972501234567", "0501234567"], // +972 country code → 0
  ["972501234567", "0501234567"], // bare 972 country code → 0
];

const REJECT: string[] = [
  "05012345678", // 11 digits — too long
  "123456789", // does not start with 0
  "00000000", // 8 digits — too short (needs 0 + 8..9)
  "abc", // no digits at all
];

describe("normalizeIsraeliPhone — accepts & canonicalizes", () => {
  for (const [input, expected] of ACCEPT) {
    it(`accepts ${JSON.stringify(input)} → ${expected}`, () => {
      expect(normalizeIsraeliPhone(input)).toBe(expected);
    });
  }
});

describe("normalizeIsraeliPhone — rejects invalid", () => {
  for (const input of REJECT) {
    it(`rejects ${JSON.stringify(input)}`, () => {
      expect(normalizeIsraeliPhone(input)).toBeNull();
    });
  }
});

describe("isValidIsraeliPhone ↔ normalizeIsraeliPhone parity", () => {
  it("isValid is true exactly when normalize is non-null (client ⇄ server)", () => {
    for (const [input] of ACCEPT) {
      expect(isValidIsraeliPhone(input)).toBe(true);
      expect(normalizeIsraeliPhone(input)).not.toBeNull();
    }
    for (const input of REJECT) {
      expect(isValidIsraeliPhone(input)).toBe(false);
      expect(normalizeIsraeliPhone(input)).toBeNull();
    }
  });

  it("accepts a 9-digit local landline (0 + 8 digits)", () => {
    // The lower bound of the 9–10 digit window: e.g. an Eilat landline 08…
    expect(normalizeIsraeliPhone("089123456")).toBe("089123456");
    expect(isValidIsraeliPhone("089123456")).toBe(true);
  });

  it("normalizes a +972 number written with spaces and dashes", () => {
    expect(normalizeIsraeliPhone("+972 50-123-4567")).toBe("0501234567");
  });
});
