"use client";

// ────────────────────────────────────────────────────────────────────────────
// <BillUploader> — the client surface for /bills (bill photo → savings).
//
// FLOW: pick/snap a bill photo → compress it in-browser (canvas, max edge +
// JPEG quality) so we never upload a 12MP original → preview → POST the base64
// to /api/analyze-bill → render the extracted provider / monthly spend / category
// and up to 3 REAL cheaper plans with their annual saving.
//
// HONESTY (E-E-A-T, ABSOLUTE):
//   • Every plan + price + saving shown comes from the server (the REAL catalogue
//     via the site-bill-analyzer edge fn). This component fabricates NOTHING.
//   • OCR is imperfect: we surface the read `confidence` + any model `warnings`
//     as a visible quality disclaimer, and tell the user to verify before acting.
//   • PRIVACY: a plain note states the photo is sent to Google (Gemini Vision) to
//     read it and is NOT stored. We hold it in memory only for the upload.
//
// A11y: labelled file input, status region (aria-live) for the loading + result,
// keyboardable controls, and reduced-motion respect on the spinner.
// RTL + dark are inherited from the layout / globals tokens.
// ────────────────────────────────────────────────────────────────────────────

import { useRef, useState } from "react";
// Aliased to NextImage: this module also calls `new Image()` (the DOM
// HTMLImageElement constructor) inside loadImage() for the canvas compression
// step. Importing next/image as the bare name `Image` would shadow that global
// constructor and break compression (and the test's globalThis.Image stub).
import NextImage from "next/image";
import { CATEGORY_HE } from "@/lib/categories";
import { leadCategory, type LeadCategory } from "@/lib/format";
import { trackEvent } from "@/lib/tracking";
import { analyzeBill, type ForensicsPlan } from "@/lib/bill-forensics";
import LeadForm from "@/components/LeadForm";
import PriceCaveat from "@/components/PriceCaveat";
import BillForensics from "@/components/BillForensics";
import SavingsReveal from "@/components/SavingsReveal";
import Icon from "@/components/Icon";

// Compression budget: cap the longest edge and re-encode as JPEG. A bill is text-
// heavy, so 1600px / q0.72 stays crisp for OCR while keeping the base64 payload
// well under the route's ~6MB ceiling (and usually well under 1MB).
const MAX_EDGE = 1600;
const JPEG_QUALITY = 0.72;
// Reject obviously-wrong inputs early (the route + edge fn also guard, but a
// friendly client message beats a round-trip).
const ACCEPTED = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];
const MAX_INPUT_BYTES = 20 * 1024 * 1024; // 20MB raw camera file ceiling

interface Suggestion {
  id?: string;
  name: string;
  provider: string;
  price: number;
  annualSaving: number;
}

interface AnalyzeResult {
  provider: string;
  currentSpend: number;
  category: string;
  suggestions: Suggestion[];
  annualSaving: number;
  confidence: number;
  warnings: string[];
  note?: string;
  error?: string;
}

type Phase = "idle" | "compressing" | "analyzing" | "done" | "error";

/** ₪-format a rounded integer. */
function ils(n: number): string {
  return `₪${Math.round(n)}`;
}

/** Human-readable confidence band from the 0–1 read confidence. */
function confidenceLabel(c: number): { label: string; tone: "ok" | "warn" } {
  if (c >= 0.75) return { label: "קריאה ברורה", tone: "ok" };
  if (c >= 0.5) return { label: "קריאה סבירה — כדאי לוודא", tone: "warn" };
  return { label: "קריאה חלקית — ודאו מול החשבון", tone: "warn" };
}

/**
 * Load a File into an <img>, draw it onto a canvas scaled to MAX_EDGE, and return
 * a compressed JPEG data-URL. Falls back to the original data-URL if the canvas
 * pipeline is unavailable (very old browsers) so the feature still works.
 */
async function compressImage(file: File): Promise<string> {
  const dataUrl = await readAsDataUrl(file);
  try {
    const img = await loadImage(dataUrl);
    const scale = Math.min(1, MAX_EDGE / Math.max(img.width, img.height));
    const w = Math.max(1, Math.round(img.width * scale));
    const h = Math.max(1, Math.round(img.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return dataUrl;
    ctx.drawImage(img, 0, 0, w, h);
    const out = canvas.toDataURL("image/jpeg", JPEG_QUALITY);
    // Guard against a pathological canvas output larger than the source.
    return out.length < dataUrl.length ? out : dataUrl;
  } catch {
    return dataUrl; // best-effort: send the original rather than fail
  }
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("read failed"));
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("decode failed"));
    img.src = src;
  });
}

export interface BillUploaderProps {
  /**
   * A slim, serializable projection of the REAL catalogue (cat/provider/plan/
   * price/after/kind only), passed from the server /bills page. Used solely by the
   * forensics' expired-promo detection (it needs the promo→`after` step-up the
   * analyzer's suggestions don't carry). Optional — with none, forensics still
   * runs on the bill-level overpay vs the surfaced suggestions.
   */
  promoPlans?: ForensicsPlan[];
}

export default function BillUploader({ promoPlans = [] }: BillUploaderProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [result, setResult] = useState<AnalyzeResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const busy = phase === "compressing" || phase === "analyzing";

  function reset() {
    setPhase("idle");
    setPreviewUrl(null);
    setResult(null);
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    setResult(null);

    if (file.size > MAX_INPUT_BYTES) {
      setPhase("error");
      setError("הקובץ גדול מדי. צלמו תמונה במקום קובץ כבד, ונסו שוב.");
      return;
    }
    // Some cameras report an empty type for HEIC; accept when type is blank.
    if (file.type && !ACCEPTED.includes(file.type)) {
      setPhase("error");
      setError("פורמט הקובץ אינו נתמך. העלו תמונה (JPG / PNG).");
      return;
    }

    trackEvent("bill_upload_start", { source: "bills" });

    let imageBase64: string;
    try {
      setPhase("compressing");
      imageBase64 = await compressImage(file);
      setPreviewUrl(imageBase64);
    } catch {
      setPhase("error");
      setError("לא הצלחנו לעבד את התמונה. נסו תמונה אחרת.");
      return;
    }

    try {
      setPhase("analyzing");
      const res = await fetch("/api/analyze-bill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64 }),
      });
      const data = (await res.json().catch(() => ({}))) as AnalyzeResult;

      if (!res.ok) {
        setPhase("error");
        setError(
          data.error ?? "אירעה שגיאה בניתוח החשבון. נסו שוב בעוד רגע.",
        );
        return;
      }
      // The route fail-soft path returns 200 with an `error` for an unreadable
      // image — show it as a friendly retry message, not a hard failure.
      if (data.error && data.suggestions?.length === 0 && !data.currentSpend) {
        setResult(data);
        setPhase("done");
        trackEvent("bill_upload_unreadable", { source: "bills" });
        return;
      }
      setResult(data);
      setPhase("done");
      trackEvent("bill_upload_result", {
        source: "bills",
        category: data.category || undefined,
        suggestions: data.suggestions?.length ?? 0,
        annual_saving: data.annualSaving || 0,
      });
    } catch {
      setPhase("error");
      setError("אירעה שגיאה בניתוח החשבון. נסו שוב בעוד רגע.");
    }
  }

  const readable =
    phase === "done" &&
    result != null &&
    !!result.currentSpend &&
    !result.error;
  const unreadable = phase === "done" && result != null && !readable;

  // Pre-select the desired-service category in the hand-off LeadForm when the
  // read gave us a usable category.
  const handoffCategory: LeadCategory | undefined = result
    ? leadCategory(result.category)
    : undefined;

  return (
    <div className="mt-8">
      {/* Async result/error reveals settle in with a small fade + 8px rise
          (transform+opacity only, ease-out, one-shot, motion-safe) so a result
          arriving after the upload round-trip doesn't pop jarringly. Rule:
          prevent-jarring; reduced-motion drops the transform automatically. */}
      <style>{`@keyframes bill-result-in{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}`}</style>
      {/* ── Uploader card ──────────────────────────────────────────────────── */}
      {/* id + scroll-mt: the hero's primary CTA (#bill-upload) lands here; the
          scroll-margin keeps the sticky header from covering the card top. */}
      <div id="bill-upload" className="bento scroll-mt-6 p-6 sm:p-8">
        <label htmlFor="bill-file" className="block">
          <span className="font-display text-lg font-semibold tracking-tight text-ink">
            צלמו או העלו את החשבון
          </span>
          <span className="mt-1 block text-sm text-muted">
            תמונה ברורה של החשבון החודשי — נקרא ממנה את הספק, הסכום החודשי וסוג
            השירות.
          </span>
        </label>

        {/* The actual input is visually compact but fully labelled + keyboardable.
            `capture` hints mobile to open the camera; desktop falls back to a
            file picker. */}
        <input
          ref={fileInputRef}
          id="bill-file"
          type="file"
          accept="image/*"
          capture="environment"
          disabled={busy}
          onChange={(e) => onFile(e.target.files?.[0])}
          className="interactive mt-4 block w-full cursor-pointer rounded-xl border border-border bg-background px-4 py-3 text-sm text-foreground outline-none file:me-4 file:rounded-lg file:border-0 file:bg-accent file:px-4 file:py-2 file:font-medium file:text-accent-contrast hover:file:bg-accent-hover focus:border-accent focus:ring-2 focus:ring-accent/30 disabled:cursor-not-allowed disabled:opacity-60"
        />

        {/* Privacy note — plain, prominent, never buried. */}
        <p className="mt-4 flex items-start gap-2 text-xs leading-relaxed text-muted">
          <Icon name="lock" size={16} className="mt-0.5 shrink-0" />
          <span>
            הפרטיות שלכם: התמונה נשלחת לקריאה אוטומטית בשירות של Google ‏(Gemini)
            ‏<strong>ואינה נשמרת</strong> אצלנו — לא התמונה ולא תוכנה. נשמר רק
            סיכום אנונימי (ספק, סכום, הצעות) לצורך מניעת שימוש לרעה.
          </span>
        </p>
      </div>

      {/* ── Preview + status (aria-live) ───────────────────────────────────── */}
      <div aria-live="polite" className="mt-4">
        {previewUrl && (
          <div className="bento overflow-hidden p-3">
            {/* Preview of the user's own upload. next/image with `fill` +
                `unoptimized`: the src is a transient in-memory base64 data-URI of
                the just-compressed photo (unknown intrinsic size, never a network
                asset), so the Image Optimizer can't and shouldn't re-process it —
                `unoptimized` serves the data-URI as-is. `fill` lets it size to a
                capped, relatively-positioned box; `object-contain` shows the whole
                bill un-cropped, matching the previous raw <img>. Using next/image
                drops the eslint no-img-element disable and keeps a consistent
                image pipeline. */}
            <div className="relative mx-auto h-72 w-full">
              <NextImage
                src={previewUrl}
                alt="תצוגה מקדימה של החשבון שהעליתם"
                fill
                unoptimized
                sizes="(max-width: 640px) 100vw, 640px"
                className="rounded-lg object-contain"
              />
            </div>
          </div>
        )}

        {busy && (
          <div className="bento mt-4 flex items-center gap-3 p-5">
            <span
              className="inline-block h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-accent border-t-transparent motion-reduce:animate-none"
              aria-hidden="true"
            />
            <p className="text-sm text-foreground">
              {phase === "compressing"
                ? "מכינים את התמונה…"
                : "קוראים את החשבון ומחפשים מסלולים זולים יותר… זה לוקח כמה שניות."}
            </p>
          </div>
        )}

        {phase === "error" && error && (
          <div
            role="alert"
            className="bento mt-4 border-l-4 border-l-value p-5 motion-safe:animate-[bill-result-in_320ms_var(--ease-out)_both]"
          >
            <p className="text-sm font-medium text-ink">{error}</p>
            <button
              type="button"
              onClick={reset}
              className="interactive press mt-3 inline-block rounded-xl border border-border/60 bg-surface px-4 py-2.5 text-sm font-medium text-foreground hover:border-accent/50 hover:text-accent hover:shadow-soft"
            >
              נסו שוב
            </button>
          </div>
        )}
      </div>

      {/* ── Unreadable result (200 + friendly error) ───────────────────────── */}
      {unreadable && result && (
        <div role="status" className="bento mt-4 p-6 motion-safe:animate-[bill-result-in_320ms_var(--ease-out)_both]">
          <h2 className="font-display text-lg font-semibold text-ink">
            לא הצלחנו לקרוא את החשבון
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-foreground">
            {result.error ??
              "נסו לצלם שוב באור טוב, ישר מול הדף, כך שהסכום החודשי וסוג השירות יהיו ברורים."}
          </p>
          {result.warnings.length > 0 && (
            <ul className="mt-3 list-inside list-disc space-y-1 text-xs text-muted">
              {result.warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          )}
          <button
            type="button"
            onClick={reset}
            className="press mt-4 inline-flex items-center justify-center gap-2 rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-accent-contrast shadow-[var(--glow-accent)] transition-transform active:scale-[0.98]"
          >
            צילום מחדש
            <Icon name="chevron" size={16} aria-hidden="true" />
          </button>
        </div>
      )}

      {/* ── Readable result: extracted facts + cheaper plans + hand-off ─────
          nums-tabular column-aligns every ₪ figure (monthly spend, plan prices,
          annual savings) into an even numeric ledger — parity with the home. */}
      {readable && result && (
        <div className="nums-tabular mt-4 space-y-4 motion-safe:animate-[bill-result-in_320ms_var(--ease-out)_both]">
          {/* Extracted summary. */}
          <div role="status" className="bento p-6">
            <h2 className="font-display text-xl font-bold tracking-tight text-ink">
              מה קראנו מהחשבון
            </h2>
            <dl className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <dt className="text-xs text-muted">ספק נוכחי</dt>
                <dd className="mt-0.5 text-base font-semibold text-ink">
                  {result.provider || "לא זוהה"}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted">תשלום חודשי</dt>
                <dd className="mt-0.5 text-base font-semibold text-ink">
                  {ils(result.currentSpend)}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted">סוג שירות</dt>
                <dd className="mt-0.5 text-base font-semibold text-ink">
                  {CATEGORY_HE[result.category] || "לא זוהה"}
                </dd>
              </div>
            </dl>

            {/* OCR-confidence + quality disclaimer — honest about the read. */}
            <ConfidenceNote
              confidence={result.confidence}
              warnings={result.warnings}
            />
          </div>

          {/* Signature clip-path before/after — "your annual cost today" wipes to
              "your annual cost on the cheapest plan" as the user scrubs. Pure over
              the SAME read (currentSpend × 12 minus the REAL headline annualSaving);
              renders nothing unless there's a real positive gap. */}
          {result.annualSaving > 0 && (
            <SavingsReveal
              currentSpend={result.currentSpend}
              annualSaving={result.annualSaving}
            />
          )}

          {/* Itemized forensics — "ייתכן שאתה משלם ₪X מיותר" + expired-promo /
              unused-line flags + total-overpay summary. Pure analyzer over the
              SAME read + the REAL catalogue; renders nothing on an unreadable bill. */}
          <BillForensics
            report={analyzeBill(
              {
                provider: result.provider,
                currentSpend: result.currentSpend,
                category: result.category,
                suggestions: result.suggestions,
                confidence: result.confidence,
              },
              promoPlans,
            )}
          />

          {/* Cheaper plans (REAL catalogue), or an honest "no cheaper plan" note. */}
          {result.suggestions.length > 0 ? (
            <div className="bento p-6">
              <h3 className="font-display text-lg font-semibold tracking-tight text-ink">
                מצאנו מסלולים זולים יותר באותה קטגוריה
              </h3>
              {result.annualSaving > 0 && (
                <p className="mt-1 text-sm text-foreground">
                  חיסכון שנתי של עד{" "}
                  <strong className="text-value-text">
                    {ils(result.annualSaving)}
                  </strong>{" "}
                  לעומת התשלום הנוכחי.
                </p>
              )}
              <ul className="mt-4 space-y-3">
                {result.suggestions.map((s, i) => (
                  <li
                    key={s.id ?? `${s.provider}-${s.name}-${i}`}
                    className="flex flex-wrap items-baseline justify-between gap-2 rounded-xl border border-border/60 bg-surface p-4"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium text-ink">{s.name}</p>
                      <p className="text-sm text-muted">{s.provider}</p>
                    </div>
                    <div className="text-end">
                      <p className="text-base font-bold text-ink">
                        {ils(s.price)}
                        <span className="text-xs font-normal text-muted">
                          {" "}
                          /ח׳
                        </span>
                      </p>
                      {s.annualSaving > 0 && (
                        <p className="text-xs font-medium text-value-text">
                          חיסכון {ils(s.annualSaving)} בשנה
                        </p>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
              <PriceCaveat className="mt-4" />
            </div>
          ) : (
            <div className="bento p-6">
              <p className="text-sm leading-relaxed text-foreground">
                {result.note ??
                  "לא מצאנו מסלול זול יותר באותה קטגוריה — נראה שאתם משלמים מחיר טוב."}
              </p>
            </div>
          )}

          {/* Hand-off to the lead form — the primary next action. */}
          <div className="bento p-6 sm:p-8">
            <LeadForm
              source="bill-analyzer"
              defaultCategory={handoffCategory}
              heading="רוצים שנעזור לעבור? השאירו פרטים — חינם ובלי התחייבות"
            />
          </div>

          <button
            type="button"
            onClick={reset}
            className="interactive mx-auto block text-sm font-medium text-accent-text hover:text-accent-hover"
          >
            ניתוח חשבון נוסף
          </button>
        </div>
      )}
    </div>
  );
}

/** Inline confidence + warnings disclaimer under the extracted summary. */
function ConfidenceNote({
  confidence,
  warnings,
}: {
  confidence: number;
  warnings: string[];
}) {
  const { label, tone } = confidenceLabel(confidence);
  return (
    <div className="mt-4 rounded-lg bg-background/60 p-3">
      <p className="flex items-center gap-2 text-xs">
        <Icon
          name={tone === "ok" ? "check" : "alert"}
          size={14}
          className={`shrink-0 ${tone === "ok" ? "text-muted" : "text-value-text"}`}
        />
        <span className={tone === "ok" ? "text-muted" : "text-value-text"}>
          רמת ודאות בקריאה: {label}
        </span>
      </p>
      {warnings.length > 0 && (
        <ul className="mt-2 list-inside list-disc space-y-1 text-xs text-muted">
          {warnings.map((w, i) => (
            <li key={i}>{w}</li>
          ))}
        </ul>
      )}
      <p className="mt-2 text-xs leading-relaxed text-muted">
        הקריאה אוטומטית ועשויה לטעות. ודאו את הסכום וסוג השירות מול החשבון בפועל
        לפני קבלת החלטה.
      </p>
    </div>
  );
}
