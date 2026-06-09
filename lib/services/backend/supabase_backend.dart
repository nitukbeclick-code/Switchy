// ─────────────────────────────────────────────────────────────────────────────
// The live Supabase [Backend]. Activated when SUPABASE_URL / SUPABASE_ANON_KEY
// are provided at build time — see `main.dart`, which initialises Supabase and
// sets `appBackend = SupabaseBackend()` only when those defines are present
// (otherwise the app stays on [LocalBackend], so no-key runs and CI still work).
//
// Every query below maps 1:1 to a table/policy in supabase/schema.sql. RLS does
// the auth — you never pass user_id for the current user on writes that the
// policy scopes to auth.uid(); set it explicitly only where the row stores it.
// `main.dart` does an anonymous sign-in at startup so auth.uid() is populated
// without a login screen (enable "Anonymous sign-ins" in the Supabase dashboard).
// ─────────────────────────────────────────────────────────────────────────────

import 'dart:async';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../../models.dart';
import 'backend.dart';

class SupabaseBackend implements Backend {
  SupabaseClient get _db => Supabase.instance.client;
  String? get _uid => _db.auth.currentUser?.id;

  RealtimeChannel? _leadChannel;
  StreamController<int>? _leadStepCtrl;

  // ── User profile ─────────────────────────────────────────────────────────────
  @override
  Future<void> upsertProfile({required String name, required String phone, String? email}) async {
    if (_uid == null) return;
    await _db.from('profiles').upsert({
      'id': _uid,
      'name': name,
      'phone': phone,
      if (email != null && email.isNotEmpty) 'email': email,
    }, onConflict: 'id');
  }

  @override
  Future<void> addSavings(int amount) async {
    if (_uid == null || amount <= 0) return;
    await _db.rpc('increment_savings', params: {'uid': _uid, 'delta': amount});
  }

  @override
  Future<void> upsertBills(Map<String, int> bills) async {
    if (_uid == null) return;
    await _db.from('profiles').upsert({
      'id': _uid,
      'bills': bills,
    }, onConflict: 'id');
  }

  @override
  Future<void> upsertQuiz(Map<String, dynamic> quiz) async {
    if (_uid == null) return;
    await _db.from('profiles').upsert({
      'id': _uid,
      'quiz': quiz,
    }, onConflict: 'id');
  }

  @override
  Future<Map<String, int>?> fetchBills() async {
    if (_uid == null) return null;
    final rows = await _db.from('profiles').select('bills').eq('id', _uid!).maybeSingle();
    if (rows == null) return null;
    final raw = rows['bills'] as Map?;
    if (raw == null || raw.isEmpty) return null;
    return raw.map((k, v) => MapEntry(k as String, (v as num).toInt()));
  }

  // ── Leads ──────────────────────────────────────────────────────────────────
  @override
  Future<void> submitLead(LeadInput lead) async {
    // `leads` allows anon insert; attach user_id when signed in.
    await _db.from('leads').insert({
      ...lead.toRow(),
      if (_uid != null) 'user_id': _uid,
    });
  }

  @override
  Stream<int> leadStepStream() {
    if (_uid == null) return Stream.empty();
    _leadStepCtrl ??= StreamController<int>.broadcast();
    _leadChannel?.unsubscribe();
    _leadChannel = _db
        .channel('lead-tracker-$_uid')
        .onPostgresChanges(
          event: PostgresChangeEvent.update,
          schema: 'public',
          table: 'leads',
          filter: PostgresChangeFilter(
              type: FilterType.eq, column: 'user_id', value: _uid!),
          callback: (payload) {
            final status = payload.newRecord['status'] as String? ?? 'new';
            int step;
            switch (status) {
              case 'contacted': step = 2; break;
              case 'won': step = 4; break;
              default: step = 1;
            }
            _leadStepCtrl?.add(step);
          },
        )
        .subscribe();
    return _leadStepCtrl!.stream;
  }

  // ── Tracked plans ────────────────────────────────────────────────────────────
  @override
  Future<List<TrackedPlan>> fetchTrackedPlans() async {
    final rows = await _db
        .from('tracked_plans')
        .select()
        .order('created_at', ascending: false);
    return (rows as List).map((r) => TrackedPlan(
          id: r['id'] as String,
          category: r['category'] as String,
          provider: r['provider'] as String,
          planName: r['plan_name'] as String,
          monthlyPrice: (r['monthly_price'] as num).toInt(),
          promoEndDate: r['promo_end_date'] as String?,
          joinedViaUs: r['joined_via_us'] as bool? ?? false,
        )).toList();
  }

  @override
  Future<void> addTrackedPlan(TrackedPlan p) async {
    await _db.from('tracked_plans').insert({
      'user_id': _uid,
      'category': p.category,
      'provider': p.provider,
      'plan_name': p.planName,
      'monthly_price': p.monthlyPrice,
      'promo_end_date': p.promoEndDate,
      'joined_via_us': p.joinedViaUs,
    });
  }

  @override
  Future<void> removeTrackedPlan(String id) async {
    await _db.from('tracked_plans').delete().eq('id', id);
  }

  // ── Provider reviews ─────────────────────────────────────────────────────────
  @override
  Future<void> upsertReview(ReviewInput review) async {
    // unique(user_id, provider) → onConflict upserts the user's existing review.
    await _db.from('provider_reviews').upsert(
      {'user_id': _uid, ...review.toRow()},
      onConflict: 'user_id,provider',
    );
  }

  @override
  Future<List<ReviewInput>> reviewsForProvider(String provider) async {
    final rows =
        await _db.from('provider_reviews').select().eq('provider', provider);
    return (rows as List).map((r) => ReviewInput(
          provider: r['provider'] as String,
          overall: (r['overall'] as num).toInt(),
          subRatings: {
            'price': (r['price'] as num?)?.toInt() ?? 0,
            'service': (r['service'] as num?)?.toInt() ?? 0,
            'coverage': (r['coverage'] as num?)?.toInt() ?? 0,
            'speed': (r['speed'] as num?)?.toInt() ?? 0,
          },
          text: r['body'] as String? ?? '',
        )).toList();
  }

  @override
  Future<List<ReviewInput>> fetchAllReviews() async {
    final rows = await _db.from('provider_reviews').select();
    return (rows as List).map((r) => ReviewInput(
          provider: r['provider'] as String,
          overall: (r['overall'] as num).toInt(),
          subRatings: {
            'price': (r['price'] as num?)?.toInt() ?? 0,
            'service': (r['service'] as num?)?.toInt() ?? 0,
            'coverage': (r['coverage'] as num?)?.toInt() ?? 0,
            'speed': (r['speed'] as num?)?.toInt() ?? 0,
          },
          text: r['body'] as String? ?? '',
        )).toList();
  }

  // ── Community ────────────────────────────────────────────────────────────────
  CommunityPost _postFromRow(Map<String, dynamic> r) => CommunityPost(
        id: r['id'] as String,
        author: r['author'] as String,
        avatar: r['avatar'] as String? ?? '',
        channel: r['channel'] as String,
        text: r['body'] as String? ?? '',
        likes: (r['like_count'] as num?)?.toInt() ?? 0,
        replies: (r['reply_count'] as num?)?.toInt() ?? 0,
        timestamp: DateTime.parse(r['created_at'] as String),
        mediaType: r['media_type'] as String?,
        mediaData: r['media_url'] as String?,
        mediaDurationMs: r['media_duration_ms'] as int?,
      );

  @override
  Future<List<CommunityPost>> fetchPosts({String? channel}) async {
    // `community_feed` is the view with like_count / reply_count.
    var query = _db.from('community_feed').select();
    if (channel != null && channel != 'הכל') query = query.eq('channel', channel);
    final rows = await query.order('created_at', ascending: false);
    return (rows as List).map((r) => _postFromRow(r as Map<String, dynamic>)).toList();
  }

  @override
  Future<CommunityPost> createPost(PostInput post) async {
    final row = await _db
        .from('community_posts')
        .insert({'user_id': _uid, ...post.toRow()})
        .select()
        .single();
    return _postFromRow(row);
  }

  @override
  Future<void> deletePost(String id) async {
    await _db.from('community_posts').delete().eq('id', id);
  }

  @override
  Future<List<CommunityReply>> fetchReplies(String postId) async {
    final rows = await _db
        .from('community_replies')
        .select()
        .eq('post_id', postId)
        .order('created_at');
    return (rows as List).map((r) => CommunityReply(
          id: r['id'] as String,
          postId: r['post_id'] as String,
          author: r['author'] as String,
          avatar: r['avatar'] as String? ?? '',
          createdAt: DateTime.parse(r['created_at'] as String),
          text: r['body'] as String? ?? '',
          mediaType: r['media_type'] as String?,
          media: r['media_url'] as String?,
          mediaDurationMs: r['media_duration_ms'] as int?,
        )).toList();
  }

  @override
  Future<void> addReply(ReplyInput reply) async {
    await _db.from('community_replies').insert({'user_id': _uid, ...reply.toRow()});
  }

  @override
  Future<void> setLike(String postId, bool liked) async {
    if (liked) {
      await _db.from('post_likes').upsert({'post_id': postId, 'user_id': _uid});
    } else {
      await _db.from('post_likes').delete().eq('post_id', postId).eq('user_id', _uid!);
    }
  }

  @override
  Future<Set<String>> likedPostIds() async {
    final rows = await _db.from('post_likes').select('post_id').eq('user_id', _uid!);
    return (rows as List).map((r) => r['post_id'] as String).toSet();
  }

  @override
  Future<void> setBookmark(String postId, bool bookmarked) async {
    if (bookmarked) {
      await _db.from('post_bookmarks').upsert({'post_id': postId, 'user_id': _uid});
    } else {
      await _db.from('post_bookmarks').delete().eq('post_id', postId).eq('user_id', _uid!);
    }
  }

  @override
  Future<Set<String>> bookmarkedPostIds() async {
    final rows = await _db.from('post_bookmarks').select('post_id').eq('user_id', _uid!);
    return (rows as List).map((r) => r['post_id'] as String).toSet();
  }
}
