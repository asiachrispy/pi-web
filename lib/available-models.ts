import { getSupportedThinkingLevels } from "@earendil-works/pi-ai";
import { AuthStorage, ModelRegistry } from "@earendil-works/pi-coding-agent";

export interface AvailableModelSummary {
  id: string;
  name: string;
  provider: string;
}

export function listAvailableModels(): {
  modelList: AvailableModelSummary[];
  nameMap: Map<string, string>;
  thinkingLevels: Record<string, string[]>;
  thinkingLevelMaps: Record<string, Record<string, string | null>>;
} {
  const nameMap = new Map<string, string>();
  const thinkingLevels: Record<string, string[]> = {};
  const thinkingLevelMaps: Record<string, Record<string, string | null>> = {};
  const modelList: AvailableModelSummary[] = [];

  try {
    const authStorage = AuthStorage.create();
    const registry = ModelRegistry.create(authStorage);
    const available = registry.getAvailable();
    for (const m of available) {
      modelList.push({ id: m.id, name: m.name, provider: m.provider });
      const key = `${m.provider}:${m.id}`;
      nameMap.set(key, m.name);
      thinkingLevels[key] = getSupportedThinkingLevels(m);
      if (m.thinkingLevelMap) thinkingLevelMaps[key] = m.thinkingLevelMap;
    }
  } catch {
    // return empty
  }

  return { modelList, nameMap, thinkingLevels, thinkingLevelMaps };
}

export function isModelAvailable(provider: string, modelId: string): boolean {
  const { modelList } = listAvailableModels();
  return modelList.some((m) => m.provider === provider && m.id === modelId);
}
