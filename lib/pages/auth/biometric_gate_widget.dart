import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import '../../theme/app_theme.dart';
import '../../core/nav.dart';
import '../../widgets/app_button.dart';
import '../../app_state.dart';
import '../../services/auth_service.dart';

/// Quick re-entry gate ("כניסה מהירה"). The Supabase session is already
/// restored at this point — this screen does NOT secure anything; it only holds
/// rendering until the returning user confirms with Face ID / fingerprint, so a
/// shared device doesn't open straight into someone's saved plans. On success we
/// continue; the user can always fall back to a different account, and after a
/// few failed attempts we surface a password sign-in so nobody gets stuck.
class BiometricGateWidget extends StatefulWidget {
  const BiometricGateWidget({super.key});

  @override
  State<BiometricGateWidget> createState() => _BiometricGateWidgetState();
}

class _BiometricGateWidgetState extends State<BiometricGateWidget> {
  static const _maxAttempts = 3;

  bool _busy = false;
  bool _failed = false;
  int _failedAttempts = 0;

  bool get _exhausted => _failedAttempts >= _maxAttempts;

  @override
  void initState() {
    super.initState();
    // Prompt automatically on first frame — the common case is a one-tap entry.
    WidgetsBinding.instance.addPostFrameCallback((_) => _unlock());
  }

  Future<void> _unlock() async {
    if (_busy || _exhausted) return;
    setState(() {
      _busy = true;
      _failed = false;
    });
    final ok = await AuthService.instance.authenticateBiometric(
      reason: 'כניסה מהירה ל"חוסך"',
    );
    if (!mounted) return;
    if (ok) {
      setState(() => _busy = false);
      AuthService.instance.markUnlocked();
      context.goNamed('Home');
    } else {
      setState(() {
        _busy = false;
        _failed = true;
        _failedAttempts++;
      });
    }
  }

  /// Escape hatch — sign out of the restored session and send the user to the
  /// password sign-in, so a failing sensor never traps them in the app.
  Future<void> _signInWithPassword() async {
    await AuthService.instance.signOut();
    AuthService.instance.markUnlocked(); // don't re-gate after signing out
    if (!mounted) return;
    AppState().logout();
    context.goNamed('Auth');
  }

  Future<void> _useAnotherAccount() async {
    await AuthService.instance.signOut();
    AuthService.instance.markUnlocked(); // don't re-gate after signing out
    if (!mounted) return;
    AppState().logout();
    context.goNamed('Auth');
  }

  @override
  Widget build(BuildContext context) {
    final t = AppTheme.of(context);
    final name = AppState().firstName;
    return Scaffold(
      body: Container(
        decoration: BoxDecoration(gradient: t.brandGradient),
        child: SafeArea(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(28, 0, 28, 28),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              crossAxisAlignment: CrossAxisAlignment.center,
              children: [
                const Spacer(),
                Container(
                  width: 96,
                  height: 96,
                  decoration: BoxDecoration(
                    color: Colors.white.withValues(alpha: 0.14),
                    shape: BoxShape.circle,
                    border: Border.all(color: Colors.white.withValues(alpha: 0.35), width: 1.5),
                  ),
                  child: const Icon(Icons.fingerprint_rounded, color: Colors.white, size: 52),
                ).animate().scale(
                      duration: 400.ms,
                      begin: const Offset(0.9, 0.9),
                      end: const Offset(1, 1),
                      curve: Curves.easeOut,
                    ),
                const SizedBox(height: 28),
                Text('שלום $name',
                    style: t.headlineMedium.copyWith(color: Colors.white), textAlign: TextAlign.center),
                const SizedBox(height: 8),
                Text(
                  _exhausted
                      ? 'לא הצלחנו לזהות אתכם — היכנסו עם סיסמה'
                      : _failed
                          ? 'הכניסה המהירה לא הושלמה — נסו שוב'
                          : 'כניסה מהירה כדי להמשיך',
                  style: t.bodyLarge.copyWith(color: Colors.white.withValues(alpha: 0.85)),
                  textAlign: TextAlign.center,
                ),
                const Spacer(),
                if (_exhausted)
                  AppButton(
                    text: 'התחברו עם סיסמה',
                    width: double.infinity,
                    color: Colors.white,
                    textStyle: t.titleMedium.copyWith(color: AppColors.primary),
                    onPressed: _signInWithPassword,
                  )
                else
                  AppButton(
                    text: _busy ? 'מאמת…' : 'כניסה מהירה',
                    width: double.infinity,
                    color: Colors.white,
                    textStyle: t.titleMedium.copyWith(color: AppColors.primary),
                    onPressed: () async => _unlock(),
                  ),
                const SizedBox(height: 12),
                TextButton(
                  onPressed: _busy ? null : _useAnotherAccount,
                  child: Text('כניסה עם חשבון אחר',
                      style: t.bodyMedium.copyWith(color: Colors.white, fontWeight: FontWeight.w600)),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
