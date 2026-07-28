// Component tests for <CrmTeam> — the "צוות והרשאות" surface, the ONE place in
// the console that changes who can get into the CRM at all. Every write here is
// a security event (it is audited server-side), so these tests pin the argument
// pair that goes on the wire, not merely that a write happened:
//
//  · setCrmMemberRole(uid, role) must carry THAT row's uid and THAT button's
//    role. A mock asserted with "was called" passes when the handler closes over
//    the wrong member or hardcodes a role — granting `rep` to the wrong person,
//    or revoking the wrong account, both of which look identical on screen.
//  · Revoking is a deliberate two-step inline confirm keyed on the member's uid.
//    Nothing may be written on the first click, the arming must not leak into
//    another member's row, and the pending confirmation must lapse by itself
//    after 5s so a walked-away-from screen can't be revoked by a stray click.
//  · A refused write must SAY so. changeRole only reloads on success; if the
//    failure branch ever stopped surfacing its notice (or started reloading),
//    the roster would re-render unchanged and read as "nothing happened" —
//    an admin would believe access was revoked when it never was.
//  · The grant form validates the uid client-side, so a typo can never be sent
//    as a role grant, and a failed grant must not clear the field or claim
//    success.
//  · Loading must not be rendered as an error: `members` is null both while
//    loading and after a failure, so ordering the branches wrongly shows
//    "לא הצלחנו לטעון" on every mount.
//
// crm-admin is mocked at the module boundary (importOriginal spread, so the real
// types/helpers survive) — no network, no auth, and the REAL component logic.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { CrmMember } from "@/lib/crm-admin";

const mocks = vi.hoisted(() => ({
  fetchMembers: vi.fn(),
  setCrmMemberRole: vi.fn(),
}));

vi.mock("@/lib/crm-admin", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/crm-admin")>();
  return { ...actual, fetchMembers: mocks.fetchMembers, setCrmMemberRole: mocks.setCrmMemberRole };
});

import CrmTeam from "@/components/crm/CrmTeam";

// Two members with DIFFERENT roles and DIFFERENT uids: a handler that grabs the
// wrong row, or a role that is hardcoded, cannot hide behind a one-member table.
const DANA = "11111111-1111-4111-8111-111111111111";
const NOA = "22222222-2222-4222-8222-222222222222";

function member(uid: string, over: Partial<CrmMember> = {}): CrmMember {
  return {
    uid,
    role: "viewer",
    name: "דנה כהן",
    email: "dana@example.com",
    grantedAt: "2026-07-01T08:00:00Z",
    ...over,
  };
}

const ROSTER = {
  members: [member(DANA), member(NOA, { role: "rep", name: "נועה לוי", email: "noa@example.com" })],
};

// A member's row, located by the uid printed in it — the same anchor an auditor
// would use to check that the right account was touched.
function row(uid: string) {
  return within(screen.getByText(uid).closest("tr") as HTMLElement);
}

// The always-mounted polite live region the outcome notices land in.
function notice() {
  return screen.getByRole("status");
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.fetchMembers.mockResolvedValue(ROSTER);
  mocks.setCrmMemberRole.mockResolvedValue(true);
});

describe("CrmTeam roster", () => {
  it("lists every graded member with their Hebrew role, email and uid", async () => {
    render(<CrmTeam />);

    expect(await screen.findByText("דנה כהן")).toBeInTheDocument();
    expect(row(DANA).getByText("צופה")).toBeInTheDocument();
    expect(row(DANA).getByText("dana@example.com")).toBeInTheDocument();

    expect(screen.getByText("נועה לוי")).toBeInTheDocument();
    expect(row(NOA).getByText("נציג")).toBeInTheDocument();
  });

  it("offers only the role a member does not already hold", async () => {
    render(<CrmTeam />);
    await screen.findByText("דנה כהן");

    // A viewer can be promoted to נציג and nothing else; a rep demoted to צופה.
    expect(row(DANA).getByRole("button", { name: "→ נציג" })).toBeInTheDocument();
    expect(row(DANA).queryByRole("button", { name: "→ צופה" })).toBeNull();
    expect(row(NOA).getByRole("button", { name: "→ צופה" })).toBeInTheDocument();
    expect(row(NOA).queryByRole("button", { name: "→ נציג" })).toBeNull();
  });

  it("shows a skeleton while loading — never the failure notice", async () => {
    let settle!: (v: { members: CrmMember[] }) => void;
    mocks.fetchMembers.mockReturnValue(
      new Promise<{ members: CrmMember[] }>((r) => {
        settle = r;
      }),
    );
    const { container } = render(<CrmTeam />);

    // members is null while loading AND after a failure — the pending state must
    // not be reported as a broken one.
    expect(container.querySelector('div[aria-hidden="true"]')).not.toBeNull();
    expect(screen.queryByText("לא הצלחנו לטעון את חברי הצוות.")).toBeNull();
    expect(screen.queryByText(/אין עדיין חברי צוות/)).toBeNull();

    await act(async () => settle(ROSTER));
    expect(await screen.findByText("דנה כהן")).toBeInTheDocument();
    expect(container.querySelector('div[aria-hidden="true"]')).toBeNull();
  });

  it("a failed roster load says so and the retry re-fetches", async () => {
    mocks.fetchMembers.mockResolvedValueOnce(null);
    render(<CrmTeam />);

    expect(await screen.findByText("לא הצלחנו לטעון את חברי הצוות.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "נסו שוב" }));

    expect(await screen.findByText("דנה כהן")).toBeInTheDocument();
    expect(mocks.fetchMembers).toHaveBeenCalledTimes(2);
  });

  it("an empty roster is an empty state, not a failure", async () => {
    mocks.fetchMembers.mockResolvedValue({ members: [] });
    render(<CrmTeam />);

    expect(await screen.findByText(/אין עדיין חברי צוות עם תפקיד מדורג/)).toBeInTheDocument();
    expect(screen.queryByText("לא הצלחנו לטעון את חברי הצוות.")).toBeNull();
  });
});

describe("CrmTeam role changes", () => {
  it("promotes THAT member to THAT role — the exact uid + role go on the wire", async () => {
    render(<CrmTeam />);
    await screen.findByText("דנה כהן");

    await userEvent.click(row(DANA).getByRole("button", { name: "→ נציג" }));

    await waitFor(() => expect(mocks.setCrmMemberRole).toHaveBeenCalledTimes(1));
    expect(mocks.setCrmMemberRole).toHaveBeenCalledWith(DANA, "rep");
    // …and emphatically not the other member sharing the table.
    expect(mocks.setCrmMemberRole).not.toHaveBeenCalledWith(NOA, "rep");
    // A successful change re-reads the roster (mount + reload).
    await waitFor(() => expect(mocks.fetchMembers).toHaveBeenCalledTimes(2));
  });

  it("demotes a rep with role 'viewer', not with the role of the row above it", async () => {
    render(<CrmTeam />);
    await screen.findByText("נועה לוי");

    await userEvent.click(row(NOA).getByRole("button", { name: "→ צופה" }));

    await waitFor(() => expect(mocks.setCrmMemberRole).toHaveBeenCalledTimes(1));
    expect(mocks.setCrmMemberRole).toHaveBeenCalledWith(NOA, "viewer");
  });

  it("a refused role change surfaces the failure and does not reload as if it worked", async () => {
    mocks.setCrmMemberRole.mockResolvedValue(false);
    render(<CrmTeam />);
    await screen.findByText("דנה כהן");

    await userEvent.click(row(DANA).getByRole("button", { name: "→ נציג" }));

    expect(await within(notice()).findByText("עדכון ההרשאה נכשל.")).toBeInTheDocument();
    // The roster is NOT re-read (a reload would repaint the row and read as a win)
    // and the member visibly still holds the old role.
    expect(mocks.fetchMembers).toHaveBeenCalledTimes(1);
    expect(row(DANA).getByText("צופה")).toBeInTheDocument();
  });
});

describe("CrmTeam revoke guard", () => {
  // Driven from the SECOND row on purpose. Revoking is the destructive path, and
  // "confirm revokes whoever is first in the roster" (a handler closing over
  // members[0] instead of the mapped row) is indistinguishable on screen — a test
  // that only ever confirms on the first member passes straight through it.
  it("is two-step: the first click writes nothing, the confirming click revokes THAT member", async () => {
    render(<CrmTeam />);
    await screen.findByText("נועה לוי");

    await userEvent.click(row(NOA).getByRole("button", { name: "ביטול" }));
    expect(mocks.setCrmMemberRole).not.toHaveBeenCalled();

    await userEvent.click(row(NOA).getByRole("button", { name: "לאשר ביטול?" }));
    await waitFor(() => expect(mocks.setCrmMemberRole).toHaveBeenCalledTimes(1));
    expect(mocks.setCrmMemberRole).toHaveBeenCalledWith(NOA, "none");
    // The other member in the table keeps their access.
    expect(mocks.setCrmMemberRole).not.toHaveBeenCalledWith(DANA, "none");
  });

  it("arming a revoke on one member does not arm anybody else's", async () => {
    render(<CrmTeam />);
    await screen.findByText("דנה כהן");

    await userEvent.click(row(DANA).getByRole("button", { name: "ביטול" }));

    expect(row(DANA).getByRole("button", { name: "לאשר ביטול?" })).toBeInTheDocument();
    expect(row(NOA).queryByRole("button", { name: "לאשר ביטול?" })).toBeNull();
    expect(row(NOA).getByRole("button", { name: "ביטול" })).toBeInTheDocument();
  });

  it("'חזרה' stands the revoke down without touching access", async () => {
    render(<CrmTeam />);
    await screen.findByText("דנה כהן");

    await userEvent.click(row(DANA).getByRole("button", { name: "ביטול" }));
    await userEvent.click(row(DANA).getByRole("button", { name: "חזרה" }));

    expect(row(DANA).getByRole("button", { name: "ביטול" })).toBeInTheDocument();
    expect(row(DANA).queryByRole("button", { name: "לאשר ביטול?" })).toBeNull();
    expect(mocks.setCrmMemberRole).not.toHaveBeenCalled();
  });

  it("a pending revoke lapses by itself after five seconds", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      render(<CrmTeam />);
      await screen.findByText("דנה כהן");

      fireEvent.click(row(DANA).getByRole("button", { name: "ביטול" }));
      expect(row(DANA).getByRole("button", { name: "לאשר ביטול?" })).toBeInTheDocument();

      await act(async () => {
        vi.advanceTimersByTime(5000);
      });

      // Left alone, the armed confirmation disarms — a later stray click on the
      // same spot must not be the second half of a revoke.
      expect(row(DANA).queryByRole("button", { name: "לאשר ביטול?" })).toBeNull();
      expect(row(DANA).getByRole("button", { name: "ביטול" })).toBeInTheDocument();
      expect(mocks.setCrmMemberRole).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("CrmTeam grant form", () => {
  it("refuses a malformed uid client-side — nothing reaches the server", async () => {
    render(<CrmTeam />);
    await screen.findByText("דנה כהן");

    fireEvent.change(screen.getByLabelText(/מזהה משתמש/), { target: { value: "1111-2222" } });
    await userEvent.click(screen.getByRole("button", { name: "הענק" }));

    expect(await within(notice()).findByText(/אינו UUID תקין/)).toBeInTheDocument();
    expect(mocks.setCrmMemberRole).not.toHaveBeenCalled();
  });

  it("grants the typed uid the selected role, then clears the field", async () => {
    render(<CrmTeam />);
    await screen.findByText("דנה כהן");

    const uid = "33333333-3333-4333-8333-333333333333";
    const field = screen.getByLabelText(/מזהה משתמש/) as HTMLInputElement;
    fireEvent.change(field, { target: { value: uid } });
    await userEvent.selectOptions(screen.getByLabelText("תפקיד"), "rep");
    await userEvent.click(screen.getByRole("button", { name: "הענק" }));

    await waitFor(() => expect(mocks.setCrmMemberRole).toHaveBeenCalledTimes(1));
    // The pair that actually grants access: the uid as typed, the role as chosen.
    expect(mocks.setCrmMemberRole).toHaveBeenCalledWith(uid, "rep");
    expect(await within(notice()).findByText("התפקיד הוענק.")).toBeInTheDocument();
    expect(field.value).toBe("");
  });

  it("a refused grant says so and keeps the uid in the box", async () => {
    mocks.setCrmMemberRole.mockResolvedValue(false);
    render(<CrmTeam />);
    await screen.findByText("דנה כהן");

    const uid = "44444444-4444-4444-8444-444444444444";
    const field = screen.getByLabelText(/מזהה משתמש/) as HTMLInputElement;
    fireEvent.change(field, { target: { value: uid } });
    await userEvent.click(screen.getByRole("button", { name: "הענק" }));

    expect(await within(notice()).findByText(/הענקת התפקיד נכשלה/)).toBeInTheDocument();
    expect(within(notice()).queryByText("התפקיד הוענק.")).toBeNull();
    expect(field.value).toBe(uid);
  });
});
