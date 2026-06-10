// Exports the app's plan catalogue to site/data/plans.json so the static site
// can render the real plans. Run from the repo root:
//   flutter test tool/export_plans.dart
// (Run via the flutter test runner because the data layer pulls in Flutter.)
import 'dart:convert';
import 'dart:io';
import 'package:flutter_test/flutter_test.dart';
import 'package:chosech/data.dart';

void main() {
  test('export plan catalogue to site/data/plans.json', () {
    final cats = categories
        .map((c) => {'id': c.id, 'name': c.name, 'icon': c.icon})
        .toList();

    final plans = allPlans.map((p) => {
          'id': p.id,
          'cat': p.cat,
          'provider': p.provider,
          'plan': p.plan,
          'price': p.price,
          'after': p.hasPromo ? p.after : null,
          'net': p.netLabel,
          'is5G': p.is5G,
          'noCommit': p.noCommit,
          'hasAbroad': p.hasAbroad,
          'feats': p.feats,
          'specs': p.specs,
          'rating': p.rating,
          'reviews': p.reviews,
          'priceUnit': p.unit, // month / package / day / minute (resolved default)
          'kind': p.kind,      // regular / dataonly / kosher
        }).toList();

    final out = {
      'generated': DateTime.now().toIso8601String(),
      'categories': cats,
      'plans': plans,
    };

    final f = File('site/data/plans.json');
    f.parent.createSync(recursive: true);
    f.writeAsStringSync(const JsonEncoder.withIndent('  ').convert(out));

    // Sanity: the catalogue should be the full set.
    expect(plans.length, greaterThan(100));
    // ignore: avoid_print
    print('Exported ${plans.length} plans across ${cats.length} categories → site/data/plans.json');
  });
}
