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

// Real plan catalogue, exported from the app via `flutter test tool/export_plans.dart`.
const catalogue = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'plans.json'), 'utf8'));
const plansByCat = {};
for (const p of catalogue.plans) (plansByCat[p.cat] ||= []).push(p);
for (const k of Object.keys(plansByCat)) plansByCat[k].sort((a, b) => a.price - b.price);

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
function providerLogo(name, size = 36) {
  let color = '#15603e';
  let initials = name.trim().slice(0, 2);
  for (const [key, c, ini] of LOGO) {
    if (name.includes(key)) { color = c; initials = ini; break; }
  }
  const fs = initials.length >= 3 ? Math.round(size * 0.3) : Math.round(size * 0.4);
  return `<span class="plogo" style="width:${size}px;height:${size}px;background:${color}1a;color:${color};border-color:${color}40;font-size:${fs}px">${esc(initials)}</span>`;
}

// Render one real plan as a card. Used on category pages and the all-plans page.
function planCardHtml(p) {
  const unit = p.cat === 'abroad' ? 'לחבילה' : 'לחודש';
  const specs = Object.entries(p.specs || {}).slice(0, 3)
    .map(([, v]) => `<span class="pchip">${esc(v)}</span>`).join('');
  const flags = [];
  if (p.is5G) flags.push('<span class="pflag pflag--5g">5G</span>');
  if (p.noCommit) flags.push('<span class="pflag">ללא התחייבות</span>');
  if (p.hasAbroad) flags.push('<span class="pflag">כולל חו״ל</span>');
  const after = p.after ? `<span class="plan__after">ואז ₪${p.after}</span>` : '';
  const rating = p.rating ? `<span class="plan__rating">★ ${p.rating}</span>` : '';
  const text = esc(`${p.provider} ${p.plan} ${(p.feats || []).join(' ')} ${Object.values(p.specs || {}).join(' ')}`).toLowerCase();
  const waHref = 'https://wa.me/972505037537?text=' + encodeURIComponent('היי, מעניין אותי ' + p.provider + ' - ' + p.plan + ' (₪' + p.price + ')');
  return `<article class="plan" data-cat="${esc(p.cat)}" data-text="${text}" data-price="${p.price}" data-rating="${p.rating || 0}" data-5g="${p.is5G}" data-nocommit="${p.noCommit}" data-abroad="${p.hasAbroad}">
        <div class="plan__top"><span class="plan__id">${providerLogo(p.provider)}<a class="plan__provider" href="provider-${providerSlug(p.provider)}.html">${esc(p.provider)}</a></span><span class="plan__net">${esc(p.net)}</span></div>
        <div class="plan__name">${esc(p.plan)}</div>
        ${specs ? `<div class="plan__chips">${specs}</div>` : ''}
        ${flags.length ? `<div class="plan__flags">${flags.join('')}</div>` : ''}
        <div class="plan__bottom"><div class="plan__price"><b>₪${p.price}</b> <span>${unit}</span>${after}</div>${rating}</div>
        <a class="plan__cta" target="_blank" rel="noopener" href="${esc(waHref)}">💬 מעוניין/ת ←</a>
      </article>`;
}

const navHtml = (ctaHref) => `  <header class="nav" id="nav">
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
        <a href="cellular.html">סלולר</a><a href="internet.html">אינטרנט</a><a href="tv.html">טלוויזיה</a><a href="triple.html">חבילה משולבת</a><a href="abroad.html">חו״ל</a>
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
    <div class="container footer__bottom"><span>© <span id="year"></span> חוסך · כל הזכויות שמורות</span><span>נבנה באהבה בישראל 💚</span></div>
  </footer>`;

function jsonLd(c) {
  const faq = { '@type': 'FAQPage', mainEntity: c.faq.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) };
  const crumbs = {
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'דף הבית', item: SITE + '/' },
      { '@type': 'ListItem', position: 2, name: c.name, item: `${SITE}/${c.slug}.html` },
    ],
  };
  return JSON.stringify({ '@context': 'https://schema.org', '@graph': [crumbs, faq] });
}

function page(c) {
  const url = `${SITE}/${c.slug}.html`;
  const bullets = c.bullets.map(([icon, h, p]) => `        <article class="feature feature--check reveal"><span class="feature__icon">${icon}</span><h3>${esc(h)}</h3><p>${esc(p)}</p></article>`).join('\n');
  const chips = c.providers.map((p) => `<span class="chip">${esc(p)}</span>`).join('\n          ');
  const faqs = c.faq.map(([q, a]) => `          <details><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join('\n');
  const catGuides = relatedGuides(c.name, null, 2).map(guideCard).join('\n');
  const catPlans = plansByCat[c.slug] || [];
  const planCards = catPlans.map(planCardHtml).join('\n      ');
  return `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${esc(c.title)}</title>
  <meta name="description" content="${esc(c.desc)}" />
  <meta name="theme-color" content="#15603E" />
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
  <link href="https://fonts.googleapis.com/css2?family=Rubik:wght@500;700;800;900&family=Assistant:wght@400;500;600;700&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="${CSS_HREF}" />
  <script type="application/ld+json">${jsonLd(c)}</script>
</head>
<body id="top">
${nav}
  <main>
    <section class="lead-hero">
      <div class="container">
        <p class="crumbs"><a href="index.html">דף הבית</a> ← ${esc(c.name)}</p>
        <span class="pill">${c.icon} השוואה חינם · בלי התחייבות</span>
        <h1>${esc(c.h1[0])}<span class="hl">${esc(c.h1[1])}</span></h1>
        <p>${esc(c.intro)}</p>
        <div class="hero__cta">
          <a class="btn btn--primary btn--lg" href="#cta">השוו ותחסכו ←</a>
          <a class="btn btn--ghost btn--lg" href="index.html#how">איך זה עובד?</a>
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
        <form class="cta__form" id="leadForm" novalidate>
          <input type="text" id="leadName" name="name" placeholder="שם מלא" autocomplete="name" required />
          <input type="tel" id="leadPhone" name="phone" placeholder="טלפון (050-0000000)" autocomplete="tel" inputmode="tel" required />
          <button class="btn btn--primary btn--lg" type="submit">קבלו השוואה חינם</button>
        </form>
        <p class="cta__note" id="leadNote" role="status" aria-live="polite"></p>
        <a class="cta__wa" href="https://wa.me/972505037537" target="_blank" rel="noopener"><span aria-hidden="true">💬</span> מעדיפים וואטסאפ? דברו איתנו</a>
      </div>
    </section>
  </main>
${footer}
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
  },
];

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
  return JSON.stringify({
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'BreadcrumbList', itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'דף הבית', item: SITE + '/' },
        { '@type': 'ListItem', position: 2, name: 'מדריכים', item: SITE + '/guides.html' },
        { '@type': 'ListItem', position: 3, name: g.h1, item: url },
      ] },
      { '@type': 'Article', headline: g.h1, description: g.desc, datePublished: g.date,
        inLanguage: 'he-IL', mainEntityOfPage: url,
        author: { '@type': 'Organization', name: 'חוסך' },
        publisher: { '@type': 'Organization', name: 'חוסך' } },
    ],
  });
}

function head(title, desc, url, extraJsonLd, noindex) {
  return `<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(desc)}" />${noindex ? '\n  <meta name="robots" content="noindex" />' : ''}
  <meta name="theme-color" content="#15603E" />
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
  <link href="https://fonts.googleapis.com/css2?family=Rubik:wght@500;700;800;900&family=Assistant:wght@400;500;600;700&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="${CSS_HREF}" />
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
  return `<!DOCTYPE html>
<html lang="he" dir="rtl">
${head(g.title, g.desc, url, articleJsonLd(g))}
<body id="top">
${navNoCta}
  <main>
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
            <a class="btn btn--lg" style="background:#C9EC4B;color:#0E3A26" href="index.html#calculator">בדקו עכשיו ←</a>
          </div>
        </div>
      </section>
      <section class="section section--alt" aria-label="מדריכים נוספים">
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
  <main>
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
            <a class="btn btn--lg" style="background:#C9EC4B;color:#0E3A26" href="index.html#calculator">בדקו עכשיו ←</a>
          </div>`
    : '';
  return `<!DOCTYPE html>
<html lang="he" dir="rtl">
${head(p.title, p.desc, url)}
<body id="top">
${navNoCta}
  <main>
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
  <main>
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
  return `<!DOCTYPE html>
<html lang="he" dir="rtl">
${head('כל החבילות — מחירון מלא של כל חברות התקשורת | חוסך', `מחירון מלא: ${catalogue.plans.length} מסלולי סלולר, אינטרנט, טלוויזיה, חבילות משולבות וחו״ל מכל החברות — ממוין מהזול ביותר. סננו לפי קטגוריה וחפשו.`, url)}
<body id="top">
${nav}
  <main>
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
            <option value="rating-desc">דירוג גבוה תחילה</option>
          </select>
          <button class="flag-chip" data-flag="5g">5G</button>
          <button class="flag-chip" data-flag="nocommit">ללא התחייבות</button>
          <button class="flag-chip" data-flag="abroad">כולל חו״ל</button>
        </div>
        <div class="plan-grid" id="planGrid">
        ${cards}
        </div>
        <p class="plan-empty" id="planEmpty">לא נמצאו חבילות שתואמות את החיפוש.</p>
      </div>
    </section>
    <section class="cta" id="cta">
      <div class="container cta__inner reveal">
        <h2>מצאתם משהו מעניין?</h2>
        <p>השאירו פרטים ונעזור לכם לעבור — חינם, בלי התחייבות.</p>
        <form class="cta__form" id="leadForm" novalidate>
          <input type="text" id="leadName" name="name" placeholder="שם מלא" autocomplete="name" required />
          <input type="tel" id="leadPhone" name="phone" placeholder="טלפון (050-0000000)" autocomplete="tel" inputmode="tel" required />
          <button class="btn btn--primary btn--lg" type="submit">קבלו השוואה חינם</button>
        </form>
        <p class="cta__note" id="leadNote" role="status" aria-live="polite"></p>
        <a class="cta__wa" href="https://wa.me/972505037537" target="_blank" rel="noopener"><span aria-hidden="true">💬</span> מעדיפים וואטסאפ? דברו איתנו</a>
      </div>
    </section>
  </main>
${footer}
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
  const cards = plans.map(planCardHtml).join('\n        ');
  const jsonld = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'דף הבית', item: SITE + '/' },
      { '@type': 'ListItem', position: 2, name: 'כל החבילות', item: SITE + '/plans.html' },
      { '@type': 'ListItem', position: 3, name: name, item: url },
    ],
  });
  return `<!DOCTYPE html>
<html lang="he" dir="rtl">
${head(`כל המסלולים של ${name} — מחירים והשוואה | חוסך`, `כל מסלולי ${name} במקום אחד — ${plans.length} מסלולים מ-₪${cheapest}. השוו מחירים, תכונות ודירוגים ומצאו את המשתלם ביותר.`, url, jsonld)}
<body id="top">
${nav}
  <main>
    <section class="lead-hero">
      <div class="container">
        <p class="crumbs"><a href="index.html">דף הבית</a> ← <a href="plans.html">כל החבילות</a> ← ${esc(name)}</p>
        <div style="margin-bottom:14px">${providerLogo(name, 64)}</div>
        <h1>כל המסלולים של <span class="hl">${esc(name)}</span></h1>
        <p>${plans.length} מסלולים${catNames.length ? ` (${esc(catNames.join(' · '))})` : ''} — החל מ-₪${cheapest}. השוו מחירים, תכונות ודירוגים, ומצאו את המסלול המשתלם ביותר.</p>
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
        <form class="cta__form" id="leadForm" novalidate>
          <input type="text" id="leadName" name="name" placeholder="שם מלא" autocomplete="name" required />
          <input type="tel" id="leadPhone" name="phone" placeholder="טלפון (050-0000000)" autocomplete="tel" inputmode="tel" required />
          <button class="btn btn--primary btn--lg" type="submit">קבלו השוואה חינם</button>
        </form>
        <p class="cta__note" id="leadNote" role="status" aria-live="polite"></p>
        <a class="cta__wa" href="https://wa.me/972505037537" target="_blank" rel="noopener"><span aria-hidden="true">💬</span> מעדיפים וואטסאפ? דברו איתנו</a>
      </div>
    </section>
  </main>
${footer}
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
  <main>
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
  <script src="${JS_SRC}" defer></script>
</body>
</html>
`;
}

function comparePage() {
  const url = `${SITE}/compare.html`;
  const data = catalogue.plans.map((p) => ({
    id: p.id, cat: p.cat, provider: p.provider, plan: p.plan, price: p.price,
    after: p.after, net: p.net, is5G: p.is5G, noCommit: p.noCommit, hasAbroad: p.hasAbroad,
    rating: p.rating, specs: p.specs,
  }));
  const optionsFor = (preId) => categories.map((c) => {
    const opts = (plansByCat[c.slug] || []).map((p) =>
      `<option value="${esc(p.id)}"${p.id === preId ? ' selected' : ''}>${esc(p.provider)} — ${esc(p.plan)} (₪${p.price})</option>`).join('');
    return `<optgroup label="${esc(c.name)}">${opts}</optgroup>`;
  }).join('');
  const firstTwo = (plansByCat['cellular'] || []).slice(0, 2).map((p) => p.id);
  const sel = (i, preId) =>
    `<select class="compare-pick filter-search" id="cmp${i}" aria-label="מסלול ${i + 1}"><option value="">— בחרו מסלול —</option>${optionsFor(preId)}</select>`;
  return `<!DOCTYPE html>
<html lang="he" dir="rtl">
${head('השוואת מסלולים צד לצד | חוסך', 'בחרו עד 3 מסלולים והשוו אותם צד לצד — מחיר, רשת, 5G, התחייבות, חו״ל, דירוג ומפרט. מכל חברות התקשורת.', url)}
<body id="top">
${nav}
  <main>
    <section class="lead-hero">
      <div class="container">
        <p class="crumbs"><a href="index.html">דף הבית</a> ← השוואה</p>
        <h1>השוואת מסלולים <span class="hl">צד לצד</span></h1>
        <p>בחרו עד 3 מסלולים והשוו ביניהם — מחיר, רשת, התחייבות, חו״ל, דירוג ומפרט.</p>
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
        <form class="cta__form" id="leadForm" novalidate>
          <input type="text" id="leadName" name="name" placeholder="שם מלא" autocomplete="name" required />
          <input type="tel" id="leadPhone" name="phone" placeholder="טלפון (050-0000000)" autocomplete="tel" inputmode="tel" required />
          <button class="btn btn--primary btn--lg" type="submit">קבלו השוואה חינם</button>
        </form>
        <p class="cta__note" id="leadNote" role="status" aria-live="polite"></p>
        <a class="cta__wa" href="https://wa.me/972505037537" target="_blank" rel="noopener"><span aria-hidden="true">💬</span> מעדיפים וואטסאפ? דברו איתנו</a>
      </div>
    </section>
  </main>
${footer}
  <script>window.__PLANS__ = ${JSON.stringify(data)};</script>
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
    ['📱', 'בקשת ניוד מספר', 'שומרים על אותו מספר. ממלאים טופס קצר ואנחנו מבצעים את הניוד מול הספק הישן.'],
    ['🛟', 'מעבר מלווה', 'אנחנו עושים את העבודה — בלי כאב ראש, בלי עמלות, ועם ערבות שלא תחויבו פעמיים.'],
  ]],
];

// Sample community posts for the live feed preview (representative content).
const COMMUNITY_POSTS = [
  ['עזרה בניתוק', 'נועה ב.', true, 'עברתי מהוט מובייל לגולן ב-5 דקות, הניוד לקח יומיים והמספר נשאר. ממליצה בחום 🙌', 42, 'לפני שעה'],
  ['סלולר', 'אורי כהן', false, 'מישהו יודע אם המבצע של 5G ללא הגבלה ב-₪29 עדיין רץ? קיבלתי התראת חידוש מחוסך', 18, 'לפני 3 שעות'],
  ['אינטרנט', 'דנה לוי', true, 'סיב אופטי גיגה ב-₪89 — אחרי שנה קפץ ל-₪139. עברתי וחסכתי ₪600 בשנה. תבדקו את החשבון!', 67, 'אתמול'],
  ['חו״ל', 'יוסי מ.', false, 'eSIM לאירופה — 10GB ב-₪35 עבד מצוין בכל המדינות. בלי הפתעות רומינג ✈️', 31, 'אתמול'],
  ['המלצות', 'משפחת אברהם', true, 'ריכזנו 4 קווים בחבילה משפחתית וחסכנו ₪80 בחודש. הטיפ: עקבו אחרי תאריך החידוש של כל קו', 53, 'לפני יומיים'],
  ['טלוויזיה', 'רותם ש.', false, 'מישהו השווה בין החבילות המשולבות? שווה לקחת אינטרנט+טלוויזיה יחד או בנפרד?', 12, 'לפני יומיים'],
];

// AI advisor preview — a short scripted exchange + quick-start chips.
const AI_CHIPS = ['✨ מה הכי משתלם לי?', '📱 סלולר הכי זול', '🌐 אינטרנט 1000Mb', '✅ ללא התחייבות', '✈️ חבילת חו״ל', '💰 פחות מ-₪50'];

function appPage() {
  const url = `${SITE}/app.html`;
  const groups = APP_GROUPS.map(([gIcon, gTitle, items]) => {
    const cards = items.map(([icon, h, p]) =>
      `          <article class="feature reveal"><span class="feature__icon">${icon}</span><h3>${esc(h)}</h3><p>${esc(p)}</p></article>`).join('\n');
    return `      <div class="app-group">
        <header class="section__head reveal"><span class="eyebrow">${gIcon} ${esc(gTitle)}</span></header>
        <div class="features">
${cards}
        </div>
      </div>`;
  }).join('\n');

  const channels = ['הכל', 'המלצות', 'סלולר', 'אינטרנט', 'טלוויזיה', 'חו״ל', 'עזרה בניתוק'];
  const chanChips = channels.map((c, i) =>
    `<button class="feed-chip${i === 0 ? ' active' : ''}" data-chan="${i === 0 ? 'all' : esc(c)}">${esc(c)}</button>`).join('');
  const posts = COMMUNITY_POSTS.map(([chan, author, verified, text, likes, when]) => {
    const initials = author.trim().charAt(0);
    const hot = likes >= 40 ? '<span class="feed-hot">🔥 טרנדינג</span>' : '';
    return `          <article class="feed-post" data-chan="${esc(chan)}">
            <div class="feed-post__head"><span class="feed-ava" aria-hidden="true">${esc(initials)}</span><span class="feed-author">${esc(author)}${verified ? ' <span class="feed-verified" title="משתמש מאומת">✓</span>' : ''}</span><span class="feed-chan">${esc(chan)}</span><span class="feed-when">${esc(when)}</span></div>
            <p class="feed-text">${esc(text)}</p>
            <div class="feed-post__foot"><span class="feed-like">❤ ${likes}</span>${hot}<span class="feed-reply">💬 הגב/י</span></div>
          </article>`;
  }).join('\n');

  const aiChips = AI_CHIPS.map((c) => `<span class="ai-chip">${esc(c)}</span>`).join('');

  return `<!DOCTYPE html>
<html lang="he" dir="rtl">
${head('האפליקציה של חוסך — כל היכולות | חוסך', 'הכירו את אפליקציית חוסך: חוסך AI, קהילה והצ׳אט הקהילתי, מעקב מעבר, התראות חידוש, דירוגי ספקים, בדיקת זמינות, מחשבון מעבר וניוד מספר — הכל במקום אחד.', url)}
<body id="top">
${nav}
  <main>
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

    <section class="section">
      <div class="container">
        <header class="section__head reveal"><span class="eyebrow">מה יש באפליקציה</span><h2>כל הכלים לחסוך — בלי כאב ראש</h2><p>כל יכולת שתראו כאן קיימת באפליקציה עצמה.</p></header>
${groups}
      </div>
    </section>

    <section class="section section--alt" id="community">
      <div class="container">
        <header class="section__head reveal"><span class="eyebrow">💬 קהילת חוסך</span><h2>הצ׳אט הקהילתי — חוכמת ההמון</h2><p>שאלות, טיפים ודירוגים מאנשים אמיתיים שכבר עברו. בחרו ערוץ כדי לראות מה מדברים עליו עכשיו.</p></header>
        <div class="feed reveal">
          <div class="feed-chips">${chanChips}</div>
          <div class="feed-list" id="feedList">
${posts}
          </div>
          <p class="feed-empty" id="feedEmpty" hidden>אין פוסטים בערוץ הזה עדיין — באפליקציה אפשר לפתוח את הראשון.</p>
          <p class="feed-foot">פיד לדוגמה. הקהילה המלאה — עם פרסום, תגובות, תמונות והקלטות — נמצאת באפליקציה.</p>
        </div>
      </div>
    </section>

    <section class="section">
      <div class="container">
        <header class="section__head reveal"><span class="eyebrow">🤖 חוסך AI</span><h2>יועץ התקשורת החכם שלכם</h2><p>שואלים בשפה חופשית — מקבלים המלצה מנומקת עם חיסכון שנתי.</p></header>
        <div class="ai-demo reveal">
          <div class="ai-chat" id="aiChat">
            <div class="ai-bubble ai-bubble--bot">היי! אני חוסך AI — יועץ התקשורת החכם שלך. מה תרצו לבדוק היום?</div>
            <div class="ai-bubble ai-bubble--me">מה הכי משתלם לי בסלולר עם 5G?</div>
            <div class="ai-bubble ai-bubble--bot">מצאתי לך 3 מסלולי 5G מובילים — הזול ביותר ב-₪29/חודש ללא התחייבות, חיסכון שנתי של עד ₪1,080 לעומת חשבון ממוצע. רוצה שאשווה ביניהם? 📊</div>
          </div>
          <div class="ai-chips" aria-label="שאלות מהירות לדוגמה">${aiChips}</div>
          <p class="ai-foot">דמו. השיחה המלאה והחיה — באפליקציה.</p>
        </div>
      </div>
    </section>

    <section class="cta" id="cta">
      <div class="container cta__inner reveal">
        <h2>רוצים את האפליקציה?</h2>
        <p>השאירו פרטים ונעדכן אתכם ברגע שהיא זמינה — חינם, בלי התחייבות.</p>
        <form class="cta__form" id="leadForm" novalidate>
          <input type="text" id="leadName" name="name" placeholder="שם מלא" autocomplete="name" required />
          <input type="tel" id="leadPhone" name="phone" placeholder="טלפון (050-0000000)" autocomplete="tel" inputmode="tel" required />
          <button class="btn btn--primary btn--lg" type="submit">עדכנו אותי</button>
        </form>
        <p class="cta__note" id="leadNote" role="status" aria-live="polite"></p>
        <a class="cta__wa" href="https://wa.me/972505037537" target="_blank" rel="noopener"><span aria-hidden="true">💬</span> מעדיפים וואטסאפ? דברו איתנו</a>
      </div>
    </section>
  </main>
${footer}
  <script src="${JS_SRC}" defer></script>
</body>
</html>
`;
}

// ── Write pages ────────────────────────────────────────────────────────────
for (const c of categories) {
  fs.writeFileSync(path.join(__dirname, `${c.slug}.html`), page(c));
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

// ── Refresh sitemap (home + category pages) ─────────────────────────────────
const locs = [
  `${SITE}/`,
  `${SITE}/plans.html`,
  `${SITE}/providers.html`,
  `${SITE}/compare.html`,
  `${SITE}/app.html`,
  `${SITE}/guides.html`,
  `${SITE}/about.html`,
  ...categories.map((c) => `${SITE}/${c.slug}.html`),
  ...guides.map((g) => `${SITE}/${g.slug}.html`),
  ...providerNames.map((n) => `${SITE}/provider-${providerSlug(n)}.html`),
  `${SITE}/privacy.html`,
  `${SITE}/terms.html`,
];
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${locs.map((l, i) => `  <url>\n    <loc>${l}</loc>\n    <changefreq>weekly</changefreq>\n    <priority>${i === 0 ? '1.0' : '0.8'}</priority>\n  </url>`).join('\n')}
</urlset>
`;
fs.writeFileSync(path.join(__dirname, 'sitemap.xml'), sitemap);

console.log(`Generated ${categories.length} category + ${guides.length} guides + ${staticPages.length} static + guides index + plans + providers + 404 + sitemap.xml`);
console.log(`Asset fingerprints: styles.css?v=${CSS_V}  script.js?v=${JS_V}  (hand-written index.html must reference these same values)`);
