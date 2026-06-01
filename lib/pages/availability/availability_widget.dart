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
  int _revealedCount = 0;
  bool _loading = false;
  bool _checked = false;

  @override
  void dispose() {
    _cityCtrl.dispose();
    _streetCtrl.dispose();
    super.dispose();
  }

  final _providers = [
    _ISP(name: 'בזק', tech: 'סיב אופטי', status: 'זמין', speed: '1Gb', price: 89, icon: '✅'),
    _ISP(name: 'HOT', tech: 'כבלים', status: 'זמין', speed: '500Mb', price: 79, icon: '✅'),
    _ISP(name: 'סלקום', tech: 'סיב אופטי', status: 'זמין', speed: '1Gb', price: 99, icon: '✅'),
    _ISP(name: 'פרטנר', tech: 'סיב אופטי', status: 'בקרוב', speed: '—', price: 0, icon: '🔜'),
    _ISP(name: 'גילת', tech: 'לוויין', status: 'זמין', speed: 'עד 100Mb', price: 149, icon: '✅'),
  ];

  Future<void> _check() async {
    if (_cityCtrl.text.trim().isEmpty) return;
    setState(() { _loading = true; _checked = false; _revealedCount = 0; });
    await Future.delayed(const Duration(milliseconds: 800));
    if (!mounted) return;
    setState(() { _loading = false; _checked = true; });
    for (var i = 1; i <= _providers.length; i++) {
      await Future.delayed(const Duration(milliseconds: 300));
      if (!mounted) return;
      setState(() => _revealedCount = i);
    }
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
                  Text('גלה אילו ספקי אינטרנט פעילים באזורך ובאיזה מהירות', style: GoogleFonts.assistant(fontSize: 13, color: Colors.white70)),
                ],
              ),
            ).animate().fadeIn(duration: 400.ms),

            const SizedBox(height: 20),

            Text('עיר', style: ffTheme.labelLarge),
            const SizedBox(height: 8),
            TextField(
              controller: _cityCtrl,
              textDirection: TextDirection.rtl,
              decoration: InputDecoration(
                hintText: 'תל אביב, חיפה, ירושלים...',
                filled: true,
                fillColor: Colors.white,
                prefixIcon: const Icon(Icons.location_city_rounded),
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide.none),
                enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide.none),
                focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide(color: ffTheme.primary, width: 1.5)),
              ),
            ),

            const SizedBox(height: 14),

            Text('רחוב ומספר (אופציונלי)', style: ffTheme.labelLarge),
            const SizedBox(height: 8),
            TextField(
              controller: _streetCtrl,
              textDirection: TextDirection.rtl,
              decoration: InputDecoration(
                hintText: 'רחוב דיזנגוף 99',
                filled: true,
                fillColor: Colors.white,
                prefixIcon: const Icon(Icons.home_rounded),
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide.none),
                enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide.none),
                focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide(color: ffTheme.primary, width: 1.5)),
              ),
            ),

            const SizedBox(height: 20),

            FFButtonWidget(
              text: _loading ? 'בודק כיסוי...' : 'בדוק זמינות',
              onPressed: () async => _check(),
              options: FFButtonOptions(
                width: double.infinity,
                height: 52,
                color: ffTheme.primary,
                textStyle: ffTheme.titleSmall.override(color: Colors.white),
                borderRadius: BorderRadius.circular(14),
              ),
            ),

            // Loading state
            if (_loading) ...[
              const SizedBox(height: 28),
              Center(
                child: Column(
                  children: [
                    SizedBox(
                      width: 56,
                      height: 56,
                      child: CircularProgressIndicator(
                        color: ffTheme.primary,
                        strokeWidth: 3,
                      ),
                    ).animate(onPlay: (c) => c.repeat()).rotate(duration: 1200.ms),
                    const SizedBox(height: 14),
                    Text('בודק זמינות ספקים...', style: ffTheme.bodyMedium.override(color: ffTheme.secondaryText))
                        .animate(onPlay: (c) => c.repeat(reverse: true)).fadeIn(duration: 600.ms),
                  ],
                ),
              ),
            ],

            // Results
            if (_checked) ...[
              const SizedBox(height: 24),
              Row(
                children: [
                  Text('זמינות ב${_cityCtrl.text}', style: ffTheme.titleMedium),
                  const Spacer(),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                    decoration: BoxDecoration(color: ffTheme.accent1, borderRadius: BorderRadius.circular(20)),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Container(width: 7, height: 7, decoration: BoxDecoration(color: ffTheme.success, shape: BoxShape.circle)),
                        const SizedBox(width: 5),
                        Text('עדכני', style: ffTheme.labelSmall.override(color: ffTheme.success, fontWeight: FontWeight.w600)),
                      ],
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              ...List.generate(_providers.length, (i) {
                final isp = _providers[i];
                final isAvailable = isp.status == 'זמין';
                final isBest = isAvailable && isp.price > 0 && _providers.where((p) => p.status == 'זמין' && p.price > 0).map((p) => p.price).fold(9999, (a, b) => a < b ? a : b) == isp.price;
                if (i >= _revealedCount) return const SizedBox();
                return Container(
                  margin: const EdgeInsets.only(bottom: 10),
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(14),
                    border: Border.all(
                      color: isBest ? ffTheme.secondary : (isAvailable ? ffTheme.success.withOpacity(0.25) : ffTheme.alternate),
                      width: isBest ? 2 : 1,
                    ),
                    boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.04), blurRadius: 10, offset: const Offset(0, 2))],
                  ),
                  child: Column(
                    children: [
                      if (isBest)
                        Container(
                          width: double.infinity,
                          padding: const EdgeInsets.symmetric(vertical: 5),
                          decoration: BoxDecoration(
                            color: ffTheme.secondary,
                            borderRadius: const BorderRadius.vertical(top: Radius.circular(12)),
                          ),
                          child: Center(
                            child: Text('⭐ מחיר הכי נמוך', style: ffTheme.labelSmall.override(color: const Color(0xFF0E3A26), fontWeight: FontWeight.w800)),
                          ),
                        ),
                      Padding(
                        padding: const EdgeInsets.all(14),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              children: [
                                Text(isp.icon, style: const TextStyle(fontSize: 20)),
                                const SizedBox(width: 12),
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      Text(isp.name, style: ffTheme.titleSmall),
                                      Text('${isp.tech} • ${isp.speed}', style: ffTheme.bodySmall),
                                    ],
                                  ),
                                ),
                                if (isAvailable && isp.price > 0) ...[
                                  Column(
                                    crossAxisAlignment: CrossAxisAlignment.end,
                                    children: [
                                      Text('מ-₪${isp.price}', style: ffTheme.titleSmall.override(color: ffTheme.primary)),
                                      Text('לחודש', style: ffTheme.labelSmall.override(color: ffTheme.secondaryText)),
                                    ],
                                  ),
                                ] else
                                  Container(
                                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                                    decoration: BoxDecoration(color: ffTheme.accent2, borderRadius: BorderRadius.circular(8)),
                                    child: Text(isp.status, style: ffTheme.labelSmall.override(color: ffTheme.warning, fontWeight: FontWeight.w700)),
                                  ),
                              ],
                            ),
                            if (isAvailable) ...[
                              const SizedBox(height: 10),
                              _SpeedBar(speed: isp.speed, ffTheme: ffTheme),
                              const SizedBox(height: 10),
                              GestureDetector(
                                onTap: () {
                                  Provider.of<FFAppState>(context, listen: false).setCategory('internet');
                                  context.pushNamed('Results');
                                },
                                child: Row(
                                  mainAxisAlignment: MainAxisAlignment.end,
                                  children: [
                                    Text('ראה מסלולי ${isp.name}', style: ffTheme.labelSmall.override(color: ffTheme.primary, fontWeight: FontWeight.w700)),
                                    const SizedBox(width: 4),
                                    Icon(Icons.arrow_forward_ios_rounded, size: 11, color: ffTheme.primary),
                                  ],
                                ),
                              ),
                            ],
                          ],
                        ),
                      ),
                    ],
                  ),
                ).animate().fadeIn(duration: 300.ms).slideX(begin: 0.04, end: 0);
              }),

              if (_revealedCount >= _providers.length) ...[
                const SizedBox(height: 8),
                Container(
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(
                    gradient: LinearGradient(colors: [ffTheme.primary, ffTheme.tertiary]),
                    borderRadius: BorderRadius.circular(14),
                  ),
                  child: Row(
                    children: [
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text('${_providers.where((p) => p.status == 'זמין').length} ספקים זמינים', style: ffTheme.titleSmall.override(color: Colors.white)),
                            Text('השווה מחירים ומהירויות', style: ffTheme.bodySmall.override(color: Colors.white70)),
                          ],
                        ),
                      ),
                      ElevatedButton(
                        onPressed: () {
                          Provider.of<FFAppState>(context, listen: false).setCategory('internet');
                          context.pushNamed('Results');
                        },
                        style: ElevatedButton.styleFrom(
                          backgroundColor: ffTheme.secondary,
                          foregroundColor: const Color(0xFF0E3A26),
                          elevation: 0,
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                        ),
                        child: Text('השווה ←', style: ffTheme.labelMedium.override(color: const Color(0xFF0E3A26), fontWeight: FontWeight.w700)),
                      ),
                    ],
                  ),
                ).animate().fadeIn(duration: 400.ms),
              ],
            ],

            const SizedBox(height: 32),
          ],
        ),
      ),
    );
  }
}

class _ISP {
  final String name, tech, status, speed, icon;
  final int price;
  const _ISP({required this.name, required this.tech, required this.status, required this.speed, required this.price, required this.icon});
}

class _SpeedBar extends StatelessWidget {
  const _SpeedBar({required this.speed, required this.ffTheme});
  final String speed;
  final FlutterFlowTheme ffTheme;

  double _speedFraction() {
    if (speed.contains('1Gb') || speed.contains('1000')) return 1.0;
    if (speed.contains('500')) return 0.75;
    if (speed.contains('200')) return 0.55;
    if (speed.contains('100')) return 0.4;
    if (speed.contains('50')) return 0.25;
    return 0.3;
  }

  @override
  Widget build(BuildContext context) {
    final fraction = _speedFraction();
    return Row(
      children: [
        Text('מהירות:', style: ffTheme.labelSmall.override(color: ffTheme.secondaryText)),
        const SizedBox(width: 8),
        Expanded(
          child: ClipRRect(
            borderRadius: BorderRadius.circular(4),
            child: LinearProgressIndicator(
              value: fraction,
              backgroundColor: ffTheme.alternate,
              valueColor: AlwaysStoppedAnimation(fraction >= 0.75 ? ffTheme.success : (fraction >= 0.45 ? ffTheme.primary : ffTheme.warning)),
              minHeight: 6,
            ),
          ),
        ),
        const SizedBox(width: 8),
        Text(speed, style: ffTheme.labelSmall.override(color: ffTheme.primaryText, fontWeight: FontWeight.w600)),
      ],
    );
  }
}
