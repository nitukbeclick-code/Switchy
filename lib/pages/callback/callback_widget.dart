import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:provider/provider.dart';
import '../../theme/app_theme.dart';
import '../../core/nav.dart';
import '../../widgets/app_button.dart';
import '../../widgets/app_snackbar.dart';
import '../../app_state.dart';
import '../../data.dart';
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

  static const _timings = ['בהקדם', 'בוקר', 'אחה"צ', 'ערב'];
  static const _topics = ['סלולר', 'אינטרנט', 'טלוויזיה', 'חבילה משולבת', 'ניתוק', 'אחר'];

  @override
  void initState() {
    super.initState();
    final appState = AppState();
    if (appState.userName.isNotEmpty) _nameCtrl.text = appState.userName;
    if (appState.userPhone.isNotEmpty) _phoneCtrl.text = appState.userPhone;
  }

  @override
  void dispose() {
    _nameCtrl.dispose();
    _phoneCtrl.dispose();
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
            // Honest value-prop card — a human rep will call back. No invented
            // names, ratings, or handled-counts.
            _buildCallbackCard(ffTheme),
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
                  ).animate().fadeIn(duration: 400.ms),
                ],
              ),
            ).animate().fadeIn(delay: 180.ms),

            const SizedBox(height: 24),

            AppButton(
              text: _isLoading ? 'שולח...' : 'בקש שיחה חוזרת',
              onPressed: _isLoading ? () async {} : () async {
                if (_nameCtrl.text.trim().isEmpty || _phoneCtrl.text.trim().isEmpty) {
                  AppSnackBar.error(context, 'נא למלא שם ומספר טלפון',
                      duration: const Duration(seconds: 2));
                  return;
                }
                final phoneDigits = _phoneCtrl.text.replaceAll(RegExp(r'[\s\-]'), '');
                if (phoneDigits.length < 9 || phoneDigits.length > 10 || !phoneDigits.startsWith('0')) {
                  AppSnackBar.error(context, 'מספר טלפון אינו תקין',
                      duration: const Duration(seconds: 2));
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
                if (bill > 0) noteParts.add('חשבון נוכחי: ₪$bill$kBillUnit');
                if (st.quizCompleted) noteParts.add('תקציב: ₪${st.quizBudget} | עדיפות: ${st.quizPriority}');
                try {
                  await appBackend.submitLead(LeadInput(
                    name: name,
                    phone: phone,
                    callbackTime: callbackMap[_timing] ?? 'now',
                    provider: _topic,
                    source: 'callback',
                    notes: noteParts.join(' | '),
                  )).timeout(const Duration(seconds: 10));
                } catch (_) {
                  // The request never reached the team — let the user retry
                  // instead of waiting for a call that won't come.
                  if (!context.mounted) return;
                  setState(() => _isLoading = false);
                  AppSnackBar.error(context, 'שליחת הבקשה נכשלה — בדקו את החיבור ונסו שוב');
                  return;
                }
                appBackend.upsertProfile(name: name, phone: phone).catchError((_) {});
                if (!context.mounted) return;
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

            const SizedBox(height: 14),

            // Cross-link: prefer a face-to-face quote? Book a Zoom meeting.
            Center(
              child: Material(
                color: Colors.transparent,
                child: InkWell(
                  borderRadius: BorderRadius.circular(10),
                  onTap: () => context.pushNamed('Meeting', queryParameters: {'source': 'callback'}),
                  child: Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(Icons.videocam_rounded, size: 16, color: ffTheme.brandAccent),
                        const SizedBox(width: 6),
                        Flexible(
                          child: Text(
                            'מעדיפים פגישת וידאו? קבעו שיחת Zoom עם נציג',
                            style: ffTheme.labelMedium.copyWith(
                                color: ffTheme.brandAccent, fontWeight: FontWeight.w700),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ),

            const SizedBox(height: 32),
          ],
        ),
      ),
    );
  }

  Widget _buildCallbackCard(AppTheme ffTheme) {
    const valueProps = [
      ('חינם', Icons.payments_outlined),
      ('ללא התחייבות', Icons.thumb_up_outlined),
      ('ליווי מלא', Icons.support_agent_outlined),
    ];
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        gradient: LinearGradient(colors: [ffTheme.primary, ffTheme.tertiary], begin: Alignment.topRight, end: Alignment.bottomLeft),
        borderRadius: BorderRadius.circular(16),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              ExcludeSemantics(
                child: Container(
                  width: 52,
                  height: 52,
                  decoration: BoxDecoration(color: ffTheme.secondary, shape: BoxShape.circle),
                  child: Icon(Icons.headset_mic_rounded, size: 26, color: ffTheme.primary),
                ),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('נציג אנושי יחזור אליכם',
                        style: GoogleFonts.rubik(fontSize: 16, fontWeight: FontWeight.w700, color: Colors.white)),
                    const SizedBox(height: 4),
                    Text('משאירים פרטים, ומומחה מטעמנו מתקשר בזמן שנוח לכם',
                        style: GoogleFonts.assistant(fontSize: 12, color: Colors.white70)),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),
          Row(
            children: [
              for (final (label, icon) in valueProps) ...[
                Expanded(
                  child: Container(
                    padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 6),
                    decoration: BoxDecoration(
                      color: Colors.white.withValues(alpha: 0.12),
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: Column(
                      children: [
                        Icon(icon, size: 18, color: ffTheme.secondary),
                        const SizedBox(height: 4),
                        Text(label,
                            textAlign: TextAlign.center,
                            style: GoogleFonts.assistant(fontSize: 11, fontWeight: FontWeight.w600, color: Colors.white)),
                      ],
                    ),
                  ),
                ),
                if (label != valueProps.last.$1) const SizedBox(width: 8),
              ],
            ],
          ),
        ],
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
              margin: EdgeInsetsDirectional.only(end: i < _timings.length - 1 ? 8 : 0),
              padding: const EdgeInsets.symmetric(vertical: 10),
              constraints: const BoxConstraints(minHeight: 44),
              decoration: BoxDecoration(
                color: active ? ffTheme.primary : Colors.white,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: active ? ffTheme.primary : ffTheme.alternate),
                boxShadow: active ? [BoxShadow(color: ffTheme.primary.withValues(alpha: 0.2), blurRadius: 8, offset: const Offset(0, 2))] : [],
              ),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
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
                  PositionedDirectional(
                    top: 4, end: 4,
                    child: ExcludeSemantics(child: Icon(Icons.auto_awesome, size: 16, color: ffTheme.primary)).animate(delay: 400.ms).fadeIn().slideY(begin: -0.5),
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
      prefixIcon: Icon(icon, color: ffTheme.secondaryText, size: 20),
      border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide(color: ffTheme.alternate)),
      enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide(color: ffTheme.alternate)),
      focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide(color: ffTheme.primary, width: 1.5)),
      errorBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide(color: ffTheme.error)),
      focusedErrorBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide(color: ffTheme.error, width: 1.5)),
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
    );
  }
}
