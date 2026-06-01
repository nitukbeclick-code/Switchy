import 'package:flutter/material.dart';
import '../../flutter_flow/flutter_flow_theme.dart';
import '../../flutter_flow/flutter_flow_util.dart';
import '../../flutter_flow/flutter_flow_widgets.dart';

class AvailabilityWidget extends StatefulWidget {
  const AvailabilityWidget({super.key});

  @override
  State<AvailabilityWidget> createState() => _AvailabilityWidgetState();
}

class _AvailabilityWidgetState extends State<AvailabilityWidget> {
  final _addressCtrl = TextEditingController();
  bool _checked = false;
  bool _loading = false;

  static const _providers = [
    ('בזק', true, 'סיב אופטי 1000Mb'),
    ('HOT', true, 'כבלים 500Mb'),
    ('פרטנר', true, 'סיב אופטי 1000Mb'),
    ('סלקום', false, 'לא זמין באזורכם'),
    ('גילת', true, 'לווייני 50Mb'),
  ];

  @override
  void dispose() {
    _addressCtrl.dispose();
    super.dispose();
  }

  Future<void> _check() async {
    if (_addressCtrl.text.trim().isEmpty) return;
    setState(() => _loading = true);
    await Future.delayed(const Duration(seconds: 1));
    if (mounted) setState(() { _loading = false; _checked = true; });
  }

  @override
  Widget build(BuildContext context) {
    final ffTheme = FlutterFlowTheme.of(context);

    return Scaffold(
      backgroundColor: ffTheme.background,
      appBar: AppBar(title: const Text('בדיקת זמינות')),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('הכניסו כתובת לבדיקת זמינות', style: ffTheme.titleMedium),
            const SizedBox(height: 4),
            Text('נבדוק אילו ספקים זמינים אצלכם', style: ffTheme.bodySmall.override(color: ffTheme.secondaryText)),
            const SizedBox(height: 20),

            TextField(
              controller: _addressCtrl,
              decoration: InputDecoration(
                hintText: 'רחוב, עיר...',
                prefixIcon: const Icon(Icons.location_on_outlined),
              ),
            ),
            const SizedBox(height: 16),

            FFButtonWidget(
              text: 'בדוק זמינות',
              onPressed: _check,
              options: FFButtonOptions(
                width: double.infinity,
                height: 52,
                color: ffTheme.primary,
                textStyle: ffTheme.titleSmall.override(color: Colors.white),
                borderRadius: BorderRadius.circular(16),
              ),
            ),

            if (_loading) ...[
              const SizedBox(height: 32),
              Center(child: CircularProgressIndicator(color: ffTheme.primary)),
            ],

            if (_checked && !_loading) ...[
              const SizedBox(height: 24),
              Text('תוצאות עבור "${_addressCtrl.text}"', style: ffTheme.titleMedium),
              const SizedBox(height: 12),
              ..._providers.map((p) => Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: Container(
                  padding: const EdgeInsets.all(14),
                  decoration: BoxDecoration(
                    color: ffTheme.secondaryBackground,
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: ffTheme.alternate),
                  ),
                  child: Row(
                    children: [
                      Icon(
                        p.$2 ? Icons.check_circle_rounded : Icons.cancel_rounded,
                        color: p.$2 ? ffTheme.success : ffTheme.error,
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(p.$1, style: ffTheme.titleSmall),
                            Text(p.$3, style: ffTheme.bodySmall.override(color: ffTheme.secondaryText)),
                          ],
                        ),
                      ),
                      if (p.$2)
                        TextButton(
                          onPressed: () => context.goNamed('Results'),
                          child: Text('בחר', style: ffTheme.labelMedium.override(color: ffTheme.primary)),
                        ),
                    ],
                  ),
                ),
              )),
            ],
          ],
        ),
      ),
    );
  }
}
