import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:google_fonts/google_fonts.dart';
import '../../flutter_flow/flutter_flow_theme.dart';
import '../../flutter_flow/flutter_flow_util.dart';
import '../../flutter_flow/flutter_flow_widgets.dart';
import '../../app_state.dart';

class CallbackWidget extends StatefulWidget {
  const CallbackWidget({super.key});

  @override
  State<CallbackWidget> createState() => _CallbackWidgetState();
}

class _CallbackWidgetState extends State<CallbackWidget> {
  final _nameCtrl = TextEditingController();
  final _phoneCtrl = TextEditingController();
  String _timing = 'בהקדם';
  bool _submitted = false;

  final _timings = ['בהקדם', 'בוקר', 'אחה"צ', 'ערב'];

  @override
  void dispose() {
    _nameCtrl.dispose();
    _phoneCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final ffTheme = FlutterFlowTheme.of(context);
    final appState = Provider.of<FFAppState>(context, listen: false);

    if (_submitted) {
      return Scaffold(
        backgroundColor: ffTheme.background,
        body: SafeArea(
          child: Center(
            child: Padding(
              padding: const EdgeInsets.all(32),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Container(
                    width: 90,
                    height: 90,
                    decoration: BoxDecoration(color: ffTheme.accent1, shape: BoxShape.circle),
                    child: Icon(Icons.check_rounded, color: ffTheme.primary, size: 50),
                  ).animate().scale(duration: 600.ms, curve: Curves.elasticOut),
                  const SizedBox(height: 24),
                  Text('נקבל אתכם!', style: ffTheme.headlineMedium),
                  const SizedBox(height: 8),
                  Text('נציג יחזור אליכם $_timing', style: ffTheme.bodyLarge.override(color: ffTheme.secondaryText), textAlign: TextAlign.center),
                  const SizedBox(height: 32),
                  TextButton(
                    onPressed: () => context.safePop(),
                    child: Text('חזרה', style: ffTheme.bodyMedium.override(color: ffTheme.primary)),
                  ),
                ],
              ),
            ),
          ),
        ),
      );
    }

    if (_nameCtrl.text.isEmpty && appState.userName.isNotEmpty) {
      _nameCtrl.text = appState.userName;
    }
    if (_phoneCtrl.text.isEmpty && appState.userPhone.isNotEmpty) {
      _phoneCtrl.text = appState.userPhone;
    }

    return Scaffold(
      backgroundColor: ffTheme.background,
      appBar: AppBar(
        title: const Text('נחזור אליכם'),
        backgroundColor: Colors.transparent,
        elevation: 0,
        foregroundColor: ffTheme.primaryText,
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              padding: const EdgeInsets.all(18),
              decoration: BoxDecoration(
                color: ffTheme.accent1,
                borderRadius: BorderRadius.circular(16),
              ),
              child: Row(
                children: [
                  const Text('📞', style: TextStyle(fontSize: 32)),
                  const SizedBox(width: 14),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('שיחה עם מומחה', style: ffTheme.titleMedium.override(color: ffTheme.primary)),
                        Text('נציג מקצועי יסייע לכם לבחור את המסלול הנכון', style: ffTheme.bodySmall),
                      ],
                    ),
                  ),
                ],
              ),
            ).animate().fadeIn(duration: 400.ms),

            const SizedBox(height: 24),

            Text('שם מלא', style: ffTheme.labelLarge),
            const SizedBox(height: 8),
            TextField(
              controller: _nameCtrl,
              decoration: const InputDecoration(hintText: 'ישראל ישראלי', prefixIcon: Icon(Icons.person_outline_rounded)),
            ),

            const SizedBox(height: 16),

            Text('מספר טלפון', style: ffTheme.labelLarge),
            const SizedBox(height: 8),
            TextField(
              controller: _phoneCtrl,
              keyboardType: TextInputType.phone,
              decoration: const InputDecoration(hintText: '050-0000000', prefixIcon: Icon(Icons.phone_outlined)),
            ),

            const SizedBox(height: 20),

            Text('מתי נוח לכם?', style: ffTheme.labelLarge),
            const SizedBox(height: 10),
            Wrap(
              spacing: 10,
              runSpacing: 10,
              children: _timings.map((t) {
                final active = _timing == t;
                return GestureDetector(
                  onTap: () => setState(() => _timing = t),
                  child: AnimatedContainer(
                    duration: const Duration(milliseconds: 200),
                    padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 10),
                    decoration: BoxDecoration(
                      color: active ? ffTheme.primary : Colors.white,
                      borderRadius: BorderRadius.circular(24),
                      border: Border.all(color: active ? ffTheme.primary : ffTheme.alternate),
                    ),
                    child: Text(t, style: ffTheme.labelLarge.override(color: active ? Colors.white : ffTheme.primaryText)),
                  ),
                );
              }).toList(),
            ),

            const SizedBox(height: 32),

            FFButtonWidget(
              text: 'בקש שיחה חוזרת',
              onPressed: () async {
                if (_nameCtrl.text.isEmpty || _phoneCtrl.text.isEmpty) return;
                setState(() => _submitted = true);
              },
              options: FFButtonOptions(
                width: double.infinity,
                height: 56,
                color: ffTheme.primary,
                textStyle: ffTheme.titleSmall.override(color: Colors.white),
                borderRadius: BorderRadius.circular(16),
              ),
            ),

            const SizedBox(height: 12),

            Center(
              child: Text('ללא עלות. נציגינו יחזרו אליכם תוך שעה', style: ffTheme.labelSmall.override(color: ffTheme.secondaryText)),
            ),

            const SizedBox(height: 32),
          ],
        ),
      ),
    );
  }
}
