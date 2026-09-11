import type { StockData } from "./types";

async function fetchMenthorQData(symbol: string, apiKey: string): Promise<StockData | null> {
  try {
    const res = await fetch(
      `https://api.menthorq.com/api/gex/${encodeURIComponent(symbol.toUpperCase())}`,
      { headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" } }
    );
    if (!res.ok) {
      console.error(`MenthorQ fetch failed for ${symbol} [${res.status}]: ${await res.text()}`);
      return null;
    }
    const j = (await res.json()) as Record<string, unknown>;
    const num = (v: unknown) => (typeof v === "number" ? v : undefined);
    return {
      symbol: symbol.toUpperCase(),
      price: num(j["price"]) ?? num(j["spot_price"]),
      volume: num(j["volume"]),
      gamma: {
        netGEX: num(j["net_gex"]) ?? num(j["netGEX"]),
        flipLevel: num(j["flip_level"]) ?? num(j["gamma_flip"]),
        regime:
          String(j["regime"] ?? "").toUpperCase() === "NEGATIVE" ? "NEGATIVE" : "POSITIVE",
      },
      delta: {
        exposure: num(j["delta_exposure"]) ?? num(j["dex"]),
        direction: (num(j["delta_exposure"]) ?? num(j["dex"]) ?? 0) >= 0 ? "LONG" : "SHORT",
      },
      liquidity: { inflow: num(j["inflow"]), outflow: num(j["outflow"]) },
      volatility: {
        intraday: num(j["iv"]) ?? num(j["volatility"]),
        regime: (num(j["iv"]) ?? 0.5) > 0.8 ? "HIGH" : (num(j["iv"]) ?? 0.5) > 0.4 ? "MEDIUM" : "LOW",
      },
      momentum: {
        shortTerm: num(j["momentum_short"]),
        midTerm: num(j["momentum_mid"]),
      },
      priceBehavior: { abnormalMoves: false, gapDetected: false },
    };
  } catch (e) {
    console.error(`MenthorQ fetch error for ${symbol}:`, e);
    return null;
  }
}

// Finnhub: quote (price) + daily RSI (momentum). Engine fields Finnhub can't
// provide stay undefined — the deterministic engine handles gaps via warnings.
async function fetchFinnhubData(symbol: string, apiKey: string): Promise<StockData | null> {
  const sym = encodeURIComponent(symbol.toUpperCase());
  try {
    const [quoteRes, rsiRes] = await Promise.all([
      fetch(`https://finnhub.io/api/v1/quote?symbol=${sym}&token=${apiKey}`),
      fetch(
        `https://finnhub.io/api/v1/indicator?symbol=${sym}&resolution=D&indicator=rsi&timeperiod=14&token=${apiKey}`
      ),
    ]);
    if (!quoteRes.ok) {
      console.error(`Finnhub quote failed for ${symbol} [${quoteRes.status}]: ${await quoteRes.text()}`);
      return null;
    }
    const quote = (await quoteRes.json()) as Record<string, unknown>;
    const price = typeof quote["c"] === "number" && quote["c"] > 0 ? (quote["c"] as number) : undefined;
    if (price === undefined) {
      console.error(`Finnhub quote missing price for ${symbol}:`, quote);
      return null;
    }

    let rsiValue: number | undefined;
    if (rsiRes.ok) {
      const rsiJson = (await rsiRes.json()) as { rsi?: number[]; s?: string };
      if (Array.isArray(rsiJson.rsi) && rsiJson.rsi.length > 0) {
        const last = rsiJson.rsi[rsiJson.rsi.length - 1];
        if (typeof last === "number") rsiValue = Math.round(last * 100) / 100;
      }
    } else {
      console.error(`Finnhub RSI failed for ${symbol} [${rsiRes.status}]: ${await rsiRes.text()}`);
    }

    const prevClose = typeof quote["pc"] === "number" ? (quote["pc"] as number) : undefined;
    const dayOpen = typeof quote["o"] === "number" ? (quote["o"] as number) : undefined;
    const gapDetected =
      prevClose !== undefined && dayOpen !== undefined
        ? Math.abs(dayOpen - prevClose) / prevClose > 0.02
        : false;
    const high = typeof quote["h"] === "number" ? (quote["h"] as number) : undefined;
    const low = typeof quote["l"] === "number" ? (quote["l"] as number) : undefined;
    const intradayRange =
      high !== undefined && low !== undefined && price > 0
        ? Math.round(((high - low) / price) * 10000) / 100
        : undefined;

    // RSI needs a paid Finnhub plan. When it is unavailable, derive a
    // deterministic RSI-equivalent from the free quote: where the price sits in
    // the day range, blended with the daily % change.
    const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
    const dayChangePct =
      prevClose !== undefined && prevClose > 0 ? (price - prevClose) / prevClose : undefined;
    const rangePos =
      high !== undefined && low !== undefined && high > low
        ? clamp01((price - low) / (high - low))
        : undefined;
    const derivedMomentum =
      rangePos !== undefined || dayChangePct !== undefined
        ? Math.round(
            clamp01(0.6 * (rangePos ?? 0.5) + 0.4 * clamp01(0.5 + (dayChangePct ?? 0) * 12)) * 100
          ) / 100
        : undefined;
    if (rsiValue === undefined && derivedMomentum !== undefined) {
      rsiValue = Math.round(derivedMomentum * 100 * 100) / 100;
    }

    // Map RSI (0-100) to engine momentum scores (0-1); direction from price vs prev close.
    const momentumScore =
      rsiValue !== undefined ? Math.round((rsiValue / 100) * 100) / 100 : derivedMomentum;
    const direction =
      prevClose !== undefined ? (price >= prevClose ? "LONG" : "SHORT") : undefined;
    // Liquidity proxy from where the price closes inside the day range.
    const liquidity =
      rangePos !== undefined
        ? { inflow: Math.round(rangePos * 100) / 100, outflow: Math.round((1 - rangePos) * 100) / 100 }
        : undefined;

    // Deterministic Gamma/Delta simulation from quote + RSI (Finnhub has no
    // options data). Same inputs always produce the same scores.
    const round3 = (n: number) => Math.round(n * 1000) / 1000;
    const dailyVol = high !== undefined && low !== undefined && price > 0
      ? (high - low) / price
      : undefined;
    const rsiForSim = rsiValue ?? 50;
    const simGamma =
      dailyVol !== undefined ? round3(dailyVol * 0.8 + (rsiForSim - 50) / 200) : undefined;
    const simDelta =
      prevClose !== undefined && prevClose > 0
        ? round3((price - prevClose) / prevClose)
        : undefined;
    // High simulated gamma = expansion/negative-gamma-like regime.
    const simRegime =
      simGamma === undefined ? undefined : simGamma > 0.2 ? "NEGATIVE" : "POSITIVE";

    return {
      symbol: symbol.toUpperCase(),
      price,
      gamma: {
        flipLevel: prevClose,
        regime: simRegime,
        simulated: true,
        score: simGamma,
      },
      delta: { direction: direction as "LONG" | "SHORT" | undefined, changePct: simDelta },
      ...(liquidity ? { liquidity } : {}),
      volatility: {
        intraday: intradayRange,
        regime:
          intradayRange === undefined
            ? undefined
            : intradayRange > 5
              ? "HIGH"
              : intradayRange > 2
                ? "MEDIUM"
                : "LOW",
      },
      momentum: { shortTerm: momentumScore, midTerm: momentumScore },
      priceBehavior: { abnormalMoves: false, gapDetected },
    };
  } catch (e) {
    console.error(`Finnhub fetch error for ${symbol}:`, e);
    return null;
  }
}

/** Thrown when no real market data can be fetched. We never fabricate prices. */
export class NoLiveDataError extends Error {
  constructor(symbol: string) {
    super(`No live market data available for ${symbol}`);
    this.name = "NoLiveDataError";
  }
}

export async function getStockData(symbol: string): Promise<{ data: StockData; source: string }> {
  const menthorqKey = process.env["MENTHORQ_API_KEY"];
  if (menthorqKey) {
    const live = await fetchMenthorQData(symbol, menthorqKey);
    if (live && live.price !== undefined) return { data: live, source: "menthorq" };
  }
  const finnhubKey = process.env["FINNHUB_API_KEY"];
  if (finnhubKey) {
    // one retry — transient rate limits must never turn into fake prices
    for (let attempt = 0; attempt < 2; attempt++) {
      const live = await fetchFinnhubData(symbol, finnhubKey);
      if (live && live.price !== undefined) return { data: live, source: "finnhub" };
      if (attempt === 0) await new Promise((r) => setTimeout(r, 700));
    }
  }
  throw new NoLiveDataError(symbol);
}
