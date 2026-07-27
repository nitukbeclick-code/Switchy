// ────────────────────────────────────────────────────────────────────────────
// lead-form-lazy.test.ts — <LeadForm> must never be imported EAGERLY.
//
// WHY THIS FILE EXISTS. LeadForm is ~1,300 lines and drags react-hook-form plus
// a 42-city list in with it. It is below the fold on every surface that renders
// it, and on BillUploader it is behind a conditional that only fires after an
// analysis returns — so on first paint it is dead weight in every case.
//
// app/page.tsx got this right (it imports @/components/LeadFormLazy). Six route
// pages and BillUploader did not, and shipped the whole form in the first-paint
// bundle of the money pages:
//
//   route                        first-load JS   after switching to LeadFormLazy
//   /compare/[service]             1,066,072 B →  1,014,204 B   (−51,868)
//   /compare/[service]/[city]      1,066,072 B →  1,014,204 B   (−51,868)
//   /providers/[slug]              1,066,072 B →  1,014,204 B   (−51,868)
//   /vs/[pair]                     1,066,072 B →  1,014,204 B   (−51,868)
//   /plans/[id]                    1,031,092 B →    978,375 B   (−52,717)
//   /switch/[provider]             1,024,120 B →    971,403 B   (−52,717)
//
// (Measured by summing the /_next/static/chunks/*.js the prerendered HTML
// actually references, before and after, in a production build.)
//
// Nothing in tsc, eslint, `next build` or the other 1,004 tests can see this
// regression: swapping the specifier back is a valid, type-correct import that
// silently re-adds ~50 kB to first paint. Hence a test that reads the source.
//
// The rule is about the IMPORT SPECIFIER, not about behaviour, so this asserts
// on file text rather than by rendering — that is the thing that regresses.
// ────────────────────────────────────────────────────────────────────────────

import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(here, "..", "..");

/** Every .tsx under a directory, minus test files. */
function tsxFiles(dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    for (const entry of readdirSync(d)) {
      if (entry === "node_modules" || entry === "__tests__") continue;
      const p = path.join(d, entry);
      if (statSync(p).isDirectory()) walk(p);
      else if (entry.endsWith(".tsx")) out.push(p);
    }
  };
  walk(dir);
  return out;
}

/** A direct `from "@/components/LeadForm"` — the eager path. The trailing quote
 *  matters: it is what distinguishes it from ".../LeadFormLazy". */
const EAGER = /from\s+"@\/components\/LeadForm"/;

/** The one file allowed to import LeadForm eagerly: the lazy wrapper itself,
 *  which does so via a dynamic import + a type-only import of its props. */
const ALLOWED = new Set([path.join(webRoot, "components", "LeadFormLazy.tsx")]);

describe("LeadForm is never imported eagerly", () => {
  const candidates = [
    ...tsxFiles(path.join(webRoot, "app")),
    ...tsxFiles(path.join(webRoot, "components")),
  ];

  it("scans a non-trivial number of files (guards against a broken walker)", () => {
    // If the walk silently returned [] this suite would pass while checking
    // nothing — the exact failure mode a source-scanning test must rule out.
    expect(candidates.length).toBeGreaterThan(50);
  });

  it("finds the surfaces that render it (guards against a stale regex)", () => {
    // If LeadForm were renamed, EAGER would stop matching anywhere and this
    // file would go quietly green. Anchor on the lazy specifier still existing.
    const lazyImporters = candidates.filter((f) =>
      /from\s+"@\/components\/LeadFormLazy"/.test(readFileSync(f, "utf8")),
    );
    expect(lazyImporters.length).toBeGreaterThanOrEqual(8);
  });

  it("no app/ or components/ file imports @/components/LeadForm directly", () => {
    const offenders = candidates
      .filter((f) => !ALLOWED.has(f))
      .filter((f) => EAGER.test(readFileSync(f, "utf8")))
      .map((f) => path.relative(webRoot, f));

    expect(
      offenders,
      `import from "@/components/LeadFormLazy" instead — an eager import puts ` +
        `react-hook-form + the city list on first paint (~50 kB)`,
    ).toEqual([]);
  });

  it("the lazy wrapper really defers (ssr:false + a reserved-height skeleton)", () => {
    // The guard above is only worth anything if the wrapper it redirects to
    // actually code-splits. Pin the properties that make it do so.
    //
    // Read CODE ONLY. The file's header comment contains the literal string
    // "`ssr: false` is NOT allowed there", so a naive whole-file /ssr:\s*false/
    // matches the prose and passes even after the real option is deleted — this
    // assertion was written that way first and a drill caught it passing on
    // deliberately broken code. Strip comments, then match inside the actual
    // dynamic() options object.
    const raw = readFileSync(
      path.join(webRoot, "components", "LeadFormLazy.tsx"),
      "utf8",
    );
    const code = raw
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");

    const call = /dynamic\(\s*\(\)\s*=>\s*import\("\.\/LeadForm"\)\s*,\s*\{([\s\S]*?)\}\s*\)/
      .exec(code);
    expect(call, "no dynamic(() => import('./LeadForm'), {...}) call found")
      .toBeTruthy();

    const options = call![1];
    expect(options, "ssr:false is what keeps the form off the server render")
      .toMatch(/ssr:\s*false/);
    expect(options, "a bare null placeholder would reintroduce layout shift")
      .toMatch(/loading:/);
  });
});
