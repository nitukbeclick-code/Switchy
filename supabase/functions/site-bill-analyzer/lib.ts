// Pure, dependency-free helpers for site-bill-analyzer, split out of index.ts so
// they can be unit-tested without booting the Deno.serve entrypoint (mirrors the
// whatsapp-webhook/intents.ts convention). No network, no env, no I/O.

export type Extracted = { provider: string; monthly: number; category: string; confidence: number };

// Parse "data:image/png;base64,AAAA…" or raw base64. Returns mimeType + the
// bare base64 payload (no prefix) so Gemini's inlineData gets clean bytes.
export function parseImage(input: string): { mimeType: string; data: string } | null {
  const s = (input ?? "").trim();
  if (!s) return null;
  const m = s.match(/^data:([^;,]+)(?:;base64)?,(.*)$/s);
  if (m) {
    const mimeType = m[1] || "image/jpeg";
    const data = m[2].replace(/\s/g, "");
    if (!data) return null;
    return { mimeType, data };
  }
  // Raw base64 (no data-URL wrapper) — assume jpeg, the most common camera output.
  const data = s.replace(/\s/g, "");
  if (!/^[A-Za-z0-9+/=]+$/.test(data.slice(0, 64))) return null;
  return { mimeType: "image/jpeg", data };
}

// Gemini is asked for raw JSON, but be defensive: strip ```json fences and pull
// the first {...} block if it wrapped the object in prose anyway. Coerce a
// non-finite monthly/confidence (NaN, missing) to 0 so downstream math is safe.
export function parseExtraction(raw: string): Extracted | null {
  let s = (raw ?? "").trim();
  if (!s) return null;
  s = s.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  if (!s.startsWith("{")) {
    const i = s.indexOf("{");
    const k = s.lastIndexOf("}");
    if (i >= 0 && k > i) s = s.slice(i, k + 1);
  }
  try {
    const o = JSON.parse(s) as Record<string, unknown>;
    const monthly = Number(o.monthly);
    const confidence = Number(o.confidence);
    return {
      provider: String(o.provider ?? "").slice(0, 80),
      monthly: Number.isFinite(monthly) ? monthly : 0,
      category: String(o.category ?? "").slice(0, 40),
      confidence: Number.isFinite(confidence) ? confidence : 0,
    };
  } catch (_) {
    return null;
  }
}
