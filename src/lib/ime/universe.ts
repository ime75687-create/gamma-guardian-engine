// Symbol universe used by the engine and the Telegram bot.

export const FOCUS_LISTS = {
  TECH: ["AAPL", "MSFT", "NVDA", "META", "AMZN", "GOOGL", "TSLA", "AMD", "NFLX", "AVGO"],
  INDEX: ["SPY", "QQQ", "DIA", "IWM", "VIXY"],
  ENERGY: ["XOM", "CVX", "OXY", "SLB", "COP"],
  FINANCE: ["JPM", "BAC", "GS", "MS", "V"],
} as const;

export type FocusKey = keyof typeof FOCUS_LISTS | "ALL";

export const FOCUS_LABELS: Record<FocusKey, string> = {
  ALL: "كل الأسواق",
  TECH: "التقنية",
  INDEX: "المؤشرات",
  ENERGY: "الطاقة",
  FINANCE: "البنوك والمال",
};

export const ALL_SYMBOLS: string[] = Array.from(
  new Set(Object.values(FOCUS_LISTS).flatMap((l) => [...l]))
);

export function symbolsForFocus(focus: string): string[] {
  if (focus === "ALL") return ALL_SYMBOLS;
  const list = FOCUS_LISTS[focus as keyof typeof FOCUS_LISTS];
  return list ? [...list] : ALL_SYMBOLS;
}
