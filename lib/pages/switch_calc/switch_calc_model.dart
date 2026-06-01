import 'package:flutter/material.dart';
import '/flutter_flow/flutter_flow_util.dart';
import 'switch_calc_widget.dart';

class SwitchCalcModel extends FlutterFlowModel<SwitchCalcWidget> {
  double currentBill = 119;
  double newPlan = 39;
  double exitFee = 0;

  int get annualSavings => ((currentBill - newPlan) * 12 - exitFee).round();
  double get monthsToBreakeven =>
      exitFee > 0 ? exitFee / (currentBill - newPlan) : 0;

  @override
  void initState(BuildContext context) {}

  @override
  void dispose() => super.dispose();
}
