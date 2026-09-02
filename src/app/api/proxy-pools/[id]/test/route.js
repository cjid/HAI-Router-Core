import { NextResponse } from "next/server";
import { getProxyPoolById, updateProxyPool } from "@/models";
import { testProxyPoolEntry } from "@/lib/network/proxyPoolTest";

// POST /api/proxy-pools/[id]/test - Test proxy pool entry
export async function POST(request, { params }) {
  try {
    const { id } = await params;
    const proxyPool = await getProxyPoolById(id);

    if (!proxyPool) {
      return NextResponse.json({ error: "Proxy pool not found" }, { status: 404 });
    }

    const result = await testProxyPoolEntry({ proxyPool });
    const now = result.testedAt || new Date().toISOString();

    await updateProxyPool(id, {
      testStatus: result.ok ? "active" : "error",
      lastTestedAt: now,
      lastTestOk: result.ok,
      lastLatencyMs: result.latencyMs,
      lastTestStatusCode: result.statusCode,
      lastError: result.ok ? null : (result.errorMessage || "Proxy test failed"),
    });

    return NextResponse.json({
      ok: result.ok,
      proxyId: result.proxyId,
      proxyType: result.proxyType,
      testedAt: now,
      latencyMs: result.latencyMs,
      statusCode: result.statusCode,
      egressMode: result.egressMode,
      errorCode: result.errorCode,
      errorMessage: result.errorMessage,
      requestId: result.requestId,
      connectMs: result.connectMs,
      elapsedMs: result.elapsedMs,
      failedAfterMs: result.failedAfterMs,
      // backward compat
      status: result.statusCode,
      error: result.errorMessage,
    });
  } catch (error) {
    console.log("Error testing proxy pool:", error);
    return NextResponse.json({ error: "Failed to test proxy pool" }, { status: 500 });
  }
}
