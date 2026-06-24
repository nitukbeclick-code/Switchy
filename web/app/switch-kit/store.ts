// ────────────────────────────────────────────────────────────────────────────
// Switch-kit tracker store — a tiny, dependency-free external store wired to the
// browser's localStorage, consumed via React's useSyncExternalStore. It persists
// ONLY the user's own progress through a switch (which step is todo/in_progress/
// done), keyed by the (fromProvider, toPlanId) attempt so two different switches
// keep independent progress.
//
// WHY useSyncExternalStore: it's the React-19-blessed way to subscribe to an
// external mutable source (here, localStorage + an in-memory mirror) with a stable
// server snapshot, so the tracker hydrates without a mismatch (the server snapshot
// is always "no saved progress" → the first client render matches, then an effect-
// free getSnapshot reads the real saved state on the client).
//
// PRIVACY / TRUTH-ONLY: this stores the user's OWN step states only — no PII, no
// catalogue data, nothing fabricated. The kit content (letter/steps) is rebuilt
// from the real catalogue by lib/switch-kit; we persist only WHICH step the user
// reached. The optional server mirror (POST /api/switch-kit) is fail-soft — the
// tracker works fully offline in localStorage even if the API/DB is absent.
//
// SSR-safe: every `window`/`localStorage` access is guarded; the server snapshot
// is a frozen constant, so this module is import-safe from a client component that
// Next may also evaluate on the server during prerender.
// ────────────────────────────────────────────────────────────────────────────

import { SWITCH_STEP_KEYS, isSwitchStepKey } from "@/lib/switch-kit";
import type { SwitchStepStatus } from "@/lib/switch-kit";

/** localStorage key namespace (versioned so a future shape change can migrate). */
const STORAGE_PREFIX = "switchkit:v1:";

/** A persisted progress record: a map of stepKey → status. */
export type StepProgress = Record<string, SwitchStepStatus>;

/** The stable, frozen server/empty snapshot (no saved progress). */
const EMPTY: StepProgress = Object.freeze({});

/**
 * Build the storage key for a switch attempt. Both parts are normalised so the key
 * is stable across renders. A blank fromProvider/target still yields a usable key
 * (the user may not have entered a current provider yet).
 */
export function attemptKey(fromProvider: string, toPlanId: string): string {
  const f = (fromProvider || "").trim().toLowerCase().replace(/\s+/g, "-");
  const t = (toPlanId || "").trim();
  return `${STORAGE_PREFIX}${f || "_"}::${t || "_"}`;
}

/** In-memory mirror so getSnapshot returns a STABLE reference between mutations. */
const cache = new Map<string, StepProgress>();
/** Per-key subscriber sets. */
const listeners = new Map<string, Set<() => void>>();

function emit(key: string): void {
  const set = listeners.get(key);
  if (set) for (const fn of set) fn();
}

/** Safely read + sanitise a persisted record from localStorage. */
function readStorage(key: string): StepProgress {
  if (typeof window === "undefined") return EMPTY;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return EMPTY;
    const out: StepProgress = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      // Only keep canonical step keys with a valid status (ignore stale/foreign).
      if (isSwitchStepKey(k) && (v === "todo" || v === "in_progress" || v === "done")) {
        out[k] = v;
      }
    }
    return Object.freeze(out);
  } catch {
    return EMPTY;
  }
}

/** Get the current snapshot for a key (cached for reference stability). */
function getOrLoad(key: string): StepProgress {
  const hit = cache.get(key);
  if (hit) return hit;
  const loaded = readStorage(key);
  cache.set(key, loaded);
  return loaded;
}

// ── The external-store API (the three useSyncExternalStore callbacks) ─────────
/** Subscribe to changes for a key. Returns an unsubscribe fn. */
export function subscribe(key: string, onChange: () => void): () => void {
  let set = listeners.get(key);
  if (!set) {
    set = new Set();
    listeners.set(key, set);
  }
  set.add(onChange);

  // Cross-tab sync: a `storage` event for this key invalidates the cache + emits.
  const onStorage = (e: StorageEvent) => {
    if (e.key === key) {
      cache.delete(key);
      getOrLoad(key);
      emit(key);
    }
  };
  if (typeof window !== "undefined") {
    window.addEventListener("storage", onStorage);
  }

  return () => {
    set?.delete(onChange);
    if (set && set.size === 0) listeners.delete(key);
    if (typeof window !== "undefined") {
      window.removeEventListener("storage", onStorage);
    }
  };
}

/** Client snapshot getter (reads the cached/loaded localStorage state). */
export function getSnapshot(key: string): StepProgress {
  return getOrLoad(key);
}

/** Server snapshot getter — always the stable empty record (no hydration mismatch). */
export function getServerSnapshot(): StepProgress {
  return EMPTY;
}

// ── Mutations ──────────────────────────────────────────────────────────────────
/** Persist a new record + notify subscribers (no-op on the server). */
function commit(key: string, next: StepProgress): void {
  const frozen = Object.freeze({ ...next });
  cache.set(key, frozen);
  if (typeof window !== "undefined") {
    try {
      if (Object.keys(frozen).length === 0) {
        window.localStorage.removeItem(key);
      } else {
        window.localStorage.setItem(key, JSON.stringify(frozen));
      }
    } catch {
      // Storage full / disabled — keep the in-memory mirror so the UI still works.
    }
  }
  emit(key);
}

/** Set one step's status. Ignores non-canonical keys (never persists junk). */
export function setStep(
  key: string,
  stepKey: string,
  status: SwitchStepStatus,
): void {
  if (!isSwitchStepKey(stepKey)) return;
  const cur = getOrLoad(key);
  if (cur[stepKey] === status) return; // no-op → no needless re-render
  commit(key, { ...cur, [stepKey]: status });
}

/** Cycle a step todo → in_progress → done → todo (used by a single tap control). */
export function cycleStep(key: string, stepKey: string): void {
  if (!isSwitchStepKey(stepKey)) return;
  const cur = getOrLoad(key)[stepKey] ?? "todo";
  const next: SwitchStepStatus =
    cur === "todo" ? "in_progress" : cur === "in_progress" ? "done" : "todo";
  setStep(key, stepKey, next);
}

/** Toggle a step done ⇆ todo (the checkbox affordance). */
export function toggleDone(key: string, stepKey: string): void {
  if (!isSwitchStepKey(stepKey)) return;
  const cur = getOrLoad(key)[stepKey] ?? "todo";
  setStep(key, stepKey, cur === "done" ? "todo" : "done");
}

/** Clear all saved progress for a key (the "התחל מחדש" affordance). */
export function reset(key: string): void {
  commit(key, {});
}

/** How many of the canonical steps are marked done (for the progress meter). */
export function doneCount(progress: StepProgress): number {
  let n = 0;
  for (const k of SWITCH_STEP_KEYS) if (progress[k] === "done") n++;
  return n;
}
