import { NextResponse } from "next/server";
import { getDisplayDbPath, getDataDir, getLegacyDataDir, CANONICAL_APP_NAME } from "@/lib/dataDir.js";

export async function GET() {
  return NextResponse.json({
    dataDir: getDataDir(),
    displayDbPath: getDisplayDbPath(),
    canonicalAppName: CANONICAL_APP_NAME,
    legacyDataDir: getLegacyDataDir(),
  });
}
