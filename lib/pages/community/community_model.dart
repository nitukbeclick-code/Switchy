import 'package:flutter/material.dart';
import '/flutter_flow/flutter_flow_util.dart';
import '/models.dart';
import '/data.dart';
import 'community_widget.dart';

class CommunityModel extends FlutterFlowModel<CommunityWidget> {
  final TextEditingController composerController = TextEditingController();
  String activeChannel = 'הכל';
  List<CommunityPost> localPosts = [];

  @override
  void initState(BuildContext context) {
    localPosts = communityPosts.toList();
  }

  @override
  void dispose() {
    composerController.dispose();
    super.dispose();
  }
}
