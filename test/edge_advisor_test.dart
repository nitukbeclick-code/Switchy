import 'package:flutter_test/flutter_test.dart';
import 'package:chosech/services/edge_advisor.dart';

/// Tests for [EdgeAdvisor] — the HTTP client for the `site-ai-chat` edge agent.
/// The transport is injected, so we mock the "HTTP" with a closure: no network,
/// fully deterministic. We assert it (a) adapts the JSON response, (b) trims +
/// ships the right body, and (c) converts every failure into an
/// [EdgeAdvisorException] the widget catches to fall back offline.
void main() {
  group('EdgeAdvisor.respond', () {
    test('adapts a full edge JSON response into a result', () async {
      Map<String, dynamic>? captured;
      final edge = EdgeAdvisor(invoker: (body) async {
        captured = body;
        return {
          'reply': 'מצאתי לך מסלול ב-₪29 [S1]',
          'offerLead': true,
          'contextTruncated': true,
          'sessionId': 'app_session_123',
        };
      });

      final res = await edge.respond(
        'אני רוצה לעבור לחבילה זולה',
        history: const [AdvisorTurn(role: 'user', text: 'שלום')],
        sessionId: 'app_session_123',
      );

      expect(res.reply, 'מצאתי לך מסלול ב-₪29 [S1]');
      expect(res.offerLead, isTrue);
      expect(res.contextTruncated, isTrue);
      expect(res.sessionId, 'app_session_123');
      expect(res.fromFallback, isFalse);

      // The body carries message + history (serialised role/text) + sessionId.
      expect(captured!['message'], 'אני רוצה לעבור לחבילה זולה');
      expect(captured!['sessionId'], 'app_session_123');
      final hist = captured!['history'] as List;
      expect(hist, hasLength(1));
      expect((hist.first as Map)['role'], 'user');
      expect((hist.first as Map)['text'], 'שלום');
    });

    test('defaults the optional flags when absent', () async {
      final edge = EdgeAdvisor(invoker: (_) async => {'reply': 'שלום!'});
      final res = await edge.respond('היי');
      expect(res.reply, 'שלום!');
      expect(res.offerLead, isFalse);
      expect(res.leadCaptured, isFalse);
      expect(res.contextTruncated, isFalse);
    });

    test('trims history to the last maxHistoryTurns turns', () async {
      List<dynamic>? sentHistory;
      final edge = EdgeAdvisor(invoker: (body) async {
        sentHistory = body['history'] as List;
        return {'reply': 'ok'};
      });
      final long = List.generate(
          12, (i) => AdvisorTurn(role: i.isEven ? 'user' : 'bot', text: 'turn$i'));
      await edge.respond('new', history: long);
      expect(sentHistory, hasLength(EdgeAdvisor.maxHistoryTurns));
      // Kept the NEWEST turns — the last entry is the latest of the input.
      expect((sentHistory!.last as Map)['text'], 'turn11');
    });

    test('omits sessionId from the body when null/empty', () async {
      Map<String, dynamic>? captured;
      final edge = EdgeAdvisor(invoker: (body) async {
        captured = body;
        return {'reply': 'ok'};
      });
      await edge.respond('hi');
      expect(captured!.containsKey('sessionId'), isFalse);
    });

    test('throws on a transport error (so the caller falls back)', () async {
      final edge = EdgeAdvisor(invoker: (_) async => throw Exception('boom'));
      expect(
        () => edge.respond('hi'),
        throwsA(isA<EdgeAdvisorException>()),
      );
    });

    test('throws on a 2xx with an empty/absent reply', () async {
      final edge = EdgeAdvisor(invoker: (_) async => {'error': 'busy'});
      expect(
        () => edge.respond('hi'),
        throwsA(isA<EdgeAdvisorException>()),
      );
    });

    test('throws on a timeout', () async {
      final edge = EdgeAdvisor(
        invoker: (_) async {
          await Future<void>.delayed(const Duration(seconds: 1));
          return {'reply': 'late'};
        },
        timeout: const Duration(milliseconds: 30),
      );
      expect(
        () => edge.respond('hi'),
        throwsA(isA<EdgeAdvisorException>()),
      );
    });

    test('newSessionId produces a URL-safe id matching the edge guard', () {
      final id = EdgeAdvisor.newSessionId();
      expect(RegExp(r'^[A-Za-z0-9_-]{6,64}$').hasMatch(id), isTrue);
    });
  });
}
