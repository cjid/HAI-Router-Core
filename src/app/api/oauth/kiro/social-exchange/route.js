import { NextResponse } from "next/server";
import { KiroService } from "@/lib/oauth/services/kiro";
import { createProviderConnection } from "@/models";
import { attachOAuthProxyPoolId, resolveOAuthProxyOptions } from "@/lib/network/connectionProxy.js";
import { runWithOAuthProxy } from "@/lib/oauth/proxyContext.js";

/**
 * POST /api/oauth/kiro/social-exchange
 * Exchange authorization code for tokens (Google/GitHub social login)
 * Callback URL will be in format: kiro://kiro.kiroAgent/authenticate-success?code=XXX&state=YYY
 */
export async function POST(request) {
  try {
    const body = await request.json();
    const { code, codeVerifier, provider, proxyPoolId } = body;
    const proxyOptions = await resolveOAuthProxyOptions(proxyPoolId);

    if (!code || !codeVerifier) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    if (!provider || !["google", "github"].includes(provider)) {
      return NextResponse.json(
        { error: "Invalid provider" },
        { status: 400 }
      );
    }

    return await runWithOAuthProxy(proxyOptions, async () => {
      const kiroService = new KiroService();
      const tokenData = await kiroService.exchangeSocialCode(code, codeVerifier);
      const email = kiroService.extractEmailFromJWT(tokenData.accessToken);

      const connection = await createProviderConnection(attachOAuthProxyPoolId({
        provider: "kiro",
        authType: "oauth",
        accessToken: tokenData.accessToken,
        refreshToken: tokenData.refreshToken,
        expiresAt: new Date(Date.now() + tokenData.expiresIn * 1000).toISOString(),
        email: email || null,
        providerSpecificData: {
          profileArn: tokenData.profileArn,
          authMethod: provider,
          provider: provider.charAt(0).toUpperCase() + provider.slice(1),
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
    console.log("Kiro social exchange error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
