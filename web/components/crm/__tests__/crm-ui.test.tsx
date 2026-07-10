// Unit tests for the shared CRM-console UI helpers — the date formatter and the
// lead/conversation status metadata + pills. Pure/presentational, so they pin the
// contract (Hebrew labels, null-safe dates, graceful fallback for unknown values)
// without any network or auth.

import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  CONVERSATION_STATUS_META,
  ConversationStatusPill,
  LEAD_STATUS_META,
  StatusPill,
  when,
} from "@/components/crm/ui";

describe("CRM ui helpers", () => {
  it("when() is null-safe and rejects bad dates", () => {
    expect(when(null)).toBe("");
    expect(when(undefined)).toBe("");
    expect(when("")).toBe("");
    expect(when("not-a-date")).toBe("");
    expect(when("2026-07-01T10:00:00Z")).not.toBe(""); // a real he-IL string
  });

  it("LEAD_STATUS_META covers exactly the four pipeline stages", () => {
    expect(Object.keys(LEAD_STATUS_META).sort()).toEqual(["contacted", "lost", "new", "won"]);
    expect(LEAD_STATUS_META.won.label).toBe("נסגר בהצלחה");
    expect(LEAD_STATUS_META.won.tone).toBe("value");
    expect(LEAD_STATUS_META.lost.tone).toBe("danger");
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
});
