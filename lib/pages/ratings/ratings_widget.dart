import 'package:flutter/material.dart';
import '../../flutter_flow/flutter_flow_theme.dart';
import '../../flutter_flow/flutter_flow_util.dart';
import '../../data.dart';
import '../../models.dart';
import '../../components/logo_widget/logo_widget.dart';

class RatingsWidget extends StatefulWidget {
  const RatingsWidget({super.key});

  @override
  State<RatingsWidget> createState() => _RatingsWidgetState();
}

class _RatingsWidgetState extends State<RatingsWidget> {
  final Map<String, int> _myRatings = {};
  final Map<String, TextEditingController> _reviewCtrl = {};

  @override
  void dispose() {
    for (final c in _reviewCtrl.values) c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final ffTheme = FlutterFlowTheme.of(context);
    final plans = allPlans.take(6).toList();

    return Scaffold(
      backgroundColor: ffTheme.background,
      appBar: AppBar(title: const Text('הדירוגים שלי')),
      body: ListView.separated(
        padding: const EdgeInsets.all(16),
        itemCount: plans.length,
        separatorBuilder: (_, __) => const SizedBox(height: 12),
        itemBuilder: (_, i) {
          final plan = plans[i];
          final rating = _myRatings[plan.id] ?? 0;
          _reviewCtrl.putIfAbsent(plan.id, () => TextEditingController());

          return Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: ffTheme.secondaryBackground,
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: ffTheme.alternate),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    LogoWidget(provider: plan.provider, size: 40),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(plan.provider, style: ffTheme.titleSmall),
                          Text(plan.plan, style: ffTheme.bodySmall),
                        ],
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                Row(
                  children: List.generate(5, (star) => GestureDetector(
                    onTap: () => setState(() => _myRatings[plan.id] = star + 1),
                    child: Icon(
                      star < rating ? Icons.star_rounded : Icons.star_border_rounded,
                      color: star < rating ? Colors.amber : ffTheme.alternate,
                      size: 28,
                    ),
                  )),
                ),
                if (rating > 0) ...[
                  const SizedBox(height: 8),
                  TextField(
                    controller: _reviewCtrl[plan.id],
                    maxLines: 2,
                    decoration: InputDecoration(hintText: 'הוסיפו ביקורת (אופציונלי)...'),
                  ),
                ],
              ],
            ),
          );
        },
      ),
    );
  }
}
