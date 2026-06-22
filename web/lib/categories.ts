// ────────────────────────────────────────────────────────────────────────────
// Pure category constants — NO filesystem / node imports, so this module is safe
// to import from client components ("use client"). lib/data.ts (which reads the
// catalogue via node:fs) re-exports CATEGORY_HE from here, keeping a single
// source of truth without dragging `fs` into the client bundle.
// ────────────────────────────────────────────────────────────────────────────

/** Category id → Hebrew display name. */
export const CATEGORY_HE: Record<string, string> = {
  cellular: "סלולר",
  internet: "אינטרנט",
  tv: "טלוויזיה",
  triple: "חבילה משולבת",
  abroad: "חבילות חו״ל",
  electricity: "חשמל",
};
