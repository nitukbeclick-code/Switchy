import Link from "next/link";
import type { Metadata } from "next";
import JsonLd from "@/components/JsonLd";
import LeadFormLazy from "@/components/LeadFormLazy";
import RelatedAuthorityPages from "@/components/RelatedAuthorityPages";
import EmptyState from "@/components/EmptyState";
import Icon from "@/components/Icon";
import { catalogueTrustStats, getGlossary } from "@/lib/data";
import {
  definedTermSetSchema,
  breadcrumbSchema,
} from "@/lib/schema";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "מילון מונחי תקשורת",
  description:
    "מילון מונחי תקשורת בעברית — 5G, eSIM, סיב אופטי, ניוד מספר, התחייבות ועוד. " +
    "הסברים ברורים שיעזרו לכם להשוות מסלולי סלולר, אינטרנט וטלוויזיה נכון.",
  path: "/glossary",
});

export default function GlossaryPage() {
  const terms = getGlossary();

  const crumbs = [
    { name: "בית", url: "/" },
    { name: "מילון מונחים", url: "/glossary" },
  ];

  return (
    <main id="main" className="mx-auto w-full max-w-5xl flex-1 px-4 py-10 sm:px-6">
      {/* DefinedTermSet structured data covering the whole glossary. */}
      <JsonLd
        data={definedTermSetSchema({
          name: "מילון מונחי תקשורת",
          description:
            "מונחי תקשורת בעברית להשוואת מסלולי סלולר, אינטרנט וטלוויזיה בישראל.",
          url: "/glossary",
          terms,
        })}
      />
      <JsonLd data={breadcrumbSchema(crumbs)} />

      {/* ── Breadcrumb (visible) ──────────────────────────────────────────── */}
      <nav aria-label="פירורי לחם" className="text-sm text-muted">
        <Link href="/" className="interactive underline underline-offset-2 hover:text-accent">
          בית
        </Link>
        <span className="px-1.5">/</span>
        <span className="text-foreground">מילון מונחים</span>
      </nav>

      <header className="mt-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-accent-text">
          מרכז הידע
        </p>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight text-ink sm:text-4xl">
          מילון מונחי תקשורת
        </h1>
        <p className="mt-4 max-w-2xl text-lg leading-relaxed text-foreground">
          {terms.length} מונחים בעברית שיעזרו לכם להבין ולהשוות מסלולי תקשורת —
          סלולר, אינטרנט, טלוויזיה וחבילות חו״ל.
        </p>
      </header>

      {terms.length === 0 ? (
        /* Designed empty state — never a blank grid. */
        <EmptyState
          className="mt-12"
          mascot
          title="המילון בדרך"
          description="עוד לא הוספנו מונחים לעמוד הזה. בינתיים אפשר לקפוץ ישר להשוואת המסלולים."
          cta={{ label: "להשוואת מסלולים", href: "/compare/cellular" }}
        />
      ) : (
        /* Bento grid of term cards — each tile lifts on hover, soft accent border. */
        <dl className="bento-grid mt-12">
          {terms.map((t) => (
            <Link
              key={t.slug}
              href={`/glossary/${t.slug}`}
              className="card card-interactive group flex flex-col p-5 sm:p-6"
            >
              <dt className="flex items-center justify-between gap-2 font-display text-lg font-semibold tracking-tight text-ink transition-colors group-hover:text-accent">
                {t.term}
                <Icon
                  name="arrow"
                  size={16}
                  aria-hidden="true"
                  className="flex-none text-accent transition-transform duration-200 ease-[var(--ease-out)] motion-safe:group-hover:-translate-x-0.5"
                />
              </dt>
              <dd className="mt-2 line-clamp-3 text-sm leading-relaxed text-foreground">
                {t.definition}
              </dd>
            </Link>
          ))}
        </dl>
      )}

      {/* ── The ask ───────────────────────────────────────────────────────────
          Someone reading the glossary is decoding a bill or an offer they were
          just given — real intent, and until now this hub carried no form, no bar
          and no /book link at all. Same compact, consent-gated ask the category
          landings use. No `defaultCategory`: the glossary spans every service. ── */}
      <section
        id="lead"
        aria-labelledby="glossary-lead-h"
        className="mt-16 scroll-mt-6"
      >
        <h2
          id="glossary-lead-h"
          className="font-display text-2xl font-bold tracking-tight text-ink"
        >
          לא בטוחים מה מתאים לכם? נעבור על זה יחד
        </h2>
        <p className="mt-2 text-foreground">
          השאירו פרטים ונחזור אליכם עם השוואה אישית בשפה פשוטה — חינם, בלי
          התחייבות, והמספר נשאר שלכם.
        </p>
        <div className="mt-5 max-w-xl">
          <LeadFormLazy source="glossary" trustStats={catalogueTrustStats()} />
        </div>
      </section>

      {/* Keep the entity web connected — the hub should never dead-end. */}
      <RelatedAuthorityPages
        heading="המשיכו מכאן"
        className="mt-16"
        links={[
          {
            href: "/guides",
            label: "מדריכים",
            hint: "איך עוברים ספק, בוחרים מסלול וחוסכים — שלב אחר שלב.",
          },
          {
            href: "/compare/cellular",
            label: "השוואת מסלולי סלולר",
            hint: "השוו מחירים בשקלים, מהקטלוג — חינם ובלי התחייבות.",
          },
          {
            href: "/compare/internet",
            label: "השוואת מסלולי אינטרנט",
            hint: "סיב אופטי וכבלים — מחיר מבצע ומחיר קבוע.",
          },
          {
            href: "/vs",
            label: "השוואות ראש בראש",
            hint: "ספק מול ספק בכל קטגוריה.",
          },
        ]}
      />
    </main>
  );
}
