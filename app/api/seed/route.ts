import { NextResponse } from "next/server";
import { db, flushWrites, hydrateStore, seedManyTickets } from "@/lib/store";

export async function POST() {
  await hydrateStore();
  seedManyTickets(220);
  await flushWrites();
  return NextResponse.json({ success: true, data: { ticketCount: db().tickets.length } });
}
