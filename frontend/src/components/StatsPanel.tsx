"use client";
import React from "react";
import { BarChart3, Info, TrendingUp } from "lucide-react";

interface StatsPanelProps {
  stats: Record<string, number>;
  theoretical: Record<string, number | null>;
  extra?: Record<string, unknown>;
  model: string;
  nPaths?: number;
}

// Per-model: which stats have known theoretical values
const MODEL_STAT_CONFIG: Record<string, { key: string; label: string }[]> = {
  bm: [
    { key: "mean",     label: "Mean"      },
    { key: "std",      label: "Std Dev"   },
    { key: "skewness", label: "Skewness"  },
    { key: "kurtosis", label: "Ex. Kurtosis" },
  ],
  gbm: [
    { key: "mean",     label: "Mean"      },
    { key: "std",      label: "Std Dev"   },
    { key: "skewness", label: "Skewness"  },
    { key: "kurtosis", label: "Ex. Kurtosis" },
  ],
  ou: [
    { key: "mean",     label: "Mean"      },
    { key: "std",      label: "Std Dev"   },
    { key: "skewness", label: "Skewness"  },
    { key: "kurtosis", label: "Ex. Kurtosis" },
  ],
  cir: [
    { key: "mean",     label: "Mean"      },
    { key: "std",      label: "Std Dev"   },
  ],
  heston: [
    { key: "mean",     label: "E[S(T)]"   },
  ],
  custom: [],
};

// Empirical-only stats to always show
const EMPIRICAL_ONLY_CONFIG = [
  { key: "median",   label: "Median"    },
  { key: "p5",       label: "5th %ile"  },
  { key: "p95",      label: "95th %ile" },
  { key: "min",      label: "Min"       },
  { key: "max",      label: "Max"       },
];

// Format discrepancy: relative % when theo != 0, absolute Δ when theo == 0
function renderDiscrepancy(emp: number | undefined, theo: number | null | undefined) {
  if (theo == null || isNaN(theo) || emp == null || isNaN(emp)) {
    return <span className="text-xs text-slate-400 font-mono">—</span>;
  }

  if (Math.abs(theo) >= 1e-4) {
    const pct = ((emp - theo) / Math.abs(theo)) * 100;
    const abs = Math.abs(pct);
    const color = abs < 2 ? "#059669" : abs < 10 ? "#d97706" : "#dc2626";
    const bg    = abs < 2 ? "#ecfdf5" : abs < 10 ? "#fffbeb" : "#fef2f2";
    const sign = pct >= 0 ? "+" : "";
    return (
      <span className="text-xs font-mono px-2 py-0.5 rounded font-semibold" style={{ color, background: bg }}>
        {sign}{pct.toFixed(2)}%
      </span>
    );
  } else {
    // When theoretical is 0 (e.g. mean in zero-drift BM, skewness=0, kurtosis=0)
    const diff = emp - theo;
    const abs = Math.abs(diff);
    const color = abs < 0.05 ? "#059669" : abs < 0.15 ? "#d97706" : "#dc2626";
    const bg    = abs < 0.05 ? "#ecfdf5" : abs < 0.15 ? "#fffbeb" : "#fef2f2";
    const sign = diff >= 0 ? "+" : "";
    return (
      <span className="text-xs font-mono px-2 py-0.5 rounded font-semibold" style={{ color, background: bg }}>
        Δ {sign}{diff.toFixed(4)}
      </span>
    );
  }
}

export function StatsPanel({ stats, theoretical, extra, model, nPaths }: StatsPanelProps) {
  const theoreticalConfig = MODEL_STAT_CONFIG[model] ?? [];
  const totalPaths = nPaths ?? stats.n_paths ?? (extra?.n_paths as number) ?? 200;

  return (
    <div className="flex flex-col gap-3 h-full overflow-y-auto pr-1 scrollbar-thin">
      {/* Feller condition banner */}
      {model === "cir" && extra?.feller_condition !== undefined && (
        <div className={`flex items-start gap-2 p-3 rounded-lg text-xs border`}
          style={extra.feller_condition
            ? { background: "#ecfdf5", border: "1px solid #a7f3d0", color: "#059669" }
            : { background: "#fef2f2", border: "1px solid #fca5a5", color: "#dc2626" }
          }
        >
          <Info size={13} className="mt-0.5 flex-shrink-0" />
          <div>
            <div className="font-semibold">Feller Condition (2ab &gt; σ²)</div>
            <div className="font-mono mt-0.5">
              2ab = {(extra.feller_value as number)?.toFixed(4)} &nbsp;|&nbsp;
              σ² = {(extra.sigma_sq as number)?.toFixed(4)} &nbsp;→&nbsp;
              {extra.feller_condition ? "✓ Satisfied" : "✗ Violated — process may hit zero"}
            </div>
          </div>
        </div>
      )}

      {/* ── Empirical vs Theoretical (only rows that have theory) ── */}
      {theoreticalConfig.length > 0 && (
        <div className="panel-card">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp size={14} style={{ color: "var(--accent)" }} />
            <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-secondary)" }}>
              Empirical vs Theoretical
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)" }}>
                  <th className="text-left py-2" style={{ color: "var(--text-muted)", fontWeight: 500 }}>Statistic</th>
                  <th className="text-right py-2" style={{ color: "var(--text-muted)", fontWeight: 500 }}>Empirical</th>
                  <th className="text-right py-2" style={{ color: "var(--text-muted)", fontWeight: 500 }}>Theoretical</th>
                  <th className="text-right py-2" style={{ color: "var(--text-muted)", fontWeight: 500 }}>Deviation</th>
                </tr>
              </thead>
              <tbody>
                {theoreticalConfig.map(({ key, label }) => {
                  const theo = theoretical[key];
                  if (theo == null) return null; // skip if no theory for this model run
                  const emp = stats[key];
                  return (
                    <tr key={key} style={{ borderBottom: "1px solid var(--border)" }}
                      className="transition-colors"
                      onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "var(--bg-elevated)"}
                      onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "transparent"}
                    >
                      <td className="py-2" style={{ color: "var(--text-secondary)" }}>{label}</td>
                      <td className="py-2 text-right font-mono font-semibold" style={{ color: "var(--text-primary)" }}>
                        {emp != null ? emp.toFixed(4) : "—"}
                      </td>
                      <td className="py-2 text-right font-mono" style={{ color: "var(--accent)" }}>
                        {theo.toFixed(4)}
                      </td>
                      <td className="py-2 text-right">
                        {renderDiscrepancy(emp, theo)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Empirical Summary (always shown) ── */}
      <div className="panel-card">
        <div className="flex items-center gap-2 mb-3">
          <BarChart3 size={14} style={{ color: "var(--accent)" }} />
          <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-secondary)" }}>
            Empirical Distribution
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)" }}>
                <th className="text-left py-2" style={{ color: "var(--text-muted)", fontWeight: 500 }}>Statistic</th>
                <th className="text-right py-2" style={{ color: "var(--text-muted)", fontWeight: 500 }}>Value</th>
              </tr>
            </thead>
            <tbody>
              {EMPIRICAL_ONLY_CONFIG.map(({ key, label }) => {
                const v = stats[key];
                return (
                  <tr key={key} style={{ borderBottom: "1px solid var(--border)" }}
                    className="transition-colors"
                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "var(--bg-elevated)"}
                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "transparent"}
                  >
                    <td className="py-2" style={{ color: "var(--text-secondary)" }}>{label}</td>
                    <td className="py-2 text-right font-mono font-semibold" style={{ color: "var(--text-primary)" }}>
                      {v != null ? v.toFixed(4) : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Simulation Meta ── */}
      <div className="panel-card">
        <div className="text-xs space-y-2" style={{ color: "var(--text-muted)" }}>
          <div className="flex justify-between">
            <span>Paths simulated</span>
            <span className="font-mono font-semibold" style={{ color: "var(--text-primary)" }}>
              {Math.round(totalPaths).toLocaleString()} paths
            </span>
          </div>
          <div className="flex justify-between">
            <span>Value range</span>
            <span className="font-mono" style={{ color: "var(--text-primary)" }}>
              [{stats.min != null ? stats.min.toFixed(3) : "—"}, {stats.max != null ? stats.max.toFixed(3) : "—"}]
            </span>
          </div>
          {stats.p95 != null && stats.p5 != null && (
            <div className="flex justify-between">
              <span>IQR (5–95)</span>
              <span className="font-mono" style={{ color: "var(--text-primary)" }}>
                {(stats.p95 - stats.p5).toFixed(4)}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Custom SDE metadata */}
      {model === "custom" && (extra?.sde_meta as Record<string, string>) && (
        <div className="panel-card">
          <div className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: "var(--text-secondary)" }}>SymPy Parsed Formulae</div>
          {Object.entries(extra!.sde_meta as Record<string, string>).map(([k, v]) => (
            <div key={k} className="mb-2">
              <div className="text-xs mb-1" style={{ color: "var(--text-muted)" }}>{k.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}</div>
              <code className="block text-xs font-mono px-3 py-2 rounded-lg break-all" style={{ color: "var(--accent)", background: "var(--accent-light)", border: "1px solid #c7d2fe" }}>{v}</code>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
