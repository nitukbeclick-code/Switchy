import { describe, it, expect } from "vitest";
import {
  CONTACT_EMAIL,
  CONTACT_WHATSAPP,
  COMMISSION_DISCLOSURE_LEAD,
  COMMISSION_DISCLOSURE_BODY,
  COMMISSION_DISCLOSURE_LINK_TEXT,
  PRICE_ACCURACY_CAVEAT,
  MARKETING_CHANNELS,
  MARKETING_OPTIN_NOTE,
  marketingChannelLabel,
} from "@/lib/legal";

// ────────────────────────────────────────────────────────────────────────────
// Guards for the consumer-facing compliance copy (Consumer Protection §7b/§17 +
// Spam Law). These are deliberately strict: the wording is load-bearing for legal
// compliance, so an accidental edit that drops a required claim should fail CI.
// ────────────────────────────────────────────────────────────────────────────

describe("commission disclosure (Consumer Protection §7b)", () => {
  it("states the service is free to the user", () => {
    expect(COMMISSION_DISCLOSURE_LEAD).toContain("חינמי");
  });

  it("discloses a referral/commission fee from providers", () => {
    expect(COMMISSION_DISCLOSURE_BODY).toMatch(/דמי תיווך|הפניה/);
    expect(COMMISSION_DISCLOSURE_BODY).toContain("מהספקים");
  });

  it("clarifies the fee does NOT affect the price the user pays", () => {
    expect(COMMISSION_DISCLOSURE_BODY).toContain("אינו משפיע");
    expect(COMMISSION_DISCLOSURE_BODY).toContain("המחיר");
  });

  it("references the transparent methodology and contains the link anchor", () => {
    expect(COMMISSION_DISCLOSURE_BODY).toContain(COMMISSION_DISCLOSURE_LINK_TEXT);
  });

  it("does NOT position the brand as a neutral consumer advocate", () => {
    const all = `${COMMISSION_DISCLOSURE_LEAD} ${COMMISSION_DISCLOSURE_BODY}`;
    expect(all).not.toContain("גוף צרכני");
    expect(all).not.toContain("נציג הצרכן");
    expect(all).not.toContain("סנגור");
  });
});

describe("price-accuracy caveat (Consumer Protection §17)", () => {
  it("states prices are VAT-inclusive", () => {
    expect(PRICE_ACCURACY_CAVEAT).toContain("מע״מ");
  });

  it("states prices are accurate as of the update date", () => {
    expect(PRICE_ACCURACY_CAVEAT).toContain("תאריך העדכון");
  });

  it("tells the user to verify with the provider before signing", () => {
    expect(PRICE_ACCURACY_CAVEAT).toContain("לאמת מול הספק");
  });
});

describe("granular marketing consent (Spam Law)", () => {
  it("offers exactly the three required channels", () => {
    const keys = MARKETING_CHANNELS.map((c) => c.key);
    expect(keys).toEqual(["sms", "email", "whatsapp"]);
  });

  it("labels the opt-in as marketing (פרסומת) with an opt-out path", () => {
    expect(MARKETING_OPTIN_NOTE).toContain("פרסומת");
    expect(MARKETING_OPTIN_NOTE).toContain("הסר");
  });

  it("builds a per-channel label that names the channel", () => {
    expect(marketingChannelLabel("SMS")).toContain("SMS");
    expect(marketingChannelLabel("SMS")).toContain("דיוור שיווקי");
  });
});

describe("contact details (owner-confirmed)", () => {
  it("uses the real contact email and WhatsApp number", () => {
    expect(CONTACT_EMAIL).toBe("hello@chosech.co.il");
    expect(CONTACT_WHATSAPP).toBe("050-503-7537");
  });
});
