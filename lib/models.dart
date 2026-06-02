import 'package:flutter/material.dart';

class Category {
  const Category({required this.id, required this.name, required this.icon, required this.currentBill, required this.color, required this.planCount, required this.description});
  final String id;
  final String name;
  final String icon;
  final int currentBill;
  final Color color;
  final int planCount;
  final String description;
}

class Plan {
  const Plan({required this.id, required this.cat, required this.provider, required this.net, required this.plan, required this.price, this.after, this.term, this.intro, this.rating = 4.0, this.reviews = 0, this.flags = const [], this.feats = const [], this.fine, this.highlight = false});
  final String id;
  final String cat;
  final String provider;
  final String net;
  final String plan;
  final int price;
  final int? after;
  final int? term;
  final String? intro;
  final double rating;
  final int reviews;
  final List<String> flags;
  final List<String> feats;
  final String? fine;
  final bool highlight;

  bool get hasPromo => after != null && after! > price;
  bool get noCommit => term == null || term == 0;
  bool get is5G => flags.contains('5g');
  bool get hasAbroad => flags.contains('abroad');
  bool get isFixed => flags.contains('fixed');

  String get commitmentLabel => noCommit ? 'ללא התחייבות' : 'התחייבות $term חודשים';
  String get netLabel {
    switch (net) {
      case 'fiber': return 'סיב אופטי';
      case 'cable': return 'כבלים';
      case 'adsl': return 'ADSL';
      case 'satellite': return 'לוויין';
      case '4G': return '4G';
      case '5g': case '5G': return '5G';
      case 'lte': case 'LTE': return 'LTE';
      case 'esim': case 'eSIM': return 'eSIM';
      case 'streaming': return 'סטרימינג';
      case 'international': return 'בינלאומי';
      default: return net.toUpperCase();
    }
  }
}

class ChatMessage {
  const ChatMessage({required this.text, required this.isUser, this.planId, required this.timestamp});
  final String text;
  final bool isUser;
  final String? planId;
  final DateTime timestamp;
}

class CommunityPost {
  const CommunityPost({required this.id, required this.author, required this.avatar, required this.channel, required this.text, required this.likes, required this.replies, required this.timestamp, this.planId, this.isVerified = false, this.isTeam = false});
  final String id;
  final String author;
  final String avatar;
  final String channel;
  final String text;
  final int likes;
  final int replies;
  final DateTime timestamp;
  final String? planId;
  final bool isVerified;
  final bool isTeam;
}
