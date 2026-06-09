import '../../models.dart';
import 'backend.dart';

/// On-device [Backend] — the default. Single-user (this device), in-memory plus
/// whatever the caller persists. It mirrors the server semantics so swapping in
/// the Supabase implementation later changes behaviour as little as possible:
/// reviews are unique per provider, tracked plans are newest-first, etc.
class LocalBackend implements Backend {
  final List<LeadInput> _leads = [];
  final List<TrackedPlan> _tracked = [];
  final Map<String, ReviewInput> _reviewByProvider = {}; // unique per provider
  final List<CommunityPost> _posts = [];
  final Map<String, List<CommunityReply>> _replies = {};
  final Set<String> _liked = {};
  final Set<String> _bookmarked = {};
  int _seq = 0;

  String _nextId() => '${DateTime.now().microsecondsSinceEpoch}_${_seq++}';

  // Exposed for inspection/tests; not part of the Backend contract.
  List<LeadInput> get submittedLeads => List.unmodifiable(_leads);

  @override
  Future<void> upsertProfile({required String name, required String phone, String? email}) async {
    // No-op locally — profile is managed by AppState + SharedPreferences.
  }

  @override
  Future<void> addSavings(int amount) async {
    // No-op locally.
  }

  @override
  Future<void> upsertBills(Map<String, int> bills) async {
    // No-op locally — bills are managed by AppState + SharedPreferences.
  }

  @override
  Future<Map<String, int>?> fetchBills() async => null;

  @override
  Future<void> upsertQuiz(Map<String, dynamic> quiz) async {
    // No-op locally — quiz is managed by AppState + SharedPreferences.
  }

  @override
  Future<void> setRenewalReminder(bool enabled) async {
    // No-op locally.
  }

  @override
  Future<void> submitLead(LeadInput lead) async {
    _leads.add(lead);
  }

  @override
  Stream<int> leadStepStream() => Stream.empty();

  @override
  Future<List<TrackedPlan>> fetchTrackedPlans() async =>
      List.unmodifiable(_tracked);

  @override
  Future<void> addTrackedPlan(TrackedPlan plan) async {
    _tracked.removeWhere((p) => p.id == plan.id);
    _tracked.insert(0, plan); // newest first, like the server's created_at desc
  }

  @override
  Future<void> removeTrackedPlan(String id) async {
    _tracked.removeWhere((p) => p.id == id);
  }

  @override
  Future<void> upsertReview(ReviewInput review) async {
    _reviewByProvider[review.provider] = review; // unique(user, provider)
  }

  @override
  Future<List<ReviewInput>> reviewsForProvider(String provider) async {
    final r = _reviewByProvider[provider];
    return r == null ? const [] : [r];
  }

  @override
  Future<List<ReviewInput>> fetchAllReviews() async =>
      List.unmodifiable(_reviewByProvider.values);

  // ── Community ────────────────────────────────────────────────────────────────
  // Note: this is the backend's own store. The live local feed still reads from
  // AppState + seed data; community_widget moves onto appBackend during the
  // Supabase cutover (see supabase/README.md), so the seed feed isn't lost now.

  @override
  Future<List<CommunityPost>> fetchPosts({String? channel}) async {
    final list = channel == null || channel == 'הכל'
        ? _posts
        : _posts.where((p) => p.channel == channel).toList();
    return List.unmodifiable(list);
  }

  @override
  Future<CommunityPost> createPost(PostInput post) async {
    final created = CommunityPost(
      id: _nextId(),
      author: post.author,
      avatar: post.avatar,
      channel: post.channel,
      text: post.text,
      likes: 0,
      replies: 0,
      timestamp: DateTime.now(),
      mediaType: post.mediaType,
      mediaData: post.media,
      mediaDurationMs: post.mediaDurationMs,
    );
    _posts.insert(0, created); // newest first
    return created;
  }

  @override
  Future<void> deletePost(String id) async {
    _posts.removeWhere((p) => p.id == id);
    _replies.remove(id);
    _liked.remove(id);
    _bookmarked.remove(id);
  }

  @override
  Future<List<CommunityReply>> fetchReplies(String postId) async =>
      List.unmodifiable(_replies[postId] ?? const []);

  @override
  Future<void> addReply(ReplyInput reply) async {
    (_replies[reply.postId] ??= []).add(CommunityReply(
      id: _nextId(),
      postId: reply.postId,
      author: reply.author,
      avatar: reply.avatar,
      createdAt: DateTime.now(),
      text: reply.text,
      mediaType: reply.mediaType,
      media: reply.media,
      mediaDurationMs: reply.mediaDurationMs,
    ));
  }

  @override
  Future<void> setLike(String postId, bool liked) async {
    liked ? _liked.add(postId) : _liked.remove(postId);
  }

  @override
  Future<Set<String>> likedPostIds() async => Set.unmodifiable(_liked);

  @override
  Future<void> setBookmark(String postId, bool bookmarked) async {
    bookmarked ? _bookmarked.add(postId) : _bookmarked.remove(postId);
  }

  @override
  Future<Set<String>> bookmarkedPostIds() async => Set.unmodifiable(_bookmarked);
}

/// The backend the app talks to. Defaults to on-device storage; `main.dart`
/// swaps in `SupabaseBackend()` at startup when SUPABASE_URL / SUPABASE_ANON_KEY
/// are provided, so no-key runs and CI stay fully local.
Backend appBackend = LocalBackend();
