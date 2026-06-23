# AI Agent Architecture

The unified, catalogue-grounded AI agent that powers every conversational and
recommendation surface — WhatsApp, the site chat, the web concierge/quiz, and the
bill analyzer. **One persona, one catalogue grounding, one ranking formula, one
tool loop, one set of compliance guardrails**, so the surfaces can never drift on
what the agent knows or how it behaves.

> **Honesty / E-E-A-T is a hard rule here too.** Every answer is grounded in real
> catalogue rows and real tool results. The agent never invents a provider, plan,
> price, coverage figure, rating, or saving. When a fact is missing it says so and
> points to WhatsApp / a form — it does not fabricate.

## The shared core — `supabase/functions/_shared/`

Four pure, dependency-light, unit-tested modules form the brain. They have no
module-level DB singletons and take their side effects as injected callbacks, so
they are tested by passing fakes (`tests/agent_tools_test.ts`,
`tests/scoring_test.ts`, `tests/session_test.ts`).

| Module | File | What it owns |
|--------|------|--------------|
| **Agent loop** | `_shared/agent.ts` | `runAgent()` — the grounded, tool-using brain. Builds the Hebrew persona + cited catalogue + compliance rules, runs the bounded Gemini function-calling loop, and degrades gracefully so a customer message never hard-fails. |
| **Tool registry** | `_shared/tools.ts` | Every tool the agent can call (`search_plans`, `recommend_plans`, `get_provider`, `analyze_bill`, `create_lead`, `book_callback`, `escalate_to_human`) as a pure executor **and** its Gemini `functionDeclaration`. Consent-gating, auditing, and validation are baked into each tool. |
| **Ranking** | `_shared/scoring.ts` | `rankPlans` / `bestMatch` / `scorePlan` over a `MatchProfile` — THE single, provider-neutral, explainable 0–100 plan-ranking formula that kills cross-surface ranking drift. |
| **Session memory** | `_shared/session.ts` | One unified `ChatSession` (transcript + tool-call history + structured slots) the agent loads/saves regardless of channel, backed by `ai_sessions` (site/app) or `whatsapp_conversations.ai_state` (whatsapp). |

The low-level Gemini transport (text chain + Vision + the function-calling step)
lives in `_shared/ai.ts`; the cited-catalogue grounding lives in
`_shared/catalogue.ts`; consent-gated lead capture lives in `_shared/leads.ts`.

### `runAgent()` — the loop (`_shared/agent.ts`)

```
1. Build a Hebrew system prompt = persona (per-channel tone) + CITED catalogue
   rows ([Sn]) + compliance rules (§30A / §11 / §7b / consent).
2. Ask Gemini with the tool declarations (TOOL_DECLARATIONS).
3. If it returns functionCall(s): run each tool (real data, audited,
   consent-gated), feed the functionResponse back, loop.
4. If it returns text: that's the answer.
5. Bound to MAX_STEPS (4); on the final step the tools are dropped so the model
   is forced to produce a text wrap-up instead of asking for another tool call.
```

`runAgent` takes a `channel` (`whatsapp` | `site` | `app`), the user `message`,
prior `history`, the `keys` (Gemini for tools + text; Groq / OpenRouter for the
text fallback), the grounding `plans` (`ScorablePlan[]`), a `toolContext` (audit /
lead / escalation sinks), an optional `templateFallback`, and an optional
`billHint` (pre-extracted bill facts from a Vision call the caller already did).

It returns the `reply`, a `via` tag (`tools` | `text` | `template` |
`hard_fallback`) for telemetry, the `toolCalls` that ran this turn, and a
`timedOut` flag the caller can map to a 504.

**Per-channel persona tuning** differs only in length/tone (WhatsApp = very
short, 1–2 emoji ok; site/app = slightly fuller, cite `[Sn]`). The *shared* rules
— grounding + compliance — are identical across channels.

### Graceful degradation (never hard-fail a customer message)

```
Gemini tool loop  ──on rate-limit/error──▶  plain TEXT chain
   (recommend_plans etc.)                  (Gemini → Groq → OpenRouter, no tools)
                                                   │
                                                   ▼
                                          caller templateFallback
                                                   │
                                                   ▼
                                          HARD_FALLBACK (a friendly Hebrew line)
```

The customer always gets *something*. Each LLM fetch is bounded by an
`AbortController` timeout (`_shared/ai.ts` `TEXT_TIMEOUT_MS` / `VISION_TIMEOUT_MS`)
so a hung provider fails fast instead of pinning the function.

## The tool registry (`_shared/tools.ts`)

The agent loop parses a `functionCall`, looks the tool up in `TOOL_EXECUTORS`,
runs it with the shared `ToolContext`, and feeds the `ToolResult` back. The model
only ever sees the declared tools (`TOOL_DECLARATIONS`); an unknown name returns a
soft error the model can recover from.

| Tool | Reads / does | Notes |
|------|--------------|-------|
| `search_plans` | Real catalogue rows for a category (+ optional budget ceiling / abroad), cheapest-first | Pure read; no scoring. Omits missing facts, never fabricates. |
| `recommend_plans` | Ranks via `scoring.ts` `rankPlans`; up to 3 scored matches with Hebrew reasons/caveats + honest annual saving | A saving is surfaced **only** when a real `currentBill` was given (`hasBaseline`). |
| `get_provider` | Real facts about one provider — plan count + cheapest per category | No invented ratings/coverage; omits signals it doesn't have. |
| `analyze_bill` | Consumes already-extracted `{provider, monthly, category}` → grounded cheaper options | Saving is "up to ~₪X" from a real cheaper row vs the read amount, never a promise. The Vision extraction itself is done by the caller. |
| `create_lead` | Consent-gated lead capture via `_shared/leads.ts` (`buildAiLeadRow` → `captureLead`) | Refuses unless `consent === true`; writes NOTHING without it. Surfaces the §7b commission disclosure. |
| `book_callback` | Same consent gate as `create_lead`; the slot is folded into the lead notes | — |
| `escalate_to_human` | Hands the conversation to a human via `ctx.escalate` | No consent needed (service action, not marketing). Always reassures the customer. |

### Hard rules baked into every tool

- **Real data only** — `search_plans` / `recommend_plans` / `get_provider` read
  the live catalogue passed in; they never invent providers/prices/coverage. A
  missing fact is omitted, not fabricated.
- **Consent-gated leads** — `create_lead` / `book_callback` refuse unless
  `consent === true` (Spam-Law §30A + Privacy §11), routing through the single
  honest-consent gate in `_shared/leads.ts`. A missing/false consent returns
  `{ ok:false, reason:"consent_required" }`. The §7b commission disclosure
  (`COMMISSION_DISCLOSURE`) is returned so the agent states it *before* the
  hand-off.
- **Audited** — every tool run appends a `crm_events` row (the CRM activity
  feed); the sensitive ones (lead / callback / escalation) also append a
  `security_audit_log` row. Best-effort — auditing never blocks the tool.
- **Validated** — inputs are clipped/coerced; nothing is trusted as-is.

### Compliance guardrails — who enforces what

| Guardrail | Enforced by |
|-----------|-------------|
| `bot_enabled` human-takeover | The **caller** (the webhook goes silent when a human is in the loop). `runAgent` assumes it's allowed to answer. |
| §30A STOP / opt-out | The **caller**, *first*, before `runAgent`. The persona also never markets to an opted-out user. |
| §11 first-contact notice | The **caller** appends it (channel-specific). The persona identifies as חוסך. |
| §7b commission disclosure | `create_lead` / `book_callback` surface it; the persona is told to state it before the hand-off. |
| Consent | `create_lead` / `book_callback` refuse without `consent === true`. |

## The ranking formula (`_shared/scoring.ts`)

The ONE source of truth that kills cross-surface ranking drift. It reconciles the
two formulas that existed before — the site advisor's flat additive score and the
Flutter `recommendation_engine.dart` weighted 0–100 score — keeping the Dart
engine's explainable structure and folding in the site formula's hard guarantees.

`scorePlan(plan, profile)` produces a `PlanMatch`: a 0–100 `score` (+ rounded
`scorePct`), a short Hebrew band `label`, the `annualSaving`, and `reasons` /
`caveats` arrays. It is built from six normalized sub-scores
(price / saving / rating / speed / coverage / flex), tilted by the user's stated
`priority`, plus needs-met bonuses and a budget-overrun penalty.

**The guarantees:**

- **Provider neutrality** — `scorePlan` never looks at `plan.provider`. `rankPlans`
  breaks score ties with a **deterministic, seeded** Fisher–Yates shuffle (the seed
  derives from the *profile* only, never from any provider), so no brand gets a
  structural edge **and** the order is reproducible across surfaces for the same
  inputs (a live `Math.random` tie-break would make WhatsApp and the site disagree
  on equal-score ties). Higher scores always win; only genuine ties are shuffled.
- **Honest ratings** — a plan's `rating` is a real signal only once `reviews > 0`;
  otherwise a neutral `0.6` midpoint is used (no fabricated social proof). There is
  deliberately no rating-based reason string.
- **Honest savings** — `annualSaving` is `((bill − price) × 12)` clamped ≥ 0,
  computed **only** against a real current bill and **only** for monthly plans
  (a per-day/per-package abroad plan can't be compared to a monthly bill). Never a
  promised figure for a named person.

`ScorablePlan` is a superset accepting rows from either the bundled snapshot or the
live `public.plans` table (mapped via `_shared/catalogue.ts`); `priorityFromId`
normalizes every surface's priority id into one `MatchPriority`.

The web app ships its **own parallel copy** of this formula at `web/lib/recommend.ts`
(same `scorePlan` math, same provider-neutral seeded tie-break, same honest
savings/ratings rules) so the Next.js `/api/recommend` route ranks identically
without importing Deno code. Keep the two in sync — a divergence is ranking drift.

## Session memory (`_shared/session.ts`)

One logical `ChatSession`, two physical backings:

- **site / app** → `public.ai_sessions` (one row per opaque `session_id`; the
  rolling transcript jsonb the `site-ai-chat` fn already uses).
- **whatsapp** → `public.whatsapp_conversations.ai_state` (the reserved jsonb slot
  the webhook already stores its slot context in). The agent transcript + tool-call
  history + slots are folded into `ai_state.agent` so the webhook's own top-level
  slots stay readable and **no new column / migration** is needed.

A `ChatSession` carries (1) a capped `transcript` (`MAX_TRANSCRIPT = 12` turns),
(2) a short `toolCalls` audit (`MAX_TOOLCALLS = 12`), and (3) structured `slots`
(category / budget / abroad / topic + name / phone / consent / leadCaptured — so a
guardrail survives a reload, and consent is never fabricated).

Everything is **fail-soft**: a missing table, an un-migrated column, or a DB error
yields an empty session and a best-effort no-op save — the agent still answers
statelessly. Persistence is a bonus, never a hard dependency. `safeSessionId`
clips + validates the site/app session id so it can't smuggle a PostgREST filter.

## How each surface uses the agent

### WhatsApp (`whatsapp-webhook/`)

The Meta WhatsApp Cloud API webhook is the richest consumer. The **guard chain
stays in `index.ts`, above the agent**:

```
HMAC signature verify · wamid dedup · §30A STOP/opt-out · §11 first-contact
notice · bot_enabled human-takeover (silent) · per-contact hourly rate-limit
```

Only after all of these clear does it call the agent through
`whatsapp-webhook/agent_runner.ts` — a pure, dependency-injected bridge:

- `buildAgentToolContext()` assembles the `ToolContext` with the **real** sinks
  (`crm_events` / `security_audit_log` logging, `captureAiLead`, and the
  bot-takeover escalation). Every sink is best-effort and never throws into the
  tool loop.
- `runWhatsappAgent()` loads the unified `ChatSession`, calls `runAgent` with the
  `whatsapp` channel + the catalogue + an optional `billHint`, appends the
  user/bot turns and tool calls to the session, merges any newly-learned slots,
  and saves. Fail-soft end to end (an empty reply routes `index.ts` back to its
  own templated flow).

Bill photos are extracted by the webhook's existing Gemini-Vision call and passed
to the agent as a `billHint`, so `analyze_bill` reasons over the facts without
re-reading the image.

The deterministic template flows (`flows.ts` / `intents.ts` / `context.ts`) remain
the agent's `templateFallback` — the last resort when both the tool loop and the
no-tools text chain are unavailable, so a customer message is never dropped.

### Site chat (`site-ai-chat/`)

Public chat behind the "חוסך AI" widget — a grounded Gemini call over the bundled
`plans-snapshot.json`, with durable multi-turn memory in `public.ai_sessions`
(service role) keyed by an opaque client `session_id`, per-IP throttled via
`chat_messages`. Fails soft to a stateless reply if `ai_sessions` isn't applied.

### Web concierge / quiz (`web/`)

The Next.js app exposes the recommendation brain over HTTP:

- **`web/lib/recommend.ts`** — the pure shared ranking formula (the web-side twin
  of `scoring.ts`), with `rankPlans` / `bestMatch` / `scorePlan` / `priorityFromId`
  / `annualSaving` over the bundled catalogue.
- **`POST /api/recommend`** (`web/app/api/recommend/route.ts`) — the thin server
  route behind the quiz. Validates the five quiz inputs
  (category / budget / priority / lines / abroad), builds a `MatchProfile`, ranks
  the bundled catalogue through the shared formula, and returns the top matches
  with score, annual saving (only with a real bill), and Hebrew reasons/caveats.
  Reads PUBLIC catalogue data, writes nothing, and applies the same Origin
  allow-list as `/api/lead`.

The **`/quiz`** route (`web/app/quiz/page.tsx` + `QuizWizard.tsx` + `types.ts`) is
the client wizard that collects the five inputs, calls `/api/recommend`, and
renders the ranked real plans with their reasons/caveats; the results→`LeadForm`
hand-off is being finished alongside this doc.

### Bill analyzer (`site-bill-analyzer/`)

Public endpoint behind "צלמו את החשבון". Gemini Vision extracts
provider / monthly ₪ / category from a bill photo and matches cheaper catalogue
options. The image is **never stored** — only a summary row in `bill_analyses`.

## Deal feed + Web Push (PWA)

A scheduled deal feed turns **real** price drops into browser/PWA push
notifications. It is built on the price ledger described below.

### `plan_price_history` population

`public.plan_price_history` (the "Market Pulse" ledger, created by
`plan-price-history-2026-06.sql`) is an append-only daily snapshot table —
`(plan_id, category, provider, price, after, captured_at)`. The catalogue only
ever holds the *current* price, so this ledger is what makes price *trends* real
over time.

`agent-platform-2026-06.sql` adds the **population trigger**: an
`after insert or update of price/after/after_exact on public.plans` trigger
(`snapshot_plan_price()`, `SECURITY DEFINER`, pinned `search_path`) that inserts a
snapshot row whenever a plan's price (or post-promo `after`) actually changes —
so the ledger records every move as it happens instead of depending on the
catalogue-sync to remember a daily INSERT. The block is fully **guarded**: a no-op
unless both `public.plans` and `public.plan_price_history` exist, and idempotent.

The web app reads this ledger honestly:

- **`web/lib/price-history.ts`** — `computeWeeklyDrop` returns a `PriceDrop` only
  when a genuine week-over-week decrease clears the threshold
  (`DROP_MIN_ABS = ₪5` OR `DROP_MIN_PCT = 10%`), else `null` (no badge).
- **`GET /api/price-history`** (`web/app/api/price-history/route.ts`) — returns the
  real snapshots per requested `plan_id` plus the (possibly null) honest drop
  summary. Degrades to an empty 200 payload when the service-role key is absent,
  so the trend badge is an enhancement that never breaks the page.

### The deal-feed sender — `site-push-notify/`

A scheduled (pg_cron) edge function that reads the ledger for material drops, reads
opted-in subscriptions, and sends an end-to-end-encrypted Web Push to each matching
subscriber. Three files:

- **`deals.ts`** — PURE, unit-tested selection logic: `detectDrops` (latest
  qualifying drop per plan within a look-back window), `isMaterialDrop`
  (≥ ₪5 OR ≥ 10%), `subscriptionWantsCategory` (opt-out + category prefs + quiet
  hours), `inQuietHours` (23:00–08:00 Israel, with a computed DST offset — no tz
  table), `dropDedupeKey`, and `buildPushMessage` (Hebrew copy stating the real
  old→new price; no invented "savings to you"). A "deal" is only ever a real
  movement in the ledger — if there's no qualifying drop, nobody is notified.
- **`webpush.ts`** — the cryptographic core over Deno WebCrypto, no npm: VAPID JWT
  signing (ES256 / P-256, RFC 8292) and message encryption (`aes128gcm`, RFC 8291
  + 8188 — ECDH → HKDF → AES-128-GCM). `sendWebPush` is the only fn that does
  network I/O and never throws (a `404`/`410` reports `expired` so the caller
  prunes the dead subscription).
- **`index.ts`** — the fan-out handler. `GET ?action=health` reports config /
  grant status; `POST` (webhook-secret authed) runs a pass (`{ dryRun: true }`
  selects + counts without sending). **Fail-soft like `notify-lead`**: absent VAPID
  keys → `503 "not configured"` and nothing is sent (the feed is dark until the
  owner sets the keys). Per-(subscription, drop) dedupe via `push_deliveries` guards
  against re-sends.

### PWA client (`web/`)

- **`web/public/service-worker.js`** — the PWA service worker: a tiny offline shell
  (nothing price-bearing is cached; HTML is network-first) **and** the Web Push
  receiver that shows the notification and opens the relevant URL on click.
- **`web/public/manifest.json`** — the installable-PWA manifest (RTL, Hebrew, green
  theme).
- **`web/lib/push.ts`** — fail-soft client helpers: support gate (`isPushSupported`),
  SW registration, subscribe/unsubscribe, and the POST to the same-origin proxy.
  Push is a progressive enhancement; every helper returns a benign result and never
  throws into the UI. The only thing sent server-side is the opaque
  `PushSubscription` (endpoint + browser-minted keys) — no PII.
- **`POST /api/push`** (`web/app/api/push/route.ts`) — a thin same-origin proxy that
  forwards a (un)subscription to the `site-push-notify` function (so the browser
  never needs the function URL or a secret), with the same Origin allow-list as
  `/api/lead`. A `404`/`501` from the backend (function not deployed yet) maps to
  `503 "not configured"` so the client toggles push off gracefully.

### Supporting schema

| Table / change | Migration | Purpose |
|----------------|-----------|---------|
| `public.push_subscriptions` | `agent-platform-2026-06.sql` | One row per browser/PWA subscription (endpoint + p256dh/auth keys + opted-in `categories`). RLS: a signed-in user manages only their own rows; service_role (the sender) reads all + writes anon PWA rows. |
| `public.agent_tool_calls` | `agent-platform-2026-06.sql` | OPTIONAL deeper audit of agent tool runs (name + ok + PII-light preview), complementing the `crm_events` feed. service_role only. |
| `plan_price_history` population trigger | `agent-platform-2026-06.sql` | `snapshot_plan_price()` + trigger on `public.plans` price changes (guarded, idempotent). |
| `push_subscriptions` prefs (`opted_out` / `quiet_hours` / `last_notified_at`) | `site-push-notify-2026-06.sql` | Subscriber mute + overnight-quiet prefs (guarded no-op until the base table exists). |
| `public.push_deliveries` | `site-push-notify-2026-06.sql` | Dedupe ledger — one row per (subscription, drop) delivered. service_role only; prune by age (~30 days). |

Both migrations follow the **grant-gap rule** (every new table/function needs an
explicit `service_role` GRANT) and carry the "DRAFT — do NOT auto-apply" header.
See [`DEPLOYMENT.md`](./DEPLOYMENT.md#sql-schema--migration-order) for the
application order and the **VAPID owner action**.

## Testing

The shared core is unit-tested in `supabase/functions/tests/`:

- `agent_tools_test.ts` — `runAgent` loop + every tool executor (consent gating,
  real-data-only, auditing) via injected fakes.
- `scoring_test.ts` — the ranking formula: provider neutrality, deterministic
  tie-break reproducibility, honest savings/ratings.
- `session_test.ts` — load/save round-trip + capping + fail-soft.

The deal-feed sender is tested in `tests/site_push_notify_test.ts` (drop
detection, quiet-hours/targeting, and the VAPID/`aes128gcm` crypto codec).

Gate: `deno task check` (type-check) + `deno task test`. The `check` task covers
the `_shared/{agent,tools,scoring,session}.ts` modules and the `site-push-notify`
function files (`index.ts` / `deals.ts` / `webpush.ts`). Web-side: `npm run test`
(vitest) covers `lib/recommend.ts` (incl. `recommend.test.ts` parity with the
shared formula), `lib/price-history.ts` (`price-history.test.ts`), and the new API
routes; `npm run build` is the release gate.

## Cross-references

- Per-function auth + deploy recipe → [`EDGE_FUNCTIONS.md`](./EDGE_FUNCTIONS.md)
- Migration application order + VAPID owner action →
  [`DEPLOYMENT.md`](./DEPLOYMENT.md#sql-schema--migration-order)
- Tables + RLS posture → [`DATA_MODEL.md`](./DATA_MODEL.md)
- The four surfaces + overall data flow → [`ARCHITECTURE.md`](./ARCHITECTURE.md)
