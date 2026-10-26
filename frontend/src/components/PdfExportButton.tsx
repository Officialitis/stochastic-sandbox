"use client";
import React, { useState } from "react";
import { Download, FileText } from "lucide-react";
import { exportPdf } from "@/lib/api";

interface PdfExportButtonProps {
  model: string;
  params: Record<string, unknown>;
  stats: Record<string, number>;
  theoretical: Record<string, number | null>;
  sde_meta?: Record<string, string>;
  disabled?: boolean;
}

/** Convert an SVG element to a base64 PNG string via HTML5 canvas */
async function svgElementToPng(svgEl: SVGElement, width = 900, height = 420): Promise<string> {
  return new Promise((resolve) => {
    try {
      const xml = new XMLSerializer().serializeToString(svgEl);
      const svgBase64 = window.btoa(unescape(encodeURIComponent(xml)));
      const img = new Image();
      img.onload = () => {
        try {
          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");
          if (!ctx) return resolve("");
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, 0, width, height);
          ctx.drawImage(img, 0, 0, width, height);
          const dataUrl = canvas.toDataURL("image/png");
          resolve(dataUrl.split(",")[1] || "");
        } catch {
          resolve("");
        }
      };
      img.onerror = () => resolve("");
      img.src = `data:image/svg+xml;base64,${svgBase64}`;
    } catch {
      resolve("");
    }
  });
}

/** Capture Plotly charts as base64 PNG images using Plotly.toImage or SVG canvas rasterization */
async function captureCharts(): Promise<Record<string, string>> {
  const charts: Record<string, string> = {};
  if (typeof window === "undefined") return charts;

  const chartMap: { key: string; selector: string }[] = [
    { key: "paths", selector: "[data-chart='paths']" },
    { key: "hist",  selector: "[data-chart='hist']" },
  ];

  const winPlotly = (window as unknown as { Plotly?: { toImage: (el: Element, opts: { format: string; width: number; height: number }) => Promise<string> } }).Plotly;

  for (const { key, selector } of chartMap) {
    const container = document.querySelector(selector) as HTMLElement | null;
    if (!container) continue;

    // If container is hidden, temporarily make it visible offscreen
    const wasHidden = container.classList.contains("hidden");
    if (wasHidden) {
      container.classList.remove("hidden");
      container.style.position = "fixed";
      container.style.left = "-9999px";
      container.style.display = "block";
      container.style.width = "900px";
      container.style.height = "420px";
    }

    try {
      const plotEl = container.querySelector(".js-plotly-plot");
      if (winPlotly && plotEl) {
        try {
          const dataUrl = await winPlotly.toImage(plotEl, { format: "png", width: 900, height: 420 });
          if (dataUrl) {
            charts[key] = dataUrl.split(",")[1] ?? dataUrl;
          }
        } catch {
          // fallback to SVG rasterizer
        }
      }

      // Fallback: rasterize main-svg if Plotly.toImage wasn't available
      if (!charts[key]) {
        const svgEl = container.querySelector("svg.main-svg") as SVGElement | null;
        if (svgEl) {
          const b64 = await svgElementToPng(svgEl, 900, 420);
          if (b64) charts[key] = b64;
        }
      }
    } catch {
      // Ignore capture errors
    } finally {
      if (wasHidden) {
        container.style.position = "";
        container.style.left = "";
        container.style.display = "";
        container.style.width = "";
        container.style.height = "";
        container.classList.add("hidden");
      }
    }
  }

  return charts;
}

export function PdfExportButton({ model, params, stats, theoretical, sde_meta, disabled }: PdfExportButtonProps) {
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handle = async () => {
    setLoading(true);
    try {
      const charts = await captureCharts();
      await exportPdf({ model, params, stats, theoretical, sde_meta, charts });
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch {
      alert("PDF export failed. Is the backend running?");
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handle}
      disabled={loading || disabled}
      className="flex items-center gap-2 px-4 py-1.5 rounded-lg text-xs font-bold transition-all duration-200"
      style={success ? {
        background: "#ecfdf5",
        border: "1px solid #a7f3d0",
        color: "#059669",
      } : {
        background: "var(--bg-elevated)",
        border: "1px solid var(--border)",
        color: "var(--text-secondary)",
        opacity: (loading || disabled) ? 0.5 : 1,
        cursor: (loading || disabled) ? "not-allowed" : "pointer",
      }}
    >
      {loading ? (
        <span className="w-3.5 h-3.5 border-2 rounded-full animate-spin" style={{ borderColor: "var(--border)", borderTopColor: "var(--accent)" }} />
      ) : success ? (
        <FileText size={13} />
      ) : (
        <Download size={13} />
      )}
      {loading ? "Exporting…" : success ? "Downloaded!" : "Export PDF"}
    </button>
  );
}
