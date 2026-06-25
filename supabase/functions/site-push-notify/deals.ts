// Deal-feed selection logic — PURE, no I/O, fully unit-tested.
//
// Given raw price-history snapshots and the set of push subscriptions, decide
// WHICH price drops are worth a notification and WHO should get them, honoring:
//   • a real, material drop only (>= ₪5 OR >= 10%) — never a rounding wobble;
//   • the subscriber's opted-in categories (empty = all categories);
//   • opt-out (`opted_out`) — a hard mute;
//   • quiet hours (23:00–08:00 Israel) when the subscriber enabled them;
//   • dedupe — don't re-send the same drop to the same subscription.
//
// E-E-A-T: a "deal" here is a REAL movement recorded in plan_price_history
// (price went DOWN between two snapshots). We never fabricate a saving; if the
// history shows no qualifying drop, nobody is notified. The copy states the old
// and new price verbatim from the ledger.

// ── catalogue category labels (mirror _shared/catalogue.ts CATEGORY_HE) ───────
export const CATEGORY_HE: Record<string, string> = {
  cellular: "סלולר",
  internet: "אינטרנט",
  tv: "טלוויזיה",
  triple: "חבילה משולבת",
  abroad: 'חו"ל',
};

// ── inputs ────────────────────────────────────────────────────────────────────
// A snapshot row as stored in public.plan_price_history.
export interface PriceSnapshot {
  plan_id: string | null;
  category: string | null;
  provider: string | null;
  price: number | null;
  after?: number | null;
  captured_at: string; // ISO timestamp
}

// A push subscription row (public.push_subscriptions + the prefs columns the
// site-push-notify SQL extension adds).
export interface Subscription {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  categories: string[]; // opted-in categories; [] = all
  opted_out?: boolean | null; // hard mute
  quiet_hours?: boolean | null; // suppress 23:00–08:00 Israel
}

// A qualifying price drop derived from two snapshots of the same plan.
export interface PriceDrop {
  planId: string;
  category: string;
  provider: string;
  oldPrice: number;
  newPrice: number;
  dropAmount: number; // oldPrice - newPrice (>0)
  dropPct: number; // dropAmount / oldPrice * 100
  capturedAt: string; // ISO of the NEW (lower) snapshot
}

// ── thresholds ────────────────────────────────────────────────────────────────
export const MIN_DROP_ILS = 5; // absolute floor
export const MIN_DROP_PCT = 10; // relative floor

// A drop must clear EITHER floor (>= ₪5 OR >= 10%) — so a ₪4 cut on a ₪20 plan
// (20%) still fires, and a ₪6 cut on a ₪300 plan (2%) still fires.
export function isMaterialDrop(oldPrice: number, newPrice: number): boolean {
  if (!(oldPrice > 0) || !(newPrice >= 0) || newPrice >= oldPrice) return false;
  const amount = oldPrice - newPrice;
  const pct = (amount / oldPrice) * 100;
  return amount >= MIN_DROP_ILS || pct >= MIN_DROP_PCT;
}

// ── drop detection ─────────────────────────────────────────────────────────────
// Reduce the raw history (many snapshots per plan) to the latest qualifying drop
// per plan. We compare the most-recent snapshot to the immediately previous one
// for the same plan (the meaningful "did the price just drop?" question), only
// considering snapshots within `windowMs` of `now` so a months-old cut isn't
// re-announced. Snapshots with a null/0 price are ignored.
export function detectDrops(
  history: PriceSnapshot[],
  now: number = Date.now(),
  windowMs: number = 7 * 24 * 60 * 60 * 1000,
): PriceDrop[] {
  // Group by plan, keep only well-formed rows, sort each group oldest→newest.
  const byPlan = new Map<string, PriceSnapshot[]>();
  for (const s of history) {
    const id = (s.plan_id ?? "").trim();
    const price = typeof s.price === "number" ? s.price : NaN;
    const t = Date.parse(s.captured_at);
    if (!id || !Number.isFinite(price) || !Number.isFinite(t)) continue;
    const group = byPlan.get(id);
    if (group) group.push(s);
    else byPlan.set(id, [s]);
  }

  const drops: PriceDrop[] = [];
  for (const [planId, snaps] of byPlan) {
    snaps.sort((a, b) => Date.parse(a.captured_at) - Date.parse(b.captured_at));
    const latest = snaps[snaps.length - 1];
    const prev = snaps[snaps.length - 2];
    if (!prev) continue; // need two points to see a movement

    const latestT = Date.parse(latest.captured_at);
    if (now - latestT > windowMs) continue; // the drop is too old to announce

    const oldPrice = prev.price as number;
    const newPrice = latest.price as number;
    if (!isMaterialDrop(oldPrice, newPrice)) continue;

    const amount = oldPrice - newPrice;
    drops.push({
      planId,
      category: (latest.category ?? "").trim(),
      provider: (latest.provider ?? "").trim(),
      oldPrice,
      newPrice,
      dropAmount: Math.round(amount * 100) / 100,
      dropPct: Math.round((amount / oldPrice) * 1000) / 10,
      capturedAt: latest.captured_at,
    });
  }
  // Biggest absolute saving first — the most newsworthy deal leads.
  drops.sort((a, b) => b.dropAmount - a.dropAmount);
  return drops;
}

// ── quiet hours (Israel) ────────────────────────────────────────────────────────
// Israel is UTC+2 (IST) / UTC+3 (IDT). We don't ship a tz database, so we derive
// the Israel wall-clock hour from the UTC hour plus the current offset. The DST
// rule (last Friday of March 02:00 → last Sunday of October 02:00) is computed
// from the date so this stays correct year-round without a lookup table.
export function israelOffsetHours(d: Date): number {
  const year = d.getUTCFullYear();
  // Last Friday of March, 02:00 IST (= 00:00 UTC) — clocks go forward.
  const dstStart = lastWeekdayUtc(year, 2, 5, 0); // month index 2 = March, weekday 5 = Fri, 00:00 UTC
  // Last Sunday of October, 02:00 IDT (= 00:00 UTC) — clocks go back.
  const dstEnd = lastWeekdayUtc(year, 9, 0, 0); // month index 9 = October, weekday 0 = Sun, 00:00 UTC
  const t = d.getTime();
  return t >= dstStart && t < dstEnd ? 3 : 2;
}

// UTC epoch ms of the last `weekday` in `monthIndex` of `year` at `utcHour`:00.
function lastWeekdayUtc(year: number, monthIndex: number, weekday: number, utcHour: number): number {
  // Day 0 of the next month = last day of this month.
  const lastDay = new Date(Date.UTC(year, monthIndex + 1, 0));
  const back = (lastDay.getUTCDay() - weekday + 7) % 7;
  return Date.UTC(year, monthIndex, lastDay.getUTCDate() - back, utcHour, 0, 0);
}

// Israel wall-clock hour (0–23) for an instant.
export function israelHour(now: number = Date.now()): number {
  const d = new Date(now);
  return (d.getUTCHours() + israelOffsetHours(d)) % 24;
}

// Quiet window is 23:00 (inclusive) through 08:00 (exclusive) Israel time.
export function inQuietHours(now: number = Date.now()): boolean {
  const h = israelHour(now);
  return h >= 23 || h < 8;
}

// ── targeting ──────────────────────────────────────────────────────────────────
// Does this subscription want this category right now? Honors opt-out, category
// prefs (empty = all), and (when enabled) quiet hours.
export function subscriptionWantsCategory(
  sub: Subscription,
  category: string,
  now: number = Date.now(),
): boolean {
  if (sub.opted_out) return false;
  if (sub.quiet_hours && inQuietHours(now)) return false;
  const cats = Array.isArray(sub.categories) ? sub.categories : [];
  if (cats.length === 0) return true; // no filter = all categories
  return cats.includes(category);
}

// ── dedupe key ───────────────────────────────────────────────────────────────
// One stable id per (subscription, drop) so the same cut is never pushed twice.
// Keyed on the NEW snapshot timestamp so a *further* drop on the same plan is a
// new, distinct notification.
export function dropDedupeKey(subId: string, drop: PriceDrop): string {
  return `${subId}|${drop.planId}|${drop.capturedAt}`;
}

// ── notification copy (Hebrew, RTL) ─────────────────────────────────────────────
export interface PushMessage {
  title: string;
  body: string;
  data: {
    planId: string;
    category: string;
    provider: string;
    oldPrice: number;
    newPrice: number;
    url: string;
  };
}

// Build the on-screen notification for a drop. States the real old→new price; no
// invented "savings to you" (we don't know the recipient's current bill here).
export function buildPushMessage(drop: PriceDrop, siteOrigin = "https://switchy-ai.com"): PushMessage {
  const catHe = CATEGORY_HE[drop.category] ?? drop.category;
  const provider = drop.provider || "ספק";
  const title = `מחיר ירד: ${provider} · ${catHe}`;
  const body = `המחיר ירד מ-₪${fmt(drop.oldPrice)} ל-₪${fmt(drop.newPrice)} (חיסכון ₪${
    fmt(drop.dropAmount)
  } לחודש). בדקו אם זה משתלם לכם.`;
  const url = `${siteOrigin.replace(/\/$/, "")}/compare?category=${encodeURIComponent(drop.category)}`;
  return {
    title,
    body,
    data: {
      planId: drop.planId,
      category: drop.category,
      provider: drop.provider,
      oldPrice: drop.oldPrice,
      newPrice: drop.newPrice,
      url,
    },
  };
}

// Whole shekels when integral, else one decimal — matches site price display.
function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}
