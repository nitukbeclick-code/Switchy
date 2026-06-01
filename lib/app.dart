import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import 'state.dart';
import 'router.dart';
import 'theme.dart';

class ChosechApp extends StatefulWidget {
  const ChosechApp({super.key});

  @override
  State<ChosechApp> createState() => _ChosechAppState();
}

class _ChosechAppState extends State<ChosechApp> {
  late final AppState _appState;
  late final GoRouter _router;

  @override
  void initState() {
    super.initState();
    _appState = AppState();
    _router = createRouter(_appState);
  }

  @override
  Widget build(BuildContext context) {
    return ChangeNotifierProvider.value(
      value: _appState,
      child: MaterialApp.router(
        title: 'חוסך',
        debugShowCheckedModeBanner: false,
        locale: const Locale('he'),
        supportedLocales: const [Locale('he'), Locale('en')],
        theme: AppTheme.theme,
        routerConfig: _router,
        builder: (context, child) {
          return Directionality(
            textDirection: TextDirection.rtl,
            child: child!,
          );
        },
      ),
    );
  }
}
