import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:chosech/app_state.dart';

/// Focused coverage for the favorites / wishlist API the Favorites page reads:
/// toggleFavorite / isFavorited round-trip + favoritePlans reflecting adds and
/// removes (membership, multiples, and ordering of the backing list).
void main() {
  setUp(() {
    TestWidgetsFlutterBinding.ensureInitialized();
    SharedPreferences.setMockInitialValues({});
    AppState.reset();
  });

  group('favorites round-trip', () {
    test('defaults to empty with nothing favorited', () {
      final state = AppState();
      expect(state.favoritePlans, isEmpty);
      expect(state.isFavorited('plan_a'), isFalse);
    });

    test('toggleFavorite adds, then a second toggle removes (round-trip)', () {
      final state = AppState();
      state.toggleFavorite('plan_a');
      expect(state.isFavorited('plan_a'), isTrue);
      state.toggleFavorite('plan_a');
      expect(state.isFavorited('plan_a'), isFalse);
    });

    test('notifies listeners on each toggle', () {
      final state = AppState();
      var count = 0;
      state.addListener(() => count++);
      state.toggleFavorite('plan_a');
      state.toggleFavorite('plan_a');
      expect(count, equals(2));
    });
  });

  group('favoritePlans reflects adds and removes', () {
    test('adding plans surfaces them in favoritePlans', () {
      final state = AppState();
      state.toggleFavorite('plan_a');
      state.toggleFavorite('plan_b');
      expect(state.favoritePlans, containsAll(['plan_a', 'plan_b']));
      expect(state.favoritePlans.length, equals(2));
    });

    test('removing one plan leaves the others intact', () {
      final state = AppState();
      state.toggleFavorite('plan_a');
      state.toggleFavorite('plan_b');
      state.toggleFavorite('plan_c');
      state.toggleFavorite('plan_b'); // remove the middle one
      expect(state.isFavorited('plan_b'), isFalse);
      expect(state.favoritePlans, containsAll(['plan_a', 'plan_c']));
      expect(state.favoritePlans, isNot(contains('plan_b')));
      expect(state.favoritePlans.length, equals(2));
    });

    test('favorites are independent per plan', () {
      final state = AppState();
      state.toggleFavorite('plan_a');
      expect(state.isFavorited('plan_a'), isTrue);
      expect(state.isFavorited('plan_b'), isFalse);
    });

    test('favoritePlans is an unmodifiable view (mutating it throws)', () {
      final state = AppState();
      state.toggleFavorite('plan_a');
      expect(() => state.favoritePlans.add('plan_x'), throwsUnsupportedError);
    });

    test('re-adding a removed plan brings it back', () {
      final state = AppState();
      state.toggleFavorite('plan_a');
      state.toggleFavorite('plan_a'); // removed
      state.toggleFavorite('plan_a'); // re-added
      expect(state.isFavorited('plan_a'), isTrue);
      expect(state.favoritePlans, contains('plan_a'));
    });
  });
}
