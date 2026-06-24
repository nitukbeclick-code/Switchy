import 'package:chosech/widgets/skeleton.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shimmer/shimmer.dart';

/// Wraps [child] in the minimal ambient widgets the skeleton primitives read
/// from: a [MaterialApp] (so `AppTheme.of` resolves the ambient theme), an RTL
/// [Directionality], and a [MediaQuery] whose `disableAnimations` can be toggled
/// to drive the reduced-motion branch of [SkeletonShimmer].
Future<void> _pump(
  WidgetTester tester,
  Widget child, {
  Brightness brightness = Brightness.light,
  bool reduceMotion = false,
  TextDirection direction = TextDirection.rtl,
}) async {
  await tester.pumpWidget(
    MaterialApp(
      theme: ThemeData(brightness: brightness),
      home: MediaQuery(
        data: MediaQueryData(disableAnimations: reduceMotion),
        child: Directionality(
          textDirection: direction,
          child: Scaffold(body: child),
        ),
      ),
    ),
  );
}

void main() {
  group('SkeletonBox', () {
    testWidgets('renders a rounded container with the given dimensions',
        (tester) async {
      await _pump(tester, const SkeletonBox(width: 120, height: 20, radius: 10));

      final container = tester.widget<Container>(find.byType(Container));
      expect(container.constraints?.maxWidth, 120);
      expect(container.constraints?.maxHeight, 20);

      final decoration = container.decoration as BoxDecoration;
      expect(decoration.borderRadius, BorderRadius.circular(10));
    });

    testWidgets('uses a white base on light and a slate base on dark',
        (tester) async {
      await _pump(tester, const SkeletonBox(), brightness: Brightness.light);
      var decoration =
          tester.widget<Container>(find.byType(Container)).decoration
              as BoxDecoration;
      expect(decoration.color, Colors.white);

      await _pump(tester, const SkeletonBox(), brightness: Brightness.dark);
      decoration = tester.widget<Container>(find.byType(Container)).decoration
          as BoxDecoration;
      expect(decoration.color, const Color(0xFF222A38)); // dark slate, not white
    });
  });

  group('SkeletonShimmer', () {
    testWidgets('sweeps right-to-left under RTL', (tester) async {
      await _pump(
        tester,
        const SkeletonShimmer(child: SkeletonBox()),
        direction: TextDirection.rtl,
      );

      final shimmer = tester.widget<Shimmer>(find.byType(Shimmer));
      expect(shimmer.direction, ShimmerDirection.rtl);
    });

    testWidgets('sweeps left-to-right under LTR', (tester) async {
      await _pump(
        tester,
        const SkeletonShimmer(child: SkeletonBox()),
        direction: TextDirection.ltr,
      );

      final shimmer = tester.widget<Shimmer>(find.byType(Shimmer));
      expect(shimmer.direction, ShimmerDirection.ltr);
    });

    testWidgets('renders the child without a Shimmer under reduced motion',
        (tester) async {
      await _pump(
        tester,
        const SkeletonShimmer(child: SkeletonBox()),
        reduceMotion: true,
      );

      expect(find.byType(Shimmer), findsNothing); // static base wash, no sweep
      expect(find.byType(SkeletonBox), findsOneWidget); // child still shown
    });
  });

  group('SkeletonPostCard', () {
    testWidgets('renders a shimmering ghost made of skeleton boxes',
        (tester) async {
      await _pump(tester, const SkeletonPostCard());

      expect(find.byType(SkeletonShimmer), findsOneWidget);
      expect(find.byType(Shimmer), findsOneWidget);
      // avatar + two header lines + three body lines
      expect(find.byType(SkeletonBox), findsNWidgets(6));
    });
  });
}
