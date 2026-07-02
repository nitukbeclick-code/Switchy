import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;

/// The product-funnel events we track. The string [name] is the wire value sent
/// to the `analytics-track` edge function (and stored in `analytics_events`);
/// it MUST stay in sync with the `ALLOWED_EVENTS` set in
/// `supabase/functions/analytics-track/index.ts`.
enum AnalyticsEvent {
  appOpen('appOpen'),
  leadStart('leadStart'),
  leadSubmit('leadSubmit'),
  quizComplete('quizComplete'),
  compareView('compareView'),
  searchQuery('searchQuery'),
  whatsappClick('whatsappClick'),
  savingsViewed('savingsViewed'),
  planView('planView'),
  meetingRequest('meetingRequest');

  const AnalyticsEvent(this.name);

  /// The wire name posted to the edge function.
  final String name;
}

/// Fire-and-forget product analytics.
///
/// [track] POSTs a single funnel event to the `analytics-track` Supabase edge
/// function and returns immediately — it never throws, never blocks the UI, and
/// silently no-ops when the backend isn't configured. Pure plumbing: no widgets,
/// no app state. Web-safe (uses `package:http`; no `dart:io`).
///
/// The Supabase URL / anon key come from the same `--dart-define`s `main.dart`
/// uses to pick the backend, so a no-key run (plain `flutter run`, tests, CI)
/// simply drops every beacon on the floor.
class AnalyticsService {
  AnalyticsService._();

  // Supplied at build time with `--dart-define` (or `--dart-define-from-file`),
  // mirroring main.dart. Empty when not provided ⇒ analytics is a no-op.
  static const String _supabaseUrl = String.fromEnvironment('SUPABASE_URL');
  static const String _supabaseAnonKey = String.fromEnvironment('SUPABASE_ANON_KEY');

  /// How long to wait before abandoning a beacon. Kept short: analytics must
  /// never hold anything up, and a dropped event is harmless.
  static const Duration _timeout = Duration(seconds: 5);

  /// True only when the Supabase keys are present — otherwise every [track]
  /// call short-circuits to a no-op.
  static bool get isEnabled => _supabaseUrl.isNotEmpty && _supabaseAnonKey.isNotEmpty;

  /// The edge-function endpoint, or null when not configured.
  static Uri? get _endpoint {
    if (!isEnabled) return null;
    // SUPABASE_URL is the project base (https://<ref>.supabase.co); edge
    // functions live under /functions/v1/<name>. Trim a trailing slash so we
    // don't produce a double slash.
    final base = _supabaseUrl.endsWith('/')
        ? _supabaseUrl.substring(0, _supabaseUrl.length - 1)
        : _supabaseUrl;
    return Uri.parse('$base/functions/v1/analytics-track');
  }

  /// Records [event] with optional [props]. Fire-and-forget: returns a future
  /// that completes once the beacon is sent (or dropped), but callers normally
  /// don't await it. Any failure — no keys, offline, non-2xx, timeout — is
  /// swallowed so a tracking call can never break a user flow.
  ///
  /// [props] should be a small bag of plain scalar values (plan id, category,
  /// source, count…); never PII or large blobs — the edge function sanitises and
  /// size-bounds it server-side, dropping anything non-scalar.
  static Future<void> track(
    AnalyticsEvent event, {
    Map<String, Object?>? props,
  }) async {
    final endpoint = _endpoint;
    if (endpoint == null) return; // not configured ⇒ no-op

    try {
      final payload = <String, Object?>{
        'event': event.name,
        if (props != null && props.isNotEmpty) 'props': _scalarsOnly(props),
        'ts': DateTime.now().toUtc().millisecondsSinceEpoch,
      };
      await http
          .post(
            endpoint,
            headers: const {
              'Content-Type': 'application/json',
              // Supabase gateway requires the anon key even on a --no-verify-jwt
              // function; without it the request is rejected at the edge.
              'apikey': _supabaseAnonKey,
              'Authorization': 'Bearer $_supabaseAnonKey',
            },
            body: jsonEncode(payload),
          )
          .timeout(_timeout);
    } catch (e) {
      // Never surface analytics failures to the user.
      if (kDebugMode) debugPrint('analytics drop: ${event.name} ($e)');
    }
  }

  /// Keep only plain scalar values client-side (the edge fn does the same), so a
  /// stray object/list/null never bloats the payload or trips the server guard.
  static Map<String, Object?> _scalarsOnly(Map<String, Object?> props) {
    final out = <String, Object?>{};
    for (final e in props.entries) {
      final v = e.value;
      if (v is String || v is num || v is bool) out[e.key] = v;
    }
    return out;
  }
}
