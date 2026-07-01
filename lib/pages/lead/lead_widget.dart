import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:provider/provider.dart';
import '../../theme/app_theme.dart';
import '../../core/nav.dart';
import '../../widgets/app_button.dart';
import '../../widgets/sticky_cta_scaffold.dart';
import '../../widgets/app_snackbar.dart';
import '../../widgets/consent_panel.dart';
import '../../app_state.dart';
import '../../data.dart';
import '../../legal.dart';
import '../../models.dart';
import '../../services/backend/backend.dart';
import '../../services/backend/local_backend.dart';
import '../../services/analytics_service.dart';
import '../../widgets/whatsapp_button.dart';
import '../../widgets/price_text.dart';
import '../../components/logo_widget/logo_widget.dart';

class LeadWidget extends StatefulWidget {
  const LeadWidget({super.key, required this.planId, this.source = 'form'});
  final String planId;
  final String source; // form | advisor | callback

  @override
  State<LeadWidget> createState() => _LeadWidgetState();
}

class _LeadWidgetState extends State<LeadWidget> {
  final _nameCtrl = TextEditingController();
  final _phoneCtrl = TextEditingController();
  final _emailCtrl = TextEditingController();
  final _formKey = GlobalKey<FormState>();

  String _callbackTime = 'now'; // 'now' | 'noon' | 'evening' | 'tomorrow'
  bool _isSubmitting = false;
  // Progressive disclosure: the secondary inputs (preferred callback time,
  // email, the "what happens next" timeline + availability/trust extras) live
  // collapsed under a 'הוסיפו פרטים (לא חובה)' expander BELOW the consent gate,
  // so the first screen is just plan → name → phone → consent → submit. The
  // fields stay fully functional + submitted; they're no longer a wall before
  // the CTA. Collapsed by default (CRO minimal first ask).
  bool _extrasExpanded = false;
  // True once a submit reached the network but failed — surfaces a PERSISTENT
  // recovery panel (retry + WhatsApp + support) instead of relying on a
  // transient snackbar the user may miss, so the form never silently dead-ends.
  bool _submitFailed = false;

  // Legal consent (Israeli Privacy Protection Regs + Spam Law): terms+privacy
  // mandatory to submit a lead; marketing is opt-in (unchecked default).
  bool _acceptTerms = false;
  bool _acceptPrivacy = false;
  bool _acceptMarketing = false;

  /// OS reduced-motion flag — entrance FADES stay (opacity is vestibular-safe),
  /// the slide legs are dropped (see [_reveal]).
  bool get _reduceMotion =>
      MediaQuery.maybeOf(context)?.disableAnimations ?? false;

  /// Shared entrance reveal for the form controls: fade always plays; the
  /// small slide-up only when the OS allows motion.
  Widget _reveal(Widget child, {required AppTheme ffTheme, int delayMs = 0}) {
    final faded = child
        .animate(delay: delayMs.ms)
        .fadeIn(duration: 280.ms, curve: ffTheme.easeOut);
    return _reduceMotion
        ? faded
        : faded.slideY(begin: 0.05, end: 0, duration: 280.ms, curve: ffTheme.easeOut);
  }

  Widget _consentPanel(AppTheme t) => ConsentPanel(
        acceptTerms: _acceptTerms,
        acceptPrivacy: _acceptPrivacy,
        acceptMarketing: _acceptMarketing,
        onTermsChanged: (v) => setState(() => _acceptTerms = v),
        onPrivacyChanged: (v) => setState(() => _acceptPrivacy = v),
        onMarketingChanged: (v) => setState(() => _acceptMarketing = v),
      );

  @override
  void dispose() {
    _nameCtrl.dispose();
    _phoneCtrl.dispose();
    _emailCtrl.dispose();
    super.dispose();
  }

  /// Submit (or retry) the lead. Shared by the main CTA and the recovery
  /// panel's retry button so both paths behave identically. Validates the form
  /// + consent, mirrors the lead to the backend, and on failure flips
  /// [_submitFailed] so the persistent recovery panel appears.
  Future<void> _submitLead(Plan? plan) async {
    if (_isSubmitting) return;
    if (!_formKey.currentState!.validate()) {
      // Field-level validation blocked the submit — a heavier tap marks the
      // committed-but-rejected outcome (distinct from the button's tap click).
      HapticFeedback.heavyImpact();
      return;
    }
    if (!_acceptTerms || !_acceptPrivacy) {
      HapticFeedback.heavyImpact();
      AppSnackBar.info(context, 'יש לאשר את תנאי השימוש ומדיניות הפרטיות כדי לשלוח');
      return;
    }
    HapticFeedback.lightImpact();
    setState(() {
      _isSubmitting = true;
      _submitFailed = false;
    });
    final appState = AppState();
    final name = _nameCtrl.text.trim();
    // Normalize to digits/+ — the leads gate rejects dots/parens.
    final phone = _phoneCtrl.text.replaceAll(RegExp(r'[^\d+]'), '');
    final email = _emailCtrl.text.trim();
    // Mirror the lead to the backend seam — a no-op locally today,
    // an insert into the `leads` table once SupabaseBackend is set.
    try {
      // Build rep context: current bill + quiz preferences.
      final bill = plan != null ? appState.currentBill(plan.cat) : 0;
      final parts = <String>[];
      if (bill > 0) parts.add('חשבון נוכחי: ₪$bill/חודש');
      if (plan != null) parts.add('חסכון שנתי צפוי: ₪${planSaveYear(plan, bill)}');
      if (appState.quizCompleted) {
        parts.add('תקציב: ₪${appState.quizBudget} | עדיפות: ${appState.quizPriority} | קווים: ${appState.quizLines}');
      }
      final nowIso = DateTime.now().toUtc().toIso8601String();
      await appBackend.submitLead(LeadInput(
        name: name,
        phone: phone,
        email: email,
        provider: plan?.provider,
        planId: widget.planId,
        callbackTime: _callbackTime,
        source: widget.source,
        notes: parts.isNotEmpty ? parts.join(' | ') : null,
        // Legal consent (server re-stamps these authoritatively).
        termsAcceptedAt: nowIso,
        privacyAcceptedAt: nowIso,
        marketingAcceptedAt: _acceptMarketing ? nowIso : null,
      )).timeout(const Duration(seconds: 10));
      // Sync the user's identity to their profile row.
      appBackend
          .upsertProfile(name: name, phone: phone, email: email.isNotEmpty ? email : null)
          .catchError((_) {});
    } catch (e) {
      // The lead never reached the team — keep the form AND raise a persistent
      // recovery panel (retry + WhatsApp + support) so the user can act, rather
      // than believing someone will call. Log for diagnostics (debug-only, no
      // user-facing change) so a flaky backend/timeout is traceable.
      debugPrint('LeadWidget submit failed: $e');
      if (!mounted) return;
      setState(() {
        _isSubmitting = false;
        _submitFailed = true;
      });
      // The lead never reached the team — a heavy buzz so the failure is felt,
      // not only read (pairs with the persistent recovery panel below).
      HapticFeedback.heavyImpact();
      AppSnackBar.error(context, 'שליחת הפנייה נכשלה — בדקו את החיבור ונסו שוב');
      return;
    }
    if (!mounted) return;
    // Record locally (savings headline + tracker step) only after
    // the backend accepted the lead — failed retries must not
    // inflate the savings number or pin the tracker.
    appState.submitLead(
      name: name,
      phone: phone,
      provider: plan?.provider ?? '',
      planId: widget.planId,
      email: email,
      callbackTime: _callbackTime,
    );
    // Funnel beacon — fire-and-forget, only after the team got it.
    AnalyticsService.track(AnalyticsEvent.leadSubmit, props: {
      'source': widget.source,
      if (plan != null) 'provider': plan.provider,
      if (plan != null) 'category': plan.cat,
    });
    // Tactile confirmation that the lead actually reached the team.
    HapticFeedback.mediumImpact();
    if (!mounted) return;
    // Pass the REAL accepted signal: the backend already accepted this lead
    // above (submitLead ran), so the success screen can show its first
    // checkmark as genuinely done and fire its one-shot celebration honestly.
    context.goNamed('Success', extra: true);
  }

  @override
  Widget build(BuildContext context) {
    final ffTheme = AppTheme.of(context);
    final appState = Provider.of<AppState>(context, listen: false);
    final plan = planById(widget.planId);

    if (_nameCtrl.text.isEmpty && appState.userName.isNotEmpty) {
      _nameCtrl.text = appState.userName;
    }
    if (_phoneCtrl.text.isEmpty && appState.userPhone.isNotEmpty) {
      _phoneCtrl.text = appState.userPhone;
    }

    return StickyCtaScaffold(
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        foregroundColor: ffTheme.primaryText,
        leading: IconButton(
          icon: const Icon(Icons.close_rounded),
          tooltip: 'סגור',
          onPressed: () => context.safePop(),
        ),
        title: Semantics(
          header: true,
          child: Text('השאירו פרטים', style: ffTheme.titleMedium),
        ),
        centerTitle: true,
      ),
      // The submit CTA + "ללא התחייבות" microcopy is pinned above the keyboard
      // by the scaffold; the form itself scrolls independently below the app bar.
      cta: _buildSubmitCta(ffTheme, plan),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(20),
        child: Form(
          key: _formKey,
          // Validate each field when the user LEAVES it (not only on submit,
          // and not on every keystroke) — the error shows next to the field.
          autovalidateMode: AutovalidateMode.onUnfocus,
          // Group the fields so the OS autofill bar fills name+phone+email in
          // one tap — fewer keystrokes is fewer drop-offs.
          child: AutofillGroup(
            child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // ── ABOVE THE FOLD: the minimal first ask ──────────────────────
              // CRO minimal ask: the first screen is plan + savings → name →
              // phone → §7b/§30A consent → (pinned) submit, plus one short trust
              // micro-row. Everything secondary moved into the expander below.

              // Plan summary card — kept above the fold: the SavingPill figure
              // motivates the ask.
              if (plan != null) ...[
                _buildPlanCard(plan, appState, ffTheme),
                const SizedBox(height: 20),
              ],

              // Name field
              _FieldLabel(label: 'שם מלא', ffTheme: ffTheme),
              const SizedBox(height: 8),
              _reveal(
                TextFormField(
                  controller: _nameCtrl,
                  textDirection: TextDirection.rtl,
                  textInputAction: TextInputAction.next,
                  autofillHints: const [AutofillHints.name],
                  decoration: _inputDecoration(hint: 'ישראל ישראלי', icon: Icons.person_outline_rounded, ffTheme: ffTheme),
                  validator: (v) => (v == null || v.trim().isEmpty) ? 'שדה חובה' : null,
                ),
                ffTheme: ffTheme,
                delayMs: 80,
              ),

              const SizedBox(height: 14),

              // Phone field
              _FieldLabel(label: 'מספר טלפון', ffTheme: ffTheme),
              const SizedBox(height: 8),
              _reveal(
                TextFormField(
                  controller: _phoneCtrl,
                  keyboardType: TextInputType.phone,
                  textDirection: TextDirection.ltr,
                  textInputAction: TextInputAction.next,
                  autofillHints: const [AutofillHints.telephoneNumber],
                  decoration: _inputDecoration(hint: '050-0000000', icon: Icons.phone_outlined, ffTheme: ffTheme),
                  // Shared IL-phone validator (handles +972/972/national forms) so
                  // the lead + callback forms agree on what's valid.
                  validator: (v) =>
                      AppState.isValidIlPhone(v ?? '') ? null : 'מספר טלפון לא תקין',
                ),
                ffTheme: ffTheme,
                delayMs: 120,
              ),

              const SizedBox(height: 16),

              // §7b commission disclosure at the lead-capture moment — honest,
              // owner-approved wording mirrored from the web app (lib/legal.ts):
              // the service is free, we are paid a referral fee by the provider,
              // and it does not change the price the user pays.
              _buildCommissionDisclosure(ffTheme),
              const SizedBox(height: 16),
              _consentPanel(ffTheme),
              const SizedBox(height: 16),

              // Short trust micro-row above the fold — the two reassurances that
              // matter at the consent moment (won't contact without permission /
              // HTTPS-encrypted). The fuller reassurance list + trust badges live
              // in the extras section below.
              _buildTrustMicroRow(ffTheme),
              const SizedBox(height: 16),

              // Persistent recovery panel — only after a failed submit. Gives
              // the user an explicit retry plus alternative channels (WhatsApp /
              // phone support) so a flaky network never becomes a dead-end. The
              // primary retry lives on the pinned submit CTA below.
              if (_submitFailed) ...[
                _buildRecoveryPanel(ffTheme, plan),
                const SizedBox(height: 16),
              ],

              // ── BELOW THE CTA: progressive disclosure (optional extras) ─────
              // Collapsed by default so they never wall off the submit CTA. The
              // fields stay fully functional + submitted — just no longer a
              // 6-field wall before the first screen's primary action.
              _buildExtrasSection(ffTheme),

              const SizedBox(height: 16),

              // Prefer to talk now? A direct WhatsApp channel as an alternative
              // to leaving details — same green ACTION CTA.
              WhatsAppButton(
                source: 'lead',
                width: double.infinity,
                prefillText: plan != null
                    ? 'היי, ראיתי את ${plan.provider} – ${plan.plan} ב-Switchy AI ואשמח לפרטים'
                    : 'היי, אשמח לעזרה במציאת מסלול משתלם דרך Switchy AI',
              ).animate().fadeIn(delay: 340.ms),
            ],
            ),
          ),
        ),
      ),
    );
  }

  // The pinned bottom CTA: the primary submit button + the "ללא התחייבות"
  // reassurance, hosted by [StickyCtaScaffold] so it stays reachable above the
  // keyboard while the form scrolls. The button uses [AppButton]'s built-in
  // async loading (spinner + tap-ignore while [_submitLead] awaits) — no faked
  // "שולח..." label and no no-op onPressed swap. The label only flips to a retry
  // affordance after a failed submit (_submitFailed).
  Widget _buildSubmitCta(AppTheme ffTheme, Plan? plan) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        AppButton(
          // Punchy single-line action on the button; the "נציג יחזור אליכם
          // היום" reassurance lives in the subtext below so the CTA stays
          // legible on narrow screens (AppButton's label is single-line).
          text: _submitFailed ? 'נסו שוב ←' : 'קבלו המלצה אישית ←',
          onPressed: () async => _submitLead(plan),
          width: double.infinity,
          height: 56,
          color: AppColors.primary,
          textStyle: ffTheme.titleMedium.copyWith(color: Colors.white),
          // No token equals the bespoke 18 corner (radiusCard 12 / radiusSheet 20
          // straddle it); radiusSheet is the nearest token, kept to preserve the
          // generous hero-CTA corner without forcing a 6px-tighter card radius.
          borderRadius: BorderRadius.circular(ffTheme.radiusSheet),
        ).animate().fadeIn(delay: 300.ms),
        const SizedBox(height: 8),
        Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            ExcludeSemantics(
              child: Icon(Icons.schedule_rounded, size: 13, color: ffTheme.secondaryText),
            ),
            const SizedBox(width: 5),
            Flexible(
              child: Text(
                'בדרך כלל נחזור אליכם תוך שעה, בשעות הפעילות • ללא התחייבות • חינם',
                style: ffTheme.labelSmall.copyWith(color: ffTheme.secondaryText),
                textAlign: TextAlign.center,
              ),
            ),
          ],
        ),
      ],
    );
  }

  // Shown only after a failed submit: an honest, persistent recovery surface.
  // Retry lives on the main CTA above; here we offer the real alternative
  // channels — WhatsApp (opens WhatsApp's own contact picker, never an invented
  // number) and a request-a-callback route — so a network hiccup never strands
  // the user mid-funnel.
  Widget _buildRecoveryPanel(AppTheme ffTheme, Plan? plan) {
    final panel = Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: ffTheme.error.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(ffTheme.radiusMd),
        border: Border.all(color: ffTheme.error.withValues(alpha: 0.35)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Icon(Icons.error_outline_rounded, size: 20, color: ffTheme.error),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  'הפנייה לא נשלחה. אפשר לנסות שוב, או לפנות אלינו ישירות:',
                  style: ffTheme.bodySmall.copyWith(
                      color: ffTheme.primaryText, fontWeight: FontWeight.w600),
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          WhatsAppButton(
            source: 'lead_recovery',
            width: double.infinity,
            prefillText: plan != null
                ? 'היי, ניסיתי להשאיר פרטים על ${plan.provider} – ${plan.plan} ב-Switchy AI אבל זה נכשל — אפשר לעזור?'
                : 'היי, ניסיתי להשאיר פרטים ב-Switchy AI אבל זה נכשל — אפשר לעזור?',
          ),
          const SizedBox(height: 8),
          SizedBox(
            width: double.infinity,
            child: OutlinedButton.icon(
              onPressed: () => context.pushNamed('Callback'),
              icon: const Icon(Icons.headset_mic_outlined, size: 18),
              label: const Text('בקשו שנחזור אליכם'),
              style: OutlinedButton.styleFrom(
                foregroundColor: ffTheme.brandAccent,
                side: BorderSide(color: ffTheme.brandAccent),
                minimumSize: const Size(double.infinity, 46),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(ffTheme.radiusCard)),
              ),
            ),
          ),
        ],
      ),
    ).animate().fadeIn(duration: 250.ms);
    // Reduced motion: the failure panel still fades in, but never slides.
    return _reduceMotion ? panel : panel.slideY(begin: 0.05);
  }

  Widget _buildAvailabilityBanner(AppTheme ffTheme) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        color: ffTheme.brandAccentTint,
        borderRadius: BorderRadius.circular(ffTheme.radiusMd),
        border: Border.all(color: ffTheme.brandAccent.withValues(alpha: 0.3)),
        boxShadow: ffTheme.shadowXs,
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          // "We're open" dot — green = available.
          Container(
            width: 8, height: 8,
            decoration: BoxDecoration(
              color: ffTheme.brandAccent,
              shape: BoxShape.circle,
              boxShadow: [BoxShadow(color: ffTheme.brandAccent.withValues(alpha: 0.5), blurRadius: 6, spreadRadius: 1)],
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              'בדרך כלל נחזור אליכם תוך שעה, בשעות הפעילות — בימי א׳–ה׳, 9:00–21:00',
              style: ffTheme.labelMedium.copyWith(
                color: ffTheme.brandAccentText,
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
        ],
      ),
    ).animate().fadeIn(duration: 350.ms);
  }

  // Short, two-line trust micro-row shown above the fold, right under the
  // consent gate: the two reassurances that matter at the submit moment — we
  // won't contact without permission, and the transport is HTTPS-encrypted.
  // Icons are decorative (ExcludeSemantics) so screen readers hear only the
  // copy. The fuller 3-item reassurance list lives in the extras section.
  Widget _buildTrustMicroRow(AppTheme ffTheme) {
    final items = [
      (Icons.shield_outlined, 'לא נפנה אליכם ללא אישורכם'),
      (Icons.lock_outline_rounded, 'מאובטח בהצפנת HTTPS'),
    ];
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        for (final item in items)
          Padding(
            padding: const EdgeInsets.only(bottom: 4),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                ExcludeSemantics(
                  child: Icon(item.$1, size: 14, color: ffTheme.secondaryText),
                ),
                const SizedBox(width: 6),
                Expanded(
                  child: Text(
                    item.$2,
                    style: ffTheme.labelSmall.copyWith(color: ffTheme.secondaryText),
                  ),
                ),
              ],
            ),
          ),
      ],
    ).animate(delay: 200.ms).fadeIn();
  }

  // Progressive-disclosure block BELOW the CTA: the secondary inputs and
  // reassurances that used to wall off the submit button. Collapsed by default
  // behind a 'הוסיפו פרטים (לא חובה)' header; all fields stay fully functional
  // and are submitted exactly as before — only their on-screen placement moved.
  // What's inside: the fuller phone-privacy reassurance, the optional email
  // field, the preferred-callback-time picker, the availability banner, the
  // "what happens next" timeline, and the trust badges.
  Widget _buildExtrasSection(AppTheme ffTheme) {
    return Container(
      decoration: BoxDecoration(
        color: ffTheme.cardSurface,
        borderRadius: BorderRadius.circular(ffTheme.radiusMd),
        border: Border.all(color: ffTheme.alternate),
      ),
      clipBehavior: Clip.antiAlias,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Tappable header — flips _extrasExpanded. A real >=44px control with
          // a rotating chevron; announced as a button with its expanded state.
          Semantics(
            button: true,
            expanded: _extrasExpanded,
            label: 'הוסיפו פרטים (לא חובה)',
            child: InkWell(
              onTap: () {
                HapticFeedback.selectionClick();
                setState(() => _extrasExpanded = !_extrasExpanded);
              },
              child: ConstrainedBox(
                constraints: const BoxConstraints(minHeight: 48),
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                  child: Row(
                    children: [
                      ExcludeSemantics(
                        child: Icon(Icons.tune_rounded, size: 18, color: ffTheme.secondaryText),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Text(
                          'הוסיפו פרטים (לא חובה)',
                          style: ffTheme.labelLarge.copyWith(fontWeight: FontWeight.w600),
                        ),
                      ),
                      ExcludeSemantics(
                        child: AnimatedRotation(
                          turns: _extrasExpanded ? 0.5 : 0,
                          duration: const Duration(milliseconds: 200),
                          child: Icon(Icons.keyboard_arrow_down_rounded, color: ffTheme.secondaryText),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
          // Body — only mounted when expanded so the collapsed default keeps the
          // CTA the first thing after consent.
          if (_extrasExpanded) ...[
            Divider(height: 1, color: ffTheme.alternate),
            Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // Fuller data-use reassurance (3 items).
                  _buildPhonePrivacyNote(ffTheme),
                  const SizedBox(height: 16),

                  // Email field (optional)
                  _FieldLabel(label: 'אימייל (אופציונלי)', ffTheme: ffTheme),
                  const SizedBox(height: 8),
                  TextFormField(
                    controller: _emailCtrl,
                    keyboardType: TextInputType.emailAddress,
                    textDirection: TextDirection.ltr,
                    textInputAction: TextInputAction.done,
                    autofillHints: const [AutofillHints.email],
                    decoration: _inputDecoration(hint: 'example@email.com', icon: Icons.mail_outline_rounded, ffTheme: ffTheme),
                    // Optional, but if filled it must look like an email — a typo'd
                    // address silently breaks the only written follow-up channel.
                    validator: (v) {
                      final s = (v ?? '').trim();
                      if (s.isEmpty) return null;
                      return RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]+$').hasMatch(s) ? null : 'כתובת אימייל לא תקינה';
                    },
                  ),

                  const SizedBox(height: 20),

                  // Preferred callback time
                  _FieldLabel(label: 'מתי נחזור אליכם?', ffTheme: ffTheme),
                  const SizedBox(height: 10),
                  _buildCallbackTimePicker(ffTheme),

                  const SizedBox(height: 20),

                  // Honest availability note — no fake countdown.
                  _buildAvailabilityBanner(ffTheme),

                  const SizedBox(height: 20),

                  // What happens next timeline
                  _buildNextStepsCard(ffTheme),

                  const SizedBox(height: 20),

                  // Trust badges — each badge is Flexible so the 3-up row wraps
                  // its labels instead of overflowing at large OS text scales.
                  Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Flexible(child: _TrustBadge(icon: Icons.lock_outline_rounded, label: 'מאובטח', ffTheme: ffTheme)),
                      const SizedBox(width: 20),
                      Flexible(child: _TrustBadge(icon: Icons.list_alt_rounded, label: '100+ מסלולים', ffTheme: ffTheme)),
                      const SizedBox(width: 20),
                      Flexible(child: _TrustBadge(icon: Icons.payments_outlined, label: 'ללא עלות', ffTheme: ffTheme)),
                    ],
                  ),
                ],
              ),
            ),
          ],
        ],
      ),
    ).animate(delay: 220.ms).fadeIn();
  }

  // Three honest reassurances: no sharing with providers, callback via
  // WhatsApp/phone, data encrypted. Now lives inside the extras section. Marked
  // decorative (icon-only) so screen readers hear only the copy.
  Widget _buildPhonePrivacyNote(AppTheme ffTheme) {
    final items = [
      (Icons.shield_outlined, 'לא נפנה אליכם ללא אישורכם'),
      (Icons.chat_bubble_outline_rounded, 'נחזור בוואטסאפ או בטלפון'),
      (Icons.lock_outline_rounded, 'מאובטח בהצפנת HTTPS'),
    ];
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        for (final item in items)
          Padding(
            padding: const EdgeInsets.only(bottom: 4),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                ExcludeSemantics(
                  child: Icon(item.$1, size: 14, color: ffTheme.secondaryText),
                ),
                const SizedBox(width: 6),
                Expanded(
                  child: Text(
                    item.$2,
                    style: ffTheme.labelSmall.copyWith(color: ffTheme.secondaryText),
                  ),
                ),
              ],
            ),
          ),
      ],
    ).animate(delay: 140.ms).fadeIn();
  }

  // §7b commission disclosure shown at the lead-capture moment, just above the
  // consent gate. Wording is the verbatim mirror of the web disclosure
  // (lib/legal.dart ← web/lib/legal.ts) — truth-only, no invented figures.
  Widget _buildCommissionDisclosure(AppTheme ffTheme) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        color: ffTheme.cardSurface,
        borderRadius: BorderRadius.circular(ffTheme.radiusMd),
        border: Border.all(color: ffTheme.alternate),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          ExcludeSemantics(
            child: Icon(Icons.info_outline_rounded, size: 16, color: ffTheme.secondaryText),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: Text.rich(
              TextSpan(
                children: [
                  TextSpan(
                    text: '$kCommissionDisclosureLead ',
                    style: ffTheme.labelSmall.copyWith(
                        color: ffTheme.secondaryText, fontWeight: FontWeight.w700),
                  ),
                  TextSpan(
                    text: kCommissionDisclosureBody,
                    style: ffTheme.labelSmall.copyWith(color: ffTheme.secondaryText),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    ).animate(delay: 260.ms).fadeIn();
  }

  Widget _buildPlanCard(Plan plan, AppState appState, AppTheme ffTheme) {
    final bill = appState.currentBill(plan.cat);
    final saveYear = planSaveYear(plan, bill);
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: ffTheme.cardDecoration(radius: ffTheme.radiusCard),
      child: Column(
        children: [
          Row(
            children: [
              LogoWidget(provider: plan.provider, size: 48),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(plan.provider, style: ffTheme.titleSmall),
                    Text(plan.plan, style: ffTheme.bodySmall, maxLines: 1, overflow: TextOverflow.ellipsis),
                    // Money token — [PriceText] keeps ₪+digits+/unit in a stable
                    // LTR bidi order inside the RTL card; titleMedium/ink override
                    // preserved (priceDisplay base supplies tabular figures).
                    PriceText('₪${plan.priceText}/${priceUnitShort(plan)}', style: ffTheme.titleMedium.copyWith(color: ffTheme.primary)),
                  ],
                ),
              ),
              if (saveYear > 0)
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                  decoration: BoxDecoration(
                    color: ffTheme.saving.withValues(alpha: 0.14),
                    borderRadius: BorderRadius.circular(ffTheme.radiusLg),
                    border: Border.all(color: ffTheme.saving.withValues(alpha: 0.35)),
                  ),
                  child: Column(
                    children: [
                      // De-push: a calm noun ("savings"), not the second-person
                      // "חוסך" command — the figure is a real computed value.
                      Text('חיסכון', style: ffTheme.labelSmall.copyWith(color: ffTheme.savingText)),
                      // Savings money token — [PriceText] pins ₪ before the
                      // digits (stable LTR bidi) so the real figure never
                      // re-orders; titleSmall/green/w800 override preserved.
                      PriceText('₪$saveYear/שנה', style: ffTheme.titleSmall.copyWith(color: ffTheme.savingText, fontWeight: FontWeight.w800)),
                    ],
                  ),
                ),
            ],
          ),
          if (saveYear > 0) ...[
            const SizedBox(height: 10),
            Container(
              width: double.infinity,
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              decoration: BoxDecoration(
                color: ffTheme.saving.withValues(alpha: 0.10),
                borderRadius: BorderRadius.circular(ffTheme.radiusSm),
              ),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(Icons.savings_rounded, size: 15, color: ffTheme.savingDark),
                  const SizedBox(width: 6),
                  Flexible(
                    child: Text(
                      // De-push: a calm monthly equivalent of the real annual
                      // figure — no exclamation, no "act now" urgency.
                      'כ-₪${(saveYear / 12).round()} חיסכון בחודש, בממוצע',
                      style: ffTheme.labelMedium.copyWith(color: ffTheme.savingText, fontWeight: FontWeight.w700),
                      textAlign: TextAlign.center,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ],
      ),
    ).animate().fadeIn(duration: 350.ms);
  }

  Widget _buildCallbackTimePicker(AppTheme ffTheme) {
    final options = [
      ('now', 'עכשיו', Icons.flash_on_rounded),
      ('noon', 'בצהריים', Icons.wb_sunny_outlined),
      ('evening', 'בערב', Icons.nights_stay_outlined),
      ('tomorrow', 'מחר', Icons.calendar_today_outlined),
    ];
    // The picker reveal honours reduced motion via [_reveal] (fade-only there).
    // A single-select [SegmentedButton] replaces the old hand-rolled 4-up Row of
    // 11px chips: every segment is a real >=kMinTapTarget control, the selected
    // one fills with the green ACTION accent, and the per-option icon + Hebrew
    // label stay visible inline (no extra tap / no hidden sheet). The label text
    // is preserved verbatim so existing find.bySemanticsLabel(...) targets and
    // the readable copy both hold.
    return _reveal(
      SegmentedButton<String>(
      showSelectedIcon: false,
      segments: [
        for (final opt in options)
          ButtonSegment<String>(
            value: opt.$1,
            icon: Icon(opt.$3, size: 18),
            label: Text(
              opt.$2,
              style: ffTheme.labelSmall.copyWith(fontWeight: FontWeight.w600),
            ),
          ),
      ],
      selected: {_callbackTime},
      onSelectionChanged: (sel) {
        HapticFeedback.selectionClick();
        setState(() => _callbackTime = sel.first);
      },
      style: ButtonStyle(
        // Guarantee a comfortable touch target on every segment.
        minimumSize: const WidgetStatePropertyAll(Size(0, kMinTapTarget)),
        tapTargetSize: MaterialTapTargetSize.shrinkWrap,
        padding: const WidgetStatePropertyAll(
          EdgeInsetsDirectional.symmetric(horizontal: 8, vertical: 8),
        ),
        side: WidgetStatePropertyAll(BorderSide(color: ffTheme.alternate)),
        shape: WidgetStatePropertyAll(
          RoundedRectangleBorder(borderRadius: BorderRadius.circular(ffTheme.radiusCard)),
        ),
        backgroundColor: WidgetStateProperty.resolveWith((states) =>
            states.contains(WidgetState.selected)
                ? ffTheme.brandAccent
                : ffTheme.cardSurface),
        foregroundColor: WidgetStateProperty.resolveWith((states) =>
            states.contains(WidgetState.selected)
                ? Colors.white
                : ffTheme.primaryText),
        iconColor: WidgetStateProperty.resolveWith((states) =>
            states.contains(WidgetState.selected)
                ? Colors.white
                : ffTheme.secondaryText),
      ),
      ),
      ffTheme: ffTheme,
      delayMs: 200,
    );
  }

  Widget _buildNextStepsCard(AppTheme ffTheme) {
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: ffTheme.cardDecoration(radius: ffTheme.radiusLg),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Semantics(
            header: true,
            child: Text('מה קורה אחרי שתשלחו?', style: ffTheme.titleSmall),
          ),
          const SizedBox(height: 14),
          _TimelineStep(step: 1, title: 'בדרך כלל נחזור אליכם תוך שעה, בשעות הפעילות', sub: 'בימי א׳–ה׳, 9:00–21:00', ffTheme: ffTheme),
          _TimelineStep(step: 2, title: 'אישור המסלול יחד', sub: 'נבדוק יחד שהכל מתאים לכם', ffTheme: ffTheme),
          _TimelineStep(step: 3, title: 'ניוד המספר', sub: 'תוך 1–3 ימי עסקים', ffTheme: ffTheme, isLast: true),
        ],
      ),
    ).animate(delay: 180.ms).fadeIn();
  }

  InputDecoration _inputDecoration({required String hint, required IconData icon, required AppTheme ffTheme}) {
    return InputDecoration(
      hintText: hint,
      prefixIcon: Icon(icon, color: ffTheme.secondaryText, size: 20),
      filled: true,
      fillColor: ffTheme.cardSurface,
      border: OutlineInputBorder(borderRadius: BorderRadius.circular(ffTheme.radiusCard), borderSide: BorderSide(color: ffTheme.alternate)),
      enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(ffTheme.radiusCard), borderSide: BorderSide(color: ffTheme.alternate)),
      focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(ffTheme.radiusCard), borderSide: BorderSide(color: ffTheme.brandAccent, width: 1.5)),
      errorBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(ffTheme.radiusCard), borderSide: BorderSide(color: ffTheme.error)),
      focusedErrorBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(ffTheme.radiusCard), borderSide: BorderSide(color: ffTheme.error, width: 1.5)),
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
    );
  }
}

class _FieldLabel extends StatelessWidget {
  const _FieldLabel({required this.label, required this.ffTheme});
  final String label;
  final AppTheme ffTheme;

  @override
  Widget build(BuildContext context) {
    return Text(label, style: ffTheme.labelLarge.copyWith(fontWeight: FontWeight.w600));
  }
}

class _TimelineStep extends StatelessWidget {
  const _TimelineStep({required this.step, required this.title, required this.sub, required this.ffTheme, this.isLast = false});
  final int step;
  final String title, sub;
  final AppTheme ffTheme;
  final bool isLast;

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Column(
          children: [
            Container(
              width: 28, height: 28,
              decoration: BoxDecoration(gradient: ffTheme.accentGradient, shape: BoxShape.circle),
              child: Center(child: Text('$step', style: ffTheme.labelSmall.copyWith(color: Colors.white, fontWeight: FontWeight.w800))),
            ),
            if (!isLast)
              Container(width: 2, height: 28, color: ffTheme.alternate, margin: const EdgeInsets.symmetric(vertical: 3)),
          ],
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Padding(
            padding: EdgeInsets.only(top: 4, bottom: isLast ? 0 : 18),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title, style: ffTheme.titleSmall.copyWith(fontSize: 13)),
                Text(sub, style: ffTheme.labelSmall),
              ],
            ),
          ),
        ),
      ],
    );
  }
}

class _TrustBadge extends StatelessWidget {
  const _TrustBadge({required this.icon, required this.label, required this.ffTheme});
  final IconData icon;
  final String label;
  final AppTheme ffTheme;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Icon(icon, color: ffTheme.brandAccent, size: 22),
        const SizedBox(height: 4),
        Text(
          label,
          style: ffTheme.labelSmall.copyWith(color: ffTheme.secondaryText),
          textAlign: TextAlign.center,
        ),
      ],
    );
  }
}
