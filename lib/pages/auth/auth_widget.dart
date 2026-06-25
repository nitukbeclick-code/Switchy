import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:url_launcher/url_launcher.dart';
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

  // Legal consent (Israeli Privacy Protection Regs + Spam Law). Terms + privacy
  // are mandatory to create an account; marketing is opt-in (unchecked default).
  bool _acceptTerms = false;
  bool _acceptPrivacy = false;
  bool _acceptMarketing = false;
  bool get _consentOk => _acceptTerms && _acceptPrivacy;

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
      AppSnackBar.info(context, 'כמעט שם — משלימים את ההתחברות…');
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
      body: DecoratedBox(
        // Faint glass wash so the sign-in surface reads with depth, not flat.
        decoration: BoxDecoration(gradient: t.surfaceWash),
        child: SafeArea(
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
                        child: Center(child: CircularProgressIndicator(color: t.brandAccent)),
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
      ),
    );
  }

  Widget _header(AppTheme t) {
    final title = switch (_mode) {
      _Mode.login => 'ברוכים הבאים חזרה',
      _Mode.signup => 'יוצרים חשבון',
      _Mode.choose => 'מצטרפים ל-Switchy AI',
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
                Hero(
                  tag: 'brand-mark',
                  child: Container(
                    width: 44,
                    height: 44,
                    decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(t.radiusSm)),
                    child: Center(
                      child: ExcludeSemantics(
                        child: Text('₪', style: t.headlineSmall.copyWith(color: AppColors.primaryDark)),
                      ),
                    ),
                  ),
                ),
                const SizedBox(width: 12),
                Text('Switchy AI', style: t.headlineMedium.copyWith(color: Colors.white)),
              ],
            ),
            const SizedBox(height: 14),
            Semantics(
              header: true,
              child: Text(title, style: t.headlineMedium.copyWith(color: Colors.white)),
            ),
            const SizedBox(height: 6),
            Text(sub, style: t.bodyMedium.copyWith(color: Colors.white.withValues(alpha: 0.85))),
          ],
        ),
      ),
    ).animate().fadeIn(duration: 300.ms);
  }

  Future<void> _openLegal(String page) async {
    final uri = Uri.parse('https://chosech.co.il/$page');
    try {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    } catch (_) {
      if (mounted) AppSnackBar.info(context, 'לא ניתן לפתוח את המסמך כרגע');
    }
  }

  void _consentMissing() =>
      AppSnackBar.info(context, 'יש לאשר את תנאי השימוש ומדיניות הפרטיות כדי להמשיך');

  void _oauth(OAuthProvider provider) {
    // OAuth creates/links an account → require consent first, then arm it so the
    // server stamps it once the redirect completes (see main.dart listener).
    if (!_consentOk) {
      _consentMissing();
      return;
    }
    AuthService.instance.armConsent(marketing: _acceptMarketing);
    _runAuth(() => AuthService.instance.signInWithOAuth(provider), name: '');
  }

  /// Three quiet benefit rows explaining what an account unlocks — keeps the
  /// sign-in screen friendly and the value obvious. Decorative icons are
  /// excluded from semantics; the copy carries the meaning.
  Widget _benefitsStrip(AppTheme t) {
    const items = <(IconData, String)>[
      (Icons.bookmark_added_outlined, 'שמירת מסלולים והשוואות מועדפות'),
      (Icons.notifications_active_outlined, 'התראה כשמגיע מחיר טוב יותר'),
      (Icons.lock_outline_rounded, 'הנתונים שלכם נשמרים ומאובטחים'),
    ];
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
      decoration: t.cardDecoration(radius: t.radiusLg),
      child: Column(
        children: [
          for (final (icon, label) in items) ...[
            Row(
              children: [
                Container(
                  width: 34,
                  height: 34,
                  decoration: BoxDecoration(
                    color: t.brandAccentTint,
                    borderRadius: BorderRadius.circular(t.radiusSm),
                  ),
                  child: ExcludeSemantics(child: Icon(icon, size: 18, color: t.brandAccent)),
                ),
                const SizedBox(width: 12),
                Expanded(child: Text(label, style: t.bodySmall.copyWith(color: t.primaryText))),
              ],
            ),
            if (label != items.last.$2) const SizedBox(height: 12),
          ],
        ],
      ),
    );
  }

  /// The legal consent block (mandatory terms + privacy, optional marketing).
  Widget _consentPanel(AppTheme t) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _consentRow(t,
            value: _acceptTerms,
            onChanged: (v) => setState(() => _acceptTerms = v ?? false),
            lead: 'קראתי ואני מסכים/ה ל',
            link: 'תנאי השימוש',
            page: 'terms.html'),
        _consentRow(t,
            value: _acceptPrivacy,
            onChanged: (v) => setState(() => _acceptPrivacy = v ?? false),
            lead: 'קראתי ואני מסכים/ה ל',
            link: 'מדיניות הפרטיות',
            page: 'privacy.html'),
        _consentRow(t,
            value: _acceptMarketing,
            onChanged: (v) => setState(() => _acceptMarketing = v ?? false),
            lead: 'אני מעוניין/ת לקבל דיוור שיווקי ומבצעים (אופציונלי)'),
      ],
    );
  }

  Widget _consentRow(
    AppTheme t, {
    required bool value,
    required ValueChanged<bool?> onChanged,
    required String lead,
    String? link,
    String? page,
  }) {
    final label = Text.rich(
      TextSpan(
        text: lead,
        style: t.bodySmall.copyWith(color: t.secondaryText, height: 1.35),
        children: link != null
            ? [
                TextSpan(
                  text: link,
                  style: t.bodySmall.copyWith(
                      color: t.brandAccent, fontWeight: FontWeight.w700, decoration: TextDecoration.underline),
                ),
              ]
            : null,
      ),
    );
    return Row(
      children: [
        SizedBox(
          width: 40,
          height: 40,
          child: Checkbox(
            value: value,
            onChanged: onChanged,
            activeColor: t.brandAccent,
            visualDensity: VisualDensity.compact,
            materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
          ),
        ),
        Expanded(
          child: page != null
              ? Semantics(
                  button: true,
                  label: 'פתח $link',
                  child: InkWell(onTap: () => _openLegal(page), child: label),
                )
              : label,
        ),
      ],
    );
  }

  Widget _chooseBody(AppTheme t) {
    return Column(
      children: [
        if (_faceIdAvailable) ...[
          _SocialButton(
            label: 'כניסה מהירה עם Face ID',
            icon: Icons.fingerprint_rounded,
            gradient: t.accentGradient,
            shadow: t.shadowAccent,
            bg: t.brandAccent,
            fg: Colors.white,
            onTap: _busy ? null : _faceIdLogin,
          ),
          const SizedBox(height: 12),
        ],
        // Why sign in — three honest benefits, so the choice feels worthwhile
        // (and the guest option below stays a genuine choice, not a trap).
        _benefitsStrip(t),
        const SizedBox(height: 16),
        _consentPanel(t),
        const SizedBox(height: 14),
        _SocialButton(
          // The Google button keeps its brand white surface in both themes, so
          // its label/glyph must read on white regardless of app brightness — a
          // fixed ink foreground, not the theme-aware primaryText (off-white on
          // dark would vanish).
          label: 'המשך עם Google',
          glyph: 'G',
          glyphColor: const Color(0xFF4285F4),
          bg: Colors.white,
          fg: AppColors.primaryText,
          bordered: true,
          onTap: _busy ? null : () => _oauth(OAuthProvider.google),
        ),
        const SizedBox(height: 12),
        _SocialButton(
          label: 'המשך עם Facebook',
          icon: Icons.facebook_rounded,
          bg: const Color(0xFF1877F2),
          fg: Colors.white,
          onTap: _busy ? null : () => _oauth(OAuthProvider.facebook),
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
          color: AppColors.primary,
          onPressed: () async => setState(() => _mode = _Mode.signup),
          width: double.infinity,
        ),
        const SizedBox(height: 14),
        TextButton(
          onPressed: () => setState(() => _mode = _Mode.login),
          child: Text.rich(TextSpan(
            text: 'כבר רשומים? ',
            style: t.bodyMedium.copyWith(color: t.secondaryText),
            children: [TextSpan(text: 'התחברו', style: t.bodyMedium.copyWith(color: t.brandAccent, fontWeight: FontWeight.w700))],
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
                child: Text('שכחתי סיסמה', style: t.labelMedium.copyWith(color: t.brandAccent)),
              ),
            ),
          ],
          if (isSignup) ...[
            const SizedBox(height: 14),
            _consentPanel(t),
          ],
          const SizedBox(height: 18),
          AppButton(
            text: isSignup ? 'יצירת חשבון' : 'התחברות',
            color: AppColors.primary,
            onPressed: () async {
              if (!_formKey.currentState!.validate()) return;
              if (isSignup) {
                if (!_consentOk) {
                  _consentMissing();
                  return;
                }
                await _runAuth(
                  () => AuthService.instance.signUpWithEmail(
                    email: _emailCtrl.text,
                    password: _passCtrl.text,
                    name: _nameCtrl.text,
                    acceptedTerms: _acceptTerms,
                    acceptedPrivacy: _acceptPrivacy,
                    acceptedMarketing: _acceptMarketing,
                  ),
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
              style: t.bodyMedium.copyWith(color: t.brandAccent, fontWeight: FontWeight.w700),
            ),
          ),
        ],
      ),
    ).animate().fadeIn(duration: 240.ms);
  }

  Future<void> _forgotPassword() async {
    final email = _emailCtrl.text.trim();
    if (!email.contains('@')) {
      AppSnackBar.info(context, 'הזינו את כתובת המייל שלכם ולחצו שוב על "שכחתי סיסמה"');
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
            borderRadius: BorderRadius.circular(t.radiusMd), borderSide: BorderSide(color: t.brandAccent, width: 1.5)),
      ),
    );
  }
}

class _SocialButton extends StatefulWidget {
  const _SocialButton({
    required this.label,
    required this.bg,
    required this.fg,
    this.onTap,
    this.icon,
    this.glyph,
    this.glyphColor,
    this.bordered = false,
    this.gradient,
    this.shadow,
  });

  final String label;
  final Color bg;
  final Color fg;
  final VoidCallback? onTap;
  final IconData? icon;
  final String? glyph;
  final Color? glyphColor;
  final bool bordered;
  final Gradient? gradient;
  final List<BoxShadow>? shadow;

  @override
  State<_SocialButton> createState() => _SocialButtonState();
}

class _SocialButtonState extends State<_SocialButton> {
  bool _pressed = false;

  void _setPressed(bool v) {
    if (_pressed == v) return;
    setState(() => _pressed = v);
  }

  @override
  Widget build(BuildContext context) {
    final t = AppTheme.of(context);
    final disabled = widget.onTap == null;
    final reduceMotion = MediaQuery.maybeOf(context)?.disableAnimations ?? false;
    final inner = Semantics(
      button: true,
      enabled: !disabled,
      label: widget.label,
      child: Container(
        decoration: widget.gradient != null
            ? BoxDecoration(
                borderRadius: BorderRadius.circular(t.radiusMd),
                boxShadow: disabled ? null : widget.shadow,
              )
            : null,
        child: Material(
          color: widget.gradient != null ? Colors.transparent : widget.bg,
          borderRadius: BorderRadius.circular(t.radiusMd),
          child: InkWell(
            onTap: widget.onTap,
            onTapDown: disabled ? null : (_) => _setPressed(true),
            onTapUp: disabled ? null : (_) => _setPressed(false),
            onTapCancel: disabled ? null : () => _setPressed(false),
            borderRadius: BorderRadius.circular(t.radiusMd),
            child: Container(
              height: 52,
              decoration: BoxDecoration(
                gradient: widget.gradient,
                borderRadius: BorderRadius.circular(t.radiusMd),
                border: widget.bordered ? Border.all(color: t.alternate) : null,
              ),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  if (widget.icon != null)
                    Icon(widget.icon, color: widget.fg, size: 22)
                  else if (widget.glyph != null)
                    Text(widget.glyph!, style: t.titleMedium.copyWith(color: widget.glyphColor ?? widget.fg, fontWeight: FontWeight.w800)),
                  const SizedBox(width: 10),
                  Text(widget.label, style: t.titleSmall.copyWith(color: widget.fg)),
                ],
              ),
            ),
          ),
        ),
      ),
    );
    if (reduceMotion) return inner;
    // A restrained tactile press — the same gentle scale-down the primary CTA
    // uses, so every actionable surface on this screen reacts to touch.
    return AnimatedScale(
      scale: _pressed ? t.pressScale : 1.0,
      duration: t.motionFast,
      curve: t.easeOut,
      child: inner,
    );
  }
}
