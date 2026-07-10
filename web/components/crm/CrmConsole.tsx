"use client";

// ────────────────────────────────────────────────────────────────────────────
// <CrmConsole> — the CRM management console shell: the admin UX gate + the
// section tab-nav, routing to each section component. The is_admin check here is
// UX ONLY — every crm-api call re-verifies is_admin server-side (requireAdmin),
// so a forced non-admin just gets empty/failed loads. Sections own their own
// data + loading/error states; this shell stays thin.
// ────────────────────────────────────────────────────────────────────────────

import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import CrmDashboard from "./CrmDashboard";
import CrmInbox from "./CrmInbox";
import CrmLeads from "./CrmLeads";
import { NoticeCard } from "./ui";

type TabKey = "dashboard" | "leads" | "conversations" | "analytics";

const TABS: { key: TabKey; label: string; ready: boolean }[] = [
  { key: "dashboard", label: "סקירה", ready: true },
  { key: "leads", label: "לידים", ready: true },
  { key: "conversations", label: "שיחות", ready: true },
  { key: "analytics", label: "אנליטיקס", ready: false },
];

export default function CrmConsole() {
  const { ready, profile } = useAuth();
  const isAdmin = !!profile?.is_admin;
  const [tab, setTab] = useState<TabKey>("dashboard");

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
    <main id="main" className="mx-auto w-full max-w-6xl px-4 py-6 sm:py-8">
      <header className="mb-5">
        <h1 className="font-display text-2xl font-bold text-ink sm:text-3xl">CRM · ניהול לקוחות</h1>
        <p className="mt-1 text-sm text-muted">
          צנרת לידים, שיחות ונתוני מכירות. הנתונים נטענים בשרת (למנהלים בלבד) וכל פעולה נרשמת ביומן.
        </p>
      </header>

      <nav className="mb-6 flex flex-wrap gap-1 border-b border-border" role="tablist" aria-label="מדורי הקונסולה">
        {TABS.map((t) => {
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setTab(t.key)}
              className={`interactive -mb-px flex items-center rounded-t-lg border-b-2 px-4 py-2 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                active
                  ? "border-accent text-accent-text"
                  : "border-transparent text-muted [@media(hover:hover)_and_(pointer:fine)]:hover:text-foreground"
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

      {tab === "dashboard" && <CrmDashboard />}
      {tab === "leads" && <CrmLeads />}
      {tab === "conversations" && <CrmInbox />}
      {tab === "analytics" && <NoticeCard>מדור האנליטיקס יתווסף לקונסולה בקרוב.</NoticeCard>}
    </main>
  );
}
