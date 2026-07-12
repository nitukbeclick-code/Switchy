/* ───────────────────────────────────────────────────────────────────────────
 * translate-runtime.js — Switchy on-demand, full-page UI translation (client)
 *
 * ONE runtime, shipped byte-identical to BOTH surfaces:
 *   • static desktop site  → loaded directly by every page
 *   • Next mobile app      → served from /translate-runtime.js, driven by the
 *     <LanguageSwitcher/> React component
 *
 * The public site is Hebrew. When a visitor picks a language we walk the visible
 * text (+ a few attributes), send the strings to the `translate` edge function,
 * and swap the results in. Every original is remembered so switching back to
 * Hebrew is instant and lossless. Prices/brands/numbers are protected server-side
 * (see supabase/functions/translate/lib.ts) — this runtime never alters them.
 *
 * Caching (why it feels fast): memory cache per language for the session +
 * localStorage cache per (language, page). A returning visitor re-reads a page in
 * their language with zero network; the edge function's DB cache covers the first
 * visit once any visitor has seen the string.
 *
 * No innerHTML — all UI is built with textContent / DOM nodes (no XSS surface).
 * Exposes window.SwitchyI18n = { init, setLang, getLang, LANGS, mountMenu }.
 * ─────────────────────────────────────────────────────────────────────────── */
(function () {
  "use strict";
  if (window.SwitchyI18n) return; // singleton

  var SOURCE = "he";
  var LANGS = [
    { code: "ar", label: "العربية", dir: "rtl" },
    { code: "ru", label: "Русский", dir: "ltr" },
    { code: "en", label: "English", dir: "ltr" },
    { code: "fr", label: "Français", dir: "ltr" },
    { code: "es", label: "Español", dir: "ltr" },
    { code: "am", label: "አማርኛ", dir: "ltr" },
    { code: "ti", label: "ትግርኛ", dir: "ltr" },
    { code: "uk", label: "Українська", dir: "ltr" },
    { code: "ro", label: "Română", dir: "ltr" },
    { code: "th", label: "ไทย", dir: "ltr" },
    { code: "tl", label: "Filipino", dir: "ltr" },
    { code: "hi", label: "हिन्दी", dir: "ltr" },
    { code: "ne", label: "नेपाली", dir: "ltr" },
    { code: "zh", label: "中文", dir: "ltr" },
    { code: "fa", label: "فارسی", dir: "rtl" },
    { code: "ur", label: "اردو", dir: "rtl" },
    { code: "tr", label: "Türkçe", dir: "ltr" },
    { code: "ka", label: "ქართული", dir: "ltr" },
    { code: "de", label: "Deutsch", dir: "ltr" },
    { code: "it", label: "Italiano", dir: "ltr" },
    { code: "pt", label: "Português", dir: "ltr" },
    { code: "pl", label: "Polski", dir: "ltr" },
    { code: "nl", label: "Nederlands", dir: "ltr" },
    { code: "hu", label: "Magyar", dir: "ltr" },
    { code: "el", label: "Ελληνικά", dir: "ltr" },
    { code: "ja", label: "日本語", dir: "ltr" },
    { code: "ko", label: "한국어", dir: "ltr" }
  ];
  var RTL = { ar: 1, he: 1, fa: 1, ur: 1 };
  // Hebrew names, used in the trigger's aria-label so a Hebrew screen reader reads
  // a real word ("אנגלית") rather than the raw 2-letter code ("en").
  var HE_NAMES = {
    he: "עברית", ar: "ערבית", ru: "רוסית", en: "אנגלית", fr: "צרפתית", es: "ספרדית",
    am: "אמהרית", ti: "תיגרינית", uk: "אוקראינית", ro: "רומנית", th: "תאית",
    tl: "פיליפינית", hi: "הינדי", ne: "נפאלית", zh: "סינית", fa: "פרסית", ur: "אורדו",
    tr: "טורקית", ka: "גאורגית", de: "גרמנית", it: "איטלקית", pt: "פורטוגזית",
    pl: "פולנית", nl: "הולנדית", hu: "הונגרית", el: "יוונית", ja: "יפנית", ko: "קוריאנית"
  };

  // Compliance banner — reviewed, static per language so it is ALWAYS correct and
  // instant (never depends on the model). Any language WITHOUT an entry falls back
  // to English (BANNER[lang] || BANNER.en); the legal position (Hebrew is
  // authoritative) holds regardless of the wording.
  var BANNER = {
    ar: "ترجمة آلية لتيسير الاطّلاع — النسخة العبرية هي الملزِمة قانونيًا.",
    en: "Automatic translation for convenience — the Hebrew version is the legally binding one.",
    ru: "Автоматический перевод для удобства — юридически обязательна версия на иврите.",
    fr: "Traduction automatique pour votre confort — la version hébraïque fait foi.",
    es: "Traducción automática para su comodidad: la versión en hebreo es la vinculante.",
    am: "ለምቾት በራስ-ሰር የተተረጎመ — ሕጋዊ ተቀባይነት ያለው የዕብራይስጥ ቅጂ ነው።",
    uk: "Автоматичний переклад для зручності — юридично чинною є версія івритом.",
    ro: "Traducere automată pentru comoditate — versiunea în ebraică este cea obligatorie din punct de vedere juridic.",
    th: "การแปลอัตโนมัติเพื่อความสะดวก — ฉบับภาษาฮีบรูเป็นฉบับที่มีผลผูกพันทางกฎหมาย",
    tl: "Awtomatikong pagsasalin para sa kaginhawaan — ang bersyong Hebreo ang legal na may bisa.",
    hi: "सुविधा के लिए स्वचालित अनुवाद — कानूनी रूप से मान्य हिब्रू संस्करण है।",
    ne: "सुविधाका लागि स्वचालित अनुवाद — कानुनी रूपमा हिब्रू संस्करण मान्य हुन्छ।",
    zh: "为方便阅读的自动翻译——具法律约束力的是希伯来语版本。",
    fa: "ترجمهٔ خودکار برای سهولت — نسخهٔ عبری از نظر قانونی معتبر است.",
    ur: "سہولت کے لیے خودکار ترجمہ — قانونی طور پر عبرانی نسخہ ہی معتبر ہے۔",
    tr: "Kolaylık için otomatik çeviri — yasal olarak bağlayıcı olan İbranice sürümdür.",
    ka: "ავტომატური თარგმანი მოხერხებულობისთვის — იურიდიულად სავალდებულოა ებრაული ვერსია.",
    de: "Automatische Übersetzung zur Vereinfachung — rechtsverbindlich ist die hebräische Fassung.",
    it: "Traduzione automatica per comodità — la versione in ebraico è quella giuridicamente vincolante.",
    pt: "Tradução automática para sua comodidade — a versão em hebraico é a juridicamente vinculativa.",
    pl: "Tłumaczenie automatyczne dla wygody — prawnie wiążąca jest wersja hebrajska.",
    nl: "Automatische vertaling voor het gemak — de Hebreeuwse versie is juridisch bindend.",
    hu: "Automatikus fordítás a kényelem érdekében — jogilag a héber változat az irányadó.",
    el: "Αυτόματη μετάφραση για διευκόλυνση — νομικά δεσμευτική είναι η εβραϊκή έκδοση.",
    ja: "便宜上の自動翻訳です。法的に有効なのはヘブライ語版です。",
    ko: "편의를 위한 자동 번역입니다. 법적 효력은 히브리어 버전에 있습니다."
  };
  var DISMISS = {
    ar: "إغلاق", en: "Dismiss", ru: "Закрыть", fr: "Fermer", es: "Cerrar", am: "ዝጋ",
    uk: "Закрити", ro: "Închide", th: "ปิด", tl: "Isara", hi: "बंद करें", ne: "बन्द गर्नुहोस्",
    zh: "关闭", fa: "بستن", ur: "بند کریں", tr: "Kapat", ka: "დახურვა", de: "Schließen",
    it: "Chiudi", pt: "Fechar", pl: "Zamknij", nl: "Sluiten", hu: "Bezárás", el: "Κλείσιμο",
    ja: "閉じる", ko: "닫기"
  };

  // Attributes worth translating (visible to the user), never element VALUES.
  var ATTRS = ["placeholder", "aria-label", "title", "alt"];
  // Never descend into these — code, our own UI, or explicitly opted-out.
  var SKIP_CLOSEST = "[data-no-translate],.notranslate,[translate='no'],script,style,noscript,code,pre,.swi18n-menu,.swi18n-banner";

  var cfg = { url: null, anonKey: null };
  var current = SOURCE;
  var mem = {}; // { lang: { source: translated } } for the session
  var records = []; // { kind:'text', node, orig } | { kind:'attr', el, attr, orig }
  var seenText = null; // WeakSet of already-recorded text nodes
  var observer = null;
  var busy = false;

  // ── network/state-machine tuning ─────────────────────────────────────────────
  var FETCH_TIMEOUT = 12000; // ms per fetch before we abort it
  var RETRY_MAX = 2; // extra attempts after the first (1–2×) on a failed batch
  var MAX_INFLIGHT = 4; // cap on concurrent background fetches (also eases the 90/min/IP limit)
  var MAX_NEED = 100; // unique untranslated strings per POST (server cap is 120)
  var MAX_NEED_CHARS = 18000; // summed source chars per POST (server cap is 24000)
  var FAIL_TTL = 3 * 60 * 1000; // how long a failure stamp suppresses auto-apply-on-load
  var CACHE_KEY_CAP = 40; // max swi18n:c:* localStorage entries kept
  var SEEN_CAP = 2000; // max strings tracked for cross-page __shared promotion
  var DICT_TIMEOUT = 8000; // ms before we give up on the static /i18n/<lang>.json fetch

  // Static translation dictionaries: for the pre-warmed "core" languages the build
  // ships /i18n/<lang>.json ({ source: translated }), so a switch fills memory from
  // ONE cached static file — zero per-string model calls, near-instant. A language
  // with no static file (or a network miss) simply falls through to the live edge
  // fetch, exactly as before. staticTried[lang] = 1 once we've settled the fetch
  // (loaded OR a definitive 404) so we never re-request it in the same session; a
  // transient network error leaves it unset so the next switch may retry.
  var staticTried = {};

  var controllers = []; // live AbortControllers (aborted on restore / new switch)
  var queuedLang = null; // a language requested while a switch was in flight
  var committed = false; // did the CURRENT switch apply ≥1 real translation yet?
  var switchSeq = 0; // bumped on every switch/restore to invalidate stale async work

  // ── config / storage ───────────────────────────────────────────────────────
  function endpoint() { return cfg.url.replace(/\/$/, "") + "/functions/v1/translate"; }
  function memFor(lang) { return (mem[lang] = mem[lang] || {}); }
  function pageKey(lang) { return "swi18n:c:" + lang + ":" + location.pathname; }
  // Cross-page cache of "chrome" strings (menu/footer/header) that recur on 2+
  // pages, so a new page's first visit doesn't re-fetch them over the network.
  function sharedKey(lang) { return "swi18n:c:" + lang + ":__shared"; }
  // Bookkeeping: which source strings we've seen (on ANY page) for this language —
  // the basis for promoting a string to __shared the second time it appears.
  function seenKey(lang) { return "swi18n:seen:" + lang; }

  function mergeInto(m, raw) {
    if (!raw) return;
    try {
      var obj = JSON.parse(raw);
      for (var k in obj) if (Object.prototype.hasOwnProperty.call(obj, k)) m[k] = obj[k];
    } catch (e) { /* corrupt entry — ignore */ }
  }
  function loadPageCache(lang) {
    try {
      var m = memFor(lang);
      mergeInto(m, localStorage.getItem(sharedKey(lang))); // shared chrome first …
      mergeInto(m, localStorage.getItem(pageKey(lang))); // … page-specific overlays it
    } catch (e) { /* storage blocked — memory-only */ }
  }

  // Where the pre-built dictionary for a language lives (same-origin static file,
  // served from the CDN with the site; no auth). Root-absolute so it resolves the
  // same on every page path.
  function dictUrl(lang) { return "/i18n/" + lang + ".json"; }

  // Fetch the static /i18n/<lang>.json ONCE per language and merge it into memory
  // BEFORE any live fetch, so an already-warmed string resolves from cache and the
  // switch makes zero network calls. Always resolves (never rejects) — a missing
  // file or a transient error just leaves those strings for the live edge path.
  function loadStaticDict(lang) {
    if (lang === SOURCE || staticTried[lang]) return Promise.resolve();
    if (!("fetch" in window)) { staticTried[lang] = 1; return Promise.resolve(); }
    var ctrl = null, timer = null;
    try { ctrl = ("AbortController" in window) ? new AbortController() : null; } catch (e) { ctrl = null; }
    var opts = { credentials: "omit" };
    if (ctrl) { opts.signal = ctrl.signal; timer = setTimeout(function () { try { ctrl.abort(); } catch (e) {} }, DICT_TIMEOUT); }
    var clear = function () { if (timer) { clearTimeout(timer); timer = null; } };
    return fetch(dictUrl(lang), opts).then(function (r) {
      if (r.status === 404) { staticTried[lang] = 1; clear(); return null; } // no static dict for this lang
      if (!r.ok) throw new Error("dict " + r.status);
      return r.text();
    }, function (e) { throw e; }).then(function (text) {
      clear();
      if (text) { mergeInto(memFor(lang), text); staticTried[lang] = 1; }
    }, function () {
      // Transient (network/abort/parse) — do NOT mark tried, so a later switch retries.
      clear();
    });
  }

  // All swi18n:c:* cache keys (optionally excluding one, and optionally keeping the
  // shared entries so eviction targets page entries first).
  function cacheKeys(exclude, keepShared) {
    var ks = [];
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (!k || k.indexOf("swi18n:c:") !== 0 || k === exclude) continue;
        if (keepShared && /:__shared$/.test(k)) continue;
        ks.push(k);
      }
    } catch (e) {}
    return ks;
  }
  // Keep the cache-key population under CACHE_KEY_CAP by dropping oldest page keys
  // (localStorage key order ≈ insertion order in practice; shared keys are spared).
  function pruneCache(keep) {
    try {
      var ks = cacheKeys(keep, true);
      var over = (ks.length + 1) - CACHE_KEY_CAP;
      for (var i = 0; i < over; i++) { try { localStorage.removeItem(ks[i]); } catch (e) {} }
    } catch (e) {}
  }
  // setItem that survives a quota error: evict oldest swi18n:c:* entries one at a
  // time and retry (shared entries last). Returns true on success.
  function setItemEvicting(key, value) {
    try { localStorage.setItem(key, value); pruneCache(key); return true; } catch (e) {}
    var ks = cacheKeys(key, /*keepShared*/ true).concat(cacheKeys(key, false).filter(function (k) { return /:__shared$/.test(k); }));
    for (var i = 0; i < ks.length; i++) {
      try { localStorage.removeItem(ks[i]); } catch (e2) {}
      try { localStorage.setItem(key, value); return true; } catch (e3) {}
    }
    return false;
  }

  function savePageCache(lang) {
    try {
      // Persist only the strings that live on THIS page (skip detached nodes), to
      // keep the per-page entry small.
      var out = {}, m = memFor(lang), i, seen = {};
      for (i = 0; i < records.length; i++) {
        var rec = records[i], o = rec.orig;
        if (m[o] != null && !seen[o] && recIsConnected(rec)) { seen[o] = 1; out[o] = m[o]; }
      }
      // Persist the cheap language pref BEFORE the heavy cache entry (quota-safety)
      // — but ONLY once the switch has actually committed a real translation, so a
      // failed attempt never leaves a broken preference behind for a fresh visitor.
      if (committed) rememberLang(lang);
      setItemEvicting(pageKey(lang), JSON.stringify(out));
      promoteShared(lang, out); // move cross-page chrome strings into __shared
    } catch (e) { /* over quota / blocked — ignore */ }
  }

  // Promote strings seen on a PRIOR page into the shared cache (they are the
  // chrome/menu/footer that recur site-wide). Heuristic — see the seen map below.
  function promoteShared(lang, pageOut) {
    try {
      var prior = {};
      mergeInto(prior, localStorage.getItem(seenKey(lang)));
      var shared = {};
      mergeInto(shared, localStorage.getItem(sharedKey(lang)));
      var changed = false, k, count = 0, key;
      for (k in pageOut) {
        if (!Object.prototype.hasOwnProperty.call(pageOut, k)) continue;
        if (prior[k] === 1 && shared[k] == null) { shared[k] = pageOut[k]; changed = true; }
      }
      for (key in prior) if (Object.prototype.hasOwnProperty.call(prior, key)) count++;
      for (k in pageOut) {
        if (!Object.prototype.hasOwnProperty.call(pageOut, k)) continue;
        if (prior[k] !== 1) { if (count >= SEEN_CAP) break; prior[k] = 1; count++; }
      }
      if (changed) setItemEvicting(sharedKey(lang), JSON.stringify(shared));
      try { localStorage.setItem(seenKey(lang), JSON.stringify(prior)); } catch (e) {}
    } catch (e) { /* best-effort */ }
  }

  function rememberLang(lang) {
    try { lang === SOURCE ? localStorage.removeItem("swi18n:lang") : localStorage.setItem("swi18n:lang", lang); } catch (e) {}
  }
  function storedLang() { try { return localStorage.getItem("swi18n:lang") || SOURCE; } catch (e) { return SOURCE; } }

  // ── failure stamp — suppress auto-apply-on-load briefly after a total failure ─
  function setFailStamp() { try { sessionStorage.setItem("swi18n:fail", String(Date.now())); } catch (e) {} }
  function clearFailStamp() { try { sessionStorage.removeItem("swi18n:fail"); } catch (e) {} }
  function failStampActive() {
    try {
      var v = sessionStorage.getItem("swi18n:fail");
      if (!v) return false;
      if (Date.now() - (parseInt(v, 10) || 0) > FAIL_TTL) { sessionStorage.removeItem("swi18n:fail"); return false; }
      return true;
    } catch (e) { return false; }
  }

  // ── collection ──────────────────────────────────────────────────────────────
  function translatableText(s) {
    if (!s) return false;
    var t = s.trim();
    if (t.length < 1) return false;
    // Needs at least one letter in some script; pure numbers/symbols are skipped.
    return /[\p{L}]/u.test(t);
  }

  function collect(root) {
    var fresh = [];
    // Text nodes
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: function (n) {
        if (!translatableText(n.nodeValue)) return NodeFilter.FILTER_REJECT;
        var p = n.parentElement;
        if (!p || p.closest(SKIP_CLOSEST)) return NodeFilter.FILTER_REJECT;
        if (seenText.has(n)) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    var node;
    while ((node = walker.nextNode())) {
      seenText.add(node);
      fresh.push({ kind: "text", node: node, orig: node.nodeValue });
    }
    // Selected attributes
    var els = root.querySelectorAll ? root.querySelectorAll("[placeholder],[aria-label],[title],[alt]") : [];
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      if (el.closest(SKIP_CLOSEST)) continue;
      for (var a = 0; a < ATTRS.length; a++) {
        var attr = ATTRS[a];
        if (!el.hasAttribute(attr)) continue;
        if (el.hasAttribute("data-swi18n-" + attr)) continue; // already recorded
        var v = el.getAttribute(attr);
        if (!translatableText(v)) continue;
        el.setAttribute("data-swi18n-" + attr, "1");
        fresh.push({ kind: "attr", el: el, attr: attr, orig: v });
      }
    }
    return fresh;
  }

  // ── network ──────────────────────────────────────────────────────────────────
  // A single POST, bounded by a 12s abort timeout. Its AbortController is tracked in
  // `controllers` so a restore-to-Hebrew (or a new switch) can cancel it in flight.
  // A 429 throws an error carrying retryAfter (seconds) so the retry honours it.
  function fetchTranslations(lang, texts) {
    var ctrl = null, timer = null;
    try { ctrl = ("AbortController" in window) ? new AbortController() : null; } catch (e) { ctrl = null; }
    var opts = {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: cfg.anonKey, Authorization: "Bearer " + cfg.anonKey },
      body: JSON.stringify({ lang: lang, texts: texts })
    };
    if (ctrl) {
      opts.signal = ctrl.signal;
      controllers.push(ctrl);
      timer = setTimeout(function () { try { ctrl.abort(); } catch (e) {} }, FETCH_TIMEOUT);
    }
    var cleanup = function () {
      if (timer) { clearTimeout(timer); timer = null; }
      if (ctrl) { var ix = controllers.indexOf(ctrl); if (ix !== -1) controllers.splice(ix, 1); }
    };
    return fetch(endpoint(), opts).then(function (r) {
      if (r.status === 429) {
        var ra = (r.headers && r.headers.get) ? r.headers.get("Retry-After") : null;
        var e429 = new Error("translate 429");
        e429.retryAfter = ra ? (parseInt(ra, 10) || 0) : 0;
        throw e429;
      }
      if (!r.ok) throw new Error("translate " + r.status);
      return r.json();
    }).then(function (j) {
      cleanup();
      return (j && Array.isArray(j.translations)) ? j.translations : texts;
    }, function (e) {
      cleanup();
      throw e;
    });
  }

  function backoffDelay(attempt, retryAfterSec) {
    if (retryAfterSec && retryAfterSec > 0) return Math.min(retryAfterSec * 1000, 20000);
    return Math.min(400 * Math.pow(2, attempt - 1), 8000); // 400ms, 800ms, …
  }
  // fetchTranslations + up to RETRY_MAX retries with backoff (honouring Retry-After).
  function fetchTranslationsRetrying(lang, texts, tries) {
    tries = (tries == null) ? RETRY_MAX : tries;
    var attempt = 0;
    var run = function () {
      return fetchTranslations(lang, texts).then(null, function (e) {
        // An AbortError is an INTENTIONAL cancel (restore-to-Hebrew / new switch /
        // 12s timeout-then-abort) — never retry it; let it propagate and fail soft.
        if (e && e.name === "AbortError") throw e;
        attempt++;
        if (attempt > tries) throw e;
        var d = backoffDelay(attempt, e && e.retryAfter);
        return new Promise(function (resolve) { setTimeout(resolve, d); }).then(run);
      });
    };
    return run();
  }

  // Cancel every in-flight fetch (used when the user returns to Hebrew or starts a
  // new switch): the pending POSTs reject with an AbortError and fail soft.
  function abortAll() {
    for (var i = 0; i < controllers.length; i++) { try { controllers[i].abort(); } catch (e) {} }
    controllers = [];
  }

  // ── apply / restore ──────────────────────────────────────────────────────────
  function recEl(rec) { return rec.kind === "text" ? rec.node : rec.el; }
  function recIsConnected(rec) { var el = recEl(rec); return !!(el && el.isConnected); }

  // Apply one record. Returns 1 when a REAL translation was applied, 0 when it fell
  // back to the Hebrew original (mem never stores fail-soft echoes, so a present
  // value is always genuine). Callers sum this to know whether a switch succeeded.
  function applyRecord(rec, lang) {
    var m = memFor(lang);
    var t = m[rec.orig];
    // Unresolved strings fall back to the Hebrew ORIGINAL — never left as stale
    // text from a previously-applied language. A cold string shows Hebrew now and
    // is re-attempted on the next visit (e.g. once the DB cache is warmed).
    var v = t != null ? t : rec.orig;
    if (rec.kind === "text") { if (!rec.node) return 0; rec.node.nodeValue = v; }
    else { if (!rec.el) return 0; rec.el.setAttribute(rec.attr, v); }
    return (t != null && t !== rec.orig) ? 1 : 0;
  }
  // Apply a batch's OWN records only (not every page record) and return the count
  // of genuine translations applied.
  function applyBatch(recs, lang) {
    var n = 0;
    for (var k = 0; k < recs.length; k++) n += applyRecord(recs[k], lang);
    return n;
  }
  function restoreAll() {
    for (var i = 0; i < records.length; i++) {
      var rec = records[i];
      if (rec.kind === "text") { if (rec.node) rec.node.nodeValue = rec.orig; }
      else if (rec.el) {
        rec.el.setAttribute(rec.attr, rec.orig);
        // Drop the "already recorded" marker so a later switch re-collects this
        // attribute (otherwise placeholder/aria-label translations are lost forever
        // after one round-trip through Hebrew).
        rec.el.removeAttribute("data-swi18n-" + rec.attr);
      }
    }
  }

  // Drop records whose node/element has left the DOM.
  function pruneRecords(recs) {
    var out = [];
    for (var i = 0; i < recs.length; i++) if (recIsConnected(recs[i])) out.push(recs[i]);
    return out;
  }
  // Records still needing translation (not resolved elsewhere) AND still connected.
  function pruneUnresolved(lang, recs) {
    var m = memFor(lang), out = [], i, rec;
    for (i = 0; i < recs.length; i++) {
      rec = recs[i];
      if (m[rec.orig] != null) continue;
      if (!recIsConnected(rec)) continue;
      out.push(rec);
    }
    return out;
  }
  // Split records into on-screen (within the viewport + one screen of margin) vs the
  // rest, so the visible text is translated FIRST. Hidden/zero-box records (display
  // none, collapsed accordions) fall to the background group.
  function splitByViewport(recs, visible, rest) {
    var vh = window.innerHeight || document.documentElement.clientHeight || 0;
    var margin = vh; // +1 screen ahead
    for (var i = 0; i < recs.length; i++) {
      var rec = recs[i];
      var el = rec.kind === "text" ? rec.node.parentElement : rec.el;
      var inView = true;
      if (el && el.getBoundingClientRect) {
        try {
          var r = el.getBoundingClientRect();
          inView = (r.bottom >= -margin && r.top <= vh + margin && (r.width > 0 || r.height > 0));
        } catch (e) { inView = true; }
      }
      (inView ? visible : rest).push(rec);
    }
  }

  function setDir(lang) {
    var html = document.documentElement;
    html.setAttribute("lang", lang);
    html.setAttribute("dir", RTL[lang] ? "rtl" : "ltr");
  }

  // Group records into batches, each capped by UNIQUE untranslated strings AND
  // their summed chars (so one POST stays within the server's limits). Records
  // already resolved in memory add no `need` but ride along in their batch so they
  // are painted from cache. Each batch carries its own records → applied in isolation.
  function batchRecords(lang, recs, maxNeed, maxChars) {
    var m = memFor(lang);
    var batches = [];
    var curRecs = [], curNeed = [], curSeen = {}, curChars = 0;
    var flush = function () {
      if (curRecs.length) batches.push({ recs: curRecs, need: curNeed });
      curRecs = []; curNeed = []; curSeen = {}; curChars = 0;
    };
    for (var i = 0; i < recs.length; i++) {
      var rec = recs[i], o = rec.orig;
      var isNeed = (m[o] == null && !curSeen[o]);
      if (isNeed && curNeed.length > 0 && (curNeed.length >= maxNeed || curChars + o.length > maxChars)) flush();
      curRecs.push(rec);
      if (m[o] == null && !curSeen[o]) { curSeen[o] = 1; curNeed.push(o); curChars += o.length + 4; }
    }
    flush();
    return batches;
  }

  // Run a list of {recs, need} batches with at most `limit` fetches in flight.
  // Applies each batch to ITS OWN records as it lands (progressive paint), fires
  // `onFirst` the first time any batch applies a real translation, and pushes a
  // failed batch's records to `unresolved` (if given) for a later retry pass.
  // Resolves with the total count of genuine translations applied.
  function runBatches(lang, batches, limit, unresolved, onFirst) {
    return new Promise(function (resolve) {
      if (!batches.length) { resolve(0); return; }
      var idx = 0, active = 0, total = 0;
      var pump = function () {
        if (idx >= batches.length && active === 0) { resolve(total); return; }
        while (active < limit && idx < batches.length) {
          (function (batch) {
            active++;
            var m = memFor(lang);
            var need = batch.need;
            var done = function () {
              active--;
              // Only paint if we're STILL in this language — a batch that resolves
              // after the user returned to Hebrew (or switched again) must not stamp
              // stale text over the restored page.
              var applied = (current === lang) ? applyBatch(batch.recs, lang) : 0;
              total += applied;
              if (applied > 0 && onFirst) onFirst();
              pump();
            };
            if (!need || need.length === 0) { done(); return; }
            fetchTranslationsRetrying(lang, need, RETRY_MAX).then(function (res) {
              for (var j = 0; j < need.length; j++) {
                var tr = res[j];
                // Store ONLY a genuine translation — the edge fn echoes the Hebrew
                // source for any string that failed its verify guards; caching that
                // echo would freeze it in Hebrew forever. Leave it unresolved so it
                // re-attempts next visit (e.g. once the DB cache is warmed).
                if (tr != null && tr !== need[j]) m[need[j]] = tr;
              }
              done();
            }, function () {
              if (unresolved) for (var u = 0; u < batch.recs.length; u++) unresolved.push(batch.recs[u]);
              done();
            });
          })(batches[idx++]);
        }
      };
      pump();
    });
  }

  // Translate a set of records into `lang` (fail-soft), with a concurrency cap.
  // Resolves with the count of genuine translations applied.
  function translateGroup(lang, recs, limit, unresolved, onFirst) {
    var live = pruneRecords(recs);
    if (!live.length) return Promise.resolve(0);
    var batches = batchRecords(lang, live, MAX_NEED, MAX_NEED_CHARS);
    return runBatches(lang, batches, limit, unresolved, onFirst).then(function (count) {
      savePageCache(lang);
      return count;
    });
  }

  // Fired once, the first time a switch applies a REAL translation: only now do we
  // flip direction, remember the language, show the banner and start observing —
  // so a total failure leaves the page RTL-Hebrew and honest. Idempotent.
  function commitSwitch(lang, myGen) {
    if (switchSeq !== myGen || committed) return;
    committed = true;
    setDir(lang);
    rememberLang(lang);
    clearFailStamp();
    hideToast(); // clear any leftover failure notice from a previous attempt
    showBanner(lang);
    startObserver();
    syncTriggers();
  }

  // Orchestrate one switch: visible text FIRST (closes the progress bar the moment
  // it applies), then the rest at idle with a ≤4 pool, then one retry pass for
  // records still unresolved. Resolves when ALL of that is done.
  function runSwitch(lang, myGen) {
    var visible = [], rest = [];
    splitByViewport(records, visible, rest);
    var unresolved = [];
    var onFirst = function () { commitSwitch(lang, myGen); };
    return translateGroup(lang, visible, MAX_INFLIGHT, unresolved, onFirst).then(function () {
      if (switchSeq !== myGen) return;
      hideBar(); setTriggersBusy(false); // close progress/aria-busy on the VISIBLE apply
    }).then(function () {
      if (switchSeq !== myGen) return;
      return new Promise(function (resolve) {
        var go = function () {
          if (switchSeq !== myGen) { resolve(); return; }
          translateGroup(lang, rest, MAX_INFLIGHT, unresolved, onFirst).then(function () {
            if (switchSeq !== myGen) { resolve(); return; }
            var stillUn = pruneUnresolved(lang, unresolved);
            if (!stillUn.length) { resolve(); return; }
            translateGroup(lang, stillUn, MAX_INFLIGHT, null, onFirst).then(resolve, resolve);
          }, resolve);
        };
        if ("requestIdleCallback" in window) requestIdleCallback(go, { timeout: 2000 }); else setTimeout(go, 60);
      });
    });
  }

  // Total failure: nothing translated. Roll the page back to RTL-Hebrew WITHOUT
  // erasing any previously-working stored preference (the short-lived fail stamp
  // suppresses the auto-retry on the next load; after it lapses the stored lang is
  // retried, in case this was a transient outage).
  function rollbackToSource() {
    restoreAll();
    current = SOURCE;
    setDir(SOURCE);
    hideBanner();
    if (observer) { observer.disconnect(); observer = null; }
  }

  // Runs once a switch's whole pipeline settles (unless it was superseded).
  function finishSwitch(lang, myGen) {
    if (switchSeq !== myGen) return; // superseded by a restore or a queued switch
    busy = false;
    hideBar(); setTriggersBusy(false);
    if (!committed) { rollbackToSource(); showToast(lang); setFailStamp(); }
    records = pruneRecords(records);
    syncTriggers();
    if (queuedLang && queuedLang !== current) { var q = queuedLang; queuedLang = null; setLang(q); }
    else { queuedLang = null; }
  }

  // ── dynamic content ──────────────────────────────────────────────────────────
  var pending = null;
  var obsRoots = []; // accumulated across observer callbacks, drained on the debounce
  var ATTR_SEL = "[placeholder],[aria-label],[title],[alt]";
  function startObserver() {
    if (observer) return;
    observer = new MutationObserver(function (muts) {
      if (current === SOURCE) return;
      for (var i = 0; i < muts.length; i++) {
        var mu = muts[i];
        if (mu.type === "characterData") {
          // Text of an existing node changed (dynamic copy) — re-scan its parent.
          if (mu.target && mu.target.parentElement) obsRoots.push(mu.target.parentElement);
        } else if (mu.type === "attributes") {
          // A translatable attribute changed on some element (incl. an injected
          // root the app mounts into) — re-scan that element if it matches.
          var el = mu.target;
          if (el && el.nodeType === 1 && el.matches && el.matches(ATTR_SEL)) obsRoots.push(el);
        } else {
          for (var j = 0; j < mu.addedNodes.length; j++) {
            var n = mu.addedNodes[j];
            if (n.nodeType === 1) obsRoots.push(n);
            else if (n.nodeType === 3 && n.parentElement) obsRoots.push(n.parentElement);
          }
        }
      }
      if (obsRoots.length === 0) return;
      if (pending) clearTimeout(pending);
      pending = setTimeout(function () {
        pending = null;
        var roots = obsRoots; obsRoots = [];
        if (current === SOURCE) return; // restored to Hebrew before this fired
        var fresh = [];
        for (var r = 0; r < roots.length; r++) {
          if (!roots[r].isConnected) continue;
          fresh = fresh.concat(collect(roots[r]));
        }
        if (fresh.length === 0) return;
        records = records.concat(fresh);
        translateGroup(current, fresh, MAX_INFLIGHT, null, null);
      }, 250);
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  }

  // ── injected styles (menu + banner + progress bar), dark-aware ────────────────
  function ensureStyle() {
    if (document.getElementById("swi18n-style")) return;
    var css = [
      ".swi18n-menu{position:fixed;z-index:2147483000;min-width:190px;max-height:70vh;overflow:auto;",
      "background:#fff;color:#111827;border:1px solid rgba(0,0,0,.12);border-radius:14px;",
      "box-shadow:0 12px 34px rgba(15,27,34,.18);padding:6px;font:inherit;direction:rtl}",
      ".swi18n-item{display:flex;align-items:center;gap:10px;width:100%;box-sizing:border-box;padding:9px 12px;",
      "border:0;background:none;border-radius:10px;cursor:pointer;font-size:15px;color:inherit;text-align:start}",
      ".swi18n-item:hover,.swi18n-item:focus-visible{background:rgba(22,163,74,.12);outline:none}",
      ".swi18n-item[aria-checked='true']{font-weight:700;color:#16A34A}",
      ".swi18n-native{margin-inline-end:auto}",
      ".swi18n-check{width:18px;flex:none;text-align:center;opacity:0;color:#16A34A;font-weight:700}",
      ".swi18n-item[aria-checked='true'] .swi18n-check{opacity:1}",
      ".swi18n-banner{position:fixed;inset-inline:0;bottom:0;z-index:2147482000;display:flex;gap:12px;align-items:center;",
      "justify-content:center;padding:9px 16px;background:#0f1720;color:#eef2f5;font-size:13.5px;line-height:1.4}",
      ".swi18n-banner button{background:rgba(255,255,255,.14);color:#fff;border:0;",
      "border-radius:8px;padding:5px 12px;cursor:pointer;font:inherit;font-size:13px}",
      ".swi18n-toast{position:fixed;inset-inline:0;bottom:0;z-index:2147482500;display:flex;gap:12px;",
      "align-items:center;justify-content:center;padding:10px 16px;background:#7f1d1d;color:#fff;",
      "font-size:13.5px;line-height:1.4;direction:rtl}",
      ".swi18n-toast button{background:rgba(255,255,255,.18);color:#fff;border:0;border-radius:8px;",
      "padding:5px 12px;cursor:pointer;font:inherit;font-size:13px}",
      ".swi18n-bar{position:fixed;inset-block-start:0;inset-inline:0;height:4px;z-index:2147483600;",
      "background:linear-gradient(90deg,transparent,#16A34A,transparent);background-size:40% 100%;",
      "background-repeat:no-repeat;animation:swi18n-slide 1s linear infinite}",
      "@keyframes swi18n-slide{0%{background-position:-40% 0}100%{background-position:140% 0}}",
      "@media (prefers-reduced-motion:reduce){.swi18n-bar{animation:none;background-position:50% 0}}",
      "@media (prefers-color-scheme:dark){.swi18n-menu{background:#111820;color:#eef2f5;border-color:rgba(255,255,255,.14)}",
      ".swi18n-item:hover,.swi18n-item:focus-visible{background:rgba(22,163,74,.22)}}",
      ":root[data-theme='dark'] .swi18n-menu{background:#111820;color:#eef2f5;border-color:rgba(255,255,255,.14)}",
      ":root[data-theme='dark'] .swi18n-item:hover,:root[data-theme='dark'] .swi18n-item:focus-visible{background:rgba(22,163,74,.22)}"
    ].join("");
    var st = document.createElement("style");
    st.id = "swi18n-style";
    st.textContent = css;
    document.head.appendChild(st);
  }

  function showBar() {
    if (document.getElementById("swi18n-bar")) return;
    var b = document.createElement("div"); b.id = "swi18n-bar"; b.className = "swi18n-bar";
    b.setAttribute("data-no-translate", ""); b.setAttribute("aria-hidden", "true");
    document.body.appendChild(b);
  }
  function hideBar() { var b = document.getElementById("swi18n-bar"); if (b) b.remove(); }
  // Mark the language triggers busy during an async switch — screen-reader signal
  // + a styling hook — so a multi-second cold-language switch is not silent.
  function setTriggersBusy(on) {
    for (var i = 0; i < triggers.length; i++) {
      if (on) triggers[i].setAttribute("aria-busy", "true");
      else triggers[i].removeAttribute("aria-busy");
    }
  }

  // Legal / consent surfaces: the "Hebrew is binding" notice must be PRESENT and
  // NON-dismissible there (the user is about to take a legal action — consent,
  // agreeing to terms). Everywhere else the banner is dismissible per session.
  function isLegalPage() {
    return /(^|\/)(book|terms|privacy|accessibility|account-deletion)(\.html)?$/i.test(location.pathname);
  }
  function showBanner(lang) {
    hideBanner();
    if (lang === SOURCE) return;
    var legal = isLegalPage();
    if (!legal) { try { if (sessionStorage.getItem("swi18n:banner-dismissed:" + lang) === "1") return; } catch (e) {} }
    var bar = document.createElement("div");
    bar.className = "swi18n-banner"; bar.setAttribute("data-no-translate", "");
    // role=status + aria-live so the legal disclosure is announced when it appears
    // (it is injected AFTER the async translation resolves).
    bar.setAttribute("role", "status"); bar.setAttribute("aria-live", "polite");
    bar.dir = RTL[lang] ? "rtl" : "ltr";
    var span = document.createElement("span"); span.textContent = BANNER[lang] || BANNER.en;
    bar.appendChild(span);
    if (!legal) {
      var btn = document.createElement("button"); btn.type = "button"; btn.textContent = DISMISS[lang] || DISMISS.en;
      btn.addEventListener("click", function () {
        try { sessionStorage.setItem("swi18n:banner-dismissed:" + lang, "1"); } catch (e) {}
        hideBanner();
      });
      bar.appendChild(btn);
    }
    document.body.appendChild(bar);
  }
  function hideBanner() { var b = document.querySelector(".swi18n-banner"); if (b) b.remove(); }

  // Honest, non-blocking failure notice (Hebrew — the page stays Hebrew on failure)
  // with a retry that re-attempts the same language. Auto-dismisses after a while.
  function showToast(lang) {
    hideToast();
    ensureStyle();
    var t = document.createElement("div");
    t.className = "swi18n-toast"; t.setAttribute("data-no-translate", "");
    t.setAttribute("role", "status"); t.setAttribute("aria-live", "polite"); t.dir = "rtl";
    var span = document.createElement("span");
    span.textContent = "התרגום אינו זמין כרגע — נסו שוב";
    t.appendChild(span);
    var btn = document.createElement("button"); btn.type = "button"; btn.textContent = "נסו שוב";
    btn.addEventListener("click", function () { hideToast(); clearFailStamp(); setLang(lang); });
    t.appendChild(btn);
    document.body.appendChild(t);
    try { setTimeout(function () { hideToast(); }, 8000); } catch (e) {}
  }
  function hideToast() { var t = document.querySelector(".swi18n-toast"); if (t) t.remove(); }

  // ── public: switch language ──────────────────────────────────────────────────
  function setLang(lang) {
    // Reject a bogus code before touching any state.
    if (lang !== SOURCE && !LANGS.some(function (l) { return l.code === lang; })) return;
    ensureStyle();

    // Returning to Hebrew ALWAYS works — even mid-translate. Abort in-flight fetches,
    // invalidate any pending background/idle work (switchSeq++), and restore. This is
    // deliberately BEFORE the busy guard so a stuck switch can never trap the user.
    if (lang === SOURCE) {
      abortAll();
      switchSeq++;
      queuedLang = null; busy = false; committed = false;
      restoreAll();
      records = []; seenText = new WeakSet();
      current = SOURCE; rememberLang(SOURCE);
      setDir(SOURCE); hideBanner(); hideBar(); hideToast(); setTriggersBusy(false);
      if (pending) { clearTimeout(pending); pending = null; }
      obsRoots = [];
      if (observer) { observer.disconnect(); observer = null; }
      syncTriggers(); closeMenu();
      return;
    }

    if (lang === current) { closeMenu(); return; } // already showing / committing to it
    if (busy) { queuedLang = lang; closeMenu(); return; } // queue; run when the current switch settles

    // A page without Supabase config can't translate — fail honestly rather than
    // throw synchronously in endpoint() and strand busy.
    if (!cfg.url || !cfg.anonKey) { showToast(lang); closeMenu(); return; }

    busy = true; committed = false; queuedLang = null;
    var myGen = ++switchSeq;
    showBar(); setTriggersBusy(true); hideToast(); closeMenu();
    // Do NOT flip direction yet — the page stays RTL-Hebrew until the first REAL
    // translation lands (commitSwitch), so a total failure never shows a broken
    // LTR/foreign-lang mirror with untranslated Hebrew.
    if (current === SOURCE) { records = []; seenText = new WeakSet(); records = collect(document.body); }
    loadPageCache(lang);
    current = lang; syncTriggers(); // optimistic badge; setDir/banner/remember deferred to success

    // Promise.resolve().then so a synchronous throw in the kickoff can never leave
    // busy=true forever; finishSwitch always runs. Load the static /i18n dictionary
    // FIRST (fail-soft): once merged, runSwitch finds every string already in memory
    // and makes zero live fetches — the pre-warmed languages translate near-instantly.
    Promise.resolve().then(function () {
      return loadStaticDict(lang);
    }).then(function () {
      if (switchSeq !== myGen) return; // superseded (restore / queued switch) while loading
      return runSwitch(lang, myGen);
    }).then(null, function () {}).then(function () {
      finishSwitch(lang, myGen);
    });
  }

  function getLang() { return current; }

  // ── public: menu UI (shared by both surfaces) ────────────────────────────────
  var openMenuEl = null, openTrigger = null, triggers = [];
  function closeMenu(refocus) {
    var t = openTrigger;
    if (openMenuEl) { openMenuEl.remove(); openMenuEl = null; }
    if (openTrigger) { openTrigger.setAttribute("aria-expanded", "false"); openTrigger.removeAttribute("aria-controls"); openTrigger = null; }
    document.removeEventListener("keydown", onMenuKey, true);
    document.removeEventListener("click", onOutside, true);
    // Return focus to the globe on keyboard / selection close so focus is never
    // left on a removed element. NOT on outside-click (refocus===false), where the
    // user is deliberately moving focus elsewhere.
    if (refocus !== false && t && document.contains(t)) t.focus();
  }
  function onOutside(e) { if (openMenuEl && !openMenuEl.contains(e.target) && e.target !== openTrigger && !openTrigger.contains(e.target)) closeMenu(false); }
  function onMenuKey(e) {
    if (e.key === "Escape") { e.preventDefault(); closeMenu(true); return; }
    if (!openMenuEl) return;
    var items = Array.prototype.slice.call(openMenuEl.querySelectorAll(".swi18n-item"));
    var idx = items.indexOf(document.activeElement);
    // Tab is trapped inside the open menu (wraps like the arrows) so focus can't
    // escape into the page behind a visually-open menu. Esc / selection / outside
    // click all close it and return focus to the trigger.
    if (e.key === "ArrowDown" || (e.key === "Tab" && !e.shiftKey)) { e.preventDefault(); (items[idx + 1] || items[0]).focus(); }
    else if (e.key === "ArrowUp" || (e.key === "Tab" && e.shiftKey)) { e.preventDefault(); (items[idx - 1] || items[items.length - 1]).focus(); }
    else if (e.key === "Home") { e.preventDefault(); items[0].focus(); }
    else if (e.key === "End") { e.preventDefault(); items[items.length - 1].focus(); }
  }
  function openMenu(trigger) {
    ensureStyle();
    var menu = document.createElement("div");
    menu.className = "swi18n-menu"; menu.setAttribute("role", "menu"); menu.setAttribute("data-no-translate", "");
    // Stable id so the trigger can reference the open menu via aria-controls
    // (only one menu exists at a time — closeMenu() always runs before openMenu).
    menu.id = "swi18n-menu";
    menu.setAttribute("aria-label", "בחירת שפה / Language");
    var rows = [{ code: SOURCE, label: "עברית", dir: "rtl" }].concat(LANGS);
    rows.forEach(function (l) {
      var b = document.createElement("button");
      b.type = "button"; b.className = "swi18n-item"; b.setAttribute("role", "menuitemradio");
      b.setAttribute("aria-checked", current === l.code ? "true" : "false");
      b.setAttribute("lang", l.code); b.dir = l.dir;
      var native = document.createElement("span"); native.className = "swi18n-native"; native.textContent = l.label;
      var check = document.createElement("span"); check.className = "swi18n-check"; check.setAttribute("aria-hidden", "true"); check.textContent = "✓";
      b.appendChild(native); b.appendChild(check);
      b.addEventListener("click", function () { setLang(l.code); });
      menu.appendChild(b);
    });
    document.body.appendChild(menu);
    // Position under the trigger, kept within the viewport.
    var r = trigger.getBoundingClientRect();
    var mw = menu.offsetWidth;
    var left = Math.min(Math.max(8, r.right - mw), window.innerWidth - mw - 8);
    menu.style.top = Math.round(r.bottom + 8) + "px";
    menu.style.left = Math.round(left) + "px";
    openMenuEl = menu; openTrigger = trigger;
    trigger.setAttribute("aria-expanded", "true");
    trigger.setAttribute("aria-controls", menu.id);
    document.addEventListener("keydown", onMenuKey, true);
    document.addEventListener("click", onOutside, true);
    var first = menu.querySelector(".swi18n-item[aria-checked='true']") || menu.querySelector(".swi18n-item");
    if (first) first.focus();
  }
  function syncTriggers() {
    for (var i = 0; i < triggers.length; i++) {
      var code = current === SOURCE ? "עב" : current.toUpperCase();
      var badge = triggers[i].querySelector("[data-swi18n-badge]");
      if (badge) badge.textContent = code;
      triggers[i].setAttribute("aria-label", "שפה: " + (HE_NAMES[current] || current) + " — שינוי שפת האתר");
    }
  }
  function mountMenu(trigger) {
    if (!trigger || triggers.indexOf(trigger) !== -1) return;
    triggers.push(trigger);
    trigger.setAttribute("aria-haspopup", "true");
    trigger.setAttribute("aria-expanded", "false");
    trigger.addEventListener("click", function (e) {
      e.preventDefault();
      if (openTrigger === trigger) { closeMenu(); return; }
      closeMenu(); openMenu(trigger);
    });
    syncTriggers();
  }

  // ── SPA client-side navigation (the Next mobile app) ─────────────────────────
  // A full page load re-inits the runtime, but a client-side route change keeps the
  // SAME document. Without this, records/seenText would retain the previous page's
  // now-detached nodes (memory growth) and savePageCache would write them under the
  // NEW page's cache key (pollution). On a real pathname change we drop the old
  // records and, if a language is active, re-scan + re-translate the new page (the
  // MutationObserver also catches nodes the framework renders after the swap). On
  // the static full-page-load site pushState isn't used for nav, so this never fires.
  var lastPath = (typeof location !== "undefined") ? location.pathname : "";
  function handleRouteChange() {
    if (location.pathname === lastPath) return; // hash/query-only change → ignore
    lastPath = location.pathname;
    records = []; seenText = new WeakSet();
    if (current === SOURCE) return;
    setDir(current);
    setTimeout(function () { // let the new route's DOM render before scanning it
      if (current === SOURCE) return;
      records = collect(document.body);
      loadPageCache(current);
      showBanner(current);
      translateGroup(current, records, MAX_INFLIGHT, null, null);
    }, 80);
  }
  function patchHistory() {
    try {
      ["pushState", "replaceState"].forEach(function (k) {
        var orig = history[k];
        if (typeof orig !== "function" || orig.__swi18n) return;
        var wrapped = function () { var r = orig.apply(this, arguments); try { handleRouteChange(); } catch (e) {} return r; };
        wrapped.__swi18n = true;
        history[k] = wrapped;
      });
      window.addEventListener("popstate", function () { try { handleRouteChange(); } catch (e) {} });
    } catch (e) { /* history not patchable — full-page-load site is unaffected */ }
  }

  // ── init ─────────────────────────────────────────────────────────────────────
  function init(opts) {
    opts = opts || {};
    var conf = window.CHOSECH_SUPABASE || {};
    cfg.url = opts.supabaseUrl || conf.url || null;
    cfg.anonKey = opts.anonKey || conf.anonKey || null;
    seenText = new WeakSet();
    ensureStyle();
    patchHistory();
    // Re-apply a previously chosen language across navigation — unless a recent
    // total failure stamped this session (then stay Hebrew until it lapses so a
    // broken state can't replay on every load).
    var want = storedLang();
    if (want !== SOURCE && cfg.url && cfg.anonKey && !failStampActive()) {
      // Defer to idle so first paint (Hebrew) isn't blocked.
      var go = function () {
        // Re-read inside the idle callback: the user may have made a fresh manual
        // choice (or returned to Hebrew) before this fired — never override it.
        var w = storedLang();
        if (w !== SOURCE && current === SOURCE && !failStampActive()) setLang(w);
      };
      if ("requestIdleCallback" in window) requestIdleCallback(go, { timeout: 1200 }); else setTimeout(go, 300);
    } else {
      setDir(current);
    }
    return SwitchyI18n;
  }

  var SwitchyI18n = {
    init: init,
    setLang: setLang,
    getLang: getLang,
    mountMenu: mountMenu,
    LANGS: LANGS,
    SOURCE: SOURCE
  };
  window.SwitchyI18n = SwitchyI18n;
})();
