import 'package:flutter_test/flutter_test.dart';
import 'package:chosech/services/support_ticket_service.dart';

// Pins the defensive deserialization: a malformed/partial server row must
// degrade to a valid object, never throw and blank the support screen.

void main() {
  group('SupportMessage.fromJson', () {
    test('parses a complete row', () {
      final m = SupportMessage.fromJson({
        'id': 'msg1',
        'ticket_id': 't1',
        'role': 'human',
        'message_text': 'שלום',
        'metadata': {'k': 'v'},
        'created_at': '2026-06-17T10:00:00Z',
      });
      expect(m.id, 'msg1');
      expect(m.ticketId, 't1');
      expect(m.role, 'human');
      expect(m.messageText, 'שלום');
      expect(m.metadata, {'k': 'v'});
      expect(m.createdAt.toUtc(), DateTime.utc(2026, 6, 17, 10));
    });

    test('does not throw on missing / null required fields', () {
      expect(() => SupportMessage.fromJson({}), returnsNormally);
      final m = SupportMessage.fromJson({
        'id': null,
        'message_text': null,
        'created_at': 'not-a-date',
      });
      expect(m.id, '');
      expect(m.messageText, '');
      expect(m.role, 'agent'); // default
      expect(m.createdAt, isA<DateTime>()); // fell back, not crashed
    });
  });

  group('SupportTicket.fromJson', () {
    test('parses a complete row', () {
      final t = SupportTicket.fromJson({
        'id': 'tk1',
        'user_id': 'u1',
        'status': 'agent_active',
        'agent_type': 'sales',
        'escalated_at': '2026-06-17T09:00:00Z',
        'created_at': '2026-06-17T08:00:00Z',
        'updated_at': '2026-06-17T09:30:00Z',
      });
      expect(t.id, 'tk1');
      expect(t.status, 'agent_active');
      expect(t.agentType, 'sales');
      expect(t.escalatedAt!.toUtc(), DateTime.utc(2026, 6, 17, 9));
    });

    test('does not throw on missing / null / malformed fields', () {
      expect(() => SupportTicket.fromJson({}), returnsNormally);
      final t = SupportTicket.fromJson({
        'id': null,
        'user_id': null,
        'status': null,
        'created_at': 'bad',
        'updated_at': null,
      });
      expect(t.id, '');
      expect(t.status, 'open'); // default
      expect(t.agentType, 'advisor'); // default
      expect(t.escalatedAt, isNull); // absent → null, not a crash
      expect(t.createdAt, isA<DateTime>());
    });
  });
}
