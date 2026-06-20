#!/usr/bin/env node
/* Generates the per-category SEO landing pages (and refreshes sitemap.xml)
   from the data below + a shared template. No dependencies.
   Run:  node build.js   (from the site/ folder). Commit the generated *.html. */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('node:crypto');

const SITE = 'https://chosech.co.il';

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

// ── Cookieless analytics (privacy-respecting, placeholder by default) ────────
// Plausible-style: no cookies, no cross-site tracking, no personal data. The
// domain below is a PLACEHOLDER — swap ANALYTICS_DOMAIN for the real account
// (and uncomment the real endpoint) once analytics is set up. Until then the
// remote script simply 404s harmlessly; the inline stub still queues calls so
// `window.plausible('event', …)` from script.js never throws. Conversion
// events (lead_submit, whatsapp_click) are fired from script.js.
const ANALYTICS_DOMAIN = 'chosech.co.il';
const ANALYTICS_SRC = 'https://plausible.io/js/script.outbound-links.tagged-events.js';
const analyticsTag = () =>
  `<!-- Cookieless analytics (Plausible-style). Placeholder until configured — no cookies, no personal data. -->
  <script defer data-domain="${ANALYTICS_DOMAIN}" src="${ANALYTICS_SRC}"></script>
  <script>window.plausible=window.plausible||function(){(window.plausible.q=window.plausible.q||[]).push(arguments)};</script>`;

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
};
const EMOJI_TO_ICON = {
  '📱': 'phone', '📲': 'phone', '📞': 'phone', '🌐': 'globe', '🌍': 'globe', '⚽': 'globe',
  '📺': 'tv', '🎬': 'tv', '🎥': 'video', '🏠': 'home', '✈': 'plane', '🧠': 'cpu', '⏰': 'clock',
  '💬': 'chat', '🤖': 'bot', '🚦': 'transfer', '🔄': 'transfer', '🔒': 'lock', '🔓': 'unlock',
  '💰': 'savings', '💸': 'savings', '💳': 'savings', '📊': 'chart', '📈': 'chart', '🛡': 'shield',
  '🔎': 'search', '🔍': 'search', '✅': 'check', '✨': 'sparkle', '🧾': 'receipt', '🧮': 'calculator',
  '🤝': 'check', '📡': 'signal', '📶': 'signal', '👥': 'people', '🎧': 'headset', '🛟': 'headset',
  '⚡': 'bolt', '🔌': 'bolt', '🚀': 'rocket', '📍': 'pin', '📝': 'note', '📋': 'note', '🔔': 'bell',
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

const categories = [
  {
    slug: 'cellular', name: 'סלולר', icon: '📱',
    title: 'השוואת מסלולי סלולר — חבילות 5G זולות | חוסך',
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
    ],
  },
  {
    slug: 'internet', name: 'אינטרנט', icon: '🌐',
    title: 'השוואת מחירי אינטרנט וסיב אופטי — חוסך',
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
      ['למה המחיר קופץ אחרי שנה?', 'הרבה חבילות זולות בשנה הראשונה ואז עולות. חוסך מציג את המחיר שאחרי המבצע ומזכיר לכם להשוות שוב לפני שהוא קופץ.'],
      ['אפשר אינטרנט בלי התחייבות?', 'כן, יש ספקים שמציעים חבילות ללא התחייבות — נסמן לכם אותן בהשוואה.'],
    ],
  },
  {
    slug: 'tv', name: 'טלוויזיה', icon: '📺',
    title: 'השוואת חבילות טלוויזיה וסטרימינג — חוסך',
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
    ],
  },
  {
    slug: 'triple', name: 'חבילה משולבת', icon: '🏠',
    title: 'השוואת חבילות משולבות (אינטרנט+טלוויזיה+סלולר) — חוסך',
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
    ],
  },
  {
    slug: 'abroad', name: 'חבילות חו״ל', icon: '✈️',
    title: 'השוואת חבילות גלישה לחו״ל ו-eSIM — חוסך',
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
    ],
  },
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
function planCardHtml(p, best) {
  // `best` highlights the value anchor — passed ONLY as an explicit boolean from
  // the single-category listing (sorted cheapest-first), so the label "lowest
  // price" is factual. Strict === true guard: other callers use .map(planCardHtml)
  // which passes the array index as arg 2; that number must never trip the badge.
  const isBest = best === true;
  // priceUnit comes from the app catalogue export (tool/export_plans.dart) —
  // abroad plans mix per-package/day/minute/month pricing, so never assume.
  const unit = UNIT_HE[p.priceUnit] || (p.cat === 'abroad' ? 'לחבילה' : 'לחודש');
  const specs = Object.entries(p.specs || {}).slice(0, 3)
    .map(([, v]) => `<span class="pchip">${esc(v)}</span>`).join('');
  const flags = [];
  if (p.is5G) flags.push('<span class="pflag pflag--5g">5G</span>');
  if (p.noCommit) flags.push('<span class="pflag">ללא התחייבות</span>');
  if (p.hasAbroad) flags.push('<span class="pflag">כולל חו״ל</span>');
  const hasJump = p.after && (p.after - p.price) > 30;
  const after = p.after ? `<span class="plan__after">ואז ₪${p.after}</span>` : '';
  // NOTE: a plan's "rating" is a fabricated placeholder (every plan has 0 real
  // reviews) — never render it as a star/score. Honest ratings live per-provider
  // and only surface once a real review exists (see provider_ratings.dart).
  const text = esc(`${p.provider} ${p.plan} ${(p.feats || []).join(' ')} ${Object.values(p.specs || {}).join(' ')}`).toLowerCase();
  const waHref = 'https://wa.me/972505037537?text=' + encodeURIComponent('היי, מעניין אותי ' + p.provider + ' - ' + p.plan + ' (₪' + priceText(p) + ')');
  return `<article class="plan${isBest ? ' plan--best' : ''}${hasJump ? ' plan--hasjump' : ''}" data-cat="${esc(p.cat)}" data-text="${text}" data-price="${p.price}" data-after="${p.after || ''}" data-haspromo="${p.after ? 'true' : 'false'}" data-5g="${p.is5G}" data-nocommit="${p.noCommit}" data-abroad="${p.hasAbroad}">
        ${isBest ? '<span class="plan__badge">המחיר הנמוך ביותר</span>' : ''}
        <div class="plan__top"><span class="plan__id">${providerLogo(p.provider)}<a class="plan__provider" href="provider-${providerSlug(p.provider)}.html">${esc(p.provider)}</a></span><span class="plan__net">${esc(p.net)}</span></div>
        <div class="plan__name">${esc(p.plan)}</div>
        ${specs ? `<div class="plan__chips">${specs}</div>` : ''}
        ${flags.length ? `<div class="plan__flags">${flags.join('')}</div>` : ''}
        <div class="plan__bottom"><div class="plan__price"><b>₪${priceText(p)}</b> <span>${unit}</span>${after}</div></div>
        <a class="plan__cta" target="_blank" rel="noopener" href="${esc(waHref)}">${iconFor('💬')} מעוניין/ת ←</a>
      </article>`;
}

const navHtml = (ctaHref) => `  <a class="skip" href="#main">דלג לתוכן</a>
  <header class="nav" id="nav">
    <div class="container nav__inner">
      <a class="brand" href="index.html" aria-label="חוסך — דף הבית">
        <span class="brand__mark" aria-hidden="true">✦</span><span class="brand__name">חוסך</span>
      </a>
      <nav class="nav__links" aria-label="ניווט ראשי">
        <a href="plans.html">כל החבילות</a>
        <a href="providers.html">ספקים</a>
        <a href="compare.html">השוואה</a>
        <a href="app.html">האפליקציה</a>
        <a href="guides.html">מדריכים</a>
        <a href="index.html#calculator">מחשבון</a>
      </nav>
      <a class="btn btn--primary nav__cta" href="${ctaHref}">השוו עכשיו</a>
      <button class="nav__toggle" id="navToggle" aria-label="פתיחת תפריט" aria-expanded="false" aria-controls="mobileMenu"><span></span><span></span><span></span></button>
    </div>
    <div class="nav__mobile" id="mobileMenu" hidden>
      <a href="plans.html">כל החבילות</a>
      <a href="providers.html">ספקים</a>
      <a href="compare.html">השוואה</a>
      <a href="app.html">האפליקציה</a>
      <a href="guides.html">מדריכים</a>
      <a href="index.html#calculator">מחשבון</a>
      <a class="btn btn--primary" href="${ctaHref}">השוו עכשיו</a>
    </div>
  </header>`;

// Pages that render their own lead-form section keep the in-page anchor;
// article/guide/static/404/providers-index pages have no #cta, so their header
// CTA points at the homepage's — otherwise it's a dead button exactly where
// organic-SEO visitors land.
const nav = navHtml('#cta');
const navNoCta = navHtml('index.html#cta');

const footer = `  <footer class="footer">
    <div class="container footer__inner">
      <div class="footer__brand">
        <a class="brand brand--light" href="index.html"><span class="brand__mark" aria-hidden="true">✦</span><span class="brand__name">חוסך</span></a>
        <p>השוואת מחירי תקשורת חכמה. משווים, חוסכים, עוברים — בלי כאב ראש.</p>
      </div>
      <nav class="footer__links footer__col" aria-label="קטגוריות">
        <h4>קטגוריות</h4>
        <a href="cellular.html">סלולר</a><a href="internet.html">אינטרנט</a><a href="tv.html">טלוויזיה</a><a href="triple.html">חבילה משולבת</a><a href="abroad.html">חו״ל</a><a href="plans.html">כל החבילות</a>
      </nav>
      <nav class="footer__links footer__col" aria-label="החברה">
        <h4>החברה</h4>
        <a href="about.html">אודות</a><a href="app.html">האפליקציה</a><a href="guides.html">מדריכים</a><a href="privacy.html">מדיניות פרטיות</a><a href="terms.html">תנאי שימוש</a>
      </nav>
      <div class="footer__contact footer__col">
        <h4>יצירת קשר</h4>
        <a href="https://wa.me/972505037537" target="_blank" rel="noopener">וואטסאפ</a>
        <a href="mailto:hello@chosech.co.il">hello@chosech.co.il</a>
      </div>
    </div>
    <div class="container footer__bottom"><span>© <span id="year"></span> חוסך · כל הזכויות שמורות</span><span>נבנה באהבה בישראל</span></div>
  </footer>
  <a class="wa-fab" href="https://wa.me/972505037537?text=%D7%94%D7%99%D7%99%2C%20%D7%90%D7%A9%D7%9E%D7%97%20%D7%9C%D7%94%D7%A9%D7%95%D7%95%D7%AA%20%D7%9E%D7%A1%D7%9C%D7%95%D7%9C%D7%99%D7%9D" target="_blank" rel="noopener" aria-label="דברו איתנו בוואטסאפ"><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" width="26" height="26"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.885-9.885 9.885M20.52 3.449C18.24 1.245 15.24 0 12.045 0 5.463 0 .104 5.359.101 11.892c0 2.096.549 4.142 1.595 5.945L0 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.582 0 11.943-5.359 11.945-11.893a11.821 11.821 0 00-3.418-8.452z"/></svg></a>`;

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
        </form>`;

// Offer price for structured data — the exact advertised figure when present,
// otherwise the rounded int. Always a plain number (schema.org/Offer.price).
const offerPrice = (p) => (p.priceExact != null ? p.priceExact : p.price);

// Build a Product node (with an Offer) for one real plan. We intentionally emit
// NO aggregateRating/review here: every plan has 0 real reviews, so a rating
// would be fabricated — honest structured data carries price/offer only.
function planProductNode(p, listUrl) {
  const name = `${p.provider} — ${p.plan}`;
  const feats = (p.feats || []).join(', ');
  const node = {
    '@type': 'Product',
    name,
    category: (categories.find((c) => c.slug === p.cat) || {}).name || p.cat,
    brand: { '@type': 'Brand', name: p.provider },
    offers: {
      '@type': 'Offer',
      price: offerPrice(p),
      priceCurrency: 'ILS',
      availability: 'https://schema.org/InStock',
      url: listUrl,
      ...(p.after != null ? { description: `מחיר היכרות; ואז ₪${p.after}` } : {}),
    },
  };
  if (feats) node.description = feats;
  return node;
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
  const graph = [crumbs, faq];
  const catPlans = plansByCat[c.slug] || [];
  if (catPlans.length) graph.push(plansItemListJsonLd(catPlans, url, `מסלולי ${c.name}`));
  return jsonForScript({ '@context': 'https://schema.org', '@graph': graph });
}

function page(c) {
  const url = `${SITE}/${c.slug}.html`;
  const bullets = c.bullets.map(([icon, h, p]) => `        <article class="feature feature--check reveal"><span class="feature__icon">${iconFor(icon)}</span><h3>${esc(h)}</h3><p>${esc(p)}</p></article>`).join('\n');
  const chips = c.providers.map((p) => `<span class="chip">${esc(p)}</span>`).join('\n          ');
  const faqs = c.faq.map(([q, a]) => `          <details><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join('\n');
  const catGuides = relatedGuides(c.name, null, 2).map(guideCard).join('\n');
  const catPlans = plansByCat[c.slug] || [];
  // Cards are sorted cheapest-first (plansByCat sort), so card 0 is honestly the
  // lowest price in this category — badge it as the value anchor (only when the
  // list is long enough for the highlight to mean something).
  const planCards = catPlans.map((p, i) => planCardHtml(p, i === 0 && catPlans.length > 2)).join('\n      ');
  const cols = (typeof builtCollections !== 'undefined' ? builtCollections : []).filter((col) => col.catSlug === c.slug);
  const colsStrip = cols.length ? `
    <section class="section" aria-label="אוספים">
      <div class="container">
        <header class="section__head reveal"><span class="eyebrow">קיצורי דרך</span><h2>אוספים פופולריים ב${esc(c.name)}</h2></header>
        <div class="providers__row" style="justify-content:center">
          ${cols.map((col) => `<a class="chip" href="${col.slug}.html">${esc(col.h1)}</a>`).join('\n          ')}
        </div>
      </div>
    </section>` : '';
  return `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${esc(c.title)}</title>
  <meta name="description" content="${esc(c.desc)}" />
  <meta name="theme-color" content="#111827" />
  <link rel="canonical" href="${url}" />
  <link rel="icon" href="favicon.svg" type="image/svg+xml" />
  <link rel="apple-touch-icon" href="favicon.svg" />
  <link rel="manifest" href="site.webmanifest" />
  <meta property="og:type" content="website" />
  <meta property="og:locale" content="he_IL" />
  <meta property="og:url" content="${url}" />
  <meta property="og:site_name" content="חוסך" />
  <meta property="og:title" content="${esc(c.title)}" />
  <meta property="og:description" content="${esc(c.desc)}" />
  <meta property="og:image" content="${SITE}/og-image.png" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:image" content="${SITE}/og-image.png" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link rel="preconnect" href="https://plausible.io" />
  <link rel="preconnect" href="https://orzitfqmlvopujsoyigr.supabase.co" />
  <link rel="preload" as="style" href="https://fonts.googleapis.com/css2?family=Rubik:wght@500;700;800;900&family=Assistant:wght@400;500;600;700&display=swap" />
  <link href="https://fonts.googleapis.com/css2?family=Rubik:wght@500;700;800;900&family=Assistant:wght@400;500;600;700&display=swap" rel="stylesheet" media="print" onload="this.media='all'" />
  <noscript><link href="https://fonts.googleapis.com/css2?family=Rubik:wght@500;700;800;900&family=Assistant:wght@400;500;600;700&display=swap" rel="stylesheet" /></noscript>
  <link rel="stylesheet" href="${CSS_HREF}" />
  ${analyticsTag()}
  <script type="application/ld+json">${jsonLd(c)}</script>
</head>
<body id="top">
${nav}
  <main id="main">
    <section class="lead-hero">
      <div class="container">
        <p class="crumbs"><a href="index.html">דף הבית</a> ← ${esc(c.name)}</p>
        <span class="pill pill--ico">${iconFor(c.icon)} השוואה חינם · בלי התחייבות</span>
        <h1>${esc(c.h1[0])}<span class="hl">${esc(c.h1[1])}</span></h1>
        <p>${esc(c.intro)}</p>
        <div class="hero__cta">
          <a class="btn btn--primary btn--lg" href="#cta">השוו ותחסכו ←</a>
          ${['cellular', 'internet', 'tv', 'triple'].includes(c.slug) ? `<a class="btn btn--ghost btn--lg" href="calc-${c.slug}.html">${svgIcon('calculator')} מחשבון חיסכון</a>` : '<a class="btn btn--ghost btn--lg" href="index.html#how">איך זה עובד?</a>'}
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

    <section class="section" id="plans">
      <div class="container">
        <header class="section__head reveal"><span class="eyebrow">${catPlans.length} מסלולים</span><h2>כל מסלולי ה${esc(c.name)}</h2><p>מהזול ביותר — מחירים מעודכנים מכל החברות.</p></header>
        <div class="plan-grid">
      ${planCards}
        </div>
      </div>
    </section>

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
        <div class="guide-cards guide-cards--2">
${catGuides}
        </div>
      </div>
    </section>

    <section class="cta" id="cta">
      <div class="container cta__inner reveal">
        <h2>מוכנים לחסוך על ${esc(c.name)}?</h2>
        <p>השאירו פרטים ונחזור אליכם עם ההשוואה וההמלצה — חינם, בלי התחייבות.</p>
        ${leadFormHtml('קבלו השוואה חינם')}
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
    title: 'המדריך המלא למעבר ספק תקשורת — בלי כאב ראש (2026) | חוסך',
    desc: 'כל מה שצריך לדעת לפני שמחליפים ספק סלולר/אינטרנט: ניוד מספר, מה לבדוק, כמה זמן זה לוקח וטעויות נפוצות שעולות כסף.',
    h1: 'המדריך המלא למעבר ספק תקשורת — בלי כאב ראש',
    tldr: 'מעבר ספק לוקח דקות מהצד שלכם, המספר נשמר, ואין קנסות אם אין התחייבות. הדבר היחיד שחשוב באמת: לבדוק כמה אתם משלמים היום מול מה שיש בשוק — ההפרש מגיע למאות שקלים בשנה.',
    sections: [
      { h2: 'למה בכלל לעבור?', p: ['רוב האנשים נשארים אצל אותו ספק שנים, בזמן שהמחירים בשוק צונחים. מסלול שעלה ₪150 לפני שלוש שנים נמכר היום ב-₪29–₪49 עם יותר גלישה. פער של ₪100 בחודש הוא ₪1,200 בשנה — בלי שעשיתם כלום חוץ מלהישאר.'] },
      { h2: 'מה לבדוק לפני שעוברים', ul: ['כמה אתם משלמים היום — תוציאו את החשבון האחרון.', 'האם יש לכם התחייבות פעילה (ואם כן, עד מתי).', 'מה באמת חשוב לכם: מחיר, מהירות, גלישה בחו״ל, ללא התחייבות.', 'המחיר שאחרי המבצע — לא רק מחיר השנה הראשונה.'] },
      { h2: 'איך עובד ניוד המספר', p: ['ניוד מספר הוא תהליך מוסדר ומפוקח: אתם בוחרים ספק חדש, הוא מבצע את הניוד מול הספק הישן, והמספר הקיים שלכם עובר אליו. אין צורך לבטל ידנית מול הספק הישן — הניוד עושה זאת עבורכם.'] },
      { h2: 'כמה זמן זה לוקח?', p: ['בסלולר הניוד מתבצע לרוב תוך יום-יומיים. באינטרנט וטלוויזיה זה 1–3 ימי עסקים, לעיתים עם תיאום טכנאי. בכל מקרה — אתם ממשיכים להיות מחוברים עד שהמעבר הושלם.'] },
      { h2: 'טעויות נפוצות שעולות כסף', ul: ['להתמקד רק במחיר השנה הראשונה ולהתעלם מהקפיצה אחריה.', 'לא לבדוק התחייבות קיימת ולשלם קנס מיותר.', 'לבחור חבילה גדולה מדי "ליתר ביטחון" במקום לפי השימוש האמיתי.', 'לשכוח להשוות שוב כשנגמר המבצע — כאן נכנסת התראת החידוש של חוסך.'] },
    ],
    faq: [
      ['כמה זמן לוקח מעבר ספק?', 'בסלולר הניוד מתבצע לרוב תוך יום-יומיים; באינטרנט וטלוויזיה 1–3 ימי עסקים, לעיתים עם תיאום טכנאי. אתם נשארים מחוברים עד שהמעבר מושלם.'],
      ['האם המספר שלי נשמר במעבר?', 'כן. ניוד המספר שומר על המספר הקיים — הספק החדש מבצע את הניוד מול הספק הישן, בלי שתצטרכו לבטל ידנית.'],
      ['האם אשלם קנס אם אעבור?', 'רק אם יש לכם התחייבות פעילה. הרבה מהמסלולים היום הם ללא התחייבות כלל — בדקו מול הספק לפני שאתם עוברים.'],
    ],
  },
  {
    slug: 'guide-cellular', cat: 'סלולר', date: '2026-06-03', read: 5,
    title: 'איך לבחור מסלול סלולר ב-2026 — המדריך המלא | חוסך',
    desc: 'כמה GB באמת צריך? 4G מול 5G, התחייבות מול גמישות, מסלולי משפחה ומלכודת המבצע — כל מה שצריך כדי לבחור מסלול סלולר חכם ולא לשלם יותר מדי.',
    h1: 'איך לבחור מסלול סלולר ב-2026',
    tldr: 'לרוב האנשים מספיק מסלול 5G ללא הגבלה בטווח ₪29–₪49, ללא התחייבות. אל תשלמו על "יותר ביטחון" — שלמו לפי השימוש האמיתי, ובדקו תמיד את המחיר שאחרי המבצע.',
    sections: [
      { h2: 'כמה גלישה אתם באמת צריכים?', p: ['רוב המשתמשים צורכים 10–50GB בחודש. כיום מסלולים רבים מציעים גלישה ללא הגבלה במחיר נמוך, כך שברוב המקרים אין סיבה להתלבט — מסלול ללא הגבלה פותר את השאלה. אם אתם גולשים מעט, מסלול בסיסי וזול יספיק.'] },
      { h2: '4G מול 5G — האם זה משנה?', p: ['5G מהיר יותר ויציב יותר באזורים עמוסים. ההפרש במחיר היום זניח, ולכן אם הטלפון שלכם תומך — אין סיבה לא לבחור 5G. בפריפריה כדאי לוודא כיסוי של הספק הספציפי.'] },
      { h2: 'התחייבות מול גמישות', p: ['רוב המסלולים המשתלמים היום הם ללא התחייבות — כלומר אפשר לעזוב בכל רגע. זה נותן לכם כוח: אם המחיר קופץ, פשוט עוברים. הימנעו מהתחייבות ארוכה אלא אם היא מגיעה עם הטבה משמעותית.'] },
      { h2: 'מספר קווים ומשפחה', p: ['אם יש כמה קווים בבית, שווה לבדוק מסלולי משפחה או פשוט לחבר כמה קווים זולים בנפרד — לעיתים זה יוצא זול יותר ממסלול "משפחתי" ארוז. השוו את שתי האפשרויות.'] },
      { h2: 'מלכודת המבצע', p: ['הטריק הנפוץ: מחיר נמוך לשנה ואז קפיצה. זה לא בהכרח רע — אבל תכננו מראש. סמנו את תאריך סיום המבצע (חוסך עושה זאת אוטומטית ומזכיר ~21 יום לפני) כדי להשוות שוב ולא לשלם את המחיר המלא.'] },
    ],
    faq: [
      ['כמה גלישה צריך במסלול סלולר?', 'רוב המשתמשים צורכים 10–50GB בחודש. כיום מסלולים רבים מציעים גלישה ללא הגבלה במחיר נמוך, כך שברוב המקרים אין סיבה להתלבט.'],
      ['האם כדאי 5G או שמספיק 4G?', '5G מהיר ויציב יותר באזורים עמוסים, וההפרש במחיר היום זניח. אם הטלפון תומך — אין סיבה לא לבחור 5G.'],
      ['כמה עולה מסלול סלולר משתלם?', 'לרוב האנשים מספיק מסלול 5G ללא הגבלה בטווח ₪29–₪49, ללא התחייבות. תמיד בדקו גם את המחיר שאחרי המבצע.'],
    ],
  },
  {
    slug: 'guide-fiber', cat: 'אינטרנט', date: '2026-06-05', read: 5,
    title: 'סיב אופטי מול כבלים: מה ההבדל וכמה זה עולה? | חוסך',
    desc: 'מה זה סיב אופטי, במה הוא עדיף על כבלים ו-ADSL, איזו מהירות באמת צריך, ההבדל בין תשתית לספק, וכמה זה עולה — כולל מלכודת המבצע.',
    h1: 'סיב אופטי מול כבלים: מה ההבדל וכמה זה עולה?',
    tldr: 'סיב אופטי הוא התשתית המהירה והיציבה ביותר, ומחירי המבצע מתחילים סביב ₪49–₪99. לרוב הבתים מהירות של 300–500Mb יותר ממספיקה. זכרו שאתם משלמים על שני רכיבים — תשתית + ספק — והשוו את שניהם.',
    sections: [
      { h2: 'מה זה סיב אופטי?', p: ['סיב אופטי (פייבר) מעביר נתונים דרך אור, מה שמאפשר מהירויות גבוהות מאוד (עד גיגה ומעלה) עם יציבות גבוהה והשהיה נמוכה — מצוין לעבודה מהבית, גיימינג וסטרימינג 4K.'] },
      { h2: 'סיב מול כבלים מול ADSL', ul: ['סיב אופטי: המהיר והיציב ביותר, מומלץ כשזמין.', 'כבלים (HFC): מהיר וזמין נרחב, אך לעיתים מאט בשעות עומס.', 'ADSL: ישן ואיטי — כדאי לעבור ממנו אם יש אלטרנטיבה.'] },
      { h2: 'איזו מהירות באמת צריך?', p: ['לבית ממוצע עם כמה מכשירים, 300–500Mb נותנים חוויה מצוינת. גיגה (1000Mb) משתלם רק לבתים עם הרבה משתמשים כבדים במקביל. אל תשלמו על גיגה אם אתם לא באמת צורכים אותו.'] },
      { h2: 'תשתית מול ספק — ההבדל שמבלבל', p: ['חשבון האינטרנט מורכב משניים: חברת התשתית (שמביאה את הסיב לבית) וספק האינטרנט (ISP). אפשר לבחור כל אחד בנפרד, ולעיתים חבילה מאוחדת זולה יותר. חוסך משווה את שני הרכיבים יחד.'] },
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
    title: 'מתי באמת כדאי לעבור ל-5G? (2026) | חוסך',
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
    title: 'מדריך eSIM לחו״ל — איך לבחור חבילה לכל יעד | חוסך',
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
    title: 'איך לבטל התחייבות בלי לשלם קנס | חוסך',
    desc: 'מתי בכלל יש קנס יציאה, איך בודקים אם יש לכם התחייבות פעילה, ומה אפשר לעשות כדי לעבור ספק בלי לשלם מיותר. הכוונה כללית ידידותית — לא ייעוץ משפטי.',
    h1: 'איך לבטל התחייבות בלי לשלם קנס',
    tldr: 'לפני שעוברים — בדקו אם בכלל יש לכם התחייבות פעילה וכמה היא עוד נמשכת. אם אין התחייבות, אתם חופשיים לעבור בלי קנס. אם יש, לעיתים עדיף לסיים אותה לפני שעוברים, או לבדוק אם החיסכון אצל הספק החדש מצדיק זאת. זו הכוונה כללית, לא ייעוץ משפטי — בכל מקרה ספציפי בדקו מול הספק שלכם.',
    sections: [
      { h2: 'קודם כול — האם בכלל יש לכם התחייבות?', p: ['הרבה אנשים מניחים שהם "כלואים" אצל הספק, אבל בפועל חלק גדול מהמסלולים היום הם ללא התחייבות כלל. במצב כזה אתם יכולים לעבור מתי שתרצו בלי שום קנס. לכן הצעד הראשון תמיד: לברר אם קיימת התחייבות פעילה ועד מתי — ולא להניח.'] },
      { h2: 'איך בודקים אם יש התחייבות פעילה', ul: ['הסתכלו בחשבונית או בחוזה ההצטרפות — שם לרוב מצוין אם יש תקופת התחייבות.', 'התקשרו לשירות הלקוחות ושאלו ישירות: "האם יש לי התחייבות, ועד איזה תאריך?"', 'בקשו לקבל בכתב (מייל/הודעה) את מועד סיום ההתחייבות ואת הסכום שייגבה אם תעזבו לפני כן.', 'שמרו את התשובה — כך תוכלו לתכנן את המעבר בלי הפתעות.'] },
      { h2: 'מאיפה בכלל מגיע "קנס" היציאה', p: ['כשמקבלים הטבה משמעותית (למשל מכשיר במחיר מסובסד או מבצע ארוך) בתמורה להתחייבות, יציאה מוקדמת עשויה לגרור חיוב שמשקף את ההטבה שכבר נהניתם ממנה. זה לא "עונש" שרירותי אלא לרוב התחשבנות על ההטבה. כדאי להבין מראש איך הסכום מחושב כדי שתוכלו להחליט בעיניים פקוחות.'] },
      { h2: 'דרכים לעבור בלי לשלם מיותר', ul: ['חכו לסיום ההתחייבות — אם נשארו שבועות בודדים, לעיתים פשוט שווה להמתין.', 'חשבו את העלות מול התועלת: אם החיסכון השנתי אצל הספק החדש גדול מסכום היציאה, ייתכן שעדיין כדאי לעבור.', 'בקשו מהספק הנוכחי לשפר את התנאים — לעיתים עצם האיום לעזוב מביא הצעה טובה יותר בלי קנס.', 'הימנעו מהתחייבות חדשה כשאתם מצטרפים, כדי לא לחזור לאותה נקודה בעוד שנה.'] },
      { h2: 'תכנון נכון מונע את הבעיה מראש', p: ['הדרך הטובה ביותר לא לשלם קנס היא לדעת מראש מתי ההתחייבות נגמרת ולתזמן את המעבר בהתאם. סמנו את התאריך (חוסך עושה זאת אוטומטית ומזכיר לכם לפני שהמבצע או ההתחייבות מסתיימים), כדי שתעברו בדיוק כשאתם חופשיים — בלי קנס ובלי לשלם את המחיר המלא חודש מיותר. שימו לב: זו הכוונה כללית בלבד; פרטי ההתחייבות שלכם נקבעים בחוזה מול הספק.'] },
    ],
    faq: [
      ['איך אדע אם יש לי התחייבות פעילה?', 'בדקו בחשבונית או בחוזה ההצטרפות, או התקשרו לשירות הלקוחות ושאלו ישירות: "האם יש לי התחייבות, ועד איזה תאריך?" בקשו לקבל את התשובה בכתב.'],
      ['האם תמיד יש קנס יציאה?', 'לא. הרבה מהמסלולים היום הם ללא התחייבות כלל, ואז אפשר לעבור מתי שרוצים בלי קנס. קנס מופיע בעיקר כשקיבלתם הטבה משמעותית בתמורה להתחייבות.'],
      ['האם כדאי לעבור גם אם יש קנס?', 'תלוי בחישוב: אם החיסכון השנתי אצל הספק החדש גדול מסכום היציאה, ייתכן שעדיין כדאי. זו הכוונה כללית בלבד, לא ייעוץ משפטי.'],
    ],
  },
  {
    slug: 'guide-read-bill', cat: 'מדריך כללי', date: '2026-06-08', read: 5,
    title: 'איך לקרוא חשבון תקשורת ולמצוא חיובים מיותרים | חוסך',
    desc: 'רוב החשבונות מסתירים תוספות קטנות שנשכחו: שירותים שכבר לא צריך, מבצע שהסתיים, ביטוח וגיבויים. כך קוראים את החשבון שורה-שורה, מזהים חיובים מיותרים ויודעים מה לשאול ואיך לפעול.',
    h1: 'איך לקרוא חשבון תקשורת ולמצוא חיובים מיותרים',
    tldr: 'החשבון החודשי הוא המקום שבו נשמר הכסף שדולף. כמעט בכל חשבון מצטברות תוספות קטנות שנשכחו — שירות שכבר לא בשימוש, מבצע שהסתיים והמחיר קפץ, ביטוח או "שירות פרימיום" שמעולם לא ביקשתם. עברו על החשבון שורה-שורה פעם ברבעון, סמנו כל סעיף שאתם לא מזהים, ובדקו מולו. כמה דקות בשנה שוות מאות שקלים.',
    sections: [
      { h2: 'למה בכלל לקרוא את החשבון?', p: ['רוב האנשים מסתכלים רק על השורה התחתונה — הסכום לתשלום — ומעבירים הלאה. אבל הסכום הזה מורכב מהרבה סעיפים קטנים, וכל אחד מהם הוא הזדמנות לחיוב שכבר אינו רלוונטי. תוספת של ₪9 או ₪19 בחודש נראית זניחה, אבל היא ₪108–₪228 בשנה — וכשמצטברות כמה כאלה, מדובר בחיסכון אמיתי שמחכה רק שתבחינו בו.'] },
      { h2: 'מאיזה רכיבים מורכב חשבון תקשורת', ul: ['דמי המסלול הבסיסי — הליבה של מה שאתם משלמים עליו.', 'תוספות ושירותים — ביטוח מכשיר, שירות שיחות מורחב, אחסון ענן, מנויי תוכן.', 'הטבות ומבצעים — הנחה זמנית שיורדת מהמחיר (שימו לב מתי היא מסתיימת).', 'חיובים חד-פעמיים — שיחות לחו״ל, גלישה מעבר לחבילה, רכישות חד-פעמיות.', 'מסים ועיגולים — לרוב קבועים, אך כדאי לוודא שהסכום מסתדר.'] },
      { h2: 'מה לחפש — החיובים המיותרים הנפוצים', ul: ['שירותים שנשכחו: ביטוח למכשיר ישן שכבר החלפתם, שירות חיוג שלא השתמשתם בו שנים.', 'מבצע שהסתיים: ההנחה ירדה מהחשבון והמחיר קפץ בשקט — בלי שאף אחד יידע אתכם.', 'מנויי תוכן ותוספות פרימיום: שורות קטנות של ₪5–₪20 שהצטרפו אגב מבצע ונשארו.', 'כפילויות: אחסון ענן שאתם משלמים עליו גם דרך הספק וגם ישירות לחברה אחרת.', 'חיובי גלישה/שיחות חריגים: סימן שהחבילה לא מתאימה לשימוש האמיתי שלכם.'] },
      { h2: 'מה לשאול את הספק', p: ['ברגע שזיהיתם סעיף שאתם לא מזהים, אל תנחשו — שאלו ישירות. בקשו פירוט מה כולל כל שירות שמופיע בחשבון, מתי הוא הופעל, והאם הוא חלק מהמסלול או תוספת נפרדת. שאלה חשובה במיוחד: "האם המבצע שלי עדיין פעיל, ומתי הוא מסתיים?" — כך תדעו מראש אם המחיר עומד לקפוץ. בקשו לקבל את התשובות בכתב, כדי שיהיה לכם תיעוד.'] },
      { h2: 'איך לפעול אחרי שמצאתם', p: ['ביטול של תוספת מיותרת הוא לרוב פעולה פשוטה מול שירות הלקוחות, ולעיתים אפשר לעשותה גם באזור האישי באתר או באפליקציה. אם גיליתם שמבצע הסתיים והמחיר קפץ — זו בדיוק הנקודה להשוות מול מה שיש בשוק ולשקול מעבר. הרגל טוב הוא לעבור על החשבון פעם ברבעון, ולסמן תזכורת לתאריכי סיום מבצעים (חוסך עושה זאת אוטומטית) כדי שתפעלו לפני הקפיצה ולא אחריה.'] },
    ],
    faq: [
      ['אילו חיובים מיותרים הכי נפוצים בחשבון?', 'ביטוח למכשיר שכבר החלפתם, מבצע שהסתיים והמחיר קפץ בשקט, מנויי תוכן ותוספות פרימיום קטנות, וכפילויות כמו אחסון ענן שמשלמים עליו פעמיים.'],
      ['כל כמה זמן כדאי לעבור על החשבון?', 'פעם ברבעון. עברו עליו שורה-שורה, סמנו כל סעיף שאתם לא מזהים, ובדקו אותו מול הספק. כמה דקות בשנה שוות מאות שקלים.'],
      ['מה לשאול את הספק על סעיף לא מוכר?', 'בקשו פירוט מה כולל השירות, מתי הופעל, והאם הוא חלק מהמסלול או תוספת. שאלה חשובה: "האם המבצע שלי עדיין פעיל, ומתי הוא מסתיים?"'],
    ],
  },
  {
    slug: 'guide-family-lines', cat: 'סלולר', date: '2026-06-09', read: 5,
    title: 'משפחה? כך חוסכים על כמה קווי סלולר | חוסך',
    desc: 'מסלול משפחתי ארוז מול כמה קווים זולים נפרדים — מתי כל אפשרות יוצאת זולה יותר, איך מנהלים כמה קווים בלי להסתבך, ולמה כדאי לעקוב אחרי תאריכי החידוש של כל קו בנפרד.',
    h1: 'משפחה? כך חוסכים על כמה קווי סלולר',
    tldr: 'כשיש כמה קווים בבית יש שתי דרכים עיקריות: מסלול "משפחתי" ארוז, או כמה קווים זולים נפרדים. אין תשובה אחת נכונה — זה תלוי בכמות הקווים ובשימוש של כל אחד. הכלל הפשוט: חשבו את העלות הכוללת של כל אפשרות לכל הקווים יחד, לא את מחיר הקו הבודד. ולרוב, כמה קווים זולים בלי הגבלה מנצחים את החבילה ה"משפחתית".',
    sections: [
      { h2: 'שתי הדרכים לחבר כמה קווים', p: ['כשמדובר במשפחה עם כמה מכשירים, הספקים מציעים שני מודלים. הראשון הוא מסלול משפחתי ארוז — חבילה אחת שמכסה כמה קווים במחיר משותף. השני הוא פשוט לפתוח כמה קווים זולים ונפרדים, כל אחד עם המסלול שלו. שני המודלים לגיטימיים, וההבדל ביניהם הוא בעיקר במחיר הכולל ובנוחות הניהול.'] },
      { h2: 'מתי מסלול משפחתי משתלם', ul: ['כשהמחיר לקו במסלול המשפחתי נמוך משמעותית ממה שתשלמו על קווים נפרדים.', 'כשיש הרבה קווים (4 ומעלה) והחבילה נותנת הנחת כמות אמיתית.', 'כשנוח לכם שהכול מרוכז בחשבון אחד ובמועד חיוב אחד.', 'כשהחבילה כוללת הטבה משותפת שבאמת תנצלו (למשל גלישה משותפת).'] },
      { h2: 'מתי כמה קווים נפרדים זולים יותר', p: ['בשנים האחרונות מחירי הקווים הבודדים צנחו, ומסלול 5G ללא הגבלה נמכר במחיר נמוך. התוצאה: לעיתים קרובות מצרף של כמה קווים זולים ונפרדים יוצא זול יותר ממסלול "משפחתי" ארוז שנשמע משתלם בזכות הכותרת. היתרון הנוסף הוא גמישות — כל קו עצמאי, אפשר לשדרג או לעזוב כל אחד בנפרד בלי לגעת בשאר. לפני שמתחייבים לחבילה משפחתית, תמיד שווה לחשב כמה יעלו אותם קווים אם תקנו כל אחד בנפרד.'] },
      { h2: 'איך מנהלים כמה קווים בלי להסתבך', ul: ['רשמו טבלה פשוטה: שם בעל הקו, הספק, המסלול, המחיר ותאריך סיום המבצע.', 'אם הקווים מפוזרים בין כמה ספקים — זה לגיטימי, כל עוד אתם עוקבים אחרי כולם.', 'בדקו פעם ברבעון שאף קו לא "קפץ" במחיר אחרי סיום מבצע.', 'שקלו לרכז את מועדי החידוש כדי שיהיה קל לעקוב — או תנו לכלי מעקב לעשות זאת עבורכם.'] },
      { h2: 'אל תשכחו את תאריכי החידוש', p: ['הבעיה הגדולה עם כמה קווים היא לא המחיר ההתחלתי אלא המעקב: לכל קו יש מבצע משלו שמסתיים בתאריך אחר, ובלי מעקב אחד מהם תמיד יקפוץ במחיר בלי שתשימו לב. זו בדיוק הנקודה שבה ריבוי קווים הופך ליקר. סמנו לכל קו את תאריך סיום המבצע (חוסך עוקב אחרי כל הקווים ומזכיר ~21 יום לפני כל חידוש), כך שתשוו ותפעלו בזמן — לכל קו בנפרד — במקום לגלות את הקפיצה רק בחשבון.'] },
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

// Render a single guide card (reused by guides index, article "related", category pages).
function guideCard(g) {
  const dateHe = new Date(g.date).toLocaleDateString('he-IL', { year: 'numeric', month: 'long', day: 'numeric' });
  return `          <a class="guide-card reveal" href="${g.slug}.html">
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
    { '@type': 'Article', headline: g.h1, description: g.desc, datePublished: g.date,
      inLanguage: 'he-IL', mainEntityOfPage: url,
      author: { '@type': 'Organization', name: 'חוסך' },
      publisher: { '@type': 'Organization', name: 'חוסך' } },
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

function head(title, desc, url, extraJsonLd, noindex) {
  return `<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />${noindex ? '\n  <base href="/" />' : ''}
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(desc)}" />${noindex ? '\n  <meta name="robots" content="noindex" />' : ''}
  <style>.skip{position:absolute;left:-999px;top:0;z-index:100;background:#111827;color:#fff;padding:10px 16px;border-radius:0 0 8px 0}.skip:focus{left:0}</style>
  <meta name="theme-color" content="#111827" />
  <link rel="canonical" href="${url}" />
  <link rel="icon" href="favicon.svg" type="image/svg+xml" />
  <link rel="apple-touch-icon" href="favicon.svg" />
  <link rel="manifest" href="site.webmanifest" />
  <meta property="og:type" content="article" />
  <meta property="og:locale" content="he_IL" />
  <meta property="og:url" content="${url}" />
  <meta property="og:site_name" content="חוסך" />
  <meta property="og:title" content="${esc(title)}" />
  <meta property="og:description" content="${esc(desc)}" />
  <meta property="og:image" content="${SITE}/og-image.png" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:image" content="${SITE}/og-image.png" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link rel="preconnect" href="https://plausible.io" />
  <link rel="preconnect" href="https://orzitfqmlvopujsoyigr.supabase.co" />
  <link rel="preload" as="style" href="https://fonts.googleapis.com/css2?family=Rubik:wght@500;700;800;900&family=Assistant:wght@400;500;600;700&display=swap" />
  <link href="https://fonts.googleapis.com/css2?family=Rubik:wght@500;700;800;900&family=Assistant:wght@400;500;600;700&display=swap" rel="stylesheet" media="print" onload="this.media='all'" />
  <noscript><link href="https://fonts.googleapis.com/css2?family=Rubik:wght@500;700;800;900&family=Assistant:wght@400;500;600;700&display=swap" rel="stylesheet" /></noscript>
  <link rel="stylesheet" href="${CSS_HREF}" />
  ${analyticsTag()}
  ${extraJsonLd ? `<script type="application/ld+json">${extraJsonLd}</script>` : ''}
</head>`;
}

function articlePage(g) {
  const url = `${SITE}/${g.slug}.html`;
  const body = g.sections.map((s) => {
    let html = `        <h2>${esc(s.h2)}</h2>\n`;
    if (s.p) html += s.p.map((p) => `        <p>${esc(p)}</p>`).join('\n') + '\n';
    if (s.ul) html += `        <ul>\n${s.ul.map((li) => `          <li>${esc(li)}</li>`).join('\n')}\n        </ul>\n`;
    return html;
  }).join('\n');
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
${body}
          </div>
          <div class="article-cta">
            <h3>רוצים לראות כמה תחסכו בפועל?</h3>
            <p>השוואה חינם בשניות, בלי התחייבות.</p>
            <a class="btn btn--inverse btn--lg" href="index.html#calculator">בדקו עכשיו ←</a>
          </div>
        </div>
      </section>
${faqSection}      <section class="section section--alt" aria-label="מדריכים נוספים">
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

function guidesIndexPage() {
  const url = `${SITE}/guides.html`;
  const cards = guides.map(guideCard).join('\n');
  return `<!DOCTYPE html>
<html lang="he" dir="rtl">
${head('מדריכים — איך לחסוך על תקשורת | חוסך', 'מדריכים מקצועיים: איך לעבור ספק, לבחור מסלול סלולר, סיב אופטי מול כבלים ועוד — כל הטיפים כדי לא לשלם יותר מדי.', url)}
<body id="top">
${navNoCta}
  <main id="main">
    <section class="article-hero">
      <div class="container">
        <p class="crumbs"><a href="index.html">דף הבית</a> ← מדריכים</p>
        <h1>מדריכים — איך לא לשלם יותר מדי</h1>
        <div class="article-meta"><span>טיפים, מדריכים והשוואות שיחסכו לכם כסף</span></div>
      </div>
    </section>
    <section class="section">
      <div class="container">
        <div class="guide-cards">
${cards}
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

// ── Static pages (about / legal) ─────────────────────────────────────────────
const staticPages = [
  {
    slug: 'about', cta: true,
    title: 'אודות חוסך — מי אנחנו ואיך אנחנו עובדים',
    desc: 'חוסך היא פלטפורמה ישראלית להשוואת מחירי תקשורת. כך אנחנו עובדים, איך השירות נשאר חינמי, ולמה אפשר לסמוך עלינו.',
    h1: 'על חוסך', intro: 'משווים, חוסכים, עוברים — בלי כאב ראש.',
    sections: [
      { h2: 'מי אנחנו', p: ['חוסך מרכזת את כל מסלולי התקשורת בישראל — סלולר, אינטרנט, טלוויזיה, חבילות משולבות וחו״ל — במקום אחד, ועוזרת לכם למצוא את המסלול המשתלם ביותר ולעבור אליו בקלות.'] },
      { h2: 'המודל שלנו — והשירות חינמי לכם', p: ['השירות חינמי לחלוטין למשתמשים. אנחנו מקבלים עמלה מחברת התקשורת כשעוברים דרכנו — אבל המחיר שאתם משלמים זהה, והעמלה אינה משפיעה על הדירוג. אנחנו מדרגים מסלולים לפי ההתאמה לכם, לא לפי מי שמשלם לנו.'] },
      { h2: 'למה לסמוך עלינו', ul: ['מחירים מעודכנים מכל החברות במקום אחד.', 'המלצה מוסברת — רואים בדיוק למה מסלול דורג גבוה.', 'התראת חידוש שמונעת מכם לשלם יותר מדי כשהמבצע נגמר.', 'קהילה וחוות דעת אמיתיות של לקוחות.'] },
      { h2: 'מה אנחנו עושים בשבילכם', ul: ['משווים את כל השוק בשניות.', 'ממליצים לפי הצרכים והתקציב שלכם.', 'מלווים את המעבר — כולל ניוד מספר בלי עמלות נסתרות.', 'מזכירים לבדוק שוב לפני שמבצע נגמר.'] },
    ],
  },
  {
    slug: 'privacy',
    title: 'מדיניות פרטיות — חוסך',
    desc: 'מדיניות הפרטיות של חוסך — איזה מידע אנחנו אוספים, כיצד אנו משתמשים בו, עם מי הוא משותף ומהן זכויותיכם.',
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
    title: 'תנאי שימוש — חוסך',
    desc: 'תנאי השימוש בשירותי חוסך — תיאור השירות, הערכות חיסכון, אחריות המשתמש, קניין רוחני, הגבלת אחריות ודין חל.',
    h1: 'תנאי שימוש', intro: 'עודכן לאחרונה: יוני 2026',
    sections: [
      { h2: 'השירות', p: ['חוסך מספקת השוואת מחירים, המלצות וליווי מעבר בין ספקי תקשורת. השירות ניתן חינם למשתמשים.'] },
      { h2: 'אין הבטחה לחיסכון מסוים', p: ['הסכומים המוצגים, לרבות במחשבון החיסכון, הם הערכות בלבד. החיסכון בפועל תלוי בחבילה, בספק ובשימוש שלכם. אנו משתדלים לשמור על מחירים מעודכנים, אך ייתכנו אי-דיוקים — יש לאמת את הפרטים מול הספק לפני התקשרות.'] },
      { h2: 'אחריות המשתמש', p: ['עליכם למסור פרטים נכונים ולהשתמש בשירות בתום לב ובהתאם לדין.'] },
      { h2: 'קניין רוחני', p: ['התכנים, העיצוב והסימנים באתר הם בבעלות חוסך או מי מטעמה, ואין לעשות בהם שימוש ללא רשות בכתב.'] },
      { h2: 'הגבלת אחריות', p: ['השירות ניתן כפי שהוא ("as is"). בכפוף לדין, חוסך לא תישא באחריות לנזק עקיף הנובע מהסתמכות על המידע או מהמעבר בין ספקים.'] },
      { h2: 'דין חל', p: ['על תנאים אלה יחולו דיני מדינת ישראל, וסמכות השיפוט הבלעדית נתונה לבתי המשפט המוסמכים בישראל.'] },
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
  return `<!DOCTYPE html>
<html lang="he" dir="rtl">
${head(p.title, p.desc, url)}
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
${head('הדף לא נמצא — חוסך', 'הדף שחיפשתם לא נמצא.', `${SITE}/404.html`, null, true)}
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
          <a class="btn btn--ghost btn--lg" href="guides.html">למדריכים</a>
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

function plansPage() {
  const url = `${SITE}/plans.html`;
  const filterBtns = [['all', 'הכל'], ...categories.map((c) => [c.slug, c.name])]
    .map(([f, label], i) => `<button class="filter-btn${i === 0 ? ' active' : ''}" data-filter="${f}">${esc(label)}</button>`)
    .join('\n          ');
  const cards = catalogue.plans.slice().sort((a, b) => a.price - b.price).map(planCardHtml).join('\n        ');
  const collectionsSection = builtCollections.length ? `
    <section class="section section--alt" aria-label="אוספים">
      <div class="container">
        <header class="section__head reveal"><span class="eyebrow">קיצורי דרך</span><h2>אוספים פופולריים</h2><p>קפיצה ישירה למה שמחפשים.</p></header>
        <div class="providers__row">
          ${builtCollections.map((col) => `<a class="chip" href="${col.slug}.html">${esc(col.h1)}</a>`).join('\n          ')}
        </div>
      </div>
    </section>` : '';
  return `<!DOCTYPE html>
<html lang="he" dir="rtl">
${head('כל החבילות — מחירון מלא של כל חברות התקשורת | חוסך', `מחירון מלא: ${catalogue.plans.length} מסלולי סלולר, אינטרנט, טלוויזיה, חבילות משולבות וחו״ל מכל החברות — ממוין מהזול ביותר. סננו לפי קטגוריה וחפשו.`, url)}
<body id="top">
${nav}
  <main id="main">
    <section class="lead-hero">
      <div class="container">
        <p class="crumbs"><a href="index.html">דף הבית</a> ← כל החבילות</p>
        <h1>כל החבילות — <span class="hl">מחירון מלא</span></h1>
        <p>${catalogue.plans.length} מסלולים מכל חברות התקשורת, ממוינים מהזול ביותר. סננו לפי קטגוריה או חפשו ספק/מסלול/תכונה.</p>
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
          <button class="flag-chip" data-flag="5g">5G</button>
          <button class="flag-chip" data-flag="nocommit">ללא התחייבות</button>
          <button class="flag-chip" data-flag="abroad">כולל חו״ל</button>
          <button class="flag-chip" data-flag="haspromo">מחיר מבצע</button>
          <span class="plan-count" id="planCount" aria-live="polite" aria-atomic="true"></span>
        </div>
        <div class="plan-grid" id="planGrid">
        ${cards}
        </div>
        <p class="plan-empty" id="planEmpty">לא נמצאו חבילות שתואמות את החיפוש. נסו להסיר חלק מהמסננים או <button type="button" class="plan-empty__reset" id="planEmptyReset">לנקות הכל</button>.</p>
      </div>
    </section>
${collectionsSection}
    <section class="cta" id="cta">
      <div class="container cta__inner reveal">
        <h2>מצאתם משהו מעניין?</h2>
        <p>השאירו פרטים ונעזור לכם לעבור — חינם, בלי התחייבות.</p>
        ${leadFormHtml('קבלו השוואה חינם')}
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
  const jsonld = jsonForScript({
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'BreadcrumbList', itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'דף הבית', item: SITE + '/' },
        { '@type': 'ListItem', position: 2, name: 'כל החבילות', item: SITE + '/plans.html' },
        { '@type': 'ListItem', position: 3, name: name, item: url },
      ] },
      plansItemListJsonLd(plans, url, `מסלולי ${name}`),
    ],
  });
  return `<!DOCTYPE html>
<html lang="he" dir="rtl">
${head(`כל המסלולים של ${name} — מחירים והשוואה | חוסך`, `כל מסלולי ${name} במקום אחד — ${plans.length} מסלולים מ-₪${cheapest}. השוו מחירים ותכונות ומצאו את המשתלם ביותר.`, url, jsonld)}
<body id="top">
${nav}
  <main id="main">
    <section class="lead-hero">
      <div class="container">
        <p class="crumbs"><a href="index.html">דף הבית</a> ← <a href="plans.html">כל החבילות</a> ← ${esc(name)}</p>
        <div style="margin-bottom:14px">${providerLogo(name, 64)}</div>
        <h1>כל המסלולים של <span class="hl">${esc(name)}</span></h1>
        <p>${plans.length} מסלולים${catNames.length ? ` (${esc(catNames.join(' · '))})` : ''} — החל מ-₪${cheapest}. השוו מחירים ותכונות, ומצאו את המסלול המשתלם ביותר.</p>
        <div class="hero__cta"><a class="btn btn--primary btn--lg" href="#cta">קבלו השוואה חינם ←</a><a class="btn btn--ghost btn--lg" href="plans.html">לכל החבילות</a></div>
      </div>
    </section>
    <section class="section">
      <div class="container">
        <div class="plan-grid">
        ${cards}
        </div>
      </div>
    </section>
    <section class="cta" id="cta">
      <div class="container cta__inner reveal">
        <h2>רוצים לעבור ל${esc(name)} — או ממנו?</h2>
        <p>השאירו פרטים ונעזור לכם למצוא ולעבור למסלול הכי משתלם, חינם ובלי התחייבות.</p>
        ${leadFormHtml('קבלו השוואה חינם')}
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
  const map = {};
  for (const p of catalogue.plans) (map[p.provider] ||= []).push(p);
  const cards = Object.keys(map).sort((a, b) => map[b].length - map[a].length).map((name) => {
    const ps = map[name];
    const min = ps.reduce((m, p) => Math.min(m, p.price), Infinity);
    return `        <a class="provider-card" href="provider-${providerSlug(name)}.html">${providerLogo(name, 46)}<span><b>${esc(name)}</b><small>${ps.length} מסלולים · מ-₪${min}</small></span></a>`;
  }).join('\n');
  return `<!DOCTYPE html>
<html lang="he" dir="rtl">
${head('כל הספקים — מסלולים ומחירים לפי חברה | חוסך', 'כל ספקי התקשורת בישראל במקום אחד — סלקום, פרטנר, פלאפון, גולן, בזק, הוט, yes ועוד. בחרו ספק וראו את כל המסלולים שלו.', url)}
<body id="top">
${navNoCta}
  <main id="main">
    <section class="lead-hero">
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
  </main>
${footer}
  ${leadsConfigTag()}
  <script src="${JS_SRC}" defer></script>
</body>
</html>
`;
}

function comparePage() {
  const url = `${SITE}/compare.html`;
  const data = catalogue.plans.map((p) => ({
    id: p.id, cat: p.cat, provider: p.provider, plan: p.plan, price: p.price, priceExact: p.priceExact,
    after: p.after, net: p.net, is5G: p.is5G, noCommit: p.noCommit, hasAbroad: p.hasAbroad,
    specs: p.specs,
  }));
  const optionsFor = (preId) => categories.map((c) => {
    const opts = (plansByCat[c.slug] || []).map((p) =>
      `<option value="${esc(p.id)}"${p.id === preId ? ' selected' : ''}>${esc(p.provider)} — ${esc(p.plan)} (₪${priceText(p)})</option>`).join('');
    return `<optgroup label="${esc(c.name)}">${opts}</optgroup>`;
  }).join('');
  const firstTwo = (plansByCat['cellular'] || []).slice(0, 2).map((p) => p.id);
  const sel = (i, preId) =>
    `<select class="compare-pick filter-search" id="cmp${i}" aria-label="מסלול ${i + 1}"><option value="">— בחרו מסלול —</option>${optionsFor(preId)}</select>`;
  return `<!DOCTYPE html>
<html lang="he" dir="rtl">
${head('השוואת מסלולים צד לצד | חוסך', 'בחרו עד 3 מסלולים והשוו אותם צד לצד — מחיר, רשת, 5G, התחייבות, חו״ל ומפרט. מכל חברות התקשורת.', url)}
<body id="top">
${nav}
  <main id="main">
    <section class="lead-hero">
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
      </div>
    </section>
    <section class="cta" id="cta">
      <div class="container cta__inner reveal">
        <h2>בחרתם? נעזור לכם לעבור</h2>
        <p>השאירו פרטים ונדאג לכל המעבר — חינם, בלי התחייבות.</p>
        ${leadFormHtml('קבלו השוואה חינם')}
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
    ['🤖', 'חוסך AI', 'יועץ התקשורת החכם — שואלים בשפה חופשית ("מה הכי משתלם לי?") ומקבלים תשובה מנומקת.'],
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
    ['👥', 'קהילת חוסך', 'פיד פעיל עם ערוצים לכל נושא — המלצות, סלולר, אינטרנט, חו״ל ועזרה בניתוק.'],
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
const AI_CHIPS = ['✨ מה הכי משתלם לי?', '📱 סלולר הכי זול', '🌐 אינטרנט 1000Mb', '✅ ללא התחייבות', '✈️ חבילת חו״ל', '💰 פחות מ-₪50'];

function appPage() {
  const url = `${SITE}/app.html`;
  const groups = APP_GROUPS.map(([gIcon, gTitle, items]) => {
    const cards = items.map(([icon, h, p]) =>
      `          <article class="feature reveal"><span class="feature__icon">${iconFor(icon)}</span><h3>${esc(h)}</h3><p>${esc(p)}</p></article>`).join('\n');
    return `      <div class="app-group">
        <header class="section__head reveal"><span class="eyebrow">${gIcon} ${esc(gTitle)}</span></header>
        <div class="features">
${cards}
        </div>
      </div>`;
  }).join('\n');

  // Channel list mirrors the in-app community channels — shown as honest "what
  // you'll find inside" chips, not as a fake live feed with fabricated posts.
  const channels = ['המלצות', 'סלולר', 'אינטרנט', 'טלוויזיה', 'חו״ל', 'עזרה בניתוק'];
  const chanChips = channels.map((c) => `<span class="chip">${esc(c)}</span>`).join('\n          ');

  const aiChips = AI_CHIPS.map((c) => `<span class="ai-chip">${esc(c)}</span>`).join('');

  return `<!DOCTYPE html>
<html lang="he" dir="rtl">
${head('האפליקציה של חוסך — כל היכולות | חוסך', 'הכירו את אפליקציית חוסך: חוסך AI, קהילה והצ׳אט הקהילתי, מעקב מעבר, התראות חידוש, דירוגי ספקים, בדיקת זמינות, מחשבון מעבר וניוד מספר — הכל במקום אחד.', url)}
<body id="top">
${nav}
  <main id="main">
    <section class="lead-hero">
      <div class="container">
        <p class="crumbs"><a href="index.html">דף הבית</a> ← האפליקציה</p>
        <h1>האפליקציה ש<span class="hl">עושה את העבודה</span></h1>
        <p>חוסך היא לא עוד טבלת השוואה — היא מלווה אתכם מההשוואה ועד החיסכון, ואחר כך דואגת שלא תשלמו יותר מדי שוב. כל היכולות, בעברית, במקום אחד.</p>
        <div class="lead-hero__cta">
          <a class="btn btn--primary btn--lg" href="#cta">קבלו גישה מוקדמת</a>
          <a class="btn btn--ghost btn--lg" href="plans.html">או דפדפו במסלולים</a>
        </div>
      </div>
    </section>

    <section class="section" aria-label="צילומי מסך מהאפליקציה">
      <div class="container">
        <header class="section__head reveal"><span class="eyebrow">הצצה פנימה</span><h2>ככה זה נראה באמת</h2><p>צילומי מסך אמיתיים מהאפליקציה — לא הדמיות.</p></header>
        <div class="app-shots">
          <figure class="app-shot reveal"><img src="assets/app/shot-home.webp" alt="מסך הבית של חוסך — חיסכון פוטנציאלי ועסקאות חמות" width="390" height="844" loading="lazy" decoding="async"><figcaption>דף הבית — החיסכון שלכם במבט אחד</figcaption></figure>
          <figure class="app-shot reveal"><img src="assets/app/shot-results.webp" alt="השוואת מסלולים בחוסך — דירוג חכם וציון התאמה" width="390" height="844" loading="lazy" decoding="async"><figcaption>השוואת מסלולים עם ציון התאמה</figcaption></figure>
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
        <header class="section__head reveal"><span class="eyebrow">💬 קהילת חוסך</span><h2>הצ׳אט הקהילתי — חוכמת ההמון</h2><p>צ׳אט קהילתי עם ערוץ לכל נושא: שואלים, מגיבים, משתפים תמונה או הקלטה — ולומדים מאנשים שכבר עברו.</p></header>
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
        <header class="section__head reveal"><span class="eyebrow">🤖 חוסך AI</span><h2>יועץ התקשורת החכם שלכם</h2><p>שואלים בשפה חופשית — מקבלים המלצה מנומקת עם חיסכון שנתי.</p></header>
        <div class="ai-demo reveal">
          <div class="ai-chat" id="aiChat">
            <div class="ai-bubble ai-bubble--bot">היי! אני חוסך AI — שאלו אותי על מסלולי סלולר, אינטרנט, טלוויזיה או חו״ל, ואני אענה לפי הנתונים האמיתיים שלנו.</div>
          </div>
          <div class="ai-chips" aria-label="שאלות מהירות לדוגמה">${aiChips}</div>
          <form class="ai-input" id="aiChatForm">
            <input type="text" id="aiChatInput" maxlength="500" placeholder="שאלו אותי כל דבר על מסלולים..." aria-label="שאלו את חוסך AI" autocomplete="off" />
            <button type="submit" class="btn btn--primary">שלחו</button>
          </form>
          <p class="ai-foot">חוסך AI עונה לפי מסלולים אמיתיים מהקטלוג — לא ייעוץ אישי מחייב.</p>
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
    title: 'מסלולי 5G הזולים ביותר — השוואת מחירים מלאה | חוסך',
    h1: 'מסלולי 5G — מהזול ביותר',
    desc: 'כל מסלולי ה-5G בשוק במקום אחד, ממוינים מהזול ביותר. מהירות וכיסוי משופרים — לרוב במחיר של מסלול רגיל.',
    intro: '5G כבר לא יקר יותר. ריכזנו את כל מסלולי ה-5G, ממוינים מהזול ליקר — בדקו תמיד גם את המחיר שאחרי המבצע.',
    filter: (p) => p.cat === 'cellular' && p.is5G, limit: 15,
  },
  {
    slug: 'plans-no-commitment', catSlug: 'cellular', catName: 'סלולר', eyebrow: 'גמישות מלאה',
    title: 'מסלולים ללא התחייבות — סלולר ואינטרנט | חוסך',
    h1: 'מסלולים ללא התחייבות',
    desc: 'מסלולי סלולר ואינטרנט ללא התחייבות — עוזבים מתי שרוצים. ממוינים מהזול ביותר, מחירים מעודכנים מכל החברות.',
    intro: 'ללא התחייבות = הכוח בידיים שלכם: אם המחיר קופץ, פשוט עוברים. הנה המסלולים ללא התחייבות בשוק.',
    filter: (p) => (p.cat === 'cellular' || p.cat === 'internet') && p.noCommit, limit: 18,
  },
  {
    slug: 'internet-giga', catSlug: 'internet', catName: 'אינטרנט', eyebrow: '1000Mb',
    title: 'אינטרנט גיגה (1000Mb) — השוואת מחירים | חוסך',
    h1: 'אינטרנט גיגה — 1000Mb',
    desc: 'מסלולי אינטרנט במהירות גיגה (1000Mb) ממוינים מהזול ביותר — לבתים עם הרבה משתמשים כבדים במקביל.',
    intro: 'מהירות גיגה משתלמת לבתים עם הרבה משתמשים כבדים. הנה מסלולי הגיגה בשוק, ממוינים מהזול ליקר.',
    filter: (p) => p.cat === 'internet' && /1000|גיגה|ג׳יגה/.test([p.plan, (p.feats || []).join(' '), JSON.stringify(p.specs || {})].join(' ')),
    limit: 12,
  },
  {
    slug: 'esim-abroad', catSlug: 'abroad', catName: 'חבילות חו״ל', eyebrow: 'eSIM',
    title: 'חבילות eSIM לחו״ל — השוואת מחירים | חוסך',
    h1: 'חבילות eSIM לחו״ל',
    desc: 'חבילות eSIM דיגיטליות לכל יעד — ממוינות מהזול ביותר. מתקינים מראש, נוחתים ומחוברים, וחוסכים מול רומינג.',
    intro: 'eSIM זול בהרבה מרומינג רגיל ומותקן עוד לפני שיוצאים מהבית. הנה חבילות ה-eSIM, ממוינות מהזול ליקר.',
    filter: (p) => p.cat === 'abroad' && /esim|איראלו|airalo/i.test([p.provider, p.plan, p.net, (p.feats || []).join(' ')].join(' ')),
    limit: 15,
  },
  {
    slug: 'cellular-with-abroad', catSlug: 'cellular', catName: 'סלולר', eyebrow: 'כולל חו״ל',
    title: 'מסלולי סלולר שכוללים גלישה בחו״ל | חוסך',
    h1: 'מסלולי סלולר עם גלישה בחו״ל',
    desc: 'מסלולי סלולר שכוללים גלישה בחו״ל בחבילה — בלי לקנות חבילת רומינג נפרדת. ממוינים מהזול ביותר.',
    intro: 'חלק מהמסלולים כוללים גלישה בחו״ל כבר בחבילה. אם אתם נוסעים הרבה, זה יכול לחסוך. הנה המסלולים האלה.',
    filter: (p) => p.cat === 'cellular' && p.hasAbroad, limit: 15,
  },
  {
    slug: 'cellular-budget', catSlug: 'cellular', catName: 'סלולר', eyebrow: 'מתחת ל-₪30',
    title: 'מסלולי סלולר מתחת ל-₪30 — הזולים ביותר | חוסך',
    h1: 'מסלולי סלולר מתחת ל-₪30',
    desc: 'מסלולי הסלולר הזולים ביותר — מתחת ל-₪30 לחודש, ממוינים מהזול ביותר. מחירים מעודכנים מכל החברות.',
    intro: 'תקציב קטן? ריכזנו את מסלולי הסלולר שעולים פחות מ-₪30 בחודש, ממוינים מהזול ליקר.',
    filter: (p) => p.cat === 'cellular' && offerPrice(p) < 30, limit: 15,
  },
  {
    slug: 'kosher-plans', catSlug: 'cellular', catName: 'סלולר', eyebrow: 'כשר',
    title: 'מסלולים כשרים — השוואת מחירים מלאה | חוסך',
    h1: 'מסלולים כשרים',
    desc: 'מסלולי סלולר כשרים בפיקוח — ממוינים מהזול ביותר. השוו מחירים ותנאים מכל החברות במקום אחד.',
    intro: 'מסלולים כשרים בפיקוח, ממוינים מהזול ליקר — כל האפשרויות במקום אחד.',
    filter: (p) => p.kind === 'kosher', limit: 15,
  },
  {
    slug: 'data-only', catSlug: 'cellular', catName: 'סלולר', eyebrow: 'גלישה בלבד',
    title: 'מסלולי גלישה בלבד (Data Only) לטאבלט וראוטר | חוסך',
    h1: 'מסלולי גלישה בלבד (Data Only)',
    desc: 'מסלולי SIM לגלישה בלבד — מושלמים לטאבלט, לראוטר נייד או כקו נתונים משני. ממוינים מהזול ביותר.',
    intro: 'צריכים גלישה בלי קו טלפון — לטאבלט, לראוטר נייד או כקו משני? אלה מסלולי הגלישה בלבד בשוק.',
    filter: (p) => p.kind === 'dataonly', limit: 15,
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
  if (shown.length) graph.push(plansItemListJsonLd(shown, url, col.h1));
  const extraJsonLd = jsonForScript({ '@context': 'https://schema.org', '@graph': graph });
  const guidesHtml = relatedGuides(col.catName, null, 2).map(guideCard).join('\n');
  return `<!DOCTYPE html>
<html lang="he" dir="rtl">
${head(col.title, col.desc, url, extraJsonLd)}
<body id="top">
${nav}
  <main id="main">
    <section class="lead-hero">
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
        <header class="section__head reveal"><span class="eyebrow">${shown.length} מסלולים</span><h2>${esc(col.h1)}</h2><p>ממוין מהזול ביותר — מחירים מעודכנים מכל החברות.</p></header>
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
    <section class="cta" id="cta">
      <div class="container cta__inner reveal">
        <h2>מצאתם משהו מעניין?</h2>
        <p>השאירו פרטים ונעזור לכם לעבור — חינם, בלי התחייבות.</p>
        ${leadFormHtml('קבלו השוואה חינם')}
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
  const title = `מחשבון חיסכון ${c.name} — כמה אתם משלמים מדי? | חוסך`;
  const desc = `מחשבון חיסכון ${c.name}: הזינו כמה אתם משלמים היום וגלו בכמה אפשר לחסוך בשנה מול המסלול הזול ביותר בשוק. חינם, בלי התחייבות.`;
  const h1 = `מחשבון חיסכון ${c.name}`;
  const crumbs = { '@type': 'BreadcrumbList', itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'דף הבית', item: SITE + '/' },
    { '@type': 'ListItem', position: 2, name: c.name, item: `${SITE}/${c.slug}.html` },
    { '@type': 'ListItem', position: 3, name: h1, item: url },
  ] };
  const extraJsonLd = jsonForScript({ '@context': 'https://schema.org', '@graph': [crumbs] });
  const guidesHtml = relatedGuides(c.name, null, 2).map(guideCard).join('\n');
  return `<!DOCTYPE html>
<html lang="he" dir="rtl">
${head(title, desc, url, extraJsonLd)}
<body id="top">
${nav}
  <main id="main">
    <section class="lead-hero">
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
          <div style="display:flex;gap:10px;flex-wrap:wrap;margin:8px 0 16px">
            <input id="calcBill" class="filter-search" type="number" inputmode="numeric" min="0" placeholder="למשל: 89" style="flex:1 1 220px" />
            <button id="calcBtn" class="btn btn--primary" type="button">חשבו חיסכון</button>
          </div>
          <p id="calcOut" role="status" aria-live="polite" style="display:none;margin:8px 0 0;padding:14px 16px;border-radius:12px;background:#F0F2F4;color:#0B0F14"></p>
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
    <section class="cta" id="cta">
      <div class="container cta__inner reveal">
        <h2>רוצים שנמצא לכם את ההצעה הכי טובה?</h2>
        <p>השאירו פרטים ונחזור אליכם עם ההשוואה וההמלצה — חינם, בלי התחייבות.</p>
        ${leadFormHtml('קבלו השוואה חינם')}
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
fs.writeFileSync(path.join(__dirname, 'plans.html'), plansPage());
fs.writeFileSync(path.join(__dirname, 'providers.html'), providersIndexPage());
fs.writeFileSync(path.join(__dirname, 'compare.html'), comparePage());
fs.writeFileSync(path.join(__dirname, 'app.html'), appPage());
fs.writeFileSync(path.join(__dirname, '404.html'), notFoundPage());

// ── Refresh sitemap ─────────────────────────────────────────────────────────
// Each URL carries a <lastmod> and a tiered <priority>/<changefreq>:
//  • catalogue date (when prices were last exported) for plan-driven pages
//    (home, category, provider, all-plans, compare);
//  • the guide's own publish date for articles;
//  • today's build date for evergreen static pages.
const isoDate = (d) => new Date(d).toISOString().slice(0, 10); // YYYY-MM-DD
const CATALOGUE_DATE = isoDate(catalogue.generated || Date.now());
const BUILD_DATE = isoDate(Date.now());
// priority/changefreq tiers — home is the apex; conversion + plan pages rank
// above evergreen content; legal pages sit lowest.
const locs = [
  { loc: `${SITE}/`, lastmod: CATALOGUE_DATE, priority: '1.0', changefreq: 'daily', images: [`${SITE}/og-image.png`] },
  { loc: `${SITE}/plans.html`, lastmod: CATALOGUE_DATE, priority: '0.9', changefreq: 'daily' },
  { loc: `${SITE}/providers.html`, lastmod: CATALOGUE_DATE, priority: '0.8', changefreq: 'weekly' },
  { loc: `${SITE}/compare.html`, lastmod: CATALOGUE_DATE, priority: '0.8', changefreq: 'weekly' },
  { loc: `${SITE}/app.html`, lastmod: BUILD_DATE, priority: '0.7', changefreq: 'monthly', images: [
    `${SITE}/assets/app/shot-home.webp`, `${SITE}/assets/app/shot-results.webp`, `${SITE}/assets/app/shot-meeting.webp`,
  ] },
  { loc: `${SITE}/guides.html`, lastmod: BUILD_DATE, priority: '0.7', changefreq: 'weekly' },
  { loc: `${SITE}/about.html`, lastmod: BUILD_DATE, priority: '0.5', changefreq: 'monthly' },
  ...categories.map((c) => ({ loc: `${SITE}/${c.slug}.html`, lastmod: CATALOGUE_DATE, priority: '0.9', changefreq: 'daily' })),
  ...builtCollections.map((col) => ({ loc: `${SITE}/${col.slug}.html`, lastmod: CATALOGUE_DATE, priority: '0.75', changefreq: 'weekly' })),
  ...builtCalculators.map((c) => ({ loc: `${SITE}/calc-${c.slug}.html`, lastmod: CATALOGUE_DATE, priority: '0.7', changefreq: 'weekly' })),
  ...guides.map((g) => ({ loc: `${SITE}/${g.slug}.html`, lastmod: isoDate(g.date), priority: '0.6', changefreq: 'monthly' })),
  ...providerNames.map((n) => ({ loc: `${SITE}/provider-${providerSlug(n)}.html`, lastmod: CATALOGUE_DATE, priority: '0.7', changefreq: 'weekly' })),
  { loc: `${SITE}/privacy.html`, lastmod: BUILD_DATE, priority: '0.3', changefreq: 'yearly' },
  { loc: `${SITE}/terms.html`, lastmod: BUILD_DATE, priority: '0.3', changefreq: 'yearly' },
];
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${locs.map((u) => `  <url>\n    <loc>${u.loc}</loc>\n    <lastmod>${u.lastmod}</lastmod>\n    <changefreq>${u.changefreq}</changefreq>\n    <priority>${u.priority}</priority>${(u.images || []).map((src) => `\n    <image:image>\n      <image:loc>${src}</image:loc>\n    </image:image>`).join('')}\n  </url>`).join('\n')}
</urlset>
`;
fs.writeFileSync(path.join(__dirname, 'sitemap.xml'), sitemap);

console.log(`Generated ${categories.length} category + ${builtCollections.length} collections + ${builtCalculators.length} calculators + ${guides.length} guides + ${staticPages.length} static + guides index + plans + providers + 404 + sitemap.xml`);
console.log(`Asset fingerprints: styles.css?v=${CSS_V}  script.js?v=${JS_V}  (hand-written index.html must reference these same values)`);
