import 'package:flutter/foundation.dart';
import 'package:local_auth/local_auth.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'backend/local_backend.dart' show appBackend;

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
    required bool acceptedTerms,
    required bool acceptedPrivacy,
    bool acceptedMarketing = false,
  }) async {
    // Legal gate (Israeli Privacy Protection Regs + Spam Law): terms + privacy
    // are MANDATORY; the server RPC re-checks them. Marketing is opt-in only.
    if (!acceptedTerms || !acceptedPrivacy) {
      return const AuthOutcome.failure('יש לאשר את תנאי השימוש ומדיניות הפרטיות כדי להירשם');
    }
    final auth = _auth;
    if (auth == null) return const AuthOutcome.failure('שירות ההתחברות אינו זמין כרגע');
    try {
      final nowIso = DateTime.now().toUtc().toIso8601String();
      final res = await auth.signUp(email: email.trim(), password: password, data: {
        'name': name.trim(),
        // A client-side copy of the consent moment, kept in user_metadata so it
        // survives the email-confirm gap; the RPC stamps the authoritative time + IP.
        'terms_accepted_at': nowIso,
        'privacy_accepted_at': nowIso,
        'marketing_accepted_at': acceptedMarketing ? nowIso : null,
        'consent_version': consentVersion,
      });
      armConsent(marketing: acceptedMarketing);
      if (res.session != null) await recordConsentIfArmed();
      // With email confirmation ON, session is null until the user confirms.
      final needsConfirm = res.session == null && res.user != null;
      return AuthOutcome(ok: true, needsEmailConfirm: needsConfirm);
    } on AuthException catch (e) {
      return AuthOutcome.failure(_he(e.message));
    } catch (e) {
      return AuthOutcome.failure(_he(e.toString()));
    }
  }

  // ── Legal consent (Israeli Privacy Protection Regs §13 + Spam Law) ───────────
  static const consentVersion = '2026-06';

  /// Marketing opt-in captured on the auth screen, recorded once a session lands
  /// (covers OAuth redirect / email-confirm where there's no session yet). Set
  /// only by the consent-gated flows, so a plain email LOGIN never records consent.
  bool pendingMarketingConsent = false;
  bool _pendingConsentRecord = false;
  bool _consentRecorded = false;

  /// Arm consent recording before a signup/OAuth flow whose session arrives later.
  void armConsent({required bool marketing}) {
    pendingMarketingConsent = marketing;
    _pendingConsentRecord = true;
    _consentRecorded = false;
  }

  /// Stamp server-authoritative consent (time + IP) via the RPC, but only when a
  /// consent-gated flow armed it. Idempotent and fail-soft — the signup metadata
  /// already carries a client copy as a fallback.
  Future<void> recordConsentIfArmed() async {
    if (!_pendingConsentRecord || _consentRecorded) return;
    if (_auth == null) return;
    try {
      await Supabase.instance.client.rpc('record_registration_consent', params: {
        'p_terms': true,
        'p_privacy': true,
        'p_marketing': pendingMarketingConsent,
        'p_consent_version': consentVersion,
      });
      _consentRecorded = true;
      _pendingConsentRecord = false;
    } catch (_) {/* fail-soft — server re-stamps on a later call too */}
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

  // ── Passwordless email (OTP code) ────────────────────────────────────────────
  // A code-by-mail flow: no password to choose or remember. [requestEmailOtp]
  // mails a 6-digit code (Supabase `signInWithOtp`), [verifyEmailOtp] exchanges
  // the code for a real session (`verifyOTP`, type `email`). Like signup, the
  // request is consent-gated and arms the legal-consent record so it's stamped
  // once the session lands. On a verified session we await the profile upsert so
  // a registered row is guaranteed before the caller treats the user as signed-in.

  /// Step 1 — mail a 6-digit login/signup code to [email]. Consent-gated like
  /// signup (terms + privacy mandatory); arms the consent record for when the
  /// session arrives at verify time. [shouldCreateUser] true lets a brand-new
  /// email register straight from the code (the mandatory auth gate's happy path).
  Future<AuthOutcome> requestEmailOtp({
    required String email,
    required bool acceptedTerms,
    required bool acceptedPrivacy,
    bool acceptedMarketing = false,
  }) async {
    if (!acceptedTerms || !acceptedPrivacy) {
      return const AuthOutcome.failure('יש לאשר את תנאי השימוש ומדיניות הפרטיות כדי להמשיך');
    }
    final auth = _auth;
    if (auth == null) return const AuthOutcome.failure('שירות ההתחברות אינו זמין כרגע');
    try {
      await auth.signInWithOtp(email: email.trim(), shouldCreateUser: true);
      // Arm consent now; recordConsentIfArmed() stamps it once verifyOTP lands a
      // session (the auth listener also calls it, so it's idempotent either way).
      armConsent(marketing: acceptedMarketing);
      return const AuthOutcome(ok: true);
    } on AuthException catch (e) {
      return AuthOutcome.failure(_he(e.message));
    } catch (e) {
      return AuthOutcome.failure(_he(e.toString()));
    }
  }

  /// Step 2 — exchange the 6-digit [code] for a real session. On success records
  /// the armed consent and AWAITS the profile upsert so a `profiles` row exists
  /// before the caller routes into the gated app. The auth-state listener still
  /// mirrors identity + navigates; this just guarantees the row up front.
  Future<AuthOutcome> verifyEmailOtp({
    required String email,
    required String code,
    String name = '',
  }) async {
    final auth = _auth;
    if (auth == null) return const AuthOutcome.failure('שירות ההתחברות אינו זמין כרגע');
    try {
      final res = await auth.verifyOTP(
        email: email.trim(),
        token: code.trim(),
        type: OtpType.email,
      );
      if (res.session == null) {
        return const AuthOutcome.failure('הקוד שגוי או שפג תוקפו — בקשו קוד חדש');
      }
      // Stamp server-authoritative consent now that a session exists.
      await recordConsentIfArmed();
      // Guarantee a registered profile row before the caller enters the app.
      final e = email.trim();
      final n = name.trim().isNotEmpty ? name.trim() : e.split('@').first;
      try {
        await appBackend.upsertProfile(name: n, phone: '', email: e);
      } catch (_) {/* fail-soft — the auth listener re-mirrors the profile too */}
      return const AuthOutcome(ok: true);
    } on AuthException catch (e) {
      return AuthOutcome.failure(_he(e.message));
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

  /// Global scope so the refresh token is REVOKED server-side, not just
  /// cleared locally — protects a shared/lost device or an exfiltrated token.
  Future<void> signOut() => _signOut(SignOutScope.global);

  /// Local-only sign-out: clears THIS device's session without the server-side
  /// revoke. Needed after account deletion, where the auth user no longer
  /// exists and a global revoke call would 403 (see `session_actions.dart`).
  Future<void> signOutLocal() => _signOut(SignOutScope.local);

  Future<void> _signOut(SignOutScope scope) async {
    try {
      await _auth?.signOut(scope: scope);
    } catch (_) {/* fail-soft — still clear local state below */}
    // Clear the biometric gate so a stale "armed" flag can't lock (or be
    // bypassed for) a different/empty session after sign-out. Fail-soft: a
    // pref write failure must never block the sign-out itself.
    try {
      _biometricEnabledCached = false;
      _unlockedThisSession = false;
      await setBiometricEnabled(false);
    } catch (_) {/* fail-soft */}
  }

  /// Re-arm the anonymous device identity when no session is left — mirrors the
  /// startup call in `main.dart`'s `_initBackend` so RLS policies scoped to
  /// auth.uid() (tracked plans, reviews, community writes) keep working after a
  /// local sign-out. Single attempt, fail-soft: if anonymous sign-ins are
  /// disabled (or we're offline) the app still runs — anonymous lead capture
  /// works regardless because the `leads` insert policy allows anyone.
  Future<void> ensureAnonymousSession() async {
    final auth = _auth;
    if (auth == null || auth.currentUser != null) return;
    try {
      await auth.signInAnonymously();
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
