import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../theme/app_theme.dart';
import '../../core/nav.dart';
import '../../core/contact.dart';
import '../../app_state.dart';
import '../../data.dart';
import '../../models.dart';
import '../../components/logo_widget/logo_widget.dart';
import '../../widgets/pressable.dart';
import '../../widgets/whatsapp_button.dart';

/// The honest team channel — a contact-card screen for the accompaniment team
/// ("צוות הליווי"). Replaces the old simulated "דנה" chat: no fake presence
/// dot, no invented response SLA, no scripted bot replies. Every path here
/// leads to a REAL channel — WhatsApp (primary), a phone call, or the existing
/// human-callback flow — and every word of context in the prefilled message is
/// built from real AppState (lead name, chosen plan, tracker step) with null
/// pieces omitted, never fabricated.
///
/// Keeps the ChatWidget class name and the '/chat' route so the tracker's
/// existing pushers keep working unchanged.
class ChatWidget extends StatefulWidget {
  const ChatWidget({super.key});

  @override
  State<ChatWidget> createState() => _ChatWidgetState();
}

class _ChatWidgetState extends State<ChatWidget> {
  Plan? _contextPlan;

  @override
  void initState() {
    super.initState();
    final appState = AppState();
    _contextPlan = appState.leadPlanId != null ? planById(appState.leadPlanId!) : null;
  }

  /// The WhatsApp prefill — built ONLY from real state; each missing piece is
  /// omitted gracefully (no placeholders, no invented details).
  String _prefillText(AppState appState) {
    final name = (appState.leadName ?? '').trim();
    final plan = _contextPlan;
    final step = appState.trackerStep;
    final buf = StringBuffer();
    buf.write(name.isNotEmpty ? 'היי, אני $name. ' : 'היי. ');
    if (plan != null) {
      buf.write('פנייה לגבי ${plan.provider} — ${plan.plan}');
      if (step >= 1 && step <= 4) buf.write(' (שלב $step מתוך 4)');
      buf.write('. ');
    }
    buf.write('אשמח לעדכון.');
    return buf.toString();
  }

  /// Dial the real support line. Best-effort: on platforms without a dialer
  /// (desktop/web test envs) this is a silent no-op, never a crash.
  Future<void> _callSupport() async {
    final uri = Uri(scheme: 'tel', path: kSupportPhoneTel);
    try {
      if (await canLaunchUrl(uri)) {
        await launchUrl(uri);
      }
    } catch (_) {
      // No dialer available — the callback tile below remains the fallback.
    }
  }

  @override
  Widget build(BuildContext context) {
    final ffTheme = AppTheme.of(context);
    final appState = context.watch<AppState>();

    return Scaffold(
      backgroundColor: ffTheme.background,
      appBar: AppBar(
        title: Text('צוות הליווי', style: ffTheme.titleMedium),
        backgroundColor: Colors.transparent,
        elevation: 0,
        foregroundColor: ffTheme.primaryText,
      ),
      body: SingleChildScrollView(
        padding: EdgeInsets.all(ffTheme.space16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            _buildTeamHeader(ffTheme),

            if (_contextPlan != null) ...[
              SizedBox(height: ffTheme.space12),
              _buildLeadContext(ffTheme, appState),
            ],

            SizedBox(height: ffTheme.space24),

            // PRIMARY: the real WhatsApp channel (green = CTA fill, per the
            // bank language). Context prefilled from real state only.
            WhatsAppButton(
              phone: kSupportWhatsAppNumber,
              source: 'tracker-chat',
              prefillText: _prefillText(appState),
              width: double.infinity,
            ).animate().fadeIn(duration: 300.ms),

            SizedBox(height: ffTheme.space12),

            // SECONDARY: a real phone call to the same line.
            _buildContactTile(
              ffTheme,
              icon: Icons.call_rounded,
              title: 'שיחת טלפון',
              subtitle: kSupportPhoneDisplay,
              subtitleLtr: true,
              semanticsLabel: 'התקשרו אלינו: $kSupportPhoneDisplay',
              onTap: _callSupport,
            ).animate().fadeIn(delay: 60.ms, duration: 300.ms),

            SizedBox(height: ffTheme.space8),

            // SECONDARY: the existing human-callback flow.
            _buildContactTile(
              ffTheme,
              icon: Icons.phone_callback_rounded,
              title: 'תיאום שיחה חוזרת',
              subtitle: 'השאירו פרטים ונציג יחזור אליכם',
              semanticsLabel: 'תיאום שיחה חוזרת',
              onTap: () => context.pushNamed('Callback'),
            ).animate().fadeIn(delay: 120.ms, duration: 300.ms),

            SizedBox(height: ffTheme.space16),

            // Honesty line — no invented SLA, just the truthful commitment.
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(Icons.schedule_rounded, size: 16, color: ffTheme.secondaryText),
                SizedBox(width: ffTheme.space8),
                Flexible(
                  child: Text(
                    'נחזור אליכם בהקדם בשעות הפעילות',
                    style: ffTheme.labelSmall.copyWith(color: ffTheme.secondaryText),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  /// Team header — ink-dominant card, NO presence dot and NO response-time
  /// claim (we don't know either; inventing them is exactly what this screen
  /// replaced).
  Widget _buildTeamHeader(AppTheme ffTheme) {
    return Container(
      padding: EdgeInsets.all(ffTheme.space16),
      decoration: BoxDecoration(
        color: ffTheme.secondaryBackground,
        borderRadius: BorderRadius.circular(ffTheme.radiusCard),
        border: Border.all(color: ffTheme.alternate),
      ),
      child: Row(
        children: [
          ExcludeSemantics(
            child: Container(
              width: 48,
              height: 48,
              decoration: BoxDecoration(
                color: ffTheme.background,
                shape: BoxShape.circle,
                border: Border.all(color: ffTheme.alternate),
              ),
              child: Icon(Icons.support_agent_rounded, size: 26, color: ffTheme.primaryText),
            ),
          ),
          SizedBox(width: ffTheme.space12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('צוות הליווי של Switchy',
                    style: ffTheme.titleSmall.copyWith(fontWeight: FontWeight.w700)),
                SizedBox(height: ffTheme.space4),
                Text(
                  'אנשים אמיתיים שמלווים אתכם לאורך תהליך המעבר',
                  style: ffTheme.bodySmall.copyWith(color: ffTheme.secondaryText),
                ),
              ],
            ),
          ),
        ],
      ),
    ).animate().fadeIn(duration: 300.ms);
  }

  /// Lead-context strip — the plan the user actually asked about (real state
  /// via leadPlanId → planById) plus the real tracker step. Shown only when a
  /// lead exists; nothing here is placeholder data.
  Widget _buildLeadContext(AppTheme ffTheme, AppState appState) {
    final plan = _contextPlan!;
    final step = appState.trackerStep;
    return Container(
      padding: EdgeInsets.symmetric(horizontal: ffTheme.space16, vertical: ffTheme.space12),
      decoration: BoxDecoration(
        color: ffTheme.secondaryBackground,
        borderRadius: BorderRadius.circular(ffTheme.radiusCard),
        border: Border.all(color: ffTheme.alternate),
      ),
      child: Row(
        children: [
          LogoWidget(provider: plan.provider, size: 36),
          SizedBox(width: ffTheme.space12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(plan.provider,
                    style: ffTheme.labelLarge
                        .copyWith(color: ffTheme.primaryText, fontWeight: FontWeight.w700)),
                Text(plan.plan,
                    style: ffTheme.labelSmall.copyWith(color: ffTheme.secondaryText),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis),
              ],
            ),
          ),
          if (step >= 1 && step <= 4) ...[
            SizedBox(width: ffTheme.space8),
            Container(
              padding: EdgeInsets.symmetric(horizontal: ffTheme.space12, vertical: ffTheme.space4),
              decoration: BoxDecoration(
                color: ffTheme.background,
                borderRadius: BorderRadius.circular(ffTheme.radiusPill),
                border: Border.all(color: ffTheme.alternate),
              ),
              child: Text('שלב $step מתוך 4',
                  style: ffTheme.labelSmall
                      .copyWith(color: ffTheme.primaryText, fontWeight: FontWeight.w700)),
            ),
          ],
        ],
      ),
    ).animate().fadeIn(duration: 300.ms);
  }

  /// A secondary contact tile — full-width, ≥48px tap target, one labelled
  /// Semantics button (children excluded so screen readers hear it once).
  Widget _buildContactTile(
    AppTheme ffTheme, {
    required IconData icon,
    required String title,
    required String subtitle,
    required String semanticsLabel,
    required VoidCallback onTap,
    bool subtitleLtr = false,
  }) {
    return Semantics(
      button: true,
      label: semanticsLabel,
      excludeSemantics: true,
      child: Pressable(
        onTap: onTap,
        child: Container(
          constraints: const BoxConstraints(minHeight: 56),
          padding: EdgeInsets.symmetric(horizontal: ffTheme.space16, vertical: ffTheme.space12),
          decoration: BoxDecoration(
            color: ffTheme.secondaryBackground,
            borderRadius: BorderRadius.circular(ffTheme.radiusMd),
            border: Border.all(color: ffTheme.alternate),
          ),
          child: Row(
            children: [
              Icon(icon, size: 22, color: ffTheme.primaryText),
              SizedBox(width: ffTheme.space12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Text(title,
                        style: ffTheme.labelLarge
                            .copyWith(color: ffTheme.primaryText, fontWeight: FontWeight.w700)),
                    Text(
                      subtitle,
                      style: ffTheme.labelSmall.copyWith(color: ffTheme.secondaryText),
                      textDirection: subtitleLtr ? TextDirection.ltr : null,
                      textAlign: subtitleLtr ? TextAlign.end : null,
                    ),
                  ],
                ),
              ),
              Icon(Icons.chevron_left_rounded, size: 20, color: ffTheme.secondaryText),
            ],
          ),
        ),
      ),
    );
  }
}
