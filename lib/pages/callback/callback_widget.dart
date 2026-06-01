import 'package:flutter/material.dart';
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
  void initState() {
    super.initState();
    final appState = FFAppState();
    if (appState.userName.isNotEmpty) _nameCtrl.text = appState.userName;
    if (appState.userPhone.isNotEmpty) _phoneCtrl.text = appState.userPhone;
  }

  @override
  void dispose() {
    _nameCtrl.dispose();
    _phoneCtrl.dispose();
    super.dispose();
  }

  InputDecoration _inputDecoration(FlutterFlowTheme ffTheme, {required String hint, required IconData icon}) {
    return InputDecoration(
      hintText: hint,
      filled: true,
      fillColor: Colors.white,
      prefixIcon: Icon(icon, color: ffTheme.secondaryText),
      border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide.none),
      enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide(color: ffTheme.alternate)),
      focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide(color: ffTheme.primary, width: 1.5)),
    );
  }

  @override
  Widget build(BuildContext context) {
    final ffTheme = FlutterFlowTheme.of(context);

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
                  Stack(
                    alignment: Alignment.center,
                    children: [
                      Container(
                        width: 110,
                        height: 110,
                        decoration: BoxDecoration(
                          color: ffTheme.primary.withOpacity(0.08),
                          shape: BoxShape.circle,
                        ),
                      ).animate(onPlay: (c) => c.repeat(reverse: true))
                        .scale(begin: const Offset(1, 1), end: const Offset(1.1, 1.1), duration: 1200.ms),
                      Container(
                        width: 88,
                        height: 88,
                        decoration: BoxDecoration(color: ffTheme.accent1, shape: BoxShape.circle),
                        child: Icon(Icons.phone_in_talk_rounded, color: ffTheme.primary, size: 44),
                      ).animate().scale(duration: 600.ms, curve: Curves.elasticOut),
                    ],
                  ),
                  const SizedBox(height: 28),
                  Text('נקבל אתכם!', style: ffTheme.headlineMedium),
                  const SizedBox(height: 8),
                  Text(
                    'נציג ייצור קשר $_timing\nבדרך כלל תוך פחות משעה',
                    style: ffTheme.bodyLarge.override(color: ffTheme.secondaryText),
                    textAlign: TextAlign.center,
                  ),
                  const SizedBox(height: 24),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
                    decoration: BoxDecoration(
                      color: ffTheme.accent1,
                      borderRadius: BorderRadius.circular(14),
                      border: Border.all(color: ffTheme.primary.withOpacity(0.15)),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(Icons.access_time_rounded, size: 16, color: ffTheme.primary),
                        const SizedBox(width: 8),
                        Text('ימי א׳–ה׳, 9:00–21:00', style: ffTheme.labelMedium.override(color: ffTheme.primary, fontWeight: FontWeight.w600)),
                      ],
                    ),
                  ),
                  const SizedBox(height: 32),
                  FFButtonWidget(
                    text: 'מעקב אחר התהליך',
                    onPressed: () => context.goNamed('Tracker'),
                    options: FFButtonOptions(
                      width: 240,
                      height: 52,
                      color: ffTheme.primary,
                      textStyle: ffTheme.titleSmall.override(color: Colors.white),
                      borderRadius: BorderRadius.circular(14),
                    ),
                  ),
                  const SizedBox(height: 12),
                  TextButton(
                    onPressed: () => context.safePop(),
                    child: Text('חזרה', style: ffTheme.bodyMedium.override(color: ffTheme.secondaryText)),
                  ),
                ],
              ),
            ),
          ),
        ),
      );
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
                gradient: LinearGradient(
                  colors: [ffTheme.primary, ffTheme.tertiary],
                  begin: Alignment.topRight,
                  end: Alignment.bottomLeft,
                ),
                borderRadius: BorderRadius.circular(16),
              ),
              child: Row(
                children: [
                  Container(
                    width: 52,
                    height: 52,
                    decoration: BoxDecoration(
                      color: Colors.white.withOpacity(0.2),
                      shape: BoxShape.circle,
                    ),
                    child: const Center(child: Text('📞', style: TextStyle(fontSize: 26))),
                  ),
                  const SizedBox(width: 14),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('שיחה עם מומחה', style: ffTheme.titleMedium.override(color: Colors.white)),
                        const SizedBox(height: 2),
                        Text('נציג אישי יסייע לכם למצוא את המסלול הנכון', style: ffTheme.bodySmall.override(color: Colors.white.withOpacity(0.8))),
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
              textDirection: TextDirection.rtl,
              decoration: _inputDecoration(ffTheme, hint: 'ישראל ישראלי', icon: Icons.person_outline_rounded),
            ).animate().fadeIn(duration: 300.ms).slideY(begin: 0.05),

            const SizedBox(height: 16),

            Text('מספר טלפון', style: ffTheme.labelLarge),
            const SizedBox(height: 8),
            TextField(
              controller: _phoneCtrl,
              keyboardType: TextInputType.phone,
              textDirection: TextDirection.ltr,
              decoration: _inputDecoration(ffTheme, hint: '050-0000000', icon: Icons.phone_outlined),
            ).animate().fadeIn(delay: 60.ms).slideY(begin: 0.05),

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
                      boxShadow: active ? [BoxShadow(color: ffTheme.primary.withOpacity(0.2), blurRadius: 8, offset: const Offset(0, 3))] : null,
                    ),
                    child: Text(t, style: ffTheme.labelLarge.override(color: active ? Colors.white : ffTheme.primaryText)),
                  ),
                );
              }).toList(),
            ).animate().fadeIn(delay: 120.ms),

            const SizedBox(height: 28),

            // When we're available info
            Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: ffTheme.background,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: ffTheme.alternate),
              ),
              child: Row(
                children: [
                  Icon(Icons.schedule_rounded, color: ffTheme.primary, size: 20),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('שעות פעילות', style: ffTheme.labelMedium.override(color: ffTheme.primaryText, fontWeight: FontWeight.w600)),
                        Text('ימי א׳–ה׳, 9:00–21:00 • שישי 9:00–14:00', style: ffTheme.labelSmall.override(color: ffTheme.secondaryText)),
                      ],
                    ),
                  ),
                  Container(
                    width: 8,
                    height: 8,
                    decoration: BoxDecoration(color: ffTheme.success, shape: BoxShape.circle),
                  ).animate(onPlay: (c) => c.repeat(reverse: true)).scale(begin: const Offset(1, 1), end: const Offset(1.5, 1.5), duration: 900.ms),
                ],
              ),
            ).animate().fadeIn(delay: 160.ms),

            const SizedBox(height: 24),

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
            ).animate().fadeIn(delay: 200.ms),

            const SizedBox(height: 12),

            Center(
              child: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(Icons.lock_outline_rounded, size: 13, color: ffTheme.secondaryText),
                  const SizedBox(width: 4),
                  Text('ללא עלות. פרטייך מוגנים', style: ffTheme.labelSmall.override(color: ffTheme.secondaryText)),
                ],
              ),
            ),

            const SizedBox(height: 32),
          ],
        ),
      ),
    );
  }
}
