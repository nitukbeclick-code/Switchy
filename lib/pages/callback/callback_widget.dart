import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../flutter_flow/flutter_flow_theme.dart';
import '../../flutter_flow/flutter_flow_util.dart';
import '../../flutter_flow/flutter_flow_widgets.dart';
import '../../app_state.dart';

class CallbackWidget extends StatefulWidget {
  const CallbackWidget({super.key});

  @override
  State<CallbackWidget> createState() => _CallbackWidgetState();
}

class _CallbackWidgetState extends State<CallbackWidget> {
  final _nameCtrl = TextEditingController();
  final _phoneCtrl = TextEditingController();
  String _topic = 'כללי';
  bool _submitted = false;

  static const _topics = ['כללי', 'עזרה בבחירת חבילה', 'סיוע בניוד', 'בעיה טכנית', 'חיוב שגוי'];

  @override
  void initState() {
    super.initState();
    final appState = Provider.of<FFAppState>(context, listen: false);
    if (appState.isLoggedIn) {
      _nameCtrl.text = appState.userName;
      _phoneCtrl.text = appState.userPhone;
    }
  }

  @override
  void dispose() {
    _nameCtrl.dispose();
    _phoneCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final ffTheme = FlutterFlowTheme.of(context);

    return Scaffold(
      backgroundColor: ffTheme.background,
      appBar: AppBar(title: const Text('בקשת שיחה חוזרת')),
      body: _submitted
          ? Center(
              child: Padding(
                padding: const EdgeInsets.all(32),
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Icon(Icons.phone_forwarded_rounded, size: 64, color: ffTheme.success),
                    const SizedBox(height: 20),
                    Text('הבקשה נשלחה!', style: ffTheme.headlineMedium),
                    const SizedBox(height: 8),
                    Text('נציג יחזור אליכם תוך שעה', style: ffTheme.bodyMedium.override(color: ffTheme.secondaryText), textAlign: TextAlign.center),
                    const SizedBox(height: 32),
                    TextButton(onPressed: () => context.safePop(), child: const Text('חזרה')),
                  ],
                ),
              ),
            )
          : SingleChildScrollView(
              padding: const EdgeInsets.all(20),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('שם', style: ffTheme.labelLarge),
                  const SizedBox(height: 8),
                  TextField(controller: _nameCtrl, decoration: const InputDecoration(hintText: 'שמכם')),
                  const SizedBox(height: 16),

                  Text('טלפון', style: ffTheme.labelLarge),
                  const SizedBox(height: 8),
                  TextField(controller: _phoneCtrl, keyboardType: TextInputType.phone, decoration: const InputDecoration(hintText: '050-0000000')),
                  const SizedBox(height: 16),

                  Text('נושא', style: ffTheme.labelLarge),
                  const SizedBox(height: 8),
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: _topics.map((t) => GestureDetector(
                      onTap: () => setState(() => _topic = t),
                      child: AnimatedContainer(
                        duration: const Duration(milliseconds: 200),
                        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                        decoration: BoxDecoration(
                          color: _topic == t ? ffTheme.primary : ffTheme.secondaryBackground,
                          borderRadius: BorderRadius.circular(12),
                          border: Border.all(color: _topic == t ? ffTheme.primary : ffTheme.alternate),
                        ),
                        child: Text(t, style: ffTheme.labelMedium.override(color: _topic == t ? Colors.white : ffTheme.primaryText)),
                      ),
                    )).toList(),
                  ),

                  const SizedBox(height: 32),

                  FFButtonWidget(
                    text: 'שלחו בקשה',
                    onPressed: () async {
                      setState(() => _submitted = true);
                    },
                    options: FFButtonOptions(
                      width: double.infinity,
                      height: 54,
                      color: ffTheme.primary,
                      textStyle: ffTheme.titleSmall.override(color: Colors.white),
                      borderRadius: BorderRadius.circular(16),
                    ),
                  ),
                ],
              ),
            ),
    );
  }
}
