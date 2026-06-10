import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:google_fonts/google_fonts.dart';
import 'theme/app_theme.dart';
import 'router.dart';

class ChosechApp extends StatefulWidget {
  const ChosechApp({super.key});

  @override
  State<ChosechApp> createState() => _ChosechAppState();
}

class _ChosechAppState extends State<ChosechApp> {
  // One router per app instance, created once. Exposed via [appRouterInstance]
  // so the auth-state listener in main.dart can navigate after an OAuth
  // redirect. A fresh app (each test's pumpWidget) gets its own router, keeping
  // tests isolated — a shared global router leaked navigation state between them.
  late final _router = createRouter();

  @override
  void initState() {
    super.initState();
    appRouterInstance = _router;
  }

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
      routerConfig: _router,
      builder: (ctx, child) => Directionality(
        textDirection: TextDirection.rtl,
        // Clamp accessibility text scaling to a sane ceiling so very large
        // system text can't overflow our fixed-height chips, badges and rows.
        child: MediaQuery(
          data: MediaQuery.of(ctx).copyWith(
            textScaler: MediaQuery.textScalerOf(ctx).clamp(maxScaleFactor: 1.3),
          ),
          child: child!,
        ),
      ),
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
