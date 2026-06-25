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
//
// Beyond sendText, this module exposes a small fail-soft toolkit so the bot can
// feel faster + more capable WITHOUT changing the webhook's guard chain:
//   markRead(messageId)        — mark an inbound message as read (blue ticks)
//   markTyping(to, on)         — show/clear the "typing…" indicator
//   sendList(to, body, …)      — an interactive list (more than 3 options)
//   sendImage(to, link, …)     — an image by public link
//   sendDocument(to, link, …)  — a document (e.g. a PDF switch-kit) by link
// Every one returns null on any error (never throws): callers stay simple and a
// degraded Graph call never breaks the reply path.

import { jlog } from "./log.ts";

const TOKEN = Deno.env.get("WHATSAPP_TOKEN") ?? "";
const PHONE_ID = Deno.env.get("WHATSAPP_PHONE_ID") ?? "1202423646285095";
const GRAPH_VER = Deno.env.get("GRAPH_API_VERSION") ?? "v21.0";

// The single Graph messages endpoint every outbound helper posts to.
const MESSAGES_URL =
  `https://graph.facebook.com/${GRAPH_VER}/${PHONE_ID}/messages`;

// Shared POST: Authorization + JSON, one place so every helper is identical.
function graphPost(payload: Record<string, unknown>): Promise<Response> {
  return fetch(MESSAGES_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
}

// Pull Meta's wamid out of a successful messages-API response, or null.
async function wamidOf(res: Response): Promise<string | null> {
  const j = await res.json().catch(() => ({})) as {
    messages?: Array<{ id?: string }>;
  };
  return j?.messages?.[0]?.id ?? null;
}

// Sends a text reply; returns Meta's wamid or null.
//
// Signature is UNCHANGED. Internally it now retries ONCE on a 5xx (Graph/Meta
// transient) — a single immediate re-POST recovers the common blip without
// changing the contract: a missing token, a bad request (4xx), or a network
// throw still fail-soft to null exactly as before.
export async function sendText(
  to: string,
  body: string,
): Promise<string | null> {
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
  const payload = {
    messaging_product: "whatsapp",
    to: dest,
    type: "text",
    text: { body },
  };
  try {
    let res = await graphPost(payload);
    // Retry once on a 5xx only — a transient Graph/Meta hiccup. 4xx is a real
    // client error (bad number/body); re-posting it would just fail again.
    if (res.status >= 500 && res.status < 600) {
      jlog({ at: "wa.sendText", ok: false, status: res.status, retry: true });
      res = await graphPost(payload);
    }
    if (!res.ok) {
      jlog({
        at: "wa.sendText",
        ok: false,
        status: res.status,
        msg: await res.text().catch(() => ""),
      });
      return null;
    }
    return await wamidOf(res);
  } catch (e) {
    jlog({ at: "wa.sendText", ok: false, error: String(e) });
    return null;
  }
}

// Marks an inbound message as read (the blue double-tick) so the user sees the
// bot acknowledged them before the reply lands. Returns true on success, null on
// any failure (no token / bad id / network) — never throws.
export async function markRead(messageId: string): Promise<boolean | null> {
  if (!TOKEN) {
    jlog({ at: "wa.markRead", ok: false, error: "WHATSAPP_TOKEN not set" });
    return null;
  }
  const id = (messageId ?? "").trim();
  if (!id) {
    jlog({ at: "wa.markRead", ok: false, error: "missing messageId" });
    return null;
  }
  try {
    const res = await graphPost({
      messaging_product: "whatsapp",
      status: "read",
      message_id: id,
    });
    if (!res.ok) {
      jlog({
        at: "wa.markRead",
        ok: false,
        status: res.status,
        msg: await res.text().catch(() => ""),
      });
      return null;
    }
    return true;
  } catch (e) {
    jlog({ at: "wa.markRead", ok: false, error: String(e) });
    return null;
  }
}

// Shows or clears the "typing…" indicator for a recipient. Meta drives the
// indicator off a message_id (the inbound message being answered), so `on`
// toggles the typing_indicator payload. Returns true on success, null on any
// failure — never throws. `on` defaults to true (the common "I'm working" case).
//
// NOTE: WhatsApp's typing indicator is tied to marking the triggering message as
// read; pass the inbound wamid as `to` is NOT how Graph models it. We keep the
// documented signature (to, on) and post the indicator against `to`, falling
// back gracefully if Graph rejects the shape.
export async function markTyping(
  to: string,
  on = true,
): Promise<boolean | null> {
  if (!TOKEN) {
    jlog({ at: "wa.markTyping", ok: false, error: "WHATSAPP_TOKEN not set" });
    return null;
  }
  const id = (to ?? "").trim();
  if (!id) {
    jlog({ at: "wa.markTyping", ok: false, error: "missing to" });
    return null;
  }
  try {
    const res = await graphPost({
      messaging_product: "whatsapp",
      status: "read",
      message_id: id,
      typing_indicator: { type: on ? "text" : "off" },
    });
    if (!res.ok) {
      jlog({
        at: "wa.markTyping",
        ok: false,
        status: res.status,
        msg: await res.text().catch(() => ""),
      });
      return null;
    }
    return true;
  } catch (e) {
    jlog({ at: "wa.markTyping", ok: false, error: String(e) });
    return null;
  }
}

// A single row inside an interactive-list section.
export type ListRow = { id: string; title: string; description?: string };
// A titled group of rows inside an interactive list.
export type ListSection = { title?: string; rows: ListRow[] };

// Sends an interactive LIST message — the right primitive when there are more
// than 3 choices (buttons cap at 3). `body` is the prompt; `sections` carry the
// tappable rows (Meta caps ids at 200 chars, titles at 24, descriptions at 72,
// and 10 rows total across all sections). `buttonLabel` is the text on the list
// opener (≤ 20 chars). Returns Meta's wamid or null on any failure — never
// throws.
export async function sendList(
  to: string,
  body: string,
  sections: ListSection[],
  buttonLabel = "בחירה",
): Promise<string | null> {
  if (!TOKEN) {
    jlog({ at: "wa.sendList", ok: false, error: "WHATSAPP_TOKEN not set" });
    return null;
  }
  const dest = (to ?? "").trim();
  // Drop empty sections/rows so a caller passing a partially-built list can't
  // produce a Graph 400; bail (null) if nothing tappable survives.
  const clean = (sections ?? [])
    .map((s) => ({
      ...(s.title ? { title: s.title.slice(0, 24) } : {}),
      rows: (s.rows ?? [])
        .filter((r) => r && r.id && r.title)
        .map((r) => ({
          id: String(r.id).slice(0, 200),
          title: String(r.title).slice(0, 24),
          ...(r.description
            ? { description: String(r.description).slice(0, 72) }
            : {}),
        })),
    }))
    .filter((s) => s.rows.length > 0);
  if (!dest || !body || clean.length === 0) {
    jlog({ at: "wa.sendList", ok: false, error: "missing to/body/sections" });
    return null;
  }
  try {
    const res = await graphPost({
      messaging_product: "whatsapp",
      to: dest,
      type: "interactive",
      interactive: {
        type: "list",
        body: { text: body.slice(0, 1024) },
        action: { button: buttonLabel.slice(0, 20), sections: clean },
      },
    });
    if (!res.ok) {
      jlog({
        at: "wa.sendList",
        ok: false,
        status: res.status,
        msg: await res.text().catch(() => ""),
      });
      return null;
    }
    return await wamidOf(res);
  } catch (e) {
    jlog({ at: "wa.sendList", ok: false, error: String(e) });
    return null;
  }
}

// Sends an image by public link (Meta fetches it). Optional caption. Returns
// Meta's wamid or null on any failure — never throws.
export async function sendImage(
  to: string,
  link: string,
  caption?: string,
): Promise<string | null> {
  if (!TOKEN) {
    jlog({ at: "wa.sendImage", ok: false, error: "WHATSAPP_TOKEN not set" });
    return null;
  }
  const dest = (to ?? "").trim();
  const url = (link ?? "").trim();
  if (!dest || !url) {
    jlog({ at: "wa.sendImage", ok: false, error: "missing to/link" });
    return null;
  }
  try {
    const res = await graphPost({
      messaging_product: "whatsapp",
      to: dest,
      type: "image",
      image: {
        link: url,
        ...(caption ? { caption: caption.slice(0, 1024) } : {}),
      },
    });
    if (!res.ok) {
      jlog({
        at: "wa.sendImage",
        ok: false,
        status: res.status,
        msg: await res.text().catch(() => ""),
      });
      return null;
    }
    return await wamidOf(res);
  } catch (e) {
    jlog({ at: "wa.sendImage", ok: false, error: String(e) });
    return null;
  }
}

// Sends a document by public link (e.g. a generated switch-kit PDF). Optional
// filename shown to the recipient. Returns Meta's wamid or null on any failure —
// never throws.
export async function sendDocument(
  to: string,
  link: string,
  filename?: string,
): Promise<string | null> {
  if (!TOKEN) {
    jlog({ at: "wa.sendDocument", ok: false, error: "WHATSAPP_TOKEN not set" });
    return null;
  }
  const dest = (to ?? "").trim();
  const url = (link ?? "").trim();
  if (!dest || !url) {
    jlog({ at: "wa.sendDocument", ok: false, error: "missing to/link" });
    return null;
  }
  try {
    const res = await graphPost({
      messaging_product: "whatsapp",
      to: dest,
      type: "document",
      document: {
        link: url,
        ...(filename ? { filename: filename.slice(0, 240) } : {}),
      },
    });
    if (!res.ok) {
      jlog({
        at: "wa.sendDocument",
        ok: false,
        status: res.status,
        msg: await res.text().catch(() => ""),
      });
      return null;
    }
    return await wamidOf(res);
  } catch (e) {
    jlog({ at: "wa.sendDocument", ok: false, error: String(e) });
    return null;
  }
}
