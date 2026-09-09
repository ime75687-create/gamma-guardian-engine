export interface NewsItem {
  headline: string;
  source: string;
  url: string;
  datetime: number;
  summary?: string | undefined;
}

/** General market news, or company news when a symbol is given. */
export async function fetchMarketNews(symbol?: string, limit = 6): Promise<NewsItem[]> {
  const key = process.env["FINNHUB_API_KEY"];
  if (!key) return [];
  try {
    let url: string;
    if (symbol) {
      const to = new Date();
      const from = new Date(to.getTime() - 7 * 24 * 60 * 60 * 1000);
      const fmt = (d: Date) => d.toISOString().slice(0, 10);
      url = `https://finnhub.io/api/v1/company-news?symbol=${encodeURIComponent(
        symbol.toUpperCase()
      )}&from=${fmt(from)}&to=${fmt(to)}&token=${key}`;
    } else {
      url = `https://finnhub.io/api/v1/news?category=general&token=${key}`;
    }
    const res = await fetch(url);
    if (!res.ok) {
      console.error(`Finnhub news failed [${res.status}]: ${await res.text()}`);
      return [];
    }
    const rows = (await res.json()) as Array<Record<string, unknown>>;
    if (!Array.isArray(rows)) return [];
    return rows.slice(0, limit).map((r) => ({
      headline: String(r["headline"] ?? ""),
      source: String(r["source"] ?? ""),
      url: String(r["url"] ?? ""),
      datetime: typeof r["datetime"] === "number" ? (r["datetime"] as number) : 0,
      summary: typeof r["summary"] === "string" ? (r["summary"] as string) : undefined,
    }));
  } catch (e) {
    console.error("Finnhub news error:", e);
    return [];
  }
}
