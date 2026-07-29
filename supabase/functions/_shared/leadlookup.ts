// ─────────────────────────────────────────────────────────────────────────────
// leadlookup — the shared "is there an OPEN lead for this person?" lookup that
// every surface feeds to runAgent() as `activeLead`, so the agent acknowledges
// the real lead stage (contacted / won / …) instead of re-pitching. Extracted
// from whatsapp-webhook so the WhatsApp, site and app chat share ONE truth-only
// implementation. Fail-soft throughout: junk input → [], DB error / no lead →
// null (the agent then simply gets no activeLead section and never claims a lead
// exists). Pure `leadPhoneCandidates` is fully unit-testable.
// ─────────────────────────────────────────────────────────────────────────────
import { fetchRows } from "./db.ts";
import { jlog } from "./log.ts";
import type { ActiveLead } from "./agent.ts";

type Row = Record<string, unknown>;

// EVERY exact shape a phone could have been stored under in public.leads, matched
// with a PostgREST in.() filter. A WhatsApp wa_id arrives as bare E.164 digits
// ("972501234567"), which is a third shape again. Pure + total (junk/too-short →
// []) so it's testable.
//
// HISTORICAL, not current. Leads used to be written in TWO shapes depending on the
// capture path — the WhatsApp webhook had its own `normalizeLeadPhone` returning
// "+<E.164>" while every other surface used _shared/leads.ts's national 0-leading
// form — and this function existed to paper over that at READ time. The write side
// is now unified on the national form (all writers go through
// _shared/leads.ts normalizeLeadPhone), so for any lead created from 2026-07
// onward the candidate list resolves on the national form alone. It stays because
// rows captured BEFORE the unification are still stored as "+972…"/"972…", and
// because a wa_id still has to be translated to look a lead up at all.
export function leadPhoneCandidates(raw: string): string[] {
  const digits = String(raw ?? "").replace(/\D/g, "");
  if (digits.length < 7 || digits.length > 14) return [];
  const out = new Set<string>();
  if (digits.startsWith("972")) {
    // E.164 (the wa_id shape) → +E.164, bare digits, and the national 0-form.
    out.add(`+${digits}`);
    out.add(digits);
    out.add(`0${digits.slice(3)}`);
  } else if (digits.startsWith("0")) {
    // National 0-leading form → itself + both IL E.164 shapes.
    out.add(digits);
    out.add(`+972${digits.slice(1)}`);
    out.add(`972${digits.slice(1)}`);
  } else {
    // Unknown country shape — match only the exact digit forms, never guess IL.
    out.add(`+${digits}`);
    out.add(digits);
  }
  return [...out];
}

// The NEWEST lead for this phone (any status — the stage text derives from
// leads.status truthfully, including 'won'/'lost'). Returns null when there is
// no lead OR on ANY lookup failure (fetchRows is fail-soft → null), so the
// caller behaves EXACTLY as today when the DB is unreachable — the agent simply
// gets no activeLead section and never claims a lead exists. The notes snippet
// is clipped + whitespace-collapsed here so no long PII blob rides into the prompt.
export async function lookupOpenLead(phone: string): Promise<ActiveLead | null> {
  try {
    const candidates = leadPhoneCandidates(phone);
    if (!candidates.length) return null;
    // PostgREST in.() — each value double-quoted (the '+' and any ',' stay literal),
    // the whole list URL-encoded.
    const list = encodeURIComponent(candidates.map((c) => `"${c}"`).join(","));
    const rows = await fetchRows<Row>(
      `/rest/v1/leads?phone=in.(${list})&order=created_at.desc&limit=1&select=id,status,created_at,notes`,
    );
    if (!rows || !rows.length) return null; // error OR genuinely no lead → null
    const r = rows[0];
    const status = String(r.status ?? "").trim();
    if (!status) return null; // a row without a status can't ground a stage
    const notes = String(r.notes ?? "").trim().replace(/\s+/g, " ").slice(0, 160);
    // `id` is selected so a caller holding this result can REUSE the row (see
    // whatsapp-webhook createHandoffLead's dedup) rather than insert a duplicate.
    // NOTE: no status filter, deliberately — the newest lead is returned whatever
    // its stage, including 'won'/'lost', because the agent must acknowledge a closed
    // lead honestly rather than pretend none exists. Deciding what counts as "open"
    // is the CALLER's job, from the `status` field.
    return {
      status,
      created_at: r.created_at ? String(r.created_at) : undefined,
      notes: notes || undefined,
      id: r.id ? String(r.id) : undefined,
    };
  } catch (e) {
    jlog({ at: "leadLookup", ok: false, error: String(e) });
    return null; // fail-soft: identical behavior to today
  }
}
