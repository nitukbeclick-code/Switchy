import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:provider/provider.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:flutter/foundation.dart' show kIsWeb;
import 'app_state.dart';
import 'app.dart';
import 'router.dart';
import 'services/auth_service.dart';
import 'services/meeting_sync.dart';
import 'services/push_notification_service.dart';
import 'services/secure_session_store.dart';
import 'services/timeout_http_client.dart';
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
  // Rubik/Assistant ship as bundled assets (assets/google_fonts/) — never
  // fetch from fonts.gstatic at runtime. Kills the cold-load FOUT on web and
  // keeps typography working offline; a missing variant now fails loudly in
  // dev instead of silently swapping the font.
  GoogleFonts.config.allowRuntimeFetching = false;
  SystemChrome.setSystemUIOverlayStyle(const SystemUiOverlayStyle(
    statusBarColor: Colors.transparent,
    statusBarBrightness: Brightness.dark,
    statusBarIconBrightness: Brightness.light,
  ));

  // Startup services are wrapped so a failure in any single one can NEVER stop
  // the app from rendering. Each is non-critical to first paint: the backend
  // falls back to on-device data, biometric warmup just affects the lock gate,
  // and push init only affects reminders. Without these guards a thrown
  // exception here (e.g. native notification/timezone init on a real device)
  // would kill main() before runApp() and the app would "not open".
  try {
    await _initBackend();
  } catch (e, s) {
    debugPrint('startup: _initBackend failed (continuing on local backend): $e\n$s');
  }
  await AppState().initializePersistedState();
  // Cache the Face-ID-armed flag synchronously for the router's cold-start gate
  // (no-op on web / when no real session). Must run after the backend is up so
  // a restored Supabase session is already visible.
  try {
    await AuthService.instance.warmUpBiometricLock();
  } catch (e) {
    debugPrint('startup: biometric warmup failed (continuing): $e');
  }
  // Init OS push (no-op on web) so renewal reminders can be (re)scheduled.
  try {
    await PushNotificationService.instance.init();
  } catch (e) {
    debugPrint('startup: push init failed (continuing without notifications): $e');
  }
  runApp(ChangeNotifierProvider.value(value: AppState(), child: const ChosechApp()));
  _appStarted = true;
  // Hydrate the plan catalogue from the backend (live prices/featured/ratings
  // overlaid onto the bundled seed), then rebuild open screens. Fire-and-forget:
  // first paint already happened on the seed, and an empty/failed fetch is a
  // safe no-op — LocalBackend returns the seed, so this is an identity merge
  // offline. Real prices flow the moment a Supabase catalogue is connected.
  appBackend
      .fetchPlans()
      .then((plans) => AppState().hydrateCatalogWith(plans))
      .catchError((e) => debugPrint('startup: catalogue hydration failed (using seed): $e'));
  // Reschedule renewal reminders from the restored state (fire-and-forget).
  PushNotificationService.instance.syncRenewalReminders(AppState());
  // Push any price targets already met on cold start (gated + deduped inside).
  PushNotificationService.instance.syncPriceAlerts(AppState());
  // Detect price drops for watched plans vs the last-seen baseline (gated).
  PushNotificationService.instance.syncPriceDrops(AppState());
  // App-scope meeting sync: a rep confirmation must land (status + Zoom link +
  // push reminders) no matter which screen is open. Fire-and-forget.
  MeetingSync.start();
}

/// True once `runApp` has been called — used to suppress navigation on the
/// initial-session event that Supabase replays when the auth listener attaches.
bool _appStarted = false;

/// Connects to Supabase when build-time keys are present, then routes the app's
/// shared data through [SupabaseBackend]. With no keys the default
/// [LocalBackend] (set in `local_backend.dart`) is left in place.
Future<void> _initBackend() async {
  if (_supabaseUrl.isEmpty || _supabaseAnonKey.isEmpty) return;

  await Supabase.initialize(
    url: _supabaseUrl,
    publishableKey: _supabaseAnonKey,
    // A network blip must never hang the UI: this timeout client fails every
    // Supabase request fast (15s) so callers fall back to on-device data / a
    // retry instead of awaiting forever. One chokepoint for all query sites.
    httpClient: TimeoutHttpClient(),
    // Mobile: persist the session in the Keychain/Keystore (secure enclave),
    // not plaintext SharedPreferences. Web: null → default storage (CSP is the
    // web mitigation), which also keeps the `flutter build web` gate green.
    authOptions: FlutterAuthClientOptions(
      localStorage: kIsWeb ? null : SecureSessionStore(),
    ),
  );

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
    // If a consent-gated signup/OAuth flow armed it, stamp server-authoritative
    // legal consent now that the session exists (no-op for a plain login).
    AuthService.instance.recordConsentIfArmed();

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
