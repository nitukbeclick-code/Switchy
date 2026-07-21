import type { Metadata } from "next";
import Script from "next/script";
import { Rubik, Assistant } from "next/font/google";
import "./globals.css";
import JsonLd from "@/components/JsonLd";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import ConsentBanner from "@/components/ConsentBanner";
import PwaInstaller from "@/components/PwaInstaller";
import CatalogueLiveRefresh from "@/components/CatalogueLiveRefresh";
import { AuthProvider } from "@/lib/auth-context";
import { orgSchema, websiteSchema, SITE_URL, SITE_NAME } from "@/lib/schema";

// Rubik for display/headings, Assistant for body/labels. Hebrew-only subset: this
// is a Hebrew-first RTL site, so the latin subset is mostly dead weight (the few
// latin glyphs — "Switchy AI", digits, ₪ — fall back gracefully). Dropping it trims
// the preloaded woff2 set that contends with the LCP resource. `display: swap`
// keeps text visible immediately (no FOIT).
//
// PRELOAD: `preload: true` (set explicitly, though it is also the next/font
// default) makes next/font inject a `<link rel="preload" as="font" type="font/woff2"
// crossorigin>` for the subsetted woff2 into <head> on every route this root layout
// wraps — i.e. site-wide — so the LCP text font is fetched at the highest priority
// instead of being discovered late via CSS. We deliberately do NOT hand-write those
// <link> tags: the file names are content-hashed (e.g. `...-s.p.<hash>.woff2`) and
// rotate every build, so a hardcoded href would 404, and a duplicate preload would
// double-fetch the font and trip the browser's "preloaded but not used" warning.
// Letting next/font own the tag keeps the href correct across builds. See next docs
// -> Font / Preloading.
const rubik = Rubik({
  variable: "--font-rubik",
  subsets: ["hebrew"],
  display: "swap",
  preload: true,
});

const assistant = Assistant({
  variable: "--font-assistant",
  subsets: ["hebrew"],
  display: "swap",
  preload: true,
});

// GA4 Measurement ID (Google Analytics 4). Loaded site-wide via next/script.
const GA4_MEASUREMENT_ID = "G-YCTGRVN7SJ";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "SWITCHY — התקשורת שלכם, במחיר שמרגיש נכון",
    template: "%s | SWITCHY",
  },
  description:
    "משווים מסלולי סלולר, אינטרנט, טלוויזיה וחבילות משולבות מכל הספקים בישראל. " +
    "רואים גם את המחיר שאחרי המבצע ועוברים בליווי אנושי — בחינם וללא התחייבות.",
  applicationName: SITE_NAME,
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    locale: "he_IL",
    url: SITE_URL,
    siteName: SITE_NAME,
    title: "SWITCHY — התקשורת שלכם, במחיר שמרגיש נכון",
    description:
      "השוואה שקופה של מסלולי תקשורת בישראל, כולל המחיר שאחרי המבצע וליווי במעבר.",
  },
  robots: {
    index: true,
    follow: true,
    "max-snippet": -1,
    "max-image-preview": "large",
    "max-video-preview": -1,
    googleBot: {
      index: true,
      follow: true,
      "max-snippet": -1,
      "max-image-preview": "large",
      "max-video-preview": -1,
    },
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="he"
      dir="rtl"
      data-theme="light"
      suppressHydrationWarning
      className={`${rubik.variable} ${assistant.variable} h-full antialiased`}
    >
      <head>
        {/* No-flash theme guard — runs synchronously during HTML parsing, BEFORE
            first paint, so dark mode never flashes. Sets `data-theme` on <html>
            from the saved choice (localStorage `chosech-theme`) or, with no saved
            choice, the system preference (prefers-color-scheme). Mirrors the
            static site's <head> guard exactly; the default rendered attribute is
            `light` (above) so SSR + first client render agree. This is the Next
            App Router-recommended inline-script pattern for pre-hydration theming
            (see next docs: "Preventing Flash before hydration"). */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem('chosech-theme');document.documentElement.setAttribute('data-theme',(t==='light'||t==='dark')?t:(matchMedia('(prefers-color-scheme:dark)').matches?'dark':'light'));}catch(e){}`,
          }}
        />
        {/* No-flash ACCESSIBILITY guard — runs synchronously during HTML parsing,
            BEFORE first paint, so a returning user's saved a11y adjustments (font
            scale, high contrast, readable font, etc.) are applied without a flash.
            Reads the same localStorage key ("switchy-a11y") and applies the same
            <html> classes + --a11y-font-scale var that <AccessibilityWidget> does
            (kept in sync with that component + app/globals.css). Mirrors the theme
            guard above; the injected string is a static literal (no user input),
            fail-soft in private mode. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var s=JSON.parse(localStorage.getItem('switchy-a11y')||'{}'),r=document.documentElement,f=Math.min(1.6,Math.max(0.9,Number(s.fontScale)||1));r.style.setProperty('--a11y-font-scale',String(f));r.classList.toggle('a11y-font-scaled',f!==1);r.classList.toggle('a11y-contrast',!!s.contrast);r.classList.toggle('a11y-underline-links',!!s.underlineLinks);r.classList.toggle('a11y-readable-font',!!s.readableFont);r.classList.toggle('a11y-no-motion',!!s.noMotion);r.classList.toggle('a11y-focus',!!s.focusOutline);}catch(e){}`,
          }}
        />
        {/* Tell the UA both schemes exist so native controls/scrollbars adapt. */}
        <meta name="color-scheme" content="light dark" />

        {/* Perf resource hints — GA4 (gtag.js) loads lazyOnload, so we only warm
            DNS (cheap, no socket/TLS held open) for its hosts. This overlaps the
            name-resolution with idle time WITHOUT competing with the first-party
            LCP fetch the way a full preconnect would. The fonts are already
            preloaded + self-hosted by next/font (no gstatic hop), so no font
            preconnect is needed. Meta Pixel hosts are intentionally omitted —
            the pixel is opt-in/unset by default, so a hint would go unused. */}
        <link rel="dns-prefetch" href="https://www.googletagmanager.com" />
        <link rel="dns-prefetch" href="https://www.google-analytics.com" />

        {/* Site-wide structured data: Organization + WebSite (SearchAction). */}
        <JsonLd data={orgSchema()} />
        <JsonLd data={websiteSchema()} />
      </head>
      <body className="min-h-full flex flex-col">
        {/* GA4 Consent Mode v2 — DEFAULTS to denied for every storage type, set
            BEFORE GA loads so Google Analytics stays cookieless until the user
            opts in (mirrors the static site's <head> gtag snippet). This runs
            with `beforeInteractive` so the default is queued into dataLayer ahead
            of the GA `config` below; the <ConsentBanner> later replays/updates the
            grant. Cookie-consent managers are the canonical beforeInteractive use
            case per the next/script docs. */}
        <Script id="ga4-consent-default" strategy="beforeInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('consent', 'default', {
              ad_storage: 'denied',
              ad_user_data: 'denied',
              ad_personalization: 'denied',
              analytics_storage: 'denied'
            });
          `}
        </Script>

        {/* Skip link — first focusable element; visually hidden until focused. */}
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:start-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-accent focus:px-4 focus:py-2 focus:font-medium focus:text-accent-contrast focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-accent"
        >
          דלג לתוכן
        </a>

        {/* Auth/session/profile context — wraps the header (account menu) and every
            page (the community reads useAuth()). Client provider; the server-rendered
            header + children pass through unchanged. Fail-soft with no Supabase env. */}
        <AuthProvider>
          {/* Site-wide sticky masthead — brand + primary nav + CTA, on every route. */}
          <SiteHeader />

          {children}
        </AuthProvider>

        {/* Site-wide footer — links to /transparency (and glossary etc.) on every route. */}
        <SiteFooter />

        {/* Google Analytics 4 — loaded during browser idle (lazyOnload) so the
            3rd-party googletagmanager fetch doesn't compete with first-party LCP
            resources. Analytics doesn't need to fire before the page is idle.
            `gtag()` queues into dataLayer, so the init order stays correct even
            though both scripts defer — and the Consent Mode v2 default (denied,
            set beforeInteractive above) is already queued ahead of this `config`,
            so GA loads but tracks nothing until <ConsentBanner> grants consent. */}
        <Script
          src={`https://www.googletagmanager.com/gtag/js?id=${GA4_MEASUREMENT_ID}`}
          strategy="lazyOnload"
        />
        <Script id="ga4-init" strategy="lazyOnload">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', '${GA4_MEASUREMENT_ID}');
          `}
        </Script>

        {/* Cookie-consent gate — RTL Hebrew banner. Persists the choice in
            localStorage; respects a stored choice on load (no flash for returning
            users) and replays a stored grant via gtag('consent','update'). */}
        <ConsentBanner />

        {/* PWA shell: registers the service worker (offline shell + cache-busting
            + push handlers) and surfaces the opt-in for price-drop / renewal web
            push. Fail-soft — renders nothing when push is unsupported/unconfigured. */}
        <PwaInstaller />

        {/* NOTE: the AI concierge + the persistent accessibility menu were moved
            into <SiteHeader> (owner request) — they now render as inline buttons in
            the sticky masthead's end cluster (beside the theme toggle) instead of
            bottom-corner FABs, so they never overlap page content. Mounted there,
            not here (a single mount site-wide via the header). */}

        {/* Realtime catalogue freshness ON TOP of the server-rendered ISR HTML.
            A SINGLE Supabase Realtime channel (site-wide) listens for owner edits
            to public.plans and debounces a router.refresh so the catalogue
            surfaces (compare / category / plan-detail) re-pull fresh DB prices
            without a reload. Fail-soft (no env / no realtime ⇒ no-op, no errors)
            and SEO-safe — the server HTML already carries the real prices + JSON-LD;
            this only freshens for live users. Renders only a subtle "מתעדכן…" pill
            while a refresh is in flight. */}
        <CatalogueLiveRefresh />
      </body>
    </html>
  );
}
