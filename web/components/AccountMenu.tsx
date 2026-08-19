"use client";

// ────────────────────────────────────────────────────────────────────────────
// <AccountMenu> — the header account control (desktop only, lg+).
//
// Logged out → a "התחברות" button that opens <AuthModal>.
// Logged in  → an avatar button opening a small menu (community / my profile /
//              sign out).
//
// Hidden below lg so it never crowds the tight mobile icon cluster. That gate is
// a LAYOUT decision, not a feature gate — <AccountMobileRows> (exported below)
// carries the identical actions as plain rows inside the header's mobile
// hamburger panel, so "הפרופיל שלי" (and the <ProfileEditor> that lives on that
// route) stays reachable on a phone. Previously it did not: the only other links
// to /community/profile/[id] anywhere in the app are post bylines, so a member
// who had not posted yet could not reach their own profile on mobile at all.
//
// Both read useAuth() and render nothing until the initial session check
// resolves (no login flash).
// ────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import AuthModal from "./auth/AuthModal";

export default function AccountMenu() {
  const { ready, user, profile, signOut } = useAuth();
  const [modalOpen, setModalOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  if (!ready) return null;

  if (!user) {
    return (
      <>
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="hidden items-center gap-2 rounded-xl border border-accent/40 px-3 py-2 text-sm font-semibold text-accent-text transition-colors hover:bg-accent/[0.06] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent lg:inline-flex"
        >
          התחברות
        </button>
        <AuthModal open={modalOpen} onClose={() => setModalOpen(false)} />
      </>
    );
  }

  const displayName = profile?.name || "החשבון שלי";
  const avatar = profile?.avatar_url;
  const initial = (profile?.name || "•").trim().charAt(0).toUpperCase();

  return (
    <div ref={wrapRef} className="relative hidden lg:block">
      <button
        type="button"
        onClick={() => setMenuOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        aria-label={`חשבון: ${displayName}`}
        className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border border-border bg-accent/10 text-sm font-bold text-accent-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        {avatar ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={avatar} alt="" className="h-full w-full object-cover" />
        ) : (
          <span aria-hidden="true">{initial}</span>
        )}
      </button>
      {menuOpen && (
        <div
          role="menu"
          className="absolute end-0 top-full z-50 mt-2 min-w-48 rounded-xl border border-border bg-surface p-1.5 shadow-float"
        >
          <p className="truncate px-3 py-2 text-sm font-semibold text-ink">{displayName}</p>
          <Link
            role="menuitem"
            href="/community"
            onClick={() => setMenuOpen(false)}
            className="block rounded-lg px-3 py-2 text-sm text-foreground transition-colors hover:bg-accent/[0.06] hover:text-accent"
          >
            הקהילה
          </Link>
          <Link
            role="menuitem"
            href={`/community/profile/${user.id}`}
            onClick={() => setMenuOpen(false)}
            className="block rounded-lg px-3 py-2 text-sm text-foreground transition-colors hover:bg-accent/[0.06] hover:text-accent"
          >
            הפרופיל שלי
          </Link>
          <button
            role="menuitem"
            type="button"
            onClick={() => {
              setMenuOpen(false);
              void signOut();
            }}
            className="block w-full rounded-lg px-3 py-2 text-start text-sm text-foreground transition-colors hover:bg-accent/[0.06] hover:text-accent"
          >
            התנתקות
          </button>
        </div>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// <AccountMobileRows> — the same account actions as plain rows, for the site
// header's mobile hamburger panel (< lg). Deliberately NOT another icon in the
// header's end cluster: that row is already five 44px controls wide on a 360px
// phone and the notifications bell takes the last of the slack. A disclosure
// panel has room, so the account lives there on mobile.
//
// Renders nothing until the session resolves, so no row ever flashes the wrong
// state. Styling matches the panel's other rows (44px tap targets, hairline
// divider, logical properties for RTL).
// ────────────────────────────────────────────────────────────────────────────

export function AccountMobileRows() {
  const { ready, user, profile, signOut } = useAuth();
  const [modalOpen, setModalOpen] = useState(false);

  if (!ready) return null;

  const rowCls =
    "flex min-h-11 w-full items-center rounded-lg px-3 py-2 text-start text-sm font-medium text-foreground transition-colors hover:bg-accent/[0.06] hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

  return (
    <div className="lg:hidden">
      <p className="mt-2 border-t border-border/60 px-3 pb-1 pt-3 text-xs font-semibold text-muted">
        החשבון שלי
      </p>
      {!user ? (
        <>
          <ul className="space-y-0.5">
            <li>
              <button
                type="button"
                onClick={() => setModalOpen(true)}
                className={`${rowCls} font-semibold text-accent-text`}
              >
                התחברות
              </button>
            </li>
          </ul>
          <AuthModal open={modalOpen} onClose={() => setModalOpen(false)} />
        </>
      ) : (
        <ul className="space-y-0.5">
          <li>
            <p className="truncate px-3 py-1 text-xs text-muted">
              {profile?.name || "החשבון שלי"}
            </p>
          </li>
          <li>
            <Link href={`/community/profile/${user.id}`} className={rowCls}>
              הפרופיל שלי
            </Link>
          </li>
          <li>
            <button
              type="button"
              onClick={() => void signOut()}
              className={rowCls}
            >
              התנתקות
            </button>
          </li>
        </ul>
      )}
    </div>
  );
}
