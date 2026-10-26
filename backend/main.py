"""
main.py — FastAPI REST API for Stochastic Sandbox
"""
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from pydantic import BaseModel, Field
from typing import Optional, Literal
import numpy as np

import os
import sys

# Ensure backend directory is in sys.path regardless of execution CWD
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from solvers import (
    simulate_bm, simulate_gbm, simulate_ou, simulate_cir,
    simulate_heston, build_crr_tree, compute_stats,
    black_scholes_call, black_scholes_put,
)
from parser import simulate_custom_sde
from pdf_exporter import generate_pdf_report

app = FastAPI(title="Stochastic Sandbox API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Pydantic request models
# ---------------------------------------------------------------------------

class SimRequest(BaseModel):
    model: Literal["bm", "gbm", "ou", "cir", "heston", "custom"] = "gbm"
    T: float = Field(1.0, gt=0, le=100)
    n_steps: int = Field(252, ge=10, le=5000)
    n_paths: int = Field(50, ge=1, le=2000)
    x0: float = 100.0
    mu: float = 0.05
    sigma: float = 0.2
    theta: float = 2.0
    kappa: float = 2.0
    long_run_mean: float = 0.04
    v0: float = 0.04
    xi: float = 0.3
    rho: float = -0.7
    a: float = 1.5
    b: float = 0.05
    scheme: Literal["exact", "euler", "milstein"] = "exact"
    seed: Optional[int] = None
    drift_expr: str = "0.5*(1-x)"
    vol_expr: str = "0.2*sqrt(abs(x))"


class TreeRequest(BaseModel):
    S0: float = 100.0
    K: float = 100.0
    T: float = 1.0
    r: float = 0.05
    sigma: float = 0.2
    N: int = Field(4, ge=1, le=10)
    option_type: Literal["call", "put"] = "call"
    american: bool = False


class PdfRequest(BaseModel):
    model: str
    params: dict
    stats: dict
    theoretical: dict = {}
    sde_meta: dict = {}
    charts: dict = {}  # key -> base64-encoded PNG string


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@app.get("/api/health")
def health():
    return {"status": "ok", "version": "1.0.0"}


@app.post("/api/simulate")
def simulate(req: SimRequest):
    try:
        paths_list = []
        time_grid = []
        extra = {}
        feller_ok = None

        if req.model == "bm":
            tg, paths = simulate_bm(req.T, req.n_steps, req.n_paths, req.x0, req.mu, req.sigma, req.seed)
            time_grid = tg.tolist()
            paths_list = paths.tolist()
            theo_mean = req.x0 + req.mu * req.T
            theo_std = float(req.sigma * np.sqrt(req.T))
            theoretical = {
                "mean": float(theo_mean),
                "std": float(theo_std),
                "skewness": 0.0,
                "kurtosis": 0.0,
            }

        elif req.model == "gbm":
            tg, paths = simulate_gbm(req.T, req.n_steps, req.n_paths, req.x0,
                                      req.mu, req.sigma, req.scheme, req.seed)
            time_grid = tg.tolist()
            paths_list = paths.tolist()
            s2T = req.sigma**2 * req.T
            theo_mean = req.x0 * np.exp(req.mu * req.T)
            theo_std  = req.x0 * np.exp(req.mu*req.T) * np.sqrt(np.exp(s2T)-1)
            theo_skew = float((np.exp(s2T)+2)*np.sqrt(np.exp(s2T)-1)) if s2T < 8 else None
            theo_kurt = float(np.exp(4*s2T)+2*np.exp(3*s2T)+3*np.exp(2*s2T)-6) if s2T < 4 else None
            theoretical = {"mean": float(theo_mean), "std": float(theo_std),
                           "skewness": theo_skew,
                           "kurtosis": theo_kurt}

        elif req.model == "ou":
            tg, paths = simulate_ou(req.T, req.n_steps, req.n_paths, req.x0,
                                     req.theta, req.long_run_mean, req.sigma, req.seed)
            time_grid = tg.tolist()
            paths_list = paths.tolist()
            e = np.exp(-req.theta * req.T)
            theo_mean = req.long_run_mean + e * (req.x0 - req.long_run_mean)
            theo_std  = req.sigma * np.sqrt((1 - e**2) / (2*req.theta)) if req.theta > 1e-12 else req.sigma * np.sqrt(req.T)
            theoretical = {"mean": float(theo_mean), "std": float(theo_std),
                           "skewness": 0.0, "kurtosis": 0.0}

        elif req.model == "cir":
            tg, paths, feller_ok = simulate_cir(req.T, req.n_steps, req.n_paths,
                                                 req.x0, req.a, req.b, req.sigma, req.seed)
            time_grid = tg.tolist()
            paths_list = paths.tolist()
            e = np.exp(-req.a * req.T)
            theo_mean = req.b + e * (req.x0 - req.b)
            if req.a > 1e-12:
                theo_var = req.x0 * (req.sigma**2 / req.a) * (e - e**2) + req.b * (req.sigma**2 / (2 * req.a)) * ((1.0 - e)**2)
            else:
                theo_var = req.sigma**2 * req.x0 * req.T
            theo_std = float(np.sqrt(max(0.0, theo_var)))
            theoretical = {"mean": float(theo_mean), "std": theo_std, "skewness": None, "kurtosis": None}
            extra["feller_condition"] = bool(feller_ok)
            extra["feller_value"] = float(2 * req.a * req.b)
            extra["sigma_sq"] = float(req.sigma**2)

        elif req.model == "heston":
            tg, S, V = simulate_heston(req.T, req.n_steps, req.n_paths,
                                        req.x0, req.v0, req.mu, req.kappa,
                                        req.theta, req.xi, req.rho, req.seed)
            time_grid = tg.tolist()
            paths_list = S.tolist()
            extra["variance_paths"] = V.tolist()
            theoretical = {"mean": float(req.x0 * np.exp(req.mu * req.T))}

        elif req.model == "custom":
            tg, paths, sde_meta = simulate_custom_sde(
                req.drift_expr, req.vol_expr,
                req.T, req.n_steps, req.n_paths, req.x0,
                req.scheme, req.seed,
            )
            time_grid = tg.tolist()
            paths_list = paths.tolist()
            extra["sde_meta"] = sde_meta
            theoretical = {}

        stats = compute_stats(np.array(paths_list))
        return {
            "time_grid": time_grid,
            "paths": paths_list,
            "stats": stats,
            "theoretical": theoretical,
            "extra": extra,
        }

    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Simulation error: {str(e)}")


@app.post("/api/tree")
def tree(req: TreeRequest):
    try:
        result = build_crr_tree(req.S0, req.K, req.T, req.r, req.sigma,
                                 req.N, req.option_type, req.american)
        bs_fn = black_scholes_call if req.option_type == "call" else black_scholes_put
        bs_price = bs_fn(req.S0, req.K, req.T, req.r, req.sigma)
        result["bs_price"] = bs_price
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/export-pdf")
def export_pdf(req: PdfRequest):
    try:
        pdf_bytes = generate_pdf_report(req.dict())
        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={"Content-Disposition": "attachment; filename=stochastic_sandbox_report.pdf"},
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
