export interface ModelCost {
  input?: number;
  output?: number;
  cacheRead?: number;
  cacheWrite?: number;
}

export interface NormalizedModelEntry {
  id: string;
  name?: string;
  api?: string;
  baseUrl?: string;
  reasoning?: boolean;
  thinkingLevelMap?: Record<string, string | null>;
  input?: ("text" | "image")[];
  contextWindow?: number;
  maxTokens?: number;
  cost?: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
  };
  compat?: Record<string, unknown>;
  headers?: Record<string, string>;
}

export interface NormalizedProviderEntry {
  name?: string;
  baseUrl?: string;
  apiKey?: string;
  api?: string;
  headers?: Record<string, string>;
  compat?: Record<string, unknown>;
  authHeader?: boolean;
  models?: NormalizedModelEntry[];
  modelOverrides?: Record<string, unknown>;
}

export interface NormalizedModelsJson {
  providers: Record<string, NormalizedProviderEntry>;
}

const COST_FIELDS = ["input", "output", "cacheRead", "cacheWrite"] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function definedNumber(value: unknown): number | undefined {
  if (typeof value !== "number" || Number.isNaN(value)) return undefined;
  return value;
}

/** Accept in-progress decimal text like "0." while typing. */
export function isPartialDecimalInput(value: string): boolean {
  return value === "" || /^-?\d*(\.\d*)?$/.test(value);
}

export function parseCostFieldValue(value: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed || trimmed === "." || trimmed === "-" || trimmed.endsWith(".") || trimmed === "-.") return undefined;
  const n = parseFloat(trimmed);
  return Number.isNaN(n) ? undefined : n;
}

/** models.json requires all four cost fields when cost is present. */
export function normalizeModelCost(cost: ModelCost | undefined): NormalizedModelEntry["cost"] | undefined {
  if (!cost) return undefined;
  const values = COST_FIELDS.map((field) => definedNumber(cost[field]));
  if (!values.some((value) => value !== undefined)) return undefined;
  return {
    input: values[0] ?? 0,
    output: values[1] ?? 0,
    cacheRead: values[2] ?? 0,
    cacheWrite: values[3] ?? 0,
  };
}

export function normalizeModelEntry(model: Record<string, unknown>): NormalizedModelEntry {
  const id = typeof model.id === "string" ? model.id.trim() : "";
  const entry: NormalizedModelEntry = { id };

  if (typeof model.name === "string" && model.name.trim()) entry.name = model.name.trim();
  if (typeof model.api === "string" && model.api.trim()) entry.api = model.api.trim();
  if (typeof model.baseUrl === "string" && model.baseUrl.trim()) entry.baseUrl = model.baseUrl.trim();
  if (model.reasoning === true) entry.reasoning = true;
  if (isRecord(model.thinkingLevelMap)) entry.thinkingLevelMap = model.thinkingLevelMap as Record<string, string | null>;
  if (Array.isArray(model.input) && model.input.length > 0) {
    entry.input = model.input.filter((item): item is "text" | "image" => item === "text" || item === "image");
  }

  const contextWindow = definedNumber(model.contextWindow);
  if (contextWindow !== undefined && contextWindow > 0) entry.contextWindow = contextWindow;

  const maxTokens = definedNumber(model.maxTokens);
  if (maxTokens !== undefined && maxTokens > 0) entry.maxTokens = maxTokens;

  const cost = normalizeModelCost(isRecord(model.cost) ? model.cost as ModelCost : undefined);
  if (cost) entry.cost = cost;

  if (isRecord(model.compat) && Object.keys(model.compat).length > 0) entry.compat = model.compat;
  if (isRecord(model.headers) && Object.keys(model.headers).length > 0) {
    const headers: Record<string, string> = {};
    for (const [key, value] of Object.entries(model.headers)) {
      if (typeof value === "string" && value.length > 0) headers[key] = value;
    }
    if (Object.keys(headers).length > 0) entry.headers = headers;
  }

  return entry;
}

export function normalizeProviderEntry(provider: Record<string, unknown>): NormalizedProviderEntry {
  const entry: NormalizedProviderEntry = {};

  if (typeof provider.name === "string" && provider.name.trim()) entry.name = provider.name.trim();
  if (typeof provider.baseUrl === "string" && provider.baseUrl.trim()) entry.baseUrl = provider.baseUrl.trim();
  if (typeof provider.apiKey === "string" && provider.apiKey.trim()) entry.apiKey = provider.apiKey.trim();
  if (typeof provider.api === "string" && provider.api.trim()) entry.api = provider.api.trim();
  if (provider.authHeader === true) entry.authHeader = true;

  if (isRecord(provider.headers) && Object.keys(provider.headers).length > 0) {
    const headers: Record<string, string> = {};
    for (const [key, value] of Object.entries(provider.headers)) {
      if (typeof value === "string" && value.length > 0) headers[key] = value;
    }
    if (Object.keys(headers).length > 0) entry.headers = headers;
  }

  if (isRecord(provider.compat) && Object.keys(provider.compat).length > 0) entry.compat = provider.compat;

  if (Array.isArray(provider.models)) {
    entry.models = provider.models
      .filter(isRecord)
      .map(normalizeModelEntry)
      .filter((model) => model.id.length > 0);
    if (entry.models.length === 0) delete entry.models;
  }

  if (isRecord(provider.modelOverrides) && Object.keys(provider.modelOverrides).length > 0) {
    entry.modelOverrides = provider.modelOverrides;
  }

  return entry;
}

/** Image/video generation models use non-chat endpoints and cannot be tested via chat completions. */
export function isChatTestableModelId(modelId: string): boolean {
  const id = modelId.trim().toLowerCase();
  if (!id) return false;
  if (/(^|-)image(-|$)/.test(id)) return false;
  if (/(^|-)video(-|$)/.test(id)) return false;
  if (/^dall-e/.test(id)) return false;
  if (/^gpt-image/.test(id)) return false;
  if (/^imagen-/.test(id)) return false;
  if (/^flux-/.test(id)) return false;
  return true;
}

export function isReasoningEffortUnsupportedError(error: string): boolean {
  const text = error.toLowerCase();
  return text.includes("reasoning_effort") && (text.includes("unsupportedparams") || text.includes("does not support parameters"));
}

export function normalizeModelsJson(data: unknown): NormalizedModelsJson {
  if (!isRecord(data) || !isRecord(data.providers)) return { providers: {} };

  const providers: Record<string, NormalizedProviderEntry> = {};
  for (const [providerName, providerValue] of Object.entries(data.providers)) {
    if (!providerName.trim() || !isRecord(providerValue)) continue;
    providers[providerName] = normalizeProviderEntry(providerValue);
  }

  return { providers };
}
