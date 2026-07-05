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
    { code: "en", label: "English", dir: "ltr" },
    { code: "ru", label: "Русский", dir: "ltr" },
    { code: "am", label: "አማርኛ", dir: "ltr" },
    { code: "es", label: "Español", dir: "ltr" },
    { code: "fr", label: "Français", dir: "ltr" }
  ];
  var RTL = { ar: 1, he: 1 };
  // Hebrew names, used in the trigger's aria-label so a Hebrew screen reader reads
  // a real word ("אנגלית") rather than the raw 2-letter code ("en").
  var HE_NAMES = { he: "עברית", ar: "ערבית", en: "אנגלית", ru: "רוסית", am: "אמהרית", es: "ספרדית", fr: "צרפתית" };

  // Compliance banner — reviewed, static per language so it is ALWAYS correct and
  // instant (never depends on the model). "The Hebrew version is the binding one."
  var BANNER = {
    ar: "ترجمة آلية لتيسير الاطّلاع — النسخة العبرية هي الملزِمة قانونيًا.",
    en: "Automatic translation for convenience — the Hebrew version is the legally binding one.",
    ru: "Автоматический перевод для удобства — юридически обязательна версия на иврите.",
    am: "ለምቾት በራስ-ሰር የተተረጎመ — ሕጋዊ ተቀባይነት ያለው የዕብራይስጥ ቅጂ ነው።",
    es: "Traducción automática para su comodidad: la versión en hebreo es la vinculante.",
    fr: "Traduction automatique pour votre confort — la version hébraïque fait foi."
  };
  var DISMISS = { ar: "إغلاق", en: "Dismiss", ru: "Закрыть", am: "ዝጋ", es: "Cerrar", fr: "Fermer" };

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

  // ── config / storage ───────────────────────────────────────────────────────
  function endpoint() { return cfg.url.replace(/\/$/, "") + "/functions/v1/translate"; }
  function memFor(lang) { return (mem[lang] = mem[lang] || {}); }
  function pageKey(lang) { return "swi18n:c:" + lang + ":" + location.pathname; }

  function loadPageCache(lang) {
    try {
      var raw = localStorage.getItem(pageKey(lang));
      if (!raw) return;
      var obj = JSON.parse(raw);
      var m = memFor(lang);
      for (var k in obj) if (Object.prototype.hasOwnProperty.call(obj, k)) m[k] = obj[k];
    } catch (e) { /* storage blocked — memory-only */ }
  }
  function savePageCache(lang) {
    try {
      // Persist only the strings that live on THIS page, to keep entries small.
      var out = {}, m = memFor(lang), i;
      for (i = 0; i < records.length; i++) {
        var o = records[i].orig;
        if (m[o] != null) out[o] = m[o];
      }
      localStorage.setItem(pageKey(lang), JSON.stringify(out));
    } catch (e) { /* over quota / blocked — ignore */ }
  }
  function rememberLang(lang) {
    try { lang === SOURCE ? localStorage.removeItem("swi18n:lang") : localStorage.setItem("swi18n:lang", lang); } catch (e) {}
  }
  function storedLang() { try { return localStorage.getItem("swi18n:lang") || SOURCE; } catch (e) { return SOURCE; } }

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
  function chunk(arr, n) { var out = [], i; for (i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n)); return out; }

  function fetchTranslations(lang, texts) {
    return fetch(endpoint(), {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: cfg.anonKey, Authorization: "Bearer " + cfg.anonKey },
      body: JSON.stringify({ lang: lang, texts: texts })
    }).then(function (r) {
      if (!r.ok) throw new Error("translate " + r.status);
      return r.json();
    }).then(function (j) {
      return (j && Array.isArray(j.translations)) ? j.translations : texts;
    });
  }

  // ── apply / restore ──────────────────────────────────────────────────────────
  function applyRecord(rec, lang) {
    var m = memFor(lang);
    var t = m[rec.orig];
    if (t == null) return;
    if (rec.kind === "text") { rec.node.nodeValue = t; }
    else { rec.el.setAttribute(rec.attr, t); }
  }
  function restoreAll() {
    for (var i = 0; i < records.length; i++) {
      var rec = records[i];
      if (rec.kind === "text") { rec.node.nodeValue = rec.orig; }
      else { rec.el.setAttribute(rec.attr, rec.orig); }
    }
  }

  function setDir(lang) {
    var html = document.documentElement;
    html.setAttribute("lang", lang);
    html.setAttribute("dir", RTL[lang] ? "rtl" : "ltr");
  }

  // Translate a set of records into `lang`: fill the memory cache for any strings
  // it is missing (via the edge fn), then apply. Fail-soft — a failed fetch just
  // leaves those strings in Hebrew.
  function translateRecords(lang, recs) {
    var m = memFor(lang);
    var need = [];
    var seen = {};
    for (var i = 0; i < recs.length; i++) {
      var o = recs[i].orig;
      if (m[o] == null && !seen[o]) { seen[o] = 1; need.push(o); }
    }
    var apply = function () { for (var k = 0; k < recs.length; k++) applyRecord(recs[k], lang); };
    if (need.length === 0) { apply(); return Promise.resolve(); }
    var batches = chunk(need, 100);
    return Promise.all(batches.map(function (b) {
      return fetchTranslations(lang, b).then(function (res) {
        for (var j = 0; j < b.length; j++) m[b[j]] = res[j] != null ? res[j] : b[j];
      }).catch(function () { /* keep Hebrew for this batch */ });
    })).then(function () { apply(); savePageCache(lang); });
  }

  // ── dynamic content ──────────────────────────────────────────────────────────
  var pending = null;
  function startObserver() {
    if (observer) return;
    observer = new MutationObserver(function (muts) {
      if (current === SOURCE) return;
      var roots = [];
      for (var i = 0; i < muts.length; i++) {
        var mu = muts[i];
        for (var j = 0; j < mu.addedNodes.length; j++) {
          var n = mu.addedNodes[j];
          if (n.nodeType === 1) roots.push(n);
          else if (n.nodeType === 3 && n.parentElement) roots.push(n.parentElement);
        }
      }
      if (roots.length === 0) return;
      if (pending) clearTimeout(pending);
      pending = setTimeout(function () {
        pending = null;
        if (current === SOURCE) return; // restored to Hebrew before this fired
        var fresh = [];
        for (var r = 0; r < roots.length; r++) {
          if (!roots[r].isConnected) continue;
          fresh = fresh.concat(collect(roots[r]));
        }
        if (fresh.length === 0) return;
        records = records.concat(fresh);
        translateRecords(current, fresh);
      }, 250);
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: false });
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
      ".swi18n-bar{position:fixed;inset-block-start:0;inset-inline:0;height:3px;z-index:2147483600;",
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

  // ── public: switch language ──────────────────────────────────────────────────
  function setLang(lang) {
    if (busy) return;
    if (lang !== SOURCE && !LANGS.some(function (l) { return l.code === lang; })) return;
    if (lang === current) { closeMenu(); return; }
    ensureStyle();

    if (lang === SOURCE) {
      restoreAll();
      records = []; seenText = new WeakSet();
      current = SOURCE; rememberLang(SOURCE);
      setDir(SOURCE); hideBanner(); hideBar();
      if (pending) { clearTimeout(pending); pending = null; } // no queued re-translate
      if (observer) { observer.disconnect(); observer = null; }
      syncTriggers(); closeMenu();
      return;
    }

    busy = true; showBar(); closeMenu();
    setDir(lang);
    // Fresh scan of the whole page for this switch (only when coming from Hebrew).
    if (current === SOURCE) { records = []; seenText = new WeakSet(); records = collect(document.body); }
    loadPageCache(lang);
    current = lang; rememberLang(lang); syncTriggers();
    translateRecords(lang, records).then(function () {
      showBanner(lang); startObserver();
    }).catch(function () {}).then(function () {
      busy = false; hideBar(); syncTriggers();
    });
  }

  function getLang() { return current; }

  // ── public: menu UI (shared by both surfaces) ────────────────────────────────
  var openMenuEl = null, openTrigger = null, triggers = [];
  function closeMenu(refocus) {
    var t = openTrigger;
    if (openMenuEl) { openMenuEl.remove(); openMenuEl = null; }
    if (openTrigger) { openTrigger.setAttribute("aria-expanded", "false"); openTrigger = null; }
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
      translateRecords(current, records);
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
    // Re-apply a previously chosen language across navigation.
    var want = storedLang();
    if (want !== SOURCE && cfg.url && cfg.anonKey) {
      // Defer to idle so first paint (Hebrew) isn't blocked.
      var go = function () { setLang(want); };
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
