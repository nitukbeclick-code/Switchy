"use client";

// ────────────────────────────────────────────────────────────────────────────
// <RightsForm> — data-subject-rights REQUEST INTAKE form.
//
// Collects: request type (access / correction / deletion / withdraw-marketing),
// name, contact (email and/or phone), and free-text details. POSTs to /api/rights
// (server inserts into public.data_subject_requests with the service-role key; the
// browser never sees it).
//
// HONESTY / SECURITY: this is an INTAKE, never a data export — it does not show or
// return anyone's personal data. A mandatory, unchecked-by-default consent box
// gates submission (the user confirms it's a request the team will verify + act
// on). Phone validation reuses lib/phone (parity with the server). RTL Hebrew,
// design-system tokens.
// ────────────────────────────────────────────────────────────────────────────

import { useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { isValidIsraeliPhone } from "@/lib/phone";

/** Request kinds — value MUST match data_subject_requests.kind + /api/rights. */
const KINDS = [
  { value: "access", label: "עיון במידע שנאסף עליי" },
  { value: "correction", label: "תיקון מידע" },
  { value: "deletion", label: "מחיקת המידע שלי" },
  { value: "withdraw", label: "הסרה מרשימת דיוור / חזרה מהסכמה" },
] as const;

type Kind = (typeof KINDS)[number]["value"];

interface RightsFormValues {
  kind: Kind | "";
  name: string;
  email: string;
  phone: string;
  details: string;
  consent: boolean;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function RightsForm() {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RightsFormValues>({
    mode: "onTouched",
    defaultValues: {
      kind: "",
      name: "",
      email: "",
      phone: "",
      details: "",
      consent: false,
    },
  });

  const [done, setDone] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  async function onSubmit(values: RightsFormValues) {
    setServerError(null);
    try {
      const res = await fetch("/api/rights", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: values.kind || undefined,
          name: values.name.trim(),
          email: values.email.trim() || undefined,
          phone: values.phone.trim() || undefined,
          details: values.details.trim() || undefined,
          consent: values.consent,
        }),
      });

      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        setServerError(
          body?.error ??
            "אירעה שגיאה בשליחת הבקשה. נסו שוב בעוד רגע או פנו אלינו במייל.",
        );
        return;
      }

      setDone(true);
    } catch {
      setServerError("החיבור נכשל. בדקו את הרשת ונסו שוב — הבקשה לא נשלחה.");
    }
  }

  if (done) {
    return (
      <div
        className="rounded-2xl border border-border bg-surface p-6 text-center"
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
          הבקשה התקבלה, תודה!
        </h3>
        <p className="mt-1 text-sm text-muted">
          נטפל בבקשתכם בהתאם לחוק הגנת הפרטיות ובתוך פרק הזמן הקבוע בדין. ייתכן
          שניצור עמכם קשר כדי לאמת את זהותכם לפני ביצוע הבקשה — זאת כדי להגן על
          המידע שלכם.
        </p>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      noValidate
      aria-labelledby="rights-form-heading"
      className="rounded-2xl border border-border bg-surface p-5 sm:p-6"
    >
      <h2
        id="rights-form-heading"
        className="font-display text-lg font-bold text-ink"
      >
        הגשת בקשה
      </h2>
      <p className="mt-2 text-xs leading-relaxed text-muted">
        זהו טופס להגשת בקשה בלבד — הוא אינו מציג מידע אישי. לאחר קבלת הבקשה ייתכן
        שנפנה אליכם לאימות זהות, כדי להבטיח שרק אתם מקבלים גישה למידע שלכם.
      </p>

      <div className="mt-5 space-y-4">
        {/* Request type */}
        <div>
          <label
            htmlFor="rights-kind"
            className="mb-1 block text-sm font-medium text-foreground"
          >
            סוג הבקשה
          </label>
          <select
            id="rights-kind"
            aria-required="true"
            aria-invalid={errors.kind ? "true" : "false"}
            aria-describedby={errors.kind ? "rights-kind-error" : undefined}
            className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-foreground outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
            {...register("kind", { required: "נא לבחור סוג בקשה" })}
          >
            <option value="">בחרו סוג בקשה…</option>
            {KINDS.map((k) => (
              <option key={k.value} value={k.value}>
                {k.label}
              </option>
            ))}
          </select>
          {errors.kind && (
            <p
              id="rights-kind-error"
              role="alert"
              className="mt-1 text-xs text-danger-text"
            >
              {errors.kind.message}
            </p>
          )}
        </div>

        {/* Name */}
        <div>
          <label
            htmlFor="rights-name"
            className="mb-1 block text-sm font-medium text-foreground"
          >
            שם מלא
          </label>
          <input
            id="rights-name"
            type="text"
            autoComplete="name"
            aria-required="true"
            aria-invalid={errors.name ? "true" : "false"}
            aria-describedby={errors.name ? "rights-name-error" : undefined}
            className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-foreground outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
            {...register("name", {
              required: "נא להזין שם",
              minLength: { value: 2, message: "השם קצר מדי" },
            })}
          />
          {errors.name && (
            <p
              id="rights-name-error"
              role="alert"
              className="mt-1 text-xs text-danger-text"
            >
              {errors.name.message}
            </p>
          )}
        </div>

        {/* Email */}
        <div>
          <label
            htmlFor="rights-email"
            className="mb-1 block text-sm font-medium text-foreground"
          >
            אימייל ליצירת קשר
          </label>
          <input
            id="rights-email"
            type="email"
            inputMode="email"
            autoComplete="email"
            dir="ltr"
            aria-invalid={errors.email ? "true" : "false"}
            aria-describedby={errors.email ? "rights-email-error" : undefined}
            className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-right text-foreground outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
            {...register("email", {
              validate: (v) =>
                !v || EMAIL_RE.test(v) || "כתובת האימייל אינה תקינה",
            })}
          />
          {errors.email && (
            <p
              id="rights-email-error"
              role="alert"
              className="mt-1 text-xs text-danger-text"
            >
              {errors.email.message}
            </p>
          )}
        </div>

        {/* Phone */}
        <div>
          <label
            htmlFor="rights-phone"
            className="mb-1 block text-sm font-medium text-foreground"
          >
            טלפון ליצירת קשר
          </label>
          <input
            id="rights-phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            dir="ltr"
            aria-invalid={errors.phone ? "true" : "false"}
            aria-describedby={
              errors.phone ? "rights-phone-error" : "rights-contact-hint"
            }
            className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-right text-foreground outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
            {...register("phone", {
              validate: (v) =>
                !v || isValidIsraeliPhone(v) || "מספר הטלפון אינו תקין",
            })}
          />
          {errors.phone ? (
            <p
              id="rights-phone-error"
              role="alert"
              className="mt-1 text-xs text-danger-text"
            >
              {errors.phone.message}
            </p>
          ) : (
            <p id="rights-contact-hint" className="mt-1 text-xs text-muted">
              יש להשאיר אימייל או טלפון (לפחות אחד מהם) כדי שנוכל לחזור אליכם.
            </p>
          )}
        </div>

        {/* Details */}
        <div>
          <label
            htmlFor="rights-details"
            className="mb-1 block text-sm font-medium text-foreground"
          >
            פרטי הבקשה (לא חובה)
          </label>
          <textarea
            id="rights-details"
            rows={4}
            className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-foreground outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
            placeholder="לדוגמה: אילו פרטים תרצו לתקן/למחוק, או כל מידע שיעזור לנו לטפל בבקשה."
            {...register("details", {
              maxLength: { value: 2000, message: "הטקסט ארוך מדי" },
            })}
          />
          {errors.details && (
            <p role="alert" className="mt-1 text-xs text-danger-text">
              {errors.details.message}
            </p>
          )}
        </div>

        {/* Mandatory consent — unchecked by default. */}
        <div>
          <div className="flex items-start gap-2.5 text-sm text-foreground">
            <input
              id="rights-consent"
              type="checkbox"
              aria-required="true"
              aria-invalid={errors.consent ? "true" : "false"}
              aria-describedby={
                errors.consent ? "rights-consent-error" : undefined
              }
              className="mt-0.5 h-4 w-4 shrink-0 rounded border-border text-accent accent-accent focus:ring-2 focus:ring-accent/30"
              {...register("consent", {
                required: "יש לאשר את הטיפול בבקשה כדי להמשיך",
              })}
            />
            <label htmlFor="rights-consent" className="cursor-pointer leading-snug">
              אני מאשר/ת שהפרטים שמסרתי ישמשו לטיפול בבקשה זו ולאימות זהותי, בהתאם
              ל
              <Link
                href="/privacy"
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent-text underline hover:text-accent-hover"
              >
                מדיניות הפרטיות
              </Link>
              .
            </label>
          </div>
          {errors.consent && (
            <p
              id="rights-consent-error"
              role="alert"
              className="mt-1 text-xs text-danger-text"
            >
              {errors.consent.message}
            </p>
          )}
        </div>
      </div>

      {serverError && (
        <p role="alert" className="mt-4 text-sm text-danger-text">
          {serverError}
        </p>
      )}

      <button
        type="submit"
        disabled={isSubmitting}
        aria-disabled={isSubmitting}
        className="mt-6 w-full rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-accent-contrast transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isSubmitting ? "שולח…" : "שליחת הבקשה"}
      </button>

      <p className="mt-3 text-center text-xs text-muted">
        אם תעדיפו, ניתן גם לפנות אלינו ישירות בכתובת{" "}
        <a
          href={`mailto:hello@switchy-ai.com?subject=${encodeURIComponent(
            "בקשת מימוש זכויות",
          )}`}
          className="text-accent-text underline hover:text-accent-hover"
        >
          hello@switchy-ai.com
        </a>
        .
      </p>
    </form>
  );
}
