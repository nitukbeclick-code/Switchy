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
    try { if (typeof window.plausible === 'function') window.plausible(name, props ? { props: props } : undefined); } catch (_) { /* analytics is best-effort */ }
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
        const res = await fetch(cfg.url.replace(/\/$/, '') + '/functions/v1/' + AI_CHAT_FUNCTION, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', apikey: cfg.anonKey, Authorization: 'Bearer ' + cfg.anonKey },
          body: JSON.stringify({ message: q, history: aiHistory }),
        });
        const data = await res.json().catch(() => ({}));
        typing.remove();
        if (!res.ok || !data.reply) throw new Error('ai chat failed: ' + res.status);
        addBubble('ai-bubble--bot', data.reply);
        aiHistory.push({ role: 'user', text: q }, { role: 'bot', text: data.reply });
        if (aiHistory.length > 12) aiHistory.splice(0, aiHistory.length - 12);
      } catch (_) {
        typing.remove();
        addBubble('ai-bubble--bot', 'לא הצלחתי להתחבר כרגע — נסו שוב בעוד רגע, או דברו איתנו בוואטסאפ 💬');
      }
      aiBusy = false;
      setChipsBusy(false);
      if (aiInput) { aiInput.removeAttribute('aria-busy'); aiInput.focus(); }
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
})();
