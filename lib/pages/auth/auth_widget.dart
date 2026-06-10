import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:supabase_flutter/supabase_flutter.dart' show OAuthProvider;
import '../../theme/app_theme.dart';
import '../../core/nav.dart';
import '../../widgets/app_button.dart';
import '../../widgets/app_snackbar.dart';
import '../../app_state.dart';
import '../../services/auth_service.dart';
import '../../services/backend/local_backend.dart';

/// The entry / sign-in page. Login is OPTIONAL — a guest can skip and browse;
/// signing in (Google / Facebook / email+password) upgrades them to a real
/// account so save/track/reviews persist. Registered users on a biometric
/// device get a one-tap Face ID login.
class AuthWidget extends StatefulWidget {
  const AuthWidget({super.key});

  @override
  State<AuthWidget> createState() => _AuthWidgetState();
}

enum _Mode { choose, signup, login }

class _AuthWidgetState extends State<AuthWidget> {
  _Mode _mode = _Mode.choose;
  bool _busy = false;
  bool _obscure = true;
  bool _faceIdAvailable = false;

  final _formKey = GlobalKey<FormState>();
  final _nameCtrl = TextEditingController();
  final _emailCtrl = TextEditingController();
  final _passCtrl = TextEditingController();
  final _confirmCtrl = TextEditingController();

  @override
  void initState() {
    super.initState();
    AuthService.instance.biometricAvailable().then((avail) async {
      final enabled = await AuthService.instance.biometricEnabled;
      if (mounted) setState(() => _faceIdAvailable = avail && enabled && AuthService.instance.isRealUser);
    });
  }

  @override
  void dispose() {
    _nameCtrl.dispose();
    _emailCtrl.dispose();
    _passCtrl.dispose();
    _confirmCtrl.dispose();
    super.dispose();
  }

  void _enterAsGuest() {
    AppState().markOnboardingSeen();
    context.goNamed('Home');
  }

  Future<void> _runAuth(Future<AuthOutcome> Function() action, {required String name}) async {
    setState(() => _busy = true);
    final res = await action();
    if (!mounted) return;
    setState(() => _busy = false);
    if (!res.ok) {
      AppSnackBar.error(context, res.error ?? 'אירעה שגיאה — נסו שוב');
      return;
    }
    if (res.needsEmailConfirm) {
      AppSnackBar.success(context, 'נשלח אליכם מייל אישור — אשרו אותו וחזרו להתחבר');
      setState(() => _mode = _Mode.login);
      return;
    }
    if (res.pendingRedirect) {
      // OAuth: the session arrives via the auth-state listener in main.dart,
      // which logs in + navigates. Just show a gentle waiting state.
      AppSnackBar.info(context, 'ממתינים לאישור ההתחברות…');
      return;
    }
    // Email success → mirror identity locally and enter.
    final n = name.trim().isNotEmpty ? name.trim() : (AuthService.instance.currentEmail ?? 'משתמש');
    AppState().login(name: n, phone: AppState().userPhone, email: _emailCtrl.text.trim());
    appBackend.upsertProfile(name: n, phone: AppState().userPhone, email: _emailCtrl.text.trim()).catchError((_) {});
    AppState().markOnboardingSeen();
    context.goNamed('Home');
  }

  Future<void> _faceIdLogin() async {
    setState(() => _busy = true);
    final ok = await AuthService.instance.authenticateBiometric();
    if (!mounted) return;
    setState(() => _busy = false);
    if (ok) {
      context.goNamed('Home');
    } else {
      AppSnackBar.error(context, 'אימות Face ID נכשל — נסו שוב או התחברו עם מייל');
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = AppTheme.of(context);
    return Scaffold(
      backgroundColor: t.background,
      body: SafeArea(
        top: false,
        child: SingleChildScrollView(
          child: Column(
            children: [
              _header(t),
              Padding(
                padding: const EdgeInsets.fromLTRB(22, 24, 22, 32),
                child: _busy && _mode == _Mode.choose
                    ? Padding(
                        padding: const EdgeInsets.symmetric(vertical: 40),
                        child: Center(child: CircularProgressIndicator(color: t.primary)),
                      )
                    : switch (_mode) {
                        _Mode.choose => _chooseBody(t),
                        _Mode.signup => _emailForm(t, isSignup: true),
                        _Mode.login => _emailForm(t, isSignup: false),
                      },
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _header(AppTheme t) {
    final title = switch (_mode) {
      _Mode.login => 'ברוכים הבאים חזרה',
      _Mode.signup => 'יוצרים חשבון',
      _Mode.choose => 'מצטרפים לחוסך',
    };
    final sub = switch (_mode) {
      _Mode.login => 'התחברו כדי לראות את החיסכון שלכם',
      _Mode.signup => 'נרשמים פעם אחת — חוסכים תמיד',
      _Mode.choose => 'התחברו כדי לשמור מסלולים, לעקוב ולדרג',
    };
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.fromLTRB(22, 0, 22, 34),
      decoration: BoxDecoration(
        gradient: t.brandGradient,
        boxShadow: t.shadowLifted,
      ),
      child: SafeArea(
        bottom: false,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                if (_mode != _Mode.choose)
                  IconButton(
                    icon: const Icon(Icons.arrow_back_rounded, color: Colors.white),
                    tooltip: 'חזרה',
                    onPressed: () => setState(() => _mode = _Mode.choose),
                  )
                else
                  IconButton(
                    icon: const Icon(Icons.arrow_back_rounded, color: Colors.white),
                    tooltip: 'חזרה',
                    onPressed: () => context.safePop(),
                  ),
                const Spacer(),
                TextButton(
                  onPressed: _enterAsGuest,
                  child: Text('המשך כאורח', style: t.bodyMedium.copyWith(color: Colors.white)),
                ),
              ],
            ),
            const SizedBox(height: 8),
            Row(
              children: [
                Container(
                  width: 44,
                  height: 44,
                  decoration: BoxDecoration(color: t.secondary, borderRadius: BorderRadius.circular(t.radiusSm)),
                  child: Center(child: Text('₪', style: t.headlineSmall.copyWith(color: t.primaryDark))),
                ),
                const SizedBox(width: 12),
                Text('חוסך', style: t.headlineMedium.copyWith(color: Colors.white)),
              ],
            ),
            const SizedBox(height: 14),
            Text(title, style: t.headlineMedium.copyWith(color: Colors.white)),
            const SizedBox(height: 6),
            Text(sub, style: t.bodyMedium.copyWith(color: Colors.white.withValues(alpha: 0.85))),
          ],
        ),
      ),
    ).animate().fadeIn(duration: 300.ms);
  }

  Widget _chooseBody(AppTheme t) {
    return Column(
      children: [
        if (_faceIdAvailable) ...[
          _SocialButton(
            label: 'כניסה מהירה עם Face ID',
            icon: Icons.fingerprint_rounded,
            bg: t.primary,
            fg: Colors.white,
            onTap: _busy ? null : _faceIdLogin,
          ),
          const SizedBox(height: 12),
        ],
        _SocialButton(
          label: 'המשך עם Google',
          glyph: 'G',
          glyphColor: const Color(0xFF4285F4),
          bg: Colors.white,
          fg: t.primaryText,
          bordered: true,
          onTap: _busy ? null : () => _runAuth(() => AuthService.instance.signInWithOAuth(OAuthProvider.google), name: ''),
        ),
        const SizedBox(height: 12),
        _SocialButton(
          label: 'המשך עם Facebook',
          icon: Icons.facebook_rounded,
          bg: const Color(0xFF1877F2),
          fg: Colors.white,
          onTap: _busy ? null : () => _runAuth(() => AuthService.instance.signInWithOAuth(OAuthProvider.facebook), name: ''),
        ),
        const SizedBox(height: 18),
        Row(children: [
          Expanded(child: Divider(color: t.alternate)),
          Padding(padding: const EdgeInsets.symmetric(horizontal: 12), child: Text('או', style: t.labelMedium)),
          Expanded(child: Divider(color: t.alternate)),
        ]),
        const SizedBox(height: 18),
        AppButton(
          text: 'הרשמה עם מייל',
          color: t.primary,
          onPressed: () async => setState(() => _mode = _Mode.signup),
          width: double.infinity,
        ),
        const SizedBox(height: 14),
        TextButton(
          onPressed: () => setState(() => _mode = _Mode.login),
          child: Text.rich(TextSpan(
            text: 'כבר רשומים? ',
            style: t.bodyMedium.copyWith(color: t.secondaryText),
            children: [TextSpan(text: 'התחברו', style: t.bodyMedium.copyWith(color: t.primary, fontWeight: FontWeight.w700))],
          )),
        ),
      ],
    ).animate().fadeIn(duration: 260.ms).slideY(begin: 0.04);
  }

  Widget _emailForm(AppTheme t, {required bool isSignup}) {
    return Form(
      key: _formKey,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (isSignup) ...[
            _field(t, _nameCtrl, 'שם מלא', Icons.person_outline_rounded,
                autofill: const [AutofillHints.name],
                validator: (v) => (v == null || v.trim().length < 2) ? 'נא להזין שם' : null),
            const SizedBox(height: 14),
          ],
          _field(t, _emailCtrl, 'מייל', Icons.mail_outline_rounded,
              keyboard: TextInputType.emailAddress,
              autofill: const [AutofillHints.email],
              ltr: true,
              validator: (v) {
                final s = (v ?? '').trim();
                return (!s.contains('@') || !s.contains('.')) ? 'מייל לא תקין' : null;
              }),
          const SizedBox(height: 14),
          _field(t, _passCtrl, 'סיסמה', Icons.lock_outline_rounded,
              obscure: _obscure,
              ltr: true,
              autofill: isSignup ? const [AutofillHints.newPassword] : const [AutofillHints.password],
              suffix: IconButton(
                icon: Icon(_obscure ? Icons.visibility_off_rounded : Icons.visibility_rounded, color: t.secondaryText),
                tooltip: _obscure ? 'הצג סיסמה' : 'הסתר סיסמה',
                onPressed: () => setState(() => _obscure = !_obscure),
              ),
              validator: (v) => (v == null || v.length < 6) ? 'הסיסמה חייבת לפחות 6 תווים' : null),
          if (isSignup) ...[
            const SizedBox(height: 14),
            _field(t, _confirmCtrl, 'אימות סיסמה', Icons.lock_outline_rounded,
                obscure: _obscure,
                ltr: true,
                validator: (v) => (v != _passCtrl.text) ? 'הסיסמאות אינן תואמות' : null),
          ],
          if (!isSignup) ...[
            const SizedBox(height: 8),
            Align(
              alignment: AlignmentDirectional.centerStart,
              child: TextButton(
                onPressed: _busy ? null : _forgotPassword,
                child: Text('שכחתי סיסמה', style: t.labelMedium.copyWith(color: t.primary)),
              ),
            ),
          ],
          const SizedBox(height: 18),
          AppButton(
            text: isSignup ? 'יצירת חשבון' : 'התחברות',
            color: t.primary,
            onPressed: () async {
              if (!_formKey.currentState!.validate()) return;
              if (isSignup) {
                await _runAuth(
                  () => AuthService.instance.signUpWithEmail(
                      email: _emailCtrl.text, password: _passCtrl.text, name: _nameCtrl.text),
                  name: _nameCtrl.text,
                );
              } else {
                await _runAuth(
                  () => AuthService.instance.signInWithEmail(email: _emailCtrl.text, password: _passCtrl.text),
                  name: '',
                );
              }
            },
            width: double.infinity,
          ),
          const SizedBox(height: 14),
          TextButton(
            onPressed: () => setState(() => _mode = isSignup ? _Mode.login : _Mode.signup),
            child: Text(
              isSignup ? 'כבר רשומים? התחברו' : 'אין לכם חשבון? הרשמו',
              style: t.bodyMedium.copyWith(color: t.primary, fontWeight: FontWeight.w700),
            ),
          ),
        ],
      ),
    ).animate().fadeIn(duration: 240.ms);
  }

  Future<void> _forgotPassword() async {
    final email = _emailCtrl.text.trim();
    if (!email.contains('@')) {
      AppSnackBar.info(context, 'הזינו מייל ולחצו שוב על "שכחתי סיסמה"');
      return;
    }
    setState(() => _busy = true);
    final res = await AuthService.instance.sendPasswordReset(email);
    if (!mounted) return;
    setState(() => _busy = false);
    res.ok
        ? AppSnackBar.success(context, 'נשלח קישור לאיפוס הסיסמה למייל')
        : AppSnackBar.error(context, res.error ?? 'השליחה נכשלה');
  }

  Widget _field(
    AppTheme t,
    TextEditingController c,
    String label,
    IconData icon, {
    bool obscure = false,
    bool ltr = false,
    TextInputType? keyboard,
    List<String>? autofill,
    Widget? suffix,
    String? Function(String?)? validator,
  }) {
    return TextFormField(
      controller: c,
      obscureText: obscure,
      keyboardType: keyboard,
      autofillHints: autofill,
      textDirection: ltr ? TextDirection.ltr : TextDirection.rtl,
      validator: validator,
      decoration: InputDecoration(
        labelText: label,
        prefixIcon: Icon(icon, color: t.secondaryText),
        suffixIcon: suffix,
        filled: true,
        fillColor: t.secondaryBackground,
        border: OutlineInputBorder(borderRadius: BorderRadius.circular(t.radiusMd), borderSide: BorderSide.none),
        enabledBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(t.radiusMd), borderSide: BorderSide(color: t.alternate)),
        focusedBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(t.radiusMd), borderSide: BorderSide(color: t.primary, width: 1.5)),
      ),
    );
  }
}

class _SocialButton extends StatelessWidget {
  const _SocialButton({
    required this.label,
    required this.bg,
    required this.fg,
    this.onTap,
    this.icon,
    this.glyph,
    this.glyphColor,
    this.bordered = false,
  });

  final String label;
  final Color bg;
  final Color fg;
  final VoidCallback? onTap;
  final IconData? icon;
  final String? glyph;
  final Color? glyphColor;
  final bool bordered;

  @override
  Widget build(BuildContext context) {
    final t = AppTheme.of(context);
    return Semantics(
      button: true,
      label: label,
      child: Material(
        color: bg,
        borderRadius: BorderRadius.circular(t.radiusMd),
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(t.radiusMd),
          child: Container(
            height: 52,
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(t.radiusMd),
              border: bordered ? Border.all(color: t.alternate) : null,
            ),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                if (icon != null)
                  Icon(icon, color: fg, size: 22)
                else if (glyph != null)
                  Text(glyph!, style: t.titleMedium.copyWith(color: glyphColor ?? fg, fontWeight: FontWeight.w800)),
                const SizedBox(width: 10),
                Text(label, style: t.titleSmall.copyWith(color: fg)),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
