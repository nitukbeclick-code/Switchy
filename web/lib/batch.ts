// ────────────────────────────────────────────────────────────────────────────
// batch.ts — run an async op over many items with a bounded concurrency, so a
// bulk admin action (e.g. "mark 150 leads contacted") issues its writes in small
// waves instead of one thundering herd. Each write is still individually audited
// server-side; this only shapes the client's request pacing.
// ────────────────────────────────────────────────────────────────────────────

/**
 * Run `fn` over `items` in sequential chunks of at most `size`. Returns the count
 * of invocations that resolved truthy. A rejected `fn` counts as a failure and is
 * swallowed — the batch never throws, so one bad write can't abort the rest.
 */
export async function runChunked<T>(
  items: readonly T[],
  size: number,
  fn: (item: T) => Promise<boolean>,
): Promise<number> {
  const step = Math.max(1, Math.floor(size) || 1);
  let ok = 0;
  for (let i = 0; i < items.length; i += step) {
    const chunk = items.slice(i, i + step);
    const res = await Promise.all(chunk.map((it) => fn(it).catch(() => false)));
    ok += res.filter(Boolean).length;
  }
  return ok;
}
