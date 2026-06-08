import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:chosech/widgets/app_button.dart';

void main() {
  // Helper: wrap AppButton in the minimal required ancestor widgets.
  Widget buildButton({
    required String text,
    required Future<void> Function() onPressed,
    Color color = Colors.green,
    Widget? icon,
    double? width,
  }) {
    return MaterialApp(
      home: Scaffold(
        body: Center(
          child: AppButton(
            text: text,
            onPressed: onPressed,
            color: color,
            icon: icon,
            width: width,
          ),
        ),
      ),
    );
  }

  // ── Text rendering ──────────────────────────────────────────────────────────

  group('text rendering', () {
    testWidgets('renders the provided label text', (tester) async {
      await tester.pumpWidget(buildButton(
        text: 'לחץ כאן',
        onPressed: () async {},
      ));
      expect(find.text('לחץ כאן'), findsOneWidget);
    });

    testWidgets('renders an AppButton with icon and text', (tester) async {
      await tester.pumpWidget(buildButton(
        text: 'עם אייקון',
        onPressed: () async {},
        icon: const Icon(Icons.star),
      ));
      expect(find.text('עם אייקון'), findsOneWidget);
      expect(find.byIcon(Icons.star), findsOneWidget);
    });
  });

  // ── onPressed invocation ────────────────────────────────────────────────────

  group('onPressed callback', () {
    testWidgets('calls onPressed once when tapped', (tester) async {
      var callCount = 0;
      await tester.pumpWidget(buildButton(
        text: 'לחץ',
        onPressed: () async { callCount++; },
      ));
      await tester.tap(find.byType(AppButton));
      await tester.pumpAndSettle();
      expect(callCount, equals(1));
    });

    testWidgets('does not call onPressed a second time while loading', (tester) async {
      final completer = Completer<void>();
      var callCount = 0;

      await tester.pumpWidget(buildButton(
        text: 'לחץ',
        onPressed: () async {
          callCount++;
          await completer.future;
        },
      ));

      // First tap — starts the async operation
      await tester.tap(find.byType(AppButton));
      await tester.pump(); // begin frame so _loading = true

      // Second tap while still loading — should be ignored
      await tester.tap(find.byType(AppButton));
      await tester.pump();

      expect(callCount, equals(1));

      // Clean up
      completer.complete();
      await tester.pumpAndSettle();
    });
  });

  // ── Loading spinner ─────────────────────────────────────────────────────────

  group('loading state', () {
    testWidgets('shows CircularProgressIndicator while future is pending', (tester) async {
      final completer = Completer<void>();

      await tester.pumpWidget(buildButton(
        text: 'לחץ',
        onPressed: () => completer.future,
      ));

      // Tap to trigger loading
      await tester.tap(find.byType(AppButton));
      await tester.pump(); // allow setState to fire

      expect(find.byType(CircularProgressIndicator), findsOneWidget);
      expect(find.text('לחץ'), findsNothing);

      // Complete the future and verify spinner disappears
      completer.complete();
      await tester.pumpAndSettle();

      expect(find.byType(CircularProgressIndicator), findsNothing);
      expect(find.text('לחץ'), findsOneWidget);
    });

    testWidgets('button is disabled (onPressed = null) while loading', (tester) async {
      final completer = Completer<void>();

      await tester.pumpWidget(buildButton(
        text: 'לחץ',
        onPressed: () => completer.future,
      ));

      await tester.tap(find.byType(AppButton));
      await tester.pump();

      final elevatedButton = tester.widget<ElevatedButton>(find.byType(ElevatedButton));
      expect(elevatedButton.onPressed, isNull);

      completer.complete();
      await tester.pumpAndSettle();
    });
  });

  // ── Appearance ──────────────────────────────────────────────────────────────

  group('appearance', () {
    testWidgets('respects the width parameter when provided', (tester) async {
      await tester.pumpWidget(buildButton(
        text: 'לחץ',
        onPressed: () async {},
        width: 200,
      ));
      final sizeBox = tester.widget<SizedBox>(
        find.ancestor(of: find.byType(ElevatedButton), matching: find.byType(SizedBox)).first,
      );
      expect(sizeBox.width, equals(200));
    });

    testWidgets('default height is 52', (tester) async {
      await tester.pumpWidget(buildButton(
        text: 'לחץ',
        onPressed: () async {},
        width: 200, // give it a width so SizedBox has definite size
      ));
      final sizeBox = tester.widget<SizedBox>(
        find.ancestor(of: find.byType(ElevatedButton), matching: find.byType(SizedBox)).first,
      );
      expect(sizeBox.height, equals(52));
    });
  });
}
