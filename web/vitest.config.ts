import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// ────────────────────────────────────────────────────────────────────────────
// Vitest config for the GEO app's pure-logic unit tests.
//
// - `environment: node` — every module under test is pure (no DOM): data.ts /
//   schema.ts read the bundled catalogue via node:fs + process.cwd(), so they
//   need a Node environment with cwd at the web root (Vitest's default root).
// - The `@/*` alias mirrors tsconfig.json so `import { … } from "@/lib/…"` works
//   identically in tests and in the Next build.
// - Only `lib/**` + `app/api/**` test files are picked up; the Next build never
//   imports test files (they live next to the code under test in `__tests__`).
// ────────────────────────────────────────────────────────────────────────────

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["**/*.test.ts"],
    exclude: ["node_modules/**", ".next/**"],
  },
});
