// ────────────────────────────────────────────────────────────────────────────
// <ConsentBanner> — the GA4 Consent Mode v2 opt-in surface. Contract:
//   • No stored choice  → the banner (role="dialog") is shown.
//   • A stored choice    → the banner is hidden (no flash for returning users).
//   • "אישור"  → persists "granted" + pushes a granted consent update to gtag.
//   • "רק חיוני" → persists "denied"  + pushes a denied consent update to gtag.
//   • A stored "granted" replays a granted gtag update on mount.
// localStorage key is `cookieConsent`. We stub window.gtag to capture the
// Consent Mode payload without loading GA4.
// ────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ConsentBanner from "@/components/ConsentBanner";

const STORAGE_KEY = "cookieConsent";

let gtag: ReturnType<typeof vi.fn>;

beforeEach(() => {
  localStorage.clear();
  gtag = vi.fn();
  (window as unknown as { gtag: typeof gtag }).gtag = gtag;
});

describe("ConsentBanner — visibility", () => {
  it("shows the consent dialog when no choice is stored", () => {
    render(<ConsentBanner />);
    expect(screen.getByRole("dialog", { name: "הסכמה לעוגיות" })).toBeInTheDocument();
  });

  it("stays hidden when a 'denied' choice is already stored", () => {
    localStorage.setItem(STORAGE_KEY, "denied");
    render(<ConsentBanner />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("stays hidden for a stored 'granted' choice and replays a granted gtag update", () => {
    localStorage.setItem(STORAGE_KEY, "granted");
    render(<ConsentBanner />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(gtag).toHaveBeenCalledWith(
      "consent",
      "update",
      expect.objectContaining({ analytics_storage: "granted" }),
    );
  });
});

describe("ConsentBanner — choosing", () => {
  it("granting persists 'granted', updates all four gtag signals, and closes the banner", async () => {
    const user = userEvent.setup();
    render(<ConsentBanner />);

    await user.click(screen.getByRole("button", { name: "אישור" }));

    expect(localStorage.getItem(STORAGE_KEY)).toBe("granted");
    expect(gtag).toHaveBeenCalledWith("consent", "update", {
      analytics_storage: "granted",
      ad_storage: "granted",
      ad_user_data: "granted",
      ad_personalization: "granted",
    });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("denying persists 'denied', pushes a denied update, and closes the banner", async () => {
    const user = userEvent.setup();
    render(<ConsentBanner />);

    await user.click(screen.getByRole("button", { name: "רק חיוני" }));

    expect(localStorage.getItem(STORAGE_KEY)).toBe("denied");
    expect(gtag).toHaveBeenCalledWith("consent", "update", {
      analytics_storage: "denied",
      ad_storage: "denied",
      ad_user_data: "denied",
      ad_personalization: "denied",
    });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
