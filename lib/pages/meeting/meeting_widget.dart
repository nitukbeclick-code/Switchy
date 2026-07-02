import 'package:flutter/foundation.dart' show kDebugMode;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:provider/provider.dart';
import '../../app_state.dart';
import '../../components/logo_widget/logo_widget.dart';
import '../../core/nav.dart';
import '../../core/zoom_providers.dart';
import '../../data.dart';
import '../../services/backend/backend.dart';
import '../../services/backend/local_backend.dart'; // global `appBackend` lives here
import '../../services/meeting_slots.dart';
import '../../services/meeting_sync.dart';
import '../../theme/app_theme.dart';
import '../../widgets/app_button.dart';
import '../../widgets/app_snackbar.dart';
import '../../widgets/consent_panel.dart';
import '../../widgets/legal_disclosure.dart';
import '../../widgets/pressable.dart';
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
  final _noteCtrl = TextEditingController();
  final _codeCtrl = TextEditingController();
  final _formKey = GlobalKey<FormState>();

  String? _provider;
  DateTime? _pickedDate;
  String? _slot;

  bool _acceptTerms = false;
  bool _acceptPrivacy = false;
  bool _acceptMarketing = false;
  bool _justBooked = false;

  // Email-OTP gate (the `meeting-book` edge function). The final "book" only
  // unlocks once the user has verified a code mailed to their address, so the
  // anon `meetings` INSERT policy can later be closed without breaking the app.
  bool _codeSent = false;       // a code was requested → show the code field
  bool _emailVerified = false;  // the typed code checked out → unlock booking
  bool _sendingCode = false;    // "שלח קוד אימות" is in-flight
  bool _verifyingCode = false;  // "אימות" is in-flight
  // The exact address the code was sent to / verified for. Editing the email
  // after verifying must re-arm the gate, so we compare against this.
  String? _verifiedEmail;

  /// Single source of truth for the email regex (mirrors the lead form): a
  /// reachable written channel is mandatory here because the Zoom link is mailed.
  static final RegExp _emailRe = RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]+$');

  String get _emailText => _emailCtrl.text.trim();
  bool get _emailLooksValid => _emailRe.hasMatch(_emailText);

  /// OS reduced-motion flag — entrance FADES stay (opacity is vestibular-safe);
  /// the slide legs are dropped (see [_reveal]).
  bool get _reduceMotion =>
      MediaQuery.maybeOf(context)?.disableAnimations ?? false;

  /// Shared wizard-section reveal honouring reduced motion: the fade always
  /// plays; the small slide-up only when the OS allows motion.
  Widget _reveal(Widget child, AppTheme t, {int delayMs = 0}) {
    final faded =
        child.animate(delay: delayMs.ms).fadeIn(duration: 260.ms, curve: t.easeOut);
    return _reduceMotion
        ? faded
        : faded.slideY(begin: 0.04, end: 0, duration: 260.ms, curve: t.easeOut);
  }

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

    // Warm the live Zoom-supported provider set (provider_capabilities) once so
    // the support gate reflects the table; until it resolves the const fallback
    // is used. Rebuild when it lands in case it flips this provider's gate.
    zoomSupportedProviders().then((_) {
      if (mounted) setState(() {});
    });

    // Editing the email after a code was sent/verified invalidates the gate:
    // a code is bound to one address, so the user must re-request + re-verify.
    _emailCtrl.addListener(_onEmailChanged);

    // Live status is owned by the app-scope MeetingSync (rep confirmations
    // must land even when this screen is closed); (re)starting it here is
    // idempotent and also hydrates the latest server row.
    MeetingSync.start();
  }

  @override
  void dispose() {
    _emailCtrl.removeListener(_onEmailChanged);
    _nameCtrl.dispose();
    _phoneCtrl.dispose();
    _emailCtrl.dispose();
    _noteCtrl.dispose();
    _codeCtrl.dispose();
    super.dispose();
  }

  /// Re-arms the OTP gate whenever the address no longer matches the one a code
  /// was sent to — a stale "verified" badge on a different email would be a lie.
  void _onEmailChanged() {
    if (!_codeSent && !_emailVerified) return;
    if (_emailText == _verifiedEmail) return;
    setState(() {
      _codeSent = false;
      _emailVerified = false;
      _verifiedEmail = null;
      _codeCtrl.clear();
    });
  }

  /// A meeting that should occupy this screen: anything not terminal, or a
  /// confirmed meeting that hasn't ended yet.
  bool _hasOpenMeeting(BookedMeeting? m) {
    if (m == null) return false;
    final start = meetingLocalStart(m.meetingDate, m.slot);
    return switch (m.status) {
      MeetingStatus.pending => start.add(const Duration(minutes: 30)).isAfter(DateTime.now()),
      MeetingStatus.confirmed => start.add(const Duration(minutes: 30)).isAfter(DateTime.now()),
      MeetingStatus.noRep || MeetingStatus.expired => true, // actionable: pick a new slot
      MeetingStatus.cancelled || MeetingStatus.completed => false,
    };
  }

  /// Step 1 of the OTP gate: mail a 6-digit code to the typed address. We
  /// validate the email locally first (the code is useless if it can't arrive),
  /// then reveal the code field. The function answers {ok:true} regardless of
  /// whether the address exists, so a true return just means "request sent".
  Future<void> _sendCode() async {
    if (!_emailLooksValid) {
      HapticFeedback.heavyImpact();
      AppSnackBar.info(context, 'הזינו כתובת אימייל תקינה לקבלת קוד האימות');
      return;
    }
    HapticFeedback.lightImpact();
    setState(() => _sendingCode = true);
    ({bool ok, bool sent}) res;
    try {
      res = await appBackend
          .requestMeetingEmailCode(_emailText, name: _nameCtrl.text.trim())
          .timeout(const Duration(seconds: 10));
    } catch (_) {
      res = (ok: false, sent: false);
    }
    if (!mounted) return;
    // Only reveal the code field when the email was actually sent — otherwise the
    // user would wait for a code that never arrives.
    final accepted = res.ok && res.sent;
    setState(() {
      _sendingCode = false;
      if (accepted) {
        _codeSent = true;
        _verifiedEmail = _emailText; // bind the gate to this address
        _emailVerified = false;
        _codeCtrl.clear();
      }
    });
    if (accepted) {
      AppSnackBar.success(context, 'שלחנו קוד אימות בן 6 ספרות לכתובת $_emailText');
    } else if (res.ok && !res.sent) {
      HapticFeedback.heavyImpact();
      // Reached the backend, but the email SEND failed (Resend down / sender
      // domain not verified). Don't dead-end the user on a code that won't come —
      // point them to WhatsApp, where the live agent can book them directly.
      AppSnackBar.error(context,
          'לא הצלחנו לשלוח כרגע מייל לכתובת זו. נסו שוב בעוד רגע, או דברו איתנו ישירות ב-WhatsApp ונסגור לכם פגישה.');
    } else {
      HapticFeedback.heavyImpact();
      AppSnackBar.error(context, 'שליחת קוד האימות נכשלה — בדקו את החיבור ונסו שוב');
    }
  }

  /// Step 2: verify the typed code against the one mailed in [_sendCode]. On
  /// success the final "book" CTA unlocks; otherwise we show the function's
  /// honest Hebrew reason (wrong / expired code).
  Future<void> _verifyCode() async {
    final code = _codeCtrl.text.trim();
    if (code.length < 6) {
      HapticFeedback.heavyImpact();
      AppSnackBar.info(context, 'הזינו את קוד האימות בן 6 הספרות');
      return;
    }
    HapticFeedback.lightImpact();
    setState(() => _verifyingCode = true);
    ({bool ok, String? error}) res;
    try {
      res = await appBackend
          .verifyMeetingEmailCode(_emailText, code)
          .timeout(const Duration(seconds: 10));
    } catch (_) {
      res = (ok: false, error: null);
    }
    if (!mounted) return;
    setState(() {
      _verifyingCode = false;
      _emailVerified = res.ok;
      if (res.ok) _verifiedEmail = _emailText;
    });
    if (res.ok) {
      HapticFeedback.mediumImpact();
      AppSnackBar.success(context, 'האימייל אומת — אפשר לקבוע את הפגישה');
    } else {
      // Wrong/expired code — heavy buzz pairs with the honest rejection copy.
      HapticFeedback.heavyImpact();
      AppSnackBar.error(context, res.error ?? 'הקוד שגוי או שפג תוקפו — נסו שוב');
    }
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) {
      // A field is invalid — heavy buzz marks the rejected booking attempt.
      HapticFeedback.heavyImpact();
      return;
    }
    if (_provider == null) {
      HapticFeedback.heavyImpact();
      AppSnackBar.info(context, 'בחרו ספק לפגישה');
      return;
    }
    if (_slot == null) {
      HapticFeedback.heavyImpact();
      AppSnackBar.info(context, 'בחרו שעה לפגישה');
      return;
    }
    if (!_acceptTerms || !_acceptPrivacy) {
      HapticFeedback.heavyImpact();
      AppSnackBar.info(context, 'יש לאשר את תנאי השימוש ומדיניות הפרטיות כדי לשלוח');
      return;
    }
    if (!_emailVerified || _emailText != _verifiedEmail) {
      HapticFeedback.heavyImpact();
      AppSnackBar.info(context, 'אמתו את כתובת האימייל לפני קביעת הפגישה');
      return;
    }
    HapticFeedback.lightImpact();

    final name = _nameCtrl.text.trim();
    final phone = _phoneCtrl.text.replaceAll(RegExp(r'[^\d+]'), '');
    final email = _emailCtrl.text.trim();
    final note = _noteCtrl.text.trim();
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
            notes: note.isNotEmpty ? note : null,
            source: widget.source,
            termsAcceptedAt: nowIso,
            privacyAcceptedAt: nowIso,
            marketingAcceptedAt: _acceptMarketing ? nowIso : null,
          ))
          .timeout(const Duration(seconds: 10));
    } catch (e) {
      // The request never reached the team — keep the form so the user can
      // retry. The guard trigger's rejections get specific, honest copy. A
      // heavy buzz marks the failed booking outcome before the honest message.
      if (!mounted) return;
      HapticFeedback.heavyImpact();
      final msg = e.toString();
      if (msg.contains('meeting already pending')) {
        // There IS an open booking server-side (e.g. cleared local state) —
        // adopt it and show its status instead of a dead-end error.
        AppSnackBar.info(context, 'כבר קיימת לכם פגישה פתוחה — מציגים אותה');
        await MeetingSync.refresh();
        if (mounted) setState(() => _justBooked = false);
      } else if (msg.contains('not verified') ||
          msg.contains('verify') ||
          msg.contains('code')) {
        // The server rejected the booking because the email isn't verified
        // (e.g. the OTP expired between verify and book) — re-arm the gate.
        setState(() {
          _emailVerified = false;
          _verifiedEmail = null;
        });
        AppSnackBar.error(context, 'יש לאמת מחדש את כתובת האימייל — שלחו קוד חדש');
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
    setState(() => _justBooked = true);
  }

  @override
  Widget build(BuildContext context) {
    final t = AppTheme.of(context);
    // Scope the AppState dependency: this screen only cares about the booked
    // meeting (rep confirmations / link arrivals), so select just that field —
    // a like/bill/quiz notify elsewhere no longer rebuilds the whole wizard.
    final appState = Provider.of<AppState>(context, listen: false);
    final bookedMeeting =
        context.select<AppState, BookedMeeting?>((s) => s.bookedMeeting);
    final showStatus = _hasOpenMeeting(bookedMeeting);

    // Honest gate: when the booking is for a KNOWN provider (passed in via the
    // entry point) that doesn't support Zoom video calls, never offer the
    // booking form — show a clear not-supported note instead. An open meeting
    // still owns the screen (already booked → always reachable), and when no
    // provider was passed the user picks a supported one from the chips.
    final gatedProvider = widget.provider;
    final providerUnsupported = gatedProvider != null &&
        gatedProvider.trim().isNotEmpty &&
        !providerSupportsZoom(gatedProvider);

    final Widget body = showStatus
        ? _buildStatusView(t, appState)
        : providerUnsupported
            ? _buildUnsupported(t, gatedProvider)
            : _buildWizard(t);

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
        title: Semantics(
          header: true,
          child: Text('פגישת וידאו עם נציג', style: t.titleMedium),
        ),
        centerTitle: true,
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(20),
        child: body,
      ),
    );
  }

  // ── Provider-not-supported state ───────────────────────────────────────────
  /// Shown instead of the booking wizard when the entry provider doesn't offer
  /// Zoom video calls (provider_capabilities.supports_zoom_meeting = false).
  /// Keeps the Geist header; offers a phone callback so the user never dead-ends.
  Widget _buildUnsupported(AppTheme t, String provider) {
    final card = Container(
          width: double.infinity,
          padding: const EdgeInsets.all(18),
          decoration: t.cardDecoration(radius: t.radiusLg),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  ExcludeSemantics(child: LogoWidget(provider: provider, size: 30)),
                  const SizedBox(width: 10),
                  Icon(Icons.videocam_off_rounded, size: 22, color: t.secondaryText),
                ],
              ),
              const SizedBox(height: 12),
              Text('ספק זה אינו תומך כרגע בשיחות וידאו',
                  style: t.titleSmall.copyWith(fontWeight: FontWeight.w800)),
              const SizedBox(height: 6),
              Text(
                'פגישות הווידאו זמינות כרגע רק עם חלק מהספקים. אפשר לבקש שנציג '
                'יחזור אליכם טלפונית, או לבחור ספק אחר.',
                style: t.bodySmall.copyWith(color: t.secondaryText),
              ),
              const SizedBox(height: 14),
              // Secondary action = the shared white/outline AppButton variant
              // (the green outline competed with the primary-CTA green).
              AppButton.secondary(
                text: 'בקשו שיחה חוזרת במקום',
                icon: Icon(Icons.headset_mic_outlined, size: 18, color: t.primaryText),
                onPressed: () async => context.pushNamed('Callback'),
                width: double.infinity,
                height: 48,
                textStyle: t.labelLarge.copyWith(fontWeight: FontWeight.w700),
              ),
            ],
          ),
        ).animate().fadeIn(duration: 300.ms);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _buildHero(t).animate().fadeIn(duration: 350.ms),
        const SizedBox(height: 20),
        // Reduced motion keeps the fade, drops the slide.
        _reduceMotion ? card : card.slideY(begin: 0.04, end: 0),
        const SizedBox(height: 16),
        Center(
          child: TextButton(
            onPressed: () => context.goNamed('Home'),
            // AA-safe green link ink (green 700 on light; lifted 400 on dark).
            child: Text('חזרה לדף הבית',
                style: t.labelMedium.copyWith(color: t.brandAccentText, fontWeight: FontWeight.w700)),
          ),
        ),
      ],
    );
  }

  // ── Status view — an open meeting owns the screen ──────────────────────────

  Widget _buildStatusView(AppTheme t, AppState appState) {
    final m = appState.bookedMeeting!;
    final statusCard = MeetingStatusCard(
      meeting: m,
      onPickNewSlot: () {
        appState.clearBookedMeeting();
        setState(() => _justBooked = false);
      },
    ).animate().fadeIn(duration: 300.ms);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (_justBooked) ...[
          _SuccessHeader(t: t).animate().fadeIn(duration: 350.ms),
          const SizedBox(height: 16),
        ],
        // Demo banner is for the local dev build ONLY — gate on kDebugMode, not
        // on the backend type. A prod build that falls back to LocalBackend must
        // never tell a paying customer "האישור מדומה".
        if (kDebugMode) ...[
          _DemoBanner(t: t),
          const SizedBox(height: 12),
        ],
        // Reduced motion keeps the fade, drops the slide.
        _reduceMotion ? statusCard : statusCard.slideY(begin: 0.04, end: 0),
        const SizedBox(height: 16),
        _NextSteps(t: t, status: m.status),
        const SizedBox(height: 20),
        Center(
          child: TextButton(
            onPressed: () => context.goNamed('Home'),
            // AA-safe green link ink.
            child: Text('חזרה לדף הבית',
                style: t.labelMedium.copyWith(color: t.brandAccentText, fontWeight: FontWeight.w700)),
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
          // Demo banner is for the local dev build ONLY — gate on kDebugMode,
          // not on the backend type, so a prod LocalBackend fallback never
          // tells a real customer the booking is simulated.
          if (kDebugMode) ...[
            _DemoBanner(t: t),
            const SizedBox(height: 16),
          ],

          // The four wizard sections reveal in a short stagger (Emil: card
          // reveals stagger ~30-80ms apart, fadeIn + a small translateY). Each
          // leg stays in the snappy UI band (<300ms) under ease-out so a step
          // appearing never feels sluggish.
          _SectionLabel(t: t, step: 1, label: 'לאיזה ספק תרצו הצעת מחיר?'),
          const SizedBox(height: 10),
          _reveal(_buildProviderChips(t), t, delayMs: 40),

          const SizedBox(height: 22),
          _SectionLabel(t: t, step: 2, label: 'באיזה יום נוח לכם?'),
          const SizedBox(height: 4),
          Text('ניתן לקבוע פגישה החל ממחר, בימים א׳–ה׳ ובשישי בבוקר.', style: t.bodySmall),
          const SizedBox(height: 10),
          _reveal(_buildDateChips(t), t, delayMs: 100),

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
          _reveal(_buildSlotChips(t), t, delayMs: 160),

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
            autofillHints: const [AutofillHints.email],
            // Email is mandatory now: we mail a verification code here before a
            // slot is held, and the Zoom link is delivered to this address.
            enabled: !_emailVerified, // lock once verified (editing re-arms it)
            decoration: _inputDecoration(t, hint: 'אימייל', icon: Icons.mail_outline_rounded),
            validator: (v) {
              final s = (v ?? '').trim();
              if (s.isEmpty) return 'יש להזין כתובת אימייל';
              return _emailRe.hasMatch(s) ? null : 'כתובת אימייל לא תקינה';
            },
          ),
          const SizedBox(height: 4),
          Text('נשלח לכאן קוד אימות, וקישור ההצטרפות יגיע לכתובת זו.', style: t.labelSmall),
          const SizedBox(height: 12),
          _buildEmailVerification(t)
              .animate(delay: 200.ms)
              .fadeIn(duration: 260.ms, curve: t.easeOut),

          const SizedBox(height: 12),
          TextFormField(
            controller: _noteCtrl,
            textDirection: TextDirection.rtl,
            minLines: 2,
            maxLines: 4,
            maxLength: 300,
            decoration: _inputDecoration(t, hint: 'מה תרצו לבדוק בפגישה? (אופציונלי)', icon: Icons.sticky_note_2_outlined),
          ),
          Text('כמה מילים לנציג מראש — למשל הספק הנוכחי, התקציב, או מה חשוב לכם.',
              style: t.labelSmall.copyWith(color: t.secondaryText)),

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

          // §7b / §17 — the same honest commission + price caveat shown on the
          // web at the hand-off moment: the service is free, we are paid a
          // referral fee by the provider on a switch (does NOT change the price
          // you pay), prices include VAT and should be verified with the
          // provider. Shared verbatim copy via [LegalDisclosure].
          const LegalDisclosure(),
          const SizedBox(height: 16),

          AppButton(
            // AppButton drives the spinner + tap-ignore while [_submit] awaits,
            // so the label stays the honest CTA text (no faked "שולח...").
            // Disabled until the email is verified — the OTP gate must pass
            // before a slot is held (the edge function re-checks server-side).
            text: 'בקשו פגישת וידאו',
            onPressed: () async => _submit(),
            enabled: _emailVerified,
            width: double.infinity,
            height: 56,
            color: AppColors.primary,
            // No pinned white — AppButton resolves the on-gradient label ink.
            textStyle: t.titleMedium,
            // No token equals the bespoke 18 corner (radiusCard 12 / radiusSheet
            // 20 straddle it); radiusSheet is the nearest, preserving the generous
            // hero-CTA corner without forcing the tighter card radius.
            borderRadius: BorderRadius.circular(t.radiusSheet),
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
      padding: const EdgeInsets.all(20),
      // Resting hero band — flat under the one-elevation-story rule (only
      // sheets/FABs/sticky bars lift); structure comes from the ink wash itself.
      decoration: BoxDecoration(
        gradient: t.brandGradient,
        borderRadius: BorderRadius.circular(t.radiusCard),
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
              borderRadius: BorderRadius.circular(t.radiusMd),
            ),
            child: ExcludeSemantics(
              child: Image.asset(
                'assets/images/zoom.png',
                fit: BoxFit.contain,
                // Decode at the ~34dp display box (48 tile minus padding), not
                // at the asset's full resolution.
                cacheWidth:
                    (34 * MediaQuery.devicePixelRatioOf(context)).round(),
              ),
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
                  // Assistant body face → nearest scale token is bodySmall (13);
                  // copyWith carries the genuine deltas (on-ink white@0.85, the
                  // 12.5 size and 1.35 line-height) so the render is unchanged.
                  style: t.bodySmall.copyWith(
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
    // Only offer providers that actually support a Zoom booking — picking an
    // unsupported one would just dead-end at submit. Keeps the chips honest and
    // in sync with the same gate the entry-provider path uses.
    final providers =
        allProviders.where(providerSupportsZoom).toList(growable: false);
    return Wrap(
      spacing: 8,
      runSpacing: 8,
      children: providers.map((p) {
        final active = _provider == p;
        return Semantics(
          button: true,
          selected: active,
          label: 'ספק $p',
          child: Pressable(
            onTap: () {
              HapticFeedback.selectionClick();
              setState(() => _provider = p);
            },
            haptic: false,
            // >=48dp tap target (Pressable hit-tests the whole opaque box)
            // without growing the painted pill — it stays centered inside.
            child: ConstrainedBox(
              constraints: const BoxConstraints(minHeight: kMinTapTarget),
              child: Center(
                widthFactor: 1,
                // ONE chip language — ACTIVE: green tint + green 1px border +
                // AA green ink (solid green is reserved for CTAs); neutral:
                // surface + hairline + ink.
                child: AnimatedContainer(
                  duration: t.motionTooltip,
                  curve: t.easeOut,
                  decoration: BoxDecoration(
                    color: active ? t.brandAccentTint : t.cardSurface,
                    borderRadius: BorderRadius.circular(t.radiusPill),
                    border: Border.all(color: active ? t.brandAccent : t.lineColor),
                  ),
                  padding: const EdgeInsetsDirectional.fromSTEB(6, 5, 12, 5),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      ExcludeSemantics(child: LogoWidget(provider: p, size: 26)),
                      const SizedBox(width: 7),
                      Text(p,
                          style: t.labelMedium.copyWith(
                            color: active ? t.brandAccentText : t.primaryText,
                            fontWeight: active ? FontWeight.w700 : FontWeight.w500,
                          )),
                    ],
                  ),
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
    // Dynamic-type resilience: the two-line chip content grows with the OS
    // text scale, so the fixed rail grows with it (never shrinks below 64).
    final textScale =
        (MediaQuery.textScalerOf(context).scale(14) / 14).clamp(1.0, 1.6).toDouble();
    return SizedBox(
      height: 64 * textScale,
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
            child: Pressable(
              onTap: () {
                HapticFeedback.selectionClick();
                setState(() {
                  _pickedDate = d;
                  // A slot from Sun–Thu may not exist on Friday — revalidate.
                  if (_slot != null && !meetingSlotsFor(d).contains(_slot)) _slot = null;
                });
              },
              haptic: false,
              // ACTIVE chip = green tint + green border + AA green ink; the
              // solid-green fill (CTA-only) is gone.
              child: AnimatedContainer(
                duration: t.motionTooltip,
                curve: t.easeOut,
                decoration: BoxDecoration(
                  color: active ? t.brandAccentTint : t.cardSurface,
                  borderRadius: BorderRadius.circular(t.radiusMd),
                  border: Border.all(color: active ? t.brandAccent : t.lineColor),
                ),
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Text('יום ${label.split(' ')[1]}',
                        style: t.labelMedium.copyWith(
                          color: active ? t.brandAccentText : t.primaryText,
                          fontWeight: FontWeight.w700,
                        )),
                    const SizedBox(height: 2),
                    Text('${d.day}.${d.month}',
                        style: t.labelSmall.copyWith(
                          color: active ? t.brandAccentText : t.secondaryText,
                          fontFeatures: const [FontFeature.tabularFigures()],
                        )),
                  ],
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
    // Defensive: a bookable day always has slots today, but if the rules ever
    // leave a day with none, never render a silent empty gap — offer the user a
    // real alternative (a phone callback) so the flow can't dead-end here.
    if (slots.isEmpty) return _buildNoSlots(t);
    return Wrap(
      spacing: 8,
      runSpacing: 8,
      children: slots.map((s) {
        final active = _slot == s;
        // Pressable owns the tap + scale-0.97 press tell (Emil: slot chips get
        // tactile press feedback — the same primitive the rest of the app's
        // chips use); the AnimatedContainer crisply morphs the selected color/
        // border under ease-out. Carries no semantics, so the labelled node is
        // unchanged.
        return Semantics(
          button: true,
          selected: active,
          label: 'שעה $s',
          child: Pressable(
            onTap: () {
              HapticFeedback.selectionClick();
              setState(() => _slot = s);
            },
            haptic: false,
            // >=48dp tap target (Pressable hit-tests the whole opaque box)
            // without growing the painted chip — it stays centered inside.
            child: ConstrainedBox(
              constraints: const BoxConstraints(
                  minWidth: kMinTapTarget, minHeight: kMinTapTarget),
              child: Center(
                widthFactor: 1,
                // ACTIVE chip = green tint + green border + AA green ink.
                child: AnimatedContainer(
                  duration: t.motionTooltip,
                  curve: t.easeOut,
                  decoration: BoxDecoration(
                    color: active ? t.brandAccentTint : t.cardSurface,
                    borderRadius: BorderRadius.circular(t.radiusSm),
                    border: Border.all(color: active ? t.brandAccent : t.lineColor),
                  ),
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 9),
                  child: Text(s,
                      style: t.labelMedium.copyWith(
                        color: active ? t.brandAccentText : t.primaryText,
                        fontWeight: active ? FontWeight.w700 : FontWeight.w500,
                        fontFeatures: const [FontFeature.tabularFigures()],
                      )),
                ),
              ),
            ),
          ),
        );
      }).toList(),
    );
  }

  /// Shown when the chosen day has no bookable slots: an honest note plus a
  /// "request a callback instead" route, so the wizard never strands the user.
  Widget _buildNoSlots(AppTheme t) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: t.cardDecoration(radius: t.radiusMd),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(Icons.event_busy_rounded, size: 20, color: t.secondaryText),
              const SizedBox(width: 8),
              Expanded(
                child: Text('אין מועדים פנויים ביום זה',
                    style: t.titleSmall.copyWith(fontWeight: FontWeight.w700)),
              ),
            ],
          ),
          const SizedBox(height: 6),
          Text(
            'אפשר לבחור יום אחר למעלה, או לבקש שנציג יחזור אליכם טלפונית במקום.',
            style: t.bodySmall.copyWith(color: t.secondaryText),
          ),
          const SizedBox(height: 12),
          // Secondary action = the shared white/outline AppButton variant.
          AppButton.secondary(
            text: 'בקשו שיחה חוזרת במקום',
            icon: Icon(Icons.headset_mic_outlined, size: 18, color: t.primaryText),
            onPressed: () async => context.pushNamed('Callback'),
            width: double.infinity,
            height: 48,
            textStyle: t.labelLarge.copyWith(fontWeight: FontWeight.w700),
          ),
        ],
      ),
    );
  }

  InputDecoration _inputDecoration(AppTheme t, {required String hint, required IconData icon}) {
    return InputDecoration(
      hintText: hint,
      prefixIcon: Icon(icon, color: t.secondaryText, size: 20),
      filled: true,
      fillColor: t.cardSurface,
      border: OutlineInputBorder(borderRadius: BorderRadius.circular(t.radiusCard), borderSide: BorderSide(color: t.alternate)),
      enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(t.radiusCard), borderSide: BorderSide(color: t.alternate)),
      focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(t.radiusCard), borderSide: BorderSide(color: t.brandAccent, width: 1.5)),
      errorBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(t.radiusCard), borderSide: BorderSide(color: t.error)),
      focusedErrorBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(t.radiusCard), borderSide: BorderSide(color: t.error, width: 1.5)),
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
    );
  }

  // ── Email verification (OTP gate) ──────────────────────────────────────────
  /// The three-state email-OTP block that sits between the consent panel and the
  /// final booking CTA: (1) "שלח קוד אימות" → (2) a 6-digit code field + "אימות"
  /// (with a resend) → (3) a verified confirmation. Until state (3) is reached
  /// the booking button stays disabled, so a slot is only ever held for a
  /// reachable, verified address.
  Widget _buildEmailVerification(AppTheme t) {
    if (_emailVerified) {
      // Success confirmation — the sanctioned green treatment: pale tint +
      // green 1px border + AA green ink (t.success resolved to a grey ink on
      // light, so the "verified" state didn't read as success at all).
      return Container(
        width: double.infinity,
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        decoration: BoxDecoration(
          color: t.brandAccentTint,
          borderRadius: BorderRadius.circular(t.radiusMd),
          border: Border.all(color: t.brandAccent),
        ),
        child: Semantics(
          liveRegion: true,
          label: 'האימייל אומת',
          child: Row(
            children: [
              Icon(Icons.verified_rounded, size: 20, color: t.brandAccent),
              const SizedBox(width: 10),
              Expanded(
                child: Text('האימייל אומת — אפשר לקבוע את הפגישה',
                    style: t.bodySmall.copyWith(color: t.brandAccentText, fontWeight: FontWeight.w700)),
              ),
              TextButton(
                onPressed: () {
                  // "Change email" — re-arm the gate so a new address must be
                  // re-verified before booking.
                  setState(() {
                    _emailVerified = false;
                    _codeSent = false;
                    _verifiedEmail = null;
                    _codeCtrl.clear();
                  });
                },
                child: Text('שינוי',
                    style: t.labelSmall.copyWith(color: t.brandAccentText, fontWeight: FontWeight.w700)),
              ),
            ],
          ),
        ),
      );
    }

    if (!_codeSent) {
      // Secondary variant keeps the calm ink label (AppButton owns the label
      // contrast; the pinned green icon/text competed with the primary CTA).
      return AppButton.secondary(
        text: 'שלח קוד אימות',
        icon: Icon(Icons.mark_email_read_outlined, size: 18, color: t.primaryText),
        onPressed: () async => _sendCode(),
        width: double.infinity,
        height: 48,
        textStyle: t.labelLarge.copyWith(fontWeight: FontWeight.w700),
      );
    }

    // Code sent → ask for the 6 digits, verify, and offer a resend.
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(14),
      decoration: t.cardDecoration(radius: t.radiusMd),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('הזינו את קוד האימות שנשלח ל-$_verifiedEmail',
              style: t.bodySmall.copyWith(color: t.secondaryText)),
          const SizedBox(height: 10),
          Row(
            children: [
              Expanded(
                child: TextFormField(
                  key: const Key('meeting-otp-code'),
                  controller: _codeCtrl,
                  keyboardType: TextInputType.number,
                  textDirection: TextDirection.ltr,
                  textAlign: TextAlign.center,
                  maxLength: 6,
                  // Digits only; the verify CTA enables once all 6 are present.
                  inputFormatters: [
                    FilteringTextInputFormatter.digitsOnly,
                    LengthLimitingTextInputFormatter(6),
                  ],
                  onChanged: (_) => setState(() {}), // re-evaluate the CTA enable
                  onFieldSubmitted: (_) => _verifyCode(),
                  style: t.titleMedium.copyWith(
                    letterSpacing: 6,
                    fontFeatures: const [FontFeature.tabularFigures()],
                  ),
                  decoration: _inputDecoration(t, hint: '------', icon: Icons.password_outlined)
                      .copyWith(counterText: ''),
                ),
              ),
              const SizedBox(width: 10),
              AppButton(
                text: 'אימות',
                onPressed: () async => _verifyCode(),
                enabled: _codeCtrl.text.trim().length == 6,
                height: 52,
                padding: const EdgeInsets.symmetric(horizontal: 18),
                color: AppColors.primary,
                // No pinned white — AppButton resolves the on-gradient label ink.
                textStyle: t.labelLarge.copyWith(fontWeight: FontWeight.w700),
                borderRadius: BorderRadius.circular(t.radiusCard),
              ),
            ],
          ),
          const SizedBox(height: 4),
          Align(
            alignment: AlignmentDirectional.centerStart,
            child: TextButton(
              // Disabled while either request is in flight so a resend can't
              // race an in-progress verify.
              onPressed: (_sendingCode || _verifyingCode) ? null : () async => _sendCode(),
              // AA-safe green link ink for the small resend link.
              child: Text(_sendingCode ? 'שולח קוד…' : 'לא קיבלתם? שליחה חוזרת',
                  style: t.labelSmall.copyWith(color: t.brandAccentText, fontWeight: FontWeight.w700)),
            ),
          ),
        ],
      ),
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
        // Neutral accent1 medallion (the shared icon-tile pattern) — the solid
        // green step dot spent CTA-green on passive structure. Decorative:
        // the header text itself carries the step meaning.
        ExcludeSemantics(
          child: Container(
            width: 22,
            height: 22,
            decoration: BoxDecoration(
              color: t.accent1,
              shape: BoxShape.circle,
              border: Border.all(color: t.lineColor),
            ),
            child: Center(
              // Rubik step numeral → nearest Rubik scale token is titleSmall (13);
              // copyWith carries the genuine deltas (12px, w800, ink-on-tint).
              child: Text('$step',
                  style: t.titleSmall.copyWith(fontSize: 12, fontWeight: FontWeight.w800)),
            ),
          ),
        ),
        const SizedBox(width: 8),
        // The wizard step titles are the screen's section headers — announce
        // them as such so screen-reader users can jump between steps.
        Expanded(
          child: Semantics(
            header: true,
            child: Text(label, style: t.titleSmall),
          ),
        ),
      ],
    );
  }
}

class _DemoBanner extends StatelessWidget {
  const _DemoBanner({required this.t});
  final AppTheme t;

  @override
  Widget build(BuildContext context) {
    // A caution banner → the WARNING token family end-to-end (the green VALUE
    // tint under a warning message mixed two semantic languages).
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 11),
      decoration: BoxDecoration(
        color: t.warning.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(t.radiusMd),
        border: Border.all(color: t.warning.withValues(alpha: 0.4)),
      ),
      child: Row(
        children: [
          Icon(Icons.science_rounded, size: 15, color: t.warning),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              'מצב הדגמה — האישור והקישור מדומים ואינם נשלחים לנציג.',
              style: t.labelSmall.copyWith(color: t.warning, fontWeight: FontWeight.w600),
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
    // Reduced motion: the celebratory scale-pop degrades to a plain fade.
    final reduceMotion =
        MediaQuery.maybeOf(context)?.disableAnimations ?? false;
    // Success confirmation — solid green is sanctioned here; FLAT (the green
    // glow contradicted the no-glow standard) and the check uses the on-green
    // ink so it survives the lifted dark-mode fill.
    final badge = Container(
      width: 64,
      height: 64,
      decoration: BoxDecoration(
        color: t.brandAccent,
        shape: BoxShape.circle,
      ),
      child: Icon(Icons.check_rounded, size: 34, color: t.onSaving),
    );
    return Column(
      children: [
        reduceMotion
            ? badge.animate().fadeIn(duration: 200.ms)
            : badge.animate().scale(
                begin: const Offset(0.6, 0.6),
                end: const Offset(1, 1),
                duration: 350.ms,
                curve: Curves.easeOutBack),
        const SizedBox(height: 12),
        Semantics(
          header: true,
          child: Text('הבקשה התקבלה', style: t.headlineSmall, textAlign: TextAlign.center),
        ),
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
      padding: const EdgeInsets.all(18),
      decoration: t.cardDecoration(radius: t.radiusLg),
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
                        // On-green ink (white fell to ~1.7:1 on the lifted dark green).
                        ? Icon(Icons.check_rounded, size: 13, color: t.onSaving)
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
