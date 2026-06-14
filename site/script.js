/* חוסך — landing interactions. Vanilla JS, no dependencies. */
(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const nis = (n) => '₪' + Math.round(n).toLocaleString('he-IL');

  // ── Backend config fallback ────────────────────────────────────────────
  // index.html / app.html set window.CHOSECH_SUPABASE inline. The 53
  // build.js-generated pages don't — define the same public values here so
  // sendLead() and the chat widget below work on every page. Anon key only.
  window.CHOSECH_SUPABASE = window.CHOSECH_SUPABASE || {
    url: 'https://orzitfqmlvopujsoyigr.supabase.co',
    anonKey: 'sb_publishable_WFNOchgCu1RHauIFCFDT1g_dWVEoHAr',
  };

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
    });
  }

  // ── All-plans filter (plans.html) ──────────────────────────────────────────
  const planGrid = $('planGrid');
  if (planGrid) {
    const cards = Array.from(planGrid.querySelectorAll('.plan'));
    const empty = $('planEmpty');
    const search = $('planSearch');
    const sort = $('planSort');
    const btns = Array.from(document.querySelectorAll('.filter-btn'));
    const flagChips = Array.from(document.querySelectorAll('.flag-chip'));
    const flagKey = { '5g': 'data-5g', nocommit: 'data-nocommit', abroad: 'data-abroad' };
    let cat = 'all';
    const apply = () => {
      const q = (search && search.value || '').trim().toLowerCase();
      const activeFlags = flagChips.filter((c) => c.classList.contains('active')).map((c) => c.dataset.flag);
      let shown = 0;
      const visibleCards = [];
      for (const card of cards) {
        const okCat = cat === 'all' || card.dataset.cat === cat;
        const okText = !q || (card.dataset.text || '').includes(q);
        const okFlags = activeFlags.every((f) => card.getAttribute(flagKey[f]) === 'true');
        const visible = okCat && okText && okFlags;
        card.style.display = visible ? '' : 'none';
        if (visible) { shown++; visibleCards.push(card); }
      }
      const mode = (sort && sort.value) || 'price-asc';
      visibleCards.sort((a, b) => {
        if (mode === 'price-desc') return Number(b.dataset.price) - Number(a.dataset.price);
        return Number(a.dataset.price) - Number(b.dataset.price);
      });
      visibleCards.forEach((card) => planGrid.appendChild(card));
      if (empty) empty.style.display = shown ? 'none' : 'block';
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
    picks.forEach((s) => s.addEventListener('change', render));
    render();
  }

  // ── חוסך AI chat (app.html) ─────────────────────────────────────────────────
  // Live, AI-backed chat grounded in the real plan catalogue when
  // `window.CHOSECH_SUPABASE` is configured (POSTs to the `site-ai-chat` edge
  // function). With no config, or on any error, falls back to the canned
  // keyword replies below — the demo always works.
  const aiChat = $('aiChat');
  if (aiChat) {
    const replies = {
      'מה הכי משתלם': 'בלי להיכנס לאפליקציה אני נותן הערכה — אבל בתוך חוסך אני קורא את החשבון האמיתי שלך וממליץ מדויק. בממוצע אנשים חוסכים ₪900–₪1,200 בשנה. 💰',
      'סלולר': 'יש מסלולי סלולר מ-₪15/חודש, וכמה 5G ללא הגבלה ב-₪29 ללא התחייבות. רוצה שאמצא לך את הזול ביותר לפי השימוש שלך? 📱',
      'אינטרנט': 'סיב אופטי עד 1000Mb מתחיל סביב ₪89/חודש — שימו לב למחיר אחרי המבצע. אני משווה גם את זה. 🌐',
      'ללא התחייבות': 'רוב המסלולים הזולים היום הם ללא התחייבות בכלל — אפשר לעבור ולבטל בכל עת. אסנן רק כאלה? ✅',
      'חו': 'לחו״ל יש eSIM נוחים: למשל 10GB לאירופה סביב ₪35 לחבילה, בלי הפתעות רומינג. ✈️',
      'פחות מ': 'יש לא מעט מסלולים מתחת ל-₪50 — סלולר, ואפילו אינטרנט בסיסי. נסמן תקציב ונראה הכל. 💸',
    };
    const pick = (q) => {
      for (const key of Object.keys(replies)) if (q.indexOf(key) !== -1) return replies[key];
      return 'שאלה מצוינת! באפליקציה אני עונה על זה לפי הנתונים האמיתיים שלך וממליץ על המסלול המשתלם ביותר. ✨';
    };
    const addBubble = (cls, text) => {
      const b = document.createElement('div');
      b.className = 'ai-bubble ' + cls;
      b.textContent = text;
      aiChat.appendChild(b);
      b.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      return b;
    };
    let typingEl = null;
    const showTyping = () => {
      typingEl = addBubble('ai-bubble--bot ai-typing', '');
      typingEl.innerHTML = '<span></span><span></span><span></span>';
    };
    const hideTyping = () => {
      if (typingEl) { typingEl.remove(); typingEl = null; }
    };

    const MAX_HISTORY = 6;
    const history = [];
    const sendChat = async (message, priorHistory) => {
      const cfg = window.CHOSECH_SUPABASE;
      if (!cfg || !cfg.url || !cfg.anonKey) return null;
      const res = await fetch(cfg.url.replace(/\/$/, '') + '/functions/v1/site-ai-chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: cfg.anonKey,
          Authorization: 'Bearer ' + cfg.anonKey,
        },
        body: JSON.stringify({ message, history: priorHistory }),
      });
      if (!res.ok) throw new Error('chat rejected: ' + res.status);
      const data = await res.json();
      if (!data || !data.reply) throw new Error('chat: empty reply');
      return data.reply;
    };

    const aiForm = $('aiForm');
    const aiInput = $('aiInput');
    const aiSend = aiForm ? aiForm.querySelector('.ai-send') : null;
    const setBusy = (busy) => {
      if (aiInput) aiInput.disabled = busy;
      if (aiSend) aiSend.disabled = busy;
    };

    const ask = async (q) => {
      if (!q) return;
      addBubble('ai-bubble--me', q);
      track('ai_chat_message', { source: location.pathname });
      const priorHistory = history.slice();
      history.push({ role: 'user', text: q });
      if (history.length > MAX_HISTORY) history.splice(0, history.length - MAX_HISTORY);
      setBusy(true);
      showTyping();
      let reply;
      try {
        reply = await sendChat(q, priorHistory);
      } catch (_) {
        reply = null;
      }
      hideTyping();
      if (!reply) reply = pick(q);
      addBubble('ai-bubble--bot', reply);
      history.push({ role: 'bot', text: reply });
      if (history.length > MAX_HISTORY) history.splice(0, history.length - MAX_HISTORY);
      setBusy(false);
    };

    document.querySelectorAll('.ai-chip').forEach((chip) => {
      chip.setAttribute('role', 'button');
      chip.setAttribute('tabindex', '0');
      const onChip = () => ask(chip.textContent.replace(/^[^א-ת]+/, '').trim());
      chip.addEventListener('click', onChip);
      chip.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onChip(); }
      });
    });

    if (aiForm && aiInput) {
      aiForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const q = aiInput.value.trim();
        if (!q) return;
        aiInput.value = '';
        ask(q);
      });
    }
  }

  // ── Global support chat widget (every page) ───────────────────────────────
  // Floating launcher (bottom-left) → chat panel. Same backend as the
  // app.html chat (site-ai-chat) plus one-click escalation to a human rep
  // (site-support-escalate — stateless, sends a Telegram notification).
  (() => {
    const ESCALATION_KEYWORDS = [
      'חבר אותי לנציג', 'אדם', 'human', 'representative', 'support', 'עזרה', 'speak to human',
    ];
    const ESCALATION_MESSAGE = 'הפנייה שלך הועברה לנציג אנושי, הוא יחזור אליך בקרוב';
    const CHAT_FALLBACK_REPLY = 'מצטערים, יש לנו בעיה להתחבר כרגע. אפשר ללחוץ על "לדבר עם נציג" ונציג אנושי יחזור אליכם בקרוב. 🙏';
    const MAX_HISTORY = 6;

    const launcher = document.createElement('button');
    launcher.id = 'chatLauncher';
    launcher.className = 'chat-launcher';
    launcher.type = 'button';
    launcher.setAttribute('aria-label', 'פתיחת צ׳אט תמיכה');
    launcher.setAttribute('aria-expanded', 'false');
    launcher.setAttribute('aria-controls', 'chatPanel');
    launcher.innerHTML = '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 11.5a8.4 8.4 0 0 1-9 8 9 9 0 0 1-3.8-.8L3 20l1.3-3.9A8 8 0 0 1 3.5 11 8.4 8.4 0 0 1 12 3a8.4 8.4 0 0 1 9 8.5z"/></svg>';

    const panel = document.createElement('div');
    panel.id = 'chatPanel';
    panel.className = 'chat-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'צ׳אט תמיכה של חוסך');
    panel.hidden = true;
    panel.innerHTML = `
      <div class="chat-panel__head">
        <span class="chat-panel__title">🤖 חוסך — צ׳אט תמיכה</span>
        <button type="button" class="chat-panel__close" aria-label="סגירה">
          <svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>
        </button>
      </div>
      <div class="chat-panel__body" id="chatBody"></div>
      <button type="button" class="chat-escalate" id="chatEscalate">🆘 לדבר עם נציג</button>
      <form class="chat-input-row" id="chatForm">
        <input class="ai-input" id="chatInput" type="text" placeholder="כתבו לנו הודעה…" aria-label="הקלידו הודעה" autocomplete="off" maxlength="500" />
        <button class="ai-send" type="submit" aria-label="שליחה">
          <svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 19V5M5 12l7-7 7 7"/></svg>
        </button>
      </form>`;

    document.body.appendChild(launcher);
    document.body.appendChild(panel);

    const body = panel.querySelector('#chatBody');
    const form = panel.querySelector('#chatForm');
    const input = panel.querySelector('#chatInput');
    const send = panel.querySelector('.ai-send');
    const close = panel.querySelector('.chat-panel__close');
    const escalateBtn = panel.querySelector('#chatEscalate');

    // Small scoped copies of app.html's bubble/typing helpers (kept separate
    // so neither block can regress the other).
    const addBubble = (cls, text) => {
      const b = document.createElement('div');
      b.className = 'ai-bubble ' + cls;
      b.textContent = text;
      body.appendChild(b);
      b.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      return b;
    };
    let typingEl = null;
    const showTyping = () => {
      typingEl = addBubble('ai-bubble--bot ai-typing', '');
      typingEl.innerHTML = '<span></span><span></span><span></span>';
    };
    const hideTyping = () => { if (typingEl) { typingEl.remove(); typingEl = null; } };

    let opened = false;
    const setOpen = (open) => {
      panel.hidden = !open;
      launcher.setAttribute('aria-expanded', String(open));
      launcher.classList.toggle('chat-launcher--open', open);
      if (open) {
        if (!opened) {
          opened = true;
          track('chat_open', { source: location.pathname });
          addBubble('ai-bubble--bot', 'היי! איך נוכל לעזור היום? 😊');
        }
        if (input) input.focus();
      }
    };
    launcher.addEventListener('click', () => setOpen(panel.hidden));
    if (close) close.addEventListener('click', () => setOpen(false));
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !panel.hidden) setOpen(false);
    });

    const history = [];
    const pushHistory = (role, text) => {
      history.push({ role, text });
      if (history.length > MAX_HISTORY) history.splice(0, history.length - MAX_HISTORY);
    };

    const callFn = async (name, payload) => {
      const cfg = window.CHOSECH_SUPABASE;
      const res = await fetch(cfg.url.replace(/\/$/, '') + '/functions/v1/' + name, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: cfg.anonKey, Authorization: 'Bearer ' + cfg.anonKey },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(name + ' rejected: ' + res.status);
      return res.json();
    };

    const setBusy = (busy) => {
      if (input) input.disabled = busy;
      if (send) send.disabled = busy;
      if (escalateBtn) escalateBtn.disabled = busy;
    };

    const escalate = async (message) => {
      const priorHistory = history.slice();
      track('chat_escalation', { source: location.pathname });
      setBusy(true);
      showTyping();
      let reply = ESCALATION_MESSAGE;
      try {
        const data = await callFn('site-support-escalate', { message, history: priorHistory, page: location.pathname });
        if (data && data.reply) reply = data.reply;
      } catch (_) { /* local ESCALATION_MESSAGE still shown — escalation never looks broken */ }
      hideTyping();
      addBubble('ai-bubble--bot', reply);
      pushHistory('bot', reply);
      setBusy(false);
    };
    if (escalateBtn) {
      escalateBtn.addEventListener('click', () => {
        addBubble('ai-bubble--me', 'לדבר עם נציג');
        escalate('המשתמש לחץ על "לדבר עם נציג".');
      });
    }

    const looksLikeEscalation = (q) => {
      const lower = q.toLowerCase();
      return ESCALATION_KEYWORDS.some((k) => lower.includes(k.toLowerCase()));
    };

    const ask = async (q) => {
      if (!q) return;
      addBubble('ai-bubble--me', q);
      const priorHistory = history.slice();
      pushHistory('user', q);

      if (looksLikeEscalation(q)) {
        track('chat_message_sent', { source: location.pathname, escalated: true });
        await escalate(q);
        return;
      }
      track('chat_message_sent', { source: location.pathname, escalated: false });

      setBusy(true);
      showTyping();
      let reply;
      try {
        const data = await callFn('site-ai-chat', { message: q, history: priorHistory });
        reply = (data && data.reply) || CHAT_FALLBACK_REPLY;
      } catch (_) {
        reply = CHAT_FALLBACK_REPLY;
      }
      hideTyping();
      addBubble('ai-bubble--bot', reply);
      pushHistory('bot', reply);
      setBusy(false);
    };

    if (form && input) {
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const q = input.value.trim();
        if (!q) return;
        input.value = '';
        ask(q);
      });
    }
  })();

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
    const run = () => {
      const cur = parseFloat(bill && bill.value);
      if (!cur || cur <= 0) { show('הזינו את הסכום שאתם משלמים היום.'); return; }
      const monthly = Math.max(0, cur - cheapest);
      const yearly = monthly * 12;
      show(yearly > 0
        ? 'הערכת חיסכון: עד <b>' + nis(yearly) + '</b> בשנה (' + nis(monthly) + ' בחודש). זו הערכה מול המסלול הזול בשוק — בדקו את ההשוואה המלאה.'
        : 'אתם כבר משלמים פחות מהמסלול הזול שמצאנו — מצוין! עדיין שווה להשוות מדי פעם.');
      if (window.plausible) window.plausible('calc_used', { props: { cat: calc.dataset.cat || '' } });
    };
    if (btn) btn.addEventListener('click', run);
    if (bill) bill.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); run(); } });
  }
})();
