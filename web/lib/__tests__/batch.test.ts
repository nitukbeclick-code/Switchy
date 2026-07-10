import { describe, expect, it } from "vitest";
import { runChunked } from "@/lib/batch";

describe("runChunked", () => {
  it("processes every item and counts truthy results", async () => {
    const seen: number[] = [];
    const ok = await runChunked([1, 2, 3, 4, 5], 2, async (n) => {
      seen.push(n);
      return n % 2 === 1; // odds succeed
    });
    expect(seen.sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5]);
    expect(ok).toBe(3); // 1,3,5
  });

  it("bounds concurrency to the chunk size", async () => {
    let inFlight = 0;
    let peak = 0;
    await runChunked([1, 2, 3, 4, 5, 6, 7], 3, async () => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await Promise.resolve();
      inFlight--;
      return true;
    });
    expect(peak).toBeLessThanOrEqual(3);
  });

  it("treats a rejected op as a failure and never throws", async () => {
    const ok = await runChunked([1, 2, 3], 5, async (n) => {
      if (n === 2) throw new Error("boom");
      return true;
    });
    expect(ok).toBe(2); // 1 and 3 succeed, 2 swallowed
  });

  it("coerces a bad chunk size to at least 1", async () => {
    const ok = await runChunked([1, 2], 0, async () => true);
    expect(ok).toBe(2);
  });

  it("returns 0 for an empty list", async () => {
    expect(await runChunked([], 4, async () => true)).toBe(0);
  });
});
