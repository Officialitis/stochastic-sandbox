"use client";
import React, { useMemo } from "react";
import dynamic from "next/dynamic";

const Plot = dynamic(() => import("react-plotly.js"), { ssr: false });

interface PathChartProps {
  timeGrid: number[];
  paths: number[][];
  model: string;
  maxVisible?: number;
}

const MODEL_LABELS: Record<string, string> = {
  bm: "Brownian Motion (Arithmetic)",
  gbm: "Geometric Brownian Motion",
  ou: "Ornstein–Uhlenbeck",
  cir: "Cox–Ingersoll–Ross",
  heston: "Heston Asset Price",
  custom: "Custom SDE",
};

export function PathChart({ timeGrid, paths, model, maxVisible = 80 }: PathChartProps) {
  const traces = useMemo(() => {
    const visible = paths.slice(0, maxVisible);

    // Percentile bands
    const p5: number[] = [], p25: number[] = [], p75: number[] = [], p95: number[] = [], med: number[] = [];
    for (let t = 0; t < timeGrid.length; t++) {
      const col = visible.map(p => p[t]).sort((a, b) => a - b);
      const pct = (q: number) => {
        const i = (q / 100) * (col.length - 1);
        const lo = Math.floor(i), hi = Math.ceil(i);
        return col[lo] + (col[hi] - col[lo]) * (i - lo);
      };
      p5.push(pct(5)); p25.push(pct(25)); med.push(pct(50)); p75.push(pct(75)); p95.push(pct(95));
    }

    const pathTraces = visible.slice(0, 40).map((path, i) => ({
      x: timeGrid, y: path,
      type: "scatter" as const, mode: "lines" as const,
      line: { width: 0.8, color: `hsla(${220 + i * 4}, 70%, 45%, 0.25)` },
      showlegend: false, hoverinfo: "none" as const,
    }));

    const band90: Plotly.Data = {
      x: [...timeGrid, ...timeGrid.slice().reverse()],
      y: [...p95, ...p5.slice().reverse()],
      fill: "toself", fillcolor: "rgba(79,70,229,0.06)",
      line: { color: "transparent" }, type: "scatter", mode: "none",
      name: "5–95th pct", showlegend: true,
    };
    const band50: Plotly.Data = {
      x: [...timeGrid, ...timeGrid.slice().reverse()],
      y: [...p75, ...p25.slice().reverse()],
      fill: "toself", fillcolor: "rgba(79,70,229,0.12)",
      line: { color: "transparent" }, type: "scatter", mode: "none",
      name: "25–75th pct", showlegend: true,
    };
    const medianTrace: Plotly.Data = {
      x: timeGrid, y: med, type: "scatter", mode: "lines",
      line: { color: "#4f46e5", width: 2, dash: "dot" },
      name: "Median", showlegend: true,
    };

    return [...pathTraces, band90, band50, medianTrace];
  }, [paths, timeGrid, maxVisible]);

  const layout: Partial<Plotly.Layout> = {
    title: {
      text: MODEL_LABELS[model] || model,
      font: { color: "#0f172a", size: 13, family: "Inter, sans-serif" },
    },
    paper_bgcolor: "white",
    plot_bgcolor: "#f8fafc",
    xaxis: {
      title: { text: "Time (t)", font: { color: "#64748b", size: 11 } },
      gridcolor: "#e2e8f0", zerolinecolor: "#cbd5e1",
      tickfont: { color: "#64748b", size: 10 },
      showgrid: true,
    },
    yaxis: {
      title: { text: "Value", font: { color: "#64748b", size: 11 } },
      gridcolor: "#e2e8f0", zerolinecolor: "#cbd5e1",
      tickfont: { color: "#64748b", size: 10 },
      showgrid: true,
    },
    legend: {
      font: { color: "#334155", size: 10 },
      bgcolor: "rgba(255,255,255,0.9)",
      bordercolor: "#e2e8f0", borderwidth: 1,
      x: 0.01, y: 0.99,
    },
    margin: { t: 50, b: 50, l: 60, r: 20 },
    hovermode: "x unified",
  };

  return (
    <div className="w-full h-full">
      <Plot
        data={traces}
        layout={layout}
        config={{ displayModeBar: true, displaylogo: false, modeBarButtonsToRemove: ["select2d", "lasso2d"] }}
        style={{ width: "100%", height: "100%" }}
        useResizeHandler
      />
    </div>
  );
}
