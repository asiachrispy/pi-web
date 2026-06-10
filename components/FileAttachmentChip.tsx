"use client";

import type { CSSProperties } from "react";
import type { FileAttachmentKind } from "@/lib/message-file-refs";
import { fileAttachmentKindFromName } from "@/lib/message-file-refs";

interface Props {
  name: string;
  path?: string;
  onRemove?: () => void;
  onOpen?: () => void;
  /** User bubble (light text on blue) vs input bar (theme tokens). */
  variant?: "input" | "message";
}

function FileTypeIcon({ kind, size }: { kind: FileAttachmentKind; size: number }) {
  const s = size;
  switch (kind) {
    case "pdf":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" aria-hidden>
          <rect x="4" y="2" width="16" height="20" rx="2" fill="#E53935" />
          <text x="12" y="15" textAnchor="middle" fill="#fff" fontSize="7" fontWeight="700" fontFamily="system-ui,sans-serif">PDF</text>
        </svg>
      );
    case "excel":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" aria-hidden>
          <rect x="4" y="2" width="16" height="20" rx="2" fill="#1D6F42" />
          <path d="M8 7h8M8 11h8M8 15h8M12 7v8" stroke="#fff" strokeWidth="1.2" opacity="0.9" />
        </svg>
      );
    case "word":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" aria-hidden>
          <rect x="4" y="2" width="16" height="20" rx="2" fill="#2B579A" />
          <text x="12" y="15" textAnchor="middle" fill="#fff" fontSize="9" fontWeight="700" fontFamily="system-ui,sans-serif">W</text>
        </svg>
      );
    case "markdown":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" aria-hidden>
          <rect x="4" y="2" width="16" height="20" rx="2" fill="#455A64" />
          <text x="12" y="15" textAnchor="middle" fill="#fff" fontSize="8" fontWeight="700" fontFamily="system-ui,sans-serif">MD</text>
        </svg>
      );
    default:
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
        </svg>
      );
  }
}

export function FileAttachmentChip({ name, path, onRemove, onOpen, variant = "input" }: Props) {
  const displayName = name?.trim() || "file";
  const kind = fileAttachmentKindFromName(displayName);
  const isMessage = variant === "message";
  const clickable = Boolean(onOpen && path);

  const chipBody = (
    <>
      <span style={{ flexShrink: 0, display: "flex", color: isMessage ? "#fff" : "var(--text-muted)" }}>
        <FileTypeIcon kind={kind} size={18} />
      </span>
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>
        {displayName}
      </span>
      {onRemove && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          style={{
            flexShrink: 0,
            width: 16,
            height: 16,
            border: "none",
            background: "none",
            cursor: "pointer",
            padding: 0,
            color: isMessage ? "rgba(255,255,255,0.7)" : "var(--text-muted)",
          }}
        >
          <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.5">
            <line x1="1" y1="1" x2="7" y2="7" />
            <line x1="7" y1="1" x2="1" y2="7" />
          </svg>
        </button>
      )}
    </>
  );

  const chipStyle: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    maxWidth: 280,
    padding: "4px 8px",
    borderRadius: 8,
    border: isMessage ? "1px solid rgba(255,255,255,0.24)" : "1px solid var(--border)",
    background: isMessage ? "rgba(0,0,0,0.12)" : "var(--bg-panel)",
    fontSize: 12,
    color: isMessage ? "#fff" : "var(--text)",
    font: "inherit",
  };

  const activateOpen = () => onOpen?.();

  return (
    <div
      title={path ?? displayName}
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      onClick={clickable ? activateOpen : undefined}
      onKeyDown={
        clickable
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                activateOpen();
              }
            }
          : undefined
      }
      style={{
        ...chipStyle,
        cursor: clickable ? "pointer" : undefined,
        transition: clickable ? "background 0.12s, border-color 0.12s" : undefined,
      }}
      onMouseEnter={
        clickable
          ? (e) => {
              e.currentTarget.style.background = isMessage ? "rgba(255,255,255,0.16)" : "var(--bg-hover)";
            }
          : undefined
      }
      onMouseLeave={
        clickable
          ? (e) => {
              e.currentTarget.style.background = isMessage ? "rgba(0,0,0,0.12)" : "var(--bg-panel)";
            }
          : undefined
      }
    >
      {chipBody}
    </div>
  );
}
