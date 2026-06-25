import 'dart:convert';
import 'dart:typed_data';
import 'package:flutter_test/flutter_test.dart';
import 'package:chosech/services/media_service.dart';

/// Focused unit coverage for [MediaService]'s pure, web-safe surface — the
/// base64 data-URI codec and the size-cap contract of [persistableAudio].
/// Plugin-backed entry points (pickImage/pickVideo) and native file reads are
/// deliberately untested here: they need an ImagePicker/platform channel, which
/// has no value in a unit test (and would not be web-safe). The sibling
/// `media_test.dart` covers the happy-path round-trip; this file pins the edge
/// behaviours around the format and the `_maxMediaBytes` guard.
void main() {
  group('MediaService.bytesToDataUri format', () {
    test('embeds the given mime and is parseable by Uri.parse', () {
      final bytes = Uint8List.fromList([0, 1, 2, 3, 200, 255]);
      final uri = MediaService.bytesToDataUri(bytes, mime: 'audio/mp4');
      expect(uri, startsWith('data:audio/mp4;base64,'));
      // The payload after the comma must be exactly the base64 of the bytes.
      final payload = uri.substring(uri.indexOf(',') + 1);
      expect(payload, equals(base64Encode(bytes)));
      // And the whole thing must be a well-formed data URI.
      final parsed = Uri.parse(uri);
      expect(parsed.scheme, equals('data'));
      expect(parsed.data, isNotNull);
      expect(parsed.data!.contentAsBytes(), orderedEquals(bytes));
    });

    test('handles empty bytes without throwing', () {
      final uri = MediaService.bytesToDataUri(Uint8List(0), mime: 'image/jpeg');
      expect(uri, equals('data:image/jpeg;base64,'));
      expect(MediaService.dataUriToBytes(uri), orderedEquals(<int>[]));
    });
  });

  group('MediaService.persistableAudio size-cap contract', () {
    test('an already-encoded data-URI is returned unchanged even when large', () async {
      // A data: source short-circuits *before* the byte-size guard, so it is
      // returned verbatim regardless of its (encoded) length.
      final big = 'data:audio/mp4;base64,${'A' * (2 * 1024 * 1024)}';
      final out = await MediaService.persistableAudio(big);
      expect(identical(out, big) || out == big, isTrue);
      expect(out, startsWith('data:audio/mp4;base64,'));
    });

    test('an unreadable file path falls back to the source path verbatim', () async {
      const path = '/definitely/not/a/real/recording.m4a';
      expect(await MediaService.persistableAudio(path), equals(path));
    });
  });
}
