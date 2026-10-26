"use client";
import React, { useState, useCallback, useEffect, useRef } from "react";
import { Activity, BarChart2, Table, TreeDeciduous, Sigma, Wifi, WifiOff, Menu, X } from "lucide-react";
import { ControlPanel, RunButton } from "@/components/ControlPanel";
import { PathChart } from "@/components/PathChart";
import { HistogramChart } from "@/components/HistogramChart";
import { StatsPanel } from "@/components/StatsPanel";
import { TreeViewer } from "@/components/TreeViewer";
import { PdfExportButton } from "@/components/PdfExportButton";
import { runSimulation, runTree, API_BASE } from "@/lib/api";
import type { SimRequest, SimResponse, TreeRequest, TreeResponse, ModelType } from "@/lib/api";

const MC_TABS = [
  { id: "paths",  label: "Paths",        icon: Activity },
  { id: "hist",   label: "Distribution", icon: BarChart2 },
  { id: "stats",  label: "Statistics",   icon: Table },
] as const;

type McTabId = typeof MC_TABS[number]["id"];

const MODEL_NAMES: Record<string, string> = {
  bm: "Brownian Motion",
  gbm: "Geometric BM",
  ou: "Ornstein–Uhlenbeck",
  cir: "Cox–Ingersoll–Ross",
  heston: "Heston",
  custom: "Custom SDE",
  tree: "Binomial Option Tree",
};

/** Default simulation parameters per model — used when auto-simulating on switch */
const MODEL_DEFAULTS: Record<string, Partial<SimRequest>> = {
  bm:     { model: "bm",     x0: 0.0,   mu: 0.0,  sigma: 1.0,  T: 1.0, n_steps: 252, n_paths: 200, scheme: "euler",  theta: 2.0, kappa: 2.0, long_run_mean: 0.04, v0: 0.04, xi: 0.3, rho: -0.7, a: 1.5, b: 0.05, drift_expr: "0.5*(1-x)", vol_expr: "0.2*sqrt(abs(x))" },
  gbm:    { model: "gbm",    x0: 100.0, mu: 0.05, sigma: 0.20, T: 1.0, n_steps: 252, n_paths: 200, scheme: "exact",  theta: 2.0, kappa: 2.0, long_run_mean: 0.04, v0: 0.04, xi: 0.3, rho: -0.7, a: 1.5, b: 0.05, drift_expr: "0.5*(1-x)", vol_expr: "0.2*sqrt(abs(x))" },
  ou:     { model: "ou",     x0: 1.0,   mu: 0.0,  sigma: 0.20, T: 1.0, n_steps: 252, n_paths: 200, scheme: "euler",  theta: 2.0, kappa: 2.0, long_run_mean: 0.04, v0: 0.04, xi: 0.3, rho: -0.7, a: 1.5, b: 0.05, drift_expr: "0.5*(1-x)", vol_expr: "0.2*sqrt(abs(x))" },
  cir:    { model: "cir",    x0: 0.05,  mu: 0.0,  sigma: 0.10, T: 1.0, n_steps: 252, n_paths: 200, scheme: "euler",  theta: 2.0, kappa: 2.0, long_run_mean: 0.04, v0: 0.04, xi: 0.3, rho: -0.7, a: 1.5, b: 0.05, drift_expr: "0.5*(1-x)", vol_expr: "0.2*sqrt(abs(x))" },
  heston: { model: "heston", x0: 100.0, mu: 0.05, sigma: 0.20, T: 1.0, n_steps: 252, n_paths: 200, scheme: "euler",  theta: 0.04, kappa: 2.0, long_run_mean: 0.04, v0: 0.04, xi: 0.3, rho: -0.7, a: 1.5, b: 0.05, drift_expr: "0.5*(1-x)", vol_expr: "0.2*sqrt(abs(x))" },
  custom: { model: "custom", x0: 1.0,   mu: 0.0,  sigma: 0.20, T: 1.0, n_steps: 252, n_paths: 200, scheme: "euler",  theta: 2.0, kappa: 2.0, long_run_mean: 0.04, v0: 0.04, xi: 0.3, rho: -0.7, a: 1.5, b: 0.05, drift_expr: "0.5*(1-x)", vol_expr: "0.2*sqrt(abs(x))" },
};

export default function Home() {
  const [activeModel, setActiveModel] = useState<ModelType>("gbm");
  const [tab, setTab] = useState<McTabId>("paths");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SimResponse | null>(null);
  const [currentReq, setCurrentReq] = useState<SimRequest | null>(null);

  const [treeResult, setTreeResult] = useState<TreeResponse | null>(null);
  const [treeParams, setTreeParams] = useState<TreeRequest | null>(null);
  const [treeLoading, setTreeLoading] = useState(false);
  const [treeError, setTreeError] = useState<string | null>(null);

  const [apiStatus, setApiStatus] = useState<"ok" | "error" | "checking">("checking");

  // Mobile sidebar drawer state
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);

  // Close sidebar when clicking outside on mobile
  useEffect(() => {
    const handler = (e: MouseEvent | TouchEvent) => {
      if (sidebarOpen && sidebarRef.current && !sidebarRef.current.contains(e.target as Node)) {
        setSidebarOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    document.addEventListener("touchstart", handler);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("touchstart", handler);
    };
  }, [sidebarOpen]);

  // Lock body scroll when mobile drawer is open
  useEffect(() => {
    document.body.style.overflow = sidebarOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [sidebarOpen]);

  useEffect(() => {
    const check = async () => {
      try {
        const r = await fetch(`${API_BASE}/api/health`);
        setApiStatus(r.ok ? "ok" : "error");
      } catch { setApiStatus("error"); }
    };
    check();
    const iv = setInterval(check, 10000);
    return () => clearInterval(iv);
  }, []);

  const handleSimulate = useCallback(async (req: SimRequest) => {
    setLoading(true); setError(null); setCurrentReq(req);
    try {
      const res = await runSimulation(req);
      setResult(res);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Simulation failed");
    } finally { setLoading(false); }
  }, []);

  const handleBuildTree = useCallback(async (req: TreeRequest) => {
    setTreeLoading(true); setTreeError(null); setTreeParams(req);
    try {
      const res = await runTree(req);
      setTreeResult(res);
    } catch (e: unknown) {
      setTreeError(e instanceof Error ? e.message : "Tree valuation failed");
    } finally { setTreeLoading(false); }
  }, []);

  const handleModelChange = useCallback((newModel: ModelType) => {
    setActiveModel(newModel);
    setSidebarOpen(false);

    if (newModel === "tree") {
      if (!treeResult && !treeLoading) {
        handleBuildTree({ S0: 100, K: 100, T: 1.0, r: 0.05, sigma: 0.2, N: 4, option_type: "call", american: false });
      }
    } else {
      // Auto-simulate with model defaults on switch
      const defaults = MODEL_DEFAULTS[newModel];
      if (defaults) {
        handleSimulate({ ...defaults, seed: null } as SimRequest);
      }
    }
  }, [treeResult, treeLoading, handleBuildTree, handleSimulate]);

  // Initial simulation on mount
  useEffect(() => {
    handleSimulate({
      model: "gbm", T: 1.0, n_steps: 252, n_paths: 200, x0: 100.0,
      mu: 0.05, sigma: 0.2, theta: 2.0, kappa: 2.0, long_run_mean: 0.04,
      v0: 0.04, xi: 0.3, rho: -0.7, a: 1.5, b: 0.05, scheme: "exact", seed: 42,
      drift_expr: "0.5*(1-x)", vol_expr: "0.2*sqrt(abs(x))",
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pdfParams: Record<string, unknown> = currentReq ? {
    Model: MODEL_NAMES[currentReq.model] || currentReq.model,
    T: currentReq.T, "N Steps": currentReq.n_steps,
    "N Paths": currentReq.n_paths, "X₀": currentReq.x0,
    μ: currentReq.mu, σ: currentReq.sigma,
    Seed: currentReq.seed ?? "random", Scheme: currentReq.scheme,
  } : {};

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100svh",
        overflow: "hidden",
        background: "var(--bg-primary)",
        color: "var(--text-primary)",
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
      }}
    >
      {/* ─── Navbar ─── */}
      <header style={{
        flexShrink: 0,
        zIndex: 40,
        background: "var(--bg-surface)",
        borderBottom: "1px solid var(--border)",
        boxShadow: "var(--shadow-sm)",
        height: 48,
        display: "flex",
        alignItems: "center",
        padding: "0 12px",
        gap: 8,
        justifyContent: "space-between",
      }}>
        {/* Left */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
          {/* Hamburger — only visible on mobile via CSS class */}
          <button
            className="mobile-only-flex"
            onClick={() => setSidebarOpen(true)}
            aria-label="Open menu"
            style={{
              alignItems: "center",
              justifyContent: "center",
              width: 32, height: 32,
              borderRadius: 8,
              borderWidth: 1,
              borderStyle: "solid",
              borderColor: "var(--border)",
              background: "var(--bg-elevated)",
              color: "var(--text-muted)",
              cursor: "pointer",
              flexShrink: 0,
            }}
          >
            <Menu size={16} />
          </button>

          <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
            <div style={{
              width: 28, height: 28, borderRadius: 8, flexShrink: 0,
              display: "flex", alignItems: "center", justifyContent: "center",
              background: "linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)",
            }}>
              <Sigma size={14} style={{ color: "white" }} />
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 0 }}>
              <span style={{ fontWeight: 700, fontSize: 14, letterSpacing: "-0.02em", color: "var(--text-primary)" }}>Stochastic</span>
              <span style={{ fontWeight: 700, fontSize: 14, letterSpacing: "-0.02em", color: "var(--accent)", marginLeft: 4 }}>Sandbox</span>
            </div>
            <span className="desktop-only" style={{ fontSize: 11, color: "var(--text-faint)", whiteSpace: "nowrap" }}>
              | Quantitative Modeling &amp; SDE Simulator
            </span>
          </div>
        </div>

        {/* Center: active model badge (desktop only) */}
        <div className="desktop-only" style={{
          display: "flex", alignItems: "center", gap: 6,
          padding: "5px 12px", borderRadius: 8,
          background: "var(--accent-light)", border: "1px solid var(--border)",
        }}>
          <span style={{ fontSize: 11, color: "var(--text-muted)" }}>Active Model:</span>
          <span style={{ fontSize: 11, fontWeight: 600, fontFamily: "monospace", color: "var(--accent)" }}>{MODEL_NAMES[activeModel]}</span>
        </div>

        {/* Right */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          {activeModel !== "tree" && result && currentReq && (
            <PdfExportButton
              model={MODEL_NAMES[currentReq.model]}
              params={pdfParams}
              stats={result.stats}
              theoretical={result.theoretical}
              sde_meta={(result.extra?.sde_meta as Record<string, string>) || {}}
            />
          )}
          <div style={{
            display: "flex", alignItems: "center", gap: 5,
            fontSize: 11, padding: "4px 10px", borderRadius: 9999,
            color: apiStatus === "ok" ? "var(--success)" : apiStatus === "error" ? "var(--danger)" : "var(--text-muted)",
            background: apiStatus === "ok" ? "var(--success-light)" : apiStatus === "error" ? "var(--danger-light)" : "var(--bg-elevated)",
            border: `1px solid ${apiStatus === "ok" ? "#a7f3d0" : apiStatus === "error" ? "#fca5a5" : "var(--border)"}`,
            transition: "all 0.2s",
          }}>
            {apiStatus === "ok" ? <Wifi size={11} /> : <WifiOff size={11} />}
            <span className="desktop-only">{apiStatus === "ok" ? "API Online" : apiStatus === "error" ? "API Offline" : "…"}</span>
          </div>
        </div>
      </header>

      {/* ─── Mobile backdrop ─── */}
      {sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          style={{
            position: "fixed", inset: 0, zIndex: 49,
            background: "rgba(0,0,0,0.45)",
            backdropFilter: "blur(2px)",
          }}
        />
      )}

      {/* ─── Body: sidebar + main ─── */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden", position: "relative" }}>

        {/* ── Sidebar ── */}
        <aside
          ref={sidebarRef}
          className={`app-sidebar${sidebarOpen ? " sidebar-open" : ""}`}
          style={{
            background: "var(--bg-surface)",
            borderRight: "1px solid var(--border)",
          }}
        >
          {/* Mobile-only close row */}
          <div className="mobile-only-flex sidebar-close-row">
            <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Configure</span>
            <button
              onClick={() => setSidebarOpen(false)}
              aria-label="Close menu"
              style={{
                display: "flex", alignItems: "center", justifyContent: "center",
                width: 28, height: 28, borderRadius: 7,
                borderWidth: 1, borderStyle: "solid", borderColor: "var(--border)",
                background: "var(--bg-elevated)",
                color: "var(--text-muted)", cursor: "pointer",
              }}
            >
              <X size={14} />
            </button>
          </div>

          <div style={{ flex: 1, overflowY: "auto", padding: 12 }} className="scrollbar-thin">
            <ControlPanel
              activeModel={activeModel}
              onModelChange={handleModelChange}
              onSimulate={handleSimulate}
              onBuildTree={handleBuildTree}
              loading={loading || treeLoading}
            />
          </div>

          <RunButton
            activeModel={activeModel}
            loading={loading || treeLoading}
            onSubmit={() => {
              const btn = document.getElementById("__run-action-trigger");
              if (btn) btn.click();
              setSidebarOpen(false);
            }}
          />
        </aside>

        {/* ── Main panel ── */}
        <main style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", background: "var(--bg-primary)", minWidth: 0 }}>

          {activeModel === "tree" ? (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
              <div style={{
                flexShrink: 0, padding: "0 14px", height: 44,
                display: "flex", alignItems: "center", justifyContent: "space-between",
                background: "var(--bg-surface)", borderBottom: "1px solid var(--border)",
                gap: 8,
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                  <TreeDeciduous size={14} style={{ color: "var(--success)", flexShrink: 0 }} />
                  <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-primary)", whiteSpace: "nowrap" }}>CRR Binomial Lattice</span>
                  <span className="desktop-only" style={{ fontSize: 10, color: "var(--text-faint)" }}>| Discrete-Time Option Valuation</span>
                </div>
                {treeResult && (
                  <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 11, fontFamily: "monospace", flexShrink: 0 }}>
                    <span style={{ color: "var(--text-muted)" }}>
                      CRR: <span style={{ fontWeight: 700, color: "var(--success)" }}>${treeResult.price.toFixed(4)}</span>
                    </span>
                    <span className="desktop-only" style={{ color: "var(--text-muted)" }}>
                      BS: <span style={{ fontWeight: 600, color: "var(--accent)" }}>${treeResult.bs_price.toFixed(4)}</span>
                    </span>
                  </div>
                )}
              </div>
              <div style={{ flex: 1, overflow: "hidden", padding: "12px 14px" }}>
                {treeError && (
                  <div style={{ marginBottom: 12, display: "flex", alignItems: "center", gap: 8, fontSize: 12, borderRadius: 8, padding: "10px 14px", color: "var(--danger)", background: "var(--danger-light)", border: "1px solid #fca5a5" }}>
                    <span style={{ fontWeight: 700 }}>Error:</span> {treeError}
                  </div>
                )}
                <TreeViewer tree={treeResult} loading={treeLoading} params={treeParams} />
              </div>
            </div>

          ) : (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
              {/* Tab bar */}
              <div style={{
                flexShrink: 0, padding: "0 14px",
                minHeight: 44, display: "flex", alignItems: "center",
                justifyContent: "space-between", flexWrap: "wrap", gap: 4,
                background: "var(--bg-surface)", borderBottom: "1px solid var(--border)",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
                  {MC_TABS.map(t => (
                    <button
                      key={t.id}
                      onClick={() => setTab(t.id)}
                      style={{
                        display: "flex", alignItems: "center", gap: 5,
                        padding: "6px 10px", borderRadius: "8px 8px 0 0",
                        fontSize: 12, fontWeight: 500, cursor: "pointer",
                        transition: "all 0.15s",
                        marginBottom: -1,
                        // Use only non-shorthand border properties (no 'border' or 'borderBottom' shorthand)
                        borderTopWidth: 0, borderLeftWidth: 0, borderRightWidth: 0,
                        borderTopStyle: "solid", borderLeftStyle: "solid", borderRightStyle: "solid",
                        borderTopColor: "transparent", borderLeftColor: "transparent", borderRightColor: "transparent",
                        borderBottomWidth: 2,
                        borderBottomStyle: "solid",
                        borderBottomColor: tab === t.id ? "var(--accent)" : "transparent",
                        color: tab === t.id ? "var(--accent)" : "var(--text-muted)",
                        background: tab === t.id ? "var(--accent-light)" : "transparent",
                      }}
                    >
                      <t.icon size={12} />
                      <span>{t.label}</span>
                    </button>
                  ))}
                </div>
                {result && (
                  <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 11, fontFamily: "monospace", color: "var(--text-muted)", paddingBottom: 4, flexWrap: "wrap" }}>
                    <span>μ̂=<span style={{ color: "var(--text-primary)" }}>{result.stats.mean?.toFixed(3)}</span></span>
                    <span className="desktop-only">σ̂=<span style={{ color: "var(--text-primary)" }}>{result.stats.std?.toFixed(3)}</span></span>
                    <span>n=<span style={{ color: "var(--text-primary)" }}>{result.paths.length}</span></span>
                  </div>
                )}
              </div>

              {/* Chart / content area */}
              <div style={{ flex: 1, overflow: "hidden", padding: "12px 14px" }}>
                {error && (
                  <div style={{ marginBottom: 12, display: "flex", alignItems: "center", gap: 8, fontSize: 12, borderRadius: 8, padding: "10px 14px", color: "var(--danger)", background: "var(--danger-light)", border: "1px solid #fca5a5" }}>
                    <span style={{ fontWeight: 700 }}>Error:</span> {error}
                  </div>
                )}
                {!result && !loading && (
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", textAlign: "center" }}>
                    <div style={{ width: 64, height: 64, borderRadius: 16, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 16, background: "var(--accent-light)", border: "1px solid #c7d2fe" }}>
                      <Sigma size={28} style={{ color: "var(--accent)" }} />
                    </div>
                    <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8, color: "var(--text-secondary)" }}>Configure &amp; Simulate</h2>
                    <p style={{ fontSize: 13, maxWidth: 320, color: "var(--text-muted)" }}>
                      Select a model, adjust parameters in the sidebar, and click <span style={{ fontWeight: 600, color: "var(--accent)" }}>Run Simulation</span>.
                    </p>
                    {apiStatus === "error" && (
                      <div style={{ marginTop: 16, fontSize: 11, borderRadius: 8, padding: "10px 14px", maxWidth: 320, color: "#b45309", background: "#fffbeb", border: "1px solid #fde68a" }}>
                        ⚠ Backend API is offline.<br />
                        <code style={{ fontFamily: "monospace" }}>cd backend &amp;&amp; venv\Scripts\uvicorn main:app --reload</code>
                      </div>
                    )}
                  </div>
                )}
                {loading && (
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%" }}>
                    <div style={{ width: 44, height: 44, border: `4px solid var(--border)`, borderTopColor: "var(--accent)", borderRadius: "50%", marginBottom: 16 }} className="animate-spin" />
                    <p style={{ fontSize: 13, color: "var(--text-muted)" }}>Running Monte Carlo simulation…</p>
                  </div>
                )}
                {result && !loading && (
                  <div style={{ height: "100%", position: "relative" }}>
                    <div style={{ height: "100%", display: tab === "paths" ? "block" : "none" }}>
                      <PathChart timeGrid={result.time_grid} paths={result.paths} model={currentReq?.model || "gbm"} />
                    </div>
                    <div style={{ height: "100%", display: tab === "hist" ? "block" : "none" }}>
                      <HistogramChart paths={result.paths} model={currentReq?.model || "gbm"} theoretical={result.theoretical} />
                    </div>
                    {tab === "stats" && (
                      <div style={{ height: "100%" }}>
                        <StatsPanel
                          stats={result.stats}
                          theoretical={result.theoretical}
                          extra={result.extra}
                          model={currentReq?.model || "gbm"}
                          nPaths={result.paths.length}
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
