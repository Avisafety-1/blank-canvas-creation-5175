export interface DroneCatalogIdentity {
  name: string;
}

function normalizeDroneModelName(value: string): string {
  return value
    .toLowerCase()
    .replace(/\bdji\b|\bautel\b|\bparrot\b|\bskydio\b|\byuneec\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function pickBestDroneCatalogMatch<T extends DroneCatalogIdentity>(
  models: T[],
  fleetModelName: string
): T | null {
  const normalizedFleetName = normalizeDroneModelName(fleetModelName);
  if (!normalizedFleetName) return null;

  const exact = models.find((model) => normalizeDroneModelName(model.name) === normalizedFleetName);
  if (exact) return exact;

  const candidates = models
    .map((model) => {
      const normalizedCatalogName = normalizeDroneModelName(model.name);
      const catalogTokens = normalizedCatalogName.split(" ").filter(Boolean);
      const fleetTokens = normalizedFleetName.split(" ").filter(Boolean);
      const sharedTokens = catalogTokens.filter((token) => fleetTokens.includes(token)).length;
      const contains = normalizedCatalogName.includes(normalizedFleetName) || normalizedFleetName.includes(normalizedCatalogName);
      return {
        model,
        score: (contains ? 100 : 0) + sharedTokens * 10 - Math.abs(catalogTokens.length - fleetTokens.length),
      };
    })
    .filter((candidate) => candidate.score >= 18)
    .sort((a, b) => b.score - a.score);

  return candidates[0]?.model ?? null;
}