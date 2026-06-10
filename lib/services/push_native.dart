// Platform-conditional push delivery: the IO version (mobile/desktop) drives
// `flutter_local_notifications`; the web version is a no-op stub (the plugin has
// no web implementation). This keeps the rest of the app — and the
// `flutter build web` gate — free of any direct plugin import on web.
export 'push_native_io.dart' if (dart.library.html) 'push_native_web.dart';
