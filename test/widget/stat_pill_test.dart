import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:chosech/widgets/stat_pill.dart';

Widget _wrap(Widget child) => MaterialApp(
      home: Directionality(
        textDirection: TextDirection.rtl,
        child: Scaffold(body: child),
      ),
    );

void main() {
  GoogleFonts.config.allowRuntimeFetching = false;

  testWidgets('renders value and label', (tester) async {
    await tester.pumpWidget(_wrap(
      const StatPill(value: '₪850', label: 'לשנה'),
    ));
    expect(find.text('₪850'), findsOneWidget);
    expect(find.text('לשנה'), findsOneWidget);
  });

  testWidgets('renders with custom colors without throwing', (tester) async {
    await tester.pumpWidget(_wrap(
      const StatPill(
        value: '20',
        label: 'תוכניות',
        backgroundColor: Colors.blue,
        textColor: Colors.white,
      ),
    ));
    expect(find.byType(StatPill), findsOneWidget);
  });
}
