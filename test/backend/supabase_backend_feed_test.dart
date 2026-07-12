// Pins the community-feed query contract of SupabaseBackend WITHOUT any
// network: the page cap, the flagged-visibility disjunction sent to PostgREST,
// and the `before` load-older cursor that now lives on the ABSTRACT
// Backend.fetchPosts contract (so every implementer — SupabaseBackend,
// LocalBackend, and callers that only hold a Backend — can page). Constructing
// SupabaseBackend is safe offline — Supabase.instance is only touched lazily
// inside method bodies.

import 'package:flutter_test/flutter_test.dart';
import 'package:chosech/models.dart';
import 'package:chosech/services/backend/backend.dart';
import 'package:chosech/services/backend/local_backend.dart';
import 'package:chosech/services/backend/supabase_backend.dart';

void main() {
  group('SupabaseBackend community feed query contract', () {
    test('feed page is capped at 50 rows (the web fetchFeed ceiling)', () {
      expect(SupabaseBackend.feedPageSize, 50);
    });

    test('flaggedVisibilityFilter keeps flagged posts visible only to their owner', () {
      // Exact PostgREST disjunction — a typo here would silently change who
      // can read under-review content, so the string is pinned verbatim.
      expect(
        SupabaseBackend.flaggedVisibilityFilter('uid-123'),
        'is_flagged.eq.false,user_id.eq.uid-123',
      );
    });

    test('SupabaseBackend.fetchPosts carries the strictly-older-than cursor', () {
      final Backend backend = SupabaseBackend();
      expect(
        backend.fetchPosts,
        isA<Future<List<CommunityPost>> Function({String? channel, DateTime? before})>(),
      );
    });

    test('LocalBackend.fetchPosts carries the cursor too (the widened Backend contract)', () {
      // The `before` cursor lives on the ABSTRACT Backend now, so every
      // implementer accepts it — a caller holding only a Backend can page.
      final Backend backend = LocalBackend();
      expect(
        backend.fetchPosts,
        isA<Future<List<CommunityPost>> Function({String? channel, DateTime? before})>(),
      );
    });

    test('LocalBackend honours the before cursor: only strictly-older posts, capped', () async {
      final backend = LocalBackend();
      // Three posts, newest-first once stored (createPost inserts at 0).
      final a = await backend.createPost(
          const PostInput(author: 'a', avatar: 'a', channel: 'סלולר', text: '1'));
      await Future<void>.delayed(const Duration(milliseconds: 2));
      final b = await backend.createPost(
          const PostInput(author: 'b', avatar: 'b', channel: 'סלולר', text: '2'));
      await Future<void>.delayed(const Duration(milliseconds: 2));
      final c = await backend.createPost(
          const PostInput(author: 'c', avatar: 'c', channel: 'סלולר', text: '3'));

      // First page: newest-first, all three.
      final page1 = await backend.fetchPosts();
      expect(page1.map((p) => p.id).toList(), [c.id, b.id, a.id]);

      // Load-older from the OLDEST loaded post (b's cursor) → only a (strictly
      // older); b itself is excluded by the strict compare, so the widget's
      // id de-dupe is what re-includes any boundary twin.
      final older = await backend.fetchPosts(before: b.timestamp);
      expect(older.map((p) => p.id).toList(), [a.id]);
    });
  });
}
