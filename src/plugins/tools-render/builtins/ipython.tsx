import { useMemo } from "react";

import CodeBlock from "@/components/ui/CodeBlock";
import ToolHeader from "@/components/tool-calls/ToolHeader";
import ToolSectionHeader from "@/components/tool-calls/ToolSectionHeader";
import type { Content, SessionEntry } from "@/types";
import type { ResolvedToolData, ToolRenderPlugin, ToolRenderProps } from "@/plugins/tools-render/types";
import { defaultResolveData } from "@/plugins/tools-render/utils/resolveData";
import { getToolExecutionClass, getToolRenderStatus, getToolStatusLabel } from "@/plugins/tools-render/utils/status";

interface IpythonDetails {
  durationMs?: number;
  status?: string;
  stdout?: string;
  stderr?: string;
  kernelRestarted?: boolean;
  sentAgentMessages?: unknown[];
}

interface IpythonToolData extends ResolvedToolData {
  code: string;
  details: IpythonDetails;
}

function resolveIpythonData(toolCall: Content, index: number, toolResultByCallId: Map<string, SessionEntry>): IpythonToolData {
  const base = defaultResolveData(toolCall, index, toolResultByCallId);
  const details = (base.result?.message?.details || {}) as IpythonDetails;
  return {
    ...base,
    code: typeof base.args.code === "string" ? base.args.code : "",
    details,
    output: details.stdout || base.output,
    isError: base.isError || details.status === "error" || Boolean(details.stderr),
  };
}

function IpythonExecution({ resolvedData, searchQuery, context }: ToolRenderProps<IpythonToolData>) {
  const { code, output, details, entryId } = resolvedData;
  const { isExpanded, toggleExpanded, copyToClipboard, disableSuccessStyle, t } = context;
  const status = getToolRenderStatus(resolvedData);
  const sentMessageCount = Array.isArray(details.sentAgentMessages) ? details.sentAgentMessages.length : 0;
  const duration = useMemo(() => {
    if (typeof details.durationMs !== "number") return null;
    return details.durationMs < 1_000 ? `${details.durationMs}ms` : `${(details.durationMs / 1_000).toFixed(1)}s`;
  }, [details.durationMs]);

  return (
    <div className={`tool-execution ${getToolExecutionClass(resolvedData, disableSuccessStyle)}`} id={`entry-${entryId}`}>
      <ToolHeader expandable={Boolean(code || output || details.stderr)} expanded={isExpanded} onToggle={toggleExpanded} ariaLabel={`IPython: ${getToolStatusLabel(status, t)}`}>
        <span className="tool-expand-indicator">{isExpanded ? "▾" : "▸"}</span>
        <span className="tool-name">◉ IPython</span>
        {code && <span className="tool-generic-args-preview truncate font-mono" title={code}>{code.split("\n")[0]}</span>}
        {duration && <span className="tool-detail">{duration}</span>}
        {sentMessageCount > 0 && <span className="tool-detail">{sentMessageCount} agent msg</span>}
        {details.kernelRestarted && <span className="tool-detail" style={{ color: "var(--warning)" }}>kernel restarted</span>}
        <span className={`tool-status tool-status-${status}`}>{getToolStatusLabel(status, t)}</span>
      </ToolHeader>

      {isExpanded && code && (
        <div className="tool-command-detail">
          <ToolSectionHeader label="Python cell" text={code} copyText={copyToClipboard} />
          <CodeBlock code={code} language="python" scrollable maxHeight={420} searchQuery={searchQuery} />
        </div>
      )}
      {isExpanded && output && (
        <div className="tool-output-wrapper">
          <ToolSectionHeader label="stdout" text={output} copyText={copyToClipboard} />
          <CodeBlock code={output} language="text" scrollable maxHeight={420} searchQuery={searchQuery} />
        </div>
      )}
      {isExpanded && details.stderr && (
        <div className="tool-output-wrapper">
          <ToolSectionHeader label="stderr" text={details.stderr} copyText={copyToClipboard} />
          <CodeBlock code={details.stderr} language="text" scrollable maxHeight={320} searchQuery={searchQuery} />
        </div>
      )}
    </div>
  );
}

export const ipythonToolPlugin: ToolRenderPlugin<IpythonToolData> = {
  id: "builtin-prime-ipython",
  name: "Prime IPython",
  description: "Persistent Prime-Agent IPython cells and kernel results",
  match: toolCall => toolCall.name === "ipython",
  priority: 180,
  component: IpythonExecution,
  resolveData: resolveIpythonData,
  getSearchSegments: (_toolCall, data) => [data.code, data.output, data.details.stderr || ""],
  getPreview: (_toolCall, data) => data.code.split("\n")[0] || "IPython cell",
};
