import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import '../theme.dart';
import '../state.dart';
import '../data.dart';

class TrackerScreen extends StatelessWidget {
  const TrackerScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final appState = context.watch<AppState>();
    final step = appState.trackerStep;

    final steps = [
      _TrackerStep(
        title: 'הצטרפות',
        subtitle: 'בקשתכם התקבלה',
        done: step >= 0,
        active: step == 0,
      ),
      _TrackerStep(
        title: 'אישור מסלול',
        subtitle: 'המסלול אושר בספק',
        done: step >= 1,
        active: step == 1,
      ),
      _TrackerStep(
        title: 'מדריך ניתוק',
        subtitle: 'הכנה למעבר',
        done: step >= 2,
        active: step == 2,
      ),
      _TrackerStep(
        title: 'הושלם',
        subtitle: 'ברוכים הבאים למסלול החדש!',
        done: step >= 3,
        active: step == 3,
      ),
    ];

    return Scaffold(
      backgroundColor: AppColors.paper,
      body: SafeArea(
        child: Column(
          children: [
            _buildHeader(context),
            Expanded(
              child: SingleChildScrollView(
                padding: const EdgeInsets.all(20),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    _buildBanner(),
                    const SizedBox(height: 24),
                    _buildTimeline(steps, step),
                    const SizedBox(height: 24),
                    _buildRepCard(context),
                    const SizedBox(height: 16),
                    _buildGuaranteeCard(),
                    if (step < 3) ...[
                      const SizedBox(height: 24),
                      _buildAdvanceButton(context, appState),
                    ],
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildHeader(BuildContext context) {
    return Container(
      color: AppColors.green,
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 20),
      child: Row(
        children: [
          const Expanded(
            child: Text(
              'מעקב מעבר',
              style: TextStyle(
                fontFamily: 'Rubik',
                fontSize: 22,
                fontWeight: FontWeight.w800,
                color: Colors.white,
              ),
            ),
          ),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
            decoration: BoxDecoration(
              color: AppColors.lime,
              borderRadius: BorderRadius.circular(8),
            ),
            child: const Text(
              'פעיל',
              style: TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w800,
                color: AppColors.greenDark,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildBanner() {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          colors: [Color(0xFF0E3A26), Color(0xFF15603E)],
          begin: Alignment.topRight,
          end: Alignment.bottomLeft,
        ),
        borderRadius: BorderRadius.circular(16),
      ),
      child: Row(
        children: [
          const Text('🛡️', style: TextStyle(fontSize: 28)),
          const SizedBox(width: 12),
          const Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'אנחנו מלווים — לא מנתקים',
                  style: TextStyle(
                    fontFamily: 'Rubik',
                    fontSize: 15,
                    fontWeight: FontWeight.w800,
                    color: Colors.white,
                  ),
                ),
                SizedBox(height: 4),
                Text(
                  'אנחנו לצדכם בכל שלב עד סיום המעבר',
                  style: TextStyle(
                    fontSize: 13,
                    color: Color(0xFFC9EC4B),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildTimeline(List<_TrackerStep> steps, int activeStep) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.card,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'שלבי המעבר',
            style: TextStyle(
              fontFamily: 'Rubik',
              fontSize: 16,
              fontWeight: FontWeight.w700,
              color: AppColors.ink,
            ),
          ),
          const SizedBox(height: 16),
          ...steps.asMap().entries.map((entry) {
            final i = entry.key;
            final s = entry.value;
            final isLast = i == steps.length - 1;
            return Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Column(
                  children: [
                    _buildStepIcon(s),
                    if (!isLast)
                      Container(
                        width: 2,
                        height: 44,
                        color: s.done
                            ? AppColors.green
                            : AppColors.border,
                      ),
                  ],
                ),
                const SizedBox(width: 14),
                Expanded(
                  child: Padding(
                    padding: EdgeInsets.only(bottom: isLast ? 0 : 20),
                    child: Container(
                      padding: const EdgeInsets.all(12),
                      decoration: s.active
                          ? BoxDecoration(
                              color: AppColors.green.withOpacity(0.05),
                              borderRadius: BorderRadius.circular(12),
                              border: Border.all(
                                color: AppColors.green.withOpacity(0.3),
                                width: 1.5,
                              ),
                            )
                          : null,
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            s.title,
                            style: TextStyle(
                              fontSize: 15,
                              fontWeight: FontWeight.w700,
                              color: s.done || s.active
                                  ? AppColors.ink
                                  : AppColors.inkMuted,
                            ),
                          ),
                          Text(
                            s.subtitle,
                            style: TextStyle(
                              fontSize: 12,
                              color: s.active
                                  ? AppColors.green
                                  : AppColors.inkMuted,
                            ),
                          ),
                          if (s.active) ...[
                            const SizedBox(height: 6),
                            Container(
                              padding: const EdgeInsets.symmetric(
                                  horizontal: 8, vertical: 3),
                              decoration: BoxDecoration(
                                color: AppColors.green,
                                borderRadius: BorderRadius.circular(6),
                              ),
                              child: const Text(
                                'בתהליך',
                                style: TextStyle(
                                  fontSize: 11,
                                  fontWeight: FontWeight.w700,
                                  color: Colors.white,
                                ),
                              ),
                            ),
                          ],
                        ],
                      ),
                    ),
                  ),
                ),
              ],
            );
          }),
        ],
      ),
    );
  }

  Widget _buildStepIcon(_TrackerStep s) {
    if (s.done && !s.active) {
      return Container(
        width: 28,
        height: 28,
        decoration: const BoxDecoration(
          color: AppColors.green,
          shape: BoxShape.circle,
        ),
        child: const Icon(Icons.check_rounded, color: Colors.white, size: 16),
      );
    }
    if (s.active) {
      return Container(
        width: 28,
        height: 28,
        decoration: BoxDecoration(
          color: AppColors.green,
          shape: BoxShape.circle,
          border: Border.all(color: AppColors.lime, width: 2),
        ),
        child: Center(
          child: Container(
            width: 10,
            height: 10,
            decoration: const BoxDecoration(
              color: AppColors.lime,
              shape: BoxShape.circle,
            ),
          ),
        ),
      );
    }
    return Container(
      width: 28,
      height: 28,
      decoration: BoxDecoration(
        color: AppColors.paper,
        shape: BoxShape.circle,
        border: Border.all(color: AppColors.border, width: 1.5),
      ),
    );
  }

  Widget _buildRepCard(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.card,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'הנציג שלכם',
            style: TextStyle(
              fontFamily: 'Rubik',
              fontSize: 16,
              fontWeight: FontWeight.w700,
              color: AppColors.ink,
            ),
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Container(
                width: 48,
                height: 48,
                decoration: const BoxDecoration(
                  color: AppColors.green,
                  shape: BoxShape.circle,
                ),
                child: const Center(
                  child: Text(
                    'ד',
                    style: TextStyle(
                      fontSize: 22,
                      fontWeight: FontWeight.w800,
                      color: Colors.white,
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 12),
              const Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'דנה',
                      style: TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.w700,
                        color: AppColors.ink,
                      ),
                    ),
                    Text(
                      'נציגת מעבר בכירה',
                      style: TextStyle(
                        fontSize: 13,
                        color: AppColors.inkMuted,
                      ),
                    ),
                  ],
                ),
              ),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Container(
                    padding: const EdgeInsets.symmetric(
                        horizontal: 8, vertical: 3),
                    decoration: BoxDecoration(
                      color: AppColors.green.withOpacity(0.1),
                      borderRadius: BorderRadius.circular(6),
                    ),
                    child: const Text(
                      '● מחוברת',
                      style: TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.w700,
                        color: AppColors.green,
                      ),
                    ),
                  ),
                  const SizedBox(height: 4),
                  const Text(
                    '~5 דקות',
                    style: TextStyle(
                      fontSize: 11,
                      color: AppColors.inkMuted,
                    ),
                  ),
                ],
              ),
            ],
          ),
          const SizedBox(height: 14),
          SizedBox(
            width: double.infinity,
            child: OutlinedButton.icon(
              onPressed: () => context.push('/chat'),
              icon: const Icon(Icons.chat_bubble_outline_rounded, size: 18),
              label: const Text('שליחת הודעה לנציג'),
              style: OutlinedButton.styleFrom(
                foregroundColor: AppColors.green,
                side: const BorderSide(color: AppColors.green),
                padding: const EdgeInsets.symmetric(vertical: 12),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildGuaranteeCard() {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.lime.withOpacity(0.15),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.lime.withOpacity(0.4)),
      ),
      child: const Row(
        children: [
          Text('⭐', style: TextStyle(fontSize: 24)),
          SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'ערבות שקט',
                  style: TextStyle(
                    fontFamily: 'Rubik',
                    fontSize: 15,
                    fontWeight: FontWeight.w800,
                    color: AppColors.greenDark,
                  ),
                ),
                SizedBox(height: 4),
                Text(
                  'אם תהיה בעיה במעבר — אנחנו מטפלים ומחזירים כסף',
                  style: TextStyle(
                    fontSize: 12,
                    color: AppColors.green,
                    height: 1.4,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildAdvanceButton(BuildContext context, AppState appState) {
    return SizedBox(
      width: double.infinity,
      child: FilledButton(
        onPressed: () => appState.advanceTracker(),
        style: FilledButton.styleFrom(
          backgroundColor: AppColors.green,
          foregroundColor: Colors.white,
          padding: const EdgeInsets.symmetric(vertical: 14),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(14),
          ),
        ),
        child: const Text(
          'עדכן שלב',
          style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700),
        ),
      ),
    );
  }
}

class _TrackerStep {
  final String title;
  final String subtitle;
  final bool done;
  final bool active;

  const _TrackerStep({
    required this.title,
    required this.subtitle,
    this.done = false,
    this.active = false,
  });
}
