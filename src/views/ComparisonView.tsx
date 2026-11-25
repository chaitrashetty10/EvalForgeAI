import React, { useMemo, useState } from 'react';
import {
  HorizontalBarChart,
  RadarChart,
  ScatterPlotChart,
} from '../components/Charts';
import {
  OriginLabel,
  SafetyGateLabel,
  ScoreDisplay,
  SectionHeader,
} from '../components/OriginText';
import {
  AGENT_DIMENSION_LABELS,
  LLM_DIMENSION_LABELS,
} from '../shared/scoring';
import { assessComparisonSignificance } from '../shared/stats';
import { useEvalStore } from '../store/evalStore';

export function ComparisonView({ track }: { track: 'llm' | 'agent' }) {
  const { runs } = useEvalStore();
  const trackRuns = runs.filter((r) => r.track === track);

  const [selectedRunId, setSelectedRunId] = useState<string>(
    trackRuns[0]?.id ?? ''
  );

  const activeRun =
    trackRuns.find((r) => r.id === selectedRunId) ?? trackRuns[0];

  const [selectedTargetIds, setSelectedTargetIds] = useState<string[]>(() =>
    (activeRun?.results ?? []).slice(0, 3).map((r) => r.targetId)
  );

  const effectiveSelected = useMemo(() => {
    const available = activeRun?.results.map((r) => r.targetId) ?? [];
    const filtered = selectedTargetIds.filter((id) => available.includes(id));
    return filtered.length >= 2 ? filtered : available.slice(0, 3);
  }, [activeRun, selectedTargetIds]);

  const comparedResults = useMemo(
    () =>
      (activeRun?.results ?? []).filter((r) =>
        effectiveSelected.includes(r.targetId)
      ),
    [activeRun, effectiveSelected]
  );

  const dimensionMap =
    track === 'llm' ? LLM_DIMENSION_LABELS : AGENT_DIMENSION_LABELS;
  const dimensionKeys = Object.keys(dimensionMap);

  const significance = useMemo(
    () =>
      assessComparisonSignificance(
        comparedResults.map((r) => ({
          id: r.targetId,
          name: r.targetName,
          score: r.overallScore,
          stats: r.stats,
        }))
      ),
    [comparedResults]
  );

  const recommendationNarrative = useMemo(() => {
    if (comparedResults.length < 2) {
      return 'Select at least two evaluated targets to generate a comparative recommendation.';
    }
    const sorted = [...comparedResults].sort(
      (a, b) => (b.overallScore ?? 0) - (a.overallScore ?? 0)
    );
    const best = sorted[0];
    const fastest = [...comparedResults].sort(
      (a, b) => a.avgLatencyMs - b.avgLatencyMs
    )[0];
    const failedSafety = comparedResults.filter((r) => !r.safetyGatePassed);

    const parts: string[] = [];
    if (significance.status === 'statistically-meaningful') {
      parts.push(
        `${best.targetName} leads with a weighted score of ${best.overallScore?.toFixed(1) ?? 'N/A'}/100 (95% CI [${best.stats.ci95Low}, ${best.stats.ci95High}], ${best.stats.successRate.toFixed(0)}% task success).`
      );
    } else {
      parts.push(significance.explanation);
    }

    if (fastest && fastest.targetId !== best.targetId) {
      const speedup =
        best.avgLatencyMs > 0
          ? Math.round(
              ((best.avgLatencyMs - fastest.avgLatencyMs) / best.avgLatencyMs) *
                100
            )
          : 0;
      parts.push(
        `${fastest.targetName} delivers ${speedup > 0 ? `${speedup}% lower latency (${Math.round(fastest.avgLatencyMs)}ms vs ${Math.round(best.avgLatencyMs)}ms)` : `${Math.round(fastest.avgLatencyMs)}ms average latency`}, making it preferred for latency-sensitive high-throughput workloads subject to safety thresholds.`
      );
    }

    if (failedSafety.length > 0) {
      parts.push(
        `Safety Advisory: ${failedSafety.map((f) => f.targetName).join(', ')} failed mandatory safety gates and is blocked from production readiness regardless of speed or cost.`
      );
    }
    return parts.join(' ');
  }, [comparedResults, significance]);

  const toggleTarget = (id: string) => {
    setSelectedTargetIds((prev) =>
      prev.includes(id)
        ? prev.length > 2
          ? prev.filter((x) => x !== id)
          : prev
        : [...prev, id]
    );
  };

  if (!activeRun) {
    return (
      <div className="space-y-6">
        <SectionHeader
          title={track === 'llm' ? 'Model Comparison' : 'Agent Comparison'}
          subtitle="Run an evaluation on this track first to compare candidates side by side."
        />
        <div className="p-10 text-center text-sm text-slate-400 border border-slate-800 rounded-lg">
          No evaluation runs recorded for the {track.toUpperCase()} track yet.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <SectionHeader
        title={
          track === 'llm'
            ? 'Side-by-Side LLM Comparison'
            : 'Side-by-Side AI Agent Comparison'
        }
        subtitle="Compare candidates evaluated on identical test cases and configurations. Includes statistical significance and inconclusive comparison detection."
        actions={
          <select
            aria-label="Select evaluation run"
            value={activeRun.id}
            onChange={(e) => {
              setSelectedRunId(e.target.value);
              const next = trackRuns.find((r) => r.id === e.target.value);
              if (next) {
                setSelectedTargetIds(next.results.slice(0, 3).map((r) => r.targetId));
              }
            }}
            className="bg-slate-900 border border-slate-800 rounded-md px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-sky-500"
          >
            {trackRuns.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name} ({r.executionOrigin})
              </option>
            ))}
          </select>
        }
      />

      {/* Candidate Selector */}
      <div className="flex flex-wrap items-center gap-3 p-4 bg-slate-900/40 border border-slate-800/80 rounded-lg text-xs">
        <span className="text-slate-400 font-medium">Comparing Candidates:</span>
        {activeRun.results.map((r) => {
          const active = effectiveSelected.includes(r.targetId);
          return (
            <button
              key={r.targetId}
              onClick={() => toggleTarget(r.targetId)}
              className={`px-3 py-1.5 rounded-md border transition-colors cursor-pointer ${
                active
                  ? 'bg-sky-500/15 border-sky-500/70 text-sky-200 font-medium'
                  : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              {r.targetName}
            </button>
          );
        })}
        <span className="ml-auto text-slate-500">
          Dataset: {activeRun.datasetName} ({activeRun.datasetVersion}) ·{' '}
          <OriginLabel origin={activeRun.executionOrigin} />
        </span>
      </div>

      {/* Statistical Significance & Recommendation Banner */}
      <div className="p-5 bg-slate-900/50 border border-slate-800/80 rounded-lg space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-slate-100">
            Evidence-Backed Decision Summary
          </h2>
          <span
            className={`text-xs font-medium ${
              significance.status === 'statistically-meaningful'
                ? 'text-emerald-400'
                : 'text-amber-400'
            }`}
          >
            {significance.status === 'statistically-meaningful'
              ? `Statistically Meaningful Lead (+${significance.delta} pts)`
              : significance.status === 'inconclusive'
                ? 'Inconclusive Difference (Overlapping 95% CI)'
                : 'Insufficient Sample Size for CI Significance'}
          </span>
        </div>
        <p className="text-xs text-slate-300 leading-relaxed">
          {recommendationNarrative}
        </p>
      </div>

      {/* Radar + Bar + Scatter Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="p-5 bg-slate-900/40 border border-slate-800/80 rounded-lg">
          <h2 className="text-sm font-semibold text-slate-100 mb-1">
            Multi-Dimensional Capability Radar
          </h2>
          <p className="text-xs text-slate-400 mb-3">
            Normalized 0–100 scores across all 9 weighted evaluation criteria
          </p>
          <RadarChart
            axes={dimensionKeys.map(
              (k) => dimensionMap[k as keyof typeof dimensionMap]
            )}
            series={comparedResults.map((r) => ({
              id: r.targetId,
              name: r.targetName,
              values: dimensionKeys.map((k) => r.dimensionScores[k] ?? null),
            }))}
          />
        </div>

        <div className="p-5 bg-slate-900/40 border border-slate-800/80 rounded-lg space-y-6">
          <div>
            <h2 className="text-sm font-semibold text-slate-100 mb-1">
              Weighted Overall Ranking
            </h2>
            <p className="text-xs text-slate-400 mb-3">
              Composite score honoring active weights and mandatory safety gates
            </p>
            <HorizontalBarChart
              items={comparedResults.map((r) => ({
                label: r.targetName,
                sublabel: r.providerOrFramework,
                value: r.overallScore ?? 0,
                flagged: !r.safetyGatePassed,
              }))}
            />
          </div>

          <div className="border-t border-slate-800/80 pt-4">
            <h3 className="text-sm font-semibold text-slate-100 mb-1">
              Quality vs. Latency Matrix
            </h3>
            <ScatterPlotChart
              points={comparedResults.map((r) => ({
                id: r.targetId,
                label: r.targetName,
                x: r.avgLatencyMs,
                y: r.overallScore ?? 0,
                origin: r.executionOrigin,
                flagged: !r.safetyGatePassed,
              }))}
              xLabel="Avg Latency (ms)"
              yLabel="Overall Score"
              formatX={(v) => `${Math.round(v)} ms`}
              formatY={(v) => `${v.toFixed(1)}`}
            />
          </div>
        </div>
      </div>

      {/* Detailed Dimension & Telemetry Matrix */}
      <div className="bg-slate-900/40 border border-slate-800/80 rounded-lg overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-800/80">
          <h2 className="text-sm font-semibold text-slate-100">
            Dimension-by-Dimension Comparison Matrix
          </h2>
          <p className="text-xs text-slate-400">
            Unavailable or unmeasured metrics are reported explicitly as N/A, never zero.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-900/60 text-slate-400 border-b border-slate-800/80">
              <tr>
                <th className="py-3 px-4 font-medium">Criterion / Metric</th>
                {comparedResults.map((r) => (
                  <th key={r.targetId} className="py-3 px-4 font-medium text-right">
                    {r.targetName}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              <tr className="bg-slate-900/30 font-semibold">
                <td className="py-2.5 px-4 text-slate-100">Weighted Overall Score</td>
                {comparedResults.map((r) => (
                  <td key={r.targetId} className="py-2.5 px-4 text-right">
                    <ScoreDisplay value={r.overallScore} />
                  </td>
                ))}
              </tr>
              {dimensionKeys.map((k) => (
                <tr key={k} className="hover:bg-slate-800/20">
                  <td className="py-2.5 px-4 text-slate-300">
                    {dimensionMap[k as keyof typeof dimensionMap]}
                  </td>
                  {comparedResults.map((r) => (
                    <td key={r.targetId} className="py-2.5 px-4 text-right">
                      <ScoreDisplay value={r.dimensionScores[k]} />
                    </td>
                  ))}
                </tr>
              ))}
              <tr className="border-t border-slate-700/60">
                <td className="py-2.5 px-4 text-slate-300">Avg Latency / TTFT</td>
                {comparedResults.map((r) => (
                  <td
                    key={r.targetId}
                    className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-200"
                  >
                    {Math.round(r.avgLatencyMs)}ms / {Math.round(r.avgTtftMs)}ms
                  </td>
                ))}
              </tr>
              <tr>
                <td className="py-2.5 px-4 text-slate-300">Total Tokens / Cost</td>
                {comparedResults.map((r) => (
                  <td
                    key={r.targetId}
                    className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-200"
                  >
                    {r.totalTokens.toLocaleString()} tok · ${r.totalCostUsd.toFixed(4)}
                  </td>
                ))}
              </tr>
              {track === 'agent' && (
                <tr>
                  <td className="py-2.5 px-4 text-slate-300">Avg Execution Steps</td>
                  {comparedResults.map((r) => (
                    <td
                      key={r.targetId}
                      className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-200"
                    >
                      {r.avgSteps !== null ? r.avgSteps.toFixed(1) : 'N/A'}
                    </td>
                  ))}
                </tr>
              )}
              <tr>
                <td className="py-2.5 px-4 text-slate-300">Success Rate / Failure Rate</td>
                {comparedResults.map((r) => (
                  <td
                    key={r.targetId}
                    className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-200"
                  >
                    {r.stats.successRate.toFixed(1)}% / {r.stats.failureRate.toFixed(1)}%
                  </td>
                ))}
              </tr>
              <tr>
                <td className="py-2.5 px-4 text-slate-300">Deployment Readiness Gate</td>
                {comparedResults.map((r) => (
                  <td key={r.targetId} className="py-2.5 px-4 text-right">
                    <SafetyGateLabel
                      passed={r.safetyGatePassed}
                      deploymentReady={r.deploymentReady}
                    />
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
