# חוסך (Chosech) — Israeli Telecom Price Comparison

**Chosech** ("the saver" in Hebrew) is a mobile app that helps Israeli consumers find cheaper telecom plans, manage their switch, and track their savings. It covers all five plan categories — cellular, home internet, TV, triple bundles, and abroad packages — and guides users from discovery through successful porting.

> The app is Hebrew-first and fully RTL. All copy, plan data, and community content is in Hebrew.

---

## Features

| Screen / Feature | Description |
|---|---|
| **Quiz** | Short onboarding quiz: lines, budget, priority — surfaces the best match instantly |
| **Results** | Ranked plan list with savings-per-year, filters (5G, no-commitment, fixed-price, fiber…) and sort modes |
| **Compare** | Side-by-side comparison of up to 3 plans |
| **Tracker** | Step-by-step porting progress tracker (submitted → confirmed → porting → active) |
| **Porting guide** | End-to-end guide for number porting (ניוד) with a readiness checklist |
| **AI Advisor** | In-app chat powered by a conversational AI assistant for personalised plan recommendations |
| **Community** | Channelled community feed where users share tips, ask questions, and post real switching stories |
| **Ratings** | Per-provider star ratings with sub-dimensions (price, service, coverage, speed) |
| **Bills** | Per-category current-bill input — used to calculate annual savings for each plan |
| **Availability checker** | Check whether fiber/cable is available at a given address |
| **Switch calculator** | Estimate total first-year cost including intro pricing and commitment fees |
| **Watchlist** | Watch a plan and get notified when its price changes |

### Plan Categories

| Category | Hebrew | Description |
|---|---|---|
| `cellular` | סלולר | Mobile plans (4G/5G) |
| `internet` | אינטרנט | Home broadband (fiber, ADSL) |
| `tv` | טלוויזיה | Pay-TV (cable, satellite, streaming) |
| `triple` | חבילה משולבת | Internet + TV + landline bundles |
| `abroad` | חבילות חו"ל | International roaming and eSIM packages |

> Abroad plans are priced **per package** (לחבילה), not per month. Every other category shows a monthly price (לחודש).

---

## Tech Stack

| Concern | Library / Version |
|---|---|
| UI framework | Flutter (SDK `>=3.0.0 <4.0.0`) |
| State management | `provider ^6.1.2` |
| Navigation | `go_router ^14.2.0` |
| Typography | `google_fonts ^6.2.1` (Rubik for headings, Assistant for body) |
| Persistence | `shared_preferences ^2.2.3` |
| Animations | `flutter_animate ^4.5.0` |
| Charts | `fl_chart ^0.68.0` |
| Images | `cached_network_image ^3.3.1` |
| Links | `url_launcher ^6.3.0` |
| i18n helpers | `intl ^0.19.0` |
| Shimmer loading | `shimmer ^3.0.0` |

---

## Architecture

> **No FlutterFlow.** This is plain, hand-authored Flutter. There is no FlutterFlow runtime, no `FlutterFlowTheme`, no `FFButtonWidget`, no `*_model.dart` files, and no `.override()` on text styles. Do not reintroduce any of those patterns.

The app follows a clean layered structure:

```
lib/
├── app.dart                   # MaterialApp root, Directionality(rtl), Provider setup
├── app_state.dart             # AppState — ChangeNotifier singleton (SharedPreferences-backed)
├── router.dart                # go_router config; ShellRoute for bottom nav
├── data.dart                  # All plan & category data + helper functions
├── models.dart                # Plan, Category, ChatMessage, CommunityPost value types
├── theme/
│   └── app_theme.dart         # AppTheme.of(context), AppColors.* constants
├── core/
│   └── nav.dart               # Re-exports go_router; adds context.safePop()
├── widgets/
│   └── app_button.dart        # AppButton — primary CTA with async loading state
└── pages/
    └── <name>/
        └── <name>_widget.dart # One StatefulWidget/StatelessWidget per page
```

### Owned Foundation Layer

| Concern | File | API |
|---|---|---|
| Design tokens | `lib/theme/app_theme.dart` | `AppTheme.of(context)` → colors + text styles; `AppColors.*` for const colors |
| Navigation | `lib/core/nav.dart` | Re-exports `go_router`; adds `context.safePop()` |
| Primary button | `lib/widgets/app_button.dart` | `AppButton(text, onPressed, color)` — built-in async loading spinner |
| App state | `lib/app_state.dart` | `AppState` singleton via `Provider`; `AppState()` returns the instance |

**Brand colors:** primary `#15603E` (green), secondary `#C9EC4B` (lime), background `#F4F0E8`.

---

## Project Structure

```
chosech/
├── lib/
│   ├── app.dart
│   ├── app_state.dart
│   ├── router.dart
│   ├── data.dart
│   ├── models.dart
│   ├── theme/app_theme.dart
│   ├── core/nav.dart
│   ├── widgets/app_button.dart
│   └── pages/
│       ├── home/
│       ├── results/
│       ├── plan_detail/
│       ├── compare/
│       ├── quiz/
│       ├── tracker/
│       ├── community/
│       ├── ratings/
│       ├── chat/
│       ├── bills/
│       ├── availability/
│       └── settings/
├── test/
│   ├── data_test.dart
│   ├── app_state_test.dart
│   └── widget/
│       └── app_button_test.dart
├── assets/
│   └── images/
├── .github/workflows/ci.yml
├── analysis_options.yaml
├── pubspec.yaml
└── README.md
```

---

## Getting Started

**Prerequisites:** Flutter SDK installed (`flutter --version` should show `3.x` or later).

```bash
# 1. Clone the repo
git clone https://github.com/your-org/chosech.git
cd chosech

# 2. Fetch dependencies
flutter pub get

# 3. Run on a connected device or simulator
flutter run
```

---

## Build & Deploy

```bash
# Analyze for lint/type errors
flutter analyze

# Run unit and widget tests
flutter test

# Android APK (release)
flutter build apk --release

# iOS IPA (requires macOS + Xcode)
flutter build ipa --release
```

Deployments go directly from the repository to Google Play / App Store. There is no FlutterFlow step in the pipeline.

---

## CI

A GitHub Actions workflow (`.github/workflows/ci.yml`) runs on every push and pull request to `main`:

1. `flutter pub get`
2. `flutter analyze`
3. `flutter test`
4. `flutter build apk --debug` (build smoke-test)

---

## Contributing

- One file per page: `lib/pages/<name>/<name>_widget.dart`
- Page-local state lives in the `State` class — no separate `_model.dart` files
- Text styles via `AppTheme.of(context).titleLarge` etc., customised with `.copyWith()` only
- Colors via `AppTheme.of(context).primary` or `AppColors.*` constants
- Navigate with `context.goNamed(...)` / `context.pushNamed(...)` / `context.safePop()`
- Access state with `Provider.of<AppState>(context)` (rebuild) or `AppState()` (no rebuild)
