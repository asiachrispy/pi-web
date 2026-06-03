import type { SessionInfo } from "./types";
import type { ProductSessionMetadataMap } from "./scene-metadata";

export type ProductSessionStatus = "active" | "completed" | "draft";

export interface ProductHistoryItem {
  sessionId: string;
  path: string;
  cwd: string;
  title: string;
  status: ProductSessionStatus;
  summary: string;
  startedAt: string;
  updatedAt: string;
  messageCount: number;
  firstMessage: string;
}

export function buildHistoryItems(
  sessions: SessionInfo[],
  metadata: ProductSessionMetadataMap,
): ProductHistoryItem[] {
  return sessions
    .map((session) => {
      const item = metadata[session.id];
      const title = item?.title || session.name || session.firstMessage || "(untitled)";
      return {
        sessionId: session.id,
        path: session.path,
        cwd: session.cwd,
        title,
        status: item?.status ?? "active",
        summary: item?.lastResultSummary ?? session.firstMessage ?? "",
        startedAt: item?.startedAt ?? session.created,
        updatedAt: item?.updatedAt ?? session.modified,
        messageCount: session.messageCount,
        firstMessage: session.firstMessage,
      };
    })
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
