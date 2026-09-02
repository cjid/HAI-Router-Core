/**
 * Cursor AgentService (agent.v1) protobuf helpers — google.protobuf.Value,
 * MCP tool defs/args/results. Used by cursor executor and unit tests.
 */
import { encodeField, encodeVarint, decodeMessage, decodeField, decodeVarint } from "./cursorProtobuf.js";

const WIRE = { VARINT: 0, FIXED64: 1, LEN: 2 };
const VALUE_FIELD = { NULL: 1, NUMBER: 2, STRING: 3, BOOL: 4, STRUCT: 5, LIST: 6 };
const MCP_PROVIDER = "9router";

function concatBytes(...parts) {
  const length = parts.reduce((total, part) => total + part.length, 0);
  const result = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}

function encodeFixed64Field(fieldNum, doubleValue) {
  const tag = encodeVarint((fieldNum << 3) | WIRE.FIXED64);
  const buf = Buffer.alloc(8);
  buf.writeDoubleLE(Number(doubleValue));
  return concatBytes(tag, new Uint8Array(buf));
}

function encodeStructValue(obj) {
  const entries = Object.entries(obj || {}).map(([key, val]) => {
    const entry = concatBytes(
      encodeField(1, WIRE.LEN, key),
      encodeField(2, WIRE.LEN, encodeAgentValue(val)),
    );
    return encodeField(1, WIRE.LEN, entry);
  });
  return encodeField(VALUE_FIELD.STRUCT, WIRE.LEN, concatBytes(...entries));
}

function encodeListValue(arr) {
  const items = (arr || []).map((item) => encodeField(1, WIRE.LEN, encodeAgentValue(item)));
  return encodeField(VALUE_FIELD.LIST, WIRE.LEN, concatBytes(...items));
}

export function encodeAgentValue(value) {
  if (value === null || value === undefined) {
    return encodeField(VALUE_FIELD.NULL, WIRE.VARINT, 0);
  }
  if (typeof value === "boolean") {
    return encodeField(VALUE_FIELD.BOOL, WIRE.VARINT, value ? 1 : 0);
  }
  if (typeof value === "string") {
    return encodeField(VALUE_FIELD.STRING, WIRE.LEN, value);
  }
  if (typeof value === "number") {
    return encodeFixed64Field(VALUE_FIELD.NUMBER, value);
  }
  if (Array.isArray(value)) {
    return encodeListValue(value);
  }
  if (typeof value === "object") {
    return encodeStructValue(value);
  }
  return encodeField(VALUE_FIELD.NULL, WIRE.VARINT, 0);
}

function readDouble(buffer) {
  return Buffer.from(buffer).readDoubleLE(0);
}

export function decodeAgentValue(data) {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  const msg = decodeMessage(bytes);
  if (msg.has(VALUE_FIELD.NULL)) return null;
  if (msg.has(VALUE_FIELD.NUMBER)) return readDouble(msg.get(VALUE_FIELD.NUMBER)[0].value);
  if (msg.has(VALUE_FIELD.STRING)) {
    return Buffer.from(msg.get(VALUE_FIELD.STRING)[0].value).toString("utf8");
  }
  if (msg.has(VALUE_FIELD.BOOL)) return msg.get(VALUE_FIELD.BOOL)[0].value !== 0;
  if (msg.has(VALUE_FIELD.STRUCT)) {
    const out = {};
    const struct = decodeMessage(msg.get(VALUE_FIELD.STRUCT)[0].value);
    for (const entry of struct.get(1) || []) {
      const decoded = decodeMessage(entry.value);
      const key = Buffer.from(decoded.get(1)[0].value).toString("utf8");
      out[key] = decodeAgentValue(decoded.get(2)[0].value);
    }
    return out;
  }
  if (msg.has(VALUE_FIELD.LIST)) {
    const list = decodeMessage(msg.get(VALUE_FIELD.LIST)[0].value);
    return (list.get(1) || []).map((item) => decodeAgentValue(item.value));
  }
  return null;
}

function normalizeTool(tool) {
  const fn = tool?.function || tool;
  return {
    name: fn?.name || tool?.name || "",
    description: fn?.description || tool?.description || "",
    schema: fn?.parameters || tool?.inputSchema || tool?.parameters || { type: "object" },
  };
}

export function encodeMcpToolDefinition(tool) {
  const { name, description, schema } = normalizeTool(tool);
  return concatBytes(
    ...(name ? [encodeField(1, WIRE.LEN, name)] : []),
    ...(description ? [encodeField(2, WIRE.LEN, description)] : []),
    encodeField(3, WIRE.LEN, encodeAgentValue(schema)),
    encodeField(4, WIRE.LEN, MCP_PROVIDER),
    ...(name ? [encodeField(5, WIRE.LEN, name)] : []),
  );
}

export function encodeMcpTools(tools = []) {
  if (!tools?.length) return new Uint8Array(0);
  return concatBytes(...tools.map((tool) => encodeField(1, WIRE.LEN, encodeMcpToolDefinition(tool))));
}

export function decodeMcpArgs(data) {
  const msg = decodeMessage(data instanceof Uint8Array ? data : new Uint8Array(data));
  const args = {};
  for (const entry of msg.get(2) || []) {
    const decoded = decodeMessage(entry.value);
    const key = Buffer.from(decoded.get(1)[0].value).toString("utf8");
    args[key] = decodeAgentValue(decoded.get(2)[0].value);
  }
  return {
    name: msg.has(1) ? Buffer.from(msg.get(1)[0].value).toString("utf8") : "",
    toolCallId: msg.has(3) ? Buffer.from(msg.get(3)[0].value).toString("utf8") : "",
    toolName: msg.has(5) ? Buffer.from(msg.get(5)[0].value).toString("utf8") : "",
    args,
  };
}

function encodeTextContentItem(text) {
  const textContent = encodeField(1, WIRE.LEN, text);
  const item = encodeField(1, WIRE.LEN, textContent);
  return encodeField(1, WIRE.LEN, item);
}

function encodeImageContentItem({ data, mimeType }) {
  const img = concatBytes(
    encodeField(1, WIRE.LEN, data instanceof Uint8Array ? data : new Uint8Array(data)),
    encodeField(2, WIRE.LEN, mimeType || "application/octet-stream"),
  );
  const item = encodeField(2, WIRE.LEN, img);
  return encodeField(1, WIRE.LEN, item);
}

export function encodeMcpResultSuccess({ textItems = [], imageItems = [], isError = false } = {}) {
  const content = [
    ...textItems.map((text) => encodeTextContentItem(text)),
    ...imageItems.map((img) => encodeImageContentItem(img)),
  ];
  const success = concatBytes(
    ...content,
    encodeField(2, WIRE.VARINT, isError ? 1 : 0),
  );
  return encodeField(1, WIRE.LEN, success);
}

export function encodeMcpResultError(message) {
  const err = encodeField(1, WIRE.LEN, message);
  return encodeField(2, WIRE.LEN, err);
}

export function encodeMcpResultToolNotFound(toolName) {
  const tnf = encodeField(1, WIRE.LEN, toolName);
  return encodeField(5, WIRE.LEN, tnf);
}
