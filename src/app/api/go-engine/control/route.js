import { NextResponse } from "next/server";
import { getGoEngineManager } from "@/lib/goEngine/goEngineManager.js";

export const dynamic = "force-dynamic";

const ALLOWED = new Set(["start", "stop", "pause", "resume", "restart", "add-worker", "remove-worker"]);

function errorResponse(error, fallbackStatus = 500) {
  return NextResponse.json(
    { error: error.message, code: error.code || null },
    { status: error.status || fallbackStatus },
  );
}

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const action = String(body.action || "").toLowerCase();
    if (!ALLOWED.has(action)) {
      return NextResponse.json({ error: "Invalid action", allowed: [...ALLOWED] }, { status: 400 });
    }

    const mgr = getGoEngineManager();
    let status;
    switch (action) {
      case "start":
        status = await mgr.start({ manual: true });
        break;
      case "stop":
        status = await mgr.stop({ manual: true });
        break;
      case "pause":
        status = await mgr.pause();
        break;
      case "resume":
        status = await mgr.resume();
        break;
      case "restart":
        status = await mgr.restartWorkers();
        break;
      case "add-worker":
        status = await mgr.addWorker();
        break;
      case "remove-worker": {
        const workerId = String(body.workerId || "").trim();
        if (!workerId) {
          return NextResponse.json({ error: "workerId is required", code: "invalid_worker_id" }, { status: 400 });
        }
        status = await mgr.removeWorker(workerId);
        break;
      }
      default:
        status = await mgr.getStatus();
    }

    return NextResponse.json({ success: true, action, ...status });
  } catch (error) {
    return errorResponse(error);
  }
}
