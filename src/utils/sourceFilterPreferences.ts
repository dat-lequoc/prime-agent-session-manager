export const SOURCE_FILTER_STORAGE_KEY = "psm-source-filter-slugs";
export const SOURCE_FILTER_VERSION_KEY = "psm-source-filter-version";
export const SOURCE_FILTER_VERSION = "1";
export const DEFAULT_SOURCE_FILTER_SLUGS = ["prime-agent"] as const;

type SourceFilterStorage = Pick<Storage, "getItem">;

function parseStoredSourceFilter(raw: string | null): string[] | null {
  if (!raw) return null;

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;

    return Array.from(
      new Set(
        parsed.filter(
          (value): value is string =>
            typeof value === "string" && value.trim().length > 0,
        ),
      ),
    );
  } catch {
    return null;
  }
}

/**
 * Prime Agent is the default display scope. The version marker lets an
 * explicit "all harnesses" choice (stored as []) survive future reloads while
 * migrating the previous implicit empty/default value to Prime-only once.
 */
export function readInitialSourceFilterSlugs(
  storage: SourceFilterStorage | null,
): string[] {
  if (!storage) return [...DEFAULT_SOURCE_FILTER_SLUGS];

  const stored = parseStoredSourceFilter(
    storage.getItem(SOURCE_FILTER_STORAGE_KEY),
  );
  const isCurrentVersion =
    storage.getItem(SOURCE_FILTER_VERSION_KEY) === SOURCE_FILTER_VERSION;

  if (isCurrentVersion && stored) return stored;
  if (stored && stored.length > 0) return stored;

  return [...DEFAULT_SOURCE_FILTER_SLUGS];
}
