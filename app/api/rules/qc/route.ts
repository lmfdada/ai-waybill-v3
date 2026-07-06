import { NextRequest, NextResponse } from "next/server";
import { db, flushWrites, hydrateStore, makeId, saveQcRule } from "@/lib/store";
import type { QcRule } from "@/lib/types";

export async function GET() {
  await hydrateStore();
  return NextResponse.json({ success: true, data: db().qcRules });
}

export async function POST(request: NextRequest) {
  await hydrateStore();
  const body = await request.json();
  const rule: QcRule = {
    id: String(body.id || makeId("QC")),
    name: String(body.name || "未命名品控规则"),
    subtype: body.subtype || "quantity_mismatch",
    severity: body.severity || "medium",
    conditionType: body.conditionType || "quantity_delta_percent",
    threshold: Number(body.threshold || 0),
    autoCreateTicket: body.autoCreateTicket !== false,
    approvalEntry: body.approvalEntry === "level1" ? "level1" : "level2",
    enabled: body.enabled !== false,
  };
  saveQcRule(rule);
  await flushWrites();
  return NextResponse.json({ success: true, data: rule });
}
