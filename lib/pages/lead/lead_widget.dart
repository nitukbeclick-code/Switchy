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
import '../../models.dart';
import '../../services/backend/backend.dart';
import '../../services/backend/local_backend.dart';
import '../../services/analytics_service.dart';
import '../../widgets/whatsapp_button.dart';
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
  // True once a submit reached the network but failed — surfaces a PERSISTENT
  // recovery panel (retry + WhatsApp + support) instead of relying on a
  // transient snackbar the user may miss, so the form never silently dead-ends.
  bool _submitFailed = false;

  // Legal consent (Israeli Privacy Protection Regs + Spam Law): terms+privacy
  // mandatory to submit a lead; marketing is opt-in (unchecked default).
  bool _acceptTerms = false;
  bool _acceptPrivacy = false;
  bool _acceptMarketing = false;

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
    if (!_formKey.currentState!.validate()) return;
    if (!_acceptTerms || !_acceptPrivacy) {
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
    context.goNamed('Success');
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
        title: Text('השאירו פרטים', style: ffTheme.titleMedium),
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
              // Honest availability note — no fake countdown.
              _buildAvailabilityBanner(ffTheme),
              const SizedBox(height: 20),

              // Plan summary card
              if (plan != null) ...[
                _buildPlanCard(plan, appState, ffTheme),
                const SizedBox(height: 20),
              ],

              // Name field
              _FieldLabel(label: 'שם מלא', ffTheme: ffTheme),
              const SizedBox(height: 8),
              TextFormField(
                controller: _nameCtrl,
                textDirection: TextDirection.rtl,
                textInputAction: TextInputAction.next,
                autofillHints: const [AutofillHints.name],
                decoration: _inputDecoration(hint: 'ישראל ישראלי', icon: Icons.person_outline_rounded, ffTheme: ffTheme),
                validator: (v) => (v == null || v.trim().isEmpty) ? 'שדה חובה' : null,
              ).animate(delay: 80.ms).fadeIn(duration: 280.ms, curve: ffTheme.easeOut).slideY(begin: 0.05, end: 0, duration: 280.ms, curve: ffTheme.easeOut),

              const SizedBox(height: 14),

              // Phone field
              _FieldLabel(label: 'מספר טלפון', ffTheme: ffTheme),
              const SizedBox(height: 8),
              TextFormField(
                controller: _phoneCtrl,
                keyboardType: TextInputType.phone,
                textDirection: TextDirection.ltr,
                textInputAction: TextInputAction.next,
                autofillHints: const [AutofillHints.telephoneNumber],
                decoration: _inputDecoration(hint: '050-0000000', icon: Icons.phone_outlined, ffTheme: ffTheme),
                validator: (v) {
                  final digits = (v ?? '').replaceAll(RegExp(r'\D'), '');
                  return (digits.length < 9 || digits.length > 15) ? 'מספר טלפון לא תקין' : null;
                },
              ).animate(delay: 120.ms).fadeIn(duration: 280.ms, curve: ffTheme.easeOut).slideY(begin: 0.05, end: 0, duration: 280.ms, curve: ffTheme.easeOut),

              const SizedBox(height: 8),

              // Data-use reassurance — directly under the phone field, where the
              // hesitation lives. Complements (doesn't duplicate) the
              // availability banner + the "what happens next" timeline.
              _buildPhonePrivacyNote(ffTheme),

              const SizedBox(height: 14),

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
              ).animate(delay: 160.ms).fadeIn(duration: 280.ms, curve: ffTheme.easeOut).slideY(begin: 0.05, end: 0, duration: 280.ms, curve: ffTheme.easeOut),

              const SizedBox(height: 20),

              // Preferred callback time
              _FieldLabel(label: 'מתי נחזור אליכם?', ffTheme: ffTheme),
              const SizedBox(height: 10),
              _buildCallbackTimePicker(ffTheme),

              const SizedBox(height: 24),

              // What happens next timeline
              _buildNextStepsCard(ffTheme),

              const SizedBox(height: 20),

              // Trust badges
              Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  _TrustBadge(icon: Icons.lock_outline_rounded, label: 'מאובטח', ffTheme: ffTheme),
                  const SizedBox(width: 20),
                  _TrustBadge(icon: Icons.list_alt_rounded, label: '100+ מסלולים', ffTheme: ffTheme),
                  const SizedBox(width: 20),
                  _TrustBadge(icon: Icons.payments_outlined, label: 'ללא עלות', ffTheme: ffTheme),
                ],
              ).animate(delay: 250.ms).fadeIn(),

              const SizedBox(height: 20),
              _consentPanel(ffTheme),
              const SizedBox(height: 16),

              // Persistent recovery panel — only after a failed submit. Gives
              // the user an explicit retry plus alternative channels (WhatsApp /
              // phone support) so a flaky network never becomes a dead-end. The
              // primary retry lives on the pinned submit CTA below.
              if (_submitFailed) ...[
                _buildRecoveryPanel(ffTheme, plan),
                const SizedBox(height: 16),
              ],

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
          borderRadius: BorderRadius.circular(18),
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
                'נציג יחזור אליכם היום • ללא התחייבות • חינם',
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
    return Container(
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
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
              ),
            ),
          ),
        ],
      ),
    ).animate().fadeIn(duration: 250.ms).slideY(begin: 0.05);
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
              'שלחו פרטים ונציג יחזור אליכם בהקדם — בימי א׳–ה׳, 9:00–21:00',
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

  // Three honest reassurances next to the phone field: no sharing with
  // providers, callback via WhatsApp/phone, data encrypted. Marked decorative
  // (icon-only) so screen readers hear only the copy.
  Widget _buildPhonePrivacyNote(AppTheme ffTheme) {
    final items = [
      (Icons.shield_outlined, 'לא נשתף את המספר עם ספקים'),
      (Icons.chat_bubble_outline_rounded, 'נחזור בוואטסאפ או בטלפון'),
      (Icons.lock_outline_rounded, 'הנתונים מוצפנים'),
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
                    Text('₪${plan.priceText}/${priceUnitShort(plan)}', style: ffTheme.titleMedium.copyWith(color: ffTheme.primary)),
                  ],
                ),
              ),
              if (saveYear > 0)
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                  decoration: BoxDecoration(
                    color: ffTheme.saving.withValues(alpha: 0.14),
                    borderRadius: BorderRadius.circular(10),
                    border: Border.all(color: ffTheme.saving.withValues(alpha: 0.35)),
                  ),
                  child: Column(
                    children: [
                      Text('חוסך', style: ffTheme.labelSmall.copyWith(color: ffTheme.savingText)),
                      Text('₪$saveYear/שנה', style: ffTheme.titleSmall.copyWith(color: ffTheme.savingText, fontWeight: FontWeight.w800)),
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
                borderRadius: BorderRadius.circular(8),
              ),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(Icons.savings_rounded, size: 15, color: ffTheme.savingDark),
                  const SizedBox(width: 6),
                  Flexible(
                    child: Text(
                      'כ-₪${(saveYear / 12).round()} חיסכון בחודש הראשון!',
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
    // A single-select [SegmentedButton] replaces the old hand-rolled 4-up Row of
    // 11px chips: every segment is a real >=kMinTapTarget control, the selected
    // one fills with the green ACTION accent, and the per-option icon + Hebrew
    // label stay visible inline (no extra tap / no hidden sheet). The label text
    // is preserved verbatim so existing find.bySemanticsLabel(...) targets and
    // the readable copy both hold.
    return SegmentedButton<String>(
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
          RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
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
    ).animate(delay: 200.ms).fadeIn(duration: 280.ms, curve: ffTheme.easeOut).slideY(begin: 0.05, end: 0, duration: 280.ms, curve: ffTheme.easeOut);
  }

  Widget _buildNextStepsCard(AppTheme ffTheme) {
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: ffTheme.cardDecoration(radius: ffTheme.radiusLg),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('מה קורה אחרי שתשלחו?', style: ffTheme.titleSmall),
          const SizedBox(height: 14),
          _TimelineStep(step: 1, title: 'נציג יחזור אליכם תוך שעה', sub: 'בימי א׳–ה׳, 9:00–21:00', ffTheme: ffTheme),
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
      border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide(color: ffTheme.alternate)),
      enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide(color: ffTheme.alternate)),
      focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide(color: ffTheme.brandAccent, width: 1.5)),
      errorBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide(color: ffTheme.error)),
      focusedErrorBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide(color: ffTheme.error, width: 1.5)),
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
        Text(label, style: ffTheme.labelSmall.copyWith(color: ffTheme.secondaryText)),
      ],
    );
  }
}
