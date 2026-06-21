import 'package:flutter/material.dart';
import 'package:flutter/scheduler.dart' show timeDilation;
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:provider/provider.dart';
import 'app_state.dart';
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
    // Follow the persisted theme mode (system/light/dark). Watching AppState
    // here rebuilds MaterialApp the moment the Settings toggle flips it.
    final themeMode = context.watch<AppState>().themeMode;
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
      theme: AppTheme.lightTheme(),
      darkTheme: AppTheme.darkTheme(),
      themeMode: themeMode,
      routerConfig: _router,
      builder: (ctx, child) {
        // Honour the OS "reduce motion" setting globally: flutter_animate has
        // no built-in switch, so collapse EVERY animation (entrances, page
        // transitions, ripples) to near-instant via the scheduler's clock.
        // 1.0 restores normal speed the moment the setting is turned off.
        timeDilation = MediaQuery.of(ctx).disableAnimations ? 0.05 : 1.0;
        return Directionality(
          textDirection: TextDirection.rtl,
          // Clamp accessibility text scaling to a sane ceiling so very large
          // system text can't overflow our fixed-height chips, badges and rows.
          child: MediaQuery(
            data: MediaQuery.of(ctx).copyWith(
              textScaler: MediaQuery.textScalerOf(ctx).clamp(maxScaleFactor: 1.3),
            ),
            child: child!,
          ),
        );
      },
    );
  }
}
