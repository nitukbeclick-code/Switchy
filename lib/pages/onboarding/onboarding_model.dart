import 'package:flutter/material.dart';

class OnboardingModel {
  late PageController pageController;
  int currentPage = 0;

  void initState(BuildContext context) {
    pageController = PageController();
  }

  void dispose() {
    pageController.dispose();
  }
}
