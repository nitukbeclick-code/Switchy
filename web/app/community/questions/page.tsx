// ────────────────────────────────────────────────────────────────────────────
// /community/questions — the public, indexable Q&A hub: the latest ANSWERED
// community questions, each linking to its /community/post/[id] permalink. This is
// the crawl entry point that makes the permalinks discoverable (the interactive
// /community feed stays noindex + login-gated). Read-only, ANON key, non-flagged +
// answered rows only. Everything escaped via JSX {}.
// ────────────────────────────────────────────────────────────────────────────

import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@supabase/supabase-js";
import { pageMetadata } from "@/lib/seo";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "@/lib/supabase-public";

export const revalidate = 300;

export const metadata: Metadata = pageMetadata({
  title: "שאלות ותשובות — קהילת חוסך",
  description:
    "שאלות, חוויות ותשובות אמיתיות של הקהילה על מסלולי סלולר, אינטרנט, טלוויזיה " +
    "וחבילות חו״ל — מאנשים שכבר עברו ספק.",
  path: "/community/questions",
  robots: { index: true, follow: true },
});

interface QRow {
  id: string;
  channel: string;
  body: string;
  reply_count: number;
  created_at: string;
}

function clip(s: string, n: number): string {
  const t = (s ?? "").replace(/\s+/g, " ").trim();
  return t.length > n ? t.slice(0, n - 1).trimEnd() + "…" : t;
}

async function fetchAnswered(): Promise<QRow[]> {
  const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data } = await sb
    .from("community_feed")
    .select("id,channel,body,reply_count,created_at")
    .eq("is_flagged", false)
    .gte("reply_count", 1)
    .order("created_at", { ascending: false })
    .limit(50);
  return (data as QRow[]) ?? [];
}

export default async function CommunityQuestionsPage() {
  const items = await fetchAnswered();

  return (
    <main id="main" className="mx-auto w-full max-w-2xl px-4 py-6 sm:py-10">
      <header className="mb-6 text-center">
        <h1 className="font-display text-2xl font-bold text-ink sm:text-3xl">
          שאלות ותשובות — קהילת חוסך
        </h1>
        <p className="mt-2 text-sm text-muted">
          שאלות, חוויות ותשובות אמיתיות של הקהילה על מסלולי תקשורת.{" "}
          <Link href="/community" className="font-medium text-accent-text underline">
            למעבר לקהילה
          </Link>
        </p>
      </header>

      {items.length === 0 ? (
        <div className="rounded-2xl border border-border bg-surface p-8 text-center shadow-soft">
          <p className="text-base font-semibold text-ink">עדיין אין שאלות ותשובות</p>
          <p className="mt-1 text-sm text-muted">היו הראשונים לשאול או לשתף חוויה.</p>
          <Link
            href="/community"
            className="press mt-4 inline-flex items-center justify-center rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-accent-contrast shadow-soft transition-colors hover:bg-accent-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            למעבר לקהילה ←
          </Link>
        </div>
      ) : (
        <ul className="flex list-none flex-col gap-3 p-0">
          {items.map((q) => (
            <li key={q.id}>
              <Link
                href={`/community/post/${q.id}`}
                className="block rounded-2xl border border-border bg-surface p-4 shadow-card transition-colors [@media(hover:hover)_and_(pointer:fine)]:hover:border-accent/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                <p className="line-clamp-2 text-sm font-medium leading-relaxed text-foreground">
                  {clip(q.body, 140)}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-x-2 text-xs text-muted">
                  <span className="inline-flex items-center rounded-full border border-border px-2 py-0.5 font-medium">
                    {q.channel}
                  </span>
                  <span className="nums-tabular tabular-nums">
                    {q.reply_count.toLocaleString("he-IL")} תגובות
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
