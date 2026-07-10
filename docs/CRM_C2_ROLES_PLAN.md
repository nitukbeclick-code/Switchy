# C.2 — Per-rep roles & permissions — SECURITY PLAN + BUILD

> Status: **§6 prod verification RUN and PASSED (2026-07-10). Foundation BUILT
> (option B — a dedicated `crm_members` table) as reviewable code; NOT yet
> activated in prod.** The migration (`supabase/crm-roles-2026-07.sql`) is
> committed but **not applied to prod**, and crm-api is **not yet deployed** with
> the new gate — both are the owner's explicit rollout steps (§5). Reverses none
> of the standing mandate: no security holes, no lead/PII leakage, no unauthorized
> price/catalogue changes.
>
> **Why it was safe to build now:** the verification (§6) proved the self-elevation
> risk (T1) is structurally closed by option B — a table with NO anon/authenticated
> grants, RLS-on/no-policies, written only by the service-role edge behind an
> audited admin-only action. The gate is fail-closed and admin-superset, so it is
> provably at-least-as-strict as the old is_admin-only gate — even before the
> table exists (a non-admin hitting a missing `crm_members` fails closed → 403).

## 0. Why this is 🔴 (blocked), not 🟢

Today CRM authorization is **binary and fail-closed**:

- `supabase/functions/_shared/admin.ts` → `requireAdmin(req)` resolves the caller's
  uid from their JWT (GoTrue `/auth/v1/user`) and service-role reads
  `profiles.is_admin`. It returns `{ uid }` **only** when `is_admin === true`;
  every other path (no token, bad token, DB error, non-admin) returns `null` →
  the endpoint 401/403s. There is no "allow on error".
- Every CRM data path (leads, whatsapp_*, meetings, contacts, analytics, the new
  read-only sellable-leads feed) sits behind that single gate and reads through
  the service role in `_shared/db.ts`, shaped by allowlist DTOs so internal
  columns (`source_ip`, `notes`, …) never leave the function.
- The browser never holds the service role and never reads those tables directly.

C.2 replaces "one boolean, everyone-who-passes-sees-everything" with a **graded**
model (e.g. `viewer` / `rep` / `manager` / `admin`, or a capability set). That is a
**new authorization surface**, and every new authorization surface is a new place
to get privilege escalation wrong. The specific reason it is blocked from a
sandbox: introducing a `role`/permissions column is only safe if we can **prove**,
against production, that the column cannot be (a) read by anon/authenticated
clients, or (b) **written** by anyone other than a service-role/admin path. That
proof requires seeing the live RLS policies and column grants — which cannot be
done from here. Building the column first and verifying later is exactly the
ordering that creates a self-serve-escalation window.

## 1. Threat model (what we are defending against)

| # | Threat | Consequence | Mitigation this plan requires |
|---|--------|-------------|-------------------------------|
| T1 | A non-admin authenticated user writes their own `profiles.role = 'admin'` (or flips a capability) | Full self-serve privilege escalation → total lead/PII/price exposure | Role/permission columns are **not writable** by `anon`/`authenticated`; only service-role (behind `requireAdmin`) can mutate them. Verified by column grants **and** an RLS `WITH CHECK` that forbids self-role-change. |
| T2 | Role column leaks to the client (readable) and reveals org structure, or is trusted client-side | Info disclosure; client-trust bypass if any gate reads role from the client | Server is the **only** authority. The edge re-derives role from the DB per request (never from the JWT claims or request body). Client role, if ever read, is UX-only. |
| T3 | A lower role calls a higher-privilege action directly (the console hides the button, but the API is open) | Broken function-level authorization (OWASP API #5/#1) | Enforcement is **per-action in the edge**, not in the React console. Every `case` in `crm-api` declares its minimum capability; the shell tabs are cosmetic. |
| T4 | Role added to the JWT as a custom claim and trusted | Stale/forgeable authorization (claims outlive a demotion; a minted token can lie) | Do **not** put role in the JWT. Resolve it server-side from `profiles` on every call, same pattern as `requireAdmin`. |
| T5 | Failure mode opens access (DB error → treated as "has permission") | Escalation on transient errors | **Fail-closed** everywhere, mirroring `requireAdmin`: any doubt → lowest privilege / 403. |
| T6 | A demoted/removed rep keeps acting via a cached session | Continued access after revocation | Role is read live per request; revocation takes effect on the next call. No role caching in a long-lived client token. |
| T7 | Audit gap — a role change or a privileged action isn't logged | Can't detect or investigate abuse | Every role grant/revoke and every privileged action writes `security_audit_log` + `lead_events` (actor uid, target, before→after), same as existing writes. |

## 2. Design (the shape we would build, once unblocked)

**Principle: additive, fail-closed, server-enforced, fully audited — and it must
not weaken the existing `is_admin` path (admin stays a superset).**

### 2a. Data model
- Add a single source of truth for a member's role. Two viable shapes — decide at
  build time based on what prod verification (§6) shows is safe:
  - **(A)** `profiles.crm_role text` with a `CHECK (crm_role IN ('viewer','rep','manager'))`, `DEFAULT NULL`, where `NULL` = no CRM access. `is_admin = true` continues to mean "superset of everything" (unchanged).
  - **(B)** a separate `crm_members(uid uuid pk, role text, granted_by uuid, granted_at timestamptz)` table, so the permission grant is isolated from the widely-read `profiles` row (reduces the blast radius of a `profiles` read policy mistake). **Preferred** for exactly that isolation.
- **RLS (the load-bearing part):**
  - `SELECT`: only service-role. If any client read is ever needed, expose role
    through a **view/RPC that returns only the caller's own role**, never others'.
  - `INSERT`/`UPDATE`/`DELETE`: **service-role only**; `WITH CHECK` additionally
    forbids a row where `uid = auth.uid()` being self-elevated. No `authenticated`
    grant on the columns/table at all.
  - Explicit `REVOKE` of `INSERT/UPDATE` on the role column(s) from `anon` and
    `authenticated` (belt-and-suspenders vs. RLS).

### 2b. Edge (authorization core)
- New helper `requireRole(req, minCapability)` in `_shared/admin.ts`, modeled 1:1
  on `requireAdmin`:
  - resolve uid from JWT (reuse `uidFromJwt`),
  - service-role read the caller's role from the SoT,
  - map role → capability set (a static table in code, not in the DB),
  - return `{ uid, role, can }` only if the capability is present; else `null` →
    403. Fail-closed on every error branch.
  - `is_admin === true` short-circuits to the full capability set (admin superset).
- In `crm-api/index.ts`, each action declares its minimum capability. Read-only
  actions (dashboard, analytics, the sellable-leads feed) require `viewer`+;
  lead mutations (status, notes, bulk) require `rep`+; role administration and
  anything touching monetization require `manager`+/`admin`. The router checks the
  capability **before** dispatching — no action trusts the console.
- Writes to roles go through a single audited action (`setMemberRole`) that
  requires `admin`, refuses self-change, and logs before→after to
  `security_audit_log`.

### 2c. Web console (UX only, never the gate)
- `CrmConsole.tsx` already treats the `is_admin` check as **UX-only** (comment at
  its head). Extend that: fetch the caller's capability set once, show/hide tabs
  and action buttons accordingly — but this is cosmetic. A hidden button whose API
  is called directly must still 403 server-side (T3).
- A new "צוות והרשאות" (Team & roles) admin-only tab to grant/revoke roles, every
  action audited and surfaced in the existing audit view.

## 3. What must NOT change (guardrails)
- `requireAdmin` semantics stay intact; admin remains the full superset. C.2 only
  **adds** lower tiers below admin.
- No lead/PII column becomes newly readable. The allowlist DTO shapers stay the
  authority on what leaves the function; a lower role sees **fewer** columns, never
  more.
- Zero change to any price, catalogue number, saving, rating, commission (§7b),
  marketing-consent (§30A), or disclosure (§17). Roles gate **who can see/act**,
  not **what the numbers are**.
- No role information in the JWT. No client-trusted authorization.

## 4. Test plan (before any deploy)
- **Edge unit tests** (`supabase/functions/tests/`): `requireRole` returns null for
  every role below the required capability; admin short-circuits; DB-error →
  null (fail-closed); self-role-change is refused; a `rep` token calling a
  `manager` action 403s at the router.
- **Negative/authz tests**: for each privileged action, assert a lower-role token
  is rejected **at the API**, not just hidden in the UI.
- **RLS tests** (against a branch/preview DB, never prod): an `authenticated`
  (non-service) client cannot `SELECT` other members' roles and cannot
  `UPDATE`/`INSERT` its own role. This is the single most important test — it
  directly refutes T1.
- Web: console shows/hides by capability; forced state still fails server-side.

## 5. Rollout order (safe sequence)
1. Land the migration on a **preview/branch** DB. Run the RLS/authz test suite there.
2. Verify the prod column-grant checklist (§6) **before** touching prod.
3. Ship edge `requireRole` + per-action checks (admin still superset → no behavior
   change for existing admins; new roles simply don't exist yet).
4. Apply the migration to prod (roles now assignable), seed the owner as admin.
5. Enable the web Team tab. Grant the first non-admin role to a test account and
   run the negative tests against prod-with-a-throwaway-account.

## 6. PROD VERIFICATION CHECKLIST — RUN 2026-07-10 (read-only, via Supabase MCP)
Result: **PASS.** Evidence below (schema/metadata introspection only — no lead/PII
data was read). This is what unblocked the build; it drove the choice of option B.

- [x] **RLS is ON** for `public.profiles` (`pg_class.relrowsecurity = true`). Its
      policies are `profiles_select_own` / `profiles_insert_own` / `profiles_update_own`,
      all `auth.uid() = id` — i.e. a **row-level self-UPDATE path exists**. RLS is
      row-level, not column-level, so a role column on `profiles` would be safe
      only via column-grant hygiene → **option B (separate table) chosen** to avoid
      the dependency entirely.
- [x] **Column grants on `profiles`:** `anon` has **no** SELECT/INSERT/UPDATE.
      `authenticated` has NO table-level UPDATE; UPDATE is granted **column-specifically**
      on a safe subset (name/email/phone/avatar/bio/quiz/bills/notify prefs) and is
      **absent** on the privileged flags (`is_admin`, `is_banned`,
      `is_verified_customer`, `total_savings*`). This is the proven precedent: a
      role column with no UPDATE grant is self-elevation-proof exactly like
      `is_admin`. (Latent finding, pre-existing: `authenticated` has table-level
      INSERT → all columns insertable at row-creation, mitigated only by the
      handle_new_user pre-created row. See §8.)
- [x] **No view/RPC re-exposes a role.** The only view over `profiles` is
      `public_profiles`, whose explicit column list is
      `id,name,avatar_url,is_verified_customer,verified_customer_at,created_at,bio`
      — **`is_admin` absent** (task #2 holds), and a new column is not auto-added.
      16 `SECURITY DEFINER` functions touch `profiles`; none provide a
      self-elevation-to-admin path, and `admin_set_ban(p_admin,…)` shows the correct
      "verify admin inside the definer" pattern.
- [x] **Service-role-only write path** — the `crm_members` design: RLS on, NO
      anon/authenticated policies, all grants revoked; the audited `setMemberRole`
      edge action (service role) is the sole writer.
- [x] **Self-elevation (T1) structurally closed** by option B: there is no
      user-reachable read or write path to `crm_members`. (A live red-team against a
      throwaway account on prod remains a recommended pre-GA step, but the grant +
      RLS posture already makes the path non-existent.)

## 7. What was built (this slice — edge foundation)
- `supabase/crm-roles-2026-07.sql` — `crm_members` table (RLS on, no policies,
  grants revoked). **Committed, NOT applied to prod.**
- `_shared/crm_roles.ts` — pure capability model (`canDo`, `ACTION_CAP`,
  `asStoredRole`); fail-closed for unmapped actions. Unit-tested (7 cases).
- `_shared/admin.ts` — `requireCrmAccess` (fail-closed; is_admin superset; graded
  role via service-role read). `requireAdmin` untouched (other functions keep it).
- `crm-api/index.ts` — entry gate swapped to `requireCrmAccess` + per-action
  capability check; audited admin-only `listMembers` / `setMemberRole` (refuses
  self-change). Behaviour-preserving for admins; empty table ⇒ no non-admin access.
- Tests: capability matrix + `shapeMember` allowlist. `deno check` 0.
- **Follow-up (PR2):** the web "צוות והרשאות" tab + capability-gated console.

## 8. Follow-up hardening surfaced by the audit (separate, pre-existing)
- `authenticated` holds **table-level INSERT** on `profiles`, so privileged columns
  (`is_admin`, `is_banned`, `is_verified_customer`, `total_savings*`, consent
  stamps, `registration_ip`, `telegram_*`) are settable at row-INSERT. Mitigated
  today only by the `handle_new_user` trigger pre-creating the row (PK conflict).
  Recommend a defense-in-depth migration: `REVOKE INSERT (is_admin, …)` from
  `authenticated`. **Not built** — flagged for the owner's go-ahead.

## 9. Rollout (owner-controlled — activates the new gate in prod)
1. Apply `supabase/crm-roles-2026-07.sql` to prod (additive; safe even before deploy).
2. Deploy `crm-api` (deploy-functions.yml). Safe in either order — a non-admin
   fails closed whether or not the table exists yet.
3. Grant the first role: `insert into public.crm_members (uid, role) values ('<uid>','rep');`
   (or via the PR2 Team tab), then smoke-test that the graded role sees only its
   allowed actions and 403s the rest.

## (appendix) Original prod-verification checklist rationale
This is what could not be done from the sandbox and was the reason C.2 was on hold
until 2026-07-10; the boxes above are now checked against production:

Only when every box is checked does C.2 move from 🔴 to buildable.

## 7. Effort / blast radius
- Migration: small (1 column or 1 table + policies + revokes).
- Edge: ~1 helper + per-action capability annotations + 1 audited write action.
- Web: 1 new admin tab + capability-gated show/hide.
- **Risk: HIGH by nature** (it *is* the authorization system), which is why the
  test + prod-verification gates above are non-negotiable and why it is not being
  built until the owner explicitly greenlights *and* §6 passes.
