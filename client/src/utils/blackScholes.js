/**
 * Black-Scholes Option Pricing Model
 * 
 * Calculates theoretical option prices and Greeks.
 * Used as a comparison against live Deribit market prices.
 */

/* ── Cumulative Normal Distribution (Abramowitz & Stegun approx) ── */
function cdf(x) {
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x) / Math.sqrt(2);

  const t = 1.0 / (1.0 + p * x);
  const y = 1.0 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);

  return 0.5 * (1.0 + sign * y);
}

/* ── Standard Normal PDF ──────────────────────────────────── */
function pdf(x) {
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}

/**
 * Calculate Black-Scholes option price and Greeks.
 * 
 * @param {Object} params
 * @param {number} params.S   - Current underlying price (USD)
 * @param {number} params.K   - Strike price (USD)
 * @param {number} params.T   - Time to expiry (years)
 * @param {number} params.r   - Risk-free rate (decimal, e.g. 0.05 for 5%)
 * @param {number} params.sigma - Volatility (decimal, e.g. 0.8 for 80%)
 * @param {'call'|'put'} params.type - Option type
 * @returns {Object} { price, delta, gamma, theta, vega, rho }
 */
export function blackScholes({ S, K, T, r = 0.05, sigma, type = 'call' }) {
  // Edge cases
  if (T <= 0) {
    const intrinsic = type === 'call'
      ? Math.max(S - K, 0)
      : Math.max(K - S, 0);
    return {
      price: intrinsic,
      delta: type === 'call' ? (S > K ? 1 : 0) : (S < K ? -1 : 0),
      gamma: 0,
      theta: 0,
      vega: 0,
      rho: 0,
    };
  }

  if (sigma <= 0) {
    const df = Math.exp(-r * T);
    const intrinsic = type === 'call'
      ? Math.max(S - K * df, 0)
      : Math.max(K * df - S, 0);
    return { price: intrinsic, delta: 0, gamma: 0, theta: 0, vega: 0, rho: 0 };
  }

  const sqrtT = Math.sqrt(T);
  const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * sqrtT);
  const d2 = d1 - sigma * sqrtT;

  const Nd1 = cdf(d1);
  const Nd2 = cdf(d2);
  const Nmd1 = cdf(-d1);
  const Nmd2 = cdf(-d2);
  const nd1 = pdf(d1);
  const df = Math.exp(-r * T);

  let price, delta, rho;

  if (type === 'call') {
    price = S * Nd1 - K * df * Nd2;
    delta = Nd1;
    rho = K * T * df * Nd2 / 100;
  } else {
    price = K * df * Nmd2 - S * Nmd1;
    delta = Nd1 - 1;
    rho = -K * T * df * Nmd2 / 100;
  }

  const gamma = nd1 / (S * sigma * sqrtT);
  const theta = (-(S * nd1 * sigma) / (2 * sqrtT) - r * K * df * (type === 'call' ? Nd2 : Nmd2)) / 365;
  const vega = S * nd1 * sqrtT / 100;

  return {
    price: Math.max(price, 0),
    delta: Number(delta.toFixed(6)),
    gamma: Number(gamma.toFixed(6)),
    theta: Number(theta.toFixed(6)),
    vega: Number(vega.toFixed(6)),
    rho: Number(rho.toFixed(6)),
  };
}

/**
 * Calculate implied volatility using Newton-Raphson method.
 * 
 * @param {Object} params - Same as blackScholes but without sigma, plus marketPrice
 * @param {number} params.marketPrice - Observed market price
 * @returns {number} Implied volatility (decimal)
 */
export function impliedVolatility({ S, K, T, r = 0.05, type = 'call', marketPrice }) {
  if (T <= 0 || marketPrice <= 0) return 0;

  let sigma = 0.5; // Initial guess
  const MAX_ITER = 100;
  const TOLERANCE = 1e-6;

  for (let i = 0; i < MAX_ITER; i++) {
    const result = blackScholes({ S, K, T, r, sigma, type });
    const diff = result.price - marketPrice;

    if (Math.abs(diff) < TOLERANCE) return sigma;

    const vega100 = result.vega * 100; // Undo the /100 in vega calc
    if (Math.abs(vega100) < 1e-10) break;

    sigma -= diff / vega100;
    if (sigma <= 0) sigma = 0.001;
    if (sigma > 10) sigma = 10;
  }

  return sigma;
}

/**
 * Convert Deribit BTC-denominated price to USD.
 */
export function btcToUsd(btcPrice, btcUsdPrice) {
  return btcPrice * btcUsdPrice;
}
