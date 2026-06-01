/* app.jsx — explorer shell: tabs + tweaks */
const { useState, useEffect } = React;

const TABS = [
  ["1", "בית", () => <ScreenHome />],
  ["2", "שאלון", () => <ScreenQuiz />],
  ["3", "תוצאות", () => <ScreenResults />],
  ["4", "מסלול", () => <ScreenPlan />],
  ["5", "מעבר וניתוק", () => <ScreenSwitch />],
  ["6", "אזור אישי", () => <ScreenAccount />],
  ["7", "קטלוג ספקים", () => <ScreenCatalog />],
];

const ACCENTS = {
  "כחול": ["#2f6f8f", "#1f4d63"],
  "ירוק": ["#3c7d54", "#27583a"],
  "אדמדם": ["#c0623c", "#8c4225"],
  "סגול": ["#6a5aa0", "#473a73"],
};

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "accent": "כחול",
  "sketch": true,
  "handUI": false,
  "notes": true
}/*EDITMODE-END*/;

function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [tab, setTab] = useState(() => {
    const n = parseInt(localStorage.getItem("wf_tab") || "0", 10);
    return isNaN(n) ? 0 : Math.min(n, TABS.length - 1);
  });
  useEffect(() => { localStorage.setItem("wf_tab", String(tab)); }, [tab]);

  const [accent, accentInk] = ACCENTS[t.accent] || ACCENTS["כחול"];
  const rootCls = "wf-root"
    + (t.sketch ? "" : " no-sketch")
    + (t.handUI ? " hand" : "")
    + (t.notes ? "" : " hide-notes");

  const Active = TABS[tab][2];

  return (
    <div className={rootCls} style={{ "--accent": accent, "--accent-ink": accentInk }}>
      <div className="ex-head">
        <div className="ex-titrow">
          <span className="ex-kicker">סקיצות · אפליקציית השוואת תקשורת</span>
          <span className="ex-sub"><b>Wireframes לואו-פיי</b> · 7 שלבי זרימה · קטלוג מאוכלס · RTL</span>
        </div>
        <div className="ex-tabs">
          {TABS.map((tb, i) => (
            <div key={i} className={"ex-tab" + (i === tab ? " on" : "")} onClick={() => setTab(i)}>
              <span className="n">{tb[0]}</span>
              <span className="t">{tb[1]}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="canvas">
        <div className="legend">
          <span className="k"><span className="sw bar"></span> טקסט ממלא</span>
          <span className="k"><span className="sw img"></span> תמונה / לוגו</span>
          <span className="k"><span className="sw acc"></span> פעולה ראשית</span>
          <span className="k" style={{ fontFamily: "var(--hand)", fontSize: 16, color: "var(--accent-ink)" }}>↜ הערות עיצוב בכתב יד</span>
        </div>
        <Active />
      </div>

      <TweaksPanel title="Tweaks">
        <TweakSection label="סגנון שרטוט" />
        <TweakColor label="צבע הדגשה" value={ACCENTS[t.accent][0]}
          options={Object.values(ACCENTS).map(a => a[0])}
          onChange={(v) => {
            const key = Object.keys(ACCENTS).find(k => ACCENTS[k][0] === v) || "כחול";
            setTweak("accent", key);
          }} />
        <TweakToggle label="מסגרות מצוירות ביד" value={t.sketch} onChange={(v) => setTweak("sketch", v)} />
        <TweakToggle label="כתב יד בממשק" value={t.handUI} onChange={(v) => setTweak("handUI", v)} />
        <TweakToggle label="הצגת הערות עיצוב" value={t.notes} onChange={(v) => setTweak("notes", v)} />
      </TweaksPanel>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
