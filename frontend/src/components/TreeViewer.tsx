"use client";
import React, { useState, useMemo, useRef, useCallback } from "react";
import dynamic from "next/dynamic";
import {
  TreeDeciduous,
  Layers,
  Table,
  TrendingUp,
  ZoomIn,
  ZoomOut,
  Maximize2,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronDown,
  RotateCcw,
  Info,
} from "lucide-react";
import type { TreeResponse, TreeRequest } from "@/lib/api";

const Plot = dynamic(() => import("react-plotly.js"), { ssr: false });

type NodeDisplayMode = "compact" | "stock" | "option" | "delta" | "all";
type TreeTab = "lattice" | "schedule" | "convergence";

interface TreeViewerProps {
  tree: TreeResponse | null;
  loading: boolean;
  params: TreeRequest | null;
}

interface HoveredNodeData {
  i: number;
  j: number;
  t: number;
  S: number;
  V: number;
  D: number | null;
  B: number | null;
  isTerminal: boolean;
  isITM: boolean;
  intrinsic: number;
  continuation?: number;
  screenX: number;
  screenY: number;
}

// Standard normal CDF approximation (Abramowitz & Stegun)
function normCdf(x: number): number {
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741, a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
  const sign = x < 0 ? -1 : 1;
  const absX = Math.abs(x) / Math.sqrt(2.0);
  const t = 1.0 / (1.0 + p * absX);
  const erf = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-absX * absX);
  return 0.5 * (1.0 + sign * erf);
}

function calculateBSPrice(S0: number, K: number, T: number, r: number, sigma: number, isCall: boolean): number {
  if (T <= 0 || sigma <= 0) return Math.max(0, isCall ? S0 - K : K - S0);
  const d1 = (Math.log(S0 / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T));
  const d2 = d1 - sigma * Math.sqrt(T);
  if (isCall) {
    return S0 * normCdf(d1) - K * Math.exp(-r * T) * normCdf(d2);
  } else {
    return K * Math.exp(-r * T) * normCdf(-d2) - S0 * normCdf(-d1);
  }
}

function calculateCRRPrice(S0: number, K: number, T: number, r: number, sigma: number, n: number, isCall: boolean, american: boolean): number {
  const dt = T / n;
  const u = Math.exp(sigma * Math.sqrt(dt));
  const d = 1.0 / u;
  const disc = Math.exp(-r * dt);
  const p = (Math.exp(r * dt) - d) / (u - d);

  const stock: number[] = new Array(n + 1);
  for (let j = 0; j <= n; j++) {
    stock[j] = S0 * Math.pow(u, n - j) * Math.pow(d, j);
  }

  let opt: number[] = stock.map(s => Math.max(0, isCall ? s - K : K - s));

  for (let i = n - 1; i >= 0; i--) {
    const nextOpt: number[] = new Array(i + 1);
    for (let j = 0; j <= i; j++) {
      const cont = disc * (p * opt[j] + (1 - p) * opt[j + 1]);
      if (american) {
        const sVal = S0 * Math.pow(u, i - j) * Math.pow(d, j);
        const ex = Math.max(0, isCall ? sVal - K : K - sVal);
        nextOpt[j] = Math.max(cont, ex);
      } else {
        nextOpt[j] = cont;
      }
    }
    opt = nextOpt;
  }
  return opt[0];
}

export function TreeViewer({ tree, loading, params }: TreeViewerProps) {
  const [activeTab, setActiveTab] = useState<TreeTab>("lattice");
  const [displayMode, setDisplayMode] = useState<NodeDisplayMode>("compact");

  // Pan and Zoom Navigator State
  const [zoom, setZoom] = useState(1.0);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [hoveredNode, setHoveredNode] = useState<HoveredNodeData | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);

  // Zoom controls
  const handleZoomIn = () => setZoom(z => Math.min(2.5, +(z + 0.2).toFixed(2)));
  const handleZoomOut = () => setZoom(z => Math.max(0.4, +(z - 0.2).toFixed(2)));
  const handleResetView = () => {
    setZoom(1.0);
    setPan({ x: 0, y: 0 });
  };
  const handlePan = (dx: number, dy: number) => {
    setPan(p => ({ x: p.x + dx, y: p.y + dy }));
  };

  // Mouse drag handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return; // only left click
    setIsDragging(true);
    setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  };

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging) return;
    setPan({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y,
    });
  }, [isDragging, dragStart]);

  const handleMouseUp = () => setIsDragging(false);

  // Mouse wheel zoom
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY < 0 ? 0.1 : -0.1;
    setZoom(z => Math.min(2.5, Math.max(0.4, +(z + delta).toFixed(2))));
  };

  // Convergence data
  const convergenceData = useMemo(() => {
    if (!params) return null;
    const isCall = params.option_type === "call";
    const bs = calculateBSPrice(params.S0, params.K, params.T, params.r, params.sigma, isCall);
    const nValues = Array.from({ length: 24 }, (_, i) => i + 1);
    const crrPrices = nValues.map(n =>
      calculateCRRPrice(params.S0, params.K, params.T, params.r, params.sigma, n, isCall, params.american)
    );
    return { nValues, crrPrices, bsPrice: bs };
  }, [params]);

  // SVG Lattice geometry calculations
  const latticeGeometry = useMemo(() => {
    if (!tree) return null;
    const N = tree.N;
    const dx = 175; // horizontal step distance
    const dy = 95;  // vertical state distance
    const paddingX = 90;
    const paddingY = 80;

    const width = (N + 1) * dx + paddingX * 2;
    const height = (N + 1) * dy + paddingY * 2;
    const centerY = height / 2;

    const nodes: {
      i: number;
      j: number;
      x: number;
      y: number;
      S: number;
      V: number;
      D: number | null;
      B: number | null;
      isTerminal: boolean;
      isITM: boolean;
      radius: number;
      pillWidth: number;
      pillHeight: number;
    }[] = [];

    const edges: {
      x1: number;
      y1: number;
      x2: number;
      y2: number;
      isUp: boolean;
      prob: number;
    }[] = [];

    for (let i = 0; i <= N; i++) {
      for (let j = 0; j <= i; j++) {
        const x = paddingX + i * dx;
        const y = centerY + (j - i / 2) * dy;
        const S = tree.stock[j][i];
        const V = tree.option[j][i];
        const D = i < N ? tree.delta[j]?.[i] : null;
        const B = i < N ? tree.bond[j]?.[i] : null;
        const isTerminal = i === N;
        const isITM = V > 1e-4;

        // Calculate adaptive circle radius based on formatted text lengths
        const sStr = `$${S.toFixed(2)}`;
        const vStr = `$${V.toFixed(2)}`;
        const maxStrLen = Math.max(sStr.length, vStr.length);

        let radius = 34;
        let pillWidth = 84;
        let pillHeight = 52;

        if (displayMode === "compact") {
          // Circle radius comfortably enclosing both S and V lines
          radius = Math.max(34, maxStrLen * 4.6 + 12);
          pillWidth = Math.max(86, maxStrLen * 8.5 + 24);
          pillHeight = 52;
        } else if (displayMode === "all") {
          radius = Math.max(46, maxStrLen * 4.8 + 18);
          pillWidth = Math.max(105, maxStrLen * 8.5 + 28);
          pillHeight = 74;
        } else {
          // Single line (stock or option or delta)
          radius = Math.max(30, maxStrLen * 4.5 + 10);
          pillWidth = Math.max(76, maxStrLen * 8.5 + 20);
          pillHeight = 40;
        }

        nodes.push({
          i, j, x, y, S, V, D, B,
          isTerminal, isITM,
          radius, pillWidth, pillHeight,
        });

        // Add branches to next step
        if (i < N) {
          const nextUpY = centerY + (j - (i + 1) / 2) * dy;
          const nextDownY = centerY + ((j + 1) - (i + 1) / 2) * dy;
          const nextX = paddingX + (i + 1) * dx;

          edges.push({
            x1: x, y1: y,
            x2: nextX, y2: nextUpY,
            isUp: true, prob: tree.p,
          });
          edges.push({
            x1: x, y1: y,
            x2: nextX, y2: nextDownY,
            isUp: false, prob: 1 - tree.p,
          });
        }
      }
    }

    return { width, height, dx, dy, paddingX, centerY, nodes, edges };
  }, [tree, displayMode]);

  const buildConvergencePlot = () => {
    if (!convergenceData) return null;
    const { nValues, crrPrices, bsPrice } = convergenceData;

    const crrTrace: Plotly.Data = {
      x: nValues, y: crrPrices,
      type: "scatter", mode: "lines+markers",
      name: "CRR Tree Price",
      marker: { size: 6, color: "#4f46e5" },
      line: { color: "#4f46e5", width: 2 },
    };
    const bsTrace: Plotly.Data = {
      x: [1, 24], y: [bsPrice, bsPrice],
      type: "scatter", mode: "lines",
      name: `Black-Scholes ($${bsPrice.toFixed(4)})`,
      line: { color: "#059669", width: 2, dash: "dash" },
    };

    const layout: Partial<Plotly.Layout> = {
      title: {
        text: "Convergence to Black-Scholes Formula (N = 1 to 24 Steps)",
        font: { color: "#0f172a", size: 13, family: "Inter, sans-serif" },
      },
      paper_bgcolor: "white",
      plot_bgcolor: "#f8fafc",
      xaxis: {
        title: { text: "Tree Steps (N)", font: { color: "#64748b", size: 11 } },
        gridcolor: "#e2e8f0",
        tickfont: { color: "#64748b", size: 10 },
      },
      yaxis: {
        title: { text: "Option Price ($)", font: { color: "#64748b", size: 11 } },
        gridcolor: "#e2e8f0",
        tickfont: { color: "#64748b", size: 10 },
      },
      legend: {
        bgcolor: "rgba(255,255,255,0.9)",
        bordercolor: "#e2e8f0",
        font: { color: "#334155", size: 10 },
      },
      margin: { t: 50, b: 50, l: 60, r: 30 },
    };

    return (
      <Plot
        data={[crrTrace, bsTrace]}
        layout={layout}
        config={{ displayModeBar: true, displaylogo: false }}
        style={{ width: "100%", height: "100%" }}
        useResizeHandler
      />
    );
  };

  const TabBtn = ({ id, icon, label }: { id: TreeTab; icon: React.ReactNode; label: string }) => (
    <button
      onClick={() => setActiveTab(id)}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all"
      style={activeTab === id ? {
        background: "var(--accent)",
        color: "white",
        boxShadow: "0 1px 4px rgba(79,70,229,0.3)",
      } : {
        color: "var(--text-muted)",
      }}
    >
      {icon}
      {label}
    </button>
  );

  return (
    <div className="flex flex-col h-full gap-3 overflow-hidden">
      {/* Top Banner: Sub-Tabs & Metrics */}
      <div className="panel-card flex-none flex flex-wrap items-center justify-between gap-3 py-2.5">
        {/* Sub-Tabs */}
        <div className="flex items-center gap-1 p-1 rounded-lg" style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)" }}>
          <TabBtn id="lattice"     icon={<TreeDeciduous size={13} />} label="Lattice View" />
          <TabBtn id="schedule"    icon={<Table size={13} />}         label="Replicating Portfolio" />
          <TabBtn id="convergence" icon={<TrendingUp size={13} />}    label="BS Convergence" />
        </div>

        {/* Node View Toggle (lattice only) */}
        {activeTab === "lattice" && (
          <div className="flex items-center gap-1 p-1 rounded-lg" style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)" }}>
            <span className="px-2 text-[10px] font-medium uppercase flex items-center gap-1" style={{ color: "var(--text-faint)" }}>
              <Layers size={10} /> View:
            </span>
            {(["compact", "stock", "option", "delta", "all"] as const).map(m => (
              <button
                key={m}
                onClick={() => setDisplayMode(m)}
                className="px-2 py-0.5 rounded text-xs capitalize transition-all font-medium"
                style={displayMode === m ? {
                  background: "var(--accent)",
                  color: "white",
                } : {
                  color: "var(--text-muted)",
                }}
              >
                {m === "compact" ? "S & V" : m}
              </button>
            ))}
          </div>
        )}

        {/* Key Params badges */}
        {tree && (
          <div className="flex flex-wrap items-center gap-3 text-xs font-mono ml-auto px-3 py-1.5 rounded-lg" style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)" }}>
            <span style={{ color: "var(--text-muted)" }}>u: <span className="font-bold" style={{ color: "var(--accent)" }}>{tree.u.toFixed(4)}</span></span>
            <span style={{ color: "var(--text-muted)" }}>d: <span className="font-bold" style={{ color: "var(--accent)" }}>{tree.d.toFixed(4)}</span></span>
            <span style={{ color: "var(--text-muted)" }}>p*: <span className="font-bold" style={{ color: "#059669" }}>{(tree.p * 100).toFixed(2)}%</span></span>
            <span style={{ color: "var(--text-muted)" }}>CRR: <span className="font-bold" style={{ color: "#d97706" }}>${tree.price.toFixed(4)}</span></span>
            <span style={{ color: "var(--text-muted)" }}>BS: <span className="font-bold" style={{ color: "#7c3aed" }}>${tree.bs_price.toFixed(4)}</span></span>
          </div>
        )}
      </div>

      {/* Main Content Area */}
      <div className="flex-1 panel-card min-h-0 relative overflow-hidden p-0">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-full" style={{ color: "var(--text-muted)" }}>
            <div className="w-10 h-10 border-4 rounded-full animate-spin mb-3"
              style={{ borderColor: "var(--border)", borderTopColor: "var(--accent)" }} />
            <p className="text-sm">Calculating Binomial Lattice...</p>
          </div>
        ) : !tree ? (
          <div className="flex flex-col items-center justify-center h-full" style={{ color: "var(--text-faint)" }}>
            <TreeDeciduous size={40} className="mb-2" style={{ color: "var(--accent)", opacity: 0.4 }} />
            <p className="text-sm font-medium">Select parameters in the sidebar and click &quot;Build Option Tree&quot;</p>
          </div>
        ) : activeTab === "lattice" && latticeGeometry ? (
          <div
            ref={containerRef}
            className="w-full h-full relative select-none overflow-hidden bg-slate-50"
            style={{ cursor: isDragging ? "grabbing" : "grab" }}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onWheel={handleWheel}
          >
            {/* ─── GRAPH NAVIGATORS TOOLBAR ─── */}
            <div className="absolute top-3 left-3 z-20 flex items-center gap-1.5 p-1.5 rounded-xl bg-white/95 backdrop-blur shadow-md border border-slate-200">
              <button
                type="button"
                onClick={handleZoomIn}
                title="Zoom In"
                className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-700 transition-colors"
              >
                <ZoomIn size={16} />
              </button>
              <button
                type="button"
                onClick={handleZoomOut}
                title="Zoom Out"
                className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-700 transition-colors"
              >
                <ZoomOut size={16} />
              </button>
              <span className="text-[11px] font-mono font-semibold px-2 text-indigo-600 border-l border-r border-slate-200">
                {Math.round(zoom * 100)}%
              </span>
              <button
                type="button"
                onClick={handleResetView}
                title="Reset View"
                className="flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-slate-100 text-slate-700 text-xs font-medium transition-colors"
              >
                <RotateCcw size={12} />
                <span>Reset</span>
              </button>
              <div className="h-4 w-px bg-slate-200 mx-0.5" />
              {/* Pan Arrows */}
              <button
                type="button"
                onClick={() => handlePan(40, 0)}
                title="Pan Left"
                className="p-1 rounded-md hover:bg-slate-100 text-slate-600 transition-colors"
              >
                <ChevronLeft size={14} />
              </button>
              <button
                type="button"
                onClick={() => handlePan(-40, 0)}
                title="Pan Right"
                className="p-1 rounded-md hover:bg-slate-100 text-slate-600 transition-colors"
              >
                <ChevronRight size={14} />
              </button>
              <button
                type="button"
                onClick={() => handlePan(0, 40)}
                title="Pan Up"
                className="p-1 rounded-md hover:bg-slate-100 text-slate-600 transition-colors"
              >
                <ChevronUp size={14} />
              </button>
              <button
                type="button"
                onClick={() => handlePan(0, -40)}
                title="Pan Down"
                className="p-1 rounded-md hover:bg-slate-100 text-slate-600 transition-colors"
              >
                <ChevronDown size={14} />
              </button>
            </div>

            {/* Hint overlay */}
            <div className="absolute bottom-3 left-3 z-10 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/90 backdrop-blur text-[11px] text-slate-500 border border-slate-200 shadow-sm pointer-events-none">
              <Info size={12} className="text-indigo-500" />
              <span>Drag to pan &bull; Scroll wheel to zoom &bull; Hover nodes for details</span>
            </div>

            {/* ─── SVG LATTICE CANVAS ─── */}
            <svg
              className="w-full h-full pointer-events-auto"
              style={{
                width: "100%",
                height: "100%",
                overflow: "visible",
              }}
            >
              <g
                transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}
                style={{ transformOrigin: "center center", transition: isDragging ? "none" : "transform 0.15s ease-out" }}
              >
                {/* Background grid lines for time steps */}
                {Array.from({ length: tree.N + 1 }, (_, i) => {
                  const x = latticeGeometry.paddingX + i * latticeGeometry.dx;
                  return (
                    <g key={`step-line-${i}`}>
                      <line
                        x1={x}
                        y1={20}
                        x2={x}
                        y2={latticeGeometry.height - 20}
                        stroke="#e2e8f0"
                        strokeDasharray="4 4"
                        strokeWidth="1"
                      />
                      <text
                        x={x}
                        y={25}
                        textAnchor="middle"
                        fill="#64748b"
                        fontSize="11"
                        fontWeight="600"
                        fontFamily="Inter, sans-serif"
                      >
                        Step {i}
                      </text>
                      <text
                        x={x}
                        y={40}
                        textAnchor="middle"
                        fill="#94a3b8"
                        fontSize="9"
                        fontFamily="monospace"
                      >
                        t = {(i * tree.dt).toFixed(2)}y
                      </text>
                    </g>
                  );
                })}

                {/* Connecting Edges */}
                {latticeGeometry.edges.map((edge, idx) => {
                  const midX = (edge.x1 + edge.x2) / 2;
                  const midY = (edge.y1 + edge.y2) / 2;
                  return (
                    <g key={`edge-${idx}`}>
                      <line
                        x1={edge.x1}
                        y1={edge.y1}
                        x2={edge.x2}
                        y2={edge.y2}
                        stroke="#cbd5e1"
                        strokeWidth="2"
                        strokeLinecap="round"
                      />
                      {/* Probability badge on branch */}
                      <rect
                        x={midX - 16}
                        y={midY - 8}
                        width="32"
                        height="16"
                        rx="8"
                        fill="#ffffff"
                        stroke="#e2e8f0"
                        strokeWidth="1"
                      />
                      <text
                        x={midX}
                        y={midY + 3.5}
                        textAnchor="middle"
                        fill={edge.isUp ? "#059669" : "#d97706"}
                        fontSize="8.5"
                        fontWeight="600"
                        fontFamily="monospace"
                      >
                        {edge.isUp ? "p*" : "1-p"}
                      </text>
                    </g>
                  );
                })}

                {/* Adaptive Circle Nodes */}
                {latticeGeometry.nodes.map(node => {
                  const isRoot = node.i === 0;
                  const S = node.S;
                  const V = node.V;
                  const D = node.D;
                  const B = node.B;

                  // Node color styling
                  let fillColor = "#ffffff";
                  let strokeColor = "#6366f1";
                  let strokeWidth = 2;

                  if (isRoot) {
                    fillColor = "#eef2ff";
                    strokeColor = "#4f46e5";
                    strokeWidth = 2.5;
                  } else if (node.isTerminal) {
                    if (node.isITM) {
                      fillColor = "#ecfdf5";
                      strokeColor = "#059669";
                      strokeWidth = 2.5;
                    } else {
                      fillColor = "#f8fafc";
                      strokeColor = "#94a3b8";
                      strokeWidth = 1.5;
                    }
                  }

                  const handleNodeHover = (e: React.MouseEvent) => {
                    const rect = containerRef.current?.getBoundingClientRect();
                    const screenX = e.clientX - (rect?.left || 0);
                    const screenY = e.clientY - (rect?.top || 0);
                    const isCall = params?.option_type !== "put";
                    const intrinsic = Math.max(0, isCall ? S - (params?.K || 100) : (params?.K || 100) - S);

                    setHoveredNode({
                      i: node.i,
                      j: node.j,
                      t: +(node.i * tree.dt).toFixed(3),
                      S, V, D, B,
                      isTerminal: node.isTerminal,
                      isITM: node.isITM,
                      intrinsic,
                      screenX, screenY,
                    });
                  };

                  return (
                    <g
                      key={`node-${node.i}-${node.j}`}
                      transform={`translate(${node.x}, ${node.y})`}
                      className="cursor-pointer transition-transform duration-100 hover:scale-105"
                      onMouseEnter={handleNodeHover}
                      onMouseMove={handleNodeHover}
                      onMouseLeave={() => setHoveredNode(null)}
                    >
                      {/* Outer subtle shadow circle */}
                      <circle
                        r={node.radius + 1}
                        fill="none"
                        stroke="rgba(0,0,0,0.06)"
                        strokeWidth="3"
                      />

                      {/* Adaptive Circle */}
                      <circle
                        r={node.radius}
                        fill={fillColor}
                        stroke={strokeColor}
                        strokeWidth={strokeWidth}
                        style={{
                          filter: "drop-shadow(0px 2px 5px rgba(0,0,0,0.06))",
                          transition: "stroke-width 0.15s, stroke 0.15s",
                        }}
                      />

                      {/* Terminal Badge */}
                      {node.isTerminal && (
                        <g transform={`translate(0, ${-node.radius - 8})`}>
                          <rect
                            x="-15"
                            y="-6"
                            width="30"
                            height="12"
                            rx="6"
                            fill={node.isITM ? "#059669" : "#94a3b8"}
                          />
                          <text
                            x="0"
                            y="3"
                            textAnchor="middle"
                            fill="#ffffff"
                            fontSize="7.5"
                            fontWeight="bold"
                            fontFamily="Inter, sans-serif"
                          >
                            {node.isITM ? "ITM" : "OTM"}
                          </text>
                        </g>
                      )}

                      {/* Root Badge */}
                      {isRoot && (
                        <g transform={`translate(0, ${-node.radius - 8})`}>
                          <rect
                            x="-16"
                            y="-6"
                            width="32"
                            height="12"
                            rx="6"
                            fill="#4f46e5"
                          />
                          <text
                            x="0"
                            y="3"
                            textAnchor="middle"
                            fill="#ffffff"
                            fontSize="7.5"
                            fontWeight="bold"
                            fontFamily="Inter, sans-serif"
                          >
                            ROOT
                          </text>
                        </g>
                      )}

                      {/* Node Text Content based on displayMode */}
                      {displayMode === "compact" && (
                        <>
                          <text
                            x="0"
                            y="-5"
                            textAnchor="middle"
                            fill="#0f172a"
                            fontSize="10.5"
                            fontWeight="bold"
                            fontFamily="Inter, monospace"
                          >
                            S:${S.toFixed(2)}
                          </text>
                          <text
                            x="0"
                            y="11"
                            textAnchor="middle"
                            fill="#4f46e5"
                            fontSize="10"
                            fontWeight="bold"
                            fontFamily="Inter, monospace"
                          >
                            V:${V.toFixed(2)}
                          </text>
                        </>
                      )}

                      {displayMode === "stock" && (
                        <text
                          x="0"
                          y="4"
                          textAnchor="middle"
                          fill="#0f172a"
                          fontSize="11"
                          fontWeight="bold"
                          fontFamily="Inter, monospace"
                        >
                          ${S.toFixed(2)}
                        </text>
                      )}

                      {displayMode === "option" && (
                        <text
                          x="0"
                          y="4"
                          textAnchor="middle"
                          fill="#4f46e5"
                          fontSize="11"
                          fontWeight="bold"
                          fontFamily="Inter, monospace"
                        >
                          ${V.toFixed(2)}
                        </text>
                      )}

                      {displayMode === "delta" && (
                        <text
                          x="0"
                          y="4"
                          textAnchor="middle"
                          fill="#d97706"
                          fontSize="11"
                          fontWeight="bold"
                          fontFamily="Inter, monospace"
                        >
                          {D != null ? `Δ ${D.toFixed(3)}` : "—"}
                        </text>
                      )}

                      {displayMode === "all" && (
                        <>
                          <text
                            x="0"
                            y="-18"
                            textAnchor="middle"
                            fill="#0f172a"
                            fontSize="9"
                            fontWeight="bold"
                            fontFamily="Inter, monospace"
                          >
                            S: ${S.toFixed(1)}
                          </text>
                          <text
                            x="0"
                            y="-5"
                            textAnchor="middle"
                            fill="#4f46e5"
                            fontSize="9"
                            fontWeight="bold"
                            fontFamily="Inter, monospace"
                          >
                            V: ${V.toFixed(2)}
                          </text>
                          <text
                            x="0"
                            y="8"
                            textAnchor="middle"
                            fill="#d97706"
                            fontSize="8.5"
                            fontFamily="Inter, monospace"
                          >
                            {D != null ? `Δ:${D.toFixed(2)}` : ""}
                          </text>
                          <text
                            x="0"
                            y="20"
                            textAnchor="middle"
                            fill="#7c3aed"
                            fontSize="8.5"
                            fontFamily="Inter, monospace"
                          >
                            {B != null ? `β:${B.toFixed(1)}` : ""}
                          </text>
                        </>
                      )}
                    </g>
                  );
                })}
              </g>
            </svg>

            {/* ─── HOVER TOOLTIP CARD ─── */}
            {hoveredNode && (
              <div
                className="absolute z-30 pointer-events-none rounded-xl p-3 bg-white/95 backdrop-blur-md shadow-xl border border-indigo-100 text-xs font-sans w-56 animate-fadeIn"
                style={{
                  left: Math.min(
                    (containerRef.current?.clientWidth || 600) - 240,
                    Math.max(20, hoveredNode.screenX + 20)
                  ),
                  top: Math.min(
                    (containerRef.current?.clientHeight || 400) - 170,
                    Math.max(20, hoveredNode.screenY - 30)
                  ),
                }}
              >
                <div className="flex items-center justify-between pb-1.5 mb-2 border-b border-slate-100">
                  <span className="font-bold text-slate-800">
                    Step {hoveredNode.i}, State {hoveredNode.j}
                  </span>
                  <span className="font-mono text-[10px] text-slate-400">
                    t = {hoveredNode.t} yrs
                  </span>
                </div>

                <div className="space-y-1 font-mono text-[11px]">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Stock (S):</span>
                    <span className="font-bold text-blue-600">${hoveredNode.S.toFixed(4)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Option (V):</span>
                    <span className="font-bold text-indigo-600">${hoveredNode.V.toFixed(4)}</span>
                  </div>
                  {hoveredNode.D != null && (
                    <div className="flex justify-between">
                      <span className="text-slate-500">Delta (Δ):</span>
                      <span className="font-semibold text-amber-600">{hoveredNode.D.toFixed(4)} shares</span>
                    </div>
                  )}
                  {hoveredNode.B != null && (
                    <div className="flex justify-between">
                      <span className="text-slate-500">Bank (β):</span>
                      <span className="font-semibold text-purple-600">${hoveredNode.B.toFixed(4)}</span>
                    </div>
                  )}
                  <div className="flex justify-between pt-1 border-t border-slate-100">
                    <span className="text-slate-500">Intrinsic:</span>
                    <span className="text-slate-700">${hoveredNode.intrinsic.toFixed(4)}</span>
                  </div>
                </div>

                <div className="mt-2 text-[10px] font-semibold text-center py-1 rounded"
                  style={{
                    background: hoveredNode.isITM ? "#ecfdf5" : "#f1f5f9",
                    color: hoveredNode.isITM ? "#059669" : "#64748b",
                  }}
                >
                  {hoveredNode.isITM ? "✓ In-The-Money (ITM)" : "✗ Out-of-The-Money (OTM)"}
                </div>
              </div>
            )}
          </div>
        ) : activeTab === "convergence" ? (
          <div className="w-full h-full p-3">
            {buildConvergencePlot()}
          </div>
        ) : (
          /* Replicating Portfolio Schedule Table */
          <div className="h-full overflow-y-auto scrollbar-thin p-3">
            <table className="w-full text-xs font-mono">
              <thead>
                <tr className="sticky top-0" style={{ borderBottom: "2px solid var(--border)", background: "var(--bg-elevated)" }}>
                  <th className="py-2.5 px-3 text-left" style={{ color: "var(--text-muted)", fontWeight: 600 }}>Step (i)</th>
                  <th className="py-2.5 px-3 text-left" style={{ color: "var(--text-muted)", fontWeight: 600 }}>State (j)</th>
                  <th className="py-2.5 px-3 text-left" style={{ color: "var(--text-muted)", fontWeight: 600 }}>Time t (yrs)</th>
                  <th className="py-2.5 px-3 text-right" style={{ color: "var(--text-muted)", fontWeight: 600 }}>Stock Price S</th>
                  <th className="py-2.5 px-3 text-right" style={{ color: "var(--text-muted)", fontWeight: 600 }}>Option Value V</th>
                  <th className="py-2.5 px-3 text-right" style={{ color: "var(--text-muted)", fontWeight: 600 }}>Hedge Ratio Δ</th>
                  <th className="py-2.5 px-3 text-right" style={{ color: "var(--text-muted)", fontWeight: 600 }}>Bank Bond β</th>
                  <th className="py-2.5 px-3 text-center" style={{ color: "var(--text-muted)", fontWeight: 600 }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: tree.N + 1 }, (_, i) =>
                  Array.from({ length: i + 1 }, (_, j) => {
                    const S = tree.stock[j][i];
                    const V = tree.option[j][i];
                    const D = i < tree.N ? tree.delta[j]?.[i] : null;
                    const B = i < tree.N ? tree.bond[j]?.[i] : null;
                    const isITM = V > 1e-4;
                    return (
                      <tr key={`${i}-${j}`}
                        style={{ borderBottom: "1px solid var(--border)" }}
                        onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "var(--bg-elevated)"}
                        onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "transparent"}
                      >
                        <td className="py-2 px-3" style={{ color: "var(--text-secondary)" }}>Step {i}</td>
                        <td className="py-2 px-3" style={{ color: "var(--text-muted)" }}>{j} (↑{i - j}, ↓{j})</td>
                        <td className="py-2 px-3" style={{ color: "var(--text-secondary)" }}>{(i * tree.dt).toFixed(3)}</td>
                        <td className="py-2 px-3 text-right font-semibold" style={{ color: "#2563eb" }}>${S.toFixed(4)}</td>
                        <td className="py-2 px-3 text-right font-semibold" style={{ color: "#4f46e5" }}>${V.toFixed(4)}</td>
                        <td className="py-2 px-3 text-right" style={{ color: "#d97706" }}>{D != null ? D.toFixed(4) : "—"}</td>
                        <td className="py-2 px-3 text-right" style={{ color: "#7c3aed" }}>{B != null ? `$${B.toFixed(4)}` : "—"}</td>
                        <td className="py-2 px-3 text-center">
                          {isITM ? (
                            <span className="px-2 py-0.5 rounded text-[10px] font-semibold" style={{ background: "#ecfdf5", color: "#059669", border: "1px solid #a7f3d0" }}>ITM</span>
                          ) : (
                            <span className="px-2 py-0.5 rounded text-[10px] font-semibold" style={{ background: "var(--bg-elevated)", color: "var(--text-faint)", border: "1px solid var(--border)" }}>OTM</span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
