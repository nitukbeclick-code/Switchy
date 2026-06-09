import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import 'package:share_plus/share_plus.dart';
import '../../theme/app_theme.dart';
import '../../core/nav.dart';
import '../../widgets/app_button.dart';
import '../../app_state.dart';
import '../../data.dart';
import '../../services/recommendation_engine.dart';
import '../../services/backend/local_backend.dart';

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
  late double _currentBill; // what the user pays today — the savings baseline

  // Reveal phase
  bool _revealed = false;
  bool _analyzing = false;
  List<PlanMatch> _recs = [];

  @override
  void initState() {
    super.initState();
    final appState = AppState();
    // Pre-fill from existing quiz state if already completed
    _cat = appState.selectedCat;
    _lines = appState.quizLines;
    _priority = appState.quizPriority;
    // Pre-fill budget: prefer previous quiz budget, then current bill, then default
    final catBill = appState.currentBill(appState.selectedCat);
    final rawBudget = appState.quizBudget > 0
        ? appState.quizBudget.toDouble()
        : catBill > 0
            ? catBill.toDouble()
            : _defaultBudget(appState.selectedCat);
    final cfg = _budgetConfig(appState.selectedCat);
    _budget = rawBudget.clamp(cfg.$1, cfg.$2);
    // Seed today's-bill from any saved bill, else a sensible default.
    _currentBill = (catBill > 0 ? catBill.toDouble() : _defaultBudget(appState.selectedCat))
        .clamp(cfg.$1, cfg.$2);
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
    final ffTheme = AppTheme.of(context);

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
            value: (_step + 1) / 5,
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
                  child: _analyzing
                      ? _buildAnalyzing(ffTheme)
                      : _revealed
                          ? KeyedSubtree(key: const ValueKey('reveal'), child: _buildReveal(ffTheme))
                          : KeyedSubtree(key: ValueKey(_step), child: _buildStep(ffTheme)),
                ),
              ),
              const SizedBox(height: 16),
              if (_analyzing)
                const SizedBox.shrink()
              else if (_revealed) ...[
                AppButton(
                  text: 'ראה את כל המסלולים ←',
                  onPressed: () async {
                    HapticFeedback.lightImpact();
                    context.goNamed('Results');
                  },
                  width: double.infinity,
                  height: 56,
                  color: ffTheme.primary,
                  textStyle: ffTheme.titleMedium.copyWith(color: Colors.white),
                  borderRadius: BorderRadius.circular(18),
                ),
                const SizedBox(height: 8),
                TextButton(
                  onPressed: () => setState(() => _revealed = false),
                  child: Text('↺ ערוך תשובות',
                      style: ffTheme.bodyMedium.copyWith(color: ffTheme.secondaryText)),
                ),
              ] else Row(
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
                    child: AppButton(
                      text: _step < 4 ? 'הבא ←' : '🔍 הצג תוצאות',
                      onPressed: () async {
                        HapticFeedback.lightImpact();
                        await _next();
                      },
                      width: double.infinity,
                      height: 56,
                      color: ffTheme.primary,
                      textStyle: ffTheme.titleMedium.copyWith(color: Colors.white),
                      borderRadius: BorderRadius.circular(18),
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

  Widget _buildStep(AppTheme ffTheme) {
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
              onTap: () => setState(() {
                _cat = c.$1;
                final cfg = _budgetConfig(c.$1);
                _budget = _budget.clamp(cfg.$1, cfg.$2);
                _currentBill = _currentBill.clamp(cfg.$1, cfg.$2);
              }),
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
                tooltip: 'הפחת קו',
                onPressed: () => setState(() { if (_lines > 1) _lines--; }),
                icon: Icon(Icons.remove_circle_outline_rounded, size: 36, color: ffTheme.primary),
              ),
              const SizedBox(width: 16),
              Text('$_lines', style: ffTheme.displaySmall),
              const SizedBox(width: 16),
              IconButton(
                tooltip: 'הוסף קו',
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
                selected: _extraFilter == p.$1,
                onTap: () => setState(() => _extraFilter = p.$1),
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
        final billCfg = _budgetConfig(_cat);
        final clampedBill = _currentBill.clamp(billCfg.$1, billCfg.$2);
        return _StepCard(
          step: 4,
          title: _cat == 'abroad' ? 'כמה הוצאתם על גלישה בנסיעה האחרונה?' : 'כמה אתם משלמים היום?',
          subtitle: 'לפי זה נחשב בדיוק כמה תוכלו לחסוך',
          ffTheme: ffTheme,
          child: Column(
            children: [
              Text(
                '₪${clampedBill.round()}${_cat == 'abroad' ? '' : '/חודש'}',
                style: ffTheme.displayMedium.copyWith(color: ffTheme.primary),
              ),
              const SizedBox(height: 4),
              Text(
                'המחיר שאתם משלמים כיום',
                style: ffTheme.labelMedium.copyWith(color: ffTheme.secondaryText),
              ),
              const SizedBox(height: 16),
              Slider(
                value: clampedBill,
                min: billCfg.$1,
                max: billCfg.$2,
                divisions: billCfg.$3,
                activeColor: ffTheme.primary,
                inactiveColor: ffTheme.alternate,
                onChanged: (v) => setState(() => _currentBill = v),
              ),
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text('₪${billCfg.$1.round()}', style: ffTheme.labelSmall),
                  Text('₪${billCfg.$2.round()}', style: ffTheme.labelSmall),
                ],
              ),
              const SizedBox(height: 16),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                alignment: WrapAlignment.center,
                children: _budgetPresets(_cat).map((preset) {
                  final active = clampedBill.round() == preset;
                  return GestureDetector(
                    onTap: () => setState(() => _currentBill = preset.toDouble()),
                    child: AnimatedContainer(
                      duration: const Duration(milliseconds: 180),
                      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 7),
                      decoration: BoxDecoration(
                        color: active ? ffTheme.primary : Colors.white,
                        borderRadius: BorderRadius.circular(20),
                        border: Border.all(color: active ? ffTheme.primary : ffTheme.alternate),
                      ),
                      child: Text('₪$preset',
                        style: ffTheme.labelMedium.copyWith(
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
      case 4:
      default:
        final sliderConfig = _budgetConfig(_cat);
        final clampedBudget = _budget.clamp(sliderConfig.$1, sliderConfig.$2);
        final planCount = plansByCat(_cat).where((p) => p.price <= clampedBudget.round()).length;
        return _StepCard(
          step: 5,
          title: _cat == 'abroad' ? 'מה התקציב לנסיעה?' : 'מה התקציב החודשי?',
          subtitle: _cat == 'abroad' ? 'לפי עלות חבילת הנסיעה' : 'הגדירו את הסכום המקסימלי שאתם מוכנים לשלם',
          ffTheme: ffTheme,
          child: Column(
            children: [
              Text(
                '₪${clampedBudget.round()}${_cat == 'abroad' ? '' : '/חודש'}',
                style: ffTheme.displayMedium.copyWith(color: ffTheme.primary),
              ),
              const SizedBox(height: 4),
              Text(
                '$planCount מסלולים בתקציב זה',
                style: ffTheme.labelMedium.copyWith(
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
                        style: ffTheme.labelMedium.copyWith(
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

  MatchPriority _mapPriority() {
    if (_priority.startsWith('speed') || _priority == 'data') return MatchPriority.speed;
    if (_priority == 'nocommit') return MatchPriority.flexibility;
    if (_priority == 'channels' || _priority == 'reliability') return MatchPriority.coverage;
    if (_priority == 'sport' || _priority == 'netflix' || _priority == 'streaming') return MatchPriority.service;
    return priorityFromId(_priority);
  }

  Future<void> _next() async {
    if (_step < 4) {
      setState(() => _step++);
      return;
    }
    if (_analyzing) return; // guard against re-entry during the reveal delay

    final appState = Provider.of<AppState>(context, listen: false);
    appState.setCategory(_cat);
    // Persist today's bill — the baseline every savings figure is measured against.
    appState.setCurrentBill(_cat, _currentBill.round());
    appState.setQuizLines(_lines);
    appState.setQuizPriority(_priority);
    appState.setQuizBudget(_budget.round());
    appState.setQuizCat(_cat);
    appState.setQuizCompleted(true);
    appBackend.upsertQuiz({
      'budget': _budget.round(),
      'priority': _priority,
      'lines': _lines,
      'cat': _cat,
    }).catchError((_) {});
    appState.setQuizNeeds(
      wants5G: _priority.startsWith('speed') || _priority == 'data',
      wantsAbroad: _cat == 'abroad' || _priority == 'abroad' || _extraFilter == 'abroad',
      wantsNoCommit: _priority == 'nocommit' || _extraFilter == 'nocommit',
    );
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
    // Apply secondary filter (internet/tv/triple/abroad step 2 choice)
    if (_extraFilter != null) {
      if (_extraFilter == 'nocommit') appState.toggleFilter('nocommit');
      if (_extraFilter == 'streaming') appState.toggleFilter('streaming');
      if (_extraFilter == 'sport') appState.toggleFilter('sport');
      if (_extraFilter == 'netflix') appState.toggleFilter('netflix');
      if (_extraFilter == 'esim') appState.toggleFilter('esim');
      if (_extraFilter == 'price') appState.setSortMode('price');
      if (_extraFilter == 'data') appState.setSortMode('match');
    }

    // Build profile and rank plans
    final profile = MatchProfile(
      category: _cat,
      currentBill: appState.currentBill(_cat),
      budget: _budget.round(),
      priority: _mapPriority(),
      lines: _lines,
      wants5G: _priority.startsWith('speed') || _priority == 'data',
      wantsAbroad: _cat == 'abroad' || _priority == 'abroad' || _extraFilter == 'abroad',
      wantsNoCommit: _priority == 'nocommit' || _extraFilter == 'nocommit',
    );

    final recs = RecommendationEngine.rank(profile, limit: 3);
    if (recs.isEmpty) {
      if (mounted) context.goNamed('Results');
      return;
    }

    // Brief "analyzing" state for ~700ms
    if (mounted) setState(() => _analyzing = true);
    await Future.delayed(const Duration(milliseconds: 700));
    if (!mounted) return;
    setState(() {
      _analyzing = false;
      _recs = recs;
      _revealed = true;
    });
  }

  Widget _buildAnalyzing(AppTheme ffTheme) {
    return Center(
      key: const ValueKey('analyzing'),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          CircularProgressIndicator(color: ffTheme.primary, strokeWidth: 3),
          const SizedBox(height: 24),
          Text('מנתח את הנתונים…',
              style: ffTheme.titleMedium.copyWith(color: ffTheme.secondaryText)),
        ],
      ),
    );
  }

  Widget _buildReveal(AppTheme ffTheme) {
    final top = _recs.first;
    final priceUnit = _cat == 'abroad' ? 'לחבילה' : '/חודש';
    return SingleChildScrollView(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('🎯 מצאנו לך התאמה!',
              style: ffTheme.headlineMedium.copyWith(color: ffTheme.primary)),
          const SizedBox(height: 4),
          Text('מבוסס על התשובות שלך',
              style: ffTheme.bodyMedium.copyWith(color: ffTheme.secondaryText)),
          const SizedBox(height: 20),

          // Top match card
          GestureDetector(
            onTap: () => context.pushNamed('PlanDetail',
                pathParameters: {'planId': top.plan.id}),
            child: Container(
              width: double.infinity,
              padding: const EdgeInsets.all(20),
              decoration: BoxDecoration(
                color: ffTheme.secondaryBackground,
                borderRadius: BorderRadius.circular(20),
                border: Border.all(color: ffTheme.primary, width: 2),
                boxShadow: [
                  BoxShadow(
                      color: ffTheme.primary.withOpacity(0.10),
                      blurRadius: 12,
                      offset: const Offset(0, 4))
                ],
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(top.plan.provider,
                                style: ffTheme.labelMedium
                                    .copyWith(color: ffTheme.secondaryText)),
                            const SizedBox(height: 2),
                            Text(top.plan.plan,
                                style: ffTheme.titleLarge
                                    .copyWith(color: ffTheme.primaryText)),
                          ],
                        ),
                      ),
                      const SizedBox(width: 12),
                      Column(
                        crossAxisAlignment: CrossAxisAlignment.end,
                        children: [
                          Text('₪${top.plan.price}',
                              style: ffTheme.headlineSmall
                                  .copyWith(color: ffTheme.primary, fontWeight: FontWeight.w800)),
                          Text(priceUnit,
                              style: ffTheme.labelSmall
                                  .copyWith(color: ffTheme.secondaryText)),
                        ],
                      ),
                    ],
                  ),
                  const SizedBox(height: 12),
                  // Badge row
                  Row(
                    children: [
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                        decoration: BoxDecoration(
                          color: ffTheme.primary,
                          borderRadius: BorderRadius.circular(20),
                        ),
                        child: Text('${top.scorePct}% התאמה',
                            style: ffTheme.labelSmall
                                .copyWith(color: Colors.white, fontWeight: FontWeight.w700)),
                      ),
                      const SizedBox(width: 8),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                        decoration: BoxDecoration(
                          color: ffTheme.accent1,
                          borderRadius: BorderRadius.circular(20),
                          border: Border.all(color: ffTheme.primary.withOpacity(0.3)),
                        ),
                        child: Text(top.label,
                            style: ffTheme.labelSmall
                                .copyWith(color: ffTheme.primary, fontWeight: FontWeight.w600)),
                      ),
                    ],
                  ),
                  if (top.reasons.isNotEmpty) ...[
                    const SizedBox(height: 14),
                    ...top.reasons.take(3).map((r) => Padding(
                          padding: const EdgeInsets.only(bottom: 6),
                          child: Row(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Icon(Icons.check_circle_rounded,
                                  size: 18, color: ffTheme.success),
                              const SizedBox(width: 8),
                              Expanded(
                                  child: Text(r,
                                      style: ffTheme.bodySmall
                                          .copyWith(color: ffTheme.primaryText))),
                            ],
                          ),
                        )),
                  ],
                  if (top.annualSaving > 0) ...[
                    const SizedBox(height: 10),
                    Container(
                      width: double.infinity,
                      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                      decoration: BoxDecoration(
                        color: ffTheme.success.withOpacity(0.10),
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: Text('💰 חיסכון שנתי של ₪${top.annualSaving}',
                          style: ffTheme.labelMedium
                              .copyWith(color: ffTheme.success, fontWeight: FontWeight.w700)),
                    ),
                  ],
                ],
              ),
            ),
          ),

          // Share affordance — let a delighted user spread the word.
          const SizedBox(height: 8),
          Align(
            alignment: AlignmentDirectional.centerStart,
            child: TextButton.icon(
              onPressed: () {
                HapticFeedback.lightImpact();
                Share.share(
                    'מצאתי מסלול ${top.plan.provider} ב-₪${top.plan.price} — ${top.annualSaving > 0 ? 'חוסך ₪${top.annualSaving} בשנה ' : ''}עם חוסך 💚');
              },
              icon: Icon(Icons.ios_share_rounded, size: 18, color: ffTheme.primary),
              label: Text('שתף',
                  style: ffTheme.labelLarge
                      .copyWith(color: ffTheme.primary, fontWeight: FontWeight.w700)),
            ),
          ),

          // Alternatives
          if (_recs.length > 1) ...[
            const SizedBox(height: 20),
            Text('חלופות נוספות',
                style: ffTheme.labelLarge.copyWith(color: ffTheme.secondaryText)),
            const SizedBox(height: 10),
            ..._recs.skip(1).take(2).map((alt) => GestureDetector(
                  onTap: () => context.pushNamed('PlanDetail',
                      pathParameters: {'planId': alt.plan.id}),
                  child: Container(
                    margin: const EdgeInsets.only(bottom: 10),
                    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
                    decoration: BoxDecoration(
                      color: ffTheme.secondaryBackground,
                      borderRadius: BorderRadius.circular(14),
                      border: Border.all(color: ffTheme.alternate),
                    ),
                    child: Row(
                      children: [
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(alt.plan.provider,
                                  style: ffTheme.labelSmall
                                      .copyWith(color: ffTheme.secondaryText)),
                              Text(alt.plan.plan,
                                  style: ffTheme.bodyMedium
                                      .copyWith(color: ffTheme.primaryText)),
                            ],
                          ),
                        ),
                        Text('₪${alt.plan.price}',
                            style: ffTheme.titleMedium
                                .copyWith(color: ffTheme.primary, fontWeight: FontWeight.w700)),
                        const SizedBox(width: 10),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                          decoration: BoxDecoration(
                            color: ffTheme.alternate,
                            borderRadius: BorderRadius.circular(10),
                          ),
                          child: Text('${alt.scorePct}%',
                              style: ffTheme.labelSmall
                                  .copyWith(color: ffTheme.secondaryText, fontWeight: FontWeight.w600)),
                        ),
                        const SizedBox(width: 6),
                        Icon(Icons.chevron_left_rounded,
                            color: ffTheme.secondaryText, size: 20),
                      ],
                    ),
                  ),
                )),
          ],
          const SizedBox(height: 8),
        ],
      ),
    );
  }
}

class _StepCard extends StatelessWidget {
  const _StepCard({required this.step, required this.title, required this.subtitle, required this.ffTheme, required this.child});
  final int step;
  final String title;
  final String subtitle;
  final AppTheme ffTheme;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('שלב $step מתוך 5', style: ffTheme.labelMedium),
          const SizedBox(height: 8),
          Text(title, style: ffTheme.headlineMedium),
          const SizedBox(height: 4),
          Text(subtitle, style: ffTheme.bodyMedium.copyWith(color: ffTheme.secondaryText)),
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
  final AppTheme ffTheme;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: () {
        HapticFeedback.selectionClick();
        onTap();
      },
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
            Text(label, style: ffTheme.labelLarge.copyWith(color: selected ? Colors.white : ffTheme.primaryText)),
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
  final AppTheme ffTheme;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: () {
        HapticFeedback.selectionClick();
        onTap();
      },
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
            Expanded(child: Text(label, style: ffTheme.bodyLarge.copyWith(color: selected ? ffTheme.primary : ffTheme.primaryText))),
            if (selected) Icon(Icons.check_circle_rounded, color: ffTheme.primary),
          ],
        ),
      ),
    );
  }
}
