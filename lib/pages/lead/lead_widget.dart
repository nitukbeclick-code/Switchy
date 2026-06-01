import 'package:flutter/material.dart';
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

              // Benefits
              ...['נציג יחזור אליכם תוך שעה', 'נעזור בכל תהליך הניוד', 'ללא עלות וללא התחייבות'].map((b) => Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: Row(
                  children: [
                    Icon(Icons.check_circle_outline_rounded, color: ffTheme.success, size: 18),
                    const SizedBox(width: 10),
                    Text(b, style: ffTheme.bodyMedium),
                  ],
                ),
              )),

              const SizedBox(height: 32),

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
