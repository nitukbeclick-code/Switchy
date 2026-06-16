import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:chosech/app_state.dart';
import 'package:chosech/data.dart';
import 'package:chosech/services/backend/backend.dart'
    show BookedMeeting, MeetingStatus;
import 'package:chosech/services/notifications.dart';
import 'package:chosech/services/price_change_event.dart';

void main() {
  setUp(() {
    TestWidgetsFlutterBinding.ensureInitialized();
    SharedPreferences.setMockInitialValues({});
    AppState.reset();
  });

  String inDays(int n) {
    final d = DateTime.now().add(Duration(days: n));
    return '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';
  }

  // Build a BookedMeeting whose *local* wall start (the clock the notification
  // logic compares against DateTime.now()) lands [offset] from now. The
  // meetingDate/slot are derived from that local instant so meetingLocalStart()
  // reproduces it exactly. startsAt is the matching UTC instant.
  BookedMeeting meetingAt(
    Duration offset, {
    required MeetingStatus status,
    String? provider,
    String id = 'm1',
  }) {
    final local = DateTime.now().add(offset);
    final date =
        '${local.year.toString().padLeft(4, '0')}-${local.month.toString().padLeft(2, '0')}-${local.day.toString().padLeft(2, '0')}';
    final slot =
        '${local.hour.toString().padLeft(2, '0')}:${local.minute.toString().padLeft(2, '0')}';
    return BookedMeeting(
      id: id,
      status: status,
      provider: provider,
      meetingDate: date,
      slot: slot,
      startsAt: local.toUtc(),
      createdAt: DateTime.now(),
    );
  }

  // ── existing coverage ──────────────────────────────────────────────────────

  test('no notifications when there is nothing to act on', () {
    final s = AppState();
    s.resetAllBills(); // clear the default bills so no savings insight fires
    expect(computeNotifications(s), isEmpty);
    expect(notificationCount(s), equals(0));
  });

  test('a soon-to-renew tracked plan yields a renewal notification', () {
    final s = AppState();
    s.addMyPlan(category: 'cellular', provider: 'סלקום', planName: '5G 800GB', monthlyPrice: 40, promoEndDate: inDays(10));
    final notifs = computeNotifications(s);
    expect(notifs.any((n) => n.kind == NotifKind.renewal), isTrue);
    expect(notifs.first.kind, equals(NotifKind.renewal)); // most urgent first
  });

  test('a renewal notification deep-links into that plan\'s report', () {
    final s = AppState();
    s.addMyPlan(category: 'cellular', provider: 'סלקום', planName: 'p', monthlyPrice: 99, promoEndDate: inDays(10));
    final id = s.myPlans.first.id;
    final n = computeNotifications(s).firstWhere((n) => n.kind == NotifKind.renewal);
    expect(n.routeName, equals('RenewalReport'));
    expect(n.pathParameters, equals({'trackedId': id}));
    // planId must stay null so the notification center routes by name, not to PlanDetail.
    expect(n.planId, isNull);
  });

  test('a renewal more than 30 days out is not surfaced', () {
    final s = AppState();
    s.addMyPlan(category: 'cellular', provider: 'פרטנר', planName: 'x', monthlyPrice: 50, promoEndDate: inDays(120));
    expect(computeNotifications(s).where((n) => n.kind == NotifKind.renewal), isEmpty);
  });

  test('watching an expensive plan against a high bill yields a better-deal notification', () {
    final s = AppState();
    final pricey = plansByCat('cellular').reduce((a, b) => a.price > b.price ? a : b);
    s.setCurrentBill('cellular', 250);
    s.toggleWatch(pricey.id);
    final notifs = computeNotifications(s);
    expect(notifs.any((n) => n.kind == NotifKind.betterDeal), isTrue);
  });

  test('a high bill yields a savings insight', () {
    final s = AppState();
    s.setCurrentBill('cellular', 250);
    expect(computeNotifications(s).any((n) => n.kind == NotifKind.savings), isTrue);
  });

  test('default (non-personalized) bills do not produce a savings insight', () {
    final s = AppState();
    // Fresh state has seed-default bills but the user never entered one.
    expect(s.billsPersonalized, isFalse);
    expect(computeNotifications(s).any((n) => n.kind == NotifKind.savings), isFalse);
  });

  test('dismissing a notification removes it and lowers the count', () {
    final s = AppState();
    s.addMyPlan(category: 'cellular', provider: 'גולן טלקום', planName: 'y', monthlyPrice: 39, promoEndDate: inDays(7));
    final before = computeNotifications(s);
    expect(before, isNotEmpty);
    final id = before.first.id;
    s.dismissNotification(id);
    final after = computeNotifications(s);
    expect(after.any((n) => n.id == id), isFalse);
    expect(after.length, equals(before.length - 1));
  });

  // ── AppNotification.priceDrop() ────────────────────────────────────────────

  group('AppNotification.priceDrop', () {
    test('formats whole-number prices without decimals', () {
      const e = PriceChangeEvent(
        planId: 'p9',
        planName: 'מסלול ענק',
        provider: 'HOT',
        oldPrice: 120,
        newPrice: 100,
      );
      final n = AppNotification.priceDrop(e);
      expect(n.id, equals('price_drop_p9'));
      expect(n.kind, equals(NotifKind.savings));
      expect(n.title, equals('מחיר ירד! HOT'));
      // monthly saving 20, annual 240 — all whole, no '.00'
      expect(n.body, contains('₪100')); // new price
      expect(n.body, contains('₪20 לחודש'));
      expect(n.body, contains('₪240 בשנה'));
      expect(n.body, isNot(contains('.00')));
      expect(n.routeName, equals('PlanDetail'));
      expect(n.planId, equals('p9'));
    });

    test('keeps two decimals for fractional prices', () {
      const e = PriceChangeEvent(
        planId: 'p7',
        planName: 'חבילה',
        provider: 'בזק',
        oldPrice: 99.90,
        newPrice: 89.40,
      );
      final n = AppNotification.priceDrop(e);
      // monthly saving 10.50, annual 126.00 → annual is whole so no decimals
      expect(n.body, contains('₪89.40')); // fractional new price keeps decimals
      expect(n.body, contains('₪10.50 לחודש'));
      expect(n.body, contains('₪126 בשנה')); // 10.50*12 = 126.0 → whole
    });

    test('priority scales with the annual saving, clamped to +250', () {
      AppNotification drop(double oldP, double newP) => AppNotification.priceDrop(
            PriceChangeEvent(
              planId: 'x',
              planName: 'n',
              provider: 'p',
              oldPrice: oldP,
              newPrice: newP,
            ),
          );
      // small drop: 1/mo → 12/yr → 750+12
      expect(drop(101, 100).priority, equals(762));
      // huge drop: 1000/mo → 12000/yr → clamps the annual bonus at +250
      expect(drop(1100, 100).priority, equals(1000));
      // every price-drop outranks the generic savings insight (priority 200)
      expect(drop(101, 100).priority, greaterThan(200));
    });
  });

  // ── community reply / like ─────────────────────────────────────────────────

  group('community notifications', () {
    test('communityReply carries author + snippet and routes to Community', () {
      final n = AppNotification.communityReply(
        postId: 'post42',
        authorName: 'דנה',
        snippet: 'תודה רבה!',
      );
      expect(n.id, equals('reply_post42'));
      expect(n.kind, equals(NotifKind.communityReply));
      expect(n.title, equals('תגובה חדשה'));
      expect(n.body, contains('דנה'));
      expect(n.body, contains('תודה רבה!'));
      expect(n.routeName, equals('Community'));
      expect(n.priority, equals(300));
    });

    test('communityLike carries the liker count and routes to Community', () {
      final n = AppNotification.communityLike(postId: 'post7', likerCount: 5);
      expect(n.id, equals('like_post7'));
      expect(n.kind, equals(NotifKind.communityLike));
      expect(n.body, contains('5'));
      expect(n.routeName, equals('Community'));
      expect(n.priority, equals(200));
    });

    test('a reply outranks a like', () {
      final reply = AppNotification.communityReply(
        postId: 'p',
        authorName: 'a',
        snippet: 's',
      );
      final like = AppNotification.communityLike(postId: 'p', likerCount: 1);
      expect(reply.priority, greaterThan(like.priority));
    });
  });

  // ── meeting status transitions + time boundaries ───────────────────────────

  group('meeting notifications', () {
    test('confirmed future meeting surfaces; today gets the higher priority', () {
      final s = AppState();
      s.resetAllBills();
      s.setBookedMeeting(meetingAt(const Duration(hours: 2), status: MeetingStatus.confirmed));
      final n = computeNotifications(s).firstWhere((x) => x.kind == NotifKind.meeting);
      expect(n.id, equals('meeting_confirmed_m1'));
      expect(n.title, equals('פגישת הוידאו אושרה'));
      expect(n.routeName, equals('Meeting'));
      // a confirmed meeting later *today* is the most urgent meeting (priority 1200)
      expect(n.priority, equals(1200));
    });

    test('confirmed meeting on a later day uses the lower priority', () {
      final s = AppState();
      s.resetAllBills();
      // +2 days, but anchored to 09:00 so the "isToday" branch is definitely false
      final local = DateTime.now().add(const Duration(days: 2));
      final m = BookedMeeting(
        id: 'm1',
        status: MeetingStatus.confirmed,
        meetingDate:
            '${local.year.toString().padLeft(4, '0')}-${local.month.toString().padLeft(2, '0')}-${local.day.toString().padLeft(2, '0')}',
        slot: '09:00',
        startsAt: DateTime(local.year, local.month, local.day, 9).toUtc(),
        createdAt: DateTime.now(),
      );
      s.setBookedMeeting(m);
      final n = computeNotifications(s).firstWhere((x) => x.kind == NotifKind.meeting);
      expect(n.priority, equals(900));
    });

    test('confirmed meeting that ended >30min ago is not surfaced', () {
      final s = AppState();
      s.resetAllBills();
      // start was 31 minutes ago → start+30min is already in the past
      s.setBookedMeeting(meetingAt(const Duration(minutes: -31), status: MeetingStatus.confirmed));
      expect(computeNotifications(s).where((n) => n.kind == NotifKind.meeting), isEmpty);
    });

    test('confirmed meeting still inside its 30-minute grace window surfaces', () {
      final s = AppState();
      s.resetAllBills();
      // start 10 minutes ago → start+30min is still ahead of now → still actionable
      s.setBookedMeeting(meetingAt(const Duration(minutes: -10), status: MeetingStatus.confirmed));
      expect(computeNotifications(s).any((n) => n.kind == NotifKind.meeting), isTrue);
    });

    test('pending future meeting surfaces with the request-sent copy', () {
      final s = AppState();
      s.resetAllBills();
      s.setBookedMeeting(meetingAt(const Duration(hours: 3), status: MeetingStatus.pending));
      final n = computeNotifications(s).firstWhere((x) => x.kind == NotifKind.meeting);
      expect(n.id, equals('meeting_pending_m1'));
      expect(n.title, equals('בקשת פגישת הוידאו נשלחה'));
      expect(n.priority, equals(400));
    });

    test('pending meeting whose start already passed is not surfaced', () {
      final s = AppState();
      s.resetAllBills();
      s.setBookedMeeting(meetingAt(const Duration(minutes: -5), status: MeetingStatus.pending));
      expect(computeNotifications(s).where((n) => n.kind == NotifKind.meeting), isEmpty);
    });

    test('noRep meeting always surfaces, regardless of time', () {
      final s = AppState();
      s.resetAllBills();
      // even with a long-past slot, "no rep available" stays actionable
      s.setBookedMeeting(meetingAt(const Duration(days: -3), status: MeetingStatus.noRep));
      final n = computeNotifications(s).firstWhere((x) => x.kind == NotifKind.meeting);
      expect(n.id, equals('meeting_norep_m1'));
      expect(n.title, equals('לא נמצא נציג זמין למועד שביקשתם'));
      expect(n.priority, equals(800));
    });

    test('expired meeting surfaces a rebooking prompt', () {
      final s = AppState();
      s.resetAllBills();
      s.setBookedMeeting(meetingAt(const Duration(days: -1), status: MeetingStatus.expired));
      final n = computeNotifications(s).firstWhere((x) => x.kind == NotifKind.meeting);
      expect(n.id, equals('meeting_expired_m1'));
      expect(n.title, equals('מועד הפגישה חלף ללא אישור'));
      expect(n.priority, equals(800));
    });

    test('cancelled / completed meetings are terminal and never surface', () {
      for (final status in [MeetingStatus.cancelled, MeetingStatus.completed]) {
        final s = AppState();
        s.resetAllBills();
        s.setBookedMeeting(meetingAt(const Duration(hours: 2), status: status));
        expect(
          computeNotifications(s).where((n) => n.kind == NotifKind.meeting),
          isEmpty,
          reason: 'status $status should be terminal',
        );
      }
    });

    test('the confirmed→pending→noRep→expired transitions each swap the active alert', () {
      final s = AppState();
      s.resetAllBills();
      // confirmed (future)
      s.setBookedMeeting(meetingAt(const Duration(hours: 2), status: MeetingStatus.confirmed));
      expect(computeNotifications(s).single.id, equals('meeting_confirmed_m1'));
      // → pending (future)
      s.updateMeetingStatus(MeetingStatus.pending);
      expect(computeNotifications(s).single.id, equals('meeting_pending_m1'));
      // → noRep
      s.updateMeetingStatus(MeetingStatus.noRep);
      expect(computeNotifications(s).single.id, equals('meeting_norep_m1'));
      // → expired
      s.updateMeetingStatus(MeetingStatus.expired);
      expect(computeNotifications(s).single.id, equals('meeting_expired_m1'));
      // → cancelled (terminal)
      s.updateMeetingStatus(MeetingStatus.cancelled);
      expect(computeNotifications(s).where((n) => n.kind == NotifKind.meeting), isEmpty);
    });

    test('the provider name is appended to confirmed/pending bodies when set', () {
      final s = AppState();
      s.resetAllBills();
      s.setBookedMeeting(
        meetingAt(const Duration(hours: 2), status: MeetingStatus.confirmed, provider: 'YES'),
      );
      final n = computeNotifications(s).firstWhere((x) => x.kind == NotifKind.meeting);
      expect(n.body, contains('· YES'));
    });
  });

  // ── savings insight gating ─────────────────────────────────────────────────

  group('savings insight gating', () {
    test('fires only after the user personalizes a bill', () {
      final s = AppState();
      // Personalize a bill high enough to clear the ₪300/yr threshold.
      s.setCurrentBill('cellular', 250);
      expect(s.billsPersonalized, isTrue);
      final n = computeNotifications(s).firstWhere((x) => x.kind == NotifKind.savings);
      expect(n.routeName, equals('PlanDetail'));
      expect(n.priority, equals(200));
    });

    test('clearing all bills (un-personalizing) removes the savings insight', () {
      final s = AppState();
      s.setCurrentBill('cellular', 250);
      expect(computeNotifications(s).any((n) => n.kind == NotifKind.savings), isTrue);
      s.resetAllBills();
      expect(s.billsPersonalized, isFalse);
      expect(computeNotifications(s).any((n) => n.kind == NotifKind.savings), isFalse);
    });
  });

  // ── cross-kind priority ordering ───────────────────────────────────────────

  test('cross-kind priority: renewal > betterDeal > savings', () {
    final s = AppState();
    // renewal: a tracked plan renewing very soon (priority ≈ 1000-d, highest)
    s.addMyPlan(
      category: 'cellular',
      provider: 'סלקום',
      planName: 'p',
      monthlyPrice: 99,
      promoEndDate: inDays(3),
    );
    // betterDeal + savings: a watched expensive plan against a high personalized bill
    final pricey = plansByCat('cellular').reduce((a, b) => a.price > b.price ? a : b);
    s.setCurrentBill('cellular', 250);
    s.toggleWatch(pricey.id);

    final notifs = computeNotifications(s);
    final renewal = notifs.firstWhere((n) => n.kind == NotifKind.renewal);
    final better = notifs.firstWhere((n) => n.kind == NotifKind.betterDeal);
    final savings = notifs.firstWhere((n) => n.kind == NotifKind.savings);

    expect(renewal.priority, greaterThan(better.priority));
    expect(better.priority, greaterThan(savings.priority));

    // The sorted output reflects that ordering: renewal first, savings last
    // among the three.
    expect(notifs.first.kind, equals(NotifKind.renewal));
    expect(notifs.indexOf(renewal), lessThan(notifs.indexOf(better)));
    expect(notifs.indexOf(better), lessThan(notifs.indexOf(savings)));
  });

  test('a pending meeting sorts between betterDeal and savings', () {
    final s = AppState();
    // betterDeal + savings via a watched pricey plan + high bill.
    final pricey = plansByCat('cellular').reduce((a, b) => a.price > b.price ? a : b);
    s.setCurrentBill('cellular', 250);
    s.toggleWatch(pricey.id);
    // pending meeting (priority 400): below betterDeal (≥501), above savings (200)
    s.setBookedMeeting(meetingAt(const Duration(hours: 4), status: MeetingStatus.pending));

    final notifs = computeNotifications(s);
    final better = notifs.firstWhere((n) => n.kind == NotifKind.betterDeal);
    final meeting = notifs.firstWhere((n) => n.kind == NotifKind.meeting);
    final savings = notifs.firstWhere((n) => n.kind == NotifKind.savings);

    expect(better.priority, greaterThan(meeting.priority));
    expect(meeting.priority, greaterThan(savings.priority));
    expect(notifs.indexOf(better), lessThan(notifs.indexOf(meeting)));
    expect(notifs.indexOf(meeting), lessThan(notifs.indexOf(savings)));
  });

  group('price-target alerts', () {
    int ptCount(AppState s) =>
        computeNotifications(s).where((n) => n.kind == NotifKind.priceTarget).length;

    test('fires when a watched plan reaches the ₪ target', () {
      final s = AppState();
      final plan = allPlans.first;
      s.setPriceTarget(plan.id, plan.priceValue.round()); // boundary hit
      final pt = computeNotifications(s)
          .where((n) => n.kind == NotifKind.priceTarget)
          .toList();
      expect(pt.length, equals(1));
      expect(pt.first.planId, equals(plan.id));
      expect(pt.first.id, equals('price_target_${plan.id}'));
      expect(pt.first.routeName, equals('PlanDetail'));
    });

    test('does not fire when Price Alerts are off', () {
      final s = AppState();
      final plan = allPlans.first;
      s.setPriceTarget(plan.id, plan.priceValue.round());
      s.setPrefPriceAlerts(false);
      expect(ptCount(s), equals(0));
    });

    test('does not fire when the target is still below the current price', () {
      final s = AppState();
      final plan = allPlans.first;
      s.setPriceTarget(plan.id, plan.priceValue.round() - 5); // unreached
      expect(ptCount(s), equals(0));
    });

    test('honors the minimum-saving threshold once a bill is set', () {
      final s = AppState();
      final plan = allPlans.first;
      final price = plan.priceValue.round();
      s.setPriceTarget(plan.id, price); // hit
      s.setMinSavingAlert(5);
      // Saving vs bill is only ₪2 (< 5) → suppressed.
      s.setCurrentBill(plan.cat, price + 2);
      expect(ptCount(s), equals(0));
      // Saving now ₪50 (≥ 5) → fires.
      s.setCurrentBill(plan.cat, price + 50);
      expect(ptCount(s), equals(1));
    });
  });

  group('price-drop alerts', () {
    test('a recorded drop surfaces as a priceDrop notification, gated on the toggle', () {
      final s = AppState();
      s.recordPriceDrop(
          planId: 'p1', planName: 'מסלול', provider: 'סלקום', oldPrice: 100, newPrice: 80);
      final drops =
          computeNotifications(s).where((n) => n.id == 'price_drop_p1').toList();
      expect(drops.length, 1);
      expect(drops.single.planId, 'p1');
      expect(drops.single.routeName, 'PlanDetail');

      s.setPrefPriceAlerts(false);
      expect(computeNotifications(s).where((n) => n.id == 'price_drop_p1'), isEmpty);
    });

    test('a stale (recovered) drop is not surfaced', () {
      final s = AppState();
      // newPrice >= oldPrice → not actually a drop anymore.
      s.recordPriceDrop(
          planId: 'p1', planName: 'מסלול', provider: 'סלקום', oldPrice: 80, newPrice: 100);
      expect(computeNotifications(s).where((n) => n.id == 'price_drop_p1'), isEmpty);
    });

    test('clearPriceDrop removes it from the center', () {
      final s = AppState();
      s.recordPriceDrop(
          planId: 'p1', planName: 'מסלול', provider: 'סלקום', oldPrice: 100, newPrice: 80);
      expect(computeNotifications(s).where((n) => n.id == 'price_drop_p1'), isNotEmpty);
      s.clearPriceDrop('p1');
      expect(computeNotifications(s).where((n) => n.id == 'price_drop_p1'), isEmpty);
    });
  });
}
