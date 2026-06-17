import 'dart:async';
import 'package:http/http.dart' as http;

/// An [http.Client] that aborts any request exceeding [timeout].
///
/// Passed once to `Supabase.initialize(httpClient: …)` so EVERY Supabase request
/// — postgrest queries, storage, auth, realtime handshakes — fails fast with a
/// [TimeoutException] instead of hanging the UI forever on a flaky network. This
/// is the single chokepoint that protects all ~30 backend query sites without
/// touching each one; callers already treat a thrown error as "fall back to the
/// on-device data / show a retry" (see SupabaseBackend's try/catch + the seed
/// fallback in data.dart).
class TimeoutHttpClient extends http.BaseClient {
  TimeoutHttpClient({http.Client? inner, this.timeout = const Duration(seconds: 15)})
      : _inner = inner ?? http.Client();

  final http.Client _inner;
  final Duration timeout;

  @override
  Future<http.StreamedResponse> send(http.BaseRequest request) =>
      _inner.send(request).timeout(timeout);

  @override
  void close() => _inner.close();
}
