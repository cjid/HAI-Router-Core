/**
 * Normalized search for model/provider picker — case-insensitive, whitespace-collapsed.
 */
export function normalizeSearchText(text) {
  return String(text || "")
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, "");
}

function scoreField(normalizedQuery, field, weights) {
  const normalizedField = normalizeSearchText(field);
  if (!normalizedField || !normalizedQuery) return 0;
  if (normalizedField === normalizedQuery) return weights.exact;
  if (normalizedField.startsWith(normalizedQuery)) return weights.prefix;
  if (normalizedField.includes(normalizedQuery)) return weights.substring;
  return 0;
}

export function scoreModelEntry(model, group, query) {
  const q = normalizeSearchText(query);
  if (!q) return { match: true, score: 0, providerMatch: false };

  const modelScores = [
    scoreField(q, model.value, { exact: 110, prefix: 95, substring: 80 }),
    scoreField(q, model.name, { exact: 100, prefix: 90, substring: 75 }),
    scoreField(q, model.id, { exact: 105, prefix: 88, substring: 70 }),
    scoreField(q, model.meta?.displayName, { exact: 98, prefix: 85, substring: 72 }),
  ];
  const modelScore = Math.max(0, ...modelScores);

  const providerScores = [
    scoreField(q, group.name, { exact: 60, prefix: 55, substring: 45 }),
    scoreField(q, group.alias, { exact: 58, prefix: 52, substring: 42 }),
    scoreField(q, group.providerId, { exact: 56, prefix: 50, substring: 40 }),
  ];
  const providerScore = Math.max(0, ...providerScores);
  const providerMatch = providerScore > 0;

  if (providerMatch && modelScore === 0) {
    return { match: true, score: providerScore, providerMatch: true };
  }

  return {
    match: modelScore > 0 || providerMatch,
    score: Math.max(modelScore, providerScore),
    providerMatch,
  };
}

/**
 * Filter grouped models for picker display.
 * Provider-name match → include all active models in that group.
 */
export function filterModelPickerGroups(groupedModels, query, { addedModelValues = [] } = {}) {
  const q = normalizeSearchText(query);

  const sortModels = (models) => {
    const added = models
      .filter((m) => addedModelValues.includes(m.value))
      .sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    const rest = models
      .filter((m) => !addedModelValues.includes(m.value))
      .sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    return [...added, ...rest];
  };

  if (!q) {
    return Object.entries(groupedModels).map(([providerId, group]) => ({
      providerId,
      group,
      models: sortModels(group.models),
      providerMatch: false,
      empty: group.models.length === 0,
    }));
  }

  const results = [];

  for (const [providerId, group] of Object.entries(groupedModels)) {
    const scored = group.models.map((model) => ({
      model,
      ...scoreModelEntry(model, group, query),
    }));

    const providerMatch = scored.some((s) => s.providerMatch);
    const matching = providerMatch
      ? scored.map((s) => ({ ...s, match: true, score: Math.max(s.score, 1) }))
      : scored.filter((s) => s.match);

    if (!providerMatch && matching.length === 0) continue;

    results.push({
      providerId,
      group,
      models: sortModels(matching.map((s) => s.model)),
      providerMatch,
      empty: group.models.length === 0,
      matchCount: matching.length,
    });
  }

  results.sort((a, b) => {
    if (a.providerMatch !== b.providerMatch) return a.providerMatch ? -1 : 1;
    return (a.group.name || "").localeCompare(b.group.name || "");
  });

  return results;
}

export function activeModelCountLabel(count, { searching = false, matchCount } = {}) {
  if (searching && matchCount != null) {
    return matchCount === 1 ? "1 matching model" : `${matchCount} matching models`;
  }
  if (count === 1) return "1 active model";
  return `${count} active models`;
}
