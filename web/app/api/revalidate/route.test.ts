import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ────────────────────────────────────────────────────────────────────────────
// POST /api/revalidate — the on-demand ISR purge that replaced the short
// revalidate timers (see docs/vercel-isr-budget.md). `next/cache` is mocked so
// nothing touches a real cache; the test asserts the contract that matters:
//   • closed by default — no REVALIDATE_SECRET configured → 503, never open;
//   • a wrong / missing secret → 403 and NOT a single purge;
//   • a correct secret purges exactly the scope's routes, once each;
//   • dynamic route PATTERNS are purged with the "page" type and literal paths
//     with none — the type is required for the first and breaks the second;
//   • the scopes stay separate (a price edit must not re-write the ~500
//     community permalinks, and vice-versa);
//   • caller-supplied paths are sanitised and capped.
// ────────────────────────────────────────────────────────────────────────────

import {
  CATALOGUE_ISR_ROUTES,
  COMMUNITY_ISR_ROUTES,
  SITEMAP_ISR_ROUTES,
} from "@/lib/isr-budget";

const revalidatePath = vi.fn();

vi.mock("next/cache", () => ({
  revalidatePath: (path: string, type?: "page" | "layout") =>
    revalidatePath(path, type),
}));

const SECRET = "s3cr3t-test-value";

async function loadRoute() {
  vi.resetModules();
  return import("./route");
}

function post(body: unknown, secret: string | null = SECRET): Request {
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (secret !== null) headers["x-revalidate-secret"] = secret;
  return new Request("https://switchy-ai.com/api/revalidate", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

/** Just the paths handed to revalidatePath, in call order. */
function purgedPaths(): string[] {
  return revalidatePath.mock.calls.map((c) => c[0] as string);
}

beforeEach(() => {
  revalidatePath.mockClear();
  vi.stubEnv("REVALIDATE_SECRET", SECRET);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("POST /api/revalidate — access control", () => {
  it("is disabled (503) when no secret is configured", async () => {
    vi.stubEnv("REVALIDATE_SECRET", "");
    const { POST } = await loadRoute();
    const res = await POST(post({ scope: "catalogue" }));

    expect(res.status).toBe(503);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("rejects a missing secret with 403 and purges nothing", async () => {
    const { POST } = await loadRoute();
    const res = await POST(post({ scope: "catalogue" }, null));

    expect(res.status).toBe(403);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("rejects a wrong secret — including a same-length one", async () => {
    const { POST } = await loadRoute();

    const short = await POST(post({}, "nope"));
    const sameLength = await POST(post({}, "x".repeat(SECRET.length)));

    expect(short.status).toBe(403);
    expect(sameLength.status).toBe(403);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("never caches its own response", async () => {
    const { POST } = await loadRoute();
    const res = await POST(post({ scope: "catalogue" }));

    expect(res.headers.get("cache-control")).toBe("no-store");
  });
});

describe("POST /api/revalidate — purging", () => {
  it("purges every catalogue route plus the sitemap, once each", async () => {
    const { POST } = await loadRoute();
    const res = await POST(post({ scope: "catalogue" }));
    const body = (await res.json()) as { ok: boolean; purged: string[] };

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.purged).toEqual([
      ...CATALOGUE_ISR_ROUTES,
      ...SITEMAP_ISR_ROUTES,
    ]);
    expect(purgedPaths()).toEqual(body.purged);
    // No duplicates: one purge per route.
    expect(new Set(purgedPaths()).size).toBe(purgedPaths().length);
  });

  it("defaults to the catalogue scope when none is given", async () => {
    const { POST } = await loadRoute();
    const res = await POST(post({}));

    expect(res.status).toBe(200);
    expect(purgedPaths()).toContain("/plans/[id]");
  });

  it('types dynamic patterns as "page" and literal paths not at all', async () => {
    const { POST } = await loadRoute();
    await POST(post({ scope: "catalogue" }));

    const byPath = new Map(
      revalidatePath.mock.calls.map((c) => [c[0] as string, c[1]]),
    );
    expect(byPath.get("/plans/[id]")).toBe("page");
    expect(byPath.get("/compare/[service]/[city]")).toBe("page");
    expect(byPath.get("/plans")).toBeUndefined();
    expect(byPath.get("/sitemap.xml")).toBeUndefined();
  });

  it("keeps the scopes separate", async () => {
    const { POST } = await loadRoute();

    await POST(post({ scope: "community" }));
    expect(purgedPaths()).toEqual([
      ...COMMUNITY_ISR_ROUTES,
      ...SITEMAP_ISR_ROUTES,
    ]);
    // A new reply must not re-write the ~600 catalogue pages.
    expect(purgedPaths()).not.toContain("/plans/[id]");

    revalidatePath.mockClear();
    await POST(post({ scope: "catalogue" }));
    // ...and a price edit must not re-write the ~500 permalinks.
    expect(purgedPaths()).not.toContain("/community/post/[id]");
  });

  it('purges both families for scope "all"', async () => {
    const { POST } = await loadRoute();
    await POST(post({ scope: "all" }));

    expect(purgedPaths()).toContain("/plans/[id]");
    expect(purgedPaths()).toContain("/community/post/[id]");
  });

  it("adds caller-supplied paths on top of the scope", async () => {
    const { POST } = await loadRoute();
    await POST(post({ scope: "community", paths: ["/community/post/abc"] }));

    expect(purgedPaths()).toContain("/community/post/abc");
    // A concrete path is literal — no type.
    const call = revalidatePath.mock.calls.find(
      (c) => c[0] === "/community/post/abc",
    );
    expect(call?.[1]).toBeUndefined();
  });

  it("drops paths that are not app-absolute, and de-duplicates", async () => {
    const { POST } = await loadRoute();
    await POST(
      post({
        scope: "community",
        paths: [
          "//evil.example.com/x",
          "https://evil.example.com/x",
          "/../etc/passwd",
          "relative/path",
          42,
          // Already in the community scope — must not be purged twice.
          "/community/questions",
          "/community/post/ok",
        ],
      }),
    );

    expect(purgedPaths()).not.toContain("//evil.example.com/x");
    expect(purgedPaths()).not.toContain("https://evil.example.com/x");
    expect(purgedPaths()).not.toContain("/../etc/passwd");
    expect(purgedPaths()).not.toContain("relative/path");
    expect(purgedPaths()).toContain("/community/post/ok");
    expect(purgedPaths().filter((p) => p === "/community/questions")).toHaveLength(
      1,
    );
  });

  it("caps how many explicit paths one call can fan out to", async () => {
    const { POST } = await loadRoute();
    const paths = Array.from({ length: 80 }, (_, i) => `/community/post/${i}`);
    await POST(post({ scope: "community", paths }));

    const explicit = purgedPaths().filter((p) =>
      p.startsWith("/community/post/"),
    );
    // 50 explicit paths + the "/community/post/[id]" pattern from the scope.
    expect(explicit).toHaveLength(51);
  });
});

describe("POST /api/revalidate — bad input", () => {
  it("rejects an unknown scope without purging", async () => {
    const { POST } = await loadRoute();
    const res = await POST(post({ scope: "everything" }));

    expect(res.status).toBe(400);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("rejects a malformed body without purging", async () => {
    const { POST } = await loadRoute();
    const res = await POST(
      new Request("https://switchy-ai.com/api/revalidate", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-revalidate-secret": SECRET,
        },
        body: "{not json",
      }),
    );

    expect(res.status).toBe(400);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("treats an empty body as the default scope", async () => {
    const { POST } = await loadRoute();
    const res = await POST(
      new Request("https://switchy-ai.com/api/revalidate", {
        method: "POST",
        headers: { "x-revalidate-secret": SECRET },
      }),
    );

    expect(res.status).toBe(200);
    expect(purgedPaths()).toContain("/plans/[id]");
  });
});
