import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:chosech/widgets/whatsapp_button.dart';
import 'package:chosech/widgets/app_button.dart';

/// Widget tests for [WhatsAppButton] — the reusable "דברו איתנו בוואטסאפ"
/// call-to-action. It is an [AppButton] under the hood wrapped in a labelled
/// [Semantics] node, so the tests assert the rendered label, the icon, the
/// accessibility contract, and the extra [onTap] side-effect callback.
///
/// Note: the underlying link launch (`canLaunchUrl`/`Share.share`) is a no-op /
/// caught path in the test environment, so tapping never opens anything — we
/// only assert the synchronous side effect the widget owns.
Widget _wrap(Widget child) => MaterialApp(
      home: Directionality(
        textDirection: TextDirection.rtl,
        child: Scaffold(body: Center(child: child)),
      ),
    );

void main() {
  GoogleFonts.config.allowRuntimeFetching = false;

  testWidgets('renders the default Hebrew CTA as a labelled, iconed AppButton',
      (tester) async {
    await tester.pumpWidget(_wrap(const WhatsAppButton()));
    await tester.pump();

    // Default Hebrew copy is rendered.
    expect(find.text('דברו איתנו בוואטסאפ'), findsOneWidget);
    // It delegates to the shared primary CTA.
    expect(find.byType(AppButton), findsOneWidget);
    // The WhatsApp chat icon is shown before the label.
    expect(find.byIcon(Icons.chat_rounded), findsOneWidget);
  });

  testWidgets('exposes a button Semantics node carrying the label',
      (tester) async {
    await tester.pumpWidget(_wrap(const WhatsAppButton()));
    await tester.pump();

    // Icon-only-ish CTA must announce itself to assistive tech with its label.
    expect(find.bySemanticsLabel('דברו איתנו בוואטסאפ'), findsWidgets);

    final semantics = tester.getSemantics(
      find.bySemanticsLabel('דברו איתנו בוואטסאפ').first,
    );
    expect(semantics.flagsCollection.isButton, isTrue);
  });

  testWidgets('honours a custom label', (tester) async {
    await tester.pumpWidget(_wrap(
      const WhatsAppButton(label: 'דברו עם נציג'),
    ));
    await tester.pump();

    expect(find.text('דברו עם נציג'), findsOneWidget);
    expect(find.text('דברו איתנו בוואטסאפ'), findsNothing);
  });

  testWidgets('fires the optional onTap side-effect when pressed',
      (tester) async {
    var tapped = 0;
    await tester.pumpWidget(_wrap(
      WhatsAppButton(onTap: () => tapped++),
    ));
    await tester.pump();

    await tester.tap(find.byType(AppButton));
    // onTap is invoked synchronously at the top of _open(), before the
    // (no-op / caught) async launch path — so a single frame is enough. We
    // avoid pumpAndSettle here because the busy spinner keeps animating while
    // the platform launch is unresolved in the test environment.
    await tester.pump();

    expect(tapped, 1);
  });
}
