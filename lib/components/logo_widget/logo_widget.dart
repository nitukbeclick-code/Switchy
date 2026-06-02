import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

class LogoWidget extends StatelessWidget {
  const LogoWidget({super.key, required this.provider, this.size = 44});
  final String provider;
  final double size;

  static const Map<String, Color> _colors = {
    'פלאפון': Color(0xFFE07034),
    'סלקום': Color(0xFFCC2244),
    'פרטנר': Color(0xFF2255CC),
    'הוט': Color(0xFF8B1A1A),
    'HOT': Color(0xFF8B1A1A),
    'yes': Color(0xFF1A3A7A),
    'בזק': Color(0xFF007B8A),
    'גולן': Color(0xFF15603E),
    '019': Color(0xFF6B35C8),
    'רמי לוי': Color(0xFFD4232A),
    'Xphone': Color(0xFF0066CC),
    'ויקום': Color(0xFF6B21A8),
    'וואלה': Color(0xFF0077B6),
    'Airalo': Color(0xFF1E90CC),
    'FreeTV': Color(0xFF1A7A4E),
    'NextTV': Color(0xFFE07034),
    'NEXT TV': Color(0xFF334466),
    'גילת': Color(0xFF007B8A),
    'CCC': Color(0xFF2E7D32),
  };

  Color get _color {
    for (final entry in _colors.entries) {
      if (provider.contains(entry.key) || entry.key.contains(provider)) {
        return entry.value;
      }
    }
    return const Color(0xFF15603E);
  }

  String get _initials {
    final trimmed = provider.trim();
    if (trimmed.isEmpty) return '?';
    // Special handling for english names
    if (RegExp(r'^[A-Za-z]').hasMatch(trimmed)) {
      final parts = trimmed.split(' ');
      if (parts.length > 1) return parts[0][0].toUpperCase() + parts[1][0].toUpperCase();
      return trimmed[0].toUpperCase();
    }
    // Hebrew: use runes to safely get Unicode characters
    final runes = trimmed.runes.toList();
    if (runes.length >= 2) return String.fromCharCodes([runes[0], runes[1]]);
    return String.fromCharCodes([runes[0]]);
  }

  @override
  Widget build(BuildContext context) {
    final color = _color;
    final fontSize = size * 0.36;
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        color: color.withOpacity(0.12),
        shape: BoxShape.circle,
        border: Border.all(color: color.withOpacity(0.25), width: 1.5),
      ),
      child: Center(
        child: Text(
          _initials,
          style: GoogleFonts.rubik(
            fontSize: fontSize,
            fontWeight: FontWeight.w800,
            color: color,
            letterSpacing: -0.5,
          ),
        ),
      ),
    );
  }
}
