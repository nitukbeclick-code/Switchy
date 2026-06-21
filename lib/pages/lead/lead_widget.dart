import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:provider/provider.dart';
import '../../theme/app_theme.dart';
import '../../core/nav.dart';
import '../../widgets/app_button.dart';
import '../../widgets/app_snackbar.dart';
import '../../widgets/consent_panel.dart';
import '../../app_state.dart';
import '../../data.dart';
import '../../models.dart';
import '../../services/backend/backend.dart';
import '../../services/backend/local_backend.dart';
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

    return Scaffold(
      backgroundColor: ffTheme.background,
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
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(20),
        child: Form(
          key: _formKey,
          // Validate each field when the user LEAVES it (not only on submit,
          // and not on every keystroke) — the error shows next to the field.
          autovalidateMode: AutovalidateMode.onUnfocus,
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
                decoration: _inputDecoration(hint: 'ישראל ישראלי', icon: Icons.person_outline_rounded, ffTheme: ffTheme),
                validator: (v) => (v == null || v.trim().isEmpty) ? 'שדה חובה' : null,
              ).animate(delay: 80.ms).fadeIn().slideY(begin: 0.05),

              const SizedBox(height: 14),

              // Phone field
              _FieldLabel(label: 'מספר טלפון', ffTheme: ffTheme),
              const SizedBox(height: 8),
              TextFormField(
                controller: _phoneCtrl,
                keyboardType: TextInputType.phone,
                textDirection: TextDirection.ltr,
                decoration: _inputDecoration(hint: '050-0000000', icon: Icons.phone_outlined, ffTheme: ffTheme),
                validator: (v) {
                  final digits = (v ?? '').replaceAll(RegExp(r'\D'), '');
                  return (digits.length < 9 || digits.length > 15) ? 'מספר טלפון לא תקין' : null;
                },
              ).animate(delay: 120.ms).fadeIn().slideY(begin: 0.05),

              const SizedBox(height: 14),

              // Email field (optional)
              _FieldLabel(label: 'אימייל (אופציונלי)', ffTheme: ffTheme),
              const SizedBox(height: 8),
              TextFormField(
                controller: _emailCtrl,
                keyboardType: TextInputType.emailAddress,
                textDirection: TextDirection.ltr,
                decoration: _inputDecoration(hint: 'example@email.com', icon: Icons.mail_outline_rounded, ffTheme: ffTheme),
              ).animate(delay: 160.ms).fadeIn().slideY(begin: 0.05),

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

              // Submit button — the green ACTION gradient (AppColors.primary is
              // the const-ink sentinel AppButton maps to the theme-aware accent
              // gradient, so the CTA stays vivid in dark too).
              AppButton(
                text: _isSubmitting ? 'שולח...' : 'שלחו פרטים',
                onPressed: _isSubmitting ? () async {} : () async {
                  if (!_formKey.currentState!.validate()) return;
                  if (!_acceptTerms || !_acceptPrivacy) {
                    AppSnackBar.info(context, 'יש לאשר את תנאי השימוש ומדיניות הפרטיות כדי לשלוח');
                    return;
                  }
                  HapticFeedback.lightImpact();
                  setState(() => _isSubmitting = true);
                  final name = _nameCtrl.text.trim();
                  // Normalize to digits/+ — the leads gate rejects dots/parens.
                  final phone = _phoneCtrl.text.replaceAll(RegExp(r'[^\d+]'), '');
                  final email = _emailCtrl.text.trim();
                  // Mirror the lead to the backend seam — a no-op locally today,
                  // an insert into the `leads` table once SupabaseBackend is set.
                  try {
                    final st = AppState();
                    // Build rep context: current bill + quiz preferences.
                    final bill = plan != null ? st.currentBill(plan.cat) : 0;
                    final parts = <String>[];
                    if (bill > 0) parts.add('חשבון נוכחי: ₪$bill/חודש');
                    if (plan != null) parts.add('חסכון שנתי צפוי: ₪${planSaveYear(plan, bill)}');
                    if (st.quizCompleted) parts.add('תקציב: ₪${st.quizBudget} | עדיפות: ${st.quizPriority} | קווים: ${st.quizLines}');
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
                    appBackend.upsertProfile(name: name, phone: phone, email: email.isNotEmpty ? email : null).catchError((_) {});
                  } catch (_) {
                    // The lead never reached the team — keep the form so the
                    // user can retry instead of believing someone will call.
                    if (!context.mounted) return;
                    setState(() => _isSubmitting = false);
                    AppSnackBar.error(context, 'שליחת הפנייה נכשלה — בדקו את החיבור ונסו שוב');
                    return;
                  }
                  if (!context.mounted) return;
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
                  // Tactile confirmation that the lead actually reached the team.
                  HapticFeedback.mediumImpact();
                  context.goNamed('Success');
                },
                
                  width: double.infinity,
                  height: 56,
                  color: AppColors.primary,
                  textStyle: ffTheme.titleMedium.copyWith(color: Colors.white),
                  borderRadius: BorderRadius.circular(18),
                
              ).animate().fadeIn(delay: 300.ms),

              const SizedBox(height: 8),

              Center(
                child: Text(
                  'ללא התחייבות • שירות חינמי לחלוטין',
                  style: ffTheme.labelSmall.copyWith(color: ffTheme.secondaryText),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildAvailabilityBanner(AppTheme ffTheme) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
      decoration: BoxDecoration(
        color: ffTheme.brandAccentTint,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: ffTheme.brandAccent.withValues(alpha: 0.3)),
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

  Widget _buildPlanCard(Plan plan, AppState appState, AppTheme ffTheme) {
    final bill = appState.currentBill(plan.cat);
    final saveYear = planSaveYear(plan, bill);
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: [ffTheme.accent1, ffTheme.cardSurface],
          begin: Alignment.topRight,
          end: Alignment.bottomLeft,
        ),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: ffTheme.primary.withValues(alpha: 0.2)),
      ),
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
    return Row(
      children: options.map((opt) {
        final selected = _callbackTime == opt.$1;
        return Expanded(
          child: GestureDetector(
            onTap: () => setState(() => _callbackTime = opt.$1),
            child: AnimatedContainer(
              duration: const Duration(milliseconds: 200),
              margin: EdgeInsets.only(right: opt.$1 != 'tomorrow' ? 8 : 0),
              padding: const EdgeInsets.symmetric(vertical: 10),
              decoration: BoxDecoration(
                color: selected ? ffTheme.brandAccent : ffTheme.cardSurface,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: selected ? ffTheme.brandAccent : ffTheme.alternate, width: selected ? 1.5 : 1),
                boxShadow: selected ? [BoxShadow(color: ffTheme.brandAccent.withValues(alpha: 0.28), blurRadius: 10, offset: const Offset(0, 3))] : [],
              ),
              child: Column(
                children: [
                  Icon(opt.$3, size: 18, color: selected ? Colors.white : ffTheme.secondaryText),
                  const SizedBox(height: 4),
                  Text(opt.$2, style: ffTheme.labelSmall.copyWith(
                    color: selected ? Colors.white : ffTheme.primaryText,
                    fontWeight: selected ? FontWeight.w700 : FontWeight.w500,
                    fontSize: 11,
                  )),
                ],
              ),
            ),
          ),
        );
      }).toList(),
    ).animate(delay: 200.ms).fadeIn().slideY(begin: 0.05);
  }

  Widget _buildNextStepsCard(AppTheme ffTheme) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: ffTheme.cardSurface,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: ffTheme.alternate),
      ),
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
