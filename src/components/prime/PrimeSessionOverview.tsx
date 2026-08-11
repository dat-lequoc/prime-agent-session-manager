import { memo, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  AlertTriangle,
  Bot,
  BrainCircuit,
  ChevronDown,
  ChevronRight,
  CircleDot,
  Cpu,
  FileJson,
  GitBranch,
  RefreshCw,
  Sparkles,
  X,
} from "lucide-react";

import SessionEntryRenderer from "@/components/session-viewer/SessionEntryRenderer";
import { useTransport } from "@/contexts/TransportContext";
import type {
  PrimeSessionBundle,
  PrimeThreadSummary,
  PrimeUsage,
  SessionEntry,
} from "@/types";
import { parseSessionEntries } from "@/utils/session";

interface PrimeSessionOverviewProps {
  rootPath: string;
}

interface PrimeSessionChangedPayload {
  rootPaths?: string[];
}

const POLL_INTERVAL_MS = 5_000;

function formatTokens(value: number): string {
  if (value < 1_000) return String(value);
  if (value < 1_000_000) return `${(value / 1_000).toFixed(1)}k`;
  return `${(value / 1_000_000).toFixed(2)}M`;
}

function formatBytes(value: number): string {
  if (value < 1_024) return `${value} B`;
  if (value < 1_048_576) return `${(value / 1_024).toFixed(1)} KiB`;
  return `${(value / 1_048_576).toFixed(1)} MiB`;
}

function statusTone(status: string): string {
  const value = status.toLowerCase();
  if (["running", "active", "queued", "working"].includes(value)) {
    return "text-emerald-400 border-emerald-500/25 bg-emerald-500/10";
  }
  if (["failed", "error", "aborted", "deleted"].includes(value)) {
    return "text-red-400 border-red-500/25 bg-red-500/10";
  }
  if (["needs_input", "waiting", "paused"].includes(value)) {
    return "text-amber-400 border-amber-500/25 bg-amber-500/10";
  }
  return "text-muted-foreground border-border/60 bg-secondary/40";
}

function getRootStatus(bundle: PrimeSessionBundle): string {
  const taskState = bundle.root.latestAgentStatus?.taskState;
  return typeof taskState === "string" ? taskState : bundle.root.status || "idle";
}

function getGoalTitle(bundle: PrimeSessionBundle): string | null {
  const goal = bundle.root.latestGoal;
  if (!goal) return null;
  for (const key of ["objective", "goal", "title", "description"]) {
    if (typeof goal[key] === "string" && goal[key].trim()) return goal[key].trim();
  }
  return null;
}

function getRefinementTitle(bundle: PrimeSessionBundle): string | null {
  const refinement = bundle.root.latestRefinement;
  if (!refinement) return null;
  for (const key of ["summary", "trigger", "outcome"]) {
    if (typeof refinement[key] === "string" && refinement[key].trim()) {
      return refinement[key].trim();
    }
  }
  return null;
}

function UsagePill({ usage, label }: { usage: PrimeUsage; label: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-secondary/40 px-2 py-1 text-[10px] text-muted-foreground">
      <span>{label}</span>
      <span className="font-mono text-foreground">{formatTokens(usage.totalTokens)}</span>
    </span>
  );
}

const ThreadRow = memo(function ThreadRow({
  thread,
  depth,
  onOpen,
}: {
  thread: PrimeThreadSummary;
  depth: number;
  onOpen: (thread: PrimeThreadSummary) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const hasChildren = thread.children.length > 0;
  const usage = thread.transcript?.ownUsage.totalTokens || 0;

  return (
    <div className="min-w-0" style={{ marginLeft: depth * 14 }}>
      <div className="group flex min-w-0 items-center gap-2 rounded-md border border-transparent px-2 py-1.5 motion-color hover:border-border/60 hover:bg-secondary/30">
        <button
          type="button"
          className="focus-ring flex h-6 w-6 flex-none items-center justify-center rounded text-muted-foreground disabled:opacity-25"
          onClick={() => setExpanded(value => !value)}
          disabled={!hasChildren}
          aria-label={expanded ? "Collapse child threads" : "Expand child threads"}
        >
          {hasChildren && (expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />)}
        </button>
        <CircleDot size={12} className={statusTone(thread.status).split(" ")[0]} />
        <button
          type="button"
          className="focus-ring min-w-0 flex-1 rounded text-left"
          onClick={() => onOpen(thread)}
          disabled={!thread.transcriptPath}
        >
          <span className="flex min-w-0 items-center gap-2">
            <span className="truncate text-xs font-medium text-foreground">{thread.name}</span>
            <span className={`rounded-full border px-1.5 py-0.5 text-[9px] ${statusTone(thread.status)}`}>
              {thread.status.replace(/_/g, " ")}
            </span>
          </span>
          <span className="mt-0.5 flex min-w-0 items-center gap-2 text-[10px] text-muted-foreground">
            {thread.model && <span className="truncate font-mono">{thread.model}</span>}
            {usage > 0 && <span className="flex-none font-mono">{formatTokens(usage)} tok</span>}
            {!thread.transcriptPath && <span className="flex-none text-amber-400">transcript pending</span>}
          </span>
        </button>
      </div>
      {expanded && hasChildren && (
        <div className="border-l border-border/40">
          {thread.children.map(child => (
            <ThreadRow key={child.childId} thread={child} depth={depth + 1} onOpen={onOpen} />
          ))}
        </div>
      )}
    </div>
  );
});

function OverlayShell({
  title,
  subtitle,
  onClose,
  children,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [onClose]);

  return createPortal(
    <div className="motion-overlay-backdrop fixed inset-0 z-[90] flex items-center justify-center bg-black/60 p-3 backdrop-blur-sm" onMouseDown={event => event.target === event.currentTarget && onClose()}>
      <div className="motion-overlay-surface flex max-h-[88vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-border bg-card shadow-2xl" role="dialog" aria-modal="true" aria-label={title}>
        <div className="flex items-center gap-3 border-b border-border px-4 py-3">
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-sm font-semibold text-foreground">{title}</h2>
            {subtitle && <p className="truncate font-mono text-[10px] text-muted-foreground">{subtitle}</p>}
          </div>
          <button type="button" className="focus-ring motion-color rounded-md p-2 text-muted-foreground hover:bg-secondary hover:text-foreground" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}

function DiagnosticsDrawer({ bundle, onClose }: { bundle: PrimeSessionBundle; onClose: () => void }) {
  return (
    <OverlayShell title="Prime runtime diagnostics" subtitle={bundle.artifactDir} onClose={onClose}>
      <div className="grid min-h-0 flex-1 gap-3 overflow-y-auto p-4 md:grid-cols-2">
        <section className="rounded-lg border border-border bg-secondary/20 p-3">
          <h3 className="mb-2 flex items-center gap-2 text-xs font-semibold"><Cpu size={14} /> Persistent IPython kernel</h3>
          {bundle.kernel.available ? (
            <div className="space-y-1 text-[11px] text-muted-foreground">
              <p>Python <span className="font-mono text-foreground">{bundle.kernel.pythonVersion || "unknown"}</span></p>
              <p>{bundle.kernel.savedNames.length} saved variables · {formatBytes(bundle.kernel.serializedBytes)}</p>
              <div className="mt-2 flex flex-wrap gap-1">
                {bundle.kernel.savedNames.slice(0, 40).map(name => <span key={name} className="rounded bg-background/70 px-1.5 py-0.5 font-mono text-[9px] text-foreground">{name}</span>)}
                {bundle.kernel.savedNames.length > 40 && <span className="text-[9px]">+{bundle.kernel.savedNames.length - 40} more</span>}
              </div>
            </div>
          ) : <p className="text-[11px] text-muted-foreground">No persisted kernel state.</p>}
        </section>

        <section className="rounded-lg border border-border bg-secondary/20 p-3">
          <h3 className="mb-2 flex items-center gap-2 text-xs font-semibold"><BrainCircuit size={14} /> Continual harness</h3>
          {bundle.harness.available ? (
            <div className="grid grid-cols-2 gap-2 text-[11px]">
              <span className="rounded bg-background/60 p-2">{bundle.harness.memories} memories</span>
              <span className="rounded bg-background/60 p-2">{bundle.harness.refinements} refinements</span>
              <span className="rounded bg-background/60 p-2">{bundle.harness.skills} skills</span>
              <span className="rounded bg-background/60 p-2">{bundle.harness.subagents} specs</span>
            </div>
          ) : <p className="text-[11px] text-muted-foreground">No harness ledger for this session.</p>}
        </section>

        <section className="rounded-lg border border-border bg-secondary/20 p-3 md:col-span-2">
          <h3 className="mb-2 flex items-center gap-2 text-xs font-semibold"><FileJson size={14} /> Artifact references</h3>
          <div className="space-y-1">
            {bundle.artifacts.map(artifact => (
              <div key={artifact.kind} className="flex min-w-0 items-center gap-2 rounded bg-background/50 px-2 py-1.5 text-[10px]">
                <span className={artifact.exists ? "text-emerald-400" : "text-muted-foreground"}>{artifact.exists ? "●" : "○"}</span>
                <span className="w-28 flex-none text-foreground">{artifact.kind}</span>
                <span className="min-w-0 flex-1 truncate font-mono text-muted-foreground" title={artifact.path}>{artifact.path}</span>
                {artifact.exists && <span className="flex-none font-mono text-muted-foreground">{formatBytes(artifact.size)}</span>}
                {artifact.opaque && <span className="flex-none rounded border border-amber-500/20 bg-amber-500/10 px-1 text-amber-400">opaque</span>}
              </div>
            ))}
          </div>
        </section>

        {bundle.warnings.length > 0 && (
          <section className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 md:col-span-2">
            <h3 className="mb-2 flex items-center gap-2 text-xs font-semibold text-amber-400"><AlertTriangle size={14} /> Warnings</h3>
            <ul className="space-y-1 text-[10px] text-muted-foreground">
              {bundle.warnings.map(warning => <li key={warning}>• {warning}</li>)}
            </ul>
          </section>
        )}
      </div>
    </OverlayShell>
  );
}

function ThreadTranscriptModal({ thread, onClose }: { thread: PrimeThreadSummary; onClose: () => void }) {
  const transport = useTransport();
  const [entries, setEntries] = useState<SessionEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(180);
  const transcriptPath = thread.transcriptPath;

  useEffect(() => {
    let cancelled = false;
    if (!transcriptPath) {
      setError("This child has no transcript yet.");
      setLoading(false);
      return;
    }
    setLoading(true);
    transport.invoke<string>("read_session_file", { path: transcriptPath }).then(content => {
      if (!cancelled) setEntries(parseSessionEntries(content));
    }).catch(reason => {
      if (!cancelled) setError(String(reason));
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [transcriptPath, transport]);

  const toolResults = useMemo(() => {
    const map = new Map<string, SessionEntry>();
    for (const entry of entries) {
      if (entry.type === "message" && entry.message?.role === "toolResult" && entry.message.toolCallId) {
        map.set(entry.message.toolCallId, entry);
      }
    }
    return map;
  }, [entries]);
  const visibleEntries = useMemo(() => entries.slice(Math.max(0, entries.length - visibleCount)), [entries, visibleCount]);

  return (
    <OverlayShell title={thread.name} subtitle={transcriptPath} onClose={onClose}>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        <div className="mx-auto max-w-4xl space-y-4">
          {loading && <p className="py-10 text-center text-xs text-muted-foreground">Loading child transcript…</p>}
          {error && <p className="rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-xs text-red-400">{error}</p>}
          {!loading && !error && entries.length > visibleEntries.length && (
            <button type="button" className="focus-ring mx-auto block rounded-full border border-border bg-secondary/40 px-3 py-1 text-[10px] text-muted-foreground hover:text-foreground" onClick={() => setVisibleCount(count => count + 200)}>
              Show 200 earlier entries
            </button>
          )}
          {visibleEntries.map(entry => (
            <SessionEntryRenderer key={entry.id} entry={entry} toolResultByCallId={toolResults} processEntries={entries} />
          ))}
        </div>
      </div>
    </OverlayShell>
  );
}

export default function PrimeSessionOverview({ rootPath }: PrimeSessionOverviewProps) {
  const transport = useTransport();
  const [bundle, setBundle] = useState<PrimeSessionBundle | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(true);
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);
  const [selectedThread, setSelectedThread] = useState<PrimeThreadSummary | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const revisionRef = useRef<string | null>(null);

  const loadBundle = useCallback(async (showSpinner = false) => {
    if (showSpinner) setRefreshing(true);
    try {
      const next = await transport.invoke<PrimeSessionBundle>("get_prime_session_bundle", { rootPath });
      setError(null);
      const revisionKey = `${rootPath}:${next.revision}`;
      if (revisionRef.current !== revisionKey) {
        revisionRef.current = revisionKey;
        setBundle(next);
      }
    } catch (reason) {
      setError(String(reason));
    } finally {
      if (showSpinner) setRefreshing(false);
    }
  }, [rootPath, transport]);

  useEffect(() => {
    void loadBundle();
    const timer = window.setInterval(() => void loadBundle(), POLL_INTERVAL_MS);
    let cancelled = false;
    let unlisten: (() => void) | undefined;
    transport.onEvent<PrimeSessionChangedPayload>("prime-session-changed", payload => {
      if (!payload.rootPaths || payload.rootPaths.includes(rootPath)) void loadBundle();
    }).then(value => {
      if (cancelled) value();
      else unlisten = value;
    }).catch(() => undefined);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      unlisten?.();
    };
  }, [loadBundle, rootPath, transport]);

  const status = bundle ? getRootStatus(bundle) : "loading";
  const goalTitle = bundle ? getGoalTitle(bundle) : null;
  const refinementTitle = bundle ? getRefinementTitle(bundle) : null;

  return (
    <div className="border-b border-border bg-card/70 px-3 py-2">
      <div className="mx-auto max-w-[1200px] overflow-hidden rounded-lg border border-purple-500/20 bg-gradient-to-r from-purple-500/[0.07] via-secondary/20 to-cyan-500/[0.04] shadow-sm">
        <div className="flex min-w-0 items-center gap-2 px-3 py-2">
          <button type="button" className="focus-ring flex h-7 w-7 flex-none items-center justify-center rounded-md text-purple-400 hover:bg-purple-500/10" onClick={() => setExpanded(value => !value)} aria-label={expanded ? "Collapse Prime overview" : "Expand Prime overview"}>
            {expanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
          </button>
          <Sparkles size={15} className="flex-none text-purple-400" />
          <span className="flex-none text-xs font-semibold text-foreground">Prime runtime</span>
          <span className={`flex-none rounded-full border px-2 py-0.5 text-[9px] ${statusTone(status)}`}>{status.replace(/_/g, " ")}</span>
          {bundle && <UsagePill usage={bundle.root.aggregateUsage} label="root" />}
          {bundle && bundle.threadCount > 0 && (
            <span className="inline-flex flex-none items-center gap-1 rounded-full border border-border/60 bg-secondary/40 px-2 py-1 text-[10px] text-muted-foreground">
              <GitBranch size={10} /> {bundle.threadCount} thread{bundle.threadCount === 1 ? "" : "s"}
              {bundle.runningThreadCount > 0 && <span className="text-emerald-400">· {bundle.runningThreadCount} live</span>}
            </span>
          )}
          <span className="min-w-0 flex-1 truncate text-[10px] text-muted-foreground">{goalTitle || refinementTitle || error || "RLM + persistent IPython session"}</span>
          <button type="button" className="focus-ring motion-color rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground" onClick={() => void loadBundle(true)} aria-label="Refresh Prime runtime">
            <RefreshCw size={13} className={refreshing ? "animate-spin" : ""} />
          </button>
          {bundle && (
            <button type="button" className="focus-ring motion-color rounded-md border border-border/60 px-2 py-1 text-[10px] text-muted-foreground hover:bg-secondary hover:text-foreground" onClick={() => setDiagnosticsOpen(true)}>
              Diagnostics
            </button>
          )}
        </div>

        {expanded && (
          <div className="grid gap-3 border-t border-border/60 px-3 py-3 md:grid-cols-[minmax(0,1fr)_minmax(260px,0.8fr)]">
            <section className="min-w-0">
              <h3 className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground"><Bot size={12} /> Recursive agents</h3>
              {!bundle && !error && <p className="rounded-md border border-border/60 bg-background/30 p-3 text-[11px] text-muted-foreground">Reading Prime artifacts…</p>}
              {error && <p className="rounded-md border border-red-500/20 bg-red-500/10 p-2 text-[10px] text-red-400">{error}</p>}
              {bundle && bundle.threads.length === 0 && <p className="rounded-md border border-border/60 bg-background/30 p-3 text-[11px] text-muted-foreground">No RLM children were registered in this session.</p>}
              {bundle?.threads.map(thread => <ThreadRow key={thread.childId} thread={thread} depth={0} onOpen={setSelectedThread} />)}
            </section>

            <section className="min-w-0 space-y-2">
              {goalTitle && (
                <div className="rounded-lg border border-cyan-500/15 bg-cyan-500/[0.05] p-3">
                  <h3 className="mb-1 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wide text-cyan-300"><CircleDot size={11} /> Active goal</h3>
                  <p className="line-clamp-4 text-[11px] leading-relaxed text-foreground">{goalTitle}</p>
                </div>
              )}
              {bundle && (
                <div className="grid grid-cols-2 gap-2 text-[10px]">
                  <div className="rounded-lg border border-border/60 bg-background/30 p-2">
                    <span className="block text-muted-foreground">IPython state</span>
                    <span className="mt-1 block font-mono text-foreground">{bundle.kernel.available ? `${bundle.kernel.savedNames.length} vars · ${formatBytes(bundle.kernel.serializedBytes)}` : "not persisted"}</span>
                  </div>
                  <div className="rounded-lg border border-border/60 bg-background/30 p-2">
                    <span className="block text-muted-foreground">Harness memory</span>
                    <span className="mt-1 block font-mono text-foreground">{bundle.harness.available ? `${bundle.harness.memories} memories · ${bundle.harness.refinements} refinements` : "not used"}</span>
                  </div>
                  <div className="col-span-2 rounded-lg border border-border/60 bg-background/30 p-2">
                    <span className="flex items-center justify-between text-muted-foreground">
                      <span>Child transcript own usage</span>
                      <span className="font-mono text-foreground">{formatTokens(bundle.descendantsOwnUsage.totalTokens)} tokens</span>
                    </span>
                    {bundle.root.attributedUsage.totalTokens > 0 && <span className="mt-1 block text-[9px] text-muted-foreground">{formatTokens(bundle.root.attributedUsage.totalTokens)} child tokens are already attributed into the root aggregate.</span>}
                  </div>
                </div>
              )}
            </section>
          </div>
        )}
      </div>
      {diagnosticsOpen && bundle && <DiagnosticsDrawer bundle={bundle} onClose={() => setDiagnosticsOpen(false)} />}
      {selectedThread && <ThreadTranscriptModal thread={selectedThread} onClose={() => setSelectedThread(null)} />}
    </div>
  );
}
