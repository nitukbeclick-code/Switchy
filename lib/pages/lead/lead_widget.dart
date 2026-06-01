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
  final _formKey = GlobalKey<FormState>();

  @override
  void dispose() {
    _nameCtrl.dispose();
    _phoneCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final ffTheme = FlutterFlowTheme.of(context);
    final appState = Provider.of<FFAppState>(context, listen: false);
    final plan = planById(widget.planId);

    // Pre-fill from appState
    if (_nameCtrl.text.isEmpty && appState.userName.isNotEmpty) {
      _nameCtrl.text = appState.userName;
    }
    if (_phoneCtrl.text.isEmpty && appState.userPhone.isNotEmpty) {
      _phoneCtrl.text = appState.userPhone;
    }

    return Scaffold(
      backgroundColor: ffTheme.background,
      appBar: AppBar(
        title: const Text('פרטים לקשר'),
        leading: IconButton(
          icon: const Icon(Icons.close_rounded),
          onPressed: () => context.safePop(),
        ),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(24),
        child: Form(
          key: _formKey,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Plan summary
              if (plan != null) ...[
                Container(
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(
                    color: ffTheme.accent1,
                    borderRadius: BorderRadius.circular(16),
                    border: Border.all(color: ffTheme.primary.withOpacity(0.2)),
                  ),
                  child: Row(
                    children: [
                      LogoWidget(provider: plan.provider, size: 48),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(plan.provider, style: ffTheme.titleSmall),
                            Text(plan.plan, style: ffTheme.bodySmall),
                            Text('₪${plan.price}/חודש', style: ffTheme.titleMedium.override(color: ffTheme.primary)),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 24),
              ],

              Text('השאירו פרטים', style: ffTheme.headlineMedium),
              const SizedBox(height: 4),
              Text('נחזור אליכם תוך שעה לסגירת העסקה', style: ffTheme.bodyMedium.override(color: ffTheme.secondaryText)),
              const SizedBox(height: 24),

              Text('שם מלא', style: ffTheme.labelLarge),
              const SizedBox(height: 8),
              TextFormField(
                controller: _nameCtrl,
                decoration: const InputDecoration(hintText: 'ישראל ישראלי', prefixIcon: Icon(Icons.person_outline_rounded)),
                validator: (v) => (v == null || v.trim().isEmpty) ? 'שדה חובה' : null,
              ),

              const SizedBox(height: 16),

              Text('מספר טלפון', style: ffTheme.labelLarge),
              const SizedBox(height: 8),
              TextFormField(
                controller: _phoneCtrl,
                keyboardType: TextInputType.phone,
                decoration: const InputDecoration(hintText: '050-0000000', prefixIcon: Icon(Icons.phone_outlined)),
                validator: (v) => (v == null || v.trim().length < 9) ? 'מספר טלפון לא תקין' : null,
              ),

              const SizedBox(height: 32),

              // What happens next timeline
              Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: ffTheme.background,
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
              ),

              const SizedBox(height: 24),

              // Trust badges
              Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  _TrustBadge(icon: Icons.lock_outline_rounded, label: 'מאובטח', ffTheme: ffTheme),
                  const SizedBox(width: 16),
                  _TrustBadge(icon: Icons.star_outline_rounded, label: 'דירוג 4.8', ffTheme: ffTheme),
                  const SizedBox(width: 16),
                  _TrustBadge(icon: Icons.people_outline_rounded, label: '60K לקוחות', ffTheme: ffTheme),
                ],
              ),

              const SizedBox(height: 24),

              FFButtonWidget(
                text: 'שלחו פרטים',
                onPressed: () async {
                  if (!_formKey.currentState!.validate()) return;
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
                  color: ffTheme.primary,
                  textStyle: ffTheme.titleMedium.override(color: Colors.white),
                  borderRadius: BorderRadius.circular(18),
                ),
              ),
            ],
          ),
        ),
      ),
    );
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
              width: 28,
              height: 28,
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
