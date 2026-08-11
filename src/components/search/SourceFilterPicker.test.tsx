// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { I18nextProvider } from "react-i18next";
import { describe, expect, it } from "vitest";

import i18n from "@/i18n";
import SourceFilterPicker from "./SourceFilterPicker";

const SOURCE_OPTIONS = [
  { slug: "prime-agent", label: "Prime-Agent" },
  { slug: "codex", label: "Codex" },
];

function Harness() {
  const [selected, setSelected] = useState(["prime-agent"]);
  return (
    <I18nextProvider i18n={i18n}>
      <SourceFilterPicker
        sourceOptions={SOURCE_OPTIONS}
        selectedSourceSlugs={selected}
        onSourceFilterChange={setSelected}
      />
    </I18nextProvider>
  );
}

describe("SourceFilterPicker", () => {
  it("shows the current harness directly and allows adding another", () => {
    render(<Harness />);

    fireEvent.click(screen.getByRole("button", { name: /Harness filter: Prime-Agent/ }));
    expect(
      screen.getByRole("menuitemcheckbox", { name: "Prime-Agent" }).getAttribute("aria-checked"),
    ).toBe("true");

    fireEvent.click(screen.getByRole("menuitemcheckbox", { name: "Codex" }));

    expect(screen.getByRole("button", { name: /Harness filter: 2 selected/ })).toBeTruthy();
    expect(
      screen.getByRole("menuitemcheckbox", { name: "Codex" }).getAttribute("aria-checked"),
    ).toBe("true");
  });

  it("offers an explicit all-harnesses choice", () => {
    render(<Harness />);

    fireEvent.click(screen.getByRole("button", { name: /Harness filter: Prime-Agent/ }));
    fireEvent.click(screen.getByRole("menuitemcheckbox", { name: "All harnesses" }));

    expect(screen.getByRole("button", { name: /Harness filter: All harnesses/ })).toBeTruthy();
  });
});
