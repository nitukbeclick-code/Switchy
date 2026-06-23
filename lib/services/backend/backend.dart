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
    this.isVerifiedCustomer = false,
  });

  final String provider;
  final int overall; // 1..5
  final Map<String, int> subRatings; // price/service/coverage/speed → 0..5
  final String text;

  /// True when the reviewer was verified as a real customer
  /// (`provider_reviews.is_verified_customer`). Write-side only on the server;
  /// the client reads it to badge trustworthy reviews.
  final bool isVerifiedCustomer;

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
    this.isFlagged = false,
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

  /// True when a moderator flagged the reply (`community_replies.is_flagged`).
  final bool isFlagged;
}

/// A community notification (maps to `community_notifications`) — someone
/// replied, mentioned the user, or a moderator flagged their content.
class CommunityNotification {
  const CommunityNotification({
    required this.id,
    required this.kind,
    this.postId,
    this.replyId,
    this.actor,
    this.readAt,
    required this.createdAt,
  });

  final String id;
  final String kind; // 'reply' | 'mention' | 'flag'
  final String? postId;
  final String? replyId;
  final String? actor;
  final DateTime? readAt;
  final DateTime createdAt;

  bool get isRead => readAt != null;

  factory CommunityNotification.fromJson(Map<String, dynamic> r) =>
      CommunityNotification(
        id: r['id'] as String,
        kind: r['kind'] as String,
        postId: r['post_id'] as String?,
        replyId: r['reply_id'] as String?,
        actor: r['actor'] as String?,
        readAt: DateTime.tryParse(r['read_at'] as String? ?? ''),
        createdAt:
            DateTime.tryParse(r['created_at'] as String? ?? '') ?? DateTime.now(),
      );
}

// ─────────────────────────────────────────────────────────────────────────────
// WhatsApp CRM — admin-only DTOs. These mirror the `crm-api` edge function's
// JSON response shapes (not the raw tables, which are service-role-only and must
// never be queried from the app). Every factory is tolerant of nulls so a
// partial/legacy payload never crashes the dashboard.
// ─────────────────────────────────────────────────────────────────────────────

/// A WhatsApp conversation as the CRM list/overview renders it.
class CrmConversation {
  const CrmConversation({
    required this.conversationId,
    required this.contactId,
    required this.name,
    required this.phone,
    required this.status,
    this.intent,
    this.lastSnippet = '',
    this.lastAt,
    this.leadStatus,
    this.botEnabled = true,
  });

  final String conversationId;
  final String contactId;
  final String name;
  final String phone;
  final String status; // open | bot | human | closed
  final String? intent;
  final String lastSnippet;
  final DateTime? lastAt;
  final String? leadStatus;

  /// The single authoritative gate for the AI bot: when false a human has
  /// "taken over" the conversation and the bot stays silent. Null-tolerant
  /// payloads default to true (bot answering) so a legacy row never reads as
  /// "human active".
  final bool botEnabled;

  factory CrmConversation.fromJson(Map<String, dynamic> r) => CrmConversation(
        conversationId: r['conversationId'] as String? ?? '',
        contactId: r['contactId'] as String? ?? '',
        name: r['name'] as String? ?? '',
        phone: r['phone'] as String? ?? '',
        status: r['status'] as String? ?? 'open',
        intent: r['intent'] as String?,
        lastSnippet: r['lastSnippet'] as String? ?? '',
        lastAt: DateTime.tryParse(r['lastAt'] as String? ?? ''),
        leadStatus: r['leadStatus'] as String?,
        botEnabled: r['botEnabled'] as bool? ?? true,
      );
}

/// A single WhatsApp message inside a thread.
class CrmMessage {
  const CrmMessage({
    required this.id,
    required this.direction,
    required this.actor,
    this.body = '',
    this.createdAt,
  });

  final String id;
  final String direction; // in | out
  final String actor;     // customer | bot | rep
  final String body;
  final DateTime? createdAt;

  factory CrmMessage.fromJson(Map<String, dynamic> r) => CrmMessage(
        id: r['id'] as String? ?? '',
        direction: r['direction'] as String? ?? 'in',
        actor: r['actor'] as String? ?? 'customer',
        body: r['body'] as String? ?? '',
        createdAt: DateTime.tryParse(r['createdAt'] as String? ?? ''),
      );
}

/// The contact behind a CRM thread.
class CrmContact {
  const CrmContact({
    required this.id,
    required this.name,
    required this.phone,
    required this.status,
    this.leadId,
    this.leadStatus,
    this.botEnabled = true,
  });

  final String id;
  final String name;
  final String phone;
  final String status; // new | active | qualified | handed_off | won | lost | blocked
  final String? leadId;
  final String? leadStatus;

  /// The conversation's bot gate, surfaced on the contact so the thread view can
  /// render the takeover banner. False ⇒ a human has taken over and the bot is
  /// silent. Null-tolerant payloads default to true (bot answering).
  final bool botEnabled;

  factory CrmContact.fromJson(Map<String, dynamic> r) => CrmContact(
        id: r['id'] as String? ?? '',
        name: r['name'] as String? ?? '',
        phone: r['phone'] as String? ?? '',
        status: r['status'] as String? ?? 'new',
        leadId: r['leadId'] as String?,
        leadStatus: r['leadStatus'] as String?,
        botEnabled: r['botEnabled'] as bool? ?? true,
      );
}

/// A full thread: the contact plus its messages (oldest → newest).
class CrmThread {
  const CrmThread({required this.contact, required this.messages});

  final CrmContact contact;
  final List<CrmMessage> messages;

  factory CrmThread.fromJson(Map<String, dynamic> r) => CrmThread(
        contact:
            CrmContact.fromJson((r['contact'] as Map?)?.cast<String, dynamic>() ?? const {}),
        messages: ((r['messages'] as List?) ?? const [])
            .map((m) => CrmMessage.fromJson((m as Map).cast<String, dynamic>()))
            .toList(),
      );
}

/// The CRM overview: pipeline counts + the most-recent conversations.
class CrmOverview {
  const CrmOverview({required this.pipeline, required this.recent});

  /// Lead pipeline counts keyed by status: new / contacted / won / lost.
  final Map<String, int> pipeline;
  final List<CrmConversation> recent;

  factory CrmOverview.fromJson(Map<String, dynamic> r) => CrmOverview(
        pipeline: ((r['pipeline'] as Map?) ?? const {})
            .map((k, v) => MapEntry(k as String, (v as num?)?.toInt() ?? 0)),
        recent: ((r['recent'] as List?) ?? const [])
            .map((c) => CrmConversation.fromJson((c as Map).cast<String, dynamic>()))
            .toList(),
      );
}

/// A sales lead in the CRM leads board.
class CrmLead {
  const CrmLead({
    required this.id,
    required this.name,
    required this.phone,
    this.provider,
    this.source,
    required this.status,
    this.createdAt,
  });

  final String id;
  final String name;
  final String phone;
  final String? provider;
  final String? source;
  final String status; // new | contacted | won | lost
  final DateTime? createdAt;

  factory CrmLead.fromJson(Map<String, dynamic> r) => CrmLead(
        id: r['id'] as String? ?? '',
        name: r['name'] as String? ?? '',
        phone: r['phone'] as String? ?? '',
        provider: r['provider'] as String?,
        source: r['source'] as String?,
        status: r['status'] as String? ?? 'new',
        createdAt: DateTime.tryParse(r['createdAt'] as String? ?? ''),
      );
}

/// One cheaper plan the bill analyzer surfaced (mirrors a `suggestions[]` entry
/// from the `site-bill-analyzer` edge function: `{name, provider, price,
/// annualSaving}`). Every field is null-tolerant so a partial payload never
/// crashes the UI.
class BillSuggestion {
  const BillSuggestion({
    required this.name,
    required this.provider,
    required this.price,
    required this.annualSaving,
  });

  final String name;
  final String provider;
  final int price;
  final int annualSaving;

  factory BillSuggestion.fromJson(Map<String, dynamic> r) => BillSuggestion(
        name: r['name'] as String? ?? '',
        provider: r['provider'] as String? ?? '',
        price: (r['price'] as num?)?.round() ?? 0,
        annualSaving: (r['annualSaving'] as num?)?.round() ?? 0,
      );
}

/// The result of analysing a photographed telecom bill via the
/// `site-bill-analyzer` edge function. The image is sent for analysis only and
/// is NEVER stored client-side. [provider]/[category] are empty and
/// [currentSpend] is 0 when the photo was unreadable — in that case [error]
/// carries a friendly Hebrew explanation and [suggestions] is empty.
///
/// Response shape (edge fn): `{provider, currentSpend, category, suggestions,
/// note?, error?}` where `category ∈ cellular|internet|tv|triple|abroad|""`.
class BillAnalysis {
  const BillAnalysis({
    required this.provider,
    required this.currentSpend,
    required this.category,
    required this.suggestions,
    this.note,
    this.error,
  });

  final String provider;
  final int currentSpend;
  final String category;
  final List<BillSuggestion> suggestions;
  final String? note;

  /// Friendly Hebrew message when the bill couldn't be read (the edge function
  /// returns this in a 200 body so the client never crashes).
  final String? error;

  /// True when the analyzer extracted a usable amount we can pre-fill.
  bool get isReadable => error == null && currentSpend > 0;

  factory BillAnalysis.fromJson(Map<String, dynamic> r) => BillAnalysis(
        provider: r['provider'] as String? ?? '',
        currentSpend: (r['currentSpend'] as num?)?.round() ?? 0,
        category: r['category'] as String? ?? '',
        suggestions: ((r['suggestions'] as List?) ?? const [])
            .map((s) => BillSuggestion.fromJson((s as Map).cast<String, dynamic>()))
            .toList(),
        note: r['note'] as String?,
        error: r['error'] as String?,
      );
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

  // ── Bill OCR ─────────────────────────────────────────────────────────────────
  /// Analyses a photographed telecom bill via the `site-bill-analyzer` edge
  /// function: extracts the provider, the monthly amount (₪) and the category,
  /// and returns up to 3 cheaper plans. [imageDataUri] is a base64 data-URI
  /// (e.g. from [MediaService.pickImageDataUri]); it is sent for analysis only
  /// and is NEVER stored. Returns null only on a transport/parse failure (the
  /// caller shows a friendly Hebrew error); an unreadable photo still returns a
  /// [BillAnalysis] whose [BillAnalysis.error] carries the explanation.
  Future<BillAnalysis?> analyzeBill(String imageDataUri);

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

  // ── Moderation & notifications ───────────────────────────────────────────────
  /// Reports a post or reply for moderation (inserts a `community_reports` row as
  /// the current user). [targetType] is 'post' | 'reply'.
  Future<void> reportContent({
    required String targetType,
    required String targetId,
    required String reason,
    String? body,
  });

  /// The user's own community notifications, newest first.
  Future<List<CommunityNotification>> fetchCommunityNotifications();

  /// Marks all of the user's unread community notifications as read.
  Future<void> markCommunityNotificationsRead();

  // ── WhatsApp CRM (admin-only) ────────────────────────────────────────────────
  // The app NEVER touches the whatsapp_* / leads tables directly — those are
  // service-role-only. Everything below goes through the `crm-api` edge function,
  // which gates on profiles.is_admin server-side. [LocalBackend] fakes it all so
  // the dashboard renders offline; [SupabaseBackend] calls functions.invoke.

  /// True when the signed-in user is an admin (`profiles.is_admin`). Gates the
  /// CRM entry point in the UI; the edge function re-checks authoritatively.
  Future<bool> fetchIsAdmin();

  /// Pipeline counts + the most-recent conversations for the CRM home tab.
  Future<CrmOverview> crmOverview();

  /// Conversation list, optionally filtered by [status] / free-text [search].
  Future<List<CrmConversation>> crmListConversations({String? status, String? search});

  /// Full thread (contact + messages, oldest→newest) for one conversation.
  Future<CrmThread> crmGetThread(String conversationId);

  /// Sends a rep reply: inserts an out/rep message, then best-effort WhatsApp send.
  /// Also takes over (sets bot_enabled=false) server-side and logs a crm_event.
  Future<void> crmSendReply(String conversationId, String body);

  /// A human takes over a conversation: the AI bot goes silent (bot_enabled=false,
  /// status='human') and only stores the customer's messages until [crmHandBack].
  Future<void> crmTakeOver(String conversationId);

  /// Returns control to the AI bot (bot_enabled=true, status='bot').
  Future<void> crmHandBack(String conversationId);

  /// Emits void whenever a `crm_events` row is inserted (a rep reply, takeover,
  /// hand-back…). Lets the dashboard refresh instantly instead of waiting for
  /// the poll. [LocalBackend] returns an empty stream; [SupabaseBackend] opens a
  /// Realtime channel scoped to the public.crm_events table.
  Stream<void> crmEventStream();

  /// Updates a contact's lifecycle status.
  Future<void> crmSetContactStatus(String contactId, String status);

  /// Moves a lead to a new pipeline status (also audited server-side).
  Future<void> crmSetLeadStatus(String leadId, String status);

  /// The leads board, optionally filtered by [status].
  Future<List<CrmLead>> crmListLeads({String? status});
}
