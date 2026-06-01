import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import '../theme.dart';
import '../state.dart';
import '../data.dart';
import '../models.dart';
import '../widgets/logo_widget.dart';
import '../widgets/stars_widget.dart';

class PlanDetailScreen extends StatefulWidget {
  final String planId;
  const PlanDetailScreen({super.key, required this.planId});

  @override
  State<PlanDetailScreen> createState() => _PlanDetailScreenState();
}

class _PlanDetailScreenState extends State<PlanDetailScreen> {
  bool _priceMonitor = false;
  bool _fineExpanded = false;

  @override
  Widget build(BuildContext context) {
    final plan = planById(widget.planId);
    if (plan == null) {
      return Scaffold(
        body: Center(child: Text('מסלול לא נמצא')),
      );
    }

    final appState = context.watch<AppState>();
    final bill = appState.currentBills[plan.cat] ?? 0;
    final savings = plan.savingsPerYear(bill);

    return Scaffold(
      backgroundColor: AppColors.paper,
      body: Stack(
        children: [
          CustomScrollView(
            slivers: [
              SliverToBoxAdapter(child: _buildHeader(plan)),
              SliverToBoxAdapter(
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      _buildPriceHero(plan, savings),
                      const SizedBox(height: 16),
                      if (savings > 0) ...[
                        _buildSavingsCard(savings),
                        const SizedBox(height: 16),
                      ],
                      _buildFeatsList(plan),
                      const SizedBox(height: 16),
                      _buildPricingTable(plan),
                      if (plan.priceWarn != null) ...[
                        const SizedBox(height: 16),
                        _buildWarningCard(plan.priceWarn!),
                      ],
                      const SizedBox(height: 16),
                      _buildRatingsSection(plan),
                      const SizedBox(height: 16),
                      _buildPriceMonitor(),
                      if (plan.fine != null) ...[
                        const SizedBox(height: 16),
                        _buildFineprint(plan.fine!),
                      ],
                      const SizedBox(height: 100),
                    ],
                  ),
                ),
              ),
            ],
          ),
          _buildStickyBottom(plan),
        ],
      ),
    );
  }

  Widget _buildHeader(Plan plan) {
    final statusH = MediaQuery.of(context).padding.top;
    return Container(
      color: AppColors.green,
      padding: EdgeInsets.fromLTRB(16, statusH + 12, 16, 20),
      child: Column(
        children: [
          Row(
            children: [
              GestureDetector(
                onTap: () => context.pop(),
                child: const Icon(Icons.arrow_back_ios_rounded,
                    color: Colors.white, size: 20),
              ),
              const Spacer(),
              Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                decoration: BoxDecoration(
                  color: Colors.white.withOpacity(0.2),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: const Text(
                  'שתף',
                  style: TextStyle(
                    fontSize: 13,
                    color: Colors.white,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),
          Row(
            children: [
              LogoWidget(
                  provider: plan.provider, size: 56, fontSize: 22),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      plan.provider,
                      style: const TextStyle(
                        fontFamily: 'Rubik',
                        fontSize: 20,
                        fontWeight: FontWeight.w800,
                        color: Colors.white,
                      ),
                    ),
                    Text(
                      plan.plan,
                      style: TextStyle(
                        fontSize: 14,
                        color: Colors.white.withOpacity(0.8),
                      ),
                    ),
                    const SizedBox(height: 6),
                    StarsWidget(
                      rating: plan.rating,
                      reviews: plan.reviews,
                      starSize: 14,
                    ),
                  ],
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildPriceHero(Plan plan, int savings) {
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: AppColors.card,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: AppColors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.baseline,
            textBaseline: TextBaseline.alphabetic,
            children: [
              Text(
                plan.displayPrice,
                style: const TextStyle(
                  fontFamily: 'Rubik',
                  fontSize: 44,
                  fontWeight: FontWeight.w800,
                  color: AppColors.ink,
                  letterSpacing: -2,
                ),
              ),
              const SizedBox(width: 6),
              const Text(
                'לחודש',
                style: TextStyle(
                  fontSize: 18,
                  color: AppColors.inkMuted,
                ),
              ),
            ],
          ),
          if (plan.displayAfter != null) ...[
            const SizedBox(height: 6),
            Row(
              children: [
                Container(
                  padding: const EdgeInsets.symmetric(
                      horizontal: 8, vertical: 3),
                  decoration: BoxDecoration(
                    color: AppColors.danger.withOpacity(0.1),
                    borderRadius: BorderRadius.circular(6),
                  ),
                  child: Text(
                    'אחרי המבצע: ${plan.displayAfter}',
                    style: const TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w700,
                      color: AppColors.danger,
                    ),
                  ),
                ),
              ],
            ),
          ],
          if (plan.intro != null) ...[
            const SizedBox(height: 4),
            Text(
              '${plan.intro} במחיר זה',
              style: const TextStyle(
                fontSize: 13,
                color: AppColors.inkMuted,
              ),
            ),
          ],
          if (plan.term != null) ...[
            const SizedBox(height: 6),
            Row(
              children: [
                Icon(Icons.calendar_month_rounded,
                    size: 14, color: AppColors.inkMuted),
                const SizedBox(width: 4),
                Text(
                  'התחייבות ${plan.term} חודשים',
                  style: const TextStyle(
                    fontSize: 13,
                    color: AppColors.inkMuted,
                  ),
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }

  Widget _buildSavingsCard(int savings) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          colors: [Color(0xFFC9EC4B), Color(0xFFD6F260)],
          begin: Alignment.topRight,
          end: Alignment.bottomLeft,
        ),
        borderRadius: BorderRadius.circular(16),
      ),
      child: Row(
        children: [
          const Text('💰', style: TextStyle(fontSize: 28)),
          const SizedBox(width: 12),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                'חיסכון שנתי משוער',
                style: TextStyle(
                  fontSize: 13,
                  color: AppColors.greenDark,
                ),
              ),
              Text(
                '₪$savings',
                style: const TextStyle(
                  fontFamily: 'Rubik',
                  fontSize: 28,
                  fontWeight: FontWeight.w800,
                  color: AppColors.greenDark,
                  letterSpacing: -1,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildFeatsList(Plan plan) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.card,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'מה כלול',
            style: TextStyle(
              fontFamily: 'Rubik',
              fontSize: 16,
              fontWeight: FontWeight.w700,
              color: AppColors.ink,
            ),
          ),
          const SizedBox(height: 12),
          ...plan.feats.map((f) => Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: Row(
                  children: [
                    Container(
                      width: 28,
                      height: 28,
                      decoration: BoxDecoration(
                        color: AppColors.green.withOpacity(0.1),
                        shape: BoxShape.circle,
                      ),
                      child: Center(
                        child: Text(f.icon,
                            style: const TextStyle(fontSize: 14)),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Text(
                      f.label,
                      style: const TextStyle(
                        fontSize: 14,
                        color: AppColors.ink,
                      ),
                    ),
                    const Spacer(),
                    const Icon(Icons.check_rounded,
                        size: 16, color: AppColors.green),
                  ],
                ),
              )),
        ],
      ),
    );
  }

  Widget _buildPricingTable(Plan plan) {
    final rows = <(String, String)>[
      ('מחיר חודשי', plan.displayPrice),
      if (plan.displayAfter != null) ('אחרי מבצע', plan.displayAfter!),
      if (plan.term != null) ('התחייבות', '${plan.term} חודשים'),
      if (plan.intro != null) ('תקופת מבצע', plan.intro!),
      if (plan.term != null && plan.price != null)
        ('עלות ל-${plan.term} חודשים',
            '₪${((plan.price! * (int.tryParse(plan.term ?? '0') ?? 0)) / 100).round() * 100}'),
    ];

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.card,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'טבלת מחירים',
            style: TextStyle(
              fontFamily: 'Rubik',
              fontSize: 16,
              fontWeight: FontWeight.w700,
              color: AppColors.ink,
            ),
          ),
          const SizedBox(height: 12),
          ...rows.asMap().entries.map((entry) {
            final i = entry.key;
            final row = entry.value;
            return Container(
              padding: const EdgeInsets.symmetric(vertical: 10),
              decoration: BoxDecoration(
                border: i < rows.length - 1
                    ? Border(
                        bottom: BorderSide(color: AppColors.border))
                    : null,
              ),
              child: Row(
                children: [
                  Text(
                    row.$1,
                    style: const TextStyle(
                      fontSize: 14,
                      color: AppColors.inkMuted,
                    ),
                  ),
                  const Spacer(),
                  Text(
                    row.$2,
                    style: const TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.w700,
                      color: AppColors.ink,
                    ),
                  ),
                ],
              ),
            );
          }),
        ],
      ),
    );
  }

  Widget _buildWarningCard(String warn) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppColors.danger.withOpacity(0.08),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.danger.withOpacity(0.3)),
      ),
      child: Row(
        children: [
          const Icon(Icons.warning_amber_rounded,
              color: AppColors.danger, size: 20),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              warn,
              style: const TextStyle(
                fontSize: 13,
                color: AppColors.danger,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildRatingsSection(Plan plan) {
    final categories = [
      ('קליטה', 0.85),
      ('מהירות', 0.78),
      ('שירות לקוחות', 0.72),
    ];

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.card,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Text(
                'דירוגי קהילה',
                style: TextStyle(
                  fontFamily: 'Rubik',
                  fontSize: 16,
                  fontWeight: FontWeight.w700,
                  color: AppColors.ink,
                ),
              ),
              const Spacer(),
              StarsWidget(
                rating: plan.rating,
                reviews: plan.reviews,
                starSize: 13,
              ),
            ],
          ),
          const SizedBox(height: 14),
          ...categories.map((cat) => Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: Row(
                  children: [
                    SizedBox(
                      width: 100,
                      child: Text(
                        cat.$1,
                        style: const TextStyle(
                          fontSize: 13,
                          color: AppColors.inkMuted,
                        ),
                      ),
                    ),
                    Expanded(
                      child: ClipRRect(
                        borderRadius: BorderRadius.circular(4),
                        child: LinearProgressIndicator(
                          value: cat.$2,
                          backgroundColor: AppColors.border,
                          valueColor: const AlwaysStoppedAnimation(
                              AppColors.green),
                          minHeight: 8,
                        ),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Text(
                      '${(cat.$2 * 100).round()}%',
                      style: const TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w700,
                        color: AppColors.ink,
                      ),
                    ),
                  ],
                ),
              )),
          const SizedBox(height: 8),
          GestureDetector(
            onTap: () => context.push('/ratings'),
            child: const Text(
              'ראו את כל הביקורות →',
              style: TextStyle(
                fontSize: 13,
                color: AppColors.green,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildPriceMonitor() {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.card,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.border),
      ),
      child: Row(
        children: [
          const Icon(Icons.notifications_outlined,
              color: AppColors.green, size: 22),
          const SizedBox(width: 12),
          const Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'מוניטור מחיר',
                  style: TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.w700,
                    color: AppColors.ink,
                  ),
                ),
                Text(
                  'התראה אם המחיר ירד',
                  style: TextStyle(
                    fontSize: 13,
                    color: AppColors.inkMuted,
                  ),
                ),
              ],
            ),
          ),
          Switch(
            value: _priceMonitor,
            onChanged: (v) => setState(() => _priceMonitor = v),
            activeColor: AppColors.green,
          ),
        ],
      ),
    );
  }

  Widget _buildFineprint(String fine) {
    return GestureDetector(
      onTap: () => setState(() => _fineExpanded = !_fineExpanded),
      child: Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: AppColors.paper,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: AppColors.border),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const Icon(Icons.info_outline_rounded,
                    size: 16, color: AppColors.inkMuted),
                const SizedBox(width: 6),
                const Text(
                  'הערות ואותיות קטנות',
                  style: TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                    color: AppColors.inkMuted,
                  ),
                ),
                const Spacer(),
                Icon(
                  _fineExpanded
                      ? Icons.expand_less_rounded
                      : Icons.expand_more_rounded,
                  size: 18,
                  color: AppColors.inkMuted,
                ),
              ],
            ),
            if (_fineExpanded) ...[
              const SizedBox(height: 8),
              Text(
                fine,
                style: const TextStyle(
                  fontSize: 12,
                  color: AppColors.inkMuted,
                  height: 1.5,
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }

  Widget _buildStickyBottom(Plan plan) {
    return Positioned(
      bottom: 0,
      left: 0,
      right: 0,
      child: Container(
        padding: EdgeInsets.fromLTRB(
            16, 12, 16, MediaQuery.of(context).padding.bottom + 12),
        decoration: BoxDecoration(
          color: Colors.white,
          border: Border(top: BorderSide(color: AppColors.border)),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withOpacity(0.08),
              blurRadius: 16,
              offset: const Offset(0, -4),
            ),
          ],
        ),
        child: FilledButton(
          onPressed: () => context.push('/lead/${plan.id}'),
          style: FilledButton.styleFrom(
            backgroundColor: AppColors.green,
            foregroundColor: Colors.white,
            padding: const EdgeInsets.symmetric(vertical: 15),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(16),
            ),
          ),
          child: const Text(
            'עברו למסלול הזה →',
            style: TextStyle(fontSize: 17, fontWeight: FontWeight.w800),
          ),
        ),
      ),
    );
  }
}
