import { describe, it, expect } from "vitest";
import { clipForShare, communityShareText, whatsappShareUrl } from "@/lib/share";

// ────────────────────────────────────────────────────────────────────────────
// Pure share-link helpers (lib/share.ts) — used by <ShareBar> to build the
// WhatsApp/copy share message for a community post. Truth-only: just the post's
// own (clipped) words + the permalink.
// ────────────────────────────────────────────────────────────────────────────

describe("clipForShare", () => {
  it("returns short text unchanged (trimmed, whitespace-collapsed)", () => {
    expect(clipForShare("  שלום   עולם  ")).toBe("שלום עולם");
  });

  it("clips long text on a word boundary with an ellipsis", () => {
    const long = "מילה ".repeat(60).trim(); // 300 chars
    const out = clipForShare(long, 40);
    expect(out.length).toBeLessThanOrEqual(41); // <= n + ellipsis
    expect(out.endsWith("…")).toBe(true);
    expect(out).not.toContain("  "); // no dangling double space before the ellipsis
  });

  it("does not add an ellipsis when exactly at the limit", () => {
    const s = "abcategory"; // 10 chars
    expect(clipForShare(s, 10)).toBe(s);
  });
});

describe("communityShareText", () => {
  it("includes the teaser (quoted) + the url", () => {
    const t = communityShareText("איזה מסלול הכי משתלם?", "https://app.switchy-ai.com/community/post/abc");
    expect(t).toContain("קהילת חוסך");
    expect(t).toContain('"איזה מסלול הכי משתלם?"');
    expect(t).toContain("https://app.switchy-ai.com/community/post/abc");
  });

  it("degrades to just lead + url when the body is empty", () => {
    const t = communityShareText("", "https://x/y");
    expect(t).not.toContain('""');
    expect(t).toContain("https://x/y");
  });
});

describe("whatsappShareUrl", () => {
  it("builds a wa.me URL with the text URL-encoded", () => {
    const url = whatsappShareUrl("שלום https://x/y");
    expect(url.startsWith("https://wa.me/?text=")).toBe(true);
    // spaces + the URL are percent-encoded (no raw spaces / ':' left unencoded)
    expect(url).toContain("%20");
    expect(url).toContain(encodeURIComponent("https://x/y"));
    expect(url).not.toContain(" ");
  });
});
