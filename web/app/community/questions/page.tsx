// ────────────────────────────────────────────────────────────────────────────
// /community/questions — the public, indexable Q&A hub: the latest ANSWERED
// community questions, each linking to its /community/post/[id] permalink. This is
// the crawl entry point that makes the permalinks discoverable (the interactive
// /community feed stays noindex + login-gated). Read-only, ANON key, non-flagged +
// answered rows only. Everything escaped via JSX {}.
//
// Crawl topology: channel filter chips are real <Link>s and a before-cursor
// "לשאלות ישנות יותר" pager walks past the first 50 rows — together they close the
// orphan gap between the hub's window and the sitemap's 500 permalinks (posts
// 51-500 are now reachable by link, not only by <loc>). Canonical stays the bare
// /community/questions (the filtered/paged variants are crawl paths, not
// alternate documents). A lean ItemList JSON-LD enumerates the rendered links.
// ────────────────────────────────────────────────────────────────────────────

import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@supabase/supabase-js";
import JsonLd from "@/components/JsonLd";
import { pageMetadata } from "@/lib/seo";
import { linkItemListSchema } from "@/lib/schema";
import { clip, heDate } from "@/lib/community-render";
import { ALL_CHANNEL, CHANNELS } from "@/lib/community";
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

const PAGE_SIZE = 50;

interface QRow {
  id: string;
  channel: string;
  body: string;
  reply_count: number;
  created_at: string;
}

// The hub's public gate — answered (reply_count>=1) + non-flagged ONLY; the same
// invariant the sitemap and the permalink index gate enforce. Optional channel
// filter + created_at before-cursor for "load older" pages.
async function fetchAnswered(opts: { channel?: string; before?: string }): Promise<QRow[]> {
  const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  let query = sb
    .from("community_feed")
    .select("id,channel,body,reply_count,created_at")
    .eq("is_flagged", false)
    .gte("reply_count", 1)
    .order("created_at", { ascending: false })
    .limit(PAGE_SIZE);
  if (opts.channel) query = query.eq("channel", opts.channel);
  if (opts.before) query = query.lt("created_at", opts.before);
  const { data } = await query;
  return (data as QRow[]) ?? [];
}

/** Hub URL for a channel filter + before-cursor combination (bare when neither). */
function hubHref(channel?: string, before?: string): string {
  const q = new URLSearchParams();
  if (channel) q.set("channel", channel);
  if (before) q.set("before", before);
  const s = q.toString();
  return s ? `/community/questions?${s}` : "/community/questions";
}

interface PageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function CommunityQuestionsPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  // Validate: channel must be one of the real community channels; before must be
  // a parseable timestamp. Anything else falls back to the bare hub.
  const rawChannel = typeof sp.channel === "string" ? sp.channel : undefined;
  const channel =
    rawChannel && (CHANNELS as readonly string[]).includes(rawChannel)
      ? rawChannel
      : undefined;
  const rawBefore = typeof sp.before === "string" ? sp.before : undefined;
  const before =
    rawBefore && !Number.isNaN(Date.parse(rawBefore)) ? rawBefore : undefined;

  const items = await fetchAnswered({ channel, before });
  const itemList = linkItemListSchema({
    name: "שאלות ותשובות — קהילת חוסך",
    links: items.map((q) => ({
      url: `/community/post/${q.id}`,
      name: clip(q.body, 80),
    })),
  });

  const chipBase =
    "inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
  const chipCls = (active: boolean) =>
    `${chipBase} ${
      active
        ? "border-accent/50 bg-accent/10 font-semibold text-accent-text"
        : "border-border bg-surface text-muted hover:text-ink"
    }`;

  return (
    <main id="main" className="mx-auto w-full max-w-2xl px-4 py-6 sm:py-10">
      {itemList && <JsonLd data={itemList} />}

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

      <nav aria-label="סינון לפי ערוץ" className="mb-5 flex flex-wrap justify-center gap-2">
        <Link
          href={hubHref()}
          className={chipCls(!channel)}
          aria-current={!channel ? "page" : undefined}
        >
          {ALL_CHANNEL}
        </Link>
        {CHANNELS.map((c) => (
          <Link
            key={c}
            href={hubHref(c)}
            className={chipCls(channel === c)}
            aria-current={channel === c ? "page" : undefined}
          >
            {c}
          </Link>
        ))}
      </nav>

      {items.length === 0 ? (
        <div className="rounded-2xl border border-border bg-surface p-8 text-center shadow-soft">
          <p className="text-base font-semibold text-ink">
            {channel || before ? "אין כאן שאלות ותשובות נוספות" : "עדיין אין שאלות ותשובות"}
          </p>
          <p className="mt-1 text-sm text-muted">היו הראשונים לשאול או לשתף חוויה.</p>
          <Link
            href="/community"
            className="press mt-4 inline-flex items-center justify-center rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-accent-contrast shadow-soft transition-colors hover:bg-accent-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            למעבר לקהילה ←
          </Link>
        </div>
      ) : (
        <>
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
                    <time dateTime={q.created_at}>{heDate(q.created_at)}</time>
                  </div>
                </Link>
              </li>
            ))}
          </ul>

          {items.length === PAGE_SIZE && (
            <div className="mt-5 text-center">
              <Link
                href={hubHref(channel, items[items.length - 1].created_at)}
                className="press inline-flex items-center justify-center rounded-xl border border-border bg-surface px-5 py-2.5 text-sm font-semibold text-ink shadow-soft transition-colors hover:border-accent/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                לשאלות ישנות יותר ←
              </Link>
            </div>
          )}
        </>
      )}
    </main>
  );
}
