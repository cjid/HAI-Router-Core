import { NextResponse } from "next/server";
import {
  getProviderConnections,
  updateProviderConnection,
  setProviderEnabled,
} from "@/models";

export const dynamic = "force-dynamic";

/** Persist provider-level enabled flag and sync all connections for that provider. */
export async function PUT(request) {
  try {
    const body = await request.json();
    const { providerId, isEnabled } = body || {};

    if (!providerId || typeof providerId !== "string") {
      return NextResponse.json({ error: "providerId is required" }, { status: 400 });
    }
    if (typeof isEnabled !== "boolean") {
      return NextResponse.json({ error: "isEnabled must be a boolean" }, { status: 400 });
    }

    const state = await setProviderEnabled(providerId, isEnabled);

    const connections = await getProviderConnections({ provider: providerId });
    await Promise.allSettled(
      connections.map((c) => updateProviderConnection(c.id, { isActive: isEnabled })),
    );

    return NextResponse.json(state);
  } catch (error) {
    console.error("[API] Failed to update provider state:", error);
    return NextResponse.json({ error: "Failed to update provider state" }, { status: 500 });
  }
}
