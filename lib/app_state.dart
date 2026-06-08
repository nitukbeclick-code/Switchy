import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'data.dart' show planById, planSaveYear;
import 'models.dart' show TrackedPlan;

class AppState extends ChangeNotifier {
  static AppState _instance = AppState._internal();
  static AppState get instance => _instance;
  factory AppState() => _instance;
  AppState._internal();
  static void reset() => _instance = AppState._internal();

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
    _trackerStep = p.getInt('trackerStep') ?? 0;
    // Watched plans
    final watched = p.getStringList('watchedPlans') ?? [];
    _watchedPlans.addAll(watched);
    // Recently viewed
    final recent = p.getStringList('recentlyViewed') ?? [];
    _recentlyViewed.addAll(recent);
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

  Future<void> _persist() async {
    final p = await SharedPreferences.getInstance();
    await p.setBool('isLoggedIn', _isLoggedIn);
    await p.setString('userName', _userName);
    await p.setString('userPhone', _userPhone);
    await p.setString('userEmail', _userEmail);
    await p.setInt('totalSavings', _totalSavings);
    await p.setString('selectedCat', _selectedCat);
    // Bills
    for (final e in _currentBills.entries) { await p.setInt('bill_${e.key}', e.value); }
    // Quiz
    await p.setBool('quizCompleted', _quizCompleted);
    await p.setInt('quizBudget', _quizBudget);
    await p.setString('quizPriority', _quizPriority);
    await p.setInt('quizLines', _quizLines);
    await p.setString('quizCat', _quizCat);
    await p.setBool('wants5G', _wants5G);
    await p.setBool('wantsAbroad', _wantsAbroad);
    await p.setBool('wantsNoCommit', _wantsNoCommit);
    // Lead & tracker
    if (_leadPlanId != null) await p.setString('leadPlanId', _leadPlanId!);
    if (_leadProvider != null) await p.setString('leadProvider', _leadProvider!);
    if (_leadName != null) await p.setString('leadName', _leadName!);
    if (_leadPhone != null) await p.setString('leadPhone', _leadPhone!);
    await p.setInt('trackerStep', _trackerStep);
    // Watched & recently viewed
    await p.setStringList('watchedPlans', _watchedPlans.toList());
    await p.setStringList('recentlyViewed', _recentlyViewed);
    await p.setString('userReviews', jsonEncode(_userReviews));
    await p.setString('communityPosts', jsonEncode(_communityPosts));
    await p.setStringList('likedPosts', _likedPosts.toList());
    await p.setStringList('bookmarkedPosts', _bookmarkedPosts.toList());
    await p.setString('communityReplies', jsonEncode(_communityReplies));
    await p.setString('chatHistory', jsonEncode(_chatHistory));
    await p.setString('advisorHistory', jsonEncode(_advisorHistory));
    await p.setString('myPlans', jsonEncode(_myPlans.map((e) => e.toJson()).toList()));
    await p.setBool('renewalReminders', _renewalReminders);
    // Preferences
    await p.setBool('prefPriceAlerts', _prefPriceAlerts);
    await p.setBool('prefRequestUpdates', _prefRequestUpdates);
    await p.setBool('prefCommunityNotifs', _prefCommunityNotifs);
    await p.setBool('seenOnboarding', _seenOnboarding);
  }

  void update(VoidCallback cb) { cb(); notifyListeners(); }

  // Category
  String _selectedCat = 'cellular';
  String get selectedCat => _selectedCat;
  void setCategory(String cat) { _selectedCat = cat; _activeFilters.clear(); _searchQuery = ''; notifyListeners(); _persist(); }

  // Plan selection
  String? _selectedPlanId;
  String? get selectedPlanId => _selectedPlanId;
  void selectPlan(String? id) { _selectedPlanId = id; notifyListeners(); }

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
  void setCurrentBill(String cat, int v) { _currentBills[cat] = v.clamp(0, 2000); notifyListeners(); _persist(); }
  void resetAllBills() { _currentBills.updateAll((_, __) => 0); notifyListeners(); _persist(); }

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
    final save = plan != null ? planSaveYear(plan, currentBill(plan.cat)) : 0;
    _totalSavings += save > 0 ? save : 540;
    notifyListeners(); _persist();
  }

  // Tracker
  int _trackerStep = 0;
  int get trackerStep => _trackerStep;
  void advanceTracker() { if (_trackerStep < 4) { _trackerStep++; notifyListeners(); _persist(); } }

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

  // Recently viewed plans
  final List<String> _recentlyViewed = [];
  List<String> get recentlyViewed => List.unmodifiable(_recentlyViewed);
  void viewPlan(String planId) {
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
  void addCommunityReply({required String postId, required String author, required String avatar, required String text}) {
    final list = _communityReplies.putIfAbsent(postId, () => []);
    list.add({'author': author, 'avatar': avatar, 'text': text, 'ts': DateTime.now().toIso8601String()});
    notifyListeners();
    _persist();
  }

  // Chat history — persisted support-chat messages
  final List<Map<String, dynamic>> _chatHistory = [];
  List<Map<String, dynamic>> get chatHistory => List.unmodifiable(_chatHistory);
  void addChatMessage({required String text, required bool isUser, bool isRead = true}) {
    _chatHistory.add({'text': text, 'isUser': isUser, 'isRead': isRead, 'ts': DateTime.now().toIso8601String()});
    if (_chatHistory.length > 100) _chatHistory.removeAt(0);
    notifyListeners();
    _persist();
  }
  void clearChatHistory() { _chatHistory.clear(); notifyListeners(); _persist(); }

  // Advisor history — persisted AI-advisor conversation messages
  final List<Map<String, dynamic>> _advisorHistory = [];
  List<Map<String, dynamic>> get advisorHistory => List.unmodifiable(_advisorHistory);
  void addAdvisorMessage({required String text, required bool isUser}) {
    _advisorHistory.add({'text': text, 'isUser': isUser, 'ts': DateTime.now().toIso8601String()});
    if (_advisorHistory.length > 100) _advisorHistory.removeAt(0);
    notifyListeners();
    _persist();
  }
  void clearAdvisorHistory() { _advisorHistory.clear(); notifyListeners(); _persist(); }

  // ── Renewal radar — the user's current plans + promo-end tracking ────────────
  final List<TrackedPlan> _myPlans = [];
  List<TrackedPlan> get myPlans => List.unmodifiable(_myPlans);

  bool _renewalReminders = false;
  bool get renewalReminders => _renewalReminders;
  void setRenewalReminders(bool v) { _renewalReminders = v; notifyListeners(); _persist(); }

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

  void addCommunityPost({required String id, required String author, required String avatar, required String channel, required String text}) {
    _communityPosts.insert(0, {'id': id, 'author': author, 'avatar': avatar, 'channel': channel, 'text': text, 'ts': DateTime.now().toIso8601String()});
    if (_communityPosts.length > 50) _communityPosts.removeLast();
    notifyListeners();
    _persist();
  }

  bool isOwnPost(String id) => _communityPosts.any((p) => p['id'] == id);

  void removeCommunityPost(String id) {
    _communityPosts.removeWhere((p) => p['id'] == id);
    _communityReplies.remove(id);
    _likedPosts.remove(id);
    _bookmarkedPosts.remove(id);
    notifyListeners();
    _persist();
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
