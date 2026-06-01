import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../flutter_flow/flutter_flow_theme.dart';
import '../../flutter_flow/flutter_flow_util.dart';
import '../../flutter_flow/flutter_flow_widgets.dart';
import '../../app_state.dart';

class QuizWidget extends StatefulWidget {
  const QuizWidget({super.key});

  @override
  State<QuizWidget> createState() => _QuizWidgetState();
}

class _QuizWidgetState extends State<QuizWidget> {
  int _step = 0;
  String _cat = 'cellular';
  int _lines = 1;
  String _priority = 'price';
  double _budget = 90;

  static const _cats = [
    ('cellular', 'סלולר', '📱'),
    ('internet', 'אינטרנט', '🌐'),
    ('tv', 'טלוויזיה', '📺'),
    ('triple', 'חבילה משולבת', '🏠'),
  ];

  @override
  Widget build(BuildContext context) {
    final ffTheme = FlutterFlowTheme.of(context);

    return Scaffold(
      backgroundColor: ffTheme.background,
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        leading: IconButton(
          icon: Icon(Icons.close_rounded, color: ffTheme.primaryText),
          onPressed: () => context.safePop(),
        ),
        title: Text('שאלון חיסכון', style: ffTheme.titleLarge),
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(6),
          child: LinearProgressIndicator(
            value: (_step + 1) / 4,
            backgroundColor: ffTheme.alternate,
            valueColor: AlwaysStoppedAnimation(ffTheme.primary),
          ),
        ),
      ),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            children: [
              Expanded(
                child: AnimatedSwitcher(
                  duration: const Duration(milliseconds: 350),
                  transitionBuilder: (child, animation) => FadeTransition(
                    opacity: animation,
                    child: SlideTransition(
                      position: Tween<Offset>(begin: const Offset(0.08, 0), end: Offset.zero).animate(animation),
                      child: child,
                    ),
                  ),
                  child: KeyedSubtree(key: ValueKey(_step), child: _buildStep(ffTheme)),
                ),
              ),
              const SizedBox(height: 16),
              Row(
                children: [
                  if (_step > 0)
                    Padding(
                      padding: const EdgeInsets.only(left: 12),
                      child: OutlinedButton(
                        onPressed: () => setState(() => _step--),
                        style: OutlinedButton.styleFrom(
                          foregroundColor: ffTheme.secondaryText,
                          side: BorderSide(color: ffTheme.alternate),
                          minimumSize: const Size(52, 56),
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18)),
                        ),
                        child: const Icon(Icons.arrow_forward_ios_rounded, size: 18),
                      ),
                    ),
                  Expanded(
                    child: FFButtonWidget(
                      text: _step < 3 ? 'הבא ←' : '🔍 הצג תוצאות',
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
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildStep(FlutterFlowTheme ffTheme) {
    switch (_step) {
      case 0:
        return _StepCard(
          step: 1,
          title: 'מה אתם מחפשים?',
          subtitle: 'בחרו את הקטגוריה הרלוונטית',
          ffTheme: ffTheme,
          child: Wrap(
            spacing: 12,
            runSpacing: 12,
            children: _cats.map((c) => _ChoiceChip(
              emoji: c.$3,
              label: c.$2,
              selected: _cat == c.$1,
              onTap: () => setState(() => _cat = c.$1),
              ffTheme: ffTheme,
            )).toList(),
          ),
        );
      case 1:
        if (_cat == 'internet') {
          return _StepCard(
            step: 2,
            title: 'איזו מהירות אינטרנט?',
            subtitle: 'בחרו מה מתאים לשימוש שלכם',
            ffTheme: ffTheme,
            child: Column(
              children: [
                ('speed_basic', 'מהיר — עד 200Mb', '🏃'),
                ('speed_fast', 'מהיר מאוד — 500Mb+', '⚡'),
                ('speed_ultra', 'גיגה — 1000Mb', '🚀'),
              ].map((p) => _RadioTile(
                emoji: p.$3,
                label: p.$2,
                selected: _priority == p.$1,
                onTap: () => setState(() => _priority = p.$1),
                ffTheme: ffTheme,
              )).toList(),
            ),
          );
        }
        if (_cat == 'tv') {
          return _StepCard(
            step: 2,
            title: 'מה הכי חשוב לכם בטלוויזיה?',
            subtitle: 'בחרו קריטריון עיקרי',
            ffTheme: ffTheme,
            child: Column(
              children: [
                ('channels', 'מגוון ערוצים רחב', '📡'),
                ('sport', 'ספורט חי וסדרות', '⚽'),
                ('price', 'מחיר נמוך', '💰'),
              ].map((p) => _RadioTile(
                emoji: p.$3,
                label: p.$2,
                selected: _priority == p.$1,
                onTap: () => setState(() => _priority = p.$1),
                ffTheme: ffTheme,
              )).toList(),
            ),
          );
        }
        return _StepCard(
          step: 2,
          title: 'כמה קווים?',
          subtitle: 'מספר קווי הסלולר במשפחה',
          ffTheme: ffTheme,
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              IconButton(
                onPressed: () => setState(() { if (_lines > 1) _lines--; }),
                icon: Icon(Icons.remove_circle_outline_rounded, size: 36, color: ffTheme.primary),
              ),
              const SizedBox(width: 16),
              Text('$_lines', style: ffTheme.displaySmall),
              const SizedBox(width: 16),
              IconButton(
                onPressed: () => setState(() { if (_lines < 10) _lines++; }),
                icon: Icon(Icons.add_circle_outline_rounded, size: 36, color: ffTheme.primary),
              ),
            ],
          ),
        );
      case 2:
        return _StepCard(
          step: 3,
          title: 'מה הכי חשוב לכם?',
          subtitle: 'מה תעדיפו בחבילה החדשה',
          ffTheme: ffTheme,
          child: Column(
            children: [
              ('price', 'מחיר נמוך', '💰'),
              ('speed', 'מהירות גבוהה', '⚡'),
              ('abroad', 'גלישה בחו"ל', '✈️'),
              ('nocommit', 'ללא התחייבות', '🔓'),
            ].map((p) => _RadioTile(
              emoji: p.$1 == 'price' ? '💰' : p.$1 == 'speed' ? '⚡' : p.$1 == 'abroad' ? '✈️' : '🔓',
              label: p.$2,
              selected: _priority == p.$1,
              onTap: () => setState(() => _priority = p.$1),
              ffTheme: ffTheme,
            )).toList(),
          ),
        );
      case 3:
      default:
        return _StepCard(
          step: 4,
          title: 'מה התקציב החודשי?',
          subtitle: 'הגדירו את הסכום המקסימלי שאתם מוכנים לשלם',
          ffTheme: ffTheme,
          child: Column(
            children: [
              Text(
                '₪${_budget.round()}',
                style: ffTheme.displayMedium.override(color: ffTheme.primary),
              ),
              const SizedBox(height: 16),
              Slider(
                value: _budget,
                min: 20,
                max: 300,
                divisions: 56,
                activeColor: ffTheme.primary,
                inactiveColor: ffTheme.alternate,
                onChanged: (v) => setState(() => _budget = v),
              ),
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text('₪20', style: ffTheme.labelSmall),
                  Text('₪300', style: ffTheme.labelSmall),
                ],
              ),
            ],
          ),
        );
    }
  }

  void _next() {
    if (_step < 3) {
      setState(() => _step++);
    } else {
      final appState = Provider.of<FFAppState>(context, listen: false);
      appState.setCategory(_cat);
      appState.setQuizLines(_lines);
      appState.setQuizPriority(_priority);
      appState.setQuizBudget(_budget.round());
      appState.setQuizCompleted(true);
      // Apply quiz priority as a smart filter/sort
      appState.clearFilters();
      if (_priority == 'nocommit') appState.toggleFilter('nocommit');
      if (_priority == 'abroad') appState.toggleFilter('abroad');
      if (_priority == 'price') appState.setSortMode('price');
      if (_priority == 'speed' || _priority == 'speed_ultra') appState.setSortMode('match');
      if (_priority == 'speed_fast') appState.setSortMode('match');
      context.goNamed('Results');
    }
  }
}

class _StepCard extends StatelessWidget {
  const _StepCard({required this.step, required this.title, required this.subtitle, required this.ffTheme, required this.child});
  final int step;
  final String title;
  final String subtitle;
  final FlutterFlowTheme ffTheme;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('שלב $step מתוך 4', style: ffTheme.labelMedium),
          const SizedBox(height: 8),
          Text(title, style: ffTheme.headlineMedium),
          const SizedBox(height: 4),
          Text(subtitle, style: ffTheme.bodyMedium.override(color: ffTheme.secondaryText)),
          const SizedBox(height: 32),
          child,
        ],
      ),
    );
  }
}

class _ChoiceChip extends StatelessWidget {
  const _ChoiceChip({required this.emoji, required this.label, required this.selected, required this.onTap, required this.ffTheme});
  final String emoji;
  final String label;
  final bool selected;
  final VoidCallback onTap;
  final FlutterFlowTheme ffTheme;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 200),
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        decoration: BoxDecoration(
          color: selected ? ffTheme.primary : ffTheme.secondaryBackground,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: selected ? ffTheme.primary : ffTheme.alternate, width: 1.5),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(emoji, style: const TextStyle(fontSize: 18)),
            const SizedBox(width: 8),
            Text(label, style: ffTheme.labelLarge.override(color: selected ? Colors.white : ffTheme.primaryText)),
          ],
        ),
      ),
    );
  }
}

class _RadioTile extends StatelessWidget {
  const _RadioTile({required this.emoji, required this.label, required this.selected, required this.onTap, required this.ffTheme});
  final String emoji;
  final String label;
  final bool selected;
  final VoidCallback onTap;
  final FlutterFlowTheme ffTheme;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 200),
        margin: const EdgeInsets.only(bottom: 10),
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        decoration: BoxDecoration(
          color: selected ? ffTheme.accent1 : ffTheme.secondaryBackground,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: selected ? ffTheme.primary : ffTheme.alternate, width: selected ? 2 : 1),
        ),
        child: Row(
          children: [
            Text(emoji, style: const TextStyle(fontSize: 22)),
            const SizedBox(width: 12),
            Expanded(child: Text(label, style: ffTheme.bodyLarge.override(color: selected ? ffTheme.primary : ffTheme.primaryText))),
            if (selected) Icon(Icons.check_circle_rounded, color: ffTheme.primary),
          ],
        ),
      ),
    );
  }
}
