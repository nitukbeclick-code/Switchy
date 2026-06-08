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

## Conventions (follow these going forward)

- **One file per page:** `lib/pages/<name>/<name>_widget.dart`. A page is a
  `StatefulWidget`/`StatelessWidget`. **Do not create `_model.dart` files.**
  Page-local state (controllers, timers, form fields, derived getters) lives in
  the `State` class.
- **Text styles:** read from `AppTheme.of(context)` (`titleLarge`, `bodyMedium`,
  `labelSmall`, …) and customise with **`.copyWith(...)`** — never `.override()`.
  For line height use `height:` (standard Flutter), not `lineHeight:`.
- **Colors:** `AppTheme.of(context).primary` / `.secondary` / `.accent1` … or
  `AppColors.*` constants. Brand: primary `#15603E` (green), secondary
  `#C9EC4B` (lime), background `#F4F0E8`.
- **Fonts:** Rubik for display/headings/titles, Assistant for body/labels
  (via `google_fonts`).
- **Routing:** `go_router` in `lib/router.dart`. `ShellRoute` hosts the bottom
  nav; full-screen routes (onboarding, auth, website) sit outside it. Navigate
  with `context.goNamed('Name')`, `context.pushNamed('Name', pathParameters: …)`,
  and `context.safePop()`.
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
- **Abroad plans are priced per-package** — always show **`לחבילה`**, never
  `לחודש`. Every other category shows `לחודש`.
- Annual saving: `planSaveYear(plan, bill)` = `((bill - plan.price) * 12).clamp(0, …)`.
- Each plan has its own category; savings must use `appState.currentBill(plan.cat)`,
  not a single global bill.

## Build & ship

- `flutter pub get`, `flutter run`, `flutter analyze`, `flutter build apk` /
  `flutter build ipa`. No FlutterFlow step anywhere.
- Dependencies: `provider`, `go_router`, `google_fonts`, `shared_preferences`,
  `flutter_animate`, `fl_chart`, `shimmer`, `cached_network_image`,
  `url_launcher`, `intl`.
