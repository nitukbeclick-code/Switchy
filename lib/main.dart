import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'app_state.dart';
import 'app.dart';
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
  runApp(ChangeNotifierProvider.value(value: AppState(), child: const ChosechApp()));
}

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
