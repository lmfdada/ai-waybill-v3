import { NextRequest, NextResponse } from "next/server";
import { db, flushWrites, hydrateStore, makeId, saveApprovalRule } from "@/lib/store";
import type { ApprovalRule } from "@/lib/types";

export async function GET() {
  await hydrateStore();
  return NextResponse.json({ success: true, data: db().approvalRules });
}

export async function POST(request: NextRequest) {
  await hydrateStore();
  const body = await request.json();
  const rule: ApprovalRule = {
    id: String(body.id || makeId("APV")),
    name: String(body.name || "未命名审批规则"),
    minAmount: Number(body.minAmount || 0),
    targetLevel: body.targetLevel === "level2" ? "level2" : "level1",
    timeoutHours: Number(body.timeoutHours || 8),
    maxResubmitCount: Number(body.maxResubmitCount || 2),
    enabled: body.enabled !== false,
  };
  saveApprovalRule(rule);
  await flushWrites();
  return NextResponse.json({ success: true, data: rule });
}
