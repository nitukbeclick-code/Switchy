// Unit tests for the shared CRM-console UI helpers — date/relative-time
// formatting, the lead/conversation status metadata + pills, the event tints,
// the SLA age chip, the clickable StatCard, the typed ErrorNotice, the UUID
// validator, and the URL-mirroring helper. Pure/presentational, so they pin the
// contract (Hebrew labels, null-safe dates, graceful fallback for unknown
// values, retry suppression on 401/403) without any network or auth.

import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import {
  CONTACT_STATUS_META,
  ContactStatusPill,
  CONVERSATION_STATUS_META,
  ConversationStatusPill,
  ErrorNotice,
  eventTint,
  formatMinutes,
  isUuid,
  LEAD_STATUS_META,
  LeadAgeChip,
  MEETING_STATUS_META,
  MeetingStatusPill,
  mirrorUrlParams,
  relTime,
  StatCard,
  StatusPill,
  when,
} from "@/components/crm/ui";
import { CONTACT_STATUSES, LEAD_STATUSES, MEETING_STATUSES } from "@/lib/crm-admin";

describe("CRM ui helpers", () => {
  it("when() is null-safe and rejects bad dates", () => {
    expect(when(null)).toBe("");
    expect(when(undefined)).toBe("");
    expect(when("")).toBe("");
    expect(when("not-a-date")).toBe("");
    expect(when("2026-07-01T10:00:00Z")).not.toBe(""); // a real he-IL string
  });

  it("when() shows the year ONLY for a date outside the current year", () => {
    const y = new Date().getFullYear();
    const thisYear = when(`${y}-03-05T10:00:00`);
    const otherYear = when(`${y - 2}-03-05T10:00:00`);
    expect(thisYear).not.toBe("");
    expect(thisYear).not.toContain(String(y));
    expect(otherYear).toContain(String(y - 2));
  });

  it("relTime renders short Hebrew ages, pure over (ts, nowMs)", () => {
    const t0 = Date.parse("2026-07-12T12:00:00Z");
    const iso = "2026-07-12T12:00:00Z";
    expect(relTime(null, t0)).toBe("");
    expect(relTime("not-a-date", t0)).toBe("");
    expect(relTime(iso, t0 + 30_000)).toBe("עכשיו");
    expect(relTime(iso, t0 + 60_000)).toBe("לפני דקה");
    expect(relTime(iso, t0 + 5 * 60_000)).toBe("לפני 5 דק׳");
    expect(relTime(iso, t0 + 60 * 60_000)).toBe("לפני שעה");
    expect(relTime(iso, t0 + 3 * 3_600_000)).toBe("לפני 3 שע׳");
    expect(relTime(iso, t0 + 25 * 3_600_000)).toBe("אתמול");
    expect(relTime(iso, t0 + 3 * 86_400_000)).toBe("לפני 3 ימים");
    // beyond ~30 days / future → absolute date, never a weird huge/negative age
    expect(relTime(iso, t0 + 45 * 86_400_000)).toBe(when(iso));
    expect(relTime(iso, t0 - 60_000)).toBe(when(iso));
  });

  it("formatMinutes renders he-IL durations and is null-safe", () => {
    expect(formatMinutes(null)).toBe("—");
    expect(formatMinutes(undefined)).toBe("—");
    expect(formatMinutes(-5)).toBe("—");
    expect(formatMinutes(Infinity)).toBe("—");
    expect(formatMinutes(0)).toBe("0 דק׳");
    expect(formatMinutes(42)).toBe("42 דק׳");
    expect(formatMinutes(60)).toBe("1 שע׳");
    expect(formatMinutes(125)).toBe("2 שע׳ 5 דק׳");
  });

  it("isUuid accepts only canonical-form UUIDs", () => {
    expect(isUuid("123e4567-e89b-12d3-a456-426614174000")).toBe(true);
    expect(isUuid("123E4567-E89B-12D3-A456-426614174000")).toBe(true); // case-insensitive
    expect(isUuid("")).toBe(false);
    expect(isUuid("123e4567e89b12d3a456426614174000")).toBe(false); // no dashes
    expect(isUuid("123e4567-e89b-12d3-a456-42661417400")).toBe(false); // short
    expect(isUuid("g23e4567-e89b-12d3-a456-426614174000")).toBe(false); // non-hex
    expect(isUuid(" 123e4567-e89b-12d3-a456-426614174000")).toBe(false); // untrimmed
  });

  it("eventTint maps event kinds to tones and falls back to neutral", () => {
    expect(eventTint("saving")).toContain("value");
    expect(eventTint("status_change")).toContain("accent");
    expect(eventTint("undo")).toContain("danger");
    expect(eventTint("mystery-kind")).toBe("border-border bg-surface");
  });

  it("LEAD_STATUS_META covers exactly the four pipeline stages", () => {
    expect(Object.keys(LEAD_STATUS_META).sort()).toEqual(["contacted", "lost", "new", "won"]);
    expect(LEAD_STATUS_META.won.label).toBe("נסגר בהצלחה");
    expect(LEAD_STATUS_META.won.tone).toBe("value");
    expect(LEAD_STATUS_META.lost.tone).toBe("danger");
  });

  it("the META maps cover the data layer's status vocabularies exactly", () => {
    // Display parity: every wire status the data layer can send has a Hebrew
    // label, and no phantom stage is displayed that the wire can't produce.
    expect(Object.keys(LEAD_STATUS_META).sort()).toEqual([...LEAD_STATUSES].sort());
    expect(Object.keys(MEETING_STATUS_META).sort()).toEqual([...MEETING_STATUSES].sort());
    expect(Object.keys(CONTACT_STATUS_META).sort()).toEqual([...CONTACT_STATUSES].sort());
  });

  it("StatusPill shows the Hebrew label for a known status and the raw text otherwise", () => {
    const { rerender } = render(<StatusPill status="new" />);
    expect(screen.getByText("חדש")).toBeInTheDocument();
    rerender(<StatusPill status="mystery" />);
    expect(screen.getByText("mystery")).toBeInTheDocument();
  });

  it("ConversationStatusPill maps the bot/human lifecycle", () => {
    expect(CONVERSATION_STATUS_META.bot.label).toBe("בוט");
    render(<ConversationStatusPill status="human" />);
    expect(screen.getByText("נציג")).toBeInTheDocument();
  });

  it("MEETING_STATUS_META covers the booking lifecycle with the right tones", () => {
    expect(Object.keys(MEETING_STATUS_META).sort()).toEqual(
      ["cancelled", "completed", "confirmed", "expired", "no_rep", "pending"],
    );
    expect(MEETING_STATUS_META.completed.tone).toBe("value");
    expect(MEETING_STATUS_META.confirmed.tone).toBe("info");
    expect(MEETING_STATUS_META.no_rep.tone).toBe("danger");
  });

  it("MeetingStatusPill shows the Hebrew label for a known status and raw text otherwise", () => {
    const { rerender } = render(<MeetingStatusPill status="confirmed" />);
    expect(screen.getByText("מאושר")).toBeInTheDocument();
    rerender(<MeetingStatusPill status="mystery" />);
    expect(screen.getByText("mystery")).toBeInTheDocument();
  });

  it("CONTACT_STATUS_META covers the seven-stage contact lifecycle", () => {
    expect(Object.keys(CONTACT_STATUS_META).sort()).toEqual(
      ["active", "blocked", "handed_off", "lost", "new", "qualified", "won"],
    );
    expect(CONTACT_STATUS_META.won.tone).toBe("value");
    expect(CONTACT_STATUS_META.blocked.tone).toBe("danger");
  });

  it("ContactStatusPill shows the Hebrew label for a known status and raw text otherwise", () => {
    const { rerender } = render(<ContactStatusPill status="qualified" />);
    expect(screen.getByText("מוכשר")).toBeInTheDocument();
    rerender(<ContactStatusPill status="mystery" />);
    expect(screen.getByText("mystery")).toBeInTheDocument();
  });
});

describe("LeadAgeChip", () => {
  const iso = "2026-07-12T10:00:00Z";
  const t0 = Date.parse(iso);

  it("renders nothing before a clock sample or without a createdAt", () => {
    const a = render(<LeadAgeChip createdAt={iso} nowMs={0} slaHours={4} />);
    expect(a.container).toBeEmptyDOMElement();
    const b = render(<LeadAgeChip createdAt={null} nowMs={t0} slaHours={4} />);
    expect(b.container).toBeEmptyDOMElement();
  });

  it("shows the relative age within the SLA window (no breach tag)", () => {
    render(<LeadAgeChip createdAt={iso} nowMs={t0 + 2 * 3_600_000} slaHours={4} />);
    const chip = screen.getByText("לפני 2 שע׳");
    expect(chip.textContent).not.toContain("SLA");
  });

  it("flips to an SLA-breach chip past the server's slaHours", () => {
    render(<LeadAgeChip createdAt={iso} nowMs={t0 + 5 * 3_600_000} slaHours={4} />);
    expect(screen.getByText(/לפני 5 שע׳ · SLA/)).toBeInTheDocument();
  });

  it("without a known slaHours it shows the age but never claims a breach", () => {
    render(<LeadAgeChip createdAt={iso} nowMs={t0 + 99 * 3_600_000} slaHours={null} />);
    expect(screen.getByText(/לפני/).textContent).not.toContain("SLA");
  });
});

describe("StatCard", () => {
  it("renders a plain card without onClick and a real button with it", () => {
    const { rerender } = render(<StatCard label="לידים" value="12" />);
    expect(screen.queryByRole("button")).toBeNull();
    const onClick = vi.fn();
    rerender(<StatCard label="לידים" value="12" onClick={onClick} />);
    fireEvent.click(screen.getByRole("button"));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});

describe("ErrorNotice", () => {
  it("shows the server failure's Hebrew message with a retry when retryable", () => {
    const onRetry = vi.fn();
    render(
      <ErrorNotice
        failure={{ status: 500, message: "הבקשה נכשלה: db down", retryable: true }}
        fallback="לא הצלחנו לטעון."
        onRetry={onRetry}
      />,
    );
    expect(screen.getByText("הבקשה נכשלה: db down")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "נסו שוב" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("suppresses the retry button on a non-retryable (401/403) failure", () => {
    render(
      <ErrorNotice
        failure={{ status: 403, message: "אין לך הרשאה לפעולה הזו.", retryable: false }}
        fallback="לא הצלחנו לטעון."
        onRetry={() => {}}
      />,
    );
    expect(screen.getByText("אין לך הרשאה לפעולה הזו.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "נסו שוב" })).toBeNull();
  });

  it("falls back to the generic message without a typed failure", () => {
    render(<ErrorNotice fallback="לא הצלחנו לטעון." onRetry={() => {}} />);
    expect(screen.getByText("לא הצלחנו לטעון.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "נסו שוב" })).toBeInTheDocument();
  });
});

describe("mirrorUrlParams", () => {
  it("sets, preserves and deletes params via shallow replaceState", () => {
    window.history.replaceState(null, "", "/?tab=leads&other=1");
    mirrorUrlParams({ lead_status: "new" });
    expect(window.location.search).toBe("?tab=leads&other=1&lead_status=new");
    mirrorUrlParams({ lead_status: null, lead_q: "דנה" });
    const qs = new URLSearchParams(window.location.search);
    expect(qs.get("lead_status")).toBeNull();
    expect(qs.get("lead_q")).toBe("דנה");
    expect(qs.get("tab")).toBe("leads"); // untouched keys preserved
    mirrorUrlParams({ lead_q: "" }); // "" deletes like null
    expect(new URLSearchParams(window.location.search).get("lead_q")).toBeNull();
    window.history.replaceState(null, "", "/");
  });
});
