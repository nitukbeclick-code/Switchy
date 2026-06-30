import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:chosech/widgets/consent_panel.dart';

/// Widget tests for [ConsentPanel] — the shared legal-consent block (terms +
/// privacy mandatory, marketing opt-in) used before any contact-capture submit.
/// The panel is a pure [StatelessWidget] (no AppState), so it only needs a
/// MaterialApp + RTL [Directionality] wrapper for [AppTheme.of].
Widget _wrap(Widget child) => MaterialApp(
      home: Directionality(
        textDirection: TextDirection.rtl,
        child: Scaffold(body: SingleChildScrollView(child: child)),
      ),
    );

ConsentPanel _panel({
  bool terms = false,
  bool privacy = false,
  bool marketing = false,
  ValueChanged<bool>? onTerms,
  ValueChanged<bool>? onPrivacy,
  ValueChanged<bool>? onMarketing,
}) =>
    ConsentPanel(
      acceptTerms: terms,
      acceptPrivacy: privacy,
      acceptMarketing: marketing,
      onTermsChanged: onTerms ?? (_) {},
      onPrivacyChanged: onPrivacy ?? (_) {},
      onMarketingChanged: onMarketing ?? (_) {},
    );

void main() {
  GoogleFonts.config.allowRuntimeFetching = false;

  testWidgets('renders the three consent rows with legal-link semantics',
      (tester) async {
    await tester.pumpWidget(_wrap(_panel()));
    await tester.pump();

    // Three checkboxes: terms, privacy, marketing.
    expect(find.byType(Checkbox), findsNWidgets(3));

    // Each row is now a single screen-reader-toggleable node whose label is the
    // FULL consent sentence (lead + legal-link words), so the §30A/§7b wording
    // is announced verbatim.
    expect(find.bySemanticsLabel('קראתי ואני מסכים/ה לתנאי השימוש'),
        findsOneWidget);
    expect(find.bySemanticsLabel('קראתי ואני מסכים/ה למדיניות הפרטיות'),
        findsOneWidget);

    // The optional marketing row is plain copy (no legal link).
    expect(find.textContaining('דיוור שיווקי'), findsOneWidget);
  });

  testWidgets('each consent row exposes a checkable, button semantics node',
      (tester) async {
    await tester.pumpWidget(_wrap(_panel(terms: true)));
    await tester.pump();

    // The terms row's semantics node reflects the checked state and is a button,
    // so VoiceOver/TalkBack announce it as a checkable consent control.
    final node = tester.getSemantics(
        find.bySemanticsLabel('קראתי ואני מסכים/ה לתנאי השימוש'));
    expect(node.flagsCollection.isButton, isTrue);
    // `isChecked` is a tri-state CheckedState enum (true/false/none); assert the
    // checked state without importing the dart:ui enum name directly.
    expect(node.flagsCollection.isChecked.toString(), contains('isTrue'));
  });

  testWidgets('tapping the marketing row body toggles only that row\'s consent',
      (tester) async {
    var termsCalls = 0;
    var privacyCalls = 0;
    bool? marketing;
    await tester.pumpWidget(_wrap(_panel(
      onTerms: (_) => termsCalls++,
      onPrivacy: (_) => privacyCalls++,
      onMarketing: (v) => marketing = v,
    )));
    await tester.pump();

    // The marketing row has no legal link, so its whole body is the >=44px
    // toggle target. Tapping the copy flips marketing on and fires nothing else.
    await tester.tap(find.textContaining('דיוור שיווקי'));
    await tester.pump();

    expect(marketing, isTrue);
    expect(termsCalls, 0);
    expect(privacyCalls, 0);
  });

  testWidgets('reflects checked state from props', (tester) async {
    await tester.pumpWidget(_wrap(_panel(terms: true)));
    await tester.pump();

    final boxes = tester.widgetList<Checkbox>(find.byType(Checkbox)).toList();
    // First row is terms — checked; the other two default to unchecked.
    expect(boxes[0].value, isTrue);
    expect(boxes[1].value, isFalse);
    expect(boxes[2].value, isFalse);
  });

  testWidgets('toggling a checkbox fires only its own callback', (tester) async {
    bool? terms;
    var privacyCalls = 0;
    var marketingCalls = 0;
    await tester.pumpWidget(_wrap(_panel(
      onTerms: (v) => terms = v,
      onPrivacy: (_) => privacyCalls++,
      onMarketing: (_) => marketingCalls++,
    )));
    await tester.pump();

    await tester.tap(find.byType(Checkbox).first);
    await tester.pump();

    expect(terms, isTrue);
    expect(privacyCalls, 0);
    expect(marketingCalls, 0);
  });
}
