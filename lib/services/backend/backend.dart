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
    this.source,
    this.notes,
    this.termsAcceptedAt,
    this.privacyAcceptedAt,
    this.marketingAcceptedAt,
  });

  final String name;
  final String phone;
  final String? email;
  final String? provider;
  final String? planId;
  final String? callbackTime; // now / noon / evening / tomorrow
  final String? source;       // form | plan | compare | advisor | callback | porting
  final String? notes;        // free-text context for the rep
  // Legal consent (Israeli Privacy/Spam Law) — ISO timestamps; the server's
  // leads_consent_stamp trigger re-stamps them authoritatively. Mandatory
  // terms+privacy are gated client-side; marketing is null unless opted in.
  final String? termsAcceptedAt;
  final String? privacyAcceptedAt;
  final String? marketingAcceptedAt;

  Map<String, dynamic> toRow() => {
        'name': name,
        'phone': phone,
        'email': email,
        'provider': provider,
        'plan_id': planId,
        'callback_time': callbackTime,
        'source': source,
        'notes': notes,
        'terms_accepted_at': termsAcceptedAt,
        'privacy_accepted_at': privacyAcceptedAt,
        'marketing_accepted_at': marketingAcceptedAt,
      };
}

/// Input for booking a Zoom video sales meeting (maps to the `meetings`
/// table). The server's `meetings_guard()` trigger re-validates the schedule
/// (tomorrow+, Sun–Thu / Friday-morning slots) and computes the authoritative
/// UTC instant (`starts_at`) from the Israel wall time — the client never
/// sends one.
class MeetingInput {
  const MeetingInput({
    required this.name,
    required this.phone,
    this.email,
    this.provider,
    this.planId,
    required this.meetingDate, // 'YYYY-MM-DD' (Israel-local calendar date)
    required this.slot,        // 'HH:MM' on the 30-minute grid
    this.notes,
    this.source,               // plan | callback | home | form
    this.termsAcceptedAt,
    this.privacyAcceptedAt,
    this.marketingAcceptedAt,
  });

  final String name;
  final String phone;
  final String? email;
  final String? provider;
  final String? planId;
  final String meetingDate;
  final String slot;
  final String? notes;
  final String? source;
  final String? termsAcceptedAt;
  final String? privacyAcceptedAt;
  final String? marketingAcceptedAt;

  Map<String, dynamic> toRow() => {
        'name': name,
        'phone': phone,
        'email': email,
        'provider': provider,
        'plan_id': planId,
        'meeting_date': meetingDate,
        'slot': slot,
        'notes': notes,
        'source': source,
        'terms_accepted_at': termsAcceptedAt,
        'privacy_accepted_at': privacyAcceptedAt,
        'marketing_accepted_at': marketingAcceptedAt,
      };
}

/// Lifecycle of a meeting request. `noRep` ↔ the DB's 'no_rep'.
enum MeetingStatus { pending, confirmed, noRep, cancelled, expired, completed }

MeetingStatus meetingStatusFromDb(String? s) => switch (s) {
      'confirmed' => MeetingStatus.confirmed,
      'no_rep' => MeetingStatus.noRep,
      'cancelled' => MeetingStatus.cancelled,
      'expired' => MeetingStatus.expired,
      'completed' => MeetingStatus.completed,
      _ => MeetingStatus.pending,
    };

String meetingStatusToDb(MeetingStatus s) => switch (s) {
      MeetingStatus.confirmed => 'confirmed',
      MeetingStatus.noRep => 'no_rep',
      MeetingStatus.cancelled => 'cancelled',
      MeetingStatus.expired => 'expired',
      MeetingStatus.completed => 'completed',
      MeetingStatus.pending => 'pending',
    };

/// A meeting as the app reads it back — only the client-granted columns
/// (status + schedule + join link); rep identity stays server-side.
class BookedMeeting {
  const BookedMeeting({
    required this.id,
    required this.status,
    this.provider,
    required this.meetingDate, // 'YYYY-MM-DD' Israel wall date (display)
    required this.slot,        // 'HH:MM' Israel wall time (display)
    required this.startsAt,    // UTC instant (countdowns/reminders)
    this.joinUrl,
    required this.createdAt,
  });

  final String id;
  final MeetingStatus status;
  final String? provider;
  final String meetingDate;
  final String slot;
  final DateTime startsAt;
  final String? joinUrl;
  final DateTime createdAt;

  BookedMeeting copyWith({MeetingStatus? status, String? joinUrl}) => BookedMeeting(
        id: id,
        status: status ?? this.status,
        provider: provider,
        meetingDate: meetingDate,
        slot: slot,
        startsAt: startsAt,
        joinUrl: joinUrl ?? this.joinUrl,
        createdAt: createdAt,
      );
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
    this.planId,
  });

  final String author;
  final String avatar;
  final String channel;
  final String text;
  final String? mediaType; // image | video | audio
  final String? media;
  final int? mediaDurationMs;
  final String? planId;

  Map<String, dynamic> toRow() => {
        'author': author,
        'avatar': avatar,
        'channel': channel,
        'body': text,
        'media_type': mediaType,
        'media_url': media,
        'media_duration_ms': mediaDurationMs,
        'plan_id': planId,
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
/// [LocalBackend] keeps everything on-device (the default). `SupabaseBackend`
/// (see `supabase_backend.dart`) implements the *same* contract against the
/// tables in `supabase/schema.sql`; `main.dart` swaps in [appBackend] at startup
/// when Supabase keys are provided — no screen has to change.
///
/// Scope here is the user-owned data with clean mappings (leads, tracked plans,
/// reviews); the community feed (posts/replies/media) is the next domain to add.
abstract interface class Backend {
  // ── User profile ─────────────────────────────────────────────────────────────
  /// Upserts the user's identity into the `profiles` table. No-op when the
  /// user isn't signed in (anonymous session without a real uid is fine —
  /// the Supabase anon sign-in sets uid, so this always runs in production).
  Future<void> upsertProfile({required String name, required String phone, String? email});

  /// Fetches the user's profile row. Returns null if no profile exists yet.
  Future<({String name, String phone, String? email, int totalSavings, bool renewalReminders})?> fetchProfile();

  /// Increments the user's `total_savings` in the profiles table. Fire-and-forget.
  Future<void> addSavings(int amount);

  /// Persists the user's personalized bills map to `profiles.bills`. Fire-and-forget.
  Future<void> upsertBills(Map<String, int> bills);

  /// Fetches saved bills from `profiles.bills`. Returns null if no data.
  Future<Map<String, int>?> fetchBills();

  /// Persists quiz preferences to `profiles.quiz`. Fire-and-forget.
  Future<void> upsertQuiz(Map<String, dynamic> quiz);

  /// Fetches saved quiz preferences from `profiles.quiz`. Returns null if not set.
  Future<Map<String, dynamic>?> fetchQuiz();

  /// Persists the renewal-reminders opt-in flag to `profiles`. Fire-and-forget.
  Future<void> setRenewalReminder(bool enabled);

  // ── Analytics ────────────────────────────────────────────────────────────────
  /// Records a plan page-view for demand analytics. Fire-and-forget.
  Future<void> trackPlanView({required String planId, required String provider, required String category});

  // ── Leads ──────────────────────────────────────────────────────────────────
  Future<void> submitLead(LeadInput lead);

  /// Returns the current step for the user's most-recent lead, or 0 if none.
  /// Steps: 1–4 for the in-progress → completed flow, and -1 for a terminal
  /// 'lost' lead (the rep closed the pipeline). Called on tracker mount so
  /// offline users see the correct state.
  Future<int> fetchLeadStep();

  /// Emits an int whenever the lead's `status` changes in the DB.
  /// Maps: 'new'→1, 'contacted'→2, 'won'→4, 'lost'→-1 (terminal/closed).
  /// [LocalBackend] returns an empty stream; [SupabaseBackend] opens a
  /// Realtime channel so the tracker auto-advances when the rep updates
  /// the lead from the dashboard.
  Stream<int> leadStepStream();

  // ── Video meetings (Zoom) ────────────────────────────────────────────────────
  /// Books a video-meeting request. Server-side the `meetings_guard()` trigger
  /// validates schedule + rate limits and a Telegram card reaches the rep team.
  Future<void> requestMeeting(MeetingInput input);

  /// The user's newest meeting request, or null if none.
  Future<BookedMeeting?> fetchLatestMeeting();

  /// Emits the meeting whenever its row changes (rep confirmed and the Zoom
  /// link landed, no rep was available, it expired…). [LocalBackend] simulates
  /// a pending→confirmed transition for demo; [SupabaseBackend] opens a
  /// Realtime channel scoped to the signed-in user.
  Stream<BookedMeeting> meetingStream();

  // ── Renewal radar — tracked plans ────────────────────────────────────────────
  Future<List<TrackedPlan>> fetchTrackedPlans();
  Future<void> addTrackedPlan(TrackedPlan plan);
  Future<void> removeTrackedPlan(String id);

  // ── Provider reviews ─────────────────────────────────────────────────────────
  Future<void> upsertReview(ReviewInput review);
  Future<List<ReviewInput>> reviewsForProvider(String provider);
  Future<List<ReviewInput>> fetchAllReviews();

  // ── Community ────────────────────────────────────────────────────────────────
  /// Emits void whenever community_posts changes in the DB (insert/update/delete).
  /// [LocalBackend] returns an empty stream; [SupabaseBackend] opens a Realtime
  /// channel so the feed refreshes automatically when someone posts.
  Stream<void> communityChanges();

  Future<List<CommunityPost>> fetchPosts({String? channel});
  Future<CommunityPost> createPost(PostInput post);
  Future<void> deletePost(String id);
  Future<List<CommunityReply>> fetchReplies(String postId);
  Future<void> addReply(ReplyInput reply);
  Future<void> setLike(String postId, bool liked);
  Future<Set<String>> likedPostIds();
  Future<void> setBookmark(String postId, bool bookmarked);
  Future<Set<String>> bookmarkedPostIds();

  /// Reports a post for moderation.
  /// [postId] — the post being reported.
  /// [reason] — one of: 'ספאם', 'לא הולם', 'מידע שגוי'.
  Future<void> reportPost(String postId, String reason);

  // ── Plan catalogue ────────────────────────────────────────────────────────────
  /// Fetches plans from the catalogue with optional filters.
  /// [category] restricts to one of 'cellular','internet','tv','triple','abroad'.
  /// [provider] filters by exact provider name.
  /// [flashDealsOnly] returns only rows where is_flash_deal = true.
  /// Returns an empty list on error so callers can fall back gracefully.
  Future<List<Plan>> fetchPlans({
    String? category,
    String? provider,
    bool flashDealsOnly = false,
  });

  // ── Price history ──────────────────────────────────────────────────────────
  /// Chronological price points for a plan (oldest→newest, last [days] days),
  /// from the `plan_prices` ledger. Powers the history sparkline and price-drop
  /// detection. Returns an empty list when unavailable (no backend / no rows /
  /// error) so callers fall back to a deterministic synthetic series.
  Future<List<({DateTime capturedAt, int price})>> fetchPriceHistory(
    String planId, {
    int days = 30,
  });
}
