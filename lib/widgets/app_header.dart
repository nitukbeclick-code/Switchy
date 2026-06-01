import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../theme.dart';

class AppHeader extends StatelessWidget implements PreferredSizeWidget {
  final String title;
  final List<Widget>? actions;
  final bool showBack;
  final Color? backgroundColor;
  final Color? foregroundColor;

  const AppHeader({
    super.key,
    required this.title,
    this.actions,
    this.showBack = true,
    this.backgroundColor,
    this.foregroundColor,
  });

  @override
  Size get preferredSize => const Size.fromHeight(56);

  @override
  Widget build(BuildContext context) {
    final bg = backgroundColor ?? AppColors.green;
    final fg = foregroundColor ?? Colors.white;

    return AppBar(
      backgroundColor: bg,
      foregroundColor: fg,
      elevation: 0,
      centerTitle: true,
      automaticallyImplyLeading: showBack,
      leading: showBack
          ? IconButton(
              icon: Icon(Icons.arrow_back_ios_rounded, color: fg, size: 20),
              onPressed: () => context.pop(),
            )
          : null,
      title: Text(
        title,
        style: TextStyle(
          fontFamily: 'Rubik',
          fontSize: 18,
          fontWeight: FontWeight.w700,
          color: fg,
        ),
      ),
      actions: actions,
    );
  }
}

class GreenHeader extends StatelessWidget {
  final String title;
  final String? subtitle;
  final Widget? trailing;
  final bool showBack;
  final List<Widget>? actions;

  const GreenHeader({
    super.key,
    required this.title,
    this.subtitle,
    this.trailing,
    this.showBack = false,
    this.actions,
  });

  @override
  Widget build(BuildContext context) {
    final statusBarHeight = MediaQuery.of(context).padding.top;

    return Container(
      color: AppColors.green,
      padding: EdgeInsets.fromLTRB(20, statusBarHeight + 12, 20, 20),
      child: Row(
        children: [
          if (showBack)
            GestureDetector(
              onTap: () => context.pop(),
              child: const Padding(
                padding: EdgeInsets.only(left: 12),
                child: Icon(Icons.arrow_back_ios_rounded,
                    color: Colors.white, size: 20),
              ),
            ),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: const TextStyle(
                    fontFamily: 'Rubik',
                    fontSize: 22,
                    fontWeight: FontWeight.w800,
                    color: Colors.white,
                    letterSpacing: -0.3,
                  ),
                ),
                if (subtitle != null) ...[
                  const SizedBox(height: 3),
                  Text(
                    subtitle!,
                    style: TextStyle(
                      fontSize: 14,
                      color: Colors.white.withOpacity(0.8),
                    ),
                  ),
                ],
              ],
            ),
          ),
          if (trailing != null) trailing!,
          if (actions != null) ...actions!,
        ],
      ),
    );
  }
}
