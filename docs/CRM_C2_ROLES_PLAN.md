# C.2 — Per-rep roles & permissions — SECURITY PLAN (do NOT build yet)

> Status: **PLAN ONLY. No code, no migration, no deploy.** Held pending the
> owner's explicit go-ahead **and** the prod verification checklist in §6 passing.
> This document exists so the work is scoped, its risks are named, and nothing is
> built blind. It reverses none of the standing mandate: no security holes, no
> lead/PII leakage, no unauthorized price/catalogue changes.

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

## 6. PROD VERIFICATION CHECKLIST (the blocker — must all pass first)
This is what cannot be done from the sandbox and is the reason C.2 is on hold.
Before writing a line of C.2 code, confirm against production:

- [ ] **Column grants:** `anon` and `authenticated` have **no** `INSERT`/`UPDATE`
      grant on `profiles` role-bearing columns (or on the `crm_members` table).
      (`information_schema.role_column_grants` / `has_column_privilege`.)
- [ ] **RLS is ON** for `profiles` (and `crm_members` if used) with no permissive
      policy that lets a user update their own role. Enumerate every existing
      `profiles` policy and confirm none grants a self-`UPDATE` path to the new
      column.
- [ ] **No view/RPC** currently re-exposes `profiles` columns to clients in a way
      that would include the new role (re-audit `public_profiles` and any
      `SECURITY DEFINER` function — recall task #2 dropped `is_admin` from
      `public_profiles`; the same must hold for `crm_role`).
- [ ] **Service-role-only** write path confirmed: the only way role changes is the
      audited edge action.
- [ ] A throwaway non-admin account **cannot** self-elevate via the REST API
      (manual red-team of T1 against a preview project).

Only when every box is checked does C.2 move from 🔴 to buildable.

## 7. Effort / blast radius
- Migration: small (1 column or 1 table + policies + revokes).
- Edge: ~1 helper + per-action capability annotations + 1 audited write action.
- Web: 1 new admin tab + capability-gated show/hide.
- **Risk: HIGH by nature** (it *is* the authorization system), which is why the
  test + prod-verification gates above are non-negotiable and why it is not being
  built until the owner explicitly greenlights *and* §6 passes.
