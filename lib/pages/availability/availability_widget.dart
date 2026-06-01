import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:google_fonts/google_fonts.dart';
import '../../flutter_flow/flutter_flow_theme.dart';
import '../../flutter_flow/flutter_flow_util.dart';
import '../../flutter_flow/flutter_flow_widgets.dart';
import '../../app_state.dart';

class AvailabilityWidget extends StatefulWidget {
  const AvailabilityWidget({super.key});

  @override
  State<AvailabilityWidget> createState() => _AvailabilityWidgetState();
}

class _AvailabilityWidgetState extends State<AvailabilityWidget> {
  final _cityCtrl = TextEditingController();
  final _streetCtrl = TextEditingController();
  bool _checked = false;
  bool _loading = false;

  @override
  void dispose() {
    _cityCtrl.dispose();
    _streetCtrl.dispose();
    super.dispose();
  }

  final _providers = [
    _ISP(name: 'בזק', status: 'זמין', icon: '✅', note: 'סיב אופטי זמין'),
    _ISP(name: 'HOT', status: 'זמין', icon: '✅', note: 'כבלים זמין'),
    _ISP(name: 'פרטנר', status: 'בקרוב', icon: '🔜', note: 'צפוי ב-Q2 2025'),
    _ISP(name: 'סלקום', status: 'זמין', icon: '✅', note: 'סיב אופטי זמין'),
    _ISP(name: 'גילת', status: 'זמין', icon: '✅', note: 'לוויין — כל הארץ'),
  ];

  Future<void> _check() async {
    if (_cityCtrl.text.trim().isEmpty) return;
    setState(() => _loading = true);
    await Future.delayed(const Duration(milliseconds: 1500));
    if (mounted) setState(() { _loading = false; _checked = true; });
  }

  @override
  Widget build(BuildContext context) {
    final ffTheme = FlutterFlowTheme.of(context);

    return Scaffold(
      backgroundColor: ffTheme.background,
      appBar: AppBar(
        title: const Text('בדיקת זמינות'),
        backgroundColor: Colors.transparent,
        elevation: 0,
        foregroundColor: ffTheme.primaryText,
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(18),
              decoration: BoxDecoration(
                gradient: LinearGradient(colors: [ffTheme.primary, ffTheme.tertiary]),
                borderRadius: BorderRadius.circular(16),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text('📍', style: TextStyle(fontSize: 32)),
                  const SizedBox(height: 10),
                  Text('בדוק זמינות בכתובת שלך', style: GoogleFonts.rubik(fontSize: 20, fontWeight: FontWeight.w700, color: Colors.white)),
                  Text('גלה אילו ספקי אינטרנט פעילים באזורך', style: GoogleFonts.assistant(fontSize: 13, color: Colors.white70)),
                ],
              ),
            ).animate().fadeIn(duration: 400.ms),

            const SizedBox(height: 20),

            Text('עיר', style: ffTheme.labelLarge),
            const SizedBox(height: 8),
            TextField(
              controller: _cityCtrl,
              decoration: InputDecoration(
                hintText: 'תל אביב, חיפה, ירושלים...',
                prefixIcon: const Icon(Icons.location_city_rounded),
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
              ),
            ),

            const SizedBox(height: 14),

            Text('רחוב ומספר (אופציונלי)', style: ffTheme.labelLarge),
            const SizedBox(height: 8),
            TextField(
              controller: _streetCtrl,
              decoration: InputDecoration(
                hintText: 'רחוב דיזנגוף 99',
                prefixIcon: const Icon(Icons.home_rounded),
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
              ),
            ),

            const SizedBox(height: 20),

            FFButtonWidget(
              text: _loading ? 'בודק...' : 'בדוק זמינות',
              onPressed: () async => _check(),
              options: FFButtonOptions(
                width: double.infinity,
                height: 52,
                color: ffTheme.primary,
                textStyle: ffTheme.titleSmall.override(color: Colors.white),
                borderRadius: BorderRadius.circular(14),
              ),
            ),

            if (_checked) ...[
              const SizedBox(height: 24),
              Text('זמינות בכתובת: ${_cityCtrl.text}', style: ffTheme.titleMedium),
              const SizedBox(height: 12),
              ..._providers.asMap().entries.map((entry) {
                final i = entry.key;
                final isp = entry.value;
                final isAvailable = isp.status == 'זמין';
                return Container(
                  margin: const EdgeInsets.only(bottom: 8),
                  padding: const EdgeInsets.all(14),
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: isAvailable ? ffTheme.success.withOpacity(0.3) : ffTheme.alternate),
                  ),
                  child: Row(
                    children: [
                      Text(isp.icon, style: const TextStyle(fontSize: 20)),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(isp.name, style: ffTheme.titleSmall),
                            Text(isp.note, style: ffTheme.bodySmall),
                          ],
                        ),
                      ),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                        decoration: BoxDecoration(
                          color: isAvailable ? ffTheme.accent1 : ffTheme.accent2,
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: Text(isp.status, style: ffTheme.labelSmall.override(color: isAvailable ? ffTheme.success : ffTheme.warning, fontWeight: FontWeight.w700)),
                      ),
                    ],
                  ),
                ).animate(delay: (i * 80).ms).fadeIn(duration: 350.ms).slideX(begin: 0.05, end: 0);
              }),

              const SizedBox(height: 16),

              ElevatedButton(
                onPressed: () {
                  Provider.of<FFAppState>(context, listen: false).setCategory('internet');
                  context.pushNamed('Results');
                },
                style: ElevatedButton.styleFrom(
                  backgroundColor: ffTheme.secondary,
                  foregroundColor: const Color(0xFF0E3A26),
                  minimumSize: const Size(double.infinity, 50),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                ),
                child: Text('ראה מחירי אינטרנט →', style: ffTheme.titleSmall.override(color: const Color(0xFF0E3A26))),
              ),
            ],

            const SizedBox(height: 32),
          ],
        ),
      ),
    );
  }
}

class _ISP {
  final String name, status, icon, note;
  const _ISP({required this.name, required this.status, required this.icon, required this.note});
}
