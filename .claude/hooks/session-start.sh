#!/bin/bash
# SessionStart hook for Claude Code on the web.
# Installs a pinned Flutter SDK (cached across sessions) and fetches project
# dependencies so `flutter analyze` and `flutter test` work in remote sessions.
set -euo pipefail

# Only run inside the remote (web) environment; local machines manage their own SDK.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

FLUTTER_DIR="$HOME/.flutter-sdk"
FLUTTER_VERSION="3.24.5"   # Dart 3.5.x — satisfies pubspec sdk '>=3.0.0 <4.0.0'

# 1. Install the SDK once. The container is cached after the hook completes, so
#    subsequent sessions skip the clone.
if [ ! -x "$FLUTTER_DIR/bin/flutter" ]; then
  git clone --depth 1 --branch "$FLUTTER_VERSION" \
    https://github.com/flutter/flutter.git "$FLUTTER_DIR"
fi

export PATH="$FLUTTER_DIR/bin:$PATH"

# 2. Persist the SDK on PATH for the rest of the session.
if [ -n "${CLAUDE_ENV_FILE:-}" ]; then
  echo "export PATH=\"$FLUTTER_DIR/bin:\$PATH\"" >> "$CLAUDE_ENV_FILE"
fi

# 3. Warm the toolchain and fetch dependencies (idempotent).
flutter config --no-analytics >/dev/null 2>&1 || true
flutter precache --universal >/dev/null 2>&1 || true
cd "${CLAUDE_PROJECT_DIR:-$(pwd)}"
flutter pub get
