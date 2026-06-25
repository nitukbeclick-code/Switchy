import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:chosech/widgets/pressable.dart';

Widget _wrap(Widget child, {bool reduceMotion = false}) => MaterialApp(
      home: Directionality(
        textDirection: TextDirection.rtl,
        child: MediaQuery(
          data: MediaQueryData(disableAnimations: reduceMotion),
          child: Scaffold(body: Center(child: child)),
        ),
      ),
    );

void main() {
  GoogleFonts.config.allowRuntimeFetching = false;

  testWidgets('renders its child', (tester) async {
    await tester.pumpWidget(_wrap(
      const Pressable(child: Text('לחיץ')),
    ));
    expect(find.text('לחיץ'), findsOneWidget);
    expect(find.byType(AnimatedScale), findsOneWidget);
  });

  testWidgets('fires onTap when tapped', (tester) async {
    var taps = 0;
    await tester.pumpWidget(_wrap(
      Pressable(
        onTap: () => taps++,
        child: const Text('הקש'),
      ),
    ));
    await tester.tap(find.text('הקש'));
    await tester.pump();
    expect(taps, 1);
  });

  testWidgets('fires onLongPress when long-pressed', (tester) async {
    var longPresses = 0;
    await tester.pumpWidget(_wrap(
      Pressable(
        onLongPress: () => longPresses++,
        child: const Text('החזק'),
      ),
    ));
    await tester.longPress(find.text('החזק'));
    await tester.pump();
    expect(longPresses, 1);
  });

  testWidgets('scales down to pressedScale on tap-down', (tester) async {
    await tester.pumpWidget(_wrap(
      const Pressable(scale: 0.8, child: Text('לחץ')),
    ));

    // At rest the scale is 1.0.
    expect(
      tester.widget<AnimatedScale>(find.byType(AnimatedScale)).scale,
      1.0,
    );

    final gesture = await tester.startGesture(tester.getCenter(find.text('לחץ')));
    await tester.pump();
    expect(
      tester.widget<AnimatedScale>(find.byType(AnimatedScale)).scale,
      0.8,
    );

    await gesture.up();
    await tester.pump();
    expect(
      tester.widget<AnimatedScale>(find.byType(AnimatedScale)).scale,
      1.0,
    );
  });

  testWidgets('honours reduced-motion by skipping the scale', (tester) async {
    await tester.pumpWidget(_wrap(
      const Pressable(scale: 0.8, child: Text('נגיש')),
      reduceMotion: true,
    ));

    final gesture = await tester.startGesture(tester.getCenter(find.text('נגיש')));
    await tester.pump();
    // With animations disabled the pressed scale stays at 1.0.
    expect(
      tester.widget<AnimatedScale>(find.byType(AnimatedScale)).scale,
      1.0,
    );
    await gesture.up();
  });
}
