import { SettingsManager } from "@earendil-works/pi-coding-agent";
import { getAgentDir } from "@/lib/agent-dir";
import { listAvailableModels } from "@/lib/available-models";
import { requireApiAuth } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const rejected = requireApiAuth(req);
  if (rejected) return rejected;

  const { modelList, nameMap, thinkingLevels, thinkingLevelMaps } = listAvailableModels();
  let defaultModel: { provider: string; modelId: string } | null = null;

  try {
    const settings = SettingsManager.create(process.cwd(), getAgentDir());
    const provider = settings.getDefaultProvider();
    const modelId = settings.getDefaultModel();
    if (provider && modelId) {
      const match = modelList.find((m) => m.provider === provider && m.id === modelId);
      if (match) {
        defaultModel = { provider, modelId };
      }
    }
  } catch { /* ignore */ }

  return Response.json({
    models: Object.fromEntries(nameMap),
    modelList,
    defaultModel,
    thinkingLevels,
    thinkingLevelMaps,
  });
}
