import 'dart:convert';
import 'dart:typed_data';
import 'package:image_picker/image_picker.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'media_native.dart';

/// Thin wrapper around media capture/selection so the UI doesn't depend on the
/// plugin directly. Images and short audio are encoded as base64 data-URIs so
/// they persist (SharedPreferences) across all platforms with no file plumbing;
/// videos return a file path/URI (played from disk for the session).
class MediaService {
  MediaService._();
  static final ImagePicker _picker = ImagePicker();

  /// Hard cap on a single captured media blob (~1.5 MB of raw bytes). Anything
  /// larger is rejected rather than persisted: a base64 data-URI is ~33% bigger
  /// than its bytes, and on web these blobs go straight into localStorage, whose
  /// ~5 MB quota a couple of oversized photos/recordings would blow.
  static const int _maxMediaBytes = 1572864; // 1.5 * 1024 * 1024

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
    if (bytes.lengthInBytes > _maxMediaBytes) return null; // reject oversized
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
    // Refuse to persist an oversized recording as a base64 blob — fall back to
    // the session-only source path (same contract as unreadable bytes above).
    if (bytes.lengthInBytes > _maxMediaBytes) return source;
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

  /// Upload an image to Supabase Storage (user-reviews bucket) and return the public URL.
  /// Returns null if upload fails or user cancelled.
  static Future<String?> uploadReviewImage({
    bool fromCamera = false,
    double maxSide = 1280,
    int quality = 70,
  }) async {
    try {
      final x = await _picker.pickImage(
        source: fromCamera ? ImageSource.camera : ImageSource.gallery,
        maxWidth: maxSide,
        maxHeight: maxSide,
        imageQuality: quality,
      );
      if (x == null) return null;

      final bytes = await x.readAsBytes();
      final fileName = '${DateTime.now().millisecondsSinceEpoch}_${x.name}';

      final response = await Supabase.instance.client.storage
          .from('user-reviews')
          .uploadBinary(fileName, bytes, fileOptions: const FileOptions(
            contentType: 'image/jpeg',
          ));

      return Supabase.instance.client.storage
          .from('user-reviews')
          .getPublicUrl(fileName);
    } catch (e) {
      print('Error uploading review image: $e');
      return null;
    }
  }

  /// Upload a receipt/bill scan to Supabase Storage (receipts bucket) and return the URL.
  /// Supports PDF and image formats. Requires authentication.
  /// Returns null if upload fails or user cancelled.
  static Future<String?> uploadReceipt() async {
    try {
      final x = await _picker.pickImage(
        source: ImageSource.gallery,
        maxWidth: 2560,
        maxHeight: 2560,
        imageQuality: 85,
      );
      if (x == null) return null;

      final bytes = await x.readAsBytes();
      final fileName =
          'receipts/${Supabase.instance.client.auth.currentUser?.id ?? 'anon'}/${DateTime.now().millisecondsSinceEpoch}_${x.name}';

      await Supabase.instance.client.storage
          .from('receipts')
          .uploadBinary(fileName, bytes, fileOptions: const FileOptions(
            contentType: 'image/jpeg',
          ));

      return Supabase.instance.client.storage
          .from('receipts')
          .createSignedUrl(fileName, 3600 * 24 * 7); // 7-day signed URL
    } catch (e) {
      print('Error uploading receipt: $e');
      return null;
    }
  }

  /// Upload a profile picture to Supabase Storage (profiles bucket) and return the public URL.
  /// Returns null if upload fails or user cancelled.
  static Future<String?> uploadProfilePicture({
    double maxSide = 512,
    int quality = 85,
  }) async {
    try {
      final x = await _picker.pickImage(
        source: ImageSource.gallery,
        maxWidth: maxSide,
        maxHeight: maxSide,
        imageQuality: quality,
      );
      if (x == null) return null;

      final bytes = await x.readAsBytes();
      final userId = Supabase.instance.client.auth.currentUser?.id ?? 'anon';
      final fileName = 'profile_$userId.jpg';

      // Upsert (replace existing profile picture)
      await Supabase.instance.client.storage
          .from('profiles')
          .uploadBinary(fileName, bytes,
              fileOptions: const FileOptions(
                contentType: 'image/jpeg',
                upsert: true,
              ));

      return Supabase.instance.client.storage
          .from('profiles')
          .getPublicUrl(fileName);
    } catch (e) {
      print('Error uploading profile picture: $e');
      return null;
    }
  }

  /// Delete a file from Supabase Storage by URL.
  /// Returns true if successful, false otherwise.
  static Future<bool> deleteFile(String fileUrl, {required String bucket}) async {
    try {
      final uri = Uri.parse(fileUrl);
      final filePath = uri.pathSegments.skip(3).join('/');

      await Supabase.instance.client.storage.from(bucket).remove([filePath]);
      return true;
    } catch (e) {
      print('Error deleting file: $e');
      return false;
    }
  }
}
