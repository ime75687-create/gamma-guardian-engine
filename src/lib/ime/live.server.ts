/** Free live data: Yahoo Finance quote + Nasdaq options chain. No paid API. */

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

export interface PriceData {
  symbol: string;
  price: number;
  changePercent: number;
  volume: number;
  currency: string;
  marketState: string;
  fetchedAt: string;
}

export interface OptionData {
  symbol: string;
  type: "CALL" | "PUT";
  strike: number;
  expiration: string;
  /** years to expiry */
  timeToExpiry: number;
  daysToExpiry: number;
  marketPrice: number;
  bid?: number | undefined;
  ask?: number | undefined;
  volume?: number | undefined;
  openInterest?: number | undefined;
  source: string;
}

export async function fetchYahooPrice(symbol: string): Promise<PriceData> {
  const sym = encodeURIComponent(symbol.toUpperCase());
  const res = await fetch(
    `https://query1.finance.yahoo.com/v8/finance/chart/${sym}?interval=1m&range=1d`,
    { headers: { "User-Agent": UA, Accept: "application/json" } }
  );
  if (!res.ok) throw new Error(`Yahoo quote failed [${res.status}]: ${await res.text()}`);
  const json = (await res.json()) as {
    chart?: { result?: Array<{ meta?: Record<string, unknown> }>; error?: unknown };
  };
  const meta = json.chart?.result?.[0]?.meta;
  const num = (v: unknown) => (typeof v === "number" ? v : undefined);
  const price = num(meta?.["regularMarketPrice"]);
  if (!meta || price === undefined) throw new Error(`No live price for ${symbol}`);
  return {
    symbol: symbol.toUpperCase(),
    price,
    changePercent: Math.round((num(meta["regularMarketChangePercent"]) ?? 0) * 100) / 100,
    volume: num(meta["regularMarketVolume"]) ?? 0,
    currency: String(meta["currency"] ?? "USD"),
    marketState: String(meta["marketState"] ?? ""),
    fetchedAt: new Date().toISOString(),
  };
}

interface NasdaqRow {
  expirygroup?: string | null;
  expiryDate?: string | null;
  strike?: string | null;
  c_Last?: string | null;
  c_Bid?: string | null;
  c_Ask?: string | null;
  c_Volume?: string | null;
  c_Openinterest?: string | null;
  p_Last?: string | null;
  p_Bid?: string | null;
  p_Ask?: string | null;
  p_Volume?: string | null;
  p_Openinterest?: string | null;
}

const toNum = (v: string | null | undefined): number | undefined => {
  if (!v) return undefined;
  const n = Number(String(v).replace(/[$,]/g, ""));
  return Number.isFinite(n) ? n : undefined;
};

const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Nearest-ATM contract from the nearest expiry, via Nasdaq's public option-chain JSON. */
export async function fetchAtmOption(
  symbol: string,
  spot: number,
  type: "CALL" | "PUT" = "CALL"
): Promise<OptionData> {
  const now = new Date();
  const to = new Date(now.getTime() + 45 * 86400000);
  const url =
    `https://api.nasdaq.com/api/quote/${encodeURIComponent(symbol.toUpperCase())}/option-chain` +
    `?assetclass=stocks&limit=60&fromdate=${iso(now)}&todate=${iso(to)}&excode=oprac&callput=callput&money=at&type=all`;
  const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" } });
  if (!res.ok) throw new Error(`Nasdaq options failed [${res.status}]: ${await res.text()}`);
  const json = (await res.json()) as { data?: { table?: { rows?: NasdaqRow[] } } };
  const rows = json.data?.table?.rows ?? [];
  if (!rows.length) throw new Error(`No options chain for ${symbol}`);

  // Rows are grouped: a header row carries `expirygroup`, following rows carry strikes.
  let currentGroup = "";
  let group = "";
  const candidates: NasdaqRow[] = [];
  for (const row of rows) {
    if (row.expirygroup) {
      currentGroup = row.expirygroup;
      if (candidates.length) break; // keep the first (nearest) expiry only
      continue;
    }
    if (toNum(row.strike) === undefined) continue;
    if (!group) group = currentGroup;
    candidates.push(row);
  }
  if (!candidates.length) throw new Error(`No strikes for ${symbol}`);

  const best = candidates.reduce((a, b) =>
    Math.abs((toNum(b.strike) ?? Infinity) - spot) < Math.abs((toNum(a.strike) ?? Infinity) - spot)
      ? b
      : a
  );
  const strike = toNum(best.strike)!;
  const bid = toNum(type === "CALL" ? best.c_Bid : best.p_Bid);
  const ask = toNum(type === "CALL" ? best.c_Ask : best.p_Ask);
  const last = toNum(type === "CALL" ? best.c_Last : best.p_Last);
  const mid = bid !== undefined && ask !== undefined && ask > 0 ? (bid + ask) / 2 : last;
  if (mid === undefined || !(mid > 0)) throw new Error(`No option price for ${symbol}`);

  const expiry = new Date(`${group} 21:00:00Z`);
  const expiration = Number.isNaN(expiry.getTime()) ? group : iso(expiry);
  const msLeft = Number.isNaN(expiry.getTime())
    ? 86400000
    : Math.max(expiry.getTime() - Date.now(), 3600000);
  const daysToExpiry = Math.round((msLeft / 86400000) * 100) / 100;

  return {
    symbol: symbol.toUpperCase(),
    type,
    strike,
    expiration,
    timeToExpiry: Math.round((msLeft / (365 * 86400000)) * 1e6) / 1e6,
    daysToExpiry,
    marketPrice: Math.round(mid * 100) / 100,
    bid,
    ask,
    volume: toNum(type === "CALL" ? best.c_Volume : best.p_Volume),
    openInterest: toNum(type === "CALL" ? best.c_Openinterest : best.p_Openinterest),
    source: "nasdaq",
  };
}
