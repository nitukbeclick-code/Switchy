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

  await Supabase.initialize(url: _supabaseUrl, anonKey: _supabaseAnonKey);

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
}
