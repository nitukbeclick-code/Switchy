// ────────────────────────────────────────────────────────────────────────────
// <AuthModal> — the ONE thing that cannot be allowed to regress: the overlay
// must escape its parent's stacking/containing context.
//
// WHY THIS FILE EXISTS. The modal is `position: fixed; inset: 0`, which reads as
// "always full viewport" — and is not. A non-`none` `backdrop-filter` on ANY
// ancestor makes that ancestor the containing block for fixed-position
// descendants. The site header's mobile panel carries `backdrop-blur`, so when
// the mobile account rows rendered <AuthModal> inside it, the full-screen login
// overlay collapsed into the dropdown.
//
// Measured in Chromium before the fix, same markup, only the blur differing:
//     panel WITHOUT backdrop-filter → overlay 1024x768  (correct, viewport)
//     panel WITH    backdrop-filter → overlay  272x16   (trapped in the panel)
//
// jsdom does not lay out, so no assertion here can see those boxes. What jsdom
// CAN prove is the property that makes the trap impossible: the overlay is not a
// descendant of the container it was rendered from. That is what these tests
// pin. If someone removes the portal, the layout bug returns silently in every
// browser and loudly right here.
// ────────────────────────────────────────────────────────────────────────────

import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import AuthModal from "@/components/auth/AuthModal";

vi.mock("@/lib/supabase-browser", () => ({
  SUPABASE_CONFIGURED: false,
  getBrowserSupabase: () => ({
    auth: { signInWithPassword: vi.fn(), signUp: vi.fn(), signInWithOAuth: vi.fn() },
    from: () => ({ update: () => ({ eq: vi.fn() }) }),
    rpc: vi.fn(),
  }),
}));

describe("AuthModal escapes its parent container", () => {
  it("renders nothing when closed", () => {
    const { container } = render(<AuthModal open={false} onClose={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("does NOT render inside the element it was mounted from", () => {
    // The container React gives us stands in for the header's backdrop-blurred
    // dropdown. A portalled overlay leaves it empty.
    const { container } = render(<AuthModal open onClose={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders under document.body instead", () => {
    render(<AuthModal open onClose={() => {}} />);
    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeInTheDocument();

    // Walk up from the dialog: the overlay's own parent must be <body>, so no
    // application element can ever become its containing block.
    const overlay = dialog.closest(".fixed");
    expect(overlay, "the fixed overlay wrapper was not found").toBeTruthy();
    expect(overlay!.parentElement).toBe(document.body);
  });
});
