import 'package:flutter/foundation.dart';
import 'package:local_auth/local_auth.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

/// Real authentication on top of Supabase Auth — email+password, Google &
/// Facebook OAuth, sign-out, and on-device biometric (Face ID / fingerprint)
/// quick-unlock for already-registered users.
///
/// Login is OPTIONAL: guests keep the anonymous Supabase session and can browse
/// freely; a real sign-in upgrades them to an account so save/track/reviews
/// persist across devices. Every method fails soft and returns a typed result
/// so the UI never crashes — including when a provider isn't yet enabled in the
/// Supabase dashboard.
class AuthService {
  AuthService._();
  static final AuthService instance = AuthService._();

  static const _biometricPrefKey = 'biometricEnabled';
  final LocalAuthentication _localAuth = LocalAuthentication();

  bool get _supabaseReady {
    try {
      Supabase.instance; // throws if not initialized (LocalBackend / tests)
      return true;
    } catch (_) {
      return false;
    }
  }

  GoTrueClient? get _auth => _supabaseReady ? Supabase.instance.client.auth : null;

  User? get currentUser => _auth?.currentUser;

  /// True only for a real (non-anonymous, email/OAuth-backed) account.
  bool get isRealUser {
    final u = currentUser;
    return u != null && u.isAnonymous != true && (u.email != null && u.email!.isNotEmpty);
  }

  String? get currentEmail => currentUser?.email;

  /// Fires on every Supabase auth state change (sign-in / sign-out / token
  /// refresh) so the app can re-sync identity. Empty stream when offline/local.
  Stream<AuthState> authChanges() => _auth?.onAuthStateChange ?? const Stream.empty();

  // ── Email + password ────────────────────────────────────────────────────────

  Future<AuthOutcome> signUpWithEmail({
    required String email,
    required String password,
    required String name,
  }) async {
    final auth = _auth;
    if (auth == null) return const AuthOutcome.failure('שירות ההתחברות אינו זמין כרגע');
    try {
      final res = await auth.signUp(email: email.trim(), password: password, data: {'name': name.trim()});
      // With email confirmation ON, session is null until the user confirms.
      final needsConfirm = res.session == null && res.user != null;
      return AuthOutcome(ok: true, needsEmailConfirm: needsConfirm);
    } on AuthException catch (e) {
      return AuthOutcome.failure(_he(e.message));
    } catch (e) {
      return AuthOutcome.failure(_he(e.toString()));
    }
  }

  Future<AuthOutcome> signInWithEmail({required String email, required String password}) async {
    final auth = _auth;
    if (auth == null) return const AuthOutcome.failure('שירות ההתחברות אינו זמין כרגע');
    try {
      await auth.signInWithPassword(email: email.trim(), password: password);
      return const AuthOutcome(ok: true);
    } on AuthException catch (e) {
      return AuthOutcome.failure(_he(e.message));
    } catch (e) {
      return AuthOutcome.failure(_he(e.toString()));
    }
  }

  Future<AuthOutcome> sendPasswordReset(String email) async {
    final auth = _auth;
    if (auth == null) return const AuthOutcome.failure('שירות ההתחברות אינו זמין כרגע');
    try {
      await auth.resetPasswordForEmail(email.trim());
      return const AuthOutcome(ok: true);
    } catch (e) {
      return AuthOutcome.failure(_he(e.toString()));
    }
  }

  // ── OAuth (Google / Facebook) ───────────────────────────────────────────────

  Future<AuthOutcome> signInWithOAuth(OAuthProvider provider) async {
    final auth = _auth;
    if (auth == null) return const AuthOutcome.failure('שירות ההתחברות אינו זמין כרגע');
    try {
      // Web: same-tab redirect. Mobile: external browser → deep-link back.
      await auth.signInWithOAuth(
        provider,
        redirectTo: kIsWeb ? null : 'io.supabase.chosech://login-callback',
        authScreenLaunchMode: kIsWeb ? LaunchMode.platformDefault : LaunchMode.externalApplication,
      );
      // The session arrives asynchronously via authChanges() (redirect/deep-link).
      return const AuthOutcome(ok: true, pendingRedirect: true);
    } on AuthException catch (e) {
      return AuthOutcome.failure(_provider(provider, e.message));
    } catch (e) {
      return AuthOutcome.failure(_provider(provider, e.toString()));
    }
  }

  Future<void> signOut() async {
    try {
      await _auth?.signOut();
    } catch (_) {/* fail-soft */}
  }

  // ── Biometric (Face ID / fingerprint) — mobile only ─────────────────────────

  bool get _isMobile =>
      !kIsWeb && (defaultTargetPlatform == TargetPlatform.iOS || defaultTargetPlatform == TargetPlatform.android);

  /// True when the device exposes usable biometrics (and we're on mobile).
  Future<bool> biometricAvailable() async {
    if (!_isMobile) return false;
    try {
      return await _localAuth.isDeviceSupported() && await _localAuth.canCheckBiometrics;
    } catch (_) {
      return false;
    }
  }

  Future<bool> get biometricEnabled async {
    if (!_isMobile) return false;
    final p = await SharedPreferences.getInstance();
    return p.getBool(_biometricPrefKey) ?? false;
  }

  Future<void> setBiometricEnabled(bool v) async {
    _biometricEnabledCached = v;
    final p = await SharedPreferences.getInstance();
    await p.setBool(_biometricPrefKey, v);
  }

  // ── Cold-start lock gate ─────────────────────────────────────────────────────
  // The router's redirect runs synchronously, but [biometricEnabled] is async
  // (SharedPreferences). [warmUpBiometricLock] caches the flag once at startup so
  // [needsBiometricUnlock] can answer instantly. Always false on web (the whole
  // biometric surface is mobile-only), so `flutter build web` stays unaffected.
  bool _biometricEnabledCached = false;
  bool _unlockedThisSession = false;

  Future<void> warmUpBiometricLock() async {
    _biometricEnabledCached = await biometricEnabled;
  }

  /// True on a cold start when a real (logged-in) user has Face ID armed and
  /// hasn't unlocked yet — the router uses this to gate entry behind `/lock`.
  bool get needsBiometricUnlock =>
      _isMobile && _biometricEnabledCached && isRealUser && !_unlockedThisSession;

  /// Marks the session unlocked so the gate isn't shown again until next launch.
  void markUnlocked() => _unlockedThisSession = true;

  /// Prompt Face ID / fingerprint. Returns true on success, false on
  /// cancel/failure/unavailable — callers decide whether to gate entry.
  Future<bool> authenticateBiometric({String reason = 'התחברו עם Face ID כדי להמשיך'}) async {
    if (!await biometricAvailable()) return false;
    try {
      // local_auth 3.x moved the old AuthenticationOptions fields to named
      // params: stickyAuth → persistAcrossBackgrounding; biometricOnly: false
      // keeps the device-passcode fallback so the user is never locked out.
      return await _localAuth.authenticate(
        localizedReason: reason,
        biometricOnly: false,
        persistAcrossBackgrounding: true,
      );
    } catch (_) {
      return false;
    }
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────

  String _provider(OAuthProvider p, String raw) {
    final name = p == OAuthProvider.google ? 'Google' : p == OAuthProvider.facebook ? 'Facebook' : 'הספק';
    final r = raw.toLowerCase();
    if (r.contains('provider') && (r.contains('not enabled') || r.contains('disabled') || r.contains('unsupported'))) {
      return 'הכניסה עם $name אינה זמינה כרגע';
    }
    return _he(raw);
  }

  /// Map common Supabase auth errors to friendly Hebrew.
  String _he(String raw) {
    final r = raw.toLowerCase();
    if (r.contains('invalid login') || r.contains('invalid credentials')) return 'מייל או סיסמה שגויים';
    if (r.contains('already registered') || r.contains('already exists')) return 'המייל הזה כבר רשום — נסו להתחבר';
    if (r.contains('password') && r.contains('6')) return 'הסיסמה חייבת להכיל לפחות 6 תווים';
    if (r.contains('email') && r.contains('confirm')) return 'יש לאשר את המייל לפני ההתחברות';
    if (r.contains('rate limit') || r.contains('too many')) return 'יותר מדי ניסיונות — נסו שוב בעוד רגע';
    if (r.contains('network') || r.contains('socket') || r.contains('failed host')) return 'אין חיבור לרשת';
    return 'אירעה שגיאה — נסו שוב';
  }
}

/// Result of an auth attempt. [ok] = the call succeeded (note: for OAuth the
/// real session still arrives asynchronously, see [pendingRedirect]; for email
/// sign-up [needsEmailConfirm] means a confirmation mail was sent).
class AuthOutcome {
  const AuthOutcome({required this.ok, this.error, this.needsEmailConfirm = false, this.pendingRedirect = false});
  const AuthOutcome.failure(this.error) : ok = false, needsEmailConfirm = false, pendingRedirect = false;
  final bool ok;
  final String? error;
  final bool needsEmailConfirm;
  final bool pendingRedirect;
}
