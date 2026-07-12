import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:chosech/services/review_prompt.dart';

/// Pure-logic tests for [maybeAskForReview] — the one-shot in-app review
/// prompt. The `in_app_review` plugin talks over the
/// `dev.britannio.in_app_review` method channel, which we script per test, so
/// the once-ever flag + fail-soft guarantees are pinned without any widgets.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  const channel = MethodChannel('dev.britannio.in_app_review');
  final calls = <String>[];

  /// Script the plugin channel: [available] answers `isAvailable`;
  /// a null [available] makes every call throw (plugin missing).
  void mockChannel({bool? available}) {
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(channel, (call) async {
      calls.add(call.method);
      if (available == null) {
        throw PlatformException(code: 'unavailable', message: 'no plugin');
      }
      if (call.method == 'isAvailable') return available;
      return null; // requestReview
    });
  }

  setUp(() {
    calls.clear();
    SharedPreferences.setMockInitialValues({});
  });

  tearDown(() {
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(channel, null);
  });

  test('asks exactly once when the OS sheet is available', () async {
    mockChannel(available: true);
    await maybeAskForReview();
    expect(calls, ['isAvailable', 'requestReview']);

    // The persisted once-flag was burned…
    final prefs = await SharedPreferences.getInstance();
    expect(prefs.getBool('askedForReview'), isTrue);

    // …so every later call is a cheap no-op (never asks twice).
    calls.clear();
    await maybeAskForReview();
    expect(calls, isEmpty);
  });

  test('the persisted flag short-circuits before touching the plugin',
      () async {
    SharedPreferences.setMockInitialValues({'askedForReview': true});
    mockChannel(available: true);
    await maybeAskForReview();
    expect(calls, isEmpty);
  });

  test('an unavailable platform does not burn the once-flag', () async {
    mockChannel(available: false);
    await maybeAskForReview();
    expect(calls, ['isAvailable']); // checked, never requested

    final prefs = await SharedPreferences.getInstance();
    expect(prefs.getBool('askedForReview'), isNull);

    // A later call on a platform where the sheet became available still asks.
    calls.clear();
    mockChannel(available: true);
    await maybeAskForReview();
    expect(calls, ['isAvailable', 'requestReview']);
    expect(prefs.getBool('askedForReview'), isTrue);
  });

  test('a plugin error is swallowed (fail-soft) and keeps the flag intact',
      () async {
    mockChannel(available: null); // every channel call throws
    await expectLater(maybeAskForReview(), completes);

    final prefs = await SharedPreferences.getInstance();
    expect(prefs.getBool('askedForReview'), isNull);
  });
}
