import type { ProductHistoryItem } from "./product-history";

export interface UsageSummary {
  totalRuns: number;
  activeRuns: number;
  completedRuns: number;
  generatedAt: string;
}

export function buildUsageSummary(
  history: ProductHistoryItem[],
  generatedAt = new Date().toISOString(),
): UsageSummary {
  const totalRuns = history.length;
  const completedRuns = history.filter((item) => item.status === "completed").length;
  const activeRuns = history.filter((item) => item.status === "active").length;

  return {
    totalRuns,
    activeRuns,
    completedRuns,
    generatedAt,
  };
}
