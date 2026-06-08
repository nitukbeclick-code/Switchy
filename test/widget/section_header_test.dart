import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:chosech/widgets/section_header.dart';

Widget _wrap(Widget child) => MaterialApp(
      home: Directionality(
        textDirection: TextDirection.rtl,
        child: Scaffold(body: child),
      ),
    );

void main() {
  GoogleFonts.config.allowRuntimeFetching = false;

  testWidgets('renders the title', (tester) async {
    await tester.pumpWidget(_wrap(
      const SectionHeader(title: 'כותרת מבחן'),
    ));
    expect(find.text('כותרת מבחן'), findsOneWidget);
  });

  testWidgets('renders trailing label and fires onTrailingTap when tapped', (tester) async {
    bool tapped = false;
    await tester.pumpWidget(_wrap(
      SectionHeader(
        title: 'כותרת',
        trailingLabel: 'הכל',
        onTrailingTap: () => tapped = true,
      ),
    ));
    expect(find.text('הכל'), findsOneWidget);
    await tester.tap(find.text('הכל'));
    await tester.pump();
    expect(tapped, isTrue);
  });

  testWidgets('renders emoji when provided', (tester) async {
    await tester.pumpWidget(_wrap(
      const SectionHeader(title: 'כותרת', emoji: '💬'),
    ));
    expect(find.text('💬'), findsOneWidget);
  });
}
