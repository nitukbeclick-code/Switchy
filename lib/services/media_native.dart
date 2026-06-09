// Platform-conditional media helpers: the IO version (mobile/desktop) reads
// files and plays local video files; the web version degrades to network/blob
// URLs. This keeps the rest of the app `dart:io`-free and web-safe.
export 'media_native_io.dart' if (dart.library.html) 'media_native_web.dart';
