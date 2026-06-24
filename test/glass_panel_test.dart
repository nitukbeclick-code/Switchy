import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:chosech/widgets/glass_panel.dart';

/// Pumps [child] inside a minimal MaterialApp so [AppTheme.of] resolves.
Future<void> _pump(
  WidgetTester tester,
  Widget child, {
  Brightness brightness = Brightness.light,
}) {
  return tester.pumpWidget(
    MaterialApp(
      theme: ThemeData(brightness: brightness),
      home: Directionality(
        textDirection: TextDirection.rtl,
        child: Scaffold(body: Center(child: child)),
      ),
    ),
  );
}

void main() {
  group('GlassPanel', () {
    testWidgets('renders its child and clips to a rounded rect', (tester) async {
      await _pump(
        tester,
        const GlassPanel(child: Text('שלום')),
      );

      // Child is rendered through the glass surface.
      expect(find.text('שלום'), findsOneWidget);
      // The surface is always clipped to a rounded rectangle.
      expect(find.byType(ClipRRect), findsOneWidget);
    });

    testWidgets('uses a live BackdropFilter on real-glass platforms',
        (tester) async {
      debugDefaultTargetPlatformOverride = TargetPlatform.iOS;
      addTearDown(() => debugDefaultTargetPlatformOverride = null);

      await _pump(tester, const GlassPanel(child: SizedBox.shrink()));

      // iOS is a real-glass platform -> a live blur is spent.
      expect(find.byType(BackdropFilter), findsOneWidget);
    });

    testWidgets('falls back to a solid fill (no BackdropFilter) on weak platforms',
        (tester) async {
      // Fuchsia is the one platform where realGlass is false.
      debugDefaultTargetPlatformOverride = TargetPlatform.fuchsia;
      addTearDown(() => debugDefaultTargetPlatformOverride = null);

      await _pump(tester, const GlassPanel(child: Text('סולידי')));

      expect(find.text('סולידי'), findsOneWidget);
      // The solid fallback must NOT pay the GPU cost of a live blur.
      expect(find.byType(BackdropFilter), findsNothing);
      expect(find.byType(ClipRRect), findsOneWidget);
    });

    testWidgets('omits the hairline border when border:false', (tester) async {
      // Force the solid path so the border lives on a single, findable Container.
      debugDefaultTargetPlatformOverride = TargetPlatform.fuchsia;
      addTearDown(() => debugDefaultTargetPlatformOverride = null);

      await _pump(
        tester,
        const GlassPanel(border: false, child: Text('ללא מסגרת')),
      );

      final decorated = tester.widgetList<Container>(find.byType(Container));
      final hasBorder = decorated.any((c) {
        final d = c.decoration;
        return d is BoxDecoration && d.border != null;
      });
      expect(hasBorder, isFalse);
    });

    testWidgets('honours a custom tint on the solid fallback fill',
        (tester) async {
      debugDefaultTargetPlatformOverride = TargetPlatform.fuchsia;
      addTearDown(() => debugDefaultTargetPlatformOverride = null);

      const tint = Color(0xFF112233);
      await _pump(
        tester,
        const GlassPanel(tint: tint, child: SizedBox.shrink()),
      );

      final decorated = tester.widgetList<Container>(find.byType(Container));
      final tinted = decorated.any((c) {
        final d = c.decoration;
        if (d is! BoxDecoration) return false;
        final fill = d.color;
        // The fallback fills with the tint at an alpha derived from `alpha`.
        return fill != null &&
            (fill.r - tint.r).abs() < 0.001 &&
            (fill.g - tint.g).abs() < 0.001 &&
            (fill.b - tint.b).abs() < 0.001;
      });
      expect(tinted, isTrue);
    });
  });
}
