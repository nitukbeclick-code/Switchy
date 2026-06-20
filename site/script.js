/* חוסך — landing interactions. Vanilla JS, no dependencies. */
(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const nis = (n) => '₪' + Math.round(n).toLocaleString('he-IL');

  // ── Footer year ──────────────────────────────────────────────────────────
  const year = $('year');
  if (year) year.textContent = new Date().getFullYear();

  // ── Sticky nav shadow ────────────────────────────────────────────────────
  const nav = $('nav');
  const onScroll = () => nav && nav.classList.toggle('scrolled', window.scrollY > 10);
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

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
      const name = ($('leadName').value || '').trim();
      // Normalize to digits/+ — the leads gate rejects dots/parens/spaces.
      const phone = ($('leadPhone').value || '').replace(/[^\d+]/g, '');
      if (name.length < 2 || name.length > 80 || phone.replace(/\D/g, '').length < 9) {
        if (note) { note.classList.add('cta__note--err'); note.textContent = 'נא למלא שם וטלפון תקין 🙏'; }
        return;
      }
      // Legal consent gate (Privacy Protection Regulations + Spam/Communications
      // Law): terms + privacy are MANDATORY — block submission without both.
      // Marketing is optional opt-in. The server re-stamps these timestamps
      // authoritatively; we send them so the consent moment is captured client-side.
      const termsOk = $('consentTerms') && $('consentTerms').checked;
      const privacyOk = $('consentPrivacy') && $('consentPrivacy').checked;
      if (!termsOk || !privacyOk) {
        if (note) { note.classList.add('cta__note--err'); note.textContent = 'יש לאשר את תנאי השימוש ומדיניות הפרטיות כדי להמשיך 🙏'; }
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
    const waText = encodeURIComponent('גיליתי אתר שמשווה מחירי סלולר/אינטרנט/טלוויזיה וחוסך כסף בלי כאב ראש — שווה לבדוק: https://chosech.co.il/?ref=' + code);
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
      visibleCards.forEach((card) => planGrid.appendChild(card));
      if (empty) empty.style.display = shown ? 'none' : 'block';
      if (planCount) planCount.textContent = shown < cards.length ? `${shown} מסלולים נמצאו` : '';
    };
    btns.forEach((b) => b.addEventListener('click', () => {
      btns.forEach((x) => x.classList.toggle('active', x === b));
      cat = b.dataset.filter;
      apply();
    }));
    flagChips.forEach((chip) => chip.addEventListener('click', () => {
      chip.classList.toggle('active');
      apply();
    }));
    if (search) search.addEventListener('input', apply);
    if (sort) sort.addEventListener('change', apply);
    if (providerSel) providerSel.addEventListener('change', apply);
    if (maxPriceInput) maxPriceInput.addEventListener('input', apply);
    const emptyReset = $('planEmptyReset');
    if (emptyReset) emptyReset.addEventListener('click', () => {
      cat = 'all';
      btns.forEach((x) => x.classList.toggle('active', x.dataset.filter === 'all'));
      flagChips.forEach((c) => c.classList.remove('active'));
      if (search) search.value = '';
      if (providerSel) providerSel.value = '';
      if (maxPriceInput) maxPriceInput.value = '';
      apply();
    });
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
      navigator.clipboard.writeText(location.href).then(() => {
        copyBtn.textContent = '✓ הקישור הועתק!';
        setTimeout(() => { copyBtn.textContent = '🔗 שתפו השוואה זו'; }, 2500);
      });
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
    const askAi = async (q) => {
      if (!q || aiBusy) return;
      aiBusy = true;
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
    };
    document.querySelectorAll('.ai-chip').forEach((chip) => {
      chip.setAttribute('role', 'button');
      chip.setAttribute('tabindex', '0');
      const ask = () => askAi(chip.textContent.replace(/^[^א-ת]+/, '').trim());
      chip.addEventListener('click', ask);
      chip.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); ask(); }
      });
    });
    if (aiForm && aiInput) {
      aiForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const q = aiInput.value.trim();
        if (!q) return;
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
  if (!reduceMotion && window.matchMedia('(hover: hover)').matches) {
    const spotlightSel = '.feature, .step, .cat, .guide-card, .plan, .provider-card';
    document.addEventListener('pointermove', (e) => {
      const card = e.target.closest && e.target.closest(spotlightSel);
      if (!card) return;
      const r = card.getBoundingClientRect();
      card.style.setProperty('--mx', ((e.clientX - r.left) / r.width * 100).toFixed(1) + '%');
      card.style.setProperty('--my', ((e.clientY - r.top) / r.height * 100).toFixed(1) + '%');
    }, { passive: true });
  }

  // ── Magnetic primary CTAs — the button leans toward the cursor ─────────────
  if (!reduceMotion && window.matchMedia('(hover: hover)').matches) {
    document.querySelectorAll('.btn--primary').forEach((btn) => {
      btn.classList.add('magnetic');
      const strength = 0.28;
      btn.addEventListener('pointermove', (e) => {
        const r = btn.getBoundingClientRect();
        const x = (e.clientX - (r.left + r.width / 2)) * strength;
        const y = (e.clientY - (r.top + r.height / 2)) * strength;
        // CSS `translate` composes with the :hover/:active `transform` states —
        // an inline transform here used to clobber the lift and the press.
        btn.style.translate = `${x.toFixed(1)}px ${y.toFixed(1)}px`;
      });
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
      if (window.plausible) window.plausible('calc_used', { props: { cat: calc.dataset.cat || '' } });
    };
    if (btn) btn.addEventListener('click', run);
    if (bill) bill.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); run(); } });
    document.querySelectorAll('.calc-quick__btn').forEach((qb) => {
      qb.addEventListener('click', () => {
        if (bill) { bill.value = qb.dataset.val; }
        document.querySelectorAll('.calc-quick__btn').forEach((b) => b.classList.remove('active'));
        qb.classList.add('active');
        run();
      });
    });
  }
})();
