/**
 * Jev provider adapters. Both expose the same decision semantics with
 * different spellings, verified live:
 *   openrouter: POST https://openrouter.ai/api/alpha/decisions,
 *               model "typesafe/jev-1.13", native noul/choice/score answers.
 *   vercel:     POST https://ai-gateway.vercel.sh/v1/evaluate,
 *               model "typesafe-ai/jev", "boolean" question type.
 */

export interface ChoiceSpec { type: "choice"; instructions: string; criteria: Record<string, string> }
export interface ScoreSpec { type: "score"; instructions: string; criteria: string[] }
/** "noul" and "boolean" are the same yes/no question; providers name it differently. */
export interface NoulSpec { type: "noul" | "boolean"; instructions: string }
export type QuestionSpec = ChoiceSpec | ScoreSpec | NoulSpec;

export interface ChoiceAnswer {
  type: "choice";
  choice: string;
  probabilities: Record<string, number>;
  confidence: number;
}
export interface ScoreAnswer { type: "score"; score: number; confidence: number }
/** Carries both spellings of the probability so either reader works. */
export interface BooleanAnswer { type: "boolean"; probability: number; noul: number }
export type Answer = ChoiceAnswer | ScoreAnswer | BooleanAnswer;

export interface SystemOneResult {
  answers: Record<string, Answer>;
  model: string;
  usage: { inputTokens: number; outputTokens: number; costUsd?: number };
  provider: string;
}

export interface Provider {
  name: "direct" | "openrouter" | "vercel";
  endpoint: string;
  model: string;
  apiKey: string;
}

const DIRECT_MODEL = "jev-latest";
const OPENROUTER_MODEL = "typesafe/jev-1.13";
const VERCEL_MODEL = "typesafe-ai/jev";

function envKey(...names: string[]): string {
  for (const name of names) {
    const value = process.env[name] ?? "";
    if (value.trim()) return value.trim();
  }
  return "";
}

/** Provider list in fallback order, from the environment. */
export function providers(): Provider[] {
  const list: Provider[] = [];
  const direct = envKey("DIRECT_TYPESAFE_API_KEY");
  if (direct) {
    list.push({
      name: "direct",
      endpoint: envKey("DIRECT_TYPESAFE_BASE_URL") || "https://api.typesafe.ai/v1/systemone",
      model: envKey("DIRECT_TYPESAFE_MODEL") || DIRECT_MODEL,
      apiKey: direct,
    });
  }
  const openrouter = envKey("OPENROUTER_API_KEY");
  if (openrouter) {
    list.push({
      name: "openrouter",
      endpoint: envKey("OPENROUTER_BASE_URL") || "https://openrouter.ai/api/alpha/decisions",
      model: envKey("OPENROUTER_MODEL") || OPENROUTER_MODEL,
      apiKey: openrouter,
    });
  }
  const vercel = envKey("TYPESAFE_API_KEY", "VERCEL_AI_GATEWAY_API_KEY");
  if (vercel) {
    list.push({
      name: "vercel",
      endpoint: envKey("VERCEL_BASE_URL") || "https://ai-gateway.vercel.sh/v1/evaluate",
      model: envKey("VERCEL_MODEL") || VERCEL_MODEL,
      apiKey: vercel,
    });
  }
  return list;
}

/** Gateway may return camelCase or snake_case usage; OpenRouter also returns cost. */
export function readUsage(raw: unknown): { inputTokens: number; outputTokens: number; costUsd?: number } {
  const usage = (raw ?? {}) as Record<string, unknown>;
  const input = Number(usage.inputTokens ?? usage.input_tokens ?? 0);
  const output = Number(usage.outputTokens ?? usage.output_tokens ?? 0);
  const cost = Number(usage.costUsd ?? usage.cost ?? Number.NaN);
  return {
    inputTokens: Number.isFinite(input) ? input : 0,
    outputTokens: Number.isFinite(output) ? output : 0,
    costUsd: Number.isFinite(cost) ? cost : undefined,
  };
}

function normalizeAnswer(raw: unknown): Answer | undefined {
  const item = (raw ?? {}) as Record<string, unknown>;
  const type = item.type === "noul" ? "boolean" : item.type;
  if (type === "boolean") {
    const probability = Number(item.probability ?? item.noul ?? 0);
    return { type: "boolean", probability, noul: probability };
  }
  if (type === "choice") {
    return {
      type: "choice",
      choice: String(item.choice ?? ""),
      probabilities: (item.probabilities ?? {}) as Record<string, number>,
      confidence: Number(item.confidence ?? item.probability ?? 0),
    };
  }
  if (type === "score") {
    return { type: "score", score: Number(item.score ?? 0), confidence: Number(item.confidence ?? 0) };
  }
  return undefined;
}

export function normalizeResult(raw: Record<string, unknown>, provider: Provider): SystemOneResult {
  const answers: Record<string, Answer> = {};
  for (const [key, value] of Object.entries((raw.answers ?? {}) as Record<string, unknown>)) {
    const answer = normalizeAnswer(value);
    if (answer) answers[key] = answer;
  }
  return {
    answers,
    model: String(raw.model ?? provider.model),
    usage: readUsage(raw.usage),
    provider: provider.name,
  };
}

/** Providers name the yes/no question differently; map an internal spec to wire. */
export function wireQuestion(spec: QuestionSpec, provider: Provider): Record<string, unknown> {
  if (spec.type === "noul" || spec.type === "boolean") {
    return { type: provider.name === "vercel" ? "boolean" : "noul", instructions: spec.instructions };
  }
  return { ...spec };
}

/** A rate limit, auth failure or exhausted quota will not recover within a run. */
export function isHardJevFailure(message: string): boolean {
  return /HTTP (401|402|403|429)|rate.limit|quota|credit|unauthor/i.test(message);
}

export function choiceOf(answer: Answer | undefined): ChoiceAnswer | undefined {
  return answer?.type === "choice" ? answer : undefined;
}
export function boolOf(answer: Answer | undefined): BooleanAnswer | undefined {
  return answer?.type === "boolean" ? answer : undefined;
}
/** Back-compat alias: an eval "boolean" answer carries `probability`. */
export function noulOf(answer: Answer | undefined): BooleanAnswer | undefined {
  return boolOf(answer);
}
