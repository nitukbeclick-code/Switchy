import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:chosech/app_state.dart';
import 'package:chosech/data.dart';
import 'package:chosech/services/notifications.dart';

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
}
