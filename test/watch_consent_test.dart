import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:chosech/app_state.dart';

/// The §30A (Spam-Law) watch-notification opt-in: turning a plan watch ON for
/// the first time must record explicit, persisted consent before any price-watch
/// notification can be sent.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() {
    SharedPreferences.setMockInitialValues({});
    AppState.reset();
  });

  test('no consent on a fresh install', () {
    final s = AppState();
    expect(s.hasWatchConsent, isFalse);
    expect(s.watchOptInAt, isNull);
  });

  test('first watch ON stamps an explicit §30A opt-in', () {
    final s = AppState();
    s.toggleWatch('plan-a');
    expect(s.isWatching('plan-a'), isTrue);
    expect(s.hasWatchConsent, isTrue);
    expect(s.watchOptInAt, isNotNull);
    // The stamp is a real ISO timestamp.
    expect(DateTime.tryParse(s.watchOptInAt!), isNotNull);
  });

  test('the opt-in stamp is not overwritten by later watches', () {
    final s = AppState();
    s.toggleWatch('plan-a');
    final firstStamp = s.watchOptInAt;
    s.toggleWatch('plan-b');
    expect(s.watchOptInAt, firstStamp);
  });

  test('un-watching every plan KEEPS the consent record (the legal artefact)', () {
    final s = AppState();
    s.toggleWatch('plan-a');
    s.toggleWatch('plan-a'); // off again
    expect(s.isWatching('plan-a'), isFalse);
    // Consent itself survives — it is distinct from whether a plan is watched.
    expect(s.hasWatchConsent, isTrue);
  });

  test('clearWatchConsent withdraws consent and clears the watch list', () {
    final s = AppState();
    s.toggleWatch('plan-a');
    s.toggleWatch('plan-b');
    s.clearWatchConsent();
    expect(s.watchedPlans, isEmpty);
    expect(s.hasWatchConsent, isFalse);
    expect(s.watchOptInAt, isNull);
  });

  test('the opt-in stamp persists across a reload', () async {
    final s = AppState();
    s.toggleWatch('plan-a');
    final stamp = s.watchOptInAt;
    await s.flushPersistence();

    AppState.reset();
    final reloaded = AppState();
    await reloaded.initializePersistedState();
    expect(reloaded.watchOptInAt, stamp);
    expect(reloaded.hasWatchConsent, isTrue);
    expect(reloaded.isWatching('plan-a'), isTrue);
  });
}
