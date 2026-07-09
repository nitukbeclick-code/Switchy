// ────────────────────────────────────────────────────────────────────────────
// safeJsonForScript — JSON.stringify() a value for embedding inside an inline
// <script> block via dangerouslySetInnerHTML.
//
// JSON.stringify escapes quotes but NOT `<`, `>`, `&`, or the U+2028/U+2029 line
// separators. Left raw, a string that contains `</script>` (e.g. a user's
// community post body embedded in a JSON-LD block) closes the script element and
// lets arbitrary markup — including an executable <script> — into the page. The
// site CSP allows 'unsafe-inline', so nothing downstream stops it: escaping here
// is the actual defence.
//
// Each substitution produces a valid JSON `\uXXXX` escape, so parsers still read
// the identical value — only the raw bytes in the served HTML change, so no
// `</script>` (or line-separator break) can survive.
// ────────────────────────────────────────────────────────────────────────────

// Match < > & and the JS-only line terminators U+2028 / U+2029. Built via
// new RegExp from an ASCII escape string so this source file stays plain ASCII.
const SCRIPT_UNSAFE = new RegExp("[<>&\\u2028\\u2029]", "g");

export function safeJsonForScript(value: unknown): string {
  return JSON.stringify(value).replace(
    SCRIPT_UNSAFE,
    (c) => "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0"),
  );
}
