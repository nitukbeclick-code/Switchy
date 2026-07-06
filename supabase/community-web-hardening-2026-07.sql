-- ─────────────────────────────────────────────────────────────────────────────
-- community-web-hardening-2026-07.sql  (2026-07-06)
--
-- Closes two security holes found by a live DB audit of the shipped web community.
-- BOTH are gated on owner "מאשר פריסה" — do NOT apply until approved. Additive,
-- idempotent, reversible. Apply as two MCP migrations:
--   profiles_lock_privileged_columns_2026_07
--   community_media_drop_anon_upload_and_cap_2026_07
-- ─────────────────────────────────────────────────────────────────────────────

-- ══ FIX 1 — profile privilege-escalation (CRITICAL) ══════════════════════════
-- The `authenticated` role held a TABLE-WIDE update grant on public.profiles, and
-- RLS (profiles_update_own) is row-level only. So any logged-in member could send
--   update profiles set is_admin=true          where id = auth.uid()
--   update profiles set is_verified_customer=true …
-- and self-promote to admin / self-award the "verified customer" trust badge, or
-- rewrite their own consent/registration audit trail (Amendment-13 / §30A integrity).
--
-- None of these privileged columns are EVER written by a browser/app client:
--   • the profile row is created by the SECURITY DEFINER trigger handle_new_user;
--   • consent (consent_version/*_accepted_at) is recorded via the signup RPC +
--     the service-role /api/lead route;  • registration_ip is set server-side;
--   • is_admin / is_verified_customer are staff/back-office only.
-- So we swap the table-wide grant for a whitelist of the genuinely user-editable
-- columns (verified against web/lib/community.ts updateMyProfile + the Flutter
-- upsertProfile/upsertBills/upsertQuiz/setRenewalReminder paths). increment_savings
-- stays an RPC, so total_savings is intentionally NOT user-updatable.

revoke update on public.profiles from authenticated;

grant update (
  name,
  avatar_url,
  community_notify_opt_out,
  phone,
  email,
  bills,
  quiz,
  renewal_reminders,
  updated_at
) on public.profiles to authenticated;

-- Rollback (if ever needed):  grant update on public.profiles to authenticated;

-- ══ FIX 2 — anonymous / cross-folder storage upload (HIGH) ═══════════════════
-- The bucket had an extra INSERT policy "community media anon upload" granted to
-- BOTH anon and authenticated with check only (bucket_id = 'community-media') — no
-- auth requirement and no <uid>/ folder match. Since the bucket is PUBLIC, an
-- anonymous client with the publishable key could dump arbitrary files (any size,
-- any MIME) into the brand's bucket. The correct per-user policy
-- (community_media_insert_own = own <uid>/ folder, authenticated only) already
-- exists, so dropping the permissive one loses no legitimate capability.

drop policy if exists "community media anon upload" on storage.objects;

-- Backstop the bucket with a size cap + media-only MIME allow-list. The web client
-- already caps image 8MB / audio 12MB / video 60MB and always sets a real
-- image|audio|video contentType (web/lib/media-upload.ts), so wildcards + a 64MB
-- ceiling reject abuse without breaking any real upload.
update storage.buckets
   set file_size_limit    = 67108864,  -- 64 MB (client max is 60MB video)
       allowed_mime_types = array['image/*', 'audio/*', 'video/*']
 where id = 'community-media';

-- Rollback:  update storage.buckets set file_size_limit=null,
--            allowed_mime_types=null where id='community-media';
--            (and, only if you truly need anon uploads, recreate the policy.)

-- ══ FIX 3 — trigger function needlessly exposed as an RPC (LOW / advisor) ═════
-- Supabase's linter flags that public.community_rate_limit() — a BEFORE-INSERT
-- trigger function — is also reachable as POST /rest/v1/rpc/community_rate_limit by
-- anon + authenticated. It can't do anything useful outside a trigger (it reads
-- NEW / TG_TABLE_NAME), but a trigger function should never be a public RPC.
-- Revoke EXECUTE; the triggers keep working (they run as the table owner).
revoke execute on function public.community_rate_limit() from public, anon, authenticated;
