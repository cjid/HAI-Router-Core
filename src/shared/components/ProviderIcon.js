"use client";

import { useState } from "react";
import PropTypes from "prop-types";
import CustomProviderIcon from "@/shared/components/CustomProviderIcon";
import { getProviderIconSrc, markProviderIconMissing } from "@/shared/utils/providerIcon";
import { resolveCustomProviderCompatibility } from "@/shared/utils/customProviderIcon";

function resolveSrc(src, providerId) {
  if (providerId) return getProviderIconSrc(providerId);
  if (!src) return null;
  const m = String(src).match(/^\/providers\/([^/]+)\.png$/i);
  if (m) return getProviderIconSrc(m[1]);
  return src;
}

export default function ProviderIcon({
  src,
  providerId,
  completionBaseUrl,
  compatibility,
  apiType,
  alt,
  size = 32,
  className = "",
  fallbackText = "?",
  fallbackColor,
}) {
  const resolvedCompatibility = compatibility
    || (providerId ? resolveCustomProviderCompatibility(providerId) : null);

  if (completionBaseUrl && resolvedCompatibility) {
    return (
      <CustomProviderIcon
        completionBaseUrl={completionBaseUrl}
        compatibility={resolvedCompatibility}
        apiType={apiType}
        alt={alt}
        size={size}
        className={className}
        fallbackText={fallbackText}
        fallbackColor={fallbackColor}
      />
    );
  }

  const effectiveSrc = resolveSrc(src, providerId);
  const [errored, setErrored] = useState(false);

  if (!effectiveSrc || errored) {
    return (
      <span
        className={`inline-flex items-center justify-center font-bold rounded-lg ${className}`.trim()}
        style={{
          width: size,
          height: size,
          color: fallbackColor,
          fontSize: Math.max(10, Math.floor(size * 0.38)),
        }}
      >
        {fallbackText}
      </span>
    );
  }

  return (
    <img
      src={effectiveSrc}
      alt={alt}
      width={size}
      height={size}
      className={className}
      loading="lazy"
      decoding="async"
      onError={() => {
        const m = effectiveSrc.match(/^\/providers\/([^/]+)\.png$/i);
        if (m) markProviderIconMissing(m[1]);
        if (providerId) markProviderIconMissing(providerId);
        setErrored(true);
      }}
    />
  );
}

ProviderIcon.propTypes = {
  src: PropTypes.string,
  providerId: PropTypes.string,
  completionBaseUrl: PropTypes.string,
  compatibility: PropTypes.oneOf(["openai", "anthropic"]),
  apiType: PropTypes.oneOf(["chat", "responses"]),
  alt: PropTypes.string,
  size: PropTypes.number,
  className: PropTypes.string,
  fallbackText: PropTypes.string,
  fallbackColor: PropTypes.string,
};
