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
    billRange.addEventListener('input', updateCalc);
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
  if (form) {
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
      // Normalize to digits/+ — the leads gate rejects dots/parens/spaces.
      const phone = (phoneEl && phoneEl.value || '').replace(/[^\d+]/g, '');
      if (name.length < 2 || name.length > 80 || phone.replace(/\D/g, '').length < 9) {
        if (note) { note.classList.add('cta__note--err'); note.textContent = 'נא למלא שם וטלפון תקין 🙏'; }
        // Move focus to the first invalid field so keyboard/AT users land on it.
        const bad = (name.length < 2 || name.length > 80) ? nameEl : phoneEl;
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
        const badConsent = !termsOk ? termsEl : privacyEl;
        if (badConsent) badConsent.focus();
        return;
      }
      const now = new Date().toISOString();
      const marketingAt = $('consentMarketing') && $('consentMarketing').checked ? now : null;
      const priceAlert = $('consentPriceAlert') && $('consentPriceAlert').checked;
      const btn = form.querySelector('button[type="submit"]');
      if (btn) { btn.disabled = true; btn.classList.add('is-loading'); }
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
      if (btn) { btn.disabled = false; btn.classList.remove('is-loading'); }
      if (!sent) {
        if (note) { note.classList.add('cta__note--err'); note.textContent = 'השליחה נכשלה — נסו שוב, או כתבו לנו בוואטסאפ 💬'; }
        if (btn) btn.focus(); // keep focus on the retry affordance
        return;
      }
      track('lead_submit', { source: location.pathname });
      form.reset();
      if (note) {
        note.classList.remove('cta__note--err');
        note.textContent = 'תודה ' + name.split(' ')[0] + '! נחזור אליך בהקדם ✦';
      }
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
    // "Talk to a human" — calls the existing site-support-escalate function
    // (sends the last message + recent context + page to the team's Telegram).
    // Never blocks: any failure still shows the standard hand-off message.
    const aiEscalate = $('aiEscalate');
    if (aiEscalate) {
      aiEscalate.addEventListener('click', async () => {
        if (aiBusy) return;
        aiBusy = true; setChipsBusy(true); aiEscalate.setAttribute('aria-disabled', 'true');
        const typing = addTyping();
        track('support_escalate', { source: location.pathname });
        const handoff = 'הפנייה הועברה לנציג אנושי 🙋 נחזור אליך בהקדם. אפשר להמשיך לכתוב כאן בינתיים.';
        try {
          const cfg = window.CHOSECH_SUPABASE;
          if (!cfg || !cfg.url) throw new Error('not configured');
          const lastUser = aiHistory.slice().reverse().find((h) => h.role === 'user');
          const res = await fetch(cfg.url.replace(/\/$/, '') + '/functions/v1/site-support-escalate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', apikey: cfg.anonKey, Authorization: 'Bearer ' + cfg.anonKey },
            body: JSON.stringify({
              message: (lastUser && lastUser.text) || 'המשתמש ביקש לדבר עם נציג אנושי',
              history: aiHistory.slice(-4),
              page: location.pathname,
            }),
          });
          const data = await res.json().catch(() => ({}));
          typing.remove();
          addBubble('ai-bubble--bot', (res.ok && data.reply) ? data.reply : handoff);
        } catch (_) {
          typing.remove();
          addBubble('ai-bubble--bot', handoff);
        }
        aiBusy = false; setChipsBusy(false); aiEscalate.removeAttribute('aria-disabled');
      });
    }
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

  // ── Video-meeting booking wizard (meeting.html) ─────────────────────────────
  // Books a Zoom meeting with a rep into the existing `meetings` table via the
  // same anon-key REST pattern as the lead form. The bookable window is computed
  // client-side in ISRAEL time and re-validated server-side by the meetings_guard
  // trigger — this is UX only, never the security boundary.
  //
  // CONTRACT (must match the app + SQL): providers = window.__MEETING__.providers
  // (the 7 eligible carriers); windows Sun–Thu 09:00–20:30, Fri 09:00–12:30, NO
  // Saturday; 30-minute grid; the chosen date+slot must be ≥ now + 4 HOURS in
  // Israel time; max 30 days ahead.
  const meetingForm = $('meetingForm');
  if (meetingForm) {
    const MIN_LEAD_MS = 4 * 60 * 60 * 1000;  // 4 hours
    const MAX_DAYS = 30;                       // booking horizon
    const SLOT_MIN = 30;                       // 30-minute grid
    // [openMinutes, closeMinutes] = last START + SLOT_MIN. The window is the set
    // of START times; a 09:00–20:30 close means the last START is 20:00 (the
    // 30-min meeting ends 20:30). Fri last START 12:00 (ends 12:30).
    // JS getDay(): 0=Sun … 6=Sat.
    const WINDOWS = {
      0: [9 * 60, 20 * 60], 1: [9 * 60, 20 * 60], 2: [9 * 60, 20 * 60],
      3: [9 * 60, 20 * 60], 4: [9 * 60, 20 * 60],   // Sun–Thu, last start 20:00
      5: [9 * 60, 12 * 60],                          // Fri, last start 12:00
      // 6 (Sat) absent → never bookable
    };

    // Offset (minutes) between Israel wall-clock and UTC at a given instant —
    // positive because Israel is ahead of UTC (UTC+2 winter / UTC+3 summer).
    // Derived from Intl so DST is handled automatically without a fixed +2/+3.
    const israelOffsetMinutes = (date) => {
      const dtf = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Jerusalem', hourCycle: 'h23',
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
      });
      const p = {};
      dtf.formatToParts(date).forEach((x) => { if (x.type !== 'literal') p[x.type] = x.value; });
      const asUTC = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
      return Math.round((asUTC - date.getTime()) / 60000);
    };
    // { year, month, day, weekday, minutes } of "now" on the Israel wall clock.
    const israelNowParts = () => {
      const now = new Date();
      const dtf = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Jerusalem', hourCycle: 'h23', weekday: 'short',
        year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
      });
      const p = {};
      dtf.formatToParts(now).forEach((x) => { if (x.type !== 'literal') p[x.type] = x.value; });
      return { year: +p.year, month: +p.month, day: +p.day, weekday: WD_MAP[p.weekday], minutes: +p.hour * 60 + +p.minute };
    };
    // Convert an Israel wall date+time (Y-M-D, minutes-since-midnight) to a true
    // epoch (ms). Settle the offset twice so a slot that straddles a DST switch
    // still resolves to the correct instant.
    const israelWallToEpoch = (y, mo, d, mins) => {
      const hh = Math.floor(mins / 60), mm = mins % 60;
      let guess = Date.UTC(y, mo - 1, d, hh, mm, 0);
      for (let i = 0; i < 2; i++) {
        const off = israelOffsetMinutes(new Date(guess));
        guess = Date.UTC(y, mo - 1, d, hh, mm, 0) - off * 60000;
      }
      return guess;
    };
    // Israel weekday (0=Sun…6=Sat) for a given Israel wall date. Resolved at noon
    // so a DST jump near midnight can't shift the reported day.
    const WD_MAP = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    const weekdayOf = (y, mo, d) => {
      const epoch = israelWallToEpoch(y, mo, d, 12 * 60);
      const wd = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Jerusalem', weekday: 'short' })
        .formatToParts(new Date(epoch))
        .find((x) => x.type === 'weekday');
      return wd ? WD_MAP[wd.value] : 0;
    };
    const pad = (n) => String(n).padStart(2, '0');
    const HE_DAYS = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];
    const HE_MONTHS = ['ינו׳', 'פבר׳', 'מרץ', 'אפר׳', 'מאי', 'יוני', 'יולי', 'אוג׳', 'ספט׳', 'אוק׳', 'נוב׳', 'דצמ׳'];

    const providerWrap = $('meetingProvider');
    const dateWrap = $('meetingDate');
    const slotWrap = $('meetingSlot');
    const summary = $('meetingSummary');
    const status = $('meetingStatus');
    const nameEl = $('meetingName');
    const phoneEl = $('meetingPhone');
    const emailEl = $('meetingEmail');
    const noteEl = $('meetingNote');
    const submitBtn = meetingForm.querySelector('button[type="submit"]');

    let chosenProvider = '';
    let chosenDate = null;   // { y, mo, d, label }
    let chosenSlot = '';     // 'HH:MM'

    const setStatus = (msg, isErr) => {
      if (!status) return;
      status.textContent = msg || '';
      status.classList.toggle('meet-status--err', !!isErr);
      status.classList.toggle('meet-status--ok', !!msg && !isErr);
    };

    // Build the list of bookable Israel wall dates (today..+MAX_DAYS) that have at
    // least one slot still ≥ now+4h. Saturdays and out-of-window days drop out.
    const buildDates = () => {
      const now = israelNowParts();
      const nowEpoch = Date.now();
      const out = [];
      // Iterate day offsets from today's Israel date forward.
      let cursor = Date.UTC(now.year, now.month - 1, now.day); // a date anchor in UTC ms
      for (let i = 0; i <= MAX_DAYS; i++) {
        const dd = new Date(cursor + i * 86400000);
        const y = dd.getUTCFullYear(), mo = dd.getUTCMonth() + 1, d = dd.getUTCDate();
        const wd = weekdayOf(y, mo, d);
        const win = WINDOWS[wd];
        if (!win) continue;                       // Saturday / closed day
        // Does any 30-min start in this day's window clear now+4h?
        const lastStart = win[1] - SLOT_MIN;      // close is last-start + SLOT_MIN
        let hasSlot = false;
        for (let m = win[0]; m <= lastStart; m += SLOT_MIN) {
          if (israelWallToEpoch(y, mo, d, m) - nowEpoch >= MIN_LEAD_MS) { hasSlot = true; break; }
        }
        if (!hasSlot) continue;
        out.push({ y, mo, d, wd, label: `${HE_DAYS[wd]} ${d} ${HE_MONTHS[mo - 1]}` });
      }
      return out;
    };

    // Slots for a chosen date, each flagged enabled/disabled by the 4h rule.
    const buildSlots = (dt) => {
      const win = WINDOWS[dt.wd];
      if (!win) return [];
      const nowEpoch = Date.now();
      const lastStart = win[1] - SLOT_MIN;
      const out = [];
      for (let m = win[0]; m <= lastStart; m += SLOT_MIN) {
        const ok = israelWallToEpoch(dt.y, dt.mo, dt.d, m) - nowEpoch >= MIN_LEAD_MS;
        out.push({ time: `${pad(Math.floor(m / 60))}:${pad(m % 60)}`, ok });
      }
      return out;
    };

    const updateSummary = () => {
      if (!summary) return;
      if (chosenProvider && chosenDate && chosenSlot) {
        summary.textContent = `פגישה עם נציג ${chosenProvider} · ${chosenDate.label} · בשעה ${chosenSlot}`;
        summary.hidden = false;
      } else {
        summary.textContent = '';
        summary.hidden = true;
      }
    };

    const renderSlots = () => {
      if (!slotWrap) return;
      slotWrap.innerHTML = '';
      chosenSlot = '';
      if (!chosenDate) {
        slotWrap.innerHTML = '<p class="meet-empty">בחרו תאריך כדי לראות שעות פנויות.</p>';
        updateSummary();
        return;
      }
      const slots = buildSlots(chosenDate);
      const usable = slots.filter((s) => s.ok);
      if (!usable.length) {
        slotWrap.innerHTML = '<p class="meet-empty">אין שעות פנויות ביום זה — נסו תאריך אחר.</p>';
        updateSummary();
        return;
      }
      usable.forEach((s) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'meet-chip meet-chip--slot';
        b.setAttribute('role', 'radio');
        b.setAttribute('aria-checked', 'false');
        b.dataset.slot = s.time;
        b.textContent = s.time;
        b.addEventListener('click', () => {
          chosenSlot = s.time;
          slotWrap.querySelectorAll('.meet-chip').forEach((x) => {
            const on = x === b;
            x.classList.toggle('is-selected', on);
            x.setAttribute('aria-checked', String(on));
          });
          updateSummary();
          setStatus('');
        });
        slotWrap.appendChild(b);
      });
      updateSummary();
    };

    const renderDates = () => {
      if (!dateWrap) return;
      const dates = buildDates();
      dateWrap.innerHTML = '';
      if (!dates.length) {
        dateWrap.innerHTML = '<p class="meet-empty">אין מועדים פנויים כרגע — נסו שוב מאוחר יותר או דברו איתנו בוואטסאפ.</p>';
        return;
      }
      dates.forEach((dt) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'meet-chip meet-chip--date';
        b.setAttribute('role', 'radio');
        b.setAttribute('aria-checked', 'false');
        b.dataset.date = `${dt.y}-${pad(dt.mo)}-${pad(dt.d)}`;
        b.innerHTML = `<span class="meet-chip__day">${dt.label}</span>`;
        b.addEventListener('click', () => {
          chosenDate = dt;
          dateWrap.querySelectorAll('.meet-chip').forEach((x) => {
            const on = x === b;
            x.classList.toggle('is-selected', on);
            x.setAttribute('aria-checked', String(on));
          });
          renderSlots();
          setStatus('');
        });
        dateWrap.appendChild(b);
      });
    };

    // Provider chips are rendered server-side (the 7 eligible strings) — just wire
    // selection. data-provider holds the EXACT eligibility string for the insert.
    if (providerWrap) {
      providerWrap.querySelectorAll('.meet-chip--provider').forEach((b) => {
        b.addEventListener('click', () => {
          chosenProvider = b.dataset.provider || '';
          providerWrap.querySelectorAll('.meet-chip').forEach((x) => {
            const on = x === b;
            x.classList.toggle('is-selected', on);
            x.setAttribute('aria-checked', String(on));
          });
          updateSummary();
          setStatus('');
        });
      });
    }

    renderDates();
    renderSlots();

    // POST a meeting into the existing `meetings` table (same anon-key REST
    // pattern as sendLead). The server trigger computes starts_at + validates.
    const sendMeeting = async (payload) => {
      const cfg = window.CHOSECH_SUPABASE;
      if (!cfg || !cfg.url || !cfg.anonKey) return { ok: false, status: 0 }; // backend parked
      const res = await fetch(cfg.url.replace(/\/$/, '') + '/rest/v1/meetings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: cfg.anonKey,
          Authorization: 'Bearer ' + cfg.anonKey,
          Prefer: 'return=minimal',
        },
        body: JSON.stringify(payload),
      });
      let body = '';
      if (!res.ok) { body = await res.text().catch(() => ''); }
      return { ok: res.ok, status: res.status, body: body };
    };

    // Map a rejected insert (the meetings_guard trigger / RLS / rate limit) to a
    // friendly Hebrew message. Matches on substrings the server raises so the
    // visitor gets actionable guidance instead of a raw Postgres error.
    const friendlyMeetingError = (status, body) => {
      const b = (body || '').toLowerCase();
      if (/eligible|provider|ספק/.test(b)) return 'הספק שבחרתם אינו זמין כרגע לפגישות וידאו — נסו ספק אחר.';
      if (/4 hour|four hour|lead|מראש|ahead/.test(b)) return 'יש לקבוע לפחות 4 שעות מראש — בחרו מועד מאוחר יותר.';
      if (/window|hours|saturday|שבת|closed|outside/.test(b)) return 'המועד שנבחר מחוץ לשעות הפעילות — בחרו יום ושעה אחרים.';
      if (/pending|already|exists|duplicate|כבר/.test(b)) return 'כבר יש לכם בקשת פגישה ממתינה — ניצור קשר בקרוב.';
      if (status === 429 || /rate|limit|too many/.test(b)) return 'נשלחו יותר מדי בקשות — נסו שוב בעוד מספר דקות.';
      return 'השליחה נכשלה — נסו שוב, או כתבו לנו בוואטסאפ 💬';
    };

    meetingForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      // Honeypot — a filled #meetingCompany means a bot: fake success, no POST.
      if (($('meetingCompany') && $('meetingCompany').value || '').trim()) {
        meetingForm.reset();
        setStatus('נשלח — ניצור קשר לאישור הפגישה ✦', false);
        return;
      }
      const name = (nameEl && nameEl.value || '').trim();
      const phone = (phoneEl && phoneEl.value || '').replace(/[^\d+]/g, '');
      const email = (emailEl && emailEl.value || '').trim();
      const note = (noteEl && noteEl.value || '').trim();

      if (!chosenProvider) { setStatus('בחרו ספק כדי להמשיך 🙏', true); if (providerWrap) providerWrap.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center' }); return; }
      if (!chosenDate) { setStatus('בחרו תאריך לפגישה 🙏', true); if (dateWrap) dateWrap.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center' }); return; }
      if (!chosenSlot) { setStatus('בחרו שעה לפגישה 🙏', true); if (slotWrap) slotWrap.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center' }); return; }
      if (name.length < 2 || name.length > 80 || phone.replace(/\D/g, '').length < 9) {
        setStatus('נא למלא שם וטלפון תקין 🙏', true);
        const bad = (name.length < 2 || name.length > 80) ? nameEl : phoneEl;
        if (bad) bad.focus();
        return;
      }
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        setStatus('כתובת האימייל אינה תקינה — תקנו או השאירו ריק 🙏', true);
        if (emailEl) emailEl.focus();
        return;
      }
      const termsEl = $('meetingTerms');
      const privacyEl = $('meetingPrivacy');
      const termsOk = termsEl && termsEl.checked;
      const privacyOk = privacyEl && privacyEl.checked;
      if (!termsOk || !privacyOk) {
        setStatus('יש לאשר את תנאי השימוש ומדיניות הפרטיות כדי להמשיך 🙏', true);
        const badConsent = !termsOk ? termsEl : privacyEl;
        if (badConsent) badConsent.focus();
        return;
      }
      // Re-validate the 4h rule at submit time (the page may have been open a
      // while) so a slot that just slipped under 4h is caught before the POST.
      const slotMins = (() => { const [h, m] = chosenSlot.split(':'); return +h * 60 + +m; })();
      if (israelWallToEpoch(chosenDate.y, chosenDate.mo, chosenDate.d, slotMins) - Date.now() < MIN_LEAD_MS) {
        setStatus('המועד שבחרתם כבר קרוב מדי — בחרו שעה מאוחרת יותר 🙏', true);
        renderDates();
        renderSlots();
        return;
      }

      const now = new Date().toISOString();
      const marketingAt = $('meetingMarketing') && $('meetingMarketing').checked ? now : null;
      if (submitBtn) { submitBtn.disabled = true; submitBtn.classList.add('is-loading'); }
      let result;
      try {
        result = await sendMeeting({
          name: name,
          phone: phone,
          email: email || null,
          provider: chosenProvider,
          plan_id: null,
          meeting_date: `${chosenDate.y}-${pad(chosenDate.mo)}-${pad(chosenDate.d)}`,
          slot: chosenSlot,
          source: 'site-meeting',
          note: note || null,
          terms_accepted_at: now,
          privacy_accepted_at: now,
          marketing_accepted_at: marketingAt,
        });
      } catch (_) {
        result = { ok: false, status: 0, body: '' };
      }
      if (submitBtn) { submitBtn.disabled = false; submitBtn.classList.remove('is-loading'); }
      if (!result || !result.ok) {
        setStatus(result && result.status ? friendlyMeetingError(result.status, result.body) : 'השליחה נכשלה — נסו שוב, או כתבו לנו בוואטסאפ 💬', true);
        if (submitBtn) submitBtn.focus();
        return;
      }
      track('meeting_request', { provider: chosenProvider, source: location.pathname });
      meetingForm.reset();
      chosenProvider = ''; chosenDate = null; chosenSlot = '';
      if (providerWrap) providerWrap.querySelectorAll('.meet-chip').forEach((x) => { x.classList.remove('is-selected'); x.setAttribute('aria-checked', 'false'); });
      renderDates();
      renderSlots();
      updateSummary();
      setStatus('נשלח — ניצור קשר לאישור הפגישה ✦', false);
    });

    // form_start parity with the lead form — one analytics ping on first engage.
    let meetingStarted = false;
    meetingForm.addEventListener('focusin', () => {
      if (meetingStarted) return;
      meetingStarted = true;
      track('form_start', { source: location.pathname });
    });
  }
})();
