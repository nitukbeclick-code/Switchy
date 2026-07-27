'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const catalogue = require('./data/plans.json');
const { calculateTwelveMonthCost, formatAnnualCost } = require('./plan-cost.js');

const plan = (overrides = {}) => ({
  id: 'p1', cat: 'internet', provider: 'ספק', plan: 'מסלול', price: 40,
  after: null, is5G: false, noCommit: true, hasAbroad: false, ...overrides,
});

test('uses published month tiers for the first year', () => {
  const cost = calculateTwelveMonthCost(plan({
    price: 39, after: 159,
    fineLines: ['מדרגות מחיר: ח׳1-2: ₪39 / ח׳3-12: ₪139 / ח׳13+: ₪159'],
  }));
  assert.equal(cost.minimum, 1468);
  assert.equal(cost.maximum, 1468);
  assert.equal(cost.basis, 'published-schedule');
});

test('returns an honest range when the promotion duration is absent', () => {
  const cost = calculateTwelveMonthCost(plan({ price: 40, after: 60 }));
  assert.equal(formatAnnualCost(cost), '₪480–₪700');
  assert.equal(cost.basis, 'published-range');
});

test('falls back to published prices when exact fields are null', () => {
  const cost = calculateTwelveMonthCost(plan({ price: 12, priceExact: null, after: 18, afterExact: null }));
  assert.equal(cost.minimum, 144);
  assert.equal(cost.maximum, 210);
});

test('produces a finite ordered result for the complete catalogue', () => {
  for (const item of catalogue.plans) {
    const cost = calculateTwelveMonthCost(item);
    assert.ok(Number.isFinite(cost.minimum), item.id);
    assert.ok(Number.isFinite(cost.maximum), item.id);
    assert.ok(cost.minimum >= 0, item.id);
    assert.ok(cost.maximum >= cost.minimum, item.id);
    if (item.price > 0) assert.ok(cost.minimum > 0, item.id);
    assert.equal(cost.segments[0]?.fromMonth, 1, item.id);
    assert.equal(cost.segments.at(-1)?.toMonth, 12, item.id);
  }
});

// ── A free opening month published in prose, not as a tier ───────────────────
test('a published free first month is not charged', () => {
  // The real catalogue row: yes Fiber הטריפל. Only "ח׳2-12" matched the tier
  // regex, so month 1 kept the ₪209 fallback and the plan was billed ₪2,508 for
  // a year in which it gives the first month away.
  const cost = calculateTwelveMonthCost({
    price: 209,
    fineLines: ['חודש ראשון חינם | ח׳2-12: ₪209 | ח׳13-36: ₪229 | ח׳37+: ₪329'],
  });
  assert.equal(cost.minimum, 209 * 11);
  assert.notEqual(cost.minimum, 209 * 12);
  assert.equal(cost.segments[0].monthly, 0);
  assert.equal(cost.segments[0].toMonth, 1);
});

test('a free ADD-ON is never mistaken for a free subscription month', () => {
  // Most "חינם"/"מתנה" in the catalogue describe an add-on — HBO Max, a router,
  // SIM delivery, a projector. Charging month 1 at ₪0 for those would invent a
  // discount the plan does not give.
  for (const line of [
    'HBO Max חינם 3 ח׳ אח"כ ₪25',
    'נתב WiFi7 שנה מתנה | תשתית בזק',
    'שיחות חו"ל + משלוח SIM חינם',
    'מקרן וידאו במתנה | ספורט 5 כלול',
    'סינון אתרים חינם',
  ]) {
    const cost = calculateTwelveMonthCost({ price: 100, fineLines: [line] });
    assert.equal(cost.minimum, 1200, line);
    assert.equal(cost.segments[0].monthly, 100, line);
  }
});

test('a free first month with NO published ladder is left alone', () => {
  // Conservative on purpose: with no tier ladder we are not refining a known
  // schedule, we would be inventing one from prose. Overstating the cost
  // understates the saving, which is the safe direction to be wrong in.
  const cost = calculateTwelveMonthCost({ price: 75, fineLines: ['₪75 ל-3 מנויים | חודש ראשון חינם'] });
  assert.equal(cost.basis, 'fixed-price');
  assert.equal(cost.minimum, 900);
});

// ── The cross-surface parity contract ────────────────────────────────────────
// shared/plan-cost-cases.json holds ONE set of expected twelve-month costs, read
// by all four copies of this engine. See its _readme for why: the copies drifted
// once and every suite stayed green, because each pinned only its own behaviour.
const sharedCases = require('../shared/plan-cost-cases.json');

test('matches the shared cross-surface fixtures', () => {
  assert.ok(sharedCases.cases.length > 0, 'the shared fixture file is empty');
  for (const c of sharedCases.cases) {
    const cost = calculateTwelveMonthCost(c.plan);
    assert.equal(cost.basis, c.expect.basis, `${c.name}: basis`);
    assert.ok(Math.abs(cost.minimum - c.expect.minimum) < 0.005,
      `${c.name}: minimum was ${cost.minimum}, expected ${c.expect.minimum}`);
    assert.ok(Math.abs(cost.maximum - c.expect.maximum) < 0.005,
      `${c.name}: maximum was ${cost.maximum}, expected ${c.expect.maximum}`);
  }
});
