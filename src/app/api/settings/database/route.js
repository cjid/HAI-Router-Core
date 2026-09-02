import { NextResponse } from "next/server";
import { exportDb, getSettings, importDb } from "@/lib/localDb";
import { applyOutboundProxyEnv } from "@/lib/network/outboundProxy";
import { verifyDashboardPassword } from "@/lib/auth/dashboardSession";
import { wrapBackupExport, unwrapBackupImport } from "@/lib/db/backupFormat.js";

const CLI_TOKEN_HEADER = "x-9r-cli-token";
const PASSWORD_HEADER = "x-9r-password";

function isCliRequest(request) {
  return Boolean(request.headers.get(CLI_TOKEN_HEADER));
}

export async function GET(request) {
  try {
    if (!isCliRequest(request) && !(await verifyDashboardPassword(request.headers.get(PASSWORD_HEADER)))) {
      return NextResponse.json({ error: "Invalid password" }, { status: 401 });
    }
    console.info("[BACKUP] backup_export_started");
    const data = await exportDb();
    const payload = wrapBackupExport(data);
    console.info("[BACKUP] backup_export_succeeded");
    return NextResponse.json(payload);
  } catch (error) {
    console.error("[BACKUP] backup_export_failed", error?.message || error);
    return NextResponse.json({ error: "Failed to export database" }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { password, ...rawPayload } = body;
    if (!isCliRequest(request) && !(await verifyDashboardPassword(password))) {
      return NextResponse.json({ error: "Invalid password" }, { status: 401 });
    }

    console.info("[BACKUP] backup_import_started");
    const { data, meta } = unwrapBackupImport(rawPayload);
    if (meta.legacy) {
      console.info("[BACKUP] legacy_backup_migrated product=", meta.product);
    }

    await importDb(data);

    try {
      const settings = await getSettings();
      applyOutboundProxyEnv(settings);
    } catch (err) {
      console.warn("[Settings][DatabaseImport] Failed to re-apply outbound proxy env:", err);
    }

    console.info("[BACKUP] backup_import_succeeded");
    return NextResponse.json({ success: true, legacy: meta.legacy || false });
  } catch (error) {
    console.error("[BACKUP] backup_import_failed", error?.message || error);
    return NextResponse.json(
      { error: error?.message || "Failed to import database" },
      { status: 400 },
    );
  }
}
