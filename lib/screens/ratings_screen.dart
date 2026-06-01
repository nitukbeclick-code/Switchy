import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../theme.dart';
import '../widgets/logo_widget.dart';
import '../widgets/stars_widget.dart';

class RatingsScreen extends StatefulWidget {
  const RatingsScreen({super.key});

  @override
  State<RatingsScreen> createState() => _RatingsScreenState();
}

class _RatingsScreenState extends State<RatingsScreen> {
  bool _showForm = false;
  String _selectedProvider = '';
  double _rating = 0;
  final _reviewCtrl = TextEditingController();

  final _providers = [
    ('פלאפון', 4.1, 1203),
    ('סלקום', 4.2, 987),
    ('פרטנר', 4.3, 1543),
    ('הוט', 3.9, 876),
    ('yes', 4.2, 1032),
    ('בזק', 4.0, 654),
    ('גולן טלקום', 4.4, 2103),
    ('019 מובייל', 3.8, 432),
  ];

  @override
  void dispose() {
    _reviewCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final sorted = [..._providers]
      ..sort((a, b) => b.$2.compareTo(a.$2));

    return Scaffold(
      backgroundColor: AppColors.paper,
      body: SafeArea(
        child: Column(
          children: [
            _buildHeader(context),
            Expanded(
              child: SingleChildScrollView(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      'דירוגי ספקים',
                      style: TextStyle(
                        fontFamily: 'Rubik',
                        fontSize: 18,
                        fontWeight: FontWeight.w700,
                        color: AppColors.ink,
                      ),
                    ),
                    const SizedBox(height: 12),
                    ...sorted.asMap().entries.map((entry) {
                      final i = entry.key;
                      final p = entry.value;
                      return _buildProviderRow(i + 1, p.$1, p.$2, p.$3);
                    }),
                    const SizedBox(height: 20),
                    _buildWriteReview(),
                    const SizedBox(height: 80),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildHeader(BuildContext context) {
    return Container(
      color: AppColors.green,
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 16),
      child: Row(
        children: [
          GestureDetector(
            onTap: () => context.pop(),
            child: const Icon(Icons.arrow_back_ios_rounded,
                color: Colors.white, size: 20),
          ),
          const SizedBox(width: 12),
          const Text(
            'דירוגים',
            style: TextStyle(
              fontFamily: 'Rubik',
              fontSize: 20,
              fontWeight: FontWeight.w800,
              color: Colors.white,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildProviderRow(int rank, String name, double rating, int count) {
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: rank == 1
            ? AppColors.lime.withOpacity(0.15)
            : AppColors.card,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(
          color: rank == 1
              ? AppColors.lime.withOpacity(0.5)
              : AppColors.border,
          width: rank == 1 ? 1.5 : 1,
        ),
      ),
      child: Row(
        children: [
          SizedBox(
            width: 24,
            child: Text(
              '#$rank',
              style: TextStyle(
                fontSize: 13,
                fontWeight: FontWeight.w800,
                color:
                    rank == 1 ? AppColors.greenDark : AppColors.inkMuted,
              ),
            ),
          ),
          const SizedBox(width: 10),
          LogoWidget(provider: name, size: 40),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  name,
                  style: const TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.w700,
                    color: AppColors.ink,
                  ),
                ),
                Text(
                  '$count ביקורות',
                  style: const TextStyle(
                    fontSize: 12,
                    color: AppColors.inkMuted,
                  ),
                ),
              ],
            ),
          ),
          StarsWidget(rating: rating, reviews: 0, showCount: false),
          const SizedBox(width: 6),
          Text(
            rating.toStringAsFixed(1),
            style: const TextStyle(
              fontFamily: 'Rubik',
              fontSize: 16,
              fontWeight: FontWeight.w800,
              color: AppColors.ink,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildWriteReview() {
    if (!_showForm) {
      return SizedBox(
        width: double.infinity,
        child: OutlinedButton.icon(
          onPressed: () => setState(() => _showForm = true),
          icon: const Icon(Icons.star_outline_rounded),
          label: const Text('כתבו ביקורת'),
          style: OutlinedButton.styleFrom(
            foregroundColor: AppColors.green,
            side: const BorderSide(color: AppColors.green),
            padding: const EdgeInsets.symmetric(vertical: 14),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(14),
            ),
          ),
        ),
      );
    }

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.card,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'כתבו ביקורת',
            style: TextStyle(
              fontFamily: 'Rubik',
              fontSize: 16,
              fontWeight: FontWeight.w700,
              color: AppColors.ink,
            ),
          ),
          const SizedBox(height: 14),
          // Provider selector
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: _providers.map((p) {
              final sel = _selectedProvider == p.$1;
              return GestureDetector(
                onTap: () => setState(() => _selectedProvider = p.$1),
                child: Container(
                  padding: const EdgeInsets.symmetric(
                      horizontal: 12, vertical: 7),
                  decoration: BoxDecoration(
                    color: sel ? AppColors.green : AppColors.paper,
                    borderRadius: BorderRadius.circular(10),
                    border: Border.all(
                      color: sel ? AppColors.green : AppColors.border,
                    ),
                  ),
                  child: Text(
                    p.$1,
                    style: TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                      color: sel ? Colors.white : AppColors.ink,
                    ),
                  ),
                ),
              );
            }).toList(),
          ),
          const SizedBox(height: 14),
          // Star rating
          Row(
            children: List.generate(5, (i) {
              return GestureDetector(
                onTap: () => setState(() => _rating = i + 1.0),
                child: Icon(
                  i < _rating ? Icons.star_rounded : Icons.star_outline_rounded,
                  color: const Color(0xFFD99A2B),
                  size: 32,
                ),
              );
            }),
          ),
          const SizedBox(height: 14),
          TextField(
            controller: _reviewCtrl,
            textDirection: TextDirection.rtl,
            maxLines: 3,
            decoration: const InputDecoration(
              hintText: 'שתפו את הניסיון שלכם...',
              hintTextDirection: TextDirection.rtl,
            ),
          ),
          const SizedBox(height: 14),
          Row(
            children: [
              Expanded(
                child: FilledButton(
                  onPressed: () {
                    setState(() {
                      _showForm = false;
                      _selectedProvider = '';
                      _rating = 0;
                      _reviewCtrl.clear();
                    });
                  },
                  style: FilledButton.styleFrom(
                    backgroundColor: AppColors.green,
                    padding: const EdgeInsets.symmetric(vertical: 12),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12),
                    ),
                  ),
                  child: const Text('שלח ביקורת'),
                ),
              ),
              const SizedBox(width: 10),
              OutlinedButton(
                onPressed: () => setState(() => _showForm = false),
                style: OutlinedButton.styleFrom(
                  side: const BorderSide(color: AppColors.border),
                  padding: const EdgeInsets.symmetric(
                      vertical: 12, horizontal: 16),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12),
                  ),
                ),
                child: const Text('ביטול',
                    style: TextStyle(color: AppColors.inkMuted)),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
