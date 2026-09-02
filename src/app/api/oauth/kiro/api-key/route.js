import { NextResponse } from "next/server";
import { KiroService } from "@/lib/oauth/services/kiro";
import { createProviderConnection } from "@/models";
import { attachOAuthProxyPoolId, resolveOAuthProxyOptions } from "@/lib/network/connectionProxy.js";
import { runWithOAuthProxy } from "@/lib/oauth/proxyContext.js";

/**
 * POST /api/oauth/kiro/api-key
 * Import a Kiro API key (headless auth). The key is a long-lived bearer
 * credential — there is no refresh token. It is validated against the Amazon
 * Q model catalog, then stored with authMethod="api_key".
 */
export async function POST(request) {
  try {
    const body = await request.json();
    const { apiKey, region, proxyPoolId } = body;
    const proxyOptions = await resolveOAuthProxyOptions(proxyPoolId);

    if (!apiKey || typeof apiKey !== "string" || !apiKey.trim()) {
      return NextResponse.json(
        { error: "API key is required" },
        { status: 400 }
      );
    }

    return await runWithOAuthProxy(proxyOptions, async () => {
      const kiroService = new KiroService();
      const credential = await kiroService.validateApiKey(apiKey, region || "us-east-1");
      const email = kiroService.extractEmailFromJWT(credential.accessToken);

      const connection = await createProviderConnection(attachOAuthProxyPoolId({
        provider: "kiro",
        authType: "api_key",
        accessToken: credential.accessToken,
        refreshToken: null,
        expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
        email: email || null,
        providerSpecificData: {
          ...(credential.profileArn ? { profileArn: credential.profileArn } : {}),
          region: credential.region,
          authMethod: "api_key",
          provider: "API Key",
        },
        testStatus: "active",
      }, proxyPoolId));

      return NextResponse.json({
        success: true,
        connection: {
          id: connection.id,
          provider: connection.provider,
          email: connection.email,
        },
      });
    });
  } catch (error) {
    console.log("Kiro API key import error:", error);
    return NextResponse.json(
      { error: "API key validation failed" },
      { status: 500 }
    );
  }
}
