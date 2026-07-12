// Component test for <CrmInbox> — the crm_events live-refresh gate. crm-api's
// getThread writes a `crm_thread_view` Reg.13 audit row on EVERY call, and the
// inbox subscribes to ALL crm_events inserts (inbound, bot outbound, other
// conversations). Re-fetching the OPEN thread on every unrelated burst would mint
// a spurious audit row per background event. The fix: the conversation LIST still
// refreshes on any burst, but the open THREAD is only re-fetched when the burst's
// conversationIds actually include the open conversation. The crm-admin data layer
// and the realtime hook are mocked at the module boundary.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { CrmConversation, CrmThread } from "@/lib/crm-admin";

type Batch = { conversationIds: Set<string> };

const mocks = vi.hoisted(() => ({
  fetchCrmConversations: vi.fn(),
  fetchCrmThread: vi.fn(),
}));

// Capture the callback the component registers with useCrmEvents so the test can
// fire synthetic bursts. The mocked hook records the latest closure on each render.
const holder = vi.hoisted(() => ({ cb: null as null | ((b: Batch) => void) }));

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(window.location.search),
}));

vi.mock("@/lib/use-crm-events", () => ({
  useCrmEvents: (cb: (b: Batch) => void) => {
    holder.cb = cb;
  },
}));

vi.mock("@/lib/auth-context", () => ({ useAuth: () => ({ profile: null }) }));

vi.mock("@/lib/crm-admin", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/crm-admin")>();
  return {
    ...actual,
    fetchCrmConversations: mocks.fetchCrmConversations,
    fetchCrmThread: mocks.fetchCrmThread,
  };
});

vi.mock("@/components/crm/CrmLeadDrawer", () => ({ default: () => null }));

import CrmInbox from "@/components/crm/CrmInbox";

function conv(id: string): CrmConversation {
  return {
    conversationId: id,
    contactId: `contact-${id}`,
    name: `שיחה ${id}`,
    phone: `0500000${id}`,
    status: "bot",
    intent: null,
    lastSnippet: "שלום",
    lastAt: "2026-07-12T08:00:00Z",
    leadStatus: null,
  };
}

function thread(id: string): CrmThread {
  return {
    contact: {
      id: `contact-${id}`,
      name: `שיחה ${id}`,
      phone: `0500000${id}`,
      status: "active",
      leadId: null,
      leadStatus: null,
    },
    messages: [{ id: `m-${id}`, direction: "in", actor: "customer", body: "שלום", createdAt: "2026-07-12T08:00:00Z" }],
  };
}

// jsdom doesn't implement scrollIntoView; the thread's near-bottom autoscroll
// effect calls it whenever the thread updates. Stub it so those effects no-op.
beforeEach(() => {
  vi.clearAllMocks();
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
  window.history.replaceState(null, "", "/");
  holder.cb = null;
  mocks.fetchCrmConversations.mockResolvedValue({
    data: { conversations: [conv("c1"), conv("c2")] },
    failure: null,
  });
  mocks.fetchCrmThread.mockResolvedValue({ data: thread("c1"), failure: null });
});

describe("CrmInbox crm_events gate", () => {
  it("re-fetches the open thread only when the burst touched THIS conversation", async () => {
    render(<CrmInbox />);

    // Open conversation c1 → its thread loads once.
    fireEvent.click(await screen.findByText("שיחה c1"));
    await waitFor(() => expect(mocks.fetchCrmThread).toHaveBeenCalledWith("c1"));

    mocks.fetchCrmThread.mockClear();
    mocks.fetchCrmConversations.mockClear();

    // A background burst for ANOTHER conversation: the list refreshes, but the
    // open thread is NOT re-fetched (no spurious crm_thread_view audit row).
    await act(async () => {
      holder.cb?.({ conversationIds: new Set(["c2"]) });
    });
    expect(mocks.fetchCrmConversations).toHaveBeenCalled();
    expect(mocks.fetchCrmThread).not.toHaveBeenCalled();

    // A burst that DOES touch the open conversation → the thread is re-fetched.
    await act(async () => {
      holder.cb?.({ conversationIds: new Set(["c1"]) });
    });
    await waitFor(() => expect(mocks.fetchCrmThread).toHaveBeenCalledWith("c1"));
  });

  it("does not re-fetch any thread for a burst with no conversation ids (e.g. contact-status)", async () => {
    render(<CrmInbox />);

    fireEvent.click(await screen.findByText("שיחה c1"));
    await waitFor(() => expect(mocks.fetchCrmThread).toHaveBeenCalledWith("c1"));
    mocks.fetchCrmThread.mockClear();

    await act(async () => {
      holder.cb?.({ conversationIds: new Set() });
    });
    expect(mocks.fetchCrmThread).not.toHaveBeenCalled();
  });
});
