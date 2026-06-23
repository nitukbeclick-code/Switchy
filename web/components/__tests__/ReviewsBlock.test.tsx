// ────────────────────────────────────────────────────────────────────────────
// <ReviewsBlock> — renders a REAL aggregate rating (+ optional individual reviews)
// and emits matching schema.org JSON-LD. The non-negotiable property is HONESTY:
//   • With a real rating it renders stars + average + the (real) review count and
//     emits AggregateRating JSON-LD attached to the right entity (Product/Org).
//   • With NO real rating and NO real reviews it renders NOTHING and emits NO
//     schema — never a fabricated rating, star, or count.
//   • Supplied individual reviews can DERIVE the aggregate (avg of real ratings),
//     and visible review bodies are capped by `maxVisible` while schema covers all.
//   • When aggregating across `plans`, no synthetic category AggregateRating schema
//     is emitted (the roll-up is visible-only).
// Pure server component — renders directly under jsdom. <JsonLd> emits a
// type="application/ld+json" <script>, which we parse to assert the structured data.
// ────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import ReviewsBlock, {
  type ReviewItem,
} from "@/components/ReviewsBlock";
import type { Plan, Provider } from "@/lib/types";

// ── Test fixtures ─────────────────────────────────────────────────────────────
// Plan carries an index signature, so rating/reviewCount ride along as real data.
function makePlan(extra: Record<string, unknown> = {}): Plan {
  return {
    id: "cel_test_1",
    cat: "cellular",
    provider: "סלקום",
    plan: "מסלול בדיקה",
    price: 39,
    after: null,
    is5G: true,
    noCommit: true,
    hasAbroad: false,
    ...extra,
  } as Plan;
}

function makeProvider(extra: Record<string, unknown> = {}): Provider {
  return {
    slug: "cellcom",
    name: "סלקום",
    categories: ["cellular"],
    planCount: 12,
    minPrice: 19,
    summary: "ספק בדיקה",
    ...extra,
  } as Provider;
}

/** Parse the single JSON-LD <script> rendered inside a container (or null). */
function readJsonLd(container: HTMLElement): Record<string, unknown> | null {
  const script = container.querySelector(
    'script[type="application/ld+json"]',
  );
  return script ? JSON.parse(script.textContent ?? "{}") : null;
}

describe("ReviewsBlock — honesty gate", () => {
  it("renders NOTHING when the subject has no real rating and no reviews", () => {
    const { container } = render(<ReviewsBlock plan={makePlan()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders NOTHING when neither plan, provider, nor plans is provided", () => {
    const { container } = render(<ReviewsBlock />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("ReviewsBlock — real aggregate from a plan", () => {
  it("renders stars, the average, and the real review count", () => {
    render(
      <ReviewsBlock plan={makePlan({ rating: 4.3, reviewCount: 1200 })} />,
    );
    const section = screen.getByRole("region", { name: "דירוג וביקורות" });
    const scoped = within(section);

    // Average is shown to one decimal; the star image is aria-labelled.
    expect(scoped.getByText("4.3")).toBeInTheDocument();
    expect(
      scoped.getByRole("img", { name: "דירוג 4.3 מתוך 5" }),
    ).toBeInTheDocument();
    // Real count, he-IL grouped, never invented.
    expect(scoped.getByText(/1,200 ביקורות/)).toBeInTheDocument();
  });

  it("emits Product AggregateRating JSON-LD with the real rating + count", () => {
    const { container } = render(
      <ReviewsBlock plan={makePlan({ rating: 4.3, reviewCount: 1200 })} />,
    );
    const ld = readJsonLd(container);
    expect(ld).toMatchObject({
      "@type": "Product",
      aggregateRating: {
        "@type": "AggregateRating",
        ratingValue: 4.3,
        reviewCount: 1200,
        ratingCount: 1200,
      },
    });
  });
});

describe("ReviewsBlock — provider subject emits Organization schema", () => {
  it("attaches the AggregateRating to an Organization for a provider", () => {
    const { container } = render(
      <ReviewsBlock provider={makeProvider({ rating: 4.0, reviewCount: 88 })} />,
    );
    const ld = readJsonLd(container);
    expect(ld).toMatchObject({
      "@type": "Organization",
      name: "סלקום",
      aggregateRating: { ratingValue: 4 },
    });
  });
});

describe("ReviewsBlock — deriving from real individual reviews", () => {
  const reviews: ReviewItem[] = [
    { author: "דנה", rating: 5, body: "שירות מצוין", date: "2026-01-02" },
    { author: "יוסי", rating: 4, body: "סביר" },
  ];

  it("derives the average + count from supplied reviews when the subject carries none", () => {
    render(<ReviewsBlock provider={makeProvider()} reviews={reviews} />);
    const section = screen.getByRole("region", { name: "דירוג וביקורות" });
    const scoped = within(section);

    // (5 + 4) / 2 = 4.5; count derives from the two real reviews.
    expect(scoped.getByText("4.5")).toBeInTheDocument();
    expect(scoped.getByText(/2 ביקורות/)).toBeInTheDocument();

    // Visible review authors + bodies render.
    expect(scoped.getByText("דנה")).toBeInTheDocument();
    expect(scoped.getByText("שירות מצוין")).toBeInTheDocument();
  });

  it("caps visible review bodies at maxVisible while keeping the aggregate", () => {
    render(
      <ReviewsBlock
        provider={makeProvider()}
        reviews={reviews}
        maxVisible={1}
      />,
    );
    const section = screen.getByRole("region", { name: "דירוג וביקורות" });
    const scoped = within(section);

    expect(scoped.getByText("דנה")).toBeInTheDocument();
    // The second review body is hidden visibly (maxVisible=1).
    expect(scoped.queryByText("יוסי")).not.toBeInTheDocument();
  });

  it("filters out reviews with a non-positive rating (honesty: only real ratings count)", () => {
    render(
      <ReviewsBlock
        provider={makeProvider()}
        reviews={[
          { author: "אמיתי", rating: 5, body: "טוב" },
          // Zero rating is not a real rating → must NOT count toward the average.
          { author: "רפאים", rating: 0 } as ReviewItem,
        ]}
      />,
    );
    const scoped = within(
      screen.getByRole("region", { name: "דירוג וביקורות" }),
    );
    // Only the one positively-rated review counts → avg 5.0, "1 ביקורות".
    expect(scoped.getByText("5.0")).toBeInTheDocument();
    expect(scoped.getByText(/1 ביקורות/)).toBeInTheDocument();
    expect(scoped.queryByText("רפאים")).not.toBeInTheDocument();
  });
});

describe("ReviewsBlock — aggregating across plans (no synthetic schema)", () => {
  it("renders the visible roll-up but emits NO category-level JSON-LD", () => {
    const { container } = render(
      <ReviewsBlock
        plans={[
          makePlan({ id: "a", rating: 4, reviewCount: 100 }),
          makePlan({ id: "b", rating: 5, reviewCount: 100 }),
          makePlan({ id: "c" }), // unrated → ignored
        ]}
        subjectName="מסלולי סלולר"
      />,
    );
    const scoped = within(
      screen.getByRole("region", { name: "דירוג וביקורות" }),
    );
    // Weighted avg of the two rated plans (equal weight) = 4.5; total count 200.
    expect(scoped.getByText("4.5")).toBeInTheDocument();
    expect(scoped.getByText(/200 ביקורות/)).toBeInTheDocument();

    // Honesty: no synthetic AggregateRating schema for a multi-plan roll-up.
    expect(readJsonLd(container)).toBeNull();
  });

  it("renders nothing when no plan in the set carries a real rating", () => {
    const { container } = render(
      <ReviewsBlock plans={[makePlan({ id: "a" }), makePlan({ id: "b" })]} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
