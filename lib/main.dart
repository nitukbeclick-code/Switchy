import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'app_state.dart';
import 'app.dart';
import 'router.dart';
import 'services/auth_service.dart';
import 'services/backend/local_backend.dart';
import 'services/backend/supabase_backend.dart';

// Supplied at build time with `--dart-define` (or `--dart-define-from-file`),
// e.g. `flutter run --dart-define-from-file=dart_define.json`. Empty when not
// provided — then the app stays on the on-device [LocalBackend], so plain
// `flutter run`, `flutter test` and CI keep working with no Supabase project.
const _supabaseUrl = String.fromEnvironment('SUPABASE_URL');
const _supabaseAnonKey = String.fromEnvironment('SUPABASE_ANON_KEY');

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  SystemChrome.setSystemUIOverlayStyle(const SystemUiOverlayStyle(
    statusBarColor: Colors.transparent,
    statusBarBrightness: Brightness.dark,
    statusBarIconBrightness: Brightness.light,
  ));

  await _initBackend();
  await AppState().initializePersistedState();
  // Cache the Face-ID-armed flag synchronously for the router's cold-start gate
  // (no-op on web / when no real session). Must run after the backend is up so
  // a restored Supabase session is already visible.
  await AuthService.instance.warmUpBiometricLock();
  runApp(ChangeNotifierProvider.value(value: AppState(), child: const ChosechApp()));
  _appStarted = true;
}

/// True once `runApp` has been called — used to suppress navigation on the
/// initial-session event that Supabase replays when the auth listener attaches.
bool _appStarted = false;

/// Connects to Supabase when build-time keys are present, then routes the app's
/// shared data through [SupabaseBackend]. With no keys the default
/// [LocalBackend] (set in `local_backend.dart`) is left in place.
Future<void> _initBackend() async {
  if (_supabaseUrl.isEmpty || _supabaseAnonKey.isEmpty) return;

  await Supabase.initialize(url: _supabaseUrl, publishableKey: _supabaseAnonKey);

  // Give every device a stable identity so RLS policies scoped to auth.uid()
  // (tracked plans, reviews, community writes) work without a login screen.
  // Requires "Anonymous sign-ins" enabled in the dashboard; if it's off the
  // sign-in fails and we fall back gracefully — anonymous lead capture still
  // works because the `leads` insert policy allows anyone.
  final auth = Supabase.instance.client.auth;
  if (auth.currentSession == null) {
    try {
      await auth.signInAnonymously();
    } catch (e) {
      debugPrint('Supabase anonymous sign-in unavailable: $e');
    }
  }

  appBackend = SupabaseBackend();

  // Keep AppState's identity mirror in sync with Supabase Auth, and finish an
  // OAuth (Google/Facebook) sign-in that completes asynchronously via redirect
  // / deep-link: when a real session arrives while the user waits on the auth
  // page, mirror the profile and land them on Home.
  auth.onAuthStateChange.listen((data) {
    final event = data.event;
    final user = data.session?.user;
    final isReal = user != null && user.isAnonymous != true && (user.email?.isNotEmpty ?? false);

    if (event == AuthChangeEvent.signedOut) {
      if (AppState().isLoggedIn) AppState().logout();
      return;
    }
    if (!isReal) return;

    final meta = user.userMetadata ?? const {};
    final metaName = (meta['name'] as String?)?.trim();
    final display = (metaName != null && metaName.isNotEmpty) ? metaName : user.email!.split('@').first;
    if (!AppState().isLoggedIn || AppState().userEmail != user.email) {
      AppState().login(name: display, phone: AppState().userPhone, email: user.email!);
      appBackend.upsertProfile(name: display, phone: AppState().userPhone, email: user.email).catchError((_) {});
    }

    // Complete an interactive OAuth redirect: only navigate for a real, post-
    // startup sign-in while sitting on the auth page (never yank a browsing
    // guest on a token refresh, and never fight the cold-start lock gate).
    final router = appRouterInstance;
    if (_appStarted && event == AuthChangeEvent.signedIn && router != null) {
      final path = router.routerDelegate.currentConfiguration.uri.path;
      if (path == '/auth') {
        AppState().markOnboardingSeen();
        router.goNamed('Home');
      }
    }
  });

  // Restore profile + bills from Supabase after local prefs load.
  // Supabase wins on reinstall / new device; local prefs win when both have data.
  Future.wait([
    appBackend.fetchProfile().then((p) {
      if (p == null) return;
      if (!AppState().isLoggedIn) {
        AppState().login(name: p.name, phone: p.phone);
      }
      if (p.totalSavings > AppState().totalSavings) {
        AppState().addSavings(p.totalSavings - AppState().totalSavings);
      }
      if (p.renewalReminders && !AppState().renewalReminders) {
        AppState().setRenewalReminders(true);
      }
    }).catchError((_) {}),
    appBackend.fetchBills().then((remote) {
      if (remote != null && remote.isNotEmpty) {
        for (final e in remote.entries) {
          AppState().setCurrentBill(e.key, e.value);
        }
      }
    }).catchError((_) {}),
    appBackend.fetchQuiz().then((q) {
      if (q == null || AppState().quizCompleted) return;
      final budget = (q['budget'] as num?)?.toInt();
      final priority = q['priority'] as String?;
      final lines = (q['lines'] as num?)?.toInt();
      final cat = q['cat'] as String?;
      if (budget != null) AppState().setQuizBudget(budget);
      if (priority != null) AppState().setQuizPriority(priority);
      if (lines != null) AppState().setQuizLines(lines);
      if (cat != null) AppState().setQuizCat(cat);
      AppState().setQuizNeeds(
        wants5G: q['wants5G'] as bool? ?? false,
        wantsAbroad: q['wantsAbroad'] as bool? ?? false,
        wantsNoCommit: false,
      );
      AppState().setQuizCompleted(true);
    }).catchError((_) {}),
  ]);
}
