import Link from "next/link";
import type { Metadata } from "next";
import JsonLd from "@/components/JsonLd";
import { getGlossary } from "@/lib/data";
import {
  definedTermSetSchema,
  breadcrumbSchema,
} from "@/lib/schema";

export const metadata: Metadata = {
  title: "מילון מונחי תקשורת",
  description:
    "מילון מונחי תקשורת בעברית — 5G, eSIM, סיב אופטי, ניוד מספר, התחייבות ועוד. " +
    "הסברים ברורים שיעזרו לכם להשוות מסלולי סלולר, אינטרנט וטלוויזיה נכון.",
  alternates: { canonical: "/glossary" },
};

export default function GlossaryPage() {
  const terms = getGlossary();

  const crumbs = [
    { name: "בית", url: "/" },
    { name: "מילון מונחים", url: "/glossary" },
  ];

  return (
    <main id="main" className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 sm:px-6">
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
        <Link href="/" className="interactive hover:text-accent">
          בית
        </Link>
        <span className="px-1.5">/</span>
        <span className="text-foreground">מילון מונחים</span>
      </nav>

      <header className="mt-4">
        <h1 className="font-display text-3xl font-bold tracking-tight text-ink sm:text-4xl">
          מילון מונחי תקשורת
        </h1>
        <p className="mt-4 max-w-2xl text-lg leading-relaxed text-foreground">
          {terms.length} מונחים בעברית שיעזרו לכם להבין ולהשוות מסלולי תקשורת —
          סלולר, אינטרנט, טלוויזיה וחבילות חו״ל.
        </p>
      </header>

      {/* Bento grid of term cards — each tile lifts on hover, soft accent border. */}
      <dl className="bento-grid mt-12">
        {terms.map((t) => (
          <Link
            key={t.slug}
            href={`/glossary/${t.slug}`}
            className="card card-interactive group flex flex-col p-5 sm:p-6"
          >
            <dt className="font-display text-lg font-semibold tracking-tight text-ink transition-colors group-hover:text-accent">
              {t.term}
            </dt>
            <dd className="mt-2 text-sm leading-relaxed text-foreground">
              {t.definition}
            </dd>
          </Link>
        ))}
      </dl>

    </main>
  );
}
