// ────────────────────────────────────────────────────────────────────────────
// /community — the authenticated community ("קהילת חוסך").
//
// Served by the Next app on EVERY device (the device-split carve-out: /community
// is not in STATIC_HTML_MAP, so staticDesktopPath returns null and desktop renders
// this React app instead of the old read-only static twin). Server shell (intro +
// metadata) + the client <CommunityFeed> (real feed over the existing Supabase
// backend: posts / replies / likes / media, gated on a real login).
//
// noindex,follow: the feed is user-generated content — keep it out of the search
// index while still letting crawlers follow the outbound links.
// ────────────────────────────────────────────────────────────────────────────

import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import CommunityFeed from "@/components/community/CommunityFeed";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = {
  ...pageMetadata({
    title: "קהילת חוסך — דיונים אמיתיים על מסלולי תקשורת",
    description:
      "קהילת חוסך: שאלות, חוויות והמלצות אמיתיות על מסלולי סלולר, אינטרנט, טלוויזיה " +
      "וחבילות חו״ל — מאנשים שכבר עברו ספק. הצטרפו, שתפו ותשאלו.",
    path: "/community",
  }),
  robots: { index: false, follow: true },
};

export default function CommunityPage() {
  return (
    <main id="main" className="mx-auto w-full max-w-2xl px-4 py-6 sm:py-10">
      <header className="mb-6 text-center">
        <h1 className="font-display text-2xl font-bold text-ink sm:text-3xl">קהילת חוסך</h1>
        <p className="mt-2 text-sm text-muted">
          שאלות, חוויות והמלצות אמיתיות על מסלולי תקשורת — מאנשים שכבר עברו ספק.{" "}
          <Link href="/community-guidelines" className="font-medium text-accent-text underline">
            כללי הקהילה
          </Link>
        </p>
      </header>

      {/* Suspense: CommunityFeed reads useSearchParams for the catalogue deep-link
          prefill (/community?channel=&provider=&draft=). */}
      <Suspense fallback={null}>
        <CommunityFeed />
      </Suspense>
    </main>
  );
}
