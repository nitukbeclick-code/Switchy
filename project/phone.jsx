/* phone.jsx — sketch wireframe primitives + phone frame (RTL Hebrew) */

function Status() {
  return (
    <div className="statusbar">
      <span>9:41</span>
      <span className="dots"><i></i><i></i><i></i><i className="bat"></i></span>
    </div>
  );
}

function Phone({ tag, caption, children }) {
  return (
    <div className="phone-wrap">
      <div className="phone">
        <div className="scr">
          <Status />
          {children}
        </div>
      </div>
      {caption && <div className="caption"><b>{tag}</b>{caption}</div>}
    </div>
  );
}

function AppBar({ title, nav = "›", action }) {
  return (
    <div className="appbar">
      <span className="nav">{nav}</span>
      <span className="h">{title}</span>
      {action ? <span className="act">{action}</span> : <span style={{ width: 22 }}></span>}
    </div>
  );
}

function Body({ children, gap = 12, style, scroll }) {
  return <div className={"body" + (scroll ? " scroll" : "")} style={{ gap, ...style }}>{children}</div>;
}

function TabBar({ active = 0 }) {
  const items = [["", "בית"], ["r", "השוואה"], ["d", "מעקב"], ["", "אזור אישי"]];
  return (
    <div className="tabbar">
      {items.map((it, i) => (
        <div key={i} className={"tb " + it[0] + (i === active ? " on" : "")}>
          <span className="i"></span><span>{it[1]}</span>
        </div>
      ))}
    </div>
  );
}

/* placeholder text bars */
function Bar({ w = "100%", d, t, mt, style }) {
  return <span className={"wf-bar" + (d ? " d" : "") + (t ? " t" : "")} style={{ width: w, marginTop: mt, ...style }}></span>;
}
function Lines({ ws = ["100%", "80%", "60%"], gap = 6, mt }) {
  return <span className="stack" style={{ gap, marginTop: mt }}>{ws.map((w, i) => <Bar key={i} w={w} />)}</span>;
}

function Card({ children, className = "", style, onAlt }) {
  return <div className={"wf-card " + className} style={style}>{children}</div>;
}

function Btn({ children, variant = "", style }) {
  return <div className={"wf-btn " + variant} style={style}>{children}</div>;
}

function Chip({ children, on, hl, style }) {
  return <span className={"wf-chip" + (on ? " on" : "") + (hl ? " hl" : "")} style={style}>{children}</span>;
}

function Img({ label, h = 90, w = "100%", style }) {
  return <div className="wf-img" style={{ height: h, width: w, ...style }}><span>{label}</span></div>;
}

function Ic({ shape = "", accent, children, style }) {
  return <span className={"ic " + shape + (accent ? " accent" : "")} style={style}>{children}</span>;
}

function Note({ children, brush, style }) {
  return <div className={"note" + (brush ? " b" : "")} style={style}>{children}</div>;
}

function Row({ children, gap = 8, style, align = "center", justify }) {
  return <div className="row" style={{ gap, alignItems: align, justifyContent: justify, ...style }}>{children}</div>;
}
function Stack({ children, gap = 8, style }) {
  return <div className="stack" style={{ gap, ...style }}>{children}</div>;
}
function Stars({ n = 4 }) {
  return <span className="star">{"★".repeat(n)}<span className="muted">{"★".repeat(5 - n)}</span></span>;
}

/* provider logo placeholder pill */
function Logo({ name, style }) {
  return (
    <div className="wf-img" style={{ height: 30, width: 64, borderRadius: 7, ...style }}>
      <span style={{ fontSize: 11 }}>{name}</span>
    </div>
  );
}

/* step wrapper: heading + row of phones */
function Step({ title, desc, hint, children }) {
  return (
    <React.Fragment>
      <div className="step-head">
        <h2>{title}</h2>
        <div className="desc">{desc}</div>
        {hint && <div className="arrow">{hint}</div>}
      </div>
      <div className="phone-row">{children}</div>
    </React.Fragment>
  );
}

Object.assign(window, {
  Status, Phone, AppBar, Body, TabBar, Bar, Lines, Card, Btn, Chip, Img, Ic, Note, Row, Stack, Stars, Logo, Step,
});
