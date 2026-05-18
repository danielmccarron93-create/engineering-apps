/* global React, Icon */

// ───────────────────────── RAFT DESIGNER MODAL ─────────────────────────
function RaftDesigner({ onClose }) {
  const [tab, setTab] = React.useState("layout");
  const [siteClass, setSiteClass] = React.useState("M");
  const [construction, setConstruction] = React.useState("Articulated Masonry Veneer");
  const [bw, setBw] = React.useState(300);
  const [bd, setBd] = React.useState(500);
  const [conc, setConc] = React.useState("N32");
  const [slabT, setSlabT] = React.useState(100);

  const maxSpacing = { A: 6.0, S: 6.0, M: 4.5, "H1": 4.0, "H2": 3.6, E: 3.0 }[siteClass];

  return (
    <div className="overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ width: "min(1180px, 96vw)", height: "min(760px, 92vh)", display: "flex", flexDirection: "column" }}>
        {/* Header */}
        <div className="modal-hdr">
          <div>
            <div className="modal-title-block">
              <div className="modal-title">Raft Slab Designer</div>
              <span className="modal-eyebrow">AS 2870-2011</span>
            </div>
            <div className="modal-sub">Site class {siteClass} · {construction.toLowerCase()} · max beam spacing {maxSpacing.toFixed(1)} m</div>
          </div>
          <button className="modal-close" onClick={onClose} title="Close (Esc)"><Icon.Close /></button>
        </div>

        {/* Tabs */}
        <div className="tabs">
          <button className={`tab ${tab==="parameters"?"on":""}`} onClick={()=>setTab("parameters")}>Parameters</button>
          <button className={`tab ${tab==="layout"?"on":""}`} onClick={()=>setTab("layout")}>Layout & Compliance <span className="tcount">7/7</span></button>
          <button className={`tab ${tab==="reinf"?"on":""}`} onClick={()=>setTab("reinf")}>Reinforcement</button>
          <button className={`tab ${tab==="calcs"?"on":""}`} onClick={()=>setTab("calcs")}>Calc Sheet</button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflow: "hidden", display: "grid", gridTemplateColumns: "340px 1fr 320px", background: "var(--bg-app)" }}>
          {/* LEFT — Parameters */}
          <div style={{ overflow: "auto", padding: "18px", borderRight: "1px solid var(--line-1)", background: "var(--bg-surface)" }}>
            <div className="card-title">Design Parameters</div>

            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div className="field">
                <span className="field-label">Site Class</span>
                <select className="in" value={siteClass} onChange={(e)=>setSiteClass(e.target.value)}>
                  {["A","S","M","H1","H2","E"].map(c => (
                    <option key={c} value={c}>{c} — max {({A:6,S:6,M:4.5,H1:4,H2:3.6,E:3})[c]} m spacing</option>
                  ))}
                </select>
              </div>

              <div className="field">
                <span className="field-label">Construction Type</span>
                <select className="in" value={construction} onChange={(e)=>setConstruction(e.target.value)}>
                  <option>Articulated Masonry Veneer</option>
                  <option>Full Masonry</option>
                  <option>Brick Veneer</option>
                  <option>Light-Clad Frame</option>
                </select>
              </div>

              <div className="field-row">
                <div className="field">
                  <span className="field-label">Beam Width</span>
                  <input className="in mono" type="number" value={bw} step={50} onChange={(e)=>setBw(+e.target.value)} />
                </div>
                <div className="field">
                  <span className="field-label">Beam Depth</span>
                  <input className="in mono" type="number" value={bd} step={50} onChange={(e)=>setBd(+e.target.value)} />
                </div>
              </div>

              <div className="field-row">
                <div className="field">
                  <span className="field-label">Concrete</span>
                  <select className="in" value={conc} onChange={(e)=>setConc(e.target.value)}>
                    {["N20","N25","N32","N40"].map(g=><option key={g}>{g}</option>)}
                  </select>
                </div>
                <div className="field">
                  <span className="field-label">Slab Thick.</span>
                  <input className="in mono" type="number" value={slabT} step={5} onChange={(e)=>setSlabT(+e.target.value)} />
                </div>
              </div>
            </div>

            <div style={{ height: 22 }}></div>
            <div className="card-title">Slab Outline</div>
            <p style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: 12.5, color: "var(--ink-3)", lineHeight: 1.5, marginBottom: 12 }}>
              Click vertices on the sheet, or pick a preset to start.
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {[
                { id: "rect", label: "Rectangle" },
                { id: "L", label: "L-Shape" },
                { id: "U", label: "U-Shape" },
                { id: "T", label: "T-Shape" },
              ].map(p => (
                <button key={p.id} className="btn" style={{ height: 56, flexDirection: "column", gap: 4, justifyContent: "center" }}>
                  <ShapePreview shape={p.id} />
                  <span style={{ fontSize: 11.5, fontWeight: 500 }}>{p.label}</span>
                </button>
              ))}
            </div>

            <div style={{ height: 22 }}></div>
            <div className="card-title">Vertices</div>
            <div style={{ background: "var(--bg-elevated)", border: "1px solid var(--line-1)", borderRadius: 8, padding: 6, fontFamily: "var(--font-mono)", fontSize: 11.5, color: "var(--ink-2)" }}>
              {[
                ["V0", 0.0, 0.0],
                ["V1", 14.4, 0.0],
                ["V2", 14.4, 9.4],
                ["V3", 7.2, 9.4],
                ["V4", 7.2, 6.6],
                ["V5", 0.0, 6.6],
              ].map(([k,x,y]) => (
                <div key={k} style={{ display: "flex", padding: "4px 6px", borderRadius: 4, gap: 12 }}>
                  <span style={{ color: "var(--ink-4)", width: 28 }}>{k}</span>
                  <span>({x.toFixed(1)}, {y.toFixed(1)}) m</span>
                </div>
              ))}
            </div>
          </div>

          {/* MIDDLE — Drawing */}
          <div style={{ position: "relative", overflow: "hidden", background: "var(--bg-canvas)" }}>
            <RaftSketch />
            <div style={{ position: "absolute", top: 16, left: 16, display: "flex", gap: 6 }}>
              <span className="kbd-chip"><strong style={{color: "var(--ink-1)"}}>L-Shape</strong></span>
              <span className="kbd-chip">14.4 × 9.4 m</span>
              <span className="kbd-chip">120.96 m² floor</span>
            </div>
            <div style={{ position: "absolute", bottom: 16, right: 16, display: "flex", gap: 6 }}>
              <button className="btn ghost">Re-solve</button>
              <button className="btn"><Icon.Plus />Add vertex</button>
            </div>
          </div>

          {/* RIGHT — Compliance & Stats */}
          <div style={{ overflow: "auto", padding: 18, borderLeft: "1px solid var(--line-1)", background: "var(--bg-surface)" }}>
            <div className="summary-card">
              <div className="summary-ic"><Icon.Check /></div>
              <div className="summary-text">
                <div className="summary-title">All checks pass</div>
                <div className="summary-sub">Layout satisfies AS 2870-2011 for site class {siteClass}.</div>
              </div>
            </div>

            <div style={{ height: 18 }}></div>
            <div className="card-title">Layout Compliance</div>
            <div className="check pass">
              <span className="check-ic"><Icon.Check /></span>
              <span className="check-label">E–W beam spacing</span>
              <span className="check-val">3.92 ≤ 4.5 m</span>
            </div>
            <div className="check pass">
              <span className="check-ic"><Icon.Check /></span>
              <span className="check-label">N–S beam spacing</span>
              <span className="check-val">3.20 ≤ 4.5 m</span>
            </div>
            <div className="check pass">
              <span className="check-ic"><Icon.Check /></span>
              <span className="check-label">4.0 m corner rule</span>
              <span className="check-val">Pass</span>
            </div>
            <div className="check pass">
              <span className="check-ic"><Icon.Check /></span>
              <span className="check-label">Re-entrant edge beam</span>
              <span className="check-val">2 found</span>
            </div>
            <div className="check pass">
              <span className="check-ic"><Icon.Check /></span>
              <span className="check-label">Anti-crack reo zones</span>
              <span className="check-val">N12 @ 200</span>
            </div>

            <div style={{ height: 18 }}></div>
            <div className="card-title">Quantities</div>
            <div className="stat-grid">
              <div className="stat">
                <div className="stat-k">Edge</div>
                <div className="stat-v">52.0<span className="stat-u">m</span></div>
              </div>
              <div className="stat">
                <div className="stat-k">Internal</div>
                <div className="stat-v">38.6<span className="stat-u">m</span></div>
              </div>
              <div className="stat">
                <div className="stat-k">Slab</div>
                <div className="stat-v">121<span className="stat-u">m²</span></div>
              </div>
              <div className="stat">
                <div className="stat-k">Conc.</div>
                <div className="stat-v">25.7<span className="stat-u">m³</span></div>
              </div>
              <div className="stat">
                <div className="stat-k">Reo</div>
                <div className="stat-v">1.84<span className="stat-u">t</span></div>
              </div>
              <div className="stat">
                <div className="stat-k">Excav.</div>
                <div className="stat-v">68<span className="stat-u">m³</span></div>
              </div>
            </div>

            <div style={{ height: 18 }}></div>
            <div className="card-title">Section Capacity</div>
            <div style={{ background: "var(--bg-elevated)", border: "1px solid var(--line-1)", borderRadius: 10, padding: "12px 14px" }}>
              <div className="bar">
                <span className="bar-label">M*/φMu</span>
                <span className="bar-track"><span className="bar-fill" style={{ width: "62%" }}></span></span>
                <span className="bar-val">0.62</span>
              </div>
              <div className="bar">
                <span className="bar-label">V*/φVu</span>
                <span className="bar-track"><span className="bar-fill" style={{ width: "38%", background: "var(--ok)" }}></span></span>
                <span className="bar-val">0.38</span>
              </div>
              <div className="bar">
                <span className="bar-label">Δ/Δlim</span>
                <span className="bar-track"><span className="bar-fill" style={{ width: "71%" }}></span></span>
                <span className="bar-val">0.71</span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="modal-ftr">
          <span className="ftr-note">Layout solved in 184 ms · last verified 2 min ago.</span>
          <div className="ftr-spacer"></div>
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn">Run calcs</button>
          <button className="btn primary">Commit to drawing</button>
        </div>
      </div>
    </div>
  );
}

// Simple SVG previews for the slab shape buttons
function ShapePreview({ shape }) {
  const stroke = "currentColor";
  const fill = "var(--accent-soft)";
  if (shape === "rect")
    return <svg width="40" height="22" viewBox="0 0 40 22"><rect x="3" y="3" width="34" height="16" fill={fill} stroke={stroke} strokeWidth="1.2"/></svg>;
  if (shape === "L")
    return <svg width="40" height="22" viewBox="0 0 40 22"><path d="M3 3h34v10H22v6H3z" fill={fill} stroke={stroke} strokeWidth="1.2" strokeLinejoin="round"/></svg>;
  if (shape === "U")
    return <svg width="40" height="22" viewBox="0 0 40 22"><path d="M3 3h34v16H26v-8H14v8H3z" fill={fill} stroke={stroke} strokeWidth="1.2" strokeLinejoin="round"/></svg>;
  return <svg width="40" height="22" viewBox="0 0 40 22"><path d="M3 3h34v6H24v10H16V9H3z" fill={fill} stroke={stroke} strokeWidth="1.2" strokeLinejoin="round"/></svg>;
}

// Mini drawing of the raft slab inside the modal
function RaftSketch() {
  const W = 1440, H = 940; // mm * 0.1
  const outline = "0,0 1440,0 1440,940 720,940 720,660 0,660";
  // Beams (E-W and N-S) inside outline
  const beamsEW = [220, 440, 660];
  const beamsNS = [400, 720, 1080];
  return (
    <svg viewBox="-100 -100 1640 1140" style={{ width: "100%", height: "100%" }}>
      <defs>
        <pattern id="rdots" patternUnits="userSpaceOnUse" width="36" height="36">
          <circle cx="18" cy="18" r="1.6" fill="var(--accent)" opacity="0.18"/>
        </pattern>
      </defs>
      {/* Light grid */}
      <g opacity="0.4">
        {Array.from({length: 18}, (_, i) => (
          <line key={`v-${i}`} x1={i*100} y1={-100} x2={i*100} y2={1100}
                stroke="var(--plan-grid)" strokeWidth="1"/>
        ))}
        {Array.from({length: 12}, (_, i) => (
          <line key={`h-${i}`} x1={-100} y1={i*100} x2={1700} y2={i*100}
                stroke="var(--plan-grid)" strokeWidth="1"/>
        ))}
      </g>

      {/* Slab fill */}
      <polygon points={outline} fill="url(#rdots)" />
      <polygon points={outline} fill="none" stroke="var(--plan-beam)" strokeWidth="6" />

      {/* Internal beams (clipped to outline) */}
      <g stroke="var(--plan-beam)" strokeWidth="3" strokeDasharray="10 6" opacity="0.85">
        {beamsEW.map((y, i) => {
          const isInRecess = y > 660;
          const x2 = isInRecess ? 720 : 1440;
          return <line key={`ew-${i}`} x1={0} y1={y} x2={x2} y2={y}/>;
        })}
        {beamsNS.map((x, i) => {
          const y2 = x > 720 ? 660 : 940;
          return <line key={`ns-${i}`} x1={x} y1={0} x2={x} y2={y2}/>;
        })}
      </g>

      {/* Vertex dots */}
      {[[0,0],[1440,0],[1440,940],[720,940],[720,660],[0,660]].map(([x,y],i)=>(
        <g key={i}>
          <circle cx={x} cy={y} r="11" fill="var(--bg-elevated)" stroke="var(--accent)" strokeWidth="3"/>
          <text x={x+18} y={y-12} fontFamily="Geist Mono, monospace" fontSize="22"
                fontWeight="600" fill="var(--ink-2)">V{i}</text>
        </g>
      ))}

      {/* Dimension chain top */}
      <g stroke="var(--plan-dim)" strokeWidth="2" fontFamily="Geist Mono, monospace" fontSize="26" fill="var(--plan-dim)">
        <line x1="0" y1="-50" x2="1440" y2="-50"/>
        <line x1="0" y1="-30" x2="0" y2="-70"/>
        <line x1="1440" y1="-30" x2="1440" y2="-70"/>
        <text x="720" y="-72" textAnchor="middle" fontWeight="500" fill="var(--plan-ink)">14 400</text>
      </g>
      {/* Dimension chain right */}
      <g stroke="var(--plan-dim)" strokeWidth="2" fontFamily="Geist Mono, monospace" fontSize="26" fill="var(--plan-dim)">
        <line x1="1490" y1="0" x2="1490" y2="940"/>
        <line x1="1470" y1="0" x2="1510" y2="0"/>
        <line x1="1470" y1="940" x2="1510" y2="940"/>
        <text x="1525" y="475" fontWeight="500" fill="var(--plan-ink)">9 400</text>
      </g>
    </svg>
  );
}

// ───────────────────────── SCHEDULES MODAL ─────────────────────────
function Schedules({ onClose }) {
  const tabs = [
    { id: "padfooting", label: "Pad Footings", count: 4 },
    { id: "stripfooting", label: "Strip Footings", count: 3 },
    { id: "beam", label: "Steel Beams", count: 8 },
    { id: "floorBeam", label: "Floor Beams", count: 5 },
    { id: "column", label: "Columns", count: 6 },
    { id: "wall", label: "Walls", count: 7 },
    { id: "bracingWall", label: "Bracing", count: 4 },
    { id: "floorLoad", label: "Floor Loads", count: 3 },
    { id: "joist", label: "Joists", count: 4 },
  ];
  const [tab, setTab] = React.useState("beam");

  return (
    <div className="overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ width: "min(1240px, 96vw)", height: "min(800px, 94vh)", display: "flex", flexDirection: "column" }}>
        <div className="modal-hdr">
          <div>
            <div className="modal-title-block">
              <div className="modal-title">Schedules</div>
              <span className="modal-eyebrow">Live · linked to drawing</span>
            </div>
            <div className="modal-sub">Edit a type to update every instance in the drawing. Counts refresh in real time.</div>
          </div>
          <button className="modal-close" onClick={onClose}><Icon.Close /></button>
        </div>

        <div className="tabs" style={{ overflowX: "auto", whiteSpace: "nowrap" }}>
          {tabs.map(t => (
            <button key={t.id} className={`tab ${t.id===tab?"on":""}`} onClick={()=>setTab(t.id)}>
              {t.label} <span className="tcount">{t.count}</span>
            </button>
          ))}
        </div>

        <div style={{ flex: 1, overflow: "hidden", padding: 18, background: "var(--bg-app)" }}>
          {tab === "beam" && <BeamSchedule />}
          {tab === "padfooting" && <PadFootingSchedule />}
          {tab === "column" && <ColumnSchedule />}
          {tab === "wall" && <WallSchedule />}
          {tab === "floorLoad" && <FloorLoadSchedule />}
          {tab === "joist" && <JoistSchedule />}
          {tab === "stripfooting" && <StripFootingSchedule />}
          {tab === "floorBeam" && <BeamSchedule floor />}
          {tab === "bracingWall" && <BracingSchedule />}
        </div>

        <div className="modal-ftr">
          <span className="ftr-note">Tap any value to edit · use ↑ ↓ to nudge dimensions · ⌘ S saves.</span>
          <div className="ftr-spacer"></div>
          <button className="btn ghost"><Icon.PDF /> Export CSV</button>
          <button className="btn"><Icon.Plus /> Add type</button>
          <button className="btn primary" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );
}

function SchedWrap({ children, head }) {
  return (
    <div className="sched-wrap" style={{ height: "100%" }}>
      <table className="sched">
        <thead><tr>{head.map((h,i)=><th key={i}>{h}</th>)}</tr></thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

function MarkCell({ color, mark }) {
  return (
    <span className="mark">
      <span className="sched-color-chip" style={{ background: color }}></span>
      <strong style={{ fontWeight: 600 }}>{mark}</strong>
    </span>
  );
}

function BeamSchedule({ floor }) {
  const rows = floor ? [
    { mark: "FB1", color: "oklch(0.58 0.13 40)", section: "LVL", size: "240×63 hyJOIST", grade: "—", desc: "Lounge bearer", count: 2 },
    { mark: "FB2", color: "oklch(0.66 0.10 50)", section: "PFC", size: "200PFC", grade: "300", desc: "Stair trim", count: 1 },
    { mark: "FB3", color: "oklch(0.55 0.13 38)", section: "UB", size: "200UB22.3", grade: "300PLUS", desc: "Living/dining", count: 2 },
  ] : [
    { mark: "B1", color: "oklch(0.58 0.13 40)", section: "UB", size: "200UB22.3", grade: "300PLUS", desc: "Garage portal beam", count: 2 },
    { mark: "B2", color: "oklch(0.62 0.14 35)", section: "UB", size: "310UB46.2", grade: "300PLUS", desc: "Mid-span feature beam", count: 1 },
    { mark: "B3", color: "oklch(0.55 0.13 38)", section: "PFC", size: "200PFC", grade: "300", desc: "Edge beam — alfresco", count: 3 },
    { mark: "B4", color: "oklch(0.50 0.13 42)", section: "RHS", size: "150×100×6 RHS", grade: "350", desc: "Window head — north", count: 4 },
    { mark: "B5", color: "oklch(0.60 0.11 50)", section: "SHS", size: "100×100×5 SHS", grade: "350", desc: "Lintel — internal", count: 6 },
    { mark: "B6", color: "oklch(0.66 0.10 50)", section: "UB", size: "250UB25.7", grade: "300PLUS", desc: "Upper-floor support", count: 1 },
    { mark: "B7", color: "oklch(0.58 0.12 45)", section: "PFC", size: "230PFC", grade: "300", desc: "Garage door head", count: 1 },
    { mark: "B8", color: "oklch(0.70 0.10 60)", section: "UB", size: "200UB18.2", grade: "300PLUS", desc: "Secondary beam", count: 2 },
  ];
  return (
    <SchedWrap head={["", "Mark", "Section", "Size", "Grade", "Description", "Span", "Util.", "Count", ""]}>
      {rows.map((r, i) => (
        <tr key={r.mark}>
          <td className="row-num">{String(i+1).padStart(2,"0")}</td>
          <td><MarkCell color={r.color} mark={r.mark} /></td>
          <td><span className="sched-pill">{r.section}</span></td>
          <td>{r.size}</td>
          <td>{r.grade}</td>
          <td className="txt">{r.desc}</td>
          <td>{(3.2 + i*0.6).toFixed(2)} m</td>
          <td>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 44, height: 5, background: "var(--bg-sunken)", borderRadius: 999, overflow: "hidden", display: "inline-block" }}>
                <span style={{ display: "block", width: `${30 + i*7}%`, height: "100%", background: i*7>60 ? "var(--warn)" : "var(--accent)" }}></span>
              </span>
              {(0.30 + i*0.07).toFixed(2)}
            </span>
          </td>
          <td><span className="sched-pill accent">{r.count}×</span></td>
          <td><button className="btn ghost" style={{ height: 24, padding: "0 8px", fontSize: 11 }}>Edit</button></td>
        </tr>
      ))}
    </SchedWrap>
  );
}

function PadFootingSchedule() {
  const rows = [
    { mark: "PF1", color: "oklch(0.58 0.13 40)", dims: "900 × 900", d: 400, reo: "N16 @ 200 EW", set: -50, count: 4 },
    { mark: "PF2", color: "oklch(0.62 0.12 45)", dims: "1100 × 1100", d: 450, reo: "N16 @ 175 EW", set: -75, count: 6 },
    { mark: "PF3", color: "oklch(0.66 0.10 50)", dims: "1200 × 800", d: 500, reo: "N20 @ 200 EW", set: -100, count: 2 },
    { mark: "PF4", color: "oklch(0.54 0.13 38)", dims: "1500 × 1500", d: 600, reo: "N20 @ 150 EW", set: -125, count: 1 },
  ];
  return (
    <SchedWrap head={["", "Mark", "Dimensions", "Depth", "Reinforcement", "Set-down", "Bearing", "Count", ""]}>
      {rows.map((r, i) => (
        <tr key={r.mark}>
          <td className="row-num">{String(i+1).padStart(2,"0")}</td>
          <td><MarkCell color={r.color} mark={r.mark} /></td>
          <td>{r.dims}</td>
          <td>{r.d}</td>
          <td className="txt">{r.reo}</td>
          <td>{r.set}</td>
          <td>{(150 + i*30)} kPa</td>
          <td><span className="sched-pill accent">{r.count}×</span></td>
          <td><button className="btn ghost" style={{ height: 24, padding: "0 8px", fontSize: 11 }}>Edit</button></td>
        </tr>
      ))}
    </SchedWrap>
  );
}

function ColumnSchedule() {
  const rows = [
    { mark: "C1", color: "oklch(0.30 0.02 40)", section: "SHS", size: "100×100×5 SHS", grade: "350", h: 2700, base: "200×200×16 BP", count: 8 },
    { mark: "C2", color: "oklch(0.35 0.02 50)", section: "SHS", size: "150×150×6 SHS", grade: "350", h: 2700, base: "300×300×20 BP", count: 4 },
    { mark: "C3", color: "oklch(0.40 0.02 40)", section: "CHS", size: "Ø114×4.8 CHS", grade: "350", h: 3000, base: "Ø250×16 BP", count: 2 },
    { mark: "C4", color: "oklch(0.25 0.02 40)", section: "UC", size: "150UC23.4", grade: "300PLUS", h: 2700, base: "300×300×20 BP", count: 1 },
  ];
  return (
    <SchedWrap head={["", "Mark", "Section", "Size", "Grade", "Height", "Base Plate", "Count", ""]}>
      {rows.map((r, i) => (
        <tr key={r.mark}>
          <td className="row-num">{String(i+1).padStart(2,"0")}</td>
          <td><MarkCell color={r.color} mark={r.mark} /></td>
          <td><span className="sched-pill">{r.section}</span></td>
          <td>{r.size}</td>
          <td>{r.grade}</td>
          <td>{r.h.toLocaleString()}</td>
          <td>{r.base}</td>
          <td><span className="sched-pill accent">{r.count}×</span></td>
          <td><button className="btn ghost" style={{ height: 24, padding: "0 8px", fontSize: 11 }}>Edit</button></td>
        </tr>
      ))}
    </SchedWrap>
  );
}

function WallSchedule() {
  const rows = [
    { mark: "W1", color: "oklch(0.55 0.02 50)", type: "190 Block", t: 190, h: 2700, desc: "Loadbearing — perimeter", count: 4 },
    { mark: "W2", color: "oklch(0.60 0.02 50)", type: "90 Stud", t: 90, h: 2700, desc: "Internal partition", count: 6 },
    { mark: "W3", color: "oklch(0.45 0.02 50)", type: "200 Concrete", t: 200, h: 3000, desc: "Retaining — east", count: 1 },
  ];
  return (
    <SchedWrap head={["", "Mark", "Type", "Thickness", "Height", "Description", "Count", ""]}>
      {rows.map((r, i) => (
        <tr key={r.mark}>
          <td className="row-num">{String(i+1).padStart(2,"0")}</td>
          <td><MarkCell color={r.color} mark={r.mark} /></td>
          <td><span className="sched-pill">{r.type}</span></td>
          <td>{r.t} mm</td>
          <td>{r.h.toLocaleString()}</td>
          <td className="txt">{r.desc}</td>
          <td><span className="sched-pill accent">{r.count}×</span></td>
          <td><button className="btn ghost" style={{ height: 24, padding: "0 8px", fontSize: 11 }}>Edit</button></td>
        </tr>
      ))}
    </SchedWrap>
  );
}

function FloorLoadSchedule() {
  const rows = [
    { mark: "FL1", color: "oklch(0.72 0.11 45)", g: 1.5, q: 1.5, dir: 0, desc: "Living areas — domestic" },
    { mark: "FL2", color: "oklch(0.66 0.12 30)", g: 2.0, q: 2.0, dir: 90, desc: "Wet areas & balconies" },
    { mark: "FL3", color: "oklch(0.60 0.13 50)", g: 0.9, q: 0.25, dir: 0, desc: "Roof — non-trafficable" },
  ];
  return (
    <SchedWrap head={["", "Mark", "G (kPa)", "Q (kPa)", "Span dir.", "Description", ""]}>
      {rows.map((r, i) => (
        <tr key={r.mark}>
          <td className="row-num">{String(i+1).padStart(2,"0")}</td>
          <td><MarkCell color={r.color} mark={r.mark} /></td>
          <td>{r.g.toFixed(2)}</td>
          <td>{r.q.toFixed(2)}</td>
          <td>{r.dir}°</td>
          <td className="txt">{r.desc}</td>
          <td><button className="btn ghost" style={{ height: 24, padding: "0 8px", fontSize: 11 }}>Edit</button></td>
        </tr>
      ))}
    </SchedWrap>
  );
}

function JoistSchedule() {
  const rows = [
    { mark: "J1", color: "oklch(0.66 0.10 60)", mat: "hyJOIST 240×63", sp: 450, span: "Continuous", desc: "Ground floor" },
    { mark: "J2", color: "oklch(0.60 0.09 60)", mat: "F17 240×45", sp: 600, span: "Simply Supported", desc: "Deck framing" },
    { mark: "J3", color: "oklch(0.70 0.08 55)", mat: "Z200-15 purlin", sp: 1200, span: "Continuous", desc: "Roof — bond beam" },
    { mark: "J4", color: "oklch(0.55 0.10 60)", mat: "LVL 300×63", sp: 450, span: "Single", desc: "Stair landing" },
  ];
  return (
    <SchedWrap head={["", "Mark", "Material", "Spacing", "Span Type", "Description", ""]}>
      {rows.map((r, i) => (
        <tr key={r.mark}>
          <td className="row-num">{String(i+1).padStart(2,"0")}</td>
          <td><MarkCell color={r.color} mark={r.mark} /></td>
          <td>{r.mat}</td>
          <td>{r.sp}</td>
          <td><span className="sched-pill">{r.span}</span></td>
          <td className="txt">{r.desc}</td>
          <td><button className="btn ghost" style={{ height: 24, padding: "0 8px", fontSize: 11 }}>Edit</button></td>
        </tr>
      ))}
    </SchedWrap>
  );
}

function StripFootingSchedule() {
  const rows = [
    { mark: "SF1", color: "oklch(0.58 0.13 40)", w: 500, d: 400, reo: "3×N12 T&B", set: -50, top: "Standard" },
    { mark: "SF2", color: "oklch(0.62 0.12 45)", w: 600, d: 500, reo: "4×N16 T&B", set: -100, top: "Stepped" },
    { mark: "SF3", color: "oklch(0.66 0.10 50)", w: 450, d: 400, reo: "3×N12 T&B", set: -50, top: "Tapered" },
  ];
  return (
    <SchedWrap head={["", "Mark", "Width", "Depth", "Reinforcement", "Set-down", "Top", ""]}>
      {rows.map((r, i) => (
        <tr key={r.mark}>
          <td className="row-num">{String(i+1).padStart(2,"0")}</td>
          <td><MarkCell color={r.color} mark={r.mark} /></td>
          <td>{r.w}</td>
          <td>{r.d}</td>
          <td className="txt">{r.reo}</td>
          <td>{r.set}</td>
          <td className="txt">{r.top}</td>
          <td><button className="btn ghost" style={{ height: 24, padding: "0 8px", fontSize: 11 }}>Edit</button></td>
        </tr>
      ))}
    </SchedWrap>
  );
}

function BracingSchedule() {
  const rows = [
    { mark: "BR1", color: "oklch(0.55 0.13 38)", type: "BR1 — Ply 6.4", L: 2400, rating: 4.5, desc: "Garage corner" },
    { mark: "BR2", color: "oklch(0.60 0.12 42)", type: "BR2 — Ply 6.0", L: 1800, rating: 3.6, desc: "Living room" },
    { mark: "BR3", color: "oklch(0.50 0.13 40)", type: "BR3 — Ply 3.4", L: 1500, rating: 2.4, desc: "Bedroom 2" },
    { mark: "BR4", color: "oklch(0.65 0.10 45)", type: "BR4 — Nominal 1s", L: 1200, rating: 1.5, desc: "Internal" },
  ];
  return (
    <SchedWrap head={["", "Mark", "Type", "Length", "Rating", "Description", ""]}>
      {rows.map((r, i) => (
        <tr key={r.mark}>
          <td className="row-num">{String(i+1).padStart(2,"0")}</td>
          <td><MarkCell color={r.color} mark={r.mark} /></td>
          <td><span className="sched-pill">{r.type}</span></td>
          <td>{r.L.toLocaleString()}</td>
          <td>{r.rating.toFixed(1)} kN/m</td>
          <td className="txt">{r.desc}</td>
          <td><button className="btn ghost" style={{ height: 24, padding: "0 8px", fontSize: 11 }}>Edit</button></td>
        </tr>
      ))}
    </SchedWrap>
  );
}

// ───────────────────────── PDF EXPORT MODAL (smaller) ─────────────────────────
function PDFExport({ onClose }) {
  return (
    <div className="overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ width: 520 }}>
        <div className="modal-hdr">
          <div>
            <div className="modal-title-block">
              <div className="modal-title">Export PDF</div>
              <span className="modal-eyebrow">14 sheets</span>
            </div>
            <div className="modal-sub">Bound calc pack with framing plan and per-beam check.</div>
          </div>
          <button className="modal-close" onClick={onClose}><Icon.Close /></button>
        </div>
        <div style={{ padding: 22 }}>
          <div className="field-row">
            <div className="field">
              <span className="field-label">Paper</span>
              <select className="in"><option>A1</option><option>A3</option><option>A2</option></select>
            </div>
            <div className="field">
              <span className="field-label">Scale</span>
              <select className="in"><option>1 : 100</option><option>1 : 50</option><option>1 : 200</option></select>
            </div>
          </div>
          <div style={{ height: 12 }}></div>
          <div className="card">
            <div className="card-title">Include</div>
            {[
              ["General arrangement", true],
              ["Footing plan", true],
              ["Floor framing plan", true],
              ["Beam calc sheets", true],
              ["Bracing sheet", true],
              ["Schedules", false],
              ["3D isometric", false],
            ].map(([k,v]) => (
              <label key={k} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0", cursor: "pointer" }}>
                <span style={{
                  width: 16, height: 16, borderRadius: 4, display: "grid", placeItems: "center",
                  background: v ? "var(--accent)" : "var(--bg-elevated)",
                  border: `1px solid ${v ? "var(--accent)" : "var(--line-2)"}`,
                  color: "white",
                }}>{v && <Icon.Check />}</span>
                <span style={{ fontSize: 13 }}>{k}</span>
              </label>
            ))}
          </div>
        </div>
        <div className="modal-ftr">
          <span className="ftr-note">Ready · ~2.4 MB</span>
          <div className="ftr-spacer"></div>
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn primary"><Icon.PDF /> Export PDF</button>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { RaftDesigner, Schedules, PDFExport });
