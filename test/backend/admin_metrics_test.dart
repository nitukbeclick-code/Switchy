import 'package:flutter_test/flutter_test.dart';
import 'package:chosech/services/backend/backend.dart';
import 'package:chosech/services/backend/local_backend.dart';

// Verifies the Dart `AdminMetrics` DTO is a faithful mirror of the
// `admin-metrics` edge function's JSON response (see
// supabase/functions/admin-metrics/{index,metrics}.ts and
// _shared/cron_health.ts). If the contract drifts, these parse asserts break.
void main() {
  group('AdminMetrics.fromJson — real edge-fn shape', () {
    // A representative payload in the EXACT shape index.ts returns.
    final payload = <String, dynamic>{
      'ok': true,
      'window': {'days': 7, 'since': '2026-06-16T00:00:00.000Z'},
      'analytics': {
        'total': 30,
        'events': [
          {
            'event': 'planView',
            'total': 18,
            'days': [
              {'day': '2026-06-23', 'events': 10},
              {'day': '2026-06-22', 'events': 8},
            ],
          },
          {
            'event': 'leadStart',
            'total': 12,
            'days': [
              {'day': '2026-06-23', 'events': 7},
              {'day': '2026-06-22', 'events': 5},
            ],
          },
        ],
      },
      'toolCalls': {
        'total': 100,
        'ok': 95,
        'rate': 0.95,
        'byTool': [
          {'key': 'search_plans', 'calls': 60, 'ok': 58, 'rate': 0.9667},
          {'key': 'analyze_bill', 'calls': 40, 'ok': 37, 'rate': 0.925},
        ],
        'byChannel': [
          {'key': 'whatsapp', 'calls': 70, 'ok': 67, 'rate': 0.9571},
        ],
      },
      'audit': {
        'total': 9,
        'byEvent': [
          {'event': 'status_change', 'count': 6},
          {'event': 'crm_takeover', 'count': 3},
        ],
      },
      'cron': {
        'ok': false,
        'known': 3,
        'stale': ['renewal_reminders'],
        'failing': [],
      },
    };

    test('parses every section faithfully', () {
      final m = AdminMetrics.fromJson(payload);

      expect(m.windowDays, 7);
      expect(m.totalEvents, 30);
      expect(m.events, hasLength(2));
      expect(m.events.first.event, 'planView');
      expect(m.events.first.total, 18);
      expect(m.events.first.days.first.events, 10);

      expect(m.toolCalls.total, 100);
      expect(m.toolCalls.ok, 95);
      expect(m.toolCalls.rate, closeTo(0.95, 1e-9));
      expect(m.toolCalls.byTool, hasLength(2));
      expect(m.toolCalls.byTool.first.key, 'search_plans');
      expect(m.toolCalls.byChannel.first.key, 'whatsapp');

      expect(m.audit.total, 9);
      expect(m.audit.byEvent.first.event, 'status_change');
      expect(m.audit.byEvent.first.count, 6);

      expect(m.cron.ok, isFalse);
      expect(m.cron.known, 3);
      expect(m.cron.stale, ['renewal_reminders']);
      expect(m.cron.failing, isEmpty);
      expect(m.cron.isUnknown, isFalse);
    });

    test('eventsByDay sums per-event series per date, oldest-first', () {
      final m = AdminMetrics.fromJson(payload);
      final byDay = m.eventsByDay;
      expect(byDay, hasLength(2));
      // Oldest first.
      expect(byDay.first.day.isBefore(byDay.last.day), isTrue);
      // 2026-06-22: 8 (planView) + 5 (leadStart) = 13; 2026-06-23: 10 + 7 = 17.
      expect(byDay.first.events, 13);
      expect(byDay.last.events, 17);
      // The flattened total matches the grand total.
      expect(byDay.fold<int>(0, (s, d) => s + d.events), m.totalEvents);
    });

    test('derived getters: rates, errors, totals', () {
      final m = AdminMetrics.fromJson(payload);
      expect(m.totalToolCalls, 100);
      expect(m.totalToolErrors, 5);
      expect(m.overallToolSuccessRate, closeTo(0.95, 1e-9));
      expect(m.totalAuditEvents, 9);
      expect(m.isEmpty, isFalse);
    });
  });

  group('AdminMetrics.fromJson — null/empty tolerance', () {
    test('an empty object yields honest zeros, never a crash', () {
      final m = AdminMetrics.fromJson(const {});
      expect(m.windowDays, 7); // edge-fn default window
      expect(m.events, isEmpty);
      expect(m.totalEvents, 0);
      expect(m.toolCalls.total, 0);
      expect(m.audit.total, 0);
      expect(m.cron.isUnknown, isTrue);
      expect(m.isEmpty, isTrue);
      expect(m.eventsByDay, isEmpty);
    });

    test('overall success rate is null (not 0%) when nothing was called', () {
      final m = AdminMetrics.fromJson(const {
        'toolCalls': {'total': 0, 'ok': 0, 'rate': 0, 'byTool': [], 'byChannel': []},
      });
      expect(m.overallToolSuccessRate, isNull);
    });

    test('a RateBucket success rate is null when it had no calls', () {
      const b = RateBucket(key: 'x', calls: 0, ok: 0, rate: 0);
      expect(b.successRate, isNull);
      expect(b.errors, 0);
    });

    test('cron with no registered jobs reads as unknown, not all-healthy', () {
      final m = AdminMetrics.fromJson(const {
        'cron': {'ok': true, 'known': 0, 'stale': [], 'failing': []},
      });
      expect(m.cron.isUnknown, isTrue);
    });
  });

  group('LocalBackend.fetchAdminMetrics — deterministic fake', () {
    test('returns a fully-populated payload mirroring the contract', () async {
      final backend = LocalBackend();
      final m = await backend.fetchAdminMetrics(windowDays: 14);

      expect(m.windowDays, 14);
      expect(m.events, isNotEmpty);
      expect(m.totalEvents, greaterThan(0));
      expect(m.eventsByDay, hasLength(14));
      expect(m.toolCalls.byTool, isNotEmpty);
      expect(m.overallToolSuccessRate, isNotNull);
      expect(m.audit.byEvent, isNotEmpty);
      // One stale cron job in the fake; nothing fabricated as failing.
      expect(m.cron.stale, contains('renewal_reminders'));
      expect(m.cron.isUnknown, isFalse);
      expect(m.isEmpty, isFalse);
    });

    test('clamps the window to the edge-fn range', () async {
      final backend = LocalBackend();
      expect((await backend.fetchAdminMetrics(windowDays: 0)).windowDays, 1);
      expect((await backend.fetchAdminMetrics(windowDays: 999)).windowDays, 90);
    });
  });
}
