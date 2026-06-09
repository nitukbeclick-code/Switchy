import 'dart:convert';
import 'dart:typed_data';
import 'package:image_picker/image_picker.dart';
import 'media_native.dart';

/// Thin wrapper around media capture/selection so the UI doesn't depend on the
/// plugin directly. Images and short audio are encoded as base64 data-URIs so
/// they persist (SharedPreferences) across all platforms with no file plumbing;
/// videos return a file path/URI (played from disk for the session).
class MediaService {
  MediaService._();
  static final ImagePicker _picker = ImagePicker();

  /// Pick (or capture) an image and return it as a downscaled JPEG data-URI,
  /// or null if the user cancelled.
  static Future<String?> pickImageDataUri({
    bool fromCamera = false,
    double maxSide = 1280,
    int quality = 70,
  }) async {
    final x = await _picker.pickImage(
      source: fromCamera ? ImageSource.camera : ImageSource.gallery,
      maxWidth: maxSide,
      maxHeight: maxSide,
      imageQuality: quality,
    );
    if (x == null) return null;
    final bytes = await x.readAsBytes();
    return bytesToDataUri(bytes, mime: 'image/jpeg');
  }

  /// Pick a video from the gallery and return its path/URI, or null.
  static Future<String?> pickVideoPath() async {
    final x = await _picker.pickVideo(source: ImageSource.gallery);
    return x?.path;
  }

  /// Turn a recorded-audio source into a durable value: on mobile we read the
  /// file's bytes and return a base64 data-URI (survives restart); on web (or
  /// if the bytes can't be read) we return the original source for the session.
  static Future<String> persistableAudio(String source) async {
    if (source.startsWith('data:')) return source;
    final bytes = await readFileBytes(source);
    if (bytes == null) return source;
    return bytesToDataUri(bytes, mime: 'audio/mp4');
  }

  /// Encode raw bytes as a base64 data-URI (e.g. for a recorded voice note).
  static String bytesToDataUri(Uint8List bytes, {required String mime}) =>
      'data:$mime;base64,${base64Encode(bytes)}';

  /// Decode a base64 data-URI (or bare base64) back into bytes, or null on error.
  static Uint8List? dataUriToBytes(String dataUri) {
    try {
      final comma = dataUri.indexOf(',');
      final b64 = comma >= 0 ? dataUri.substring(comma + 1) : dataUri;
      return base64Decode(b64);
    } catch (_) {
      return null;
    }
  }
}
