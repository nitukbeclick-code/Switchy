// ────────────────────────────────────────────────────────────────────────────
// /switch/[provider] — a FACTUAL "מדריך מעבר/ניתוק" (Smart Exit) for one provider.
//
// Helpful-content, grounded in real Israeli consumer rights:
//   • זכות הניתוק (the disconnection right) — a provider must let you disconnect;
//   • ניוד מספר via מסלקת הניוד — you keep your number, free, handled by the NEW
//     provider; usually within one business day;
//   • מסלולים ללא התחייבות have no early-termination penalty; commitment plans may
//     bill only the remaining commitment per the contract you signed.
//
// HONESTY (E-E-A-T): we invent NO phone numbers, no exact in-app steps, and no
// fabricated cancellation timelines. The steps are accurate + general; for the
// authoritative procedure we link to the provider's OWN official site
// (providerOfficialUrl) and we always nudge users to compare alternatives first.
// ────────────────────────────────────────────────────────────────────────────

import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import JsonLd from "@/components/JsonLd";
import SgeSummary from "@/components/SgeSummary";
import AuthorityReasoning from "@/components/AuthorityReasoning";
import RelatedAuthorityPages from "@/components/RelatedAuthorityPages";
import TrackedOutboundLink from "@/components/TrackedOutboundLink";
import LeadForm from "@/components/LeadForm";
import {
  getProviders,
  getProvider,
  getPlans,
  providerOfficialUrl,
  CATEGORY_HE,
} from "@/lib/data";
import {
  faqPageSchema,
  breadcrumbSchema,
  knowledgeGraphSchema,
  SITE_URL,
  type QA,
} from "@/lib/schema";
import { leadCategory } from "@/lib/format";

// Pre-render one guide per derived provider at build time.
export function generateStaticParams() {
  return getProviders().map((p) => ({ provider: p.slug }));
}

interface Params {
  params: Promise<{ provider: string }>;
}

// Verification timestamp — when the legal framing behind this guide was reviewed.
const REVIEWED_AT = new Date().toISOString().slice(0, 10);

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { provider: slug } = await params;
  const provider = getProvider(slug);
  if (!provider) return {};
  return {
    title: `איך לעזוב את ${provider.name} — מדריך ניתוק וניוד מספר`,
    description:
      `מדריך עובדתי לניתוק ומעבר מ${provider.name}: זכות הניתוק, ניוד המספר דרך ` +
      `מסלקת הניוד, והודעה בכתב — בלי קנסות מיותרים. כולל קישור לדף הניתוק הרשמי ` +
      `והשוואת חלופות. חינם.`,
    alternates: { canonical: `/switch/${slug}` },
  };
}

/** Factual exit steps (general, accurate — never invented per-provider specifics). */
interface HowToStep {
  name: string;
  text: string;
}

function exitSteps(providerName: string): HowToStep[] {
  return [
    {
      name: "בדקו את תנאי ההתקשרות שלכם",
      text:
        `אתרו את מסמך תנאי ההתקשרות מול ${providerName} ובדקו אם המסלול שלכם הוא ` +
        "עם התחייבות או בלעדיה. במסלול ללא התחייבות אין קנס יציאה; במסלול עם " +
        "התחייבות ייתכן חיוב על יתרת תקופת ההתחייבות בלבד.",
    },
    {
      name: "בחרו ספק חדש והשוו חלופות",
      text:
        "לפני הניתוק, השוו מסלולים חלופיים כדי לבחור את המשתלם ביותר. אם אתם " +
        "מנייידים מספר סלולר, המעבר מתבצע דרך הספק החדש — אין צורך לנתק מראש.",
    },
    {
      name: "ניוד המספר מתבצע מול הספק החדש",
      text:
        "לשמירת מספר הטלפון, מסרו לספק החדש את המספר ופרטי הזיהוי. הספק החדש " +
        `מטפל בניוד מול מסלקת הניוד וסוגר את החשבון אצל ${providerName}. הניוד ` +
        "חינמי ומתבצע בדרך כלל תוך יום עסקים אחד.",
    },
    {
      name: "מסרו הודעת ניתוק בכתב ותעדו אותה",
      text:
        `אם אינכם מנייידים מספר (למשל אינטרנט/טלוויזיה), מסרו ל${providerName} ` +
        "הודעת ניתוק בערוצים הרשמיים, ושמרו תיעוד (אישור/מספר פנייה) של מועד " +
        "ההודעה. הספק מחויב להפסיק את השירות ולעצור את החיוב בהתאם לדין ולחוזה.",
    },
    {
      name: "ודאו החזרת ציוד ובדקו את החשבון הסופי",
      text:
        "אם קיבלתם ציוד בהשאלה (ממיר/ראוטר), בררו מול הספק כיצד להחזירו. בדקו " +
        "שהחשבון הסופי משקף את מועד הניתוק ושאין חיובים מעבר ליתרת ההתחייבות.",
    },
  ];
}

/**
 * HowTo JSON-LD (factual). Built inline because lib/schema (owned by another
 * agent) has no HowTo builder; the steps are accurate Israeli-rights guidance.
 */
function howToSchema(args: {
  providerName: string;
  url: string;
  steps: HowToStep[];
}): Record<string, unknown> {
  const { providerName, url, steps } = args;
  const absUrl = url.startsWith("http") ? url : `${SITE_URL}${url}`;
  return {
    "@context": "https://schema.org",
    "@type": "HowTo",
    name: `איך לעזוב את ${providerName} ולנייד את המספר`,
    description:
      `שלבים עובדתיים לניתוק ומעבר מ${providerName} בישראל — לפי זכות הניתוק ` +
      "וניוד מספר דרך מסלקת הניוד.",
    inLanguage: "he-IL",
    url: absUrl,
    totalTime: "P1D",
    step: steps.map((s, i) => ({
      "@type": "HowToStep",
      position: i + 1,
      name: s.name,
      text: s.text,
      url: `${absUrl}#step-${i + 1}`,
    })),
  };
}

export default async function SwitchProviderPage({ params }: Params) {
  const { provider: slug } = await params;
  const provider = getProvider(slug);
  if (!provider) notFound();

  const official = providerOfficialUrl(provider.name);
  const steps = exitSteps(provider.name);
  const pageUrl = `/switch/${slug}`;

  const crumbs = [
    { name: "בית", url: "/" },
    { name: "מדריכי מעבר וניתוק", url: "/switch" },
    { name: provider.name, url: pageUrl },
  ];

  // Provider-specific, FACTUAL FAQ (no invented numbers/steps).
  const faqs: QA[] = [
    {
      question: `איך מנתקים את ${provider.name}?`,
      answer:
        `כדי להתנתק מ${provider.name} יש למסור הודעת ניתוק בערוצים הרשמיים של ` +
        "הספק. אם אתם מנייידים מספר סלולר, אין צורך לנתק מראש — הספק החדש מבצע " +
        "את הניוד וסוגר את החשבון. מומלץ לתעד את מועד ההודעה." +
        (official ? " דף הניתוק הרשמי מקושר במדריך זה." : ""),
    },
    {
      question: `האם אשלם קנס אם אעזוב את ${provider.name}?`,
      answer:
        "במסלול ללא התחייבות אין קנס יציאה. במסלול עם התחייבות ייתכן חיוב על " +
        "יתרת תקופת ההתחייבות בלבד, בהתאם לחוזה שחתמתם עליו — לא קנס מעבר לכך. " +
        "בדקו את מסמך תנאי ההתקשרות שלכם.",
    },
    {
      question: `אוכל לשמור על המספר שלי כשאעזוב את ${provider.name}?`,
      answer:
        "כן. ניוד מספר בישראל הוא חינמי ושומר על אותו מספר. הניוד מתבצע מול " +
        `הספק החדש, שמטפל בסגירת החשבון מול ${provider.name} דרך מסלקת הניוד.`,
    },
    {
      question: `כמה זמן לוקח לעבור מ${provider.name} לספק אחר?`,
      answer:
        "ניוד מספר סלולר מתבצע בדרך כלל תוך יום עסקים אחד. מעבר אינטרנט/טלוויזיה " +
        "תלוי בתשתית ובתיאום התקנה ועשוי לקחת מספר ימים.",
    },
  ];

  const summary =
    `רוצים לעזוב את ${provider.name}? במסלול ללא התחייבות אפשר להתנתק בכל עת ללא ` +
    "קנס; במסלול עם התחייבות משלמים רק על יתרת התקופה. את המספר שומרים בניוד חינמי " +
    "דרך מסלקת הניוד, שמתבצע מול הספק החדש — בדרך כלל תוך יום עסקים.";

  // Editorial "why" — factual rights, transparently stated.
  const reasoning = [
    {
      title: "זכות הניתוק",
      reason:
        `${provider.name} מחויבת לאפשר לכם להתנתק לאחר מסירת הודעה — אין מצב של ` +
        "סירוב לניתוק. החיוב נעצר בהתאם לדין ולתנאי ההתקשרות.",
    },
    {
      title: "ניוד מספר חינמי",
      reason:
        "שמירת המספר במעבר ספק סלולר היא חינמית ומעוגנת בדין. הספק החדש מבצע את " +
        "הניוד דרך מסלקת הניוד, כך שלא צריך לנתק מראש בעצמכם.",
    },
    {
      title: "בלי קנסות מעבר ליתרת ההתחייבות",
      reason:
        "אם המסלול בהתחייבות, החיוב מוגבל ליתרת תקופת ההתחייבות בלבד לפי החוזה — " +
        "ולא קנס שרירותי. במסלול ללא התחייבות אין חיוב כלל.",
    },
    {
      title: "השוו לפני שעוזבים",
      reason:
        `כדי שהמעבר ישתלם, השוו חלופות ל${provider.name} לפי המחיר היום והמחיר ` +
        "אחרי המבצע. כך תדעו שאתם עוברים למסלול טוב יותר, לא רק שונה.",
    },
  ];

  // Related: this provider's categories' compare hubs + its own provider page.
  const related: {
    title: string;
    href: string;
    description?: string;
    external?: boolean;
  }[] = [];
  for (const cat of provider.categories) {
    const he = CATEGORY_HE[cat] ?? cat;
    related.push({
      title: `השוואת מסלולי ${he}`,
      href: `/compare/${cat}`,
      description: `מצאו חלופה משתלמת ל${provider.name} ב${he}.`,
    });
  }
  related.push({
    title: `כל המסלולים של ${provider.name}`,
    href: `/providers/${slug}`,
    description: "מחירים, מחיר אחרי המבצע וקטגוריות.",
  });
  related.push({
    title: "מדריכי מעבר לספקים אחרים",
    href: "/switch",
    description: "איך לעזוב כל ספק תקשורת בישראל.",
  });

  return (
    <main id="main" className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 sm:px-6">
      {/* Structured data: HowTo + FAQ + Breadcrumb + Knowledge Graph. */}
      <JsonLd data={howToSchema({ providerName: provider.name, url: pageUrl, steps })} />
      <JsonLd data={faqPageSchema(faqs)} />
      <JsonLd data={breadcrumbSchema(crumbs)} />
      <JsonLd
        data={knowledgeGraphSchema({
          pageUrl,
          pageName: `מדריך מעבר וניתוק — ${provider.name}`,
          pageType: "HowTo",
          providers: [provider],
          serviceType: "מדריך ניתוק וניוד מספר",
          description:
            `מדריך עובדתי לניתוק ומעבר מ${provider.name} בישראל.`,
        })}
      />

      {/* ── Breadcrumb (visible) ──────────────────────────────────────────── */}
      <nav aria-label="פירורי לחם" className="text-sm text-muted">
        <Link href="/" className="hover:text-accent">
          בית
        </Link>
        <span className="px-1.5">/</span>
        <Link href="/switch" className="hover:text-accent">
          מדריכי מעבר וניתוק
        </Link>
        <span className="px-1.5">/</span>
        <span className="text-foreground">{provider.name}</span>
      </nav>

      {/* ── Heading ───────────────────────────────────────────────────────── */}
      <header className="mt-3">
        <h1 className="font-display text-3xl font-bold text-ink sm:text-4xl">
          איך לעזוב את {provider.name}
        </h1>
        <p className="mt-3 text-lg text-foreground">
          מדריך עובדתי לניתוק ולמעבר מ{provider.name} — מבוסס על זכויות הצרכן
          בישראל. בלי מספרי טלפון מומצאים ובלי הבטחות: רק מה שמותר לכם לפי הדין,
          ולאן לפנות באופן הרשמי.
        </p>
      </header>

      {/* ── SGE summary ───────────────────────────────────────────────────── */}
      <div className="mt-8">
        <SgeSummary heading={`השורה התחתונה: לעזוב את ${provider.name}`}>
          {summary}
        </SgeSummary>
      </div>

      {/* ── Steps (HowTo, visible) ────────────────────────────────────────── */}
      <section aria-labelledby="steps-h" className="mt-12">
        <h2 id="steps-h" className="font-display text-2xl font-bold text-ink">
          שלב אחר שלב: לעזוב את {provider.name}
        </h2>
        <ol className="mt-5 space-y-4">
          {steps.map((s, i) => (
            <li
              key={s.name}
              id={`step-${i + 1}`}
              className="flex gap-4 rounded-xl border border-border bg-surface p-5 scroll-mt-6"
            >
              <span
                aria-hidden="true"
                className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-accent/10 font-display font-bold text-accent"
              >
                {i + 1}
              </span>
              <div>
                <h3 className="font-display font-semibold text-ink">{s.name}</h3>
                <p className="mt-1 text-foreground">{s.text}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* ── Official cancellation link (real only) ────────────────────────── */}
      <section
        aria-labelledby="official-h"
        className="mt-12 rounded-2xl border border-border bg-surface p-5 sm:p-6"
      >
        <h2
          id="official-h"
          className="font-display text-xl font-bold text-ink"
        >
          הדף הרשמי של {provider.name}
        </h2>
        {official ? (
          <>
            <p className="mt-2 text-foreground">
              להליך הניתוק המדויק ולפרטי הקשר העדכניים, פנו לאתר הרשמי של{" "}
              {provider.name}. הפרטים המחייבים מופיעים שם בלבד — אנחנו לא ממציאים
              מספרי טלפון או שלבים.
            </p>
            <TrackedOutboundLink
              href={official}
              target="_blank"
              rel="noopener noreferrer"
              provider={slug}
              dest="official"
              className="mt-4 inline-block rounded-xl bg-accent px-5 py-2.5 font-medium text-accent-contrast transition-colors hover:bg-accent-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
            >
              לאתר הרשמי של {provider.name} ←
            </TrackedOutboundLink>
          </>
        ) : (
          <p className="mt-2 text-foreground">
            את הליך הניתוק המדויק ופרטי הקשר העדכניים יש לבדוק בערוצים הרשמיים של{" "}
            {provider.name} (אתר/שירות לקוחות). איננו מציגים מספרי טלפון או שלבים
            שלא אומתו ישירות מול הספק.
          </p>
        )}
      </section>

      {/* ── Editorial reasoning (rights, transparently stated) ────────────── */}
      <section className="mt-12">
        <AuthorityReasoning
          heading={`הזכויות שלכם מול ${provider.name}`}
          points={reasoning}
          lead="המדריך מבוסס על זכויות הצרכן בתחום התקשורת בישראל:"
        />
      </section>

      {/* ── FAQ ───────────────────────────────────────────────────────────── */}
      <section aria-labelledby="faq-h" className="mt-14">
        <h2 id="faq-h" className="font-display text-2xl font-bold text-ink">
          שאלות נפוצות — מעבר מ{provider.name}
        </h2>
        <p className="mt-2 text-sm text-muted">עודכן לאחרונה: {REVIEWED_AT}</p>
        <div className="mt-5 divide-y divide-border rounded-xl border border-border bg-surface">
          {faqs.map((qa) => (
            <details key={qa.question} className="group p-5">
              <summary className="flex cursor-pointer list-none items-center gap-2 font-display font-semibold text-ink marker:hidden">
                <span>{qa.question}</span>
                <span
                  aria-hidden="true"
                  className="ms-auto shrink-0 text-muted transition-transform group-open:rotate-180"
                >
                  ▾
                </span>
              </summary>
              <p className="mt-2 text-foreground">{qa.answer}</p>
            </details>
          ))}
        </div>
      </section>

      {/* ── Lead form — help with the switch ──────────────────────────────── */}
      <section id="lead" aria-labelledby="lead-h" className="mt-16 scroll-mt-6">
        <h2 id="lead-h" className="font-display text-2xl font-bold text-ink">
          רוצים שנעזור לכם לעבור?
        </h2>
        <p className="mt-2 text-foreground">
          השאירו פרטים ונעזור לכם למצוא חלופה ולעבור — חינם, וללא התחייבות.
        </p>
        <div className="mt-5 max-w-xl">
          <LeadForm
            source="switch"
            defaultCategory={leadCategory(provider.categories[0])}
            trustStats={{
              planCount: getPlans().length,
              providerCount: getProviders().length,
            }}
          />
        </div>
      </section>

      {/* ── Related — no dead-ends ────────────────────────────────────────── */}
      <RelatedAuthorityPages
        heading="לפני שעוזבים — השוו חלופות"
        links={related}
        className="mt-16 border-t border-border pt-8"
      />
    </main>
  );
}
