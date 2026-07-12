# CLAUDE.md — חוסך (Chosech)

Israeli telecom price-comparison app. Hebrew-first, RTL, Flutter.

## ⚠️ ARCHITECTURE DIRECTIVE — read first

**This is plain, hand-authored Flutter. There is NO FlutterFlow — not the
runtime, not the widget-tree pattern, not the `*_model.dart` convention.**

The deployment path is: **write code → push to GitHub → build & publish to the
app stores directly.** FlutterFlow is intentionally cut out of the loop, so we
do not keep any FlutterFlow-compatible scaffolding. Anything that looks like
FlutterFlow (a `flutter_flow/` directory, `FlutterFlowTheme`, `FFButtonWidget`,
`FlutterFlowModel`/`createModel`, `*_model.dart` files, `.override()` on text
styles) is **legacy and must not be reintroduced.**

> This reverses the earlier "follow the FlutterFlow widget-tree pattern"
> directive from previous sessions. The new rule wins.

## Owned foundation layer

| Concern      | File                          | Use                                            |
|--------------|-------------------------------|------------------------------------------------|
| Design tokens| `lib/theme/app_theme.dart`    | `AppTheme.of(context)` → colors + text styles; `AppColors.*` for const colors |
| Navigation   | `lib/core/nav.dart`           | re-exports `go_router`; adds `context.safePop()` |
| Buttons      | `lib/widgets/app_button.dart` | `AppButton(...)` — primary CTA with async loading state |
| App state    | `lib/app_state.dart`          | `AppState` — `ChangeNotifier` + `SharedPreferences`, singleton via `Provider` |

## Services (pure, testable — keep logic out of widgets)

Domain logic lives in `lib/services/` as pure, dependency-light classes so it
can be unit-tested without pumping widgets. Each is the **single source of truth**
for its concern; screens render its output, they don't re-derive it (a duplicated
formula will drift).

| Service | File | Purpose |
|---------|------|---------|
| Recommendation engine | `services/recommendation_engine.dart` | `RecommendationEngine.rank/bestMatch/scorePlan` over a `MatchProfile`; explainable score + Hebrew reasons/caveats |
| Notifications | `services/notifications.dart` | `computeNotifications(AppState)` → renewal / better-deal / savings alerts; each carries a deep-link `routeName` (+ optional `pathParameters`) |
| Provider ratings | `services/provider_ratings.dart` | `ProviderRatings.forProvider` — avg stars, review count, sub-ratings (catalogue ⊕ the user's own review) |
| Renewal report | `services/renewal_report.dart` | `RenewalReport.alternatives/bestSaver` — the full comparison table for a tracked plan about to renew |
| Search | `services/search.dart` | `searchEverything(query)` → ranked provider + plan matches |
| Savings summary | `services/savings_summary.dart` | `computeSavings(AppState)` — per-category opportunity + total potential |
| Media | `services/media_service.dart` (+ `media_native_*.dart`) | image/voice/video capture as base64 data-URIs; web-safe via conditional `dart:io` export |

When adding logic, put it here with tests in `test/<service>_test.dart`, then render it.

## Conventions (follow these going forward)

- **One file per page:** `lib/pages/<name>/<name>_widget.dart`. A page is a
  `StatefulWidget`/`StatelessWidget`. **Do not create `_model.dart` files.**
  Page-local state (controllers, timers, form fields, derived getters) lives in
  the `State` class.
- **Text styles:** read from `AppTheme.of(context)` (`titleLarge`, `bodyMedium`,
  `labelSmall`, …) and customise with **`.copyWith(...)`** — never `.override()`.
  For line height use `height:` (standard Flutter), not `lineHeight:`.
- **Colors:** `AppTheme.of(context).primary` / `.secondary` / `.brandAccent` /
  `.saving` … or `AppColors.*` constants. Brand = "white glass + black ink" base
  (formal/editorial; green-forward, matching the Switchy robot logo) **+ a disciplined two-accent system**: ink
  `#111827` for text/structure/borders, glass-white `#F5F7F8` background, text
  `#0B0F14`, borders `#222A35`, secondary `#E5E7EB`. **Accents (use with intent,
  sparingly):** `brandAccent` **green `#16A34A`** (Switchy logo) = ACTION (primary CTAs via
  `AppTheme.accentGradient`+`shadowAccent`, active nav, links, focus); VALUE
  (savings figures, "best value"/win states) — **in Flutter** the `saving*`
  tokens are the SAME green `#16A34A` and VALUE is distinguished by TREATMENT
  (SavingPill: pale-green tint + savings glyph + tabular figures), while **the
  site** keeps a distinct amber `--value` (`#D97706` light / `#FBBF24` dark).
  Site mirrors the action accent as `--accent` in `:root` (the **site is
  recolored to this green** as of 2026-06-21; the Flutter
  `AppColors`/`app_theme.dart` `brandAccent` is **already this green
  `#16A34A`** — the indigo→green migration is done, do not re-migrate).
  The big dark hero cards stay
  ink (premium), not coloured. Frosted glass: `AppTheme.glassDecoration()` /
  `AppTheme.shadowGlass` for soft cards, the `GlassPanel` widget
  (`lib/widgets/glass_panel.dart`) for real `BackdropFilter` blur (use sparingly).
  Per-provider/carrier brand colors (the provider tuples) are NOT the app theme —
  never recolor them to the brand palette OR the accents.
- **Fonts:** Rubik for display/headings/titles, Assistant for body/labels
  (via `google_fonts`).
- **Routing:** `go_router` in `lib/router.dart`. `ShellRoute` hosts the bottom
  nav; full-screen routes (onboarding, auth, website) sit outside it. Navigate
  with `context.goNamed('Name')`, `context.pushNamed('Name', pathParameters: …)`,
  and `context.safePop()`. Feature screens pushed over the shell include
  `Provider` (`/provider/:name`), `RenewalReport` (`/renewal-report/:trackedId`),
  `Search` (`/search`), `Savings` (`/savings`), plus `Ratings`, `Renewal`,
  `Notifications`. A `Plan`/provider surface should link to these, not dead-end.
- **Accessibility:** give icon-only controls a `Semantics(button:true, label:…)`
  or `IconButton(tooltip:…)`; mark decorative marks (e.g. logo initials) with
  `ExcludeSemantics`. Assert key labels with `find.bySemanticsLabel(...)`.
- **State access:** `Provider.of<AppState>(context)` to rebuild on change;
  `Provider.of<AppState>(context, listen: false)` (or `AppState()`) inside
  callbacks. `AppState()` returns the singleton.
- **RTL:** the app is wrapped in `Directionality(textDirection: TextDirection.rtl)`
  in `lib/app.dart`. All copy is Hebrew.
- **Animations:** `flutter_animate` (`.animate().fadeIn()/.slideY()`), staggered
  with `delay: (i * n).ms`.

## Domain rules

- Plan categories: `cellular`, `internet`, `tv`, `triple`, `abroad`
  (see `lib/data.dart`, `lib/models.dart`).
- **Plan price suffixes are owned by `priceUnitLabel(plan)` / `priceUnitShort(plan)`**
  (`lib/data.dart`), driven by `Plan.priceUnit` (`month`/`package`/`day`/`minute`).
  Never hardcode the suffix or the old `cat == 'abroad'` ternary. Abroad plans
  default to per-package (`לחבילה`) when `priceUnit` is unset; some abroad plans
  are legitimately per-day/per-minute/monthly. Bills (חשבון) are always monthly.
  `TrackedPlan` (renewal radar) has no `priceUnit` and is monthly except abroad —
  its two ternaries in renewal/renewal_report are deliberate.
- Annual saving: `planSaveYear(plan, bill)` = `((bill - plan.price) * 12).clamp(0, …)`.
- Each plan has its own category; savings must use `appState.currentBill(plan.cat)`,
  not a single global bill.

## Validation gates (run after every change, in order)

1. `flutter analyze` → must print **No issues found**.
2. `flutter test` → all pass (track the count; it only goes up).
3. `flutter build web --no-pub` → must reach **✓ Built build/web**. This is the
   critical gate for any new plugin: it catches `dart:io`/native code that breaks
   the web target. Keep native-only code behind a conditional `dart.library.html`
   export (see `services/media_native_*.dart`).

The Flutter SDK lives at `$HOME/.flutter-sdk/bin` — `export PATH="$HOME/.flutter-sdk/bin:$PATH"`
first; ignore the "running as root" warning. When dispatching parallel agents,
give each **disjoint files** and have it self-validate; wait for all completions
before validating, and code-review each wave's diff before committing.

## Build & ship

- `flutter pub get`, `flutter run`, `flutter analyze`, `flutter build apk` /
  `flutter build ipa`. No FlutterFlow step anywhere.
- Dependencies: `provider`, `go_router`, `google_fonts`, `shared_preferences`,
  `flutter_animate`, `fl_chart`, `shimmer`, `cached_network_image`,
  `url_launcher`, `intl`; media: `image_picker`, `record`, `audioplayers`,
  `video_player`, `path_provider`.
