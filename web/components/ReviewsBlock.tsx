// ────────────────────────────────────────────────────────────────────────────
// <ReviewsBlock> — renders a REAL aggregate rating (stars + average + count) for a
// plan or provider, and emits matching schema.org AggregateRating / Review JSON-LD
// (via <JsonLd>). Server component (no state).
//
// HONESTY (E-E-A-T — non-negotiable): this block renders ONLY real rating data.
//   • It reads `rating` / `reviewCount` defensively from the plan/provider object
//     (the catalogue carries them on some entries; lib types expose extra fields
//     via an index signature). It also accepts real individual reviews via the
//     optional `reviews` prop (e.g. provider_reviews from the backend).
//   • If there is NO real rating and NO real reviews, it renders NOTHING and emits
//     NO schema — never a fabricated rating, star count, or "reliability/speed".
//   • It never invents reviewCount: AggregateRating is emitted only with a real
//     count, and Product/Org schema is emitted with reviews only when present.
// This keeps Review/AggregateRating markup truthful and avoids fake-review risk.
// ────────────────────────────────────────────────────────────────────────────

import JsonLd from "./JsonLd";
import type { Plan, Provider } from "@/lib/types";

/** A single real review (e.g. from provider_reviews). Only real data — no fakes. */
export interface ReviewItem {
  /** Reviewer display name / author. */
  author: string;
  /** Star rating given by this reviewer (1–5). */
  rating: number;
  /** The review text (optional). */
  body?: string;
  /** ISO date the review was written (optional). */
  date?: string;
}

export interface ReviewsBlockProps {
  /** The plan being reviewed (mutually exclusive with `provider`/`plans`). */
  plan?: Plan;
  /** The provider being reviewed (mutually exclusive with `plan`/`plans`). */
  provider?: Provider;
  /**
   * A set of plans to aggregate across (e.g. a whole compare category). The
   * aggregate is computed from ONLY the plans that carry a real rating — if none
   * do, the block renders nothing (no fabricated category rating).
   */
  plans?: Plan[];
  /**
   * Human label for the subject when aggregating across `plans`
   * (e.g. "מסלולי סלולר"). Used in the heading/region label and schema name.
   */
  subjectName?: string;
  /**
   * Real individual reviews, if the caller has them (e.g. provider_reviews).
   * When supplied and non-empty, the aggregate is derived from these if the
   * subject itself carries no aggregate rating.
   */
  reviews?: ReviewItem[];
  /** Visible heading. Defaults to "דירוג וביקורות". */
  heading?: string;
  /** Max review bodies to render visibly (schema always covers all). Default 3. */
  maxVisible?: number;
  /** DOM id (anchor-/deep-link-able). Defaults to "reviews". */
  id?: string;
  /** Optional extra classes on the outer section. */
  className?: string;
}

/** Numeric coercion that only accepts finite, positive numbers. */
function posNum(value: unknown): number | null {
  const n = typeof value === "string" ? Number(value) : (value as number);
  return typeof n === "number" && Number.isFinite(n) && n > 0 ? n : null;
}

/** Read a real rating value from an object's known field aliases (or null). */
function readRating(obj: Record<string, unknown> | undefined): number | null {
  if (!obj) return null;
  return (
    posNum(obj.rating) ??
    posNum(obj.ratingValue) ??
    posNum(obj.avgRating) ??
    posNum(obj.stars) ??
    null
  );
}

/** Read a real review count from an object's known field aliases (or null). */
function readCount(obj: Record<string, unknown> | undefined): number | null {
  if (!obj) return null;
  const n =
    posNum(obj.reviewCount) ??
    posNum(obj.reviews) ??
    posNum(obj.ratingCount) ??
    posNum(obj.reviewsCount) ??
    null;
  return n != null ? Math.round(n) : null;
}

/** A 5-star glyph row reflecting `value` (rounded to half), aria-labelled. */
function Stars({ value }: { value: number }) {
  const rounded = Math.round(value * 2) / 2;
  const label = `דירוג ${value.toFixed(1)} מתוך 5`;
  return (
    <span
      role="img"
      aria-label={label}
      className="inline-flex items-center gap-0.5 text-value-text"
    >
      {[1, 2, 3, 4, 5].map((i) => {
        const fill = rounded >= i ? "full" : rounded >= i - 0.5 ? "half" : "empty";
        return (
          <span key={i} aria-hidden="true" className="text-base leading-none">
            {fill === "full" ? "★" : fill === "half" ? "⯨" : "☆"}
          </span>
        );
      })}
    </span>
  );
}

export default function ReviewsBlock({
  plan,
  provider,
  plans,
  subjectName,
  reviews,
  heading = "דירוג וביקורות",
  maxVisible = 3,
  id = "reviews",
  className,
}: ReviewsBlockProps) {
  const subject = (plan ?? provider) as Record<string, unknown> | undefined;
  const aggregating = !subject && Array.isArray(plans);
  if (!subject && !aggregating) return null;

  // Validate any supplied individual reviews to real, rated entries only.
  const realReviews: ReviewItem[] = (reviews ?? []).filter(
    (r): r is ReviewItem =>
      !!r && typeof r.author === "string" && posNum(r.rating) != null,
  );

  let ratingValue: number | null;
  let reviewCount: number | null;

  if (aggregating) {
    // Aggregate across ONLY the plans that carry a real rating. A plan with a
    // real reviewCount contributes a weighted average; otherwise it is counted
    // once. If NO plan has a real rating, this stays null → renders nothing.
    let weightedSum = 0;
    let weight = 0;
    let totalCount = 0;
    let rated = 0;
    for (const p of plans as Plan[]) {
      const r = readRating(p as Record<string, unknown>);
      if (r == null) continue;
      const c = readCount(p as Record<string, unknown>);
      const w = c ?? 1;
      weightedSum += r * w;
      weight += w;
      if (c != null) totalCount += c;
      rated += 1;
    }
    ratingValue =
      weight > 0 ? Math.round((weightedSum / weight) * 10) / 10 : null;
    reviewCount = totalCount > 0 ? totalCount : rated > 0 ? rated : null;
  } else {
    // Prefer an aggregate carried on the subject; else derive from real reviews.
    ratingValue = readRating(subject);
    reviewCount = readCount(subject);
    if (ratingValue == null && realReviews.length > 0) {
      const sum = realReviews.reduce((acc, r) => acc + r.rating, 0);
      ratingValue = Math.round((sum / realReviews.length) * 10) / 10;
    }
    if (reviewCount == null && realReviews.length > 0) {
      reviewCount = realReviews.length;
    }
  }

  // HONESTY GATE: with no real rating AND no real reviews, render nothing.
  if (ratingValue == null) return null;

  const name = plan?.plan ?? provider?.name ?? subjectName ?? "";
  const headingId = `${id}-heading`;

  // Build schema.org JSON-LD — AggregateRating only with a real count; Reviews
  // only from real, supplied review items. Never fabricate either.
  //
  // For a concrete subject (plan→Product, provider→Organization) we attach the
  // AggregateRating to that entity. When AGGREGATING across `plans`, we do NOT
  // emit a synthetic category-level AggregateRating (it would not map to a single
  // schema.org entity, and the page already emits a Product per plan) — we only
  // render the visible roll-up. This keeps the structured data strictly truthful.
  const schema: Record<string, unknown> | null = aggregating
    ? null
    : {
        "@context": "https://schema.org",
        "@type": plan ? "Product" : "Organization",
        name,
        ...(plan
          ? { brand: { "@type": "Brand", name: plan.provider }, sku: plan.id }
          : {}),
        aggregateRating: {
          "@type": "AggregateRating",
          ratingValue,
          bestRating: 5,
          worstRating: 1,
          ...(reviewCount != null
            ? { ratingCount: reviewCount, reviewCount }
            : {}),
        },
        ...(realReviews.length > 0
          ? {
              review: realReviews.map((r) => ({
                "@type": "Review",
                author: { "@type": "Person", name: r.author },
                reviewRating: {
                  "@type": "Rating",
                  ratingValue: r.rating,
                  bestRating: 5,
                  worstRating: 1,
                },
                ...(r.body ? { reviewBody: r.body } : {}),
                ...(r.date ? { datePublished: r.date } : {}),
              })),
            }
          : {}),
      };

  const visible = realReviews.slice(0, Math.max(0, maxVisible));

  return (
    <section
      id={id}
      aria-labelledby={headingId}
      data-reviews-block
      className={[
        "bento p-6 sm:p-7",
        className ?? "",
      ]
        .join(" ")
        .trim()}
    >
      {schema ? <JsonLd data={schema} /> : null}

      <h2
        id={headingId}
        className="mb-3 flex items-center gap-2.5 font-display text-base font-semibold tracking-tight text-ink"
      >
        <span
          aria-hidden="true"
          className="inline-block h-5 w-1.5 rounded-full bg-accent"
        />
        {heading}
      </h2>

      {/* Aggregate: stars + average + (real) count. */}
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <Stars value={ratingValue} />
        <span className="font-display text-2xl font-bold text-ink">
          {ratingValue.toFixed(1)}
        </span>
        <span className="text-sm text-muted">מתוך 5</span>
        {reviewCount != null ? (
          <span className="text-sm text-muted">
            ({reviewCount.toLocaleString("he-IL")} ביקורות)
          </span>
        ) : null}
      </div>

      {/* Visible real reviews, if supplied. */}
      {visible.length > 0 ? (
        <ul className="mt-4 space-y-3">
          {visible.map((r, i) => (
            <li
              key={`${r.author}-${i}`}
              className="interactive hover-lift rounded-xl border border-border/60 bg-background p-4"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-foreground">{r.author}</span>
                <Stars value={r.rating} />
                {r.date ? (
                  <time
                    dateTime={r.date}
                    className="ms-auto text-xs text-muted"
                  >
                    {r.date}
                  </time>
                ) : null}
              </div>
              {r.body ? (
                <p className="mt-2 text-[15px] leading-relaxed text-foreground">
                  {r.body}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
