/* global React */
// Sample structural plan — drawn as SVG so it scales and themes.
// Roughly a residential raft slab plan: outline polygon, edge beams,
// internal beams, columns, dimensions, and a grid system.

function StructuralPlan() {
  // Logical mm coords; viewBox is 0..16000 wide, 0..11000 tall (16x11m).
  const W = 16000, H = 11000;
  const beams = [
    // Internal beams (running N-S)
    { x1: 4000, y1: 800, x2: 4000, y2: 10200, w: 300 },
    { x1: 8000, y1: 800, x2: 8000, y2: 7400, w: 300 },
    { x1: 12000, y1: 800, x2: 12000, y2: 10200, w: 300 },
    // Internal beams (running E-W)
    { x1: 800, y1: 4500, x2: 15200, y2: 4500, w: 300 },
    { x1: 800, y1: 7400, x2: 12200, y2: 7400, w: 300 },
  ];
  // Edge beam outline (L-shape)
  const outline = [
    [800, 800], [15200, 800], [15200, 10200],
    [8000, 10200], [8000, 7400], [800, 7400],
  ];
  const columns = [
    [800, 800], [8000, 800], [15200, 800],
    [800, 4500], [4000, 4500], [8000, 4500], [12000, 4500], [15200, 4500],
    [800, 7400], [4000, 7400], [8000, 7400], [12000, 7400],
    [8000, 10200], [12000, 10200], [15200, 10200],
  ];
  // Grid system A-F (vertical) and 1-4 (horizontal)
  const gridV = [800, 4000, 8000, 12000, 15200];
  const gridH = [800, 4500, 7400, 10200];
  const gridLabelV = ["A", "B", "C", "D", "E"];
  const gridLabelH = ["1", "2", "3", "4"];

  return (
    <svg className="paper-svg" viewBox="-1400 -1400 18800 13800" preserveAspectRatio="xMidYMid meet">
      <defs>
        <pattern id="hatch" patternUnits="userSpaceOnUse" width="160" height="160" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="160" stroke="var(--plan-beam)" strokeWidth="20" opacity="0.15"/>
        </pattern>
        <pattern id="dots" patternUnits="userSpaceOnUse" width="280" height="280">
          <circle cx="140" cy="140" r="20" fill="var(--plan-zone)" opacity="0.18"/>
        </pattern>
      </defs>

      {/* Drawing grid (fine) */}
      <g opacity="0.45">
        {Array.from({length: 17}, (_, i) => (
          <line key={`gv-${i}`} x1={i*1000} y1={-500} x2={i*1000} y2={H+500}
                stroke="var(--plan-grid)" strokeWidth="14"/>
        ))}
        {Array.from({length: 12}, (_, i) => (
          <line key={`gh-${i}`} x1={-500} y1={i*1000} x2={W+500} y2={i*1000}
                stroke="var(--plan-grid)" strokeWidth="14"/>
        ))}
      </g>

      {/* Major grid every 5m */}
      <g>
        {Array.from({length: 4}, (_, i) => (
          <line key={`gmv-${i}`} x1={i*5000} y1={-500} x2={i*5000} y2={H+500}
                stroke="var(--plan-grid-major)" strokeWidth="22"/>
        ))}
      </g>

      {/* Load zone fill (subtle dotted) */}
      <polygon
        points={outline.map(([x,y])=>`${x},${y}`).join(" ")}
        fill="url(#dots)"
        opacity="0.6"
      />

      {/* Edge beam outline */}
      <polygon
        points={outline.map(([x,y])=>`${x},${y}`).join(" ")}
        fill="none"
        stroke="var(--plan-beam)"
        strokeWidth="60"
      />
      {/* Inner outline offset to show beam thickness */}
      <polygon
        points={outline.map(([x,y],i,a)=>{
          // simplistic inward offset visualization using fixed offset on inner stroke
          return `${x},${y}`;
        }).join(" ")}
        fill="none"
        stroke="var(--plan-beam)"
        strokeWidth="12"
        strokeDasharray="80 60"
        opacity="0.6"
      />

      {/* Internal beams */}
      {beams.map((b, i) => (
        <g key={`b-${i}`}>
          <line x1={b.x1} y1={b.y1} x2={b.x2} y2={b.y2}
                stroke="var(--plan-beam)" strokeWidth={b.w * 0.7} strokeLinecap="butt" opacity="0.18"/>
          <line x1={b.x1} y1={b.y1} x2={b.x2} y2={b.y2}
                stroke="var(--plan-beam)" strokeWidth="20"/>
          <line x1={b.x1} y1={b.y1} x2={b.x2} y2={b.y2}
                stroke="var(--plan-beam)" strokeWidth="8" strokeDasharray="60 80" opacity="0.7"/>
        </g>
      ))}

      {/* Columns */}
      {columns.map(([x,y], i) => (
        <g key={`c-${i}`}>
          <rect x={x-160} y={y-160} width={320} height={320}
                fill="var(--plan-paper)"
                stroke="var(--plan-column)" strokeWidth="40"/>
          <rect x={x-110} y={y-110} width={220} height={220} fill="url(#hatch)"/>
        </g>
      ))}

      {/* Wall lines (interior) */}
      <g stroke="var(--plan-wall)" strokeWidth="14" fill="none" opacity="0.5">
        <line x1="4000" y1="800" x2="4000" y2="4500"/>
        <line x1="2400" y1="4500" x2="2400" y2="7400"/>
        <line x1="6200" y1="4500" x2="6200" y2="7400"/>
        <line x1="9800" y1="4500" x2="9800" y2="7400"/>
        <line x1="13600" y1="7400" x2="13600" y2="10200"/>
        <line x1="800" y1="2400" x2="4000" y2="2400"/>
        <line x1="4000" y1="6000" x2="8000" y2="6000"/>
        <line x1="8000" y1="6000" x2="12000" y2="6000"/>
        <line x1="12000" y1="8800" x2="15200" y2="8800"/>
      </g>

      {/* Grid bubbles — vertical (top) */}
      <g>
        {gridV.map((x, i) => (
          <g key={`gbv-${i}`}>
            <line x1={x} y1={-600} x2={x} y2={-100} stroke="var(--plan-dim)" strokeWidth="10" strokeDasharray="60 40"/>
            <circle cx={x} cy={-900} r="240" fill="var(--plan-paper)" stroke="var(--plan-dim)" strokeWidth="18"/>
            <text x={x} y={-900} fontSize="320" fontWeight="600" fill="var(--plan-ink)"
                  textAnchor="middle" dominantBaseline="middle"
                  fontFamily="Geist Mono, monospace">{gridLabelV[i]}</text>
          </g>
        ))}
      </g>
      {/* Grid bubbles — horizontal (left) */}
      <g>
        {gridH.map((y, i) => (
          <g key={`gbh-${i}`}>
            <line x1={-600} y1={y} x2={-100} y2={y} stroke="var(--plan-dim)" strokeWidth="10" strokeDasharray="60 40"/>
            <circle cx={-900} cy={y} r="240" fill="var(--plan-paper)" stroke="var(--plan-dim)" strokeWidth="18"/>
            <text x={-900} y={y} fontSize="320" fontWeight="600" fill="var(--plan-ink)"
                  textAnchor="middle" dominantBaseline="middle"
                  fontFamily="Geist Mono, monospace">{gridLabelH[i]}</text>
          </g>
        ))}
      </g>

      {/* Dimension chain (top) — between grid lines */}
      <g>
        <line x1="800" y1={H+700} x2="15200" y2={H+700}
              stroke="var(--plan-dim)" strokeWidth="14"/>
        {gridV.map((x, i) => (
          <line key={`d-tick-${i}`} x1={x} y1={H+550} x2={x} y2={H+850}
                stroke="var(--plan-dim)" strokeWidth="14"/>
        ))}
        {gridV.slice(0,-1).map((x, i) => {
          const next = gridV[i+1];
          const mid = (x + next) / 2;
          return (
            <text key={`d-text-${i}`} x={mid} y={H+1100}
                  fontSize="280" fill="var(--plan-dim)"
                  textAnchor="middle"
                  fontFamily="Geist Mono, monospace"
                  fontWeight="500">
              {(next - x).toLocaleString()}
            </text>
          );
        })}
      </g>

      {/* Overall dim */}
      <g>
        <line x1="800" y1={H+1500} x2="15200" y2={H+1500}
              stroke="var(--plan-dim)" strokeWidth="14"/>
        <line x1="800" y1={H+1380} x2="800" y2={H+1620}
              stroke="var(--plan-dim)" strokeWidth="14"/>
        <line x1="15200" y1={H+1380} x2="15200" y2={H+1620}
              stroke="var(--plan-dim)" strokeWidth="14"/>
        <text x={W/2} y={H+1900} fontSize="320"
              fill="var(--plan-ink)" textAnchor="middle"
              fontFamily="Geist Mono, monospace"
              fontWeight="600">14400</text>
      </g>

      {/* Labels for beams */}
      <g fontFamily="Geist Mono, monospace" fontSize="260" fontWeight="600" fill="var(--plan-ink)">
        <g transform="translate(4080 2600)"><rect x="-120" y="-220" width="540" height="320" rx="40" fill="var(--plan-paper)" stroke="var(--plan-beam)" strokeWidth="12"/><text x="150" y="0" textAnchor="middle" dominantBaseline="middle">B1</text></g>
        <g transform="translate(8080 6000)"><rect x="-120" y="-220" width="540" height="320" rx="40" fill="var(--plan-paper)" stroke="var(--plan-beam)" strokeWidth="12"/><text x="150" y="0" textAnchor="middle" dominantBaseline="middle">B2</text></g>
        <g transform="translate(12080 8600)"><rect x="-120" y="-220" width="540" height="320" rx="40" fill="var(--plan-paper)" stroke="var(--plan-beam)" strokeWidth="12"/><text x="150" y="0" textAnchor="middle" dominantBaseline="middle">B3</text></g>
        <g transform="translate(2600 4580)"><rect x="-120" y="-220" width="540" height="320" rx="40" fill="var(--plan-paper)" stroke="var(--plan-beam)" strokeWidth="12"/><text x="150" y="0" textAnchor="middle" dominantBaseline="middle">B4</text></g>
      </g>

      {/* Column labels */}
      <g fontFamily="Geist Mono, monospace" fontSize="220" fill="var(--plan-ink)" opacity="0.85">
        <text x={4000+260} y={4500-240}>C1</text>
        <text x={8000+260} y={4500-240}>C1</text>
        <text x={12000+260} y={4500-240}>C2</text>
        <text x={4000+260} y={7400-240}>C2</text>
        <text x={8000+260} y={7400-240}>C1</text>
      </g>

      {/* Zone callout */}
      <g transform="translate(2400 6000)">
        <circle r="160" fill="var(--plan-zone)" opacity="0.9"/>
        <text fontFamily="Geist Mono, monospace" fontSize="200" fontWeight="700" fill="white"
              textAnchor="middle" dominantBaseline="middle">FL1</text>
      </g>
      <g transform="translate(10000 9000)">
        <circle r="160" fill="var(--plan-zone)" opacity="0.9"/>
        <text fontFamily="Geist Mono, monospace" fontSize="200" fontWeight="700" fill="white"
              textAnchor="middle" dominantBaseline="middle">FL2</text>
      </g>

      {/* North arrow */}
      <g transform="translate(16800 600)">
        <circle r="380" fill="none" stroke="var(--plan-dim)" strokeWidth="16"/>
        <polygon points="0,-300 90,180 0,80 -90,180" fill="var(--plan-ink)"/>
        <text y="-450" fontSize="240" fontWeight="600" fill="var(--plan-ink)"
              fontFamily="Geist, sans-serif" textAnchor="middle">N</text>
      </g>
    </svg>
  );
}

window.StructuralPlan = StructuralPlan;
