/* חוסך — community + ratings client. ES module, Supabase-backed. */
// One module, loaded on community.html / ratings.html / provider-*.html. Each
// feature block is guarded by the presence of its root element (like script.js),
// so the module quietly no-ops on pages that don't host that surface. All user
// content is escaped before it reaches the DOM (textContent or an explicit
// escaper) — never trust author/body/provider strings from the table.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ── Tiny DOM + format helpers ──────────────────────────────────────────────
const $ = (id) => document.getElementById(id);
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
// escHtml mirrors the escaper in script.js — used only where we must build an
// HTML string (innerHTML); the default path is textContent, which never needs it.
const escHtml = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

// Relative Hebrew timestamp ("לפני 5 דקות") — coarse, never exposes raw dates.
const timeAgo = (iso) => {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return '';
  const sec = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (sec < 60) return 'הרגע';
  const min = Math.round(sec / 60);
  if (min < 60) return `לפני ${min} דק׳`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `לפני ${hr} שע׳`;
  const day = Math.round(hr / 24);
  if (day < 30) return `לפני ${day} ימים`;
  // Fall back to an absolute date once "days ago" stops being meaningful.
  return new Date(iso).toLocaleDateString('he-IL');
};

// ── Supabase client (single instance, config-driven) ───────────────────────
// Built from window.CHOSECH_SUPABASE (already on every page). Without config the
// whole module is inert — the static site still renders, the features just hide.
const cfg = window.CHOSECH_SUPABASE;
const supabase = (cfg && cfg.url && cfg.anonKey)
  ? createClient(cfg.url, cfg.anonKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  })
  : null;

// ── Channel + provider labels ──────────────────────────────────────────────
const CHANNEL_LABEL = {
  general: 'כללי', switch: 'מעבר ספק', questions: 'שאלות', tips: 'טיפים',
};

// Map a Hebrew provider name → its page slug, via window.__PROVIDERS__ (emitted
// by build.js). No client-side slugging: build.js owns the canonical map.
const providerSlugByName = (() => {
  const map = new Map();
  const list = Array.isArray(window.__PROVIDERS__) ? window.__PROVIDERS__ : [];
  list.forEach((p) => { if (p && p.name) map.set(p.name, p.slug); });
  return (name) => map.get(name) || null;
})();

// ── Star bar ───────────────────────────────────────────────────────────────
// Read-only display of an average (full / half / empty). aria-label carries the
// numeric value so AT users get the figure, not "star star star…".
const starBar = (avg) => {
  const v = Math.max(0, Math.min(5, Number(avg) || 0));
  const wrap = document.createElement('span');
  wrap.className = 'star-bar';
  wrap.setAttribute('role', 'img');
  wrap.setAttribute('aria-label', `דירוג ${v.toFixed(1)} מתוך 5`);
  for (let i = 1; i <= 5; i++) {
    const s = document.createElement('span');
    s.className = 'star-bar__star';
    s.setAttribute('aria-hidden', 'true');
    s.textContent = v >= i ? '★' : (v >= i - 0.5 ? '⯨' : '☆');
    if (v >= i) s.classList.add('is-full');
    else if (v >= i - 0.5) s.classList.add('is-half');
    wrap.appendChild(s);
  }
  return wrap;
};

// ════════════════════════════════════════════════════════════════════════════
// Auth — shared session state + modal. Drives every gated action below.
// ════════════════════════════════════════════════════════════════════════════
let currentSession = null;
// Listeners that want to react when auth state flips (composer, review form, …).
const authSubscribers = new Set();
const onAuth = (fn) => { authSubscribers.add(fn); fn(currentSession); };
const notifyAuth = () => authSubscribers.forEach((fn) => { try { fn(currentSession); } catch (_) { /* isolate */ } });

// Best-effort display name from the session's user metadata / email.
const displayName = (session) => {
  if (!session || !session.user) return '';
  const u = session.user;
  const meta = u.user_metadata || {};
  return meta.full_name || meta.name || meta.user_name || (u.email ? u.email.split('@')[0] : 'משתמש/ת');
};

// ── Auth modal (focus-trapped, Esc/overlay close) ──────────────────────────
const authModal = $('authModal');
let lastFocusBeforeModal = null;

const openAuth = () => {
  if (!authModal) return;
  lastFocusBeforeModal = document.activeElement;
  authModal.removeAttribute('hidden');
  resetAuthForms();
  // Focus the first interactive control so keyboard users land inside the modal.
  const first = $('authEmail') || authModal.querySelector('button, input, a');
  if (first) first.focus();
};

const closeAuth = () => {
  if (!authModal || authModal.hasAttribute('hidden')) return;
  authModal.setAttribute('hidden', '');
  // Return focus to whatever opened the modal — no focus left orphaned on a
  // now-hidden element.
  if (lastFocusBeforeModal && typeof lastFocusBeforeModal.focus === 'function') {
    lastFocusBeforeModal.focus();
  }
};

// Reset the modal to its initial (email-entry) step and clear any message.
const resetAuthForms = () => {
  const otpForm = $('authOtpForm');
  if (otpForm) otpForm.hidden = true;
  const emailForm = $('authEmailForm');
  if (emailForm) emailForm.hidden = false;
  setAuthMsg('');
};

const setAuthMsg = (text, isError) => {
  const msg = $('authMsg');
  if (!msg) return;
  msg.textContent = text || '';
  msg.classList.toggle('auth-msg--err', !!isError);
};

if (authModal) {
  const overlay = authModal.querySelector('.auth-modal__overlay');
  if (overlay) overlay.addEventListener('click', closeAuth);
  const closeBtn = $('authModalClose');
  if (closeBtn) closeBtn.addEventListener('click', closeAuth);
  // Esc closes; Tab is trapped within the modal so focus can't escape behind it.
  authModal.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.preventDefault(); closeAuth(); return; }
    if (e.key !== 'Tab') return;
    const focusable = Array.from(authModal.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    )).filter((el) => !el.disabled && el.offsetParent !== null);
    if (!focusable.length) return;
    const firstEl = focusable[0];
    const lastEl = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === firstEl) { e.preventDefault(); lastEl.focus(); }
    else if (!e.shiftKey && document.activeElement === lastEl) { e.preventDefault(); firstEl.focus(); }
  });
}

// ── OAuth + email-OTP wiring ───────────────────────────────────────────────
const oauth = async (provider) => {
  if (!supabase) { setAuthMsg('ההתחברות אינה זמינה כרגע.', true); return; }
  setAuthMsg('מעבירים אותך לכניסה…');
  // redirectTo: location.href so the user returns to the exact page they were on
  // (detectSessionInUrl picks up the returned tokens automatically).
  const { error } = await supabase.auth.signInWithOAuth({
    provider, options: { redirectTo: location.href },
  });
  if (error) setAuthMsg('ההתחברות נכשלה — נסו שוב.', true);
};

if (supabase) {
  const gBtn = $('authGoogle');
  if (gBtn) gBtn.addEventListener('click', () => oauth('google'));
  const fBtn = $('authFacebook');
  if (fBtn) fBtn.addEventListener('click', () => oauth('facebook'));

  // Step 1 — request a one-time code by email.
  const emailForm = $('authEmailForm');
  if (emailForm) {
    emailForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const input = $('authEmail');
      const email = (input && input.value || '').trim();
      // Minimal client check — Supabase is the real validator; this just avoids
      // an obviously-empty round trip.
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
        setAuthMsg('נא להזין כתובת אימייל תקינה.', true);
        if (input) input.focus();
        return;
      }
      const btn = emailForm.querySelector('button[type="submit"]');
      if (btn) btn.disabled = true;
      setAuthMsg('שולחים קוד לאימייל…');
      const { error } = await supabase.auth.signInWithOtp({ email });
      if (btn) btn.disabled = false;
      if (error) { setAuthMsg('שליחת הקוד נכשלה — נסו שוב.', true); return; }
      // Reveal the code-entry step; keep the email around for verifyOtp.
      emailForm.hidden = true;
      const otpForm = $('authOtpForm');
      if (otpForm) {
        otpForm.hidden = false;
        otpForm.dataset.email = email;
        const otpInput = $('authOtp');
        if (otpInput) otpInput.focus();
      }
      setAuthMsg('שלחנו קוד חד-פעמי לאימייל שלך. הזינו אותו כאן.');
    });
  }

  // Step 2 — verify the emailed code → establishes a session.
  const otpForm = $('authOtpForm');
  if (otpForm) {
    const verify = async (e) => {
      if (e) e.preventDefault();
      const email = otpForm.dataset.email || '';
      const otpInput = $('authOtp');
      const token = (otpInput && otpInput.value || '').trim();
      if (!email || token.length < 4) {
        setAuthMsg('נא להזין את הקוד שקיבלת.', true);
        if (otpInput) otpInput.focus();
        return;
      }
      const btn = $('authOtpVerify');
      if (btn) btn.disabled = true;
      setAuthMsg('מאמתים…');
      const { error } = await supabase.auth.verifyOtp({ email, token, type: 'email' });
      if (btn) btn.disabled = false;
      if (error) { setAuthMsg('הקוד שגוי או פג תוקף — נסו שוב.', true); return; }
      // onAuthStateChange closes the modal + refreshes the UI; nothing more here.
      setAuthMsg('');
    };
    otpForm.addEventListener('submit', verify);
    const verifyBtn = $('authOtpVerify');
    // The verify control may be a plain button (not type=submit) — wire it too.
    if (verifyBtn && verifyBtn.type !== 'submit') verifyBtn.addEventListener('click', verify);
  }
}

// ── #authStatus — logged-in name + logout, or a "התחברות" opener ────────────
const renderAuthStatus = (session) => {
  const host = $('authStatus');
  if (!host) return;
  host.textContent = '';
  if (session) {
    const name = document.createElement('span');
    name.className = 'auth-status__name';
    name.textContent = displayName(session); // escaped via textContent
    const out = document.createElement('button');
    out.id = 'logoutBtn';
    out.type = 'button';
    out.className = 'btn btn--ghost btn--sm';
    out.textContent = 'התנתקות';
    out.addEventListener('click', async () => {
      if (!supabase) return;
      out.disabled = true;
      await supabase.auth.signOut();
      // onAuthStateChange re-renders; button is replaced wholesale so no re-enable.
    });
    host.appendChild(name);
    host.appendChild(out);
  } else {
    const open = document.createElement('button');
    open.id = 'openAuthBtn';
    open.type = 'button';
    open.className = 'btn btn--primary btn--sm';
    open.textContent = 'התחברות';
    open.addEventListener('click', openAuth);
    host.appendChild(open);
  }
};

// Any element with id #openAuthBtn that we did NOT render (e.g. the logged-out
// review-form placeholder on provider pages) should still open the modal.
const wireStandaloneOpeners = () => {
  document.querySelectorAll('#openAuthBtn').forEach((btn) => {
    if (btn.dataset.authWired) return;
    btn.dataset.authWired = '1';
    btn.addEventListener('click', openAuth);
  });
};

// ── Boot auth: read the session, then keep it in sync ───────────────────────
if (supabase) {
  supabase.auth.getSession().then(({ data }) => {
    currentSession = data ? data.session : null;
    renderAuthStatus(currentSession);
    notifyAuth();
    wireStandaloneOpeners();
  });
  supabase.auth.onAuthStateChange((_event, session) => {
    currentSession = session || null;
    renderAuthStatus(currentSession);
    // A fresh sign-in closes the modal; the page surfaces are refreshed too.
    if (currentSession) closeAuth();
    notifyAuth();
    wireStandaloneOpeners();
  });
} else {
  // No backend → show the "התחברות" affordance but it can only report the
  // outage (openAuth surfaces the message). Keeps the UI honest, never broken.
  renderAuthStatus(null);
  wireStandaloneOpeners();
}

// Require a session for a gated action; otherwise open the modal and bail.
const requireAuth = () => {
  if (currentSession) return true;
  openAuth();
  return false;
};

// ════════════════════════════════════════════════════════════════════════════
// Community feed — community.html (#communityApp)
// ════════════════════════════════════════════════════════════════════════════
const communityApp = $('communityApp');
if (communityApp && supabase) {
  const feed = $('communityFeed');
  const tabs = Array.from(document.querySelectorAll('.community-tab'));
  let activeChannel = 'all';
  // post id → liked-by-me, so the heart can toggle without a round-trip read.
  const likedByMe = new Set();

  // Build one post card from a row. Everything user-authored goes through
  // textContent; only structural markup is set as HTML.
  const buildPostCard = (post) => {
    const card = document.createElement('article');
    card.className = 'post-card';
    card.dataset.id = post.id;
    card.dataset.channel = post.channel || 'general';

    const head = document.createElement('div');
    head.className = 'post-card__head';

    const avatar = document.createElement('span');
    avatar.className = 'post-card__avatar';
    avatar.setAttribute('aria-hidden', 'true');
    // avatar may be an emoji/initial string; render as text, never as a URL/HTML.
    avatar.textContent = (post.avatar || (post.author || '?').slice(0, 1)).slice(0, 2);

    const author = document.createElement('span');
    author.className = 'post-card__author';
    author.textContent = post.author || 'אנונימי';

    const channel = document.createElement('span');
    channel.className = 'post-card__channel';
    channel.textContent = CHANNEL_LABEL[post.channel] || 'כללי';

    const time = document.createElement('time');
    time.className = 'post-card__time';
    if (post.created_at) time.setAttribute('datetime', post.created_at);
    time.textContent = timeAgo(post.created_at);

    head.appendChild(avatar);
    head.appendChild(author);
    head.appendChild(channel);
    head.appendChild(time);

    const body = document.createElement('p');
    body.className = 'post-card__body';
    body.textContent = post.body || '';

    const actions = document.createElement('div');
    actions.className = 'post-card__actions';

    const like = document.createElement('button');
    like.type = 'button';
    like.className = 'post-like';
    like.dataset.id = post.id;
    const likeCount = Number(post.like_count) || 0;
    like.setAttribute('aria-pressed', String(likedByMe.has(post.id)));
    like.innerHTML = `<span aria-hidden="true">♥</span> <span class="post-like__count">${likeCount}</span>`;
    like.setAttribute('aria-label', 'אהבתי');

    const replyToggle = document.createElement('button');
    replyToggle.type = 'button';
    replyToggle.className = 'post-reply-toggle';
    replyToggle.dataset.id = post.id;
    replyToggle.textContent = 'תגובה';

    const report = document.createElement('button');
    report.type = 'button';
    report.className = 'post-report';
    report.dataset.id = post.id;
    report.textContent = 'דיווח';
    report.setAttribute('aria-label', 'דיווח על תוכן');

    actions.appendChild(like);
    actions.appendChild(replyToggle);
    actions.appendChild(report);

    const replies = document.createElement('div');
    replies.className = 'post-replies';
    replies.dataset.id = post.id;
    replies.hidden = true;

    card.appendChild(head);
    card.appendChild(body);
    card.appendChild(actions);
    card.appendChild(replies);
    return card;
  };

  // Render the feed for the active channel (honest loading / empty / error).
  const loadFeed = async () => {
    if (!feed) return;
    feed.setAttribute('aria-busy', 'true');
    feed.textContent = '';
    const loading = document.createElement('p');
    loading.className = 'community-empty';
    loading.textContent = 'טוען פוסטים…';
    feed.appendChild(loading);

    let query = supabase.from('community_posts').select('*').order('created_at', { ascending: false }).limit(50);
    if (activeChannel !== 'all') query = query.eq('channel', activeChannel);
    const { data, error } = await query;
    feed.removeAttribute('aria-busy');
    feed.textContent = '';

    if (error) {
      const err = document.createElement('p');
      err.className = 'community-empty community-empty--err';
      err.textContent = 'לא הצלחנו לטעון את הפוסטים כרגע — נסו לרענן.';
      feed.appendChild(err);
      return;
    }
    if (!data || !data.length) {
      const empty = document.createElement('p');
      empty.className = 'community-empty';
      empty.textContent = 'אין עדיין פוסטים בערוץ הזה — היו הראשונים לכתוב!';
      feed.appendChild(empty);
      return;
    }
    // Hydrate likes for the signed-in user so hearts render in their real state.
    await hydrateLikes(data.map((p) => p.id));
    const frag = document.createDocumentFragment();
    data.forEach((post) => frag.appendChild(buildPostCard(post)));
    feed.appendChild(frag);
  };

  // Which of these posts has the current user already liked?
  const hydrateLikes = async (ids) => {
    likedByMe.clear();
    if (!currentSession || !ids.length) return;
    const { data } = await supabase
      .from('post_likes')
      .select('post_id')
      .eq('user_id', currentSession.user.id)
      .in('post_id', ids);
    (data || []).forEach((row) => likedByMe.add(row.post_id));
  };

  // ── Tabs: filter by channel ──────────────────────────────────────────────
  tabs.forEach((tab) => {
    tab.setAttribute('aria-pressed', String(tab.dataset.channel === activeChannel));
    tab.addEventListener('click', () => {
      activeChannel = tab.dataset.channel || 'all';
      tabs.forEach((t) => {
        const on = t === tab;
        t.classList.toggle('active', on);
        t.setAttribute('aria-pressed', String(on));
      });
      loadFeed();
    });
  });

  // ── Composer (authed only; logged-out → #composerLoginPrompt) ────────────
  const composer = $('communityComposer');
  const composerPrompt = $('composerLoginPrompt');
  const composerBody = $('composerBody');
  const composerChannel = $('composerChannel');
  const composerSubmit = $('composerSubmit');

  const syncComposer = (session) => {
    const authed = !!session;
    if (composer) composer.hidden = !authed;
    if (composerPrompt) composerPrompt.hidden = authed;
  };
  onAuth(syncComposer);

  if (composerPrompt) {
    // The prompt's CTA (if any) opens the modal; also make the prompt itself a
    // safe opener for an inline "התחברות" link.
    composerPrompt.querySelectorAll('button, a').forEach((el) => {
      el.addEventListener('click', (e) => { e.preventDefault(); openAuth(); });
    });
  }

  if (composerSubmit) {
    composerSubmit.addEventListener('click', async () => {
      if (!requireAuth()) return;
      const body = (composerBody && composerBody.value || '').trim();
      if (body.length < 2) {
        if (composerBody) composerBody.focus();
        return;
      }
      const channel = (composerChannel && composerChannel.value) || 'general';
      composerSubmit.disabled = true;
      const { error } = await supabase.from('community_posts').insert({
        user_id: currentSession.user.id,
        author: displayName(currentSession),
        channel,
        body,
      });
      composerSubmit.disabled = false;
      if (error) {
        setComposerNote('הפרסום נכשל — נסו שוב.', true);
        return;
      }
      // Clear the field; the realtime INSERT subscription will prepend the card.
      if (composerBody) composerBody.value = '';
      setComposerNote('');
    });
  }

  // Lightweight inline status for the composer (created on demand).
  const setComposerNote = (text, isError) => {
    if (!composer) return;
    let note = composer.querySelector('.composer-note');
    if (!note) {
      note = document.createElement('p');
      note.className = 'composer-note';
      note.setAttribute('aria-live', 'polite');
      composer.appendChild(note);
    }
    note.textContent = text || '';
    note.classList.toggle('composer-note--err', !!isError);
  };

  // ── Delegated actions on the feed: like / reply-toggle / report ───────────
  if (feed) {
    feed.addEventListener('click', async (e) => {
      const likeBtn = e.target.closest && e.target.closest('.post-like');
      if (likeBtn) { handleLike(likeBtn); return; }
      const replyBtn = e.target.closest && e.target.closest('.post-reply-toggle');
      if (replyBtn) { toggleReplies(replyBtn); return; }
      const reportBtn = e.target.closest && e.target.closest('.post-report');
      if (reportBtn) { handleReport(reportBtn); return; }
    });
  }

  const handleLike = async (btn) => {
    if (!requireAuth()) return;
    const id = btn.dataset.id;
    const countEl = btn.querySelector('.post-like__count');
    const liked = likedByMe.has(id);
    btn.disabled = true;
    let ok = true;
    if (liked) {
      const { error } = await supabase.from('post_likes')
        .delete().eq('post_id', id).eq('user_id', currentSession.user.id);
      ok = !error;
      if (ok) likedByMe.delete(id);
    } else {
      const { error } = await supabase.from('post_likes')
        .insert({ post_id: id, user_id: currentSession.user.id });
      ok = !error;
      if (ok) likedByMe.add(id);
    }
    if (ok && countEl) {
      const n = Math.max(0, (Number(countEl.textContent) || 0) + (liked ? -1 : 1));
      countEl.textContent = String(n);
      btn.setAttribute('aria-pressed', String(!liked));
      btn.classList.toggle('is-liked', !liked);
    }
    btn.disabled = false;
  };

  // Toggle a post's reply panel; load + render replies on first open.
  const toggleReplies = async (btn) => {
    const id = btn.dataset.id;
    const panel = feed.querySelector(`.post-replies[data-id="${CSS.escape(id)}"]`);
    if (!panel) return;
    const opening = panel.hidden;
    panel.hidden = !opening;
    btn.setAttribute('aria-expanded', String(opening));
    if (opening && !panel.dataset.loaded) {
      await renderReplies(panel, id);
    }
  };

  const renderReplies = async (panel, postId) => {
    panel.textContent = '';
    const loading = document.createElement('p');
    loading.className = 'post-reply post-reply--muted';
    loading.textContent = 'טוען תגובות…';
    panel.appendChild(loading);
    const { data, error } = await supabase
      .from('community_replies')
      .select('*').eq('post_id', postId).order('created_at', { ascending: true });
    panel.textContent = '';
    if (error) {
      const err = document.createElement('p');
      err.className = 'post-reply post-reply--muted';
      err.textContent = 'לא ניתן לטעון תגובות כרגע.';
      panel.appendChild(err);
      return;
    }
    (data || []).forEach((r) => {
      const row = document.createElement('div');
      row.className = 'post-reply';
      const who = document.createElement('span');
      who.className = 'post-reply__author';
      who.textContent = (r.author || 'אנונימי') + ': ';
      const what = document.createElement('span');
      what.className = 'post-reply__body';
      what.textContent = r.body || '';
      row.appendChild(who);
      row.appendChild(what);
      panel.appendChild(row);
    });
    if (!data || !data.length) {
      const empty = document.createElement('p');
      empty.className = 'post-reply post-reply--muted';
      empty.textContent = 'אין עדיין תגובות.';
      panel.appendChild(empty);
    }
    // A reply composer for signed-in users; logged-out → a gentle opener.
    appendReplyComposer(panel, postId);
    panel.dataset.loaded = '1';
  };

  const appendReplyComposer = (panel, postId) => {
    if (!currentSession) {
      const prompt = document.createElement('button');
      prompt.type = 'button';
      prompt.className = 'btn btn--ghost btn--sm post-reply__login';
      prompt.textContent = 'התחברו כדי להגיב';
      prompt.addEventListener('click', openAuth);
      panel.appendChild(prompt);
      return;
    }
    const form = document.createElement('form');
    form.className = 'post-reply-form';
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'post-reply-form__input';
    input.placeholder = 'כתבו תגובה…';
    input.setAttribute('aria-label', 'תגובה לפוסט');
    input.maxLength = 1000;
    const send = document.createElement('button');
    send.type = 'submit';
    send.className = 'btn btn--primary btn--sm';
    send.textContent = 'שליחה';
    form.appendChild(input);
    form.appendChild(send);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!requireAuth()) return;
      const text = input.value.trim();
      if (text.length < 1) { input.focus(); return; }
      send.disabled = true;
      const { error } = await supabase.from('community_replies').insert({
        post_id: postId,
        user_id: currentSession.user.id,
        author: displayName(currentSession),
        body: text,
      });
      send.disabled = false;
      if (error) { input.focus(); return; }
      input.value = '';
      // Re-render so the new reply appears; reset the loaded flag to force refetch.
      delete panel.dataset.loaded;
      await renderReplies(panel, postId);
    });
    panel.appendChild(form);
  };

  const handleReport = (btn) => {
    if (!requireAuth()) return;
    // No moderation table in the contract — acknowledge honestly, mark handled.
    btn.disabled = true;
    btn.textContent = 'דווח ✓';
    btn.setAttribute('aria-label', 'התקבל דיווח');
  };

  // ── Realtime: prepend newly-inserted posts (honors the active channel) ─────
  supabase
    .channel('community_posts_feed')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'community_posts' }, (payload) => {
      const post = payload.new;
      if (!post) return;
      if (activeChannel !== 'all' && post.channel !== activeChannel) return;
      // Drop any "empty feed" placeholder before inserting the first live card.
      const placeholder = feed && feed.querySelector('.community-empty');
      if (placeholder) placeholder.remove();
      const card = buildPostCard(post);
      if (!reduceMotion) card.classList.add('post-card--enter');
      if (feed) feed.insertBefore(card, feed.firstChild);
    })
    .subscribe();

  loadFeed();
}

// ════════════════════════════════════════════════════════════════════════════
// Ratings leaderboard — ratings.html (#ratingsBoard)
// ════════════════════════════════════════════════════════════════════════════
const ratingsBoard = $('ratingsBoard');
if (ratingsBoard && supabase) {
  const load = async () => {
    ratingsBoard.setAttribute('aria-busy', 'true');
    ratingsBoard.textContent = '';
    const loading = document.createElement('p');
    loading.className = 'ratings-empty';
    loading.textContent = 'טוען דירוגים…';
    ratingsBoard.appendChild(loading);

    const { data, error } = await supabase.from('provider_rating_summary').select('*');
    ratingsBoard.removeAttribute('aria-busy');
    ratingsBoard.textContent = '';

    if (error) {
      const err = document.createElement('p');
      err.className = 'ratings-empty ratings-empty--err';
      err.textContent = 'לא הצלחנו לטעון את הדירוגים כרגע — נסו לרענן.';
      ratingsBoard.appendChild(err);
      return;
    }
    const rows = (data || []).filter((r) => r && r.provider);
    if (!rows.length) {
      const empty = document.createElement('p');
      empty.className = 'ratings-empty';
      empty.textContent = 'אין עדיין דירוגים. היו הראשונים לדרג ספק!';
      ratingsBoard.appendChild(empty);
      return;
    }
    // Sort: avg_stars desc, then review_count desc as the tiebreaker.
    rows.sort((a, b) => (Number(b.avg_stars) || 0) - (Number(a.avg_stars) || 0)
      || (Number(b.review_count) || 0) - (Number(a.review_count) || 0));

    const frag = document.createDocumentFragment();
    rows.forEach((r, i) => {
      const slug = providerSlugByName(r.provider);
      // Linkable when we have a slug → the provider page; otherwise a plain row.
      const row = document.createElement(slug ? 'a' : 'div');
      row.className = 'ratings-row';
      if (slug) row.href = `provider-${slug}.html`;

      const rank = document.createElement('span');
      rank.className = 'ratings-row__rank';
      rank.textContent = String(i + 1);

      const name = document.createElement('span');
      name.className = 'ratings-row__name';
      name.textContent = r.provider; // escaped via textContent

      const stars = starBar(r.avg_stars);

      const count = document.createElement('span');
      count.className = 'ratings-row__count';
      const n = Number(r.review_count) || 0;
      count.textContent = n === 1 ? 'ביקורת אחת' : `${n} ביקורות`;

      row.appendChild(rank);
      row.appendChild(name);
      row.appendChild(stars);
      row.appendChild(count);
      frag.appendChild(row);
    });
    ratingsBoard.appendChild(frag);
  };
  load();
}

// ════════════════════════════════════════════════════════════════════════════
// Provider ratings + review form — provider-*.html (#providerRatings)
// ════════════════════════════════════════════════════════════════════════════
const providerRatings = $('providerRatings');
if (providerRatings && supabase) {
  const provider = window.__PROVIDER__ || {};
  const providerName = provider.name || '';

  // ── Summary: avg + count, or an honest "no reviews yet" ──────────────────
  const loadSummary = async () => {
    const host = $('providerStars');
    if (!host || !providerName) return;
    host.textContent = '';
    const { data, error } = await supabase
      .from('provider_rating_summary')
      .select('*').eq('provider', providerName).maybeSingle();
    if (error) {
      host.textContent = 'לא ניתן לטעון את הדירוג כרגע.';
      return;
    }
    if (!data || !Number(data.review_count)) {
      host.textContent = 'אין עדיין ביקורות';
      return;
    }
    const stars = starBar(data.avg_stars);
    const label = document.createElement('span');
    label.className = 'provider-stars__label';
    const avg = (Number(data.avg_stars) || 0).toFixed(1);
    const n = Number(data.review_count) || 0;
    label.textContent = `${avg} · ${n === 1 ? 'ביקורת אחת' : n + ' ביקורות'}`;
    host.appendChild(stars);
    host.appendChild(label);
  };

  // ── Recent reviews list ──────────────────────────────────────────────────
  const loadReviews = async () => {
    const host = $('providerReviews');
    if (!host || !providerName) return;
    host.setAttribute('aria-busy', 'true');
    host.textContent = '';
    const { data, error } = await supabase
      .from('provider_reviews')
      .select('*').eq('provider', providerName)
      .order('created_at', { ascending: false }).limit(30);
    host.removeAttribute('aria-busy');
    host.textContent = '';
    if (error) {
      const err = document.createElement('p');
      err.className = 'review-empty review-empty--err';
      err.textContent = 'לא ניתן לטעון ביקורות כרגע.';
      host.appendChild(err);
      return;
    }
    if (!data || !data.length) {
      const empty = document.createElement('p');
      empty.className = 'review-empty';
      empty.textContent = 'אין עדיין ביקורות — שתפו את החוויה שלכם.';
      host.appendChild(empty);
      return;
    }
    const frag = document.createDocumentFragment();
    data.forEach((rev) => {
      const card = document.createElement('article');
      card.className = 'review-card';
      const head = document.createElement('div');
      head.className = 'review-card__head';
      head.appendChild(starBar(rev.overall));
      const time = document.createElement('time');
      time.className = 'review-card__time';
      if (rev.created_at) time.setAttribute('datetime', rev.created_at);
      time.textContent = timeAgo(rev.created_at);
      head.appendChild(time);
      card.appendChild(head);
      if (rev.body) {
        const body = document.createElement('p');
        body.className = 'review-card__body';
        body.textContent = rev.body; // escaped via textContent
        card.appendChild(body);
      }
      // Sub-scores, shown only where present (0 = not rated).
      const subs = [['מחיר', rev.price], ['שירות', rev.service], ['כיסוי', rev.coverage], ['מהירות', rev.speed]]
        .filter(([, v]) => Number(v) > 0);
      if (subs.length) {
        const meta = document.createElement('div');
        meta.className = 'review-card__subs';
        subs.forEach(([lbl, v]) => {
          const chip = document.createElement('span');
          chip.className = 'review-sub';
          chip.textContent = `${lbl} ${Number(v)}/5`;
          meta.appendChild(chip);
        });
        card.appendChild(meta);
      }
      frag.appendChild(card);
    });
    host.appendChild(frag);
  };

  // ── Review form (gated) — clickable star inputs + upsert ──────────────────
  const reviewForm = $('reviewForm');
  // Per-field selected score (overall + the four sub-ratings).
  const scores = { overall: 0, price: 0, service: 0, coverage: 0, speed: 0 };

  // Wire one .star-input group (data-field) as a 1–5 keyboard-accessible rating.
  const wireStarInput = (group) => {
    const field = group.dataset.field;
    if (!field) return;
    let stars = Array.from(group.querySelectorAll('.star-input__star'));
    // If build.js emitted an empty container, populate 5 stars ourselves.
    if (!stars.length) {
      for (let i = 1; i <= 5; i++) {
        const s = document.createElement('button');
        s.type = 'button';
        s.className = 'star-input__star';
        s.dataset.value = String(i);
        s.textContent = '☆';
        s.setAttribute('aria-label', `${i} כוכבים`);
        group.appendChild(s);
      }
      stars = Array.from(group.querySelectorAll('.star-input__star'));
    }
    const paint = (val) => {
      stars.forEach((s) => {
        const v = Number(s.dataset.value);
        const on = v <= val;
        s.textContent = on ? '★' : '☆';
        s.classList.toggle('is-on', on);
        s.setAttribute('aria-pressed', String(on));
      });
    };
    group.setAttribute('role', 'group');
    stars.forEach((s) => {
      s.addEventListener('click', () => { scores[field] = Number(s.dataset.value); paint(scores[field]); });
      s.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); scores[field] = Number(s.dataset.value); paint(scores[field]); }
      });
    });
    paint(0);
  };

  // Sub-fields may be <select> instead of stars — read those at submit time.
  const readSelect = (field) => {
    const sel = reviewForm && reviewForm.querySelector(`select[data-field="${field}"]`);
    return sel ? Number(sel.value) || 0 : 0;
  };

  const syncReviewForm = (session) => {
    if (!reviewForm) return;
    const authed = !!session;
    // Logged-out → hide the form, surface an opener (#openAuthBtn) in its place.
    reviewForm.hidden = !authed;
    let placeholder = providerRatings.querySelector('.review-login');
    if (!authed) {
      if (!placeholder) {
        placeholder = document.createElement('div');
        placeholder.className = 'review-login';
        const open = document.createElement('button');
        // Use the shared id so wireStandaloneOpeners can also catch it.
        open.id = 'openAuthBtn';
        open.type = 'button';
        open.className = 'btn btn--primary btn--sm';
        open.textContent = 'התחברו כדי לכתוב ביקורת';
        open.addEventListener('click', openAuth);
        placeholder.appendChild(open);
        reviewForm.insertAdjacentElement('beforebegin', placeholder);
      }
      placeholder.hidden = false;
    } else if (placeholder) {
      placeholder.hidden = true;
    }
  };

  if (reviewForm) {
    document.querySelectorAll('.star-input[data-field]').forEach(wireStarInput);
    const submit = $('reviewSubmit');
    if (submit) {
      submit.addEventListener('click', async (e) => {
        e.preventDefault();
        if (!requireAuth()) return;
        // overall is required; sub-ratings come from stars or selects (optional).
        const overall = scores.overall;
        if (!(overall >= 1 && overall <= 5)) {
          setReviewNote('בחרו דירוג כללי (1–5 כוכבים).', true);
          return;
        }
        const bodyEl = $('reviewBody');
        const body = (bodyEl && bodyEl.value || '').trim();
        const price = scores.price || readSelect('price');
        const service = scores.service || readSelect('service');
        const coverage = scores.coverage || readSelect('coverage');
        const speed = scores.speed || readSelect('speed');
        submit.disabled = true;
        setReviewNote('שומרים את הביקורת…');
        // Upsert on (user_id, provider): one review per user per provider, edited
        // in place on resubmit.
        const { error } = await supabase.from('provider_reviews').upsert({
          user_id: currentSession.user.id,
          provider: providerName,
          overall,
          price, service, coverage, speed,
          body: body || null,
        }, { onConflict: 'user_id,provider' });
        submit.disabled = false;
        if (error) { setReviewNote('שמירת הביקורת נכשלה — נסו שוב.', true); return; }
        setReviewNote('תודה! הביקורת נשמרה.');
        // Refresh the summary + list so the new/updated review appears.
        loadSummary();
        loadReviews();
      });
    }
  }

  const setReviewNote = (text, isError) => {
    if (!reviewForm) return;
    let note = reviewForm.querySelector('.review-note');
    if (!note) {
      note = document.createElement('p');
      note.className = 'review-note';
      note.setAttribute('aria-live', 'polite');
      reviewForm.appendChild(note);
    }
    note.textContent = text || '';
    note.classList.toggle('review-note--err', !!isError);
  };

  onAuth(syncReviewForm);
  loadSummary();
  loadReviews();
}
