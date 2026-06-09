import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:provider/provider.dart';
import '../../theme/app_theme.dart';
import '../../core/nav.dart';
import '../../widgets/app_button.dart';
import '../../app_state.dart';
import '../../services/backend/backend.dart';
import '../../services/backend/local_backend.dart';

class CallbackWidget extends StatefulWidget {
  const CallbackWidget({super.key});

  @override
  State<CallbackWidget> createState() => _CallbackWidgetState();
}

class _CallbackWidgetState extends State<CallbackWidget> {
  final _nameCtrl = TextEditingController();
  final _phoneCtrl = TextEditingController();
  String _timing = 'בהקדם';
  String _topic = 'סלולר';
  bool _submitted = false;
  bool _isLoading = false;
  int _expertIndex = 0;
  Timer? _expertTimer;

  static const _timings = ['בהקדם', 'בוקר', 'אחה"צ', 'ערב'];
  static const _topics = ['סלולר', 'אינטרנט', 'טלוויזיה', 'חבילה משולבת', 'ניתוק', 'אחר'];

  static const _experts = [
    _Expert(name: 'דנה כהן', title: 'מומחית סלולר', rating: '4.9', handled: '1,240 לקוחות', avatar: 'ד'),
    _Expert(name: 'איתן לוי', title: 'מומחה אינטרנט ו-TV', rating: '4.8', handled: '980 לקוחות', avatar: 'א'),
    _Expert(name: 'ריקי מזרחי', title: 'מומחית חבילות', rating: '5.0', handled: '650 לקוחות', avatar: 'ר'),
  ];

  @override
  void initState() {
    super.initState();
    final appState = AppState();
    if (appState.userName.isNotEmpty) _nameCtrl.text = appState.userName;
    if (appState.userPhone.isNotEmpty) _phoneCtrl.text = appState.userPhone;
    _expertTimer = Timer.periodic(const Duration(seconds: 3), (_) {
      if (mounted) setState(() => _expertIndex = (_expertIndex + 1) % _experts.length);
    });
  }

  @override
  void dispose() {
    _nameCtrl.dispose();
    _phoneCtrl.dispose();
    _expertTimer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final ffTheme = AppTheme.of(context);

    if (_submitted) return _buildSuccessState(ffTheme, context);

    return Scaffold(
      backgroundColor: ffTheme.background,
      appBar: AppBar(
        title: Text('שיחה עם מומחה', style: ffTheme.titleMedium),
        backgroundColor: Colors.transparent,
        elevation: 0,
        foregroundColor: ffTheme.primaryText,
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Expert showcase
            _buildExpertCard(ffTheme),
            const SizedBox(height: 24),

            // Topic selector
            Text('בנושא מה תרצו לדבר?', style: ffTheme.labelLarge.copyWith(fontWeight: FontWeight.w600)),
            const SizedBox(height: 10),
            _buildTopicChips(ffTheme),
            const SizedBox(height: 20),

            // Name field
            Text('שם מלא', style: ffTheme.labelLarge.copyWith(fontWeight: FontWeight.w600)),
            const SizedBox(height: 8),
            TextField(
              controller: _nameCtrl,
              textDirection: TextDirection.rtl,
              decoration: _inputDecoration(ffTheme, hint: 'ישראל ישראלי', icon: Icons.person_outline_rounded),
            ).animate().fadeIn(duration: 300.ms).slideY(begin: 0.05),

            const SizedBox(height: 16),

            Text('מספר טלפון', style: ffTheme.labelLarge.copyWith(fontWeight: FontWeight.w600)),
            const SizedBox(height: 8),
            TextField(
              controller: _phoneCtrl,
              keyboardType: TextInputType.phone,
              textDirection: TextDirection.ltr,
              decoration: _inputDecoration(ffTheme, hint: '050-0000000', icon: Icons.phone_outlined),
            ).animate().fadeIn(delay: 60.ms).slideY(begin: 0.05),

            const SizedBox(height: 20),

            Text('מתי נוח לכם?', style: ffTheme.labelLarge.copyWith(fontWeight: FontWeight.w600)),
            const SizedBox(height: 10),
            _buildTimingChips(ffTheme),

            const SizedBox(height: 24),

            // Hours info
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: ffTheme.alternate),
              ),
              child: Row(
                children: [
                  Icon(Icons.schedule_rounded, color: ffTheme.primary, size: 20),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('שעות פעילות', style: ffTheme.labelMedium.copyWith(fontWeight: FontWeight.w600)),
                        Text('ימי א׳–ה׳, 9:00–21:00 • שישי 9:00–14:00', style: ffTheme.labelSmall.copyWith(color: ffTheme.secondaryText)),
                      ],
                    ),
                  ),
                  Container(
                    width: 8, height: 8,
                    decoration: BoxDecoration(color: ffTheme.success, shape: BoxShape.circle),
                  ).animate(onPlay: (c) => c.repeat(reverse: true))
                    .scale(begin: const Offset(1, 1), end: const Offset(1.5, 1.5), duration: 900.ms),
                ],
              ),
            ).animate().fadeIn(delay: 180.ms),

            const SizedBox(height: 24),

            AppButton(
              text: _isLoading ? 'שולח...' : 'בקש שיחה חוזרת',
              onPressed: _isLoading ? () async {} : () async {
                if (_nameCtrl.text.trim().isEmpty || _phoneCtrl.text.trim().isEmpty) {
                  ScaffoldMessenger.of(context).showSnackBar(SnackBar(
                    content: const Text('נא למלא שם ומספר טלפון'),
                    backgroundColor: AppTheme.of(context).error,
                    behavior: SnackBarBehavior.floating,
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                    duration: const Duration(seconds: 2),
                  ));
                  return;
                }
                final phoneDigits = _phoneCtrl.text.replaceAll(RegExp(r'[\s\-]'), '');
                if (phoneDigits.length < 9 || phoneDigits.length > 10 || !phoneDigits.startsWith('0')) {
                  ScaffoldMessenger.of(context).showSnackBar(SnackBar(
                    content: const Text('מספר טלפון אינו תקין'),
                    backgroundColor: AppTheme.of(context).error,
                    behavior: SnackBarBehavior.floating,
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                    duration: const Duration(seconds: 2),
                  ));
                  return;
                }
                setState(() => _isLoading = true);
                final name = _nameCtrl.text.trim();
                final phone = _phoneCtrl.text.replaceAll(RegExp(r'[\s\-]'), '');
                // Map timing chips to callback_time keys used in leads table.
                final callbackMap = {'בהקדם': 'now', 'בוקר': 'noon', 'אחה"צ': 'evening', 'ערב': 'tomorrow'};
                final st = AppState();
                const topicToCat = {
                  'סלולר': 'cellular', 'אינטרנט': 'internet',
                  'טלוויזיה': 'tv', 'חבילה משולבת': 'triple',
                };
                final catId = topicToCat[_topic];
                final bill = catId != null ? st.currentBill(catId) : 0;
                final noteParts = <String>['נושא: $_topic', 'עיתוי: $_timing'];
                if (bill > 0) noteParts.add('חשבון נוכחי: ₪$bill/חודש');
                if (st.quizCompleted) noteParts.add('תקציב: ₪${st.quizBudget} | עדיפות: ${st.quizPriority}');
                appBackend.submitLead(LeadInput(
                  name: name,
                  phone: phone,
                  callbackTime: callbackMap[_timing] ?? 'now',
                  provider: _topic,
                  source: 'callback',
                  notes: noteParts.join(' | '),
                )).catchError((_) {});
                appBackend.upsertProfile(name: name, phone: phone).catchError((_) {});
                Provider.of<AppState>(context, listen: false).login(name: name, phone: phone);
                await Future.delayed(const Duration(milliseconds: 300));
                if (!mounted) return;
                setState(() { _isLoading = false; _submitted = true; });
              },
              
                width: double.infinity,
                height: 56,
                color: _isLoading ? ffTheme.alternate : ffTheme.primary,
                textStyle: ffTheme.titleSmall.copyWith(color: Colors.white),
                borderRadius: BorderRadius.circular(16),
              
            ).animate().fadeIn(delay: 220.ms),

            const SizedBox(height: 12),

            Center(
              child: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(Icons.lock_outline_rounded, size: 13, color: ffTheme.secondaryText),
                  const SizedBox(width: 4),
                  Text('ללא עלות. פרטייך מוגנים לחלוטין', style: ffTheme.labelSmall.copyWith(color: ffTheme.secondaryText)),
                ],
              ),
            ),

            const SizedBox(height: 32),
          ],
        ),
      ),
    );
  }

  Widget _buildExpertCard(AppTheme ffTheme) {
    final expert = _experts[_expertIndex];
    return AnimatedSwitcher(
      duration: const Duration(milliseconds: 400),
      transitionBuilder: (child, anim) => FadeTransition(
        opacity: anim,
        child: SlideTransition(position: Tween(begin: const Offset(0, 0.05), end: Offset.zero).animate(anim), child: child),
      ),
      child: Container(
        key: ValueKey(_expertIndex),
        padding: const EdgeInsets.all(18),
        decoration: BoxDecoration(
          gradient: LinearGradient(colors: [ffTheme.primary, ffTheme.tertiary], begin: Alignment.topRight, end: Alignment.bottomLeft),
          borderRadius: BorderRadius.circular(16),
        ),
        child: Row(
          children: [
            Container(
              width: 56,
              height: 56,
              decoration: BoxDecoration(color: ffTheme.secondary, shape: BoxShape.circle),
              child: Center(child: Text(expert.avatar, style: GoogleFonts.rubik(fontSize: 24, fontWeight: FontWeight.w800, color: ffTheme.primary))),
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Text(expert.name, style: GoogleFonts.rubik(fontSize: 16, fontWeight: FontWeight.w700, color: Colors.white)),
                      const SizedBox(width: 6),
                      const Icon(Icons.verified_rounded, size: 14, color: Color(0xFFC9EC4B)),
                    ],
                  ),
                  Text(expert.title, style: GoogleFonts.assistant(fontSize: 12, color: Colors.white70)),
                  const SizedBox(height: 6),
                  Row(
                    children: [
                      const Icon(Icons.star_rounded, size: 13, color: Color(0xFFFFC107)),
                      const SizedBox(width: 2),
                      Text(expert.rating, style: GoogleFonts.assistant(fontSize: 12, color: Colors.white)),
                      const SizedBox(width: 10),
                      const Icon(Icons.people_rounded, size: 13, color: Colors.white60),
                      const SizedBox(width: 3),
                      Text(expert.handled, style: GoogleFonts.assistant(fontSize: 11, color: Colors.white70)),
                    ],
                  ),
                ],
              ),
            ),
            Column(
              children: [
                Container(
                  width: 10, height: 10,
                  decoration: const BoxDecoration(color: Color(0xFF25D366), shape: BoxShape.circle),
                ).animate(onPlay: (c) => c.repeat(reverse: true)).scale(begin: const Offset(1, 1), end: const Offset(1.4, 1.4), duration: 800.ms),
                const SizedBox(height: 3),
                Text('זמין', style: GoogleFonts.assistant(fontSize: 10, color: Colors.white70)),
              ],
            ),
          ],
        ),
      ),
    ).animate().fadeIn(duration: 350.ms);
  }

  Widget _buildTopicChips(AppTheme ffTheme) {
    return Wrap(
      spacing: 8,
      runSpacing: 8,
      children: _topics.map((t) {
        final active = _topic == t;
        return GestureDetector(
          onTap: () => setState(() => _topic = t),
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 200),
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
            decoration: BoxDecoration(
              color: active ? ffTheme.primary : Colors.white,
              borderRadius: BorderRadius.circular(20),
              border: Border.all(color: active ? ffTheme.primary : ffTheme.alternate),
              boxShadow: active ? [BoxShadow(color: ffTheme.primary.withValues(alpha: 0.2), blurRadius: 8, offset: const Offset(0, 2))] : [],
            ),
            child: Text(t, style: ffTheme.labelMedium.copyWith(
              color: active ? Colors.white : ffTheme.primaryText,
              fontWeight: active ? FontWeight.w700 : FontWeight.w500,
            )),
          ),
        );
      }).toList(),
    ).animate().fadeIn(delay: 80.ms);
  }

  Widget _buildTimingChips(AppTheme ffTheme) {
    final icons = [Icons.flash_on_rounded, Icons.wb_sunny_outlined, Icons.wb_twilight_outlined, Icons.nights_stay_outlined];
    return Row(
      children: List.generate(_timings.length, (i) {
        final t = _timings[i];
        final active = _timing == t;
        return Expanded(
          child: GestureDetector(
            onTap: () => setState(() => _timing = t),
            child: AnimatedContainer(
              duration: const Duration(milliseconds: 200),
              margin: EdgeInsets.only(right: i < _timings.length - 1 ? 8 : 0),
              padding: const EdgeInsets.symmetric(vertical: 10),
              decoration: BoxDecoration(
                color: active ? ffTheme.primary : Colors.white,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: active ? ffTheme.primary : ffTheme.alternate),
                boxShadow: active ? [BoxShadow(color: ffTheme.primary.withValues(alpha: 0.2), blurRadius: 8, offset: const Offset(0, 2))] : [],
              ),
              child: Column(
                children: [
                  Icon(icons[i], size: 18, color: active ? Colors.white : ffTheme.secondaryText),
                  const SizedBox(height: 4),
                  Text(t, style: ffTheme.labelSmall.copyWith(color: active ? Colors.white : ffTheme.primaryText, fontWeight: active ? FontWeight.w700 : FontWeight.w500, fontSize: 11)),
                ],
              ),
            ),
          ),
        );
      }),
    ).animate().fadeIn(delay: 140.ms);
  }

  Widget _buildSuccessState(AppTheme ffTheme, BuildContext context) {
    return Scaffold(
      backgroundColor: ffTheme.background,
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Stack(
                alignment: Alignment.center,
                children: [
                  Container(
                    width: 120, height: 120,
                    decoration: BoxDecoration(color: ffTheme.primary.withValues(alpha: 0.08), shape: BoxShape.circle),
                  ).animate(onPlay: (c) => c.repeat(reverse: true))
                    .scale(begin: const Offset(1, 1), end: const Offset(1.12, 1.12), duration: 1200.ms),
                  Container(
                    width: 92, height: 92,
                    decoration: BoxDecoration(color: ffTheme.accent1, shape: BoxShape.circle),
                    child: Icon(Icons.phone_in_talk_rounded, color: ffTheme.primary, size: 46),
                  ).animate().scale(duration: 600.ms, curve: Curves.elasticOut),
                  Positioned(
                    top: 4, right: 4,
                    child: const Text('✨', style: TextStyle(fontSize: 16)).animate(delay: 400.ms).fadeIn().slideY(begin: -0.5),
                  ),
                ],
              ),
              const SizedBox(height: 28),
              Text('קיבלנו!', style: ffTheme.headlineMedium).animate().fadeIn(delay: 300.ms).slideY(begin: 0.2),
              const SizedBox(height: 8),
              Text(
                'נציג ייצור קשר $_timing\nבנושא: $_topic',
                style: ffTheme.bodyLarge.copyWith(color: ffTheme.secondaryText),
                textAlign: TextAlign.center,
              ).animate().fadeIn(delay: 400.ms),
              const SizedBox(height: 24),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
                decoration: BoxDecoration(
                  color: ffTheme.accent1,
                  borderRadius: BorderRadius.circular(14),
                  border: Border.all(color: ffTheme.primary.withValues(alpha: 0.15)),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(Icons.access_time_rounded, size: 16, color: ffTheme.primary),
                    const SizedBox(width: 8),
                    Text('ימי א׳–ה׳, 9:00–21:00', style: ffTheme.labelMedium.copyWith(color: ffTheme.primary, fontWeight: FontWeight.w600)),
                  ],
                ),
              ).animate().fadeIn(delay: 450.ms),
              const SizedBox(height: 32),
              AppButton(
                text: 'מעקב אחר התהליך',
                onPressed: () async => context.goNamed('Tracker'),
                
                  width: 240,
                  height: 52,
                  color: ffTheme.primary,
                  textStyle: ffTheme.titleSmall.copyWith(color: Colors.white),
                  borderRadius: BorderRadius.circular(14),
                
              ).animate().fadeIn(delay: 500.ms),
              const SizedBox(height: 12),
              TextButton(
                onPressed: () => context.safePop(),
                child: Text('חזרה', style: ffTheme.bodyMedium.copyWith(color: ffTheme.secondaryText)),
              ).animate().fadeIn(delay: 600.ms),
            ],
          ),
        ),
      ),
    );
  }

  InputDecoration _inputDecoration(AppTheme ffTheme, {required String hint, required IconData icon}) {
    return InputDecoration(
      hintText: hint,
      filled: true,
      fillColor: Colors.white,
      prefixIcon: Icon(icon, color: ffTheme.secondaryText),
      border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide.none),
      enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide(color: ffTheme.alternate)),
      focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide(color: ffTheme.primary, width: 1.5)),
    );
  }
}

class _Expert {
  final String name, title, rating, handled, avatar;
  const _Expert({required this.name, required this.title, required this.rating, required this.handled, required this.avatar});
}
