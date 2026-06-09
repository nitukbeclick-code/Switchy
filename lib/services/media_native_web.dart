import 'dart:typed_data';
import 'package:video_player/video_player.dart';

/// On web we don't read raw bytes from blob URLs here; callers fall back to the
/// original (session-scoped) source.
Future<Uint8List?> readFileBytes(String path) async => null;

/// On web every picked media is a network/blob URL.
VideoPlayerController makeVideoController(String source) =>
    VideoPlayerController.networkUrl(Uri.parse(source));
