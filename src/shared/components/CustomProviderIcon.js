"use client";

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import PropTypes from "prop-types";
import {
  buildCustomProviderIconCandidates,
  cacheFallbackCustomProviderIcon,
  cacheResolvedCustomProviderIcon,
  getCachedCustomProviderIcon,
  getCompatibilityFallbackIconSrc,
  getCustomProviderIconCacheKey,
  getCustomProviderIconCacheVersion,
  subscribeCustomProviderIconCache,
} from "@/shared/utils/customProviderIcon";

/**
 * Domain favicon resolver for OpenAI/Anthropic compatible custom providers.
 * Browser loads candidates directly — no backend proxy.
 */
export default function CustomProviderIcon({
  completionBaseUrl,
  compatibility = "openai",
  apiType,
  alt = "",
  size = 32,
  className = "",
  fallbackText = "?",
  fallbackColor,
}) {
  const cacheKey = useMemo(
    () => getCustomProviderIconCacheKey(completionBaseUrl),
    [completionBaseUrl],
  );
  const candidates = useMemo(
    () => (cacheKey ? buildCustomProviderIconCandidates(completionBaseUrl) : []),
    [cacheKey, completionBaseUrl],
  );
  const fallbackSrc = useMemo(
    () => getCompatibilityFallbackIconSrc(compatibility, apiType),
    [compatibility, apiType],
  );

  useSyncExternalStore(subscribeCustomProviderIconCache, getCustomProviderIconCacheVersion);

  const cached = cacheKey ? getCachedCustomProviderIcon(cacheKey) : null;

  const [candidateIndex, setCandidateIndex] = useState(0);
  const [loadedSrc, setLoadedSrc] = useState(null);

  useEffect(() => {
    setCandidateIndex(0);
    setLoadedSrc(null);
  }, [cacheKey]);

  useEffect(() => {
    if (cached?.status === "resolved") {
      setLoadedSrc(cached.url);
    } else if (cached?.status === "fallback") {
      setLoadedSrc(null);
    }
  }, [cached, cacheKey]);

  const activeCandidate = candidates[candidateIndex] || null;
  const displaySrc = loadedSrc || (cached?.status === "resolved" ? cached.url : null)
    || (activeCandidate && cached?.status !== "fallback" ? activeCandidate : null);

  const showFallbackOnly = !displaySrc && (
    cached?.status === "fallback"
    || candidates.length === 0
    || candidateIndex >= candidates.length
  );

  const handleError = useCallback(() => {
    if (!cacheKey) return;

    const nextIndex = candidateIndex + 1;
    if (nextIndex < candidates.length) {
      setCandidateIndex(nextIndex);
      setLoadedSrc(null);
      return;
    }

    cacheFallbackCustomProviderIcon(cacheKey);
    setLoadedSrc(null);
  }, [cacheKey, candidateIndex, candidates.length]);

  const handleLoad = useCallback(() => {
    if (!cacheKey || !displaySrc) return;
    cacheResolvedCustomProviderIcon(cacheKey, displaySrc);
    setLoadedSrc(displaySrc);
  }, [cacheKey, displaySrc]);

  const boxStyle = {
    width: size,
    height: size,
    fontSize: Math.max(10, Math.floor(size * 0.38)),
  };

  if (showFallbackOnly) {
    return (
      <img
        src={fallbackSrc}
        alt={alt}
        width={size}
        height={size}
        className={className}
        loading="lazy"
        decoding="async"
        style={{ objectFit: "contain" }}
      />
    );
  }

  if (!displaySrc) {
    return (
      <img
        src={fallbackSrc}
        alt=""
        aria-hidden
        width={size}
        height={size}
        className={`opacity-40 ${className}`.trim()}
        style={{ objectFit: "contain" }}
      />
    );
  }

  return (
    <img
      key={displaySrc}
      src={displaySrc}
      alt={alt}
      width={size}
      height={size}
      className={className}
      loading="lazy"
      decoding="async"
      onLoad={handleLoad}
      onError={handleError}
      style={{ objectFit: "contain", transition: "opacity 150ms ease" }}
    />
  );
}

CustomProviderIcon.propTypes = {
  completionBaseUrl: PropTypes.string,
  compatibility: PropTypes.oneOf(["openai", "anthropic"]),
  apiType: PropTypes.oneOf(["chat", "responses"]),
  alt: PropTypes.string,
  size: PropTypes.number,
  className: PropTypes.string,
  fallbackText: PropTypes.string,
  fallbackColor: PropTypes.string,
};
