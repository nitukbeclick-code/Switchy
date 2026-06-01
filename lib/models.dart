import 'package:flutter/material.dart';
import 'theme.dart';

class Category {
  final String id;
  final String name;
  final String sub;
  final String icon;
  final int currentBill;
  final Color color;

  const Category({
    required this.id,
    required this.name,
    required this.sub,
    required this.icon,
    required this.currentBill,
    required this.color,
  });
}

class PlanFeat {
  final String icon;
  final String label;
  const PlanFeat(this.icon, this.label);
}

class Plan {
  final String id;
  final String cat;
  final String provider;
  final String net;
  final String plan;
  final double? price;
  final String? priceText;
  final double? after;
  final String? term;
  final String? intro;
  final bool est;
  final double rating;
  final int reviews;
  final List<String> flags;
  final List<PlanFeat> feats;
  final String? fine;
  final bool best;

  const Plan({
    required this.id,
    required this.cat,
    required this.provider,
    required this.net,
    required this.plan,
    this.price,
    this.priceText,
    this.after,
    this.term,
    this.intro,
    this.est = false,
    required this.rating,
    required this.reviews,
    this.flags = const [],
    this.feats = const [],
    this.fine,
    this.best = false,
  });

  String get displayPrice {
    if (price == null) return priceText ?? '';
    final prefix = est ? '~₪' : '₪';
    final n = price!;
    if (n == n.truncateToDouble()) return '$prefix${n.toInt()}';
    return '$prefix$n';
  }

  String? get displayAfter {
    if (price == null || after == null) return null;
    final prefix = est ? '~₪' : '₪';
    final n = after!;
    if (n == n.truncateToDouble()) return '$prefix${n.toInt()}';
    return '$prefix$n';
  }

  int savingsPerYear(int currentBill) {
    if (price == null) return 0;
    final diff = currentBill - price!;
    if (diff <= 0) return 0;
    return ((diff * 12) / 10).round() * 10;
  }

  String? get priceWarn {
    if (price == null || after == null) return null;
    final inc = ((after! - price!) / price! * 100).round();
    if (inc >= 50) return 'המחיר עולה ב-$inc% בתום ההיכרות';
    return null;
  }

  Color get providerColor => AppColors.providerColor(provider);

  String get providerInitial {
    if (provider.isEmpty) return '?';
    return provider[0];
  }
}
