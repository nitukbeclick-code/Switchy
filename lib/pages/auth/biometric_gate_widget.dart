import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import '../../theme/app_theme.dart';
import '../../core/nav.dart';
import '../../widgets/app_button.dart';
import '../../app_state.dart';
import '../../services/auth_service.dart';

/// Cold-start Face ID / fingerprint lock. Shown only when a real (logged-in)
/// user enabled biometric quick-login — the router redirects here before Home.
/// On success we mark the session unlocked and continue; the user can also fall
/// back to signing in with a different account.
class BiometricGateWidget extends StatefulWidget {
  const BiometricGateWidget({super.key});

  @override
  State<BiometricGateWidget> createState() => _BiometricGateWidgetState();
}

class _BiometricGateWidgetState extends State<BiometricGateWidget> {
  bool _busy = false;
  bool _failed = false;

  @override
  void initState() {
    super.initState();
    // Prompt automatically on first frame — the common case is a one-tap unlock.
    WidgetsBinding.instance.addPostFrameCallback((_) => _unlock());
  }

  Future<void> _unlock() async {
    if (_busy) return;
    setState(() {
      _busy = true;
      _failed = false;
    });
    final ok = await AuthService.instance.authenticateBiometric(
      reason: 'אמתו את זהותכם כדי להיכנס ל"חוסך"',
    );
    if (!mounted) return;
    setState(() => _busy = false);
    if (ok) {
      AuthService.instance.markUnlocked();
      context.goNamed('Home');
    } else {
      setState(() => _failed = true);
    }
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
                ).animate(onPlay: (c) => c.repeat(reverse: true)).scale(
                      duration: 1400.ms,
                      begin: const Offset(1, 1),
                      end: const Offset(1.06, 1.06),
                      curve: Curves.easeInOut,
                    ),
                const SizedBox(height: 28),
                Text('שלום $name 👋',
                    style: t.headlineMedium.copyWith(color: Colors.white), textAlign: TextAlign.center),
                const SizedBox(height: 8),
                Text(
                  _failed ? 'האימות לא הושלם — נסו שוב' : 'אמתו את זהותכם כדי להמשיך',
                  style: t.bodyLarge.copyWith(color: Colors.white.withValues(alpha: 0.85)),
                  textAlign: TextAlign.center,
                ),
                const Spacer(),
                AppButton(
                  text: _busy ? 'מאמת…' : 'כניסה עם Face ID',
                  width: double.infinity,
                  color: Colors.white,
                  textStyle: t.titleMedium.copyWith(color: t.primary),
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
