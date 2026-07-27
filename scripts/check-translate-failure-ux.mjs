// ────────────────────────────────────────────────────────────────────────────
// check-translate-failure-ux.mjs — the language switcher must tell the truth
// about WHY it produced nothing.
//
// WHY THIS EXISTS: the translate edge function fail-softs by echoing the Hebrew
// source, so on the wire a spent daily budget, a dead provider chain, a fatal
// server error and a batch that simply had nothing to translate ("HOT", "5G",
// "eSIM", prices) are byte-identical — every one is a 200 whose translations
// equal the input. The runtime counted "applied" as `translated !== source`, so
// all four collapsed into the same red notice, including the case where the
// server did its job perfectly. That is the "it keeps saying translation error"
// complaint: the notice cried wolf, so it stopped carrying information.
//
// The fix is a `meta` field on the response. This script proves the runtime
// actually branches on it, by driving a REAL page in Chromium with the endpoint
// stubbed to each outcome — the only way to test it, since the runtime is a
// browser IIFE with no module surface.
//
// USAGE
//   node scripts/check-translate-failure-ux.mjs
//   node scripts/check-translate-failure-ux.mjs /guides.html
// Exit 1 on any behavioural mismatch. PW_CHROMIUM overrides the browser path.
// ────────────────────────────────────────────────────────────────────────────

import { chromium } from "playwright";
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "site");
const PORT = Number(process.env.PORT || 4402);
// Let Playwright launch the browser IT provisioned for its own version. The
// default used to be a hardcoded /opt/pw-browsers/chromium-1194 path — the
// browser of ONE development sandbox, pinned to one build number — which is the
// whole reason this script could never run anywhere else, CI included.
// PW_CHROMIUM still overrides, for an environment that supplies its own binary.
const CHROMIUM = process.env.PW_CHROMIUM || undefined;
const PAGE = process.argv[2] || "/cellular.html";
// MUST be a language with NO static /i18n/<lang>.json bundle. The 6 bundled
// languages (am, ar, en, es, fr, ru) translate from the shipped file and barely
// touch the endpoint, so stubbing it there proves nothing — the first version of
// this script used "en" and passed the failure cases for the wrong reason. The
// other 21 menu languages are fully endpoint-dependent, which is exactly the
// population that sees the failure notice.
const LANG = "de";

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".woff2": "font/woff2",
};

const serve = () =>
  createServer(async (req, res) => {
    try {
      const url = decodeURIComponent((req.url || "/").split("?")[0]);
      // Measure the hand-edited SOURCE, not the cron-generated minified artifact.
      const file = url.endsWith("translate-runtime.min.js")
        ? "/translate-runtime.js"
        : url.endsWith("styles.min.css")
        ? "/styles.css"
        : url;
      let p = normalize(join(ROOT, file === "/" ? "/index.html" : file));
      if (!p.startsWith(ROOT)) return void res.writeHead(403).end();
      if ((await stat(p)).isDirectory()) p = join(p, "index.html");
      res.writeHead(200, { "content-type": TYPES[extname(p)] ?? "application/octet-stream" });
      res.end(await readFile(p));
    } catch {
      res.writeHead(404).end("not found");
    }
  });

/**
 * The four server outcomes that are indistinguishable without `meta`.
 * `body(texts)` builds the stubbed response; the expectations describe what the
 * user must see. `translate` decides whether the echo is replaced by real text.
 */
const CASES = [
  {
    name: "success — real translations come back",
    body: (texts) => ({
      lang: LANG,
      translations: texts.map((t) => "DE:" + t),
      meta: { requested: texts.length, translated: texts.length, attempted: texts.length, cached: texts.length, budgetExhausted: false },
    }),
    expect: { toast: false, dir: "ltr", note: "the page commits and flips direction" },
  },
  {
    name: "budget exhausted — retrying cannot help",
    body: (texts) => ({
      lang: LANG,
      translations: texts.slice(),
      meta: { requested: texts.length, translated: 0, attempted: texts.length, cached: 0, budgetExhausted: true },
    }),
    // Copy must not promise a retry, and the button must be gone: a control that
    // is guaranteed to fail until the daily reset is worse than no control.
    expect: { toast: true, toastIncludes: "עמוס", retryButton: false, dir: "rtl", note: "honest 'busy' copy, no retry button, page stays Hebrew" },
  },
  {
    name: "transient — the server tried and got nothing",
    body: (texts) => ({
      lang: LANG,
      translations: texts.slice(),
      meta: { requested: texts.length, translated: 0, attempted: texts.length, cached: 0, budgetExhausted: false },
    }),
    expect: { toast: true, toastIncludes: "נסו שוב", retryButton: true, dir: "rtl", note: "retryable copy WITH a retry button" },
  },
  {
    name: "nothing to translate — server worked, strings are already language-neutral",
    body: (texts) => ({
      lang: LANG,
      translations: texts.slice(),
      // attempted:0 — every string resolved from cache/needsTranslation said no.
      meta: { requested: texts.length, translated: 0, attempted: 0, cached: 0, budgetExhausted: false },
    }),
    // THE REGRESSION THIS GUARDS: this used to show the same error as a real
    // outage. It is a success — there was simply nothing to do.
    expect: { toast: false, note: "NO error notice — this is not a failure" },
  },
  {
    name: "legacy server without meta — behaves exactly as before",
    body: (texts) => ({ lang: LANG, translations: texts.slice() }),
    expect: { toast: true, dir: "rtl", note: "back-compat: an old deployment still fails soft and honestly" },
  },
];

async function run(browser, kase) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "he-IL" });
  const page = await ctx.newPage();

  await page.route("**/functions/v1/translate", async (route) => {
    let texts = [];
    try {
      texts = JSON.parse(route.request().postData() || "{}").texts || [];
    } catch { /* keep [] */ }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "access-control-allow-origin": "*" },
      body: JSON.stringify(kase.body(texts)),
    });
  });

  await page.goto(`http://127.0.0.1:${PORT}${PAGE}`, { waitUntil: "networkidle" });
  // A stale failure stamp from a previous case would suppress the whole switch.
  await page.evaluate(() => { try { sessionStorage.clear(); localStorage.clear(); } catch (e) {} });
  await page.evaluate((l) => window.SwitchyI18n && window.SwitchyI18n.setLang(l), LANG);
  await page.waitForTimeout(2500); // let the visible batch + idle pass settle

  const seen = await page.evaluate(() => {
    const t = document.querySelector(".swi18n-toast");
    return {
      toast: !!t,
      toastText: t ? (t.textContent || "") : "",
      retryButton: !!(t && t.querySelector("button")),
      dir: document.documentElement.getAttribute("dir") || "",
    };
  });
  await ctx.close();

  const fails = [];
  if (seen.toast !== kase.expect.toast) {
    fails.push(`expected toast=${kase.expect.toast}, got ${seen.toast}${seen.toast ? ` ("${seen.toastText.trim()}")` : ""}`);
  }
  if (kase.expect.toastIncludes && !seen.toastText.includes(kase.expect.toastIncludes)) {
    fails.push(`toast copy should contain "${kase.expect.toastIncludes}", got "${seen.toastText.trim()}"`);
  }
  if (kase.expect.retryButton !== undefined && seen.retryButton !== kase.expect.retryButton) {
    fails.push(`expected retry button=${kase.expect.retryButton}, got ${seen.retryButton}`);
  }
  if (kase.expect.dir && seen.dir !== kase.expect.dir) {
    fails.push(`expected dir=${kase.expect.dir}, got "${seen.dir}"`);
  }
  return { fails, seen };
}

async function main() {
  const server = serve();
  await new Promise((r) => server.listen(PORT, r));
  const browser = await chromium.launch({ executablePath: CHROMIUM });
  let bad = 0;
  try {
    console.log(`\ntranslate failure-UX contract — ${PAGE}\n${"─".repeat(72)}`);
    for (const kase of CASES) {
      const { fails, seen } = await run(browser, kase);
      if (fails.length) {
        bad++;
        console.log(`✗ ${kase.name}`);
        console.log(`    want: ${kase.expect.note}`);
        for (const f of fails) console.log(`    ${f}`);
      } else {
        console.log(`✓ ${kase.name}`);
        console.log(`    ${kase.expect.note}${seen.toastText ? ` — "${seen.toastText.trim()}"` : ""}`);
      }
    }
  } finally {
    await browser.close();
    server.close();
  }
  console.log("─".repeat(72));
  console.log(bad ? `✗ ${bad} case(s) behave wrongly` : "✓ every server outcome produces the right user-facing result");
  process.exit(bad ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
