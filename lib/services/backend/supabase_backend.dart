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
import '../../data.dart' show compiledPlans;
import '../../models.dart';
import 'backend.dart';
import '../referral_code.dart';

class SupabaseBackend implements Backend {
  SupabaseClient get _db => Supabase.instance.client;
  String? get _uid => _db.auth.currentUser?.id;

  // ── Network timeout guard ────────────────────────────────────────────────────
  // Nothing may hang a spinner forever: every awaited network call below runs
  // through this wrapper, so a stalled socket surfaces as a TimeoutException
  // after [limit] instead of hanging. The TimeoutException takes exactly the
  // catch/propagate path each call site already has for transport failures —
  // nothing new is swallowed here. Transparent for already-completed futures
  // (test stubs are unaffected). Realtime channel subscriptions aren't futures
  // and stay untouched.
  Future<T> _t<T>(Future<T> f, {Duration limit = const Duration(seconds: 20)}) =>
      f.timeout(limit);

  RealtimeChannel? _leadChannel;
  StreamController<int>? _leadStepCtrl;

  RealtimeChannel? _communityChannel;
  StreamController<void>? _communityCtrl;

  RealtimeChannel? _crmEventChannel;
  StreamController<void>? _crmEventCtrl;

  RealtimeChannel? _priceHistoryChannel;
  StreamController<void>? _priceHistoryCtrl;

  RealtimeChannel? _catalogueChannel;
  StreamController<void>? _catalogueCtrl;

  // ── AI advisor (site-ai-chat edge agent) ─────────────────────────────────────
  @override
  Future<Map<String, dynamic>> aiChat(Map<String, dynamic> body) async {
    // functions.invoke auto-attaches the anon/session JWT. A non-2xx (rate
    // limit / outage / model error) throws here so the advisor widget falls back
    // to the on-device AdvisorEngine.
    final res = await _t(_db.functions.invoke('site-ai-chat', body: body));
    final data = res.data;
    if (data is Map) return data.cast<String, dynamic>();
    // A 2xx with an unexpected body is as useless as an error — make the caller
    // fall back rather than render nothing.
    throw StateError('site-ai-chat returned no JSON body');
  }

  // ── Account deletion (account-delete edge fn) ────────────────────────────────
  // functions.invoke auto-attaches the session JWT — the function derives the
  // identity to erase from it, never from the body; the explicit confirm token
  // is its guard against a stray invoke. Fail-soft: ANY transport / non-2xx /
  // unexpected-body failure returns false so the caller leaves local data
  // untouched and shows an honest error instead of half-deleting.
  @override
  Future<bool> deleteAccount({String? advisorSessionId}) async {
    try {
      final res = await _t(_db.functions.invoke('account-delete', body: {
        'confirm': 'DELETE',
        if (advisorSessionId != null) 'advisorSessionId': advisorSessionId,
      }));
      final data = res.data;
      return data is Map && data['ok'] == true;
    } catch (_) {
      return false;
    }
  }

  // ── Live catalogue (public.plans) ────────────────────────────────────────────
  // public.plans is "publicly readable" (anon SELECT grant + RLS) — see
  // schema.sql §grants and web/lib/live-catalogue.ts, which this mirrors in Dart.
  // We read the owner-editable columns, normalise each row via Plan.fromJson, and
  // overlay the bundled qualitative fields (feats / fineLines / notes) by id so a
  // row the owner hasn't seeded keeps the committed perks/fine-print. Truth-only:
  // we only TRANSPORT real rows; a failed / empty read returns [] so the caller
  // keeps its last-known-good compiled snapshot (never blank, never fabricated).
  @override
  Future<List<Plan>> fetchCatalogue() async {
    try {
      final rows = await _t(_db.from('plans').select(
            'id,category,provider,title,subtitle,price,price_exact,after,'
            'after_exact,is_5g,no_commit,has_abroad,price_unit,kind,specs,fees,'
            'feats,fine_lines,terms,notes,updated_at',
          ));
      final plans = <Plan>[
        for (final r in (rows as List))
          if (Plan.fromJson((r as Map).cast<String, dynamic>()) case final p?) p,
      ];
      // Zero valid rows after normalisation → empty so the caller keeps the
      // last-known-good compiled catalogue rather than rendering fewer plans.
      if (plans.isEmpty) return const [];
      return _overlayBundledRichFields(plans);
    } catch (_) {
      // Transport / RLS / parse failure → empty; the caller keeps last-known-good.
      return const [];
    }
  }

  /// Overlay the QUALITATIVE rich fields (feats / fineLines / notes) from the
  /// COMPILED catalogue onto live plans, matched by id — only filling a field the
  /// live plan lacks, only from the SAME id (no cross-plan guessing). Also
  /// restores the precise `net` token for known ids (public.plans has no `net`
  /// column, so a live row only carries a coarse 5g/'' guess). Mirrors
  /// web/lib/live-catalogue.ts mergeBundledRichFields. Truth-only.
  List<Plan> _overlayBundledRichFields(List<Plan> live) {
    final bundledById = {for (final p in compiledPlans) p.id: p};
    return [
      for (final p in live)
        if (bundledById[p.id] case final b?)
          Plan(
            id: p.id,
            cat: p.cat,
            provider: p.provider,
            // Live has no real net column; keep the precise bundled net.
            net: p.net.isNotEmpty ? p.net : b.net,
            plan: p.plan,
            price: p.price,
            priceExact: p.priceExact,
            after: p.after,
            afterExact: p.afterExact,
            term: p.term,
            intro: b.intro,
            rating: b.rating,
            reviews: b.reviews,
            flags: p.flags.isNotEmpty ? p.flags : b.flags,
            feats: p.feats.isNotEmpty ? p.feats : b.feats,
            fine: b.fine,
            highlight: b.highlight,
            kind: p.kind,
            priceUnit: p.priceUnit,
            specs: p.specs.isNotEmpty ? p.specs : b.specs,
            fineLines: p.fineLines.isNotEmpty ? p.fineLines : b.fineLines,
            fees: p.fees.isNotEmpty ? p.fees : b.fees,
            terms: p.terms.isNotEmpty ? p.terms : b.terms,
            eligibility: b.eligibility,
            notes: (p.notes != null && p.notes!.isNotEmpty) ? p.notes : b.notes,
            sourceUrl: b.sourceUrl,
            updatedAt: p.updatedAt ?? b.updatedAt,
          )
        else
          p, // live-only plan (a brand-new id) — keep exactly its DB data
    ];
  }

  @override
  Stream<void> catalogueChanges() {
    _catalogueCtrl ??= StreamController<void>.broadcast();
    _catalogueChannel?.unsubscribe();
    _catalogueChannel = _db
        .channel('plans-catalogue')
        .onPostgresChanges(
          event: PostgresChangeEvent.all,
          schema: 'public',
          table: 'plans',
          callback: (_) => _catalogueCtrl?.add(null),
        )
        .subscribe();
    return _catalogueCtrl!.stream;
  }

  // ── Provider capabilities (provider_capabilities) ────────────────────────────
  // Reads the Zoom-supported provider ids from the publicly-readable
  // `public.provider_capabilities` table (anon SELECT grant + RLS). Truth-only:
  // a transport / RLS / empty read returns an EMPTY set so the caller keeps the
  // const `kZoomSupportedProviders` fallback rather than blanking the gate.
  @override
  Future<Set<String>> fetchZoomSupportedProviders() async {
    try {
      final rows = await _t(_db
          .from('provider_capabilities')
          .select('provider')
          .eq('supports_zoom_meeting', true));
      return {
        for (final r in (rows as List))
          if ((r as Map)['provider'] case final String p when p.isNotEmpty) p,
      };
    } catch (_) {
      // Transport / RLS / parse failure → empty; the caller keeps the fallback.
      return const {};
    }
  }

  // ── Real-time deals (plan_price_history) ─────────────────────────────────────
  @override
  Future<List<PriceSnapshot>> fetchPriceSnapshots({int limit = 400}) async {
    final rows = await _t(_db
        .from('plan_price_history')
        .select('plan_id, category, provider, price, after, captured_at')
        .order('captured_at', ascending: false)
        .limit(limit));
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
    await _t(_db.from('profiles').upsert({
      'id': _uid,
      'name': name,
      'phone': phone,
      if (email != null && email.isNotEmpty) 'email': email,
    }, onConflict: 'id'));
  }

  @override
  Future<void> trackPlanView({required String planId, required String provider, required String category}) async {
    await _t(_db.from('plan_views').insert({
      'plan_id': planId,
      'provider': provider,
      'category': category,
      if (_uid != null) 'user_id': _uid,
    }));
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
      final res = await _t(_db.functions.invoke('site-bill-analyzer', body: {
        'imageBase64': imageDataUri,
      }));
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
    final row = await _t(_db
        .from('profiles')
        .select('name, phone, email, total_savings, renewal_reminders')
        .eq('id', _uid!)
        .maybeSingle());
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
    await _t(_db.rpc('increment_savings', params: {'uid': _uid, 'delta': amount}));
  }

  @override
  Future<void> upsertBills(Map<String, int> bills) async {
    if (_uid == null) return;
    await _t(_db.from('profiles').upsert({
      'id': _uid,
      'bills': bills,
    }, onConflict: 'id'));
  }

  @override
  Future<void> setRenewalReminder(bool enabled) async {
    if (_uid == null) return;
    await _t(_db.from('profiles').upsert({
      'id': _uid,
      'renewal_reminders': enabled,
    }, onConflict: 'id'));
  }

  @override
  Future<void> upsertQuiz(Map<String, dynamic> quiz) async {
    if (_uid == null) return;
    await _t(_db.from('profiles').upsert({
      'id': _uid,
      'quiz': quiz,
    }, onConflict: 'id'));
  }

  @override
  Future<Map<String, dynamic>?> fetchQuiz() async {
    if (_uid == null) return null;
    final row = await _t(_db.from('profiles').select('quiz').eq('id', _uid!).maybeSingle());
    if (row == null) return null;
    final raw = row['quiz'] as Map?;
    if (raw == null || raw.isEmpty) return null;
    return Map<String, dynamic>.from(raw);
  }

  @override
  Future<Map<String, int>?> fetchBills() async {
    if (_uid == null) return null;
    final rows = await _t(_db.from('profiles').select('bills').eq('id', _uid!).maybeSingle());
    if (rows == null) return null;
    final raw = rows['bills'] as Map?;
    if (raw == null || raw.isEmpty) return null;
    return raw.map((k, v) => MapEntry(k as String, (v as num).toInt()));
  }

  // ── Leads ──────────────────────────────────────────────────────────────────
  @override
  Future<void> submitLead(LeadInput lead) async {
    // `leads` allows anon insert; attach user_id when signed in.
    await _t(_db.from('leads').insert({
      ...lead.toRow(),
      if (_uid != null) 'user_id': _uid,
    }));
  }

  @override
  Future<int> fetchLeadStep() async {
    if (_uid == null) return 0;
    final row = await _t(_db
        .from('leads')
        .select('status')
        .eq('user_id', _uid!)
        .order('created_at', ascending: false)
        .limit(1)
        .maybeSingle());
    if (row == null) return 0;
    return leadStepFromStatus(row['status'] as String?);
  }

  @override
  Future<({int step, DateTime? createdAt})> fetchLeadInfo() async {
    if (_uid == null) return (step: 0, createdAt: null);
    // ONLY the client-granted columns — the leads grant is (id, status,
    // created_at, user_id); selecting anything else would fail under RLS.
    final row = await _t(_db
        .from('leads')
        .select('status, created_at')
        .eq('user_id', _uid!)
        .order('created_at', ascending: false)
        .limit(1)
        .maybeSingle());
    if (row == null) return (step: 0, createdAt: null);
    return (
      step: leadStepFromStatus(row['status'] as String?),
      createdAt:
          DateTime.tryParse(row['created_at'] as String? ?? '')?.toLocal(),
    );
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
            _leadStepCtrl
                ?.add(leadStepFromStatus(payload.newRecord['status'] as String?));
          },
        )
        .subscribe();
    return _leadStepCtrl!.stream;
  }

  // ── Video meetings (Zoom) ────────────────────────────────────────────────────

  RealtimeChannel? _meetingChannel;
  RealtimeChannel? _meetingEmailChannel;
  StreamController<BookedMeeting>? _meetingCtrl;
  // Last emitted signature per meeting id — dedupes the SAME update arriving on
  // both the user_id channel and the email channel (a row can match both).
  final Map<String, String> _meetingEventSig = {};

  /// The AUTHENTICATED Supabase user's email, normalized exactly like
  /// meeting-book stores it (trim + lowercase) — NEVER a free-typed address.
  /// Anonymous sessions carry no email → null, so they keep today's
  /// user_id-only behavior bit-for-bit.
  String? get _authedMeetingEmail =>
      meetingEmailFilterValue(_db.auth.currentUser?.email);

  /// Normalizes an authenticated email for embedding in a PostgREST filter,
  /// mirroring meeting-book's normalizeEmail (trim + lowercase). Returns null
  /// for missing/empty input AND for anything that can't be safely embedded in
  /// a double-quoted PostgREST token (`"`, `\`, `,`, `(`, `)`) — such an
  /// address simply keeps the user_id-only fetch instead of a broken query.
  /// Exposed (static, pure) for tests.
  static String? meetingEmailFilterValue(String? raw) {
    final email = raw?.trim().toLowerCase() ?? '';
    if (email.isEmpty) return null;
    if (email.contains(RegExp(r'["\\,()]'))) return null;
    return email;
  }

  /// Composes the PostgREST `or=` filter for the cross-surface meeting fetch:
  /// rows owned by this auth uid OR rows booked on the WEB (user_id NULL) with
  /// the same verified email. The email token is double-quoted so its '@'/'.'
  /// read as a literal value, not PostgREST syntax; the client URL-encodes the
  /// whole `or=` parameter on the wire. Exposed (static, pure) for tests.
  static String meetingOrFilter(String uid, String email) =>
      'user_id.eq.$uid,email.eq."$email"';

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

  // Calls a `meeting-book` action and returns its decoded JSON body. The edge
  // function (not a raw table) owns the booking now, so we can later close the
  // anon `meetings` INSERT policy: every action returns a `{ok, error?}` map.
  // functions.invoke auto-attaches the anon/session JWT and surfaces a non-2xx
  // as a thrown FunctionException — callers translate that into honest copy.
  Future<Map<String, dynamic>> _meetingBook(Map<String, dynamic> body) async {
    final res = await _t(_db.functions.invoke('meeting-book', body: body));
    final data = res.data;
    return data is Map ? data.cast<String, dynamic>() : const {};
  }

  @override
  Future<({bool ok, bool sent})> requestMeetingEmailCode(String email, {String? name}) async {
    try {
      // The function answers {ok:true, sent:<bool>}. It never reveals whether the
      // address exists (sent is absent on the rate-limit / invalid paths → treat
      // as true); only an explicit sent:false means the email SEND failed (Resend
      // down / sender domain unverified) so the UI can offer a WhatsApp fallback.
      final data = await _meetingBook({
        'action': 'request-code',
        'email': email,
        if (name != null && name.isNotEmpty) 'name': name,
      });
      return (ok: true, sent: data['sent'] != false);
    } catch (_) {
      // A transport / non-2xx failure — the request didn't reach the backend.
      return (ok: false, sent: false);
    }
  }

  @override
  Future<({bool ok, String? error})> verifyMeetingEmailCode(String email, String code) async {
    try {
      final data = await _meetingBook({
        'action': 'verify-code',
        'email': email,
        'code': code,
      });
      final ok = data['ok'] == true;
      return (ok: ok, error: ok ? null : data['error'] as String?);
    } catch (_) {
      // A transport / non-2xx failure isn't a "wrong code" — let the UI show a
      // connection error rather than implying the typed code was invalid.
      return (ok: false, error: null);
    }
  }

  @override
  Future<String> issueReferralCode({String? name}) async {
    try {
      // referral-issue mints + persists the code (channel='app') via service-role
      // and returns { code, persisted }. We use the server code when valid; any
      // failure falls through to a local (unpersisted) code so sharing never breaks.
      final res = await _t(_db.functions.invoke('referral-issue', body: {
        if (name != null && name.trim().isNotEmpty) 'name': name.trim(),
      }));
      final data = res.data;
      final code = data is Map ? data['code'] : null;
      if (code is String && ReferralCode.isValid(code)) {
        return ReferralCode.normalize(code);
      }
    } catch (_) {
      // fall through to a local code — sharing must never dead-end
    }
    return ReferralCode.make();
  }

  @override
  Future<void> requestMeeting(MeetingInput input) async {
    // Routed through the `meeting-book` edge function (action:"book") instead of
    // a direct `meetings` INSERT, so the open anon-insert policy can later be
    // closed without breaking the app. The function re-checks the just-verified
    // email, then writes the row (the meetings_guard trigger still validates the
    // schedule + rate limits server-side). A {ok:false,error} comes back as a
    // thrown StateError so the wizard surfaces honest Hebrew copy.
    final data = await _meetingBook({
      'action': 'book',
      'name': input.name,
      'phone': input.phone,
      'email': input.email,
      'meeting_date': input.meetingDate,
      'slot': input.slot,
      'category': input.provider,
      'consent': true,
    });
    if (data['ok'] != true) {
      throw StateError(data['error'] as String? ?? 'meeting-book failed');
    }
  }

  @override
  Future<BookedMeeting?> fetchLatestMeeting() async {
    if (_uid == null) return null;
    final query = _db
        .from('meetings')
        .select('id,status,provider,meeting_date,slot,starts_at,join_url,created_at');
    // Cross-surface visibility: a meeting booked on the WEB carries user_id
    // NULL, so it can never match the uid filter. When the session has an
    // AUTHENTICATED email we widen the fetch to user_id OR email. RLS stays
    // the gate: until the owner applies the email SELECT policy
    // (email = auth.jwt()->>'email'), the email branch matches zero visible
    // rows and this returns exactly what the old uid-only query returned.
    // Anonymous sessions (email null) run the identical uid-only query.
    final email = _authedMeetingEmail;
    final filtered = email == null
        ? query.eq('user_id', _uid!)
        : query.or(meetingOrFilter(_uid!, email));
    final row = await _t(filtered
        .order('created_at', ascending: false)
        .limit(1)
        .maybeSingle());
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
          callback: (payload) => _emitMeetingChange(payload.newRecord),
        )
        .subscribe();
    // postgres_changes filters can't express OR, so web-booked rows (user_id
    // NULL, same VERIFIED email) get a SECOND channel keyed on the email
    // column — created only when the session carries an authenticated email
    // (anonymous users keep exactly the single channel above). Same handler;
    // _emitMeetingChange dedupes the event a row matching BOTH filters would
    // otherwise deliver twice. Until the owner applies the email RLS policy,
    // Realtime authorization simply never delivers on this channel — harmless.
    _meetingEmailChannel?.unsubscribe();
    _meetingEmailChannel = null;
    final email = _authedMeetingEmail;
    if (email != null) {
      _meetingEmailChannel = _db
          .channel('meetings-email-$_uid')
          .onPostgresChanges(
            event: PostgresChangeEvent.update,
            schema: 'public',
            table: 'meetings',
            filter: PostgresChangeFilter(
                type: PostgresChangeFilterType.eq,
                column: 'email',
                value: email),
            callback: (payload) => _emitMeetingChange(payload.newRecord),
          )
          .subscribe();
    }
    return _meetingCtrl!.stream;
  }

  /// Shared handler for both meeting channels: maps the payload row and emits
  /// it at most once per distinct content (see [shouldEmitMeetingEvent]).
  void _emitMeetingChange(Map<String, dynamic> record) {
    final m = _meetingFromRow(record);
    if (shouldEmitMeetingEvent(_meetingEventSig, m)) _meetingCtrl?.add(m);
  }

  /// Pure dedupe step (exposed static for tests): returns true — and records
  /// the meeting's content signature in [lastSigById] — when this event should
  /// reach listeners. The SAME update delivered on both channels produces an
  /// identical signature, so the twin is dropped; any REAL change (status
  /// flip, join_url landing, reschedule) yields a new signature and passes.
  static bool shouldEmitMeetingEvent(
      Map<String, String> lastSigById, BookedMeeting m) {
    final sig = meetingEventSignature(m);
    if (lastSigById[m.id] == sig) return false;
    lastSigById[m.id] = sig;
    return true;
  }

  /// Stable content signature over exactly the client-visible fields the app
  /// reacts to. Exposed (static, pure) for tests.
  static String meetingEventSignature(BookedMeeting m) =>
      '${meetingStatusToDb(m.status)}|${m.joinUrl ?? ''}|${m.meetingDate}|'
      '${m.slot}|${m.startsAt.toIso8601String()}';

  // ── Tracked plans ────────────────────────────────────────────────────────────
  @override
  Future<List<TrackedPlan>> fetchTrackedPlans() async {
    final rows = await _t(_db
        .from('tracked_plans')
        .select()
        .order('created_at', ascending: false));
    return (rows as List).map((r) => TrackedPlan(
          id: r['id'] as String,
          category: r['category'] as String,
          provider: r['provider'] as String,
          planName: r['plan_name'] as String,
          monthlyPrice: (r['monthly_price'] as num).toInt(),
          promoEndDate: r['promo_end_date'] as String?,
          joinedViaUs: r['joined_via_us'] as bool? ?? false,
          planId: r['plan_id'] as String?,
        )).toList();
  }

  @override
  Future<void> addTrackedPlan(TrackedPlan p, {bool watchOptIn = false}) async {
    // Avoid duplicating a watched catalogue plan: if this row carries a
    // catalogue plan_id, clear any existing (user_id, plan_id) row first so a
    // re-watch replaces rather than stacks. (Safe whether or not a DB unique
    // constraint on (user_id, plan_id) exists.)
    if (p.planId != null) {
      await _t(_db
          .from('tracked_plans')
          .delete()
          .eq('user_id', _uid!)
          .eq('plan_id', p.planId!));
    }
    await _t(_db.from('tracked_plans').insert({
      'user_id': _uid,
      'category': p.category,
      'provider': p.provider,
      'plan_name': p.planName,
      'monthly_price': p.monthlyPrice,
      'promo_end_date': p.promoEndDate,
      'joined_via_us': p.joinedViaUs,
      'plan_id': p.planId,
      // §30A: true ONLY when the caller passes a genuine opt-in.
      'watch_opt_in': watchOptIn,
    }));
  }

  @override
  Future<void> removeTrackedPlan(String id) async {
    await _t(_db.from('tracked_plans').delete().eq('id', id));
  }

  @override
  Future<void> removeTrackedPlanByPlanId(String planId) async {
    await _t(_db
        .from('tracked_plans')
        .delete()
        .eq('user_id', _uid!)
        .eq('plan_id', planId));
  }

  @override
  Future<void> setAllWatchOptIn(bool optIn) async {
    await _t(_db
        .from('tracked_plans')
        .update({'watch_opt_in': optIn}).eq('user_id', _uid!));
  }

  // ── Provider reviews ─────────────────────────────────────────────────────────
  @override
  Future<void> upsertReview(ReviewInput review) async {
    // unique(user_id, provider) → onConflict upserts the user's existing review.
    await _t(_db.from('provider_reviews').upsert(
      {'user_id': _uid, ...review.toRow()},
      onConflict: 'user_id,provider',
    ));
  }

  @override
  Future<List<ReviewInput>> reviewsForProvider(String provider) async {
    final rows = await _t(
        _db.from('provider_reviews').select().eq('provider', provider));
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
    final rows = await _t(_db.from('provider_reviews').select());
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
    // Media uploads get a wider ceiling — a video over mobile data can honestly
    // take longer than the default 20s, but must still never hang forever.
    await _t(_db.storage.from('community-media').uploadBinary(path, bytes),
        limit: const Duration(seconds: 60));
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
    final rows = await _t(query.order('created_at', ascending: false));
    return (rows as List).map((r) => _postFromRow(r as Map<String, dynamic>)).toList();
  }

  @override
  Future<CommunityPost> createPost(PostInput post) async {
    final mediaUrl = await _uploadMediaIfNeeded(post.media, post.mediaType);
    final row = await _t(_db
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
        .single());
    return _postFromRow(row);
  }

  @override
  Future<void> deletePost(String id) async {
    await _t(_db.from('community_posts').delete().eq('id', id));
  }

  @override
  Future<List<CommunityReply>> fetchReplies(String postId) async {
    final rows = await _t(_db
        .from('community_replies')
        .select()
        .eq('post_id', postId)
        .order('created_at'));
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
    await _t(_db.from('community_replies').insert({
      'user_id': _uid,
      'post_id': reply.postId,
      'author': reply.author,
      'avatar': reply.avatar,
      'body': reply.text,
      'media_type': reply.mediaType,
      'media_url': mediaUrl,
      'media_duration_ms': reply.mediaDurationMs,
    }));
  }

  @override
  Future<void> setLike(String postId, bool liked) async {
    if (liked) {
      await _t(_db.from('post_likes').upsert({'post_id': postId, 'user_id': _uid}));
    } else {
      await _t(_db.from('post_likes').delete().eq('post_id', postId).eq('user_id', _uid!));
    }
  }

  @override
  Future<Set<String>> likedPostIds() async {
    final rows = await _t(_db.from('post_likes').select('post_id').eq('user_id', _uid!));
    return (rows as List).map((r) => r['post_id'] as String).toSet();
  }

  @override
  Future<void> setBookmark(String postId, bool bookmarked) async {
    if (bookmarked) {
      await _t(_db.from('post_bookmarks').upsert({'post_id': postId, 'user_id': _uid}));
    } else {
      await _t(_db.from('post_bookmarks').delete().eq('post_id', postId).eq('user_id', _uid!));
    }
  }

  @override
  Future<Set<String>> bookmarkedPostIds() async {
    final rows = await _t(_db.from('post_bookmarks').select('post_id').eq('user_id', _uid!));
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
    await _t(_db.from('community_reports').insert({
      'reporter_user_id': _uid,
      'target_type': targetType,
      'target_id': targetId,
      'reason': reason,
      if (body != null && body.isNotEmpty) 'body': body,
    }));
  }

  @override
  Future<List<CommunityNotification>> fetchCommunityNotifications() async {
    if (_uid == null) return const [];
    // RLS scopes SELECT to the user's own rows.
    final rows = await _t(_db
        .from('community_notifications')
        .select()
        .order('created_at', ascending: false)
        .limit(50));
    return (rows as List)
        .map((r) => CommunityNotification.fromJson(r as Map<String, dynamic>))
        .toList();
  }

  @override
  Future<void> markCommunityNotificationsRead() async {
    if (_uid == null) return;
    // RLS scopes UPDATE to the user's own rows; only touch the unread ones.
    await _t(_db
        .from('community_notifications')
        .update({'read_at': DateTime.now().toUtc().toIso8601String()})
        .eq('user_id', _uid!)
        .isFilter('read_at', null));
  }

  // ── WhatsApp CRM (admin-only) ────────────────────────────────────────────────
  // All access goes through the `crm-api` edge function. functions.invoke
  // auto-attaches the signed-in user's JWT; the function gates on
  // profiles.is_admin and reads/writes the whatsapp_* / leads tables via the
  // service role. We never touch those tables directly from the client.

  // Calls a `crm-api` action and returns its decoded JSON body, raising on a
  // non-2xx so callers surface the same kind of error as the other methods.
  Future<Map<String, dynamic>> _crm(String action, [Map<String, dynamic>? extra]) async {
    final res = await _t(_db.functions.invoke('crm-api', body: {
      'action': action,
      if (extra != null) ...extra,
    }));
    final data = res.data;
    if (data is Map) return data.cast<String, dynamic>();
    return const {};
  }

  @override
  Future<bool> fetchIsAdmin() async {
    if (_uid == null) return false;
    final row = await _t(_db
        .from('profiles')
        .select('is_admin')
        .eq('id', _uid!)
        .maybeSingle());
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

  // ── Street price (street-price edge fn) ──────────────────────────────────────
  // Read-only GET of the threshold-gated aggregate (mirrors the fetchAdminMetrics
  // GET pattern; the fn is deployed --no-verify-jwt and functions.invoke attaches
  // the anon/session JWT + apikey headers exactly like the web's proxy does). The
  // server (`get_street_price()`) enforces the 5-report honesty gate and nulls
  // every price below it — we transport the body verbatim and NEVER synthesize a
  // figure. Fail-soft: ANY error → null (the service caches nothing and the app
  // behaves exactly as offline/today).
  @override
  Future<Map<String, dynamic>?> fetchStreetPrice({
    required String provider,
    required String category,
  }) async {
    final p = provider.trim();
    if (p.isEmpty) return null;
    try {
      final res = await _t(_db.functions.invoke(
        'street-price',
        method: HttpMethod.get,
        queryParameters: {
          'provider': p,
          // The deployed GET scopes by provider (see the fn's handleRead);
          // category rides along for forward-compat with a category cohort.
          'category': category,
        },
      ));
      final data = res.data;
      if (data is Map) return data.cast<String, dynamic>();
      if (data is String && data.isNotEmpty) {
        final decoded = jsonDecode(data);
        if (decoded is Map) return decoded.cast<String, dynamic>();
      }
      return null;
    } catch (_) {
      return null; // transport / non-2xx / parse — fail soft, never throw
    }
  }

  // ── Owner observability (admin-metrics edge fn) ──────────────────────────────
  // The `admin-metrics` function is a read-only GET with a ?days= window (1..90,
  // default 7). functions.invoke auto-attaches the signed-in user's JWT; the
  // function re-checks profiles.is_admin before reading the service-role-only
  // analytics_events / agent_tool_calls / security_audit_log / cron tables, and
  // returns counts only (never PII). We never touch those tables directly.
  @override
  Future<AdminMetrics> fetchAdminMetrics({int windowDays = 14}) async {
    final res = await _t(_db.functions.invoke(
      'admin-metrics',
      method: HttpMethod.get,
      queryParameters: {'days': '$windowDays'},
    ));
    final data = res.data;
    return AdminMetrics.fromJson(
      data is Map ? data.cast<String, dynamic>() : const {},
    );
  }
}
