import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:chosech/components/logo_widget/logo_widget.dart';

Widget _wrap(Widget child) => MaterialApp(
      home: Directionality(
        textDirection: TextDirection.rtl,
        child: Scaffold(body: child),
      ),
    );

void main() {
  GoogleFonts.config.allowRuntimeFetching = false;

  testWidgets('builds without exception for a known Hebrew provider', (tester) async {
    await tester.pumpWidget(_wrap(
      const LogoWidget(provider: 'פלאפון'),
    ));
    expect(find.byType(LogoWidget), findsOneWidget);
  });

  testWidgets('builds without exception for an English provider', (tester) async {
    await tester.pumpWidget(_wrap(
      const LogoWidget(provider: 'Airalo'),
    ));
    expect(find.byType(LogoWidget), findsOneWidget);
  });

  testWidgets('builds with custom size', (tester) async {
    await tester.pumpWidget(_wrap(
      const LogoWidget(provider: 'סלקום', size: 60),
    ));
    expect(find.byType(LogoWidget), findsOneWidget);
  });

  testWidgets('shows initials text for a provider without a logo asset', (tester) async {
    // An unmapped provider falls back to the coloured initials badge.
    await tester.pumpWidget(_wrap(
      const LogoWidget(provider: 'מובייל טסט'),
    ));
    expect(find.byType(Text), findsAtLeast(1));
    expect(find.byType(LogoWidget), findsOneWidget);
  });

  testWidgets('renders the real logo image for a known provider', (tester) async {
    // A mapped provider renders its brand logo from assets/providers/.
    await tester.pumpWidget(_wrap(
      const LogoWidget(provider: 'פלאפון'),
    ));
    expect(find.byType(Image), findsOneWidget);
    expect(find.byType(LogoWidget), findsOneWidget);
  });
}
