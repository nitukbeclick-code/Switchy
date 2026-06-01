import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:flutter_animate/flutter_animate.dart';
import '../../flutter_flow/flutter_flow_theme.dart';
import '../../flutter_flow/flutter_flow_util.dart';
import '../../flutter_flow/flutter_flow_widgets.dart';
import '../../app_state.dart';
import '../../data.dart';
import '../../models.dart';
import '../../components/logo_widget/logo_widget.dart';

class HomeWidget extends StatefulWidget {
  const HomeWidget({super.key});

  @override
  State<HomeWidget> createState() => _HomeWidgetState();
}

class _HomeWidgetState extends State<HomeWidget> {
  @override
  Widget build(BuildContext context) {
    final ffTheme = FlutterFlowTheme.of(context);
    final appState = Provider.of<FFAppState>(context);
    final bill = appState.currentBill(appState.selectedCat);
    final deal = hotDeal(appState.currentBill('cellular'));

    return Scaffold(
      backgroundColor: ffTheme.background,
      body: CustomScrollView(
        slivers: [
          // Hero header
          SliverToBoxAdapter(
            child: Container(
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
                  padding: const EdgeInsets.fromLTRB(20, 12, 20, 32),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text('שלום, ${appState.firstName}', style: ffTheme.headlineMedium.override(color: Colors.white)),
                              Text('בואו נמצא לכם עסקה טובה יותר', style: ffTheme.bodyMedium.override(color: Colors.white70)),
                            ],
                          ),
                          Container(
                            decoration: BoxDecoration(
                              color: Colors.white.withOpacity(0.15),
                              borderRadius: BorderRadius.circular(12),
                            ),
                            child: IconButton(
                              icon: const Icon(Icons.notifications_outlined, color: Colors.white),
                              onPressed: () {},
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 20),
                      // Savings card
                      if (appState.totalSavings > 0)
                        Container(
                          padding: const EdgeInsets.all(16),
                          decoration: BoxDecoration(
                            color: Colors.white.withOpacity(0.15),
                            borderRadius: BorderRadius.circular(16),
                          ),
                          child: Row(
                            children: [
                              const Text('💰', style: TextStyle(fontSize: 28)),
                              const SizedBox(width: 12),
                              Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text('חסכתם עד כה', style: ffTheme.bodySmall.override(color: Colors.white70)),
                                  Text(formatPrice(appState.totalSavings), style: ffTheme.headlineSmall.override(color: Colors.white)),
                                ],
                              ),
                            ],
                          ),
                        ),
                    ],
                  ),
                ),
              ),
            ),
          ),

          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.all(20),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // Quick quiz CTA
                  _QuizCTA(ffTheme: ffTheme),
                  const SizedBox(height: 24),

                  // Categories
                  Text('קטגוריות', style: ffTheme.titleLarge),
                  const SizedBox(height: 12),
                ],
              ),
            ),
          ),

          // Category grid
          SliverPadding(
            padding: const EdgeInsets.symmetric(horizontal: 20),
            sliver: SliverGrid(
              gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                crossAxisCount: 3,
                crossAxisSpacing: 12,
                mainAxisSpacing: 12,
                childAspectRatio: 0.9,
              ),
              delegate: SliverChildBuilderDelegate(
                (ctx, i) => _CategoryCard(category: categories[i], ffTheme: ffTheme),
                childCount: categories.length,
              ),
            ),
          ),

          // Hot deal
          if (deal != null)
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(20, 24, 20, 0),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        const Text('🔥', style: TextStyle(fontSize: 20)),
                        const SizedBox(width: 8),
                        Text('עסקה חמה', style: ffTheme.titleLarge),
                      ],
                    ),
                    const SizedBox(height: 12),
                    _HotDealCard(plan: deal, ffTheme: ffTheme),
                  ],
                ),
              ),
            ),

          const SliverToBoxAdapter(child: SizedBox(height: 24)),
        ],
      ),
    );
  }
}

class _QuizCTA extends StatelessWidget {
  const _QuizCTA({required this.ffTheme});
  final FlutterFlowTheme ffTheme;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: () => context.goNamed('Quiz'),
      child: Container(
        padding: const EdgeInsets.all(20),
        decoration: BoxDecoration(
          color: ffTheme.secondary,
          borderRadius: BorderRadius.circular(20),
        ),
        child: Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('גלו כמה תוכלו לחסוך', style: ffTheme.titleMedium.override(color: ffTheme.primary)),
                  const SizedBox(height: 4),
                  Text('שאלון קצר – 2 דקות', style: ffTheme.bodySmall.override(color: ffTheme.primary.withOpacity(0.7))),
                ],
              ),
            ),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
              decoration: BoxDecoration(
                color: ffTheme.primary,
                borderRadius: BorderRadius.circular(12),
              ),
              child: Text('התחילו', style: ffTheme.labelLarge.override(color: Colors.white)),
            ),
          ],
        ),
      ).animate().fadeIn().slideX(begin: 0.1, end: 0),
    );
  }
}

class _CategoryCard extends StatelessWidget {
  const _CategoryCard({required this.category, required this.ffTheme});
  final Category category;
  final FlutterFlowTheme ffTheme;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: () {
        Provider.of<FFAppState>(context, listen: false).setCategory(category.id);
        context.goNamed('Results');
      },
      child: Container(
        decoration: BoxDecoration(
          color: ffTheme.secondaryBackground,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: ffTheme.alternate),
        ),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Text(category.icon, style: const TextStyle(fontSize: 28)),
            const SizedBox(height: 8),
            Text(category.name, style: ffTheme.labelMedium, textAlign: TextAlign.center),
            const SizedBox(height: 4),
            Text('מ-₪${category.currentBill}', style: ffTheme.labelSmall.override(color: ffTheme.secondaryText)),
          ],
        ),
      ),
    );
  }
}

class _HotDealCard extends StatelessWidget {
  const _HotDealCard({required this.plan, required this.ffTheme});
  final Plan plan;
  final FlutterFlowTheme ffTheme;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: () => context.pushNamed('PlanDetail', pathParameters: {'planId': plan.id}),
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: ffTheme.secondaryBackground,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: ffTheme.alternate),
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
                ],
              ),
            ),
            Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Text('₪${plan.price}/חודש', style: ffTheme.titleMedium.override(color: ffTheme.primary)),
                Text('חסכו ${formatPrice(planSaveYear(plan, 119))}/שנה', style: ffTheme.labelSmall.override(color: ffTheme.success)),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
