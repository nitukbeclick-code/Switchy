import { describe, it, expect } from "vitest";
import {
  makeReferralCode,
  normalizeReferralCode,
  isReferralCode,
  buildReferralRow,
  referralLink,
  referralShareText,
  referralCodeFromQuery,
  REFERRAL_CODE_RE,
} from "@/lib/referral";
import { SITE_URL } from "@/lib/schema";

// ────────────────────────────────────────────────────────────────────────────
// lib/referral.ts — the pure web referral helpers. The contract under test:
//   • The code format is byte-for-byte the agent's SW-XXXXXX (same alphabet/len),
//     so a site code is indistinguishable from an agent-issued one.
//   • normalize/validate are strict (junk ?ref= is never attributed).
//   • The persisted row is attribution-only with NO reward field, channel "site".
//   • The share copy/link are share-the-tool (NO money promise) and carry the code.
// All pure — no network, deterministic via the rng seam.
// ────────────────────────────────────────────────────────────────────────────

// A deterministic rng for makeReferralCode: feed fixed bytes so the body is pinned.
function fixedRng(bytes: number[]): (n: number) => Uint8Array {
  return (n) => Uint8Array.from(Array.from({ length: n }, (_, i) => bytes[i] ?? 0));
}

describe("makeReferralCode — format parity with _shared/referrals.ts", () => {
  it("produces a SW-XXXXXX code with the unambiguous alphabet", () => {
    const code = makeReferralCode();
    expect(code).toMatch(REFERRAL_CODE_RE);
    expect(code.startsWith("SW-")).toBe(true);
    expect(code).toHaveLength(9); // "SW-" + 6
    // No ambiguous chars in the body.
    expect(code.slice(3)).not.toMatch(/[01OIL]/);
  });

  it("is deterministic given fixed rng bytes (index → alphabet)", () => {
    // alphabet[0]=A ... index 0 six times → body "AAAAAA".
    expect(makeReferralCode(fixedRng([0, 0, 0, 0, 0, 0]))).toBe("SW-AAAAAA");
    // Sequential indices map to the sequential alphabet (A B C D E F G…).
    expect(makeReferralCode(fixedRng([1, 2, 3, 4, 5, 6]))).toBe("SW-BCDEFG");
    // The alphabet has 31 chars (no 0/1/I/O/L); a byte wraps modulo 31, so 31→A.
    expect(makeReferralCode(fixedRng([31, 30, 0, 1, 2, 3]))).toBe("SW-A9ABCD");
  });
});

describe("normalizeReferralCode / isReferralCode", () => {
  it("uppercases, trims, and strips whitespace", () => {
    expect(normalizeReferralCode("  sw-7kq4m9 ")).toBe("SW-7KQ4M9");
    expect(normalizeReferralCode("sw- 7k q4 m9")).toBe("SW-7KQ4M9");
  });

  it("accepts only well-formed SW-XXXXXX after normalization", () => {
    expect(isReferralCode("sw-7kq4m9")).toBe(true);
    expect(isReferralCode("SW-7KQ4M9")).toBe(true);
    expect(isReferralCode("SW-7KQ4M")).toBe(false); // too short
    expect(isReferralCode("SW-7KQ4M90")).toBe(false); // too long
    expect(isReferralCode("XX-7KQ4M9")).toBe(false); // wrong prefix
    expect(isReferralCode("SW-7KQ4M0")).toBe(false); // ambiguous 0 not in alphabet
    expect(isReferralCode("SW-7KQ4MI")).toBe(false); // ambiguous I not in alphabet
    expect(isReferralCode("")).toBe(false);
    expect(isReferralCode(null)).toBe(false);
  });
});

describe("buildReferralRow — attribution-only, no reward, channel site", () => {
  it("builds an anonymous site row with a normalized code and null handles", () => {
    const row = buildReferralRow({}, "sw-aaaaaa");
    expect(row).toEqual({
      code: "SW-AAAAAA",
      channel: "site",
      referrer_contact: null,
      referrer_name: null,
      conversation_id: null,
      source: "site",
    });
    // No reward field of any kind.
    expect("reward" in row).toBe(false);
    expect(Object.keys(row)).not.toContain("reward_amount");
  });

  it("clips and records a conversation token; mints a real code by default", () => {
    const row = buildReferralRow({ conversationId: " sess-abc " });
    expect(row.conversation_id).toBe("sess-abc");
    expect(row.code).toMatch(REFERRAL_CODE_RE);
  });

  it("clips an overlong conversation id to 80 chars", () => {
    const row = buildReferralRow({ conversationId: "x".repeat(200) }, "SW-AAAAAA");
    expect(row.conversation_id).toHaveLength(80);
  });
});

describe("referralLink / referralShareText — share-the-tool, no money promise", () => {
  it("links to the homepage with a normalized ?ref= code on SITE_URL", () => {
    expect(referralLink("sw-7kq4m9")).toBe(`${SITE_URL}/?ref=SW-7KQ4M9`);
  });

  it("share text contains the code + link and promises NO monetary reward", () => {
    const text = referralShareText("SW-7KQ4M9");
    expect(text).toContain("SW-7KQ4M9");
    expect(text).toContain(referralLink("SW-7KQ4M9"));
    // Honesty: no shekel sign / cash-promise vocabulary in the invite copy.
    expect(text).not.toMatch(/₪|\bבונוס\b|תשלום|תגמול|כסף|פרס/);
    // It frames as a free tool.
    expect(text).toMatch(/חינמי/);
  });
});

describe("referralCodeFromQuery — only attribute a valid code", () => {
  it("extracts a valid normalized code from a query string or full URL", () => {
    expect(referralCodeFromQuery("?ref=sw-7kq4m9")).toBe("SW-7KQ4M9");
    expect(referralCodeFromQuery("ref=SW-7KQ4M9&x=1")).toBe("SW-7KQ4M9");
    expect(referralCodeFromQuery(`${SITE_URL}/?ref=sw-7kq4m9`)).toBe("SW-7KQ4M9");
  });

  it("returns null for a missing or malformed ref (junk is never attributed)", () => {
    expect(referralCodeFromQuery("")).toBeNull();
    expect(referralCodeFromQuery("?x=1")).toBeNull();
    expect(referralCodeFromQuery("?ref=not-a-code")).toBeNull();
    expect(referralCodeFromQuery("?ref=SW-0000")).toBeNull();
    expect(referralCodeFromQuery(null)).toBeNull();
  });
});
