import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:flutter_animate/flutter_animate.dart';
import '../../flutter_flow/flutter_flow_theme.dart';
import '../../flutter_flow/flutter_flow_util.dart';
import '../../flutter_flow/flutter_flow_widgets.dart';
import '../../app_state.dart';

class AuthWidget extends StatefulWidget {
  const AuthWidget({super.key});

  @override
  State<AuthWidget> createState() => _AuthWidgetState();
}

class _AuthWidgetState extends State<AuthWidget> {
  final _nameCtrl = TextEditingController();
  final _phoneCtrl = TextEditingController();
  final _formKey = GlobalKey<FormState>();
  bool _isLogin = false;

  @override
  void dispose() {
    _nameCtrl.dispose();
    _phoneCtrl.dispose();
    super.dispose();
  }

  void _submit() {
    if (!_formKey.currentState!.validate()) return;
    final appState = Provider.of<FFAppState>(context, listen: false);
    // For login mode, keep existing name if present and user left name blank
    final name = _nameCtrl.text.trim().isNotEmpty
        ? _nameCtrl.text.trim()
        : (appState.isLoggedIn ? appState.userName : 'משתמש');
    appState.login(name: name, phone: _phoneCtrl.text.trim());
    context.goNamed('Home');
  }

  @override
  Widget build(BuildContext context) {
    final ffTheme = FlutterFlowTheme.of(context);

    return Scaffold(
      backgroundColor: ffTheme.background,
      body: SafeArea(
        child: SingleChildScrollView(
          child: Column(
            children: [
              // Green header with branding
              Container(
                width: double.infinity,
                padding: const EdgeInsets.fromLTRB(24, 32, 24, 36),
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.topRight,
                    end: Alignment.bottomLeft,
                    colors: [const Color(0xFF0E3A26), ffTheme.primary],
                  ),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        IconButton(
                          icon: const Icon(Icons.arrow_back_rounded, color: Colors.white),
                          onPressed: () => context.safePop(),
                        ),
                        const Spacer(),
                        TextButton(
                          onPressed: () => context.goNamed('Home'),
                          child: Text('דלג', style: ffTheme.bodyMedium.override(color: Colors.white70)),
                        ),
                      ],
                    ),
                    const SizedBox(height: 12),
                    Text(_isLogin ? '👋 ברוכים הבאים חזרה' : '🎉 הצטרפו לחוסך',
                        style: ffTheme.headlineMedium.override(color: Colors.white)),
                    const SizedBox(height: 6),
                    Text(
                      _isLogin ? 'התחברו כדי לראות את החיסכון שלכם' : 'הרשמה מהירה — חוסכים עוד היום',
                      style: ffTheme.bodyMedium.override(color: Colors.white70),
                    ),
                    if (!_isLogin) ...[
                      const SizedBox(height: 16),
                      Row(
                        children: [
                          _Benefit(text: 'ללא עלות', ffTheme: ffTheme),
                          const SizedBox(width: 10),
                          _Benefit(text: 'ללא התחייבות', ffTheme: ffTheme),
                          const SizedBox(width: 10),
                          _Benefit(text: 'פרטיות מלאה', ffTheme: ffTheme),
                        ],
                      ),
                      const SizedBox(height: 14),
                      Row(
                        children: [
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                            decoration: BoxDecoration(
                              color: Colors.white.withOpacity(0.12),
                              borderRadius: BorderRadius.circular(20),
                            ),
                            child: Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                const Text('⭐', style: TextStyle(fontSize: 13)),
                                const SizedBox(width: 5),
                                Text('60K+ משתמשים פעילים', style: ffTheme.labelSmall.override(color: Colors.white70)),
                              ],
                            ),
                          ),
                          const SizedBox(width: 8),
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                            decoration: BoxDecoration(
                              color: Colors.white.withOpacity(0.12),
                              borderRadius: BorderRadius.circular(20),
                            ),
                            child: Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                const Text('💰', style: TextStyle(fontSize: 13)),
                                const SizedBox(width: 5),
                                Text('₪850 חיסכון ממוצע', style: ffTheme.labelSmall.override(color: Colors.white70)),
                              ],
                            ),
                          ),
                        ],
                      ),
                    ],
                  ],
                ),
              ).animate().fadeIn(duration: 400.ms),

              Padding(
                padding: const EdgeInsets.all(24),
                child: Form(
                  key: _formKey,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      if (!_isLogin) ...[
                        Text('שם מלא', style: ffTheme.labelLarge),
                        const SizedBox(height: 8),
                        TextFormField(
                          controller: _nameCtrl,
                          textDirection: TextDirection.rtl,
                          decoration: InputDecoration(
                            hintText: 'ישראל ישראלי',
                            filled: true,
                            fillColor: Colors.white,
                            prefixIcon: Icon(Icons.person_outline_rounded, color: ffTheme.secondaryText),
                            border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide.none),
                            enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide(color: ffTheme.alternate)),
                            focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide(color: ffTheme.primary, width: 1.5)),
                          ),
                          validator: (v) => (v == null || v.trim().isEmpty) ? 'אנא הכניסו שם' : null,
                        ).animate().fadeIn(duration: 300.ms).slideY(begin: 0.05),
                        const SizedBox(height: 20),
                      ],

                      Text('מספר טלפון', style: ffTheme.labelLarge),
                      const SizedBox(height: 8),
                      TextFormField(
                        controller: _phoneCtrl,
                        keyboardType: TextInputType.phone,
                        textDirection: TextDirection.ltr,
                        decoration: InputDecoration(
                          hintText: '050-0000000',
                          filled: true,
                          fillColor: Colors.white,
                          prefixIcon: Icon(Icons.phone_outlined, color: ffTheme.secondaryText),
                          border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide.none),
                          enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide(color: ffTheme.alternate)),
                          focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide(color: ffTheme.primary, width: 1.5)),
                        ),
                        validator: (v) => (v == null || v.trim().length < 10) ? 'אנא הכניסו מספר טלפון תקין' : null,
                      ).animate().fadeIn(delay: 60.ms).slideY(begin: 0.05),

                      const SizedBox(height: 28),

                      FFButtonWidget(
                        text: _isLogin ? 'כניסה לחשבון' : 'צור חשבון חינם',
                        onPressed: () async => _submit(),
                        options: FFButtonOptions(
                          width: double.infinity,
                          height: 56,
                          color: ffTheme.primary,
                          textStyle: ffTheme.titleMedium.override(color: Colors.white),
                          borderRadius: BorderRadius.circular(18),
                        ),
                      ).animate().fadeIn(delay: 100.ms),

                      const SizedBox(height: 20),

                      // Divider with "or"
                      Row(
                        children: [
                          Expanded(child: Divider(color: ffTheme.alternate)),
                          Padding(
                            padding: const EdgeInsets.symmetric(horizontal: 12),
                            child: Text('או', style: ffTheme.labelSmall.override(color: ffTheme.secondaryText)),
                          ),
                          Expanded(child: Divider(color: ffTheme.alternate)),
                        ],
                      ).animate().fadeIn(delay: 150.ms),

                      const SizedBox(height: 16),

                      // Social login placeholders
                      Row(
                        children: [
                          Expanded(
                            child: OutlinedButton.icon(
                              onPressed: () => ScaffoldMessenger.of(context).showSnackBar(
                                const SnackBar(content: Text('כניסה עם גוגל — בקרוב'), duration: Duration(seconds: 2)),
                              ),
                              style: OutlinedButton.styleFrom(
                                side: BorderSide(color: ffTheme.alternate),
                                padding: const EdgeInsets.symmetric(vertical: 13),
                                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                              ),
                              icon: const Text('G', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: Color(0xFF4285F4))),
                              label: Text('גוגל', style: ffTheme.labelMedium),
                            ),
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: OutlinedButton.icon(
                              onPressed: () => ScaffoldMessenger.of(context).showSnackBar(
                                const SnackBar(content: Text('כניסה עם Apple — בקרוב'), duration: Duration(seconds: 2)),
                              ),
                              style: OutlinedButton.styleFrom(
                                side: BorderSide(color: ffTheme.alternate),
                                padding: const EdgeInsets.symmetric(vertical: 13),
                                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                              ),
                              icon: const Icon(Icons.apple_rounded, size: 18),
                              label: Text('Apple', style: ffTheme.labelMedium),
                            ),
                          ),
                        ],
                      ).animate().fadeIn(delay: 180.ms),

                      const SizedBox(height: 16),

                      Center(
                        child: TextButton(
                          onPressed: () => setState(() => _isLogin = !_isLogin),
                          child: Text(
                            _isLogin ? 'עדיין אין חשבון? הצטרפו בחינם' : 'יש לכם כבר חשבון? התחברו',
                            style: ffTheme.bodyMedium.override(color: ffTheme.primary, fontWeight: FontWeight.w600),
                          ),
                        ),
                      ),

                      const SizedBox(height: 8),
                      Center(
                        child: Text(
                          '🔒 המידע שלכם מוגן ומאובטח',
                          style: ffTheme.labelSmall.override(color: ffTheme.secondaryText),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _Benefit extends StatelessWidget {
  const _Benefit({required this.text, required this.ffTheme});
  final String text;
  final FlutterFlowTheme ffTheme;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(Icons.check_circle_rounded, size: 14, color: ffTheme.secondary),
        const SizedBox(width: 4),
        Text(text, style: ffTheme.labelSmall.override(color: Colors.white70)),
      ],
    );
  }
}
