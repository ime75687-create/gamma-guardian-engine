import type { ImeResult, StockData } from "./types";

const round2 = (n: number) => Math.round(n * 100) / 100;

export function analyzeStock(stockData: StockData): ImeResult {
  const warnings: string[] = [];

  // 1) Core Data Engine
  const symbol = stockData.symbol?.toUpperCase?.() ?? "UNKNOWN";
  const price = typeof stockData.price === "number" ? stockData.price : undefined;
  if (price === undefined) warnings.push("missing price");
  if (!stockData.gamma?.regime) warnings.push("missing gamma regime");
  if (!stockData.delta?.direction) warnings.push("missing delta direction");
  if (!stockData.momentum) warnings.push("missing momentum data");
  if (!stockData.liquidity) warnings.push("missing liquidity data");
  if (!stockData.volatility?.regime) warnings.push("missing volatility regime");

  // 2) Market Maker Engine
  const market_regime =
    stockData.gamma?.regime === "NEGATIVE" ? "NEGATIVE_GAMMA" : "POSITIVE_GAMMA";
  const trend =
    stockData.delta?.direction === "LONG"
      ? "BULLISH"
      : stockData.delta?.direction === "SHORT"
        ? "BEARISH"
        : "NEUTRAL";
  let flip_state: "FAR" | "NEAR" | "AT" = "FAR";
  if (price !== undefined && typeof stockData.gamma?.flipLevel === "number") {
    const dist = Math.abs(price - stockData.gamma.flipLevel) / price;
    flip_state = dist <= 0.0025 ? "AT" : dist <= 0.01 ? "NEAR" : "FAR";
  } else {
    warnings.push("missing flip level");
  }

  // 3) Movement Engine
  const vol = stockData.volatility?.regime;
  const volatility_state = vol === "HIGH" || vol === "LOW" ? vol : "MEDIUM";
  const risk_level =
    volatility_state === "HIGH" ? "HIGH" : volatility_state === "LOW" ? "LOW" : "NORMAL";
  let momentum_state: "STRONG" | "MEDIUM" | "WEAK" = "WEAK";
  if (
    typeof stockData.momentum?.shortTerm === "number" &&
    typeof stockData.momentum?.midTerm === "number"
  ) {
    const avg = (stockData.momentum.shortTerm + stockData.momentum.midTerm) / 2;
    momentum_state = avg >= 0.65 ? "STRONG" : avg >= 0.4 ? "MEDIUM" : "WEAK";
  }

  // 4) Price Behavior Engine
  const behavior_flag = Boolean(
    stockData.priceBehavior?.abnormalMoves || stockData.priceBehavior?.gapDetected
  );
  const behavior_state = behavior_flag ? "UNSTABLE" : "STABLE";

  // Liquidity
  const inflow = stockData.liquidity?.inflow;
  const outflow = stockData.liquidity?.outflow;
  let liquidityState: "INFLOW" | "OUTFLOW" | "NEUTRAL" = "NEUTRAL";
  let netFlow = 0;
  if (typeof inflow === "number" && typeof outflow === "number") {
    netFlow = round2(inflow - outflow);
    liquidityState = inflow > outflow ? "INFLOW" : outflow > inflow ? "OUTFLOW" : "NEUTRAL";
  }

  // 5) Decision Engine
  const criticalMissing = price === undefined;
  const gammaMissing = !stockData.gamma?.regime;
  let action: ImeResult["decision"]["action"];
  let reason: string;
  let entry: number | undefined;
  let stop: number | undefined;
  let target: number | undefined;
  let risk: "HIGH" | "NORMAL" | "LOW" = risk_level;

  if (criticalMissing) {
    action = "AVOID";
    reason = `Critical data missing or inconsistent: ${warnings.join(", ")}.`;
    risk = "HIGH";
  } else if (behavior_state === "UNSTABLE" && volatility_state === "HIGH") {
    action = "AVOID";
    reason = "Unstable price behavior combined with HIGH volatility regime.";
    risk = "HIGH";
  } else if (
    market_regime === "NEGATIVE_GAMMA" &&
    trend === "BULLISH" &&
    momentum_state === "STRONG" &&
    liquidityState === "INFLOW"
  ) {
    action = "AGGRESSIVE_ENTRY";
    reason = "Negative Gamma + strong momentum + inflow liquidity + bullish delta.";
    entry = round2(price);
    stop = round2(price * 0.99);
    target = round2(price * 1.02);
    risk = "HIGH";
  } else if (
    market_regime === "POSITIVE_GAMMA" &&
    trend === "BULLISH" &&
    momentum_state !== "WEAK" &&
    liquidityState !== "OUTFLOW"
  ) {
    action = "CONSERVATIVE_ENTRY";
    reason = "Positive Gamma + bullish delta + non-weak momentum + liquidity not in outflow.";
    entry = round2(price);
    stop = round2(price * 0.995);
    target = round2(price * 1.01);
    risk = volatility_state === "LOW" ? "LOW" : "NORMAL";
  } else {
    action = "WATCH";
    const missing: string[] = [];
    if (trend !== "BULLISH") missing.push("delta trend not bullish");
    if (momentum_state === "WEAK") missing.push("momentum weak");
    if (momentum_state === "MEDIUM" && market_regime === "NEGATIVE_GAMMA")
      missing.push("momentum only medium for negative gamma regime");
    if (liquidityState === "NEUTRAL") missing.push("liquidity neutral");
    if (liquidityState === "OUTFLOW") missing.push("liquidity in outflow");
    if (flip_state === "AT") missing.push("price at gamma flip level");
    if (behavior_state === "UNSTABLE") missing.push("price behavior unstable");
    reason = `Entry conditions not fully met: ${missing.length ? missing.join(", ") : "mixed signals"}.`;
    risk = risk_level;
  }

  if (warnings.length && action !== "AVOID") {
    reason += ` Data gaps: ${warnings.join(", ")}.`;
  }

  return {
    symbol,
    analysis: {
      marketMaker: { market_regime, trend, flip_state },
      movement: { momentum_state, volatility_state, risk_level },
      behavior: { behavior_state, behavior_flag },
      liquidity: { state: liquidityState, netFlow },
    },
    decision: { action, reason, entry, stop, target, risk },
  };
}
