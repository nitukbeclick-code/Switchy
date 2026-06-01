import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:flutter_animate/flutter_animate.dart';
import '../../flutter_flow/flutter_flow_theme.dart';
import '../../flutter_flow/flutter_flow_util.dart';
import '../../flutter_flow/flutter_flow_widgets.dart';
import '../../app_state.dart';

class OnboardingWidget extends StatefulWidget {
  const OnboardingWidget({super.key});

  @override
  State<OnboardingWidget> createState() => _OnboardingWidgetState();
}

class _OnboardingWidgetState extends State<OnboardingWidget> {
  int _page = 0;
  final _controller = PageController();

  static const _pages = [
    _OnboardPage(
      emoji: '💰',
      title: 'חסכו אלפי שקלים\nבשנה',
      subtitle: 'חוסך מוצא לכם את חבילות הסלולר, האינטרנט והטלוויזיה הזולות ביותר – בלחיצת כפתור.',
    ),
    _OnboardPage(
      emoji: '🔍',
      title: 'השוואת מחירים\nחכמה',
      subtitle: 'מאות חבילות ממובילי השוק – סלקום, פרטנר, גולן, HOT ועוד – כל הנתונים במקום אחד.',
    ),
    _OnboardPage(
      emoji: '🤝',
      title: 'מעבר קל\nוחלק',
      subtitle: 'אנחנו מלווים אתכם בכל שלב – מהבחירה ועד ניוד הקו, ללא לחץ וללא עלויות נסתרות.',
    ),
  ];

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void _next() {
    if (_page < _pages.length - 1) {
      _controller.nextPage(duration: const Duration(milliseconds: 350), curve: Curves.easeInOut);
    } else {
      context.goNamed('Home');
    }
  }

  @override
  Widget build(BuildContext context) {
    final ffTheme = FlutterFlowTheme.of(context);
    final isLast = _page == _pages.length - 1;

    return Scaffold(
      backgroundColor: ffTheme.background,
      body: SafeArea(
        child: Column(
          children: [
            // Skip button
            Align(
              alignment: Alignment.topLeft,
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: TextButton(
                  onPressed: () => context.goNamed('Home'),
                  child: Text('דלג', style: ffTheme.bodyMedium.override(color: ffTheme.secondaryText)),
                ),
              ),
            ),

            // Pages
            Expanded(
              child: PageView.builder(
                controller: _controller,
                onPageChanged: (i) => setState(() => _page = i),
                itemCount: _pages.length,
                itemBuilder: (_, i) => _PageContent(page: _pages[i]),
              ),
            ),

            // Dots
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: List.generate(_pages.length, (i) => AnimatedContainer(
                duration: const Duration(milliseconds: 300),
                margin: const EdgeInsets.symmetric(horizontal: 4),
                width: i == _page ? 24 : 8,
                height: 8,
                decoration: BoxDecoration(
                  color: i == _page ? ffTheme.primary : ffTheme.alternate,
                  borderRadius: BorderRadius.circular(4),
                ),
              )),
            ),

            const SizedBox(height: 32),

            // Button
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 24),
              child: FFButtonWidget(
                text: isLast ? 'בואו נתחיל!' : 'הבא',
                onPressed: () async => _next(),
                options: FFButtonOptions(
                  width: double.infinity,
                  height: 56,
                  color: ffTheme.primary,
                  textStyle: ffTheme.titleMedium.override(color: Colors.white),
                  borderRadius: BorderRadius.circular(18),
                ),
              ),
            ),
            const SizedBox(height: 24),
          ],
        ),
      ),
    );
  }
}

class _PageContent extends StatelessWidget {
  const _PageContent({required this.page});
  final _OnboardPage page;

  @override
  Widget build(BuildContext context) {
    final ffTheme = FlutterFlowTheme.of(context);
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 32),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Text(page.emoji, style: const TextStyle(fontSize: 80))
              .animate().scale(duration: 400.ms, curve: Curves.elasticOut),
          const SizedBox(height: 32),
          Text(page.title, style: ffTheme.displaySmall, textAlign: TextAlign.center)
              .animate().fadeIn(delay: 100.ms).slideY(begin: 0.2, end: 0),
          const SizedBox(height: 16),
          Text(page.subtitle, style: ffTheme.bodyLarge.override(color: ffTheme.secondaryText), textAlign: TextAlign.center)
              .animate().fadeIn(delay: 200.ms).slideY(begin: 0.2, end: 0),
        ],
      ),
    );
  }
}

class _OnboardPage {
  const _OnboardPage({required this.emoji, required this.title, required this.subtitle});
  final String emoji;
  final String title;
  final String subtitle;
}
