# Supabase backend — חוסך (Chosech)

This folder holds the database schema for the app's backend. The Flutter app
ships with local-only storage (`SharedPreferences`); this is the plan for moving
the *shared* data (accounts, leads, community, ratings) to Supabase.

## 1. Apply the schema

1. Open your project → **SQL Editor** → **New query**.
2. Paste the whole of [`schema.sql`](./schema.sql) and **Run**.
3. It creates the tables, enables **RLS on every one of them**, and adds the
   access policies + two helper views (`community_feed`, `provider_rating_summary`).

> Re-running is safe — it uses `if not exists` / `drop policy if exists`.

## 2. What lives where

| Stays on the device (`SharedPreferences`) | Moves to Supabase |
|-------------------------------------------|-------------------|
| quiz answers, recent searches, dismissed-notification keys, watchlist/recently-viewed (can later sync via `profiles.quiz` / `profiles.bills`) | accounts (`profiles`), `leads`, `tracked_plans`, `community_posts` + `replies` + `likes` + `bookmarks`, `provider_reviews` |

The **plan catalogue itself stays in the app** (`lib/data/`) — it's static
reference data, no need for a table.

## 3. Security model (matches your project settings)

- **RLS is on for every table.** A table with RLS and no matching policy is
  *locked* — that's the safe default you chose with "Enable automatic RLS".
- Public reads: community posts/replies/likes and provider reviews
  (`using (true)` on `select`).
- Everything a user *writes* is scoped to `auth.uid() = user_id`.
- `leads` allows anonymous `insert` (lead capture before sign-in) but only the
  owner can read their own. Your sales team reads all leads with the
  **`service_role`** key — **server-side only, never in the app**.

## 4. Media

The app currently encodes images/voice as base64 data-URIs. For the backend,
prefer a **Supabase Storage** bucket (e.g. `community-media`) and store the
public URL in `media_url`. Base64 in a `text` column works but bloats the table.

Run [`storage.sql`](./storage.sql) after the schema to create the bucket and the
RLS policies (public read; each user can only upload/delete under their own
`<uid>/` folder).

## 5. Flutter integration (outline — not wired yet)

1. Add the dependency:
   ```yaml
   dependencies:
     supabase_flutter: ^2.5.0
   ```
2. Initialise in `main()` before `runApp` (use the **anon** key — it's public,
   the `service_role` key must never ship):
   ```dart
   await Supabase.initialize(
     url: const String.fromEnvironment('SUPABASE_URL'),
     anonKey: const String.fromEnvironment('SUPABASE_ANON_KEY'),
   );
   ```
   Pass them with `--dart-define` (or `--dart-define-from-file`) so keys aren't
   committed.
3. The thin repository layer is already scaffolded in
   [`lib/services/backend/`](../lib/services/backend/):
   - `backend.dart` — the `Backend` interface + `LeadInput`/`ReviewInput` (with
     `toRow()` mappers matching the table columns).
   - `local_backend.dart` — `LocalBackend` (the on-device default) + the
     `appBackend` singleton — **flip this one line to `SupabaseBackend()`**.
   - `supabase_backend.dart.example` — the Supabase implementation, queries
     mapped 1:1 to this schema. Rename to `.dart` after adding `supabase_flutter`.

   So wiring the backend later is: add the dep → rename the example → set
   `appBackend`. Screens migrate onto `appBackend` incrementally.

### Which domains are wired

| Domain | In `Backend` | Live today via `appBackend` |
|--------|:---:|---|
| Leads | ✅ | ✅ lead form mirrors every submission |
| Provider reviews | ✅ | ✅ ratings screen mirrors on submit |
| Tracked plans | ✅ | ✅ renewal screen mirrors add/remove |
| Community (posts/replies/likes/bookmarks) | ✅ | ⏳ contract + `LocalBackend` + template ready, but the **live feed still reads AppState + seed data** — switch `community_widget` onto `appBackend` during the Supabase cutover so the seed feed isn't lost meanwhile |

The first three are write-mostly, so mirroring them is a safe no-op locally and
becomes a real server write the moment you flip `appBackend`. Community is
read-heavy, so its UI migration is intentionally deferred to the cutover.

## 6. Region / project notes

- Region is **permanent**; **Central EU (Frankfurt)** gives the lowest latency
  to Israeli users.
- Keep the DB password in a password manager; the `service_role` key out of the
  client entirely.
