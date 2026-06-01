import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:google_fonts/google_fonts.dart';
import '../../flutter_flow/flutter_flow_theme.dart';
import '../../flutter_flow/flutter_flow_util.dart';
import '../../flutter_flow/flutter_flow_widgets.dart';
import '../../app_state.dart';
import '../../data.dart';
import '../../models.dart';
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

  int _potentialSaving(int bill) {
    final catPlans = plansByCat('cellular');
    if (catPlans.isEmpty) return 0;
    final minPrice = catPlans.map((p) => p.price).reduce((a, b) => a < b ? a : b);
    return ((bill - minPrice) * 12).clamp(0, 9999);
  }

  @override
  Widget build(BuildContext context) {
    final ffTheme = FlutterFlowTheme.of(context);
    final appState = Provider.of<FFAppState>(context, listen: false);
    final plans = plansByCat(_activeCat).take(6).toList();
    final bill = _billInput.round();
    final saving = _potentialSaving(bill);

    return Scaffold(
      backgroundColor: ffTheme.background,
      body: CustomScrollView(
        slivers: [
          // Sticky nav
          SliverAppBar(
            pinned: true,
            backgroundColor: ffTheme.primary,
            elevation: 0,
            title: Row(
              children: [
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                  decoration: BoxDecoration(color: ffTheme.secondary, borderRadius: BorderRadius.circular(8)),
                  child: Text('חוסך', style: GoogleFonts.rubik(fontSize: 16, fontWeight: FontWeight.w800, color: const Color(0xFF0E3A26))),
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
                margin: const EdgeInsets.only(left: 16, top: 8, bottom: 8),
                child: ElevatedButton(
                  onPressed: () => context.goNamed('Home'),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: ffTheme.secondary,
                    foregroundColor: const Color(0xFF0E3A26),
                    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                  ),
                  child: Text('בדוק כמה תחסוך', style: GoogleFonts.rubik(fontSize: 12, fontWeight: FontWeight.w700)),
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
                  colors: [const Color(0xFF0E3A26), ffTheme.primary, ffTheme.tertiary],
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
                    'חסכנו לאלפי ישראלים יותר מ-₪850 בשנה',
                    style: GoogleFonts.assistant(fontSize: 14, color: Colors.white70),
                  ).animate().fadeIn(delay: 100.ms),
                  const SizedBox(height: 24),
                  Container(
                    padding: const EdgeInsets.all(16),
                    decoration: BoxDecoration(
                      color: Colors.white.withOpacity(0.15),
                      borderRadius: BorderRadius.circular(16),
                      border: Border.all(color: Colors.white.withOpacity(0.2)),
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
                                  Row(
                                    crossAxisAlignment: CrossAxisAlignment.end,
                                    children: [
                                      Text('₪${_billInput.round()}', style: GoogleFonts.rubik(fontSize: 36, fontWeight: FontWeight.w800, color: ffTheme.secondary)),
                                      const SizedBox(width: 6),
                                      Padding(
                                        padding: const EdgeInsets.only(bottom: 6),
                                        child: Text('לחודש', style: GoogleFonts.assistant(fontSize: 12, color: Colors.white54)),
                                      ),
                                    ],
                                  ),
                                  Slider(
                                    value: _billInput,
                                    min: 20,
                                    max: 500,
                                    activeColor: ffTheme.secondary,
                                    inactiveColor: Colors.white24,
                                    onChanged: (v) => setState(() => _billInput = v),
                                  ),
                                  if (saving > 0)
                                    AnimatedSwitcher(
                                      duration: const Duration(milliseconds: 300),
                                      child: Container(
                                        key: ValueKey(saving),
                                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                                        decoration: BoxDecoration(
                                          color: ffTheme.secondary.withOpacity(0.2),
                                          borderRadius: BorderRadius.circular(8),
                                        ),
                                        child: Row(
                                          mainAxisSize: MainAxisSize.min,
                                          children: [
                                            const Text('💰', style: TextStyle(fontSize: 12)),
                                            const SizedBox(width: 4),
                                            Text(
                                              'תוכלו לחסוך עד ₪$saving בשנה!',
                                              style: GoogleFonts.rubik(fontSize: 11, fontWeight: FontWeight.w700, color: ffTheme.secondary),
                                            ),
                                          ],
                                        ),
                                      ),
                                    ),
                                ],
                              ),
                            ),
                            const SizedBox(width: 12),
                            ElevatedButton(
                              onPressed: () {
                                appState.setCurrentBill('cellular', _billInput.round());
                                context.goNamed('Home');
                              },
                              style: ElevatedButton.styleFrom(
                                backgroundColor: ffTheme.secondary,
                                foregroundColor: const Color(0xFF0E3A26),
                                padding: const EdgeInsets.symmetric(horizontal: 22, vertical: 16),
                                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                                elevation: 0,
                              ),
                              child: Column(
                                children: [
                                  Text('בדוק', style: GoogleFonts.rubik(fontSize: 16, fontWeight: FontWeight.w800)),
                                  Text('עכשיו', style: GoogleFonts.rubik(fontSize: 10, fontWeight: FontWeight.w600)),
                                ],
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

          // Stats bar
          SliverToBoxAdapter(
            child: Container(
              color: Colors.white,
              padding: const EdgeInsets.symmetric(vertical: 20),
              child: Column(
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                    children: const [
                      _Stat(value: '60,000+', label: 'לקוחות'),
                      _StatDivider(),
                      _Stat(value: '₪850', label: 'חיסכון ממוצע'),
                      _StatDivider(),
                      _Stat(value: '200+', label: 'מסלולים'),
                      _StatDivider(),
                      _Stat(value: '4.8★', label: 'דירוג'),
                    ],
                  ),
                  const SizedBox(height: 14),
                  Container(
                    margin: const EdgeInsets.symmetric(horizontal: 20),
                    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                    decoration: BoxDecoration(
                      color: const Color(0xFFF4F0E8),
                      borderRadius: BorderRadius.circular(20),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Container(
                          width: 7,
                          height: 7,
                          decoration: const BoxDecoration(color: Color(0xFF15603E), shape: BoxShape.circle),
                        ).animate(onPlay: (c) => c.repeat(reverse: true))
                          .scale(begin: const Offset(1, 1), end: const Offset(1.5, 1.5), duration: 900.ms),
                        const SizedBox(width: 8),
                        Text(
                          '${saving > 0 ? "אפשר לחסוך עד ₪$saving בשנה לפי החשבון שלך" : "גלגל את הסליידר למעלה ובדוק כמה תחסוך"}',
                          style: GoogleFonts.assistant(fontSize: 12, fontWeight: FontWeight.w600, color: const Color(0xFF15603E)),
                        ),
                      ],
                    ),
                  ),
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
                        return GestureDetector(
                          onTap: () => setState(() => _activeCat = cat.id),
                          child: AnimatedContainer(
                            duration: const Duration(milliseconds: 200),
                            margin: const EdgeInsets.only(left: 8),
                            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 9),
                            decoration: BoxDecoration(
                              color: active ? ffTheme.primary : Colors.white,
                              borderRadius: BorderRadius.circular(24),
                              border: Border.all(color: active ? ffTheme.primary : ffTheme.alternate),
                            ),
                            child: Row(
                              children: [
                                Text(cat.icon, style: const TextStyle(fontSize: 14)),
                                const SizedBox(width: 6),
                                Text(cat.name, style: ffTheme.labelMedium.override(color: active ? Colors.white : ffTheme.primaryText)),
                              ],
                            ),
                          ),
                        );
                      }).toList(),
                    ),
                  ),
                  const SizedBox(height: 16),
                  ...plans.map((p) => PlanCardWidget(plan: p, currentBill: bill)),
                  if (plans.length >= 6)
                    Center(
                      child: TextButton(
                        onPressed: () {
                          appState.setCategory(_activeCat);
                          context.goNamed('Home');
                        },
                        child: Text('ראה את כל המסלולים →', style: ffTheme.titleSmall.override(color: ffTheme.primary)),
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
                  ...const [
                    _Step(emoji: '🔍', title: 'בחר קטגוריה ומלא פרטים', subtitle: 'ספר לנו על הצרכים שלך'),
                    _Step(emoji: '💰', title: 'ראה השוואת מחירים מלאה', subtitle: 'כל הספקים במקום אחד, שקוף ואמין'),
                    _Step(emoji: '🤝', title: 'נלווה אותך במעבר', subtitle: 'נציג אישי מנהל את כל התהליך בשבילך'),
                  ],
                ],
              ),
            ).animate().fadeIn(delay: 400.ms),
          ),

          // Testimonials
          SliverToBoxAdapter(
            child: Container(
              padding: const EdgeInsets.fromLTRB(20, 28, 20, 28),
              color: Colors.white,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Text('מה אומרים הלקוחות שלנו', style: ffTheme.headlineMedium),
                      const Spacer(),
                      Row(
                        children: List.generate(5, (_) => Icon(Icons.star_rounded, size: 14, color: ffTheme.warning)),
                      ),
                    ],
                  ),
                  const SizedBox(height: 16),
                  SingleChildScrollView(
                    scrollDirection: Axis.horizontal,
                    child: Row(
                      children: const [
                        _Testimonial(name: 'מאיה כהן', city: 'תל אביב', saving: 960, provider: 'גולן', text: 'חסכתי ₪80 לחודש בסלולר. הכל היה פשוט, ניוד המספר היה חלק לגמרי. ממליצה בחום!'),
                        _Testimonial(name: 'דן שפירא', city: 'חיפה', saving: 1200, provider: 'סלקום', text: 'מצאתי אינטרנט גיגה ב-₪99 ללא התחייבות. 3 שנים שמשלמים יותר, היום הפסקנו.'),
                        _Testimonial(name: 'נועה גרין', city: 'ירושלים', saving: 1440, provider: 'פרטנר', text: 'עברנו לחבילה משולבת עם Netflix. חוסכים ₪120 לחודש על אינטרנט + TV.'),
                        _Testimonial(name: 'יוסי לוי', city: 'ראשל"צ', saving: 720, provider: 'הוט', text: 'שירות מהיר. הנציג עשה הכל בשבילי, לא הייתי צריך לעשות כלום.'),
                      ],
                    ),
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
                  Text('כל הספקים', style: ffTheme.titleMedium.override(color: ffTheme.secondaryText)),
                  const SizedBox(height: 14),
                  Wrap(
                    spacing: 10,
                    runSpacing: 10,
                    alignment: WrapAlignment.center,
                    children: const ['פלאפון', 'סלקום', 'פרטנר', 'הוט', 'yes', 'בזק', 'גולן', '019 מובייל', 'Airalo', 'FreeTV', 'רמי לוי'].map((p) => LogoWidget(provider: p, size: 40)).toList(),
                  ),
                ],
              ),
            ),
          ),

          // FAQ section
          SliverToBoxAdapter(
            child: Container(
              padding: const EdgeInsets.all(20),
              color: Colors.white,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('שאלות נפוצות', style: ffTheme.headlineMedium),
                  const SizedBox(height: 12),
                  ...const [
                    _FAQ(q: 'האם השירות חינמי?', a: 'כן! חוסך הוא שירות חינמי לחלוטין. אנחנו מרוויחים עמלה מהספקים, לא ממך.'),
                    _FAQ(q: 'מה קורה לאחר שאני בוחר מסלול?', a: 'נציג חוסך יצור קשר תוך שעה, יסביר את התהליך ויסייע בכל שלב עד הניוד.'),
                    _FAQ(q: 'האם אפשר לנייד את המספר שלי?', a: 'כן! ניוד מספר בישראל הוא חינמי וזכות שלך. התהליך לוקח עד 3 ימי עסקים.'),
                    _FAQ(q: 'מה אם לא מרוצה מהספק החדש?', a: 'ניתן לנייד שוב בכל עת. לחבילות ללא התחייבות – ניתן לסגת מיד.'),
                  ],
                ],
              ),
            ).animate().fadeIn(delay: 400.ms),
          ),

          // CTA band
          SliverToBoxAdapter(
            child: Container(
              padding: const EdgeInsets.all(32),
              decoration: BoxDecoration(
                gradient: LinearGradient(colors: [const Color(0xFF0E3A26), ffTheme.primary]),
              ),
              child: Column(
                children: [
                  Text('מוכנים לחסוך?', style: GoogleFonts.rubik(fontSize: 28, fontWeight: FontWeight.w800, color: Colors.white)),
                  const SizedBox(height: 8),
                  Text('הצטרפו ל-60,000 ישראלים שכבר חוסכים', style: GoogleFonts.assistant(fontSize: 14, color: Colors.white70)),
                  const SizedBox(height: 20),
                  ElevatedButton(
                    onPressed: () => context.goNamed('Home'),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: ffTheme.secondary,
                      foregroundColor: const Color(0xFF0E3A26),
                      padding: const EdgeInsets.symmetric(horizontal: 36, vertical: 16),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                    ),
                    child: Text('בדוק כמה תחסוך עכשיו', style: GoogleFonts.rubik(fontSize: 16, fontWeight: FontWeight.w800)),
                  ),
                ],
              ),
            ),
          ),

          // Footer
          SliverToBoxAdapter(
            child: Container(
              padding: const EdgeInsets.all(20),
              color: const Color(0xFF0E3A26),
              child: Column(
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Text('חוסך', style: GoogleFonts.rubik(fontSize: 18, fontWeight: FontWeight.w800, color: const Color(0xFFC9EC4B))),
                    ],
                  ),
                  const SizedBox(height: 8),
                  Text('© 2026 חוסך. כל הזכויות שמורות.', style: GoogleFonts.assistant(fontSize: 11, color: Colors.white38)),
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
}

class _Stat extends StatelessWidget {
  const _Stat({required this.value, required this.label});
  final String value, label;

  @override
  Widget build(BuildContext context) {
    final ffTheme = FlutterFlowTheme.of(context);
    return Column(
      children: [
        Text(value, style: GoogleFonts.rubik(fontSize: 18, fontWeight: FontWeight.w800, color: ffTheme.primary)),
        Text(label, style: ffTheme.labelSmall),
      ],
    );
  }
}

class _StatDivider extends StatelessWidget {
  const _StatDivider();

  @override
  Widget build(BuildContext context) => Container(width: 1, height: 32, color: const Color(0xFFE5E0D5));
}

class _Testimonial extends StatelessWidget {
  const _Testimonial({required this.name, required this.city, required this.saving, required this.provider, required this.text});
  final String name, city, provider, text;
  final int saving;

  @override
  Widget build(BuildContext context) {
    final ffTheme = FlutterFlowTheme.of(context);
    return Container(
      width: 260,
      margin: const EdgeInsets.only(left: 12, bottom: 4),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: ffTheme.background,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: ffTheme.alternate),
        boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.04), blurRadius: 8, offset: const Offset(0, 2))],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 36,
                height: 36,
                decoration: BoxDecoration(color: ffTheme.accent1, shape: BoxShape.circle),
                child: Center(child: Text(name[0], style: GoogleFonts.rubik(fontSize: 16, fontWeight: FontWeight.w700, color: ffTheme.primary))),
              ),
              const SizedBox(width: 10),
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(name, style: ffTheme.labelLarge),
                  Text(city, style: ffTheme.labelSmall),
                ],
              ),
              const Spacer(),
              Row(children: List.generate(5, (_) => Icon(Icons.star_rounded, size: 12, color: ffTheme.warning))),
            ],
          ),
          const SizedBox(height: 10),
          Text(text, style: ffTheme.bodySmall.override(lineHeight: 1.5), maxLines: 3, overflow: TextOverflow.ellipsis),
          const SizedBox(height: 10),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
            decoration: BoxDecoration(color: ffTheme.secondary, borderRadius: BorderRadius.circular(8)),
            child: Text('חסך ₪$saving/שנה → $provider', style: ffTheme.labelSmall.override(color: const Color(0xFF0E3A26), fontWeight: FontWeight.w700)),
          ),
        ],
      ),
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
    final ffTheme = FlutterFlowTheme.of(context);
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      decoration: BoxDecoration(
        color: ffTheme.background,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: _open ? ffTheme.primary.withOpacity(0.3) : ffTheme.alternate),
      ),
      child: InkWell(
        onTap: () => setState(() => _open = !_open),
        borderRadius: BorderRadius.circular(12),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Expanded(child: Text(widget.q, style: ffTheme.titleSmall.override(fontWeight: FontWeight.w600))),
                  Icon(_open ? Icons.remove_rounded : Icons.add_rounded, size: 20, color: ffTheme.primary),
                ],
              ),
              if (_open) ...[
                const SizedBox(height: 8),
                Text(widget.a, style: ffTheme.bodySmall.override(color: ffTheme.secondaryText, lineHeight: 1.5)),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

class _Step extends StatelessWidget {
  const _Step({required this.emoji, required this.title, required this.subtitle});
  final String emoji, title, subtitle;

  @override
  Widget build(BuildContext context) {
    final ffTheme = FlutterFlowTheme.of(context);
    return Padding(
      padding: const EdgeInsets.only(bottom: 16),
      child: Row(
        children: [
          Container(
            width: 52,
            height: 52,
            decoration: BoxDecoration(color: Colors.white, shape: BoxShape.circle, boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.06), blurRadius: 10)]),
            child: Center(child: Text(emoji, style: const TextStyle(fontSize: 24))),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title, style: ffTheme.titleSmall),
                Text(subtitle, style: ffTheme.bodySmall),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
