// ────────────────────────────────────────────────────────────────────────────
// community-channels.test.ts — the community channel list, pinned by CODEPOINT.
//
// community_posts.channel is a plain TEXT column: the Hebrew label IS the key, and
// every surface filters it with an exact string compare. The abroad channel once
// shipped three ways — 'חו״ל' (gershayim U+05F4, canonical), 'חו"ל' (ASCII quote
// U+0022) and bare 'חול' — which look nearly identical, compare unequal, and
// silently partitioned the community: a post filed under one spelling did not exist
// inside the other's channel. No error, just an empty feed.
//
// So these assertions compare Array.from(s).map(c => c.codePointAt(0)), NOT the
// strings. A test that passes with a smart quote swapped for an ASCII quote would
// not have caught the bug that produced this file, and is worth nothing here.
// ────────────────────────────────────────────────────────────────────────────

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ALL_CHANNEL, CATEGORY_TO_CHANNEL, CHANNELS, channelForCategory } from "@/lib/community";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..", "..");
const read = (rel: string) => readFileSync(path.join(repoRoot, rel), "utf8");

interface SharedChannels {
  _readme: string[];
  channels: string[];
  all_channel: string;
  category_to_channel: Record<string, string>;
  legacy_variants: Record<string, string>;
}
const shared = JSON.parse(read("shared/community-channels.json")) as SharedChannels;

/** The ONLY comparison this file trusts: the exact sequence of Unicode scalars. */
const cps = (s: string) => Array.from(s).map((c) => c.codePointAt(0));
/** Readable failure output — "U+05F4" beats "65268" when a quote is wrong. */
const hex = (s: string) =>
  Array.from(s)
    .map((c) => `U+${c.codePointAt(0)!.toString(16).toUpperCase().padStart(4, "0")}`)
    .join(" ");

describe("shared/community-channels.json mirrors web/lib/community.ts exactly", () => {
  it("has the same number of channels", () => {
    expect(shared.channels.length).toBe(CHANNELS.length);
    expect(CHANNELS.length).toBeGreaterThan(0);
  });

  it.each(CHANNELS.map((c, i) => [i, c] as const))(
    "channel %i (%s) matches codepoint for codepoint",
    (i, channel) => {
      const fromFixture = shared.channels[i];
      // Compare the codepoint arrays, so a visually-identical substitution
      // (U+05F4 gershayim -> U+0022 ASCII quote, U+05F3 geresh, U+201D …) fails.
      expect(
        cps(fromFixture),
        `channel[${i}] fixture ${hex(fromFixture)} vs CHANNELS ${hex(channel)}`,
      ).toEqual(cps(channel));
    },
  );

  it("orders the channels identically", () => {
    expect(shared.channels.map(cps)).toEqual(CHANNELS.map(cps));
  });

  it("pins ALL_CHANNEL, which is a UI sentinel and never a stored channel", () => {
    expect(cps(shared.all_channel)).toEqual(cps(ALL_CHANNEL));
    expect(shared.channels.map(cps)).not.toContainEqual(cps(ALL_CHANNEL));
  });

  it("pins the catalogue-category -> channel map", () => {
    expect(Object.keys(shared.category_to_channel).sort()).toEqual(
      Object.keys(CATEGORY_TO_CHANNEL).sort(),
    );
    for (const [cat, channel] of Object.entries(CATEGORY_TO_CHANNEL)) {
      const fromFixture = shared.category_to_channel[cat];
      expect(
        cps(fromFixture),
        `${cat}: fixture ${hex(fromFixture)} vs ${hex(channel)}`,
      ).toEqual(cps(channel));
    }
  });

  it("maps every category to a channel that actually exists", () => {
    for (const channel of Object.values(CATEGORY_TO_CHANNEL)) {
      expect(CHANNELS.map(cps)).toContainEqual(cps(channel));
    }
    // The documented fallback for an unmapped id (electricity, …).
    expect(cps(channelForCategory("electricity"))).toEqual(cps("המלצות"));
    expect(cps(channelForCategory(null))).toEqual(cps("המלצות"));
  });
});

describe("legacy_variants is a repair table, never a set of accepted values", () => {
  it("records the abroad spellings that partitioned the feed", () => {
    const canonicalAbroad = CATEGORY_TO_CHANNEL.abroad;
    // The exact two off-canonical spellings found in shipped code, built here from
    // raw codepoints so this file cannot itself be "fixed" by an editor's autocorrect.
    const asciiQuote = String.fromCodePoint(0x05d7, 0x05d5, 0x0022, 0x05dc); // חו"ל
    const noPunctuation = String.fromCodePoint(0x05d7, 0x05d5, 0x05dc); // חול
    expect(cps(shared.legacy_variants[asciiQuote])).toEqual(cps(canonicalAbroad));
    expect(cps(shared.legacy_variants[noPunctuation])).toEqual(cps(canonicalAbroad));
    // …and they really are DIFFERENT strings from the canonical one, which is the
    // entire reason the partition was invisible.
    expect(cps(asciiQuote)).not.toEqual(cps(canonicalAbroad));
    expect(cps(noPunctuation)).not.toEqual(cps(canonicalAbroad));
  });

  it("never lists a canonical channel as a variant to be rewritten", () => {
    for (const variant of Object.keys(shared.legacy_variants)) {
      expect(CHANNELS.map(cps)).not.toContainEqual(cps(variant));
    }
    // Every repair target must be a real channel.
    for (const target of Object.values(shared.legacy_variants)) {
      expect(CHANNELS.map(cps)).toContainEqual(cps(target));
    }
  });
});

// ── Cross-surface: the static site must emit the SAME strings ────────────────
// site/build.js writes the channel filter buttons and site/script.js compares
// data-channel with `===` against community_posts.channel. Read as source text
// (same fixture pattern as community-contract.test.ts) — build.js is a CommonJS
// build script and cannot be imported into this bundle.

describe("site/build.js emits the canonical channels", () => {
  const buildSrc = read("site/build.js");

  const literals = (arrayName: string): string[] => {
    const m = new RegExp(`const ${arrayName} = \\[([\\s\\S]*?)\\];`).exec(buildSrc);
    expect(m, `${arrayName} not found in site/build.js`).toBeTruthy();
    return Array.from(m![1].matchAll(/'([^']*)'/g)).map((x) => x[1]);
  };

  it("COMMUNITY_CHANNELS matches CHANNELS codepoint for codepoint", () => {
    const siteChannels = literals("COMMUNITY_CHANNELS");
    expect(siteChannels.length).toBe(CHANNELS.length);
    siteChannels.forEach((c, i) => {
      expect(cps(c), `site channel[${i}] ${hex(c)} vs ${hex(CHANNELS[i])}`).toEqual(
        cps(CHANNELS[i]),
      );
    });
  });

  it("uses the canonical 'all' sentinel", () => {
    const m = /const COMMUNITY_ALL_CHANNEL = '([^']*)';/.exec(buildSrc);
    expect(m, "COMMUNITY_ALL_CHANNEL not found in site/build.js").toBeTruthy();
    expect(cps(m![1])).toEqual(cps(ALL_CHANNEL));
  });

  it("emits Hebrew data-channel values, not English keys", () => {
    // The regression this file exists for: build.js shipped
    // ['cellular','סלולר'] etc., so data-channel="cellular" was compared against
    // the stored 'סלולר' and every filter click read as an empty channel.
    //
    // NB the English keys were never literal `data-channel="cellular"` strings in
    // the source — they were the first element of each pair — so asserting their
    // ABSENCE passes on the broken code too. The load-bearing assertion is the
    // pairing below: every channel must map to ITSELF.
    for (const englishKey of ["recommend", "cellular", "internet", "tv", "abroad", "help"]) {
      expect(buildSrc).not.toContain(`data-channel="${englishKey}"`);
    }
    expect(buildSrc).toContain("data-channel=\"${esc(val)}\"");
  });

  it("pairs every channel with ITSELF, so the value equals the stored label", () => {
    // Fails on the pre-fix source, where the pairs were [english, hebrew]:
    //   ['all','הכול'], ['recommend','המלצות'], ['cellular','סלולר'], …
    const m = /const channels = \[\[\s*'all'\s*,[\s\S]*?\];/.exec(buildSrc);
    expect(m, "the community channel pair list was not found in site/build.js")
      .toBeTruthy();
    // 'all' is the legitimate sentinel KEY and is expected; any OTHER latin
    // literal here is a per-channel English key, i.e. the bug.
    const latin = Array.from(m![0].matchAll(/'([a-z]{2,})'/g)).map((x) => x[1]);
    expect(latin, "only the 'all' sentinel may be a latin key").toEqual(["all"]);
    expect(m![0]).toContain("COMMUNITY_CHANNELS.map");
  });

  it("keeps exactly ONE hand-written channel list in the file", () => {
    // site/build.js carried a SECOND, hand-kept copy in appPage() that had
    // silently lost 'חבילה משולבת' — six of seven — so the app landing page
    // under-promised the product and disagreed with community.html. The first
    // version of this test suite pinned only COMMUNITY_CHANNELS, leaving that
    // twin free to drift forever. Any future copy trips this.
    //
    // A channel list is an array whose members are ALL canonical channels (two
    // or more of them). The "all canonical" half matters: site/build.js also
    // holds a GUIDES array that shares several names but includes
    // 'מדריך כללי', and flagging that would be a false positive — the first
    // version of this test did exactly that.
    const isChannelList = (lit: string): boolean => {
      const members = Array.from(lit.matchAll(/'([^']*)'/g)).map((x) => x[1]);
      const canonical = members.filter((s) => (CHANNELS as readonly string[]).includes(s));
      return canonical.length >= 2 && canonical.length === members.length;
    };
    const arrays = Array.from(buildSrc.matchAll(/\[[^[\]]{0,400}?\]/g))
      .map((x) => x[0])
      .filter(isChannelList);
    expect(
      arrays,
      `expected one channel list (COMMUNITY_CHANNELS); found ${arrays.length}:\n` +
        arrays.map((a) => a.slice(0, 160)).join("\n---\n"),
    ).toHaveLength(1);
  });
});

describe("site/script.js folds the legacy variants before comparing", () => {
  const scriptSrc = read("site/script.js");

  it("declares an alias table covering every legacy variant", () => {
    const m = /const CHANNEL_ALIASES = \{([\s\S]*?)\};/.exec(scriptSrc);
    expect(m, "CHANNEL_ALIASES not found in site/script.js").toBeTruthy();
    for (const variant of Object.keys(shared.legacy_variants)) {
      // The ASCII-quote variant is written with double quotes in the JS source.
      expect(m![1]).toContain(variant);
    }
  });

  it("filters on the normalised channel, not the raw column value", () => {
    expect(scriptSrc).toContain("normChannel(p.channel) === activeChannel");
  });
});
