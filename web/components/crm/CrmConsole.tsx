"use client";

// ────────────────────────────────────────────────────────────────────────────
// <CrmConsole> — the CRM management console shell: the access UX gate + the
// section tab-nav, routing to each section component.
//
// THE GATE IS THE CALLER'S CRM ROLE, NOT is_admin. crm_roles.ts has modelled
// viewer/rep/admin all along — a `rep` holds read + write_leads + converse and
// crm-api enforces that per action — but this shell used to demand
// profiles.is_admin, so a rep granted a role could never open the surface that
// role was designed for. It now asks crm-api `whoami` (which is the SAME gate the
// mutations go through) and renders what the caller actually holds; the two
// admin_only tabs are hidden for graded roles.
//
// This is still UX ONLY: every crm-api call re-verifies server-side and an
// unmapped/over-privileged action 403s regardless of what is rendered. Sections
// own their own data + loading/error states; this shell stays thin.
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
import dynamic from "next/dynamic";
import { type CrmAccess, type CrmFailure, fetchCrmAccess } from "@/lib/crm-admin";
import CrmDashboard from "./CrmDashboard";
import { NoticeCard } from "./ui";

function CrmTabLoading() {
  return (
    <div className="space-y-3" aria-live="polite" aria-busy="true">
      <p className="text-sm text-muted">טוען את סביבת העבודה…</p>
      <div className="h-28 animate-pulse rounded-2xl border border-border bg-surface motion-reduce:animate-none" />
      <div className="h-56 animate-pulse rounded-2xl border border-border bg-surface motion-reduce:animate-none" />
    </div>
  );
}

// The dashboard is the initial route and stays eagerly available. Every other
// workspace is a separate on-demand client chunk, so opening the CRM no longer
// downloads leads, inbox, meetings, contacts, team and analytics all at once.
const CrmAnalytics = dynamic(() => import("./CrmAnalytics"), {
  loading: () => <CrmTabLoading />,
});
const CrmContacts = dynamic(() => import("./CrmContacts"), {
  loading: () => <CrmTabLoading />,
});
const CrmInbox = dynamic(() => import("./CrmInbox"), {
  loading: () => <CrmTabLoading />,
});
const CrmLeads = dynamic(() => import("./CrmLeads"), {
  loading: () => <CrmTabLoading />,
});
const CrmMeetings = dynamic(() => import("./CrmMeetings"), {
  loading: () => <CrmTabLoading />,
});
const CrmSellableLeads = dynamic(() => import("./CrmSellableLeads"), {
  loading: () => <CrmTabLoading />,
});
const CrmTeam = dynamic(() => import("./CrmTeam"), {
  loading: () => <CrmTabLoading />,
});

type TabKey =
  | "dashboard"
  | "leads"
  | "meetings"
  | "conversations"
  | "contacts"
  | "sellable"
  | "team"
  | "analytics";

// `adminOnly` mirrors crm_roles.ts ACTION_CAP: the sellable feed (consented PII)
// and role management are admin_only there, so a graded role never sees them.
const TABS: { key: TabKey; label: string; ready: boolean; adminOnly?: boolean }[] = [
  { key: "dashboard", label: "סקירה", ready: true },
  { key: "leads", label: "לידים", ready: true },
  { key: "meetings", label: "פגישות", ready: true },
  { key: "conversations", label: "שיחות", ready: true },
  { key: "contacts", label: "אנשי קשר", ready: true },
  { key: "sellable", label: "לידים לשיתוף", ready: true, adminOnly: true },
  { key: "team", label: "צוות והרשאות", ready: true, adminOnly: true },
  { key: "analytics", label: "אנליטיקס", ready: true },
];

function isTabKey(v: string | null): v is TabKey {
  return TABS.some((t) => t.key === v);
}

/** The tabs this caller may open. Cosmetic — the server gate is authoritative. */
function tabsFor(access: CrmAccess | null): typeof TABS {
  return TABS.filter((t) => !t.adminOnly || !!access?.can.adminOnly);
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
  // The caller's effective CRM role, resolved by the SAME server gate the
  // mutations go through.
  //
  // A failure is NOT automatically a denial. 401/403 means they genuinely hold no
  // role; anything else (network blip, 5xx) must offer a retry rather than tell a
  // legitimate admin they've lost access — the old is_admin gate read a locally
  // cached profile and could never do that, so this path has to be careful.
  const [access, setAccess] = useState<CrmAccess | null>(null);
  const [failure, setFailure] = useState<CrmFailure | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let live = true;
    fetchCrmAccess().then((r) => {
      if (!live) return;
      setAccess(r.data);
      setFailure(r.failure);
    });
    return () => {
      live = false;
    };
  }, [attempt]);
  const denied = !!failure && (failure.status === 401 || failure.status === 403);
  const visibleTabs = tabsFor(access);
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
    const tabs = visibleTabs;
    if (!tabs.length) return;
    const current = tabs.findIndex((t) => t.key === tab);
    let next: number;
    if (e.key === "ArrowLeft") next = (current + 1) % tabs.length;
    else if (e.key === "ArrowRight") next = (current - 1 + tabs.length) % tabs.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = tabs.length - 1;
    else return;
    e.preventDefault();
    selectTab(tabs[next].key);
    tabRefs.current[next]?.focus();
  };

  if (denied) {
    return (
      <main id="main" className="mx-auto w-full max-w-md px-4 py-16">
        <NoticeCard>אין לך הרשאת גישה לקונסולה. פנו למנהל המערכת כדי לקבל תפקיד.</NoticeCard>
      </main>
    );
  }
  if (failure) {
    // Couldn't resolve the role — say so and offer a retry. Never "no access".
    return (
      <main id="main" className="mx-auto w-full max-w-md px-4 py-16">
        <NoticeCard>{failure.message}</NoticeCard>
        <button
          type="button"
          onClick={() => setAttempt((n) => n + 1)}
          className="interactive mt-4 rounded-xl border border-border px-4 py-2 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          נסו שוב
        </button>
      </main>
    );
  }
  if (!access) {
    return (
      <main id="main" className="mx-auto w-full max-w-6xl px-4 py-10">
        <p className="text-sm text-muted">טוען…</p>
      </main>
    );
  }

  // The tab actually rendered: the selected one when this role may open it, else
  // the dashboard (every role holds `read`).
  const shown: TabKey = visibleTabs.some((t) => t.key === tab) ? tab : "dashboard";

  return (
    <main id="main" className="crm-shell mx-auto w-full px-4">
      <header className="crm-hero mb-5">
        <p className="mb-2 text-xs font-bold uppercase tracking-[0.16em] text-accent-text">מרכז התפעול של SWITCHY</p>
        <h1 className="font-display text-3xl font-bold text-ink sm:text-4xl">CRM · ניהול לקוחות</h1>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted sm:text-base">
          צנרת לידים, שיחות ונתוני מכירות. הנתונים נטענים בשרת לפי ההרשאה שלכם, וכל פעולה נרשמת ביומן.
        </p>
      </header>

      <nav
        className="crm-tabs mb-6"
        role="tablist"
        aria-label="מדורי הקונסולה"
        onKeyDown={onTablistKeyDown}
      >
        {visibleTabs.map((t, i) => {
          const active = shown === t.key;
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

      <div className="crm-panel" role="tabpanel" id="crm-tabpanel" aria-labelledby={`crm-tab-${shown}`}>
        {/* A deep link to a tab this role can't open (?tab=sellable as a rep)
            falls back to the dashboard rather than mounting a section whose every
            request would 403. */}
        {(shown === "dashboard") && <CrmDashboard onNavigate={selectTab} />}
        {/* canAdmin gates the drawer's release/reassign controls. It comes from
            the SAME resolved whoami that hides the admin-only tabs above, so the
            console never shows a control the server would 403. */}
        {shown === "leads" && <CrmLeads canAdmin={!!access?.can.adminOnly} />}
        {shown === "meetings" && <CrmMeetings />}
        {shown === "conversations" && <CrmInbox />}
        {shown === "contacts" && <CrmContacts />}
        {shown === "sellable" && <CrmSellableLeads />}
        {shown === "team" && <CrmTeam />}
        {shown === "analytics" && <CrmAnalytics />}
      </div>
    </main>
  );
}
