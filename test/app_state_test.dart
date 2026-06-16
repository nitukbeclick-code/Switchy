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

  // ── billsPersonalized flag ───────────────────────────────────────────────────

  group('billsPersonalized', () {
    test('defaults to false', () {
      expect(AppState().billsPersonalized, isFalse);
    });

    test('becomes true once the user sets a bill', () {
      final s = AppState();
      s.setCurrentBill('cellular', 150);
      expect(s.billsPersonalized, isTrue);
    });

    test('resetAllBills clears it', () {
      final s = AppState();
      s.setCurrentBill('internet', 120);
      expect(s.billsPersonalized, isTrue);
      s.resetAllBills();
      expect(s.billsPersonalized, isFalse);
    });
  });

  // ── recent searches ──────────────────────────────────────────────────────────

  group('recentSearches', () {
    test('adds most-recent-first and trims blanks', () {
      final s = AppState();
      s.addRecentSearch('סלקום');
      s.addRecentSearch('  5G  ');
      s.addRecentSearch('   '); // ignored
      expect(s.recentSearches, equals(['5G', 'סלקום']));
    });

    test('re-searching moves a term to the front without duplicating', () {
      final s = AppState();
      s.addRecentSearch('a');
      s.addRecentSearch('b');
      s.addRecentSearch('a');
      expect(s.recentSearches, equals(['a', 'b']));
    });

    test('caps the history at 8 entries', () {
      final s = AppState();
      for (var i = 0; i < 12; i++) {
        s.addRecentSearch('q$i');
      }
      expect(s.recentSearches.length, equals(8));
      expect(s.recentSearches.first, equals('q11'));
    });

    test('clearRecentSearches empties the history', () {
      final s = AppState();
      s.addRecentSearch('x');
      s.clearRecentSearches();
      expect(s.recentSearches, isEmpty);
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

  // ── Chat & AI-advisor history ────────────────────────────────────────────────

  group('chat history', () {
    test('addChatMessage stores messages with role + text', () {
      final state = AppState();
      expect(state.chatHistory, isEmpty);
      state.addChatMessage(text: 'שלום', isUser: true);
      state.addChatMessage(text: 'היי, איך אפשר לעזור?', isUser: false);
      expect(state.chatHistory.length, equals(2));
      expect(state.chatHistory.first['text'], equals('שלום'));
      expect(state.chatHistory.first['isUser'], isTrue);
      expect(state.chatHistory.last['isUser'], isFalse);
    });

    test('chat history is capped at 100 entries (keeps most recent)', () {
      final state = AppState();
      for (var i = 0; i < 130; i++) {
        state.addChatMessage(text: 'm$i', isUser: i.isEven);
      }
      expect(state.chatHistory.length, equals(100));
      expect(state.chatHistory.last['text'], equals('m129'));
      expect(state.chatHistory.first['text'], equals('m30'));
    });

    test('clearChatHistory empties the conversation', () {
      final state = AppState();
      state.addChatMessage(text: 'x', isUser: true);
      state.clearChatHistory();
      expect(state.chatHistory, isEmpty);
    });
  });

  group('advisor history', () {
    test('addAdvisorMessage stores and clearAdvisorHistory empties', () {
      final state = AppState();
      state.addAdvisorMessage(text: 'כמה אחסוך?', isUser: true);
      state.addAdvisorMessage(text: 'עד ₪850 בשנה', isUser: false);
      expect(state.advisorHistory.length, equals(2));
      state.clearAdvisorHistory();
      expect(state.advisorHistory, isEmpty);
    });

    test('chat and advisor histories are independent stores', () {
      final state = AppState();
      state.addChatMessage(text: 'chat', isUser: true);
      state.addAdvisorMessage(text: 'advisor', isUser: true);
      expect(state.chatHistory.length, equals(1));
      expect(state.advisorHistory.length, equals(1));
      expect(state.chatHistory.first['text'], equals('chat'));
      expect(state.advisorHistory.first['text'], equals('advisor'));
    });
  });

  // ── Quiz-derived needs ───────────────────────────────────────────────────────

  group('quiz needs', () {
    test('default to false', () {
      final state = AppState();
      expect(state.wants5G, isFalse);
      expect(state.wantsAbroad, isFalse);
      expect(state.wantsNoCommit, isFalse);
    });

    test('setQuizNeeds updates all three flags', () {
      final state = AppState();
      state.setQuizNeeds(wants5G: true, wantsAbroad: false, wantsNoCommit: true);
      expect(state.wants5G, isTrue);
      expect(state.wantsAbroad, isFalse);
      expect(state.wantsNoCommit, isTrue);
    });

    test('setQuizNeeds notifies listeners', () {
      final state = AppState();
      var notified = false;
      state.addListener(() => notified = true);
      state.setQuizNeeds(wants5G: true, wantsAbroad: true, wantsNoCommit: false);
      expect(notified, isTrue);
    });
  });

  // ── Renewal radar ────────────────────────────────────────────────────────────

  group('renewal radar', () {
    String inDays(int n) {
      final d = DateTime.now().add(Duration(days: n));
      return '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';
    }

    test('addMyPlan stores a tracked plan at the front', () {
      final state = AppState();
      expect(state.myPlans, isEmpty);
      state.addMyPlan(category: 'cellular', provider: 'סלקום', planName: '5G 800GB', monthlyPrice: 40, promoEndDate: inDays(18), joinedViaUs: true);
      expect(state.myPlans.length, equals(1));
      expect(state.myPlans.first.provider, equals('סלקום'));
      expect(state.myPlans.first.joinedViaUs, isTrue);
    });

    test('daysUntilRenewal computes the countdown', () {
      final state = AppState();
      state.addMyPlan(category: 'cellular', provider: 'פרטנר', planName: 'x', monthlyPrice: 50, promoEndDate: inDays(21));
      expect(state.myPlans.first.daysUntilRenewal, equals(21));
    });

    test('nextRenewal returns the soonest future promo end', () {
      final state = AppState();
      state.addMyPlan(category: 'internet', provider: 'בזק', planName: 'a', monthlyPrice: 99, promoEndDate: inDays(40));
      state.addMyPlan(category: 'cellular', provider: 'גולן טלקום', planName: 'b', monthlyPrice: 39, promoEndDate: inDays(9));
      state.addMyPlan(category: 'tv', provider: 'yes', planName: 'c', monthlyPrice: 89, promoEndDate: inDays(-5)); // already passed
      final next = state.nextRenewal;
      expect(next, isNotNull);
      expect(next!.provider, equals('גולן טלקום'));
    });

    test('nextRenewal ignores plans with no promo date and is null when none', () {
      final state = AppState();
      state.addMyPlan(category: 'cellular', provider: 'x', planName: 'y', monthlyPrice: 30);
      expect(state.nextRenewal, isNull);
    });

    test('removeMyPlan deletes the entry', () {
      final state = AppState();
      state.addMyPlan(category: 'cellular', provider: 'x', planName: 'y', monthlyPrice: 30);
      final id = state.myPlans.first.id;
      state.removeMyPlan(id);
      expect(state.myPlans, isEmpty);
    });

    test('renewalReminders consent defaults false and toggles', () {
      final state = AppState();
      expect(state.renewalReminders, isFalse);
      state.setRenewalReminders(true);
      expect(state.renewalReminders, isTrue);
    });
  });

  // -- Admin role derivation --

  group('isAdmin derivation', () {
    test('defaults to false before any login', () {
      expect(AppState().isAdmin, isFalse);
    });

    test('login with an allow-listed email grants admin (case-insensitive)', () {
      final state = AppState();
      state.login(name: 'owner', phone: '0500000000', email: 'UZIEL10@Gmail.com');
      expect(state.isAdmin, isTrue);
    });

    test('login with a non-admin email does not grant admin', () {
      final state = AppState();
      state.login(name: 'user', phone: '0501111111', email: 'someone@example.com');
      expect(state.isAdmin, isFalse);
    });

    test('logout clears the admin flag', () {
      final state = AppState();
      state.login(name: 'owner', phone: '0500000000', email: 'uziel10@gmail.com');
      expect(state.isAdmin, isTrue);
      state.logout();
      expect(state.isAdmin, isFalse);
    });

    test('isAdminEmail ignores case and surrounding space', () {
      expect(AppState.isAdminEmail(' uziel10@gmail.com '), isTrue);
      expect(AppState.isAdminEmail('nope@gmail.com'), isFalse);
      expect(AppState.isAdminEmail(''), isFalse);
    });

    test('every configured admin email is recognised', () {
      for (final email in const [
        'uziel10@gmail.com',
        'inbal2526@gmail.com',
        'arielgabayyy@gmail.com',
        'nitukbeclick@gmail.com',
      ]) {
        expect(AppState.isAdminEmail(email), isTrue, reason: email);
        expect(AppState.isAdminEmail(email.toUpperCase()), isTrue, reason: email);
      }
      expect(AppState.adminEmails.length, equals(4));
    });
  });
}
