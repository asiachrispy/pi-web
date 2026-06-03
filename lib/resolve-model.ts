import { AuthStorage, ModelRegistry } from "@earendil-works/pi-coding-agent";
import { join } from "node:path";
import { getAgentDir } from "@/lib/agent-dir";
import type { AgentSessionLike, ModelLike } from "@/lib/pi-types";

type ModelRegistryLike = AgentSessionLike["modelRegistry"];

function findInRegistry(registry: ModelRegistryLike, provider: string, modelId: string) {
  return registry.find(provider, modelId)
    ?? registry.find(provider, modelId.toLowerCase())
    ?? registry.getAll().find((m) => m.provider === provider && m.id.toLowerCase() === modelId.toLowerCase());
}

function createDiskRegistry(): ModelRegistry {
  return ModelRegistry.create(AuthStorage.create(), join(getAgentDir(), "models.json"));
}

/** Resolve a model from the live session registry, refreshing from disk first. */
export function lookupModel(
  registry: ModelRegistryLike,
  provider: string,
  modelId: string,
): ModelLike | undefined {
  registry.refresh();
  const fromSession = findInRegistry(registry, provider, modelId);
  if (fromSession) return fromSession;

  const fresh = createDiskRegistry();
  const loadError = fresh.getError();
  if (loadError) throw new Error(loadError);

  const fromDisk = findInRegistry(fresh, provider, modelId);
  if (!fromDisk) return undefined;

  registry.refresh();
  return findInRegistry(registry, provider, modelId) ?? fromDisk;
}
