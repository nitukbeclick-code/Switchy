import '../services/backend/local_backend.dart' show appBackend;

/// Which catalogue providers offer a Zoom video-meeting booking.
///
/// SINGLE SOURCE OF TRUTH is the live `public.provider_capabilities` table
/// (`supports_zoom_meeting = true`), read via [Backend.fetchZoomSupportedProviders]
/// and cached once per session by [zoomSupportedProviders]. This const list is the
/// OFFLINE / cold-start / fetch-failure FALLBACK — it must agree with the table's
/// seed (see supabase/provider-capabilities-2026-06.sql). Provider ids are the
/// EXACT catalogue ids (`public.plans.provider`), Hebrew-first.
///
/// Everything NOT in this set (019 מובייל, Xphone, רמי לוי, וואלה מובייל, גילת,
/// CCC, WeCom, Airalo eSIM, electricity suppliers, …) is treated as unsupported:
/// the meeting screen shows "ספק זה אינו תומך כרגע בשיחות וידאו" instead of the
/// booking form, and cross-sell entry points are hidden.
const Set<String> kZoomSupportedProviders = {
  'פרטנר',
  'yes',
  'STING TV',
  'HOT',
  'NextTV',
  'סלקום',
  'גולן טלקום',
  'בזק',
  'פלאפון',
  'הוט מובייל',
};

/// True when [provider] is offered a Zoom video meeting, checked against the
/// best currently-known set: the live cache once hydrated (see
/// [zoomSupportedProviders]), otherwise the const [kZoomSupportedProviders]
/// fallback. A null/blank provider is never supported (no provider chosen yet).
///
/// Synchronous on purpose — the gate runs inside `build`. Call
/// [zoomSupportedProviders] earlier (e.g. on screen mount) so the live set is
/// warmed before this is consulted; until then it honestly uses the const list.
bool providerSupportsZoom(String? provider) {
  final p = provider?.trim();
  if (p == null || p.isEmpty) return false;
  return _liveCache?.contains(p) ?? kZoomSupportedProviders.contains(p);
}

// The once-hydrated live set (null until the first successful fetch). Kept here
// (not in AppState) so the gate has a single, lazily-warmed source — mirrors the
// catalogue_sync "hydrate once, fall back to compiled" idiom.
Set<String>? _liveCache;
Future<Set<String>>? _inflight;

/// The live Zoom-supported provider set from `public.provider_capabilities`,
/// hydrated once and cached for the session. On ANY failure (offline, RLS,
/// empty, transport) it falls back to the const [kZoomSupportedProviders] and
/// does NOT cache the fallback, so a later call can still pick up the live table.
///
/// Lazy + cached: concurrent callers share one in-flight fetch. After this
/// resolves, the synchronous [providerSupportsZoom] reflects the live set.
Future<Set<String>> zoomSupportedProviders() async {
  final cached = _liveCache;
  if (cached != null) return cached;
  return _inflight ??= _hydrate();
}

Future<Set<String>> _hydrate() async {
  try {
    final live = await appBackend.fetchZoomSupportedProviders();
    // An empty/failed read must not blank the gate — keep the const fallback and
    // stay un-cached so a later attempt can hydrate the real table.
    if (live.isEmpty) {
      _inflight = null;
      return kZoomSupportedProviders;
    }
    _liveCache = live;
    return live;
  } catch (_) {
    _inflight = null;
    return kZoomSupportedProviders;
  }
}

/// Test seam — clears the session cache so each test starts from the const
/// fallback (mirrors AppState.reset()).
void resetZoomProviderCacheForTest() {
  _liveCache = null;
  _inflight = null;
}
