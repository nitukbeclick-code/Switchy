import '../../models.dart';

/// Input for capturing a sales lead (maps to the `leads` table).
class LeadInput {
  const LeadInput({
    required this.name,
    required this.phone,
    this.email,
    this.provider,
    this.planId,
    this.callbackTime,
  });

  final String name;
  final String phone;
  final String? email;
  final String? provider;
  final String? planId;
  final String? callbackTime; // now / noon / evening / tomorrow

  Map<String, dynamic> toRow() => {
        'name': name,
        'phone': phone,
        'email': email,
        'provider': provider,
        'plan_id': planId,
        'callback_time': callbackTime,
      };
}

/// Input for a provider review — one per user per provider (maps to
/// `provider_reviews`, with the `unique(user_id, provider)` constraint).
class ReviewInput {
  const ReviewInput({
    required this.provider,
    required this.overall,
    required this.subRatings,
    this.text = '',
  });

  final String provider;
  final int overall; // 1..5
  final Map<String, int> subRatings; // price/service/coverage/speed → 0..5
  final String text;

  Map<String, dynamic> toRow() => {
        'provider': provider,
        'overall': overall,
        'price': subRatings['price'] ?? 0,
        'service': subRatings['service'] ?? 0,
        'coverage': subRatings['coverage'] ?? 0,
        'speed': subRatings['speed'] ?? 0,
        'body': text,
      };
}

/// Input for creating a community post (maps to `community_posts`). [media] is a
/// Storage URL on the server, or a data-URI locally.
class PostInput {
  const PostInput({
    required this.author,
    required this.avatar,
    required this.channel,
    this.text = '',
    this.mediaType,
    this.media,
    this.mediaDurationMs,
  });

  final String author;
  final String avatar;
  final String channel;
  final String text;
  final String? mediaType; // image | video | audio
  final String? media;
  final int? mediaDurationMs;

  Map<String, dynamic> toRow() => {
        'author': author,
        'avatar': avatar,
        'channel': channel,
        'body': text,
        'media_type': mediaType,
        'media_url': media,
        'media_duration_ms': mediaDurationMs,
      };
}

/// Input for adding a reply (maps to `community_replies`).
class ReplyInput {
  const ReplyInput({
    required this.postId,
    required this.author,
    required this.avatar,
    this.text = '',
    this.mediaType,
    this.media,
    this.mediaDurationMs,
  });

  final String postId;
  final String author;
  final String avatar;
  final String text;
  final String? mediaType;
  final String? media;
  final int? mediaDurationMs;

  Map<String, dynamic> toRow() => {
        'post_id': postId,
        'author': author,
        'avatar': avatar,
        'body': text,
        'media_type': mediaType,
        'media_url': media,
        'media_duration_ms': mediaDurationMs,
      };
}

/// A reply on a community post (the app stores these as maps; this is the typed
/// shape the backend returns).
class CommunityReply {
  const CommunityReply({
    required this.id,
    required this.postId,
    required this.author,
    required this.avatar,
    required this.createdAt,
    this.text = '',
    this.mediaType,
    this.media,
    this.mediaDurationMs,
  });

  final String id;
  final String postId;
  final String author;
  final String avatar;
  final DateTime createdAt;
  final String text;
  final String? mediaType;
  final String? media;
  final int? mediaDurationMs;
}

/// The app's data backend — the seam between the UI and where shared data lives.
///
/// [LocalBackend] keeps everything on-device (today's behaviour). A
/// `SupabaseBackend` (see `supabase_backend.dart.example`) implements the *same*
/// contract against the tables in `supabase/schema.sql`, so moving to the server
/// is a one-line swap of [appBackend] — no screen has to change.
///
/// Scope here is the user-owned data with clean mappings (leads, tracked plans,
/// reviews); the community feed (posts/replies/media) is the next domain to add.
abstract interface class Backend {
  // ── Leads ──────────────────────────────────────────────────────────────────
  Future<void> submitLead(LeadInput lead);

  // ── Renewal radar — tracked plans ────────────────────────────────────────────
  Future<List<TrackedPlan>> fetchTrackedPlans();
  Future<void> addTrackedPlan(TrackedPlan plan);
  Future<void> removeTrackedPlan(String id);

  // ── Provider reviews ─────────────────────────────────────────────────────────
  Future<void> upsertReview(ReviewInput review);
  Future<List<ReviewInput>> reviewsForProvider(String provider);

  // ── Community ────────────────────────────────────────────────────────────────
  Future<List<CommunityPost>> fetchPosts({String? channel});
  Future<CommunityPost> createPost(PostInput post);
  Future<void> deletePost(String id);
  Future<List<CommunityReply>> fetchReplies(String postId);
  Future<void> addReply(ReplyInput reply);
  Future<void> setLike(String postId, bool liked);
  Future<Set<String>> likedPostIds();
  Future<void> setBookmark(String postId, bool bookmarked);
  Future<Set<String>> bookmarkedPostIds();
}
