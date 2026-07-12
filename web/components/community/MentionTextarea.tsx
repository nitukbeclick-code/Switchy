"use client";

// ────────────────────────────────────────────────────────────────────────────
// <MentionTextarea> — a controlled <textarea> with @mention autocomplete.
//
// A drop-in for the community composers: as the author types "@" + a prefix at the
// caret, it queries public profiles (searchMentionCandidates — RLS-safe, read-only)
// and shows a keyboard-navigable listbox of ONLY resolvable single-token names, so a
// picked mention always actually notifies (matches the community-notify grammar).
// Selecting replaces the active @token with "@name ".
//
// Design: premium-2026 tokens only, RTL logical props, dark-mode via tokens, a real
// role="listbox" with role="option" items, aria-activedescendant + aria-controls,
// visible focus rings, reduced-motion safe. No Supabase here — data via lib/community.
// ────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { searchMentionCandidates, type MentionCandidate } from "@/lib/community";

type NativeProps = Omit<
  React.TextareaHTMLAttributes<HTMLTextAreaElement>,
  "value" | "onChange"
>;

export interface MentionTextareaProps extends NativeProps {
  value: string;
  onChange: (value: string) => void;
}

/** The @token being typed immediately before the caret, or null. `start` is the
 *  index of the "@". Only fires when the "@" begins a token (start-of-text or a
 *  non-mention char before it) so emails / mid-word "@" don't trigger it. */
function activeMentionAt(text: string, caret: number): { query: string; start: number } | null {
  const upto = text.slice(0, caret);
  const m = upto.match(/(?:^|[^A-Za-z0-9_@֐-׿])@([A-Za-z0-9_֐-׿]*)$/);
  if (!m) return null;
  const query = m[1];
  return { query, start: caret - query.length - 1 };
}

export default function MentionTextarea({ value, onChange, ...rest }: MentionTextareaProps) {
  const ref = useRef<HTMLTextAreaElement | null>(null);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<MentionCandidate[]>([]);
  const [active, setActive] = useState(0);
  // Flip the listbox ABOVE the textarea when there isn't room below (e.g. a
  // composer near the bottom of the viewport), so options are never clipped.
  const [openUp, setOpenUp] = useState(false);
  // The @token currently being completed (position in the text).
  const tokenRef = useRef<{ query: string; start: number } | null>(null);
  const seqRef = useRef(0); // guards out-of-order async results
  const listId = useId();

  const close = useCallback(() => {
    setOpen(false);
    setItems([]);
    tokenRef.current = null;
  }, []);

  // Recompute the active @token from the current caret and (debounced) fetch.
  const refresh = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const tok = activeMentionAt(el.value, el.selectionStart ?? el.value.length);
    tokenRef.current = tok;
    if (!tok || tok.query.length < 1) {
      close();
      return;
    }
    const seq = ++seqRef.current;
    void searchMentionCandidates(tok.query, 6).then((cands) => {
      if (seq !== seqRef.current) return; // a newer keystroke superseded this
      setItems(cands);
      setActive(0);
      // Decide the flip at open time: not enough space below AND more above → up.
      const anchor = ref.current;
      if (cands.length > 0 && anchor && typeof window !== "undefined") {
        const rect = anchor.getBoundingClientRect();
        const spaceBelow = window.innerHeight - rect.bottom;
        setOpenUp(spaceBelow < 240 && rect.top > spaceBelow);
      }
      setOpen(cands.length > 0);
    });
  }, [close]);

  // Debounce refresh after value changes.
  useEffect(() => {
    const t = setTimeout(refresh, 120);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const pick = useCallback(
    (cand: MentionCandidate) => {
      const el = ref.current;
      const tok = tokenRef.current;
      if (!el || !tok) return;
      const caret = el.selectionStart ?? value.length;
      const before = value.slice(0, tok.start);
      const after = value.slice(caret);
      const insert = `@${cand.name} `;
      const next = before + insert + after;
      onChange(next);
      close();
      // Restore the caret just after the inserted mention (next tick, post-render).
      const pos = before.length + insert.length;
      requestAnimationFrame(() => {
        el.focus();
        try {
          el.setSelectionRange(pos, pos);
        } catch {
          /* ignore */
        }
      });
    },
    [value, onChange, close],
  );

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (!open || items.length === 0) return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActive((i) => (i + 1) % items.length);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActive((i) => (i - 1 + items.length) % items.length);
      } else if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        pick(items[active]);
      } else if (e.key === "Escape") {
        e.preventDefault();
        close();
      }
    },
    [open, items, active, pick, close],
  );

  return (
    <div className="relative">
      <textarea
        {...rest}
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          onKeyDown(e);
          rest.onKeyDown?.(e);
        }}
        onBlur={(e) => {
          // Let a click on an option land first, then close.
          setTimeout(() => close(), 120);
          rest.onBlur?.(e);
        }}
        role="combobox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-autocomplete="list"
        aria-activedescendant={open && items[active] ? `${listId}-${active}` : undefined}
      />

      {open && items.length > 0 && (
        <ul
          id={listId}
          role="listbox"
          aria-label="הצעות לאזכור"
          className={`popover absolute z-30 max-h-56 w-64 max-w-full overflow-auto rounded-2xl border border-border bg-surface p-1 shadow-float ${
            openUp ? "bottom-full mb-1" : "mt-1"
          }`}
          style={{
            ["--popover-origin" as string]: openUp ? "bottom start" : "top start",
          }}
        >
          {items.map((c, i) => (
            <li key={c.id} role="none">
              <button
                type="button"
                role="option"
                id={`${listId}-${i}`}
                aria-selected={i === active}
                // onMouseDown (not onClick) so it fires before the textarea blur.
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(c);
                }}
                onMouseEnter={() => setActive(i)}
                className={`flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-start text-sm transition-colors ${
                  i === active ? "bg-accent/10 text-accent-text" : "text-foreground hover:bg-accent/10"
                }`}
              >
                {c.avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={c.avatar_url}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    className="h-6 w-6 shrink-0 rounded-full border border-border object-cover"
                  />
                ) : (
                  <span
                    aria-hidden="true"
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent/15 text-xs font-semibold text-accent-text"
                  >
                    {c.name.charAt(0)}
                  </span>
                )}
                <span className="truncate">@{c.name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
