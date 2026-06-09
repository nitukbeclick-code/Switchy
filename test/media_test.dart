import 'dart:typed_data';
import 'package:flutter_test/flutter_test.dart';
import 'package:chosech/models.dart';
import 'package:chosech/services/media_service.dart';

void main() {
  group('MediaService encoding', () {
    test('bytesToDataUri / dataUriToBytes round-trip', () {
      final bytes = Uint8List.fromList([0, 1, 2, 3, 250, 128, 99]);
      final uri = MediaService.bytesToDataUri(bytes, mime: 'image/png');
      expect(uri.startsWith('data:image/png;base64,'), isTrue);
      expect(MediaService.dataUriToBytes(uri), orderedEquals(bytes));
    });

    test('dataUriToBytes decodes bare base64 too', () {
      final bytes = Uint8List.fromList([10, 20, 30]);
      final bare = MediaService.bytesToDataUri(bytes, mime: 'x').split(',').last;
      expect(MediaService.dataUriToBytes(bare), orderedEquals(bytes));
    });

    test('dataUriToBytes returns null on garbage', () {
      expect(MediaService.dataUriToBytes('@@@ not base64 @@@'), isNull);
    });

    test('persistableAudio passes through a data-URI', () async {
      const uri = 'data:audio/mp4;base64,AAAA';
      expect(await MediaService.persistableAudio(uri), equals(uri));
    });

    test('persistableAudio falls back to the source when bytes are unreadable', () async {
      const path = '/no/such/file/voice.m4a';
      expect(await MediaService.persistableAudio(path), equals(path));
    });
  });

  group('CommunityPost media', () {
    CommunityPost post({String? type, String? data}) => CommunityPost(
          id: '1', author: 'a', avatar: 'a', channel: 'c', text: '',
          likes: 0, replies: 0, timestamp: DateTime(2026),
          mediaType: type, mediaData: data,
        );

    test('hasMedia is false without an attachment', () {
      expect(post().hasMedia, isFalse);
      expect(post(type: 'image').hasMedia, isFalse); // data missing
    });

    test('hasMedia and media kind reflect a valid attachment', () {
      final p = post(type: 'audio', data: 'data:audio/m4a;base64,AAAA');
      expect(p.hasMedia, isTrue);
      expect(p.media, equals(MediaKind.audio));
    });

    test('mediaKindFromString maps known kinds', () {
      expect(mediaKindFromString('image'), MediaKind.image);
      expect(mediaKindFromString('video'), MediaKind.video);
      expect(mediaKindFromString('audio'), MediaKind.audio);
      expect(mediaKindFromString('nope'), isNull);
    });
  });
}
