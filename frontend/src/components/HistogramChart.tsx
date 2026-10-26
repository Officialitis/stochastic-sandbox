"use client";
import React, { useMemo } from "react";
import dynamic from "next/dynamic";

const Plot = dynamic(() => import("react-plotly.js"), { ssr: false });

interface HistogramChartProps {
  paths: number[][];
  model: string;
  theoretical?: { mean?: number | null; std?: number | null };
}

export function HistogramChart({ paths, model, theoretical }: HistogramChartProps) {
  const terminal = useMemo(() => paths.map(p => p[p.length - 1]), [paths]);

  const traces = useMemo(() => {
    const hist = {
      x: terminal,
      type: "histogram" as const,
      nbinsx: Math.min(60, Math.max(20, Math.floor(terminal.length / 5))),
      name: "Terminal Distribution",
      marker: {
        color: "rgba(79,70,229,0.65)",
        line: { color: "rgba(79,70,229,0.9)", width: 0.5 },
      },
      histnorm: "probability density",
      opacity: 0.85,
    } as unknown as Plotly.Data;

    const result: Plotly.Data[] = [hist];

    // Theoretical density overlay
    if (theoretical?.mean != null && theoretical?.std != null && theoretical.std > 0) {
      const mean = theoretical.mean;
      const std = theoretical.std;
      const xMin = Math.min(...terminal);
      const xMax = Math.max(...terminal);
      const xs = Array.from({ length: 200 }, (_, i) => xMin + (i / 199) * (xMax - xMin));

      let ys: number[] = [];
      if (model === "gbm") {
        ys = xs.map(x => {
          if (x <= 0) return 0;
          const logMu = Math.log(mean) - 0.5 * Math.log(1 + (std / mean) ** 2);
          const logSig = Math.sqrt(Math.log(1 + (std / mean) ** 2));
          return (1 / (x * logSig * Math.sqrt(2 * Math.PI))) *
            Math.exp(-0.5 * ((Math.log(x) - logMu) / logSig) ** 2);
        });
      } else {
        ys = xs.map(x =>
          (1 / (std * Math.sqrt(2 * Math.PI))) *
          Math.exp(-0.5 * ((x - mean) / std) ** 2)
        );
      }

      result.push({
        x: xs, y: ys, type: "scatter", mode: "lines",
        name: "Theoretical PDF",
        line: { color: "#d97706", width: 2.5, dash: "dot" },
      } as Plotly.Data);
    }

    // Mean line legend entry
    const mean = terminal.reduce((a, b) => a + b, 0) / (terminal.length || 1);
    result.push({
      x: [mean], y: [null],
      type: "scatter", mode: "lines",
      name: `Mean: ${mean.toFixed(3)}`,
      line: { color: "#059669", width: 2, dash: "dash" },
      showlegend: true,
    } as Plotly.Data);

    return result;
  }, [terminal, model, theoretical]);

  const mean = useMemo(() => terminal.reduce((a, b) => a + b, 0) / (terminal.length || 1), [terminal]);

  const layout: Partial<Plotly.Layout> = {
    title: { text: "Terminal Value Distribution", font: { color: "#0f172a", size: 13, family: "Inter, sans-serif" } },
    paper_bgcolor: "white",
    plot_bgcolor: "#f8fafc",
    xaxis: {
      title: { text: "Terminal Value X(T)", font: { color: "#64748b", size: 11 } },
      gridcolor: "#e2e8f0", zerolinecolor: "#cbd5e1",
      tickfont: { color: "#64748b", size: 10 },
      autorange: true,
    },
    yaxis: {
      title: { text: "Probability Density", font: { color: "#64748b", size: 11 } },
      gridcolor: "#e2e8f0", zerolinecolor: "#cbd5e1",
      tickfont: { color: "#64748b", size: 10 },
      autorange: true,
    },
    shapes: [
      {
        type: "line",
        x0: mean, x1: mean,
        y0: 0, y1: 1,
        yref: "paper",
        line: { color: "#059669", width: 2, dash: "dash" },
      },
    ],
    annotations: [
      {
        x: mean, y: 1, yref: "paper",
        text: `μ̂ = ${mean.toFixed(3)}`,
        showarrow: false,
        font: { color: "#059669", size: 10, family: "monospace" },
        bgcolor: "rgba(255,255,255,0.9)",
        bordercolor: "#059669", borderwidth: 1, borderpad: 3,
        yanchor: "bottom",
      },
    ],
    bargap: 0.05,
    legend: {
      font: { color: "#334155", size: 10 },
      bgcolor: "rgba(255,255,255,0.9)",
      bordercolor: "#e2e8f0", borderwidth: 1,
    },
    margin: { t: 50, b: 50, l: 60, r: 20 },
  };

  return (
    <div className="w-full h-full">
      <Plot data={traces} layout={layout}
        config={{ displayModeBar: true, displaylogo: false }}
        style={{ width: "100%", height: "100%" }} useResizeHandler />
    </div>
  );
}
