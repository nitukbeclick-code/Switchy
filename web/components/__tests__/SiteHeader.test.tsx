// ────────────────────────────────────────────────────────────────────────────
// <SiteHeader> — the global, sticky masthead rendered on every route. Contract:
//   • a real <header> landmark with a labelled primary <nav>,
//   • the brand wordmark links home (no dead-end),
//   • the four primary internal hubs link to their real routes,
//   • exactly one green ACTION CTA → the Zoom consultation scheduler (/book),
//   • the light/dark toggle is present (accessible <button>),
//   • the community notifications bell is mounted for a signed-in viewer AT
//     EVERY breakpoint (it is the app's only "come back, someone replied"
//     surface, and the app is used on phones),
//   • the account actions (profile → <ProfileEditor>, sign out) are reachable on
//     mobile through the hamburger panel, not only through the lg+ avatar menu.
//
// SiteHeader embeds "use client" children (TrackedCtaLink, ThemeToggle,
// AccountMenu, NotificationsBell). TrackedCtaLink's trackEvent() no-ops without
// gtag/fbq; ThemeToggle reads matchMedia (stubbed in vitest.setup.ts).
// next/navigation IS mocked: <NotificationsBell> calls useRouter(), which throws
// "invariant expected app router to be mounted" outside a real app-router tree.
// useAuth() is mocked through a mutable object so a single file can assert both
// the signed-out and signed-in headers. next/link renders a plain <a> in tests.
// ────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  auth: {
    ready: true,
    user: null as { id: string } | null,
    profile: null as { name: string | null; avatar_url: string | null } | null,
    session: null,
    signOut: vi.fn(async () => {}),
    refreshProfile: vi.fn(async () => {}),
  },
  fetchNotifications: vi.fn(async () => [] as unknown[]),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/lib/auth-context", () => ({ useAuth: () => mocks.auth }));
vi.mock("@/lib/community", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/community")>()),
  fetchNotifications: mocks.fetchNotifications,
}));

import SiteHeader from "@/components/SiteHeader";

beforeEach(() => {
  mocks.auth.ready = true;
  mocks.auth.user = null;
  mocks.auth.profile = null;
  mocks.fetchNotifications.mockResolvedValue([]);
});

describe("SiteHeader — landmarks & brand", () => {
  it("renders a banner <header> containing the labelled primary nav", () => {
    render(<SiteHeader />);
    const header = screen.getByRole("banner");
    expect(header).toBeInTheDocument();
    expect(
      within(header).getByRole("navigation", { name: "ניווט ראשי" }),
    ).toBeInTheDocument();
  });

  it("links the brand wordmark home", () => {
    render(<SiteHeader />);
    // The brand link contains the wordmark text 'Switchy'.
    const brand = screen.getByRole("link", { name: /Switchy/ });
    expect(brand).toHaveAttribute("href", "/");
  });
});

describe("SiteHeader — primary nav links resolve to real routes", () => {
  it("renders the four primary hubs pointing at their canonical paths", () => {
    render(<SiteHeader />);
    const nav = screen.getByRole("navigation", { name: "ניווט ראשי" });
    const scoped = within(nav);

    expect(scoped.getByRole("link", { name: "השוואה" })).toHaveAttribute(
      "href",
      "/compare/cellular",
    );
    expect(scoped.getByRole("link", { name: "ספקים" })).toHaveAttribute(
      "href",
      "/providers",
    );
    expect(scoped.getByRole("link", { name: "דופק השוק" })).toHaveAttribute(
      "href",
      "/market-pulse",
    );
    expect(scoped.getByRole("link", { name: "מעבר ספק" })).toHaveAttribute(
      "href",
      "/switch",
    );
  });
});

describe("SiteHeader — the single ACTION CTA + theme toggle", () => {
  it("renders the consultation CTA(s) pointing at the Zoom scheduler", () => {
    render(<SiteHeader />);
    // Two DOM nodes exist by design: the md+ masthead CTA (hidden md:inline-flex)
    // and the mobile <details> menu row. jsdom applies no responsive CSS, so both
    // render — assert every one targets /book (only one is visible per breakpoint).
    const ctas = screen.getAllByRole("link", { name: "שיחת ייעוץ בזום" });
    expect(ctas.length).toBeGreaterThanOrEqual(1);
    for (const cta of ctas) expect(cta).toHaveAttribute("href", "/book");
  });

  it("renders the accessible light/dark toggle button", () => {
    render(<SiteHeader />);
    expect(
      screen.getByRole("button", { name: "מעבר בין מצב בהיר למצב כהה" }),
    ).toBeInTheDocument();
  });
});

describe("SiteHeader — community notifications bell", () => {
  it("mounts nothing for a signed-out visitor (the bell is per-user)", () => {
    render(<SiteHeader />);
    expect(screen.queryByRole("button", { name: /התראות/ })).toBeNull();
  });

  it("mounts the bell for a signed-in viewer", async () => {
    mocks.auth.user = { id: "u1" };
    render(<SiteHeader />);
    expect(
      await screen.findByRole("button", { name: /התראות/ }),
    ).toBeInTheDocument();
  });

  it("does NOT hide the bell behind a desktop breakpoint", async () => {
    mocks.auth.user = { id: "u1" };
    render(<SiteHeader />);
    const bell = await screen.findByRole("button", { name: /התראות/ });
    // jsdom applies no responsive CSS, so assert on the utility classes: neither
    // the trigger nor any ancestor up to the <header> may carry a `hidden` that a
    // `lg:` utility later undoes — that is exactly the phone-hostile gate this
    // control must not acquire.
    const header = screen.getByRole("banner");
    for (
      let el: HTMLElement | null = bell;
      el && el !== header.parentElement;
      el = el.parentElement
    ) {
      const cls = el.className || "";
      expect(cls).not.toMatch(/(^|\s)hidden(\s|$)/);
      expect(cls).not.toMatch(/lg:hidden/);
    }
  });
});

describe("SiteHeader — account reachability on mobile", () => {
  it("offers login inside the mobile menu when signed out", () => {
    render(<SiteHeader />);
    const mobileNav = screen.getByRole("navigation", { name: "ניווט נייד" });
    expect(
      within(mobileNav).getByRole("button", { name: "התחברות" }),
    ).toBeInTheDocument();
  });

  it("links a signed-in member to their own profile from the mobile menu", async () => {
    mocks.auth.user = { id: "u1" };
    mocks.auth.profile = { name: "דנה", avatar_url: null };
    render(<SiteHeader />);
    const mobileNav = screen.getByRole("navigation", { name: "ניווט נייד" });
    // The route that hosts <ProfileEditor> — previously unreachable on a phone.
    // findBy* also lets the signed-in bell's first poll settle inside act().
    expect(
      await within(mobileNav).findByRole("link", { name: "הפרופיל שלי" }),
    ).toHaveAttribute("href", "/community/profile/u1");
    expect(
      within(mobileNav).getByRole("button", { name: "התנתקות" }),
    ).toBeInTheDocument();
  });

  it("renders no account rows until the session resolves", () => {
    mocks.auth.ready = false;
    render(<SiteHeader />);
    const mobileNav = screen.getByRole("navigation", { name: "ניווט נייד" });
    expect(within(mobileNav).queryByText("החשבון שלי")).toBeNull();
    expect(
      within(mobileNav).queryByRole("button", { name: "התחברות" }),
    ).toBeNull();
  });
});
