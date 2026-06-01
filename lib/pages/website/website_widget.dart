import 'package:flutter/material.dart';
import '../../flutter_flow/flutter_flow_theme.dart';
import '../../flutter_flow/flutter_flow_util.dart';
import '../../flutter_flow/flutter_flow_widgets.dart';

class WebsiteWidget extends StatelessWidget {
  const WebsiteWidget({super.key});

  @override
  Widget build(BuildContext context) {
    final ffTheme = FlutterFlowTheme.of(context);

    return Scaffold(
      backgroundColor: ffTheme.background,
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Container(
                padding: const EdgeInsets.all(20),
                decoration: BoxDecoration(
                  color: ffTheme.accent1,
                  shape: BoxShape.circle,
                ),
                child: Icon(Icons.language_rounded, size: 48, color: ffTheme.primary),
              ),
              const SizedBox(height: 24),
              Text('אתר חוסך', style: ffTheme.headlineLarge, textAlign: TextAlign.center),
              const SizedBox(height: 12),
              Text(
                'אפליקציית האינטרנט המלאה שלנו',
                style: ffTheme.bodyLarge.override(color: ffTheme.secondaryText),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 8),
              Text(
                'www.chosech.co.il',
                style: ffTheme.titleMedium.override(color: ffTheme.primary),
              ),
              const SizedBox(height: 40),
              FFButtonWidget(
                text: 'פתח אתר',
                onPressed: () async { /* url_launcher */ },
                options: FFButtonOptions(
                  width: double.infinity,
                  height: 52,
                  color: ffTheme.primary,
                  textStyle: ffTheme.titleSmall.override(color: Colors.white),
                  borderRadius: BorderRadius.circular(16),
                ),
              ),
              const SizedBox(height: 12),
              OutlinedButton(
                onPressed: () => context.goNamed('Home'),
                style: OutlinedButton.styleFrom(
                  foregroundColor: ffTheme.primary,
                  side: BorderSide(color: ffTheme.primary),
                  minimumSize: const Size(double.infinity, 48),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                ),
                child: const Text('חזרה לאפליקציה'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
