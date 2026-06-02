import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:provider/provider.dart';
import '../../flutter_flow/flutter_flow_theme.dart';
import '../../flutter_flow/flutter_flow_util.dart';
import '../../flutter_flow/flutter_flow_widgets.dart';
import '../../app_state.dart';
import '../../data.dart';
import '../../components/logo_widget/logo_widget.dart';

class LeadWidget extends StatefulWidget {
  const LeadWidget({super.key, required this.planId});
  final String planId;

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

  // Countdown to "agent available"
  int _countdown = 47;
  Timer? _countdownTimer;

  @override
  void initState() {
    super.initState();
    _countdownTimer = Timer.periodic(const Duration(seconds: 1), (_) {
      if (!mounted) return;
      setState(() {
        if (_countdown > 1) {
          _countdown--;
        } else {
          _countdownTimer?.cancel();
        }
      });
    });
  }

  @override
  void dispose() {
    _nameCtrl.dispose();
    _phoneCtrl.dispose();
    _emailCtrl.dispose();
    _countdownTimer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final ffTheme = FlutterFlowTheme.of(context);
    final appState = Provider.of<FFAppState>(context, listen: false);
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
          onPressed: () => context.safePop(),
        ),
        title: Text('השאירו פרטים', style: ffTheme.titleMedium),
        centerTitle: true,
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(20),
        child: Form(
          key: _formKey,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Urgency chip — "נציג זמין בעוד X שניות"
              _buildUrgencyBanner(ffTheme),
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
                validator: (v) => (v == null || v.trim().length < 9) ? 'מספר טלפון לא תקין' : null,
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

              // Social proof
              if (plan != null) _buildSocialProof(plan, ffTheme),

              const SizedBox(height: 20),

              // Trust badges
              Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  _TrustBadge(icon: Icons.lock_outline_rounded, label: 'מאובטח', ffTheme: ffTheme),
                  const SizedBox(width: 20),
                  _TrustBadge(icon: Icons.star_outline_rounded, label: 'דירוג 4.8', ffTheme: ffTheme),
                  const SizedBox(width: 20),
                  _TrustBadge(icon: Icons.people_outline_rounded, label: '60K לקוחות', ffTheme: ffTheme),
                ],
              ).animate(delay: 250.ms).fadeIn(),

              const SizedBox(height: 24),

              // Submit button
              FFButtonWidget(
                text: _isSubmitting ? 'שולח...' : 'שלחו פרטים',
                onPressed: _isSubmitting ? () async {} : () async {
                  if (!_formKey.currentState!.validate()) return;
                  setState(() => _isSubmitting = true);
                  await Future.delayed(const Duration(milliseconds: 800));
                  if (!mounted) return;
                  appState.submitLead(
                    name: _nameCtrl.text.trim(),
                    phone: _phoneCtrl.text.trim(),
                    provider: plan?.provider ?? '',
                    planId: widget.planId,
                  );
                  context.goNamed('Success');
                },
                options: FFButtonOptions(
                  width: double.infinity,
                  height: 56,
                  color: _isSubmitting ? ffTheme.alternate : ffTheme.primary,
                  textStyle: ffTheme.titleMedium.override(color: Colors.white),
                  borderRadius: BorderRadius.circular(18),
                ),
              ).animate().fadeIn(delay: 300.ms),

              const SizedBox(height: 8),

              Center(
                child: Text(
                  'ללא התחייבות • שירות חינמי לחלוטין',
                  style: ffTheme.labelSmall.override(color: ffTheme.secondaryText),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildUrgencyBanner(FlutterFlowTheme ffTheme) {
    final isLive = _countdown > 0;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
      decoration: BoxDecoration(
        color: isLive ? ffTheme.accent1 : ffTheme.accent2,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: isLive ? ffTheme.primary.withOpacity(0.3) : ffTheme.warning.withOpacity(0.3)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 8, height: 8,
            decoration: BoxDecoration(color: isLive ? ffTheme.primary : ffTheme.warning, shape: BoxShape.circle),
          ).animate(onPlay: (c) => c.repeat(reverse: true))
            .scale(begin: const Offset(1, 1), end: const Offset(1.5, 1.5), duration: 700.ms),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              isLive ? 'נציג זמין עכשיו — יחזור אליך תוך $_countdown שניות' : 'שלחו פרטים ונחזור אליכם בהקדם',
              style: ffTheme.labelMedium.override(
                color: isLive ? ffTheme.primary : ffTheme.warning,
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
        ],
      ),
    ).animate().fadeIn(duration: 350.ms);
  }

  Widget _buildPlanCard(Plan plan, FFAppState appState, FlutterFlowTheme ffTheme) {
    final bill = appState.currentBill(plan.cat);
    final saveYear = planSaveYear(plan, bill);
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: [ffTheme.accent1, Colors.white],
          begin: Alignment.topRight,
          end: Alignment.bottomLeft,
        ),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: ffTheme.primary.withOpacity(0.2)),
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
                    Text('₪${plan.price}/חודש', style: ffTheme.titleMedium.override(color: ffTheme.primary)),
                  ],
                ),
              ),
              if (saveYear > 0)
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                  decoration: BoxDecoration(color: ffTheme.secondary, borderRadius: BorderRadius.circular(10)),
                  child: Column(
                    children: [
                      Text('חוסך', style: ffTheme.labelSmall.override(color: const Color(0xFF0E3A26))),
                      Text('₪$saveYear/שנה', style: ffTheme.titleSmall.override(color: const Color(0xFF0E3A26), fontWeight: FontWeight.w800)),
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
                color: ffTheme.primary.withOpacity(0.08),
                borderRadius: BorderRadius.circular(8),
              ),
              child: Text(
                '🎉 כ-₪${(saveYear / 12).round()} חיסכון בחודש הראשון!',
                style: ffTheme.labelMedium.override(color: ffTheme.primary, fontWeight: FontWeight.w700),
                textAlign: TextAlign.center,
              ),
            ),
          ],
        ],
      ),
    ).animate().fadeIn(duration: 350.ms);
  }

  Widget _buildCallbackTimePicker(FlutterFlowTheme ffTheme) {
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
                color: selected ? ffTheme.primary : Colors.white,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: selected ? ffTheme.primary : ffTheme.alternate, width: selected ? 1.5 : 1),
                boxShadow: selected ? [BoxShadow(color: ffTheme.primary.withOpacity(0.2), blurRadius: 8, offset: const Offset(0, 2))] : [],
              ),
              child: Column(
                children: [
                  Icon(opt.$3, size: 18, color: selected ? Colors.white : ffTheme.secondaryText),
                  const SizedBox(height: 4),
                  Text(opt.$2, style: ffTheme.labelSmall.override(
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

  Widget _buildNextStepsCard(FlutterFlowTheme ffTheme) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
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

  Widget _buildSocialProof(Plan plan, FlutterFlowTheme ffTheme) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
      decoration: BoxDecoration(
        color: ffTheme.accent2,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: ffTheme.warning.withOpacity(0.25)),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Container(
            width: 8, height: 8,
            decoration: BoxDecoration(color: ffTheme.warning, shape: BoxShape.circle),
          ).animate(onPlay: (c) => c.repeat(reverse: true))
            .scale(begin: const Offset(1, 1), end: const Offset(1.4, 1.4), duration: 800.ms),
          const SizedBox(width: 8),
          Text(
            '${(plan.reviews % 30) + 14} אנשים בחרו ב${plan.provider} השבוע',
            style: ffTheme.labelMedium.override(color: ffTheme.warning, fontWeight: FontWeight.w700),
          ),
        ],
      ),
    ).animate().fadeIn(duration: 300.ms);
  }

  InputDecoration _inputDecoration({required String hint, required IconData icon, required FlutterFlowTheme ffTheme}) {
    return InputDecoration(
      hintText: hint,
      prefixIcon: Icon(icon, color: ffTheme.secondaryText, size: 20),
      filled: true,
      fillColor: Colors.white,
      border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide(color: ffTheme.alternate)),
      enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide(color: ffTheme.alternate)),
      focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide(color: ffTheme.primary, width: 1.5)),
      errorBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide(color: ffTheme.error)),
      focusedErrorBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide(color: ffTheme.error, width: 1.5)),
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
    );
  }
}

class _FieldLabel extends StatelessWidget {
  const _FieldLabel({required this.label, required this.ffTheme});
  final String label;
  final FlutterFlowTheme ffTheme;

  @override
  Widget build(BuildContext context) {
    return Text(label, style: ffTheme.labelLarge.override(fontWeight: FontWeight.w600));
  }
}

class _TimelineStep extends StatelessWidget {
  const _TimelineStep({required this.step, required this.title, required this.sub, required this.ffTheme, this.isLast = false});
  final int step;
  final String title, sub;
  final FlutterFlowTheme ffTheme;
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
              decoration: BoxDecoration(color: ffTheme.primary, shape: BoxShape.circle),
              child: Center(child: Text('$step', style: ffTheme.labelSmall.override(color: Colors.white, fontWeight: FontWeight.w800))),
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
                Text(title, style: ffTheme.titleSmall.override(fontSize: 13)),
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
  final FlutterFlowTheme ffTheme;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Icon(icon, color: ffTheme.primary, size: 22),
        const SizedBox(height: 4),
        Text(label, style: ffTheme.labelSmall.override(color: ffTheme.secondaryText)),
      ],
    );
  }
}
