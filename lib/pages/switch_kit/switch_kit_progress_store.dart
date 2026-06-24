import 'package:shared_preferences/shared_preferences.dart';

import '../../services/switch_kit.dart' show SwitchService;

/// Local persistence for the Switch Autopilot tracker's "done" steps.
///
/// The tracker is the USER'S OWN data — which exit steps they've checked off for
/// a given (provider, service). We store it directly via [SharedPreferences]
/// (one StringList per kit) instead of threading it through the shared
/// [AppState], so this Pillar's progress lives entirely behind its own owned
/// files and can never collide with another agent editing app_state.dart.
///
/// Web-safe: [SharedPreferences] is the same cross-platform store the rest of
/// the app uses (localStorage on web). All writes are best-effort — a storage
/// failure (e.g. a web quota error) is swallowed so a checkbox tap never crashes.
class SwitchKitProgressStore {
  /// Key prefix for every per-kit progress entry, namespaced so it can't clash
  /// with any other SharedPreferences key.
  static const String _prefix = 'switchKit.progress.';

  /// The storage key for one (provider, service) kit. Service is part of the key
  /// because the same provider has different checklists for cellular vs fixed.
  static String keyFor(String provider, SwitchService service) {
    final svc = service == SwitchService.cellular ? 'cellular' : 'fixed';
    // Normalize the provider into a stable, key-safe token (spaces/dots → '_').
    final p = provider.trim().replaceAll(RegExp(r'[\s.]+'), '_');
    return '$_prefix$svc.$p';
  }

  /// Load the set of completed step ids for a kit (empty when none stored).
  Future<Set<String>> load({
    required String provider,
    required SwitchService service,
  }) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final list = prefs.getStringList(keyFor(provider, service));
      return list == null ? <String>{} : list.toSet();
    } catch (_) {
      // Best-effort: an unreadable store yields a fresh (empty) tracker.
      return <String>{};
    }
  }

  /// Persist the completed step ids for a kit. Writing an empty set removes the
  /// key so a fully-restarted tracker leaves no stale entry behind.
  Future<void> save({
    required String provider,
    required SwitchService service,
    required Set<String> doneIds,
  }) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final key = keyFor(provider, service);
      if (doneIds.isEmpty) {
        await prefs.remove(key);
      } else {
        await prefs.setStringList(key, doneIds.toList());
      }
    } catch (_) {
      // Persistence is best-effort — never let a storage failure surface.
    }
  }
}
