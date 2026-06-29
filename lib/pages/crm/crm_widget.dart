import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:google_fonts/google_fonts.dart';

import '../../core/nav.dart';
import '../../services/backend/backend.dart';
import '../../services/backend/local_backend.dart' show appBackend;
import '../../services/realtime_service.dart';
import '../../theme/app_theme.dart';
import '../../widgets/app_button.dart';
import '../../widgets/app_snackbar.dart';
import '../../widgets/empty_state.dart';
import '../../widgets/skeleton.dart';

/// ניהול לקוחות — the admin WhatsApp CRM.
///
/// Three tabs (סקירה / שיחות / צבר לידים) over [appBackend]'s CRM seam, which
/// proxies the service-role-only WhatsApp tables through the `crm-api` edge
/// function. The screen NEVER touches those tables directly.
///
/// Live updates ride a Supabase Realtime subscription on `crm_events`
/// ([Backend.crmEventStream]): a [RealtimePoller] refreshes the moment a rep
/// reply / takeover / hand-back / new lead lands, and keeps a heartbeat poll as
/// a graceful fallback (slow while realtime is healthy, dropping back to the
/// legacy ~12s cadence if the channel goes quiet — and [LocalBackend]/CI, whose
/// stream is empty, simply poll). A [RefreshIndicator] still backs manual pulls.
/// Sending a reply appends optimistically, then refreshes the thread so the
/// authoritative DB row replaces it.
class CrmWidget extends StatefulWidget {
  const CrmWidget({super.key});

  @override
  State<CrmWidget> createState() => _CrmWidgetState();
}

class _CrmWidgetState extends State<CrmWidget> with TickerProviderStateMixin {
  late final TabController _tabs = TabController(length: 3, vsync: this);
  RealtimePoller? _poller;

  // ── Overview ──────────────────────────────────────────────────────────────
  CrmOverview? _overview;
  bool _overviewLoading = true;
  Object? _overviewError;

  // ── Conversations ─────────────────────────────────────────────────────────
  List<CrmConversation> _conversations = const [];
  bool _convLoading = true;
  Object? _convError;
  String? _convStatusFilter; // null = all
  final TextEditingController _searchCtrl = TextEditingController();
  String _search = '';
  Timer? _searchDebounce;

  // ── Leads ─────────────────────────────────────────────────────────────────
  List<CrmLead> _leads = const [];
  bool _leadsLoading = true;
  Object? _leadsError;

  @override
  void initState() {
    super.initState();
    _refreshAll();
    // Realtime-first: refresh on every crm_events row, with a heartbeat poll as
    // the fallback. Under LocalBackend/CI the stream is empty, so this is purely
    // the heartbeat (which starts on the fast cadence until realtime proves
    // alive) — preserving the old polling behaviour with no live channel.
    _poller = RealtimePoller(
      eventStream: appBackend.crmEventStream(),
      onRefresh: () => _refreshAll(silent: true),
    )..start();
  }

  @override
  void dispose() {
    _poller?.dispose();
    _searchDebounce?.cancel();
    _tabs.dispose();
    _searchCtrl.dispose();
    super.dispose();
  }

  // ── Loads ───────────────────────────────────────────────────────────────────

  Future<void> _refreshAll({bool silent = false}) async {
    await Future.wait([
      _loadOverview(silent: silent),
      _loadConversations(silent: silent),
      _loadLeads(silent: silent),
    ]);
  }

  Future<void> _loadOverview({bool silent = false}) async {
    if (!silent) setState(() => _overviewLoading = true);
    try {
      final o = await appBackend.crmOverview();
      if (!mounted) return;
      setState(() {
        _overview = o;
        _overviewError = null;
        _overviewLoading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _overviewError = e;
        _overviewLoading = false;
      });
    }
  }

  Future<void> _loadConversations({bool silent = false}) async {
    if (!silent) setState(() => _convLoading = true);
    try {
      final list = await appBackend.crmListConversations(
        status: _convStatusFilter,
        search: _search.isEmpty ? null : _search,
      );
      if (!mounted) return;
      setState(() {
        _conversations = list;
        _convError = null;
        _convLoading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _convError = e;
        _convLoading = false;
      });
    }
  }

  Future<void> _loadLeads({bool silent = false}) async {
    if (!silent) setState(() => _leadsLoading = true);
    try {
      final list = await appBackend.crmListLeads();
      if (!mounted) return;
      setState(() {
        _leads = list;
        _leadsError = null;
        _leadsLoading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _leadsError = e;
        _leadsLoading = false;
      });
    }
  }

  void _onSearchChanged(String v) {
    setState(() => _search = v.trim());
    _searchDebounce?.cancel();
    _searchDebounce = Timer(const Duration(milliseconds: 350), () {
      if (mounted) _loadConversations(silent: true);
    });
  }

  void _setConvFilter(String? status) {
    setState(() => _convStatusFilter = status);
    _loadConversations();
  }

  // ── Open a thread ───────────────────────────────────────────────────────────

  Future<void> _openThread(CrmConversation c) async {
    await Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => _ThreadView(
          conversationId: c.conversationId,
          contactId: c.contactId,
          fallbackName: c.name,
          fallbackPhone: c.phone,
        ),
      ),
    );
    // Returning from a thread may have changed status / last message — refresh.
    if (mounted) _refreshAll(silent: true);
  }

  @override
  Widget build(BuildContext context) {
    final t = AppTheme.of(context);
    return Scaffold(
      backgroundColor: t.background,
      appBar: AppBar(
        leading: IconButton(
          icon: const Icon(Icons.arrow_forward_ios_rounded, size: 20),
          tooltip: 'חזרה',
          onPressed: () => context.safePop(),
        ),
        title: const Text('ניהול לקוחות'),
        bottom: TabBar(
          controller: _tabs,
          isScrollable: false,
          labelStyle: GoogleFonts.rubik(fontSize: 14, fontWeight: FontWeight.w800),
          unselectedLabelStyle:
              GoogleFonts.rubik(fontSize: 14, fontWeight: FontWeight.w600),
          tabs: const [
            Tab(text: 'סקירה'),
            Tab(text: 'שיחות'),
            Tab(text: 'צבר לידים'),
          ],
        ),
      ),
      body: TabBarView(
        controller: _tabs,
        children: [
          _OverviewTab(
            overview: _overview,
            loading: _overviewLoading,
            error: _overviewError,
            onRefresh: _loadOverview,
            onOpen: _openThread,
            onSeeConversations: () => _tabs.animateTo(1),
          ),
          _ConversationsTab(
            conversations: _conversations,
            loading: _convLoading,
            error: _convError,
            statusFilter: _convStatusFilter,
            searchCtrl: _searchCtrl,
            onSearchChanged: _onSearchChanged,
            onSetFilter: _setConvFilter,
            onRefresh: _loadConversations,
            onOpen: _openThread,
          ),
          _LeadsTab(
            leads: _leads,
            loading: _leadsLoading,
            error: _leadsError,
            onRefresh: _loadLeads,
            onMove: _moveLead,
          ),
        ],
      ),
    );
  }

  // ── Lead status change ────────────────────────────────────────────────────

  Future<void> _moveLead(CrmLead lead, String newStatus) async {
    if (lead.status == newStatus) return;
    try {
      await appBackend.crmSetLeadStatus(lead.id, newStatus);
      if (!mounted) return;
      // Optimistic local move; pipeline counts refresh from the server.
      setState(() {
        _leads = _leads
            .map((l) => l.id == lead.id ? _withStatus(l, newStatus) : l)
            .toList();
      });
      AppSnackBar.success(context, 'הליד הועבר ל${leadStatusLabel(newStatus)}');
      _loadOverview(silent: true);
      _loadLeads(silent: true);
    } catch (_) {
      if (!mounted) return;
      AppSnackBar.error(context, 'לא הצלחנו לעדכן את הליד');
    }
  }

  CrmLead _withStatus(CrmLead l, String status) => CrmLead(
        id: l.id,
        name: l.name,
        phone: l.phone,
        provider: l.provider,
        source: l.source,
        status: status,
        createdAt: l.createdAt,
      );
}

// ═══════════════════════════════════════════════════════════════════════════
// Overview tab
// ═══════════════════════════════════════════════════════════════════════════

class _OverviewTab extends StatelessWidget {
  const _OverviewTab({
    required this.overview,
    required this.loading,
    required this.error,
    required this.onRefresh,
    required this.onOpen,
    required this.onSeeConversations,
  });

  final CrmOverview? overview;
  final bool loading;
  final Object? error;
  final Future<void> Function() onRefresh;
  final Future<void> Function(CrmConversation) onOpen;
  final VoidCallback onSeeConversations;

  @override
  Widget build(BuildContext context) {
    final t = AppTheme.of(context);

    if (loading && overview == null) {
      return const _OverviewSkeleton();
    }
    if (error != null && overview == null) {
      return _ErrorState(onRetry: onRefresh);
    }

    final o = overview;
    final pipeline = o?.pipeline ?? const {};
    final recent = o?.recent ?? const [];

    return RefreshIndicator(
      onRefresh: onRefresh,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
        children: [
          // ── Pipeline stat cards ──
          GridView.count(
            crossAxisCount: 2,
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            mainAxisSpacing: 12,
            crossAxisSpacing: 12,
            childAspectRatio: 1.7,
            children: [
              _StatCard(
                label: 'חדשים',
                value: pipeline['new'] ?? 0,
                icon: Icons.fiber_new_rounded,
                tint: t.brandAccent,
              ),
              _StatCard(
                label: 'נוצר קשר',
                value: pipeline['contacted'] ?? 0,
                icon: Icons.forum_rounded,
                tint: t.info,
              ),
              _StatCard(
                label: 'נסגרו בהצלחה',
                value: pipeline['won'] ?? 0,
                icon: Icons.emoji_events_rounded,
                tint: t.saving,
              ),
              _StatCard(
                label: 'אבודים',
                value: pipeline['lost'] ?? 0,
                icon: Icons.do_not_disturb_on_rounded,
                tint: t.secondaryText,
              ),
            ],
          ).animate().fadeIn(duration: 300.ms).slideY(begin: 0.06),

          const SizedBox(height: 24),

          Row(
            children: [
              _LeadingRule(t: t),
              const SizedBox(width: 8),
              Text('שיחות אחרונות',
                  style: t.titleMedium.copyWith(fontWeight: FontWeight.w800)),
              const Spacer(),
              if (recent.isNotEmpty)
                TextButton(
                  onPressed: onSeeConversations,
                  child: Text('כל השיחות',
                      style: t.labelMedium.copyWith(
                          color: t.brandAccentText, fontWeight: FontWeight.w700)),
                ),
            ],
          ),
          const SizedBox(height: 8),

          if (recent.isEmpty)
            const Padding(
              padding: EdgeInsets.only(top: 40),
              child: EmptyState(
                icon: Icons.chat_bubble_outline_rounded,
                headline: 'אין שיחות עדיין',
                subtitle: 'שיחות וואטסאפ חדשות יופיעו כאן ברגע שילקוחות יכתבו.',
              ),
            )
          else
            ...recent.asMap().entries.map((e) => Padding(
                  padding: const EdgeInsets.only(bottom: 10),
                  child: _ConversationRow(
                    c: e.value,
                    onTap: () => onOpen(e.value),
                  ).animate(delay: (e.key * 40).ms).fadeIn(duration: 240.ms),
                )),
        ],
      ),
    );
  }
}

class _StatCard extends StatelessWidget {
  const _StatCard({
    required this.label,
    required this.value,
    required this.icon,
    required this.tint,
  });

  final String label;
  final int value;
  final IconData icon;
  final Color tint;

  @override
  Widget build(BuildContext context) {
    final t = AppTheme.of(context);
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: t.bentoDecoration(),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Row(
            children: [
              Container(
                width: 36,
                height: 36,
                decoration: BoxDecoration(
                  color: tint.withValues(alpha: 0.14),
                  borderRadius: BorderRadius.circular(t.radiusSm),
                  border: Border.all(color: tint.withValues(alpha: 0.18)),
                ),
                child: Icon(icon, size: 19, color: tint),
              ),
              const Spacer(),
              Text(
                '$value',
                style: GoogleFonts.rubik(
                  fontSize: 26,
                  fontWeight: FontWeight.w900,
                  color: t.primaryText,
                  fontFeatures: const [FontFeature.tabularFigures()],
                ),
              ),
            ],
          ),
          Text(label,
              style: t.labelMedium
                  .copyWith(color: t.secondaryText, fontWeight: FontWeight.w700)),
        ],
      ),
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Conversations tab
// ═══════════════════════════════════════════════════════════════════════════

class _ConversationsTab extends StatelessWidget {
  const _ConversationsTab({
    required this.conversations,
    required this.loading,
    required this.error,
    required this.statusFilter,
    required this.searchCtrl,
    required this.onSearchChanged,
    required this.onSetFilter,
    required this.onRefresh,
    required this.onOpen,
  });

  final List<CrmConversation> conversations;
  final bool loading;
  final Object? error;
  final String? statusFilter;
  final TextEditingController searchCtrl;
  final ValueChanged<String> onSearchChanged;
  final ValueChanged<String?> onSetFilter;
  final Future<void> Function() onRefresh;
  final Future<void> Function(CrmConversation) onOpen;

  static const List<(String?, String)> _filters = [
    (null, 'הכל'),
    ('open', 'פתוחות'),
    ('bot', 'בוט'),
    ('human', 'נציג'),
    ('closed', 'סגורות'),
  ];

  @override
  Widget build(BuildContext context) {
    final t = AppTheme.of(context);

    return Column(
      children: [
        // ── Search ──
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 14, 16, 8),
          child: TextField(
            controller: searchCtrl,
            onChanged: onSearchChanged,
            textInputAction: TextInputAction.search,
            decoration: InputDecoration(
              hintText: 'חיפוש לפי שם או טלפון',
              prefixIcon: const Icon(Icons.search_rounded),
              isDense: true,
              suffixIcon: searchCtrl.text.isEmpty
                  ? null
                  : IconButton(
                      icon: const Icon(Icons.close_rounded, size: 18),
                      tooltip: 'נקה חיפוש',
                      onPressed: () {
                        searchCtrl.clear();
                        onSearchChanged('');
                      },
                    ),
            ),
          ),
        ),
        // ── Status filter chips ──
        SizedBox(
          height: 40,
          child: ListView.separated(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 16),
            itemCount: _filters.length,
            separatorBuilder: (_, __) => const SizedBox(width: 8),
            itemBuilder: (_, i) {
              final (val, label) = _filters[i];
              final selected = statusFilter == val;
              return ChoiceChip(
                label: Text(label),
                selected: selected,
                showCheckmark: false,
                labelStyle: t.labelMedium.copyWith(
                  color: selected ? Colors.white : t.secondaryText,
                  fontWeight: FontWeight.w700,
                ),
                backgroundColor: t.cardSurface,
                selectedColor: t.brandAccent,
                side: BorderSide(
                    color: selected ? t.brandAccent : t.alternate),
                onSelected: (_) => onSetFilter(val),
              );
            },
          ),
        ),
        const SizedBox(height: 6),
        Expanded(
          child: _buildList(context, t),
        ),
      ],
    );
  }

  Widget _buildList(BuildContext context, AppTheme t) {
    if (loading && conversations.isEmpty) {
      return ListView(
        padding: const EdgeInsets.fromLTRB(16, 6, 16, 32),
        physics: const NeverScrollableScrollPhysics(),
        children: const [
          _ConversationRowSkeleton(),
          _ConversationRowSkeleton(),
          _ConversationRowSkeleton(),
          _ConversationRowSkeleton(),
          _ConversationRowSkeleton(),
        ],
      );
    }
    if (error != null && conversations.isEmpty) {
      return _ErrorState(onRetry: onRefresh);
    }
    return RefreshIndicator(
      onRefresh: onRefresh,
      child: conversations.isEmpty
          ? ListView(
              children: const [
                SizedBox(height: 60),
                EmptyState(
                  icon: Icons.forum_outlined,
                  headline: 'אין שיחות מתאימות',
                  subtitle: 'נסו לשנות את הסינון או החיפוש.',
                ),
              ],
            )
          : ListView.builder(
              padding: const EdgeInsets.fromLTRB(16, 6, 16, 32),
              itemCount: conversations.length,
              itemBuilder: (_, i) {
                // Emil FREQUENCY rule: conversation rows are a high-frequency
                // operator tap target, so they render statically — minimal motion
                // is the right call. (A fadeIn Opacity would also drop the row's
                // "שיחה עם …" a11y label while <1 opacity.) The press tell lives
                // on the row itself.
                return Padding(
                  padding: const EdgeInsets.only(bottom: 10),
                  child: _ConversationRow(
                    c: conversations[i],
                    onTap: () => onOpen(conversations[i]),
                  ),
                );
              },
            ),
    );
  }
}

class _ConversationRow extends StatelessWidget {
  const _ConversationRow({required this.c, required this.onTap});
  final CrmConversation c;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final t = AppTheme.of(context);
    final title = c.name.isNotEmpty ? c.name : c.phone;
    return Semantics(
      button: true,
      label: 'שיחה עם $title. ${c.lastSnippet}',
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(t.radiusLg),
          child: Container(
            padding: const EdgeInsets.all(14),
            decoration: t.cardDecoration(radius: t.radiusLg),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _Avatar(name: title),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Expanded(
                            child: Text(title,
                                style: t.bodyMedium
                                    .copyWith(fontWeight: FontWeight.w700),
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis),
                          ),
                          if (c.lastAt != null)
                            Text(_relativeTime(c.lastAt!),
                                style: t.labelSmall
                                    .copyWith(color: t.secondaryText)),
                        ],
                      ),
                      const SizedBox(height: 3),
                      Text(
                        c.lastSnippet.isEmpty ? 'אין הודעות' : c.lastSnippet,
                        style: t.bodySmall.copyWith(color: t.secondaryText),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                      const SizedBox(height: 8),
                      Row(
                        children: [
                          _StatusChip(
                            label: convStatusLabel(c.status),
                            color: convStatusColor(c.status, t),
                          ),
                          if (c.leadStatus != null) ...[
                            const SizedBox(width: 6),
                            _StatusChip(
                              label: leadStatusLabel(c.leadStatus!),
                              color: leadStatusColor(c.leadStatus!, t),
                            ),
                          ],
                          if (c.intent != null && c.intent!.isNotEmpty) ...[
                            const SizedBox(width: 6),
                            Flexible(
                              child: Text('· ${c.intent}',
                                  style: t.labelSmall
                                      .copyWith(color: t.secondaryText),
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis),
                            ),
                          ],
                        ],
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 4),
                Icon(Icons.chevron_left_rounded, size: 18, color: t.secondaryText),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Thread view (its own pushed page)
// ═══════════════════════════════════════════════════════════════════════════

class _ThreadView extends StatefulWidget {
  const _ThreadView({
    required this.conversationId,
    required this.contactId,
    required this.fallbackName,
    required this.fallbackPhone,
  });

  final String conversationId;
  final String contactId;
  final String fallbackName;
  final String fallbackPhone;

  @override
  State<_ThreadView> createState() => _ThreadViewState();
}

class _ThreadViewState extends State<_ThreadView> {
  CrmThread? _thread;
  bool _loading = true;
  Object? _error;
  RealtimePoller? _poller;

  final TextEditingController _reply = TextEditingController();
  final ScrollController _scroll = ScrollController();
  bool _sending = false;

  // Locally-appended optimistic messages, cleared once a refresh confirms them.
  final List<CrmMessage> _pending = [];

  @override
  void initState() {
    super.initState();
    _load();
    // A rep reply / takeover / inbound message all land as crm_events rows;
    // refresh the open thread the moment one arrives, with the heartbeat poll as
    // the fallback (empty stream under LocalBackend/CI → heartbeat only).
    _poller = RealtimePoller(
      eventStream: appBackend.crmEventStream(),
      onRefresh: () => _load(silent: true),
    )..start();
  }

  @override
  void dispose() {
    _poller?.dispose();
    _reply.dispose();
    _scroll.dispose();
    super.dispose();
  }

  Future<void> _load({bool silent = false}) async {
    if (!silent) setState(() => _loading = true);
    try {
      final th = await appBackend.crmGetThread(widget.conversationId);
      if (!mounted) return;
      setState(() {
        _thread = th;
        _error = null;
        _loading = false;
        // Drop optimistic rows once the server has at least as many out/rep
        // messages as we appended locally.
        final serverReps = th.messages
            .where((m) => m.direction == 'out' && m.actor == 'rep')
            .length;
        if (serverReps >= _sentCount) _pending.clear();
      });
      _scrollToBottom();
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e;
        _loading = false;
      });
    }
  }

  int _sentCount = 0;

  void _scrollToBottom() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scroll.hasClients) {
        _scroll.jumpTo(_scroll.position.maxScrollExtent);
      }
    });
  }

  Future<void> _send() async {
    final body = _reply.text.trim();
    if (body.isEmpty || _sending) return;
    final optimistic = CrmMessage(
      id: 'pending-${DateTime.now().microsecondsSinceEpoch}',
      direction: 'out',
      actor: 'rep',
      body: body,
      createdAt: DateTime.now(),
    );
    setState(() {
      _sending = true;
      _sentCount++;
      _pending.add(optimistic);
      _reply.clear();
    });
    _scrollToBottom();
    try {
      await appBackend.crmSendReply(widget.conversationId, body);
      await _load(silent: true);
    } catch (_) {
      if (!mounted) return;
      // Roll the optimistic row back so it doesn't linger forever as "pending"
      // (which would also wedge _pending open, since serverReps can never catch
      // up to _sentCount). Restore the draft so the rep can retry.
      setState(() {
        _pending.remove(optimistic);
        _sentCount--;
        if (_reply.text.isEmpty) _reply.text = body;
      });
      AppSnackBar.error(context, 'ההודעה לא נשלחה — נסו שוב');
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = AppTheme.of(context);
    final contact = _thread?.contact;
    final title = (contact?.name.isNotEmpty ?? false)
        ? contact!.name
        : (widget.fallbackName.isNotEmpty
            ? widget.fallbackName
            : widget.fallbackPhone);
    final subtitle = contact?.phone ?? widget.fallbackPhone;

    return Scaffold(
      backgroundColor: t.background,
      appBar: AppBar(
        leading: IconButton(
          icon: const Icon(Icons.arrow_forward_ios_rounded, size: 20),
          tooltip: 'חזרה',
          onPressed: () => context.safePop(),
        ),
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(title,
                style: GoogleFonts.rubik(
                    fontSize: 16, fontWeight: FontWeight.w700, color: t.primaryText)),
            Text(subtitle,
                style: GoogleFonts.assistant(
                    fontSize: 12,
                    color: t.secondaryText)),
          ],
        ),
      ),
      body: Column(
        children: [
          if (contact != null)
            _ContactStatusBar(contact: contact, onChange: _changeContactStatus),
          Expanded(child: _buildMessages(context, t)),
          _ReplyBox(
            controller: _reply,
            sending: _sending,
            onSend: _send,
          ),
        ],
      ),
    );
  }

  Future<void> _changeContactStatus(String status) async {
    final contact = _thread?.contact;
    if (contact == null || contact.status == status) return;
    try {
      await appBackend.crmSetContactStatus(contact.id, status);
      if (!mounted) return;
      setState(() {
        _thread = CrmThread(
          contact: CrmContact(
            id: contact.id,
            name: contact.name,
            phone: contact.phone,
            status: status,
            leadId: contact.leadId,
            leadStatus: contact.leadStatus,
          ),
          messages: _thread!.messages,
        );
      });
      AppSnackBar.success(context, 'הסטטוס עודכן');
    } catch (_) {
      if (!mounted) return;
      AppSnackBar.error(context, 'לא הצלחנו לעדכן את הסטטוס');
    }
  }

  Widget _buildMessages(BuildContext context, AppTheme t) {
    if (_loading && _thread == null) {
      return const _ThreadSkeleton();
    }
    if (_error != null && _thread == null) {
      return _ErrorState(onRetry: _load);
    }
    final messages = [...?_thread?.messages, ..._pending];
    if (messages.isEmpty) {
      return const EmptyState(
        icon: Icons.chat_outlined,
        headline: 'אין הודעות בשיחה',
        subtitle: 'כתבו הודעה ראשונה כדי לפתוח את השיחה.',
      );
    }
    return ListView.builder(
      controller: _scroll,
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 12),
      itemCount: messages.length,
      itemBuilder: (_, i) {
        final m = messages[i];
        return _MessageBubble(
          message: m,
          pending: m.id.startsWith('pending-'),
          // Emil: only the newest bubble plays the entrance, so sending /
          // receiving a reply lands crisply without re-animating the history.
          animateIn: i == messages.length - 1,
        );
      },
    );
  }
}

class _ContactStatusBar extends StatelessWidget {
  const _ContactStatusBar({required this.contact, required this.onChange});
  final CrmContact contact;
  final Future<void> Function(String) onChange;

  static const List<String> _statuses = [
    'new',
    'active',
    'qualified',
    'handed_off',
    'won',
    'lost',
    'blocked',
  ];

  @override
  Widget build(BuildContext context) {
    final t = AppTheme.of(context);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      decoration: BoxDecoration(
        color: t.cardSurface,
        border: Border(bottom: BorderSide(color: t.alternate)),
      ),
      child: Row(
        children: [
          Text('סטטוס:',
              style: t.labelMedium.copyWith(color: t.secondaryText)),
          const SizedBox(width: 8),
          _StatusChip(
            label: contactStatusLabel(contact.status),
            color: contactStatusColor(contact.status, t),
          ),
          const Spacer(),
          PopupMenuButton<String>(
            tooltip: 'שינוי סטטוס',
            icon: Icon(Icons.more_horiz_rounded, color: t.primaryText),
            onSelected: onChange,
            itemBuilder: (_) => _statuses
                .map((s) => PopupMenuItem<String>(
                      value: s,
                      child: Text(contactStatusLabel(s)),
                    ))
                .toList(),
          ),
        ],
      ),
    );
  }
}

class _MessageBubble extends StatelessWidget {
  const _MessageBubble({
    required this.message,
    required this.pending,
    this.animateIn = false,
  });
  final CrmMessage message;
  final bool pending;
  final bool animateIn;

  @override
  Widget build(BuildContext context) {
    final t = AppTheme.of(context);
    // Outgoing (out/rep or bot) align to the leading edge (start); inbound from
    // the customer aligns to the trailing edge — RTL-aware via Align + the
    // ambient Directionality.
    final outbound = message.direction == 'out';
    final isBot = message.actor == 'bot';
    final bg = outbound
        ? (isBot ? t.accent1 : t.brandAccent)
        : t.cardSurface;
    final fg = outbound && !isBot ? Colors.white : t.primaryText;
    final reduceMotion =
        MediaQuery.maybeOf(context)?.disableAnimations ?? false;

    final bubble = Align(
      alignment: outbound ? AlignmentDirectional.centerStart : AlignmentDirectional.centerEnd,
      child: Container(
        margin: const EdgeInsets.only(bottom: 10),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
        constraints: BoxConstraints(
          maxWidth: MediaQuery.of(context).size.width * 0.76,
        ),
        decoration: BoxDecoration(
          color: bg,
          borderRadius: BorderRadius.only(
            topLeft: Radius.circular(t.radiusLg),
            topRight: Radius.circular(t.radiusLg),
            bottomLeft: Radius.circular(outbound ? 4 : t.radiusLg),
            bottomRight: Radius.circular(outbound ? t.radiusLg : 4),
          ),
          border: outbound && !isBot ? null : Border.all(color: t.alternate),
          boxShadow: t.shadowXs,
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (outbound)
              Padding(
                padding: const EdgeInsets.only(bottom: 2),
                child: Text(
                  isBot ? 'בוט' : 'נציג',
                  style: t.labelSmall.copyWith(
                    color: fg.withValues(alpha: 0.75),
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
            Text(message.body, style: t.bodyMedium.copyWith(color: fg)),
            const SizedBox(height: 3),
            Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                if (message.createdAt != null)
                  Text(_clockTime(message.createdAt!),
                      style: t.labelSmall.copyWith(
                          color: fg.withValues(alpha: 0.7), fontSize: 10)),
                if (pending) ...[
                  const SizedBox(width: 4),
                  Icon(Icons.schedule_rounded,
                      size: 11, color: fg.withValues(alpha: 0.7)),
                ],
              ],
            ),
          ],
        ),
      ),
    );

    if (!animateIn) return bubble;
    // Emil: a new bubble enters crisp — ease-out fade + a small slide from the
    // bubble's own edge (outbound from the leading edge, inbound from the
    // trailing edge). Reduced motion keeps the fade and drops the slide.
    final entrance = bubble.animate().fadeIn(
          duration: t.motionFast,
          curve: t.easeOut,
        );
    return reduceMotion
        ? entrance
        : entrance.slideX(
            begin: outbound ? -0.06 : 0.06,
            end: 0,
            duration: t.motionFast,
            curve: t.easeOut,
          );
  }
}

class _ReplyBox extends StatelessWidget {
  const _ReplyBox({
    required this.controller,
    required this.sending,
    required this.onSend,
  });
  final TextEditingController controller;
  final bool sending;
  final Future<void> Function() onSend;

  @override
  Widget build(BuildContext context) {
    final t = AppTheme.of(context);
    return Container(
      padding: EdgeInsets.fromLTRB(
        12,
        10,
        12,
        10 + MediaQuery.of(context).viewPadding.bottom,
      ),
      decoration: BoxDecoration(
        color: t.cardSurface,
        border: Border(top: BorderSide(color: t.alternate)),
        boxShadow: t.shadowSoft,
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          Expanded(
            child: TextField(
              controller: controller,
              minLines: 1,
              maxLines: 4,
              textInputAction: TextInputAction.newline,
              decoration: const InputDecoration(
                hintText: 'כתבו תשובה ללקוח…',
                isDense: true,
              ),
            ),
          ),
          const SizedBox(width: 8),
          AppButton(
            text: 'שליחה',
            onPressed: onSend,
            color: AppColors.primary,
            icon: const Icon(Icons.send_rounded, size: 18, color: Colors.white),
            iconPadding: 6,
            height: 48,
            width: 116,
          ),
        ],
      ),
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Leads tab
// ═══════════════════════════════════════════════════════════════════════════

class _LeadsTab extends StatelessWidget {
  const _LeadsTab({
    required this.leads,
    required this.loading,
    required this.error,
    required this.onRefresh,
    required this.onMove,
  });

  final List<CrmLead> leads;
  final bool loading;
  final Object? error;
  final Future<void> Function() onRefresh;
  final Future<void> Function(CrmLead, String) onMove;

  // Display order of the lead pipeline columns.
  static const List<String> _order = ['new', 'contacted', 'won', 'lost'];

  @override
  Widget build(BuildContext context) {
    final t = AppTheme.of(context);

    if (loading && leads.isEmpty) {
      return ListView(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
        physics: const NeverScrollableScrollPhysics(),
        children: const [
          _LeadRowSkeleton(),
          _LeadRowSkeleton(),
          _LeadRowSkeleton(),
          _LeadRowSkeleton(),
        ],
      );
    }
    if (error != null && leads.isEmpty) {
      return _ErrorState(onRetry: onRefresh);
    }

    final grouped = <String, List<CrmLead>>{for (final s in _order) s: []};
    for (final l in leads) {
      (grouped[l.status] ??= []).add(l);
    }

    return RefreshIndicator(
      onRefresh: onRefresh,
      child: leads.isEmpty
          ? ListView(
              children: const [
                SizedBox(height: 60),
                EmptyState(
                  icon: Icons.inbox_rounded,
                  headline: 'אין לידים עדיין',
                  subtitle: 'לידים חדשים מהאתר ומהאפליקציה יופיעו כאן.',
                ),
              ],
            )
          : ListView(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
              children: [
                for (final status in _order)
                  if ((grouped[status] ?? const []).isNotEmpty) ...[
                    Row(
                      children: [
                        _LeadingRule(t: t, color: leadStatusColor(status, t)),
                        const SizedBox(width: 8),
                        Text(leadStatusLabel(status),
                            style: t.titleMedium
                                .copyWith(fontWeight: FontWeight.w800)),
                        const SizedBox(width: 8),
                        Text('${grouped[status]!.length}',
                            style: t.labelMedium.copyWith(
                                color: t.secondaryText,
                                fontWeight: FontWeight.w700)),
                      ],
                    ),
                    const SizedBox(height: 10),
                    // Emil: lead rows in a column reveal in a short stagger
                    // (fade + 8px rise, ease-out) so a status group resolves
                    // top-down. Capped delay keeps a long column snappy.
                    ...grouped[status]!.asMap().entries.map((e) => Padding(
                          padding: const EdgeInsets.only(bottom: 10),
                          child: _LeadRow(lead: e.value, onMove: onMove)
                              .animate(delay: (e.key.clamp(0, 8) * 40).ms)
                              .fadeIn(duration: 240.ms, curve: t.easeOut)
                              .slideY(begin: 0.08, end: 0, curve: t.easeOut),
                        )),
                    const SizedBox(height: 18),
                  ],
              ],
            ),
    );
  }
}

class _LeadRow extends StatelessWidget {
  const _LeadRow({required this.lead, required this.onMove});
  final CrmLead lead;
  final Future<void> Function(CrmLead, String) onMove;

  static const List<String> _targets = ['new', 'contacted', 'won', 'lost'];

  @override
  Widget build(BuildContext context) {
    final t = AppTheme.of(context);
    final meta = [
      if (lead.provider != null && lead.provider!.isNotEmpty) lead.provider!,
      if (lead.source != null && lead.source!.isNotEmpty) lead.source!,
    ].join(' · ');

    return Container(
      padding: const EdgeInsets.all(14),
      decoration: t.cardDecoration(radius: t.radiusLg),
      child: Row(
        children: [
          _Avatar(name: lead.name.isNotEmpty ? lead.name : lead.phone),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(lead.name.isNotEmpty ? lead.name : lead.phone,
                    style: t.bodyMedium.copyWith(fontWeight: FontWeight.w700),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis),
                const SizedBox(height: 2),
                Text(
                  meta.isEmpty ? lead.phone : '${lead.phone} · $meta',
                  style: t.labelSmall.copyWith(color: t.secondaryText),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ],
            ),
          ),
          PopupMenuButton<String>(
            tooltip: 'העברת ליד',
            icon: Icon(Icons.swap_horiz_rounded, color: t.brandAccent),
            onSelected: (s) => onMove(lead, s),
            itemBuilder: (_) => _targets
                .where((s) => s != lead.status)
                .map((s) => PopupMenuItem<String>(
                      value: s,
                      child: Row(
                        children: [
                          Icon(Icons.arrow_back_rounded,
                              size: 16, color: leadStatusColor(s, t)),
                          const SizedBox(width: 8),
                          Text('העבר ל${leadStatusLabel(s)}'),
                        ],
                      ),
                    ))
                .toList(),
          ),
        ],
      ),
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Designed loading states — skeletons that hint the final shape, not a spinner
// ═══════════════════════════════════════════════════════════════════════════

/// The overview tab's loading ghost: a 2×2 stat-card grid above a couple of
/// conversation-row ghosts, so the surface already reads as its final layout
/// before the pipeline counts land. Non-scrolling — it's a static placeholder.
class _OverviewSkeleton extends StatelessWidget {
  const _OverviewSkeleton();

  @override
  Widget build(BuildContext context) {
    final t = AppTheme.of(context);
    return Semantics(
      label: 'טוען',
      container: true,
      child: ExcludeSemantics(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
          physics: const NeverScrollableScrollPhysics(),
          children: [
            GridView.count(
              crossAxisCount: 2,
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              mainAxisSpacing: 12,
              crossAxisSpacing: 12,
              childAspectRatio: 1.7,
              children: [
                for (var i = 0; i < 4; i++)
                  Container(
                    padding: const EdgeInsets.all(16),
                    decoration: t.bentoDecoration(),
                    child: SkeletonShimmer(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Row(
                            children: [
                              SkeletonBox(
                                  width: 36, height: 36, radius: t.radiusSm),
                              const Spacer(),
                              const SkeletonBox(width: 34, height: 24),
                            ],
                          ),
                          const SkeletonBox(width: 64, height: 12),
                        ],
                      ),
                    ),
                  ),
              ],
            ),
            const SizedBox(height: 24),
            const SkeletonShimmer(child: SkeletonBox(width: 130, height: 16)),
            const SizedBox(height: 14),
            const _ConversationRowSkeleton(),
            const _ConversationRowSkeleton(),
            const _ConversationRowSkeleton(),
          ],
        ),
      ),
    );
  }
}

/// A ghost of a [_ConversationRow] — avatar, name + time, snippet, status chips —
/// laid out to match the real row so the list already signals its shape.
class _ConversationRowSkeleton extends StatelessWidget {
  const _ConversationRowSkeleton();

  @override
  Widget build(BuildContext context) {
    final t = AppTheme.of(context);
    return Semantics(
      label: 'טוען',
      container: true,
      child: ExcludeSemantics(
        child: Container(
          margin: const EdgeInsets.only(bottom: 10),
          padding: const EdgeInsets.all(14),
          decoration: t.cardDecoration(radius: t.radiusLg),
          child: SkeletonShimmer(
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const SkeletonBox(width: 42, height: 42, radius: 21),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Row(
                        children: [
                          SkeletonBox(width: 110, height: 13),
                          Spacer(),
                          SkeletonBox(width: 36, height: 10),
                        ],
                      ),
                      const SizedBox(height: 8),
                      const SkeletonBox(width: double.infinity, height: 11),
                      const SizedBox(height: 10),
                      Row(
                        children: [
                          SkeletonBox(
                              width: 56, height: 18, radius: t.radiusPill),
                          const SizedBox(width: 6),
                          SkeletonBox(
                              width: 48, height: 18, radius: t.radiusPill),
                        ],
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// A ghost of a [_LeadRow] — avatar, name + meta, trailing action.
class _LeadRowSkeleton extends StatelessWidget {
  const _LeadRowSkeleton();

  @override
  Widget build(BuildContext context) {
    final t = AppTheme.of(context);
    return Semantics(
      label: 'טוען',
      container: true,
      child: ExcludeSemantics(
        child: Container(
          margin: const EdgeInsets.only(bottom: 10),
          padding: const EdgeInsets.all(14),
          decoration: t.cardDecoration(radius: t.radiusLg),
          child: const SkeletonShimmer(
            child: Row(
              children: [
                SkeletonBox(width: 42, height: 42, radius: 21),
                SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      SkeletonBox(width: 120, height: 13),
                      SizedBox(height: 7),
                      SkeletonBox(width: 170, height: 11),
                    ],
                  ),
                ),
                SizedBox(width: 8),
                SkeletonBox(width: 24, height: 24, radius: 12),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// The thread view's loading ghost: a few message bubbles alternating along the
/// leading/trailing edges, matching the real conversation layout.
class _ThreadSkeleton extends StatelessWidget {
  const _ThreadSkeleton();

  @override
  Widget build(BuildContext context) {
    final t = AppTheme.of(context);
    final widths = [0.64, 0.5, 0.72, 0.42];
    final outbound = [false, true, false, true];
    return Semantics(
      label: 'טוען',
      container: true,
      child: ExcludeSemantics(
        child: SkeletonShimmer(
          child: ListView(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 12),
            physics: const NeverScrollableScrollPhysics(),
            children: [
              for (var i = 0; i < widths.length; i++)
                Align(
                  alignment: outbound[i]
                      ? AlignmentDirectional.centerStart
                      : AlignmentDirectional.centerEnd,
                  child: Container(
                    margin: const EdgeInsets.only(bottom: 10),
                    width: MediaQuery.of(context).size.width * widths[i],
                    height: 44,
                    decoration: BoxDecoration(
                      color: t.cardSurface,
                      borderRadius: BorderRadius.circular(t.radiusLg),
                    ),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Shared bits
// ═══════════════════════════════════════════════════════════════════════════

class _Avatar extends StatelessWidget {
  const _Avatar({required this.name});
  final String name;

  @override
  Widget build(BuildContext context) {
    final t = AppTheme.of(context);
    final initial = name.trim().isEmpty ? '?' : name.trim().characters.first;
    return Container(
      width: 42,
      height: 42,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: t.brandAccentTint,
        shape: BoxShape.circle,
        border: Border.all(color: t.brandAccent.withValues(alpha: 0.2)),
      ),
      child: ExcludeSemantics(
        child: Text(initial,
            style: GoogleFonts.rubik(
                fontSize: 17,
                fontWeight: FontWeight.w800,
                color: t.brandAccentText)),
      ),
    );
  }
}

class _StatusChip extends StatelessWidget {
  const _StatusChip({required this.label, required this.color});
  final String label;
  final Color color;

  @override
  Widget build(BuildContext context) {
    final t = AppTheme.of(context);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 3),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.14),
        borderRadius: BorderRadius.circular(t.radiusPill),
        border: Border.all(color: color.withValues(alpha: 0.35)),
      ),
      child: Text(label,
          style: t.labelSmall.copyWith(color: color, fontWeight: FontWeight.w700)),
    );
  }
}

class _LeadingRule extends StatelessWidget {
  const _LeadingRule({required this.t, this.color});
  final AppTheme t;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 4,
      height: 18,
      decoration: BoxDecoration(
        color: color ?? t.primary,
        borderRadius: BorderRadius.circular(2),
      ),
    );
  }
}

class _ErrorState extends StatelessWidget {
  const _ErrorState({required this.onRetry});
  final Future<void> Function() onRetry;

  @override
  Widget build(BuildContext context) {
    return EmptyState(
      icon: Icons.cloud_off_rounded,
      headline: 'לא הצלחנו לטעון',
      subtitle: 'בדקו את החיבור ונסו שוב.',
      ctaLabel: 'נסו שוב',
      onCtaTap: onRetry,
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Labels + colours (Hebrew)
// ═══════════════════════════════════════════════════════════════════════════

String convStatusLabel(String s) => switch (s) {
      'open' => 'פתוחה',
      'bot' => 'בוט',
      'human' => 'נציג',
      'closed' => 'סגורה',
      _ => s,
    };

Color convStatusColor(String s, AppTheme t) => switch (s) {
      'open' => t.brandAccent,
      'bot' => t.info,
      'human' => t.saving,
      'closed' => t.secondaryText,
      _ => t.secondaryText,
    };

String contactStatusLabel(String s) => switch (s) {
      'new' => 'חדש',
      'active' => 'פעיל',
      'qualified' => 'מתאים',
      'handed_off' => 'הועבר לנציג',
      'won' => 'נסגר',
      'lost' => 'אבוד',
      'blocked' => 'חסום',
      _ => s,
    };

Color contactStatusColor(String s, AppTheme t) => switch (s) {
      'new' => t.brandAccent,
      'active' => t.info,
      'qualified' => t.brandAccentDark,
      'handed_off' => t.saving,
      'won' => t.saving,
      'lost' => t.secondaryText,
      'blocked' => t.error,
      _ => t.secondaryText,
    };

String leadStatusLabel(String s) => switch (s) {
      'new' => 'חדשים',
      'contacted' => 'נוצר קשר',
      'won' => 'נסגרו',
      'lost' => 'אבודים',
      _ => s,
    };

Color leadStatusColor(String s, AppTheme t) => switch (s) {
      'new' => t.brandAccent,
      'contacted' => t.info,
      'won' => t.saving,
      'lost' => t.secondaryText,
      _ => t.secondaryText,
    };

// ── Time helpers (lightweight, no intl locale dependency) ────────────────────

String _two(int n) => n.toString().padLeft(2, '0');

/// HH:MM in the device's local time — for message timestamps.
String _clockTime(DateTime dt) {
  final l = dt.toLocal();
  return '${_two(l.hour)}:${_two(l.minute)}';
}

/// A short relative label ("עכשיו" / "לפני 5 ד׳" / "לפני 3 ש׳" / date) for list rows.
String _relativeTime(DateTime dt) {
  final diff = DateTime.now().difference(dt.toLocal());
  if (diff.inMinutes < 1) return 'עכשיו';
  if (diff.inMinutes < 60) return 'לפני ${diff.inMinutes} ד׳';
  if (diff.inHours < 24) return 'לפני ${diff.inHours} ש׳';
  if (diff.inDays < 7) return 'לפני ${diff.inDays} י׳';
  final l = dt.toLocal();
  return '${_two(l.day)}/${_two(l.month)}';
}
