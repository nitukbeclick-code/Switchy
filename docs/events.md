# Analytics event taxonomy

This is the **single canonical taxonomy** for the GA4 client-analytics channel
shared by the two web front-ends. Both surfaces send events to the same GA4
property via `gtag('event', …)`:

| Surface | Path | Emitter |
|---------|------|---------|
| Next.js GEO web app | `web/` | `web/lib/tracking.ts` (`trackEvent`, `fireLeadConversion`) |
| Static marketing site | `site/` | `track()` wrapper over `gtag()` in `site/script.js` |

Pages load the **generated** `site/script.min.js` bundle, not `site/script.js`, so
a newly added static event is not live until `node site/build.js` regenerates it.
`track()` is module-private (inside an IIFE, never on `window`), so a per-page
inline script cannot reuse it and must call `gtag()` directly — those events reach
GA4 only, never the Supabase mirror below.

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
| `lead_form_view` | ✓ both | `source` | The form was actually **on screen** — the funnel's denominator (start-per-view, lead-per-view). Fires once per page load / mount from an **`IntersectionObserver` at 50 % visibility**, deliberately *not* on load: on most pages the form sits below the fold, and counting a form nobody scrolled to inflates every downstream rate. Do not "simplify" this to a load-time fire. |
| `lead_form_start` | ✓ both | `source` | First engagement with the lead form (first focus). Static renamed from `form_start`. |
| `lead_form_step` | web | `source`, `step`, `step_name`? | Per-step advance in the multi-step web lead form. No static equivalent (static form is single-step). |
| `lead_form_blocked` | ✓ both | `source`, `reason` (failing field **group**) | Submit was pressed and **client-side validation refused it, so no POST happened** — the pre-submit twin of `lead_form_error`. Without it a consent-box reject is indistinguishable from a silent abandon. Static: `"name"` \| `"phone"` \| `"name_phone"` \| `"consent"` \| `"honeypot"`. Web: the failing subset of a **fixed** order (`name`, `phone`, `city`, `category`, `consent`) joined with `_` (e.g. `"city_consent"`), else `"unknown"`. |
| `lead_form_error` | ✓ both | `source`, `reason` (`"server"` \| `"network"` \| `"rate_limited"` \| `"server_error"`) | Submit failed (distinguishes "failed" from "never submitted"). Static renamed from `lead_submit_error`. |

> **`reason:"honeypot"`.** The hidden `#leadCompany` trap shows the visitor the
> REAL success message and sends nothing — correct for a bot, catastrophic for a
> human. The field is off-screen but focusable, and `company`/organization is
> first-class autofill vocabulary that Chrome fills regardless of
> `autocomplete="off"`. This was the only submit branch with no telemetry at all,
> so a legitimate visitor lost to autofill was invisible by construction.
> Counting it changes nothing a bot can observe. Read it against real traffic: a
> rate that organic bot volume cannot explain means the field needs renaming out
> of the autofill vocabulary — which changes what bots see, so it is an owner
> call, not a silent edit.

> **`lead_form_blocked` vs `lead_form_error` — keep these apart.** *Blocked* =
> never reached `/api/lead`; *error* = reached it and failed. Do **not** fold
> blocked submits into `lead_form_error` with a `reason:"validation"`: that event's
> reason domain is post-submit only, and mixing pre-submit rejects in would
> silently corrupt the existing "submitted but failed" metric. `reason` is a field
> **group**, never a typed value; the two surfaces have different vocabularies only
> because the two forms have different fields.

> **`lead_form_view` threshold.** 50 % is the honest bar for "seen", but a form
> taller than the viewport can never reach it — both surfaces fall back to
> first-pixel in that case, or the event would never fire on a phone. The observer
> disconnects on the first hit, so scroll-away-and-back is not a second view. No
> `IntersectionObserver` ⇒ **no event**: an unverifiable view is worse than a
> missing one. Identical bar on both surfaces, so the shared name means the same
> thing on each.

> **Naming exception (open).** Every other event in this micro-funnel uses the
> `lead_form_*` prefix, and `lead_submit*` is a prefix this doc records as *renamed
> away* (`lead_submit` → `generate_lead`, `lead_submit_error` → `lead_form_error`).
> `lead_form_blocked` revives it. Both surfaces coined it in the same wave and
> agree character-for-character, so nothing is broken; if it is ever corrected the
> target is `lead_form_blocked` and **both surfaces must change together**. Note
> that both new events were coined on the **static** site first and matched on
> `web/` — the reverse of this doc's "web is canonical" rule. Not fired on the
> static honeypot early-return (a bot getting fake success is not a blocked human).
> Still uncovered: `web/components/AiConcierge.tsx` has the same three client-side
> rejections (name / phone / consent) and fires nothing on any of them.

### CTAs & outbound

| Event | Surfaces | Params | Notes |
|-------|----------|--------|-------|
| `cta_click` | ✓ both | `location`, `label`, `source`? | Primary/secondary CTA press. Static sticky-bar CTA fires `{ location:"sticky", label:"lead" }` (renamed from `sticky_cta_click`) to match the web `StickyLeadCta`. Web also fires it from `TrackedCtaLink`. |
| `outbound_click` | ✓ both | web: `provider`, `dest` · static: `dest:"whatsapp"`, `source` | Click on an outbound link (provider site / WhatsApp). Static WhatsApp-link click renamed from `whatsapp_click`; `dest:"whatsapp"` names the destination the way the web event does. |

### Meeting booking (Zoom consultation)

The `/book` Zoom-consultation funnel. `meeting_*` is this funnel's established noun
(`meeting_booked` predates the rest), so `book_*` was deliberately not coined. The
four pre-success steps mirror the lead funnel one-for-one — `lead_form_view` →
`meeting_form_view`, `lead_form_start` → `meeting_form_start`,
`lead_form_blocked` → `meeting_form_blocked`, `lead_form_error` →
`meeting_form_error`, `generate_lead` → `meeting_booked` — so a future `web/`
implementation aligns for free. `web/components/BookClient.tsx` fires **nothing**
today; when it is instrumented it must reuse these names.

> **Where these fire, and why it matters.** All of them are emitted from the
> booking IIFE in `site/script.js`, at the branches that actually decide — NOT
> from an inline block in `site/book.html`. Two reasons, both learned the hard
> way: `site/book.html` is a **build artifact** (`writePage('book.html',
> bookPage())`, `site/build.js`), so anything hand-added there is deleted by the
> next `rebuild-static` run; and the booking state lives in closure variables
> (`chosenProvider`, `chosenSlot`) that never reach the DOM, so a listener
> inferring "what failed" from `aria-invalid` or the note element reports a
> missing slot on a perfectly filled form. Instrument the branch, not the symptom.

| Event | Surfaces | Params | Notes |
|-------|----------|--------|-------|
| `meeting_form_view` | static | `source` | The booking form reached 50 % visibility. Same `IntersectionObserver` contract as `lead_form_view` (first-pixel fallback for a tall form, disconnect on first hit, no observer ⇒ no event). Deliberately not on load — the form sits below the hero. |
| `meeting_form_start` | static | `source` | First `focusin` anywhere in `#bookForm`, once per page load. The provider chips are `<button>`s, so they focus too and that path is covered. |
| `meeting_form_blocked` | static | `source`, `reason` | `readForm()` refused the submit. `reason` is the coarse control **group** that failed, taken straight from the branch that rejected: `"contact"` (name/phone/email) \| `"provider"` \| `"date"` \| `"slot"` \| `"consent"`. Never a typed value. |
| `meeting_form_error` | static | `source`, `reason` (`"server"`) | A POST-submit failure: the `meeting-book` edge function or the network refused. Fired from the three `setNote(msg, true)` failure paths in `requestCode()`/`verifyCode()`, matching `lead_form_error`'s "submitted but failed" contract — never a client-side rejection. |
| `meeting_booked` | static | `provider` | Zoom consultation booking request submitted — this funnel's **conversion**. Fired by `site/script.js` (not the inline block) and mirrored to the Supabase channel as `meetingRequest`. |

> **Where this code lives.** The four pre-success events are an inline `<script>`
> in `site/book.html` that calls `gtag()` directly, because `script.js`'s `track()`
> is module-private. Consequence: they reach **GA4 only**, never the Supabase
> mirror — correct, since `analytics-track`'s `ALLOWED_EVENTS` carries only
> `meetingRequest` for this funnel. **`site/book.html` is a generated file**
> (`writePage('book.html', bookPage())`, `site/build.js`), so the block must live
> in the `bookPage()` template or the next static rebuild deletes it.

> The success step was already instrumented before this funnel existed; it is
> **not** re-fired by the inline block, which would double-count the conversion.
> What was dark was everything *before* success: view, start, blocked, error.

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

### Language / i18n

| Event | Surfaces | Params | Notes |
|-------|----------|--------|-------|
| `lang_switch` | ✓ both | `lang` (2-letter code, never `"he"`), `resolved_from` (`"static"` \| `"live"`) | The visitor picked a language from the site-language switcher, recorded once the switch has **settled**. `resolved_from` says whether the pre-built `/i18n` dictionary or cache covered it (`"static"`) or at least one batch had to hit the live translate endpoint (`"live"`) — the input for deciding which of the 27 offered languages deserve a shipped bundle (6 exist today: am, ar, en, es, fr, ru). |

> **One file, both surfaces.** Fired from the shared `translate-runtime.js`, which
> ships byte-identical to `site/` and to `web/` (`web/components/LanguageSwitcher.tsx`
> loads `/translate-runtime.js`), so the same-step/same-name rule is satisfied by
> construction. The generated copies — `site/translate-runtime.min.js` and
> `web/public/translate-runtime.js` — must be re-synced or the event fires nowhere.

> **Not fired for:** the load-time replay of a stored preference (that is not a
> choice), a pick of the already-active language, a queued switch that resolves to
> the active language, or a switch superseded before it settled. Returning to
> Hebrew fires nothing — both params describe translation *resolution*, and Hebrew
> is the source, so there is no truthful `resolved_from` for it. A **failed** switch
> does fire, with `resolved_from:"live"` (a failed pick is the strongest
> "this language needs a bundle" signal); the failure toast's retry button is a
> fresh user action and therefore fires again.

> Param is `lang`, not `language`: GA4 already has a built-in `language` dimension
> (browser language) that a custom param of the same name would collide with in
> reports. `lang` also matches the taxonomy's short-name style (`cat`, `dest`,
> `depth`, `plan`).

### Engagement & other (static only)

These have no web counterpart and remain static-only. Names are already unique and
descriptive, so no rename was needed.

| Event | Surfaces | Params | Notes |
|-------|----------|--------|-------|
| `scroll_depth` | static | `depth` (25/50/75/100), `source` | Fires once per threshold per page load. Driven purely by the `scroll` listener with no priming call, so a page shorter than the viewport — or a bfcache restore / anchor deep-link with no subsequent scroll — reports **nothing at all**, not 100. Read the zeros accordingly. |
| `calc_used` | static | `cat` | Savings calculator run. |
| `compare_share` | static | `source:"copy_link"` | Comparison share-link copied. |
| `referral_share_shown` | static | `source` | Referral share block shown after a successful lead. |
| `subscribed` | static | `source` | Newsletter subscribe succeeded (`site-subscribe`). Static-only feature. |
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

---

## Known gaps — grep before you trust this file

This doc is not yet a complete registry. The following events **are fired by the
code today** and have no row above; their params have not been audited, so they
are listed by name only rather than guessed at. Until they are folded in, treat
`grep` over `web/` and `site/script.js` as necessary in addition to this file,
not replaced by it.

| Surface | Undocumented events |
|---------|---------------------|
| static (`site/script.js`) | `zoom_upsell_shown`, `meet_nudge_shown`, `cat_filter`, `price_watch`, `compare_tray_toggle` |
| web | `comparison_view`, `comparison_search`, `compare_plan_add` / `compare_plan_remove`, `compare_shortlist_create` / `_share` / `_lead`, `bill_ask_ai`, `ai_chat_attach_bill`, `post_created`, `post_liked`, `post_shared`, `reply_created`, `reaction_added`, `community_dau` |
