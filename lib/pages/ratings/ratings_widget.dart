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

class _RatingsWidgetState extends State<RatingsWidget> with SingleTickerProviderStateMixin {
  String? _selectedProvider;
  int _myRating = 0;
  final _reviewCtrl = TextEditingController();
  bool _submitted = false;
  String _selectedCat = 'הכל';
  late TabController _tabCtrl;

  static const _cats = ['הכל', 'סלולר', 'אינטרנט', 'טלוויזיה'];

  @override
  void initState() {
    super.initState();
    _tabCtrl = TabController(length: _cats.length, vsync: this);
    _tabCtrl.addListener(() => setState(() => _selectedCat = _cats[_tabCtrl.index]));
  }

  @override
  void dispose() {
    _reviewCtrl.dispose();
    _tabCtrl.dispose();
    super.dispose();
  }

  Map<String, List<double>> get _providerRatings {
    final catFilter = <String, String>{'סלולר': 'cellular', 'אינטרנט': 'internet', 'טלוויזיה': 'tv'};
    final plans = _selectedCat == 'הכל'
        ? allPlans.where((p) => p.cat != 'abroad' && p.cat != 'triple').toList()
        : allPlans.where((p) => p.cat == catFilter[_selectedCat]).toList();

    final map = <String, List<double>>{};
    for (final plan in plans) {
      map.putIfAbsent(plan.provider, () => []).add(plan.rating);
    }
    return map;
  }

  // Synthetic sub-ratings per provider (price, service, coverage)
  Map<String, double> _subRating(String provider, String key) {
    final seed = provider.codeUnits.fold(0, (s, c) => s + c);
    switch (key) {
      case 'price': return {provider: (3.5 + (seed % 15) / 10).clamp(3.0, 5.0)};
      case 'service': return {provider: (3.2 + (seed % 17) / 10).clamp(3.0, 5.0)};
      case 'coverage': return {provider: (3.8 + (seed % 12) / 10).clamp(3.5, 5.0)};
      default: return {provider: 4.0};
    }
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
      body: NestedScrollView(
        headerSliverBuilder: (context, _) => [
          SliverAppBar(
            title: const Text('דירוגי ספקים'),
            backgroundColor: ffTheme.primary,
            foregroundColor: Colors.white,
            floating: true,
            snap: true,
            elevation: 0,
            bottom: TabBar(
              controller: _tabCtrl,
              tabs: _cats.map((c) => Tab(text: c)).toList(),
              indicatorColor: ffTheme.secondary,
              labelColor: Colors.white,
              unselectedLabelColor: Colors.white60,
              labelStyle: GoogleFonts.rubik(fontSize: 13, fontWeight: FontWeight.w700),
              unselectedLabelStyle: GoogleFonts.rubik(fontSize: 13, fontWeight: FontWeight.w500),
            ),
          ),
        ],
        body: SingleChildScrollView(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Top 3 podium
              if (sorted.length >= 3) ...[
                _buildPodium(sorted.take(3).toList(), ffTheme),
                const SizedBox(height: 20),
              ],

              Text('לוח מנצחים', style: ffTheme.titleLarge),
              const SizedBox(height: 12),

              // Full leaderboard
              ...sorted.asMap().entries.map((entry) {
                final i = entry.key;
                final provider = entry.value.key;
                final provRatings = entry.value.value;
                final avg = provRatings.reduce((a, b) => a + b) / provRatings.length;
                final totalReviews = allPlans.where((p) => p.provider == provider).fold(0, (s, p) => s + p.reviews);

                final priceR = _subRating(provider, 'price')[provider]!;
                final serviceR = _subRating(provider, 'service')[provider]!;
                final coverageR = _subRating(provider, 'coverage')[provider]!;

                return Container(
                  margin: const EdgeInsets.only(bottom: 12),
                  padding: const EdgeInsets.all(14),
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(16),
                    border: Border.all(color: i == 0 ? ffTheme.secondary : ffTheme.alternate, width: i == 0 ? 2 : 1),
                    boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.04), blurRadius: 8)],
                  ),
                  child: Column(
                    children: [
                      Row(
                        children: [
                          Container(
                            width: 32,
                            height: 32,
                            decoration: BoxDecoration(
                              color: i == 0 ? ffTheme.secondary : i == 1 ? const Color(0xFFE5E0D5) : i == 2 ? const Color(0xFFFFE8D0) : ffTheme.background,
                              shape: BoxShape.circle,
                            ),
                            child: Center(child: Text('${i + 1}', style: GoogleFonts.rubik(fontSize: 13, fontWeight: FontWeight.w800, color: const Color(0xFF0E3A26)))),
                          ),
                          const SizedBox(width: 10),
                          LogoWidget(provider: provider, size: 38),
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
                                      size: 13,
                                      color: ffTheme.warning,
                                    )),
                                    const SizedBox(width: 4),
                                    Text(avg.toStringAsFixed(1), style: ffTheme.labelSmall.override(fontWeight: FontWeight.w700)),
                                  ],
                                ),
                              ],
                            ),
                          ),
                          Column(
                            crossAxisAlignment: CrossAxisAlignment.end,
                            children: [
                              Text('$totalReviews', style: ffTheme.titleSmall.override(color: ffTheme.primary)),
                              Text('ביקורות', style: ffTheme.labelSmall),
                            ],
                          ),
                        ],
                      ),
                      const SizedBox(height: 12),
                      // Sub-rating bars
                      _SubBar(label: 'מחיר', value: priceR / 5, ffTheme: ffTheme),
                      const SizedBox(height: 6),
                      _SubBar(label: 'שירות', value: serviceR / 5, ffTheme: ffTheme),
                      const SizedBox(height: 6),
                      _SubBar(label: 'כיסוי', value: coverageR / 5, ffTheme: ffTheme),
                    ],
                  ),
                ).animate(delay: (i * 60).ms).fadeIn(duration: 350.ms).slideX(begin: 0.05, end: 0);
              }),

              const SizedBox(height: 24),

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
                    Row(
                      children: [
                        Icon(Icons.rate_review_rounded, color: ffTheme.primary, size: 22),
                        const SizedBox(width: 8),
                        Text('כתוב ביקורת', style: ffTheme.titleLarge),
                      ],
                    ),
                    const SizedBox(height: 16),

                    if (_submitted)
                      Center(
                        child: Column(
                          children: [
                            Icon(Icons.check_circle_rounded, color: ffTheme.success, size: 52),
                            const SizedBox(height: 8),
                            Text('תודה! הביקורת נשמרה', style: ffTheme.titleSmall),
                            const SizedBox(height: 4),
                            Text('הביקורת שלך תסייע לאחרים לבחור', style: ffTheme.bodySmall),
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
                      Text('דירוג כולל', style: ffTheme.labelLarge),
                      const SizedBox(height: 8),
                      Row(
                        children: List.generate(5, (i) => GestureDetector(
                          onTap: () => setState(() => _myRating = i + 1),
                          child: Padding(
                            padding: const EdgeInsets.only(left: 4),
                            child: Icon(
                              i < _myRating ? Icons.star_rounded : Icons.star_outline_rounded,
                              size: 38,
                              color: ffTheme.warning,
                            ),
                          ),
                        )),
                      ),
                      const SizedBox(height: 16),
                      TextField(
                        controller: _reviewCtrl,
                        maxLines: 3,
                        textDirection: TextDirection.rtl,
                        decoration: InputDecoration(
                          hintText: 'ספרו על החוויה שלכם...',
                          border: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(12),
                            borderSide: BorderSide(color: ffTheme.alternate),
                          ),
                          enabledBorder: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(12),
                            borderSide: BorderSide(color: ffTheme.alternate),
                          ),
                          focusedBorder: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(12),
                            borderSide: BorderSide(color: ffTheme.primary),
                          ),
                          filled: true,
                          fillColor: ffTheme.background,
                        ),
                      ),
                      const SizedBox(height: 16),
                      ElevatedButton.icon(
                        onPressed: (_selectedProvider != null && _myRating > 0)
                            ? () => setState(() => _submitted = true)
                            : null,
                        icon: const Icon(Icons.send_rounded, size: 18),
                        label: const Text('שלח ביקורת'),
                        style: ElevatedButton.styleFrom(
                          backgroundColor: ffTheme.primary,
                          foregroundColor: Colors.white,
                          disabledBackgroundColor: ffTheme.alternate,
                          minimumSize: const Size(double.infinity, 50),
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                          textStyle: GoogleFonts.rubik(fontSize: 15, fontWeight: FontWeight.w700),
                        ),
                      ),
                    ],
                  ],
                ),
              ).animate().fadeIn(delay: 300.ms),

              const SizedBox(height: 24),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildPodium(List<MapEntry<String, List<double>>> top, FlutterFlowTheme ffTheme) {
    final avgs = top.map((e) => e.value.reduce((a, b) => a + b) / e.value.length).toList();

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        gradient: LinearGradient(colors: [const Color(0xFF0E3A26), ffTheme.primary]),
        borderRadius: BorderRadius.circular(20),
      ),
      child: Column(
        children: [
          Text('מנצחי החודש', style: ffTheme.titleSmall.override(color: ffTheme.secondary, fontWeight: FontWeight.w700)),
          const SizedBox(height: 16),
          Row(
            crossAxisAlignment: CrossAxisAlignment.end,
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              // 2nd place
              _PodiumItem(rank: 2, provider: top[1].key, avg: avgs[1], height: 80, ffTheme: ffTheme),
              const SizedBox(width: 8),
              // 1st place
              _PodiumItem(rank: 1, provider: top[0].key, avg: avgs[0], height: 100, ffTheme: ffTheme),
              const SizedBox(width: 8),
              // 3rd place
              _PodiumItem(rank: 3, provider: top[2].key, avg: avgs[2], height: 60, ffTheme: ffTheme),
            ],
          ),
        ],
      ),
    ).animate().fadeIn(duration: 500.ms);
  }
}

class _PodiumItem extends StatelessWidget {
  const _PodiumItem({required this.rank, required this.provider, required this.avg, required this.height, required this.ffTheme});
  final int rank;
  final String provider;
  final double avg;
  final double height;
  final FlutterFlowTheme ffTheme;

  @override
  Widget build(BuildContext context) {
    final medalColor = rank == 1 ? const Color(0xFFC9EC4B) : rank == 2 ? const Color(0xFFE5E0D5) : const Color(0xFFFFE0CC);
    return Column(
      mainAxisAlignment: MainAxisAlignment.end,
      children: [
        Text(rank == 1 ? '🥇' : rank == 2 ? '🥈' : '🥉', style: const TextStyle(fontSize: 22)),
        const SizedBox(height: 4),
        LogoWidget(provider: provider, size: 36),
        const SizedBox(height: 4),
        Text(avg.toStringAsFixed(1), style: GoogleFonts.rubik(fontSize: 12, fontWeight: FontWeight.w800, color: Colors.white)),
        const SizedBox(height: 4),
        Container(
          width: 80,
          height: height,
          decoration: BoxDecoration(
            color: medalColor,
            borderRadius: const BorderRadius.only(topLeft: Radius.circular(8), topRight: Radius.circular(8)),
          ),
          child: Center(
            child: Text(
              provider.length > 6 ? provider.substring(0, 6) : provider,
              style: GoogleFonts.rubik(fontSize: 10, fontWeight: FontWeight.w700, color: const Color(0xFF0E3A26)),
              textAlign: TextAlign.center,
            ),
          ),
        ),
      ],
    );
  }
}

class _SubBar extends StatelessWidget {
  const _SubBar({required this.label, required this.value, required this.ffTheme});
  final String label;
  final double value;
  final FlutterFlowTheme ffTheme;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        SizedBox(
          width: 44,
          child: Text(label, style: ffTheme.labelSmall),
        ),
        const SizedBox(width: 8),
        Expanded(
          child: ClipRRect(
            borderRadius: BorderRadius.circular(4),
            child: LinearProgressIndicator(
              value: value,
              backgroundColor: ffTheme.alternate,
              valueColor: AlwaysStoppedAnimation(ffTheme.primary.withOpacity(0.7)),
              minHeight: 5,
            ),
          ),
        ),
        const SizedBox(width: 8),
        Text(
          (value * 5).toStringAsFixed(1),
          style: ffTheme.labelSmall.override(fontWeight: FontWeight.w700),
        ),
      ],
    );
  }
}
