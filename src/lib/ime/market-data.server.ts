import type { StockData } from "./types";

function hashCode(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

// Deterministic demo data so a symbol always looks the same within a day.
function simulateStockData(symbol: string): StockData {
  const dayKey = new Date().toISOString().slice(0, 10);
  const seed = hashCode(symbol.toUpperCase() + dayKey);
  const rand = (n: number) => {
    const x = Math.sin(seed * (n + 1)) * 10000;
    return x - Math.floor(x);
  };

  const price = Math.round((50 + rand(1) * 450) * 100) / 100;
  const negativeGamma = rand(2) < 0.45;
  const flipLevel = Math.round(price * (0.97 + rand(3) * 0.06) * 100) / 100;
  const direction = rand(4) < 0.55 ? "LONG" : "SHORT";
  const volRegime = rand(5) < 0.25 ? "HIGH" : rand(5) < 0.6 ? "MEDIUM" : "LOW";
  const shortTerm = Math.round(rand(6) * 100) / 100;
  const midTerm = Math.round(rand(7) * 100) / 100;
  const inflow = Math.round(rand(8) * 100) / 100;
  const outflow = Math.round(rand(9) * 100) / 100;

  return {
    symbol: symbol.toUpperCase(),
    price,
    volume: Math.round(500_000 + rand(10) * 20_000_000),
    gamma: {
      netGEX: Math.round((rand(11) - 0.5) * 4_000_000),
      flipLevel,
      regime: negativeGamma ? "NEGATIVE" : "POSITIVE",
    },
    delta: {
      exposure: Math.round((rand(12) - 0.3) * 2_000_000),
      direction: direction as "LONG" | "SHORT",
    },
    liquidity: { inflow, outflow },
    volatility: {
      intraday: Math.round(rand(13) * 150) / 100,
      regime: volRegime as "HIGH" | "MEDIUM" | "LOW",
    },
    momentum: { shortTerm, midTerm },
    priceBehavior: {
      abnormalMoves: rand(14) < 0.08,
      gapDetected: rand(15) < 0.08,
    },
  };
}

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

export async function getStockData(symbol: string): Promise<{ data: StockData; source: string }> {
  const apiKey = process.env["MENTHORQ_API_KEY"];
  if (apiKey) {
    const live = await fetchMenthorQData(symbol, apiKey);
    if (live && live.price !== undefined) return { data: live, source: "menthorq" };
  }
  return { data: simulateStockData(symbol), source: "simulated" };
}
