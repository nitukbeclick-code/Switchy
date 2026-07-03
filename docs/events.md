# Analytics event taxonomy

This is the **single canonical taxonomy** for the GA4 client-analytics channel
shared by the two web front-ends. Both surfaces send events to the same GA4
property via `gtag('event', …)`:

| Surface | Path | Emitter |
|---------|------|---------|
| Next.js GEO web app | `web/` | `web/lib/tracking.ts` (`trackEvent`, `fireLeadConversion`) |
| Static marketing site | `site/` | `track()` wrapper over `gtag()` in `site/script.js` |

GA4 Measurement ID: **`G-YCTGRVN7SJ`** (mirrored in `web/lib/tracking.ts`,
`site/build.js`, and `site/index.html`).

> **Naming rule:** GA4 client event names are lower `snake_case`. When both
> surfaces track the **same funnel step**, they MUST use the **same event name** —
> the web app is canonical and the static site follows. This doc is the source of
> truth for that alignment.

> **Truth-only:** event params carry coarse, non-PII labels only (source, step,
> category, destination). Never a name, phone, city, or a fabricated value. Any
> `value`/`saving` param is catalogue-derived or `0`, never invented.

---

## Two distinct channels — do not conflate

There are **two separate analytics pipelines** in this repo. This document covers
only the first.

1. **GA4 client channel (this doc)** — snake_case names, sent from the browser via
   `gtag()` on the `web/` and `site/` surfaces. Landing in Google Analytics 4.

2. **Supabase app-funnel channel (out of scope here)** — camelCase names
   (`appOpen`, `leadSubmit`, `quizComplete`, `whatsappClick`, `meetingRequest`,
   …), sent by the **Flutter app** through the `analytics-track` edge function into
   the `analytics_events` table, and rolled up by `admin-metrics`. Its allowlist
   lives in `supabase/functions/analytics-track/lib.ts` (`ALLOWED_EVENTS`), mirrored
   in `lib/services/analytics_service.dart` and `admin-metrics/metrics.ts`. It is a
   different naming scheme on purpose — do not "align" it to the GA4 names.

---

## Canonical events

Legend: **web** = fired from `web/lib/tracking.ts` call sites; **static** = fired
from `site/script.js`. "✓ both" means the identical event name fires on both
surfaces for the same funnel step.

### Lead conversion (the primary conversion)

| Event | Surfaces | Params | Notes |
|-------|----------|--------|-------|
| `conversion` | web | `send_to`, `event_category:"lead"`, `event_label`(source), `lead_category`, `value`, `currency:"ILS"` | GA4 generic conversion tag. Fired by `fireLeadConversion()` on **confirmed lead success only**. |
| `generate_lead` | ✓ both | `currency:"ILS"`, `lead_source`(source), `lead_category`?, `value`? | GA4 standard lead event. Web fires it inside `fireLeadConversion()`; static fires it on confirmed lead-form success. The static form has no value/category, so those params are omitted (never fabricated). |
| `Lead` (Meta Pixel) | web | `content_category`, `value`, `currency:"ILS"` | Meta Pixel standard event, only when `NEXT_PUBLIC_FB_PIXEL_ID` is set. Not a GA4 event. |

> The **web AI concierge** and **web lead form** both call `fireLeadConversion()`
> on success (→ `conversion` + `generate_lead`). The **static lead form** now fires
> the canonical `generate_lead` on success (renamed from the old `lead_submit`).

### Lead-form micro-funnel

| Event | Surfaces | Params | Notes |
|-------|----------|--------|-------|
| `lead_form_start` | ✓ both | `source` | First engagement with the lead form (first focus). Static renamed from `form_start`. |
| `lead_form_step` | web | `source`, `step`, `step_name`? | Per-step advance in the multi-step web lead form. No static equivalent (static form is single-step). |
| `lead_form_error` | ✓ both | `source`, `reason` (`"server"` \| `"network"` \| `"rate_limited"` \| `"server_error"`) | Submit failed (distinguishes "failed" from "never submitted"). Static renamed from `lead_submit_error`. |

### CTAs & outbound

| Event | Surfaces | Params | Notes |
|-------|----------|--------|-------|
| `cta_click` | ✓ both | `location`, `label`, `source`? | Primary/secondary CTA press. Static sticky-bar CTA fires `{ location:"sticky", label:"lead" }` (renamed from `sticky_cta_click`) to match the web `StickyLeadCta`. Web also fires it from `TrackedCtaLink`. |
| `outbound_click` | ✓ both | web: `provider`, `dest` · static: `dest:"whatsapp"`, `source` | Click on an outbound link (provider site / WhatsApp). Static WhatsApp-link click renamed from `whatsapp_click`; `dest:"whatsapp"` names the destination the way the web event does. |

### AI concierge / chat

| Event | Surfaces | Params | Notes |
|-------|----------|--------|-------|
| `ai_chat_open` | web | `source:"concierge"` | Concierge panel opened. No static equivalent (static chat has no explicit open event). |
| `ai_chat_message` | ✓ both | `source` | A user message was sent to the AI chat. Already identical on both surfaces. |
| `ai_chat_offer_lead` | web | `source:"concierge"` | Server flagged switch/contact intent and the lead offer was shown. |
| `ai_lead_submit` | static | `source` | Consent-gated inline lead captured from the static AI chat. Static-only flow; the web concierge instead calls `fireLeadConversion()`. |

### Quiz / advisor

| Event | Surfaces | Params | Notes |
|-------|----------|--------|-------|
| `quiz_start` | web | — | Quiz wizard first answered. |
| `quiz_step` | web | `step`, `step_name` | Quiz advanced a step. |
| `quiz_submit` | web | `category`, `priority`? | Quiz answers submitted to `/api/recommend`. |
| `quiz_results` | web | `category`, … | Recommendations rendered. |
| `quiz_empty` | web | `category` | Submitted but no matching plans. |
| `quiz_error` | web | `reason` (`"server"` \| `"malformed"` \| `"network"`) | Quiz recommendation call failed. |
| `advisor_used` | static | `category` | The static multi-step Plan Advisor returned recommendations. Static-only tool (analogous to the web quiz but a distinct feature/name). |

### Bill analyzer

| Event | Surfaces | Params | Notes |
|-------|----------|--------|-------|
| `bill_upload_start` | web | `source:"bills"` | Bill image upload started. |
| `bill_upload_result` | web | `source`, `category`?, `suggestions`(count), `annual_saving`(0 if none) | Bill analyzed with a readable result. |
| `bill_upload_unreadable` | web | `source:"bills"` | Bill uploaded but not machine-readable. |
| `bill_analyzed` | static | `source` | The static bill analyzer returned a result. Static-only tool (analogous to `bill_upload_result` but a distinct feature/name; left un-renamed because the funnel shape differs — no start/unreadable split). |

### Push / PWA (web only)

| Event | Surfaces | Params | Notes |
|-------|----------|--------|-------|
| `push_optin_click` | web | `source:"installer"` | User tapped the push opt-in. |
| `push_subscribed` | web | `source:"installer"` | Push subscription succeeded. |
| `push_optin_failed` | web | `source:"installer"` | Push subscription failed/blocked. |
| `push_optin_dismiss` | web | `source:"installer"`, … | Opt-in prompt dismissed. |

### Engagement & other (static only)

These have no web counterpart and remain static-only. Names are already unique and
descriptive, so no rename was needed.

| Event | Surfaces | Params | Notes |
|-------|----------|--------|-------|
| `scroll_depth` | static | `depth` (25/50/75/100), `source` | Fires once per threshold per page load. |
| `calc_used` | static | `cat` | Savings calculator run. |
| `compare_share` | static | `source:"copy_link"` | Comparison share-link copied. |
| `referral_share_shown` | static | `source` | Referral share block shown after a successful lead. |
| `subscribed` | static | `source` | Newsletter subscribe succeeded (`site-subscribe`). Static-only feature. |
| `meeting_booked` | static | `provider` | Zoom consultation booking request submitted. |
| `plan_info_open` | static | `plan`(id) | Plan-detail modal opened. |

---

## Renames applied (static → web canonical)

The following static-site event names were aligned to the web canonical names.
Only names were changed; **no events were removed**, and every renamed call keeps
its existing params (with web-matching params added where the canonical event
carries them).

| Funnel step | Old static name | Canonical name | `site/script.js` |
|-------------|-----------------|----------------|------------------|
| Lead form first engagement | `form_start` | `lead_form_start` | ✓ |
| Lead submit failed | `lead_submit_error` | `lead_form_error` | ✓ |
| Lead submit success | `lead_submit` | `generate_lead` | ✓ |
| Outbound (WhatsApp) click | `whatsapp_click` | `outbound_click` | ✓ |
| Sticky CTA click | `sticky_cta_click` | `cta_click` (`location:"sticky"`) | ✓ |

`ai_chat_message` already matched on both surfaces and needed no change.

Static-only tools (`advisor_used`, `bill_analyzed`, `ai_lead_submit`) and
static-only engagement events were **not** renamed: they are distinct features
with no same-step web equivalent, and forcing them onto a web name would blur two
different funnels.
