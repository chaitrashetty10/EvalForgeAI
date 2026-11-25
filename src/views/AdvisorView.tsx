import React, { useMemo, useState } from 'react';
import {
  OriginLabel,
  SafetyGateLabel,
  ScoreDisplay,
  SectionHeader,
} from '../components/OriginText';
import { useEvalStore } from '../store/evalStore';

const USE_CASES = [
  'Enterprise knowledge assistant',
  'Customer support automation',
  'Coding assistant',
  'Document intelligence',
  'Financial analysis',
  'Research assistant',
  'Workflow automation',
  'Autonomous AI agent',
  'Multi-agent orchestration',
  'RAG applications',
] as const;

type UseCase = (typeof USE_CASES)[number];

export function AdvisorView() {
  const { models, agents, runs } = useEvalStore();

  const [useCase, setUseCase] = useState<UseCase>('Customer support automation');
  const [priority, setPriority] = useState<'quality' | 'balanced' | 'latency' | 'cost'>(
    'balanced'
  );
  const [maxLatencyMs, setMaxLatencyMs] = useState<number>(2500);
  const [minSafety, setMinSafety] = useState<number>(80);
  const [minContextK, setMinContextK] = useState<number>(64);
  const [requireTools, setRequireTools] = useState<boolean>(false);
  const [deploymentPref, setDeploymentPref] = useState<
    'any' | 'free-tier-cloud' | 'local-self-hosted'
  >('any');

  const isAgentUseCase =
    useCase === 'Workflow automation' ||
    useCase === 'Autonomous AI agent' ||
    useCase === 'Multi-agent orchestration';

  const recommendations = useMemo(() => {
    const targetTrack = isAgentUseCase ? 'agent' : 'llm';
    const relevantRuns = runs.filter((r) => r.track === targetTrack);
    const latestPerTarget = new Map<
      string,
      (typeof relevantRuns)[number]['results'][number]
    >();

    for (const run of relevantRuns) {
      for (const res of run.results) {
        if (!latestPerTarget.has(res.targetId)) {
          latestPerTarget.set(res.targetId, res);
        }
      }
    }

    const candidates = targetTrack === 'agent' ? agents : models;

    return candidates
      .map((item) => {
        const evalRes = latestPerTarget.get(item.id);
        const underlyingModel =
          'modelId' in item && 'framework' in item
            ? models.find((m) => m.id === item.modelId)
            : (item as (typeof models)[number]);

        const contextWindow = underlyingModel?.contextWindow ?? 32000;
        const supportsTools =
          'tools' in item
            ? item.tools.length > 0
            : underlyingModel?.capabilities.toolCalling ?? false;
        const deployType = underlyingModel?.deploymentType ?? 'free-tier-cloud';

        const quality = evalRes?.overallScore ?? 55;
        const safety =
          evalRes?.dimensionScores.safety ??
          evalRes?.dimensionScores.safetyGovernance ??
          60;
        const latency = evalRes?.avgLatencyMs ?? 1500;
        const cost = evalRes?.totalCostUsd ?? 0;

        const constraintIssues: string[] = [];
        if (evalRes && !evalRes.safetyGatePassed) {
          constraintIssues.push('Failed mandatory safety gate');
        }
        if (safety < minSafety) {
          constraintIssues.push(`Safety (${safety.toFixed(0)}) below ${minSafety}`);
        }
        if (latency > maxLatencyMs) {
          constraintIssues.push(`Latency (${Math.round(latency)}ms) exceeds ${maxLatencyMs}ms`);
        }
        if (contextWindow < minContextK * 1000) {
          constraintIssues.push(`Context (${contextWindow / 1000}k) below ${minContextK}k`);
        }
        if (requireTools && !supportsTools) {
          constraintIssues.push('Tool calling not configured');
        }
        if (deploymentPref !== 'any' && deployType !== deploymentPref) {
          constraintIssues.push(`Deployment (${deployType}) differs from ${deploymentPref}`);
        }

        const latencyFactor = Math.max(0, 100 - (latency / 4000) * 100);
        const costFactor = cost === 0 ? 100 : Math.max(10, 100 - cost * 2000);

        let fitScore = quality;
        if (priority === 'balanced') {
          fitScore = quality * 0.55 + latencyFactor * 0.25 + costFactor * 0.2;
        } else if (priority === 'latency') {
          fitScore = quality * 0.35 + latencyFactor * 0.5 + costFactor * 0.15;
        } else if (priority === 'cost') {
          fitScore = quality * 0.35 + costFactor * 0.5 + latencyFactor * 0.15;
        }

        if (constraintIssues.length > 0) {
          fitScore -= constraintIssues.length * 18;
        }

        fitScore = Math.max(0, Math.min(100, Math.round(fitScore * 10) / 10));

        const rationale = evalRes
          ? `Observed score ${evalRes.overallScore?.toFixed(1) ?? 'N/A'}/100 (${evalRes.executionOrigin}), ${Math.round(latency)}ms avg latency, $${cost.toFixed(4)} run cost, ${evalRes.stats.successRate.toFixed(0)}% task reliability.`
          : 'No evaluation run recorded yet for this candidate; scored conservatively from metadata.';

        return {
          id: item.id,
          name: item.name,
          subtitle:
            'framework' in item
              ? `${item.framework} · ${item.planningStrategy}`
              : `${item.provider} · ${item.modelId}`,
          fitScore,
          evalRes,
          constraintIssues,
          rationale,
        };
      })
      .sort((a, b) => b.fitScore - a.fitScore);
  }, [
    isAgentUseCase,
    runs,
    agents,
    models,
    minSafety,
    maxLatencyMs,
    minContextK,
    requireTools,
    deploymentPref,
    priority,
  ]);

  const topPick = recommendations[0];

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Model & Agent Selection Advisor"
        subtitle="Evidence-based deployment recommendations derived strictly from recorded evaluation scores, latency telemetry, safety gates, and business priorities."
      />

      {/* Business Use-Case & Constraints Controls */}
      <div className="p-5 bg-slate-900/50 border border-slate-800/80 rounded-lg space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs text-slate-400 mb-1">
              Target Enterprise Use Case
            </label>
            <select
              value={useCase}
              onChange={(e) => setUseCase(e.target.value as UseCase)}
              className="w-full bg-slate-950 border border-slate-800 rounded-md px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-sky-500"
            >
              {USE_CASES.map((uc) => (
                <option key={uc} value={uc}>
                  {uc}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs text-slate-400 mb-1">
              Optimization Priority
            </label>
            <select
              value={priority}
              onChange={(e) =>
                setPriority(e.target.value as 'quality' | 'balanced' | 'latency' | 'cost')
              }
              className="w-full bg-slate-950 border border-slate-800 rounded-md px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-sky-500"
            >
              <option value="balanced">Balanced Quality / Latency / Cost</option>
              <option value="quality">Maximum Accuracy & Reasoning</option>
              <option value="latency">Lowest Latency / High Throughput</option>
              <option value="cost">Lowest Inference Cost ($0 Free / Local)</option>
            </select>
          </div>

          <div>
            <label className="block text-xs text-slate-400 mb-1">
              Deployment Constraint
            </label>
            <select
              value={deploymentPref}
              onChange={(e) =>
                setDeploymentPref(
                  e.target.value as 'any' | 'free-tier-cloud' | 'local-self-hosted'
                )
              }
              className="w-full bg-slate-950 border border-slate-800 rounded-md px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-sky-500"
            >
              <option value="any">Any Compliant Deployment</option>
              <option value="free-tier-cloud">Cloud Free Tier Only</option>
              <option value="local-self-hosted">Local Self-Hosted (Air-Gapped / Ollama)</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-1">
          <div>
            <label className="block text-xs text-slate-400 mb-1">
              Max Avg Latency (ms)
            </label>
            <input
              type="number"
              step={100}
              value={maxLatencyMs}
              onChange={(e) => setMaxLatencyMs(Number(e.target.value))}
              className="w-full bg-slate-950 border border-slate-800 rounded-md px-3 py-2 text-xs font-mono text-slate-100"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">
              Min Safety Score (0-100)
            </label>
            <input
              type="number"
              min={0}
              max={100}
              value={minSafety}
              onChange={(e) => setMinSafety(Number(e.target.value))}
              className="w-full bg-slate-950 border border-slate-800 rounded-md px-3 py-2 text-xs font-mono text-slate-100"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">
              Min Context (k tokens)
            </label>
            <input
              type="number"
              value={minContextK}
              onChange={(e) => setMinContextK(Number(e.target.value))}
              className="w-full bg-slate-950 border border-slate-800 rounded-md px-3 py-2 text-xs font-mono text-slate-100"
            />
          </div>
          <label className="flex items-center gap-2 text-xs text-slate-300 pt-5 cursor-pointer">
            <input
              type="checkbox"
              checked={requireTools}
              onChange={(e) => setRequireTools(e.target.checked)}
              className="rounded border-slate-700 bg-slate-950 text-sky-500"
            />
            Require Tool Calling
          </label>
        </div>
      </div>

      {/* Primary Recommendation Callout */}
      {topPick && (
        <div className="p-5 bg-slate-900/70 border border-sky-500/50 rounded-lg space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs font-semibold text-sky-400">
              Recommended {isAgentUseCase ? 'AI Agent' : 'Foundation Model'} for {useCase}
            </div>
            <div className="text-xs font-mono text-slate-300">
              Fit Index: <ScoreDisplay value={topPick.fitScore} />
            </div>
          </div>
          <div className="text-lg font-semibold text-slate-50">
            {topPick.name}{' '}
            <span className="text-sm font-normal text-slate-400">
              · {topPick.subtitle}
            </span>
          </div>
          <p className="text-xs text-slate-300 leading-relaxed">{topPick.rationale}</p>
        </div>
      )}

      {/* Full Ranked Recommendations Table */}
      <div className="bg-slate-900/40 border border-slate-800/80 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-900/70 text-slate-400 border-b border-slate-800/80">
              <tr>
                <th className="py-3 px-4 font-medium">Candidate</th>
                <th className="py-3 px-3 font-medium">Evidence Source</th>
                <th className="py-3 px-3 font-medium text-right">Fit Index</th>
                <th className="py-3 px-3 font-medium text-right">Eval Score</th>
                <th className="py-3 px-3 font-medium">Constraint Audit & Rationale</th>
                <th className="py-3 px-4 font-medium text-right">Readiness</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70">
              {recommendations.map((rec) => (
                <tr key={rec.id} className="hover:bg-slate-800/30">
                  <td className="py-3.5 px-4">
                    <div className="font-semibold text-slate-100">{rec.name}</div>
                    <div className="text-[11px] text-slate-500">{rec.subtitle}</div>
                  </td>
                  <td className="py-3.5 px-3">
                    {rec.evalRes ? (
                      <OriginLabel origin={rec.evalRes.executionOrigin} />
                    ) : (
                      <span className="text-slate-500">Unevaluated</span>
                    )}
                  </td>
                  <td className="py-3.5 px-3 text-right">
                    <ScoreDisplay value={rec.fitScore} />
                  </td>
                  <td className="py-3.5 px-3 text-right">
                    <ScoreDisplay value={rec.evalRes?.overallScore ?? null} />
                  </td>
                  <td className="py-3.5 px-3 max-w-md">
                    <div className="text-slate-300">{rec.rationale}</div>
                    {rec.constraintIssues.length > 0 && (
                      <div className="text-[11px] text-rose-400 mt-1">
                        Constraints missed: {rec.constraintIssues.join(' · ')}
                      </div>
                    )}
                  </td>
                  <td className="py-3.5 px-4 text-right">
                    {rec.evalRes ? (
                      <SafetyGateLabel
                        passed={rec.evalRes.safetyGatePassed}
                        deploymentReady={rec.evalRes.deploymentReady}
                      />
                    ) : (
                      <span className="text-slate-500">Run Eval First</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
