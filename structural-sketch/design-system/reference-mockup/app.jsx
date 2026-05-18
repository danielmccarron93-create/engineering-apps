/* global React, ReactDOM, Header, Ribbon, PropertiesPanel, LayersPanel, ZoomRail, ViewPill, SheetTab, StatusBar, StructuralPlan, RaftDesigner, Schedules, PDFExport */

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "theme": "warm"
}/*EDITMODE-END*/;

function App() {
  const [theme, setThemeState] = React.useState(() => {
    try { return localStorage.getItem("ss-theme") || TWEAK_DEFAULTS.theme; } catch { return TWEAK_DEFAULTS.theme; }
  });
  const [tool, setTool] = React.useState("select");
  const [modal, setModal] = React.useState(null);

  React.useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    try { localStorage.setItem("ss-theme", theme); } catch {}
  }, [theme]);

  const setTheme = (t) => {
    setThemeState(t);
    // Persist for edit-mode if used
    try {
      window.parent.postMessage({ type: "__edit_mode_set_keys", edits: { theme: t } }, "*");
    } catch {}
  };

  // Esc closes any open modal
  React.useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") setModal(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="app">
      <Header theme={theme} setTheme={setTheme} onOpenModal={setModal} />
      <Ribbon tool={tool} setTool={setTool} onOpenModal={setModal} />

      <div className="workspace">
        <div className="paper">
          <StructuralPlan />
        </div>
        <SheetTab />
        <ViewPill />
        <PropertiesPanel />
        <LayersPanel />
        <ZoomRail />
      </div>

      <StatusBar tool={tool} />

      {modal === "raft" && <RaftDesigner onClose={() => setModal(null)} />}
      {modal === "sched" && <Schedules onClose={() => setModal(null)} />}
      {modal === "pdf" && <PDFExport onClose={() => setModal(null)} />}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
