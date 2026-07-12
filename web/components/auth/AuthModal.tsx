"use client";

// ────────────────────────────────────────────────────────────────────────────
// <AuthModal> — sign in / sign up dialog for the community.
//
//   • Google + Facebook via signInWithOAuth (redirect → /auth/callback).
//   • Email + password (sign in / sign up) via Supabase Auth.
//   • Sign-up REQUIRES accepting Terms + Privacy (marketing optional) and records
//     it server-side via record_registration_consent, matching the app's flow.
//
// Fail-soft, Hebrew errors, RTL, dark-aware, a11y (role=dialog, focus trap via
// the shared useFocusTrap hook, Esc, focus restore). OAuth providers only work
// once the owner configures them in the Supabase dashboard; email/password works
// immediately. The OAuth buttons disable + show a spinner while the provider
// redirect is in flight so slow networks don't invite double-clicks.
// ────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import { getBrowserSupabase, SUPABASE_CONFIGURED } from "@/lib/supabase-browser";
import { useFocusTrap } from "@/lib/use-focus-trap";

const CONSENT_VERSION = "2026-06"; // matches record_registration_consent default + the app

type Mode = "signin" | "signup";

export interface AuthModalProps {
  open: boolean;
  onClose: () => void;
  defaultMode?: Mode;
}

function mapError(msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes("invalid login")) return "אימייל או סיסמה שגויים.";
  if (m.includes("already registered") || m.includes("already been registered"))
    return "האימייל כבר רשום — נסו להתחבר.";
  if (m.includes("password") && m.includes("6")) return "הסיסמה חייבת להיות באורך 6 תווים לפחות.";
  if (m.includes("rate limit") || m.includes("too many")) return "יותר מדי ניסיונות. נסו שוב בעוד רגע.";
  if (m.includes("provider is not enabled") || m.includes("not enabled"))
    return "הכניסה הזו עדיין לא הופעלה. נסו אימייל/סיסמה.";
  return "משהו השתבש. נסו שוב.";
}

export default function AuthModal({ open, onClose, defaultMode = "signin" }: AuthModalProps) {
  const [mode, setMode] = useState<Mode>(defaultMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [terms, setTerms] = useState(false);
  const [privacy, setPrivacy] = useState(false);
  const [marketing, setMarketing] = useState(false);
  const [loading, setLoading] = useState(false);
  // Which OAuth provider's redirect is in flight — disables both OAuth buttons
  // (and the email submit) and shows a spinner on the clicked one.
  const [oauthBusy, setOauthBusy] = useState<"google" | "facebook" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const cardRef = useRef<HTMLDivElement>(null);
  const firstFieldRef = useRef<HTMLInputElement>(null);

  // Reset the form state on (re)open.
  useEffect(() => {
    if (!open) return;
    setMode(defaultMode);
    setError(null);
    setInfo(null);
    setOauthBusy(null);
  }, [open, defaultMode]);

  // Focus + keyboard contract (shared useFocusTrap hook): focus the first field
  // shortly after open, trap Tab within the card, Esc closes, restore to opener.
  useFocusTrap(cardRef, {
    active: open,
    onEscape: onClose,
    preventDefaultOnEscape: true,
    initialFocusRef: firstFieldRef,
    initialFocusDelay: 40,
    // Preserve the modal's original clamp: only cycle when focus is on the
    // card's first/last control, never yank focus that has left the card.
    clampOutsideFocus: false,
  });

  // If the user comes BACK from the provider via the bfcache (browser back after
  // the redirect started), the page restores with `oauthBusy` still set — clear
  // it so the buttons aren't stuck disabled.
  useEffect(() => {
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) setOauthBusy(null);
    };
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, []);

  const oauth = useCallback(
    async (provider: "google" | "facebook") => {
      if (oauthBusy || loading) return;
      setError(null);
      if (!SUPABASE_CONFIGURED) return;
      setOauthBusy(provider);
      try {
        sessionStorage.setItem("swc:return", window.location.pathname + window.location.search);
      } catch {
        /* ignore */
      }
      try {
        const { error: err } = await getBrowserSupabase().auth.signInWithOAuth({
          provider,
          options: { redirectTo: `${window.location.origin}/auth/callback` },
        });
        if (err) {
          setError(mapError(err.message));
          setOauthBusy(null);
        }
        // On success the browser navigates away to the provider — keep the busy
        // state so the buttons stay disabled until the redirect lands.
      } catch {
        setError(mapError(""));
        setOauthBusy(null);
      }
    },
    [oauthBusy, loading],
  );

  const submitEmail = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError(null);
      setInfo(null);
      if (!SUPABASE_CONFIGURED) return;
      const sb = getBrowserSupabase();
      setLoading(true);
      try {
        if (mode === "signin") {
          const { error: err } = await sb.auth.signInWithPassword({ email, password });
          if (err) {
            setError(mapError(err.message));
            return;
          }
          onClose();
          return;
        }

        // sign up
        if (!name.trim()) {
          setError("צריך שם תצוגה.");
          return;
        }
        if (!terms || !privacy) {
          setError("צריך לאשר את תנאי השימוש ומדיניות הפרטיות.");
          return;
        }
        const { data, error: err } = await sb.auth.signUp({
          email,
          password,
          options: { data: { name: name.trim() }, emailRedirectTo: `${window.location.origin}/auth/callback` },
        });
        if (err) {
          setError(mapError(err.message));
          return;
        }
        if (data.session) {
          // Immediate session (email confirmation off): stamp consent + name.
          await sb.rpc("record_registration_consent", {
            p_terms: true,
            p_privacy: true,
            p_marketing: marketing,
            p_consent_version: CONSENT_VERSION,
          });
          await sb.from("profiles").update({ name: name.trim() }).eq("id", data.session.user.id);
          onClose();
        } else {
          // Email confirmation required — the consent is stamped after they confirm
          // + first sign in (they'll re-accept is not needed; we record on first
          // authenticated session via a follow-up). Tell them to check their inbox.
          setInfo("שלחנו לכם מייל אימות — אשרו אותו כדי להשלים את ההרשמה.");
        }
      } finally {
        setLoading(false);
      }
    },
    [mode, email, password, name, terms, privacy, marketing, onClose],
  );

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-label={mode === "signin" ? "התחברות" : "הרשמה"}
        // Small-viewport guard: cap the card to the visual viewport (minus the
        // overlay's p-4 gutter) and scroll INSIDE it, so the signup submit stays
        // reachable on short phones / with the keyboard up. The rounded corners
        // survive because the radius sits on this same scroll container.
        className="max-h-[calc(100dvh-2rem)] w-full max-w-sm overflow-y-auto overscroll-contain rounded-2xl border border-border bg-surface p-6 shadow-float"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-xl font-bold text-ink">
            {mode === "signin" ? "התחברות לקהילה" : "הצטרפות לקהילה"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="סגירה"
            className="flex h-9 w-9 items-center justify-center rounded-full text-muted transition-colors hover:bg-accent/10 hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        {/* OAuth — disabled (with a spinner on the clicked one) while the
            provider redirect is in flight, so slow networks don't invite
            double-clicks. Labels unchanged. */}
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => void oauth("google")}
            disabled={loading || oauthBusy !== null}
            aria-busy={oauthBusy === "google"}
            className="flex items-center justify-center gap-3 rounded-xl border border-border bg-surface px-4 py-2.5 text-sm font-semibold text-ink transition-colors hover:bg-accent/[0.06] disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            {oauthBusy === "google" ? <BusySpinner /> : <GoogleMark />} המשך עם Google
          </button>
          <button
            type="button"
            onClick={() => void oauth("facebook")}
            disabled={loading || oauthBusy !== null}
            aria-busy={oauthBusy === "facebook"}
            className="flex items-center justify-center gap-3 rounded-xl border border-transparent bg-[#1877F2] px-4 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            {oauthBusy === "facebook" ? <BusySpinner /> : <FacebookMark />} המשך עם Facebook
          </button>
        </div>

        <div className="my-4 flex items-center gap-3 text-xs text-muted">
          <span className="h-px flex-1 bg-border" />
          או
          <span className="h-px flex-1 bg-border" />
        </div>

        {/* Email / password */}
        <form onSubmit={submitEmail} className="flex flex-col gap-3">
          {mode === "signup" && (
            <input
              ref={firstFieldRef}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="שם תצוגה"
              autoComplete="name"
              maxLength={40}
              className="rounded-xl border border-border bg-surface px-3 py-2.5 text-sm text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
            />
          )}
          <input
            ref={mode === "signin" ? firstFieldRef : undefined}
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="אימייל"
            autoComplete="email"
            required
            className="rounded-xl border border-border bg-surface px-3 py-2.5 text-sm text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="סיסמה"
            autoComplete={mode === "signin" ? "current-password" : "new-password"}
            required
            minLength={6}
            className="rounded-xl border border-border bg-surface px-3 py-2.5 text-sm text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
          />

          {mode === "signup" && (
            <div className="flex flex-col gap-2 text-xs text-foreground">
              <label className="flex items-start gap-2">
                <input type="checkbox" checked={terms} onChange={(e) => setTerms(e.target.checked)} className="mt-0.5 accent-[var(--accent)]" />
                <span>
                  קראתי ואני מסכים/ה ל<a href="/terms" target="_blank" rel="noopener noreferrer" className="text-accent-text underline">תנאי השימוש</a>
                </span>
              </label>
              <label className="flex items-start gap-2">
                <input type="checkbox" checked={privacy} onChange={(e) => setPrivacy(e.target.checked)} className="mt-0.5 accent-[var(--accent)]" />
                <span>
                  קראתי ואני מסכים/ה ל<a href="/privacy" target="_blank" rel="noopener noreferrer" className="text-accent-text underline">מדיניות הפרטיות</a>
                </span>
              </label>
              <label className="flex items-start gap-2">
                <input type="checkbox" checked={marketing} onChange={(e) => setMarketing(e.target.checked)} className="mt-0.5 accent-[var(--accent)]" />
                <span>מעוניין/ת לקבל עדכונים ומבצעים (אופציונלי)</span>
              </label>
            </div>
          )}

          {error && <p role="alert" className="text-xs font-medium text-red-600 dark:text-red-400">{error}</p>}
          {info && <p role="status" className="text-xs font-medium text-accent-text">{info}</p>}

          <button
            type="submit"
            disabled={loading || oauthBusy !== null}
            className="mt-1 flex items-center justify-center rounded-xl border border-accent/40 bg-accent px-4 py-2.5 text-sm font-semibold text-accent-contrast shadow-[var(--glow-accent)] transition-colors hover:bg-accent-hover disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            {loading ? "רגע…" : mode === "signin" ? "התחברות" : "הרשמה"}
          </button>
        </form>

        <p className="mt-4 text-center text-xs text-muted">
          {mode === "signin" ? "אין לכם חשבון?" : "כבר רשומים?"}{" "}
          <button
            type="button"
            onClick={() => {
              setMode(mode === "signin" ? "signup" : "signin");
              setError(null);
              setInfo(null);
            }}
            className="inline-block px-1.5 py-1 font-semibold text-accent-text underline"
          >
            {mode === "signin" ? "הרשמה" : "התחברות"}
          </button>
        </p>
      </div>
    </div>
  );
}

/** In-flight spinner shown in place of the provider mark while redirecting. */
function BusySpinner() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="animate-spin">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" opacity="0.25" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.9 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.6 6.1 29.6 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.3-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.6 6.1 29.6 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 10-2 13.6-5.2l-6.3-5.2C29.2 35.1 26.7 36 24 36c-5.3 0-9.7-3.1-11.3-7.4l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.1-4 5.5l6.3 5.2C41.9 35.6 44 30.3 44 24c0-1.3-.1-2.3-.4-3.5z" />
    </svg>
  );
}

function FacebookMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M24 12.07C24 5.4 18.63 0 12 0S0 5.4 0 12.07C0 18.1 4.39 23.1 10.13 24v-8.44H7.08v-3.49h3.05V9.41c0-3.02 1.79-4.69 4.53-4.69 1.31 0 2.68.24 2.68.24v2.97h-1.51c-1.49 0-1.96.93-1.96 1.89v2.25h3.33l-.53 3.49h-2.8V24C19.61 23.1 24 18.1 24 12.07z" />
    </svg>
  );
}
