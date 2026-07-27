// ────────────────────────────────────────────────────────────────────────────
// preview-site.mjs — LOOK at the static site before it ships.
//
// WHY THIS EXISTS: there is no other way to preview a `site/` design change.
// The Vercel project for the static site sets `buildCommand: null` and
// `outputDirectory: "site"`, so it serves the COMMITTED html + the COMMITTED
// `styles.min.css` — and generated output is deliberately never committed from a
// dev machine (rebuild-static.yml owns it and builds from the live DB; a local
// build rounds __HERO_PLANS__ prices and restamps asset hashes). So a CSS change
// is invisible in the PR preview and only appears after merge.
//
// That gap is not theoretical. It hid a real defect: a money figure was moved
// onto a token tuned for light surfaces while sitting on a pinned dark ink card,
// dropping it from 6.65:1 to 2.73:1 — below the large-text floor. `flutter
// analyze`, tsc, eslint, 883 unit tests and the link check were all green and
// all blind to it. A browser saw it in one screenshot.
//
// USAGE
//   node site/build.js                 # generate against the bundled snapshot
//   node scripts/preview-site.mjs      # shoot the default set
//   node scripts/preview-site.mjs /cellular.html .cmp-wrap
//   # then: git checkout -- the generated output (see CLAUDE.md / HOUSE RULES)
//
// Writes PNGs to .preview-shots/ (gitignored). Requires playwright + the
// Chromium that ships in this environment; set PW_CHROMIUM to override the path.
// ────────────────────────────────────────────────────────────────────────────

import { chromium } from "playwright";
import { createServer } from "node:http";
import { readFile, stat, mkdir } from "node:fs/promises";
import { extname, join, normalize, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "site");
const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", ".preview-shots");
const PORT = Number(process.env.PORT || 4399);
// Let Playwright launch the browser IT provisioned for its own version. The
// default used to be a hardcoded /opt/pw-browsers/chromium-1194 path — the
// browser of ONE development sandbox, pinned to one build number — which is the
// whole reason this script could never run anywhere else, CI included.
// PW_CHROMIUM still overrides, for an environment that supplies its own binary.
const CHROMIUM = process.env.PW_CHROMIUM || undefined;

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
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml",
};

/** The surfaces worth a look by default: the money moments and the tables. */
const DEFAULT_SHOTS = [
  { name: "home-calculator", path: "/#calculator", selector: "#calculator" },
  { name: "home-hero", path: "/", selector: ".hero" },
  { name: "compare-table", path: "/cellular.html", selector: ".cmp-wrap" },
  { name: "plan-cards", path: "/cellular.html", selector: ".plan-grid" },
];

const serve = () =>
  createServer(async (req, res) => {
    try {
      const url = decodeURIComponent((req.url || "/").split("?")[0]);
      let p = normalize(join(ROOT, url === "/" ? "/index.html" : url));
      // Path traversal guard — this serves a directory to a real browser.
      if (!p.startsWith(ROOT)) return void res.writeHead(403).end();
      if ((await stat(p)).isDirectory()) p = join(p, "index.html");
      res.writeHead(200, {
        "content-type": TYPES[extname(p)] ?? "application/octet-stream",
      });
      res.end(await readFile(p));
    } catch {
      res.writeHead(404).end("not found");
    }
  });

async function main() {
  const [argPath, argSelector] = process.argv.slice(2);
  const shots = argPath
    ? [{ name: "custom", path: argPath, selector: argSelector }]
    : DEFAULT_SHOTS;

  await mkdir(OUT, { recursive: true });
  const server = serve();
  await new Promise((r) => server.listen(PORT, r));
  const base = `http://127.0.0.1:${PORT}`;

  const browser = await chromium.launch({ executablePath: CHROMIUM });
  try {
    for (const shot of shots) {
      // Both schemes every time: this site pins some bands to a fixed dark ink
      // in BOTH themes, which is exactly where light-surface tokens go wrong.
      for (const dark of [false, true]) {
        const ctx = await browser.newContext({
          viewport: { width: 1280, height: 860 },
          colorScheme: dark ? "dark" : "light",
          locale: "he-IL",
        });
        const page = await ctx.newPage();
        await page
          .goto(base + shot.path, { waitUntil: "networkidle" })
          .catch(() => {});
        // Entrance animations are one-shot; let them finish so nothing is
        // captured mid-fade and read as a contrast problem that isn't one.
        await page.waitForTimeout(1200);
        const file = join(OUT, `${shot.name}-${dark ? "dark" : "light"}.png`);
        const el = shot.selector ? page.locator(shot.selector).first() : null;
        if (el && (await el.count())) {
          await el.scrollIntoViewIfNeeded().catch(() => {});
          await page.waitForTimeout(400);
        }
        // Viewport capture, not full-element: a category table is ~11,000px
        // tall, and the resulting file is too large to be worth looking at.
        await page.screenshot({ path: file });
        await ctx.close();
        console.log("→", file);
      }
    }
  } finally {
    await browser.close();
    server.close();
  }
  console.log(`\nDone. Now revert the generated output before committing:\n  git status --short site/`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
