"use client";
import React, { useState } from "react";
import { Sliders, Lock, Unlock, Cpu, TreeDeciduous, ChevronDown } from "lucide-react";
import type { SimRequest, TreeRequest, ModelType } from "@/lib/api";

export const MODEL_OPTIONS = [
  { value: "bm",     label: "Brownian Motion",     desc: "dX = μ dt + σ dW" },
  { value: "gbm",    label: "Geometric BM",         desc: "dS = μS dt + σS dW" },
  { value: "ou",     label: "Ornstein–Uhlenbeck",   desc: "dX = θ(μ−X)dt + σdW" },
  { value: "cir",    label: "Cox–Ingersoll–Ross",   desc: "dr = a(b−r)dt + σ√r dW" },
  { value: "heston", label: "Heston Model",         desc: "Stochastic Volatility" },
  { value: "custom", label: "Custom SDE",           desc: "User-defined drift & vol" },
  { value: "tree",   label: "Binomial Option Tree", desc: "CRR Lattice & Replicating Portfolio" },
] as const;

interface ControlPanelProps {
  activeModel: ModelType;
  onModelChange: (model: ModelType) => void;
  onSimulate: (req: SimRequest) => void;
  onBuildTree: (req: TreeRequest) => void;
  loading: boolean;
}

export function ControlPanel({
  activeModel,
  onModelChange,
  onSimulate,
  onBuildTree,
  loading,
}: ControlPanelProps) {
  const [T, setT] = useState(1.0);
  const [nSteps, setNSteps] = useState(252);
  const [nPaths, setNPaths] = useState(200);
  const [x0, setX0] = useState(100.0);
  const [mu, setMu] = useState(0.05);
  const [sigma, setSigma] = useState(0.2);
  const [theta, setTheta] = useState(2.0);
  const [kappa, setKappa] = useState(2.0);
  const [longRunMean, setLongRunMean] = useState(0.04);
  const [v0, setV0] = useState(0.04);
  const [xi, setXi] = useState(0.3);
  const [rho, setRho] = useState(-0.7);
  const [a, setA] = useState(1.5);
  const [b, setB] = useState(0.05);
  const [scheme, setScheme] = useState<SimRequest["scheme"]>("exact");
  const [seed, setSeed] = useState<number | null>(null);
  const [seedLocked, setSeedLocked] = useState(false);
  const [driftExpr, setDriftExpr] = useState("0.5*(1-x)");
  const [volExpr, setVolExpr] = useState("0.2*sqrt(abs(x))");
  const [modelOpen, setModelOpen] = useState(false);

  const [treeS0, setTreeS0] = useState(100.0);
  const [treeK, setTreeK] = useState(100.0);
  const [treeT, setTreeT] = useState(1.0);
  const [treeR, setTreeR] = useState(0.05);
  const [treeSigma, setTreeSigma] = useState(0.20);
  const [treeN, setTreeN] = useState(4);
  const [optionType, setOptionType] = useState<"call" | "put">("call");
  const [american, setAmerican] = useState(false);

  const handleSelectModel = (newModel: ModelType) => {
    onModelChange(newModel);
    setModelOpen(false);
    if (newModel === "bm") {
      setX0(0.0); setMu(0.0); setSigma(1.0);
    } else if (newModel === "gbm") {
      setX0(100.0); setMu(0.05); setSigma(0.20); setScheme("exact");
    } else if (newModel === "ou") {
      setX0(1.0); setTheta(2.0); setLongRunMean(0.04); setSigma(0.20);
    } else if (newModel === "cir") {
      setX0(0.05); setA(1.5); setB(0.05); setSigma(0.10);
    } else if (newModel === "heston") {
      setX0(100.0); setV0(0.04); setMu(0.05); setKappa(2.0); setTheta(0.04); setXi(0.3); setRho(-0.7);
    } else if (newModel === "custom") {
      setX0(1.0); setDriftExpr("0.5*(1-x)"); setVolExpr("0.2*sqrt(abs(x))"); setScheme("euler");
    }
  };

  const handleSubmit = () => {
    if (activeModel === "tree") {
      onBuildTree({ S0: treeS0, K: treeK, T: treeT, r: treeR, sigma: treeSigma, N: treeN, option_type: optionType, american });
    } else {
      onSimulate({
        model: activeModel, T, n_steps: nSteps, n_paths: nPaths,
        x0, mu, sigma, theta, kappa, long_run_mean: longRunMean,
        v0, xi, rho, a, b, scheme, seed: seedLocked ? (seed ?? 42) : null,
        drift_expr: driftExpr, vol_expr: volExpr,
      });
    }
  };

  // Slider component with light theme
  const Slider = ({ label, value, onChange, min, max, step, unit = "" }: {
    label: string; value: number; onChange: (v: number) => void;
    min: number; max: number; step: number; unit?: string;
  }) => (
    <div className="mb-4">
      <div className="flex justify-between items-center mb-1.5">
        <span className="text-xs font-medium uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>{label}</span>
        <span className="text-xs font-mono px-2 py-0.5 rounded font-semibold" style={{ color: "var(--accent)", background: "var(--accent-light)", border: "1px solid #c7d2fe" }}>
          {value.toFixed(step < 1 ? 4 : 0)}{unit}
        </span>
      </div>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="w-full appearance-none cursor-pointer"
        style={{ height: "4px", borderRadius: "99px", background: `linear-gradient(to right, var(--accent) 0%, var(--accent) ${((value - min) / (max - min)) * 100}%, var(--border) ${((value - min) / (max - min)) * 100}%, var(--border) 100%)` }}
      />
    </div>
  );

  // Section heading
  const SectionHead = ({ icon, label, formula }: { icon: React.ReactNode; label: string; formula?: string }) => (
    <div className="flex items-center justify-between mb-3">
      <div className="flex items-center gap-2">
        {icon}
        <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-secondary)" }}>{label}</span>
      </div>
      {formula && (
        <span className="text-[10px] font-mono px-2 py-0.5 rounded" style={{ color: "var(--accent)", background: "var(--accent-light)", border: "1px solid #c7d2fe" }}>
          {formula}
        </span>
      )}
    </div>
  );

  // Toggle button group
  const ToggleGroup = ({ label, options, value, onChange }: {
    label: string;
    options: { value: string; label: string }[];
    value: string;
    onChange: (v: string) => void;
  }) => (
    <div className="mb-3">
      <label className="text-xs font-medium uppercase tracking-wider mb-1.5 block" style={{ color: "var(--text-muted)" }}>{label}</label>
      <div className="flex gap-1.5 p-1 rounded-lg" style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)" }}>
        {options.map(opt => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className="flex-1 py-1.5 rounded-md text-xs font-semibold transition-all"
            style={value === opt.value ? {
              background: "var(--accent)",
              color: "white",
              boxShadow: "0 1px 4px rgba(79,70,229,0.3)",
            } : {
              color: "var(--text-muted)",
            }}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <div className="flex flex-col gap-2.5">
      {/* Hidden trigger for external Run button */}
      <button id="__run-action-trigger" onClick={handleSubmit} style={{ display: "none" }} aria-hidden="true" />
      {/* Process Model Dropdown */}
      <div className="panel-card">
        <SectionHead
          icon={activeModel === "tree"
            ? <TreeDeciduous size={14} style={{ color: "var(--accent)" }} />
            : <Cpu size={14} style={{ color: "var(--accent)" }} />}
          label="Process Model"
        />
        <div className="relative">
          <button
            onClick={() => setModelOpen(!modelOpen)}
            className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm transition-all"
            style={{
              background: "var(--bg-elevated)",
              border: `1px solid ${modelOpen ? "var(--accent)" : "var(--border)"}`,
              color: "var(--text-primary)",
            }}
          >
            <div>
              <div className="font-semibold text-left">{MODEL_OPTIONS.find(m => m.value === activeModel)?.label}</div>
              <div className="text-xs font-mono text-left" style={{ color: "var(--text-muted)" }}>{MODEL_OPTIONS.find(m => m.value === activeModel)?.desc}</div>
            </div>
            <ChevronDown size={14} style={{ color: "var(--text-muted)", transform: modelOpen ? "rotate(180deg)" : "none", transition: "transform 0.2s" }} />
          </button>
          {modelOpen && (
            <div className="absolute top-full left-0 right-0 z-50 mt-1 rounded-xl overflow-hidden" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", boxShadow: "var(--shadow-md)" }}>
              {MODEL_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => handleSelectModel(opt.value)}
                  className="w-full text-left px-3 py-2.5 transition-colors"
                  style={{
                    background: activeModel === opt.value ? "var(--accent-light)" : "transparent",
                    borderLeft: activeModel === opt.value ? "3px solid var(--accent)" : "3px solid transparent",
                    color: activeModel === opt.value ? "var(--accent)" : "var(--text-secondary)",
                  }}
                  onMouseEnter={e => { if (activeModel !== opt.value) (e.currentTarget as HTMLButtonElement).style.background = "var(--bg-elevated)"; }}
                  onMouseLeave={e => { if (activeModel !== opt.value) (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
                >
                  <div className="text-sm font-medium">{opt.label}</div>
                  <div className="text-xs font-mono" style={{ color: "var(--text-faint)" }}>{opt.desc}</div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ─── OPTION TREE PARAMETERS ─── */}
      {activeModel === "tree" && (
        <>
          <div className="panel-card">
            <SectionHead icon={<Sliders size={14} style={{ color: "var(--accent)" }} />} label="Underlying & Strike" />
            <Slider label="Spot Price S₀" value={treeS0} onChange={setTreeS0} min={10} max={500} step={1} />
            <Slider label="Strike Price K" value={treeK} onChange={setTreeK} min={10} max={500} step={1} />
            <Slider label="Maturity T (yrs)" value={treeT} onChange={setTreeT} min={0.1} max={5} step={0.1} />
            <Slider label="Risk-Free Rate r" value={treeR} onChange={setTreeR} min={0} max={0.25} step={0.005} />
            <Slider label="Volatility σ" value={treeSigma} onChange={setTreeSigma} min={0.01} max={1.0} step={0.01} />
          </div>

          <div className="panel-card">
            <SectionHead icon={<TreeDeciduous size={14} style={{ color: "var(--accent)" }} />} label="Lattice Settings" />
            <Slider label="Tree Steps N" value={treeN} onChange={setTreeN} min={1} max={8} step={1} />
            <ToggleGroup
              label="Option Type"
              options={[{ value: "call", label: "Call" }, { value: "put", label: "Put" }]}
              value={optionType}
              onChange={v => setOptionType(v as "call" | "put")}
            />
            <ToggleGroup
              label="Exercise Style"
              options={[{ value: "european", label: "European" }, { value: "american", label: "American" }]}
              value={american ? "american" : "european"}
              onChange={v => setAmerican(v === "american")}
            />
          </div>
        </>
      )}

      {/* ─── MONTE CARLO PARAMETERS ─── */}
      {activeModel !== "tree" && (
        <>
          <div className="panel-card">
            <SectionHead icon={<Sliders size={14} style={{ color: "var(--accent)" }} />} label="Simulation Grid" />
            <Slider label="Time Horizon T" value={T} onChange={setT} min={0.1} max={10} step={0.1} />
            <Slider label="Time Steps N" value={nSteps} onChange={setNSteps} min={50} max={2000} step={50} />
            <Slider label="Paths" value={nPaths} onChange={setNPaths} min={20} max={2000} step={20} />
            <Slider label="Initial Value X₀" value={x0} onChange={setX0}
              min={activeModel === "bm" ? -100 : activeModel === "cir" ? 0.001 : 1}
              max={activeModel === "cir" ? 1 : 500}
              step={activeModel === "cir" ? 0.01 : 1}
            />
          </div>

          {activeModel === "bm" && (
            <div className="panel-card">
              <SectionHead icon={<Sliders size={14} style={{ color: "var(--accent)" }} />} label="Brownian Motion" formula="dX = μdt + σdW" />
              <Slider label="Drift μ" value={mu} onChange={setMu} min={-2} max={2} step={0.01} />
              <Slider label="Volatility σ" value={sigma} onChange={setSigma} min={0.01} max={5} step={0.01} />
              <div className="flex gap-1.5 mt-1">
                <button type="button" onClick={() => { setMu(0); setSigma(1); }}
                  className="flex-1 py-1.5 rounded text-[11px] font-medium transition-colors"
                  style={{ background: "var(--bg-elevated)", color: "var(--text-secondary)", border: "1px solid var(--border)" }}>
                  Standard (μ=0, σ=1)
                </button>
                <button type="button" onClick={() => { setMu(0.5); setSigma(0.3); }}
                  className="flex-1 py-1.5 rounded text-[11px] font-medium transition-colors"
                  style={{ background: "var(--bg-elevated)", color: "var(--text-secondary)", border: "1px solid var(--border)" }}>
                  Drifted (μ=0.5, σ=0.3)
                </button>
              </div>
            </div>
          )}

          {activeModel === "gbm" && (
            <div className="panel-card">
              <SectionHead icon={<Sliders size={14} style={{ color: "var(--accent)" }} />} label="GBM Parameters" formula="dS = μS dt + σS dW" />
              <Slider label="Drift μ" value={mu} onChange={setMu} min={-0.5} max={0.5} step={0.01} />
              <Slider label="Volatility σ" value={sigma} onChange={setSigma} min={0.01} max={1} step={0.01} />
              <ToggleGroup
                label="Discretization Scheme"
                options={[{ value: "exact", label: "Exact" }, { value: "euler", label: "Euler" }]}
                value={scheme}
                onChange={v => setScheme(v as SimRequest["scheme"])}
              />
            </div>
          )}

          {activeModel === "ou" && (
            <div className="panel-card">
              <SectionHead icon={<Sliders size={14} style={{ color: "var(--accent)" }} />} label="OU / Vasicek" formula="dX = θ(μ−X)dt + σdW" />
              <Slider label="Speed θ" value={theta} onChange={setTheta} min={0.1} max={10} step={0.1} />
              <Slider label="Long-run Mean μ" value={longRunMean} onChange={setLongRunMean} min={-2} max={2} step={0.01} />
              <Slider label="Volatility σ" value={sigma} onChange={setSigma} min={0.01} max={1} step={0.01} />
            </div>
          )}

          {activeModel === "cir" && (
            <div className="panel-card">
              <SectionHead icon={<Sliders size={14} style={{ color: "var(--accent)" }} />} label="CIR Parameters" formula="dr = a(b−r)dt + σ√r dW" />
              <Slider label="Speed a" value={a} onChange={setA} min={0.1} max={10} step={0.1} />
              <Slider label="Long-run Mean b" value={b} onChange={setB} min={0.001} max={0.2} step={0.001} />
              <Slider label="Volatility σ" value={sigma} onChange={setSigma} min={0.01} max={0.5} step={0.01} />
            </div>
          )}

          {activeModel === "heston" && (
            <div className="panel-card">
              <SectionHead icon={<Sliders size={14} style={{ color: "var(--accent)" }} />} label="Heston Parameters" />
              <Slider label="Drift μ" value={mu} onChange={setMu} min={-0.2} max={0.3} step={0.01} />
              <Slider label="Initial Var v₀" value={v0} onChange={setV0} min={0.01} max={0.5} step={0.01} />
              <Slider label="Mean Reversion κ" value={kappa} onChange={setKappa} min={0.1} max={10} step={0.1} />
              <Slider label="Long-term Var θ" value={theta} onChange={setTheta} min={0.01} max={0.5} step={0.01} />
              <Slider label="Vol of Vol ξ" value={xi} onChange={setXi} min={0.05} max={1} step={0.01} />
              <Slider label="Correlation ρ" value={rho} onChange={setRho} min={-1} max={1} step={0.05} />
            </div>
          )}

          {activeModel === "custom" && (
            <div className="panel-card">
              <SectionHead icon={<Sliders size={14} style={{ color: "var(--accent)" }} />} label="Custom SDE" />
              <div className="mb-3">
                <label className="text-xs block mb-1" style={{ color: "var(--text-muted)" }}>Drift μ(t, x)</label>
                <input
                  type="text" value={driftExpr} onChange={e => setDriftExpr(e.target.value)}
                  placeholder="e.g. 0.5*(1-x)"
                  className="w-full font-mono text-xs rounded-lg px-3 py-2 focus:outline-none transition-colors"
                  style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)", color: "var(--accent)", }}
                />
              </div>
              <div className="mb-3">
                <label className="text-xs block mb-1" style={{ color: "var(--text-muted)" }}>Volatility σ(t, x)</label>
                <input
                  type="text" value={volExpr} onChange={e => setVolExpr(e.target.value)}
                  placeholder="e.g. 0.2*sqrt(abs(x))"
                  className="w-full font-mono text-xs rounded-lg px-3 py-2 focus:outline-none transition-colors"
                  style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)", color: "var(--accent)" }}
                />
              </div>
              <ToggleGroup
                label="Scheme"
                options={[{ value: "euler", label: "Euler" }, { value: "milstein", label: "Milstein" }]}
                value={scheme}
                onChange={v => setScheme(v as SimRequest["scheme"])}
              />
            </div>
          )}

          <div className="panel-card">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-secondary)" }}>RNG Seed (CRN)</span>
              <button onClick={() => setSeedLocked(!seedLocked)}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium transition-all"
                style={seedLocked ? {
                  background: "#fffbeb", color: "#b45309", border: "1px solid #fde68a"
                } : {
                  background: "var(--bg-elevated)", color: "var(--text-muted)", border: "1px solid var(--border)"
                }}>
                {seedLocked ? <Lock size={11} /> : <Unlock size={11} />}
                {seedLocked ? "Locked" : "Random"}
              </button>
            </div>
            {seedLocked && (
              <input
                type="number" value={seed ?? 42} onChange={e => setSeed(Number(e.target.value))}
                className="w-full font-mono text-sm rounded-lg px-3 py-2 focus:outline-none"
                style={{ background: "#fffbeb", border: "1px solid #fde68a", color: "#b45309" }}
              />
            )}
            <p className="text-xs mt-1.5" style={{ color: "var(--text-faint)" }}>Lock seed to enable Common Random Numbers across models</p>
          </div>
        </>
      )}
      {/* Hidden button triggered by sticky RunButton */}
      <button id="__run-action-trigger" type="button" onClick={handleSubmit} style={{ display: "none" }} aria-hidden="true" />
    </div>
  );
}

// Fixed-position Run button rendered separately, sticky to bottom of sidebar
export function RunButton({ activeModel, loading, onSubmit }: { activeModel: ModelType; loading: boolean; onSubmit: () => void }) {
  return (
    <div className="p-3 pt-2.5 pb-4 z-20 flex-none" style={{ background: "var(--bg-surface)", borderTop: "1px solid var(--border)", boxShadow: "0 -2px 10px rgba(0,0,0,0.04)" }}>
      <button
        onClick={onSubmit}
        disabled={loading}
        className="w-full py-3 rounded-xl font-bold text-sm tracking-wide transition-all duration-200"
        style={{
          background: loading ? "var(--border)" : "linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)",
          color: "white",
          opacity: loading ? 0.7 : 1,
          cursor: loading ? "not-allowed" : "pointer",
          boxShadow: loading ? "none" : "0 4px 14px rgba(79,70,229,0.3)",
        }}
      >
        {loading ? (
          <span className="flex items-center justify-center gap-2">
            <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
            {activeModel === "tree" ? "Building Tree…" : "Simulating…"}
          </span>
        ) : activeModel === "tree" ? "▶  Build Option Tree" : "▶  Run Simulation"}
      </button>
    </div>
  );
}
