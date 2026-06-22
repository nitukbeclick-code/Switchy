import type { Metadata } from "next";
import Script from "next/script";
import { Rubik, Assistant } from "next/font/google";
import "./globals.css";
import JsonLd from "@/components/JsonLd";
import SiteFooter from "@/components/SiteFooter";
import { orgSchema, websiteSchema, SITE_URL, SITE_NAME } from "@/lib/schema";

// Rubik for display/headings, Assistant for body/labels. Hebrew + latin subsets.
const rubik = Rubik({
  variable: "--font-rubik",
  subsets: ["hebrew", "latin"],
  display: "swap",
});

const assistant = Assistant({
  variable: "--font-assistant",
  subsets: ["hebrew", "latin"],
  display: "swap",
});

// GA4 Measurement ID (Google Analytics 4). Loaded site-wide via next/script.
const GA4_MEASUREMENT_ID = "G-YCTGRVN7SJ";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "חוסך / Switchy — השוואת מסלולי תקשורת בישראל",
    template: "%s | חוסך / Switchy",
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
    title: "חוסך / Switchy — השוואת מסלולי תקשורת בישראל",
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
        {children}

        {/* Site-wide footer — links to /transparency (and glossary etc.) on every route. */}
        <SiteFooter />

        {/* Google Analytics 4 (loaded after the page is interactive). */}
        <Script
          src={`https://www.googletagmanager.com/gtag/js?id=${GA4_MEASUREMENT_ID}`}
          strategy="afterInteractive"
        />
        <Script id="ga4-init" strategy="afterInteractive">
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
