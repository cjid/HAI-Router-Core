import net from "node:net";
import tls from "node:tls";

/**
 * Whether outbound traffic should use proxy-aware transports instead of direct egress.
 */
export function isProxyConfigured(proxyOptions) {
  if (!proxyOptions) return false;
  return proxyOptions.enabled === true
    || proxyOptions.connectionProxyEnabled === true
    || !!proxyOptions.vercelRelayUrl;
}

function normalizeProxyUrl(raw) {
  const value = String(raw || "").trim();
  if (!value) return null;
  return value.includes("://") ? value : `http://${value}`;
}

/**
 * Open a TLS socket to targetHost:443 via an HTTP CONNECT proxy tunnel.
 */
export function connectTlsViaHttpProxy(proxyUrl, targetHost, targetPort = 443) {
  const proxy = new URL(normalizeProxyUrl(proxyUrl));
  const proxyPort = Number(proxy.port) || (proxy.protocol === "https:" ? 443 : 80);
  const proxyHost = proxy.hostname;

  return new Promise((resolve, reject) => {
    const socket = net.connect(proxyPort, proxyHost);
    let settled = false;

    const fail = (error) => {
      if (settled) return;
      settled = true;
      try { socket.destroy(); } catch {}
      reject(error);
    };

    socket.once("error", fail);

    socket.once("connect", () => {
      let auth = "";
      if (proxy.username) {
        const user = decodeURIComponent(proxy.username);
        const pass = decodeURIComponent(proxy.password || "");
        auth = `Proxy-Authorization: Basic ${Buffer.from(`${user}:${pass}`).toString("base64")}\r\n`;
      }
      socket.write(
        `CONNECT ${targetHost}:${targetPort} HTTP/1.1\r\n` +
        `Host: ${targetHost}:${targetPort}\r\n` +
        auth +
        "\r\n",
      );
    });

    let headerBuf = "";
    const onData = (chunk) => {
      headerBuf += chunk.toString("latin1");
      if (!headerBuf.includes("\r\n\r\n")) return;
      socket.off("data", onData);
      const statusLine = headerBuf.split("\r\n")[0] || "";
      if (!/^HTTP\/1\.[01] 200/.test(statusLine)) {
        fail(new Error(`Proxy CONNECT failed: ${statusLine.trim() || "unknown status"}`));
        return;
      }
      if (settled) return;
      settled = true;
      const tlsSocket = tls.connect({
        socket,
        servername: targetHost,
        ALPNProtocols: ["h2", "http/1.1"],
      });
      tlsSocket.once("error", fail);
      tlsSocket.once("secureConnect", () => resolve(tlsSocket));
    };

    socket.on("data", onData);
  });
}

/**
 * Create an HTTP/2 client session, optionally via connection proxy CONNECT tunnel.
 * @param {string} authority - host[:port] used for :authority (e.g. api2.cursor.sh)
 * @param {object|null} proxyOptions - from buildProxyOptions / buildProxyOptionsFromCredentials
 * @returns {import("http2").ClientHttp2Session}
 */
export async function connectHttp2Client(authority, proxyOptions = null) {
  const http2 = await import("http2");
  const hostname = String(authority || "").split(":")[0];
  if (!hostname) throw new Error("HTTP/2 connect requires a hostname");

  const proxyUrl = proxyOptions?.connectionProxyEnabled && proxyOptions?.connectionProxyUrl
    ? proxyOptions.connectionProxyUrl
    : null;

  if (proxyUrl) {
    const tlsSocket = await connectTlsViaHttpProxy(proxyUrl, hostname);
    return http2.connect(`https://${authority}`, {
      createConnection: () => tlsSocket,
    });
  }

  return http2.connect(`https://${authority}`);
}
