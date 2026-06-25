import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:provider/provider.dart';
import 'package:share_plus/share_plus.dart';
import '../../theme/app_theme.dart';
import '../../core/nav.dart';
import '../../widgets/app_button.dart';
import '../../widgets/app_sheet.dart';
import '../../widgets/pressable.dart';
import '../../widgets/skeleton.dart';
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
    final draft = appState.quizDraft;
    if (draft != null) {
      // Resume an in-progress quiz exactly where the user left off — step and
      // every answer, including the secondary filter that the completed-quiz
      // fields don't carry.
      final cfg = _budgetConfig(draft.cat);
      _step = draft.step.clamp(0, 4);
      _cat = draft.cat;
      _lines = draft.lines;
      _priority = draft.priority;
      _extraFilter = draft.extraFilter;
      _budget = draft.budget.toDouble().clamp(cfg.$1, cfg.$2);
      _currentBill = draft.currentBill.toDouble().clamp(cfg.$1, cfg.$2);
      return;
    }
    // No draft → pre-fill from existing (possibly completed) quiz state.
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

  /// Snapshot the wizard's current slide + answers into AppState so leaving and
  /// re-entering resumes here. Called on every slide change (forward/back).
  void _saveDraft() {
    AppState().saveQuizDraft(QuizDraft(
      step: _step,
      cat: _cat,
      lines: _lines,
      priority: _priority,
      extraFilter: _extraFilter,
      budget: _budget.round(),
      currentBill: _currentBill.round(),
    ));
  }

  static const _cats = [
    ('cellular', 'סלולר'),
    ('internet', 'אינטרנט'),
    ('tv', 'טלוויזיה'),
    ('triple', 'חבילה משולבת'),
    ('abroad', 'חו"ל'),
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
          tooltip: 'סגירה',
          onPressed: () => context.safePop(),
        ),
        title: Text('שאלון חיסכון', style: ffTheme.titleLarge),
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(6),
          child: ClipRRect(
            borderRadius: const BorderRadius.only(
              topRight: Radius.circular(3),
              topLeft: Radius.circular(3),
            ),
            child: Semantics(
              label: 'התקדמות בשאלון: שלב ${_step + 1} מתוך 5',
              child: TweenAnimationBuilder<double>(
                tween: Tween(begin: 0, end: (_step + 1) / 5),
                duration: ffTheme.motionMedium,
                curve: ffTheme.easeOut,
                builder: (context, value, _) => LinearProgressIndicator(
                  value: value,
                  minHeight: 6,
                  backgroundColor: ffTheme.secondary,
                  valueColor: AlwaysStoppedAnimation(ffTheme.brandAccent),
                ),
              ),
            ),
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
                // PRIMARY CTA — the single clear next step: lead capture for the
                // best match. The two former secondary buttons (browse all /
                // edit answers) are demoted into a low-emphasis "עוד אפשרויות"
                // row that opens an AppSheet, so the reveal has one obvious CTA.
                AppButton(
                  text: 'רוצה את המסלול הזה — השאירו פרטים ←',
                  onPressed: () async {
                    HapticFeedback.lightImpact();
                    context.pushNamed('Lead',
                        pathParameters: {'planId': _recs.first.plan.id},
                        queryParameters: {'source': 'quiz'});
                  },
                  width: double.infinity,
                  height: 56,
                  color: ffTheme.brandAccent,
                  textStyle: ffTheme.titleMedium.copyWith(color: Colors.white),
                  borderRadius: BorderRadius.circular(18),
                ),
                const SizedBox(height: 8),
                // SECONDARY — demoted to a single low-emphasis text button that
                // surfaces both prior options in a sheet.
                Center(
                  child: TextButton(
                    onPressed: () => _showRevealOptions(ffTheme),
                    style: TextButton.styleFrom(
                      minimumSize: const Size(0, kMinTapTarget),
                      padding: const EdgeInsets.symmetric(horizontal: 16),
                    ),
                    child: Text('עוד אפשרויות',
                        style: ffTheme.bodyMedium
                            .copyWith(color: ffTheme.secondaryText, fontWeight: FontWeight.w600)),
                  ),
                ),
              ] else Row(
                children: [
                  if (_step > 0)
                    Padding(
                      padding: const EdgeInsetsDirectional.only(end: 12),
                      child: OutlinedButton(
                        onPressed: () { setState(() => _step--); _saveDraft(); },
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
                      text: _step < 4 ? 'הבא ←' : 'הצג תוצאות',
                      icon: _step < 4
                          ? null
                          : const Icon(Icons.search_rounded, size: 20, color: Colors.white),
                      onPressed: () async {
                        HapticFeedback.lightImpact();
                        await _next();
                      },
                      width: double.infinity,
                      height: 56,
                      color: ffTheme.brandAccent,
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
              icon: categoryIconData(c.$1),
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
                ('speed_basic', 'מהיר — עד 200Mb', Icons.directions_run_rounded),
                ('speed_fast', 'מהיר מאוד — 500Mb+', Icons.bolt_rounded),
                ('speed_ultra', 'גיגה — 1000Mb', Icons.rocket_launch_rounded),
              ].map((p) => _RadioTile(
                icon: p.$3,
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
                ('channels', 'מגוון ערוצים רחב', Icons.settings_input_antenna_rounded),
                ('sport', 'ספורט חי וסדרות', Icons.sports_soccer_rounded),
                ('price', 'מחיר נמוך', Icons.savings_rounded),
              ].map((p) => _RadioTile(
                icon: p.$3,
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
                ('price', 'נסיעה קצרה — עד שבוע', Icons.flight_takeoff_rounded),
                ('data', 'נסיעה ארוכה — חודש+', Icons.public_rounded),
                ('nocommit', 'נסיעות תכופות', Icons.flight_rounded),
              ].map((p) => _RadioTile(
                icon: p.$3,
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
                icon: Icon(Icons.remove_circle_outline_rounded, size: 36, color: ffTheme.brandAccent),
              ),
              const SizedBox(width: 16),
              AnimatedSwitcher(
                duration: ffTheme.motionFast,
                transitionBuilder: (child, anim) =>
                    ScaleTransition(scale: anim, child: child),
                child: Text('$_lines',
                    key: ValueKey(_lines),
                    style: ffTheme.displaySmall.copyWith(color: ffTheme.brandAccent)),
              ),
              const SizedBox(width: 16),
              IconButton(
                tooltip: 'הוסף קו',
                onPressed: () => setState(() { if (_lines < 10) _lines++; }),
                icon: Icon(Icons.add_circle_outline_rounded, size: 36, color: ffTheme.brandAccent),
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
                ('netflix', 'Netflix / VOD כלול', Icons.movie_rounded),
                ('sport', 'ערוצי ספורט', Icons.sports_soccer_rounded),
                ('nocommit', 'ללא התחייבות', Icons.lock_open_rounded),
                ('price', 'מחיר נמוך', Icons.savings_rounded),
              ].map((p) => _RadioTile(
                icon: p.$3,
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
                ('nocommit', 'ללא התחייבות', Icons.lock_open_rounded),
                ('price', 'מחיר הכי נמוך', Icons.savings_rounded),
                ('streaming', 'כולל שירותי סטרימינג', Icons.movie_rounded),
                ('reliability', 'אמינות ויציבות', Icons.shield_rounded),
              ].map((p) => _RadioTile(
                icon: p.$3,
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
                ('nocommit', 'ללא התחייבות', Icons.lock_open_rounded),
                ('price', 'מחיר הכי נמוך', Icons.savings_rounded),
                ('sport', 'ערוצי ספורט', Icons.sports_soccer_rounded),
                ('netflix', 'Netflix / VOD', Icons.movie_rounded),
              ].map((p) => _RadioTile(
                icon: p.$3,
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
                ('price', 'מחיר נמוך', Icons.savings_rounded),
                ('data', 'הרבה גלישה', Icons.signal_cellular_alt_rounded),
                ('esim', 'eSIM מיידי', Icons.sim_card_rounded),
                ('nocommit', 'גמישות — ביטול חופשי', Icons.lock_open_rounded),
              ].map((p) => _RadioTile(
                icon: p.$3,
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
              ('price', 'מחיר נמוך', Icons.savings_rounded),
              ('speed', 'מהירות גבוהה', Icons.bolt_rounded),
              ('abroad', 'גלישה בחו"ל', Icons.flight_takeoff_rounded),
              ('nocommit', 'ללא התחייבות', Icons.lock_open_rounded),
            ].map((p) => _RadioTile(
              icon: p.$3,
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
                style: ffTheme.displayMedium.copyWith(color: ffTheme.brandAccent),
              ),
              const SizedBox(height: 4),
              Text(
                'המחיר שאתם משלמים כיום',
                style: ffTheme.labelMedium.copyWith(color: ffTheme.secondaryText),
              ),
              const SizedBox(height: 16),
              SliderTheme(
                data: SliderTheme.of(context).copyWith(
                  trackHeight: 5,
                  overlayColor: ffTheme.brandAccent.withValues(alpha: 0.12),
                  thumbColor: ffTheme.brandAccent,
                ),
                child: Slider(
                  value: clampedBill,
                  min: billCfg.$1,
                  max: billCfg.$2,
                  divisions: billCfg.$3,
                  activeColor: ffTheme.brandAccent,
                  inactiveColor: ffTheme.secondary,
                  onChanged: (v) => setState(() => _currentBill = v),
                ),
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
                  return _PresetChip(
                    label: '₪$preset',
                    active: active,
                    ffTheme: ffTheme,
                    onTap: () {
                      HapticFeedback.selectionClick();
                      setState(() => _currentBill = preset.toDouble());
                    },
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
                style: ffTheme.displayMedium.copyWith(color: ffTheme.brandAccent),
              ),
              const SizedBox(height: 4),
              AnimatedSwitcher(
                duration: ffTheme.motionFast,
                child: Text(
                  '$planCount מסלולים בתקציב זה',
                  key: ValueKey(planCount > 0),
                  style: ffTheme.labelMedium.copyWith(
                    color: planCount > 0 ? ffTheme.savingDark : ffTheme.error,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
              const SizedBox(height: 16),
              SliderTheme(
                data: SliderTheme.of(context).copyWith(
                  trackHeight: 5,
                  overlayColor: ffTheme.brandAccent.withValues(alpha: 0.12),
                  thumbColor: ffTheme.brandAccent,
                ),
                child: Slider(
                  value: clampedBudget,
                  min: sliderConfig.$1,
                  max: sliderConfig.$2,
                  divisions: sliderConfig.$3,
                  activeColor: ffTheme.brandAccent,
                  inactiveColor: ffTheme.secondary,
                  onChanged: (v) => setState(() => _budget = v),
                ),
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
                  return _PresetChip(
                    label: '₪$preset',
                    active: active,
                    ffTheme: ffTheme,
                    onTap: () {
                      HapticFeedback.selectionClick();
                      setState(() => _budget = preset.toDouble());
                    },
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
      _saveDraft(); // persist the answers from the slide we just left
      return;
    }
    if (_analyzing) return; // guard against re-entry during the reveal delay

    final appState = Provider.of<AppState>(context, listen: false);
    // The quiz is finishing — its answers now live in the canonical quiz* fields
    // below, so drop the resume draft (a completed quiz must not re-open mid-flow).
    appState.clearQuizDraft();
    appState.setCategory(_cat);
    // Persist today's bill — the baseline every savings figure is measured against.
    appState.setCurrentBill(_cat, _currentBill.round());
    appState.setQuizLines(_lines);
    appState.setQuizPriority(_priority);
    appState.setQuizBudget(_budget.round());
    appState.setQuizCat(_cat);
    appState.setQuizCompleted(true);
    final needs5G = _priority.startsWith('speed') || _priority == 'data';
    final needsAbroad = _cat == 'abroad' || _priority == 'abroad' || _extraFilter == 'abroad';
    appBackend.upsertQuiz({
      'budget': _budget.round(),
      'priority': _priority,
      'lines': _lines,
      'cat': _cat,
      'wants5G': needs5G,
      'wantsAbroad': needsAbroad,
    }).catchError((_) {});
    appState.setQuizNeeds(
      wants5G: needs5G,
      wantsAbroad: needsAbroad,
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

  /// The demoted secondary actions for the reveal, surfaced from a single
  /// low-emphasis "עוד אפשרויות" row so the result screen keeps one clear
  /// primary CTA. Both options preserve their original behaviour: browse the
  /// full ranked list, or step back into the wizard to edit answers.
  void _showRevealOptions(AppTheme ffTheme) {
    HapticFeedback.lightImpact();
    AppSheet.actions(
      context,
      title: 'עוד אפשרויות',
      actions: [
        AppSheetAction(
          icon: Icons.list_alt_rounded,
          label: 'ראו את כל המסלולים',
          onTap: () {
            HapticFeedback.lightImpact();
            context.goNamed('Results');
          },
        ),
        AppSheetAction(
          icon: Icons.tune_rounded,
          label: 'ערוך תשובות',
          onTap: () {
            if (mounted) setState(() => _revealed = false);
          },
        ),
      ],
    );
  }

  /// While ranking runs (the brief ~700ms "analyzing" beat) we show a shimmer
  /// ghost of the result card the reveal is about to paint — same heading row,
  /// hero card, savings strip, badges and reason lines — so the layout settles
  /// in place instead of snapping from a spinner. Uses the shared
  /// [SkeletonShimmer]/[SkeletonBox] primitives (RTL- and reduced-motion-aware).
  Widget _buildAnalyzing(AppTheme ffTheme) {
    return Semantics(
      label: 'מנתח את הנתונים ומתאים מסלולים',
      child: SingleChildScrollView(
        key: const ValueKey('analyzing'),
        physics: const NeverScrollableScrollPhysics(),
        child: SkeletonShimmer(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Heading row ghost (icon tile + title line).
              Row(
                children: [
                  SkeletonBox(width: 36, height: 36, radius: ffTheme.radiusMd),
                  const SizedBox(width: 10),
                  const Expanded(child: SkeletonBox(width: double.infinity, height: 22)),
                ],
              ),
              const SizedBox(height: 10),
              const SkeletonBox(width: 160, height: 13),
              const SizedBox(height: 20),
              // Hero match-card ghost.
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(22),
                decoration: BoxDecoration(
                  color: ffTheme.secondaryBackground,
                  borderRadius: BorderRadius.circular(ffTheme.radiusCard),
                  border: Border.all(color: ffTheme.alternate),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              SkeletonBox(width: 90, height: 12),
                              SizedBox(height: 8),
                              SkeletonBox(width: 150, height: 18),
                            ],
                          ),
                        ),
                        SizedBox(width: 12),
                        Column(
                          crossAxisAlignment: CrossAxisAlignment.end,
                          children: [
                            SkeletonBox(width: 70, height: 22),
                            SizedBox(height: 6),
                            SkeletonBox(width: 44, height: 11),
                          ],
                        ),
                      ],
                    ),
                    const SizedBox(height: 16),
                    // Savings strip ghost.
                    SkeletonBox(width: double.infinity, height: 56, radius: ffTheme.radiusLg),
                    const SizedBox(height: 14),
                    // Badge row ghost.
                    const Row(
                      children: [
                        SkeletonBox(width: 84, height: 24, radius: 20),
                        SizedBox(width: 8),
                        SkeletonBox(width: 96, height: 24, radius: 20),
                      ],
                    ),
                    const SizedBox(height: 16),
                    // Reason lines ghost.
                    const SkeletonBox(width: double.infinity, height: 13),
                    const SizedBox(height: 8),
                    const SkeletonBox(width: double.infinity, height: 13),
                    const SizedBox(height: 8),
                    const SkeletonBox(width: 200, height: 13),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildReveal(AppTheme ffTheme) {
    final top = _recs.first;
    final priceUnit = priceUnitLabel(top.plan);
    return SingleChildScrollView(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(
                  color: ffTheme.brandAccentTint,
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Icon(Icons.auto_awesome_rounded, color: ffTheme.brandAccent, size: 20),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Text('זה המסלול הכי משתלם בשבילך',
                    style: ffTheme.headlineMedium.copyWith(color: ffTheme.brandAccent)),
              ),
            ],
          ).animate().fadeIn(duration: 280.ms).slideY(begin: 0.06, end: 0, curve: ffTheme.easeOut),
          const SizedBox(height: 4),
          Text('מבוסס על התשובות שלך',
              style: ffTheme.bodyMedium.copyWith(color: ffTheme.secondaryText))
              .animate(delay: 80.ms).fadeIn(duration: 280.ms).slideY(begin: 0.06, end: 0, curve: ffTheme.easeOut),
          const SizedBox(height: 20),

          // Top match card
          Pressable(
            onTap: () => context.pushNamed('PlanDetail',
                pathParameters: {'planId': top.plan.id}),
            child: Container(
              width: double.infinity,
              padding: const EdgeInsets.all(22),
              decoration: BoxDecoration(
                color: ffTheme.secondaryBackground,
                borderRadius: BorderRadius.circular(ffTheme.radiusCard),
                border: Border.all(color: ffTheme.brandAccent, width: 2),
                boxShadow: ffTheme.shadowAccent,
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
                          Text('₪${top.plan.priceText}',
                              style: ffTheme.headlineSmall
                                  .copyWith(color: ffTheme.brandAccent, fontWeight: FontWeight.w800)),
                          Text(priceUnit,
                              style: ffTheme.labelSmall
                                  .copyWith(color: ffTheme.secondaryText)),
                        ],
                      ),
                    ],
                  ),
                  if (top.annualSaving > 0) ...[
                    const SizedBox(height: 16),
                    Container(
                      width: double.infinity,
                      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
                      decoration: BoxDecoration(
                        color: ffTheme.saving.withValues(alpha: 0.12),
                        borderRadius: BorderRadius.circular(ffTheme.radiusLg),
                        border: Border.all(color: ffTheme.saving.withValues(alpha: 0.35)),
                      ),
                      child: Row(
                        children: [
                          Icon(Icons.savings_rounded, size: 24, color: ffTheme.savingDark),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text('תחסכו עד',
                                    style: ffTheme.labelSmall
                                        .copyWith(color: ffTheme.savingText)),
                                Text('₪${top.annualSaving} בשנה',
                                    style: ffTheme.headlineSmall.copyWith(
                                        color: ffTheme.savingText,
                                        fontWeight: FontWeight.w800)),
                              ],
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                  const SizedBox(height: 12),
                  // Badge row — the winner moment leads with an amber VALUE
                  // "המלצה ראשית" trophy badge, then the green ACTION match-score
                  // and the engine's label. Wraps so RTL long labels don't clip.
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: [
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                        decoration: BoxDecoration(
                          color: ffTheme.saving.withValues(alpha: 0.16),
                          borderRadius: BorderRadius.circular(20),
                          border: Border.all(color: ffTheme.saving.withValues(alpha: 0.40)),
                        ),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Icon(Icons.emoji_events_rounded, size: 13, color: ffTheme.savingDark),
                            const SizedBox(width: 4),
                            Text('המלצה ראשית',
                                style: ffTheme.labelSmall
                                    .copyWith(color: ffTheme.savingText, fontWeight: FontWeight.w800)),
                          ],
                        ),
                      ),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                        decoration: BoxDecoration(
                          gradient: ffTheme.accentGradient,
                          borderRadius: BorderRadius.circular(20),
                        ),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            const Icon(Icons.verified_rounded, size: 13, color: Colors.white),
                            const SizedBox(width: 4),
                            Text('${top.scorePct}% התאמה',
                                style: ffTheme.labelSmall
                                    .copyWith(color: Colors.white, fontWeight: FontWeight.w700)),
                          ],
                        ),
                      ),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                        decoration: BoxDecoration(
                          color: ffTheme.brandAccentTint,
                          borderRadius: BorderRadius.circular(20),
                          border: Border.all(color: ffTheme.brandAccent.withValues(alpha: 0.3)),
                        ),
                        child: Text(top.label,
                            style: ffTheme.labelSmall
                                .copyWith(color: ffTheme.brandAccentText, fontWeight: FontWeight.w700)),
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
                                  size: 18, color: ffTheme.brandAccent),
                              const SizedBox(width: 8),
                              Expanded(
                                  child: Text(r,
                                      style: ffTheme.bodySmall
                                          .copyWith(color: ffTheme.primaryText))),
                            ],
                          ),
                        )),
                  ],
                ],
              ),
            ),
          ).animate(delay: 160.ms)
              .fadeIn(duration: 320.ms)
              .slideY(begin: 0.08, end: 0, curve: ffTheme.easeOut)
              .scaleXY(begin: 0.97, end: 1, curve: ffTheme.spring),

          // Share affordance — let a delighted user spread the word.
          const SizedBox(height: 8),
          Align(
            alignment: AlignmentDirectional.centerStart,
            child: TextButton.icon(
              onPressed: () {
                HapticFeedback.lightImpact();
                Share.share(
                    'מצאתי מסלול ${top.plan.provider} ב-₪${top.plan.priceText} — ${top.annualSaving > 0 ? 'חוסך ₪${top.annualSaving} בשנה ' : ''}עם Switchy AI');
              },
              icon: Icon(Icons.ios_share_rounded, size: 18, color: ffTheme.brandAccent),
              label: Text('שתף',
                  style: ffTheme.labelLarge
                      .copyWith(color: ffTheme.brandAccentText, fontWeight: FontWeight.w700)),
            ),
          ),

          // Alternatives
          if (_recs.length > 1) ...[
            const SizedBox(height: 20),
            Text('עוד אפשרויות שמתאימות לך',
                style: ffTheme.labelLarge.copyWith(color: ffTheme.secondaryText)),
            const SizedBox(height: 10),
            ..._recs.skip(1).take(2).toList().asMap().entries.map((entry) {
              final alt = entry.value;
              return Pressable(
                  onTap: () => context.pushNamed('PlanDetail',
                      pathParameters: {'planId': alt.plan.id}),
                  child: Container(
                    margin: const EdgeInsets.only(bottom: 10),
                    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
                    decoration: ffTheme.cardDecoration(radius: ffTheme.radiusMd),
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
                        Text('₪${alt.plan.priceText}',
                            style: ffTheme.titleMedium
                                .copyWith(color: ffTheme.brandAccent, fontWeight: FontWeight.w700)),
                        const SizedBox(width: 10),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                          decoration: BoxDecoration(
                            color: ffTheme.secondary,
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
                ).animate(delay: (240 + entry.key * 80).ms)
                    .fadeIn(duration: 300.ms)
                    .slideY(begin: 0.06, end: 0, curve: ffTheme.easeOut);
            }),
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
    return Semantics(
      container: true,
      label: 'שלב $step מתוך 5: $title. $subtitle',
      child: SingleChildScrollView(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Designed step eyebrow — a quiet green ACTION pill that anchors the
            // step in the 5-step flow (the same text the resume test asserts on,
            // kept verbatim inside the pill via ExcludeSemantics so the parent
            // container Semantics stays the single announced label).
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
              decoration: BoxDecoration(
                color: ffTheme.brandAccentTint,
                borderRadius: BorderRadius.circular(20),
              ),
              child: ExcludeSemantics(
                child: Text('שלב $step מתוך 5',
                    style: ffTheme.labelSmall.copyWith(
                        color: ffTheme.brandAccentText,
                        fontWeight: FontWeight.w700)),
              ),
            ),
            const SizedBox(height: 12),
            Text(title, style: ffTheme.headlineMedium),
            const SizedBox(height: 4),
            Text(subtitle, style: ffTheme.bodyMedium.copyWith(color: ffTheme.secondaryText)),
            const SizedBox(height: 32),
            child,
          ],
        ),
      ),
    );
  }
}

class _ChoiceChip extends StatelessWidget {
  const _ChoiceChip({required this.icon, required this.label, required this.selected, required this.onTap, required this.ffTheme});
  final IconData icon;
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
          color: selected ? ffTheme.brandAccent : ffTheme.secondaryBackground,
          borderRadius: BorderRadius.circular(ffTheme.radiusMd),
          border: Border.all(color: selected ? ffTheme.brandAccent : ffTheme.alternate, width: 1.5),
          boxShadow: selected ? ffTheme.shadowAccent : ffTheme.shadowXs,
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 20, color: selected ? Colors.white : ffTheme.primaryText),
            const SizedBox(width: 8),
            Text(label, style: ffTheme.labelLarge.copyWith(color: selected ? Colors.white : ffTheme.primaryText)),
          ],
        ),
      ),
    );
  }
}

class _RadioTile extends StatelessWidget {
  const _RadioTile({required this.icon, required this.label, required this.selected, required this.onTap, required this.ffTheme});
  final IconData icon;
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
          color: selected ? ffTheme.brandAccentTint : ffTheme.secondaryBackground,
          borderRadius: BorderRadius.circular(ffTheme.radiusMd),
          border: Border.all(color: selected ? ffTheme.brandAccent : ffTheme.alternate, width: selected ? 2 : 1),
          boxShadow: selected ? null : ffTheme.shadowXs,
        ),
        child: Row(
          children: [
            Icon(icon, size: 22, color: selected ? ffTheme.brandAccent : ffTheme.primaryText),
            const SizedBox(width: 12),
            Expanded(child: Text(label, style: ffTheme.bodyLarge.copyWith(color: selected ? ffTheme.brandAccent : ffTheme.primaryText, fontWeight: selected ? FontWeight.w700 : FontWeight.w500))),
            if (selected) Icon(Icons.check_circle_rounded, color: ffTheme.brandAccent),
          ],
        ),
      ),
    );
  }
}

/// A quick budget/bill preset pill. Visually a compact rounded chip, but its
/// tappable area is held to a comfortable >=44dp height via [kMinTapTarget] so
/// the row of presets clears the minimum-touch-target guideline (the old chips
/// were only ~30dp tall from `vertical: 7` padding).
class _PresetChip extends StatelessWidget {
  const _PresetChip({
    required this.label,
    required this.active,
    required this.onTap,
    required this.ffTheme,
  });
  final String label;
  final bool active;
  final VoidCallback onTap;
  final AppTheme ffTheme;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      selected: active,
      label: label,
      child: GestureDetector(
        onTap: onTap,
        // Transparent fill so the (smaller) visible pill still gets the full
        // >=44dp hit area without painting a larger background.
        behavior: HitTestBehavior.opaque,
        child: ConstrainedBox(
          constraints: const BoxConstraints(minHeight: kMinTapTarget),
          child: Center(
            child: AnimatedContainer(
              duration: const Duration(milliseconds: 180),
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
              decoration: BoxDecoration(
                color: active ? ffTheme.brandAccent : ffTheme.secondaryBackground,
                borderRadius: BorderRadius.circular(20),
                border: Border.all(color: active ? ffTheme.brandAccent : ffTheme.alternate),
              ),
              child: ExcludeSemantics(
                child: Text(label,
                    style: ffTheme.labelMedium.copyWith(
                      color: active ? Colors.white : ffTheme.primaryText,
                      fontWeight: active ? FontWeight.w700 : FontWeight.w500,
                    )),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
