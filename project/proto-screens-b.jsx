/* proto-screens-b.jsx — Results (filter + sort) + Plan detail */

function PlanCard({ p, onClick, current, onCompare, inCompare, match }) {
  const save = planSaveYear(p, current);
  return (
    <div className={"plan" + (p.best ? " best" : "")} onClick={onClick}>
      {p.best && <span className="badge-best">★ ההתאמה הכי טובה</span>}
      {onCompare && (
        <button className={"cmp-btn" + (inCompare ? " on" : "")} onClick={(e) => { e.stopPropagation(); onCompare(); }} title="הוסף להשוואה">
          <Icon n={inCompare ? "check" : "compare"} s={15} w={2.2} />
        </button>
      )}
      <div className="toprow">
        <div>
          <Logo name={p.provider} />
          <div className="planname">{p.plan}</div>
          {p.net && <div style={{ fontSize: 10.5, color: "var(--ink-3)", fontWeight: 600, marginTop: 2 }}>{p.net}</div>}
        </div>
        <div style={{ textAlign: "end" }}>
          <div className={"price" + (p.price == null ? " soft" : "")}>{planPrice(p)}{p.price != null && <small> /חודש</small>}</div>
          {planAfter(p) && <div style={{ fontSize: 10.5, color: "var(--ink-3)", fontWeight: 700, marginTop: 2 }}>אח״כ {planAfter(p)}</div>}
          <div style={{ display: "flex", gap: 4, alignItems: "center", justifyContent: "flex-end", marginTop: 5, fontSize: 12, color: "var(--ink-3)", fontWeight: 700 }}>
            <Icon n="star" s={12} fill="var(--lime-d)" w={0} style={{ color: "var(--lime-d)" }} /> {p.rating.toFixed(1)}
          </div>
        </div>
      </div>
      <div className="metarow">
        {match && <span className="tag" style={{ background: "rgba(201,236,75,.32)", color: "var(--green-d)", fontWeight: 800 }}>★ מתאים לך</span>}
        {planWarn(p) && <span className="tag" style={{ background: "rgba(197,83,59,.12)", color: "var(--danger)", fontWeight: 800 }}>⚠ מחיר עולה</span>}
        {p.feats.slice(0, 2).map((f, i) => <span key={i} className="tag">{f.label}</span>)}
        {p.term && p.term !== "ללא" && <span className="tag">{p.term}</span>}
        {save > 0 && <span className="savepill"><Icon n="trend" s={13} /> חוסך ₪{save}/שנה</span>}
      </div>
    </div>
  );
}

function Results({ app }) {
  const cat = CATS.find(c => c.id === app.cat) || CATS[0];
  const fdefs = FILTERS[cat.id] || [];
  const PRIO = { "המחיר הכי נמוך": { sort: "price" }, "נפח גלישה גדול": { flag: "5g" }, "ללא התחייבות": { flag: "nocommit" }, "כולל חו\"ל": { flag: "abroad" } };
  const pref = (app.prefs && PRIO[app.prefs.priority]) || {};
  const seedFlag = pref.flag && fdefs.some(f => f[0] === pref.flag) ? [pref.flag] : [];
  const [sort, setSort] = useState(pref.sort || "match");
  const [active, setActive] = useState(seedFlag);
  const [bill, setBill] = useState(() => (app.data.bills && app.data.bills[cat.id]) || cat.current);
  const [q, setQ] = useState("");
  const matchFlag = pref.flag;
  useEffect(() => { setBill((app.data.bills && app.data.bills[cat.id]) || cat.current); }, [cat.id]);
  const changeBill = (d) => { const v = Math.max(0, bill + d); setBill(v); app.set({ bills: { ...(app.data.bills || {}), [cat.id]: v } }); };

  const toggle = (k) => setActive(a => a.includes(k) ? a.filter(x => x !== k) : [...a, k]);

  const qn = q.trim();
  let list = plansByCat(cat.id).filter(p => active.every(k => p.flags.includes(k)))
    .filter(p => !qn || (p.provider + " " + p.plan + " " + p.net).includes(qn));
  if (sort === "price") list = [...list].sort((a, b) => (a.price ?? 1e9) - (b.price ?? 1e9));
  else if (sort === "save") list = [...list].sort((a, b) => planSaveYear(b, bill) - planSaveYear(a, bill));
  else list = [...list].sort((a, b) => (b.best ? 1 : 0) - (a.best ? 1 : 0));

  return (
    <div style={{ position: "relative", flex: 1, display: "flex", flexDirection: "column" }}>
    <div className="view-scroll">
      <AppHeader title={cat.label} sub={list.length + " מסלולים מתאימים"} onBack={() => app.go("home")}
        right={<button className="iconbtn" onClick={() => setSort(s => s === "price" ? "match" : "price")}><Icon n="filter" s={20} /></button>} />

      <div style={{ padding: "0 0 2px" }}>
        <div className="chiprow" style={{ padding: "2px 20px" }}>
          {CATS.map(c => (
            <span key={c.id} className={"chip" + (c.id === cat.id ? " on" : "")} style={c.id === cat.id ? { background: CATCOLOR[c.id], borderColor: CATCOLOR[c.id], color: "#fff" } : null} onClick={() => { setActive([]); app.setCat(c.id); }}>{c.label}</span>
          ))}
        </div>
      </div>

      <div className="pad" style={{ paddingTop: 12 }}>
        <div style={{ position: "relative", marginBottom: 14 }}>
          <input className="input" style={{ paddingInlineStart: 42, borderRadius: 24 }} placeholder="חיפוש ספק או מסלול…" value={q} onChange={e => setQ(e.target.value)} />
          <span style={{ position: "absolute", insetInlineStart: 14, top: "50%", transform: "translateY(-50%)", color: "var(--ink-3)" }}><Icon n="search" s={18} /></span>
        </div>
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 12 }}>
          <span className="fresh"><Icon n="check" s={13} /> המחירים עודכנו היום · 10 חברות</span>
        </div>
        {cat.current > 0 && (
          <div className="card tight" style={{ marginBottom: 14, display: "flex", alignItems: "center", gap: 10, background: "var(--green-d)" }}>
            <span style={{ flex: 1, fontSize: 12.5, fontWeight: 700, color: "rgba(255,255,255,.8)" }}>כמה אתם משלמים היום?<br /><span style={{ fontSize: 10.5, fontWeight: 600, color: "rgba(255,255,255,.55)" }}>החיסכון מחושב מול הסכום הזה</span></span>
            <button className="iconbtn" style={{ width: 34, height: 34, background: "rgba(255,255,255,.12)", border: "none", color: "#fff" }} onClick={() => changeBill(-10)}><Icon n="minus" s={16} w={2.6} /></button>
            <span style={{ fontFamily: "var(--f-disp)", fontWeight: 800, fontSize: 20, color: "var(--lime)", minWidth: 64, textAlign: "center" }}>₪{bill}</span>
            <button className="iconbtn" style={{ width: 34, height: 34, background: "rgba(201,236,75,.18)", border: "none", color: "var(--lime)" }} onClick={() => changeBill(10)}><Icon n="plus" s={16} w={2.6} /></button>
          </div>
        )}
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 14 }}>
          <span style={{ fontSize: 12.5, fontWeight: 700, color: "var(--ink-3)" }}>מיון:</span>
          <span className={"chip sm" + (sort === "match" ? " on" : "")} style={{ padding: "6px 12px", fontSize: 12.5 }} onClick={() => setSort("match")}>התאמה</span>
          <span className={"chip sm" + (sort === "price" ? " on" : "")} style={{ padding: "6px 12px", fontSize: 12.5 }} onClick={() => setSort("price")}>מחיר ↑</span>
          {cat.current > 0 && <span className={"chip sm" + (sort === "save" ? " on" : "")} style={{ padding: "6px 12px", fontSize: 12.5 }} onClick={() => setSort("save")}>חיסכון ↓</span>}
        </div>

        {fdefs.length > 0 && (
          <div className="chiprow" style={{ marginBottom: 16 }}>
            {fdefs.map(([k, lb]) => (
              <span key={k} className={"chip lime" + (active.includes(k) ? " on" : "")} onClick={() => toggle(k)}>
                {active.includes(k) && <Icon n="check" s={14} />}{lb}
              </span>
            ))}
          </div>
        )}

        {(() => {
          if (!list.length || cat.current <= 0) return null;
          let pool = list;
          if (matchFlag) { const mm = list.filter(p => p.flags.includes(matchFlag)); if (mm.length) pool = mm; }
          const s = [...pool].sort((a, b) => planSaveYear(b, bill) - planSaveYear(a, bill))[0];
          if (!s || planSaveYear(s, bill) <= 0) return null;
          return (
            <div className="smartrec" onClick={() => app.selectPlan(s.id)}>
              <div className="hd"><Icon n="spark" s={16} /> הבחירה החכמה עבורך</div>
              <div style={{ display: "flex", alignItems: "center", gap: 11, marginTop: 9 }}>
                <Logo name={s.provider} h={26} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: "var(--f-disp)", fontWeight: 700, fontSize: 13.5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.plan}</div>
                  <div style={{ fontSize: 11.5, fontWeight: 700, color: "var(--green)" }}>חוסך ₪{planSaveYear(s, bill)}/שנה · {planPrice(s)}/ח׳</div>
                </div>
                <Icon n="arrowL" s={18} style={{ color: "var(--green)" }} />
              </div>
            </div>
          );
        })()}

        <div className="stagger" style={{ display: "flex", flexDirection: "column", gap: 13 }}>
          {list.map(p => <PlanCard key={p.id} p={p} current={bill} match={matchFlag && p.flags.includes(matchFlag)} onClick={() => app.selectPlan(p.id)} onCompare={() => app.toggleCompare(p.id)} inCompare={app.compare.includes(p.id)} />)}
          {list.length === 0 && (
            <div className="card" style={{ textAlign: "center", padding: 30, color: "var(--ink-3)", fontWeight: 600 }}>
              <Icon n="search" s={26} style={{ color: "var(--line-2)" }} />
              <div style={{ marginTop: 10 }}>אין מסלול שתואם לסינון.<br />נסו להסיר מסנן.</div>
            </div>
          )}
        </div>
        <div className="disclaimer" style={{ marginTop: 18 }}>מחירים מייצגים. בייצור — פיד חי לכל ספק.</div>
      </div>
    </div>
    {app.compare.length > 0 && (
      <div className="cmpbar">
        <span className="t">{app.compare.length} מסלולים נבחרו להשוואה</span>
        <button className="btn lime sm" style={{ width: "auto" }} onClick={() => app.go("compare")}>השוואה <Icon n="arrowL" s={17} /></button>
      </div>
    )}
    </div>
  );
}

function PlanDetail({ app }) {
  const [mon, setMon] = useState(false);
  const p = PLANS.find(x => x.id === app.planId) || PLANS[0];
  const cat = CATS.find(c => c.id === p.cat);
  const current = (app.data.bills && app.data.bills[p.cat]) || (cat && cat.current);
  const save = planSaveYear(p, current);
  const cost24 = planCost24(p);
  const share = () => {
    const txt = encodeURIComponent("מצאתי מסלול ב-חוסך: " + p.provider + " · " + p.plan + " · " + planPrice(p) + (p.price != null ? "/חודש" : "") + (save > 0 ? " (חוסך ₪" + save + "/שנה)" : ""));
    window.open("https://wa.me/?text=" + txt, "_blank");
  };
  const q = Math.max(0, Math.min(1, p.rating / 5));
  return (
    <div style={{ position: "relative", flex: 1, display: "flex", flexDirection: "column" }}>
      <div className="view-scroll">
        <AppHeader title="פרטי המסלול" onBack={() => app.go("results")}
          right={<div style={{ display: "flex", gap: 8 }}><button className="iconbtn" onClick={share} title="שיתוף"><Icon n="up" s={20} /></button><button className="iconbtn"><Icon n="heart" s={20} /></button></div>} />
        <div className="pad" style={{ paddingTop: 4, paddingBottom: 130 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <Logo name={p.provider} h={44} />
          </div>
          <div style={{ fontSize: 11.5, fontWeight: 800, color: (typeof CATCOLOR !== "undefined" && CATCOLOR[p.cat]) || "var(--green)", letterSpacing: ".03em", marginTop: 12 }}>{cat ? cat.label : ""}</div>
          <div style={{ fontFamily: "var(--f-disp)", fontWeight: 700, fontSize: 23, letterSpacing: "-.02em", marginTop: 3 }}>{p.plan}</div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 6 }}>
            <span className="price" style={{ fontSize: 36, color: "var(--green)" }}>{planPrice(p)}</span>
            {p.price != null && <span style={{ color: "var(--ink-3)", fontWeight: 700 }}>/ חודש</span>}
          </div>

          {save > 0 && (
            <div className="hero" style={{ marginTop: 16, padding: 18 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div className="lbl">החיסכון שלך מול ₪{current} שאתה משלם היום</div>
                  <div className="big" style={{ fontSize: 38 }}>₪{save}<small> / שנה</small></div>
                </div>
                <div style={{ width: 54, height: 54, borderRadius: 16, background: "rgba(201,236,75,.18)", color: "var(--lime)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Icon n="trend" s={28} />
                </div>
              </div>
            </div>
          )}

          <div className="label" style={{ margin: "22px 2px 14px" }}>מה כלול במסלול</div>
          <div className="incl">
            {p.feats.map((f, i) => (
              <div className="it" key={i}><span className="ck"><Icon n={f.icon} s={14} /></span>{f.label}</div>
            ))}
          </div>

          {p.price != null && (
            <div className="card line" style={{ marginTop: 20, padding: 0, overflow: "hidden" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "13px 15px" }}>
                <span className="lbl-row">מחיר היכרות</span>
                <span style={{ fontFamily: "var(--f-disp)", fontWeight: 800, fontSize: 16, color: "var(--green)" }}>{planPrice(p)}<span style={{ fontSize: 11, color: "var(--ink-3)" }}> /ח'</span></span>
              </div>
              <div style={{ height: 1, background: "var(--line)" }}></div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "13px 15px" }}>
                <span className="lbl-row">מחיר לאחר התקופה</span>
                {planAfter(p)
                  ? <span style={{ fontFamily: "var(--f-disp)", fontWeight: 800, fontSize: 16, color: "var(--danger)" }}>{planAfter(p)}<span style={{ fontSize: 11, color: "var(--ink-3)" }}> /ח'</span></span>
                  : <span style={{ display: "inline-flex", gap: 5, alignItems: "center", fontWeight: 700, fontSize: 13, color: "var(--green)" }}><Icon n="check" s={15} /> מחיר קבוע</span>}
              </div>
              <div style={{ height: 1, background: "var(--line)" }}></div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "13px 15px" }}>
                <span className="lbl-row">תקופת התחייבות</span>
                <span style={{ fontWeight: 700, fontSize: 13.5 }}>{p.term || "ללא"}</span>
              </div>
              {cost24 != null && <React.Fragment>
                <div style={{ height: 1, background: "var(--line)" }}></div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "13px 15px", background: "var(--paper)" }}>
                  <span className="lbl-row" style={{ color: "var(--ink)" }}>עלות אמיתית ל-24 חודש</span>
                  <span style={{ fontFamily: "var(--f-disp)", fontWeight: 800, fontSize: 17 }}>₪{cost24.toLocaleString()}</span>
                </div>
              </React.Fragment>}
              {p.intro && <React.Fragment>
                <div style={{ height: 1, background: "var(--line)" }}></div>
                <div style={{ display: "flex", gap: 8, alignItems: "center", padding: "11px 15px", background: "rgba(201,236,75,.16)" }}>
                  <Icon n="gift" s={16} style={{ color: "var(--green)", flex: "0 0 auto" }} />
                  <span style={{ fontWeight: 700, fontSize: 12.5, color: "var(--green-d)" }}>{p.intro}</span>
                </div>
              </React.Fragment>}
            </div>
          )}

          {planWarn(p) && (
            <div className="card" style={{ marginTop: 14, display: "flex", gap: 11, alignItems: "center", background: "rgba(197,83,59,.08)", border: "1.5px solid rgba(197,83,59,.4)" }}>
              <div style={{ width: 36, height: 36, borderRadius: 11, background: "rgba(197,83,59,.15)", color: "var(--danger)", display: "flex", alignItems: "center", justifyContent: "center", flex: "0 0 auto", fontWeight: 800 }}>⚠</div>
              <div style={{ flex: 1, fontSize: 12.5, fontWeight: 700, color: "var(--danger)" }}>שימו לב: {planWarn(p)}. בדקו את העלות ל-24 חודש.</div>
            </div>
          )}

          <div className="label" style={{ margin: "22px 2px 12px" }}>איכות הרשת לפי הקהילה</div>
          <div className="card">
            {[["קליטה", q], ["מהירות", Math.max(0, q - 0.05)], ["שירות לקוחות", Math.max(0, q - 0.02)]].map((m, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 11, marginBottom: i < 2 ? 12 : 0 }}>
                <span style={{ flex: "0 0 78px", fontSize: 12.5, fontWeight: 700, color: "var(--ink-2)" }}>{m[0]}</span>
                <div style={{ flex: 1, height: 8, borderRadius: 6, background: "var(--line)", overflow: "hidden" }}>
                  <div style={{ width: Math.round(m[1] * 100) + "%", height: "100%", borderRadius: 6, background: "linear-gradient(90deg,var(--green),var(--green-2))" }}></div>
                </div>
                <span style={{ flex: "0 0 30px", textAlign: "end", fontFamily: "var(--f-disp)", fontWeight: 700, fontSize: 12.5 }}>{(m[1] * 5).toFixed(1)}</span>
              </div>
            ))}
          </div>

          <div className="card line" style={{ marginTop: 14, display: "flex", gap: 11, alignItems: "flex-start" }}>
            <Icon n="shield" s={19} style={{ color: "var(--ink-3)", flex: "0 0 auto", marginTop: 1 }} />
            <div style={{ fontSize: 12.5, color: "var(--ink-2)", fontWeight: 600, lineHeight: 1.5 }}>{p.fine}</div>
          </div>

          <div className={"card"} style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 12, borderColor: mon ? "var(--green)" : undefined, border: mon ? "1.5px solid var(--green)" : undefined }} onClick={() => { setMon(m => !m); app.showToast(mon ? "הניטור בוטל" : "ננטר עבורך — נודיע על ירידת מחיר"); }}>
            <div style={{ width: 40, height: 40, borderRadius: 12, background: mon ? "var(--green)" : "var(--paper-2)", color: mon ? "var(--lime)" : "var(--green)", display: "flex", alignItems: "center", justifyContent: "center", flex: "0 0 auto" }}><Icon n="bell" s={20} /></div>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: "var(--f-disp)", fontWeight: 600, fontSize: 14 }}>{mon ? "המסלול מנוטר ✓" : "נטרו עבורי ירידות מחיר"}</div>
              <div style={{ fontSize: 11.5, color: "var(--ink-3)", fontWeight: 600 }}>אוטומציה — נודיע כשיופיע מחיר זול יותר</div>
            </div>
            <div className={"sw" + (mon ? " on" : "")}></div>
          </div>
        </div>
      </div>
      <div className="stickybar">
        <button className="btn" onClick={() => app.go("lead")}>
          עברו למסלול הזה <Icon n="arrowL" s={19} />
        </button>
      </div>
    </div>
  );
}

Object.assign(window, { Results, PlanDetail, PlanCard });
