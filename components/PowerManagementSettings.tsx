"use client";

import { useEffect, useState, useCallback } from "react";
import { useI18n } from "@/lib/i18n/provider";

type PowerMode = "none" | "autoTask" | "alwaysOn";

interface Props {
  /** Optional override for initial keepAwakeAlways value. */
  initialKeepAwakeAlways?: boolean;
}

/**
 * Settings panel section that controls the macOS Pi.app power assertion.
 *
 * - "Auto-prevent while a task is running" is implicit and not exposed here
 *   (useAgentSession always drives preventSleep/allowSleep on stream state).
 * - "Always prevent system sleep while Pi is open" is the user-controllable
 *   opt-in that pins the system awake for the whole session regardless of
 *   whether anything is happening.
 *
 * The status row reads the assertion state directly from the native bridge
 * so the user can confirm what the OS actually has.
 */
export function PowerManagementSettings({ initialKeepAwakeAlways = false }: Props) {
  const { t } = useI18n();
  const [keepAwakeAlways, setKeepAwakeAlways] = useState(initialKeepAwakeAlways);
  const [saving, setSaving] = useState(false);
  const [powerMode, setPowerMode] = useState<PowerMode>("none");
  const [bridgeAvailable, setBridgeAvailable] = useState(false);

  const refreshPowerState = useCallback(async () => {
    if (typeof window === "undefined") return;
    const bridge = window.piNative;
    if (!bridge?.getPowerState) {
      setBridgeAvailable(false);
      return;
    }
    setBridgeAvailable(true);
    try {
      const state = await bridge.getPowerState();
      if (state && typeof state.mode === "string") {
        setPowerMode(state.mode as PowerMode);
      }
    } catch {
      // best-effort; ignore
    }
  }, []);

  useEffect(() => {
    // On mount, fetch the saved preference and apply it to the bridge.
    void (async () => {
      try {
        const res = await fetch("/api/preferences", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { preferences?: { keepAwakeAlways?: boolean } };
        const enabled = Boolean(data.preferences?.keepAwakeAlways);
        setKeepAwakeAlways(enabled);
        window.piNative?.setKeepAwakeAlways?.(enabled);
      } catch {
        // ignore
      } finally {
        void refreshPowerState();
      }
    })();
  }, [refreshPowerState]);

  const handleToggle = useCallback(
    async (next: boolean) => {
      setKeepAwakeAlways(next);
      setSaving(true);
      try {
        // Tell the bridge first so the OS sees the change immediately even
        // if the server write fails.
        window.piNative?.setKeepAwakeAlways?.(next);
        await fetch("/api/preferences", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ keepAwakeAlways: next }),
        });
      } catch {
        // ignore — UI state already updated
      } finally {
        setSaving(false);
        void refreshPowerState();
      }
    },
    [refreshPowerState],
  );

  const statusLabel = bridgeAvailable
    ? powerMode === "alwaysOn"
      ? t("workbenchSettings.powerStatusAlwaysOn")
      : powerMode === "autoTask"
        ? t("workbenchSettings.powerStatusAuto")
        : t("workbenchSettings.powerStatusReleased")
    : t("workbenchSettings.powerStatusBrowserOnly");

  const statusColor =
    powerMode === "none" ? "var(--text-muted)" : "var(--accent)";

  return (
    <section className="mt-6">
      <div className="mb-2">
        <div className="text-[11px] font-semibold uppercase tracking-[0] text-text-dim">
          {t("workbenchSettings.powerTitle")}
        </div>
      </div>
      <div className="rounded-[8px] border border-border bg-bg-panel px-4 py-4 text-[12px] leading-6 text-text-muted">
        <p className="m-0">{t("workbenchSettings.powerDescription")}</p>

        <label
          className="mt-3 flex cursor-pointer items-start gap-3"
          style={{ cursor: saving ? "wait" : "pointer" }}
        >
          <input
            type="checkbox"
            checked={keepAwakeAlways}
            disabled={saving}
            onChange={(e) => void handleToggle(e.target.checked)}
            className="mt-[2px] h-4 w-4 cursor-pointer"
          />
          <div className="min-w-0 flex-1">
            <div className="text-[12px] font-medium text-text">
              {t("workbenchSettings.powerAlwaysOnLabel")}
            </div>
            <div className="mt-1 text-[11px] text-text-muted">
              {t("workbenchSettings.powerAlwaysOnHint")}
            </div>
          </div>
        </label>

        <div
          className="mt-3 flex items-center gap-2 border-t pt-3"
          style={{ borderColor: "var(--border)" }}
        >
          <span
            aria-hidden
            style={{
              display: "inline-block",
              width: 8,
              height: 8,
              borderRadius: 999,
              background: statusColor,
              flexShrink: 0,
            }}
          />
          <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
            {t("workbenchSettings.powerStatusLabel")}
            {" "}
            <span className="font-mono" style={{ color: statusColor }}>
              {statusLabel}
            </span>
          </span>
        </div>
      </div>
    </section>
  );
}
