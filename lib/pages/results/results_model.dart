import 'package:flutter/material.dart';
import '/flutter_flow/flutter_flow_util.dart';
import 'results_widget.dart';

class ResultsModel extends FlutterFlowModel<ResultsWidget> {
  final TextEditingController searchController = TextEditingController();
  final FocusNode searchFocusNode = FocusNode();

  @override
  void initState(BuildContext context) {}

  @override
  void dispose() {
    searchController.dispose();
    searchFocusNode.dispose();
    super.dispose();
  }
}
