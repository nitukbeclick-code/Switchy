import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:google_fonts/google_fonts.dart';
import '../../flutter_flow/flutter_flow_theme.dart';
import '../../flutter_flow/flutter_flow_util.dart';
import '../../data.dart';
import '../../components/logo_widget/logo_widget.dart';

class RatingsWidget extends StatefulWidget {
  const RatingsWidget({super.key});

  @override
  State<RatingsWidget> createState() => _RatingsWidgetState();
}

class _RatingsWidgetState extends State<RatingsWidget> {
  String? _selectedProvider;
  int _myRating = 0;
  final _reviewCtrl = TextEditingController();
  bool _submitted = false;

  @override
  void dispose() {
    _reviewCtrl.dispose();
    super.dispose();
  }

  // Provider averages
  Map<String, List<double>> get _providerRatings {
    final map = <String, List<double>>{};
    for (final plan in allPlans) {
      map.putIfAbsent(plan.provider, () => []).add(plan.rating);
    }
    return map;
  }

  @override
  Widget build(BuildContext context) {
    final ffTheme = FlutterFlowTheme.of(context);
    final ratings = _providerRatings;
    final sorted = ratings.entries.toList()
      ..sort((a, b) {
        final avgA = a.value.reduce((x, y) => x + y) / a.value.length;
        final avgB = b.value.reduce((x, y) => x + y) / b.value.length;
        return avgB.compareTo(avgA);
      });

    return Scaffold(
      backgroundColor: ffTheme.background,
      appBar: AppBar(
        title: const Text('דירוגי ספקים'),
        backgroundColor: Colors.transparent,
        elevation: 0,
        foregroundColor: ffTheme.primaryText,
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('לוח המנצחים', style: ffTheme.titleLarge),
            const SizedBox(height: 12),

            // Leaderboard
            ...sorted.asMap().entries.map((entry) {
              final i = entry.key;
              final provider = entry.value.key;
              final ratings_ = entry.value.value;
              final avg = ratings_.reduce((a, b) => a + b) / ratings_.length;
              final totalReviews = allPlans.where((p) => p.provider == provider).fold(0, (s, p) => s + p.reviews);

              return Container(
                margin: const EdgeInsets.only(bottom: 10),
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(14),
                  border: Border.all(color: i == 0 ? ffTheme.secondary : ffTheme.alternate, width: i == 0 ? 2 : 1),
                  boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.04), blurRadius: 8)],
                ),
                child: Row(
                  children: [
                    Container(
                      width: 32,
                      height: 32,
                      decoration: BoxDecoration(
                        color: i == 0 ? ffTheme.secondary : i == 1 ? const Color(0xFFE5E0D5) : ffTheme.background,
                        shape: BoxShape.circle,
                      ),
                      child: Center(
                        child: Text('${i + 1}', style: GoogleFonts.rubik(fontSize: 14, fontWeight: FontWeight.w800, color: const Color(0xFF0E3A26))),
                      ),
                    ),
                    const SizedBox(width: 10),
                    LogoWidget(provider: provider, size: 40),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(provider, style: ffTheme.titleSmall, overflow: TextOverflow.ellipsis),
                          Row(
                            children: [
                              ...List.generate(5, (j) => Icon(
                                j < avg.floor() ? Icons.star_rounded : j < avg ? Icons.star_half_rounded : Icons.star_outline_rounded,
                                size: 14,
                                color: ffTheme.warning,
                              )),
                              const SizedBox(width: 4),
                              Text('${avg.toStringAsFixed(1)}', style: ffTheme.labelSmall),
                            ],
                          ),
                        ],
                      ),
                    ),
                    Text('$totalReviews\nביקורות', style: ffTheme.labelSmall, textAlign: TextAlign.center),
                  ],
                ),
              ).animate(delay: (i * 60).ms).fadeIn(duration: 350.ms).slideX(begin: 0.05, end: 0);
            }),

            const SizedBox(height: 28),

            // Write review section
            Container(
              padding: const EdgeInsets.all(18),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(16),
                border: Border.all(color: ffTheme.alternate),
                boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.04), blurRadius: 10)],
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('כתוב ביקורת', style: ffTheme.titleLarge),
                  const SizedBox(height: 16),

                  if (_submitted)
                    Center(
                      child: Column(
                        children: [
                          Icon(Icons.check_circle_rounded, color: ffTheme.success, size: 48),
                          const SizedBox(height: 8),
                          Text('תודה! הביקורת נשמרה', style: ffTheme.titleSmall),
                        ],
                      ),
                    )
                  else ...[
                    Text('בחר ספק', style: ffTheme.labelLarge),
                    const SizedBox(height: 8),
                    Wrap(
                      spacing: 8,
                      runSpacing: 8,
                      children: sorted.take(8).map((e) {
                        final active = _selectedProvider == e.key;
                        return GestureDetector(
                          onTap: () => setState(() => _selectedProvider = e.key),
                          child: AnimatedContainer(
                            duration: const Duration(milliseconds: 200),
                            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                            decoration: BoxDecoration(
                              color: active ? ffTheme.primary : ffTheme.background,
                              borderRadius: BorderRadius.circular(20),
                              border: Border.all(color: active ? ffTheme.primary : ffTheme.alternate),
                            ),
                            child: Text(e.key, style: ffTheme.labelSmall.override(color: active ? Colors.white : ffTheme.primaryText)),
                          ),
                        );
                      }).toList(),
                    ),
                    const SizedBox(height: 16),
                    Text('דירוג', style: ffTheme.labelLarge),
                    const SizedBox(height: 8),
                    Row(
                      children: List.generate(5, (i) => GestureDetector(
                        onTap: () => setState(() => _myRating = i + 1),
                        child: Icon(
                          i < _myRating ? Icons.star_rounded : Icons.star_outline_rounded,
                          size: 36,
                          color: ffTheme.warning,
                        ),
                      )),
                    ),
                    const SizedBox(height: 16),
                    TextField(
                      controller: _reviewCtrl,
                      maxLines: 3,
                      decoration: InputDecoration(
                        hintText: 'ספרו על החוויה שלכם...',
                        border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                      ),
                    ),
                    const SizedBox(height: 16),
                    ElevatedButton(
                      onPressed: (_selectedProvider != null && _myRating > 0)
                          ? () => setState(() => _submitted = true)
                          : null,
                      style: ElevatedButton.styleFrom(
                        backgroundColor: ffTheme.primary,
                        minimumSize: const Size(double.infinity, 50),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                      ),
                      child: Text('שלח ביקורת', style: ffTheme.titleSmall.override(color: Colors.white)),
                    ),
                  ],
                ],
              ),
            ).animate().fadeIn(delay: 300.ms),

            const SizedBox(height: 24),
          ],
        ),
      ),
    );
  }
}
