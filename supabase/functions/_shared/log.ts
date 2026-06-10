// Structured JSON logging — one line per event so the Supabase dashboard's
// log explorer can filter on fields instead of grepping prose.

export function jlog(fields: Record<string, unknown>): void {
  try {
    console.log(JSON.stringify({ ts: new Date().toISOString(), ...fields }));
  } catch (_) {
    console.log(String(fields.at ?? "log"), String(fields.error ?? ""));
  }
}
