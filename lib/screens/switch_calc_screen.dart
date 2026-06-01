import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../theme.dart';

class SwitchCalcScreen extends StatefulWidget {
  const SwitchCalcScreen({super.key});

  @override
  State<SwitchCalcScreen> createState() => _SwitchCalcScreenState();
}

class _SwitchCalcScreenState extends State<SwitchCalcScreen> {
  double _currentBill = 119;
  double _newPlan = 39;
  double _exitFee = 0;

  int get _annualSavings =>
      ((_currentBill - _newPlan) * 12 - _exitFee).round();
  int get _breakevenMonths =>
      _currentBill > _newPlan && _exitFee > 0
          ? (_exitFee / (_currentBill - _newPlan)).ceil()
          : 0;

  @override
  Widget build(BuildContext context) {
    final positive = _annualSavings > 0;

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
                    const Text(
                      'מחשבון מעבר',
                      style: TextStyle(
                        fontFamily: 'Rubik',
                        fontSize: 20,
                        fontWeight: FontWeight.w800,
                        color: AppColors.ink,
                      ),
                    ),
                    const SizedBox(height: 6),
                    const Text(
                      'חשבו כמה תחסכו לאחר המעבר',
                      style: TextStyle(fontSize: 14, color: AppColors.inkMuted),
                    ),
                    const SizedBox(height: 24),
                    _buildSlider(
                      label: 'חשבון חודשי נוכחי',
                      value: _currentBill,
                      min: 0,
                      max: 500,
                      onChanged: (v) =>
                          setState(() => _currentBill = v),
                    ),
                    const SizedBox(height: 20),
                    _buildSlider(
                      label: 'מחיר מסלול חדש',
                      value: _newPlan,
                      min: 0,
                      max: 300,
                      onChanged: (v) => setState(() => _newPlan = v),
                    ),
                    const SizedBox(height: 20),
                    _buildSlider(
                      label: 'עמלת ניתוק',
                      value: _exitFee,
                      min: 0,
                      max: 500,
                      onChanged: (v) => setState(() => _exitFee = v),
                    ),
                    const SizedBox(height: 28),
                    _buildResult(positive),
                    if (_breakevenMonths > 0) ...[
                      const SizedBox(height: 16),
                      _buildBreakeven(),
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
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 16),
      child: Row(
        children: [
          GestureDetector(
            onTap: () => context.pop(),
            child: const Icon(Icons.arrow_back_ios_rounded,
                color: Colors.white, size: 20),
          ),
          const SizedBox(width: 12),
          const Text(
            'מחשבון מעבר',
            style: TextStyle(
              fontFamily: 'Rubik',
              fontSize: 20,
              fontWeight: FontWeight.w800,
              color: Colors.white,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildSlider({
    required String label,
    required double value,
    required double min,
    required double max,
    required ValueChanged<double> onChanged,
  }) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.card,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Text(
                label,
                style: const TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.w600,
                  color: AppColors.ink,
                ),
              ),
              const Spacer(),
              Text(
                '₪${value.round()}',
                style: const TextStyle(
                  fontFamily: 'Rubik',
                  fontSize: 18,
                  fontWeight: FontWeight.w800,
                  color: AppColors.green,
                ),
              ),
            ],
          ),
          SliderTheme(
            data: SliderTheme.of(context).copyWith(
              activeTrackColor: AppColors.green,
              inactiveTrackColor: AppColors.border,
              thumbColor: AppColors.green,
              overlayColor: AppColors.green.withOpacity(0.1),
              thumbShape:
                  const RoundSliderThumbShape(enabledThumbRadius: 12),
              trackHeight: 6,
            ),
            child: Slider(
              value: value,
              min: min,
              max: max,
              onChanged: onChanged,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildResult(bool positive) {
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: positive
              ? [const Color(0xFF0E3A26), const Color(0xFF15603E)]
              : [const Color(0xFF7A1A1A), const Color(0xFFC5533B)],
          begin: Alignment.topRight,
          end: Alignment.bottomLeft,
        ),
        borderRadius: BorderRadius.circular(18),
      ),
      child: Column(
        children: [
          Text(
            positive ? 'חיסכון שנתי!' : 'לא כדאי כרגע',
            style: TextStyle(
              fontSize: 15,
              color: Colors.white.withOpacity(0.8),
            ),
          ),
          const SizedBox(height: 8),
          Text(
            positive
                ? '₪${_annualSavings.abs()}'
                : '-₪${_annualSavings.abs()}',
            style: TextStyle(
              fontFamily: 'Rubik',
              fontSize: 44,
              fontWeight: FontWeight.w800,
              color: positive ? const Color(0xFFC9EC4B) : Colors.white,
              letterSpacing: -2,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            positive
                ? 'חיסכון בשנה הראשונה'
                : 'עלות נוספת בגלל עמלת ניתוק',
            style: TextStyle(
              fontSize: 13,
              color: Colors.white.withOpacity(0.7),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildBreakeven() {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppColors.orange.withOpacity(0.1),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.orange.withOpacity(0.3)),
      ),
      child: Row(
        children: [
          const Icon(Icons.timeline_rounded,
              color: AppColors.orange, size: 20),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              'נקודת איזון: אחרי $_breakevenMonths חודשים תתחילו לחסוך',
              style: const TextStyle(
                fontSize: 14,
                color: AppColors.orange,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
