import 'dart:async';

/// Drives a screen's "live" data off a realtime [Stream] (a Supabase Realtime
/// channel under [SupabaseBackend]) with a graceful **polling fallback** when
/// realtime is unavailable — e.g. [LocalBackend]/CI emit an empty stream, the
/// table isn't in the `supabase_realtime` publication, or the socket drops.
///
/// The contract is deliberately backend-agnostic: you hand it an [eventStream]
/// (what to listen to) and an [onRefresh] callback (how to reload), and it:
///
///  * debounces bursts of realtime events into a single [onRefresh] (a rep
///    reply + takeover + hand-back arriving together shouldn't fire three
///    reloads), and
///  * runs a heartbeat [Timer] that polls on the SLOW cadence while realtime
///    is delivering events, and falls back to the FAST cadence if no realtime
///    event has been seen within [fallbackAfter] (so a dead socket degrades to
///    the old ~12s polling rather than going stale).
///
/// It owns no UI and no data — only the subscription + timer plumbing — so it is
/// pure and unit-testable, and keeps the existing AppState/Provider data flow
/// intact (the screen still holds the data; this just decides *when* to reload).
///
/// Web-safe: pure `dart:async`, no `dart:io`. Start one in `initState`, call
/// [dispose] in the widget's `dispose`.
class RealtimePoller {
  RealtimePoller({
    required Stream<void> eventStream,
    required Future<void> Function() onRefresh,
    this.debounce = const Duration(milliseconds: 300),
    this.slowInterval = const Duration(seconds: 45),
    this.fastInterval = const Duration(seconds: 12),
    this.fallbackAfter = const Duration(seconds: 30),
  })  : _eventStream = eventStream,
        _onRefresh = onRefresh;

  final Stream<void> _eventStream;
  final Future<void> Function() _onRefresh;

  /// Collapse a burst of realtime events into one refresh.
  final Duration debounce;

  /// Heartbeat cadence while realtime is healthy — realtime is doing the heavy
  /// lifting, so this is just a safety net for missed events.
  final Duration slowInterval;

  /// Heartbeat cadence once realtime looks down — matches the legacy poll so the
  /// screen never updates slower than it did before realtime existed.
  final Duration fastInterval;

  /// If no realtime event arrives within this window, treat realtime as down and
  /// switch the heartbeat to [fastInterval].
  final Duration fallbackAfter;

  StreamSubscription<void>? _sub;
  Timer? _debounceTimer;
  Timer? _heartbeat;
  DateTime? _lastEventAt;
  DateTime? _lastRefreshAt;
  bool _disposed = false;

  /// True once at least one realtime event has been observed — i.e. the channel
  /// is alive. Exposed for the UI to badge a "live" indicator if it wants.
  bool get isRealtimeLive => _lastEventAt != null && !_isStale;

  bool get _isStale {
    final last = _lastEventAt;
    if (last == null) return true;
    return DateTime.now().difference(last) > fallbackAfter;
  }

  /// The cadence the heartbeat should poll at right now: relaxed while realtime
  /// is delivering events, fast once the channel looks dead.
  Duration get _effectiveInterval => _isStale ? fastInterval : slowInterval;

  /// Begin listening + start the heartbeat. Idempotent: calling again replaces
  /// the previous subscription/timer.
  void start() {
    if (_disposed) return;
    _sub?.cancel();
    _debounceTimer?.cancel();
    _heartbeat?.cancel();

    _sub = _eventStream.listen(
      (_) {
        // A malformed payload must never escape the data callback and tear down
        // the stream — swallow defensively, exactly like [onError] below. The
        // heartbeat keeps polling regardless.
        try {
          _onEvent();
        } catch (_) {}
      },
      // A realtime error (socket drop, auth) must not crash the screen — the
      // heartbeat keeps polling, and the next event (if any) re-arms realtime.
      onError: (_) {},
      cancelOnError: false,
    );
    // A single fixed-cadence base ticker decides on each tick whether the
    // effective interval has elapsed — so the slow→fast fallback engages the
    // moment realtime goes stale, without waiting for a slow timer to fire.
    final base = fastInterval < slowInterval ? fastInterval : slowInterval;
    _heartbeat = Timer.periodic(base, (_) => _onHeartbeat());
  }

  void _onEvent() {
    if (_disposed) return;
    _lastEventAt = DateTime.now();
    _debounceTimer?.cancel();
    _debounceTimer = Timer(debounce, _runRefresh);
  }

  void _onHeartbeat() {
    if (_disposed) return;
    final last = _lastRefreshAt;
    // Refresh when at least the current effective interval has passed since the
    // last reload (realtime events count, since they call [_runRefresh] too).
    if (last == null || DateTime.now().difference(last) >= _effectiveInterval) {
      _runRefresh();
    }
  }

  void _runRefresh() {
    if (_disposed) return;
    _lastRefreshAt = DateTime.now();
    _onRefresh();
  }

  /// Tear down the subscription and all timers. Safe to call more than once.
  void dispose() {
    _disposed = true;
    _sub?.cancel();
    _sub = null;
    _debounceTimer?.cancel();
    _debounceTimer = null;
    _heartbeat?.cancel();
    _heartbeat = null;
  }
}
