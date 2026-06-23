import 'dart:async';
import 'dart:convert';

/// One turn in the advisor transcript as the edge agent expects it
/// (`{role: 'user'|'bot', text}`), mirroring the `site-ai-chat` contract.
class AdvisorTurn {
  const AdvisorTurn({required this.role, required this.text});

  /// 'user' for the human, 'bot' for the assistant. Anything else is coerced to
  /// 'bot' when serialised so the edge function never sees an unknown role.
  final String role;
  final String text;

  bool get isUser => role == 'user';

  Map<String, String> toJson() => {
        'role': role == 'user' ? 'user' : 'bot',
        'text': text,
      };
}

/// The structured result of an edge advisor turn. Mirrors the `site-ai-chat`
/// JSON response (`{reply, offerLead?, leadCaptured?, contextTruncated?,
/// sessionId?}`) plus a [fromFallback] flag the widget uses to badge an
/// offline/degraded answer.
class EdgeAdvisorResult {
  const EdgeAdvisorResult({
    required this.reply,
    this.offerLead = false,
    this.leadCaptured = false,
    this.contextTruncated = false,
    this.sessionId,
    this.fromFallback = false,
  });

  /// The Hebrew reply to show in the chat bubble.
  final String reply;

  /// True when the agent detected a genuine switch/contact intent and the UI
  /// should offer to collect name+phone+consent (Spam-Law: offer only, no
  /// capture without explicit consent).
  final bool offerLead;

  /// True when a consented lead was just captured server-side.
  final bool leadCaptured;

  /// True when older turns fell outside the model's context window, so the UI
  /// can note the assistant has limited recall of earlier messages.
  final bool contextTruncated;

  /// The session id the server echoed back (enables cross-reload memory). The
  /// widget persists it and replays it on the next turn.
  final String? sessionId;

  /// True when this answer came from the on-device [AdvisorEngine] fallback
  /// rather than the live edge agent (no network, edge not configured, or a
  /// non-2xx / timeout). The widget can badge it "מצב לא מקוון".
  final bool fromFallback;
}

/// Transport contract for the advisor edge call, so the widget can inject the
/// live Supabase invoker and tests can inject a fake without a network. Returns
/// the decoded JSON body of a successful call; throws on any transport / non-2xx
/// / parse failure so [EdgeAdvisor] can fall back deterministically.
typedef AdvisorInvoker = Future<Map<String, dynamic>> Function(
  Map<String, dynamic> body,
);

/// Calls the `site-ai-chat` edge agent over HTTP and adapts its JSON to an
/// [EdgeAdvisorResult]. Pure plumbing: it owns no UI and no AppState — the
/// widget builds the [AdvisorTurn] history + session id, calls [respond], and
/// renders the result; on any failure the widget supplies an offline reply via
/// the local [AdvisorEngine]. Web-safe (no `dart:io`).
///
/// Multi-turn: the caller passes the running [history] and the server-issued
/// [sessionId]; the edge function merges its stored transcript with the replayed
/// history so the conversation survives a reload, and echoes the sessionId back.
class EdgeAdvisor {
  EdgeAdvisor({
    required AdvisorInvoker invoker,
    this.timeout = const Duration(seconds: 12),
  }) : _invoke = invoker;

  final AdvisorInvoker _invoke;

  /// Hard ceiling on the edge round-trip — past this we give up and let the
  /// caller fall back offline rather than hang the chat.
  final Duration timeout;

  /// Max turns of history we replay to the edge agent. The function itself caps
  /// at 6; we trim client-side too so we never ship an unbounded payload.
  static const int maxHistoryTurns = 6;

  /// Ask the edge agent. [message] is the new user text; [history] is the prior
  /// transcript (oldest→newest); [sessionId] enables cross-reload memory.
  ///
  /// Throws nothing: any transport/non-2xx/parse/timeout failure is converted
  /// into a thrown [EdgeAdvisorException] the caller catches to fall back. The
  /// caller is the one that decides what the offline reply is (the local
  /// [AdvisorEngine]) — keeping this layer free of that dependency.
  Future<EdgeAdvisorResult> respond(
    String message, {
    List<AdvisorTurn> history = const [],
    String? sessionId,
  }) async {
    final trimmed = history.length > maxHistoryTurns
        ? history.sublist(history.length - maxHistoryTurns)
        : history;

    final body = <String, dynamic>{
      'message': message,
      'history': trimmed.map((t) => t.toJson()).toList(),
      if (sessionId != null && sessionId.isNotEmpty) 'sessionId': sessionId,
    };

    final Map<String, dynamic> data;
    try {
      data = await _invoke(body).timeout(timeout);
    } on TimeoutException {
      throw const EdgeAdvisorException('timeout');
    } catch (e) {
      throw EdgeAdvisorException(e.toString());
    }

    final reply = (data['reply'] as String?)?.trim() ?? '';
    // A 2xx with an empty/absent reply is as useless as a transport error — the
    // edge function returns `error` (not `reply`) when it can't answer, so treat
    // a missing reply as a failure and let the caller fall back.
    if (reply.isEmpty) throw const EdgeAdvisorException('empty reply');

    return EdgeAdvisorResult(
      reply: reply,
      offerLead: data['offerLead'] as bool? ?? false,
      leadCaptured: data['leadCaptured'] as bool? ?? false,
      contextTruncated: data['contextTruncated'] as bool? ?? false,
      sessionId: data['sessionId'] as String? ?? sessionId,
    );
  }

  /// Generate a fresh, URL-safe session id (matches the edge function's
  /// `^[A-Za-z0-9_-]{6,64}$` guard). Persisted by the widget on first turn.
  static String newSessionId() {
    final ts = DateTime.now().microsecondsSinceEpoch.toRadixString(36);
    final rnd = (DateTime.now().millisecondsSinceEpoch ^ 0x5f3759df)
        .toRadixString(36);
    return 'app_$ts$rnd';
  }
}

/// Raised by [EdgeAdvisor.respond] on any failure (transport, non-2xx, timeout,
/// empty reply). The caller catches it and falls back to the offline engine.
class EdgeAdvisorException implements Exception {
  const EdgeAdvisorException(this.reason);
  final String reason;
  @override
  String toString() => 'EdgeAdvisorException($reason)';
}

/// Encode/decode helper kept here so the widget and tests agree on the
/// edge-function body shape without re-importing `dart:convert` everywhere.
String encodeAdvisorBody(Map<String, dynamic> body) => jsonEncode(body);
