export interface StockData {
  symbol: string;
  price?: number;
  volume?: number;
  gamma?: {
    netGEX?: number;
    flipLevel?: number;
    regime?: "POSITIVE" | "NEGATIVE";
  };
  delta?: {
    exposure?: number;
    direction?: "LONG" | "SHORT";
  };
  liquidity?: {
    inflow?: number;
    outflow?: number;
  };
  volatility?: {
    intraday?: number;
    regime?: "HIGH" | "MEDIUM" | "LOW";
  };
  momentum?: {
    shortTerm?: number;
    midTerm?: number;
  };
  priceBehavior?: {
    abnormalMoves?: boolean;
    gapDetected?: boolean;
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
    entry?: number;
    stop?: number;
    target?: number;
    risk: "HIGH" | "NORMAL" | "LOW";
  };
}
