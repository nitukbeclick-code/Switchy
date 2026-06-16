import 'dart:async';

import '../../data.dart';
import '../../models.dart';
import '../meeting_slots.dart';
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
  List<MeetingInput> get submittedMeetings => List.unmodifiable(_meetings);

  /// Demo pacing: how long after [requestMeeting] the simulated rep "confirms".
  /// Tests set this to [Duration.zero]; the real flow is Supabase-only.
  Duration demoConfirmDelay = const Duration(seconds: 6);

  @override
  Future<void> upsertProfile({required String name, required String phone, String? email}) async {
    // No-op locally — profile is managed by AppState + SharedPreferences.
  }

  @override
  Future<({String name, String phone, String? email, int totalSavings, bool renewalReminders})?> fetchProfile() async => null;

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
  Future<void> trackPlanView({required String planId, required String provider, required String category}) async {
    // No-op locally.
  }

  @override
  Future<void> upsertQuiz(Map<String, dynamic> quiz) async {
    // No-op locally — quiz is managed by AppState + SharedPreferences.
  }

  @override
  Future<Map<String, dynamic>?> fetchQuiz() async => null;

  @override
  Future<void> setRenewalReminder(bool enabled) async {
    // No-op locally.
  }

  @override
  Future<void> submitLead(LeadInput lead) async {
    _leads.add(lead);
  }

  @override
  Future<int> fetchLeadStep() async => 0;

  @override
  Stream<int> leadStepStream() => const Stream.empty();

  // ── Video meetings (Zoom) — simulated demo flow ─────────────────────────────
  // Without Supabase there is no rep team; the booking is stored locally and a
  // pretend confirmation (with a placeholder Zoom link) arrives after
  // [demoConfirmDelay], so the full pending→confirmed UX can be exercised.
  // The UI labels this clearly as demo mode.

  final List<MeetingInput> _meetings = [];
  BookedMeeting? _latestMeeting;
  StreamController<BookedMeeting>? _meetingCtrl;
  Timer? _demoTimer;

  @override
  Future<void> requestMeeting(MeetingInput input) async {
    _meetings.add(input);
    final meeting = BookedMeeting(
      id: _nextId(),
      status: MeetingStatus.pending,
      provider: input.provider,
      meetingDate: input.meetingDate,
      slot: input.slot,
      startsAt: meetingLocalStart(input.meetingDate, input.slot).toUtc(),
      createdAt: DateTime.now(),
    );
    _latestMeeting = meeting;
    _demoTimer?.cancel(); // a re-book supersedes the previous pretend rep
    _demoTimer = Timer(demoConfirmDelay, () {
      final m = _latestMeeting;
      if (m == null || m.id != meeting.id) return; // superseded
      _latestMeeting = m.copyWith(
        status: MeetingStatus.confirmed,
        joinUrl: 'https://zoom.us/j/0000000000',
      );
      _meetingCtrl?.add(_latestMeeting!);
    });
  }

  @override
  Future<BookedMeeting?> fetchLatestMeeting() async => _latestMeeting;

  @override
  Stream<BookedMeeting> meetingStream() {
    _meetingCtrl ??= StreamController<BookedMeeting>.broadcast();
    return _meetingCtrl!.stream;
  }

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
  Stream<void> communityChanges() => const Stream<void>.empty();

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

  @override
  Future<void> reportPost(String postId, String reason) => Future.value();

  // ── Plan catalogue ────────────────────────────────────────────────────────────
  @override
  Future<List<Plan>> fetchPlans({
    String? category,
    String? provider,
    bool flashDealsOnly = false,
  }) {
    // Flash-deal flag is not stored on the local Plan model; when flashDealsOnly
    // is requested in offline mode we return an empty list rather than showing
    // all plans (which would be misleading).
    if (flashDealsOnly) return Future.value(const []);

    var plans = allPlans;
    if (category != null) plans = plans.where((p) => p.cat == category).toList();
    if (provider != null) plans = plans.where((p) => p.provider == provider).toList();
    return Future.value(List.unmodifiable(plans));
  }

  @override
  Future<void> updatePlanPrice(String planId, {required int price, double? priceExact}) async {
    // No DB offline — mutate the in-memory catalogue so the admin sees the edit
    // take effect this session (and the change rides the same hydration path).
    final cur = planById(planId);
    if (cur == null) return;
    overridePlan(cur.copyWith(price: price, priceExact: priceExact));
  }

  // ── Price history ──────────────────────────────────────────────────────────
  // Local/offline mode keeps no price ledger — return empty so the sparkline
  // falls back to its deterministic synthetic series.
  @override
  Future<List<({DateTime capturedAt, int price})>> fetchPriceHistory(
    String planId, {
    int days = 30,
  }) async =>
      const [];
}

/// The backend the app talks to. Defaults to on-device storage; `main.dart`
/// swaps in `SupabaseBackend()` at startup when SUPABASE_URL / SUPABASE_ANON_KEY
/// are provided, so no-key runs and CI stay fully local.
Backend appBackend = LocalBackend();
