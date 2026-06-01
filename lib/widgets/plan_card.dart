import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import '../models.dart';
import '../state.dart';
import '../theme.dart';
import 'logo_widget.dart';
import 'stars_widget.dart';
import 'savings_badge.dart';

class PlanCard extends StatelessWidget {
  final Plan plan;
  final int currentBill;
  final bool showCompareToggle;
  final VoidCallback? onTap;

  const PlanCard({
    super.key,
    required this.plan,
    required this.currentBill,
    this.showCompareToggle = true,
    this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final appState = context.watch<AppState>();
    final savings = plan.savingsPerYear(currentBill);
    final inCompare = appState.isInCompare(plan.id);

    return GestureDetector(
      onTap: onTap ?? () => context.push('/plan/${plan.id}'),
      child: Container(
        margin: const EdgeInsets.only(bottom: 12),
        decoration: BoxDecoration(
          color: AppColors.card,
          borderRadius: BorderRadius.circular(18),
          border: Border.all(
            color: plan.best
                ? AppColors.lime.withOpacity(0.6)
                : AppColors.border,
            width: plan.best ? 1.5 : 1,
          ),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withOpacity(0.04),
              blurRadius: 8,
              offset: const Offset(0, 2),
            ),
          ],
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (plan.best) _buildBestBadge(),
            Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  _buildHeader(context, appState, inCompare),
                  const SizedBox(height: 12),
                  _buildPriceRow(context, savings),
                  if (plan.flags.isNotEmpty) ...[
                    const SizedBox(height: 10),
                    _buildFlags(),
                  ],
                  const SizedBox(height: 10),
                  _buildFeats(),
                  if (plan.priceWarn != null) ...[
                    const SizedBox(height: 8),
                    _buildWarnRow(),
                  ],
                  const SizedBox(height: 12),
                  _buildActions(context),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildBestBadge() {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(vertical: 7, horizontal: 16),
      decoration: BoxDecoration(
        color: AppColors.lime,
        borderRadius: const BorderRadius.only(
          topLeft: Radius.circular(17),
          topRight: Radius.circular(17),
        ),
      ),
      child: Row(
        children: [
          const Text('⭐', style: TextStyle(fontSize: 14)),
          const SizedBox(width: 6),
          Text(
            'מומלץ ביותר',
            style: TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w700,
              color: AppColors.greenDark,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildHeader(
      BuildContext context, AppState appState, bool inCompare) {
    return Row(
      children: [
        LogoWidget(provider: plan.provider, size: 44, fontSize: 17),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                plan.provider,
                style: const TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.w800,
                  color: AppColors.ink,
                ),
              ),
              const SizedBox(height: 2),
              Text(
                plan.plan,
                style: const TextStyle(
                  fontSize: 13,
                  color: AppColors.inkMuted,
                ),
              ),
            ],
          ),
        ),
        if (showCompareToggle)
          GestureDetector(
            onTap: () => appState.toggleCompare(plan.id),
            child: Container(
              padding: const EdgeInsets.all(8),
              decoration: BoxDecoration(
                color: inCompare
                    ? AppColors.green.withOpacity(0.1)
                    : AppColors.paper,
                shape: BoxShape.circle,
                border: Border.all(
                  color:
                      inCompare ? AppColors.green : AppColors.border,
                ),
              ),
              child: Icon(
                inCompare
                    ? Icons.check_rounded
                    : Icons.add_rounded,
                size: 18,
                color: inCompare ? AppColors.green : AppColors.inkMuted,
              ),
            ),
          ),
      ],
    );
  }

  Widget _buildPriceRow(BuildContext context, int savings) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.end,
      children: [
        Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.baseline,
              textBaseline: TextBaseline.alphabetic,
              children: [
                Text(
                  plan.displayPrice,
                  style: const TextStyle(
                    fontSize: 28,
                    fontWeight: FontWeight.w800,
                    color: AppColors.ink,
                    letterSpacing: -1,
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
            if (plan.displayAfter != null)
              Text(
                'אחרי מבצע: ${plan.displayAfter}',
                style: TextStyle(
                  fontSize: 12,
                  color: AppColors.danger,
                ),
              ),
          ],
        ),
        const Spacer(),
        Column(
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            if (savings > 0) SavingsBadge(savings: savings),
            if (plan.net.isNotEmpty) ...[
              const SizedBox(height: 4),
              Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(
                  color: AppColors.blueLight,
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Text(
                  plan.net,
                  style: const TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w700,
                    color: Color(0xFF1A3A7A),
                  ),
                ),
              ),
            ],
          ],
        ),
      ],
    );
  }

  Widget _buildFlags() {
    final flagLabels = {
      'nocommit': ('ללא התחייבות', AppColors.green),
      'fixed': ('מחיר קבוע', AppColors.greenLight),
      '5g': ('5G', const Color(0xFF1A3A7A)),
      'fiber': ('סיב', AppColors.green),
      'abroad': ('חו"ל כלול', AppColors.orange),
      'family': ('חבילת משפחה', AppColors.orange),
      'bundle': ('חבילה משולבת', AppColors.green),
      'streaming': ('סטרימינג', AppColors.greenLight),
      'premium': ('פרימיום', const Color(0xFF6B35C8)),
    };

    final shown =
        plan.flags.where((f) => flagLabels.containsKey(f)).take(3).toList();

    return Wrap(
      spacing: 6,
      runSpacing: 6,
      children: shown.map((f) {
        final info = flagLabels[f]!;
        return Container(
          padding:
              const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
          decoration: BoxDecoration(
            color: info.$2.withOpacity(0.1),
            borderRadius: BorderRadius.circular(6),
            border: Border.all(color: info.$2.withOpacity(0.3)),
          ),
          child: Text(
            info.$1,
            style: TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.w700,
              color: info.$2,
            ),
          ),
        );
      }).toList(),
    );
  }

  Widget _buildFeats() {
    final shown = plan.feats.take(3).toList();
    return Wrap(
      spacing: 8,
      runSpacing: 4,
      children: shown.map((feat) {
        return Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(feat.icon, style: const TextStyle(fontSize: 13)),
            const SizedBox(width: 3),
            Text(
              feat.label,
              style: const TextStyle(
                fontSize: 12,
                color: AppColors.inkMuted,
              ),
            ),
          ],
        );
      }).toList(),
    );
  }

  Widget _buildWarnRow() {
    return Container(
      padding:
          const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: AppColors.danger.withOpacity(0.08),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Row(
        children: [
          Icon(Icons.warning_amber_rounded,
              size: 14, color: AppColors.danger),
          const SizedBox(width: 6),
          Expanded(
            child: Text(
              plan.priceWarn!,
              style: TextStyle(
                fontSize: 11,
                color: AppColors.danger,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildActions(BuildContext context) {
    return Row(
      children: [
        Expanded(
          child: FilledButton(
            onPressed: () => context.push('/lead/${plan.id}'),
            style: FilledButton.styleFrom(
              backgroundColor: AppColors.green,
              foregroundColor: Colors.white,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(12),
              ),
              padding: const EdgeInsets.symmetric(vertical: 12),
              textStyle: const TextStyle(
                fontSize: 14,
                fontWeight: FontWeight.w700,
              ),
            ),
            child: const Text('עברו למסלול הזה →'),
          ),
        ),
        const SizedBox(width: 8),
        OutlinedButton(
          onPressed: () => context.push('/plan/${plan.id}'),
          style: OutlinedButton.styleFrom(
            side: BorderSide(color: AppColors.border),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(12),
            ),
            padding: const EdgeInsets.symmetric(
                vertical: 12, horizontal: 14),
          ),
          child: const Text(
            'פרטים',
            style: TextStyle(
              fontSize: 14,
              color: AppColors.inkMuted,
            ),
          ),
        ),
      ],
    );
  }
}
