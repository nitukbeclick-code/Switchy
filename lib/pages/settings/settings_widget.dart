import 'package:flutter/material.dart';
import 'package:flutter/services.dart' show HapticFeedback;
import 'package:provider/provider.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../theme/app_theme.dart';
import '../../widgets/app_snackbar.dart';
import '../../widgets/app_sheet.dart';
import '../../core/nav.dart';
import '../../app_state.dart';
import '../../services/auth_service.dart';
import '../../services/telegram_service.dart';
import '../../widgets/app_button.dart';
import '../../widgets/sticky_cta_scaffold.dart';

class SettingsWidget extends StatelessWidget {
  const SettingsWidget({super.key});

  @override
  Widget build(BuildContext context) {
    final ffTheme = AppTheme.of(context);
    final appState = Provider.of<AppState>(context);

    final appBar = AppBar(
      title: Text('הגדרות', style: ffTheme.titleLarge.copyWith(color: ffTheme.primaryText)),
      backgroundColor: Colors.transparent,
      elevation: 0,
      foregroundColor: ffTheme.primaryText,
      leading: IconButton(
        icon: const Icon(Icons.arrow_forward_ios_rounded),
        tooltip: 'חזרה',
        onPressed: () => context.safePop(),
      ),
    );

    final scrollBody = SingleChildScrollView(
      padding: const EdgeInsets.symmetric(horizontal: 20),
      child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const SizedBox(height: 8),

            // ── Section 1: Notifications ──────────────────────────────────
            _SectionHeader(title: 'התראות', subtitle: 'בחרו אילו עדכונים תקבלו', ffTheme: ffTheme),
            _Card(
              ffTheme: ffTheme,
              child: Column(
                children: [
                  _ToggleRow(
                    icon: Icons.price_change_rounded,
                    title: 'התראות מחיר',
                    subtitle: 'קבל עדכון כשמחיר חבילה משתנה',
                    value: appState.prefPriceAlerts,
                    onChanged: (v) {
                      HapticFeedback.selectionClick();
                      Provider.of<AppState>(context, listen: false).setPrefPriceAlerts(v);
                    },
                    ffTheme: ffTheme,
                  ),
                  _Divider(ffTheme: ffTheme),
                  _ToggleRow(
                    icon: Icons.update_rounded,
                    title: 'עדכוני בקשות',
                    subtitle: 'קבל התראה על סטטוס הבקשה שלך',
                    value: appState.prefRequestUpdates,
                    onChanged: (v) {
                      HapticFeedback.selectionClick();
                      Provider.of<AppState>(context, listen: false).setPrefRequestUpdates(v);
                    },
                    ffTheme: ffTheme,
                  ),
                  _Divider(ffTheme: ffTheme),
                  _ToggleRow(
                    icon: Icons.people_rounded,
                    title: 'פעילות קהילה',
                    subtitle: 'קבל עדכונים על פוסטים ותגובות',
                    value: appState.prefCommunityNotifs,
                    onChanged: (v) {
                      HapticFeedback.selectionClick();
                      Provider.of<AppState>(context, listen: false).setPrefCommunityNotifs(v);
                    },
                    ffTheme: ffTheme,
                  ),
                  _Divider(ffTheme: ffTheme),
                  _TelegramRow(ffTheme: ffTheme),
                ],
              ),
            ).animate().fadeIn(duration: 350.ms).slideY(begin: 0.06, end: 0),

            const SizedBox(height: 24),

            // ── Section 2: Data & Privacy ─────────────────────────────────
            _SectionHeader(title: 'נתונים ופרטיות', subtitle: 'נהלו את המידע השמור במכשיר', ffTheme: ffTheme),
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
            ).animate().fadeIn(delay: 120.ms, duration: 350.ms).slideY(begin: 0.06, end: 0),

            const SizedBox(height: 24),

            // ── Appearance: theme mode (system / light / dark) ────────────
            _SectionHeader(title: 'מראה', subtitle: 'איך האפליקציה נראית', ffTheme: ffTheme),
            _Card(
              ffTheme: ffTheme,
              child: Padding(
                padding: const EdgeInsets.fromLTRB(16, 14, 16, 16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
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
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text('ערכת נושא', style: ffTheme.titleSmall),
                              Text('בהיר, כהה או לפי המכשיר', style: ffTheme.bodySmall.copyWith(color: ffTheme.secondaryText)),
                            ],
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 14),
                    _ThemeSegmented(
                      ffTheme: ffTheme,
                      mode: appState.themeMode,
                      onChanged: (m) {
                        HapticFeedback.selectionClick();
                        Provider.of<AppState>(context, listen: false).setThemeMode(m);
                      },
                    ),
                  ],
                ),
              ),
            ).animate().fadeIn(delay: 250.ms, duration: 350.ms).slideY(begin: 0.06, end: 0),

            const SizedBox(height: 24),

            // ── Security (Face ID) — mobile + biometric + real account only ─
            _BiometricSection(ffTheme: ffTheme),

            // ── Section 3: About ──────────────────────────────────────────
            _SectionHeader(title: 'אודות', subtitle: 'גרסה ופרטי האפליקציה', ffTheme: ffTheme),
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
                          gradient: ffTheme.accentGradient,
                          borderRadius: BorderRadius.circular(12),
                          boxShadow: ffTheme.shadowAccent,
                        ),
                        child: const Center(child: ExcludeSemantics(child: Icon(Icons.savings_outlined, size: 22, color: Colors.white))),
                      ),
                      const SizedBox(width: 14),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text('Switchy AI', style: ffTheme.titleMedium.copyWith(color: ffTheme.primaryText)),
                            Text('השוואת מחירי תקשורת בישראל', style: ffTheme.bodySmall),
                          ],
                        ),
                      ),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                        decoration: BoxDecoration(
                          color: ffTheme.brandAccentTint,
                          borderRadius: BorderRadius.circular(8),
                          border: Border.all(color: ffTheme.brandAccent.withValues(alpha: 0.2)),
                        ),
                        child: Text('1.0.0', style: ffTheme.labelSmall.copyWith(color: ffTheme.brandAccentText, fontWeight: FontWeight.w700)),
                      ),
                    ],
                  ),
                  const SizedBox(height: 16),
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.all(14),
                    decoration: BoxDecoration(
                      color: ffTheme.background,
                      borderRadius: BorderRadius.circular(ffTheme.radiusMd),
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
            ).animate().fadeIn(delay: 320.ms, duration: 350.ms).slideY(begin: 0.06, end: 0),

            // The logout CTA is pinned to the bottom (StickyCtaScaffold) instead
            // of scrolling with the list, so leave only breathing room here.
            const SizedBox(height: 32),
          ],
        ),
      );

    // Logged-in users get the logout CTA pinned above the scrolling list via
    // StickyCtaScaffold; guests keep the plain scaffold (no CTA bar). Either way
    // the page body and every setting render identically.
    if (appState.isLoggedIn) {
      return StickyCtaScaffold(
        appBar: appBar,
        body: scrollBody,
        cta: AppButton(
          text: 'התנתקות',
          color: ffTheme.error,
          width: double.infinity,
          onPressed: () => _confirmLogout(context),
        ).animate().fadeIn(delay: 300.ms, duration: 350.ms),
      );
    }

    return Scaffold(
      backgroundColor: ffTheme.background,
      appBar: appBar,
      body: scrollBody,
    );
  }

  /// Logout confirm — an AppSheet bottom-sheet (primary destructive + secondary
  /// cancel) replacing the old centred AlertDialog. On confirm it signs out,
  /// clears AppState, and returns Home (unchanged behaviour).
  Future<void> _confirmLogout(BuildContext context) async {
    final ffTheme = AppTheme.of(context);
    final confirmed = await AppSheet.show<bool>(
      context,
      title: 'התנתקות',
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text('האם להתנתק מהחשבון?', style: ffTheme.bodyMedium),
          const SizedBox(height: 16),
          AppButton(
            text: 'התנתק',
            color: ffTheme.error,
            width: double.infinity,
            onPressed: () async => Navigator.pop(context, true),
          ),
          const SizedBox(height: 8),
          AppButton.secondary(
            text: 'ביטול',
            width: double.infinity,
            onPressed: () async => Navigator.pop(context, false),
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
  }

  /// Generic destructive confirm — an AppSheet bottom-sheet (primary confirm in
  /// [confirmColor] + secondary cancel) replacing the old AlertDialog. Runs
  /// [onConfirm] only when the user taps the confirm action.
  Future<void> _confirmAction({
    required BuildContext context,
    required AppTheme ffTheme,
    required String title,
    required String message,
    required String confirmLabel,
    required Color confirmColor,
    required VoidCallback onConfirm,
  }) async {
    final confirmed = await AppSheet.show<bool>(
      context,
      title: title,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(message, style: ffTheme.bodyMedium),
          const SizedBox(height: 16),
          AppButton(
            text: confirmLabel,
            color: confirmColor,
            width: double.infinity,
            onPressed: () async => Navigator.pop(context, true),
          ),
          const SizedBox(height: 8),
          AppButton.secondary(
            text: 'ביטול',
            width: double.infinity,
            onPressed: () async => Navigator.pop(context, false),
          ),
        ],
      ),
    );
    if (confirmed == true && context.mounted) onConfirm();
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
        _SectionHeader(title: 'אבטחה', subtitle: 'כניסה מהירה ומאובטחת לחשבון', ffTheme: ffTheme),
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
  const _SectionHeader({required this.title, required this.ffTheme, this.subtitle});
  final String title;
  final String? subtitle;
  final AppTheme ffTheme;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(title, style: ffTheme.titleMedium.copyWith(color: ffTheme.primaryText)),
          if (subtitle != null) ...[
            const SizedBox(height: 2),
            Text(subtitle!, style: ffTheme.bodySmall.copyWith(color: ffTheme.secondaryText)),
          ],
        ],
      ),
    );
  }
}

/// A 3-way segmented control for the app theme: system / light / dark.
/// Bound to [AppState.themeMode]; the active segment carries the green ACTION
/// gradient so the choice reads at a glance in both light and dark.
class _ThemeSegmented extends StatelessWidget {
  const _ThemeSegmented({required this.ffTheme, required this.mode, required this.onChanged});
  final AppTheme ffTheme;
  final ThemeMode mode;
  final ValueChanged<ThemeMode> onChanged;

  static const _segments = <(ThemeMode, String, IconData)>[
    (ThemeMode.system, 'מערכת', Icons.brightness_auto_rounded),
    (ThemeMode.light, 'בהיר', Icons.light_mode_rounded),
    (ThemeMode.dark, 'כהה', Icons.dark_mode_rounded),
  ];

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(
        color: ffTheme.background,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: ffTheme.alternate),
      ),
      child: Row(
        children: _segments.map((s) {
          final active = mode == s.$1;
          return Expanded(
            child: Semantics(
              button: true,
              selected: active,
              label: s.$2,
              child: GestureDetector(
                onTap: () => onChanged(s.$1),
                behavior: HitTestBehavior.opaque,
                child: AnimatedContainer(
                  duration: ffTheme.motionMedium,
                  curve: ffTheme.easeOut,
                  padding: const EdgeInsets.symmetric(vertical: 10),
                  decoration: BoxDecoration(
                    gradient: active ? ffTheme.accentGradient : null,
                    borderRadius: BorderRadius.circular(10),
                    boxShadow: active ? ffTheme.shadowAccent : null,
                  ),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      ExcludeSemantics(
                        child: Icon(s.$3, size: 18, color: active ? Colors.white : ffTheme.secondaryText),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        s.$2,
                        style: ffTheme.labelSmall.copyWith(
                          color: active ? Colors.white : ffTheme.secondaryText,
                          fontWeight: active ? FontWeight.w700 : FontWeight.w600,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          );
        }).toList(),
      ),
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
      decoration: ffTheme.cardDecoration(radius: ffTheme.radiusLg),
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
              color: ffTheme.brandAccentTint,
              borderRadius: BorderRadius.circular(10),
            ),
            child: Icon(icon, color: ffTheme.brandAccent, size: 20),
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
            activeThumbColor: ffTheme.brandAccent,
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
      final userId = appState.userId;
      const botUsername = 'chosech_bot';
      final deepLink = Uri.parse('https://t.me/$botUsername?start=user_$userId');

      if (await canLaunchUrl(deepLink)) {
        await launchUrl(deepLink, mode: LaunchMode.externalApplication);
        if (!mounted) return;
        AppSnackBar.info(context, 'טלגרם נפתח. שלח /start כדי להתחבר');
      } else {
        if (!mounted) return;
        AppSnackBar.error(context, 'לא ניתן לפתוח את טלגרם. אנא תקנו אותו תחילה.');
      }
    } catch (e) {
      if (!mounted) return;
      AppSnackBar.error(context, 'שגיאה: $e');
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
      if (success) {
        AppSnackBar.success(context, '✅ ההודעה נשלחה בהצלחה!');
      } else {
        AppSnackBar.error(context, '❌ כשל בשליחת הודעה. אנא נסה שוב.');
      }
    } catch (e) {
      if (!mounted) return;
      AppSnackBar.error(context, 'שגיאה: $e');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _disconnectTelegram() async {
    final ffTheme = widget.ffTheme;
    final confirmed = await AppSheet.show<bool>(
      context,
      title: 'ניתוק טלגרם',
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text('האם אתה בטוח שברצונך לנתק את חשבון הטלגרם שלך?', style: ffTheme.bodyMedium),
          const SizedBox(height: 16),
          AppButton(
            text: 'נתק',
            color: ffTheme.error,
            width: double.infinity,
            onPressed: () async => Navigator.pop(context, true),
          ),
          const SizedBox(height: 8),
          AppButton.secondary(
            text: 'ביטול',
            width: double.infinity,
            onPressed: () async => Navigator.pop(context, false),
          ),
        ],
      ),
    );
    if (confirmed == true && mounted) {
      Provider.of<AppState>(context, listen: false).clearTelegramData();
      setState(() {});
    }
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
                    Text('✅ מחובר', style: ffTheme.bodySmall.copyWith(color: ffTheme.brandAccentText)),
                  ],
                ),
              ),
              PopupMenuButton(
                tooltip: 'אפשרויות טלגרם',
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
                  color: ffTheme.secondaryText.withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Icon(Icons.send, color: ffTheme.secondaryText, size: 20),
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
