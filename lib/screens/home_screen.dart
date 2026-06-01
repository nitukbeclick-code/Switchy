import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import '../theme.dart';
import '../state.dart';
import '../data.dart';
import '../models.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  int _tickerIndex = 0;
  final List<String> _tickers = [
    'מאיה מתל אביב חסכה ₪540 לפני 8 דקות',
    'יוסי מחיפה עבר לפרטנר וחסך ₪720 לשנה',
    'רחל מירושלים חסכה ₪480 על אינטרנט',
    'דוד מבאר שבע מצא מסלול ב-₪39 במקום ₪119',
    'נועה מתל אביב חסכה ₪960 בשנה על חבילה משולבת',
  ];

  @override
  void initState() {
    super.initState();
    _startTicker();
  }

  void _startTicker() async {
    while (mounted) {
      await Future.delayed(const Duration(seconds: 4));
      if (mounted) {
        setState(() {
          _tickerIndex = (_tickerIndex + 1) % _tickers.length;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final appState = context.watch<AppState>();
    final totalSavings = appState.totalAnnualSavings;

    return Scaffold(
      backgroundColor: AppColors.paper,
      body: Stack(
        children: [
          CustomScrollView(
            slivers: [
              SliverToBoxAdapter(child: _buildHeader(appState, totalSavings)),
              SliverToBoxAdapter(child: _buildTicker()),
              SliverToBoxAdapter(
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const SizedBox(height: 16),
                      _buildSavingsHero(totalSavings),
                      const SizedBox(height: 20),
                      _buildHotDeal(appState),
                      const SizedBox(height: 20),
                      _buildCategorySection(appState),
                      const SizedBox(height: 20),
                      _buildAICard(),
                      const SizedBox(height: 100),
                    ],
                  ),
                ),
              ),
            ],
          ),
          _buildCallbackFab(),
        ],
      ),
    );
  }

  Widget _buildHeader(AppState appState, int totalSavings) {
    final statusBarH = MediaQuery.of(context).padding.top;
    return Container(
      color: AppColors.green,
      padding: EdgeInsets.fromLTRB(20, statusBarH + 16, 20, 24),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  appState.isLoggedIn
                      ? 'שלום, ${appState.userName}!'
                      : 'שלום! 👋',
                  style: const TextStyle(
                    fontFamily: 'Rubik',
                    fontSize: 24,
                    fontWeight: FontWeight.w800,
                    color: Colors.white,
                    letterSpacing: -0.3,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  'מצאו את המסלול הכי משתלם',
                  style: TextStyle(
                    fontSize: 15,
                    color: Colors.white.withOpacity(0.8),
                  ),
                ),
              ],
            ),
          ),
          GestureDetector(
            onTap: () => context.push('/quiz'),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
              decoration: BoxDecoration(
                color: AppColors.lime,
                borderRadius: BorderRadius.circular(12),
              ),
              child: const Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text('✨', style: TextStyle(fontSize: 16)),
                  SizedBox(width: 6),
                  Text(
                    'שאלון',
                    style: TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.w800,
                      color: AppColors.greenDark,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildTicker() {
    return Container(
      color: AppColors.greenDark,
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 9),
      child: Row(
        children: [
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
            decoration: BoxDecoration(
              color: AppColors.lime,
              borderRadius: BorderRadius.circular(4),
            ),
            child: const Text(
              'חי',
              style: TextStyle(
                fontSize: 11,
                fontWeight: FontWeight.w800,
                color: AppColors.greenDark,
              ),
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: AnimatedSwitcher(
              duration: const Duration(milliseconds: 400),
              child: Text(
                _tickers[_tickerIndex],
                key: ValueKey(_tickerIndex),
                style: TextStyle(
                  fontSize: 13,
                  color: Colors.white.withOpacity(0.9),
                ),
                overflow: TextOverflow.ellipsis,
              ),
            ),
          ),
          const SizedBox(width: 8),
          Icon(
            Icons.arrow_back_ios_rounded,
            size: 12,
            color: Colors.white.withOpacity(0.5),
          ),
        ],
      ),
    );
  }

  Widget _buildSavingsHero(int totalSavings) {
    return GestureDetector(
      onTap: () => context.push('/results'),
      child: Container(
        padding: const EdgeInsets.all(20),
        decoration: BoxDecoration(
          gradient: const LinearGradient(
            colors: [Color(0xFF0E3A26), Color(0xFF15603E)],
            begin: Alignment.topRight,
            end: Alignment.bottomLeft,
          ),
          borderRadius: BorderRadius.circular(20),
          boxShadow: [
            BoxShadow(
              color: AppColors.green.withOpacity(0.3),
              blurRadius: 16,
              offset: const Offset(0, 6),
            ),
          ],
        ),
        child: Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'חיסכון משוער שנתי',
                    style: TextStyle(
                      color: Colors.white.withOpacity(0.7),
                      fontSize: 13,
                    ),
                  ),
                  const SizedBox(height: 6),
                  Text(
                    '₪${totalSavings > 0 ? totalSavings : '1,240'}',
                    style: const TextStyle(
                      fontFamily: 'Rubik',
                      color: Color(0xFFC9EC4B),
                      fontSize: 38,
                      fontWeight: FontWeight.w800,
                      letterSpacing: -1,
                    ),
                  ),
                  const SizedBox(height: 8),
                  Container(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                    decoration: BoxDecoration(
                      color: Colors.white.withOpacity(0.15),
                      borderRadius: BorderRadius.circular(20),
                    ),
                    child: const Text(
                      'לחצו לראות איך ←',
                      style: TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                        color: Colors.white,
                      ),
                    ),
                  ),
                ],
              ),
            ),
            const Text('💰', style: TextStyle(fontSize: 48)),
          ],
        ),
      ),
    );
  }

  Widget _buildHotDeal(AppState appState) {
    final plans = plansByCategory('cellular');
    if (plans.isEmpty) return const SizedBox.shrink();
    final best = plans.firstWhere((p) => p.best, orElse: () => plans.first);
    final savings = best.savingsPerYear(appState.currentBills['cellular'] ?? 119);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            const Text('🔥', style: TextStyle(fontSize: 18)),
            const SizedBox(width: 6),
            const Text(
              'העסקה הכי חמה',
              style: TextStyle(
                fontFamily: 'Rubik',
                fontSize: 17,
                fontWeight: FontWeight.w700,
                color: AppColors.ink,
              ),
            ),
          ],
        ),
        const SizedBox(height: 10),
        GestureDetector(
          onTap: () => context.push('/plan/${best.id}'),
          child: Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: AppColors.card,
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: AppColors.lime.withOpacity(0.5), width: 1.5),
              boxShadow: [
                BoxShadow(
                  color: Colors.black.withOpacity(0.04),
                  blurRadius: 8,
                ),
              ],
            ),
            child: Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        best.provider,
                        style: const TextStyle(
                          fontFamily: 'Rubik',
                          fontSize: 17,
                          fontWeight: FontWeight.w800,
                          color: AppColors.ink,
                        ),
                      ),
                      Text(
                        best.plan,
                        style: const TextStyle(
                          fontSize: 13,
                          color: AppColors.inkMuted,
                        ),
                      ),
                      const SizedBox(height: 8),
                      Row(
                        children: [
                          Text(
                            best.displayPrice,
                            style: const TextStyle(
                              fontFamily: 'Rubik',
                              fontSize: 22,
                              fontWeight: FontWeight.w800,
                              color: AppColors.green,
                            ),
                          ),
                          Text(
                            '/חודש',
                            style: TextStyle(
                              fontSize: 13,
                              color: AppColors.inkMuted,
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
                Column(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    if (savings > 0)
                      Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 10, vertical: 5),
                        decoration: BoxDecoration(
                          color: AppColors.lime,
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: Text(
                          '₪$savings לשנה',
                          style: const TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.w800,
                            color: AppColors.greenDark,
                          ),
                        ),
                      ),
                    const SizedBox(height: 8),
                    Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 12, vertical: 8),
                      decoration: BoxDecoration(
                        color: AppColors.green,
                        borderRadius: BorderRadius.circular(10),
                      ),
                      child: const Text(
                        'לפרטים',
                        style: TextStyle(
                          fontSize: 13,
                          fontWeight: FontWeight.w700,
                          color: Colors.white,
                        ),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildCategorySection(AppState appState) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text(
          'קטגוריות',
          style: TextStyle(
            fontFamily: 'Rubik',
            fontSize: 17,
            fontWeight: FontWeight.w700,
            color: AppColors.ink,
          ),
        ),
        const SizedBox(height: 12),
        GridView.count(
          crossAxisCount: 2,
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          crossAxisSpacing: 10,
          mainAxisSpacing: 10,
          childAspectRatio: 1.55,
          children: kCategories.map((cat) {
            final count = plansByCategory(cat.id).length;
            final minPrice = plansByCategory(cat.id)
                .map((p) => p.price ?? 999.0)
                .reduce((a, b) => a < b ? a : b);

            return GestureDetector(
              onTap: () {
                appState.setCat(cat.id);
                context.push('/results');
              },
              child: Container(
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(
                  color: AppColors.card,
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(color: AppColors.border),
                  boxShadow: [
                    BoxShadow(
                      color: Colors.black.withOpacity(0.03),
                      blurRadius: 6,
                    ),
                  ],
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(cat.icon, style: const TextStyle(fontSize: 24)),
                    const Spacer(),
                    Text(
                      cat.name,
                      style: const TextStyle(
                        fontFamily: 'Rubik',
                        fontSize: 14,
                        fontWeight: FontWeight.w700,
                        color: AppColors.ink,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      '$count מסלולים • מ-₪${minPrice.toInt()}',
                      style: const TextStyle(
                        fontSize: 11,
                        color: AppColors.inkMuted,
                      ),
                    ),
                  ],
                ),
              ),
            );
          }).toList(),
        ),
      ],
    );
  }

  Widget _buildAICard() {
    return GestureDetector(
      onTap: () => context.push('/advisor'),
      child: Container(
        padding: const EdgeInsets.all(20),
        decoration: BoxDecoration(
          gradient: const LinearGradient(
            colors: [Color(0xFF15603E), Color(0xFF1E7A4E)],
            begin: Alignment.topRight,
            end: Alignment.bottomLeft,
          ),
          borderRadius: BorderRadius.circular(18),
        ),
        child: Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 8, vertical: 3),
                        decoration: BoxDecoration(
                          color: AppColors.lime,
                          borderRadius: BorderRadius.circular(6),
                        ),
                        child: const Text(
                          '✦ AI',
                          style: TextStyle(
                            fontSize: 11,
                            fontWeight: FontWeight.w800,
                            color: AppColors.greenDark,
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  const Text(
                    'יועץ חוסך AI',
                    style: TextStyle(
                      fontFamily: 'Rubik',
                      fontSize: 18,
                      fontWeight: FontWeight.w800,
                      color: Colors.white,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    'שאלו אותי ואמצא לכם את המסלול המושלם',
                    style: TextStyle(
                      fontSize: 13,
                      color: Colors.white.withOpacity(0.8),
                    ),
                  ),
                ],
              ),
            ),
            Container(
              width: 48,
              height: 48,
              decoration: BoxDecoration(
                color: Colors.white.withOpacity(0.2),
                shape: BoxShape.circle,
              ),
              child: const Center(
                child: Text('🤖', style: TextStyle(fontSize: 24)),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildCallbackFab() {
    return Positioned(
      bottom: 80,
      left: 16,
      child: GestureDetector(
        onTap: () => context.push('/callback'),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
          decoration: BoxDecoration(
            color: AppColors.green,
            borderRadius: BorderRadius.circular(30),
            boxShadow: [
              BoxShadow(
                color: AppColors.green.withOpacity(0.4),
                blurRadius: 12,
                offset: const Offset(0, 4),
              ),
            ],
          ),
          child: const Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(Icons.phone_rounded, color: Colors.white, size: 18),
              SizedBox(width: 6),
              Text(
                'חזרו אליי',
                style: TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w700,
                  color: Colors.white,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
