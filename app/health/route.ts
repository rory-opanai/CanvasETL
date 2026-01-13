import { NextResponse } from "next/server";
import { getHealthPayload } from "@/lib/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RESPONSE_HEADERS = {
  "Cache-Control": "no-store"
};

export async function GET() {
  return NextResponse.json(getHealthPayload(), { headers: RESPONSE_HEADERS });
}
