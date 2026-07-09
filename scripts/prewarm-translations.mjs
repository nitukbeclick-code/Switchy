// ────────────────────────────────────────────────────────────────────────────
// prewarm-translations.mjs — warm the site-translation cache for EVERY language.
//
// WHY: the language switcher translates on demand via the `translate` edge
// function and caches results in `site_translations`. Languages with a cold
// cache (everything except ar/es/ru/am/en/fr) must translate the whole page
// live on first use — slow, and any string that fails the server's verify guard
// falls back to Hebrew ("the language didn't switch"). Warming the cache once
// makes every switch a pure DB hit: instant and reliable.
//
// WHAT IT DOES: drives the REAL /translate-runtime.js on the deployed site — for
// each route × language it calls window.SwitchyI18n.setLang(lang), which collects
// the exact page strings and POSTs them to the edge function (which translates +
// caches them). Driving the real runtime guarantees the source hashes match what
// visitors' browsers will send, so the warmed rows are real cache hits.
//
// It changes NOTHING about prices/numbers: the edge function still masks and
// double-verifies them; warming only populates the cache.
//
// ── RUN IT WHERE supabase.co IS REACHABLE (NOT the Claude sandbox) ────────────
//   Owner laptop or a GitHub Actions job. Requires Playwright:
//     npm i -D playwright && npx playwright install chromium
//   Then:
//     BASE_URL="https://<your-deployed-web-app>" node scripts/prewarm-translations.mjs
//
//   Optional env:
//     BASE_URL   (required) origin of the DEPLOYED app (its LanguageSwitcher has
//                already init'd the runtime with the Supabase URL + anon key).
//     LANGS      comma-separated codes to warm (default: all, auto-read from the
//                runtime's SwitchyI18n.LANGS).
//     PASSES     translation passes per lang (default 2 — a string that fails the
//                verify guard once often passes on a retry; cached rows are
//                skipped so re-runs are cheap).
//     ROUTES     comma-separated paths to crawl (default: the list below).
//     DELAY_MS   pause between switches (default 900) — stay under the edge fn's
//                PER_IP_LIMIT (90 req/min) and leave headroom for live traffic.
//
// Budget: the whole site is ~400-700 unique strings; 27 langs × ~700 ≈ ~18k
// model translations, under DAILY_MODEL_BUDGET (40k/day). Safe to run in 1-2
// off-peak passes; idempotent (already-cached rows are skipped).
// ────────────────────────────────────────────────────────────────────────────

import { chromium } from "playwright";

const BASE_URL = process.env.BASE_URL;
if (!BASE_URL) {
  console.error("BASE_URL is required (origin of the deployed web app).");
  process.exit(1);
}
const PASSES = Number(process.env.PASSES || 2);
const DELAY_MS = Number(process.env.DELAY_MS || 900);
const ROUTES = (process.env.ROUTES || [
  "/", "/cellular", "/internet", "/tv", "/triple", "/abroad",
  "/plans", "/compare", "/providers", "/wallet", "/quiz", "/bills",
  "/negotiate", "/book", "/community", "/market-pulse", "/switch-kit",
  "/street-prices", "/faq", "/guides", "/about", "/rights", "/how-it-works",
  "/privacy", "/terms", "/accessibility", "/referral",
].join(",")).split(",").map((s) => s.trim()).filter(Boolean);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function langsFor(page) {
  if (process.env.LANGS) return process.env.LANGS.split(",").map((s) => s.trim()).filter(Boolean);
  const codes = await page.evaluate(() =>
    (window.SwitchyI18n && window.SwitchyI18n.LANGS ? window.SwitchyI18n.LANGS.map((l) => l.code) : []));
  return codes.filter((c) => c && c !== "he");
}

// Switch to `lang`, then wait until the runtime finishes (its progress bar clears).
async function switchAndWait(page, lang) {
  await page.evaluate((l) => window.SwitchyI18n && window.SwitchyI18n.setLang(l), lang);
  try {
    await page.waitForFunction(
      (l) => window.SwitchyI18n &&
             window.SwitchyI18n.getLang() === l &&
             !document.getElementById("swi18n-bar"),
      lang, { timeout: 45000 },
    );
  } catch { /* a stubborn batch — move on; the next pass / visit retries */ }
}

const browser = await chromium.launch({ args: ["--no-sandbox"] });
const ctx = await browser.newContext({ locale: "he-IL" });
const page = await ctx.newPage();

let langs = null;
for (let pass = 1; pass <= PASSES; pass++) {
  console.log(`\n=== pass ${pass}/${PASSES} ===`);
  for (const route of ROUTES) {
    const url = BASE_URL.replace(/\/$/, "") + route;
    try {
      await page.goto(url, { waitUntil: "networkidle", timeout: 45000 });
    } catch {
      console.log(`  skip ${route} (load failed)`);
      continue;
    }
    // Wait for the lazy runtime to attach.
    try { await page.waitForFunction(() => !!window.SwitchyI18n, { timeout: 15000 }); }
    catch { console.log(`  skip ${route} (runtime not present)`); continue; }

    if (!langs) langs = await langsFor(page);
    process.stdout.write(`  ${route}: `);
    for (const lang of langs) {
      await switchAndWait(page, lang);
      process.stdout.write(lang + " ");
      await sleep(DELAY_MS);
      // Reset to Hebrew so the next language re-collects a fresh, full page.
      await switchAndWait(page, "he");
      await sleep(200);
    }
    process.stdout.write("\n");
  }
}

await ctx.close();
await browser.close();
console.log("\nDone. Verify with:  select lang, count(*) from public.site_translations group by lang order by 2 desc;");
