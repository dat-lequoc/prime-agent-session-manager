// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SessionViewProvider } from "@/contexts/SessionViewContext";
import { SettingsProvider } from "@/contexts/SettingsContext";
import { registerBuiltinToolPlugins } from "@/plugins/tools-render";
import type { SessionEntry } from "@/types";
import TrajectoryInspector, { buildTrajectoryRows } from "./TrajectoryInspector";

function Providers({ children }: { children: ReactNode }) {
  return (
    <SettingsProvider>
      <SessionViewProvider>{children}</SessionViewProvider>
    </SettingsProvider>
  );
}

function message(id: string, role: string, text: string): SessionEntry {
  return {
    type: "message",
    id,
    timestamp: "2026-08-15T12:30:00.000Z",
    message: {
      role,
      content: [{ type: "text", text }],
    },
  };
}

const mixedAssistant: SessionEntry = {
  type: "message",
  id: "assistant-mixed",
  timestamp: "2026-08-15T12:31:00.000Z",
  message: {
    role: "assistant",
    content: [
      { type: "thinking", thinking: "Inspect the current route" },
      {
        type: "toolCall",
        id: "call-bash",
        name: "bash",
        arguments: { command: "pnpm test" },
      },
      { type: "text", text: "Everything passes." },
    ],
  },
};

const toolResult: SessionEntry = {
  type: "message",
  id: "tool-result-bash",
  timestamp: "2026-08-15T12:31:02.000Z",
  message: {
    role: "toolResult",
    toolCallId: "call-bash",
    content: [{ type: "text", text: "tests passed" }],
  },
};

describe("buildTrajectoryRows", () => {
  it("splits assistant reasoning, tools, and final text into dense turn rows", () => {
    const rows = buildTrajectoryRows(
      [
        message("user-1", "user", "Run the checks"),
        mixedAssistant,
        message("user-2", "user", "Ship it"),
      ],
      new Map([["call-bash", toolResult]]),
    );

    expect(rows.map((row) => row.kind)).toEqual([
      "user",
      "thinking",
      "tool",
      "assistant",
      "user",
    ]);
    expect(rows.map((row) => row.turn)).toEqual([1, 1, 1, 1, 2]);
    expect(rows.map((row) => row.turnStart)).toEqual([true, false, false, false, true]);
    expect(rows[2]?.summary).toBe("pnpm test");
    expect(rows[2]?.status).toBe("success");
    expect(rows[2]?.toolDisplay?.output).toBe("tests passed");
  });
});

describe("TrajectoryInspector", () => {
  beforeEach(() => {
    registerBuiltinToolPlugins();
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
    Element.prototype.scrollIntoView = vi.fn();
    HTMLElement.prototype.scrollTo = vi.fn(function (
      this: HTMLElement,
      options?: ScrollToOptions | number,
      y?: number,
    ) {
      const top = typeof options === "number" ? (y ?? 0) : options?.top;
      if (typeof top === "number") this.scrollTop = top;
      this.dispatchEvent(new Event("scroll"));
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("opens a click-selected tool in the right inspector with linked output", async () => {
    render(
      <Providers>
        <TrajectoryInspector
          entries={[message("user-1", "user", "Run the checks"), mixedAssistant]}
          toolResultByCallId={new Map([["call-bash", toolResult]])}
          searchQuery=""
          currentSearchTarget={null}
          streamingId={null}
          scrollTargetId={null}
          setScrollTargetId={vi.fn()}
          externalRevealTarget={null}
          onExternalRevealHandled={vi.fn()}
          hasNewMessages={false}
          setHasNewMessages={vi.fn()}
          isAtBottomRef={{ current: true }}
        />
      </Providers>,
    );

    fireEvent.click(screen.getByRole("button", { name: /Turn 1, bash, pnpm test/i }));

    const inspector = screen.getByRole("complementary", { name: "Event inspector" });
    expect(within(inspector).getByText("Turn 1 · call-bash")).toBeTruthy();
    await waitFor(() => {
      expect(inspector.textContent).toContain("tests passed");
    });
  });

  it("exposes the selected event as raw JSON without leaving the trajectory", () => {
    render(
      <Providers>
        <TrajectoryInspector
          entries={[message("user-1", "user", "Run the checks"), mixedAssistant]}
          toolResultByCallId={new Map([["call-bash", toolResult]])}
          searchQuery=""
          currentSearchTarget={null}
          streamingId={null}
          scrollTargetId={null}
          setScrollTargetId={vi.fn()}
          externalRevealTarget={null}
          onExternalRevealHandled={vi.fn()}
          hasNewMessages={false}
          setHasNewMessages={vi.fn()}
          isAtBottomRef={{ current: true }}
        />
      </Providers>,
    );

    fireEvent.click(screen.getByRole("button", { name: /Turn 1, user, Run the checks/i }));
    fireEvent.click(screen.getByRole("tab", { name: "Raw" }));

    const inspector = screen.getByRole("complementary", { name: "Event inspector" });
    expect(inspector.textContent).toContain('"id": "user-1"');
    expect(screen.getByText("Trajectory")).toBeTruthy();
  });

  it("selects the matching tool row when in-session search moves to tool output", async () => {
    render(
      <Providers>
        <TrajectoryInspector
          entries={[message("user-1", "user", "Run the checks"), mixedAssistant]}
          toolResultByCallId={new Map([["call-bash", toolResult]])}
          searchQuery="tests passed"
          currentSearchTarget={{
            rowEntryId: "assistant-mixed",
            matchElementId: "tool-result-call-bash",
            occurrenceIndexInElement: 0,
          }}
          streamingId={null}
          scrollTargetId={null}
          setScrollTargetId={vi.fn()}
          externalRevealTarget={null}
          onExternalRevealHandled={vi.fn()}
          hasNewMessages={false}
          setHasNewMessages={vi.fn()}
          isAtBottomRef={{ current: true }}
        />
      </Providers>,
    );

    const inspector = await screen.findByRole("complementary", {
      name: "Event inspector",
    });
    expect(inspector.textContent).toContain("Turn 1 · call-bash");
  });

  it("honors external tool reveals and acknowledges the selected tool row", async () => {
    const onExternalRevealHandled = vi.fn();
    render(
      <Providers>
        <TrajectoryInspector
          entries={[message("user-1", "user", "Run the checks"), mixedAssistant]}
          toolResultByCallId={new Map([["call-bash", toolResult]])}
          searchQuery=""
          currentSearchTarget={null}
          streamingId={null}
          scrollTargetId={null}
          setScrollTargetId={vi.fn()}
          externalRevealTarget={{
            rowEntryId: "assistant-mixed",
            targetEntryId: "tool-result-call-bash",
            expandTool: true,
            highlight: true,
            align: "start",
          }}
          onExternalRevealHandled={onExternalRevealHandled}
          hasNewMessages={false}
          setHasNewMessages={vi.fn()}
          isAtBottomRef={{ current: true }}
        />
      </Providers>,
    );

    const inspector = await screen.findByRole("complementary", {
      name: "Event inspector",
    });
    expect(inspector.textContent).toContain("Turn 1 · call-bash");
    expect(onExternalRevealHandled).toHaveBeenCalledTimes(1);
  });

  it("supports tab arrow keys and restores ledger focus when Escape closes details", async () => {
    render(
      <Providers>
        <TrajectoryInspector
          entries={[message("user-1", "user", "Run the checks"), mixedAssistant]}
          toolResultByCallId={new Map([["call-bash", toolResult]])}
          searchQuery=""
          currentSearchTarget={null}
          streamingId={null}
          scrollTargetId={null}
          setScrollTargetId={vi.fn()}
          externalRevealTarget={null}
          onExternalRevealHandled={vi.fn()}
          hasNewMessages={false}
          setHasNewMessages={vi.fn()}
          isAtBottomRef={{ current: true }}
        />
      </Providers>,
    );

    const row = screen.getByRole("button", { name: /Turn 1, bash, pnpm test/i });
    fireEvent.click(row);

    const overviewTab = screen.getByRole("tab", { name: "Overview" });
    const rawTab = screen.getByRole("tab", { name: "Raw" });
    overviewTab.focus();
    fireEvent.keyDown(overviewTab, { key: "ArrowRight" });

    expect(rawTab.getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement).toBe(rawTab);

    fireEvent.keyDown(
      screen.getByRole("complementary", { name: "Event inspector" }),
      { key: "Escape" },
    );

    await waitFor(() => {
      expect(screen.queryByRole("complementary", { name: "Event inspector" })).toBeNull();
      expect(document.activeElement).toBe(row);
    });
  });

  it("keeps the shared live-update scroll state in sync with the trajectory ledger", () => {
    const isAtBottomRef = { current: true };
    const setHasNewMessages = vi.fn();
    render(
      <Providers>
        <TrajectoryInspector
          entries={[message("user-1", "user", "Run the checks"), mixedAssistant]}
          toolResultByCallId={new Map([["call-bash", toolResult]])}
          searchQuery=""
          currentSearchTarget={null}
          streamingId={null}
          scrollTargetId={null}
          setScrollTargetId={vi.fn()}
          externalRevealTarget={null}
          onExternalRevealHandled={vi.fn()}
          hasNewMessages
          setHasNewMessages={setHasNewMessages}
          isAtBottomRef={isAtBottomRef}
        />
      </Providers>,
    );

    const ledger = screen.getByRole("list", { name: "Trajectory events" });
    Object.defineProperties(ledger, {
      clientHeight: { configurable: true, value: 200 },
      scrollHeight: { configurable: true, value: 1000 },
      scrollTop: { configurable: true, writable: true, value: 200 },
    });

    fireEvent.scroll(ledger);
    expect(isAtBottomRef.current).toBe(false);

    ledger.scrollTop = 800;
    fireEvent.scroll(ledger);
    expect(isAtBottomRef.current).toBe(true);
    expect(setHasNewMessages).toHaveBeenCalledWith(false);
  });

  it("virtualizes long trajectories while preserving list semantics and the full event count", () => {
    const entries = Array.from({ length: 600 }, (_, index) =>
      message(`user-${index}`, "user", `Prompt ${index}`),
    );

    render(
      <Providers>
        <TrajectoryInspector
          entries={entries}
          toolResultByCallId={new Map()}
          searchQuery=""
          currentSearchTarget={null}
          streamingId={null}
          scrollTargetId={null}
          setScrollTargetId={vi.fn()}
          externalRevealTarget={null}
          onExternalRevealHandled={vi.fn()}
          hasNewMessages={false}
          setHasNewMessages={vi.fn()}
          isAtBottomRef={{ current: true }}
        />
      </Providers>,
    );

    expect(screen.getByText(/600 turns · 600 events · 0 tools/)).toBeTruthy();
    const ledger = screen.getByRole("list", { name: "Trajectory events" });
    expect(within(ledger).getAllByRole("listitem").length).toBeGreaterThan(0);
    const renderedRows = document.querySelectorAll("[data-trajectory-row-id]");
    expect(renderedRows.length).toBeGreaterThan(0);
    expect(renderedRows.length).toBeLessThan(entries.length);
  });

  it("reveals and focuses an off-screen search match in a virtualized trajectory", async () => {
    const entries = Array.from({ length: 600 }, (_, index) =>
      message(`user-${index}`, "user", `Prompt ${index}`),
    );
    const baseProps = {
      entries,
      toolResultByCallId: new Map<string, SessionEntry>(),
      streamingId: null,
      scrollTargetId: null,
      setScrollTargetId: vi.fn(),
      externalRevealTarget: null,
      onExternalRevealHandled: vi.fn(),
      hasNewMessages: false,
      setHasNewMessages: vi.fn(),
      isAtBottomRef: { current: true },
    };
    const { rerender } = render(
      <Providers>
        <TrajectoryInspector
          {...baseProps}
          searchQuery=""
          currentSearchTarget={null}
        />
      </Providers>,
    );

    rerender(
      <Providers>
        <TrajectoryInspector
          {...baseProps}
          searchQuery="Prompt 599"
          currentSearchTarget={{
            rowEntryId: "user-599",
            matchElementId: "entry-user-599",
            occurrenceIndexInElement: 0,
          }}
        />
      </Providers>,
    );

    expect(await screen.findByText("Turn 600")).toBeTruthy();
    await waitFor(() => {
      const target = screen.getByRole("button", {
        name: /Turn 600, user, Prompt 599/i,
      });
      expect(document.activeElement).toBe(target);
    });
  });
});
