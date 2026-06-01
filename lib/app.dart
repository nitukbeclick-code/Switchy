import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'router.dart';

class ChosechApp extends StatelessWidget {
  const ChosechApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp.router(
      title: 'חוסך',
      debugShowCheckedModeBanner: false,
      locale: const Locale('he'),
      supportedLocales: const [Locale('he'), Locale('en')],
      theme: _theme(),
      routerConfig: createRouter(),
      builder: (ctx, child) => Directionality(textDirection: TextDirection.rtl, child: child!),
    );
  }

  ThemeData _theme() {
    final base = ThemeData(useMaterial3: true);
    return base.copyWith(
      colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xFF15603E), surface: const Color(0xFFFEFCF8)),
      scaffoldBackgroundColor: const Color(0xFFF4F0E8),
      fontFamily: GoogleFonts.assistant().fontFamily,
      textTheme: GoogleFonts.assistantTextTheme(base.textTheme),
      appBarTheme: AppBarTheme(
        backgroundColor: const Color(0xFF15603E),
        foregroundColor: Colors.white,
        elevation: 0,
        centerTitle: false,
        titleTextStyle: GoogleFonts.rubik(fontSize: 18, fontWeight: FontWeight.w700, color: Colors.white),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true, fillColor: const Color(0xFFFEFCF8),
        border: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: const BorderSide(color: Color(0xFFE5E0D5))),
        enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: const BorderSide(color: Color(0xFFE5E0D5))),
        focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: const BorderSide(color: Color(0xFF15603E), width: 1.5)),
      ),
    );
  }
}
