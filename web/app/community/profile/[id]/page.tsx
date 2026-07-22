// ────────────────────────────────────────────────────────────────────────────
// /community/profile/[id] — a community member's public profile + their posts.
// Served by the Next app on every device (under the /community carve-out). The
// own-profile case shows the editor (name / avatar / notification opt-out) inside
// <ProfileView>. noindex,follow — user content.
//
// Metadata goes through the shared pageMetadata() so the canonical + OG/Twitter
// block is consistent with every other page (before, this page had no canonical
// and inherited the HOMEPAGE og:url/og:title from the layout). The copy stays
// GENERIC — no profile data is fetched here, so nothing member-specific leaks
// into metadata — and the page remains noindex,follow.
// ────────────────────────────────────────────────────────────────────────────

import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import ProfileView from "@/components/community/ProfileView";

interface Params {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params;
  return pageMetadata({
    title: "פרופיל — קהילת חוסך",
    description: "פרופיל חבר בקהילת חוסך — פוסטים, תגובות והמלצות.",
    path: `/community/profile/${id}`,
    robots: { index: false, follow: true },
  });
}

export default async function CommunityProfilePage({ params }: Params) {
  const { id } = await params;
  return (
    <main
      id="main"
      className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 sm:py-10"
    >
      <ProfileView userId={id} />
    </main>
  );
}
