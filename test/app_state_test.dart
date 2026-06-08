import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:chosech/app_state.dart';

void main() {
  setUp(() {
    TestWidgetsFlutterBinding.ensureInitialized();
    SharedPreferences.setMockInitialValues({});
    AppState.reset();
  });

  // ── currentBill set / clamp ─────────────────────────────────────────────────

  group('setCurrentBill', () {
    test('sets a valid bill value', () {
      final state = AppState();
      state.setCurrentBill('cellular', 150);
      expect(state.currentBill('cellular'), equals(150));
    });

    test('clamps value to 0 at the lower bound', () {
      final state = AppState();
      state.setCurrentBill('cellular', -50);
      expect(state.currentBill('cellular'), equals(0));
    });

    test('clamps value to 2000 at the upper bound', () {
      final state = AppState();
      state.setCurrentBill('cellular', 9999);
      expect(state.currentBill('cellular'), equals(2000));
    });

    test('sets bills independently per category', () {
      final state = AppState();
      state.setCurrentBill('cellular', 80);
      state.setCurrentBill('internet', 120);
      expect(state.currentBill('cellular'), equals(80));
      expect(state.currentBill('internet'), equals(120));
    });

    test('unknown category returns 0', () {
      final state = AppState();
      expect(state.currentBill('unknown_cat'), equals(0));
    });
  });

  // ── compare toggle — max 3 ──────────────────────────────────────────────────

  group('toggleCompare', () {
    test('adds a plan to the compare list', () {
      final state = AppState();
      state.toggleCompare('plan_a');
      expect(state.comparePlans, contains('plan_a'));
    });

    test('removes a plan that is already in compare', () {
      final state = AppState();
      state.toggleCompare('plan_a');
      state.toggleCompare('plan_a');
      expect(state.comparePlans, isNot(contains('plan_a')));
    });

    test('allows up to 3 plans', () {
      final state = AppState();
      state.toggleCompare('plan_a');
      state.toggleCompare('plan_b');
      state.toggleCompare('plan_c');
      expect(state.comparePlans.length, equals(3));
    });

    test('does not add a 4th plan beyond the limit', () {
      final state = AppState();
      state.toggleCompare('plan_a');
      state.toggleCompare('plan_b');
      state.toggleCompare('plan_c');
      state.toggleCompare('plan_d'); // should be ignored
      expect(state.comparePlans.length, equals(3));
      expect(state.comparePlans, isNot(contains('plan_d')));
    });

    test('isInCompare returns correct state', () {
      final state = AppState();
      state.toggleCompare('plan_x');
      expect(state.isInCompare('plan_x'), isTrue);
      expect(state.isInCompare('plan_y'), isFalse);
    });

    test('clearCompare empties the list', () {
      final state = AppState();
      state.toggleCompare('plan_a');
      state.toggleCompare('plan_b');
      state.clearCompare();
      expect(state.comparePlans, isEmpty);
    });
  });

  // ── toggleWatch ─────────────────────────────────────────────────────────────

  group('toggleWatch', () {
    test('adds a plan to watchlist', () {
      final state = AppState();
      state.toggleWatch('cel_golan_400');
      expect(state.isWatching('cel_golan_400'), isTrue);
    });

    test('removes a plan already on watchlist', () {
      final state = AppState();
      state.toggleWatch('cel_golan_400');
      state.toggleWatch('cel_golan_400');
      expect(state.isWatching('cel_golan_400'), isFalse);
    });

    test('watchedPlans list reflects all watched plans', () {
      final state = AppState();
      state.toggleWatch('plan_1');
      state.toggleWatch('plan_2');
      expect(state.watchedPlans, containsAll(['plan_1', 'plan_2']));
    });
  });

  // ── addReview insert + dedupe + hasReviewedProvider ─────────────────────────

  group('addReview', () {
    test('inserts a new review', () {
      final state = AppState();
      state.addReview(
        provider: 'גולן טלקום',
        overall: 5,
        subRatings: {'price': 5, 'service': 4, 'coverage': 4, 'speed': 3},
        text: 'מעולה',
      );
      expect(state.hasReviewedProvider('גולן טלקום'), isTrue);
    });

    test('hasReviewedProvider returns false before any review', () {
      final state = AppState();
      expect(state.hasReviewedProvider('פרטנר'), isFalse);
    });

    test('second review for same provider replaces the first (dedupe)', () {
      final state = AppState();
      state.addReview(
        provider: 'פלאפון',
        overall: 3,
        subRatings: {'price': 3, 'service': 3, 'coverage': 3, 'speed': 3},
        text: 'בינוני',
      );
      state.addReview(
        provider: 'פלאפון',
        overall: 5,
        subRatings: {'price': 5, 'service': 5, 'coverage': 5, 'speed': 5},
        text: 'השתפר מאוד',
      );
      // Should still be exactly one review for this provider
      final reviews = state.userReviews.where((r) => r['provider'] == 'פלאפון').toList();
      expect(reviews.length, equals(1));
      expect(reviews.first['overall'], equals(5));
      expect(reviews.first['text'], equals('השתפר מאוד'));
    });

    test('reviews for different providers coexist', () {
      final state = AppState();
      state.addReview(
        provider: 'גולן טלקום',
        overall: 5,
        subRatings: const {'price': 5, 'service': 5, 'coverage': 4, 'speed': 4},
        text: 'טוב',
      );
      state.addReview(
        provider: 'סלקום',
        overall: 4,
        subRatings: const {'price': 4, 'service': 4, 'coverage': 4, 'speed': 4},
        text: 'סביר',
      );
      expect(state.hasReviewedProvider('גולן טלקום'), isTrue);
      expect(state.hasReviewedProvider('סלקום'), isTrue);
      expect(state.userReviews.length, equals(2));
    });

    test('reviewFor returns the correct entry', () {
      final state = AppState();
      state.addReview(
        provider: 'Xphone',
        overall: 4,
        subRatings: const {'price': 5, 'service': 3, 'coverage': 4, 'speed': 4},
        text: 'מחיר קבוע שווה',
      );
      final review = state.reviewFor('Xphone');
      expect(review, isNotNull);
      expect(review!['overall'], equals(4));
      expect(review['text'], equals('מחיר קבוע שווה'));
    });
  });

  // ── toggleLike ──────────────────────────────────────────────────────────────

  group('toggleLike', () {
    test('marks a post as liked', () {
      final state = AppState();
      state.toggleLike('post_1');
      expect(state.hasLiked('post_1'), isTrue);
    });

    test('unlikes a previously liked post', () {
      final state = AppState();
      state.toggleLike('post_1');
      state.toggleLike('post_1');
      expect(state.hasLiked('post_1'), isFalse);
    });

    test('liking one post does not affect another', () {
      final state = AppState();
      state.toggleLike('post_1');
      expect(state.hasLiked('post_2'), isFalse);
    });
  });

  // ── AppState.reset singleton ─────────────────────────────────────────────────

  group('AppState singleton', () {
    test('AppState() returns the same instance', () {
      final a = AppState();
      final b = AppState();
      expect(identical(a, b), isTrue);
    });

    test('AppState.reset() produces a fresh instance with default values', () {
      final state = AppState();
      state.setCurrentBill('cellular', 500);
      AppState.reset();
      final fresh = AppState();
      // Default cellular bill is 119 (from _currentBills initializer)
      expect(fresh.currentBill('cellular'), equals(119));
    });
  });

  // ── ChangeNotifier integration ───────────────────────────────────────────────

  group('ChangeNotifier', () {
    test('notifies listeners when bill changes', () {
      final state = AppState();
      var notified = false;
      state.addListener(() => notified = true);
      state.setCurrentBill('internet', 100);
      expect(notified, isTrue);
    });

    test('notifies listeners when compare list changes', () {
      final state = AppState();
      var count = 0;
      state.addListener(() => count++);
      state.toggleCompare('plan_a');
      state.toggleCompare('plan_b');
      expect(count, equals(2));
    });
  });

  // ── Community: bookmarks ─────────────────────────────────────────────────────

  group('toggleBookmark', () {
    test('bookmarks a post and reflects in isBookmarked', () {
      final state = AppState();
      expect(state.isBookmarked('p1'), isFalse);
      state.toggleBookmark('p1');
      expect(state.isBookmarked('p1'), isTrue);
      expect(state.bookmarkedPosts, contains('p1'));
    });

    test('un-bookmarks a previously bookmarked post', () {
      final state = AppState();
      state.toggleBookmark('p1');
      state.toggleBookmark('p1');
      expect(state.isBookmarked('p1'), isFalse);
    });

    test('bookmarks are independent per post', () {
      final state = AppState();
      state.toggleBookmark('p1');
      expect(state.isBookmarked('p1'), isTrue);
      expect(state.isBookmarked('p2'), isFalse);
    });
  });

  // ── Community: replies ───────────────────────────────────────────────────────

  group('community replies', () {
    test('addCommunityReply stores a reply for a post', () {
      final state = AppState();
      expect(state.replyCountFor('p1'), equals(0));
      state.addCommunityReply(postId: 'p1', author: 'דנה', avatar: 'ד', text: 'תשובה');
      expect(state.replyCountFor('p1'), equals(1));
      final replies = state.repliesFor('p1');
      expect(replies.single['author'], equals('דנה'));
      expect(replies.single['text'], equals('תשובה'));
    });

    test('multiple replies accumulate in order', () {
      final state = AppState();
      state.addCommunityReply(postId: 'p1', author: 'א', avatar: 'א', text: 'ראשון');
      state.addCommunityReply(postId: 'p1', author: 'ב', avatar: 'ב', text: 'שני');
      expect(state.replyCountFor('p1'), equals(2));
      expect(state.repliesFor('p1').last['text'], equals('שני'));
    });

    test('replies are keyed independently per post', () {
      final state = AppState();
      state.addCommunityReply(postId: 'p1', author: 'א', avatar: 'א', text: 'x');
      expect(state.replyCountFor('p1'), equals(1));
      expect(state.replyCountFor('p2'), equals(0));
    });
  });

  // ── Community: posts & deletion ──────────────────────────────────────────────

  group('community posts', () {
    test('addCommunityPost inserts at the front and marks ownership', () {
      final state = AppState();
      state.addCommunityPost(id: 'u1', author: 'אני', avatar: 'א', channel: 'סלולר', text: 'פוסט');
      expect(state.isOwnPost('u1'), isTrue);
      expect(state.communityPosts.first['id'], equals('u1'));
    });

    test('isOwnPost is false for unknown / seed posts', () {
      final state = AppState();
      expect(state.isOwnPost('seed_1'), isFalse);
    });

    test('removeCommunityPost deletes the post and all its associated data', () {
      final state = AppState();
      state.addCommunityPost(id: 'u1', author: 'אני', avatar: 'א', channel: 'סלולר', text: 'פוסט');
      state.toggleLike('u1');
      state.toggleBookmark('u1');
      state.addCommunityReply(postId: 'u1', author: 'x', avatar: 'x', text: 'r');

      state.removeCommunityPost('u1');

      expect(state.isOwnPost('u1'), isFalse);
      expect(state.hasLiked('u1'), isFalse);
      expect(state.isBookmarked('u1'), isFalse);
      expect(state.replyCountFor('u1'), equals(0));
      expect(state.communityPosts.any((p) => p['id'] == 'u1'), isFalse);
    });
  });
}
