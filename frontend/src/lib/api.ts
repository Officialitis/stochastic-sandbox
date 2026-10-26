const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export type ModelType = "bm" | "gbm" | "ou" | "cir" | "heston" | "custom" | "tree";

export interface SimRequest {
  model: "bm" | "gbm" | "ou" | "cir" | "heston" | "custom";
  T: number;
  n_steps: number;
  n_paths: number;
  x0: number;
  mu: number;
  sigma: number;
  theta: number;
  kappa: number;
  long_run_mean: number;
  v0: number;
  xi: number;
  rho: number;
  a: number;
  b: number;
  scheme: "exact" | "euler" | "milstein";
  seed: number | null;
  drift_expr: string;
  vol_expr: string;
}

export interface SimResponse {
  time_grid: number[];
  paths: number[][];
  stats: Record<string, number>;
  theoretical: Record<string, number | null>;
  extra: Record<string, unknown>;
}

export interface TreeRequest {
  S0: number;
  K: number;
  T: number;
  r: number;
  sigma: number;
  N: number;
  option_type: "call" | "put";
  american: boolean;
}

export interface TreeResponse {
  stock: number[][];
  option: number[][];
  delta: number[][];
  bond: number[][];
  u: number;
  d: number;
  p: number;
  price: number;
  bs_price: number;
  N: number;
  dt: number;
}

export async function runSimulation(req: SimRequest): Promise<SimResponse> {
  const res = await fetch(`${API_BASE}/api/simulate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.detail || "Simulation failed");
  }
  return res.json();
}

export async function runTree(req: TreeRequest): Promise<TreeResponse> {
  const res = await fetch(`${API_BASE}/api/tree`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.detail || "Tree failed");
  }
  return res.json();
}

export async function exportPdf(payload: {
  model: string;
  params: Record<string, unknown>;
  stats: Record<string, number>;
  theoretical: Record<string, number | null>;
  sde_meta?: Record<string, string>;
  charts?: Record<string, string>;
}): Promise<void> {
  const res = await fetch(`${API_BASE}/api/export-pdf`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error("PDF export failed");
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "stochastic_sandbox_report.pdf";
  a.click();
  URL.revokeObjectURL(url);
}
