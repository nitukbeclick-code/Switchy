import 'package:flutter/material.dart';
import 'data.dart';
import 'models.dart';

class AppState extends ChangeNotifier {
  String _cat = 'cellular';
  String? _selectedPlanId;
  List<String> _comparePlans = [];
  Map<String, int> _currentBills = {
    'cellular': 119,
    'internet': 140,
    'tv': 130,
    'triple': 260,
    'abroad': 0,
  };

  // Quiz
  int _quizLines = 1;
  String _quizPriority = 'price';
  int _quizBudget = 90;
  int _quizStep = 0;

  // Auth
  bool _isLoggedIn = false;
  String _userName = '';
  String _userPhone = '';

  // Tracker
  String? _activeRequest;
  int _trackerStep = 1;

  // Search / filter
  String _searchQuery = '';
  String _sortMode = 'recommended'; // 'recommended', 'cheapest', 'savings'
  Set<String> _activeFilters = {};

  // Onboarding
  bool _hasSeenOnboarding = false;

  // Getters
  String get cat => _cat;
  String? get selectedPlanId => _selectedPlanId;
  List<String> get comparePlans => List.unmodifiable(_comparePlans);
  Map<String, int> get currentBills => Map.unmodifiable(_currentBills);

  int get quizLines => _quizLines;
  String get quizPriority => _quizPriority;
  int get quizBudget => _quizBudget;
  int get quizStep => _quizStep;

  bool get isLoggedIn => _isLoggedIn;
  String get userName => _userName;
  String get userPhone => _userPhone;

  String? get activeRequest => _activeRequest;
  int get trackerStep => _trackerStep;

  String get searchQuery => _searchQuery;
  String get sortMode => _sortMode;
  Set<String> get activeFilters => Set.unmodifiable(_activeFilters);

  bool get hasSeenOnboarding => _hasSeenOnboarding;

  int get currentBill => _currentBills[_cat] ?? 0;

  // Category selection
  void setCat(String catId) {
    _cat = catId;
    _searchQuery = '';
    _activeFilters = {};
    notifyListeners();
  }

  // Plan selection
  void selectPlan(String? planId) {
    _selectedPlanId = planId;
    notifyListeners();
  }

  // Compare
  void toggleCompare(String planId) {
    if (_comparePlans.contains(planId)) {
      _comparePlans.remove(planId);
    } else if (_comparePlans.length < 3) {
      _comparePlans.add(planId);
    }
    notifyListeners();
  }

  bool isInCompare(String planId) => _comparePlans.contains(planId);

  void clearCompare() {
    _comparePlans = [];
    notifyListeners();
  }

  // Current bill
  void setCurrentBill(String catId, int amount) {
    _currentBills[catId] = amount;
    notifyListeners();
  }

  // Quiz
  void setQuizLines(int lines) {
    _quizLines = lines;
    notifyListeners();
  }

  void setQuizPriority(String p) {
    _quizPriority = p;
    notifyListeners();
  }

  void setQuizBudget(int b) {
    _quizBudget = b;
    notifyListeners();
  }

  void setQuizStep(int s) {
    _quizStep = s;
    notifyListeners();
  }

  void resetQuiz() {
    _quizLines = 1;
    _quizPriority = 'price';
    _quizBudget = 90;
    _quizStep = 0;
    notifyListeners();
  }

  // Auth
  void login(String name, String phone) {
    _isLoggedIn = true;
    _userName = name;
    _userPhone = phone;
    notifyListeners();
  }

  void logout() {
    _isLoggedIn = false;
    _userName = '';
    _userPhone = '';
    notifyListeners();
  }

  // Tracker
  void setActiveRequest(String? req) {
    _activeRequest = req;
    notifyListeners();
  }

  void advanceTracker() {
    if (_trackerStep < 3) {
      _trackerStep++;
      notifyListeners();
    }
  }

  // Search & filter
  void setSearchQuery(String q) {
    _searchQuery = q;
    notifyListeners();
  }

  void setSortMode(String mode) {
    _sortMode = mode;
    notifyListeners();
  }

  void toggleFilter(String f) {
    if (_activeFilters.contains(f)) {
      _activeFilters.remove(f);
    } else {
      _activeFilters.add(f);
    }
    notifyListeners();
  }

  void clearFilters() {
    _activeFilters = {};
    _searchQuery = '';
    notifyListeners();
  }

  // Onboarding
  void completeOnboarding() {
    _hasSeenOnboarding = true;
    notifyListeners();
  }

  // Computed: filtered + sorted plans for current category
  List<Plan> get filteredPlans {
    var plans = plansByCategory(_cat);
    final bill = _currentBills[_cat] ?? 0;

    // Search
    if (_searchQuery.isNotEmpty) {
      final q = _searchQuery.toLowerCase();
      plans = plans
          .where((p) =>
              p.provider.toLowerCase().contains(q) ||
              p.plan.toLowerCase().contains(q) ||
              p.net.toLowerCase().contains(q))
          .toList();
    }

    // Filters
    for (final f in _activeFilters) {
      plans = plans.where((p) => p.flags.contains(f)).toList();
    }

    // Quiz filter
    if (_quizBudget > 20 && _quizBudget < 250) {
      // Only apply budget filter if coming from quiz
    }

    // Sort
    switch (_sortMode) {
      case 'cheapest':
        plans.sort((a, b) => (a.price ?? 999).compareTo(b.price ?? 999));
        break;
      case 'savings':
        plans.sort((a, b) =>
            b.savingsPerYear(bill).compareTo(a.savingsPerYear(bill)));
        break;
      default: // recommended
        plans.sort((a, b) {
          if (b.best && !a.best) return 1;
          if (a.best && !b.best) return -1;
          return b.rating.compareTo(a.rating);
        });
    }

    return plans;
  }

  // Best saving plan overall
  Plan? get bestSavingPlan {
    final bill = _currentBills[_cat] ?? 0;
    final plans = plansByCategory(_cat);
    if (plans.isEmpty) return null;
    return plans.reduce((a, b) =>
        a.savingsPerYear(bill) >= b.savingsPerYear(bill) ? a : b);
  }

  // Total annual savings across all categories
  int get totalAnnualSavings {
    int total = 0;
    for (final entry in _currentBills.entries) {
      final plans = plansByCategory(entry.key);
      if (plans.isEmpty) continue;
      final bill = entry.value;
      final best = plans.reduce((a, b) =>
          a.savingsPerYear(bill) >= b.savingsPerYear(bill) ? a : b);
      total += best.savingsPerYear(bill);
    }
    return total;
  }

  // Lead capture state
  String _leadName = '';
  String _leadPhone = '';
  String _leadProvider = '';
  String? _leadPlanId;

  String get leadName => _leadName;
  String get leadPhone => _leadPhone;
  String get leadProvider => _leadProvider;
  String? get leadPlanId => _leadPlanId;

  void setLead({
    String? name,
    String? phone,
    String? provider,
    String? planId,
  }) {
    if (name != null) _leadName = name;
    if (phone != null) _leadPhone = phone;
    if (provider != null) _leadProvider = provider;
    if (planId != null) _leadPlanId = planId;
    notifyListeners();
  }

  void submitLead() {
    _activeRequest = _leadPlanId ?? _selectedPlanId;
    _isLoggedIn = true;
    _userName = _leadName;
    _userPhone = _leadPhone;
    notifyListeners();
  }
}
