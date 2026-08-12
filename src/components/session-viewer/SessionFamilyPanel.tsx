import { Bot, ChevronRight, GitBranch } from "lucide-react";
import type { SessionFamily, SessionFamilyThread } from "@/types";

interface SessionFamilyPanelProps {
  family: SessionFamily;
  selectedThreadId: string;
  onSelectThread: (threadId: string) => void;
}

function formatElapsed(thread: SessionFamilyThread): string | null {
  if (!thread.started_at) return null;
  const start = Date.parse(thread.started_at);
  const end = thread.finished_at ? Date.parse(thread.finished_at) : Date.now();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;
  const seconds = Math.round((end - start) / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  return seconds % 60 ? `${minutes}m ${seconds % 60}s` : `${minutes}m`;
}

export default function SessionFamilyPanel({ family, selectedThreadId, onSelectThread }: SessionFamilyPanelProps) {
  const byParent = new Map<string | null, SessionFamilyThread[]>();
  for (const thread of family.threads) {
    const parent = thread.parent_thread_id ?? null;
    byParent.set(parent, [...(byParent.get(parent) ?? []), thread]);
  }

  const renderThread = (thread: SessionFamilyThread, depth: number) => {
    const children = byParent.get(thread.thread_id) ?? [];
    const selected = thread.thread_id === selectedThreadId;
    const elapsed = formatElapsed(thread);
    return (
      <div key={thread.thread_id}>
        <button
          type="button"
          className={`session-family-thread ${selected ? "session-family-thread-selected" : ""}`}
          style={{ paddingLeft: `${12 + depth * 20}px` }}
          aria-current={selected ? "true" : undefined}
          onClick={() => onSelectThread(thread.thread_id)}
        >
          <span className="session-family-thread-icon">{children.length > 0 ? <GitBranch size={14} /> : <Bot size={14} />}</span>
          <span className="session-family-thread-copy">
            <span className="session-family-thread-label">{thread.label || thread.thread_id}</span>
            <span className="session-family-thread-meta">
              {[thread.model || family.model, thread.status, elapsed].filter(Boolean).join(" · ")}
            </span>
          </span>
          <ChevronRight size={14} className="session-family-thread-open" />
        </button>
        {children.map((child) => renderThread(child, depth + 1))}
      </div>
    );
  };

  const root = family.threads.find((thread) => thread.thread_id === family.root_thread_id);
  if (!root) return null;
  return (
    <section className="session-family-panel" aria-label="Run threads">
      <div className="session-family-heading">
        <span className="session-family-title">Run threads</span>
        <span className="session-family-summary">{[family.harness, family.task_display_name || family.task, family.status].filter(Boolean).join(" · ")}</span>
      </div>
      <div className="session-family-tree">{renderThread(root, 0)}</div>
    </section>
  );
}
