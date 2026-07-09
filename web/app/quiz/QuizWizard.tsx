"use client";

// ────────────────────────────────────────────────────────────────────────────
// <QuizWizard> — the 5-question matcher wizard that turns a few answers into
// INSTANT, REAL plan matches.
//
// Flow:  category → budget → priority → lines → abroad  →  POST /api/recommend
//        → ranked REAL catalogue plans (score + reasons + caveats)
//        → hand-off to the existing lead flow (<LeadForm source="advisor">).
//
// The ranking is done SERVER-SIDE by /api/recommend through the shared,
// provider-neutral formula (lib/recommend.ts) — the same one the app + WhatsApp
// bot use, so the matches are identical across surfaces. This component owns only
// the wizard UX + rendering the honest results; it invents NO plan data.
//
// HONESTY: every result row is a real catalogue plan. The annual-saving figure
// shows ONLY when the user supplied their current bill (otherwise it's omitted,
// never shown as ₪0 "no savings"). A §7b commission line + price caveat sit above
// the lead hand-off, exactly like the rest of the site.
//
// a11y: a labelled radiogroup per step (arrow-key navigable via native radios),
// a live region announcing step changes + results, full keyboard nav, RTL copy.
// Premium-2026: bento cards, accent gradient CTA, flutter-free CSS transitions.
// ────────────────────────────────────────────────────────────────────────────

import { useId, useRef, useState } from "react";
import Link from "next/link";
import LeadForm from "@/components/LeadFormLazy";
import CommissionDisclosure from "@/components/CommissionDisclosure";
import PriceCaveat from "@/components/PriceCaveat";
import SwitchyMascot from "@/components/SwitchyMascot";
import SkeletonCard from "@/components/SkeletonCard";
import Icon from "@/components/Icon";
import { CATEGORY_HE } from "@/lib/categories";
import { ils } from "@/lib/format";
import { trackEvent } from "@/lib/tracking";
import type { RecommendMatch } from "./types";

// ── Quiz option vocabularies (labels are the only copy; values feed the API) ──

const CATEGORIES = [
  { value: "cellular", label: "סלולר", hint: "חבילת SIM / 5G" },
  { value: "internet", label: "אינטרנט", hint: "סיב אופטי / כבלים" },
  { value: "tv", label: "טלוויזיה", hint: "סטרימינג / ערוצים" },
  { value: "triple", label: "חבילה משולבת", hint: "אינטרנט + טלוויזיה + טלפון" },
  { value: "abroad", label: "חבילת חו״ל", hint: "גלישה ושיחות בחו״ל" },
] as const;

type QuizCategory = (typeof CATEGORIES)[number]["value"];

/** Budget buckets → a ₪ ceiling sent to the API (null = no ceiling). */
const BUDGETS = [
  { value: "0", label: "אין לי תקציב קבוע", ceiling: null },
  { value: "40", label: "עד ₪40 לחודש", ceiling: 40 },
  { value: "70", label: "עד ₪70 לחודש", ceiling: 70 },
  { value: "120", label: "עד ₪120 לחודש", ceiling: 120 },
  { value: "200", label: "עד ₪200 לחודש", ceiling: 200 },
] as const;

/** Priority → the formula's MatchPriority id. */
const PRIORITIES = [
  { value: "price", label: "המחיר הכי נמוך", hint: "לחסוך כמה שיותר" },
  { value: "speed", label: "מהירות ו-5G", hint: "הכי מהיר שיש" },
  { value: "coverage", label: "כיסוי ויציבות", hint: "שיעבוד בכל מקום" },
  { value: "service", label: "שירות ואמינות", hint: "ספק שאפשר לסמוך עליו" },
  { value: "flexibility", label: "גמישות", hint: "בלי התחייבות" },
  { value: "balanced", label: "איזון בין הכול", hint: "תמורה טובה למחיר" },
] as const;

const LINES = [
  { value: "1", label: "קו אחד" },
  { value: "2", label: "2 קווים" },
  { value: "3", label: "3 קווים" },
  { value: "4", label: "4 ומעלה" },
] as const;

const ABROAD = [
  { value: "yes", label: "כן, חשוב לי", abroad: true },
  { value: "no", label: "לא צריך", abroad: false },
] as const;

/** The answers the wizard collects, before mapping to the API body. */
interface Answers {
  category: QuizCategory | "";
  budget: string; // a BUDGETS value
  priority: string; // a PRIORITIES value
  lines: string; // a LINES value
  abroad: string; // an ABROAD value
}

const INITIAL: Answers = {
  category: "",
  budget: "0",
  priority: "balanced",
  lines: "1",
  abroad: "no",
};

// "empty" is distinct from "error": the request succeeded but the formula found
// no real catalogue plan that fits the answers (e.g. a very low budget ceiling in
// a category whose cheapest plan is above it). We must NOT fabricate a match, so
// we show an honest "no fit" state that routes to the full comparison + lead,
// never a fake result. "error" stays reserved for a genuine network/server fault.
type Phase = "quiz" | "loading" | "results" | "error" | "empty";

const STEP_TITLES = [
  "מה מחפשים?",
  "מה התקציב החודשי?",
  "מה הכי חשוב לכם?",
  "כמה קווים / אנשים?",
  "צריכים שימוש בחו״ל?",
];

/** Total steps. Step 3 (lines) is only meaningful for cellular/triple but always
 *  shown for a consistent 5-step flow; the API uses it only as informational +
 *  a tie-break seed input, never to fabricate a fit. */
const TOTAL_STEPS = 5;

export default function QuizWizard() {
  const [answers, setAnswers] = useState<Answers>(INITIAL);
  const [step, setStep] = useState(0);
  const [phase, setPhase] = useState<Phase>("quiz");
  const [matches, setMatches] = useState<RecommendMatch[]>([]);
  const [hasBill, setHasBill] = useState(false);

  // Fire "quiz_start" at most once per mount, on the first answer.
  const startedRef = useRef(false);
  const liveRef = useRef<HTMLDivElement>(null);
  const groupId = useId();

  const progress = Math.round(((step + 1) / TOTAL_STEPS) * 100);
  const lastStep = TOTAL_STEPS - 1;

  function markStarted() {
    if (startedRef.current) return;
    startedRef.current = true;
    trackEvent("quiz_start", {});
  }

  function setAnswer<K extends keyof Answers>(key: K, value: Answers[K]) {
    markStarted();
    setAnswers((a) => ({ ...a, [key]: value }));
  }

  function next() {
    if (step < lastStep) {
      const nextStep = step + 1;
      trackEvent("quiz_step", { step: step + 1, step_name: STEP_TITLES[step] });
      setStep(nextStep);
    } else {
      void submit();
    }
  }

  function back() {
    if (phase === "results" || phase === "error" || phase === "empty") {
      setPhase("quiz");
      return;
    }
    setStep((s) => Math.max(0, s - 1));
  }

  function restart() {
    setAnswers(INITIAL);
    setStep(0);
    setPhase("quiz");
    setMatches([]);
    setHasBill(false);
    startedRef.current = false;
  }

  async function submit() {
    if (!answers.category) return;
    setPhase("loading");
    trackEvent("quiz_submit", {
      category: answers.category,
      priority: answers.priority,
    });

    const ceiling =
      BUDGETS.find((b) => b.value === answers.budget)?.ceiling ?? null;
    const wantsAbroad =
      ABROAD.find((a) => a.value === answers.abroad)?.abroad ?? false;

    try {
      const res = await fetch("/api/recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category: answers.category,
          budget: ceiling ?? undefined,
          priority: answers.priority,
          lines: Number(answers.lines) || undefined,
          abroad: wantsAbroad,
          limit: 5,
        }),
      });
      if (!res.ok) {
        setPhase("error");
        trackEvent("quiz_error", { reason: "server" });
        return;
      }
      const data = (await res.json()) as {
        ok: boolean;
        matches?: RecommendMatch[];
        hasBill?: boolean;
      };
      // A well-formed response that simply has no fitting plan is NOT an error —
      // surface an honest "no match" empty state (→ /compare + lead) rather than
      // the retry-error UI or, worse, a fabricated result.
      if (data.ok && Array.isArray(data.matches) && data.matches.length === 0) {
        setPhase("empty");
        trackEvent("quiz_empty", { category: answers.category });
        return;
      }
      if (!data.ok || !Array.isArray(data.matches)) {
        setPhase("error");
        trackEvent("quiz_error", { reason: "malformed" });
        return;
      }
      setMatches(data.matches);
      setHasBill(Boolean(data.hasBill));
      setPhase("results");
      trackEvent("quiz_results", {
        category: answers.category,
        count: data.matches.length,
      });
    } catch {
      setPhase("error");
      trackEvent("quiz_error", { reason: "network" });
    }
  }

  // ── Results / error / loading phases ───────────────────────────────────────
  if (phase === "results") {
    return (
      <Results
        matches={matches}
        hasBill={hasBill}
        category={answers.category as QuizCategory}
        onRestart={restart}
      />
    );
  }

  // ── The wizard (quiz / loading / error share the card chrome) ──────────────
  return (
    <div className="bento p-6 sm:p-7">
      {/* Live region: announces step + phase changes to screen readers. */}
      <div ref={liveRef} className="sr-only" role="status" aria-live="polite">
        {phase === "loading"
          ? "מחשבים התאמות…"
          : phase === "empty"
            ? "לא נמצאו מסלולים שתואמים את הבחירות. אפשר להרחיב את הסינון או לעבור להשוואה המלאה."
            : `שלב ${step + 1} מתוך ${TOTAL_STEPS}: ${STEP_TITLES[step]}`}
      </div>

      {/* Progress */}
      <div className="mb-5">
        <div className="mb-1 flex items-center justify-between text-xs text-muted">
          <span>
            שלב {step + 1} מתוך {TOTAL_STEPS}: {STEP_TITLES[step]}
          </span>
          <span>{progress}%</span>
        </div>
        {/* Step dots — a glanceable per-step position strip: done/active steps are
            accent-green, upcoming steps neutral. Decorative (the progressbar below
            owns the a11y semantics), so the strip is aria-hidden. RTL-correct:
            flex follows the document's logical direction. */}
        <div aria-hidden="true" className="mb-1.5 flex items-center gap-1.5">
          {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
            <span
              key={i}
              className={[
                "h-1.5 flex-1 rounded-full transition-colors ease-[var(--ease-out)]",
                i <= step ? "bg-accent" : "bg-border",
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
          aria-label="התקדמות השאלון"
        >
          <div
            className="h-full rounded-full bg-accent"
            style={{
              width: `${progress}%`,
              transition: "width var(--duration-modal) var(--ease-out)",
            }}
          />
        </div>
      </div>

      {phase === "empty" ? (
        <div className="flex flex-col items-center py-6 text-center" role="status">
          {/* Branded badge — the Switchy mascot in the soft ACTION wash, the
              site-wide empty-state figure. Decorative; the copy carries meaning. */}
          <span
            aria-hidden="true"
            className="elevate-soft flex h-20 w-20 items-center justify-center rounded-full border border-accent/20 bg-accent/10 text-accent-text"
          >
            <SwitchyMascot size={48} />
          </span>
          <p className="mt-5 font-display text-lg font-bold text-ink">
            לא מצאנו מסלול שמתאים בדיוק לבחירות שלכם
          </p>
          <p className="mt-2 max-w-md text-sm leading-relaxed text-muted">
            אף מסלול אמיתי בקטלוג שלנו לא עונה על כל הקריטריונים שסימנתם
            {answers.category
              ? ` בקטגוריית ${CATEGORY_HE[answers.category] ?? "זו"}`
              : ""}
            . נסו להרחיב את התקציב או לשנות עדיפות — או עברו להשוואה המלאה ובחרו
            בעצמכם. לא נמציא לכם התאמה שלא קיימת.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <button
              type="button"
              onClick={back}
              className="interactive press rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-accent-contrast shadow-soft hover:-translate-y-0.5 hover:bg-accent-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              שינוי הבחירות
            </button>
            <Link
              href={answers.category ? `/compare/${answers.category}` : "/compare"}
              className="interactive press rounded-xl border border-border px-5 py-2.5 text-sm font-medium text-foreground hover:bg-border/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              להשוואה המלאה
            </Link>
          </div>
        </div>
      ) : phase === "error" ? (
        <div className="flex flex-col items-center py-6 text-center" role="alert">
          {/* Branded badge — same Switchy figure keeps a failure on-brand. */}
          <span
            aria-hidden="true"
            className="elevate-soft flex h-20 w-20 items-center justify-center rounded-full border border-accent/20 bg-accent/10 text-accent-text"
          >
            <SwitchyMascot size={48} />
          </span>
          <p className="mt-5 font-display text-lg font-bold text-ink">
            לא הצלחנו להביא התאמות כרגע
          </p>
          <p className="mt-2 max-w-md text-sm text-muted">
            אפשר לנסות שוב בעוד רגע, או פשוט להשאיר פרטים ונחזור עם השוואה מותאמת.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <button
              type="button"
              onClick={() => void submit()}
              className="interactive press rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-accent-contrast shadow-soft hover:-translate-y-0.5 hover:bg-accent-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              נסו שוב
            </button>
            <Link
              href="/#lead"
              className="interactive press rounded-xl border border-border px-5 py-2.5 text-sm font-medium text-foreground hover:bg-border/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              השארת פרטים
            </Link>
          </div>
        </div>
      ) : phase === "loading" ? (
        // Branded "matches are coming" skeleton — mirrors the ranked-results
        // silhouette (a few match cards) instead of a bare spinner, so the
        // load→results swap is low-jank. Decorative + announced via the live
        // region above; reduced-motion-safe via SkeletonCard's own guard.
        <div aria-hidden="true">
          <p className="mb-4 text-center text-sm text-muted">
            מחשבים את ההתאמות הטובות ביותר…
          </p>
          <div className="space-y-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <SkeletonCard key={i} lines={2} />
            ))}
          </div>
        </div>
      ) : (
        <>
          {/* Step transition (Emil rule #11/#3): on each step change, re-key the
              fieldset so it re-enters with a snappy fade + small lift — ease-out,
              ~220ms (well under 300ms so it never feels sluggish). transform +
              opacity ONLY (GPU). The radios stay native + focusable throughout; the
              motion never blocks interaction. Reduced-motion drops the animation
              (the global reduce block clamps animation-duration), so the new step
              simply appears. Step changes are deliberate, low-frequency moves, so a
              standard-band transition is the right "purpose: spatial continuity"
              fit rather than no motion at all. */}
          <style
            dangerouslySetInnerHTML={{
              __html: `
            .sw-step { animation: swStep 220ms var(--ease-out) both; }
            @keyframes swStep {
              from { opacity: 0; transform: translateY(8px); }
              to   { opacity: 1; transform: translateY(0); }
            }
            @media (prefers-reduced-motion: reduce) {
              .sw-step { animation: none; }
            }
          `,
            }}
          />
          {/* ── Step bodies — each a native radiogroup (arrow-key navigable) ── */}
          <fieldset key={step} className="sw-step">
            <legend
              id={`${groupId}-legend`}
              className="mb-3 font-display text-lg font-bold tracking-tight text-ink"
            >
              {STEP_TITLES[step]}
            </legend>

            {step === 0 && (
              <OptionGrid
                name={`${groupId}-category`}
                labelledById={`${groupId}-legend`}
                options={CATEGORIES.map((c) => ({
                  value: c.value,
                  label: c.label,
                  hint: c.hint,
                }))}
                selected={answers.category}
                onSelect={(v) => setAnswer("category", v as QuizCategory)}
              />
            )}
            {step === 1 && (
              <OptionGrid
                name={`${groupId}-budget`}
                labelledById={`${groupId}-legend`}
                options={BUDGETS.map((b) => ({ value: b.value, label: b.label }))}
                selected={answers.budget}
                onSelect={(v) => setAnswer("budget", v)}
              />
            )}
            {step === 2 && (
              <OptionGrid
                name={`${groupId}-priority`}
                labelledById={`${groupId}-legend`}
                options={PRIORITIES.map((p) => ({
                  value: p.value,
                  label: p.label,
                  hint: p.hint,
                }))}
                selected={answers.priority}
                onSelect={(v) => setAnswer("priority", v)}
              />
            )}
            {step === 3 && (
              <OptionGrid
                name={`${groupId}-lines`}
                labelledById={`${groupId}-legend`}
                options={LINES.map((l) => ({ value: l.value, label: l.label }))}
                selected={answers.lines}
                onSelect={(v) => setAnswer("lines", v)}
              />
            )}
            {step === 4 && (
              <OptionGrid
                name={`${groupId}-abroad`}
                labelledById={`${groupId}-legend`}
                options={ABROAD.map((a) => ({ value: a.value, label: a.label }))}
                selected={answers.abroad}
                onSelect={(v) => setAnswer("abroad", v)}
              />
            )}
          </fieldset>

          {/* Navigation — three-tier button grammar:
              • PREV ("חזרה")  = SECONDARY ghost (border, no fill), reverse chevron.
              • NEXT ("המשך")  = PRIMARY (solid green + accent glow + press),
                                 direction-aware forward chevron.
              • SUBMIT (step 5) = same PRIMARY fill but a check icon (a completion,
                                 not a forward step).
              The direction-aware chevrons are <Icon> glyphs (never hardcoded ←/→);
              the "back" chevron is mirrored via -scale-x-100. */}
          <div className="mt-6 flex items-center gap-3">
            {step > 0 && (
              <button
                type="button"
                onClick={back}
                className="interactive press inline-flex items-center gap-1.5 rounded-xl border border-border px-4 py-2.5 text-sm font-medium text-foreground hover:bg-border/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                <Icon
                  name="chevron"
                  size={16}
                  aria-hidden="true"
                  className="-scale-x-100"
                />
                חזרה
              </button>
            )}
            <button
              type="button"
              onClick={next}
              disabled={step === 0 && !answers.category}
              aria-disabled={step === 0 && !answers.category}
              className="interactive press flex flex-1 items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-accent-contrast shadow-[var(--glow-accent)] transition-transform hover:bg-accent-hover active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none disabled:active:scale-100"
            >
              {step < lastStep ? "המשך" : "מצאו לי מסלולים"}
              <Icon
                name={step < lastStep ? "chevron" : "check"}
                size={18}
                aria-hidden="true"
              />
            </button>
          </div>

          <p className="mt-3 text-center text-xs text-muted">
            ההתאמות מבוססות על הקטלוג האמיתי שלנו — ללא העדפת ספק. חינמי וללא התחייבות.
          </p>
        </>
      )}
    </div>
  );
}

// ── OptionGrid — a radiogroup of selectable bento "chips" ────────────────────
interface Option {
  value: string;
  label: string;
  hint?: string;
}

function OptionGrid({
  name,
  labelledById,
  options,
  selected,
  onSelect,
}: {
  name: string;
  labelledById: string;
  options: Option[];
  selected: string;
  onSelect: (value: string) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-labelledby={labelledById}
      className="grid grid-cols-1 gap-3 sm:grid-cols-2"
    >
      {options.map((opt) => {
        const id = `${name}-${opt.value}`;
        const isSel = selected === opt.value;
        return (
          <label
            key={opt.value}
            htmlFor={id}
            className={[
              "interactive press flex cursor-pointer items-start gap-3 rounded-xl border p-4 text-right",
              "focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent",
              isSel
                ? "border-accent bg-accent/10 ring-2 ring-accent/30"
                : "border-border bg-background hover:border-border-strong/40 hover:bg-border/40",
            ].join(" ")}
          >
            <input
              id={id}
              type="radio"
              name={name}
              value={opt.value}
              checked={isSel}
              onChange={() => onSelect(opt.value)}
              className="mt-0.5 h-5 w-5 shrink-0 accent-accent focus:ring-2 focus:ring-accent/30"
            />
            <span className="flex flex-col">
              <span className="text-sm font-semibold text-foreground">
                {opt.label}
              </span>
              {opt.hint && (
                <span className="mt-0.5 text-xs text-muted">{opt.hint}</span>
              )}
            </span>
          </label>
        );
      })}
    </div>
  );
}

// ── Results — ranked REAL plans + hand-off to the existing lead flow ─────────
function Results({
  matches,
  hasBill,
  category,
  onRestart,
}: {
  matches: RecommendMatch[];
  hasBill: boolean;
  category: QuizCategory;
  onRestart: () => void;
}) {
  const catHe = CATEGORY_HE[category] ?? category;
  const best = matches[0];

  return (
    <div className="space-y-8">
      {/* Results entrance (Emil rule #11): the loading→results swap is a rare,
          first-time, high-value moment — the one place "delight" is warranted.
          The header settles in, then the ranked cards reveal in a 60ms stagger
          (fade + 8px lift) so the eye lands on rank #1 first. transform + opacity
          ONLY; reduced-motion drops the animation entirely (global reduce block),
          so results appear at rest with no travel. Single-shot (`both`) — no idle
          loop. */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
        .sw-result { animation: swResult 360ms var(--ease-out) both; }
        @keyframes swResult {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @media (prefers-reduced-motion: reduce) {
          .sw-result { animation: none; }
        }
      `,
        }}
      />
      {/* Header + restart */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl font-bold tracking-tight text-ink">
            ההתאמות שלך — {catHe}
          </h2>
          <p className="mt-1 text-sm text-muted">
            דירוג לפי ההעדפות שלך, מתוך הקטלוג האמיתי שלנו. ללא העדפת ספק.
          </p>
        </div>
        <button
          type="button"
          onClick={onRestart}
          className="interactive press rounded-xl border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-border/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          התחלה מחדש
        </button>
      </div>

      {/* Ranked match cards — staggered reveal so #1 lands first. tabular-nums
          column-aligns the price / % / saving digits (parity with the home). */}
      <ol className="nums-tabular space-y-4">
        {matches.map((m, i) => (
          <li
            key={m.id}
            className="sw-result"
            style={{ animationDelay: `${Math.min(i * 60, 300)}ms` }}
          >
            <MatchCard match={m} rank={i + 1} hasBill={hasBill} top={i === 0} />
          </li>
        ))}
      </ol>

      {/* Honest disclosures before the hand-off (§7b + §17), as elsewhere. */}
      <CommissionDisclosure variant="inline" />
      <PriceCaveat />

      {/* Hand-off to the EXISTING lead flow, pre-selecting the chosen category +
          the best-match provider/plan so the rep starts from the right place. */}
      <section id="quiz-lead" aria-labelledby="quiz-lead-h" className="scroll-mt-6">
        <h3 id="quiz-lead-h" className="sr-only">
          קבלת ההצעה
        </h3>
        <LeadForm
          source="advisor"
          defaultCategory={category}
          heading={
            best
              ? `רוצים את ${best.plan} מ${best.provider}? נסגור לכם`
              : "קבלת הצעה מותאמת"
          }
        />
      </section>
    </div>
  );
}

// ── MatchCard — one ranked REAL plan with score + reasons + caveats ──────────
function MatchCard({
  match,
  rank,
  hasBill,
  top,
}: {
  match: RecommendMatch;
  rank: number;
  hasBill: boolean;
  top: boolean;
}) {
  return (
    <article
      className={[
        "bento p-5",
        top ? "glow-accent ring-1 ring-accent/30" : "",
      ]
        .join(" ")
        .trim()}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span
            aria-hidden="true"
            className={[
              "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold",
              top
                ? "bg-accent text-accent-contrast"
                : "bg-accent/15 text-accent-text",
            ].join(" ")}
          >
            {rank}
          </span>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-display text-base font-bold text-ink">
                {match.plan}
              </h3>
              {top && (
                <span className="rounded-full bg-accent/15 px-2 py-0.5 text-[12px] font-semibold text-accent-text">
                  ההתאמה הטובה ביותר
                </span>
              )}
            </div>
            <p className="mt-0.5 text-sm text-muted">{match.provider}</p>
          </div>
        </div>

        {/* Price + match score */}
        <div className="text-left">
          <div className="font-display text-xl font-bold text-ink">
            ₪{match.priceText}
            <span className="text-sm font-normal text-muted"> {match.priceUnit}</span>
          </div>
          {/* Honest post-promo line — an "לאחר המבצע" jump or a neutral "מחיר קבוע",
              exactly as the comparison tables show (never a meaningless bare dash). */}
          <div className="mt-0.5 text-xs">
            {match.afterLabel.kind === "jump" ? (
              <span className="text-foreground">
                לאחר המבצע:{" "}
                <span className="font-semibold text-ink">{match.afterLabel.text}</span>
              </span>
            ) : (
              <span className="text-muted" title="המחיר אינו עולה לאחר תום המבצע">
                {match.afterLabel.text}
              </span>
            )}
          </div>
          <div className="mt-0.5 text-xs font-medium text-accent-text">
            {match.score}% התאמה · {match.label}
          </div>
        </div>
      </div>

      {/* Category-relevant rich catalogue fields as compact labelled chips —
          נפח / מהירות / נתב / ממיר / התקנה / דקות / חו״ל, truth-only (only fields
          that exist on the plan), matching the comparison cards. */}
      {match.fields.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {match.fields.map((f) => (
            <span
              key={f.label}
              className="inline-flex items-baseline gap-1 rounded-lg border border-border/70 bg-background px-2 py-1 text-[12px] leading-tight"
            >
              <span className="text-muted">{f.label}</span>
              <span className="font-medium text-foreground">{f.value}</span>
            </span>
          ))}
        </div>
      )}

      {/* Honest annual saving — ONLY when the user gave a real current bill. */}
      {hasBill && match.annualSaving > 0 && (
        <p className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-value/10 px-2.5 py-1 text-sm font-semibold text-value-text">
          <span aria-hidden="true">↓</span>
          חיסכון משוער של {ils(match.annualSaving)} בשנה לעומת החשבון הנוכחי
        </p>
      )}

      {/* Reasons (why it ranked here) */}
      {match.reasons.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-2">
          {match.reasons.map((r) => (
            <li
              key={r}
              className="inline-flex items-center gap-1 rounded-lg bg-accent/10 px-2.5 py-1 text-xs font-medium text-accent-text"
            >
              <span aria-hidden="true">✓</span>
              {r}
            </li>
          ))}
        </ul>
      )}

      {/* Caveats (honest fine print: promo step-up, commitment, over budget) */}
      {match.caveats.length > 0 && (
        <ul className="mt-2 space-y-1">
          {match.caveats.map((c) => (
            <li key={c} className="flex items-start gap-1.5 text-xs text-muted">
              <span aria-hidden="true" className="mt-px">
                ⚠
              </span>
              <span>{c}</span>
            </li>
          ))}
        </ul>
      )}

      {/* Qualitative perks ("מידע נוסף") — real catalogue feats only, the same
          line the comparison cards show. */}
      {match.perks.length > 0 && (
        <p className="mt-3 text-[13px] leading-relaxed text-muted">
          {match.perks.join(" · ")}
        </p>
      )}

      {/* Deep-link into the full comparison for this category (no dead-end).
          Direction-aware <Icon name="chevron"> — never a hardcoded ←/→ glyph, so
          it mirrors correctly in the RTL flow (matches the home's link pattern). */}
      <div className="mt-4 border-t border-border/60 pt-3">
        <Link
          href={`/compare/${match.cat}`}
          className="interactive inline-flex items-center gap-1 text-sm font-medium text-accent-text hover:text-accent-hover"
        >
          השוואת כל מסלולי {CATEGORY_HE[match.cat] ?? match.cat}
          <Icon name="chevron" size={16} aria-hidden="true" />
        </Link>
      </div>
    </article>
  );
}
