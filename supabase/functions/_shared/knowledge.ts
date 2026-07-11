// ─────────────────────────────────────────────────────────────────────────────
// _shared/knowledge.ts — the truth-only "learning" / FAQ-knowledge layer for the
// Switchy AI agent.
//
// WHAT THIS OWNS
//   • loadBotKnowledge() — read the curated, enabled bot_knowledge rows (priority
//     order) via the existing service-role db helper. Fail-soft → [] (never throws
//     into the agent path).
//   • loadBotKnowledgeCached() — the same rows behind a modest per-isolate TTL
//     (KNOWLEDGE_TTL_MS), so a long-lived warm isolate picks up curated edits
//     without a redeploy, while a failed REFRESH keeps serving the last good copy.
//   • formatKnowledgeForPrompt() — a compact, bounded Hebrew "verified knowledge"
//     block to inject into the agent system prompt, so the model answers common
//     questions directly + consistently (fewer tool round-trips = faster).
//   • matchTopic() — a cheap, dependency-free, Hebrew-aware keyword/substring match
//     of a customer question against the entries' question_examples/topic.
//   • logCustomerQuestion() — fire-and-forget insert into bot_question_log (the
//     "learning data" the team reviews to grow bot_knowledge). Best-effort.
//
// SAFETY: the knowledge base is CURATED (grown by hand by the team) — there is NO
// auto-learning of arbitrary customer content into the prompt, which would risk
// hallucination/abuse. The agent only ever reads approved rows; the question log
// is a separate, review-only sink.
//
// The two PURE helpers (formatKnowledgeForPrompt, matchTopic) take their data as
// arguments and do NO network I/O, so they are unit-testable without a DB.
// ─────────────────────────────────────────────────────────────────────────────

import { fetchRows, insertRow } from "./db.ts";

export type KnowledgeEntry = {
  topic: string;
  question_examples: string[];
  answer: string;
  priority: number;
};

// Bound the injected block so a large/growing knowledge base can't blow the
// system-prompt budget. We truncate by priority (entries arrive priority-ordered,
// so the most important ones survive). ~1500 chars is generous for a handful of
// short WhatsApp-sized answers while staying small next to the catalogue context.
const MAX_PROMPT_CHARS = 1500;

// ── fetchBotKnowledge: enabled rows, priority order — NULLABLE on failure. ────
// Reuses the shared service-role read (db.ts fetchRows → serviceFetch). Returns
// null when the READ ITSELF failed (network/non-2xx → fetchRows null) and [] for
// a genuinely empty/all-disabled table — the distinction the TTL cache below
// needs so a failed refresh keeps the stale copy while a real "table emptied"
// edit still propagates. Never throws.
export async function fetchBotKnowledge(): Promise<KnowledgeEntry[] | null> {
  const rows = await fetchRows<Record<string, unknown>>(
    "/rest/v1/bot_knowledge?select=topic,question_examples,answer,priority&enabled=eq.true&order=priority.asc",
  );
  if (!rows) return null;
  const out: KnowledgeEntry[] = [];
  for (const r of rows) {
    const topic = String(r.topic ?? "").trim();
    const answer = String(r.answer ?? "").trim();
    if (!topic || !answer) continue; // skip malformed rows defensively
    const examples = Array.isArray(r.question_examples)
      ? (r.question_examples as unknown[]).map((e) => String(e)).filter((e) => e.trim() !== "")
      : [];
    const priority = Number.isFinite(Number(r.priority)) ? Number(r.priority) : 100;
    out.push({ topic, question_examples: examples, answer, priority });
  }
  return out;
}

// ── loadBotKnowledge: enabled rows, priority order. Fail-soft → []. ───────────
// The original contract, unchanged: on ANY error we return [] so the agent path
// simply runs without the knowledge block rather than breaking.
export async function loadBotKnowledge(): Promise<KnowledgeEntry[]> {
  return (await fetchBotKnowledge()) ?? [];
}

// ── loadBotKnowledgeCached: the TTL-refreshed per-isolate cache ────────────────
// Long-lived warm isolates used to cache the knowledge for their ENTIRE lifetime,
// so curated bot_knowledge edits never reached the bot until a cold start. A
// modest TTL fixes that: within the window we serve the cached copy (zero DB
// round-trips on the hot path), after it we re-fetch. FAIL-SOFT ON REFRESH: when
// the re-fetch fails (fetchBotKnowledge → null) we keep serving the last good
// copy and try again after another TTL — a DB blip can only ever delay freshness,
// never blank out the knowledge block. A successful fetch of an EMPTY set is
// honored (the team disabling every row must propagate). `now` is injectable so
// the TTL contract can be pinned in tests without timers.
export const KNOWLEDGE_TTL_MS = 10 * 60_000;
let _cache: KnowledgeEntry[] | null = null;
let _cacheAt = 0;

export async function loadBotKnowledgeCached(now = Date.now()): Promise<KnowledgeEntry[]> {
  if (_cache && now - _cacheAt < KNOWLEDGE_TTL_MS) return _cache;
  const fresh = await fetchBotKnowledge();
  if (fresh) {
    _cache = fresh; // includes a legitimate [] — curated edits always win
  } else if (_cache === null) {
    _cache = []; // first load failed → run without the block, retry after TTL
  } // else: refresh failed → keep the stale copy (fail-soft)
  // Stamp the window even on failure so a broken DB is retried once per TTL,
  // not on every message.
  _cacheAt = now;
  return _cache;
}

// Test-only: clear the TTL cache so each test starts cold (mirrors the
// __resetRateLimitForTests pattern in _shared/ratelimit.ts).
export function __resetKnowledgeCacheForTests(): void {
  _cache = null;
  _cacheAt = 0;
}

// ── formatKnowledgeForPrompt: compact, bounded Hebrew block (PURE) ────────────
// Produces a "verified knowledge" section for the system prompt. Each line is
// "- <topic>: <answer>". We stop adding entries once we'd exceed MAX_PROMPT_CHARS
// (by priority, since entries arrive priority-ordered) so the block stays bounded.
// Returns "" when there's nothing to inject.
export function formatKnowledgeForPrompt(entries: KnowledgeEntry[]): string {
  if (!entries || entries.length === 0) return "";
  const header = "ידע מאומת (השתמש/י בו לתשובות נפוצות, אל תמציא/י):";
  const lines: string[] = [];
  let used = header.length;
  for (const e of entries) {
    const answer = e.answer.replace(/\s+/g, " ").trim();
    if (!answer) continue;
    const line = `- ${e.topic}: ${answer}`;
    // +1 for the joining newline; stop BEFORE exceeding the cap so we never emit
    // a partial/over-budget block.
    if (used + line.length + 1 > MAX_PROMPT_CHARS) break;
    lines.push(line);
    used += line.length + 1;
  }
  if (lines.length === 0) return "";
  return `${header}\n${lines.join("\n")}`;
}

// ── matchTopic: cheap Hebrew-aware keyword/substring match (PURE) ─────────────
// No external deps. Lowercases + strips punctuation/diacritics-noise both sides,
// then checks whether the question contains an example (or topic) phrase, or vice
// versa for short topics. Returns the matched topic, or null. This is intentionally
// conservative (substring containment) — it's used to TAG the question log, not to
// gate the answer, so a miss just records matched_topic=null for the team to review.
export function matchTopic(question: string, entries: KnowledgeEntry[]): string | null {
  const q = normalize(question);
  if (!q || !entries || entries.length === 0) return null;
  for (const e of entries) {
    // Each example phrase: a hit if the question contains it (normalized).
    for (const ex of e.question_examples) {
      const nex = normalize(ex);
      if (nex && nex.length >= 2 && q.includes(nex)) return e.topic;
    }
    // The topic label itself, when it's a multi-char phrase, is also a signal.
    const nt = normalize(e.topic);
    if (nt && nt.length >= 3 && q.includes(nt)) return e.topic;
  }
  return null;
}

// Lowercase, collapse whitespace, and drop punctuation that would otherwise break
// substring containment (Hebrew has no case, but quotes/gershayim/punctuation vary).
// Keep Hebrew + Latin letters and digits; everything else becomes a single space.
function normalize(s: string): string {
  return String(s ?? "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

// ── logCustomerQuestion: fire-and-forget append to bot_question_log ───────────
// The "learning data" write. Best-effort: swallow ALL errors (never throw into
// the agent path), truncate the question so a long paste can't bloat a row, and
// never block the customer reply. Call it WITHOUT awaiting on the hot path, or
// await it in a try/catch that ignores the result — either way it can't break.
export async function logCustomerQuestion(
  channel: string,
  question: string,
  matchedTopic: string | null,
): Promise<void> {
  try {
    const q = String(question ?? "").slice(0, 500);
    if (!q.trim()) return; // nothing to learn from an empty message
    await insertRow("bot_question_log", {
      channel: String(channel || "unknown").slice(0, 40),
      question: q,
      matched_topic: matchedTopic ?? null,
      answered: true,
    });
  } catch (_e) {
    // Swallow: the question log is a bonus signal, never a hard dependency.
  }
}
