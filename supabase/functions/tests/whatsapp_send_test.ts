// Unit tests for the fail-soft Graph API helpers in _shared/whatsapp.ts:
// sendText (now with retry-once-on-5xx), markRead, markTyping, sendList,
// sendImage, sendDocument. We stub globalThis.fetch and capture each request's
// init.body, asserting BOTH the outgoing payload shape (so a Graph-rejecting
// change is caught here, not in production) and the fail-soft contract (every
// helper returns null/true|null on error and NEVER throws).
//
// IMPORTANT: _shared/whatsapp.ts reads WHATSAPP_TOKEN into a module-level const
// at import time, so the env MUST be set BEFORE the module is imported. We set
// it here, then dynamically import once into `wa`. Run from supabase/functions/:
//   deno task test

import { assert, assertEquals, assertStringIncludes } from "@std/assert";

Deno.env.set("WHATSAPP_TOKEN", "test-token");
Deno.env.set("WHATSAPP_PHONE_ID", "PHONE123");
Deno.env.set("GRAPH_API_VERSION", "v21.0");

const wa = await import("../_shared/whatsapp.ts");

const realFetch = globalThis.fetch;

// A captured outbound call: the URL and the parsed JSON body.
type Capture = { url: string; body: Record<string, unknown> };

// Install a fetch stub that records every call and returns the queued responses
// in order (so a test can model "first 503, then 200"). Returns the capture log
// plus a restore(). A response factory receives the call index so retries can be
// modelled. Any extra calls beyond the queue get the last factory.
function stubFetch(
  responders: Array<(c: Capture, i: number) => Response>,
): { calls: Capture[]; restore: () => void } {
  const calls: Capture[] = [];
  globalThis.fetch = ((input: Request | URL | string, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    let body: Record<string, unknown> = {};
    try {
      body = init?.body ? JSON.parse(String(init.body)) : {};
    } catch {
      body = {};
    }
    const c: Capture = { url, body };
    const i = calls.length;
    calls.push(c);
    const f = responders[Math.min(i, responders.length - 1)];
    return Promise.resolve(f(c, i));
  }) as typeof globalThis.fetch;
  return {
    calls,
    restore: () => {
      globalThis.fetch = realFetch;
    },
  };
}

function okWamid(id = "wamid.OK"): Response {
  return new Response(JSON.stringify({ messages: [{ id }] }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

// ── sendText: payload shape ────────────────────────────────────────────────

Deno.test("sendText posts the text payload to the right endpoint and returns the wamid", async () => {
  const s = stubFetch([() => okWamid("wamid.T1")]);
  try {
    const id = await wa.sendText("972500000001", "שלום");
    assertEquals(id, "wamid.T1");
    assertEquals(s.calls.length, 1);
    assertStringIncludes(s.calls[0].url, "/v21.0/PHONE123/messages");
    assertEquals(s.calls[0].body.messaging_product, "whatsapp");
    assertEquals(s.calls[0].body.to, "972500000001");
    assertEquals(s.calls[0].body.type, "text");
    assertEquals((s.calls[0].body.text as { body: string }).body, "שלום");
  } finally {
    s.restore();
  }
});

Deno.test("sendText trims the recipient and guards empty to/body without a network call", async () => {
  const s = stubFetch([() => okWamid()]);
  try {
    assertEquals(await wa.sendText("   ", "hi"), null);
    assertEquals(await wa.sendText("972", ""), null);
    assertEquals(s.calls.length, 0, "no fetch for a guarded send");
    // A padded but valid recipient is trimmed before sending.
    const id = await wa.sendText("  972500000002  ", "hey");
    assertEquals(id, "wamid.OK");
    assertEquals(s.calls[0].body.to, "972500000002");
  } finally {
    s.restore();
  }
});

// ── sendText: retry-once-on-5xx (the new internal behaviour) ─────────────────

Deno.test("sendText retries exactly once on a 5xx and succeeds on the retry", async () => {
  const s = stubFetch([
    () => new Response("upstream", { status: 503 }),
    () => okWamid("wamid.RETRY"),
  ]);
  try {
    const id = await wa.sendText("972500000003", "retry me");
    assertEquals(id, "wamid.RETRY");
    assertEquals(s.calls.length, 2, "one initial + one retry");
    // The retried payload is identical to the first.
    assertEquals(s.calls[0].body.to, s.calls[1].body.to);
    assertEquals((s.calls[1].body.text as { body: string }).body, "retry me");
  } finally {
    s.restore();
  }
});

Deno.test("sendText retries only ONCE — a second 5xx fails soft to null (no infinite loop)", async () => {
  const s = stubFetch([() => new Response("down", { status: 500 })]);
  try {
    const id = await wa.sendText("972500000004", "still down");
    assertEquals(id, null);
    assertEquals(s.calls.length, 2, "initial + a single retry, then give up");
  } finally {
    s.restore();
  }
});

Deno.test("sendText does NOT retry a 4xx (real client error) — one call, null", async () => {
  const s = stubFetch([() => new Response("bad number", { status: 400 })]);
  try {
    const id = await wa.sendText("972500000005", "nope");
    assertEquals(id, null);
    assertEquals(s.calls.length, 1, "4xx is not transient — no retry");
  } finally {
    s.restore();
  }
});

Deno.test("sendText fail-soft returns null (never throws) on a network throw", async () => {
  const s = stubFetch([() => {
    throw new TypeError("dns failure");
  }]);
  try {
    const id = await wa.sendText("972500000006", "boom");
    assertEquals(id, null);
  } finally {
    s.restore();
  }
});

// ── markRead ────────────────────────────────────────────────────────────────

Deno.test("markRead posts status:read with the message_id and returns true", async () => {
  const s = stubFetch([() => new Response("{}", { status: 200 })]);
  try {
    const ok = await wa.markRead("wamid.IN1");
    assertEquals(ok, true);
    assertEquals(s.calls[0].body.messaging_product, "whatsapp");
    assertEquals(s.calls[0].body.status, "read");
    assertEquals(s.calls[0].body.message_id, "wamid.IN1");
  } finally {
    s.restore();
  }
});

Deno.test("markRead guards an empty id and fail-softs a Graph error to null", async () => {
  const s = stubFetch([() => new Response("err", { status: 400 })]);
  try {
    assertEquals(await wa.markRead("   "), null);
    assertEquals(s.calls.length, 0, "empty id never hits the network");
    assertEquals(await wa.markRead("wamid.X"), null, "graph 400 → null");
  } finally {
    s.restore();
  }
});

// ── markTyping ────────────────────────────────────────────────────────────────

Deno.test("markTyping(on=true by default) posts a text typing_indicator", async () => {
  const s = stubFetch([() => new Response("{}", { status: 200 })]);
  try {
    const ok = await wa.markTyping("wamid.IN2");
    assertEquals(ok, true);
    assertEquals(s.calls[0].body.status, "read");
    assertEquals(s.calls[0].body.message_id, "wamid.IN2");
    assertEquals(
      (s.calls[0].body.typing_indicator as { type: string }).type,
      "text",
    );
  } finally {
    s.restore();
  }
});

Deno.test("markTyping(on=false) clears the indicator (type:off)", async () => {
  const s = stubFetch([() => new Response("{}", { status: 200 })]);
  try {
    await wa.markTyping("wamid.IN3", false);
    assertEquals(
      (s.calls[0].body.typing_indicator as { type: string }).type,
      "off",
    );
  } finally {
    s.restore();
  }
});

Deno.test("markTyping fail-softs on a network throw without throwing", async () => {
  const s = stubFetch([() => {
    throw new Error("net");
  }]);
  try {
    assertEquals(await wa.markTyping("wamid.IN4"), null);
  } finally {
    s.restore();
  }
});

// ── sendList ────────────────────────────────────────────────────────────────

Deno.test("sendList builds an interactive list payload and returns the wamid", async () => {
  const s = stubFetch([() => okWamid("wamid.L1")]);
  try {
    const id = await wa.sendList(
      "972500000010",
      "בחר/י מסלול:",
      [{
        title: "סלולר",
        rows: [
          { id: "cell_1", title: "מסלול א", description: "30GB" },
          { id: "cell_2", title: "מסלול ב" },
        ],
      }],
      "לרשימה",
    );
    assertEquals(id, "wamid.L1");
    const inter = s.calls[0].body.interactive as {
      type: string;
      body: { text: string };
      action: {
        button: string;
        sections: Array<
          {
            title?: string;
            rows: Array<{ id: string; title: string; description?: string }>;
          }
        >;
      };
    };
    assertEquals(s.calls[0].body.type, "interactive");
    assertEquals(inter.type, "list");
    assertEquals(inter.body.text, "בחר/י מסלול:");
    assertEquals(inter.action.button, "לרשימה");
    assertEquals(inter.action.sections.length, 1);
    assertEquals(inter.action.sections[0].title, "סלולר");
    assertEquals(inter.action.sections[0].rows.length, 2);
    assertEquals(inter.action.sections[0].rows[0].id, "cell_1");
    assertEquals(inter.action.sections[0].rows[0].description, "30GB");
    // Row without a description omits the key entirely.
    assert(!("description" in inter.action.sections[0].rows[1]));
  } finally {
    s.restore();
  }
});

Deno.test("sendList drops empty rows/sections and bails (null) when nothing tappable remains", async () => {
  const s = stubFetch([() => okWamid()]);
  try {
    // All rows are missing id or title → no valid section → no network call.
    const id = await wa.sendList("972500000011", "body", [
      {
        title: "x",
        rows: [{ id: "", title: "no id" }, { id: "y", title: "" }],
      },
    ]);
    assertEquals(id, null);
    assertEquals(s.calls.length, 0);
  } finally {
    s.restore();
  }
});

Deno.test("sendList truncates over-long titles/descriptions to Meta's caps", async () => {
  const s = stubFetch([() => okWamid()]);
  try {
    await wa.sendList("972500000012", "b", [
      {
        rows: [{
          id: "k",
          title: "x".repeat(40),
          description: "d".repeat(100),
        }],
      },
    ]);
    const inter = s.calls[0].body.interactive as {
      action: {
        sections: Array<
          { rows: Array<{ title: string; description: string }> }
        >;
      };
    };
    assertEquals(inter.action.sections[0].rows[0].title.length, 24);
    assertEquals(inter.action.sections[0].rows[0].description.length, 72);
  } finally {
    s.restore();
  }
});

Deno.test("sendList fail-softs a Graph 500 to null (no retry on this helper)", async () => {
  const s = stubFetch([() => new Response("err", { status: 500 })]);
  try {
    const id = await wa.sendList("972500000013", "b", [{
      rows: [{ id: "k", title: "t" }],
    }]);
    assertEquals(id, null);
    assertEquals(s.calls.length, 1);
  } finally {
    s.restore();
  }
});

// ── sendImage ────────────────────────────────────────────────────────────────

Deno.test("sendImage posts an image-by-link payload with an optional caption", async () => {
  const s = stubFetch([() => okWamid("wamid.IMG")]);
  try {
    const id = await wa.sendImage(
      "972500000020",
      "https://cdn.test/a.png",
      "כיתוב",
    );
    assertEquals(id, "wamid.IMG");
    assertEquals(s.calls[0].body.type, "image");
    const img = s.calls[0].body.image as { link: string; caption?: string };
    assertEquals(img.link, "https://cdn.test/a.png");
    assertEquals(img.caption, "כיתוב");
  } finally {
    s.restore();
  }
});

Deno.test("sendImage omits the caption key when none is given and guards a missing link", async () => {
  const s = stubFetch([() => okWamid()]);
  try {
    await wa.sendImage("972500000021", "https://cdn.test/b.png");
    const img = s.calls[0].body.image as { link: string; caption?: string };
    assert(!("caption" in img));
    // Missing link → no network call, null.
    assertEquals(await wa.sendImage("972500000021", "  "), null);
    assertEquals(s.calls.length, 1);
  } finally {
    s.restore();
  }
});

// ── sendDocument ──────────────────────────────────────────────────────────────

Deno.test("sendDocument posts a document-by-link payload with an optional filename", async () => {
  const s = stubFetch([() => okWamid("wamid.DOC")]);
  try {
    const id = await wa.sendDocument(
      "972500000030",
      "https://cdn.test/kit.pdf",
      "switch-kit.pdf",
    );
    assertEquals(id, "wamid.DOC");
    assertEquals(s.calls[0].body.type, "document");
    const doc = s.calls[0].body.document as { link: string; filename?: string };
    assertEquals(doc.link, "https://cdn.test/kit.pdf");
    assertEquals(doc.filename, "switch-kit.pdf");
  } finally {
    s.restore();
  }
});

Deno.test("sendDocument fail-softs a network throw to null without throwing", async () => {
  const s = stubFetch([() => {
    throw new TypeError("boom");
  }]);
  try {
    assertEquals(
      await wa.sendDocument("972500000031", "https://cdn.test/x.pdf"),
      null,
    );
  } finally {
    s.restore();
  }
});
