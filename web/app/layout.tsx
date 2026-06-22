import type { Metadata } from "next";
import Script from "next/script";
import { Rubik, Assistant } from "next/font/google";
import "./globals.css";
import JsonLd from "@/components/JsonLd";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import { orgSchema, websiteSchema, SITE_URL, SITE_NAME } from "@/lib/schema";

// Rubik for display/headings, Assistant for body/labels. Hebrew-only subset: this
// is a Hebrew-first RTL site, so the latin subset is mostly dead weight (the few
// latin glyphs — "Switch AI", digits, ₪ — fall back gracefully). Dropping it trims
// the preloaded woff2 set that contends with the LCP resource. `display: swap`
// keeps text visible immediately (no FOIT).
const rubik = Rubik({
  variable: "--font-rubik",
  subsets: ["hebrew"],
  display: "swap",
});

const assistant = Assistant({
  variable: "--font-assistant",
  subsets: ["hebrew"],
  display: "swap",
});

// GA4 Measurement ID (Google Analytics 4). Loaded site-wide via next/script.
const GA4_MEASUREMENT_ID = "G-YCTGRVN7SJ";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "חוסך / Switch AI — השוואת מסלולי תקשורת בישראל",
    template: "%s | חוסך / Switch AI",
  },
  description:
    "השוואה חינמית של מסלולי סלולר, אינטרנט, טלוויזיה, חבילות משולבות וחבילות " +
    "חו״ל בישראל. משווים מחירים, רואים מה מתאים, ומתחברים לספק — בלי עלות.",
  applicationName: SITE_NAME,
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    locale: "he_IL",
    url: SITE_URL,
    siteName: SITE_NAME,
    title: "חוסך / Switch AI — השוואת מסלולי תקשורת בישראל",
    description:
      "השוואה חינמית של מסלולי תקשורת בישראל — סלולר, אינטרנט, טלוויזיה ועוד.",
  },
  robots: { index: true, follow: true },
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
      className={`${rubik.variable} ${assistant.variable} h-full antialiased`}
    >
      <head>
        {/* Site-wide structured data: Organization + WebSite (SearchAction). */}
        <JsonLd data={orgSchema()} />
        <JsonLd data={websiteSchema()} />
      </head>
      <body className="min-h-full flex flex-col">
        {/* Skip link — first focusable element; visually hidden until focused. */}
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:start-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-accent focus:px-4 focus:py-2 focus:font-medium focus:text-accent-contrast focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-accent"
        >
          דלג לתוכן
        </a>

        {/* Site-wide sticky masthead — brand + primary nav + CTA, on every route. */}
        <SiteHeader />

        {children}

        {/* Site-wide footer — links to /transparency (and glossary etc.) on every route. */}
        <SiteFooter />

        {/* Google Analytics 4 — loaded during browser idle (lazyOnload) so the
            3rd-party googletagmanager fetch doesn't compete with first-party LCP
            resources. Analytics doesn't need to fire before the page is idle.
            `gtag()` queues into dataLayer, so the init order stays correct even
            though both scripts defer. */}
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
      </body>
    </html>
  );
}
