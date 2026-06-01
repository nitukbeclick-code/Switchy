import 'package:flutter/material.dart';
import '/flutter_flow/flutter_flow_util.dart';
import 'auth_widget.dart';

class AuthModel extends FlutterFlowModel<AuthWidget> {
  bool isLoginMode = false;
  final TextEditingController nameController = TextEditingController();
  final TextEditingController phoneController = TextEditingController();
  final FocusNode nameFocusNode = FocusNode();
  final FocusNode phoneFocusNode = FocusNode();

  bool get canSubmit => phoneController.text.trim().length >= 9;

  @override
  void initState(BuildContext context) {}

  @override
  void dispose() {
    nameController.dispose();
    phoneController.dispose();
    nameFocusNode.dispose();
    phoneFocusNode.dispose();
    super.dispose();
  }
}
