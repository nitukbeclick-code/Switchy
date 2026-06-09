#!/usr/bin/env node
/* Generates the per-category SEO landing pages (and refreshes sitemap.xml)
   from the data below + a shared template. No dependencies.
   Run:  node build.js   (from the site/ folder). Commit the generated *.html. */
'use strict';
const fs = require('fs');
const path = require('path');

const SITE = 'https://chosech.co.il';

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
      ['כמה חוסכים בחבילה משולבת?', 'לקוחות רבים חוסכים ₪1,000–₪2,400 בשנה במעבר לחבילה משולבת לעומת רכישת כל שירות בנפרד.'],
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

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const nav = `  <header class="nav" id="nav">
    <div class="container nav__inner">
      <a class="brand" href="index.html" aria-label="חוסך — דף הבית">
        <span class="brand__mark" aria-hidden="true">✦</span><span class="brand__name">חוסך</span>
      </a>
      <nav class="nav__links" aria-label="ניווט ראשי">
        <a href="index.html#how">איך זה עובד</a>
        <a href="index.html#categories">קטגוריות</a>
        <a href="guides.html">מדריכים</a>
        <a href="index.html#calculator">מחשבון חיסכון</a>
      </nav>
      <a class="btn btn--primary nav__cta" href="#cta">השוו עכשיו</a>
      <button class="nav__toggle" id="navToggle" aria-label="פתיחת תפריט" aria-expanded="false" aria-controls="mobileMenu"><span></span><span></span><span></span></button>
    </div>
    <div class="nav__mobile" id="mobileMenu" hidden>
      <a href="index.html#how">איך זה עובד</a>
      <a href="index.html#categories">קטגוריות</a>
      <a href="guides.html">מדריכים</a>
      <a href="index.html#calculator">מחשבון חיסכון</a>
      <a class="btn btn--primary" href="#cta">השוו עכשיו</a>
    </div>
  </header>`;

const footer = `  <footer class="footer">
    <div class="container footer__inner">
      <div class="footer__brand">
        <a class="brand brand--light" href="index.html"><span class="brand__mark" aria-hidden="true">✦</span><span class="brand__name">חוסך</span></a>
        <p>השוואת מחירי תקשורת חכמה. משווים, חוסכים, עוברים — בלי כאב ראש.</p>
      </div>
      <nav class="footer__links" aria-label="קטגוריות">
        <a href="cellular.html">סלולר</a><a href="internet.html">אינטרנט</a><a href="tv.html">טלוויזיה</a><a href="triple.html">חבילה משולבת</a><a href="abroad.html">חו״ל</a>
      </nav>
      <div class="footer__contact">
        <a href="https://wa.me/972500000000" target="_blank" rel="noopener">וואטסאפ</a>
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
  <link rel="stylesheet" href="styles.css" />
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
        <a class="cta__wa" href="https://wa.me/972500000000" target="_blank" rel="noopener"><span aria-hidden="true">💬</span> מעדיפים וואטסאפ? דברו איתנו</a>
      </div>
    </section>
  </main>
${footer}
  <script src="script.js" defer></script>
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
];

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

function head(title, desc, url, extraJsonLd) {
  return `<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(desc)}" />
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
  <link rel="stylesheet" href="styles.css" />
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
  return `<!DOCTYPE html>
<html lang="he" dir="rtl">
${head(g.title, g.desc, url, articleJsonLd(g))}
<body id="top">
${nav}
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
    </article>
  </main>
${footer}
  <script src="script.js" defer></script>
</body>
</html>
`;
}

function guidesIndexPage() {
  const url = `${SITE}/guides.html`;
  const cards = guides.map((g) => {
    const dateHe = new Date(g.date).toLocaleDateString('he-IL', { year: 'numeric', month: 'long', day: 'numeric' });
    return `          <a class="guide-card reveal" href="${g.slug}.html">
            <span class="tag-cat">${esc(g.cat)}</span>
            <h3>${esc(g.h1)}</h3>
            <p>${esc(g.desc)}</p>
            <span class="meta">${dateHe} · ${g.read} דק׳ קריאה</span>
          </a>`;
  }).join('\n');
  return `<!DOCTYPE html>
<html lang="he" dir="rtl">
${head('מדריכים — איך לחסוך על תקשורת | חוסך', 'מדריכים מקצועיים: איך לעבור ספק, לבחור מסלול סלולר, סיב אופטי מול כבלים ועוד — כל הטיפים כדי לא לשלם יותר מדי.', url)}
<body id="top">
${nav}
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
  <script src="script.js" defer></script>
</body>
</html>
`;
}

// ── Write pages ────────────────────────────────────────────────────────────
for (const c of categories) {
  fs.writeFileSync(path.join(__dirname, `${c.slug}.html`), page(c));
}
for (const g of guides) {
  fs.writeFileSync(path.join(__dirname, `${g.slug}.html`), articlePage(g));
}
fs.writeFileSync(path.join(__dirname, 'guides.html'), guidesIndexPage());

// ── Refresh sitemap (home + category pages) ─────────────────────────────────
const locs = [
  `${SITE}/`,
  `${SITE}/guides.html`,
  ...categories.map((c) => `${SITE}/${c.slug}.html`),
  ...guides.map((g) => `${SITE}/${g.slug}.html`),
];
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${locs.map((l, i) => `  <url>\n    <loc>${l}</loc>\n    <changefreq>weekly</changefreq>\n    <priority>${i === 0 ? '1.0' : '0.8'}</priority>\n  </url>`).join('\n')}
</urlset>
`;
fs.writeFileSync(path.join(__dirname, 'sitemap.xml'), sitemap);

console.log(`Generated ${categories.length} category pages + ${guides.length} guides + guides index + sitemap.xml`);
