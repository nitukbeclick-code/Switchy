// ────────────────────────────────────────────────────────────────────────────
// /community/profile/[id] — a community member's public profile + their posts.
// Served by the Next app on every device (under the /community carve-out). The
// own-profile case shows the editor (name / avatar / notification opt-out) inside
// <ProfileView>. noindex,follow — user content.
// ────────────────────────────────────────────────────────────────────────────

import type { Metadata } from "next";
import ProfileView from "@/components/community/ProfileView";

export const metadata: Metadata = {
  title: "פרופיל — קהילת חוסך",
  robots: { index: false, follow: true },
};

interface Params {
  params: Promise<{ id: string }>;
}

export default async function CommunityProfilePage({ params }: Params) {
  const { id } = await params;
  return (
    <main id="main" className="mx-auto w-full max-w-2xl px-4 py-6 sm:py-10">
      <ProfileView userId={id} />
    </main>
  );
}
