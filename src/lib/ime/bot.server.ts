import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { analyzeStock } from "./engine";
import { getStockData } from "./market-data.server";
import { fetchMarketNews } from "./news.server";
import { formatDecision, sendTelegramMessage, telegramCall } from "./telegram.server";
import { FOCUS_LABELS, symbolsForFocus, type FocusKey } from "./universe";
import { HORIZON_LABELS, type HorizonKey } from "./horizon";
import { buildOptionIdea, formatOptionIdea } from "./options";

export interface BotUser {
  chat_id: string;
  analysis_type: string;
  focus: string;
  horizon: string;
  subscribed: boolean;
  state: string | null;
}

let _client: SupabaseClient | null = null;
export function botSupabase(): SupabaseClient {
  if (!_client) {
    _client = createClient(
      process.env["SUPABASE_URL"]!,
      process.env["SUPABASE_SERVICE_ROLE_KEY"]!,
      { auth: { persistSession: false } }
    );
  }
  return _client;
}

const MAIN_MENU = {
  inline_keyboard: [
    [
      { text: "🔍 حلّل سهم", callback_data: "act:ask_symbol" },
      { text: "📈 تحليل السوق", callback_data: "act:market" },
    ],
    [
      { text: "📰 أخبار السوق", callback_data: "act:news" },
      { text: "⚙️ نوع التحليل", callback_data: "act:type" },
    ],
    [
      { text: "🎯 وش أحلل لك؟", callback_data: "act:focus" },
      { text: "⏱ مدة الصفقة", callback_data: "act:horizon" },
    ],
    [{ text: "🔔 التنبيهات التلقائية", callback_data: "act:sub" }],
  ],
};

const HORIZON_MENU = {
  inline_keyboard: [
    [
      { text: "⚡ مضاربة يومية", callback_data: "hz:DAY" },
      { text: "📅 صفقات أسبوعية", callback_data: "hz:WEEK" },
    ],
    [
      { text: "🗓 صفقات شهرية", callback_data: "hz:MONTH" },
      { text: "⬅️ القائمة", callback_data: "act:menu" },
    ],
  ],
};

const TYPE_MENU = {
  inline_keyboard: [
    [
      { text: "⚡ تحليل سريع", callback_data: "type:QUICK" },
      { text: "📊 تحليل كامل", callback_data: "type:FULL" },
    ],
    [{ text: "⬅️ القائمة", callback_data: "act:menu" }],
  ],
};

const FOCUS_MENU = {
  inline_keyboard: [
    [
      { text: "💻 التقنية", callback_data: "focus:TECH" },
      { text: "📊 المؤشرات", callback_data: "focus:INDEX" },
    ],
    [
      { text: "🛢 الطاقة", callback_data: "focus:ENERGY" },
      { text: "🏦 البنوك والمال", callback_data: "focus:FINANCE" },
    ],
    [
      { text: "🌍 كل الأسواق", callback_data: "focus:ALL" },
      { text: "⬅️ القائمة", callback_data: "act:menu" },
    ],
  ],
};

function welcome(u: BotUser): string {
  return [
    "<b>IME — محرّك تحليل السوق</b>",
    "",
    "أهلاً بك 👋 اختر من القائمة:",
    "• <b>حلّل سهم</b>: أرسل رمز السهم وأعطيك القرار (دخول / مراقبة / تجنّب).",
    "• <b>تحليل السوق</b>: تحليل قائمة الأسهم المختارة لك.",
    "• <b>أخبار السوق</b>: آخر عناوين الأسواق.",
    "",
    `نوع التحليل الحالي: <b>${u.analysis_type === "FULL" ? "كامل" : "سريع"}</b>`,
    `مجال التحليل: <b>${FOCUS_LABELS[(u.focus as FocusKey) ?? "ALL"] ?? u.focus}</b>`,
    `مدة الصفقة: <b>${HORIZON_LABELS[(u.horizon as HorizonKey) ?? "DAY"] ?? u.horizon}</b>`,
    `التنبيهات: <b>${u.subscribed ? "مفعّلة" : "متوقفة"}</b>`,
  ].join("\n");
}

async function getOrCreateUser(
  chatId: string,
  meta: { first_name?: string; username?: string }
): Promise<BotUser> {
  const sb = botSupabase();
  const { data } = await sb.from("ime_bot_users").select("*").eq("chat_id", chatId).maybeSingle();
  if (data) return data as unknown as BotUser;
  const insert = {
    chat_id: chatId,
    first_name: meta.first_name ?? null,
    username: meta.username ?? null,
  };
  const { data: created } = await sb
    .from("ime_bot_users")
    .upsert(insert, { onConflict: "chat_id" })
    .select("*")
    .single();
  return (created ?? {
    chat_id: chatId,
    analysis_type: "QUICK",
    focus: "ALL",
    horizon: "DAY",
    subscribed: true,
    state: null,
  }) as unknown as BotUser;
}

async function patchUser(chatId: string, patch: Record<string, unknown>) {
  await botSupabase()
    .from("ime_bot_users")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("chat_id", chatId);
}

export async function analyzeAndFormat(
  symbol: string,
  full: boolean,
  horizon = "DAY"
): Promise<{ text: string; action: string; confidence: number }> {
  const { data, source } = await getStockData(symbol);
  const result = analyzeStock(data);
  const srcLabel =
    source === "menthorq" ? "MenthorQ (حي)" : source === "finnhub" ? "Finnhub (حي)" : source;
  const priceLine = data.price !== undefined ? `السعر: <code>${data.price}</code>\n` : "";
  const hzLine = `المدة: <b>${HORIZON_LABELS[(horizon as HorizonKey) ?? "DAY"] ?? horizon}</b>\n`;
  const idea =
    data.price !== undefined ? buildOptionIdea(result, data.price, horizon) : null;
  const optionBlock = idea ? formatOptionIdea(idea, result.symbol) : "";
  return {
    text: `${priceLine}${hzLine}${formatDecision(result, full)}${optionBlock}\n\n<i>المصدر: ${srcLabel}</i>`,
    action: result.decision.action,
  };
}

async function sendNews(chatId: string, symbol?: string) {
  const news = await fetchMarketNews(symbol, 6);
  if (!news.length) {
    await sendTelegramMessage(chatId, "لا توجد أخبار متاحة حالياً.", MAIN_MENU);
    return;
  }
  const head = symbol ? `📰 <b>أخبار ${symbol.toUpperCase()}</b>` : "📰 <b>أخبار الأسواق</b>";
  const body = news
    .map((n, i) => `${i + 1}. <a href="${n.url}">${n.headline}</a>\n<i>${n.source}</i>`)
    .join("\n\n");
  await sendTelegramMessage(chatId, `${head}\n\n${body}`, MAIN_MENU);
}

async function sendMarketScan(chatId: string, user: BotUser) {
  const symbols = symbolsForFocus(user.focus).slice(0, 10);
  await sendTelegramMessage(
    chatId,
    `⏳ جاري تحليل ${symbols.length} رمز في مجال <b>${FOCUS_LABELS[(user.focus as FocusKey) ?? "ALL"]}</b>...`
  );
  const full = user.analysis_type === "FULL";
  const blocks: string[] = [];
  for (const s of symbols) {
    try {
      blocks.push((await analyzeAndFormat(s, full, user.horizon)).text);
    } catch (e) {
      console.error(`bot analyze ${s} failed:`, e);
    }
  }
  const chunkSize = full ? 3 : 6;
  for (let i = 0; i < blocks.length; i += chunkSize) {
    const chunk = blocks.slice(i, i + chunkSize).join("\n\n━━━━━━\n\n");
    await sendTelegramMessage(
      chatId,
      chunk,
      i + chunkSize >= blocks.length ? MAIN_MENU : undefined
    );
  }
}

export async function handleTelegramUpdate(update: Record<string, any>): Promise<void> {
  const cb = update["callback_query"];
  const msg = update["message"] ?? update["edited_message"] ?? cb?.message;
  const chatId = msg?.chat?.id ? String(msg.chat.id) : null;
  if (!chatId) return;

  const from = cb?.from ?? msg?.from ?? {};
  const user = await getOrCreateUser(chatId, {
    first_name: from.first_name,
    username: from.username,
  });

  if (cb) {
    await telegramCall("answerCallbackQuery", { callback_query_id: cb.id });
    const data: string = String(cb.data ?? "");

    if (data.startsWith("type:")) {
      const t = data.slice(5) === "FULL" ? "FULL" : "QUICK";
      await patchUser(chatId, { analysis_type: t, state: null });
      await sendTelegramMessage(
        chatId,
        `تم ✅ نوع التحليل الآن: <b>${t === "FULL" ? "كامل" : "سريع"}</b>`,
        MAIN_MENU
      );
      return;
    }
    if (data.startsWith("hz:")) {
      const h = data.slice(3);
      await patchUser(chatId, { horizon: h, state: null });
      await sendTelegramMessage(
        chatId,
        `تم ✅ مدة الصفقة الآن: <b>${HORIZON_LABELS[h as HorizonKey] ?? h}</b>`,
        MAIN_MENU
      );
      return;
    }
    if (data.startsWith("focus:")) {
      const f = data.slice(6);
      await patchUser(chatId, { focus: f, state: null });
      await sendTelegramMessage(
        chatId,
        `تم ✅ سأحلل لك: <b>${FOCUS_LABELS[f as FocusKey] ?? f}</b>`,
        MAIN_MENU
      );
      return;
    }
    switch (data) {
      case "act:type":
        await sendTelegramMessage(chatId, "اختر نوع التحليل الذي تريده:", TYPE_MENU);
        return;
      case "act:horizon":
        await sendTelegramMessage(
          chatId,
          "اختر مدة الصفقة:\n• <b>مضاربة يومية</b> — دخول وخروج سريع.\n• <b>أسبوعية</b> — أهداف أوسع وعقود لأسبوع.\n• <b>شهرية</b> — عقود أبعد وأهداف أكبر.",
          HORIZON_MENU
        );
        return;
      case "act:focus":
        await sendTelegramMessage(chatId, "وش تحب أحلل لك؟", FOCUS_MENU);
        return;
      case "act:ask_symbol":
        await patchUser(chatId, { state: "AWAIT_SYMBOL" });
        await sendTelegramMessage(chatId, "أرسل رمز السهم (مثال: AAPL أو TSLA).");
        return;
      case "act:news":
        await sendNews(chatId);
        return;
      case "act:market":
        await sendMarketScan(chatId, user);
        return;
      case "act:sub": {
        const next = !user.subscribed;
        await patchUser(chatId, { subscribed: next });
        await sendTelegramMessage(
          chatId,
          next ? "🔔 تم تفعيل التنبيهات التلقائية." : "🔕 تم إيقاف التنبيهات.",
          MAIN_MENU
        );
        return;
      }
      case "act:menu":
      default:
        await sendTelegramMessage(chatId, welcome({ ...user }), MAIN_MENU);
        return;
    }
  }

  const text: string = String(msg?.text ?? "").trim();
  if (!text) return;

  if (text.startsWith("/start") || text === "/menu") {
    await patchUser(chatId, { state: null, subscribed: true });
    await sendTelegramMessage(chatId, welcome(user), MAIN_MENU);
    await sendTelegramMessage(chatId, "أولاً، اختر نوع التحليل الذي يناسبك:", TYPE_MENU);
    await sendTelegramMessage(chatId, "وبعدها اختر مدة الصفقة:", HORIZON_MENU);
    return;
  }
  if (text.startsWith("/news")) {
    const parts = text.split(/\s+/);
    await sendNews(chatId, parts[1]);
    return;
  }
  if (text.startsWith("/market")) {
    await sendMarketScan(chatId, user);
    return;
  }
  if (text.startsWith("/help")) {
    await sendTelegramMessage(
      chatId,
      ["الأوامر:", "/start القائمة", "/market تحليل السوق", "/news الأخبار", "أو أرسل رمز السهم مباشرة"].join("\n"),
      MAIN_MENU
    );
    return;
  }

  const symbol = text.replace(/^\//, "").toUpperCase();
  if (/^[A-Z.\-]{1,10}$/.test(symbol)) {
    await patchUser(chatId, { state: null });
    await sendTelegramMessage(chatId, `⏳ جاري تحليل <b>${symbol}</b>...`);
    try {
      const body = await analyzeAndFormat(symbol, user.analysis_type === "FULL", user.horizon);
      await sendTelegramMessage(chatId, body.text, MAIN_MENU);
    } catch (e) {
      console.error(`bot symbol analyze failed for ${symbol}:`, e);
      await sendTelegramMessage(chatId, "تعذر تحليل هذا الرمز. تأكد من الرمز وحاول مرة أخرى.", MAIN_MENU);
    }
    return;
  }

  await sendTelegramMessage(chatId, "لم أفهم الطلب. اختر من القائمة:", MAIN_MENU);
}

/** Auto-push entry signals to every subscribed bot user (no request needed). */
export async function broadcastAlerts(): Promise<{ users: number; sent: number }> {
  const sb = botSupabase();
  const { data: users } = await sb
    .from("ime_bot_users")
    .select("chat_id, analysis_type, focus, horizon, subscribed")
    .eq("subscribed", true);
  const rows = (users ?? []) as unknown as BotUser[];

  const cache = new Map<string, { action: string; text: string }>();
  const today = new Date().toISOString().slice(0, 10);
  let sent = 0;

  for (const u of rows) {
    const symbols = symbolsForFocus(u.focus).slice(0, 10);
    const full = u.analysis_type === "FULL";
    const horizon = u.horizon ?? "DAY";
    const hits: Array<{ symbol: string; action: string; text: string }> = [];

    for (const s of symbols) {
      const key = `${s}:${full ? "F" : "Q"}:${horizon}`;
      let item = cache.get(key);
      if (!item) {
        try {
          item = await analyzeAndFormat(s, full, horizon);
          cache.set(key, item);
        } catch (e) {
          console.error(`broadcast analyze ${s} failed:`, e);
          continue;
        }
      }
      if (item.action !== "AGGRESSIVE_ENTRY" && item.action !== "CONSERVATIVE_ENTRY") continue;

      // Don't repeat the same idea to the same user on the same day.
      const { error } = await sb.from("ime_bot_alerts").insert({
        chat_id: u.chat_id,
        symbol: s,
        action: item.action,
        horizon,
        day: today,
      });
      if (error) continue;
      hits.push({ symbol: s, action: item.action, text: item.text });
    }

    if (!hits.length) continue;
    for (let i = 0; i < hits.length; i += 3) {
      const chunk = hits.slice(i, i + 3).map((h) => h.text).join("\n\n━━━━━━\n\n");
      const res = await sendTelegramMessage(
        u.chat_id,
        `🚨 <b>فرص دخول جديدة — ${HORIZON_LABELS[(horizon as HorizonKey) ?? "DAY"] ?? horizon}</b>\n\n${chunk}`,
        i + 3 >= hits.length ? MAIN_MENU : undefined
      );
      if (res.ok) sent++;
    }
  }
  return { users: rows.length, sent };
}
