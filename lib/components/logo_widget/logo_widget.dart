import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import '../../theme/app_theme.dart';

class LogoWidget extends StatelessWidget {
  const LogoWidget({super.key, required this.provider, this.size = 44});
  final String provider;
  final double size;

  // Maps a substring key → brand background color.
  // Keys are checked via provider.contains(key) so minor variants still match.
  static const Map<String, Color> _colors = {
    // Cellular
    'סלקום': Color(0xFF4527A0), // deep indigo/purple
    'פרטנר': Color(0xFF2E7D32), // brand green
    'פלאפון': Color(0xFF1565C0), // brand blue
    'גולן': Color(0xFF00695C), // teal/navy
    'הוט מובייל': Color(0xFFB71C1C), // HOT Mobile red
    'הוט': Color(0xFFB71C1C), // HOT red (catch-all for HOT variants)
    'HOT': Color(0xFFB71C1C), // HOT red (Latin)
    'Xphone': Color(0xFF0277BD), // sky blue
    'רמי לוי': Color(0xFFD32F2F), // rami levy red
    'WeCom': Color(0xFF00838F), // cyan/teal
    '019': Color(0xFF6A1B9A), // purple
    'וואלה': Color(0xFFE64A19), // orange-red
    'בזק': Color(0xFF1565C0), // Bezeq blue
    'גילת': Color(0xFF0277BD), // Gilat blue
    'CCC': Color(0xFF388E3C), // green
    'STING': Color(0xFFAD1457), // magenta/pink
    'yes': Color(0xFF0D2B6E), // dark blue
    'NextTV': Color(0xFFE65100), // orange
    'NEXT TV': Color(0xFFE65100), // orange (space variant)
    'Airalo': Color(0xFFFF6F61), // coral
    // Legacy / fallback entries kept for backward compat
    'ויקום': Color(0xFF6B21A8),
    'FreeTV': Color(0xFF1A7A4E),
  };

  // Override initials for providers where auto-derivation is ambiguous.
  static const Map<String, String> _initials = {
    'סלקום': 'סל',
    'פרטנר': 'פר',
    'פלאפון': 'פל',
    'גולן': 'גל',
    'הוט מובייל': 'HOT',
    'הוט': 'HOT',
    'HOT': 'HOT',
    'Xphone': 'X',
    'רמי לוי': 'רל',
    'WeCom': 'WC',
    '019': '019',
    'וואלה': 'וו',
    'בזק': 'בז',
    'גילת': 'גי',
    'CCC': 'CCC',
    'STING': 'ST',
    'yes': 'yes',
    'NextTV': 'N',
    'NEXT TV': 'N',
    'Airalo': 'Air',
  };

  // Real logo image files (assets/providers/, slug-named). Checked by substring
  // like _colors. Any provider without a file gracefully shows the initials badge.
  static const Map<String, String> _logoAsset = {
    'סלקום': 'cellcom.png', 'פרטנר': 'partner.png', 'פלאפון': 'pelephone.png', 'גולן': 'golan.png',
    'הוט מובייל': 'hot-mobile.png', 'HOT': 'hot.png', 'הוט': 'hot.png', 'Xphone': 'xphone.png',
    'רמי לוי': 'rami-levy.webp', 'WeCom': 'wecom.png', '019': '019mobile.png', 'וואלה': 'walla-mobile.webp',
    'בזק': 'bezeq.png', 'גילת': 'gilat.png', 'CCC': 'ccc.png', 'STING': 'sting-tv.png', 'yes': 'yes.png',
    'NextTV': 'nexttv.png', 'NEXT TV': 'nexttv.png', 'Airalo': 'airalo.png',
  };

  Color _colorFor(AppTheme t) {
    for (final entry in _colors.entries) {
      if (provider.contains(entry.key) || entry.key.contains(provider)) {
        return entry.value;
      }
    }
    return t.primary; // neutral brand fallback
  }

  String? get _logoFile {
    for (final entry in _logoAsset.entries) {
      if (provider.contains(entry.key) || entry.key.contains(provider)) {
        return entry.value;
      }
    }
    return null;
  }

  String get _label {
    for (final entry in _initials.entries) {
      if (provider.contains(entry.key) || entry.key.contains(provider)) {
        return entry.value;
      }
    }
    // Auto-derive from provider string
    final trimmed = provider.trim();
    if (trimmed.isEmpty) return '?';
    if (RegExp(r'^[A-Za-z0-9]').hasMatch(trimmed)) {
      final parts = trimmed.split(' ');
      if (parts.length > 1) {
        return parts[0][0].toUpperCase() + parts[1][0].toUpperCase();
      }
      return trimmed.length >= 2
          ? trimmed.substring(0, 2).toUpperCase()
          : trimmed[0].toUpperCase();
    }
    // Hebrew: use runes to safely get Unicode characters
    final runes = trimmed.runes.toList();
    if (runes.length >= 2) return String.fromCharCodes([runes[0], runes[1]]);
    return String.fromCharCodes([runes[0]]);
  }

  @override
  Widget build(BuildContext context) {
    final t = AppTheme.of(context);
    final color = _colorFor(t);
    final label = _label;
    final file = _logoFile;

    // Real brand logo on a white tile (logo contained, never recoloured). Falls
    // back to the coloured initials badge if the asset is missing.
    if (file != null) {
      return Container(
        width: size,
        height: size,
        padding: EdgeInsets.all(size * 0.13),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(size * 0.24),
          border: Border.all(color: t.lineColor),
          boxShadow: t.shadowSoft,
        ),
        child: ExcludeSemantics(
          child: Image.asset(
            'assets/providers/$file',
            fit: BoxFit.contain,
            filterQuality: FilterQuality.medium,
            errorBuilder: (_, __, ___) => _initialsBadge(color, label),
          ),
        ),
      );
    }
    return _initialsBadge(color, label);
  }

  // The coloured initials mark ("סל", "X"…). The provider's full name is shown
  // as adjacent text everywhere this is used, so the fragment is hidden from
  // screen readers (ExcludeSemantics) to avoid cryptic announcements.
  Widget _initialsBadge(Color color, String label) {
    final fontScale = label.length >= 3 ? 0.28 : 0.36;
    final fontSize = size * fontScale;
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        shape: BoxShape.circle,
        border: Border.all(color: color.withValues(alpha: 0.25), width: 1.5),
        boxShadow: [
          BoxShadow(color: color.withValues(alpha: 0.10), blurRadius: 8, offset: const Offset(0, 2)),
        ],
      ),
      child: Center(
        child: ExcludeSemantics(
          child: Text(
            label,
            style: GoogleFonts.rubik(
              fontSize: fontSize,
              fontWeight: FontWeight.w800,
              color: color,
              letterSpacing: -0.5,
            ),
          ),
        ),
      ),
    );
  }
}
