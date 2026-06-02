import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import 'package:flutter_animate/flutter_animate.dart';
import '../../flutter_flow/flutter_flow_theme.dart';
import '../../flutter_flow/flutter_flow_util.dart';
import '../../flutter_flow/flutter_flow_widgets.dart';
import '../../app_state.dart';
import 'porting_model.dart';

export 'porting_model.dart';

class PortingWidget extends StatefulWidget {
  const PortingWidget({super.key});

  @override
  State<PortingWidget> createState() => _PortingWidgetState();
}

class _PortingWidgetState extends State<PortingWidget> {
  late final PortingModel _model;

  static const _providers = [
    'פלאפון',
    'סלקום',
    'פרטנר',
    'גולן טלקום',
    'רמי לוי',
    'הוט מובייל',
    'הוט',
    'ויקום',
    '019 מובייל',
    'Xphone',
    'וואלה מובייל',
    'yes',
    'בזק',
    'אחר',
  ];

  @override
  void initState() {
    super.initState();
    _model = createModel(context, PortingModel.new);
  }

  @override
  void dispose() {
    _model.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final ffTheme = FlutterFlowTheme.of(context);
    Provider.of<FFAppState>(context);

    if (_model.submitted) {
      return _SuccessState(ffTheme: ffTheme);
    }

    return Scaffold(
      backgroundColor: ffTheme.background,
      appBar: AppBar(
        backgroundColor: ffTheme.primary,
        foregroundColor: Colors.white,
        elevation: 0,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_ios_rounded, color: Colors.white),
          onPressed: () => context.pop(),
        ),
        title: Text('בקשת ניוד מספר',
            style: ffTheme.titleLarge.override(color: Colors.white)),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // Process steps mini-timeline
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: ffTheme.accent1,
                borderRadius: BorderRadius.circular(14),
                border: Border.all(color: ffTheme.primary.withOpacity(0.2)),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Icon(Icons.info_outline_rounded, color: ffTheme.primary, size: 18),
                      const SizedBox(width: 8),
                      Text('כיצד עובד הניוד?', style: ffTheme.labelLarge.override(color: ffTheme.primary)),
                    ],
                  ),
                  const SizedBox(height: 14),
                  Row(
                    children: [
                      for (final item in [
                        (Icons.send_rounded, 'שליחת בקשה'),
                        (Icons.sync_rounded, 'עיבוד (1-3 ימים)'),
                        (Icons.check_circle_rounded, 'ניוד הושלם'),
                      ]) ...[
                        Expanded(
                          child: Column(
                            children: [
                              Container(
                                width: 36, height: 36,
                                decoration: BoxDecoration(color: ffTheme.primary.withOpacity(0.12), shape: BoxShape.circle),
                                child: Icon(item.$1, size: 17, color: ffTheme.primary),
                              ),
                              const SizedBox(height: 5),
                              Text(item.$2, style: ffTheme.labelSmall.override(color: ffTheme.primary), textAlign: TextAlign.center),
                            ],
                          ),
                        ),
                        if (item != (Icons.check_circle_rounded, 'ניוד הושלם'))
                          Expanded(child: Divider(color: ffTheme.primary.withOpacity(0.25), thickness: 1.5)),
                      ],
                    ],
                  ),
                ],
              ),
            ).animate().fadeIn(duration: 300.ms),

            const SizedBox(height: 24),

            // Phone field
            Text('מספר לניוד', style: ffTheme.titleSmall),
            const SizedBox(height: 8),
            _buildTextField(
              controller: _model.phoneController,
              hint: '05X-XXXXXXX',
              keyboardType: TextInputType.phone,
              inputFormatters: [
                FilteringTextInputFormatter.digitsOnly,
                LengthLimitingTextInputFormatter(10),
              ],
              ffTheme: ffTheme,
              prefixIcon: Icons.phone_android_rounded,
            ).animate(delay: 60.ms).fadeIn(duration: 280.ms).slideY(begin: 0.06),

            const SizedBox(height: 16),

            // ID field
            Text('מספר תעודת זהות', style: ffTheme.titleSmall),
            const SizedBox(height: 8),
            _buildTextField(
              controller: _model.idController,
              hint: '9 ספרות',
              keyboardType: TextInputType.number,
              inputFormatters: [
                FilteringTextInputFormatter.digitsOnly,
                LengthLimitingTextInputFormatter(9),
              ],
              ffTheme: ffTheme,
              prefixIcon: Icons.badge_outlined,
            ).animate(delay: 120.ms).fadeIn(duration: 280.ms).slideY(begin: 0.06),

            const SizedBox(height: 20),

            // Provider chips
            Text('ספק נוכחי', style: ffTheme.titleSmall),
            const SizedBox(height: 10),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: _providers.map((p) {
                final selected = _model.selectedProvider == p;
                return GestureDetector(
                  onTap: () => setState(() => _model.selectedProvider = p),
                  child: AnimatedContainer(
                    duration: const Duration(milliseconds: 200),
                    padding: const EdgeInsets.symmetric(
                        horizontal: 14, vertical: 8),
                    decoration: BoxDecoration(
                      color: selected ? ffTheme.primary : Colors.white,
                      borderRadius: BorderRadius.circular(20),
                      border: Border.all(
                        color:
                            selected ? ffTheme.primary : ffTheme.alternate,
                        width: selected ? 1.5 : 1,
                      ),
                      boxShadow: selected
                          ? [
                              BoxShadow(
                                  color: ffTheme.primary.withOpacity(0.2),
                                  blurRadius: 8,
                                  offset: const Offset(0, 2))
                            ]
                          : [],
                    ),
                    child: Text(
                      p,
                      style: ffTheme.bodyMedium.override(
                          color: selected
                              ? Colors.white
                              : ffTheme.primaryText,
                          fontWeight: selected
                              ? FontWeight.w700
                              : FontWeight.w500),
                    ),
                  ),
                );
              }).toList(),
            ).animate(delay: 180.ms).fadeIn(duration: 280.ms),

            const SizedBox(height: 20),

            // Timing info row
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
              decoration: BoxDecoration(
                color: ffTheme.accent2,
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: ffTheme.warning.withOpacity(0.25)),
              ),
              child: Row(
                children: [
                  Icon(Icons.timer_outlined,
                      color: ffTheme.warning, size: 18),
                  const SizedBox(width: 10),
                  Text(
                    'זמן ניוד: עד 3 ימי עסקים',
                    style: ffTheme.bodySmall.override(
                        color: ffTheme.warning,
                        fontWeight: FontWeight.w600),
                  ),
                ],
              ),
            ).animate(delay: 220.ms).fadeIn(duration: 280.ms),

            const SizedBox(height: 20),

            // POA checkbox
            GestureDetector(
              onTap: () =>
                  setState(() => _model.poaAccepted = !_model.poaAccepted),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  AnimatedContainer(
                    duration: const Duration(milliseconds: 200),
                    width: 24,
                    height: 24,
                    decoration: BoxDecoration(
                      color: _model.poaAccepted
                          ? ffTheme.primary
                          : Colors.white,
                      borderRadius: BorderRadius.circular(6),
                      border: Border.all(
                          color: _model.poaAccepted
                              ? ffTheme.primary
                              : ffTheme.alternate,
                          width: 1.5),
                    ),
                    child: _model.poaAccepted
                        ? const Icon(Icons.check_rounded,
                            size: 16, color: Colors.white)
                        : null,
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Text(
                      'אני מסכים/ה לייפוי כוח לביצוע הניוד בשמי',
                      style: ffTheme.bodyMedium,
                    ),
                  ),
                ],
              ),
            ).animate(delay: 260.ms).fadeIn(duration: 280.ms),

            const SizedBox(height: 32),

            // Submit button
            AnimatedBuilder(
              animation: Listenable.merge(
                  [_model.phoneController, _model.idController]),
              builder: (context, _) {
                final canSubmit = _model.canSubmit;
                return FFButtonWidget(
                  text: 'שלח בקשת ניוד',
                  onPressed: canSubmit
                      ? () async => setState(() => _model.submitted = true)
                      : () async {},
                  options: FFButtonOptions(
                    height: 56,
                    color:
                        canSubmit ? ffTheme.primary : ffTheme.alternate,
                    textStyle: ffTheme.titleSmall.override(
                        color: canSubmit
                            ? Colors.white
                            : ffTheme.secondaryText),
                    borderRadius: BorderRadius.circular(16),
                  ),
                );
              },
            ).animate(delay: 300.ms).fadeIn(duration: 280.ms),

            const SizedBox(height: 24),
          ],
        ),
      ),
    );
  }

  Widget _buildTextField({
    required TextEditingController controller,
    required String hint,
    required TextInputType keyboardType,
    required List<TextInputFormatter> inputFormatters,
    required FlutterFlowTheme ffTheme,
    required IconData prefixIcon,
  }) {
    return TextField(
      controller: controller,
      keyboardType: keyboardType,
      inputFormatters: inputFormatters,
      textDirection: TextDirection.ltr,
      onChanged: (_) => setState(() {}),
      decoration: InputDecoration(
        hintText: hint,
        filled: true,
        fillColor: Colors.white,
        prefixIcon: Icon(prefixIcon, color: ffTheme.secondaryText, size: 20),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: BorderSide(color: ffTheme.alternate),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: BorderSide(color: ffTheme.alternate),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: BorderSide(color: ffTheme.primary, width: 1.5),
        ),
        contentPadding:
            const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      ),
    );
  }
}

// ── Success state ─────────────────────────────────────────────────────────────

class _SuccessState extends StatelessWidget {
  const _SuccessState({required this.ffTheme});
  final FlutterFlowTheme ffTheme;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: ffTheme.primary,
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Container(
                width: 100,
                height: 100,
                decoration: BoxDecoration(
                  color: ffTheme.secondary,
                  shape: BoxShape.circle,
                ),
                child: Icon(Icons.check_rounded,
                    size: 60, color: ffTheme.primary),
              )
                  .animate()
                  .scale(
                      duration: 400.ms,
                      curve: Curves.elasticOut),

              const SizedBox(height: 32),

              Text(
                'הבקשה נשלחה בהצלחה! ✓',
                style: ffTheme.headlineMedium.override(color: Colors.white),
                textAlign: TextAlign.center,
              ).animate().fadeIn(delay: 300.ms).slideY(begin: 0.2),

              const SizedBox(height: 12),

              Text(
                'נציג ייצור קשר תוך 24 שעות\nלהשלמת תהליך הניוד',
                style: ffTheme.bodyLarge.override(color: Colors.white.withOpacity(0.85)),
                textAlign: TextAlign.center,
              ).animate().fadeIn(delay: 400.ms),

              const SizedBox(height: 16),

              Container(
                padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
                decoration: BoxDecoration(
                  color: Colors.white.withOpacity(0.12),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(Icons.schedule_rounded, color: ffTheme.secondary, size: 16),
                    const SizedBox(width: 8),
                    Text('זמן ניוד: 1–3 ימי עסקים', style: ffTheme.labelMedium.override(color: ffTheme.secondary, fontWeight: FontWeight.w600)),
                  ],
                ),
              ).animate().fadeIn(delay: 450.ms),

              const SizedBox(height: 40),

              FFButtonWidget(
                text: 'עקוב אחר הניוד',
                onPressed: () async => context.goNamed('Tracker'),
                options: FFButtonOptions(
                  width: double.infinity,
                  height: 56,
                  color: ffTheme.secondary,
                  textStyle: ffTheme.titleMedium.override(color: ffTheme.primary),
                  borderRadius: BorderRadius.circular(16),
                ),
              ).animate().fadeIn(delay: 500.ms),

              const SizedBox(height: 12),

              TextButton(
                onPressed: () => context.goNamed('Account'),
                child: Text('חזרה לאזור האישי', style: ffTheme.bodyMedium.override(color: Colors.white70)),
              ).animate().fadeIn(delay: 600.ms),
            ],
          ),
        ),
      ),
    );
  }
}
