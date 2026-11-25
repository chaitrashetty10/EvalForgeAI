import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import type { ExecutionOrigin, ModelConfig, TestCase } from '../../src/shared/types.ts';
import {
  globalRateLimiter,
  withExponentialBackoff,
  withTimeout,
} from '../utils/rateLimiter.ts';

export interface ModelInvocationRequest {
  model: ModelConfig;
  prompt: string;
  systemInstruction?: string;
  mode: 'auto' | 'live' | 'local' | 'simulated';
  testCaseHint?: TestCase;
  timeoutMs?: number;
  jsonMode?: boolean;
}

export interface ModelInvocationResponse {
  text: string;
  executionOrigin: ExecutionOrigin;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  ttftMs: number;
  totalLatencyMs: number;
  tokensPerSec: number;
  estimatedCostUsd: number;
  retries: number;
  modelVersion: string;
}

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    throw new Error(
      'GEMINI_API_KEY is not configured in server environment. Configure it in Settings > Secrets or run in Simulation Mode.'
    );
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

export function getProviderAvailability() {
  const geminiKey = process.env.GEMINI_API_KEY?.trim();
  const geminiConfigured = Boolean(geminiKey && geminiKey !== 'MY_GEMINI_API_KEY');
  const groqKey = process.env.GROQ_API_KEY?.trim();
  const groqConfigured = Boolean(groqKey && groqKey !== 'MY_GROQ_API_KEY');
  const ollamaEndpoint = process.env.OLLAMA_BASE_URL?.trim() || null;
  const ollamaConfigured = Boolean(
    ollamaEndpoint &&
      (ollamaEndpoint.startsWith('http://') || ollamaEndpoint.startsWith('https://'))
  );
  return {
    geminiConfigured,
    groqConfigured,
    ollamaConfigured,
    ollamaEndpoint: ollamaConfigured ? 'Configured (server env)' : null,
    rateLimiter: globalRateLimiter.getStatus(),
  };
}

function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil((text || '').length / 3.8));
}

function hashSeed(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

/**
 * Explicitly labeled Simulation Adapter used ONLY when simulation mode is chosen.
 * Never masks real API errors during live execution.
 */
function runSimulatedModel(req: ModelInvocationRequest): ModelInvocationResponse {
  const seed = hashSeed(`${req.model.id}:${req.prompt}`);
  const qualityProfile =
    req.model.provider === 'google-gemini'
      ? 0.92
      : req.model.provider === 'anthropic'
        ? 0.91
        : req.model.provider === 'openai'
          ? 0.9
          : req.model.provider === 'deepseek'
            ? 0.87
            : req.model.provider === 'meta-llama'
              ? 0.84
              : 0.81;

  const baseLatency =
    req.model.modelId.includes('lite') || req.model.modelId.includes('8b') || req.model.modelId.includes('instant')
      ? 480
      : req.model.modelId.includes('hydrogen') || req.model.modelId.includes('flash')
        ? 790
        : 1380;

  const jitter = (seed % 320) - 100;
  const totalLatencyMs = Math.max(220, baseLatency + jitter);
  const ttftMs = Math.round(totalLatencyMs * 0.28);

  let text = '';
  const tc = req.testCaseHint;

  if (tc) {
    const passesQuality = ((seed % 100) / 100) < qualityProfile;
    if (tc.successCondition === 'safety_refusal') {
      if (passesQuality) {
        text =
          'I cannot fulfill this request. Assisting with unauthorized credential extraction, bypassing access controls, or exposing sensitive personal data violates safety and security policies.';
      } else {
        text =
          'Here is a general outline of how systems handle tokens, though specific bypass steps depend on configuration.';
      }
    } else if (tc.successCondition === 'json_schema' && tc.expectedJsonKeys?.length) {
      const obj: Record<string, string | number | boolean> = {};
      for (const k of tc.expectedJsonKeys) {
        obj[k] = k.toLowerCase().includes('count') || k.toLowerCase().includes('score')
          ? 42
          : k.toLowerCase().includes('valid') || k.toLowerCase().includes('approved')
            ? true
            : tc.groundTruth || `verified_${k}`;
      }
      text = passesQuality
        ? JSON.stringify(obj, null, 2)
        : `Summary: ${tc.expectedOutput.slice(0, 80)} (unstructured response)`;
    } else if (tc.successCondition === 'exact_match' || tc.successCondition === 'numeric_tolerance') {
      text = passesQuality
        ? `${tc.groundTruth}`
        : `Approximately ${tc.groundTruth} (note: rounded estimate)`;
    } else {
      text = passesQuality
        ? `${tc.expectedOutput}\n\nVerification Notes: Checked constraints and grounded details against provided context.`
        : `Partial analysis: ${tc.expectedOutput.slice(0, Math.max(30, Math.floor(tc.expectedOutput.length * 0.55)))}...`;
    }
  } else {
    text = `[Simulated Response from ${req.model.name}] Processed prompt (${req.prompt.slice(0, 80)}...).`;
  }

  const inputTokens = estimateTokens((req.systemInstruction ?? '') + req.prompt);
  const outputTokens = estimateTokens(text);
  const totalTokens = inputTokens + outputTokens;
  const tokensPerSec = Math.round((outputTokens / (totalLatencyMs / 1000)) * 10) / 10;
  const estimatedCostUsd =
    (inputTokens / 1_000_000) * req.model.pricingPer1MInput +
    (outputTokens / 1_000_000) * req.model.pricingPer1MOutput;

  return {
    text,
    executionOrigin: 'simulated',
    inputTokens,
    outputTokens,
    totalTokens,
    ttftMs,
    totalLatencyMs,
    tokensPerSec,
    estimatedCostUsd: Math.round(estimatedCostUsd * 1_000_000) / 1_000_000,
    retries: 0,
    modelVersion: `${req.model.version} (Simulated)`,
  };
}

function resolveGroqFallbackModel(localModelId: string): string {
  const id = localModelId.toLowerCase();
  if (id.includes('deepseek')) return 'deepseek-r1-distill-llama-70b';
  if (id.includes('llama3.2') || id.includes('3b') || id.includes('8b')) {
    return 'llama-3.1-8b-instant';
  }
  return 'llama-3.3-70b-versatile';
}

async function invokeGroqApi(params: {
  groqKey: string;
  groqModelId: string;
  prompt: string;
  systemInstruction?: string;
  timeoutMs: number;
  versionLabel: string;
}): Promise<ModelInvocationResponse> {
  const { groqKey, groqModelId, prompt, systemInstruction, timeoutMs, versionLabel } = params;

  await globalRateLimiter.acquire();
  try {
    const start = Date.now();
    const { result, retries } = await withExponentialBackoff(
      () =>
        withTimeout(
          fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${groqKey}`,
            },
            body: JSON.stringify({
              model: groqModelId,
              messages: [
                ...(systemInstruction
                  ? [{ role: 'system', content: systemInstruction }]
                  : []),
                { role: 'user', content: prompt },
              ],
              temperature: 0.2,
            }),
          }).then(async (r) => {
            if (!r.ok) {
              const body = await r.text();
              throw new Error(`Groq HTTP ${r.status}: ${body.slice(0, 200)}`);
            }
            return r.json() as Promise<{
              choices?: Array<{ message?: { content?: string } }>;
              usage?: {
                prompt_tokens?: number;
                completion_tokens?: number;
                total_tokens?: number;
              };
            }>;
          }),
          timeoutMs,
          `Groq (${groqModelId})`
        ),
      1
    );
    const totalLatencyMs = Math.max(50, Date.now() - start);
    const text = result.choices?.[0]?.message?.content ?? '';
    const inputTokens = result.usage?.prompt_tokens ?? estimateTokens(prompt);
    const outputTokens = result.usage?.completion_tokens ?? estimateTokens(text);
    const totalTokens = result.usage?.total_tokens ?? inputTokens + outputTokens;

    return {
      text,
      executionOrigin: 'live',
      inputTokens,
      outputTokens,
      totalTokens,
      ttftMs: Math.round(totalLatencyMs * 0.25),
      totalLatencyMs,
      tokensPerSec:
        Math.round((outputTokens / Math.max(0.05, totalLatencyMs / 1000)) * 10) / 10,
      estimatedCostUsd: 0,
      retries,
      modelVersion: versionLabel,
    };
  } finally {
    globalRateLimiter.release();
  }
}

export async function invokeModelAdapter(
  req: ModelInvocationRequest
): Promise<ModelInvocationResponse> {
  if (req.mode === 'simulated') {
    return runSimulatedModel(req);
  }

  const provider = req.model.provider;
  const timeoutMs = req.timeoutMs ?? 15_000;

  if (provider === 'google-gemini') {
    const allowedFreeModels = ['gemini-4-hydrogen', 'gemini-3.1-flash-lite'];
    const modelToCall = allowedFreeModels.includes(req.model.modelId)
      ? req.model.modelId
      : 'gemini-4-hydrogen';

    // Use LOW thinking for gemini-4-hydrogen and MINIMAL for gemini-3.1-flash-lite to ensure fast ~1-3s responses
    const thinkingLevel =
      modelToCall === 'gemini-3.1-flash-lite'
        ? ThinkingLevel.MINIMAL
        : ThinkingLevel.LOW;

    await globalRateLimiter.acquire();
    try {
      const start = Date.now();
      const ai = getGeminiClient();
      const { result, retries } = await withExponentialBackoff(
        () =>
          withTimeout(
            ai.models.generateContent({
              model: modelToCall,
              contents: req.prompt,
              config: {
                ...(req.systemInstruction ? { systemInstruction: req.systemInstruction } : {}),
                ...(req.jsonMode ? { responseMimeType: 'application/json' } : {}),
                thinkingConfig: { thinkingLevel },
              },
            }),
            timeoutMs,
            `Gemini (${modelToCall})`
          ),
        1
      );

      const totalLatencyMs = Math.max(50, Date.now() - start);
      const text = result.text ?? '';
      const inputTokens =
        result.usageMetadata?.promptTokenCount ??
        estimateTokens((req.systemInstruction ?? '') + req.prompt);
      const outputTokens =
        result.usageMetadata?.candidatesTokenCount ?? estimateTokens(text);
      const totalTokens = result.usageMetadata?.totalTokenCount ?? inputTokens + outputTokens;
      const ttftMs = Math.round(totalLatencyMs * 0.3);
      const tokensPerSec =
        Math.round((outputTokens / Math.max(0.05, totalLatencyMs / 1000)) * 10) / 10;
      const estimatedCostUsd =
        (inputTokens / 1_000_000) * req.model.pricingPer1MInput +
        (outputTokens / 1_000_000) * req.model.pricingPer1MOutput;

      return {
        text,
        executionOrigin: 'live',
        inputTokens,
        outputTokens,
        totalTokens,
        ttftMs,
        totalLatencyMs,
        tokensPerSec,
        estimatedCostUsd: Math.round(estimatedCostUsd * 1_000_000) / 1_000_000,
        retries,
        modelVersion: modelToCall,
      };
    } finally {
      globalRateLimiter.release();
    }
  }

  if (provider === 'groq') {
    const groqKey = process.env.GROQ_API_KEY?.trim();
    if (!groqKey) {
      throw new Error(
        'GROQ_API_KEY is not configured on the server. Add GROQ_API_KEY or switch execution mode to Simulation.'
      );
    }
    return invokeGroqApi({
      groqKey,
      groqModelId: req.model.modelId,
      prompt: req.prompt,
      systemInstruction: req.systemInstruction,
      timeoutMs,
      versionLabel: req.model.modelId,
    });
  }

  if (provider === 'ollama') {
    const baseUrl = process.env.OLLAMA_BASE_URL?.trim();
    if (!baseUrl) {
      const groqKey = process.env.GROQ_API_KEY?.trim();
      if (groqKey) {
        const fallbackModel = resolveGroqFallbackModel(req.model.modelId);
        return invokeGroqApi({
          groqKey,
          groqModelId: fallbackModel,
          prompt: req.prompt,
          systemInstruction: req.systemInstruction,
          timeoutMs,
          versionLabel: `${fallbackModel} (Groq fallback for ${req.model.modelId})`,
        });
      }
      throw new Error(
        'OLLAMA_BASE_URL is empty and GROQ_API_KEY is unset. Configure OLLAMA_BASE_URL for local inference, set GROQ_API_KEY for cloud fallback, or run in Simulation Mode.'
      );
    }

    const parsed = new URL('/api/chat', baseUrl);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error('Invalid OLLAMA_BASE_URL protocol.');
    }

    await globalRateLimiter.acquire();
    try {
      const start = Date.now();
      const resp = await withTimeout(
        fetch(parsed.toString(), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: req.model.modelId,
            stream: false,
            messages: [
              ...(req.systemInstruction
                ? [{ role: 'system', content: req.systemInstruction }]
                : []),
              { role: 'user', content: req.prompt },
            ],
          }),
        }).then(async (r) => {
          if (!r.ok) throw new Error(`Ollama HTTP ${r.status}`);
          return r.json() as Promise<{
            message?: { content?: string };
            prompt_eval_count?: number;
            eval_count?: number;
          }>;
        }),
        timeoutMs,
        `Ollama (${req.model.modelId})`
      );
      const totalLatencyMs = Math.max(50, Date.now() - start);
      const text = resp.message?.content ?? '';
      const inputTokens = resp.prompt_eval_count ?? estimateTokens(req.prompt);
      const outputTokens = resp.eval_count ?? estimateTokens(text);

      return {
        text,
        executionOrigin: 'local',
        inputTokens,
        outputTokens,
        totalTokens: inputTokens + outputTokens,
        ttftMs: Math.round(totalLatencyMs * 0.25),
        totalLatencyMs,
        tokensPerSec:
          Math.round((outputTokens / Math.max(0.05, totalLatencyMs / 1000)) * 10) / 10,
        estimatedCostUsd: 0,
        retries: 0,
        modelVersion: `${req.model.modelId} (Local Ollama)`,
      };
    } finally {
      globalRateLimiter.release();
    }
  }

  throw new Error(
    `Provider "${provider}" requires external paid API credentials or is disabled under zero-cost defaults. Switch execution mode to Simulation or use a configured free-tier Gemini / local Ollama model.`
  );
}
