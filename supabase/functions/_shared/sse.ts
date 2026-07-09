// ─────────────────────────────────────────────────────────────────────────────
// _shared/sse.ts — tiny, pure Server-Sent-Events helpers for the flag-gated
// streaming chat response (`site-ai-chat?stream=1`). Kept dependency-free so the
// framing + chunking logic is unit-testable without a network or Deno.serve.
//
// WHY THIS EXISTS: the buffered JSON path is unchanged and remains the DEFAULT.
// When a client opts in with `?stream=1`, the SAME computed reply is delivered as
// a sequence of `token` events (progressive reveal) followed by one `meta` event
// (offerLead / leadCaptured / sessionId …) and a final `done`. This module owns
// only the WIRE FORMAT; the compute + honesty rails live in site-ai-chat and are
// untouched. Real token-level (time-to-first-token) streaming is a later,
// live-verified upgrade that swaps the chunk SOURCE — the transport here stays.
// ─────────────────────────────────────────────────────────────────────────────

// Format ONE SSE frame: an `event:` line + a single-line JSON `data:` line +
// the blank-line terminator. JSON.stringify guarantees no raw newline sneaks into
// the data payload (which would corrupt the frame). Pure + total.
export function sseFrame(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

// Split a reply into progressive chunks for token-style delivery. Breaks ON a
// space boundary near `targetLen` so a word is never split mid-character, and —
// critically — concatenating the returned chunks reproduces the input EXACTLY
// (no character added or dropped), so the streamed text always equals the
// buffered reply. Pure + total: "" → [].
export function chunkText(text: string, targetLen = 24): string[] {
  const s = String(text ?? "");
  if (!s) return [];
  const chunks: string[] = [];
  let i = 0;
  while (i < s.length) {
    let end = Math.min(i + targetLen, s.length);
    if (end < s.length) {
      // Extend to just past the next space so we break between words, but don't
      // run away — cap the extension at another targetLen (a very long unbroken
      // token is emitted whole rather than searched to the end of the string).
      const ws = s.indexOf(" ", end);
      if (ws !== -1 && ws - end <= targetLen) end = ws + 1;
    }
    chunks.push(s.slice(i, end));
    i = end;
  }
  return chunks;
}
