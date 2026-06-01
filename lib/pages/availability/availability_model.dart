import 'package:flutter/material.dart';
import '/flutter_flow/flutter_flow_util.dart';
import 'availability_widget.dart';

class AvailabilityModel extends FlutterFlowModel<AvailabilityWidget> {
  final TextEditingController cityController = TextEditingController();
  final TextEditingController streetController = TextEditingController();
  bool showResults = false;
  String address = '';

  @override
  void initState(BuildContext context) {}

  @override
  void dispose() {
    cityController.dispose();
    streetController.dispose();
    super.dispose();
  }
}
