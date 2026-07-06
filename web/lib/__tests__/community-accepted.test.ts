import { describe, it, expect } from "vitest";
import { orderByAccepted } from "@/lib/community";

// ────────────────────────────────────────────────────────────────────────────
// orderByAccepted — the shared "best answer" resolver used by BOTH the interactive
// reply thread and the SEO permalink, so they always agree on which reply is the
// author's chosen answer and float it to the top. Pure; the DB (RLS + trigger) is
// the real authority for WHO may set it — this only decides presentation.
// ────────────────────────────────────────────────────────────────────────────

const R = (id: string) => ({ id, body: `reply ${id}` });

describe("orderByAccepted", () => {
  it("returns replies unchanged with no accepted id", () => {
    const rows = [R("a"), R("b"), R("c")];
    const { accepted, ordered } = orderByAccepted(rows, null);
    expect(accepted).toBeNull();
    expect(ordered.map((r) => r.id)).toEqual(["a", "b", "c"]);
  });

  it("floats the accepted reply to the top and keeps the rest in order", () => {
    const rows = [R("a"), R("b"), R("c")];
    const { accepted, ordered } = orderByAccepted(rows, "b");
    expect(accepted?.id).toBe("b");
    expect(ordered.map((r) => r.id)).toEqual(["b", "a", "c"]);
  });

  it("is a no-op when the accepted reply is already first", () => {
    const rows = [R("a"), R("b")];
    const { accepted, ordered } = orderByAccepted(rows, "a");
    expect(accepted?.id).toBe("a");
    expect(ordered.map((r) => r.id)).toEqual(["a", "b"]);
  });

  it("treats a DANGLING accepted id (reply deleted/flagged out) as no choice", () => {
    const rows = [R("a"), R("b")];
    const { accepted, ordered } = orderByAccepted(rows, "gone");
    expect(accepted).toBeNull();
    expect(ordered.map((r) => r.id)).toEqual(["a", "b"]);
  });

  it("does not mutate the input array", () => {
    const rows = [R("a"), R("b"), R("c")];
    const snapshot = rows.map((r) => r.id);
    orderByAccepted(rows, "c");
    expect(rows.map((r) => r.id)).toEqual(snapshot);
  });

  it("handles an empty list", () => {
    const { accepted, ordered } = orderByAccepted([] as { id: string }[], "x");
    expect(accepted).toBeNull();
    expect(ordered).toEqual([]);
  });
});
