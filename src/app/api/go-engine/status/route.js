import { NextResponse } from "next/server";
import { getGoEngineManager } from "@/lib/goEngine/goEngineManager.js";
import { isGoEngineEnabled } from "@/lib/goEngine/workerManager.js";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const mgr = getGoEngineManager();
    const status = await mgr.getStatus();
    return NextResponse.json({
      ...status,
      canonical: isGoEngineEnabled(),
    });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
