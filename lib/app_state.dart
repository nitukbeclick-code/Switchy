import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

class FFAppState extends ChangeNotifier {
  static FFAppState _instance = FFAppState._internal();
  static FFAppState get instance => _instance;
  factory FFAppState() => _instance;
  FFAppState._internal();
  static void reset() => _instance = FFAppState._internal();

  Future<void> initializePersistedState() async {
    final p = await SharedPreferences.getInstance();
    _isLoggedIn = p.getBool('isLoggedIn') ?? false;
    _userName = p.getString('userName') ?? '';
    _userPhone = p.getString('userPhone') ?? '';
    _totalSavings = p.getInt('totalSavings') ?? 0;
    _selectedCat = p.getString('selectedCat') ?? 'cellular';
    notifyListeners();
  }

  Future<void> _persist() async {
    final p = await SharedPreferences.getInstance();
    await p.setBool('isLoggedIn', _isLoggedIn);
    await p.setString('userName', _userName);
    await p.setString('userPhone', _userPhone);
    await p.setInt('totalSavings', _totalSavings);
    await p.setString('selectedCat', _selectedCat);
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
    if (_comparePlans.contains(id)) _comparePlans.remove(id);
    else if (_comparePlans.length < 3) _comparePlans.add(id);
    notifyListeners();
  }
  void clearCompare() { _comparePlans.clear(); notifyListeners(); }

  // Bills
  final Map<String, int> _currentBills = {'cellular': 119, 'internet': 140, 'tv': 130, 'triple': 260, 'abroad': 0};
  Map<String, int> get currentBills => Map.unmodifiable(_currentBills);
  int currentBill(String cat) => _currentBills[cat] ?? 0;
  void setCurrentBill(String cat, int v) { _currentBills[cat] = v.clamp(0, 2000); notifyListeners(); }

  // Quiz
  int _quizLines = 1; String _quizPriority = 'price'; int _quizBudget = 90; bool _quizCompleted = false;
  int get quizLines => _quizLines;
  String get quizPriority => _quizPriority;
  int get quizBudget => _quizBudget;
  bool get quizCompleted => _quizCompleted;
  void setQuizLines(int v) { _quizLines = v; notifyListeners(); }
  void setQuizPriority(String v) { _quizPriority = v; notifyListeners(); }
  void setQuizBudget(int v) { _quizBudget = v; notifyListeners(); }
  void setQuizCompleted(bool v) { _quizCompleted = v; notifyListeners(); }

  // Auth
  bool _isLoggedIn = false; String _userName = ''; String _userPhone = '';
  bool get isLoggedIn => _isLoggedIn;
  String get userName => _userName;
  String get userPhone => _userPhone;
  String get firstName => _userName.isNotEmpty ? _userName.split(' ').first : 'אורח';
  void login({required String name, required String phone}) { _isLoggedIn = true; _userName = name; _userPhone = phone; notifyListeners(); _persist(); }
  void logout() { _isLoggedIn = false; _userName = ''; _userPhone = ''; notifyListeners(); _persist(); }

  // Lead
  String? _leadName; String? _leadPhone; String? _leadProvider; String? _leadPlanId;
  String? get leadName => _leadName;
  String? get leadPhone => _leadPhone;
  String? get leadProvider => _leadProvider;
  String? get leadPlanId => _leadPlanId;
  void submitLead({required String name, required String phone, required String provider, required String planId}) {
    _leadName = name; _leadPhone = phone; _leadProvider = provider; _leadPlanId = planId;
    _trackerStep = 1; _totalSavings += 540; notifyListeners(); _persist();
  }

  // Tracker
  int _trackerStep = 0;
  int get trackerStep => _trackerStep;
  void advanceTracker() { if (_trackerStep < 3) { _trackerStep++; notifyListeners(); } }

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
  void toggleFilter(String f) { if (_activeFilters.contains(f)) _activeFilters.remove(f); else _activeFilters.add(f); notifyListeners(); }
  void clearFilters() { _activeFilters.clear(); _sortMode = 'match'; _searchQuery = ''; notifyListeners(); }

  // Watchlist (price alerts)
  final Set<String> _watchedPlans = {};
  List<String> get watchedPlans => List.unmodifiable(_watchedPlans.toList());
  bool isWatching(String planId) => _watchedPlans.contains(planId);
  void toggleWatch(String planId) {
    if (_watchedPlans.contains(planId)) _watchedPlans.remove(planId);
    else _watchedPlans.add(planId);
    notifyListeners();
  }

  // Recently viewed plans
  final List<String> _recentlyViewed = [];
  List<String> get recentlyViewed => List.unmodifiable(_recentlyViewed);
  void viewPlan(String planId) {
    _recentlyViewed.remove(planId);
    _recentlyViewed.insert(0, planId);
    if (_recentlyViewed.length > 6) _recentlyViewed.removeLast();
    notifyListeners();
  }
}
