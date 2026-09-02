import { NextResponse } from "next/server";
import { getLanAddresses, getPrimaryLanAddress } from "@/lib/network/lanAddress.js";

export async function GET() {
  const addresses = getLanAddresses();
  const port = Number.parseInt(process.env.PORT || "20128", 10);
  return NextResponse.json({
    addresses,
    primary: getPrimaryLanAddress(),
    port: Number.isFinite(port) ? port : 20128,
  });
}
