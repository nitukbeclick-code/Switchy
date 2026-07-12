// Unit tests for the whatsapp-webhook PER-ISOLATE TTL CACHES (getPlans /
// geminiKey in whatsapp-webhook/index.ts). These used to cache for the isolate's
// ENTIRE lifetime — a warm isolate served hours-old catalogue rows and a rotated
// Gemini key never landed until a cold start. Both getters now take an injectable
// `now` (test-only; production passes nothing) so the TTL contract is pinned
// deterministically:
//   • within the TTL → cached copy, ZERO reads on the hot path;
//   • after the TTL → re-fetch (catalogue updates / key rotations propagate);
//   • FAILED refresh → keep serving the last good copy, retry next window.
// The bot_knowledge cache has the same contract, tested at its source in
// knowledge_test.ts (loadBotKnowledgeCached).
//
// index.ts calls Deno.serve at top level, so we import it through the capture
// rig (no port bound). Env must be set BEFORE the import. Run from
// supabase/functions/:  deno task test

import { assertEquals } from "@std/assert";
import { captureServeHandler } from "./_capture_handler.ts";

// The HMAC secret is irrelevant here (we never invoke the handler), but the
// module reads env at import; keep outbound sends dark like the other rigs.
Deno.env.set("WHATSAPP_APP_SECRET", "cache-test-secret");
Deno.env.delete("WHATSAPP_TOKEN");
// serviceFetch/fetchRows short-circuit to null without these — set them so the
// stubbed fetch below is actually exercised.
Deno.env.set("SUPABASE_URL", "https://stub.supabase.co");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "stub-key");
// No env Gemini key: the Vault RPC (stubbed) must be the only key source, so
// the fail-soft "keep the last good key" branch is observable.
Deno.env.delete("GEMINI_API_KEY");
Deno.env.delete("GOOGLE_AI_KEY");

await captureServeHandler("../whatsapp-webhook/index.ts");
const { getPlans, geminiKey } = await import("../whatsapp-webhook/index.ts");

const realFetch = globalThis.fetch;

// The webhook's cache TTL (CACHE_TTL_MS in index.ts). Pinned here so a silent
// widening of the window fails a test instead of quietly serving stale data.
const TTL = 10 * 60_000;

function rowsResponse(rows: unknown[]): Response {
  return new Response(JSON.stringify(rows), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

const PLAN_A = { id: "p1", provider: "פרטנר", category: "cellular", price: 29, title: "מסלול א" };
const PLAN_B = { id: "p2", provider: "סלקום", category: "internet", price: 89, title: "מסלול ב" };

Deno.test("getPlans: TTL refresh + fail-soft-to-stale contract", async (t) => {
  const T0 = 1_000_000;
  let plansFetches = 0;
  let respondPlans: () => Response = () => rowsResponse([PLAN_A]);
  globalThis.fetch = ((input: Request | URL | string) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.includes("/rest/v1/plans")) {
      plansFetches++;
      return Promise.resolve(respondPlans());
    }
    return Promise.resolve(new Response("{}", { status: 200 }));
  }) as typeof globalThis.fetch;
  try {
    await t.step("cold start loads the live catalogue once", async () => {
      const p = await getPlans(T0);
      assertEquals(p.length, 1);
      assertEquals(p[0].price, 29);
      assertEquals(plansFetches, 1);
    });

    await t.step("within the TTL the cached copy serves with ZERO reads", async () => {
      const p = await getPlans(T0 + TTL - 1);
      assertEquals(p.length, 1);
      assertEquals(plansFetches, 1, "no re-fetch inside the window");
    });

    await t.step("after the TTL a catalogue update reaches the warm isolate", async () => {
      respondPlans = () => rowsResponse([PLAN_A, PLAN_B]);
      const p = await getPlans(T0 + TTL + 1);
      assertEquals(p.length, 2, "the new plan row is served without a cold start");
      assertEquals(plansFetches, 2);
    });

    await t.step("a FAILED refresh keeps serving the last good catalogue", async () => {
      respondPlans = () => new Response("db down", { status: 500 });
      const p = await getPlans(T0 + 2 * TTL + 2);
      assertEquals(p.length, 2, "stale copy survives the refresh failure");
      assertEquals(plansFetches, 3, "the refresh WAS attempted");
    });

    await t.step("a failed refresh stamps the window — retried per TTL, not per message", async () => {
      const p = await getPlans(T0 + 2 * TTL + 3);
      assertEquals(p.length, 2);
      assertEquals(plansFetches, 3, "no extra read right after the failed refresh");
    });
  } finally {
    globalThis.fetch = realFetch;
  }
});

Deno.test("geminiKey: TTL refresh picks up a Vault ROTATION; a refresh miss keeps the last good key", async (t) => {
  const T0 = 50_000_000; // far past the plans test's windows — independent timeline
  let cfgFetches = 0;
  let respondCfg: () => Response = () =>
    new Response(JSON.stringify({ gemini_api_key: "K1" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  globalThis.fetch = ((input: Request | URL | string) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.includes("/rest/v1/rpc/get_lead_notify_config")) {
      cfgFetches++;
      return Promise.resolve(respondCfg());
    }
    return Promise.resolve(new Response("{}", { status: 200 }));
  }) as typeof globalThis.fetch;
  try {
    await t.step("cold start resolves the key from Vault once", async () => {
      assertEquals(await geminiKey(T0), "K1");
      assertEquals(cfgFetches, 1);
    });

    await t.step("within the TTL the cached key serves with ZERO reads", async () => {
      assertEquals(await geminiKey(T0 + TTL - 1), "K1");
      assertEquals(cfgFetches, 1);
    });

    await t.step("after the TTL a ROTATED Vault key propagates to the warm isolate", async () => {
      respondCfg = () =>
        new Response(JSON.stringify({ gemini_api_key: "K2" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      assertEquals(await geminiKey(T0 + TTL + 1), "K2", "rotation lands without a cold start");
      assertEquals(cfgFetches, 2);
    });

    await t.step("a refresh miss (Vault down, no env key) keeps the last good key", async () => {
      respondCfg = () => new Response("vault down", { status: 500 });
      assertEquals(await geminiKey(T0 + 2 * TTL + 2), "K2", "never downgraded to ''");
      assertEquals(cfgFetches, 3, "the refresh WAS attempted");
    });

    await t.step("the miss stamps the window — no per-message hammering", async () => {
      assertEquals(await geminiKey(T0 + 2 * TTL + 3), "K2");
      assertEquals(cfgFetches, 3);
    });
  } finally {
    globalThis.fetch = realFetch;
  }
});
