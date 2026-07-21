// ────────────────────────────────────────────────────────────────────────────
// /design — the LIVE styleguide & single source of truth for the locked design
// system ("white glass + ink" + a two-accent system: green = ACTION, amber =
// VALUE). It is an INTERNAL reference page: noindex/nofollow (never a public,
// indexable surface), linked from nowhere in the nav.
//
// EVERYTHING ON THIS PAGE IS LIVE. The swatches bind to the real CSS variables
// from globals.css via inline `background:var(--token)` / `color:var(--token)`;
// the type ramp uses the real font tokens (--font-rubik / --font-assistant) and
// the real heading letter-spacing; the components gallery COMPOSES the real
// shipped components (<Icon>, <EmptyState>, <SkeletonCard>) and the real utility
// classes (.card / .bento / .glass / .glow-*). Because nothing is hardcoded,
// this page can never silently drift from the system it documents — re-skin a
// token in globals.css and every swatch here moves with it. It is how every
// future screen stays consistent.
//
// Server component (no client state) except the imported <MotionDemo>, which is
// the only interactive island. Works in light + dark (it inherits the live
// [data-theme] tokens) and is RTL/Hebrew-first like the rest of the site.
// ────────────────────────────────────────────────────────────────────────────

/* eslint-disable react/no-unescaped-entities -- This internal design specimen intentionally displays literal quote syntax. */
import type { Metadata } from "next";
import type { ReactNode } from "react";
import Icon, { type IconName } from "@/components/Icon";
import EmptyState from "@/components/EmptyState";
import SkeletonCard from "@/components/SkeletonCard";
import MotionDemo from "@/components/styleguide/MotionDemo";

// Internal reference page — keep it out of the index entirely.
export const metadata: Metadata = {
  title: "מערכת העיצוב — Switchy AI (פנימי)",
  description:
    "מדריך סגנון חי של מערכת העיצוב הנעולה: צבעים, טיפוגרפיה, מרווחים, תנועה " +
    "ורכיבים. עמוד פנימי, לא לאינדוקס.",
  robots: { index: false, follow: false },
};

// ── Section scaffolding ──────────────────────────────────────────────────────
// A consistent <section> shell: a numbered eyebrow + display heading + lede, so
// every block on the page reads with one hierarchy and rhythm.

function Section({
  n,
  title,
  lede,
  children,
}: {
  n: string;
  title: string;
  lede: string;
  children: ReactNode;
}) {
  return (
    <section className="scroll-mt-20 border-t border-border pt-12">
      <p className="font-display text-sm font-bold tracking-tight text-accent-text">
        {n}
      </p>
      <h2 className="mt-1 font-display text-2xl font-bold tracking-tight text-ink sm:text-3xl">
        {title}
      </h2>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted sm:text-base">
        {lede}
      </p>
      <div className="mt-8">{children}</div>
    </section>
  );
}

// ── 1 · Color tokens ─────────────────────────────────────────────────────────
// Each swatch binds its fill to the REAL CSS variable. We label every token with
// its NAME, its hex (the light-mode value, for reference), and a usage/contrast
// note — so the discipline (green = ACTION, amber = VALUE, never leak) is on the
// page next to the color it governs.

interface Swatch {
  token: string; // CSS var, e.g. "--accent"
  name: string; // human label
  hex: string; // light-mode hex (reference)
  note: string; // usage / contrast note
  /** Render the chip with text in this var (for the *-text role swatches). */
  textVar?: string;
}

function SwatchCard({ s }: { s: Swatch }) {
  return (
    <div className="card overflow-hidden">
      {/* Live fill — pulls straight from the token so it re-skins per theme. */}
      <div
        className="flex h-20 items-end justify-end p-2"
        style={{ background: `var(${s.token})` }}
      >
        {s.textVar && (
          <span
            className="rounded bg-surface/85 px-2 py-0.5 font-display text-xs font-bold"
            style={{ color: `var(${s.textVar})` }}
          >
            אא
          </span>
        )}
      </div>
      <div className="p-3">
        <p className="font-display text-sm font-bold tracking-tight text-ink">
          {s.name}
        </p>
        <code className="mt-0.5 block font-mono text-[0.7rem] text-accent-text">
          var({s.token})
        </code>
        <code className="font-mono text-[0.7rem] text-muted">{s.hex}</code>
        <p className="mt-1.5 text-xs leading-snug text-muted">{s.note}</p>
      </div>
    </div>
  );
}

const SURFACE_TOKENS: Swatch[] = [
  {
    token: "--background",
    name: "Background · רקע",
    hex: "#F5F7F8",
    note: "רקע העמוד — זכוכית לבנה.",
  },
  {
    token: "--surface",
    name: "Surface · משטח",
    hex: "#FFFFFF",
    note: "כרטיסים ולוחות (.card / .bento).",
  },
  {
    token: "--ink",
    name: "Ink · דיו",
    hex: "#111827",
    note: "כותרות, מבנה, כרטיסי hero כהים.",
  },
  {
    token: "--foreground",
    name: "Foreground · טקסט",
    hex: "#0B0F14",
    note: "טקסט גוף ראשי (≈near-black).",
  },
  {
    token: "--muted",
    name: "Muted · משני",
    hex: "#4A5260",
    note: "מטא-דאטה משנית (≥6:1 על לבן).",
  },
  {
    token: "--border",
    name: "Border · גבול",
    hex: "#E5E7EB",
    note: "גבולות hairline.",
  },
  {
    token: "--border-strong",
    name: "Border strong",
    hex: "#222A35",
    note: "גבולות מבניים חזקים.",
  },
];

const ACCENT_TOKENS: Swatch[] = [
  {
    token: "--accent",
    name: "Accent · ACTION (ירוק)",
    hex: "#16A34A",
    note: "מילוי CTA, ניווט פעיל, focus. לא טקסט קטן (3.30:1).",
  },
  {
    token: "--accent-hover",
    name: "Accent hover",
    hex: "#15803D",
    note: "ירוק כהה ל-hover.",
  },
  {
    token: "--accent-text",
    name: "Accent text · קישורים",
    hex: "#0F7A37",
    note: "ירוק לטקסט/קישורים על רקע בהיר (≥4.5:1).",
    textVar: "--accent-text",
  },
  {
    token: "--value",
    name: "Value · VALUE (ירוק)",
    hex: "#16A34A",
    note: "מונו-ירוק: באדג'ים, מצבי 'הכי משתלם'. לא טקסט קטן (3.30:1).",
  },
  {
    token: "--value-text",
    name: "Value text · מספרים",
    hex: "#15803D",
    note: "ירוק לטקסט/מספרי חיסכון על בהיר (≥4.5:1).",
    textVar: "--value-text",
  },
  {
    token: "--danger",
    name: "Danger · שגיאה",
    hex: "#DC2626",
    note: "צבע המצב היחיד מחוץ למערכת הדו-הדגשה.",
  },
  {
    token: "--danger-text",
    name: "Danger text",
    hex: "#B91C1C",
    note: "טקסט שגיאה על בהיר (≥4.5:1).",
    textVar: "--danger-text",
  },
];

// ── 2 · Type scale ───────────────────────────────────────────────────────────
// Live samples using the REAL font tokens + the REAL heading letter-spacing
// (set globally in globals.css for h1–h4). Rubik = display, Assistant = body.

const DISPLAY_RAMP: { tag: string; cls: string; sample: string }[] = [
  { tag: "Display / H1", cls: "text-4xl sm:text-5xl", sample: "חוסכים בלי לוותר" },
  { tag: "H2", cls: "text-3xl", sample: "השוואה אמיתית, בלי קנס" },
  { tag: "H3", cls: "text-2xl", sample: "מסלולי סלולר ואינטרנט" },
  { tag: "H4", cls: "text-xl", sample: "מה מתאים לכם החודש" },
];

const BODY_RAMP: { tag: string; cls: string; sample: string }[] = [
  {
    tag: "Body L",
    cls: "text-base",
    sample: "כל המחירים מתוך הקטלוג האמיתי, בשקלים, בלי נתונים מומצאים.",
  },
  {
    tag: "Body / Default",
    cls: "text-sm",
    sample: "משווים מסלולים מכל הספקים בישראל, ומתחברים — בהסכמתכם בלבד.",
  },
  {
    tag: "Caption / Label",
    cls: "text-xs",
    sample: "מטא-דאטה משנית, הערות מחיר וכיתובים קטנים.",
  },
];

// ── 3 · Spacing scale ────────────────────────────────────────────────────────
// The radius scale is a real token set (--radius-*); spacing below mirrors the
// Tailwind rem steps the pages actually use (rendered live as green bars).

const SPACING: { label: string; rem: string; w: string }[] = [
  { label: "1 · gap-1", rem: "0.25rem", w: "w-1" },
  { label: "2 · gap-2", rem: "0.5rem", w: "w-2" },
  { label: "3 · gap-3", rem: "0.75rem", w: "w-3" },
  { label: "4 · p-4", rem: "1rem", w: "w-4" },
  { label: "6 · p-6", rem: "1.5rem", w: "w-6" },
  { label: "8 · gap-8", rem: "2rem", w: "w-8" },
  { label: "12 · section", rem: "3rem", w: "w-12" },
];

const RADII: { token: string; name: string; px: string }[] = [
  { token: "--radius-sm", name: "sm · chips", px: "8px" },
  { token: "--radius-md", name: "md · buttons/inputs", px: "12px" },
  { token: "--radius-lg", name: "lg · cards (.card)", px: "16px" },
  { token: "--radius-xl", name: "xl · tiles (.bento)", px: "24px" },
];

const SHADOWS: { token: string; name: string }[] = [
  { token: "--shadow-soft", name: "shadow-soft · .elevate-soft" },
  { token: "--shadow-card", name: "shadow-card · .elevate-card" },
  { token: "--shadow-float", name: "shadow-float · .elevate-float" },
];

// ── 5 · Iconography ──────────────────────────────────────────────────────────
const ICONS: IconName[] = [
  "check",
  "chevron",
  "arrow",
  "close",
  "search",
  "star",
  "info",
  "alert",
  "lock",
  "spark",
  "sun",
  "moon",
];

export default function DesignSystemPage() {
  return (
    <main id="main" className="mx-auto w-full max-w-5xl px-4 py-12 sm:px-6 sm:py-16">
      {/* ── Page header ─────────────────────────────────────────────────── */}
      <header>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-accent/30 bg-accent/10 px-3 py-1 text-xs font-semibold text-accent-text">
          <Icon name="spark" size={14} />
          עמוד פנימי · מקור אמת יחיד
        </span>
        <h1 className="mt-4 font-display text-4xl font-bold tracking-tight text-ink sm:text-5xl">
          מערכת העיצוב
        </h1>
        <p className="mt-3 max-w-2xl text-base leading-relaxed text-muted sm:text-lg">
          מדריך סגנון <strong className="text-ink">חי</strong> — כל צבע, גודל טקסט,
          מרווח, עקומת תנועה ורכיב כאן נמשכים מהטוקנים והקומפוננטות האמיתיים
          (<code className="rounded bg-border/60 px-1 font-mono text-[0.85em] text-ink">globals.css</code>{" "}
          + הרכיבים המשותפים). שינוי בטוקן זז כאן אוטומטית. בסיס{" "}
          <strong className="text-ink">זכוכית לבנה + דיו</strong>, והדגשה אחת
          בלבד: <span className="font-semibold text-accent-text">ירוק = פעולה</span>{" "}
          <span className="font-semibold text-value-text">וגם ערך (מונו-ירוק)</span>.
        </p>
      </header>

      <div className="mt-12 space-y-12">
        {/* ── 1 · Color ──────────────────────────────────────────────── */}
        <Section
          n="01"
          title="צבע"
          lede="בסיס זכוכית-לבן + דיו, והדגשה ירוקה אחת ממושמעת. שימו לב להפרדה בין גוון מילוי (fill, סף 3:1) לבין גוון טקסט (-text, סף AA 4.5:1) — הירוק הראשי נכשל כטקסט קטן, ולכן יש -text נפרד."
        >
          <h3 className="mb-3 font-display text-base font-bold tracking-tight text-ink">
            משטחים ומבנה
          </h3>
          <div className="bento-grid !mx-0 !max-w-none">
            {SURFACE_TOKENS.map((s) => (
              <SwatchCard key={s.token} s={s} />
            ))}
          </div>

          <h3 className="mb-3 mt-8 font-display text-base font-bold tracking-tight text-ink">
            הדגשות ומצב
          </h3>
          <div className="bento-grid !mx-0 !max-w-none">
            {ACCENT_TOKENS.map((s) => (
              <SwatchCard key={s.token} s={s} />
            ))}
          </div>

          <div className="mt-6 flex items-start gap-2.5 rounded-lg border border-value/30 bg-value/10 p-3.5 text-sm text-ink">
            <Icon
              name="alert"
              size={18}
              className="mt-0.5 shrink-0 text-value-text"
            />
            <p className="leading-relaxed">
              <strong>משמעת:</strong> ירוק אחד בלבד — לפעולה (CTA / קישור / focus)
              ולערך (מספרי חיסכון / "הכי משתלם"), בשימוש חסכוני. אין ענבר/כתום,
              ואסור לצבוע מחדש צבעי ספק/מותג לפלטת המותג.
            </p>
          </div>
        </Section>

        {/* ── 2 · Typography ────────────────────────────────────────── */}
        <Section
          n="02"
          title="טיפוגרפיה"
          lede="Rubik לכותרות/תצוגה (tracking שלילי הדוק, נטען מ-h1–h4 בגלובלי), Assistant לגוף וכיתובים. דגימות חיות מהטוקנים האמיתיים."
        >
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="card p-6">
              <p className="mb-4 text-xs font-semibold uppercase tracking-wider text-muted">
                Rubik · Display{" "}
                <code className="font-mono normal-case tracking-normal text-accent-text">
                  var(--font-rubik)
                </code>
              </p>
              <div className="space-y-4">
                {DISPLAY_RAMP.map((t) => (
                  <div key={t.tag}>
                    <span className="block text-xs text-muted">{t.tag}</span>
                    <span
                      className={`block font-display font-bold tracking-tight text-ink ${t.cls}`}
                    >
                      {t.sample}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="card p-6">
              <p className="mb-4 text-xs font-semibold uppercase tracking-wider text-muted">
                Assistant · Body{" "}
                <code className="font-mono normal-case tracking-normal text-accent-text">
                  var(--font-assistant)
                </code>
              </p>
              <div className="space-y-4">
                {BODY_RAMP.map((t) => (
                  <div key={t.tag}>
                    <span className="block text-xs text-muted">{t.tag}</span>
                    <span
                      className={`block leading-relaxed text-foreground ${t.cls}`}
                    >
                      {t.sample}
                    </span>
                  </div>
                ))}
                <div>
                  <span className="block text-xs text-muted">Link · קישור</span>
                  <a href="#main" className="text-sm font-medium">
                    קישור בגוון accent-text (≥4.5:1)
                  </a>
                </div>
              </div>
            </div>
          </div>
        </Section>

        {/* ── 3 · Spacing / radius / elevation ──────────────────────── */}
        <Section
          n="03"
          title="מרווחים, רדיוס וגובה"
          lede="סולם המרווחים (rem) שהעמודים משתמשים בו, סולם הרדיוס מהטוקנים (--radius-*), ושכבות הצללה רכות ודיו-טינט (--shadow-*)."
        >
          {/* Spacing bars */}
          <div className="card p-6">
            <p className="mb-4 text-xs font-semibold uppercase tracking-wider text-muted">
              סולם מרווחים
            </p>
            <div className="space-y-2.5">
              {SPACING.map((sp) => (
                <div key={sp.label} className="flex items-center gap-4">
                  <span
                    className={`h-3 shrink-0 rounded bg-accent ${sp.w}`}
                    aria-hidden="true"
                  />
                  <code className="font-mono text-xs text-ink">{sp.label}</code>
                  <code className="font-mono text-xs text-muted">{sp.rem}</code>
                </div>
              ))}
            </div>
          </div>

          {/* Radius */}
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {RADII.map((r) => (
              <div key={r.token} className="card p-4 text-center">
                <div
                  className="mx-auto h-16 w-16 border border-border-strong/40 bg-accent/15"
                  style={{ borderRadius: `var(${r.token})` }}
                  aria-hidden="true"
                />
                <p className="mt-3 font-display text-sm font-bold text-ink">
                  {r.name}
                </p>
                <code className="block font-mono text-[0.7rem] text-accent-text">
                  var({r.token})
                </code>
                <code className="font-mono text-[0.7rem] text-muted">{r.px}</code>
              </div>
            ))}
          </div>

          {/* Elevation */}
          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            {SHADOWS.map((sh) => (
              <div key={sh.token} className="rounded-xl bg-background p-6">
                <div
                  className="flex h-20 items-center justify-center rounded-lg bg-surface"
                  style={{ boxShadow: `var(${sh.token})` }}
                >
                  <code className="font-mono text-[0.7rem] text-muted">
                    var({sh.token})
                  </code>
                </div>
                <p className="mt-3 text-center text-xs text-muted">{sh.name}</p>
              </div>
            ))}
          </div>
        </Section>

        {/* ── 4 · Motion ────────────────────────────────────────────── */}
        <Section
          n="04"
          title="תנועה"
          lede="כללי Emil Kowalski: easing ומשך מוגדרים פעם אחת כטוקנים ונקראים מכל מקום. רוב ה-UI מתחת ל-300ms. הדגמה חיה — לחצו 'הפעל'."
        >
          <MotionDemo />
        </Section>

        {/* ── 5 · Iconography ───────────────────────────────────────── */}
        <Section
          n="05"
          title="אייקונוגרפיה"
          lede="סט קו אחיד <Icon> — שם סמנטי (מה הוא אומר, לא איך הוא נראה), 24×24, stroke=currentColor (יורש צבע → dark-mode + accent), קצוות עגולים, ללא מילוי."
        >
          <div className="card grid grid-cols-3 gap-2 p-6 sm:grid-cols-4 md:grid-cols-6">
            {ICONS.map((name) => (
              <div
                key={name}
                className="flex flex-col items-center gap-2 rounded-lg border border-border bg-background p-4 text-ink"
              >
                <Icon name={name} size={24} />
                <code className="font-mono text-[0.7rem] text-muted">{name}</code>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-muted">
            דקורטיבי כברירת מחדל (aria-hidden); העבירו{" "}
            <code className="rounded bg-border/60 px-1 font-mono text-ink">
              label
            </code>{" "}
            כדי שאייקון עצמאי יוכרז (role="img" + &lt;title&gt;).
          </p>
        </Section>

        {/* ── 6 · Buttons & badges ──────────────────────────────────── */}
        <Section
          n="06"
          title="כפתורים ובאדג'ים"
          lede="ה-CTA הראשי הוא מילוי accent ירוק עם accentGradient/glow (פעולה). באדג' ערך ירוק גם הוא (מונו-ירוק). כל אחד נושא את ה-easing וה-press feedback מהטוקנים."
        >
          <div className="card flex flex-col gap-6 p-6">
            <div className="flex flex-wrap items-center gap-3">
              {/* Primary ACTION — green fill + glow (mirrors the home hero CTA). */}
              <button
                type="button"
                className="interactive press inline-flex items-center justify-center gap-2 rounded-xl border border-accent/40 bg-accent px-6 py-3 font-semibold text-accent-contrast shadow-[var(--glow-accent)] ease-[var(--ease-out)] hover:bg-accent-hover hover:shadow-float"
              >
                להשוואה חינם
                <Icon name="arrow" size={18} />
              </button>
              {/* Secondary — outline ink. */}
              <button
                type="button"
                className="interactive press inline-flex items-center justify-center gap-2 rounded-xl border border-border-strong/40 bg-surface px-6 py-3 font-semibold text-ink ease-[var(--ease-out)] hover:border-accent/40"
              >
                <Icon name="search" size={18} />
                חיפוש מסלול
              </button>
              {/* Ghost link button. */}
              <button
                type="button"
                className="interactive press inline-flex items-center gap-1 rounded-md px-3 py-2 text-sm font-semibold text-accent-text ease-[var(--ease-out)] hover:text-accent-hover"
              >
                עוד פרטים
                <Icon name="chevron" size={16} />
              </button>
            </div>

            <div className="h-px bg-border" />

            <div className="flex flex-wrap items-center gap-3">
              {/* VALUE badge — green pill (savings / best value, mono-green). */}
              <span className="inline-flex items-center gap-1.5 rounded-full border border-value/30 bg-value/10 px-3.5 py-1.5 text-sm font-semibold text-value-text">
                <span className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-value" />
                הכי משתלם
              </span>
              {/* ACTION badge — green. */}
              <span className="inline-flex items-center gap-1.5 rounded-full border border-accent/30 bg-accent/10 px-3.5 py-1.5 text-sm font-semibold text-accent-text">
                <Icon name="check" size={14} />
                מאומת
              </span>
              {/* Neutral / info chip. */}
              <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3.5 py-1.5 text-sm font-medium text-muted">
                <Icon name="info" size={14} />
                ניטרלי
              </span>
              {/* Danger chip — the one state color outside the two accents. */}
              <span className="inline-flex items-center gap-1.5 rounded-full border border-danger/30 bg-danger/10 px-3.5 py-1.5 text-sm font-semibold text-danger-text">
                <Icon name="alert" size={14} />
                שגיאה
              </span>
            </div>
          </div>
        </Section>

        {/* ── 7 · Surfaces (card / bento / glass / glow) ────────────── */}
        <Section
          n="07"
          title="משטחים: card · bento · glass · glow"
          lede="מחלקות העזר האמיתיות מ-globals.css. .card הוא הבסיס; .bento אריח גדול יותר; .glass לזכוכית מטושטשת (במשורה); .glow-* להדגשה דקורטיבית."
        >
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="card p-6">
              <p className="font-display font-bold text-ink">.card</p>
              <p className="mt-1 text-sm text-muted">
                משטח בסיס — גבול רך, צל רך, רדיוס lg.
              </p>
            </div>
            <div className="bento p-6">
              <p className="font-display font-bold text-ink">.bento</p>
              <p className="mt-1 text-sm text-muted">
                אריח — רדיוס xl, צל card. מתאים ל-.bento-grid.
              </p>
            </div>
            <div className="card-interactive card p-6" tabIndex={0}>
              <p className="font-display font-bold text-ink">.card-interactive</p>
              <p className="mt-1 text-sm text-muted">
                hover-lift + focus. ריחפו/מקדו (Tab).
              </p>
            </div>
            <div className="glass rounded-2xl p-6">
              <p className="font-display font-bold text-ink">.glass</p>
              <p className="mt-1 text-sm text-muted">
                זכוכית מטושטשת (BackdropFilter) — לסרגלים צפים, במשורה.
              </p>
            </div>
            <div className="card p-6 glow-accent">
              <p className="font-display font-bold text-ink">.glow-accent</p>
              <p className="mt-1 text-sm text-muted">זוהר ירוק — אנרגיית פעולה.</p>
            </div>
            <div className="card p-6 glow-value">
              <p className="font-display font-bold text-ink">.glow-value</p>
              <p className="mt-1 text-sm text-muted">זוהר ירוק — ערך/win.</p>
            </div>
          </div>
        </Section>

        {/* ── 8 · State components ──────────────────────────────────── */}
        <Section
          n="08"
          title="מצבים: ריק · טעינה"
          lede="כל מסך חייב מצב ריק/טעינה/שגיאה/הצלחה מעוצב. אלה הרכיבים המשותפים האמיתיים <EmptyState> ו-<SkeletonCard>, מורכבים כאן כפי שהם נשלחים."
        >
          <div className="grid gap-4 lg:grid-cols-2">
            {/* Live <EmptyState> with a real Icon glyph (not an emoji). */}
            <div className="card overflow-hidden">
              <div className="border-b border-border bg-background px-4 py-2">
                <code className="font-mono text-xs text-muted">
                  &lt;EmptyState&gt;
                </code>
              </div>
              <EmptyState
                icon={<Icon name="search" size={32} />}
                title="לא נמצאו מסלולים"
                description="לא מצאנו מסלול שתואם בדיוק את מה שחיפשתם. נסו להרחיב את הסינון או לעבור להשוואה המלאה."
                cta={{ label: "להשוואה המלאה", href: "#main" }}
              />
            </div>

            {/* Live <SkeletonCard> loading placeholders. */}
            <div className="card overflow-hidden">
              <div className="border-b border-border bg-background px-4 py-2">
                <code className="font-mono text-xs text-muted">
                  &lt;SkeletonCard&gt;
                </code>
              </div>
              <div className="space-y-4 p-4">
                <SkeletonCard lines={3} />
                <SkeletonCard lines={2} />
              </div>
            </div>
          </div>
        </Section>

        {/* ── Footer note ───────────────────────────────────────────── */}
        <footer className="border-t border-border pt-8 text-center">
          <p className="text-sm text-muted">
            עמוד פנימי · לא לאינדוקס. כל הערכים נמשכים חי מ-{" "}
            <code className="rounded bg-border/60 px-1.5 py-0.5 font-mono text-ink">
              globals.css
            </code>{" "}
            ומהרכיבים המשותפים — אל תקשיחו ערכים חדשים כאן.
          </p>
        </footer>
      </div>
    </main>
  );
}
