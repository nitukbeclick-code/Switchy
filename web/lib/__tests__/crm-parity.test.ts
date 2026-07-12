// Vocabulary-parity tests: the browser data layer (web/lib/crm-admin.ts) mirrors
// the server's validation vocabulary (supabase/functions/crm-api/crm_logic.ts).
// The server file is imported DIRECTLY (it is pure, dependency-free TS — the
// whole point of its extraction), so any drift — a stage added server-side, a
// status renamed, a narrowing helper disagreeing with the validator — fails here
// at test time instead of surfacing as a silent 400 in production.

import { describe, expect, it } from "vitest";
import {
  CONTACT_STATUSES,
  CONVERSATION_STATUSES,
  isLeadStatus,
  isMeetingStatus,
  LEAD_STATUSES,
  MEETING_STATUSES,
} from "@/lib/crm-admin";
import * as logic from "../../../supabase/functions/crm-api/crm_logic";

const sorted = (xs: Iterable<string>) => [...xs].sort();

describe("crm-admin ↔ crm_logic vocabulary parity", () => {
  it("lead pipeline stages match the server's LEAD_STATUSES exactly", () => {
    expect(sorted(LEAD_STATUSES)).toEqual(sorted(logic.LEAD_STATUSES));
  });

  it("meeting lifecycle matches the server's MEETING_STATUSES exactly", () => {
    expect(sorted(MEETING_STATUSES)).toEqual(sorted(logic.MEETING_STATUSES));
  });

  it("contact lifecycle matches the server's CONTACT_STATUSES exactly", () => {
    expect(sorted(CONTACT_STATUSES)).toEqual(sorted(logic.CONTACT_STATUSES));
  });

  it("conversation statuses match the server's CONVERSATION_STATUSES exactly", () => {
    expect(sorted(CONVERSATION_STATUSES)).toEqual(sorted(logic.CONVERSATION_STATUSES));
  });

  it("isLeadStatus agrees with the server validator over a probe set", () => {
    const probes = [...LEAD_STATUSES, ...MEETING_STATUSES, ...CONTACT_STATUSES, "", "bogus", "WON"];
    for (const p of probes) {
      expect(isLeadStatus(p), `isLeadStatus("${p}")`).toBe(logic.isValidLeadStatus(p));
    }
  });

  it("isMeetingStatus agrees with the server validator over a probe set", () => {
    const probes = [...MEETING_STATUSES, ...LEAD_STATUSES, "", "bogus", "CONFIRMED"];
    for (const p of probes) {
      expect(isMeetingStatus(p), `isMeetingStatus("${p}")`).toBe(logic.isValidMeetingStatus(p));
    }
  });

  it("the drawer's main-note maxLength mirrors the server's MAX_NOTE_LEN cap", () => {
    // CrmLeadDrawer's <textarea maxLength={5000}> must stay in lockstep with the
    // server-side clamp — a longer client cap would silently truncate on save.
    expect(logic.MAX_NOTE_LEN).toBe(5000);
  });
});
