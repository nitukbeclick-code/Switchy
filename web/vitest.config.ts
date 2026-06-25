import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

// ────────────────────────────────────────────────────────────────────────────
// Vitest config for the GEO app's tests. Two projects, split by environment:
//
//  1. "unit"      — pure-logic tests under lib/** + app/api/** (`node` env).
//     data.ts / schema.ts read the bundled catalogue via node:fs + process.cwd(),
//     so they need a Node environment with cwd at the web root.
//
//  2. "component" — React component tests under components/**/__tests__ (`jsdom`
//     env + @vitejs/plugin-react for JSX/Fast-Refresh-free transform). These use
//     @testing-library/react; vitest.setup.ts wires jest-dom matchers + cleanup.
//
// The top-level `test.include` is "**/*.test.{ts,tsx}" (per the project contract);
// each project narrows that to its own files so a .tsx never runs in node and a
// pure lib .ts never pays the jsdom cost. The Next build never imports test files
// (they live in __tests__ next to the code under test).
//
// The `@/*` alias mirrors tsconfig.json so `import … from "@/lib/…"` /
// "@/components/…" works identically in tests and in the Next build.
// ────────────────────────────────────────────────────────────────────────────

const alias = {
  "@": fileURLToPath(new URL(".", import.meta.url)),
};

export default defineConfig({
  test: {
    include: ["**/*.test.{ts,tsx}"],
    exclude: ["node_modules/**", ".next/**"],
    projects: [
      {
        resolve: { alias },
        test: {
          name: "unit",
          environment: "node",
          include: ["lib/**/*.test.ts", "app/**/*.test.ts"],
          exclude: ["node_modules/**", ".next/**"],
        },
      },
      {
        plugins: [react()],
        resolve: { alias },
        test: {
          name: "component",
          environment: "jsdom",
          // jsdom only enables Web Storage (localStorage) for a non-opaque
          // origin — give it a concrete URL so localStorage.* works in tests.
          environmentOptions: { jsdom: { url: "http://localhost/" } },
          globals: true,
          // userEvent typing through the multi-step LeadForm is slow under jsdom;
          // give component tests generous headroom so a cold transform/setup pass
          // can't flake the multi-step walk.
          testTimeout: 20000,
          setupFiles: ["./vitest.setup.ts"],
          include: ["components/**/__tests__/**/*.test.{ts,tsx}"],
          exclude: ["node_modules/**", ".next/**"],
        },
      },
    ],
  },
});
