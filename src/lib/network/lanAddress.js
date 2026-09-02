import os from "os";
import { VIRTUAL_IFACE_REGEX } from "@/lib/tunnel/shared/watchdogConfig.js";

/**
 * Non-loopback IPv4 addresses on physical-ish interfaces (skip VPN/tunnel/docker).
 * @returns {{ interface: string, address: string }[]}
 */
export function getLanAddresses() {
  const out = [];
  for (const [name, addrs] of Object.entries(os.networkInterfaces())) {
    if (!addrs || VIRTUAL_IFACE_REGEX.test(name)) continue;
    for (const addr of addrs) {
      const family = addr.family;
      const isV4 = family === "IPv4" || family === 4;
      if (isV4 && !addr.internal) {
        out.push({ interface: name, address: addr.address });
      }
    }
  }
  return out.sort((a, b) => a.interface.localeCompare(b.interface));
}

/** Primary LAN IPv4 for display (first after sort). */
export function getPrimaryLanAddress() {
  return getLanAddresses()[0]?.address || null;
}
