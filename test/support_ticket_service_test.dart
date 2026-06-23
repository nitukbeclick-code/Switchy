import 'package:flutter_test/flutter_test.dart';
import 'package:chosech/services/support_ticket_service.dart';

/// Tests for the pure, network-free surface of [SupportTicketService]: the
/// [SupportMessage] / [SupportTicket] DTO mapping that talks to the
/// `support_messages` / `support_tickets` tables.
///
/// The service methods themselves are thin Supabase wrappers (queries, edge
/// `functions.invoke`, Realtime streams) — they need a live `SupabaseClient`
/// and are exercised end-to-end, not here. What IS worth pinning is the JSON
/// shaping: a column rename or a changed default would silently break the chat
/// UI, and these round-trips catch that without pumping a widget or a socket.
void main() {
  group('SupportMessage', () {
    final json = {
      'id': 'msg-1',
      'ticket_id': 'tkt-1',
      'role': 'agent',
      'message_text': 'שלום, איך אפשר לעזור?',
      'metadata': {'model': 'gpt', 'tokens': 42},
      'created_at': '2026-06-22T08:30:00.000Z',
    };

    test('fromJson maps every column', () {
      final m = SupportMessage.fromJson(json);
      expect(m.id, 'msg-1');
      expect(m.ticketId, 'tkt-1');
      expect(m.role, 'agent');
      expect(m.messageText, 'שלום, איך אפשר לעזור?');
      expect(m.metadata, {'model': 'gpt', 'tokens': 42});
      expect(m.createdAt, DateTime.parse('2026-06-22T08:30:00.000Z'));
    });

    test('round-trips through toJson back to fromJson', () {
      final m = SupportMessage.fromJson(json);
      final back = SupportMessage.fromJson(m.toJson());
      expect(back.id, m.id);
      expect(back.ticketId, m.ticketId);
      expect(back.role, m.role);
      expect(back.messageText, m.messageText);
      expect(back.metadata, m.metadata);
      expect(back.createdAt, m.createdAt);
    });

    test('null metadata is preserved as null', () {
      final m = SupportMessage.fromJson({...json, 'metadata': null});
      expect(m.metadata, isNull);
      expect(m.toJson()['metadata'], isNull);
    });
  });

  group('SupportTicket', () {
    final json = {
      'id': 'tkt-1',
      'user_id': 'user-1',
      'status': 'agent_active',
      'agent_type': 'sales',
      'escalated_at': '2026-06-22T09:00:00.000Z',
      'human_assigned_to': 'rep-7',
      'telegram_group_id': '-100123',
      'created_at': '2026-06-22T08:00:00.000Z',
      'updated_at': '2026-06-22T09:00:00.000Z',
    };

    test('fromJson maps every column', () {
      final t = SupportTicket.fromJson(json);
      expect(t.id, 'tkt-1');
      expect(t.userId, 'user-1');
      expect(t.status, 'agent_active');
      expect(t.agentType, 'sales');
      expect(t.escalatedAt, DateTime.parse('2026-06-22T09:00:00.000Z'));
      expect(t.humanAssignedTo, 'rep-7');
      expect(t.telegramGroupId, '-100123');
      expect(t.createdAt, DateTime.parse('2026-06-22T08:00:00.000Z'));
      expect(t.updatedAt, DateTime.parse('2026-06-22T09:00:00.000Z'));
    });

    test('round-trips through toJson back to fromJson', () {
      final t = SupportTicket.fromJson(json);
      final back = SupportTicket.fromJson(t.toJson());
      expect(back.id, t.id);
      expect(back.userId, t.userId);
      expect(back.status, t.status);
      expect(back.agentType, t.agentType);
      expect(back.escalatedAt, t.escalatedAt);
      expect(back.humanAssignedTo, t.humanAssignedTo);
      expect(back.telegramGroupId, t.telegramGroupId);
      expect(back.createdAt, t.createdAt);
      expect(back.updatedAt, t.updatedAt);
    });

    test('agent_type defaults to advisor when absent or null', () {
      final missing = Map<String, dynamic>.from(json)..remove('agent_type');
      expect(SupportTicket.fromJson(missing).agentType, 'advisor');
      expect(SupportTicket.fromJson({...json, 'agent_type': null}).agentType, 'advisor');
    });

    test('optional columns tolerate null', () {
      final t = SupportTicket.fromJson({
        ...json,
        'escalated_at': null,
        'human_assigned_to': null,
        'telegram_group_id': null,
      });
      expect(t.escalatedAt, isNull);
      expect(t.humanAssignedTo, isNull);
      expect(t.telegramGroupId, isNull);
      // …and they survive a toJson round-trip as nulls (not dropped/defaulted).
      final back = SupportTicket.fromJson(t.toJson());
      expect(back.escalatedAt, isNull);
      expect(back.humanAssignedTo, isNull);
      expect(back.telegramGroupId, isNull);
    });
  });
}
