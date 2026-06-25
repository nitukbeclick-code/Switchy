// Proactive Savings Watcher — PURE selection logic, no I/O, fully unit-tested.
//
// For each tracked plan the user opted in to watch (tracked_plans.watch_opt_in),
// decide whether there is a REAL, grounded saving opportunity worth a proactive
// §30A alert, and — if so — to WHOM and over WHICH channel(s) it may be sent.
//
// Two honest signals (TRUTH-ONLY — never a fabricated saving):
//   (A) a real price DROP recorded in public.plan_price_history for the exact
//       plan the user tracks (tracked_plans.plan_id ↔ plan_price_history.plan_id),
//       below the price they're currently paying; OR
//   (B) a catalogue plan in the SAME category that genuinely BEATS the tracked
//       monthly_price (a market rate that already exists — not a promise).
// If neither exists, the user is NOT contacted. The copy quotes the real figures.
//
// COMPLIANCE (Communications Law §30A — the Spam Law). A proactive alert is a
// marketing message, so it is gated, in this exact order, by the caller:
//   1. consent — only tracked plans with watch_opt_in = true reach this module;
//   2. suppression — the contact must NOT be on marketing_suppression for the
//      channel (we filter against a suppressed-set the caller supplies);
//   3. quiet hours — never 23:00–08:00 Israel (reused from site-push-notify);
//   4. dedupe — the same opportunity is never re-alerted to the same user.
// This module enforces 2–4 as pure predicates; the caller does 1 by only
// fetching opted-in rows.
//
// Reuses the deal-feed's DST-aware Israel quiet-hours so both proactive senders
// share ONE clock (single source of truth).

import { inQuietHours, israelHour } from "../site-push-notify/deals.ts";
import { annualSaving, CATEGORY_HE, type Plan } from "../_shared/catalogue.ts";

export { inQuietHours, israelHour };

// ── inputs ──────────────────────────────────────────────────────────────────

// A tracked plan the user asked us to watch (public.tracked_plans, opted in).
export interface TrackedPlan {
  id: string;
  user_id: string;
  plan_id?: string | null; // catalogue plan id this row tracks (added by the migration)
  category: string;
  provider: string;
  plan_name: string;
  monthly_price: number; // what the user pays today (₪/month)
}

// A price-history snapshot (public.plan_price_history), same shape the deal feed
// reads. We only need plan_id + price + captured_at here.
export interface PriceSnapshot {
  plan_id: string | null;
  price: number | null;
  captured_at: string; // ISO timestamp
}

// How the user can be reached + their per-channel consent/availability. The
// caller assembles this from the profile + push subscription. `suppressed*` mark
// a §30A opt-out on that channel (from marketing_suppression).
export interface WatchContact {
  userId: string;
  phone?: string | null; // E.164 for WhatsApp
  push?: { endpoint: string; p256dh: string; auth: string } | null;
  suppressedWhatsapp?: boolean; // on marketing_suppression (whatsapp, phone)
  suppressedPush?: boolean; // hard-muted browser push
}

// ── thresholds ──────────────────────────────────────────────────────────────
// A saving must clear EITHER floor (matches the deal feed): ≥ ₪5/mo OR ≥ 10% of
// what they pay — so a small cut on a cheap plan and a small % on a pricey plan
// both still fire, but a rounding wobble never does.
export const MIN_SAVE_ILS = 5;
export const MIN_SAVE_PCT = 10;

// True when paying `paid` and a real `candidate` price is a MATERIAL saving.
export function isMaterialSaving(paid: number, candidate: number): boolean {
  if (!(paid > 0) || !(candidate >= 0) || candidate >= paid) return false;
  const amount = paid - candidate;
  const pct = (amount / paid) * 100;
  return amount >= MIN_SAVE_ILS || pct >= MIN_SAVE_PCT;
}

// ── opportunity detection ─────────────────────────────────────────────────────

export type OpportunitySource = "price_drop" | "better_plan";

// A grounded saving opportunity for one tracked plan. Every figure is REAL:
// `paid` is the user's monthly_price; `newPrice` is either the dropped history
// price (price_drop) or a catalogue plan's price (better_plan). `betterPlan` is
// only set for the better_plan source.
export interface Opportunity {
  trackedId: string;
  userId: string;
  source: OpportunitySource;
  category: string;
  provider: string; // the tracked provider (price_drop) or the better plan's (better_plan)
  planName: string;
  paid: number;
  newPrice: number;
  monthlySaving: number; // paid - newPrice (>0)
  annualSaving: number; // monthlySaving * 12, clamped ≥ 0
  signalAt: string; // ISO: the snapshot captured_at (price_drop) or "" (better_plan)
  betterPlanId?: string; // catalogue plan id (better_plan only)
}

// The latest price for each plan from a history slice (newest captured_at wins).
// Ignores null/non-finite prices. Exposed for the caller + tests.
export function latestPriceByPlan(history: PriceSnapshot[]): Map<string, { price: number; at: string }> {
  const out = new Map<string, { price: number; at: string }>();
  for (const s of history) {
    const id = (s.plan_id ?? "").trim();
    const price = typeof s.price === "number" ? s.price : NaN;
    const t = Date.parse(s.captured_at);
    if (!id || !Number.isFinite(price) || !Number.isFinite(t)) continue;
    const cur = out.get(id);
    if (!cur || t > Date.parse(cur.at)) out.set(id, { price, at: s.captured_at });
  }
  return out;
}

// Find the single best CATALOGUE plan in the same category that beats `paid`.
// "Beats" = a material saving on a real, regular catalogue plan. Cheapest wins.
// Never returns the tracked plan itself (matched by id when known). Pure.
export function bestBeatingPlan(
  plans: Plan[],
  category: string,
  paid: number,
  excludePlanId?: string | null,
): Plan | null {
  let best: Plan | null = null;
  for (const p of plans) {
    if (p.cat !== category) continue;
    if ((p.kind ?? "regular") !== "regular") continue;
    if (typeof p.price !== "number") continue;
    if (excludePlanId && p.id && p.id === excludePlanId) continue;
    if (!isMaterialSaving(paid, p.price)) continue;
    if (!best || (p.price as number) < (best.price as number)) best = p;
  }
  return best;
}

// Compute the best opportunity (if any) for ONE tracked plan. Prefers a REAL
// recorded price drop on the exact tracked plan (the strongest, most personal
// signal); falls back to a catalogue plan that beats what they pay. Returns null
// when there's no honest saving — the user is then simply not contacted.
export function opportunityForTracked(
  tracked: TrackedPlan,
  latestByPlan: Map<string, { price: number; at: string }>,
  plans: Plan[],
): Opportunity | null {
  const paid = Number(tracked.monthly_price);
  if (!(paid > 0)) return null;

  // (A) Real price drop on the exact plan the user tracks.
  const trackedPlanId = (tracked.plan_id ?? "").trim();
  if (trackedPlanId) {
    const latest = latestByPlan.get(trackedPlanId);
    if (latest && isMaterialSaving(paid, latest.price)) {
      const monthly = Math.round((paid - latest.price) * 100) / 100;
      return {
        trackedId: tracked.id,
        userId: tracked.user_id,
        source: "price_drop",
        category: tracked.category,
        provider: tracked.provider,
        planName: tracked.plan_name,
        paid,
        newPrice: latest.price,
        monthlySaving: monthly,
        annualSaving: annualSaving(paid, latest.price),
        signalAt: latest.at,
      };
    }
  }

  // (B) A catalogue plan that genuinely beats the tracked monthly price.
  const better = bestBeatingPlan(plans, tracked.category, paid, trackedPlanId || undefined);
  if (better && typeof better.price === "number") {
    const monthly = Math.round((paid - better.price) * 100) / 100;
    return {
      trackedId: tracked.id,
      userId: tracked.user_id,
      source: "better_plan",
      category: tracked.category,
      provider: String(better.provider ?? ""),
      planName: String(better.plan ?? ""),
      paid,
      newPrice: better.price,
      monthlySaving: monthly,
      annualSaving: annualSaving(paid, better.price),
      signalAt: "",
      betterPlanId: better.id,
    };
  }

  return null;
}

// ── dedupe ────────────────────────────────────────────────────────────────────
// One stable id per (tracked plan, opportunity) so the same saving is never
// re-alerted. Keyed on the source + the new price (+ the snapshot time for a
// drop), so a FURTHER drop / a NEW cheaper plan is a fresh, distinct alert.
export function opportunityDedupeKey(op: Opportunity): string {
  const tail = op.source === "price_drop" ? op.signalAt : `${op.betterPlanId ?? ""}`;
  return `${op.trackedId}|${op.source}|${op.newPrice}|${tail}`;
}

// ── channel eligibility (§30A: suppression + reachability) ────────────────────
export interface ChannelPlan {
  whatsapp: boolean; // may send a WhatsApp alert
  push: boolean; // may send a Web Push alert
}

// Which channels this contact may receive a PROACTIVE alert on right now. A
// channel is eligible only when the contact is reachable on it AND not on the
// suppression list for it. (Quiet hours are applied separately, once, to the
// whole pass.) Pure.
export function eligibleChannels(contact: WatchContact): ChannelPlan {
  const whatsapp = !!contact.phone && !contact.suppressedWhatsapp;
  const push = !!contact.push && !contact.suppressedPush;
  return { whatsapp, push };
}

// ── §30A send-time suppression gate (the real fix) ────────────────────────────
// The eligibleChannels() pre-filter uses a suppressed-set snapshotted at the
// start of the pass; this is the LAST gate, re-checking the durable
// marketing_suppression registry against THIS phone immediately before the send
// — so a contact who sent STOP on WhatsApp can never receive a savings-watch
// alert even if they opted out after the snapshot was taken. Dependency-injected
// (lookup + send) so it's pure-testable with no network. Fail-soft posture lives
// in the injected `isSuppressed` (returns false on error → we treat the contact
// as NOT suppressed and still send, rather than silently dropping every alert on
// a transient DB blip), matching the rest of this function.
export type WhatsappSendOutcome = "suppressed" | "sent" | "failed";

export async function sendWatchWhatsapp(
  phone: string,
  text: string,
  isSuppressed: (channel: "whatsapp", contact: string) => Promise<boolean>,
  send: (to: string, body: string) => Promise<string | null>,
): Promise<WhatsappSendOutcome> {
  if (await isSuppressed("whatsapp", phone)) return "suppressed";
  const wamid = await send(phone, text);
  return wamid ? "sent" : "failed";
}

// ── alert copy (Hebrew, RTL) ──────────────────────────────────────────────────
export interface WatchAlert {
  title: string; // push title / WhatsApp first line
  body: string; // the saving, quoting REAL figures
  url: string; // deep link into the app to act on it
}

function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

// Build the alert text from an opportunity. States the user's real current price,
// the real new/market price, and the honest monthly + annual saving. NEVER a
// promise — for a better_plan it says "a plan exists at" (market rate), and for a
// price_drop it states the recorded drop.
export function buildWatchAlert(op: Opportunity, siteOrigin = "https://switchy-ai.com"): WatchAlert {
  const catHe = CATEGORY_HE[op.category] ?? op.category;
  const origin = siteOrigin.replace(/\/$/, "");
  const saveLine = `חיסכון של ₪${fmt(op.monthlySaving)} לחודש${
    op.annualSaving > 0 ? ` (₪${fmt(op.annualSaving)} בשנה)` : ""
  }.`;
  if (op.source === "price_drop") {
    return {
      title: `המחיר של ${op.provider} ירד 📉`,
      body:
        `המסלול שאתם עוקבים אחריו (${op.planName}, ${catHe}) ירד מ-₪${fmt(op.paid)} ל-₪${
          fmt(op.newPrice)
        } לחודש. ${saveLine} כדאי לבדוק אם מגיע לכם המחיר החדש.`,
      url: `${origin}/renewal?tracked=${encodeURIComponent(op.trackedId)}`,
    };
  }
  return {
    title: `נמצא מסלול ${catHe} זול יותר 💡`,
    body:
      `אתם משלמים ₪${fmt(op.paid)} לחודש. יש בקטלוג מסלול של ${op.provider} (${op.planName}) ב-₪${
        fmt(op.newPrice)
      } לחודש — מחיר שוק קיים, לא הבטחה. ${saveLine} שווה השוואה.`,
    url: `${origin}/compare?category=${encodeURIComponent(op.category)}`,
  };
}
