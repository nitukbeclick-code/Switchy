import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:google_fonts/google_fonts.dart';
import 'theme/app_theme.dart';
import 'router.dart';

class ChosechApp extends StatelessWidget {
  const ChosechApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp.router(
      title: 'חוסך',
      debugShowCheckedModeBanner: false,
      locale: const Locale('he'),
      localizationsDelegates: const [
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      supportedLocales: const [Locale('he'), Locale('en')],
      theme: _theme(context),
      routerConfig: createRouter(),
      builder: (ctx, child) => Directionality(textDirection: TextDirection.rtl, child: child!),
    );
  }

  ThemeData _theme(BuildContext context) {
    final base = ThemeData(useMaterial3: true, fontFamily: GoogleFonts.assistant().fontFamily);
    // Friendly rounding scale, read from the shared design tokens.
    final t = AppTheme.of(context);
    return base.copyWith(
      colorScheme: ColorScheme.fromSeed(seedColor: AppColors.primary, surface: AppColors.secondaryBackground),
      scaffoldBackgroundColor: AppColors.background,
      canvasColor: AppColors.background,
      textTheme: GoogleFonts.assistantTextTheme(base.textTheme),
      appBarTheme: AppBarTheme(
        backgroundColor: AppColors.primary,
        foregroundColor: Colors.white,
        elevation: 0,
        centerTitle: false,
        titleTextStyle: GoogleFonts.rubik(fontSize: 18, fontWeight: FontWeight.w700, color: Colors.white),
      ),
      cardTheme: CardThemeData(
        color: AppColors.secondaryBackground,
        elevation: 0,
        margin: EdgeInsets.zero,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(t.radiusLg)),
      ),
      dialogTheme: DialogThemeData(
        backgroundColor: AppColors.secondaryBackground,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(t.radiusXl)),
      ),
      bottomSheetTheme: BottomSheetThemeData(
        backgroundColor: AppColors.secondaryBackground,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(t.radiusXl)),
        ),
      ),
      snackBarTheme: SnackBarThemeData(
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(t.radiusMd)),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true, fillColor: AppColors.secondaryBackground,
        border: OutlineInputBorder(borderRadius: BorderRadius.circular(t.radiusMd), borderSide: const BorderSide(color: AppColors.alternate)),
        enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(t.radiusMd), borderSide: const BorderSide(color: AppColors.alternate)),
        focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(t.radiusMd), borderSide: const BorderSide(color: AppColors.primary, width: 1.5)),
      ),
    );
  }
}
