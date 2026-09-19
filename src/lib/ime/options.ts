// Deterministic option-contract suggestion derived from the engine decision.
// No randomness: same price + horizon + decision always yields the same contract.

import { horizonOf, type HorizonConfig } from "./horizon";
import type { ImeResult } from "./types";

const round2 = (n: number) => Math.round(n * 100) / 100;

export interface OptionIdea {
  type: "CALL" | "PUT";
  strike: number;
  expiry: string; // YYYY-MM-DD
  daysToExpiry: number;
  /** estimated contract premium per share (USD) */
  premium: number;
  premiumStop: number;
  premiumTarget: number;
  underlyingEntry: number;
  underlyingStop: number;
  underlyingTarget: number;
}

/** Strike increment used by most US listed options. */
function strikeStep(price: number): number {
  if (price < 25) return 0.5;
  if (price < 100) return 1;
  if (price < 250) return 2.5;
  return 5;
}

function roundStrike(price: number): number {
  const step = strikeStep(price);
  return Math.round(price / step) * step;
}

/**
 * Short-dated expiry: the first Friday on/after today+days, but never further
 * out than maxDays (falls back to the nearest weekday inside the window).
 */
function expiryFor(days: number, maxDays: number, now = new Date()): { date: string; days: number } {
  const start = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const d = new Date(start);
  d.setUTCDate(d.getUTCDate() + days);
  const shift = (5 - d.getUTCDay() + 7) % 7;
  d.setUTCDate(d.getUTCDate() + shift);
  let out = Math.round((d.getTime() - start) / 86_400_000);
  if (out > maxDays) {
    // step back a week at a time while still inside the window
    while (out - 7 >= 0 && out > maxDays) out -= 7;
    if (out > maxDays) out = maxDays;
    d.setTime(start + out * 86_400_000);
    // avoid weekends
    while (d.getUTCDay() === 0 || d.getUTCDay() === 6) {
      d.setUTCDate(d.getUTCDate() - 1);
      out -= 1;
    }
  }
  return { date: d.toISOString().slice(0, 10), days: Math.max(0, out) };
}

export function buildOptionIdea(result: ImeResult, price: number, horizonKey: string): OptionIdea | null {
  const action = result.decision.action;
  if (action !== "AGGRESSIVE_ENTRY" && action !== "CONSERVATIVE_ENTRY") return null;
  const h: HorizonConfig = horizonOf(horizonKey);
  const bearish = result.analysis.marketMaker.trend === "BEARISH";
  const isCall = !bearish;

  const { date, days } = expiryFor(h.days, h.maxDays);
  const volState = result.analysis.movement.volatility_state;
  const step = strikeStep(price);

  // Cheap-contract search: start at the horizon strike and walk further OTM
  // until the estimated premium fits the budget (bounded, deterministic).
  let strike = roundStrike(isCall ? price * (1 + h.strikeOtmPct) : price * (1 - h.strikeOtmPct));
  let premium = estimatePremium(price, strike, days, volState, isCall);
  for (let i = 0; i < 12 && premium > h.maxPremium; i++) {
    const next = isCall ? strike + step : strike - step;
    if (next <= 0 || Math.abs(next - price) / price > 0.12) break;
    strike = next;
    premium = estimatePremium(price, strike, days, volState, isCall);
  }

  const aggressive = action === "AGGRESSIVE_ENTRY";
  const stopPct = h.stopPct * (aggressive ? 1.2 : 1);
  const targetPct = h.targetPct * (aggressive ? 1.2 : 1);
  const underlyingStop = round2(isCall ? price * (1 - stopPct) : price * (1 + stopPct));
  const underlyingTarget = round2(isCall ? price * (1 + targetPct) : price * (1 - targetPct));

  const targetPremium = estimatePremium(underlyingTarget, strike, Math.max(1, days - 1), volState, isCall);

  return {
    type: isCall ? "CALL" : "PUT",
    strike: round2(strike),
    expiry: date,
    daysToExpiry: days,
    premium,
    premiumStop: round2(Math.max(0.05, premium * 0.6)),
    premiumTarget: round2(Math.max(premium * 1.15, targetPremium)),
    underlyingEntry: round2(price),
    underlyingStop,
    underlyingTarget,
  };
}

export function formatOptionIdea(idea: OptionIdea, symbol: string): string {
  const kind = idea.type === "CALL" ? "شراء عقد كول (صاعد)" : "شراء عقد بوت (هابط)";
  return [
    "",
    "📄 <b>عقد الأوبشن المقترح</b>",
    `${kind}`,
    `العقد: <code>${symbol} ${idea.expiry} ${idea.strike} ${idea.type}</code>`,
    `تنتهي خلال: ${idea.daysToExpiry} يوم`,
    `سعر العقد التقريبي: <code>${idea.premium}</code> للسهم (≈ <code>${Math.round(idea.premium * 100)}$</code> للعقد)`,
    `هدف العقد: <code>${idea.premiumTarget}</code> | وقف العقد: <code>${idea.premiumStop}</code>`,
    `السهم — دخول <code>${idea.underlyingEntry}</code> | وقف <code>${idea.underlyingStop}</code> | هدف <code>${idea.underlyingTarget}</code>`,
    "<i>الأسعار تقديرية محسوبة من التذبذب والمدة، تأكد من سعر السوق قبل التنفيذ.</i>",
  ].join("\n");
}
