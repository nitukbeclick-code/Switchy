-- ─────────────────────────────────────────────────────────────────────────────
-- Plans catalogue — admin write policy (by email allowlist)
-- ─────────────────────────────────────────────────────────────────────────────
-- The original policy (20260616_plans_table.sql) gated writes on a custom JWT
-- 'role' = 'admin' claim, which the app never sets. The app's admins are an
-- email allowlist (AppState.adminEmails), and a real (non-anonymous) login
-- carries the email in the JWT. This replaces the policy so those admins can
-- edit prices from the in-app price manager. Anonymous sessions (no email
-- claim) and everyone else remain read-only; SELECT stays public.
--
-- Keep this list in sync with AppState.adminEmails.

drop policy if exists "Only admins can modify plans" on public.plans;

create policy "Admins (by email) can modify plans"
  on public.plans for all
  using (
    auth.jwt() ->> 'email' = any (array[
      'uziel10@gmail.com',
      'inbal2526@gmail.com',
      'arielgabayyy@gmail.com',
      'nitukbeclick@gmail.com'
    ])
  )
  with check (
    auth.jwt() ->> 'email' = any (array[
      'uziel10@gmail.com',
      'inbal2526@gmail.com',
      'arielgabayyy@gmail.com',
      'nitukbeclick@gmail.com'
    ])
  );
