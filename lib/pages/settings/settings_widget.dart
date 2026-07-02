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
import '../../services/session_actions.dart';
import '../../services/telegram_service.dart';
import '../../widgets/app_button.dart';
import '../../widgets/pressable.dart';
import '../../widgets/sticky_cta_scaffold.dart';

/// Reduced-motion-aware settle for the section cards: `.settleY()` is a
/// drop-in for `.slideY(begin: …)` that KEEPS the fade already on the chain
/// but DROPS the slide transform when the OS asks for reduced motion —
/// the same policy [_RowReveal] applies to the rows inside the cards.
extension _SettleYX on Animate {
  Animate settleY(BuildContext context, {double begin = 0.06}) {
    final reduceMotion =
        MediaQuery.maybeOf(context)?.disableAnimations ?? false;
    if (reduceMotion) return this;
    return slideY(begin: begin, end: 0);
  }
}

/// Factual copy for the account-deletion confirm sheet (truth-only: it states
/// exactly what the `account-delete` edge function + the local wipe erase, and
/// what the law obliges us to keep). Two variants, picked by whether a REAL
/// (non-anonymous) account is signed in on this device. Exposed for tests.
@visibleForTesting
const String kDeleteAccountSummaryLoggedIn =
    'המחיקה מסירה לצמיתות את החשבון והמידע האישי: פרופיל, חשבונות שהזנתם, העדפות ומעקבים, פוסטים ותגובות בקהילה והיסטוריית הצ׳אט. פרטים אישיים בפניות ובפגישות נמחקים מהרשומות. מידע שחובה לשמור לפי דין (רישומי הסכמה והסרה) נשמר. הפעולה אינה הפיכה.';

/// The guest-device variant: no registered account, so the deletion clears the
/// local data plus the server traces of the device's ANONYMOUS identity.
@visibleForTesting
const String kDeleteAccountSummaryGuest =
    'אין חשבון רשום במכשיר הזה. המחיקה תנקה את הנתונים המקומיים ואת עקבות השרת של הזהות האנונימית של המכשיר. הפעולה אינה הפיכה.';

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
                  // Emil: settings rows cascade in (stagger 40ms, fade + 8px
                  // settle, ease-out) so the list reads as a sequence, not a
                  // single block popping in — reduced-motion keeps the fade,
                  // drops the transform (see [_RowReveal]).
                  _RowReveal(index: 0, child:
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
                  ),
                  _Divider(ffTheme: ffTheme),
                  _RowReveal(index: 1, child:
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
                  ),
                  _Divider(ffTheme: ffTheme),
                  _RowReveal(index: 2, child:
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
                  ),
                  _Divider(ffTheme: ffTheme),
                  _RowReveal(index: 3, child: _TelegramRow(ffTheme: ffTheme)),
                ],
              ),
            ).animate().fadeIn(duration: 350.ms),

            const SizedBox(height: 24),

            // ── Section 2: Data & Privacy ─────────────────────────────────
            _SectionHeader(title: 'נתונים ופרטיות', subtitle: 'נהלו את המידע השמור במכשיר', ffTheme: ffTheme),
            _Card(
              ffTheme: ffTheme,
              child: Column(
                children: [
                  _RowReveal(index: 0, child:
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
                        holdHint: 'החזק כדי לאפס',
                        confirmColor: ffTheme.warning,
                        onConfirm: () {
                          Provider.of<AppState>(context, listen: false).resetAllBills();
                          _showSnack(context, 'החשבונות אופסו בהצלחה');
                        },
                      ),
                      ffTheme: ffTheme,
                    ),
                  ),
                  _Divider(ffTheme: ffTheme),
                  _RowReveal(index: 1, child:
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
                        holdHint: 'החזק כדי למחוק',
                        confirmColor: ffTheme.error,
                        onConfirm: () {
                          Provider.of<AppState>(context, listen: false).clearAdvisorHistory();
                          _showSnack(context, 'שיחת היועץ נוקתה');
                        },
                      ),
                      ffTheme: ffTheme,
                    ),
                  ),
                ],
              ),
            ).animate().fadeIn(delay: 120.ms, duration: 350.ms).settleY(context),

            const SizedBox(height: 24),

            // ── Section: Legal & account deletion ─────────────────────────
            // Google Play requires apps that support accounts to surface the
            // privacy policy AND a clear account/data-deletion path INSIDE the
            // app (not only on the store listing). Privacy/terms open the
            // canonical web pages via the external browser; the deletion row
            // runs the REAL in-app flow ([_confirmDeleteAccount]), which links
            // to the full web policy from inside its sheet.
            _SectionHeader(title: 'משפטי ומחיקת חשבון', subtitle: 'מדיניות, תנאים ומחיקת המידע שלך', ffTheme: ffTheme),
            _Card(
              ffTheme: ffTheme,
              child: Column(
                children: [
                  _RowReveal(index: 0, child:
                    _ActionRow(
                      icon: Icons.privacy_tip_outlined,
                      title: 'מדיניות פרטיות',
                      subtitle: 'איזה מידע נאסף וכיצד הוא מטופל',
                      iconColor: ffTheme.secondaryText,
                      onTap: () => _openUrl(context, 'https://switchy-ai.com/privacy'),
                      ffTheme: ffTheme,
                    ),
                  ),
                  _Divider(ffTheme: ffTheme),
                  _RowReveal(index: 1, child:
                    _ActionRow(
                      icon: Icons.description_outlined,
                      title: 'תנאי שימוש',
                      subtitle: 'התנאים לשימוש בשירות',
                      iconColor: ffTheme.secondaryText,
                      onTap: () => _openUrl(context, 'https://switchy-ai.com/terms'),
                      ffTheme: ffTheme,
                    ),
                  ),
                  _Divider(ffTheme: ffTheme),
                  _RowReveal(index: 2, child:
                    _ActionRow(
                      icon: Icons.delete_forever_outlined,
                      title: 'מחיקת חשבון ונתונים',
                      subtitle: 'מחיקה לצמיתות של החשבון והמידע',
                      iconColor: ffTheme.error,
                      onTap: () => _confirmDeleteAccount(context),
                      ffTheme: ffTheme,
                    ),
                  ),
                ],
              ),
            ).animate().fadeIn(delay: 180.ms, duration: 350.ms).settleY(context),

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
                            color: ffTheme.accent1,
                            borderRadius: BorderRadius.circular(ffTheme.radiusLg),
                          ),
                          child: Icon(Icons.dark_mode_rounded, color: ffTheme.secondaryText, size: 20),
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
            ).animate().fadeIn(delay: 250.ms, duration: 350.ms).settleY(context),

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
                          // Neutral accent1 medallion — decorative icon tiles
                          // don't spend the green (CTAs/active states only).
                          color: ffTheme.accent1,
                          borderRadius: BorderRadius.circular(ffTheme.radiusCard),
                        ),
                        child: Center(child: ExcludeSemantics(child: Icon(Icons.savings_outlined, size: 22, color: ffTheme.secondaryText))),
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
                          // Neutral INFO chip: surface + hairline + ink — the
                          // version number is data, not an active/green state.
                          color: ffTheme.accent1,
                          borderRadius: BorderRadius.circular(ffTheme.radiusSm),
                          border: Border.all(color: ffTheme.lineColor),
                        ),
                        child: Text('1.0.10', style: ffTheme.labelSmall.copyWith(color: ffTheme.secondaryText, fontWeight: FontWeight.w700)),
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
            ).animate().fadeIn(delay: 320.ms, duration: 350.ms).settleY(context),

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

  /// Logout confirm — an AppSheet bottom-sheet whose primary action is an Emil
  /// HOLD-TO-CONFIRM ([_HoldToConfirm]): logging out is destructive (signs out +
  /// wipes local AppState), so the user must press-and-HOLD to commit — a slow,
  /// deliberate ~1.5s LINEAR fill; releasing early SNAPS back. On completion it
  /// pops the sheet `true`, then runs the FULL sign-out ([signOutCompletely] —
  /// server token revoke + complete local session teardown) and returns Home.
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
          _HoldToConfirm(
            label: 'התנתק',
            holdHint: 'החזק כדי להתנתק',
            color: ffTheme.error,
            ffTheme: ffTheme,
            onConfirmed: () => Navigator.pop(context, true),
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
      final appState = Provider.of<AppState>(context, listen: false);
      await signOutCompletely(appState);
      if (!context.mounted) return;
      context.goNamed('Home');
    }
  }

  /// Account deletion confirm — the REAL in-app deletion path (Play requires a
  /// working in-app deletion, not just a web page explaining how to ask). The
  /// sheet states factually what gets erased — different copy for a registered
  /// account ([kDeleteAccountSummaryLoggedIn]) vs. a guest device whose only
  /// identity is the anonymous session ([kDeleteAccountSummaryGuest]) — links
  /// to the full web policy, and gates the irreversible action behind the same
  /// hold-to-confirm gesture as logout (error colour: this deletes, it doesn't
  /// just sign out). A confirmed hold runs [deleteAccountCompletely] behind a
  /// blocking progress barrier: success lands on onboarding with a
  /// confirmation snackbar; failure changes NOTHING locally and shows an
  /// honest error with the support address.
  Future<void> _confirmDeleteAccount(BuildContext context) async {
    final ffTheme = AppTheme.of(context);
    final summary = AuthService.instance.isRealUser
        ? kDeleteAccountSummaryLoggedIn
        : kDeleteAccountSummaryGuest;
    final confirmed = await AppSheet.show<bool>(
      context,
      title: 'מחיקת חשבון ונתונים',
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(summary, style: ffTheme.bodyMedium),
          const SizedBox(height: 12),
          // Quiet secondary link to the canonical web policy for full details.
          Align(
            alignment: AlignmentDirectional.centerStart,
            child: Semantics(
              button: true,
              child: Pressable(
                onTap: () =>
                    _openUrl(context, 'https://switchy-ai.com/account-deletion'),
                child: Padding(
                  padding: const EdgeInsets.symmetric(vertical: 4),
                  child: Text(
                    'למדיניות המחיקה המלאה',
                    style: ffTheme.bodySmall.copyWith(
                      color: ffTheme.secondaryText,
                      decoration: TextDecoration.underline,
                    ),
                  ),
                ),
              ),
            ),
          ),
          const SizedBox(height: 16),
          _HoldToConfirm(
            label: 'מחק חשבון',
            holdHint: 'החזיקו כדי למחוק',
            color: ffTheme.error,
            ffTheme: ffTheme,
            onConfirmed: () => Navigator.pop(context, true),
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
    if (confirmed != true || !context.mounted) return;

    final appState = Provider.of<AppState>(context, listen: false);
    // Blocking progress while the server erase + local wipe run — nothing else
    // is tappable (no barrier dismiss, no back-pop) until the outcome is known.
    showDialog<void>(
      context: context,
      barrierDismissible: false,
      useRootNavigator: true,
      builder: (_) => const PopScope(
        canPop: false,
        child: Center(child: CircularProgressIndicator()),
      ),
    );
    final ok = await deleteAccountCompletely(appState);
    if (!context.mounted) return;
    Navigator.of(context, rootNavigator: true).pop(); // drop the progress barrier
    if (ok) {
      // Everything is gone (server-side + local) — restart at onboarding.
      context.goNamed('Onboarding');
      AppSnackBar.success(context, 'החשבון והנתונים נמחקו');
    } else {
      // Fail-soft: the server refused / was unreachable, so NOTHING local was
      // changed — the user keeps their data and can retry or contact us.
      AppSnackBar.error(
          context, 'המחיקה נכשלה — נסו שוב או כתבו ל-hello@switchy-ai.com');
    }
  }

  /// Generic destructive confirm — an AppSheet bottom-sheet whose primary action
  /// is an Emil HOLD-TO-CONFIRM ([_HoldToConfirm]). These flows DELETE data
  /// (reset bills / clear chat / clear advisor history), so a single tap is too
  /// easy: the user must press-and-HOLD (~1.5s LINEAR progress fill) to commit;
  /// releasing early SNAPS the fill back (200ms ease-out) and nothing happens.
  /// On completion it pops the sheet `true`, so the outer `onConfirm` contract is
  /// unchanged — only the gesture got more deliberate. [holdHint] is the spoken
  /// a11y prompt ("החזק כדי ל…").
  Future<void> _confirmAction({
    required BuildContext context,
    required AppTheme ffTheme,
    required String title,
    required String message,
    required String confirmLabel,
    required String holdHint,
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
          _HoldToConfirm(
            label: confirmLabel,
            holdHint: holdHint,
            color: confirmColor,
            ffTheme: ffTheme,
            onConfirmed: () => Navigator.pop(context, true),
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

  /// Open a canonical legal/deletion web page in the external browser. Used by
  /// the privacy / terms / account-deletion rows (Play compliance: these must be
  /// reachable from inside the app).
  Future<void> _openUrl(BuildContext context, String url) async {
    final uri = Uri.parse(url);
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    } else if (context.mounted) {
      AppSnackBar.error(context, 'לא ניתן לפתוח את הקישור');
    }
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

/// Emil staggered list-row reveal. Each settings row cascades in by [index] *
/// 40ms (within the 30–80ms band), fading + settling up 8px under the app's
/// signature ease-out — so a section reads as a sequence rather than a single
/// block popping in. Reduced-motion KEEPS the fade but DROPS the transform
/// (per `MediaQuery.disableAnimations`), so the cascade never lurches for users
/// who asked for less movement.
class _RowReveal extends StatelessWidget {
  const _RowReveal({required this.index, required this.child});
  final int index;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final reduceMotion = MediaQuery.maybeOf(context)?.disableAnimations ?? false;
    final delay = (index.clamp(0, 8) * 40).ms;
    if (reduceMotion) {
      return child.animate().fadeIn(delay: delay, duration: 280.ms);
    }
    return child
        .animate()
        .fadeIn(delay: delay, duration: 280.ms, curve: Curves.easeOut)
        .slideY(begin: 0.06, end: 0, delay: delay, duration: 280.ms, curve: const Cubic(0.22, 1, 0.36, 1));
  }
}

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
          // Section headings are marked for screen-reader navigation.
          Semantics(
            header: true,
            child: Text(title, style: ffTheme.titleMedium.copyWith(color: ffTheme.primaryText)),
          ),
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
/// Bound to [AppState.themeMode]; the active segment carries the canonical
/// ACTIVE chip treatment (brandAccentTint + green hairline + green ink) — not a
/// solid-green fill, which is reserved for primary CTAs and whose pinned-white
/// label went illegible on the lifted dark-mode green.
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
        borderRadius: BorderRadius.circular(ffTheme.radiusCard),
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
                    color: active ? ffTheme.brandAccentTint : null,
                    borderRadius: BorderRadius.circular(ffTheme.radiusLg),
                    border: Border.all(
                      color: active
                          ? ffTheme.brandAccent.withValues(alpha: 0.22)
                          : Colors.transparent,
                    ),
                  ),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      ExcludeSemantics(
                        child: Icon(s.$3, size: 18, color: active ? ffTheme.brandAccentText : ffTheme.secondaryText),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        s.$2,
                        style: ffTheme.labelSmall.copyWith(
                          color: active ? ffTheme.brandAccentText : ffTheme.secondaryText,
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
    // In-card row separators use the default hairline token, not the heavier
    // input-emphasis `alternate`.
    return Divider(height: 1, indent: 16, endIndent: 16, color: ffTheme.lineColor);
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
    // MergeSemantics: the switch and its title/subtitle announce as ONE named
    // toggle (e.g. "התראות מחיר, מופעל") instead of an unnamed switch.
    return MergeSemantics(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        child: Row(
          children: [
            Container(
              width: 38,
              height: 38,
              decoration: BoxDecoration(
                color: ffTheme.accent1,
                borderRadius: BorderRadius.circular(ffTheme.radiusLg),
              ),
              child: Icon(icon, color: ffTheme.secondaryText, size: 20),
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
    // Emil: a destructive/navigational row is an OCCASIONAL tap, so it earns the
    // tactile press-scale (scale 0.97, ease-out settle) + light haptic via the
    // shared [Pressable] — the same press language as every other tappable row
    // in the app. Reduced-motion skips the scale (handled inside Pressable).
    // Button role for the tappable row (Pressable adds no semantics itself).
    return Semantics(
      button: true,
      child: Pressable(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        child: Row(
          children: [
            Container(
              width: 38,
              height: 38,
              decoration: BoxDecoration(
                color: iconColor.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(ffTheme.radiusLg),
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
            ExcludeSemantics(child: Icon(Icons.arrow_back_ios_rounded, size: 14, color: ffTheme.secondaryText)),
          ],
        ),
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
        AppSnackBar.success(context, 'ההודעה נשלחה בהצלחה!');
      } else {
        AppSnackBar.error(context, 'כשל בשליחת הודעה. אנא נסה שוב.');
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
      return Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
          child: Row(
            children: [
              Container(
                width: 38,
                height: 38,
                decoration: BoxDecoration(
                  color: const Color(0xFF0088cc).withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(ffTheme.radiusLg),
                ),
                child: const Icon(Icons.send, color: Color(0xFF0088cc), size: 20),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('טלגרם', style: ffTheme.titleSmall),
                    Row(
                      children: [
                        Icon(Icons.check_circle_rounded, size: 14, color: ffTheme.brandAccent),
                        const SizedBox(width: 4),
                        Text('מחובר', style: ffTheme.bodySmall.copyWith(color: ffTheme.brandAccentText, fontWeight: FontWeight.w700)),
                      ],
                    ),
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
        );
    } else {
      // Same press language as every other tappable row (Pressable), with an
      // explicit button role — InkWell alone announced nothing.
      return Semantics(
        button: true,
        child: Pressable(
        onTap: _busy ? null : _connectTelegram,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
          child: Row(
            children: [
              Container(
                width: 38,
                height: 38,
                decoration: BoxDecoration(
                  color: ffTheme.secondaryText.withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(ffTheme.radiusLg),
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
                ExcludeSemantics(child: Icon(Icons.arrow_back_ios_rounded, size: 14, color: ffTheme.secondaryText)),
            ],
          ),
        ),
        ),
      );
    }
  }
}

// ── Emil signature: HOLD-TO-CONFIRM (asymmetric) ────────────────────────────────
/// The destructive-confirm primary action. Unlike a tap, committing here demands
/// a deliberate PRESS-AND-HOLD: while held, a fill sweeps the button via a
/// clip-path-equivalent ([ClipRect] + [Align] `widthFactor`) over ~1.5s on a
/// LINEAR curve, and only a *completed* sweep fires [onConfirmed]. The motion is
/// intentionally ASYMMETRIC — slow + deliberate to arm, but if the finger lifts
/// early the fill SNAPS back fast (200ms ease-out) and nothing happens. A light
/// `scale(0.97)` press feedback (the app's [AppTheme.pressScale]) gives the
/// "I'm holding" tell, and a heavy haptic punctuates completion.
///
/// On confirm it calls [onConfirmed] — the call sites pass
/// `() => Navigator.pop(context, true)`, so the surrounding confirm contract is
/// byte-for-byte preserved; only the gesture changed from tap → hold.
///
/// A11Y / REDUCED-MOTION: a timed hold is hostile to switch-control and to users
/// who asked for less motion, so when [MediaQuery.disableAnimations] is set this
/// degrades to a single-tap [AppButton] (same label, colour, onConfirmed) — no
/// progress, no transform. Either way the control is a [Semantics] `button`
/// labelled with [holdHint] ("החזק כדי ל…"), and exposes `onLongPress` so
/// assistive tech can commit without timing a physical hold.
class _HoldToConfirm extends StatefulWidget {
  const _HoldToConfirm({
    required this.label,
    required this.holdHint,
    required this.color,
    required this.ffTheme,
    required this.onConfirmed,
  });

  /// Resting label, e.g. 'מחק' / 'אפס' / 'התנתק'.
  final String label;

  /// Spoken a11y prompt while held, e.g. 'החזק כדי למחוק'.
  final String holdHint;

  /// Destructive fill colour (error / warning) — white label sits on top.
  final Color color;
  final AppTheme ffTheme;

  /// Fired exactly once when a full hold completes.
  final VoidCallback onConfirmed;

  @override
  State<_HoldToConfirm> createState() => _HoldToConfirmState();
}

class _HoldToConfirmState extends State<_HoldToConfirm>
    with SingleTickerProviderStateMixin {
  // ~1.5s LINEAR arming sweep. The controller's RAW value is the fill fraction
  // while held; on release we animate it back fast with an ease-out curve, so
  // the press↔release asymmetry lives in *how* we drive this one controller.
  static const Duration _holdDuration = Duration(milliseconds: 1500);
  static const Duration _snapBackDuration = Duration(milliseconds: 200);

  late final AnimationController _ctrl;
  bool _holding = false;
  bool _fired = false;

  @override
  void initState() {
    super.initState();
    _ctrl = AnimationController(vsync: this, duration: _holdDuration)
      ..addStatusListener(_onStatus);
  }

  void _onStatus(AnimationStatus status) {
    if (status == AnimationStatus.completed && !_fired) {
      _fired = true;
      HapticFeedback.heavyImpact();
      widget.onConfirmed();
    }
  }

  void _startHold() {
    if (_fired) return;
    setState(() => _holding = true);
    HapticFeedback.selectionClick();
    // LINEAR fill from the current position to full over the remaining time.
    _ctrl.forward();
  }

  void _endHold() {
    if (_fired || !_holding) return;
    setState(() => _holding = false);
    // SNAP back fast (ease-out) — the asymmetric release. Nothing fires.
    _ctrl.animateBack(0, duration: _snapBackDuration, curve: widget.ffTheme.easeOut);
  }

  /// Assistive-tech path: commit immediately (skip the physical hold timing).
  void _confirmNow() {
    if (_fired) return;
    _fired = true;
    HapticFeedback.heavyImpact();
    widget.onConfirmed();
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final ffTheme = widget.ffTheme;
    final reduceMotion = MediaQuery.maybeOf(context)?.disableAnimations ?? false;
    final radius = BorderRadius.circular(ffTheme.radiusMd);
    const height = 52.0;
    // Contrast-aware ink, judged against what's actually under the label right
    // now: the dimmed resting track (destructive hue at 34% over the sheet
    // surface — pale in light mode, where pinned white vanished) or, while
    // armed, the full destructive fill (which lifts to red-400/amber in dark,
    // where white also fails). Same luminance rule AppButton applies.
    final restFill = Color.alphaBlend(
      widget.color.withValues(alpha: 0.34),
      ffTheme.cardSurface,
    );
    final underLabel = _holding ? widget.color : restFill;
    final onFill = underLabel.computeLuminance() > 0.45
        ? AppColors.primaryText
        : Colors.white;
    // Type-scale token (titleLarge, 15/w700) — no raw fontSize override.
    final labelStyle = ffTheme.titleLarge.copyWith(color: onFill);

    // REDUCED-MOTION / a11y fallback: a plain destructive tap button. No timed
    // hold to fight, same label + colour + action. (AppButton already supplies
    // its own Semantics button + press feedback.)
    if (reduceMotion) {
      return AppButton(
        text: widget.label,
        color: widget.color,
        width: double.infinity,
        onPressed: () async => _confirmNow(),
      );
    }

    return Semantics(
      button: true,
      label: widget.holdHint,
      onLongPress: _confirmNow,
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        // Press-and-hold drives the sweep; lift / cancel snaps it back.
        onTapDown: (_) => _startHold(),
        onTapUp: (_) => _endHold(),
        onTapCancel: _endHold,
        child: AnimatedScale(
          // scale(0.97) press feel while armed; releases back to rest.
          scale: _holding ? ffTheme.pressScale : 1.0,
          duration: _holding ? ffTheme.motionPress : ffTheme.motionMedium,
          curve: ffTheme.easeOut,
          child: AnimatedBuilder(
            animation: _ctrl,
            builder: (context, _) {
              final progress = _ctrl.value;
              return ClipRRect(
                borderRadius: radius,
                child: SizedBox(
                  width: double.infinity,
                  height: height,
                  child: Stack(
                    fit: StackFit.expand,
                    children: [
                      // Resting track: the destructive colour, dimmed — reads as
                      // "armable" without shouting until the user commits.
                      ColoredBox(color: widget.color.withValues(alpha: 0.34)),
                      // The arming fill — a clip-path-equivalent reveal that grows
                      // from the start edge (RTL-aware via Alignment.centerStart)
                      // as the hold progresses. Pure width-factor clip: no layout,
                      // GPU-friendly.
                      Align(
                        alignment: AlignmentDirectional.centerStart,
                        widthFactor: progress.clamp(0.0, 1.0),
                        child: SizedBox(
                          width: double.infinity,
                          child: ColoredBox(color: widget.color),
                        ),
                      ),
                      // Label + state hint, centred over the fill.
                      Center(
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            ExcludeSemantics(
                              child: Icon(
                                _holding
                                    ? Icons.lock_open_rounded
                                    : Icons.lock_rounded,
                                size: 16,
                                color: onFill,
                              ),
                            ),
                            const SizedBox(width: 8),
                            Text(
                              _holding ? widget.holdHint : widget.label,
                              style: labelStyle,
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              );
            },
          ),
        ),
      ),
    );
  }
}
