import { describe, it, expect } from "vitest";
import { availableSlots, type BookingDay } from "./slots";

// ────────────────────────────────────────────────────────────────────────────
// lib/slots — the PURE booking-slot generator behind the /book day+time picker.
// It MUST mirror public.meetings_guard / meeting-book/lib.ts validBookingSlot
// EXACTLY, so these tests pin the same rules the server enforces: Israel
// wall-clock, tomorrow is the earliest day, ≤30 days ahead, Saturday excluded,
// Friday capped at 12:30, Sun–Thu last slot 20:30, all on a 30-minute grid.
//
// `now` is fixed so the output is deterministic. We use a Date built from a
// concrete UTC instant and reason about the resulting Israel-local calendar.
// ────────────────────────────────────────────────────────────────────────────

/** ISO weekday (1=Mon … 7=Sun) for a 'YYYY-MM-DD' — matches Postgres isodow. */
function isodow(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  const js = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return js === 0 ? 7 : js;
}

/** A mid-morning Israel-time "now" on a known weekday (2026-06-24 is a Wednesday). */
const NOW = new Date("2026-06-24T09:00:00+03:00");

describe("availableSlots — window bounds", () => {
  it("starts at tomorrow (≥1 day ahead) and never includes today or the past", () => {
    const days = availableSlots(NOW);
    expect(days.length).toBeGreaterThan(0);

    // The Israel-local 'today' for this instant is 2026-06-24; the earliest day
    // returned must be strictly after it.
    const today = "2026-06-24";
    expect(days.every((d) => d.date > today)).toBe(true);
    // The very first selectable date is tomorrow, 2026-06-25 (a Thursday — not
    // skipped), so it must be present and be the earliest.
    expect(days[0].date).toBe("2026-06-25");
  });

  it("never offers a day more than 30 days ahead", () => {
    const days = availableSlots(NOW);
    const max = "2026-07-24"; // 2026-06-24 + 30 days
    expect(days.every((d) => d.date <= max)).toBe(true);
    // And the window genuinely reaches near the +30 boundary.
    expect(days[days.length - 1].date <= max).toBe(true);
    expect(days[days.length - 1].date > "2026-07-20").toBe(true);
  });

  it("returns days in ascending date order", () => {
    const days = availableSlots(NOW);
    const sorted = [...days].map((d) => d.date).sort();
    expect(days.map((d) => d.date)).toEqual(sorted);
  });
});

describe("availableSlots — day exclusions + Hebrew labels", () => {
  it("excludes every Saturday (isodow 6)", () => {
    const days = availableSlots(NOW);
    expect(days.some((d) => isodow(d.date) === 6)).toBe(false);
  });

  it("labels days in Hebrew with the day.month suffix (e.g. 'יום חמישי, 25.6')", () => {
    const days = availableSlots(NOW);
    const first = days[0]; // 2026-06-25 — a Thursday
    expect(first.label).toBe("יום חמישי, 25.6");
    // Every label is "<weekday>, <d>.<m>".
    for (const d of days) {
      expect(d.label).toMatch(/^יום (ראשון|שני|שלישי|רביעי|חמישי|שישי), \d{1,2}\.\d{1,2}$/);
    }
  });
});

describe("availableSlots — the 30-minute grid", () => {
  it("uses a strict 30-minute grid of HH:00 / HH:30 strings on every day", () => {
    const days = availableSlots(NOW);
    for (const d of days) {
      for (const s of d.slots) {
        expect(s).toMatch(/^\d{2}:(00|30)$/);
      }
      // ascending + no duplicates
      const sorted = [...d.slots].sort();
      expect(d.slots).toEqual(sorted);
      expect(new Set(d.slots).size).toBe(d.slots.length);
    }
  });

  it("Sunday–Thursday run 09:00 → 20:30 (last slot 20:30, first 09:00)", () => {
    const days = availableSlots(NOW);
    const weekday = days.filter((d) => [1, 2, 3, 4, 7].includes(isodow(d.date)));
    expect(weekday.length).toBeGreaterThan(0);
    for (const d of weekday) {
      expect(d.slots[0]).toBe("09:00");
      expect(d.slots[d.slots.length - 1]).toBe("20:30");
      // 09:00..20:30 on a 30-min grid = 24 slots.
      expect(d.slots).toHaveLength(24);
    }
  });

  it("Friday is capped at 12:30 (mornings only, last slot 12:30)", () => {
    const days = availableSlots(NOW);
    const fridays = days.filter((d) => isodow(d.date) === 5);
    expect(fridays.length).toBeGreaterThan(0);
    for (const f of fridays) {
      expect(f.slots[0]).toBe("09:00");
      expect(f.slots[f.slots.length - 1]).toBe("12:30");
      expect(f.slots.every((s) => s <= "12:30")).toBe(true);
      // 09:00..12:30 on a 30-min grid = 8 slots.
      expect(f.slots).toHaveLength(8);
    }
  });
});

describe("availableSlots — determinism", () => {
  it("is deterministic for a fixed `now`", () => {
    const a = availableSlots(NOW);
    const b = availableSlots(NOW);
    expect(a).toEqual(b);
  });

  it("returns at most 30 days and never an empty list within the window", () => {
    const days: BookingDay[] = availableSlots(NOW);
    expect(days.length).toBeLessThanOrEqual(30);
    // Across a 30-day window with ~4 Saturdays removed, expect a healthy count.
    expect(days.length).toBeGreaterThanOrEqual(24);
  });
});
