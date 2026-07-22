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
