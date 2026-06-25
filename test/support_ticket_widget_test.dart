import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:chosech/app_state.dart';
import 'package:chosech/pages/support_ticket/support_ticket_widget.dart';

/// Widget tests for the in-page "open a ticket" compose flow
/// (lib/pages/support_ticket/support_ticket_widget.dart).
///
/// The chat view binds Supabase Realtime streams, which need a live client and
/// are exercised end-to-end (not here). What IS unit-testable — and is the new
/// surface — is the compose flow shown when the widget is launched with the
/// `'new'` sentinel: it touches NO network until the user submits, so we can
/// pump it in isolation and assert the issue-type picker, the message field,
/// the submit affordance, its a11y labels, and the empty-message validation.
Future<void> _pumpCompose(WidgetTester tester) async {
  GoogleFonts.config.allowRuntimeFetching = false;
  SharedPreferences.setMockInitialValues({});
  AppState.reset();
  // A tall surface so the whole compose form (picker + field + submit) is on
  // screen — Flutter prunes the semantics tree for off-screen content, so
  // find.bySemanticsLabel only resolves once a control is laid out on-screen.
  await tester.binding.setSurfaceSize(const Size(900, 1600));
  addTearDown(() => tester.binding.setSurfaceSize(null));
  await tester.pumpWidget(
    ChangeNotifierProvider<AppState>.value(
      value: AppState(),
      child: const MaterialApp(
        home: Directionality(
          textDirection: TextDirection.rtl,
          // The `'new'` sentinel drops straight into the compose flow without
          // ever constructing a SupportTicketService / touching Supabase.
          child: SupportTicketWidget(ticketId: 'new'),
        ),
      ),
    ),
  );
  // Let the staggered entrance animations (one-shot) play out.
  await tester.pump(const Duration(milliseconds: 400));
}

void main() {
  testWidgets('compose flow renders the picker, message field and submit',
      (tester) async {
    await _pumpCompose(tester);

    // App-bar title for the compose mode.
    expect(find.text('פתיחת פנייה'), findsOneWidget);

    // The issue-type picker section + every issue label.
    expect(find.text('על מה הפנייה?'), findsOneWidget);
    for (final label in ['התוכנית שלי', 'חיוב וחשבונית', 'מעבר ספק', 'תקלה טכנית', 'אחר']) {
      expect(find.text(label), findsOneWidget, reason: 'missing issue chip: $label');
    }

    // The free-text first-message field + section header.
    expect(find.text('פרטו בקצרה'), findsOneWidget);
    expect(find.byType(TextField), findsOneWidget);

    // The submit affordance (visible label).
    expect(find.text('פתחו פנייה'), findsOneWidget);

    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
  });

  testWidgets('submit affordance and issue chips carry a11y labels',
      (tester) async {
    final handle = tester.ensureSemantics();
    await _pumpCompose(tester);
    // Drain the one-shot entrance animations: flutter_animate renders the
    // animated nodes (the intro + each chip) at opacity 0 mid-flight, and
    // Flutter prunes those from the semantics tree until they settle.
    await tester.pumpAndSettle();

    // The submit button's Semantics label.
    expect(find.bySemanticsLabel('פתיחת פנייה ושליחה'), findsOneWidget);
    // Each issue chip is a labelled Semantics button (excludeSemantics collapses
    // the inner icon + text into a single labelled node).
    expect(find.bySemanticsLabel('מעבר ספק'), findsOneWidget);
    expect(find.bySemanticsLabel('תקלה טכנית'), findsOneWidget);

    expect(tester.takeException(), isNull);
    handle.dispose();
  });

  testWidgets('submitting with an empty message shows a validation error',
      (tester) async {
    await _pumpCompose(tester);

    // Tap submit with the message field still empty — no network call, just a
    // local validation message (we never reach Supabase).
    await tester.tap(find.text('פתחו פנייה'));
    await tester.pump(const Duration(milliseconds: 200));

    expect(find.text('כתבו לנו במה נוכל לעזור לפני השליחה.'), findsOneWidget);

    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
  });

  testWidgets('typing clears a stale validation error', (tester) async {
    await _pumpCompose(tester);

    // Trigger the empty-message error first.
    await tester.tap(find.text('פתחו פנייה'));
    await tester.pump(const Duration(milliseconds: 200));
    expect(find.text('כתבו לנו במה נוכל לעזור לפני השליחה.'), findsOneWidget);

    // Typing in the field should clear it.
    await tester.enterText(find.byType(TextField), 'שלום, יש לי שאלה');
    await tester.pump(const Duration(milliseconds: 200));
    expect(find.text('כתבו לנו במה נוכל לעזור לפני השליחה.'), findsNothing);

    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
  });

  testWidgets('an issue chip can be selected and toggled without error',
      (tester) async {
    await _pumpCompose(tester);

    // Select an issue type, then a still-valid message, then toggle the chip
    // back off — exercising the picker's onTap branch in both directions.
    await tester.tap(find.text('תקלה טכנית'));
    await tester.pump(const Duration(milliseconds: 200));
    expect(find.text('תקלה טכנית'), findsOneWidget);

    await tester.tap(find.text('תקלה טכנית'));
    await tester.pump(const Duration(milliseconds: 200));
    expect(find.text('תקלה טכנית'), findsOneWidget);

    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
  });
}
