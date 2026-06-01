import 'dart:async';
import 'package:flutter/material.dart';
import '../../flutter_flow/flutter_flow_util.dart';
import 'home_widget.dart';

class HomeModel extends FlutterFlowModel<HomeWidget> {
  int tickerIndex = 0;
  Timer? _tickerTimer;

  @override
  void initState(BuildContext context) {
    startTicker();
  }

  void startTicker() {
    _tickerTimer = Timer.periodic(const Duration(seconds: 4), (_) {
      tickerIndex = (tickerIndex + 1) % 3;
    });
  }

  @override
  void dispose() {
    _tickerTimer?.cancel();
    super.dispose();
  }
}
