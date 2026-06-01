import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
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
    appState.login(name: _nameCtrl.text.trim(), phone: _phoneCtrl.text.trim());
    context.goNamed('Home');
  }

  @override
  Widget build(BuildContext context) {
    final ffTheme = FlutterFlowTheme.of(context);

    return Scaffold(
      backgroundColor: ffTheme.background,
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        leading: IconButton(
          icon: Icon(Icons.arrow_back_rounded, color: ffTheme.primaryText),
          onPressed: () => context.safePop(),
        ),
      ),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: Form(
            key: _formKey,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(_isLogin ? 'כניסה לחשבון' : 'הצטרפות לחוסך', style: ffTheme.headlineLarge),
                const SizedBox(height: 8),
                Text('כדי לעקוב אחר החיסכון שלכם', style: ffTheme.bodyMedium.override(color: ffTheme.secondaryText)),
                const SizedBox(height: 32),

                if (!_isLogin) ...[
                  Text('שם מלא', style: ffTheme.labelLarge),
                  const SizedBox(height: 8),
                  TextFormField(
                    controller: _nameCtrl,
                    decoration: const InputDecoration(hintText: 'ישראל ישראלי', prefixIcon: Icon(Icons.person_outline_rounded)),
                    validator: (v) => (v == null || v.trim().isEmpty) ? 'אנא הכניסו שם' : null,
                  ),
                  const SizedBox(height: 20),
                ],

                Text('מספר טלפון', style: ffTheme.labelLarge),
                const SizedBox(height: 8),
                TextFormField(
                  controller: _phoneCtrl,
                  keyboardType: TextInputType.phone,
                  decoration: const InputDecoration(hintText: '050-0000000', prefixIcon: Icon(Icons.phone_outlined)),
                  validator: (v) => (v == null || v.trim().length < 9) ? 'אנא הכניסו מספר טלפון תקין' : null,
                ),

                const SizedBox(height: 32),

                FFButtonWidget(
                  text: _isLogin ? 'כניסה' : 'הצטרפות',
                  onPressed: () async => _submit(),
                  options: FFButtonOptions(
                    width: double.infinity,
                    height: 56,
                    color: ffTheme.primary,
                    textStyle: ffTheme.titleMedium.override(color: Colors.white),
                    borderRadius: BorderRadius.circular(18),
                  ),
                ),

                const SizedBox(height: 16),

                Center(
                  child: TextButton(
                    onPressed: () => setState(() => _isLogin = !_isLogin),
                    child: Text(
                      _isLogin ? 'עדיין אין לכם חשבון? הצטרפו' : 'יש לכם כבר חשבון? התחברו',
                      style: ffTheme.bodyMedium.override(color: ffTheme.primary),
                    ),
                  ),
                ),

                const SizedBox(height: 16),
                Center(
                  child: TextButton(
                    onPressed: () => context.goNamed('Home'),
                    child: Text('המשך ללא הרשמה', style: ffTheme.bodyMedium.override(color: ffTheme.secondaryText)),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
