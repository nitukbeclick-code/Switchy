"use client";

// ────────────────────────────────────────────────────────────────────────────
// <AccessibilityWidget> — a persistent, legally-compliant floating accessibility
// menu, present on every page (mounted site-wide in app/layout.tsx).
//
// Israel: תקנות שוויון זכויות לאנשים עם מוגבלות (התאמות נגישות לשירות) התשע"ג-2013
// + ת"י 5568 / WCAG 2.0 AA. It exposes the standard user-controlled adjustments —
// text sizing, high contrast, link emphasis, a readable font, motion off, strong
// keyboard-focus, reset — and links to the existing accessibility STATEMENT
// (/accessibility). It does NOT reword or fabricate any statement copy.
//
// HOW SETTINGS APPLY (mirrors the theme guard):
//   • Each setting toggles a class (or the --a11y-font-scale var) on <html>
//     (document.documentElement); the CSS lives in app/globals.css.
//   • State PERSISTS in localStorage ("switchy-a11y") and is re-applied on mount
//     here AND by a synchronous pre-hydration <head> script in layout.tsx, so a
//     returning user sees their adjustments before first paint (no flash).
//
// PLACEMENT: the FAB pins to the inline-END bottom corner (opposite the
// <AiConcierge> FAB at inline-start), so the two never collide. When the mobile
// <StickyLeadCta> bar shows (it publishes document.body.dataset.leadCta =
// "visible"), this FAB LIFTS above it — the same pattern the concierge FAB uses.
//
// a11y of the widget itself: labelled trigger (aria-haspopup="dialog",
// aria-expanded), a real role="dialog" aria-modal panel with a heading + close (X),
// focus moved in on open / returned to the trigger on close, ESC + click-outside
// close, a focus trap while open, visible focus on every control, and 44px+ tap
// targets. Its own open/close motion respects prefers-reduced-motion.
// ────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useId, useRef, useState } from "react";
import Icon from "@/components/Icon";

// localStorage key — namespaced like the theme guard ("chosech-theme").
const STORAGE_KEY = "switchy-a11y";

// Font-scale clamp (spec: ~90%–160%) and step.
const FONT_MIN = 0.9;
const FONT_MAX = 1.6;
const FONT_STEP = 0.1;

// The persisted settings shape. `fontScale` drives --a11y-font-scale; the rest are
// boolean class toggles on <html>.
interface A11ySettings {
  fontScale: number;
  contrast: boolean;
  underlineLinks: boolean;
  readableFont: boolean;
  noMotion: boolean;
  focusOutline: boolean;
}

const DEFAULTS: A11ySettings = {
  fontScale: 1,
  contrast: false,
  underlineLinks: false,
  readableFont: false,
  noMotion: false,
  focusOutline: false,
};

// Map each boolean setting → the <html> class it applies. Font scaling is handled
// separately (a var + the .a11y-font-scaled marker class). Keep in sync with the
// pre-hydration guard in app/layout.tsx and the CSS in app/globals.css.
const CLASS_MAP: Record<keyof Omit<A11ySettings, "fontScale">, string> = {
  contrast: "a11y-contrast",
  underlineLinks: "a11y-underline-links",
  readableFont: "a11y-readable-font",
  noMotion: "a11y-no-motion",
  focusOutline: "a11y-focus",
};

function clampScale(n: number): number {
  if (!Number.isFinite(n)) return 1;
  return Math.min(FONT_MAX, Math.max(FONT_MIN, Math.round(n * 10) / 10));
}

/** Read + normalize the persisted settings (safe on the server / private mode). */
function readSettings(): A11ySettings {
  if (typeof window === "undefined") return { ...DEFAULTS };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw) as Partial<A11ySettings>;
    return {
      fontScale: clampScale(Number(parsed.fontScale ?? 1)),
      contrast: Boolean(parsed.contrast),
      underlineLinks: Boolean(parsed.underlineLinks),
      readableFont: Boolean(parsed.readableFont),
      noMotion: Boolean(parsed.noMotion),
      focusOutline: Boolean(parsed.focusOutline),
    };
  } catch {
    return { ...DEFAULTS };
  }
}

/** Apply the whole settings object to <html> (classes + the font-scale var). */
function applySettings(s: A11ySettings) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;

  // Font scaling: only mark the root as scaled when it actually differs from 1,
  // so the untouched default never touches the page's base font-size.
  const scaled = s.fontScale !== 1;
  root.style.setProperty("--a11y-font-scale", String(s.fontScale));
  root.classList.toggle("a11y-font-scaled", scaled);

  // Boolean class toggles.
  (Object.keys(CLASS_MAP) as Array<keyof typeof CLASS_MAP>).forEach((key) => {
    root.classList.toggle(CLASS_MAP[key], s[key]);
  });
}

export default function AccessibilityWidget() {
  const [open, setOpen] = useState(false);
  // Settings start at defaults for SSR + first render; the mount effect hydrates
  // them from localStorage. (The pre-hydration <head> guard already applied the
  // visual classes, so there is no flash regardless.)
  const [settings, setSettings] = useState<A11ySettings>(DEFAULTS);
  // Mirrors document.body.dataset.leadCta so the FAB steps above the sticky lead
  // bar — same signal + pattern the <AiConcierge> FAB watches.
  const [leadBarVisible, setLeadBarVisible] = useState(false);

  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  const baseId = useId();
  const titleId = `${baseId}-title`;
  const dialogId = `${baseId}-dialog`;

  // Hydrate persisted settings on mount (defensive re-apply — the guard already
  // ran, but this keeps React state and the DOM in agreement).
  useEffect(() => {
    const loaded = readSettings();
    setSettings(loaded);
    applySettings(loaded);
  }, []);

  // Watch the sticky-lead-bar signal on <body> so the FAB lifts out of the bottom
  // thumb-zone while that bar shows. The bar toggles document.body.dataset.leadCta
  // in its own IntersectionObserver; sync via a MutationObserver + read once.
  useEffect(() => {
    const sync = () =>
      setLeadBarVisible(document.body.dataset.leadCta === "visible");
    sync();
    const mo = new MutationObserver(sync);
    mo.observe(document.body, {
      attributes: true,
      attributeFilter: ["data-lead-cta"],
    });
    return () => mo.disconnect();
  }, []);

  // Persist + apply whenever settings change (after the initial hydrate).
  const persistAndApply = useCallback((next: A11ySettings) => {
    setSettings(next);
    applySettings(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* private mode / storage disabled — the in-session apply still worked. */
    }
  }, []);

  const stepFont = useCallback(
    (dir: 1 | -1) => {
      persistAndApply({
        ...settings,
        fontScale: clampScale(settings.fontScale + dir * FONT_STEP),
      });
    },
    [settings, persistAndApply],
  );

  const resetFont = useCallback(() => {
    persistAndApply({ ...settings, fontScale: 1 });
  }, [settings, persistAndApply]);

  const toggle = useCallback(
    (key: keyof Omit<A11ySettings, "fontScale">) => {
      persistAndApply({ ...settings, [key]: !settings[key] });
    },
    [settings, persistAndApply],
  );

  const resetAll = useCallback(() => {
    const cleared = { ...DEFAULTS };
    setSettings(cleared);
    applySettings(cleared);
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }, []);

  // Close the panel and return focus to the trigger (per WAI-ARIA dialog).
  const closePanel = useCallback(() => {
    setOpen(false);
    triggerRef.current?.focus();
  }, []);

  // Move focus into the panel when it opens (to the first focusable control).
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => {
      const first = panelRef.current?.querySelector<HTMLElement>(
        'button, [href], input, [tabindex]:not([tabindex="-1"])',
      );
      first?.focus();
    }, 20);
    return () => clearTimeout(t);
  }, [open]);

  // ESC closes; TAB is trapped within the panel while open.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        closePanel();
        return;
      }
      if (e.key !== "Tab") return;
      const panel = panelRef.current;
      if (!panel) return;
      const focusables = Array.from(
        panel.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((el) => !el.hasAttribute("disabled"));
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey) {
        if (active === first || !panel.contains(active)) {
          e.preventDefault();
          last.focus();
        }
      } else if (active === last) {
        e.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, closePanel]);

  // Click-outside closes (pointerdown, so it fires before focus shifts).
  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      const target = e.target as Node;
      if (
        panelRef.current?.contains(target) ||
        triggerRef.current?.contains(target)
      ) {
        return;
      }
      closePanel();
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open, closePanel]);

  const pct = Math.round(settings.fontScale * 100);
  const atMin = settings.fontScale <= FONT_MIN + 0.001;
  const atMax = settings.fontScale >= FONT_MAX - 0.001;
  // "Anything on?" — enables/annotates the reset-all affordance.
  const anyActive =
    settings.fontScale !== 1 ||
    settings.contrast ||
    settings.underlineLinks ||
    settings.readableFont ||
    settings.noMotion ||
    settings.focusOutline;

  return (
    <>
      {/* Trigger — floating bottom-END button (opposite the concierge FAB). */}
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? dialogId : undefined}
        aria-label="תפריט נגישות"
        className={[
          // 56px round (h-14 ≥ 44px min-target). z-30 = below the sticky header
          // (z-50) and bottom bars (z-40), matching the concierge FAB tier.
          "fixed z-30 flex h-14 w-14 items-center justify-center rounded-full",
          // Inline-END corner (RTL → physically bottom-left; opposite the
          // concierge's `start-4`) so the two FABs never collide.
          "end-4",
          // Lift above the mobile sticky lead bar while it occupies the bottom
          // (the calc folds in the safe-area inset); otherwise rest at bottom-4.
          leadBarVisible && !open
            ? "bottom-[calc(4.5rem+env(safe-area-inset-bottom))]"
            : "bottom-4 mb-[env(safe-area-inset-bottom)]",
          "transition-[bottom] duration-300 ease-[var(--ease-drawer)] motion-reduce:transition-none",
          // Brand-green chrome (visible in light AND dark via tokens).
          "bg-accent text-accent-contrast shadow-float",
          "interactive press hover:bg-accent-hover",
          "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
        ].join(" ")}
      >
        <AccessibilityGlyph />
      </button>

      {open && (
        <div
          ref={panelRef}
          id={dialogId}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          style={{ ["--popover-origin" as string]: "bottom left" }}
          className={[
            "popover",
            // Pin to the same bottom-END corner as the trigger, above it.
            "fixed bottom-20 end-4 z-40 flex w-[min(20rem,calc(100vw-2rem))] flex-col",
            "max-h-[min(34rem,calc(100vh-7rem))] overflow-y-auto rounded-2xl",
            "border border-border bg-surface text-foreground shadow-float",
          ].join(" ")}
        >
          {/* Header: heading + close (X). */}
          <div className="sticky top-0 flex items-center justify-between gap-2 border-b border-border bg-surface px-4 py-3">
            <h2
              id={titleId}
              className="text-base font-semibold text-foreground"
            >
              התאמות נגישות
            </h2>
            <button
              type="button"
              onClick={closePanel}
              aria-label="סגירת תפריט הנגישות"
              className="interactive press -me-1.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-background hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              <Icon name="close" size={20} aria-hidden="true" />
            </button>
          </div>

          <div className="flex flex-col gap-4 p-4">
            {/* (1) גודל טקסט */}
            <fieldset className="flex flex-col gap-2">
              <legend className="text-sm font-medium text-foreground">
                גודל טקסט
              </legend>
              <div className="flex items-stretch gap-2">
                <button
                  type="button"
                  onClick={() => stepFont(-1)}
                  disabled={atMin}
                  aria-label="הקטנת גודל הטקסט"
                  className="interactive press flex h-11 min-w-11 flex-1 items-center justify-center rounded-lg border border-border text-lg font-semibold text-foreground hover:bg-background disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                  −א
                </button>
                <button
                  type="button"
                  onClick={resetFont}
                  aria-label="איפוס גודל הטקסט"
                  className="interactive press flex h-11 flex-1 items-center justify-center rounded-lg border border-border text-sm font-medium text-foreground hover:bg-background focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                  <span aria-hidden="true">{pct}%</span>
                  <span className="sr-only">איפוס · {pct} אחוז</span>
                </button>
                <button
                  type="button"
                  onClick={() => stepFont(1)}
                  disabled={atMax}
                  aria-label="הגדלת גודל הטקסט"
                  className="interactive press flex h-11 min-w-11 flex-1 items-center justify-center rounded-lg border border-border text-lg font-semibold text-foreground hover:bg-background disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                  +א
                </button>
              </div>
            </fieldset>

            {/* Toggle rows (2)–(6) */}
            <div className="flex flex-col gap-1.5">
              <ToggleRow
                label="ניגודיות גבוהה"
                pressed={settings.contrast}
                onToggle={() => toggle("contrast")}
              />
              <ToggleRow
                label="הדגשת קישורים"
                pressed={settings.underlineLinks}
                onToggle={() => toggle("underlineLinks")}
              />
              <ToggleRow
                label="גופן קריא"
                pressed={settings.readableFont}
                onToggle={() => toggle("readableFont")}
              />
              <ToggleRow
                label="עצירת אנימציות"
                pressed={settings.noMotion}
                onToggle={() => toggle("noMotion")}
              />
              <ToggleRow
                label="הדגשת מיקוד מקלדת"
                pressed={settings.focusOutline}
                onToggle={() => toggle("focusOutline")}
              />
            </div>

            {/* (7) איפוס הכל */}
            <button
              type="button"
              onClick={resetAll}
              disabled={!anyActive}
              className="interactive press flex h-11 items-center justify-center rounded-lg border border-border text-sm font-medium text-foreground hover:bg-background disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              איפוס כל ההתאמות
            </button>

            {/* (8) הצהרת נגישות — link to the existing statement (not reworded). */}
            <a
              href="/accessibility"
              className="flex items-center justify-center gap-1.5 rounded-lg py-1 text-sm font-medium text-accent-text underline underline-offset-2 hover:text-accent-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              <Icon name="info" size={16} aria-hidden="true" />
              הצהרת נגישות
            </a>
          </div>
        </div>
      )}
    </>
  );
}

// A labelled toggle row: full-width real <button> with aria-pressed and a
// visible state pill (check when on). 44px+ tap target; token-driven colors.
function ToggleRow({
  label,
  pressed,
  onToggle,
}: {
  label: string;
  pressed: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={pressed}
      className={[
        "interactive press flex min-h-11 items-center justify-between gap-3 rounded-lg border px-3 py-2 text-start text-sm font-medium",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
        pressed
          ? "border-accent bg-accent text-accent-contrast"
          : "border-border text-foreground hover:bg-background",
      ].join(" ")}
    >
      <span>{label}</span>
      <span
        aria-hidden="true"
        className={[
          "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border",
          pressed
            ? "border-accent-contrast/60 bg-accent-contrast/20"
            : "border-border",
        ].join(" ")}
      >
        {pressed && <Icon name="check" size={14} strokeWidth={2.5} />}
      </span>
    </button>
  );
}

// Universal accessibility symbol (♿-style figure) drawn inline — head + arms +
// seated legs. Uses currentColor so it inherits the FAB's on-accent ink and stays
// visible in light + dark. Decorative (the button carries aria-label="תפריט נגישות").
function AccessibilityGlyph() {
  return (
    <svg
      width={26}
      height={26}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {/* head */}
      <circle cx="12" cy="4" r="1.6" fill="currentColor" stroke="none" />
      {/* arms spread from the shoulders */}
      <path d="M6.5 8.5h11" />
      {/* torso down to the hip/seat */}
      <path d="M12 7v6" />
      {/* seated legs: thigh forward, then shin down */}
      <path d="M12 13h4l1.5 5" />
      <path d="M12 13l-2.2 5" />
    </svg>
  );
}
