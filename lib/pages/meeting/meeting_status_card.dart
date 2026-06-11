import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../components/logo_widget/logo_widget.dart';
import '../../services/backend/backend.dart';
import '../../services/meeting_slots.dart';
import '../../theme/app_theme.dart';
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
      MeetingStatus.pending => ('ממתין לאישור נציג', t.saving.withValues(alpha: 0.15), const Color(0xFFB45309)),
      MeetingStatus.noRep => ('לא נמצא נציג זמין', t.secondary, t.primaryText),
      MeetingStatus.expired => ('המועד חלף', t.secondary, t.primaryText),
      MeetingStatus.cancelled => ('הפגישה בוטלה', t.secondary, t.primaryText),
      MeetingStatus.completed => ('הפגישה הסתיימה', t.secondary, t.primaryText),
    };

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: t.glassDecoration(alpha: 0.78),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 44,
                height: 44,
                decoration: BoxDecoration(
                  color: t.brandAccentTint,
                  borderRadius: BorderRadius.circular(12),
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
          const SizedBox(height: 12),
          switch (meeting.status) {
            MeetingStatus.confirmed => Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Container(
                    decoration: BoxDecoration(
                      gradient: joinOpen ? t.accentGradient : null,
                      color: joinOpen ? null : t.alternate,
                      borderRadius: BorderRadius.circular(t.radiusMd),
                      boxShadow: joinOpen ? t.shadowAccent : null,
                    ),
                    child: Material(
                      color: Colors.transparent,
                      child: InkWell(
                        borderRadius: BorderRadius.circular(t.radiusMd),
                        onTap: joinOpen ? () => _join(context) : null,
                        child: Padding(
                          padding: const EdgeInsets.symmetric(vertical: 13),
                          child: Row(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              Icon(Icons.videocam_rounded,
                                  size: 18, color: joinOpen ? Colors.white : t.secondaryText),
                              const SizedBox(width: 8),
                              Text(
                                'הצטרפות לפגישת Zoom',
                                style: GoogleFonts.rubik(
                                  fontSize: 14,
                                  fontWeight: FontWeight.w700,
                                  color: joinOpen ? Colors.white : t.secondaryText,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ),
                  ),
                  if (!joinOpen) ...[
                    const SizedBox(height: 6),
                    Text('ניתן להצטרף החל מ-15 דקות לפני תחילת הפגישה',
                        style: t.labelSmall, textAlign: TextAlign.center),
                  ],
                ],
              ),
            MeetingStatus.pending =>
              Text('נעדכן אתכם ברגע שנציג יאשר את המועד.', style: t.bodySmall),
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
          Material(
            color: t.primary,
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
        ],
      ],
    );
  }
}
