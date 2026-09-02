import { NextResponse } from "next/server";
import { createProviderConnection } from "@/models";
import { attachOAuthProxyPoolId, resolveOAuthProxyOptions } from "@/lib/network/connectionProxy.js";
import { runWithOAuthProxy } from "@/lib/oauth/proxyContext.js";
import { oauthFetch } from "@/lib/oauth/fetch.js";

const GITLAB_DEFAULT_BASE = "https://gitlab.com";

/**
 * POST /api/oauth/gitlab/pat
 * Authenticate GitLab Duo with a Personal Access Token (PAT)
 */
export async function POST(request) {
  try {
    let body;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const { token, baseUrl, proxyPoolId } = body;
    if (!token?.trim()) {
      return NextResponse.json({ error: "Personal Access Token is required" }, { status: 400 });
    }

    const base = (baseUrl?.trim() || GITLAB_DEFAULT_BASE).replace(/\/$/, "");
    const proxyOptions = await resolveOAuthProxyOptions(proxyPoolId);

    return await runWithOAuthProxy(proxyOptions, async () => {
      const userRes = await oauthFetch(`${base}/api/v4/user`, {
        headers: { "Private-Token": token.trim(), Accept: "application/json" },
      });

      if (!userRes.ok) {
        const err = await userRes.text();
        return NextResponse.json({ error: `GitLab token verification failed: ${err}` }, { status: 401 });
      }

      const user = await userRes.json();
      const email = user.email || user.public_email || "";

      await createProviderConnection(attachOAuthProxyPoolId({
        provider: "gitlab",
        authType: "oauth",
        accessToken: token.trim(),
        refreshToken: null,
        expiresAt: null,
        email,
        displayName: user.name || user.username || email,
        testStatus: "active",
        providerSpecificData: {
          username: user.username || "",
          email,
          name: user.name || "",
          baseUrl: base,
          authKind: "personal_access_token",
        },
      }, proxyPoolId));

      return NextResponse.json({ success: true });
    });
  } catch (error) {
    console.error("GitLab PAT auth error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
