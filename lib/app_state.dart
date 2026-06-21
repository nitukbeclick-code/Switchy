import 'dart:async';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'data.dart' show planById;
import 'models.dart' show TrackedPlan;
import 'services/backend/backend.dart'
    show BookedMeeting, MeetingStatus, meetingStatusFromDb, meetingStatusToDb;
import 'services/savings_summary.dart' show savingsCreditedOnLead;

class AppState extends ChangeNotifier {
  static AppState _instance = AppState._internal();
  static AppState get instance => _instance;
  factory AppState() => _instance;
  AppState._internal();
  static void reset() => _instance = AppState._internal();

  /// The current Supabase auth user id, or null for an anonymous/guest session.
  String? get userId => Supabase.instance.client.auth.currentUser?.id;

  Future<void> initializePersistedState() async {
    final p = await SharedPreferences.getInstance();
    _isLoggedIn = p.getBool('isLoggedIn') ?? false;
    _userName = p.getString('userName') ?? '';
    _userPhone = p.getString('userPhone') ?? '';
    _userEmail = p.getString('userEmail') ?? '';
    _totalSavings = p.getInt('totalSavings') ?? 0;
    _selectedCat = p.getString('selectedCat') ?? 'cellular';
    // Bills
    _currentBills['cellular'] = p.getInt('bill_cellular') ?? 119;
    _currentBills['internet'] = p.getInt('bill_internet') ?? 140;
    _currentBills['tv'] = p.getInt('bill_tv') ?? 130;
    _currentBills['triple'] = p.getInt('bill_triple') ?? 260;
    _currentBills['abroad'] = p.getInt('bill_abroad') ?? 0;
    _billsPersonalized = p.getBool('billsPersonalized') ?? false;
    // Quiz
    _quizCompleted = p.getBool('quizCompleted') ?? false;
    _quizBudget = p.getInt('quizBudget') ?? 90;
    _quizPriority = p.getString('quizPriority') ?? 'price';
    _quizLines = p.getInt('quizLines') ?? 1;
    _quizCat = p.getString('quizCat') ?? 'cellular';
    _wants5G = p.getBool('wants5G') ?? false;
    _wantsAbroad = p.getBool('wantsAbroad') ?? false;
    _wantsNoCommit = p.getBool('wantsNoCommit') ?? false;
    // Lead & tracker
    _leadPlanId = p.getString('leadPlanId');
    _leadProvider = p.getString('leadProvider');
    _leadName = p.getString('leadName');
    _leadPhone = p.getString('leadPhone');
    _leadEmail = p.getString('leadEmail');
    _leadCallbackTime = p.getString('leadCallbackTime');
    _trackerStep = p.getInt('trackerStep') ?? 0;
    // Booked video meeting (Zoom)
    _meetingId = p.getString('meetingId');
    _meetingProvider = p.getString('meetingProvider');
    _meetingDate = p.getString('meetingDate');
    _meetingSlot = p.getString('meetingSlot');
    _meetingStatus = p.getString('meetingStatus');
    _meetingJoinUrl = p.getString('meetingJoinUrl');
    _meetingStartsAtIso = p.getString('meetingStartsAtIso');
    _meetingCreatedAtIso = p.getString('meetingCreatedAtIso');
    // Telegram notifications
    _userTelegramChatId = p.getString('userTelegramChatId') ?? '';
    _telegramEnabled = p.getBool('telegramEnabled') ?? false;
    // Support ticket
    _supportTicketId = p.getString('supportTicketId');
    // Watched plans
    final watched = p.getStringList('watchedPlans') ?? [];
    _watchedPlans.addAll(watched);
    // Recently viewed
    final recent = p.getStringList('recentlyViewed') ?? [];
    _recentlyViewed.addAll(recent);
    // Recent searches
    _recentSearches.addAll(p.getStringList('recentSearches') ?? const []);
    // User reviews
    final reviewsJson = p.getString('userReviews');
    if (reviewsJson != null) {
      final list = jsonDecode(reviewsJson) as List<dynamic>;
      _userReviews.addAll(list.cast<Map<String, dynamic>>());
    }
    // Community posts
    final postsJson = p.getString('communityPosts');
    if (postsJson != null) {
      final list = jsonDecode(postsJson) as List<dynamic>;
      _communityPosts.addAll(list.cast<Map<String, dynamic>>());
    }
    // Liked posts
    final liked = p.getStringList('likedPosts') ?? [];
    _likedPosts.addAll(liked);
    // Bookmarked posts
    final bookmarks = p.getStringList('bookmarkedPosts') ?? [];
    _bookmarkedPosts.addAll(bookmarks);
    // Community replies (postId -> list of reply maps)
    final repliesJson = p.getString('communityReplies');
    if (repliesJson != null) {
      final decoded = jsonDecode(repliesJson) as Map<String, dynamic>;
      decoded.forEach((postId, value) {
        _communityReplies[postId] = (value as List).cast<Map<String, dynamic>>();
      });
    }
    // Chat history
    final chatHistoryJson = p.getString('chatHistory');
    if (chatHistoryJson != null) {
      final list = jsonDecode(chatHistoryJson) as List<dynamic>;
      _chatHistory.addAll(list.cast<Map<String, dynamic>>());
    }
    // My plans (renewal radar) + reminder consent
    final myPlansJson = p.getString('myPlans');
    if (myPlansJson != null) {
      final list = jsonDecode(myPlansJson) as List<dynamic>;
      _myPlans.addAll(list.map((e) => TrackedPlan.fromJson((e as Map).cast<String, dynamic>())));
    }
    _renewalReminders = p.getBool('renewalReminders') ?? false;
    _themeMode = _themeModeFromKey(p.getString('themeMode'));
    _dismissedNotifications.addAll(p.getStringList('dismissedNotifications') ?? const []);
    // Advisor history
    final advisorHistoryJson = p.getString('advisorHistory');
    if (advisorHistoryJson != null) {
      final list = jsonDecode(advisorHistoryJson) as List<dynamic>;
      _advisorHistory.addAll(list.cast<Map<String, dynamic>>());
    }
    // Preferences
    _prefPriceAlerts = p.getBool('prefPriceAlerts') ?? true;
    _prefRequestUpdates = p.getBool('prefRequestUpdates') ?? true;
    _prefCommunityNotifs = p.getBool('prefCommunityNotifs') ?? false;
    _seenOnboarding = p.getBool('seenOnboarding') ?? false;
    notifyListeners();
  }

  // ── Incremental persistence ──────────────────────────────────────────────
  // Writing every SharedPreferences key on every mutation re-serialized all the
  // base64 community/chat/advisor blobs on a single like or keystroke — slow,
  // and on web it blew localStorage's ~5MB quota once a few photo posts existed.
  // Instead each setter marks the logical group(s) it touched via [_markDirty];
  // a microtask-debounced [_flush] then writes ONLY the dirty groups' keys.
  // The write logic per group is byte-for-byte identical to the old _persist(),
  // so stored data and _load() are unchanged — only *when* a key is written.
  final Set<String> _dirtyKeys = {};
  bool _flushScheduled = false;

  /// Record that [key]'s logical group changed and schedule a single debounced
  /// disk flush. Notifications are independent of this — callers still invoke
  /// notifyListeners() themselves so the UI updates synchronously.
  void _markDirty(String key) {
    _dirtyKeys.add(key);
    if (_flushScheduled) return;
    _flushScheduled = true;
    scheduleMicrotask(_flush);
  }

  /// Write the entries for every dirty group, then clear the dirty set. Only
  /// the keys whose group was marked since the last flush touch the disk, so an
  /// unrelated like/search/bill never rewrites the heavy base64 collections.
  Future<void> _flush() async {
    _flushScheduled = false;
    if (_dirtyKeys.isEmpty) return;
    final dirty = _dirtyKeys.toSet();
    _dirtyKeys.clear();
    // Guard the disk writes: on web, localStorage has a ~5MB quota and a setter
    // can throw QuotaExceededError once base64 media accumulates. Swallowing it
    // here keeps the app alive (the in-memory state is still correct; the write
    // is simply dropped) instead of crashing on an otherwise harmless mutation.
    try {
    final p = await SharedPreferences.getInstance();
    for (final key in dirty) {
      switch (key) {
        case 'auth':
          await p.setBool('isLoggedIn', _isLoggedIn);
          await p.setString('userName', _userName);
          await p.setString('userPhone', _userPhone);
          await p.setString('userEmail', _userEmail);
          break;
        case 'totalSavings':
          await p.setInt('totalSavings', _totalSavings);
          break;
        case 'selectedCat':
          await p.setString('selectedCat', _selectedCat);
          break;
        case 'bills':
          for (final e in _currentBills.entries) { await p.setInt('bill_${e.key}', e.value); }
          await p.setBool('billsPersonalized', _billsPersonalized);
          break;
        case 'quiz':
          await p.setBool('quizCompleted', _quizCompleted);
          await p.setInt('quizBudget', _quizBudget);
          await p.setString('quizPriority', _quizPriority);
          await p.setInt('quizLines', _quizLines);
          await p.setString('quizCat', _quizCat);
          break;
        case 'quizNeeds':
          await p.setBool('wants5G', _wants5G);
          await p.setBool('wantsAbroad', _wantsAbroad);
          await p.setBool('wantsNoCommit', _wantsNoCommit);
          break;
        case 'lead':
          if (_leadPlanId != null) await p.setString('leadPlanId', _leadPlanId!);
          if (_leadProvider != null) await p.setString('leadProvider', _leadProvider!);
          if (_leadName != null) await p.setString('leadName', _leadName!);
          if (_leadPhone != null) await p.setString('leadPhone', _leadPhone!);
          if (_leadEmail != null) await p.setString('leadEmail', _leadEmail!);
          if (_leadCallbackTime != null) await p.setString('leadCallbackTime', _leadCallbackTime!);
          break;
        case 'meeting':
          // null = cleared meeting → remove the key (unlike lead's append-only
          // fields, a meeting is replaced/cleared as one unit).
          for (final e in {
            'meetingId': _meetingId,
            'meetingProvider': _meetingProvider,
            'meetingDate': _meetingDate,
            'meetingSlot': _meetingSlot,
            'meetingStatus': _meetingStatus,
            'meetingJoinUrl': _meetingJoinUrl,
            'meetingStartsAtIso': _meetingStartsAtIso,
            'meetingCreatedAtIso': _meetingCreatedAtIso,
          }.entries) {
            if (e.value == null) {
              await p.remove(e.key);
            } else {
              await p.setString(e.key, e.value!);
            }
          }
          break;
        case 'telegram':
          if (_userTelegramChatId.isEmpty) {
            await p.remove('userTelegramChatId');
            await p.remove('telegramEnabled');
          } else {
            await p.setString('userTelegramChatId', _userTelegramChatId);
            await p.setBool('telegramEnabled', _telegramEnabled);
          }
          break;
        case 'supportTicket':
          if (_supportTicketId == null) {
            await p.remove('supportTicketId');
          } else {
            await p.setString('supportTicketId', _supportTicketId!);
          }
          break;
        case 'trackerStep':
          await p.setInt('trackerStep', _trackerStep);
          break;
        case 'watchedPlans':
          await p.setStringList('watchedPlans', _watchedPlans.toList());
          break;
        case 'recentlyViewed':
          await p.setStringList('recentlyViewed', _recentlyViewed);
          break;
        case 'recentSearches':
          await p.setStringList('recentSearches', _recentSearches);
          break;
        case 'userReviews':
          await p.setString('userReviews', jsonEncode(_userReviews));
          break;
        case 'communityPosts':
          await p.setString('communityPosts', jsonEncode(_communityPosts));
          break;
        case 'likedPosts':
          await p.setStringList('likedPosts', _likedPosts.toList());
          break;
        case 'bookmarkedPosts':
          await p.setStringList('bookmarkedPosts', _bookmarkedPosts.toList());
          break;
        case 'communityReplies':
          await p.setString('communityReplies', jsonEncode(_communityReplies));
          break;
        case 'chatHistory':
          await p.setString('chatHistory', jsonEncode(_chatHistory));
          break;
        case 'advisorHistory':
          await p.setString('advisorHistory', jsonEncode(_advisorHistory));
          break;
        case 'myPlans':
          await p.setString('myPlans', jsonEncode(_myPlans.map((e) => e.toJson()).toList()));
          break;
        case 'renewalReminders':
          await p.setBool('renewalReminders', _renewalReminders);
          break;
        case 'themeMode':
          await p.setString('themeMode', _themeModeKey(_themeMode));
          break;
        case 'dismissedNotifications':
          await p.setStringList('dismissedNotifications', _dismissedNotifications.toList());
          break;
        case 'prefs':
          await p.setBool('prefPriceAlerts', _prefPriceAlerts);
          await p.setBool('prefRequestUpdates', _prefRequestUpdates);
          await p.setBool('prefCommunityNotifs', _prefCommunityNotifs);
          break;
        case 'seenOnboarding':
          await p.setBool('seenOnboarding', _seenOnboarding);
          break;
      }
    }
    } catch (e) {
      // Persistence is best-effort — never let a storage failure (e.g. a web
      // QuotaExceededError) propagate and crash the app.
      debugPrint('AppState._flush: persistence write skipped: $e');
    }
  }

  /// Test/diagnostic hook: synchronously drain any pending debounced writes.
  /// Production code never needs this — the microtask flush runs on its own.
  @visibleForTesting
  Future<void> flushPersistence() => _flush();

  // The "light" groups: scalars and small StringLists/JSON. The four heavy
  // collections (communityPosts, communityReplies, chatHistory, advisorHistory)
  // can carry base64 media, so they are deliberately EXCLUDED here and written
  // only by their own setters via _markDirty — a like/search/bill must never
  // re-serialize a photo blob. [_persist] is the catch-all the light setters
  // call; it marks every light group dirty (each write is cheap).
  static const Set<String> _lightGroups = {
    'auth', 'totalSavings', 'selectedCat', 'bills', 'quiz', 'quizNeeds', 'lead',
    'meeting', 'telegram', 'supportTicket',
    'trackerStep', 'watchedPlans', 'recentlyViewed', 'recentSearches',
    'userReviews', 'likedPosts', 'bookmarkedPosts', 'myPlans',
    'renewalReminders', 'themeMode', 'dismissedNotifications', 'prefs',
    'seenOnboarding',
  };

  // ── Theme-mode (de)serialization ──────────────────────────────────────────
  static String _themeModeKey(ThemeMode m) {
    switch (m) {
      case ThemeMode.light:
        return 'light';
      case ThemeMode.dark:
        return 'dark';
      case ThemeMode.system:
        return 'system';
    }
  }

  static ThemeMode _themeModeFromKey(String? k) {
    switch (k) {
      case 'light':
        return ThemeMode.light;
      case 'dark':
        return ThemeMode.dark;
      default:
        return ThemeMode.system;
    }
  }
  void _persist() {
    for (final k in _lightGroups) {
      _markDirty(k);
    }
  }

  void update(VoidCallback cb) { cb(); notifyListeners(); }

  // Category
  String _selectedCat = 'cellular';
  String get selectedCat => _selectedCat;
  void setCategory(String cat) { _selectedCat = cat; _activeFilters.clear(); _searchQuery = ''; notifyListeners(); _persist(); }

  // Compare
  final List<String> _comparePlans = [];
  List<String> get comparePlans => List.unmodifiable(_comparePlans);
  bool isInCompare(String id) => _comparePlans.contains(id);
  void toggleCompare(String id) {
    if (_comparePlans.contains(id)) {
      _comparePlans.remove(id);
    } else if (_comparePlans.length < 3) {
      _comparePlans.add(id);
    }
    notifyListeners();
  }
  void clearCompare() { _comparePlans.clear(); notifyListeners(); }

  // Bills
  final Map<String, int> _currentBills = {'cellular': 119, 'internet': 140, 'tv': 130, 'triple': 260, 'abroad': 0};
  Map<String, int> get currentBills => Map.unmodifiable(_currentBills);
  int currentBill(String cat) => _currentBills[cat] ?? 0;
  void setCurrentBill(String cat, int v) { _currentBills[cat] = v.clamp(0, 2000); _billsPersonalized = true; notifyListeners(); _persist(); }
  void resetAllBills() { _currentBills.updateAll((_, __) => 0); _billsPersonalized = false; notifyListeners(); _persist(); }

  /// True once the user has entered at least one real bill (via the quiz or the
  /// bills editor), so savings figures reflect them — not the seed defaults.
  bool _billsPersonalized = false;
  bool get billsPersonalized => _billsPersonalized;

  // Quiz
  int _quizLines = 1; String _quizPriority = 'price'; int _quizBudget = 90; bool _quizCompleted = false; String _quizCat = 'cellular';
  int get quizLines => _quizLines;
  String get quizPriority => _quizPriority;
  int get quizBudget => _quizBudget;
  bool get quizCompleted => _quizCompleted;
  String get quizCat => _quizCat;
  void setQuizLines(int v) { _quizLines = v; notifyListeners(); _persist(); }
  void setQuizPriority(String v) { _quizPriority = v; notifyListeners(); _persist(); }
  void setQuizBudget(int v) { _quizBudget = v; notifyListeners(); _persist(); }
  void setQuizCompleted(bool v) { _quizCompleted = v; notifyListeners(); _persist(); }
  void setQuizCat(String v) { _quizCat = v; notifyListeners(); _persist(); }

  // Quiz-derived needs — soft preferences the recommendation engine rewards
  // (each only bonuses a plan that actually has the attribute), persisted so
  // every screen's match profile reflects them, not just the quiz.
  bool _wants5G = false, _wantsAbroad = false, _wantsNoCommit = false;
  bool get wants5G => _wants5G;
  bool get wantsAbroad => _wantsAbroad;
  bool get wantsNoCommit => _wantsNoCommit;
  void setQuizNeeds({required bool wants5G, required bool wantsAbroad, required bool wantsNoCommit}) {
    _wants5G = wants5G;
    _wantsAbroad = wantsAbroad;
    _wantsNoCommit = wantsNoCommit;
    notifyListeners();
    _persist();
  }

  // Auth
  bool _isLoggedIn = false; String _userName = ''; String _userPhone = ''; String _userEmail = '';
  bool get isLoggedIn => _isLoggedIn;
  String get userName => _userName;
  String get userPhone => _userPhone;
  String get userEmail => _userEmail;
  String get firstName => _userName.isNotEmpty ? _userName.split(' ').first : 'אורח';
  void login({required String name, required String phone, String email = ''}) { _isLoggedIn = true; _userName = name; _userPhone = phone; _userEmail = email; notifyListeners(); _persist(); }
  void logout() { _isLoggedIn = false; _userName = ''; _userPhone = ''; _userEmail = ''; notifyListeners(); _persist(); }

  // Lead
  String? _leadName; String? _leadPhone; String? _leadProvider; String? _leadPlanId; String? _leadEmail; String? _leadCallbackTime;
  String? get leadName => _leadName;
  String? get leadPhone => _leadPhone;
  String? get leadProvider => _leadProvider;
  String? get leadPlanId => _leadPlanId;
  String? get leadEmail => _leadEmail;
  String? get leadCallbackTime => _leadCallbackTime;
  void submitLead({required String name, required String phone, required String provider, required String planId, String email = '', String callbackTime = 'now'}) {
    _leadName = name; _leadPhone = phone; _leadProvider = provider; _leadPlanId = planId; _leadEmail = email; _leadCallbackTime = callbackTime;
    _trackerStep = 1;
    final plan = planById(planId);
    _totalSavings += savingsCreditedOnLead(plan, plan != null ? currentBill(plan.cat) : 0);
    notifyListeners(); _persist();
  }

  // ── Booked video meeting (Zoom) ─────────────────────────────────────────────
  // One open meeting at a time (mirrors the server's one-pending-per-phone
  // constraint). Stored flat so the status card, computeNotifications and the
  // push scheduler stay pure over AppState and survive cold starts.
  String? _meetingId, _meetingProvider, _meetingDate, _meetingSlot,
      _meetingStatus, _meetingJoinUrl, _meetingStartsAtIso, _meetingCreatedAtIso;

  BookedMeeting? get bookedMeeting {
    if (_meetingId == null || _meetingDate == null || _meetingSlot == null) return null;
    return BookedMeeting(
      id: _meetingId!,
      status: meetingStatusFromDb(_meetingStatus),
      provider: _meetingProvider,
      meetingDate: _meetingDate!,
      slot: _meetingSlot!,
      startsAt: DateTime.tryParse(_meetingStartsAtIso ?? '')?.toUtc() ??
          DateTime.now().toUtc(),
      joinUrl: _meetingJoinUrl,
      createdAt: DateTime.tryParse(_meetingCreatedAtIso ?? '') ?? DateTime.now(),
    );
  }

  void setBookedMeeting(BookedMeeting m) {
    _meetingId = m.id;
    _meetingProvider = m.provider;
    _meetingDate = m.meetingDate;
    _meetingSlot = m.slot;
    _meetingStatus = meetingStatusToDb(m.status);
    _meetingJoinUrl = m.joinUrl;
    _meetingStartsAtIso = m.startsAt.toIso8601String();
    _meetingCreatedAtIso = m.createdAt.toIso8601String();
    _markDirty('meeting');
    notifyListeners();
  }

  void updateMeetingStatus(MeetingStatus status, {String? joinUrl}) {
    if (_meetingId == null) return;
    _meetingStatus = meetingStatusToDb(status);
    if (joinUrl != null) _meetingJoinUrl = joinUrl;
    _markDirty('meeting');
    notifyListeners();
  }

  void clearBookedMeeting() {
    _meetingId = null;
    _meetingProvider = null;
    _meetingDate = null;
    _meetingSlot = null;
    _meetingStatus = null;
    _meetingJoinUrl = null;
    _meetingStartsAtIso = null;
    _meetingCreatedAtIso = null;
    _markDirty('meeting');
    notifyListeners();
  }

  // ── Telegram Notifications ─────────────────────────────────────────────────
  String _userTelegramChatId = '';
  bool _telegramEnabled = false;

  String get userTelegramChatId => _userTelegramChatId;
  bool get telegramEnabled => _telegramEnabled;

  // ── Support Ticket ──────────────────────────────────────────────────────────
  String? _supportTicketId;

  String? get supportTicketId => _supportTicketId;

  void setSupportTicketId(String? id) {
    _supportTicketId = id;
    _markDirty('supportTicket');
    notifyListeners();
  }

  void setUserTelegramChatId(String chatId, {bool enabled = true}) {
    _userTelegramChatId = chatId;
    _telegramEnabled = enabled;
    _markDirty('telegram');
    notifyListeners();
    _persist();
  }

  void setTelegramEnabled(bool enabled) {
    _telegramEnabled = enabled;
    _markDirty('telegram');
    notifyListeners();
    _persist();
  }

  void clearTelegramData() {
    _userTelegramChatId = '';
    _telegramEnabled = false;
    _markDirty('telegram');
    notifyListeners();
    _persist();
  }

  // Tracker
  int _trackerStep = 0;
  int get trackerStep => _trackerStep;
  void advanceTracker() { if (_trackerStep < 4) { _trackerStep++; notifyListeners(); _persist(); } }
  void setTrackerStep(int step) { if (step > _trackerStep && step <= 4) { _trackerStep = step; notifyListeners(); _persist(); } }

  // Savings
  int _totalSavings = 0;
  int get totalSavings => _totalSavings;
  void addSavings(int amount) { _totalSavings += amount; notifyListeners(); _persist(); }

  // Search & Filter
  String _searchQuery = ''; String _sortMode = 'match'; final List<String> _activeFilters = [];
  String get searchQuery => _searchQuery;
  String get sortMode => _sortMode;
  List<String> get activeFilters => List.unmodifiable(_activeFilters);
  void setSearch(String q) { _searchQuery = q; notifyListeners(); }
  void setSortMode(String m) { _sortMode = m; notifyListeners(); }
  void toggleFilter(String f) { if (_activeFilters.contains(f)) {
    _activeFilters.remove(f);
  } else {
    _activeFilters.add(f);
  } notifyListeners(); }
  void clearFilters() { _activeFilters.clear(); _sortMode = 'match'; _searchQuery = ''; notifyListeners(); }

  // Watchlist (price alerts)
  final Set<String> _watchedPlans = {};
  List<String> get watchedPlans => List.unmodifiable(_watchedPlans.toList());
  bool isWatching(String planId) => _watchedPlans.contains(planId);
  void toggleWatch(String planId) {
    if (_watchedPlans.contains(planId)) {
      _watchedPlans.remove(planId);
    } else {
      _watchedPlans.add(planId);
    }
    notifyListeners();
    _persist();
  }

  // Recent search queries (most-recent-first, deduped, capped)
  final List<String> _recentSearches = [];
  List<String> get recentSearches => List.unmodifiable(_recentSearches);
  void addRecentSearch(String q) {
    final t = q.trim();
    if (t.isEmpty) return;
    _recentSearches.remove(t);
    _recentSearches.insert(0, t);
    if (_recentSearches.length > 8) _recentSearches.removeLast();
    notifyListeners();
    _persist();
  }
  void clearRecentSearches() { _recentSearches.clear(); notifyListeners(); _persist(); }

  // Recently viewed plans
  final List<String> _recentlyViewed = [];
  List<String> get recentlyViewed => List.unmodifiable(_recentlyViewed);
  void viewPlan(String planId) {
    // No-op when already the most recent view — avoids a notify/persist storm
    // if a visible page records the view on every rebuild.
    if (_recentlyViewed.isNotEmpty && _recentlyViewed.first == planId) return;
    _recentlyViewed.remove(planId);
    _recentlyViewed.insert(0, planId);
    if (_recentlyViewed.length > 6) _recentlyViewed.removeLast();
    notifyListeners();
    _persist();
  }

  // User preferences
  bool _prefPriceAlerts = true;
  bool _prefRequestUpdates = true;
  bool _prefCommunityNotifs = false;
  bool get prefPriceAlerts => _prefPriceAlerts;
  bool get prefRequestUpdates => _prefRequestUpdates;
  bool get prefCommunityNotifs => _prefCommunityNotifs;
  void setPrefPriceAlerts(bool v) { _prefPriceAlerts = v; notifyListeners(); _persist(); }
  void setPrefRequestUpdates(bool v) { _prefRequestUpdates = v; notifyListeners(); _persist(); }
  void setPrefCommunityNotifs(bool v) { _prefCommunityNotifs = v; notifyListeners(); _persist(); }

  // Onboarding
  bool _seenOnboarding = false;
  bool get seenOnboarding => _seenOnboarding;
  void markOnboardingSeen() { _seenOnboarding = true; _persist(); }

  // User reviews
  final List<Map<String, dynamic>> _userReviews = [];
  List<Map<String, dynamic>> get userReviews => List.unmodifiable(_userReviews);
  bool hasReviewedProvider(String provider) => _userReviews.any((r) => r['provider'] == provider);
  Map<String, dynamic>? reviewFor(String provider) => _userReviews.where((r) => r['provider'] == provider).firstOrNull;
  // Community posts (user-submitted, persisted)
  final List<Map<String, dynamic>> _communityPosts = [];
  List<Map<String, dynamic>> get communityPosts => List.unmodifiable(_communityPosts);
  // Liked posts
  final Set<String> _likedPosts = {};
  bool hasLiked(String postId) => _likedPosts.contains(postId);
  void toggleLike(String postId) {
    if (_likedPosts.contains(postId)) {
      _likedPosts.remove(postId);
    } else {
      _likedPosts.add(postId);
    }
    notifyListeners();
    _persist();
  }

  // Bookmarked posts (saved for later, persisted)
  final Set<String> _bookmarkedPosts = {};
  List<String> get bookmarkedPosts => List.unmodifiable(_bookmarkedPosts);
  bool isBookmarked(String postId) => _bookmarkedPosts.contains(postId);
  void toggleBookmark(String postId) {
    if (_bookmarkedPosts.contains(postId)) {
      _bookmarkedPosts.remove(postId);
    } else {
      _bookmarkedPosts.add(postId);
    }
    notifyListeners();
    _persist();
  }

  // Community replies — keyed by post id, persisted across sessions.
  final Map<String, List<Map<String, dynamic>>> _communityReplies = {};
  Map<String, List<Map<String, dynamic>>> get communityReplies => Map.unmodifiable(_communityReplies);
  List<Map<String, dynamic>> repliesFor(String postId) => List.unmodifiable(_communityReplies[postId] ?? const []);
  int replyCountFor(String postId) => _communityReplies[postId]?.length ?? 0;
  void addCommunityReply({required String postId, required String author, required String avatar, required String text, String? mediaType, String? mediaData, int? mediaDurationMs}) {
    final list = _communityReplies.putIfAbsent(postId, () => []);
    list.add({
      'author': author,
      'avatar': avatar,
      'text': text,
      'ts': DateTime.now().toIso8601String(),
      'mediaType': mediaType,
      'mediaData': mediaData,
      'mediaDurationMs': mediaDurationMs,
    });
    notifyListeners();
    _markDirty('communityReplies');
  }

  // Chat history — persisted support-chat messages
  final List<Map<String, dynamic>> _chatHistory = [];
  List<Map<String, dynamic>> get chatHistory => List.unmodifiable(_chatHistory);
  void addChatMessage({required String text, required bool isUser, bool isRead = true}) {
    _chatHistory.add({'text': text, 'isUser': isUser, 'isRead': isRead, 'ts': DateTime.now().toIso8601String()});
    if (_chatHistory.length > 100) _chatHistory.removeAt(0);
    notifyListeners();
    _markDirty('chatHistory');
  }
  void clearChatHistory() { _chatHistory.clear(); notifyListeners(); _markDirty('chatHistory'); }

  // Advisor history — persisted AI-advisor conversation messages
  final List<Map<String, dynamic>> _advisorHistory = [];
  List<Map<String, dynamic>> get advisorHistory => List.unmodifiable(_advisorHistory);
  void addAdvisorMessage({required String text, required bool isUser}) {
    _advisorHistory.add({'text': text, 'isUser': isUser, 'ts': DateTime.now().toIso8601String()});
    if (_advisorHistory.length > 100) _advisorHistory.removeAt(0);
    notifyListeners();
    _markDirty('advisorHistory');
  }
  void clearAdvisorHistory() { _advisorHistory.clear(); notifyListeners(); _markDirty('advisorHistory'); }

  // ── Renewal radar — the user's current plans + promo-end tracking ────────────
  final List<TrackedPlan> _myPlans = [];
  List<TrackedPlan> get myPlans => List.unmodifiable(_myPlans);

  /// The tracked plan with [id], or null if it was removed.
  TrackedPlan? trackedPlanById(String id) {
    for (final p in _myPlans) {
      if (p.id == id) return p;
    }
    return null;
  }

  bool _renewalReminders = false;
  bool get renewalReminders => _renewalReminders;
  void setRenewalReminders(bool v) { _renewalReminders = v; notifyListeners(); _persist(); }

  // Theme mode (system/light/dark) — persisted so the app reopens in the user's
  // chosen appearance. Stored as a string key; defaults to follow the OS.
  ThemeMode _themeMode = ThemeMode.system;
  ThemeMode get themeMode => _themeMode;
  void setThemeMode(ThemeMode v) { _themeMode = v; notifyListeners(); _persist(); }

  void addMyPlan({
    required String category,
    required String provider,
    required String planName,
    required int monthlyPrice,
    String? promoEndDate,
    bool joinedViaUs = false,
  }) {
    _myPlans.insert(0, TrackedPlan(
      id: DateTime.now().millisecondsSinceEpoch.toString(),
      category: category,
      provider: provider,
      planName: planName,
      monthlyPrice: monthlyPrice,
      promoEndDate: promoEndDate,
      joinedViaUs: joinedViaUs,
    ));
    notifyListeners();
    _persist();
  }

  void removeMyPlan(String id) {
    _myPlans.removeWhere((p) => p.id == id);
    notifyListeners();
    _persist();
  }

  /// The tracked plan whose promo ends soonest in the future (>= today).
  TrackedPlan? get nextRenewal {
    TrackedPlan? best;
    int? bestDays;
    for (final p in _myPlans) {
      final d = p.daysUntilRenewal;
      if (d == null || d < 0) continue;
      if (bestDays == null || d < bestDays) {
        bestDays = d;
        best = p;
      }
    }
    return best;
  }

  // Notification center — dismissed notification keys (computed alerts the user cleared).
  final Set<String> _dismissedNotifications = {};
  bool isNotificationDismissed(String id) => _dismissedNotifications.contains(id);
  void dismissNotification(String id) { _dismissedNotifications.add(id); notifyListeners(); _persist(); }

  void addCommunityPost({required String id, required String author, required String avatar, required String channel, required String text, String? mediaType, String? mediaData, int? mediaDurationMs}) {
    _communityPosts.insert(0, {
      'id': id,
      'author': author,
      'avatar': avatar,
      'channel': channel,
      'text': text,
      'ts': DateTime.now().toIso8601String(),
      'mediaType': mediaType,
      'mediaData': mediaData,
      'mediaDurationMs': mediaDurationMs,
    });
    if (_communityPosts.length > 50) _communityPosts.removeLast();
    notifyListeners();
    _markDirty('communityPosts');
  }

  bool isOwnPost(String id) => _communityPosts.any((p) => p['id'] == id);

  void removeCommunityPost(String id) {
    _communityPosts.removeWhere((p) => p['id'] == id);
    _communityReplies.remove(id);
    _likedPosts.remove(id);
    _bookmarkedPosts.remove(id);
    notifyListeners();
    _markDirty('communityPosts');
    _markDirty('communityReplies');
    _markDirty('likedPosts');
    _markDirty('bookmarkedPosts');
  }

  void addReview({required String provider, required int overall, required Map<String, int> subRatings, required String text}) {
    _userReviews.removeWhere((r) => r['provider'] == provider);
    _userReviews.insert(0, {
      'provider': provider,
      'overall': overall,
      'price': subRatings['price'] ?? 0,
      'service': subRatings['service'] ?? 0,
      'coverage': subRatings['coverage'] ?? 0,
      'speed': subRatings['speed'] ?? 0,
      'text': text,
      'ts': DateTime.now().toIso8601String(),
    });
    notifyListeners();
    _persist();
  }
}
