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
// PLACEMENT: the trigger is an inline button in the STICKY <SiteHeader>'s end
// cluster (beside the theme toggle + the AiConcierge trigger), per the owner — so
// it stays persistent (the header is sticky top-0) yet never overlaps page content
// the way a bottom-corner FAB did. The panel opens as a fixed overlay just BELOW
// the header. (Mounted inside SiteHeader, not app/layout.tsx.)
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

  // One header popover open at a time: close when a sibling (the AI chat) opens.
  // Plain setOpen(false) — no trigger-refocus (the sibling now owns focus).
  useEffect(() => {
    function onSiblingOpen(e: Event) {
      if ((e as CustomEvent<string>).detail !== "a11y") setOpen(false);
    }
    window.addEventListener("switchy:popover-open", onSiblingOpen as EventListener);
    return () =>
      window.removeEventListener("switchy:popover-open", onSiblingOpen as EventListener);
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
      {/* Trigger — inline 44px round in the SiteHeader end cluster (the ISA mark). */}
      <button
        ref={triggerRef}
        type="button"
        onClick={() => {
          if (open) {
            closePanel();
            return;
          }
          // Announce the open so a sibling header popover (the chat) closes — only
          // one is open at a time.
          window.dispatchEvent(
            new CustomEvent("switchy:popover-open", { detail: "a11y" }),
          );
          setOpen(true);
        }}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? dialogId : undefined}
        aria-label="תפריט נגישות"
        className={[
          // Inline HEADER button (moved out of the bottom-corner FAB, per owner —
          // grouped with the theme toggle so it no longer overlaps page content).
          // A compact 44px round carrying the self-contained ISA graphic (blue disk
          // + white ring + white wheelchair — see the glyph), so no bg token.
          "flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full shadow-sm",
          "interactive press",
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
          style={{ ["--popover-origin" as string]: "top left" }}
          className={[
            "popover",
            // Opens BELOW the sticky header, pinned to the inline-END (RTL: left)
            // corner UNDER the trigger. The inline-end tracks the centered header's
            // gutter (max-w-5xl = 64rem) so on wide screens it descends from the
            // button, not the far viewport edge; folds to 1rem on phones.
            "fixed top-16 z-40 flex w-[min(20rem,calc(100vw-2rem))] flex-col end-[calc(max(0px,(100vw-64rem)/2)+1rem)]",
            "max-h-[min(34rem,calc(100dvh-6rem))] overflow-y-auto rounded-2xl",
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

// The International Symbol of Access (ISA) — the standard blue disk + white ring +
// white wheelchair, drawn inline as ONE self-contained graphic that fills the FAB
// (so it looks identical in light + dark, like a logo). Decorative (the button
// carries aria-label="תפריט נגישות"). Faithful to the owner-supplied ISA image.
function AccessibilityGlyph() {
  return (
    <svg
      viewBox="0 0 64 64"
      className="h-full w-full"
      role="img"
      aria-hidden="true"
    >
      {/* blue disk */}
      <circle cx="32" cy="32" r="32" fill="#1b1c8f" />
      {/* thin white inner ring (matches the ISA) */}
      <circle cx="32" cy="32" r="28.5" fill="none" stroke="#ffffff" strokeWidth="1.7" />
      {/* head */}
      <circle cx="26.5" cy="16.5" r="4.7" fill="#ffffff" />
      {/* body: back → seat → thigh forward → shin down to the footrest, + push arm */}
      <path
        d="M26.5 22 L28.6 38 L44 38 L49.5 49"
        fill="none"
        stroke="#ffffff"
        strokeWidth="4.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M27 27.5 L41 27.5"
        fill="none"
        stroke="#ffffff"
        strokeWidth="4.2"
        strokeLinecap="round"
      />
      {/* the wheel */}
      <circle cx="29.5" cy="42.5" r="13.5" fill="none" stroke="#ffffff" strokeWidth="3" />
    </svg>
  );
}
