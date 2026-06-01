import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

class AppColors {
  static const Color paper = Color(0xFFF4F0E8);
  static const Color paperDark = Color(0xFFE9E3D5);
  static const Color green = Color(0xFF15603E);
  static const Color greenDark = Color(0xFF0E3A26);
  static const Color greenLight = Color(0xFF1E7A4E);
  static const Color lime = Color(0xFFC9EC4B);
  static const Color limeDark = Color(0xFFA9CE32);
  static const Color ink = Color(0xFF1A1816);
  static const Color inkMuted = Color(0xFF6B6760);
  static const Color inkSubtle = Color(0xFF7C8A81);
  static const Color card = Color(0xFFFEFCF8);
  static const Color border = Color(0xFFE5E0D5);
  static const Color borderDark = Color(0xFFD6CDBB);
  static const Color danger = Color(0xFFC5533B);
  static const Color orange = Color(0xFFE07034);
  static const Color warn = Color(0xFFD99A2B);
  static const Color blueLight = Color(0xFFEFF6FF);
  static const Color white = Color(0xFFFFFFFF);

  // Provider colors
  static const Map<String, Color> providerColors = {
    'פלאפון': Color(0xFFE07034),
    'סלקום': Color(0xFFCC2244),
    'פרטנר': Color(0xFF2255CC),
    'הוט': Color(0xFF8B1A1A),
    'HOT': Color(0xFF8B1A1A),
    'yes': Color(0xFF1A3A7A),
    'בזק': Color(0xFF007B8A),
    'גולן טלקום': Color(0xFF15603E),
    '019 מובייל': Color(0xFF6B35C8),
    'הוט מובייל': Color(0xFF8B1A1A),
    'ריאלי': Color(0xFF2255CC),
    'FreeTV': Color(0xFF1A7A4E),
    'NEXT TV': Color(0xFF334466),
    'גילת': Color(0xFF007B8A),
    'Triple C': Color(0xFF5544AA),
    'רמי לוי': Color(0xFFCC2244),
    'אקספון 018': Color(0xFF224488),
    'Airalo': Color(0xFF1E90CC),
  };

  static Color providerColor(String provider) {
    for (final entry in providerColors.entries) {
      if (provider.contains(entry.key) || entry.key.contains(provider)) {
        return entry.value;
      }
    }
    return green;
  }
}

class AppTextStyles {
  static TextStyle display(BuildContext context) => GoogleFonts.rubik(
        fontSize: 46,
        fontWeight: FontWeight.w800,
        letterSpacing: -0.02,
        color: AppColors.ink,
      );

  static TextStyle heading1(BuildContext context) => GoogleFonts.rubik(
        fontSize: 28,
        fontWeight: FontWeight.w800,
        letterSpacing: -0.02,
        color: AppColors.ink,
      );

  static TextStyle heading2(BuildContext context) => GoogleFonts.rubik(
        fontSize: 22,
        fontWeight: FontWeight.w700,
        letterSpacing: -0.01,
        color: AppColors.ink,
      );

  static TextStyle heading3(BuildContext context) => GoogleFonts.rubik(
        fontSize: 18,
        fontWeight: FontWeight.w700,
        letterSpacing: -0.01,
        color: AppColors.ink,
      );

  static TextStyle price(BuildContext context) => GoogleFonts.rubik(
        fontSize: 28,
        fontWeight: FontWeight.w800,
        letterSpacing: -0.02,
        color: AppColors.ink,
      );

  static TextStyle label(BuildContext context) => GoogleFonts.rubik(
        fontSize: 15,
        fontWeight: FontWeight.w600,
        color: AppColors.ink,
      );

  static TextStyle body(BuildContext context) => GoogleFonts.assistant(
        fontSize: 15,
        fontWeight: FontWeight.w500,
        color: AppColors.ink,
      );

  static TextStyle bodySmall(BuildContext context) => GoogleFonts.assistant(
        fontSize: 13,
        fontWeight: FontWeight.w500,
        color: AppColors.inkMuted,
      );

  static TextStyle caption(BuildContext context) => GoogleFonts.assistant(
        fontSize: 12,
        fontWeight: FontWeight.w600,
        color: AppColors.inkMuted,
      );
}

class AppTheme {
  static ThemeData get theme {
    final base = ThemeData(useMaterial3: true);
    return base.copyWith(
      colorScheme: ColorScheme.fromSeed(
        seedColor: AppColors.green,
        brightness: Brightness.light,
        surface: AppColors.card,
      ),
      scaffoldBackgroundColor: AppColors.paper,
      fontFamily: GoogleFonts.assistant().fontFamily,
      textTheme: GoogleFonts.assistantTextTheme(base.textTheme),
      appBarTheme: AppBarTheme(
        backgroundColor: AppColors.green,
        foregroundColor: Colors.white,
        elevation: 0,
        titleTextStyle: GoogleFonts.rubik(
          fontSize: 18,
          fontWeight: FontWeight.w700,
          color: Colors.white,
        ),
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: AppColors.green,
          foregroundColor: Colors.white,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(16),
          ),
          padding: const EdgeInsets.symmetric(vertical: 15, horizontal: 20),
          textStyle: GoogleFonts.rubik(
            fontSize: 16,
            fontWeight: FontWeight.w600,
          ),
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: AppColors.card,
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: const BorderSide(color: AppColors.border),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: const BorderSide(color: AppColors.border),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: const BorderSide(color: AppColors.green, width: 1.5),
        ),
      ),
    );
  }
}
