import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:chosech/widgets/app_card.dart';

Widget _wrap(Widget child) => MaterialApp(
      home: Directionality(
        textDirection: TextDirection.rtl,
        child: Scaffold(body: child),
      ),
    );

void main() {
  GoogleFonts.config.allowRuntimeFetching = false;

  testWidgets('renders its child', (tester) async {
    await tester.pumpWidget(_wrap(
      const AppCard(child: Text('תוכן בכרטיס')),
    ));
    expect(find.text('תוכן בכרטיס'), findsOneWidget);
  });

  testWidgets('fires onTap when tapped and onTap is provided', (tester) async {
    bool tapped = false;
    await tester.pumpWidget(_wrap(
      AppCard(
        onTap: () => tapped = true,
        child: const Text('לחיצה'),
      ),
    ));
    await tester.tap(find.text('לחיצה'));
    await tester.pump();
    expect(tapped, isTrue);
  });

  testWidgets('builds without onTap without throwing', (tester) async {
    await tester.pumpWidget(_wrap(
      const AppCard(child: Text('ללא לחיצה')),
    ));
    expect(find.byType(AppCard), findsOneWidget);
  });
}
