// Component tests for <CrmAnalytics> — the owner observability panel. Every
// number on this screen is DERIVED (a ratio, a percentage, a sorted rank), and
// an operator makes calls on those numbers. A wrong denominator does not crash
// and does not look broken; it renders a plausible, false figure.
//
// THE DEFECTS THESE PIN:
//
//  1. Division by an empty denominator. Three places divide: the agent
//     tool-call success rate (ok/total), each funnel conversion (to/from) and
//     the sparkline's x-step (i/(len-1)). A zero denominator in any of them
//     yields NaN or Infinity — which React renders happily, as text, into a
//     dashboard. The panel's contract is: a rate with NO sample shows "—", a
//     funnel pair whose FROM stage never fired is DROPPED (not shown as 0%),
//     and a one-point series draws no line. Nothing but rendering the all-zero
//     window catches this, because the populated window — the one a developer
//     looks at — is the one that would still look right.
//  2. A rate divided by the WRONG denominator. `50 מתוך 200` is 25%; the same
//     50 over the window total (271 events) is 18%. Both render. Only an
//     assertion on the exact percentage, with the two denominators deliberately
//     different in the fixture, can tell them apart.
//  3. An honest 0% turned into a dash. The inverse of (1): four calls and zero
//     successes IS 0% and must say so — a dash there hides a broken tool.
//  4. The window control fetching the wrong window. The chips are the only
//     thing that changes what is fetched, so the day count they pass is
//     asserted exactly (toHaveBeenCalledWith / the whole calls array), never
//     merely "was called". Re-clicking the active chip must not refetch, and a
//     slow response from an ABANDONED window must not overwrite the newer one
//     (the sequence guard) — a stale 7-day payload silently replacing the
//     90-day view is the worst kind of wrong number: a real one, mislabelled.
//  5. The retry retrying a different window than the one that failed.
//  6. The leaderboard being lifetime-to-date and best-effort: switching windows
//     must not refetch it, and its failure must degrade to a notice instead of
//     blanking the metrics panel.
//  7. The leaderboard's sort — the default (biggest recorded saving first) and
//     the header's aria-sort, which is what a screen-reader user reads as the
//     ranking.
//
// The data layer (@/lib/crm-admin) is mocked at the MODULE BOUNDARY — no
// network, no supabase session, no global fetch stubbing. ./ui stays real, so
// the StatCard/NoticeCard markup asserted here is the real markup.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AdminMetrics, MetricRate, RepStat } from "@/lib/crm-admin";

const mocks = vi.hoisted(() => ({
  fetchAdminMetrics: vi.fn(),
  fetchRepLeaderboard: vi.fn(),
}));

vi.mock("@/lib/crm-admin", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/crm-admin")>();
  return {
    ...actual,
    fetchAdminMetrics: mocks.fetchAdminMetrics,
    fetchRepLeaderboard: mocks.fetchRepLeaderboard,
  };
});

import CrmAnalytics from "@/components/crm/CrmAnalytics";

// ── fixtures ────────────────────────────────────────────────────────────────

/** An all-zero window: the shape the server really returns for a quiet period. */
function metrics(over: Partial<AdminMetrics> = {}): AdminMetrics {
  return {
    ok: true,
    window: { days: 7, since: "2026-07-20T00:00:00Z" },
    analytics: { events: [], total: 0 },
    toolCalls: { total: 0, ok: 0, rate: 0, byTool: [], byChannel: [] },
    audit: { total: 0, byEvent: [] },
    cron: { ok: true, known: 0, stale: [], failing: [] },
    ...over,
  };
}

/** One funnel event series. `days` defaults to a two-point series so the
 *  decorative sparkline renders (a one-point series is its own test). */
function series(event: string, total: number, dayCounts: number[] = [1, 2]) {
  return {
    event,
    total,
    days: dayCounts.map((events, i) => ({ day: `2026-07-2${i}`, events })),
  };
}

function rate(key: string, calls: number, ok: number): MetricRate {
  return { key, calls, ok, rate: calls > 0 ? ok / calls : 0 };
}

const REPS: RepStat[] = [
  { rep: "אבי", claimed: 10, won: 2, lost: 1, totalSaving: 500 },
  { rep: "בתיה", claimed: 3, won: 5, lost: 0, totalSaving: 1200 },
  { rep: "גדי", claimed: 7, won: 1, lost: 4, totalSaving: 100 },
];

// ── helpers ─────────────────────────────────────────────────────────────────

/** The StatCard box holding `label` (label <p> and value <p> are siblings).
 *  Scoped to the <p> because "הצלחת כלי הסוכן" is ALSO a section heading. */
function stat(label: string): HTMLElement {
  return screen.getByText(label, { selector: "p" }).parentElement as HTMLElement;
}

/** The <Bar> row carrying `label` — label span and suffix span are siblings. */
function bar(label: string | RegExp): HTMLElement {
  return screen.getByText(label).parentElement as HTMLElement;
}

function section(heading: string): HTMLElement {
  return screen.getByRole("heading", { name: heading }).closest("section") as HTMLElement;
}

/** The leaderboard's data rows, first cell (rep name) per row, in DOM order. */
function repOrder(): string[] {
  const body = screen.getByRole("table").querySelector("tbody") as HTMLElement;
  return within(body)
    .getAllByRole("row")
    .map((r) => (r as HTMLTableRowElement).cells[0].textContent ?? "");
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.fetchAdminMetrics.mockResolvedValue(metrics());
  mocks.fetchRepLeaderboard.mockResolvedValue({ reps: REPS, sampled: 3, capped: false });
});

// ── zero / empty data ───────────────────────────────────────────────────────

describe("CrmAnalytics empty window", () => {
  it("renders honest zeros and a dash — never NaN, Infinity or a fabricated 0%", async () => {
    mocks.fetchRepLeaderboard.mockResolvedValue({ reps: [], sampled: 0, capped: false });
    const { container } = render(<CrmAnalytics />);

    // No sample ⇒ no rate. "0%" here would read as "every agent tool failed".
    await waitFor(() => expect(within(stat("הצלחת כלי הסוכן")).getByText("—")).toBeInTheDocument());
    expect(within(stat("הצלחת כלי הסוכן")).queryByText("0%")).toBeNull();
    expect(within(stat("הצלחת כלי הסוכן")).getByText("0/0")).toBeInTheDocument();

    expect(within(stat("אירועי משפך")).getByText("0")).toBeInTheDocument();
    expect(within(stat("פעולות ניהול")).getByText("0")).toBeInTheDocument();

    // Each empty section says so in Hebrew instead of drawing an empty chart.
    expect(screen.getByText("אין עדיין נתוני פעילות בחלון הזה.")).toBeInTheDocument();
    expect(screen.getAllByText("אין נתונים בחלון הזה.")).toHaveLength(2);
    expect(screen.getByText("אין פעולות בחלון הזה.")).toBeInTheDocument();

    // Not one derived number degenerated — text AND svg point attributes.
    expect(container.innerHTML).not.toMatch(/NaN|Infinity/);
  });

  it("an empty leaderboard renders no table at all", async () => {
    mocks.fetchRepLeaderboard.mockResolvedValue({ reps: [], sampled: 0, capped: false });
    render(<CrmAnalytics />);

    await screen.findByText("אין עדיין נתוני פעילות בחלון הזה.");
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.queryByText("לוח מובילים — נציגים")).toBeNull();
  });

  it("shows 0% — not a dash — when the agent really did fail every call", async () => {
    mocks.fetchAdminMetrics.mockResolvedValue(
      metrics({ toolCalls: { total: 4, ok: 0, rate: 0, byTool: [], byChannel: [] } }),
    );
    render(<CrmAnalytics />);

    // A denominator of 4 means the 0 is a measurement, not an absence.
    await waitFor(() => expect(within(stat("הצלחת כלי הסוכן")).getByText("0%")).toBeInTheDocument());
    expect(within(stat("הצלחת כלי הסוכן")).queryByText("—")).toBeNull();
    expect(within(stat("הצלחת כלי הסוכן")).getByText("0/4")).toBeInTheDocument();
  });
});

// ── derived rates: the denominator ──────────────────────────────────────────

describe("CrmAnalytics funnel conversions", () => {
  it("divides each conversion by its own FROM stage, not by the window total", async () => {
    // The window total (271) is deliberately unequal to every stage count, so a
    // conversion computed against it renders a DIFFERENT, plausible percentage.
    mocks.fetchAdminMetrics.mockResolvedValue(
      metrics({
        analytics: {
          total: 271,
          events: [
            series("compareView", 200),
            series("shortlistCreate", 50),
            series("shortlistLeadClick", 10),
            series("leadStart", 8),
            series("leadSubmit", 2),
            series("meetingRequest", 1),
          ],
        },
      }),
    );
    render(<CrmAnalytics />);

    const pair = await screen.findByText("השוואה ← בחירת מסלול");
    expect(within(pair).getByText("25%")).toBeInTheDocument(); // 50/200 — over 271 it would read 18%
    // The tooltip states the fraction the percentage came from.
    expect(pair.getAttribute("title")).toBe("50 מתוך 200");

    expect(within(screen.getByText("בחירה ← בקשת המלצה")).getByText("20%")).toBeInTheDocument(); // 10/50
    expect(within(screen.getByText("בקשת המלצה ← התחלת טופס")).getByText("80%")).toBeInTheDocument(); // 8/10
    expect(within(screen.getByText("התחלת ליד ← שליחה")).getByText("25%")).toBeInTheDocument(); // 2/8
    expect(within(screen.getByText("שליחה ← בקשת פגישה")).getByText("50%")).toBeInTheDocument(); // 1/2
  });

  it("drops a pair whose FROM stage never fired instead of rendering 0% or NaN", async () => {
    // Only the tail of the funnel has data: the first three pairs all divide by 0.
    mocks.fetchAdminMetrics.mockResolvedValue(
      metrics({
        analytics: { total: 14, events: [series("leadStart", 10), series("leadSubmit", 4)] },
      }),
    );
    const { container } = render(<CrmAnalytics />);

    await screen.findByText("התחלת ליד ← שליחה");
    // 10 forms started → 4 submitted, and 4 submitted → 0 meetings. Both are
    // measurements. The three pairs upstream of them are not, and are absent.
    expect(screen.getByText("שליחה ← בקשת פגישה")).toBeInTheDocument();
    expect(screen.queryByText("השוואה ← בחירת מסלול")).toBeNull();
    expect(screen.queryByText("בחירה ← בקשת המלצה")).toBeNull();
    expect(screen.queryByText("בקשת המלצה ← התחלת טופס")).toBeNull();
    // …and no pair rendered an em dash in place of a rate it could not compute.
    const pills = container.querySelectorAll("span[title]");
    expect(pills).toHaveLength(2);
    expect(container.innerHTML).not.toMatch(/NaN|Infinity/);
  });

  it("gives each tool its OWN success rate, not the panel-wide one", async () => {
    mocks.fetchAdminMetrics.mockResolvedValue(
      metrics({
        toolCalls: {
          total: 7,
          ok: 5,
          rate: 5 / 7, // 71% — the aggregate, which must not leak into the bars
          // Both breakdowns partition the SAME 7 calls / 5 ok, and not one of
          // their four rates is 71% — a bar that echoed the aggregate instead of
          // its own row would therefore have to render a visibly wrong number.
          byTool: [rate("searchPlans", 4, 2), rate("bookMeeting", 3, 3)],
          byChannel: [rate("whatsapp", 5, 4), rate("web", 2, 1)],
        },
      }),
    );
    render(<CrmAnalytics />);

    await waitFor(() => expect(within(stat("הצלחת כלי הסוכן")).getByText("71%")).toBeInTheDocument());
    expect(within(bar("searchPlans · 4")).getByText("50%")).toBeInTheDocument(); // 2/4
    expect(within(bar("bookMeeting · 3")).getByText("100%")).toBeInTheDocument(); // 3/3
    expect(within(bar("whatsapp · 5")).getByText("80%")).toBeInTheDocument(); // 4/5
    expect(within(bar("web · 2")).getByText("50%")).toBeInTheDocument(); // 1/2
    // The aggregate lives in the StatCard and nowhere else on this panel.
    expect(screen.getAllByText("71%")).toHaveLength(1);
  });

  it("draws no sparkline for a one-point series (its x-step would divide by zero)", async () => {
    mocks.fetchAdminMetrics.mockResolvedValue(
      metrics({ analytics: { total: 5, events: [series("appOpen", 5, [5])] } }),
    );
    const { container } = render(<CrmAnalytics />);

    await screen.findByText("פתיחות אפליקציה");
    expect(container.querySelector("polyline")).toBeNull();
    expect(container.innerHTML).not.toMatch(/NaN/);
  });
});

// ── loading / error ─────────────────────────────────────────────────────────

describe("CrmAnalytics loading and error states", () => {
  it("shows a decorative skeleton while the window is in flight, and no numbers", async () => {
    mocks.fetchAdminMetrics.mockReturnValue(new Promise(() => {}));
    const { container } = render(<CrmAnalytics />);

    const skeleton = container.querySelector(".animate-pulse") as HTMLElement;
    expect(skeleton).toBeTruthy();
    expect(skeleton.getAttribute("aria-hidden")).toBe("true");
    // Nothing derived is on screen yet — no half-rendered dashboard.
    expect(screen.queryByText("אירועי משפך")).toBeNull();
    expect(screen.queryByText("לא הצלחנו לטעון את הנתונים.")).toBeNull();

    // The lifetime leaderboard is a separate load — it arrives and renders while
    // the window itself is still in flight, and does not end the skeleton.
    expect(await screen.findByRole("table")).toBeInTheDocument();
    expect(container.querySelector(".animate-pulse")).toBeTruthy();
  });

  it("a failed load offers a retry that re-fetches the SAME window", async () => {
    mocks.fetchAdminMetrics.mockResolvedValueOnce(null).mockResolvedValue(metrics());
    render(<CrmAnalytics />);

    await screen.findByText("לא הצלחנו לטעון את הנתונים.");
    expect(screen.queryByText("אירועי משפך")).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: "נסו שוב" }));

    expect(await screen.findByText("אירועי משפך")).toBeInTheDocument();
    expect(screen.queryByText("לא הצלחנו לטעון את הנתונים.")).toBeNull();
    // Both calls asked for the mounted window — a retry that silently resets to
    // some other day count would show the operator a different period.
    expect(mocks.fetchAdminMetrics.mock.calls).toEqual([[7], [7]]);
  });

  it("a leaderboard failure degrades to a notice — the metrics panel still renders", async () => {
    mocks.fetchRepLeaderboard.mockResolvedValueOnce(null).mockResolvedValue({
      reps: REPS,
      sampled: 3,
      capped: false,
    });
    render(<CrmAnalytics />);

    await screen.findByText("לא הצלחנו לטעון את לוח המובילים.");
    expect(screen.queryByRole("table")).toBeNull();
    // The window's metrics are unaffected by the leaderboard's failure.
    expect(screen.getByText("אירועי משפך")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "נסו שוב" }));

    expect(await screen.findByRole("table")).toBeInTheDocument();
    expect(screen.queryByText("לא הצלחנו לטעון את לוח המובילים.")).toBeNull();
    expect(mocks.fetchRepLeaderboard).toHaveBeenCalledTimes(2);
  });
});

// ── the window control ──────────────────────────────────────────────────────

describe("CrmAnalytics time window", () => {
  it("fetches exactly the day count of the chip that was pressed", async () => {
    render(<CrmAnalytics />);
    await screen.findByText("אירועי משפך");

    await userEvent.click(screen.getByRole("button", { name: "30 ימים" }));
    await waitFor(() => expect(mocks.fetchAdminMetrics).toHaveBeenCalledWith(30));
    await userEvent.click(screen.getByRole("button", { name: "90 ימים" }));
    await waitFor(() => expect(mocks.fetchAdminMetrics).toHaveBeenCalledWith(90));

    expect(mocks.fetchAdminMetrics.mock.calls).toEqual([[7], [30], [90]]);
    // The pressed state is what tells the operator which period they are reading.
    expect(screen.getByRole("button", { name: "90 ימים" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "7 ימים" })).toHaveAttribute("aria-pressed", "false");
  });

  it("re-clicking the active window does not refetch it", async () => {
    render(<CrmAnalytics />);
    await screen.findByText("אירועי משפך");

    await userEvent.click(screen.getByRole("button", { name: "7 ימים" }));

    expect(mocks.fetchAdminMetrics.mock.calls).toEqual([[7]]);
    expect(screen.getByText("אירועי משפך")).toBeInTheDocument(); // never flipped back to the skeleton
  });

  it("a slow response from an abandoned window cannot overwrite the newer one", async () => {
    const slow7 = deferred<AdminMetrics | null>();
    const fast90 = deferred<AdminMetrics | null>();
    mocks.fetchAdminMetrics.mockImplementation((d: number) =>
      d === 7 ? slow7.promise : fast90.promise,
    );
    render(<CrmAnalytics />);

    await userEvent.click(screen.getByRole("button", { name: "90 ימים" }));
    await act(async () => {
      fast90.resolve(metrics({ audit: { total: 999, byEvent: [] } }));
      await fast90.promise;
    });
    expect(within(stat("פעולות ניהול")).getByText("999")).toBeInTheDocument();

    // The 7-day request the operator abandoned now lands. It is stale.
    await act(async () => {
      slow7.resolve(metrics({ audit: { total: 111, byEvent: [] } }));
      await slow7.promise;
    });

    expect(within(stat("פעולות ניהול")).getByText("999")).toBeInTheDocument();
    expect(screen.queryByText("111")).toBeNull();
  });

  it("does not refetch the lifetime leaderboard when the window changes", async () => {
    render(<CrmAnalytics />);
    await screen.findByText("אירועי משפך");

    // Two window switches, each of which DID reload the window's metrics…
    await userEvent.click(screen.getByRole("button", { name: "30 ימים" }));
    await waitFor(() => expect(mocks.fetchAdminMetrics).toHaveBeenCalledTimes(2));
    await userEvent.click(screen.getByRole("button", { name: "90 ימים" }));
    await waitFor(() => expect(mocks.fetchAdminMetrics).toHaveBeenCalledTimes(3));

    // …while the leaderboard is lifetime-to-date, so a window switch neither
    // refetches it nor may ever pass a day count that would silently re-scope it.
    expect(mocks.fetchRepLeaderboard.mock.calls).toEqual([[]]);
  });
});

// ── the leaderboard ─────────────────────────────────────────────────────────

describe("CrmAnalytics rep leaderboard", () => {
  it("ranks by recorded saving, biggest first, and says so via aria-sort", async () => {
    mocks.fetchRepLeaderboard.mockResolvedValue({ reps: REPS, sampled: 3, capped: true });
    render(<CrmAnalytics />);

    await screen.findByRole("table");
    expect(repOrder()).toEqual(["בתיה", "אבי", "גדי"]); // 1200, 500, 100
    expect(screen.getByRole("columnheader", { name: "חיסכון שנרשם" })).toHaveAttribute(
      "aria-sort",
      "descending",
    );
    expect(screen.getByRole("columnheader", { name: "לידים" })).toHaveAttribute("aria-sort", "none");
    // Money is shown in shekels, formatted — never a bare number.
    expect(screen.getByText("₪1,200")).toBeInTheDocument();
    // A capped sample admits it rather than implying the whole book.
    expect(screen.getByText("מוצג לפי מדגם הלידים האחרונים.")).toBeInTheDocument();
  });

  it("sorts by a clicked column descending, then flips on the second click", async () => {
    render(<CrmAnalytics />);
    await screen.findByRole("table");

    await userEvent.click(screen.getByRole("button", { name: "לידים" }));
    expect(repOrder()).toEqual(["אבי", "גדי", "בתיה"]); // claimed 10, 7, 3
    expect(screen.getByRole("columnheader", { name: "לידים" })).toHaveAttribute(
      "aria-sort",
      "descending",
    );

    await userEvent.click(screen.getByRole("button", { name: "לידים" }));
    expect(repOrder()).toEqual(["בתיה", "גדי", "אבי"]);
    expect(screen.getByRole("columnheader", { name: "לידים" })).toHaveAttribute(
      "aria-sort",
      "ascending",
    );
    // Sorting is client-side over rows already loaded — no extra reads.
    expect(mocks.fetchRepLeaderboard).toHaveBeenCalledTimes(1);
  });
});

// ── cron health + list caps ─────────────────────────────────────────────────

describe("CrmAnalytics cron health and list caps", () => {
  it("reports an unhealthy cron and names the failing and lagging jobs", async () => {
    mocks.fetchAdminMetrics.mockResolvedValue(
      metrics({ cron: { ok: false, known: 3, stale: ["digest"], failing: ["refreshPlans"] } }),
    );
    render(<CrmAnalytics />);

    await waitFor(() => expect(within(stat("בריאות Cron")).getByText("בעיה")).toBeInTheDocument());
    expect(screen.getByText("3 משימות מוכרות · יש בעיות")).toBeInTheDocument();
    expect(screen.getByText("נכשלות: refreshPlans")).toBeInTheDocument();
    expect(screen.getByText("מתעכבות: digest")).toBeInTheDocument();
  });

  it("caps the long lists at 10 tools and 12 audit events", async () => {
    mocks.fetchAdminMetrics.mockResolvedValue(
      metrics({
        toolCalls: {
          total: 60,
          ok: 30,
          rate: 0.5,
          byTool: Array.from({ length: 12 }, (_, i) => rate(`tool-${i}`, 5, 5)),
          byChannel: [],
        },
        audit: {
          total: 14,
          byEvent: Array.from({ length: 14 }, (_, i) => ({ event: `audit-${i}`, count: 1 })),
        },
      }),
    );
    render(<CrmAnalytics />);

    await screen.findByRole("heading", { name: "הצלחת כלי הסוכן" });
    expect(within(section("הצלחת כלי הסוכן")).getAllByText(/^tool-\d+ · 5$/)).toHaveLength(10);
    expect(within(section("פעולות ניהול (יומן ביקורת)")).getAllByRole("listitem")).toHaveLength(12);
  });
});
