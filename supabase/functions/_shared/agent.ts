// ─────────────────────────────────────────────────────────────────────────────
// _shared/agent.ts — runAgent(): the shared, grounded, tool-using brain that
// WhatsApp, the site, and the app all call. ONE persona, ONE catalogue grounding,
// ONE tool loop, ONE set of compliance guardrails — so the three surfaces can
// never drift on what the agent knows or how it behaves.
//
// THE LOOP (Gemini function-calling, bounded ~4 steps):
//   1. Build a Hebrew system prompt = parameterized persona + CITED catalogue
//      rows ([Sn]) + the compliance rules (§30A / §11 / §7b / consent).
//   2. Ask Gemini with the tool declarations (_shared/tools.ts).
//   3. If it returns functionCall(s): run each tool (real data, audited,
//      consent-gated), feed the functionResponse back, loop.
//   4. If it returns text: that's the answer.
//   5. Bound to MAX_STEPS; if we hit the cap, ask once more for a text wrap-up.
//
// GRACEFUL DEGRADATION (never hard-fail a customer message):
//   tool-loop on Gemini  →  on rate-limit/error, fall to the plain TEXT chain
//   (generateReply: Gemini → Groq → OpenRouter, no tools)  →  finally to the
//   caller-supplied template-fallback callback. The customer ALWAYS gets a reply.
//
// GUARDRAILS enforced here AND in tools.ts:
//   • bot_enabled human-takeover — the CALLER gates this (the webhook goes silent
//     when a human is in the loop); runAgent assumes it's allowed to answer. We
//     re-state it in the contract so downstream agents wire it correctly.
//   • §30A STOP — honored by the caller FIRST (before runAgent); the persona also
//     never markets to an opted-out user.
//   • §11 first-contact notice — the caller appends it (it's channel-specific);
//     the persona is told to identify as חוסך.
//   • §7b commission disclosure — surfaced by create_lead/book_callback BEFORE the
//     hand-off; the persona is told to state it.
//   • consent — create_lead/book_callback refuse without consent===true.
// ─────────────────────────────────────────────────────────────────────────────

import {
  type AiKeys,
  appendFunctionCall,
  appendFunctionResponse,
  type ChatTurn,
  generateReply,
  generateWithToolsStep,
  newToolContents,
  type ReplyMeta,
} from "./ai.ts";
import { buildCitedCatalogueContext, type Plan as CataloguePlan } from "./catalogue.ts";
import type { ScorablePlan } from "./scoring.ts";
import { TOOL_DECLARATIONS, TOOL_EXECUTORS, type ToolContext, type ToolResult } from "./tools.ts";

export type AgentChannel = "whatsapp" | "site" | "app";

// Per-channel persona tuning. WhatsApp = very short, 1-2 emoji ok; site/app =
// slightly fuller, cite [Sn]. The SHARED rules (grounding + compliance) are
// identical across channels — only length/tone differ.
const CHANNEL_STYLE: Record<AgentChannel, string> = {
  whatsapp:
    "- ענה/י קצר וזורם לוואטסאפ (1-4 משפטים), טון חם ואנושי. מותר אימוג'י אחד-שניים.",
  site:
    "- ענה/י קצר (2-4 משפטים), טון חם ומקצועי. כשמציינים מסלול/מחיר ספציפי, צ_טט/י את המקור [Sn].",
  app:
    "- ענה/י קצר (2-4 משפטים), טון חם ומקצועי. כשמציינים מסלול/מחיר ספציפי, צ_טט/י את המקור [Sn].",
};

// The shared persona + hard rules. The cited catalogue is appended by the caller
// path (buildSystemPrompt). These rules are the E-E-A-T + legal contract.
const PERSONA_HEADER =
  `את/ה הסוכן/ת החכם/ה של "חוסך" (Switchy) — שירות ישראלי להשוואת מסלולי סלולר/אינטרנט/טלוויזיה/חבילה משולבת/חו"ל וחיסכון בחשבונות התקשורת.
כללים מחייבים:
- ענה/י בעברית בלבד.
- התבסס/י אך ורק על נתוני המסלולים מהקטלוג (כל שורה מסומנת ב-[Sn]) ועל תוצאות הכלים. אסור להמציא ספק, מסלול, מחיר, כיסוי, דירוג או חיסכון שלא מופיעים בנתונים. אם חסר מידע — אמר/י זאת בכנות והפנה/י לוואטסאפ/טופס, אל תמציא/י.
- כשממליצים: השתמש/י בכלי recommend_plans כדי לדרג מהקטלוג, והצג/י עד 3 מסלולים עם סיבה קצרה לכל אחד. אל תבטיח/י חיסכון מדויק לאדם ספציפי — רק אם נמסר חשבון נוכחי אמיתי.
- אם המשתמש/ת רוצה לעבור ספק, הצעה אישית, שיחזרו אליו/ה, או נציג — אסוף/י שם+טלפון ובקש/י אישור מפורש לתנאי השימוש ומדיניות הפרטיות (consent) לפני קריאה ל-create_lead/book_callback. בלי אישור — אל תיצור/י פנייה.
- לפני העברת פנייה לנציג, ציין/י בקצרה שחוסך עשוי לקבל עמלה מהספק וזה לא משפיע על המחיר או על ההמלצה.
- אל תיתן/י מידע רגיש או לא קשור לתחום התקשורת.
- החזר/י אך ורק את התשובה הסופית ללקוח. אסור קידומות כמו "THOUGHT"/"תשובה:", ואסור טקסט באנגלית.
`;

const MAX_STEPS = 4; // tool-loop iterations before we force a text wrap-up
const MAX_OUTPUT_TOKENS = 500;

// A friendly last-resort line if literally everything fails (the caller's
// template fallback should normally cover this).
const HARD_FALLBACK =
  "סליחה, נתקלתי בעומס רגעי 🙏 אפשר לנסות שוב עוד רגע, או לפנות אלינו בוואטסאפ. רוצה שאחבר נציג אנושי?";

export type RunAgentInput = {
  channel: AgentChannel;
  message: string;
  // Prior conversation turns (the unified session's transcript). user/bot roles.
  history?: ChatTurn[];
  keys: AiKeys; // gemini (tools + text), groq, openrouter (text fallback)
  // The grounding catalogue (live public.plans mapped, or the bundled snapshot).
  plans: ScorablePlan[];
  // Audit / lead / escalation sinks + ids, passed straight to every tool.
  toolContext: Omit<ToolContext, "plans" | "channel">;
  // The template-flow fallback: invoked only if BOTH the tool loop and the
  // no-tools text chain produce nothing. MUST return a safe Hebrew reply (the
  // existing per-channel template flow). Keeps "never hard-fail" true.
  templateFallback?: (message: string) => Promise<string> | string;
  // Optional pre-extracted bill facts (from a Vision call the caller already did)
  // so the model can analyze_bill without re-reading the image.
  billHint?: { provider?: string; monthly?: number; category?: string; imageId?: string };
};

export type RunAgentResult = {
  reply: string;
  // How we got the reply — for logging/telemetry, not shown to the user.
  via: "tools" | "text" | "template" | "hard_fallback";
  // Tools that ran this turn (name + ok) so the caller can persist them to the
  // session's tool-call history.
  toolCalls: { name: string; ok: boolean; preview?: string }[];
  // Whether any provider aborted on its timeout (caller may map to a 504).
  timedOut: boolean;
};

function buildSystemPrompt(channel: AgentChannel, plans: ScorablePlan[], billHint?: RunAgentInput["billHint"]): string {
  const cited = buildCitedCatalogueContext(plans as CataloguePlan[]);
  const styleLine = CHANNEL_STYLE[channel];
  let prompt = PERSONA_HEADER + styleLine + "\n\nנתוני מסלולים אמיתיים (מקור | קטגוריה | ספק | מסלול | מחיר | תכונות):\n" + cited;
  if (billHint && Number(billHint.monthly) > 0) {
    prompt += `\n\nנתוני חשבון שחולצו מהתמונה (לשימוש עם analyze_bill): ` +
      `ספק=${billHint.provider ?? "?"}, סכום חודשי=₪${Math.round(Number(billHint.monthly))}` +
      (billHint.category ? `, קטגוריה=${billHint.category}` : "");
  }
  return prompt;
}

// Run one tool by name with the shared context. Unknown tool → a soft error the
// model can recover from (it shouldn't happen — the model only sees declared
// tools — but we never throw into the loop).
async function runTool(
  name: string,
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolResult> {
  const exec = TOOL_EXECUTORS[name];
  if (!exec) return { ok: false, reason: "unknown_tool", note: `כלי לא מוכר: ${name}` };
  try {
    return await exec(ctx, args);
  } catch (e) {
    return { ok: false, reason: "error", note: "שגיאה בהרצת הכלי.", data: { error: String(e) } };
  }
}

// ── runAgent ──────────────────────────────────────────────────────────────────
export async function runAgent(input: RunAgentInput): Promise<RunAgentResult> {
  const { channel, message, keys, plans } = input;
  const history = input.history ?? [];
  const system = buildSystemPrompt(channel, plans, input.billHint);
  const toolCalls: { name: string; ok: boolean; preview?: string }[] = [];
  const ctx: ToolContext = { ...input.toolContext, plans, channel };

  // ── 1) Gemini tool loop (the rich path) ──────────────────────────────────
  if (keys.gemini) {
    try {
      const contents = newToolContents(history, message || "שלום");
      let lastToolNote = ""; // a §7b/consent note a tool surfaced, to fold into the final reply
      for (let step = 0; step < MAX_STEPS; step++) {
        const isLastStep = step === MAX_STEPS - 1;
        // On the final step, drop the tools so the model is forced to produce a
        // text wrap-up instead of asking for yet another tool call.
        const decls = isLastStep ? [] : TOOL_DECLARATIONS;
        const out = await generateWithToolsStep(keys.gemini, system, contents, decls, MAX_OUTPUT_TOKENS);

        if (out.calls.length === 0) {
          // Final text answer. Fold in a tool note (e.g. the §7b disclosure) if
          // the model didn't already include it.
          let reply = out.text.trim();
          if (lastToolNote && reply && !reply.includes(lastToolNote)) {
            reply = `${reply}\n\n${lastToolNote}`;
          }
          reply = reply || lastToolNote;
          if (reply) return { reply, via: "tools", toolCalls, timedOut: false };
          break; // empty text with no calls → fall through to text chain
        }

        // Run each requested tool, append its call + response to the transcript.
        for (const call of out.calls) {
          appendFunctionCall(contents, call);
          const res = await runTool(call.name, call.args, ctx);
          toolCalls.push({ name: call.name, ok: res.ok, preview: res.note?.slice(0, 80) });
          if (res.note) lastToolNote = res.note;
          appendFunctionResponse(contents, call.name, {
            ok: res.ok,
            ...(res.reason ? { reason: res.reason } : {}),
            ...(res.data ?? {}),
            ...(res.note ? { note: res.note } : {}),
          });
        }
        // Loop: the model now sees the tool results and answers (or calls again).
      }
      // Hit the step cap without a text answer — fall through to the text chain.
    } catch (_e) {
      // Gemini tool path failed (rate limit / 5xx / timeout) — degrade to text.
    }
  }

  // ── 2) Plain text chain (Gemini → Groq → OpenRouter, no tools) ────────────
  // Same grounded system prompt; no tool calls. Honors timeouts via ReplyMeta.
  const meta: ReplyMeta = { timedOut: false };
  try {
    const text = await generateReply(keys, system, history, message || "שלום", MAX_OUTPUT_TOKENS, meta);
    if (text) return { reply: text, via: "text", toolCalls, timedOut: meta.timedOut };
  } catch (_e) {
    // fall through
  }

  // ── 3) Template fallback (the existing per-channel flow) ──────────────────
  if (input.templateFallback) {
    try {
      const t = await input.templateFallback(message);
      if (t) return { reply: t, via: "template", toolCalls, timedOut: meta.timedOut };
    } catch (_e) { /* fall through */ }
  }

  // ── 4) Hard fallback — the customer always gets *something* ───────────────
  return { reply: HARD_FALLBACK, via: "hard_fallback", toolCalls, timedOut: meta.timedOut };
}
