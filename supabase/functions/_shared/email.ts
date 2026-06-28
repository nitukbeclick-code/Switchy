// Resend email plumbing + the branded customer-email template system.
//
// TWO concerns live here, kept apart on purpose:
//   1. resendSend / sendEmail / sendCustomerEmail — the network plumbing. The
//      two EXPORTED send signatures are STABLE: notify-lead (team alert),
//      notify-lead/console + meeting_callbacks (customer meeting confirmation)
//      all import them. Do not rename or re-shape these.
//   2. renderEmail + the per-purpose builders (welcomeEmail, renewalRadarEmail,
//      leadConfirmEmail) — the premium-2026, email-CLIENT-SAFE HTML system:
//      inline styles + table layout (NOT flex/grid), RTL Hebrew, dark-mode
//      friendly, with a logo wordmark header, a green CTA, and a compliant
//      footer (sender identity + a real unsubscribe/הסר link + privacy link,
//      Spam-Law §30A).
//
// Why table layout: Gmail, Outlook and many webmail clients strip <style>
// blocks, flexbox and grid. Nested <table> + inline styles is the only layout
// that renders consistently across Gmail / Apple Mail / Outlook.

import { jlog } from "./log.ts";

// ── HTML escaping (attribute-safe) ───────────────────────────────────────────
// The shared telegram.ts `esc` escapes &<> only — fine for text nodes but NOT
// for attribute values (no quote escaping). Email builders interpolate
// row-derived strings into both, so we keep self-contained escapers here:
//   escHtml — text content (&, <, >)
//   escAttr — attribute values (adds " and ' so a value can't break out of the
//             surrounding href="…"/style="…")

export function escHtml(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function escAttr(s: unknown): string {
  return escHtml(s).replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

// Only http(s) and mailto: URLs may become an href — anything else
// (javascript:, data:, a relative fragment) collapses to "#" so a malformed or
// hostile value can't produce a live link. mailto: is allowed because the
// §30A unsubscribe falls back to a real mailto: to the sender inbox when no
// one-click endpoint exists. Returned value is attribute-escaped.
export function safeUrl(u: unknown): string {
  const s = String(u ?? "").trim();
  return /^(https?:\/\/|mailto:)/i.test(s) ? escAttr(s) : "#";
}

// ── Brand + compliance constants ─────────────────────────────────────────────
// "white glass + black ink" base with a single green ACTION accent (matches the
// Switchy logo + the app's `brandAccent`). Amber is the VALUE accent, used only
// on saving figures. Big surfaces stay ink/white; colour is used sparingly.
const BRAND = {
  name: "Switchy AI",
  wordmark: "Switchy AI",
  tagline: "להשוות. לחסוך. בלי כאב ראש.",
  ink: "#111827", // text / structure / dark hero
  text: "#0B0F14", // body text
  muted: "#6B7280", // secondary text / footer
  border: "#E5E7EB", // hairlines
  bg: "#F5F7F8", // glass-white page background
  card: "#FFFFFF", // card surface
  accent: "#16A34A", // green = ACTION (CTA, links)
  accentInk: "#FFFFFF", // text on the green CTA
  value: "#B45309", // amber-ink = VALUE (saving figures); AA on white
} as const;

// Site + legal links. Overridable via env so a staging deploy can point
// elsewhere; the defaults are the production marketing site.
function siteBase(): string {
  return (Deno.env.get("SITE_BASE_URL") || "https://switchy-ai.com").replace(/\/+$/, "");
}
function privacyUrl(): string {
  return Deno.env.get("PRIVACY_URL") || `${siteBase()}/privacy.html`;
}
// The legal mailer identity shown in the footer (Spam-Law §30A: the sender must
// be identifiable). Overridable; the default names the brand + a contact inbox.
function senderIdentity(): string {
  return Deno.env.get("EMAIL_SENDER_IDENTITY") || "Switchy AI · hello@switchy-ai.com";
}

// The address an unsubscribe request goes to. Defaults to the contact inbox.
function unsubscribeMailbox(): string {
  return Deno.env.get("EMAIL_UNSUBSCRIBE_TO") || "unsubscribe@switchy-ai.com";
}

// A genuinely-working unsubscribe target (Spam-Law §30A requires a real way to
// opt out). Preference order:
//   1. UNSUBSCRIBE_URL env — a hosted one-click endpoint, if one exists.
//   2. a mailto: to the unsubscribe inbox with the recipient's address
//      pre-filled in the subject — always works, no endpoint to maintain.
// `email` is the subscriber's address (used only to pre-fill the mailto so the
// team can identify and remove the right row).
export function unsubscribeUrlFor(email?: string): string {
  const hosted = (Deno.env.get("UNSUBSCRIBE_URL") || "").trim();
  if (hosted) {
    return email
      ? `${hosted}${hosted.includes("?") ? "&" : "?"}email=${encodeURIComponent(email)}`
      : hosted;
  }
  const subject = encodeURIComponent(email ? `הסרה מרשימת התפוצה: ${email}` : "הסרה מרשימת התפוצה");
  return `mailto:${unsubscribeMailbox()}?subject=${subject}`;
}

// RFC 2369 List-Unsubscribe header value. A mailto: form is always included; an
// https one-click endpoint (if configured) is added first so clients that
// support List-Unsubscribe-Post can use it.
export function listUnsubscribeHeader(email?: string): string {
  const parts: string[] = [];
  const hosted = (Deno.env.get("UNSUBSCRIBE_URL") || "").trim();
  if (/^https?:\/\//i.test(hosted)) {
    parts.push(`<${email ? `${hosted}${hosted.includes("?") ? "&" : "?"}email=${encodeURIComponent(email)}` : hosted}>`);
  }
  const subject = encodeURIComponent(email ? `הסרה מרשימת התפוצה: ${email}` : "הסרה מרשימת התפוצה");
  parts.push(`<mailto:${unsubscribeMailbox()}?subject=${subject}>`);
  return parts.join(", ");
}

// ── the master shell ─────────────────────────────────────────────────────────

export type EmailButton = { label: string; url: string };

export type EmailOptions = {
  // Pre-header: the grey snippet Gmail/Apple Mail show next to the subject in
  // the inbox list. Kept off-screen in the body. Plain text.
  preheader: string;
  // Big ink headline at the top of the card.
  heading: string;
  // Body: an array of already-escaped HTML fragments (callers build these with
  // escHtml/escAttr). Each becomes its own spaced block.
  bodyHtml: string[];
  // Optional green CTA button under the body.
  cta?: EmailButton;
  // Optional unsubscribe URL. When present the footer renders a real
  // "הסר מרשימת התפוצה" link (Spam-Law §30A). Omit for transactional mail
  // (meeting/lead confirmations) that isn't marketing.
  unsubscribeUrl?: string;
  // Footer note explaining why the recipient got this email (consent context).
  footerReason?: string;
};

// Render one email. Outer table paints the page background (Outlook ignores
// body bg); inner 600px table is the card. Everything is inline-styled.
export function renderEmail(opts: EmailOptions): string {
  const blocks = opts.bodyHtml
    .map(
      (h) =>
        `<p style="margin:0 0 16px;font-size:16px;line-height:1.7;color:${BRAND.text};">${h}</p>`,
    )
    .join("");

  const cta = opts.cta
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 4px;">
         <tr><td align="center" bgcolor="${BRAND.accent}" style="border-radius:12px;">
           <a href="${safeUrl(opts.cta.url)}" target="_blank"
              style="display:inline-block;padding:14px 32px;font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:bold;color:${BRAND.accentInk};text-decoration:none;border-radius:12px;background:${BRAND.accent};">
             ${escHtml(opts.cta.label)}
           </a>
         </td></tr>
       </table>`
    : "";

  const unsub = opts.unsubscribeUrl
    ? ` · <a href="${safeUrl(opts.unsubscribeUrl)}" target="_blank" style="color:${BRAND.muted};text-decoration:underline;">הסרה מרשימת התפוצה</a>`
    : "";

  const reason = opts.footerReason
    ? `<p style="margin:0 0 10px;font-size:12px;line-height:1.6;color:${BRAND.muted};">${escHtml(opts.footerReason)}</p>`
    : "";

  // Pre-header trick: visible to clients building the inbox snippet, hidden in
  // the rendered body via zero size + display:none, then padded with NBSP/ZWNJ
  // so the client doesn't pull following body text into the snippet.
  const preheader =
    `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:${BRAND.bg};opacity:0;">` +
    escHtml(opts.preheader) +
    "&#8204;&nbsp;".repeat(60) +
    "</div>";

  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "https://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html dir="rtl" lang="he" xmlns="https://www.w3.org/1999/xhtml">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="color-scheme" content="light dark" />
  <meta name="supported-color-schemes" content="light dark" />
  <title>${escHtml(BRAND.name)}</title>
</head>
<body style="margin:0;padding:0;background:${BRAND.bg};">
  ${preheader}
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${BRAND.bg};">
    <tr>
      <td align="center" style="padding:24px 12px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;">
          <!-- header / wordmark -->
          <tr>
            <td align="center" style="padding:8px 0 20px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="background:${BRAND.ink};border-radius:14px;padding:14px 22px;font-family:Arial,Helvetica,sans-serif;font-size:20px;font-weight:bold;color:#FFFFFF;letter-spacing:0.5px;">
                    ${escHtml(BRAND.wordmark)}
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- card -->
          <tr>
            <td style="background:${BRAND.card};border:1px solid ${BRAND.border};border-radius:18px;padding:32px;direction:rtl;text-align:right;">
              <h1 style="margin:0 0 18px;font-family:Arial,Helvetica,sans-serif;font-size:24px;line-height:1.35;color:${BRAND.ink};">
                ${escHtml(opts.heading)}
              </h1>
              ${blocks}
              ${cta}
            </td>
          </tr>
          <!-- footer -->
          <tr>
            <td style="padding:22px 8px;direction:rtl;text-align:center;">
              ${reason}
              <p style="margin:0 0 8px;font-size:12px;line-height:1.6;color:${BRAND.muted};">
                ${escHtml(BRAND.tagline)}
              </p>
              <p style="margin:0;font-size:12px;line-height:1.6;color:${BRAND.muted};">
                ${escHtml(senderIdentity())}
              </p>
              <p style="margin:8px 0 0;font-size:12px;line-height:1.6;color:${BRAND.muted};">
                <a href="${safeUrl(privacyUrl())}" target="_blank" style="color:${BRAND.muted};text-decoration:underline;">מדיניות פרטיות</a>${unsub}
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// ── per-purpose builders (real content only — never fabricate offers) ────────

// Newsletter welcome (site-subscribe). Marketing → carries an unsubscribe link.
export function welcomeEmail(opts: { unsubscribeUrl?: string } = {}): string {
  return renderEmail({
    preheader: "תודה שנרשמתם — מעכשיו תדעו ראשונים על מסלולים משתלמים.",
    heading: "ברוכים הבאים ל-Switchy AI",
    bodyHtml: [
      "תודה שנרשמתם לרשימת התפוצה שלנו.",
      "מעכשיו תקבלו עדכונים על מסלולים משתלמים בסלולר, אינטרנט, טלוויזיה וחבילות לחו״ל — וטיפים קצרים שיעזרו לכם לשלם פחות על אותו שירות.",
      "בלי ספאם, ואפשר להסיר את עצמכם בכל רגע בלחיצה אחת.",
    ],
    cta: { label: "להשוואת מסלולים", url: siteBase() },
    unsubscribeUrl: opts.unsubscribeUrl,
    footerReason: "קיבלתם את המייל הזה כי נרשמתם לרשימת התפוצה באתר Switchy AI ואישרתם קבלת דיוור.",
  });
}

// Renewal-radar reminder. Honest framing: we tell the customer their tracked
// plan is about to renew and invite a fresh comparison — we do NOT quote a
// specific replacement offer/saving here (those are computed live on the site).
// Numeric fields are rendered only when present; missing data is omitted.
export type RenewalEmailData = {
  name?: string | null;
  provider?: string | null; // current provider
  planName?: string | null; // current plan
  monthlyPrice?: number | null; // current ₪/month
  category?: string | null; // Hebrew category label
  renewDate?: string | null; // promo end / renewal date (display string)
  daysLeft?: number | null;
  compareUrl: string; // where to re-compare (real site URL)
  unsubscribeUrl?: string;
};

export function renewalRadarEmail(d: RenewalEmailData): string {
  const hello = d.name ? `שלום ${escHtml(d.name)},` : "שלום,";

  // Build the "current plan" fact line from only the fields we actually have.
  const facts: string[] = [];
  if (d.provider) facts.push(`<b>${escHtml(d.provider)}</b>`);
  if (d.planName) facts.push(escHtml(d.planName));
  if (typeof d.monthlyPrice === "number" && Number.isFinite(d.monthlyPrice)) {
    facts.push(`<span style="color:${BRAND.value};font-weight:bold;">₪${escHtml(d.monthlyPrice)}/חודש</span>`);
  }
  if (d.category) facts.push(escHtml(d.category));
  const factLine = facts.length ? `המסלול שאתם עוקבים אחריו: ${facts.join(" · ")}.` : "";

  const whenLine = d.renewDate
    ? (typeof d.daysLeft === "number"
      ? `מועד החידוש מתקרב: <b>${escHtml(d.renewDate)}</b> (בעוד ${escHtml(d.daysLeft)} ימים).`
      : `מועד החידוש מתקרב: <b>${escHtml(d.renewDate)}</b>.`)
    : "מועד החידוש של אחד המסלולים שלכם מתקרב.";

  const body = [
    hello,
    whenLine,
    factLine,
    "לרוב, בדיוק בנקודת החידוש מסתיים מחיר המבצע — וכדאי לבדוק מה מציעים עכשיו לפני שהמחיר עולה אוטומטית.",
    "לחצו כדי לראות השוואה מעודכנת למסלולים בקטגוריה הזו ולבדוק אם יש לכם הזדמנות לחסוך.",
  ].filter(Boolean);

  return renderEmail({
    preheader: "מועד החידוש מתקרב — שווה לבדוק אם אפשר לחסוך לפני שהמחיר עולה.",
    heading: "תזכורת חידוש — שווה לבדוק שוב",
    bodyHtml: body,
    cta: { label: "להשוואה מעודכנת", url: d.compareUrl },
    unsubscribeUrl: d.unsubscribeUrl,
    footerReason: "קיבלתם תזכורת זו כי ביקשתם מעקב חידושים (ראדר החידושים) ב-Switchy AI.",
  });
}

// Lead / contact confirmation. Transactional (the customer just submitted a
// request), so by default NO unsubscribe link — but the rep-side follow-up is
// consent-based, which the footer reason makes explicit.
export type LeadConfirmData = {
  name?: string | null;
  provider?: string | null; // provider they enquired about, if any
  category?: string | null; // Hebrew category label, if any
  siteUrl?: string; // optional CTA back to the site
};

export function leadConfirmEmail(d: LeadConfirmData = {}): string {
  const hello = d.name ? `שלום ${escHtml(d.name)},` : "שלום,";
  const about = d.provider
    ? `קיבלנו את פנייתכם בנושא <b>${escHtml(d.provider)}</b>${d.category ? ` (${escHtml(d.category)})` : ""}.`
    : (d.category
      ? `קיבלנו את פנייתכם בנושא <b>${escHtml(d.category)}</b>.`
      : "קיבלנו את פנייתכם.");

  return renderEmail({
    preheader: "קיבלנו את פנייתכם — נציג Switchy AI יחזור אליכם בהקדם.",
    heading: "קיבלנו את פנייתכם",
    bodyHtml: [
      hello,
      about,
      "נציג מצוות Switchy AI יחזור אליכם בהקדם כדי לעזור לבחור את המסלול שמתאים לכם ביותר.",
      "אם בינתיים תרצו להמשיך לבד — אפשר להשוות מסלולים בכל רגע באתר.",
    ],
    cta: d.siteUrl ? { label: "להשוואת מסלולים", url: d.siteUrl } : undefined,
    footerReason: "קיבלתם את המייל הזה כי השארתם פנייה באתר Switchy AI ואישרתם שניצור עמכם קשר.",
  });
}

// ── Resend plumbing (signatures STABLE — importers depend on them) ───────────

async function resendSend(
  cfg: { resend: string; resendFrom: string },
  to: string,
  subject: string,
  html: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!cfg.resend || !cfg.resendFrom || !to) return { ok: false, error: "resend not configured" };
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": `Bearer ${cfg.resend}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: cfg.resendFrom, to: [to], subject, html }),
    });
    const j = await r.json().catch(() => ({} as Record<string, unknown>)) as Record<string, unknown>;
    if (!r.ok) jlog({ at: "sendEmail", ok: false, status: r.status, error: j?.message ?? j?.name });
    return { ok: r.ok, error: (j?.message ?? j?.name) as string | undefined };
  } catch (e) {
    jlog({ at: "sendEmail", ok: false, error: String(e) });
    return { ok: false, error: String(e) };
  }
}

// Team notification — goes to the configured leads_notify_email.
export async function sendEmail(
  cfg: { resend: string; resendFrom: string; notifyEmail: string },
  subject: string,
  html: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!cfg.notifyEmail) return { ok: false, error: "resend not configured" };
  return await resendSend(cfg, cfg.notifyEmail, subject, html);
}

// Rebuild a `from` value with an explicit display NAME while keeping the address
// from resend_from. The secret historically carried the legacy "חוסך" brand,
// which reads as marketing to Gmail and pushes a one-time-code email toward the
// Promotions tab; a clear product name ("Switchy AI") lands transactional mail in
// Primary far more reliably. Handles both "Name <addr>" and a bare "addr".
function withDisplayName(resendFrom: string, name: string): string {
  const m = resendFrom.match(/<([^>]+)>/);
  const addr = (m ? m[1] : resendFrom).trim();
  return `${name} <${addr}>`;
}

// Customer-facing email (meeting confirmations, OTP codes) — same plumbing,
// explicit recipient. Caller owns the address validity (it came from the booking
// form). Pass opts.fromName to override the sender display name for transactional
// mail that must land in Primary (e.g. the OTP code).
export async function sendCustomerEmail(
  cfg: { resend: string; resendFrom: string },
  to: string,
  subject: string,
  html: string,
  opts?: { fromName?: string },
): Promise<{ ok: boolean; error?: string }> {
  const eff = opts?.fromName
    ? { ...cfg, resendFrom: withDisplayName(cfg.resendFrom, opts.fromName) }
    : cfg;
  return await resendSend(eff, to, subject, html);
}
