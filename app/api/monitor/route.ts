import { NextResponse } from "next/server";
import { db, hydrateStore } from "@/lib/store";

export async function GET() {
  await hydrateStore();
  const logs = db().syncLogs.slice(0, 20);
  const total = db().syncLogs.length;
  const success = db().syncLogs.filter((log) => log.success).length;
  return NextResponse.json({
    success: true,
    data: {
      latestSyncAt: logs[0]?.createdAt || null,
      successRate: total ? Math.round((success / total) * 100) : 100,
      logs,
      ticketCount: db().tickets.length,
      openQualityTickets: db().tickets.filter((ticket) => ticket.category === "quality" && !["completed", "closed"].includes(ticket.status)).length,
    },
  });
}
