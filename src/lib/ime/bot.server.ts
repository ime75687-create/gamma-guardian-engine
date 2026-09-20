import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { analyzeStock } from "./engine";
import { getStockData } from "./market-data.server";
import { fetchMarketNews } from "./news.server";
import { formatDecision, sendTelegramMessage, telegramCall } from "./telegram.server";
import { FOCUS_LABELS, symbolsForFocus, type FocusKey } from "./universe";
import { HORIZON_LABELS, horizonOf, type HorizonKey } from "./horizon";
import { buildOptionIdea, formatOptionIdea, type OptionIdea } from "./options";

export interface BotUser {
  chat_id: string;
  analysis_type: string;
  focus: string;
  horizon: string;
  subscribed: boolean;
  state: string | null;
  muted_until: string | null;
  min_confidence: number;
}

export interface BotTrade {
  id: string;
  chat_id: string;
  symbol: string;
  action: string;
  horizon: string;
  option_idea: OptionIdea | null;
  entry: number | null;
  stop: number | null;
  target: number | null;
  status: string; // SENT | JOINED | DECLINED | CLOSED_TARGET | CLOSED_STOP | EXPIRED
  last_price: number | null;
  created_at: string;
  updated_at: string;
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
      { text: "📋 صفقاتي", callback_data: "act:trades" },
    ],
    [
      { text: "⚙️ نوع التحليل", callback_data: "act:type" },
      { text: "🎯 وش أحلل لك؟", callback_data: "act:focus" },
    ],
    [
      { text: "⏱ مدة الصفقة", callback_data: "act:horizon" },
      { text: "🔔 التنبيهات", callback_data: "act:alerts" },
    ],
  ],
};

const HORIZON_MENU = {
  inline_keyboard: [
    [
      { text: "🔥 سكالب (دقائق)", callback_data: "hz:SCALP" },
      { text: "⏳ ساعة", callback_data: "hz:H1" },
    ],
    [
      { text: "🕔 ٤-٥ ساعات", callback_data: "hz:H4" },
      { text: "⚡ مضاربة يومية", callback_data: "hz:DAY" },
    ],
    [
      { text: "📅 صفقات أسبوعية", callback_data: "hz:WEEK" },
      { text: "🗓 صفقات شهرية", callback_data: "hz:MONTH" },
    ],
    [{ text: "⬅️ القائمة", callback_data: "act:menu" }],
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

function alertsMenu(u: BotUser) {
  const muted = u.muted_until && new Date(u.muted_until) > new Date();
  return {
    inline_keyboard: [
      [
        {
          text: u.subscribed ? "🔕 إيقاف التنبيهات" : "🔔 تفعيل التنبيهات",
          callback_data: "act:sub",
        },
      ],
      [
        { text: muted ? "🔇 مكتوم الآن — إلغاء الكتم" : "🔇 كتم ساعة", callback_data: muted ? "mute:off" : "mute:1h" },
        { text: "🔇 كتم ٤ ساعات", callback_data: "mute:4h" },
        { text: "🔇 كتم يوم", callback_data: "mute:24h" },
      ],
      [
        { text: `${u.min_confidence <= 50 ? "✅ " : ""}ثقة 50%+`, callback_data: "conf:50" },
        { text: `${u.min_confidence === 62 ? "✅ " : ""}ثقة 62%+`, callback_data: "conf:62" },
        { text: `${u.min_confidence === 70 ? "✅ " : ""}ثقة 70%+`, callback_data: "conf:70" },
        { text: `${u.min_confidence >= 80 ? "✅ " : ""}ثقة 80%+`, callback_data: "conf:80" },
      ],
      [{ text: "⬅️ القائمة", callback_data: "act:menu" }],
    ],
  };
}

function welcome(u: BotUser): string {
  const muted = u.muted_until && new Date(u.muted_until) > new Date();
  return [
    "<b>IME — محرّك تحليل السوق</b>",
    "",
    "أهلاً بك 👋 اختر من القائمة:",
    "• <b>حلّل سهم</b>: أرسل رمز السهم وأعطيك القرار (دخول / مراقبة / تجنّب).",
    "• <b>تحليل السوق</b>: تحليل قائمة الأسهم المختارة لك.",
    "• <b>صفقاتي</b>: الصفقات اللي انضميت لها ومتابعتها لحظياً.",
    "• <b>أخبار السوق</b>: آخر عناوين الأسواق.",
    "",
    `نوع التحليل الحالي: <b>${u.analysis_type === "FULL" ? "كامل" : "سريع"}</b>`,
    `مجال التحليل: <b>${FOCUS_LABELS[(u.focus as FocusKey) ?? "ALL"] ?? u.focus}</b>`,
    `مدة الصفقة: <b>${HORIZON_LABELS[(u.horizon as HorizonKey) ?? "DAY"] ?? u.horizon}</b>`,
    `التنبيهات: <b>${muted ? "مكتومة مؤقتاً 🔇" : u.subscribed ? "مفعّلة" : "متوقفة"}</b> (حد الثقة ${u.min_confidence}%)`,
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
    muted_until: null,
    min_confidence: 62,
  }) as unknown as BotUser;
}

async function patchUser(chatId: string, patch: Record<string, unknown>) {
  await botSupabase()
    .from("ime_bot_users")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("chat_id", chatId);
}

interface AnalysisOutcome {
  text: string;
  action: string;
  confidence: number;
  idea: OptionIdea | null;
  price: number | null;
}

export async function analyzeAndFormat(
  symbol: string,
  full: boolean,
  horizon = "DAY"
): Promise<AnalysisOutcome> {
  const { data, source } = await getStockData(symbol);
  const result = analyzeStock(data);
  const srcLabel =
    source === "menthorq" ? "MenthorQ (حي)" : source === "finnhub" ? "Finnhub (حي)" : source;
  const price = data.price ?? null;
  const priceLine = price !== null ? `السعر: <code>${price}</code>\n` : "";
  const hzLine = `المدة: <b>${HORIZON_LABELS[(horizon as HorizonKey) ?? "DAY"] ?? horizon}</b>\n`;
  const idea = price !== null ? buildOptionIdea(result, price, horizon) : null;
  const optionBlock = idea ? formatOptionIdea(idea, result.symbol) : "";
  const confidence = result.decision.confidence;
  const confLine = `درجة الثقة: <b>${confidence}%</b>\n`;
  return {
    text: `${priceLine}${hzLine}${confLine}${formatDecision(result, full)}${optionBlock}\n\n<i>المصدر: ${srcLabel} — سعر لحظي حقيقي</i>`,
    action: result.decision.action,
    confidence,
    idea,
    price,
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

async function sendMyTrades(chatId: string) {
  const { data } = await botSupabase()
    .from("ime_bot_trades")
    .select("*")
    .eq("chat_id", chatId)
    .eq("status", "JOINED")
    .order("created_at", { ascending: false })
    .limit(10);
  const trades = (data ?? []) as unknown as BotTrade[];
  if (!trades.length) {
    await sendTelegramMessage(
      chatId,
      "ما عندك صفقات مفتوحة حالياً. لما توصلك فرصة دخول اضغط «✅ انضممت للصفقة» وأتابعها لك.",
      MAIN_MENU
    );
    return;
  }
  const lines = trades.map((t) => {
    const dir = t.action === "AGGRESSIVE_ENTRY" ? "🚀" : "✅";
    const idea = t.option_idea;
    const contract = idea ? `\nالعقد: <code>${t.symbol} ${idea.expiry} ${idea.strike} ${idea.type}</code>` : "";
    const last = t.last_price !== null ? ` | آخر سعر <code>${t.last_price}</code>` : "";
    return (
      `${dir} <b>${t.symbol}</b> — ${HORIZON_LABELS[(t.horizon as HorizonKey) ?? "DAY"] ?? t.horizon}\n` +
      `دخول <code>${t.entry}</code> | وقف <code>${t.stop}</code> | هدف <code>${t.target}</code>${last}${contract}`
    );
  });
  await sendTelegramMessage(chatId, `📋 <b>صفقاتك المفتوحة</b>\n\n${lines.join("\n\n━━━━━━\n\n")}`, MAIN_MENU);
}

async function patchTrade(id: string, patch: Record<string, unknown>) {
  await botSupabase()
    .from("ime_bot_trades")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id);
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
    if (data.startsWith("mute:")) {
      const opt = data.slice(5);
      if (opt === "off") {
        await patchUser(chatId, { muted_until: null });
        await sendTelegramMessage(chatId, "🔔 تم إلغاء الكتم، التنبيهات شغالة.", MAIN_MENU);
      } else {
        const hours = opt === "1h" ? 1 : opt === "4h" ? 4 : 24;
        const until = new Date(Date.now() + hours * 3_600_000).toISOString();
        await patchUser(chatId, { muted_until: until });
        await sendTelegramMessage(
          chatId,
          `🔇 تم كتم التنبيهات لمدة ${hours === 24 ? "يوم كامل" : hours === 4 ? "٤ ساعات" : "ساعة"}.`,
          MAIN_MENU
        );
      }
      return;
    }
    if (data.startsWith("conf:")) {
      const c = Math.min(95, Math.max(40, parseInt(data.slice(5), 10) || 62));
      await patchUser(chatId, { min_confidence: c });
      await sendTelegramMessage(
        chatId,
        `تم ✅ ما أرسل لك تنبيه إلا إذا درجة الثقة <b>${c}%</b> أو أكثر.`,
        MAIN_MENU
      );
      return;
    }
    if (data.startsWith("tj:") || data.startsWith("tl:")) {
      const id = data.slice(3);
      const joining = data.startsWith("tj:");
      const { data: trade } = await botSupabase()
        .from("ime_bot_trades")
        .select("*")
        .eq("id", id)
        .eq("chat_id", chatId)
        .maybeSingle();
      if (!trade) {
        await sendTelegramMessage(chatId, "هذه الفرصة انتهت أو غير متاحة.", MAIN_MENU);
        return;
      }
      if (trade.status !== "SENT" && trade.status !== "JOINED" && trade.status !== "DECLINED") {
        await sendTelegramMessage(chatId, "هذه الصفقة أُغلقت بالفعل.", MAIN_MENU);
        return;
      }
      await patchTrade(id, { status: joining ? "JOINED" : "DECLINED" });
      await sendTelegramMessage(
        chatId,
        joining
          ? `✅ سجّلت انضمامك لصفقة <b>${trade.symbol}</b>.\nبتابعها لك وأرسل لك تحديث عند تحقق الهدف <code>${trade.target}</code> أو كسر الوقف <code>${trade.stop}</code>.\nتابعها من «📋 صفقاتي».`
          : `تم، ما انضممت لصفقة <b>${trade.symbol}</b> — لن أتابعها لك.`,
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
          "اختر مدة الصفقة:\n• <b>سكالب</b> — دقائق، أهداف صغيرة سريعة.\n• <b>ساعة</b> — صفقة جلسة قصيرة.\n• <b>٤-٥ ساعات</b> — لحد إغلاق الجلسة.\n• <b>يومية</b> — دخول وخروج في نفس اليوم.\n• <b>أسبوعية</b> — أهداف أوسع وعقود لأسبوع.\n• <b>شهرية</b> — عقود أبعد وأهداف أكبر.",
          HORIZON_MENU
        );
        return;
      case "act:focus":
        await sendTelegramMessage(chatId, "وش تحب أحلل لك؟", FOCUS_MENU);
        return;
      case "act:alerts":
        await sendTelegramMessage(
          chatId,
          "🔔 <b>إعدادات التنبيهات</b>\nفعّل/أوقف التنبيهات، اكتمها مؤقتاً، أو ارفع حد الثقة عشان توصلك أقوى الفرص فقط:",
          alertsMenu(user)
        );
        return;
      case "act:trades":
        await sendMyTrades(chatId);
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
        await patchUser(chatId, { subscribed: next, ...(next ? { muted_until: null } : {}) });
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
  if (text.startsWith("/trades")) {
    await sendMyTrades(chatId);
    return;
  }
  if (text.startsWith("/help")) {
    await sendTelegramMessage(
      chatId,
      [
        "الأوامر:",
        "/start القائمة",
        "/market تحليل السوق",
        "/news الأخبار",
        "/trades صفقاتك المفتوحة",
        "أو أرسل رمز السهم مباشرة",
      ].join("\n"),
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
      await sendTelegramMessage(
        chatId,
        "تعذر جلب سعر حقيقي لهذا الرمز الآن. لن أرسل أي سعر تقديري — جرّب بعد قليل أو تأكد من الرمز.",
        MAIN_MENU
      );
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
    .select("chat_id, analysis_type, focus, horizon, subscribed, muted_until, min_confidence")
    .eq("subscribed", true);
  const rows = (users ?? []) as unknown as BotUser[];

  const cache = new Map<string, AnalysisOutcome>();
  const today = new Date().toISOString().slice(0, 10);
  const now = new Date();
  let sent = 0;

  for (const u of rows) {
    // Respect temporary mute.
    if (u.muted_until && new Date(u.muted_until) > now) continue;
    const minConf = u.min_confidence ?? 62;
    const symbols = symbolsForFocus(u.focus).slice(0, 10);
    const full = u.analysis_type === "FULL";
    const horizon = u.horizon ?? "DAY";

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
      // Only push high-conviction ideas automatically (per-user threshold).
      if (item.confidence < minConf) continue;

      // Don't repeat the same idea to the same user on the same day.
      const { error } = await sb.from("ime_bot_alerts").insert({
        chat_id: u.chat_id,
        symbol: s,
        action: item.action,
        horizon,
        day: today,
      });
      if (error) continue;

      // Record a trackable trade so the user can join with one tap.
      const { data: trade } = await sb
        .from("ime_bot_trades")
        .insert({
          chat_id: u.chat_id,
          symbol: s,
          action: item.action,
          horizon,
          option_idea: item.idea,
          entry: item.idea?.underlyingEntry ?? item.price,
          stop: item.idea?.underlyingStop ?? null,
          target: item.idea?.underlyingTarget ?? null,
          last_price: item.price,
          status: "SENT",
        })
        .select("id")
        .single();
      const tradeId = (trade as { id?: string } | null)?.id;
      const keyboard = tradeId
        ? {
            inline_keyboard: [
              [
                { text: "✅ انضممت للصفقة", callback_data: `tj:${tradeId}` },
                { text: "❌ ما انضممت", callback_data: `tl:${tradeId}` },
              ],
            ],
          }
        : undefined;

      const res = await sendTelegramMessage(
        u.chat_id,
        `🚨 <b>فرصة دخول — ${HORIZON_LABELS[(horizon as HorizonKey) ?? "DAY"] ?? horizon}</b>\n\n${item.text}\n\n<i>انضميت؟ اضغط الزر عشان أتابع الصفقة معك.</i>`,
        keyboard
      );
      if (res.ok) sent++;
    }
  }
  return { users: rows.length, sent };
}

/**
 * Follow up on trades users joined: notify when the target or stop is hit,
 * and expire trades that outlived their horizon window.
 */
export async function updateOpenTrades(): Promise<{ checked: number; closed: number }> {
  const sb = botSupabase();
  const { data } = await sb.from("ime_bot_trades").select("*").eq("status", "JOINED");
  const trades = (data ?? []) as unknown as BotTrade[];
  let closed = 0;

  for (const t of trades) {
    const h = horizonOf(t.horizon);
    // Expire trades older than the horizon window (min 1 day).
    const ageMs = Date.now() - new Date(t.created_at).getTime();
    const maxAgeMs = Math.max(1, h.maxDays) * 86_400_000;
    if (ageMs > maxAgeMs) {
      await patchTrade(t.id, { status: "EXPIRED" });
      closed++;
      await sendTelegramMessage(
        t.chat_id,
        `⌛️ انتهت مدة صفقة <b>${t.symbol}</b> (${HORIZON_LABELS[h.key]}) بدون تحقق الهدف أو الوقف — أُغلقت المتابعة.`
      );
      continue;
    }
    if (t.stop === null || t.target === null) continue;
    try {
      const { data: quote } = await getStockData(t.symbol);
      const price = quote.price;
      if (price === undefined) continue;
      const isCall = t.option_idea ? t.option_idea.type === "CALL" : true;
      const hitTarget = isCall ? price >= t.target : price <= t.target;
      const hitStop = isCall ? price <= t.stop : price >= t.stop;

      if (hitTarget) {
        await patchTrade(t.id, { status: "CLOSED_TARGET", last_price: price });
        closed++;
        const idea = t.option_idea;
        await sendTelegramMessage(
          t.chat_id,
          `🎯 <b>تحقق الهدف — ${t.symbol}</b>\nالسعر وصل <code>${price}</code> (الهدف <code>${t.target}</code>).` +
            (idea
              ? `\nالعقد <code>${t.symbol} ${idea.expiry} ${idea.strike} ${idea.type}</code> — سعره التقريبي عند الهدف <code>${idea.premiumTarget}</code> (دخلت بـ <code>${idea.premium}</code>).`
              : "") +
            `\n\n<i>فكّر بجني الربح — هذا تنبيه متابعة وليس توصية.</i>`,
          MAIN_MENU
        );
      } else if (hitStop) {
        await patchTrade(t.id, { status: "CLOSED_STOP", last_price: price });
        closed++;
        const idea = t.option_idea;
        await sendTelegramMessage(
          t.chat_id,
          `🛑 <b>ضرب الوقف — ${t.symbol}</b>\nالسعر وصل <code>${price}</code> (الوقف <code>${t.stop}</code>).` +
            (idea
              ? `\nوقف العقد التقريبي <code>${idea.premiumStop}</code>.`
              : "") +
            `\n\n<i>الانضباط أهم من الصفقة — أُغلقت المتابعة.</i>`,
          MAIN_MENU
        );
      } else {
        await patchTrade(t.id, { last_price: price });
      }
    } catch (e) {
      console.error(`trade update ${t.symbol} failed:`, e);
    }
  }
  return { checked: trades.length, closed };
}
