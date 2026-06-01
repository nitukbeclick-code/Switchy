/* proto-ui.jsx — icons + shared UI primitives */
const { useState, useEffect, useRef } = React;

const ICONS = {
  back: "M15 5l-7 7 7 7",
  fwd: "M9 5l7 7-7 7",
  up: "M5 15l7-7 7 7",
  down: "M5 9l7 7 7-7",
  search: "M11 19a8 8 0 100-16 8 8 0 000 16zm10 2l-4.3-4.3",
  filter: "M3 5h18M6 12h12M10 19h4",
  check: "M5 12l5 5L20 6",
  bell: "M6 9a6 6 0 1112 0c0 5 2 6 2 6H4s2-1 2-6M10 21h4",
  chat: "M4 5h16v11H9l-4 3v-3H4z",
  home: "M4 11l8-7 8 7M6 10v9h12v-9",
  compare: "M5 20V9M12 20V4M19 20v-7",
  track: "M7 4v11M7 19a2 2 0 100-4 2 2 0 000 4zM7 4a2 2 0 100 4M17 4l2 2-2 2h-7",
  user: "M12 12a4 4 0 100-8 4 4 0 000 8zM5 20c1-4 4-5 7-5s6 1 7 5",
  star: "M12 4l2.3 4.8 5.2.7-3.8 3.6 1 5.2-4.7-2.6-4.7 2.6 1-5.2L4.5 9.5l5.2-.7z",
  bolt: "M13 3L5 13h6l-1 8 8-10h-6z",
  shield: "M12 3l7 3v6c0 4-3 7-7 9-4-2-7-5-7-9V6z",
  globe: "M12 3a9 9 0 100 18 9 9 0 000-18zM3 12h18M12 3c2.5 2.5 2.5 15 0 18M12 3c-2.5 2.5-2.5 15 0 18",
  tv: "M3 5h18v12H3zM8 21h8M12 17v4",
  wifi: "M5 11a10 10 0 0114 0M8 14.5a5 5 0 018 0M12 18h.01",
  phone: "M5 4h4l2 5-2 1a11 11 0 005 5l1-2 5 2v4a2 2 0 01-2 2A16 16 0 013 6a2 2 0 012-2z",
  layers: "M12 3l9 5-9 5-9-5zM3 13l9 5 9-5",
  data: "M12 3c4 0 7 1.3 7 3s-3 3-7 3-7-1.3-7-3 3-3 7-3zM5 6v12c0 1.7 3 3 7 3s7-1.3 7-3V6M5 12c0 1.7 3 3 7 3s7-1.3 7-3",
  apps: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z",
  sim: "M6 3h8l4 4v14H6zM10 11h4v6h-4z",
  plus: "M12 5v14M5 12h14",
  minus: "M5 12h14",
  x: "M6 6l12 12M18 6L6 18",
  heart: "M12 20s-7-4.5-7-10a4 4 0 017-2.6A4 4 0 0119 10c0 5.5-7 10-7 10z",
  edit: "M4 20h4L19 9l-4-4L4 16zM14 6l4 4",
  spark: "M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2 2M16 16l2 2M18 6l-2 2M8 16l-2 2",
  clock: "M12 7v5l3 2M12 21a9 9 0 100-18 9 9 0 000 18",
  arrowL: "M19 12H5M11 6l-6 6 6 6",
  gift: "M4 11h16v9H4zM4 7h16v4H4zM12 7V20M12 7S10 3 7.5 4 8 7 12 7zM12 7s2-4 4.5-3-.5 3-4.5 3",
  trend: "M4 16l5-5 3 3 7-8M16 6h4v4",
  users: "M8 11a3 3 0 100-6 3 3 0 000 6zM2.5 19c.7-3 2.7-4.5 5.5-4.5s4.8 1.5 5.5 4.5M16 5.2a3 3 0 010 5.6M21.5 19c-.5-2.3-1.6-3.6-3.5-4.2",
};

function Icon({ n, s = 22, w = 1.85, fill, style }) {
  const d = ICONS[n] || "";
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill={fill || "none"} stroke="currentColor"
      strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" style={style}>
      <path d={d} />
    </svg>
  );
}

function StatusBar({ dark }) {
  return (
    <div className={"statusbar" + (dark ? " on-dark" : "")}>
      <span>9:41</span>
      <span className="sgroup">
        <svg width="18" height="12" viewBox="0 0 18 12" fill="currentColor"><rect x="0" y="7" width="3" height="5" rx="1"/><rect x="5" y="4" width="3" height="8" rx="1"/><rect x="10" y="2" width="3" height="10" rx="1"/><rect x="15" y="0" width="3" height="12" rx="1" opacity="1"/></svg>
        <svg width="17" height="12" viewBox="0 0 17 12" fill="none" stroke="currentColor" strokeWidth="1.4"><path d="M1 5a10 10 0 0115 0M3.5 7.5a6 6 0 018 0M8.5 10h.01"/></svg>
        <svg width="26" height="13" viewBox="0 0 26 13" fill="none"><rect x="1" y="1" width="21" height="11" rx="3" stroke="currentColor" strokeOpacity=".4"/><rect x="3" y="3" width="15" height="7" rx="1.5" fill="currentColor"/><rect x="23" y="4.5" width="2" height="4" rx="1" fill="currentColor" fillOpacity=".5"/></svg>
      </span>
    </div>
  );
}

function AppHeader({ title, sub, onBack, right, dark }) {
  return (
    <div className="apphead">
      {onBack
        ? <button className="iconbtn" onClick={onBack}><Icon n="fwd" s={20} /></button>
        : <button className="iconbtn ghost" style={{ width: 4 }}></button>}
      <div style={{ flex: 1 }}>
        <h2 style={dark ? { color: "#fff" } : null}>{title}</h2>
        {sub && <div className="sub">{sub}</div>}
      </div>
      {right || null}
    </div>
  );
}

const LOGO_MAP = {
  "019 מובייל": "019", "הוט מובייל": "hotmobile", "גולן טלקום": "golan",
  "סלקום": "cellcom", "סלקום Fiber": "cellcom", "סלקום TV+": "cellcom", "סלקום קוואטרו": "cellcom",
  "פרטנר": "partner", "פרטנר Fiber": "partner", "פרטנר טריפל": "partner", "פרטנר TV": "partner",
  "בזק": "bezeq", "אקספון 018": "xphone", "פלאפון": "pelephone",
  "HOT": "hot", "HOT טריפל": "hot",
  "IBC / ccc": "ccc", "FreeTV": "freetv",
  "STING+": "sting", "STING+ דאבל": "sting",
  "yes": "yes", "yes+ דאבל": "yes",
  "NEXT TV": "nexttv", "Gilat": "gilat", "Gilat Telecom": "gilat", "גילת": "gilat", "Triple C": "ccc",
};
function Logo({ name, style, h }) {
  const slug = LOGO_MAP[name];
  const height = h || (style && style.height) || 28;
  if (slug) {
    return (
      <span className="logo-img" style={{ height }}>
        <img src={"assets/logos/" + slug + ".png"} alt={name} />
      </span>
    );
  }
  const short = name.length > 11 ? name.slice(0, 10) + "…" : name;
  return <span className="logo" style={style}>{short}</span>;
}

function Stars({ r = 4 }) {
  const full = Math.round(r);
  return (
    <span style={{ display: "inline-flex", gap: 1, color: "var(--lime-d)" }}>
      {[0, 1, 2, 3, 4].map(i => <Icon key={i} n="star" s={13} w={i < full ? 0 : 1.6} fill={i < full ? "var(--lime-d)" : "none"} style={i < full ? null : { color: "var(--line-2)" }} />)}
    </span>
  );
}

const NAV = [
  { id: "home", lb: "בית", icon: "home" },
  { id: "results", lb: "השוואה", icon: "compare" },
  { id: "community", lb: "קהילה", icon: "users" },
  { id: "tracker", lb: "המעבר", icon: "track" },
  { id: "account", lb: "אישי", icon: "user" },
];
function BottomNav({ active, go }) {
  return (
    <div className="botnav">
      {NAV.map(it => (
        <div key={it.id} className={"navitem" + (active === it.id ? " on" : "")} onClick={() => go(it.id)}>
          <Icon n={it.icon} s={23} w={active === it.id ? 2.1 : 1.8} />
          <span className="lb">{it.lb}</span>
        </div>
      ))}
    </div>
  );
}

Object.assign(window, { Icon, StatusBar, AppHeader, Logo, Stars, BottomNav });
