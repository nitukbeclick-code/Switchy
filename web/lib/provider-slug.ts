// Provider URL slugs live in a client-safe module so brand components and
// interactive comparison views never pull the filesystem-backed catalogue into
// the browser bundle.

const SLUG_OVERRIDES: Readonly<Record<string, string>> = {
  סלקום: "cellcom",
  פרטנר: "partner",
  פלאפון: "pelephone",
  "גולן טלקום": "golan",
  "הוט מובייל": "hot-mobile",
  "רמי לוי": "rami-levy",
  "וואלה מובייל": "walla-mobile",
  בזק: "bezeq",
  גילת: "gilat",
  "019 מובייל": "019mobile",
};

export function providerSlug(name: string): string {
  const trimmed = (name ?? "").trim();
  if (SLUG_OVERRIDES[trimmed]) return SLUG_OVERRIDES[trimmed];

  const ascii = trimmed
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (ascii) return ascii;

  let hash = 0;
  for (let i = 0; i < trimmed.length; i++) {
    hash = (hash * 31 + trimmed.charCodeAt(i)) >>> 0;
  }
  return `p-${hash.toString(36)}`;
}
