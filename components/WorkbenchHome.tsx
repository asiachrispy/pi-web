"use client";

import { useMemo } from "react";
import { useCachedResource, invalidateControlResource } from "@/hooks/useControlCollection";
import { useI18n } from "@/lib/i18n/provider";
import { fetchWithTimeout } from "@/lib/api-fetch";
import type { ProductHistoryItem } from "@/lib/product-history";

interface Props {
  onStartChat: () => void;
  onOpenHistory: (item: ProductHistoryItem) => void;
  startingChat?: boolean;
  startChatError?: string | null;
  sessionRestoreNotice?: string | null;
  onEnterAdvancedMode?: () => void;
}

interface HistoryResponse {
  history?: ProductHistoryItem[];
  error?: string;
}

const fetchRecentHistory = async (): Promise<ProductHistoryItem[]> => {
  const res = await fetchWithTimeout("/api/history", { cache: "no-store" });
  const data = (await res.json()) as HistoryResponse;
  if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
  if (data.error) throw new Error(data.error);
  return data.history ?? [];
};

export function WorkbenchHome({
  onStartChat,
  onOpenHistory,
  startingChat,
  startChatError,
  sessionRestoreNotice,
  onEnterAdvancedMode,
}: Props) {
  const { t, locale } = useI18n();
  const history = useCachedResource<ProductHistoryItem[]>(
    "workbench:history:recent",
    fetchRecentHistory,
    { staleMs: 15_000, retries: 1 },
  );

  const recent = useMemo(
    () => (history.data ?? []).slice(0, 5),
    [history.data],
  );

  const handleOpenHistory = (item: ProductHistoryItem) => {
    invalidateControlResource("workbench:history:recent");
    onOpenHistory(item);
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-5 px-5 py-5">
        <div className="border-b border-border pb-4">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0] text-text-dim">{t("workbenchHome.enterpriseWorkbench")}</div>
            <h1 className="m-0 mt-1 text-[24px] font-semibold leading-tight tracking-[0] text-text">{t("workbenchHome.title")}</h1>
            <p className="m-0 mt-2 max-w-[640px] text-[13px] leading-6 text-text-muted">{t("workbenchHome.description")}</p>
          </div>
        </div>

        {sessionRestoreNotice ? (
          <p className="m-0 max-w-[640px] text-[13px] text-amber-700 dark:text-amber-400">
            {sessionRestoreNotice}
          </p>
        ) : null}
        {startChatError ? (
          <p className="m-0 max-w-[640px] text-[13px] text-red-600 dark:text-red-400">
            {t("workbenchHome.startChatError", { error: startChatError })}
          </p>
        ) : null}
        <button
          type="button"
          onClick={onStartChat}
          disabled={startingChat}
          className="flex w-full max-w-[320px] items-center justify-center rounded-[8px] bg-accent px-4 py-3 text-[14px] font-semibold text-white hover:bg-accent-hover disabled:opacity-60"
        >
          {startingChat ? t("workbenchHome.startingChat") : t("workbenchHome.newChat")}
        </button>

        <section className="mt-2">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="m-0 text-[14px] font-semibold text-text">{t("workbenchHome.myWork")}</h2>
            <span className="text-[11px] text-text-dim">{t("workbenchHome.recentWorkDescription")}</span>
          </div>
          <div className="overflow-hidden rounded-[8px] border border-border bg-bg-panel">
            {recent.length === 0 ? (
              <div className="p-4 text-[13px] text-text-muted">
                {history.error
                  ? t("workbenchHome.recentWorkError", { error: history.error })
                  : t("workbenchHome.noRecentWork")}
              </div>
            ) : (
              recent.map((item) => (
                <button
                  key={item.sessionId}
                  onClick={() => handleOpenHistory(item)}
                  className="flex w-full items-center gap-3 border-b border-border px-4 py-3 text-left last:border-b-0 hover:bg-bg-hover"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-medium text-text">{item.title}</div>
                    <div className="mt-1 truncate text-[12px] text-text-muted">{item.summary}</div>
                  </div>
                  <div className="shrink-0 text-[11px] text-text-dim">{new Date(item.updatedAt).toLocaleDateString(locale)}</div>
                </button>
              ))
            )}
          </div>
        </section>
        {onEnterAdvancedMode && (
          <div className="pt-2">
            <button
              type="button"
              onClick={onEnterAdvancedMode}
              className="text-[12px] text-text-dim underline hover:text-text-muted"
            >
              {t("settings.advancedMode")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
