/**
 * Serialize fetch BodyInit for Go Engine ExecutionSpec (string body field).
 * Must preserve wire semantics — never JSON.stringify URLSearchParams or unknown objects.
 */

function headerLookup(headers, name) {
  if (!headers) return "";
  if (headers instanceof Headers) return headers.get(name) || "";
  if (Array.isArray(headers)) {
    const lower = name.toLowerCase();
    for (const [k, v] of headers) {
      if (String(k).toLowerCase() === lower) return v;
    }
    return "";
  }
  if (typeof headers === "object") {
    const lower = name.toLowerCase();
    for (const [k, v] of Object.entries(headers)) {
      if (String(k).toLowerCase() === lower) return v;
    }
  }
  return "";
}

export function serializeBodyForGoTransport(body, headers) {
  if (body == null) return "";

  if (typeof body === "string") return body;

  if (typeof URLSearchParams !== "undefined" && body instanceof URLSearchParams) {
    return body.toString();
  }

  if (typeof Buffer !== "undefined" && Buffer.isBuffer(body)) {
    return body.toString("utf8");
  }

  if (body instanceof Uint8Array) {
    return Buffer.from(body).toString("utf8");
  }

  if (body instanceof ArrayBuffer) {
    return Buffer.from(body).toString("utf8");
  }

  if (typeof FormData !== "undefined" && body instanceof FormData) {
    const err = new Error("[GoTransport] FormData bodies are not supported across Go IPC");
    err.code = "unsupported_body";
    throw err;
  }

  if (typeof Blob !== "undefined" && body instanceof Blob) {
    const err = new Error("[GoTransport] Blob bodies are not supported across Go IPC");
    err.code = "unsupported_body";
    throw err;
  }

  if (typeof body === "object") {
    const ct = headerLookup(headers, "content-type");
    const err = new Error(
      `[GoTransport] Plain object bodies are not supported (${ct || "no content-type"}); pass string or URLSearchParams`
    );
    err.code = "unsupported_body";
    throw err;
  }

  return String(body);
}
