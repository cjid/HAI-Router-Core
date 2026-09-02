import { NextResponse } from "next/server";
import { getProviderConnectionById } from "@/models";
import { deleteCatalogForConnection, loadProviderModelCatalog } from "@/lib/db/repos/providerModelCatalogRepo.js";
import { refreshCatalogRowPricing } from "@/shared/utils/modelCatalog.js";
/**
 * GET /api/providers/[id]/model-catalog — persisted discovery cache (no provider fetch).
 */
export async function GET(_request, { params }) {
  try {
    const { id } = await params;
    const connection = await getProviderConnectionById(id);
    if (!connection) {
      return NextResponse.json({ error: "Connection not found" }, { status: 404 });
    }

    const catalog = await loadProviderModelCatalog(connection);
    console.info(`[PROVIDER] event=model_catalog_loaded provider=${connection.provider} connection=${connection.id} models=${catalog?.modelCount ?? 0}`);

    if (!catalog) {
      return NextResponse.json({
        provider: connection.provider,
        connectionId: connection.id,
        models: [],
        syncStatus: "never",
        lastSyncAt: null,
      });
    }

    return NextResponse.json({
      provider: connection.provider,
      connectionId: connection.id,
      catalogKey: catalog.catalogKey,
      models: (catalog.models || []).map((row) => refreshCatalogRowPricing(row, connection.provider)),
      enrichment: catalog.enrichment,
      syncStatus: catalog.syncStatus,
      lastSyncAt: catalog.lastSyncAt,
      lastError: catalog.lastError,
      requestId: catalog.requestId,
      modelCount: catalog.modelCount,
      updatedAt: catalog.updatedAt,
    });
  } catch (error) {
    console.error("[PROVIDER] event=model_catalog_loaded error=", error?.message || error);
    return NextResponse.json({ error: error.message || "Failed to load model catalog" }, { status: 500 });
  }
}

/**
 * DELETE /api/providers/[id]/model-catalog — drop fetched catalog only (not configuration).
 */
export async function DELETE(_request, { params }) {
  try {
    const { id } = await params;
    const connection = await getProviderConnectionById(id);
    if (!connection) {
      return NextResponse.json({ error: "Connection not found" }, { status: 404 });
    }

    await deleteCatalogForConnection(connection);
    console.info(`[PROVIDER] event=model_catalog_reset provider=${connection.provider} connection=${connection.id}`);

    return NextResponse.json({
      ok: true,
      provider: connection.provider,
      connectionId: connection.id,
      models: [],
      syncStatus: "never",
      lastSyncAt: null,
      modelCount: 0,
    });
  } catch (error) {
    console.error("[PROVIDER] event=model_catalog_reset error=", error?.message || error);
    return NextResponse.json({ error: error.message || "Failed to reset model catalog" }, { status: 500 });
  }
}
