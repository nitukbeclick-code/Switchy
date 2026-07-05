"use client";

// ────────────────────────────────────────────────────────────────────────────
// <AuthProvider> + useAuth() — the app-wide auth/session/profile context.
//
// Mounted once in app/layout.tsx around the header + page content. Tracks the
// Supabase session (via onAuthStateChange) and loads the matching public.profiles
// row (display name, avatar, admin/verified/opt-out flags). Everything community-
// related reads `useAuth()` to know who the user is and to gate posting on a real
// session. Fail-soft: with no Supabase env, it resolves `ready` with a null user so
// the community renders in read-only mode instead of throwing.
// ────────────────────────────────────────────────────────────────────────────

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import { getBrowserSupabase, SUPABASE_CONFIGURED } from "./supabase-browser";

/** The subset of public.profiles the community UI needs. */
export interface Profile {
  id: string;
  name: string | null;
  avatar_url: string | null;
  is_admin: boolean | null;
  is_verified_customer: boolean | null;
  community_notify_opt_out: boolean | null;
}

interface AuthState {
  /** true once the initial session check has resolved (avoids a login flash). */
  ready: boolean;
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

// A safe default so components that read useAuth() OUTSIDE the provider (e.g. a
// unit test rendering <SiteHeader> in isolation, or any future standalone mount)
// get a resolved, signed-out state instead of throwing. The real provider below
// always overrides this.
const DEFAULT_AUTH: AuthState = {
  ready: true,
  session: null,
  user: null,
  profile: null,
  signOut: async () => {},
  refreshProfile: async () => {},
};

const AuthContext = createContext<AuthState>(DEFAULT_AUTH);

const PROFILE_COLS =
  "id,name,avatar_url,is_admin,is_verified_customer,community_notify_opt_out";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);

  const loadProfile = useCallback(async (u: User | null) => {
    if (!u) {
      setProfile(null);
      return;
    }
    try {
      const sb = getBrowserSupabase();
      let { data } = await sb
        .from("profiles")
        .select(PROFILE_COLS)
        .eq("id", u.id)
        .maybeSingle();

      // First-load backfill: Google/Facebook (and email metadata) carry a display
      // name + avatar; copy them into the profile if it has none, so the community
      // always has a name/photo to show. RLS lets a user patch only their own row.
      if (data) {
        const meta = (u.user_metadata ?? {}) as Record<string, unknown>;
        const metaName = String(meta.full_name ?? meta.name ?? "").trim();
        const metaAvatar = String(meta.avatar_url ?? meta.picture ?? "").trim();
        const patch: Record<string, string> = {};
        if (!data.name && metaName) patch.name = metaName;
        if (!data.avatar_url && metaAvatar) patch.avatar_url = metaAvatar;
        if (Object.keys(patch).length > 0) {
          const { data: updated } = await sb
            .from("profiles")
            .update(patch)
            .eq("id", u.id)
            .select(PROFILE_COLS)
            .maybeSingle();
          if (updated) data = updated;
        }
      }
      setProfile((data as Profile) ?? null);
    } catch {
      setProfile(null);
    }
  }, []);

  useEffect(() => {
    if (!SUPABASE_CONFIGURED) {
      setReady(true);
      return;
    }
    const sb = getBrowserSupabase();
    let active = true;

    sb.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      void loadProfile(data.session?.user ?? null);
      setReady(true);
    });

    const { data: sub } = sb.auth.onAuthStateChange((_event, sess) => {
      setSession(sess);
      void loadProfile(sess?.user ?? null);
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [loadProfile]);

  const signOut = useCallback(async () => {
    try {
      await getBrowserSupabase().auth.signOut();
    } catch {
      /* ignore — clear local state regardless */
    }
    setSession(null);
    setProfile(null);
  }, []);

  const refreshProfile = useCallback(
    () => loadProfile(session?.user ?? null),
    [loadProfile, session],
  );

  return (
    <AuthContext.Provider
      value={{
        ready,
        session,
        user: session?.user ?? null,
        profile,
        signOut,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  return useContext(AuthContext);
}
