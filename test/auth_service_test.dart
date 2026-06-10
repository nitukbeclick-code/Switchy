import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:chosech/services/auth_service.dart';

// Pure tests for the fail-soft auth contract. No Supabase is initialized here,
// so every network-backed method must degrade gracefully (typed failure, no
// throw) and the mobile-only biometric surface must report "off" on the test
// platform. This pins the guarantees the UI relies on so it never crashes when
// the backend is absent.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() {
    SharedPreferences.setMockInitialValues({});
  });

  const unavailable = 'שירות ההתחברות אינו זמין כרגע';

  group('email methods fail soft without Supabase', () {
    test('signInWithEmail returns a typed failure, not a throw', () async {
      final out = await AuthService.instance.signInWithEmail(
        email: 'a@b.com',
        password: 'secret123',
      );
      expect(out.ok, isFalse);
      expect(out.error, unavailable);
    });

    test('signUpWithEmail returns a typed failure, not a throw', () async {
      final out = await AuthService.instance.signUpWithEmail(
        email: 'a@b.com',
        password: 'secret123',
        name: 'דנה',
      );
      expect(out.ok, isFalse);
      expect(out.error, unavailable);
    });
  });

  group('biometric surface is off on the test platform', () {
    test('biometricAvailable() is false', () async {
      expect(await AuthService.instance.biometricAvailable(), isFalse);
    });

    test('biometricEnabled is false', () async {
      expect(await AuthService.instance.biometricEnabled, isFalse);
    });

    test('needsBiometricUnlock is false (nothing to gate)', () {
      expect(AuthService.instance.needsBiometricUnlock, isFalse);
    });
  });

  group('AuthOutcome.failure', () {
    test('yields a clean failure shape', () {
      const out = AuthOutcome.failure('x');
      expect(out.ok, isFalse);
      expect(out.error, 'x');
      expect(out.needsEmailConfirm, isFalse);
      expect(out.pendingRedirect, isFalse);
    });
  });
}
