# מרשם מעבדי משנה / Processor Register

> **DRAFT — for lawyer review.** A register of every third party that processes
> personal data on behalf of Switch AI (חוסך). Grounded in the real integrations
> (`docs/EDGE_FUNCTIONS.md`, `supabase/README.md`, `web/lib/tracking.ts`,
> `supabase/functions/_shared/ai.ts`). **DPA status is unverified** — every
> "DPA" cell is an `[[OWNER: confirm/sign]]` action. This document does not
> assert that any agreement is in place.

Under Amendment 13, a database holder is responsible for personal data handled by
its processors and must have a written **Data Processing Agreement (DPA)** with
each, ensure equivalent security, and account for **cross-border transfer** (most
of these store/process outside Israel).

---

## Processors

| מעבד / Processor | תפקיד / Role | נתונים אישיים שמשותפים / Personal data shared | מיקום / Location | DPA | מעבדי משנה / Sub-processors |
|------------------|--------------|----------------------------------------------|------------------|-----|------------------------------|
| **Supabase** (Supabase Inc.) | Managed Postgres DB + Auth + Edge Functions + Vault — the primary data store and server runtime | **All** stored personal data (leads, profiles, whatsapp_*, audit log, etc.) | `eu-central-1` Frankfurt, EU | `[[OWNER: confirm/sign Supabase DPA]]` | AWS (underlying infra) |
| **Vercel** (Vercel Inc.) | Hosting/CDN for the Next.js site + API routes (incl. `/api/lead`); holds the server-only `SUPABASE_SERVICE_ROLE_KEY` in env | Lead form payloads in transit (name/phone/city/consent); request metadata/IP at the edge | US/global edge | `[[OWNER: confirm/sign Vercel DPA]]` | AWS; CDN PoPs |
| **Google — Gemini API** (Google LLC) | AI grounding for site chat / plan-advisor / **bill-analyzer** (Gemini + Gemini Vision); primary model `gemini-2.5-flash` | Free-text the user types to the AI; **bill photo processed transiently — never stored** | Google cloud (global) | `[[OWNER: confirm Google API terms / DPA + data-use settings]]` | Google infrastructure |
| **Google — Analytics 4** (Google LLC) | Aggregate site analytics, measurement id `G-YCTGRVN7SJ`; lead conversion events; **consent-gated** | Usage/device data, cookies, conversion events (aggregate; no direct PII sent) | Google cloud (global) | `[[OWNER: confirm GA DPA + IP/data settings + Consent Mode]]` | Google infrastructure |
| **Meta — WhatsApp Cloud API** (Meta Platforms) | Inbound/outbound WhatsApp messaging for the CRM bot; webhook authenticated by Meta App Secret HMAC | Customer phone (E.164), WhatsApp profile name, message text | Meta cloud (global) | `[[OWNER: confirm/sign Meta WhatsApp Business terms / DPA]]` | Meta infrastructure |
| **Resend** | Transactional/notification email (lead notifications to the team, newsletter welcome, etc.) | Recipient email + lead summary content in the message body | US/global | `[[OWNER: confirm/sign Resend DPA]]` | AWS / email infra |
| **Telegram** (Telegram FZ-LLC) | **Internal team** notifications — the "digital rep" lead/meeting cards and the rep console Mini App (not customer-facing) | Lead/meeting details surfaced to the team chat (name, phone, city, category) | Telegram cloud (global) | `[[OWNER: review Telegram terms — internal ops tool]]` | Telegram infrastructure |
| **Cloudflare** | CDN / edge (where fronting traffic); `cf-connecting-ip` is the trusted client-IP source for rate-limiting | Request IP + metadata in transit | Global edge | `[[OWNER: confirm whether Cloudflare fronts prod; sign DPA if so]]` | — |
| **Zoom** *(conditional)* | Video-consultation links for booked meetings (S2S OAuth), when the meetings feature is used | Meeting scheduling; participant join links | US/global | `[[OWNER: confirm/sign Zoom DPA if meetings feature is live]]` | — |

### Optional/fallback AI providers (only if their keys are configured)

The AI layer (`supabase/functions/_shared/ai.ts`) can fall back to **Groq**
(`llama-3.3-70b-versatile`), **OpenRouter** (`meta-llama/llama-3.3-70b-instruct:free`),
or **OpenAI**. If any of these keys is set in production, add it to this register
as a processor with its own DPA `[[OWNER: confirm which AI keys are live]]`.

## Cross-border transfer note

Most processors store/process data **outside Israel** (EU/US/global). The owner
must confirm a lawful basis under the Privacy Protection Regulations (Transfer of
Data Abroad), 2001 — typically the destination's adequate protection and a
contractual data-protection clause in each DPA. `[[OWNER: confirm transfer basis
with lawyer]]`.

## Maintenance

- Add a row **before** integrating any new third party that touches personal data
  (gate this in the PIA — see [`PIA_TEMPLATE.md`](./PIA_TEMPLATE.md)).
- Review the whole register at the **annual** security review.
- Keep signed DPAs filed with the owner; record signing date here once signed.

---
_Grounded in: `docs/EDGE_FUNCTIONS.md`, `supabase/README.md`,
`web/lib/tracking.ts` (`GA4_MEASUREMENT_ID = "G-YCTGRVN7SJ"`),
`supabase/functions/_shared/ai.ts`. Draft — DPA status unverified; owner to
confirm/sign each._
