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

  group('bill OCR (analyzeBill)', () {
    test('returns a deterministic readable analysis with cheaper suggestions', () async {
      final a = await backend.analyzeBill('data:image/jpeg;base64,AAAA');
      expect(a, isNotNull);
      expect(a!.isReadable, isTrue);
      expect(a.category, 'cellular');
      expect(a.currentSpend, greaterThan(0));
      expect(a.suggestions, isNotEmpty);
      // Suggested plans are cheaper than the detected spend.
      expect(a.suggestions.every((s) => s.price < a.currentSpend), isTrue);
    });

    test('returns null for an empty image (nothing to analyse)', () async {
      expect(await backend.analyzeBill(''), isNull);
      expect(await backend.analyzeBill('   '), isNull);
    });
  });

  group('community', () {
    PostInput post(String channel) => PostInput(
        author: 'דנה', avatar: 'ד', channel: channel, text: 'שלום');

    test('createPost returns a post and fetchPosts lists it (newest first)', () async {
      final a = await backend.createPost(post('סלולר'));
      final b = await backend.createPost(post('סלולר'));
      final list = await backend.fetchPosts();
      expect(list.map((p) => p.id).toList(), [b.id, a.id]);
      expect(list.first.author, 'דנה');
    });

    test('fetchPosts filters by channel (and "הכל" returns all)', () async {
      await backend.createPost(post('סלולר'));
      await backend.createPost(post('אינטרנט'));
      expect((await backend.fetchPosts(channel: 'סלולר')).length, 1);
      expect((await backend.fetchPosts(channel: 'הכל')).length, 2);
    });

    test('deletePost removes the post, its replies, like and bookmark', () async {
      final p = await backend.createPost(post('סלולר'));
      await backend.addReply(ReplyInput(postId: p.id, author: 'x', avatar: 'x', text: 'r'));
      await backend.setLike(p.id, true);
      await backend.setBookmark(p.id, true);

      await backend.deletePost(p.id);

      expect(await backend.fetchPosts(), isEmpty);
      expect(await backend.fetchReplies(p.id), isEmpty);
      expect(await backend.likedPostIds(), isNot(contains(p.id)));
      expect(await backend.bookmarkedPostIds(), isNot(contains(p.id)));
    });

    test('replies accumulate per post', () async {
      final p = await backend.createPost(post('סלולר'));
      await backend.addReply(ReplyInput(postId: p.id, author: 'a', avatar: 'a', text: '1'));
      await backend.addReply(ReplyInput(postId: p.id, author: 'b', avatar: 'b', text: '2'));
      final replies = await backend.fetchReplies(p.id);
      expect(replies.map((r) => r.text).toList(), ['1', '2']);
      expect(replies.every((r) => r.postId == p.id), isTrue);
    });

    test('like and bookmark toggle on and off', () async {
      final p = await backend.createPost(post('סלולר'));
      await backend.setLike(p.id, true);
      expect(await backend.likedPostIds(), contains(p.id));
      await backend.setLike(p.id, false);
      expect(await backend.likedPostIds(), isNot(contains(p.id)));

      await backend.setBookmark(p.id, true);
      expect(await backend.bookmarkedPostIds(), contains(p.id));
      await backend.setBookmark(p.id, false);
      expect(await backend.bookmarkedPostIds(), isEmpty);
    });
  });
}
