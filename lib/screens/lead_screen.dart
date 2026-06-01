import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import '../theme.dart';
import '../state.dart';
import '../data.dart';
import '../models.dart';
import '../widgets/logo_widget.dart';

class LeadScreen extends StatefulWidget {
  final String planId;
  const LeadScreen({super.key, required this.planId});

  @override
  State<LeadScreen> createState() => _LeadScreenState();
}

class _LeadScreenState extends State<LeadScreen> {
  final _nameCtrl = TextEditingController();
  final _phoneCtrl = TextEditingController();
  String _currentProvider = '';
  bool _submitting = false;

  final _providers = [
    'פלאפון', 'סלקום', 'פרטנר', 'הוט', 'yes', 'בזק', 'אחר'
  ];

  bool get _isValid =>
      _nameCtrl.text.trim().isNotEmpty &&
      _phoneCtrl.text.trim().length >= 9 &&
      _currentProvider.isNotEmpty;

  @override
  void dispose() {
    _nameCtrl.dispose();
    _phoneCtrl.dispose();
    super.dispose();
  }

  void _submit() async {
    if (!_isValid) return;
    setState(() => _submitting = true);
    await Future.delayed(const Duration(milliseconds: 1200));
    if (!mounted) return;
    final appState = context.read<AppState>();
    appState.setLead(
      name: _nameCtrl.text,
      phone: _phoneCtrl.text,
      provider: _currentProvider,
      planId: widget.planId,
    );
    appState.submitLead();
    context.go('/success');
  }

  @override
  Widget build(BuildContext context) {
    final plan = planById(widget.planId);

    return Scaffold(
      backgroundColor: AppColors.paper,
      body: SafeArea(
        child: Column(
          children: [
            _buildHeader(),
            Expanded(
              child: SingleChildScrollView(
                padding: const EdgeInsets.all(20),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    if (plan != null) _buildPlanSummary(plan),
                    const SizedBox(height: 24),
                    _buildForm(),
                    const SizedBox(height: 24),
                    _buildProviderChips(),
                    const SizedBox(height: 24),
                    _buildPrivacyNote(),
                    const SizedBox(height: 24),
                    _buildSubmitButton(),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildHeader() {
    return Container(
      color: AppColors.green,
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 20),
      child: Row(
        children: [
          GestureDetector(
            onTap: () => context.pop(),
            child: const Icon(Icons.arrow_back_ios_rounded,
                color: Colors.white, size: 20),
          ),
          const SizedBox(width: 12),
          const Text(
            'השלמת מעבר',
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

  Widget _buildPlanSummary(Plan plan) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.card,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.lime.withOpacity(0.5), width: 1.5),
      ),
      child: Row(
        children: [
          LogoWidget(provider: plan.provider, size: 44),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  plan.provider,
                  style: const TextStyle(
                    fontFamily: 'Rubik',
                    fontSize: 16,
                    fontWeight: FontWeight.w800,
                    color: AppColors.ink,
                  ),
                ),
                Text(
                  plan.plan,
                  style: const TextStyle(
                    fontSize: 13,
                    color: AppColors.inkMuted,
                  ),
                ),
              ],
            ),
          ),
          Text(
            plan.displayPrice,
            style: const TextStyle(
              fontFamily: 'Rubik',
              fontSize: 22,
              fontWeight: FontWeight.w800,
              color: AppColors.green,
            ),
          ),
          Text(
            '/חודש',
            style: const TextStyle(fontSize: 12, color: AppColors.inkMuted),
          ),
        ],
      ),
    );
  }

  Widget _buildForm() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text(
          'פרטי התקשרות',
          style: TextStyle(
            fontFamily: 'Rubik',
            fontSize: 16,
            fontWeight: FontWeight.w700,
            color: AppColors.ink,
          ),
        ),
        const SizedBox(height: 14),
        _buildTextField('שם מלא', 'ישראל ישראלי', _nameCtrl, TextInputType.name),
        const SizedBox(height: 12),
        _buildTextField('טלפון', '050-0000000', _phoneCtrl, TextInputType.phone),
      ],
    );
  }

  Widget _buildTextField(
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

  Widget _buildProviderChips() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text(
          'הספק הנוכחי שלכם',
          style: TextStyle(
            fontFamily: 'Rubik',
            fontSize: 16,
            fontWeight: FontWeight.w700,
            color: AppColors.ink,
          ),
        ),
        const SizedBox(height: 12),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: _providers.map((p) {
            final sel = _currentProvider == p;
            return GestureDetector(
              onTap: () => setState(() => _currentProvider = p),
              child: Container(
                padding: const EdgeInsets.symmetric(
                    horizontal: 14, vertical: 10),
                decoration: BoxDecoration(
                  color: sel ? AppColors.green : AppColors.card,
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(
                    color: sel ? AppColors.green : AppColors.border,
                  ),
                ),
                child: Text(
                  p,
                  style: TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                    color: sel ? Colors.white : AppColors.ink,
                  ),
                ),
              ),
            );
          }).toList(),
        ),
      ],
    );
  }

  Widget _buildPrivacyNote() {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppColors.blueLight,
        borderRadius: BorderRadius.circular(12),
      ),
      child: const Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(Icons.shield_outlined, size: 18, color: Color(0xFF1A3A7A)),
          SizedBox(width: 8),
          Expanded(
            child: Text(
              'פרטיכם מוגנים ומאובטחים. נציג יצור איתכם קשר לתיאום המעבר. לא נעביר פרטים לצדדים שלישיים ללא הסכמתכם.',
              style: TextStyle(
                fontSize: 12,
                color: Color(0xFF1A3A7A),
                height: 1.5,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildSubmitButton() {
    return SizedBox(
      width: double.infinity,
      child: FilledButton(
        onPressed: _isValid && !_submitting ? _submit : null,
        style: FilledButton.styleFrom(
          backgroundColor: AppColors.green,
          disabledBackgroundColor: AppColors.border,
          foregroundColor: Colors.white,
          padding: const EdgeInsets.symmetric(vertical: 16),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(16),
          ),
        ),
        child: _submitting
            ? const SizedBox(
                width: 24,
                height: 24,
                child: CircularProgressIndicator(
                    strokeWidth: 2, color: Colors.white),
              )
            : const Text(
                'שלחו בקשת מעבר →',
                style: TextStyle(
                    fontSize: 17, fontWeight: FontWeight.w800),
              ),
      ),
    );
  }
}
