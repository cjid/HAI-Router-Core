"use client";

import PropTypes from "prop-types";
import { useState } from "react";
import { Select } from "@/shared/components";

export const NONE_PROXY_POOL_VALUE = "__none__";

export function resolveOAuthProxyPoolId(proxyPoolId) {
  if (!proxyPoolId || proxyPoolId === NONE_PROXY_POOL_VALUE) return null;
  return proxyPoolId;
}

/** Body fragment: `{ proxyPoolId }` when a pool is selected, else `{}`. */
export function oauthProxyPoolPayload(proxyPoolId) {
  const resolved = resolveOAuthProxyPoolId(proxyPoolId);
  return resolved ? { proxyPoolId: resolved } : {};
}

export function useOAuthProxyPool(initial = NONE_PROXY_POOL_VALUE) {
  const [proxyPoolId, setProxyPoolId] = useState(initial);
  return {
    proxyPoolId,
    setProxyPoolId,
    resolvedProxyPoolId: resolveOAuthProxyPoolId(proxyPoolId),
    proxyPoolPayload: oauthProxyPoolPayload(proxyPoolId),
  };
}

export default function OAuthProxyPoolSelect({ proxyPools, value, onChange }) {
  const pools = (proxyPools || []).filter((p) => p.isActive !== false);
  if (!pools.length) return null;

  return (
    <Select
      label="Egress proxy pool"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      options={[
        { value: NONE_PROXY_POOL_VALUE, label: "None" },
        ...pools.map((pool) => ({ value: pool.id, label: pool.name })),
      ]}
    />
  );
}

OAuthProxyPoolSelect.propTypes = {
  proxyPools: PropTypes.array,
  value: PropTypes.string.isRequired,
  onChange: PropTypes.func.isRequired,
};
