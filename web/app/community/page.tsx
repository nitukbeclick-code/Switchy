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
import Icon from "@/components/Icon";
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

function CommunityFeedFallback() {
  return (
    <div
      className="flex flex-col gap-4"
      aria-label="טוען את הקהילה"
      aria-busy="true"
    >
      <div className="bento h-36 animate-pulse" />
      <div className="bento h-24 animate-pulse" />
      {[0, 1, 2].map((item) => (
        <div
          key={item}
          className="rounded-2xl border border-border bg-surface p-4 shadow-card"
        >
          <div className="flex items-center gap-3">
            <span className="h-10 w-10 animate-pulse rounded-full bg-border/70" />
            <span className="h-3.5 w-32 animate-pulse rounded bg-border/70" />
          </div>
          <div className="mt-4 space-y-2">
            <span className="block h-3 w-full animate-pulse rounded bg-border/60" />
            <span className="block h-3 w-4/5 animate-pulse rounded bg-border/60" />
          </div>
        </div>
      ))}
    </div>
  );
}

const COMMUNITY_LINKS = [
  {
    href: "#community-composer",
    icon: "chat" as const,
    title: "פתיחת שיחה",
    description: "שאלה, חוויה או המלצה",
  },
  {
    href: "/community/questions",
    icon: "check" as const,
    title: "שאלות עם תשובות",
    description: "ידע שכבר נבדק בקהילה",
  },
  {
    href: "/community-guidelines",
    icon: "info" as const,
    title: "כללי הקהילה",
    description: "איך שומרים על שיח מועיל",
  },
  {
    href: "/compare",
    icon: "search" as const,
    title: "השוואת מסלולים",
    description: "מהדיון אל המספרים",
  },
];

export default function CommunityPage() {
  return (
    <main
      id="main"
      className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-10 lg:px-8"
    >
      <header className="relative overflow-hidden rounded-[2rem] border border-border bg-surface px-5 py-7 shadow-card sm:px-8 sm:py-10 lg:px-10">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -start-24 -top-24 h-64 w-64 rounded-full bg-accent/10 blur-3xl"
        />
        <div className="relative max-w-3xl">
          <p className="inline-flex items-center gap-2 rounded-full border border-accent/20 bg-accent/10 px-3 py-1 text-xs font-semibold text-accent-text">
            <Icon name="chat" size={16} />
            ידע צרכני מאנשים אמיתיים
          </p>
          <h1 className="mt-4 font-display text-3xl font-bold tracking-tight text-ink sm:text-4xl lg:text-5xl">
            אנשים שכבר עשו את המעבר.
            <span className="block text-accent-text">
              תשובות שחוסכות טעויות.
            </span>
          </h1>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-muted sm:text-base">
            מקום לשאול, להשוות חוויות שירות וללמוד מה עבד לאחרים — בלי תוכן
            ממומן שמתחפש להמלצה ובלי מספרים מומצאים.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="#community-composer"
              className="press inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-accent-contrast shadow-soft transition-colors hover:bg-accent-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              פתיחת שיחה
              <Icon name="arrow" size={17} />
            </Link>
            <Link
              href="/community/questions"
              className="press inline-flex min-h-11 items-center justify-center rounded-xl border border-border bg-background px-5 py-2.5 text-sm font-semibold text-ink transition-colors hover:border-accent/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              צפייה בשאלות עם תשובות
            </Link>
          </div>
          <ul className="mt-6 flex list-none flex-wrap gap-x-5 gap-y-2 p-0 text-xs font-medium text-muted sm:text-sm">
            {[
              "דיווח וחסימה מובנים",
              "תשובה נבחרת על ידי השואל",
              "קישור ישיר לכל דיון",
            ].map((item) => (
              <li key={item} className="inline-flex items-center gap-1.5">
                <Icon name="check" size={15} className="text-accent-text" />
                {item}
              </li>
            ))}
          </ul>
        </div>
      </header>

      <nav
        aria-label="קיצורי דרך בקהילה"
        className="mt-4 flex gap-2 overflow-x-auto pb-1 lg:hidden"
      >
        {COMMUNITY_LINKS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="press inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full border border-border bg-surface px-4 py-2 text-sm font-medium text-ink shadow-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            <Icon name={item.icon} size={17} className="text-accent-text" />
            {item.title}
          </Link>
        ))}
      </nav>

      <div className="mt-6 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="min-w-0">
          {/* Suspense: CommunityFeed reads useSearchParams for the catalogue deep-link
              prefill (/community?channel=&provider=&draft=). */}
          <Suspense fallback={<CommunityFeedFallback />}>
            <CommunityFeed />
          </Suspense>
        </div>

        <aside className="hidden lg:block" aria-label="ניווט ועקרונות הקהילה">
          <div className="sticky top-24 space-y-4">
            <nav className="bento p-3" aria-label="קיצורי דרך בקהילה">
              <p className="px-2 pb-2 text-xs font-semibold uppercase tracking-wide text-muted">
                בקהילה
              </p>
              <ul className="list-none space-y-1 p-0">
                {COMMUNITY_LINKS.map((item) => (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className="group flex items-center gap-3 rounded-xl px-3 py-3 transition-colors hover:bg-accent/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                    >
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent-text">
                        <Icon name={item.icon} size={18} />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold text-ink">
                          {item.title}
                        </span>
                        <span className="block text-xs leading-5 text-muted">
                          {item.description}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>

            <section
              className="rounded-2xl border border-border bg-background p-5"
              aria-labelledby="community-trust-title"
            >
              <Icon name="lock" size={20} className="text-accent-text" />
              <h2
                id="community-trust-title"
                className="mt-3 font-display text-base font-semibold text-ink"
              >
                אמינות לפני ויראליות
              </h2>
              <p className="mt-2 text-xs leading-6 text-muted">
                תוכן מדווח עובר לבדיקת מנהל, פוסטים שסומנו אינם מוצגים בדפי
                הידע, והמלצות ספקים נשארות ניתנות לבדיקה מול הקטלוג.
              </p>
            </section>
          </div>
        </aside>
      </div>
    </main>
  );
}
