"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useI18n } from "@/lib/i18n/provider";

interface AgentBrowserStatus {
  available: boolean;
  version?: string;
  installHint?: string;
}

interface WebKitStatus {
  available: boolean;
  platform: "macos" | "other";
}

interface WebFetchStatusResponse {
  agentBrowser: AgentBrowserStatus;
  webkit: WebKitStatus;
  t2Backend: "auto" | "webkit" | "agent-browser";
  cacheTtlMs: number;
}

interface WebFetchPreferences {
  t2Backend: "auto" | "webkit" | "agent-browser";
  cacheTtlMs: number;
}

const CACHE_TTL_OPTIONS = [
  { value: 5 * 60 * 1000, label: "5 min" },
  { value: 60 * 60 * 1000, label: "1 hour" },
  { value: 6 * 60 * 60 * 1000, label: "6 hours" },
  { value: 24 * 60 * 60 * 1000, label: "24 hours" },
];

export function WebFetchSettings() {
  const { t } = useI18n();
  const [status, setStatus] = useState<WebFetchStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [prefs, setPrefs] = useState<WebFetchPreferences | null>(null);
  const [saving, setSaving] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [installLines, setInstallLines] = useState<string[]>([]);
  const installScrollRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/web-fetch/status", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as WebFetchStatusResponse;
      setStatus(data);
      setPrefs({ t2Backend: data.t2Backend, cacheTtlMs: data.cacheTtlMs });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const savePrefs = useCallback(
    async (next: Partial<WebFetchPreferences>) => {
      if (!prefs) return;
      setSaving(true);
      try {
        const res = await fetch("/api/web-fetch/preferences", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(next),
        });
        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(data.error ?? `HTTP ${res.status}`);
        }
        const updated = (await res.json()) as WebFetchPreferences;
        setPrefs(updated);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setSaving(false);
      }
    },
    [prefs],
  );

  const triggerInstall = useCallback(async () => {
    setInstalling(true);
    setInstallLines([]);
    try {
      const res = await fetch("/api/web-fetch/install-agent-browser", { method: "POST" });
      if (!res.ok || !res.body) {
        throw new Error(`HTTP ${res.status}`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        // SSE messages are separated by \n\n
        let sep: number;
        while ((sep = buffer.indexOf("\n\n")) !== -1) {
          const message = buffer.slice(0, sep);
          buffer = buffer.slice(sep + 2);
          const line = message.split("\n").find((l) => l.startsWith("data: "));
          if (!line) continue;
          try {
            const payload = JSON.parse(line.slice(6)) as {
              type: "stdout" | "stderr" | "step" | "step-done" | "error" | "done";
              line?: string;
              label?: string;
              success?: boolean;
            };
            if (payload.type === "done") {
              if (payload.success) {
                setInstallLines((prev) => [...prev, "✓ Install complete"]);
              } else {
                setInstallLines((prev) => [...prev, "✗ Install failed"]);
              }
              // Refresh status
              await load();
            } else if (payload.line) {
              setInstallLines((prev) => [...prev, payload.line!]);
            }
          } catch {
            // ignore non-JSON lines
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setInstalling(false);
    }
  }, [load]);

  useEffect(() => {
    if (installScrollRef.current) {
      installScrollRef.current.scrollTop = installScrollRef.current.scrollHeight;
    }
  }, [installLines]);

  return (
    <section className="mt-6">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="text-[11px] font-semibold uppercase tracking-[0] text-text-dim">
          {t("webFetchSettings.title")}
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="text-[12px] text-accent hover:underline"
        >
          {t("common.retry")}
        </button>
      </div>
      <div className="rounded-[8px] border border-border bg-bg-panel px-4 py-4">
        <p className="m-0 text-[12px] leading-5 text-text-muted">{t("webFetchSettings.description")}</p>

        {loading ? (
          <p className="mb-0 mt-3 text-[12px] text-text-muted">{t("common.loading")}</p>
        ) : error ? (
          <p className="mb-0 mt-3 text-[12px] text-red-600 dark:text-red-400">{error}</p>
        ) : (
          <div className="mt-3 space-y-4">
            {/* agent-browser status */}
            <div className="rounded-[6px] border border-border bg-bg-elevated px-3 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[13px] font-medium text-text">agent-browser</span>
                {status?.agentBrowser.available ? (
                  <span className="rounded-[4px] bg-emerald-500/20 px-1.5 py-0.5 text-[10px] uppercase text-emerald-700 dark:text-emerald-300">
                    {t("webFetchSettings.installed")} · v{status.agentBrowser.version ?? "?"}
                  </span>
                ) : (
                  <span className="rounded-[4px] bg-amber-500/20 px-1.5 py-0.5 text-[10px] uppercase text-amber-700 dark:text-amber-300">
                    {t("webFetchSettings.notInstalled")}
                  </span>
                )}
              </div>
              {!status?.agentBrowser.available && status?.agentBrowser.installHint ? (
                <div className="mt-2 text-[11px] text-text-muted">{status.agentBrowser.installHint}</div>
              ) : null}
              {status && !status.agentBrowser.available ? (
                <div className="mt-3 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void triggerInstall()}
                    disabled={installing}
                    className="h-8 rounded-[7px] bg-accent px-3 text-[12px] font-semibold text-white hover:bg-accent-hover disabled:opacity-50"
                  >
                    {installing ? t("webFetchSettings.installing") : t("webFetchSettings.install")}
                  </button>
                  <span className="text-[10px] text-text-dim">{t("webFetchSettings.installHint")}</span>
                </div>
              ) : null}
              {installLines.length > 0 ? (
                <div
                  ref={installScrollRef}
                  className="mt-3 max-h-40 overflow-y-auto rounded-[4px] bg-bg px-3 py-2 font-mono text-[10px] text-text-muted"
                >
                  {installLines.map((line, i) => (
                    <div key={i}>{line}</div>
                  ))}
                </div>
              ) : null}
            </div>

            {/* macOS WebKit status (P4) */}
            {status?.webkit.platform === "macos" ? (
              <div className="rounded-[6px] border border-border bg-bg-elevated px-3 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[13px] font-medium text-text">macOS WebKit (Pi.app)</span>
                  <span
                    className={`rounded-[4px] px-1.5 py-0.5 text-[10px] uppercase ${
                      status.webkit.available
                        ? "bg-emerald-500/20 text-emerald-700 dark:text-emerald-300"
                        : "bg-bg-hover text-text-dim"
                    }`}
                  >
                    {status.webkit.available
                      ? t("webFetchSettings.available")
                      : t("webFetchSettings.notInPiApp")}
                  </span>
                </div>
                <div className="mt-1 text-[11px] text-text-muted">
                  {t("webFetchSettings.webkitHint")}
                </div>
              </div>
            ) : null}

            {/* T2 backend preference */}
            {prefs ? (
              <div className="rounded-[6px] border border-border bg-bg-elevated px-3 py-3">
                <div className="text-[12px] font-medium text-text">{t("webFetchSettings.t2Backend")}</div>
                <div className="mt-2 space-y-1.5">
                  {(
                    [
                      { value: "auto" as const, label: t("webFetchSettings.t2Auto") },
                      { value: "webkit" as const, label: t("webFetchSettings.t2Webkit") },
                      { value: "agent-browser" as const, label: t("webFetchSettings.t2Agent") },
                    ]
                  ).map((opt) => (
                    <label key={opt.value} className="flex items-center gap-2 text-[12px] text-text">
                      <input
                        type="radio"
                        name="t2Backend"
                        value={opt.value}
                        checked={prefs.t2Backend === opt.value}
                        disabled={saving || (opt.value === "webkit" && status?.webkit.platform !== "macos")}
                        onChange={() => void savePrefs({ t2Backend: opt.value })}
                        className="accent-accent"
                      />
                      {opt.label}
                    </label>
                  ))}
                </div>
              </div>
            ) : null}

            {/* Cache TTL */}
            {prefs ? (
              <div className="rounded-[6px] border border-border bg-bg-elevated px-3 py-3">
                <div className="text-[12px] font-medium text-text">{t("webFetchSettings.cacheTtl")}</div>
                <div className="mt-2 flex items-center gap-3">
                  <select
                    value={prefs.cacheTtlMs}
                    disabled={saving}
                    onChange={(e) => void savePrefs({ cacheTtlMs: Number(e.target.value) })}
                    className="h-8 rounded-[7px] border border-border bg-bg px-2 text-[12px] text-text"
                  >
                    {CACHE_TTL_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            ) : null}
          </div>
        )}

        <p className="mb-0 mt-4 text-[11px] leading-5 text-text-dim">
          {t("webFetchSettings.toolHint")}
        </p>
      </div>
    </section>
  );
}
