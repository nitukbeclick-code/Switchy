// Pure helpers for community-digest — grouping/formatting + the one-click
// unsubscribe token. NO Deno.serve / no DB, so tests import this WITHOUT loading
// index.ts (whose top-level Deno.serve would be captured before a test stub
// installs — same rule as lead-digest/lib.ts).

import { escHtml, renderEmail } from "../_shared/email.ts";

// A weekly digest looks back over the last week's activity.
export const WINDOW_DAYS = 7;
// Recipients are fetched in id-cursor PAGES (not one capped query): the old
// single `limit=2000` read silently DROPPED every opted-in member past #2000 —
// a full, invisible under-send. Paging keeps each URL small and reaches everyone.
export const RECIPIENT_PAGE = 1000;
// Hard bound on pages per run so a misfire can never fan out unbounded email
// (RECIPIENT_PAGE × MAX_RECIPIENT_PAGES = 25,000 recipients absolute ceiling).
export const MAX_RECIPIENT_PAGES = 25;
// The unread-notifications read is CHUNKED: `user_id=in.(…)` with 2000 uuids
// built a ~74KB URL that PostgREST/edge proxies can reject — and a rejected
// read meant EVERY member silently got no digest. 100-150 ids per request keeps
// each URL ~4.5KB; 120 balances request count vs. headroom.
export const UNREAD_CHUNK = 120;

/** Split ids into chunks of ≤ `size` (order-preserving). Pure + total. */
export function chunkIds(ids: string[], size = UNREAD_CHUNK): string[][] {
  const n = Math.max(1, Math.floor(size));
  const out: string[][] = [];
  for (let i = 0; i < ids.length; i += n) out.push(ids.slice(i, i + n));
  return out;
}

/** Fetch ALL rows of an id-ordered table through an injected page fetcher
 *  (cursorId = the last id of the previous page; "" for the first page).
 *  Stops on a short page (exhausted), a failed page (fail-soft: returns what
 *  was already fetched + failed:true), or the maxPages misfire bound
 *  (truncated:true). Injected I/O ⇒ unit-testable without a DB. */
export async function fetchAllPaged<T extends { id: string }>(
  fetchPage: (cursorId: string) => Promise<T[] | null>,
  pageSize: number,
  maxPages: number,
): Promise<{ rows: T[]; pages: number; failed: boolean; truncated: boolean }> {
  const rows: T[] = [];
  let cursor = "";
  for (let page = 0; page < maxPages; page++) {
    const got = await fetchPage(cursor);
    if (got === null) return { rows, pages: page, failed: true, truncated: false };
    rows.push(...got);
    if (got.length < pageSize) return { rows, pages: page + 1, failed: false, truncated: false };
    cursor = got[got.length - 1].id;
  }
  return { rows, pages: maxPages, failed: false, truncated: true };
}

/** Read unread-notification rows for `ids` in chunks of `size` via an injected
 *  chunk fetcher. Fail-soft PER CHUNK: a failed chunk is counted and skipped
 *  (those members are simply not mailed this week — under-send is always safer
 *  than a fabricated digest), the remaining chunks still land. Pure over the
 *  injected I/O ⇒ unit-testable without a DB. */
export async function fetchUnreadChunked(
  ids: string[],
  fetchChunk: (chunk: string[]) => Promise<NotifRow[] | null>,
  size = UNREAD_CHUNK,
): Promise<{ rows: NotifRow[]; failedChunks: number }> {
  const rows: NotifRow[] = [];
  let failedChunks = 0;
  for (const chunk of chunkIds(ids, size)) {
    const got = await fetchChunk(chunk);
    if (got === null) {
      failedChunks++;
      continue;
    }
    rows.push(...got);
  }
  return { rows, failedChunks };
}

// ── unread notification grouping ──────────────────────────────────────────────

export interface NotifRow {
  user_id: string;
  kind: string;
}

export interface UnreadSummary {
  total: number;
  byKind: Record<string, number>;
}

// Hebrew labels for the ENGAGEMENT notification kinds surfaced in the digest.
// community-notify's full kind union is reply | mention | flag | reaction | like |
// pinned, but 'flag' (a moderation notice) is intentionally excluded here — it's
// filtered out of the query too — so the digest stays a positive re-engagement
// nudge. Rendered in this stable order so the email reads the same every week.
// Labels are distinct (reaction ≠ reply) to avoid the "תגובות" collision.
export const KIND_ORDER: readonly string[] = ["reply", "mention", "reaction", "like", "pinned"];
export const KIND_LABEL: Record<string, string> = {
  reply: "תגובות חדשות",
  mention: "תיוגים (@)",
  reaction: "רגשונים על התוכן שלך",
  like: "לייקים",
  pinned: "פוסטים שנעצו",
};

/** Group unread notification rows into a per-user summary. Unknown/empty user_id
 *  rows are skipped. Pure. */
export function groupUnread(rows: NotifRow[] | null): Map<string, UnreadSummary> {
  const out = new Map<string, UnreadSummary>();
  for (const r of rows ?? []) {
    const uid = String(r?.user_id ?? "");
    if (!uid) continue;
    const kind = String(r?.kind ?? "").trim() || "other";
    const cur = out.get(uid) ?? { total: 0, byKind: {} };
    cur.total += 1;
    cur.byKind[kind] = (cur.byKind[kind] ?? 0) + 1;
    out.set(uid, cur);
  }
  return out;
}

export interface RecipientRow {
  id: string;
  name: string | null;
  email: string | null;
  community_notify_opt_out: boolean | null;
}

/** Belt-and-suspenders consent filter for the fetched opted-in rows: keep only a
 *  real email address AND someone not globally opted out of community
 *  notifications. (The DB query already restricts to community_digest_opt_in=true,
 *  so this is the second, defensive gate.) Pure. */
export function eligibleRecipients(rows: RecipientRow[] | null): RecipientRow[] {
  return (rows ?? []).filter(
    (r) => !!r?.email && String(r.email).includes("@") && r.community_notify_opt_out !== true,
  );
}

/** Subject line for a member with `total` unread updates (total ≥ 1). */
export function digestSubject(total: number): string {
  return total === 1
    ? "עדכון חדש אחד מחכה לך בקהילת חוסך"
    : `${total} עדכונים חדשים מחכים לך בקהילת חוסך`;
}

// ── email body ────────────────────────────────────────────────────────────────

export interface DigestData {
  name?: string | null;
  summary: UnreadSummary;
  communityUrl: string;
  unsubscribeUrl: string;
  /** Real count of new community posts in the window — omitted when null/0. */
  weeklyNewPosts?: number | null;
}

/** The per-kind "• X תגובות חדשות" lines, in KIND_ORDER, counts > 0 only. */
export function kindLines(summary: UnreadSummary): string[] {
  const lines: string[] = [];
  const seen = new Set<string>();
  for (const k of KIND_ORDER) {
    const n = summary.byKind[k] ?? 0;
    if (n > 0) {
      lines.push(`${n} ${KIND_LABEL[k]}`);
      seen.add(k);
    }
  }
  // Any kind we don't have an explicit label/order for, bucketed honestly.
  let other = 0;
  for (const [k, n] of Object.entries(summary.byKind)) {
    if (!seen.has(k) && KIND_ORDER.indexOf(k) === -1) other += n;
  }
  if (other > 0) lines.push(`${other} עדכונים נוספים`);
  return lines;
}

/** Build the full digest email HTML (email-client-safe, via the shared template).
 *  Truth-only: renders only real counts; the community-activity line is omitted
 *  unless there's a positive real number to show. */
export function buildDigestEmail(d: DigestData): string {
  const hello = d.name && d.name.trim() ? `שלום ${escHtml(d.name.trim())},` : "שלום,";
  const lead = d.summary.total === 1
    ? "מאז הביקור האחרון בקהילה הצטבר עדכון אחד שלא נקרא:"
    : `מאז הביקור האחרון בקהילה הצטברו ${d.summary.total} עדכונים שלא נקראו:`;

  const list = kindLines(d.summary)
    .map((l) => `&#8226;&nbsp;${escHtml(l)}`)
    .join("<br />");

  const body: string[] = [hello, lead, list];

  if (typeof d.weeklyNewPosts === "number" && d.weeklyNewPosts > 0) {
    // A community-wide stat (not personal) — the wording says so explicitly.
    body.push(
      `וגם, בכל הקהילה פורסמו השבוע ${escHtml(d.weeklyNewPosts)} פוסטים חדשים — שאלות, חוויות והמלצות אמיתיות על מסלולי תקשורת.`,
    );
  }

  body.push("היכנסו לקהילה כדי לקרוא ולהגיב 👇");

  return renderEmail({
    preheader: digestSubject(d.summary.total),
    heading: "יש לך עדכונים חדשים בקהילה",
    bodyHtml: body,
    cta: { label: "לצפייה בקהילה", url: d.communityUrl },
    unsubscribeUrl: d.unsubscribeUrl,
    footerReason:
      "קיבלת את הסיכום הזה כי סימנת/ה שברצונך לקבל עדכונים שבועיים על פעילותך בקהילת חוסך. " +
      "אפשר להפסיק בכל רגע בלחיצה על «הסרה מרשימת התפוצה».",
  });
}

// ── one-click unsubscribe token (HMAC) ────────────────────────────────────────
// The email's unsubscribe link is GET {fn}?unsub=<uid>&sig=<hmac>. The signature is
// HMAC-SHA256 over a domain-separated message, keyed by a SERVER-ONLY secret (the
// service-role key), so a recipient can flip only their OWN opt-in and the link
// can't be forged or reused for another purpose. No login required (§30A one-click).

const UNSUB_PREFIX = "community-digest-unsub:";

function base64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function hmac(key: string, msg: string): Promise<string> {
  const ck = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", ck, new TextEncoder().encode(msg));
  return base64url(new Uint8Array(sig));
}

/** Constant-time-ish string compare (fixed-length signatures; length compare is
 *  not sensitive here). */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

/** Sign a user's unsubscribe token. Empty when no key (caller falls back to the
 *  shared mailto unsubscribe so §30A opt-out is ALWAYS available). */
export async function signUnsub(uid: string, key: string): Promise<string> {
  if (!key || !uid) return "";
  return await hmac(key, UNSUB_PREFIX + uid);
}

/** Verify an unsubscribe token for `uid`. False on any missing input. */
export async function verifyUnsub(uid: string, sig: string, key: string): Promise<boolean> {
  if (!key || !uid || !sig) return false;
  const expected = await hmac(key, UNSUB_PREFIX + uid);
  return timingSafeEqual(expected, sig);
}
