import 'package:flutter/material.dart';
import '../theme.dart';

// This is a standalone bottom nav widget (the router uses ScaffoldWithNav)
class BottomNavBar extends StatelessWidget {
  final int currentIndex;
  final ValueChanged<int> onTap;

  const BottomNavBar({
    super.key,
    required this.currentIndex,
    required this.onTap,
  });

  static const _items = [
    BottomNavigationBarItem(icon: Icon(Icons.home_rounded), label: 'בית'),
    BottomNavigationBarItem(
        icon: Icon(Icons.compare_arrows_rounded), label: 'השוואה'),
    BottomNavigationBarItem(
        icon: Icon(Icons.people_rounded), label: 'קהילה'),
    BottomNavigationBarItem(
        icon: Icon(Icons.swap_horiz_rounded), label: 'המעבר'),
    BottomNavigationBarItem(
        icon: Icon(Icons.person_rounded), label: 'אישי'),
  ];

  @override
  Widget build(BuildContext context) {
    return BottomNavigationBar(
      currentIndex: currentIndex,
      onTap: onTap,
      type: BottomNavigationBarType.fixed,
      backgroundColor: Colors.white,
      selectedItemColor: AppColors.green,
      unselectedItemColor: AppColors.inkMuted,
      selectedLabelStyle: const TextStyle(
        fontSize: 11,
        fontWeight: FontWeight.w700,
      ),
      unselectedLabelStyle: const TextStyle(
        fontSize: 11,
        fontWeight: FontWeight.w500,
      ),
      items: _items,
    );
  }
}
