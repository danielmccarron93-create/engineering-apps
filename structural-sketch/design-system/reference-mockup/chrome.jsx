/* global React, Icon */

// ───────────────────────── Theme switcher ─────────────────────────
function ThemeSwitcher({ theme, setTheme }) {
  return (
    <div className="theme-seg" role="tablist" aria-label="Theme">
      <button
        className={theme === "warm" ? "on" : ""}
        onClick={() => setTheme("warm")}
        title="Warm — terracotta"
      >
        <span className="dot" style={{ background: "oklch(0.62 0.135 40)" }}></span>
        Warm
      </button>
      <button
        className={theme === "mono" ? "on" : ""}
        onClick={() => setTheme("mono")}
        title="Mono — Revit-style B&W"
      >
        <span className="dot" style={{
          background: "linear-gradient(135deg, #ffffff 0 50%, #0e1116 50% 100%)",
          boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.2)"
        }}></span>
        Mono
      </button>
      <button
        className={theme === "dark" ? "on" : ""}
        onClick={() => setTheme("dark")}
        title="Dark — premium"
      >
        <span className="dot" style={{
          background: "radial-gradient(circle at 30% 30%, oklch(0.34 0.012 50), oklch(0.16 0.008 50))"
        }}></span>
        Dark
      </button>
    </div>
  );
}

// ───────────────────────── Header ─────────────────────────
function Header({ theme, setTheme, onOpenModal }) {
  return (
    <header className="hdr">
      <div className="hdr-brand">
        <div className="hdr-mark">
          {/* Stylised mark — a beam-on-pillars glyph */}
          <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
            <path d="M2 6h18M2 6v2h18V6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
            <path d="M5 8v10M11 8v10M17 8v10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
            <path d="M2 18h18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
          </svg>
        </div>
        <div className="hdr-name">StructuralSketch</div>
        <span className="hdr-sub">— multi-level documentation</span>
      </div>

      <div className="hdr-divider"></div>

      <div className="hdr-crumbs">
        <span>Projects</span>
        <span className="crumb-sep">/</span>
        <span>14 Westcliff Drive</span>
        <span className="crumb-sep">/</span>
        <span className="crumb-cur">Ground Floor — Framing</span>
      </div>

      <div className="hdr-spacer"></div>

      <div className="hdr-actions">
        <button className="h-btn">
          <Icon.Folder /> <span>Open</span>
        </button>
        <button className="h-btn">
          <Icon.Save /> <span>Save</span>
        </button>
        <button className="h-btn primary" onClick={() => onOpenModal("pdf")}>
          <Icon.PDF /> <span>Export</span>
        </button>
        <span style={{ width: 8 }}></span>
        <ThemeSwitcher theme={theme} setTheme={setTheme} />
        <span style={{ width: 4 }}></span>
        <button className="h-icon-btn" title="Help — keyboard shortcuts"><Icon.Q /></button>
      </div>
    </header>
  );
}

// ───────────────────────── Ribbon ─────────────────────────
function RibbonButton({ icon: I, label, active, featured, onClick }) {
  return (
    <button className={`r-btn ${active ? "active" : ""} ${featured ? "featured" : ""}`} onClick={onClick}>
      <span className="ic"><I /></span>
      <span className="lbl">{label}</span>
    </button>
  );
}

function Ribbon({ tool, setTool, onOpenModal }) {
  const groups = [
    {
      label: "Modify",
      content: (
        <>
          <RibbonButton icon={Icon.Select} label="Select" active={tool === "select"} onClick={() => setTool("select")} />
          <div className="r-stack">
            <button className="r-btn-sm"><Icon.Undo /> Undo</button>
            <button className="r-btn-sm"><Icon.Redo /> Redo</button>
          </div>
        </>
      ),
    },
    {
      label: "Draw",
      content: (
        <>
          <RibbonButton icon={Icon.Line} label="Line" active={tool === "line"} onClick={() => setTool("line")} />
          <RibbonButton icon={Icon.Rect} label="Rect" active={tool === "rect"} onClick={() => setTool("rect")} />
          <RibbonButton icon={Icon.Poly} label="Polygon" active={tool === "poly"} onClick={() => setTool("poly")} />
          <RibbonButton icon={Icon.Circle} label="Arc" />
        </>
      ),
    },
    {
      label: "Annotate",
      content: (
        <>
          <RibbonButton icon={Icon.Dim} label="Dimension" />
          <RibbonButton icon={Icon.Text} label="Text" />
        </>
      ),
    },
    {
      label: "Structure",
      content: (
        <>
          <RibbonButton icon={Icon.Beam} label="Beam" active={tool === "beam"} onClick={() => setTool("beam")} />
          <RibbonButton icon={Icon.Column} label="Column" />
          <RibbonButton icon={Icon.Wall} label="Wall" />
          <RibbonButton icon={Icon.Slab} label="Slab" />
          <RibbonButton icon={Icon.Joist} label="Joists" />
          <RibbonButton icon={Icon.Brace} label="Bracing" />
        </>
      ),
    },
    {
      label: "Loads",
      content: (
        <>
          <RibbonButton icon={Icon.Load} label="Floor Load" />
          <RibbonButton icon={Icon.Footing} label="Footing" />
        </>
      ),
    },
    {
      label: "Design",
      content: (
        <>
          <RibbonButton icon={Icon.Raft} label="Raft Slab" featured onClick={() => onOpenModal("raft")} />
          <RibbonButton icon={Icon.Calc} label="Calc Sheet" />
          <RibbonButton icon={Icon.Tonnage} label="Tonnage" />
        </>
      ),
    },
    {
      label: "Document",
      content: (
        <>
          <RibbonButton icon={Icon.Sched} label="Schedules" onClick={() => onOpenModal("sched")} />
          <RibbonButton icon={Icon.Sheet} label="Sheets" />
          <RibbonButton icon={Icon.PDF} label="PDF" onClick={() => onOpenModal("pdf")} />
        </>
      ),
    },
  ];

  return (
    <div className="ribbon">
      {groups.map((g, i) => (
        <React.Fragment key={g.label}>
          <div className="r-group">
            <div className="r-tools">{g.content}</div>
            <div className="r-label">{g.label}</div>
          </div>
        </React.Fragment>
      ))}
    </div>
  );
}

// ───────────────────────── Floating Properties Panel ─────────────────────────
function PropertiesPanel() {
  return (
    <div className="float-panel" style={{ top: 24, left: 24, width: 268 }}>
      <div className="fp-hdr">
        <div className="fp-hdr-title">Properties</div>
        <div className="fp-hdr-meta">B2 · Beam</div>
      </div>
      <div className="fp-body">
        <div className="prop-section-title">Identity</div>
        <div className="prop-row"><span className="prop-k">Mark</span><span className="prop-v">B2</span></div>
        <div className="prop-row"><span className="prop-k">Layer</span><span className="prop-v">S-Beam</span></div>
        <div className="prop-row"><span className="prop-k">Length</span><span className="prop-v">6 600 mm</span></div>

        <div className="prop-section-title">Section</div>
        <div className="prop-row"><span className="prop-k">Type</span><span className="prop-v">UB</span></div>
        <div className="prop-row"><span className="prop-k">Size</span><span className="prop-v">310UB46</span></div>
        <div className="prop-row"><span className="prop-k">Grade</span><span className="prop-v">300PLUS</span></div>

        <div className="prop-section-title">Restraint</div>
        <div className="prop-row"><span className="prop-k">Span</span><span className="prop-v">Continuous</span></div>
        <div className="prop-row"><span className="prop-k">L<sub>e</sub></span><span className="prop-v">5 280 mm</span></div>

        <div className="prop-section-title">Utilisation</div>
        <div style={{ padding: "4px 6px 6px" }}>
          <div className="bar">
            <span className="bar-label">Bending</span>
            <span className="bar-track"><span className="bar-fill" style={{ width: "78%" }}></span></span>
            <span className="bar-val">0.78</span>
          </div>
          <div className="bar">
            <span className="bar-label">Shear</span>
            <span className="bar-track"><span className="bar-fill" style={{ width: "41%", background: "var(--ok)" }}></span></span>
            <span className="bar-val">0.41</span>
          </div>
          <div className="bar">
            <span className="bar-label">Deflect.</span>
            <span className="bar-track"><span className="bar-fill" style={{ width: "62%" }}></span></span>
            <span className="bar-val">L/410</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ───────────────────────── Floating Layers Panel ─────────────────────────
function LayersPanel() {
  const layers = [
    { name: "Slab outline", color: "oklch(0.60 0.135 40)", count: 1, active: true },
    { name: "Edge beams", color: "oklch(0.55 0.13 38)", count: 6 },
    { name: "Internal beams", color: "oklch(0.65 0.09 50)", count: 5 },
    { name: "Columns", color: "oklch(0.30 0.02 40)", count: 15 },
    { name: "Walls", color: "oklch(0.45 0.02 50)", count: 12, muted: true },
    { name: "Load zones", color: "oklch(0.72 0.11 45)", count: 2 },
    { name: "Dimensions", color: "oklch(0.55 0.014 50)", count: 24 },
    { name: "Annotation", color: "oklch(0.50 0.012 50)", count: 8 },
  ];
  return (
    <div className="float-panel" style={{ top: 24, right: 24, width: 248 }}>
      <div className="fp-hdr">
        <div className="fp-hdr-title">Layers</div>
        <div className="fp-hdr-meta">{layers.length}</div>
      </div>
      <div className="fp-body">
        {layers.map((l) => (
          <div key={l.name} className={`layer-row ${l.active ? "active" : ""} ${l.muted ? "muted" : ""}`}>
            <span className="layer-swatch" style={{ background: l.color }}></span>
            <span className="layer-name">{l.name}</span>
            <span className="layer-count">{l.count}</span>
            <button className="layer-vis" title={l.muted ? "Show" : "Hide"}>
              <Icon.Eye off={l.muted} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ───────────────────────── Zoom Rail ─────────────────────────
function ZoomRail() {
  return (
    <div className="zoom-rail">
      <button title="Zoom in"><Icon.Plus /></button>
      <div className="zoom-pct" style={{ display: "grid", placeItems: "center" }}>112%</div>
      <button title="Zoom out"><Icon.Minus /></button>
      <button title="Fit to view"><Icon.Bracket /></button>
    </div>
  );
}

// ───────────────────────── View pill (top of paper) ─────────────────────────
function ViewPill() {
  const [view, setView] = React.useState("plan");
  return (
    <div className="view-pill">
      <button className={view === "plan" ? "on" : ""} onClick={() => setView("plan")}>Plan</button>
      <button className={view === "3d" ? "on" : ""} onClick={() => setView("3d")}>3D</button>
      <button className={view === "elev" ? "on" : ""} onClick={() => setView("elev")}>Elevation</button>
      <button className={view === "sect" ? "on" : ""} onClick={() => setView("sect")}>Section</button>
    </div>
  );
}

// ───────────────────────── Sheet Tab ─────────────────────────
function SheetTab() {
  return (
    <div className="sheet-tab">
      <span className="stno">S-201</span>
      <span className="sttitle">Ground Floor Framing Plan</span>
      <span className="stscale">1 : 100</span>
    </div>
  );
}

// ───────────────────────── Status Bar ─────────────────────────
function StatusBar({ tool }) {
  return (
    <div className="status">
      <span className="st-item">
        <span className="st-k">Tool</span>
        <span className="st-v">{tool[0].toUpperCase() + tool.slice(1)}</span>
      </span>
      <span className="st-sep"></span>
      <span className="st-item">
        <span className="st-k">x</span>
        <span className="st-v">8 240</span>
        <span className="st-k">y</span>
        <span className="st-v">4 500</span>
      </span>
      <span className="st-sep"></span>
      <span className="st-item">
        <span className="st-k">Units</span>
        <span className="st-v">mm</span>
      </span>
      <span className="st-sep"></span>
      <span className="st-badge on">Snap · Grid · Ortho</span>
      <span className="st-badge">Layer: S-Beam</span>
      <span className="st-spacer"></span>
      <span className="st-badge live">AS 2870 · 3600 · 1170 live</span>
      <span className="cmd-trigger"><Icon.Search /> Search commands <kbd>⌘K</kbd></span>
    </div>
  );
}

Object.assign(window, {
  ThemeSwitcher, Header, Ribbon, PropertiesPanel, LayersPanel,
  ZoomRail, ViewPill, SheetTab, StatusBar,
});
