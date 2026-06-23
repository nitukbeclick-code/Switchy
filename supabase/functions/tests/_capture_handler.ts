// Test-only helper: capture the Request handler a function registers with
// Deno.serve(...) WITHOUT binding a real port or modifying the function.
//
// The community-* edge functions call `Deno.serve(handler)` at module top level.
// We temporarily replace Deno.serve with a stub that records the handler and
// returns an inert server object, dynamically import the function module (which
// runs the registration), then restore Deno.serve. The returned handler can be
// invoked directly with synthetic Request objects — letting tests exercise the
// REAL function logic (secret gate, routing, formatting, fail-soft paths)
// end-to-end. No source file is changed; this lives entirely in tests/.

export type EdgeHandler = (req: Request) => Response | Promise<Response>;

// Inert object shaped enough like Deno.HttpServer that the function's
// top-level `Deno.serve(...)` call type-checks and never touches the network.
function inertServer(): Deno.HttpServer {
  return {
    finished: Promise.resolve(),
    shutdown: () => Promise.resolve(),
    ref() {},
    unref() {},
    addr: { transport: "tcp", hostname: "0.0.0.0", port: 0 },
  } as unknown as Deno.HttpServer;
}

// Import `specifier` with Deno.serve stubbed, returning the captured handler.
// `specifier` is resolved relative to THIS file (so pass e.g.
// "../community-notify/index.ts"). Env / fetch stubs must be installed by the
// caller BEFORE invoking this, since module top-level code runs during import.
export async function captureServeHandler(specifier: string): Promise<EdgeHandler> {
  let captured: EdgeHandler | null = null;
  const original = Deno.serve;
  // deno-lint-ignore no-explicit-any
  (Deno as any).serve = (a: any, b?: any): Deno.HttpServer => {
    captured = (typeof a === "function" ? a : b) as EdgeHandler;
    return inertServer();
  };
  try {
    await import(new URL(specifier, import.meta.url).href);
  } finally {
    // deno-lint-ignore no-explicit-any
    (Deno as any).serve = original;
  }
  if (!captured) {
    throw new Error(`module ${specifier} did not call Deno.serve(handler)`);
  }
  return captured;
}

// Minimal fetch stub: routes each request URL to a handler you supply. URLs that
// match NO route are passed through to the original fetch — so this stub only
// intercepts the endpoints a test explicitly owns and never silently swallows an
// unrelated request from another test file sharing the process. Returns a
// restore() to put the real fetch back; `calls` records every requested URL.
export function stubFetch(
  routes: Array<{ match: (url: string, init?: RequestInit) => boolean; respond: (url: string, init?: RequestInit) => Response }>,
): { calls: string[]; restore: () => void } {
  const calls: string[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = ((input: Request | URL | string, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    for (const r of routes) {
      if (r.match(url, init)) {
        calls.push(url);
        return Promise.resolve(r.respond(url, init));
      }
    }
    return original(input as Request, init);
  }) as typeof fetch;
  return { calls, restore: () => { globalThis.fetch = original; } };
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

// Run `fn` with a fetch stub installed, ALWAYS restoring the original fetch
// afterwards — so a stub set up for one test can never leak into another test
// file sharing the process. Use this inside each Deno.test body that needs to
// intercept the handler's outbound calls.
export async function withFetchStub(
  routes: Parameters<typeof stubFetch>[0],
  fn: (calls: string[]) => void | Promise<void>,
): Promise<void> {
  const s = stubFetch(routes);
  try {
    await fn(s.calls);
  } finally {
    s.restore();
  }
}
