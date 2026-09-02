import { NextResponse } from "next/server";
import { getUsageOverview } from "@/lib/usageDb";

const VALID_PERIODS = new Set(["all", "today", "24h", "7d", "30d", "60d"]);

export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const period = searchParams.get("period") || "all";
    const apiKeyId = searchParams.get("apiKeyId") || null;

    if (!VALID_PERIODS.has(period)) {
      return NextResponse.json({ error: "Invalid period" }, { status: 400 });
    }

    const overview = await getUsageOverview(period, { apiKeyId });
    return NextResponse.json(overview);
  } catch (error) {
    console.error("[API] Failed to get usage overview:", error);
    return NextResponse.json({ error: "Failed to fetch usage overview" }, { status: 500 });
  }
}
