// PII masking — pure, unit-tested, no I/O. The CRM shapes contact data through
// these before it leaves the edge function, so the default wire representation
// of a phone/email is MASKED. The full value is served only by the explicit,
// audited crm-api `revealContact` action (one record, one click, one audit row).
//
// The goal is not cryptographic secrecy (an admin can always reveal) but making
// BULK raw-PII exposure a deliberate, logged act instead of the default — so a
// leaked screenshot, a shoulder-surf, or a scripted list pull shows masked data.

/** Keep the last `keep` characters of a phone, mask the rest with '•' (same
 *  length, so the shape stays recognizable). Non-string / empty → "". A very
 *  short value is fully masked. Whitespace is trimmed but internal separators
 *  are preserved as-is (they are masked like any other char). */
export function maskPhone(raw: unknown, keep = 3): string {
  const v = typeof raw === "string" ? raw.trim() : raw == null ? "" : String(raw).trim();
  if (!v) return "";
  if (v.length <= keep) return "•".repeat(v.length);
  return "•".repeat(v.length - keep) + v.slice(-keep);
}

/** Mask an email's local part (keep the first char), leave the domain visible so
 *  an admin can still tell providers apart. A value with no usable "@" is treated
 *  as opaque and fully masked. null/empty → "". */
export function maskEmail(raw: unknown): string {
  const v = typeof raw === "string" ? raw.trim() : raw == null ? "" : String(raw).trim();
  if (!v) return "";
  const at = v.indexOf("@");
  if (at <= 0 || at === v.length - 1) return "•".repeat(v.length);
  const local = v.slice(0, at);
  const domain = v.slice(at + 1);
  const shownLocal = local[0] + "•".repeat(Math.max(1, local.length - 1));
  return `${shownLocal}@${domain}`;
}

/** Mask a nullable email, preserving null (so a null email stays null on the
 *  wire rather than becoming ""). */
export function maskEmailN(raw: unknown): string | null {
  if (raw == null || (typeof raw === "string" && raw.trim() === "")) return null;
  return maskEmail(raw);
}
