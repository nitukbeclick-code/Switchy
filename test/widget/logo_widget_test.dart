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

  // The rendered asset path for the current LogoWidget. Image.asset with a
  // cacheWidth wraps its AssetImage in a ResizeImage — unwrap before reading.
  String assetOf(WidgetTester tester) {
    final img = tester.widget<Image>(find.byType(Image));
    ImageProvider provider = img.image;
    if (provider is ResizeImage) provider = provider.imageProvider;
    return (provider as AssetImage).assetName;
  }

  testWidgets('bare הוט resolves to the HOT logo, not HOT Mobile', (tester) async {
    // Regression: the substring scan let 'הוט מובייל' reverse-match the bare
    // input 'הוט' (key.contains(provider)); the exact-match pass must win.
    await tester.pumpWidget(_wrap(const LogoWidget(provider: 'הוט')));
    expect(assetOf(tester), 'assets/providers/hot.png');
  });

  testWidgets('הוט מובייל still resolves to the HOT Mobile logo', (tester) async {
    await tester.pumpWidget(_wrap(const LogoWidget(provider: 'הוט מובייל')));
    expect(assetOf(tester), 'assets/providers/hot-mobile.png');
  });

  testWidgets('בזק resolves to the webp brand asset', (tester) async {
    // Regression for the bezeq.png -> bezeq.webp swap (the .png was cropped).
    await tester.pumpWidget(_wrap(const LogoWidget(provider: 'בזק')));
    expect(assetOf(tester), 'assets/providers/bezeq.webp');
  });
}
