// ────────────────────────────────────────────────────────────────────────────
// warm-i18n.mjs — browser-free, service-role-free translation warm path.
//
// WHY: translate-runtime.js loads /i18n/<lang>.json ONCE per language and applies
// from it with zero per-string model calls — a pre-warmed language switches
// near-instantly. The OTHER warm path (scripts/prewarm-translations.mjs +
// tools/export-i18n.mjs) drives a real headless browser against the deployed site
// and then reads the DB cache with a SERVICE-ROLE key. That works, but it needs
// Playwright AND a privileged secret.
//
// This script produces the SAME static dictionaries WITHOUT either:
//   1. EXTRACT the translatable string universe straight from the built site/*.html
//      with linkedom, replicating translate-runtime.js `collect(document.body)`
//      EXACTLY — same TreeWalker semantics, same SKIP_CLOSEST, same translatableText,
//      keyed by the RAW (untrimmed) nodeValue / attribute value the runtime keys by.
//   2. TRANSLATE each language by POSTing the union to the PUBLIC translate edge
//      function in size-bounded batches (the same anon key the site ships), honoring
//      the server's caps + 429/Retry-After. Echoes (translated === source) are
//      dropped, exactly as export-i18n.mjs does.
//   3. WRITE site/i18n/<lang>.json + web/public/i18n/<lang>.json in the byte-identical
//      format export-i18n.mjs uses (sorted keys, compact JSON, trailing "\n").
//
// It changes NOTHING about prices/numbers: the edge function masks + double-verifies
// those server-side; here we only extract source strings and copy trusted rows out.
// The extraction is byte-exact with what the runtime's browser `collect()` sends, so
// every written key is a real runtime cache hit.
//
// ── RUN IT WHERE supabase.co IS REACHABLE (NOT the Claude sandbox) ────────────
//   No secret needed — the PUBLIC anon key is baked in as the default:
//     node tools/warm-i18n.mjs
//
//   Optional env:
//     PAGES_GLOB          pages to extract from (default "site/*.html").
//     LANGS               comma-separated codes (default "en,ru,ar,fr,es,am").
//     SUPABASE_URL        edge origin (default the baked public project).
//     SUPABASE_ANON_KEY   public anon key (default the baked public key).
//     MAX_MINUTES         wall-clock budget (default 55) — stop gracefully and write
//                         what got translated (partial is fine; writes are additive).
//     DELAY_MS            pause between POSTs (default 250).
//
// This module also EXPORTS `collectStrings` / `collectFromHtml` so the extraction
// can be validated against a real browser's `collect()` (see the byte-exactness
// check) — the same function used to build the universe is the one under test.
// ────────────────────────────────────────────────────────────────────────────

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, isAbsolute, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseHTML } from "linkedom";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

// ── constants mirrored VERBATIM from translate-runtime.js collect() ───────────
// (do not "improve" these — byte-exactness with the runtime is the whole point.)
const ATTRS = ["placeholder", "aria-label", "title", "alt"];
const SKIP_CLOSEST =
  "[data-no-translate],.notranslate,[translate='no'],script,style,noscript,code,pre,.swi18n-menu,.swi18n-banner";
// Server passes a single string longer than this through UNTRANSLATED (it would only
// ever echo back → be dropped), so we never spend a POST slot on it. This filter is a
// downstream translate-universe concern, NOT part of collect() — keep it out of the
// collection logic so the byte-exactness check compares pure collect() replication.
const MAX_STRING_LEN = 2000;

// translate-runtime.js translatableText — trim, ≥1 char, at least one Unicode letter.
function translatableText(s) {
  if (!s) return false;
  const t = s.trim();
  if (t.length < 1) return false;
  return /[\p{L}]/u.test(t);
}

// Replicate translate-runtime.js collect(document.body) against a linkedom document.
// Returns the RAW (untrimmed) strings — text-node values first (document order), then
// the 4 translatable attributes — exactly the strings the runtime keys memory by.
//   { capLen:true } additionally drops strings longer than MAX_STRING_LEN (used when
//   building the translate universe; left OFF for the byte-exactness comparison).
export function collectStrings(document, { capLen = false } = {}) {
  const body = document && document.body;
  const out = [];
  if (!body) return out;
  const TEXT_NODE = 3;
  const ELEMENT_NODE = 1;

  // A TreeWalker(SHOW_TEXT) descends into EVERY element (incl. script/style) and only
  // rejects the TEXT nodes whose parent is under SKIP_CLOSEST. A depth-first pre-order
  // walk that recurses into all elements but tests only text nodes matches that exactly
  // (text nodes have no children, so FILTER_REJECT == FILTER_SKIP for them).
  //
  // CRITICAL — text-node COALESCING: a browser's HTML parser folds a character entity
  // (e.g. `חו&quot;ל`) into the SURROUNDING text node, yielding ONE node `חו"ל`.
  // linkedom (htmlparser2) instead emits the entity as its OWN adjacent Text node, so
  // the raw run splits into `חו` / `"` / `ל`. The runtime keys by the browser's single
  // coalesced value, so we MUST merge consecutive Text-node siblings into one string
  // before testing — exactly what the DOM does. An element or comment BETWEEN two text
  // nodes is a real boundary in the browser too, so we flush the run there.
  const visit = (node) => {
    let run = null; // parts of the current consecutive-text-node run
    const flush = () => {
      if (run === null) return;
      const val = run.join("");
      run = null;
      if (!translatableText(val)) return;
      // parent element of this text run is `node`; matches runtime's p.closest(...)
      if (node.closest && node.closest(SKIP_CLOSEST)) return;
      out.push(val);
    };
    for (let child = node.firstChild; child; child = child.nextSibling) {
      const nt = child.nodeType;
      if (nt === TEXT_NODE) {
        (run || (run = [])).push(child.nodeValue);
      } else if (nt === ELEMENT_NODE) {
        flush();
        visit(child);
      } else {
        flush(); // comment / PI / other node breaks a text run, as in the browser DOM
      }
    }
    flush();
  };
  visit(body);

  const els = body.querySelectorAll("[placeholder],[aria-label],[title],[alt]");
  for (const el of els) {
    if (el.closest(SKIP_CLOSEST)) continue;
    for (const attr of ATTRS) {
      if (!el.hasAttribute(attr)) continue;
      const v = el.getAttribute(attr);
      if (!translatableText(v)) continue;
      out.push(v);
    }
  }

  return capLen ? out.filter((s) => s.length <= MAX_STRING_LEN) : out;
}

// Parse one HTML string and collect its translatable strings.
export function collectFromHtml(html, opts) {
  const { document } = parseHTML(html);
  return collectStrings(document, opts);
}

// ── page discovery ────────────────────────────────────────────────────────────
function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
// Minimal glob: "<dir>/<pattern-with-*>". Enough for the default "site/*.html".
function listPages(glob) {
  const abs = isAbsolute(glob) ? glob : join(REPO_ROOT, glob);
  const dir = dirname(abs);
  const pat = basename(abs);
  const re = new RegExp("^" + pat.split("*").map(escapeRe).join(".*") + "$");
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => re.test(f))
    .sort()
    .map((f) => join(dir, f));
}

// Union of the translatable universe across every page (deduped, capped by length).
export function extractUniverse(pages) {
  const set = new Set();
  for (const file of pages) {
    let html;
    try {
      html = readFileSync(file, "utf8");
    } catch {
      continue;
    }
    for (const s of collectFromHtml(html, { capLen: true })) set.add(s);
  }
  return [...set];
}

// ── translate ───────────────────────────────────────────────────────────────
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Server caps (supabase/functions/translate/index.ts): MAX_TEXTS / MAX_TOTAL_CHARS.
const MAX_TEXTS = 120;
const MAX_TOTAL_CHARS = 24_000;

// Group the universe into POSTs bounded by BOTH count and summed chars.
function batchTexts(texts, maxItems, maxChars) {
  const batches = [];
  let cur = [];
  let curChars = 0;
  for (const t of texts) {
    const len = t.length;
    if (cur.length > 0 && (cur.length >= maxItems || curChars + len > maxChars)) {
      batches.push(cur);
      cur = [];
      curChars = 0;
    }
    cur.push(t);
    curChars += len;
  }
  if (cur.length) batches.push(cur);
  return batches;
}

function backoff(attempt) {
  return Math.min(400 * 2 ** attempt, 8000);
}

// One POST with retries. 429s honour Retry-After and get extra, patient attempts
// (the server allows 90 req/min/IP); other transient failures get a couple retries.
async function postBatch(endpoint, anonKey, lang, texts, { retries = 2, rlRetries = 6 } = {}) {
  let attempt = 0;
  let rlHit = 0;
  for (;;) {
    let res;
    try {
      res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: anonKey, Authorization: "Bearer " + anonKey },
        body: JSON.stringify({ lang, texts }),
      });
    } catch (e) {
      if (attempt >= retries) throw e;
      await sleep(backoff(attempt++));
      continue;
    }
    if (res.status === 429) {
      if (rlHit >= rlRetries) throw new Error("translate 429 (rate limit) exhausted");
      const ra = parseInt(res.headers.get("retry-after") || "0", 10) || 0;
      await sleep(ra > 0 ? Math.min(ra * 1000, 60_000) : backoff(rlHit));
      rlHit++;
      continue;
    }
    if (!res.ok) {
      if (attempt >= retries) throw new Error("translate " + res.status);
      await sleep(backoff(attempt++));
      continue;
    }
    const j = await res.json().catch(() => null);
    return j && Array.isArray(j.translations) ? j.translations : texts;
  }
}

// ── dictionary write (byte-identical to export-i18n.mjs) ──────────────────────
const TARGET_DIRS = [join(REPO_ROOT, "site", "i18n"), join(REPO_ROOT, "web", "public", "i18n")];

function loadExisting(lang) {
  const out = {};
  const p = join(TARGET_DIRS[0], `${lang}.json`); // site/i18n is canonical
  if (existsSync(p)) {
    try {
      Object.assign(out, JSON.parse(readFileSync(p, "utf8")));
    } catch {
      /* corrupt — start clean for this lang */
    }
  }
  return out;
}

// Merge new translations over the existing dict (additive: a partial/interrupted run
// never regresses coverage) and serialize with sorted keys + trailing "\n".
function writeDict(lang, freshMap) {
  const merged = { ...loadExisting(lang), ...freshMap };
  const keys = Object.keys(merged).sort();
  const sorted = {};
  for (const k of keys) sorted[k] = merged[k];
  const json = JSON.stringify(sorted) + "\n";
  for (const dir of TARGET_DIRS) {
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, `${lang}.json`), json);
  }
  return keys.length;
}

// ── main ──────────────────────────────────────────────────────────────────────
async function main() {
  const PAGES_GLOB = process.env.PAGES_GLOB || "site/*.html";
  const LANGS = (process.env.LANGS || "en,ru,ar,fr,es,am")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const SUPABASE_URL = (process.env.SUPABASE_URL || "https://orzitfqmlvopujsoyigr.supabase.co").replace(/\/$/, "");
  const ANON_KEY = process.env.SUPABASE_ANON_KEY ||
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9yeml0ZnFtbHZvcHVqc295aWdyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA5OTc5NzIsImV4cCI6MjA5NjU3Mzk3Mn0.NY4ZHzR3BAWUxm5as9Z054o8fwcfejAab9SIvduKlhM";
  const MAX_MINUTES = Number(process.env.MAX_MINUTES || 55);
  const DELAY_MS = Number(process.env.DELAY_MS || 250);
  const endpoint = SUPABASE_URL + "/functions/v1/translate";

  const START = Date.now();
  const outOfTime = () => (Date.now() - START) / 60_000 >= MAX_MINUTES;

  const pages = listPages(PAGES_GLOB);
  if (pages.length === 0) {
    console.error(`No pages matched ${PAGES_GLOB}`);
    process.exit(1);
  }
  const universe = extractUniverse(pages);
  console.log(
    `Extracted ${universe.length} unique translatable strings from ${pages.length} pages (${PAGES_GLOB}).`,
  );
  console.log(`Languages: ${LANGS.join(", ")} · budget ${MAX_MINUTES}m · delay ${DELAY_MS}ms\n`);

  let stopped = false;
  for (const lang of LANGS) {
    if (outOfTime()) {
      console.log(`[time budget ${MAX_MINUTES}m reached — stopping before ${lang}]`);
      stopped = true;
      break;
    }
    const batches = batchTexts(universe, MAX_TEXTS, MAX_TOTAL_CHARS);
    const map = {};
    let echoes = 0;
    let translated = 0;
    let failedBatches = 0;
    for (let b = 0; b < batches.length; b++) {
      if (outOfTime()) {
        console.log(`  ${lang}: [time budget reached mid-language — writing partial]`);
        stopped = true;
        break;
      }
      const batch = batches[b];
      let res;
      try {
        res = await postBatch(endpoint, ANON_KEY, lang, batch);
      } catch (e) {
        failedBatches++;
        console.log(`  ${lang}: batch ${b + 1}/${batches.length} failed (${String(e.message || e)}) — skipped`);
        continue;
      }
      for (let i = 0; i < batch.length; i++) {
        const src = batch[i];
        const tr = res[i];
        if (tr == null || tr === src) {
          echoes++;
          continue;
        } // verify-failed echo — leave for live retry
        map[src] = tr;
        translated++;
      }
      await sleep(DELAY_MS);
    }
    const total = writeDict(lang, map);
    console.log(
      `  ${lang}: ${universe.length} extracted · ${translated} translated · ${echoes} echoes dropped` +
        (failedBatches ? ` · ${failedBatches} batches failed` : "") +
        ` → ${total} keys in dict`,
    );
    if (stopped) break;
  }

  console.log(stopped ? "\nStopped early (partial warm written — additive, re-run to converge)." : "\nDone.");
}

// Run main only when executed directly (not when imported by the validator).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
