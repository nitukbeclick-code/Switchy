/* proto-app.jsx — router, phone frame, transitions, state */

const SCREENS = { home: Home, quiz: Quiz, results: Results, plan: PlanDetail, lead: Lead, success: Success, tracker: Tracker, account: Account, alerts: Alerts, community: Community, compare: Compare, thread: Thread, onboarding: Onboarding, bills: Bills, ratings: Ratings, profile: Profile, auth: Auth, chat: Chat, porting: Porting, agent: Agent, availability: Availability, switchcalc: SwitchCalc, situation: Situation, twofa: TwoFA, callback: Callback, ai: AIAdvisor };
const NAV_SCREENS = ["home", "results", "community", "tracker", "account"];
const LS = "smartsaver_v1";

function App() {
  const init = (() => { try { return JSON.parse(localStorage.getItem(LS)) || {}; } catch (e) { return {}; } })();
  const [screen, setScreen] = useState(init.screen || (!localStorage.getItem("onb_v1") ? "onboarding" : (!localStorage.getItem("auth_v1") ? "auth" : "home")));
  const [anim, setAnim] = useState("anim-fade");
  const [cat, setCatState] = useState(init.cat || "cellular");
  const [planId, setPlanId] = useState(init.planId || "c5");
  const [data, setData] = useState(init.data || {});
  const [toast, setToast] = useState(null);
  const [prefs, setPrefs] = useState({});
  const [compare, setCompare] = useState(init.compare || []);
  const [threadMsg, setThreadMsg] = useState(null);
  const [dark, setDark] = useState(!!init.dark);
  const [faceid, setFaceid] = useState(!!init.faceid);
  const [twofa, setTwofa] = useState(!!init.twofa);
  const [lang, setLang] = useState(init.lang || "עברית");
  const scrollRef = useRef(null);

  useEffect(() => {
    localStorage.setItem(LS, JSON.stringify({ screen, cat, planId, data, compare, dark, faceid, twofa, lang }));
  }, [screen, cat, planId, data, compare, dark, faceid, twofa, lang]);

  // reset scroll on screen change
  useEffect(() => {
    const el = document.querySelector(".view .view-scroll");
    if (el) el.scrollTop = 0;
  }, [screen]);

  const navTo = (s, a) => { setAnim(a); setScreen(s); };
  const go = (s) => navTo(s, NAV_SCREENS.includes(s) && NAV_SCREENS.includes(screen) ? "anim-fade" : "anim-fwd");
  const back = (s) => navTo(s, "anim-back");
  const selectCat = (id) => { setCatState(id); navTo("quiz", "anim-fwd"); };
  const setCat = (id) => setCatState(id);
  const selectPlan = (id) => { setPlanId(id); navTo("plan", "anim-fwd"); };
  const set = (obj) => setData(d => ({ ...d, ...obj }));
  const showToast = (m) => { setToast(m); clearTimeout(window.__tt); window.__tt = setTimeout(() => setToast(null), 2400); };

  const toggleCompare = (id) => setCompare(c => c.includes(id) ? c.filter(x => x !== id) : (c.length >= 3 ? c : [...c, id]));
  const openThread = (m) => { setThreadMsg(m); navTo("thread", "anim-fwd"); };
  const finishOnb = () => { localStorage.setItem("onb_v1", "1"); navTo(localStorage.getItem("auth_v1") ? "home" : "auth", "anim-fwd"); };
  const finishAuth = () => { localStorage.setItem("auth_v1", "1"); navTo("home", "anim-fwd"); };
  const logout = () => { localStorage.removeItem("auth_v1"); navTo("auth", "anim-back"); };
  const toggleDark = () => setDark(d => !d);
  const toggleFace = () => setFaceid(v => !v);

  const app = { screen, go, back, cat, setCat, selectCat, planId, selectPlan, data, set, showToast, prefs, setPrefs, compare, toggleCompare, threadMsg, openThread, finishOnb, finishAuth, logout, dark, toggleDark, faceid, toggleFace, twofa, setTwofa, lang, setLang };
  const Comp = SCREENS[screen] || Home;
  const showNav = NAV_SCREENS.includes(screen);
  const navGo = (id) => navTo(id, "anim-fade");

  return (
    <div id="stage">
      <div className="context">
        <div className="brand"><div className="mk"><Icon n="bolt" s={19} fill="var(--lime)" style={{ color: "var(--lime)" }} /></div><b>חוסך · Smart Saver</b></div>
        <h1>כל שוק התקשורת,<br /><em>במסלול אחד חכם.</em></h1>
        <p>פרוטוטייפ לחיץ — סלולר, אינטרנט, טלוויזיה, טריפל וחו״ל. השוו, בחרו, ואנחנו מלווים אתכם עד הניתוק מהספק הישן.</p>
        <div className="hintlist">
          <div className="h"><span className="n">1</span><div>בחרו תחום → ענו 3 שאלות → קבלו התאמות אמיתיות מכל החברות.</div></div>
          <div className="h"><span className="n">2</span><div>נסו את הסינון, המיון ומעבר בין קטגוריות במסך ההשוואה.</div></div>
          <div className="h"><span className="n">3</span><div>״עברו למסלול״ → טופס → מעקב ליווי הניתוק.</div></div>
        </div>
      </div>

      <div className="phone">
        <div className="notch"></div>
        <div className={"screen" + (dark ? " dark" : "")}>
          <StatusBar dark={screen === "onboarding"} />
          <div className="view">
            <div key={screen} className={anim} style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column" }}>
              <Comp app={app} />
            </div>
          </div>
          {showNav && <BottomNav active={screen} go={navGo} />}
          {(screen === "home" || screen === "results") && (
            <button className="fab" onClick={() => navTo("callback", "anim-fwd")}><Icon n="phone" s={18} /> שיחה חוזרת</button>
          )}
          {toast && <div className="toast"><Icon n="chat" s={17} style={{ color: "var(--lime)" }} />{toast}</div>}
        </div>
      </div>
    </div>
  );
}

function fitStage() {
  const stage = document.getElementById("stage");
  if (!stage) return;
  const wide = window.innerWidth >= 960;
  const w = (wide ? 392 + 54 + 300 : 392) + 48;
  const h = 844 + 40;
  const scale = Math.min(window.innerWidth / w, window.innerHeight / h, 1);
  stage.style.transform = "scale(" + scale + ")";
  stage.style.transformOrigin = "center center";
}
window.addEventListener("resize", fitStage);

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
setTimeout(fitStage, 60);
