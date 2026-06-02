import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../flutter_flow/flutter_flow_theme.dart';
import '../../flutter_flow/flutter_flow_util.dart';
import '../../flutter_flow/flutter_flow_widgets.dart';
import '../../app_state.dart';
import '../../data.dart';

class QuizWidget extends StatefulWidget {
  const QuizWidget({super.key});

  @override
  State<QuizWidget> createState() => _QuizWidgetState();
}

class _QuizWidgetState extends State<QuizWidget> {
  int _step = 0;
  late String _cat;
  late int _lines;
  late String _priority;
  String? _extraFilter; // secondary preference for internet/tv
  late double _budget;

  @override
  void initState() {
    super.initState();
    final appState = FFAppState();
    // Pre-fill from existing quiz state if already completed
    _cat = appState.selectedCat;
    _lines = appState.quizLines;
    _priority = appState.quizPriority;
    _budget = appState.quizBudget > 0 ? appState.quizBudget.toDouble() : _defaultBudget(appState.selectedCat);
  }

  static const _cats = [
    ('cellular', 'סלולר', '📱'),
    ('internet', 'אינטרנט', '🌐'),
    ('tv', 'טלוויזיה', '📺'),
    ('triple', 'חבילה משולבת', '🏠'),
    ('abroad', 'חו"ל', '✈️'),
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
        if (_cat == 'internet' || _cat == 'triple') {
          return _StepCard(
            step: 2,
            title: _cat == 'triple' ? 'איזה אינטרנט חשוב לכם?' : 'איזו מהירות אינטרנט?',
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
        if (_cat == 'abroad') {
          return _StepCard(
            step: 2,
            title: 'לכמה זמן נוסעים?',
            subtitle: 'זה ישפיע על סוג החבילה המומלצת',
            ffTheme: ffTheme,
            child: Column(
              children: [
                ('price', 'נסיעה קצרה — עד שבוע', '🛫'),
                ('data', 'נסיעה ארוכה — חודש+', '🌍'),
                ('nocommit', 'נסיעות תכופות', '✈️'),
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
        if (_cat == 'triple') {
          return _StepCard(
            step: 3,
            title: 'מה עוד חשוב בחבילה?',
            subtitle: 'בחרו תוספת שתשפר את החוויה',
            ffTheme: ffTheme,
            child: Column(
              children: [
                ('netflix', 'Netflix / VOD כלול', '🎬'),
                ('sport', 'ערוצי ספורט', '⚽'),
                ('nocommit', 'ללא התחייבות', '🔓'),
                ('price', 'מחיר נמוך', '💰'),
              ].map((p) => _RadioTile(
                emoji: p.$3,
                label: p.$2,
                selected: _extraFilter == p.$1,
                onTap: () => setState(() => _extraFilter = p.$1),
                ffTheme: ffTheme,
              )).toList(),
            ),
          );
        }
        if (_cat == 'internet') {
          return _StepCard(
            step: 3,
            title: 'מה עוד חשוב לך?',
            subtitle: 'מעבר למהירות שבחרת',
            ffTheme: ffTheme,
            child: Column(
              children: [
                ('nocommit', 'ללא התחייבות', '🔓'),
                ('price', 'מחיר הכי נמוך', '💰'),
                ('streaming', 'כולל שירותי סטרימינג', '🎬'),
                ('reliability', 'אמינות ויציבות', '🛡️'),
              ].map((p) => _RadioTile(
                emoji: p.$3,
                label: p.$2,
                selected: _extraFilter == p.$1,
                onTap: () => setState(() => _extraFilter = p.$1),
                ffTheme: ffTheme,
              )).toList(),
            ),
          );
        }
        if (_cat == 'tv') {
          return _StepCard(
            step: 3,
            title: 'מה עוד חשוב לך?',
            subtitle: 'מעבר לתוכן שבחרת',
            ffTheme: ffTheme,
            child: Column(
              children: [
                ('nocommit', 'ללא התחייבות', '🔓'),
                ('price', 'מחיר הכי נמוך', '💰'),
                ('sport', 'ערוצי ספורט', '⚽'),
                ('netflix', 'Netflix / VOD', '🎬'),
              ].map((p) => _RadioTile(
                emoji: p.$3,
                label: p.$2,
                selected: _extraFilter == p.$1,
                onTap: () => setState(() => _extraFilter = p.$1),
                ffTheme: ffTheme,
              )).toList(),
            ),
          );
        }
        if (_cat == 'abroad') {
          return _StepCard(
            step: 3,
            title: 'מה הכי חשוב לך בחו"ל?',
            subtitle: 'בחר את הדבר הכי חשוב בנסיעות',
            ffTheme: ffTheme,
            child: Column(
              children: [
                ('price', 'מחיר נמוך', '💰'),
                ('data', 'הרבה גלישה', '📶'),
                ('esim', 'eSIM מיידי', '📲'),
                ('nocommit', 'גמישות — ביטול חופשי', '🔓'),
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
              emoji: p.$3,
              label: p.$2,
              selected: _priority == p.$1,
              onTap: () => setState(() => _priority = p.$1),
              ffTheme: ffTheme,
            )).toList(),
          ),
        );
      case 3:
      default:
        final sliderConfig = _budgetConfig(_cat);
        final clampedBudget = _budget.clamp(sliderConfig.$1, sliderConfig.$2);
        if (_budget != clampedBudget) WidgetsBinding.instance.addPostFrameCallback((_) => setState(() => _budget = clampedBudget));
        final planCount = plansByCat(_cat).where((p) => p.price <= clampedBudget.round()).length;
        return _StepCard(
          step: 4,
          title: _cat == 'abroad' ? 'מה התקציב לנסיעה?' : 'מה התקציב החודשי?',
          subtitle: _cat == 'abroad' ? 'לפי עלות חבילת הנסיעה' : 'הגדירו את הסכום המקסימלי שאתם מוכנים לשלם',
          ffTheme: ffTheme,
          child: Column(
            children: [
              Text(
                '₪${clampedBudget.round()}${_cat == 'abroad' ? '' : '/חודש'}',
                style: ffTheme.displayMedium.override(color: ffTheme.primary),
              ),
              const SizedBox(height: 4),
              Text(
                '$planCount מסלולים בתקציב זה',
                style: ffTheme.labelMedium.override(
                  color: planCount > 0 ? ffTheme.success : ffTheme.error,
                  fontWeight: FontWeight.w600,
                ),
              ),
              const SizedBox(height: 16),
              Slider(
                value: clampedBudget,
                min: sliderConfig.$1,
                max: sliderConfig.$2,
                divisions: sliderConfig.$3,
                activeColor: ffTheme.primary,
                inactiveColor: ffTheme.alternate,
                onChanged: (v) => setState(() => _budget = v),
              ),
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text('₪${sliderConfig.$1.round()}', style: ffTheme.labelSmall),
                  Text('₪${sliderConfig.$2.round()}', style: ffTheme.labelSmall),
                ],
              ),
              const SizedBox(height: 16),
              // Quick presets — category-specific
              Wrap(
                spacing: 8,
                runSpacing: 8,
                alignment: WrapAlignment.center,
                children: _budgetPresets(_cat).map((preset) {
                  final active = clampedBudget.round() == preset;
                  return GestureDetector(
                    onTap: () => setState(() => _budget = preset.toDouble()),
                    child: AnimatedContainer(
                      duration: const Duration(milliseconds: 180),
                      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 7),
                      decoration: BoxDecoration(
                        color: active ? ffTheme.primary : Colors.white,
                        borderRadius: BorderRadius.circular(20),
                        border: Border.all(color: active ? ffTheme.primary : ffTheme.alternate),
                      ),
                      child: Text('₪$preset',
                        style: ffTheme.labelMedium.override(
                          color: active ? Colors.white : ffTheme.primaryText,
                          fontWeight: active ? FontWeight.w700 : FontWeight.w500,
                        )),
                    ),
                  );
                }).toList(),
              ),
            ],
          ),
        );
    }
  }

  double _defaultBudget(String cat) {
    switch (cat) {
      case 'abroad': return 25.0;
      case 'triple': return 199.0;
      case 'internet': return 119.0;
      case 'tv': return 89.0;
      default: return 119.0;
    }
  }

  // Returns (min, max, divisions) for budget slider based on category
  (double, double, int) _budgetConfig(String cat) {
    switch (cat) {
      case 'abroad': return (5.0, 100.0, 19);
      case 'triple': return (50.0, 400.0, 70);
      case 'internet': return (30.0, 300.0, 54);
      case 'tv': return (0.0, 200.0, 40);
      default: return (20.0, 300.0, 56); // cellular
    }
  }

  List<int> _budgetPresets(String cat) {
    switch (cat) {
      case 'abroad': return [10, 15, 25, 39, 50, 75];
      case 'triple': return [99, 139, 179, 219, 299, 349];
      case 'internet': return [49, 79, 99, 129, 159, 199];
      case 'tv': return [0, 49, 69, 89, 119, 149];
      default: return [29, 39, 59, 89, 119, 149]; // cellular
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
      appState.clearFilters();
      // Apply primary priority
      if (_priority == 'nocommit') appState.toggleFilter('nocommit');
      if (_priority == 'abroad') appState.toggleFilter('abroad');
      if (_priority == 'esim') appState.toggleFilter('esim');
      if (_priority == 'sport') appState.toggleFilter('sport');
      if (_priority == 'channels') appState.setSortMode('match');
      if (_priority == 'price') appState.setSortMode('price');
      if (_priority == 'data') appState.setSortMode('match');
      if (_priority == 'speed' || _priority == 'speed_ultra' || _priority == 'speed_fast') appState.setSortMode('match');
      // Apply secondary filter (internet/tv/triple step 2 choice)
      if (_extraFilter != null) {
        if (_extraFilter == 'nocommit') appState.toggleFilter('nocommit');
        if (_extraFilter == 'streaming') appState.toggleFilter('streaming');
        if (_extraFilter == 'sport') appState.toggleFilter('sport');
        if (_extraFilter == 'netflix') appState.toggleFilter('netflix');
        if (_extraFilter == 'price') appState.setSortMode('price');
      }
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
