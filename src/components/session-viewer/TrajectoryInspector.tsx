import {
  Bot,
  Brain,
  ChevronRight,
  CircleAlert,
  FileImage,
  GitBranch,
  Layers3,
  MessageSquare,
  Settings2,
  User,
  Wrench,
  X,
} from "lucide-react";
import {
  forwardRef,
  memo,
  useCallback,
  useDeferredValue,
  useEffect,
  useId,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type MutableRefObject,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { useTranslation } from "react-i18next";
import { observeElementRect, useVirtualizer } from "@tanstack/react-virtual";

import NewMessagesButton from "@/components/session-viewer/NewMessagesButton";
import SessionEntryRenderer from "@/components/session-viewer/SessionEntryRenderer";
import ThinkingBlock from "@/components/messages/ThinkingBlock";
import { useSessionView } from "@/contexts/SessionViewContext";
import type { SessionSearchTarget } from "@/hooks/useSessionViewerInMessageSearch";
import type { SessionViewerRevealTarget } from "@/components/session-viewer/SessionViewerMessages";
import type { Content, SessionEntry } from "@/types";
import { ansiToMarkdown } from "@/utils/assistantContent";
import {
  resolveToolCallDisplayData,
  type ResolvedToolCallDisplayData,
} from "@/utils/toolCallDisplay";

const DETAIL_MIN_WIDTH = 320;
const DETAIL_MAX_WIDTH = 720;
const LEDGER_MIN_WIDTH = 280;
const DETAIL_RESIZE_STEP = 24;
const DETAIL_DEFAULT_WIDTH = 480;
const ROW_ESTIMATE = 31;
const SUMMARY_LIMIT = 180;
const TOOL_RESULT_LIMIT = 120;

type TrajectoryRowKind =
  | "assistant"
  | "compaction"
  | "event"
  | "image"
  | "model"
  | "system"
  | "thinking"
  | "tool"
  | "user";

export interface TrajectoryRow {
  id: string;
  entryId: string;
  turn: number;
  turnStart: boolean;
  kind: TrajectoryRowKind;
  label: string;
  summary: string;
  searchText: string;
  timestamp: string;
  sourceEntry: SessionEntry;
  detailEntry: SessionEntry;
  content?: Content;
  toolCallId?: string;
  toolRenderEntryId?: string;
  toolResult?: SessionEntry;
  toolDisplay?: ResolvedToolCallDisplayData;
  status: "error" | "pending" | "success" | "neutral";
}

export interface TrajectoryInspectorRef {
  scrollToTop: () => void;
  scrollToBottom: () => void;
}

export interface TrajectoryInspectorProps {
  entries: SessionEntry[];
  toolResultByCallId: Map<string, SessionEntry>;
  searchQuery: string;
  currentSearchTarget: SessionSearchTarget | null;
  streamingId: string | null;
  scrollTargetId: string | null;
  setScrollTargetId: (entryId: string | null) => void;
  externalRevealTarget: SessionViewerRevealTarget | null;
  onExternalRevealHandled: () => void;
  hasNewMessages: boolean;
  setHasNewMessages: (hasNewMessages: boolean) => void;
  isAtBottomRef: MutableRefObject<boolean>;
}

function compactText(value: unknown, maxLength = SUMMARY_LIMIT): string {
  let normalized = "";
  if (typeof value === "string") {
    normalized = value.replace(/\s+/g, " ").trim();
  } else if (value != null) {
    try {
      normalized = JSON.stringify(value) ?? String(value);
    } catch {
      normalized = String(value);
    }
  }

  if (!normalized) return "";
  return normalized.length > maxLength
    ? `${normalized.slice(0, maxLength).trimEnd()}…`
    : normalized;
}

function promptText(content: Content[]): string {
  return compactText(
    content
      .flatMap((item) => {
        if (item.type === "text") return item.text ?? "";
        if (item.type === "thinking") return item.thinking ?? "";
        if (item.type === "image") return "Image";
        return "";
      })
      .filter(Boolean)
      .join(" "),
  );
}

function toolArgumentSummary(content: Content): string {
  const args = content.arguments ?? {};
  const preferredKeys = [
    "command",
    "path",
    "file_path",
    "query",
    "pattern",
    "url",
    "task",
    "prompt",
    "description",
  ];

  for (const key of preferredKeys) {
    const value = args[key];
    if (value == null) continue;
    if (Array.isArray(value)) return compactText(value.join(" "));
    const summary = compactText(value);
    if (summary) return summary;
  }

  return compactText(args) || "No arguments";
}

function cloneWithContent(entry: SessionEntry, content: Content): SessionEntry {
  return {
    ...entry,
    message: entry.message
      ? {
          ...entry.message,
          content: [content],
        }
      : entry.message,
  };
}

function contentRowKind(content: Content): TrajectoryRowKind {
  if (content.type === "toolCall") return "tool";
  if (content.type === "thinking") return "thinking";
  if (content.type === "image") return "image";
  return "assistant";
}

function contentRowLabel(content: Content): string {
  if (content.type === "toolCall") return content.name || "tool";
  if (content.type === "thinking") return "thinking";
  if (content.type === "image") return "image";
  return "assistant";
}

function contentRowSummary(content: Content): string {
  if (content.type === "toolCall") return toolArgumentSummary(content);
  if (content.type === "thinking") return compactText(content.thinking) || "Reasoning";
  if (content.type === "image") return content.mimeType || "Image attachment";
  return compactText(content.text) || "Assistant message";
}

function nonMessageSummary(entry: SessionEntry): {
  kind: TrajectoryRowKind;
  label: string;
  summary: string;
} {
  if (entry.type === "model_change") {
    return {
      kind: "model",
      label: "model",
      summary: [entry.provider, entry.modelId].filter(Boolean).join(" / ") || "Model changed",
    };
  }
  if (entry.type === "compaction") {
    return {
      kind: "compaction",
      label: "compact",
      summary: compactText(entry.summary) || "Conversation history compacted",
    };
  }
  if (entry.type === "branch_summary") {
    return {
      kind: "event",
      label: "branch",
      summary: compactText(entry.summary) || "Branch summary",
    };
  }
  if (entry.type === "custom_message") {
    return {
      kind: "system",
      label: entry.customType || "event",
      summary: compactText(entry.content) || "Custom message",
    };
  }
  return {
    kind: "event",
    label: entry.type.replace(/_/g, " "),
    summary: compactText(entry.summary ?? entry.content ?? entry.label ?? entry.name) || entry.type,
  };
}

function isPromptRole(role: string | undefined): boolean {
  return role === "user" || role === "developer" || role === "system";
}

export function buildTrajectoryRows(
  entries: SessionEntry[],
  toolResultByCallId: Map<string, SessionEntry>,
): TrajectoryRow[] {
  const rows: TrajectoryRow[] = [];
  let turn = 0;

  const append = (row: Omit<TrajectoryRow, "turnStart">) => {
    rows.push({
      ...row,
      turnStart:
        rows.length === 0 || rows[rows.length - 1]?.turn !== row.turn,
    });
  };

  for (const entry of entries) {
    if (entry.type === "message" && entry.message) {
      const role = entry.message.role;
      if (isPromptRole(role)) {
        turn += 1;
        const kind = role === "user" ? "user" : "system";
        const label = role === "user" ? "user" : role;
        const summary = promptText(entry.message.content) || `${label} message`;
        append({
          id: `${entry.id}:prompt`,
          entryId: entry.id,
          turn,
          kind,
          label,
          summary,
          searchText: `${label} ${summary}`.toLowerCase(),
          timestamp: entry.timestamp,
          sourceEntry: entry,
          detailEntry: entry,
          status: "neutral",
        });
        continue;
      }

      if (role === "assistant") {
        const content = entry.message.content ?? [];
        let appended = false;
        content.forEach((item, contentIndex) => {
          if (item.type === "text" && !item.text?.trim()) return;
          if (item.type === "thinking" && !item.thinking?.trim()) return;

          const kind = contentRowKind(item);
          const label = contentRowLabel(item);
          const summary = contentRowSummary(item);
          const toolCallId = item.type === "toolCall"
            ? item.id || item.toolCallId
            : undefined;
          const toolDisplay = item.type === "toolCall"
            ? resolveToolCallDisplayData(item, 0, toolResultByCallId)
            : undefined;
          const toolResult = toolCallId
            ? toolResultByCallId.get(toolCallId)
            : undefined;
          const status = item.type !== "toolCall"
            ? "neutral"
            : toolResult == null
              ? "pending"
              : toolDisplay?.isError
                ? "error"
                : "success";
          const resultPreview = toolDisplay?.output
            ? compactText(toolDisplay.output, TOOL_RESULT_LIMIT)
            : toolResult
              ? "No output"
              : "";

          append({
            id: `${entry.id}:content:${contentIndex}:${item.type}:${toolCallId ?? ""}`,
            entryId: entry.id,
            turn,
            kind,
            label,
            summary,
            searchText: `${label} ${summary} ${resultPreview}`.toLowerCase(),
            timestamp: entry.timestamp,
            sourceEntry: entry,
            detailEntry: cloneWithContent(entry, item),
            content: item,
            toolCallId,
            toolRenderEntryId: toolCallId
              ? `tool-result-${toolCallId}`
              : toolDisplay?.entryId,
            toolResult,
            toolDisplay,
            status,
          });
          appended = true;
        });

        if (!appended) {
          const summary = compactText(entry.message.errorMessage)
            || (entry.message.cancelled ? "Assistant response cancelled" : "Assistant event");
          append({
            id: `${entry.id}:assistant`,
            entryId: entry.id,
            turn,
            kind: "assistant",
            label: "assistant",
            summary,
            searchText: `assistant ${summary}`.toLowerCase(),
            timestamp: entry.timestamp,
            sourceEntry: entry,
            detailEntry: entry,
            status: entry.message.errorMessage ? "error" : "neutral",
          });
        }
        continue;
      }
    }

    const presentation = nonMessageSummary(entry);
    append({
      id: `${entry.id}:entry:${entry.type}`,
      entryId: entry.id,
      turn,
      ...presentation,
      searchText: `${presentation.label} ${presentation.summary}`.toLowerCase(),
      timestamp: entry.timestamp,
      sourceEntry: entry,
      detailEntry: entry,
      status: "neutral",
    });
  }

  return rows;
}

function formatRowTime(timestamp: string): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function rowResultPreview(row: TrajectoryRow): string | null {
  if (row.kind !== "tool") return null;
  if (row.status === "pending") return "running";
  if (!row.toolDisplay?.output) return row.toolResult ? "No output" : null;
  return compactText(row.toolDisplay.output, TOOL_RESULT_LIMIT);
}

function RowIcon({ kind }: { kind: TrajectoryRowKind }) {
  const className = "trajectory-inspector__kind-icon";
  if (kind === "user") return <User className={className} aria-hidden="true" />;
  if (kind === "assistant") return <Bot className={className} aria-hidden="true" />;
  if (kind === "thinking") return <Brain className={className} aria-hidden="true" />;
  if (kind === "tool") return <Wrench className={className} aria-hidden="true" />;
  if (kind === "image") return <FileImage className={className} aria-hidden="true" />;
  if (kind === "model") return <Settings2 className={className} aria-hidden="true" />;
  if (kind === "compaction") return <Layers3 className={className} aria-hidden="true" />;
  if (kind === "system") return <MessageSquare className={className} aria-hidden="true" />;
  return <GitBranch className={className} aria-hidden="true" />;
}

function detailRawValue(row: TrajectoryRow): unknown {
  if (row.kind !== "tool") return row.sourceEntry;
  return {
    entry: row.sourceEntry,
    selectedContent: row.content,
    result: row.toolResult ?? null,
  };
}

function SelectedRowContent({
  row,
  toolResultByCallId,
  searchQuery,
  streamingId,
}: {
  row: TrajectoryRow;
  toolResultByCallId: Map<string, SessionEntry>;
  searchQuery: string;
  streamingId: string | null;
}) {
  if (row.kind === "thinking" && row.content?.thinking) {
    return (
      <ThinkingBlock
        content={ansiToMarkdown(row.content.thinking, { stripColor: true })}
        searchQuery={searchQuery}
        collapsed={false}
      />
    );
  }

  if (row.kind === "image" && row.content?.data && row.content.mimeType) {
    return (
      <img
        className="trajectory-inspector__image"
        src={`data:${row.content.mimeType};base64,${row.content.data}`}
        alt="Trajectory attachment"
      />
    );
  }

  return (
    <SessionEntryRenderer
      entry={row.detailEntry}
      toolResultByCallId={toolResultByCallId}
      searchQuery={searchQuery}
      isStreaming={row.entryId === streamingId}
      previewMode={false}
    />
  );
}

function clampDetailWidth(width: number, splitWidth: number): number {
  const availableMax = Math.max(
    0,
    Math.min(DETAIL_MAX_WIDTH, splitWidth - LEDGER_MIN_WIDTH),
  );
  const availableMin = Math.min(DETAIL_MIN_WIDTH, availableMax);
  return Math.min(availableMax, Math.max(availableMin, width));
}

const TrajectoryRowButton = memo(function TrajectoryRowButton({
  row,
  index,
  selected,
  onSelect,
  onNavigate,
  buttonRef,
  measureRef,
  detailPanelId,
  style,
}: {
  row: TrajectoryRow;
  index: number;
  selected: boolean;
  onSelect: (row: TrajectoryRow) => void;
  onNavigate: (index: number, event: KeyboardEvent<HTMLButtonElement>) => void;
  buttonRef: (element: HTMLButtonElement | null) => void;
  measureRef: (element: HTMLDivElement | null) => void;
  detailPanelId: string;
  style?: CSSProperties;
}) {
  const resultPreview = rowResultPreview(row);
  return (
    <div
      ref={measureRef}
      role="listitem"
      className="trajectory-inspector__row-item"
      data-index={index}
      style={style}
    >
      <button
        ref={buttonRef}
        type="button"
        aria-current={selected ? "true" : undefined}
        aria-controls={selected ? detailPanelId : undefined}
        aria-expanded={selected ? true : undefined}
        aria-label={`Turn ${row.turn || 0}, ${row.label}, ${row.summary}`}
        className="trajectory-inspector__row focus-ring"
        data-kind={row.kind}
        data-status={row.status}
        data-selected={selected || undefined}
        data-turn-start={row.turnStart || undefined}
        data-entry-id={row.entryId}
        data-trajectory-row-id={row.id}
        onClick={() => onSelect(row)}
        onKeyDown={(event) => onNavigate(index, event)}
      >
        <span className="trajectory-inspector__turn-cell">
          {row.turnStart ? (row.turn > 0 ? `T${row.turn}` : "INIT") : ""}
        </span>
        <span className="trajectory-inspector__kind-cell">
          <span className="trajectory-inspector__kind-tag">
            <RowIcon kind={row.kind} />
            <span className="trajectory-inspector__kind-label">{row.label}</span>
          </span>
        </span>
        <span className="trajectory-inspector__summary" title={row.summary}>
          <span className="trajectory-inspector__summary-request">{row.summary}</span>
          {resultPreview && (
            <span
              className="trajectory-inspector__result"
              data-error={row.status === "error" || undefined}
            >
              <ChevronRight aria-hidden="true" />
              <span>{resultPreview}</span>
            </span>
          )}
        </span>
        <span className="trajectory-inspector__time">{formatRowTime(row.timestamp)}</span>
        {selected && <span className="trajectory-inspector__selection-rail" aria-hidden="true" />}
      </button>
    </div>
  );
});

const TrajectoryInspector = forwardRef<
  TrajectoryInspectorRef,
  TrajectoryInspectorProps
>(function TrajectoryInspector({
  entries,
  toolResultByCallId,
  searchQuery,
  currentSearchTarget,
  streamingId,
  scrollTargetId,
  setScrollTargetId,
  externalRevealTarget,
  onExternalRevealHandled,
  hasNewMessages,
  setHasNewMessages,
  isAtBottomRef,
}, ref) {
  const { t } = useTranslation();
  const { ensureToolExpandedForSearch } = useSessionView();
  const deferredEntries = useDeferredValue(entries);
  const deferredToolResultByCallId = useDeferredValue(toolResultByCallId);
  const rows = useMemo(
    () => buildTrajectoryRows(deferredEntries, deferredToolResultByCallId),
    [deferredEntries, deferredToolResultByCallId],
  );
  const instanceId = useId();
  const detailPanelId = `trajectory-detail-panel-${instanceId}`;
  const detailTabPanelId = `trajectory-detail-tabpanel-${instanceId}`;
  const overviewTabId = `trajectory-overview-tab-${instanceId}`;
  const rawTabId = `trajectory-raw-tab-${instanceId}`;
  const splitRef = useRef<HTMLDivElement>(null);
  const ledgerRef = useRef<HTMLDivElement>(null);
  const rowElementsRef = useRef(new Map<string, HTMLButtonElement>());
  const overviewTabRef = useRef<HTMLButtonElement>(null);
  const rawTabRef = useRef<HTMLButtonElement>(null);
  const resizeDragRef = useRef<{
    pointerId: number;
    startX: number;
    startWidth: number;
    splitWidth: number;
  } | null>(null);
  const followsTailRef = useRef(true);
  const initializedRef = useRef(false);
  const previousRowCountRef = useRef(rows.length);
  const [selectedRowId, setSelectedRowId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"overview" | "raw">("overview");
  const [detailWidth, setDetailWidth] = useState<number | null>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    estimateSize: () => ROW_ESTIMATE,
    getItemKey: (index) => rows[index]?.id ?? index,
    getScrollElement: () => ledgerRef.current,
    initialRect: { width: 0, height: 600 },
    observeElementRect: (instance, callback) =>
      observeElementRect(instance, (rect) => {
        callback(rect.height > 0 ? rect : { width: rect.width, height: 600 });
      }),
    overscan: 16,
  });
  const virtualRows = rowVirtualizer.getVirtualItems();

  const selectedRow = useMemo(
    () => rows.find((row) => row.id === selectedRowId),
    [rows, selectedRowId],
  );

  const scrollToTop = useCallback(() => {
    followsTailRef.current = false;
    isAtBottomRef.current = false;
    ledgerRef.current?.scrollTo({ top: 0, behavior: "auto" });
  }, [isAtBottomRef]);

  const scrollToBottom = useCallback(() => {
    const ledger = ledgerRef.current;
    if (!ledger) return;
    followsTailRef.current = true;
    isAtBottomRef.current = true;
    ledger.scrollTo({ top: ledger.scrollHeight, behavior: "auto" });
    setHasNewMessages(false);
  }, [isAtBottomRef, setHasNewMessages]);

  useImperativeHandle(ref, () => ({ scrollToTop, scrollToBottom }), [scrollToBottom, scrollToTop]);

  const revealRow = useCallback((
    row: TrajectoryRow,
    align: "auto" | "center" | "end" | "start" = "center",
  ) => {
    const rowIndex = rows.findIndex((candidate) => candidate.id === row.id);
    setSelectedRowId(row.id);
    setActiveTab("overview");
    if (rowIndex >= 0) {
      rowVirtualizer.scrollToIndex(rowIndex, { align, behavior: "auto" });
    }
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        rowElementsRef.current.get(row.id)?.focus({ preventScroll: true });
      });
    });
  }, [rowVirtualizer, rows]);

  const selectRow = useCallback((row: TrajectoryRow) => {
    setSelectedRowId(row.id);
    setActiveTab("overview");
  }, []);

  const closeDetails = useCallback(() => {
    const rowId = selectedRowId;
    setSelectedRowId(null);
    if (!rowId) return;
    requestAnimationFrame(() => {
      rowElementsRef.current.get(rowId)?.focus({ preventScroll: true });
    });
  }, [selectedRowId]);

  useEffect(() => {
    if (!selectedRow?.toolRenderEntryId) return;
    ensureToolExpandedForSearch(selectedRow.toolRenderEntryId);
  }, [ensureToolExpandedForSearch, selectedRow?.toolRenderEntryId]);

  useEffect(() => {
    if (selectedRowId && !rows.some((row) => row.id === selectedRowId)) {
      setSelectedRowId(null);
    }
  }, [rows, selectedRowId]);

  useEffect(() => {
    const ledger = ledgerRef.current;
    if (!ledger) return;
    if (!initializedRef.current) {
      initializedRef.current = true;
      isAtBottomRef.current = true;
      requestAnimationFrame(() => {
        ledger.scrollTop = ledger.scrollHeight;
      });
      previousRowCountRef.current = rows.length;
      return;
    }

    if (rows.length !== previousRowCountRef.current && followsTailRef.current) {
      requestAnimationFrame(() => {
        ledger.scrollTop = ledger.scrollHeight;
      });
    }
    previousRowCountRef.current = rows.length;
  }, [isAtBottomRef, rows.length]);

  useEffect(() => {
    if (!currentSearchTarget || !searchQuery.trim()) return;
    const normalizedQuery = searchQuery.trim().toLowerCase();
    const toolTarget = rows.find(
      (row) => row.toolRenderEntryId === currentSearchTarget.matchElementId,
    );
    const candidates = rows.filter(
      (row) => row.entryId === currentSearchTarget.rowEntryId,
    );
    const target = toolTarget
      ?? candidates.find((row) => row.searchText.includes(normalizedQuery))
      ?? candidates[0];
    if (!target) return;
    revealRow(target);
  }, [currentSearchTarget, revealRow, rows, searchQuery]);

  useEffect(() => {
    if (!scrollTargetId) return;
    const normalizedQuery = searchQuery.trim().toLowerCase();
    const candidates = rows.filter((row) => row.entryId === scrollTargetId);
    const target = candidates.find((row) => normalizedQuery && row.searchText.includes(normalizedQuery))
      ?? candidates[0];
    if (!target) return;
    revealRow(target);
    setScrollTargetId(null);
  }, [revealRow, rows, scrollTargetId, searchQuery, setScrollTargetId]);

  useEffect(() => {
    if (!externalRevealTarget) return;
    const toolCallId = externalRevealTarget.expandTool
      ? externalRevealTarget.targetEntryId.replace(/^tool-result-/, "")
      : null;
    const target = (toolCallId
      ? rows.find((row) => (
          row.toolRenderEntryId === externalRevealTarget.targetEntryId
          || row.toolCallId === toolCallId
        ))
      : undefined)
      ?? rows.find((row) => row.entryId === externalRevealTarget.rowEntryId);
    if (!target) return;
    revealRow(target, externalRevealTarget.align);
    onExternalRevealHandled();
  }, [externalRevealTarget, onExternalRevealHandled, revealRow, rows]);

  const handleTabKeyDown = useCallback((event: KeyboardEvent<HTMLButtonElement>) => {
    let nextTab: "overview" | "raw" | null = null;
    const currentTab = event.currentTarget === overviewTabRef.current
      ? "overview"
      : "raw";
    if (event.key === "ArrowRight") {
      nextTab = currentTab === "overview" ? "raw" : "overview";
    }
    if (event.key === "ArrowLeft") {
      nextTab = currentTab === "overview" ? "raw" : "overview";
    }
    if (event.key === "End") nextTab = "raw";
    if (event.key === "Home") nextTab = "overview";
    if (!nextTab) return;
    event.preventDefault();
    setActiveTab(nextTab);
    (nextTab === "overview" ? overviewTabRef : rawTabRef).current?.focus();
  }, []);

  const handleRowNavigate = useCallback((index: number, event: KeyboardEvent<HTMLButtonElement>) => {
    let nextIndex: number | null = null;
    if (event.key === "ArrowDown") nextIndex = Math.min(rows.length - 1, index + 1);
    if (event.key === "ArrowUp") nextIndex = Math.max(0, index - 1);
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = rows.length - 1;
    if (nextIndex == null || nextIndex === index) return;
    const nextRow = rows[nextIndex];
    if (!nextRow) return;
    event.preventDefault();
    selectRow(nextRow);
    rowVirtualizer.scrollToIndex(nextIndex, { align: "auto", behavior: "auto" });
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        rowElementsRef.current.get(nextRow.id)?.focus({ preventScroll: true });
      });
    });
  }, [rowVirtualizer, rows, selectRow]);

  const handleLedgerScroll = useCallback(() => {
    const ledger = ledgerRef.current;
    if (!ledger) return;
    const atBottom = ledger.scrollHeight - ledger.clientHeight - ledger.scrollTop <= 24;
    followsTailRef.current = atBottom;
    isAtBottomRef.current = atBottom;
    setIsAtBottom(atBottom);
    if (atBottom && hasNewMessages) setHasNewMessages(false);
  }, [hasNewMessages, isAtBottomRef, setHasNewMessages]);

  const handleResizePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const split = splitRef.current;
    const detail = event.currentTarget.parentElement;
    if (!split || !detail) return;
    resizeDragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startWidth: detail.getBoundingClientRect().width,
      splitWidth: split.getBoundingClientRect().width,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  };

  const handleResizePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = resizeDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    setDetailWidth(
      clampDetailWidth(drag.startWidth + drag.startX - event.clientX, drag.splitWidth),
    );
  };

  const handleResizeKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    const split = splitRef.current;
    const detail = event.currentTarget.parentElement;
    if (!split || !detail) return;
    const direction = event.key === "ArrowLeft" ? 1 : -1;
    setDetailWidth(clampDetailWidth(
      detail.getBoundingClientRect().width + direction * DETAIL_RESIZE_STEP,
      split.getBoundingClientRect().width,
    ));
    event.preventDefault();
  };

  const turnCount = rows.reduce((max, row) => Math.max(max, row.turn), 0);
  const toolCount = rows.filter((row) => row.kind === "tool").length;

  return (
    <div ref={splitRef} className="trajectory-inspector" data-streaming={Boolean(streamingId)}>
      <section className="trajectory-inspector__ledger" aria-label={t("session.trajectory.ledger", "Session trajectory")}>
        <div className="trajectory-inspector__ledger-header">
          <div className="trajectory-inspector__ledger-title">
            <span>{t("session.trajectory.title", "Trajectory")}</span>
            <span className="trajectory-inspector__ledger-counts">
              {turnCount} {t("session.trajectory.turns", "turns")} · {rows.length} {t("session.trajectory.events", "events")} · {toolCount} {t("session.trajectory.tools", "tools")}
            </span>
          </div>
          <span className="trajectory-inspector__ledger-hint">↑↓ {t("session.trajectory.selectHint", "select")}</span>
        </div>
        <div className="trajectory-inspector__columns" aria-hidden="true">
          <span>{t("session.trajectory.turn", "Turn")}</span>
          <span>{t("session.trajectory.event", "Event")}</span>
          <span>{t("session.trajectory.detail", "Detail")}</span>
          <span>{t("session.trajectory.time", "Time")}</span>
        </div>
        <div
          ref={ledgerRef}
          className="trajectory-inspector__rows"
          role="list"
          aria-label={t("session.trajectory.events", "Trajectory events")}
          onScroll={handleLedgerScroll}
        >
          {rows.length > 0 ? (
            <div
              className="trajectory-inspector__virtual-list"
              style={{ height: rowVirtualizer.getTotalSize() }}
            >
              {virtualRows.map((virtualRow) => {
                const row = rows[virtualRow.index];
                if (!row) return null;
                return (
                  <TrajectoryRowButton
                    key={row.id}
                    row={row}
                    index={virtualRow.index}
                    selected={selectedRowId === row.id}
                    onSelect={selectRow}
                    onNavigate={handleRowNavigate}
                    detailPanelId={detailPanelId}
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                    measureRef={(element) => {
                      if (element) {
                        rowVirtualizer.measureElement(element);
                      }
                    }}
                    buttonRef={(element) => {
                      if (element) rowElementsRef.current.set(row.id, element);
                      else rowElementsRef.current.delete(row.id);
                    }}
                  />
                );
              })}
            </div>
          ) : (
            <div className="trajectory-inspector__empty">
              {t("session.noMessages", "No messages")}
            </div>
          )}
        </div>
        {!isAtBottom && hasNewMessages && (
          <NewMessagesButton
            onClick={scrollToBottom}
            title={t("session.scrollToBottom", "Scroll to bottom")}
            label={t("session.newMessages", "New messages")}
          />
        )}
      </section>

      {selectedRow && (
        <>
          <button
            type="button"
            className="trajectory-inspector__backdrop"
            aria-label={t("common.close", "Close")}
            onClick={closeDetails}
          />
          <aside
            id={detailPanelId}
            className="trajectory-inspector__details"
            aria-label={t("session.trajectory.inspector", "Event inspector")}
            style={detailWidth == null ? undefined : { width: detailWidth }}
            onKeyDown={(event) => {
              if (event.key !== "Escape") return;
              event.preventDefault();
              event.stopPropagation();
              closeDetails();
            }}
          >
            <div
              className="trajectory-inspector__resize-handle"
              role="separator"
              aria-label={t("session.trajectory.resize", "Resize event inspector")}
              aria-orientation="vertical"
              aria-valuemin={DETAIL_MIN_WIDTH}
              aria-valuemax={DETAIL_MAX_WIDTH}
              aria-valuenow={detailWidth ?? DETAIL_DEFAULT_WIDTH}
              tabIndex={0}
              title={t("session.trajectory.resizeHint", "Drag to resize. Double-click to reset.")}
              onDoubleClick={() => setDetailWidth(null)}
              onPointerDown={handleResizePointerDown}
              onPointerMove={handleResizePointerMove}
              onPointerUp={(event) => {
                if (resizeDragRef.current?.pointerId !== event.pointerId) return;
                resizeDragRef.current = null;
                event.currentTarget.releasePointerCapture(event.pointerId);
              }}
              onPointerCancel={() => {
                resizeDragRef.current = null;
              }}
              onKeyDown={handleResizeKeyDown}
            />
            <div className="trajectory-inspector__details-header">
              <div className="trajectory-inspector__details-title">
                <span
                  className="trajectory-inspector__kind-tag"
                  data-kind={selectedRow.kind}
                  data-status={selectedRow.status}
                >
                  <RowIcon kind={selectedRow.kind} />
                  <span>{selectedRow.label}</span>
                </span>
                <span className="trajectory-inspector__details-location">
                  {selectedRow.turn > 0 ? `Turn ${selectedRow.turn}` : "Session setup"}
                  {selectedRow.toolCallId ? ` · ${selectedRow.toolCallId}` : ""}
                </span>
              </div>
              <button
                type="button"
                className="trajectory-inspector__close focus-ring"
                aria-label={t("common.close", "Close")}
                onClick={closeDetails}
              >
                <X aria-hidden="true" />
              </button>
            </div>
            <div className="trajectory-inspector__tabs" role="tablist" aria-label={t("session.trajectory.inspector", "Event inspector")}>
              <button
                ref={overviewTabRef}
                id={overviewTabId}
                type="button"
                role="tab"
                aria-controls={detailTabPanelId}
                aria-selected={activeTab === "overview"}
                tabIndex={activeTab === "overview" ? 0 : -1}
                className="trajectory-inspector__tab"
                data-active={activeTab === "overview" || undefined}
                onClick={() => setActiveTab("overview")}
                onKeyDown={handleTabKeyDown}
              >
                {t("session.trajectory.overview", "Overview")}
              </button>
              <button
                ref={rawTabRef}
                id={rawTabId}
                type="button"
                role="tab"
                aria-controls={detailTabPanelId}
                aria-selected={activeTab === "raw"}
                tabIndex={activeTab === "raw" ? 0 : -1}
                className="trajectory-inspector__tab"
                data-active={activeTab === "raw" || undefined}
                onClick={() => setActiveTab("raw")}
                onKeyDown={handleTabKeyDown}
              >
                {t("session.trajectory.raw", "Raw")}
              </button>
            </div>
            <div
              id={detailTabPanelId}
              className="trajectory-inspector__details-body"
              role="tabpanel"
              aria-labelledby={activeTab === "overview" ? overviewTabId : rawTabId}
            >
              {activeTab === "overview" ? (
                <>
                  <dl className="trajectory-inspector__metadata">
                    <div>
                      <dt>{t("session.trajectory.status", "Status")}</dt>
                      <dd data-status={selectedRow.status}>
                        {selectedRow.status === "neutral" ? "recorded" : selectedRow.status}
                      </dd>
                    </div>
                    <div>
                      <dt>{t("session.trajectory.time", "Time")}</dt>
                      <dd>{formatRowTime(selectedRow.timestamp) || "—"}</dd>
                    </div>
                    {selectedRow.sourceEntry.message?.model && (
                      <div>
                        <dt>{t("session.trajectory.model", "Model")}</dt>
                        <dd>{selectedRow.sourceEntry.message.model}</dd>
                      </div>
                    )}
                  </dl>
                  {selectedRow.status === "error" && (
                    <div className="trajectory-inspector__error-banner">
                      <CircleAlert aria-hidden="true" />
                      <span>{t("session.trajectory.error", "This event completed with an error")}</span>
                    </div>
                  )}
                  <div className="trajectory-inspector__rendered">
                    <SelectedRowContent
                      row={selectedRow}
                      toolResultByCallId={toolResultByCallId}
                      searchQuery={searchQuery}
                      streamingId={streamingId}
                    />
                  </div>
                </>
              ) : (
                <pre className="trajectory-inspector__raw">
                  {JSON.stringify(detailRawValue(selectedRow), null, 2)}
                </pre>
              )}
            </div>
          </aside>
        </>
      )}
    </div>
  );
});

TrajectoryInspector.displayName = "TrajectoryInspector";

export default TrajectoryInspector;
