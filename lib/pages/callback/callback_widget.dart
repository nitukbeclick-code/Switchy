import 'package:flutter/material.dart';
import 'package:flutter/services.dart' show HapticFeedback;
import 'package:flutter_animate/flutter_animate.dart';
import 'package:provider/provider.dart';
import '../../theme/app_theme.dart';
import '../../core/nav.dart';
import '../../widgets/app_button.dart';
import '../../widgets/app_snackbar.dart';
import '../../widgets/pressable.dart';
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

  static const _timings = ['בהקדם', 'בוקר', 'אחה"צ', 'ערב'];
  static const _topics = ['סלולר', 'אינטרנט', 'טלוויזיה', 'חבילה משולבת', 'ניתוק', 'אחר'];

  // Whether the topic was pre-filled from the user's context — lets us show a
  // gentle "based on your details" hint and keep the chip row collapsed by
  // default so the form reads as fewer choices.
  bool _topicPrefilled = false;
  bool _showAllTopics = false;

  static const _catToTopic = {
    'cellular': 'סלולר',
    'internet': 'אינטרנט',
    'tv': 'טלוויזיה',
    'triple': 'חבילה משולבת',
  };

  @override
  void initState() {
    super.initState();
    final appState = AppState();
    if (appState.userName.isNotEmpty) _nameCtrl.text = appState.userName;
    if (appState.userPhone.isNotEmpty) _phoneCtrl.text = appState.userPhone;
    // Pre-select the topic from the category the user is already focused on, so
    // the common case is one fewer decision.
    final preset = _catToTopic[appState.selectedCat];
    if (preset != null) {
      _topic = preset;
      _topicPrefilled = true;
    }
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

            // Topic selector — pre-filled from context when possible, so the
            // common path is just "name + phone".
            Row(
              children: [
                Text('בנושא מה תרצו לדבר?', style: ffTheme.labelLarge.copyWith(fontWeight: FontWeight.w600)),
                if (_topicPrefilled && !_showAllTopics) ...[
                  const SizedBox(width: 8),
                  Flexible(
                    child: Text('· מולא לפי הבחירה שלכם',
                        style: ffTheme.labelSmall.copyWith(color: ffTheme.brandAccentText),
                        overflow: TextOverflow.ellipsis),
                  ),
                ],
              ],
            ),
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
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
              decoration: ffTheme.cardDecoration(radius: ffTheme.radiusMd),
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
                  // "We're open" dot — flat green, no decorative glow.
                  Container(
                    width: 8, height: 8,
                    decoration: BoxDecoration(
                      color: ffTheme.brandAccent,
                      shape: BoxShape.circle,
                    ),
                  ),
                ],
              ),
            ).animate().fadeIn(delay: 180.ms),

            const SizedBox(height: 24),

            AppButton(
              // AppButton owns the async spinner + tap-ignore while [onPressed]
              // awaits, so we keep one honest label instead of a faked "שולח...".
              text: 'בקש שיחה חוזרת',
              onPressed: () async {
                if (_nameCtrl.text.trim().isEmpty || _phoneCtrl.text.trim().isEmpty) {
                  AppSnackBar.error(context, 'נא למלא שם ומספר טלפון',
                      duration: const Duration(seconds: 2));
                  return;
                }
                // Shared IL-phone validator (accepts +972/972/national forms) so
                // the callback + lead forms agree on what's valid.
                if (!AppState.isValidIlPhone(_phoneCtrl.text)) {
                  AppSnackBar.error(context, 'מספר טלפון אינו תקין',
                      duration: const Duration(seconds: 2));
                  return;
                }
                final name = _nameCtrl.text.trim();
                final phone = AppState.normalizeIlPhone(_phoneCtrl.text);
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
                  AppSnackBar.error(context, 'שליחת הבקשה נכשלה — בדקו את החיבור ונסו שוב');
                  return;
                }
                appBackend.upsertProfile(name: name, phone: phone).catchError((_) {});
                if (!context.mounted) return;
                Provider.of<AppState>(context, listen: false).login(name: name, phone: phone);
                await Future.delayed(const Duration(milliseconds: 300));
                if (!mounted) return;
                setState(() => _submitted = true);
              },
              width: double.infinity,
              height: 56,
              color: AppColors.primary,
              // No pinned label colour — AppButton is contrast-aware in both
              // themes. Hero-CTA corner reads from the sheet radius token.
              textStyle: ffTheme.titleSmall,
              borderRadius: BorderRadius.circular(ffTheme.radiusSheet),
            ).animate().fadeIn(delay: 220.ms),

            const SizedBox(height: 12),

            Center(
              child: Column(
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      ExcludeSemantics(
                        child: Icon(Icons.lock_outline_rounded, size: 13, color: ffTheme.secondaryText),
                      ),
                      const SizedBox(width: 4),
                      Flexible(
                        child: Text('הפרטים שלכם מאובטחים ולא מועברים לאף אחד מלבדנו',
                            style: ffTheme.labelSmall.copyWith(color: ffTheme.secondaryText),
                            textAlign: TextAlign.center),
                      ),
                    ],
                  ),
                  const SizedBox(height: 4),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      ExcludeSemantics(
                        child: Icon(Icons.do_not_disturb_on_outlined, size: 13, color: ffTheme.secondaryText),
                      ),
                      const SizedBox(width: 4),
                      Text('שיחה אחת בלבד — ללא דיוור או ספאם',
                          style: ffTheme.labelSmall.copyWith(color: ffTheme.secondaryText)),
                    ],
                  ),
                ],
              ),
            ),

            const SizedBox(height: 14),

            // Cross-link: prefer a face-to-face quote? Book a Zoom meeting.
            Center(
              child: Material(
                color: Colors.transparent,
                child: Semantics(
                  button: true,
                  child: InkWell(
                    borderRadius: BorderRadius.circular(ffTheme.radiusLg),
                    onTap: () => context.pushNamed('Meeting', queryParameters: {'source': 'callback'}),
                    // ≥48px tap target for the quiet cross-link.
                    child: ConstrainedBox(
                      constraints: const BoxConstraints(minHeight: 48),
                      child: Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            ExcludeSemantics(
                              child: Icon(Icons.videocam_rounded, size: 16, color: ffTheme.brandAccent),
                            ),
                            const SizedBox(width: 6),
                            Flexible(
                              child: Text(
                                'מעדיפים פגישת וידאו? קבעו שיחת Zoom עם נציג',
                                style: ffTheme.labelMedium.copyWith(
                                    color: ffTheme.brandAccentText, fontWeight: FontWeight.w700),
                              ),
                            ),
                          ],
                        ),
                      ),
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
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        // Fixed ink hero (premium dark card) — the shared restrained hero ink
        // wash token (dark in BOTH themes, so the white-on-ink contrast holds).
        // Flat: resting content carries no lift, structure comes from the fill.
        gradient: ffTheme.brandGradient,
        borderRadius: BorderRadius.circular(ffTheme.radiusCard),
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
                  decoration: const BoxDecoration(color: AppColors.secondary, shape: BoxShape.circle),
                  child: const Icon(Icons.headset_mic_rounded, size: 26, color: AppColors.primary),
                ),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // Scale tokens (white recolour is safe here — the hero is a
                    // PINNED ink surface in both themes, see decoration above).
                    Text('נציג אנושי יחזור אליכם',
                        style: ffTheme.headlineSmall.copyWith(color: Colors.white, fontWeight: FontWeight.w700)),
                    const SizedBox(height: 4),
                    Text('משאירים פרטים, ומומחה מטעמנו מתקשר בזמן שנוח לכם',
                        style: ffTheme.labelMedium.copyWith(color: Colors.white.withValues(alpha: 0.7))),
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
                    padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 6),
                    decoration: BoxDecoration(
                      color: Colors.white.withValues(alpha: 0.12),
                      borderRadius: BorderRadius.circular(ffTheme.radiusSm),
                      border: Border.all(color: Colors.white.withValues(alpha: 0.08)),
                    ),
                    child: Column(
                      children: [
                        ExcludeSemantics(child: Icon(icon, size: 18, color: AppColors.secondary)),
                        const SizedBox(height: 4),
                        Text(label,
                            textAlign: TextAlign.center,
                            style: ffTheme.labelSmall.copyWith(color: Colors.white)),
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
    Widget chip(String t) {
      final active = _topic == t;
      // Pressable adds the tactile scale-0.97 press feedback (Emil: every
      // occasional control gets a press tell) without any semantics of its own,
      // so it nests safely inside the labelled Semantics. The AnimatedContainer
      // keeps the crisp selected-state color/border morph (dropdown band, 200ms).
      return Semantics(
        button: true,
        selected: active,
        child: Pressable(
          onTap: () {
            HapticFeedback.selectionClick();
            setState(() => _topic = t);
          },
          haptic: false,
          // ONE chip language — neutral: surface + hairline + ink; ACTIVE: the
          // pale-green tint + green text + green 1px border (no solid-green
          // chips — solid green is the primary CTA's alone).
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 200),
            curve: ffTheme.easeOut,
            constraints: const BoxConstraints(minHeight: 48),
            alignment: Alignment.center,
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
            decoration: BoxDecoration(
              color: active ? ffTheme.brandAccentTint : ffTheme.cardSurface,
              borderRadius: BorderRadius.circular(ffTheme.radiusPill),
              border: Border.all(color: active ? ffTheme.brandAccent : ffTheme.lineColor),
            ),
            child: Text(t, style: ffTheme.labelMedium.copyWith(
              color: active ? ffTheme.brandAccentText : ffTheme.primaryText,
              fontWeight: active ? FontWeight.w700 : FontWeight.w500,
            )),
          ),
        ),
      );
    }

    // Collapsed: when the topic is pre-filled, show only the chosen chip + a
    // "change topic" affordance so the screen reads as fewer fields.
    if (_topicPrefilled && !_showAllTopics) {
      return Wrap(
        spacing: 8,
        runSpacing: 8,
        crossAxisAlignment: WrapCrossAlignment.center,
        children: [
          chip(_topic),
          Semantics(
            button: true,
            child: Pressable(
              onTap: () => setState(() => _showAllTopics = true),
              // ≥48px comfortable tap target for the small text affordance.
              child: ConstrainedBox(
                constraints: const BoxConstraints(minHeight: 48),
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 8),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      ExcludeSemantics(
                        child: Icon(Icons.edit_outlined, size: 14, color: ffTheme.brandAccent),
                      ),
                      const SizedBox(width: 4),
                      Text('שנו נושא', style: ffTheme.labelMedium.copyWith(color: ffTheme.brandAccentText, fontWeight: FontWeight.w700)),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ],
      ).animate().fadeIn(delay: 80.ms);
    }

    return Wrap(
      spacing: 8,
      runSpacing: 8,
      children: _topics.map(chip).toList(),
    ).animate().fadeIn(delay: 80.ms);
  }

  Widget _buildTimingChips(AppTheme ffTheme) {
    final icons = [Icons.flash_on_rounded, Icons.wb_sunny_outlined, Icons.wb_twilight_outlined, Icons.nights_stay_outlined];
    return Row(
      children: List.generate(_timings.length, (i) {
        final t = _timings[i];
        final active = _timing == t;
        return Expanded(
          child: Semantics(
            button: true,
            selected: active,
            container: true,
            excludeSemantics: true,
            label: 'זמן מועדף: $t',
            // Pressable supplies the scale-0.97 press tell; the parent Semantics
            // already excludes child semantics, so the labelled node is
            // untouched. The AnimatedContainer keeps the crisp selected morph.
            child: Pressable(
              onTap: () {
                HapticFeedback.selectionClick();
                setState(() => _timing = t);
              },
              haptic: false,
              // Same ONE chip language as the topic chips above: ACTIVE = tint
              // bg + green text/icon + green 1px border; neutral = surface +
              // hairline + ink. Solid green stays reserved for the CTA.
              child: AnimatedContainer(
                duration: const Duration(milliseconds: 200),
                curve: ffTheme.easeOut,
                constraints: const BoxConstraints(minHeight: 48),
                margin: EdgeInsetsDirectional.only(end: i < _timings.length - 1 ? 8 : 0),
                padding: const EdgeInsets.symmetric(vertical: 10),
                decoration: BoxDecoration(
                  color: active ? ffTheme.brandAccentTint : ffTheme.cardSurface,
                  borderRadius: BorderRadius.circular(ffTheme.radiusCard),
                  border: Border.all(color: active ? ffTheme.brandAccent : ffTheme.lineColor),
                ),
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    ExcludeSemantics(child: Icon(icons[i], size: 20, color: active ? ffTheme.brandAccentText : ffTheme.secondaryText)),
                    const SizedBox(height: 5),
                    Text(t,
                        textAlign: TextAlign.center,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: ffTheme.labelMedium.copyWith(
                          color: active ? ffTheme.brandAccentText : ffTheme.primaryText,
                          fontWeight: active ? FontWeight.w700 : FontWeight.w500,
                        )),
                  ],
                ),
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
                  // Halo ring from the NEUTRAL tint token (tinted surfaces only
                  // ever read accent1 / brandAccentTint) behind the green
                  // success medallion.
                  Container(
                    width: 120, height: 120,
                    decoration: BoxDecoration(color: ffTheme.accent1, shape: BoxShape.circle),
                  ).animate().scale(begin: const Offset(0.85, 0.85), end: const Offset(1, 1), duration: 400.ms, curve: Curves.easeOut),
                  Container(
                    width: 92, height: 92,
                    decoration: BoxDecoration(color: ffTheme.brandAccentTint, shape: BoxShape.circle),
                    child: ExcludeSemantics(
                      child: Icon(Icons.phone_in_talk_rounded, color: ffTheme.brandAccent, size: 46),
                    ),
                  ).animate().scale(duration: 450.ms, curve: ffTheme.spring),
                  PositionedDirectional(
                    top: 4, end: 4,
                    child: ExcludeSemantics(child: Icon(Icons.auto_awesome, size: 16, color: ffTheme.saving)).animate(delay: 400.ms).fadeIn().slideY(begin: -0.5),
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
                  color: ffTheme.brandAccentTint,
                  borderRadius: BorderRadius.circular(ffTheme.radiusMd),
                  // Flat resting surface — 1px border only, no shadow.
                  border: Border.all(color: ffTheme.brandAccent.withValues(alpha: 0.18)),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    ExcludeSemantics(
                      child: Icon(Icons.access_time_rounded, size: 16, color: ffTheme.brandAccent),
                    ),
                    const SizedBox(width: 8),
                    Text('ימי א׳–ה׳, 9:00–21:00', style: ffTheme.labelMedium.copyWith(color: ffTheme.brandAccentText, fontWeight: FontWeight.w600)),
                  ],
                ),
              ).animate().fadeIn(delay: 450.ms),
              const SizedBox(height: 32),
              // Primary onward CTA. The tracker only has content once the user
              // has tracked a plan — a callback request alone doesn't create
              // one. So when the tracker is empty, sending them there is a
              // dead-end; route them to browse plans instead.
              if (AppState().myPlans.isNotEmpty)
                AppButton(
                  text: 'מעקב אחר התהליך',
                  onPressed: () async => context.goNamed('Tracker'),
                  width: 240,
                  height: 52,
                  color: AppColors.primary,
                  // Contrast-aware label + token corner (no pinned white).
                  textStyle: ffTheme.titleSmall,
                  borderRadius: BorderRadius.circular(ffTheme.radiusCard),
                ).animate().fadeIn(delay: 500.ms)
              else
                AppButton(
                  text: 'בינתיים, עיינו במסלולים',
                  onPressed: () async => context.goNamed('Results'),
                  width: 260,
                  height: 52,
                  color: AppColors.primary,
                  textStyle: ffTheme.titleSmall,
                  borderRadius: BorderRadius.circular(ffTheme.radiusCard),
                ).animate().fadeIn(delay: 500.ms),
              const SizedBox(height: 12),
              TextButton(
                onPressed: () => context.goNamed('Home'),
                child: Text('חזרה לדף הבית',
                    style: ffTheme.bodyMedium.copyWith(color: ffTheme.secondaryText)),
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
      fillColor: ffTheme.cardSurface,
      prefixIcon: Icon(icon, color: ffTheme.secondaryText),
      // Token corners + a visible 1px input border in every state (the lead
      // form's input language, so the two funnel forms match).
      border: OutlineInputBorder(borderRadius: BorderRadius.circular(ffTheme.radiusCard), borderSide: BorderSide(color: ffTheme.alternate)),
      enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(ffTheme.radiusCard), borderSide: BorderSide(color: ffTheme.alternate)),
      focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(ffTheme.radiusCard), borderSide: BorderSide(color: ffTheme.brandAccent, width: 1.5)),
    );
  }
}
