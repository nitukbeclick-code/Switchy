import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:intl/intl.dart';
import '../../theme/app_theme.dart';
import '../../core/nav.dart';
import '../../app_state.dart';
import '../../data.dart';
import '../../models.dart';
import '../../components/logo_widget/logo_widget.dart';
import '../../widgets/app_button.dart';
import '../../services/recommendation_engine.dart';
import '../../services/reminder_schedule.dart';
import '../../services/push_notification_service.dart';
import '../../services/backend/local_backend.dart';

class RenewalWidget extends StatefulWidget {
  const RenewalWidget({super.key});

  @override
  State<RenewalWidget> createState() => _RenewalWidgetState();
}

class _RenewalWidgetState extends State<RenewalWidget> {
  List<TrackedPlan> _remoteOnly = [];

  @override
  void initState() {
    super.initState();
    _loadRemote().catchError((_) {});
  }

  Future<void> _loadRemote() async {
    final remote = await appBackend.fetchTrackedPlans();
    if (!mounted || remote.isEmpty) return;
    // Dedup by content rather than ID — local plans use a timestamp ID while
    // Supabase generates UUIDs, so they would never match by ID alone.
    final localKeys = AppState()
        .myPlans
        .map((p) => '${p.provider}|${p.planName}|${p.category}')
        .toSet();
    final newOnes = remote
        .where((p) => !localKeys.contains('${p.provider}|${p.planName}|${p.category}'))
        .toList();
    if (newOnes.isEmpty) return;
    setState(() => _remoteOnly = newOnes);
  }

  @override
  Widget build(BuildContext context) {
    final ffTheme = AppTheme.of(context);
    final appState = Provider.of<AppState>(context);
    final plans = [...appState.myPlans, ..._remoteOnly];

    return Scaffold(
      backgroundColor: ffTheme.background,
      appBar: AppBar(
        backgroundColor: ffTheme.primary,
        elevation: 0,
        title: Text(
          'מעקב חידושים',
          style: GoogleFonts.rubik(
            fontSize: 18,
            fontWeight: FontWeight.w700,
            color: Colors.white,
          ),
        ),
        leading: IconButton(
          icon: const Icon(Icons.arrow_forward_ios_rounded, color: Colors.white),
          tooltip: 'חזרה',
          onPressed: () => context.safePop(),
        ),
      ),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          // Intro card
          _IntroCard(ffTheme: ffTheme)
              .animate()
              .fadeIn(duration: 350.ms),

          const SizedBox(height: 20),

          if (plans.isEmpty) ...[
            _EmptyState(ffTheme: ffTheme, onAdd: () => _showAddSheet(context))
                .animate()
                .fadeIn(delay: 150.ms),
          ] else ...[
            Text('המסלולים שלי', style: ffTheme.titleLarge)
                .animate()
                .fadeIn(delay: 100.ms),
            const SizedBox(height: 12),
            ...plans.asMap().entries.map((e) => _PlanCard(
                  plan: e.value,
                  ffTheme: ffTheme,
                  onDelete: () => _confirmDelete(context, appState, e.value),
                  onCompare: () => context.pushNamed('RenewalReport',
                      pathParameters: {'trackedId': e.value.id}),
                  onBestMatch: (planId) => context.pushNamed('PlanDetail',
                      pathParameters: {'planId': planId}),
                ).animate().fadeIn(delay: (100 + e.key * 80).ms)),

            const SizedBox(height: 16),
            AppButton(
              text: 'הוסף מסלול',
              icon: const Icon(Icons.add_rounded, color: Colors.white, size: 20),
              color: ffTheme.primary,
              textStyle: GoogleFonts.rubik(
                  fontSize: 15, fontWeight: FontWeight.w700, color: Colors.white),
              onPressed: () async => _showAddSheet(context),
            ).animate().fadeIn(delay: 200.ms),
          ],

          const SizedBox(height: 20),

          // Reminder switch
          _ReminderTile(ffTheme: ffTheme, appState: appState)
              .animate()
              .fadeIn(delay: 300.ms),

          const SizedBox(height: 32),
        ],
      ),
    );
  }

  Future<void> _showAddSheet(BuildContext context) async {
    await showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => const _AddPlanSheet(),
    );
  }

  Future<void> _confirmDelete(
      BuildContext context, AppState appState, TrackedPlan plan) async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (ctx) {
        final ffTheme = AppTheme.of(ctx);
        return AlertDialog(
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
          title: Text('הסרת מסלול',
              style: GoogleFonts.rubik(fontWeight: FontWeight.w700)),
          content: Text('להסיר את "${plan.planName}" של ${plan.provider}?',
              style: ffTheme.bodyMedium),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: Text('ביטול', style: TextStyle(color: ffTheme.secondaryText)),
            ),
            TextButton(
              onPressed: () => Navigator.pop(ctx, true),
              child: Text('הסר', style: TextStyle(color: ffTheme.error)),
            ),
          ],
        );
      },
    );
    if (confirm == true && context.mounted) {
      Provider.of<AppState>(context, listen: false).removeMyPlan(plan.id);
      appBackend.removeTrackedPlan(plan.id).catchError((_) {});
      setState(() => _remoteOnly.removeWhere((p) => p.id == plan.id));
      PushNotificationService.instance.syncRenewalReminders(AppState());
    }
  }
}

// ── Intro Card ────────────────────────────────────────────────────────────────

class _IntroCard extends StatelessWidget {
  const _IntroCard({required this.ffTheme});
  final AppTheme ffTheme;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: [ffTheme.primaryDark, ffTheme.primary],
          begin: Alignment.topRight,
          end: Alignment.bottomLeft,
        ),
        borderRadius: BorderRadius.circular(18),
      ),
      child: Row(
        children: [
          Container(
            width: 48,
            height: 48,
            decoration: BoxDecoration(
              color: Colors.white.withValues(alpha: 0.15),
              borderRadius: BorderRadius.circular(14),
            ),
            child: const Center(
              child: Text('⏰', style: TextStyle(fontSize: 24)),
            ),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Text(
              'נעקוב מתי המבצע שלך נגמר ונזכיר לך לפני שהמחיר קופץ — כדי שלא תשלם יותר מדי',
              style: GoogleFonts.assistant(
                fontSize: 13.5,
                color: Colors.white,
                fontWeight: FontWeight.w500,
                height: 1.45,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

// ── Urgency Chip ──────────────────────────────────────────────────────────────

Color _chipColor(int days, AppTheme ffTheme) {
  if (days < 0) return ffTheme.error;
  if (days <= 21) return ffTheme.error;
  if (days <= 45) return const Color(0xFFF59E0B);
  return ffTheme.secondaryText;
}

String _chipLabel(int days) {
  if (days < 0) return 'המבצע הסתיים';
  if (days == 0) return 'מסתיים היום!';
  return 'מסתיים בעוד $days ימים';
}

// ── Plan Card ─────────────────────────────────────────────────────────────────

class _PlanCard extends StatelessWidget {
  const _PlanCard({
    required this.plan,
    required this.ffTheme,
    required this.onDelete,
    required this.onCompare,
    required this.onBestMatch,
  });
  final TrackedPlan plan;
  final AppTheme ffTheme;
  final VoidCallback onDelete;
  final VoidCallback onCompare;
  final void Function(String planId) onBestMatch;

  @override
  Widget build(BuildContext context) {
    final appState = Provider.of<AppState>(context, listen: false);
    final days = plan.daysUntilRenewal;
    final promoEnd = plan.promoEnd;

    final profile = MatchProfile(
      category: plan.category,
      currentBill: plan.monthlyPrice,
      priority: priorityFromId(appState.quizPriority),
      lines: appState.quizLines,
      wants5G: appState.wants5G,
      wantsAbroad: appState.wantsAbroad,
      wantsNoCommit: appState.wantsNoCommit,
    );
    final bestMatch = RecommendationEngine.bestMatch(profile);

    return Container(
      margin: const EdgeInsets.only(bottom: 14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: ffTheme.alternate),
        boxShadow: [
          BoxShadow(
              color: Colors.black.withValues(alpha: 0.04),
              blurRadius: 10,
              offset: const Offset(0, 3))
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Header row
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 12),
            child: Row(
              children: [
                LogoWidget(provider: plan.provider, size: 44),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(plan.provider,
                          style: ffTheme.titleSmall
                              .copyWith(fontWeight: FontWeight.w700)),
                      Text(plan.planName,
                          style: ffTheme.bodySmall
                              .copyWith(color: ffTheme.secondaryText),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis),
                      const SizedBox(height: 2),
                      Text(
                        '₪${plan.monthlyPrice}/${plan.category == 'abroad' ? 'חבילה' : 'חודש'}',
                        style: ffTheme.titleSmall.copyWith(
                            color: ffTheme.primary,
                            fontWeight: FontWeight.w800),
                      ),
                    ],
                  ),
                ),
                // Delete button
                IconButton(
                  icon: Icon(Icons.delete_outline_rounded,
                      color: ffTheme.secondaryText, size: 22),
                  tooltip: 'הסר מסלול',
                  onPressed: onDelete,
                ),
              ],
            ),
          ),

          // Promo end countdown
          if (days != null) ...[
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
              child: Row(
                children: [
                  Container(
                    padding: const EdgeInsets.symmetric(
                        horizontal: 10, vertical: 4),
                    decoration: BoxDecoration(
                      color: _chipColor(days, ffTheme).withValues(alpha: 0.1),
                      borderRadius: BorderRadius.circular(20),
                      border: Border.all(
                          color: _chipColor(days, ffTheme).withValues(alpha: 0.4)),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(Icons.timer_outlined,
                            size: 13,
                            color: _chipColor(days, ffTheme)),
                        const SizedBox(width: 4),
                        Text(
                          _chipLabel(days),
                          style: GoogleFonts.assistant(
                            fontSize: 12,
                            fontWeight: FontWeight.w700,
                            color: _chipColor(days, ffTheme),
                          ),
                        ),
                      ],
                    ),
                  ),
                  if (promoEnd != null) ...[
                    const SizedBox(width: 8),
                    Text(
                      DateFormat('d/M/yyyy').format(promoEnd),
                      style: ffTheme.labelSmall
                          .copyWith(color: ffTheme.secondaryText),
                    ),
                  ],
                ],
              ),
            ),
          ],

          // Best alternative banner
          if (bestMatch != null && bestMatch.annualSaving > 0) ...[
            Padding(
              padding: const EdgeInsets.fromLTRB(12, 0, 12, 8),
              child: GestureDetector(
                onTap: () => onBestMatch(bestMatch.plan.id),
                child: Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: ffTheme.accent1,
                    borderRadius: BorderRadius.circular(12),
                    border:
                        Border.all(color: ffTheme.primary.withValues(alpha: 0.2)),
                  ),
                  child: Row(
                    children: [
                      const Text('💡', style: TextStyle(fontSize: 18)),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Text(
                          'מצאנו לך מסלול שחוסך ₪${bestMatch.annualSaving}/שנה',
                          style: ffTheme.bodySmall.copyWith(
                              color: ffTheme.primary,
                              fontWeight: FontWeight.w700),
                        ),
                      ),
                      Icon(Icons.arrow_back_ios_rounded,
                          size: 12, color: ffTheme.primary),
                    ],
                  ),
                ),
              ),
            ),
          ],

          // Compare button
          Padding(
            padding: const EdgeInsets.fromLTRB(12, 0, 12, 14),
            child: OutlinedButton.icon(
              onPressed: onCompare,
              icon: const Icon(Icons.table_chart_rounded, size: 17),
              label: const Text('טבלת השוואה מלאה'),
              style: OutlinedButton.styleFrom(
                foregroundColor: ffTheme.primary,
                side: BorderSide(color: ffTheme.primary),
                minimumSize: const Size(double.infinity, 40),
                shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(10)),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

// ── Empty State ───────────────────────────────────────────────────────────────

class _EmptyState extends StatelessWidget {
  const _EmptyState({required this.ffTheme, required this.onAdd});
  final AppTheme ffTheme;
  final VoidCallback onAdd;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        const SizedBox(height: 32),
        Container(
          width: 88,
          height: 88,
          decoration: BoxDecoration(
            color: ffTheme.accent1,
            shape: BoxShape.circle,
          ),
          child: const Center(
              child: Text('📡', style: TextStyle(fontSize: 40))),
        ),
        const SizedBox(height: 18),
        Text('עוד לא הוספת מסלולים',
            style: ffTheme.titleLarge
                .copyWith(fontWeight: FontWeight.w700)),
        const SizedBox(height: 8),
        Text(
          'הוסף את המסלולים שלך ונעקוב אחרי מועד חידושם',
          style: ffTheme.bodyMedium.copyWith(color: ffTheme.secondaryText),
          textAlign: TextAlign.center,
        ),
        const SizedBox(height: 24),
        AppButton(
          text: 'הוסף מסלול ראשון',
          icon: const Icon(Icons.add_rounded, color: Colors.white, size: 20),
          color: ffTheme.primary,
          textStyle: GoogleFonts.rubik(
              fontSize: 15, fontWeight: FontWeight.w700, color: Colors.white),
          onPressed: () async => onAdd(),
        ),
        const SizedBox(height: 32),
      ],
    );
  }
}

// ── Reminder Tile ─────────────────────────────────────────────────────────────

class _ReminderTile extends StatelessWidget {
  const _ReminderTile({required this.ffTheme, required this.appState});
  final AppTheme ffTheme;
  final AppState appState;

  @override
  Widget build(BuildContext context) {
    final next = appState.renewalReminders ? nextReminder(appState) : null;
    final subtitle = next != null
        ? 'התזכורת הבאה: ${DateFormat('d/M/yyyy').format(next.fireDate)} · ${next.plan.provider}'
        : 'נשלח לך התראה ~21 יום לפני סיום המבצע';
    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: ffTheme.alternate),
      ),
      child: SwitchListTile(
        value: appState.renewalReminders,
        onChanged: (v) async {
          appState.setRenewalReminders(v);
          appBackend.setRenewalReminder(v).catchError((_) {});
          if (v) await PushNotificationService.instance.requestPermission();
          await PushNotificationService.instance.syncRenewalReminders(appState);
        },
        activeThumbColor: ffTheme.primary,
        title: Text('תזכורות חידוש',
            style: ffTheme.titleSmall
                .copyWith(fontWeight: FontWeight.w700)),
        subtitle: Padding(
          padding: const EdgeInsets.only(top: 2),
          child: Text(
            subtitle,
            style: ffTheme.bodySmall
                .copyWith(color: ffTheme.secondaryText),
          ),
        ),
        secondary: Container(
          width: 40,
          height: 40,
          decoration: BoxDecoration(
            color: ffTheme.accent1,
            borderRadius: BorderRadius.circular(10),
          ),
          child: Icon(Icons.notifications_active_outlined,
              color: ffTheme.primary, size: 20),
        ),
        contentPadding:
            const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
      ),
    );
  }
}

// ── Add Plan Bottom Sheet ─────────────────────────────────────────────────────

class _AddPlanSheet extends StatefulWidget {
  const _AddPlanSheet();

  @override
  State<_AddPlanSheet> createState() => _AddPlanSheetState();
}

class _AddPlanSheetState extends State<_AddPlanSheet> {
  String? _selectedCat;
  String _provider = '';
  String _planName = '';
  int _price = 0;
  String? _promoEndDate;
  bool _joinedViaUs = false;

  final _providerCtrl = TextEditingController();
  final _planNameCtrl = TextEditingController();
  final _priceCtrl = TextEditingController();
  final _formKey = GlobalKey<FormState>();

  List<String> get _providers {
    if (_selectedCat == null) return [];
    return plansByCat(_selectedCat!)
        .map((p) => p.provider)
        .toSet()
        .toList()
      ..sort();
  }

  @override
  void dispose() {
    _providerCtrl.dispose();
    _planNameCtrl.dispose();
    _priceCtrl.dispose();
    super.dispose();
  }

  Future<void> _pickDate() async {
    final now = DateTime.now();
    final picked = await showDatePicker(
      context: context,
      initialDate: now.add(const Duration(days: 30)),
      firstDate: now,
      lastDate: DateTime(now.year + 5),
      helpText: 'תאריך סיום המבצע',
    );
    if (picked != null) {
      setState(() {
        _promoEndDate =
            '${picked.year}-${picked.month.toString().padLeft(2, '0')}-${picked.day.toString().padLeft(2, '0')}';
      });
    }
  }

  void _submit() {
    if (!_formKey.currentState!.validate()) return;
    _formKey.currentState!.save();
    if (_selectedCat == null) return;

    final appState = Provider.of<AppState>(context, listen: false);
    appState.addMyPlan(
      category: _selectedCat!,
      provider: _provider.trim(),
      planName: _planName.trim(),
      monthlyPrice: _price,
      promoEndDate: _promoEndDate,
      joinedViaUs: _joinedViaUs,
    );
    PushNotificationService.instance.syncRenewalReminders(appState);
    // Mirror the newly added plan to the backend seam.
    if (appState.myPlans.isNotEmpty) {
      appBackend.addTrackedPlan(appState.myPlans.first).catchError((_) {});
    }
    Navigator.pop(context);
  }

  @override
  Widget build(BuildContext context) {
    final ffTheme = AppTheme.of(context);
    final bottomInset = MediaQuery.of(context).viewInsets.bottom;

    return Container(
      decoration: const BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      padding: EdgeInsets.fromLTRB(20, 20, 20, 20 + bottomInset),
      child: Form(
        key: _formKey,
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Handle
              Center(
                child: Container(
                  width: 40,
                  height: 4,
                  decoration: BoxDecoration(
                    color: ffTheme.alternate,
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),
              ),
              const SizedBox(height: 16),
              Text('הוסף מסלול',
                  style: ffTheme.titleLarge
                      .copyWith(fontWeight: FontWeight.w800)),
              const SizedBox(height: 20),

              // Category chips
              Text('קטגוריה', style: ffTheme.labelMedium),
              const SizedBox(height: 8),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: categories.map((cat) {
                  final selected = _selectedCat == cat.id;
                  return GestureDetector(
                    onTap: () {
                      setState(() {
                        _selectedCat = cat.id;
                        _provider = '';
                        _providerCtrl.clear();
                      });
                    },
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 14, vertical: 8),
                      decoration: BoxDecoration(
                        color: selected ? ffTheme.primary : ffTheme.accent1,
                        borderRadius: BorderRadius.circular(20),
                        border: Border.all(
                          color: selected
                              ? ffTheme.primary
                              : ffTheme.alternate,
                        ),
                      ),
                      child: Text(
                        '${cat.icon} ${cat.name}',
                        style: GoogleFonts.assistant(
                          fontSize: 13,
                          fontWeight: FontWeight.w600,
                          color: selected ? Colors.white : ffTheme.primaryText,
                        ),
                      ),
                    ),
                  );
                }).toList(),
              ),
              if (_selectedCat == null) ...[
                const SizedBox(height: 4),
                Text('יש לבחור קטגוריה',
                    style: TextStyle(
                        color: ffTheme.error, fontSize: 11)),
              ],

              const SizedBox(height: 18),

              // Provider field
              Text('ספק', style: ffTheme.labelMedium),
              const SizedBox(height: 8),
              Autocomplete<String>(
                optionsBuilder: (textEditingValue) {
                  if (textEditingValue.text.isEmpty) return _providers;
                  return _providers.where((p) =>
                      p.contains(textEditingValue.text));
                },
                onSelected: (val) => setState(() => _provider = val),
                fieldViewBuilder: (ctx, ctrl, focusNode, onSubmit) {
                  // Sync controller reference
                  if (ctrl.text.isEmpty && _provider.isNotEmpty) {
                    ctrl.text = _provider;
                  }
                  return TextFormField(
                    controller: ctrl,
                    focusNode: focusNode,
                    decoration: _inputDecoration(ffTheme, 'שם הספק'),
                    onChanged: (v) => setState(() => _provider = v),
                    validator: (v) =>
                        (v == null || v.trim().isEmpty) ? 'שדה חובה' : null,
                    onSaved: (v) => _provider = v ?? '',
                  );
                },
              ),

              const SizedBox(height: 14),

              // Plan name field
              Text('שם המסלול', style: ffTheme.labelMedium),
              const SizedBox(height: 8),
              TextFormField(
                controller: _planNameCtrl,
                decoration: _inputDecoration(ffTheme, 'למשל: גולד 100GB'),
                validator: (v) =>
                    (v == null || v.trim().isEmpty) ? 'שדה חובה' : null,
                onSaved: (v) => _planName = v ?? '',
              ),

              const SizedBox(height: 14),

              // Monthly price
              Text(
                _selectedCat == 'abroad'
                    ? 'מחיר לחבילה (₪)'
                    : 'מחיר לחודש (₪)',
                style: ffTheme.labelMedium,
              ),
              const SizedBox(height: 8),
              TextFormField(
                controller: _priceCtrl,
                keyboardType: TextInputType.number,
                decoration: _inputDecoration(ffTheme, '₪'),
                validator: (v) {
                  final n = int.tryParse(v ?? '');
                  if (n == null || n <= 0) return 'יש להזין מחיר תקין';
                  return null;
                },
                onSaved: (v) => _price = int.tryParse(v ?? '') ?? 0,
              ),

              const SizedBox(height: 14),

              // Promo end date
              Text('תאריך סיום המבצע (אופציונלי)',
                  style: ffTheme.labelMedium),
              const SizedBox(height: 8),
              GestureDetector(
                onTap: _pickDate,
                child: Container(
                  padding: const EdgeInsets.symmetric(
                      horizontal: 14, vertical: 14),
                  decoration: BoxDecoration(
                    color: ffTheme.accent1,
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: ffTheme.alternate),
                  ),
                  child: Row(
                    children: [
                      Icon(Icons.calendar_today_rounded,
                          color: ffTheme.primary, size: 18),
                      const SizedBox(width: 10),
                      Text(
                        _promoEndDate != null
                            ? _formatDate(_promoEndDate!)
                            : 'בחר תאריך',
                        style: ffTheme.bodyMedium.copyWith(
                          color: _promoEndDate != null
                              ? ffTheme.primaryText
                              : ffTheme.secondaryText,
                        ),
                      ),
                      const Spacer(),
                      if (_promoEndDate != null)
                        GestureDetector(
                          onTap: () =>
                              setState(() => _promoEndDate = null),
                          child: Icon(Icons.close_rounded,
                              size: 16, color: ffTheme.secondaryText),
                        ),
                    ],
                  ),
                ),
              ),

              const SizedBox(height: 14),

              // Joined via us switch
              Container(
                decoration: BoxDecoration(
                  color: ffTheme.accent1,
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: ffTheme.alternate),
                ),
                child: SwitchListTile(
                  dense: true,
                  value: _joinedViaUs,
                  onChanged: (v) => setState(() => _joinedViaUs = v),
                  activeThumbColor: ffTheme.primary,
                  title: Text('הצטרפתי דרך חוסך',
                      style: ffTheme.bodyMedium
                          .copyWith(fontWeight: FontWeight.w600)),
                  contentPadding:
                      const EdgeInsets.symmetric(horizontal: 14, vertical: 2),
                ),
              ),

              const SizedBox(height: 24),

              AppButton(
                text: 'שמור מסלול',
                color: ffTheme.primary,
                textStyle: GoogleFonts.rubik(
                    fontSize: 15,
                    fontWeight: FontWeight.w700,
                    color: Colors.white),
                onPressed: () async {
                  if (_selectedCat == null) {
                    setState(() {});
                    return;
                  }
                  _submit();
                },
              ),
            ],
          ),
        ),
      ),
    );
  }

  InputDecoration _inputDecoration(AppTheme ffTheme, String hint) =>
      InputDecoration(
        hintText: hint,
        hintStyle: ffTheme.bodySmall.copyWith(color: ffTheme.secondaryText),
        filled: true,
        fillColor: ffTheme.accent1,
        contentPadding:
            const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: BorderSide(color: ffTheme.alternate),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: BorderSide(color: ffTheme.alternate),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: BorderSide(color: ffTheme.primary, width: 1.5),
        ),
        errorBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: BorderSide(color: ffTheme.error),
        ),
      );

  String _formatDate(String iso) {
    final d = DateTime.tryParse(iso);
    if (d == null) return iso;
    return '${d.day}/${d.month}/${d.year}';
  }
}
