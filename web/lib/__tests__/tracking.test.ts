import { describe, it, expect, vi, afterEach } from "vitest";
import { fireLeadConversion, sendProductEvent, trackEvent } from "@/lib/tracking";

// ────────────────────────────────────────────────────────────────────────────
// lib/tracking.ts — trackEvent() is the generic non-conversion event helper used
// by the lead-form micro-funnel and the CTA / outbound islands. Contract:
//   • no-ops safely on the server (no window) and never throws,
//   • forwards to window.gtag('event', name, params) when present,
//   • swallows any gtag/fbq error so it can never break the UX.
// The test env is `node` (no DOM), so we install/remove a minimal window stub.
// ────────────────────────────────────────────────────────────────────────────

type MaybeWindow = { window?: unknown };

afterEach(() => {
  delete (globalThis as MaybeWindow).window;
  vi.restoreAllMocks();
});

function consentedWindow() {
  const memory = new Map<string, string>([["cookieConsent", "granted"]]);
  return {
    localStorage: {
      getItem: (key: string) => memory.get(key) ?? null,
      setItem: (key: string, value: string) => memory.set(key, value),
    },
    sessionStorage: {
      getItem: (key: string) => memory.get(key) ?? null,
      setItem: (key: string, value: string) => memory.set(key, value),
    },
  };
}

describe("trackEvent", () => {
  it("no-ops and does not throw when there is no window (server)", () => {
    expect(() => trackEvent("lead_form_start", { source: "home" })).not.toThrow();
  });

  it("forwards the event name and params to window.gtag", () => {
    const gtag = vi.fn();
    (globalThis as MaybeWindow).window = { gtag };

    trackEvent("lead_form_step", { source: "home", step: 1 });

    expect(gtag).toHaveBeenCalledTimes(1);
    expect(gtag).toHaveBeenCalledWith("event", "lead_form_step", {
      source: "home",
      step: 1,
    });
  });

  it("passes an empty params object to gtag when none is given", () => {
    const gtag = vi.fn();
    (globalThis as MaybeWindow).window = { gtag };

    trackEvent("cta_click");

    expect(gtag).toHaveBeenCalledWith("event", "cta_click", {});
  });

  it("never throws even when gtag throws", () => {
    const gtag = vi.fn(() => {
      throw new Error("gtag blew up");
    });
    (globalThis as MaybeWindow).window = { gtag };

    expect(() => trackEvent("lead_form_error", { source: "home" })).not.toThrow();
    expect(gtag).toHaveBeenCalledTimes(1);
  });

  it("does nothing when gtag is absent on window (no fbq id configured)", () => {
    (globalThis as MaybeWindow).window = {};
    expect(() => trackEvent("outbound_click", { provider: "cellcom" })).not.toThrow();
  });

  it("sends mapped product events to the first-party funnel after consent", () => {
    (globalThis as MaybeWindow).window = consentedWindow();
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}"));

    trackEvent("compare_shortlist_create", { selection_count: 1 });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(JSON.parse(String(init.body))).toMatchObject({
      event: "shortlistCreate",
      props: { surface: "web", selection_count: 1 },
    });
    expect(init.keepalive).toBe(true);
  });

  it("does not send first-party product analytics before consent", () => {
    (globalThis as MaybeWindow).window = {
      localStorage: { getItem: () => null },
    };
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}"));
    sendProductEvent("compareView");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("records leadSubmit only after a confirmed lead conversion", () => {
    (globalThis as MaybeWindow).window = consentedWindow();
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}"));
    fireLeadConversion({ source: "home", category: "internet" });
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(JSON.parse(String(init.body))).toMatchObject({
      event: "leadSubmit",
      props: { source: "home", category: "internet" },
    });
  });
});
