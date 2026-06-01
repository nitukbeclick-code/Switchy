import 'package:flutter/material.dart';
import '/flutter_flow/flutter_flow_util.dart';
import 'callback_widget.dart';

class CallbackModel extends FlutterFlowModel<CallbackWidget> {
  final TextEditingController nameController = TextEditingController();
  final TextEditingController phoneController = TextEditingController();
  String selectedTiming = 'בהקדם';
  bool submitted = false;

  @override
  void initState(BuildContext context) {}

  @override
  void dispose() {
    nameController.dispose();
    phoneController.dispose();
    super.dispose();
  }
}
