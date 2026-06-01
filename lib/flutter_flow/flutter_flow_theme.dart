import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

class FlutterFlowTheme {
  static FlutterFlowTheme of(BuildContext context) => _instance;
  static final _instance = FlutterFlowTheme._();
  FlutterFlowTheme._();

  // Brand colors
  Color get primary             => const Color(0xFF15603E);
  Color get secondary           => const Color(0xFFC9EC4B);
  Color get tertiary            => const Color(0xFF1E7A4E);
  Color get background          => const Color(0xFFF4F0E8);
  Color get secondaryBackground => const Color(0xFFFEFCF8);
  Color get primaryText         => const Color(0xFF1A1816);
  Color get secondaryText       => const Color(0xFF6B6760);
  Color get alternate           => const Color(0xFFE5E0D5);
  Color get lineColor           => const Color(0xFFE0DBD0);
  Color get error               => const Color(0xFFC5533B);
  Color get warning             => const Color(0xFFE07034);
  Color get success             => const Color(0xFF15603E);
  Color get info                => const Color(0xFF3B82F6);
  Color get white               => Colors.white;

  // Surface tints
  Color get accent1 => const Color(0xFFE8F5EE);
  Color get accent2 => const Color(0xFFFFF8E7);
  Color get accent3 => const Color(0xFFFFECE6);
  Color get accent4 => const Color(0xFFEEF6FF);

  // Typography
  TextStyle get displayLarge => GoogleFonts.rubik(fontSize: 52, fontWeight: FontWeight.w800, letterSpacing: -0.04, color: primaryText);
  TextStyle get displayMedium => GoogleFonts.rubik(fontSize: 40, fontWeight: FontWeight.w800, letterSpacing: -0.03, color: primaryText);
  TextStyle get displaySmall  => GoogleFonts.rubik(fontSize: 32, fontWeight: FontWeight.w800, letterSpacing: -0.02, color: primaryText);
  TextStyle get headlineLarge  => GoogleFonts.rubik(fontSize: 28, fontWeight: FontWeight.w800, letterSpacing: -0.02, color: primaryText);
  TextStyle get headlineMedium => GoogleFonts.rubik(fontSize: 24, fontWeight: FontWeight.w700, letterSpacing: -0.01, color: primaryText);
  TextStyle get headlineSmall  => GoogleFonts.rubik(fontSize: 20, fontWeight: FontWeight.w700, letterSpacing: -0.01, color: primaryText);
  TextStyle get titleLarge     => GoogleFonts.rubik(fontSize: 18, fontWeight: FontWeight.w700, color: primaryText);
  TextStyle get titleMedium    => GoogleFonts.rubik(fontSize: 16, fontWeight: FontWeight.w600, color: primaryText);
  TextStyle get titleSmall     => GoogleFonts.rubik(fontSize: 14, fontWeight: FontWeight.w600, color: primaryText);
  TextStyle get bodyLarge      => GoogleFonts.assistant(fontSize: 16, fontWeight: FontWeight.w500, color: primaryText);
  TextStyle get bodyMedium     => GoogleFonts.assistant(fontSize: 14, fontWeight: FontWeight.w500, color: primaryText);
  TextStyle get bodySmall      => GoogleFonts.assistant(fontSize: 13, fontWeight: FontWeight.w500, color: secondaryText);
  TextStyle get labelLarge     => GoogleFonts.assistant(fontSize: 14, fontWeight: FontWeight.w600, color: primaryText);
  TextStyle get labelMedium    => GoogleFonts.assistant(fontSize: 12, fontWeight: FontWeight.w600, color: secondaryText);
  TextStyle get labelSmall     => GoogleFonts.assistant(fontSize: 11, fontWeight: FontWeight.w600, color: secondaryText);
}

extension TextStyleOverride on TextStyle {
  TextStyle override({
    String? fontFamily,
    Color? color,
    double? fontSize,
    FontWeight? fontWeight,
    double? letterSpacing,
    double? lineHeight,
    TextDecoration? decoration,
    FontStyle? fontStyle,
  }) =>
      copyWith(
        fontFamily: fontFamily,
        color: color,
        fontSize: fontSize,
        fontWeight: fontWeight,
        letterSpacing: letterSpacing,
        height: lineHeight,
        decoration: decoration,
        fontStyle: fontStyle,
      );
}
