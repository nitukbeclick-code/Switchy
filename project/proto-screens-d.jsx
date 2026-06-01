/* proto-screens-d.jsx — Community chat (feed + channels + composer) */

const CHANNELS = ["הכל", "המלצות", "סלולר", "אינטרנט", "טלוויזיה", "עזרה בניתוק"];

const SEED = [
  { id: 1, name: "רונן מ.", init: "ר", c: "#1E7A4F", channel: "המלצות", time: "לפני 5 דק׳", text: "עברתי לגולן 250GB ב-5G במחיר 39 ₪ דרך האפליקציה. החיסכון מטורף, ממליץ בחום!", likes: 14, liked: false, replies: 3, deal: { provider: "גולן טלקום", price: "~₪39" } },
  { id: 2, name: "מאיה ל.", init: "מ", c: "#C5533B", channel: "עזרה בניתוק", time: "לפני 12 דק׳", text: "מישהו יודע כמה זמן לוקח הניתוק מהוט? אני באמצע התהליך וקצת לחוצה 😅", likes: 2, liked: false, replies: 5, help: true },
  { id: 3, name: "צוות חוסך", init: "✓", c: "#0E3A26", team: true, channel: "עזרה בניתוק", time: "לפני 10 דק׳", text: "היי מאיה! בממוצע 3–5 ימי עסקים. הנציגה שלך מלווה אותך עד הסיום — אנחנו על זה 💚", likes: 9, liked: false, replies: 0 },
  { id: 4, name: "דוד כ.", init: "ד", c: "#46574E", channel: "סלולר", time: "לפני 30 דק׳", text: "שאלה: שווה לעבור מ-100GB ל-1500GB אם אני בקושי מגיע ל-40GB בחודש?", likes: 1, liked: false, replies: 7 },
  { id: 5, name: "נועה ש.", init: "נ", c: "#1E7A4F", verified: true, channel: "אינטרנט", time: "לפני שעה", text: "פרטנר Fiber 1000Mb החליף לי את החיים — מהירות מטורפת והתקנה חלקה. ממליצה!", likes: 21, liked: true, replies: 4, deal: { provider: "פרטנר Fiber", price: "~₪119" } },
  { id: 6, name: "אבי ב.", init: "א", c: "#A9CE32", channel: "טלוויזיה", time: "לפני שעתיים", text: "מי שמחפש לחסוך על TV — STING+ ב-49 ₪ ללא התחייבות זה הכי משתלם שיש כרגע.", likes: 11, liked: false, replies: 6, deal: { provider: "STING+", price: "₪49" } },
];

function Avatar({ init, c }) {
  return <span className="avatar" style={{ background: c, color: c === "#A9CE32" ? "var(--green-d)" : "#fff" }}>{init}</span>;
}

function Message({ m, onLike, onOpen }) {
  return (
    <div className="msg">
      <Avatar init={m.init} c={m.c} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="who">
          <span className="nm">{m.name}</span>
          {m.team && <span className="badge-team"><Icon n="shield" s={11} /> צוות</span>}
          {m.verified && <span className="badge-team" style={{ background: "var(--green)", color: "#fff" }}><Icon n="check" s={11} /> עבר דרכנו</span>}
          {m.help && <span className="badge-help">בקשת עזרה</span>}
          <span className="ch">{m.channel}</span>
          <span className="tm">· {m.time}</span>
        </div>
        <div className="tx">{m.text}</div>
        {m.deal && (
          <div className="deal-mini">
            <Logo name={m.deal.provider} />
            <span style={{ fontSize: 12, color: "var(--ink-3)", fontWeight: 700 }}>דיל שהומלץ</span>
            <span className="pr">{m.deal.price}</span>
          </div>
        )}
        <div className="acts">
          <span className={"act" + (m.liked ? " liked" : "")} onClick={() => onLike(m.id)}>
            <Icon n="heart" s={16} fill={m.liked ? "var(--danger)" : "none"} /> {m.likes}
          </span>
          <span className="act" onClick={() => onOpen && onOpen(m)}><Icon n="chat" s={16} /> {m.replies} תגובות</span>
          <span className="act"><Icon n="up" s={16} /> שיתוף</span>
        </div>
      </div>
    </div>
  );
}

function Community({ app }) {
  const [msgs, setMsgs] = useState(SEED);
  const [ch, setCh] = useState("הכל");
  const [draft, setDraft] = useState("");

  const like = (id) => setMsgs(ms => ms.map(m => m.id === id ? { ...m, liked: !m.liked, likes: m.likes + (m.liked ? -1 : 1) } : m));
  const send = () => {
    const t = draft.trim(); if (!t) return;
    const channel = ch === "הכל" ? "המלצות" : ch;
    setMsgs(ms => [{ id: Date.now(), name: "דני (אני)", init: "א", c: "#15603E", channel, time: "עכשיו", text: t, likes: 0, liked: false, replies: 0 }, ...ms]);
    setDraft("");
  };
  const list = msgs.filter(m => ch === "הכל" || m.channel === ch);

  return (
    <div style={{ position: "relative", flex: 1, display: "flex", flexDirection: "column" }}>
      <div className="view-scroll">
        <AppHeader title="קהילת החוסכים" sub="1,240 חברים"
          right={<div style={{ display: "flex", gap: 8, alignItems: "center" }}><div className="onlinebar"><span className="dot"></span>38</div><button className="iconbtn" onClick={() => app.go("ratings")} title="דירוג ספקים"><Icon n="star" s={19} /></button></div>} />
        <div className="pad" style={{ paddingTop: 4, paddingBottom: 96 }}>
          <div className="pin">
            <Icon n="bolt" s={18} className="ic" style={{ color: "var(--lime)", flex: "0 0 auto" }} />
            <div>
              <div className="t">שתפו, המליצו, עזרו זה לזה</div>
              <div className="d">מצאתם דיל משתלם? תקועים בניתוק? הקהילה והצוות שלנו כאן בשבילכם.</div>
            </div>
          </div>

          <div className="chiprow" style={{ margin: "12px 0 6px" }}>
            {CHANNELS.map(c => <span key={c} className={"chip" + (c === ch ? " on" : "")} onClick={() => setCh(c)}>{c}</span>)}
          </div>

          <div>
            {list.map(m => <Message key={m.id} m={m} onLike={like} onOpen={app.openThread} />)}
            {list.length === 0 && <div className="disclaimer" style={{ padding: 30 }}>אין עדיין הודעות בערוץ הזה. היו הראשונים!</div>}
          </div>
        </div>
      </div>

      <div className="composer">
        <input className="input" placeholder="שתפו המלצה או בקשת עזרה…" value={draft}
          onChange={e => setDraft(e.target.value)} onKeyDown={e => e.key === "Enter" && send()} />
        <button className="send" disabled={!draft.trim()} onClick={send}><Icon n="up" s={22} w={2.4} /></button>
      </div>
    </div>
  );
}

Object.assign(window, { Community });
