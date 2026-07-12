/* חוסך — landing interactions. Vanilla JS, no dependencies. */
(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const nis = (n) => '₪' + Math.round(n).toLocaleString('he-IL');

  // ── Shared scheduling helpers ──────────────────────────────────────────────
  // rafThrottle: collapse a burst of high-frequency events (scroll/pointer) into
  // one call per animation frame, so handlers that read layout don't thrash.
  // debounce: defer a handler until input has settled (text fields), avoiding a
  // full re-filter on every keystroke.
  const rafThrottle = (fn) => {
    let scheduled = false;
    return (...args) => {
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(() => { scheduled = false; fn(...args); });
    };
  };
  const debounce = (fn, wait = 120) => {
    let t = 0;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), wait); };
  };

  // ── Footer year ──────────────────────────────────────────────────────────
  const year = $('year');
  if (year) year.textContent = new Date().getFullYear();

  // ── Sticky nav shadow ────────────────────────────────────────────────────
  // rAF-throttled: toggling a class is a write, but reading scrollY each event
  // and reacting synchronously is wasteful at scroll cadence.
  const nav = $('nav');
  const onScroll = () => nav && nav.classList.toggle('scrolled', window.scrollY > 10);
  if (nav) {
    window.addEventListener('scroll', rafThrottle(onScroll), { passive: true });
    onScroll();
  }

  // ── Mobile menu ──────────────────────────────────────────────────────────
  const toggle = $('navToggle');
  const menu = $('mobileMenu');
  const setMenu = (open) => {
    if (!toggle || !menu) return;
    toggle.setAttribute('aria-expanded', String(open));
    menu.hidden = !open;
    menu.classList.toggle('open', open);
  };
  if (toggle && menu) {
    toggle.addEventListener('click', () =>
      setMenu(toggle.getAttribute('aria-expanded') !== 'true'));
    menu.querySelectorAll('a').forEach((a) => a.addEventListener('click', () => setMenu(false)));
    // Esc closes the menu and returns focus to the toggle — keyboard parity with
    // the click-to-open affordance.
    menu.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { setMenu(false); toggle.focus(); }
    });
  }

  // ── Current page in the nav ──────────────────────────────────────────────
  // aria-current="page" on the matching header link (desktop + mobile);
  // styles.css highlights it. Hash links (e.g. index.html#calculator) are
  // skipped — they're section anchors, not the page the user is on.
  const here = location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.nav__links a, .nav__mobile a').forEach((a) => {
    const href = a.getAttribute('href') || '';
    if (!href.includes('#') && href === here) a.setAttribute('aria-current', 'page');
  });

  // ── Savings calculator ─────────────────────────────────────────────────────
  // Honest "up to" estimate — the exact figure is computed in the app from the
  // user's real bill. ~45% of a typical overpaying bill, annualised, rounded.
  const SAVE_RATE = 0.45;
  const billRange = $('billRange');
  const billOut = $('billOut');
  const saveOut = $('saveOut');
  const updateCalc = () => {
    if (!billRange) return;
    const bill = Number(billRange.value);
    if (billOut) billOut.textContent = nis(bill);
    const annual = Math.round((bill * SAVE_RATE * 12) / 10) * 10;
    if (saveOut) saveOut.textContent = nis(annual);
  };
  if (billRange) {
    // a11y: native <input type="range"> is keyboard-operable by default (arrows
    // adjust value, firing 'input'). We make sure AT can read the live result by
    // pointing the slider at a polite live region that holds the saving figure,
    // and by giving the slider a value text that includes the current bill.
    const calcLive = $('billCalcLive');
    if (calcLive) {
      calcLive.setAttribute('aria-live', 'polite');
      calcLive.setAttribute('aria-atomic', 'true');
    }
    const announceCalc = () => {
      if (!calcLive) return;
      const bill = Number(billRange.value);
      const annual = Math.round((bill * SAVE_RATE * 12) / 10) * 10;
      calcLive.textContent = 'בתשלום של ' + nis(bill) + ' בחודש, חיסכון שנתי משוער של עד ' + nis(annual) + '.';
    };
    if (!billRange.getAttribute('aria-valuetext')) {
      billRange.setAttribute('aria-valuetext', nis(Number(billRange.value)));
    }
    billRange.addEventListener('input', updateCalc);
    // Announce the result only after input settles, so dragging the slider
    // doesn't flood the live region with every intermediate value.
    billRange.addEventListener('input', () => {
      billRange.setAttribute('aria-valuetext', nis(Number(billRange.value)));
    });
    billRange.addEventListener('input', debounce(announceCalc, 350));
    billRange.addEventListener('change', announceCalc);
    updateCalc();
  }

  // ── Animated hero counter ──────────────────────────────────────────────────
  const heroCounter = $('heroCounter');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const countTo = (el, to, dur = 1400) => {
    if (reduceMotion) { el.textContent = nis(to); return; }
    const start = performance.now();
    const step = (now) => {
      const t = Math.min((now - start) / dur, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      el.textContent = nis(to * eased);
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };
  if (heroCounter) countTo(heroCounter, 1188);

  // ── Scroll reveal ──────────────────────────────────────────────────────────
  const reveals = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window && !reduceMotion) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
      });
    }, { threshold: 0.12 });
    reveals.forEach((el) => {
      // An element taller than ~8 viewports (e.g. the stacked mobile comparison
      // table) can never reach the 12% threshold — reveal it immediately
      // instead of leaving it permanently invisible.
      if (el.offsetHeight * 0.12 > window.innerHeight) { el.classList.add('in'); return; }
      io.observe(el);
    });
  } else {
    reveals.forEach((el) => el.classList.add('in'));
  }

  // ── Cookieless analytics events ────────────────────────────────────────────
  // Thin wrapper over the Plausible-style queue (defined inline in <head>).
  // Privacy-respecting: event names + coarse props only, never personal data.
  const track = (name, props) => {
    try { if (typeof window.gtag === 'function') window.gtag('event', name, props || undefined); } catch (_) { /* analytics is best-effort */ }
  };

  // Fire an outbound-click event whenever a WhatsApp link is clicked (lead intent),
  // tagging which surface it came from. Canonical name is `outbound_click` (matches
  // the web app's TrackedOutboundLink); `dest` names the destination the way the
  // web event does. Delegated so it also covers links that script.js injects later
  // (compare table CTAs, plan cards).
  document.addEventListener('click', (e) => {
    const a = e.target.closest && e.target.closest('a[href*="wa.me"]');
    if (a) track('outbound_click', { dest: 'whatsapp', source: location.pathname });
  }, true);

  // ── Toast notifications ─────────────────────────────────────────────────────
  // One reusable, dependency-free toast. A single live region (assertive for
  // errors, polite for success) hosts the stack; messages auto-dismiss and can
  // be dismissed manually. No hard-coded colors — .toast / .toast--success /
  // .toast--error own the look in styles.css, so it follows dark-mode + RTL.
  // Reduced-motion: CSS suppresses the slide/fade, the toast just appears.
  let toastHost = null;
  const ensureToastHost = () => {
    if (toastHost && document.body.contains(toastHost)) return toastHost;
    toastHost = document.createElement('div');
    toastHost.className = 'toast-host';
    toastHost.setAttribute('aria-live', 'polite');
    toastHost.setAttribute('aria-atomic', 'false');
    document.body.appendChild(toastHost);
    return toastHost;
  };
  const toast = (message, kind = 'success', timeout = 4500) => {
    if (!message) return;
    const host = ensureToastHost();
    const el = document.createElement('div');
    el.className = 'toast toast--' + (kind === 'error' ? 'error' : 'success');
    // Errors interrupt (assertive) so AT reads them promptly; success is polite.
    el.setAttribute('role', kind === 'error' ? 'alert' : 'status');
    el.setAttribute('aria-live', kind === 'error' ? 'assertive' : 'polite');
    const msg = document.createElement('span');
    msg.className = 'toast__msg';
    msg.textContent = message;
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'toast__close';
    close.setAttribute('aria-label', 'סגירה');
    close.textContent = '✕';
    let killed = false;
    let timer = 0;
    const dismiss = () => {
      if (killed) return;
      killed = true;
      clearTimeout(timer);
      el.classList.remove('is-in');
      el.classList.add('is-out');
      const drop = () => el.remove();
      if (reduceMotion) drop();
      else { el.addEventListener('transitionend', drop, { once: true }); setTimeout(drop, 400); }
    };
    close.addEventListener('click', dismiss);
    el.appendChild(msg);
    el.appendChild(close);
    host.appendChild(el);
    // Force a reflow so the entrance transition runs from the initial state.
    requestAnimationFrame(() => el.classList.add('is-in'));
    if (timeout > 0) timer = setTimeout(dismiss, timeout);
    return el;
  };

  // ── Shared AI endpoint caller ───────────────────────────────────────────────
  // All three site AI tools (advisor / bill-analyzer / subscribe) POST to a
  // Supabase Edge Function with the anon key — identical wiring to the chat
  // handler below. Throws on missing config or non-2xx so callers fail-soft via
  // a friendly Hebrew toast.
  const callAiFunction = async (fnName, payload) => {
    const cfg = window.CHOSECH_SUPABASE;
    if (!cfg || !cfg.url || !cfg.anonKey) throw new Error('ai backend not configured');
    const res = await fetch(cfg.url.replace(/\/$/, '') + '/functions/v1/' + fnName, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: cfg.anonKey, Authorization: 'Bearer ' + cfg.anonKey },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(fnName + ' failed: ' + res.status);
    return data;
  };
  // Small DOM helper for the AI shells: a skeleton placeholder block.
  const skeletonRows = (n = 3) => {
    const wrap = document.createElement('div');
    wrap.className = 'skeleton-stack';
    wrap.setAttribute('aria-hidden', 'true');
    for (let i = 0; i < n; i++) {
      const row = document.createElement('div');
      row.className = 'skeleton';
      wrap.appendChild(row);
    }
    return wrap;
  };
  // Hand off to the lead form: scroll it into view and focus the name field.
  // Shared by the advisor's "להשאיר פרטים" CTA.
  const handoffToLead = () => {
    const f = $('leadForm');
    if (!f) { location.href = 'index.html#lead'; return; }
    f.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center' });
    const first = $('leadName');
    if (first) setTimeout(() => first.focus({ preventScroll: true }), reduceMotion ? 0 : 400);
  };

  // ── Lead form ──────────────────────────────────────────────────────────────
  // Backend is optional and config-driven: set `window.CHOSECH_SUPABASE =
  // { url, anonKey }` (anon key only — never the service_role key) to POST leads
  // to the Supabase `leads` table. With no config it falls back to a local
  // thank-you so the form always works. No keys are committed to the repo.
  const form = $('leadForm');
  const note = $('leadNote');
  const sendLead = async (lead) => {
    const cfg = window.CHOSECH_SUPABASE;
    if (!cfg || !cfg.url || !cfg.anonKey) return; // backend parked — local-only
    let res;
    try {
      res = await fetch(cfg.url.replace(/\/$/, '') + '/rest/v1/leads', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: cfg.anonKey,
          Authorization: 'Bearer ' + cfg.anonKey,
          Prefer: 'return=minimal',
        },
        body: JSON.stringify(lead),
      });
    } catch (netErr) {
      // fetch itself rejects only on a transport failure — offline, DNS, CORS,
      // a dropped connection. That's distinct from a server that answered with
      // an error status: tell the visitor honestly it's a connection problem,
      // not that their details were rejected.
      const err = new Error('lead network error');
      err.code = 'network';
      throw err;
    }
    // fetch resolves on HTTP errors too — a rejected insert (RLS/validation gate,
    // rate limit, 4xx/5xx) must not be presented to the visitor as success.
    if (!res.ok) {
      let body = '';
      try { body = await res.text(); } catch (_) {}
      const limited = body.includes('rate limit') || body.includes('rate_limit') || res.status === 429;
      const err = new Error('lead rejected: ' + res.status);
      err.code = limited ? 'rate_limited' : 'server_error';
      throw err;
    }
  };
  // Per-field inline error: a <span class="field-error"> placed right after the
  // field (created lazily, id-linked via aria-describedby) + aria-invalid. AT
  // reads the message when focus lands on the flagged field; sighted users see
  // it inline rather than only the single shared note at the bottom.
  const fieldError = (el, msg) => {
    if (!el) return;
    if (msg == null) {
      el.removeAttribute('aria-invalid');
      const ex = el.getAttribute('aria-describedby');
      if (ex) { const n = document.getElementById(ex); if (n && n.classList.contains('field-error')) n.remove(); el.removeAttribute('aria-describedby'); }
      return;
    }
    el.setAttribute('aria-invalid', 'true');
    let id = el.getAttribute('aria-describedby');
    let span = id ? document.getElementById(id) : null;
    if (!span || !span.classList.contains('field-error')) {
      id = (el.id || 'f') + '-err';
      span = document.getElementById(id);
      if (!span) {
        span = document.createElement('span');
        span.id = id;
        span.className = 'field-error';
        (el.parentNode || el).insertBefore(span, el.nextSibling);
      }
      el.setAttribute('aria-describedby', id);
    }
    span.textContent = msg;
  };
  // Israeli mobile: +972/0, then 5X, then 7 more digits — lenient on spaces/dashes.
  const IL_PHONE_RE = /^(\+?972|0)5[0-9](-?\d){7}$/;
  if (form) {
    const nameEl0 = $('leadName');
    const phoneEl0 = $('leadPhone');
    // Clearing the error as the user corrects the field is friendlier than
    // leaving a stale red message until the next submit.
    if (nameEl0) nameEl0.addEventListener('input', () => { if (nameEl0.getAttribute('aria-invalid')) fieldError(nameEl0, null); });
    if (phoneEl0) phoneEl0.addEventListener('input', () => { if (phoneEl0.getAttribute('aria-invalid')) fieldError(phoneEl0, null); });
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      // Honeypot: real users never see/fill #leadCompany (offscreen + aria-hidden
      // + tabindex -1). A filled value means a bot — fake success, skip the POST.
      if (($('leadCompany') && $('leadCompany').value || '').trim()) {
        form.reset();
        if (note) { note.classList.remove('cta__note--err'); note.textContent = 'תודה! נחזור אליך בהקדם ✦'; }
        return;
      }
      const nameEl = $('leadName');
      const phoneEl = $('leadPhone');
      const name = (nameEl && nameEl.value || '').trim();
      const phoneRaw = (phoneEl && phoneEl.value || '').trim();
      // Normalize to digits/+ — the leads gate rejects dots/parens/spaces.
      const phone = phoneRaw.replace(/[^\d+]/g, '');
      // Validate the lenient-spaced raw value against the IL regex, fall back to
      // a digit-count floor so unusual-but-valid inputs aren't over-rejected.
      const nameOk = name.length >= 2 && name.length <= 80;
      const phoneOk = IL_PHONE_RE.test(phoneRaw.replace(/[^\d+\-\s]/g, '')) || phone.replace(/\D/g, '').length >= 9;
      fieldError(nameEl, nameOk ? null : 'נא למלא שם (2–80 תווים)');
      fieldError(phoneEl, phoneOk ? null : 'נא למלא מספר טלפון נייד תקין');
      if (!nameOk || !phoneOk) {
        if (note) { note.classList.add('cta__note--err'); note.textContent = 'נא למלא שם וטלפון תקין 🙏'; }
        toast('נא למלא שם וטלפון תקין', 'error');
        // Move focus to the first invalid field so keyboard/AT users land on it.
        const bad = !nameOk ? nameEl : phoneEl;
        if (bad) bad.focus();
        return;
      }
      // Legal consent gate (Privacy Protection Regulations + Spam/Communications
      // Law): terms + privacy are MANDATORY — block submission without both.
      // Marketing is optional opt-in. The server re-stamps these timestamps
      // authoritatively; we send them so the consent moment is captured client-side.
      const termsEl = $('consentTerms');
      const privacyEl = $('consentPrivacy');
      const termsOk = termsEl && termsEl.checked;
      const privacyOk = privacyEl && privacyEl.checked;
      if (!termsOk || !privacyOk) {
        if (note) { note.classList.add('cta__note--err'); note.textContent = 'יש לאשר את תנאי השימוש ומדיניות הפרטיות כדי להמשיך 🙏'; }
        toast('יש לאשר את תנאי השימוש ומדיניות הפרטיות', 'error');
        const badConsent = !termsOk ? termsEl : privacyEl;
        if (badConsent) badConsent.focus();
        return;
      }
      const now = new Date().toISOString();
      const marketingAt = $('consentMarketing') && $('consentMarketing').checked ? now : null;
      const priceAlert = $('consentPriceAlert') && $('consentPriceAlert').checked;
      const btn = form.querySelector('button[type="submit"]');
      // Disabled "שולח…" state: keep the original label so we can restore it,
      // and prevent a double-submit while the request is in flight.
      let btnLabel = '';
      if (btn) { btnLabel = btn.textContent; btn.disabled = true; btn.classList.add('is-loading'); btn.textContent = 'שולח…'; }
      let leadErrCode = '';
      let sent = true;
      try {
        await sendLead({
          name: name,
          phone: phone,
          source: location.pathname,
          terms_accepted_at: now,
          privacy_accepted_at: now,
          marketing_accepted_at: marketingAt,
          notes: priceAlert ? 'מעוניין/ת בהתראת ירידת מחיר' : null,
        });
      } catch (err) {
        sent = false;
        leadErrCode = (err && err.code) || 'server_error';
      }
      if (btn) { btn.disabled = false; btn.classList.remove('is-loading'); if (btnLabel) btn.textContent = btnLabel; }
      if (!sent) {
        // Fail LOUDLY: honest inline note + an assertive error toast, and actively
        // OFFER the existing WhatsApp fallback CTA (the .cta__wa link already in the
        // markup) — never swallow a failed submit as if it succeeded. The message
        // is truthful about which failure it was: a duplicate (rate-limited), a
        // dropped connection (network), or the server rejecting the insert.
        const errMsg = leadErrCode === 'rate_limited'
          ? 'קיבלנו כבר פנייה מכם — נחזור אליכם בהקדם! אם דחוף, כתבו לנו בוואטסאפ 💬'
          : leadErrCode === 'network'
            ? 'אין חיבור כרגע — בדקו את האינטרנט ונסו שוב, או כתבו לנו בוואטסאפ 💬'
            : 'השליחה נכשלה — נסו שוב, או כתבו לנו בוואטסאפ 💬';
        if (note) { note.classList.add('cta__note--err'); note.textContent = errMsg; }
        const toastMsg = leadErrCode === 'rate_limited'
          ? 'פנייתכם כבר נקלטה — נחזור בהקדם'
          : leadErrCode === 'network'
            ? 'אין חיבור לאינטרנט — נסו שוב בעוד רגע'
            : 'שגיאה — נסו שוב בעוד רגע';
        toast(toastMsg, 'error');
        track('lead_form_error', { source: location.pathname, reason: leadErrCode || 'server_error' });
        // Surface the WhatsApp escape hatch: reveal + emphasise the existing link
        // so it presents itself as the fallback rather than sitting there passively.
        const waCta = (form.closest('.cta__inner, .container') || form.parentElement || document)
          .querySelector('a.cta__wa[href*="wa.me"]');
        if (waCta) {
          waCta.classList.add('cta__wa--offer');
          waCta.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'nearest' });
        }
        if (btn) btn.focus();
        return;
      }
      // Recovered after a prior failure — drop the fallback emphasis so the CTA
      // returns to its resting state on the successful retry.
      const waCtaOk = (form.closest('.cta__inner, .container') || form.parentElement || document)
        .querySelector('a.cta__wa--offer');
      if (waCtaOk) waCtaOk.classList.remove('cta__wa--offer');
      // Canonical lead-conversion event, matching the web app's fireLeadConversion
      // (GA4 `generate_lead`). `lead_source` mirrors the web param; `source` is kept
      // for continuity. No fabricated value/category — the static form has neither.
      track('generate_lead', { lead_source: location.pathname, source: location.pathname, currency: 'ILS' });
      form.reset();
      fieldError(nameEl, null);
      fieldError(phoneEl, null);
      if (note) {
        note.classList.remove('cta__note--err');
        note.textContent = 'תודה ' + name.split(' ')[0] + '! נחזור אליך בהקדם ✦';
      }
      toast('תודה ' + name.split(' ')[0] + '! נחזור אליך בהקדם', 'success');
      // Hot-moment Zoom upsell: right after a successful lead, offer to lock a
      // face-to-face meeting now instead of waiting for the callback.
      if (!document.querySelector('.zoom-upsell')) {
        const up = document.createElement('a');
        up.className = 'zoom-upsell';
        up.href = 'book.html';
        up.innerHTML = '<b>רוצים להקדים?</b> קבעו עכשיו פגישת Zoom חינם עם נציג — 30 דק׳, פנים מול פנים, בלי התחייבות <span aria-hidden="true">←</span>';
        form.insertAdjacentElement('afterend', up);
        track('zoom_upsell_shown', { source: location.pathname });
      }
      showReferralShare();
    });
    // lead_form_start — fires once, the moment the visitor first engages the form.
    // Canonical name matches the web app's LeadForm start event.
    let formStarted = false;
    form.addEventListener('focusin', () => {
      if (formStarted) return;
      formStarted = true;
      track('lead_form_start', { source: location.pathname });
    });
  }

  // ── Referral share (after a successful lead) ───────────────────────────────
  // No backend tracking table for referrals yet — the ?ref= param on the link
  // is the entire mechanic; redeeming/crediting it is a future backend concern.
  function showReferralShare() {
    if ($('referralShare')) return; // already shown (e.g. double submit)
    const cta = form.closest('.cta__inner, .container') || form.parentElement;
    if (!cta) return;
    let code = '';
    try { code = (sessionStorage.getItem('chosechRef') || ''); } catch (_) { /* storage may be blocked */ }
    if (!code) {
      code = Math.random().toString(36).slice(2, 8);
      try { sessionStorage.setItem('chosechRef', code); } catch (_) { /* best-effort */ }
    }
    const waText = encodeURIComponent('גיליתי אתר שמשווה מחירי סלולר/אינטרנט/טלוויזיה וחוסך כסף בלי כאב ראש — שווה לבדוק: https://switchy-ai.com/?ref=' + code);
    const box = document.createElement('p');
    box.id = 'referralShare';
    box.className = 'cta__referral reveal in';
    box.innerHTML = 'מכירים מישהו ששווה לו לחסוך? <a href="https://wa.me/?text=' + waText + '" target="_blank" rel="noopener">שתפו בוואטסאפ ←</a>';
    cta.appendChild(box);
    track('referral_share_shown', { source: location.pathname });
  }

  // ── All-plans filter (plans.html) ──────────────────────────────────────────
  const planGrid = $('planGrid');
  if (planGrid) {
    const cards = Array.from(planGrid.querySelectorAll('.plan'));
    const empty = $('planEmpty');
    const search = $('planSearch');
    const sort = $('planSort');
    const providerSel = $('planProvider');
    const maxPriceInput = $('planMaxPrice');
    const btns = Array.from(document.querySelectorAll('.filter-btn'));
    const flagChips = Array.from(document.querySelectorAll('.flag-chip'));
    const flagKey = { '5g': 'data-5g', nocommit: 'data-nocommit', abroad: 'data-abroad', haspromo: 'data-haspromo', kosher: 'data-kosher' };
    const planCount = $('planCount');
    let cat = 'all';
    const apply = () => {
      const q = (search && search.value || '').trim().toLowerCase();
      const prov = providerSel ? providerSel.value : '';
      const maxPrice = maxPriceInput && maxPriceInput.value ? Number(maxPriceInput.value) : Infinity;
      const activeFlags = flagChips.filter((c) => c.classList.contains('active')).map((c) => c.dataset.flag);
      let shown = 0;
      const visibleCards = [];
      for (const card of cards) {
        const okCat = cat === 'all' || card.dataset.cat === cat;
        const okText = !q || (card.dataset.text || '').includes(q);
        const okFlags = activeFlags.every((f) => card.getAttribute(flagKey[f]) === 'true');
        const okProv = !prov || card.dataset.provider === prov;
        const okPrice = Number(card.dataset.price) <= maxPrice;
        const visible = okCat && okText && okFlags && okProv && okPrice;
        card.style.display = visible ? '' : 'none';
        if (visible) { shown++; visibleCards.push(card); }
      }
      const mode = (sort && sort.value) || 'price-asc';
      visibleCards.sort((a, b) => {
        if (mode === 'price-desc') return Number(b.dataset.price) - Number(a.dataset.price);
        if (mode === 'after-asc') {
          const aa = Number(a.dataset.after || a.dataset.price);
          const ba = Number(b.dataset.after || b.dataset.price);
          return aa - ba;
        }
        return Number(a.dataset.price) - Number(b.dataset.price);
      });
      // Re-order via a fragment so the visible cards reflow once, not per-append.
      const frag = document.createDocumentFragment();
      visibleCards.forEach((card) => frag.appendChild(card));
      planGrid.appendChild(frag);
      if (empty) empty.style.display = shown ? 'none' : 'block';
      if (planCount) planCount.textContent = shown < cards.length ? `${shown} מסלולים נמצאו` : '';
    };
    // Reflect toggle state in ARIA so AT announces the active category/flag, not
    // just the visual .active class.
    const setPressed = (el, on) => el.setAttribute('aria-pressed', String(on));
    btns.forEach((b) => {
      setPressed(b, b.classList.contains('active'));
      b.addEventListener('click', () => {
        btns.forEach((x) => { const on = x === b; x.classList.toggle('active', on); setPressed(x, on); });
        cat = b.dataset.filter;
        apply();
      });
    });
    flagChips.forEach((chip) => {
      setPressed(chip, chip.classList.contains('active'));
      chip.addEventListener('click', () => {
        chip.classList.toggle('active');
        setPressed(chip, chip.classList.contains('active'));
        apply();
      });
    });
    // Debounced: a full grid re-filter on every keystroke is wasteful; settle first.
    if (search) search.addEventListener('input', debounce(apply, 120));
    if (sort) sort.addEventListener('change', apply);
    if (providerSel) providerSel.addEventListener('change', apply);
    if (maxPriceInput) maxPriceInput.addEventListener('input', debounce(apply, 120));
    const emptyReset = $('planEmptyReset');
    if (emptyReset) emptyReset.addEventListener('click', () => {
      cat = 'all';
      btns.forEach((x) => { const on = x.dataset.filter === 'all'; x.classList.toggle('active', on); setPressed(x, on); });
      flagChips.forEach((c) => { c.classList.remove('active'); setPressed(c, false); });
      if (search) search.value = '';
      if (providerSel) providerSel.value = '';
      if (maxPriceInput) maxPriceInput.value = '';
      apply();
    });
    // Pre-fill search from URL ?q= param (for Sitelinks search box / deep links)
    const initQ = new URLSearchParams(location.search).get('q');
    if (initQ && search) { search.value = initQ; }
    apply();
  }

  // ── Side-by-side comparison (compare.html) ──────────────────────────────────
  const compareTable = $('compareTable');
  if (compareTable && Array.isArray(window.__PLANS__)) {
    const escHtml = (s) => String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    const byId = {};
    window.__PLANS__.forEach((p) => { byId[p.id] = p; });
    const picks = [0, 1, 2].map((i) => $('cmp' + i)).filter(Boolean);
    const yes = '<span class="cmp-yes" aria-label="כן">✓</span>';
    const no = '<span class="cmp-no" aria-label="לא">—</span>';
    // Distinct from `no` (—): a missing full-package detail is "not stated on
    // the provider's site", not "none" — conflating them would read a blank
    // setup fee as "free". Collected via the Claude-in-Chrome catalogue pass.
    const na = '<span class="cmp-no">לא מצוין</span>';
    const catName = { cellular: 'סלולר', internet: 'אינטרנט', tv: 'טלוויזיה', triple: 'משולבת', abroad: 'חו״ל' };
    const render = () => {
      const chosen = picks.map((s) => byId[s.value]).filter(Boolean);
      if (!chosen.length) {
        compareTable.innerHTML = '<p class="cmp-empty">בחרו מסלול אחד לפחות כדי להשוות.</p>';
        return;
      }
      const isAbroad = chosen.some((p) => p.cat === 'abroad');
      const per = isAbroad ? 'לחבילה' : 'לחודש';
      // Union of spec keys, preserving first-seen order.
      const specKeys = [];
      chosen.forEach((p) => Object.keys(p.specs || {}).forEach((k) => {
        if (!specKeys.includes(k)) specKeys.push(k);
      }));
      const cols = chosen.map((p) => `<th>${escHtml(p.provider)}<small>${escHtml(p.plan)}</small></th>`).join('');
      const row = (label, cells) =>
        `<tr><th scope="row">${escHtml(label)}</th>${cells.map((c) => `<td>${c}</td>`).join('')}</tr>`;
      // Money runs are bidi-isolated LTR (dir="ltr") so ₪ + digits render on the
      // same side in EVERY column of the RTL table (no more ₪10.9 vs 12₪ drift).
      const priceCell = (p) =>
        `<span class="cmp-price" dir="ltr">₪${escHtml(p.price)}</span><small> ${per}</small>` +
        (p.after && Number(p.after) !== Number(p.price) ? `<small class="cmp-after">ואז <span dir="ltr">₪${escHtml(p.after)}</span></small>` : '');
      // No rating row: per-plan "rating" is a fabricated placeholder (0 real
      // reviews), so we never surface it as a comparison signal.
      const rows = [
        row('קטגוריה', chosen.map((p) => escHtml(catName[p.cat] || p.cat))),
        row('מחיר', chosen.map(priceCell)),
        row('רשת', chosen.map((p) => p.net ? escHtml(p.net) : no)),
        row('5G', chosen.map((p) => p.is5G ? yes : no)),
        row('ללא התחייבות', chosen.map((p) => p.noCommit ? yes : no)),
        row('כולל חו״ל', chosen.map((p) => p.hasAbroad ? yes : no)),
      ];
      specKeys.forEach((k) => {
        rows.push(row(k, chosen.map((p) => (p.specs && p.specs[k] != null) ? escHtml(p.specs[k]) : no)));
      });
      // Full-package detail rows — shown only when at least one chosen plan
      // carries the field, so the table stays clean for categories that don't
      // have it (e.g. no "התקנה" row for cellular). Missing value → "לא מצוין".
      [['התקנה', 'setupFee'], ['ציוד (נתב/ממיר)', 'equipment'], ['מגדיל טווח', 'rangeExtender']]
        .forEach(([label, key]) => {
          if (chosen.some((p) => p[key] != null && p[key] !== '')) {
            rows.push(row(label, chosen.map((p) => (p[key] != null && p[key] !== '') ? escHtml(p[key]) : na)));
          }
        });
      const wa = (p) => 'https://wa.me/972505037537?text=' +
        encodeURIComponent('היי, מעניין אותי ' + p.provider + ' - ' + p.plan + ' (₪' + p.price + ')');
      const ctaRow = `<tr class="cmp-cta-row"><th scope="row"></th>${chosen.map((p) =>
        `<td><a class="plan__cta" target="_blank" rel="noopener" href="${escHtml(wa(p))}">💬 מעוניין/ת ←</a></td>`).join('')}</tr>`;
      compareTable.innerHTML =
        `<table class="cmp-table"><thead><tr><th scope="col"><span class="sr-only">קריטריון</span></th>${cols}</tr></thead><tbody>${rows.join('')}${ctaRow}</tbody></table>`;
    };
    // Initialise from URL params (?p0=id&p1=id&p2=id) so comparisons can be shared.
    const sp = new URLSearchParams(location.search);
    picks.forEach((s, i) => { const v = sp.get('p' + i); if (v && byId[v]) s.value = v; });
    const updateUrl = () => {
      const params = new URLSearchParams();
      picks.forEach((s, i) => { if (s.value) params.set('p' + i, s.value); });
      history.replaceState(null, '', '?' + params.toString());
    };
    const copyBtn = document.createElement('button');
    copyBtn.className = 'btn btn--ghost btn--sm cmp-share';
    copyBtn.textContent = '🔗 שתפו השוואה זו';
    copyBtn.setAttribute('aria-live', 'polite');
    compareTable.insertAdjacentElement('afterend', copyBtn);
    copyBtn.addEventListener('click', () => {
      const ok = () => {
        copyBtn.textContent = '✓ הקישור הועתק!';
        setTimeout(() => { copyBtn.textContent = '🔗 שתפו השוואה זו'; }, 2500);
      };
      const fail = () => {
        // Clipboard API is unavailable on insecure origins / older browsers —
        // tell the user instead of silently doing nothing.
        copyBtn.textContent = '⚠ העתיקו את הכתובת מהדפדפן';
        setTimeout(() => { copyBtn.textContent = '🔗 שתפו השוואה זו'; }, 2500);
      };
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(location.href).then(ok, fail);
        } else { fail(); }
      } catch (_) { fail(); }
      track('compare_share', { source: 'copy_link' });
    });
    picks.forEach((s) => s.addEventListener('change', () => { updateUrl(); render(); }));
    updateUrl();
    render();
  }

  // ── חוסך AI — real Gemini-backed chat (app.html) ────────────────────────────
  // Calls the Supabase Edge Function; falls back to a friendly error bubble
  // (never a fake canned answer) if the call fails or isn't configured.
  // NOTE: the function source lives at supabase/functions/ai-chat, but it was
  // deployed to production under the name "site-ai-chat" — keep this in sync
  // with whatever name is actually live, or rename the deployed function.
  const AI_CHAT_FUNCTION = 'site-ai-chat';
  // Persistent opaque session id (localStorage). Sent with every chat request so
  // the server's ai_sessions table can stitch multi-turn memory across reloads.
  // Opaque + random — never tied to identity; matches the server's
  // ^[A-Za-z0-9_-]{6,64}$ gate. Storage may be blocked (private mode); the chat
  // still works statelessly when this returns ''.
  const aiSessionId = (() => {
    const KEY = 'chosechAiSession';
    try {
      let id = localStorage.getItem(KEY);
      if (!id || !/^[A-Za-z0-9_-]{6,64}$/.test(id)) {
        const rnd = (window.crypto && window.crypto.getRandomValues)
          ? Array.from(window.crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('')
          : (Date.now().toString(36) + Math.random().toString(36).slice(2)).replace(/[^a-z0-9]/gi, '');
        id = ('s' + rnd).slice(0, 64);
        localStorage.setItem(KEY, id);
      }
      return id;
    } catch (_) { return ''; } // storage blocked — memory disabled, chat still works
  })();
  const aiChat = $('aiChat');
  if (aiChat) {
    const aiForm = $('aiChatForm');
    const aiInput = $('aiChatInput');
    const aiHistory = [];
    // Announce new bubbles to assistive tech: the chat log is a polite live
    // region, so each appended user/bot message is read out in turn.
    if (!aiChat.getAttribute('role')) aiChat.setAttribute('role', 'log');
    aiChat.setAttribute('aria-live', 'polite');
    aiChat.setAttribute('aria-atomic', 'false');
    // The header "SWITCHY AI" shortcut (and any deep link to #switchy-ai) should
    // land the user IN the chat with the input focused — so the desktop nav icon
    // opens the agent, not just scrolls near it. Fires on load and on in-page
    // hash clicks from the homepage header.
    const focusAiChat = () => {
      if (location.hash !== '#switchy-ai' || !aiInput) return;
      aiChat.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center' });
      aiInput.focus({ preventScroll: true });
    };
    focusAiChat();
    window.addEventListener('hashchange', focusAiChat);
    const addBubble = (cls, text) => {
      const b = document.createElement('div');
      b.className = 'ai-bubble ' + cls;
      b.textContent = text;
      aiChat.appendChild(b);
      b.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'nearest' });
      return b;
    };
    const addTyping = () => {
      const b = document.createElement('div');
      b.className = 'ai-bubble ai-bubble--bot ai-bubble--typing';
      b.setAttribute('aria-live', 'polite');
      b.setAttribute('aria-label', 'SWITCHY AI כותב תשובה');
      b.innerHTML = '<span></span><span></span><span></span>';
      aiChat.appendChild(b);
      b.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'nearest' });
      return b;
    };
    let aiBusy = false;
    const chips = Array.from(document.querySelectorAll('.ai-chip'));
    // Reflect the in-flight state so chips read as disabled to AT and don't
    // queue a second request mid-answer.
    const setChipsBusy = (busy) => chips.forEach((c) => c.setAttribute('aria-disabled', String(busy)));
    const askAi = async (q) => {
      if (!q || aiBusy) return;
      aiBusy = true;
      setChipsBusy(true);
      if (aiInput) aiInput.setAttribute('aria-busy', 'true');
      addBubble('ai-bubble--me', q);
      const typing = addTyping();
      track('ai_chat_message', { source: location.pathname });
      try {
        const cfg = window.CHOSECH_SUPABASE;
        if (!cfg || !cfg.url) throw new Error('ai chat not configured');
        const body = { message: q, history: aiHistory };
        // Send the opaque session id so the server can load/persist memory.
        if (aiSessionId) body.sessionId = aiSessionId;
        const res = await fetch(cfg.url.replace(/\/$/, '') + '/functions/v1/' + AI_CHAT_FUNCTION, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', apikey: cfg.anonKey, Authorization: 'Bearer ' + cfg.anonKey },
          body: JSON.stringify(body),
        });
        const data = await res.json().catch(() => ({}));
        typing.remove();
        if (!res.ok || !data.reply) throw new Error('ai chat failed: ' + res.status);
        addBubble('ai-bubble--bot', data.reply);
        aiHistory.push({ role: 'user', text: q }, { role: 'bot', text: data.reply });
        if (aiHistory.length > 12) aiHistory.splice(0, aiHistory.length - 12);
        // The server flags a genuine switch/contact intent. Offer to collect a
        // lead — through the SAME mandatory-consent gate the page lead form uses
        // (terms+privacy required; marketing opt-in OFF by default). We never
        // fabricate consent: no consent ⇒ no capture.
        if (data.offerLead && !leadOffered) showLeadOffer();
      } catch (_) {
        typing.remove();
        addBubble('ai-bubble--bot', 'לא הצלחתי להתחבר כרגע — נסו שוב בעוד רגע, או דברו איתנו בוואטסאפ 💬');
      }
      aiBusy = false;
      setChipsBusy(false);
      if (aiInput) { aiInput.removeAttribute('aria-busy'); aiInput.focus(); }
    };

    // ── Consent-gated inline lead capture (server offerLead → form) ────────────
    // Reuses the page's consent contract: terms+privacy MANDATORY, marketing
    // opt-in OPTIONAL and default-OFF. On submit we POST the structured `lead`
    // back to the SAME site-ai-chat function, which captures it (service role)
    // ONLY when consent === true. Consent is NEVER pre-checked or fabricated.
    let leadOffered = false; // show the offer at most once per page load
    const IL_PHONE_RE_AI = /^(\+?972|0)5[0-9](-?\d){7}$/;
    const showLeadOffer = () => {
      if (leadOffered) return;
      leadOffered = true;
      const wrap = document.createElement('form');
      wrap.className = 'ai-lead';
      wrap.setAttribute('novalidate', '');
      wrap.setAttribute('aria-label', 'השארת פרטים ליצירת קשר');
      wrap.innerHTML =
        '<p class="ai-lead__intro">רוצים שנחזור אליכם עם השוואה אישית? השאירו שם וטלפון — חינם, בלי התחייבות.</p>' +
        '<input type="text" class="ai-lead__name" autocomplete="name" maxlength="80" placeholder="שם מלא" aria-label="שם מלא" required />' +
        '<input type="tel" class="ai-lead__phone" autocomplete="tel" inputmode="tel" maxlength="20" placeholder="טלפון (050-0000000)" aria-label="מספר טלפון" required />' +
        '<label class="ai-lead__consent"><input type="checkbox" class="ai-lead__terms" required />' +
        '<span>קראתי ואני מסכים/ה ל<a href="terms.html" target="_blank" rel="noopener">תנאי השימוש</a></span></label>' +
        '<label class="ai-lead__consent"><input type="checkbox" class="ai-lead__privacy" required />' +
        '<span>קראתי ואני מסכים/ה ל<a href="privacy.html" target="_blank" rel="noopener">מדיניות הפרטיות</a></span></label>' +
        '<label class="ai-lead__consent"><input type="checkbox" class="ai-lead__mkt" />' +
        '<span>אשמח לקבל עדכונים, מבצעים והטבות (אופציונלי, ניתן לבטל בכל עת)</span></label>' +
        '<p class="ai-lead__note" role="status" aria-live="polite"></p>' +
        '<button type="submit" class="btn btn--primary ai-lead__submit">שלחו פרטים</button>';
      aiChat.appendChild(wrap);
      wrap.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'nearest' });
      const nameEl = wrap.querySelector('.ai-lead__name');
      const phoneEl = wrap.querySelector('.ai-lead__phone');
      const termsEl = wrap.querySelector('.ai-lead__terms');
      const privacyEl = wrap.querySelector('.ai-lead__privacy');
      const mktEl = wrap.querySelector('.ai-lead__mkt');
      const noteEl = wrap.querySelector('.ai-lead__note');
      const submit = wrap.querySelector('.ai-lead__submit');
      if (nameEl) setTimeout(() => nameEl.focus({ preventScroll: true }), reduceMotion ? 0 : 250);
      const fail = (msg, focusEl) => {
        if (noteEl) { noteEl.classList.add('ai-lead__note--err'); noteEl.textContent = msg; }
        toast(msg, 'error');
        if (focusEl) focusEl.focus();
      };
      wrap.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (wrap.getAttribute('aria-busy') === 'true') return;
        const name = (nameEl && nameEl.value || '').trim();
        const phoneRaw = (phoneEl && phoneEl.value || '').trim();
        const phone = phoneRaw.replace(/[^\d+]/g, '');
        const nameOk = name.length >= 2 && name.length <= 80;
        const phoneOk = IL_PHONE_RE_AI.test(phoneRaw.replace(/[^\d+\-\s]/g, '')) || phone.replace(/\D/g, '').length >= 9;
        if (!nameOk || !phoneOk) { fail('נא למלא שם וטלפון תקין 🙏', !nameOk ? nameEl : phoneEl); return; }
        // MANDATORY consent gate — identical to the page lead form.
        if (!(termsEl && termsEl.checked) || !(privacyEl && privacyEl.checked)) {
          fail('יש לאשר את תנאי השימוש ומדיניות הפרטיות כדי להמשיך 🙏', (termsEl && !termsEl.checked) ? termsEl : privacyEl);
          return;
        }
        const cfg = window.CHOSECH_SUPABASE;
        if (!cfg || !cfg.url || !cfg.anonKey) { fail('השליחה לא זמינה כרגע — דברו איתנו בוואטסאפ 💬'); return; }
        wrap.setAttribute('aria-busy', 'true');
        if (submit) { submit.disabled = true; submit.classList.add('is-loading'); submit.textContent = 'שולח…'; }
        if (noteEl) { noteEl.classList.remove('ai-lead__note--err'); noteEl.textContent = ''; }
        let captured = false;
        try {
          const res = await fetch(cfg.url.replace(/\/$/, '') + '/functions/v1/' + AI_CHAT_FUNCTION, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', apikey: cfg.anonKey, Authorization: 'Bearer ' + cfg.anonKey },
            // A no-op message keeps the endpoint contract (message required) while
            // the structured lead rides along. The server captures only with
            // consent===true and re-stamps the timestamps authoritatively.
            body: JSON.stringify({
              message: 'בקשת יצירת קשר',
              sessionId: aiSessionId || undefined,
              lead: {
                name: name,
                phone: phone,
                consent: true, // terms+privacy confirmed above
                consent_marketing_sms: !!(mktEl && mktEl.checked),
                consent_marketing_whatsapp: !!(mktEl && mktEl.checked),
                notes: 'נשלח מצ׳אט SWITCHY AI באתר',
              },
            }),
          });
          const data = await res.json().catch(() => ({}));
          captured = res.ok && data && data.leadCaptured === true;
        } catch (_) { captured = false; }
        if (submit) { submit.disabled = false; submit.classList.remove('is-loading'); submit.textContent = 'שלחו פרטים'; }
        wrap.removeAttribute('aria-busy');
        if (!captured) { fail('השליחה נכשלה — נסו שוב, או כתבו לנו בוואטסאפ 💬', submit); return; }
        track('ai_lead_submit', { source: location.pathname });
        wrap.remove();
        addBubble('ai-bubble--bot', 'תודה ' + name.split(' ')[0] + '! נחזור אליכם בהקדם עם השוואה אישית ✦');
        toast('תודה! נחזור אליכם בהקדם', 'success');
      });
    };

    chips.forEach((chip) => {
      chip.setAttribute('role', 'button');
      chip.setAttribute('tabindex', '0');
      // Strip the leading emoji/symbol for both the spoken label and the query.
      const label = chip.textContent.replace(/^[^א-ת]+/, '').trim();
      if (label && !chip.getAttribute('aria-label')) chip.setAttribute('aria-label', label);
      const ask = () => { if (chip.getAttribute('aria-disabled') !== 'true') askAi(label); };
      chip.addEventListener('click', ask);
      chip.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); ask(); }
      });
    });
    if (aiForm && aiInput) {
      aiForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const q = aiInput.value.trim();
        if (!q || aiBusy) return;
        aiInput.value = '';
        askAi(q);
      });
    }
  }

  // ══ Premium interactions ══════════════════════════════════════════════════
  // All of these are progressive enhancement: they no-op under reduced-motion
  // or when the target elements are absent, and never block the core flows.

  // ── Scroll-progress bar (injected, not in markup) ──────────────────────────
  if (!reduceMotion) {
    const bar = document.createElement('div');
    bar.className = 'scroll-progress';
    bar.setAttribute('aria-hidden', 'true');
    document.body.appendChild(bar);
    let ticking = false;
    const setProgress = () => {
      const h = document.documentElement;
      const max = h.scrollHeight - h.clientHeight;
      bar.style.setProperty('--p', max > 0 ? (h.scrollTop / max).toFixed(4) : '0');
      ticking = false;
    };
    window.addEventListener('scroll', () => {
      if (!ticking) { ticking = true; requestAnimationFrame(setProgress); }
    }, { passive: true });
    setProgress();
  }

  // ── Scroll-depth analytics ──────────────────────────────────────────────────
  // Fires once per threshold per page load — a coarse read on how far visitors
  // get before bouncing, no per-pixel tracking.
  (() => {
    const thresholds = [25, 50, 75, 100];
    const fired = new Set();
    let ticking = false;
    const check = () => {
      const h = document.documentElement;
      const max = h.scrollHeight - h.clientHeight;
      const pct = max > 0 ? (h.scrollTop / max) * 100 : 100;
      thresholds.forEach((t) => {
        if (pct >= t && !fired.has(t)) { fired.add(t); track('scroll_depth', { depth: t, source: location.pathname }); }
      });
      ticking = false;
    };
    window.addEventListener('scroll', () => {
      if (!ticking) { ticking = true; requestAnimationFrame(check); }
    }, { passive: true });
  })();

  // ── Sticky mobile CTA ────────────────────────────────────────────────────────
  // Appears only after the visitor has scrolled past the first screen, so it
  // doesn't compete with the hero CTA or shift layout during first paint.
  if (form && window.matchMedia('(max-width: 720px)').matches) {
    const stickyBar = document.createElement('div');
    stickyBar.className = 'sticky-cta';
    stickyBar.innerHTML = '<button type="button" class="btn btn--primary">קבלו השוואה חינם ←</button>' +
      // Second thumb-reach action: the Zoom meeting (the closing channel) is
      // always one tap away on mobile.
      '<a class="sticky-cta__zoom" href="book.html" aria-label="תיאום פגישת Zoom חינם עם נציג">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2.5" y="6" width="13" height="12" rx="2.5"/><path d="m15.5 10.5 6-3.5v10l-6-3.5"/></svg></a>';
    document.body.appendChild(stickyBar);
    stickyBar.querySelector('.sticky-cta__zoom').addEventListener('click', () => {
      track('cta_click', { location: 'sticky', label: 'zoom', source: location.pathname });
    });
    const stickyBtn = stickyBar.querySelector('button');
    stickyBtn.addEventListener('click', () => {
      // Canonical CTA-click event, matching the web app's StickyLeadCta
      // (`cta_click` with location:"sticky", label:"lead").
      track('cta_click', { location: 'sticky', label: 'lead', source: location.pathname });
      form.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center' });
      const first = $('leadName');
      if (first) first.focus({ preventScroll: true });
    });
    let visible = false;
    let stickyTicking = false;
    const updateSticky = () => {
      const past = window.scrollY > window.innerHeight * 0.6;
      const formRect = form.getBoundingClientRect();
      const overForm = formRect.top < window.innerHeight && formRect.bottom > 0;
      const show = past && !overForm;
      if (show !== visible) { visible = show; stickyBar.classList.toggle('is-visible', show); }
      stickyTicking = false;
    };
    window.addEventListener('scroll', () => {
      if (!stickyTicking) { stickyTicking = true; requestAnimationFrame(updateSticky); }
    }, { passive: true });
    updateSticky();
  }

  // ── Staggered reveals: index each .reveal within its own section ───────────
  // Per-section (sections don't nest), so each band cascades in from 0 rather
  // than continuing a global counter.
  document.querySelectorAll('section, .footer').forEach((scope) => {
    let i = 0;
    scope.querySelectorAll('.reveal').forEach((el) => {
      if (!el.style.getPropertyValue('--i')) el.style.setProperty('--i', String(Math.min(i++, 6)));
    });
  });

  // ── Pointer-tracking spotlight on cards (feeds CSS --mx/--my) ──────────────
  // rAF-batched: rect read + custom-prop write happen once per frame off the
  // latest pointer position, so a fast pointermove can't force layout per event.
  if (!reduceMotion && window.matchMedia('(hover: hover)').matches) {
    const spotlightSel = '.feature, .step, .cat, .guide-card, .plan, .provider-card';
    let spotCard = null, spotX = 0, spotY = 0;
    const paintSpot = rafThrottle(() => {
      if (!spotCard) return;
      const r = spotCard.getBoundingClientRect();
      spotCard.style.setProperty('--mx', ((spotX - r.left) / r.width * 100).toFixed(1) + '%');
      spotCard.style.setProperty('--my', ((spotY - r.top) / r.height * 100).toFixed(1) + '%');
    });
    document.addEventListener('pointermove', (e) => {
      const card = e.target.closest && e.target.closest(spotlightSel);
      if (!card) return;
      spotCard = card; spotX = e.clientX; spotY = e.clientY;
      paintSpot();
    }, { passive: true });
  }

  // ── Magnetic primary CTAs — the button leans toward the cursor ─────────────
  if (!reduceMotion && window.matchMedia('(hover: hover)').matches) {
    document.querySelectorAll('.btn--primary').forEach((btn) => {
      btn.classList.add('magnetic');
      const strength = 0.28;
      let mx = 0, my = 0;
      const paint = rafThrottle(() => {
        const r = btn.getBoundingClientRect();
        const x = (mx - (r.left + r.width / 2)) * strength;
        const y = (my - (r.top + r.height / 2)) * strength;
        // CSS `translate` composes with the :hover/:active `transform` states —
        // an inline transform here used to clobber the lift and the press.
        btn.style.translate = `${x.toFixed(1)}px ${y.toFixed(1)}px`;
      });
      btn.addEventListener('pointermove', (e) => { mx = e.clientX; my = e.clientY; paint(); });
      btn.addEventListener('pointerleave', () => { btn.style.translate = ''; });
    });
  }

  // ── Savings calculator (calc-*.html) ─────────────────────────────────────
  const calc = $('calc');
  if (calc) {
    const cheapest = Number(calc.dataset.cheapest) || 0;
    const bill = $('calcBill');
    const out = $('calcOut');
    const btn = $('calcBtn');
    const show = (html) => { if (out) { out.style.display = 'block'; out.innerHTML = html; } };
    const catNames = { cellular: 'סלולר', internet: 'אינטרנט', tv: 'טלוויזיה', triple: 'חבילה משולבת', abroad: 'חו"ל' };
    const run = () => {
      const cur = parseFloat(bill && bill.value);
      if (!cur || cur <= 0) { show('הזינו את הסכום שאתם משלמים היום.'); return; }
      const monthly = Math.max(0, cur - cheapest);
      const yearly = monthly * 12;
      const cat = calc.dataset.cat || '';
      const catHref = cat ? cat + '.html' : 'plans.html';
      const catLabel = catNames[cat] || 'מסלולים';
      if (yearly > 0) {
        show('<div class="calc-result">'
          + '<div class="calc-result__row"><span>משלמים היום</span><strong>' + nis(cur) + '/חודש · ' + nis(cur * 12) + '/שנה</strong></div>'
          + '<div class="calc-result__row"><span>מסלול זול ביותר</span><strong>' + nis(cheapest) + '/חודש</strong></div>'
          + '<hr class="calc-result__sep">'
          + '<div class="calc-result__row calc-result__row--main"><span>חיסכון פוטנציאלי</span><strong class="saving">' + nis(monthly) + '/חודש · ' + nis(yearly) + '/שנה</strong></div>'
          + '</div>'
          + '<a href="' + catHref + '" class="btn btn--primary btn--block" style="margin-top:16px">לראות את כל מסלולי ' + catLabel + ' ←</a>'
          + '<p style="margin:8px 0 0;font-size:.8rem;color:#6b7280;text-align:center">הערכה מול המסלול הזול בשוק. המחירים מתעדכנים ברציפות.</p>');
      } else {
        show('<p style="margin:0 0 12px">אתם כבר משלמים פחות מהמסלול הזול שמצאנו — מצוין!</p>'
          + '<a href="' + catHref + '" class="btn btn--ghost btn--block">עדיין שווה להשוות מדי פעם ←</a>');
      }
      track('calc_used', { cat: calc.dataset.cat || '' });
    };
    if (btn) btn.addEventListener('click', run);
    if (bill) bill.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); run(); } });
    const quickBtns = Array.from(document.querySelectorAll('.calc-quick__btn'));
    quickBtns.forEach((qb) => {
      qb.setAttribute('aria-pressed', 'false');
      qb.addEventListener('click', () => {
        if (bill) { bill.value = qb.dataset.val; }
        quickBtns.forEach((b) => { const on = b === qb; b.classList.toggle('active', on); b.setAttribute('aria-pressed', String(on)); });
        run();
      });
    });
  }

  // ── Guide search + category filter (guides.html) ──────────────────────────
  const gs = document.getElementById('guideSearch');
  if (gs) {
    const cards = Array.from(document.querySelectorAll('.guide-card'));
    const sectionEls = Array.from(document.querySelectorAll('main section[aria-label]'));
    const empty = document.getElementById('guideEmpty');
    const catBtns = Array.from(document.querySelectorAll('.guide-cat-filters .filter-btn'));
    let activeCat = 'all';

    // Cache each card's searchable text + owning section once — these never
    // change, so we avoid re-reading textContent/closest() on every filter.
    const cardMeta = cards.map((card) => {
      const sec = card.closest('section[aria-label]');
      return { card, sec, text: card.textContent.toLowerCase(), cat: sec ? sec.getAttribute('aria-label') : null };
    });

    const applyGuideFilters = () => {
      const q = gs.value.trim().toLowerCase();
      let visible = 0;
      const secHasVisible = new Set();
      cardMeta.forEach((m) => {
        const catMatch = activeCat === 'all' || m.cat === activeCat;
        const show = catMatch && (!q || m.text.includes(q));
        m.card.style.display = show ? '' : 'none';
        if (show) { visible++; if (m.sec) secHasVisible.add(m.sec); }
      });
      sectionEls.forEach((sec) => { sec.style.display = secHasVisible.has(sec) ? '' : 'none'; });
      if (empty) empty.style.display = visible === 0 ? 'block' : 'none';
    };

    // Debounced: don't re-scan every card's textContent on each keystroke.
    gs.addEventListener('input', debounce(applyGuideFilters, 120));

    catBtns.forEach((btn) => {
      btn.setAttribute('aria-pressed', String(btn.classList.contains('active')));
      btn.addEventListener('click', () => {
        activeCat = btn.dataset.guideCat || 'all';
        catBtns.forEach((b) => { const on = b === btn; b.classList.toggle('active', on); b.setAttribute('aria-pressed', String(on)); });
        applyGuideFilters();
      });
    });
  }

  // ── Button :active press feedback hook ──────────────────────────────────────
  // CSS owns the visual press (.is-pressed); JS just toggles the hook so even
  // keyboard activation (Space holds the button active) and touch get parity.
  // Delegated + pointer/keys, so it covers buttons injected later (sticky CTA,
  // AI shells). Reduced-motion users still get the class; CSS chooses whether to
  // animate it.
  (() => {
    const isBtn = (t) => t && t.closest && t.closest('button, .btn, [role="button"]');
    const press = (e) => { const b = isBtn(e.target); if (b) b.classList.add('is-pressed'); };
    const release = (e) => {
      const b = isBtn(e.target);
      if (b) b.classList.remove('is-pressed');
    };
    document.addEventListener('pointerdown', press, { passive: true });
    document.addEventListener('pointerup', release, { passive: true });
    document.addEventListener('pointercancel', release, { passive: true });
    document.addEventListener('keydown', (e) => { if (e.key === ' ' || e.key === 'Enter') press(e); });
    document.addEventListener('keyup', (e) => { if (e.key === ' ' || e.key === 'Enter') release(e); });
    // Safety net: clear any lingering pressed state when focus/window leaves.
    window.addEventListener('blur', () => document.querySelectorAll('.is-pressed').forEach((b) => b.classList.remove('is-pressed')));
  })();

  // ── Mega-menu (.mega-menu) — open/close with click, Esc, outside-click, kbd ──
  // A trigger (data-mega-trigger / aria-controls) toggles a .mega-menu panel.
  // aria-expanded mirrors state; Esc and outside-click close and (for Esc)
  // return focus to the trigger. Multiple menus close each other.
  // Keyboard (WAI-ARIA menu-button pattern): Enter/Space/ArrowDown on the trigger
  // opens and focuses the first item; ArrowUp opens and focuses the last. Inside
  // the panel, ArrowDown/ArrowUp roam the links (wrapping), Home/End jump to the
  // ends, Tab lets focus leave (and closes), and Esc closes back to the trigger.
  (() => {
    const menus = Array.from(document.querySelectorAll('.mega-menu'));
    const triggers = Array.from(document.querySelectorAll('.mega__trigger, .nav__item--mega > a[aria-haspopup], [data-mega-trigger], [aria-controls].mega-trigger'));
    if (!menus.length && !triggers.length) return;
    const panelFor = (trigger) => {
      const id = trigger.getAttribute('aria-controls') || trigger.getAttribute('data-mega-trigger');
      return id ? document.getElementById(id) : trigger.parentElement && trigger.parentElement.querySelector('.mega-menu');
    };
    const pairs = triggers.map((t) => ({ trigger: t, panel: panelFor(t) })).filter((p) => p.panel);
    const setOpen = (pair, open) => {
      pair.trigger.setAttribute('aria-expanded', String(open));
      pair.panel.classList.toggle('is-open', open);
      pair.panel.hidden = !open;
    };
    const closeAll = (except) => pairs.forEach((p) => { if (p !== except) setOpen(p, false); });
    // Focusable menu items in a panel, in DOM order (skips disabled/hidden links).
    const itemsOf = (panel) => Array.from(panel.querySelectorAll('a[href], button:not([disabled])'))
      .filter((el) => el.offsetParent !== null || el.getClientRects().length);
    // Move focus to item [i], wrapping around the ends. No-op if the panel is empty.
    const focusItem = (panel, i) => {
      const items = itemsOf(panel);
      if (!items.length) return;
      const n = items.length;
      items[((i % n) + n) % n].focus();
    };
    pairs.forEach((pair) => {
      if (!pair.trigger.hasAttribute('aria-expanded')) pair.trigger.setAttribute('aria-expanded', 'false');
      // No aria-haspopup: the mega panel is a DISCLOSURE of plain links (APG
      // disclosure pattern), not a menu widget — aria-expanded is the contract.
      pair.trigger.removeAttribute('aria-haspopup');
      pair.panel.hidden = pair.panel.classList.contains('is-open') ? false : true;
      const isOpen = () => pair.trigger.getAttribute('aria-expanded') === 'true';
      const open = (focus) => {
        closeAll(pair);
        setOpen(pair, true);
        // focus: 'first' | 'last' | undefined. Wait a frame so the panel is shown
        // (hidden removed) before we move focus into it.
        if (focus) requestAnimationFrame(() => focusItem(pair.panel, focus === 'last' ? -1 : 0));
      };
      // Keyboard activation of an anchor (Enter/Space) also synthesizes a click.
      // We handle those in keydown (to dive into the panel), so mark the moment
      // and let the click handler skip the echo instead of toggling straight back.
      let kbdAt = 0;
      pair.trigger.addEventListener('click', (e) => {
        e.preventDefault();
        if (Date.now() - kbdAt < 400) return; // echo of a just-handled key press
        if (isOpen()) { setOpen(pair, false); } else { open(); }
      });
      // Trigger keys: open + dive into the panel.
      pair.trigger.addEventListener('keydown', (e) => {
        switch (e.key) {
          case 'Escape':
            setOpen(pair, false); pair.trigger.focus(); break;
          case 'ArrowDown':
          case 'Enter':
          case ' ':
          case 'Spacebar': // legacy key name
            e.preventDefault(); kbdAt = Date.now(); open('first'); break;
          case 'ArrowUp':
            e.preventDefault(); kbdAt = Date.now(); open('last'); break;
          default: break;
        }
      });
      // Panel keys: roam the items, or close back to the trigger.
      pair.panel.addEventListener('keydown', (e) => {
        const items = itemsOf(pair.panel);
        const idx = items.indexOf(document.activeElement);
        switch (e.key) {
          case 'Escape':
            setOpen(pair, false); pair.trigger.focus(); break;
          case 'ArrowDown':
            e.preventDefault(); focusItem(pair.panel, idx + 1); break;
          case 'ArrowUp':
            e.preventDefault(); focusItem(pair.panel, idx - 1); break;
          case 'Home':
            e.preventDefault(); focusItem(pair.panel, 0); break;
          case 'End':
            e.preventDefault(); focusItem(pair.panel, -1); break;
          case 'Tab':
            // Let Tab move focus naturally, but close the menu behind it.
            setOpen(pair, false); break;
          default: break;
        }
      });
    });
    // Outside-click closes every open mega-menu.
    document.addEventListener('click', (e) => {
      const inside = pairs.some((p) => p.panel.contains(e.target) || p.trigger.contains(e.target));
      if (!inside) closeAll(null);
    });
  })();

  // ── TOC scrollspy (.toc) — highlight the section in view ────────────────────
  // IntersectionObserver tracks which target heading/section is currently in
  // the viewport; the matching .toc a gets .toc__link--active + aria-current.
  // Smooth in-page scroll on click (reduced-motion: instant). Degrades to no-op
  // without IO support.
  (() => {
    const toc = document.querySelector('.toc');
    if (!toc) return;
    const links = Array.from(toc.querySelectorAll('a[href^="#"]'));
    if (!links.length) return;
    const targets = links
      .map((a) => { const id = decodeURIComponent(a.getAttribute('href').slice(1)); return { a, el: id && document.getElementById(id) }; })
      .filter((t) => t.el);
    if (!targets.length) return;
    const setActive = (a) => {
      links.forEach((l) => {
        const on = l === a;
        l.classList.toggle('toc__link--active', on);
        if (on) l.setAttribute('aria-current', 'true'); else l.removeAttribute('aria-current');
      });
    };
    // Smooth-scroll on click and move active immediately for snappy feedback.
    targets.forEach((t) => {
      t.a.addEventListener('click', (e) => {
        e.preventDefault();
        setActive(t.a);
        t.el.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
        // Make the heading focusable for keyboard users landing on it.
        if (!t.el.hasAttribute('tabindex')) t.el.setAttribute('tabindex', '-1');
        t.el.focus({ preventScroll: true });
        history.replaceState(null, '', t.a.getAttribute('href'));
      });
    });
    if (!('IntersectionObserver' in window)) { setActive(targets[0].a); return; }
    // Track the topmost intersecting target. Top-anchored rootMargin so a
    // heading counts as "current" once it reaches the upper third of the screen.
    const visible = new Map();
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        if (en.isIntersecting) visible.set(en.target, en.boundingClientRect.top);
        else visible.delete(en.target);
      });
      if (!visible.size) return;
      let topEl = null, topY = Infinity;
      visible.forEach((y, el) => { if (y < topY) { topY = y; topEl = el; } });
      const match = targets.find((t) => t.el === topEl);
      if (match) setActive(match.a);
    }, { rootMargin: '0px 0px -65% 0px', threshold: 0 });
    targets.forEach((t) => io.observe(t.el));
  })();

  // ── AI tool: Plan Advisor (#advisorOpen / .advisor) ─────────────────────────
  // Multi-step form collecting {category,budget,priority,lines,abroad}, then
  // POST site-plan-advisor and render recommendations (with annualSaving).
  // Skeleton while loading; "להשאיר פרטים" hands off to the lead form; fails
  // soft with a Hebrew toast. The shell builds its own UI inside the host so it
  // works even when only the container markup exists.
  (() => {
    const host = $('advisorOpen') || document.querySelector('.advisor');
    if (!host) return;
    const STEPS = [
      { key: 'category', q: 'מה מעניין אתכם?', type: 'choice', options: [
        ['cellular', 'סלולר'], ['internet', 'אינטרנט'], ['tv', 'טלוויזיה'], ['triple', 'משולבת'], ['abroad', 'חו״ל'] ] },
      { key: 'budget', q: 'מה התקציב החודשי המשוער?', type: 'choice', options: [
        ['50', 'עד ₪50'], ['100', '₪50–100'], ['150', '₪100–150'], ['9999', '₪150+'] ] },
      { key: 'priority', q: 'מה הכי חשוב לכם?', type: 'choice', options: [
        ['price', 'המחיר הזול ביותר'], ['data', 'הרבה גלישה'], ['balanced', 'שירות ויציבות'], ['noCommit', 'בלי התחייבות'] ] },
      { key: 'lines', q: 'כמה קווים / מנויים?', type: 'choice', options: [
        ['1', 'אחד'], ['2', 'שניים'], ['3', 'שלושה'], ['4', 'ארבעה ומעלה'] ] },
      { key: 'abroad', q: 'צריך גם חבילת חו״ל?', type: 'choice', options: [
        ['yes', 'כן'], ['no', 'לא'] ] },
    ];
    const answers = {};
    let idx = 0;
    let busy = false;
    const stage = document.createElement('div');
    stage.className = 'advisor__stage';
    stage.setAttribute('aria-live', 'polite');
    host.appendChild(stage);

    const renderStep = () => {
      const step = STEPS[idx];
      stage.innerHTML = '';
      const wrap = document.createElement('div');
      wrap.className = 'advisor__step';
      wrap.setAttribute('role', 'group');
      const progress = document.createElement('p');
      progress.className = 'advisor__progress';
      progress.textContent = 'שלב ' + (idx + 1) + ' מתוך ' + STEPS.length;
      const heading = document.createElement('h3');
      heading.className = 'advisor__q';
      heading.textContent = step.q;
      wrap.setAttribute('aria-label', step.q);
      const opts = document.createElement('div');
      opts.className = 'advisor__options';
      step.options.forEach(([val, label]) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'btn btn--ghost advisor__option';
        b.textContent = label;
        b.addEventListener('click', () => {
          answers[step.key] = val;
          if (idx < STEPS.length - 1) { idx++; renderStep(); }
          else submit();
        });
        opts.appendChild(b);
      });
      wrap.appendChild(progress);
      wrap.appendChild(heading);
      wrap.appendChild(opts);
      if (idx > 0) {
        const back = document.createElement('button');
        back.type = 'button';
        back.className = 'btn btn--ghost btn--sm advisor__back';
        back.textContent = '→ חזרה';
        back.addEventListener('click', () => { idx--; renderStep(); });
        wrap.appendChild(back);
      }
      stage.appendChild(wrap);
      const firstOpt = opts.querySelector('button');
      if (firstOpt) firstOpt.focus({ preventScroll: true });
    };

    const renderRecs = (data) => {
      stage.innerHTML = '';
      const recs = (data && Array.isArray(data.recommendations)) ? data.recommendations : [];
      const head = document.createElement('h3');
      head.className = 'advisor__q';
      head.textContent = recs.length ? 'ההמלצות שלנו עבורכם' : 'לא מצאנו התאמה מדויקת';
      stage.appendChild(head);
      if (data && data.followup) {
        const fu = document.createElement('p');
        fu.className = 'advisor__followup';
        fu.textContent = data.followup;
        stage.appendChild(fu);
      }
      const list = document.createElement('div');
      list.className = 'advisor__recs';
      recs.forEach((r) => {
        const card = document.createElement('article');
        card.className = 'advisor__rec';
        const title = document.createElement('h4');
        title.textContent = (r.provider ? r.provider + ' · ' : '') + (r.name || '');
        const price = document.createElement('p');
        price.className = 'advisor__rec-price';
        if (r.price != null) price.textContent = '₪' + r.price + ' לחודש';
        const saving = document.createElement('p');
        if (r.annualSaving != null && Number(r.annualSaving) > 0) {
          saving.className = 'advisor__rec-saving';
          saving.textContent = 'חיסכון שנתי משוער: ' + nis(Number(r.annualSaving));
        }
        const reason = document.createElement('p');
        reason.className = 'advisor__rec-reason';
        if (r.reason) reason.textContent = r.reason;
        card.appendChild(title);
        if (r.price != null) card.appendChild(price);
        if (saving.textContent) card.appendChild(saving);
        if (r.reason) card.appendChild(reason);
        list.appendChild(card);
      });
      stage.appendChild(list);
      const actions = document.createElement('div');
      actions.className = 'advisor__actions';
      const lead = document.createElement('button');
      lead.type = 'button';
      lead.className = 'btn btn--primary';
      lead.textContent = 'להשאיר פרטים →';
      lead.addEventListener('click', handoffToLead);
      const again = document.createElement('button');
      again.type = 'button';
      again.className = 'btn btn--ghost';
      again.textContent = 'להתחיל מחדש';
      again.addEventListener('click', () => { idx = 0; for (const k in answers) delete answers[k]; renderStep(); });
      actions.appendChild(lead);
      actions.appendChild(again);
      stage.appendChild(actions);
    };

    async function submit() {
      if (busy) return;
      busy = true;
      stage.innerHTML = '';
      stage.appendChild(skeletonRows(3));
      try {
        const data = await callAiFunction('site-plan-advisor', {
          answers: {
            category: answers.category,
            budget: answers.budget,
            priority: answers.priority,
            lines: answers.lines,
            abroad: answers.abroad,
          },
        });
        track('advisor_used', { category: answers.category || '' });
        renderRecs(data);
      } catch (_) {
        toast('היועץ החכם לא זמין כרגע — נסו שוב בעוד רגע', 'error');
        renderStep(); // back to the last question so the user can retry
      }
      busy = false;
    }

    renderStep();
  })();

  // ── AI tool: Bill Analyzer (#billDrop / .bill-drop) ─────────────────────────
  // Accept an image (file input + drag/drop), read as base64, POST
  // site-bill-analyzer, render provider/currentSpend/suggestions. Skeleton while
  // loading; strict single-submit; fails soft with a Hebrew toast.
  (() => {
    const drop = $('billDrop') || document.querySelector('.bill-drop');
    if (!drop) return;
    let input = drop.querySelector('input[type="file"]');
    if (!input) {
      input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.className = 'bill-drop__input';
      input.id = 'billDropInput';
      input.setAttribute('aria-label', 'העלאת צילום חשבון');
      drop.appendChild(input);
    } else {
      input.accept = input.accept || 'image/*';
    }
    let result = drop.querySelector('.bill-drop__result');
    if (!result) {
      result = document.createElement('div');
      result.className = 'bill-drop__result';
      result.setAttribute('aria-live', 'polite');
      drop.appendChild(result);
    }
    // Keyboard affordance: the click + keydown handlers below open the picker;
    // the <label for="billFile"> + aria-label name the zone for AT. Deliberately
    // NO role here — a <label> must not carry role="button" (invalid ARIA that
    // fails the Lighthouse "Accessibility tree is not well-formed" audit).
    if (!drop.hasAttribute('tabindex')) drop.setAttribute('tabindex', '0');
    if (!drop.hasAttribute('aria-label')) drop.setAttribute('aria-label', 'גררו לכאן צילום חשבון, או הקישו לבחירת קובץ');
    let busy = false;

    const readAsBase64 = (file) => new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(String(fr.result || ''));
      fr.onerror = () => reject(new Error('read failed'));
      fr.readAsDataURL(file);
    });

    const renderResult = (data) => {
      result.innerHTML = '';
      const head = document.createElement('h3');
      head.className = 'bill-drop__title';
      head.textContent = 'מה מצאנו בחשבון';
      result.appendChild(head);
      const summary = document.createElement('p');
      summary.className = 'bill-drop__summary';
      const parts = [];
      if (data && data.provider) parts.push('ספק נוכחי: ' + data.provider);
      if (data && data.currentSpend != null) parts.push('תשלום נוכחי: ' + nis(Number(data.currentSpend)));
      summary.textContent = parts.join(' · ') || 'לא זוהו פרטי חשבון.';
      result.appendChild(summary);
      const suggestions = (data && Array.isArray(data.suggestions)) ? data.suggestions : [];
      if (suggestions.length) {
        const list = document.createElement('div');
        list.className = 'bill-drop__suggestions';
        suggestions.forEach((s) => {
          const card = document.createElement('article');
          card.className = 'bill-drop__suggestion';
          const title = document.createElement('h4');
          title.textContent = (s.provider ? s.provider + ' · ' : '') + (s.name || '');
          card.appendChild(title);
          if (s.price != null) {
            const p = document.createElement('p');
            p.className = 'bill-drop__suggestion-price';
            p.textContent = '₪' + s.price + ' לחודש';
            card.appendChild(p);
          }
          if (s.annualSaving != null && Number(s.annualSaving) > 0) {
            const sv = document.createElement('p');
            sv.className = 'bill-drop__suggestion-saving';
            sv.textContent = 'חיסכון שנתי משוער: ' + nis(Number(s.annualSaving));
            card.appendChild(sv);
          }
          list.appendChild(card);
        });
        result.appendChild(list);
      }
      const cta = document.createElement('button');
      cta.type = 'button';
      cta.className = 'btn btn--primary';
      cta.textContent = 'להשאיר פרטים →';
      cta.addEventListener('click', handoffToLead);
      result.appendChild(cta);
    };

    const analyze = async (file) => {
      if (busy) return;
      if (!file || !/^image\//.test(file.type)) { toast('נא להעלות תמונה של החשבון', 'error'); return; }
      busy = true;
      drop.classList.add('is-loading');
      result.innerHTML = '';
      result.appendChild(skeletonRows(3));
      try {
        const imageBase64 = await readAsBase64(file);
        const data = await callAiFunction('site-bill-analyzer', { imageBase64: imageBase64 });
        track('bill_analyzed', { source: location.pathname });
        renderResult(data);
      } catch (_) {
        result.innerHTML = '';
        toast('ניתוח החשבון לא זמין כרגע — נסו שוב בעוד רגע', 'error');
      }
      drop.classList.remove('is-loading');
      busy = false;
    };

    input.addEventListener('change', () => { if (input.files && input.files[0]) analyze(input.files[0]); });
    drop.addEventListener('click', (e) => { if (e.target !== input && !busy) input.click(); });
    drop.addEventListener('keydown', (e) => {
      if ((e.key === 'Enter' || e.key === ' ') && !busy) { e.preventDefault(); input.click(); }
    });
    ['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => {
      e.preventDefault(); drop.classList.add('is-dragover');
    }));
    ['dragleave', 'dragend'].forEach((ev) => drop.addEventListener(ev, () => drop.classList.remove('is-dragover')));
    drop.addEventListener('drop', (e) => {
      e.preventDefault();
      drop.classList.remove('is-dragover');
      const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (file && !busy) analyze(file);
    });
  })();

  // ── AI tool: Subscribe (#subscribeForm / .subscribe) ────────────────────────
  // Email + consent checkbox → POST site-subscribe, toast on success. Fails soft
  // with a Hebrew toast. Single-submit while in flight.
  (() => {
    const form2 = $('subscribeForm') || document.querySelector('.subscribe form, form.subscribe');
    if (!form2) return;
    const emailEl = form2.querySelector('input[type="email"], #subscribeEmail');
    const consentEl = form2.querySelector('input[type="checkbox"], #subscribeConsent');
    const btn = form2.querySelector('button[type="submit"], button:not([type])');
    const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    let busy = false;
    form2.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (busy) return;
      const email = (emailEl && emailEl.value || '').trim();
      // Never fabricate consent: if the checkbox is somehow absent, default to
      // false (fail-closed) rather than auto-asserting it. The server re-checks.
      const consent = consentEl ? !!consentEl.checked : false;
      if (!EMAIL_RE.test(email)) {
        if (emailEl) { emailEl.setAttribute('aria-invalid', 'true'); emailEl.focus(); }
        toast('נא להזין כתובת אימייל תקינה', 'error');
        return;
      }
      if (emailEl) emailEl.removeAttribute('aria-invalid');
      if (consentEl && !consent) {
        consentEl.focus();
        toast('יש לאשר קבלת עדכונים כדי להירשם', 'error');
        return;
      }
      busy = true;
      let btnLabel = '';
      if (btn) { btnLabel = btn.textContent; btn.disabled = true; btn.classList.add('is-loading'); btn.textContent = 'נרשם…'; }
      try {
        await callAiFunction('site-subscribe', { email: email, consent: consent });
        track('subscribed', { source: location.pathname });
        form2.reset();
        toast('נרשמתם בהצלחה! נעדכן אתכם בהזדמנויות חיסכון', 'success');
      } catch (_) {
        toast('ההרשמה נכשלה — נסו שוב בעוד רגע', 'error');
      }
      if (btn) { btn.disabled = false; btn.classList.remove('is-loading'); if (btnLabel) btn.textContent = btnLabel; }
      busy = false;
    });
  })();

  // ── Shared Supabase REST helper ─────────────────────────────────────────────
  // Read/write the SAME Supabase the app uses, so community + bookings stay in
  // sync with the app automatically. anon key only — RLS + edge guards live on
  // the server. Returns parsed JSON; throws on missing config or non-2xx so
  // callers can fail soft with a Hebrew message.
  const sbRest = async (path, opts = {}) => {
    const cfg = window.CHOSECH_SUPABASE;
    if (!cfg || !cfg.url || !cfg.anonKey) throw new Error('supabase not configured');
    const res = await fetch(cfg.url.replace(/\/$/, '') + '/rest/v1/' + path.replace(/^\//, ''), {
      method: opts.method || 'GET',
      headers: Object.assign({
        apikey: cfg.anonKey,
        Authorization: 'Bearer ' + cfg.anonKey,
        'Content-Type': 'application/json',
      }, opts.headers || {}),
      body: opts.body != null ? JSON.stringify(opts.body) : undefined,
    });
    if (!res.ok) {
      // Surface the server's message (guard errors carry a Hebrew/explainable
      // reason) so the caller can show it verbatim.
      let detail = '';
      try { const j = await res.json(); detail = j.message || j.error || j.hint || ''; } catch (_) { /* non-JSON */ }
      const err = new Error('rest ' + res.status + (detail ? ': ' + detail : ''));
      err.status = res.status;
      err.detail = detail;
      throw err;
    }
    if (res.status === 204) return null;
    return res.json().catch(() => null);
  };

  // Escape user-authored text before it touches innerHTML — community posts,
  // replies and reviews are arbitrary strings from other users.
  const escHtmlS = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  // User-supplied URLs (avatars, post media) go into src attributes — escaping
  // alone won't neutralise a javascript:/data:text URL there. Allow only plain
  // https or inline images; anything else renders as no media at all.
  const safeMediaUrl = (u) => {
    const s = String(u == null ? '' : u).trim();
    return (/^https:\/\//i.test(s) || /^data:image\//i.test(s)) ? s : '';
  };

  // Hebrew relative time — "לפני N דקות/שעות/ימים", falling back to a date.
  const relTimeHe = (iso) => {
    const t = Date.parse(iso);
    if (!Number.isFinite(t)) return '';
    const diff = Date.now() - t;
    const sec = Math.round(diff / 1000);
    if (sec < 60) return 'עכשיו';
    const min = Math.round(sec / 60);
    if (min < 60) return 'לפני ' + min + (min === 1 ? ' דקה' : ' דקות');
    const hr = Math.round(min / 60);
    if (hr < 24) return 'לפני ' + hr + (hr === 1 ? ' שעה' : ' שעות');
    const day = Math.round(hr / 24);
    if (day < 7) return 'לפני ' + day + (day === 1 ? ' יום' : ' ימים');
    const wk = Math.round(day / 7);
    if (day < 30) return 'לפני ' + wk + (wk === 1 ? ' שבוע' : ' שבועות');
    try { return new Date(t).toLocaleDateString('he-IL', { day: 'numeric', month: 'long' }); } catch (_) { return ''; }
  };

  // ── (1) COMMUNITY — read-only mirror of the app's community + ratings ───────
  // Posts, replies and provider ratings are public-read in Supabase (anon RLS).
  // Posting/replying needs app sign-in, so we surface a download CTA instead.
  (() => {
    const feed = $('communityFeed');
    const ratingsHost = $('ratingsSummary');
    if (!feed && !ratingsHost) return; // not on this page

    // Live community stats strip — ships hidden and only reveals once a real
    // number lands (fail-soft: no data, no strip; nothing is fabricated).
    const statsBox = $('communityStats');
    const setStat = (id, txt) => {
      const el = $(id);
      if (!el || !txt) return;
      el.textContent = txt;
      if (statsBox) statsBox.hidden = false;
    };

    // Channel chip for a post (falls back to "כללי" when unset).
    const channelChip = (ch) =>
      '<span class="post-card__channel">' + escHtmlS(ch || 'כללי') + '</span>';

    const mediaHtml = (type, url) => {
      const safe = type === 'image' ? safeMediaUrl(url) : '';
      if (!safe) return '';
      // Only the safe URL forms; escape the attribute. The img is decorative
      // context for the post body, so alt stays empty.
      return '<div class="post-card__media"><img src="' + escHtmlS(safe) +
        '" alt="" loading="lazy" decoding="async"></div>';
    };

    // ── Replies (lazy, on expand) ─────────────────────────────────────────────
    const renderReplies = (box, replies) => {
      if (!replies || !replies.length) {
        box.innerHTML = '<p class="post-card__noreplies">אין עדיין תגובות — הצטרפו לדיון באפליקציה.</p>';
        return;
      }
      box.innerHTML = replies.map((r) =>
        '<div class="reply">' +
          '<div class="reply__head"><strong class="reply__author">' + escHtmlS(r.author || 'אנונימי') + '</strong>' +
          '<time class="reply__time">' + escHtmlS(relTimeHe(r.created_at)) + '</time></div>' +
          '<div class="reply__body">' + escHtmlS(r.body || '') + '</div>' +
          mediaHtml(r.media_type, r.media_url) +
        '</div>'
      ).join('');
    };

    const loadReplies = async (post, box, toggleBtn) => {
      box.innerHTML = '<p class="post-card__noreplies">טוען תגובות…</p>';
      try {
        const replies = await sbRest('community_replies?select=id,author,body,media_type,media_url,created_at' +
          '&is_flagged=eq.false&post_id=eq.' + encodeURIComponent(post.id) + '&order=created_at.asc');
        renderReplies(box, replies);
      } catch (_) {
        box.innerHTML = '<p class="post-card__noreplies">לא הצלחנו לטעון תגובות כרגע.</p>';
      }
      if (toggleBtn) toggleBtn.setAttribute('aria-expanded', 'true');
    };

    // ── A single post card ────────────────────────────────────────────────────
    const renderPost = (post) => {
      const card = document.createElement('article');
      card.className = 'post-card';
      card.id = 'post-' + String(post.id);
      const avatarUrl = safeMediaUrl(post.avatar);
      const avatar = avatarUrl
        ? '<img class="post-card__avatar" src="' + escHtmlS(avatarUrl) + '" alt="" loading="lazy" decoding="async">'
        : '<span class="post-card__avatar post-card__avatar--ph" aria-hidden="true">' +
            escHtmlS((post.author || '?').trim().charAt(0) || '?') + '</span>';
      const repliesId = 'replies-' + escHtmlS(String(post.id));
      card.innerHTML =
        '<header class="post-card__head">' +
          avatar +
          '<div class="post-card__meta"><strong class="post-card__author">' + escHtmlS(post.author || 'אנונימי') + '</strong>' +
          channelChip(post.channel) + '</div>' +
          '<time class="post-card__time">' + escHtmlS(relTimeHe(post.created_at)) + '</time>' +
        '</header>' +
        '<div class="post-card__body">' + escHtmlS(post.body || '') + '</div>' +
        mediaHtml(post.media_type, post.media_url) +
        '<div class="post-card__actions">' +
        '<button type="button" class="post-card__toggle" aria-expanded="false" aria-controls="' + repliesId + '">הצגת תגובות</button>' +
        '<a class="post-card__share" target="_blank" rel="noopener" aria-label="שיתוף הפוסט בוואטסאפ" href="https://wa.me/?text=' +
          encodeURIComponent('מהקהילה של SWITCHY: "' + String(post.body || '').slice(0, 120) + '" — ' +
            'https://switchy-ai.com/community.html#post-' + String(post.id)) + '">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 11.5a8.4 8.4 0 0 1-9 8 9 9 0 0 1-3.8-.8L3 20l1.3-3.9A8 8 0 0 1 3.5 11 8.4 8.4 0 0 1 12 3a8.4 8.4 0 0 1 9 8.5z"/></svg> שיתוף</a>' +
        '<a class="post-card__report" aria-label="דיווח על תוכן בעייתי בפוסט הזה" href="mailto:hello@switchy-ai.com?subject=' +
          encodeURIComponent('דיווח על פוסט בקהילה #' + String(post.id)) + '&body=' +
          encodeURIComponent('אני מדווח/ת על הפוסט: https://switchy-ai.com/community.html#post-' + String(post.id) + '\nהסיבה: ') + '">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 21V4"/><path d="M4 4h13l-2.5 4L17 12H4"/></svg> דיווח</a>' +
        '</div>' +
        '<div class="post-card__replies" id="' + repliesId + '" hidden></div>';

      const toggleBtn = card.querySelector('.post-card__toggle');
      const repliesBox = card.querySelector('.post-card__replies');
      let loaded = false;
      toggleBtn.addEventListener('click', () => {
        const open = repliesBox.hidden;
        repliesBox.hidden = !open;
        toggleBtn.textContent = open ? 'הסתרת תגובות' : 'הצגת תגובות';
        toggleBtn.setAttribute('aria-expanded', String(open));
        if (open && !loaded) { loaded = true; loadReplies(post, repliesBox, toggleBtn); }
      });
      return card;
    };

    // ── Feed + channel filter ────────────────────────────────────────────────
    if (feed) {
      let allPosts = [];
      let activeChannel = '';
      const filterRow = $('communityFilter') || document.querySelector('.community__filter');

      const paintFeed = () => {
        const list = activeChannel ? allPosts.filter((p) => p.channel === activeChannel) : allPosts;
        feed.innerHTML = '';
        if (!list.length) {
          feed.innerHTML = '<p class="community__empty">אין עדיין פוסטים בערוץ הזה — היו הראשונים באפליקציה.</p>';
          return;
        }
        const frag = document.createDocumentFragment();
        list.forEach((p) => frag.appendChild(renderPost(p)));
        feed.appendChild(frag);
      };

      const buildFilter = () => {
        if (!filterRow) return;
        // Prefer wiring the pre-rendered channel buttons (their Hebrew labels are nicer
        // than the raw channel keys); only build chips dynamically if none exist.
        const staticChans = Array.from(filterRow.querySelectorAll('.community__chan, [data-channel]'));
        if (staticChans.length) {
          staticChans.forEach((b) => {
            b.addEventListener('click', () => {
              const dc = b.getAttribute('data-channel') || '';
              activeChannel = (dc === 'all' || dc === '') ? '' : dc;
              staticChans.forEach((c) => {
                const on = c === b;
                c.classList.toggle('community__chan--active', on);
                c.setAttribute('aria-pressed', String(on));
              });
              paintFeed();
            });
          });
          return;
        }
        const channels = [];
        allPosts.forEach((p) => { if (p.channel && !channels.includes(p.channel)) channels.push(p.channel); });
        if (!channels.length) return;
        const mk = (val, label) => {
          const b = document.createElement('button');
          b.type = 'button';
          b.className = 'chip community__chip';
          b.textContent = label;
          b.setAttribute('aria-pressed', String(val === activeChannel));
          b.addEventListener('click', () => {
            activeChannel = val;
            Array.from(filterRow.children).forEach((c) => c.setAttribute('aria-pressed', String(c === b)));
            paintFeed();
          });
          return b;
        };
        filterRow.innerHTML = '';
        filterRow.appendChild(mk('', 'הכל'));
        channels.forEach((ch) => filterRow.appendChild(mk(ch, ch)));
      };

      const skeletons = '<div class="post-skel" aria-hidden="true"><i></i><i></i><i></i></div>'.repeat(3);
      const loadFeed = async () => {
        feed.setAttribute('aria-busy', 'true');
        feed.innerHTML = skeletons;
        try {
          const posts = await sbRest('community_posts?select=id,author,avatar,channel,body,media_type,media_url,created_at' +
            '&is_flagged=eq.false&order=created_at.desc&limit=30');
          allPosts = Array.isArray(posts) ? posts : [];
          if (allPosts.length) setStat('statPosts', allPosts.length >= 30 ? '30+' : String(allPosts.length));
          buildFilter();
          paintFeed();
        } catch (_) {
          // A calm contained card, not floating red text — red is for user errors.
          feed.innerHTML = '<div class="load-error"><p>לא הצלחנו לטעון את הקהילה כרגע.</p>' +
            '<button type="button" class="btn btn--ghost" id="feedRetry">נסו שוב</button></div>';
          const retry = feed.querySelector('#feedRetry');
          if (retry) retry.addEventListener('click', loadFeed, { once: true });
        }
        feed.removeAttribute('aria-busy');
      };
      loadFeed();
    }

    // ── Provider ratings + recent reviews ────────────────────────────────────
    if (ratingsHost) {
      // The build emits #ratingsSummary but not a reviews container — self-heal one
      // right after it so recent reviews have somewhere to render.
      let reviewsHost = $('reviewsList');
      if (!reviewsHost) {
        reviewsHost = document.createElement('div');
        reviewsHost.id = 'reviewsList';
        reviewsHost.className = 'reviews';
        if (ratingsHost.parentNode) ratingsHost.parentNode.insertBefore(reviewsHost, ratingsHost.nextSibling);
      }
      const stars = (avg) => {
        const v = Math.max(0, Math.min(5, Number(avg) || 0));
        const full = Math.round(v);
        let out = '';
        for (let i = 1; i <= 5; i++) out += i <= full ? '★' : '☆';
        return '<span class="rating-card__stars" aria-hidden="true">' + out + '</span>';
      };

      const loadRatings = async () => {
        ratingsHost.setAttribute('aria-busy', 'true');
        ratingsHost.innerHTML = '<div class="post-skel" aria-hidden="true"><i></i><i></i><i></i></div>';
        try {
          const rows = await sbRest('provider_rating_summary?select=*');
          const summary = Array.isArray(rows) ? rows.slice() : [];
          summary.sort((a, b) => (Number(b.avg_stars) || 0) - (Number(a.avg_stars) || 0));
          const totalReviews = summary.reduce((n, r) => n + (Number(r.review_count) || 0), 0);
          if (totalReviews) setStat('statReviews', String(totalReviews));
          if (summary.length) setStat('statProviders', String(summary.length));
          if (!summary.length) {
            ratingsHost.innerHTML = '<p class="ratings__empty">אין עדיין מספיק דירוגים — דרגו ספקים באפליקציה.</p>';
          } else {
            ratingsHost.innerHTML = '<div class="ratings__grid">' + summary.map((r) => {
              const avg = (Number(r.avg_stars) || 0).toFixed(1);
              const count = Number(r.review_count) || 0;
              return '<div class="rating-card">' +
                '<strong class="rating-card__provider">' + escHtmlS(r.provider) + '</strong>' +
                stars(r.avg_stars) +
                '<span class="rating-card__score" aria-label="' + escHtmlS(avg) + ' מתוך 5 כוכבים">' + escHtmlS(avg) + '</span>' +
                '<span class="rating-card__count">' + count + (count === 1 ? ' חוות דעת' : ' חוות דעת') + '</span>' +
                '</div>';
            }).join('') + '</div>';
          }
        } catch (_) {
          ratingsHost.innerHTML = '<div class="load-error"><p>לא הצלחנו לטעון דירוגים כרגע.</p>' +
            '<button type="button" class="btn btn--ghost" id="ratingsRetry">נסו שוב</button></div>';
          const retry = ratingsHost.querySelector('#ratingsRetry');
          if (retry) retry.addEventListener('click', loadRatings, { once: true });
        }
        ratingsHost.removeAttribute('aria-busy');
      };
      loadRatings();

      if (reviewsHost) {
        (async () => {
          reviewsHost.setAttribute('aria-busy', 'true');
          try {
            const reviews = await sbRest('provider_reviews?select=provider,overall,body,created_at,is_verified_customer' +
              '&order=created_at.desc&limit=20');
            const list = Array.isArray(reviews) ? reviews : [];
            if (!list.length) { reviewsHost.innerHTML = ''; reviewsHost.removeAttribute('aria-busy'); return; }
            reviewsHost.innerHTML = list.map((rv) => {
              const overall = Math.max(0, Math.min(5, Math.round(Number(rv.overall) || 0)));
              let st = '';
              for (let i = 1; i <= 5; i++) st += i <= overall ? '★' : '☆';
              const badge = rv.is_verified_customer
                ? '<span class="verified-badge">✓ לקוח מאומת</span>' : '';
              return '<div class="review-card">' +
                '<div class="review-card__head">' +
                  '<strong class="review-card__provider">' + escHtmlS(rv.provider) + '</strong>' +
                  '<span class="review-card__stars" aria-label="' + overall + ' מתוך 5">' + st + '</span>' +
                  badge +
                '</div>' +
                '<div class="review-card__body">' + escHtmlS(rv.body || '') + '</div>' +
                '<time class="review-card__time">' + escHtmlS(relTimeHe(rv.created_at)) + '</time>' +
                '</div>';
            }).join('');
          } catch (_) {
            reviewsHost.innerHTML = ''; // the ratings block already shows the contained retry card — no second red line
          }
          reviewsHost.removeAttribute('aria-busy');
        })();
      }
    }
  })();

  // ── (2) BOOKING — Zoom video-consultation booking (anonymous allowed) ────────
  // Mirrors the app's meeting_slots + meetings_guard: builds valid dates/slots
  // client-side (Israel time, ≥4h out, ≤30 days, no Saturday, Fri until 12:30),
  // validates the form, and POSTs to /meetings. On success the rep confirms in
  // Telegram and the customer gets the Zoom link by email.
  (() => {
    const form = $('bookForm');
    if (!form) return;

    // The Zoom-supported providers, in EXACT catalogue ids. SINGLE SOURCE OF
    // TRUTH is public.provider_capabilities.supports_zoom_meeting — only these 10
    // are opted in; everyone else is NOT supported and must not be bookable. This
    // const mirrors BOOK_PROVIDERS in site/build.js (which renders book.html's
    // buttons) and is the FALLBACK used only when the markup ships no buttons.
    const PROVIDERS = ['פרטנר', 'yes', 'STING TV', 'HOT', 'NextTV', 'סלקום', 'גולן טלקום', 'בזק', 'פלאפון', 'הוט מובייל'];
    const providersHost = $('bookProviders') || form.querySelector('.booking__providers');
    const dateSel = $('bookDate');
    const slotHost = $('bookSlots') || form.querySelector('.slot-grid');
    const nameEl = $('bookName');
    const phoneEl = $('bookPhone');
    const emailEl = $('bookEmail');
    const termsEl = $('bookTerms');
    const privacyEl = $('bookPrivacy');
    const marketingEl = $('bookMarketing');
    const noteEl = $('bookNote') || form.querySelector('.booking__note');
    const btn = $('bookSubmit') || form.querySelector('button[type="submit"]');
    const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    // ── Email-OTP step elements (revealed after a code is requested) ──────────
    const verifyBox = $('bookVerify');
    const verifyLead = $('bookVerifyLead');
    const codeEl = $('bookCode');
    const verifyBtn = $('bookVerifyBtn');
    const resendBtn = $('bookResend');

    let chosenProvider = '';
    let chosenSlot = '';
    let busy = false;
    let verifiedEmail = '';   // the email the current OTP was sent to (lowercased)

    // Call the meeting-book edge function (same backend the web app uses).
    // Mirrors the fnName fetch pattern: anon key as apikey + Bearer. Returns the
    // parsed JSON ({ok, error?}); throws only on a transport/non-JSON failure so
    // callers can surface the server's Hebrew `error` from the body.
    const callMeetingBook = async (payload) => {
      const cfg = window.CHOSECH_SUPABASE;
      if (!cfg || !cfg.url || !cfg.anonKey) throw new Error('booking backend not configured');
      const res = await fetch(cfg.url.replace(/\/$/, '') + '/functions/v1/meeting-book', {
        method: 'POST',
        headers: { apikey: cfg.anonKey, Authorization: 'Bearer ' + cfg.anonKey, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok && (!data || data.ok == null)) throw new Error('meeting-book failed: ' + res.status);
      return data || {};
    };

    const setNote = (msg, isErr) => {
      if (!noteEl) return;
      noteEl.textContent = msg || '';
      noteEl.classList.toggle('booking__note--err', !!isErr);
    };

    // Honest send-failure notice (mirrors the Next client's copy): the fn
    // accepted the request but the OTP email itself didn't go out — offer a
    // retry and a WhatsApp CTA. Built with safe DOM methods; all content is
    // fixed copy (no user input).
    const setSendFailNote = () => {
      if (!noteEl) return;
      noteEl.textContent = 'לא הצלחנו לשלוח מייל כרגע — אפשר לנסות שוב בעוד רגע, או ';
      const wa = document.createElement('a');
      wa.href = 'https://wa.me/972505037537?text=' +
        encodeURIComponent('היי, ניסיתי לקבוע שיחת ייעוץ בזום באתר וקוד האימות למייל לא נשלח — אשמח לקבוע דרככם');
      wa.target = '_blank';
      wa.rel = 'noopener';
      wa.textContent = 'לקבוע דרך וואטסאפ';
      noteEl.appendChild(wa);
      noteEl.classList.add('booking__note--err');
    };

    // ── Israel-time helpers ──────────────────────────────────────────────────
    // Compute "now" in Asia/Jerusalem regardless of the visitor's own TZ, so
    // the ≥4h window matches the server. We read the IL wall-clock parts and
    // also the IL UTC-offset (for converting a chosen slot back to a real instant).
    const ilParts = (date) => {
      const fmt = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', hour12: false, weekday: 'short',
      });
      const p = {};
      fmt.formatToParts(date).forEach((x) => { p[x.type] = x.value; });
      // 'hour' can come back as '24' at midnight in some engines — normalise.
      let hour = parseInt(p.hour, 10); if (hour === 24) hour = 0;
      return {
        year: parseInt(p.year, 10), month: parseInt(p.month, 10), day: parseInt(p.day, 10),
        hour: hour, minute: parseInt(p.minute, 10), weekday: p.weekday,
      };
    };
    // IL offset (minutes east of UTC) at a given instant — handles DST (IDT/IST).
    const ilOffsetMinutes = (date) => {
      const dtf = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
      });
      const parts = {};
      dtf.formatToParts(date).forEach((x) => { parts[x.type] = x.value; });
      let h = parseInt(parts.hour, 10); if (h === 24) h = 0;
      const asUTC = Date.UTC(+parts.year, +parts.month - 1, +parts.day, h, +parts.minute, +parts.second);
      return Math.round((asUTC - date.getTime()) / 60000);
    };
    // Real UTC instant for an IL wall-clock Y-M-D H:M.
    const ilWallToInstant = (y, mo, d, h, mi) => {
      // First approximation assuming UTC, then correct by the IL offset at that point.
      const guess = new Date(Date.UTC(y, mo - 1, d, h, mi));
      const off = ilOffsetMinutes(guess);
      return new Date(Date.UTC(y, mo - 1, d, h, mi) - off * 60000);
    };

    const HE_DAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
    const pad2 = (n) => (n < 10 ? '0' + n : '' + n);

    // JS getUTCDay-style index for an IL date (0=Sun..6=Sat), via a noon instant
    // (noon avoids DST edge ambiguity).
    const ilWeekday = (y, mo, d) => {
      const inst = ilWallToInstant(y, mo, d, 12, 0);
      // Re-read the weekday in IL terms.
      const wd = ilParts(inst).weekday; // 'Sun'..'Sat'
      return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(wd);
    };

    // ── Build the next-30-days date options (skip Saturday) ──────────────────
    const buildDates = () => {
      if (!dateSel) return;
      const now = ilParts(new Date());
      dateSel.innerHTML = '<option value="">בחרו תאריך</option>';
      let added = 0;
      for (let i = 0; i < 30 && added < 30; i++) {
        // Walk forward day by day from today in IL terms.
        const base = ilWallToInstant(now.year, now.month, now.day, 12, 0);
        const d = new Date(base.getTime() + i * 86400000);
        const p = ilParts(d);
        const wd = ilWeekday(p.year, p.month, p.day);
        if (wd === 6) continue; // no Saturday
        const value = p.year + '-' + pad2(p.month) + '-' + pad2(p.day);
        const label = HE_DAYS[wd] + ', ' + p.day + '/' + p.month;
        const opt = document.createElement('option');
        opt.value = value;
        opt.textContent = label;
        dateSel.appendChild(opt);
        added++;
      }
    };

    // ── Slots for the chosen date — grouped by part of day for easy scanning ──
    // Same 30-min grid + ≥4h lead as before, but rendered under בוקר/צהריים/ערב
    // headings in a full-width multi-column grid so it reads at a glance instead
    // of one tall, narrow 2-column list. The container becomes .slot-groups (a
    // column of sections); each section holds its own .slot-grid of chips.
    const buildSlots = () => {
      if (!slotHost) return;
      chosenSlot = '';
      slotHost.className = 'slot-groups';
      slotHost.innerHTML = '';
      const val = dateSel && dateSel.value;
      if (!val) { slotHost.innerHTML = '<p class="booking__note">בחרו תאריך כדי לראות שעות פנויות.</p>'; return; }
      const [y, mo, d] = val.split('-').map(Number);
      const wd = ilWeekday(y, mo, d);
      if (wd === 6) { slotHost.innerHTML = '<p class="booking__note">אין פגישות בשבת.</p>'; return; }
      // Sun–Thu: 09:00–20:30 ; Fri: 09:00–12:30. End is the last *start* slot.
      const startMin = 9 * 60;
      const endMin = wd === 5 ? 12 * 60 + 30 : 20 * 60 + 30;
      const minLead = Date.now() + 4 * 60 * 60 * 1000; // ≥4h from now
      const maxAhead = Date.now() + 30 * 86400000;
      // Parts of day (morning < 12:00, noon < 17:00, evening otherwise). A section
      // + its grid are created lazily the first time a slot lands in that part.
      const groups = [
        { label: 'בוקר', to: 12 * 60, grid: null },
        { label: 'צהריים', to: 17 * 60, grid: null },
        { label: 'ערב', to: 24 * 60, grid: null },
      ];
      const gridFor = (m) => {
        const g = groups.find((gr) => m < gr.to) || groups[groups.length - 1];
        if (!g.grid) {
          const sec = document.createElement('div');
          sec.className = 'slot-group';
          const head = document.createElement('p');
          head.className = 'slot-group__label';
          head.textContent = g.label;
          const grid = document.createElement('div');
          grid.className = 'slot-grid';
          sec.appendChild(head);
          sec.appendChild(grid);
          slotHost.appendChild(sec);
          g.grid = grid;
        }
        return g.grid;
      };
      let any = false;
      for (let m = startMin; m <= endMin; m += 30) {
        const h = Math.floor(m / 60);
        const mi = m % 60;
        const inst = ilWallToInstant(y, mo, d, h, mi);
        if (inst.getTime() < minLead) continue;     // too soon
        if (inst.getTime() > maxAhead) continue;     // beyond 30 days
        const hhmm = pad2(h) + ':' + pad2(mi);
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'slot';
        b.textContent = hhmm;
        b.setAttribute('aria-pressed', 'false');
        b.addEventListener('click', () => {
          chosenSlot = hhmm;
          Array.from(slotHost.querySelectorAll('.slot')).forEach((s) => {
            const on = s === b;
            s.classList.toggle('slot--chosen', on);
            s.setAttribute('aria-pressed', String(on));
          });
          setNote('', false);
        });
        gridFor(m).appendChild(b);
        any = true;
      }
      if (!any) slotHost.innerHTML = '<p class="booking__note">אין שעות פנויות בתאריך זה — נסו תאריך אחר.</p>';
    };

    // ── Providers — wire the existing logo buttons (don't destroy the fieldset) ──
    const providerInput = $('bookProvider');
    const setProvider = (name, btns, active) => {
      chosenProvider = name;
      if (providerInput) providerInput.value = name;
      btns.forEach((c) => {
        const on = c === active;
        c.classList.toggle('is-chosen', on);
        c.setAttribute('aria-pressed', String(on));
      });
      setNote('', false);
    };
    const existingProv = Array.from(form.querySelectorAll('.booking__provider'));
    if (existingProv.length) {
      // Markup already renders the 7 provider buttons (with logos) + the hidden
      // #bookProvider input — just wire them rather than wiping the fieldset.
      existingProv.forEach((b) => {
        b.setAttribute('aria-pressed', 'false');
        b.addEventListener('click', () =>
          setProvider(b.getAttribute('data-provider') || (b.textContent || '').trim(), existingProv, b));
      });
    } else if (providersHost) {
      providersHost.innerHTML = '';
      const built = [];
      PROVIDERS.forEach((name) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'chip booking__provider';
        b.textContent = name;
        b.setAttribute('aria-pressed', 'false');
        b.addEventListener('click', () => setProvider(name, built, b));
        providersHost.appendChild(b);
        built.push(b);
      });
    }

    if (dateSel) dateSel.addEventListener('change', buildSlots);
    buildDates();
    buildSlots();

    // Clear inline errors as the user corrects fields.
    [nameEl, phoneEl, emailEl].forEach((el) => {
      if (el) el.addEventListener('input', () => { if (el.getAttribute('aria-invalid')) fieldError(el, null); });
    });

    // ── 3-step booking via the meeting-book edge function (email-OTP gated) ──
    // SECURITY: the form never inserts into the DB directly. Submit → request a
    // 6-digit email code; the visitor enters it → verify-code; on success →
    // action:"book" performs the gated insert server-side. The anon key only
    // reaches the edge function, which owns rate-limiting + validation.

    // Reveal/refresh the verification step for a given email.
    const showVerifyStep = (email) => {
      verifiedEmail = email;
      if (verifyLead) verifyLead.textContent = 'שלחנו קוד בן 6 ספרות ל-' + email;
      if (verifyBox) verifyBox.hidden = false;
      if (codeEl) { codeEl.value = ''; setTimeout(() => { try { codeEl.focus(); } catch (_) {} }, reduceMotion ? 0 : 60); }
    };
    const hideVerifyStep = () => {
      verifiedEmail = '';
      if (verifyBox) verifyBox.hidden = true;
      if (codeEl) codeEl.value = '';
    };

    // Read + validate the whole form. Returns the normalised values or null.
    const readForm = () => {
      const name = (nameEl && nameEl.value || '').trim();
      const phoneRaw = (phoneEl && phoneEl.value || '').trim();
      const phone = phoneRaw.replace(/[^\d+]/g, '');
      const email = (emailEl && emailEl.value || '').trim();

      const nameOk = name.length >= 2 && name.length <= 80;
      const phoneOk = IL_PHONE_RE.test(phoneRaw.replace(/[^\d+\-\s]/g, '')) || phone.replace(/\D/g, '').length >= 9;
      const emailOk = EMAIL_RE.test(email);
      const termsOk = termsEl && termsEl.checked;
      const privacyOk = privacyEl && privacyEl.checked;

      fieldError(nameEl, nameOk ? null : 'נא למלא שם (2–80 תווים)');
      fieldError(phoneEl, phoneOk ? null : 'נא למלא מספר טלפון נייד תקין');
      fieldError(emailEl, emailOk ? null : 'נא למלא אימייל תקין — לשם יישלח קישור ה-Zoom');

      if (!nameOk || !phoneOk || !emailOk) {
        setNote('נא למלא שם, טלפון ואימייל תקינים 🙏', true);
        const bad = !nameOk ? nameEl : (!phoneOk ? phoneEl : emailEl);
        if (bad) bad.focus();
        return null;
      }
      if (!chosenProvider) { setNote('בחרו ספק לפגישה 🙏', true); if (providersHost) providersHost.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center' }); return null; }
      if (!dateSel || !dateSel.value) { setNote('בחרו תאריך לפגישה 🙏', true); if (dateSel) dateSel.focus(); return null; }
      if (!chosenSlot) { setNote('בחרו שעה פנויה לפגישה 🙏', true); if (slotHost) slotHost.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center' }); return null; }
      if (!termsOk || !privacyOk) {
        setNote('יש לאשר את תנאי השימוש ומדיניות הפרטיות כדי להמשיך 🙏', true);
        const badC = !termsOk ? termsEl : privacyEl;
        if (badC) badC.focus();
        return null;
      }
      return { name: name, phone: phone, email: email };
    };

    // Step 1 — request a code, then reveal the verify step. The fn replies
    // {ok:true, sent:false} when the OTP email itself failed to send — honour
    // it: stay on this step with an honest notice + WhatsApp fallback instead
    // of advancing the user to wait for a code that will never arrive. A
    // MISSING `sent` field (older deployed fn) is treated as sent (back-compat).
    const requestCode = async (vals) => {
      busy = true;
      let btnLabel = '';
      if (btn) { btnLabel = btn.textContent; btn.disabled = true; btn.classList.add('is-loading'); btn.textContent = 'שולח קוד…'; }
      try {
        const data = await callMeetingBook({ action: 'request-code', email: vals.email, name: vals.name });
        const sent = data && data.sent !== false;
        if (sent) {
          setNote('', false);
          showVerifyStep(vals.email);
        } else {
          setSendFailNote();
        }
      } catch (_) {
        const msg = 'לא הצלחנו לשלוח קוד אימות — נסו שוב, או דברו איתנו בוואטסאפ 💬';
        setNote(msg, true);
        toast(msg, 'error');
      }
      if (btn) { btn.disabled = false; btn.classList.remove('is-loading'); if (btnLabel) btn.textContent = btnLabel; }
      busy = false;
    };

    // Step 3 — the gated insert (only reached after verify-code returns ok).
    const doBook = async (vals) => {
      busy = true;
      let vLabel = '';
      if (verifyBtn) { vLabel = verifyBtn.textContent; verifyBtn.disabled = true; verifyBtn.classList.add('is-loading'); verifyBtn.textContent = 'קובע פגישה…'; }
      try {
        const data = await callMeetingBook({
          action: 'book',
          name: vals.name,
          phone: vals.phone,
          email: vals.email,
          meeting_date: dateSel.value,
          slot: chosenSlot,
          provider: chosenProvider,
          consent: !!(termsEl && termsEl.checked && privacyEl && privacyEl.checked),
        });
        if (!data || !data.ok) {
          const msg = (data && data.error) ? data.error : 'לא הצלחנו לקבוע את הפגישה — בדקו את הפרטים ונסו שוב, או דברו איתנו בוואטסאפ 💬';
          setNote(msg, true);
          toast(msg, 'error');
        } else {
          track('meeting_booked', { provider: chosenProvider });
          form.reset();
          chosenProvider = '';
          chosenSlot = '';
          Array.from(form.querySelectorAll('.booking__provider')).forEach((c) => { c.classList.remove('is-chosen'); c.setAttribute('aria-pressed', 'false'); });
          buildDates();
          buildSlots();
          hideVerifyStep();
          setNote('הבקשה נשלחה — נציג יאשר ויחזור עם קישור Zoom למייל.', false);
          toast('הבקשה נשלחה — נציג יאשר ויחזור עם קישור Zoom למייל', 'success');
        }
      } catch (_) {
        const msg = 'לא הצלחנו לקבוע את הפגישה — נסו שוב, או דברו איתנו בוואטסאפ 💬';
        setNote(msg, true);
        toast(msg, 'error');
      }
      if (verifyBtn) { verifyBtn.disabled = false; verifyBtn.classList.remove('is-loading'); if (vLabel) verifyBtn.textContent = vLabel; }
      busy = false;
    };

    // Step 2 — verify the entered code; on ok auto-trigger the final book.
    const verifyCode = async () => {
      if (busy) return;
      const code = (codeEl && codeEl.value || '').replace(/\D/g, '');
      if (code.length !== 6) {
        fieldError(codeEl, 'נא להזין את הקוד בן 6 הספרות שנשלח אליכם');
        if (codeEl) codeEl.focus();
        return;
      }
      // Re-validate the form so a value tampered with after the code was sent
      // can't slip through; bail back to step 1 if it no longer passes.
      const vals = readForm();
      if (!vals) return;
      if (vals.email !== verifiedEmail) { showVerifyStep(vals.email); return; }

      busy = true;
      let vLabel = '';
      if (verifyBtn) { vLabel = verifyBtn.textContent; verifyBtn.disabled = true; verifyBtn.classList.add('is-loading'); verifyBtn.textContent = 'מאמת…'; }
      let ok = false;
      try {
        const data = await callMeetingBook({ action: 'verify-code', email: vals.email, code: code });
        if (data && data.ok) {
          ok = true;
          fieldError(codeEl, null);
        } else {
          const msg = (data && data.error) ? data.error : 'הקוד שגוי או שפג תוקפו — בקשו קוד חדש';
          fieldError(codeEl, msg);
          setNote(msg, true);
          if (codeEl) codeEl.focus();
        }
      } catch (_) {
        const msg = 'אירעה תקלה באימות הקוד — נסו שוב';
        setNote(msg, true);
        toast(msg, 'error');
      }
      if (verifyBtn) { verifyBtn.disabled = false; verifyBtn.classList.remove('is-loading'); if (vLabel) verifyBtn.textContent = vLabel; }
      busy = false;
      if (ok) await doBook(vals);
    };

    // Submit = step 1 (request code). Clear stale code error as the user types.
    if (codeEl) codeEl.addEventListener('input', () => { if (codeEl.getAttribute('aria-invalid')) fieldError(codeEl, null); });
    if (verifyBtn) verifyBtn.addEventListener('click', () => { verifyCode(); });
    if (codeEl) codeEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); verifyCode(); } });
    if (resendBtn) resendBtn.addEventListener('click', async () => {
      if (busy) return;
      const vals = readForm();
      if (!vals) return;
      await requestCode(vals);
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (busy) return;
      const vals = readForm();
      if (!vals) return;
      await requestCode(vals);
    });
  })();

  // ══ Premium polish: counters, charts, parallax, tilt, forms, theme ══════════
  // Award-level refinement of the EXISTING language ("white-glass + ink + green,
  // editorial"). Each block is self-initialising, guarded on its markup, and a
  // no-op under reduced-motion where motion is the whole point. A tiny shared
  // ease/tween keeps charts/counters reading as one product with the rest of the
  // site (matches the styles.css `--ease` feel).
  // easeOutCubic — mirrors styles.css `--ease` feel for JS-driven tweens.
  const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
  // Generic value tween → calls `onFrame(currentValue)` each rAF until `dur` ms.
  // Honours reduced-motion by jumping straight to the final value.
  const tween = (from, to, dur, onFrame, onDone) => {
    if (reduceMotion || dur <= 0) { onFrame(to); if (onDone) onDone(); return; }
    const start = performance.now();
    const step = (now) => {
      const t = Math.min((now - start) / dur, 1);
      onFrame(from + (to - from) * easeOutCubic(t));
      if (t < 1) requestAnimationFrame(step);
      else if (onDone) onDone();
    };
    requestAnimationFrame(step);
  };
  // Fire `cb(el)` once when `el` first scrolls into view (or immediately when IO
  // is unavailable / reduced-motion, so the end-state is never withheld).
  const onReveal = (el, cb) => {
    if (!('IntersectionObserver' in window) || reduceMotion) { cb(el); return; }
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) { io.unobserve(e.target); cb(e.target); }
      });
    }, { threshold: 0.35 });
    io.observe(el);
  };

  // ── (1) ANIMATED COUNTERS — [data-count-to] counts up on reveal ─────────────
  // Opt-in via markup: <span data-count-to="1188" data-count-prefix="₪"
  // data-count-suffix="+" data-count-dur="1400">. Number is formatted he-IL with
  // optional decimals (data-count-decimals). Reduced-motion → final value set
  // instantly. Idempotent: each element animates once.
  (() => {
    const els = Array.from(document.querySelectorAll('[data-count-to]'));
    if (!els.length) return;
    els.forEach((el) => {
      if (el.dataset.countDone) return;
      const to = Number(el.dataset.countTo);
      if (!Number.isFinite(to)) return;
      const from = Number(el.dataset.countFrom) || 0;
      const dur = Number(el.dataset.countDur) || 1400;
      const prefix = el.dataset.countPrefix || '';
      const suffix = el.dataset.countSuffix || '';
      const decimals = Math.max(0, Math.min(4, Number(el.dataset.countDecimals) || 0));
      const fmt = (v) => prefix + v.toLocaleString('he-IL', {
        minimumFractionDigits: decimals, maximumFractionDigits: decimals,
      }) + suffix;
      // Live region so AT hears the final figure (not every intermediate frame).
      if (!el.hasAttribute('aria-label')) el.setAttribute('aria-label', fmt(to));
      el.dataset.countDone = '1';
      onReveal(el, () => {
        tween(from, to, dur, (v) => { el.textContent = fmt(v); }, () => { el.textContent = fmt(to); });
      });
    });
  })();

  // ── (2a) ANIMATED CHARTS — [data-chart] inline-SVG bar charts (no deps) ──────
  // Mount: <div data-chart='[{"label":"היום","value":120,"kind":"now"},
  //   {"label":"הזול","value":29,"kind":"best"}]' data-chart-unit="₪"></div>
  // Renders an accessible, RTL horizontal bar chart whose bars grow from 0 on
  // reveal. `kind` maps to a semantic class (now=ink, best/save=value/accent) so
  // colours follow the brand tokens — never per-provider brand colours.
  const renderBarChart = (mount, series, opts) => {
    opts = opts || {};
    const unit = opts.unit || '';
    const fmtV = (v) => unit + Math.round(v).toLocaleString('he-IL');
    const max = series.reduce((m, s) => Math.max(m, Number(s.value) || 0), 0) || 1;
    mount.classList.add('barchart');
    mount.setAttribute('role', 'img');
    const aria = series.map((s) => (s.label || '') + ': ' + fmtV(Number(s.value) || 0)).join(', ');
    mount.setAttribute('aria-label', opts.title ? opts.title + ' — ' + aria : aria);
    mount.innerHTML = '';
    const rows = document.createElement('div');
    rows.className = 'barchart__rows';
    series.forEach((s, i) => {
      const val = Math.max(0, Number(s.value) || 0);
      const pct = (val / max) * 100;
      const row = document.createElement('div');
      row.className = 'barchart__row' + (s.kind ? ' barchart__row--' + s.kind : '');
      const label = document.createElement('span');
      label.className = 'barchart__label';
      label.textContent = s.label || '';
      const track = document.createElement('span');
      track.className = 'barchart__track';
      const bar = document.createElement('span');
      bar.className = 'barchart__bar';
      bar.style.width = '0%';
      const out = document.createElement('span');
      out.className = 'barchart__val';
      out.textContent = reduceMotion ? fmtV(val) : fmtV(0);
      track.appendChild(bar);
      track.appendChild(out);
      row.appendChild(label);
      row.appendChild(track);
      rows.appendChild(row);
      // Choreographed: each bar grows on reveal, staggered 0/80/160/240ms.
      onReveal(mount, () => {
        const delay = reduceMotion ? 0 : Math.min(i, 3) * 80;
        setTimeout(() => {
          bar.style.transition = reduceMotion ? 'none' : 'width .9s var(--ease, ease-out)';
          bar.style.width = pct.toFixed(1) + '%';
          tween(0, val, 900, (v) => { out.textContent = fmtV(v); }, () => { out.textContent = fmtV(val); });
        }, delay);
      });
    });
    mount.appendChild(rows);
  };

  (() => {
    const mounts = Array.from(document.querySelectorAll('[data-chart]'));
    mounts.forEach((mount) => {
      if (mount.dataset.chartDone) return;
      let series;
      try { series = JSON.parse(mount.getAttribute('data-chart') || '[]'); } catch (_) { series = null; }
      if (!Array.isArray(series) || !series.length) return;
      mount.dataset.chartDone = '1';
      renderBarChart(mount, series, { unit: mount.dataset.chartUnit || '', title: mount.dataset.chartTitle || '' });
    });
  })();

  // ── (2b) CALCULATOR RESULT CHART — upgrade the calc-*.html result block ──────
  // The savings calculator renders a `.calc-result` into #calcOut. We watch for
  // it and inject an animated "היום vs הזול" bar chart above the rows, so the
  // saving lands visually. Pure enhancement: reads the numbers already shown.
  (() => {
    const calcEl = $('calc');
    const out = $('calcOut');
    if (!calcEl || !out) return;
    const cheapest = Number(calcEl.dataset.cheapest) || 0;
    const inject = () => {
      const result = out.querySelector('.calc-result');
      if (!result || result.querySelector('.calc-result__chart')) return;
      // Recover "today" from the input rather than re-parsing the rendered text.
      const bill = $('calcBill');
      const cur = parseFloat(bill && bill.value);
      if (!cur || cur <= 0 || cheapest <= 0) return;
      const mount = document.createElement('div');
      mount.className = 'calc-result__chart';
      result.insertBefore(mount, result.firstChild);
      renderBarChart(mount, [
        { label: 'היום', value: cur, kind: 'now' },
        { label: 'הזול בשוק', value: cheapest, kind: 'best' },
      ], { unit: '₪', title: 'השוואת תשלום חודשי' });
    };
    const mo = new MutationObserver(() => inject());
    mo.observe(out, { childList: true, subtree: true });
    inject();
  })();

  // ── (2c) RATINGS CHART — animate the provider rating stars/bars ─────────────
  // After the community ratings grid renders (.ratings__grid populated by the
  // community module above), grow each card's score into an animated 0→5 bar and
  // count the score up. Guarded + idempotent via a data flag; star glyphs stay.
  (() => {
    const host = $('ratingsSummary');
    if (!host) return;
    const enhance = () => {
      const cards = Array.from(host.querySelectorAll('.rating-card'));
      cards.forEach((card, i) => {
        if (card.dataset.ratingChart) return;
        const scoreEl = card.querySelector('.rating-card__score');
        const score = scoreEl ? parseFloat(scoreEl.textContent) : NaN;
        if (!Number.isFinite(score)) return;
        card.dataset.ratingChart = '1';
        const meter = document.createElement('span');
        meter.className = 'rating-card__meter';
        meter.setAttribute('aria-hidden', 'true');
        const fill = document.createElement('span');
        fill.className = 'rating-card__meter-fill';
        fill.style.width = '0%';
        meter.appendChild(fill);
        // Place the meter right after the star glyphs.
        const starsEl = card.querySelector('.rating-card__stars');
        if (starsEl && starsEl.parentNode) starsEl.parentNode.insertBefore(meter, starsEl.nextSibling);
        else card.appendChild(meter);
        onReveal(card, () => {
          setTimeout(() => {
            fill.style.transition = reduceMotion ? 'none' : 'width .9s var(--ease, ease-out)';
            fill.style.width = Math.max(0, Math.min(100, (score / 5) * 100)).toFixed(1) + '%';
            if (scoreEl) tween(0, score, 900, (v) => { scoreEl.textContent = v.toFixed(1); }, () => { scoreEl.textContent = score.toFixed(1); });
          }, reduceMotion ? 0 : Math.min(i, 6) * 60);
        });
      });
    };
    // The grid is fetched async; observe until it appears, then enhance.
    const mo = new MutationObserver(() => enhance());
    mo.observe(host, { childList: true, subtree: true });
    enhance();
  })();

  // ── (3) HERO PARALLAX — drift bg/texture layers at a fraction of scroll ──────
  // Opt-in layers: any descendant of the page's top hero (.hero on the
  // homepage; .lead-hero / .article-hero on generated pages) with
  // [data-parallax] (or the legacy .hero__bg / .hero__texture) translates at
  // `data-parallax` × scroll (default .25 bg-ish). rAF-batched, single scroll
  // listener; the paint guard only animates while the hero is in view.
  // Disabled under reduced-motion and on touch/coarse pointers (where it just
  // costs battery).
  (() => {
    if (reduceMotion) return;
    if (window.matchMedia('(hover: none)').matches || window.matchMedia('(pointer: coarse)').matches) return;
    const hero = document.querySelector('.hero, .lead-hero, .article-hero');
    if (!hero) return;
    let layers = Array.from(hero.querySelectorAll('[data-parallax], .hero__bg, .hero__texture, .hero__visual'));
    layers = layers.map((el) => ({
      el,
      factor: el.hasAttribute('data-parallax')
        ? (Number(el.getAttribute('data-parallax')) || 0.2)
        : (el.classList.contains('hero__visual') ? 0.06 : 0.22),
    })).filter((l) => l.factor);
    if (!layers.length) return;
    let ticking = false;
    const paint = () => {
      const y = window.scrollY;
      // Only animate while the hero is reasonably in view.
      if (y < window.innerHeight * 1.2) {
        layers.forEach((l) => { l.el.style.transform = 'translate3d(0,' + (y * l.factor).toFixed(1) + 'px,0)'; });
      }
      ticking = false;
    };
    window.addEventListener('scroll', () => {
      if (!ticking) { ticking = true; requestAnimationFrame(paint); }
    }, { passive: true });
    paint();
  })();

  // ── (4) PLAN-CARD 3D TILT — subtle pointer-driven tilt (desktop only) ───────
  // Adds a gentle perspective tilt toward the cursor on plan/provider cards.
  // Desktop hover only (no touch), disabled under reduced-motion. Resets cleanly
  // on leave. Composes via CSS custom props so it never clobbers other transforms.
  (() => {
    if (reduceMotion) return;
    if (!window.matchMedia('(hover: hover)').matches) return;
    const sel = '.plan, .provider-card, .advisor__rec, .rating-card';
    const MAX = 6; // degrees
    let active = null, px = 0, py = 0;
    const paint = rafThrottle(() => {
      if (!active) return;
      const r = active.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const dx = (px - cx) / (r.width / 2);
      const dy = (py - cy) / (r.height / 2);
      // RTL-agnostic: rotateY follows horizontal cursor, rotateX inverts vertical.
      active.style.setProperty('--tilt-x', (-dy * MAX).toFixed(2) + 'deg');
      active.style.setProperty('--tilt-y', (dx * MAX).toFixed(2) + 'deg');
    });
    document.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'touch') return;
      const card = e.target.closest && e.target.closest(sel);
      if (card !== active) {
        if (active) { active.classList.remove('is-tilting'); active.style.removeProperty('--tilt-x'); active.style.removeProperty('--tilt-y'); }
        active = card;
        if (active) active.classList.add('is-tilting');
      }
      if (active) { px = e.clientX; py = e.clientY; paint(); }
    }, { passive: true });
    document.addEventListener('pointerleave', () => {
      if (active) { active.classList.remove('is-tilting'); active.style.removeProperty('--tilt-x'); active.style.removeProperty('--tilt-y'); active = null; }
    }, true);
  })();

  // ── (5) FORM MICRO-INTERACTIONS — floating labels + booking step transitions ─
  // (a) Floating labels: a .field--float wrapper (label + input/textarea) gets
  //     .is-filled while the control holds a value, so CSS can float the label.
  //     Works for inputs added later; no markup churn if the wrapper is absent.
  (() => {
    const fields = Array.from(document.querySelectorAll('.field--float'));
    const wire = (field) => {
      const ctrl = field.querySelector('input, textarea, select');
      if (!ctrl) return;
      const sync = () => field.classList.toggle('is-filled', !!(ctrl.value && String(ctrl.value).length));
      const focusOn = () => field.classList.add('is-focused');
      const focusOff = () => { field.classList.remove('is-focused'); sync(); };
      ctrl.addEventListener('input', sync);
      ctrl.addEventListener('focus', focusOn);
      ctrl.addEventListener('blur', focusOff);
      sync();
    };
    fields.forEach(wire);
  })();
  // (b) Booking step transitions: if the booking form is laid out as discrete
  //     .booking__step panels with [data-step], slide between them when the
  //     fieldsets are completed. Purely visual; the existing submit logic and
  //     validation are untouched. No-op when the markup is a single flat form.
  (() => {
    const form = $('bookForm');
    if (!form) return;
    const steps = Array.from(form.querySelectorAll('.booking__step[data-step]'));
    if (steps.length < 2) return;
    let current = 0;
    // Slide enters from the leading edge: right (+X) in RTL, left (-X) in LTR.
    const isLtr = document.documentElement.getAttribute('dir') === 'ltr';
    const show = (idx, animate) => {
      idx = Math.max(0, Math.min(steps.length - 1, idx));
      steps.forEach((s, i) => {
        const on = i === idx;
        s.classList.toggle('is-active', on);
        s.setAttribute('aria-hidden', String(!on));
        if (animate && !reduceMotion && on) {
          s.style.transition = 'none';
          s.style.transform = 'translateX(' + (isLtr ? '-24px' : '24px') + ')';
          s.style.opacity = '0';
          requestAnimationFrame(() => {
            s.style.transition = 'transform .35s var(--ease, ease-out), opacity .35s var(--ease, ease-out)';
            s.style.transform = 'translateX(0)';
            s.style.opacity = '1';
          });
        }
      });
      current = idx;
    };
    form.querySelectorAll('[data-step-next]').forEach((b) => b.addEventListener('click', (e) => { e.preventDefault(); show(current + 1, true); }));
    form.querySelectorAll('[data-step-prev]').forEach((b) => b.addEventListener('click', (e) => { e.preventDefault(); show(current - 1, true); }));
    show(0, false);
  })();

  // ── (6) LIGHT/DARK TOGGLE — #themeToggle flips a data-theme override ─────────
  // Persists the choice to localStorage; on load honours a saved choice, else the
  // system preference (so it cooperates with the CSS `prefers-color-scheme`
  // block — `data-theme` on <html> is the explicit override). Reflects state on
  // the toggle (aria-pressed + label) and keeps multiple toggles in sync.
  (() => {
    const KEY = 'chosech-theme';
    const root = document.documentElement;
    const systemDark = () => window.matchMedia('(prefers-color-scheme: dark)').matches;
    let saved = null;
    try { saved = localStorage.getItem(KEY); } catch (_) { /* storage may be blocked */ }
    // Resolve the *effective* theme for toggle state; only write data-theme when
    // there's an explicit user choice, so unset = follow system via CSS.
    const apply = (theme, persist) => {
      // Attribute-only theming: always write an EXPLICIT data-theme (resolving
      // "system" to the live preference) so the CSS [data-theme] rules apply —
      // there is no longer a prefers-color-scheme media block to fall back to.
      const resolved = (theme === 'light' || theme === 'dark')
        ? theme
        : (systemDark() ? 'dark' : 'light');
      root.setAttribute('data-theme', resolved);
      if (persist) {
        try {
          if (theme === 'light' || theme === 'dark') localStorage.setItem(KEY, theme);
          else localStorage.removeItem(KEY);
        } catch (_) { /* best-effort */ }
      }
      syncToggles();
    };
    const effective = () => {
      const attr = root.getAttribute('data-theme');
      if (attr === 'light' || attr === 'dark') return attr;
      return systemDark() ? 'dark' : 'light';
    };
    const toggles = Array.from(document.querySelectorAll('#themeToggle, [data-theme-toggle]'));
    function syncToggles() {
      const isDark = effective() === 'dark';
      toggles.forEach((t) => {
        t.setAttribute('aria-pressed', String(isDark));
        if (!t.getAttribute('aria-label')) t.setAttribute('aria-label', 'מצב כהה');
        t.setAttribute('title', isDark ? 'מעבר למצב בהיר' : 'מעבר למצב כהה');
        t.classList.toggle('is-dark', isDark);
      });
    }
    // Apply the saved choice, or resolve the system preference to an explicit
    // attribute (attribute-only theming needs a value either way; the inline
    // <head> guard already set one pre-paint — this just re-confirms it).
    apply(saved === 'light' || saved === 'dark' ? saved : 'system', false);
    toggles.forEach((t) => {
      t.addEventListener('click', () => {
        const next = effective() === 'dark' ? 'light' : 'dark';
        apply(next, true);
      });
    });
    // If the user hasn't pinned a choice, follow live system changes.
    try {
      window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
        let pinned = null;
        try { pinned = localStorage.getItem(KEY); } catch (_) { /* ignore */ }
        if (pinned !== 'light' && pinned !== 'dark') apply('system', false);
      });
    } catch (_) { /* Safari <14 lacks addEventListener on MQL */ }
  })();

  // ── "מידע נוסף" plan-details modal ──────────────────────────────────────────
  // The full per-plan breakdown (price + post-promo, what you get, equipment/fees,
  // what's included, the complete פרטים-נוספים fine print, terms, eligibility).
  // Data is lazy-fetched from data/plans.json on first open and cached. Triggered
  // by any [data-plan-more] (card button or comparison-table plan name). The
  // modal shell lives in the shared footer, so it works on every page.
  (() => {
    const modal = $('planModal');
    const body = $('pmodalBody');
    if (!modal || !body) return;
    const PROVIDER_SLUGS = {
      'Xphone': 'xphone', 'סלקום': 'cellcom', '019 מובייל': '019mobile', 'פרטנר': 'partner',
      'גולן טלקום': 'golan', 'רמי לוי': 'rami-levy', 'בזק': 'bezeq', 'הוט מובייל': 'hot-mobile',
      'HOT': 'hot', 'CCC': 'ccc', 'פלאפון': 'pelephone', 'WeCom': 'wecom', 'STING TV': 'sting-tv',
      'וואלה מובייל': 'walla-mobile', 'גילת': 'gilat', 'yes': 'yes', 'NextTV': 'nexttv', 'Airalo eSIM': 'airalo',
    };
    const slug = (name) => PROVIDER_SLUGS[name] || (String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || '');
    const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const UNIT = { month: 'לחודש', package: 'לחבילה', day: 'ליום', minute: 'לדקה' };
    let byId = null, loading = null, lastFocus = null;

    const load = () => {
      if (byId) return Promise.resolve(byId);
      if (loading) return loading;
      loading = fetch('data/plans.json').then((r) => r.json()).then((d) => {
        byId = {}; (d.plans || []).forEach((p) => { byId[p.id] = p; }); return byId;
      }).catch(() => (byId = {}));
      return loading;
    };

    const rows = (obj) => Object.entries(obj || {}).filter(([, v]) => v).map(([k, v]) =>
      `<div class="pmodal__row"><span class="pmodal__k">${esc(k)}</span><span class="pmodal__v">${esc(v)}</span></div>`).join('');

    // "תעודת מסלול" — a standardized transparency label (FCC broadband-label
    // inspired): the same five facts, in the same order, for every plan. All
    // figures are straight from the catalogue; the yearly line is honest
    // arithmetic (12× today / 12× after) presented as a range.
    const planLabel = (p) => {
      const monthly = !p.priceUnit || p.priceUnit === 'month';
      const priceV = p.priceExact != null ? p.priceExact : p.price;
      const afterV = p.afterExact != null ? p.afterExact : p.after;
      const hasJump = p.after != null && p.after > p.price;
      const yr = (n) => '₪' + Math.round(n * 12).toLocaleString('he-IL');
      const row = (k, v, cls) => `<div class="plan-label__row${cls ? ' ' + cls : ''}"><span>${esc(k)}</span><b>${v}</b></div>`;
      return `<div class="plan-label" role="group" aria-label="תעודת מסלול — כל העובדות במבנה אחיד">
        <p class="plan-label__t">תעודת מסלול <span>שקיפות מלאה, אותו מבנה לכל מסלול</span></p>
        ${row('מחיר חודשי היום', `<span dir="ltr">₪${esc(priceV)}</span>`)}
        ${hasJump ? row('מחיר אחרי המבצע', `<span dir="ltr">₪${esc(afterV)}</span>`, 'plan-label__row--after') : row('שינוי מחיר', 'מחיר קבוע — אין קפיצה')}
        ${row('התחייבות', p.noCommit ? 'ללא התחייבות' : esc((p.term || '') + ' חודשים'))}
        ${monthly ? row('עלות שנה (טווח כנה)', hasJump ? `<span dir="ltr">${yr(p.price)}–${yr(p.after)}</span>` : `<span dir="ltr">${yr(p.price)}</span>`) : ''}
        ${p.net ? row('רשת / תשתית', esc(p.net)) : ''}
      </div>`;
    };
    const list = (arr) => (arr || []).filter(Boolean).map((x) => `<li>${esc(x)}</li>`).join('');

    const render = (p) => {
      const unit = UNIT[p.priceUnit] || (p.cat === 'abroad' ? 'לחבילה' : 'לחודש');
      const price = '₪' + (p.priceExact != null ? p.priceExact : p.price);
      const afterVal = p.afterExact != null ? p.afterExact : p.after;
      const after = (p.after != null && p.after > p.price)
        ? `<span class="pmodal__after">ואז <span dir="ltr">₪${afterVal}</span> ${esc(unit)}</span>`
        : `<span class="pmodal__fixed">מחיר קבוע</span>`;
      const flags = [];
      if (p.is5G) flags.push('5G');
      flags.push(p.noCommit ? 'ללא התחייבות' : ('התחייבות ' + p.term + ' חודשים'));
      if (p.hasAbroad) flags.push('כולל חו״ל');
      const specs = rows(p.specs), fees = rows(p.fees);
      const ps = slug(p.provider);
      body.innerHTML =
        `<header class="pmodal__head">
          <div class="pmodal__brand">${esc(p.provider)}${p.net ? ` · ${esc(p.net)}` : ''}</div>
          <h2 class="pmodal__title" id="pmodalTitle">${esc(p.plan)}</h2>
          <div class="pmodal__price"><b dir="ltr">${price}</b> <span>${esc(unit)}</span> ${after}</div>
          ${flags.length ? `<div class="pmodal__flags">${flags.map((f) => `<span class="pmodal__flag">${esc(f)}</span>`).join('')}</div>` : ''}
        </header>
        ${planLabel(p)}
        ${specs ? `<section class="pmodal__sec"><h3>מה מקבלים</h3><div class="pmodal__grid">${specs}</div></section>` : ''}
        ${fees ? `<section class="pmodal__sec"><h3>עלויות וציוד</h3><div class="pmodal__grid">${fees}</div></section>` : ''}
        ${(p.feats && p.feats.length) ? `<section class="pmodal__sec"><h3>כלול בחבילה</h3><ul class="pmodal__ul">${list(p.feats)}</ul></section>` : ''}
        ${(p.fineLines && p.fineLines.length) ? `<section class="pmodal__sec"><h3>פרטים נוספים</h3><ul class="pmodal__ul pmodal__ul--fine">${list(p.fineLines)}</ul></section>` : ''}
        ${(p.terms && p.terms.length) ? `<section class="pmodal__sec"><h3>תנאים והתחייבות</h3><ul class="pmodal__ul">${list(p.terms)}</ul></section>` : ''}
        ${p.eligibility ? `<p class="pmodal__elig">${esc(p.eligibility)}</p>` : ''}
        <div class="pmodal__cta">
          <a class="btn btn--primary" target="_blank" rel="noopener" href="https://wa.me/972505037537?text=${encodeURIComponent('היי, מעניין אותי ' + p.provider + ' - ' + p.plan)}">מעוניין/ת — דברו איתי בוואטסאפ ←</a>
          ${ps ? `<a class="btn btn--ghost" href="provider-${esc(ps)}.html">כל מסלולי ${esc(p.provider)}</a>` : ''}
        </div>
        <a class="zoom-cta" href="book.html"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2.5" y="6" width="13" height="12" rx="2.5"/><path d="m15.5 10.5 6-3.5v10l-6-3.5"/></svg><span>רוצים לעבור על המסלול יחד עם נציג? <b>פגישת Zoom חינם, בלי התחייבות</b> ←</span></a>
        ${p.updatedAt ? `<p class="pmodal__upd">המידע נאסף מהאתרים הרשמיים · עודכן ${esc(p.updatedAt)}</p>` : ''}`;
    };

    const close = () => {
      modal.classList.remove('pmodal--open');
      document.body.classList.remove('pmodal-lock');
      const fin = () => { modal.hidden = true; };
      if (reduceMotion) fin(); else setTimeout(fin, 220);
      if (lastFocus && lastFocus.focus) try { lastFocus.focus(); } catch (_) { /* gone */ }
    };
    const open = (id, trigger) => {
      lastFocus = trigger || document.activeElement;
      load().then((map) => {
        const p = map && map[id];
        if (!p) return; // no data for this id → no-op (clean on data-less pages)
        render(p);
        modal.hidden = false;
        document.body.classList.add('pmodal-lock');
        void modal.offsetWidth; // force reflow so the open transition plays reliably
        modal.classList.add('pmodal--open');
        const x = modal.querySelector('.pmodal__x');
        if (x) x.focus();
        track('plan_info_open', { plan: id });
      });
    };

    document.addEventListener('click', (e) => {
      const t = e.target.closest && e.target.closest('[data-plan-more]');
      if (t) { e.preventDefault(); open(t.getAttribute('data-plan-more'), t); return; }
      if (e.target.closest && e.target.closest('[data-pmodal-close]')) { e.preventDefault(); close(); }
    });
    document.addEventListener('keydown', (e) => {
      if (modal.hidden) return;
      if (e.key === 'Escape') { close(); return; }
      if (e.key === 'Tab') { // focus trap within the panel
        const f = modal.querySelectorAll('a[href], button:not([disabled])');
        if (!f.length) return;
        const first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    });
  })();

  // ── Cookie consent (GA4 Consent Mode v2) ────────────────────────────────────
  // The <head> gtag snippet sets consent default = denied. This banner lets the
  // user grant analytics-only (ad storage stays denied); the choice persists in
  // localStorage so it's asked once. No choice yet → banner shows; denied → GA4
  // stays cookieless.
  (() => {
    const KEY = 'cookieConsent';
    let stored = null;
    try { stored = localStorage.getItem(KEY); } catch (_) { /* private mode */ }
    const grant = () => { try { if (typeof window.gtag === 'function') window.gtag('consent', 'update', { analytics_storage: 'granted' }); } catch (_) { /* best effort */ } };
    if (stored === 'granted') grant();
    const banner = $('cookieBanner');
    if (!banner || stored === 'granted' || stored === 'denied') return;
    banner.hidden = false;
    banner.addEventListener('click', (e) => {
      const b = e.target.closest && e.target.closest('[data-consent]');
      if (!b) return;
      const granted = b.getAttribute('data-consent') === 'grant';
      try { localStorage.setItem(KEY, granted ? 'granted' : 'denied'); } catch (_) { /* ignore */ }
      if (granted) grant();
      banner.hidden = true;
    });
  })();

  // ── Accessibility widget (a11y) ─────────────────────────────────────────────
  // Wires the floating accessibility control emitted on every page (build.js
  // footer helper + the hand-written index.html). Legally-required per the
  // Israeli accessibility regulations / ת"י 5568 / WCAG 2.0 AA. Every adjustment
  // toggles a class (or an inline font-size) on <html> and persists to
  // localStorage; an inline <head> guard already re-applies the saved state
  // before first paint, so here we only re-sync the CONTROL state and handle
  // interaction. Dependency-free, keyboard-operable, focus-trapped, dark+RTL safe.
  (() => {
    const fab = $('a11yFab');
    const panel = $('a11yPanel');
    if (!fab || !panel) return;
    const sheet = panel.querySelector('.a11y-panel__sheet');
    const root = document.documentElement;
    const KEY = 'chosech-a11y';
    const FONT_MIN = 90, FONT_MAX = 160, FONT_STEP = 10;
    const TOGGLES = ['contrast', 'links', 'readfont', 'noanim', 'focus'];

    const read = () => {
      try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; }
      catch (_) { return {}; }
    };
    const write = (s) => {
      try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (_) { /* private mode */ }
    };

    // Apply saved settings to <html> AND reflect them in the panel controls.
    const apply = (s) => {
      TOGGLES.forEach((k) => root.classList.toggle('a11y-' + k, !!s[k]));
      const font = clampFont(s.font);
      if (font !== 100) root.style.fontSize = font + '%';
      else root.style.removeProperty('font-size');
      // Reflect toggle state on the buttons.
      TOGGLES.forEach((k) => {
        const btn = panel.querySelector('[data-a11y-toggle="' + k + '"]');
        if (btn) btn.setAttribute('aria-pressed', s[k] ? 'true' : 'false');
      });
    };
    const clampFont = (v) => {
      const n = Number(v);
      if (!Number.isFinite(n) || n === 0) return 100;
      return Math.min(FONT_MAX, Math.max(FONT_MIN, n));
    };

    let state = read();
    // Migrate/normalise the font field so the stored value is always sane.
    state.font = clampFont(state.font);
    apply(state);

    // ── Open / close with full focus management ──────────────────────────────
    const FOCUSABLE = 'button, [href], input, select, [tabindex]:not([tabindex="-1"])';
    const isOpen = () => panel.classList.contains('is-open');

    const open = () => {
      if (isOpen()) return;
      panel.hidden = false;
      // Force reflow so the CSS open-transition runs from the hidden state.
      void panel.offsetWidth;
      panel.classList.add('is-open');
      fab.setAttribute('aria-expanded', 'true');
      const first = sheet.querySelector(FOCUSABLE);
      if (first) first.focus();
    };
    const close = () => {
      if (!isOpen()) return;
      panel.classList.remove('is-open');
      fab.setAttribute('aria-expanded', 'false');
      const done = () => { panel.hidden = true; };
      if (reduceMotion) done();
      else {
        let ran = false;
        const onEnd = () => { if (ran) return; ran = true; sheet.removeEventListener('transitionend', onEnd); done(); };
        sheet.addEventListener('transitionend', onEnd);
        setTimeout(onEnd, 300); // fallback if transitionend never fires
      }
      // Per spec: closing always returns focus to the trigger button.
      fab.focus();
    };

    fab.addEventListener('click', () => { isOpen() ? close() : open(); });

    // Backdrop + X close.
    panel.addEventListener('click', (e) => {
      if (e.target.closest && e.target.closest('[data-a11y-close]')) close();
    });

    // ESC closes (returns focus to the button); Tab is trapped inside the sheet.
    panel.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.preventDefault(); close(); return; }
      if (e.key !== 'Tab') return;
      const f = Array.from(sheet.querySelectorAll(FOCUSABLE))
        .filter((el) => !el.disabled && el.offsetParent !== null);
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });

    // ── Controls ─────────────────────────────────────────────────────────────
    // Text-size stepper.
    panel.querySelectorAll('[data-a11y-font]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const op = btn.getAttribute('data-a11y-font');
        if (op === 'reset') state.font = 100;
        else if (op === 'inc') state.font = clampFont(state.font + FONT_STEP);
        else if (op === 'dec') state.font = clampFont(state.font - FONT_STEP);
        write(state); apply(state);
      });
    });

    // Toggles (aria-pressed).
    panel.querySelectorAll('[data-a11y-toggle]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const k = btn.getAttribute('data-a11y-toggle');
        state[k] = !state[k];
        write(state); apply(state);
      });
    });

    // Reset everything (clears storage + all adjustments).
    const resetBtn = panel.querySelector('[data-a11y-reset]');
    if (resetBtn) resetBtn.addEventListener('click', () => {
      TOGGLES.forEach((k) => root.classList.remove('a11y-' + k));
      root.style.removeProperty('font-size');
      try { localStorage.removeItem(KEY); } catch (_) { /* ignore */ }
      state = { font: 100 };
      apply(state);
    });
  })();

  // ── (7) LANGUAGE / TRANSLATION — wire the shared SwitchyI18n runtime ─────────
  // translate-runtime.js loads just before this file and exposes window.SwitchyI18n.
  // It reads window.CHOSECH_SUPABASE for the edge endpoint + anon key, re-applies a
  // previously-chosen language across navigation, and mounts the language menu on
  // the header #langBtn. Fail-soft: if the runtime didn't load, the header simply
  // stays Hebrew-only — nothing else is affected.
  (function () {
    if (!window.SwitchyI18n) return;
    try { window.SwitchyI18n.init(); } catch (_) { /* ignore */ }
    const btn = document.getElementById('langBtn');
    if (btn) { try { window.SwitchyI18n.mountMenu(btn); } catch (_) { /* ignore */ } }
  })();

  // ── (8) POINTER TILT — a whisper of 3D depth on the hero launch tiles ────────
  // Fine pointers only, and never under reduced-motion: the tile leans ≤3°
  // toward the cursor and settles back on leave. Pure perspective transform —
  // no library, no layout shift, and touch devices never see it.
  (function () {
    if (!window.matchMedia) return;
    if (!matchMedia('(hover: hover) and (pointer: fine)').matches) return;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const MAX = 3; // degrees
    document.querySelectorAll('.launch-tile').forEach((tile) => {
      let raf = 0;
      tile.addEventListener('pointermove', (e) => {
        const r = tile.getBoundingClientRect();
        const dx = (e.clientX - r.left) / r.width - 0.5;
        const dy = (e.clientY - r.top) / r.height - 0.5;
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(() => {
          tile.style.transform = `perspective(700px) rotateX(${(-dy * MAX).toFixed(2)}deg) rotateY(${(dx * MAX).toFixed(2)}deg) translateY(-3px)`;
        });
      });
      tile.addEventListener('pointerleave', () => {
        cancelAnimationFrame(raf);
        tile.style.transform = '';
      });
    });
  })();

  // ── (9) CAROUSELS — enhance [data-carousel] grids into snap rails ───────────
  // Markup contract: <div class="guide-cards" data-carousel="3" data-carousel-m="1.12">.
  // The container keeps its own classes (no-JS = original grid); we wrap it,
  // promote it to a scroll-snap viewport and mount arrows + dots. RTL-safe:
  // navigation targets real child offsets via scrollIntoView(inline).
  (function () {
    const reduced = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    document.querySelectorAll('[data-carousel]').forEach((grid) => {
      if (grid.dataset.carouselReady) return;
      grid.dataset.carouselReady = '1';
      const kids = Array.from(grid.children).filter((c) => c.tagName !== 'TEMPLATE');
      if (kids.length < 2) return;
      const n = parseFloat(grid.dataset.carousel) || 3;
      const wrap = document.createElement('div');
      wrap.className = 'carousel';
      grid.parentNode.insertBefore(wrap, grid);
      wrap.appendChild(grid);
      grid.classList.add('carousel__viewport');
      grid.style.setProperty('--car-nd', n);
      if (grid.dataset.carouselM) grid.style.setProperty('--car-nm', grid.dataset.carouselM);
      if (grid.dataset.carouselT) grid.style.setProperty('--car-nt', grid.dataset.carouselT);
      grid.setAttribute('tabindex', '-1');

      const mkBtn = (dir, label, path) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'carousel__btn carousel__btn--' + dir;
        b.setAttribute('aria-label', label);
        b.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="' + path + '"/></svg>';
        wrap.appendChild(b);
        return b;
      };
      // Chevrons are direction-agnostic glyphs: "prev" points toward inline-start.
      const rtl = (document.documentElement.dir || 'rtl') === 'rtl';
      const prev = mkBtn('prev', 'הקודם', rtl ? 'M9 6l6 6-6 6' : 'M15 6l-6 6 6 6');
      const next = mkBtn('next', 'הבא', rtl ? 'M15 6l-6 6 6 6' : 'M9 6l6 6-6 6');
      const dots = document.createElement('div');
      dots.className = 'carousel__dots';
      wrap.appendChild(dots);

      let pages = [];   // index of the first child of each snap page
      let cur = 0;
      const perView = () => Math.max(1, Math.round(parseFloat(getComputedStyle(grid).getPropertyValue('--car-n')) || n));
      const rebuildPages = () => {
        const pv = perView();
        pages = [];
        for (let i = 0; i < kids.length; i += pv) pages.push(i);
        dots.innerHTML = '';
        // Long rails (guide libraries) would spray dozens of dots — swap to a
        // slim progress bar past 10 pages; short rails keep tappable dots.
        if (pages.length > 10) {
          dots.classList.add('carousel__dots--bar');
          dots.innerHTML = '<span class="carousel__bar" aria-hidden="true"><span class="carousel__bar-fill"></span></span>';
          return;
        }
        dots.classList.remove('carousel__dots--bar');
        pages.forEach((_, pi) => {
          const d = document.createElement('button');
          d.type = 'button';
          d.className = 'carousel__dot';
          d.setAttribute('aria-label', 'מעבר לעמוד ' + (pi + 1) + ' מתוך ' + pages.length);
          d.addEventListener('click', () => goTo(pi));
          dots.appendChild(d);
        });
      };
      const goTo = (pi) => {
        pi = Math.max(0, Math.min(pages.length - 1, pi));
        kids[pages[pi]].scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', inline: 'start', block: 'nearest' });
      };
      const sync = () => {
        const hasOverflow = grid.scrollWidth > grid.clientWidth + 4;
        wrap.classList.toggle('carousel--no-overflow', !hasOverflow);
        if (!hasOverflow) return;
        // Current page = the page whose first child's start edge is nearest the
        // viewport's start edge (right edge in RTL).
        const vp = grid.getBoundingClientRect();
        const startOf = (el) => { const r = el.getBoundingClientRect(); return rtl ? vp.right - r.right : r.left - vp.left; };
        let best = 0, bestDist = Infinity;
        pages.forEach((ki, pi) => {
          const d = Math.abs(startOf(kids[ki]));
          if (d < bestDist) { bestDist = d; best = pi; }
        });
        cur = best;
        const fill = dots.querySelector('.carousel__bar-fill');
        if (fill) {
          fill.style.width = Math.round(((cur + 1) / pages.length) * 100) + '%';
        } else {
          Array.from(dots.children).forEach((d, pi) => {
            if (pi === cur) d.setAttribute('aria-current', 'true');
            else d.removeAttribute('aria-current');
          });
        }
        // End state: disable at the true scroll extents, not just page math.
        const max = grid.scrollWidth - grid.clientWidth - 2;
        const pos = Math.abs(grid.scrollLeft);
        prev.disabled = pos <= 2;
        next.disabled = pos >= max;
      };
      prev.addEventListener('click', () => goTo(cur - 1));
      next.addEventListener('click', () => goTo(cur + 1));
      let raf = 0;
      grid.addEventListener('scroll', () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(sync); }, { passive: true });
      if (window.ResizeObserver) new ResizeObserver(() => { rebuildPages(); sync(); }).observe(grid);
      rebuildPages();
      sync();
    });
  })();

  // ── (10) HERO FINDER — the answer-in-10-seconds widget ──────────────────────
  // Hydrates #heroFinder from the build-stamped window.__HERO_PLANS__ blob
  // (8 cheapest monthly plans per category, refreshed on every catalogue
  // rebuild). Pure client-side: pick a category, drag "what I pay today",
  // and the three cheapest real plans + the yearly saving render instantly.
  (function () {
    var data = window.__HERO_PLANS__;
    var root = document.getElementById('heroFinder');
    if (!root || !data || !data.cellular || !data.cellular.length) return;
    root.hidden = false;
    var bill = document.getElementById('finderBill');
    var out = document.getElementById('finderBillOut');
    var res = document.getElementById('finderResults');
    var save = document.getElementById('finderSave');
    if (!bill || !out || !res || !save) return;
    var RANGES = { cellular: [20, 200, 60], internet: [40, 300, 120], tv: [30, 300, 100], triple: [80, 500, 250] };
    var cat = 'cellular';
    // Memory + deep-link: restore the visitor's last category/bill, and honor
    // a shareable #finder=<cat>-<bill> fragment (which also wins over memory).
    var MEMKEY = 'switchy-finder';
    // A11y: mirror the visual is-active selection as aria-pressed (WCAG 4.1.2),
    // matching the other chip groups (quick filters, plans, booking categories).
    root.querySelectorAll('.finder__cat').forEach(function (b) { b.setAttribute('aria-pressed', String(b.classList.contains('is-active'))); });
    try {
      var mem = JSON.parse(localStorage.getItem(MEMKEY) || 'null');
      if (mem && RANGES[mem.cat]) { cat = mem.cat; }
      var m = /#finder=([a-z]+)-(\d+)/.exec(location.hash);
      if (m && RANGES[m[1]]) { cat = m[1]; mem = { cat: cat, bill: Number(m[2]) }; }
      if (mem && Number.isFinite(Number(mem.bill))) {
        var r0 = RANGES[cat];
        bill.min = r0[0]; bill.max = r0[1];
        bill.value = Math.max(r0[0], Math.min(r0[1], Number(mem.bill)));
      } else if (cat !== 'cellular') {
        var r1 = RANGES[cat];
        bill.min = r1[0]; bill.max = r1[1]; bill.value = r1[2];
      }
      root.querySelectorAll('.finder__cat').forEach(function (b) { var on = b.dataset.cat === cat; b.classList.toggle('is-active', on); b.setAttribute('aria-pressed', String(on)); });
      if (m) setTimeout(function () { root.scrollIntoView({ block: 'center' }); }, 150);
    } catch (_) {}
    var remember = function () {
      try { localStorage.setItem(MEMKEY, JSON.stringify({ cat: cat, bill: Number(bill.value) })); } catch (_) {}
    };
    var escEl = document.createElement('span');
    var esc = function (t) { escEl.textContent = t == null ? '' : String(t); return escEl.innerHTML; };
    var fmt = function (v) { return '₪' + Number(v).toLocaleString('he-IL'); };
    function render() {
      var list = (data[cat] || []).slice(0, 3);
      res.innerHTML = list.map(function (p) {
        var msg = encodeURIComponent('היי, מעניין אותי ' + p.p + ' - ' + p.n + ' (₪' + p.pr + ')');
        return '<a class="finder__row" target="_blank" rel="noopener" href="https://wa.me/972505037537?text=' + msg + '">' +
          '<span class="finder__meta"><b class="finder__prov">' + esc(p.p) + '</b><span class="finder__plan">' + esc(p.n) + '</span></span>' +
          (p.net ? '<span class="finder__net">' + esc(p.net) + '</span>' : '') +
          '<b class="finder__price" dir="ltr">₪' + p.pr + '</b></a>';
      }).join('');
      var best = list[0];
      var meter = document.getElementById('finderMeter');
      var fill = document.getElementById('finderMeterFill');
      if (best) {
        var yearly = Math.max(0, Math.round((Number(bill.value) - best.pr) * 12));
        save.innerHTML = yearly > 0
          ? 'לפי מה שאתם משלמים היום — תחסכו עד <b>' + fmt(yearly) + '</b> בשנה'
          : 'אתם כבר במחיר מצוין — שווה לוודא מול ההשוואה המלאה';
        // Savings meter: honest arithmetic as a feel-able bar (₪1,500/yr = full).
        if (meter && fill) {
          meter.hidden = yearly <= 0;
          var pct = Math.max(0.04, Math.min(1, yearly / 1500));
          fill.style.transform = 'scaleX(' + pct + ')';
          meter.classList.toggle('is-great', yearly >= 600);
        }
      } else {
        save.textContent = '';
        if (meter) meter.hidden = true;
      }
    }
    root.querySelectorAll('.finder__cat').forEach(function (btn) {
      btn.addEventListener('click', function () {
        cat = btn.dataset.cat;
        root.querySelectorAll('.finder__cat').forEach(function (b) { var on = b === btn; b.classList.toggle('is-active', on); b.setAttribute('aria-pressed', String(on)); });
        var r = RANGES[cat] || RANGES.cellular;
        bill.min = r[0]; bill.max = r[1]; bill.value = r[2];
        out.textContent = fmt(bill.value);
        render();
        remember();
      });
    });
    var raf = 0;
    bill.addEventListener('input', function () {
      out.textContent = fmt(bill.value);
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(function () { render(); remember(); });
    }, { passive: true });
    out.textContent = fmt(bill.value);
    render();
  })();

  // ── (11) DEAL TICKER — rotate the build-stamped deal-of-day items ───────────
  // A11y: non-active items are opacity:0 but would otherwise stay in the
  // accessibility tree AND the tab order (they're links — pointer-events:none
  // blocks the mouse, not keyboard focus), so only the visible item is exposed:
  // the rest get aria-hidden + tabindex="-1". Rotation pauses while the ticker
  // is hovered or holds keyboard focus (WCAG 2.2.2 pause/stop/hide) and never
  // starts under prefers-reduced-motion.
  (function () {
    var ticker = document.getElementById('dealTicker');
    var wrap = ticker && ticker.querySelector('.ticker__inner');
    if (!wrap) return;
    var items = Array.from(wrap.querySelectorAll('.ticker__item'));
    if (!items.length) return;
    var i = 0;
    var show = function (idx) {
      items.forEach(function (el, j) {
        var on = j === idx;
        el.classList.toggle('is-on', on);
        if (on) {
          el.removeAttribute('aria-hidden');
          el.removeAttribute('tabindex');
        } else {
          el.setAttribute('aria-hidden', 'true');
          el.setAttribute('tabindex', '-1');
        }
      });
    };
    show(0);
    if (items.length < 2) return;
    if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    var paused = false;
    ticker.addEventListener('mouseenter', function () { paused = true; });
    ticker.addEventListener('mouseleave', function () { paused = false; });
    ticker.addEventListener('focusin', function () { paused = true; });
    ticker.addEventListener('focusout', function (e) {
      if (!ticker.contains(e.relatedTarget)) paused = false;
    });
    setInterval(function () {
      if (paused) return;
      i = (i + 1) % items.length;
      show(i);
    }, 6000);
  })();

  // ── (12) COMPARE TRAY — "add to compare" everywhere ─────────────────────────
  // The scale icon on every plan card becomes a TOGGLE into a persistent
  // (localStorage) tray of up to 3 plans; a sticky bottom bar deep-links to
  // compare.html?p0&p1&p2 (already supported there). Without JS the icon stays
  // a plain link that opens compare preselected with that one plan.
  (function () {
    var links = Array.from(document.querySelectorAll('.plan__compare'));
    var KEY = 'switchy-cmp';
    var read = function () {
      try { var v = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(v) ? v.slice(0, 3) : []; }
      catch (_) { return []; }
    };
    var write = function (list) { try { localStorage.setItem(KEY, JSON.stringify(list.slice(0, 3))); } catch (_) {} };
    var idOf = function (a) {
      try { return new URLSearchParams((a.getAttribute('href') || '').split('?')[1] || '').get('p0'); }
      catch (_) { return null; }
    };

    // compare.html: with no explicit ?p0 in the URL, prefill from the tray.
    if (/compare\.html$/.test(location.pathname) || location.pathname === '/compare') {
      if (!new URLSearchParams(location.search).get('p0')) {
        var tray0 = read();
        if (tray0.length) {
          var picks = ['cmp0', 'cmp1', 'cmp2'].map(function (id) { return document.getElementById(id); });
          tray0.forEach(function (id, i) {
            if (picks[i] && picks[i].querySelector('option[value="' + CSS.escape(id) + '"]')) {
              picks[i].value = id;
              picks[i].dispatchEvent(new Event('change'));
            }
          });
        }
      }
    }
    if (!links.length) return;

    var bar = document.createElement('div');
    bar.className = 'cmp-tray';
    bar.setAttribute('role', 'region');
    bar.setAttribute('aria-label', 'מסלולים שנבחרו להשוואה');
    bar.innerHTML = '<span class="cmp-tray__count"></span>' +
      '<a class="btn btn--primary btn--sm cmp-tray__go" href="compare.html">השוו עכשיו ←</a>' +
      '<button type="button" class="cmp-tray__clear" aria-label="ניקוי הבחירה">✕</button>';
    document.body.appendChild(bar);
    var countEl = bar.querySelector('.cmp-tray__count');
    var goEl = bar.querySelector('.cmp-tray__go');

    function sync() {
      var tray = read();
      links.forEach(function (a) {
        var on = tray.indexOf(idOf(a)) !== -1;
        a.classList.toggle('is-in', on);
        a.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
      if (!tray.length) { bar.classList.remove('is-on'); return; }
      countEl.textContent = tray.length === 1 ? 'מסלול אחד נבחר להשוואה' : tray.length + ' מסלולים נבחרו להשוואה';
      var qs = tray.map(function (id, i) { return 'p' + i + '=' + encodeURIComponent(id); }).join('&');
      goEl.setAttribute('href', 'compare.html?' + qs);
      bar.classList.add('is-on');
    }
    links.forEach(function (a) {
      var id = idOf(a);
      if (!id) return;
      a.addEventListener('click', function (e) {
        e.preventDefault();
        var tray = read();
        var at = tray.indexOf(id);
        if (at !== -1) tray.splice(at, 1);
        else { if (tray.length >= 3) tray.shift(); tray.push(id); }
        write(tray);
        sync();
        if (typeof track === 'function') { try { track('compare_tray_toggle', { plan: id, size: tray.length }); } catch (_) {} }
      });
    });
    bar.querySelector('.cmp-tray__clear').addEventListener('click', function () { write([]); sync(); });
    sync();
  })();

  // ── (13) HOME COMMUNITY STRIP — "hot in the community right now" ────────────
  // Renders the 3 latest public posts into #homeFeed (homepage only). Any
  // failure leaves the section hidden — the homepage never shows an empty box.
  (function () {
    var host = document.getElementById('homeFeed');
    if (!host) return;
    sbRest('community_posts?select=id,author,channel,body,created_at&is_flagged=eq.false&order=created_at.desc&limit=3')
      .then(function (posts) {
        if (!Array.isArray(posts) || !posts.length) return;
        host.innerHTML = posts.map(function (post) {
          return '<a class="home-post" href="community.html#post-' + escHtmlS(String(post.id)) + '">' +
            '<span class="home-post__head"><b>' + escHtmlS(post.author || 'אנונימי') + '</b>' +
            '<span class="home-post__channel">' + escHtmlS(post.channel || 'כללי') + '</span>' +
            '<time>' + escHtmlS(relTimeHe(post.created_at)) + '</time></span>' +
            '<span class="home-post__body">' + escHtmlS(String(post.body || '').slice(0, 140)) + '</span>' +
          '</a>';
        }).join('');
        var section = host.closest('.home-community');
        if (section) section.hidden = false;
      })
      .catch(function () { /* stay hidden */ });
  })();

  // ── (14) COMMUNITY LEADERS — client-side leaderboard (posts + replies) ──────
  // Aggregates public author names from posts+replies (anon reads). Top 5 get
  // medal badges. Any failure → the section simply stays hidden.
  (function () {
    var host = document.getElementById('communityLeaders');
    if (!host) return;
    Promise.all([
      sbRest('community_posts?select=author&is_flagged=eq.false&limit=1000'),
      sbRest('community_replies?select=author&is_flagged=eq.false&limit=1000'),
    ]).then(function (res) {
      var counts = {};
      res.forEach(function (rows, ri) {
        (rows || []).forEach(function (r) {
          var a = (r && r.author || '').trim();
          if (!a) return;
          counts[a] = counts[a] || { posts: 0, replies: 0 };
          if (ri === 0) counts[a].posts += 1; else counts[a].replies += 1;
        });
      });
      var top = Object.entries(counts)
        .map(function (e) { return { name: e[0], posts: e[1].posts, replies: e[1].replies, score: e[1].posts * 2 + e[1].replies }; })
        .sort(function (a, b) { return b.score - a.score; })
        .slice(0, 5);
      if (!top.length) return;
      var medals = ['leaders__medal--gold', 'leaders__medal--silver', 'leaders__medal--bronze'];
      host.innerHTML = top.map(function (u, i) {
        var parts = [];
        if (u.posts) parts.push(u.posts === 1 ? 'פוסט אחד' : u.posts + ' פוסטים');
        if (u.replies) parts.push(u.replies === 1 ? 'תגובה אחת' : u.replies + ' תגובות');
        return '<li class="leaders__row">' +
          '<span class="leaders__medal ' + (medals[i] || '') + '">' + (i + 1) + '</span>' +
          '<span class="leaders__avatar" aria-hidden="true">' + escHtmlS(u.name.charAt(0)) + '</span>' +
          '<span class="leaders__meta"><b>' + escHtmlS(u.name) + '</b><span>' + escHtmlS(parts.join(' · ')) + '</span></span>' +
        '</li>';
      }).join('');
      var section = host.closest('.community-leaders');
      if (section) section.hidden = false;
    }).catch(function () { /* stay hidden */ });
  })();

  // ── (19) LIVE PRICE-DROP BADGES — real history, never fabricated ───────────
  // For the plan cards on the page, read plan_price_history (anon; may not be
  // exposed — any error is total silence) and chip the cards whose LATEST
  // recorded price is lower than the previous one within the last 30 days.
  // Price rises get no chip (inform, don't alarm — the after-price already
  // covers honesty on the way up).
  (() => {
    const cards = Array.from(document.querySelectorAll('.plan[data-id]'))
      .filter((c) => c.getAttribute('data-id'));
    if (!cards.length) return;
    const ids = [...new Set(cards.map((c) => c.getAttribute('data-id')))].slice(0, 80);
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    sbRest('plan_price_history?select=plan_id,price,recorded_at' +
      '&plan_id=in.(' + ids.map(encodeURIComponent).join(',') + ')' +
      '&recorded_at=gte.' + encodeURIComponent(since) + '&order=recorded_at.desc&limit=600')
      .then((rows) => {
        if (!Array.isArray(rows) || !rows.length) return;
        const byId = {};
        rows.forEach((r) => { (byId[r.plan_id] = byId[r.plan_id] || []).push(r); });
        cards.forEach((card) => {
          const hist = byId[card.getAttribute('data-id')];
          if (!hist || hist.length < 2) return;
          const latest = Number(hist[0].price);
          const prev = Number(hist[1].price);
          if (!(latest < prev)) return;
          if (card.querySelector('.plan__drop')) return;
          const when = relTimeHe(hist[0].recorded_at);
          const chip = document.createElement('span');
          chip.className = 'plan__drop';
          chip.title = 'המחיר ירד מ-₪' + prev + ' ל-₪' + latest + (when ? ' (' + when + ')' : '');
          chip.textContent = '↓ המחיר ירד';
          card.appendChild(chip);
        });
      })
      .catch(() => { /* history not exposed / offline — stay silent */ });
  })();

  // ── (18) MEETING NUDGE — one respectful Zoom prompt per week ───────────────
  // Deep-scroll (65%) on category/provider pages, or desktop exit-intent, shows
  // a single dismissible glass card inviting a free Zoom meeting. Hard caps:
  // once per 7 days (localStorage), never after visiting book.html, honest copy,
  // instant exit. No dark patterns.
  (() => {
    // Visiting the booking page at all silences the nudge for good.
    if (/book\.html/.test(location.pathname)) {
      try { localStorage.setItem('switchy-booked', '1'); } catch (_) { /* private mode */ }
      return;
    }
    const isTarget = /(cellular|internet|tv|triple|abroad|provider-|plans|deals)/.test(location.pathname) || document.querySelector('.lead-hero--cat');
    if (!isTarget) return;
    const KEY = 'switchy-meet-nudge';
    const now = Date.now();
    try {
      if (localStorage.getItem('switchy-booked') === '1') return;
      const last = Number(localStorage.getItem(KEY) || 0);
      if (now - last < 7 * 24 * 60 * 60 * 1000) return;
    } catch (_) { return; }
    let shown = false;
    const show = () => {
      if (shown) return;
      shown = true;
      try { localStorage.setItem(KEY, String(now)); } catch (_) { /* private mode */ }
      const el = document.createElement('div');
      el.className = 'meet-nudge';
      el.setAttribute('role', 'complementary');
      el.setAttribute('aria-label', 'הזמנה לפגישת ייעוץ בזום');
      el.innerHTML =
        '<button type="button" class="meet-nudge__x" aria-label="סגירת ההצעה">✕</button>' +
        '<div class="meet-nudge__ico" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="6" width="13" height="12" rx="2.5"/><path d="m15.5 10.5 6-3.5v10l-6-3.5"/></svg></div>' +
        '<p><b>מתלבטים בין מסלולים?</b> נציג עובר איתכם על הכול בפגישת Zoom חינם של 30 דק׳ — פנים מול פנים, בלי התחייבות.</p>' +
        '<a class="btn btn--primary" href="book.html">קבעו פגישה ←</a>';
      document.body.appendChild(el);
      el.querySelector('.meet-nudge__x').addEventListener('click', () => el.remove());
      el.querySelector('a').addEventListener('click', () => track('cta_click', { location: 'nudge', label: 'zoom', source: location.pathname }));
      track('meet_nudge_shown', { source: location.pathname });
    };
    let ticking = false;
    window.addEventListener('scroll', () => {
      if (ticking || shown) return;
      ticking = true;
      requestAnimationFrame(() => {
        const h = document.documentElement;
        if (h.scrollHeight > h.clientHeight && (window.scrollY + h.clientHeight) / h.scrollHeight > 0.65) show();
        ticking = false;
      });
    }, { passive: true });
    if (window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
      document.addEventListener('mouseout', (e) => {
        if (!shown && !e.relatedTarget && e.clientY <= 0) show();
      });
    }
  })();

  // ── (17) CATEGORY QUICK FILTERS — sticky chips + live result count ─────────
  // Mirrors the plans.html filter logic on category pages: flag chips + max
  // price, a live "מציג X מתוך Y" counter and a clear-all that appears only
  // when something is filtered. Pure show/hide on the pre-rendered cards.
  (() => {
    const grid = $('catPlanGrid');
    const bar = $('catFilters');
    if (!grid || !bar) return;
    const cards = Array.from(grid.querySelectorAll('.plan'));
    const total = Number(grid.getAttribute('data-total')) || cards.length;
    const chips = Array.from(bar.querySelectorAll('.flag-chip'));
    const maxEl = $('catMaxPrice');
    const countEl = $('catCount');
    const clearEl = $('catClear');
    const emptyEl = $('catEmpty');
    const flagKey = { '5g': 'data-5g', nocommit: 'data-nocommit', abroad: 'data-abroad', haspromo: 'data-haspromo' };

    const apply = () => {
      const active = chips.filter((ch) => ch.classList.contains('active')).map((ch) => ch.dataset.flag);
      const maxPrice = maxEl && maxEl.value ? Number(maxEl.value) : Infinity;
      let shown = 0;
      for (const card of cards) {
        const okFlags = active.every((f) => card.getAttribute(flagKey[f]) === 'true');
        const okPrice = Number(card.dataset.price) <= maxPrice;
        const visible = okFlags && okPrice;
        card.style.display = visible ? '' : 'none';
        if (visible) shown++;
      }
      const filtering = active.length || maxPrice !== Infinity;
      if (countEl) countEl.textContent = filtering ? ('מציג ' + shown + ' מתוך ' + total + ' מסלולים') : ('מציג את כל ' + total + ' המסלולים');
      if (clearEl) clearEl.hidden = !filtering;
      if (emptyEl) emptyEl.hidden = shown > 0;
    };
    chips.forEach((ch) => ch.addEventListener('click', () => {
      const on = !ch.classList.contains('active');
      ch.classList.toggle('active', on);
      ch.setAttribute('aria-pressed', String(on));
      apply();
      track('cat_filter', { flag: ch.dataset.flag, on: on });
    }));
    if (maxEl) maxEl.addEventListener('input', apply);
    if (clearEl) clearEl.addEventListener('click', () => {
      chips.forEach((ch) => { ch.classList.remove('active'); ch.setAttribute('aria-pressed', 'false'); });
      if (maxEl) maxEl.value = '';
      apply();
    });
  })();

  // ── (16) SCROLL-DIRECTION FLAG — lets CSS tuck floating chrome away ────────
  // Reading down = the WhatsApp FAB hides (mobile CSS); any scroll up brings it
  // back. Passive + rAF-throttled; ignored near the top of the page.
  (() => {
    let lastY = 0;
    let ticking = false;
    window.addEventListener('scroll', () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const y = window.scrollY || 0;
        document.body.classList.toggle('is-scroll-down', y > lastY && y > 320);
        lastY = y;
        ticking = false;
      });
    }, { passive: true });
  })();

  // ── (15) PER-PLAN PRICE WATCH — "עקבו אחרי המסלול הזה" ─────────────────────
  // The bell on each plan card opens a small dialog: email + explicit §30A
  // consent → site-subscribe with topic 'plan:<id>' (stamped into the
  // subscriber's source, feeding savings-watch). Followed plan ids persist in
  // localStorage so the bell stays filled. Fail-soft: submit errors just toast.
  (() => {
    if (!document.querySelector('.plan__watch')) return;
    const KEY = 'switchy-watch';
    const read = () => {
      try { const v = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(v) ? v : []; } catch (_) { return []; }
    };
    const save = (list) => { try { localStorage.setItem(KEY, JSON.stringify(list.slice(-40))); } catch (_) { /* private mode */ } };
    const paint = () => {
      const list = read();
      document.querySelectorAll('.plan__watch').forEach((b) => {
        const on = list.includes(b.getAttribute('data-watch'));
        b.classList.toggle('is-on', on);
        b.setAttribute('aria-pressed', String(on));
      });
    };
    paint();

    let modal = null;
    let current = null;
    const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const build = () => {
      modal = document.createElement('div');
      modal.className = 'pmodal watch-modal';
      modal.id = 'watchModal';
      modal.setAttribute('role', 'dialog');
      modal.setAttribute('aria-modal', 'true');
      modal.setAttribute('aria-labelledby', 'watchTitle');
      modal.hidden = true;
      modal.innerHTML =
        '<div class="pmodal__backdrop" data-watch-close></div>' +
        '<div class="pmodal__panel watch-modal__panel" role="document">' +
          '<button type="button" class="pmodal__x" data-watch-close aria-label="סגירת החלון">✕</button>' +
          '<h3 class="watch-modal__title" id="watchTitle">מעקב מחיר</h3>' +
          '<p class="watch-modal__lead" id="watchLead"></p>' +
          '<form class="watch-modal__form" id="watchForm" novalidate>' +
            '<input class="watch-modal__email" id="watchEmail" type="email" placeholder="האימייל שלכם" autocomplete="email" inputmode="email" aria-label="כתובת אימייל לעדכוני מחיר" required />' +
            '<label class="watch-modal__consent" for="watchConsent"><input type="checkbox" id="watchConsent" required /> אני מאשר/ת קבלת עדכוני מחיר והזדמנויות חיסכון במייל (אפשר לבטל בכל עת)</label>' +
            '<button class="btn btn--primary watch-modal__go" type="submit">עקבו אחרי המסלול ←</button>' +
          '</form>' +
          '<p class="watch-modal__note">בלי ספאם — נכתוב רק כשיש חיסכון אמיתי במסלול הזה.</p>' +
        '</div>';
      document.body.appendChild(modal);
      const close = () => { modal.classList.remove('pmodal--open'); modal.hidden = true; };
      modal.addEventListener('click', (e) => { if (e.target.closest && e.target.closest('[data-watch-close]')) close(); });
      document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !modal.hidden) close(); });
      const form = modal.querySelector('#watchForm');
      const emailEl = modal.querySelector('#watchEmail');
      const consentEl = modal.querySelector('#watchConsent');
      const go = modal.querySelector('.watch-modal__go');
      let busy = false;
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (busy || !current) return;
        const email = (emailEl.value || '').trim();
        if (!EMAIL_RE.test(email)) { emailEl.setAttribute('aria-invalid', 'true'); emailEl.focus(); toast('נא להזין כתובת אימייל תקינה', 'error'); return; }
        emailEl.removeAttribute('aria-invalid');
        if (!consentEl.checked) { consentEl.focus(); toast('יש לאשר קבלת עדכונים כדי לעקוב', 'error'); return; }
        busy = true;
        go.disabled = true;
        const label = go.textContent;
        go.textContent = 'נרשם…';
        try {
          await callAiFunction('site-subscribe', { email: email, consent: true, topic: 'plan:' + current.id });
          track('price_watch', { plan: current.id });
          const list = read();
          if (!list.includes(current.id)) { list.push(current.id); save(list); }
          paint();
          // One celebratory ring on the bell that was just armed (CSS one-shot).
          document.querySelectorAll('.plan__watch[data-watch="' + (window.CSS && CSS.escape ? CSS.escape(current.id) : current.id) + '"]').forEach((b) => {
            b.classList.add('just-on');
            b.addEventListener('animationend', () => b.classList.remove('just-on'), { once: true });
          });
          close();
          toast('במעקב! נעדכן אתכם כשהמחיר של ' + current.name + ' יורד', 'success');
        } catch (_) {
          toast('ההרשמה נכשלה — נסו שוב בעוד רגע', 'error');
        }
        go.disabled = false;
        go.textContent = label;
        busy = false;
      });
    };

    const open = (btn) => {
      if (!modal) build();
      current = { id: btn.getAttribute('data-watch') || '', name: btn.getAttribute('data-watch-name') || 'המסלול' };
      const lead = modal.querySelector('#watchLead');
      lead.textContent = read().includes(current.id)
        ? current.name + ' כבר במעקב אצלכם — אפשר להוסיף כתובת מייל נוספת.'
        : 'נעדכן אתכם במייל כשהמחיר של ' + current.name + ' יורד, או כשמופיעה חלופה זולה יותר.';
      modal.hidden = false;
      requestAnimationFrame(() => modal.classList.add('pmodal--open'));
      modal.querySelector('#watchEmail').focus();
    };
    document.addEventListener('click', (e) => {
      const b = e.target.closest && e.target.closest('.plan__watch');
      if (b) { e.preventDefault(); open(b); }
    });
  })();
})();
