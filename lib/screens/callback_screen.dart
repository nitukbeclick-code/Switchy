import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../theme.dart';

class CallbackScreen extends StatefulWidget {
  const CallbackScreen({super.key});

  @override
  State<CallbackScreen> createState() => _CallbackScreenState();
}

class _CallbackScreenState extends State<CallbackScreen> {
  final _nameCtrl = TextEditingController();
  final _phoneCtrl = TextEditingController();
  String _timing = 'asap';
  bool _submitted = false;
  bool _loading = false;

  final _timings = [
    ('asap', 'בהקדם'),
    ('morning', 'בבוקר'),
    ('afternoon', 'אחה"צ'),
    ('evening', 'בערב'),
  ];

  @override
  void dispose() {
    _nameCtrl.dispose();
    _phoneCtrl.dispose();
    super.dispose();
  }

  void _submit() async {
    if (_nameCtrl.text.isEmpty || _phoneCtrl.text.length < 9) return;
    setState(() => _loading = true);
    await Future.delayed(const Duration(milliseconds: 1000));
    if (mounted) {
      setState(() {
        _loading = false;
        _submitted = true;
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
              child: _submitted
                  ? _buildSuccess()
                  : _buildForm(),
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
            'בקשת שיחה',
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
    return SingleChildScrollView(
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'בקשת חזרה',
            style: TextStyle(
              fontFamily: 'Rubik',
              fontSize: 22,
              fontWeight: FontWeight.w800,
              color: AppColors.ink,
            ),
          ),
          const SizedBox(height: 6),
          const Text(
            'נציג יצור איתכם קשר בזמן הנוח לכם',
            style: TextStyle(fontSize: 14, color: AppColors.inkMuted),
          ),
          const SizedBox(height: 28),
          _buildInput('שם', 'ישראל ישראלי', _nameCtrl, TextInputType.name),
          const SizedBox(height: 14),
          _buildInput('טלפון', '050-0000000', _phoneCtrl, TextInputType.phone),
          const SizedBox(height: 24),
          const Text(
            'מתי לחזור?',
            style: TextStyle(
              fontFamily: 'Rubik',
              fontSize: 16,
              fontWeight: FontWeight.w700,
              color: AppColors.ink,
            ),
          ),
          const SizedBox(height: 12),
          Wrap(
            spacing: 10,
            runSpacing: 10,
            children: _timings.map((t) {
              final sel = _timing == t.$1;
              return GestureDetector(
                onTap: () => setState(() => _timing = t.$1),
                child: Container(
                  padding: const EdgeInsets.symmetric(
                      horizontal: 18, vertical: 12),
                  decoration: BoxDecoration(
                    color: sel ? AppColors.green : AppColors.card,
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(
                      color: sel ? AppColors.green : AppColors.border,
                    ),
                  ),
                  child: Text(
                    t.$2,
                    style: TextStyle(
                      fontSize: 15,
                      fontWeight: FontWeight.w700,
                      color: sel ? Colors.white : AppColors.ink,
                    ),
                  ),
                ),
              );
            }).toList(),
          ),
          const SizedBox(height: 32),
          SizedBox(
            width: double.infinity,
            child: FilledButton(
              onPressed: _loading ? null : _submit,
              style: FilledButton.styleFrom(
                backgroundColor: AppColors.green,
                foregroundColor: Colors.white,
                padding: const EdgeInsets.symmetric(vertical: 16),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(16),
                ),
              ),
              child: _loading
                  ? const SizedBox(
                      width: 22,
                      height: 22,
                      child: CircularProgressIndicator(
                          strokeWidth: 2, color: Colors.white),
                    )
                  : const Text(
                      'שלח בקשה',
                      style: TextStyle(
                          fontSize: 16, fontWeight: FontWeight.w800),
                    ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildInput(
      String label, String hint, TextEditingController ctrl, TextInputType type) {
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
          keyboardType: type,
          textDirection: TextDirection.rtl,
          onChanged: (_) => setState(() {}),
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

  Widget _buildSuccess() {
    return Padding(
      padding: const EdgeInsets.all(32),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Container(
            width: 80,
            height: 80,
            decoration: const BoxDecoration(
              color: AppColors.green,
              shape: BoxShape.circle,
            ),
            child: const Icon(Icons.phone_rounded,
                color: Colors.white, size: 40),
          ),
          const SizedBox(height: 24),
          Text(
            'קיבלנו, ${_nameCtrl.text}!',
            style: const TextStyle(
              fontFamily: 'Rubik',
              fontSize: 24,
              fontWeight: FontWeight.w800,
              color: AppColors.ink,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            'נציג יתקשר אל ${_phoneCtrl.text} ${_getTimingLabel()}',
            style: const TextStyle(
              fontSize: 15,
              color: AppColors.inkMuted,
            ),
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 32),
          SizedBox(
            width: double.infinity,
            child: FilledButton(
              onPressed: () => context.pop(),
              style: FilledButton.styleFrom(
                backgroundColor: AppColors.green,
                foregroundColor: Colors.white,
                padding: const EdgeInsets.symmetric(vertical: 14),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(14),
                ),
              ),
              child: const Text('חזרה'),
            ),
          ),
        ],
      ),
    );
  }

  String _getTimingLabel() {
    switch (_timing) {
      case 'morning':
        return 'בבוקר';
      case 'afternoon':
        return 'אחה"צ';
      case 'evening':
        return 'בערב';
      default:
        return 'בהקדם האפשרי';
    }
  }
}
