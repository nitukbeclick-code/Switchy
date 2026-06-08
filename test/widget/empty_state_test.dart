import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:chosech/widgets/empty_state.dart';

Widget _wrap(Widget child) => MaterialApp(
      home: Directionality(
        textDirection: TextDirection.rtl,
        child: Scaffold(body: child),
      ),
    );

void main() {
  GoogleFonts.config.allowRuntimeFetching = false;

  testWidgets('renders icon, headline and subtitle', (tester) async {
    await tester.pumpWidget(_wrap(
      const EmptyState(
        icon: Icons.inbox_rounded,
        headline: 'אין תוצאות',
        subtitle: 'נסה שנית מאוחר יותר',
      ),
    ));
    expect(find.byIcon(Icons.inbox_rounded), findsOneWidget);
    expect(find.text('אין תוצאות'), findsOneWidget);
    expect(find.text('נסה שנית מאוחר יותר'), findsOneWidget);
  });

  testWidgets('renders CTA button and fires callback when tapped', (tester) async {
    bool called = false;
    await tester.pumpWidget(_wrap(
      EmptyState(
        icon: Icons.search_off_rounded,
        headline: 'ריק',
        subtitle: 'אין פריטים',
        ctaLabel: 'נסה שוב',
        onCtaTap: () async => called = true,
      ),
    ));
    expect(find.text('נסה שוב'), findsOneWidget);
    await tester.tap(find.text('נסה שוב'));
    await tester.pumpAndSettle();
    expect(called, isTrue);
  });

  testWidgets('assert is NOT triggered when ctaLabel is null and onCtaTap is null', (tester) async {
    // Normal use — no CTA: no assertion should fire.
    await tester.pumpWidget(_wrap(
      const EmptyState(
        icon: Icons.inbox_rounded,
        headline: 'כותרת',
        subtitle: 'תת-כותרת',
      ),
    ));
    expect(find.byType(EmptyState), findsOneWidget);
  });
}
