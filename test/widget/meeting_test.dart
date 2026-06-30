import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:chosech/app_state.dart';
import 'package:chosech/pages/meeting/meeting_status_card.dart';
import 'package:chosech/pages/meeting/meeting_widget.dart';
import 'package:chosech/services/backend/backend.dart';
import 'package:chosech/services/backend/local_backend.dart';
import 'package:chosech/services/meeting_slots.dart';

Widget _wrap(Widget child) {
  return MaterialApp(
    home: Directionality(
      textDirection: TextDirection.rtl,
      child: ChangeNotifierProvider<AppState>.value(
        value: AppState(),
        child: child,
      ),
    ),
  );
}

BookedMeeting _meeting({MeetingStatus status = MeetingStatus.pending, String? joinUrl}) =>
    BookedMeeting(
      id: 'm1',
      status: status,
      // A Zoom-supported catalogue id (provider_capabilities) so the wizard gate
      // shows the booking form, not the "not supported" state.
      provider: 'HOT',
      meetingDate: '2026-06-16',
      slot: '14:30',
      startsAt: DateTime.utc(2026, 6, 16, 11, 30),
      joinUrl: joinUrl,
      createdAt: DateTime(2026, 6, 11),
    );

void main() {
  GoogleFonts.config.allowRuntimeFetching = false;

  late LocalBackend backend;

  setUp(() {
    TestWidgetsFlutterBinding.ensureInitialized();
    SharedPreferences.setMockInitialValues({});
    AppState.reset();
    backend = LocalBackend()..demoConfirmDelay = Duration.zero; // demo confirm fires immediately
    appBackend = backend;
  });

  tearDown(() {
    appBackend = LocalBackend();
  });

  group('MeetingStatusCard', () {
    testWidgets('pending shows the waiting chip and no join CTA', (tester) async {
      await tester.pumpWidget(_wrap(Scaffold(body: MeetingStatusCard(meeting: _meeting()))));
      await tester.pump();
      expect(find.text('ממתין לאישור נציג'), findsOneWidget);
      expect(find.text('הצטרפות לפגישת Zoom'), findsNothing);
    });

    testWidgets('confirmed shows the join CTA, gated before T-15', (tester) async {
      await tester.pumpWidget(_wrap(Scaffold(
        body: MeetingStatusCard(
          meeting: _meeting(status: MeetingStatus.confirmed, joinUrl: 'https://zoom.us/j/1'),
          now: DateTime(2026, 6, 16, 13, 0), // 90 minutes before start
        ),
      )));
      await tester.pump();
      expect(find.text('הפגישה אושרה'), findsOneWidget);
      expect(find.text('הצטרפות לפגישת Zoom'), findsOneWidget);
      expect(find.textContaining('15 דקות לפני'), findsOneWidget);
    });

    testWidgets('confirmed within T-15 drops the gating note', (tester) async {
      await tester.pumpWidget(_wrap(Scaffold(
        body: MeetingStatusCard(
          meeting: _meeting(status: MeetingStatus.confirmed, joinUrl: 'https://zoom.us/j/1'),
          now: DateTime(2026, 6, 16, 14, 20),
        ),
      )));
      await tester.pump();
      expect(find.textContaining('15 דקות לפני'), findsNothing);
    });

    testWidgets('no_rep offers picking a new slot', (tester) async {
      var picked = false;
      await tester.pumpWidget(_wrap(Scaffold(
        body: MeetingStatusCard(
          meeting: _meeting(status: MeetingStatus.noRep),
          onPickNewSlot: () => picked = true,
        ),
      )));
      await tester.pump();
      expect(find.textContaining('לא נמצא נציג זמין'), findsWidgets);
      await tester.tap(find.text('בחירת מועד חדש'));
      expect(picked, isTrue);
    });
  });

  group('Meeting wizard', () {
    testWidgets('renders the four steps and never offers Saturday', (tester) async {
      await tester.pumpWidget(_wrap(const MeetingWidget()));
      await tester.pump();

      expect(find.text('לאיזה ספק תרצו הצעת מחיר?'), findsOneWidget);
      expect(find.text('באיזה יום נוח לכם?'), findsOneWidget);
      expect(find.text('באיזו שעה?'), findsOneWidget);
      expect(find.text('פרטים לאישור הפגישה'), findsOneWidget);
      // No Saturday chip anywhere (ש׳ only appears for Saturday).
      expect(find.textContaining('יום ש׳'), findsNothing);

      await tester.pump(const Duration(seconds: 1)); // flush entrance animations
    });

    // Fills the three contact fields (name / phone / email) and selects the
    // first slot — the shared prelude for the OTP-gated submit tests below.
    Future<void> fillContactAndSlot(WidgetTester tester) async {
      await tester.ensureVisible(find.text('09:00').first);
      await tester.tap(find.text('09:00').first);
      await tester.pump();
      await tester.ensureVisible(find.byType(TextFormField).at(0));
      await tester.enterText(find.byType(TextFormField).at(0), 'ישראל ישראלי');
      await tester.enterText(find.byType(TextFormField).at(1), '0501234567');
      await tester.enterText(find.byType(TextFormField).at(2), 'test@example.com');
      await tester.pump();
    }

    // Clears every queued/visible SnackBar and pumps it off-screen so the
    // floating toast can't intercept a tap on the bottom CTA, and a later
    // validation SnackBar shows immediately instead of queuing.
    Future<void> clearSnackBars(WidgetTester tester) async {
      ScaffoldMessenger.of(tester.element(find.byType(MeetingWidget)))
          .clearSnackBars();
      await tester.pump();
    }

    // Runs the OTP gate (send code → enter 6 digits → verify). LocalBackend
    // accepts any address + any 6-digit code, so this exercises the real UI flow.
    Future<void> verifyEmail(WidgetTester tester) async {
      await tester.ensureVisible(find.text('שלח קוד אימות'));
      await tester.tap(find.text('שלח קוד אימות'));
      await tester.pumpAndSettle();
      // The 6-digit code field appears; enter a code and verify.
      await tester.ensureVisible(find.byKey(const Key('meeting-otp-code')));
      await tester.enterText(find.byKey(const Key('meeting-otp-code')), '123456');
      await tester.pump();
      await tester.ensureVisible(find.text('אימות'));
      await tester.tap(find.text('אימות'));
      await tester.pumpAndSettle();
      // Dismiss any lingering SnackBars (the floating "code sent" / "verified"
      // toasts sit over the bottom CTA and would otherwise eat the book tap).
      await clearSnackBars(tester);
    }

    testWidgets('book button is disabled until the email is verified', (tester) async {
      await tester.pumpWidget(_wrap(const MeetingWidget(provider: 'HOT')));
      await tester.pump(const Duration(seconds: 1));

      await fillContactAndSlot(tester);

      // Tick mandatory consent so only the OTP gate stands between us and book.
      final boxes = find.byType(Checkbox);
      await tester.ensureVisible(boxes.at(0));
      await tester.tap(boxes.at(0));
      await tester.tap(boxes.at(1));
      await tester.pump();

      // Tapping the (disabled) book button before verifying must NOT submit.
      await tester.ensureVisible(find.text('בקשו פגישת וידאו'));
      await tester.tap(find.text('בקשו פגישת וידאו'));
      await tester.pump();
      expect(backend.submittedMeetings, isEmpty);

      // After verifying, the same tap goes through.
      await verifyEmail(tester);
      await tester.ensureVisible(find.text('בקשו פגישת וידאו'));
      await tester.tap(find.text('בקשו פגישת וידאו'));
      await tester.pumpAndSettle();
      expect(backend.submittedMeetings, hasLength(1));
    });

    testWidgets('blocks submit without consent even after verifying', (tester) async {
      await tester.pumpWidget(_wrap(const MeetingWidget(provider: 'HOT')));
      await tester.pump(const Duration(seconds: 1));

      await fillContactAndSlot(tester);
      // Verify the email but leave consent UNticked.
      await verifyEmail(tester);

      await tester.ensureVisible(find.text('בקשו פגישת וידאו'));
      await tester.tap(find.text('בקשו פגישת וידאו'));
      await tester.pump(); // schedule the SnackBar
      await tester.pump(const Duration(milliseconds: 800)); // let it animate in
      expect(find.textContaining('יש לאשר את תנאי השימוש'), findsOneWidget);
      expect(backend.submittedMeetings, isEmpty);
      await tester.pump(const Duration(seconds: 4)); // let the snackbar expire
    });

    testWidgets('happy path: request → verify → book, flips to status and demo-confirms',
        (tester) async {
      await tester.pumpWidget(_wrap(const MeetingWidget(provider: 'HOT', source: 'plan')));
      await tester.pump(const Duration(seconds: 1));

      await fillContactAndSlot(tester);
      await verifyEmail(tester);

      // Tick mandatory consent (terms + privacy are the first two checkboxes).
      final boxes = find.byType(Checkbox);
      await tester.ensureVisible(boxes.at(0));
      await tester.tap(boxes.at(0));
      await tester.tap(boxes.at(1));
      await tester.pump();

      await tester.ensureVisible(find.text('בקשו פגישת וידאו'));
      await tester.tap(find.text('בקשו פגישת וידאו'));
      await tester.pumpAndSettle();

      expect(backend.submittedMeetings, hasLength(1));
      final m = backend.submittedMeetings.single;
      expect(m.provider, 'HOT');
      expect(m.slot, '09:00');
      expect(m.source, 'plan');
      expect(m.email, 'test@example.com');
      // The bookable grid starts tomorrow.
      final firstDate = bookableMeetingDates().first;
      expect(m.meetingDate, meetingDateIso(firstDate));

      // The screen flipped to the success/status view, and the demo rep
      // (LocalBackend, zero delay) already confirmed through the stream.
      expect(find.text('הבקשה התקבלה'), findsOneWidget);
      expect(find.text('הפגישה אושרה'), findsOneWidget);
      expect(AppState().bookedMeeting, isNotNull);
      expect(AppState().bookedMeeting!.status, MeetingStatus.confirmed);
    });
  });
}
