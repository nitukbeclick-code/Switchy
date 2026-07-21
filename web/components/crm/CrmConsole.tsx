"use client";

// ────────────────────────────────────────────────────────────────────────────
// <CrmConsole> — the CRM management console shell: the admin UX gate + the
// section tab-nav, routing to each section component. The is_admin check here is
// UX ONLY — every crm-api call re-verifies access server-side (requireCrmAccess),
// so a forced non-admin just gets empty/failed loads. Sections own their own
// data + loading/error states; this shell stays thin.
//
// The active section lives in the URL (?tab=leads) so refresh, back/forward and
// shared deep-links land on the right tab: tab hops replace (never pile up
// history), a popstate (browser back/forward across history entries whose ?tab=
// differs) re-syncs the local state, and switching tabs PRESERVES the sibling
// tabs' mirrored filter params (each list view keeps its own keys in the URL).
// useSearchParams on a prerendered route CSR-bails to the nearest <Suspense>,
// so the boundary is provided here (the /crm server shell stays a plain
// <CrmConsole />).
// ────────────────────────────────────────────────────────────────────────────

import { type KeyboardEvent, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import CrmAnalytics from "./CrmAnalytics";
import CrmContacts from "./CrmContacts";
import CrmDashboard from "./CrmDashboard";
import CrmInbox from "./CrmInbox";
import CrmLeads from "./CrmLeads";
import CrmMeetings from "./CrmMeetings";
import CrmSellableLeads from "./CrmSellableLeads";
import CrmTeam from "./CrmTeam";
import { NoticeCard } from "./ui";

type TabKey =
  | "dashboard"
  | "leads"
  | "meetings"
  | "conversations"
  | "contacts"
  | "sellable"
  | "team"
  | "analytics";

const TABS: { key: TabKey; label: string; ready: boolean }[] = [
  { key: "dashboard", label: "סקירה", ready: true },
  { key: "leads", label: "לידים", ready: true },
  { key: "meetings", label: "פגישות", ready: true },
  { key: "conversations", label: "שיחות", ready: true },
  { key: "contacts", label: "אנשי קשר", ready: true },
  { key: "sellable", label: "לידים לשיתוף", ready: true },
  { key: "team", label: "צוות והרשאות", ready: true },
  { key: "analytics", label: "אנליטיקס", ready: true },
];

function isTabKey(v: string | null): v is TabKey {
  return TABS.some((t) => t.key === v);
}

export default function CrmConsole() {
  return (
    <Suspense
      fallback={
        <main id="main" className="mx-auto w-full max-w-6xl px-4 py-10">
          <p className="text-sm text-muted">טוען…</p>
        </main>
      }
    >
      <CrmConsoleInner />
    </Suspense>
  );
}

function CrmConsoleInner() {
  const { ready, profile } = useAuth();
  const isAdmin = !!profile?.is_admin;
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlTab = searchParams.get("tab");
  // Initialized from ?tab= on mount (refresh / deep-link restore); invalid or
  // absent values fall back to the dashboard.
  const [tab, setTab] = useState<TabKey>(() => (isTabKey(urlTab) ? urlTab : "dashboard"));
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // Local state switches instantly; the URL mirrors it. replace (not push) —
  // tab hops shouldn't pile up history entries. The sibling tabs' mirrored
  // filter params are preserved so switching back restores their exact view.
  const selectTab = useCallback(
    (key: TabKey) => {
      setTab(key);
      const qs = new URLSearchParams(window.location.search);
      qs.set("tab", key);
      router.replace(`?${qs.toString()}`, { scroll: false });
    },
    [router],
  );

  // Back/forward sync: when the browser navigates between history entries whose
  // ?tab= differs (deep links, cross-page returns), re-derive the local tab from
  // the URL. popstate is an EVENT, so the setState here stays event-driven —
  // never a synchronous set inside an effect body (react-hooks/set-state-in-effect).
  useEffect(() => {
    const onPop = () => {
      const t = new URLSearchParams(window.location.search).get("tab");
      setTab(isTabKey(t) ? t : "dashboard");
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  // ARIA tabs keyboard model (roving tabindex). The row renders right→left
  // (RTL), so ArrowLeft moves to the NEXT tab and ArrowRight to the previous;
  // Home/End jump to the edges. Moving both activates and focuses the tab.
  const onTablistKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    const current = TABS.findIndex((t) => t.key === tab);
    let next: number;
    if (e.key === "ArrowLeft") next = (current + 1) % TABS.length;
    else if (e.key === "ArrowRight") next = (current - 1 + TABS.length) % TABS.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = TABS.length - 1;
    else return;
    e.preventDefault();
    selectTab(TABS[next].key);
    tabRefs.current[next]?.focus();
  };

  if (!ready) {
    return (
      <main id="main" className="mx-auto w-full max-w-6xl px-4 py-10">
        <p className="text-sm text-muted">טוען…</p>
      </main>
    );
  }
  if (!isAdmin) {
    return (
      <main id="main" className="mx-auto w-full max-w-md px-4 py-16">
        <NoticeCard>אין לך הרשאת ניהול. הקונסולה זמינה למנהלים בלבד.</NoticeCard>
      </main>
    );
  }

  return (
    <main id="main" className="crm-shell mx-auto w-full px-4">
      <header className="crm-hero mb-5">
        <p className="mb-2 text-xs font-bold uppercase tracking-[0.16em] text-accent-text">מרכז התפעול של SWITCHY</p>
        <h1 className="font-display text-3xl font-bold text-ink sm:text-4xl">CRM · ניהול לקוחות</h1>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted sm:text-base">
          צנרת לידים, שיחות ונתוני מכירות. הנתונים נטענים בשרת (למנהלים בלבד) וכל פעולה נרשמת ביומן.
        </p>
      </header>

      <nav
        className="crm-tabs mb-6"
        role="tablist"
        aria-label="מדורי הקונסולה"
        onKeyDown={onTablistKeyDown}
      >
        {TABS.map((t, i) => {
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              ref={(el) => {
                tabRefs.current[i] = el;
              }}
              type="button"
              role="tab"
              id={`crm-tab-${t.key}`}
              aria-selected={active}
              aria-controls="crm-tabpanel"
              tabIndex={active ? 0 : -1}
              onClick={() => selectTab(t.key)}
              className={`crm-tab interactive flex items-center text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                active
                  ? ""
                  : "text-muted [@media(hover:hover)_and_(pointer:fine)]:hover:bg-accent/10 [@media(hover:hover)_and_(pointer:fine)]:hover:text-foreground"
              }`}
            >
              {t.label}
              {!t.ready && (
                <span className="ms-1.5 rounded-full bg-border px-1.5 py-0.5 text-[10px] font-medium text-muted">
                  בקרוב
                </span>
              )}
            </button>
          );
        })}
      </nav>

      <div className="crm-panel" role="tabpanel" id="crm-tabpanel" aria-labelledby={`crm-tab-${tab}`}>
        {tab === "dashboard" && <CrmDashboard onNavigate={selectTab} />}
        {tab === "leads" && <CrmLeads />}
        {tab === "meetings" && <CrmMeetings />}
        {tab === "conversations" && <CrmInbox />}
        {tab === "contacts" && <CrmContacts />}
        {tab === "sellable" && <CrmSellableLeads />}
        {tab === "team" && <CrmTeam />}
        {tab === "analytics" && <CrmAnalytics />}
      </div>
    </main>
  );
}
