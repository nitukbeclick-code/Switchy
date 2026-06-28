#!/usr/bin/env node
/* Generates the per-category SEO landing pages (and refreshes sitemap.xml +
   robots.txt) from the data below + a shared template. No dependencies.
   Run:  node build.js   (from the site/ folder). Commit the generated *.html. */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('node:crypto');

const SITE = 'https://switchy-ai.com';

// Cache-busting fingerprints: the deploy configs (netlify.toml / vercel.json)
// serve *.css/*.js with `Cache-Control: immutable` for a year, so every
// reference carries a content-hash query (?v=<hash>) — a changed file gets a
// new URL and returning visitors fetch it immediately. No file renames needed.
// NOTE: index.html is hand-written (not generated) — when these hashes change,
// update its styles.css/script.js references to match (the build prints them).
const assetHash = (file) =>
  crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname, file))).digest('hex').slice(0, 8);
const CSS_V = assetHash('styles.css');
const JS_V = assetHash('script.js');
const CSS_HREF = `styles.css?v=${CSS_V}`;
const JS_SRC = `script.js?v=${JS_V}`;

// ── Analytics — Google Analytics 4 (free) ───────────────────────────────────
// Live Measurement ID below (mirror it in index.html if you ever change it, then
// rebuild). Custom conversion events (lead_submit, meeting_booked, whatsapp_click,
// …) are sent via gtag() from script.js. NOTE: GA4 sets cookies — add a consent
// banner if you target the EU.
const GA4_ID = 'G-YCTGRVN7SJ';
const analyticsTag = () =>
  `<!-- Google Analytics 4 (gtag.js) + Consent Mode v2 — id mirrored in index.html. -->
  <script async src="https://www.googletagmanager.com/gtag/js?id=${GA4_ID}"></script>
  <script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('consent','default',{ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied',analytics_storage:'denied'});gtag('js',new Date());gtag('config','${GA4_ID}');</script>`;

// ── Lead form backend (Supabase) ─────────────────────────────────────────────
// The anon/publishable key is the PUBLIC client key (RLS-gated, safe to ship
// in static HTML — never the service_role key). Without this, script.js's
// sendLead() silently no-ops and the lead form never persists anything.
const SUPABASE_URL = 'https://orzitfqmlvopujsoyigr.supabase.co';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9yeml0ZnFtbHZvcHVqc295aWdyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA5OTc5NzIsImV4cCI6MjA5NjU3Mzk3Mn0.NY4ZHzR3BAWUxm5as9Z054o8fwcfejAab9SIvduKlhM';
const leadsConfigTag = () =>
  `<script>window.CHOSECH_SUPABASE={url:'${SUPABASE_URL}',anonKey:'${SUPABASE_ANON_KEY}'};</script>`;

// Real plan catalogue, exported from the app via `flutter test tool/export_plans.dart`.
const catalogue = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'plans.json'), 'utf8'));
const plansByCat = {};
for (const p of catalogue.plans) (plansByCat[p.cat] ||= []).push(p);
for (const k of Object.keys(plansByCat)) plansByCat[k].sort((a, b) => a.price - b.price);

// Real, verifiable catalogue counts — derived straight from the exported plan
// data, never hardcoded. Used by the honest trust block (no invented user
// counts / fake reviews: the only numbers we show are the ones we can prove).
const PLAN_COUNT = catalogue.plans.length;
const PROVIDER_COUNT = new Set(catalogue.plans.map((p) => p.provider)).size;
const CATEGORY_COUNT = new Set(catalogue.plans.map((p) => p.cat)).size;

// ── Real catalogue freshness (single source of truth) ────────────────────────
// The "data as of" date comes ONLY from the real catalogue: `catalogue.generated`
// (the export timestamp) is authoritative; we never stamp a fabricated "today".
// Mirrors web/lib/aeo.lastDataDate() — the genuine freshness of the prices, used
// by the visible "מחירים עודכנו" badge, temporalCoverage, AggregateOffer and the
// llms.txt/ai.txt feeds so every freshness signal agrees. If `generated` is ever
// missing we fall back to the newest per-plan `updatedAt` month, then to today —
// always a truthful "checked on" stamp, never an invented future date.
const _catalogueDateSource = (() => {
  if (catalogue.generated) {
    const t = Date.parse(catalogue.generated);
    if (!Number.isNaN(t)) return new Date(t);
  }
  // Fall back to the newest plan `updatedAt` (YYYY-MM) if no export timestamp.
  let best = null;
  for (const p of catalogue.plans) {
    if (typeof p.updatedAt !== 'string') continue;
    const t = Date.parse(p.updatedAt.length === 7 ? `${p.updatedAt}-01` : p.updatedAt);
    if (Number.isNaN(t)) continue;
    if (best == null || t > best) best = t;
  }
  return best != null ? new Date(best) : new Date();
})();
// ISO yyyy-mm-dd (e.g. "2026-06-21") — for <time>, lastmod, datePublished, feeds.
const CATALOGUE_DATE_ISO = _catalogueDateSource.toISOString().slice(0, 10);
// schema.org temporalCoverage month (e.g. "2026-06") — the real catalogue month.
const CATALOGUE_MONTH = CATALOGUE_DATE_ISO.slice(0, 7);
// Hebrew "DD.MM.YYYY" for the visible freshness badge — derived from the SAME date.
const CATALOGUE_DATE_HE = (() => {
  const [y, m, d] = CATALOGUE_DATE_ISO.split('-');
  return `${d}.${m}.${y}`;
})();

// ── Monochrome SVG icon set ─────────────────────────────────────────────────
// Formal brand uses line icons, not emoji (per UI/UX best practice + the
// white-glass/black-ink identity). Icons inherit `currentColor`; sizing/colour
// is owned by CSS (.cat__icon svg / .feature__icon svg / .pill svg ...).
const ICONS = {
  phone: '<rect x="6" y="2.5" width="12" height="19" rx="2.5"/><line x1="10.5" y1="18.5" x2="13.5" y2="18.5"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3c2.6 2.4 4 5.5 4 9s-1.4 6.6-4 9c-2.6-2.4-4-5.5-4-9s1.4-6.6 4-9z"/>',
  tv: '<rect x="3" y="5" width="18" height="12" rx="2"/><path d="M8 21h8M12 17v4"/>',
  home: '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/>',
  plane: '<path d="M21 14.5 14 12V5.5a2 2 0 0 0-4 0V12l-7 2.5V16l7-1.7V19l-2 1.3V22l4-1 4 1v-1.7L14 19v-4.7l7 1.7z"/>',
  cpu: '<rect x="6" y="6" width="12" height="12" rx="2"/><rect x="9.5" y="9.5" width="5" height="5" rx="1"/><path d="M9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7.5V12l3 2"/>',
  chat: '<path d="M21 11.5a8.4 8.4 0 0 1-9 8 9 9 0 0 1-3.8-.8L3 20l1.3-3.9A8 8 0 0 1 3.5 11 8.4 8.4 0 0 1 12 3a8.4 8.4 0 0 1 9 8.5z"/>',
  bot: '<rect x="4" y="8" width="16" height="11" rx="3"/><path d="M12 8V5M8.5 13.5h.01M15.5 13.5h.01M9.5 16.5h5"/><circle cx="12" cy="4" r="1.5"/>',
  transfer: '<path d="M4 8h13l-3.5-3.5M20 16H7l3.5 3.5"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  unlock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 7.9-1"/>',
  savings: '<ellipse cx="12" cy="6" rx="7" ry="3"/><path d="M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6"/><path d="M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6"/>',
  chart: '<path d="M4 4v16h16"/><rect x="7" y="11" width="2.6" height="6"/><rect x="11.7" y="7" width="2.6" height="10"/><rect x="16.4" y="13" width="2.6" height="4"/>',
  shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3z"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
  check: '<circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.5 2.5 5-5"/>',
  sparkle: '<path d="M12 3l1.9 5.6L19 10l-5.1 1.4L12 17l-1.9-5.6L5 10l5.1-1.4z"/>',
  receipt: '<path d="M5 3h14v18l-2.5-1.5L14 21l-2-1.5L10 21l-2.5-1.5L5 21z"/><path d="M9 8h6M9 12h6"/>',
  calculator: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8 7h8M8 12h.01M12 12h.01M16 12h.01M8 16h.01M12 16h.01M16 16h.01"/>',
  signal: '<path d="M5 18v-3M9.5 18v-6M14 18v-9M18.5 18V6"/>',
  people: '<circle cx="9" cy="8" r="3"/><path d="M3.5 20a5.5 5.5 0 0 1 11 0"/><path d="M16 5.5a3 3 0 0 1 0 5M20.5 20a5.5 5.5 0 0 0-3.5-5.1"/>',
  headset: '<path d="M4 13v-1a8 8 0 0 1 16 0v1"/><rect x="3" y="13" width="4" height="6" rx="1.5"/><rect x="17" y="13" width="4" height="6" rx="1.5"/>',
  bolt: '<path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z"/>',
  rocket: '<path d="M5 15c-1.5 1.5-2 5-2 5s3.5-.5 5-2"/><path d="M14.5 4.5C18 1 21 3 21 3s2 3-1.5 6.5L13 16l-5-5 6.5-6.5z"/><circle cx="14.5" cy="9.5" r="1.3"/>',
  video: '<rect x="3" y="7" width="13" height="10" rx="2.5"/><path d="M16 10.5 21 8v8l-5-2.5z"/>',
  pin: '<path d="M12 21s7-6 7-11a7 7 0 0 0-14 0c0 5 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/>',
  note: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 9h6M9 13h6M9 17h4"/>',
  bell: '<path d="M6 9a6 6 0 0 1 12 0c0 6 2 7 2 7H4s2-1 2-7z"/><path d="M10 20a2 2 0 0 0 4 0"/>',
  bulb: '<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.5 10.9c.5.4.8 1 .9 1.6l.1.5h5l.1-.5c.1-.6.4-1.2.9-1.6A6 6 0 0 0 12 3z"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
  star: '<path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 17l-5.2 2.6 1-5.8L3.5 9.7l5.9-.9z"/>',
  scale: '<path d="M12 4v16M7 20h10M5 8h14M5 8l-2.5 6a3 3 0 0 0 5 0L5 8zm14 0l-2.5 6a3 3 0 0 0 5 0L19 8z"/><path d="M12 4 5 8M12 4l7 4"/>',
  building: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 7h.01M15 7h.01M9 11h.01M15 11h.01M9 15h.01M15 15h.01M10 21v-3h4v3"/>',
  book: '<path d="M5 4.5A2.5 2.5 0 0 1 7.5 2H19v17H7.5A2.5 2.5 0 0 0 5 21.5z"/><path d="M5 19.5A2.5 2.5 0 0 1 7.5 17H19"/>',
  sun: '<circle cx="12" cy="12" r="4.2"/><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M19.1 4.9l-1.8 1.8M6.7 17.3l-1.8 1.8"/>',
  moon: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="m4 7 8 6 8-6"/>',
  whatsapp: '<path d="M4 20l1.5-4.2A7.5 7.5 0 1 1 9 19l-5 1z"/><path d="M9 9.2c.2-.6.4-.6.7-.6h.5c.2 0 .4 0 .6.5l.6 1.4c.1.2 0 .4-.1.5l-.4.5c-.1.1-.2.3-.1.5.3.6 1.2 1.6 2 1.9.2.1.4.1.5-.1l.4-.5c.2-.2.4-.2.5-.1l1.3.7c.3.2.3.3.3.5 0 .5-.6 1.2-1.2 1.3-.5.1-1.1.1-2.6-.6-2.1-1-3.4-3.1-3.5-3.3-.1-.2-.6-1.1-.6-2 0-.9.5-1.3.7-1.4z"/>',
  instagram: '<rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17" cy="7" r="1.2" fill="currentColor" stroke="none"/>',
  facebook: '<path d="M14 8h2.5V4.5H14a3.5 3.5 0 0 0-3.5 3.5v2.5H8V14h2.5v6h3.5v-6h2.5l.5-3.5H14V8.2c0-.2.2-.2.2-.2z"/>',
};
// Brand glyph — a compact green-forward "signal/savings" mark used by the nav +
// footer brandmark (replaces the old ✦ text glyph). currentColor + small viewBox
// so it scales with font-size; the rising-bars motif echoes the savings story.
const brandMark = (cls = 'brand__mark') =>
  `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 19V13M11 19V8M17 19v-9"/><path d="M4 9.5 10 5l4 2.5 6-4.5"/><circle cx="20" cy="3" r="1.4" fill="currentColor" stroke="none"/></svg>`;
const EMOJI_TO_ICON = {
  '📱': 'phone', '📲': 'phone', '📞': 'phone', '🌐': 'globe', '🌍': 'globe', '⚽': 'globe',
  '📺': 'tv', '🎬': 'tv', '🎥': 'video', '🏠': 'home', '✈': 'plane', '🧠': 'cpu', '⏰': 'clock',
  '💬': 'chat', '🤖': 'bot', '🚦': 'transfer', '🔄': 'transfer', '🔒': 'lock', '🔓': 'unlock',
  '💰': 'savings', '💸': 'savings', '💳': 'savings', '📊': 'chart', '📈': 'chart', '🛡': 'shield',
  '🔎': 'search', '🔍': 'search', '✅': 'check', '✨': 'sparkle', '🧾': 'receipt', '🧮': 'calculator',
  '🤝': 'check', '📡': 'signal', '📶': 'signal', '👥': 'people', '🎧': 'headset', '🛟': 'headset',
  '⚡': 'bolt', '🔌': 'bolt', '🚀': 'rocket', '📍': 'pin', '📝': 'note', '📋': 'note', '🔔': 'bell',
  '💡': 'bulb', '🛈': 'info', 'ℹ': 'info', '⭐': 'star', '🌟': 'star', '⚖': 'scale', '🏢': 'building',
  '📚': 'book', '📖': 'book', '☀': 'sun', '🌙': 'moon',
};
const svgIcon = (name) =>
  `<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ICONS.sparkle}</svg>`;
// Map an emoji (or icon name) token to inline SVG. Variation selectors stripped.
const iconFor = (token) => {
  if (!token) return '';
  // Strip variation selectors (U+FE00–U+FE0F), ZWJ (U+200D) and the keycap
  // combining enclosure (U+20E3) by codepoint — keeps this source ASCII-clean.
  const strip = new Set([0x200d, 0x20e3]);
  const t = Array.from(String(token))
    .filter((ch) => { const c = ch.codePointAt(0); return !(c >= 0xfe00 && c <= 0xfe0f) && !strip.has(c); })
    .join('');
  const name = ICONS[t] ? t : EMOJI_TO_ICON[t];
  return svgIcon(name || 'sparkle');
};

// Decorative inline-SVG network/signal motif — single-color (currentColor),
// purely ornamental (aria-hidden). Layered behind hero content via .hero-decor;
// the CSS agent owns opacity/position/parallax. Deterministic, no randomness.
const heroDecor = () =>
  `<svg class="hero-decor__svg" viewBox="0 0 600 400" fill="none" stroke="currentColor" aria-hidden="true" preserveAspectRatio="xMidYMid slice">
        <g class="hero-decor__net" stroke-width="1.1" opacity="0.5">
          <path d="M60 320 L180 200 L320 260 L440 130 L560 190"/>
          <path d="M60 120 L200 80 L340 150 L470 70 L560 110"/>
          <path d="M180 200 L200 80M320 260 L340 150M440 130 L470 70"/>
        </g>
        <g class="hero-decor__nodes" fill="currentColor" stroke="none">
          <circle cx="60" cy="320" r="3.5"/><circle cx="180" cy="200" r="4"/><circle cx="320" cy="260" r="3.5"/>
          <circle cx="440" cy="130" r="4"/><circle cx="560" cy="190" r="3.5"/><circle cx="200" cy="80" r="3.5"/>
          <circle cx="340" cy="150" r="3"/><circle cx="470" cy="70" r="3.5"/>
        </g>
        <g class="hero-decor__rings" stroke-width="1.4" fill="none" opacity="0.6">
          <path d="M470 70 a18 18 0 0 1 22 22" stroke-linecap="round"/>
          <path d="M470 70 a30 30 0 0 1 36 36" stroke-linecap="round" opacity="0.6"/>
          <path d="M180 200 a16 16 0 0 0-20 20" stroke-linecap="round"/>
        </g>
      </svg>`;

const categories = [
  {
    slug: 'cellular', name: 'סלולר', icon: '📱',
    title: 'השוואת מסלולי סלולר — חבילות 5G זולות | SWITCHY',
    desc: 'השוו מסלולי סלולר מכל החברות — פלאפון, סלקום, פרטנר, גולן, 019 ועוד. 5G, גלישה ללא הגבלה, ללא התחייבות. מצאו את הזול ביותר וחסכו עד מאות שקלים בשנה.',
    h1: ['השוואת מסלולי ', 'סלולר'],
    intro: 'כל חבילות הסלולר במקום אחד — 5G, גלישה ללא הגבלה, דקות ו-SMS. השוו מחירים מכל החברות ומצאו את המסלול שמתאים בדיוק לכם.',
    bullets: [
      ['💸', 'מחיר אמיתי', 'מסלולים מ-₪15 לחודש — בלי הפתעות בחשבון.'],
      ['⚡', '5G מהיר', 'גלישה ללא הגבלה ברשתות הדור החמישי.'],
      ['🔓', 'ללא התחייבות', 'אפשר לעבור ולבטל בכל עת, בלי קנסות.'],
      ['✈️', 'כולל חו״ל', 'מסלולים עם חבילת גלישה בחו״ל מובנית.'],
    ],
    providers: ['פלאפון', 'סלקום', 'פרטנר', 'הוט מובייל', 'גולן טלקום', '019 מובייל', 'רמי לוי', 'We4G'],
    faq: [
      ['כמה אפשר לחסוך על מסלול סלולר?', 'הרבה לקוחות משלמים ₪100–₪150 על מה שאפשר לקבל ב-₪29–₪49. ההשוואה לוקחת שניות וההמלצה מותאמת לשימוש שלכם.'],
      ['אפשר לשמור על מספר הטלפון?', 'בהחלט. ניוד המספר שומר על המספר הקיים ומתבצע תוך 1–3 ימי עסקים — אנחנו מלווים את התהליך.'],
      ['מה ההבדל בין מסלול עם וללא התחייבות?', 'מסלול ללא התחייבות ניתן לביטול בכל עת. רבים מהמסלולים הזולים היום הם ללא התחייבות בכלל.'],
      ['זה באמת בחינם?', 'כן — אנחנו מקבלים עמלה מחברת התקשורת כשעוברים; ההמלצה ניטרלית ואתם לא משלמים.'],
    ],
  },
  {
    slug: 'internet', name: 'אינטרנט', icon: '🌐',
    title: 'השוואת מחירי אינטרנט וסיב אופטי — SWITCHY',
    desc: 'השוו תשתית אינטרנט וספקים — בזק, הוט, סלקום, פרטנר ועוד. סיב אופטי עד גיגה, מחירי מבצע אמיתיים, בלי התחייבות. מצאו את החבילה המשתלמת.',
    h1: ['השוואת מחירי ', 'אינטרנט'],
    intro: 'תשתית + ספק, סיב אופטי עד גיגה. השוו את כל החבילות — כולל מחירי המבצע ומה קורה אחריו — ובחרו לפי המהירות והמחיר שמתאימים לכם.',
    bullets: [
      ['🚀', 'סיב עד גיגה', 'מהירויות 100Mb עד 1000Mb+ מכל הספקים.'],
      ['🧾', 'מחיר אחרי מבצע', 'אנחנו מראים גם כמה תשלמו כשהמבצע נגמר.'],
      ['🔌', 'תשתית + ספק', 'השוואה מלאה של שני הרכיבים בחשבון.'],
      ['🛡️', 'אמינות ויציבות', 'דירוגי לקוחות אמיתיים לכל ספק.'],
    ],
    providers: ['בזק', 'הוט', 'סלקום', 'פרטנר', 'גולן טלקום', '019', 'רמי לוי'],
    faq: [
      ['מה זה סיב אופטי וכמה זה עולה?', 'סיב אופטי הוא התשתית המהירה והיציבה ביותר, עם מהירויות עד גיגה. מחירי המבצע מתחילים סביב ₪49–₪99 לחודש.'],
      ['למה המחיר קופץ אחרי שנה?', 'הרבה חבילות זולות בשנה הראשונה ואז עולות. SWITCHY מציג את המחיר שאחרי המבצע ומזכיר לכם להשוות שוב לפני שהוא קופץ.'],
      ['אפשר אינטרנט בלי התחייבות?', 'כן, יש ספקים שמציעים חבילות ללא התחייבות — נסמן לכם אותן בהשוואה.'],
      ['זה באמת בחינם?', 'כן — אנחנו מקבלים עמלה מחברת התקשורת כשעוברים; ההמלצה ניטרלית ואתם לא משלמים.'],
    ],
  },
  {
    slug: 'tv', name: 'טלוויזיה', icon: '📺',
    title: 'השוואת חבילות טלוויזיה וסטרימינג — SWITCHY',
    desc: 'השוו חבילות טלוויזיה — yes, הוט, סלקום TV, פרטנר TV, סטינג ועוד. ערוצים, ספורט, VOD ו-Netflix. מצאו את החבילה הכי משתלמת לצפייה שלכם.',
    h1: ['השוואת חבילות ', 'טלוויזיה'],
    intro: 'ערוצים לינאריים, סטרימינג, ספורט ו-VOD. השוו את כל ספקי הטלוויזיה ובחרו חבילה לפי התוכן שאתם באמת צופים בו — בלי לשלם על מה שלא צריך.',
    bullets: [
      ['📡', 'מגוון ערוצים', 'חבילות בסיס ועד פרימיום מכל הספקים.'],
      ['⚽', 'ספורט וסדרות', 'ערוצי ספורט חי ו-VOD עשיר.'],
      ['🎬', 'כולל סטרימינג', 'חבילות שמשלבות Netflix ו-VOD.'],
      ['💰', 'מחיר נמוך', 'חבילות חסכוניות שלא משלמות על עודף.'],
    ],
    providers: ['yes', 'הוט', 'סלקום TV', 'פרטנר TV', 'STING TV', 'NEXT TV', 'FreeTV'],
    faq: [
      ['כמה עולה חבילת טלוויזיה?', 'תלוי בתוכן — חבילות בסיס מתחילות נמוך, חבילות עם ספורט ו-VOD עולות יותר. ההשוואה עוזרת לבחור בדיוק את מה שצריך.'],
      ['אפשר טלוויזיה בלי ממיר?', 'כן, רוב הספקים מציעים אפליקציות סטרימינג לצפייה בכל מסך — נסמן את החבילות הרלוונטיות.'],
      ['אפשר לשלב טלוויזיה עם אינטרנט?', 'בהחלט — חבילה משולבת לרוב זולה יותר מרכישה בנפרד. ראו את עמוד החבילות המשולבות.'],
      ['זה באמת בחינם?', 'כן — אנחנו מקבלים עמלה מחברת התקשורת כשעוברים; ההמלצה ניטרלית ואתם לא משלמים.'],
    ],
  },
  {
    slug: 'triple', name: 'חבילה משולבת', icon: '🏠',
    title: 'השוואת חבילות משולבות (אינטרנט+טלוויזיה+סלולר) — SWITCHY',
    desc: 'חבילה משולבת חוסכת הכי הרבה. השוו טריפל — אינטרנט, טלוויזיה וסלולר ביחד — מכל החברות ומצאו את החבילה המשתלמת ביותר למשפחה.',
    h1: ['השוואת ', 'חבילות משולבות'],
    intro: 'אינטרנט, טלוויזיה וסלולר בחבילה אחת — לרוב המסלול הכי חסכוני. השוו את כל הטריפלים ומצאו את החבילה שמתאימה לבית שלכם.',
    bullets: [
      ['🏠', 'הכל ביחד', 'אינטרנט + טלוויזיה + סלולר בחשבון אחד.'],
      ['💰', 'החיסכון הגדול', 'משולב כמעט תמיד זול מרכישה בנפרד.'],
      ['🎬', 'תוספות שוות', 'חבילות שכוללות Netflix/VOD וספורט.'],
      ['🤝', 'מעבר אחד', 'מעבירים הכל בבת אחת, בליווי מלא.'],
    ],
    providers: ['בזק', 'הוט', 'סלקום', 'פרטנר', 'yes', 'רמי לוי'],
    faq: [
      ['כמה חוסכים בחבילה משולבת?', 'תלוי במה שאתם משלמים היום — במעבר לחבילה משולבת אפשר לחסוך עד ₪1,700 בשנה לעומת רכישת כל שירות בנפרד. ההשוואה מראה את החיסכון המדויק שלכם.'],
      ['מה כולל טריפל?', 'בדרך כלל אינטרנט (תשתית+ספק), טלוויזיה וקו סלולר אחד או יותר — בחשבון אחד ובמחיר אחד.'],
      ['אפשר להתאים את החבילה?', 'כן — אפשר להוסיף קווים, ערוצי ספורט או מהירות גבוהה יותר. ההמלצה שלנו מותאמת לצרכים שלכם.'],
      ['זה באמת בחינם?', 'כן — אנחנו מקבלים עמלה מחברת התקשורת כשעוברים; ההמלצה ניטרלית ואתם לא משלמים.'],
    ],
  },
  {
    slug: 'abroad', name: 'חבילות חו״ל', icon: '✈️',
    title: 'השוואת חבילות גלישה לחו״ל ו-eSIM — SWITCHY',
    desc: 'נוסעים לחו״ל? השוו חבילות גלישה ו-eSIM לכל יעד — אירופה, ארה״ב, אסיה ועוד. מחירים שקופים, הפעלה מיידית, בלי הלם בחשבון.',
    h1: ['השוואת חבילות ', 'חו״ל / eSIM'],
    intro: 'גלישה בחו״ל בלי הפתעות. השוו חבילות eSIM ונדידה לכל יעד — לפי ימים, נפח גלישה ומחיר — והפעילו עוד לפני הטיסה.',
    bullets: [
      ['🌍', 'כל העולם', 'חבילות לאירופה, ארה״ב, אסיה ויעדים גלובליים.'],
      ['📲', 'eSIM מיידי', 'הפעלה דיגיטלית בלי כרטיס פיזי.'],
      ['📶', 'נפח שמתאים', 'מחבילות קלות ועד גלישה כבדה.'],
      ['🧾', 'מחיר שקוף', 'יודעים מראש כמה תשלמו — בלי נדידה יקרה.'],
    ],
    providers: ['Airalo', 'פלאפון', 'סלקום', 'פרטנר', '019'],
    faq: [
      ['מה זה eSIM וזה עובד בטלפון שלי?', 'eSIM הוא כרטיס SIM דיגיטלי. רוב הטלפונים החדשים תומכים — מפעילים בסריקת קוד, בלי כרטיס פיזי.'],
      ['כמה גלישה צריך לטיול?', 'תלוי בשימוש — לניווט ורשתות חברתיות כמה ג״ב לרוב מספיקים. ההשוואה עוזרת לבחור לפי משך הטיול.'],
      ['אפשר לשמור על המספר הישראלי?', 'כן — חבילת eSIM נפרדת לגלישה מאפשרת לשמור על הקו הישראלי לשיחות ו-SMS.'],
      ['זה באמת בחינם?', 'כן — אנחנו מקבלים עמלה מחברת התקשורת כשעוברים; ההמלצה ניטרלית ואתם לא משלמים.'],
    ],
  },
];

// ── "How it works" — the 3-step process, single source of truth ──────────────
// Mirrors the hand-written index.html #how section verbatim, so the homepage
// summary and the dedicated /how-it-works.html page (+ its HowTo JSON-LD) can
// never drift. Each step: [icon token, name, one-line description].
// NOTE: index.html's #how steps must match this copy (it's hand-authored).
const HOW_STEPS = [
  ['📝', 'עונים על שאלון קצר', 'כמה אתם משלמים היום ומה חשוב לכם — מחיר, מהירות, ללא התחייבות. שתי דקות בלבד, בלי להירשם.'],
  ['🔎', 'מקבלים המלצה חכמה', 'המנוע שלנו משווה את כל החברות ומדרג עבורכם את המסלולים — עם הסבר מלא למה כל מסלול דורג.'],
  ['🤝', 'עוברים בליווי מלא', 'נציג חוזר אליכם, וניוד המספר נעשה תוך 1–3 ימי עסקים — בלי עמלות נסתרות ובלי כאב ראש.'],
];

const esc = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

// Safe JSON for embedding INSIDE an inline <script> tag (JSON-LD or a JS literal).
// Escapes `<` so a string like "</script>" in the data can't break out of the
// element (CWE-79), and the U+2028/U+2029 line separators that are valid in JSON
// but illegal mid-string in JS source. Use ONLY for script-context output —
// file writes and other contexts keep plain JSON.stringify.
const jsonForScript = (o) =>
  JSON.stringify(o)
    .replace(/</g, "\\u003c")
    .replace(new RegExp("\\u2028", "g"), "\\u2028")
    .replace(new RegExp("\\u2029", "g"), "\\u2029");

// Display price: prefer the exact advertised price (e.g. 69.90) when it isn't a
// whole shekel; otherwise the rounded `price` int. The int `price` stays the
// source of truth for sorting / min ("from ₪X") math — see plansByCat sort.
const priceText = (p) =>
  p.priceExact != null
    ? (Number.isInteger(p.priceExact) ? p.priceExact : p.priceExact.toFixed(2))
    : p.price;

// Stable URL slug per provider (Hebrew/Latin → ascii).
const PROVIDER_SLUGS = {
  'Xphone': 'xphone', 'סלקום': 'cellcom', '019 מובייל': '019mobile', 'פרטנר': 'partner',
  'גולן טלקום': 'golan', 'רמי לוי': 'rami-levy', 'בזק': 'bezeq', 'הוט מובייל': 'hot-mobile',
  'HOT': 'hot', 'CCC': 'ccc', 'פלאפון': 'pelephone', 'WeCom': 'wecom', 'STING TV': 'sting-tv',
  'וואלה מובייל': 'walla-mobile', 'גילת': 'gilat', 'yes': 'yes', 'NextTV': 'nexttv', 'Airalo eSIM': 'airalo',
};
function providerSlug(name) {
  if (PROVIDER_SLUGS[name]) return PROVIDER_SLUGS[name];
  const ascii = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return ascii || ('p' + Buffer.from(name, 'utf8').toString('hex').slice(0, 10));
}

// Brand-colored avatar per provider (initials in the brand color) — mirrors the
// app's LogoWidget; safe vs. using trademarked logo images.
const LOGO = [
  ['סלקום', '#4527A0', 'סל'], ['פרטנר', '#2E7D32', 'פר'], ['פלאפון', '#1565C0', 'פל'],
  ['גולן', '#00695C', 'גל'], ['הוט מובייל', '#B71C1C', 'הוט'], ['הוט', '#B71C1C', 'הוט'], ['HOT', '#B71C1C', 'HOT'],
  ['Xphone', '#0277BD', 'X'], ['רמי לוי', '#D32F2F', 'רל'], ['WeCom', '#00838F', 'WC'],
  ['019', '#6A1B9A', '019'], ['וואלה', '#E64A19', 'וו'], ['בזק', '#1565C0', 'בז'],
  ['גילת', '#0277BD', 'גי'], ['CCC', '#388E3C', 'CCC'], ['STING', '#AD1457', 'ST'],
  ['yes', '#0D2B6E', 'yes'], ['NextTV', '#E65100', 'N'], ['Airalo', '#FF6F61', 'Air'],
];
// Real provider logo files (in assets/logos/, slug-named). Anything not here
// gracefully falls back to the coloured initials badge below.
const LOGO_FILE = {
  'xphone': 'xphone.png', 'cellcom': 'cellcom.webp', '019mobile': '019mobile.webp', 'partner': 'partner.webp',
  'golan': 'golan.webp', 'rami-levy': 'rami-levy.webp', 'bezeq': 'bezeq.svg', 'hot-mobile': 'hot-mobile.webp',
  'hot': 'hot.svg', 'ccc': 'ccc.png', 'pelephone': 'pelephone.svg', 'wecom': 'wecom.png',
  'sting-tv': 'sting-tv.png', 'walla-mobile': 'walla-mobile.webp', 'gilat': 'gilat.webp', 'yes': 'yes.webp',
  'nexttv': 'nexttv.png', 'airalo': 'airalo.webp',
};
function providerLogo(name, size = 36) {
  const file = LOGO_FILE[providerSlug(name)];
  if (file) {
    // width/height attrs give the browser the intrinsic ratio before CSS
    // loads, so lazy-loaded logos can't shift layout (CLS).
    return `<span class="plogo plogo--img" style="width:${size}px;height:${size}px"><img src="assets/logos/${file}" alt="${esc(name)}" width="${size}" height="${size}" loading="lazy" decoding="async"></span>`;
  }
  let color = '#0F766E';
  let initials = name.trim().slice(0, 2);
  for (const [key, c, ini] of LOGO) {
    if (name.includes(key)) { color = c; initials = ini; break; }
  }
  const fs = initials.length >= 3 ? Math.round(size * 0.3) : Math.round(size * 0.4);
  return `<span class="plogo" style="width:${size}px;height:${size}px;background:${color}1a;color:${color};border-color:${color}40;font-size:${fs}px">${esc(initials)}</span>`;
}

// Render one real plan as a card. Used on category pages and the all-plans page.
const UNIT_HE = { month: 'לחודש', package: 'לחבילה', day: 'ליום', minute: 'לדקה' };
// A simple, explainable "value score" (0–100) for a card badge. It is NOT a
// review rating (every plan has 0 real reviews — see note below); it's a
// price-value heuristic relative to the plan's own category, nudged up by
// flexibility (no commitment), 5G and an included-abroad bundle. Deterministic
// and bounded so the same plan always shows the same number.
function planValueScore(p) {
  const peers = (plansByCat[p.cat] || []).filter((q) => !q.priceUnit || q.priceUnit === p.priceUnit);
  let base = 60;
  if (peers.length > 1) {
    const prices = peers.map((q) => q.price).sort((a, b) => a - b);
    const lo = prices[0];
    const hi = prices[prices.length - 1];
    // Cheaper within the category → higher base (price is ~70% of the score).
    if (hi > lo) base = 50 + Math.round(((hi - p.price) / (hi - lo)) * 40); // 50–90
  }
  let bonus = 0;
  if (p.noCommit) bonus += 4;       // flexibility
  if (p.is5G) bonus += 3;           // future-proof
  if (p.hasAbroad) bonus += 2;      // bundled value
  if (p.after && p.after - p.price > 30) bonus -= 4; // promo that jumps later
  return Math.max(40, Math.min(99, base + bonus));
}

function planCardHtml(p, best) {
  // `best` highlights the value anchor — passed ONLY as an explicit boolean from
  // the single-category listing (sorted cheapest-first), so the label "lowest
  // price" is factual. Strict === true guard: other callers use .map(planCardHtml)
  // which passes the array index as arg 2; that number must never trip the badge.
  const isBest = best === true;
  // priceUnit comes from the app catalogue export (tool/export_plans.dart) —
  // abroad plans mix per-package/day/minute/month pricing, so never assume.
  const unit = UNIT_HE[p.priceUnit] || (p.cat === 'abroad' ? 'לחבילה' : 'לחודש');
  // Full-package details as readable label/value ROWS (not cramped chips):
  // p.specs holds the headline numbers (data/minutes/channels/speed) keyed by a
  // Hebrew label; the structured extras below (setup fee, equipment =
  // router/converter, range extender) are optional — rendered only when a value
  // exists, so a missing field never shows noise. Collect these via the
  // Claude-in-Chrome catalogue pass (the telecom sites 403 headless fetches and
  // hide the data behind "מידע נוסף" buttons), then drop the values into
  // plans.json — no template change needed afterwards.
  const specPairs = Object.entries(p.specs || {}).map(([k, v]) => [k, v]);
  if (p.equipment) specPairs.push(['ציוד', p.equipment]);
  if (p.setupFee) specPairs.push(['התקנה', p.setupFee]);
  if (p.rangeExtender) specPairs.push(['מגדיל טווח', p.rangeExtender]);
  const specs = specPairs
    .map(([k, v]) => `<div class="plan__spec"><span class="plan__spec-k">${k ? esc(k) : 'כולל'}</span><span class="plan__spec-v">${esc(v)}</span></div>`)
    .join('');
  const flags = [];
  if (p.is5G) flags.push('<span class="pflag pflag--5g">5G</span>');
  if (p.noCommit) flags.push('<span class="pflag">ללא התחייבות</span>');
  if (p.hasAbroad) flags.push('<span class="pflag">כולל חו״ל</span>');
  const hasJump = p.after && (p.after - p.price) > 30;
  const after = p.after ? `<span class="plan__after">ואז ₪${p.afterExact != null ? p.afterExact : p.after}</span>` : '';
  // Card variant: the value anchor (cheapest in its category) reads as a budget
  // pick; a richer 5G/abroad plan with a promo-jump reads as a premium pick.
  // These are presentational accents only (A2 styles them); they never change
  // the data, and a plan can be neither.
  const isPremium = !isBest && p.is5G && (p.hasAbroad || hasJump);
  const variant = isBest ? ' plan--budget' : (isPremium ? ' plan--premium' : '');
  // Value score badge — amber "best value" tint only on the category anchor.
  const score = planValueScore(p);
  const scoreBadge = `<span class="plan__score${isBest ? ' plan__score--best' : ''}" title="ציון ערך משוקלל לפי מחיר וגמישות בקטגוריה"><span class="plan__score-num">${score}</span><span class="plan__score-lbl">ציון ערך</span></span>`;
  // NOTE: a plan's "rating" is a fabricated placeholder (every plan has 0 real
  // reviews) — never render it as a star/score. Honest ratings live per-provider
  // and only surface once a real review exists (see provider_ratings.dart).
  const text = esc(`${p.provider} ${p.plan} ${(p.feats || []).join(' ')} ${Object.values(p.specs || {}).join(' ')}`).toLowerCase();
  const waHref = 'https://wa.me/972505037537?text=' + encodeURIComponent('היי, מעניין אותי ' + p.provider + ' - ' + p.plan + ' (₪' + priceText(p) + ')');
  const compareHref = p.id ? `compare.html?p0=${encodeURIComponent(p.id)}` : 'compare.html';
  return `<article class="plan${isBest ? ' plan--best' : ''}${variant}${hasJump ? ' plan--hasjump' : ''}" data-cat="${esc(p.cat)}" data-text="${text}" data-price="${p.price}" data-after="${p.after || ''}" data-haspromo="${p.after ? 'true' : 'false'}" data-5g="${p.is5G}" data-nocommit="${p.noCommit}" data-abroad="${p.hasAbroad}" data-kosher="${p.kind === 'kosher'}" data-provider="${providerSlug(p.provider)}" data-id="${esc(p.id || '')}">
        ${isBest ? '<span class="plan__badge">המחיר הנמוך ביותר</span>' : ''}
        <div class="plan__top"><span class="plan__id">${providerLogo(p.provider)}<a class="plan__provider" href="provider-${providerSlug(p.provider)}.html">${esc(p.provider)}</a></span>${scoreBadge}</div>
        <div class="plan__name">${esc(p.plan)} <span class="plan__net">${esc(p.net)}</span></div>
        ${specs ? `<div class="plan__specs">${specs}</div>` : ''}
        ${flags.length ? `<div class="plan__flags">${flags.join('')}</div>` : ''}
        <div class="plan__bottom"><div class="plan__price"><b>₪${priceText(p)}</b> <span>${unit}</span>${after}</div></div>
        <div class="plan__actions">
          <a class="plan__cta" target="_blank" rel="noopener" href="${esc(waHref)}" aria-label="${esc(`מעוניין/ת ב${p.provider} ${p.plan} — פנייה בוואטסאפ`)}">${iconFor('💬')} מעוניין/ת בוואטסאפ ←</a>
          <a class="plan__compare" href="${compareHref}" title="השוו מסלול זה" aria-label="${esc(`השוו את ${p.provider} ${p.plan}`)}">${svgIcon('scale')}</a>
        </div>
        <button type="button" class="plan__more" data-plan-more="${esc(p.id || '')}" aria-haspopup="dialog" aria-label="${esc(`כל הפרטים על ${p.provider} ${p.plan}`)}">${svgIcon('info')} כל הפרטים על המסלול ←</button>
      </article>`;
}

// Sub-category groups for the Guides mega-menu (and its mobile mirror). Each
// column shows up to 4 top guides for a topic, deep-linking straight into the
// article — so an SEO visitor lands one click from the guide they need rather
// than the flat index. Built lazily from `guides` (declared further down) so it
// reflects any content/guides/*.json articles too. Order matches the brand
// categories: cellular → internet → tv → abroad, plus a general column.
const MEGA_GROUPS = [
  ['סלולר', 'cellular.html'],
  ['אינטרנט', 'internet.html'],
  ['טלוויזיה', 'tv.html'],
  ['חו״ל', 'abroad.html'],
  ['מדריך כללי', 'guides.html'],
];
function megaMenuColumns() {
  return MEGA_GROUPS
    .map(([cat, href]) => {
      const items = guides.filter((g) => g.cat === cat).slice(0, 4);
      if (!items.length) return '';
      const links = items
        .map((g) => `<a href="${esc(g.slug)}.html">${esc(g.h1)}</a>`)
        .join('\n            ');
      const heading = cat === 'מדריך כללי' ? 'כללי' : cat;
      return `          <div class="mega-menu__col">
            <a class="mega-menu__head" href="${href}">${esc(heading)}</a>
            ${links}
          </div>`;
    })
    .filter(Boolean)
    .join('\n');
}
// Compact guide list for the mobile drawer (top general guides — the mega-menu
// hover UI doesn't exist on touch, so we surface a few key links inline).
function mobileGuideLinks() {
  return relatedGuides(null, null, 4)
    .map((g) => `      <a class="nav__mobile-sub" href="${esc(g.slug)}.html">${esc(g.h1)}</a>`)
    .join('\n');
}

const navHtml = (ctaHref) => `  <a class="skip" href="#main">דלג לתוכן</a>
  <header class="nav" id="nav">
    <div class="container nav__inner">
      <a class="brand" href="index.html" aria-label="SWITCHY — דף הבית">
        ${brandMark()}<span class="brand__name">SWITCHY</span>
      </a>
      <nav class="nav__links" aria-label="ניווט ראשי">
        <a href="plans.html">כל החבילות</a>
        <a href="providers.html">ספקים</a>
        <a href="compare.html">השוואה</a>
        <a href="community.html">קהילה</a>
        <a href="book.html">פגישת ייעוץ</a>
        <a href="app.html">האפליקציה</a>
        <div class="mega" data-mega>
          <a href="guides.html" class="mega__trigger" aria-haspopup="true" aria-expanded="false">מדריכים <span class="mega__caret" aria-hidden="true">▾</span></a>
          <div class="mega-menu" role="menu" aria-label="מדריכים לפי נושא">
${megaMenuColumns()}
          </div>
        </div>
        <a href="index.html#calculator">מחשבון</a>
      </nav>
      <button class="theme-toggle" id="themeToggle" type="button" aria-label="מעבר בין מצב בהיר וכהה" aria-pressed="false">
        <span class="theme-toggle__sun" aria-hidden="true">${svgIcon('sun')}</span><span class="theme-toggle__moon" aria-hidden="true">${svgIcon('moon')}</span>
      </button>
      <a class="btn btn--primary nav__cta" href="${ctaHref}">השוו עכשיו</a>
      <button class="nav__toggle" id="navToggle" aria-label="פתיחת תפריט" aria-expanded="false" aria-controls="mobileMenu"><span></span><span></span><span></span></button>
    </div>
    <div class="nav__mobile" id="mobileMenu" hidden>
      <a href="plans.html">כל החבילות</a>
      <a href="providers.html">ספקים</a>
      <a href="compare.html">השוואה</a>
      <a href="community.html">קהילה</a>
      <a href="book.html">תיאום פגישת וידאו</a>
      <a href="app.html">האפליקציה</a>
      <a href="guides.html">כל המדריכים</a>
${mobileGuideLinks()}
      <a href="index.html#calculator">מחשבון</a>
      <a class="btn btn--primary" href="${ctaHref}">השוו עכשיו</a>
    </div>
  </header>`;

// Footer year is computed at build time (Node Date) so the copyright is correct
// even with JS disabled; #year keeps the runtime hook for script.js to refresh
// on a stale cached page, but it's pre-filled here.
const BUILD_YEAR = new Date().getFullYear();
// Human-readable build date (Hebrew) for the "accurate as of <date>" price caveat
// near comparison tables — regenerated on every build so the stamp never goes stale.
const BUILD_DATE_HE = new Date().toLocaleDateString('he-IL', { year: 'numeric', month: 'long', day: 'numeric' });
// Social links — each an icon-only control with an accessible label. Real
// channels only (WhatsApp + email today); kept in one place so footer markup
// stays declarative.
const FOOTER_SOCIAL = [
  ['https://wa.me/972505037537', 'whatsapp', 'וואטסאפ', true],
  ['mailto:hello@chosech.co.il', 'mail', 'אימייל', false],
];
const footerSocial = FOOTER_SOCIAL.map(([href, icon, label, ext]) =>
  `<a class="footer__social" href="${href}"${ext ? ' target="_blank" rel="noopener"' : ''} aria-label="${esc(label)}">${svgIcon(icon)}</a>`).join('');
const footer = `  <footer class="footer">
    <div class="container footer__inner">
      <div class="footer__brand">
        <a class="brand brand--light" href="index.html" aria-label="SWITCHY — דף הבית">${brandMark()}<span class="brand__name">SWITCHY</span></a>
        <p class="footer__tagline">השוואת מחירי תקשורת חכמה. משווים, חוסכים, עוברים — בלי כאב ראש.</p>
        <form class="subscribe" id="subscribeForm" novalidate>
          <label class="subscribe__label" for="subscribeEmail">קבלו עדכוני מחיר ומבצעים</label>
          <div class="subscribe__row">
            <input class="subscribe__input" type="email" id="subscribeEmail" name="email" placeholder="האימייל שלכם" aria-label="כתובת אימייל לעדכונים" autocomplete="email" inputmode="email" required />
            <button class="btn btn--primary subscribe__btn" type="submit">הצטרפו</button>
          </div>
          <label class="subscribe__consent" for="subscribeConsent"><input type="checkbox" id="subscribeConsent" name="consent" required /> אני מאשר/ת קבלת עדכוני מחיר ומבצעים במייל</label>
          <p class="subscribe__note" id="subscribeNote" role="status" aria-live="polite"></p>
        </form>
        <div class="footer__socials" aria-label="ערוצי קשר">${footerSocial}</div>
      </div>
      <nav class="footer__links footer__col" aria-label="קטגוריות">
        <h4>קטגוריות</h4>
        <a href="cellular.html">סלולר</a><a href="internet.html">אינטרנט</a><a href="tv.html">טלוויזיה</a><a href="triple.html">חבילה משולבת</a><a href="abroad.html">חבילות חו״ל</a><a href="plans.html">כל החבילות</a>
      </nav>
      <nav class="footer__links footer__col" aria-label="כלים ומדריכים">
        <h4>כלים מומלצים</h4>
        <a href="compare.html">השוואת מסלולים</a><a href="comparisons.html">השוואות ספקים</a><a href="community.html">קהילה ודירוגים</a><a href="book.html">תיאום פגישת וידאו</a><a href="calc-cellular.html">מחשבון סלולר</a><a href="calc-internet.html">מחשבון אינטרנט</a><a href="providers.html">כל הספקים</a><a href="glossary.html">מילון מונחים</a><a href="guide-switching.html">מדריך מעבר ספק</a><a href="guide-number-port.html">ניוד מספר</a>
      </nav>
      <nav class="footer__links footer__col" aria-label="חיפושים פופולריים">
        <h4>חיפושים פופולריים</h4>
        <a href="cellular-budget.html">סלולר מתחת ל-₪30</a><a href="cellular-5g.html">סלולר 5G</a><a href="internet-fiber-only.html">אינטרנט סיב אופטי</a><a href="internet-giga.html">אינטרנט גיגה</a><a href="plans-no-commitment.html">ללא התחייבות</a><a href="esim-abroad.html">eSIM לחו״ל</a>
      </nav>
      <nav class="footer__links footer__col" aria-label="החברה">
        <h4>החברה</h4>
        <a href="about.html">אודות</a><a href="how-it-works.html">איך זה עובד</a><a href="app.html">האפליקציה</a><a href="guides.html">כל המדריכים</a><a href="faq.html">שאלות נפוצות</a><a href="privacy.html">מדיניות פרטיות</a><a href="terms.html">תנאי שימוש</a><a href="accessibility.html">הצהרת נגישות</a>
        <a href="https://wa.me/972505037537" target="_blank" rel="noopener">וואטסאפ</a>
        <a href="mailto:hello@chosech.co.il">hello@chosech.co.il</a>
      </nav>
    </div>
    <div class="footer__divider" aria-hidden="true"></div>
    <p class="footer__disclosure">גילוי נאות: השירות חינמי לכם. SWITCHY (Switch AI) מקבלת עמלת תיווך מחברות התקשורת כאשר עוברים דרכנו — העמלה אינה משפיעה על המחיר שאתם משלמים ואינה משפיעה על הדירוג. אנחנו מדרגים מסלולים לפי ההתאמה לכם, לא לפי מי שמשלם לנו. <a href="about.html">המתודולוגיה שלנו</a></p>
    <div class="container footer__bottom"><span>© <span id="year">${BUILD_YEAR}</span> SWITCHY · כל הזכויות שמורות</span><span class="footer__made">נבנה באהבה בישראל</span></div>
  </footer>
  <a class="wa-fab" href="https://wa.me/972505037537?text=%D7%94%D7%99%D7%99%2C%20%D7%90%D7%A9%D7%9E%D7%97%20%D7%9C%D7%94%D7%A9%D7%95%D7%95%D7%AA%20%D7%9E%D7%A1%D7%9C%D7%95%D7%9C%D7%99%D7%9D" target="_blank" rel="noopener" aria-label="דברו איתנו בוואטסאפ"><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" width="26" height="26"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.885-9.885 9.885M20.52 3.449C18.24 1.245 15.24 0 12.045 0 5.463 0 .104 5.359.101 11.892c0 2.096.549 4.142 1.595 5.945L0 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.582 0 11.943-5.359 11.945-11.893a11.821 11.821 0 00-3.418-8.452z"/></svg></a>
  <div class="pmodal" id="planModal" role="dialog" aria-modal="true" aria-labelledby="pmodalTitle" hidden>
    <div class="pmodal__backdrop" data-pmodal-close></div>
    <div class="pmodal__panel" role="document">
      <button type="button" class="pmodal__x" data-pmodal-close aria-label="סגירת החלון">✕</button>
      <div class="pmodal__body" id="pmodalBody"></div>
    </div>
  </div>
  <div class="cbanner" id="cookieBanner" role="dialog" aria-label="הסכמה לעוגיות" hidden>
    <p class="cbanner__text">אנחנו משתמשים ב-cookies כדי לנתח שימוש ולשפר את האתר. <a href="privacy.html">מדיניות הפרטיות</a></p>
    <div class="cbanner__actions">
      <button type="button" class="btn btn--ghost cbanner__btn" data-consent="deny">רק חיוני</button>
      <button type="button" class="btn btn--primary cbanner__btn" data-consent="grant">אישור</button>
    </div>
  </div>`;

// Shared lead-capture form. Single source of truth for the markup that used to
// be copy-pasted into every CTA section — so the legal consent block (Privacy
// Protection Regulations + the Spam/Communications Law) can never drift between
// pages. The two MANDATORY consents (terms + privacy) gate submission in
// script.js; the marketing consent is OPTIONAL and unchecked by default (real
// opt-in, never pre-ticked). Pass the page's own submit-button label.
// NOTE: index.html is hand-written — keep its form's consent block in sync.
const leadFormHtml = (submitLabel) => `<form class="cta__form" id="leadForm" novalidate>
          <input type="text" id="leadCompany" name="company" tabindex="-1" autocomplete="off" aria-hidden="true" style="position:absolute;left:-9999px;width:1px;height:1px;opacity:0" />
          <input type="text" id="leadName" name="name" placeholder="שם מלא" aria-label="שם מלא" autocomplete="name" required />
          <input type="tel" id="leadPhone" name="phone" placeholder="טלפון (050-0000000)" aria-label="מספר טלפון" autocomplete="tel" inputmode="tel" required />
          <p class="cta__form-note">נחזור בוואטסאפ או בטלפון • לא נשתף את המספר עם ספקים • הנתונים מוצפנים</p>
          <div class="consent">
            <label class="consent__row" for="consentTerms">
              <input type="checkbox" id="consentTerms" name="consentTerms" required />
              <span>קראתי ואני מסכים/ה ל<a href="terms.html" target="_blank" rel="noopener">תנאי השימוש</a></span>
            </label>
            <label class="consent__row" for="consentPrivacy">
              <input type="checkbox" id="consentPrivacy" name="consentPrivacy" required />
              <span>קראתי ואני מסכים/ה ל<a href="privacy.html" target="_blank" rel="noopener">מדיניות הפרטיות</a></span>
            </label>
            <label class="consent__row" for="consentMarketing">
              <input type="checkbox" id="consentMarketing" name="consentMarketing" />
              <span>אני מעוניין/ת לקבל דיוור שיווקי, מבצעים והטבות (אופציונלי, ניתן לבטל בכל עת)</span>
            </label>
            <label class="consent__row" for="consentPriceAlert">
              <input type="checkbox" id="consentPriceAlert" name="consentPriceAlert" />
              <span>התריעו לי כשיורד מחיר על מסלול שמתאים לי</span>
            </label>
          </div>
          <button class="btn btn--primary btn--lg" type="submit">${esc(submitLabel)}</button>
          ${ctaObjections()}
        </form>`;

// Objection-handling microcopy — the small reassurance chips that sit right
// above the lead form, exactly where hesitation peaks. Every line is an honest,
// already-true fact about the service (no fabricated claims): free because the
// provider pays the referral fee, no commitment, the number is kept on porting,
// and the ranking is neutral. Reused verbatim across every CTA section so the
// promise can never drift. `ico` keys map to the existing svgIcon() set.
const CTA_OBJECTIONS = [
  ['shield', 'חינם לכם — הספק משלם, לא אתם'],
  ['scale', 'המלצה ניטרלית — לפי ההתאמה, לא לפי מי שמשלם'],
  ['check', 'בלי התחייבות · המספר שלכם נשמר בניוד'],
  ['lock', 'לא נשתף את המספר עם ספקים · נתונים מוצפנים'],
];
const ctaObjections = () => `<ul class="cta__objections" aria-label="למה אפשר להירשם בראש שקט">
${CTA_OBJECTIONS.map(([ico, t]) => `          <li>${svgIcon(ico)}<span>${esc(t)}</span></li>`).join('\n')}
        </ul>`;

// Honest trust block — the real-only E-E-A-T strip placed just before a CTA on
// the main conversion pages. EVERYTHING here is verifiable: catalogue counts come
// straight from the exported plan data (PLAN_COUNT / PROVIDER_COUNT /
// CATEGORY_COUNT), the methodology line is the same transparent pitch as the
// about page, the commission line reuses the footer's §7b disclosure wording, and
// the caveat is the same VAT-incl / verify-with-provider note used near every
// price table. No invented user counts, no fake testimonials or ratings.
const trustBlock = () => `    <section class="section trust-block" aria-label="למה אפשר לסמוך עלינו">
      <div class="container">
        <div class="trust-block__inner reveal">
          <header class="trust-block__head">
            <span class="eyebrow">שקיפות מלאה</span>
            <h2>למה אפשר לסמוך על ההשוואה</h2>
          </header>
          <dl class="trust-stats" aria-label="היקף הקטלוג">
            <div class="trust-stat"><dt>מסלולים בהשוואה</dt><dd><span data-count-to="${PLAN_COUNT}">${PLAN_COUNT}</span></dd></div>
            <div class="trust-stat"><dt>חברות תקשורת</dt><dd><span data-count-to="${PROVIDER_COUNT}">${PROVIDER_COUNT}</span></dd></div>
            <div class="trust-stat"><dt>קטגוריות</dt><dd><span data-count-to="${CATEGORY_COUNT}">${CATEGORY_COUNT}</span></dd></div>
          </dl>
          <ul class="trust-points">
            <li>${svgIcon('scale')}<span><b>מתודולוגיה שקופה.</b> אנחנו משווים את כל ${PROVIDER_COUNT} החברות ומדרגים לפי ערך — מחיר, גמישות והמחיר שאחרי המבצע — עם הסבר לכל המלצה. <a href="about.html">המתודולוגיה המלאה ←</a></span></li>
            <li>${svgIcon('shield')}<span><b>גילוי נאות.</b> השירות חינמי לכם. אנחנו מקבלים עמלת תיווך מחברות התקשורת כשעוברים דרכנו — העמלה אינה משפיעה על המחיר שאתם משלמים ואינה משפיעה על הדירוג.</span></li>
            <li>${svgIcon('info')}<span><b>מחירים אמיתיים.</b> המחירים כוללים מע״מ ונכונים למועד עדכון האתר (${BUILD_DATE_HE}). מחירים ותנאים עשויים להשתנות — תמיד כדאי לאמת מול הספק לפני התקשרות.</span></li>
          </ul>
        </div>
      </div>
    </section>`;

// NOTE: the sticky mobile lead CTA is NOT emitted here — script.js injects it at
// runtime (only when a page has a lead form and the viewport is ≤720px), with
// scroll-reveal and auto-hide while the form is in view. Adding a static bar in
// the markup would duplicate that element and fight its CSS contract. The honest
// win on the static site is therefore: give the conversion hubs a real lead form
// (see providersIndexPage) so script.js's sticky bar activates there too.

// Offer price for structured data — the exact advertised figure when present,
// otherwise the rounded int. Always a plain number (schema.org/Offer.price).
const offerPrice = (p) => (p.priceExact != null ? p.priceExact : p.price);

// ── Shared social-card image metadata ───────────────────────────────────────
// Single source of truth for the OG/Twitter image so the dimensions + alt match
// the hand-written index.html (1200×630) on every generated page too.
const OG_IMAGE = `${SITE}/og-image.png`;
const OG_IMAGE_ALT = 'SWITCHY — השוואת מחירי תקשורת חכמה';

// ── Site-wide structured-data identities (Organization + WebSite) ────────────
// Stable @id values let every page reference the same entity (publisher, brand)
// instead of re-declaring it — Google de-dupes by @id and builds a knowledge
// graph from the references. Mirrors the canonical block in index.html; the
// nodes are emitted in each page's @graph via siteGraphNodes() below.
const ORG_ID = `${SITE}/#organization`;
const WEBSITE_ID = `${SITE}/#website`;
// The REAL telecom topics the brand demonstrably covers across its catalogue,
// compare pages and guides — emitted as the Organization's `knowsAbout` so
// knowledge graphs understand the entity's genuine area of expertise (E-E-A-T).
// Each entry maps to a real on-site surface (a compare category or a guide
// subject); nothing here is an invented competency. Mirrors web/lib/schema.ts
// ORG_KNOWS_ABOUT so the desktop + mobile surfaces describe the same entity.
const ORG_KNOWS_ABOUT = [
  'השוואת מסלולי סלולר',
  'השוואת מסלולי אינטרנט',
  'השוואת מסלולי טלוויזיה',
  'השוואת חבילות משולבות (Triple)',
  'השוואת חבילות גלישה בחו״ל',
  'מעבר ספק תקשורת',
  'ניוד מספר טלפון',
];
const orgNode = {
  '@type': 'Organization',
  '@id': ORG_ID,
  name: 'SWITCHY',
  // Canonical wordmark is "SWITCHY"; keep "Switch AI"/"Switchy" too for entity
  // resolution (legacy/alt forms).
  alternateName: ['Switch AI', 'Switchy'],
  url: SITE + '/',
  logo: { '@type': 'ImageObject', url: `${SITE}/favicon.svg` },
  image: OG_IMAGE,
  slogan: 'משווים, חוסכים, עוברים — בלי כאב ראש',
  description: 'השוואת מחירי תקשורת חכמה — סלולר, אינטרנט, טלוויזיה, חבילות וחו״ל.',
  // areaServed: Israel (the only market served); knowsAbout: only topics the
  // site genuinely covers — no fake awards, ratings or founder.
  areaServed: { '@type': 'Country', name: 'IL' },
  knowsAbout: ORG_KNOWS_ABOUT,
  email: 'hello@chosech.co.il',
  // sameAs: ONLY the brand's genuine, owner-confirmed WhatsApp business profile
  // (050-503-7537 / +972 50-503-7537 — the same number in contactPoint below and
  // the visible CTAs). Mirrors web/lib/schema.ts ORG_SAME_AS so the desktop +
  // mobile surfaces resolve to the SAME entity. No social/Wikidata/marketing URLs
  // are invented — a profile is listed here ONLY when it genuinely exists.
  sameAs: ['https://wa.me/972505037537'],
  contactPoint: {
    '@type': 'ContactPoint',
    contactType: 'customer support',
    telephone: '+972505037537',
    email: 'hello@chosech.co.il',
    areaServed: 'IL',
    availableLanguage: ['he'],
  },
};
const websiteNode = {
  '@type': 'WebSite',
  '@id': WEBSITE_ID,
  name: 'SWITCHY',
  url: SITE + '/',
  inLanguage: 'he-IL',
  publisher: { '@id': ORG_ID },
  potentialAction: {
    '@type': 'SearchAction',
    target: { '@type': 'EntryPoint', urlTemplate: `${SITE}/plans.html?q={search_term_string}` },
    'query-input': 'required name=search_term_string',
  },
};
// The two identity nodes, ready to spread into any page's @graph.
const siteGraphNodes = () => [orgNode, websiteNode];

// ── Provider official URLs (Knowledge-Graph sameAs) ──────────────────────────
// Map of provider display name → its REAL official website. Used for `sameAs` on
// the provider Organization nodes so engines resolve our provider entity to the
// authoritative one. Mirrors web/lib/data.ts PROVIDER_OFFICIAL_URLS EXACTLY so the
// desktop + mobile surfaces cite the same verified URLs. HONESTY: every URL here
// is the provider's genuine official site — never a marketing redirect, affiliate,
// or fabrication, and NEVER a guessed Wikidata Q-id. Providers without a verified
// official URL are intentionally omitted (callers skip `sameAs` rather than invent).
const PROVIDER_OFFICIAL_URLS = {
  'בזק': 'https://www.bezeq.co.il',
  'פרטנר': 'https://www.partner.co.il',
  'HOT': 'https://www.hot.net.il',
  'הוט מובייל': 'https://www.hotmobile.co.il',
  'סלקום': 'https://www.cellcom.co.il',
  'yes': 'https://www.yes.co.il',
  'פלאפון': 'https://www.pelephone.co.il',
  'גולן טלקום': 'https://www.golantelecom.co.il',
  'רמי לוי': 'https://www.rl-net.co.il',
  '019 מובייל': 'https://www.019mobile.co.il',
};
// The provider's real official URL by display name, or undefined when none is
// verified. Callers MUST omit `sameAs` when this returns undefined.
const providerOfficialUrl = (name) => PROVIDER_OFFICIAL_URLS[name];

// Build an Organization node for a provider, with `sameAs` to its REAL official
// URL (omitted when none is verified — never fabricated) and `url` to its on-site
// provider page. Stable @id so other graph nodes can reference the same entity.
// Mirrors web/lib/schema.ts providerOrgNode(). We emit NO aggregateRating: every
// provider has 0 real reviews, so a rating would be fabricated.
function providerOrgNode(name) {
  const slug = providerSlug(name);
  const org = {
    '@type': 'Organization',
    '@id': `${SITE}/provider-${slug}.html#org`,
    name,
    url: `${SITE}/provider-${slug}.html`,
  };
  const official = providerOfficialUrl(name);
  if (official) org.sameAs = [official];
  return org;
}

// ── Dataset ("Switchy as the data source" — the telecom price catalogue) ─────
// English alternate name + the real catalogue topics, mirroring web/lib/schema.ts
// (DATASET_ALT_NAME_EN / DATASET_KEYWORDS) so both surfaces describe the SAME
// data entity for cross-language resolution.
const DATASET_ALT_NAME_EN = 'Israel Telecom Price Catalogue — Switchy';
const DATASET_KEYWORDS = [
  'מחירי סלולר',
  'מחירי אינטרנט',
  'מחירי טלוויזיה',
  'חבילות משולבות (Triple)',
  'חבילות גלישה בחו״ל',
  'השוואת מחירי תקשורת',
  'שוק התקשורת בישראל',
];
// Dataset node positioning Switchy as the authoritative, citable data source for
// the Israeli telecom price catalogue. Describes the REAL build-time catalogue
// snapshot we publish — no fabricated trend history. creator + publisher both
// reference the brand Organization via ORG_ID; temporalCoverage is the REAL
// catalogue month (CATALOGUE_MONTH); spatialCoverage is Israel (the only market
// the comparison covers — national framing, never city-specific); license is the
// real /terms page; variableMeasured are the genuine measured fields. NO
// `distribution` is emitted: the static site exposes no public JSON download, and
// inventing one would be dishonest. Mirrors web/lib/schema.ts datasetSchema().
function datasetNode({ name, description, url, measures }) {
  return {
    '@type': 'Dataset',
    name,
    alternateName: DATASET_ALT_NAME_EN,
    description,
    url,
    inLanguage: 'he-IL',
    creator: { '@id': ORG_ID },
    publisher: { '@id': ORG_ID },
    isAccessibleForFree: true,
    license: `${SITE}/terms.html`,
    keywords: DATASET_KEYWORDS,
    temporalCoverage: CATALOGUE_MONTH,
    spatialCoverage: {
      '@type': 'Place',
      name: 'ישראל',
      address: { '@type': 'PostalAddress', addressCountry: 'IL' },
    },
    variableMeasured: (measures || ['מחיר', 'ספק', 'קטגוריה']).map((m) => ({
      '@type': 'PropertyValue',
      name: m,
    })),
  };
}

// schema.org subtype stamped onto every plan Product (via `additionalType`) so
// engines read each offer as a telecommunications service, not a generic product.
// Mirrors web/lib/schema.ts TELECOM_SERVICE_TYPE.
const TELECOM_SERVICE_TYPE = 'https://schema.org/TelecomunicationsService';

// The fee keys that name a genuinely ONE-OFF install/connection charge. Recurring
// equipment rentals (נתב/ממיר/מגדיל טווח) are deliberately excluded so we never
// mis-state a monthly rental as a one-time fee. Mirrors web/lib/schema.ts
// ONE_TIME_FEE_KEYS (the catalogue is byte-identical, so the same keys apply).
const ONE_TIME_FEE_KEYS = ['דמי חיבור', 'חיבור', 'הצטרפות', 'התקנה'];

// Parse a REAL one-time install/connection fee off a plan into a numeric ILS
// amount, truth-only. Returns null when the plan carries no such fee, when the
// value is "free"/non-numeric ("חינם"/"אין"/"עלות מוזלת"/"מהיום להיום"), or when it
// is flagged recurring (a per-month suffix) — so we never fabricate a one-off
// charge or mislabel a monthly rental. Mirrors web/lib/schema.ts oneTimeFeeAmount()
// against the SAME (byte-identical) catalogue, with one deliberate hardening: we
// pull the ₪-anchored amount (the number adjacent to a ₪ sign) rather than the
// first digit anywhere in the string. Some התקנה values carry an apartment-count
// qualifier before the price (e.g. "חינם בבניין; 1-4 דירות ₪499", "...5+ דירות
// ₪499"); a bare first-number grab would mis-emit price:1 / price:5 — a fabricated
// fee. Anchoring on ₪ yields the genuine ₪499 install fee and leaves every other
// case identical to the reference. Currency-less strings (no ₪) return null.
function oneTimeFeeAmount(p) {
  const fees = p.fees || {};
  let raw = null;
  for (const k of ONE_TIME_FEE_KEYS) { if (fees[k] != null) { raw = fees[k]; break; } }
  if (!raw) return null;
  raw = String(raw).replace(/,/g, '');
  // A per-month marker means it is NOT a one-time fee — skip it.
  if (/ל?ח(?:ו|ׄ|״|')?(?:דש)?\b|\/\s*ח|חודש/.test(raw)) return null;
  // The ₪-denominated amount only (prefix "₪499" or suffix "499 ₪") — never a
  // stray apartment-count or payment-term number that isn't the actual fee.
  let m = raw.match(/₪\s*(\d+(?:\.\d+)?)/) || raw.match(/(\d+(?:\.\d+)?)\s*₪/);
  if (!m) return null;
  const amount = Number(m[1]);
  return Number.isFinite(amount) && amount > 0 ? amount : null;
}

// The `priceSpecification` array for a plan's Offer, truth-only:
//  - ALWAYS a UnitPriceSpecification for the recurring monthly base (price,
//    priceCurrency ILS, per-unit referenceQuantity) so engines read the headline
//    as a per-period charge, not an undated lump sum.
//  - PLUS, only when the plan really carries one, a separate one-time
//    PriceSpecification for the install/connection fee (OMITTED when absent —
//    never invented). Mirrors web/lib/schema.ts priceSpecifications().
function planPriceSpecifications(p) {
  const isPerUnit = UNIT_HE[p.priceUnit] || p.cat === 'abroad';
  const specs = [
    {
      '@type': 'UnitPriceSpecification',
      price: offerPrice(p),
      priceCurrency: 'ILS',
      valueAddedTaxIncluded: true,
      ...(isPerUnit
        ? { unitText: UNIT_HE[p.priceUnit] || 'לחבילה' }
        : {
            unitText: 'לחודש',
            billingDuration: 1,
            billingIncrement: 1,
            unitCode: 'MON',
            referenceQuantity: { '@type': 'QuantitativeValue', value: 1, unitCode: 'MON' },
          }),
    },
  ];
  const oneTime = oneTimeFeeAmount(p);
  if (oneTime != null) {
    specs.push({
      '@type': 'PriceSpecification',
      name: 'דמי חיבור/התקנה חד-פעמיים',
      price: oneTime,
      priceCurrency: 'ILS',
      valueAddedTaxIncluded: true,
    });
  }
  return specs;
}

// Build the Offer node for one plan. `seller` is the provider — passed as a
// concrete Organization or an `@id` reference so callers can dedupe. The Offer's
// priceSpecification carries the monthly base + (when real) the one-time
// install/connection fee. Mirrors the offer shape in web/lib/schema.ts planOffers().
function planOfferNode(p, listUrl, seller) {
  return {
    '@type': 'Offer',
    price: offerPrice(p),
    priceCurrency: 'ILS',
    availability: 'https://schema.org/InStock',
    url: listUrl,
    priceSpecification: planPriceSpecifications(p),
    ...(seller ? { seller } : {}),
    ...(p.after != null ? { description: `מחיר היכרות; ואז ₪${p.after}` } : {}),
  };
}

// Build a Product node (with an Offer) for one real plan. We intentionally emit
// NO aggregateRating/review here: every plan has 0 real reviews, so a rating
// would be fabricated — honest structured data carries price/offer only.
//
// `additionalType` stamps the plan as a telecommunications service (not a generic
// product). The provider is referenced as an Organization by its stable `@id`
// (providerOrgNode()'s id) — NO inline per-plan Brand/Organization copies — so on
// graph pages the Product merges with the single emitted provider Organization
// node (the dedup pattern from web/lib/schema.ts). `providerSeen` (a Set passed by
// graph callers) collects the provider Org `@id`s referenced here so the caller
// can emit each provider Organization exactly once alongside the Products.
function planProductNode(p, listUrl, providerSeen) {
  const name = `${p.provider} — ${p.plan}`;
  const feats = (p.feats || []).join(', ');
  const providerId = `${SITE}/provider-${providerSlug(p.provider)}.html#org`;
  if (providerSeen) providerSeen.add(p.provider);
  const ref = { '@type': 'Organization', '@id': providerId, name: p.provider };
  const node = {
    '@type': 'Product',
    additionalType: TELECOM_SERVICE_TYPE,
    name,
    category: (categories.find((c) => c.slug === p.cat) || {}).name || p.cat,
    sku: p.id,
    // brand references the single provider Organization node by @id (no inline
    // per-plan Brand/Organization copies); self-describing so the ref stays valid
    // standalone and merges by @id with the full org on graph pages.
    brand: ref,
    offers: planOfferNode(p, listUrl, ref),
  };
  if (feats) node.description = feats;
  return node;
}

// De-duplicated @graph nodes for a set of plans on one page: ONE Organization per
// provider (emitted once, by stable @id) PLUS one Product per plan (each Product
// references its provider Org by @id via planProductNode). This is the lean-rich
// structured data answer engines consume on plan-bearing pages — it gives every
// listed plan a Product + Offer + priceSpecification while keeping provider
// entities de-duplicated. Mirrors web/lib/schema.ts knowledgeWebSchema()'s pattern.
function planGraphNodes(plans, listUrl) {
  const providerSeen = new Set();
  const products = plans.map((p) => planProductNode(p, listUrl, providerSeen));
  // Provider Organization nodes first so the Products' @id refs resolve to a real
  // node on the page (deduped: one per provider, regardless of plan count).
  const orgs = [...providerSeen].map((name) => providerOrgNode(name));
  return [...orgs, ...products];
}

// De-duplicated Organization nodes (one per provider) for the providers that own
// any of `plans` — for pages that already embed the per-plan Products inside an
// ItemList and only need the provider Org nodes added so those Products' `@id`
// brand/seller refs resolve. Mirrors the single-Organization-per-provider dedup in
// web/lib/schema.ts.
function providerOrgsFor(plans) {
  const seen = new Set();
  const orgs = [];
  for (const p of plans) {
    if (seen.has(p.provider)) continue;
    seen.add(p.provider);
    orgs.push(providerOrgNode(p.provider));
  }
  return orgs;
}

// ItemList of plan Products for a category or provider page (helps Google read
// the page as a structured list of offers).
function plansItemListJsonLd(plans, listUrl, listName) {
  return {
    '@type': 'ItemList',
    name: listName,
    numberOfItems: plans.length,
    itemListElement: plans.map((p, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      item: planProductNode(p, listUrl),
    })),
  };
}

// A category/collection-scoped AggregateOffer: ONE structured "prices range from
// ₪low to ₪high across N plans" node, in ILS, availability InStock — the formal,
// machine-parseable companion to the visible plan ItemList for answer engines.
// Mirrors web/lib/schema.ts categoryAggregateOfferSchema(). HONESTY: low/high/
// offerCount are computed ONLY from the real priced plans handed in (the SAME
// list the page renders), so the schema can never disagree with the page; plans
// without a finite positive price are skipped (they can't honestly set a bound).
// `temporalCoverage` is the REAL catalogue month (CATALOGUE_MONTH). Returns null
// when no priced plan exists so callers omit it rather than emit an empty offer.
function categoryAggregateOfferNode(plans, categoryLabel) {
  const prices = plans
    .map(offerPrice)
    .filter((n) => typeof n === 'number' && Number.isFinite(n) && n > 0);
  if (prices.length === 0) return null;
  const node = {
    '@type': 'AggregateOffer',
    priceCurrency: 'ILS',
    lowPrice: Math.min(...prices),
    highPrice: Math.max(...prices),
    offerCount: prices.length,
    availability: 'https://schema.org/InStock',
    temporalCoverage: CATALOGUE_MONTH,
  };
  if (categoryLabel) node.category = categoryLabel;
  return node;
}

// Visible freshness badge — "מחירים עודכנו DD.MM.YYYY" from the REAL catalogue
// date (CATALOGUE_DATE_HE, derived from catalogue.generated), with a machine-
// readable <time datetime="YYYY-MM-DD">. Rendered on plan-driven templates
// (category, collection, provider) so both humans and answer engines see the
// genuine "data as of" stamp on every price listing — never a hardcoded "today".
const freshnessBadge = () =>
  `<p class="data-fresh" role="note" style="display:inline-flex;align-items:center;gap:7px;margin-top:10px;padding:5px 12px;border:1px solid color-mix(in srgb,currentColor 18%,transparent);border-radius:999px;font-size:.82rem;font-weight:600;opacity:.85"><span aria-hidden="true" style="width:7px;height:7px;border-radius:50%;background:#16a34a;box-shadow:0 0 0 3px color-mix(in srgb,#16a34a 22%,transparent)"></span>מחירים עודכנו <time datetime="${CATALOGUE_DATE_ISO}">${CATALOGUE_DATE_HE}</time></p>`;

function jsonLd(c) {
  const url = `${SITE}/${c.slug}.html`;
  const faq = { '@type': 'FAQPage', mainEntity: c.faq.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) };
  const crumbs = {
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'דף הבית', item: SITE + '/' },
      { '@type': 'ListItem', position: 2, name: c.name, item: url },
    ],
  };
  // Site identity nodes are emitted in the page head; here we add the page's own
  // breadcrumb, FAQ, and a CollectionPage carrying the plan ItemList.
  const catPlans = plansByCat[c.slug] || [];
  // temporalCoverage = the REAL catalogue month so engines read how fresh the
  // listed prices are. The category-scoped AggregateOffer (real min/max/count) is
  // emitted as its OWN top-level @graph node — the formal "prices range from ₪X to
  // ₪Y across N plans" companion to the ItemList (matches the web app, where
  // `offers` is NOT a valid CollectionPage property so the offer stands alone).
  const aggOffer = categoryAggregateOfferNode(catPlans, c.name);
  const collection = { '@type': 'CollectionPage', name: c.title, description: c.desc, url, inLanguage: 'he-IL',
    isPartOf: { '@id': WEBSITE_ID }, publisher: { '@id': ORG_ID },
    temporalCoverage: CATALOGUE_MONTH,
    ...(catPlans.length ? { mainEntity: plansItemListJsonLd(catPlans, url, `מסלולי ${c.name}`) } : {}) };
  const graph = [crumbs, collection, faq];
  // Emit ONE Organization node per provider listed on this page (deduped) so the
  // per-plan Products' `brand`/`seller` @id refs resolve to a real node in the
  // graph — the dedup pattern from web/lib/schema.ts (no inline org duplicates).
  for (const org of providerOrgsFor(catPlans)) graph.push(org);
  if (aggOffer) graph.push(aggOffer);
  return jsonForScript({ '@context': 'https://schema.org', '@graph': graph });
}

// Kamaze-style at-a-glance comparison table for a category. Columns adapt per
// category: cellular shows connection-fee/volume/minutes/abroad; internet shows
// speed/install/range-extender; tv & triple show install. Everything comes from
// the exported plans.json — promo price (price) vs the price-after-period
// (after, else "קבוע"), specs (volume/minutes/speed), optional fees
// (setupFee/equipment/rangeExtender), and feats (the qualitative "מידע נוסף").
// Rendered ABOVE the detailed cards as a quick scan; each row links to the
// provider page and a WhatsApp CTA, mirroring how "כמה זה" lays it out.
// `sectionId` overrides the section's id — provider pages render several tables
// on one page (one per category), so they pass a unique id to avoid duplicate
// `id="compare-table"` (invalid HTML). Category pages omit it and keep the
// original single id, so their output is unchanged.
function comparisonTable(plans, catSlug, sectionId = 'compare-table') {
  if (!plans || plans.length < 2) return '';
  const spec = (p, ...keys) => { for (const k of keys) { const v = (p.specs || {})[k]; if (v) return esc(v); } return ''; };
  const fee = (p, ...keys) => { for (const k of keys) { const v = (p.fees || {})[k]; if (v) return esc(v); } return ''; };
  const afterCell = (p) => (p.after && p.after > p.price)
    ? `<b class="cmp__jump">₪${p.afterExact != null ? p.afterExact : p.after}</b>`
    : `<span class="cmp__fixed">קבוע</span>`;
  const info = (p) => {
    const f = (p.feats || []).filter((x) => x && !/^\d|GB|דק|SMS|מגה|Mb|^5G$/i.test(x));
    const t = f.length ? f.join(' · ') : (p.notes || '');
    return t ? `<span class="cmp__info">${esc(t)}</span>` : '—';
  };
  const waHref = (p) => 'https://wa.me/972505037537?text=' + encodeURIComponent('היי, מעניין אותי ' + p.provider + ' - ' + p.plan);
  const prov = (p) => `<a class="cmp__prov" href="provider-${providerSlug(p.provider)}.html">${providerLogo(p.provider, 26)}<span>${esc(p.provider)}</span></a>`;
  const name = (p) => `<button type="button" class="cmp__name cmp__more" data-plan-more="${esc(p.id || '')}" aria-haspopup="dialog" title="${esc('כל הפרטים — ' + p.plan)}">${esc(p.plan)}</button>`;
  const price = (p) => `<b>₪${priceText(p)}</b>`;
  let head, row;
  if (catSlug === 'internet') {
    head = ['ספק', 'חבילה', 'מחיר מבצע', 'מחיר אחרי תקופה', 'מהירות', 'נתב', 'מגדיל טווח', 'התקנה', 'מידע נוסף'];
    row = (p) => [prov(p), name(p), price(p), afterCell(p), spec(p, 'מהירות', 'גלישה') || '—', fee(p, 'נתב', 'ראוטר') || '—', fee(p, 'מגדיל טווח', 'מרחיב טווח') || '—', fee(p, 'התקנה', 'חיבור') || '—', info(p)];
  } else if (catSlug === 'tv' || catSlug === 'triple') {
    head = ['ספק', 'חבילה', 'מחיר מבצע', 'מחיר אחרי תקופה', 'ממיר', 'נתב', 'התקנה', 'מידע נוסף'];
    row = (p) => [prov(p), name(p), price(p), afterCell(p), fee(p, 'ממיר', 'ממירים') || '—', fee(p, 'נתב', 'ראוטר') || '—', fee(p, 'התקנה', 'חיבור') || '—', info(p)];
  } else if (catSlug === 'abroad') {
    head = ['ספק', 'חבילה', 'מחיר', 'נפח', 'תוקף', 'מידע נוסף'];
    row = (p) => [prov(p), name(p), price(p), spec(p, 'נתונים', 'נפח') || '—', spec(p, 'תוקף', 'ימים') || '—', info(p)];
  } else { // cellular (default)
    head = ['ספק', 'חבילה', 'מחיר מבצע', 'מחיר אחרי תקופה', 'דמי חיבור', 'נפח', 'דקות/SMS', 'חו״ל', 'מידע נוסף'];
    row = (p) => {
      const sms = spec(p, 'SMS');
      const mins = [spec(p, 'דקות'), sms ? sms + ' SMS' : ''].filter(Boolean).join(' · ') || '—';
      const abroad = p.hasAbroad ? (spec(p, 'חו״ל', 'חו"ל') || '✓') : '—';
      return [prov(p), name(p), price(p), afterCell(p), fee(p, 'דמי חיבור') || 'אין', spec(p, 'נתונים', 'נפח') || '—', mins, abroad, info(p)];
    };
  }
  // Highlight the cheapest *regular* plan (plans are price-sorted, so that's the
  // first one whose kind is 'regular') — a data-only/kosher SIM may be cheaper but
  // isn't a like-for-like value anchor, so it never gets the "best value" tint.
  const bestIdx = plans.length > 2 ? Math.max(0, plans.findIndex((p) => (p.kind || 'regular') === 'regular')) : -1;
  // Build every row's cells first, then drop any non-core column that is empty
  // for ALL plans (e.g. internet "מגדיל טווח" before fees are exported) so a
  // category never shows a column of dashes. Columns 0–2 (provider/plan/price)
  // are always kept; the table auto-grows columns once their data lands.
  const rowData = plans.map(row);
  const keep = head.map((_, ci) => ci < 3 || rowData.some((r) => r[ci] && r[ci] !== '—'));
  const ths = head.map((h, i) => keep[i] ? `<th${i === 2 || i === 3 ? ' class="cmp__num"' : ''}>${esc(h)}</th>` : '').join('') + '<th class="cmp__cta" aria-label="פנייה"></th>';
  const trs = plans.map((p, i) => {
    const cells = rowData[i].map((cell, ci) => keep[ci] ? `<td data-th="${esc(head[ci])}"${ci === 2 || ci === 3 ? ' class="cmp__num"' : ''}>${cell}</td>` : '').join('');
    const cta = `<td class="cmp__cta"><a href="${waHref(p)}" target="_blank" rel="noopener" aria-label="${esc('מעוניין/ת ב' + p.provider + ' ' + p.plan + ' בוואטסאפ')}" title="פנייה בוואטסאפ">${svgIcon('chat')}</a></td>`;
    return `              <tr${i === bestIdx ? ' class="cmp__best"' : ''}>${cells}${cta}</tr>`;
  }).join('\n');
  return `
    <section class="section section--tight" id="${sectionId}" aria-label="טבלת השוואת מחירים">
      <div class="container">
        <header class="section__head reveal"><span class="eyebrow">השוואה מהירה</span><h2>טבלת השוואת מחירים</h2><p>כל המסלולים במבט אחד — מחיר מבצע מול המחיר אחרי תקופת המבצע, ומה כלול. ממוין מהזול ביותר.</p></header>
        <div class="cmp-wrap reveal" role="region" aria-label="טבלת השוואה — ניתן לגלול" tabindex="0">
          <table class="cmp">
            <thead><tr>${ths}</tr></thead>
            <tbody>
${trs}
            </tbody>
          </table>
        </div>
        <p class="cmp__caveat">המחירים כוללים מע״מ ונכונים למועד עדכון הטבלה (${BUILD_DATE_HE}). מחירים ותנאים עשויים להשתנות — יש לאמת את הפרטים המלאים מול הספק לפני התקשרות.</p>
      </div>
    </section>`;
}

function page(c) {
  const url = `${SITE}/${c.slug}.html`;
  const bullets = c.bullets.map(([icon, h, p]) => `        <article class="feature feature--check reveal"><span class="feature__icon">${iconFor(icon)}</span><h3>${esc(h)}</h3><p>${esc(p)}</p></article>`).join('\n');
  const chips = c.providers.map((p) => `<span class="chip">${esc(p)}</span>`).join('\n          ');
  const faqs = c.faq.map(([q, a]) => `          <details><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join('\n');
  const catGuides = relatedGuides(c.name, null, 4).map(guideCard).join('\n');
  const catPlans = plansByCat[c.slug] || [];
  // Cards are sorted cheapest-first (plansByCat sort), so card 0 is honestly the
  // lowest price in this category — badge it as the value anchor (only when the
  // list is long enough for the highlight to mean something).
  const planCards = catPlans.map((p, i) => planCardHtml(p, i === 0 && catPlans.length > 2)).join('\n      ');
  const heroStats = (() => {
    const monthly = catPlans.filter((p) => !p.priceUnit || p.priceUnit === 'month');
    if (monthly.length < 3) return '';
    const cheapest = monthly[0].price;
    const maxP = monthly[monthly.length - 1].price;
    const avg = Math.round(monthly.reduce((s, p) => s + p.price, 0) / monthly.length);
    const maxSave = (avg - cheapest) * 12;
    if (maxSave < 100) return '';
    return `<p class="hero__social"><strong><span data-count-to="${monthly.length}">${monthly.length}</span> מסלולים</strong> · החל מ-₪${cheapest}/חודש · חסכו עד <strong>₪<span data-count-to="${maxSave}" data-count-sep="1">${maxSave.toLocaleString()}</span></strong> בשנה לעומת ממוצע קטלוג (₪${avg})</p>`;
  })();
  const cols = (typeof builtCollections !== 'undefined' ? builtCollections : []).filter((col) => col.catSlug === c.slug);
  // Versus pages anchored to this category (e.g. internet → "סיב אופטי מול כבלים")
  // — surfaced as their own strip so the head-to-head comparisons are reachable
  // one click from the category hub (crawl depth + a useful decision shortcut).
  const vers = (typeof builtVersus !== 'undefined' ? builtVersus : []).filter((v) => v.catSlug === c.slug);
  // Provider-vs-provider head-to-heads anchored to this category, surfaced in the
  // same "ראש בראש" strip so both topic-vs and provider-vs comparisons are one
  // click from the category hub (+ the comparisons hub for the full set).
  const provVers = (typeof builtProviderVs !== 'undefined' ? builtProviderVs : []).filter((v) => v.catSlug === c.slug);
  const versChips = [
    ...vers.map((v) => `<a class="chip" href="${v.slug}.html">${svgIcon('scale')} ${esc(v.h1)}</a>`),
    ...provVers.map((v) => `<a class="chip" href="${v.slug}.html">${svgIcon('scale')} ${esc(v.a.provider)} מול ${esc(v.b.provider)}</a>`),
  ];
  const versStrip = versChips.length ? `
    <section class="section" aria-label="השוואות ראש בראש">
      <div class="container">
        <header class="section__head reveal"><span class="eyebrow">ראש בראש</span><h2>השוואות פופולריות ב${esc(c.name)}</h2></header>
        <div class="providers__row" style="justify-content:center">
          ${versChips.join('\n          ')}
        </div>
        <div style="text-align:center;margin-top:16px"><a class="btn btn--ghost" href="comparisons.html">לכל ההשוואות ←</a></div>
      </div>
    </section>` : '';
  const colsStrip = cols.length ? `
    <section class="section" aria-label="אוספים">
      <div class="container">
        <header class="section__head reveal"><span class="eyebrow">קיצורי דרך</span><h2>אוספים פופולריים ב${esc(c.name)}</h2></header>
        <div class="providers__row" style="justify-content:center">
          ${cols.map((col) => `<a class="chip" href="${col.slug}.html">${esc(col.h1)}</a>`).join('\n          ')}
        </div>
      </div>
    </section>` : '';
  // Category pages share the canonical head() — og:type 'website' (a hub of
  // offers, not an article); jsonLd(c) supplies breadcrumb + CollectionPage +
  // FAQ + plan ItemList, while head() adds the site-wide Organization/WebSite.
  return `<!DOCTYPE html>
<html lang="he" dir="rtl">
${head(c.title, c.desc, url, jsonLd(c), false, 'website')}
<body id="top">
${nav}
  <main id="main">
    <section class="lead-hero lead-hero--split">
      <div class="hero-decor" aria-hidden="true" data-parallax="0.18">${heroDecor()}</div>
      <div class="container lead-hero__grid">
        <div class="lead-hero__text">
          <p class="crumbs"><a href="index.html">דף הבית</a> ← ${esc(c.name)}</p>
          <span class="pill pill--ico">${iconFor(c.icon)} השוואה חינם · בלי התחייבות</span>
          <h1>${esc(c.h1[0])}<span class="hl">${esc(c.h1[1])}</span></h1>
          <p>${esc(c.intro)}</p>
          <p class="hero__trust-note">חינם — אנחנו מקבלים עמלה מהספק, לא מכם</p>
          ${heroStats}
          <div class="hero__cta">
            <a class="btn btn--primary btn--lg" href="#cta">השוו ותחסכו ←</a>
            ${['cellular', 'internet', 'tv', 'triple'].includes(c.slug) ? `<a class="btn btn--ghost btn--lg" href="calc-${c.slug}.html">${svgIcon('calculator')} מחשבון חיסכון</a>` : '<a class="btn btn--ghost btn--lg" href="how-it-works.html">איך זה עובד?</a>'}
          </div>
        </div>
        <div class="lead-hero__media" aria-hidden="false">
          <figure class="app-shot app-shot--hero">
            <img src="assets/app/shot-results.webp" alt="${esc(`אפליקציית SWITCHY — השוואת מסלולי ${c.name} עם ציון התאמה וחיסכון`)}" width="390" height="844" loading="lazy" decoding="async" />
          </figure>
        </div>
      </div>
    </section>

    <section class="providers" aria-label="ספקים">
      <div class="container">
        <p class="providers__title">משווים את כל הספקים ב${esc(c.name)}</p>
        <div class="providers__row">
          ${chips}
        </div>
      </div>
    </section>

${comparisonTable(catPlans, c.slug)}

    <section class="section" id="plans">
      <div class="container">
        <header class="section__head reveal"><span class="eyebrow">${catPlans.length} מסלולים</span><h2>כל המסלולים — בפירוט מלא</h2><p>אותם מסלולים כמו בטבלה, עם כל הפרטים וכפתור פנייה ישיר.</p>${freshnessBadge()}</header>
        <div class="plan-grid">
      ${planCards}
        </div>
      </div>
    </section>

${versStrip}
${colsStrip}
    <section class="section section--alt">
      <div class="container">
        <header class="section__head reveal"><span class="eyebrow">מה כדאי לבדוק</span><h2>איך בוחרים נכון ${esc(c.name)}</h2></header>
        <div class="features">
${bullets}
        </div>
      </div>
    </section>

    <section class="section" id="faq">
      <div class="container faq">
        <header class="section__head reveal"><span class="eyebrow">שאלות נפוצות</span><h2>שאלות על ${esc(c.name)}</h2></header>
        <div class="faq__list reveal">
${faqs}
        </div>
      </div>
    </section>

    <section class="section" aria-label="מדריכים שימושיים">
      <div class="container">
        <header class="section__head reveal"><span class="eyebrow">כדאי לדעת</span><h2>מדריכים שימושיים</h2></header>
        <div class="guide-cards guide-cards--4">
${catGuides}
        </div>
      </div>
    </section>

${trustBlock()}
    <section class="cta" id="cta">
      <div class="container cta__inner reveal">
        <h2>מוכנים לחסוך על ${esc(c.name)}?</h2>
        <p>השאירו פרטים ונחזור אליכם עם ההשוואה וההמלצה — חינם, בלי התחייבות.</p>
        ${leadFormHtml('קבלו המלצה אישית תוך 2 דקות ←')}
        <p class="cta__note" id="leadNote" role="status" aria-live="polite"></p>
        <a class="cta__wa" href="https://wa.me/972505037537" target="_blank" rel="noopener">${svgIcon('chat')}מעדיפים וואטסאפ? דברו איתנו</a>
      </div>
    </section>
  </main>
${footer}
  ${leadsConfigTag()}
  <script src="${JS_SRC}" defer></script>
</body>
</html>
`;
}

// ── Guides (content / SEO) ───────────────────────────────────────────────────
const guides = [
  {
    slug: 'guide-switching', cat: 'מדריך כללי', date: '2026-06-01', read: 6,
    title: 'המדריך המלא למעבר ספק תקשורת — בלי כאב ראש (2026) | SWITCHY',
    desc: 'כל מה שצריך לדעת לפני שמחליפים ספק סלולר/אינטרנט: ניוד מספר, מה לבדוק, כמה זמן זה לוקח וטעויות נפוצות שעולות כסף.',
    h1: 'המדריך המלא למעבר ספק תקשורת — בלי כאב ראש',
    tldr: 'מעבר ספק לוקח דקות מהצד שלכם, המספר נשמר, ואין קנסות אם אין התחייבות. הדבר היחיד שחשוב באמת: לבדוק כמה אתם משלמים היום מול מה שיש בשוק — ההפרש מגיע למאות שקלים בשנה.',
    sections: [
      { h2: 'למה בכלל לעבור?', p: ['רוב האנשים נשארים אצל אותו ספק שנים, בזמן שהמחירים בשוק צונחים. מסלול שעלה ₪150 לפני שלוש שנים נמכר היום ב-₪29–₪49 עם יותר גלישה. פער של ₪100 בחודש הוא ₪1,200 בשנה — בלי שעשיתם כלום חוץ מלהישאר.'] },
      { h2: 'מה לבדוק לפני שעוברים', ul: ['כמה אתם משלמים היום — תוציאו את החשבון האחרון.', 'האם יש לכם התחייבות פעילה (ואם כן, עד מתי).', 'מה באמת חשוב לכם: מחיר, מהירות, גלישה בחו״ל, ללא התחייבות.', 'המחיר שאחרי המבצע — לא רק מחיר השנה הראשונה.'] },
      { h2: 'איך עובד ניוד המספר', p: ['ניוד מספר הוא תהליך מוסדר ומפוקח: אתם בוחרים ספק חדש, הוא מבצע את הניוד מול הספק הישן, והמספר הקיים שלכם עובר אליו. אין צורך לבטל ידנית מול הספק הישן — הניוד עושה זאת עבורכם.'] },
      { h2: 'כמה זמן זה לוקח?', p: ['בסלולר הניוד מתבצע לרוב תוך יום-יומיים. באינטרנט וטלוויזיה זה 1–3 ימי עסקים, לעיתים עם תיאום טכנאי. בכל מקרה — אתם ממשיכים להיות מחוברים עד שהמעבר הושלם.'] },
      { h2: 'טעויות נפוצות שעולות כסף', ul: ['להתמקד רק במחיר השנה הראשונה ולהתעלם מהקפיצה אחריה.', 'לא לבדוק התחייבות קיימת ולשלם קנס מיותר.', 'לבחור חבילה גדולה מדי "ליתר ביטחון" במקום לפי השימוש האמיתי.', 'לשכוח להשוות שוב כשנגמר המבצע — כאן נכנסת התראת החידוש של SWITCHY.'] },
    ],
    faq: [
      ['כמה זמן לוקח מעבר ספק?', 'בסלולר הניוד מתבצע לרוב תוך יום-יומיים; באינטרנט וטלוויזיה 1–3 ימי עסקים, לעיתים עם תיאום טכנאי. אתם נשארים מחוברים עד שהמעבר מושלם.'],
      ['האם המספר שלי נשמר במעבר?', 'כן. ניוד המספר שומר על המספר הקיים — הספק החדש מבצע את הניוד מול הספק הישן, בלי שתצטרכו לבטל ידנית.'],
      ['האם אשלם קנס אם אעבור?', 'רק אם יש לכם התחייבות פעילה. הרבה מהמסלולים היום הם ללא התחייבות כלל — בדקו מול הספק לפני שאתם עוברים.'],
    ],
  },
  {
    slug: 'guide-cellular', cat: 'סלולר', date: '2026-06-03', read: 5,
    title: 'איך לבחור מסלול סלולר ב-2026 — המדריך המלא | SWITCHY',
    desc: 'כמה GB באמת צריך? 4G מול 5G, התחייבות מול גמישות, מסלולי משפחה ומלכודת המבצע — כל מה שצריך כדי לבחור מסלול סלולר חכם ולא לשלם יותר מדי.',
    h1: 'איך לבחור מסלול סלולר ב-2026',
    tldr: 'לרוב האנשים מספיק מסלול 5G ללא הגבלה בטווח ₪29–₪49, ללא התחייבות. אל תשלמו על "יותר ביטחון" — שלמו לפי השימוש האמיתי, ובדקו תמיד את המחיר שאחרי המבצע.',
    sections: [
      { h2: 'כמה גלישה אתם באמת צריכים?', p: ['רוב המשתמשים צורכים 10–50GB בחודש. כיום מסלולים רבים מציעים גלישה ללא הגבלה במחיר נמוך, כך שברוב המקרים אין סיבה להתלבט — מסלול ללא הגבלה פותר את השאלה. אם אתם גולשים מעט, מסלול בסיסי וזול יספיק.'] },
      { h2: '4G מול 5G — האם זה משנה?', p: ['5G מהיר יותר ויציב יותר באזורים עמוסים. ההפרש במחיר היום זניח, ולכן אם הטלפון שלכם תומך — אין סיבה לא לבחור 5G. בפריפריה כדאי לוודא כיסוי של הספק הספציפי.'] },
      { h2: 'התחייבות מול גמישות', p: ['רוב המסלולים המשתלמים היום הם ללא התחייבות — כלומר אפשר לעזוב בכל רגע. זה נותן לכם כוח: אם המחיר קופץ, פשוט עוברים. הימנעו מהתחייבות ארוכה אלא אם היא מגיעה עם הטבה משמעותית.'] },
      { h2: 'מספר קווים ומשפחה', p: ['אם יש כמה קווים בבית, שווה לבדוק מסלולי משפחה או פשוט לחבר כמה קווים זולים בנפרד — לעיתים זה יוצא זול יותר ממסלול "משפחתי" ארוז. השוו את שתי האפשרויות.'] },
      { h2: 'מלכודת המבצע', p: ['הטריק הנפוץ: מחיר נמוך לשנה ואז קפיצה. זה לא בהכרח רע — אבל תכננו מראש. סמנו את תאריך סיום המבצע (SWITCHY עושה זאת אוטומטית ומזכיר ~21 יום לפני) כדי להשוות שוב ולא לשלם את המחיר המלא.'] },
    ],
    faq: [
      ['כמה גלישה צריך במסלול סלולר?', 'רוב המשתמשים צורכים 10–50GB בחודש. כיום מסלולים רבים מציעים גלישה ללא הגבלה במחיר נמוך, כך שברוב המקרים אין סיבה להתלבט.'],
      ['האם כדאי 5G או שמספיק 4G?', '5G מהיר ויציב יותר באזורים עמוסים, וההפרש במחיר היום זניח. אם הטלפון תומך — אין סיבה לא לבחור 5G.'],
      ['כמה עולה מסלול סלולר משתלם?', 'לרוב האנשים מספיק מסלול 5G ללא הגבלה בטווח ₪29–₪49, ללא התחייבות. תמיד בדקו גם את המחיר שאחרי המבצע.'],
    ],
  },
  {
    slug: 'guide-fiber', cat: 'אינטרנט', date: '2026-06-05', read: 5,
    title: 'סיב אופטי מול כבלים: מה ההבדל וכמה זה עולה? | SWITCHY',
    desc: 'מה זה סיב אופטי, במה הוא עדיף על כבלים ו-ADSL, איזו מהירות באמת צריך, ההבדל בין תשתית לספק, וכמה זה עולה — כולל מלכודת המבצע.',
    h1: 'סיב אופטי מול כבלים: מה ההבדל וכמה זה עולה?',
    tldr: 'סיב אופטי הוא התשתית המהירה והיציבה ביותר, ומחירי המבצע מתחילים סביב ₪49–₪99. לרוב הבתים מהירות של 300–500Mb יותר ממספיקה. זכרו שאתם משלמים על שני רכיבים — תשתית + ספק — והשוו את שניהם.',
    sections: [
      { h2: 'מה זה סיב אופטי?', p: ['סיב אופטי (פייבר) מעביר נתונים דרך אור, מה שמאפשר מהירויות גבוהות מאוד (עד גיגה ומעלה) עם יציבות גבוהה והשהיה נמוכה — מצוין לעבודה מהבית, גיימינג וסטרימינג 4K.'] },
      { h2: 'סיב מול כבלים מול ADSL', ul: ['סיב אופטי: המהיר והיציב ביותר, מומלץ כשזמין.', 'כבלים (HFC): מהיר וזמין נרחב, אך לעיתים מאט בשעות עומס.', 'ADSL: ישן ואיטי — כדאי לעבור ממנו אם יש אלטרנטיבה.'] },
      { h2: 'איזו מהירות באמת צריך?', p: ['לבית ממוצע עם כמה מכשירים, 300–500Mb נותנים חוויה מצוינת. גיגה (1000Mb) משתלם רק לבתים עם הרבה משתמשים כבדים במקביל. אל תשלמו על גיגה אם אתם לא באמת צורכים אותו.'] },
      { h2: 'תשתית מול ספק — ההבדל שמבלבל', p: ['חשבון האינטרנט מורכב משניים: חברת התשתית (שמביאה את הסיב לבית) וספק האינטרנט (ISP). אפשר לבחור כל אחד בנפרד, ולעיתים חבילה מאוחדת זולה יותר. SWITCHY משווה את שני הרכיבים יחד.'] },
      { h2: 'מחירים ומלכודת המבצע', p: ['מחירי הסיב במבצע מתחילים נמוך ואז עולים אחרי 12 חודשים. בדקו תמיד מה המחיר הקבוע, לא רק מחיר ההיכרות — וקבעו תזכורת להשוות שוב לפני שהמבצע נגמר.'] },
    ],
    faq: [
      ['מה ההבדל בין סיב אופטי לכבלים?', 'סיב אופטי הוא התשתית המהירה והיציבה ביותר, עם מהירויות עד גיגה והשהיה נמוכה. כבלים מהירים וזמינים נרחב אך לעיתים מאטים בשעות עומס.'],
      ['איזו מהירות אינטרנט באמת צריך?', 'לבית ממוצע עם כמה מכשירים, 300–500Mb נותנים חוויה מצוינת. גיגה משתלם רק לבתים עם הרבה משתמשים כבדים במקביל.'],
      ['כמה עולה סיב אופטי?', 'מחירי המבצע מתחילים סביב ₪49–₪99 לחודש. זכרו שאתם משלמים על שני רכיבים — תשתית + ספק — ושהמחיר עולה בדרך כלל אחרי 12 חודשים.'],
    ],
  },
  {
    slug: 'guide-5g', cat: 'סלולר', date: '2026-06-06', read: 4,
    title: 'מתי באמת כדאי לעבור ל-5G? (2026) | SWITCHY',
    desc: 'מה זה 5G, מה ההבדל האמיתי מ-4G בשימוש יומיומי, מתי שווה לעבור ומתי זה סתם — וכמה זה עולה היום. מדריך כן בלי הייפ שיווקי.',
    h1: 'מתי באמת כדאי לעבור ל-5G?',
    tldr: 'אם הטלפון שלכם תומך ב-5G והמחיר זהה או קרוב למסלול 4G — אין סיבה לא לעבור, במיוחד באזורים עירוניים עמוסים. אבל אל תשלמו פרמיה גבוהה רק בשביל הכותרת: רוב המשתמשים לא ירגישו הבדל דרמטי בגלישה רגילה.',
    sections: [
      { h2: 'מה זה בעצם 5G?', p: ['5G הוא הדור החמישי של רשתות הסלולר. הוא תוכנן כדי לספק מהירויות גבוהות יותר, השהיה (latency) נמוכה יותר ויכולת להחזיק הרבה יותר מכשירים מחוברים באותו אזור בו-זמנית. בפועל המשמעות העיקרית למשתמש הביתי היא רשת שמתפקדת טוב יותר גם כשהרבה אנשים גולשים סביבכם.'] },
      { h2: 'מה ההבדל האמיתי מ-4G ביום-יום?', ul: ['גלישה ושיתוף בזמן אירועים עמוסים (מופעים, אצטדיון, מרכזי קניות) — כאן ההבדל מורגש.', 'הורדות גדולות וסטרימינג באיכות גבוהה — מהיר ויציב יותר, אך גם 4G טוב לרוב מספיק.', 'גלישה רגילה, רשתות חברתיות וניווט — לרוב לא תרגישו שינוי דרמטי.', 'צריכת סוללה — בחלק מהמכשירים 5G עשוי לצרוך מעט יותר, אך הפער הצטמצם בדורות החדשים.'] },
      { h2: 'מתי כדאי לעבור — ומתי פחות', p: ['אם אתם גרים או עובדים באזור עירוני צפוף, מורידים קבצים גדולים או רגישים לעומסי רשת — 5G ישפר לכם את החוויה. לעומת זאת, אם אתם בעיקר גולשים קלות וצורכים מעט נתונים, השדרוג לא בהכרח ישנה לכם משהו מורגש.'] },
      { h2: 'הטלפון והכיסוי שלכם', p: ['שני תנאים צריכים להתקיים: שהמכשיר שלכם תומך ב-5G, ושיש כיסוי 5G באזור שבו אתם נמצאים רוב היום. הכיסוי משתנה בין הספקים ובין אזורים, ובמיוחד בפריפריה כדאי לבדוק את מפת הכיסוי של הספק הספציפי לפני שמתלהבים.'] },
      { h2: 'וכמה זה עולה?', p: ['היום הפער במחיר בין מסלולי 4G ל-5G הצטמצם מאוד, ובמקרים רבים מסלול 5G עולה כמו מסלול 4G או רק מעט יותר. הכלל פשוט: אם ההפרש זניח — קחו 5G; אם משלמים עליו פרמיה גבוהה — שאלו את עצמכם אם אתם באמת תרגישו אותה. בכל מקרה בדקו את המחיר שאחרי תקופת המבצע, לא רק את מחיר ההיכרות.'] },
    ],
    faq: [
      ['האם 5G באמת מהיר יותר מ-4G?', 'כן, במיוחד באזורים עירוניים עמוסים ובהורדות גדולות. בגלישה רגילה, רשתות חברתיות וניווט רוב המשתמשים לא ירגישו הבדל דרמטי.'],
      ['מתי כדאי לעבור ל-5G?', 'אם הטלפון שלכם תומך, יש כיסוי 5G באזור שלכם, וההפרש במחיר זהה או קרוב למסלול 4G — אין סיבה לא לעבור.'],
      ['האם 5G צורך יותר סוללה?', 'בחלק מהמכשירים 5G עשוי לצרוך מעט יותר, אך הפער הצטמצם מאוד בדורות החדשים.'],
    ],
  },
  {
    slug: 'guide-esim', cat: 'חו״ל', date: '2026-06-07', read: 5,
    title: 'מדריך eSIM לחו״ל — איך לבחור חבילה לכל יעד | SWITCHY',
    desc: 'מה זה eSIM, למה זה נוח בנסיעה לחו״ל, איך בוחרים חבילה לפי יעד וכמות גלישה, ומה לבדוק לפני שקונים — בלי הפתעות ובלי חשבון רומינג מנופח.',
    h1: 'מדריך eSIM לחו״ל — איך לבחור חבילה לכל יעד',
    tldr: 'eSIM הוא כרטיס SIM דיגיטלי שמותקן בטלפון בלי כרטיס פיזי — מושלם לחו״ל: מתקינים מראש, נוחתים ומחוברים. בחרו חבילה לפי היעד ולפי כמות הגלישה האמיתית שלכם, ושמרו את הקו הישראלי למקרי חירום. כמעט תמיד זה זול בהרבה מרומינג רגיל.',
    sections: [
      { h2: 'מה זה eSIM ולמה זה נוח בחו״ל', p: ['eSIM הוא כרטיס SIM דיגיטלי המוטמע בטלפון. במקום להחליף כרטיס פיזי, אתם מפעילים חבילת גלישה דרך קוד או אפליקציה — לרוב עוד לפני שיצאתם מהבית. כשאתם נוחתים, הטלפון מתחבר אוטומטית לרשת המקומית, בלי לחפש חנות סים בשדה התעופה ובלי להוציא את הקו הישראלי.'] },
      { h2: 'מה צריך כדי להשתמש ב-eSIM', ul: ['טלפון שתומך ב-eSIM (רוב הדגמים מהשנים האחרונות תומכים — בדקו בהגדרות).', 'חיבור אינטרנט בזמן ההתקנה (Wi-Fi בבית מספיק).', 'דרכון/יעד ברור — חבילות נמכרות לפי מדינה או אזור.', 'מקום לקו הישראלי — eSIM פועל לצד הסים הקיים, כך שתמשיכו לקבל שיחות/SMS למספר שלכם.'] },
      { h2: 'איך בוחרים חבילה לפי יעד', p: ['ראשית החליטו אם אתם מטיילים במדינה אחת או בכמה. ליעד בודד עדיף חבילה מקומית, ולטיול רב-מדינתי (למשל אירופה) חבילה אזורית שמכסה כמה מדינות בבת אחת תהיה לרוב פשוטה וזולה יותר מכמה חבילות נפרדות. בדקו תמיד שהמדינות שאתם מבקרים בהן באמת נכללות.'] },
      { h2: 'כמה גלישה לקחת', ul: ['שימוש קל (ניווט, וואטסאפ, מיילים): כמה GB לשבוע מספיקים בדרך כלל.', 'שימוש בינוני (רשתות חברתיות, מפות, תמונות): תכננו יותר, או חבילה עם אפשרות הטענה.', 'שימוש כבד (סטרימינג, שיתוף וידאו, hotspot ללפטופ): קחו חבילה גדולה או ללא הגבלה — לעיתים זול יותר מלהטעין שוב ושוב.', 'טיפ: רוב הצריכה הכבדה אפשר לדחות ל-Wi-Fi במלון, וכך לקחת חבילה קטנה וזולה יותר.'] },
      { h2: 'מה לבדוק לפני שקונים', p: ['ודאו שהיעד נכלל בכיסוי, שתוקף החבילה מכסה את כל ימי הטיול, ומה קורה כשהגלישה נגמרת — האם היא נחסמת או שאפשר להטעין בקלות. השוו את העלות הכוללת מול מה שספק הסלולר הישראלי גובה ברומינג; לרוב ה-eSIM יוצא זול משמעותית, אך תמיד שווה לבדוק לפני שיוצאים.'] },
    ],
    faq: [
      ['מה זה eSIM והאם הטלפון שלי תומך?', 'eSIM הוא כרטיס SIM דיגיטלי המוטמע בטלפון. רוב הדגמים מהשנים האחרונות תומכים — אפשר לבדוק בהגדרות. מפעילים בסריקת קוד, בלי כרטיס פיזי.'],
      ['האם אשמור על המספר הישראלי בחו״ל?', 'כן. ה-eSIM פועל לצד הסים הקיים, כך שתמשיכו לקבל שיחות ו-SMS למספר הישראלי בזמן שאתם גולשים על החבילה המקומית.'],
      ['כמה גלישה לקחת לטיול?', 'לשימוש קל (ניווט, וואטסאפ) כמה GB לשבוע מספיקים. לשימוש כבד קחו חבילה גדולה או ללא הגבלה — לעיתים זול יותר מלהטעין שוב ושוב.'],
    ],
  },
  {
    slug: 'guide-cancel-commitment', cat: 'מדריך כללי', date: '2026-06-08', read: 5,
    title: 'איך לבטל התחייבות בלי לשלם קנס | SWITCHY',
    desc: 'מתי בכלל יש קנס יציאה, איך בודקים אם יש לכם התחייבות פעילה, ומה אפשר לעשות כדי לעבור ספק בלי לשלם מיותר. הכוונה כללית ידידותית — לא ייעוץ משפטי.',
    h1: 'איך לבטל התחייבות בלי לשלם קנס',
    tldr: 'לפני שעוברים — בדקו אם בכלל יש לכם התחייבות פעילה וכמה היא עוד נמשכת. אם אין התחייבות, אתם חופשיים לעבור בלי קנס. אם יש, לעיתים עדיף לסיים אותה לפני שעוברים, או לבדוק אם החיסכון אצל הספק החדש מצדיק זאת. זו הכוונה כללית, לא ייעוץ משפטי — בכל מקרה ספציפי בדקו מול הספק שלכם.',
    sections: [
      { h2: 'קודם כול — האם בכלל יש לכם התחייבות?', p: ['הרבה אנשים מניחים שהם "כלואים" אצל הספק, אבל בפועל חלק גדול מהמסלולים היום הם ללא התחייבות כלל. במצב כזה אתם יכולים לעבור מתי שתרצו בלי שום קנס. לכן הצעד הראשון תמיד: לברר אם קיימת התחייבות פעילה ועד מתי — ולא להניח.'] },
      { h2: 'איך בודקים אם יש התחייבות פעילה', ul: ['הסתכלו בחשבונית או בחוזה ההצטרפות — שם לרוב מצוין אם יש תקופת התחייבות.', 'התקשרו לשירות הלקוחות ושאלו ישירות: "האם יש לי התחייבות, ועד איזה תאריך?"', 'בקשו לקבל בכתב (מייל/הודעה) את מועד סיום ההתחייבות ואת הסכום שייגבה אם תעזבו לפני כן.', 'שמרו את התשובה — כך תוכלו לתכנן את המעבר בלי הפתעות.'] },
      { h2: 'מאיפה בכלל מגיע "קנס" היציאה', p: ['כשמקבלים הטבה משמעותית (למשל מכשיר במחיר מסובסד או מבצע ארוך) בתמורה להתחייבות, יציאה מוקדמת עשויה לגרור חיוב שמשקף את ההטבה שכבר נהניתם ממנה. זה לא "עונש" שרירותי אלא לרוב התחשבנות על ההטבה. כדאי להבין מראש איך הסכום מחושב כדי שתוכלו להחליט בעיניים פקוחות.'] },
      { h2: 'דרכים לעבור בלי לשלם מיותר', ul: ['חכו לסיום ההתחייבות — אם נשארו שבועות בודדים, לעיתים פשוט שווה להמתין.', 'חשבו את העלות מול התועלת: אם החיסכון השנתי אצל הספק החדש גדול מסכום היציאה, ייתכן שעדיין כדאי לעבור.', 'בקשו מהספק הנוכחי לשפר את התנאים — לעיתים עצם האיום לעזוב מביא הצעה טובה יותר בלי קנס.', 'הימנעו מהתחייבות חדשה כשאתם מצטרפים, כדי לא לחזור לאותה נקודה בעוד שנה.'] },
      { h2: 'תכנון נכון מונע את הבעיה מראש', p: ['הדרך הטובה ביותר לא לשלם קנס היא לדעת מראש מתי ההתחייבות נגמרת ולתזמן את המעבר בהתאם. סמנו את התאריך (SWITCHY עושה זאת אוטומטית ומזכיר לכם לפני שהמבצע או ההתחייבות מסתיימים), כדי שתעברו בדיוק כשאתם חופשיים — בלי קנס ובלי לשלם את המחיר המלא חודש מיותר. שימו לב: זו הכוונה כללית בלבד; פרטי ההתחייבות שלכם נקבעים בחוזה מול הספק.'] },
    ],
    faq: [
      ['איך אדע אם יש לי התחייבות פעילה?', 'בדקו בחשבונית או בחוזה ההצטרפות, או התקשרו לשירות הלקוחות ושאלו ישירות: "האם יש לי התחייבות, ועד איזה תאריך?" בקשו לקבל את התשובה בכתב.'],
      ['האם תמיד יש קנס יציאה?', 'לא. הרבה מהמסלולים היום הם ללא התחייבות כלל, ואז אפשר לעבור מתי שרוצים בלי קנס. קנס מופיע בעיקר כשקיבלתם הטבה משמעותית בתמורה להתחייבות.'],
      ['האם כדאי לעבור גם אם יש קנס?', 'תלוי בחישוב: אם החיסכון השנתי אצל הספק החדש גדול מסכום היציאה, ייתכן שעדיין כדאי. זו הכוונה כללית בלבד, לא ייעוץ משפטי.'],
    ],
  },
  {
    slug: 'guide-read-bill', cat: 'מדריך כללי', date: '2026-06-08', read: 5,
    title: 'איך לקרוא חשבון תקשורת ולמצוא חיובים מיותרים | SWITCHY',
    desc: 'רוב החשבונות מסתירים תוספות קטנות שנשכחו: שירותים שכבר לא צריך, מבצע שהסתיים, ביטוח וגיבויים. כך קוראים את החשבון שורה-שורה, מזהים חיובים מיותרים ויודעים מה לשאול ואיך לפעול.',
    h1: 'איך לקרוא חשבון תקשורת ולמצוא חיובים מיותרים',
    tldr: 'החשבון החודשי הוא המקום שבו נשמר הכסף שדולף. כמעט בכל חשבון מצטברות תוספות קטנות שנשכחו — שירות שכבר לא בשימוש, מבצע שהסתיים והמחיר קפץ, ביטוח או "שירות פרימיום" שמעולם לא ביקשתם. עברו על החשבון שורה-שורה פעם ברבעון, סמנו כל סעיף שאתם לא מזהים, ובדקו מולו. כמה דקות בשנה שוות מאות שקלים.',
    sections: [
      { h2: 'למה בכלל לקרוא את החשבון?', p: ['רוב האנשים מסתכלים רק על השורה התחתונה — הסכום לתשלום — ומעבירים הלאה. אבל הסכום הזה מורכב מהרבה סעיפים קטנים, וכל אחד מהם הוא הזדמנות לחיוב שכבר אינו רלוונטי. תוספת של ₪9 או ₪19 בחודש נראית זניחה, אבל היא ₪108–₪228 בשנה — וכשמצטברות כמה כאלה, מדובר בחיסכון אמיתי שמחכה רק שתבחינו בו.'] },
      { h2: 'מאיזה רכיבים מורכב חשבון תקשורת', ul: ['דמי המסלול הבסיסי — הליבה של מה שאתם משלמים עליו.', 'תוספות ושירותים — ביטוח מכשיר, שירות שיחות מורחב, אחסון ענן, מנויי תוכן.', 'הטבות ומבצעים — הנחה זמנית שיורדת מהמחיר (שימו לב מתי היא מסתיימת).', 'חיובים חד-פעמיים — שיחות לחו״ל, גלישה מעבר לחבילה, רכישות חד-פעמיות.', 'מסים ועיגולים — לרוב קבועים, אך כדאי לוודא שהסכום מסתדר.'] },
      { h2: 'מה לחפש — החיובים המיותרים הנפוצים', ul: ['שירותים שנשכחו: ביטוח למכשיר ישן שכבר החלפתם, שירות חיוג שלא השתמשתם בו שנים.', 'מבצע שהסתיים: ההנחה ירדה מהחשבון והמחיר קפץ בשקט — בלי שאף אחד יידע אתכם.', 'מנויי תוכן ותוספות פרימיום: שורות קטנות של ₪5–₪20 שהצטרפו אגב מבצע ונשארו.', 'כפילויות: אחסון ענן שאתם משלמים עליו גם דרך הספק וגם ישירות לחברה אחרת.', 'חיובי גלישה/שיחות חריגים: סימן שהחבילה לא מתאימה לשימוש האמיתי שלכם.'] },
      { h2: 'מה לשאול את הספק', p: ['ברגע שזיהיתם סעיף שאתם לא מזהים, אל תנחשו — שאלו ישירות. בקשו פירוט מה כולל כל שירות שמופיע בחשבון, מתי הוא הופעל, והאם הוא חלק מהמסלול או תוספת נפרדת. שאלה חשובה במיוחד: "האם המבצע שלי עדיין פעיל, ומתי הוא מסתיים?" — כך תדעו מראש אם המחיר עומד לקפוץ. בקשו לקבל את התשובות בכתב, כדי שיהיה לכם תיעוד.'] },
      { h2: 'איך לפעול אחרי שמצאתם', p: ['ביטול של תוספת מיותרת הוא לרוב פעולה פשוטה מול שירות הלקוחות, ולעיתים אפשר לעשותה גם באזור האישי באתר או באפליקציה. אם גיליתם שמבצע הסתיים והמחיר קפץ — זו בדיוק הנקודה להשוות מול מה שיש בשוק ולשקול מעבר. הרגל טוב הוא לעבור על החשבון פעם ברבעון, ולסמן תזכורת לתאריכי סיום מבצעים (SWITCHY עושה זאת אוטומטית) כדי שתפעלו לפני הקפיצה ולא אחריה.'] },
    ],
    faq: [
      ['אילו חיובים מיותרים הכי נפוצים בחשבון?', 'ביטוח למכשיר שכבר החלפתם, מבצע שהסתיים והמחיר קפץ בשקט, מנויי תוכן ותוספות פרימיום קטנות, וכפילויות כמו אחסון ענן שמשלמים עליו פעמיים.'],
      ['כל כמה זמן כדאי לעבור על החשבון?', 'פעם ברבעון. עברו עליו שורה-שורה, סמנו כל סעיף שאתם לא מזהים, ובדקו אותו מול הספק. כמה דקות בשנה שוות מאות שקלים.'],
      ['מה לשאול את הספק על סעיף לא מוכר?', 'בקשו פירוט מה כולל השירות, מתי הופעל, והאם הוא חלק מהמסלול או תוספת. שאלה חשובה: "האם המבצע שלי עדיין פעיל, ומתי הוא מסתיים?"'],
    ],
  },
  {
    slug: 'guide-family-lines', cat: 'סלולר', date: '2026-06-09', read: 5,
    title: 'משפחה? כך חוסכים על כמה קווי סלולר | SWITCHY',
    desc: 'מסלול משפחתי ארוז מול כמה קווים זולים נפרדים — מתי כל אפשרות יוצאת זולה יותר, איך מנהלים כמה קווים בלי להסתבך, ולמה כדאי לעקוב אחרי תאריכי החידוש של כל קו בנפרד.',
    h1: 'משפחה? כך חוסכים על כמה קווי סלולר',
    tldr: 'כשיש כמה קווים בבית יש שתי דרכים עיקריות: מסלול "משפחתי" ארוז, או כמה קווים זולים נפרדים. אין תשובה אחת נכונה — זה תלוי בכמות הקווים ובשימוש של כל אחד. הכלל הפשוט: חשבו את העלות הכוללת של כל אפשרות לכל הקווים יחד, לא את מחיר הקו הבודד. ולרוב, כמה קווים זולים בלי הגבלה מנצחים את החבילה ה"משפחתית".',
    sections: [
      { h2: 'שתי הדרכים לחבר כמה קווים', p: ['כשמדובר במשפחה עם כמה מכשירים, הספקים מציעים שני מודלים. הראשון הוא מסלול משפחתי ארוז — חבילה אחת שמכסה כמה קווים במחיר משותף. השני הוא פשוט לפתוח כמה קווים זולים ונפרדים, כל אחד עם המסלול שלו. שני המודלים לגיטימיים, וההבדל ביניהם הוא בעיקר במחיר הכולל ובנוחות הניהול.'] },
      { h2: 'מתי מסלול משפחתי משתלם', ul: ['כשהמחיר לקו במסלול המשפחתי נמוך משמעותית ממה שתשלמו על קווים נפרדים.', 'כשיש הרבה קווים (4 ומעלה) והחבילה נותנת הנחת כמות אמיתית.', 'כשנוח לכם שהכול מרוכז בחשבון אחד ובמועד חיוב אחד.', 'כשהחבילה כוללת הטבה משותפת שבאמת תנצלו (למשל גלישה משותפת).'] },
      { h2: 'מתי כמה קווים נפרדים זולים יותר', p: ['בשנים האחרונות מחירי הקווים הבודדים צנחו, ומסלול 5G ללא הגבלה נמכר במחיר נמוך. התוצאה: לעיתים קרובות מצרף של כמה קווים זולים ונפרדים יוצא זול יותר ממסלול "משפחתי" ארוז שנשמע משתלם בזכות הכותרת. היתרון הנוסף הוא גמישות — כל קו עצמאי, אפשר לשדרג או לעזוב כל אחד בנפרד בלי לגעת בשאר. לפני שמתחייבים לחבילה משפחתית, תמיד שווה לחשב כמה יעלו אותם קווים אם תקנו כל אחד בנפרד.'] },
      { h2: 'איך מנהלים כמה קווים בלי להסתבך', ul: ['רשמו טבלה פשוטה: שם בעל הקו, הספק, המסלול, המחיר ותאריך סיום המבצע.', 'אם הקווים מפוזרים בין כמה ספקים — זה לגיטימי, כל עוד אתם עוקבים אחרי כולם.', 'בדקו פעם ברבעון שאף קו לא "קפץ" במחיר אחרי סיום מבצע.', 'שקלו לרכז את מועדי החידוש כדי שיהיה קל לעקוב — או תנו לכלי מעקב לעשות זאת עבורכם.'] },
      { h2: 'אל תשכחו את תאריכי החידוש', p: ['הבעיה הגדולה עם כמה קווים היא לא המחיר ההתחלתי אלא המעקב: לכל קו יש מבצע משלו שמסתיים בתאריך אחר, ובלי מעקב אחד מהם תמיד יקפוץ במחיר בלי שתשימו לב. זו בדיוק הנקודה שבה ריבוי קווים הופך ליקר. סמנו לכל קו את תאריך סיום המבצע (SWITCHY עוקב אחרי כל הקווים ומזכיר ~21 יום לפני כל חידוש), כך שתשוו ותפעלו בזמן — לכל קו בנפרד — במקום לגלות את הקפיצה רק בחשבון.'] },
    ],
    faq: [
      ['מה זול יותר — מסלול משפחתי או כמה קווים נפרדים?', 'אין תשובה אחת. לרוב מצרף של כמה קווים זולים ונפרדים יוצא זול יותר ממסלול "משפחתי" ארוז. חשבו את העלות הכוללת לכל הקווים יחד, לא את מחיר הקו הבודד.'],
      ['מתי מסלול משפחתי כן משתלם?', 'כשהמחיר לקו נמוך משמעותית מקווים נפרדים, כשיש הרבה קווים (4 ומעלה) עם הנחת כמות אמיתית, או כשנוח שהכול בחשבון אחד.'],
      ['איך עוקבים אחרי כמה קווים בלי להסתבך?', 'רשמו טבלה: בעל הקו, ספק, מסלול, מחיר ותאריך סיום מבצע. בדקו פעם ברבעון שאף קו לא קפץ במחיר — או תנו לכלי מעקב לעשות זאת עבורכם.'],
    ],
  },
];

// Extra guides authored as JSON content files under content/guides/ — new SEO
// articles are added by dropping a file there, no edit to this generator needed.
const extraGuidesDir = path.join(__dirname, 'content', 'guides');
if (fs.existsSync(extraGuidesDir)) {
  for (const f of fs.readdirSync(extraGuidesDir).filter((f) => f.endsWith('.json')).sort()) {
    guides.push(JSON.parse(fs.readFileSync(path.join(extraGuidesDir, f), 'utf8')));
  }
}

// Header markup — evaluated AFTER `guides` is fully populated (incl. the
// content/guides/*.json extras), because the Guides mega-menu lists real
// articles. Pages that render their own lead-form keep the in-page #cta anchor;
// article/guide/static/404/providers-index pages have no #cta, so their header
// CTA points at the homepage's — otherwise it's a dead button exactly where
// organic-SEO visitors land.
const nav = navHtml('#cta');
const navNoCta = navHtml('index.html#cta');

// Render a single guide card (reused by guides index, article "related", category pages).
function guideCard(g) {
  const dateHe = new Date(g.date).toLocaleDateString('he-IL', { year: 'numeric', month: 'long', day: 'numeric' });
  return `          <a class="guide-card reveal" href="${esc(g.slug)}.html">
            <span class="tag-cat">${esc(g.cat)}</span>
            <h3>${esc(g.h1)}</h3>
            <p>${esc(g.desc)}</p>
            <span class="meta">${dateHe} · ${g.read} דק׳ קריאה</span>
          </a>`;
}

// Pick up to `n` guides related to a value, excluding `excludeSlug`.
// Matches guide.cat against the supplied category name (substring either direction),
// then fills the remainder with other guides so we always return up to `n`.
function relatedGuides(catName, excludeSlug, n) {
  const pool = guides.filter((g) => g.slug !== excludeSlug);
  const matches = catName
    ? pool.filter((g) => g.cat === catName || catName.includes(g.cat) || g.cat.includes(catName))
    : [];
  const rest = pool.filter((g) => !matches.includes(g));
  return [...matches, ...rest].slice(0, n);
}

function articleJsonLd(g) {
  const url = `${SITE}/${g.slug}.html`;
  const graph = [
    { '@type': 'BreadcrumbList', itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'דף הבית', item: SITE + '/' },
      { '@type': 'ListItem', position: 2, name: 'מדריכים', item: SITE + '/guides.html' },
      { '@type': 'ListItem', position: 3, name: g.h1, item: url },
    ] },
    // dateModified mirrors datePublished (we don't track separate edit times),
    // which is valid and lets Google show a freshness signal. author/publisher
    // reference the site-wide Organization @id so the entity isn't re-declared.
    { '@type': 'Article', headline: g.h1, description: g.desc,
      datePublished: g.date, dateModified: g.date,
      inLanguage: 'he-IL', articleSection: g.cat,
      mainEntityOfPage: { '@type': 'WebPage', '@id': url },
      image: OG_IMAGE,
      isPartOf: { '@id': WEBSITE_ID },
      author: { '@id': ORG_ID },
      publisher: { '@id': ORG_ID } },
  ];
  // Guides that carry explicit Q&A get a FAQPage node — eligible for FAQ rich
  // results, and a real reflection of the on-page content.
  if (g.faq && g.faq.length) {
    graph.push({
      '@type': 'FAQPage',
      mainEntity: g.faq.map(([q, a]) => ({
        '@type': 'Question', name: q,
        acceptedAnswer: { '@type': 'Answer', text: a },
      })),
    });
  }
  return jsonForScript({ '@context': 'https://schema.org', '@graph': graph });
}

// Site-wide identity JSON-LD (Organization + WebSite) — emitted on every page
// as its own block so the @id references resolve across the page's other graphs
// without re-serialising each caller's pre-built JSON string.
const siteJsonLdTag = () =>
  `<script type="application/ld+json">${jsonForScript({ '@context': 'https://schema.org', '@graph': siteGraphNodes() })}</script>`;

// `ogType` controls og:type (default 'article' preserves prior behaviour for
// guides/legal; non-article pages pass 'website'). `noindex` adds robots noindex
// (404) — indexable pages get an explicit index,follow so the intent is clear.
function head(title, desc, url, extraJsonLd, noindex, ogType = 'article') {
  return `<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />${noindex ? '\n  <base href="/" />' : ''}
  <meta name="color-scheme" content="light dark" />
  <!-- Theme guard: set data-theme before first paint (saved choice or system) so dark mode never flashes. -->
  <script>try{var t=localStorage.getItem('chosech-theme');document.documentElement.setAttribute('data-theme',(t==='light'||t==='dark')?t:(matchMedia('(prefers-color-scheme:dark)').matches?'dark':'light'));}catch(e){}</script>
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(desc)}" />
  <meta name="robots" content="${noindex ? 'noindex, follow' : 'index, follow, max-image-preview:large, max-snippet:-1'}" />
  <style>.skip{position:absolute;left:-999px;top:0;z-index:100;background:#111827;color:#fff;padding:10px 16px;border-radius:0 0 8px 0}.skip:focus{left:0}</style>
  <meta name="theme-color" content="#111827" />
  <link rel="canonical" href="${url}" />
  <link rel="alternate" hreflang="he-IL" href="${url}" />
  <link rel="alternate" hreflang="x-default" href="${url}" />
  <link rel="icon" href="favicon.svg" type="image/svg+xml" />
  <link rel="apple-touch-icon" href="favicon.svg" />
  <link rel="manifest" href="site.webmanifest" />
  <meta property="og:type" content="${ogType}" />
  <meta property="og:locale" content="he_IL" />
  <meta property="og:url" content="${url}" />
  <meta property="og:site_name" content="SWITCHY" />
  <meta property="og:title" content="${esc(title)}" />
  <meta property="og:description" content="${esc(desc)}" />
  <meta property="og:image" content="${OG_IMAGE}" />
  <meta property="og:image:type" content="image/png" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta property="og:image:alt" content="${esc(OG_IMAGE_ALT)}" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${esc(title)}" />
  <meta name="twitter:description" content="${esc(desc)}" />
  <meta name="twitter:image" content="${OG_IMAGE}" />
  <meta name="twitter:image:alt" content="${esc(OG_IMAGE_ALT)}" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link rel="preconnect" href="https://www.googletagmanager.com" />
  <link rel="preconnect" href="https://orzitfqmlvopujsoyigr.supabase.co" />
  <!-- Fonts via Google CDN, loaded non-render-blocking (preload as style →
       swap media print→all on load), with a <noscript> fallback. Preconnected
       above; font-display:swap so text never blocks on the webfont. -->
  <link rel="preload" as="style" href="https://fonts.googleapis.com/css2?family=Rubik:wght@500;700;800;900&family=Assistant:wght@400;500;600;700&display=swap" />
  <link href="https://fonts.googleapis.com/css2?family=Rubik:wght@500;700;800;900&family=Assistant:wght@400;500;600;700&display=swap" rel="stylesheet" media="print" onload="this.media='all'" />
  <noscript><link href="https://fonts.googleapis.com/css2?family=Rubik:wght@500;700;800;900&family=Assistant:wght@400;500;600;700&display=swap" rel="stylesheet" /></noscript>
  <link rel="stylesheet" href="${CSS_HREF}" />
  ${analyticsTag()}
  ${siteJsonLdTag()}
  ${extraJsonLd ? `<script type="application/ld+json">${extraJsonLd}</script>` : ''}
</head>`;
}

const guideCatToSlug = { 'סלולר': 'cellular', 'אינטרנט': 'internet', 'טלוויזיה': 'tv', 'חבילה משולבת': 'triple', 'חו״ל': 'abroad' };

// Render a tip/callout block for a guide section. Backward-compatible: a section
// with neither field renders nothing. `tip` → .callout--tip (amber/value
// accent); `callout` → a neutral .callout. Each may be a string or {title,text}.
function calloutHtml(field, isTip) {
  if (!field) return '';
  const obj = typeof field === 'string' ? { text: field } : field;
  if (!obj.text) return '';
  const title = obj.title || (isTip ? 'טיפ' : 'שימו לב');
  const icon = iconFor(isTip ? '💡' : '🛈');
  return `        <aside class="callout${isTip ? ' callout--tip' : ''}" role="note">
          <span class="callout__icon" aria-hidden="true">${icon}</span>
          <div class="callout__body"><p class="callout__title">${esc(title)}</p><p>${esc(obj.text)}</p></div>
        </aside>\n`;
}

function articlePage(g) {
  const url = `${SITE}/${g.slug}.html`;
  // Each section gets a stable ASCII anchor id (sec-N) so the auto TOC can deep-
  // link to it without slugifying Hebrew headings into something fragile.
  const body = g.sections.map((s, i) => {
    const id = `sec-${i + 1}`;
    let html = `        <h2 id="${id}">${esc(s.h2)}</h2>\n`;
    if (s.p) html += s.p.map((p) => `        <p>${esc(p)}</p>`).join('\n') + '\n';
    if (s.ul) html += `        <ul>\n${s.ul.map((li) => `          <li>${esc(li)}</li>`).join('\n')}\n        </ul>\n`;
    // Optional callouts — `tip` (highlight) and/or `callout` (neutral note).
    html += calloutHtml(s.tip, true);
    html += calloutHtml(s.callout, false);
    return html;
  }).join('\n');
  // Auto table of contents from the section headings. Only worth showing when
  // there are at least 3 sections (a 2-item TOC adds clutter, not navigation).
  const toc = g.sections.length >= 3
    ? `            <nav class="toc" aria-label="תוכן עניינים">
              <p class="toc__title">בעמוד הזה</p>
              <ol class="toc__list">
${g.sections.map((s, i) => `                <li><a class="toc__link" href="#sec-${i + 1}">${esc(s.h2)}</a></li>`).join('\n')}
              </ol>
            </nav>\n`
    : '';
  const dateHe = new Date(g.date).toLocaleDateString('he-IL', { year: 'numeric', month: 'long', day: 'numeric' });
  const relatedCards = relatedGuides(g.cat, g.slug, 3).map(guideCard).join('\n');
  // Visible FAQ — kept in sync with the FAQPage JSON-LD (rich-results rules
  // require the answers to actually appear on the page).
  const faqSection = (g.faq && g.faq.length)
    ? `      <section class="section" aria-label="שאלות נפוצות">
        <div class="container faq">
          <header class="section__head reveal"><span class="eyebrow">שאלות נפוצות</span><h2>שאלות ותשובות</h2></header>
          <div class="faq__list reveal">
${g.faq.map(([q, a]) => `            <details><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join('\n')}
          </div>
        </div>
      </section>
`
    : '';
  return `<!DOCTYPE html>
<html lang="he" dir="rtl">
${head(g.title, g.desc, url, articleJsonLd(g))}
<body id="top">
${navNoCta}
  <main id="main">
    <article>
      <section class="article-hero">
        <div class="container">
          <p class="crumbs"><a href="index.html">דף הבית</a> ← <a href="guides.html">מדריכים</a> ← ${esc(g.cat)}</p>
          <h1>${esc(g.h1)}</h1>
          <div class="article-meta"><span>${esc(g.cat)}</span><span>· ${dateHe}</span><span>· ${g.read} דק׳ קריאה</span></div>
        </div>
      </section>
      <section class="section">
        <div class="container">
          <div class="prose">
            <div class="tldr"><b>בקצרה:</b> ${esc(g.tldr)}</div>
${toc}${body}
          </div>
          <div class="article-cta">
            <h3>רוצים לראות כמה תחסכו בפועל?</h3>
            <p>השוואה חינם בשניות, בלי התחייבות.</p>
            ${(() => {
              const catSlug = guideCatToSlug[g.cat];
              const href = catSlug ? `${catSlug}.html` : 'plans.html';
              const label = catSlug ? `השוו מסלולי ${g.cat} ←` : 'ראו את כל המסלולים ←';
              return `<a class="btn btn--inverse btn--lg" href="${href}">${esc(label)}</a>`;
            })()}
          </div>
        </div>
      </section>
${faqSection}${(() => {
    const catSlug = guideCatToSlug[g.cat];
    const topPlans = catSlug ? (plansByCat[catSlug] || []).slice(0, 3) : [];
    if (!topPlans.length) return '';
    const catPageName = g.cat;
    const catPageHref = catSlug + '.html';
    return `      <section class="section" aria-label="מסלולים מומלצים">
        <div class="container">
          <header class="section__head reveal"><span class="eyebrow">המסלולים הזולים ביותר</span><h2>${esc(catPageName)} — הזולים עכשיו</h2><p>ממוינים מהזול ביותר מתוך הקטלוג המלא שלנו.</p></header>
          <div class="plan-grid plan-grid--featured">
${topPlans.map((p) => planCardHtml(p, false)).join('\n')}
          </div>
          <div style="text-align:center;margin-top:20px">
            <a class="btn btn--ghost" href="${catPageHref}">לכל מסלולי ה${esc(catPageName)} ←</a>
          </div>
        </div>
      </section>
`;
  })()}      <section class="section section--alt" aria-label="מדריכים נוספים">
        <div class="container">
          <header class="section__head reveal"><span class="eyebrow">להמשך קריאה</span><h2>מדריכים נוספים</h2></header>
          <div class="guide-cards">
${relatedCards}
          </div>
        </div>
      </section>
    </article>
  </main>
${footer}
  ${leadsConfigTag()}
  <script src="${JS_SRC}" defer></script>
</body>
</html>
`;
}

// Guides index structured data: breadcrumb + a CollectionPage whose ItemList
// links every guide article by URL — gives crawlers an explicit, ranked map of
// the whole guides hub (better crawl depth) without fabricating any data.
function guidesIndexJsonLd() {
  const url = `${SITE}/guides.html`;
  // Guides-hub CollectionPage embedding an ItemList of the REAL published guides.
  // Mirrors web/lib/schema.ts guidesCollectionSchema(): each list item is a
  // positioned Article carrying the guide's real headline, url, publish date and
  // section, with the brand Organization as author/publisher (the genuine author
  // of its editorial guides — same convention as articleJsonLd). HONESTY: every
  // entry mirrors a real guide; datePublished is the guide's REAL date (omitted
  // when absent, never invented); urls are real on-site routes. Nothing fabricated.
  const itemListElement = guides.map((g, i) => {
    const gUrl = `${SITE}/${g.slug}.html`;
    const article = {
      '@type': 'Article',
      headline: g.h1,
      url: gUrl,
      inLanguage: 'he-IL',
      mainEntityOfPage: { '@type': 'WebPage', '@id': gUrl },
      author: { '@id': ORG_ID },
      publisher: { '@id': ORG_ID },
    };
    if (g.desc) article.description = g.desc;
    // Real publish date only (already ISO yyyy-mm-dd in the guide data, exactly as
    // articleJsonLd() emits it); omitted when absent — never invented.
    if (g.date) article.datePublished = g.date;
    if (g.cat) article.articleSection = g.cat;
    return { '@type': 'ListItem', position: i + 1, url: gUrl, item: article };
  });
  return jsonForScript({ '@context': 'https://schema.org', '@graph': [
    { '@type': 'BreadcrumbList', itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'דף הבית', item: SITE + '/' },
      { '@type': 'ListItem', position: 2, name: 'מדריכים', item: url },
    ] },
    { '@type': 'CollectionPage', name: 'מדריכים — איך לחסוך על תקשורת',
      description: 'מדריכים בעברית להשוואת מסלולי תקשורת בישראל: סלולר, אינטרנט, טלוויזיה, חבילות משולבות וחו״ל.',
      url, inLanguage: 'he-IL',
      isPartOf: { '@id': WEBSITE_ID }, publisher: { '@id': ORG_ID },
      mainEntity: {
        '@type': 'ItemList',
        numberOfItems: itemListElement.length,
        itemListElement,
      } },
  ] });
}

function guidesIndexPage() {
  const url = `${SITE}/guides.html`;
  // Order categories for display: general first, then by topic
  const catOrder = ['מדריך כללי', 'סלולר', 'אינטרנט', 'חבילה משולבת', 'טלוויזיה', 'חו״ל'];
  const grouped = {};
  for (const g of guides) {
    const c = catOrder.includes(g.cat) ? g.cat : 'מדריך כללי';
    if (!grouped[c]) grouped[c] = [];
    grouped[c].push(g);
  }
  const sections = catOrder
    .filter((c) => grouped[c] && grouped[c].length)
    .map((c) => `
    <section class="section${c !== catOrder[0] ? ' section--alt' : ''}" aria-label="${esc(c)}">
      <div class="container">
        <header class="section__head reveal"><span class="eyebrow">${esc(c)}</span><h2>${esc(c === 'מדריך כללי' ? 'מדריכים כלליים' : `מדריכי ${c}`)}</h2></header>
        <div class="guide-cards">
${grouped[c].map(guideCard).join('\n')}
        </div>
      </div>
    </section>`).join('');
  return `<!DOCTYPE html>
<html lang="he" dir="rtl">
${head('מדריכים — איך לחסוך על תקשורת | SWITCHY', `${guides.length} מדריכים מקצועיים: איך לעבור ספק, לבחור מסלול סלולר, סיב אופטי מול כבלים ועוד — כל הטיפים כדי לא לשלם יותר מדי.`, url, guidesIndexJsonLd(), false, 'website')}
<body id="top">
${navNoCta}
  <main id="main">
    <section class="article-hero">
      <div class="container">
        <p class="crumbs"><a href="index.html">דף הבית</a> ← מדריכים</p>
        <h1>מדריכים — איך לא לשלם יותר מדי</h1>
        <div class="article-meta"><span>${guides.length} מדריכים • טיפים, השוואות ומדריכי החלטה שיחסכו לכם כסף</span></div>
        <div style="margin-top:20px;max-width:480px">
          <input type="search" id="guideSearch" class="filter-search" placeholder="חפשו מדריך…" aria-label="חיפוש מדריכים" style="width:100%;font-size:16px" />
        </div>
        <div class="filters guide-cat-filters" style="margin-top:16px" role="group" aria-label="סינון לפי קטגוריה">
          <button class="filter-btn active" data-guide-cat="all">הכל (${guides.length})</button>
${catOrder.filter((c) => grouped[c] && grouped[c].length).map((c) => `          <button class="filter-btn" data-guide-cat="${esc(c)}">${esc(c)} (${grouped[c].length})</button>`).join('\n')}
        </div>
      </div>
    </section>
${sections}
    <p id="guideEmpty" style="display:none;text-align:center;padding:40px 0;color:var(--muted);font-size:16px">לא נמצאו מדריכים שתואמים את החיפוש.</p>
  </main>
${footer}
  ${leadsConfigTag()}
  <script src="${JS_SRC}" defer></script>
</body>
</html>
`;
}

// ── FAQ hub (assembled from every page's real Q&A) ───────────────────────────
// One canonical FAQ page that aggregates the [question, answer] pairs already
// authored across the category pages (categories[].faq) and every guide
// (guides[].faq, incl. the content/guides/*.json extras). It is NOT a new source
// of copy — it re-surfaces existing answers so an organic "how do I…" query lands
// on a single deep page, with a matching FAQPage JSON-LD for rich results.
//
// Grouping mirrors the brand categories (general → cellular → internet → tv →
// triple → abroad). Within a group we dedupe by a normalised question key so the
// many guides that repeat "זה באמת בחינם?"/"כמה אפשר לחסוך?" collapse to one
// entry, and cap each group so the page stays scannable. The visible <details>
// answers and the JSON-LD mainEntity are built from the SAME deduped list, so
// they can never drift (a Google requirement for FAQ rich results).
const FAQ_GROUPS = [
  ['מדריך כללי', 'general', 'כללי — מעבר, חשבון וחיסכון'],
  ['סלולר', 'cellular', 'סלולר'],
  ['אינטרנט', 'internet', 'אינטרנט וסיב אופטי'],
  ['טלוויזיה', 'tv', 'טלוויזיה וסטרימינג'],
  ['חבילה משולבת', 'triple', 'חבילות משולבות'],
  ['חו״ל', 'abroad', 'חו״ל ו-eSIM'],
];
// Per-group cap — enough to be a rich, authoritative page without an unwieldy
// 600-item JSON-LD block. The pool is far larger; we keep the first N unique
// questions in document order (category FAQs first, then guides).
const FAQ_PER_GROUP = 14;

// Collect deduped Q&A per group. Returns [{ catName, slug, heading, qas:[[q,a]] }].
function collectFaqGroups() {
  // catName → ordered unique [q, a] pairs (category FAQs seed each group first so
  // the canonical category answers win over a guide's near-duplicate phrasing).
  const byCat = {};
  const seen = {};
  const norm = (q) => q.replace(/\s+/g, ' ').replace(/[?!.…״"'׳]/g, '').trim();
  const push = (catName, q, a) => {
    if (!q || !a) return;
    (byCat[catName] ||= []);
    (seen[catName] ||= new Set());
    const key = norm(q);
    if (seen[catName].has(key)) return;
    seen[catName].add(key);
    byCat[catName].push([q, a]);
  };
  // Category FAQs first (canonical), mapped onto their guide-category label.
  const catSlugToName = { cellular: 'סלולר', internet: 'אינטרנט', tv: 'טלוויזיה', triple: 'חבילה משולבת', abroad: 'חו״ל' };
  for (const c of categories) {
    const catName = catSlugToName[c.slug] || 'מדריך כללי';
    for (const [q, a] of c.faq || []) push(catName, q, a);
  }
  // Then every guide's FAQ, bucketed into the nearest known group (unknown cats
  // fall back to the general bucket so nothing is dropped).
  const known = new Set(FAQ_GROUPS.map(([name]) => name));
  for (const g of guides) {
    const catName = known.has(g.cat) ? g.cat : 'מדריך כללי';
    for (const [q, a] of g.faq || []) push(catName, q, a);
  }
  return FAQ_GROUPS
    .map(([catName, slug, heading]) => ({
      catName, slug, heading,
      qas: (byCat[catName] || []).slice(0, FAQ_PER_GROUP),
    }))
    .filter((grp) => grp.qas.length);
}

function faqPage() {
  const url = `${SITE}/faq.html`;
  const groups = collectFaqGroups();
  const totalQ = groups.reduce((n, g) => n + g.qas.length, 0);
  // Section anchors (ASCII, stable) so the in-page TOC deep-links cleanly.
  const sectionsHtmlOut = groups.map((grp, gi) => `
    <section class="section${gi % 2 ? ' section--alt' : ''}" id="faq-${grp.slug}" aria-label="${esc(grp.heading)}">
      <div class="container faq">
        <header class="section__head reveal"><span class="eyebrow">${esc(grp.catName)}</span><h2>${esc(grp.heading)}</h2></header>
        <div class="faq__list reveal">
${grp.qas.map(([q, a]) => `          <details><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join('\n')}
        </div>
        <p class="faq__more"><a href="${grp.slug === 'general' ? 'guides.html' : esc(grp.slug) + '.html'}">${esc(grp.slug === 'general' ? 'לכל המדריכים ←' : `השוו מסלולי ${grp.catName} ←`)}</a></p>
      </div>
    </section>`).join('');
  const toc = groups.map((grp) =>
    `<a class="chip" href="#faq-${grp.slug}">${esc(grp.heading)}</a>`).join('\n          ');
  // FAQPage JSON-LD — mainEntity mirrors EXACTLY the rendered <details> answers
  // above (built from the same `groups`). Plus a BreadcrumbList; the site-wide
  // Organization/WebSite identity is emitted by head() via siteJsonLdTag().
  const faqJsonLd = jsonForScript({ '@context': 'https://schema.org', '@graph': [
    { '@type': 'BreadcrumbList', itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'דף הבית', item: SITE + '/' },
      { '@type': 'ListItem', position: 2, name: 'שאלות נפוצות', item: url },
    ] },
    { '@type': 'FAQPage', name: 'שאלות נפוצות — SWITCHY', url, inLanguage: 'he-IL',
      isPartOf: { '@id': WEBSITE_ID }, publisher: { '@id': ORG_ID },
      mainEntity: groups.flatMap((grp) => grp.qas.map(([q, a]) => ({
        '@type': 'Question', name: q,
        acceptedAnswer: { '@type': 'Answer', text: a },
      }))) },
  ] });
  return `<!DOCTYPE html>
<html lang="he" dir="rtl">
${head('שאלות נפוצות על מעבר ספק תקשורת, סלולר, אינטרנט וחו״ל | SWITCHY', `כל התשובות במקום אחד — ${totalQ} שאלות ותשובות על מעבר ספק, ניוד מספר, 5G, סיב אופטי, חבילות משולבות ו-eSIM לחו״ל. בלי ז'רגון, בלי הפתעות.`, url, faqJsonLd, false, 'website')}
<body id="top">
${navNoCta}
  <main id="main">
    <section class="article-hero">
      <div class="container">
        <p class="crumbs"><a href="index.html">דף הבית</a> ← שאלות נפוצות</p>
        <h1>שאלות נפוצות</h1>
        <div class="article-meta"><span>${totalQ} שאלות ותשובות על מעבר ספק, סלולר, אינטרנט, טלוויזיה, חבילות וחו״ל — מרוכזות במקום אחד.</span></div>
        <div class="providers__row" style="justify-content:flex-start;margin-top:18px">
          <a class="chip" href="how-it-works.html">${iconFor('✨')} איך SWITCHY עובד</a>
          ${toc}
        </div>
      </div>
    </section>
${sectionsHtmlOut}
    <section class="cta" id="cta">
      <div class="container cta__inner reveal">
        <h2>לא מצאתם תשובה?</h2>
        <p>השאירו פרטים ונחזור אליכם עם המלצה אישית — חינם, בלי התחייבות. או דברו איתנו בוואטסאפ.</p>
        ${leadFormHtml('קבלו המלצה אישית תוך 2 דקות ←')}
        <p class="cta__note" id="leadNote" role="status" aria-live="polite"></p>
        <a class="cta__wa" href="https://wa.me/972505037537" target="_blank" rel="noopener">${svgIcon('chat')}מעדיפים וואטסאפ? דברו איתנו</a>
      </div>
    </section>
  </main>
${footer}
  ${leadsConfigTag()}
  <script src="${JS_SRC}" defer></script>
</body>
</html>
`;
}

// ── "How it works" explainer hub ────────────────────────────────────────────
// An evergreen, crawl-deep landing page that explains the service end-to-end and
// links out to every part of the site (categories, providers, compare, guides,
// FAQ, calculators). 100% assembled from existing data — the shared HOW_STEPS,
// the brand categories[] (+ real per-category min price/count from the
// catalogue), the deduped "general" FAQ group (collectFaqGroups), and
// relatedGuides — no telecom facts are invented here. JSON-LD: HowTo (the steps)
// + FAQPage (mirrors the rendered answers) + BreadcrumbList; head() adds the
// site-wide Organization/WebSite identity. This is the natural top-of-funnel hub
// SEO visitors land on for "איך SWITCHY עובד" / "איך משווים מסלולי תקשורת".
function howItWorksPage() {
  const url = `${SITE}/how-it-works.html`;
  const title = 'איך SWITCHY עובד — כך משווים ועוברים ספק תקשורת בלי כאב ראש | SWITCHY';
  const desc = 'איך SWITCHY עובד? שלושה צעדים: עונים על שאלון קצר, מקבלים המלצה חכמה ומנומקת, ועוברים בליווי מלא — חינם, בלי התחייבות. כך משווים סלולר, אינטרנט, טלוויזיה, חבילות וחו״ל ומוצאים את המסלול המשתלם ביותר.';
  // Step cards (shared HOW_STEPS) — numbered process matching the homepage.
  const stepCards = HOW_STEPS.map(([icon, h, p], i) => `          <li class="step reveal">
            <span class="step__num">${i + 1}</span>
            <h3>${esc(h)}</h3>
            <p>${esc(p)}</p>
          </li>`).join('\n');
  // Category explainer cards — each carries the brand intro + a real
  // "from ₪X · N plans" line derived from the catalogue (never fabricated). The
  // whole card links into the category hub, deepening crawl depth from this page.
  const catCards = categories.map((c) => {
    const list = plansByCat[c.slug] || [];
    const monthly = list.filter((p) => !p.priceUnit || p.priceUnit === 'month');
    // Count and price MUST come from the same set, or the line lies (e.g. abroad
    // would pair "11 plans" with a ₪19 price that only exists in the 4-plan
    // monthly subset, then stamp it /חודש on a mixed-unit category). Mirror the
    // heroStats pattern: when we price from the monthly subset, count it too.
    const set = monthly.length ? monthly : list;
    const cheapest = set[0];
    const fromTxt = cheapest
      ? `${set.length} מסלולים · החל מ-₪${cheapest.price}${(!cheapest.priceUnit || cheapest.priceUnit === 'month') ? '/חודש' : ''}`
      : `${list.length} מסלולים`;
    return `          <a class="cat reveal" href="${c.slug}.html">
            <span class="cat__icon" aria-hidden="true">${iconFor(c.icon)}</span>
            <h3>${esc(c.name)}</h3>
            <p>${esc(c.intro)}</p>
            <span style="display:block;margin-top:8px;font-family:'Rubik',sans-serif;font-weight:700;font-size:13px;color:var(--value)">${esc(fromTxt)}</span>
            <span class="cat__go" aria-hidden="true">להשוואה ←</span>
          </a>`;
  }).join('\n');
  // "Why trust us" — reuse the honest about-page points (same copy, no new claims).
  const trust = [
    ['💰', 'חינם לחלוטין', 'אנחנו מקבלים עמלה מהספק כשעוברים — לא מכם. המחיר שאתם משלמים זהה, וההמלצה ניטרלית.'],
    ['📊', 'המלצה מוסברת', 'רואים בדיוק למה כל מסלול דורג — ציון ערך לפי מחיר וגמישות, לא רשימה גנרית.'],
    ['⏰', 'התראת חידוש', 'מזכירים לכם לבדוק שוב לפני שהמבצע נגמר — כדי שלא תשלמו את המחיר המלא בשקט.'],
    ['🛡️', 'בלי הפתעות', 'מציגים גם את המחיר שאחרי המבצע ומלווים את כל המעבר, כולל ניוד מספר.'],
  ].map(([icon, h, p]) => `        <article class="feature feature--check reveal"><span class="feature__icon">${iconFor(icon)}</span><h3>${esc(h)}</h3><p>${esc(p)}</p></article>`).join('\n');
  // FAQ — reuse the deduped "general" group (mevar/bill/savings) so the visible
  // <details> and the FAQPage JSON-LD are built from the SAME existing answers.
  const generalGroup = collectFaqGroups().find((g) => g.slug === 'general');
  const faqQas = (generalGroup ? generalGroup.qas : []).slice(0, 8);
  const faqSection = faqQas.length ? `
    <section class="section" id="faq">
      <div class="container faq">
        <header class="section__head reveal"><span class="eyebrow">שאלות נפוצות</span><h2>שאלות על השירות</h2></header>
        <div class="faq__list reveal">
${faqQas.map(([q, a]) => `          <details><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join('\n')}
        </div>
        <p class="faq__more"><a href="faq.html">לכל השאלות הנפוצות ←</a></p>
      </div>
    </section>` : '';
  // Useful guides — general decision guides first (relatedGuides with no cat
  // returns the general pool first), capped at 4.
  const guideCards = relatedGuides(null, null, 4).map(guideCard).join('\n');
  // Popular shortcut collections (real, built pages only).
  const colChips = (typeof builtCollections !== 'undefined' ? builtCollections : [])
    .slice(0, 8)
    .map((col) => `<a class="chip" href="${col.slug}.html">${esc(col.h1)}</a>`).join('\n          ');
  // JSON-LD: HowTo (the 3 steps) + FAQPage (mirrors rendered answers) +
  // BreadcrumbList. The HowTo totalTime/estimatedCost reflect the honest pitch
  // (a few minutes, free). Each step references the on-page #step-N anchor.
  const howToNode = {
    '@type': 'HowTo',
    name: 'איך לעבור ספק תקשורת ולחסוך עם SWITCHY',
    description: 'שלושה צעדים פשוטים: שאלון קצר, המלצה חכמה ומנומקת, ומעבר בליווי מלא — חינם ובלי התחייבות.',
    inLanguage: 'he-IL',
    totalTime: 'PT3M',
    estimatedCost: { '@type': 'MonetaryAmount', currency: 'ILS', value: '0' },
    supply: [], tool: [],
    step: HOW_STEPS.map(([, h, p], i) => ({
      '@type': 'HowToStep', position: i + 1, name: h, text: p,
      url: `${url}#step-${i + 1}`,
    })),
    isPartOf: { '@id': WEBSITE_ID }, publisher: { '@id': ORG_ID },
  };
  const graph = [
    { '@type': 'BreadcrumbList', itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'דף הבית', item: SITE + '/' },
      { '@type': 'ListItem', position: 2, name: 'איך זה עובד', item: url },
    ] },
    howToNode,
  ];
  if (faqQas.length) {
    graph.push({
      '@type': 'FAQPage',
      mainEntity: faqQas.map(([q, a]) => ({
        '@type': 'Question', name: q,
        acceptedAnswer: { '@type': 'Answer', text: a },
      })),
    });
  }
  const howJsonLd = jsonForScript({ '@context': 'https://schema.org', '@graph': graph });
  return `<!DOCTYPE html>
<html lang="he" dir="rtl">
${head(title, desc, url, howJsonLd, false, 'website')}
<body id="top">
${nav}
  <main id="main">
    <section class="lead-hero">
      <div class="hero-decor" aria-hidden="true" data-parallax="0.18">${heroDecor()}</div>
      <div class="container">
        <p class="crumbs"><a href="index.html">דף הבית</a> ← איך זה עובד</p>
        <span class="pill pill--ico">${iconFor('✨')} פשוט כמו 1·2·3 · חינם · בלי התחייבות</span>
        <h1>איך <span class="hl">SWITCHY</span> עובד</h1>
        <p>אנחנו מרכזים את כל מסלולי התקשורת בישראל — סלולר, אינטרנט, טלוויזיה, חבילות משולבות וחו״ל — במקום אחד, משווים בשבילכם ומלווים את המעבר. הנה כל התהליך, מהשאלון ועד החיסכון.</p>
        <div class="hero__cta">
          <a class="btn btn--primary btn--lg" href="#cta">השוו ותחסכו ←</a>
          <a class="btn btn--ghost btn--lg" href="plans.html">דפדפו בכל המסלולים</a>
        </div>
      </div>
    </section>

    <section class="section" id="how">
      <div class="container">
        <header class="section__head reveal"><span class="eyebrow">שלושה צעדים</span><h2>מהשאלון ועד מסלול חדש</h2><p>שלוש דקות מהצד שלכם — את כל השאר אנחנו עושים.</p></header>
        <ol class="steps">
${stepCards}
        </ol>
      </div>
    </section>

    <section class="section section--alt" id="categories">
      <div class="container">
        <header class="section__head reveal"><span class="eyebrow">מה משווים</span><h2>כל קטגוריות התקשורת</h2><p>בחרו קטגוריה כדי לראות את כל המסלולים, מחירים והשוואה מלאה.</p></header>
        <div class="cats">
${catCards}
        </div>
      </div>
    </section>

    <section class="section" aria-label="למה לסמוך עלינו">
      <div class="container">
        <header class="section__head reveal"><span class="eyebrow">למה SWITCHY</span><h2>למה אפשר לסמוך עלינו</h2></header>
        <div class="features">
${trust}
        </div>
      </div>
    </section>

    <section class="section section--alt" aria-label="כלים שימושיים">
      <div class="container">
        <header class="section__head reveal"><span class="eyebrow">כלים</span><h2>כלים שיעזרו לכם להחליט</h2></header>
        <div class="providers__row">
          <a class="chip" href="compare.html">${svgIcon('scale')} השוואת מסלולים צד לצד</a>
          <a class="chip" href="providers.html">${svgIcon('building')} כל הספקים</a>
${builtCalculators.map((c) => `          <a class="chip" href="calc-${c.slug}.html">${svgIcon('calculator')} מחשבון חיסכון ${esc(c.name)}</a>`).join('\n')}
          <a class="chip" href="guides.html">${svgIcon('book')} כל המדריכים</a>
          <a class="chip" href="glossary.html">${svgIcon('book')} מילון מונחים</a>
          <a class="chip" href="faq.html">${svgIcon('info')} שאלות נפוצות</a>
        </div>
${colChips ? `        <div class="providers__row" style="margin-top:14px">
          ${colChips}
        </div>` : ''}
      </div>
    </section>

    <section class="section" aria-label="מדריכים שימושיים">
      <div class="container">
        <header class="section__head reveal"><span class="eyebrow">כדאי לדעת</span><h2>מדריכים שיחסכו לכם כסף</h2></header>
        <div class="guide-cards guide-cards--4">
${guideCards}
        </div>
      </div>
    </section>
${faqSection}
    <section class="cta" id="cta">
      <div class="container cta__inner reveal">
        <h2>מוכנים להתחיל לחסוך?</h2>
        <p>השאירו פרטים ונחזור אליכם עם ההשוואה וההמלצה — חינם, בלי התחייבות.</p>
        ${leadFormHtml('קבלו המלצה אישית תוך 2 דקות ←')}
        <p class="cta__note" id="leadNote" role="status" aria-live="polite"></p>
        <a class="cta__wa" href="https://wa.me/972505037537" target="_blank" rel="noopener">${svgIcon('chat')}מעדיפים וואטסאפ? דברו איתנו</a>
      </div>
    </section>
  </main>
${footer}
  ${leadsConfigTag()}
  <script src="${JS_SRC}" defer></script>
</body>
</html>
`;
}

// ── Static pages (about / legal) ─────────────────────────────────────────────
const staticPages = [
  {
    slug: 'about', cta: true,
    title: 'אודות SWITCHY — מי אנחנו ואיך אנחנו עובדים',
    desc: 'SWITCHY היא פלטפורמה ישראלית להשוואת מחירי תקשורת. כך אנחנו עובדים, איך השירות נשאר חינמי, ולמה אפשר לסמוך עלינו.',
    h1: 'על SWITCHY', intro: 'משווים, חוסכים, עוברים — בלי כאב ראש.',
    sections: [
      { h2: 'מי אנחנו', p: ['SWITCHY מרכזת את כל מסלולי התקשורת בישראל — סלולר, אינטרנט, טלוויזיה, חבילות משולבות וחו״ל — במקום אחד, ועוזרת לכם למצוא את המסלול המשתלם ביותר ולעבור אליו בקלות.'] },
      { h2: 'המודל שלנו — והשירות חינמי לכם', p: ['השירות חינמי לחלוטין למשתמשים. אנחנו מקבלים עמלה מחברת התקשורת כשעוברים דרכנו — אבל המחיר שאתם משלמים זהה, והעמלה אינה משפיעה על הדירוג. אנחנו מדרגים מסלולים לפי ההתאמה לכם, לא לפי מי שמשלם לנו.'] },
      { h2: 'למה לסמוך עלינו', ul: ['מחירים מעודכנים מכל החברות במקום אחד.', 'המלצה מוסברת — רואים בדיוק למה מסלול דורג גבוה.', 'התראת חידוש שמונעת מכם לשלם יותר מדי כשהמבצע נגמר.', 'קהילה וחוות דעת אמיתיות של לקוחות.'] },
      { h2: 'מה אנחנו עושים בשבילכם', ul: ['משווים את כל השוק בשניות.', 'ממליצים לפי הצרכים והתקציב שלכם.', 'מלווים את המעבר — כולל ניוד מספר בלי עמלות נסתרות.', 'מזכירים לבדוק שוב לפני שמבצע נגמר.'] },
    ],
  },
  {
    slug: 'privacy',
    title: 'מדיניות פרטיות — SWITCHY',
    desc: 'מדיניות הפרטיות של SWITCHY — איזה מידע אנחנו אוספים, כיצד אנו משתמשים בו, עם מי הוא משותף ומהן זכויותיכם.',
    h1: 'מדיניות פרטיות', intro: 'עודכן לאחרונה: יוני 2026',
    sections: [
      { h2: 'איזה מידע אנחנו אוספים', ul: ['פרטים שאתם מוסרים: שם, מספר טלפון ואימייל (למשל בטופס השארת פרטים).', 'העדפות וחשבונות שאתם מזינים באפליקציה כדי לקבל המלצה מותאמת.', 'נתוני שימוש בסיסיים (כגון דפים שנצפו) לשיפור השירות.'] },
      { h2: 'כיצד אנו משתמשים במידע', ul: ['כדי לספק את ההשוואה וההמלצה.', 'כדי ליצור איתכם קשר לגבי מעבר ספק — בהסכמתכם, לרבות הצעות רלוונטיות על בסיס מסלולים שצפיתם בהם באפליקציה כמשתמשים רשומים.', 'כדי לשפר את הדיוק והשירות.', 'בעת השארת פנייה נשמרת גם כתובת ה-IP למניעת שימוש לרעה; היא נמחקת בתוך 30 יום.'] },
      { h2: 'שיתוף מידע', p: ['איננו מוכרים את המידע שלכם. אנו עשויים לשתף פרטים עם חברת התקשורת שבחרתם — אך ורק לצורך ביצוע המעבר ובהסכמתכם — ועם ספקי שירות טכניים המסייעים בהפעלת הפלטפורמה.', 'בעת השארת פנייה, פרטיה (שם, הספק המבוקש והערות שמסרתם) עשויים להיות מעובדים באופן אוטומטי על-ידי ספק בינה מלאכותית חיצוני (כגון OpenAI או Anthropic) לצורך סיכום הפנייה ותעדוף הטיפול בה, בכפוף למדיניות הפרטיות של אותו ספק. המידע אינו משמש לפרסום.'] },
      { h2: 'שמירה ואבטחה', p: ['אנו שומרים את המידע למשך הזמן הדרוש למתן השירות ובהתאם לדין, ונוקטים אמצעים סבירים לאבטחתו.'] },
      { h2: 'הזכויות שלכם', p: ['אתם רשאים לעיין במידע שלכם, לתקנו או לבקש את מחיקתו — בפנייה אלינו לכתובת hello@chosech.co.il.'] },
      { h2: 'עוגיות ושינויים', p: ['האתר עשוי לעשות שימוש בעוגיות בסיסיות לתפעול ולניתוח. נעדכן מדיניות זו מעת לעת, והמשך השימוש מהווה הסכמה לגרסה המעודכנת.'] },
    ],
  },
  {
    slug: 'terms',
    title: 'תנאי שימוש — SWITCHY',
    desc: 'תנאי השימוש בשירותי SWITCHY — תיאור השירות, הערכות חיסכון, אחריות המשתמש, קניין רוחני, הגבלת אחריות ודין חל.',
    h1: 'תנאי שימוש', intro: 'עודכן לאחרונה: יוני 2026',
    sections: [
      { h2: 'השירות', p: ['SWITCHY מספקת השוואת מחירים, המלצות וליווי מעבר בין ספקי תקשורת. השירות ניתן חינם למשתמשים.'] },
      { h2: 'אין הבטחה לחיסכון מסוים', p: ['הסכומים המוצגים, לרבות במחשבון החיסכון, הם הערכות בלבד. החיסכון בפועל תלוי בחבילה, בספק ובשימוש שלכם. אנו משתדלים לשמור על מחירים מעודכנים, אך ייתכנו אי-דיוקים — יש לאמת את הפרטים מול הספק לפני התקשרות.'] },
      { h2: 'אחריות המשתמש', p: ['עליכם למסור פרטים נכונים ולהשתמש בשירות בתום לב ובהתאם לדין.'] },
      { h2: 'קניין רוחני', p: ['התכנים, העיצוב והסימנים באתר הם בבעלות SWITCHY או מי מטעמה, ואין לעשות בהם שימוש ללא רשות בכתב.'] },
      { h2: 'הגבלת אחריות', p: ['השירות ניתן כפי שהוא ("as is"). בכפוף לדין, SWITCHY לא תישא באחריות לנזק עקיף הנובע מהסתמכות על המידע או מהמעבר בין ספקים.'] },
      { h2: 'דין חל', p: ['על תנאים אלה יחולו דיני מדינת ישראל, וסמכות השיפוט הבלעדית נתונה לבתי המשפט המוסמכים בישראל.'] },
    ],
  },
  {
    // NOTE: this is a truthful draft. The [[OWNER: …]] placeholders mark details
    // we cannot verify automatically (the exact conformance level actually
    // achieved by an audit, the accessibility coordinator's name/phone, and the
    // date of the last review). They MUST be reviewed and completed by the owner,
    // and ideally checked by legal/an accessibility consultant, before relying on
    // this page for regulatory compliance under תקנות שוויון זכויות לאנשים עם
    // מוגבלות (התאמות נגישות לשירות), התשע"ג-2013.
    slug: 'accessibility',
    title: 'הצהרת נגישות — SWITCHY',
    desc: 'הצהרת הנגישות של אתר SWITCHY — המחויבות שלנו להנגשת השירות הדיגיטלי, התאמות הנגישות שבוצעו, והדרך לפנות אלינו בנושאי נגישות.',
    h1: 'הצהרת נגישות', intro: 'עודכן לאחרונה: יוני 2026',
    sections: [
      { h2: 'המחויבות שלנו לנגישות', p: [
        'ב-SWITCHY אנו רואים חשיבות רבה במתן שירות שוויוני ונגיש לכלל המשתמשים, לרבות אנשים עם מוגבלות. אנו פועלים להנגשת האתר והשירותים הדיגיטליים שלנו כך שיהיו נוחים וזמינים ככל הניתן עבור כולם.',
        'הנגשת האתר נעשית בהתאם להוראות תקנות שוויון זכויות לאנשים עם מוגבלות (התאמות נגישות לשירות), התשע"ג-2013, ובהתבסס על המלצות התקן הישראלי ת"י 5568 לנגישות תכנים באינטרנט, המבוסס על הנחיות WCAG 2.0.',
      ] },
      { h2: 'רמת ההנגשה באתר', p: [
        'אנו שואפים לעמוד ברמת הנגישות AA לפי הנחיות WCAG 2.0 / ת"י 5568.',
        'נכון למועד עדכון הצהרה זו, האתר טרם עבר בדיקת נגישות חיצונית פורמלית, ולכן איננו מצהירים על עמידה מלאה ומאושרת ברמה AA. אנו פועלים באופן שוטף להשגת יעד זה, ונעדכן הצהרה זו עם השלמת בדיקה מקצועית.',
      ] },
      { h2: 'התאמות הנגישות שבוצעו באתר', ul: [
        'מבנה דפים סמנטי ותמיכה בניווט וקריאה מימין לשמאל (RTL) בעברית.',
        'טקסט חלופי לתמונות ותוויות נגישות (aria-label) לפקדים ולכפתורים.',
        'אפשרות ניווט והפעלה באמצעות מקלדת.',
        'שמירה על ניגודיות צבעים קריאה בין הטקסט לרקע.',
        'מבנה כותרות היררכי המסייע לקוראי מסך.',
        'טפסים עם תוויות מקושרות והודעות שגיאה ברורות.',
      ] },
      { h2: 'הסתייגות ומגבלות ידועות', p: [
        'למרות מאמצינו להנגיש את כלל הדפים והרכיבים, ייתכן שחלקים מסוימים באתר טרם הונגשו במלואם או נמצאים בתהליך הנגשה. אנו ממשיכים לשפר את נגישות האתר באופן שוטף.',
        'אם נתקלתם בקושי נגישות בעמוד או ברכיב כלשהו, נשמח שתפנו אלינו ונפעל לתקן זאת בהקדם.',
      ] },
      { h2: 'הגורם האחראי לנגישות', p: [
        'הגורם האחראי על הטיפול בנושאי נגישות ב-SWITCHY (Switch AI) הוא צוות Switch AI. בהתאם להיקף הפעילות של החברה, איננו נדרשים למינוי רכז נגישות ייעודי, וצוות Switch AI מרכז את הטיפול בפניות הנגישות ומחויב לתת להן מענה.',
        'פרטי יצירת קשר לנושאי נגישות:',
        'דוא"ל: hello@chosech.co.il',
        'וואטסאפ / טלפון: 050-503-7537',
      ] },
      { h2: 'פנייה ומנגנון טיפול בתלונות נגישות', p: [
        'נשמח לקבל פניות, הערות והצעות לשיפור בנושא נגישות האתר, וכן תלונות על ליקויי נגישות. בעת הפנייה נבקש לפרט את העמוד או הרכיב שבו נתקלתם בקושי, את סוג הקושי, ואת אמצעי הקשר לחזרה אליכם.',
        'אנו מתחייבים לבחון כל פנייה, להשיב למגיש/ת הפנייה ולפעול לתיקון ליקוי הנגישות, ככל הניתן, בתוך 60 ימים ממועד קבלת הפנייה. במקרים מורכבים שבהם נדרש זמן טיפול ארוך יותר, נעדכן אתכם על כך ועל לוח הזמנים הצפוי.',
      ] },
      { h2: 'עדכון ההצהרה', p: [
        'הצהרת נגישות זו עודכנה לאחרונה בחודש יוני 2026. אנו בוחנים ומעדכנים אותה מעת לעת בהתאם לשיפורים המתבצעים באתר.',
      ] },
    ],
  },
];

function sectionsHtml(sections) {
  return sections.map((s) => {
    let html = `        <h2>${esc(s.h2)}</h2>\n`;
    if (s.p) html += s.p.map((p) => `        <p>${esc(p)}</p>`).join('\n') + '\n';
    if (s.ul) html += `        <ul>\n${s.ul.map((li) => `          <li>${esc(li)}</li>`).join('\n')}\n        </ul>\n`;
    return html;
  }).join('\n');
}

function staticPage(p) {
  const url = `${SITE}/${p.slug}.html`;
  const cta = p.cta
    ? `          <div class="article-cta">
            <h3>מוכנים לחסוך?</h3>
            <p>השוואה חינם בשניות, בלי התחייבות.</p>
            <a class="btn btn--inverse btn--lg" href="index.html#calculator">בדקו עכשיו ←</a>
          </div>`
    : '';
  // Breadcrumb + a typed WebPage node (AboutPage for /about) so even the legal
  // and about pages carry valid structured data and tie back to the site entity.
  const pageType = p.slug === 'about' ? 'AboutPage' : 'WebPage';
  const staticJsonLd = jsonForScript({ '@context': 'https://schema.org', '@graph': [
    { '@type': 'BreadcrumbList', itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'דף הבית', item: SITE + '/' },
      { '@type': 'ListItem', position: 2, name: p.h1, item: url },
    ] },
    { '@type': pageType, name: p.h1, description: p.desc, url, inLanguage: 'he-IL',
      isPartOf: { '@id': WEBSITE_ID }, publisher: { '@id': ORG_ID } },
  ] });
  return `<!DOCTYPE html>
<html lang="he" dir="rtl">
${head(p.title, p.desc, url, staticJsonLd, false, 'website')}
<body id="top">
${navNoCta}
  <main id="main">
    <section class="article-hero">
      <div class="container">
        <p class="crumbs"><a href="index.html">דף הבית</a> ← ${esc(p.h1)}</p>
        <h1>${esc(p.h1)}</h1>
        ${p.intro ? `<div class="article-meta"><span>${esc(p.intro)}</span></div>` : ''}
      </div>
    </section>
    <section class="section">
      <div class="container">
        <div class="prose">
${sectionsHtml(p.sections)}
        </div>
${cta}
      </div>
    </section>
  </main>
${footer}
  ${leadsConfigTag()}
  <script src="${JS_SRC}" defer></script>
</body>
</html>
`;
}

function notFoundPage() {
  return `<!DOCTYPE html>
<html lang="he" dir="rtl">
${head('הדף לא נמצא — SWITCHY', 'הדף שחיפשתם לא נמצא.', `${SITE}/404.html`, null, true, 'website')}
<body id="top">
${navNoCta}
  <main id="main">
    <section class="lead-hero" style="text-align:center">
      <div class="container">
        <span class="pill">404</span>
        <h1>אופס, הדף לא נמצא</h1>
        <p>הדף שחיפשתם לא קיים או עבר דירה. בואו נחזיר אתכם למסלול.</p>
        <div class="hero__cta" style="justify-content:center">
          <a class="btn btn--primary btn--lg" href="index.html">חזרה לדף הבית</a>
          <a class="btn btn--ghost btn--lg" href="plans.html">כל המסלולים</a>
        </div>
      </div>
    </section>
    <section class="section">
      <div class="container">
        <header class="section__head reveal" style="text-align:center"><span class="eyebrow">ניווט מהיר</span><h2>לאן רוצים לעבור?</h2></header>
        <nav style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:14px;max-width:800px;margin:0 auto" aria-label="ניווט מהיר">
          ${categories.map((c) => `<a href="${c.slug}.html" class="glass quick-nav__card"><span class="quick-nav__ico" aria-hidden="true">${iconFor(c.icon)}</span><br>${esc(c.name)}</a>`).join('')}
          <a href="compare.html" class="glass quick-nav__card"><span class="quick-nav__ico" aria-hidden="true">${svgIcon('scale')}</span><br>השוואת מסלולים</a>
          <a href="providers.html" class="glass quick-nav__card"><span class="quick-nav__ico" aria-hidden="true">${svgIcon('building')}</span><br>כל הספקים</a>
          <a href="guides.html" class="glass quick-nav__card"><span class="quick-nav__ico" aria-hidden="true">${svgIcon('book')}</span><br>מדריכים</a>
          <a href="how-it-works.html" class="glass quick-nav__card"><span class="quick-nav__ico" aria-hidden="true">${svgIcon('sparkle')}</span><br>איך זה עובד</a>
          <a href="app.html" class="glass quick-nav__card"><span class="quick-nav__ico" aria-hidden="true">${svgIcon('phone')}</span><br>האפליקציה</a>
        </nav>
      </div>
    </section>
  </main>
${footer}
  ${leadsConfigTag()}
  <script src="${JS_SRC}" defer></script>
</body>
</html>
`;
}

function plansPage() {
  const url = `${SITE}/plans.html`;
  const filterBtns = [['all', 'הכל'], ...categories.map((c) => [c.slug, c.name])]
    .map(([f, label], i) => `<button class="filter-btn${i === 0 ? ' active' : ''}" data-filter="${f}">${esc(label)}</button>`)
    .join('\n          ');
  const cards = catalogue.plans.slice().sort((a, b) => a.price - b.price).map(planCardHtml).join('\n        ');
  const providerNames = [...new Set(catalogue.plans.map((p) => p.provider))].sort((a, b) => a.localeCompare(b, 'he'));
  const providerOptions = providerNames.map((n) => `<option value="${providerSlug(n)}">${esc(n)}</option>`).join('');
  const collectionsSection = builtCollections.length ? `
    <section class="section section--alt" aria-label="אוספים">
      <div class="container">
        <header class="section__head reveal"><span class="eyebrow">קיצורי דרך</span><h2>אוספים פופולריים</h2><p>קפיצה ישירה למה שמחפשים.</p></header>
        <div class="providers__row">
          ${builtCollections.map((col) => `<a class="chip" href="${col.slug}.html">${esc(col.h1)}</a>`).join('\n          ')}
        </div>
      </div>
    </section>` : '';
  // Breadcrumb + a CollectionPage carrying an ItemList of the cheapest plan
  // Products. Capped at 40 so the JSON-LD payload stays lean (the page renders
  // every plan in HTML; the structured list just gives crawlers a real sample).
  const sortedPlans = catalogue.plans.slice().sort((a, b) => a.price - b.price);
  // Dataset node — positions THIS full price catalogue as the authoritative,
  // citable data source for the Israeli telecom market (a real build-time
  // snapshot, not invented trends). plans.html is the catalogue/market page, so
  // the Dataset lives here. Description states the genuine catalogue scope
  // (PLAN_COUNT plans, PROVIDER_COUNT providers, CATEGORY_COUNT categories) and a
  // national (Israel-wide) framing — never city-specific prices.
  const datasetForPlans = datasetNode({
    name: 'מחירון התקשורת של SWITCHY — סלולר, אינטרנט, טלוויזיה, משולב וחו״ל',
    description: `מחירון מלא של שוק התקשורת בישראל: ${PLAN_COUNT} מסלולים מ-${PROVIDER_COUNT} ספקים ב-${CATEGORY_COUNT} קטגוריות (סלולר, אינטרנט, טלוויזיה, חבילות משולבות וחו״ל). מחירים ארציים נכון ל-${CATALOGUE_DATE_HE}, כולל מע״מ.`,
    url,
    measures: ['מחיר', 'ספק', 'קטגוריה', 'מחיר לאחר מבצע', 'נפח גלישה', 'מהירות'],
  });
  const ldGraph = [
    { '@type': 'BreadcrumbList', itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'דף הבית', item: SITE + '/' },
      { '@type': 'ListItem', position: 2, name: 'כל החבילות', item: url },
    ] },
    { '@type': 'CollectionPage', name: 'כל החבילות — מחירון מלא', url, inLanguage: 'he-IL',
      isPartOf: { '@id': WEBSITE_ID }, publisher: { '@id': ORG_ID },
      // The CollectionPage is the main subject (mainEntity = the plan ItemList);
      // the Dataset is its formal "this is a citable data source" companion.
      isBasedOn: { '@id': `${url}#dataset` },
      mainEntity: plansItemListJsonLd(sortedPlans.slice(0, 40), url, 'מחירון מלא של כל חברות התקשורת') },
    { ...datasetForPlans, '@id': `${url}#dataset` },
  ];
  const plansJsonLd = jsonForScript({ '@context': 'https://schema.org', '@graph': ldGraph });
  return `<!DOCTYPE html>
<html lang="he" dir="rtl">
${head('כל החבילות — מחירון מלא של כל חברות התקשורת | SWITCHY', `מחירון מלא: ${catalogue.plans.length} מסלולי סלולר, אינטרנט, טלוויזיה, חבילות משולבות וחו״ל מכל החברות — ממוין מהזול ביותר. סננו לפי קטגוריה וחפשו.`, url, plansJsonLd, false, 'website')}
<body id="top">
${nav}
  <main id="main">
    <section class="lead-hero">
      <div class="hero-decor" aria-hidden="true" data-parallax="0.18">${heroDecor()}</div>
      <div class="container">
        <p class="crumbs"><a href="index.html">דף הבית</a> ← כל החבילות</p>
        <h1>כל החבילות — <span class="hl">מחירון מלא</span></h1>
        <p><span data-count-to="${catalogue.plans.length}">${catalogue.plans.length}</span> מסלולים מכל חברות התקשורת, ממוינים מהזול ביותר. סננו לפי קטגוריה או חפשו ספק/מסלול/תכונה.</p>
      </div>
    </section>
    <section class="section">
      <div class="container">
        <div class="filters">
          ${filterBtns}
          <input type="search" class="filter-search" id="planSearch" placeholder="חיפוש ספק, מסלול או תכונה…" aria-label="חיפוש בחבילות" />
          <select id="planSort" class="filter-search" style="flex:0 0 auto;max-width:210px" aria-label="מיון חבילות">
            <option value="price-asc" selected>מהזול ליקר</option>
            <option value="price-desc">מהיקר לזול</option>
            <option value="after-asc">מחיר אחרי מבצע (זול ליקר)</option>
          </select>
          <select id="planProvider" class="filter-search" style="flex:0 0 auto;max-width:180px" aria-label="סינון לפי ספק">
            <option value="">כל הספקים</option>
            ${providerOptions}
          </select>
          <div class="filter-price" role="group" aria-label="סינון לפי מחיר">
            <span class="filter-price__label">עד</span>
            <input type="number" id="planMaxPrice" class="filter-search" style="flex:0 0 auto;width:90px" min="0" step="5" placeholder="₪ מקס׳" aria-label="מחיר מקסימלי לחודש" />
            <span class="filter-price__label">₪</span>
          </div>
          <button class="flag-chip" data-flag="5g">5G</button>
          <button class="flag-chip" data-flag="nocommit">ללא התחייבות</button>
          <button class="flag-chip" data-flag="abroad">כולל חו״ל</button>
          <button class="flag-chip" data-flag="haspromo">מחיר מבצע</button>
          <button class="flag-chip" data-flag="kosher">כשר</button>
          <span class="plan-count" id="planCount" aria-live="polite" aria-atomic="true"></span>
        </div>
        <div class="plan-grid" id="planGrid">
        ${cards}
        </div>
        <p class="plan-empty" id="planEmpty">לא נמצאו חבילות שתואמות את החיפוש. נסו להסיר חלק מהמסננים או <button type="button" class="plan-empty__reset" id="planEmptyReset">לנקות הכל</button>.</p>
        <p class="cmp__caveat">המחירים כוללים מע״מ ונכונים למועד עדכון המחירון (${BUILD_DATE_HE}). מחירים ותנאים עשויים להשתנות — יש לאמת את הפרטים המלאים מול הספק לפני התקשרות.</p>
      </div>
    </section>
${collectionsSection}
${trustBlock()}
    <section class="cta" id="cta">
      <div class="container cta__inner reveal">
        <h2>מצאתם משהו מעניין?</h2>
        <p>השאירו פרטים ונעזור לכם לעבור — חינם, בלי התחייבות.</p>
        ${leadFormHtml('קבלו המלצה אישית תוך 2 דקות ←')}
        <p class="cta__note" id="leadNote" role="status" aria-live="polite"></p>
        <a class="cta__wa" href="https://wa.me/972505037537" target="_blank" rel="noopener">${svgIcon('chat')}מעדיפים וואטסאפ? דברו איתנו</a>
      </div>
    </section>
  </main>
${footer}
  ${leadsConfigTag()}
  <script src="${JS_SRC}" defer></script>
</body>
</html>
`;
}

function providerPage(name, plans) {
  const slug = providerSlug(name);
  const url = `${SITE}/provider-${slug}.html`;
  const cheapest = plans.reduce((m, p) => Math.min(m, p.price), Infinity);
  const catNames = [...new Set(plans.map((p) => (categories.find((c) => c.slug === p.cat) || {}).name).filter(Boolean))];
  const sortedPlans = plans.slice().sort((a, b) => a.price - b.price);
  const cards = sortedPlans.map((p, i) => planCardHtml(p, i === 0 && sortedPlans.length > 1)).join('\n        ');
  const planCats = [...new Set(plans.map((p) => p.cat))];
  // "Best plans" at-a-glance tables — one per category this provider sells in,
  // reusing the same Kamaze-style comparisonTable() the category pages use. Each
  // table is scoped to THIS provider's plans (price-sorted) so the page leads with
  // a scannable price grid before the detailed cards. Categories are emitted in
  // brand order; a single-plan category is skipped (the table needs ≥2 rows).
  const provTables = categories
    .filter((c) => planCats.includes(c.slug))
    .map((c) => {
      const catPlans = sortedPlans.filter((p) => p.cat === c.slug);
      const table = comparisonTable(catPlans, c.slug, `compare-${c.slug}`);
      if (!table) return '';
      return `      <header class="section__head reveal" style="margin-bottom:8px"><span class="eyebrow">${esc(c.name)}</span><h2>${esc(name)} ${esc(c.name)} — המסלולים הזולים</h2></header>${table}`;
    })
    .filter(Boolean)
    .join('\n');
  // Per-category internal links into the matching comparison hub — lets a visitor
  // (and a crawler) move from this provider to the broader "all providers in X"
  // page, deepening the internal link graph rather than dead-ending here.
  const catLinks = categories
    .filter((c) => planCats.includes(c.slug))
    .map((c) => `<a class="chip" href="${c.slug}.html">${iconFor(c.icon)} כל מסלולי ${esc(c.name)}</a>`)
    .join('\n          ');
  const relatedProviders = [...new Set(
    catalogue.plans
      .filter((p) => p.provider !== name && planCats.includes(p.cat))
      .map((p) => p.provider)
  )].slice(0, 6);
  const relatedChips = relatedProviders.map((pname) =>
    `<a class="chip" href="provider-${providerSlug(pname)}.html">${providerLogo(pname, 22)} ${esc(pname)}</a>`
  ).join('\n          ');
  // Head-to-head comparison pages this provider takes part in — links the
  // provider hub straight into the "X מול Y" cluster (crawl depth + a high-intent
  // shortcut). Guarded `typeof` because builtProviderVs is declared after this fn
  // but populated before the write loop calls it.
  const provVsLinks = (typeof builtProviderVs !== 'undefined' ? builtProviderVs : [])
    .filter((v) => v.a.provider === name || v.b.provider === name)
    .map((v) => {
      const other = v.a.provider === name ? v.b.provider : v.a.provider;
      return `<a class="chip" href="${v.slug}.html">${svgIcon('scale')} ${esc(name)} מול ${esc(other)} (${esc(v.catName)})</a>`;
    }).join('\n          ');
  // Provider-scoped AggregateOffer (real min/max/count) — emitted as its own
  // top-level node, summarising this provider's genuine price band across the
  // catalogue. temporalCoverage on the CollectionPage stamps the real catalogue
  // month. The per-plan Products already carry the provider as their Brand.
  const provAggOffer = categoryAggregateOfferNode(plans);
  // Provider Organization node with `sameAs` to its REAL official site (omitted
  // when none is verified — never fabricated). The CollectionPage `about` points
  // at this entity by @id so engines resolve our provider page to the
  // authoritative provider. Mirrors the web app's provider Organization nodes.
  const provOrg = providerOrgNode(name);
  const provGraph = [
    { '@type': 'BreadcrumbList', itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'דף הבית', item: SITE + '/' },
      { '@type': 'ListItem', position: 2, name: 'כל החבילות', item: SITE + '/plans.html' },
      { '@type': 'ListItem', position: 3, name: name, item: url },
    ] },
    { '@type': 'CollectionPage', name: `כל המסלולים של ${name}`, url, inLanguage: 'he-IL',
      isPartOf: { '@id': WEBSITE_ID }, publisher: { '@id': ORG_ID },
      about: { '@id': provOrg['@id'] },
      temporalCoverage: CATALOGUE_MONTH,
      mainEntity: plansItemListJsonLd(plans, url, `מסלולי ${name}`) },
    provOrg,
  ];
  if (provAggOffer) provGraph.push(provAggOffer);
  const jsonld = jsonForScript({ '@context': 'https://schema.org', '@graph': provGraph });
  return `<!DOCTYPE html>
<html lang="he" dir="rtl">
${head(`כל המסלולים של ${name} — מחירים והשוואה | SWITCHY`, `כל מסלולי ${name} במקום אחד — ${plans.length} מסלולים מ-₪${cheapest}. השוו מחירים ותכונות ומצאו את המשתלם ביותר.`, url, jsonld, false, 'website')}
<body id="top">
${nav}
  <main id="main">
    <section class="lead-hero">
      <div class="hero-decor" aria-hidden="true" data-parallax="0.18">${heroDecor()}</div>
      <div class="container">
        <p class="crumbs"><a href="index.html">דף הבית</a> ← <a href="plans.html">כל החבילות</a> ← ${esc(name)}</p>
        <div style="margin-bottom:14px">${providerLogo(name, 64)}</div>
        <h1>כל המסלולים של <span class="hl">${esc(name)}</span></h1>
        <p>${plans.length} מסלולים${catNames.length ? ` (${esc(catNames.join(' · '))})` : ''} — החל מ-₪${cheapest}. השוו מחירים ותכונות, ומצאו את המסלול המשתלם ביותר.</p>
        <div class="hero__cta"><a class="btn btn--primary btn--lg" href="#cta">קבלו השוואה חינם ←</a><a class="btn btn--ghost btn--lg" href="plans.html">לכל החבילות</a></div>
      </div>
    </section>
${provTables}
    <section class="section" id="plans">
      <div class="container">
        <header class="section__head reveal"><span class="eyebrow">${plans.length} מסלולים</span><h2>כל המסלולים של ${esc(name)} — בפירוט</h2><p>ממוין מהזול ביותר, עם כל הפרטים וכפתור פנייה ישיר.</p>${freshnessBadge()}</header>
        <div class="plan-grid">
        ${cards}
        </div>
      </div>
    </section>
    ${catLinks ? `<section class="providers" aria-label="השוואה לפי קטגוריה">
      <div class="container">
        <p class="providers__title">השוו את ${esc(name)} מול כל הספקים</p>
        <div class="providers__row">
          ${catLinks}
        </div>
      </div>
    </section>` : ''}
    ${relatedChips ? `<section class="providers" aria-label="ספקים דומים">
      <div class="container">
        <p class="providers__title">ספקים נוספים באותן קטגוריות</p>
        <div class="providers__row">
          ${relatedChips}
        </div>
      </div>
    </section>` : ''}
    ${provVsLinks ? `<section class="providers" aria-label="השוואות ראש בראש">
      <div class="container">
        <p class="providers__title">${esc(name)} מול ספקים אחרים</p>
        <div class="providers__row">
          ${provVsLinks}
        </div>
      </div>
    </section>` : ''}
    ${(() => {
      const provCatName = catNames[0] || null;
      const gHtml = relatedGuides(provCatName, null, 2).map(guideCard).join('\n');
      return gHtml ? `
    <section class="section section--alt" aria-label="מדריכים">
      <div class="container">
        <header class="section__head reveal"><span class="eyebrow">כדאי לדעת</span><h2>מדריכים שימושיים</h2></header>
        <div class="guide-cards guide-cards--2">
${gHtml}
        </div>
      </div>
    </section>` : '';
    })()}
${trustBlock()}
    <section class="cta" id="cta">
      <div class="container cta__inner reveal">
        <h2>רוצים לעבור ל${esc(name)} — או ממנו?</h2>
        <p>השאירו פרטים ונעזור לכם למצוא ולעבור למסלול הכי משתלם, חינם ובלי התחייבות.</p>
        ${leadFormHtml('קבלו המלצה אישית תוך 2 דקות ←')}
        <p class="cta__note" id="leadNote" role="status" aria-live="polite"></p>
        <a class="cta__wa" href="https://wa.me/972505037537" target="_blank" rel="noopener">${svgIcon('chat')}מעדיפים וואטסאפ? דברו איתנו</a>
      </div>
    </section>
  </main>
${footer}
  ${leadsConfigTag()}
  <script src="${JS_SRC}" defer></script>
</body>
</html>
`;
}

function providersIndexPage() {
  const url = `${SITE}/providers.html`;
  const catLabel = { cellular: 'סלולר', internet: 'אינטרנט', tv: 'טלוויזיה', triple: 'טריפל', abroad: 'חו״ל' };
  const map = {};
  for (const p of catalogue.plans) (map[p.provider] ||= []).push(p);
  const sortedNames = Object.keys(map).sort((a, b) => map[b].length - map[a].length);
  const cards = sortedNames.map((name) => {
    const ps = map[name];
    const min = ps.reduce((m, p) => Math.min(m, p.price), Infinity);
    const cats = [...new Set(ps.map((p) => p.cat))].filter((c) => catLabel[c]).sort((a, b) => Object.keys(catLabel).indexOf(a) - Object.keys(catLabel).indexOf(b)).map((c) => catLabel[c]).join(' · ');
    return `        <a class="provider-card" href="provider-${providerSlug(name)}.html">${providerLogo(name, 46)}<span><b>${esc(name)}</b><small>${ps.length} מסלולים · מ-₪${min}</small>${cats ? `<small class="provider-card__cats">${esc(cats)}</small>` : ''}</span></a>`;
  }).join('\n');
  // Provider Organization nodes — one per provider, each `sameAs` its REAL
  // official site (omitted when none is verified — never fabricated). The
  // ItemList entries reference these by @id so the provider hub resolves every
  // listed provider to the authoritative entity. Mirrors the web app's provider
  // Organization nodes (verified PROVIDER_OFFICIAL_URLS only — no guessed
  // Wikidata).
  const providerOrgNodes = sortedNames.map(providerOrgNode);
  // Breadcrumb + CollectionPage whose ItemList links every provider page —
  // an explicit, crawlable map of the provider hub.
  const provJsonLd = jsonForScript({ '@context': 'https://schema.org', '@graph': [
    { '@type': 'BreadcrumbList', itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'דף הבית', item: SITE + '/' },
      { '@type': 'ListItem', position: 2, name: 'ספקים', item: url },
    ] },
    { '@type': 'CollectionPage', name: 'כל הספקים', url, inLanguage: 'he-IL',
      isPartOf: { '@id': WEBSITE_ID }, publisher: { '@id': ORG_ID },
      mainEntity: {
        '@type': 'ItemList', numberOfItems: sortedNames.length,
        itemListElement: sortedNames.map((name, i) => ({
          '@type': 'ListItem', position: i + 1, name,
          url: `${SITE}/provider-${providerSlug(name)}.html`,
          item: { '@id': `${SITE}/provider-${providerSlug(name)}.html#org` },
        })),
      } },
    ...providerOrgNodes,
  ] });
  return `<!DOCTYPE html>
<html lang="he" dir="rtl">
${head('כל הספקים — מסלולים ומחירים לפי חברה | SWITCHY', 'כל ספקי התקשורת בישראל במקום אחד — סלקום, פרטנר, פלאפון, גולן, בזק, הוט, yes ועוד. בחרו ספק וראו את כל המסלולים שלו.', url, provJsonLd, false, 'website')}
<body id="top">
${navNoCta}
  <main id="main">
    <section class="lead-hero">
      <div class="hero-decor" aria-hidden="true" data-parallax="0.18">${heroDecor()}</div>
      <div class="container">
        <p class="crumbs"><a href="index.html">דף הבית</a> ← ספקים</p>
        <h1>כל ה<span class="hl">ספקים</span></h1>
        <p>כל חברות התקשורת במקום אחד. בחרו ספק כדי לראות את כל המסלולים שלו, מחירים ודירוגים.</p>
      </div>
    </section>
    <section class="section">
      <div class="container">
        <div class="provider-grid">
${cards}
        </div>
      </div>
    </section>
${trustBlock()}
    <section class="cta" id="cta">
      <div class="container cta__inner reveal">
        <h2>לא בטוחים איזה ספק מתאים לכם?</h2>
        <p>השאירו פרטים ונשווה את כל החברות עבורכם, עם המלצה מנומקת — חינם, בלי התחייבות.</p>
        ${leadFormHtml('קבלו המלצה אישית תוך 2 דקות ←')}
        <p class="cta__note" id="leadNote" role="status" aria-live="polite"></p>
        <a class="cta__wa" href="https://wa.me/972505037537" target="_blank" rel="noopener">${svgIcon('chat')}מעדיפים וואטסאפ? דברו איתנו</a>
      </div>
    </section>
  </main>
${footer}
  ${leadsConfigTag()}
  <script src="${JS_SRC}" defer></script>
</body>
</html>
`;
}

// ── Shared telecom glossary (single source of truth) ─────────────────────────
// The plain-language definitions that used to live ONLY inline in comparePage()'s
// <details> glossary. Lifting them to data lets the compare tool, the standalone
// /glossary.html hub, and the glossary's DefinedTermSet JSON-LD all render from
// the SAME copy — they can never drift. `tip` is the short tooltip (compare-page
// help button); `term`/`def` are the heading + full definition. No new telecom
// facts: identical wording to the previously-shipped glossary, plus a few terms
// that already appear verbatim across the guides (sense-checked, evergreen).
const GLOSSARY = [
  { id: '5g', term: '5G והשהיה (latency)',
    def: 'הדור החמישי של רשת הסלולר — מהיר ויציב יותר באזורים עמוסים, עם זמן תגובה קצר. דורש מכשיר תומך וכיסוי באזור.',
    tip: '5G הוא הדור החמישי של הרשת — מהיר ויציב יותר באזורים עמוסים, עם השהיה (latency) נמוכה. דורש מכשיר שתומך וכיסוי באזור שלכם.' },
  { id: 'commitment', term: 'התחייבות',
    def: 'מסלול ללא התחייבות ניתן לביטול בכל עת ללא קנס; התחייבות פעילה עשויה לגרור חיוב יציאה.',
    tip: 'מסלול ללא התחייבות ניתן לביטול בכל עת ללא קנס. מסלול עם התחייבות עשוי לגרור חיוב יציאה אם עוזבים מוקדם.' },
  { id: 'price-after-promo', term: 'מחיר אחרי מבצע',
    def: 'הסכום שתשלמו כשמסתיימת תקופת ההיכרות (לרוב אחרי 12 חודשים). השוו לפי המחיר הקבוע, לא רק לפי מחיר המבצע.',
    tip: 'המחיר שתשלמו כשתקופת ההיכרות מסתיימת (לרוב אחרי 12 חודשים). תמיד השוו לפי המחיר הקבוע, לא רק לפי מחיר המבצע.' },
  { id: 'esim', term: 'eSIM',
    def: 'כרטיס SIM דיגיטלי בלי כרטיס פיזי, מופעל בסריקת קוד — נוח במיוחד לחבילות חו״ל.',
    tip: 'כרטיס SIM דיגיטלי שמותקן בטלפון בלי כרטיס פיזי — מופעל בסריקת קוד, נוח במיוחד לחבילות גלישה בחו״ל.' },
  { id: 'equipment', term: 'ציוד (נתב/ממיר)',
    def: 'הנתב או הממיר הכלולים בחבילה. בדקו אם מדובר בהשאלה או רכישה ואם יש דמי התקנה.',
    tip: 'הציוד הכלול בחבילה — נתב (אינטרנט) או ממיר (טלוויזיה). שימו לב אם יש דמי השאלה או רכישה חד-פעמית.' },
  { id: 'fiber', term: 'סיב אופטי (Fiber / FTTH)',
    def: 'התשתית המהירה והיציבה ביותר, עם מהירויות עד גיגה (1000Mb) והשהיה נמוכה — מצוין לעבודה מהבית, גיימינג וסטרימינג 4K.',
    tip: 'סיב אופטי הוא התשתית המהירה והיציבה ביותר, עם מהירויות עד גיגה והשהיה נמוכה.' },
  { id: 'infra-vs-isp', term: 'תשתית מול ספק (ISP)',
    def: 'חשבון האינטרנט מורכב משניים: חברת התשתית (שמביאה את הקו לבית) וספק האינטרנט. אפשר לבחור כל אחד בנפרד, ולעיתים חבילה מאוחדת זולה יותר.',
    tip: 'באינטרנט אתם משלמים על שני רכיבים — חברת התשתית שמביאה את הקו, וספק האינטרנט (ISP). השוו את שניהם.' },
  { id: 'triple', term: 'חבילה משולבת (טריפל)',
    def: 'אינטרנט, טלוויזיה וסלולר בחבילה אחת ובחשבון אחד — לרוב המסלול הכי חסכוני לעומת רכישת כל שירות בנפרד.',
    tip: 'טריפל = אינטרנט + טלוויזיה + סלולר בחבילה אחת. לרוב זול יותר מרכישת כל שירות בנפרד.' },
  { id: 'number-port', term: 'ניוד מספר',
    def: 'תהליך מוסדר ומפוקח שבו הספק החדש מעביר אליו את המספר הקיים מהספק הישן — בלי שתצטרכו לבטל ידנית. בסלולר לרוב יום-יומיים.',
    tip: 'ניוד מספר שומר על המספר הקיים שלכם במעבר ספק. הספק החדש מבצע אותו מול הישן, תוך 1–3 ימי עסקים.' },
];

// Render the glossary as a <details> block (compare page keeps its collapsible
// help affordance) — built from GLOSSARY so it mirrors the standalone hub exactly.
function compareGlossaryDetails() {
  const items = GLOSSARY.map((t) => `            <div class="cmp-glossary__item">
              <dt><button type="button" class="cmp-help" aria-label="${esc('הסבר: ' + t.term)}" data-tip="${esc(t.tip)}">?</button> ${esc(t.term)}</dt>
              <dd>${esc(t.def)}</dd>
            </div>`).join('\n');
  return `        <details class="cmp-glossary">
          <summary>מה המשמעות של כל שורה בטבלה?</summary>
          <dl class="cmp-glossary__list">
${items}
          </dl>
        </details>`;
}

function comparePage() {
  const url = `${SITE}/compare.html`;
  const data = catalogue.plans.map((p) => ({
    id: p.id, cat: p.cat, provider: p.provider, plan: p.plan, price: p.price, priceExact: p.priceExact,
    after: p.after, net: p.net, is5G: p.is5G, noCommit: p.noCommit, hasAbroad: p.hasAbroad,
    specs: p.specs, equipment: p.equipment, setupFee: p.setupFee, rangeExtender: p.rangeExtender,
  }));
  const optionsFor = (preId) => categories.map((c) => {
    const opts = (plansByCat[c.slug] || []).map((p) =>
      `<option value="${esc(p.id)}"${p.id === preId ? ' selected' : ''}>${esc(p.provider)} — ${esc(p.plan)} (₪${priceText(p)})</option>`).join('');
    return `<optgroup label="${esc(c.name)}">${opts}</optgroup>`;
  }).join('');
  const firstTwo = (plansByCat['cellular'] || []).slice(0, 2).map((p) => p.id);
  const sel = (i, preId) =>
    `<select class="compare-pick filter-search" id="cmp${i}" aria-label="מסלול ${i + 1}"><option value="">— בחרו מסלול —</option>${optionsFor(preId)}</select>`;
  // The comparison tool is an interactive WebApplication; pair it with a
  // breadcrumb so the page is well-typed for search. The page lets the visitor
  // compare EVERY catalogue plan (window.__PLANS__ below), so the AI-facing graph
  // also carries, de-duplicated, ONE Product per plan (additionalType TelecomService,
  // provider referenced by @id) + its Offer (monthly base + real one-time install/
  // connection fee) + ONE Organization per provider, plus a single page-level
  // AggregateOffer (real min/max/count). This mirrors the rich web/lib/schema.ts
  // structured data onto the static page AI engines actually crawl — same prices/
  // providers as the visible tool, so HTML and JSON-LD agree.
  const comparePlans = catalogue.plans;
  const compareGraph = [
    { '@type': 'BreadcrumbList', itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'דף הבית', item: SITE + '/' },
      { '@type': 'ListItem', position: 2, name: 'השוואה', item: url },
    ] },
    { '@type': 'WebApplication', name: 'השוואת מסלולים צד לצד', url, inLanguage: 'he-IL',
      applicationCategory: 'BusinessApplication', browserRequirements: 'requires JavaScript',
      isPartOf: { '@id': WEBSITE_ID }, publisher: { '@id': ORG_ID },
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'ILS' } },
    ...planGraphNodes(comparePlans, url),
  ];
  const compareAggOffer = categoryAggregateOfferNode(comparePlans);
  if (compareAggOffer) compareGraph.push(compareAggOffer);
  const compareJsonLd = jsonForScript({ '@context': 'https://schema.org', '@graph': compareGraph });
  return `<!DOCTYPE html>
<html lang="he" dir="rtl">
${head('השוואת מסלולים צד לצד | SWITCHY', 'בחרו עד 3 מסלולים והשוו אותם צד לצד — מחיר, רשת, 5G, התחייבות, חו״ל ומפרט. מכל חברות התקשורת.', url, compareJsonLd, false, 'website')}
<body id="top">
${nav}
  <main id="main">
    <section class="lead-hero">
      <div class="hero-decor" aria-hidden="true" data-parallax="0.18">${heroDecor()}</div>
      <div class="container">
        <p class="crumbs"><a href="index.html">דף הבית</a> ← השוואה</p>
        <h1>השוואת מסלולים <span class="hl">צד לצד</span></h1>
        <p>בחרו עד 3 מסלולים והשוו ביניהם — מחיר, רשת, התחייבות, חו״ל ומפרט.</p>
      </div>
    </section>
    <section class="section">
      <div class="container">
        <div class="compare-picks">
          ${sel(0, firstTwo[0])}
          ${sel(1, firstTwo[1])}
          ${sel(2, '')}
        </div>
        <div id="compareTable" class="compare-table-wrap"></div>
        <p class="cmp__caveat">המחירים כוללים מע״מ ונכונים למועד עדכון האתר (${BUILD_DATE_HE}). מחירים ותנאים עשויים להשתנות — יש לאמת את הפרטים המלאים מול הספק לפני התקשרות.</p>
${compareGlossaryDetails()}
        <p style="text-align:center;margin-top:14px"><a href="glossary.html">מילון מונחי תקשורת — כל ההסברים ←</a></p>
      </div>
    </section>
${trustBlock()}
    <section class="cta" id="cta">
      <div class="container cta__inner reveal">
        <h2>בחרתם? נעזור לכם לעבור</h2>
        <p>השאירו פרטים ונדאג לכל המעבר — חינם, בלי התחייבות.</p>
        ${leadFormHtml('קבלו המלצה אישית תוך 2 דקות ←')}
        <p class="cta__note" id="leadNote" role="status" aria-live="polite"></p>
        <a class="cta__wa" href="https://wa.me/972505037537" target="_blank" rel="noopener">${svgIcon('chat')}מעדיפים וואטסאפ? דברו איתנו</a>
      </div>
    </section>
  </main>
${footer}
  <script>window.__PLANS__ = ${jsonForScript(data)};</script>
  ${leadsConfigTag()}
  <script src="${JS_SRC}" defer></script>
</body>
</html>
`;
}

// ── App showcase page (mirrors the in-app feature set) ──────────────────────
// Feature groups — titles & copy match the app's own Hebrew screen names so the
// site and the app stay in sync.
const APP_GROUPS = [
  ['🔎', 'השוואה והמלצה', [
    ['📝', 'שאלון חיסכון', 'כמה שאלות קצרות על השימוש שלכם — ומקבלים התאמה אישית, לא רשימה גנרית.'],
    ['✦', 'ההתאמות שלי', 'דאשבורד חכם עם המסלול המומלץ לכל קטגוריה, אחוז התאמה והחיסכון הצפוי.'],
    ['🤖', 'SWITCHY AI', 'יועץ התקשורת החכם — שואלים בשפה חופשית ("מה הכי משתלם לי?") ומקבלים תשובה מנומקת.'],
    ['🧮', 'מחשבון מעבר', 'מזינים חשבון נוכחי, מסלול חדש ודמי ניתוק — ורואים תוך כמה זמן המעבר מחזיר את עצמו.'],
    ['📍', 'בדיקת זמינות', 'בודקים אילו ספקי אינטרנט וסיב זמינים בכתובת שלכם — מהירות, מחיר ואמינות.'],
  ]],
  ['💰', 'חיסכון ומעקב', [
    ['🧾', 'החשבונות שלי', 'מזינים כמה אתם משלמים בכל קטגוריה ורואים מיד את ההוצאה הכוללת והחיסכון הפוטנציאלי.'],
    ['📊', 'החיסכון שלי', 'חיסכון שנתי פוטנציאלי, ההזדמנות הכי גדולה שלכם ופירוט מלא לפי קטגוריה.'],
    ['⏰', 'התראת חידוש', 'מזכירים לכם ~21 יום לפני שהמבצע נגמר — לפני שהמחיר קופץ בחשבון.'],
    ['📋', 'טבלת השוואה מלאה', 'לקראת חידוש — כל החלופות מדורגות לפי חיסכון והתאמה, עם הסבר לכל המלצה.'],
    ['🚦', 'מעקב מעבר', 'מעקב שלב-אחר-שלב על המעבר: הצטרפות, אישור, ניוד והשלמה — בזמן אמת.'],
  ]],
  ['💬', 'קהילה ואמון', [
    ['👥', 'קהילת SWITCHY', 'פיד פעיל עם ערוצים לכל נושא — המלצות, סלולר, אינטרנט, חו״ל ועזרה בניתוק.'],
    ['💬', 'הצ׳אט הקהילתי', 'שואלים את הקהילה, מגיבים, משתפים תמונה או הקלטה — ומסמנים פוסטים לשמירה.'],
    ['⭐', 'דירוגי ספקים', 'לוח דירוגים של כל החברות: דירוג כולל, מחיר, שירות, כיסוי ומהירות — מלקוחות אמיתיים.'],
    ['🎧', 'דנה — ליווי אישי', 'נציגה שמלווה את המעבר בצ׳אט: סטטוס, ניוד מספר וכל שאלה — "מלווים, לא מנתקים".'],
  ]],
  ['🤝', 'המעבר עצמו', [
    ['🎥', 'פגישת וידאו עם נציג', 'קובעים פגישת Zoom של 30 דקות, יום מראש — נציג מציג הצעת מחיר מותאמת, פנים מול פנים.'],
    ['📱', 'בקשת ניוד מספר', 'שומרים על אותו מספר. ממלאים טופס קצר ואנחנו מבצעים את הניוד מול הספק הישן.'],
    ['🛟', 'מעבר מלווה', 'אנחנו עושים את העבודה — בלי כאב ראש, בלי עמלות, ועם ערבות שלא תחויבו פעמיים.'],
  ]],
];

// AI advisor preview — a short scripted exchange + quick-start chips.
// Quick-start chips for the AI advisor preview — [icon, label]. The icon is an
// inline SVG (not emoji); the label is what gets sent as the question text.
const AI_CHIPS = [
  ['✨', 'מה הכי משתלם לי?'], ['📱', 'סלולר הכי זול'], ['🌐', 'אינטרנט 1000Mb'],
  ['✅', 'ללא התחייבות'], ['✈️', 'חבילת חו״ל'], ['💰', 'פחות מ-₪50'],
];

function appPage() {
  const url = `${SITE}/app.html`;
  const groups = APP_GROUPS.map(([gIcon, gTitle, items]) => {
    const cards = items.map(([icon, h, p]) =>
      `          <article class="feature reveal"><span class="feature__icon">${iconFor(icon)}</span><h3>${esc(h)}</h3><p>${esc(p)}</p></article>`).join('\n');
    // <section> landmark labelled via aria (not a heading element) so the page's
    // h1→h2→h3 hierarchy stays intact while each feature group is still announced.
    return `      <section class="app-group" aria-label="${esc(gTitle)}">
        <header class="section__head reveal"><span class="eyebrow eyebrow--ico">${iconFor(gIcon)} ${esc(gTitle)}</span></header>
        <div class="features">
${cards}
        </div>
      </section>`;
  }).join('\n');

  // Channel list mirrors the in-app community channels — shown as honest "what
  // you'll find inside" chips, not as a fake live feed with fabricated posts.
  const channels = ['המלצות', 'סלולר', 'אינטרנט', 'טלוויזיה', 'חו״ל', 'עזרה בניתוק'];
  const chanChips = channels.map((c) => `<span class="chip">${esc(c)}</span>`).join('\n          ');

  const aiChips = AI_CHIPS.map(([ico, label]) =>
    `<span class="ai-chip" data-q="${esc(label)}"><span class="ai-chip__ico" aria-hidden="true">${iconFor(ico)}</span><span class="ai-chip__txt">${esc(label)}</span></span>`).join('');

  const appJsonLd = jsonForScript({ '@context': 'https://schema.org', '@graph': [
    { '@type': 'BreadcrumbList', itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'דף הבית', item: SITE + '/' },
      { '@type': 'ListItem', position: 2, name: 'האפליקציה', item: url },
    ] },
    { '@type': 'SoftwareApplication', name: 'SWITCHY', applicationCategory: 'FinanceApplication',
      operatingSystem: 'iOS, Android', inLanguage: 'he-IL',
      description: 'השוואת מחירי תקשורת בישראל — סלולר, אינטרנט, טלוויזיה וחו״ל. עם AI, מעקב מסלולים והתראות חידוש.',
      author: { '@id': ORG_ID }, publisher: { '@id': ORG_ID },
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'ILS', availability: 'https://schema.org/PreOrder' },
      screenshot: [`${SITE}/assets/app/shot-home.webp`, `${SITE}/assets/app/shot-results.webp`, `${SITE}/assets/app/shot-meeting.webp`],
    },
  ] });

  return `<!DOCTYPE html>
<html lang="he" dir="rtl">
${head('האפליקציה של SWITCHY — כל היכולות | SWITCHY', 'הכירו את אפליקציית SWITCHY: SWITCHY AI, קהילה והצ׳אט הקהילתי, מעקב מעבר, התראות חידוש, דירוגי ספקים, בדיקת זמינות, מחשבון מעבר וניוד מספר — הכל במקום אחד.', url, appJsonLd, false, 'website')}
<body id="top">
${nav}
  <main id="main">
    <section class="lead-hero">
      <div class="hero-decor" aria-hidden="true" data-parallax="0.18">${heroDecor()}</div>
      <div class="container">
        <p class="crumbs"><a href="index.html">דף הבית</a> ← האפליקציה</p>
        <h1>האפליקציה ש<span class="hl">עושה את העבודה</span></h1>
        <p>SWITCHY היא לא עוד טבלת השוואה — היא מלווה אתכם מההשוואה ועד החיסכון, ואחר כך דואגת שלא תשלמו יותר מדי שוב. כל היכולות, בעברית, במקום אחד.</p>
        <div class="lead-hero__cta">
          <a class="btn btn--primary btn--lg" href="#cta">קבלו גישה מוקדמת</a>
          <a class="btn btn--ghost btn--lg" href="plans.html">או דפדפו במסלולים</a>
        </div>
        <p class="hero__social"><span class="hero__social-ico" aria-hidden="true">${svgIcon('people')}</span> <strong>הצטרפו לרשימת ההמתנה</strong> — היו מהראשונים לקבל את האפליקציה</p>
      </div>
    </section>

    <section class="section" aria-label="צילומי מסך מהאפליקציה">
      <div class="container">
        <header class="section__head reveal"><span class="eyebrow">הצצה פנימה</span><h2>ככה זה נראה באמת</h2><p>צילומי מסך אמיתיים מהאפליקציה — לא הדמיות.</p></header>
        <div class="app-shots">
          <figure class="app-shot reveal"><img src="assets/app/shot-home.webp" alt="מסך הבית של SWITCHY — חיסכון פוטנציאלי ועסקאות חמות" width="390" height="844" loading="lazy" decoding="async"><figcaption>דף הבית — החיסכון שלכם במבט אחד</figcaption></figure>
          <figure class="app-shot reveal"><img src="assets/app/shot-results.webp" alt="השוואת מסלולים ב-SWITCHY — דירוג חכם וציון התאמה" width="390" height="844" loading="lazy" decoding="async"><figcaption>השוואת מסלולים עם ציון התאמה</figcaption></figure>
          <figure class="app-shot reveal"><img src="assets/app/shot-meeting.webp" alt="קביעת פגישת וידאו ב-Zoom עם נציג מכירות" width="390" height="844" loading="lazy" decoding="async"><figcaption><img class="app-shot__zoom" src="assets/logos/zoom.svg" alt="" width="16" height="16"> פגישת Zoom אישית עם נציג</figcaption></figure>
        </div>
      </div>
    </section>

    <section class="section section--alt">
      <div class="container">
        <header class="section__head reveal"><span class="eyebrow">מה יש באפליקציה</span><h2>כל הכלים לחסוך — בלי כאב ראש</h2><p>כל יכולת שתראו כאן קיימת באפליקציה עצמה.</p></header>
${groups}
      </div>
    </section>

    <section class="section section--alt" id="community">
      <div class="container">
        <header class="section__head reveal"><span class="eyebrow eyebrow--ico">${iconFor('💬')} קהילת SWITCHY</span><h2>הצ׳אט הקהילתי — חוכמת ההמון</h2><p>צ׳אט קהילתי עם ערוץ לכל נושא: שואלים, מגיבים, משתפים תמונה או הקלטה — ולומדים מאנשים שכבר עברו.</p></header>
        <div class="cta__inner reveal" style="text-align:center">
          <div class="providers__row" aria-label="ערוצי הקהילה">
          ${chanChips}
          </div>
          <p style="margin:18px auto 0;max-width:46ch">הקהילה רק נפתחת — היו מהראשונים לפתוח דיון ולעזור לחברים לחסוך. הצ׳אט המלא, עם פרסום, תגובות, תמונות והקלטות, מחכה לכם באפליקציה.</p>
          <div class="hero__cta" style="justify-content:center;margin-top:20px">
            <a class="btn btn--primary btn--lg" href="#cta">הצטרפו לקהילה ←</a>
          </div>
        </div>
      </div>
    </section>

    <section class="section">
      <div class="container">
        <header class="section__head reveal"><span class="eyebrow eyebrow--ico">${iconFor('🤖')} SWITCHY AI</span><h2>יועץ התקשורת החכם שלכם</h2><p>שואלים בשפה חופשית — מקבלים המלצה מנומקת עם חיסכון שנתי.</p></header>
        <div class="ai-demo reveal">
          <div class="ai-chat" id="aiChat">
            <div class="ai-bubble ai-bubble--bot">היי! אני SWITCHY AI — שאלו אותי על מסלולי סלולר, אינטרנט, טלוויזיה או חו״ל, ואני אענה לפי הנתונים האמיתיים שלנו.</div>
          </div>
          <div class="ai-chips" aria-label="שאלות מהירות לדוגמה">${aiChips}</div>
          <form class="ai-input" id="aiChatForm">
            <input type="text" id="aiChatInput" maxlength="500" placeholder="שאלו אותי כל דבר על מסלולים..." aria-label="שאלו את SWITCHY AI" autocomplete="off" />
            <button type="submit" class="btn btn--primary">שלחו</button>
          </form>
          <p class="ai-foot">SWITCHY AI עונה לפי מסלולים אמיתיים מהקטלוג — לא ייעוץ אישי מחייב.</p>
        </div>
      </div>
    </section>

    <section class="cta" id="cta">
      <div class="container cta__inner reveal">
        <h2>רוצים את האפליקציה?</h2>
        <p>השאירו פרטים ונעדכן אתכם ברגע שהיא זמינה — חינם, בלי התחייבות.</p>
        ${leadFormHtml('עדכנו אותי')}
        <p class="cta__note" id="leadNote" role="status" aria-live="polite"></p>
        <a class="cta__wa" href="https://wa.me/972505037537" target="_blank" rel="noopener">${svgIcon('chat')}מעדיפים וואטסאפ? דברו איתנו</a>
      </div>
    </section>
  </main>
${footer}
  ${leadsConfigTag()}
  <script src="${JS_SRC}" defer></script>
</body>
</html>
`;
}

// ── Collections (best-of landing pages) ─────────────────────────────────────
// Each is a DISTINCT cross-cutting filter over the real catalogue (never a whole
// category — that would duplicate the category page). 100% factual: derived from
// plans.json fields, no fabricated signal. Pages carry ItemList + Breadcrumb JSON-LD.
const collections = [
  {
    slug: 'cellular-5g', catSlug: 'cellular', catName: 'סלולר', eyebrow: '5G',
    title: 'מסלולי 5G הזולים ביותר — השוואת מחירים מלאה | SWITCHY',
    h1: 'מסלולי 5G — מהזול ביותר',
    desc: 'כל מסלולי ה-5G בשוק במקום אחד, ממוינים מהזול ביותר. מהירות וכיסוי משופרים — לרוב במחיר של מסלול רגיל.',
    intro: '5G כבר לא יקר יותר. ריכזנו את כל מסלולי ה-5G, ממוינים מהזול ליקר — בדקו תמיד גם את המחיר שאחרי המבצע.',
    filter: (p) => p.cat === 'cellular' && p.is5G, limit: 15,
  },
  {
    slug: 'plans-no-commitment', catSlug: 'cellular', catName: 'סלולר', eyebrow: 'גמישות מלאה',
    title: 'מסלולים ללא התחייבות — סלולר ואינטרנט | SWITCHY',
    h1: 'מסלולים ללא התחייבות',
    desc: 'מסלולי סלולר ואינטרנט ללא התחייבות — עוזבים מתי שרוצים. ממוינים מהזול ביותר, מחירים מעודכנים מכל החברות.',
    intro: 'ללא התחייבות = הכוח בידיים שלכם: אם המחיר קופץ, פשוט עוברים. הנה המסלולים ללא התחייבות בשוק.',
    filter: (p) => (p.cat === 'cellular' || p.cat === 'internet') && p.noCommit, limit: 18,
  },
  {
    slug: 'internet-giga', catSlug: 'internet', catName: 'אינטרנט', eyebrow: '1000Mb',
    title: 'אינטרנט גיגה (1000Mb) — השוואת מחירים | SWITCHY',
    h1: 'אינטרנט גיגה — 1000Mb',
    desc: 'מסלולי אינטרנט במהירות גיגה (1000Mb) ממוינים מהזול ביותר — לבתים עם הרבה משתמשים כבדים במקביל.',
    intro: 'מהירות גיגה משתלמת לבתים עם הרבה משתמשים כבדים. הנה מסלולי הגיגה בשוק, ממוינים מהזול ליקר.',
    filter: (p) => p.cat === 'internet' && /1000|גיגה|ג׳יגה/.test([p.plan, (p.feats || []).join(' '), JSON.stringify(p.specs || {})].join(' ')),
    limit: 12,
  },
  {
    slug: 'esim-abroad', catSlug: 'abroad', catName: 'חבילות חו״ל', eyebrow: 'eSIM',
    title: 'חבילות eSIM לחו״ל — השוואת מחירים | SWITCHY',
    h1: 'חבילות eSIM לחו״ל',
    desc: 'חבילות eSIM דיגיטליות לכל יעד — ממוינות מהזול ביותר. מתקינים מראש, נוחתים ומחוברים, וחוסכים מול רומינג.',
    intro: 'eSIM זול בהרבה מרומינג רגיל ומותקן עוד לפני שיוצאים מהבית. הנה חבילות ה-eSIM, ממוינות מהזול ליקר.',
    filter: (p) => p.cat === 'abroad' && /esim|איראלו|airalo/i.test([p.provider, p.plan, p.net, (p.feats || []).join(' ')].join(' ')),
    limit: 15,
  },
  {
    slug: 'cellular-with-abroad', catSlug: 'cellular', catName: 'סלולר', eyebrow: 'כולל חו״ל',
    title: 'מסלולי סלולר שכוללים גלישה בחו״ל | SWITCHY',
    h1: 'מסלולי סלולר עם גלישה בחו״ל',
    desc: 'מסלולי סלולר שכוללים גלישה בחו״ל בחבילה — בלי לקנות חבילת רומינג נפרדת. ממוינים מהזול ביותר.',
    intro: 'חלק מהמסלולים כוללים גלישה בחו״ל כבר בחבילה. אם אתם נוסעים הרבה, זה יכול לחסוך. הנה המסלולים האלה.',
    filter: (p) => p.cat === 'cellular' && p.hasAbroad, limit: 15,
  },
  {
    slug: 'cellular-budget', catSlug: 'cellular', catName: 'סלולר', eyebrow: 'מתחת ל-₪30',
    title: 'מסלולי סלולר מתחת ל-₪30 — הזולים ביותר | SWITCHY',
    h1: 'מסלולי סלולר מתחת ל-₪30',
    desc: 'מסלולי הסלולר הזולים ביותר — מתחת ל-₪30 לחודש, ממוינים מהזול ביותר. מחירים מעודכנים מכל החברות.',
    intro: 'תקציב קטן? ריכזנו את מסלולי הסלולר שעולים פחות מ-₪30 בחודש, ממוינים מהזול ליקר.',
    filter: (p) => p.cat === 'cellular' && offerPrice(p) < 30, limit: 15,
  },
  {
    slug: 'kosher-plans', catSlug: 'cellular', catName: 'סלולר', eyebrow: 'כשר',
    title: 'מסלולים כשרים — השוואת מחירים מלאה | SWITCHY',
    h1: 'מסלולים כשרים',
    desc: 'מסלולי סלולר כשרים בפיקוח — ממוינים מהזול ביותר. השוו מחירים ותנאים מכל החברות במקום אחד.',
    intro: 'מסלולים כשרים בפיקוח, ממוינים מהזול ליקר — כל האפשרויות במקום אחד.',
    filter: (p) => p.kind === 'kosher', limit: 15,
  },
  {
    slug: 'data-only', catSlug: 'cellular', catName: 'סלולר', eyebrow: 'גלישה בלבד',
    title: 'מסלולי גלישה בלבד (Data Only) לטאבלט וראוטר | SWITCHY',
    h1: 'מסלולי גלישה בלבד (Data Only)',
    desc: 'מסלולי SIM לגלישה בלבד — מושלמים לטאבלט, לראוטר נייד או כקו נתונים משני. ממוינים מהזול ביותר.',
    intro: 'צריכים גלישה בלי קו טלפון — לטאבלט, לראוטר נייד או כקו משני? אלה מסלולי הגלישה בלבד בשוק.',
    filter: (p) => p.kind === 'dataonly', limit: 15,
  },
  {
    slug: 'internet-budget', catSlug: 'internet', catName: 'אינטרנט', eyebrow: 'עד ₪80',
    title: 'אינטרנט ביתי זול — מסלולים עד ₪80 לחודש | SWITCHY',
    h1: 'אינטרנט ביתי עד ₪80',
    desc: 'מסלולי אינטרנט ביתי עד ₪80 לחודש — כולל מבצעים מ-Fiber ומנחושת. ממוינים מהזול ביותר, מחירים מעודכנים.',
    intro: 'אפשר לקבל אינטרנט ביתי מהיר ואיכותי בפחות מ-₪80. הנה כל המסלולים שעונים על התנאי הזה, ממוינים מהזול ליקר.',
    filter: (p) => p.cat === 'internet' && offerPrice(p) <= 80, limit: 12,
  },
  {
    slug: 'triple-budget', catSlug: 'triple', catName: 'חבילה משולבת', eyebrow: 'עד ₪160',
    title: 'חבילה משולבת (טריפל) עד ₪160 לחודש | SWITCHY',
    h1: 'חבילה משולבת עד ₪160',
    desc: 'חבילות משולבות (טריפל: אינטרנט + טלוויזיה + סלולר) עד ₪160 לחודש — ממוינות מהזול ביותר.',
    intro: 'חבילה משולבת זולה לא חייבת לגרוע. הנה הטריפלים שעולים פחות מ-₪160, ממוינים מהזול ליקר.',
    filter: (p) => p.cat === 'triple' && offerPrice(p) <= 160, limit: 10,
  },
  {
    slug: 'internet-cable-only', catSlug: 'internet', catName: 'אינטרנט', eyebrow: 'כבל HOT',
    title: 'אינטרנט על כבל (HOT) — כל המסלולים מהזול ביותר | SWITCHY',
    h1: 'אינטרנט על כבל — כל המסלולים',
    desc: 'כל מסלולי האינטרנט הביתי על תשתית הכבל של HOT — ממוינים מהזול ביותר. זמין כמעט בכל הארץ.',
    intro: 'אינטרנט על כבל זמין בכמעט כל ישוב עירוני בישראל. הנה כל המסלולים על תשתית הכבל, ממוינים מהזול ליקר.',
    filter: (p) => p.cat === 'internet' && p.net === 'כבלים', limit: 15,
  },
  {
    slug: 'internet-fiber-only', catSlug: 'internet', catName: 'אינטרנט', eyebrow: 'סיב אופטי',
    title: 'אינטרנט סיב אופטי (Fiber) — כל ספקי הסיב בישראל | SWITCHY',
    h1: 'אינטרנט סיב אופטי — כל המסלולים',
    desc: 'השוואת כל מסלולי אינטרנט הסיב האופטי (FTTH/Fiber) בישראל — בזק, HOT, פרטנר, גולן וגילת. ממוינים מהזול ביותר.',
    intro: 'אינטרנט סיב אופטי מביא מהירות מלאה ויציבות מקסימלית לבית. הנה כל המסלולים הזמינים בישראל, ממוינים מהזול.',
    filter: (p) => p.cat === 'internet' && p.net === 'סיב אופטי', limit: 20,
  },
  {
    slug: 'tv-streaming-included', catSlug: 'tv', catName: 'טלוויזיה', eyebrow: 'סטרימינג כלול',
    title: 'חבילות טלוויזיה עם Netflix / HBO Max / Disney+ כלולים | SWITCHY',
    h1: 'טלוויזיה עם סטרימינג כלול',
    desc: 'חבילות טלוויזיה שכוללות Netflix, HBO Max, Disney+ או שירות סטרימינג אחר בחבילה — ממוינות מהזול ביותר.',
    intro: 'הנה החבילות שמשלבות טלוויזיה קלאסית עם שירות סטרימינג כלול — בלי לשלם נפרד על Netflix / HBO Max.',
    filter: (p) => p.cat === 'tv' && (p.feats || []).some((f) => /netflix|hbo|disney|max/i.test(f)), limit: 10,
  },
  {
    slug: 'cellular-mid-range', catSlug: 'cellular', catName: 'סלולר', eyebrow: '₪30–₪60',
    title: 'מסלולי סלולר ₪30–₪60 — איזון מחיר ואיכות | SWITCHY',
    h1: 'מסלולי סלולר ₪30–₪60',
    desc: 'מסלולי סלולר בטווח המחיר ₪30–₪60 — שדה האמצע שמאזן תקציב ואיכות. גב גדול, מהירות טובה, מחיר הגיוני.',
    intro: 'לא הכי זול, לא הכי יקר — הטווח הזה מציע גב נתונים גדול, כולל לרוב שיחות ו-SMS, לפעמים גם 5G.',
    filter: (p) => p.cat === 'cellular' && offerPrice(p) >= 30 && offerPrice(p) <= 60, limit: 18,
  },
  {
    slug: 'abroad-daily', catSlug: 'abroad', catName: 'חבילות חו״ל', eyebrow: 'יומי',
    title: 'חבילות חו״ל יומיות — לנסיעות קצרות | SWITCHY',
    h1: 'חבילות חו״ל יומיות',
    desc: 'חבילות גלישה בחו״ל לפי יום — אידיאלי לנסיעות קצרות של ימים ספורים. משלמים רק על מה שמשתמשים.',
    intro: 'נוסעים לכמה ימים? חבילה יומית יכולה להיות זולה יותר מחבילה שבועית. הנה כל החבילות לפי יום, ממוינות מהזול.',
    filter: (p) => p.cat === 'abroad' && (p.priceUnit === 'day' || /יומי|ליום/i.test([p.plan, (p.feats || []).join(' ')].join(' '))), limit: 15,
  },
  {
    slug: 'cellular-esim', catSlug: 'cellular', catName: 'סלולר', eyebrow: 'eSIM',
    title: 'מסלולי סלולר עם eSIM בישראל — השוואת מחירים | SWITCHY',
    h1: 'מסלולי eSIM בישראל',
    desc: 'מסלולי סלולר ישראליים התומכים ב-eSIM — ללא SIM פיזי, מתאים לאייפון ולאנדרואיד תואם eSIM. ממוינים מהזול ביותר.',
    intro: 'eSIM מאפשר לעבור ספק תוך דקות — ללא שליח וללא המתנה. הנה כל המסלולים הישראליים שתומכים ב-eSIM, ממוינים מהזול.',
    filter: (p) => p.cat === 'cellular' && (p.feats || []).some((f) => /esim|eSIM/i.test(f)), limit: 15,
  },
  {
    slug: 'tv-sport', catSlug: 'tv', catName: 'טלוויזיה', eyebrow: 'ספורט',
    title: 'חבילות טלוויזיה עם ספורט — השוואת מחירים | SWITCHY',
    h1: 'טלוויזיה עם ספורט',
    desc: 'חבילות טלוויזיה הכוללות ערוצי ספורט — כדורגל, כדורסל, F1 ועוד. ממוינות מהזול ביותר.',
    intro: 'אוהבי ספורט? הנה החבילות שכוללות ערוצי ספורט — ממוינות מהזול ליקר.',
    filter: (p) => p.cat === 'tv' && (p.feats || []).some((f) => /ספורט|sport/i.test(f)), limit: 10,
  },
  {
    slug: 'cellular-under-40', catSlug: 'cellular', catName: 'סלולר', eyebrow: 'עד ₪40',
    title: 'מסלולי סלולר עד ₪40 לחודש — הזולים ביישראל | SWITCHY',
    h1: 'מסלולי סלולר עד ₪40',
    desc: 'מסלולי סלולר עד ₪40 לחודש — הזולים ביותר בשוק הישראלי. גלישה, שיחות ו-SMS בלי לשלם הרבה.',
    intro: 'חוסכים בסלולר? הנה כל המסלולים עד ₪40 לחודש — ממוינים מהזול ביותר. לרוב כוללים שיחות ו-SMS ללא הגבלה.',
    filter: (p) => p.cat === 'cellular' && offerPrice(p) <= 40, limit: 20,
  },
  {
    slug: 'internet-mid', catSlug: 'internet', catName: 'אינטרנט', eyebrow: 'עד ₪120',
    title: 'אינטרנט ביתי עד ₪120 לחודש — השוואת מחירים | SWITCHY',
    h1: 'אינטרנט ביתי עד ₪120',
    desc: 'מסלולי אינטרנט ביתי בטווח ₪80–₪120 לחודש — בדרך כלל גלאל 500–1000Mbps. ממוינים מהזול ביותר.',
    intro: 'טווח ₪80–₪120 מציע גלאל מהיר ואמין. הנה כל המסלולים בטווח זה, ממוינים מהזול ליקר.',
    filter: (p) => p.cat === 'internet' && offerPrice(p) > 80 && offerPrice(p) <= 120, limit: 15,
  },
];

function collectionPage(col) {
  const url = `${SITE}/${col.slug}.html`;
  const matched = catalogue.plans.filter(col.filter).sort(col.sort || ((a, b) => offerPrice(a) - offerPrice(b)));
  const shown = col.limit ? matched.slice(0, col.limit) : matched;
  const planCards = shown.map(planCardHtml).join('\n      ');
  const crumbs = { '@type': 'BreadcrumbList', itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'דף הבית', item: SITE + '/' },
    { '@type': 'ListItem', position: 2, name: 'כל החבילות', item: SITE + '/plans.html' },
    { '@type': 'ListItem', position: 3, name: col.h1, item: url },
  ] };
  const graph = [crumbs];
  // CollectionPage wrapper carries the plan ItemList and links the page to the
  // site entity; the per-plan Products supply the real price/offer data. We also
  // stamp the real catalogue month (temporalCoverage); a collection-scoped
  // AggregateOffer (real min/max/count) is pushed as its own top-level node below.
  const colAggOffer = categoryAggregateOfferNode(shown, col.catName);
  graph.push({ '@type': 'CollectionPage', name: col.h1, description: col.desc, url, inLanguage: 'he-IL',
    isPartOf: { '@id': WEBSITE_ID }, publisher: { '@id': ORG_ID },
    temporalCoverage: CATALOGUE_MONTH,
    ...(shown.length ? { mainEntity: plansItemListJsonLd(shown, url, col.h1) } : {}) });
  // ONE Organization node per provider listed here (deduped) so the per-plan
  // Products' @id brand/seller refs resolve to a real node — same dedup pattern.
  for (const org of providerOrgsFor(shown)) graph.push(org);
  if (colAggOffer) graph.push(colAggOffer);
  const extraJsonLd = jsonForScript({ '@context': 'https://schema.org', '@graph': graph });
  const guidesHtml = relatedGuides(col.catName, null, 2).map(guideCard).join('\n');
  return `<!DOCTYPE html>
<html lang="he" dir="rtl">
${head(col.title, col.desc, url, extraJsonLd, false, 'website')}
<body id="top">
${nav}
  <main id="main">
    <section class="lead-hero">
      <div class="hero-decor" aria-hidden="true" data-parallax="0.18">${heroDecor()}</div>
      <div class="container">
        <p class="crumbs"><a href="index.html">דף הבית</a> ← <a href="plans.html">כל החבילות</a> ← ${esc(col.h1)}</p>
        <span class="pill">${esc(col.eyebrow)} · השוואה חינם · בלי התחייבות</span>
        <h1>${esc(col.h1)}</h1>
        <p>${esc(col.intro)}</p>
        <div class="hero__cta">
          <a class="btn btn--primary btn--lg" href="#cta">השוו ותחסכו ←</a>
          <a class="btn btn--ghost btn--lg" href="${col.catSlug}.html">לכל מסלולי ה${esc(col.catName)}</a>
        </div>
      </div>
    </section>

    <section class="section" id="plans">
      <div class="container">
        <header class="section__head reveal"><span class="eyebrow">${shown.length} מסלולים</span><h2>${esc(col.h1)}</h2><p>ממוין מהזול ביותר — מחירים מעודכנים מכל החברות.</p>${freshnessBadge()}</header>
        <div class="plan-grid">
      ${planCards}
        </div>
      </div>
    </section>
${guidesHtml ? `
    <section class="section section--alt" aria-label="מדריכים">
      <div class="container">
        <header class="section__head reveal"><span class="eyebrow">כדאי לדעת</span><h2>מדריכים שימושיים</h2></header>
        <div class="guide-cards guide-cards--2">
${guidesHtml}
        </div>
      </div>
    </section>
` : ''}
${trustBlock()}
    <section class="cta" id="cta">
      <div class="container cta__inner reveal">
        <h2>מצאתם משהו מעניין?</h2>
        <p>השאירו פרטים ונעזור לכם לעבור — חינם, בלי התחייבות.</p>
        ${leadFormHtml('קבלו המלצה אישית תוך 2 דקות ←')}
        <p class="cta__note" id="leadNote" role="status" aria-live="polite"></p>
        <a class="cta__wa" href="https://wa.me/972505037537" target="_blank" rel="noopener">${svgIcon('chat')}מעדיפים וואטסאפ? דברו איתנו</a>
      </div>
    </section>
  </main>
${footer}
  ${leadsConfigTag()}
  <script src="${JS_SRC}" defer></script>
</body>
</html>
`;
}

// ── Community page (read-only mirror of the app's community + ratings) ───────
// Posts/replies/ratings are fetched LIVE from Supabase by script.js (same anon
// key, RLS public-read). The page ships empty shells (#communityFeed,
// #ratingsSummary) that JS fills, plus an honest "post via the app" CTA — the
// site never writes community content (posting needs app sign-in).
function communityPage() {
  const url = `${SITE}/community.html`;
  const title = 'קהילת SWITCHY — דיונים אמיתיים ודירוגי ספקים | SWITCHY';
  const desc = 'הצטרפו לקהילת SWITCHY: דיונים אמיתיים על מסלולי סלולר, אינטרנט, טלוויזיה וחו״ל, ודירוגי ספקים מלקוחות אמיתיים. שאלו, השוו ולמדו לפני שאתם עוברים.';
  // Channel filter mirrors the in-app community channels (script.js filters the
  // live feed client-side by data-channel).
  const channels = [
    ['all', 'הכול'], ['recommend', 'המלצות'], ['cellular', 'סלולר'], ['internet', 'אינטרנט'],
    ['tv', 'טלוויזיה'], ['abroad', 'חו״ל'], ['help', 'עזרה בניתוק'],
  ];
  const chanBtns = channels
    .map(([val, label], i) => `<button class="community__chan${i === 0 ? ' community__chan--active' : ''}" type="button" data-channel="${esc(val)}" aria-pressed="${i === 0 ? 'true' : 'false'}">${esc(label)}</button>`)
    .join('\n          ');
  const jsonLd = jsonForScript({ '@context': 'https://schema.org', '@graph': [
    { '@type': 'BreadcrumbList', itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'דף הבית', item: SITE + '/' },
      { '@type': 'ListItem', position: 2, name: 'קהילה', item: url },
    ] },
    { '@type': 'CollectionPage', name: title, description: desc, url, inLanguage: 'he-IL',
      isPartOf: { '@id': WEBSITE_ID }, publisher: { '@id': ORG_ID } },
  ] });
  return `<!DOCTYPE html>
<html lang="he" dir="rtl">
${head(title, desc, url, jsonLd, false, 'website')}
<body id="top">
${navNoCta}
  <main id="main">
    <section class="lead-hero">
      <div class="hero-decor" aria-hidden="true" data-parallax="0.18">${heroDecor()}</div>
      <div class="container">
        <p class="crumbs"><a href="index.html">דף הבית</a> ← קהילה</p>
        <span class="pill pill--ico">${iconFor('💬')} חוכמת ההמון · ניסיון אמיתי</span>
        <h1>קהילת <span class="hl">SWITCHY</span></h1>
        <p>דיונים אמיתיים מאנשים שכבר עברו: מה עבד, מה לא, ואיזה ספק באמת שווה. קראו, השוו ודירוגי ספקים מלקוחות — לפני שאתם מחליטים.</p>
        <div class="lead-hero__cta">
          <a class="btn btn--primary btn--lg" href="app.html">להצטרף ולפרסם — הורידו את האפליקציה</a>
          <a class="btn btn--ghost btn--lg" href="#ratings">לדירוגי הספקים ↓</a>
        </div>
      </div>
    </section>

    <section class="section community">
      <div class="container">
        <header class="section__head reveal"><span class="eyebrow">הצ׳אט הקהילתי</span><h2>מה מדברים עכשיו בקהילה</h2><p>פוסטים אחרונים מהקהילה. לפרסום, תגובות ושיתוף תמונה — הצטרפו דרך האפליקציה.</p></header>
        <div class="community__filter" role="group" aria-label="סינון לפי ערוץ">
          ${chanBtns}
        </div>
        <div id="communityFeed" class="community__feed" aria-live="polite" aria-busy="true">
          <p class="booking__note">טוען דיונים מהקהילה…</p>
        </div>
        <div class="cta__inner reveal" style="text-align:center;margin-top:28px">
          <p style="margin:0 auto;max-width:48ch">רוצים לפתוח דיון, להגיב או לשתף צילום מסך של חשבון? הפרסום מתבצע מתוך האפליקציה — שם גם תקבלו התראות כשמישהו עונה.</p>
          <div class="hero__cta" style="justify-content:center;margin-top:18px">
            <a class="btn btn--primary btn--lg" href="app.html">להצטרף ולפרסם — הורידו את האפליקציה ←</a>
          </div>
        </div>
      </div>
    </section>

    <section class="section section--alt" id="ratings">
      <div class="container">
        <header class="section__head reveal"><span class="eyebrow eyebrow--ico">${svgIcon('star')} דירוגי לקוחות</span><h2>דירוגי ספקים — מהקהילה</h2><p>ממוצע כוכבים וביקורות אמיתיות לכל ספק. נטען חי ממסד הנתונים של SWITCHY.</p></header>
        <div id="ratingsChart" class="ratings-chart" data-chart="ratings" aria-hidden="true"></div>
        <div id="ratingsSummary" class="ratings" aria-live="polite" aria-busy="true">
          <p class="booking__note">טוען דירוגים…</p>
        </div>
      </div>
    </section>
  </main>
${footer}
  ${leadsConfigTag()}
  <script src="${JS_SRC}" defer></script>
</body>
</html>
`;
}

// ── Booking page (Zoom video-consultation, anonymous booking) ────────────────
// The form POSTs directly to Supabase /meetings (server meetings_guard
// validates). script.js owns: building valid slots for the chosen date (Israel
// time, ≥4h ahead, ≤30 days, 30-min grid, Sun–Thu 09:00–20:30 / Fri 09:00–12:30,
// no Saturday), provider pick state, consent gating, and the success/guard-error
// messaging. The date <select> is pre-filled here with the next ~30 valid days.
const BOOK_PROVIDERS = ['HOT', 'yes', 'פרטנר', 'סלקום', 'STING TV', 'בזק', 'הוט מובייל'];
// Build the next ~30 calendar days as ISO values; script.js skips Saturdays when
// populating slots, but we keep all options so the user can pick any day and see
// "no slots" honestly. Generated from the build date for a deterministic file;
// script.js re-derives validity at runtime against the real "now".
function bookDateOptions() {
  const out = [];
  const start = new Date();
  const heDays = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
  for (let i = 0; i < 31; i++) {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const label = `יום ${heDays[d.getDay()]} · ${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
    out.push(`<option value="${iso}">${esc(label)}</option>`);
  }
  return out.join('\n            ');
}
function bookPage() {
  const url = `${SITE}/book.html`;
  const title = 'תיאום פגישת ייעוץ בווידאו (Zoom) — SWITCHY';
  const desc = 'קבעו פגישת ייעוץ אישית בזום עם נציג SWITCHY — נעבור יחד על המסלולים שלכם ונמצא איפה לחסוך. בחרו ספק, יום ושעה; קישור Zoom יישלח למייל לאחר אישור.';
  const providerBtns = BOOK_PROVIDERS
    .map((p) => `<button class="booking__provider" type="button" data-provider="${esc(p)}">${providerLogo(p, 28)}<span>${esc(p)}</span></button>`)
    .join('\n            ');
  const jsonLd = jsonForScript({ '@context': 'https://schema.org', '@graph': [
    { '@type': 'BreadcrumbList', itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'דף הבית', item: SITE + '/' },
      { '@type': 'ListItem', position: 2, name: 'פגישת ייעוץ', item: url },
    ] },
    { '@type': 'Service', name: 'פגישת ייעוץ בווידאו', serviceType: 'ייעוץ השוואת מסלולי תקשורת',
      description: desc, areaServed: 'IL', provider: { '@id': ORG_ID }, inLanguage: 'he-IL',
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'ILS', availability: 'https://schema.org/InStock' } },
  ] });
  return `<!DOCTYPE html>
<html lang="he" dir="rtl">
${head(title, desc, url, jsonLd, false, 'website')}
<body id="top">
${navNoCta}
  <main id="main">
    <section class="lead-hero">
      <div class="hero-decor" aria-hidden="true" data-parallax="0.18">${heroDecor()}</div>
      <div class="container">
        <p class="crumbs"><a href="index.html">דף הבית</a> ← פגישת ייעוץ</p>
        <span class="pill pill--ico">${iconFor('🎥')} פגישת Zoom · חינם · ללא התחייבות</span>
        <h1>תיאום <span class="hl">פגישת ייעוץ</span> בווידאו</h1>
        <p>נציג SWITCHY יעבור איתכם, פנים מול פנים בזום, על המסלולים שלכם — ויראה בדיוק איפה אפשר לחסוך. בחרו ספק, יום ושעה; <strong>קישור ה-Zoom יישלח למייל</strong> מיד לאחר שנציג יאשר את הפגישה.</p>
      </div>
    </section>

    <section class="section booking">
      <div class="container">
        <header class="section__head reveal"><span class="eyebrow">תיאום פגישה</span><h2>בחרו ספק, יום ושעה</h2><p>הפגישה באורך כ-30 דקות. נדרשת הסכמה לתנאים ולמדיניות הפרטיות.</p></header>
        <form id="bookForm" class="booking__form" novalidate>
          <div class="booking__row">
            <label class="booking__field" for="bookName">שם מלא
              <input type="text" id="bookName" name="name" placeholder="ישראל ישראלי" autocomplete="name" required />
            </label>
            <label class="booking__field" for="bookPhone">טלפון
              <input type="tel" id="bookPhone" name="phone" placeholder="050-0000000" autocomplete="tel" inputmode="tel" required />
            </label>
          </div>
          <label class="booking__field" for="bookEmail">אימייל (לקבלת קישור ה-Zoom)
            <input type="email" id="bookEmail" name="email" placeholder="you@example.com" autocomplete="email" inputmode="email" required />
          </label>

          <fieldset class="booking__providers">
            <legend>על איזה ספק נדבר?</legend>
            <div class="booking__providers-grid" role="group" aria-label="בחירת ספק">
            ${providerBtns}
            </div>
            <input type="hidden" id="bookProvider" name="provider" value="" required />
          </fieldset>

          <div class="booking__row">
            <label class="booking__field" for="bookDate">יום
              <select id="bookDate" name="meeting_date" required>
                <option value="">בחרו יום</option>
            ${bookDateOptions()}
              </select>
            </label>
            <div class="booking__field">
              <span class="booking__field-label">שעה</span>
              <div id="slotGrid" class="slot-grid" role="group" aria-label="בחירת שעה" aria-live="polite">
                <p class="booking__note">בחרו יום כדי לראות שעות פנויות.</p>
              </div>
              <input type="hidden" id="bookSlot" name="slot" value="" required />
            </div>
          </div>

          <div class="booking__consent">
            <label class="consent__row" for="bookTerms">
              <input type="checkbox" id="bookTerms" name="terms" required />
              <span>קראתי ואני מסכים/ה ל<a href="terms.html" target="_blank" rel="noopener">תנאי השימוש</a></span>
            </label>
            <label class="consent__row" for="bookPrivacy">
              <input type="checkbox" id="bookPrivacy" name="privacy" required />
              <span>קראתי ואני מסכים/ה ל<a href="privacy.html" target="_blank" rel="noopener">מדיניות הפרטיות</a></span>
            </label>
            <label class="consent__row" for="bookMarketing">
              <input type="checkbox" id="bookMarketing" name="marketing" />
              <span>אני מעוניין/ת לקבל דיוור שיווקי, מבצעים והטבות (אופציונלי, ניתן לבטל בכל עת)</span>
            </label>
          </div>

          <button class="btn btn--primary btn--lg" id="bookSubmit" type="submit">קבעו פגישה ←</button>

          <!-- Email-OTP verification step — hidden until a code is requested -->
          <div class="booking__verify" id="bookVerify" hidden>
            <p class="booking__verify-lead" id="bookVerifyLead" role="status" aria-live="polite"></p>
            <div class="booking__verify-row">
              <label class="booking__field booking__field--code" for="bookCode">קוד אימות
                <input type="text" id="bookCode" name="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]*" maxlength="6" placeholder="------" />
              </label>
              <button class="btn btn--primary" id="bookVerifyBtn" type="button">אימות</button>
            </div>
            <p class="booking__verify-resend">לא קיבלתם? <button type="button" class="linklike" id="bookResend">שלח שוב</button></p>
          </div>

          <p class="booking__note" id="bookNote" role="status" aria-live="polite"></p>
        </form>
        <p class="booking__note" style="text-align:center;margin-top:18px;max-width:52ch;margin-inline:auto">לאחר שליחה, נציג מאשר את הפגישה ואתם מקבלים קישור Zoom למייל. אין צורך להוריד תוכנה — נכנסים מהדפדפן או מאפליקציית Zoom.</p>
      </div>
    </section>
  </main>
${footer}
  ${leadsConfigTag()}
  <script src="${JS_SRC}" defer></script>
</body>
</html>
`;
}

// ── Savings calculators (per-category landing pages) ────────────────────────
// Each compares against the cheapest REGULAR plan in the category (never a
// data-only / kosher SIM — those aren't a like-for-like main line). The number
// is real (from the catalogue); the JS in script.js turns the user's bill into
// an honest "estimated annual saving". Per-month categories only (not abroad).
const CALC_SLUGS = ['cellular', 'internet', 'tv', 'triple'];

function cheapestRegular(catSlug) {
  const list = (plansByCat[catSlug] || []).filter((p) => (p.kind || 'regular') === 'regular');
  return list.slice().sort((a, b) => offerPrice(a) - offerPrice(b))[0] || null;
}

function calculatorPage(c) {
  const ch = cheapestRegular(c.slug);
  if (!ch) return null;
  const url = `${SITE}/calc-${c.slug}.html`;
  const title = `מחשבון חיסכון ${c.name} — כמה אתם משלמים מדי? | SWITCHY`;
  const desc = `מחשבון חיסכון ${c.name}: הזינו כמה אתם משלמים היום וגלו בכמה אפשר לחסוך בשנה מול המסלול הזול ביותר בשוק. חינם, בלי התחייבות.`;
  const h1 = `מחשבון חיסכון ${c.name}`;
  const crumbs = { '@type': 'BreadcrumbList', itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'דף הבית', item: SITE + '/' },
    { '@type': 'ListItem', position: 2, name: c.name, item: `${SITE}/${c.slug}.html` },
    { '@type': 'ListItem', position: 3, name: h1, item: url },
  ] };
  // The savings calculator is an interactive WebApplication (free, JS-driven).
  const calcApp = { '@type': 'WebApplication', name: h1, description: desc, url, inLanguage: 'he-IL',
    applicationCategory: 'FinanceApplication', browserRequirements: 'requires JavaScript',
    isPartOf: { '@id': WEBSITE_ID }, publisher: { '@id': ORG_ID },
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'ILS' } };
  const extraJsonLd = jsonForScript({ '@context': 'https://schema.org', '@graph': [crumbs, calcApp] });
  const guidesHtml = relatedGuides(c.name, null, 2).map(guideCard).join('\n');
  return `<!DOCTYPE html>
<html lang="he" dir="rtl">
${head(title, desc, url, extraJsonLd, false, 'website')}
<body id="top">
${nav}
  <main id="main">
    <section class="lead-hero">
      <div class="hero-decor" aria-hidden="true" data-parallax="0.18">${heroDecor()}</div>
      <div class="container">
        <p class="crumbs"><a href="index.html">דף הבית</a> ← <a href="${c.slug}.html">${esc(c.name)}</a> ← מחשבון חיסכון</p>
        <span class="pill pill--ico">${svgIcon('calculator')} מחשבון חינמי · בלי התחייבות</span>
        <h1>${esc(h1)}</h1>
        <p>הזינו כמה אתם משלמים היום על ${esc(c.name)}, ונראה לכם הערכה כמה אפשר לחסוך בשנה מול המסלול הזול ביותר בשוק.</p>
      </div>
    </section>

    <section class="section">
      <div class="container">
        <div id="calc" class="glass" data-cheapest="${offerPrice(ch)}" data-cat="${c.slug}" style="max-width:560px;margin:0 auto;border:1px solid #E4E8EC;border-radius:18px;padding:28px 24px;box-shadow:0 6px 24px rgba(17,24,39,.05)">
          <h2 style="margin:0 0 6px">כמה אתם יכולים לחסוך על ${esc(c.name)}?</h2>
          <p style="margin:0 0 4px">המסלול הזול ביותר ב${esc(c.name)} כרגע: <span style="color:#0B0F14;font-weight:700">${esc(ch.provider)} ${esc(ch.plan)} — ${priceText(ch)}</span>.</p>
          <label for="calcBill" style="display:block;font-weight:700;margin:14px 0 0">כמה אתם משלמים היום? (₪ לחודש)</label>
          <div class="calc-quick" role="group" aria-label="בחירה מהירה" style="display:flex;gap:8px;flex-wrap:wrap;margin:10px 0 6px">
            ${(() => {
              const monthly = (plansByCat[c.slug] || []).filter((p) => !p.priceUnit || p.priceUnit === 'month').map((p) => p.price).sort((a, b) => a - b);
              if (!monthly.length) return '';
              const pct = (p) => monthly[Math.floor(p * (monthly.length - 1))];
              const vals = [pct(0.4), pct(0.6), pct(0.8), pct(0.95)].map((v) => Math.round((v * 1.6) / 10) * 10).filter((v, i, a) => a.indexOf(v) === i && v > (offerPrice(ch)));
              return vals.slice(0, 4).map((v) => `<button type="button" class="chip calc-quick__btn" data-val="${v}">₪${v}</button>`).join('');
            })()}
          </div>
          <div style="display:flex;gap:10px;flex-wrap:wrap;margin:4px 0 16px">
            <input id="calcBill" class="filter-search" type="number" inputmode="numeric" min="0" placeholder="למשל: 89" style="flex:1 1 220px" />
            <button id="calcBtn" class="btn btn--primary" type="button">חשבו חיסכון</button>
          </div>
          <p id="calcOut" role="status" aria-live="polite" style="display:none;margin:8px 0 0;padding:14px 16px;border-radius:12px;background:#F0F2F4;color:#0B0F14"></p>
          <div id="calcChart" class="calc-chart" data-chart="savings" hidden></div>
          <a id="calcCta" class="btn btn--primary btn--lg" href="#cta" hidden style="margin-top:14px">בדקו אילו מסלולים חוסכים לכם את זה ←</a>
          <p style="margin:12px 0 0;font-size:.85rem;color:#6b7280">* הערכה בלבד — החיסכון בפועל תלוי במסלול שתבחרו ובתנאים. מומלץ לאמת מול הספק.</p>
        </div>
        <div style="text-align:center;margin-top:22px">
          <a class="btn btn--ghost btn--lg" href="${c.slug}.html">לכל מסלולי ה${esc(c.name)} ←</a>
        </div>
      </div>
    </section>
${guidesHtml ? `
    <section class="section section--alt" aria-label="מדריכים">
      <div class="container">
        <header class="section__head reveal"><span class="eyebrow">כדאי לדעת</span><h2>מדריכים שימושיים</h2></header>
        <div class="guide-cards guide-cards--2">
${guidesHtml}
        </div>
      </div>
    </section>
` : ''}
${trustBlock()}
    <section class="cta" id="cta">
      <div class="container cta__inner reveal">
        <h2>רוצים שנמצא לכם את ההצעה הכי טובה?</h2>
        <p>השאירו פרטים ונחזור אליכם עם ההשוואה וההמלצה — חינם, בלי התחייבות.</p>
        ${leadFormHtml('קבלו המלצה אישית תוך 2 דקות ←')}
        <p class="cta__note" id="leadNote" role="status" aria-live="polite"></p>
        <a class="cta__wa" href="https://wa.me/972505037537" target="_blank" rel="noopener">${svgIcon('chat')}מעדיפים וואטסאפ? דברו איתנו</a>
      </div>
    </section>
  </main>
${footer}
  ${leadsConfigTag()}
  <script src="${JS_SRC}" defer></script>
</body>
</html>
`;
}
const builtCalculators = CALC_SLUGS
  .map((slug) => categories.find((c) => c.slug === slug))
  .filter((c) => c && cheapestRegular(c.slug));

// Only collections with enough real matches become pages (no thin/empty pages).
const builtCollections = collections.filter((col) => catalogue.plans.filter(col.filter).length >= 3);
// Guard: two collections sharing a slug would silently overwrite each other's
// HTML file and add a duplicate <loc> to the sitemap (a real SEO defect — see the
// former cellular-budget collision). Fail the build loudly instead.
(() => {
  const seen = new Set(), dup = [];
  for (const col of builtCollections) { if (seen.has(col.slug)) dup.push(col.slug); seen.add(col.slug); }
  if (dup.length) throw new Error(`Duplicate collection slug(s): ${[...new Set(dup)].join(', ')} — each collection slug must be unique.`);
})();

// ── Glossary hub (evergreen explainer, single source of truth) ───────────────
// A standalone "telecom dictionary" assembled from the shared GLOSSARY data —
// the exact same definitions the compare tool surfaces, so they never drift.
// 100% existing copy (no invented facts). Each term links into the most relevant
// hub (category / collection / guide) to deepen crawl depth, and the page carries
// a DefinedTermSet + BreadcrumbList JSON-LD; head() adds Organization/WebSite.
// Each glossary term may name a related on-site destination (label + href) — all
// targets are pages this build already emits, so there are no dead links.
const GLOSSARY_LINKS = {
  '5g': ['מסלולי 5G', 'cellular-5g.html'],
  commitment: ['מסלולים ללא התחייבות', 'plans-no-commitment.html'],
  'price-after-promo': ['איך לקרוא חשבון תקשורת', 'guide-read-bill.html'],
  esim: ['חבילות eSIM לחו״ל', 'esim-abroad.html'],
  equipment: ['השוואת מסלולי אינטרנט', 'internet.html'],
  fiber: ['אינטרנט סיב אופטי', 'internet-fiber-only.html'],
  'infra-vs-isp': ['סיב אופטי מול כבלים', 'guide-fiber.html'],
  triple: ['חבילות משולבות', 'triple.html'],
  'number-port': ['מדריך מעבר ספק', 'guide-switching.html'],
};
function glossaryPage() {
  const url = `${SITE}/glossary.html`;
  const title = 'מילון מונחי תקשורת — 5G, סיב אופטי, eSIM, טריפל וניוד מספר | SWITCHY';
  const desc = 'מילון מונחי התקשורת של SWITCHY — כל המושגים שצריך להבין לפני שמשווים מסלול: 5G והשהיה, התחייבות, מחיר אחרי מבצע, eSIM, סיב אופטי, תשתית מול ספק, חבילה משולבת וניוד מספר. בעברית פשוטה.';
  // Definition cards — each links into the matching hub for deeper crawl reach.
  const cards = GLOSSARY.map((t) => {
    const link = GLOSSARY_LINKS[t.id];
    const linkHtml = link ? `\n            <a class="glossary__link" href="${esc(link[1])}">${esc(link[0])} ←</a>` : '';
    return `          <article class="feature feature--check reveal" id="term-${esc(t.id)}">
            <h3>${esc(t.term)}</h3>
            <p>${esc(t.def)}</p>${linkHtml}
          </article>`;
  }).join('\n');
  // DefinedTermSet — the structured-data twin of the rendered definitions.
  const termSet = {
    '@type': 'DefinedTermSet', '@id': `${url}#glossary`,
    name: 'מילון מונחי תקשורת', url, inLanguage: 'he-IL',
    isPartOf: { '@id': WEBSITE_ID }, publisher: { '@id': ORG_ID },
    hasDefinedTerm: GLOSSARY.map((t) => ({
      '@type': 'DefinedTerm', '@id': `${url}#term-${t.id}`, name: t.term, description: t.def,
      inDefinedTermSet: { '@id': `${url}#glossary` },
    })),
  };
  const glossaryJsonLd = jsonForScript({ '@context': 'https://schema.org', '@graph': [
    { '@type': 'BreadcrumbList', itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'דף הבית', item: SITE + '/' },
      { '@type': 'ListItem', position: 2, name: 'מילון מונחים', item: url },
    ] },
    termSet,
  ] });
  // Cross-links: every category hub + the decision guides — so this evergreen
  // page is a genuine spoke back into the rest of the site.
  const catChips = categories.map((c) => `<a class="chip" href="${c.slug}.html">${iconFor(c.icon)} ${esc(c.name)}</a>`).join('\n          ');
  const guideCards = relatedGuides(null, null, 4).map(guideCard).join('\n');
  return `<!DOCTYPE html>
<html lang="he" dir="rtl">
${head(title, desc, url, glossaryJsonLd, false, 'website')}
<body id="top">
${navNoCta}
  <main id="main">
    <section class="article-hero">
      <div class="container">
        <p class="crumbs"><a href="index.html">דף הבית</a> ← מילון מונחים</p>
        <h1>מילון מונחי תקשורת</h1>
        <div class="article-meta"><span>${GLOSSARY.length} מושגים שכדאי להבין לפני שמשווים מסלול — בעברית פשוטה, בלי ז׳רגון.</span></div>
        <div class="providers__row" style="justify-content:flex-start;margin-top:18px">
          <a class="chip" href="compare.html">${svgIcon('scale')} השוואת מסלולים</a>
          <a class="chip" href="how-it-works.html">${iconFor('✨')} איך SWITCHY עובד</a>
          <a class="chip" href="faq.html">${svgIcon('info')} שאלות נפוצות</a>
        </div>
      </div>
    </section>
    <section class="section">
      <div class="container">
        <header class="section__head reveal"><span class="eyebrow">מושגי מפתח</span><h2>כל המונחים שחשוב להכיר</h2><p>לחצו על מושג כדי לקפוץ לקטגוריה או למדריך הרלוונטי.</p></header>
        <div class="features">
${cards}
        </div>
      </div>
    </section>
    <section class="section section--alt" aria-label="קטגוריות">
      <div class="container">
        <header class="section__head reveal"><span class="eyebrow">להשוואה מלאה</span><h2>בחרו קטגוריה</h2></header>
        <div class="providers__row" style="justify-content:center">
          ${catChips}
        </div>
      </div>
    </section>
    <section class="section" aria-label="מדריכים שימושיים">
      <div class="container">
        <header class="section__head reveal"><span class="eyebrow">כדאי לדעת</span><h2>מדריכים שיעמיקו את התמונה</h2></header>
        <div class="guide-cards guide-cards--4">
${guideCards}
        </div>
      </div>
    </section>
    <section class="cta" id="cta">
      <div class="container cta__inner reveal">
        <h2>מבינים את המונחים — מוכנים להשוות?</h2>
        <p>השאירו פרטים ונחזור אליכם עם ההשוואה וההמלצה — חינם, בלי התחייבות.</p>
        ${leadFormHtml('קבלו המלצה אישית תוך 2 דקות ←')}
        <p class="cta__note" id="leadNote" role="status" aria-live="polite"></p>
        <a class="cta__wa" href="https://wa.me/972505037537" target="_blank" rel="noopener">${svgIcon('chat')}מעדיפים וואטסאפ? דברו איתנו</a>
      </div>
    </section>
  </main>
${footer}
  ${leadsConfigTag()}
  <script src="${JS_SRC}" defer></script>
</body>
</html>
`;
}

// ── Versus pages (factual head-to-head, derived from the catalogue) ──────────
// A "X מול Y" comparison page for two real sides of a category, where each side
// is a filter over plans.json (e.g. סיב אופטי vs כבלים, 5G vs 4G). Everything is
// pulled from the catalogue + the existing decision guide — NO telecom facts are
// invented: the verdict copy comes from the guide's own tl;dr/answers, and the
// per-side stats (cheapest price, plan count) are computed from real plans. Each
// side reuses comparisonTable() + the cheapest planCardHtml, and the page links to
// the category hub, the relevant collections and the guide. JSON-LD: BreadcrumbList
// + a CollectionPage carrying an ItemList of every plan shown (real Offers).
const VERSUS = [
  {
    slug: 'fiber-vs-cable', catSlug: 'internet', catName: 'אינטרנט',
    title: 'סיב אופטי מול כבלים — מה עדיף וכמה זה עולה? | SWITCHY',
    desc: 'השוואה אמיתית בין אינטרנט סיב אופטי לאינטרנט על כבל (HOT): מהירות, יציבות ומחיר — עם המסלולים הזולים בכל תשתית, מתוך הקטלוג המעודכן של SWITCHY.',
    h1: 'סיב אופטי מול כבלים',
    intro: 'שתי התשתיות הנפוצות לאינטרנט ביתי בישראל. סיב אופטי מהיר ויציב יותר; כבל זמין כמעט בכל מקום. הנה ההשוואה — עם המסלולים הזולים בכל צד.',
    verdict: 'סיב אופטי הוא התשתית המהירה והיציבה ביותר, ולרוב הבתים מהירות של 300–500Mb יותר ממספיקה. כבל (HFC) מהיר וזמין נרחב אך לעיתים מאט בשעות עומס. אם סיב זמין בכתובת שלכם — לרוב כדאי. בכל מקרה זכרו שאתם משלמים על תשתית + ספק, והשוו את שניהם.',
    sideA: { label: 'סיב אופטי', eyebrow: 'הכי מהיר', filter: (p) => p.cat === 'internet' && p.net === 'סיב אופטי', collection: 'internet-fiber-only.html' },
    sideB: { label: 'כבלים (HOT)', eyebrow: 'זמין נרחב', filter: (p) => p.cat === 'internet' && p.net === 'כבלים', collection: 'internet-cable-only.html' },
    guideSlug: 'guide-fiber',
  },
  {
    slug: '5g-vs-4g', catSlug: 'cellular', catName: 'סלולר',
    title: '5G מול 4G — מתי באמת כדאי לשדרג וכמה זה עולה? | SWITCHY',
    desc: 'השוואה בין מסלולי 5G ל-4G: מה ההבדל האמיתי ביום-יום, מתי שווה לעבור, וכמה זה עולה — עם המסלולים הזולים בכל דור רשת, מתוך הקטלוג של SWITCHY.',
    h1: '5G מול 4G בסלולר',
    intro: '5G מהיר ויציב יותר באזורים עמוסים, וההפרש במחיר היום הצטמצם מאוד. הנה ההשוואה בין שני דורות הרשת — עם המסלולים הזולים בכל צד.',
    verdict: 'אם הטלפון שלכם תומך ב-5G ויש כיסוי באזור — וההפרש במחיר זהה או קרוב למסלול 4G — אין סיבה לא לעבור, במיוחד באזורים עירוניים עמוסים. אבל אל תשלמו פרמיה גבוהה רק בשביל הכותרת: בגלישה רגילה רוב המשתמשים לא ירגישו הבדל דרמטי.',
    sideA: { label: 'מסלולי 5G', eyebrow: 'הדור החדש', filter: (p) => p.cat === 'cellular' && p.is5G, collection: 'cellular-5g.html' },
    sideB: { label: 'מסלולי 4G', eyebrow: 'מספיק לרוב', filter: (p) => p.cat === 'cellular' && !p.is5G, collection: null },
    guideSlug: 'guide-5g',
  },
  {
    slug: 'triple-vs-separate', catSlug: 'triple', catName: 'חבילה משולבת',
    title: 'חבילה משולבת מול קנייה בנפרד — מה זול יותר? | SWITCHY',
    desc: 'האם טריפל (אינטרנט + טלוויזיה + סלולר ביחד) זול יותר מקניית כל שירות בנפרד? השוואה אמיתית עם החבילות המשולבות הזולות והמסלולים הנפרדים הזולים, מהקטלוג של SWITCHY.',
    h1: 'חבילה משולבת מול קנייה בנפרד',
    intro: 'חבילה משולבת (טריפל) מרכזת אינטרנט, טלוויזיה וסלולר בחשבון אחד. לעומתה אפשר לקנות כל שירות בנפרד ולבחור את הזול בכל קטגוריה. הנה ההשוואה.',
    verdict: 'חבילה משולבת היא לרוב המסלול הכי חסכוני וגם הכי נוח — הכול בחשבון אחד ובמעבר אחד. אבל לא תמיד: לפעמים מצרף של אינטרנט זול + טלוויזיה זולה + קו סלולר זול יוצא פחות. הכלל הפשוט — חשבו את העלות הכוללת של שתי הדרכים והשוו אותן זו לזו.',
    sideA: { label: 'חבילה משולבת (טריפל)', eyebrow: 'הכול ביחד', filter: (p) => p.cat === 'triple', collection: 'triple-budget.html' },
    sideB: { label: 'אינטרנט בנפרד', eyebrow: 'מרכיבים לבד', filter: (p) => p.cat === 'internet', collection: 'internet-fiber-only.html' },
    guideSlug: 'guide-switching',
  },
];

function versusSideHtml(side, catSlug, sideKey) {
  const matched = catalogue.plans.filter(side.filter).sort((a, b) => offerPrice(a) - offerPrice(b));
  if (matched.length < 1) return null;
  const cheapest = matched[0];
  const fromTxt = `${matched.length} מסלולים · החל מ-₪${cheapest.price}${(!cheapest.priceUnit || cheapest.priceUnit === 'month') ? '/חודש' : ''}`;
  // `sideKey` (e.g. 'a'/'b') keeps each table's id unique on the page (the labels
  // are Hebrew and would collapse to an empty ASCII slug → duplicate ids).
  const table = comparisonTable(matched.slice(0, 6), catSlug, `vs-${sideKey}`);
  const colLink = side.collection ? `<a class="btn btn--ghost" href="${esc(side.collection)}">לכל המסלולים בקטגוריה ←</a>` : '';
  return { matched, html: `
    <section class="section" aria-label="${esc(side.label)}">
      <div class="container">
        <header class="section__head reveal"><span class="eyebrow">${esc(side.eyebrow)}</span><h2>${esc(side.label)}</h2><p>${esc(fromTxt)} — ממוין מהזול ביותר.</p></header>
        <div class="plan-grid plan-grid--featured">
${matched.slice(0, 3).map((p) => planCardHtml(p, false)).join('\n')}
        </div>
${colLink ? `        <div style="text-align:center;margin-top:18px">${colLink}</div>` : ''}
      </div>
    </section>${table}` };
}

function versusPage(v) {
  const url = `${SITE}/${v.slug}.html`;
  const a = versusSideHtml(v.sideA, v.catSlug, 'a');
  const b = versusSideHtml(v.sideB, v.catSlug, 'b');
  if (!a || !b) return null;
  const allShown = [...a.matched.slice(0, 6), ...b.matched.slice(0, 6)];
  const guide = guides.find((g) => g.slug === v.guideSlug);
  const guideCardHtml = guide ? guideCard(guide) : '';
  const crumbs = { '@type': 'BreadcrumbList', itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'דף הבית', item: SITE + '/' },
    { '@type': 'ListItem', position: 2, name: v.catName, item: `${SITE}/${v.catSlug}.html` },
    { '@type': 'ListItem', position: 3, name: v.h1, item: url },
  ] };
  const collection = { '@type': 'CollectionPage', name: v.h1, description: v.desc, url, inLanguage: 'he-IL',
    isPartOf: { '@id': WEBSITE_ID }, publisher: { '@id': ORG_ID },
    ...(allShown.length ? { mainEntity: plansItemListJsonLd(allShown, url, v.h1) } : {}) };
  const versusJsonLd = jsonForScript({ '@context': 'https://schema.org', '@graph': [crumbs, collection] });
  return `<!DOCTYPE html>
<html lang="he" dir="rtl">
${head(v.title, v.desc, url, versusJsonLd, false, 'website')}
<body id="top">
${nav}
  <main id="main">
    <section class="lead-hero">
      <div class="hero-decor" aria-hidden="true" data-parallax="0.18">${heroDecor()}</div>
      <div class="container">
        <p class="crumbs"><a href="index.html">דף הבית</a> ← <a href="${v.catSlug}.html">${esc(v.catName)}</a> ← ${esc(v.h1)}</p>
        <span class="pill pill--ico">${svgIcon('scale')} השוואה אמיתית · בלי התחייבות</span>
        <h1>${esc(v.h1)}</h1>
        <p>${esc(v.intro)}</p>
        <div class="hero__cta">
          <a class="btn btn--primary btn--lg" href="#cta">השוו ותחסכו ←</a>
          <a class="btn btn--ghost btn--lg" href="${v.catSlug}.html">לכל מסלולי ה${esc(v.catName)}</a>
        </div>
      </div>
    </section>

    <section class="section section--alt" aria-label="המסקנה">
      <div class="container">
        <div class="prose" style="max-width:760px;margin:0 auto">
          <div class="tldr"><b>השורה התחתונה:</b> ${esc(v.verdict)}</div>
        </div>
      </div>
    </section>
${a.html}
${b.html}
${guideCardHtml ? `
    <section class="section section--alt" aria-label="מדריך מורחב">
      <div class="container">
        <header class="section__head reveal"><span class="eyebrow">להעמקה</span><h2>המדריך המלא</h2></header>
        <div class="guide-cards guide-cards--2">
${guideCardHtml}
        </div>
      </div>
    </section>` : ''}
${trustBlock()}
    <section class="cta" id="cta">
      <div class="container cta__inner reveal">
        <h2>עדיין מתלבטים? נעזור לכם להחליט</h2>
        <p>השאירו פרטים ונחזור אליכם עם ההשוואה וההמלצה המתאימה לכם — חינם, בלי התחייבות.</p>
        ${leadFormHtml('קבלו המלצה אישית תוך 2 דקות ←')}
        <p class="cta__note" id="leadNote" role="status" aria-live="polite"></p>
        <a class="cta__wa" href="https://wa.me/972505037537" target="_blank" rel="noopener">${svgIcon('chat')}מעדיפים וואטסאפ? דברו איתנו</a>
      </div>
    </section>
  </main>
${footer}
  ${leadsConfigTag()}
  <script src="${JS_SRC}" defer></script>
</body>
</html>
`;
}

// Only versus pages whose BOTH sides have real plans become pages (no thin pages).
const builtVersus = VERSUS.filter((v) =>
  catalogue.plans.filter(v.sideA.filter).length >= 1 && catalogue.plans.filter(v.sideB.filter).length >= 1);

// ── Provider-vs-provider comparison pages ────────────────────────────────────
// High-intent "X מול Y" head-to-head pages, one per category two named providers
// both sell in. They DEEPEN crawl coverage on the most-searched comparison terms
// ("סלקום מול פרטנר", "בזק מול הוט אינטרנט") and are built ENTIRELY from the
// exported catalogue — the verdict facts (who is cheaper, who has more 5G/no-
// commit/abroad plans, the cheapest plan on each side) are DERIVED from
// plans.json, never invented. Every comparison is gated on BOTH providers having
// ≥2 plans in the category (builtProviderVs), so no page is thin. The candidate
// list below is intentionally broad; non-qualifying pairs are dropped at build.
const PROVIDER_VS = [
  // cellular — the most-searched head-to-heads (big-3 + the budget challengers)
  ['cellular', 'סלקום', 'פרטנר'],
  ['cellular', 'סלקום', 'פלאפון'],
  ['cellular', 'פרטנר', 'פלאפון'],
  ['cellular', 'גולן טלקום', '019 מובייל'],
  ['cellular', 'רמי לוי', '019 מובייל'],
  ['cellular', 'הוט מובייל', 'גולן טלקום'],
  ['cellular', 'סלקום', 'גולן טלקום'],
  ['cellular', 'פרטנר', 'הוט מובייל'],
  ['cellular', 'Xphone', 'רמי לוי'],
  // internet — fiber/cable infra rivals
  ['internet', 'בזק', 'HOT'],
  ['internet', 'בזק', 'פרטנר'],
  ['internet', 'בזק', 'CCC'],
  ['internet', 'HOT', 'פרטנר'],
  // triple — the bundled-package rivals
  ['triple', 'סלקום', 'HOT'],
  ['triple', 'yes', 'HOT'],
];

// Hebrew possessive helper for catNames in copy ("מסלולי הסלולר של X").
const PROVIDER_VS_MIN = 2; // plans per side required to publish a page

// Build the comparison model for one provider in one category, all from data.
function providerVsSide(provider, catSlug) {
  const plans = catalogue.plans
    .filter((p) => p.cat === catSlug && p.provider === provider)
    .sort((a, b) => offerPrice(a) - offerPrice(b));
  if (!plans.length) return null;
  const monthly = plans.filter((p) => !p.priceUnit || p.priceUnit === 'month');
  const priced = monthly.length ? monthly : plans;
  const from = Math.min(...priced.map((p) => offerPrice(p)));
  const avg = priced.reduce((s, p) => s + offerPrice(p), 0) / priced.length;
  return {
    provider, plans,
    count: plans.length,
    from,
    avg: Math.round(avg),
    cheapest: plans[0],
    n5g: plans.filter((p) => p.is5G).length,
    nNoCommit: plans.filter((p) => p.noCommit).length,
    nAbroad: plans.filter((p) => p.hasAbroad).length,
    bestScore: Math.max(...plans.map((p) => planValueScore(p))),
  };
}

function providerVsSlug(catSlug, a, b) {
  return `${providerSlug(a)}-vs-${providerSlug(b)}-${catSlug}`;
}

// Candidate pairs whose BOTH sides have ≥PROVIDER_VS_MIN plans in the category.
const builtProviderVs = PROVIDER_VS
  .map(([catSlug, a, b]) => {
    const A = providerVsSide(a, catSlug);
    const B = providerVsSide(b, catSlug);
    if (!A || !B || A.count < PROVIDER_VS_MIN || B.count < PROVIDER_VS_MIN) return null;
    const cat = categories.find((c) => c.slug === catSlug);
    return { catSlug, catName: cat ? cat.name : catSlug, catIcon: cat ? cat.icon : '📱', a: A, b: B,
      slug: providerVsSlug(catSlug, a, b) };
  })
  .filter(Boolean);

// One row of the "who wins" dimension table — winner is the side with the better
// figure; ties are honestly marked "תיקו". `lowerWins` flips the comparison for
// price (cheaper wins). All values come straight from the data model above.
function providerVsVerdictRows(v) {
  const { a, b } = v;
  const fmtMoney = (n) => '₪' + (Number.isInteger(n) ? n : n.toFixed(2));
  const win = (av, bv, lowerWins) => {
    if (av === bv) return 'tie';
    const aWins = lowerWins ? av < bv : av > bv;
    return aWins ? 'a' : 'b';
  };
  const rows = [
    ['מחיר התחלתי', fmtMoney(a.from), fmtMoney(b.from), win(a.from, b.from, true)],
    ['מספר מסלולים', String(a.count), String(b.count), win(a.count, b.count, false)],
    ['מסלולי 5G', String(a.n5g), String(b.n5g), win(a.n5g, b.n5g, false)],
    ['ללא התחייבות', String(a.nNoCommit), String(b.nNoCommit), win(a.nNoCommit, b.nNoCommit, false)],
  ];
  // "כולל חו״ל" only makes sense where at least one side bundles it (cellular).
  if (a.nAbroad || b.nAbroad) rows.push(['מסלולים עם חו״ל', String(a.nAbroad), String(b.nAbroad), win(a.nAbroad, b.nAbroad, false)]);
  return rows;
}

// A short, data-derived Hebrew verdict paragraph — no invented facts: it names
// whoever is cheaper and by how much, then notes who carries more 5G / no-commit
// plans. Deterministic for a given catalogue.
function providerVsVerdict(v) {
  const { a, b, catName } = v;
  const cheaper = a.from < b.from ? a : (b.from < a.from ? b : null);
  const dearer = cheaper === a ? b : (cheaper === b ? a : null);
  const fmtMoney = (n) => '₪' + (Number.isInteger(n) ? n : n.toFixed(2));
  let s;
  if (cheaper) {
    const gap = Math.round((dearer.from - cheaper.from) * 100) / 100;
    s = `ב${esc(catName)}, ${esc(cheaper.provider)} פותח/ת זול יותר — מ-${fmtMoney(cheaper.from)} לעומת ${fmtMoney(dearer.from)} אצל ${esc(dearer.provider)} (פער של ${fmtMoney(gap)}). `;
  } else {
    s = `ב${esc(catName)}, שני הספקים פותחים באותו מחיר התחלתי (${fmtMoney(a.from)}). `;
  }
  const more5g = a.n5g === b.n5g ? null : (a.n5g > b.n5g ? a : b);
  if (more5g && more5g.n5g > 0) s += `${esc(more5g.provider)} מציע/ה יותר מסלולי 5G (${more5g.n5g}). `;
  const moreFlex = a.nNoCommit === b.nNoCommit ? null : (a.nNoCommit > b.nNoCommit ? a : b);
  if (moreFlex && moreFlex.nNoCommit > 0) s += `${esc(moreFlex.provider)} מוביל/ה במסלולים ללא התחייבות (${moreFlex.nNoCommit}). `;
  s += 'הכלל הפשוט: השוו לפי המסלול שמתאים לשימוש שלכם — ובדקו תמיד את המחיר שאחרי המבצע.';
  return s;
}

function providerVsPage(v) {
  const url = `${SITE}/${v.slug}.html`;
  const { a, b, catSlug, catName } = v;
  const title = `${a.provider} מול ${b.provider} ב${catName} — השוואת מחירים | SWITCHY`;
  const desc = `${a.provider} או ${b.provider}? השוואה אמיתית של מסלולי ה${catName} — מחיר התחלתי, מספר מסלולים, 5G והתחייבות — עם המסלולים הזולים בכל צד, מהקטלוג המעודכן של SWITCHY.`;
  const h1 = `${a.provider} מול ${b.provider}`;
  // Verdict matrix — winner per dimension, marked with the value (amber) accent.
  const rows = providerVsVerdictRows(v);
  const cell = (val, isWin) => `<td class="cmp__num${isWin ? ' cmp__best' : ''}">${isWin ? `<b>${esc(val)}</b>` : esc(val)}</td>`;
  const matrix = `
    <section class="section section--tight" aria-label="טבלת השוואה ראש בראש">
      <div class="container">
        <header class="section__head reveal"><span class="eyebrow">ראש בראש</span><h2>${esc(a.provider)} מול ${esc(b.provider)} — במבט אחד</h2><p>כל המספרים מהקטלוג המעודכן. הערך המנצח בכל שורה מודגש.</p></header>
        <div class="cmp-wrap reveal" role="region" aria-label="טבלת השוואה — ניתן לגלול" tabindex="0">
          <table class="cmp">
            <thead><tr><th>קריטריון</th><th class="cmp__num">${providerLogo(a.provider, 24)} ${esc(a.provider)}</th><th class="cmp__num">${providerLogo(b.provider, 24)} ${esc(b.provider)}</th></tr></thead>
            <tbody>
${rows.map(([label, av, bv, winner]) => `              <tr><td data-th="קריטריון">${esc(label)}</td>${cell(av, winner === 'a')}${cell(bv, winner === 'b')}</tr>`).join('\n')}
            </tbody>
          </table>
        </div>
      </div>
    </section>`;
  // Each side: featured cheapest cards + the full Kamaze-style comparison table,
  // scoped to that provider's plans in this category (reuses comparisonTable).
  const sideSection = (S, key) => {
    const cards = S.plans.slice(0, 3).map((p) => planCardHtml(p, false)).join('\n');
    const table = comparisonTable(S.plans, catSlug, `vs-${key}`);
    const fromTxt = `${S.count} מסלולים · החל מ-₪${Number.isInteger(S.from) ? S.from : S.from.toFixed(2)}${(catSlug === 'cellular' || catSlug === 'internet' || catSlug === 'triple') ? '/חודש' : ''}`;
    return `
    <section class="section" aria-label="${esc(S.provider)} ${esc(catName)}">
      <div class="container">
        <header class="section__head reveal"><span class="eyebrow">${providerLogo(S.provider, 22)} ${esc(S.provider)}</span><h2>מסלולי ה${esc(catName)} של ${esc(S.provider)}</h2><p>${esc(fromTxt)} — ממוין מהזול ביותר.</p></header>
        <div class="plan-grid plan-grid--featured">
${cards}
        </div>
        <div style="text-align:center;margin-top:18px"><a class="btn btn--ghost" href="provider-${providerSlug(S.provider)}.html">לכל המסלולים של ${esc(S.provider)} ←</a></div>
      </div>
    </section>${table}`;
  };
  const allShown = [...a.plans.slice(0, 6), ...b.plans.slice(0, 6)];
  // Other head-to-heads in the same category — keeps the comparison cluster
  // interlinked so a crawler (and a visitor) can hop between rivalries.
  const siblings = builtProviderVs.filter((x) => x.catSlug === catSlug && x.slug !== v.slug);
  const siblingsStrip = siblings.length ? `
    <section class="section section--alt" aria-label="השוואות נוספות">
      <div class="container">
        <header class="section__head reveal"><span class="eyebrow">עוד ראש בראש</span><h2>השוואות נוספות ב${esc(catName)}</h2></header>
        <div class="providers__row" style="justify-content:center">
          ${siblings.map((x) => `<a class="chip" href="${x.slug}.html">${svgIcon('scale')} ${esc(x.a.provider)} מול ${esc(x.b.provider)}</a>`).join('\n          ')}
        </div>
      </div>
    </section>` : '';
  const relatedGuideCards = relatedGuides(catName, null, 2).map(guideCard).join('\n');
  const crumbs = { '@type': 'BreadcrumbList', itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'דף הבית', item: SITE + '/' },
    { '@type': 'ListItem', position: 2, name: catName, item: `${SITE}/${catSlug}.html` },
    { '@type': 'ListItem', position: 3, name: h1, item: url },
  ] };
  const collection = { '@type': 'CollectionPage', name: h1, description: desc, url, inLanguage: 'he-IL',
    isPartOf: { '@id': WEBSITE_ID }, publisher: { '@id': ORG_ID },
    about: [{ '@type': 'Brand', name: a.provider }, { '@type': 'Brand', name: b.provider }],
    ...(allShown.length ? { mainEntity: plansItemListJsonLd(allShown, url, h1) } : {}) };
  const providerVsLd = jsonForScript({ '@context': 'https://schema.org', '@graph': [crumbs, collection] });
  return `<!DOCTYPE html>
<html lang="he" dir="rtl">
${head(title, desc, url, providerVsLd, false, 'website')}
<body id="top">
${nav}
  <main id="main">
    <section class="lead-hero">
      <div class="hero-decor" aria-hidden="true" data-parallax="0.18">${heroDecor()}</div>
      <div class="container">
        <p class="crumbs"><a href="index.html">דף הבית</a> ← <a href="${catSlug}.html">${esc(catName)}</a> ← ${esc(h1)}</p>
        <span class="pill pill--ico">${svgIcon('scale')} השוואה אמיתית · בלי התחייבות</span>
        <h1>${esc(a.provider)} מול <span class="hl">${esc(b.provider)}</span></h1>
        <p>השוואה אמיתית של מסלולי ה${esc(catName)} של ${esc(a.provider)} ו${esc(b.provider)} — מחיר, כמות מסלולים, 5G והתחייבות — עם המסלולים הזולים בכל צד.</p>
        <div class="hero__cta">
          <a class="btn btn--primary btn--lg" href="#cta">השוו ותחסכו ←</a>
          <a class="btn btn--ghost btn--lg" href="${catSlug}.html">לכל מסלולי ה${esc(catName)}</a>
        </div>
      </div>
    </section>

    <section class="section section--alt" aria-label="המסקנה">
      <div class="container">
        <div class="prose" style="max-width:760px;margin:0 auto">
          <div class="tldr"><b>השורה התחתונה:</b> ${providerVsVerdict(v)}</div>
        </div>
      </div>
    </section>
${matrix}
${sideSection(a, 'a')}
${sideSection(b, 'b')}
${siblingsStrip}${relatedGuideCards ? `
    <section class="section" aria-label="מדריכים">
      <div class="container">
        <header class="section__head reveal"><span class="eyebrow">כדאי לדעת</span><h2>מדריכים שימושיים</h2></header>
        <div class="guide-cards guide-cards--2">
${relatedGuideCards}
        </div>
      </div>
    </section>` : ''}
${trustBlock()}
    <section class="cta" id="cta">
      <div class="container cta__inner reveal">
        <h2>עדיין מתלבטים בין ${esc(a.provider)} ל${esc(b.provider)}?</h2>
        <p>השאירו פרטים ונחזור אליכם עם ההשוואה וההמלצה המתאימה לכם — חינם, בלי התחייבות.</p>
        ${leadFormHtml('קבלו המלצה אישית תוך 2 דקות ←')}
        <p class="cta__note" id="leadNote" role="status" aria-live="polite"></p>
        <a class="cta__wa" href="https://wa.me/972505037537" target="_blank" rel="noopener">${svgIcon('chat')}מעדיפים וואטסאפ? דברו איתנו</a>
      </div>
    </section>
  </main>
${footer}
  ${leadsConfigTag()}
  <script src="${JS_SRC}" defer></script>
</body>
</html>
`;
}

// ── Comparisons hub (/comparisons.html) ──────────────────────────────────────
// One index that gathers EVERY head-to-head — the topic-vs-topic versus pages and
// all provider-vs-provider pages — grouped by category. This gives the comparison
// cluster a single crawlable parent (better internal-link topology than scattered
// strips) and a useful landing page for "השוואת ספקים" searches. All links point
// at pages that are actually generated, so there are no dead links.
function comparisonsHubPage() {
  const url = `${SITE}/comparisons.html`;
  const desc = 'כל ההשוואות ראש בראש במקום אחד — ספק מול ספק וסוג מול סוג, לפי קטגוריה. השוו סלולר, אינטרנט, טלוויזיה וחבילות משולבות ובחרו נכון.';
  const groups = categories.map((c) => {
    const vs = builtVersus.filter((x) => x.catSlug === c.slug);
    const pvs = builtProviderVs.filter((x) => x.catSlug === c.slug);
    if (!vs.length && !pvs.length) return '';
    const topicLinks = vs.map((x) => `<a class="chip" href="${x.slug}.html">${svgIcon('scale')} ${esc(x.h1)}</a>`).join('\n          ');
    const provLinks = pvs.map((x) => `<a class="chip" href="${x.slug}.html">${providerLogo(x.a.provider, 20)} ${esc(x.a.provider)} מול ${esc(x.b.provider)}</a>`).join('\n          ');
    return `      <section class="section${vs.length || pvs.length ? '' : ''}" aria-label="${esc(c.name)}">
        <div class="container">
          <header class="section__head reveal"><span class="eyebrow">${iconFor(c.icon)} ${esc(c.name)}</span><h2>השוואות ב${esc(c.name)}</h2><p><a href="${c.slug}.html">לכל מסלולי ה${esc(c.name)} ←</a></p></header>
          <div class="providers__row" style="justify-content:center">
          ${[topicLinks, provLinks].filter(Boolean).join('\n          ')}
          </div>
        </div>
      </section>`;
  }).filter(Boolean).join('\n');
  // ItemList of every comparison page on the hub → an explicit crawl map.
  const allComparisons = [
    ...builtVersus.map((x) => ({ name: x.h1, url: `${SITE}/${x.slug}.html` })),
    ...builtProviderVs.map((x) => ({ name: `${x.a.provider} מול ${x.b.provider} (${x.catName})`, url: `${SITE}/${x.slug}.html` })),
  ];
  const hubLd = jsonForScript({ '@context': 'https://schema.org', '@graph': [
    { '@type': 'BreadcrumbList', itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'דף הבית', item: SITE + '/' },
      { '@type': 'ListItem', position: 2, name: 'השוואות', item: url },
    ] },
    { '@type': 'CollectionPage', name: 'כל ההשוואות', description: desc, url, inLanguage: 'he-IL',
      isPartOf: { '@id': WEBSITE_ID }, publisher: { '@id': ORG_ID },
      mainEntity: { '@type': 'ItemList', numberOfItems: allComparisons.length,
        itemListElement: allComparisons.map((x, i) => ({ '@type': 'ListItem', position: i + 1, name: x.name, url: x.url })) } },
  ] });
  return `<!DOCTYPE html>
<html lang="he" dir="rtl">
${head('כל ההשוואות — ספק מול ספק וסוג מול סוג | SWITCHY', desc, url, hubLd, false, 'website')}
<body id="top">
${navNoCta}
  <main id="main">
    <section class="lead-hero">
      <div class="hero-decor" aria-hidden="true" data-parallax="0.18">${heroDecor()}</div>
      <div class="container">
        <p class="crumbs"><a href="index.html">דף הבית</a> ← השוואות</p>
        <span class="pill pill--ico">${svgIcon('scale')} ${builtVersus.length + builtProviderVs.length} השוואות ראש בראש</span>
        <h1>כל ה<span class="hl">השוואות</span> במקום אחד</h1>
        <p>ספק מול ספק וסוג מול סוג, לפי קטגוריה. כל הנתונים מהקטלוג המעודכן — בחרו השוואה וראו מי מנצח בכל קריטריון.</p>
      </div>
    </section>
${groups}
${trustBlock()}
    <section class="cta" id="cta">
      <div class="container cta__inner reveal">
        <h2>רוצים שנשווה עבורכם?</h2>
        <p>השאירו פרטים ונחזור אליכם עם ההשוואה וההמלצה המתאימה לכם — חינם, בלי התחייבות.</p>
        ${leadFormHtml('קבלו המלצה אישית תוך 2 דקות ←')}
        <p class="cta__note" id="leadNote" role="status" aria-live="polite"></p>
        <a class="cta__wa" href="https://wa.me/972505037537" target="_blank" rel="noopener">${svgIcon('chat')}מעדיפים וואטסאפ? דברו איתנו</a>
      </div>
    </section>
  </main>
${footer}
  ${leadsConfigTag()}
  <script src="${JS_SRC}" defer></script>
</body>
</html>
`;
}

// ── Write pages ────────────────────────────────────────────────────────────
for (const c of categories) {
  fs.writeFileSync(path.join(__dirname, `${c.slug}.html`), page(c));
}
for (const col of builtCollections) {
  fs.writeFileSync(path.join(__dirname, `${col.slug}.html`), collectionPage(col));
}
for (const c of builtCalculators) {
  fs.writeFileSync(path.join(__dirname, `calc-${c.slug}.html`), calculatorPage(c));
}
for (const v of builtVersus) {
  const html = versusPage(v);
  if (html) fs.writeFileSync(path.join(__dirname, `${v.slug}.html`), html);
}
for (const v of builtProviderVs) {
  fs.writeFileSync(path.join(__dirname, `${v.slug}.html`), providerVsPage(v));
}

// Per-provider pages (from the catalogue).
const providersMap = {};
for (const p of catalogue.plans) (providersMap[p.provider] ||= []).push(p);
const providerNames = Object.keys(providersMap).sort();
for (const name of providerNames) {
  providersMap[name].sort((a, b) => a.price - b.price);
  fs.writeFileSync(path.join(__dirname, `provider-${providerSlug(name)}.html`), providerPage(name, providersMap[name]));
}
for (const g of guides) {
  fs.writeFileSync(path.join(__dirname, `${g.slug}.html`), articlePage(g));
}
for (const p of staticPages) {
  fs.writeFileSync(path.join(__dirname, `${p.slug}.html`), staticPage(p));
}
fs.writeFileSync(path.join(__dirname, 'guides.html'), guidesIndexPage());
fs.writeFileSync(path.join(__dirname, 'faq.html'), faqPage());
fs.writeFileSync(path.join(__dirname, 'glossary.html'), glossaryPage());
fs.writeFileSync(path.join(__dirname, 'how-it-works.html'), howItWorksPage());
fs.writeFileSync(path.join(__dirname, 'plans.html'), plansPage());
fs.writeFileSync(path.join(__dirname, 'providers.html'), providersIndexPage());
fs.writeFileSync(path.join(__dirname, 'compare.html'), comparePage());
fs.writeFileSync(path.join(__dirname, 'comparisons.html'), comparisonsHubPage());
fs.writeFileSync(path.join(__dirname, 'community.html'), communityPage());
fs.writeFileSync(path.join(__dirname, 'book.html'), bookPage());
fs.writeFileSync(path.join(__dirname, 'app.html'), appPage());
fs.writeFileSync(path.join(__dirname, '404.html'), notFoundPage());

// ── Generate llms.txt + ai.txt (AI / answer-engine resources) ────────────────
// The emerging "llms.txt" standard: a clean, LLM-friendly Markdown summary of the
// service (what it is, the REAL catalogue scope/counts, the hub URLs as
// switchy-ai.com/*.html, the honesty stance, contact). ai.txt is a concise
// AI-crawler policy welcoming the answer-engine bots (same set as robots.txt).
// Mirrors the Next web app's /llms.txt + /ai.txt routes (GEO consistency).
//
// 🔴 TRUTH-ONLY: every number is computed from the real bundled catalogue; the
// freshness date is the REAL catalogue date (CATALOGUE_DATE_ISO), never a
// hardcoded "today". No fabricated ratings/stats/awards. The commission
// disclosure is stated verbatim — we are free to the user and transparent.
const CONTACT_EMAIL = 'hello@chosech.co.il';
const CONTACT_WHATSAPP = '050-503-7537';
const SITE_ALT_NAMES = ['Switch AI', 'Switchy'];
// AI / answer-engine bots welcomed for citation — single source of truth, also
// consumed by the generated robots.txt below (kept in sync with web/app/robots.ts).
const AI_BOTS = [
  'GPTBot', 'OAI-SearchBot', 'ChatGPT-User', 'PerplexityBot', 'Perplexity-User',
  'Google-Extended', 'ClaudeBot', 'Claude-Web', 'anthropic-ai', 'Applebot-Extended',
  'CCBot', 'Amazonbot', 'Bytespider', 'Meta-ExternalAgent',
];

// Real per-category counts + cheapest entry price, straight from the catalogue.
const llmCategoryLines = categories.map((c) => {
  const catPlans = plansByCat[c.slug] || [];
  const prices = catPlans
    .map(offerPrice)
    .filter((n) => typeof n === 'number' && Number.isFinite(n) && n > 0);
  const from = prices.length ? `, החל מ-₪${Math.round(Math.min(...prices))}` : '';
  return `- [${c.name}](${SITE}/${c.slug}.html) — ${catPlans.length} מסלולים${from}.`;
});

// Real per-provider counts + cheapest entry price, straight from the catalogue.
const llmProviderLines = providerNames.map((name) => {
  const plans = providersMap[name] || [];
  const prices = plans
    .map(offerPrice)
    .filter((n) => typeof n === 'number' && Number.isFinite(n) && n > 0);
  const from = prices.length ? `, החל מ-₪${Math.round(Math.min(...prices))}` : '';
  return `- [${name}](${SITE}/provider-${providerSlug(name)}.html) — ${plans.length} מסלולים${from}.`;
});

const llmsTxt = [
  // H1 + blockquote summary — the llms.txt convention (name + one-line summary).
  '# SWITCHY',
  '',
  `> SWITCHY (גם: ${SITE_ALT_NAMES.join(', ')}) — שירות חינמי להשוואת מסלולי ` +
    'תקשורת בישראל: סלולר, אינטרנט, טלוויזיה, חבילות משולבות וחבילות חו״ל. ' +
    `כרגע ${PLAN_COUNT} מסלולים מ-${PROVIDER_COUNT} ספקים, ${CATEGORY_COUNT} ` +
    `קטגוריות. נתונים נכונים ל-${CATALOGUE_DATE_ISO}.`,
  '',
  `SWITCHY is a free Israeli telecom price-comparison service. It compares ` +
    `${PLAN_COUNT} plans from ${PROVIDER_COUNT} providers across ` +
    `${CATEGORY_COUNT} categories, shows prices in ILS (₪, VAT-inclusive, ` +
    'including the post-promo price), and connects a user to a provider only ' +
    `after they explicitly opt in. Data as of ${CATALOGUE_DATE_ISO}.`,
  '',
  '## מה השירות עושה (What it does)',
  '- משווה מסלולי תקשורת מכל הספקים בישראל במקום אחד, חינם וללא התחייבות.',
  '- מציג מחירים בשקלים (₪) כולל יחידת החיוב (לחודש / לחבילה / ליום) והמחיר לאחר תום המבצע.',
  '- ממיין כברירת מחדל מהמחיר ההתחלתי הנמוך לגבוה; כל נתון נלקח מהקטלוג.',
  '- פנייה לספק נשלחת אך ורק לאחר שהמשתמש מילא טופס ואישר במפורש.',
  '',
  '## שקיפות ומתודולוגיה (Honesty & methodology)',
  '- הדירוג מבוסס על המחיר ההתחלתי המפורסם בלבד, מהנמוך לגבוה, מתוך הקטלוג. אין דירוג סמוי.',
  '- כל נתון (מחיר, מספר מסלולים, "הזול ביותר") נלקח מהקטלוג; נתון חסר מושמט ולא מנוחש. אין ביקורות או דירוגי כוכבים מומצאים.',
  '- גילוי נאות: השירות חינמי למשתמש. אנו מקבלים דמי תיווך/הפניה מהספקים כאשר המשתמש עובר דרכנו — וזה אינו משפיע על המחיר שהמשתמש משלם.',
  '',
  '## קישורי על (Key pages)',
  `- [דף הבית / Home](${SITE}/)`,
  `- [השוואת מסלולים / Compare](${SITE}/compare.html)`,
  `- [כל ההשוואות / Comparisons](${SITE}/comparisons.html)`,
  `- [ספקים / Providers](${SITE}/providers.html)`,
  `- [כל המסלולים / Plans](${SITE}/plans.html)`,
  `- [מדריכים / Guides](${SITE}/guides.html)`,
  `- [מילון מונחים / Glossary](${SITE}/glossary.html)`,
  `- [שאלות נפוצות / FAQ](${SITE}/faq.html)`,
  `- [איך זה עובד / How it works](${SITE}/how-it-works.html)`,
  '',
  '## קטגוריות (Categories)',
  ...llmCategoryLines,
  '',
  '## ספקים (Providers)',
  ...llmProviderLines,
  '',
  '## משאבים נוספים (More)',
  `- [מפת אתר / Sitemap](${SITE}/sitemap.xml)`,
  `- [מדיניות סורקי AI / AI crawler policy](${SITE}/ai.txt)`,
  `- צור קשר / Contact: ${CONTACT_EMAIL} · WhatsApp ${CONTACT_WHATSAPP}`,
  '',
  '## ציטוט מועדף (Preferred citation)',
  `SWITCHY — השוואת מחירי תקשורת בישראל (${SITE}), נתונים נכונים ל-${CATALOGUE_DATE_ISO}.`,
  '',
].join('\n');
fs.writeFileSync(path.join(__dirname, 'llms.txt'), llmsTxt);

const aiTxt = [
  `# ai.txt — SWITCHY (${SITE})`,
  '',
  'SWITCHY is a free Israeli telecom price-comparison service. AI and ' +
    'answer-engine crawlers are welcome to read, index, and cite our public ' +
    'content. All prices and counts are catalogue-derived and truthful; please ' +
    `cite the page URL and the data-as-of date (currently ${CATALOGUE_DATE_ISO}).`,
  '',
  '# Allowed AI / answer-engine crawlers (see /robots.txt)',
  ...AI_BOTS.flatMap((bot) => [`User-agent: ${bot}`, 'Allow: /']),
  '',
  '# Preferred resources for LLMs',
  `Llms: ${SITE}/llms.txt`,
  `Sitemap: ${SITE}/sitemap.xml`,
  '',
  '# Contact',
  `Email: ${CONTACT_EMAIL}`,
  '',
].join('\n');
fs.writeFileSync(path.join(__dirname, 'ai.txt'), aiTxt);

// ── Refresh sitemap ─────────────────────────────────────────────────────────
// Each URL carries a <lastmod> and a tiered <priority>/<changefreq>:
//  • catalogue date (when prices were last exported) for plan-driven pages
//    (home, category, provider, all-plans, compare);
//  • the guide's own publish date for articles;
//  • today's build date for evergreen static pages.
const isoDate = (d) => new Date(d).toISOString().slice(0, 10); // YYYY-MM-DD
// Reuse the single catalogue-date source (defined near the top) so the sitemap
// <lastmod>, the visible freshness badge, temporalCoverage and the llms/ai feeds
// all derive from the SAME real export date — no divergent "data as of" values.
const CATALOGUE_DATE = CATALOGUE_DATE_ISO;
const BUILD_DATE = isoDate(Date.now());
// priority/changefreq tiers — home is the apex; conversion + plan pages rank
// above evergreen content; legal pages sit lowest.
const locs = [
  { loc: `${SITE}/`, lastmod: CATALOGUE_DATE, priority: '1.0', changefreq: 'daily', images: [`${SITE}/og-image.png`] },
  { loc: `${SITE}/plans.html`, lastmod: CATALOGUE_DATE, priority: '0.9', changefreq: 'daily' },
  { loc: `${SITE}/providers.html`, lastmod: CATALOGUE_DATE, priority: '0.8', changefreq: 'weekly' },
  { loc: `${SITE}/compare.html`, lastmod: CATALOGUE_DATE, priority: '0.8', changefreq: 'weekly' },
  { loc: `${SITE}/comparisons.html`, lastmod: CATALOGUE_DATE, priority: '0.8', changefreq: 'weekly' },
  { loc: `${SITE}/community.html`, lastmod: BUILD_DATE, priority: '0.7', changefreq: 'daily' },
  { loc: `${SITE}/book.html`, lastmod: BUILD_DATE, priority: '0.7', changefreq: 'monthly' },
  { loc: `${SITE}/app.html`, lastmod: BUILD_DATE, priority: '0.7', changefreq: 'monthly', images: [
    `${SITE}/assets/app/shot-home.webp`, `${SITE}/assets/app/shot-results.webp`, `${SITE}/assets/app/shot-meeting.webp`,
  ] },
  { loc: `${SITE}/guides.html`, lastmod: BUILD_DATE, priority: '0.7', changefreq: 'weekly' },
  { loc: `${SITE}/faq.html`, lastmod: CATALOGUE_DATE, priority: '0.7', changefreq: 'weekly' },
  { loc: `${SITE}/how-it-works.html`, lastmod: CATALOGUE_DATE, priority: '0.7', changefreq: 'weekly' },
  { loc: `${SITE}/glossary.html`, lastmod: BUILD_DATE, priority: '0.6', changefreq: 'monthly' },
  { loc: `${SITE}/about.html`, lastmod: BUILD_DATE, priority: '0.5', changefreq: 'monthly' },
  ...categories.map((c) => ({ loc: `${SITE}/${c.slug}.html`, lastmod: CATALOGUE_DATE, priority: '0.9', changefreq: 'daily' })),
  ...builtVersus.map((v) => ({ loc: `${SITE}/${v.slug}.html`, lastmod: CATALOGUE_DATE, priority: '0.75', changefreq: 'weekly' })),
  ...builtProviderVs.map((v) => ({ loc: `${SITE}/${v.slug}.html`, lastmod: CATALOGUE_DATE, priority: '0.7', changefreq: 'weekly' })),
  ...builtCollections.map((col) => ({ loc: `${SITE}/${col.slug}.html`, lastmod: CATALOGUE_DATE, priority: '0.75', changefreq: 'weekly' })),
  ...builtCalculators.map((c) => ({ loc: `${SITE}/calc-${c.slug}.html`, lastmod: CATALOGUE_DATE, priority: '0.7', changefreq: 'weekly' })),
  ...guides.map((g) => ({ loc: `${SITE}/${g.slug}.html`, lastmod: isoDate(g.date), priority: '0.6', changefreq: 'monthly' })),
  ...providerNames.map((n) => ({ loc: `${SITE}/provider-${providerSlug(n)}.html`, lastmod: CATALOGUE_DATE, priority: '0.7', changefreq: 'weekly' })),
  { loc: `${SITE}/privacy.html`, lastmod: BUILD_DATE, priority: '0.3', changefreq: 'yearly' },
  { loc: `${SITE}/terms.html`, lastmod: BUILD_DATE, priority: '0.3', changefreq: 'yearly' },
  { loc: `${SITE}/accessibility.html`, lastmod: BUILD_DATE, priority: '0.3', changefreq: 'yearly' },
];
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${locs.map((u) => `  <url>\n    <loc>${u.loc}</loc>\n    <lastmod>${u.lastmod}</lastmod>\n    <changefreq>${u.changefreq}</changefreq>\n    <priority>${u.priority}</priority>${(u.images || []).map((src) => `\n    <image:image>\n      <image:loc>${src}</image:loc>\n    </image:image>`).join('')}\n  </url>`).join('\n')}
</urlset>
`;
fs.writeFileSync(path.join(__dirname, 'sitemap.xml'), sitemap);

// ── Refresh robots.txt ───────────────────────────────────────────────────────
// Generated (single source of truth) so the Sitemap line + Host always track the
// canonical SITE domain — a stale absolute URL here silently breaks discovery on
// a domain switch. Allow everything except the raw data export; point crawlers at
// the sitemap. No crawl-delay (Google ignores it; it only throttles minor bots).
// AI / answer-engine bots are listed EXPLICITLY (allow: /) so this content can be
// cited in AI answers — kept in sync with the Next.js web app's app/robots.ts
// (GEO consistency). `User-agent: *` already permits them implicitly; the explicit
// stanzas make the intent unambiguous and survive any future tightening of `*`.
// The /llms.txt + /ai.txt resources are surfaced here so crawlers discover them.
const robots = `# https://www.robotstxt.org/robotstxt.html
User-agent: *
Allow: /
Disallow: /data/

# AI / answer-engine crawlers — explicitly welcomed (kept in sync with web/app/robots.ts).
${AI_BOTS.map((b) => `User-agent: ${b}`).join('\n')}
Allow: /
Disallow: /data/

# AI / answer-engine resources
# Llms: ${SITE}/llms.txt
# Ai: ${SITE}/ai.txt

Sitemap: ${SITE}/sitemap.xml
Host: ${SITE.replace(/^https?:\/\//, '')}
`;
fs.writeFileSync(path.join(__dirname, 'robots.txt'), robots);

console.log(`Generated ${categories.length} category + ${builtVersus.length} versus + ${builtProviderVs.length} provider-vs + ${builtCollections.length} collections + ${builtCalculators.length} calculators + ${guides.length} guides + ${staticPages.length} static + guides index + faq + glossary + how-it-works + plans + providers + comparisons hub + community + book + 404 + sitemap.xml + robots.txt`);
console.log(`Asset fingerprints: styles.css?v=${CSS_V}  script.js?v=${JS_V}  (hand-written index.html must reference these same values)`);
