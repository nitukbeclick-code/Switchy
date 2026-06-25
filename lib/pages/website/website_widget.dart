import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:google_fonts/google_fonts.dart';
import '../../theme/app_theme.dart';
import '../../theme/app_icons.dart';
import '../../core/nav.dart';
import '../../app_state.dart';
import '../../data.dart';
import '../../components/plan_card/plan_card_widget.dart';
import '../../components/logo_widget/logo_widget.dart';

class WebsiteWidget extends StatefulWidget {
  const WebsiteWidget({super.key});

  @override
  State<WebsiteWidget> createState() => _WebsiteWidgetState();
}

class _WebsiteWidgetState extends State<WebsiteWidget> {
  double _billInput = 119;
  String _activeCat = 'cellular';
  final Map<String, double> _catBills = {
    'cellular': 119,
    'internet': 199,
    'tv': 89,
    'triple': 349,
    'abroad': 0,
  };

  int _potentialSaving(String cat, int bill) {
    final catPlans = plansByCat(cat);
    if (catPlans.isEmpty || bill <= 0) return 0;
    final minPrice = catPlans.map((p) => p.price).reduce((a, b) => a < b ? a : b);
    return ((bill - minPrice) * 12).clamp(0, 999999);
  }

  @override
  Widget build(BuildContext context) {
    final ffTheme = AppTheme.of(context);
    final appState = Provider.of<AppState>(context, listen: false);
    final plans = plansByCat(_activeCat).take(6).toList();
    final heroBill = _billInput.round();
    final heroSaving = _potentialSaving('cellular', heroBill);
    final catBill = (_catBills[_activeCat] ?? 0).round();
    final catSaving = _potentialSaving(_activeCat, catBill);

    return Scaffold(
      backgroundColor: ffTheme.background,
      bottomNavigationBar: (heroSaving > 0 || catSaving > 0) ? _buildStickyBar(context, ffTheme, catSaving > heroSaving ? catSaving : heroSaving, catSaving > heroSaving ? _activeCat : 'cellular') : null,
      body: CustomScrollView(
        slivers: [
          // Sticky nav — ink bar (premium brand surface). The brand chip stays a
          // clean white-glass mark; the nav CTA carries the green ACTION accent so
          // the primary "check your savings" action reads instantly.
          SliverAppBar(
            pinned: true,
            backgroundColor: ffTheme.primary,
            elevation: 0,
            scrolledUnderElevation: 0,
            title: Row(
              children: [
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(ffTheme.radiusXs),
                  ),
                  child: Text('Switchy AI', style: GoogleFonts.rubik(fontSize: 16, fontWeight: FontWeight.w800, color: AppColors.primary)),
                ),
                const Spacer(),
                TextButton(
                  onPressed: () => context.goNamed('Home'),
                  child: Text('הורד אפליקציה', style: GoogleFonts.rubik(fontSize: 12, fontWeight: FontWeight.w600, color: Colors.white70)),
                ),
              ],
            ),
            actions: [
              Container(
                margin: const EdgeInsetsDirectional.only(start: 16, top: 8, bottom: 8),
                decoration: BoxDecoration(
                  gradient: ffTheme.accentGradient,
                  borderRadius: BorderRadius.circular(ffTheme.radiusXs),
                  boxShadow: ffTheme.shadowAccent,
                ),
                child: ElevatedButton(
                  onPressed: () => context.goNamed('Home'),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: Colors.transparent,
                    foregroundColor: Colors.white,
                    shadowColor: Colors.transparent,
                    elevation: 0,
                    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(ffTheme.radiusXs)),
                  ),
                  child: Text('בדוק כמה תחסוך', style: GoogleFonts.rubik(fontSize: 12, fontWeight: FontWeight.w700, color: Colors.white)),
                ),
              ),
            ],
          ),

          // Hero section
          SliverToBoxAdapter(
            child: Container(
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topRight,
                  end: Alignment.bottomLeft,
                  colors: [ffTheme.primaryDark, ffTheme.primary, ffTheme.tertiary],
                ),
              ),
              padding: const EdgeInsets.fromLTRB(20, 40, 20, 48),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'השוואת מחירי תקשורת\nהכי חכמה בישראל',
                    style: GoogleFonts.rubik(fontSize: 30, fontWeight: FontWeight.w800, color: Colors.white, height: 1.2),
                  ).animate().fadeIn(duration: 500.ms).slideY(begin: 0.2, end: 0),
                  const SizedBox(height: 12),
                  Text(
                    'כל מסלולי הסלולר, האינטרנט והטלוויזיה במקום אחד — שקוף ואמין',
                    style: GoogleFonts.assistant(fontSize: 14, color: Colors.white70),
                  ).animate().fadeIn(delay: 100.ms),
                  const SizedBox(height: 18),
                  // Trust signals
                  const Row(
                    children: [
                      _TrustPill(icon: Icons.verified_rounded, label: 'שירות חינמי'),
                      SizedBox(width: 8),
                      _TrustPill(icon: Icons.timer_rounded, label: '2 דקות'),
                      SizedBox(width: 8),
                      _TrustPill(icon: Icons.thumb_up_rounded, label: 'ללא התחייבות'),
                    ],
                  ).animate().fadeIn(delay: 150.ms),
                  const SizedBox(height: 20),
                  Container(
                    padding: const EdgeInsets.all(16),
                    decoration: BoxDecoration(
                      color: Colors.white.withValues(alpha: 0.15),
                      borderRadius: BorderRadius.circular(16),
                      border: Border.all(color: Colors.white.withValues(alpha: 0.2)),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('מה אתם משלמים היום על סלולר?', style: GoogleFonts.rubik(fontSize: 14, fontWeight: FontWeight.w600, color: Colors.white)),
                        const SizedBox(height: 12),
                        Row(
                          crossAxisAlignment: CrossAxisAlignment.center,
                          children: [
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  // The current bill is a neutral input figure (white on
                                  // the ink hero) — NOT a VALUE number, so it stays white
                                  // and lets the amber savings pill below own the accent.
                                  Row(
                                    crossAxisAlignment: CrossAxisAlignment.end,
                                    children: [
                                      Text('₪${_billInput.round()}', style: GoogleFonts.rubik(fontSize: 36, fontWeight: FontWeight.w800, color: Colors.white)),
                                      const SizedBox(width: 6),
                                      Padding(
                                        padding: const EdgeInsets.only(bottom: 6),
                                        child: Text('לחודש', style: GoogleFonts.assistant(fontSize: 12, color: Colors.white54)),
                                      ),
                                    ],
                                  ),
                                  // The slider is an ACTION control → green active track.
                                  Slider(
                                    value: _billInput,
                                    min: 20,
                                    max: 500,
                                    activeColor: ffTheme.brandAccent,
                                    inactiveColor: Colors.white24,
                                    onChanged: (v) => setState(() { _billInput = v; _catBills['cellular'] = v; }),
                                  ),
                                  // The savings figure is VALUE → amber chip, the single
                                  // warm accent that makes "you could save" pop on the ink.
                                  if (heroSaving > 0)
                                    AnimatedSwitcher(
                                      duration: const Duration(milliseconds: 300),
                                      child: Container(
                                        key: ValueKey(heroSaving),
                                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                                        decoration: BoxDecoration(
                                          color: ffTheme.saving.withValues(alpha: 0.2),
                                          borderRadius: BorderRadius.circular(ffTheme.radiusXs),
                                          border: Border.all(color: ffTheme.saving.withValues(alpha: 0.4)),
                                        ),
                                        child: Row(
                                          mainAxisSize: MainAxisSize.min,
                                          children: [
                                            Icon(Icons.savings_rounded, size: 13, color: ffTheme.saving),
                                            const SizedBox(width: 4),
                                            Text(
                                              'תוכלו לחסוך עד ₪$heroSaving בשנה!',
                                              style: GoogleFonts.rubik(fontSize: 11, fontWeight: FontWeight.w800, color: ffTheme.saving),
                                            ),
                                          ],
                                        ),
                                      ),
                                    ),
                                ],
                              ),
                            ),
                            const SizedBox(width: 12),
                            // Primary ACTION → green gradient with a green glow, the
                            // single dominant CTA in the hero.
                            DecoratedBox(
                              decoration: BoxDecoration(
                                gradient: ffTheme.accentGradient,
                                borderRadius: BorderRadius.circular(14),
                                boxShadow: ffTheme.shadowAccent,
                              ),
                              child: ElevatedButton(
                                onPressed: () {
                                  appState.setCurrentBill('cellular', _billInput.round());
                                  appState.setCategory('cellular');
                                  context.goNamed('Home');
                                },
                                style: ElevatedButton.styleFrom(
                                  backgroundColor: Colors.transparent,
                                  foregroundColor: Colors.white,
                                  shadowColor: Colors.transparent,
                                  padding: const EdgeInsets.symmetric(horizontal: 22, vertical: 16),
                                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                                  elevation: 0,
                                ),
                                child: Column(
                                  children: [
                                    Text('בדוק', style: GoogleFonts.rubik(fontSize: 16, fontWeight: FontWeight.w800, color: Colors.white)),
                                    Text('עכשיו', style: GoogleFonts.rubik(fontSize: 10, fontWeight: FontWeight.w600, color: Colors.white)),
                                  ],
                                ),
                              ),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ).animate().fadeIn(delay: 200.ms).scale(begin: const Offset(0.97, 0.97), delay: 200.ms),
                ],
              ),
            ),
          ),

          // Stats bar — real catalogue facts only (verifiable from the data set).
          SliverToBoxAdapter(
            child: Container(
              color: ffTheme.cardSurface,
              padding: const EdgeInsets.symmetric(vertical: 20),
              child: const Row(
                mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                children: [
                  _AnimatedStat(end: 100, prefix: '', suffix: '+', label: 'מסלולים'),
                  _StatDivider(),
                  _AnimatedStat(end: 18, prefix: '', suffix: '', label: 'ספקים'),
                  _StatDivider(),
                  _AnimatedStat(end: 5, prefix: '', suffix: '', label: 'קטגוריות'),
                ],
              ),
            ).animate().fadeIn(delay: 300.ms),
          ),

          // Category tabs + plans
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.all(20),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('השוואת מחירים', style: ffTheme.headlineMedium),
                  const SizedBox(height: 14),
                  SingleChildScrollView(
                    scrollDirection: Axis.horizontal,
                    child: Row(
                      children: categories.map((cat) {
                        final active = _activeCat == cat.id;
                        // The selected tab is an ACTIVE state → green ACTION fill +
                        // soft glow; resting tabs are calm glass chips with an ink
                        // hairline. a11y: each tab is a real selectable button.
                        return Semantics(
                          button: true,
                          selected: active,
                          label: cat.name,
                          child: GestureDetector(
                            onTap: () => setState(() => _activeCat = cat.id),
                            child: AnimatedContainer(
                              duration: const Duration(milliseconds: 200),
                              margin: const EdgeInsetsDirectional.only(start: 8),
                              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 9),
                              constraints: const BoxConstraints(minHeight: kMinTapTarget),
                              decoration: BoxDecoration(
                                gradient: active ? ffTheme.accentGradient : null,
                                color: active ? null : ffTheme.cardSurface,
                                borderRadius: BorderRadius.circular(ffTheme.radiusPill),
                                border: Border.all(color: active ? Colors.transparent : ffTheme.alternate),
                                boxShadow: active ? ffTheme.shadowAccent : null,
                              ),
                              child: Row(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  Icon(categoryIconData(cat.id), size: 15, color: active ? Colors.white : ffTheme.primaryText),
                                  const SizedBox(width: 6),
                                  Text(cat.name, style: ffTheme.labelMedium.copyWith(color: active ? Colors.white : ffTheme.primaryText, fontWeight: FontWeight.w700)),
                                ],
                              ),
                            ),
                          ),
                        );
                      }).toList(),
                    ),
                  ),
                  const SizedBox(height: 12),
                  if (_activeCat != 'abroad') _buildCatBillInput(context, ffTheme),
                  // A live VALUE read-out for the selected category → amber chip
                  // (the warm "this is money you could save" accent).
                  if (catSaving > 0 && _activeCat != 'abroad') ...[
                    const SizedBox(height: 10),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                      decoration: BoxDecoration(
                        color: ffTheme.saving.withValues(alpha: 0.16),
                        borderRadius: BorderRadius.circular(ffTheme.radiusXs),
                        border: Border.all(color: ffTheme.saving.withValues(alpha: 0.4)),
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(Icons.savings_rounded, size: 14, color: ffTheme.savingText),
                          const SizedBox(width: 6),
                          Flexible(
                            child: Text(
                              'לפי החשבון שלך תוכל לחסוך עד ₪$catSaving/שנה',
                              style: GoogleFonts.rubik(fontSize: 12, fontWeight: FontWeight.w800, color: ffTheme.savingText),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                  const SizedBox(height: 12),
                  ...plans.map((p) => PlanCardWidget(plan: p, currentBill: catBill)),
                  if (plans.length >= 6)
                    Center(
                      // A navigational link → green ACTION text (AA-safe green 700
                      // on light), with a logical-forward chevron for RTL.
                      child: TextButton.icon(
                        onPressed: () {
                          appState.setCategory(_activeCat);
                          final catBillVal = _catBills[_activeCat];
                          if (catBillVal != null && catBillVal > 0) {
                            appState.setCurrentBill(_activeCat, catBillVal.round());
                          }
                          context.goNamed('Home');
                        },
                        icon: Icon(AppIcons.chevron, size: 18, color: ffTheme.brandAccentText),
                        label: Text('ראה את כל המסלולים', style: ffTheme.titleSmall.copyWith(color: ffTheme.brandAccentText, fontWeight: FontWeight.w700)),
                      ),
                    ),
                ],
              ),
            ),
          ),

          // How it works
          SliverToBoxAdapter(
            child: Container(
              color: ffTheme.accent1,
              padding: const EdgeInsets.all(24),
              child: Column(
                children: [
                  Text('איך זה עובד?', style: ffTheme.headlineMedium),
                  const SizedBox(height: 24),
                  const _NumberedStep(n: 1, icon: Icons.search_rounded, title: 'בחר קטגוריה ומלא פרטים', subtitle: 'ספר לנו על הצרכים שלך — בדיוק 2 דקות'),
                  const _NumberedStep(n: 2, icon: Icons.savings_rounded, title: 'ראה השוואת מחירים מלאה', subtitle: 'כל הספקים במקום אחד, שקוף ואמין'),
                  const _NumberedStep(n: 3, icon: Icons.handshake_rounded, title: 'נלווה אותך במעבר', subtitle: 'נציג אישי מנהל את כל התהליך בשבילך', isLast: true),
                ],
              ),
            ).animate().fadeIn(delay: 400.ms),
          ),

          // Why Switchy AI — honest value props, no fabricated testimonials.
          SliverToBoxAdapter(
            child: Container(
              padding: const EdgeInsets.fromLTRB(20, 28, 20, 28),
              color: ffTheme.cardSurface,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('למה Switchy AI?', style: ffTheme.headlineMedium),
                  const SizedBox(height: 16),
                  const _ValueProp(
                    icon: Icons.account_balance_wallet_outlined,
                    title: 'שירות חינמי לחלוטין',
                    text: 'אנחנו מרוויחים עמלה מהספקים — לא ממך. אין עלות נסתרת.',
                  ),
                  const _ValueProp(
                    icon: Icons.visibility_outlined,
                    title: 'השוואה שקופה',
                    text: 'כל המסלולים מ-18 הספקים ב-5 הקטגוריות, אותם נתונים לכולם.',
                  ),
                  const _ValueProp(
                    icon: Icons.handshake_outlined,
                    title: 'ליווי אישי במעבר',
                    text: 'נציג אנושי מלווה אותך מהבחירה ועד ניוד המספר — ללא התחייבות.',
                    isLast: true,
                  ),
                ],
              ),
            ).animate().fadeIn(delay: 350.ms),
          ),

          // Provider strip
          SliverToBoxAdapter(
            child: Container(
              padding: const EdgeInsets.all(20),
              color: ffTheme.background,
              child: Column(
                children: [
                  Text('כל הספקים', style: ffTheme.titleMedium.copyWith(color: ffTheme.secondaryText)),
                  const SizedBox(height: 14),
                  Wrap(
                    spacing: 10,
                    runSpacing: 10,
                    alignment: WrapAlignment.center,
                    children: ['פלאפון', 'סלקום', 'פרטנר', 'הוט', 'yes', 'בזק', 'גולן', '019 מובייל', 'Airalo', 'FreeTV', 'רמי לוי']
                        .map((p) => LogoWidget(provider: p, size: 40))
                        .toList(),
                  ),
                ],
              ),
            ),
          ),

          // FAQ section
          SliverToBoxAdapter(
            child: Container(
              padding: const EdgeInsets.all(20),
              color: ffTheme.cardSurface,
              child: const Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  _FAQHeader(),
                  _FAQ(q: 'האם השירות חינמי?', a: 'כן! Switchy AI הוא שירות חינמי לחלוטין. אנחנו מרוויחים עמלה מהספקים, לא ממך.'),
                  _FAQ(q: 'מה קורה לאחר שאני בוחר מסלול?', a: 'נציג Switchy AI יצור קשר תוך שעה, יסביר את התהליך ויסייע בכל שלב עד הניוד.'),
                  _FAQ(q: 'האם אפשר לנייד את המספר שלי?', a: 'כן! ניוד מספר בישראל הוא חינמי וזכות שלך. התהליך לוקח עד 3 ימי עסקים.'),
                  _FAQ(q: 'מה אם לא מרוצה מהספק החדש?', a: 'ניתן לנייד שוב בכל עת. לחבילות ללא התחייבות – ניתן לסגת מיד.'),
                ],
              ),
            ).animate().fadeIn(delay: 400.ms),
          ),

          // CTA band
          SliverToBoxAdapter(
            child: Container(
              padding: const EdgeInsets.all(32),
              decoration: BoxDecoration(
                gradient: LinearGradient(colors: [ffTheme.primaryDark, ffTheme.primary]),
              ),
              child: Column(
                children: [
                  Text('מוכנים לחסוך?', style: GoogleFonts.rubik(fontSize: 28, fontWeight: FontWeight.w800, color: Colors.white)),
                  const SizedBox(height: 8),
                  Text('השוו את כל המסלולים ומצאו את המתאים לכם — בחינם', style: GoogleFonts.assistant(fontSize: 14, color: Colors.white70)),
                  const SizedBox(height: 20),
                  // The closing conversion CTA → green ACTION gradient + glow, the
                  // single dominant action in the band.
                  DecoratedBox(
                    decoration: BoxDecoration(
                      gradient: ffTheme.accentGradient,
                      borderRadius: BorderRadius.circular(16),
                      boxShadow: ffTheme.shadowAccent,
                    ),
                    child: ElevatedButton(
                      onPressed: () => context.goNamed('Home'),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: Colors.transparent,
                        foregroundColor: Colors.white,
                        shadowColor: Colors.transparent,
                        elevation: 0,
                        padding: const EdgeInsets.symmetric(horizontal: 36, vertical: 16),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                      ),
                      child: Text('בדוק כמה תחסוך עכשיו', style: GoogleFonts.rubik(fontSize: 16, fontWeight: FontWeight.w800, color: Colors.white)),
                    ),
                  ),
                ],
              ),
            ),
          ),

          // Footer
          SliverToBoxAdapter(
            child: Container(
              padding: const EdgeInsets.all(20),
              color: ffTheme.primaryDark,
              child: Column(
                children: [
                  Text('Switchy AI', style: GoogleFonts.rubik(fontSize: 18, fontWeight: FontWeight.w800, color: Colors.white)),
                  const SizedBox(height: 8),
                  Text('© 2026 Switchy AI. כל הזכויות שמורות.', style: GoogleFonts.assistant(fontSize: 11, color: Colors.white38)),
                  const SizedBox(height: 4),
                  Text('לא ספק תקשורת. לא מחויבים לאף חברה. רק בצד שלכם.', style: GoogleFonts.assistant(fontSize: 11, color: Colors.white38), textAlign: TextAlign.center),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildCatBillInput(BuildContext context, AppTheme ffTheme) {
    final labels = {'cellular': 'על סלולר', 'internet': 'על אינטרנט', 'tv': 'על טלוויזיה', 'triple': 'על חבילה משולבת'};
    final maxes = {'cellular': 500.0, 'internet': 400.0, 'tv': 300.0, 'triple': 700.0};
    final bill = _catBills[_activeCat] ?? 119;
    final max = maxes[_activeCat] ?? 500.0;
    final label = labels[_activeCat] ?? 'בקטגוריה';

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: ffTheme.cardDecoration(radius: ffTheme.radiusMd),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(child: Text('מה אתם משלמים $label?', style: ffTheme.labelMedium)),
              const SizedBox(width: 8),
              Text('₪${bill.round()}/חודש', style: ffTheme.titleSmall.copyWith(color: ffTheme.primaryText, fontWeight: FontWeight.w700)),
            ],
          ),
          // The bill slider is an ACTION control → green active track.
          Slider(
            value: bill,
            min: 0,
            max: max,
            activeColor: ffTheme.brandAccent,
            inactiveColor: ffTheme.alternate.withValues(alpha: 0.4),
            onChanged: (v) => setState(() => _catBills[_activeCat] = v),
          ),
        ],
      ),
    );
  }

  static const _catLabels = {
    'cellular': 'בסלולר',
    'internet': 'באינטרנט',
    'tv': 'בטלוויזיה',
    'triple': 'בחבילה משולבת',
    'abroad': 'בחו"ל',
  };

  Widget _buildStickyBar(BuildContext context, AppTheme ffTheme, int saving, String cat) {
    final catLabel = _catLabels[cat] ?? 'בתקשורת';
    return SafeArea(
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 300),
        height: 68,
        decoration: BoxDecoration(
          // Theme-aware surface (white on light, slate on dark) with a soft
          // top-edge lift so the bar reads as floating above the page.
          color: ffTheme.cardSurface,
          border: Border(top: BorderSide(color: ffTheme.lineColor)),
          boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: ffTheme.dark ? 0.3 : 0.08), blurRadius: 14, offset: const Offset(0, -3))],
        ),
        child: Row(
          children: [
            const SizedBox(width: 16),
            Expanded(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('פוטנציאל החיסכון שלך', style: ffTheme.labelSmall.copyWith(color: ffTheme.secondaryText)),
                  const SizedBox(height: 2),
                  // The savings figure is the VALUE focal point → amber VALUE text
                  // (AA-safe amber 800 on the light bar, lifted amber on dark).
                  AnimatedSwitcher(
                    duration: const Duration(milliseconds: 300),
                    child: Text(
                      key: ValueKey('$saving$cat'),
                      'עד ₪$saving/שנה $catLabel',
                      style: GoogleFonts.rubik(fontSize: 14, fontWeight: FontWeight.w800, color: ffTheme.savingText),
                    ),
                  ),
                ],
              ),
            ),
            // The persistent conversion CTA → green ACTION gradient + glow, with a
            // real button semantic and a ≥48px tap target for a11y.
            Semantics(
              button: true,
              label: 'בדוק עכשיו — עד ₪$saving לשנה $catLabel',
              child: GestureDetector(
                onTap: () {
                  final appState = Provider.of<AppState>(context, listen: false);
                  appState.setCategory(cat);
                  final catBillVal = _catBills[cat];
                  if (catBillVal != null && catBillVal > 0) {
                    appState.setCurrentBill(cat, catBillVal.round());
                  }
                  context.goNamed('Home');
                },
                child: Container(
                  margin: const EdgeInsetsDirectional.only(start: 16),
                  padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
                  constraints: const BoxConstraints(minHeight: kMinTapTarget),
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                    gradient: ffTheme.accentGradient,
                    borderRadius: BorderRadius.circular(ffTheme.radiusSm),
                    boxShadow: ffTheme.shadowAccent,
                  ),
                  child: Text('בדוק עכשיו', style: GoogleFonts.rubik(fontSize: 13, fontWeight: FontWeight.w800, color: Colors.white)),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _TrustPill extends StatelessWidget {
  const _TrustPill({required this.icon, required this.label});
  final IconData icon;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.15),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: Colors.white.withValues(alpha: 0.25)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 12, color: Colors.white70),
          const SizedBox(width: 4),
          Text(label, style: GoogleFonts.assistant(fontSize: 11, color: Colors.white70, fontWeight: FontWeight.w600)),
        ],
      ),
    );
  }
}

class _AnimatedStat extends StatelessWidget {
  const _AnimatedStat({required this.end, required this.prefix, required this.suffix, required this.label});
  final int end;
  final String prefix, suffix, label;

  @override
  Widget build(BuildContext context) {
    final ffTheme = AppTheme.of(context);
    return Column(
      children: [
        TweenAnimationBuilder<int>(
          tween: IntTween(begin: 0, end: end),
          duration: const Duration(milliseconds: 1200),
          curve: Curves.easeOut,
          builder: (_, val, __) {
            final display = end >= 1000 ? '${(val / 1000).round()}K' : '$val';
            return Text(
              '$prefix$display$suffix',
              style: GoogleFonts.rubik(fontSize: 18, fontWeight: FontWeight.w800, color: ffTheme.primary),
            );
          },
        ),
        Text(label, style: ffTheme.labelSmall),
      ],
    );
  }
}

class _StatDivider extends StatelessWidget {
  const _StatDivider();

  @override
  Widget build(BuildContext context) =>
      Container(width: 1, height: 32, color: AppTheme.of(context).lineColor);
}

class _NumberedStep extends StatelessWidget {
  const _NumberedStep({
    required this.n,
    required this.icon,
    required this.title,
    required this.subtitle,
    this.isLast = false,
  });
  final int n;
  final IconData icon;
  final String title, subtitle;
  final bool isLast;

  @override
  Widget build(BuildContext context) {
    final ffTheme = AppTheme.of(context);
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Column(
          children: [
            Container(
              width: 36,
              height: 36,
              decoration: BoxDecoration(color: ffTheme.primary, shape: BoxShape.circle),
              child: Center(
                child: Text('$n', style: GoogleFonts.rubik(fontSize: 14, fontWeight: FontWeight.w800, color: Colors.white)),
              ),
            ),
            if (!isLast)
              Container(
                width: 2,
                height: 36,
                margin: const EdgeInsets.symmetric(vertical: 3),
                decoration: BoxDecoration(
                  color: ffTheme.primary.withValues(alpha: 0.25),
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
          ],
        ),
        const SizedBox(width: 14),
        Expanded(
          child: Padding(
            padding: EdgeInsets.only(bottom: isLast ? 0 : 18, top: 6),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Icon(icon, size: 20, color: ffTheme.primary),
                    const SizedBox(width: 8),
                    Expanded(child: Text(title, style: ffTheme.titleSmall)),
                  ],
                ),
                const SizedBox(height: 4),
                Text(subtitle, style: ffTheme.bodySmall),
              ],
            ),
          ),
        ),
      ],
    );
  }
}

class _ValueProp extends StatelessWidget {
  const _ValueProp({
    required this.icon,
    required this.title,
    required this.text,
    this.isLast = false,
  });
  final IconData icon;
  final String title, text;
  final bool isLast;

  @override
  Widget build(BuildContext context) {
    final ffTheme = AppTheme.of(context);
    return Padding(
      padding: EdgeInsets.only(bottom: isLast ? 0 : 14),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 42,
            height: 42,
            decoration: BoxDecoration(color: ffTheme.accent1, borderRadius: BorderRadius.circular(12)),
            child: Icon(icon, size: 22, color: ffTheme.primary),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title, style: ffTheme.titleSmall),
                const SizedBox(height: 3),
                Text(text, style: ffTheme.bodySmall.copyWith(color: ffTheme.secondaryText, height: 1.4)),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _FAQHeader extends StatelessWidget {
  const _FAQHeader();

  @override
  Widget build(BuildContext context) {
    final ffTheme = AppTheme.of(context);
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Text('שאלות נפוצות', style: ffTheme.headlineMedium),
    );
  }
}

class _FAQ extends StatefulWidget {
  const _FAQ({required this.q, required this.a});
  final String q, a;

  @override
  State<_FAQ> createState() => _FAQState();
}

class _FAQState extends State<_FAQ> {
  bool _open = false;

  @override
  Widget build(BuildContext context) {
    final ffTheme = AppTheme.of(context);
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      decoration: BoxDecoration(
        color: ffTheme.background,
        borderRadius: BorderRadius.circular(ffTheme.radiusSm),
        // Open = active → a green ACTION ring tells the user which row is live.
        border: Border.all(color: _open ? ffTheme.brandAccent.withValues(alpha: 0.5) : ffTheme.alternate),
      ),
      child: InkWell(
        onTap: () => setState(() => _open = !_open),
        borderRadius: BorderRadius.circular(ffTheme.radiusSm),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Expanded(child: Text(widget.q, style: ffTheme.titleSmall.copyWith(fontWeight: FontWeight.w600))),
                  Icon(_open ? Icons.remove_rounded : Icons.add_rounded, size: 20, color: _open ? ffTheme.brandAccent : ffTheme.secondaryText),
                ],
              ),
              if (_open) ...[
                const SizedBox(height: 8),
                Text(widget.a, style: ffTheme.bodySmall.copyWith(color: ffTheme.secondaryText, height: 1.5)),
              ],
            ],
          ),
        ),
      ),
    );
  }
}
