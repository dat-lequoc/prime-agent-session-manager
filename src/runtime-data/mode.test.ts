import { beforeEach, describe, expect, it, vi } from "vitest";

const getRuntimeModeMock = vi.fn();
const isStandaloneDatasetRuntimeMock = vi.fn();

vi.mock("./runtimeMode", () => ({
  getRuntimeMode: () => getRuntimeModeMock(),
}));

vi.mock("@/browser-dataset", () => ({
  isStandaloneDatasetRuntime: () => isStandaloneDatasetRuntimeMock(),
}));

import { shouldSkipOnboardingForRuntime } from "./mode";

describe("shouldSkipOnboardingForRuntime", () => {
  beforeEach(() => {
    getRuntimeModeMock.mockReset();
    isStandaloneDatasetRuntimeMock.mockReset();
    getRuntimeModeMock.mockReturnValue("backend");
    isStandaloneDatasetRuntimeMock.mockReturnValue(false);
  });

  it.each(["true", "1"])(
    "skips onboarding for public read-only build value %s",
    (value) => {
      expect(
        shouldSkipOnboardingForRuntime({ VITE_PUBLIC_READ_ONLY: value }),
      ).toBe(true);
    },
  );

  it("keeps onboarding for a normal writable backend build", () => {
    expect(shouldSkipOnboardingForRuntime({})).toBe(false);
  });

  it("continues to skip onboarding in demo and dataset runtimes", () => {
    getRuntimeModeMock.mockReturnValue("demo");
    expect(shouldSkipOnboardingForRuntime({})).toBe(true);

    getRuntimeModeMock.mockReturnValue("backend");
    isStandaloneDatasetRuntimeMock.mockReturnValue(true);
    expect(shouldSkipOnboardingForRuntime({})).toBe(true);
  });
});
