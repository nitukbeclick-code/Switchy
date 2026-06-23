import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:chosech/pages/meeting/meeting_status_card.dart';
import 'package:chosech/services/backend/backend.dart';

/// Widget tests for the static "starts in…" countdown line on
/// [MeetingStatusCard]. The card takes an injectable [now] clock, so the buckets
/// (days / hours / soon / past) are exercised deterministically with no ticker.
BookedMeeting _meeting({
  MeetingStatus status = MeetingStatus.confirmed,
  String meetingDate = '2026-06-20',
  String slot = '14:30',
  String? joinUrl = 'https://zoom.us/j/1',
}) =>
    BookedMeeting(
      id: 'm1',
      status: status,
      provider: 'הוט',
      meetingDate: meetingDate,
      slot: slot,
      // starts_at is display-irrelevant here; the card derives the wall time
      // from meetingDate + slot via meetingLocalStart.
      startsAt: DateTime.utc(2026, 6, 20, 11, 30),
      joinUrl: joinUrl,
      createdAt: DateTime(2026, 6, 11),
    );

Widget _wrap(Widget child) => MaterialApp(
      home: Directionality(
        textDirection: TextDirection.rtl,
        child: Scaffold(body: SingleChildScrollView(child: child)),
      ),
    );

void main() {
  GoogleFonts.config.allowRuntimeFetching = false;

  testWidgets('shows a day-bucket countdown for a meeting days away',
      (tester) async {
    await tester.pumpWidget(_wrap(MeetingStatusCard(
      meeting: _meeting(),
      now: DateTime(2026, 6, 18, 14, 30), // exactly two days before
    )));
    await tester.pump();
    expect(find.textContaining('מתחילה בעוד 2 ימים'), findsOneWidget);
  });

  testWidgets('shows an hours-bucket countdown for a meeting later today',
      (tester) async {
    await tester.pumpWidget(_wrap(MeetingStatusCard(
      meeting: _meeting(),
      now: DateTime(2026, 6, 20, 11, 30), // three hours before 14:30
    )));
    await tester.pump();
    expect(find.textContaining('מתחילה בעוד 3 שעות'), findsOneWidget);
  });

  testWidgets('no countdown once the meeting start time has passed',
      (tester) async {
    await tester.pumpWidget(_wrap(MeetingStatusCard(
      meeting: _meeting(),
      now: DateTime(2026, 6, 20, 15, 0), // after 14:30
    )));
    await tester.pump();
    expect(find.textContaining('מתחילה'), findsNothing);
  });

  testWidgets('no countdown for a terminal (cancelled) meeting', (tester) async {
    await tester.pumpWidget(_wrap(MeetingStatusCard(
      meeting: _meeting(status: MeetingStatus.cancelled, joinUrl: null),
      now: DateTime(2026, 6, 18, 14, 30),
    )));
    await tester.pump();
    expect(find.textContaining('מתחילה'), findsNothing);
  });
}
