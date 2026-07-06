import { NextRequest, NextResponse } from "next/server";
import { currentUser, flushWrites, hydrateStore, runAtomic } from "@/lib/store";
import { fastRelease } from "@/lib/workflow";

export async function POST(request: NextRequest, context: RouteContext<"/api/tickets/[id]/fast-release">) {
  await hydrateStore();
  const user = currentUser(request.headers);
  const { id } = await context.params;
  const body = await request.json();
  const reason = String(body.reason || "").trim();
  if (!reason) {
    return NextResponse.json({ success: false, message: "请填写复核原因" }, { status: 400 });
  }
  const result = await runAtomic(() => fastRelease(id, user.id, user.role, reason));
  await flushWrites();
  return NextResponse.json({ success: result.ok, message: result.message, data: result.ticket }, { status: result.ok ? 200 : 403 });
}
