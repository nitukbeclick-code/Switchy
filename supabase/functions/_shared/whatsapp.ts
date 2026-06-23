// WhatsApp Cloud API outbound helper, shared by the webhook bot and the CRM.
//
// sendText(to, body) posts a plain text message via the Graph API and returns
// Meta's wamid (j.messages[0].id) for idempotent outbound storage, or null on
// any failure. Fail-soft: a missing token or a Graph error is logged via jlog
// and swallowed — the caller decides what to do (the CRM treats the DB write as
// authoritative and the send as best-effort).
//
// Mirrors the implementation inside whatsapp-webhook/index.ts so both paths send
// identically. Env: WHATSAPP_TOKEN (required), WHATSAPP_PHONE_ID and
// GRAPH_API_VERSION optional (sane Switchy defaults).

import { jlog } from "./log.ts";

const TOKEN = Deno.env.get("WHATSAPP_TOKEN") ?? "";
const PHONE_ID = Deno.env.get("WHATSAPP_PHONE_ID") ?? "1202423646285095";
const GRAPH_VER = Deno.env.get("GRAPH_API_VERSION") ?? "v21.0";

// Sends a text reply; returns Meta's wamid or null.
export async function sendText(to: string, body: string): Promise<string | null> {
  if (!TOKEN) {
    jlog({ at: "wa.sendText", ok: false, error: "WHATSAPP_TOKEN not set" });
    return null;
  }
  // Guard a missing recipient/body before hitting Graph — both would 400 there;
  // returning null lets the CRM record the message as failed without the round-trip.
  const dest = (to ?? "").trim();
  if (!dest || !body) {
    jlog({ at: "wa.sendText", ok: false, error: "missing to/body" });
    return null;
  }
  try {
    const res = await fetch(`https://graph.facebook.com/${GRAPH_VER}/${PHONE_ID}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", to: dest, type: "text", text: { body } }),
    });
    if (!res.ok) {
      jlog({ at: "wa.sendText", ok: false, status: res.status, msg: await res.text().catch(() => "") });
      return null;
    }
    const j = await res.json().catch(() => ({})) as { messages?: Array<{ id?: string }> };
    return j?.messages?.[0]?.id ?? null;
  } catch (e) {
    jlog({ at: "wa.sendText", ok: false, error: String(e) });
    return null;
  }
}
