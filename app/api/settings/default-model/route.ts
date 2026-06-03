import { NextResponse } from "next/server";
import { SettingsManager } from "@earendil-works/pi-coding-agent";
import { getAgentDir } from "@/lib/agent-dir";
import { isModelAvailable } from "@/lib/available-models";
import { rejectUnsafeMutation } from "@/lib/local-request-guard";

export const dynamic = "force-dynamic";

export async function PUT(req: Request) {
  const rejected = rejectUnsafeMutation(req);
  if (rejected) return rejected;

  try {
    const body = await req.json() as { provider?: string; modelId?: string };
    if (!body.provider || !body.modelId) {
      return NextResponse.json({ error: "provider and modelId are required" }, { status: 400 });
    }

    if (!isModelAvailable(body.provider, body.modelId)) {
      return NextResponse.json(
        { error: `Model is not available (check connection and models.json): ${body.provider}/${body.modelId}` },
        { status: 400 },
      );
    }

    const settings = SettingsManager.create(process.cwd(), getAgentDir());
    settings.setDefaultModelAndProvider(body.provider, body.modelId);

    return NextResponse.json({
      ok: true,
      defaultModel: { provider: body.provider, modelId: body.modelId },
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
