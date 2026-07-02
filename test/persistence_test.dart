import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:chosech/app_state.dart';
import 'package:chosech/models.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() {
    SharedPreferences.setMockInitialValues({});
    AppState.reset();
  });

  group('TrackedPlan serialization', () {
    test('toJson/fromJson round-trips every field', () {
      const tp = TrackedPlan(
        id: 'x1',
        category: 'internet',
        provider: 'בזק',
        planName: 'גיגה ביתי',
        monthlyPrice: 99,
        promoEndDate: '2026-10-15',
        joinedViaUs: true,
      );
      final back = TrackedPlan.fromJson(tp.toJson());
      expect(back.id, tp.id);
      expect(back.category, tp.category);
      expect(back.provider, tp.provider);
      expect(back.planName, tp.planName);
      expect(back.monthlyPrice, tp.monthlyPrice);
      expect(back.promoEndDate, tp.promoEndDate);
      expect(back.joinedViaUs, tp.joinedViaUs);
    });

    test('fromJson tolerates a missing promo date and consent flag', () {
      final back = TrackedPlan.fromJson({
        'id': 'x',
        'category': 'cellular',
        'provider': 'p',
        'planName': 'n',
        'monthlyPrice': 30,
      });
      expect(back.promoEndDate, isNull);
      expect(back.joinedViaUs, isFalse);
      expect(back.daysUntilRenewal, isNull);
    });
  });

  group('AppState persistence round-trip', () {
    test('bills, watchlist, tracked plans, reviews and consent survive reload', () async {
      final s = AppState();
      s.setCurrentBill('cellular', 175);
      s.setCurrentBill('internet', 210);
      s.toggleWatch('cel_x');
      s.addMyPlan(
        category: 'cellular',
        provider: 'סלקום',
        planName: 'מסלול',
        monthlyPrice: 99,
        promoEndDate: '2026-12-31',
        joinedViaUs: true,
      );
      s.addReview(
        provider: 'פרטנר',
        overall: 4,
        subRatings: const {'price': 4, 'service': 4, 'coverage': 4, 'speed': 4},
        text: 'טוב',
      );
      s.setRenewalReminders(true);
      s.dismissNotification('n1');
      final trackedId = s.myPlans.first.id;

      // The setters persist fire-and-forget; let those writes flush to the
      // mock store before we reload.
      await Future<void>.delayed(const Duration(milliseconds: 50));

      AppState.reset();
      final r = AppState();
      await r.initializePersistedState();

      expect(r.currentBill('cellular'), 175);
      expect(r.currentBill('internet'), 210);
      expect(r.billsPersonalized, isTrue); // set a bill above → flag persists
      expect(r.isWatching('cel_x'), isTrue);
      expect(r.myPlans.length, 1);
      expect(r.myPlans.first.provider, 'סלקום');
      expect(r.myPlans.first.joinedViaUs, isTrue);
      expect(r.trackedPlanById(trackedId), isNotNull);
      expect(r.hasReviewedProvider('פרטנר'), isTrue);
      expect(r.reviewFor('פרטנר')!['overall'], 4);
      expect(r.renewalReminders, isTrue);
      expect(r.isNotificationDismissed('n1'), isTrue);
    });

    test('community posts, replies, likes and bookmarks survive reload', () async {
      final s = AppState();
      s.addCommunityPost(id: 'u1', author: 'אני', avatar: 'א', channel: 'סלולר', text: 'פוסט');
      s.addCommunityReply(postId: 'u1', author: 'דנה', avatar: 'ד', text: 'תגובה');
      s.toggleLike('u1');
      s.toggleBookmark('u1');

      await Future<void>.delayed(const Duration(milliseconds: 50));

      AppState.reset();
      final r = AppState();
      await r.initializePersistedState();

      expect(r.communityPosts.any((p) => p['id'] == 'u1'), isTrue);
      expect(r.replyCountFor('u1'), 1);
      expect(r.hasLiked('u1'), isTrue);
      expect(r.isBookmarked('u1'), isTrue);
    });

    test('billsPersonalizedCats and lastNotifiedLeadStep survive reload; leadLost does not', () async {
      final s = AppState();
      s.setCurrentBill('cellular', 175);
      s.setCurrentBill('tv', 95);
      s.setCurrentBill('internet', 0); // explicit 0 → NOT personalized
      s.setLastNotifiedLeadStep(3);
      s.setLeadLost(true); // session-scoped — must NOT persist

      await Future<void>.delayed(const Duration(milliseconds: 50));

      AppState.reset();
      final r = AppState();
      await r.initializePersistedState();

      expect(r.isBillPersonalized('cellular'), isTrue);
      expect(r.isBillPersonalized('tv'), isTrue);
      expect(r.isBillPersonalized('internet'), isFalse);
      expect(r.personalizedCats, equals({'cellular', 'tv'}));
      expect(r.billsPersonalized, isTrue);
      expect(r.lastNotifiedLeadStep, 3);
      expect(r.leadLost, isFalse); // never persisted, like isAdmin
    });

    test('LEGACY: stored bool true without the StringList key leaves the set empty', () async {
      // An install predating per-category tracking: only the old bool exists.
      SharedPreferences.setMockInitialValues({
        'billsPersonalized': true,
        'bill_cellular': 150,
      });
      AppState.reset();
      final r = AppState();
      await r.initializePersistedState();

      // The bool stays true, but we NEVER guess which categories were real.
      expect(r.billsPersonalized, isTrue);
      expect(r.personalizedCats, isEmpty);
      expect(r.isBillPersonalized('cellular'), isFalse);
    });
  });
}
