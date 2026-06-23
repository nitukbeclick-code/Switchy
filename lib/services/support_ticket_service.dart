import 'package:supabase_flutter/supabase_flutter.dart';

class SupportMessage {
  final String id;
  final String ticketId;
  final String role; // 'user', 'agent', 'human'
  final String messageText;
  final Map<String, dynamic>? metadata;
  final DateTime createdAt;

  SupportMessage({
    required this.id,
    required this.ticketId,
    required this.role,
    required this.messageText,
    this.metadata,
    required this.createdAt,
  });

  factory SupportMessage.fromJson(Map<String, dynamic> json) {
    return SupportMessage(
      id: json['id'] as String,
      ticketId: json['ticket_id'] as String,
      role: json['role'] as String,
      messageText: json['message_text'] as String,
      metadata: json['metadata'] as Map<String, dynamic>?,
      createdAt: DateTime.parse(json['created_at'] as String),
    );
  }

  Map<String, dynamic> toJson() => {
    'id': id,
    'ticket_id': ticketId,
    'role': role,
    'message_text': messageText,
    'metadata': metadata,
    'created_at': createdAt.toIso8601String(),
  };
}

class SupportTicket {
  final String id;
  final String userId;
  final String status; // 'open', 'agent_active', 'human_assigned', 'resolved'
  final String agentType; // 'advisor', 'sales'
  final DateTime? escalatedAt;
  final String? humanAssignedTo;
  final String? telegramGroupId;
  final DateTime createdAt;
  final DateTime updatedAt;

  SupportTicket({
    required this.id,
    required this.userId,
    required this.status,
    required this.agentType,
    this.escalatedAt,
    this.humanAssignedTo,
    this.telegramGroupId,
    required this.createdAt,
    required this.updatedAt,
  });

  factory SupportTicket.fromJson(Map<String, dynamic> json) {
    return SupportTicket(
      id: json['id'] as String,
      userId: json['user_id'] as String,
      status: json['status'] as String,
      agentType: json['agent_type'] as String? ?? 'advisor',
      escalatedAt: json['escalated_at'] != null ? DateTime.parse(json['escalated_at'] as String) : null,
      humanAssignedTo: json['human_assigned_to'] as String?,
      telegramGroupId: json['telegram_group_id'] as String?,
      createdAt: DateTime.parse(json['created_at'] as String),
      updatedAt: DateTime.parse(json['updated_at'] as String),
    );
  }

  Map<String, dynamic> toJson() => {
    'id': id,
    'user_id': userId,
    'status': status,
    'agent_type': agentType,
    'escalated_at': escalatedAt?.toIso8601String(),
    'human_assigned_to': humanAssignedTo,
    'telegram_group_id': telegramGroupId,
    'created_at': createdAt.toIso8601String(),
    'updated_at': updatedAt.toIso8601String(),
  };
}

class SupportTicketService {
  final SupabaseClient _supabase;

  SupportTicketService(this._supabase);

  /// Create a new support ticket or return existing open one
  Future<String> createOrOpenTicket(String userId) async {
    try {
      // Check if there's an open ticket
      final existing = await _supabase
          .from('support_tickets')
          .select('id')
          .eq('user_id', userId)
          .neq('status', 'resolved')
          .limit(1)
          .maybeSingle();

      if (existing != null) {
        return existing['id'] as String;
      }

      // Create new ticket
      final response = await _supabase
          .from('support_tickets')
          .insert({
            'user_id': userId,
            'status': 'agent_active',
            'agent_type': 'advisor',
          })
          .select('id')
          .single();

      return response['id'] as String;
    } catch (e) {
      throw Exception('Failed to create/open ticket: $e');
    }
  }

  /// Send a message to the support ticket (calls Edge Function)
  Future<Map<String, dynamic>> sendMessage(
    String ticketId,
    String userId,
    String userMessage,
  ) async {
    try {
      final response = await _supabase.functions.invoke(
        'support-agent',
        body: {
          'ticketId': ticketId,
          'userId': userId,
          'userMessage': userMessage,
        },
      );

      return response as Map<String, dynamic>;
    } catch (e) {
      throw Exception('Failed to send message: $e');
    }
  }

  /// Subscribe to real-time messages for a ticket
  Stream<List<SupportMessage>> messageStream(String ticketId) {
    return _supabase
        .from('support_messages')
        .stream(primaryKey: ['id'])
        .eq('ticket_id', ticketId)
        .order('created_at')
        .map((list) => list.map((json) => SupportMessage.fromJson(json)).toList());
  }

  /// Subscribe to ticket status changes
  Stream<SupportTicket> ticketStream(String ticketId) {
    return _supabase
        .from('support_tickets')
        .stream(primaryKey: ['id'])
        .eq('id', ticketId)
        .map((list) {
          if (list.isEmpty) throw Exception('Ticket not found');
          return SupportTicket.fromJson(list.first);
        });
  }

  /// Escalate to human (user taps "talk to human" chip)
  Future<void> escalateToHuman(String ticketId, String userId, String reason) async {
    try {
      await sendMessage(ticketId, userId, 'אני רוצה לדבר עם נציג אנושי');
    } catch (e) {
      throw Exception('Failed to escalate to human: $e');
    }
  }

  /// Get full ticket with latest messages
  Future<(SupportTicket, List<SupportMessage>)> getTicketWithMessages(String ticketId) async {
    try {
      final ticket = await _supabase
          .from('support_tickets')
          .select()
          .eq('id', ticketId)
          .single();

      final messages = await _supabase
          .from('support_messages')
          .select()
          .eq('ticket_id', ticketId)
          .order('created_at');

      return (
        SupportTicket.fromJson(ticket),
        (messages as List).map((m) => SupportMessage.fromJson(m as Map<String, dynamic>)).toList(),
      );
    } catch (e) {
      throw Exception('Failed to get ticket with messages: $e');
    }
  }

  /// Get user's open tickets
  Future<List<SupportTicket>> getOpenTickets(String userId) async {
    try {
      final response = await _supabase
          .from('support_tickets')
          .select()
          .eq('user_id', userId)
          .neq('status', 'resolved')
          .order('created_at', ascending: false);

      return (response as List)
          .map((t) => SupportTicket.fromJson(t as Map<String, dynamic>))
          .toList();
    } catch (e) {
      throw Exception('Failed to get open tickets: $e');
    }
  }

  /// Close a ticket
  Future<void> closeTicket(String ticketId) async {
    try {
      await _supabase
          .from('support_tickets')
          .update({'status': 'resolved'})
          .eq('id', ticketId);
    } catch (e) {
      throw Exception('Failed to close ticket: $e');
    }
  }
}
