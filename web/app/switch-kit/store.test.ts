import { describe, it, expect } from "vitest";
import {
  attemptKey,
  doneCount,
  getServerSnapshot,
  getSnapshot,
  setStep,
  cycleStep,
  toggleDone,
  reset,
} from "./store";

// ────────────────────────────────────────────────────────────────────────────
// app/switch-kit/store — the localStorage-backed tracker store consumed via
// useSyncExternalStore. These tests run in the node env (no window), so they
// exercise the SSR-safe behaviour: the server snapshot is a stable empty record,
// reads degrade to empty (no localStorage), mutations are no-ops on storage but
// keep an in-memory mirror, and only canonical step keys are ever accepted. This
// is exactly the contract the page relies on for a hydration-mismatch-free render.
// ────────────────────────────────────────────────────────────────────────────

describe("switch-kit store — keys + SSR-safe snapshots", () => {
  it("builds a stable, normalised attempt key per (provider, target)", () => {
    const a = attemptKey("סלקום", "cel_abc");
    const b = attemptKey("סלקום", "cel_abc");
    expect(a).toBe(b);
    expect(a).toContain("cel_abc");
    // A blank provider/target still yields a usable, distinct key.
    expect(attemptKey("", "")).not.toBe(a);
  });

  it("server snapshot is a stable, frozen empty record (no hydration mismatch)", () => {
    const s1 = getServerSnapshot();
    const s2 = getServerSnapshot();
    expect(s1).toBe(s2); // same reference → useSyncExternalStore is happy
    expect(Object.keys(s1)).toHaveLength(0);
  });

  it("client snapshot without localStorage is empty (SSR-safe read)", () => {
    const key = attemptKey("פרטנר", "cel_xyz");
    expect(Object.keys(getSnapshot(key))).toHaveLength(0);
  });

  it("mutations keep an in-memory mirror and accept only canonical step keys", () => {
    const key = attemptKey("בזק", "net_1");
    setStep(key, "porting", "done");
    setStep(key, "not_a_step", "done"); // ignored — not canonical
    const snap = getSnapshot(key);
    expect(snap.porting).toBe("done");
    expect((snap as Record<string, unknown>).not_a_step).toBeUndefined();
    expect(doneCount(snap)).toBe(1);
    reset(key);
    expect(Object.keys(getSnapshot(key))).toHaveLength(0);
  });

  it("cycleStep walks todo → in_progress → done → todo", () => {
    const key = attemptKey("yes", "tv_1");
    cycleStep(key, "check_terms");
    expect(getSnapshot(key).check_terms).toBe("in_progress");
    cycleStep(key, "check_terms");
    expect(getSnapshot(key).check_terms).toBe("done");
    cycleStep(key, "check_terms");
    expect(getSnapshot(key).check_terms).toBe("todo");
    reset(key);
  });

  it("toggleDone flips done ⇆ todo", () => {
    const key = attemptKey("HOT", "triple_1");
    toggleDone(key, "written_notice");
    expect(getSnapshot(key).written_notice).toBe("done");
    toggleDone(key, "written_notice");
    expect(getSnapshot(key).written_notice).toBe("todo");
    reset(key);
  });
});
