'use strict';
// ─────────────────────────────────────────────────────────────────────────────
// money-contrast.test.js — the money tiers must stay legible in BOTH themes.
//
// WHY THIS FILE EXISTS. Nothing in this repo checks colour contrast. Not
// `node site/build.js`, not tsc, not eslint, not the vitest or deno suites —
// and a 1.80:1 CTA has shipped here before precisely because a token can be
// nudged and every gate stays green.
//
// The money type block in styles.css commits, in prose, to specific measured
// ratios ("5.9:1 on --white / 5.5:1 on --cream in light", "#8A570D on that ink
// measures 2.73:1, below even the 3:1 large-text floor", "6.65:1"). Those
// numbers were true when written and there is nothing stopping the next edit to
// --value-ink from falsifying all of them silently. This turns the prose into
// an assertion.
//
// It reads the TOKENS out of styles.css rather than hard-coding hexes, so
// changing a token is what makes it fail — which is the whole point. The pairs
// below are the grounds each tier is actually painted on, verified by rendering
// calc-cellular.html in real Chromium and reading getComputedStyle: the payoff
// figure resolved to rgb(138,87,13) on rgb(246,242,233) = 5.45:1 in light and
// rgb(242,198,109) on rgb(14,23,19) = 11.36:1 in dark, matching the light-theme
// row here exactly. jsdom cannot do that (it does not lay out or cascade), so
// the browser check stays a manual step and this file guards the tokens.
//
// Floors are WCAG 2.1 AA: 4.5:1 normal text, 3:1 for large text (>=24px, or
// >=18.66px bold). The money tiers are all large-and-bold, but where a tier
// also appears at body size the stricter floor is demanded.
// ─────────────────────────────────────────────────────────────────────────────

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const css = fs.readFileSync(path.join(__dirname, 'styles.css'), 'utf8');

/** Read one declaration block by its exact selector, brace-matched so the scan
 *  stops at the block's own `}` and cannot bleed into later rules (`.a11y-contrast`
 *  re-declares --ink, and a naive slice-to-end silently picked that up). */
function block(selector) {
  const start = css.indexOf(selector + ' {');
  assert.ok(start >= 0, `selector not found in styles.css: ${selector}`);
  let depth = 0;
  let i = css.indexOf('{', start);
  const open = i;
  for (; i < css.length; i++) {
    if (css[i] === '{') depth++;
    else if (css[i] === '}' && --depth === 0) break;
  }
  return css.slice(open + 1, i);
}

/** Hex custom properties declared in a block. Later wins, same as CSS. */
function tokensIn(body) {
  const out = {};
  for (const m of body.matchAll(/(--[a-z0-9-]+):\s*(#[0-9a-fA-F]{3,8})\s*;/g)) {
    out[m[1]] = m[2];
  }
  return out;
}

function rgb(hex) {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
}
function srgb(c) {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}
function luminance(c) {
  const [r, g, b] = rgb(c);
  return 0.2126 * srgb(r) + 0.7152 * srgb(g) + 0.0722 * srgb(b);
}
function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// Light is the base `:root`; dark is the `:root[data-theme="dark"]` re-skin,
// which only re-declares what it changes — so dark inherits the rest.
const light = tokensIn(block(':root'));
const dark = { ...light, ...tokensIn(block(':root[data-theme="dark"]')) };

test('the money tokens are the ones the tiers reference', () => {
  // If a token is renamed, every pair below would silently resolve to undefined
  // and the suite would pass while measuring nothing.
  for (const [name, t] of [['light', light], ['dark', dark]]) {
    for (const k of ['--value', '--value-ink', '--cream', '--white', '--ink']) {
      assert.match(t[k] || '', /^#[0-9a-fA-F]{3,8}$/, `${name} ${k} missing from styles.css`);
    }
  }
  // The two themes must actually differ, or "dark parity" is untested.
  assert.notEqual(light['--value-ink'], dark['--value-ink']);
});

// [ label, fg token, bg token, theme, floor ]
const PAIRS = [
  // .price-hero / .calc__resultBig / .price-row / .price-stat all resolve to
  // --value-ink. Grounds: --cream is the calculator output panel and the page
  // canvas; --white is the card surface.
  ['light: money tier on the calculator panel (--cream)', '--value-ink', '--cream', light, 4.5],
  ['light: money tier on a card (--white)', '--value-ink', '--white', light, 4.5],
  // The dark re-skin is claimed to give "all three tiers dark parity for free".
  ['dark: money tier on the calculator panel (--cream)', '--value-ink', '--cream', dark, 4.5],
  ['dark: money tier on a card (--white)', '--value-ink', '--white', dark, 4.5],
];

// ── The pinned dark panel (.calc__card) ─────────────────────────────────────
// This one is NOT a token-on-token pair. .calc__card is a gradient that is dark
// in BOTH themes — `linear-gradient(140deg, var(--green-d), var(--green))` in
// light, hard-coded `#0B0F14 → #1F2733` in dark — so the figure on it is the one
// money moment that does not sit on the ivory ground, and styles.css overrides
// it to --value for exactly that reason.
//
// Contrast is measured against the LIGHTEST stop, which is the worst case: a
// gradient is only as legible as its weakest point, and averaging the two would
// hide a failure at one end.
const PINNED_LIGHTEST = { light: '--green', dark: '#1F2733' };

test('contrast — homepage calculator figure on the pinned dark panel (light)', () => {
  const bg = light[PINNED_LIGHTEST.light];
  const ratio = contrast(light['--value'], bg);
  assert.ok(ratio >= 4.5, `--value ${light['--value']} on ${bg} = ${ratio.toFixed(2)}:1`);
});

test('contrast — homepage calculator figure on the pinned dark panel (dark)', () => {
  const ratio = contrast(dark['--value'], PINNED_LIGHTEST.dark);
  assert.ok(ratio >= 4.5, `dark --value ${dark['--value']} = ${ratio.toFixed(2)}:1`);
});

test('the .calc__card colour override is still NECESSARY, not cargo cult', () => {
  // styles.css overrides that one figure to --value and justifies it with a
  // measurement: "#8A570D on that ink measures 2.73:1, below even the 3:1
  // large-text floor". If a future token change ever made --value-ink legible
  // there, the override would be dead weight and this test says so; while it
  // stays illegible, this is the standing proof the override must not be
  // deleted. Either way the prose and the tokens cannot drift apart silently.
  const onPanel = contrast(light['--value-ink'], light[PINNED_LIGHTEST.light]);
  assert.ok(
    onPanel < 3.0,
    `--value-ink now measures ${onPanel.toFixed(2)}:1 on the pinned panel; the ` +
      `.calc__card .calc__resultBig { color: var(--value) } override and the ` +
      `comment above it need revisiting`,
  );
  // And the override's own colour must clear the bar the plain token misses.
  assert.ok(contrast(light['--value'], light[PINNED_LIGHTEST.light]) >= 4.5);
});

for (const [label, fgKey, bgKey, theme, floor] of PAIRS) {
  test(`contrast — ${label}`, () => {
    const fg = theme[fgKey];
    const bg = theme[bgKey];
    const ratio = contrast(fg, bg);
    assert.ok(
      ratio >= floor,
      `${label}: ${fg} on ${bg} = ${ratio.toFixed(2)}:1, below the ${floor}:1 floor`,
    );
  });
}

test('the amber monopoly holds — --value-ink is not reused as body ink', () => {
  // The tier block's stated effect depends on amber belonging to money alone:
  // "no other type rank on the site may be amber — the monopoly IS the effect."
  assert.notEqual(light['--value-ink'], light['--ink']);
  assert.notEqual(light['--value-ink'], light['--muted']);
});
