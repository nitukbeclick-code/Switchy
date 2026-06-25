// Pure helpers for the lead-export Edge Function (lead-export/index.ts), split out
// so they can be unit-tested without booting Deno.serve or touching the network/
// env (mirrors street-price/lib.ts + lead-digest/lib.ts). NO I/O, NO env, NO clock
// except an injectable nowIso.
//
// This module is the EXPORT feed's legal + honesty boundary. The business SELLS
// leads, so the single most important rule lives here, enforced TWICE (defence in
// depth — the DB query already filters, and this layer re-checks every row before
// it can reach a buyer):
//
//   • isSellable()  — a lead is sellable ONLY when it carries an explicit
//     third-party-sharing consent (a non-empty consent_share_at). The §30A
//     service consent (terms/privacy) and the marketing opt-ins do NOT make a lead
//     sellable — passing a person's data to a third party for that party's own use
//     needs its own informed, separate consent (Privacy Law). A lead WITHOUT
//     consent_share_at must NEVER appear in the feed, no exception.
//   • filterSellable() — drops every non-consented row defensively, even if the
//     query that produced `leads` somehow returned one.
//   • parseExportQuery() — validate/coerce the request body (category / date
//     window / status filter / limit / dryRun) — never trust the client shape.
//   • dedupeFeed() — collapse the SAME person+category to one billable row using
//     the shared dedupKey, keeping the BEST (most complete, freshest) instance, so
//     a buyer is never charged twice for one lead — while NEVER dropping a distinct
//     lead (a different person, or the same person on a different service).
//   • buildExportRow() / exportFeed() — flatten each surviving lead into a clean,
//     stable JSON object — every field read from a REAL lead row, nothing
//     fabricated.
//
// Truth-only: a missing field is emitted as null/"" — never invented to enrich a
// row a buyer pays for.

import type { Lead } from "../_shared/types.ts";
import { dedupKey, deriveCategory, normalizeIlPhone, scoreLead } from "../_shared/lead_quality.ts";
import { CATEGORIES, normalizeCategory } from "../_shared/catalogue.ts";

// ── The sellable gate (HARD LEGAL RULE) ──────────────────────────────────────
// A lead is sellable ⇔ it carries an explicit third-party-sharing consent: a
// non-empty consent_share_at timestamp. consent_share_at is operational consent
// PII not surfaced on the Lead type (the table doesn't expose it to clients), so
// read it DEFENSIVELY off the row — exactly how scoreLead reads the §30A consent
// stamps and how google_sheets.buildLeadSheetRow computes "sellable". A null,
// absent, or blank value is NOT sellable — the safe, honest default.
export function isSellable(lead: Lead): boolean {
  const shareAt = String((lead as unknown as Record<string, unknown>).consent_share_at ?? "").trim();
  return shareAt.length > 0;
}

// Defence in depth: keep ONLY sellable rows. The export query already filters
// `consent_share_at=not.is.null`, but we re-check here so a feed can never leak an
// unconsented lead even if the query is changed/bypassed. Truth-only safety net.
export function filterSellable(leads: Lead[]): Lead[] {
  return leads.filter(isSellable);
}

// ── Request parsing ───────────────────────────────────────────────────────────
// Lead statuses (schema.sql): new / contacted / won / lost. A 'lost' lead is dead
// — never a sellable export candidate — so it is excluded by default. The caller
// may narrow further to a specific subset via the `status` filter.
export const SELLABLE_STATUSES = ["new", "contacted", "won"] as const;

// Hard cap on a single feed page — a buyer pulls a window, not the whole table.
export const MAX_EXPORT_LIMIT = 1000;
export const DEFAULT_EXPORT_LIMIT = 500;

export interface ExportQuery {
  category: string | null; // canonical category to filter to, or null = all
  statuses: string[]; // status values to include (subset of SELLABLE_STATUSES)
  since: string | null; // ISO lower bound on created_at (inclusive), or null
  until: string | null; // ISO upper bound on created_at (exclusive), or null
  limit: number; // 1..MAX_EXPORT_LIMIT
  dryRun: boolean; // build the feed but do NOT append to any buyer sheet
}

export interface ExportQueryInput {
  category?: unknown;
  status?: unknown; // string or string[] — a subset of SELLABLE_STATUSES
  since?: unknown; // ISO date/datetime
  until?: unknown; // ISO date/datetime
  limit?: unknown;
  dryRun?: unknown;
}

// Coerce an ISO date / datetime string into a canonical ISO instant, or null when
// it isn't a real date (never fabricate a window bound).
function toIso(v: unknown): string | null {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const t = Date.parse(s);
  if (!Number.isFinite(t)) return null;
  return new Date(t).toISOString();
}

function toLimit(v: unknown): number {
  const n = typeof v === "number" ? v : Number(String(v ?? "").replace(/[^\d]/g, ""));
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_EXPORT_LIMIT;
  return Math.min(MAX_EXPORT_LIMIT, Math.max(1, Math.floor(n)));
}

// Validate + coerce the request body into a clean ExportQuery. Unknown categories
// and unknown statuses are dropped (never guessed); an empty status list falls
// back to the full SELLABLE_STATUSES set. Never throws.
export function parseExportQuery(input: ExportQueryInput | undefined): ExportQuery {
  const body = input && typeof input === "object" ? input : {};

  // Category — normalize against the catalogue's canonical set; an unrecognised
  // category yields null (= no category filter) rather than a fabricated one.
  const rawCat = String(body.category ?? "").trim();
  const normCat = rawCat ? normalizeCategory(rawCat) : "";
  const category = normCat && (CATEGORIES as readonly string[]).includes(normCat) ? normCat : null;

  // Status — accept a single string or an array; keep only known sellable
  // statuses. 'lost' (or any unknown) is silently dropped. Empty → all sellable.
  const rawStatuses = Array.isArray(body.status)
    ? body.status
    : (body.status === undefined || body.status === null ? [] : [body.status]);
  const statuses = Array.from(
    new Set(
      rawStatuses
        .map((s) => String(s ?? "").trim().toLowerCase())
        .filter((s): s is typeof SELLABLE_STATUSES[number] =>
          (SELLABLE_STATUSES as readonly string[]).includes(s)
        ),
    ),
  );

  return {
    category,
    statuses: statuses.length ? statuses : [...SELLABLE_STATUSES],
    since: toIso(body.since),
    until: toIso(body.until),
    limit: toLimit(body.limit),
    dryRun: body.dryRun === true,
  };
}

// ── Dedup ─────────────────────────────────────────────────────────────────────
// Collapse leads that are "the same billable lead" — the SAME person asking about
// the SAME service — to a single row, so a buyer is never charged twice. Identity
// is the shared dedupKey (E.164 phone ⊕ derived category). A DISTINCT lead is
// never dropped: a different person, or the same person on a different category,
// has a different key and survives. Rows with an EMPTY dedup key (no normalizable
// phone AND no name) are "un-dedupable" → always kept (never collapse all blanks
// into one).
//
// When two leads collapse, we keep the BEST instance: higher completeness score
// wins; ties break to the FRESHER created_at (a buyer wants the most recent, most
// complete snapshot of that person+service). Stable otherwise.
export function dedupeFeed(leads: Lead[]): Lead[] {
  const best = new Map<string, Lead>();
  const passthrough: Lead[] = []; // un-dedupable rows, kept in original order
  const order: string[] = []; // preserve first-seen order of keyed rows

  for (const lead of leads) {
    const key = dedupKey(lead);
    if (!key) {
      passthrough.push(lead);
      continue;
    }
    const existing = best.get(key);
    if (!existing) {
      best.set(key, lead);
      order.push(key);
      continue;
    }
    best.set(key, betterLead(existing, lead));
  }

  // Keyed winners in first-seen order, then the un-dedupable passthrough rows.
  return [...order.map((k) => best.get(k)!), ...passthrough];
}

// Pick the richer of two same-key leads: higher score wins; on a tie the fresher
// created_at wins; if still tied, keep the incumbent (stable). PURE.
function betterLead(a: Lead, b: Lead): Lead {
  const sa = scoreLead(a);
  const sb = scoreLead(b);
  if (sb > sa) return b;
  if (sb < sa) return a;
  const ta = Date.parse(String(a.created_at ?? "")) || 0;
  const tb = Date.parse(String(b.created_at ?? "")) || 0;
  return tb > ta ? b : a;
}

// ── Feed rows ─────────────────────────────────────────────────────────────────
// One clean, stable JSON object per sellable lead. Every field comes from a REAL
// lead row; nothing is fabricated. phone is emitted in dedup-grade E.164 when it
// normalizes (the form a buyer can dial across spellings), else the raw stored
// value. category is the derived desired service ("" when truly unknown). quality
// is the 0–100 completeness score. sellable is ALWAYS true here (only sellable
// rows reach this function) — surfaced explicitly so the contract is self-evident.
export interface ExportRow {
  id: string | null;
  created_at: string | null;
  name: string;
  phone: string;
  email: string | null;
  provider: string | null;
  plan_id: string | null;
  category: string;
  source: string | null;
  status: string;
  notes: string | null;
  quality: number;
  consent_share_at: string | null;
  sellable: true;
}

export function buildExportRow(lead: Lead): ExportRow {
  const e164 = normalizeIlPhone(lead.phone);
  const shareAt = String((lead as unknown as Record<string, unknown>).consent_share_at ?? "").trim();
  return {
    id: lead.id ?? null,
    created_at: String(lead.created_at ?? "").trim() || null,
    name: String(lead.name ?? "").trim(),
    phone: e164 || String(lead.phone ?? "").trim(),
    email: (String(lead.email ?? "").trim() || null),
    provider: (String(lead.provider ?? "").trim() || null),
    plan_id: (String(lead.plan_id ?? "").trim() || null),
    category: deriveCategory(lead),
    source: (String(lead.source ?? "").trim() || null),
    status: String(lead.status ?? "").trim(),
    notes: (String(lead.notes ?? "").trim() || null),
    quality: scoreLead(lead),
    consent_share_at: shareAt || null,
    sellable: true,
  };
}

// Full pipeline over already-fetched leads: enforce the sellable gate (defence in
// depth) → dedupe → flatten to feed rows. PURE — the network read happens in
// index.ts; this is the testable core. The order is deliberate: gate FIRST so a
// non-consented row can never even influence dedup, then collapse, then shape.
export function exportFeed(leads: Lead[]): ExportRow[] {
  return dedupeFeed(filterSellable(leads)).map(buildExportRow);
}

// ── Buyer-sheet rows (per-category tabs) ──────────────────────────────────────
// When a buyer destination is configured, each feed row is appended to a tab named
// for its category (so a buyer's "cellular" sheet only gets cellular leads). This
// maps an ExportRow → the A1 range for its tab and the flat string[] cells, in a
// stable column order a buyer can rely on. A row whose category is unknown lands
// in an "other" tab rather than being dropped (it's still a real, sellable lead).
//
// Column order (stable): [id, created_at, name, phone, email, provider, plan_id,
// category, source, status, quality]. notes is intentionally OMITTED from the
// buyer sheet (it can carry free-text context that isn't needed for the handoff
// and may include incidental detail) — the JSON feed keeps it for the operator.
export function buyerTabFor(row: ExportRow): string {
  const cat = row.category && (CATEGORIES as readonly string[]).includes(row.category) ? row.category : "other";
  // A1 over a generous column span; values:append finds the first empty row.
  return `${cat}!A:K`;
}

export function buyerSheetCells(row: ExportRow): string[] {
  return [
    row.id ?? "",
    row.created_at ?? "",
    row.name,
    row.phone,
    row.email ?? "",
    row.provider ?? "",
    row.plan_id ?? "",
    row.category,
    row.source ?? "",
    row.status,
    String(row.quality),
  ];
}
