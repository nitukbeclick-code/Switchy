import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import '../theme.dart';
import '../state.dart';

class AuthScreen extends StatefulWidget {
  const AuthScreen({super.key});

  @override
  State<AuthScreen> createState() => _AuthScreenState();
}

class _AuthScreenState extends State<AuthScreen> {
  final _nameCtrl = TextEditingController();
  final _phoneCtrl = TextEditingController();
  bool _loading = false;

  @override
  void dispose() {
    _nameCtrl.dispose();
    _phoneCtrl.dispose();
    super.dispose();
  }

  void _submit() async {
    if (_nameCtrl.text.isEmpty || _phoneCtrl.text.length < 10) return;
    setState(() => _loading = true);
    await Future.delayed(const Duration(milliseconds: 800));
    if (!mounted) return;
    context.read<AppState>().login(_nameCtrl.text, _phoneCtrl.text);
    context.go('/home');
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.paper,
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(28),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const SizedBox(height: 20),
              // Logo
              Row(
                children: [
                  Container(
                    width: 44,
                    height: 44,
                    decoration: BoxDecoration(
                      color: AppColors.green,
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: const Center(
                      child: Text('ח', style: TextStyle(color: Colors.white, fontSize: 24, fontWeight: FontWeight.w800)),
                    ),
                  ),
                  const SizedBox(width: 10),
                  const Text(
                    'חוסך',
                    style: TextStyle(
                      fontFamily: 'Rubik',
                      fontSize: 28,
                      fontWeight: FontWeight.w800,
                      color: AppColors.green,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 40),
              const Text(
                'ברוכים הבאים!',
                style: TextStyle(
                  fontFamily: 'Rubik',
                  fontSize: 30,
                  fontWeight: FontWeight.w800,
                  color: AppColors.ink,
                  letterSpacing: -0.5,
                ),
              ),
              const SizedBox(height: 8),
              const Text(
                'הכניסו פרטים לקבלת המלצות מותאמות אישית',
                style: TextStyle(
                  fontSize: 15,
                  color: AppColors.inkMuted,
                ),
              ),
              const SizedBox(height: 40),
              _buildField('שם מלא', 'ישראל ישראלי', _nameCtrl, TextInputType.name),
              const SizedBox(height: 16),
              _buildField('טלפון', '050-0000000', _phoneCtrl, TextInputType.phone),
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
                          width: 20,
                          height: 20,
                          child: CircularProgressIndicator(
                              strokeWidth: 2, color: Colors.white),
                        )
                      : const Text(
                          'כניסה →',
                          style: TextStyle(
                              fontSize: 16, fontWeight: FontWeight.w800),
                        ),
                ),
              ),
              const SizedBox(height: 16),
              Center(
                child: TextButton(
                  onPressed: () => context.go('/home'),
                  child: const Text(
                    'המשך ללא כניסה',
                    style: TextStyle(
                      color: AppColors.inkMuted,
                      fontSize: 14,
                    ),
                  ),
                ),
              ),
              const SizedBox(height: 24),
              Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: AppColors.blueLight,
                  borderRadius: BorderRadius.circular(14),
                ),
                child: const Row(
                  children: [
                    Icon(Icons.lock_outline_rounded, size: 18, color: Color(0xFF1A3A7A)),
                    SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        'פרטיכם שמורים בצורה מאובטחת ולא יועברו לצדדים שלישיים ללא הסכמתכם',
                        style: TextStyle(
                          fontSize: 13,
                          color: Color(0xFF1A3A7A),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildField(
      String label, String hint, TextEditingController ctrl, TextInputType type) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label,
          style: const TextStyle(
            fontSize: 14,
            fontWeight: FontWeight.w700,
            color: AppColors.ink,
          ),
        ),
        const SizedBox(height: 8),
        TextField(
          controller: ctrl,
          keyboardType: type,
          textDirection: TextDirection.rtl,
          decoration: InputDecoration(
            hintText: hint,
            hintStyle: const TextStyle(color: AppColors.inkMuted),
            contentPadding:
                const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
          ),
        ),
      ],
    );
  }
}
