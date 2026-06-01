import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:google_fonts/google_fonts.dart';
import '../../flutter_flow/flutter_flow_theme.dart';
import '../../flutter_flow/flutter_flow_util.dart';
import '../../flutter_flow/flutter_flow_widgets.dart';
import '../../app_state.dart';

class ProfileWidget extends StatefulWidget {
  const ProfileWidget({super.key});

  @override
  State<ProfileWidget> createState() => _ProfileWidgetState();
}

class _ProfileWidgetState extends State<ProfileWidget> {
  bool _darkMode = false;
  String _lang = 'עברית';

  void _showEditProfile(BuildContext context, FFAppState appState, FlutterFlowTheme ffTheme) {
    final nameCtrl = TextEditingController(text: appState.userName);
    final phoneCtrl = TextEditingController(text: appState.userPhone);

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: ffTheme.background,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (ctx) => Padding(
        padding: EdgeInsets.fromLTRB(20, 16, 20, MediaQuery.of(ctx).viewInsets.bottom + 32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Center(
              child: Container(width: 40, height: 4, decoration: BoxDecoration(color: ffTheme.alternate, borderRadius: BorderRadius.circular(2))),
            ),
            const SizedBox(height: 16),
            Text('עריכת פרופיל', style: ffTheme.headlineSmall),
            const SizedBox(height: 20),
            Text('שם מלא', style: ffTheme.labelLarge),
            const SizedBox(height: 8),
            TextField(
              controller: nameCtrl,
              textDirection: TextDirection.rtl,
              decoration: InputDecoration(
                hintText: 'ישראל ישראלי',
                filled: true,
                fillColor: Colors.white,
                prefixIcon: Icon(Icons.person_outline_rounded, color: ffTheme.secondaryText),
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide.none),
                enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide(color: ffTheme.alternate)),
                focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide(color: ffTheme.primary, width: 1.5)),
              ),
            ),
            const SizedBox(height: 16),
            Text('מספר טלפון', style: ffTheme.labelLarge),
            const SizedBox(height: 8),
            TextField(
              controller: phoneCtrl,
              keyboardType: TextInputType.phone,
              textDirection: TextDirection.ltr,
              decoration: InputDecoration(
                hintText: '050-0000000',
                filled: true,
                fillColor: Colors.white,
                prefixIcon: Icon(Icons.phone_outlined, color: ffTheme.secondaryText),
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide.none),
                enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide(color: ffTheme.alternate)),
                focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide(color: ffTheme.primary, width: 1.5)),
              ),
            ),
            const SizedBox(height: 24),
            FFButtonWidget(
              text: 'שמור שינויים',
              onPressed: () async {
                final name = nameCtrl.text.trim();
                final phone = phoneCtrl.text.trim();
                if (name.isNotEmpty && phone.isNotEmpty) {
                  appState.login(name: name, phone: phone);
                }
                Navigator.pop(ctx);
              },
              options: FFButtonOptions(
                width: double.infinity,
                height: 52,
                color: ffTheme.primary,
                textStyle: ffTheme.titleSmall.override(color: Colors.white),
                borderRadius: BorderRadius.circular(14),
              ),
            ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final ffTheme = FlutterFlowTheme.of(context);
    final appState = Provider.of<FFAppState>(context);

    return Scaffold(
      backgroundColor: ffTheme.background,
      appBar: AppBar(
        title: const Text('פרופיל'),
        backgroundColor: Colors.transparent,
        elevation: 0,
        foregroundColor: ffTheme.primaryText,
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(20),
        child: Column(
          children: [
            // Avatar + info
            Column(
              children: [
                Stack(
                  children: [
                    GestureDetector(
                      onTap: appState.isLoggedIn ? () => _showEditProfile(context, appState, ffTheme) : null,
                      child: Container(
                        width: 88,
                        height: 88,
                        decoration: BoxDecoration(
                          color: ffTheme.primary,
                          shape: BoxShape.circle,
                          boxShadow: [BoxShadow(color: ffTheme.primary.withOpacity(0.3), blurRadius: 20, offset: const Offset(0, 8))],
                        ),
                        child: Center(
                          child: Text(
                            appState.isLoggedIn && appState.firstName.isNotEmpty ? appState.firstName[0] : '👤',
                            style: GoogleFonts.rubik(fontSize: 38, fontWeight: FontWeight.w700, color: Colors.white),
                          ),
                        ),
                      ),
                    ),
                    if (appState.isLoggedIn)
                      Positioned(
                        bottom: 0,
                        left: 0,
                        child: Container(
                          width: 26,
                          height: 26,
                          decoration: BoxDecoration(
                            color: ffTheme.secondary,
                            shape: BoxShape.circle,
                            border: Border.all(color: ffTheme.background, width: 2),
                          ),
                          child: Icon(Icons.camera_alt_rounded, size: 13, color: ffTheme.primary),
                        ),
                      ),
                  ],
                ).animate().scale(duration: 500.ms, curve: Curves.elasticOut),
                const SizedBox(height: 14),
                Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Text(appState.isLoggedIn ? appState.userName : 'אורח', style: ffTheme.headlineSmall),
                    if (appState.isLoggedIn) ...[
                      const SizedBox(width: 6),
                      GestureDetector(
                        onTap: () => _showEditProfile(context, appState, ffTheme),
                        child: Container(
                          padding: const EdgeInsets.all(4),
                          decoration: BoxDecoration(color: ffTheme.accent1, shape: BoxShape.circle),
                          child: Icon(Icons.edit_rounded, size: 14, color: ffTheme.primary),
                        ),
                      ),
                    ],
                  ],
                ),
                Text(appState.isLoggedIn ? appState.userPhone : 'לא מחובר', style: ffTheme.bodyMedium.override(color: ffTheme.secondaryText)),
                const SizedBox(height: 16),
                // Stats
                Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    _Stat(value: '₪${appState.totalSavings}', label: 'חיסכון', ffTheme: ffTheme),
                    Container(width: 1, height: 40, color: ffTheme.alternate, margin: const EdgeInsets.symmetric(horizontal: 24)),
                    _Stat(value: appState.leadPlanId != null ? '1' : '0', label: 'מעברים', ffTheme: ffTheme),
                    Container(width: 1, height: 40, color: ffTheme.alternate, margin: const EdgeInsets.symmetric(horizontal: 24)),
                    _Stat(value: '${appState.watchedPlans.length}', label: 'במעקב', ffTheme: ffTheme),
                  ],
                ),
              ],
            ).animate().fadeIn(duration: 400.ms),

            const SizedBox(height: 28),

            // Quiz summary or CTA
            if (appState.quizCompleted) ...[
              _SectionHeader(title: 'העדפות השאלון', ffTheme: ffTheme),
              Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(14),
                  border: Border.all(color: ffTheme.alternate),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Wrap(
                      spacing: 8,
                      runSpacing: 6,
                      children: [
                        _QuizChip(text: _catLabel(appState.selectedCat), ffTheme: ffTheme),
                        _QuizChip(text: 'תקציב ₪${appState.quizBudget}', ffTheme: ffTheme),
                        _QuizChip(text: _priorityLabel(appState.quizPriority), ffTheme: ffTheme),
                      ],
                    ),
                    const SizedBox(height: 12),
                    GestureDetector(
                      onTap: () => context.pushNamed('Quiz'),
                      child: Row(
                        mainAxisAlignment: MainAxisAlignment.end,
                        children: [
                          Text('עדכן שאלון', style: ffTheme.labelSmall.override(color: ffTheme.primary, fontWeight: FontWeight.w700)),
                          const SizedBox(width: 4),
                          Icon(Icons.refresh_rounded, size: 14, color: ffTheme.primary),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 20),
            ] else ...[
              _SectionHeader(title: 'שאלון חיסכון', ffTheme: ffTheme),
              GestureDetector(
                onTap: () => context.pushNamed('Quiz'),
                child: Container(
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(
                    gradient: LinearGradient(colors: [ffTheme.primary, ffTheme.tertiary]),
                    borderRadius: BorderRadius.circular(14),
                  ),
                  child: Row(
                    children: [
                      const Text('🎯', style: TextStyle(fontSize: 24)),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text('גלה כמה תחסוך', style: ffTheme.titleSmall.override(color: Colors.white)),
                            Text('ענה על 4 שאלות קצרות', style: ffTheme.bodySmall.override(color: Colors.white70)),
                          ],
                        ),
                      ),
                      Icon(Icons.arrow_back_ios_rounded, color: Colors.white70, size: 16),
                    ],
                  ),
                ),
              ).animate().fadeIn(delay: 200.ms),
              const SizedBox(height: 20),
            ],

            // Notifications section
            _SectionHeader(title: 'התראות', ffTheme: ffTheme),
            _ToggleTile(
              icon: Icons.trending_down_rounded,
              title: 'ירידות מחיר',
              subtitle: 'עדכן אותי כשמחירים יורדים',
              value: appState.prefPriceAlerts,
              onChanged: appState.setPrefPriceAlerts,
              ffTheme: ffTheme,
            ),
            _ToggleTile(
              icon: Icons.swap_horiz_rounded,
              title: 'עדכוני בקשות',
              subtitle: 'התקדמות בתהליך המעבר',
              value: appState.prefRequestUpdates,
              onChanged: appState.setPrefRequestUpdates,
              ffTheme: ffTheme,
            ),
            _ToggleTile(
              icon: Icons.people_rounded,
              title: 'קהילה',
              subtitle: 'תגובות ולייקים',
              value: appState.prefCommunityNotifs,
              onChanged: appState.setPrefCommunityNotifs,
              ffTheme: ffTheme,
            ),

            const SizedBox(height: 20),

            // Language
            _SectionHeader(title: 'שפה', ffTheme: ffTheme),
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(14),
                border: Border.all(color: ffTheme.alternate),
              ),
              child: Row(
                children: ['עברית', 'English', 'العربية'].map((lang) {
                  final active = _lang == lang;
                  return Expanded(
                    child: GestureDetector(
                      onTap: () => setState(() => _lang = lang),
                      child: AnimatedContainer(
                        duration: const Duration(milliseconds: 200),
                        margin: const EdgeInsets.symmetric(horizontal: 3),
                        padding: const EdgeInsets.symmetric(vertical: 8),
                        decoration: BoxDecoration(
                          color: active ? ffTheme.primary : Colors.transparent,
                          borderRadius: BorderRadius.circular(10),
                        ),
                        child: Center(
                          child: Text(lang, style: ffTheme.labelSmall.override(color: active ? Colors.white : ffTheme.secondaryText)),
                        ),
                      ),
                    ),
                  );
                }).toList(),
              ),
            ),

            const SizedBox(height: 20),

            // Appearance
            _SectionHeader(title: 'מראה', ffTheme: ffTheme),
            _ToggleTile(
              icon: Icons.dark_mode_rounded,
              title: 'מצב כהה',
              subtitle: 'ממשק בגוונים כהים',
              value: _darkMode,
              onChanged: (v) => setState(() => _darkMode = v),
              ffTheme: ffTheme,
            ),

            const SizedBox(height: 28),

            // Logout
            OutlinedButton.icon(
              onPressed: () {
                appState.logout();
                context.goNamed('Onboarding');
              },
              icon: Icon(Icons.logout_rounded, color: ffTheme.error),
              label: Text('התנתקות', style: ffTheme.titleSmall.override(color: ffTheme.error)),
              style: OutlinedButton.styleFrom(
                side: BorderSide(color: ffTheme.error),
                minimumSize: const Size(double.infinity, 52),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
              ),
            ).animate().fadeIn(delay: 400.ms),

            const SizedBox(height: 24),
          ],
        ),
      ),
    );
  }
}

String _catLabel(String cat) => const {
  'cellular': '📱 סלולר', 'internet': '🌐 אינטרנט',
  'tv': '📺 טלוויזיה', 'triple': '🏠 משולב', 'abroad': '✈️ חו"ל',
}[cat] ?? cat;

String _priorityLabel(String p) => const {
  'price': '💰 מחיר',
  'speed': '⚡ מהירות',
  'speed_basic': '🏃 עד 200Mb',
  'speed_fast': '⚡ 500Mb+',
  'speed_ultra': '🚀 גיגה',
  'abroad': '✈️ חו"ל',
  'nocommit': '🔓 ללא התחייבות',
  'esim': '📲 eSIM',
  'data': '📶 הרבה גלישה',
  'channels': '📡 ערוצים',
  'sport': '⚽ ספורט',
  'streaming': '🎬 סטרימינג',
  'netflix': '🎬 Netflix',
  'reliability': '🛡️ אמינות',
}[p] ?? p;

class _QuizChip extends StatelessWidget {
  const _QuizChip({required this.text, required this.ffTheme});
  final String text;
  final FlutterFlowTheme ffTheme;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: ffTheme.accent1,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: ffTheme.primary.withOpacity(0.2)),
      ),
      child: Text(text, style: ffTheme.labelSmall.override(color: ffTheme.primary, fontWeight: FontWeight.w600)),
    );
  }
}

class _Stat extends StatelessWidget {
  const _Stat({required this.value, required this.label, required this.ffTheme});
  final String value;
  final String label;
  final FlutterFlowTheme ffTheme;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Text(value, style: ffTheme.titleLarge.override(color: ffTheme.primary)),
        Text(label, style: ffTheme.labelSmall),
      ],
    );
  }
}

class _SectionHeader extends StatelessWidget {
  const _SectionHeader({required this.title, required this.ffTheme});
  final String title;
  final FlutterFlowTheme ffTheme;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Align(alignment: Alignment.centerRight, child: Text(title, style: ffTheme.titleMedium)),
    );
  }
}

class _ToggleTile extends StatelessWidget {
  const _ToggleTile({required this.icon, required this.title, required this.subtitle, required this.value, required this.onChanged, required this.ffTheme});
  final IconData icon;
  final String title;
  final String subtitle;
  final bool value;
  final ValueChanged<bool> onChanged;
  final FlutterFlowTheme ffTheme;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: ffTheme.alternate),
      ),
      child: Row(
        children: [
          Icon(icon, color: ffTheme.primary, size: 22),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title, style: ffTheme.titleSmall),
                Text(subtitle, style: ffTheme.bodySmall),
              ],
            ),
          ),
          Switch(
            value: value,
            onChanged: onChanged,
            activeColor: ffTheme.primary,
          ),
        ],
      ),
    );
  }
}
