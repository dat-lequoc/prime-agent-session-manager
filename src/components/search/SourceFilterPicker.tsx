import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";
import { useTranslation } from "react-i18next";

import {
  AgentColorIcon,
  getAgentIconColor,
} from "@/components/session-viewer/AgentIcon";

export interface SourceFilterPickerProps {
  sourceOptions: Array<{ slug: string; label: string }>;
  selectedSourceSlugs: string[];
  onSourceFilterChange: (slugs: string[]) => void;
  compact?: boolean;
}

type MenuPosition = {
  top: number;
  left: number;
};

export default function SourceFilterPicker({
  sourceOptions,
  selectedSourceSlugs,
  onSourceFilterChange,
  compact = false,
}: SourceFilterPickerProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState<MenuPosition>({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const summary = useMemo(() => {
    if (selectedSourceSlugs.length === 0) {
      return t("tags.filter.allHarnesses", "All harnesses");
    }
    if (selectedSourceSlugs.length === 1) {
      return sourceOptions.find((source) => source.slug === selectedSourceSlugs[0])?.label
        ?? selectedSourceSlugs[0];
    }
    return t("tags.filter.harnessesSelected", {
      count: selectedSourceSlugs.length,
      defaultValue: "{{count}} selected",
    });
  }, [selectedSourceSlugs, sourceOptions, t]);

  useEffect(() => {
    if (!open) return;

    const updatePosition = () => {
      const trigger = triggerRef.current;
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      const menuWidth = 240;
      const viewportPadding = 8;
      setMenuPosition({
        top: rect.bottom + 6,
        left: Math.max(
          viewportPadding,
          Math.min(rect.left, window.innerWidth - menuWidth - viewportPadding),
        ),
      });
    };

    const closeOnOutsidePress = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node;
      if (
        !triggerRef.current?.contains(target)
        && !menuRef.current?.contains(target)
      ) {
        setOpen(false);
      }
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    document.addEventListener("mousedown", closeOnOutsidePress);
    document.addEventListener("touchstart", closeOnOutsidePress);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
      document.removeEventListener("mousedown", closeOnOutsidePress);
      document.removeEventListener("touchstart", closeOnOutsidePress);
    };
  }, [open]);

  if (sourceOptions.length === 0) return null;

  const ariaLabel = t("tags.filter.harnessFilter", {
    selection: summary,
    defaultValue: "Harness filter: {{selection}}",
  });

  return (
    <div className="shrink-0">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-label={ariaLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        title={ariaLabel}
        className={`inline-flex h-7 max-w-[148px] items-center gap-1.5 rounded-md border border-border/60 bg-secondary/55 px-2 text-[11px] text-foreground motion-color hover:bg-secondary focus-ring ${
          compact ? "max-w-[122px]" : ""
        }`}
      >
        <span className="flex shrink-0" aria-hidden="true">
          <AgentColorIcon
            source={selectedSourceSlugs.length === 1 ? selectedSourceSlugs[0] : "all"}
            size={13}
            style={{
              color: selectedSourceSlugs.length === 1
                ? getAgentIconColor(selectedSourceSlugs[0])
                : undefined,
            }}
          />
        </span>
        <span className="truncate">{summary}</span>
        <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden="true" />
      </button>

      {open && createPortal(
        <div
          ref={menuRef}
          role="menu"
          aria-label={t("tags.filter.harnesses", "Harnesses")}
          style={{
            position: "fixed",
            top: menuPosition.top,
            left: menuPosition.left,
          }}
          className="z-[75] w-[240px] overflow-hidden rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-lg motion-overlay-surface motion-overlay-surface-enter"
        >
          <div className="px-2 py-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            {t("tags.filter.harnesses", "Harnesses")}
          </div>
          <button
            type="button"
            role="menuitemcheckbox"
            aria-checked={selectedSourceSlugs.length === 0}
            onClick={() => onSourceFilterChange([])}
            className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-[12px] hover:bg-muted motion-color focus-ring"
          >
            <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded border border-border bg-background" aria-hidden="true">
              {selectedSourceSlugs.length === 0 ? <Check className="h-3 w-3" strokeWidth={2.5} /> : null}
            </span>
            <span className="flex-1 text-left">{t("tags.filter.allHarnesses", "All harnesses")}</span>
          </button>
          <div className="mx-2 my-1 border-t border-border/60" />
          {sourceOptions.map((source) => {
            const selected = selectedSourceSlugs.includes(source.slug);
            return (
              <button
                key={source.slug}
                type="button"
                role="menuitemcheckbox"
                aria-checked={selected}
                onClick={() => {
                  onSourceFilterChange(
                    selected
                      ? selectedSourceSlugs.filter((slug) => slug !== source.slug)
                      : [...new Set([...selectedSourceSlugs, source.slug])],
                  );
                }}
                className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-[12px] hover:bg-muted motion-color focus-ring"
              >
                <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded border border-border bg-background" aria-hidden="true">
                  {selected ? <Check className="h-3 w-3" strokeWidth={2.5} /> : null}
                </span>
                <span className="flex shrink-0" aria-hidden="true">
                  <AgentColorIcon
                    source={source.slug}
                    size={13}
                    style={{ color: getAgentIconColor(source.slug) }}
                  />
                </span>
                <span className="flex-1 text-left">{source.label}</span>
              </button>
            );
          })}
        </div>,
        document.body,
      )}
    </div>
  );
}
