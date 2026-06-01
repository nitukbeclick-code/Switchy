import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../theme.dart';

class AvailabilityScreen extends StatefulWidget {
  const AvailabilityScreen({super.key});

  @override
  State<AvailabilityScreen> createState() => _AvailabilityScreenState();
}

class _AvailabilityScreenState extends State<AvailabilityScreen> {
  final _cityCtrl = TextEditingController();
  final _streetCtrl = TextEditingController();
  bool _checked = false;
  bool _loading = false;

  final _results = [
    _AvailResult('בזק', true, '1000Mbps סיב', '₪99/חודש'),
    _AvailResult('הוט', true, '500Mbps כבל', '₪109/חודש'),
    _AvailResult('פרטנר', true, '1000Mbps סיב', '₪119/חודש'),
    _AvailResult('סלקום', true, '1000Mbps סיב', '₪109/חודש'),
    _AvailResult('גילת', false, 'לווין', '₪129/חודש'),
  ];

  @override
  void dispose() {
    _cityCtrl.dispose();
    _streetCtrl.dispose();
    super.dispose();
  }

  void _check() async {
    if (_cityCtrl.text.isEmpty || _streetCtrl.text.isEmpty) return;
    setState(() {
      _loading = true;
      _checked = false;
    });
    await Future.delayed(const Duration(milliseconds: 1500));
    if (mounted) {
      setState(() {
        _loading = false;
        _checked = true;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
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
                      'בדיקת זמינות אינטרנט',
                      style: TextStyle(
                        fontFamily: 'Rubik',
                        fontSize: 20,
                        fontWeight: FontWeight.w800,
                        color: AppColors.ink,
                      ),
                    ),
                    const SizedBox(height: 6),
                    const Text(
                      'בדקו אילו ספקי אינטרנט זמינים בכתובתכם',
                      style: TextStyle(fontSize: 14, color: AppColors.inkMuted),
                    ),
                    const SizedBox(height: 24),
                    _buildForm(),
                    if (_loading) ...[
                      const SizedBox(height: 24),
                      const Center(
                        child: CircularProgressIndicator(
                            color: AppColors.green),
                      ),
                    ],
                    if (_checked) ...[
                      const SizedBox(height: 24),
                      _buildResults(),
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
            'זמינות',
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

  Widget _buildForm() {
    return Column(
      children: [
        _buildInput('עיר', 'תל אביב', _cityCtrl),
        const SizedBox(height: 12),
        _buildInput('רחוב ומספר', 'רוטשילד 1', _streetCtrl),
        const SizedBox(height: 16),
        SizedBox(
          width: double.infinity,
          child: FilledButton(
            onPressed: _loading ? null : _check,
            style: FilledButton.styleFrom(
              backgroundColor: AppColors.green,
              foregroundColor: Colors.white,
              padding: const EdgeInsets.symmetric(vertical: 15),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(14),
              ),
            ),
            child: const Text(
              'בדוק זמינות',
              style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700),
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildInput(
      String label, String hint, TextEditingController ctrl) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label,
          style: const TextStyle(
            fontSize: 13,
            fontWeight: FontWeight.w700,
            color: AppColors.ink,
          ),
        ),
        const SizedBox(height: 6),
        TextField(
          controller: ctrl,
          textDirection: TextDirection.rtl,
          decoration: InputDecoration(
            hintText: hint,
            hintTextDirection: TextDirection.rtl,
            contentPadding:
                const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
          ),
        ),
      ],
    );
  }

  Widget _buildResults() {
    final available = _results.where((r) => r.available).length;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: AppColors.green.withOpacity(0.1),
            borderRadius: BorderRadius.circular(12),
          ),
          child: Row(
            children: [
              const Icon(Icons.location_on_rounded,
                  color: AppColors.green, size: 20),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  '${_cityCtrl.text}, ${_streetCtrl.text}',
                  style: const TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                    color: AppColors.ink,
                  ),
                ),
              ),
              Text(
                '$available ספקים זמינים',
                style: const TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w700,
                  color: AppColors.green,
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 14),
        ..._results.map((r) => _buildResultRow(r)),
      ],
    );
  }

  Widget _buildResultRow(_AvailResult r) {
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppColors.card,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(
          color: r.available
              ? AppColors.green.withOpacity(0.2)
              : AppColors.border,
        ),
      ),
      child: Row(
        children: [
          Container(
            width: 36,
            height: 36,
            decoration: BoxDecoration(
              color: r.available
                  ? AppColors.green.withOpacity(0.1)
                  : AppColors.border.withOpacity(0.5),
              shape: BoxShape.circle,
            ),
            child: Center(
              child: Icon(
                r.available
                    ? Icons.check_rounded
                    : Icons.close_rounded,
                color: r.available ? AppColors.green : AppColors.inkMuted,
                size: 18,
              ),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  r.provider,
                  style: TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.w700,
                    color: r.available ? AppColors.ink : AppColors.inkMuted,
                  ),
                ),
                Text(
                  r.available ? r.tech : 'לא זמין באזור',
                  style: TextStyle(
                    fontSize: 12,
                    color: r.available
                        ? AppColors.inkMuted
                        : AppColors.danger.withOpacity(0.7),
                  ),
                ),
              ],
            ),
          ),
          if (r.available)
            Text(
              r.price,
              style: const TextStyle(
                fontFamily: 'Rubik',
                fontSize: 14,
                fontWeight: FontWeight.w800,
                color: AppColors.green,
              ),
            ),
        ],
      ),
    );
  }
}

class _AvailResult {
  final String provider;
  final bool available;
  final String tech;
  final String price;

  const _AvailResult(this.provider, this.available, this.tech, this.price);
}
