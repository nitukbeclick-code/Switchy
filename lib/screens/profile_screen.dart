import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import '../theme.dart';
import '../state.dart';

class ProfileScreen extends StatefulWidget {
  const ProfileScreen({super.key});

  @override
  State<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends State<ProfileScreen> {
  bool _notifyDeals = true;
  bool _notifyPriceChange = true;
  bool _notifyCommunity = false;
  bool _darkMode = false;
  String _language = 'he';

  @override
  Widget build(BuildContext context) {
    final appState = context.watch<AppState>();

    return Scaffold(
      backgroundColor: AppColors.paper,
      body: SafeArea(
        child: SingleChildScrollView(
          child: Column(
            children: [
              _buildHeader(context, appState),
              Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  children: [
                    _buildStats(),
                    const SizedBox(height: 20),
                    _buildNotifications(),
                    const SizedBox(height: 16),
                    _buildLanguage(),
                    const SizedBox(height: 16),
                    _buildPreferences(),
                    const SizedBox(height: 16),
                    _buildLogout(appState),
                    const SizedBox(height: 32),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildHeader(BuildContext context, AppState appState) {
    return Container(
      color: AppColors.green,
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 24),
      child: Column(
        children: [
          Row(
            children: [
              GestureDetector(
                onTap: () => context.pop(),
                child: const Icon(Icons.arrow_back_ios_rounded,
                    color: Colors.white, size: 20),
              ),
              const Expanded(
                child: Text(
                  'פרופיל',
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    fontFamily: 'Rubik',
                    fontSize: 18,
                    fontWeight: FontWeight.w700,
                    color: Colors.white,
                  ),
                ),
              ),
              const SizedBox(width: 36),
            ],
          ),
          const SizedBox(height: 20),
          Container(
            width: 80,
            height: 80,
            decoration: BoxDecoration(
              color: AppColors.lime,
              shape: BoxShape.circle,
              border: Border.all(color: Colors.white, width: 3),
            ),
            child: Center(
              child: Text(
                appState.isLoggedIn && appState.userName.isNotEmpty
                    ? appState.userName[0]
                    : 'א',
                style: const TextStyle(
                  fontSize: 36,
                  fontWeight: FontWeight.w800,
                  color: AppColors.greenDark,
                ),
              ),
            ),
          ),
          const SizedBox(height: 12),
          Text(
            appState.isLoggedIn ? appState.userName : 'אורח',
            style: const TextStyle(
              fontFamily: 'Rubik',
              fontSize: 20,
              fontWeight: FontWeight.w800,
              color: Colors.white,
            ),
          ),
          if (appState.userPhone.isNotEmpty) ...[
            const SizedBox(height: 4),
            Text(
              appState.userPhone,
              style: TextStyle(
                fontSize: 14,
                color: Colors.white.withOpacity(0.7),
              ),
            ),
          ],
        ],
      ),
    );
  }

  Widget _buildStats() {
    final stats = [
      ('₪1,080', 'נחסך'),
      ('2', 'מעברים'),
      ('14', 'פוסטים'),
    ];

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.card,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.border),
      ),
      child: Row(
        children: stats.map((s) {
          return Expanded(
            child: Column(
              children: [
                Text(
                  s.$1,
                  style: const TextStyle(
                    fontFamily: 'Rubik',
                    fontSize: 22,
                    fontWeight: FontWeight.w800,
                    color: AppColors.green,
                  ),
                ),
                Text(
                  s.$2,
                  style: const TextStyle(
                    fontSize: 12,
                    color: AppColors.inkMuted,
                  ),
                ),
              ],
            ),
          );
        }).toList(),
      ),
    );
  }

  Widget _buildNotifications() {
    return _buildCard(
      title: 'התראות',
      children: [
        _buildToggle('עסקאות מיוחדות', _notifyDeals,
            (v) => setState(() => _notifyDeals = v)),
        _buildToggle('שינויי מחיר', _notifyPriceChange,
            (v) => setState(() => _notifyPriceChange = v)),
        _buildToggle('קהילה', _notifyCommunity,
            (v) => setState(() => _notifyCommunity = v)),
      ],
    );
  }

  Widget _buildLanguage() {
    return _buildCard(
      title: 'שפה',
      children: [
        Padding(
          padding: const EdgeInsets.symmetric(vertical: 8),
          child: Row(
            children: [
              ('he', 'עברית'),
              ('en', 'English'),
              ('ar', 'العربية'),
            ].map((lang) {
              final sel = _language == lang.$1;
              return Expanded(
                child: GestureDetector(
                  onTap: () => setState(() => _language = lang.$1),
                  child: Container(
                    margin: const EdgeInsets.symmetric(horizontal: 3),
                    padding: const EdgeInsets.symmetric(vertical: 10),
                    decoration: BoxDecoration(
                      color: sel ? AppColors.green : AppColors.paper,
                      borderRadius: BorderRadius.circular(10),
                      border: Border.all(
                        color: sel ? AppColors.green : AppColors.border,
                      ),
                    ),
                    child: Text(
                      lang.$2,
                      textAlign: TextAlign.center,
                      style: TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w700,
                        color: sel ? Colors.white : AppColors.ink,
                      ),
                    ),
                  ),
                ),
              );
            }).toList(),
          ),
        ),
      ],
    );
  }

  Widget _buildPreferences() {
    return _buildCard(
      title: 'העדפות',
      children: [
        _buildToggle('מצב כהה', _darkMode,
            (v) => setState(() => _darkMode = v)),
      ],
    );
  }

  Widget _buildCard(
      {required String title, required List<Widget> children}) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.card,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            title,
            style: const TextStyle(
              fontFamily: 'Rubik',
              fontSize: 15,
              fontWeight: FontWeight.w700,
              color: AppColors.ink,
            ),
          ),
          const SizedBox(height: 8),
          ...children,
        ],
      ),
    );
  }

  Widget _buildToggle(
      String label, bool value, ValueChanged<bool> onChanged) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        children: [
          Text(
            label,
            style: const TextStyle(fontSize: 14, color: AppColors.ink),
          ),
          const Spacer(),
          Switch(
            value: value,
            onChanged: onChanged,
            activeColor: AppColors.green,
          ),
        ],
      ),
    );
  }

  Widget _buildLogout(AppState appState) {
    return SizedBox(
      width: double.infinity,
      child: OutlinedButton(
        onPressed: () {
          appState.logout();
          context.go('/auth');
        },
        style: OutlinedButton.styleFrom(
          foregroundColor: AppColors.danger,
          side: BorderSide(color: AppColors.danger.withOpacity(0.4)),
          padding: const EdgeInsets.symmetric(vertical: 14),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(14),
          ),
        ),
        child: const Text(
          'התנתקות',
          style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700),
        ),
      ),
    );
  }
}
