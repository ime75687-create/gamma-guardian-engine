/** Black-Scholes pricing, greeks and implied-volatility solver. No external API. */

export type OptionType = "CALL" | "PUT";

const SQRT2PI = Math.sqrt(2 * Math.PI);

const pdf = (x: number) => Math.exp(-0.5 * x * x) / SQRT2PI;

/** Abramowitz-Stegun normal CDF (deterministic, ~1e-7 accuracy). */
export function normCdf(x: number): number {
  const sign = x < 0 ? -1 : 1;
  const z = Math.abs(x) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * z);
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t +
      0.254829592) *
      t *
      Math.exp(-z * z);
  return 0.5 * (1 + sign * y);
}

export interface Greeks {
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
}

export interface BsInput {
  /** spot */
  S: number;
  /** strike */
  K: number;
  /** time to expiry in years */
  T: number;
  /** volatility (annualized, decimal) */
  sigma: number;
  /** risk free rate (decimal) */
  r?: number;
  type: OptionType;
}

const round = (n: number, d = 4) => Math.round(n * 10 ** d) / 10 ** d;

export function bsPrice({ S, K, T, sigma, r = 0.04, type }: BsInput): number {
  if (T <= 0 || sigma <= 0) {
    return Math.max(0, type === "CALL" ? S - K : K - S);
  }
  const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T));
  const d2 = d1 - sigma * Math.sqrt(T);
  return type === "CALL"
    ? S * normCdf(d1) - K * Math.exp(-r * T) * normCdf(d2)
    : K * Math.exp(-r * T) * normCdf(-d2) - S * normCdf(-d1);
}

export function bsGreeks({ S, K, T, sigma, r = 0.04, type }: BsInput): Greeks {
  if (T <= 0 || sigma <= 0 || S <= 0 || K <= 0) {
    return { delta: 0, gamma: 0, theta: 0, vega: 0 };
  }
  const sqrtT = Math.sqrt(T);
  const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * sqrtT);
  const d2 = d1 - sigma * sqrtT;
  const nd1 = pdf(d1);

  const delta = type === "CALL" ? normCdf(d1) : normCdf(d1) - 1;
  const gamma = nd1 / (S * sigma * sqrtT);
  const vega = (S * nd1 * sqrtT) / 100; // per 1 vol point
  const thetaYear =
    type === "CALL"
      ? -(S * nd1 * sigma) / (2 * sqrtT) - r * K * Math.exp(-r * T) * normCdf(d2)
      : -(S * nd1 * sigma) / (2 * sqrtT) + r * K * Math.exp(-r * T) * normCdf(-d2);

  return {
    delta: round(delta),
    gamma: round(gamma, 6),
    theta: round(thetaYear / 365, 4), // per calendar day
    vega: round(vega),
  };
}

/** Implied volatility by bisection on the market price. Returns undefined if no solution. */
export function impliedVol(
  marketPrice: number,
  input: Omit<BsInput, "sigma">
): number | undefined {
  if (!(marketPrice > 0) || input.T <= 0) return undefined;
  let lo = 0.01;
  let hi = 5;
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2;
    const p = bsPrice({ ...input, sigma: mid });
    if (Math.abs(p - marketPrice) < 0.0005) return round(mid);
    if (p > marketPrice) hi = mid;
    else lo = mid;
  }
  const result = (lo + hi) / 2;
  return result > 4.9 || result < 0.011 ? undefined : round(result);
}
