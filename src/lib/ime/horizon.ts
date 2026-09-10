// Trading horizon: day trade, weekly swing, monthly position.

export type HorizonKey = "DAY" | "WEEK" | "MONTH";

export const HORIZON_LABELS: Record<HorizonKey, string> = {
  DAY: "مضاربة يومية",
  WEEK: "صفقات أسبوعية",
  MONTH: "صفقات شهرية",
};

export interface HorizonConfig {
  key: HorizonKey;
  /** stop distance as a fraction of price */
  stopPct: number;
  /** target distance as a fraction of price */
  targetPct: number;
  /** how far out of the money the suggested option strike sits */
  strikeOtmPct: number;
  /** approximate calendar days to expiry */
  days: number;
}

export const HORIZONS: Record<HorizonKey, HorizonConfig> = {
  DAY: { key: "DAY", stopPct: 0.006, targetPct: 0.012, strikeOtmPct: 0, days: 3 },
  WEEK: { key: "WEEK", stopPct: 0.02, targetPct: 0.045, strikeOtmPct: 0.02, days: 9 },
  MONTH: { key: "MONTH", stopPct: 0.05, targetPct: 0.12, strikeOtmPct: 0.05, days: 32 },
};

export function horizonOf(value: string | null | undefined): HorizonConfig {
  const k = String(value ?? "DAY").toUpperCase() as HorizonKey;
  return HORIZONS[k] ?? HORIZONS.DAY;
}
