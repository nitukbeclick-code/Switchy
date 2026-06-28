-- Catalogue rich-field seed for public.plans (2026-06).
--
-- WHAT: copies the bundled catalogue's rich detail (web/data/catalogue.json →
--   d.plans) into the owner-editable columns added by plans-rich-fields-2026-06.sql:
--     feats      jsonb   ← plan.feats      ("what is included" benefit strings)
--     fine_lines jsonb   ← plan.fineLines  (small-print bullets)
--     notes      text    ← plan.notes      (free-text note; bundled value is null today)
--     terms      text    ← plan.terms      (T&C; bundled value is empty today)
--   matched by primary key id. This is the LAST-KNOWN-GOOD snapshot so a fresh
--   DB (or a wiped column) starts from real bundled data, never blank.
--
-- TRUTH-ONLY: each UPDATE sets a column ONLY when the bundled value is non-empty,
--   so we never write an empty array / empty string over data the owner may have
--   already curated in the Supabase dashboard. Re-runnable: every statement is an
--   idempotent UPDATE keyed by id (no-op if the row is gone).
--
-- COVERAGE (bundled non-empty values, of 120 plans):
--   feats: 120/120 · fine_lines: 107/120 · notes: 0/120 · terms: 0/120
--   (notes/terms are empty in today's bundle — the columns exist and the copy
--    logic is wired, so the moment the catalogue carries them this seed fills them.)
--
-- DB-AUTHORITATIVE: public.plans is edited in the Supabase dashboard and the
--   export tool (tool/export_plans.dart) no longer clobbers these columns on an
--   existing id. Apply this seed ONCE to backfill; routine refreshes come from
--   the dashboard. Apply manually (reviewed + applied via MCP); do NOT auto-apply.

update public.plans set
  feats = '["5G","1500GB גלישה","נתיב מהיר","גלישה חופשית באפליקציות"]'::jsonb,
  fine_lines = '["מחיר רשמי: ₪69.9","נתיב מהיר","שירות תיקונים מורחב","גלישה חופשית באפליקציות","חריגה 49 אג׳/דק׳"]'::jsonb
where id = 'cel_cellcom_5gprocare1500';

update public.plans set
  feats = '["500GB גלישה","150 דק׳","3,500 SMS"]'::jsonb,
  fine_lines = '["מחיר רשמי: ₪44.9","חריגה 49 אג׳/דק׳"]'::jsonb
where id = 'cel_cellcom_4gbasic500';

update public.plans set
  feats = '["5G","800GB גלישה","גלישה חופשית באפליקציות"]'::jsonb,
  fine_lines = '["מחיר רשמי: ₪39.9","מחיר מבצע לחודשיים, לאחר מכן ₪59.9","גלישה חופשית באפליקציות"]'::jsonb
where id = 'cel_cellcom_5g800';

update public.plans set
  feats = '["5G","1000GB גלישה","נתיב מהיר","גלישה חופשית באפליקציות"]'::jsonb,
  fine_lines = '["מחיר רשמי: ₪59.9","נתיב מהיר","גלישה חופשית באפליקציות"]'::jsonb
where id = 'cel_cellcom_5gpro1000';

update public.plans set
  feats = '["5G","1500GB גלישה","5GB חו\"ל + 50 דק׳/SMS","שירות תיקונים מורחב"]'::jsonb,
  fine_lines = '["מחיר רשמי: ₪119.9","5GB גלישה בחו\"ל + 50 דק׳/SMS בכל חודש","שירות תיקונים מורחב"]'::jsonb
where id = 'cel_cellcom_5gprofly1500';

update public.plans set
  feats = '["400GB גלישה","200 דק׳ ל-42 יעדים","3,500 SMS"]'::jsonb,
  fine_lines = '["מחיר רשמי: ₪34.9","₪34.9 ל-2 קווים+; ₪39.9 קו יחיד","200 דק׳ לחו\"ל ל-42 יעדים"]'::jsonb
where id = 'cel_partner_prince400';

update public.plans set
  feats = '["5G","500GB גלישה","400 דק׳ ל-42 יעדים","Private 5G"]'::jsonb,
  fine_lines = '["מחיר רשמי: ₪39.9","מחיר מבצע ל-3 חודשים, לאחר מכן ₪49.9","Private 5G","400 דק׳ לחו\"ל ל-42 יעדים"]'::jsonb
where id = 'cel_partner_queen5g500';

update public.plans set
  feats = '["5G","2000GB גלישה","700 דק׳ ל-42 יעדים","eSIM מיידי"]'::jsonb,
  fine_lines = '["מחיר רשמי: ₪74.9","eSIM מיידי","CyberGuard","eSIM Watch","FunTone","10% מהתשלום נתרם לעמותות","700 דק׳ לחו\"ל ל-42 יעדים"]'::jsonb
where id = 'cel_partner_betterfutureboost5g2000';

update public.plans set
  feats = '["5G","800GB גלישה","תיעדוף 5G","CyberGuard"]'::jsonb,
  fine_lines = '["מחיר רשמי: ₪59.9","FunTone","CyberGuard","תיעדוף 5G"]'::jsonb
where id = 'cel_partner_king5g800';

update public.plans set
  feats = '["5G","1500GB גלישה","CyberGuard","קופון אביזרים ₪100"]'::jsonb,
  fine_lines = '["מחיר רשמי: ₪69.9","CyberGuard","eSIM Watch","קופון אביזרים בשווי ₪100"]'::jsonb
where id = 'cel_partner_boost5g1500';

update public.plans set
  feats = '["5G","1000GB גלישה","גלישה חופשית באפליקציות + AI","מסלול Travel"]'::jsonb,
  fine_lines = '["מחיר רשמי: ₪39.90","מחיר מבצע לחודשיים (הטבת Welcome), לאחר מכן ₪49.90","גלישה חופשית באפליקציות + AI","₪100 למוצרים מ-₪599","מסלול Travel לחו\"ל"]'::jsonb
where id = 'cel_pelephone_5g1000';

update public.plans set
  feats = '["400GB גלישה","eSIM מיידי","מסלול Travel"]'::jsonb,
  fine_lines = '["מחיר רשמי: ₪39.90","eSIM מיידי","מסלול Travel לחו\"ל"]'::jsonb
where id = 'cel_pelephone_4g400';

update public.plans set
  feats = '["5G","2000GB גלישה","תיעדוף 5G","מסלול Travel"]'::jsonb,
  fine_lines = '["מחיר רשמי: ₪49.90","מחיר מבצע לחודשיים, לאחר מכן ₪64.90","תיעדוף 5G","₪100 למוצרים מ-₪599","מסלול Travel לחו\"ל"]'::jsonb
where id = 'cel_pelephone_5gmaxvip2000';

update public.plans set
  feats = '["300GB נפח מתגלגל","240 דק׳","גלישה בחו\"ל"]'::jsonb,
  fine_lines = '["מחיר רשמי: ₪34.90","מחיר מבצע ל-12 חודשים","נפח גלישה מתגלגל לחודש הבא"]'::jsonb
where id = 'cel_golan_300rolling';

update public.plans set
  feats = '["400GB גלישה","1GB חו\"ל לחודש","100 דק׳","חו\"ל כלול"]'::jsonb,
  fine_lines = '["מחיר מבצע ל-12 חודשים","1GB גלישה בחו\"ל לחודש כלול במחיר"]'::jsonb
where id = 'cel_golan_400abroad';

update public.plans set
  feats = '["5G","750GB גלישה","גלישה חופשית באפליקציות","הנחה על חבילת חו\"ל"]'::jsonb,
  fine_lines = '["מבצע ₪39 ל-3 חודשים, לאחר מכן ₪49","גלישה חופשית באפליקציות","₪99 הנחה על חבילת גלישה בחו\"ל"]'::jsonb
where id = 'cel_golan_750_5g';

update public.plans set
  feats = '["5G","1500GB גלישה","500 דק׳","שירות תיקונים"]'::jsonb,
  fine_lines = '["מבצע ₪49 לחודשיים, לאחר מכן ₪59","שירות תיקונים"]'::jsonb
where id = 'cel_golan_1500_5g';

update public.plans set
  feats = '["500GB גלישה","מסלול דאטה","50 דק׳"]'::jsonb,
  fine_lines = '["מסלול דאטה בלבד"]'::jsonb
where id = 'cel_golan_dataonly500';

update public.plans set
  feats = '["550GB גלישה","500 דק׳","חו\"ל כלול"]'::jsonb,
  fine_lines = '["גלישה בחו\"ל כלולה במחיר"]'::jsonb
where id = 'cel_golan_550abroad';

update public.plans set
  feats = '["5G","2500GB גלישה","נתיב מהיר","500 דק׳ ל-27 יעדים"]'::jsonb,
  fine_lines = '["מחיר רשמי: ₪69.9","HOT Mobile Cyber","נתיב מהיר","גלישה חופשית באפליקציות","500 דק׳ לחו\"ל ל-27 יעדים (שווי ₪9.9/ח׳)"]'::jsonb
where id = 'cel_hotmobile_5gultra2500';

update public.plans set
  feats = '["5G","3000GB גלישה","10GB חו\"ל + 100 דק׳/SMS","Cyber"]'::jsonb,
  fine_lines = '["מחיר רשמי: ₪109.9","HOT Mobile Cyber","גלישה חופשית","10GB גלישה בחו\"ל + 100 דק׳/SMS","500 דק׳ ל-27 יעדים"]'::jsonb
where id = 'cel_hotmobile_5gultraplus3000';

update public.plans set
  feats = '["5G","3000GB גלישה","נתיב מהיר","500 דק׳ ל-27 יעדים"]'::jsonb,
  fine_lines = '["מחיר רשמי: ₪79.9","Cyber","נתיב מהיר","500 דק׳ ל-27 יעדים"]'::jsonb
where id = 'cel_hotmobile_5gultrapremium3000';

update public.plans set
  feats = '["5G","2000GB גלישה","גלישה חופשית באפליקציות","300 דק׳ ל-27 יעדים"]'::jsonb,
  fine_lines = '["מחיר רשמי: ₪59.9","גלישה חופשית באפליקציות","300 דק׳ לחו\"ל ל-27 יעדים"]'::jsonb
where id = 'cel_hotmobile_5ggen2000';

update public.plans set
  feats = '["20GB גלישה","SIM דאטה לטאבלט/לפטופ/מודם"]'::jsonb,
  fine_lines = '["מחיר רשמי: ₪10.9","SIM Data לטאבלט / לפטופ / מודם"]'::jsonb
where id = 'cel_hotmobile_dataonly20';

update public.plans set
  feats = '["150GB גלישה","SIM דאטה"]'::jsonb,
  fine_lines = '["מחיר רשמי: ₪21.9","SIM Data"]'::jsonb
where id = 'cel_hotmobile_dataonly150';

update public.plans set
  feats = '["300GB גלישה","5,000 דק׳","eSIM מיידי"]'::jsonb,
  fine_lines = '["מחיר רשמי: ₪22.5","eSIM מיידי"]'::jsonb
where id = 'cel_xphone_mechubrim';

update public.plans set
  feats = '["500GB גלישה","1GB חו\"ל","מחיר קבוע לכל החיים"]'::jsonb,
  fine_lines = '["מחיר רשמי: ₪29.90","מחיר קבוע לכל החיים — ללא עליית מחיר","1GB גלישה בחו\"ל כלול"]'::jsonb
where id = 'cel_xphone_foreverplus';

update public.plans set
  feats = '["5G","500GB גלישה","1GB חו\"ל","מחיר קבוע לכל החיים"]'::jsonb,
  fine_lines = '["מחיר רשמי: ₪34.90","מחיר קבוע לכל החיים — ללא עליית מחיר","1GB גלישה בחו\"ל כלול"]'::jsonb
where id = 'cel_xphone_foreverplus5g';

update public.plans set
  feats = '["50GB גלישה","5,000 דק׳","החבילה הצעירה"]'::jsonb,
  fine_lines = '["מחיר רשמי: ₪24.90","החבילה הצעירה"]'::jsonb
where id = 'cel_xphone_young50';

update public.plans set
  feats = '["500GB נפח נצבר","5,000 דק׳","1GB צבירה בחו\"ל"]'::jsonb,
  fine_lines = '["מחיר רשמי: ₪29.90","נפח גלישה נצבר","1GB צבירה בחו\"ל"]'::jsonb
where id = 'cel_xphone_zoberim500';

update public.plans set
  feats = '["5G","750GB נפח נצבר","5,000 דק׳","1GB צבירה בחו\"ל"]'::jsonb,
  fine_lines = '["מחיר רשמי: ₪39.90","נפח גלישה נצבר","1GB צבירה בחו\"ל"]'::jsonb
where id = 'cel_xphone_zoberim750_5g';

update public.plans set
  feats = '["גלישה ללא הגבלה","3GB חו\"ל","5,000 דק׳"]'::jsonb,
  fine_lines = '["מחיר רשמי: ₪42.90","3GB גלישה בחו\"ל כלול"]'::jsonb
where id = 'cel_xphone_global3';

update public.plans set
  feats = '["גלישה ללא הגבלה","5GB חו\"ל","5,000 דק׳"]'::jsonb,
  fine_lines = '["מחיר רשמי: ₪48.90","5GB גלישה בחו\"ל כלול"]'::jsonb
where id = 'cel_xphone_global5';

update public.plans set
  feats = '["5G","גלישה ללא הגבלה","5GB חו\"ל","5,000 דק׳"]'::jsonb,
  fine_lines = '["מחיר רשמי: ₪54.90","5GB גלישה בחו\"ל כלול"]'::jsonb
where id = 'cel_xphone_global5g';

update public.plans set
  feats = '["5G","600GB גלישה","5,000 דק׳","₪80 ל-3 קווים"]'::jsonb,
  fine_lines = '["₪80 ל-3 קווים (₪35 לקו)","תומך דור 5"]'::jsonb
where id = 'cel_ramilevy_600triple';

update public.plans set
  feats = '["5G","500GB גלישה","5,000 דק׳","₪55 לזוג קווים"]'::jsonb,
  fine_lines = '["₪55 לזוג קווים (₪35 לקו)","דור 5"]'::jsonb
where id = 'cel_ramilevy_couple500';

update public.plans set
  feats = '["5G","250GB גלישה","2,500 דק׳","₪50 לזוג"]'::jsonb,
  fine_lines = '["₪50 לזוג (בתשלום בכרטיס אשראי)","חודשיים ראשונים + דמי חיבור חינם","דור 5"]'::jsonb
where id = 'cel_ramilevy_couplepromo250';

update public.plans set
  feats = '["5G","250GB גלישה","2,500 דק׳","₪50 לזוג"]'::jsonb,
  fine_lines = '["₪50 לזוג (₪30 לקו)","דור 5"]'::jsonb
where id = 'cel_ramilevy_couple250';

update public.plans set
  feats = '["5G","1000GB גלישה","2,500 דק׳"]'::jsonb,
  fine_lines = '["דור 5"]'::jsonb
where id = 'cel_ramilevy_1000xtreme';

update public.plans set
  feats = '["5G","300GB גלישה","2,500 דק׳"]'::jsonb,
  fine_lines = '["דור 5"]'::jsonb
where id = 'cel_ramilevy_300xtreme';

update public.plans set
  feats = '["5G","500GB גלישה","500 דק׳ לחו\"ל","2,500 דק׳"]'::jsonb,
  fine_lines = '["דור 5","500 דק׳ לחו\"ל"]'::jsonb
where id = 'cel_ramilevy_500global';

update public.plans set
  feats = '["כשר","10,000 דק׳ ברשת","מסלול כשר"]'::jsonb,
  fine_lines = '["מחיר רשמי: ₪16.9","מסלול כשר","לאחר 24 חודשים המחיר עשוי לעלות"]'::jsonb
where id = 'cel_ramilevy_maxkasher';

update public.plans set
  feats = '["כשר","10,000 דק׳ ברשת","מסלול כשר"]'::jsonb,
  fine_lines = '["מחיר רשמי: ₪14.9","מסלול כשר","לאחר 24 חודשים המחיר עשוי לעלות"]'::jsonb
where id = 'cel_ramilevy_zolkasher';

update public.plans set
  feats = '["גלישה חופשית דור 4","5,000 דק׳","eSIM מיידי"]'::jsonb,
  fine_lines = '["מחיר רשמי: ₪29.90","₪29.9 ל-2 קווים ומעלה","eSIM מיידי"]'::jsonb
where id = 'cel_wecom_family';

update public.plans set
  feats = '["150GB גלישה","3,000 דק׳","eSIM מיידי"]'::jsonb,
  fine_lines = '["מחיר רשמי: ₪32.90","eSIM מיידי"]'::jsonb
where id = 'cel_wecom_basic150';

update public.plans set
  feats = '["5G","גלישה חופשית","5,000 דק׳","eSIM מיידי"]'::jsonb,
  fine_lines = '["eSIM מיידי"]'::jsonb
where id = 'cel_wecom_free5g';

update public.plans set
  feats = '["5G","גלישה חופשית","5GB חו\"ל לחודש","eSIM מיידי"]'::jsonb,
  fine_lines = '["מחיר רשמי: ₪59.90","דמי הצטרפות חד-פעמיים ₪79.90","5GB גלישה בחו\"ל לחודש + תעריף מוזל","eSIM מיידי"]'::jsonb
where id = 'cel_wecom_global5g';

update public.plans set
  feats = '["5G","300GB גלישה","מחיר קבוע לכל החיים","eSIM מיידי"]'::jsonb,
  fine_lines = '["מחיר רשמי: ₪39.90","דור 5","מחיר קבוע לכל החיים"]'::jsonb
where id = 'cel_019mobile_bigdata300';

update public.plans set
  feats = '["12GB גלישה","מחיר קבוע לכל החיים","סינון אתרים חינם"]'::jsonb,
  fine_lines = '["מחיר רשמי: ₪19.80","מחיר קבוע לכל החיים","סינון אתרים חינם"]'::jsonb
where id = 'cel_019mobile_lifetime12';

update public.plans set
  feats = '["30GB גלישה","מחיר קבוע לכל החיים","סינון חינם"]'::jsonb,
  fine_lines = '["מחיר רשמי: ₪21.90","מחיר קבוע לכל החיים","סינון אתרים חינם"]'::jsonb
where id = 'cel_019mobile_bulbpony30';

update public.plans set
  feats = '["5G","170GB גלישה","מחיר קבוע לכל החיים","סינון חינם"]'::jsonb,
  fine_lines = '["מחיר רשמי: ₪25.90","מחיר קבוע לכל החיים","סינון אתרים חינם"]'::jsonb
where id = 'cel_019mobile_gazamnu170';

update public.plans set
  feats = '["100GB גלישה","100 דק׳ לחו\"ל","מחיר קבוע 3 שנים"]'::jsonb,
  fine_lines = '["מחיר רשמי: ₪29.90","מחיר קבוע ל-3 שנים, לאחר מכן +₪10","100 דק׳ לחו\"ל למבחר מדינות"]'::jsonb
where id = 'cel_019mobile_weit100';

update public.plans set
  feats = '["200GB גלישה","200 דק׳ לחו\"ל","מחיר קבוע 3 שנים"]'::jsonb,
  fine_lines = '["מחיר רשמי: ₪31.80","מחיר קבוע ל-3 שנים, לאחר מכן +₪10","200 דק׳ לחו\"ל למבחר מדינות"]'::jsonb
where id = 'cel_019mobile_bigtime200';

update public.plans set
  feats = '["2GB גלישה","ל-IoT/רכב","IP קבוע אפשרי"]'::jsonb,
  fine_lines = '["מחיר קבוע לכל החיים","ל-IoT / רכב","IP קבוע +₪15"]'::jsonb
where id = 'cel_019mobile_simdata2';

update public.plans set
  feats = '["כשר","10GB גלישה","סינון ועד הרבנים","ללא עליית מחיר"]'::jsonb,
  fine_lines = '["ללא עליית מחיר","מסונן ע\"י ועד הרבנים","תשלום נטפרי נפרד"]'::jsonb
where id = 'cel_019mobile_netfree_s_kasher';

update public.plans set
  feats = '["כשר","40GB גלישה","סינון ועד הרבנים","ללא עליית מחיר"]'::jsonb,
  fine_lines = '["ללא עליית מחיר","מסונן ע\"י ועד הרבנים","תשלום נטפרי נפרד"]'::jsonb
where id = 'cel_019mobile_netfree_m_kasher';

update public.plans set
  feats = '["5G","400GB גלישה","שיחות לחו\"ל","משלוח חינם"]'::jsonb,
  fine_lines = '["מחיר רשמי: ₪39.90","מחיר מבצע לשנתיים","שיחות לחו\"ל + משלוח SIM חינם","פירוט מלא ב-PDF"]'::jsonb
where id = 'cel_walla_5g400';

update public.plans set
  feats = '["300GB גלישה","₪75 ל-3 מנויים","שיחות חו\"ל","חודש ראשון חינם"]'::jsonb,
  fine_lines = '["₪75 ל-3 מנויים","חודש ראשון חינם","שיחות חו\"ל + משלוח SIM חינם","מסופק ע\"י HOT Mobile"]'::jsonb
where id = 'cel_walla_family300';

update public.plans set
  feats = '["300GB גלישה","שיחות חו\"ל","משלוח חינם"]'::jsonb,
  fine_lines = '["מחיר רשמי: ₪30.90","מחיר לשנה, עד 2 מנויים","שיחות חו\"ל + משלוח SIM חינם"]'::jsonb
where id = 'cel_walla_basic300';

update public.plans set
  feats = '["סיב אופטי","עד 300/100Mb","נתב כלול לחודשיים","ציוד פרטי אפשרי"]'::jsonb,
  fine_lines = '["מחיר כולל נתב לחודשיים בלבד","נתב +₪19.9/ח׳ לאחר מכן","ניתן להביא ציוד פרטי","מדרגות מחיר: ח׳3-12: ₪128.9 / ח׳13-36: ₪160 / ח׳37+: ₪196.3","ללא נתב מח׳37+: ₪176.4"]'::jsonb
where id = 'net_bezeq_bfiber300';

update public.plans set
  feats = '["סיב אופטי","עד 1000/100Mb","גיגה ביתי","תקורה ~10%"]'::jsonb,
  fine_lines = '["נתב +₪19.9/ח׳","תקורה ~10%","מדרגות מחיר: ח׳3-6: ₪118.9 / ח׳7-12: ₪158.9 / ח׳13-36: ₪180.2 / ח׳37+: ₪216.5"]'::jsonb
where id = 'net_bezeq_bfiber1g';

update public.plans set
  feats = '["סיב אופטי","עד 1000/250Mb","העלאה מהירה 250Mb"]'::jsonb,
  fine_lines = '["מחיר מבצע לשנה","נתב +₪19.9/ח׳","מחיר לאחר תקופת מבצע לא מצוין"]'::jsonb
where id = 'net_bezeq_bfiber1g250up';

update public.plans set
  feats = '["סיב אופטי","עד 2500/250Mb","גיגה וחצי ביתי"]'::jsonb,
  fine_lines = '["מחיר מבצע לשנה","נתב +₪19.9/ח׳","מדרגות מחיר: ח׳13-36: ₪200.4 / ח׳37+: ₪226.6","ללא נתב מח׳37+: ₪206.7"]'::jsonb
where id = 'net_bezeq_bfiber25g';

update public.plans set
  feats = '["סיב אופטי","עד 5000/500Mb","מהירות גבוהה ביותר","תקורה ~17%"]'::jsonb,
  fine_lines = '["נתב +₪39.9/ח׳","תקורה ~17%","מדרגות מחיר: ח׳2-12: ₪218.9 / ח׳13+: ₪240.4","ללא נתב מח׳13+: ₪200.5"]'::jsonb
where id = 'net_bezeq_bfiber5g';

update public.plans set
  feats = '["נחושת VDSL","עד 100/3Mb","נתב כלול ל-3 חודשים"]'::jsonb,
  fine_lines = '["מחיר כולל נתב ל-3 חודשים","נתב BE +₪21.9/ח׳ לאחר מכן","מדרגות מחיר: ח׳4-12: ₪95 / ח׳13-36: ₪125 / ח׳37+: ₪158.3"]'::jsonb
where id = 'net_bezeq_copper100';

update public.plans set
  feats = '["נחושת VDSL","עד 100/10Mb","העלאה משופרת"]'::jsonb,
  fine_lines = '["מחיר לשנה ללא נתב","נתב +₪21.9/ח׳","מדרגות מחיר: ח׳13-36: ₪128 / ח׳37+: ₪161.3"]'::jsonb
where id = 'net_bezeq_copper100_10up';

update public.plans set
  feats = '["נחושת VDSL","עד 200/20Mb"]'::jsonb,
  fine_lines = '["מחיר מבצע לשנה","נתב +₪21.9/ח׳","מדרגות מחיר: ח׳13-36: ₪130 / ח׳37+: ₪166.4"]'::jsonb
where id = 'net_bezeq_copper200';

update public.plans set
  feats = '["סיב אופטי","עד 600/100Mb","מגדיל טווח כלול","Fiber AI"]'::jsonb,
  fine_lines = '["כולל מגדיל טווח מתקדם ונקודת רשת","ציוד עצמי: הנחה ₪40/ח׳","מחיר לאחר מבצע לא מצוין"]'::jsonb
where id = 'net_hot_fiber600ai';

update public.plans set
  feats = '["סיב אופטי","עד 1000/100Mb","HBO Max כלול","מגדיל טווח כלול"]'::jsonb,
  fine_lines = '["50% הנחה ל-3 חודשים הראשונים","כולל HBO Max","כולל מגדיל טווח ונקודת רשת"]'::jsonb
where id = 'net_hot_fiber1g_hbomax';

update public.plans set
  feats = '["סיב אופטי","עד 1000/100Mb","2 מגדילי טווח + 2 נקודות רשת","HBO Max כלול"]'::jsonb,
  fine_lines = '["מתאים לבתים גדולים / 2 מפלסים","כולל HBO Max","מחיר לאחר מבצע לא מצוין"]'::jsonb
where id = 'net_hot_homeplus1g';

update public.plans set
  feats = '["סיב אופטי","עד 1000/100Mb","נתב WiFi כלול","גלישה בטוחה כלולה"]'::jsonb,
  fine_lines = '["מחיר שנה ראשונה ₪119/ח׳","חיבור לנקודת רשת חינם","כולל קו טלפון 1000 דקות","גלישה בטוחה כלולה"]'::jsonb
where id = 'net_cellcom_fiber1g';

update public.plans set
  feats = '["סיב אופטי","עד 2500/250Mb","Star Mesh WiFi7 כלול"]'::jsonb,
  fine_lines = '["מדרגות מחיר: ח׳1-5: ₪99 / ח׳6-12: ₪129 / שנה 2+: ₪149","נתב Star Mesh (WiFi7) +₪29.9/ח׳"]'::jsonb
where id = 'net_cellcom_fiber25g';

update public.plans set
  feats = '["סיב אופטי","עד 600/100Mb","Easy Mesh זמין","CyberGuard אופציונלי"]'::jsonb,
  fine_lines = '["מחיר מבצע לחודשיים","נתב WiFi7 +₪25/ח׳","Easy Mesh +₪9.90/ח׳"]'::jsonb
where id = 'net_partner_fiber600';

update public.plans set
  feats = '["סיב אופטי","עד 1000/100Mb","נתב WiFi7 כלול","CyberGuard +₪4.90"]'::jsonb,
  fine_lines = '["מדרגות מחיר: ח׳1-2: ₪39 / ח׳3-12: ₪139 / ח׳13+: ₪159","נתב WiFi7 כלול ₪0","Easy Mesh +₪9.90/ח׳","CyberGuard +₪4.90/ח׳"]'::jsonb
where id = 'net_partner_fiber1g';

update public.plans set
  feats = '["סיב אופטי","עד 2500/250Mb","נתב כלול","CyberGuard +₪4.90"]'::jsonb,
  fine_lines = '["מחיר ל-18 חודשים","Easy Mesh +₪9.90/ח׳","CyberGuard +₪4.90/ח׳"]'::jsonb
where id = 'net_partner_fiber25g';

update public.plans set
  feats = '["סיב אופטי","עד 1000/100Mb","שובר Wolt ₪100","תשתית סלקום"]'::jsonb,
  fine_lines = '["מחיר לשנה","נתב +₪25/ח׳","שובר Wolt ₪100 למצטרפים","תשתית סלקום","מחיר לאחר מבצע לא מצוין"]'::jsonb
where id = 'net_golan_fiber1g';

update public.plans set
  feats = '["סיב אופטי","עד 300/100Mb","מחיר קבוע","תשתית בזק / אנלימיטד"]'::jsonb,
  fine_lines = '["מחיר רשמי: ₪99.99","מחיר קבוע","חודשיים מתנה בהצטרפות","תשתית אנלימיטד / בזק"]'::jsonb
where id = 'net_xphone_300mb';

update public.plans set
  feats = '["סיב אופטי","עד 500/50Mb","מחיר קבוע","תשתית אנלימיטד"]'::jsonb,
  fine_lines = '["מחיר רשמי: ₪99.99","מחיר קבוע","תשתית אנלימיטד"]'::jsonb
where id = 'net_xphone_500mb';

update public.plans set
  feats = '["סיב אופטי","עד 1000/100Mb","מחיר קבוע","תשתית בזק / אנלימיטד"]'::jsonb,
  fine_lines = '["מחיר קבוע","חודשיים מתנה בהצטרפות","תשתית אנלימיטד / בזק"]'::jsonb
where id = 'net_xphone_1000mb';

update public.plans set
  feats = '["VDSL נחושת","עד 200/20Mb","מחיר קבוע","סינון חינם"]'::jsonb,
  fine_lines = '["מחיר רשמי: ₪99.99","מחיר קבוע","תשתית בזק VDSL","סינון תוכן חינם"]'::jsonb
where id = 'net_xphone_200mb';

update public.plans set
  feats = '["סיב אופטי","עד 1000/100Mb","נתב כלול","ניוד חינם מסיב בזק"]'::jsonb,
  fine_lines = '["₪49 ל-3 חודשים ראשונים (אונליין בלבד)","₪95 קבוע לכל החיים לאחר מכן","ניוד חינם לבעלי סיב בזק","נתב כלול; WiFi7 +₪10/ח׳","ערכת Ultra +₪24.90/ח׳","תשתית בזק"]'::jsonb
where id = 'net_gilat_1g_online';

update public.plans set
  feats = '["סיב אופטי","עד 1000/100Mb","נתב כלול","מחיר קבוע לשנה"]'::jsonb,
  fine_lines = '["מחיר קבוע לשנה","WiFi7 +₪10/ח׳","מחיר לאחר שנה לא מצוין"]'::jsonb
where id = 'net_gilat_1g_year';

update public.plans set
  feats = '["סיב אופטי","עד 1000/100Mb","נתב כלול","מחיר קבוע לכל החיים"]'::jsonb,
  fine_lines = '["מחיר קבוע לכל החיים","חודש חינם בהצטרפות","WiFi7 +₪10/ח׳"]'::jsonb
where id = 'net_gilat_1g_lifetime';

update public.plans set
  feats = '["סיב אופטי","עד 300Mb","מחיר קבוע","IP/סינון אופציונלי"]'::jsonb,
  fine_lines = '["לבעלי תשתית בזק פעילה","IP וסינון תוכן אופציונליים","מחיר קבוע"]'::jsonb
where id = 'net_ccc_fiber300';

update public.plans set
  feats = '["סיב אופטי","עד 500Mb","מחיר קבוע"]'::jsonb,
  fine_lines = '["לבעלי תשתית בזק פעילה","מחיר קבוע"]'::jsonb
where id = 'net_ccc_fiber500';

update public.plans set
  feats = '["סיב אופטי","עד 1000Mb","מחיר קבוע"]'::jsonb,
  fine_lines = '["לבעלי תשתית בזק פעילה","מחיר קבוע"]'::jsonb
where id = 'net_ccc_fiber1g';

update public.plans set
  feats = '["נחושת","עד 40Mb","מחיר קבוע"]'::jsonb,
  fine_lines = '["תשתית בזק פעילה","מחיר קבוע"]'::jsonb
where id = 'net_ccc_copper40';

update public.plans set
  feats = '["נחושת","עד 100Mb","מחיר קבוע"]'::jsonb,
  fine_lines = '["תשתית בזק פעילה","מחיר קבוע"]'::jsonb
where id = 'net_ccc_copper100';

update public.plans set
  feats = '["נחושת","עד 200Mb","מחיר קבוע"]'::jsonb,
  fine_lines = '["תשתית בזק פעילה","מחיר קבוע"]'::jsonb
where id = 'net_ccc_copper200';

update public.plans set
  feats = '["~140 ערוצים","HBO Max"]'::jsonb,
  fine_lines = '["HBO Max חינם 3 ח׳ אח\"כ ₪25"]'::jsonb
where id = 'tv_hot_rak-televizia';

update public.plans set
  feats = '["~140 ערוצים","ערוצי ספורט 5","HOT ספורט","HBO Max"]'::jsonb,
  fine_lines = '["חבילת הספורט כלולה במחיר","HBO Max חינם 3 ח׳ אח\"כ ₪25"]'::jsonb
where id = 'tv_hot_sport';

update public.plans set
  feats = '["~100 ערוצים","ערוצי ספורט 5","ONE","VOD מלא"]'::jsonb,
  fine_lines = '["חבילת הספורט כלולה במחיר","ביטול בלחיצה — ללא התחייבות","דורש תשתית אינטרנט קיימת"]'::jsonb
where id = 'tv_partner_sport';

update public.plans set
  feats = '["~85 ערוצים","Netflix כלול","30,000 VOD"]'::jsonb,
  fine_lines = '["Netflix (מסך אחד) כלול במחיר","שדרוג Netflix Standard בתוספת תשלום","דורש תשתית אינטרנט קיימת"]'::jsonb
where id = 'tv_cellcom_netflix';

update public.plans set
  feats = '["~70 ערוצים","HBO Max","40,000+ VOD"]'::jsonb,
  fine_lines = '["מבצע ח׳1-3: ₪49","ח׳4-12: ₪98.9","ח׳13+: ₪149.7","HBO Max 3 ח׳ חינם"]'::jsonb
where id = 'tv_stingtv_hbo-max-standard';

update public.plans set
  feats = '["~70 ערוצים","דיסני+"]'::jsonb,
  fine_lines = '["מבצע ח׳1-3: ₪49","ח׳4-12: ₪98.9","ח׳13+: ₪149.7","דיסני+ 3 ח׳ מתנה אח\"כ ₪49.9"]'::jsonb
where id = 'tv_stingtv_disney-plus';

update public.plans set
  feats = '["~70 ערוצים","40,000 VOD"]'::jsonb
where id = 'tv_stingtv_mibeit-yes';

update public.plans set
  feats = '["~70 ערוצים","ממיר 1","40,000 VOD"]'::jsonb,
  fine_lines = '["מחיר לשנה"]'::jsonb
where id = 'tv_yes_sting-plus-by-yes';

update public.plans set
  feats = '["~40,000 VOD","צפייה ישירה","Binge/Catchup"]'::jsonb,
  fine_lines = '["מחיר ₪69.90 לחודש","VOD ₪15.03/ח׳","6% הנחת חשמל"]'::jsonb
where id = 'tv_nexttv_app';

update public.plans set
  feats = '["~140 ערוצים","HBO Max","2 סטרימרים","סיב עד 1000Mb"]'::jsonb,
  fine_lines = '["ח׳4+ במחיר מחירון","HBO Max חינם 3 ח׳ אח\"כ ₪25","VOD להסרה ₪30 (אם מסירים VOD, HBO ב-₪49.90)","נתב + מגדיל WiFi7 כלול"]'::jsonb
where id = 'tri_hot_triple-hbo-max';

update public.plans set
  feats = '["~140 ערוצים","2 ממירים","סיב עד 1000Mb"]'::jsonb,
  fine_lines = '["מבצע ₪84 ח׳1-3","ח׳4+: ₪169","טלפון ללא הגבלה כלול"]'::jsonb
where id = 'tri_hot_triple-mondial-1000';

update public.plans set
  feats = '["ספורט","3 ממירים","סיב עד 1000Mb"]'::jsonb,
  fine_lines = '["מקרן וידאו במתנה","ספורט 1 חינם חודשיים אח\"כ ₪93","ספורט 5 כלול","נתב +₪20 לחודש"]'::jsonb
where id = 'tri_cellcom_triple-1gb-mondial-projector';

update public.plans set
  feats = '["3 ממירים","סיב עד 1000Mb"]'::jsonb,
  fine_lines = '["מסך Hisense QLED 55\" במתנה","נתב מתקדם כלול"]'::jsonb
where id = 'tri_cellcom_triple-1gb-mondial-screen';

update public.plans set
  feats = '["2 ממירים","סיב עד 2500Mb"]'::jsonb,
  fine_lines = '["ח׳13+: ₪199","2 ממירי MasterBox","נתב +₪29.9 לחודש"]'::jsonb
where id = 'tri_cellcom_triple-2-5gb';

update public.plans set
  feats = '["~70 ערוצים","HBO Max","2 ממירים","סיב עד 1000Mb"]'::jsonb,
  fine_lines = '["מבצע ח׳1-3: ₪149 (ללא נתב)","ח׳4-12: ₪198.9","ח׳13+: ₪258.9","כולל נתב: ח׳1-3 ₪174, ח׳4-12 ₪223.9, ח׳13+ ₪283.9","WiFi7, מגדיל טווח חודשיים מתנה אח\"כ ₪29.9","תשתית בזק"]'::jsonb
where id = 'tri_stingtv_sting-fiber-hbo-max';

update public.plans set
  feats = '["160+ ערוצים","2 ממירים","Netflix","סיב עד 1000Mb"]'::jsonb,
  fine_lines = '["חודש ראשון חינם","ח׳2-12: ₪209","ח׳13-36: ₪229","ח׳37+: ₪329","yes+WiFi חינם כלול","נתב WiFi7 שנה מתנה","תשתית בזק"]'::jsonb
where id = 'tri_yes_yes-fiber-triple';

update public.plans set
  feats = '["~70 ערוצים","2 ממירים","סיב עד 1000Mb"]'::jsonb,
  fine_lines = '["מחיר לשנה","ח׳13+: ₪234","כולל נתב: ₪174","WiFi7, מגדיל טווח חודשיים מתנה אח\"כ ₪29.9"]'::jsonb
where id = 'tri_yes_sting-fiber-by-yes';

update public.plans set
  feats = '["HBO Max","סיב עד 1000Mb"]'::jsonb,
  fine_lines = '["עד 1GB WiFi7","HBO Max 3 ח׳ חינם אח\"כ ₪25","סטרימר שנה חינם","נקודת רשת + מגדיל טווח חינם"]'::jsonb
where id = 'tri_nexttv_fiber-tv-1gb';

update public.plans set
  feats = '["סיב עד 2000Mb"]'::jsonb
where id = 'tri_nexttv_fiber-tv-2gb';

update public.plans set
  feats = '["ספורט","סיב עד 1000Mb"]'::jsonb,
  fine_lines = '["מחיר לשנה","כולל סלקום TV","שובר Wolt ₪100","נתב +₪25 לחודש","תשתית סלקום"]'::jsonb
where id = 'tri_golan_triple-hamushalam';

update public.plans set
  feats = '["₪0.99 לדקה באירופה","₪1.90 לMB גלישה","ללא מנוי חודשי","מתאים לנסיעות קצרות"]'::jsonb
where id = 'ab_019';

update public.plans set
  feats = '["גלישה + שיחות ב-₪9.90/יום","כל אירופה","הפעלה ב-SMS","מינימום יום אחד"]'::jsonb
where id = 'ab_golan';

update public.plans set
  feats = '["1GB גלישה בחו\"ל","60 דקות שיחות","90+ מדינות","ניתן לביטול חודשי"]'::jsonb
where id = 'ab_partner';

update public.plans set
  feats = '["5GB גלישה","200 דקות שיחות","130+ מדינות","שיתוף עד 3 מכשירים"]'::jsonb
where id = 'ab_pelephone';

update public.plans set
  feats = '["10GB גלישה","eSIM דיגיטלי","30+ מדינות אירופה","הפעלה מיידית מהאפליקציה"]'::jsonb
where id = 'ab_airalo';

update public.plans set
  feats = '["3GB גלישה","eSIM דיגיטלי","30+ מדינות אירופה","הפעלה מיידית מהאפליקציה","מתאים לנסיעה קצרה"]'::jsonb
where id = 'ab_airalo_3g';

update public.plans set
  feats = '["5GB גלישה","eSIM דיגיטלי","100+ מדינות ברחבי העולם","הפעלה מיידית","ניתן להרחבה מהאפליקציה"]'::jsonb
where id = 'ab_airalo_global';

update public.plans set
  feats = '["גלישה + שיחות ב-₪8.90/יום","כל אירופה + ארה\"ב","הפעלה אוטומטית בנחיתה","ניתן לביטול בחזרה"]'::jsonb
where id = 'ab_hot';

update public.plans set
  feats = '["3GB גלישה בחו\"ל","120 דקות שיחות","90+ מדינות","שיתוף בין 2 מכשירים"]'::jsonb
where id = 'ab_partner_3g';

update public.plans set
  feats = '["גלישה + שיחות ב-₪7.90/יום","כל אירופה + טורקיה","הפעלה ב-SMS","חיסכון מ-30 יום"]'::jsonb
where id = 'ab_cellcom';

update public.plans set
  feats = '["2GB גלישה","60 דקות שיחות","80+ מדינות","ניתן לביטול חודשי"]'::jsonb
where id = 'ab_019_world';

-- ── Verification ────────────────────────────────────────────────────────────
-- Expected non-null counts after this seed (a freshly-seeded table; the owner's
-- later dashboard edits can only raise notes/terms coverage, never lower it).
--   feats ≈ 120/120 · fine_lines ≈ 107/120 · notes ≈ 0/120 · terms ≈ 0/120
select
  count(*)                                          as total_rows,
  count(*) filter (where feats      is not null)    as with_feats,
  count(*) filter (where fine_lines is not null)    as with_fine_lines,
  count(*) filter (where notes      is not null and notes <> '') as with_notes,
  count(*) filter (where terms      is not null and terms <> '') as with_terms
from public.plans;
