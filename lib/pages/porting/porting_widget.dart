import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import 'package:flutter_animate/flutter_animate.dart';
import '../../theme/app_theme.dart';
import '../../core/nav.dart';
import '../../widgets/app_button.dart';
import '../../widgets/app_snackbar.dart';
import '../../app_state.dart';
import '../../services/backend/backend.dart';
import '../../services/backend/local_backend.dart';

class PortingWidget extends StatefulWidget {
  const PortingWidget({super.key});

  @override
  State<PortingWidget> createState() => _PortingWidgetState();
}

class _PortingWidgetState extends State<PortingWidget> {
  final TextEditingController _phoneController = TextEditingController();
  final TextEditingController _idController = TextEditingController();
  String? _selectedProvider;
  bool _poaAccepted = false;
  bool _submitted = false;

  bool get _canSubmit {
    final phone = _phoneController.text.replaceAll(RegExp(r'[\s\-]'), '');
    return phone.length >= 9 &&
        phone.length <= 10 &&
        phone.startsWith('0') &&
        _idController.text.trim().length == 9 &&
        _selectedProvider != null &&
        _poaAccepted;
  }

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
    final phone = AppState().userPhone;
    if (phone.isNotEmpty) _phoneController.text = phone.replaceAll('-', '');
  }

  @override
  void dispose() {
    _phoneController.dispose();
    _idController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final ffTheme = AppTheme.of(context);
    Provider.of<AppState>(context);

    if (_submitted) {
      return _SuccessState(ffTheme: ffTheme);
    }

    return Scaffold(
      backgroundColor: ffTheme.background,
      appBar: AppBar(
        // Inherit the themed app-bar (ink on light, darkSurface on dark) so the
        // header reads correctly in both modes rather than forcing white-on-ink.
        elevation: 0,
        // Expose "חזרה" as the back control's accessible NAME (a semantics
        // label), not only as a hover/long-press tooltip — a screen reader then
        // announces the control by name. The tooltip is kept as the visual hint.
        leading: Semantics(
          label: 'חזרה',
          button: true,
          child: IconButton(
            icon: const Icon(Icons.arrow_back_ios_rounded),
            tooltip: 'חזרה',
            onPressed: () => context.safePop(),
          ),
        ),
        title: const Text('בקשת ניוד מספר'),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // Process steps mini-timeline
            Container(
              padding: const EdgeInsets.all(18),
              decoration: BoxDecoration(
                color: ffTheme.brandAccentTint,
                borderRadius: BorderRadius.circular(ffTheme.radiusLg),
                border: Border.all(color: ffTheme.brandAccent.withValues(alpha: 0.2)),
                boxShadow: ffTheme.shadowXs,
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Icon(Icons.info_outline_rounded, color: ffTheme.brandAccent, size: 18),
                      const SizedBox(width: 8),
                      Text('כיצד עובד הניוד?', style: ffTheme.labelLarge.copyWith(color: ffTheme.brandAccentText)),
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
                                decoration: BoxDecoration(color: ffTheme.brandAccent.withValues(alpha: 0.14), shape: BoxShape.circle),
                                child: Icon(item.$1, size: 17, color: ffTheme.brandAccent),
                              ),
                              const SizedBox(height: 5),
                              Text(item.$2, style: ffTheme.labelSmall.copyWith(color: ffTheme.brandAccentText), textAlign: TextAlign.center),
                            ],
                          ),
                        ),
                        if (item != (Icons.check_circle_rounded, 'ניוד הושלם'))
                          Expanded(child: Divider(color: ffTheme.brandAccent.withValues(alpha: 0.25), thickness: 1.5)),
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
              controller: _phoneController,
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
              controller: _idController,
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
                final selected = _selectedProvider == p;
                return GestureDetector(
                  onTap: () => setState(() => _selectedProvider = p),
                  child: AnimatedContainer(
                    duration: const Duration(milliseconds: 200),
                    padding: const EdgeInsets.symmetric(
                        horizontal: 14, vertical: 8),
                    decoration: BoxDecoration(
                      color: selected ? ffTheme.brandAccent : ffTheme.cardSurface,
                      borderRadius: BorderRadius.circular(20),
                      border: Border.all(
                        color:
                            selected ? ffTheme.brandAccent : ffTheme.alternate,
                        width: selected ? 1.5 : 1,
                      ),
                      boxShadow: selected
                          ? [
                              BoxShadow(
                                  color: ffTheme.brandAccent.withValues(alpha: 0.28),
                                  blurRadius: 10,
                                  offset: const Offset(0, 3))
                            ]
                          : [],
                    ),
                    child: Text(
                      p,
                      style: ffTheme.bodyMedium.copyWith(
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
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
              decoration: BoxDecoration(
                color: ffTheme.accent2,
                borderRadius: BorderRadius.circular(ffTheme.radiusSm),
                border: Border.all(color: ffTheme.warning.withValues(alpha: 0.25)),
              ),
              child: Row(
                children: [
                  Icon(Icons.timer_outlined,
                      color: ffTheme.warning, size: 18),
                  const SizedBox(width: 10),
                  Text(
                    'זמן ניוד: עד 3 ימי עסקים',
                    style: ffTheme.bodySmall.copyWith(
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
                  setState(() => _poaAccepted = !_poaAccepted),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  AnimatedContainer(
                    duration: const Duration(milliseconds: 200),
                    width: 24,
                    height: 24,
                    decoration: BoxDecoration(
                      color: _poaAccepted
                          ? ffTheme.brandAccent
                          : ffTheme.cardSurface,
                      borderRadius: BorderRadius.circular(6),
                      border: Border.all(
                          color: _poaAccepted
                              ? ffTheme.brandAccent
                              : ffTheme.alternate,
                          width: 1.5),
                    ),
                    child: _poaAccepted
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
                  [_phoneController, _idController]),
              builder: (context, _) {
                final canSubmit = _canSubmit;
                return AppButton(
                  text: 'שלח בקשת ניוד',
                  onPressed: canSubmit
                      ? () async {
                          final st = Provider.of<AppState>(context, listen: false);
                          final name = st.userName.isNotEmpty ? st.userName : 'משתמש';
                          final phone = _phoneController.text.trim();
                          try {
                            await appBackend.submitLead(LeadInput(
                              name: name,
                              phone: phone,
                              provider: _selectedProvider,
                              source: 'porting',
                              notes: 'ניוד מ: $_selectedProvider | ת.ז: ${_idController.text.trim()}',
                            )).timeout(const Duration(seconds: 10));
                          } catch (_) {
                            // The porting request never reached the team — let
                            // the user retry instead of showing false success.
                            if (!context.mounted) return;
                            AppSnackBar.error(context, 'שליחת הבקשה נכשלה — בדקו את החיבור ונסו שוב');
                            return;
                          }
                          appBackend.upsertProfile(name: name, phone: phone).catchError((_) {});
                          if (!mounted) return;
                          setState(() => _submitted = true);
                        }
                      : () async {},
                  
                    height: 56,
                    color:
                        canSubmit ? AppColors.primary : ffTheme.alternate,
                    textStyle: ffTheme.titleSmall.copyWith(
                        color: canSubmit
                            ? Colors.white
                            : ffTheme.secondaryText),
                    borderRadius: BorderRadius.circular(16),
                  
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
    required AppTheme ffTheme,
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
        fillColor: ffTheme.cardSurface,
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
          borderSide: BorderSide(color: ffTheme.brandAccent, width: 1.5),
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
  final AppTheme ffTheme;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      // Celebration hero stays a premium INK surface in both themes (the const
      // ink token, not the theme-aware `ffTheme.primary` which flips to off-white
      // on dark and would strand the white-on-ink content).
      backgroundColor: AppColors.primary,
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
                  color: ffTheme.brandAccent,
                  shape: BoxShape.circle,
                  boxShadow: [BoxShadow(color: ffTheme.brandAccent.withValues(alpha: 0.45), blurRadius: 26, spreadRadius: 2)],
                ),
                child: const Icon(Icons.check_rounded,
                    size: 60, color: Colors.white),
              )
                  .animate()
                  .scale(
                      duration: 400.ms,
                      curve: Curves.elasticOut),

              const SizedBox(height: 32),

              Text(
                'הבקשה נשלחה בהצלחה!',
                style: ffTheme.headlineMedium.copyWith(color: Colors.white),
                textAlign: TextAlign.center,
              ).animate().fadeIn(delay: 300.ms).slideY(begin: 0.2),

              const SizedBox(height: 12),

              Text(
                'נציג ייצור קשר תוך 24 שעות\nלהשלמת תהליך הניוד',
                style: ffTheme.bodyLarge.copyWith(color: Colors.white.withValues(alpha: 0.85)),
                textAlign: TextAlign.center,
              ).animate().fadeIn(delay: 400.ms),

              const SizedBox(height: 16),

              Container(
                padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
                decoration: BoxDecoration(
                  color: Colors.white.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(ffTheme.radiusPill),
                  border: Border.all(color: Colors.white.withValues(alpha: 0.16)),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Icon(Icons.schedule_rounded, color: AppColors.secondary, size: 16),
                    const SizedBox(width: 8),
                    Text('זמן ניוד: 1–3 ימי עסקים', style: ffTheme.labelMedium.copyWith(color: AppColors.secondary, fontWeight: FontWeight.w600)),
                  ],
                ),
              ).animate().fadeIn(delay: 450.ms),

              const SizedBox(height: 40),

              AppButton(
                text: 'עקוב אחר הניוד',
                onPressed: () async => context.goNamed('Tracker'),
                
                  width: double.infinity,
                  height: 56,
                  color: AppColors.secondary,
                  textStyle: ffTheme.titleMedium.copyWith(color: AppColors.primary),
                  borderRadius: BorderRadius.circular(16),
                
              ).animate().fadeIn(delay: 500.ms),

              const SizedBox(height: 12),

              TextButton(
                onPressed: () => context.goNamed('Account'),
                child: Text('חזרה לאזור האישי', style: ffTheme.bodyMedium.copyWith(color: Colors.white70)),
              ).animate().fadeIn(delay: 600.ms),
            ],
          ),
        ),
      ),
    );
  }
}
