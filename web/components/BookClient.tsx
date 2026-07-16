"use client";

// ────────────────────────────────────────────────────────────────────────────
// <BookClient> — the email-verified, self-serve Zoom consultation booking card.
//
// A clean 4-step flow for an ANONYMOUS visitor (no account):
//   1) details   — name, phone (IL), email, category, day + time, MANDATORY consent.
//   2) request   — "שלח קוד אימות למייל" → POST {action:"request-code"} → code step,
//      but ONLY when the email actually went out: an explicit {sent:false} keeps
//      the user in place with an honest retry + WhatsApp fallback (a missing
//      `sent` — the older deployed fn — is treated as sent, so nobody strands).
//   3) verify    — 6-digit code → POST {action:"verify-code"} → on ok, confirm step.
//   4) confirm   — "קבע פגישה" → POST {action:"book"} → success state.
//
// BACKEND: calls the Supabase edge function `meeting-book` DIRECTLY from the
// browser (verify_jwt:false), mirroring how the site reaches edge functions —
// the function URL `${NEXT_PUBLIC_SUPABASE_URL}/functions/v1/meeting-book` with
// the public anon key in the `apikey` + `Authorization: Bearer` headers. The
// function is the authority on rate limits, the email gate and the schedule; this
// UI fails soft with friendly Hebrew errors and surfaces the server's `error`.
//
// HONESTY / LEGAL (mirrors <LeadForm>): a MANDATORY, default-OFF consent checkbox
// gates the whole flow (the §11 voluntary-disclosure note + terms/privacy links),
// and the day/time picker only ever offers slots the server would accept
// (availableSlots mirrors meetings_guard). No fabricated numbers anywhere.
//
// UX: RTL Hebrew, dark-mode + premium-2026 tokens, AA a11y (every input has a
// <label>, errors are role="alert" + aria-describedby, the step heading is
// announced), keyboard-friendly, Emil entrance/press feedback, disabled+pending
// states on every async button, and a short resend cooldown on the code step.
// ────────────────────────────────────────────────────────────────────────────

import { useEffect, useId, useMemo, useRef, useState } from "react";
import Link from "next/link";
import CommissionDisclosure from "@/components/CommissionDisclosure";
import { isValidIsraeliPhone } from "@/lib/phone";
import { CATEGORY_HE } from "@/lib/categories";
import { availableSlots } from "@/lib/slots";
import { MEETING_PROVIDERS } from "@/lib/meeting-providers";
import { CONTACT_WHATSAPP_INTL } from "@/lib/legal";

// The categories the booking form offers (same set + order as <LeadForm>).
const SERVICE_CATEGORIES = [
  "cellular",
  "internet",
  "tv",
  "triple",
  "abroad",
] as const;
type ServiceCategory = (typeof SERVICE_CATEGORIES)[number];

// Public Supabase project URL (safe to expose) + anon key — RLS-gated, public.
// Falls back to the known project ref so a missing env never breaks the build
// (mirrors lib/live-catalogue.ts). The edge fn is deployed --no-verify-jwt, so a
// missing anon key still works; we send it when present for parity with the
// site's other edge-function calls.
const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ??
  "https://orzitfqmlvopujsoyigr.supabase.co";
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const MEETING_BOOK_URL = `${SUPABASE_URL.replace(/\/$/, "")}/functions/v1/meeting-book`;

/** The generic, friendly fallback when a call fails-soft (network/parse). */
const GENERIC_ERROR = "אירעה שגיאה. נסו שוב בעוד רגע או דברו איתנו בוואטסאפ.";
const NETWORK_ERROR = "החיבור נכשל. בדקו את הרשת ונסו שוב.";

/**
 * Honest send-failure copy: the server accepted the request ({ok:true}) but
 * reported the email SEND itself failed (sent:false — Resend down / sender
 * domain issue). Mirrors the Flutter app (meeting_widget._sendCode): never
 * advance the user to wait for a code that will never arrive — offer a retry
 * and the WhatsApp path where a live agent can book them directly.
 */
const EMAIL_SEND_FAILED_ERROR =
  "לא הצלחנו לשלוח מייל כרגע — אפשר לנסות שוב בעוד רגע, או לקבוע דרך וואטסאפ";
const WHATSAPP_BOOK_HREF = `https://wa.me/${CONTACT_WHATSAPP_INTL}?text=${encodeURIComponent(
  "היי, ניסיתי לקבוע שיחת ייעוץ בזום באתר וקוד האימות למייל לא נשלח — אשמח לקבוע דרככם",
)}`;

/** Seconds to disable the resend button after a code request. */
const RESEND_COOLDOWN_SEC = 30;

type Step = "details" | "verify" | "confirm" | "done";

interface BookResponse {
  ok?: boolean;
  /**
   * request-code only: whether the verification email actually went out. The
   * current server always returns it; the previously-deployed version omits it
   * entirely, so a MISSING sent must be treated as true (back-compat) while an
   * explicit sent:false is honoured as a real send failure.
   */
  sent?: boolean;
  error?: string;
}

/** POST a JSON action to the meeting-book edge fn with the anon-key headers. */
async function callMeetingBook(
  body: Record<string, unknown>,
): Promise<BookResponse | null> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  // Mirror the site's edge-function calls: send the public anon key as both the
  // `apikey` and the Bearer token when configured.
  if (ANON_KEY) {
    headers.apikey = ANON_KEY;
    headers.Authorization = `Bearer ${ANON_KEY}`;
  }
  const res = await fetch(MEETING_BOOK_URL, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => null)) as BookResponse | null;
  // Surface the server's error text when present (rate-limited / slot taken /
  // verify-first); otherwise let the caller apply a generic message.
  if (!res.ok && data && typeof data.error === "string") return data;
  return data;
}

interface BookClientProps {
  /**
   * The Zoom-supported providers to offer in the dropdown — read LIVE from
   * public.provider_capabilities by the /book server component (single source of
   * truth). Only these may be booked: the server's meetings_guard /
   * provider_capabilities gate rejects any other provider, so the UI must not
   * offer one. When the prop is omitted/empty (e.g. a unit render with no server
   * fetch) we default to the bundled {@link MEETING_PROVIDERS} const (the 10
   * Zoom-supported providers) so the dropdown is never empty or out of sync.
   */
  supportedProviders?: readonly string[];
}

export default function BookClient({ supportedProviders }: BookClientProps = {}) {
  // The dropdown list: the live server-fetched providers when present, else the
  // resilient const fallback. Both honour the same single source of truth. Typed
  // as readonly string[] so .includes(provider) accepts an arbitrary string.
  const meetingProviders: readonly string[] =
    supportedProviders && supportedProviders.length > 0
      ? supportedProviders
      : MEETING_PROVIDERS;

  // ── Step 1 fields ──────────────────────────────────────────────────────────
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [category, setCategory] = useState<ServiceCategory | "">("");
  const [provider, setProvider] = useState<string>("");
  const [date, setDate] = useState("");
  const [slot, setSlot] = useState("");
  const [consent, setConsent] = useState(false);

  // ── Flow state ───────────────────────────────────────────────────────────
  const [step, setStep] = useState<Step>("details");
  const [code, setCode] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The last request-code/resend came back {ok:true, sent:false} — show the
  // honest fallback (retry + WhatsApp) instead of advancing to the code step.
  const [sendFailed, setSendFailed] = useState(false);
  const [resendIn, setResendIn] = useState(0);

  // The day list is derived once from the real clock (deterministic per mount).
  const days = useMemo(() => availableSlots(new Date()), []);
  const slotsForDay = useMemo(
    () => days.find((d) => d.date === date)?.slots ?? [],
    [days, date],
  );

  const baseId = useId();
  const id = (k: string) => `${baseId}-${k}`;
  const codeInputRef = useRef<HTMLInputElement | null>(null);

  // Resend cooldown ticker (code step).
  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setInterval(() => setResendIn((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [resendIn]);

  // When the chosen day changes, clear a slot that no longer belongs to it.
  useEffect(() => {
    if (slot && !slotsForDay.includes(slot)) setSlot("");
  }, [slotsForDay, slot]);

  // Honesty guard: never keep a chosen provider that isn't in the supported list
  // (e.g. the live list changed). An UNsupported provider must not be bookable.
  useEffect(() => {
    if (provider && !meetingProviders.includes(provider)) setProvider("");
  }, [meetingProviders, provider]);

  // Focus the code input when we enter the verify step.
  useEffect(() => {
    if (step === "verify") {
      const t = setTimeout(() => codeInputRef.current?.focus(), 50);
      return () => clearTimeout(t);
    }
  }, [step]);

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const detailsValid =
    name.trim().length >= 2 &&
    isValidIsraeliPhone(phone) &&
    emailValid &&
    category !== "" &&
    provider !== "" &&
    date !== "" &&
    slot !== "" &&
    consent;

  const selectedDayLabel = days.find((d) => d.date === date)?.label ?? "";

  // ── Step 2: request a verification code ────────────────────────────────────
  async function requestCode() {
    setError(null);
    setSendFailed(false);
    // Re-validate the gate client-side so we never POST an unconsented/invalid set.
    if (name.trim().length < 2) return setError("נא להזין שם מלא");
    if (!isValidIsraeliPhone(phone)) return setError("מספר הטלפון אינו תקין");
    if (!emailValid) return setError("כתובת המייל אינה תקינה");
    if (!category) return setError("נא לבחור שירות");
    if (!provider) return setError("נא לבחור את החברה לפגישה");
    if (!date || !slot) return setError("נא לבחור יום ושעה לפגישה");
    if (!consent) return setError("יש לאשר את תנאי השימוש ומדיניות הפרטיות כדי להמשיך");

    setPending(true);
    try {
      // request-code answers {ok:true} whether or not the address exists (so a
      // prober learns nothing) — but it DOES report a real send failure via
      // sent:false. Only advance when the email actually went out; a missing
      // `sent` (the older deployed fn) is treated as sent so users are never
      // stranded during the redeploy.
      const data = await callMeetingBook({
        action: "request-code",
        email: email.trim(),
        name: name.trim(),
      });
      const sent = data?.sent !== false;
      if (!sent) {
        setSendFailed(true);
        return;
      }
      setCode("");
      setResendIn(RESEND_COOLDOWN_SEC);
      setStep("verify");
    } catch {
      setError(NETWORK_ERROR);
    } finally {
      setPending(false);
    }
  }

  // ── Step 3: verify the 6-digit code ────────────────────────────────────────
  async function verifyCode() {
    setError(null);
    setSendFailed(false);
    if (!/^\d{6}$/.test(code.trim())) {
      return setError("יש להזין קוד בן 6 ספרות");
    }
    setPending(true);
    try {
      const data = await callMeetingBook({
        action: "verify-code",
        email: email.trim(),
        code: code.trim(),
      });
      if (data?.ok) {
        setStep("confirm");
        return;
      }
      setError(data?.error ?? "קוד לא תקין או שפג. בקשו קוד חדש ונסו שוב.");
    } catch {
      setError(NETWORK_ERROR);
    } finally {
      setPending(false);
    }
  }

  // Resend a code (respects the UI cooldown).
  async function resendCode() {
    if (resendIn > 0 || pending) return;
    setError(null);
    setSendFailed(false);
    setPending(true);
    try {
      const data = await callMeetingBook({
        action: "request-code",
        email: email.trim(),
        name: name.trim(),
      });
      // Same honesty as requestCode: sent:false means nothing went out, so do
      // NOT restart the cooldown as if it had — leave the retry immediately
      // available and show the WhatsApp fallback.
      const sent = data?.sent !== false;
      if (!sent) {
        setSendFailed(true);
        return;
      }
      setResendIn(RESEND_COOLDOWN_SEC);
    } catch {
      setError(NETWORK_ERROR);
    } finally {
      setPending(false);
    }
  }

  // ── Step 4: book the meeting ───────────────────────────────────────────────
  async function book() {
    setError(null);
    setPending(true);
    try {
      const data = await callMeetingBook({
        action: "book",
        name: name.trim(),
        phone: phone.trim(),
        email: email.trim(),
        meeting_date: date,
        slot,
        category,
        provider,
        consent: true,
      });
      if (data?.ok) {
        setStep("done");
        return;
      }
      // Surface the Hebrew server error (rate-limited / slot taken / verify-first).
      setError(data?.error ?? GENERIC_ERROR);
    } catch {
      setError(NETWORK_ERROR);
    } finally {
      setPending(false);
    }
  }

  // ── Success state ──────────────────────────────────────────────────────────
  if (step === "done") {
    return (
      <div
        className="bento glow-accent p-7 text-center"
        role="status"
        aria-live="polite"
      >
        <div
          aria-hidden="true"
          className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-accent/15 text-2xl text-accent motion-safe:animate-[book-success-pop_360ms_var(--ease-out)_both]"
        >
          ✓
        </div>
        <style>{`@keyframes book-success-pop{from{opacity:0;transform:scale(0.9)}to{opacity:1;transform:scale(1)}}`}</style>
        <h3 className="font-display text-lg font-bold tracking-tight text-ink">
          הבקשה נשלחה!
        </h3>
        <p className="mt-2 text-sm text-muted">
          נציג יאשר ויחזור אליכם עם קישור Zoom למייל{" "}
          <span dir="ltr" className="font-medium text-foreground">
            {email.trim()}
          </span>
          .
        </p>
        <p className="mt-2 text-xs text-muted">
          המועד המבוקש: {selectedDayLabel} בשעה {slot} (30 דק׳, שעון ישראל). אם
          לא נמצא נציג פנוי למועד, ניצור קשר לתיאום חלופי.
        </p>
      </div>
    );
  }

  // The step index for the progress strip (details=0, verify=1, confirm=2).
  const stepIndex = step === "details" ? 0 : step === "verify" ? 1 : 2;
  const STEP_TITLES = ["פרטים ומועד", "אימות מייל", "אישור הפגישה"];
  const progress = Math.round(((stepIndex + 1) / STEP_TITLES.length) * 100);

  // Honest send-failure block (shared by the details + verify steps): the
  // server said the email didn't go out, so instead of a code field the user
  // gets the truth, an immediate retry (the normal buttons stay live) and a
  // WhatsApp deep link to the same business number used site-wide.
  const sendFailedBlock = sendFailed && (
    <div
      role="alert"
      className="rounded-xl border border-border/60 bg-background/60 p-3"
    >
      <p className="text-sm text-danger-text">{EMAIL_SEND_FAILED_ERROR}</p>
      <a
        href={WHATSAPP_BOOK_HREF}
        target="_blank"
        rel="noopener noreferrer"
        className="interactive press mt-2 inline-block rounded-xl border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-border/60"
      >
        לקביעה דרך וואטסאפ
      </a>
    </div>
  );

  return (
    <div className="bento sw-reveal p-6 sm:p-7" aria-labelledby={id("heading")}>
      <h3
        id={id("heading")}
        className="font-display text-lg font-bold tracking-tight text-ink"
      >
        קביעת שיחת ייעוץ בזום
      </h3>
      <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
        <span className="inline-flex items-center gap-1 font-medium text-accent-text">
          <span aria-hidden="true">✓</span> שיחה חינמית · 30 דקות · ללא התחייבות
        </span>
      </p>

      {/* Progress — glanceable "שלב X מתוך Y" + dot strip + accessible bar. */}
      <div className="mt-3 mb-5">
        <div className="mb-1.5 flex items-center justify-between text-xs text-muted">
          <span>
            שלב {stepIndex + 1} מתוך {STEP_TITLES.length}: {STEP_TITLES[stepIndex]}
          </span>
          <span>{progress}%</span>
        </div>
        <div aria-hidden="true" className="mb-1.5 flex items-center gap-1.5">
          {STEP_TITLES.map((_, i) => (
            <span
              key={i}
              className={[
                "h-1.5 flex-1 rounded-full transition-colors duration-300 ease-[var(--ease-out)]",
                i < stepIndex
                  ? "bg-accent/40"
                  : i === stepIndex
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
          aria-label="התקדמות קביעת הפגישה"
        >
          <div
            className="h-full rounded-full bg-accent transition-[width] duration-300 ease-[var(--ease-out)]"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* ── Step 1: details + day/time + consent ──────────────────────────── */}
      {step === "details" && (
        <div className="space-y-4">
          <div>
            <label
              htmlFor={id("name")}
              className="mb-1 block text-sm font-medium text-foreground"
            >
              שם מלא
            </label>
            <input
              id={id("name")}
              type="text"
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="interactive w-full rounded-xl border border-border bg-background px-3 py-2.5 text-foreground outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
            />
          </div>

          <div>
            <label
              htmlFor={id("phone")}
              className="mb-1 block text-sm font-medium text-foreground"
            >
              מספר טלפון
            </label>
            <input
              id={id("phone")}
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              dir="ltr"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="interactive w-full rounded-xl border border-border bg-background px-3 py-2.5 text-right text-foreground outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
            />
          </div>

          <div>
            <label
              htmlFor={id("email")}
              className="mb-1 block text-sm font-medium text-foreground"
            >
              כתובת מייל
            </label>
            <input
              id={id("email")}
              type="email"
              inputMode="email"
              autoComplete="email"
              dir="ltr"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="interactive w-full rounded-xl border border-border bg-background px-3 py-2.5 text-right text-foreground outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
            />
            <p className="mt-1 text-xs text-muted">
              נשלח לכאן קוד אימות, ואת קישור ה-Zoom לאחר אישור הנציג.
            </p>
          </div>

          <div>
            <label
              htmlFor={id("category")}
              className="mb-1 block text-sm font-medium text-foreground"
            >
              על איזה שירות נדבר?
            </label>
            <select
              id={id("category")}
              value={category}
              onChange={(e) => setCategory(e.target.value as ServiceCategory | "")}
              className="interactive w-full rounded-xl border border-border bg-background px-3 py-2.5 text-foreground outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
            >
              <option value="">בחרו שירות…</option>
              {SERVICE_CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {CATEGORY_HE[cat]}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor={id("provider")}
              className="mb-1 block text-sm font-medium text-foreground"
            >
              עם איזו חברה תרצו להיפגש?
            </label>
            <select
              id={id("provider")}
              value={provider}
              onChange={(e) => setProvider(e.target.value)}
              className="interactive w-full rounded-xl border border-border bg-background px-3 py-2.5 text-foreground outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
            >
              <option value="">בחרו חברה…</option>
              {meetingProviders.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label
                htmlFor={id("date")}
                className="mb-1 block text-sm font-medium text-foreground"
              >
                יום הפגישה
              </label>
              <select
                id={id("date")}
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="interactive w-full rounded-xl border border-border bg-background px-3 py-2.5 text-foreground outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
              >
                <option value="">בחרו יום…</option>
                {days.map((d) => (
                  <option key={d.date} value={d.date}>
                    {d.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label
                htmlFor={id("slot")}
                className="mb-1 block text-sm font-medium text-foreground"
              >
                שעת הפגישה
              </label>
              <select
                id={id("slot")}
                value={slot}
                onChange={(e) => setSlot(e.target.value)}
                disabled={!date}
                aria-describedby={!date ? id("slot-hint") : undefined}
                className="interactive w-full rounded-xl border border-border bg-background px-3 py-2.5 text-foreground outline-none focus:border-accent focus:ring-2 focus:ring-accent/30 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <option value="">בחרו שעה…</option>
                {slotsForDay.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
              {!date && (
                <p id={id("slot-hint")} className="mt-1 text-xs text-muted">
                  בחרו קודם יום.
                </p>
              )}
            </div>
          </div>
          <p className="text-xs text-muted">
            כל הפגישות הן 30 דקות לפי שעון ישראל. השעות הזמינות: א׳–ה׳ 09:00–20:30,
            יום שישי 09:00–12:30. בשבת אין פגישות.
          </p>

          {/* §11 voluntary-disclosure note (mirrors <LeadForm>). */}
          <div className="rounded-xl border border-border/60 bg-background/60 p-3 text-xs leading-relaxed text-muted">
            <p>
              מסירת הפרטים נעשית מרצונכם ואינכם חייבים למוסרם — אך ללא מסירתם לא
              נוכל לקבוע את הפגישה ולחזור אליכם. הפרטים משמשים לתיאום שיחת הייעוץ
              וליצירת קשר בנוגע לפנייה זו.
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

          {/* MANDATORY consent — unchecked by default. */}
          <div className="flex items-start gap-2.5 text-sm text-foreground">
            <input
              id={id("consent")}
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              className="mt-0.5 h-5 w-5 shrink-0 rounded border-border text-accent accent-accent focus:ring-2 focus:ring-accent/30"
            />
            <span className="leading-snug">
              <label htmlFor={id("consent")} className="cursor-pointer">
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
              <label htmlFor={id("consent")} className="cursor-pointer">
                {" "}
                ומסכים/ה ליצירת קשר לתיאום שיחת הייעוץ.
              </label>
            </span>
          </div>

          {error && (
            <p role="alert" className="text-sm text-danger-text">
              {error}
            </p>
          )}

          {sendFailedBlock}

          <button
            type="button"
            onClick={requestCode}
            disabled={pending || !detailsValid}
            aria-disabled={pending || !detailsValid}
            className="interactive press w-full rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-accent-contrast shadow-soft ease-[var(--ease-out)] [@media(hover:hover)_and_(pointer:fine)]:hover:bg-accent-hover [@media(hover:hover)_and_(pointer:fine)]:hover:shadow-card [@media(hover:hover)_and_(pointer:fine)]:motion-safe:hover:-translate-y-0.5 disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
          >
            {pending ? "שולח…" : "שלח קוד אימות למייל"}
          </button>

          {/* §7b commission disclosure — the consultation is free; we're paid by
              providers on a switch. */}
          <CommissionDisclosure variant="inline" />
        </div>
      )}

      {/* ── Step 2: verify the code ───────────────────────────────────────── */}
      {step === "verify" && (
        <div className="space-y-4">
          <p className="text-sm text-foreground">
            שלחנו קוד בן 6 ספרות ל-
            <span dir="ltr" className="font-medium">
              {email.trim()}
            </span>
            . הזינו אותו כאן כדי לאמת את הכתובת.
          </p>

          <div>
            <label
              htmlFor={id("code")}
              className="mb-1 block text-sm font-medium text-foreground"
            >
              קוד אימות (6 ספרות)
            </label>
            <input
              id={id("code")}
              ref={codeInputRef}
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              dir="ltr"
              maxLength={6}
              value={code}
              onChange={(e) =>
                setCode(e.target.value.replace(/\D/g, "").slice(0, 6))
              }
              className="interactive w-full rounded-xl border border-border bg-background px-3 py-2.5 text-center text-lg tracking-[0.4em] text-foreground outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
            />
          </div>

          {error && (
            <p role="alert" className="text-sm text-danger-text">
              {error}
            </p>
          )}

          {sendFailedBlock}

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => {
                setError(null);
                setSendFailed(false);
                setStep("details");
              }}
              disabled={pending}
              className="interactive press rounded-xl border border-border px-4 py-2.5 text-sm font-medium text-foreground hover:bg-border/60 disabled:opacity-50"
            >
              חזרה
            </button>
            <button
              type="button"
              onClick={verifyCode}
              disabled={pending || code.trim().length !== 6}
              aria-disabled={pending || code.trim().length !== 6}
              className="interactive press flex-1 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-accent-contrast shadow-soft hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
            >
              {pending ? "מאמת…" : "אימות"}
            </button>
          </div>

          <button
            type="button"
            onClick={resendCode}
            disabled={pending || resendIn > 0}
            // ≥44px tap target (min-h-11 + horizontal padding pulled back with a
            // negative margin so the text keeps its alignment) — this control is
            // hit at the flow's most failure-prone moment; keep it visually a
            // secondary text link, just comfortably tappable.
            className="interactive -mx-2 inline-flex min-h-11 items-center px-2 text-xs text-accent-text underline disabled:cursor-not-allowed disabled:text-muted disabled:no-underline"
          >
            {resendIn > 0
              ? `אפשר לשלוח קוד חדש בעוד ${resendIn} שניות`
              : "לא קיבלתם? שליחת קוד חדש"}
          </button>
        </div>
      )}

      {/* ── Step 3: confirm + book ────────────────────────────────────────── */}
      {step === "confirm" && (
        <div className="space-y-4">
          <p className="text-sm font-medium text-accent-text">
            <span aria-hidden="true">✓</span> המייל אומת. אישור אחרון לפני קביעת
            הפגישה:
          </p>

          <dl className="rounded-xl border border-border/60 bg-background/60 p-4 text-sm">
            <div className="flex justify-between gap-3 py-1">
              <dt className="text-muted">שם</dt>
              <dd className="font-medium text-foreground">{name.trim()}</dd>
            </div>
            <div className="flex justify-between gap-3 py-1">
              <dt className="text-muted">טלפון</dt>
              <dd dir="ltr" className="font-medium text-foreground">
                {phone.trim()}
              </dd>
            </div>
            <div className="flex justify-between gap-3 py-1">
              <dt className="text-muted">שירות</dt>
              <dd className="font-medium text-foreground">
                {category ? CATEGORY_HE[category] : ""}
              </dd>
            </div>
            <div className="flex justify-between gap-3 py-1">
              <dt className="text-muted">חברה</dt>
              <dd className="font-medium text-foreground">{provider}</dd>
            </div>
            <div className="flex justify-between gap-3 py-1">
              <dt className="text-muted">מועד</dt>
              <dd className="font-medium text-foreground">
                {selectedDayLabel} · {slot}
              </dd>
            </div>
          </dl>

          {error && (
            <p role="alert" className="text-sm text-danger-text">
              {error}
            </p>
          )}

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => {
                setError(null);
                setStep("details");
              }}
              disabled={pending}
              className="interactive press rounded-xl border border-border px-4 py-2.5 text-sm font-medium text-foreground hover:bg-border/60 disabled:opacity-50"
            >
              שינוי פרטים
            </button>
            <button
              type="button"
              onClick={book}
              disabled={pending}
              aria-disabled={pending}
              className="interactive press flex-1 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-accent-contrast shadow-soft hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
            >
              {pending ? "קובע…" : "קבע פגישה"}
            </button>
          </div>

          <p className="text-xs text-muted">
            לאחר הקביעה הבקשה עוברת לנציג. הקביעה הסופית והקישור נשלחים למייל רק
            לאחר אישור נציג.
          </p>
        </div>
      )}
    </div>
  );
}
