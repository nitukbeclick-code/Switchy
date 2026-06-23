import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../components/logo_widget/logo_widget.dart';
import '../../services/backend/backend.dart';
import '../../services/meeting_slots.dart';
import '../../theme/app_theme.dart';
import '../../widgets/app_button.dart';
import '../../widgets/app_snackbar.dart';

/// The booked video-meeting status card — rendered purely from a
/// [BookedMeeting] (which the caller reads off AppState), so it works on the
/// meeting screen, the home screen, and in tests without a backend.
///
/// pending → amber "waiting for a rep" chip; confirmed → indigo chip + the
/// join CTA (enabled from 15 minutes before start); no_rep / expired →
/// neutral chip + a "pick a new slot" CTA via [onPickNewSlot].
class MeetingStatusCard extends StatelessWidget {
  const MeetingStatusCard({
    super.key,
    required this.meeting,
    this.onPickNewSlot,
    this.now,
  });

  final BookedMeeting meeting;
  final VoidCallback? onPickNewSlot;

  /// Injectable clock for tests; defaults to [DateTime.now].
  final DateTime? now;

  Future<void> _join(BuildContext context) async {
    final url = meeting.joinUrl;
    if (url == null || url.isEmpty) return;
    try {
      await launchUrl(Uri.parse(url), mode: LaunchMode.externalApplication);
    } catch (_) {
      if (context.mounted) AppSnackBar.error(context, 'לא ניתן לפתוח את הקישור כרגע');
    }
  }

  /// Two YYYYMMDDTHHMMSS stamps (start/end, +30 min) in the meeting's wall time.
  /// Google reads these in [ctz] = Asia/Jerusalem, so the event lands at the
  /// right local hour regardless of the user's device timezone.
  String _calStamp(DateTime d) =>
      '${d.year.toString().padLeft(4, '0')}'
      '${d.month.toString().padLeft(2, '0')}'
      '${d.day.toString().padLeft(2, '0')}'
      'T${d.hour.toString().padLeft(2, '0')}'
      '${d.minute.toString().padLeft(2, '0')}00';

  /// Opens a Google Calendar "add event" page pre-filled with the meeting's
  /// time, title, and (if known) the Zoom join link.
  Future<void> _addToCalendar(BuildContext context, DateTime start) async {
    final end = start.add(const Duration(minutes: 30));
    final details = StringBuffer('פגישת וידאו של 30 דקות עם נציג חוסך.');
    if (meeting.provider != null && meeting.provider!.isNotEmpty) {
      details.write('\nספק: ${meeting.provider}');
    }
    if (meeting.joinUrl != null && meeting.joinUrl!.isNotEmpty) {
      details.write('\nקישור הצטרפות: ${meeting.joinUrl}');
    }
    final uri = Uri.https('calendar.google.com', '/calendar/render', {
      'action': 'TEMPLATE',
      'text': 'פגישת וידאו עם נציג חוסך',
      'dates': '${_calStamp(start)}/${_calStamp(end)}',
      'ctz': 'Asia/Jerusalem',
      'details': details.toString(),
      if (meeting.joinUrl != null && meeting.joinUrl!.isNotEmpty) 'location': meeting.joinUrl!,
    });
    try {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    } catch (_) {
      if (context.mounted) AppSnackBar.error(context, 'לא ניתן לפתוח את היומן כרגע');
    }
  }

  /// Only meetings still ahead of us get a countdown line.
  static bool _isUpcoming(MeetingStatus s) =>
      s == MeetingStatus.pending || s == MeetingStatus.confirmed;

  /// A static, human Hebrew "starts in…" label, or null once [start] is in the
  /// past (the join gating + status copy take over from there). Buckets keep it
  /// honest without a ticking clock: days → hours → "less than an hour" → "soon".
  static String? _countdown(DateTime now, DateTime start) {
    final d = start.difference(now);
    if (d.isNegative) return null;
    if (d.inDays >= 1) {
      final days = d.inDays;
      return days == 1 ? 'מתחילה מחר' : 'מתחילה בעוד $days ימים';
    }
    if (d.inHours >= 1) {
      final hours = d.inHours;
      return hours == 1 ? 'מתחילה בעוד שעה' : 'מתחילה בעוד $hours שעות';
    }
    if (d.inMinutes >= 15) return 'מתחילה בעוד פחות משעה';
    return 'מתחילה בקרוב';
  }

  @override
  Widget build(BuildContext context) {
    final t = AppTheme.of(context);
    final n = now ?? DateTime.now();
    // Gating compares Israel WALL time (the slot) against the device clock —
    // exact for the Israel-only audience; a travelling user's join button
    // unlocks shifted by their offset, never the meeting itself (starts_at
    // and the tz-pinned push reminders stay correct).
    final start = meetingLocalStart(meeting.meetingDate, meeting.slot);
    final joinOpen = !n.isBefore(start.subtract(const Duration(minutes: 15)));
    final dateLine = '${formatMeetingDateHe(start)} · ${meeting.slot}';

    final (chipLabel, chipBg, chipFg) = switch (meeting.status) {
      MeetingStatus.confirmed => ('הפגישה אושרה', t.brandAccentTint, t.brandAccent),
      MeetingStatus.pending => ('ממתין לאישור נציג', t.saving.withValues(alpha: 0.15), t.warning),
      MeetingStatus.noRep => ('לא נמצא נציג זמין', t.secondary, t.primaryText),
      MeetingStatus.expired => ('המועד חלף', t.secondary, t.primaryText),
      MeetingStatus.cancelled => ('הפגישה בוטלה', t.secondary, t.primaryText),
      MeetingStatus.completed => ('הפגישה הסתיימה', t.secondary, t.primaryText),
    };

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(18),
      decoration: t.glassDecoration(alpha: 0.78, radius: t.radiusCard),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 46,
                height: 46,
                decoration: BoxDecoration(
                  color: t.brandAccentTint,
                  borderRadius: BorderRadius.circular(t.radiusMd),
                  border: Border.all(color: t.brandAccent.withValues(alpha: 0.18)),
                ),
                child: Icon(Icons.videocam_rounded, size: 22, color: t.brandAccent),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('פגישת וידאו עם נציג', style: t.titleSmall),
                    const SizedBox(height: 2),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                      decoration: BoxDecoration(
                        color: chipBg,
                        borderRadius: BorderRadius.circular(t.radiusPill),
                      ),
                      child: Text(chipLabel,
                          style: t.labelSmall.copyWith(color: chipFg, fontWeight: FontWeight.w700)),
                    ),
                  ],
                ),
              ),
              if (meeting.provider != null && meeting.provider!.isNotEmpty)
                ExcludeSemantics(child: LogoWidget(provider: meeting.provider!, size: 40)),
            ],
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Icon(Icons.event_rounded, size: 15, color: t.secondaryText),
              const SizedBox(width: 6),
              Text(dateLine,
                  style: t.bodyMedium.copyWith(
                    color: t.primaryText,
                    fontWeight: FontWeight.w700,
                    fontFeatures: const [FontFeature.tabularFigures()],
                  )),
              const SizedBox(width: 10),
              Text('· 30 דקות · Zoom', style: t.labelSmall),
            ],
          ),
          // A static "starts in…" line for upcoming (pending/confirmed)
          // meetings — computed once per build from [now] (no ticker, so no idle
          // animation/test timer); the realtime status changes + AppState
          // rebuilds keep it fresh enough.
          if (_countdown(n, start) case final c?
              when _isUpcoming(meeting.status)) ...[
            const SizedBox(height: 6),
            Row(
              children: [
                Icon(Icons.schedule_rounded, size: 14, color: t.brandAccent),
                const SizedBox(width: 6),
                Text(c,
                    style: t.labelSmall
                        .copyWith(color: t.brandAccent, fontWeight: FontWeight.w700)),
              ],
            ),
          ],
          const SizedBox(height: 12),
          switch (meeting.status) {
            MeetingStatus.confirmed => Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  // The shared primary CTA (indigo gradient + glass edge);
                  // [enabled] keeps it dimmed until 15 minutes before start.
                  AppButton(
                    text: 'הצטרפות לפגישת Zoom',
                    onPressed: () async => _join(context),
                    enabled: joinOpen,
                    color: AppColors.primary,
                    height: 48,
                    icon: const Icon(Icons.videocam_rounded, size: 18, color: Colors.white),
                    textStyle: GoogleFonts.rubik(
                        fontSize: 14, fontWeight: FontWeight.w700, color: Colors.white),
                  ),
                  if (!joinOpen) ...[
                    const SizedBox(height: 6),
                    Text('ניתן להצטרף החל מ-15 דקות לפני תחילת הפגישה',
                        style: t.labelSmall, textAlign: TextAlign.center),
                  ],
                  const SizedBox(height: 8),
                  _AddToCalendarButton(t: t, onTap: () => _addToCalendar(context, start)),
                ],
              ),
            MeetingStatus.pending => Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text('נעדכן אתכם ברגע שנציג יאשר את המועד.', style: t.bodySmall),
                  const SizedBox(height: 10),
                  _AddToCalendarButton(t: t, onTap: () => _addToCalendar(context, start)),
                ],
              ),
            MeetingStatus.noRep => _newSlotCta(
                t, 'לא נמצא נציג זמין במועד שבחרתם. נשמח אם תבחרו מועד חדש.'),
            MeetingStatus.expired =>
              _newSlotCta(t, 'מועד הפגישה חלף ללא אישור. ניתן לקבוע מועד חדש.'),
            MeetingStatus.cancelled || MeetingStatus.completed =>
              _newSlotCta(t, 'ניתן לקבוע פגישה חדשה בכל עת.'),
          },
        ],
      ),
    );
  }

  Widget _newSlotCta(AppTheme t, String message) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(message, style: t.bodySmall),
        if (onPickNewSlot != null) ...[
          const SizedBox(height: 10),
          DecoratedBox(
            decoration: BoxDecoration(
              gradient: t.accentGradient,
              borderRadius: BorderRadius.circular(t.radiusMd),
              boxShadow: t.shadowAccent,
            ),
            child: Material(
              color: Colors.transparent,
              borderRadius: BorderRadius.circular(t.radiusMd),
              child: InkWell(
                borderRadius: BorderRadius.circular(t.radiusMd),
                onTap: onPickNewSlot,
                child: Padding(
                  padding: const EdgeInsets.symmetric(vertical: 12),
                  child: Center(
                    child: Text('בחירת מועד חדש',
                        style: GoogleFonts.rubik(
                            fontSize: 14, fontWeight: FontWeight.w700, color: Colors.white)),
                  ),
                ),
              ),
            ),
          ),
        ],
      ],
    );
  }
}

// ── Add-to-calendar (secondary, outlined green ACTION) ────────────────────────

/// A bordered "add to Google Calendar" affordance — secondary to the join CTA,
/// so it never competes with it. Used for both pending and confirmed meetings.
class _AddToCalendarButton extends StatelessWidget {
  const _AddToCalendarButton({required this.t, required this.onTap});
  final AppTheme t;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      label: 'הוספה ליומן Google',
      child: Material(
        color: Colors.transparent,
        borderRadius: BorderRadius.circular(t.radiusMd),
        child: InkWell(
          borderRadius: BorderRadius.circular(t.radiusMd),
          onTap: onTap,
          child: Container(
            padding: const EdgeInsets.symmetric(vertical: 11),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(t.radiusMd),
              border: Border.all(color: t.brandAccent.withValues(alpha: 0.5)),
            ),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                ExcludeSemantics(child: Icon(Icons.event_available_rounded, size: 17, color: t.brandAccent)),
                const SizedBox(width: 7),
                Text('הוספה ליומן',
                    style: GoogleFonts.rubik(
                        fontSize: 13.5, fontWeight: FontWeight.w700, color: t.brandAccent)),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
