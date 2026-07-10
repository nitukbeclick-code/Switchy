import { describe, expect, it } from "vitest";
import { withinRange } from "@/lib/date-range";

const NOW = Date.parse("2026-07-10T12:00:00Z");
const hoursAgo = (h: number) => new Date(NOW - h * 3_600_000).toISOString();

describe("withinRange", () => {
  it("'all' always passes, even for null", () => {
    expect(withinRange(null, "all", NOW)).toBe(true);
    expect(withinRange(hoursAgo(1000), "all", NOW)).toBe(true);
  });

  it("bounds the 1-day window at 24h", () => {
    expect(withinRange(hoursAgo(1), "1d", NOW)).toBe(true);
    expect(withinRange(hoursAgo(23), "1d", NOW)).toBe(true);
    expect(withinRange(hoursAgo(25), "1d", NOW)).toBe(false);
  });

  it("bounds the 7-day and 30-day windows", () => {
    expect(withinRange(hoursAgo(24 * 6), "7d", NOW)).toBe(true);
    expect(withinRange(hoursAgo(24 * 8), "7d", NOW)).toBe(false);
    expect(withinRange(hoursAgo(24 * 29), "30d", NOW)).toBe(true);
    expect(withinRange(hoursAgo(24 * 31), "30d", NOW)).toBe(false);
  });

  it("fails a bounded window for absent/unparseable/future timestamps", () => {
    expect(withinRange(null, "7d", NOW)).toBe(false);
    expect(withinRange("", "7d", NOW)).toBe(false);
    expect(withinRange("not-a-date", "7d", NOW)).toBe(false);
    expect(withinRange(hoursAgo(-5), "7d", NOW)).toBe(false); // future
  });
});
