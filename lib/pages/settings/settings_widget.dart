import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../theme/app_theme.dart';
import '../../widgets/app_snackbar.dart';
import '../../core/nav.dart';
import '../../app_state.dart';
import '../../services/auth_service.dart';
import '../../services/telegram_service.dart';
import '../../widgets/app_button.dart';
import '../../widgets/info_banner.dart';

class SettingsWidget extends StatelessWidget {
  const SettingsWidget({super.key});

  @override
  Widget build(BuildContext context) {
    final ffTheme = AppTheme.of(context);
    final appState = Provider.of<AppState>(context);

    return Scaffold(
      backgroundColor: ffTheme.background,
      appBar: AppBar(
        title: Text('הגדרות', style: ffTheme.titleLarge.copyWith(color: ffTheme.primaryText)),
        backgroundColor: Colors.transparent,
        elevation: 0,
        foregroundColor: ffTheme.primaryText,
        leading: IconButton(
          icon: const Icon(Icons.arrow_forward_ios_rounded),
          tooltip: 'חזרה',
          onPressed: () => context.safePop(),
        ),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.symmetric(horizontal: 20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const SizedBox(height: 8),

            // ── Section 0: Theme mode ─────────────────────────────────────
            _SectionHeader(title: 'ערכת נושא', ffTheme: ffTheme),
            _ThemeModeCard(ffTheme: ffTheme).animate().fadeIn(duration: 350.ms),

            const SizedBox(height: 24),

            // ── Section 1: Notifications ──────────────────────────────────
            _SectionHeader(title: 'התראות', ffTheme: ffTheme),
            _Card(
              ffTheme: ffTheme,
              child: Column(
                children: [
                  _ToggleRow(
                    icon: Icons.price_change_rounded,
                    title: 'התראות מחיר',
                    subtitle: 'קבל עדכון כשמחיר חבילה משתנה',
                    value: appState.prefPriceAlerts,
                    onChanged: (v) => Provider.of<AppState>(context, listen: false).setPrefPriceAlerts(v),
                    ffTheme: ffTheme,
                  ),
                  _Divider(ffTheme: ffTheme),
                  _ToggleRow(
                    icon: Icons.update_rounded,
                    title: 'עדכוני בקשות',
                    subtitle: 'קבל התראה על סטטוס הבקשה שלך',
                    value: appState.prefRequestUpdates,
                    onChanged: (v) => Provider.of<AppState>(context, listen: false).setPrefRequestUpdates(v),
                    ffTheme: ffTheme,
                  ),
                  _Divider(ffTheme: ffTheme),
                  _ToggleRow(
                    icon: Icons.people_rounded,
                    title: 'פעילות קהילה',
                    subtitle: 'קבל עדכונים על פוסטים ותגובות',
                    value: appState.prefCommunityNotifs,
                    onChanged: (v) => Provider.of<AppState>(context, listen: false).setPrefCommunityNotifs(v),
                    ffTheme: ffTheme,
                  ),
                  _Divider(ffTheme: ffTheme),
                  _TelegramRow(ffTheme: ffTheme),
                ],
              ),
            ).animate().fadeIn(duration: 350.ms),

            const SizedBox(height: 24),

            // ── Section 1b: Price-alert tuning ────────────────────────────
            _SectionHeader(title: 'כוונון התראות מחיר', ffTheme: ffTheme),
            _PriceAlertTuningCard(ffTheme: ffTheme)
                .animate()
                .fadeIn(delay: 60.ms, duration: 350.ms),

            const SizedBox(height: 24),

            // ── Section 1c: Renewal reminders ─────────────────────────────
            _SectionHeader(title: 'תזכורות חידוש', ffTheme: ffTheme),
            _RenewalReminderCard(ffTheme: ffTheme)
                .animate()
                .fadeIn(delay: 80.ms, duration: 350.ms),

            const SizedBox(height: 24),

            // ── Section 2: Data & Privacy ─────────────────────────────────
            _SectionHeader(title: 'נתונים ופרטיות', ffTheme: ffTheme),
            _Card(
              ffTheme: ffTheme,
              child: Column(
                children: [
                  _ActionRow(
                    icon: Icons.receipt_long_rounded,
                    title: 'אפס חשבונות חודשיים',
                    subtitle: 'מחק את כל סכומי החשבונות',
                    iconColor: ffTheme.warning,
                    onTap: () => _confirmAction(
                      context: context,
                      ffTheme: ffTheme,
                      title: 'אפס חשבונות',
                      message: 'לאפס את כל החשבונות החודשיים לאפס?',
                      confirmLabel: 'אפס',
                      confirmColor: ffTheme.warning,
                      onConfirm: () {
                        Provider.of<AppState>(context, listen: false).resetAllBills();
                        _showSnack(context, 'החשבונות אופסו בהצלחה');
                      },
                    ),
                    ffTheme: ffTheme,
                  ),
                  _Divider(ffTheme: ffTheme),
                  _ActionRow(
                    icon: Icons.chat_bubble_outline_rounded,
                    title: 'נקה שיחת תמיכה',
                    subtitle: 'מחק את היסטוריית הצ\'אט',
                    iconColor: ffTheme.secondaryText,
                    onTap: () => _confirmAction(
                      context: context,
                      ffTheme: ffTheme,
                      title: 'נקה שיחת תמיכה',
                      message: 'למחוק את היסטוריית שיחת התמיכה?',
                      confirmLabel: 'מחק',
                      confirmColor: ffTheme.error,
                      onConfirm: () {
                        Provider.of<AppState>(context, listen: false).clearChatHistory();
                        _showSnack(context, 'שיחת התמיכה נוקתה');
                      },
                    ),
                    ffTheme: ffTheme,
                  ),
                  _Divider(ffTheme: ffTheme),
                  _ActionRow(
                    icon: Icons.psychology_rounded,
                    title: 'נקה שיחת יועץ',
                    subtitle: 'מחק את היסטוריית שיחת ה-AI',
                    iconColor: ffTheme.secondaryText,
                    onTap: () => _confirmAction(
                      context: context,
                      ffTheme: ffTheme,
                      title: 'נקה שיחת יועץ',
                      message: 'למחוק את היסטוריית שיחת היועץ?',
                      confirmLabel: 'מחק',
                      confirmColor: ffTheme.error,
                      onConfirm: () {
                        Provider.of<AppState>(context, listen: false).clearAdvisorHistory();
                        _showSnack(context, 'שיחת היועץ נוקתה');
                      },
                    ),
                    ffTheme: ffTheme,
                  ),
                ],
              ),
            ).animate().fadeIn(delay: 100.ms, duration: 350.ms),

            const SizedBox(height: 24),

            // ── Security (Face ID) — mobile + biometric + real account only ─
            _BiometricSection(ffTheme: ffTheme),

            // ── Section 3: About ──────────────────────────────────────────
            _SectionHeader(title: 'אודות', ffTheme: ffTheme),
            _Card(
              ffTheme: ffTheme,
              child: Column(
                children: [
                  Row(
                    children: [
                      Container(
                        width: 44,
                        height: 44,
                        decoration: BoxDecoration(
                          color: ffTheme.primary,
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: const Center(child: Icon(Icons.savings_outlined, size: 22, color: Colors.white)),
                      ),
                      const SizedBox(width: 14),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text('חוסך', style: ffTheme.titleMedium.copyWith(color: ffTheme.primaryText)),
                            Text('השוואת מחירי תקשורת בישראל', style: ffTheme.bodySmall),
                          ],
                        ),
                      ),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                        decoration: BoxDecoration(
                          color: ffTheme.accent1,
                          borderRadius: BorderRadius.circular(8),
                          border: Border.all(color: ffTheme.alternate),
                        ),
                        child: Text('1.0.0', style: ffTheme.labelSmall.copyWith(color: ffTheme.primary, fontWeight: FontWeight.w700)),
                      ),
                    ],
                  ),
                  const SizedBox(height: 16),
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: ffTheme.background,
                      borderRadius: BorderRadius.circular(10),
                      border: Border.all(color: ffTheme.alternate),
                    ),
                    child: Text(
                      'המחירים המוצגים הם לצורך המחשה בלבד ועשויים להשתנות. מומלץ לאמת מול הספק לפני ביצוע כל פעולה.',
                      style: ffTheme.bodySmall.copyWith(color: ffTheme.secondaryText),
                      textAlign: TextAlign.start,
                    ),
                  ),
                ],
              ),
            ).animate().fadeIn(delay: 200.ms, duration: 350.ms),

            const SizedBox(height: 24),

            // ── Logout button (logged-in only) ────────────────────────────
            if (appState.isLoggedIn)
              AppButton(
                text: 'התנתקות',
                color: ffTheme.error,
                width: double.infinity,
                onPressed: () async {
                  final confirmed = await showDialog<bool>(
                    context: context,
                    builder: (ctx) => AlertDialog(
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
                      title: const Text('התנתקות', textAlign: TextAlign.center),
                      content: const Text('האם להתנתק מהחשבון?', textAlign: TextAlign.center),
                      actionsAlignment: MainAxisAlignment.center,
                      actions: [
                        TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('ביטול')),
                        ElevatedButton(
                          onPressed: () => Navigator.pop(ctx, true),
                          style: ElevatedButton.styleFrom(
                            backgroundColor: ffTheme.error,
                            foregroundColor: Colors.white,
                            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                          ),
                          child: const Text('התנתק'),
                        ),
                      ],
                    ),
                  );
                  if (confirmed == true && context.mounted) {
                    await AuthService.instance.signOut();
                    if (!context.mounted) return;
                    Provider.of<AppState>(context, listen: false).logout();
                    context.goNamed('Home');
                  }
                },
              ).animate().fadeIn(delay: 300.ms, duration: 350.ms),

            const SizedBox(height: 32),
          ],
        ),
      ),
    );
  }

  void _confirmAction({
    required BuildContext context,
    required AppTheme ffTheme,
    required String title,
    required String message,
    required String confirmLabel,
    required Color confirmColor,
    required VoidCallback onConfirm,
  }) {
    showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
        title: Text(title, textAlign: TextAlign.center),
        content: Text(message, textAlign: TextAlign.center),
        actionsAlignment: MainAxisAlignment.center,
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('ביטול')),
          ElevatedButton(
            onPressed: () { Navigator.pop(ctx, true); onConfirm(); },
            style: ElevatedButton.styleFrom(
              backgroundColor: confirmColor,
              foregroundColor: Colors.white,
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
            ),
            child: Text(confirmLabel),
          ),
        ],
      ),
    );
  }

  void _showSnack(BuildContext context, String message) {
    if (!context.mounted) return;
    AppSnackBar.info(context, message, duration: const Duration(seconds: 2));
  }
}

// ── Security: Face ID quick-login toggle ────────────────────────────────────────
// Self-hiding: renders nothing unless we're on a biometric-capable mobile device
// AND the user is a real (logged-in) account. So it never appears on web or for
// guests, and the widget tree stays clean.
class _BiometricSection extends StatefulWidget {
  const _BiometricSection({required this.ffTheme});
  final AppTheme ffTheme;

  @override
  State<_BiometricSection> createState() => _BiometricSectionState();
}

class _BiometricSectionState extends State<_BiometricSection> {
  bool _available = false;
  bool _enabled = false;
  bool _loaded = false;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final available = await AuthService.instance.biometricAvailable();
    final enabled = await AuthService.instance.biometricEnabled;
    if (!mounted) return;
    setState(() {
      _available = available && AuthService.instance.isRealUser;
      _enabled = enabled;
      _loaded = true;
    });
  }

  Future<void> _toggle(bool v) async {
    if (_busy) return;
    setState(() => _busy = true);
    // Verify the user can actually pass biometric before arming — avoids
    // locking them out at the cold-start gate.
    if (v) {
      final ok = await AuthService.instance
          .authenticateBiometric(reason: 'אמתו כדי להפעיל כניסה מהירה');
      if (!ok) {
        if (mounted) {
          setState(() => _busy = false);
          AppSnackBar.error(context, 'האימות נכשל — הכניסה המהירה לא הופעלה');
        }
        return;
      }
    }
    await AuthService.instance.setBiometricEnabled(v);
    if (!mounted) return;
    setState(() {
      _enabled = v;
      _busy = false;
    });
    AppSnackBar.success(context, v ? 'כניסה מהירה עם Face ID הופעלה' : 'כניסה מהירה כובתה');
  }

  @override
  Widget build(BuildContext context) {
    final ffTheme = widget.ffTheme;
    if (!_loaded || !_available) return const SizedBox.shrink();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _SectionHeader(title: 'אבטחה', ffTheme: ffTheme),
        _Card(
          ffTheme: ffTheme,
          child: _ToggleRow(
            icon: Icons.fingerprint_rounded,
            title: 'כניסה מהירה עם Face ID',
            subtitle: 'אמתו ביומטרית במקום סיסמה בכל כניסה',
            value: _enabled,
            onChanged: _toggle,
            ffTheme: ffTheme,
          ),
        ).animate().fadeIn(duration: 350.ms),
        const SizedBox(height: 24),
      ],
    );
  }
}

// ── Shared helpers ─────────────────────────────────────────────────────────────

class _SectionHeader extends StatelessWidget {
  const _SectionHeader({required this.title, required this.ffTheme});
  final String title;
  final AppTheme ffTheme;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Text(title, style: ffTheme.titleMedium.copyWith(color: ffTheme.primaryText)),
    );
  }
}

class _Card extends StatelessWidget {
  const _Card({required this.child, required this.ffTheme});
  final Widget child;
  final AppTheme ffTheme;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(vertical: 4),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: ffTheme.alternate),
        boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.03), blurRadius: 10)],
      ),
      child: child,
    );
  }
}

class _Divider extends StatelessWidget {
  const _Divider({required this.ffTheme});
  final AppTheme ffTheme;

  @override
  Widget build(BuildContext context) {
    return Divider(height: 1, indent: 16, endIndent: 16, color: ffTheme.alternate);
  }
}

class _ToggleRow extends StatelessWidget {
  const _ToggleRow({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.value,
    required this.onChanged,
    required this.ffTheme,
  });
  final IconData icon;
  final String title;
  final String subtitle;
  final bool value;
  final ValueChanged<bool> onChanged;
  final AppTheme ffTheme;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      child: Row(
        children: [
          Container(
            width: 38,
            height: 38,
            decoration: BoxDecoration(
              color: ffTheme.accent1,
              borderRadius: BorderRadius.circular(10),
            ),
            child: Icon(icon, color: ffTheme.primary, size: 20),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title, style: ffTheme.titleSmall),
                Text(subtitle, style: ffTheme.bodySmall.copyWith(color: ffTheme.secondaryText)),
              ],
            ),
          ),
          Switch(
            value: value,
            onChanged: onChanged,
            activeThumbColor: ffTheme.primary,
          ),
        ],
      ),
    );
  }
}

class _ActionRow extends StatelessWidget {
  const _ActionRow({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.iconColor,
    required this.onTap,
    required this.ffTheme,
  });
  final IconData icon;
  final String title;
  final String subtitle;
  final Color iconColor;
  final VoidCallback onTap;
  final AppTheme ffTheme;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(16),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        child: Row(
          children: [
            Container(
              width: 38,
              height: 38,
              decoration: BoxDecoration(
                color: iconColor.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(10),
              ),
              child: Icon(icon, color: iconColor, size: 20),
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(title, style: ffTheme.titleSmall),
                  Text(subtitle, style: ffTheme.bodySmall.copyWith(color: ffTheme.secondaryText)),
                ],
              ),
            ),
            Icon(Icons.arrow_back_ios_rounded, size: 14, color: ffTheme.secondaryText),
          ],
        ),
      ),
    );
  }
}

// ── Theme Mode Selector ────────────────────────────────────────────────────────
class _ThemeModeCard extends StatelessWidget {
  const _ThemeModeCard({required this.ffTheme});
  final AppTheme ffTheme;

  @override
  Widget build(BuildContext context) {
    final appState = Provider.of<AppState>(context);
    final current = appState.themeMode;

    final options = [
      (ThemeMode.dark, 'כהה', '🌙'),
      (ThemeMode.light, 'בהיר', '☀️'),
      (ThemeMode.system, 'אוטומטי', '🔧'),
    ];

    return _Card(
      ffTheme: ffTheme,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        child: Row(
          children: [
            Container(
              width: 38,
              height: 38,
              decoration: BoxDecoration(
                color: ffTheme.brandAccentTint,
                borderRadius: BorderRadius.circular(10),
              ),
              child: Icon(Icons.dark_mode_rounded, color: ffTheme.brandAccent, size: 20),
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Row(
                children: options.map((opt) {
                  final (mode, label, emoji) = opt;
                  final isActive = current == mode;
                  return Expanded(
                    child: GestureDetector(
                      onTap: () =>
                          Provider.of<AppState>(context, listen: false).setThemeMode(mode),
                      child: AnimatedContainer(
                        duration: const Duration(milliseconds: 180),
                        margin: const EdgeInsets.symmetric(horizontal: 3),
                        padding: const EdgeInsets.symmetric(vertical: 8),
                        decoration: BoxDecoration(
                          color: isActive
                              ? ffTheme.brandAccent
                              : ffTheme.accent1,
                          borderRadius: BorderRadius.circular(10),
                          border: Border.all(
                            color: isActive
                                ? ffTheme.brandAccent
                                : ffTheme.alternate.withValues(alpha: 0.4),
                          ),
                        ),
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Text(emoji, style: const TextStyle(fontSize: 16)),
                            const SizedBox(height: 2),
                            Text(
                              label,
                              style: ffTheme.labelSmall.copyWith(
                                color: isActive ? Colors.white : ffTheme.secondaryText,
                                fontWeight: isActive ? FontWeight.w700 : FontWeight.w600,
                              ),
                              textAlign: TextAlign.center,
                            ),
                          ],
                        ),
                      ),
                    ),
                  );
                }).toList(),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ── Price-alert tuning: min monthly saving + alert frequency ────────────────────
class _PriceAlertTuningCard extends StatelessWidget {
  const _PriceAlertTuningCard({required this.ffTheme});
  final AppTheme ffTheme;

  @override
  Widget build(BuildContext context) {
    final appState = Provider.of<AppState>(context);
    final minSaving = appState.minSavingAlert;
    final frequency = appState.alertFrequency;

    const freqOptions = [
      ('immediate', 'מיידי'),
      ('daily', 'יומי'),
      ('weekly', 'שבועי'),
    ];

    return _Card(
      ffTheme: ffTheme,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Minimum monthly saving slider (₪).
            Row(
              children: [
                Container(
                  width: 38,
                  height: 38,
                  decoration: BoxDecoration(
                    color: ffTheme.accent1,
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: Icon(Icons.savings_rounded, color: ffTheme.saving, size: 20),
                ),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('סף חיסכון חודשי מינימלי', style: ffTheme.titleSmall),
                      Text(
                        'התראה רק כשהחיסכון לפחות בגובה זה',
                        style: ffTheme.bodySmall.copyWith(color: ffTheme.secondaryText),
                      ),
                    ],
                  ),
                ),
                Text(
                  '₪$minSaving',
                  style: ffTheme.titleSmall.copyWith(
                    color: ffTheme.saving,
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ],
            ),
            Slider(
              value: minSaving.toDouble().clamp(0, 100),
              min: 0,
              max: 100,
              divisions: 20,
              label: '₪$minSaving',
              activeColor: ffTheme.saving,
              onChanged: (v) => Provider.of<AppState>(context, listen: false)
                  .setMinSavingAlert(v.round()),
            ),
            const SizedBox(height: 8),
            // Alert frequency segmented choice.
            Text('תדירות התראות', style: ffTheme.titleSmall),
            const SizedBox(height: 10),
            Row(
              children: freqOptions.map((opt) {
                final (value, label) = opt;
                final isActive = frequency == value;
                return Expanded(
                  child: GestureDetector(
                    onTap: () => Provider.of<AppState>(context, listen: false)
                        .setAlertFrequency(value),
                    child: AnimatedContainer(
                      duration: const Duration(milliseconds: 180),
                      margin: const EdgeInsets.symmetric(horizontal: 3),
                      padding: const EdgeInsets.symmetric(vertical: 10),
                      decoration: BoxDecoration(
                        color: isActive ? ffTheme.brandAccent : ffTheme.accent1,
                        borderRadius: BorderRadius.circular(10),
                        border: Border.all(
                          color: isActive
                              ? ffTheme.brandAccent
                              : ffTheme.alternate.withValues(alpha: 0.4),
                        ),
                      ),
                      child: Text(
                        label,
                        textAlign: TextAlign.center,
                        style: ffTheme.labelMedium.copyWith(
                          color: isActive ? Colors.white : ffTheme.secondaryText,
                          fontWeight: isActive ? FontWeight.w700 : FontWeight.w600,
                        ),
                      ),
                    ),
                  ),
                );
              }).toList(),
            ),
            const SizedBox(height: 14),
            const InfoBanner(
              icon: Icons.notifications_active_rounded,
              title: 'נשלח התראה כשנמצא מסלול שחוסך לך לפחות את הסכום שבחרת.',
            ),
          ],
        ),
      ),
    );
  }
}

// ── Renewal reminders: days-ahead + time-of-day ─────────────────────────────────
class _RenewalReminderCard extends StatelessWidget {
  const _RenewalReminderCard({required this.ffTheme});
  final AppTheme ffTheme;

  Future<void> _pickTime(BuildContext context, String current) async {
    final parts = current.split(':');
    final initial = TimeOfDay(
      hour: int.tryParse(parts.isNotEmpty ? parts[0] : '') ?? 9,
      minute: int.tryParse(parts.length > 1 ? parts[1] : '') ?? 0,
    );
    final picked = await showTimePicker(
      context: context,
      initialTime: initial,
      builder: (ctx, child) => Directionality(
        textDirection: TextDirection.rtl,
        child: child ?? const SizedBox.shrink(),
      ),
    );
    if (picked == null || !context.mounted) return;
    final hh = picked.hour.toString().padLeft(2, '0');
    final mm = picked.minute.toString().padLeft(2, '0');
    Provider.of<AppState>(context, listen: false).setRenewalReminderTime('$hh:$mm');
  }

  @override
  Widget build(BuildContext context) {
    final appState = Provider.of<AppState>(context);
    final daysAhead = appState.renewalDaysAhead;
    final reminderTime = appState.renewalReminderTime;

    return _Card(
      ffTheme: ffTheme,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Days-ahead slider.
            Row(
              children: [
                Container(
                  width: 38,
                  height: 38,
                  decoration: BoxDecoration(
                    color: ffTheme.accent1,
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: Icon(Icons.event_repeat_rounded, color: ffTheme.primary, size: 20),
                ),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('כמה ימים מראש', style: ffTheme.titleSmall),
                      Text(
                        'נזכיר לך לפני מועד החידוש',
                        style: ffTheme.bodySmall.copyWith(color: ffTheme.secondaryText),
                      ),
                    ],
                  ),
                ),
                Text(
                  '$daysAhead ימים',
                  style: ffTheme.titleSmall.copyWith(
                    color: ffTheme.primary,
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ],
            ),
            Slider(
              value: daysAhead.toDouble().clamp(1, 60),
              min: 1,
              max: 60,
              divisions: 59,
              label: '$daysAhead ימים',
              activeColor: ffTheme.primary,
              onChanged: (v) => Provider.of<AppState>(context, listen: false)
                  .setRenewalDaysAhead(v.round()),
            ),
            const SizedBox(height: 8),
            // Time-of-day control.
            InkWell(
              onTap: () => _pickTime(context, reminderTime),
              borderRadius: BorderRadius.circular(12),
              child: Padding(
                padding: const EdgeInsets.symmetric(vertical: 8),
                child: Row(
                  children: [
                    Container(
                      width: 38,
                      height: 38,
                      decoration: BoxDecoration(
                        color: ffTheme.accent1,
                        borderRadius: BorderRadius.circular(10),
                      ),
                      child: Icon(Icons.schedule_rounded, color: ffTheme.primary, size: 20),
                    ),
                    const SizedBox(width: 14),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text('שעת התזכורת', style: ffTheme.titleSmall),
                          Text(
                            'מתי לשלוח את התזכורת ביום הנבחר',
                            style: ffTheme.bodySmall.copyWith(color: ffTheme.secondaryText),
                          ),
                        ],
                      ),
                    ),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                      decoration: BoxDecoration(
                        color: ffTheme.brandAccentTint,
                        borderRadius: BorderRadius.circular(10),
                        border: Border.all(color: ffTheme.alternate),
                      ),
                      child: Text(
                        reminderTime,
                        style: ffTheme.titleSmall.copyWith(
                          color: ffTheme.brandAccent,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 14),
            const InfoBanner(
              icon: Icons.alarm_rounded,
              title: 'התזכורת תישלח לפני מועד החידוש בשעה שבחרת, כדי שיהיה לך זמן להשוות מסלולים.',
            ),
          ],
        ),
      ),
    );
  }
}

// ── Telegram Connection Row ─────────────────────────────────────────────────────
class _TelegramRow extends StatefulWidget {
  const _TelegramRow({required this.ffTheme});
  final AppTheme ffTheme;

  @override
  State<_TelegramRow> createState() => _TelegramRowState();
}

class _TelegramRowState extends State<_TelegramRow> {
  bool _busy = false;

  Future<void> _connectTelegram() async {
    if (_busy) return;
    setState(() => _busy = true);
    try {
      final appState = Provider.of<AppState>(context, listen: false);
      final userId = appState.userPhone;
      const botUsername = 'chosech_bot';
      final deepLink = Uri.parse('https://t.me/$botUsername?start=user_$userId');

      if (await canLaunchUrl(deepLink)) {
        await launchUrl(deepLink, mode: LaunchMode.externalApplication);
        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('טלגרם נפתח. שלח /start כדי להתחבר')),
        );
      } else {
        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('לא ניתן לפתוח את טלגרם. אנא תקנו אותו תחילה.')),
        );
      }
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('שגיאה: $e')),
      );
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _testTelegram() async {
    if (_busy) return;
    setState(() => _busy = true);
    try {
      final appState = Provider.of<AppState>(context, listen: false);
      final success = await TelegramService.testConnection(appState.userTelegramChatId);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(success ? '✅ ההודעה נשלחה בהצלחה!' : '❌ כשל בשליחת הודעה. אנא נסה שוב.'),
        ),
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('שגיאה: $e')),
      );
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _disconnectTelegram() async {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('ניתוק טלגרם'),
        content: const Text('האם אתה בטוח שברצונך לנתק את חשבון הטלגרם שלך?'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('ביטול')),
          TextButton(
            onPressed: () {
              Navigator.pop(ctx);
              final appState = Provider.of<AppState>(context, listen: false);
              appState.clearTelegramData();
              setState(() {});
            },
            child: const Text('נתק', style: TextStyle(color: Colors.red)),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final appState = Provider.of<AppState>(context);
    final isConnected = appState.userTelegramChatId.isNotEmpty;
    final ffTheme = widget.ffTheme;

    if (isConnected) {
      return InkWell(
        onTap: () {},
        borderRadius: BorderRadius.circular(16),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
          child: Row(
            children: [
              Container(
                width: 38,
                height: 38,
                decoration: BoxDecoration(
                  color: const Color(0xFF0088cc).withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: const Icon(Icons.send, color: Color(0xFF0088cc), size: 20),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('טלגרם', style: ffTheme.titleSmall),
                    Text('✅ מחובר', style: ffTheme.bodySmall.copyWith(color: const Color(0xFF22C55E))),
                  ],
                ),
              ),
              PopupMenuButton(
                onSelected: (value) {
                  if (value == 'test') {
                    _testTelegram();
                  } else if (value == 'disconnect') {
                    _disconnectTelegram();
                  }
                },
                itemBuilder: (_) => [
                  const PopupMenuItem(value: 'test', child: Text('בדוק חיבור')),
                  const PopupMenuItem(value: 'disconnect', child: Text('נתק')),
                ],
              ),
            ],
          ),
        ),
      );
    } else {
      return InkWell(
        onTap: _busy ? null : _connectTelegram,
        borderRadius: BorderRadius.circular(16),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
          child: Row(
            children: [
              Container(
                width: 38,
                height: 38,
                decoration: BoxDecoration(
                  color: Colors.grey.withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Icon(Icons.send, color: Colors.grey[600], size: 20),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('טלגרם', style: ffTheme.titleSmall),
                    Text('חבר כדי לקבל הודעות', style: ffTheme.bodySmall.copyWith(color: ffTheme.secondaryText)),
                  ],
                ),
              ),
              if (_busy)
                const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2))
              else
                Icon(Icons.arrow_back_ios_rounded, size: 14, color: ffTheme.secondaryText),
            ],
          ),
        ),
      );
    }
  }
}
