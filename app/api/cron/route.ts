import { NextRequest, NextResponse } from "next/server";
import { flushWrites, hydrateStore, runAtomic } from "@/lib/store";
import { processTimeouts, reassignDisabledApprovals } from "@/lib/workflow";

export async function GET(request: NextRequest) {
  await hydrateStore();
  const expected = process.env.V3_JOB_TOKEN || "dev-v3-job-token";
  const actual = request.headers.get("x-job-token") || request.nextUrl.searchParams.get("token") || "";
  const isVercelCron =
    request.headers.get("user-agent") === "vercel-cron/1.0" &&
    Boolean(request.headers.get("x-vercel-cron-schedule"));
  if (actual !== expected && !isVercelCron) {
    return NextResponse.json({ success: false, message: "未授权的 Cron 调用" }, { status: 401 });
  }

  const { timeoutAffected, reassigned } = await runAtomic(() => ({
    timeoutAffected: processTimeouts(),
    reassigned: reassignDisabledApprovals("vercel-cron"),
  }));
  await flushWrites();

  return NextResponse.json({
    success: true,
    message: "Cron 已执行",
    data: {
      timeoutAffected,
      reassigned,
      ranAt: new Date().toISOString(),
    },
  });
}
