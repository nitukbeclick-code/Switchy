"use client";

// ────────────────────────────────────────────────────────────────────────────
// <AiConcierge> — floating AI chat widget ("Switchy AI").
//
// A launcher button (inline in the STICKY <SiteHeader>, beside the theme toggle,
// per the owner — no longer a bottom-corner FAB) that opens a chat panel BELOW the
// header, calling /api/ai-chat ->
// site-ai-chat (the grounded agent: answers ONLY from the real catalogue, cites
// [Sn], refuses/omits when data is missing). When the agent detects a genuine
// switch/contact intent it returns `offerLead:true`; we then show an INLINE lead
// step that reuses the site's consent contract — a MANDATORY, unchecked-by-default
// consent checkbox + the §7b commission disclosure shown BEFORE the hand-off — so
// a lead is never captured without explicit consent. The agent gates capture
// server-side too (consent===true required); this is defence in depth.
//
// COMPLIANCE / HONESTY:
//   • §7b commission disclosure (<CommissionDisclosure variant="inline">) is shown
//     above the lead fields, before any data is sent.
//   • Consent is MANDATORY + default-OFF; submit is disabled until it's checked.
//   • We never fabricate prices/recommendations — the agent is grounded.
//
// UX: dark-mode + premium-2026 tokens, RTL Hebrew, a11y (focus trap-ish, ESC to
// close, labelled controls, aria-live transcript), prefers-reduced-motion aware.
// sessionId persists in sessionStorage so a reload keeps the conversation; the
// backend also remembers it server-side.
// ────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import Icon from "@/components/Icon";
import CommissionDisclosure from "@/components/CommissionDisclosure";
import { trackEvent, fireLeadConversion } from "@/lib/tracking";
import { isValidIsraeliPhone } from "@/lib/phone";
import { CONTACT_WHATSAPP_INTL } from "@/lib/legal";

type Role = "user" | "bot";
interface Turn {
  role: Role;
  text: string;
}

/** Persisted across reloads so the backend can restore server-side memory too. */
const SESSION_KEY = "chosech-ai-session";
const MAX_MESSAGE_LEN = 500;
const MAX_HISTORY_SENT = 6;

const GREETING =
  "היי! אני Switchy AI 🤖 אפשר לשאול אותי על מסלולי סלולר, אינטרנט, טלוויזיה, " +
  "חבילות משולבות וחבילות לחו״ל — ואני אעזור למצוא מה משתלם. במה אפשר לעזור?";

/** Read or mint a session id (sessionStorage, fail-soft). */
function loadSessionId(): string {
  try {
    const v = sessionStorage.getItem(SESSION_KEY);
    if (v) return v;
  } catch {
    /* private mode — fall through to a transient id */
  }
  // URL-safe, 6–64 chars per the backend's safeSessionId regex.
  const id = `web-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
  try {
    sessionStorage.setItem(SESSION_KEY, id);
  } catch {
    /* ignore */
  }
  return id;
}

interface ChatResponse {
  reply?: string;
  offerLead?: boolean;
  leadCaptured?: boolean;
  contextTruncated?: boolean;
  sessionId?: string;
  error?: string;
}

export default function AiConcierge() {
  const [open, setOpen] = useState(false);
  // Graceful EXIT: closing the panel doesn't unmount it instantly — we keep it in
  // the DOM via `closing` and reverse the SAME origin-aware popover transition
  // (scale back down to 0.96 + fade), so it visually collapses BACK INTO the
  // launcher corner it grew from. Finalize on transitionend (timeout fallback for
  // reduced-motion / no-layout). Re-opening mid-exit cancels `closing` and the
  // enter transition replays from the launcher corner.
  const [closing, setClosing] = useState(false);
  const exitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [turns, setTurns] = useState<Turn[]>([{ role: "bot", text: GREETING }]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Lead capture sub-flow (shown when the agent sets offerLead).
  const [offerLead, setOfferLead] = useState(false);
  const [leadCaptured, setLeadCaptured] = useState(false);
  const [leadName, setLeadName] = useState("");
  const [leadPhone, setLeadPhone] = useState("");
  const [leadConsent, setLeadConsent] = useState(false);
  const [leadError, setLeadError] = useState<string | null>(null);
  // Which field the current leadError belongs to → lets us set aria-invalid +
  // aria-describedby on that specific input (WCAG 3.3.1 field-level error id).
  const [leadErrorField, setLeadErrorField] = useState<
    "name" | "phone" | "consent" | null
  >(null);
  const [leadSending, setLeadSending] = useState(false);

  const sessionIdRef = useRef<string>("");
  const panelRef = useRef<HTMLDivElement | null>(null);
  const transcriptRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const launcherRef = useRef<HTMLButtonElement | null>(null);

  const titleId = useId();
  const consentId = useId();

  // Mint the session id once on mount (client-only).
  useEffect(() => {
    sessionIdRef.current = loadSessionId();
  }, []);

  // Auto-scroll the transcript to the newest message.
  useEffect(() => {
    const el = transcriptRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [turns, offerLead, leadCaptured, sending]);

  // Focus the input when the panel OPENS. (Focus restoration to the launcher is
  // handled by closePanel, NOT here — an else-branch focus would steal focus to
  // the header button on the initial mount / every close, including sibling-close.)
  useEffect(() => {
    if (!open) return;
    // Defer so the element exists + the open animation doesn't eat the focus.
    const t = setTimeout(() => inputRef.current?.focus(), 50);
    return () => clearTimeout(t);
  }, [open]);

  // Begin the graceful exit: flip closed but keep the panel MOUNTED via `closing`
  // so the reverse origin-aware transition can collapse it back into the launcher
  // corner; finalize on transitionend, with a timeout fallback. `restoreFocus`
  // returns focus to the launcher on a USER close (ESC / X / toggle) but NOT when
  // a sibling header popover force-closes this one (the sibling now owns focus).
  const closePanel = useCallback((restoreFocus = true) => {
    setOpen(false);
    setClosing(true);
    if (restoreFocus) launcherRef.current?.focus();
    if (exitTimer.current) clearTimeout(exitTimer.current);
    exitTimer.current = setTimeout(() => {
      setClosing(false);
      exitTimer.current = null;
    }, 280);
  }, []);

  // One header popover open at a time: when a sibling (the accessibility menu)
  // announces it opened, close this one — without restoring focus (the sibling
  // has it). Covers the keyboard-open case a pointerdown-outside handler misses.
  useEffect(() => {
    function onSiblingOpen(e: Event) {
      if ((e as CustomEvent<string>).detail !== "concierge") closePanel(false);
    }
    window.addEventListener("switchy:popover-open", onSiblingOpen as EventListener);
    return () =>
      window.removeEventListener("switchy:popover-open", onSiblingOpen as EventListener);
  }, [closePanel]);

  // ESC closes the panel (through the graceful exit).
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") closePanel();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, closePanel]);

  // Clear any pending exit timer on unmount.
  useEffect(
    () => () => {
      if (exitTimer.current) clearTimeout(exitTimer.current);
    },
    [],
  );

  function toggle() {
    if (open) {
      closePanel();
      return;
    }
    // Opening: cancel any in-flight exit so the panel re-grows from the corner.
    setClosing(false);
    if (exitTimer.current) {
      clearTimeout(exitTimer.current);
      exitTimer.current = null;
    }
    setOpen(true);
    // Tell the sibling header popover(s) to close so only one is open at a time.
    window.dispatchEvent(
      new CustomEvent("switchy:popover-open", { detail: "concierge" }),
    );
    trackEvent("ai_chat_open", { source: "concierge" });
  }

  const send = useCallback(
    async (text: string) => {
      const message = text.trim();
      if (!message || sending) return;
      setError(null);
      setInput("");
      setSending(true);

      // Optimistically append the user's turn.
      const history = turns.slice(-MAX_HISTORY_SENT).map((t) => ({
        role: t.role,
        text: t.text,
      }));
      setTurns((prev) => [...prev, { role: "user", text: message }]);
      trackEvent("ai_chat_message", { source: "concierge" });

      try {
        const res = await fetch("/api/ai-chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: message.slice(0, MAX_MESSAGE_LEN),
            history,
            sessionId: sessionIdRef.current,
          }),
        });
        const data = (await res.json().catch(() => null)) as ChatResponse | null;

        if (!res.ok || !data) {
          setError(
            data?.error ??
              "אירעה שגיאה. נסו שוב בעוד רגע או דברו איתנו בוואטסאפ.",
          );
          return;
        }

        if (data.sessionId) sessionIdRef.current = data.sessionId;
        if (data.reply) {
          setTurns((prev) => [...prev, { role: "bot", text: data.reply! }]);
        }
        if (data.contextTruncated) {
          setTurns((prev) => [
            ...prev,
            {
              role: "bot",
              text: "(הערה: יש לי זיכרון מוגבל של ההודעות הראשונות בשיחה.)",
            },
          ]);
        }
        if (data.offerLead) {
          setOfferLead(true);
          trackEvent("ai_chat_offer_lead", { source: "concierge" });
        }
      } catch {
        setError("החיבור נכשל. בדקו את הרשת ונסו שוב.");
      } finally {
        setSending(false);
      }
    },
    [sending, turns],
  );

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    void send(input);
  }

  async function submitLead(e: React.FormEvent) {
    e.preventDefault();
    setLeadError(null);
    setLeadErrorField(null);

    const name = leadName.trim();
    const phone = leadPhone.trim();
    if (name.length < 2) {
      setLeadError("נא להזין שם מלא");
      setLeadErrorField("name");
      return;
    }
    if (!isValidIsraeliPhone(phone)) {
      setLeadError("מספר הטלפון אינו תקין");
      setLeadErrorField("phone");
      return;
    }
    if (!leadConsent) {
      setLeadError("יש לאשר יצירת קשר כדי שנחזור אליכם");
      setLeadErrorField("consent");
      return;
    }

    setLeadSending(true);
    try {
      // The agent endpoint captures the lead server-side (consent===true required).
      const res = await fetch("/api/ai-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          // A short, non-empty message keeps the backend contract happy; the
          // structured `lead` is what triggers consented capture.
          message: "אשמח שתחזרו אליי עם הצעה",
          sessionId: sessionIdRef.current,
          lead: {
            name,
            phone,
            consent: true,
            notes: "נלכד דרך Switchy AI (צ׳אט באתר)",
          },
        }),
      });
      const data = (await res.json().catch(() => null)) as ChatResponse | null;

      if (!res.ok || !data || !data.leadCaptured) {
        setLeadError(
          data?.error ??
            "לא הצלחנו לשמור את הפרטים. נסו שוב או דברו איתנו בוואטסאפ.",
        );
        return;
      }

      // Success — fire conversion once, collapse the lead step, confirm.
      fireLeadConversion({ source: "ai_concierge" });
      setLeadCaptured(true);
      setOfferLead(false);
      if (data.reply) {
        setTurns((prev) => [...prev, { role: "bot", text: data.reply! }]);
      }
      setTurns((prev) => [
        ...prev,
        {
          role: "bot",
          text: "תודה! קיבלנו את הפרטים ונחזור אליכם עם השוואת הצעות מותאמת. השירות חינמי וללא התחייבות.",
        },
      ]);
    } catch {
      setLeadError("החיבור נכשל. בדקו את הרשת ונסו שוב — הפרטים לא נשלחו.");
    } finally {
      setLeadSending(false);
    }
  }

  return (
    <>
      {/* Launcher — inline header button (rendered inside SiteHeader's end cluster). */}
      <button
        ref={launcherRef}
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-controls={open ? titleId : undefined}
        aria-label={open ? "סגירת הצ׳אט עם Switchy AI" : "פתיחת צ׳אט עם Switchy AI"}
        className={[
          // Inline HEADER button (moved out of the bottom-corner FAB, per owner —
          // grouped with the theme toggle + a11y trigger so it no longer overlaps
          // page content). A compact 44px round brand-green launcher.
          "flex h-11 w-11 shrink-0 items-center justify-center rounded-full",
          "bg-accent text-accent-contrast shadow-sm",
          "interactive press hover:bg-accent-hover",
          "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
        ].join(" ")}
      >
        <Icon name={open ? "close" : "chat"} size={22} strokeWidth={2} />
      </button>

      {/* Panel — mounted while open OR exiting (kept alive to collapse back into
          the launcher corner). */}
      {(open || closing) && (
        <div
          ref={panelRef}
          {...(closing
            ? { "aria-hidden": true }
            : { role: "dialog", "aria-modal": "false", "aria-labelledby": titleId })}
          onTransitionEnd={(e) => {
            // Only finalize on the panel's OWN transform/opacity exit (ignore child
            // bubbling + the enter transition).
            if (e.target !== e.currentTarget || open) return;
            if (exitTimer.current) {
              clearTimeout(exitTimer.current);
              exitTimer.current = null;
            }
            setClosing(false);
          }}
          // ORIGIN-AWARE popover (Emil rule 7): the panel scales UP FROM the
          // launcher's corner, not its own center, so it reads as "this opened from
          // the button" — and on close it collapses BACK INTO that same corner. The
          // launcher pins to the inline-start, bottom corner — in this RTL app that
          // is physically bottom-right. The shared `.popover` utility (globals.css)
          // handles the enter: scale(0.96)+opacity:0 via @starting-style (never
          // scale(0), rule 6), interruptible transition (transform+opacity), dropdown
          // band, reduced-motion-safe opacity-only fallback. For the EXIT we re-apply
          // that same end state (scale(0.96)+opacity:0) as utilities, which animates
          // back through `.popover`'s own transition — same curve, same
          // `--popover-origin` corner — so the panel collapses INTO the launcher.
          // `pointer-events-none` keeps the closing panel inert (never blocks input).
          // Origin-aware popover: grows from / collapses into the header trigger's
          // corner (now the top-inline-end of the sticky masthead, not a bottom FAB).
          style={{ ["--popover-origin" as string]: "top left" }}
          className={[
            "popover",
            closing
              ? "pointer-events-none scale-[0.96] opacity-0 motion-reduce:scale-100"
              : "",
            // Opens BELOW the sticky header, pinned to the inline-END (RTL: left)
            // corner UNDER the trigger. The inline-end tracks the centered header's
            // gutter (max-w-5xl = 64rem) so on wide screens the panel descends from
            // the button, not the far viewport edge; folds to 1rem on phones.
            "fixed top-16 z-40 flex w-[min(22rem,calc(100vw-2rem))] flex-col end-[calc(max(0px,(100vw-64rem)/2)+1rem)]",
            "max-h-[min(34rem,calc(100dvh-6rem))] overflow-hidden rounded-2xl",
            "border border-border bg-surface shadow-float",
          ].join(" ")}
        >
          {/* Header */}
          <div className="flex items-center justify-between gap-2 border-b border-border bg-surface px-4 py-3">
            <div className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className="flex h-8 w-8 items-center justify-center rounded-full bg-accent/15 text-base text-accent-text"
              >
                🤖
              </span>
              <div>
                <h2
                  id={titleId}
                  className="font-display text-sm font-bold leading-tight text-ink"
                >
                  Switchy AI
                </h2>
                <p className="text-[11px] leading-tight text-muted">
                  עוזר חכם להשוואת מסלולי תקשורת
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => closePanel()}
              aria-label="סגירת הצ׳אט"
              className="interactive press -me-1.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-background hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              <Icon name="close" size={20} aria-hidden="true" />
            </button>
          </div>

          {/* Transcript */}
          <div
            ref={transcriptRef}
            className="flex-1 overflow-y-auto px-4 py-3"
          >
            {/* Live region — ONLY the streamed chat turns are announced; the
                interactive lead form below is a sibling (not a child), so its
                re-renders (validation error appearing, submit-state flip) are
                not read out as new transcript content. */}
            <div className="space-y-3" aria-live="polite" aria-atomic="false">
            {turns.map((t, i) => (
              <div
                key={i}
                className={[
                  "flex",
                  t.role === "user" ? "justify-start" : "justify-end",
                ].join(" ")}
              >
                <div
                  className={[
                    "max-w-[85%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm leading-relaxed",
                    t.role === "user"
                      ? "bg-accent text-accent-contrast"
                      : "bg-background text-foreground",
                  ].join(" ")}
                >
                  {t.text}
                </div>
              </div>
            ))}

            {sending && (
              <div className="flex justify-end">
                <div className="rounded-2xl bg-background px-3 py-2 text-sm text-muted">
                  <span className="sr-only">Switchy AI מקליד…</span>
                  <span aria-hidden="true">Switchy AI מקליד…</span>
                </div>
              </div>
            )}

            {error && (
              <p role="alert" className="text-center text-xs text-danger-text">
                {error}
              </p>
            )}
            </div>

            {/* Lead capture sub-flow — shown when the agent offers it. Reuses the
                site consent contract: §7b disclosure above, MANDATORY default-OFF
                consent, submit disabled until checked. */}
            {offerLead && !leadCaptured && (
              <form
                onSubmit={submitLead}
                className="mt-3 rounded-xl border border-border bg-background/60 p-3"
                aria-label="השארת פרטים ליצירת קשר"
              >
                <p className="text-xs font-semibold text-foreground">
                  רוצים שנחזור אליכם עם השוואת הצעות? השאירו פרטים — חינם, ללא
                  התחייבות.
                </p>

                {/* §7b commission disclosure BEFORE the hand-off. */}
                <CommissionDisclosure variant="inline" className="mt-2" />

                <div className="mt-3 space-y-2">
                  <label htmlFor={`${consentId}-name`} className="sr-only">
                    שם מלא
                  </label>
                  <input
                    id={`${consentId}-name`}
                    type="text"
                    autoComplete="name"
                    placeholder="שם מלא"
                    value={leadName}
                    onChange={(e) => setLeadName(e.target.value)}
                    aria-invalid={leadErrorField === "name" || undefined}
                    aria-describedby={
                      leadErrorField === "name"
                        ? `${consentId}-lead-error`
                        : undefined
                    }
                    className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
                  />
                  <label htmlFor={`${consentId}-phone`} className="sr-only">
                    מספר טלפון
                  </label>
                  <input
                    id={`${consentId}-phone`}
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    dir="ltr"
                    placeholder="מספר טלפון"
                    value={leadPhone}
                    onChange={(e) => setLeadPhone(e.target.value)}
                    aria-invalid={leadErrorField === "phone" || undefined}
                    aria-describedby={
                      leadErrorField === "phone"
                        ? `${consentId}-lead-error`
                        : undefined
                    }
                    className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-right text-sm text-foreground outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
                  />
                </div>

                {/* MANDATORY consent — unchecked by default. */}
                <div className="mt-3 flex items-start gap-2 text-xs text-foreground">
                  <input
                    id={`${consentId}-consent`}
                    type="checkbox"
                    checked={leadConsent}
                    onChange={(e) => setLeadConsent(e.target.checked)}
                    aria-invalid={leadErrorField === "consent" || undefined}
                    aria-describedby={
                      leadErrorField === "consent"
                        ? `${consentId}-lead-error`
                        : undefined
                    }
                    className="mt-0.5 h-4 w-4 shrink-0 rounded border-border text-accent accent-accent focus:ring-2 focus:ring-accent/30"
                  />
                  <label
                    htmlFor={`${consentId}-consent`}
                    className="cursor-pointer leading-snug"
                  >
                    אני מאשר/ת את{" "}
                    <Link
                      href="/terms"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-accent-text underline hover:text-accent-hover"
                    >
                      תנאי השימוש
                    </Link>{" "}
                    ו
                    <Link
                      href="/privacy"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-accent-text underline hover:text-accent-hover"
                    >
                      מדיניות הפרטיות
                    </Link>{" "}
                    ומסכים/ה ליצירת קשר בנוגע להצעות תקשורת.
                  </label>
                </div>

                {leadError && (
                  <p
                    id={`${consentId}-lead-error`}
                    role="alert"
                    className="mt-2 text-xs text-danger-text"
                  >
                    {leadError}
                  </p>
                )}

                <div className="mt-3 flex gap-2">
                  <button
                    type="submit"
                    disabled={leadSending || !leadConsent}
                    aria-disabled={leadSending || !leadConsent}
                    className="interactive press flex-1 rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-accent-contrast shadow-soft hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                  >
                    {leadSending ? "שולח…" : "שלחו פרטים"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setOfferLead(false)}
                    className="interactive press rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-background focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                  >
                    לא עכשיו
                  </button>
                </div>
              </form>
            )}
          </div>

          {/* Composer */}
          <form
            onSubmit={onSubmit}
            className="flex items-center gap-2 border-t border-border bg-surface px-3 py-3"
          >
            <label htmlFor={`${titleId}-input`} className="sr-only">
              כתבו הודעה ל-Switchy AI
            </label>
            <input
              id={`${titleId}-input`}
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              maxLength={MAX_MESSAGE_LEN}
              disabled={sending}
              placeholder="כתבו שאלה…"
              className="flex-1 rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-accent focus:ring-2 focus:ring-accent/30 disabled:opacity-60"
            />
            <button
              type="submit"
              disabled={sending || !input.trim()}
              aria-label="שליחה"
              className="interactive press flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-contrast shadow-soft hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              {/* "Send" points UP regardless of text direction (not RTL-semantic):
                  rotate the shared horizontal arrow rather than hardcode a glyph. */}
              <Icon name="arrow" size={18} aria-hidden="true" className="-rotate-90" />
            </button>
          </form>

          {/* Honesty footer — escalation affordance + grounding note. */}
          <p className="border-t border-border bg-surface px-4 py-2 text-center text-[11px] leading-snug text-muted">
            התשובות מבוססות על קטלוג המסלולים שלנו. לשיחה עם נציג:{" "}
            <a
              href={`https://wa.me/${CONTACT_WHATSAPP_INTL}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent-text underline hover:text-accent-hover"
            >
              וואטסאפ
            </a>
          </p>
        </div>
      )}
    </>
  );
}
