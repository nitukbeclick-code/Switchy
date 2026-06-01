import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import '../theme.dart';
import '../state.dart';

class QuizScreen extends StatefulWidget {
  const QuizScreen({super.key});

  @override
  State<QuizScreen> createState() => _QuizScreenState();
}

class _QuizScreenState extends State<QuizScreen> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<AppState>().resetQuiz();
    });
  }

  @override
  Widget build(BuildContext context) {
    final appState = context.watch<AppState>();
    final step = appState.quizStep;

    return Scaffold(
      backgroundColor: AppColors.paper,
      body: SafeArea(
        child: Column(
          children: [
            _buildHeader(appState),
            _buildProgressBar(step),
            Expanded(
              child: AnimatedSwitcher(
                duration: const Duration(milliseconds: 350),
                child: _buildStep(step, appState),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildHeader(AppState appState) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 0),
      child: Row(
        children: [
          GestureDetector(
            onTap: () {
              if (appState.quizStep > 0) {
                appState.setQuizStep(appState.quizStep - 1);
              } else {
                context.pop();
              }
            },
            child: Container(
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                color: AppColors.card,
                shape: BoxShape.circle,
                border: Border.all(color: AppColors.border),
              ),
              child: const Icon(Icons.arrow_back_ios_rounded, size: 18, color: AppColors.ink),
            ),
          ),
          const Spacer(),
          const Text(
            'שאלון התאמה',
            style: TextStyle(
              fontFamily: 'Rubik',
              fontSize: 16,
              fontWeight: FontWeight.w700,
              color: AppColors.ink,
            ),
          ),
          const Spacer(),
          const SizedBox(width: 42),
        ],
      ),
    );
  }

  Widget _buildProgressBar(int step) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
      child: Column(
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.end,
            children: [
              Text(
                '${step + 1}/3',
                style: const TextStyle(
                  fontSize: 13,
                  color: AppColors.inkMuted,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ],
          ),
          const SizedBox(height: 6),
          ClipRRect(
            borderRadius: BorderRadius.circular(4),
            child: LinearProgressIndicator(
              value: (step + 1) / 3,
              backgroundColor: AppColors.border,
              valueColor: const AlwaysStoppedAnimation(AppColors.green),
              minHeight: 6,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildStep(int step, AppState appState) {
    switch (step) {
      case 0:
        return _buildLinesStep(appState);
      case 1:
        return _buildPriorityStep(appState);
      case 2:
        return _buildBudgetStep(appState);
      default:
        return const SizedBox.shrink();
    }
  }

  Widget _buildLinesStep(AppState appState) {
    final options = [
      (1, 'קו אחד', 'לי לבד'),
      (2, 'שני קווים', 'לזוג'),
      (3, 'שלושה קווים', 'משפחה קטנה'),
      (4, 'ארבעה ומעלה', 'משפחה גדולה'),
    ];

    return SingleChildScrollView(
      key: const ValueKey(0),
      padding: const EdgeInsets.all(24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'כמה קווי סלולר\nיש במשפחה?',
            style: TextStyle(
              fontFamily: 'Rubik',
              fontSize: 26,
              fontWeight: FontWeight.w800,
              color: AppColors.ink,
              letterSpacing: -0.5,
              height: 1.2,
            ),
          ),
          const SizedBox(height: 8),
          const Text(
            'נעזור לכם למצוא חבילות מתאימות',
            style: TextStyle(fontSize: 15, color: AppColors.inkMuted),
          ),
          const SizedBox(height: 28),
          ...options.map((opt) {
            final selected = appState.quizLines == opt.$1;
            return GestureDetector(
              onTap: () {
                appState.setQuizLines(opt.$1);
                Future.delayed(const Duration(milliseconds: 300), () {
                  if (mounted) appState.setQuizStep(1);
                });
              },
              child: Container(
                margin: const EdgeInsets.only(bottom: 10),
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: selected ? AppColors.green : AppColors.card,
                  borderRadius: BorderRadius.circular(14),
                  border: Border.all(
                    color: selected ? AppColors.green : AppColors.border,
                    width: selected ? 1.5 : 1,
                  ),
                ),
                child: Row(
                  children: [
                    Container(
                      width: 28,
                      height: 28,
                      decoration: BoxDecoration(
                        color: selected
                            ? AppColors.lime
                            : AppColors.paper,
                        shape: BoxShape.circle,
                      ),
                      child: Center(
                        child: Text(
                          '${opt.$1}',
                          style: TextStyle(
                            fontSize: 14,
                            fontWeight: FontWeight.w800,
                            color: selected
                                ? AppColors.greenDark
                                : AppColors.ink,
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(width: 14),
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          opt.$2,
                          style: TextStyle(
                            fontSize: 16,
                            fontWeight: FontWeight.w700,
                            color: selected ? Colors.white : AppColors.ink,
                          ),
                        ),
                        Text(
                          opt.$3,
                          style: TextStyle(
                            fontSize: 13,
                            color: selected
                                ? Colors.white.withOpacity(0.7)
                                : AppColors.inkMuted,
                          ),
                        ),
                      ],
                    ),
                    const Spacer(),
                    if (selected)
                      const Icon(Icons.check_circle_rounded,
                          color: AppColors.lime, size: 22),
                  ],
                ),
              ),
            );
          }),
        ],
      ),
    );
  }

  Widget _buildPriorityStep(AppState appState) {
    final options = [
      ('price', '💰', 'מחיר נמוך', 'הכי חשוב לחסוך'),
      ('5g', '📡', 'מהירות 5G', 'גלישה מהירה ביותר'),
      ('abroad', '✈️', 'חבילת חו"ל', 'גלישה בחו"ל'),
      ('nocommit', '🔓', 'ללא התחייבות', 'גמישות מלאה'),
      ('service', '🤝', 'שירות לקוחות', 'תמיכה איכותית'),
    ];

    return SingleChildScrollView(
      key: const ValueKey(1),
      padding: const EdgeInsets.all(24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'מה הכי חשוב\nלכם במסלול?',
            style: TextStyle(
              fontFamily: 'Rubik',
              fontSize: 26,
              fontWeight: FontWeight.w800,
              color: AppColors.ink,
              letterSpacing: -0.5,
              height: 1.2,
            ),
          ),
          const SizedBox(height: 8),
          const Text(
            'נסנן את התוצאות בהתאם',
            style: TextStyle(fontSize: 15, color: AppColors.inkMuted),
          ),
          const SizedBox(height: 28),
          Wrap(
            spacing: 10,
            runSpacing: 10,
            children: options.map((opt) {
              final selected = appState.quizPriority == opt.$1;
              return GestureDetector(
                onTap: () {
                  appState.setQuizPriority(opt.$1);
                  Future.delayed(const Duration(milliseconds: 300), () {
                    if (mounted) appState.setQuizStep(2);
                  });
                },
                child: Container(
                  padding: const EdgeInsets.symmetric(
                      horizontal: 16, vertical: 12),
                  decoration: BoxDecoration(
                    color: selected ? AppColors.green : AppColors.card,
                    borderRadius: BorderRadius.circular(14),
                    border: Border.all(
                      color: selected ? AppColors.green : AppColors.border,
                      width: selected ? 1.5 : 1,
                    ),
                  ),
                  child: Column(
                    children: [
                      Text(opt.$2,
                          style: const TextStyle(fontSize: 28)),
                      const SizedBox(height: 6),
                      Text(
                        opt.$3,
                        style: TextStyle(
                          fontSize: 14,
                          fontWeight: FontWeight.w700,
                          color: selected ? Colors.white : AppColors.ink,
                        ),
                      ),
                      Text(
                        opt.$4,
                        style: TextStyle(
                          fontSize: 11,
                          color: selected
                              ? Colors.white.withOpacity(0.7)
                              : AppColors.inkMuted,
                        ),
                      ),
                    ],
                  ),
                ),
              );
            }).toList(),
          ),
        ],
      ),
    );
  }

  Widget _buildBudgetStep(AppState appState) {
    return SingleChildScrollView(
      key: const ValueKey(2),
      padding: const EdgeInsets.all(24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'כמה תרצו לשלם\nלחודש?',
            style: TextStyle(
              fontFamily: 'Rubik',
              fontSize: 26,
              fontWeight: FontWeight.w800,
              color: AppColors.ink,
              letterSpacing: -0.5,
              height: 1.2,
            ),
          ),
          const SizedBox(height: 8),
          const Text(
            'גררו לקביעת התקציב',
            style: TextStyle(fontSize: 15, color: AppColors.inkMuted),
          ),
          const SizedBox(height: 48),
          Center(
            child: Column(
              children: [
                Text(
                  'עד ₪${appState.quizBudget}',
                  style: const TextStyle(
                    fontFamily: 'Rubik',
                    fontSize: 40,
                    fontWeight: FontWeight.w800,
                    color: AppColors.green,
                    letterSpacing: -1,
                  ),
                ),
                const Text(
                  'לחודש',
                  style: TextStyle(
                    fontSize: 16,
                    color: AppColors.inkMuted,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 32),
          SliderTheme(
            data: SliderTheme.of(context).copyWith(
              activeTrackColor: AppColors.green,
              inactiveTrackColor: AppColors.border,
              thumbColor: AppColors.green,
              overlayColor: AppColors.green.withOpacity(0.1),
              thumbShape:
                  const RoundSliderThumbShape(enabledThumbRadius: 14),
              trackHeight: 6,
            ),
            child: Slider(
              value: appState.quizBudget.toDouble(),
              min: 20,
              max: 250,
              divisions: 23,
              onChanged: (v) => appState.setQuizBudget(v.round()),
            ),
          ),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 4),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: const [
                Text('₪20', style: TextStyle(fontSize: 12, color: AppColors.inkMuted)),
                Text('₪250', style: TextStyle(fontSize: 12, color: AppColors.inkMuted)),
              ],
            ),
          ),
          const SizedBox(height: 48),
          SizedBox(
            width: double.infinity,
            child: FilledButton(
              onPressed: () {
                appState.setCat('cellular');
                context.push('/results');
              },
              style: FilledButton.styleFrom(
                backgroundColor: AppColors.green,
                foregroundColor: Colors.white,
                padding: const EdgeInsets.symmetric(vertical: 16),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(16),
                ),
              ),
              child: const Text(
                'מצאו לי מסלול →',
                style: TextStyle(
                    fontSize: 17, fontWeight: FontWeight.w800),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
