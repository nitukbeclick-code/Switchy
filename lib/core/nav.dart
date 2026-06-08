import 'package:flutter/widgets.dart';
import 'package:go_router/go_router.dart';

// Re-export go_router so screens get `context.goNamed`, `context.pushNamed`,
// `context.pop`, `context.canPop`, etc. from a single import.
export 'package:go_router/go_router.dart';

extension NavX on BuildContext {
  /// Pops the current route only when there is something to pop, so calling it
  /// on a root/tab destination is a safe no-op instead of a crash.
  void safePop<T extends Object?>([T? result]) {
    if (canPop()) pop(result);
  }
}
