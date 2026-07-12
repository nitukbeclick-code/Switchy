// ────────────────────────────────────────────────────────────────────────────
// export-i18n.mjs — snapshot the warmed translation cache into static per-language
// dictionaries the site can serve from the CDN.
//
// WHY: translate-runtime.js now loads /i18n/<lang>.json ONCE per language and
// applies from it with zero per-string model calls — a pre-warmed language
// translates near-instantly. This script produces those files by reading the
// `site_translations` cache (populated by scripts/prewarm-translations.mjs, which
// drives the REAL runtime so the source strings are byte-exact with what browsers
// send). It TRANSLATES NOTHING — it only exports rows that already exist.
//
// It changes NOTHING about prices/numbers: those are masked + double-verified by
// the edge function when the cache is warmed; here we only copy trusted rows out.
//
// ── RUN IT WHERE supabase.co IS REACHABLE (NOT the Claude sandbox) ────────────
//   Requires a service-role key (the cache table's RLS blocks anon reads):
//     SUPABASE_SERVICE_ROLE_KEY="…" node tools/export-i18n.mjs
//
//   Optional env:
//     SUPABASE_URL   project origin (default: the known project ref).
//     LANGS          comma-separated codes to export (default: the 6 core langs).
//
// Output (deterministic — sorted keys, so rebuilds are byte-stable):
//     site/i18n/<lang>.json         (served by the static marketing site)
//     web/public/i18n/<lang>.json   (served by the Next app — same bytes)
//   Each file is { "<hebrew source>": "<translation>" }, EXCLUDING any row whose
//   translation equals its source (a verify-failed Hebrew echo must never enter the
//   dictionary — the runtime would then never re-attempt it live).
// ────────────────────────────────────────────────────────────────────────────

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SUPABASE_URL = (process.env.SUPABASE_URL || "https://orzitfqmlvopujsoyigr.supabase.co").replace(/\/$/, "");
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const CORE_LANGS = ["en", "ru", "ar", "fr", "es", "am"];
const LANGS = (process.env.LANGS ? process.env.LANGS.split(",") : CORE_LANGS).map((s) => s.trim()).filter(Boolean);
const PAGE = 1000; // rows per REST request

if (!SERVICE_KEY) {
  console.error("SUPABASE_SERVICE_ROLE_KEY is required (the site_translations RLS blocks anon reads).");
  process.exit(1);
}

const headers = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` };

// Fetch every cached row for one language, paging until a short page ends it.
async function fetchLang(lang) {
  const rows = [];
  for (let offset = 0; ; offset += PAGE) {
    const url = `${SUPABASE_URL}/rest/v1/site_translations` +
      `?select=source_text,translated&lang=eq.${encodeURIComponent(lang)}` +
      `&order=id.asc&limit=${PAGE}&offset=${offset}`;
    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error(`REST ${res.status} for ${lang}: ${await res.text()}`);
    const batch = await res.json();
    rows.push(...batch);
    if (batch.length < PAGE) break;
  }
  return rows;
}

// Build a { source: translated } map, dropping empty rows and Hebrew echoes, then
// serialize with sorted keys so the output is byte-stable across runs.
function toDict(rows) {
  const map = {};
  let echoes = 0;
  for (const r of rows) {
    const src = r.source_text, tr = r.translated;
    if (!src || tr == null) continue;
    if (tr === src) { echoes++; continue; } // verify-failed echo — leave for live retry
    map[src] = tr;
  }
  const keys = Object.keys(map).sort();
  const sorted = {};
  for (const k of keys) sorted[k] = map[k];
  return { json: JSON.stringify(sorted), count: keys.length, echoes };
}

const targets = [join(REPO_ROOT, "site", "i18n"), join(REPO_ROOT, "web", "public", "i18n")];
for (const dir of targets) mkdirSync(dir, { recursive: true });

let grand = 0;
for (const lang of LANGS) {
  const rows = await fetchLang(lang);
  const { json, count, echoes } = toDict(rows);
  for (const dir of targets) writeFileSync(join(dir, `${lang}.json`), json + "\n");
  grand += count;
  console.log(`  ${lang}: ${count} strings written${echoes ? ` (${echoes} echoes skipped)` : ""} (${rows.length} cached rows)`);
}
console.log(`\nDone. ${grand} translations across ${LANGS.length} languages → site/i18n/ + web/public/i18n/.`);
