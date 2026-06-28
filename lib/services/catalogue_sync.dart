import 'dart:async';

import '../app_state.dart';
import '../data.dart';
import 'backend/backend.dart';
import 'backend/local_backend.dart' show appBackend;
import 'realtime_service.dart';

/// App-level live-catalogue refresh.
///
/// The owner edits prices / benefits / fine-print straight on `public.plans`
/// (via the Supabase dashboard); those edits must reach the running app WITHOUT
/// an App Store release. This service hydrates [allPlans] from the live table
/// once at cold start and then keeps it fresh off the backend's
/// [Backend.catalogueChanges] Realtime stream (with the [RealtimePoller]
/// heartbeat as the polling fallback when Realtime is unavailable).
///
/// TRUTH-ONLY + NEVER-BLANK: the heavy lifting lives in [hydrateCatalogue],
/// which keeps the compiled snapshot as the immediate value + last-known-good
/// fallback and only ever swaps in a successful, non-empty live read. This
/// service merely decides WHEN to refresh and notifies [AppState] so every
/// catalogue-reading surface rebuilds with the new data. Under [LocalBackend]
/// the catalogue is the compiled snapshot and the stream is empty, so this is a
/// cheap no-op beyond the initial (compiled) hydrate.
class CatalogueSync {
  CatalogueSync._();

  static RealtimePoller? _poller;
  static bool _started = false;

  /// (Re)start the live-catalogue refresh. Idempotent: a second call replaces
  /// the previous poller/subscription. Called from `main.dart` after the backend
  /// is up. The initial hydrate is awaited so a fast network has fresh prices on
  /// first paint; on a slow/absent network the already-seeded compiled snapshot
  /// renders immediately and the refresh lands later.
  static Future<void> start() async {
    _poller?.dispose();
    _poller = RealtimePoller(
      eventStream: appBackend.catalogueChanges(),
      onRefresh: refresh,
      // The catalogue changes rarely (an owner edit), so a relaxed heartbeat is
      // plenty; the fast fallback keeps it fresh if Realtime is down.
      slowInterval: const Duration(minutes: 5),
      fastInterval: const Duration(minutes: 1),
    )..start();
    _started = true;
    await refresh();
  }

  /// One-shot refresh: pull the live catalogue and, when a fresh snapshot was
  /// applied, notify [AppState] so consumers rebuild. A failed / empty read
  /// keeps the last-known-good catalogue and notifies nothing (no visible
  /// flicker, no blank).
  static Future<void> refresh() async {
    final applied = await hydrateCatalogue(appBackend);
    if (applied) {
      // Rebuild every catalogue-reading widget with the refreshed [allPlans].
      AppState().update(() {});
    }
  }

  /// Whether [start] has run this session (exposed for tests / diagnostics).
  static bool get isStarted => _started;

  static void stop() {
    _poller?.dispose();
    _poller = null;
    _started = false;
  }
}
