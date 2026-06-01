import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import '../theme.dart';
import '../state.dart';
import '../data.dart';
import '../models.dart';
import '../widgets/logo_widget.dart';

class WebsiteScreen extends StatefulWidget {
  const WebsiteScreen({super.key});

  @override
  State<WebsiteScreen> createState() => _WebsiteScreenState();
}

class _WebsiteScreenState extends State<WebsiteScreen> {
  final _billCtrl = TextEditingController(text: '119');
  String _selectedCat = 'cellular';

  @override
  void dispose() {
    _billCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.green,
      body: SingleChildScrollView(
        child: Column(
          children: [
            _buildNav(context),
            _buildHero(context),
            _buildStats(),
            _buildCategories(context),
            _buildHowItWorks(),
            _buildBrandStrip(),
            _buildCTA(context),
            _buildFooter(),
          ],
        ),
      ),
    );
  }

  Widget _buildNav(BuildContext context) {
    final statusH = MediaQuery.of(context).padding.top;
    return Container(
      color: AppColors.greenDark,
      padding: EdgeInsets.fromLTRB(20, statusH + 10, 20, 10),
      child: Row(
        children: [
          Row(
            children: [
              Container(
                width: 32,
                height: 32,
                decoration: BoxDecoration(
                  color: AppColors.lime,
                  borderRadius: BorderRadius.circular(8),
                ),
                child: const Center(
                  child: Text(
                    'ח',
                    style: TextStyle(
                      fontSize: 18,
                      fontWeight: FontWeight.w800,
                      color: AppColors.greenDark,
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 8),
              const Text(
                'חוסך',
                style: TextStyle(
                  fontFamily: 'Rubik',
                  fontSize: 22,
                  fontWeight: FontWeight.w800,
                  color: Colors.white,
                ),
              ),
            ],
          ),
          const Spacer(),
          GestureDetector(
            onTap: () => context.go('/home'),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
              decoration: BoxDecoration(
                color: AppColors.lime,
                borderRadius: BorderRadius.circular(10),
              ),
              child: const Text(
                'פתח אפליקציה',
                style: TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w800,
                  color: AppColors.greenDark,
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildHero(BuildContext context) {
    return Container(
      color: AppColors.green,
      padding: const EdgeInsets.all(24),
      child: Column(
        children: [
          const Text(
            'השוואת מחירי תקשורת\nהכי חכמה בישראל',
            textAlign: TextAlign.center,
            style: TextStyle(
              fontFamily: 'Rubik',
              fontSize: 30,
              fontWeight: FontWeight.w800,
              color: Colors.white,
              letterSpacing: -0.5,
              height: 1.2,
            ),
          ),
          const SizedBox(height: 12),
          Text(
            'השוו מחירים, חסכו כסף, עברו בקלות',
            textAlign: TextAlign.center,
            style: TextStyle(
              fontSize: 16,
              color: Colors.white.withOpacity(0.8),
            ),
          ),
          const SizedBox(height: 28),
          // Live bill input
          Container(
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(
              color: AppColors.greenDark,
              borderRadius: BorderRadius.circular(20),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'כמה אתם משלמים לחודש?',
                  style: TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.w700,
                    color: Colors.white,
                  ),
                ),
                const SizedBox(height: 12),
                Row(
                  children: [
                    const Text(
                      '₪',
                      style: TextStyle(
                        fontFamily: 'Rubik',
                        fontSize: 28,
                        fontWeight: FontWeight.w800,
                        color: AppColors.lime,
                      ),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: TextField(
                        controller: _billCtrl,
                        keyboardType: TextInputType.number,
                        textDirection: TextDirection.ltr,
                        style: const TextStyle(
                          fontFamily: 'Rubik',
                          fontSize: 28,
                          fontWeight: FontWeight.w800,
                          color: Colors.white,
                        ),
                        decoration: const InputDecoration(
                          border: InputBorder.none,
                          enabledBorder: InputBorder.none,
                          focusedBorder: InputBorder.none,
                          fillColor: Colors.transparent,
                        ),
                      ),
                    ),
                    const Text(
                      '/חודש',
                      style: TextStyle(
                        fontSize: 16,
                        color: Colors.white60,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 16),
                SizedBox(
                  width: double.infinity,
                  child: ElevatedButton(
                    onPressed: () {
                      final bill = int.tryParse(_billCtrl.text) ?? 119;
                      context.read<AppState>()
                        ..setCurrentBill('cellular', bill)
                        ..setCat('cellular');
                      context.go('/results');
                    },
                    style: ElevatedButton.styleFrom(
                      backgroundColor: AppColors.lime,
                      foregroundColor: AppColors.greenDark,
                      padding: const EdgeInsets.symmetric(vertical: 16),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(14),
                      ),
                      textStyle: const TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    child: const Text('בדוק כמה תחסוך ←'),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildStats() {
    final stats = [
      ('60,000+', 'לקוחות מרוצים'),
      ('₪850', 'חיסכון ממוצע'),
      ('כל', 'הספקים'),
    ];

    return Container(
      color: AppColors.greenLight,
      padding: const EdgeInsets.symmetric(vertical: 20, horizontal: 16),
      child: Row(
        children: stats.map((s) {
          return Expanded(
            child: Column(
              children: [
                Text(
                  s.$1,
                  style: const TextStyle(
                    fontFamily: 'Rubik',
                    fontSize: 24,
                    fontWeight: FontWeight.w800,
                    color: AppColors.lime,
                  ),
                ),
                Text(
                  s.$2,
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    fontSize: 12,
                    color: Colors.white.withOpacity(0.8),
                  ),
                ),
              ],
            ),
          );
        }).toList(),
      ),
    );
  }

  Widget _buildCategories(BuildContext context) {
    final plans = plansByCategory(_selectedCat);

    return Container(
      color: AppColors.paper,
      padding: const EdgeInsets.all(24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'השוואה לפי קטגוריה',
            style: TextStyle(
              fontFamily: 'Rubik',
              fontSize: 20,
              fontWeight: FontWeight.w800,
              color: AppColors.ink,
            ),
          ),
          const SizedBox(height: 16),
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(
              children: kCategories.map((cat) {
                final active = _selectedCat == cat.id;
                return GestureDetector(
                  onTap: () => setState(() => _selectedCat = cat.id),
                  child: Container(
                    margin: const EdgeInsets.only(left: 8),
                    padding: const EdgeInsets.symmetric(
                        horizontal: 14, vertical: 8),
                    decoration: BoxDecoration(
                      color: active ? AppColors.green : AppColors.card,
                      borderRadius: BorderRadius.circular(20),
                      border: Border.all(
                        color: active ? AppColors.green : AppColors.border,
                      ),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(cat.icon, style: const TextStyle(fontSize: 14)),
                        const SizedBox(width: 6),
                        Text(
                          cat.name,
                          style: TextStyle(
                            fontSize: 13,
                            fontWeight: FontWeight.w700,
                            color: active ? Colors.white : AppColors.ink,
                          ),
                        ),
                      ],
                    ),
                  ),
                );
              }).toList(),
            ),
          ),
          const SizedBox(height: 16),
          ...plans.take(4).map((p) => _buildWebPlanRow(context, p)),
          const SizedBox(height: 16),
          SizedBox(
            width: double.infinity,
            child: OutlinedButton(
              onPressed: () {
                context.read<AppState>().setCat(_selectedCat);
                context.go('/results');
              },
              style: OutlinedButton.styleFrom(
                foregroundColor: AppColors.green,
                side: const BorderSide(color: AppColors.green),
                padding: const EdgeInsets.symmetric(vertical: 14),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(14),
                ),
              ),
              child: const Text(
                'ראה את כל המסלולים →',
                style: TextStyle(
                    fontSize: 15, fontWeight: FontWeight.w700),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildWebPlanRow(BuildContext context, Plan plan) {
    return GestureDetector(
      onTap: () => context.push('/plan/${plan.id}'),
      child: Container(
        margin: const EdgeInsets.only(bottom: 10),
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: AppColors.card,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(
            color: plan.best
                ? AppColors.lime.withOpacity(0.5)
                : AppColors.border,
          ),
        ),
        child: Row(
          children: [
            LogoWidget(provider: plan.provider, size: 40),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    plan.provider,
                    style: const TextStyle(
                      fontSize: 15,
                      fontWeight: FontWeight.w700,
                      color: AppColors.ink,
                    ),
                  ),
                  Text(
                    plan.plan,
                    style: const TextStyle(
                      fontSize: 12,
                      color: AppColors.inkMuted,
                    ),
                  ),
                ],
              ),
            ),
            Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Text(
                  plan.displayPrice,
                  style: const TextStyle(
                    fontFamily: 'Rubik',
                    fontSize: 20,
                    fontWeight: FontWeight.w800,
                    color: AppColors.green,
                  ),
                ),
                Text(
                  '/חודש',
                  style: const TextStyle(
                    fontSize: 11,
                    color: AppColors.inkMuted,
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildHowItWorks() {
    final steps = [
      ('🔍', '1. השוו', 'הכניסו את החשבון הנוכחי שלכם וראו כמה תחסכו'),
      ('✅', '2. בחרו', 'בחרו את המסלול המתאים לכם מתוך כל הספקים'),
      ('🚀', '3. עברו', 'נציג שלנו ילווה אתכם בתהליך המעבר הקל'),
    ];

    return Container(
      color: AppColors.greenDark,
      padding: const EdgeInsets.all(24),
      child: Column(
        children: [
          const Text(
            'איך זה עובד',
            style: TextStyle(
              fontFamily: 'Rubik',
              fontSize: 22,
              fontWeight: FontWeight.w800,
              color: Colors.white,
            ),
          ),
          const SizedBox(height: 24),
          ...steps.map((s) => Padding(
                padding: const EdgeInsets.only(bottom: 20),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(s.$1, style: const TextStyle(fontSize: 32)),
                    const SizedBox(width: 16),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            s.$2,
                            style: const TextStyle(
                              fontFamily: 'Rubik',
                              fontSize: 17,
                              fontWeight: FontWeight.w800,
                              color: AppColors.lime,
                            ),
                          ),
                          const SizedBox(height: 4),
                          Text(
                            s.$3,
                            style: TextStyle(
                              fontSize: 14,
                              color: Colors.white.withOpacity(0.8),
                              height: 1.4,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              )),
        ],
      ),
    );
  }

  Widget _buildBrandStrip() {
    final providers = [
      'פלאפון', 'סלקום', 'פרטנר', 'הוט', 'yes', 'בזק',
      'גולן טלקום', '019 מובייל', 'ריאלי', 'FreeTV', 'גילת', 'NEXT TV',
    ];

    return Container(
      color: AppColors.paper,
      padding: const EdgeInsets.symmetric(vertical: 20, horizontal: 16),
      child: Column(
        children: [
          Text(
            'כל הספקים',
            style: TextStyle(
              fontSize: 14,
              fontWeight: FontWeight.w700,
              color: AppColors.inkMuted,
            ),
          ),
          const SizedBox(height: 16),
          Wrap(
            spacing: 10,
            runSpacing: 10,
            alignment: WrapAlignment.center,
            children: providers.map((p) {
              final color = AppColors.providerColor(p);
              return Container(
                padding: const EdgeInsets.symmetric(
                    horizontal: 12, vertical: 6),
                decoration: BoxDecoration(
                  color: color.withOpacity(0.08),
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: color.withOpacity(0.2)),
                ),
                child: Text(
                  p,
                  style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w700,
                    color: color,
                  ),
                ),
              );
            }).toList(),
          ),
        ],
      ),
    );
  }

  Widget _buildCTA(BuildContext context) {
    return Container(
      color: AppColors.green,
      padding: const EdgeInsets.all(32),
      child: Column(
        children: [
          const Text(
            'מוכנים לחסוך?',
            style: TextStyle(
              fontFamily: 'Rubik',
              fontSize: 28,
              fontWeight: FontWeight.w800,
              color: Colors.white,
              letterSpacing: -0.5,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            'הצטרפו ל-60,000 לקוחות שכבר חוסכים',
            style: TextStyle(
              fontSize: 15,
              color: Colors.white.withOpacity(0.8),
            ),
          ),
          const SizedBox(height: 24),
          SizedBox(
            width: double.infinity,
            child: ElevatedButton(
              onPressed: () => context.go('/home'),
              style: ElevatedButton.styleFrom(
                backgroundColor: AppColors.lime,
                foregroundColor: AppColors.greenDark,
                padding: const EdgeInsets.symmetric(vertical: 18),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(16),
                ),
                textStyle: const TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.w800,
                ),
              ),
              child: const Text('התחילו להשוות חינם ←'),
            ),
          ),
          const SizedBox(height: 12),
          Text(
            'ללא עלות • ללא התחייבות',
            style: TextStyle(
              fontSize: 13,
              color: Colors.white.withOpacity(0.6),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildFooter() {
    return Container(
      color: AppColors.greenDark,
      padding: const EdgeInsets.all(24),
      child: Column(
        children: [
          Row(
            children: [
              Container(
                width: 32,
                height: 32,
                decoration: BoxDecoration(
                  color: AppColors.lime,
                  borderRadius: BorderRadius.circular(8),
                ),
                child: const Center(
                  child: Text(
                    'ח',
                    style: TextStyle(
                      fontSize: 18,
                      fontWeight: FontWeight.w800,
                      color: AppColors.greenDark,
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 8),
              const Text(
                'חוסך',
                style: TextStyle(
                  fontFamily: 'Rubik',
                  fontSize: 18,
                  fontWeight: FontWeight.w800,
                  color: Colors.white,
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),
          Text(
            '© 2025 חוסך. כל הזכויות שמורות.',
            style: TextStyle(
              fontSize: 12,
              color: Colors.white.withOpacity(0.5),
            ),
          ),
          const SizedBox(height: 8),
          Text(
            'המחירים המוצגים הם לצורך השוואה בלבד.',
            style: TextStyle(
              fontSize: 11,
              color: Colors.white.withOpacity(0.4),
            ),
          ),
        ],
      ),
    );
  }
}
