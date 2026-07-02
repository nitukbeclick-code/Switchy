import 'dart:async';

import '../../core/zoom_providers.dart' show kZoomSupportedProviders;
import '../../data.dart' show compiledPlans;
import '../../models.dart';
import '../meeting_slots.dart';
import 'backend.dart';
import '../referral_code.dart';

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

  // ── AI advisor — no edge function offline ────────────────────────────────────
  // There's no site-ai-chat edge agent without Supabase, so this always throws;
  // the advisor widget catches it and falls back to the on-device AdvisorEngine.
  @override
  Future<Map<String, dynamic>> aiChat(Map<String, dynamic> body) async {
    throw StateError('aiChat unavailable offline (LocalBackend)');
  }

  // ── Live catalogue — the compiled snapshot offline ───────────────────────────
  // Without Supabase there is no live `public.plans` table, so the catalogue is
  // the compiled const lists baked into the binary (the offline / cold-start
  // last-known-good). It never changes at runtime, so [catalogueChanges] is an
  // empty stream.
  @override
  Future<List<Plan>> fetchCatalogue() async => compiledPlans;

  @override
  Stream<void> catalogueChanges() => const Stream<void>.empty();

  // ── Provider capabilities — the const fallback offline ───────────────────────
  // No `provider_capabilities` table without Supabase, so the live set IS the
  // compiled const list (the same fallback core/zoom_providers.dart uses on a
  // failed fetch). Keeps the booking gate honest and identical offline.
  @override
  Future<Set<String>> fetchZoomSupportedProviders() async =>
      kZoomSupportedProviders;

  // ── Real-time deals — no price ledger offline ────────────────────────────────
  // The plan_price_history ledger only exists in Supabase, so offline the deals
  // feed shows an honest empty state (no fabricated drops).
  @override
  Future<List<PriceSnapshot>> fetchPriceSnapshots({int limit = 400}) async =>
      const [];

  @override
  Stream<void> priceHistoryChanges() => const Stream<void>.empty();

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

  // ── Bill OCR — deterministic fake ────────────────────────────────────────────
  // Without Supabase there is no Gemini Vision; we return a fixed, readable
  // analysis (cellular, ₪119 with two cheaper plans) so the camera→pre-fill UX
  // can be exercised fully offline. The image is inspected only for emptiness
  // and never stored.
  @override
  Future<BillAnalysis?> analyzeBill(String imageDataUri) async {
    if (imageDataUri.trim().isEmpty) return null;
    return const BillAnalysis(
      provider: 'פרטנר',
      currentSpend: 119,
      category: 'cellular',
      suggestions: [
        BillSuggestion(name: 'סלולר 100GB', provider: 'רמי לוי', price: 29, annualSaving: 1080),
        BillSuggestion(name: 'אנלימיטד', provider: 'גולן טלקום', price: 39, annualSaving: 960),
      ],
      note: 'מצאנו 2 מסלולים זולים יותר באותה קטגוריה.',
    );
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

  @override
  Future<({int step, DateTime? createdAt})> fetchLeadInfo() async =>
      // No leads table offline — no step and, crucially, no date to show
      // (the tracker renders no timestamp rather than fabricating one).
      (step: 0, createdAt: null);

  // ── Video meetings (Zoom) — simulated demo flow ─────────────────────────────
  // Without Supabase there is no rep team; the booking is stored locally and a
  // pretend confirmation (with a placeholder Zoom link) arrives after
  // [demoConfirmDelay], so the full pending→confirmed UX can be exercised.
  // The UI labels this clearly as demo mode.

  final List<MeetingInput> _meetings = [];
  BookedMeeting? _latestMeeting;
  StreamController<BookedMeeting>? _meetingCtrl;
  Timer? _demoTimer;

  // Email-OTP gate — there is no `meeting-book` edge function offline, so the
  // verification is a no-op that always succeeds: any non-empty address gets a
  // "code sent" and any non-empty code verifies. This keeps the full
  // request → verify → book UX exercisable in demo mode and in widget tests.
  @override
  Future<({bool ok, bool sent})> requestMeetingEmailCode(String email, {String? name}) async =>
      (ok: email.trim().isNotEmpty, sent: email.trim().isNotEmpty);

  @override
  Future<({bool ok, String? error})> verifyMeetingEmailCode(String email, String code) async {
    if (code.trim().isEmpty) {
      return (ok: false, error: 'יש להזין את הקוד שנשלח לאימייל');
    }
    return (ok: true, error: null);
  }

  @override
  Future<String> issueReferralCode({String? name}) async => ReferralCode.make();

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
  Future<void> addTrackedPlan(TrackedPlan plan, {bool watchOptIn = false}) async {
    // Mirror the server's (user_id, plan_id) replace: a re-watch of the same
    // catalogue plan supersedes the prior in-memory row rather than stacking.
    _tracked.removeWhere((p) =>
        p.id == plan.id ||
        (plan.planId != null && p.planId == plan.planId));
    _tracked.insert(0, plan); // newest first, like the server's created_at desc
  }

  @override
  Future<void> removeTrackedPlan(String id) async {
    _tracked.removeWhere((p) => p.id == id);
  }

  @override
  Future<void> removeTrackedPlanByPlanId(String planId) async {
    _tracked.removeWhere((p) => p.planId == planId);
  }

  @override
  Future<void> setAllWatchOptIn(bool optIn) async {
    // No watch_opt_in column to mirror in-memory; the on-device backend doesn't
    // feed the edge engine, so withdrawing consent is a no-op here.
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

  // ── Moderation & notifications ───────────────────────────────────────────────
  @override
  Future<void> reportContent({
    required String targetType,
    required String targetId,
    required String reason,
    String? body,
  }) async {
    // No-op locally — there is no moderation queue on-device.
  }

  @override
  Future<List<CommunityNotification>> fetchCommunityNotifications() async =>
      const [];

  @override
  Future<void> markCommunityNotificationsRead() async {
    // No-op locally.
  }

  // ── WhatsApp CRM (admin-only) — in-memory demo store ─────────────────────────
  // Without Supabase there is no crm-api edge function; we seed a handful of
  // fake conversations, threads and leads so the dashboard renders fully
  // offline. Replies / status changes mutate this store so the UI feels live.

  bool _crmSeeded = false;
  final List<CrmContact> _crmContacts = [];
  final List<CrmConversation> _crmConversations = [];
  final Map<String, List<CrmMessage>> _crmMessages = {}; // conversationId → msgs
  final List<CrmLead> _crmLeads = [];

  void _seedCrm() {
    if (_crmSeeded) return;
    _crmSeeded = true;
    final now = DateTime.now();
    DateTime ago(int minutes) => now.subtract(Duration(minutes: minutes));

    void add({
      required String cid,
      required String contactId,
      required String name,
      required String phone,
      required String status,
      required String contactStatus,
      String? intent,
      String? leadId,
      String? leadStatus,
      required List<CrmMessage> msgs,
    }) {
      _crmContacts.add(CrmContact(
        id: contactId,
        name: name,
        phone: phone,
        status: contactStatus,
        leadId: leadId,
        leadStatus: leadStatus,
      ));
      final last = msgs.isNotEmpty ? msgs.last : null;
      _crmConversations.add(CrmConversation(
        conversationId: cid,
        contactId: contactId,
        name: name,
        phone: phone,
        status: status,
        intent: intent,
        lastSnippet: last?.body ?? '',
        lastAt: last?.createdAt,
        leadStatus: leadStatus,
      ));
      _crmMessages[cid] = msgs;
    }

    add(
      cid: 'conv-1',
      contactId: 'cnt-1',
      name: 'דנה לוי',
      phone: '0521234567',
      status: 'human',
      contactStatus: 'qualified',
      intent: 'cellular',
      leadId: 'lead-1',
      leadStatus: 'contacted',
      msgs: [
        CrmMessage(id: 'm1', direction: 'in', actor: 'customer', body: 'היי, אפשר לעבור לחבילה זולה יותר?', createdAt: ago(58)),
        CrmMessage(id: 'm2', direction: 'out', actor: 'bot', body: 'בטח! מה החבילה הנוכחית שלך?', createdAt: ago(57)),
        CrmMessage(id: 'm3', direction: 'in', actor: 'customer', body: 'פרטנר 100 ש"ח לחודש', createdAt: ago(40)),
        CrmMessage(id: 'm4', direction: 'out', actor: 'rep', body: 'מצאתי לך חבילה ב-39 ש"ח, אשמח לחבר אותך.', createdAt: ago(38)),
      ],
    );
    add(
      cid: 'conv-2',
      contactId: 'cnt-2',
      name: 'יוסי כהן',
      phone: '0539876543',
      status: 'bot',
      contactStatus: 'active',
      intent: 'internet',
      msgs: [
        CrmMessage(id: 'm5', direction: 'in', actor: 'customer', body: 'כמה עולה אינטרנט 1 גיגה?', createdAt: ago(25)),
        CrmMessage(id: 'm6', direction: 'out', actor: 'bot', body: 'יש כמה אפשרויות מ-49 ש"ח. אבדוק לך את הזולה ביותר.', createdAt: ago(24)),
      ],
    );
    add(
      cid: 'conv-3',
      contactId: 'cnt-3',
      name: 'מירי אברהם',
      phone: '0501112233',
      status: 'open',
      contactStatus: 'new',
      intent: 'triple',
      leadId: 'lead-2',
      leadStatus: 'new',
      msgs: [
        CrmMessage(id: 'm7', direction: 'in', actor: 'customer', body: 'מעוניינת בחבילת טריפל לבית', createdAt: ago(8)),
      ],
    );

    _crmLeads.addAll([
      CrmLead(id: 'lead-1', name: 'דנה לוי', phone: '0521234567', provider: 'פרטנר', source: 'whatsapp', status: 'contacted', createdAt: ago(58)),
      CrmLead(id: 'lead-2', name: 'מירי אברהם', phone: '0501112233', provider: 'בזק', source: 'whatsapp', status: 'new', createdAt: ago(8)),
      CrmLead(id: 'lead-3', name: 'אבי דהן', phone: '0544455667', provider: 'סלקום', source: 'form', status: 'won', createdAt: ago(2880)),
      CrmLead(id: 'lead-4', name: 'נועה שמש', phone: '0587778899', provider: 'HOT', source: 'whatsapp', status: 'lost', createdAt: ago(4320)),
    ]);
  }

  @override
  Future<bool> fetchIsAdmin() async => true;

  @override
  Future<CrmOverview> crmOverview() async {
    _seedCrm();
    final pipeline = <String, int>{'new': 0, 'contacted': 0, 'won': 0, 'lost': 0};
    for (final l in _crmLeads) {
      pipeline[l.status] = (pipeline[l.status] ?? 0) + 1;
    }
    final recent = [..._crmConversations]
      ..sort((a, b) => (b.lastAt ?? DateTime(0)).compareTo(a.lastAt ?? DateTime(0)));
    return CrmOverview(
      pipeline: pipeline,
      recent: recent.take(12).toList(),
    );
  }

  @override
  Future<List<CrmConversation>> crmListConversations({String? status, String? search}) async {
    _seedCrm();
    var list = [..._crmConversations];
    if (status != null && status.isNotEmpty) {
      list = list.where((c) => c.status == status).toList();
    }
    if (search != null && search.isNotEmpty) {
      final q = search.toLowerCase();
      list = list
          .where((c) =>
              c.name.toLowerCase().contains(q) || c.phone.contains(search))
          .toList();
    }
    list.sort((a, b) => (b.lastAt ?? DateTime(0)).compareTo(a.lastAt ?? DateTime(0)));
    return List.unmodifiable(list);
  }

  @override
  Future<CrmThread> crmGetThread(String conversationId) async {
    _seedCrm();
    final conv = _crmConversations.firstWhere(
      (c) => c.conversationId == conversationId,
      orElse: () => const CrmConversation(
        conversationId: '',
        contactId: '',
        name: '',
        phone: '',
        status: 'open',
      ),
    );
    final contact = _crmContacts.firstWhere(
      (c) => c.id == conv.contactId,
      orElse: () => CrmContact(
        id: conv.contactId,
        name: conv.name,
        phone: conv.phone,
        status: 'new',
      ),
    );
    return CrmThread(
      contact: contact,
      messages: List.unmodifiable(_crmMessages[conversationId] ?? const []),
    );
  }

  @override
  Future<void> crmSendReply(String conversationId, String body) async {
    _seedCrm();
    final msg = CrmMessage(
      id: _nextId(),
      direction: 'out',
      actor: 'rep',
      body: body,
      createdAt: DateTime.now(),
    );
    (_crmMessages[conversationId] ??= []).add(msg);
    final idx = _crmConversations.indexWhere((c) => c.conversationId == conversationId);
    if (idx != -1) {
      final c = _crmConversations[idx];
      _crmConversations[idx] = CrmConversation(
        conversationId: c.conversationId,
        contactId: c.contactId,
        name: c.name,
        phone: c.phone,
        status: c.status,
        intent: c.intent,
        lastSnippet: body,
        lastAt: msg.createdAt,
        leadStatus: c.leadStatus,
      );
    }
  }

  @override
  Future<void> crmTakeOver(String conversationId) async => _setBotEnabled(conversationId, false);

  @override
  Future<void> crmHandBack(String conversationId) async => _setBotEnabled(conversationId, true);

  /// Toggles the conversation's (and its contact's) bot gate, mirroring the
  /// server's takeover/hand-back: `botEnabled=false` ⇒ status 'human', the AI
  /// stays silent; `true` ⇒ status 'bot', the AI answers again.
  void _setBotEnabled(String conversationId, bool enabled) {
    _seedCrm();
    final idx = _crmConversations.indexWhere((c) => c.conversationId == conversationId);
    if (idx == -1) return;
    final c = _crmConversations[idx];
    _crmConversations[idx] = CrmConversation(
      conversationId: c.conversationId,
      contactId: c.contactId,
      name: c.name,
      phone: c.phone,
      status: enabled ? 'bot' : 'human',
      intent: c.intent,
      lastSnippet: c.lastSnippet,
      lastAt: c.lastAt,
      leadStatus: c.leadStatus,
      botEnabled: enabled,
    );
    final cIdx = _crmContacts.indexWhere((ct) => ct.id == c.contactId);
    if (cIdx != -1) {
      final ct = _crmContacts[cIdx];
      _crmContacts[cIdx] = CrmContact(
        id: ct.id,
        name: ct.name,
        phone: ct.phone,
        status: ct.status,
        leadId: ct.leadId,
        leadStatus: ct.leadStatus,
        botEnabled: enabled,
      );
    }
  }

  @override
  Stream<void> crmEventStream() => const Stream<void>.empty();

  @override
  Future<void> crmSetContactStatus(String contactId, String status) async {
    _seedCrm();
    final idx = _crmContacts.indexWhere((c) => c.id == contactId);
    if (idx != -1) {
      final c = _crmContacts[idx];
      _crmContacts[idx] = CrmContact(
        id: c.id,
        name: c.name,
        phone: c.phone,
        status: status,
        leadId: c.leadId,
        leadStatus: c.leadStatus,
      );
    }
  }

  @override
  Future<void> crmSetLeadStatus(String leadId, String status) async {
    _seedCrm();
    final idx = _crmLeads.indexWhere((l) => l.id == leadId);
    if (idx != -1) {
      final l = _crmLeads[idx];
      _crmLeads[idx] = CrmLead(
        id: l.id,
        name: l.name,
        phone: l.phone,
        provider: l.provider,
        source: l.source,
        status: status,
        createdAt: l.createdAt,
      );
    }
  }

  @override
  Future<List<CrmLead>> crmListLeads({String? status}) async {
    _seedCrm();
    final list = status == null || status.isEmpty
        ? _crmLeads
        : _crmLeads.where((l) => l.status == status).toList();
    return List.unmodifiable(list);
  }

  // ── Owner observability ──────────────────────────────────────────────────────
  // A deterministic, plausible fake mirroring the `admin-metrics` edge-fn shape
  // so the events-and-audit tab renders offline and in tests. The numbers are
  // clearly synthetic demo data (not claimed to be production telemetry); the
  // SupabaseBackend serves the real edge-fn payload.
  @override
  Future<AdminMetrics> fetchAdminMetrics({int windowDays = 14}) async {
    final today = DateTime.now();
    final n = windowDays.clamp(1, 90);
    final midnight = DateTime(today.year, today.month, today.day);

    // Build a per-event trailing series for two representative funnel events,
    // newest-day-first (matching the edge fn). The chart sums these per day.
    EventSeries series(String event, int base, int spread) {
      final days = <EventDayCount>[
        for (var i = 0; i < n; i++)
          EventDayCount(
            day: midnight.subtract(Duration(days: i)),
            events: base + ((i * 5) % spread) + (i.isEven ? 3 : 0),
          ),
      ];
      final total = days.fold<int>(0, (s, d) => s + d.events);
      return EventSeries(event: event, total: total, days: days);
    }

    final events = [series('planView', 9, 11), series('leadStart', 4, 7)];
    final total = events.fold<int>(0, (s, e) => s + e.total);

    return AdminMetrics(
      windowDays: n,
      events: events,
      totalEvents: total,
      toolCalls: const ToolCallSummary(
        total: 994,
        ok: 970,
        rate: 0.9759,
        byTool: [
          RateBucket(key: 'search_plans', calls: 412, ok: 406, rate: 0.9854),
          RateBucket(key: 'recommend', calls: 257, ok: 254, rate: 0.9883),
          RateBucket(key: 'analyze_bill', calls: 188, ok: 174, rate: 0.9255),
          RateBucket(key: 'capture_lead', calls: 96, ok: 95, rate: 0.9896),
          RateBucket(key: 'book_meeting', calls: 41, ok: 41, rate: 1.0),
        ],
        byChannel: [
          RateBucket(key: 'whatsapp', calls: 560, ok: 545, rate: 0.9732),
          RateBucket(key: 'site', calls: 311, ok: 306, rate: 0.9839),
          RateBucket(key: 'app', calls: 123, ok: 119, rate: 0.9675),
        ],
      ),
      audit: const AuditSummary(
        total: 52,
        byEvent: [
          AuditBucket(event: 'status_change', count: 37),
          AuditBucket(event: 'crm_takeover', count: 9),
          AuditBucket(event: 'community_content_flagged', count: 4),
          AuditBucket(event: 'analytics_purge', count: 2),
        ],
      ),
      cron: const CronSummary(
        ok: false,
        known: 3,
        stale: ['renewal_reminders'],
        failing: [],
      ),
    );
  }
}

/// The backend the app talks to. Defaults to on-device storage; `main.dart`
/// swaps in `SupabaseBackend()` at startup when SUPABASE_URL / SUPABASE_ANON_KEY
/// are provided, so no-key runs and CI stay fully local.
Backend appBackend = LocalBackend();
