"use client";

// ────────────────────────────────────────────────────────────────────────────
// <LeadForm> — multi-step lead capture (Name → Phone → City → Desired service).
// Built on react-hook-form. POSTs to /api/lead (server inserts into Supabase with
// the service-role key; the browser never sees it) and fires fireLeadConversion()
// ONLY on a confirmed success.
//
// HONESTY / LEGAL: a MANDATORY, unchecked-by-default consent checkbox gates
// submission. The server stamps consent timestamps + IP and enforces rate limits;
// this form enforces the checkbox client-side so a lead is never sent without it.
// ────────────────────────────────────────────────────────────────────────────

import { useRef, useState } from "react";
import Link from "next/link";
import { useForm, useWatch } from "react-hook-form";
import { CATEGORY_HE } from "@/lib/categories";
import { fireLeadConversion, trackEvent } from "@/lib/tracking";
import { isValidIsraeliPhone } from "@/lib/phone";

/** Categories offered in the "desired service" step (in display order). */
const SERVICE_CATEGORIES = [
  "cellular",
  "internet",
  "tv",
  "triple",
  "abroad",
] as const;

type ServiceCategory = (typeof SERVICE_CATEGORIES)[number];

/** The shape react-hook-form manages. Mirrors the /api/lead client contract. */
interface LeadFormValues {
  name: string;
  phone: string;
  city: string;
  category: ServiceCategory | "";
  consent: boolean;
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
}

const STEP_FIELDS: (keyof LeadFormValues)[][] = [
  ["name"],
  ["phone"],
  ["city"],
  ["category", "consent"],
];

const STEP_TITLES = ["השם שלך", "טלפון ליצירת קשר", "עיר מגורים", "מה מחפשים?"];

export default function LeadForm({
  source,
  defaultCategory,
  defaultCity,
  heading = "קבלת הצעה — השוואה חינמית",
  className,
  trustStats,
}: LeadFormProps) {
  const {
    register,
    handleSubmit,
    trigger,
    control,
    formState: { errors, isSubmitting },
  } = useForm<LeadFormValues>({
    mode: "onTouched",
    defaultValues: {
      name: "",
      phone: "",
      city: defaultCity ?? "",
      category: defaultCategory ?? "",
      consent: false,
    },
  });

  const [step, setStep] = useState(0);
  const [done, setDone] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  // Fire "lead_form_start" at most once per mount, on the first successful
  // advance — the denominator for the form's micro-funnel / drop-off analysis.
  const startedRef = useRef(false);

  // Subscribe to the consent field so the submit button reflects its state.
  const consentChecked = useWatch({ control, name: "consent" });

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
    setStep((s) => Math.min(s + 1, lastStep));
  }

  function back() {
    setServerError(null);
    setStep((s) => Math.max(s - 1, 0));
  }

  async function onSubmit(values: LeadFormValues) {
    setServerError(null);
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
          // Mandatory consent — the server re-stamps the timestamps itself.
          consent: values.consent,
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
      setDone(true);
    } catch {
      trackEvent("lead_form_error", { source, reason: "network" });
      setServerError(
        "החיבור נכשל. בדקו את הרשת ונסו שוב — הפרטים לא נשלחו.",
      );
    }
  }

  if (done) {
    return (
      <div
        className={[
          "rounded-2xl border border-border bg-surface p-6 text-center",
          className ?? "",
        ]
          .join(" ")
          .trim()}
        role="status"
        aria-live="polite"
      >
        <div
          aria-hidden="true"
          className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-accent/15 text-2xl text-accent"
        >
          ✓
        </div>
        <h3 className="font-display text-lg font-bold text-ink">
          הפרטים התקבלו, תודה!
        </h3>
        <p className="mt-1 text-sm text-muted">
          נציג יחזור אליכם בדרך כלל תוך יום עסקים אחד עם השוואת הצעות מותאמת.
          השירות חינמי וללא התחייבות — תוכלו להחליט בנחת.
        </p>
        <p className="mt-2 text-xs text-muted">
          לא מצאתם את ההודעה? נחזור אליכם בטלפון שהשארתם.
        </p>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      noValidate
      aria-labelledby="lead-form-heading"
      className={[
        "rounded-2xl border border-border bg-surface p-5 sm:p-6",
        className ?? "",
      ]
        .join(" ")
        .trim()}
    >
      <h3
        id="lead-form-heading"
        className="font-display text-lg font-bold text-ink"
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

      {/* Progress */}
      <div className="mt-3 mb-5">
        <div className="mb-1 flex items-center justify-between text-xs text-muted">
          <span>
            שלב {step + 1} מתוך {STEP_FIELDS.length}: {STEP_TITLES[step]}
          </span>
          <span>{progress}%</span>
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
            className="h-full rounded-full bg-accent transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Step 0 — Name */}
      {step === 0 && (
        <div>
          <label
            htmlFor="lead-name"
            className="mb-1 block text-sm font-medium text-foreground"
          >
            שם מלא
          </label>
          <input
            id="lead-name"
            type="text"
            autoComplete="name"
            aria-required="true"
            aria-invalid={errors.name ? "true" : "false"}
            aria-describedby={errors.name ? "lead-name-error" : undefined}
            className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-foreground outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
            {...register("name", {
              required: "נא להזין שם",
              minLength: { value: 2, message: "השם קצר מדי" },
            })}
          />
          {errors.name && (
            <p id="lead-name-error" role="alert" className="mt-1 text-xs text-danger-text">
              {errors.name.message}
            </p>
          )}
        </div>
      )}

      {/* Step 1 — Phone */}
      {step === 1 && (
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
            dir="ltr"
            aria-required="true"
            aria-invalid={errors.phone ? "true" : "false"}
            aria-describedby={errors.phone ? "lead-phone-error" : undefined}
            className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-right text-foreground outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
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
      )}

      {/* Step 2 — City */}
      {step === 2 && (
        <div>
          <label
            htmlFor="lead-city"
            className="mb-1 block text-sm font-medium text-foreground"
          >
            עיר מגורים
          </label>
          <input
            id="lead-city"
            type="text"
            autoComplete="address-level2"
            aria-required="true"
            aria-invalid={errors.city ? "true" : "false"}
            aria-describedby={errors.city ? "lead-city-error" : undefined}
            className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-foreground outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
            {...register("city", {
              required: "נא להזין עיר מגורים",
              minLength: { value: 2, message: "שם העיר קצר מדי" },
            })}
          />
          {errors.city && (
            <p id="lead-city-error" role="alert" className="mt-1 text-xs text-danger-text">
              {errors.city.message}
            </p>
          )}
        </div>
      )}

      {/* Step 3 — Desired service + mandatory consent */}
      {step === 3 && (
        <div className="space-y-4">
          <div>
            <label
              htmlFor="lead-category"
              className="mb-1 block text-sm font-medium text-foreground"
            >
              איזה שירות מעניין אתכם?
            </label>
            <select
              id="lead-category"
              aria-required="true"
              aria-invalid={errors.category ? "true" : "false"}
              aria-describedby={
                errors.category ? "lead-category-error" : undefined
              }
              className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-foreground outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
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

          {/* Mandatory consent — unchecked by default. The links are NOT wrapped
              in the <label> (a click on a link inside a label would also toggle
              the box); instead the checkbox is associated via id/htmlFor, and the
              text+links sit beside it so the links navigate without toggling. */}
          <div>
            <div className="flex items-start gap-2.5 text-sm text-foreground">
              <input
                id="lead-consent"
                type="checkbox"
                aria-required="true"
                aria-invalid={errors.consent ? "true" : "false"}
                aria-describedby={
                  errors.consent ? "lead-consent-error" : undefined
                }
                className="mt-0.5 h-4 w-4 shrink-0 rounded border-border text-accent accent-accent focus:ring-2 focus:ring-accent/30"
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
        </div>
      )}

      {/* Server error */}
      {serverError && (
        <p role="alert" className="mt-4 text-sm text-danger-text">
          {serverError}
        </p>
      )}

      {/* "What happens after you submit" — set expectations honestly, shown on
          the final step right above the submit CTA. No fake urgency. */}
      {step === lastStep && (
        <div className="mt-5 rounded-xl border border-border bg-background/60 p-4">
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
              <span>נציג חוזר אליכם, בדרך כלל תוך יום עסקים אחד.</span>
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

      {/* Navigation */}
      <div className="mt-6 flex items-center gap-3">
        {step > 0 && (
          <button
            type="button"
            onClick={back}
            disabled={isSubmitting}
            className="rounded-xl border border-border px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-border/60 disabled:opacity-50"
          >
            חזרה
          </button>
        )}

        {step < lastStep ? (
          <button
            type="button"
            onClick={next}
            className="flex-1 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-accent-contrast transition-colors hover:bg-accent-hover"
          >
            המשך
          </button>
        ) : (
          <button
            type="submit"
            disabled={isSubmitting || !consentChecked}
            aria-disabled={isSubmitting || !consentChecked}
            className="flex-1 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-accent-contrast transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSubmitting ? "שולח…" : "קבלת הצעה חינם"}
          </button>
        )}
      </div>

      <p className="mt-3 text-center text-xs text-muted">
        השירות חינמי. הפרטים משמשים אך ורק ליצירת קשר בנוגע לפנייה זו — ללא ספאם.
      </p>
    </form>
  );
}
