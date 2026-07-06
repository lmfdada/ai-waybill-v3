import { NextRequest, NextResponse } from "next/server";
import { currentUser, flushWrites, hydrateStore, makeId, runAtomic } from "@/lib/store";
import { resubmitTicket } from "@/lib/workflow";

export async function POST(request: NextRequest, context: RouteContext<"/api/tickets/[id]/resubmit">) {
  await hydrateStore();
  const user = currentUser(request.headers);
  const { id } = await context.params;
  const body = await request.json();
  const result = await runAtomic(() =>
    resubmitTicket({
      ticketId: id,
      actorId: user.id,
      actorRole: user.role,
      comment: String(body.comment || ""),
      expectedVersion: Number(body.expectedVersion || 0),
      operationKey: String(body.operationKey || makeId("resubmit")),
    })
  );

  await flushWrites();
  return NextResponse.json({ success: result.ok, message: result.message, data: result.ticket }, { status: result.ok ? 200 : 409 });
}
