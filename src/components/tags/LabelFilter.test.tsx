// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { I18nextProvider } from "react-i18next";
import { useState } from "react";

import i18n from "@/i18n";
import LabelFilter from "./LabelFilter";

const SOURCE_OPTIONS = [
  { slug: "prime-agent", label: "Prime-Agent" },
  { slug: "codex", label: "Codex" },
];

function SourceFilterHarness() {
  const [selectedSourceSlugs, setSelectedSourceSlugs] = useState([
    "prime-agent",
  ]);

  return (
    <I18nextProvider i18n={i18n}>
      <LabelFilter
        tags={[]}
        sessionTags={[]}
        filterTagIds={[]}
        onFilterChange={vi.fn()}
        sourceOptions={SOURCE_OPTIONS}
        selectedSourceSlugs={selectedSourceSlugs}
        onSourceFilterChange={setSelectedSourceSlugs}
        onCreateTag={vi.fn()}
        getDescendantIds={() => []}
      />
    </I18nextProvider>
  );
}

function openSourcesMenu() {
  fireEvent.click(screen.getByRole("button", { name: "Filter Chats" }));
  fireEvent.click(screen.getByRole("button", { name: /Sources/ }));
}

describe("LabelFilter source selector", () => {
  it("shows Prime-Agent as the selected checkbox and can add another harness", () => {
    render(<SourceFilterHarness />);

    openSourcesMenu();

    expect(
      screen
        .getByRole("menuitemcheckbox", { name: "Prime-Agent" })
        .getAttribute("aria-checked"),
    ).toBe("true");
    expect(
      screen
        .getByRole("menuitemcheckbox", { name: "All harnesses" })
        .getAttribute("aria-checked"),
    ).toBe("false");

    fireEvent.click(screen.getByRole("menuitemcheckbox", { name: "Codex" }));

    expect(
      screen
        .getByRole("menuitemcheckbox", { name: "Prime-Agent" })
        .getAttribute("aria-checked"),
    ).toBe("true");
    expect(
      screen
        .getByRole("menuitemcheckbox", { name: "Codex" })
        .getAttribute("aria-checked"),
    ).toBe("true");
  });

  it("offers an explicit all-harnesses choice", () => {
    render(<SourceFilterHarness />);

    openSourcesMenu();
    fireEvent.click(
      screen.getByRole("menuitemcheckbox", { name: "All harnesses" }),
    );

    expect(
      screen
        .getByRole("menuitemcheckbox", { name: "All harnesses" })
        .getAttribute("aria-checked"),
    ).toBe("true");
    expect(
      screen
        .getByRole("menuitemcheckbox", { name: "Prime-Agent" })
        .getAttribute("aria-checked"),
    ).toBe("false");
  });
});
