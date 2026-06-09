import 'dart:async';
import 'dart:typed_data';

import 'package:audioplayers/audioplayers.dart';
import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/material.dart';
import 'package:path_provider/path_provider.dart';
import 'package:record/record.dart';

import '../../services/media_service.dart';
import '../../theme/app_theme.dart';

// ─── helpers ────────────────────────────────────────────────────────────────

String _mmss(int ms) {
  final s = (ms ~/ 1000).clamp(0, 5999);
  final m = s ~/ 60;
  final sec = s % 60;
  return '${m.toString().padLeft(2, '0')}:${sec.toString().padLeft(2, '0')}';
}

// ─── 1. MediaImageBubble ─────────────────────────────────────────────────────

class MediaImageBubble extends StatelessWidget {
  const MediaImageBubble({
    super.key,
    required this.dataUri,
    this.maxHeight = 240,
  });

  final String dataUri;
  final double maxHeight;

  void _openFullscreen(BuildContext context, Uint8List bytes) {
    showDialog<void>(
      context: context,
      builder: (_) => Dialog(
        backgroundColor: Colors.black,
        insetPadding: EdgeInsets.zero,
        child: Stack(
          children: [
            Center(
              child: InteractiveViewer(
                child: Image.memory(bytes),
              ),
            ),
            Positioned(
              top: 12,
              right: 12,
              child: SafeArea(
                child: IconButton(
                  icon: const Icon(Icons.close, color: Colors.white, size: 28),
                  onPressed: () => Navigator.of(context).pop(),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final theme = AppTheme.of(context);
    final bytes = MediaService.dataUriToBytes(dataUri);

    if (bytes == null) {
      return Container(
        height: maxHeight,
        width: double.infinity,
        decoration: BoxDecoration(
          color: theme.alternate,
          borderRadius: BorderRadius.circular(14),
        ),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.broken_image_outlined,
                color: theme.secondaryText, size: 40),
            const SizedBox(height: 8),
            Text('תמונה לא זמינה',
                style: theme.bodySmall.copyWith(color: theme.secondaryText)),
          ],
        ),
      );
    }

    return GestureDetector(
      onTap: () => _openFullscreen(context, bytes),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(14),
        child: ConstrainedBox(
          constraints: BoxConstraints(maxHeight: maxHeight),
          child: SizedBox(
            width: double.infinity,
            child: Image.memory(bytes, fit: BoxFit.cover),
          ),
        ),
      ),
    );
  }
}

// ─── 2. VoiceMessageBubble ───────────────────────────────────────────────────

class VoiceMessageBubble extends StatefulWidget {
  const VoiceMessageBubble({
    super.key,
    required this.source,
    this.durationMs,
  });

  final String source;
  final int? durationMs;

  @override
  State<VoiceMessageBubble> createState() => _VoiceMessageBubbleState();
}

class _VoiceMessageBubbleState extends State<VoiceMessageBubble> {
  final AudioPlayer _player = AudioPlayer();
  Duration _position = Duration.zero;
  Duration _duration = Duration.zero;
  bool _playing = false;
  bool _error = false;

  final List<StreamSubscription<dynamic>> _subs = [];

  @override
  void initState() {
    super.initState();
    if (widget.durationMs != null) {
      _duration = Duration(milliseconds: widget.durationMs!);
    }
    _subs.add(_player.onPositionChanged.listen((p) {
      if (!mounted) return;
      setState(() => _position = p);
    }));
    _subs.add(_player.onDurationChanged.listen((d) {
      if (!mounted) return;
      setState(() => _duration = d);
    }));
    _subs.add(_player.onPlayerComplete.listen((_) {
      if (!mounted) return;
      setState(() {
        _playing = false;
        _position = Duration.zero;
      });
    }));
  }

  @override
  void dispose() {
    for (final s in _subs) {
      s.cancel();
    }
    _player.dispose();
    super.dispose();
  }

  Future<void> _toggle() async {
    if (_error) return;
    try {
      if (_playing) {
        await _player.pause();
        if (!mounted) return;
        setState(() => _playing = false);
      } else {
        Source src;
        if (widget.source.startsWith('data:')) {
          final bytes = MediaService.dataUriToBytes(widget.source);
          if (bytes == null) throw Exception('bad data uri');
          src = BytesSource(bytes);
        } else {
          src = kIsWeb
              ? UrlSource(widget.source)
              : DeviceFileSource(widget.source);
        }
        await _player.play(src);
        if (!mounted) return;
        setState(() => _playing = true);
      }
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _error = true;
        _playing = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = AppTheme.of(context);

    if (_error) {
      return Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
        decoration: BoxDecoration(
          color: theme.alternate,
          borderRadius: BorderRadius.circular(14),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.mic, color: theme.secondaryText, size: 18),
            const SizedBox(width: 8),
            Text('הודעה קולית',
                style: theme.bodyMedium.copyWith(color: theme.secondaryText)),
          ],
        ),
      );
    }

    final totalMs = _duration.inMilliseconds > 0
        ? _duration.inMilliseconds
        : (widget.durationMs ?? 0);
    final posMs = _position.inMilliseconds;
    final progress =
        totalMs > 0 ? (posMs / totalMs).clamp(0.0, 1.0) : 0.0;

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: theme.accent1,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: theme.lineColor),
      ),
      child: Row(
        children: [
          // Play/pause button
          GestureDetector(
            onTap: _toggle,
            child: Container(
              width: 40,
              height: 40,
              decoration: BoxDecoration(
                color: theme.primary,
                shape: BoxShape.circle,
              ),
              child: Icon(
                _playing ? Icons.pause : Icons.play_arrow,
                color: Colors.white,
                size: 22,
              ),
            ),
          ),
          const SizedBox(width: 10),
          // Progress + timestamps
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                LinearProgressIndicator(
                  value: progress,
                  backgroundColor: theme.alternate,
                  valueColor: AlwaysStoppedAnimation<Color>(theme.primary),
                  minHeight: 3,
                  borderRadius: BorderRadius.circular(2),
                ),
                const SizedBox(height: 4),
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text(_mmss(posMs),
                        style: theme.labelSmall
                            .copyWith(color: theme.secondaryText)),
                    Text(_mmss(totalMs),
                        style: theme.labelSmall
                            .copyWith(color: theme.secondaryText)),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

// ─── 3. VoiceRecorderButton ──────────────────────────────────────────────────

class VoiceRecorderButton extends StatefulWidget {
  const VoiceRecorderButton({
    super.key,
    required this.onRecorded,
    this.onDenied,
  });

  final Future<void> Function(String source, int durationMs) onRecorded;
  final VoidCallback? onDenied;

  @override
  State<VoiceRecorderButton> createState() => _VoiceRecorderButtonState();
}

class _VoiceRecorderButtonState extends State<VoiceRecorderButton> {
  AudioRecorder? _rec;
  bool _recording = false;
  int _elapsedMs = 0;
  Timer? _timer;

  @override
  void dispose() {
    _timer?.cancel();
    final rec = _rec;
    if (rec != null) {
      rec.dispose();
    }
    super.dispose();
  }

  Future<void> _start() async {
    try {
      final rec = AudioRecorder();
      _rec = rec;

      if (!await rec.hasPermission()) {
        widget.onDenied?.call();
        await rec.dispose();
        _rec = null;
        return;
      }

      String path = '';
      if (!kIsWeb) {
        final dir = await getTemporaryDirectory();
        path = '${dir.path}/voice_${DateTime.now().millisecondsSinceEpoch}.m4a';
      }

      await rec.start(const RecordConfig(), path: path);

      if (!mounted) return;
      setState(() {
        _recording = true;
        _elapsedMs = 0;
      });

      _timer = Timer.periodic(const Duration(milliseconds: 100), (_) {
        if (!mounted) return;
        setState(() => _elapsedMs += 100);
      });
    } catch (_) {
      // silently ignore start errors
    }
  }

  Future<void> _stop() async {
    _timer?.cancel();
    _timer = null;

    try {
      final rec = _rec;
      if (rec == null) return;

      final out = await rec.stop();
      await rec.dispose();
      _rec = null;

      if (!mounted) return;
      setState(() => _recording = false);

      if (out != null && out.isNotEmpty) {
        await widget.onRecorded(out, _elapsedMs);
      }
    } catch (_) {
      if (!mounted) return;
      setState(() => _recording = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = AppTheme.of(context);

    if (_recording) {
      return GestureDetector(
        onTap: _stop,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
          decoration: BoxDecoration(
            color: theme.error.withOpacity(0.12),
            borderRadius: BorderRadius.circular(24),
            border: Border.all(color: theme.error.withOpacity(0.4)),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 10,
                height: 10,
                decoration: BoxDecoration(
                  color: theme.error,
                  shape: BoxShape.circle,
                ),
              ),
              const SizedBox(width: 8),
              Text(
                _mmss(_elapsedMs),
                style: theme.labelMedium
                    .copyWith(color: theme.error, fontWeight: FontWeight.w700),
              ),
              const SizedBox(width: 8),
              Icon(Icons.stop_circle_outlined, color: theme.error, size: 20),
            ],
          ),
        ),
      );
    }

    return IconButton(
      onPressed: _start,
      icon: const Icon(Icons.mic),
      color: theme.primary,
      tooltip: 'הקלט הודעה קולית',
      style: IconButton.styleFrom(
        backgroundColor: theme.accent1,
        shape: const CircleBorder(),
      ),
    );
  }
}
