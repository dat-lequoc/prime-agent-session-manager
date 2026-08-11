import { describe, expect, it } from "vitest";

import {
  DEFAULT_SOURCE_FILTER_SLUGS,
  readInitialSourceFilterSlugs,
  SOURCE_FILTER_STORAGE_KEY,
  SOURCE_FILTER_VERSION,
  SOURCE_FILTER_VERSION_KEY,
} from "./sourceFilterPreferences";

function createStorage(values: Record<string, string> = {}) {
  return {
    getItem(key: string) {
      return values[key] ?? null;
    },
  };
}

describe("readInitialSourceFilterSlugs", () => {
  it("defaults fresh state to Prime-Agent sessions", () => {
    expect(readInitialSourceFilterSlugs(createStorage())).toEqual(
      DEFAULT_SOURCE_FILTER_SLUGS,
    );
  });

  it("migrates the previous implicit all-sources value to Prime-Agent", () => {
    expect(
      readInitialSourceFilterSlugs(
        createStorage({ [SOURCE_FILTER_STORAGE_KEY]: "[]" }),
      ),
    ).toEqual(DEFAULT_SOURCE_FILTER_SLUGS);
  });

  it("preserves an existing explicit source selection during migration", () => {
    expect(
      readInitialSourceFilterSlugs(
        createStorage({
          [SOURCE_FILTER_STORAGE_KEY]: '["codex","claude-code"]',
        }),
      ),
    ).toEqual(["codex", "claude-code"]);
  });

  it("preserves an explicit all-harnesses choice after migration", () => {
    expect(
      readInitialSourceFilterSlugs(
        createStorage({
          [SOURCE_FILTER_STORAGE_KEY]: "[]",
          [SOURCE_FILTER_VERSION_KEY]: SOURCE_FILTER_VERSION,
        }),
      ),
    ).toEqual([]);
  });

  it("falls back to Prime-Agent when stored data is malformed", () => {
    expect(
      readInitialSourceFilterSlugs(
        createStorage({ [SOURCE_FILTER_STORAGE_KEY]: "not-json" }),
      ),
    ).toEqual(DEFAULT_SOURCE_FILTER_SLUGS);
  });
});
