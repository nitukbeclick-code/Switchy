import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:provider/provider.dart';
import '../../theme/app_theme.dart';
import '../../core/nav.dart';
import '../../app_state.dart';
import '../../data.dart';
import '../../components/logo_widget/logo_widget.dart';
import '../../services/provider_ratings.dart';

class RatingsWidget extends StatefulWidget {
  const RatingsWidget({super.key});

  @override
  State<RatingsWidget> createState() => _RatingsWidgetState();
}

class _RatingsWidgetState extends State<RatingsWidget> with SingleTickerProviderStateMixin {
  // Review form state
  String? _selectedProvider;
  final _reviewCtrl = TextEditingController();
  bool _submitted = false;
  final Map<String, int> _subRatings = {'price': 0, 'service': 0, 'coverage': 0, 'speed': 0};

  // Leaderboard state
  String _selectedCat = 'הכל';
  String _sortBy = 'rating'; // 'rating' | 'reviews' | 'value'
  late TabController _tabCtrl;

  static const _cats = ['הכל', 'סלולר', 'אינטרנט', 'טלוויזיה', 'חבילה', 'חו"ל'];
  static const _catIds = {'סלולר': 'cellular', 'אינטרנט': 'internet', 'טלוויזיה': 'tv', 'חבילה': 'triple', 'חו"ל': 'abroad'};
  static const _subLabels = {'price': 'מחיר', 'service': 'שירות', 'coverage': 'כיסוי', 'speed': 'מהירות'};

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
    final plans = _selectedCat == 'הכל'
        ? allPlans
        : allPlans.where((p) => p.cat == (_catIds[_selectedCat] ?? '')).toList();

    final map = <String, List<double>>{};
    for (final plan in plans) {
      map.putIfAbsent(plan.provider, () => []).add(plan.rating);
    }
    return map;
  }

  int _totalReviews(String provider) =>
      allPlans.where((p) => p.provider == provider).fold(0, (s, p) => s + p.reviews);

  // Delegates to the shared ProviderRatings helper so the leaderboard and the
  // provider profile compute identical sub-ratings (single source of truth).
  double _subRatingValue(String provider, String key) =>
      ProviderRatings.subRating(provider, key);

  @override
  Widget build(BuildContext context) {
    final ffTheme = AppTheme.of(context);
    final appState = Provider.of<AppState>(context, listen: false);
    final ratings = _providerRatings;

    final sorted = ratings.entries.toList();
    if (_sortBy == 'rating') {
      sorted.sort((a, b) {
        final avgA = a.value.reduce((x, y) => x + y) / a.value.length;
        final avgB = b.value.reduce((x, y) => x + y) / b.value.length;
        return avgB.compareTo(avgA);
      });
    } else if (_sortBy == 'reviews') {
      sorted.sort((a, b) => _totalReviews(b.key).compareTo(_totalReviews(a.key)));
    } else {
      // value = rating / price ratio (guard against zero price)
      sorted.sort((a, b) {
        final avgA = a.value.reduce((x, y) => x + y) / a.value.length;
        final avgB = b.value.reduce((x, y) => x + y) / b.value.length;
        final pricedA = allPlans.where((p) => p.provider == a.key && p.price > 0).map((p) => p.price);
        final pricedB = allPlans.where((p) => p.provider == b.key && p.price > 0).map((p) => p.price);
        final minPriceA = pricedA.isEmpty ? 1 : pricedA.reduce((x, y) => x < y ? x : y);
        final minPriceB = pricedB.isEmpty ? 1 : pricedB.reduce((x, y) => x < y ? x : y);
        return (avgB / minPriceB).compareTo(avgA / minPriceA);
      });
    }

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
              isScrollable: true,
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

              // Sort row
              Row(
                children: [
                  Text('לוח מנצחים', style: ffTheme.titleLarge),
                  const Spacer(),
                  _SortChip(label: 'דירוג', value: 'rating', current: _sortBy, ffTheme: ffTheme, onTap: () => setState(() => _sortBy = 'rating')),
                  const SizedBox(width: 6),
                  _SortChip(label: 'ביקורות', value: 'reviews', current: _sortBy, ffTheme: ffTheme, onTap: () => setState(() => _sortBy = 'reviews')),
                  const SizedBox(width: 6),
                  _SortChip(label: 'מחיר-ערך', value: 'value', current: _sortBy, ffTheme: ffTheme, onTap: () => setState(() => _sortBy = 'value')),
                ],
              ),
              const SizedBox(height: 12),

              // Full leaderboard
              ...sorted.asMap().entries.map((entry) {
                final i = entry.key;
                final provider = entry.value.key;
                final provRatings = entry.value.value;
                final avg = provRatings.reduce((a, b) => a + b) / provRatings.length;
                final totalReviews = _totalReviews(provider);

                return GestureDetector(
                  onTap: () => context.pushNamed('Provider', pathParameters: {'name': provider}),
                  child: Container(
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
                                      Text(avg.toStringAsFixed(1), style: ffTheme.labelSmall.copyWith(fontWeight: FontWeight.w700)),
                                    ],
                                  ),
                                ],
                              ),
                            ),
                            Column(
                              crossAxisAlignment: CrossAxisAlignment.end,
                              children: [
                                Text('$totalReviews', style: ffTheme.titleSmall.copyWith(color: ffTheme.primary)),
                                Text('ביקורות', style: ffTheme.labelSmall),
                              ],
                            ),
                            const SizedBox(width: 6),
                            Icon(Icons.arrow_forward_ios_rounded, size: 14, color: ffTheme.secondaryText),
                          ],
                        ),
                        const SizedBox(height: 12),
                        _SubBar(label: 'מחיר', value: _subRatingValue(provider, 'price') / 5, ffTheme: ffTheme),
                        const SizedBox(height: 6),
                        _SubBar(label: 'שירות', value: _subRatingValue(provider, 'service') / 5, ffTheme: ffTheme),
                        const SizedBox(height: 6),
                        _SubBar(label: 'כיסוי', value: _subRatingValue(provider, 'coverage') / 5, ffTheme: ffTheme),
                        const SizedBox(height: 6),
                        _SubBar(label: 'מהירות', value: _subRatingValue(provider, 'speed') / 5, ffTheme: ffTheme),
                      ],
                    ),
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
                            Icon(Icons.check_circle_rounded, color: ffTheme.success, size: 52)
                                .animate().scale(duration: 500.ms, curve: Curves.elasticOut),
                            const SizedBox(height: 8),
                            Text('תודה! הביקורת נשמרה', style: ffTheme.titleSmall),
                            const SizedBox(height: 4),
                            Text('הביקורת שלך תסייע לאחרים לבחור', style: ffTheme.bodySmall),
                            const SizedBox(height: 16),
                            TextButton(
                              onPressed: () => setState(() {
                                _submitted = false;
                                _selectedProvider = null;
                                _subRatings.updateAll((_, __) => 0);
                                _reviewCtrl.clear();
                              }),
                              child: Text('כתוב ביקורת נוספת', style: ffTheme.labelMedium.copyWith(color: ffTheme.primary)),
                            ),
                          ],
                        ),
                      )
                    else ...[
                      Text('בחר ספק', style: ffTheme.labelLarge),
                      const SizedBox(height: 8),
                      Wrap(
                        spacing: 8,
                        runSpacing: 8,
                        children: sorted.take(10).map((e) {
                          final active = _selectedProvider == e.key;
                          return GestureDetector(
                            onTap: () {
                              final existing = appState.reviewFor(e.key);
                              setState(() {
                                _selectedProvider = e.key;
                                _submitted = false;
                                if (existing != null) {
                                  _subRatings['price'] = existing['price'] as int? ?? 0;
                                  _subRatings['service'] = existing['service'] as int? ?? 0;
                                  _subRatings['coverage'] = existing['coverage'] as int? ?? 0;
                                  _subRatings['speed'] = existing['speed'] as int? ?? 0;
                                  _reviewCtrl.text = existing['text'] as String? ?? '';
                                } else {
                                  _subRatings.updateAll((_, __) => 0);
                                  _reviewCtrl.clear();
                                }
                              });
                            },
                            child: AnimatedContainer(
                              duration: const Duration(milliseconds: 200),
                              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                              decoration: BoxDecoration(
                                color: active ? ffTheme.primary : ffTheme.background,
                                borderRadius: BorderRadius.circular(20),
                                border: Border.all(color: active ? ffTheme.primary : ffTheme.alternate),
                              ),
                              child: Row(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  if (appState.hasReviewedProvider(e.key) && !active)
                                    Padding(
                                      padding: const EdgeInsets.only(left: 4),
                                      child: Icon(Icons.check_circle_rounded, size: 13, color: ffTheme.success),
                                    ),
                                  Text(e.key, style: ffTheme.labelSmall.copyWith(color: active ? Colors.white : ffTheme.primaryText)),
                                ],
                              ),
                            ),
                          );
                        }).toList(),
                      ),

                      const SizedBox(height: 16),
                      Text('דירוג לפי קטגוריה', style: ffTheme.labelLarge),
                      const SizedBox(height: 12),

                      // Multi-dimension star ratings
                      ..._subLabels.entries.map((e) => Padding(
                        padding: const EdgeInsets.only(bottom: 12),
                        child: Row(
                          children: [
                            SizedBox(
                              width: 52,
                              child: Text(e.value, style: ffTheme.labelSmall),
                            ),
                            const SizedBox(width: 8),
                            ...List.generate(5, (j) => GestureDetector(
                              onTap: () => setState(() => _subRatings[e.key] = j + 1),
                              child: Padding(
                                padding: const EdgeInsets.only(left: 3),
                                child: Icon(
                                  j < (_subRatings[e.key] ?? 0) ? Icons.star_rounded : Icons.star_outline_rounded,
                                  size: 28,
                                  color: ffTheme.warning,
                                ),
                              ),
                            )),
                            const Spacer(),
                            if ((_subRatings[e.key] ?? 0) > 0)
                              Text(
                                _ratingLabel(_subRatings[e.key]!),
                                style: ffTheme.labelSmall.copyWith(color: ffTheme.primary, fontWeight: FontWeight.w600),
                              ),
                          ],
                        ),
                      )),

                      const SizedBox(height: 4),
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
                        onPressed: (_selectedProvider != null && _subRatings.values.any((v) => v > 0))
                            ? () {
                                final avg = _subRatings.values.where((v) => v > 0).fold(0, (a, b) => a + b) ~/
                                    _subRatings.values.where((v) => v > 0).length;
                                Provider.of<AppState>(context, listen: false).addReview(
                                  provider: _selectedProvider!,
                                  overall: avg,
                                  subRatings: Map.of(_subRatings),
                                  text: _reviewCtrl.text.trim(),
                                );
                                setState(() => _submitted = true);
                              }
                            : null,
                        icon: const Icon(Icons.send_rounded, size: 18),
                        label: Text(_selectedProvider != null && appState.hasReviewedProvider(_selectedProvider!) ? 'עדכן ביקורת' : 'שלח ביקורת'),
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

              // User's submitted reviews
              if (appState.userReviews.isNotEmpty) ...[
                const SizedBox(height: 8),
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
                          Icon(Icons.history_rounded, color: ffTheme.primary, size: 20),
                          const SizedBox(width: 8),
                          Text('הביקורות שלך', style: ffTheme.titleSmall),
                        ],
                      ),
                      const SizedBox(height: 12),
                      ...appState.userReviews.map((r) {
                        final overall = r['overall'] as int? ?? 0;
                        final text = r['text'] as String? ?? '';
                        return Padding(
                          padding: const EdgeInsets.only(bottom: 12),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Row(
                                children: [
                                  Text(r['provider'] as String, style: ffTheme.labelMedium.copyWith(fontWeight: FontWeight.w700)),
                                  const Spacer(),
                                  ...List.generate(5, (i) => Icon(
                                    i < overall ? Icons.star_rounded : Icons.star_outline_rounded,
                                    size: 14,
                                    color: ffTheme.warning,
                                  )),
                                ],
                              ),
                              if (text.isNotEmpty) ...[
                                const SizedBox(height: 4),
                                Text(text, style: ffTheme.bodySmall, maxLines: 2, overflow: TextOverflow.ellipsis),
                              ],
                              const Divider(height: 16),
                            ],
                          ),
                        );
                      }),
                    ],
                  ),
                ).animate().fadeIn(delay: 400.ms),
              ],

              const SizedBox(height: 24),
            ],
          ),
        ),
      ),
    );
  }

  String _ratingLabel(int r) {
    switch (r) {
      case 1: return 'גרוע';
      case 2: return 'בינוני';
      case 3: return 'סביר';
      case 4: return 'טוב';
      case 5: return 'מצוין';
      default: return '';
    }
  }

  Widget _buildPodium(List<MapEntry<String, List<double>>> top, AppTheme ffTheme) {
    final avgs = top.map((e) => e.value.reduce((a, b) => a + b) / e.value.length).toList();

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        gradient: LinearGradient(colors: [const Color(0xFF0E3A26), ffTheme.primary]),
        borderRadius: BorderRadius.circular(20),
      ),
      child: Column(
        children: [
          Text('מנצחי החודש', style: ffTheme.titleSmall.copyWith(color: ffTheme.secondary, fontWeight: FontWeight.w700)),
          const SizedBox(height: 16),
          Row(
            crossAxisAlignment: CrossAxisAlignment.end,
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              _PodiumItem(rank: 2, provider: top[1].key, avg: avgs[1], height: 80, ffTheme: ffTheme),
              const SizedBox(width: 8),
              _PodiumItem(rank: 1, provider: top[0].key, avg: avgs[0], height: 100, ffTheme: ffTheme),
              const SizedBox(width: 8),
              _PodiumItem(rank: 3, provider: top[2].key, avg: avgs[2], height: 60, ffTheme: ffTheme),
            ],
          ),
        ],
      ),
    ).animate().fadeIn(duration: 500.ms);
  }
}

class _SortChip extends StatelessWidget {
  const _SortChip({required this.label, required this.value, required this.current, required this.ffTheme, required this.onTap});
  final String label, value, current;
  final AppTheme ffTheme;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final active = current == value;
    return GestureDetector(
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 150),
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
        decoration: BoxDecoration(
          color: active ? ffTheme.primary : ffTheme.background,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: active ? ffTheme.primary : ffTheme.alternate),
        ),
        child: Text(label, style: ffTheme.labelSmall.copyWith(
          color: active ? Colors.white : ffTheme.secondaryText,
          fontWeight: active ? FontWeight.w700 : FontWeight.w500,
          fontSize: 11,
        )),
      ),
    );
  }
}

class _PodiumItem extends StatelessWidget {
  const _PodiumItem({required this.rank, required this.provider, required this.avg, required this.height, required this.ffTheme});
  final int rank;
  final String provider;
  final double avg;
  final double height;
  final AppTheme ffTheme;

  @override
  Widget build(BuildContext context) {
    final medalColor = rank == 1 ? const Color(0xFFC9EC4B) : rank == 2 ? const Color(0xFFE5E0D5) : const Color(0xFFFFE0CC);
    return GestureDetector(
      onTap: () => context.pushNamed('Provider', pathParameters: {'name': provider}),
      child: Column(
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
      ),
    );
  }
}

class _SubBar extends StatelessWidget {
  const _SubBar({required this.label, required this.value, required this.ffTheme});
  final String label;
  final double value;
  final AppTheme ffTheme;

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
          style: ffTheme.labelSmall.copyWith(fontWeight: FontWeight.w700),
        ),
      ],
    );
  }
}
