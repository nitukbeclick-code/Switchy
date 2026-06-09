import 'package:flutter_test/flutter_test.dart';
import 'package:chosech/models.dart';
import 'package:chosech/services/backend/backend.dart';
import 'package:chosech/services/backend/local_backend.dart';

void main() {
  late LocalBackend backend;
  setUp(() => backend = LocalBackend());

  group('leads', () {
    test('submitLead stores the lead with mapped columns', () async {
      await backend.submitLead(const LeadInput(
        name: 'דנה',
        phone: '0500000000',
        provider: 'סלקום',
        planId: 'cel_x',
        callbackTime: 'now',
      ));
      expect(backend.submittedLeads.length, 1);
      final row = backend.submittedLeads.first.toRow();
      expect(row['name'], 'דנה');
      expect(row['plan_id'], 'cel_x'); // snake_case column mapping
      expect(row['callback_time'], 'now');
    });
  });

  group('tracked plans', () {
    TrackedPlan plan(String id) => TrackedPlan(
          id: id, category: 'cellular', provider: 'פרטנר',
          planName: 'p', monthlyPrice: 40,
        );

    test('add is newest-first and fetch returns them', () async {
      await backend.addTrackedPlan(plan('a'));
      await backend.addTrackedPlan(plan('b'));
      final list = await backend.fetchTrackedPlans();
      expect(list.map((p) => p.id).toList(), ['b', 'a']);
    });

    test('adding the same id again de-dupes (replaces)', () async {
      await backend.addTrackedPlan(plan('a'));
      await backend.addTrackedPlan(plan('a'));
      final list = await backend.fetchTrackedPlans();
      expect(list.length, 1);
    });

    test('remove deletes by id', () async {
      await backend.addTrackedPlan(plan('a'));
      await backend.removeTrackedPlan('a');
      expect(await backend.fetchTrackedPlans(), isEmpty);
    });
  });

  group('provider reviews', () {
    test('upsert is unique per provider (second replaces the first)', () async {
      await backend.upsertReview(const ReviewInput(
          provider: 'פלאפון', overall: 3, subRatings: {'price': 3}));
      await backend.upsertReview(const ReviewInput(
          provider: 'פלאפון', overall: 5, subRatings: {'price': 5}, text: 'השתפר'));
      final reviews = await backend.reviewsForProvider('פלאפון');
      expect(reviews.length, 1);
      expect(reviews.first.overall, 5);
      expect(reviews.first.text, 'השתפר');
    });

    test('reviewsForProvider is empty for an unrated provider', () async {
      expect(await backend.reviewsForProvider('בזק'), isEmpty);
    });

    test('toRow maps sub-ratings to columns', () {
      const r = ReviewInput(
        provider: 'X',
        overall: 4,
        subRatings: {'price': 5, 'service': 4, 'coverage': 3, 'speed': 2},
        text: 'ok',
      );
      final row = r.toRow();
      expect(row['overall'], 4);
      expect(row['price'], 5);
      expect(row['speed'], 2);
      expect(row['body'], 'ok');
    });
  });
}
