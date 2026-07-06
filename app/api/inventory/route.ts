import { NextResponse } from "next/server";
import { db, hydrateStore } from "@/lib/store";

export async function GET() {
  await hydrateStore();
  return NextResponse.json({
    success: true,
    data: {
      batches: db().inventoryBatches,
      locks: db().inventoryLocks,
      records: db().inventory,
    },
  });
}
