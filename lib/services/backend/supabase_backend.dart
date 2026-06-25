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
import 'dart:convert';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../../models.dart';
import 'backend.dart';

class SupabaseBackend implements Backend {
  SupabaseClient get _db => Supabase.instance.client;
  String? get _uid => _db.auth.currentUser?.id;

  RealtimeChannel? _leadChannel;
  StreamController<int>? _leadStepCtrl;

  RealtimeChannel? _communityChannel;
  StreamController<void>? _communityCtrl;

  RealtimeChannel? _crmEventChannel;
  StreamController<void>? _crmEventCtrl;

  RealtimeChannel? _priceHistoryChannel;
  StreamController<void>? _priceHistoryCtrl;

  // ── AI advisor (site-ai-chat edge agent) ─────────────────────────────────────
  @override
  Future<Map<String, dynamic>> aiChat(Map<String, dynamic> body) async {
    // functions.invoke auto-attaches the anon/session JWT. A non-2xx (rate
    // limit / outage / model error) throws here so the advisor widget falls back
    // to the on-device AdvisorEngine.
    final res = await _db.functions.invoke('site-ai-chat', body: body);
    final data = res.data;
    if (data is Map) return data.cast<String, dynamic>();
    // A 2xx with an unexpected body is as useless as an error — make the caller
    // fall back rather than render nothing.
    throw StateError('site-ai-chat returned no JSON body');
  }

  // ── Real-time deals (plan_price_history) ─────────────────────────────────────
  @override
  Future<List<PriceSnapshot>> fetchPriceSnapshots({int limit = 400}) async {
    final rows = await _db
        .from('plan_price_history')
        .select('plan_id, category, provider, price, after, captured_at')
        .order('captured_at', ascending: false)
        .limit(limit);
    return (rows as List)
        .map((r) => PriceSnapshot.fromJson((r as Map).cast<String, dynamic>()))
        .toList();
  }

  @override
  Stream<void> priceHistoryChanges() {
    _priceHistoryCtrl ??= StreamController<void>.broadcast();
    _priceHistoryChannel?.unsubscribe();
    _priceHistoryChannel = _db
        .channel('plan-price-history')
        .onPostgresChanges(
          event: PostgresChangeEvent.insert,
          schema: 'public',
          table: 'plan_price_history',
          callback: (_) => _priceHistoryCtrl?.add(null),
        )
        .subscribe();
    return _priceHistoryCtrl!.stream;
  }

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
  Future<void> trackPlanView({required String planId, required String provider, required String category}) async {
    await _db.from('plan_views').insert({
      'plan_id': planId,
      'provider': provider,
      'category': category,
      if (_uid != null) 'user_id': _uid,
    });
  }

  // ── Bill OCR ─────────────────────────────────────────────────────────────────
  @override
  Future<BillAnalysis?> analyzeBill(String imageDataUri) async {
    if (imageDataUri.trim().isEmpty) return null;
    try {
      // The edge function accepts a data-URI ("data:image/...;base64,…") or raw
      // base64 under `imageBase64`. functions.invoke auto-attaches the anon JWT.
      // The function returns 200 with a friendly `error` field on an unreadable
      // photo, but a non-2xx (rate limit / oversized / outage) throws here.
      final res = await _db.functions.invoke('site-bill-analyzer', body: {
        'imageBase64': imageDataUri,
      });
      final data = res.data;
      if (data is Map) return BillAnalysis.fromJson(data.cast<String, dynamic>());
      return null;
    } catch (_) {
      // Transport / non-2xx / parse failure → null; the caller shows a friendly
      // Hebrew message. The image is never retried or stored.
      return null;
    }
  }

  @override
  Future<({String name, String phone, String? email, int totalSavings, bool renewalReminders})?> fetchProfile() async {
    if (_uid == null) return null;
    final row = await _db
        .from('profiles')
        .select('name, phone, email, total_savings, renewal_reminders')
        .eq('id', _uid!)
        .maybeSingle();
    if (row == null) return null;
    final name = row['name'] as String?;
    final phone = row['phone'] as String?;
    if (name == null || name.isEmpty || phone == null || phone.isEmpty) return null;
    return (
      name: name,
      phone: phone,
      email: row['email'] as String?,
      totalSavings: (row['total_savings'] as num?)?.toInt() ?? 0,
      renewalReminders: row['renewal_reminders'] as bool? ?? false,
    );
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
  Future<void> setRenewalReminder(bool enabled) async {
    if (_uid == null) return;
    await _db.from('profiles').upsert({
      'id': _uid,
      'renewal_reminders': enabled,
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
  Future<Map<String, dynamic>?> fetchQuiz() async {
    if (_uid == null) return null;
    final row = await _db.from('profiles').select('quiz').eq('id', _uid!).maybeSingle();
    if (row == null) return null;
    final raw = row['quiz'] as Map?;
    if (raw == null || raw.isEmpty) return null;
    return Map<String, dynamic>.from(raw);
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
  Future<int> fetchLeadStep() async {
    if (_uid == null) return 0;
    final row = await _db
        .from('leads')
        .select('status')
        .eq('user_id', _uid!)
        .order('created_at', ascending: false)
        .limit(1)
        .maybeSingle();
    if (row == null) return 0;
    final status = row['status'] as String? ?? 'new';
    switch (status) {
      case 'contacted': return 2;
      case 'won': return 4;
      case 'lost': return -1; // terminal — the rep closed the lead
      default: return 1;
    }
  }

  @override
  Stream<int> leadStepStream() {
    if (_uid == null) return const Stream.empty();
    _leadStepCtrl ??= StreamController<int>.broadcast();
    _leadChannel?.unsubscribe();
    _leadChannel = _db
        .channel('lead-tracker-$_uid')
        .onPostgresChanges(
          event: PostgresChangeEvent.update,
          schema: 'public',
          table: 'leads',
          filter: PostgresChangeFilter(
              type: PostgresChangeFilterType.eq, column: 'user_id', value: _uid!),
          callback: (payload) {
            final status = payload.newRecord['status'] as String? ?? 'new';
            int step;
            switch (status) {
              case 'contacted': step = 2; break;
              case 'won': step = 4; break;
              case 'lost': step = -1; break; // terminal — the rep closed the lead
              default: step = 1;
            }
            _leadStepCtrl?.add(step);
          },
        )
        .subscribe();
    return _leadStepCtrl!.stream;
  }

  // ── Video meetings (Zoom) ────────────────────────────────────────────────────

  RealtimeChannel? _meetingChannel;
  StreamController<BookedMeeting>? _meetingCtrl;

  /// Maps a meetings row/payload to [BookedMeeting], reading ONLY the
  /// client-granted columns — never rep identity / notes / IP (the Realtime
  /// payload may carry more than the column grant; we deliberately ignore it).
  BookedMeeting _meetingFromRow(Map<String, dynamic> r) => BookedMeeting(
        id: r['id'] as String,
        status: meetingStatusFromDb(r['status'] as String?),
        provider: r['provider'] as String?,
        meetingDate: r['meeting_date'] as String? ?? '',
        slot: r['slot'] as String? ?? '',
        startsAt: DateTime.tryParse(r['starts_at'] as String? ?? '')?.toUtc() ??
            DateTime.now().toUtc(),
        joinUrl: r['join_url'] as String?,
        createdAt:
            DateTime.tryParse(r['created_at'] as String? ?? '') ?? DateTime.now(),
      );

  @override
  Future<void> requestMeeting(MeetingInput input) async {
    // `meetings` allows anon insert (same gate pattern as leads); the
    // meetings_guard trigger validates schedule + rate limits server-side.
    await _db.from('meetings').insert({
      ...input.toRow(),
      if (_uid != null) 'user_id': _uid,
    });
  }

  @override
  Future<BookedMeeting?> fetchLatestMeeting() async {
    if (_uid == null) return null;
    final row = await _db
        .from('meetings')
        .select('id,status,provider,meeting_date,slot,starts_at,join_url,created_at')
        .eq('user_id', _uid!)
        .order('created_at', ascending: false)
        .limit(1)
        .maybeSingle();
    return row == null ? null : _meetingFromRow(row);
  }

  @override
  Stream<BookedMeeting> meetingStream() {
    if (_uid == null) return const Stream.empty();
    _meetingCtrl ??= StreamController<BookedMeeting>.broadcast();
    _meetingChannel?.unsubscribe();
    _meetingChannel = _db
        .channel('meetings-$_uid')
        .onPostgresChanges(
          event: PostgresChangeEvent.update,
          schema: 'public',
          table: 'meetings',
          filter: PostgresChangeFilter(
              type: PostgresChangeFilterType.eq, column: 'user_id', value: _uid!),
          callback: (payload) {
            _meetingCtrl?.add(_meetingFromRow(payload.newRecord));
          },
        )
        .subscribe();
    return _meetingCtrl!.stream;
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
          isVerifiedCustomer: r['is_verified_customer'] as bool? ?? false,
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
          isVerifiedCustomer: r['is_verified_customer'] as bool? ?? false,
        )).toList();
  }

  // ── Community ────────────────────────────────────────────────────────────────

  // Uploads a data-URI to Supabase Storage and returns the public URL.
  // If [media] is already an HTTP URL (or null), returns it unchanged.
  Future<String?> _uploadMediaIfNeeded(String? media, String? mediaType) async {
    if (media == null || !media.startsWith('data:')) return media;
    final commaIdx = media.indexOf(',');
    if (commaIdx == -1) return null;
    final bytes = base64Decode(media.substring(commaIdx + 1));
    final ext = mediaType == 'image' ? 'jpg' : mediaType == 'video' ? 'mp4' : 'aac';
    final path = '${_uid ?? 'anon'}/${DateTime.now().microsecondsSinceEpoch}.$ext';
    await _db.storage.from('community-media').uploadBinary(path, bytes);
    return _db.storage.from('community-media').getPublicUrl(path);
  }

  @override
  Stream<void> communityChanges() {
    _communityCtrl ??= StreamController<void>.broadcast();
    _communityChannel?.unsubscribe();
    _communityChannel = _db
        .channel('community-feed')
        .onPostgresChanges(
          event: PostgresChangeEvent.all,
          schema: 'public',
          table: 'community_posts',
          callback: (_) => _communityCtrl?.add(null),
        )
        .subscribe();
    return _communityCtrl!.stream;
  }

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
        isFlagged: r['is_flagged'] as bool? ?? false,
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
    final mediaUrl = await _uploadMediaIfNeeded(post.media, post.mediaType);
    final row = await _db
        .from('community_posts')
        .insert({
          'user_id': _uid,
          'author': post.author,
          'avatar': post.avatar,
          'channel': post.channel,
          'body': post.text,
          'media_type': post.mediaType,
          'media_url': mediaUrl,
          'media_duration_ms': post.mediaDurationMs,
        })
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
          isFlagged: r['is_flagged'] as bool? ?? false,
        )).toList();
  }

  @override
  Future<void> addReply(ReplyInput reply) async {
    final mediaUrl = await _uploadMediaIfNeeded(reply.media, reply.mediaType);
    await _db.from('community_replies').insert({
      'user_id': _uid,
      'post_id': reply.postId,
      'author': reply.author,
      'avatar': reply.avatar,
      'body': reply.text,
      'media_type': reply.mediaType,
      'media_url': mediaUrl,
      'media_duration_ms': reply.mediaDurationMs,
    });
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

  // ── Moderation & notifications ───────────────────────────────────────────────
  @override
  Future<void> reportContent({
    required String targetType,
    required String targetId,
    required String reason,
    String? body,
  }) async {
    // RLS lets a user INSERT a report as themselves; reporter_user_id = uid.
    await _db.from('community_reports').insert({
      'reporter_user_id': _uid,
      'target_type': targetType,
      'target_id': targetId,
      'reason': reason,
      if (body != null && body.isNotEmpty) 'body': body,
    });
  }

  @override
  Future<List<CommunityNotification>> fetchCommunityNotifications() async {
    if (_uid == null) return const [];
    // RLS scopes SELECT to the user's own rows.
    final rows = await _db
        .from('community_notifications')
        .select()
        .order('created_at', ascending: false)
        .limit(50);
    return (rows as List)
        .map((r) => CommunityNotification.fromJson(r as Map<String, dynamic>))
        .toList();
  }

  @override
  Future<void> markCommunityNotificationsRead() async {
    if (_uid == null) return;
    // RLS scopes UPDATE to the user's own rows; only touch the unread ones.
    await _db
        .from('community_notifications')
        .update({'read_at': DateTime.now().toUtc().toIso8601String()})
        .eq('user_id', _uid!)
        .isFilter('read_at', null);
  }

  // ── WhatsApp CRM (admin-only) ────────────────────────────────────────────────
  // All access goes through the `crm-api` edge function. functions.invoke
  // auto-attaches the signed-in user's JWT; the function gates on
  // profiles.is_admin and reads/writes the whatsapp_* / leads tables via the
  // service role. We never touch those tables directly from the client.

  // Calls a `crm-api` action and returns its decoded JSON body, raising on a
  // non-2xx so callers surface the same kind of error as the other methods.
  Future<Map<String, dynamic>> _crm(String action, [Map<String, dynamic>? extra]) async {
    final res = await _db.functions.invoke('crm-api', body: {
      'action': action,
      if (extra != null) ...extra,
    });
    final data = res.data;
    if (data is Map) return data.cast<String, dynamic>();
    return const {};
  }

  @override
  Future<bool> fetchIsAdmin() async {
    if (_uid == null) return false;
    final row = await _db
        .from('profiles')
        .select('is_admin')
        .eq('id', _uid!)
        .maybeSingle();
    return row?['is_admin'] as bool? ?? false;
  }

  @override
  Future<CrmOverview> crmOverview() async {
    final data = await _crm('overview');
    return CrmOverview.fromJson(data);
  }

  @override
  Future<List<CrmConversation>> crmListConversations({String? status, String? search}) async {
    final data = await _crm('listConversations', {
      if (status != null) 'status': status,
      if (search != null && search.isNotEmpty) 'search': search,
    });
    return ((data['conversations'] as List?) ?? const [])
        .map((c) => CrmConversation.fromJson((c as Map).cast<String, dynamic>()))
        .toList();
  }

  @override
  Future<CrmThread> crmGetThread(String conversationId) async {
    final data = await _crm('getThread', {'conversationId': conversationId});
    return CrmThread.fromJson(data);
  }

  @override
  Future<void> crmSendReply(String conversationId, String body) async {
    await _crm('sendReply', {'conversationId': conversationId, 'body': body});
  }

  @override
  Future<void> crmTakeOver(String conversationId) async {
    await _crm('takeOver', {'conversationId': conversationId});
  }

  @override
  Future<void> crmHandBack(String conversationId) async {
    await _crm('handBack', {'conversationId': conversationId});
  }

  // ── CRM realtime (crm_events) ────────────────────────────────────────────────
  // crm_events is in the supabase_realtime publication; admins can SELECT it via
  // RLS. We mirror the leads/community channel pattern so the dashboard refreshes
  // the moment a rep_reply / takeover / hand-back row lands, with the 12s poll as
  // a fallback.
  @override
  Stream<void> crmEventStream() {
    _crmEventCtrl ??= StreamController<void>.broadcast();
    _crmEventChannel?.unsubscribe();
    _crmEventChannel = _db
        .channel('crm-events')
        .onPostgresChanges(
          event: PostgresChangeEvent.insert,
          schema: 'public',
          table: 'crm_events',
          callback: (_) => _crmEventCtrl?.add(null),
        )
        .subscribe();
    return _crmEventCtrl!.stream;
  }

  @override
  Future<void> crmSetContactStatus(String contactId, String status) async {
    await _crm('setContactStatus', {'contactId': contactId, 'status': status});
  }

  @override
  Future<void> crmSetLeadStatus(String leadId, String status) async {
    await _crm('setLeadStatus', {'leadId': leadId, 'status': status});
  }

  @override
  Future<List<CrmLead>> crmListLeads({String? status}) async {
    final data = await _crm('listLeads', {
      if (status != null) 'status': status,
    });
    return ((data['leads'] as List?) ?? const [])
        .map((l) => CrmLead.fromJson((l as Map).cast<String, dynamic>()))
        .toList();
  }

  // ── Owner observability (admin-metrics edge fn) ──────────────────────────────
  // The `admin-metrics` function is a read-only GET with a ?days= window (1..90,
  // default 7). functions.invoke auto-attaches the signed-in user's JWT; the
  // function re-checks profiles.is_admin before reading the service-role-only
  // analytics_events / agent_tool_calls / security_audit_log / cron tables, and
  // returns counts only (never PII). We never touch those tables directly.
  @override
  Future<AdminMetrics> fetchAdminMetrics({int windowDays = 14}) async {
    final res = await _db.functions.invoke(
      'admin-metrics',
      method: HttpMethod.get,
      queryParameters: {'days': '$windowDays'},
    );
    final data = res.data;
    return AdminMetrics.fromJson(
      data is Map ? data.cast<String, dynamic>() : const {},
    );
  }
}
