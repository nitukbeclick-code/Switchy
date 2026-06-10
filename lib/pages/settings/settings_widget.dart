import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:flutter_animate/flutter_animate.dart';
import '../../theme/app_theme.dart';
import '../../core/nav.dart';
import '../../app_state.dart';
import '../../widgets/app_button.dart';

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
                ],
              ),
            ).animate().fadeIn(duration: 350.ms),

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
                        child: const Center(child: Text('💰', style: TextStyle(fontSize: 22))),
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
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(message),
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        duration: const Duration(seconds: 2),
      ),
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
