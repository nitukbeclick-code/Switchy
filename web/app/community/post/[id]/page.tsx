// ────────────────────────────────────────────────────────────────────────────
// /community/post/[id] — a public, SEO-indexable read-only permalink for a single
// community post + its answers. The interactive feed (/community) stays login-gated
// and noindex; THIS is the citeable Q&A surface (great long-tail Hebrew content).
//
// Server-rendered with the ANON key (community_feed is public; only is_flagged=false
// rows are read — a flagged/missing post 404s, so moderated content is never
// indexed). "Answered-only" index gate (lib/community-schema permalinkRobots): a
// post with no real reply is noindex,follow. fetchPost/fetchReplies are wrapped in
// React cache() so generateMetadata + the page body share ONE fetch each (2 queries
// instead of 4) and 'answered' is derived from the SAME reply list the page renders
// — the metadata can never disagree with the body. All user content is escaped via
// JSX {}; provider names linkify to the catalogue; @mentions render bold.
// ────────────────────────────────────────────────────────────────────────────

import { cache } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import JsonLd from "@/components/JsonLd";
import { pageMetadata } from "@/lib/seo";
import { breadcrumbSchema } from "@/lib/schema";
import { orderByAccepted, toReplyTree, type CommunityReply } from "@/lib/community";
import { buildQaSchema, permalinkRobots } from "@/lib/community-schema";
import { clip, heDate, renderBody } from "@/lib/community-render";
import ShareBar from "@/components/community/ShareBar";
import { providerBySlug } from "@/lib/providers.generated";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "@/lib/supabase-public";

export const revalidate = 300;

function sb() {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

interface PostRow {
  id: string;
  author: string;
  avatar: string | null;
  channel: string;
  body: string;
  created_at: string;
  edited_at: string | null;
  media_type: "image" | "video" | "audio" | null;
  media_url: string | null;
  provider_slug: string | null;
  accepted_reply_id: string | null;
}
interface ReplyRow {
  id: string;
  author: string;
  body: string;
  created_at: string;
  media_type: "image" | "video" | "audio" | null;
  media_url: string | null;
  parent_reply_id: string | null;
}

// React cache(): generateMetadata + the page component call these with the same
// id in the same request, so each hits Supabase ONCE per render (2 queries total).
const fetchPost = cache(async (id: string): Promise<PostRow | null> => {
  const { data } = await sb()
    .from("community_feed")
    .select(
      "id,author,avatar,channel,body,created_at,edited_at,media_type,media_url,provider_slug,accepted_reply_id",
    )
    .eq("id", id)
    .eq("is_flagged", false)
    .maybeSingle();
  return (data as PostRow) ?? null;
});
const fetchReplies = cache(async (id: string): Promise<ReplyRow[]> => {
  const { data } = await sb()
    .from("community_replies")
    .select("id,author,body,created_at,media_type,media_url,parent_reply_id")
    .eq("post_id", id)
    .eq("is_flagged", false)
    .order("created_at", { ascending: true });
  return (data as ReplyRow[]) ?? [];
});

interface SimilarRow {
  id: string;
  channel: string;
  body: string;
  reply_count: number;
  created_at: string;
  provider_slug: string | null;
}

// "שאלות דומות בקהילה" — ONE anon query over the SAME public gate the hub +
// sitemap use (is_flagged=false AND reply_count>=1: only answered, non-flagged
// posts are ever linked). Recent candidates are ranked client-side to prefer the
// same provider_slug, then the same channel; ties keep recency (stable sort).
async function fetchSimilar(post: PostRow, limit = 4): Promise<SimilarRow[]> {
  const { data } = await sb()
    .from("community_feed")
    .select("id,channel,body,reply_count,created_at,provider_slug")
    .eq("is_flagged", false)
    .gte("reply_count", 1)
    .neq("id", post.id)
    .order("created_at", { ascending: false })
    .limit(24);
  const rows = (data as SimilarRow[]) ?? [];
  const score = (r: SimilarRow) =>
    (post.provider_slug && r.provider_slug === post.provider_slug ? 2 : 0) +
    (r.channel === post.channel ? 1 : 0);
  return rows.sort((a, b) => score(b) - score(a)).slice(0, limit);
}

// Server-side body render: the shared lib/community-render renderBody (text +
// @mentions bold + provider names as catalogue links; all segments are escaped
// strings via JSX {} / a next/link with text children). This page keeps its own
// provider-link classes (pre-dating the shared helper's feed default), passed via
// linkClassName so the served DOM stays byte-identical to the old local copy.
const BODY_RENDER_OPTS = {
  linkProviders: true,
  linkClassName: "font-medium text-accent-text underline-offset-2 hover:underline",
} as const;

function Media({ type, url }: { type: PostRow["media_type"]; url: string | null }) {
  if (!url) return null;
  if (type === "image") {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt="תמונה שצורפה לדיון בקהילה" loading="lazy" decoding="async" className="mt-3 max-h-96 w-full rounded-xl border border-border object-cover" />;
  }
  if (type === "audio") {
    return <audio controls src={url} className="mt-3 w-full" />;
  }
  if (type === "video") {
    return <video controls src={url} className="mt-3 max-h-96 w-full rounded-xl border border-border" />;
  }
  return null;
}

/** One reply card (top-level or nested child — same markup as the old flat list). */
function ReplyCard({ reply, isAccepted }: { reply: ReplyRow; isAccepted: boolean }) {
  return (
    <div
      className={`rounded-2xl border p-4 shadow-float ${
        isAccepted ? "border-accent/50 bg-accent/5" : "border-border bg-surface"
      }`}
    >
      {isAccepted && (
        <p className="mb-1 inline-flex items-center gap-1 rounded-full bg-accent/10 px-2 py-0.5 text-[0.7rem] font-semibold text-accent-text">
          <span aria-hidden="true">✓</span>
          התשובה שנבחרה
        </p>
      )}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="text-sm font-semibold text-ink">{reply.author}</span>
        <time dateTime={reply.created_at} className="text-xs text-muted">
          {heDate(reply.created_at)}
        </time>
      </div>
      {reply.body && (
        <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground">
          {renderBody(reply.body, BODY_RENDER_OPTS)}
        </p>
      )}
      <Media type={reply.media_type} url={reply.media_url} />
    </div>
  );
}

interface Params {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params;
  const post = await fetchPost(id);
  if (!post) {
    return pageMetadata({
      title: "דיון בקהילת חוסך",
      description: "דיון בקהילת חוסך.",
      path: `/community/post/${id}`,
      robots: { index: false, follow: true },
    });
  }
  // 'answered' derives from the SAME (cached) non-flagged reply list the page
  // renders — no separate count query, no metadata/body drift.
  const replies = await fetchReplies(id);
  const title = clip(post.body, 60) || `דיון בקהילת חוסך — ${post.channel}`;
  return pageMetadata({
    title: `${title} — קהילת חוסך`,
    description: clip(post.body, 155) || "שאלה, חוויה או המלצה בקהילת חוסך.",
    path: `/community/post/${id}`,
    // Answered-only: only index a post that has a real reply (a genuine Q&A).
    robots: permalinkRobots(replies),
    // og:type article with the post's REAL timestamps (modified only when edited).
    article: {
      publishedTime: post.created_at,
      ...(post.edited_at ? { modifiedTime: post.edited_at } : {}),
    },
  });
}

export default async function CommunityPostPage({ params }: Params) {
  const { id } = await params;
  const post = await fetchPost(id);
  if (!post) notFound();
  const [replies, similar] = await Promise.all([fetchReplies(id), fetchSimilar(post)]);
  const prov = post.provider_slug ? providerBySlug(post.provider_slug) : undefined;

  // The author's chosen answer (badge), resolved on the FLAT list — the accepted
  // reply may be a nested child. Only an ACTUAL author choice gets the badge.
  const { accepted: chosen } = orderByAccepted(replies, post.accepted_reply_id);
  const hasChosenAnswer = chosen !== null;

  // Display threading: the shared 2-level tree (imported from lib/community —
  // orphan-safe, DB caps depth at 1), with the accepted ROOT floated to the top
  // (same ordering as the interactive thread). The cast is safe: toReplyTree only
  // reads id/parent_reply_id, and it returns the same objects it was given.
  const tree = toReplyTree(replies as unknown as CommunityReply[]) as unknown as Array<
    ReplyRow & { children: ReplyRow[] }
  >;
  const { ordered: displayTree } = orderByAccepted(tree, post.accepted_reply_id);

  // Truthful QAPage JSON-LD — real question + real answers only (the ANSWERS stay
  // FLAT: every visible reply is an Answer regardless of display indentation).
  const qaSchema = buildQaSchema(post, replies);
  const crumbTitle = clip(post.body, 60) || `דיון בערוץ ${post.channel}`;

  return (
    <main id="main" className="mx-auto w-full max-w-2xl px-4 py-6 sm:py-10">
      <JsonLd data={qaSchema} />
      <JsonLd
        data={breadcrumbSchema([
          { name: "בית", url: "/" },
          { name: "שאלות ותשובות", url: "/community/questions" },
          { name: crumbTitle, url: `/community/post/${id}` },
        ])}
      />

      <nav className="mb-4 text-sm text-muted">
        <Link href="/community/questions" className="hover:text-ink hover:underline">
          שאלות ותשובות
        </Link>{" "}
        · <span>{post.channel}</span>
      </nav>

      <article className="rounded-2xl border border-border bg-surface p-5 shadow-card sm:p-6">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-sm font-semibold text-ink">{post.author}</span>
          <span className="inline-flex items-center rounded-full border border-border px-2 py-0.5 text-[0.7rem] font-medium text-muted">
            {post.channel}
          </span>
          <time dateTime={post.created_at} className="text-xs text-muted">
            {heDate(post.created_at)}
          </time>
        </div>

        {post.body && (
          <p className="mt-3 whitespace-pre-wrap break-words text-base leading-relaxed text-foreground">
            {renderBody(post.body, BODY_RENDER_OPTS)}
          </p>
        )}
        <Media type={post.media_type} url={post.media_url} />

        {prov && (
          <Link
            href={`/providers/${prov.slug}`}
            className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-medium text-accent-text hover:border-accent/40"
          >
            <span aria-hidden="true">🔗</span>
            על הספק: {prov.name}
          </Link>
        )}
      </article>

      <div className="mt-3 flex items-center gap-2 px-1 text-sm text-muted">
        <span>שיתוף:</span>
        <ShareBar path={`/community/post/${id}`} body={post.body} />
      </div>

      <section aria-label="תגובות" className="mt-6">
        <h2 className="mb-3 text-sm font-semibold text-ink">
          {replies.length === 0
            ? "אין עדיין תגובות"
            : replies.length === 1
              ? "תגובה אחת"
              : `${replies.length.toLocaleString("he-IL")} תגובות`}
        </h2>
        <ul className="flex list-none flex-col gap-3 p-0">
          {displayTree.map((r) => (
            <li key={r.id}>
              <ReplyCard
                reply={r}
                isAccepted={hasChosenAnswer && r.id === post.accepted_reply_id}
              />
              {r.children.length > 0 && (
                <ul className="ms-4 mt-2 flex list-none flex-col gap-2 border-s-2 border-border ps-3">
                  {r.children.map((c) => (
                    <li key={c.id}>
                      <ReplyCard
                        reply={c}
                        isAccepted={hasChosenAnswer && c.id === post.accepted_reply_id}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      </section>

      {similar.length > 0 && (
        <section aria-label="שאלות דומות בקהילה" className="mt-8">
          <h2 className="mb-3 text-sm font-semibold text-ink">שאלות דומות בקהילה</h2>
          <ul className="flex list-none flex-col gap-2 p-0">
            {similar.map((q) => (
              <li key={q.id}>
                <Link
                  href={`/community/post/${q.id}`}
                  className="block rounded-2xl border border-border bg-surface p-4 shadow-card transition-colors [@media(hover:hover)_and_(pointer:fine)]:hover:border-accent/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                  <p className="line-clamp-2 text-sm font-medium leading-relaxed text-foreground">
                    {clip(q.body, 120)}
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
        </section>
      )}

      <div className="mt-8 rounded-2xl border border-border bg-surface p-5 text-center shadow-soft">
        <p className="text-sm text-foreground">רוצים להגיב או לשאול בעצמכם?</p>
        <Link
          href="/community"
          className="press mt-3 inline-flex items-center justify-center rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-accent-contrast shadow-soft transition-colors hover:bg-accent-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          הצטרפו לדיון בקהילה ←
        </Link>
      </div>
    </main>
  );
}
