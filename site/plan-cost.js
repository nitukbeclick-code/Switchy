/* Shared 12-month service-cost engine for the static desktop site.
 * CommonJS at build/test time; window.SwitchyPlanCost in the browser bundle. */
(function exposePlanCost(root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.SwitchyPlanCost = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createPlanCost() {
  'use strict';

  const MONTHS = 12;

  const finiteNumber = (value) => {
    if (value == null || value === '') return null;
    const n = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(n) && n >= 0 ? n : null;
  };

  const planText = (plan) => {
    const values = [];
    if (Array.isArray(plan.fineLines)) values.push(...plan.fineLines);
    if (Array.isArray(plan.terms)) values.push(...plan.terms);
    else if (typeof plan.terms === 'string') values.push(plan.terms);
    if (typeof plan.notes === 'string') values.push(plan.notes);
    return values.join(' | ');
  };

  const numericAmount = (text) => {
    const currency = text.match(/₪\s*([\d,.]+)/);
    const fallback = text.match(/(?:^|\+)\s*([\d,.]+)/);
    const raw = (currency && currency[1]) || (fallback && fallback[1]);
    if (!raw) return null;
    const n = Number(raw.replace(/,/g, ''));
    return Number.isFinite(n) && n >= 0 ? n : null;
  };

  const planFees = (plan) => {
    const recurringExtras = [];
    const oneTimeFees = [];
    let hasUnpricedFees = false;
    if (!plan.fees || typeof plan.fees !== 'object' || Array.isArray(plan.fees)) {
      return { recurringExtras, oneTimeFees, hasUnpricedFees };
    }
    Object.entries(plan.fees).forEach(([label, value]) => {
      if (typeof value !== 'string') return;
      const raw = value.trim();
      if (!raw || /^(אין|כלול|חינם|ללא)$/i.test(raw)) return;
      const amount = numericAmount(raw);
      if (amount == null) { hasUnpricedFees = true; return; }
      const fee = { label, amount, raw };
      if (/(?:\/\s*ח[׳'\"]?|לחודש|חודשי)/i.test(raw)) recurringExtras.push(fee);
      else oneTimeFees.push(fee);
    });
    return { recurringExtras, oneTimeFees, hasUnpricedFees };
  };

  const scheduledMonths = (text, fallback) => {
    const months = Array.from({ length: MONTHS }, () => fallback);
    let found = false;
    const pattern = /ח[׳'\"]?\s*(\d{1,2})\s*[-–—]\s*(\d{1,2})\s*:\s*₪?\s*([\d,.]+)/g;
    for (const match of text.matchAll(pattern)) {
      const from = Math.max(1, Number(match[1]));
      const to = Math.min(MONTHS, Number(match[2]));
      const amount = Number(match[3].replace(/,/g, ''));
      if (!Number.isFinite(amount) || from > to) continue;
      found = true;
      for (let month = from; month <= to; month += 1) months[month - 1] = amount;
    }
    if (/(?:ח[׳'\"]?\s*13\+|שנה\s*2\+)\s*:/.test(text)) found = true;
    return found ? months : null;
  };

  const promoMonths = (text) => {
    const numbered = text.match(/ל[-־]?\s*(\d{1,2})\s*חודש/);
    if (numbered) return Math.max(1, Number(numbered[1]));
    if (/לחודשיים/.test(text)) return 2;
    if (/לחודש(?:\s|$|\||,)/.test(text)) return 1;
    if (/לשנה|שנה ראשונה|מחיר שנה/.test(text)) return 12;
    return null;
  };

  const compressSchedule = (months) => {
    if (!months.length) return [];
    const segments = [];
    let fromMonth = 1;
    let monthly = months[0];
    for (let index = 1; index <= months.length; index += 1) {
      if (index < months.length && months[index] === monthly) continue;
      segments.push({ fromMonth, toMonth: index, monthly });
      fromMonth = index + 1;
      monthly = months[index];
    }
    return segments;
  };

  function calculateTwelveMonthCost(plan) {
    const headline = finiteNumber(plan.priceExact) ?? finiteNumber(plan.price) ?? 0;
    const after = finiteNumber(plan.afterExact) ?? finiteNumber(plan.after);
    const text = planText(plan);
    const fees = planFees(plan);
    const schedule = scheduledMonths(text, headline);
    if (schedule) {
      const total = schedule.reduce((sum, amount) => sum + amount, 0);
      return { months: MONTHS, minimum: total, maximum: total, basis: 'published-schedule',
        segments: compressSchedule(schedule), ...fees,
        disclosure: 'לפי מדרגות המחיר שפורסמו ל־12 החודשים הראשונים; ציוד והתקנה מוצגים בנפרד.' };
    }
    if (after != null && after > headline) {
      const duration = promoMonths(text);
      if (duration != null) {
        const promo = Math.min(MONTHS, duration);
        const months = Array.from({ length: MONTHS }, (_, index) => index < promo ? headline : after);
        const total = months.reduce((sum, amount) => sum + amount, 0);
        return { months: MONTHS, minimum: total, maximum: total, basis: 'published-promo',
          segments: compressSchedule(months), ...fees,
          disclosure: 'לפי משך המבצע והמחיר שאחריו כפי שפורסמו; ציוד והתקנה מוצגים בנפרד.' };
      }
      return { months: MONTHS, minimum: headline * MONTHS,
        maximum: headline + after * (MONTHS - 1), basis: 'published-range',
        segments: [{ fromMonth: 1, toMonth: MONTHS, monthly: headline }], ...fees,
        disclosure: 'משך המבצע לא פורסם בקטלוג, לכן מוצג טווח ולא ניחוש; ציוד והתקנה מוצגים בנפרד.' };
    }
    const total = headline * MONTHS;
    return { months: MONTHS, minimum: total, maximum: total, basis: 'fixed-price',
      segments: [{ fromMonth: 1, toMonth: MONTHS, monthly: headline }], ...fees,
      disclosure: 'לפי המחיר החודשי שפורסם ל־12 חודשים; ציוד והתקנה מוצגים בנפרד.' };
  }

  const numberFormat = new Intl.NumberFormat('he-IL', { maximumFractionDigits: 2 });
  const amount = (value) => numberFormat.format(value);
  const formatAnnualCost = (cost) => Math.abs(cost.maximum - cost.minimum) < 0.005
    ? `₪${amount(cost.minimum)}` : `₪${amount(cost.minimum)}–₪${amount(cost.maximum)}`;
  const formatMonthlyEquivalent = (cost) => {
    const min = cost.minimum / MONTHS;
    const max = cost.maximum / MONTHS;
    return Math.abs(max - min) < 0.005
      ? `₪${amount(min)}` : `₪${amount(min)}–₪${amount(max)}`;
  };
  const formatSegments = (cost) => cost.segments.map((segment) => {
    const period = segment.fromMonth === segment.toMonth
      ? `חודש ${segment.fromMonth}` : `חודשים ${segment.fromMonth}–${segment.toMonth}`;
    return `${period}: ₪${amount(segment.monthly)} לחודש`;
  }).join(' · ');

  return { MONTHS, calculateTwelveMonthCost, formatAnnualCost, formatMonthlyEquivalent, formatSegments };
});
