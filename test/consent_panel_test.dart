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

    // Mandatory legal links carry tappable Semantics labels.
    expect(find.bySemanticsLabel('פתח תנאי השימוש'), findsOneWidget);
    expect(find.bySemanticsLabel('פתח מדיניות הפרטיות'), findsOneWidget);

    // The optional marketing row is plain copy (no legal link).
    expect(find.textContaining('דיוור שיווקי'), findsOneWidget);
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
