// ────────────────────────────────────────────────────────────────────────────
// /community/admin — the moderation dashboard (roadmap item #2).
//
// Server shell only: metadata + the client <AdminModeration>. There is NO
// server-side data here — the queue read and every action go through the
// community-admin edge function, which is the real authority (requireAdmin →
// service-role reads profiles.is_admin, fail-closed). The client component
// render-gates on useAuth().profile.is_admin purely for UX; a non-admin who
// forces the route past that gate still gets 401s from the edge fn.
//
// noindex,nofollow: a private staff tool, never for crawlers.
// ────────────────────────────────────────────────────────────────────────────

import type { Metadata } from "next";
import AdminModeration from "@/components/community/AdminModeration";
import UnansweredThreads from "@/components/community/UnansweredThreads";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = {
  ...pageMetadata({
    title: "ניהול קהילה — חוסך",
    description: "לוח ניהול ומודרציה של קהילת חוסך (למנהלים בלבד).",
    path: "/community/admin",
  }),
  robots: { index: false, follow: false },
};

export default function CommunityAdminPage() {
  return (
    <main id="main" className="mx-auto w-full max-w-2xl px-4 py-6 sm:py-10">
      <header className="mb-6">
        <h1 className="font-display text-2xl font-bold text-ink sm:text-3xl">ניהול קהילה</h1>
        <p className="mt-2 text-sm text-muted">
          שרשורים שממתינים למענה, ולצידם דיווחים פתוחים ותוכן מסומן לבדיקה. פעולות
          המודרציה מתבצעות בשרת ונרשמות ביומן.
        </p>
      </header>
      {/* SIBLINGS, deliberately. <AdminModeration>'s error gate returns early and
          replaces its whole render, so when the community-admin edge function is
          unreachable the queue collapses to an error card. <UnansweredThreads>
          reads community_feed directly (a public read, no server authority), so
          as a sibling it keeps working — and it is the view with actual work in
          it, since reports and flags are both currently empty. */}
      <UnansweredThreads />
      <AdminModeration />
    </main>
  );
}
