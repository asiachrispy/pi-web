"use client";

import { useState } from "react";
import { useI18n } from "@/lib/i18n/provider";

export interface SessionStatsSnapshot {
  tokens: { input: number; output: number; cacheRead: number; cacheWrite: number };
  cost?: number;
}

export interface ContextUsageSnapshot {
  percent: number | null;
  contextWindow: number;
  tokens: number | null;
}

interface Props {
  sessionStats: SessionStatsSnapshot | null;
  contextUsage: ContextUsageSnapshot | null;
  paddingRight?: number;
}

function formatCompact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(0)}k`;
  return String(n);
}

export function SessionReportButton({ sessionStats, contextUsage, paddingRight = 48 }: Props) {
  const { t, locale } = useI18n();
  const [hover, setHover] = useState(false);

  if (!sessionStats && !contextUsage) return null;

  const tokens = sessionStats?.tokens;
  const cost = sessionStats?.cost ?? 0;
  const costDisplay = cost > 0 ? `$${cost.toFixed(4)}` : "—";

  let contextLine: string | null = null;
  if (contextUsage?.contextWindow) {
    const pct = contextUsage.percent;
    const used = pct !== null ? `${pct.toFixed(1)}%` : t("common.unknown");
    contextLine = t("appShell.tooltipContext", {
      used,
      total: contextUsage.contextWindow.toLocaleString(locale),
    });
  }

  const summaryParts: string[] = [];
  if (tokens && tokens.input > 0) summaryParts.push(`↑${formatCompact(tokens.input)}`);
  if (tokens && tokens.output > 0) summaryParts.push(`↓${formatCompact(tokens.output)}`);
  if (cost > 0) summaryParts.push(cost >= 0.01 ? `$${cost.toFixed(2)}` : `<$0.01`);

  return (
    <div
      style={{
        marginLeft: "auto",
        position: "relative",
        display: "flex",
        alignItems: "center",
        height: "100%",
        paddingRight,
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <button
        type="button"
        aria-label={t("appShell.sessionReport")}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          height: 28,
          padding: "0 10px",
          border: "none",
          borderRadius: 6,
          background: hover ? "var(--bg-hover)" : "transparent",
          color: hover ? "var(--text)" : "var(--text-muted)",
          cursor: "default",
          fontSize: 11,
          fontVariantNumeric: "tabular-nums",
          whiteSpace: "nowrap",
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <line x1="18" y1="20" x2="18" y2="10" />
          <line x1="12" y1="20" x2="12" y2="4" />
          <line x1="6" y1="20" x2="6" y2="14" />
        </svg>
        {summaryParts.length > 0 ? (
          <span>{summaryParts.join(" · ")}</span>
        ) : (
          <span>{t("appShell.sessionReport")}</span>
        )}
      </button>
      {hover && (
        <div
          role="tooltip"
          style={{
            position: "absolute",
            top: "100%",
            right: 0,
            marginTop: 4,
            zIndex: 600,
            minWidth: 220,
            padding: "10px 12px",
            borderRadius: 8,
            border: "1px solid var(--border)",
            background: "var(--bg-popover)",
            boxShadow: "var(--shadow-popover)",
            fontSize: 12,
            lineHeight: 1.5,
            color: "var(--text)",
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: 8, color: "var(--text)" }}>{t("appShell.sessionReport")}</div>
          {tokens && (
            <dl style={{ margin: 0, display: "grid", gridTemplateColumns: "auto 1fr", gap: "4px 12px" }}>
              <dt style={{ margin: 0, color: "var(--text-dim)" }}>{t("settings.inputTokens")}</dt>
              <dd style={{ margin: 0, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{tokens.input.toLocaleString(locale)}</dd>
              <dt style={{ margin: 0, color: "var(--text-dim)" }}>{t("settings.outputTokens")}</dt>
              <dd style={{ margin: 0, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{tokens.output.toLocaleString(locale)}</dd>
              {tokens.cacheRead > 0 && (
                <>
                  <dt style={{ margin: 0, color: "var(--text-dim)" }}>{t("appShell.reportCacheRead")}</dt>
                  <dd style={{ margin: 0, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{tokens.cacheRead.toLocaleString(locale)}</dd>
                </>
              )}
              {tokens.cacheWrite > 0 && (
                <>
                  <dt style={{ margin: 0, color: "var(--text-dim)" }}>{t("appShell.reportCacheWrite")}</dt>
                  <dd style={{ margin: 0, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{tokens.cacheWrite.toLocaleString(locale)}</dd>
                </>
              )}
              <dt style={{ margin: 0, color: "var(--text-dim)" }}>{t("settings.estimatedCost")}</dt>
              <dd style={{ margin: 0, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{costDisplay}</dd>
            </dl>
          )}
          {contextLine && (
            <div style={{ marginTop: tokens ? 8 : 0, paddingTop: tokens ? 8 : 0, borderTop: tokens ? "1px solid var(--border)" : undefined, color: "var(--text-muted)" }}>
              {contextLine}
            </div>
          )}
          {!tokens && !contextLine && (
            <div style={{ color: "var(--text-muted)" }}>{t("appShell.sessionReportEmpty")}</div>
          )}
        </div>
      )}
    </div>
  );
}
