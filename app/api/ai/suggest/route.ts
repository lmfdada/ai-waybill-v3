import { NextRequest, NextResponse } from "next/server";
import { suggestException } from "@/lib/ai-suggestion";
import { hydrateStore } from "@/lib/store";

export async function POST(request: NextRequest) {
  await hydrateStore();
  const body = await request.json();
  const text = String(body.text || body.description || "").trim();
  const amount = Number(body.amount || 0);
  if (!text) {
    return NextResponse.json({ success: false, message: "请提供异常描述" }, { status: 400 });
  }

  const suggestion = await suggestException({ text, amount });
  return NextResponse.json({
    success: true,
    disclaimer: "AI 建议仅供参考，需人工确认，不会自动执行。",
    data: suggestion,
  });
}
