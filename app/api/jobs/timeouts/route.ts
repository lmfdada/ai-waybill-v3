import { NextRequest, NextResponse } from "next/server";
import { flushWrites, hydrateStore } from "@/lib/store";
import { processTimeouts } from "@/lib/workflow";

export async function POST(request: NextRequest) {
  await hydrateStore();
  const expected = process.env.V3_JOB_TOKEN || "dev-v3-job-token";
  const actual = request.headers.get("x-job-token") || "";
  if (actual !== expected) {
    return NextResponse.json({ success: false, message: "未授权的后台任务调用" }, { status: 401 });
  }

  const affected = processTimeouts();
  await flushWrites();
  return NextResponse.json({
    success: true,
    message: affected.length > 0 ? "超时工单已处理" : "暂无超时工单",
    data: { affected },
  });
}
