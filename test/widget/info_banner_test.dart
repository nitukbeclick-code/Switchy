import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:chosech/widgets/info_banner.dart';

Widget _wrap(Widget child) => MaterialApp(
      home: Directionality(
        textDirection: TextDirection.rtl,
        child: Scaffold(body: child),
      ),
    );

void main() {
  GoogleFonts.config.allowRuntimeFetching = false;

  testWidgets('renders title and subtitle', (tester) async {
    await tester.pumpWidget(_wrap(
      const InfoBanner(
        title: 'כותרת באנר',
        subtitle: 'תת-כותרת',
      ),
    ));
    expect(find.text('כותרת באנר'), findsOneWidget);
    expect(find.text('תת-כותרת'), findsOneWidget);
  });

  testWidgets('renders an icon when provided', (tester) async {
    await tester.pumpWidget(_wrap(
      const InfoBanner(
        title: 'עם אייקון',
        icon: Icons.info_outline_rounded,
      ),
    ));
    expect(find.byIcon(Icons.info_outline_rounded), findsOneWidget);
  });

  testWidgets('renders an emoji when provided', (tester) async {
    await tester.pumpWidget(_wrap(
      const InfoBanner(
        title: 'עם אמוג׳י',
        emoji: '💡',
      ),
    ));
    expect(find.text('💡'), findsOneWidget);
  });
}
