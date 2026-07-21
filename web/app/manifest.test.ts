import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import manifest from "./manifest";

describe("PWA public assets", () => {
  it("publishes every icon declared by the manifest", () => {
    const icons = manifest().icons ?? [];
    expect(icons.length).toBeGreaterThanOrEqual(4);
    for (const icon of icons) {
      const src = typeof icon === "string" ? icon : icon.src;
      expect(existsSync(join(process.cwd(), "public", src.replace(/^\//, "")))).toBe(true);
    }
  });

  it("pre-caches the real manifest route, never the retired JSON path", () => {
    const worker = readFileSync(join(process.cwd(), "public", "service-worker.js"), "utf8");
    expect(worker).toContain("/manifest.webmanifest");
    expect(worker).not.toContain("/manifest.json");
  });
});
