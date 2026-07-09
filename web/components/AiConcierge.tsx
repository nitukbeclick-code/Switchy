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
import { compressImageToDataUrl } from "@/lib/image";

type Role = "user" | "bot";
interface Turn {
  role: Role;
  text: string;
}

/** Persisted across reloads so the backend can restore server-side memory too. */
const SESSION_KEY = "chosech-ai-session";
const MAX_MESSAGE_LEN = 500;
const MAX_HISTORY_SENT = 6;
// In-chat bill photo: opener used when the user attaches a photo without typing,
// and the client-side ceiling (~6MB data-URL) mirrored from the backend guard.
const BILL_PHOTO_OPENER = "צירפתי תמונה של החשבון שלי — אפשר לחסוך?";
const MAX_IMAGE_DATAURL_LEN = 6 * 1024 * 1024;

const GREETING =
  "היי! אני Switchy AI 🤖 אפשר לשאול אותי על מסלולי סלולר, אינטרנט, טלוויזיה, " +
  "חבילות משולבות וחבילות לחו״ל — ואפשר גם לצרף תמונה של החשבון 📎 ואבדוק אם יש איפה לחסוך. " +
  "במה אפשר לעזור?";

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

/**
 * An already-analyzed bill the chat can reference (seeded from the bill-analyzer
 * result screen via the `switchy:concierge-open` event), so a user can ask
 * follow-ups about their OWN bill. Sent with every message once set; the backend
 * re-validates + clamps it (parseBillHint) — this is just client-side hygiene.
 */
export interface ConciergeBillHint {
  provider?: string;
  monthly: number;
  category?: string;
}

/** Detail carried by the `switchy:concierge-open` event (bill hand-off → chat). */
interface ConciergeOpenDetail {
  billHint?: unknown;
  /** Optional opener the widget auto-sends once opened (e.g. a bill question). */
  prompt?: string;
}

/** Total + truth-only: junk / non-positive monthly → null (no bill sent). Mirrors the backend clamp. */
function normalizeBillHint(raw: unknown): ConciergeBillHint | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const monthly = Math.round(Math.min(5000, Math.max(0, Number(o.monthly))));
  if (!Number.isFinite(monthly) || monthly <= 0) return null;
  const provider =
    typeof o.provider === "string" ? o.provider.trim().slice(0, 40) || undefined : undefined;
  const category =
    typeof o.category === "string" ? o.category.trim().slice(0, 20) || undefined : undefined;
  return { provider, monthly, category };
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
  // In-chat bill photo pending the next send (a compressed JPEG data-URL). One-shot:
  // sent with the next message, then cleared. `attaching` covers the compress step.
  const [pendingImage, setPendingImage] = useState<string | null>(null);
  const [attaching, setAttaching] = useState(false);

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
  // The bill seeded from the analyzer screen, persisted so EVERY follow-up keeps
  // sending it (a ref, not state — it never needs to trigger a re-render, and
  // send() reads the latest value). Cleared only by a fresh page load.
  const billHintRef = useRef<ConciergeBillHint | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const transcriptRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const launcherRef = useRef<HTMLButtonElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

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
      // A one-shot bill photo may ride with this turn; if so, an empty text is
      // fine (we use a default opener) so the user can just attach + send.
      const image = pendingImage;
      const message = text.trim() || (image ? BILL_PHOTO_OPENER : "");
      if (!message || sending) return;
      setError(null);
      setInput("");
      setSending(true);
      if (image) setPendingImage(null); // one-shot — consumed by this send

      // Optimistically append the user's turn.
      const history = turns.slice(-MAX_HISTORY_SENT).map((t) => ({
        role: t.role,
        text: t.text,
      }));
      setTurns((prev) => [
        ...prev,
        { role: "user", text: image ? `📎 ${message}` : message },
      ]);
      trackEvent("ai_chat_message", { source: "concierge", ...(image ? { withImage: true } : {}) });

      try {
        const res = await fetch("/api/ai-chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: message.slice(0, MAX_MESSAGE_LEN),
            history,
            sessionId: sessionIdRef.current,
            // Present only after the user seeds a bill from the analyzer screen;
            // kept on every follow-up so the agent stays grounded in that bill.
            ...(billHintRef.current ? { billHint: billHintRef.current } : {}),
            // One-shot in-chat bill photo — the backend runs Gemini Vision (cost-
            // capped) to derive a billHint from it. Never stored.
            ...(image ? { imageBase64: image } : {}),
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
    [sending, turns, pendingImage],
  );

  // Attach a bill photo — compress in-browser (canvas) so a 12MP original never
  // uploads, then stage it for the next send. Fail-soft: an unreadable file just
  // clears the attach state. The picker `accept`s images; `capture` hints mobile
  // to offer the camera.
  const onPickImage = useCallback(async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setAttaching(true);
    try {
      const dataUrl = await compressImageToDataUrl(file);
      if (!dataUrl || dataUrl.length > MAX_IMAGE_DATAURL_LEN) {
        setError("התמונה גדולה מדי. צלמו תמונה קטנה יותר ונסו שוב.");
        setPendingImage(null);
        return;
      }
      setPendingImage(dataUrl);
      trackEvent("ai_chat_attach_bill", { source: "concierge" });
    } catch {
      setError("לא הצלחנו לעבד את התמונה. נסו תמונה אחרת.");
      setPendingImage(null);
    } finally {
      setAttaching(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }, []);

  // Open pre-seeded from the bill-analyzer ("שאל את Switchy AI על החשבון"): stash
  // the billHint (persisted for ALL follow-ups) and grow the panel from the
  // launcher, mirroring toggle()'s open branch. If an opener prompt rides along
  // we auto-send it so the agent immediately answers about THAT bill.
  useEffect(() => {
    function onOpenWith(e: Event) {
      const detail = (e as CustomEvent<ConciergeOpenDetail>).detail ?? {};
      const hint = normalizeBillHint(detail.billHint);
      if (hint) billHintRef.current = hint;
      setClosing(false);
      if (exitTimer.current) {
        clearTimeout(exitTimer.current);
        exitTimer.current = null;
      }
      setOpen(true);
      // One header popover at a time — ask siblings (a11y / notifications) to close.
      window.dispatchEvent(
        new CustomEvent("switchy:popover-open", { detail: "concierge" }),
      );
      trackEvent("ai_chat_open", { source: hint ? "bill" : "concierge" });
      const opener = typeof detail.prompt === "string" ? detail.prompt.trim() : "";
      if (opener) void send(opener);
    }
    window.addEventListener("switchy:concierge-open", onOpenWith as EventListener);
    return () =>
      window.removeEventListener(
        "switchy:concierge-open",
        onOpenWith as EventListener,
      );
  }, [send]);

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
          // grouped with the theme toggle + a11y + Zoom triggers so it no longer
          // overlaps page content). A compact 40px round brand-green launcher.
          "flex h-10 w-10 shrink-0 items-center justify-center rounded-full",
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
                <p className="text-[12px] leading-tight text-muted">
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
                    className="mt-0.5 h-5 w-5 shrink-0 rounded border-border text-accent accent-accent focus:ring-2 focus:ring-accent/30"
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

          {/* Pending bill-photo chip — shown after a photo is attached, before send.
              Includes the privacy line (read automatically, not stored) so the
              disclosure appears at the moment of attaching. */}
          {pendingImage && (
            <div className="border-t border-border bg-background/60 px-3 py-2">
              <div className="flex items-center justify-between gap-2 text-xs text-foreground">
                <span className="flex items-center gap-1.5 truncate">
                  <span aria-hidden="true">📎</span>
                  תמונת חשבון צורפה — תישלח עם ההודעה הבאה
                </span>
                <button
                  type="button"
                  onClick={() => setPendingImage(null)}
                  className="interactive press shrink-0 rounded-md px-2 py-1 font-medium text-muted hover:bg-background hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                  הסר
                </button>
              </div>
              <p className="mt-1 text-[11px] leading-snug text-muted">
                התמונה נשלחת לקריאה אוטומטית (Google) ואינה נשמרת.
              </p>
            </div>
          )}

          {/* Composer */}
          <form
            onSubmit={onSubmit}
            className="flex items-center gap-2 border-t border-border bg-surface px-3 py-3"
          >
            {/* Bill-photo picker (hidden) + its trigger. `capture` hints mobile to
                offer the camera; the image is compressed client-side before send. */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="sr-only"
              onChange={(e) => void onPickImage(e.target.files?.[0])}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={sending || attaching}
              aria-label="צירוף תמונת חשבון"
              title="צירוף תמונת חשבון"
              className="interactive press flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-border text-muted hover:bg-background hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              <span aria-hidden="true" className="text-lg leading-none">
                {attaching ? "…" : "📎"}
              </span>
            </button>

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
              placeholder={pendingImage ? "הוסיפו שאלה (לא חובה)…" : "כתבו שאלה…"}
              className="flex-1 rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-accent focus:ring-2 focus:ring-accent/30 disabled:opacity-60"
            />
            <button
              type="submit"
              disabled={sending || (!input.trim() && !pendingImage)}
              aria-label="שליחה"
              className="interactive press flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-contrast shadow-soft hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              {/* "Send" points UP regardless of text direction (not RTL-semantic):
                  rotate the shared horizontal arrow rather than hardcode a glyph. */}
              <Icon name="arrow" size={18} aria-hidden="true" className="-rotate-90" />
            </button>
          </form>

          {/* Honesty footer — escalation affordance + grounding note. */}
          <p className="border-t border-border bg-surface px-4 py-2 text-center text-[12px] leading-snug text-muted">
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
