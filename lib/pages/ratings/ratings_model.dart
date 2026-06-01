import 'package:flutter/material.dart';
import '/flutter_flow/flutter_flow_util.dart';
import 'ratings_widget.dart';

class RatingsModel extends FlutterFlowModel<RatingsWidget> {
  String? selectedProvider;
  int selectedRating = 0;
  final TextEditingController reviewController = TextEditingController();
  bool submitted = false;

  @override
  void initState(BuildContext context) {}

  @override
  void dispose() {
    reviewController.dispose();
    super.dispose();
  }
}
