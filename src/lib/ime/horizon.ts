// Trading horizon: scalp (minutes), 1 hour, ~5 hours, day trade, weekly swing, monthly position.

export type HorizonKey = "SCALP" | "H1" | "H4" | "DAY" | "WEEK" | "MONTH";

export const HORIZON_LABELS: Record<HorizonKey, string> = {
  SCALP: "سكالب (دقائق)",
  H1: "ساعة واحدة",
  H4: "٤-٥ ساعات",
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
  /** how far out of the money the suggested option strike starts */
  strikeOtmPct: number;
  /** approximate calendar days to expiry */
  days: number;
  /** hard cap on calendar days to expiry — keeps contracts short-dated */
  maxDays: number;
  /** cheap-contract budget: max estimated premium per share (USD) */
  maxPremium: number;
  /** never suggest a strike further out of the money than this */
  maxOtmPct: number;
}

export const HORIZONS: Record<HorizonKey, HorizonConfig> = {
  SCALP: {
    key: "SCALP",
    stopPct: 0.003,
    targetPct: 0.006,
    strikeOtmPct: 0.005,
    days: 0,
    maxDays: 2,
    maxPremium: 0.5,
    maxOtmPct: 0.012,
  },
  H1: {
    key: "H1",
    stopPct: 0.004,
    targetPct: 0.008,
    strikeOtmPct: 0.006,
    days: 0,
    maxDays: 2,
    maxPremium: 0.7,
    maxOtmPct: 0.014,
  },
  H4: {
    key: "H4",
    stopPct: 0.005,
    targetPct: 0.01,
    strikeOtmPct: 0.008,
    days: 0,
    maxDays: 3,
    maxPremium: 0.9,
    maxOtmPct: 0.016,
  },
  DAY: {
    key: "DAY",
    stopPct: 0.006,
    targetPct: 0.012,
    strikeOtmPct: 0.01,
    days: 1,
    maxDays: 5,
    maxPremium: 1.1,
    maxOtmPct: 0.02,
  },
  WEEK: {
    key: "WEEK",
    stopPct: 0.02,
    targetPct: 0.045,
    strikeOtmPct: 0.025,
    days: 4,
    maxDays: 9,
    maxPremium: 2,
    maxOtmPct: 0.04,
  },
  MONTH: {
    key: "MONTH",
    stopPct: 0.05,
    targetPct: 0.12,
    strikeOtmPct: 0.05,
    days: 21,
    maxDays: 35,
    maxPremium: 4,
    maxOtmPct: 0.08,
  },
};

export function horizonOf(value: string | null | undefined): HorizonConfig {
  const k = String(value ?? "DAY").toUpperCase() as HorizonKey;
  return HORIZONS[k] ?? HORIZONS.DAY;
}
