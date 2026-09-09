export interface StockData {
  symbol: string;
  price?: number | undefined;
  volume?: number | undefined;
  gamma?: {
    netGEX?: number | undefined;
    flipLevel?: number | undefined;
    regime?: "POSITIVE" | "NEGATIVE" | undefined;
  };
  delta?: {
    exposure?: number | undefined;
    direction?: "LONG" | "SHORT" | undefined;
  };
  liquidity?: {
    inflow?: number | undefined;
    outflow?: number | undefined;
  };
  volatility?: {
    intraday?: number | undefined;
    regime?: "HIGH" | "MEDIUM" | "LOW" | undefined;
  };
  momentum?: {
    shortTerm?: number | undefined;
    midTerm?: number | undefined;
  };
  priceBehavior?: {
    abnormalMoves?: boolean | undefined;
    gapDetected?: boolean | undefined;
  };
}

export type Action =
  | "AGGRESSIVE_ENTRY"
  | "CONSERVATIVE_ENTRY"
  | "WATCH"
  | "AVOID";

export interface ImeResult {
  symbol: string;
  analysis: {
    marketMaker: {
      market_regime: "POSITIVE_GAMMA" | "NEGATIVE_GAMMA";
      trend: "BULLISH" | "BEARISH" | "NEUTRAL";
      flip_state: "FAR" | "NEAR" | "AT";
    };
    movement: {
      momentum_state: "STRONG" | "MEDIUM" | "WEAK";
      volatility_state: "HIGH" | "MEDIUM" | "LOW";
      risk_level: "HIGH" | "NORMAL" | "LOW";
    };
    behavior: {
      behavior_state: "STABLE" | "UNSTABLE";
      behavior_flag: boolean;
    };
    liquidity: {
      state: "INFLOW" | "OUTFLOW" | "NEUTRAL";
      netFlow: number;
    };
  };
  decision: {
    action: Action;
    reason: string;
    entry?: number | undefined;
    stop?: number | undefined;
    target?: number | undefined;
    risk: "HIGH" | "NORMAL" | "LOW";
  };
}
