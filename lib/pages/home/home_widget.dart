import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:flutter_animate/flutter_animate.dart';
import '../../flutter_flow/flutter_flow_theme.dart';
import '../../flutter_flow/flutter_flow_util.dart';
import '../../app_state.dart';
import '../../data.dart';
import '../../models.dart';
import '../../components/logo_widget/logo_widget.dart';
import 'home_model.dart';

class HomeWidget extends StatefulWidget {
  const HomeWidget({super.key});

  @override
  State<HomeWidget> createState() => _HomeWidgetState();
}

class _HomeWidgetState extends State<HomeWidget> {
  late HomeModel _model;
  final ScrollController _scrollController = ScrollController();

  @override
  void initState() {
    super.initState();
    _model = createModel(context, HomeModel.new);
    _model.startTicker(setState);
  }

  @override
  void dispose() {
    _model.dispose();
    _scrollController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final ffTheme = FlutterFlowTheme.of(context);
    final appState = Provider.of<FFAppState>(context);
    final deal = hotDeal(appState.currentBill('cellular'));

    return Scaffold(
      backgroundColor: ffTheme.background,
      body: Stack(
        children: [
          // ── Main scrollable content ────────────────────────────────────────
          CustomScrollView(
            controller: _scrollController,
            slivers: [
              // ── 1. Green gradient header ───────────────────────────────────
              SliverToBoxAdapter(child: _buildHeader(context, ffTheme, appState)),

              // ── 2. Social proof ticker ─────────────────────────────────────
              SliverToBoxAdapter(child: _buildTicker(context, ffTheme)),

              // ── 3. Savings hero card ───────────────────────────────────────
              SliverToBoxAdapter(child: _buildSavingsHero(context, ffTheme)),

              // ── 4. Hot deal card ───────────────────────────────────────────
              if (deal != null)
                SliverToBoxAdapter(child: _buildHotDeal(context, ffTheme, deal)),

              // ── 5. Category grid ───────────────────────────────────────────
              SliverToBoxAdapter(child: _buildCategoryGrid(context, ffTheme, appState)),

              // ── 6. AI advisor card ─────────────────────────────────────────
              SliverToBoxAdapter(child: _buildAIAdvisor(context, ffTheme)),

              // ── 7. Tools quick-action row ──────────────────────────────────
              SliverToBoxAdapter(child: _buildToolsRow(context, ffTheme)),

              // ── 8. Brand trust strip ───────────────────────────────────────
              SliverToBoxAdapter(child: _buildBrandStrip(context, ffTheme)),

              // ── 10. Bottom padding for nav + FAB ──────────────────────────
              const SliverToBoxAdapter(child: SizedBox(height: 100)),
            ],
          ),

          // ── 9. Callback FAB ────────────────────────────────────────────────
          Positioned(
            bottom: 24,
            left: 20,
            child: FloatingActionButton(
              backgroundColor: ffTheme.secondary,
              elevation: 4,
              onPressed: () => context.pushNamed('Callback'),
              child: Icon(Icons.phone_rounded, color: ffTheme.primary, size: 26),
            ),
          ),

          // ── Compare tray ───────────────────────────────────────────────────
          if (appState.comparePlans.isNotEmpty)
            Positioned(
              bottom: 24,
              right: 16,
              left: 76,
              child: GestureDetector(
                onTap: () => context.goNamed('Compare'),
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                  decoration: BoxDecoration(
                    color: ffTheme.primary,
                    borderRadius: BorderRadius.circular(16),
                    boxShadow: [BoxShadow(color: ffTheme.primary.withOpacity(0.35), blurRadius: 14, offset: const Offset(0, 4))],
                  ),
                  child: Row(
                    children: [
                      Icon(Icons.compare_arrows_rounded, color: ffTheme.secondary, size: 20),
                      const SizedBox(width: 8),
                      Text('השווה ${appState.comparePlans.length} מסלולים', style: ffTheme.titleSmall.override(color: Colors.white)),
                      const Spacer(),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                        decoration: BoxDecoration(color: ffTheme.secondary, borderRadius: BorderRadius.circular(8)),
                        child: Text('←', style: ffTheme.labelMedium.override(color: ffTheme.primary, fontWeight: FontWeight.w800)),
                      ),
                    ],
                  ),
                ),
              ).animate().slideY(begin: 1, end: 0, duration: 300.ms, curve: Curves.easeOutCubic),
            ),
        ],
      ),
    );
  }

  // ── Section builders ─────────────────────────────────────────────────────

  Widget _buildHeader(BuildContext context, FlutterFlowTheme ffTheme, FFAppState appState) {
    return Container(
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topRight,
          end: Alignment.bottomLeft,
          colors: [ffTheme.primary, ffTheme.tertiary],
        ),
      ),
      child: SafeArea(
        bottom: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 14, 20, 28),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              // Left: greeting
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      '${_greeting()} ${appState.firstName} 👋',
                      style: FlutterFlowTheme.of(context).headlineSmall.override(
                        color: Colors.white,
                        fontSize: 22,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      'בואו נחסוך יחד',
                      style: FlutterFlowTheme.of(context).bodyMedium.override(
                        color: Colors.white.withOpacity(0.70),
                        fontSize: 14,
                      ),
                    ),
                  ],
                ),
              ),
              // Right: notification bell
              Container(
                width: 44,
                height: 44,
                decoration: BoxDecoration(
                  color: Colors.white.withOpacity(0.10),
                  shape: BoxShape.circle,
                ),
                child: IconButton(
                  icon: const Icon(Icons.notifications_outlined, color: Colors.white, size: 22),
                  onPressed: () {},
                  padding: EdgeInsets.zero,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildTicker(BuildContext context, FlutterFlowTheme ffTheme) {
    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.06),
            blurRadius: 8,
            offset: const Offset(0, 2),
          ),
        ],
        border: const Border(
          right: BorderSide(color: Color(0xFFC9EC4B), width: 3),
        ),
      ),
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      child: AnimatedSwitcher(
        duration: const Duration(milliseconds: 400),
        transitionBuilder: (child, animation) => FadeTransition(opacity: animation, child: child),
        child: Text(
          _model.tickers[_model.tickerIndex],
          key: ValueKey(_model.tickerIndex),
          style: FlutterFlowTheme.of(context).labelMedium.override(
            color: FlutterFlowTheme.of(context).primaryText,
            fontSize: 13,
            fontWeight: FontWeight.w600,
          ),
          textAlign: TextAlign.right,
        ),
      ),
    );
  }

  Widget _buildSavingsHero(BuildContext context, FlutterFlowTheme ffTheme) {
    final appState = Provider.of<FFAppState>(context, listen: false);
    // Calculate actual potential savings from all categories
    final totalSave = categories.fold<int>(0, (sum, c) {
      final bill = appState.currentBill(c.id);
      if (bill <= 0) return sum;
      final plans = plansByCat(c.id);
      if (plans.isEmpty) return sum;
      final minPrice = plans.map((p) => p.price).reduce((a, b) => a < b ? a : b);
      return sum + ((bill - minPrice) * 12).clamp(0, 999999);
    });
    final display = totalSave > 0 ? '₪${(totalSave / 1000).toStringAsFixed(1)}K' : '₪1,240+';

    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(
        color: const Color(0xFF0E3A26),
        borderRadius: BorderRadius.circular(20),
      ),
      child: Column(
        children: [
          Text(
            'חיסכון פוטנציאלי שנתי',
            style: ffTheme.labelMedium.override(color: Colors.white.withOpacity(0.60)),
          ),
          const SizedBox(height: 8),
          Text(
            display,
            style: ffTheme.displaySmall.override(
              color: ffTheme.secondary,
              fontWeight: FontWeight.bold,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            totalSave > 0 ? 'חיסכון מחושב לפי חשבונות שלכם' : 'ממוצע לקוחות חוסך',
            style: ffTheme.bodySmall.override(color: Colors.white.withOpacity(0.50)),
          ),
          const SizedBox(height: 20),
          GestureDetector(
            onTap: () => context.goNamed('Quiz'),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
              decoration: BoxDecoration(
                color: ffTheme.secondary,
                borderRadius: BorderRadius.circular(12),
              ),
              child: Text(
                totalSave > 0 ? 'חפש חבילות ←' : 'בדוק כמה תחסוך ←',
                style: ffTheme.titleSmall.override(color: ffTheme.primary),
              ),
            ),
          ),
        ],
      ),
    )
        .animate()
        .fadeIn(duration: 600.ms)
        .scale(begin: const Offset(0.95, 0.95), end: const Offset(1.0, 1.0));
  }

  Widget _buildHotDeal(BuildContext context, FlutterFlowTheme ffTheme, Plan deal) {
    final saving = planSaveYear(deal, 119);
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 4, 16, 4),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: Row(
              children: [
                const Text('🔥', style: TextStyle(fontSize: 18)),
                const SizedBox(width: 6),
                Text('עסקה חמה היום', style: ffTheme.titleLarge),
              ],
            ),
          ),
          GestureDetector(
            onTap: () => context.pushNamed('PlanDetail', pathParameters: {'planId': deal.id}),
            child: Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(16),
                border: Border.all(color: ffTheme.alternate),
                boxShadow: [
                  BoxShadow(
                    color: Colors.black.withOpacity(0.05),
                    blurRadius: 10,
                    offset: const Offset(0, 2),
                  ),
                ],
              ),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.center,
                children: [
                  LogoWidget(provider: deal.provider, size: 52),
                  const SizedBox(width: 14),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(deal.provider, style: ffTheme.titleSmall),
                        const SizedBox(height: 2),
                        Text(deal.plan, style: ffTheme.bodySmall, maxLines: 1, overflow: TextOverflow.ellipsis),
                        const SizedBox(height: 6),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                          decoration: BoxDecoration(
                            color: const Color(0xFFC9EC4B),
                            borderRadius: BorderRadius.circular(6),
                          ),
                          child: Text(
                            'חוסך ₪$saving/שנה',
                            style: ffTheme.labelSmall.override(
                              color: ffTheme.primary,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: [
                      Text(
                        '₪${deal.price}/חודש',
                        style: ffTheme.titleMedium.override(color: ffTheme.primary),
                      ),
                      const SizedBox(height: 8),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                        decoration: BoxDecoration(
                          color: ffTheme.primary,
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: Text(
                          'ראה עסקה ←',
                          style: ffTheme.labelSmall.override(color: Colors.white),
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildCategoryGrid(BuildContext context, FlutterFlowTheme ffTheme, FFAppState appState) {
    // Savings estimates per category (annual)
    final savingsEst = {
      'cellular': 850,
      'internet': 480,
      'tv': 360,
      'triple': 1200,
      'abroad': 240,
    };

    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 4),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('השוואה לפי קטגוריה', style: ffTheme.titleLarge),
          const SizedBox(height: 12),
          GridView.builder(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
              crossAxisCount: 2,
              crossAxisSpacing: 12,
              mainAxisSpacing: 12,
              childAspectRatio: 1.6,
            ),
            itemCount: categories.length,
            itemBuilder: (context, i) {
              final cat = categories[i];
              final isActive = appState.selectedCat == cat.id;
              final est = savingsEst[cat.id] ?? 0;
              return GestureDetector(
                onTap: () {
                  appState.setCategory(cat.id);
                  context.goNamed('Results');
                },
                child: Container(
                  padding: const EdgeInsets.all(14),
                  decoration: BoxDecoration(
                    color: isActive ? const Color(0xFFE8F5EE) : Colors.white,
                    borderRadius: BorderRadius.circular(14),
                    border: Border.all(
                      color: isActive ? ffTheme.primary : ffTheme.alternate,
                      width: isActive ? 2 : 1,
                    ),
                    boxShadow: [
                      BoxShadow(
                        color: Colors.black.withOpacity(0.04),
                        blurRadius: 6,
                        offset: const Offset(0, 1),
                      ),
                    ],
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Text(cat.icon, style: const TextStyle(fontSize: 24)),
                      const SizedBox(height: 4),
                      Text(cat.name, style: ffTheme.labelLarge.override(color: ffTheme.primaryText)),
                      const SizedBox(height: 2),
                      Text('${cat.planCount} מסלולים', style: ffTheme.labelSmall),
                      Text('חיסכון ממוצע ₪$est', style: ffTheme.labelSmall.override(color: ffTheme.primary)),
                    ],
                  ),
                )
                    .animate(delay: (i * 80).ms)
                    .fadeIn()
                    .slideY(begin: 0.2, end: 0),
              );
            },
          ),
        ],
      ),
    );
  }

  Widget _buildAIAdvisor(BuildContext context, FlutterFlowTheme ffTheme) {
    return GestureDetector(
      onTap: () => context.pushNamed('AIAdvisor'),
      child: Container(
        margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        padding: const EdgeInsets.all(20),
        decoration: BoxDecoration(
          gradient: const LinearGradient(
            colors: [Color(0xFF0E3A26), Color(0xFF1E7A4E)],
            begin: Alignment.centerRight,
            end: Alignment.centerLeft,
          ),
          borderRadius: BorderRadius.circular(20),
        ),
        child: Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                    decoration: BoxDecoration(
                      color: ffTheme.secondary,
                      borderRadius: BorderRadius.circular(6),
                    ),
                    child: Text(
                      '✦ חוסך AI',
                      style: ffTheme.labelSmall.override(color: ffTheme.primary, fontWeight: FontWeight.w700),
                    ),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    'שאלו אותנו הכל\nעל מסלולי תקשורת',
                    style: ffTheme.titleMedium.override(color: Colors.white),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    'זמין 24/7 · עונה תוך שניות',
                    style: ffTheme.bodySmall.override(color: Colors.white.withOpacity(0.60)),
                  ),
                ],
              ),
            ),
            Icon(Icons.chat_bubble_rounded, color: ffTheme.secondary, size: 40),
          ],
        ),
      ),
    ).animate().fadeIn(delay: 400.ms);
  }

  Widget _buildToolsRow(BuildContext context, FlutterFlowTheme ffTheme) {
    final tools = [
      _Tool(icon: '📍', label: 'בדיקת כיסוי', route: 'Availability'),
      _Tool(icon: '🧮', label: 'מחשבון מעבר', route: 'SwitchCalc'),
      _Tool(icon: '📊', label: 'ניהול חשבון', route: 'Bills'),
      _Tool(icon: '📲', label: 'ניוד מספר', route: 'Porting'),
    ];

    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 8, 0, 4),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.only(right: 0, bottom: 12),
            child: Text('כלים שימושיים', style: ffTheme.titleLarge),
          ),
          SizedBox(
            height: 96,
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              itemCount: tools.length,
              separatorBuilder: (_, __) => const SizedBox(width: 12),
              itemBuilder: (context, i) {
                final tool = tools[i];
                return GestureDetector(
                  onTap: () => context.pushNamed(tool.route),
                  child: Container(
                    width: 110,
                    padding: const EdgeInsets.all(14),
                    decoration: BoxDecoration(
                      color: Colors.white,
                      borderRadius: BorderRadius.circular(14),
                      border: Border.all(color: ffTheme.alternate),
                      boxShadow: [
                        BoxShadow(
                          color: Colors.black.withOpacity(0.04),
                          blurRadius: 6,
                          offset: const Offset(0, 1),
                        ),
                      ],
                    ),
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Text(tool.icon, style: const TextStyle(fontSize: 26)),
                        const SizedBox(height: 6),
                        Text(
                          tool.label,
                          style: ffTheme.labelSmall.override(color: ffTheme.primaryText),
                          textAlign: TextAlign.center,
                          maxLines: 2,
                        ),
                      ],
                    ),
                  ),
                );
              },
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildBrandStrip(BuildContext context, FlutterFlowTheme ffTheme) {
    final providers = [
      _Provider('פלאפון', const Color(0xFFE07034), const Color(0xFFFFF3EC)),
      _Provider('סלקום', const Color(0xFFCC2244), const Color(0xFFFFECF0)),
      _Provider('פרטנר', const Color(0xFF2255CC), const Color(0xFFEEF2FF)),
      _Provider('הוט', const Color(0xFF8B1A1A), const Color(0xFFFFECEC)),
      _Provider('yes', const Color(0xFF1A3A7A), const Color(0xFFEEF0FF)),
      _Provider('בזק', const Color(0xFF007B8A), const Color(0xFFECFAFB)),
      _Provider('גולן', const Color(0xFF15603E), const Color(0xFFE8F5EE)),
      _Provider('019', const Color(0xFF6B35C8), const Color(0xFFF3EEFF)),
      _Provider('FreeTV', const Color(0xFF1A7A4E), const Color(0xFFE8F8EE)),
    ];

    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 16, 0, 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: Text('כל הספקים הגדולים', style: ffTheme.titleLarge),
          ),
          SizedBox(
            height: 44,
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              itemCount: providers.length,
              separatorBuilder: (_, __) => const SizedBox(width: 8),
              itemBuilder: (context, i) {
                final p = providers[i];
                return Container(
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                  decoration: BoxDecoration(
                    color: p.bg,
                    borderRadius: BorderRadius.circular(20),
                    border: Border.all(color: p.color.withOpacity(0.25)),
                  ),
                  child: Text(
                    p.name,
                    style: ffTheme.labelMedium.override(
                      color: p.color,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}

// ── Helper data classes ────────────────────────────────────────────────────────

String _greeting() {
  final h = DateTime.now().hour;
  if (h < 12) return 'בוקר טוב,';
  if (h < 17) return 'צהריים טובים,';
  if (h < 21) return 'ערב טוב,';
  return 'לילה טוב,';
}

class _Tool {
  const _Tool({required this.icon, required this.label, required this.route});
  final String icon;
  final String label;
  final String route;
}

class _Provider {
  const _Provider(this.name, this.color, this.bg);
  final String name;
  final Color color;
  final Color bg;
}
