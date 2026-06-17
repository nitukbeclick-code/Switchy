import 'dart:async';
import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:chosech/services/timeout_http_client.dart';

/// An inner client whose [send] resolves after [delay], so we can drive the
/// timeout deterministically.
class _DelayedClient extends http.BaseClient {
  _DelayedClient(this.delay);
  final Duration delay;
  int sends = 0;
  bool closed = false;

  @override
  Future<http.StreamedResponse> send(http.BaseRequest request) async {
    sends++;
    await Future<void>.delayed(delay);
    return http.StreamedResponse(Stream.value(utf8.encode('ok')), 200);
  }

  @override
  void close() => closed = true;
}

void main() {
  http.Request req() => http.Request('GET', Uri.parse('https://example.test/x'));

  test('passes the response through when the inner client is fast enough', () async {
    final inner = _DelayedClient(const Duration(milliseconds: 5));
    final client = TimeoutHttpClient(inner: inner, timeout: const Duration(seconds: 1));

    final res = await client.send(req());

    expect(res.statusCode, 200);
    expect(inner.sends, 1);
  });

  test('throws TimeoutException when the inner client exceeds the timeout', () {
    final inner = _DelayedClient(const Duration(milliseconds: 300));
    final client = TimeoutHttpClient(inner: inner, timeout: const Duration(milliseconds: 30));

    expect(() => client.send(req()), throwsA(isA<TimeoutException>()));
  });

  test('close() closes the inner client', () {
    final inner = _DelayedClient(Duration.zero);
    TimeoutHttpClient(inner: inner).close();
    expect(inner.closed, isTrue);
  });

  test('defaults to a 15s timeout', () {
    final client = TimeoutHttpClient(inner: _DelayedClient(Duration.zero));
    expect(client.timeout, const Duration(seconds: 15));
  });
}
