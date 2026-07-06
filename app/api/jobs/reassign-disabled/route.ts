import { NextRequest, NextResponse } from "next/server";
import { flushWrites, hydrateStore, runAtomic } from "@/lib/store";
import { reassignDisabledApprovals } from "@/lib/workflow";

export async function POST(request: NextRequest) {
  await hydrateStore();
  const expected = process.env.V3_JOB_TOKEN || "dev-v3-job-token";
  const actual = request.headers.get("x-job-token") || "";
  if (actual !== expected) {
    return NextResponse.json({ success: false, message: "未授权的后台任务调用" }, { status: 401 });
  }

  const affected = await runAtomic(() => reassignDisabledApprovals());
  await flushWrites();
  return NextResponse.json({
    success: true,
    message: affected.length > 0 ? "禁用审批人工单已转交" : "暂无需要转交的工单",
    data: { affected },
  });
}
