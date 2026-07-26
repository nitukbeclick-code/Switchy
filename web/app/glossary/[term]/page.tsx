import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import JsonLd from "@/components/JsonLd";
import CommissionDisclosure from "@/components/CommissionDisclosure";
import LeadFormLazy from "@/components/LeadFormLazy";
import RelatedAuthorityPages from "@/components/RelatedAuthorityPages";
import {
  catalogueTrustStats,
  getGlossary,
  getGlossaryTerm,
  CATEGORY_HE,
} from "@/lib/data";
import {
  definedTermSchema,
  breadcrumbSchema,
} from "@/lib/schema";
import { pageMetadata } from "@/lib/seo";

// Pre-render one page per glossary term at build time. Unknown terms -> real 404.
export const dynamicParams = false;
export function generateStaticParams() {
  return getGlossary().map((t) => ({ term: t.slug }));
}

interface Params {
  params: Promise<{ term: string }>;
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { term } = await params;
  const entry = getGlossaryTerm(term);
  if (!entry) return {};
  return pageMetadata({
    title: `${entry.term} — מילון מונחי תקשורת`,
    description: entry.definition.slice(0, 155),
    path: `/glossary/${entry.slug}`,
  });
}

export default async function GlossaryTermPage({ params }: Params) {
  const { term } = await params;
  const entry = getGlossaryTerm(term);
  if (!entry) notFound();

  const crumbs = [
    { name: "בית", url: "/" },
    { name: "מילון מונחים", url: "/glossary" },
    { name: entry.term, url: `/glossary/${entry.slug}` },
  ];

  // Related links: the categories this term applies to (when tagged) + other
  // terms — so a term page never dead-ends and ties back into the entity web.
  const related: { title: string; href: string; description?: string }[] = [];
  const cats: string[] = Array.isArray(entry.categories) ? entry.categories : [];
  for (const cat of cats) {
    const he = CATEGORY_HE[cat] ?? cat;
    related.push({
      title: `השוואת מסלולי ${he}`,
      href: `/compare/${cat}`,
      description: `מונחים כמו "${entry.term}" רלוונטיים לבחירת מסלול ${he}.`,
    });
  }
  for (const other of getGlossary()
    .filter((t) => t.slug !== entry.slug)
    .slice(0, 6)) {
    related.push({
      title: other.term,
      href: `/glossary/${other.slug}`,
      description: other.definition.slice(0, 90),
    });
  }

  return (
    <main id="main" className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 sm:px-6">
      {/* DefinedTerm structured data for this single term. */}
      <JsonLd
        data={definedTermSchema({
          term: entry.term,
          definition: entry.definition,
          url: `/glossary/${entry.slug}`,
        })}
      />
      <JsonLd data={breadcrumbSchema(crumbs)} />

      {/* ── Breadcrumb (visible) ──────────────────────────────────────────── */}
      <nav aria-label="פירורי לחם" className="text-sm text-muted">
        <Link href="/" className="interactive underline underline-offset-2 hover:text-accent">
          בית
        </Link>
        <span className="px-1.5">/</span>
        <Link href="/glossary" className="interactive underline underline-offset-2 hover:text-accent">
          מילון מונחים
        </Link>
        <span className="px-1.5">/</span>
        <span className="text-foreground">{entry.term}</span>
      </nav>

      <article className="mt-4">
        <header>
          <p className="text-xs font-semibold uppercase tracking-wide text-accent-text">
            מילון מונחים
          </p>
          <h1 className="mt-2 font-display text-3xl font-bold tracking-tight text-ink sm:text-4xl">
            {entry.term}
          </h1>
        </header>
        {/* Definition lives in a soft bento card — breathing room + soft border,
            comfortable long-form leading for the explainer copy. */}
        <div className="bento mt-6 p-6 sm:p-8">
          <p className="text-lg leading-[1.85] text-foreground">
            {entry.definition}
          </p>
        </div>
      </article>

      {/* ── The ask ───────────────────────────────────────────────────────────
          A term page is one paragraph long and, until now, ended in a link list —
          no form, no bar, no /book. Someone who just looked up "ניוד מספר" or
          "התחייבות" is mid-decision. Same compact, consent-gated ask the category
          landings use; no `defaultCategory` because a term is not a service. ──── */}
      <section
        id="lead"
        aria-labelledby="term-lead-h"
        className="mt-16 scroll-mt-6"
      >
        <h2
          id="term-lead-h"
          className="h-section text-ink"
        >
          רוצים לדעת איך {entry.term} משפיע על החשבון שלכם?
        </h2>
        <p className="mt-2 text-foreground">
          השאירו פרטים ונחזור אליכם עם השוואה אישית בשפה פשוטה — חינם, בלי
          התחייבות, והמספר נשאר שלכם.
        </p>
        {/* §7b paid-relationship disclosure. A term page is one definition long and
            quotes no ₪ at all, so there are no prices to sit above; what triggers
            the obligation is the form, which hands the reader to a referral we are
            paid for. Hence it goes with the ask, ABOVE the fields — read before a
            phone number is typed, not after the submit button. */}
        <CommissionDisclosure variant="inline" className="mt-4 max-w-xl" />
        <div className="mt-5 max-w-xl">
          <LeadFormLazy source="glossary" trustStats={catalogueTrustStats()} />
        </div>
      </section>

      {/* ── Related — keep the entity web connected ───────────────────────── */}
      <RelatedAuthorityPages
        heading="קשור גם ל"
        links={related}
        className="mt-16 border-t border-border/40 pt-10"
      />
    </main>
  );
}
