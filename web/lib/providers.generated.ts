// AUTO-GENERATED from web/data/catalogue.json (community catalog-link registry).
// Regenerate when the catalogue provider set changes. Client-safe: pure data, NO fs
// (unlike lib/data.ts). Slugs match lib/data.ts providerSlug() exactly.

export interface ProviderRef {
  slug: string;
  name: string;
}

/** Every catalogue provider (name → /providers/<slug>), longest-name-first so a
 *  greedy scan matches the most specific name. */
export const PROVIDER_REGISTRY: readonly ProviderRef[] = [
  { slug: "walla-mobile", name: "וואלה מובייל" },
  { slug: "airalo-esim", name: "Airalo eSIM" },
  { slug: "golan", name: "גולן טלקום" },
  { slug: "hot-mobile", name: "הוט מובייל" },
  { slug: "019mobile", name: "019 מובייל" },
  { slug: "sting-tv", name: "STING TV" },
  { slug: "rami-levy", name: "רמי לוי" },
  { slug: "pelephone", name: "פלאפון" },
  { slug: "xphone", name: "Xphone" },
  { slug: "nexttv", name: "NextTV" },
  { slug: "cellcom", name: "סלקום" },
  { slug: "partner", name: "פרטנר" },
  { slug: "wecom", name: "WeCom" },
  { slug: "gilat", name: "גילת" },
  { slug: "bezeq", name: "בזק" },
  { slug: "hot", name: "HOT" },
  { slug: "ccc", name: "CCC" },
  { slug: "yes", name: "yes" },
] as const;

const BY_SLUG = new Map(PROVIDER_REGISTRY.map((p) => [p.slug, p]));
const BY_NAME = new Map(PROVIDER_REGISTRY.map((p) => [p.name, p]));

export function providerBySlug(slug: string): ProviderRef | undefined {
  return BY_SLUG.get(slug);
}
export function providerByName(name: string): ProviderRef | undefined {
  return BY_NAME.get(name.trim());
}

/** Find catalogue-provider names inside free text. Longest-first, non-overlapping.
 *  `skip` ranges (e.g. @mention spans) are never matched inside. Returns the match
 *  spans so the caller can linkify only those slices (never mutating the text). */
export function matchProviders(
  text: string,
  skip: { start: number; end: number }[] = [],
): { name: string; slug: string; start: number; end: number }[] {
  const out: { name: string; slug: string; start: number; end: number }[] = [];
  const taken: boolean[] = new Array(text.length).fill(false);
  for (const s of skip) {
    for (let i = Math.max(0, s.start); i < Math.min(text.length, s.end); i++) taken[i] = true;
  }
  for (const p of PROVIDER_REGISTRY) {
    if (!p.name) continue;
    let from = 0;
    let idx = text.indexOf(p.name, from);
    while (idx !== -1) {
      const end = idx + p.name.length;
      let free = true;
      for (let i = idx; i < end; i++) {
        if (taken[i]) { free = false; break; }
      }
      // Require a non-letter boundary on each side so we do not match inside a word.
      const before = idx === 0 ? "" : text[idx - 1];
      const after = end >= text.length ? "" : text[end];
      const wordChar = /[A-Za-z0-9_֐-׿]/;
      const boundedOk = !(wordChar.test(before) || wordChar.test(after));
      if (free && boundedOk) {
        out.push({ name: p.name, slug: p.slug, start: idx, end });
        for (let i = idx; i < end; i++) taken[i] = true;
      }
      from = end;
      idx = text.indexOf(p.name, from);
    }
  }
  return out.sort((a, b) => a.start - b.start);
}
