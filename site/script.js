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
    reveals.forEach((el) => io.observe(el));
  } else {
    reveals.forEach((el) => el.classList.add('in'));
  }

  // ── Cookieless analytics events ────────────────────────────────────────────
  // Thin wrapper over the Plausible-style queue (defined inline in <head>).
  // Privacy-respecting: event names + coarse props only, never personal data.
  const track = (name, props) => {
    try { if (typeof window.gtag === 'function') window.gtag('event', name, props || undefined); } catch (_) { /* analytics is best-effort */ }
  };

  // Fire a conversion event whenever a WhatsApp link is clicked (lead intent),
  // tagging which surface it came from. Delegated so it also covers links that
  // script.js injects later (compare table CTAs, plan cards).
  document.addEventListener('click', (e) => {
    const a = e.target.closest && e.target.closest('a[href*="wa.me"]');
    if (a) track('whatsapp_click', { source: location.pathname });
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
    const res = await fetch(cfg.url.replace(/\/$/, '') + '/rest/v1/leads', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: cfg.anonKey,
        Authorization: 'Bearer ' + cfg.anonKey,
        Prefer: 'return=minimal',
      },
      body: JSON.stringify(lead),
    });
    // fetch resolves on HTTP errors too — a rejected insert (validation gate,
    // rate limit) must not be presented to the visitor as success.
    if (!res.ok) throw new Error('lead rejected: ' + res.status);
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
      } catch (_) {
        sent = false;
      }
      if (btn) { btn.disabled = false; btn.classList.remove('is-loading'); if (btnLabel) btn.textContent = btnLabel; }
      if (!sent) {
        if (note) { note.classList.add('cta__note--err'); note.textContent = 'השליחה נכשלה — נסו שוב, או כתבו לנו בוואטסאפ 💬'; }
        toast('השליחה נכשלה — נסו שוב בעוד רגע', 'error');
        if (btn) btn.focus(); // keep focus on the retry affordance
        return;
      }
      track('lead_submit', { source: location.pathname });
      form.reset();
      fieldError(nameEl, null);
      fieldError(phoneEl, null);
      if (note) {
        note.classList.remove('cta__note--err');
        note.textContent = 'תודה ' + name.split(' ')[0] + '! נחזור אליך בהקדם ✦';
      }
      toast('תודה ' + name.split(' ')[0] + '! נחזור אליך בהקדם', 'success');
      showReferralShare();
    });
    // form_start — fires once, the moment the visitor first engages the form.
    let formStarted = false;
    form.addEventListener('focusin', () => {
      if (formStarted) return;
      formStarted = true;
      track('form_start', { source: location.pathname });
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
      const priceCell = (p) =>
        `<span class="cmp-price">₪${escHtml(p.price)}</span><small> ${per}</small>` +
        (p.after && Number(p.after) !== Number(p.price) ? `<small class="cmp-after">ואז ₪${escHtml(p.after)}</small>` : '');
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
        `<table class="cmp-table"><thead><tr><th></th>${cols}</tr></thead><tbody>${rows.join('')}${ctaRow}</tbody></table>`;
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
      b.setAttribute('aria-label', 'חוסך AI כותב תשובה');
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
                notes: 'נשלח מצ׳אט חוסך AI באתר',
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
    stickyBar.innerHTML = '<button type="button" class="btn btn--primary">קבלו השוואה חינם ←</button>';
    document.body.appendChild(stickyBar);
    const stickyBtn = stickyBar.querySelector('button');
    stickyBtn.addEventListener('click', () => {
      track('sticky_cta_click', { source: location.pathname });
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
    pairs.forEach((pair) => {
      if (!pair.trigger.hasAttribute('aria-expanded')) pair.trigger.setAttribute('aria-expanded', 'false');
      if (!pair.trigger.hasAttribute('aria-haspopup')) pair.trigger.setAttribute('aria-haspopup', 'true');
      pair.panel.hidden = pair.panel.classList.contains('is-open') ? false : true;
      pair.trigger.addEventListener('click', (e) => {
        e.preventDefault();
        const open = pair.trigger.getAttribute('aria-expanded') !== 'true';
        closeAll(pair);
        setOpen(pair, open);
      });
      // Esc anywhere within the menu/trigger closes it and restores focus.
      const onKey = (e) => { if (e.key === 'Escape') { setOpen(pair, false); pair.trigger.focus(); } };
      pair.trigger.addEventListener('keydown', onKey);
      pair.panel.addEventListener('keydown', onKey);
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
    // Keyboard affordance: clicking the zone opens the picker; the zone is a
    // labelled button for AT, the file input does the actual work.
    if (!drop.hasAttribute('role')) drop.setAttribute('role', 'button');
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
      const consent = consentEl ? !!consentEl.checked : true;
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

    // Channel chip for a post (falls back to "כללי" when unset).
    const channelChip = (ch) =>
      '<span class="post-card__channel">' + escHtmlS(ch || 'כללי') + '</span>';

    const mediaHtml = (type, url) => {
      if (type !== 'image' || !url) return '';
      // Only the safe URL forms; escape the attribute. The img is decorative
      // context for the post body, so alt stays empty.
      return '<div class="post-card__media"><img src="' + escHtmlS(url) +
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
      const avatar = post.avatar
        ? '<img class="post-card__avatar" src="' + escHtmlS(post.avatar) + '" alt="" loading="lazy" decoding="async">'
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
        '<button type="button" class="post-card__toggle" aria-expanded="false" aria-controls="' + repliesId + '">הצגת תגובות</button>' +
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

      (async () => {
        feed.setAttribute('aria-busy', 'true');
        feed.innerHTML = '<p class="community__loading">טוען את הקהילה…</p>';
        try {
          const posts = await sbRest('community_posts?select=id,author,avatar,channel,body,media_type,media_url,created_at' +
            '&is_flagged=eq.false&order=created_at.desc&limit=30');
          allPosts = Array.isArray(posts) ? posts : [];
          buildFilter();
          paintFeed();
        } catch (_) {
          feed.innerHTML = '<p class="community__error">לא הצלחנו לטעון את הקהילה כרגע — נסו שוב בעוד רגע, או פתחו את האפליקציה 💬</p>';
        }
        feed.removeAttribute('aria-busy');
      })();
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

      (async () => {
        ratingsHost.setAttribute('aria-busy', 'true');
        ratingsHost.innerHTML = '<p class="ratings__loading">טוען דירוגים…</p>';
        try {
          const rows = await sbRest('provider_rating_summary?select=*');
          const summary = Array.isArray(rows) ? rows.slice() : [];
          summary.sort((a, b) => (Number(b.avg_stars) || 0) - (Number(a.avg_stars) || 0));
          if (!summary.length) {
            ratingsHost.innerHTML = '<p class="ratings__empty">אין עדיין מספיק דירוגים — דרגו ספקים באפליקציה.</p>';
          } else {
            ratingsHost.innerHTML = '<div class="ratings__grid">' + summary.map((r) => {
              const avg = (Number(r.avg_stars) || 0).toFixed(1);
              const count = Number(r.review_count) || 0;
              return '<div class="rating-card">' +
                '<strong class="rating-card__provider">' + escHtmlS(r.provider) + '</strong>' +
                stars(r.avg_stars) +
                '<span class="rating-card__score">' + escHtmlS(avg) + '</span>' +
                '<span class="rating-card__count">' + count + (count === 1 ? ' חוות דעת' : ' חוות דעת') + '</span>' +
                '</div>';
            }).join('') + '</div>';
          }
        } catch (_) {
          ratingsHost.innerHTML = '<p class="ratings__error">לא הצלחנו לטעון דירוגים כרגע — נסו שוב בעוד רגע.</p>';
        }
        ratingsHost.removeAttribute('aria-busy');
      })();

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
            reviewsHost.innerHTML = '<p class="ratings__error">לא הצלחנו לטעון חוות דעת כרגע.</p>';
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

    const PROVIDERS = ['HOT', 'yes', 'פרטנר', 'סלקום', 'STING TV', 'בזק', 'הוט מובייל'];
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
    const btn = form.querySelector('button[type="submit"]');
    const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    let chosenProvider = '';
    let chosenSlot = '';
    let busy = false;

    const setNote = (msg, isErr) => {
      if (!noteEl) return;
      noteEl.textContent = msg || '';
      noteEl.classList.toggle('booking__note--err', !!isErr);
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

    // ── Slots for the chosen date (30-min grid, ≥4h from now) ────────────────
    const buildSlots = () => {
      if (!slotHost) return;
      chosenSlot = '';
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
        slotHost.appendChild(b);
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

    // ── Submit ───────────────────────────────────────────────────────────────
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (busy) return;

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
        return;
      }
      if (!chosenProvider) { setNote('בחרו ספק לפגישה 🙏', true); if (providersHost) providersHost.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center' }); return; }
      if (!dateSel || !dateSel.value) { setNote('בחרו תאריך לפגישה 🙏', true); if (dateSel) dateSel.focus(); return; }
      if (!chosenSlot) { setNote('בחרו שעה פנויה לפגישה 🙏', true); if (slotHost) slotHost.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center' }); return; }
      if (!termsOk || !privacyOk) {
        setNote('יש לאשר את תנאי השימוש ומדיניות הפרטיות כדי להמשיך 🙏', true);
        const badC = !termsOk ? termsEl : privacyEl;
        if (badC) badC.focus();
        return;
      }

      const now = new Date().toISOString();
      const payload = {
        name: name,
        phone: phone,
        email: email,
        provider: chosenProvider,
        meeting_date: dateSel.value,
        slot: chosenSlot,
        source: 'site',
        terms_accepted_at: now,
        privacy_accepted_at: now,
        marketing_accepted_at: (marketingEl && marketingEl.checked) ? now : null,
      };

      busy = true;
      let btnLabel = '';
      if (btn) { btnLabel = btn.textContent; btn.disabled = true; btn.classList.add('is-loading'); btn.textContent = 'קובע פגישה…'; }
      try {
        await sbRest('meetings', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: payload });
        track('meeting_booked', { provider: chosenProvider });
        form.reset();
        chosenProvider = '';
        chosenSlot = '';
        Array.from(form.querySelectorAll('.booking__provider')).forEach((c) => { c.classList.remove('is-chosen'); c.setAttribute('aria-pressed', 'false'); });
        buildDates();
        buildSlots();
        setNote('תודה! נשלח אליכם קישור Zoom למייל מיד לאחר שנציג יאשר את הפגישה.', false);
        toast('תודה! נשלח אליכם קישור Zoom למייל לאחר אישור הנציג', 'success');
      } catch (err) {
        // Guard errors (e.g. 400) carry a friendly server message; prefer it.
        const msg = (err && err.detail) ? err.detail : 'לא הצלחנו לקבוע את הפגישה — בדקו את הפרטים ונסו שוב, או דברו איתנו בוואטסאפ 💬';
        setNote(msg, true);
        toast(msg, 'error');
        if (btn) btn.focus();
      }
      if (btn) { btn.disabled = false; btn.classList.remove('is-loading'); if (btnLabel) btn.textContent = btnLabel; }
      busy = false;
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
  // Opt-in layers: any descendant of .hero with [data-parallax] (or the legacy
  // .hero__bg / .hero__texture) translates at `data-parallax` × scroll (default
  // .25 bg-ish). rAF-batched, single scroll listener. Disabled under
  // reduced-motion and on touch/coarse pointers (where it just costs battery).
  (() => {
    if (reduceMotion) return;
    if (window.matchMedia('(hover: none)').matches || window.matchMedia('(pointer: coarse)').matches) return;
    const hero = document.querySelector('.hero');
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
    const list = (arr) => (arr || []).filter(Boolean).map((x) => `<li>${esc(x)}</li>`).join('');

    const render = (p) => {
      const unit = UNIT[p.priceUnit] || (p.cat === 'abroad' ? 'לחבילה' : 'לחודש');
      const price = '₪' + (p.priceExact != null ? p.priceExact : p.price);
      const afterVal = p.afterExact != null ? p.afterExact : p.after;
      const after = (p.after != null && p.after > p.price)
        ? `<span class="pmodal__after">ואז ₪${afterVal} ${esc(unit)}</span>`
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
          <div class="pmodal__price"><b>${price}</b> <span>${esc(unit)}</span> ${after}</div>
          ${flags.length ? `<div class="pmodal__flags">${flags.map((f) => `<span class="pmodal__flag">${esc(f)}</span>`).join('')}</div>` : ''}
        </header>
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
})();
