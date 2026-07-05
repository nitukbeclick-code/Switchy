import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:provider/provider.dart';
import 'package:sentry_flutter/sentry_flutter.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:flutter/foundation.dart' show PlatformDispatcher, kIsWeb;
import 'app_state.dart';
import 'app.dart';
import 'router.dart';
import 'services/analytics_service.dart';
import 'services/auth_service.dart';
import 'services/catalogue_sync.dart';
import 'services/lead_step_sync.dart';
import 'services/meeting_sync.dart';
import 'services/push_notification_service.dart';
import 'services/secure_session_store.dart';
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

  await _initBackend();
  await AppState().initializePersistedState();
  // Cache the Face-ID-armed flag synchronously for the router's cold-start gate
  // (no-op on web / when no real session). Must run after the backend is up so
  // a restored Supabase session is already visible.
  await AuthService.instance.warmUpBiometricLock();
  // Init OS push (no-op on web) so renewal reminders can be (re)scheduled.
  await PushNotificationService.instance.init();

  // Crash reporting — opt-in by DSN, exactly like the edge observability
  // stack: dark until SENTRY_DSN is supplied at build time (--dart-define).
  // With the const empty the whole branch tree-shakes away: SentryFlutter
  // never initializes and no error handler is touched, so plain `flutter run`
  // / `flutter test` (which override FlutterError.onError per-test) behave
  // byte-identically to before.
  const sentryDsn = String.fromEnvironment('SENTRY_DSN');
  if (sentryDsn.isEmpty) {
    _startApp();
    return;
  }
  await SentryFlutter.init(
    (options) {
      options.dsn = sentryDsn;
      options.tracesSampleRate = 0; // crashes only — no performance tracing
      options.sendDefaultPii = false; // house rule: no PII in telemetry, ever
      // Release/dist/environment come from SentryFlutter's package-info
      // defaults — nothing manual, nothing user-identifying.
      //
      // Per-session rate limit by a COARSE fingerprint (exception type + first
      // message line). This app has hit per-frame overflow storms that can emit
      // thousands of identical events; unbounded they'd burn the 5,000/month
      // free cap in one bad session and hide everything else. We do NOT set a
      // random sampleRate — on a low-volume app that would randomly drop real,
      // one-off crashes. Instead the first [_sentryFingerprintCap] copies of
      // each distinct fingerprint still report (so the bug is seen), and the
      // flood beyond that is dropped.
      options.beforeSend = (event, hint) {
        final fingerprint = _sentryEventFingerprint(event);
        return sentryEventShouldDrop(fingerprint, _sentrySeenFingerprints)
            ? null
            : event;
      };
    },
    appRunner: () {
      _wireSentryErrorHandlers();
      _startApp();
    },
  );
}

/// Per-session tally of how many events each coarse fingerprint has already
/// reported. Lives for the life of the isolate (reset on every app launch), so
/// a genuinely recurring crash still reports [_sentryFingerprintCap] times per
/// run — enough to see it, not enough to blow the free-tier quota.
final Map<String, int> _sentrySeenFingerprints = <String, int>{};

/// Max events reported per distinct fingerprint, per session. Small on purpose:
/// the first N still capture the bug; a per-frame flood past N is dropped.
const int _sentryFingerprintCap = 5;

/// Builds the COARSE dedupe key for a Sentry event: exception type + the first
/// line of the exception message. Deliberately lossy so a per-frame overflow
/// (whose message often varies only in trailing pixel/constraint numbers)
/// collapses onto one fingerprint. Falls back to the event's own type/message
/// when no structured exception is attached.
String _sentryEventFingerprint(SentryEvent event) {
  final exception =
      (event.exceptions != null && event.exceptions!.isNotEmpty)
          ? event.exceptions!.first
          : null;
  final type = exception?.type ?? event.throwable?.runtimeType.toString() ?? 'event';
  final rawMessage = exception?.value ?? event.message?.formatted ?? '';
  final firstLine = rawMessage.split('\n').first.trim();
  return '$type|$firstLine';
}

/// PURE decision: given a coarse [fingerprint] and the per-session [seen] tally,
/// should this event be DROPPED? Returns true once [cap] events sharing the
/// fingerprint have already been kept; otherwise records this one as kept and
/// returns false. Extracted top-level so the quota guard is unit-testable
/// without initializing Sentry.
bool sentryEventShouldDrop(
  String fingerprint,
  Map<String, int> seen, {
  int cap = _sentryFingerprintCap,
}) {
  final already = seen[fingerprint] ?? 0;
  if (already >= cap) return true; // flood past the cap — drop
  seen[fingerprint] = already + 1; // first N of this fingerprint — keep
  return false;
}

/// Brings the UI up and kicks off every app-scope background sync. Split out
/// of [main] so the Sentry `appRunner` and the unconfigured (no-DSN) path run
/// one and the same startup sequence.
void _startApp() {
  runApp(ChangeNotifierProvider.value(value: AppState(), child: const ChosechApp()));
  _appStarted = true;
  // Reschedule renewal reminders from the restored state (fire-and-forget).
  PushNotificationService.instance.syncRenewalReminders(AppState());
  // App-scope meeting sync: a rep confirmation must land (status + Zoom link +
  // push reminders) no matter which screen is open. Fire-and-forget.
  MeetingSync.start();
  // App-scope lead-step sync: the rep advancing the switch request must land
  // (tracker step + honest progress notification) no matter which screen is
  // open — the tracker page no longer owns this subscription. Fire-and-forget.
  LeadStepSync.start();
  // App-scope live catalogue: refresh allPlans from public.plans so owner edits
  // (price / benefits / fine-print) reach the running app without an App Store
  // release, with the compiled snapshot as the cold-start / fallback value.
  // Fire-and-forget — the compiled catalogue already renders meanwhile.
  CatalogueSync.start();
  // App-open beacon — fire-and-forget like every analytics call: never blocks
  // the first frame, no-ops entirely when the Supabase keys are absent.
  unawaited(AnalyticsService.track(AnalyticsEvent.appOpen));
}

/// Routes uncaught framework + platform errors to Sentry. Called ONLY from the
/// DSN-armed branch (never in tests or unconfigured builds, where per-test
/// FlutterError.onError overrides must keep working untouched). Both hooks
/// preserve whatever handler was already installed — SentryFlutter's own
/// integrations and Flutter's console reporter keep running, and Sentry's
/// built-in deduplication drops the copy its default integrations may also
/// capture, so chaining is safe.
void _wireSentryErrorHandlers() {
  final previousOnError = FlutterError.onError;
  FlutterError.onError = (details) {
    unawaited(Sentry.captureException(details.exception, stackTrace: details.stack));
    previousOnError?.call(details);
  };
  final previousPlatformOnError = PlatformDispatcher.instance.onError;
  PlatformDispatcher.instance.onError = (error, stack) {
    unawaited(Sentry.captureException(error, stackTrace: stack));
    return previousPlatformOnError?.call(error, stack) ?? true;
  };
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
    // ONE bounded attempt only: the old in-place 3-try backoff loop could hold
    // the first frame hostage for up to ~1.6s of cold start. Without a session
    // every RLS-scoped write (tracked plans, reviews, community, profile)
    // silently fails for the whole run, so we still refuse to lose the
    // identity to a single network blip — but the retry now runs off the
    // critical path: one fire-and-forget re-arm ~2s later, comfortably after
    // `runApp`'s first frame. If anonymous sign-ins are genuinely disabled in
    // the dashboard both attempts fail soft and anonymous lead capture keeps
    // working (the `leads` insert policy allows anyone).
    try {
      await auth.signInAnonymously().timeout(const Duration(seconds: 4));
    } catch (e) {
      debugPrint('Supabase anonymous sign-in failed (retrying once after first frame): $e');
      unawaited(
        Future<void>.delayed(const Duration(seconds: 2))
            .then((_) => AuthService.instance.ensureAnonymousSession()),
      );
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
    // Resolve admin status (gates the CRM entry point). Fail-soft: any error
    // leaves isAdmin false, so a fetch hiccup never exposes the dashboard.
    appBackend.fetchIsAdmin().then((isAdmin) {
      AppState().setIsAdmin(isAdmin);
    }).catchError((_) {}),
  ]);
}
