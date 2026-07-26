// ────────────────────────────────────────────────────────────────────────────
// /crm — the CRM management console (staff-only). Server shell: metadata only.
// There is NO server-side data here — every read/write goes through the crm-api
// edge function (requireCrmAccess → service-role, fail-closed), so lead PII never
// reaches a client key. The client <CrmConsole> render-gates on the caller's
// effective CRM role, which it resolves by asking crm-api `whoami` — the SAME
// server gate the mutations pass — purely for UX.
//
// noindex,nofollow: a private staff tool. A Next-only path with no static twin,
// so the device-split middleware serves it from this app on desktop too.
// ────────────────────────────────────────────────────────────────────────────

import type { Metadata } from "next";
import CrmConsole from "@/components/crm/CrmConsole";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = {
  ...pageMetadata({
    title: "CRM · ניהול לקוחות — חוסך",
    description: "מערכת ניהול לידים, שיחות וצנרת מכירות (למנהלים בלבד).",
    path: "/crm",
  }),
  robots: { index: false, follow: false },
};

export default function CrmPage() {
  return <CrmConsole />;
}
