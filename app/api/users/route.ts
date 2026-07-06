import { NextRequest, NextResponse } from "next/server";
import { db, flushWrites, hydrateStore, saveUser } from "@/lib/store";
import type { UserAccount, UserRole } from "@/lib/types";

const roles: UserRole[] = ["operator", "qc_supervisor", "level1_approver", "level2_approver", "admin"];

export async function GET() {
  await hydrateStore();
  return NextResponse.json({ success: true, data: db().users });
}

export async function POST(request: NextRequest) {
  await hydrateStore();
  const body = await request.json();
  const role = roles.includes(body.role) ? body.role : "operator";
  const user: UserAccount = {
    id: String(body.id || "").trim(),
    name: String(body.name || "").trim(),
    role,
    enabled: body.enabled !== false,
    warehouseId: String(body.warehouseId || "WH-HN"),
    merchantId: String(body.merchantId || "M-ZTOCC"),
  };

  if (!user.id || !user.name) {
    return NextResponse.json({ success: false, message: "用户 ID 和名称不能为空" }, { status: 400 });
  }

  saveUser(user);
  await flushWrites();
  return NextResponse.json({ success: true, data: user });
}
