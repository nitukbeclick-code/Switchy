import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:provider/provider.dart';
import '../../app_state.dart';
import '../../components/logo_widget/logo_widget.dart';
import '../../core/nav.dart';
import '../../data.dart';
import '../../services/backend/backend.dart';
import '../../services/backend/local_backend.dart';
import '../../services/meeting_slots.dart';
import '../../services/meeting_sync.dart';
import '../../theme/app_theme.dart';
import '../../widgets/app_button.dart';
import '../../widgets/app_snackbar.dart';
import '../../widgets/consent_panel.dart';
import 'meeting_status_card.dart';

/// "פגישת וידאו עם נציג" — books a 30-minute Zoom sales meeting, one day or
/// more in advance (Sun–Thu 9:00–21:00, Friday mornings). The request rides
/// the rep pipeline; once a rep confirms, the Zoom link arrives here via the
/// backend's realtime [Backend.meetingStream] (simulated under LocalBackend).
class MeetingWidget extends StatefulWidget {
  const MeetingWidget({super.key, this.provider, this.planId, this.source = 'form'});

  final String? provider;
  final String? planId;
  final String source;

  @override
  State<MeetingWidget> createState() => _MeetingWidgetState();
}

class _MeetingWidgetState extends State<MeetingWidget> {
  final _nameCtrl = TextEditingController();
  final _phoneCtrl = TextEditingController();
  final _emailCtrl = TextEditingController();
  final _formKey = GlobalKey<FormState>();

  String? _provider;
  DateTime? _pickedDate;
  String? _slot;

  bool _acceptTerms = false;
  bool _acceptPrivacy = false;
  bool _acceptMarketing = false;
  bool _submitting = false;
  bool _justBooked = false;

  /// The bookable dates are recomputed every build (cheap + pure) so the grid
  /// can't go stale across midnight; the picked date falls back to the first
  /// valid one when yesterday's choice is no longer bookable.
  DateTime _effectiveDate(List<DateTime> dates) {
    final d = _pickedDate;
    return (d != null && dates.contains(d)) ? d : dates.first;
  }

  @override
  void initState() {
    super.initState();
    _provider = widget.provider;
    final appState = AppState();
    if (appState.userName.isNotEmpty) _nameCtrl.text = appState.userName;
    if (appState.userPhone.isNotEmpty) _phoneCtrl.text = appState.userPhone;
    if (appState.userEmail.isNotEmpty) _emailCtrl.text = appState.userEmail;

    // Live status is owned by the app-scope MeetingSync (rep confirmations
    // must land even when this screen is closed); (re)starting it here is
    // idempotent and also hydrates the latest server row.
    MeetingSync.start();
  }

  @override
  void dispose() {
    _nameCtrl.dispose();
    _phoneCtrl.dispose();
    _emailCtrl.dispose();
    super.dispose();
  }

  /// A meeting that should occupy this screen: anything not terminal, or a
  /// confirmed meeting that hasn't ended yet.
  bool _hasOpenMeeting(AppState s) {
    final m = s.bookedMeeting;
    if (m == null) return false;
    final start = meetingLocalStart(m.meetingDate, m.slot);
    return switch (m.status) {
      MeetingStatus.pending => start.add(const Duration(minutes: 30)).isAfter(DateTime.now()),
      MeetingStatus.confirmed => start.add(const Duration(minutes: 30)).isAfter(DateTime.now()),
      MeetingStatus.noRep || MeetingStatus.expired => true, // actionable: pick a new slot
      MeetingStatus.cancelled || MeetingStatus.completed => false,
    };
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    if (_provider == null) {
      AppSnackBar.info(context, 'בחרו ספק לפגישה');
      return;
    }
    if (_slot == null) {
      AppSnackBar.info(context, 'בחרו שעה לפגישה');
      return;
    }
    if (!_acceptTerms || !_acceptPrivacy) {
      AppSnackBar.info(context, 'יש לאשר את תנאי השימוש ומדיניות הפרטיות כדי לשלוח');
      return;
    }
    HapticFeedback.lightImpact();
    setState(() => _submitting = true);

    final name = _nameCtrl.text.trim();
    final phone = _phoneCtrl.text.replaceAll(RegExp(r'[^\d+]'), '');
    final email = _emailCtrl.text.trim();
    final nowIso = DateTime.now().toUtc().toIso8601String();
    final dateIso = meetingDateIso(_effectiveDate(bookableMeetingDates()));

    try {
      await appBackend
          .requestMeeting(MeetingInput(
            name: name,
            phone: phone,
            email: email.isNotEmpty ? email : null,
            provider: _provider,
            planId: widget.planId,
            meetingDate: dateIso,
            slot: _slot!,
            source: widget.source,
            termsAcceptedAt: nowIso,
            privacyAcceptedAt: nowIso,
            marketingAcceptedAt: _acceptMarketing ? nowIso : null,
          ))
          .timeout(const Duration(seconds: 10));
    } catch (e) {
      // The request never reached the team — keep the form so the user can
      // retry. The guard trigger's rejections get specific, honest copy.
      if (!mounted) return;
      setState(() => _submitting = false);
      final msg = e.toString();
      if (msg.contains('meeting already pending')) {
        // There IS an open booking server-side (e.g. cleared local state) —
        // adopt it and show its status instead of a dead-end error.
        AppSnackBar.info(context, 'כבר קיימת לכם פגישה פתוחה — מציגים אותה');
        await MeetingSync.refresh();
        if (mounted) setState(() => _justBooked = false);
      } else if (msg.contains('rate limit')) {
        AppSnackBar.error(context, 'נשלחו יותר מדי בקשות — נסו שוב מאוחר יותר');
      } else if (msg.contains('invalid slot') ||
          msg.contains('at least one day') ||
          msg.contains('Saturday') ||
          msg.contains('too far ahead')) {
        AppSnackBar.error(context, 'המועד שנבחר אינו זמין עוד — בחרו מועד אחר');
      } else {
        AppSnackBar.error(context, 'שליחת הבקשה נכשלה — בדקו את החיבור ונסו שוב');
      }
      return;
    }
    if (!mounted) return;

    appBackend.upsertProfile(name: name, phone: phone, email: email.isNotEmpty ? email : null).catchError((_) {});
    // Mirror locally only after the backend accepted the request. Prefer the
    // server's row (real id); fall back to a provisional one — a failure on
    // this SECOND call must never lose the accepted booking or wedge the form.
    BookedMeeting? serverRow;
    try {
      serverRow = await appBackend.fetchLatestMeeting();
    } catch (_) {/* provisional fallback below */}
    AppState().setBookedMeeting(serverRow ??
        BookedMeeting(
          id: 'local_$nowIso',
          status: MeetingStatus.pending,
          provider: _provider,
          meetingDate: dateIso,
          slot: _slot!,
          startsAt: meetingLocalStart(dateIso, _slot!).toUtc(),
          createdAt: DateTime.now(),
        ));
    HapticFeedback.mediumImpact();
    if (!mounted) return;
    setState(() {
      _submitting = false;
      _justBooked = true;
    });
  }

  @override
  Widget build(BuildContext context) {
    final t = AppTheme.of(context);
    final appState = Provider.of<AppState>(context);
    final showStatus = _hasOpenMeeting(appState);

    return Scaffold(
      backgroundColor: t.background,
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        foregroundColor: t.primaryText,
        leading: IconButton(
          icon: const Icon(Icons.arrow_forward_rounded),
          tooltip: 'חזרה',
          onPressed: () => context.safePop(),
        ),
        title: Text('פגישת וידאו עם נציג', style: t.titleMedium),
        centerTitle: true,
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(20),
        child: showStatus ? _buildStatusView(t, appState) : _buildWizard(t),
      ),
    );
  }

  // ── Status view — an open meeting owns the screen ──────────────────────────

  Widget _buildStatusView(AppTheme t, AppState appState) {
    final m = appState.bookedMeeting!;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (_justBooked) ...[
          _SuccessHeader(t: t).animate().fadeIn(duration: 350.ms),
          const SizedBox(height: 16),
        ],
        if (appBackend is LocalBackend) ...[
          _DemoBanner(t: t),
          const SizedBox(height: 12),
        ],
        MeetingStatusCard(
          meeting: m,
          onPickNewSlot: () {
            appState.clearBookedMeeting();
            setState(() => _justBooked = false);
          },
        ).animate().fadeIn(duration: 300.ms).slideY(begin: 0.04, end: 0),
        const SizedBox(height: 16),
        _NextSteps(t: t, status: m.status),
        const SizedBox(height: 20),
        Center(
          child: TextButton(
            onPressed: () => context.goNamed('Home'),
            child: Text('חזרה לדף הבית',
                style: t.labelMedium.copyWith(color: t.brandAccent, fontWeight: FontWeight.w700)),
          ),
        ),
      ],
    );
  }

  // ── Booking wizard ──────────────────────────────────────────────────────────

  Widget _buildWizard(AppTheme t) {
    return Form(
      key: _formKey,
      // Validate each field when the user LEAVES it (not only on submit,
      // and not on every keystroke) — the error shows next to the field.
      autovalidateMode: AutovalidateMode.onUnfocus,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _buildHero(t).animate().fadeIn(duration: 350.ms),
          const SizedBox(height: 20),
          if (appBackend is LocalBackend) ...[
            _DemoBanner(t: t),
            const SizedBox(height: 16),
          ],

          _SectionLabel(t: t, step: 1, label: 'לאיזה ספק תרצו הצעת מחיר?'),
          const SizedBox(height: 10),
          _buildProviderChips(t).animate(delay: 60.ms).fadeIn().slideY(begin: 0.04),

          const SizedBox(height: 22),
          _SectionLabel(t: t, step: 2, label: 'באיזה יום נוח לכם?'),
          const SizedBox(height: 4),
          Text('ניתן לקבוע פגישה החל ממחר, בימים א׳–ה׳ ובשישי בבוקר.', style: t.bodySmall),
          const SizedBox(height: 10),
          _buildDateChips(t).animate(delay: 100.ms).fadeIn().slideY(begin: 0.04),

          const SizedBox(height: 22),
          _SectionLabel(t: t, step: 3, label: 'באיזו שעה?'),
          const SizedBox(height: 4),
          Text(
            _effectiveDate(bookableMeetingDates()).weekday == DateTime.friday
                ? 'בימי שישי הפגישות מתקיימות בין 9:00 ל-13:00.'
                : 'הפגישות נמשכות כ-30 דקות, בין 9:00 ל-21:00.',
            style: t.bodySmall,
          ),
          const SizedBox(height: 10),
          _buildSlotChips(t).animate(delay: 140.ms).fadeIn().slideY(begin: 0.04),

          const SizedBox(height: 22),
          _SectionLabel(t: t, step: 4, label: 'פרטים לאישור הפגישה'),
          const SizedBox(height: 12),
          TextFormField(
            controller: _nameCtrl,
            textDirection: TextDirection.rtl,
            decoration: _inputDecoration(t, hint: 'שם מלא', icon: Icons.person_outline_rounded),
            // Mirrors the server guard's bounds (2..80) so a rejection can't
            // masquerade as a connection error.
            validator: (v) {
              final s = (v ?? '').trim();
              if (s.length < 2) return 'שדה חובה';
              if (s.length > 80) return 'שם ארוך מדי';
              return null;
            },
          ),
          const SizedBox(height: 12),
          TextFormField(
            controller: _phoneCtrl,
            keyboardType: TextInputType.phone,
            textDirection: TextDirection.ltr,
            decoration: _inputDecoration(t, hint: 'מספר טלפון', icon: Icons.phone_outlined),
            validator: (v) {
              final digits = (v ?? '').replaceAll(RegExp(r'\D'), '');
              return (digits.length < 9 || digits.length > 15) ? 'מספר טלפון לא תקין' : null;
            },
          ),
          const SizedBox(height: 12),
          TextFormField(
            controller: _emailCtrl,
            keyboardType: TextInputType.emailAddress,
            textDirection: TextDirection.ltr,
            decoration: _inputDecoration(t, hint: 'אימייל (אופציונלי)', icon: Icons.mail_outline_rounded),
          ),
          const SizedBox(height: 4),
          Text('קישור ההצטרפות יישלח גם לכתובת זו.', style: t.labelSmall),

          const SizedBox(height: 18),
          ConsentPanel(
            acceptTerms: _acceptTerms,
            acceptPrivacy: _acceptPrivacy,
            acceptMarketing: _acceptMarketing,
            onTermsChanged: (v) => setState(() => _acceptTerms = v),
            onPrivacyChanged: (v) => setState(() => _acceptPrivacy = v),
            onMarketingChanged: (v) => setState(() => _acceptMarketing = v),
          ),
          const SizedBox(height: 16),

          AppButton(
            text: _submitting ? 'שולח...' : 'בקשו פגישת וידאו',
            onPressed: _submitting ? () async {} : () async => _submit(),
            width: double.infinity,
            height: 56,
            color: _submitting ? t.alternate : t.primary,
            textStyle: t.titleMedium.copyWith(color: Colors.white),
            borderRadius: BorderRadius.circular(18),
          ).animate(delay: 180.ms).fadeIn(),
          const SizedBox(height: 8),
          Center(
            child: Text('ללא עלות • ללא התחייבות • 30 דקות',
                style: t.labelSmall.copyWith(color: t.secondaryText)),
          ),
          const SizedBox(height: 24),
        ],
      ),
    );
  }

  Widget _buildHero(AppTheme t) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        gradient: t.brandGradient,
        borderRadius: BorderRadius.circular(t.radiusLg),
        boxShadow: t.shadowPrimary,
      ),
      child: Row(
        children: [
          // The official Zoom mark (brand assets shown as-is, like the
          // carrier logos) — the meeting really happens on Zoom.
          Container(
            width: 48,
            height: 48,
            padding: const EdgeInsets.all(7),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(14),
            ),
            child: ExcludeSemantics(
              child: Image.asset('assets/images/zoom.png', fit: BoxFit.contain),
            ),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('פגישת Zoom אישית עם מומחה',
                    style: t.titleSmall.copyWith(color: Colors.white, fontWeight: FontWeight.w800)),
                const SizedBox(height: 4),
                Text(
                  'נציג מכירות יציג לכם הצעת מחיר מותאמת בשיחת וידאו של 30 דקות — ללא עלות וללא התחייבות.',
                  style: GoogleFonts.assistant(
                      fontSize: 12.5, color: Colors.white.withValues(alpha: 0.85), height: 1.35),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildProviderChips(AppTheme t) {
    return Wrap(
      spacing: 8,
      runSpacing: 8,
      children: allProviders.map((p) {
        final active = _provider == p;
        return Semantics(
          button: true,
          selected: active,
          label: 'ספק $p',
          child: Material(
            color: active ? t.brandAccent : Colors.white,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(t.radiusPill),
              side: BorderSide(color: active ? t.brandAccent : t.alternate),
            ),
            child: InkWell(
              borderRadius: BorderRadius.circular(t.radiusPill),
              onTap: () {
                HapticFeedback.selectionClick();
                setState(() => _provider = p);
              },
              child: Padding(
                padding: const EdgeInsetsDirectional.fromSTEB(6, 5, 12, 5),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    ExcludeSemantics(child: LogoWidget(provider: p, size: 26)),
                    const SizedBox(width: 7),
                    Text(p,
                        style: t.labelMedium.copyWith(
                          color: active ? Colors.white : t.primaryText,
                          fontWeight: active ? FontWeight.w700 : FontWeight.w500,
                        )),
                  ],
                ),
              ),
            ),
          ),
        );
      }).toList(),
    );
  }

  Widget _buildDateChips(AppTheme t) {
    final dates = bookableMeetingDates();
    final selected = _effectiveDate(dates);
    return SizedBox(
      height: 64,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        itemCount: dates.length,
        separatorBuilder: (_, __) => const SizedBox(width: 8),
        itemBuilder: (context, i) {
          final d = dates[i];
          final active = d == selected;
          final label = formatMeetingDateHe(d);
          return Semantics(
            button: true,
            selected: active,
            label: label,
            child: Material(
              color: active ? t.brandAccent : Colors.white,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(t.radiusMd),
                side: BorderSide(color: active ? t.brandAccent : t.alternate),
              ),
              child: InkWell(
                borderRadius: BorderRadius.circular(t.radiusMd),
                onTap: () {
                  HapticFeedback.selectionClick();
                  setState(() {
                    _pickedDate = d;
                    // A slot from Sun–Thu may not exist on Friday — revalidate.
                    if (_slot != null && !meetingSlotsFor(d).contains(_slot)) _slot = null;
                  });
                },
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Text('יום ${label.split(' ')[1]}',
                          style: t.labelMedium.copyWith(
                            color: active ? Colors.white : t.primaryText,
                            fontWeight: FontWeight.w700,
                          )),
                      const SizedBox(height: 2),
                      Text('${d.day}.${d.month}',
                          style: t.labelSmall.copyWith(
                            color: active ? Colors.white.withValues(alpha: 0.85) : t.secondaryText,
                            fontFeatures: const [FontFeature.tabularFigures()],
                          )),
                    ],
                  ),
                ),
              ),
            ),
          );
        },
      ),
    );
  }

  Widget _buildSlotChips(AppTheme t) {
    final slots = meetingSlotsFor(_effectiveDate(bookableMeetingDates()));
    return Wrap(
      spacing: 8,
      runSpacing: 8,
      children: slots.map((s) {
        final active = _slot == s;
        return Semantics(
          button: true,
          selected: active,
          label: 'שעה $s',
          child: Material(
            color: active ? t.brandAccent : Colors.white,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(t.radiusSm),
              side: BorderSide(color: active ? t.brandAccent : t.alternate),
            ),
            child: InkWell(
              borderRadius: BorderRadius.circular(t.radiusSm),
              onTap: () {
                HapticFeedback.selectionClick();
                setState(() => _slot = s);
              },
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 9),
                child: Text(s,
                    style: t.labelMedium.copyWith(
                      color: active ? Colors.white : t.primaryText,
                      fontWeight: active ? FontWeight.w700 : FontWeight.w500,
                      fontFeatures: const [FontFeature.tabularFigures()],
                    )),
              ),
            ),
          ),
        );
      }).toList(),
    );
  }

  InputDecoration _inputDecoration(AppTheme t, {required String hint, required IconData icon}) {
    return InputDecoration(
      hintText: hint,
      prefixIcon: Icon(icon, color: t.secondaryText, size: 20),
      filled: true,
      fillColor: Colors.white,
      border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide(color: t.alternate)),
      enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide(color: t.alternate)),
      focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide(color: t.brandAccent, width: 1.5)),
      errorBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide(color: t.error)),
      focusedErrorBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide(color: t.error, width: 1.5)),
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
    );
  }
}

// ── Small private pieces ──────────────────────────────────────────────────────

class _SectionLabel extends StatelessWidget {
  const _SectionLabel({required this.t, required this.step, required this.label});
  final AppTheme t;
  final int step;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Container(
          width: 22,
          height: 22,
          decoration: BoxDecoration(color: t.brandAccent, shape: BoxShape.circle),
          child: Center(
            child: Text('$step',
                style: GoogleFonts.rubik(fontSize: 12, fontWeight: FontWeight.w800, color: Colors.white)),
          ),
        ),
        const SizedBox(width: 8),
        Expanded(child: Text(label, style: t.titleSmall)),
      ],
    );
  }
}

class _DemoBanner extends StatelessWidget {
  const _DemoBanner({required this.t});
  final AppTheme t;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 9),
      decoration: BoxDecoration(
        color: t.saving.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: t.saving.withValues(alpha: 0.4)),
      ),
      child: Row(
        children: [
          const Icon(Icons.science_rounded, size: 15, color: Color(0xFFB45309)),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              'מצב הדגמה — האישור והקישור מדומים ואינם נשלחים לנציג.',
              style: t.labelSmall.copyWith(color: const Color(0xFFB45309), fontWeight: FontWeight.w600),
            ),
          ),
        ],
      ),
    );
  }
}

class _SuccessHeader extends StatelessWidget {
  const _SuccessHeader({required this.t});
  final AppTheme t;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Container(
          width: 64,
          height: 64,
          decoration: BoxDecoration(
            color: t.brandAccent,
            shape: BoxShape.circle,
            boxShadow: [BoxShadow(color: t.brandAccent.withValues(alpha: 0.4), blurRadius: 20, spreadRadius: 1)],
          ),
          child: const Icon(Icons.check_rounded, size: 34, color: Colors.white),
        ).animate().scale(
            begin: const Offset(0.6, 0.6),
            end: const Offset(1, 1),
            duration: 350.ms,
            curve: Curves.easeOutBack),
        const SizedBox(height: 12),
        Text('הבקשה התקבלה', style: t.headlineSmall, textAlign: TextAlign.center),
      ],
    );
  }
}

class _NextSteps extends StatelessWidget {
  const _NextSteps({required this.t, required this.status});
  final AppTheme t;
  final MeetingStatus status;

  @override
  Widget build(BuildContext context) {
    final steps = [
      ('הבקשה נשלחה לצוות', true),
      ('נציג יאשר את הפגישה בהקדם', status == MeetingStatus.confirmed),
      ('קישור ההצטרפות יופיע כאן ויישלח אליכם', status == MeetingStatus.confirmed),
    ];
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: t.alternate),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('מה קורה עכשיו?', style: t.titleSmall),
          const SizedBox(height: 12),
          for (final (label, done) in steps)
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: Row(
                children: [
                  Container(
                    width: 20,
                    height: 20,
                    decoration: BoxDecoration(
                      color: done ? t.brandAccent : t.alternate.withValues(alpha: 0.5),
                      shape: BoxShape.circle,
                    ),
                    child: done
                        ? const Icon(Icons.check_rounded, size: 13, color: Colors.white)
                        : null,
                  ),
                  const SizedBox(width: 10),
                  Expanded(child: Text(label, style: t.bodySmall.copyWith(color: t.primaryText))),
                ],
              ),
            ),
        ],
      ),
    );
  }
}
