import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:flutter_animate/flutter_animate.dart';
import '../../theme/app_theme.dart';
import '../../core/nav.dart';
import '../../app_state.dart';
import '../../data.dart';
import '../../models.dart';
import '../../components/logo_widget/logo_widget.dart';
import '../../widgets/empty_state.dart';

/// המסלולים ששמרת — רשימת ה"לב" של המשתמש.
///
/// קוראת את [AppState.favoritePlans] (מזהי מסלולים), ממפה אותם למסלולים אמיתיים
/// דרך [planById] ומדלגת על מזהים ישנים שכבר לא קיימים בקטלוג. הכרטיסים משקפים
/// את פריסת תוצאות החיפוש (כרטיס זכוכית עם לוגו, ספק ושם מסלול), לחיצה פותחת את
/// דף המסלול, וכפתור הלב מסיר מהשמורים. ריק → [EmptyState].
class FavoritesWidget extends StatefulWidget {
  const FavoritesWidget({super.key});

  @override
  State<FavoritesWidget> createState() => _FavoritesWidgetState();
}

class _FavoritesWidgetState extends State<FavoritesWidget> {
  @override
  Widget build(BuildContext context) {
    final ffTheme = AppTheme.of(context);
    final appState = Provider.of<AppState>(context);

    // Map saved ids → real plans, dropping any stale id whose plan was removed
    // from the catalogue (planById returns null for those).
    final plans = <Plan>[
      for (final id in appState.favoritePlans)
        if (planById(id) case final p?) p,
    ];

    return Scaffold(
      backgroundColor: ffTheme.background,
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0,
        titleSpacing: 0,
        leading: IconButton(
          icon: Icon(Icons.arrow_forward_ios_rounded, color: ffTheme.primaryText, size: 20),
          tooltip: 'חזרה',
          onPressed: () => context.safePop(),
        ),
        title: Text(
          'המסלולים ששמרתי',
          style: ffTheme.titleLarge.copyWith(fontWeight: FontWeight.w800),
        ),
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(1),
          child: Container(height: 1, color: ffTheme.alternate),
        ),
      ),
      body: plans.isEmpty
          ? const EmptyState(
              icon: Icons.favorite_border_rounded,
              headline: 'עדיין לא שמרת מסלולים',
              subtitle: 'סמנו מסלול בלב כדי לשמור אותו כאן ולחזור אליו בקלות',
            )
          : ListView.builder(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
              itemCount: plans.length,
              itemBuilder: (context, i) {
                final plan = plans[i];
                return _FavoriteRow(
                  plan: plan,
                  ffTheme: ffTheme,
                  onOpen: () {
                    appState.viewPlan(plan.id);
                    context.pushNamed('PlanDetail', pathParameters: {'planId': plan.id});
                  },
                  onRemove: () => appState.toggleFavorite(plan.id),
                ).animate(delay: (i.clamp(0, 12) * 40).ms).fadeIn(duration: 240.ms).slideY(begin: 0.1);
              },
            ),
    );
  }
}

/// כרטיס זכוכית של מסלול שמור — משקף את שורת תוצאות החיפוש (לוגו → ספק/שם →
/// מחיר), בתוספת כפתור לב להסרה מהשמורים.
class _FavoriteRow extends StatelessWidget {
  const _FavoriteRow({
    required this.plan,
    required this.ffTheme,
    required this.onOpen,
    required this.onRemove,
  });

  final Plan plan;
  final AppTheme ffTheme;
  final VoidCallback onOpen;
  final VoidCallback onRemove;

  @override
  Widget build(BuildContext context) {
    final catName = categoryById(plan.cat)?.name ?? '';
    return Semantics(
      button: true,
      label: '$catName: ${plan.provider}, ${plan.plan}, ₪${plan.priceText} ${priceUnitShort(plan)}',
      child: GestureDetector(
        onTap: onOpen,
        child: Container(
          margin: const EdgeInsets.only(bottom: 10),
          padding: const EdgeInsets.all(12),
          decoration: ffTheme.glassDecoration(radius: ffTheme.radiusMd),
          child: Row(
            children: [
              ExcludeSemantics(child: LogoWidget(provider: plan.provider, size: 40)),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
                          decoration: BoxDecoration(
                            color: ffTheme.accent1,
                            borderRadius: BorderRadius.circular(ffTheme.radiusXs),
                          ),
                          child: Text(catName,
                              style: ffTheme.labelSmall
                                  .copyWith(color: ffTheme.primary, fontWeight: FontWeight.w700)),
                        ),
                        const SizedBox(width: 6),
                        Flexible(
                          child: Text(plan.provider,
                              style: ffTheme.labelSmall.copyWith(color: ffTheme.secondaryText),
                              maxLines: 1, overflow: TextOverflow.ellipsis),
                        ),
                      ],
                    ),
                    const SizedBox(height: 4),
                    Text(plan.plan,
                        style: ffTheme.titleSmall.copyWith(fontWeight: FontWeight.w700),
                        maxLines: 1, overflow: TextOverflow.ellipsis),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Text('₪${plan.priceText}',
                      style: ffTheme.titleMedium
                          .copyWith(color: ffTheme.primary, fontWeight: FontWeight.w800)),
                  Text(priceUnitShort(plan),
                      style: ffTheme.labelSmall.copyWith(color: ffTheme.secondaryText, fontSize: 10)),
                ],
              ),
              const SizedBox(width: 4),
              // Remove-from-favorites control: a 44×44 tap target (a11y minimum)
              // around the filled-heart visual.
              Semantics(
                button: true,
                label: 'הסר מהשמורים',
                child: Tooltip(
                  message: 'הסר מהשמורים',
                  child: SizedBox(
                    width: 44,
                    height: 44,
                    child: Material(
                      color: Colors.transparent,
                      child: InkWell(
                        customBorder: const CircleBorder(),
                        onTap: onRemove,
                        child: Icon(Icons.favorite_rounded, size: 22, color: ffTheme.secondary),
                      ),
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
