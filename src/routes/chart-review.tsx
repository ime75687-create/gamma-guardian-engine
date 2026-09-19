import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { reviewChart } from "@/lib/ime/chart-review.functions";

export const Route = createFileRoute("/chart-review")({
  component: ChartReview,
  head: () => ({
    meta: [
      { title: "مراجعة مخاطر الشارت | IME" },
      {
        name: "description",
        content:
          "ارفع صورة الشارت مع سياق السوق واحصل على ملخص مخاطر السكالب والمضاربة اليومية مع المستويات الحرجة.",
      },
      { property: "og:title", content: "مراجعة مخاطر الشارت | IME" },
      {
        property: "og:description",
        content: "تحليل مخاطر السكالب والمضاربة اليومية من صورة الشارت وسياق السوق.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function ChartReview() {
  const run = useServerFn(reviewChart);
  const fileRef = useRef<HTMLInputElement>(null);
  const [image, setImage] = useState<string | null>(null);
  const [symbol, setSymbol] = useState("");
  const [context, setContext] = useState("");
  const [summary, setSummary] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function onPick(file: File | undefined): void {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("الملف لازم يكون صورة");
      return;
    }
    if (file.size > 5_000_000) {
      toast.error("حجم الصورة كبير — أقل من 5 ميجا");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setImage(String(reader.result));
    reader.readAsDataURL(file);
  }

  async function submit(): Promise<void> {
    if (!image) {
      toast.error("ارفع صورة الشارت أولاً");
      return;
    }
    setLoading(true);
    setSummary(null);
    try {
      const res = await run({
        data: {
          image,
          ...(symbol.trim() ? { symbol: symbol.trim().toUpperCase() } : {}),
          ...(context.trim() ? { context: context.trim() } : {}),
        },
      });
      setSummary(res.summary);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذّر التحليل");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main dir="rtl" className="mx-auto max-w-3xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between gap-3">
        <h1 className="text-xl font-bold">مراجعة مخاطر الشارت</h1>
        <Link to="/" className="font-mono text-xs text-muted-foreground hover:text-foreground">
          ← اللوحة
        </Link>
      </div>

      <section className="rounded-xl border bg-card p-4">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="flex h-40 w-full items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground hover:border-primary hover:text-primary"
        >
          {image ? (
            <img src={image} alt="الشارت المرفوع" className="h-full w-auto rounded object-contain" />
          ) : (
            "اضغط لرفع صورة الشارت"
          )}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => onPick(e.target.files?.[0])}
        />

        <input
          value={symbol}
          onChange={(e) => setSymbol(e.target.value)}
          placeholder="الرمز (اختياري) مثل NVDA"
          className="mt-4 w-full rounded-lg border bg-background px-3 py-2 font-mono text-sm"
        />
        <textarea
          value={context}
          onChange={(e) => setContext(e.target.value)}
          rows={4}
          placeholder="سياق السوق: الأخبار، الجلسة، مستويات تراقبها، حجم المخاطرة..."
          className="mt-3 w-full rounded-lg border bg-background px-3 py-2 text-sm"
        />

        <button
          type="button"
          onClick={submit}
          disabled={loading}
          className="mt-4 w-full rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground disabled:opacity-50"
        >
          {loading ? "جاري التحليل..." : "حلّل المخاطر"}
        </button>
        <p className="mt-2 text-[11px] text-muted-foreground">
          التحليل تعليمي لقراءة المخاطر فقط، وليس توصية استثمارية.
        </p>
      </section>

      {summary && (
        <section className="mt-6 whitespace-pre-wrap rounded-xl border bg-card p-4 text-sm leading-relaxed">
          {summary}
        </section>
      )}
    </main>
  );
}
