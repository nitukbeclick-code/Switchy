// ────────────────────────────────────────────────────────────────────────────
// /community/post/[id] — a public, SEO-indexable read-only permalink for a single
// community post + its answers. The interactive feed (/community) stays login-gated
// and noindex; THIS is the citeable Q&A surface (great long-tail Hebrew content).
//
// Server-rendered with the ANON key (community_feed is public; only is_flagged=false
// rows are read — a flagged/missing post 404s, so moderated content is never
// indexed). "Answered-only" index gate: a post with no real reply is noindex,follow
// (reduces indexing an unanswered line that slipped moderation). All user content is
// escaped via JSX {}; provider names linkify to the catalogue; @mentions render bold.
// ────────────────────────────────────────────────────────────────────────────

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import JsonLd from "@/components/JsonLd";
import { pageMetadata } from "@/lib/seo";
import { MENTION_RE, orderByAccepted } from "@/lib/community";
import ShareBar from "@/components/community/ShareBar";
import { matchProviders, providerBySlug } from "@/lib/providers.generated";
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
}

async function fetchPost(id: string): Promise<PostRow | null> {
  const { data } = await sb()
    .from("community_feed")
    .select("id,author,avatar,channel,body,created_at,media_type,media_url,provider_slug,accepted_reply_id")
    .eq("id", id)
    .eq("is_flagged", false)
    .maybeSingle();
  return (data as PostRow) ?? null;
}
async function fetchReplies(id: string): Promise<ReplyRow[]> {
  const { data } = await sb()
    .from("community_replies")
    .select("id,author,body,created_at,media_type,media_url")
    .eq("post_id", id)
    .eq("is_flagged", false)
    .order("created_at", { ascending: true });
  return (data as ReplyRow[]) ?? [];
}

function clip(s: string, n: number): string {
  const t = (s ?? "").replace(/\s+/g, " ").trim();
  return t.length > n ? t.slice(0, n - 1).trimEnd() + "…" : t;
}

/** Hebrew date, e.g. "6 ביולי 2026". */
function heDate(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  return d.toLocaleDateString("he-IL", { day: "numeric", month: "long", year: "numeric" });
}

/** Server-side body render: text + @mentions (bold) + provider names (catalogue
 *  links). Segments are escaped strings via JSX {} / a next/link with text children. */
function renderBody(body: string): React.ReactNode {
  type Span = { start: number; end: number; kind: "mention" | "provider"; slug?: string };
  const spans: Span[] = [];
  for (const m of body.matchAll(MENTION_RE)) {
    const start = m.index ?? 0;
    spans.push({ start, end: start + m[0].length, kind: "mention" });
  }
  for (const p of matchProviders(body, spans)) {
    spans.push({ start: p.start, end: p.end, kind: "provider", slug: p.slug });
  }
  spans.sort((a, b) => a.start - b.start);
  const nodes: React.ReactNode[] = [];
  let last = 0;
  let key = 0;
  for (const s of spans) {
    if (s.start < last) continue;
    if (s.start > last) nodes.push(body.slice(last, s.start));
    const text = body.slice(s.start, s.end);
    if (s.kind === "mention") {
      nodes.push(
        <span key={`s${key++}`} className="font-semibold text-accent-text">
          {text}
        </span>,
      );
    } else {
      nodes.push(
        <Link key={`s${key++}`} href={`/providers/${s.slug}`} className="font-medium text-accent-text underline-offset-2 hover:underline">
          {text}
        </Link>,
      );
    }
    last = s.end;
  }
  if (last < body.length) nodes.push(body.slice(last));
  return nodes;
}

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
  const { count } = await sb()
    .from("community_replies")
    .select("id", { count: "exact", head: true })
    .eq("post_id", id)
    .eq("is_flagged", false);
  const answered = (count ?? 0) >= 1;
  const title = clip(post.body, 60) || `דיון בקהילת חוסך — ${post.channel}`;
  return pageMetadata({
    title: `${title} — קהילת חוסך`,
    description: clip(post.body, 155) || "שאלה, חוויה או המלצה בקהילת חוסך.",
    path: `/community/post/${id}`,
    // Answered-only: only index a post that has a real reply (a genuine Q&A).
    robots: { index: answered, follow: true },
  });
}

export default async function CommunityPostPage({ params }: Params) {
  const { id } = await params;
  const post = await fetchPost(id);
  if (!post) notFound();
  const replies = await fetchReplies(id);
  const prov = post.provider_slug ? providerBySlug(post.provider_slug) : undefined;

  // The accepted answer = the reply the post author chose as best (if it's among
  // the visible, non-flagged replies); otherwise fall back to the earliest reply.
  const answerOf = (r: ReplyRow) => ({
    "@type": "Answer",
    text: r.body,
    author: { "@type": "Person", name: r.author },
    dateCreated: r.created_at,
  });
  // Shared helper: the author's chosen answer (or null) + the display order with it
  // floated to the top. Only an ACTUAL author choice gets the badge / float.
  const { accepted: chosen, ordered: displayReplies } = orderByAccepted(replies, post.accepted_reply_id);
  const hasChosenAnswer = chosen !== null;
  // JSON-LD acceptedAnswer: the author's choice if any, else the earliest reply
  // (SEO completeness — a genuine Q&A still declares its answer).
  const accepted = chosen ?? replies[0];
  const others = replies.filter((r) => r.id !== accepted?.id);

  // Truthful QAPage JSON-LD — real question + real answers only.
  const qaSchema: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "QAPage",
    mainEntity: {
      "@type": "Question",
      name: clip(post.body, 120) || `דיון בערוץ ${post.channel}`,
      text: post.body,
      answerCount: replies.length,
      author: { "@type": "Person", name: post.author },
      dateCreated: post.created_at,
      ...(replies.length > 0 && accepted
        ? {
            acceptedAnswer: answerOf(accepted),
            ...(others.length > 0 ? { suggestedAnswer: others.map(answerOf) } : {}),
          }
        : {}),
    },
  };

  return (
    <main id="main" className="mx-auto w-full max-w-2xl px-4 py-6 sm:py-10">
      <JsonLd data={qaSchema} />

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
            {renderBody(post.body)}
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
          {displayReplies.map((r) => {
            const isAccepted = hasChosenAnswer && r.id === post.accepted_reply_id;
            return (
            <li
              key={r.id}
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
                <span className="text-sm font-semibold text-ink">{r.author}</span>
                <time dateTime={r.created_at} className="text-xs text-muted">
                  {heDate(r.created_at)}
                </time>
              </div>
              {r.body && (
                <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground">
                  {renderBody(r.body)}
                </p>
              )}
              <Media type={r.media_type} url={r.media_url} />
            </li>
            );
          })}
        </ul>
      </section>

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
