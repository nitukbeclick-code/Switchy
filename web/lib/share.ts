// Pure share-link helpers for the community. No DOM here — the caller (a client
// component) passes the already-absolute URL, read from window.location.origin at
// runtime. Truth-only: a share message is just the post's own words + the link.

/** Clip text to `n` chars on a whitespace boundary, with an ellipsis. */
export function clipForShare(s: string, n = 140): string {
  const t = (s ?? "").replace(/\s+/g, " ").trim();
  if (t.length <= n) return t;
  const cut = t.slice(0, n - 1);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > n * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd() + "…";
}

/** The WhatsApp/native share message for a community post: a short teaser (the
 *  post's own clipped body) + the permalink. No fabrication — only the real text. */
export function communityShareText(body: string, url: string): string {
  const teaser = clipForShare(body, 140);
  const lead = "מצאתי דיון מעניין בקהילת חוסך";
  return teaser ? `${lead}:\n"${teaser}"\n${url}` : `${lead}:\n${url}`;
}

/** wa.me share URL — opens WhatsApp with the text prefilled; WhatsApp auto-links
 *  any URL inside the text. Works on mobile (app) and desktop (WhatsApp Web). */
export function whatsappShareUrl(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}
