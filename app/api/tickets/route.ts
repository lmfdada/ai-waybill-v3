import { NextRequest, NextResponse } from "next/server";
import { currentUser, db, flushWrites, hydrateStore, runAtomic } from "@/lib/store";
import { getWaybillFromV2 } from "@/lib/v2-client";
import { createManualTicket } from "@/lib/workflow";
import type { ExceptionTicket } from "@/lib/types";

export async function GET(request: NextRequest) {
  await hydrateStore();
  const { searchParams } = request.nextUrl;
  const status = searchParams.get("status");
  const type = searchParams.get("type");
  const waybillNo = searchParams.get("waybillNo");
  const page = Math.max(1, Number(searchParams.get("page") || 1));
  const pageSize = Math.min(100, Math.max(10, Number(searchParams.get("pageSize") || 20)));

  let items = [...db().tickets];
  if (status) items = items.filter((ticket) => ticket.status === status);
  if (type) items = items.filter((ticket) => ticket.type === type);
  if (waybillNo) items = items.filter((ticket) => ticket.waybillNo.includes(waybillNo));
  const total = items.length;
  items = items.slice((page - 1) * pageSize, page * pageSize);

  return NextResponse.json({ success: true, data: { items, total, page, pageSize } });
}

export async function POST(request: NextRequest) {
  await hydrateStore();
  const user = currentUser(request.headers);
  const body = await request.json();
  const waybillNo = String(body.waybillNo || "").trim();
  const type = String(body.type || "lost") as ExceptionTicket["type"];
  const amount = Number(body.amount || 0);
  const description = String(body.description || "").trim();

  if (!waybillNo || !description) {
    return NextResponse.json({ success: false, message: "请填写运单号和异常描述" }, { status: 400 });
  }

  const result = await getWaybillFromV2(waybillNo);
  if (!result.data) {
    return NextResponse.json({ success: false, message: "V2 校验失败：运单不存在", requestId: result.requestId }, { status: 404 });
  }

  if (result.data.warehouseId !== user.warehouseId || result.data.merchantId !== user.merchantId) {
    return NextResponse.json({ success: false, message: "无权对其他仓库/商户的运单发起异常" }, { status: 403 });
  }

  const snapshot = result.data;
  const created = await runAtomic(() => createManualTicket({
    snapshot,
    type,
    amount: amount || snapshot.amount,
    description,
    reporterId: user.id,
  }));

  await flushWrites();
  return NextResponse.json({
    success: created.created,
    message: created.created ? "工单已创建" : "同运单同类型存在未关闭工单",
    data: { ticket: created.ticket, requestId: result.requestId, warning: result.warning },
  }, { status: created.created ? 200 : 409 });
}
