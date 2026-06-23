import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:chosech/services/realtime_service.dart';

/// Tests for [RealtimePoller] — the realtime-first / poll-fallback driver behind
/// the CRM screen. Uses short real durations (a few ms) and a [StreamController]
/// as the fake "realtime channel" so the debounce + heartbeat + fallback logic
/// is exercised deterministically without a live Supabase socket.
void main() {
  group('RealtimePoller', () {
    test('an empty realtime stream still polls on the fast heartbeat', () async {
      var refreshes = 0;
      final poller = RealtimePoller(
        eventStream: const Stream<void>.empty(),
        onRefresh: () async => refreshes++,
        fastInterval: const Duration(milliseconds: 20),
        slowInterval: const Duration(milliseconds: 200),
        fallbackAfter: const Duration(milliseconds: 50),
      )..start();

      // No realtime events ⇒ realtime is never "live"; the fast heartbeat fires.
      await Future<void>.delayed(const Duration(milliseconds: 70));
      poller.dispose();

      expect(poller.isRealtimeLive, isFalse);
      expect(refreshes, greaterThanOrEqualTo(2));
    });

    test('a realtime event debounces into a single refresh and marks live', () async {
      final ctrl = StreamController<void>.broadcast();
      var refreshes = 0;
      final poller = RealtimePoller(
        eventStream: ctrl.stream,
        onRefresh: () async => refreshes++,
        debounce: const Duration(milliseconds: 30),
        fastInterval: const Duration(seconds: 10),
        slowInterval: const Duration(seconds: 10),
        fallbackAfter: const Duration(seconds: 10),
      )..start();

      // A burst of three events should collapse to one debounced refresh.
      ctrl.add(null);
      ctrl.add(null);
      ctrl.add(null);
      await Future<void>.delayed(const Duration(milliseconds: 60));

      expect(refreshes, 1);
      expect(poller.isRealtimeLive, isTrue);

      poller.dispose();
      await ctrl.close();
    });

    test('falls back to fast polling after the realtime channel goes quiet', () async {
      final ctrl = StreamController<void>.broadcast();
      var refreshes = 0;
      final poller = RealtimePoller(
        eventStream: ctrl.stream,
        onRefresh: () async => refreshes++,
        debounce: const Duration(milliseconds: 5),
        fastInterval: const Duration(milliseconds: 20),
        slowInterval: const Duration(milliseconds: 500),
        fallbackAfter: const Duration(milliseconds: 30),
      )..start();

      // One event → realtime is healthy, heartbeat relaxes to the slow cadence.
      ctrl.add(null);
      await Future<void>.delayed(const Duration(milliseconds: 15));
      expect(poller.isRealtimeLive, isTrue);

      // Now go quiet past [fallbackAfter]: realtime is considered stale and the
      // heartbeat drops back to the fast cadence, so refreshes keep coming.
      final before = refreshes;
      await Future<void>.delayed(const Duration(milliseconds: 120));
      poller.dispose();

      expect(poller.isRealtimeLive, isFalse);
      expect(refreshes, greaterThan(before));
    });

    test('dispose stops all refreshes (no further heartbeat or debounced calls)',
        () async {
      final ctrl = StreamController<void>.broadcast();
      var refreshes = 0;
      final poller = RealtimePoller(
        eventStream: ctrl.stream,
        onRefresh: () async => refreshes++,
        debounce: const Duration(milliseconds: 10),
        fastInterval: const Duration(milliseconds: 20),
        slowInterval: const Duration(milliseconds: 20),
        fallbackAfter: const Duration(milliseconds: 20),
      )..start();

      ctrl.add(null); // schedule a debounced refresh…
      poller.dispose(); // …then tear down before it (or any heartbeat) fires.
      final after = refreshes;

      await Future<void>.delayed(const Duration(milliseconds: 80));
      expect(refreshes, after); // nothing ran post-dispose
      await ctrl.close();
    });
  });
}
