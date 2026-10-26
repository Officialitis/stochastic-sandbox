import numpy as np
from typing import Tuple, Optional


def _make_increments(n_paths, n_steps, dt, seed):
    rng = np.random.RandomState(seed)
    Z = rng.standard_normal((n_paths, n_steps))
    return np.sqrt(dt) * Z


def simulate_bm(T, n_steps, n_paths, x0=0.0, mu=0.0, sigma=1.0, seed=None):
    dt = T / n_steps
    dW = _make_increments(n_paths, n_steps, dt, seed)
    time_grid = np.linspace(0, T, n_steps + 1)
    paths = np.zeros((n_paths, n_steps + 1))
    paths[:, 0] = x0
    increments = mu * dt + sigma * dW
    paths[:, 1:] = increments.cumsum(axis=1) + x0
    return time_grid, paths


def simulate_gbm(T, n_steps, n_paths, x0, mu, sigma, scheme='exact', seed=None):
    dt = T / n_steps
    dW = _make_increments(n_paths, n_steps, dt, seed)
    time_grid = np.linspace(0, T, n_steps + 1)
    paths = np.zeros((n_paths, n_steps + 1))
    paths[:, 0] = x0
    if scheme == 'exact':
        log_inc = (mu - 0.5 * sigma**2) * dt + sigma * dW
        paths[:, 1:] = x0 * np.exp(log_inc.cumsum(axis=1))
    else:
        for k in range(n_steps):
            S = paths[:, k]
            paths[:, k+1] = np.maximum(S + mu*S*dt + sigma*S*dW[:, k], 1e-12)
    return time_grid, paths


def simulate_ou(T, n_steps, n_paths, x0, theta, mu, sigma, seed=None):
    dt = T / n_steps
    time_grid = np.linspace(0, T, n_steps + 1)
    rng = np.random.RandomState(seed)
    paths = np.zeros((n_paths, n_steps + 1))
    paths[:, 0] = x0
    e = np.exp(-theta * dt)
    cond_std = sigma * np.sqrt((1 - e**2) / (2*theta)) if theta > 1e-12 else sigma * np.sqrt(dt)
    Z = rng.standard_normal((n_paths, n_steps))
    for k in range(n_steps):
        paths[:, k+1] = mu + e * (paths[:, k] - mu) + cond_std * Z[:, k]
    return time_grid, paths


def simulate_cir(T, n_steps, n_paths, x0, a, b, sigma, seed=None):
    dt = T / n_steps
    dW = _make_increments(n_paths, n_steps, dt, seed)
    time_grid = np.linspace(0, T, n_steps + 1)
    feller = 2*a*b > sigma**2
    paths = np.zeros((n_paths, n_steps + 1))
    paths[:, 0] = x0
    for k in range(n_steps):
        r = np.maximum(paths[:, k], 0.0)
        paths[:, k+1] = np.maximum(r + a*(b-r)*dt + sigma*np.sqrt(r)*dW[:, k], 0.0)
    return time_grid, paths, feller


def simulate_heston(T, n_steps, n_paths, s0, v0, mu, kappa, theta, xi, rho, seed=None):
    dt = T / n_steps
    time_grid = np.linspace(0, T, n_steps + 1)
    rng = np.random.RandomState(seed)
    Z1 = rng.standard_normal((n_paths, n_steps))
    Z2 = rng.standard_normal((n_paths, n_steps))
    Zs = Z1
    Zv = rho*Z1 + np.sqrt(1-rho**2)*Z2
    sqrt_dt = np.sqrt(dt)
    S = np.zeros((n_paths, n_steps + 1)); S[:, 0] = s0
    V = np.zeros((n_paths, n_steps + 1)); V[:, 0] = v0
    for k in range(n_steps):
        v_pos = np.maximum(V[:, k], 0.0)
        sv = np.sqrt(v_pos)
        S[:, k+1] = S[:, k] * np.exp((mu - 0.5*v_pos)*dt + sv*sqrt_dt*Zs[:, k])
        V[:, k+1] = np.maximum(V[:, k] + kappa*(theta-v_pos)*dt + xi*sv*sqrt_dt*Zv[:, k], 0.0)
    return time_grid, S, V


def black_scholes_call(S, K, T, r, sigma):
    from scipy.stats import norm
    if T <= 0 or sigma <= 0: return max(S-K, 0.0)
    d1 = (np.log(S/K) + (r+0.5*sigma**2)*T) / (sigma*np.sqrt(T))
    d2 = d1 - sigma*np.sqrt(T)
    return S*norm.cdf(d1) - K*np.exp(-r*T)*norm.cdf(d2)


def black_scholes_put(S, K, T, r, sigma):
    from scipy.stats import norm
    if T <= 0 or sigma <= 0: return max(K-S, 0.0)
    d1 = (np.log(S/K) + (r+0.5*sigma**2)*T) / (sigma*np.sqrt(T))
    d2 = d1 - sigma*np.sqrt(T)
    return K*np.exp(-r*T)*norm.cdf(-d2) - S*norm.cdf(-d1)


def build_crr_tree(S0, K, T, r, sigma, N, option_type='call', american=False):
    dt = T / N
    u = np.exp(sigma*np.sqrt(dt))
    d = 1.0/u
    disc = np.exp(-r*dt)
    p = (np.exp(r*dt)-d)/(u-d)
    stock = np.zeros((N+1, N+1))
    for i in range(N+1):
        for j in range(i+1):
            stock[j, i] = S0*(u**(i-j))*(d**j)
    opt = np.zeros((N+1, N+1))
    if option_type=='call': opt[:,N] = np.maximum(stock[:,N]-K, 0.0)
    else: opt[:,N] = np.maximum(K-stock[:,N], 0.0)
    delta_tree = np.zeros((N, N))
    bond_tree = np.zeros((N, N))
    for i in range(N-1,-1,-1):
        for j in range(i+1):
            cont = disc*(p*opt[j,i+1]+(1-p)*opt[j+1,i+1])
            if american:
                ex = max(stock[j,i]-K,0.0) if option_type=='call' else max(K-stock[j,i],0.0)
                opt[j,i] = max(cont, ex)
            else:
                opt[j,i] = cont
            Su, Sd = stock[j,i+1], stock[j+1,i+1]
            Xu, Xd = opt[j,i+1], opt[j+1,i+1]
            if abs(Su-Sd)>1e-12:
                delta_tree[j,i] = (Xu-Xd)/(Su-Sd)
                bond_tree[j,i] = (Xu-delta_tree[j,i]*Su)*disc
    return {"stock":stock.tolist(),"option":opt.tolist(),"delta":delta_tree.tolist(),
            "bond":bond_tree.tolist(),"u":u,"d":d,"p":p,"price":opt[0,0],"N":N,"dt":dt}


def compute_stats(paths, t_index=-1):
    terminal = paths[:, t_index]
    n = len(terminal)
    m = np.mean(terminal)
    s = float(np.std(terminal, ddof=1)) if n > 1 else float(np.std(terminal))
    skew = float(np.mean(((terminal-m)/s)**3)) if s>1e-12 else 0.0
    kurt = float(np.mean(((terminal-m)/s)**4)-3.0) if s>1e-12 else 0.0
    return {"mean":float(m),"std":float(s),"median":float(np.median(terminal)),
            "skewness":skew,"kurtosis":kurt,"min":float(np.min(terminal)),
            "max":float(np.max(terminal)),"p5":float(np.percentile(terminal,5)),
            "p95":float(np.percentile(terminal,95)),"n_paths":float(n)}

