import 'package:flutter_test/flutter_test.dart';
import 'package:chosech/services/analytics_dashboard.dart';
import 'package:chosech/services/backend/backend.dart';

// Fixed clock so the daily-window assertions are deterministic.
final _now = DateTime(2026, 6, 22, 12, 0);

CrmLead _lead({
  String id = 'l',
  String? provider,
  String? source,
  String status = 'new',
  DateTime? createdAt,
}) =>
    CrmLead(
      id: id,
      name: 'x',
      phone: '0500000000',
      provider: provider,
      source: source,
      status: status,
      createdAt: createdAt,
    );

CrmConversation _conv({
  String id = 'c',
  String status = 'bot',
  String? intent,
  bool botEnabled = true,
}) =>
    CrmConversation(
      conversationId: id,
      contactId: 'k$id',
      name: 'x',
      phone: '0500000000',
      status: status,
      intent: intent,
      botEnabled: botEnabled,
    );

void main() {
  group('AnalyticsDashboard.from — empty / honesty', () {
    test('no data ⇒ isEmpty, all zeros, null conversion (never fabricated)', () {
      final d = AnalyticsDashboard.from(
        leads: const [],
        conversations: const [],
        pipeline: const {},
        now: _now,
      );
      expect(d.isEmpty, isTrue);
      expect(d.totalLeads, 0);
      expect(d.totalConversations, 0);
      expect(d.wonLeads, 0);
      expect(d.conversionRate, isNull); // unknown, not 0% — honest
      expect(d.leadsBySource, isEmpty);
      expect(d.leadsByProvider, isEmpty);
      expect(d.leadsByService, isEmpty);
      // The daily series is still zero-filled across the window.
      expect(d.leadsByDay, hasLength(30));
      expect(d.peakDay, 0);
    });

    test('leads present but none terminal ⇒ conversion still null', () {
      final d = AnalyticsDashboard.from(
        leads: [_lead(status: 'new'), _lead(status: 'contacted')],
        conversations: const [],
        pipeline: const {'new': 1, 'contacted': 1},
        now: _now,
      );
      expect(d.isEmpty, isFalse);
      expect(d.closedLeads, 0);
      expect(d.conversionRate, isNull);
    });
  });

  group('AnalyticsDashboard.from — totals & pipeline', () {
    test('totals come from the lists; pipeline mirrors the supplied map', () {
      final d = AnalyticsDashboard.from(
        leads: [_lead(id: 'a'), _lead(id: 'b'), _lead(id: 'c')],
        conversations: [_conv(id: '1'), _conv(id: '2')],
        pipeline: const {'new': 1, 'contacted': 0, 'won': 1, 'lost': 1},
        now: _now,
      );
      expect(d.totalLeads, 3);
      expect(d.totalConversations, 2);
      expect(d.pipeline, {'new': 1, 'contacted': 0, 'won': 1, 'lost': 1});
      expect(d.wonLeads, 1);
      expect(d.closedLeads, 2); // won + lost
      expect(d.conversionRate, closeTo(0.5, 1e-9)); // 1 won / 2 closed
    });

    test('pipeline fills missing keys with 0', () {
      final d = AnalyticsDashboard.from(
        leads: const [],
        conversations: const [],
        pipeline: const {'won': 3},
        now: _now,
      );
      expect(d.pipeline['new'], 0);
      expect(d.pipeline['lost'], 0);
      expect(d.pipeline['won'], 3);
    });
  });

  group('AnalyticsDashboard.from — breakdowns (real counts + shares)', () {
    test('source breakdown is counted, sorted largest-first, shares sum ~1', () {
      final d = AnalyticsDashboard.from(
        leads: [
          _lead(source: 'whatsapp'),
          _lead(source: 'whatsapp'),
          _lead(source: 'whatsapp'),
          _lead(source: 'form'),
        ],
        conversations: const [],
        pipeline: const {},
        now: _now,
      );
      expect(d.leadsBySource.first.key, 'whatsapp');
      expect(d.leadsBySource.first.count, 3);
      expect(d.leadsBySource.first.share, closeTo(0.75, 1e-9));
      expect(d.leadsBySource[1].key, 'form');
      expect(d.leadsBySource[1].count, 1);
      final shareSum =
          d.leadsBySource.fold<double>(0, (s, r) => s + r.share);
      expect(shareSum, closeTo(1.0, 1e-9));
    });

    test('null/empty source buckets under unknownKey, not dropped', () {
      final d = AnalyticsDashboard.from(
        leads: [_lead(source: null), _lead(source: ''), _lead(source: 'form')],
        conversations: const [],
        pipeline: const {},
        now: _now,
      );
      final unknown =
          d.leadsBySource.firstWhere((r) => r.key == unknownKey);
      expect(unknown.count, 2); // null + empty both bucketed
      // Total share still 1.0 — nothing silently dropped.
      final shareSum =
          d.leadsBySource.fold<double>(0, (s, r) => s + r.share);
      expect(shareSum, closeTo(1.0, 1e-9));
    });

    test('service breakdown comes from conversation intent', () {
      final d = AnalyticsDashboard.from(
        leads: const [],
        conversations: [
          _conv(intent: 'cellular'),
          _conv(intent: 'cellular'),
          _conv(intent: 'internet'),
        ],
        pipeline: const {},
        now: _now,
      );
      expect(d.leadsByService.first.key, 'cellular');
      expect(d.leadsByService.first.count, 2);
    });
  });

  group('AnalyticsDashboard.from — daily series', () {
    test('zero-fills the window and counts leads on their local day', () {
      final d = AnalyticsDashboard.from(
        leads: [
          _lead(createdAt: _now), // today
          _lead(createdAt: _now), // today
          _lead(createdAt: _now.subtract(const Duration(days: 3))),
        ],
        conversations: const [],
        pipeline: const {},
        windowDays: 7,
        now: _now,
      );
      expect(d.leadsByDay, hasLength(7));
      // Series is oldest → newest; the last bucket is today.
      expect(d.leadsByDay.last.count, 2);
      expect(d.leadsByDay.last.day, DateTime(2026, 6, 22));
      expect(d.leadsByDay[3].count, 1); // 3 days before today (index 6-3)
      expect(d.peakDay, 2);
    });

    test('leads outside the window are excluded from the chart but still total', () {
      final d = AnalyticsDashboard.from(
        leads: [
          _lead(createdAt: _now.subtract(const Duration(days: 100))),
          _lead(createdAt: _now),
        ],
        conversations: const [],
        pipeline: const {},
        windowDays: 30,
        now: _now,
      );
      // Both count toward the total…
      expect(d.totalLeads, 2);
      // …but only the in-window one appears in the daily series.
      final inSeries =
          d.leadsByDay.fold<int>(0, (s, p) => s + p.count);
      expect(inSeries, 1);
    });

    test('leads with no timestamp are skipped from the series (no invention)', () {
      final d = AnalyticsDashboard.from(
        leads: [_lead(createdAt: null), _lead(createdAt: null)],
        conversations: const [],
        pipeline: const {},
        now: _now,
      );
      expect(d.totalLeads, 2);
      expect(d.peakDay, 0); // nothing dated ⇒ flat series, honest empty chart
    });
  });

  group('AnalyticsDashboard.from — WhatsApp handling', () {
    test('counts open / bot-active / human-takeover from real flags', () {
      final d = AnalyticsDashboard.from(
        leads: const [],
        conversations: [
          _conv(status: 'open', botEnabled: true),
          _conv(status: 'bot', botEnabled: true),
          _conv(status: 'human', botEnabled: false),
          _conv(status: 'human', botEnabled: false),
        ],
        pipeline: const {},
        now: _now,
      );
      expect(d.totalConversations, 4);
      expect(d.openConversations, 1);
      expect(d.botActive, 2);
      expect(d.humanTakeovers, 2);
    });
  });
}
