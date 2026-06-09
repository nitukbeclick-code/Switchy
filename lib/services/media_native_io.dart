import 'dart:io';
import 'dart:typed_data';
import 'package:video_player/video_player.dart';

/// Read a local file's bytes (mobile/desktop), or null on failure.
Future<Uint8List?> readFileBytes(String path) async {
  try {
    return await File(path).readAsBytes();
  } catch (_) {
    return null;
  }
}

/// Build a video controller for a network/blob URL or a local file path.
VideoPlayerController makeVideoController(String source) {
  if (source.startsWith('http') || source.startsWith('blob')) {
    return VideoPlayerController.networkUrl(Uri.parse(source));
  }
  return VideoPlayerController.file(File(source));
}
