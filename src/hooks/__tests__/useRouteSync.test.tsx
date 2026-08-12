// @vitest-environment jsdom
import { renderHook, waitFor, act } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

import type { SessionFamily, SessionInfo } from "@/types";

type UseRouteSync = typeof import("../useRouteSync").useRouteSync;
let useRouteSync: UseRouteSync;

const sessionFamilyMocks = vi.hoisted(() => ({
  get: vi.fn(),
  list: vi.fn(),
  listen: vi.fn(),
}));

vi.mock("@/runtime-data/sessionFamilies", () => ({
  getRuntimeSessionFamily: (...args: unknown[]) => sessionFamilyMocks.get(...args),
  listRuntimeSessionFamilies: (...args: unknown[]) => sessionFamilyMocks.list(...args),
  listenForSessionFamilyChanges: (...args: unknown[]) => sessionFamilyMocks.listen(...args),
}));

const makeSession = (id: string): SessionInfo => ({
  id,
  path: `/sessions/${id}.jsonl`,
  cwd: "/tmp/project",
  created: "2026-01-01T00:00:00.000Z",
  modified: "2026-01-01T00:00:00.000Z",
  message_count: 1,
  first_message: "hello",
  last_message: "hello",
  last_message_role: "user",
});

type HookProps = Parameters<typeof useRouteSync>[0];

function renderUseRouteSync(path: string, initialProps: Partial<HookProps> = {}) {
  const session = makeSession("target-session");
  let currentPath = path;
  const LocationObserver = () => {
    currentPath = useLocation().pathname;
    return null;
  };
  const wrapper = ({ children }: { children: ReactNode }) => (
    <MemoryRouter initialEntries={[path]}>
      <LocationObserver />
      {children}
    </MemoryRouter>
  );
  const spies = {
    setSelectedSession: vi.fn(),
    setViewMode: vi.fn(),
    setSelectedProject: vi.fn(),
    setShowSettings: vi.fn(),
    setShowTerminal: vi.fn(),
    setShowFavorites: vi.fn(),
    setActiveAppViewId: vi.fn(),
  };

  const baseProps: HookProps = {
    selectedSession: null,
    sessions: [session],
    sessionsLoading: true,
    viewMode: "list",
    ...spies,
    appRoutes: [],
    appRoutesReady: true,
    ...initialProps,
  };

  const hook = renderHook((props: HookProps) => useRouteSync(props), {
    wrapper,
    initialProps: baseProps,
  });
  return { ...hook, spies, session, baseProps, getCurrentPath: () => currentPath };
}

describe("useRouteSync", () => {
  beforeEach(async () => {
    if (!useRouteSync) {
      const storage = new Map<string, string>();
      Object.defineProperty(globalThis, "localStorage", {
        configurable: true,
        value: {
          getItem: (key: string) => storage.get(key) ?? null,
          setItem: (key: string, value: string) => storage.set(key, value),
          removeItem: (key: string) => storage.delete(key),
          clear: () => storage.clear(),
          key: (index: number) => [...storage.keys()][index] ?? null,
          get length() {
            return storage.size;
          },
        },
      });
      ({ useRouteSync } = await import("../useRouteSync"));
    }
    sessionFamilyMocks.get.mockReset();
    sessionFamilyMocks.list.mockReset();
    sessionFamilyMocks.listen.mockReset();
    sessionFamilyMocks.get.mockResolvedValue(null);
    sessionFamilyMocks.list.mockResolvedValue([]);
    sessionFamilyMocks.listen.mockResolvedValue(() => {});
  });

  it("reports pending while a session URL has not been selected yet", () => {
    const { result } = renderUseRouteSync("/sessions/target-session", {
      selectedSession: null,
    });

    expect(result.current.pendingSessionRoute).toBe(true);
  });

  it("does not report pending once the URL session is selected", () => {
    const selectedSession = makeSession("target-session");
    const { result } = renderUseRouteSync("/sessions/target-session", {
      selectedSession,
    });

    expect(result.current.pendingSessionRoute).toBe(false);
  });

  it("does not report pending when sidebar already selected a session (state ahead of URL)", () => {
    const selectedSession = makeSession("other-session");
    const { result } = renderUseRouteSync("/sessions/target-session", {
      selectedSession,
    });

    expect(result.current.pendingSessionRoute).toBe(false);
  });

  it("opens a canonical session from its harness-native id", async () => {
    const nativeSession = {
      ...makeSession("prime-agent:native-123:fingerprint"),
      path: "/home/arena/.prime/agent/sessions/native-123.jsonl",
    };
    const { spies } = renderUseRouteSync("/open/native-123", {
      sessions: [nativeSession],
      sessionsLoading: false,
    });

    await waitFor(() => {
      expect(spies.setSelectedSession).toHaveBeenCalledWith(nativeSession);
    });
  });

  it("redirects a reused Pi-AGI root session id to its path-matched family", async () => {
    const currentRoot = {
      ...makeSession("arena-pi-agi-root"),
      path: "/sessions/current/pi-agi-root.jsonl",
      created: "2026-08-12T10:18:54.016Z",
    };
    const oldRoot = {
      ...makeSession("arena-pi-agi-root"),
      path: "/sessions/old/pi-agi-root.jsonl",
      created: "2026-08-11T16:26:10.533Z",
    };
    const makeFamily = (
      familyId: string,
      root: SessionInfo,
    ): SessionFamily => ({
      schema_version: "arena-session-family-v1",
      family_id: familyId,
      run_id: familyId,
      root_thread_id: "pi-agi:root",
      generation: 1,
      updated_at: root.modified,
      threads: [{
        thread_id: "pi-agi:root",
        native_session_id: "arena-pi-agi-root",
        relationship: "root",
        label: "Pi-AGI orchestrator",
        status: "running",
        usage: {},
        activity: {},
        session_path: root.path,
        session: root,
      }],
    });
    const currentFamily = makeFamily("current-family", currentRoot);
    sessionFamilyMocks.list.mockResolvedValue([
      makeFamily("old-family", oldRoot),
      currentFamily,
    ]);
    sessionFamilyMocks.get.mockResolvedValue(currentFamily);

    const { getCurrentPath, result } = renderUseRouteSync(
      "/sessions/arena-pi-agi-root",
      {
        selectedSession: currentRoot,
        sessions: [currentRoot],
        sessionsLoading: false,
      },
    );

    await waitFor(() => {
      expect(getCurrentPath()).toBe(
        "/families/current-family/threads/pi-agi%3Aroot",
      );
      expect(result.current.selectedFamily?.family_id).toBe("current-family");
    });
  });

  it("redirects a missing family deep link instead of loading forever", async () => {
    const { getCurrentPath, result } = renderUseRouteSync(
      "/families/missing/threads/root",
      { selectedSession: null, sessions: [], sessionsLoading: false },
    );

    await waitFor(() => {
      expect(getCurrentPath()).toBe("/");
      expect(result.current.pendingSessionRoute).toBe(false);
    });
  });

  it("activates a registered app route generically", async () => {
    const { spies } = renderUseRouteSync("/boards", {
      selectedSession: null,
      sessionsLoading: false,
      appRoutes: [{ id: "app.board", route: "/boards" }],
      appRoutesReady: true,
    });

    await waitFor(() => {
      expect(spies.setActiveAppViewId).toHaveBeenCalledWith("app.board");
      expect(spies.setViewMode).toHaveBeenCalledWith("app");
    });
  });

  it("activates project list route when user navigates from an app route to projects", async () => {
    const { spies, result } = renderUseRouteSync("/kanban", {
      selectedSession: null,
      sessionsLoading: false,
      appRoutes: [{ id: "builtin.kanban-board.view", route: "/kanban" }],
      appRoutesReady: true,
      viewMode: "app",
    });

    await waitFor(() => {
      expect(spies.setActiveAppViewId).toHaveBeenCalledWith("builtin.kanban-board.view");
      expect(spies.setViewMode).toHaveBeenCalledWith("app");
    });

    spies.setViewMode.mockClear();
    spies.setSelectedProject.mockClear();
    spies.setActiveAppViewId.mockClear();

    act(() => {
      result.current.navigateToProjects();
    });

    await waitFor(() => {
      expect(spies.setActiveAppViewId).toHaveBeenCalledWith(null);
      expect(spies.setSelectedProject).toHaveBeenCalledWith(null);
      expect(spies.setViewMode).toHaveBeenCalledWith("project");
    });
  });
});
