import { NextResponse } from "next/server";
import {
  getProviderSafetySnapshot,
  listProviderSafetyOptions,
  resetProviderSafetyLimit,
  updateProviderSafetyLimit,
} from "@/lib/goEngine/providerSafety.js";

export const dynamic = "force-dynamic";

function errorResponse(error, fallbackStatus = 500) {
  return NextResponse.json(
    { error: error.message, code: error.code || null },
    { status: error.status || fallbackStatus },
  );
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const providerId = String(searchParams.get("providerId") || "").trim();
    const providers = listProviderSafetyOptions();

    if (!providerId) {
      if (providers.length === 0) {
        return NextResponse.json({ providers: [] });
      }
      const first = providers[0].providerId;
      const snapshot = await getProviderSafetySnapshot(first);
      return NextResponse.json({ providers, ...snapshot, selectedProviderId: first });
    }

    const snapshot = await getProviderSafetySnapshot(providerId);
    return NextResponse.json({ providers, ...snapshot });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const providerId = String(body.providerId || "").trim();
    const action = String(body.action || "save").toLowerCase();

    if (!providerId) {
      return NextResponse.json({ error: "providerId is required", code: "invalid_provider" }, { status: 400 });
    }

    let snapshot;
    if (action === "reset") {
      snapshot = await resetProviderSafetyLimit(providerId);
    } else {
      if (body.providerMax == null) {
        return NextResponse.json({ error: "providerMax is required", code: "invalid_provider_max" }, { status: 400 });
      }
      snapshot = await updateProviderSafetyLimit(providerId, body.providerMax);
    }

    const providers = listProviderSafetyOptions();
    return NextResponse.json({ success: true, providers, ...snapshot });
  } catch (error) {
    return errorResponse(error);
  }
}
