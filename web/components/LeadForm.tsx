"use client";

// ────────────────────────────────────────────────────────────────────────────
// <LeadForm> — two-step lead capture (Name + Phone → City / service / consent).
// Built on react-hook-form. POSTs to /api/lead (server inserts into Supabase with
// the service-role key; the browser never sees it) and fires fireLeadConversion()
// ONLY on a confirmed success.
//
// HONESTY / LEGAL: a MANDATORY, unchecked-by-default consent checkbox gates
// submission. The server stamps consent timestamps + IP and enforces rate limits;
// this form enforces the checkbox client-side so a lead is never sent without it.
// Two more rules the form owns, because both are about what a person is TOLD:
//   • NOTHING TRAVELS INVISIBLY — a host page's `contextNote` (a bill read, quiz
//     figures, the wallet's typed bills) is folded into `notes` next to the
//     visitor's name/phone/city, so it is RENDERED above the submit button first.
//   • NO PROMISE POINTING BACKWARDS — the picked callback window is resolved
//     through callbackConfirmation() against the clock, so a window that has
//     already passed today is never confirmed as "היום".
//
// WHY TWO STEPS: name and phone share one step because a phone's keychain fills
// both in a SINGLE autofill invocation — splitting them forced the user to invoke
// autofill twice for two fields. The submit button is never `disabled` on a
// missing consent tick: a disabled button swallows the tap and reports nothing,
// which on a phone (the box is ~300px above the button) is a silent dead end at
// the last step of the funnel. It stays clickable, looks blocked via
// `data-blocked`, and a click runs validation → the required error is announced
// and the checkbox is focused. The GATE ITSELF IS UNCHANGED: RHF's `required`
// rule on `consent` means onSubmit — and therefore the POST — never runs without
// a ticked box.
// ────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useForm, useWatch } from "react-hook-form";
import Icon from "@/components/Icon";
import citiesData from "@/data/cities.json";
import { CATEGORY_HE } from "@/lib/categories";
import { fireLeadConversion, trackEvent } from "@/lib/tracking";
import { isValidIsraeliPhone } from "@/lib/phone";
import { referralCodeFromQuery } from "@/lib/referral";
import {
  CONTACT_WHATSAPP_INTL,
  CTA_OBJECTIONS,
  CTA_OBJECTIONS_LABEL,
  MARKETING_CHANNELS,
  MARKETING_OPTIN_HEADING,
  MARKETING_OPTIN_NOTE,
  marketingChannelLabel,
} from "@/lib/legal";
import {
  COMPARISON_CHANGE_EVENT,
  comparisonIntentNote,
  selectedPlanIntent,
  type PlanIntentOption,
} from "@/lib/comparison-intent";

/** Categories offered in the "desired service" step (in display order). */
const SERVICE_CATEGORIES = [
  "cellular",
  "internet",
  "tv",
  "triple",
  "abroad",
] as const;

type ServiceCategory = (typeof SERVICE_CATEGORIES)[number];

/**
 * The 42 REAL catalogue cities (web/data/cities.json — the same list that backs
 * the /compare/[service]/[city] geo pages) offered as a <datalist>, so the city
 * step is a pick instead of a Hebrew-keyboard typing task on a phone. A datalist
 * only SUGGESTS: the input stays free text, so a town outside the list is still
 * typable, and the field stays REQUIRED (it feeds CRM routing).
 */
const CITY_SUGGESTIONS: string[] = citiesData.cities.map((c) => c.name);

/**
 * Optional callback-window preference. The four values are EXACTLY the set
 * /api/lead validates against (route.ts `allowedCallback`) and persists to the
 * dedicated leads.callback_time column — anything else is dropped server-side.
 * `confirmation` is the concrete window echoed back in the success state, so the
 * promise the user reads is the one they actually asked for. No default is
 * pre-selected: an optional field must never answer on the user's behalf.
 *
 * The two SAME-DAY windows also carry `endHour` — the hour from which "היום"
 * would point at a time that has already gone by — and `nextDay`, the same
 * window on the next day. See callbackConfirmation() below.
 */
const CALLBACK_TIMES = [
  { value: "now", label: "עכשיו", confirmation: "בהקדם האפשרי" },
  {
    value: "noon",
    label: "צהריים",
    confirmation: "היום בשעות הצהריים",
    endHour: 16,
    nextDay: "מחר בשעות הצהריים",
  },
  {
    value: "evening",
    label: "ערב",
    confirmation: "היום בשעות הערב",
    endHour: 21,
    nextDay: "מחר בשעות הערב",
  },
  { value: "tomorrow", label: "מחר", confirmation: "מחר" },
] as const;

type CallbackTime = (typeof CALLBACK_TIMES)[number]["value"];

/** A resolved, clock-checked callback promise (see callbackConfirmation). */
export interface CallbackPromise {
  /** The window we are allowed to say out loud, e.g. "מחר בשעות הערב". */
  text: string;
  /** True when the asked-for window had already passed and we moved it on. */
  shifted: boolean;
}

/**
 * Resolve the picked callback window into the sentence we may honestly say,
 * given the clock at the moment of the promise.
 *
 * WHY THIS EXISTS: "היום בשעות הצהריים" is a PROMISE. Echoed back without a
 * clock check, a lead left at 23:00 asking for צהריים was told a rep would call
 * in a window that had already passed that day — a time in the past. From
 * `endHour` onwards the same-day windows are behind us, so the confirmation
 * moves to the SAME window on the next day (`nextDay`) — a window the business
 * already offers (it is the "מחר" chip), never an invented SLA. Windows without
 * an `endHour` ("בהקדם האפשרי", "מחר") can never point backwards, so they pass
 * through untouched. No selection ⇒ null, and the caller keeps the honest
 * default ("בדרך כלל תוך יום עסקים אחד").
 *
 * Pure by design — the clock is an argument, so the boundary is unit-testable.
 * Israel is a single timezone, so the client's local hour is the right clock.
 */
export function callbackConfirmation(
  value: CallbackTime | "",
  now: Date = new Date(),
): CallbackPromise | null {
  const opt = CALLBACK_TIMES.find((o) => o.value === value);
  if (!opt) return null;
  if ("endHour" in opt && now.getHours() >= opt.endHour) {
    return { text: opt.nextDay, shifted: true };
  }
  return { text: opt.confirmation, shifted: false };
}

/**
 * The lighter, consent-free channel offered beside the form (and again in the
 * success state) for anyone who finds a gated form too heavy. Always a text
 * link with the chat glyph — never a filled button competing with the submit.
 */
const WHATSAPP_LEAD_HREF = `https://wa.me/${CONTACT_WHATSAPP_INTL}?text=${encodeURIComponent(
  "היי, השארתי פרטים באתר",
)}`;

/** The shape react-hook-form manages. Mirrors the /api/lead client contract. */
interface LeadFormValues {
  name: string;
  phone: string;
  city: string;
  category: ServiceCategory | "";
  consent: boolean;
  /** OPTIONAL callback window — "" = the user didn't choose one. */
  callbackTime: CallbackTime | "";
  // OPTIONAL, default-UNCHECKED marketing opt-ins (Spam Law) — separate from the
  // MANDATORY `consent` gate above. Each maps to a leads.consent_marketing_*
  // column server-side.
  marketingSms: boolean;
  marketingEmail: boolean;
  marketingWhatsapp: boolean;
}

export interface LeadFormProps {
  /**
   * Where the lead originated, sent to /api/lead as `source`
   * (form / plan / compare / advisor / callback / porting).
   */
  source: string;
  /** Pre-select the desired-service category (e.g. on a category page). */
  defaultCategory?: ServiceCategory;
  /**
   * Pre-fill the city (e.g. from a /compare/[service]/[city] geo page's URL
   * param). The field stays editable so the user can correct it.
   */
  defaultCity?: string;
  /** Optional heading override. */
  heading?: string;
  /** Optional extra classes on the form wrapper. */
  className?: string;
  /**
   * Optional REAL catalogue counts for an honest trust line ("משווים X מסלולים
   * מ-Y ספקים"). Both must be real, catalogue-derived numbers passed by the
   * server page — never fabricated. When omitted, no count line is shown.
   */
  trustStats?: { planCount: number; providerCount: number };
  /** Minimal, trusted catalogue mapping used to resolve a `?plans=` shortlist
   * into CRM provider/plan context. Omit outside comparison journeys. */
  planOptions?: PlanIntentOption[];
  /**
   * Optional REAL context about what the visitor was looking at when they asked
   * (e.g. a computed saving, the plan they came from). Appended to the `notes`
   * payload so the rep opens the call already knowing the ask. /api/lead accepts
   * `notes` and folds it into the stored note (route.ts). TRUTH-ONLY: callers
   * must pass a computed/catalogue-derived string, never a marketing claim.
   * It is also SHOWN to the visitor above the submit button ("מה שיישלח עם
   * הפנייה"), because it is stored in the same record as their name, phone and
   * city — write it as a line the person it describes is meant to read.
   */
  contextNote?: string;
  /**
   * Optional provider/plan the visitor arrived from, sent as the CRM
   * provider/plan_id when no `?plans=` shortlist is present (a shortlist is an
   * explicit in-session choice, so it wins over the page's default context).
   */
  provider?: string;
  planId?: string;
}

// Two steps, not four. Name+phone share a step (one autofill invocation fills
// both); city, service and consent share the closing step. Four screens for four
// fields cost 8+ taps and a drop-off per screen.
const STEP_FIELDS: (keyof LeadFormValues)[][] = [
  ["name", "phone"],
  ["city", "category", "consent"],
];

const STEP_TITLES = ["פרטי קשר", "מה מחפשים?"];

export default function LeadForm({
  source,
  defaultCategory,
  defaultCity,
  heading = "קבלת הצעה — השוואה חינמית",
  className,
  trustStats,
  planOptions = [],
  contextNote,
  provider,
  planId,
}: LeadFormProps) {
  const {
    register,
    handleSubmit,
    trigger,
    control,
    formState: { errors, isSubmitting },
  } = useForm<LeadFormValues>({
    mode: "onTouched",
    // The submit button stays clickable without a consent tick (see the file
    // header), so a blocked submit MUST move focus to the offending field —
    // otherwise the error renders 300px up the page where nobody sees it.
    shouldFocusError: true,
    defaultValues: {
      name: "",
      phone: "",
      city: defaultCity ?? "",
      category: defaultCategory ?? "",
      consent: false,
      // No callback window is pre-selected — the user opts in or leaves it empty.
      callbackTime: "",
      // Marketing opt-ins are OFF by default — explicit opt-in only (Spam Law).
      marketingSms: false,
      marketingEmail: false,
      marketingWhatsapp: false,
    },
  });

  const [step, setStep] = useState(0);
  const [done, setDone] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [intentPlans, setIntentPlans] = useState<PlanIntentOption[]>([]);
  // The callback promise the ACCEPTED lead carried, so the success state can
  // name the concrete window the user chose instead of a vague default. It is
  // RESOLVED at submit time (callbackConfirmation reads the clock there), so a
  // window that has already passed today is never echoed back as "היום".
  const [confirmedCallback, setConfirmedCallback] =
    useState<CallbackPromise | null>(null);

  // ── The receipt's source of truth ────────────────────────────────────────
  // Everything that will ride along in the lead's `notes` column, assembled the
  // SAME way the submit handler assembles it (comparison shortlist, then the
  // host page's contextNote, joined with " | "). The rule this component states
  // is that nothing about a person's own data travels invisibly — so the block
  // below renders THIS, not just `contextNote`. Showing only half of the payload
  // would make the promise false on /compare, where the shortlist is the half
  // that travels. `intentPlans` is already kept in sync with the URL shortlist
  // by the effect below, so this needs no extra state.
  const outgoingNotes = [comparisonIntentNote(intentPlans), contextNote]
    .filter(Boolean)
    .join(" | ");

  useEffect(() => {
    if (!planOptions.length) return;
    const sync = () => {
      const next = selectedPlanIntent(window.location.search, planOptions);
      setIntentPlans(next);
    };
    // The comparison component emits this after every shortlist change. Queue
    // the initial read to avoid a synchronous state write during effect setup.
    queueMicrotask(sync);
    window.addEventListener(COMPARISON_CHANGE_EVENT, sync);
    window.addEventListener("popstate", sync);
    return () => {
      window.removeEventListener(COMPARISON_CHANGE_EVENT, sync);
      window.removeEventListener("popstate", sync);
    };
  }, [planOptions]);

  // Fire "lead_form_start" at most once per mount, on the first successful
  // advance — the denominator for the form's micro-funnel / drop-off analysis.
  const startedRef = useRef(false);

  // One ref per step's FIRST actionable input, so a successful next() can
  // programmatically focus the newly-revealed field. On mobile this keeps the
  // soft keyboard up between the steps instead of collapsing (a re-tap per step =
  // a quiet conversion leak). react-hook-form owns its own ref via register();
  // mergeRef() below wires both without stealing RHF's.
  const stepInputRefs = useRef<Array<HTMLInputElement | HTMLSelectElement | null>>(
    [],
  );

  /**
   * Merge react-hook-form's ref callback with our per-step ref so both receive
   * the node. RHF needs its ref for validation/focus; we need ours to focus the
   * next step's input after it mounts. Generic over the concrete element type so
   * the returned callback stays assignable to each field's `ref` prop.
   */
  function mergeStepRef<T extends HTMLInputElement | HTMLSelectElement>(
    index: number,
    rhfRef: (instance: T | null) => void,
  ) {
    return (node: T | null) => {
      rhfRef(node);
      stepInputRefs.current[index] = node;
    };
  }

  // Subscribe to the consent field so the submit button reflects its state.
  const consentChecked = useWatch({ control, name: "consent" });
  // …and to the callback window, so the "what happens next" promise updates the
  // moment a chip is picked — the same clock-checked window the success state
  // echoes, so the pre-submit line can't promise a time the confirmation won't.
  const callbackChoice = useWatch({ control, name: "callbackTime" });
  const chosenCallback = callbackConfirmation(callbackChoice);

  const lastStep = STEP_FIELDS.length - 1;
  const progress = Math.round(((step + 1) / STEP_FIELDS.length) * 100);

  async function next() {
    const ok = await trigger(STEP_FIELDS[step], { shouldFocus: true });
    if (!ok) return;
    // Micro-funnel: start fires once (first valid advance), then a step event per
    // advance so we can see which step bleeds users. Labels only — no PII.
    if (!startedRef.current) {
      startedRef.current = true;
      trackEvent("lead_form_start", { source });
    }
    trackEvent("lead_form_step", {
      source,
      step: step + 1,
      step_name: STEP_TITLES[step],
    });
    const nextStep = Math.min(step + 1, lastStep);
    setStep(nextStep);
    // Keep the mobile soft keyboard up: focus the next step's input on the frame
    // after it mounts (the previous step unmounts, so the ref must exist first).
    // A double rAF is used so focus lands after React has committed the new DOM.
    // Guarded — focus() is a no-op if the node isn't there. select() is skipped
    // (the field is empty on arrival).
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        stepInputRefs.current[nextStep]?.focus();
      });
    });
  }

  function back() {
    setServerError(null);
    setStep((s) => Math.max(s - 1, 0));
  }

  async function onSubmit(values: LeadFormValues) {
    setServerError(null);
    // Referral attribution: a referee who landed from a share link arrives with
    // ?ref=SW-XXXXXX. Read it from the URL at submit time and forward it only when
    // it's a well-formed code (the helper normalizes + validates, returning null
    // for junk/spoofed values). Guarded for SSR — `window` is browser-only and
    // this only runs on submit. It NEVER affects the consent/suppression gate.
    const referrerCode =
      typeof window !== "undefined"
        ? referralCodeFromQuery(window.location.search)
        : null;
    const selectedPlans =
      typeof window !== "undefined"
        ? selectedPlanIntent(window.location.search, planOptions)
        : [];
    const primaryPlan = selectedPlans[0];
    // CRM note = the comparison shortlist (when there is one) plus whatever REAL
    // context the host page computed, joined with the same " | " separator the
    // server already uses when folding notes into the stored record.
    const notes = [comparisonIntentNote(selectedPlans), contextNote]
      .filter(Boolean)
      .join(" | ");
    try {
      const res = await fetch("/api/lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: values.name.trim(),
          phone: values.phone.trim(),
          city: values.city.trim(),
          category: values.category || undefined,
          source,
          provider: primaryPlan?.provider ?? provider,
          plan_id: primaryPlan?.id ?? planId,
          notes: notes || undefined,
          // Optional callback window — validated server-side against exactly this
          // set and written to the dedicated leads.callback_time column.
          callback_time: values.callbackTime || undefined,
          // Optional referral attribution (null when the visitor didn't arrive
          // via a share link). The server re-validates with isReferralCode.
          referrer_code: referrerCode || undefined,
          // Mandatory consent — the server re-stamps the timestamps itself.
          consent: values.consent,
          // OPTIONAL granular marketing opt-ins (Spam Law) — each maps to a
          // dedicated leads.consent_marketing_* boolean column.
          consent_marketing_sms: values.marketingSms,
          consent_marketing_email: values.marketingEmail,
          consent_marketing_whatsapp: values.marketingWhatsapp,
        }),
      });

      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        // Distinguishes "submit failed" from "user never submitted" in the funnel.
        trackEvent("lead_form_error", { source, reason: "server" });
        setServerError(
          body?.error ??
            "אירעה שגיאה בשליחת הפרטים. נסו שוב בעוד רגע או פנו אלינו.",
        );
        return;
      }

      // Success only — fire conversion tracking exactly once.
      fireLeadConversion({ category: values.category || undefined, source });
      // Resolve the promise against the SUBMIT-time clock (not render time), so
      // a צהריים request left at 23:00 is confirmed for tomorrow, never for a
      // window that has already passed today.
      setConfirmedCallback(callbackConfirmation(values.callbackTime));
      setDone(true);
    } catch {
      trackEvent("lead_form_error", { source, reason: "network" });
      setServerError(
        "החיבור נכשל. בדקו את הרשת ונסו שוב — הפרטים לא נשלחו.",
      );
    }
  }

  /** Fires the already-wired whatsappClick product event (see lib/tracking). */
  function trackWhatsapp(location: string) {
    trackEvent("outbound_click", { dest: "whatsapp", source, location });
  }

  if (done) {
    // The concrete window the user asked for, already clock-checked at submit
    // time. Null when they picked nothing ⇒ the honest default SLA below.
    const callbackPromise = confirmedCallback;
    return (
      <div
        className={[
          "bento glow-accent p-7 text-center",
          className ?? "",
        ]
          .join(" ")
          .trim()}
        role="status"
        aria-live="polite"
      >
        <div
          aria-hidden="true"
          className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-accent/15 text-2xl text-accent motion-safe:animate-[lead-success-pop_360ms_var(--ease-out)_both]"
        >
          ✓
        </div>
        {/* Rare, first-time SUCCESS delight (rule 11): a one-shot settle of the
            confirmation glyph — transform+opacity only, ease-out, motion-safe.
            Not a loop; fires once when the form completes. */}
        <style>{`@keyframes lead-success-pop{from{opacity:0;transform:scale(0.9)}to{opacity:1;transform:scale(1)}}`}</style>
        <h3 className="font-display text-lg font-bold tracking-tight text-ink">
          הפרטים התקבלו, תודה!
        </h3>
        {/* The window the user asked for — or, when that window had already
            passed by the time they submitted, the next time it comes round,
            said plainly so the shift is never a silent swap. */}
        <p className="mt-1 text-sm text-muted">
          {callbackPromise
            ? callbackPromise.shifted
              ? `נציג יחזור אליכם ${callbackPromise.text} — החלון שביקשתם כבר חלף היום — עם השוואת הצעות מותאמת. `
              : `נציג יחזור אליכם ${callbackPromise.text} — החלון שביקשתם — עם השוואת הצעות מותאמת. `
            : "נציג יחזור אליכם בדרך כלל תוך יום עסקים אחד עם השוואת הצעות מותאמת. "}
          השירות חינמי וללא התחייבות — תוכלו להחליט בנחת.
        </p>
        <p className="mt-2 text-xs text-muted">
          לא מצאתם את ההודעה? נחזור אליכם בטלפון שהשארתם.
        </p>

        {/* The highest-trust moment in the product used to terminate here. Two
            QUIET secondary paths — never a second filled button competing with
            the confirmation: talk to a human now, or book the documented
            secondary close (a Zoom consultation), which had no path from the
            primary one. Both are ≥44px tap targets. */}
        <div className="mt-4 flex flex-col items-center gap-1 border-t border-border/60 pt-3 text-sm">
          <a
            href={WHATSAPP_LEAD_HREF}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => trackWhatsapp("lead_success")}
            className="interactive inline-flex min-h-11 items-center gap-1.5 text-accent-text underline underline-offset-2 [@media(hover:hover)_and_(pointer:fine)]:hover:text-accent-hover"
          >
            <Icon name="chat" size={16} aria-hidden="true" />
            לדבר איתנו עכשיו בוואטסאפ
          </a>
          <Link
            href="/book"
            className="interactive inline-flex min-h-11 items-center gap-1.5 text-accent-text underline underline-offset-2 [@media(hover:hover)_and_(pointer:fine)]:hover:text-accent-hover"
          >
            {/* RTL: the shared arrow is drawn LTR, so mirror it to point at the
                logical "forward" (inline-start) in a Hebrew document. */}
            <Icon
              name="arrow"
              size={16}
              aria-hidden="true"
              className="rotate-180"
            />
            לקבוע שיחת ייעוץ חינמית בזום
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      onKeyDown={(e) => {
        // On non-final steps a single text input implicit-submits on Enter, which
        // would fire a full-form validation/POST against fields not yet entered.
        // Intercept it so Enter ADVANCES (validating only the current step) — only
        // the last step's real submit button finalizes the lead. Textareas keep
        // Enter for newlines.
        const el = e.target as HTMLElement;
        if (e.key === "Enter" && step < lastStep && el.tagName !== "TEXTAREA") {
          e.preventDefault();
          void next();
        }
      }}
      noValidate
      aria-labelledby="lead-form-heading"
      className={[
        "bento p-6 sm:p-7",
        className ?? "",
      ]
        .join(" ")
        .trim()}
    >
      <h3
        id="lead-form-heading"
        className="font-display text-lg font-bold tracking-tight text-ink"
      >
        {heading}
      </h3>

      {/* Honest trust signals — free + no-commitment + real catalogue counts.
          The counts render ONLY when the server page passes real numbers. */}
      <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
        <span className="inline-flex items-center gap-1 font-medium text-accent-text">
          <span aria-hidden="true">✓</span> השוואה חינמית · ללא התחייבות
        </span>
        {trustStats && trustStats.planCount > 0 && (
          <>
            <span aria-hidden="true">·</span>
            <span>
              משווים {trustStats.planCount} מסלולים מ-
              {trustStats.providerCount} ספקים
            </span>
          </>
        )}
      </p>

      {intentPlans.length > 0 ? (
        <div
          className="mt-4 rounded-xl border border-accent/25 bg-accent/[0.06] p-3"
          role="status"
          aria-live="polite"
        >
          <p className="text-xs font-bold uppercase tracking-wide text-accent-text">
            הבחירה שלכם מחוברת לבקשה
          </p>
          <ul className="mt-1.5 space-y-1 text-sm text-foreground">
            {intentPlans.map((plan) => (
              <li key={plan.id} className="flex items-start gap-1.5">
                <span aria-hidden="true" className="text-accent-text">✓</span>
                <span>{plan.provider} — {plan.name}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs leading-relaxed text-muted">
            הנציג יקבל את המסלולים שבחרתם כדי להמשיך בדיוק מאותה נקודה.
          </p>
        </div>
      ) : null}

      {/* Progress — a glanceable "שלב X מתוך Y" line, a per-step dot strip so the
          discrete position is visible at once, and the continuous fill bar that
          carries the accessible progressbar semantics. Presentation only; `step`
          is already tracked, this just renders it. */}
      <div className="mt-3 mb-5">
        {/* SR-only polite announcer: the visible line below is static inline
            text (not a live region), so screen readers wouldn't announce a step
            change on their own. This mirrors it as an aria-live="polite" region
            so SR users hear "שלב X מתוך 2" each time the step advances. */}
        <p aria-live="polite" className="sr-only">
          שלב {step + 1} מתוך {STEP_FIELDS.length}: {STEP_TITLES[step]}
        </p>
        <div className="mb-1.5 flex items-center justify-between text-xs text-muted">
          <span aria-hidden="true">
            שלב {step + 1} מתוך {STEP_FIELDS.length}: {STEP_TITLES[step]}
          </span>
          <span>{progress}%</span>
        </div>
        {/* Step dots — the active step is accent-green, completed steps stay a
            softer accent, upcoming steps are neutral. Decorative (the bar below
            owns the a11y semantics), so the strip is aria-hidden. RTL-correct:
            flex follows the document's logical direction. */}
        <div
          aria-hidden="true"
          className="mb-1.5 flex items-center gap-1.5"
        >
          {STEP_FIELDS.map((_, i) => (
            <span
              key={i}
              className={[
                "h-1.5 flex-1 rounded-full transition-colors duration-300 ease-[var(--ease-out)]",
                i < step
                  ? "bg-accent/40"
                  : i === step
                    ? "bg-accent"
                    : "bg-border",
              ].join(" ")}
            />
          ))}
        </div>
        <div
          className="h-1.5 w-full overflow-hidden rounded-full bg-border"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progress}
          aria-label="התקדמות הטופס"
        >
          <div
            className="h-full rounded-full bg-accent transition-[width] duration-300 ease-[var(--ease-out)]"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Step 0 — Name + phone. Deliberately one step: a phone's keychain fills
          both fields in a single autofill invocation. */}
      {step === 0 && (
        <div className="space-y-4">
          <div>
            <label
              htmlFor="lead-name"
              className="mb-1 block text-sm font-medium text-foreground"
            >
              שם מלא
            </label>
            {(() => {
              const { ref, ...rest } = register("name", {
                required: "נא להזין שם",
                minLength: { value: 2, message: "השם קצר מדי" },
              });
              return (
                <input
                  id="lead-name"
                  type="text"
                  autoComplete="name"
                  enterKeyHint="next"
                  aria-required="true"
                  aria-invalid={errors.name ? "true" : "false"}
                  aria-describedby={errors.name ? "lead-name-error" : undefined}
                  className="interactive w-full rounded-xl border border-border bg-background px-3 py-2.5 text-foreground outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
                  ref={mergeStepRef<HTMLInputElement>(0, ref)}
                  {...rest}
                />
              );
            })()}
            {errors.name && (
              <p id="lead-name-error" role="alert" className="mt-1 text-xs text-danger-text">
                {errors.name.message}
              </p>
            )}
          </div>

          <div>
            <label
              htmlFor="lead-phone"
              className="mb-1 block text-sm font-medium text-foreground"
            >
              מספר טלפון
            </label>
            <input
              id="lead-phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              enterKeyHint="next"
              dir="ltr"
              aria-required="true"
              aria-invalid={errors.phone ? "true" : "false"}
              aria-describedby={errors.phone ? "lead-phone-error" : undefined}
              className="interactive w-full rounded-xl border border-border bg-background px-3 py-2.5 text-right text-foreground outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
              {...register("phone", {
                required: "נא להזין מספר טלפון",
                validate: (v) =>
                  isValidIsraeliPhone(v) || "מספר הטלפון אינו תקין",
              })}
            />
            {errors.phone && (
              <p id="lead-phone-error" role="alert" className="mt-1 text-xs text-danger-text">
                {errors.phone.message}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Step 1 — City, desired service, callback window + mandatory consent */}
      {step === 1 && (
        <div className="space-y-4">
          <div>
            <label
              htmlFor="lead-city"
              className="mb-1 block text-sm font-medium text-foreground"
            >
              עיר מגורים
            </label>
            {(() => {
              const { ref, ...rest } = register("city", {
                required: "נא להזין עיר מגורים",
                minLength: { value: 2, message: "שם העיר קצר מדי" },
              });
              return (
                <input
                  id="lead-city"
                  type="text"
                  autoComplete="address-level2"
                  enterKeyHint="next"
                  // Suggestions only — the input stays free text so a town outside
                  // the catalogue's 42 cities is still typable, and REQUIRED
                  // (the city routes the lead to the right rep).
                  list="lead-cities"
                  aria-required="true"
                  aria-invalid={errors.city ? "true" : "false"}
                  aria-describedby={errors.city ? "lead-city-error" : undefined}
                  className="interactive w-full rounded-xl border border-border bg-background px-3 py-2.5 text-foreground outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
                  ref={mergeStepRef<HTMLInputElement>(1, ref)}
                  {...rest}
                />
              );
            })()}
            <datalist id="lead-cities">
              {CITY_SUGGESTIONS.map((city) => (
                <option key={city} value={city} />
              ))}
            </datalist>
            {errors.city && (
              <p id="lead-city-error" role="alert" className="mt-1 text-xs text-danger-text">
                {errors.city.message}
              </p>
            )}
          </div>

          <div>
            <label
              htmlFor="lead-category"
              className="mb-1 block text-sm font-medium text-foreground"
            >
              איזה שירות מעניין אתכם?
            </label>
            <select
              id="lead-category"
              enterKeyHint="done"
              aria-required="true"
              aria-invalid={errors.category ? "true" : "false"}
              aria-describedby={
                errors.category ? "lead-category-error" : undefined
              }
              className="interactive w-full rounded-xl border border-border bg-background px-3 py-2.5 text-foreground outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
              {...register("category", { required: "נא לבחור שירות" })}
            >
              <option value="">בחרו שירות…</option>
              {SERVICE_CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {CATEGORY_HE[cat]}
                </option>
              ))}
            </select>
            {errors.category && (
              <p
                id="lead-category-error"
                role="alert"
                className="mt-1 text-xs text-danger-text"
              >
                {errors.category.message}
              </p>
            )}
          </div>

          {/* OPTIONAL callback window. /api/lead has always validated this exact
              four-value set and persisted it to a dedicated leads.callback_time
              column — the form simply never asked, so every lead arrived with a
              null preference. Nothing is pre-selected. Native radios (visually
              hidden) keep arrow-key + label semantics; the ≥44px chip beside each
              is the styled sibling. */}
          <fieldset>
            <legend className="mb-1 block text-sm font-medium text-foreground">
              מתי נוח שנחזור אליכם?{" "}
              <span className="font-normal text-muted">(אופציונלי)</span>
            </legend>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {CALLBACK_TIMES.map((opt) => (
                <label key={opt.value} className="cursor-pointer">
                  <input
                    type="radio"
                    value={opt.value}
                    className="peer sr-only"
                    {...register("callbackTime")}
                  />
                  <span className="interactive flex min-h-11 items-center justify-center rounded-xl border border-border bg-background px-3 text-sm font-medium text-foreground peer-checked:border-accent peer-checked:bg-accent/10 peer-checked:font-semibold peer-checked:text-accent-text peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent [@media(hover:hover)_and_(pointer:fine)]:hover:border-accent/40">
                    {opt.label}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          {/* §11 disclosure (Amendment-13 / Privacy Law §11): collected before the
              consent box so the user knows, before consenting, that providing data
              is voluntary, the consequence of not providing it, the purposes, that
              the inquiry reaches providers only AFTER consent, and how to exercise
              their access/correction/deletion rights. */}
          <div className="rounded-xl border border-border/60 bg-background/60 p-3 text-xs leading-relaxed text-muted">
            <p>
              מסירת הפרטים נעשית מרצונכם ואינכם חייבים למוסרם — אך ללא מסירתם לא
              נוכל לחזור אליכם עם השוואה והצעה. הפרטים משמשים ליצירת קשר חוזר
              ולהתאמת הצעה, והפנייה מועברת לספק/ים רלוונטי/ים אך ורק לאחר אישורכם
              להלן.
            </p>
            <p className="mt-2">
              תוכלו לעיין בפרטים, לתקנם, למוחקם או לחזור בכם מהסכמתכם בכל עת דרך{" "}
              <Link
                href="/rights"
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent-text underline hover:text-accent-hover"
              >
                עמוד מימוש הזכויות
              </Link>
              .
            </p>
          </div>

          {/* Mandatory consent — unchecked by default. The links are NOT wrapped
              in the <label> (a click on a link inside a label would also toggle
              the box); instead the checkbox is associated via id/htmlFor, and the
              text+links sit beside it so the links navigate without toggling.
              TAP TARGET: the row is a bordered ≥44px block and the box itself is
              24px, because the tappable consent area used to be a 20px box plus a
              ~70×18px text fragment with two target="_blank" links immediately
              beside it — a thumb miss opened a new tab mid-form. Target size only:
              the id/htmlFor association and the links-outside-label structure are
              deliberately unchanged. */}
          <div>
            <div className="flex min-h-11 items-start gap-2.5 rounded-xl border border-border/60 p-3 text-sm text-foreground">
              <input
                id="lead-consent"
                type="checkbox"
                aria-required="true"
                aria-invalid={errors.consent ? "true" : "false"}
                aria-describedby={
                  errors.consent ? "lead-consent-error" : undefined
                }
                className="mt-0.5 h-6 w-6 shrink-0 rounded border-border text-accent accent-accent focus:ring-2 focus:ring-accent/30"
                {...register("consent", {
                  required:
                    "יש לאשר את תנאי השימוש והסכמה ליצירת קשר כדי להמשיך",
                })}
              />
              <span className="leading-snug">
                <label htmlFor="lead-consent" className="cursor-pointer">
                  אני מאשר/ת את
                </label>{" "}
                <Link
                  href="/terms"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-accent-text underline hover:text-accent-hover"
                >
                  תנאי השימוש
                </Link>{" "}
                ו
                <Link
                  href="/privacy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-accent-text underline hover:text-accent-hover"
                >
                  מדיניות הפרטיות
                </Link>
                <label htmlFor="lead-consent" className="cursor-pointer">
                  {" "}
                  ומסכים/ה ליצירת קשר בנוגע להצעות תקשורת.
                </label>
              </span>
            </div>
            {errors.consent && (
              <p
                id="lead-consent-error"
                role="alert"
                className="mt-1 text-xs text-danger-text"
              >
                {errors.consent.message}
              </p>
            )}
          </div>

          {/* OPTIONAL marketing opt-ins (Spam Law — חוק התקשורת תיקון 40).
              Three default-UNCHECKED, per-channel opt-ins, clearly SEPARATE from
              the mandatory consent gate above. Each is marked as marketing
              (פרסומת) and removable at any time.
              Collapsed behind a native (no-JS) <details>: it is optional by law
              AND by design, and open it added ~200px between the consent box and
              the submit — the moment of decision must not sit below the fold.
              Collapsed ≠ hidden: the heading names it as marketing, the panel is
              one tap away, and the boxes stay default-unchecked either way.
              The §11 disclosure and the consent box above keep their shipped
              order and position exactly. */}
          <details className="group rounded-xl border border-border/60 bg-background/60">
            <summary className="interactive flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 px-3 text-sm font-medium text-foreground marker:hidden focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
              {MARKETING_OPTIN_HEADING}
              <Icon
                name="chevron"
                size={16}
                aria-hidden="true"
                className="shrink-0 rotate-90 text-muted transition-transform duration-200 ease-[var(--ease-out)] group-open:-rotate-90 motion-reduce:transition-none"
              />
            </summary>
            <fieldset className="border-t border-border/60 p-3">
              <legend className="sr-only">{MARKETING_OPTIN_HEADING}</legend>
              <p className="text-xs leading-relaxed text-muted">
                {MARKETING_OPTIN_NOTE}
              </p>
              <div className="mt-3 space-y-2.5">
                {MARKETING_CHANNELS.map((ch) => {
                  const fieldName = (
                    ch.key === "sms"
                      ? "marketingSms"
                      : ch.key === "email"
                        ? "marketingEmail"
                        : "marketingWhatsapp"
                  ) as
                    | "marketingSms"
                    | "marketingEmail"
                    | "marketingWhatsapp";
                  const id = `lead-marketing-${ch.key}`;
                  return (
                    <div
                      key={ch.key}
                      className="flex min-h-11 items-start gap-2.5 text-sm text-foreground"
                    >
                      <input
                        id={id}
                        type="checkbox"
                        className="mt-0.5 h-6 w-6 shrink-0 rounded border-border text-accent accent-accent focus:ring-2 focus:ring-accent/30"
                        {...register(fieldName)}
                      />
                      <label htmlFor={id} className="cursor-pointer leading-snug">
                        {marketingChannelLabel(ch.label)}
                      </label>
                    </div>
                  );
                })}
              </div>
            </fieldset>
          </details>
        </div>
      )}

      {/* Server error */}
      {serverError && (
        <p role="alert" className="mt-4 text-sm text-danger-text">
          {serverError}
        </p>
      )}

      {/* RECEIPT — what the host page is attaching to this request. `contextNote`
          is folded into the POST's `notes` beside the visitor's NAME, PHONE and
          CITY, so it stops being an anonymous summary the moment they submit:
          nothing about a person's own data may travel invisibly, and the place
          to show it is the screen where they decide to send it.
          It also SELLS: knowing the rep already has the bill/quiz/wallet figures
          is exactly what makes the call cheap to accept.
          A receipt, not an alarm — the same quiet surface + hairline border the
          neighbouring disclosure blocks use, never a warning banner. */}
      {step === lastStep && outgoingNotes && (
        <div className="mt-4 rounded-xl border border-border/60 bg-background/60 p-3">
          <p className="text-xs font-semibold text-foreground">
            מה שיישלח עם הפנייה:
          </p>
          <p className="mt-1 text-xs leading-relaxed text-muted">
            {outgoingNotes}
          </p>
        </div>
      )}

      {/* "What happens after you submit" — set expectations honestly, shown on
          the final step right above the submit CTA. No fake urgency. */}
      {step === lastStep && (
        <div className="mt-4 rounded-xl border border-border/60 bg-background/60 p-3">
          <p className="text-xs font-semibold text-foreground">
            מה קורה אחרי השליחה?
          </p>
          <ol className="mt-2 space-y-1.5 text-xs text-muted">
            <li className="flex items-start gap-2">
              <span
                aria-hidden="true"
                className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-accent/15 text-[10px] font-bold text-accent-text"
              >
                1
              </span>
              {/* Reflects the window the user just picked, if they picked one —
                  otherwise the honest default SLA. Never an invented time, and
                  never a time that has already passed today (the same
                  clock-checked promise the confirmation will repeat). */}
              <span>
                {chosenCallback
                  ? chosenCallback.shifted
                    ? `נציג חוזר אליכם ${chosenCallback.text} — החלון שביקשתם כבר חלף היום.`
                    : `נציג חוזר אליכם ${chosenCallback.text} — החלון שביקשתם.`
                  : "נציג חוזר אליכם, בדרך כלל תוך יום עסקים אחד."}
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span
                aria-hidden="true"
                className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-accent/15 text-[10px] font-bold text-accent-text"
              >
                2
              </span>
              <span>מקבלים השוואת הצעות מותאמת לצרכים שלכם.</span>
            </li>
            <li className="flex items-start gap-2">
              <span
                aria-hidden="true"
                className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-accent/15 text-[10px] font-bold text-accent-text"
              >
                3
              </span>
              <span>מחליטים בנחת — ללא עלות וללא התחייבות.</span>
            </li>
          </ol>
        </div>
      )}

      {/* Objection handling, directly above the submit — the same position and
          the same four VERIFIED lines the desktop build uses on every form (both
          read them from lib/legal so the promise cannot drift). These answer the
          two objections that actually stop people at this exact moment: why is
          this free, and who gets my number. Set as spaced micro-labels so the
          block scans in under a second (Hebrew is unicase — the letter-spacing,
          not `uppercase`, does the work). */}
      {step === lastStep && (
        <ul
          aria-label={CTA_OBJECTIONS_LABEL}
          className="mt-3 grid gap-2 rounded-xl border border-border/60 bg-background/60 p-3 sm:grid-cols-2"
        >
          {CTA_OBJECTIONS.map((objection) => (
            <li
              key={objection.text}
              className="flex items-start gap-2 text-[11px] font-medium leading-snug tracking-[0.03em] text-muted"
            >
              <Icon
                name={objection.icon}
                size={14}
                aria-hidden="true"
                className="mt-px shrink-0 text-accent-text"
              />
              <span>{objection.text}</span>
            </li>
          ))}
        </ul>
      )}

      {/* Navigation. All three controls are ≥48px: the most important button on
          the site sat at 40px next to an equally-sized "back". `basis-1/3` keeps
          back subordinate so the primary action stays visually dominant. */}
      <div className="mt-6 flex items-center gap-3">
        {step > 0 && (
          <button
            type="button"
            onClick={back}
            disabled={isSubmitting}
            className="interactive press inline-flex min-h-12 basis-1/3 items-center justify-center rounded-xl border border-border px-4 text-sm font-medium text-foreground ease-[var(--ease-out)] [@media(hover:hover)_and_(pointer:fine)]:hover:border-border-strong/30 [@media(hover:hover)_and_(pointer:fine)]:hover:bg-border/60 disabled:opacity-50"
          >
            חזרה
          </button>
        )}

        {step < lastStep ? (
          <button
            type="button"
            onClick={next}
            className="interactive press inline-flex min-h-12 flex-1 items-center justify-center rounded-xl bg-accent px-4 text-sm font-semibold text-accent-contrast shadow-soft ease-[var(--ease-out)] [@media(hover:hover)_and_(pointer:fine)]:hover:bg-accent-hover [@media(hover:hover)_and_(pointer:fine)]:hover:shadow-card [@media(hover:hover)_and_(pointer:fine)]:motion-safe:hover:-translate-y-0.5"
          >
            המשך
          </button>
        ) : (
          // NOT disabled on a missing consent tick — see the file header. It stays
          // clickable so the click runs validation (which surfaces the consent
          // error and focuses the box); `data-blocked` carries the muted styling
          // the `disabled:` variants used to, and aria-disabled still tells AT the
          // action won't go through yet. `disabled` remains ONLY for in-flight
          // submits, where a second tap would double-post.
          <button
            type="submit"
            disabled={isSubmitting}
            aria-disabled={isSubmitting || !consentChecked}
            data-blocked={consentChecked ? undefined : "true"}
            className="interactive press inline-flex min-h-12 flex-1 items-center justify-center rounded-xl bg-accent px-4 text-sm font-semibold text-accent-contrast shadow-soft ease-[var(--ease-out)] [@media(hover:hover)_and_(pointer:fine)]:hover:bg-accent-hover [@media(hover:hover)_and_(pointer:fine)]:hover:shadow-card [@media(hover:hover)_and_(pointer:fine)]:motion-safe:hover:-translate-y-0.5 data-[blocked=true]:translate-y-0 data-[blocked=true]:opacity-50 data-[blocked=true]:shadow-none disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
          >
            {isSubmitting ? "שולח…" : "קבלת הצעה חינם"}
          </button>
        )}
      </div>

      {/* The lighter channel, for anyone who finds a consent-gated form too
          heavy. A quiet text link — never a second filled button beside the
          submit. */}
      {step === lastStep && (
        <p className="mt-3 flex items-center justify-center gap-1.5 text-xs text-muted">
          מעדיפים בלי טופס?
          <a
            href={WHATSAPP_LEAD_HREF}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => trackWhatsapp("lead_form")}
            className="interactive inline-flex min-h-11 items-center gap-1 text-accent-text underline underline-offset-2 [@media(hover:hover)_and_(pointer:fine)]:hover:text-accent-hover"
          >
            <Icon name="chat" size={14} aria-hidden="true" />
            דברו איתנו בוואטסאפ
          </a>
        </p>
      )}

      <p
        className={[
          // Tighter on the last step, where the WhatsApp line above already
          // carries the gap.
          step === lastStep ? "mt-1" : "mt-3",
          "text-center text-xs text-muted",
        ].join(" ")}
      >
        השירות חינמי. הפרטים משמשים אך ורק ליצירת קשר בנוגע לפנייה זו — ללא ספאם.
      </p>
    </form>
  );
}
