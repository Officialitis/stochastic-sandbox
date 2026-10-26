import sympy as sp
import numpy as np
from typing import Optional


def parse_custom_sde(drift_expr: str, vol_expr: str):
    t_sym, x_sym = sp.symbols('t x', real=True)
    allowed = {
        'sqrt': sp.sqrt, 'exp': sp.exp, 'log': sp.log,
        'sin': sp.sin, 'cos': sp.cos, 'abs': sp.Abs,
        'pi': sp.pi, 'E': sp.E,
    }
    try:
        drift_sym = sp.sympify(drift_expr, locals=allowed)
        vol_sym   = sp.sympify(vol_expr,   locals=allowed)
    except Exception as e:
        raise ValueError(f"SymPy parse error: {e}")

    vol_deriv_sym = sp.diff(vol_sym, x_sym)

    drift_fn  = sp.lambdify((t_sym, x_sym), drift_sym,  modules='numpy')
    vol_fn    = sp.lambdify((t_sym, x_sym), vol_sym,    modules='numpy')
    vol_d_fn  = sp.lambdify((t_sym, x_sym), vol_deriv_sym, modules='numpy')

    return drift_fn, vol_fn, vol_d_fn, str(drift_sym), str(vol_sym), str(vol_deriv_sym)


def _safe_eval(fn, t, x):
    try:
        result = fn(t, x)
        if np.isscalar(result):
            result = np.full_like(x, float(result), dtype=float)
        return np.where(np.isfinite(result), result, 0.0)
    except Exception:
        return np.zeros_like(x, dtype=float)


def simulate_custom_sde(
    drift_expr: str,
    vol_expr: str,
    T: float,
    n_steps: int,
    n_paths: int,
    x0: float,
    scheme: str = 'euler',
    seed: Optional[int] = None,
):
    drift_fn, vol_fn, vol_d_fn, drift_str, vol_str, vol_d_str = parse_custom_sde(drift_expr, vol_expr)

    dt = T / n_steps
    sqrt_dt = np.sqrt(dt)
    rng = np.random.RandomState(seed)
    Z = rng.standard_normal((n_paths, n_steps))
    time_grid = np.linspace(0, T, n_steps + 1)

    paths = np.zeros((n_paths, n_steps + 1))
    paths[:, 0] = x0

    for k in range(n_steps):
        tk = time_grid[k]
        Xk = paths[:, k]
        mu_k  = _safe_eval(drift_fn,  tk, Xk)
        sig_k = _safe_eval(vol_fn,    tk, Xk)
        Zk = Z[:, k]

        if scheme == 'milstein':
            sig_d_k = _safe_eval(vol_d_fn, tk, Xk)
            paths[:, k+1] = (Xk
                + mu_k * dt
                + sig_k * sqrt_dt * Zk
                + 0.5 * sig_k * sig_d_k * dt * (Zk**2 - 1))
        else:
            paths[:, k+1] = Xk + mu_k * dt + sig_k * sqrt_dt * Zk

    return time_grid, paths, {
        "drift_parsed": drift_str,
        "vol_parsed": vol_str,
        "vol_derivative": vol_d_str,
    }
