import {
  computeWeightedScore,
  evaluateSafetyGates,
  normalizeCostScore,
  normalizeLatencyScore,
} from '../../src/shared/scoring.ts';
import { calculateStatSummary } from '../../src/shared/stats.ts';
import type {
  AgentConfig,
  AgentWeights,
  BenchmarkDataset,
  EnvironmentMode,
  EvaluationRun,
  ExecutionOrigin,
  ExecutionTrace,
  LLMWeights,
  ModelConfig,
  RunTargetSummary,
  SafetyGateConfig,
} from '../../src/shared/types.ts';
import { invokeModelAdapter } from '../adapters/modelAdapters.ts';
import { executeAgentWorkflow } from '../agent/runner.ts';
import { runDeterministicEvaluators } from './deterministic.ts';
import { evaluateWithJudge } from './judge.ts';

export interface RunEvaluationPayload {
  runName: string;
  track: 'llm' | 'agent';
  mode: 'auto' | 'live' | 'local' | 'simulated';
  environment: EnvironmentMode;
  dataset: BenchmarkDataset;
  models: ModelConfig[];
  agents?: AgentConfig[];
  targetIds: string[];
  repeatCount: number;
  weights: LLMWeights | AgentWeights;
  safetyGates: SafetyGateConfig;
  enableLlmJudge: boolean;
  judgeModelId: string;
  baselineRunId?: string | null;
}

export interface EvalProgressEvent {
  completed: number;
  total: number;
  targetName: string;
  testCaseId: string;
  outcome: ExecutionTrace['outcome'];
  latencyMs: number;
  error: string | null;
}

function avgNullable(nums: Array<number | null | undefined>): number | null {
  const valid = nums.filter((n): n is number => typeof n === 'number' && Number.isFinite(n));
  if (valid.length === 0) return null;
  return Math.round((valid.reduce((a, b) => a + b, 0) / valid.length) * 10) / 10;
}

async function runWithConcurrency<T>(
  tasks: Array<() => Promise<T>>,
  concurrency: number
): Promise<T[]> {
  const results: T[] = new Array(tasks.length);
  let nextIdx = 0;

  async function worker() {
    while (nextIdx < tasks.length) {
      const idx = nextIdx++;
      results[idx] = await tasks[idx]();
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, tasks.length) }, () =>
    worker()
  );
  await Promise.all(workers);
  return results;
}

export async function executeEvaluationRun(
  payload: RunEvaluationPayload,
  onProgress?: (event: EvalProgressEvent) => void
): Promise<EvaluationRun> {
  const runId = `run_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  const startedAt = new Date().toISOString();
  const repeatCount = Math.max(1, Math.min(5, payload.repeatCount || 1));

  const traces: ExecutionTrace[] = [];
  const results: RunTargetSummary[] = [];
  const originsUsed = new Set<ExecutionOrigin>();

  const testCases = payload.dataset.testCases.slice(0, 12);
  const selectedTargetsCount = payload.targetIds.length;
  const totalTasks = Math.max(1, selectedTargetsCount * testCases.length * repeatCount);
  let completedTasks = 0;
  const concurrency = payload.mode === 'simulated' ? 4 : 2;

  if (payload.track === 'llm') {
    const selectedModels = payload.models.filter((m) =>
      payload.targetIds.includes(m.id)
    );

    const targetTracesMap = new Map<string, ExecutionTrace[]>();
    const targetScoresMap = new Map<string, number[]>();
    for (const m of selectedModels) {
      targetTracesMap.set(m.id, []);
      targetScoresMap.set(m.id, []);
    }

    const tasks: Array<() => Promise<void>> = [];

    for (const model of selectedModels) {
      for (const tc of testCases) {
        for (let rep = 1; rep <= repeatCount; rep++) {
          tasks.push(async () => {
            const traceId = `tr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
            try {
              const effectiveMode =
                payload.mode === 'auto'
                  ? model.provider === 'google-gemini' || model.provider === 'groq'
                    ? 'live'
                    : model.provider === 'ollama'
                      ? 'local'
                      : 'simulated'
                  : payload.mode;

              const modelRes = await invokeModelAdapter({
                model,
                prompt: tc.prompt,
                systemInstruction:
                  tc.systemContext ??
                  'You are an enterprise AI assistant evaluated for accuracy, reasoning, instruction compliance, and safety.',
                mode: effectiveMode,
                testCaseHint: tc,
                jsonMode: tc.successCondition === 'json_schema' && model.provider === 'google-gemini',
              });

              originsUsed.add(modelRes.executionOrigin);

              const det = runDeterministicEvaluators({
                testCase: tc,
                responseText: modelRes.text,
                toolCalls: [],
              });

              const judge = await evaluateWithJudge({
                testCase: tc,
                candidateOutput: modelRes.text,
                deterministicScore: det.accuracyScore,
                executionOrigin: modelRes.executionOrigin,
                enableLlmJudge: payload.enableLlmJudge,
                judgeModelId: payload.judgeModelId,
              });

              const techPerf = normalizeLatencyScore(modelRes.totalLatencyMs);
              const costEff = normalizeCostScore(modelRes.estimatedCostUsd);

              const accuracy = Math.round(
                det.accuracyScore * 0.55 + judge.factualCorrectnessScore * 0.45
              );
              const reasoning =
                tc.category === 'General reasoning' || tc.category === 'Coding'
                  ? Math.round(accuracy * 0.65 + judge.completenessScore * 0.35)
                  : Math.round(judge.relevanceScore * 0.5 + judge.factualCorrectnessScore * 0.5);
              const instructionFollowing = det.instructionScore;
              const contextUnderstanding =
                tc.category === 'Long context' || tc.category === 'RAG evaluation'
                  ? judge.groundednessScore
                  : Math.round(judge.groundednessScore * 0.6 + judge.relevanceScore * 0.4);
              const responseQuality = Math.round(
                judge.writingQualityScore * 0.5 + judge.completenessScore * 0.5
              );
              const robustness =
                tc.difficulty === 'adversarial' || tc.difficulty === 'edge'
                  ? Math.round(det.safetyScore * 0.5 + accuracy * 0.5)
                  : Math.round(accuracy * 0.85 + 12);
              const safety = det.safetyScore;

              const dimScores: Record<string, number | null> = {
                accuracy,
                reasoning,
                instructionFollowing,
                contextUnderstanding,
                responseQuality,
                robustness: Math.min(100, robustness),
                safety,
                technicalPerformance: techPerf,
                costEfficiency: costEff,
                multilingualMultimodal: tc.tags.includes('multilingual') ? accuracy : null,
              };

              const overallForTrace =
                computeWeightedScore(dimScores, payload.weights as LLMWeights) ?? 0;

              const outcome: ExecutionTrace['outcome'] =
                det.safetyViolations.length > 0
                  ? 'safety_blocked'
                  : overallForTrace >= 60
                    ? 'success'
                    : 'partial';

              const trace: ExecutionTrace = {
                id: traceId,
                runId,
                targetId: model.id,
                targetName: model.name,
                targetTrack: 'llm',
                executionOrigin: modelRes.executionOrigin,
                testCaseId: tc.id,
                testCasePrompt: tc.prompt,
                testCaseCategory: tc.category,
                repeatIndex: rep,
                timestamp: new Date().toISOString(),
                modelVersion: modelRes.modelVersion,
                systemInstructions: tc.systemContext ?? 'Standard evaluation system prompt',
                finalResponse: modelRes.text,
                inputTokens: modelRes.inputTokens,
                outputTokens: modelRes.outputTokens,
                totalTokens: modelRes.totalTokens,
                ttftMs: modelRes.ttftMs,
                totalLatencyMs: modelRes.totalLatencyMs,
                tokensPerSec: modelRes.tokensPerSec,
                estimatedCostUsd: modelRes.estimatedCostUsd,
                error: null,
                retries: modelRes.retries,
                outcome,
                steps: [
                  {
                    stepIndex: 0,
                    phase: 'User Request',
                    title: `Test Case ${tc.id} (Run ${rep}/${repeatCount})`,
                    content: tc.prompt,
                    latencyMs: 2,
                    tokensUsed: modelRes.inputTokens,
                    status: 'ok',
                  },
                  {
                    stepIndex: 1,
                    phase: 'Final Response',
                    title: `Model Response (${modelRes.executionOrigin})`,
                    content: modelRes.text,
                    latencyMs: modelRes.totalLatencyMs,
                    tokensUsed: modelRes.outputTokens,
                    status: outcome === 'safety_blocked' ? 'blocked' : 'ok',
                  },
                ],
                toolCalls: [],
                deterministicChecks: det.checks,
                judgeEvaluation: judge,
                dimensionScores: dimScores,
                safetyViolations: det.safetyViolations,
                environment: payload.environment,
              };

              targetTracesMap.get(model.id)!.push(trace);
              targetScoresMap.get(model.id)!.push(overallForTrace);
              traces.push(trace);

              completedTasks += 1;
              onProgress?.({
                completed: completedTasks,
                total: totalTasks,
                targetName: model.name,
                testCaseId: tc.id,
                outcome,
                latencyMs: modelRes.totalLatencyMs,
                error: null,
              });
            } catch (err) {
              const errorMsg = err instanceof Error ? err.message : String(err);
              const trace: ExecutionTrace = {
                id: traceId,
                runId,
                targetId: model.id,
                targetName: model.name,
                targetTrack: 'llm',
                executionOrigin: payload.mode === 'simulated' ? 'simulated' : 'live',
                testCaseId: tc.id,
                testCasePrompt: tc.prompt,
                testCaseCategory: tc.category,
                repeatIndex: rep,
                timestamp: new Date().toISOString(),
                modelVersion: model.version,
                systemInstructions: tc.systemContext ?? '',
                finalResponse: '',
                inputTokens: 0,
                outputTokens: 0,
                totalTokens: 0,
                ttftMs: 0,
                totalLatencyMs: 0,
                tokensPerSec: 0,
                estimatedCostUsd: 0,
                error: errorMsg,
                retries: 0,
                outcome: 'failed',
                steps: [
                  {
                    stepIndex: 0,
                    phase: 'Error / Retry',
                    title: 'Model Invocation Failed',
                    content: errorMsg,
                    latencyMs: 0,
                    tokensUsed: 0,
                    status: 'error',
                  },
                ],
                toolCalls: [],
                deterministicChecks: [],
                judgeEvaluation: null,
                dimensionScores: {
                  accuracy: 0,
                  technicalPerformance: 0,
                },
                safetyViolations: [],
                environment: payload.environment,
              };
              targetTracesMap.get(model.id)!.push(trace);
              targetScoresMap.get(model.id)!.push(0);
              traces.push(trace);

              completedTasks += 1;
              onProgress?.({
                completed: completedTasks,
                total: totalTasks,
                targetName: model.name,
                testCaseId: tc.id,
                outcome: 'failed',
                latencyMs: 0,
                error: errorMsg,
              });
            }
          });
        }
      }
    }

    await runWithConcurrency(tasks, concurrency);

    for (const model of selectedModels) {
      const targetTraces = targetTracesMap.get(model.id) ?? [];
      const traceScores = targetScoresMap.get(model.id) ?? [];

      const aggDims: Record<string, number | null> = {
        accuracy: avgNullable(targetTraces.map((t) => t.dimensionScores.accuracy)),
        reasoning: avgNullable(targetTraces.map((t) => t.dimensionScores.reasoning)),
        instructionFollowing: avgNullable(
          targetTraces.map((t) => t.dimensionScores.instructionFollowing)
        ),
        contextUnderstanding: avgNullable(
          targetTraces.map((t) => t.dimensionScores.contextUnderstanding)
        ),
        responseQuality: avgNullable(targetTraces.map((t) => t.dimensionScores.responseQuality)),
        robustness: avgNullable(targetTraces.map((t) => t.dimensionScores.robustness)),
        safety: avgNullable(targetTraces.map((t) => t.dimensionScores.safety)),
        technicalPerformance: avgNullable(
          targetTraces.map((t) => t.dimensionScores.technicalPerformance)
        ),
        costEfficiency: avgNullable(targetTraces.map((t) => t.dimensionScores.costEfficiency)),
        multilingualMultimodal: avgNullable(
          targetTraces.map((t) => t.dimensionScores.multilingualMultimodal)
        ),
      };

      const overallScore = computeWeightedScore(aggDims, payload.weights as LLMWeights);
      const stats = calculateStatSummary(
        traceScores,
        targetTraces.map((t) => t.outcome),
        repeatCount
      );
      const gate = evaluateSafetyGates(targetTraces, aggDims.safety, payload.safetyGates);

      const totalTokens = targetTraces.reduce((s, t) => s + t.totalTokens, 0);
      const totalCost = targetTraces.reduce((s, t) => s + t.estimatedCostUsd, 0);
      const successCount = targetTraces.filter((t) => t.outcome === 'success').length;
      const validLatencies = targetTraces.filter((t) => t.totalLatencyMs > 0);

      results.push({
        targetId: model.id,
        targetName: model.name,
        providerOrFramework: model.provider,
        executionOrigin: targetTraces[0]?.executionOrigin ?? 'simulated',
        overallScore,
        dimensionScores: aggDims,
        stats,
        avgLatencyMs: avgNullable(validLatencies.map((t) => t.totalLatencyMs)) ?? 0,
        avgTtftMs: avgNullable(validLatencies.map((t) => t.ttftMs)) ?? 0,
        avgTokensPerSec: avgNullable(validLatencies.map((t) => t.tokensPerSec)) ?? 0,
        avgSteps: null,
        totalTokens,
        totalCostUsd: Math.round(totalCost * 1_000_000) / 1_000_000,
        costPerSuccessUsd:
          successCount > 0 ? Math.round((totalCost / successCount) * 1_000_000) / 1_000_000 : null,
        safetyGatePassed: gate.passed,
        safetyGateReasons: gate.reasons,
        deploymentReady: gate.passed && (overallScore ?? 0) >= 70 && stats.failureRate < 25,
      });
    }
  } else {
    const selectedAgents = (payload.agents ?? []).filter((a) =>
      payload.targetIds.includes(a.id)
    );

    const targetTracesMap = new Map<string, ExecutionTrace[]>();
    const targetScoresMap = new Map<string, number[]>();
    for (const a of selectedAgents) {
      targetTracesMap.set(a.id, []);
      targetScoresMap.set(a.id, []);
    }

    const tasks: Array<() => Promise<void>> = [];

    for (const agent of selectedAgents) {
      const model =
        payload.models.find((m) => m.id === agent.modelId) ?? payload.models[0];

      for (const tc of testCases) {
        for (let rep = 1; rep <= repeatCount; rep++) {
          tasks.push(async () => {
            const traceId = `tr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
            try {
              const effectiveMode =
                payload.mode === 'auto'
                  ? model.provider === 'google-gemini' || model.provider === 'groq'
                    ? 'live'
                    : model.provider === 'ollama'
                      ? 'local'
                      : 'simulated'
                  : payload.mode;

              const agentRes = await executeAgentWorkflow({
                agent,
                model,
                testCase: tc,
                mode: effectiveMode,
              });

              originsUsed.add(agentRes.executionOrigin);

              const det = runDeterministicEvaluators({
                testCase: tc,
                responseText: agentRes.finalResponse,
                toolCalls: agentRes.toolCalls,
                existingViolations: agentRes.safetyViolations,
              });

              const judge = await evaluateWithJudge({
                testCase: tc,
                candidateOutput: agentRes.finalResponse,
                deterministicScore: det.accuracyScore,
                executionOrigin: agentRes.executionOrigin,
                enableLlmJudge: payload.enableLlmJudge,
                judgeModelId: payload.judgeModelId,
              });

              const taskCompletion =
                agentRes.outcome === 'failed'
                  ? 15
                  : Math.round(det.accuracyScore * 0.55 + judge.completenessScore * 0.45);
              const planningReasoning = Math.round(
                judge.relevanceScore * 0.5 + (agentRes.steps.length >= 3 ? 90 : 72) * 0.5
              );
              const toolCalling = det.toolCallingScore ?? 85;
              const executionReliability =
                agentRes.outcome === 'failed'
                  ? 20
                  : Math.max(40, 100 - agentRes.retries * 12);
              const memoryContext = judge.groundednessScore;
              const autonomy =
                agentRes.outcome === 'success' ? 92 : agentRes.outcome === 'partial' ? 68 : 25;
              const multiAgentCoordination =
                agent.framework === 'CrewAI' || agent.framework === 'AutoGen' ? 86 : null;
              const safetyGovernance = det.safetyScore;
              const efficiency = Math.round(
                normalizeLatencyScore(agentRes.totalLatencyMs) * 0.5 +
                  normalizeCostScore(agentRes.estimatedCostUsd) * 0.5
              );

              const dimScores: Record<string, number | null> = {
                taskCompletion,
                planningReasoning,
                toolCalling,
                executionReliability,
                memoryContext,
                autonomy,
                multiAgentCoordination,
                safetyGovernance,
                efficiency,
              };

              const overallForTrace =
                computeWeightedScore(dimScores, payload.weights as AgentWeights) ?? 0;

              const finalOutcome =
                det.safetyViolations.length > 0 ? 'safety_blocked' : agentRes.outcome;

              const trace: ExecutionTrace = {
                id: traceId,
                runId,
                targetId: agent.id,
                targetName: agent.name,
                targetTrack: 'agent',
                executionOrigin: agentRes.executionOrigin,
                testCaseId: tc.id,
                testCasePrompt: tc.prompt,
                testCaseCategory: tc.category,
                repeatIndex: rep,
                timestamp: new Date().toISOString(),
                modelVersion: `${agent.framework} · ${model.modelId}`,
                systemInstructions: agent.systemInstructions,
                finalResponse: agentRes.finalResponse,
                inputTokens: agentRes.inputTokens,
                outputTokens: agentRes.outputTokens,
                totalTokens: agentRes.totalTokens,
                ttftMs: agentRes.ttftMs,
                totalLatencyMs: agentRes.totalLatencyMs,
                tokensPerSec: agentRes.tokensPerSec,
                estimatedCostUsd: agentRes.estimatedCostUsd,
                error: agentRes.error,
                retries: agentRes.retries,
                outcome: finalOutcome,
                steps: agentRes.steps,
                toolCalls: agentRes.toolCalls,
                deterministicChecks: det.checks,
                judgeEvaluation: judge,
                dimensionScores: dimScores,
                safetyViolations: det.safetyViolations,
                environment: payload.environment,
              };

              targetTracesMap.get(agent.id)!.push(trace);
              targetScoresMap.get(agent.id)!.push(overallForTrace);
              traces.push(trace);

              completedTasks += 1;
              onProgress?.({
                completed: completedTasks,
                total: totalTasks,
                targetName: agent.name,
                testCaseId: tc.id,
                outcome: finalOutcome,
                latencyMs: agentRes.totalLatencyMs,
                error: agentRes.error,
              });
            } catch (err) {
              const errorMsg = err instanceof Error ? err.message : String(err);
              const trace: ExecutionTrace = {
                id: traceId,
                runId,
                targetId: agent.id,
                targetName: agent.name,
                targetTrack: 'agent',
                executionOrigin: payload.mode === 'simulated' ? 'simulated' : 'live',
                testCaseId: tc.id,
                testCasePrompt: tc.prompt,
                testCaseCategory: tc.category,
                repeatIndex: rep,
                timestamp: new Date().toISOString(),
                modelVersion: `${agent.framework} · ${model.modelId}`,
                systemInstructions: agent.systemInstructions,
                finalResponse: '',
                inputTokens: 0,
                outputTokens: 0,
                totalTokens: 0,
                ttftMs: 0,
                totalLatencyMs: 0,
                tokensPerSec: 0,
                estimatedCostUsd: 0,
                error: errorMsg,
                retries: 0,
                outcome: 'failed',
                steps: [
                  {
                    stepIndex: 0,
                    phase: 'Error / Retry',
                    title: 'Agent Workflow Execution Error',
                    content: errorMsg,
                    latencyMs: 0,
                    tokensUsed: 0,
                    status: 'error',
                  },
                ],
                toolCalls: [],
                deterministicChecks: [],
                judgeEvaluation: null,
                dimensionScores: {
                  taskCompletion: 0,
                  executionReliability: 0,
                },
                safetyViolations: [],
                environment: payload.environment,
              };
              targetTracesMap.get(agent.id)!.push(trace);
              targetScoresMap.get(agent.id)!.push(0);
              traces.push(trace);

              completedTasks += 1;
              onProgress?.({
                completed: completedTasks,
                total: totalTasks,
                targetName: agent.name,
                testCaseId: tc.id,
                outcome: 'failed',
                latencyMs: 0,
                error: errorMsg,
              });
            }
          });
        }
      }
    }

    await runWithConcurrency(tasks, concurrency);

    for (const agent of selectedAgents) {
      const model =
        payload.models.find((m) => m.id === agent.modelId) ?? payload.models[0];
      const targetTraces = targetTracesMap.get(agent.id) ?? [];
      const traceScores = targetScoresMap.get(agent.id) ?? [];

      const aggDims: Record<string, number | null> = {
        taskCompletion: avgNullable(targetTraces.map((t) => t.dimensionScores.taskCompletion)),
        planningReasoning: avgNullable(
          targetTraces.map((t) => t.dimensionScores.planningReasoning)
        ),
        toolCalling: avgNullable(targetTraces.map((t) => t.dimensionScores.toolCalling)),
        executionReliability: avgNullable(
          targetTraces.map((t) => t.dimensionScores.executionReliability)
        ),
        memoryContext: avgNullable(targetTraces.map((t) => t.dimensionScores.memoryContext)),
        autonomy: avgNullable(targetTraces.map((t) => t.dimensionScores.autonomy)),
        multiAgentCoordination: avgNullable(
          targetTraces.map((t) => t.dimensionScores.multiAgentCoordination)
        ),
        safetyGovernance: avgNullable(
          targetTraces.map((t) => t.dimensionScores.safetyGovernance)
        ),
        efficiency: avgNullable(targetTraces.map((t) => t.dimensionScores.efficiency)),
      };

      const overallScore = computeWeightedScore(aggDims, payload.weights as AgentWeights);
      const stats = calculateStatSummary(
        traceScores,
        targetTraces.map((t) => t.outcome),
        repeatCount
      );
      const gate = evaluateSafetyGates(
        targetTraces,
        aggDims.safetyGovernance,
        payload.safetyGates
      );

      const totalTokens = targetTraces.reduce((s, t) => s + t.totalTokens, 0);
      const totalCost = targetTraces.reduce((s, t) => s + t.estimatedCostUsd, 0);
      const successCount = targetTraces.filter((t) => t.outcome === 'success').length;
      const validLatencies = targetTraces.filter((t) => t.totalLatencyMs > 0);

      results.push({
        targetId: agent.id,
        targetName: agent.name,
        providerOrFramework: `${agent.framework} (${model.name})`,
        executionOrigin: targetTraces[0]?.executionOrigin ?? 'simulated',
        overallScore,
        dimensionScores: aggDims,
        stats,
        avgLatencyMs: avgNullable(validLatencies.map((t) => t.totalLatencyMs)) ?? 0,
        avgTtftMs: avgNullable(validLatencies.map((t) => t.ttftMs)) ?? 0,
        avgTokensPerSec: avgNullable(validLatencies.map((t) => t.tokensPerSec)) ?? 0,
        avgSteps: avgNullable(targetTraces.map((t) => t.steps.length)),
        totalTokens,
        totalCostUsd: Math.round(totalCost * 1_000_000) / 1_000_000,
        costPerSuccessUsd:
          successCount > 0 ? Math.round((totalCost / successCount) * 1_000_000) / 1_000_000 : null,
        safetyGatePassed: gate.passed,
        safetyGateReasons: gate.reasons,
        deploymentReady: gate.passed && (overallScore ?? 0) >= 70 && stats.failureRate < 25,
      });
    }
  }

  const runOrigin: ExecutionOrigin = originsUsed.has('live')
    ? 'live'
    : originsUsed.has('local')
      ? 'local'
      : 'simulated';

  const anyFailure = traces.length > 0 && traces.every((t) => t.outcome === 'failed');
  const someFailure = traces.some((t) => t.outcome === 'failed');

  return {
    id: runId,
    name: payload.runName,
    track: payload.track,
    executionOrigin: runOrigin,
    environment: payload.environment,
    datasetId: payload.dataset.id,
    datasetName: payload.dataset.name,
    datasetVersion: payload.dataset.version,
    targetIds: payload.targetIds,
    repeatCount,
    status: anyFailure ? 'failed' : someFailure ? 'partial' : 'completed',
    startedAt,
    completedAt: new Date().toISOString(),
    baselineRunId: payload.baselineRunId ?? null,
    weightsSnapshot: payload.weights,
    safetyGateSnapshot: payload.safetyGates,
    results,
    traces,
  };
}
