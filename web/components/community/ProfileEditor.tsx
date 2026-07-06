"use client";

// ────────────────────────────────────────────────────────────────────────────
// <ProfileEditor> — edit the signed-in user's community identity.
//
// Lets a logged-in user change their display name + avatar (uploaded to the
// community-media bucket via uploadMedia) and toggle their reply/mention
// notification opt-out. Saves through updateMyProfile, then refreshes the shared
// auth profile so every mounted community surface (composer author, post cards)
// picks up the new name/photo. Client-only; imports ONLY from the typed data
// layer + auth context — never touches Supabase directly.
// ────────────────────────────────────────────────────────────────────────────

import { useEffect, useId, useRef, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { updateMyProfile } from "@/lib/community";
import { uploadMedia, validateMedia } from "@/lib/media-upload";

const MAX_NAME = 40;

export interface ProfileEditorProps {
  /** Called after a successful save (e.g. to close a sheet / re-render a header). */
  onSaved?: () => void;
}

export default function ProfileEditor({ onSaved }: ProfileEditorProps) {
  const { user, profile, refreshProfile } = useAuth();

  const [name, setName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [optOut, setOptOut] = useState(false);

  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const nameInputRef = useRef<HTMLInputElement | null>(null);
  const errorId = useId();

  // The name field is the offender when there's an error and the name is empty
  // (the "נא להזין שם תצוגה." validation). Only then do we associate the error
  // <p> with the input and mark it invalid.
  const nameHasError = Boolean(error) && !name.trim();

  // Seed the form from the current profile once it's available, and re-seed if the
  // signed-in user changes. Local edits win until the next profile identity change.
  useEffect(() => {
    setName(profile?.name ?? "");
    setAvatarUrl(profile?.avatar_url ?? null);
    setOptOut(profile?.community_notify_opt_out ?? false);
    setSaved(false);
    setError(null);
  }, [profile?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!user) {
    return (
      <div className="rounded-2xl border border-border bg-surface p-6 text-center shadow-float">
        <p className="text-sm text-muted">
          התחברו כדי לערוך את הפרופיל שלכם.
        </p>
      </div>
    );
  }

  async function onPickAvatar(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    // Allow re-picking the same file later.
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (!file) return;
    if (!user) return;

    setError(null);
    setSaved(false);

    const v = validateMedia({ type: file.type, size: file.size });
    if (!v.ok) {
      setError(v.error);
      return;
    }
    if (v.kind !== "image") {
      setError("נא לבחור קובץ תמונה.");
      return;
    }

    setUploading(true);
    try {
      const media = await uploadMedia(user.id, file);
      setAvatarUrl(media.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "העלאת התמונה נכשלה. נסו שוב.");
    } finally {
      setUploading(false);
    }
  }

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    if (!user || saving || uploading) return;

    const trimmed = name.trim().slice(0, MAX_NAME);
    if (!trimmed) {
      setError("נא להזין שם תצוגה.");
      // Move focus to the offending field so the role="alert" is heard in context.
      nameInputRef.current?.focus();
      return;
    }

    setError(null);
    setSaved(false);
    setSaving(true);
    try {
      const ok = await updateMyProfile(user.id, {
        name: trimmed,
        avatar_url: avatarUrl ?? "",
        community_notify_opt_out: optOut,
      });
      if (!ok) {
        setError("שמירת הפרופיל נכשלה. נסו שוב בעוד רגע.");
        return;
      }
      await refreshProfile();
      setSaved(true);
      onSaved?.();
    } catch {
      setError("שמירת הפרופיל נכשלה. נסו שוב בעוד רגע.");
    } finally {
      setSaving(false);
    }
  }

  const initial = (name.trim() || "מ").charAt(0);
  const busy = saving || uploading;

  return (
    <form
      onSubmit={onSave}
      aria-labelledby="profile-editor-heading"
      className="rounded-2xl border border-border bg-surface p-6 shadow-float sm:p-7"
      noValidate
    >
      <h3
        id="profile-editor-heading"
        className="font-display text-lg font-bold tracking-tight text-ink"
      >
        עריכת הפרופיל
      </h3>
      <p className="mt-1 text-sm text-muted">
        השם והתמונה שיוצגו לצד ההודעות שלכם בקהילה.
      </p>

      {/* Avatar */}
      <div className="mt-6 flex items-center gap-4">
        <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-full border border-border bg-background">
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={avatarUrl}
              alt="תמונת הפרופיל שלכם"
              className="h-full w-full object-cover"
            />
          ) : (
            <span
              aria-hidden="true"
              className="flex h-full w-full items-center justify-center text-2xl font-bold text-muted"
            >
              {initial}
            </span>
          )}
        </div>

        <div className="min-w-0">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={busy}
            className="interactive rounded-xl border border-border bg-background px-4 py-2 text-sm font-medium text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50 [@media(hover:hover)_and_(pointer:fine)]:hover:bg-border/60"
          >
            {uploading ? "מעלה…" : avatarUrl ? "החלפת תמונה" : "העלאת תמונה"}
          </button>
          {avatarUrl && (
            <button
              type="button"
              onClick={() => {
                setAvatarUrl(null);
                setSaved(false);
              }}
              disabled={busy}
              className="ms-2 interactive rounded-xl px-3 py-2 text-sm font-medium text-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50 [@media(hover:hover)_and_(pointer:fine)]:hover:text-foreground"
            >
              הסרה
            </button>
          )}
          <p className="mt-1.5 text-xs text-muted">תמונה בלבד, עד 8MB.</p>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={onPickAvatar}
            aria-label="בחירת תמונת פרופיל"
          />
        </div>
      </div>

      {/* Display name */}
      <div className="mt-6">
        <label
          htmlFor="profile-name"
          className="mb-1 block text-sm font-medium text-foreground"
        >
          שם תצוגה
        </label>
        <input
          id="profile-name"
          ref={nameInputRef}
          type="text"
          value={name}
          maxLength={MAX_NAME}
          autoComplete="name"
          onChange={(e) => {
            setName(e.target.value);
            setSaved(false);
          }}
          aria-required="true"
          aria-invalid={nameHasError ? "true" : "false"}
          aria-describedby={nameHasError ? errorId : undefined}
          className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-foreground outline-none focus:border-accent focus:ring-2 focus:ring-accent/30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        />
        <p className="mt-1 text-xs text-muted">
          {name.trim().length}/{MAX_NAME} תווים
        </p>
      </div>

      {/* Notification opt-out */}
      <div className="mt-6 flex items-start gap-3">
        <input
          id="profile-notify-opt-out"
          type="checkbox"
          checked={optOut}
          onChange={(e) => {
            setOptOut(e.target.checked);
            setSaved(false);
          }}
          className="mt-0.5 h-4 w-4 shrink-0 rounded border-border text-accent accent-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        />
        <label
          htmlFor="profile-notify-opt-out"
          className="cursor-pointer text-sm leading-snug text-foreground"
        >
          להשתיק התראות בתוך האתר (הפעמון) על אזכורים בקהילה.
          <span className="mt-0.5 block text-xs text-muted">
            תוכלו לשנות זאת בכל עת.
          </span>
        </label>
      </div>

      {/* Status */}
      {error && (
        <p id={errorId} role="alert" className="mt-4 text-sm text-danger-text">
          {error}
        </p>
      )}
      {saved && !error && (
        <p role="status" aria-live="polite" className="mt-4 text-sm text-accent-text">
          הפרופיל נשמר.
        </p>
      )}

      {/* Save */}
      <div className="mt-6">
        <button
          type="submit"
          disabled={busy}
          aria-disabled={busy}
          className="interactive w-full rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-accent-contrast shadow-[var(--glow-accent)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50 [@media(hover:hover)_and_(pointer:fine)]:hover:bg-accent-hover"
        >
          {saving ? "שומר…" : "שמירת פרופיל"}
        </button>
      </div>
    </form>
  );
}
