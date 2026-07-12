// Pins the community-feed query contract of SupabaseBackend WITHOUT any
// network: the page cap, the flagged-visibility disjunction sent to PostgREST,
// and the Dart-legal override widening that adds the `before` load-older
// cursor on top of the narrow Backend.fetchPosts contract (so LocalBackend and
// the test fakes stay valid overrides). Constructing SupabaseBackend is safe
// offline — Supabase.instance is only touched lazily inside method bodies.

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

    test('fetchPosts satisfies the narrow Backend contract AND widens it with a before cursor', () {
      final Backend backend = SupabaseBackend();
      // Valid override of the abstract contract…
      expect(
        backend.fetchPosts,
        isA<Future<List<CommunityPost>> Function({String? channel})>(),
      );
      // …that additionally accepts the strictly-older-than cursor.
      expect(
        backend.fetchPosts,
        isA<Future<List<CommunityPost>> Function({String? channel, DateTime? before})>(),
      );
    });

    test('LocalBackend deliberately does NOT carry the cursor (narrow override stays valid)', () {
      final Backend backend = LocalBackend();
      expect(
        backend.fetchPosts,
        isA<Future<List<CommunityPost>> Function({String? channel})>(),
      );
      expect(
        backend.fetchPosts,
        isNot(isA<
            Future<List<CommunityPost>> Function({String? channel, DateTime? before})>()),
      );
    });
  });
}
