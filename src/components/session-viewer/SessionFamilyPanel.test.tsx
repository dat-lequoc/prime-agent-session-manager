// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import SessionFamilyPanel from "./SessionFamilyPanel";
import type { SessionFamily, SessionInfo } from "@/types";

const session = (id: string): SessionInfo => ({
  id,
  path: `/tmp/${id}.jsonl`,
  cwd: "/app",
  created: "2026-08-12T00:00:00Z",
  modified: "2026-08-12T00:01:00Z",
  message_count: 1,
  first_message: "hello",
  last_message: "hello",
  last_message_role: "assistant",
});

const family: SessionFamily = {
  schema_version: "arena-session-family-v1",
  family_id: "run-1",
  run_id: "run-1",
  root_thread_id: "root",
  generation: 1,
  updated_at: "2026-08-12T00:01:00Z",
  harness: "pi-agi",
  status: "running",
  threads: [
    { thread_id: "root", relationship: "root", label: "Orchestrator", status: "running", usage: {}, activity: {}, session_path: session("root").path, session: session("root") },
    { thread_id: "worker", parent_thread_id: "root", relationship: "delegated", label: "Worker", status: "completed", usage: {}, activity: {}, session_path: session("worker").path, session: session("worker") },
    { thread_id: "nested", parent_thread_id: "worker", relationship: "delegated", label: "Nested", status: "completed", usage: {}, activity: {}, session_path: session("nested").path, session: session("nested") },
  ],
};

describe("SessionFamilyPanel", () => {
  it("renders arbitrary depth and selects a child thread", () => {
    const onSelect = vi.fn();
    render(<SessionFamilyPanel family={family} selectedThreadId="root" onSelectThread={onSelect} />);
    expect(screen.getByText("Orchestrator")).toBeTruthy();
    expect(screen.getByText("Nested")).toBeTruthy();
    fireEvent.click(screen.getByText("Worker"));
    expect(onSelect).toHaveBeenCalledWith("worker");
  });
});
