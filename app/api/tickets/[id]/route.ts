import { NextRequest, NextResponse } from "next/server";
import { db, flushWrites, hydrateStore } from "@/lib/store";
import { getWaybillFromV2 } from "@/lib/v2-client";

export async function GET(_request: NextRequest, context: RouteContext<"/api/tickets/[id]">) {
  await hydrateStore();
  const { id } = await context.params;
  const ticket = db().tickets.find((item) => item.id === id);
  if (!ticket) {
    return NextResponse.json({ success: false, message: "工单不存在" }, { status: 404 });
  }

  const waybillResult = await getWaybillFromV2(ticket.waybillNo);
  await flushWrites();
  const approvals = db().approvals.filter((item) => item.ticketId === id);
  const scans = db().scans.filter((item) => item.ticketId === id);
  const compensations = db().compensations.filter((item) => item.ticketId === id);
  const inventory = db().inventory.filter((item) => item.ticketId === id);
  const inventoryLocks = db().inventoryLocks.filter((item) => item.ticketId === id);

  return NextResponse.json({
    success: true,
    data: {
      ticket,
      waybill: waybillResult.data,
      waybillSource: waybillResult.source,
      waybillWarning: waybillResult.warning || "",
      requestId: waybillResult.requestId,
      approvals,
      scans,
      compensations,
      inventory,
      inventoryLocks,
    },
  });
}
