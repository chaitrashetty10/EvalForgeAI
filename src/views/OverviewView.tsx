import React, { useMemo, useState } from 'react';
import {
  HorizontalBarChart,
  ScatterPlotChart,
  TrendLineChart,
} from '../components/Charts';
import {
  OriginLabel,
  SafetyGateLabel,
  ScoreDisplay,
  SectionHeader,
} from '../components/OriginText';
import { useEvalStore } from '../store/evalStore';
import type { BenchmarkCategory, ExecutionOrigin } from '../shared/types';

export function OverviewView({
  onNavigate,
}: {
  onNavigate: (tab: string, payload?: { runId?: string; traceId?: string }) => void;
}) {
  const { models, agents, datasets, runs, providerStatus } = useEvalStore();

  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterOrigin, setFilterOrigin] = useState<string>('all');
  const [filterFramework, setFilterFramework] = useState<string>('all');
  const [filterDataset, setFilterDataset] = useState<string>('all');
  const [filterDateRange, setFilterDateRange] = useState<string>('all');

  const filteredRuns = useMemo(() => {
    const now = Date.now();
    return runs.filter((run) => {
      if (filterStatus !== 'all' && run.status !== filterStatus) return false;
      if (filterOrigin !== 'all' && run.executionOrigin !== filterOrigin) return false;
      if (filterDataset !== 'all' && run.datasetId !== filterDataset) return false;
      if (filterCategory !== 'all') {
        const ds = datasets.find((d) => d.id === run.datasetId);
        if (!ds || ds.category !== (filterCategory as BenchmarkCategory)) return false;
      }
      if (filterFramework !== 'all' && run.track === 'agent') {
        const matchesFw = run.results.some((r) =>
          r.providerOrFramework.toLowerCase().includes(filterFramework.toLowerCase())
        );
        if (!matchesFw) return false;
      }
      if (filterDateRange !== 'all') {
        const ts = new Date(run.completedAt).getTime();
        const days = filterDateRange === '7d' ? 7 : 30;
        if (now - ts > days * 86_400_000) return false;
      }
      return true;
    });
  }, [
    runs,
    datasets,
    filterCategory,
    filterStatus,
    filterOrigin,
    filterFramework,
    filterDataset,
    filterDateRange,
  ]);

  const llmResults = useMemo(
    () =>
      filteredRuns
        .filter((r) => r.track === 'llm')
        .flatMap((r) =>
          r.results.map((res) => ({ ...res, runName: r.name, runId: r.id }))
        ),
    [filteredRuns]
  );

  const agentResults = useMemo(
    () =>
      filteredRuns
        .filter((r) => r.track === 'agent')
        .flatMap((r) =>
          r.results.map((res) => ({ ...res, runName: r.name, runId: r.id }))
        ),
    [filteredRuns]
  );

  const allResults = [...llmResults, ...agentResults];

  const avgOverallScore = useMemo(() => {
    const valid = allResults
      .map((r) => r.overallScore)
      .filter((v): v is number => typeof v === 'number');
    if (valid.length === 0) return null;
    return valid.reduce((a, b) => a + b, 0) / valid.length;
  }, [allResults]);

  const bestModel = useMemo(
    () =>
      [...llmResults]
        .filter((r) => r.safetyGatePassed && r.overallScore !== null)
        .sort((a, b) => (b.overallScore ?? 0) - (a.overallScore ?? 0))[0] ?? null,
    [llmResults]
  );

  const bestAgent = useMemo(
    () =>
      [...agentResults]
        .filter((r) => r.safetyGatePassed && r.overallScore !== null)
        .sort((a, b) => (b.overallScore ?? 0) - (a.overallScore ?? 0))[0] ?? null,
    [agentResults]
  );

  const lowestCostModel = useMemo(
    () =>
      [...llmResults].sort((a, b) => a.totalCostUsd - b.totalCostUsd)[0] ?? null,
    [llmResults]
  );

  const fastestModel = useMemo(
    () =>
      [...llmResults]
        .filter((r) => r.avgLatencyMs > 0)
        .sort((a, b) => a.avgLatencyMs - b.avgLatencyMs)[0] ?? null,
    [llmResults]
  );

  const highestReliability = useMemo(
    () =>
      [...allResults].sort((a, b) => b.stats.successRate - a.stats.successRate)[0] ??
      null,
    [allResults]
  );

  const avgSafetyScore = useMemo(() => {
    const vals = allResults
      .map((r) => r.dimensionScores.safety ?? r.dimensionScores.safetyGovernance)
      .filter((v): v is number => typeof v === 'number');
    if (vals.length === 0) return null;
    return vals.reduce((a, b) => a + b, 0) / vals.length;
  }, [allResults]);

  const successRateAvg = useMemo(() => {
    if (allResults.length === 0) return 0;
    return (
      allResults.reduce((acc, r) => acc + r.stats.successRate, 0) / allResults.length
    );
  }, [allResults]);

  const scoreDistribution = useMemo(() => {
    const buckets = [
      { label: '90–100 (Production Tier)', count: 0 },
      { label: '75–89 (Candidate Tier)', count: 0 },
      { label: '60–74 (Needs Tuning)', count: 0 },
      { label: '0–59 (Below Threshold)', count: 0 },
    ];
    for (const r of allResults) {
      const s = r.overallScore ?? 0;
      if (s >= 90) buckets[0].count++;
      else if (s >= 75) buckets[1].count++;
      else if (s >= 60) buckets[2].count++;
      else buckets[3].count++;
    }
    return buckets;
  }, [allResults]);

  const trendPoints = useMemo(() => {
    return [...filteredRuns]
      .slice(0, 6)
      .reverse()
      .map((run) => {
        const scores = run.results
          .map((r) => r.overallScore)
          .filter((v): v is number => typeof v === 'number');
        const meanScore = scores.length
          ? scores.reduce((a, b) => a + b, 0) / scores.length
          : 0;
        const meanRel = run.results.length
          ? run.results.reduce((a, b) => a + b.stats.successRate, 0) /
            run.results.length
          : 0;
        return {
          label: run.name.split('—').pop()?.trim() || run.id,
          score: Math.round(meanScore * 10) / 10,
          reliability: Math.round(meanRel * 10) / 10,
        };
      });
  }, [filteredRuns]);

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Evaluation Overview"
        subtitle="Executive telemetry across foundational LLMs and autonomous agents. LLM and Agent evaluation tracks are scored and ranked separately."
        actions={
          <div className="flex items-center gap-3">
            <button
              onClick={() => onNavigate('evaluations')}
              className="px-4 py-2 text-xs font-semibold rounded-md bg-sky-500 hover:bg-sky-400 text-slate-950 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Launch Evaluation Run
            </button>
          </div>
        }
      />

      {/* Provider Runtime Availability Strip (clean hairline, zero pills) */}
      <div className="flex flex-wrap items-center justify-between gap-4 px-4 py-3 bg-slate-900/60 border border-slate-800/80 rounded-lg text-xs">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5">
          <span className="text-slate-400 font-medium">Adapter Status:</span>
          <span>
            Google Gemini Free Tier:{' '}
            <strong
              className={
                providerStatus?.geminiConfigured
                  ? 'text-emerald-400 font-medium'
                  : 'text-amber-400 font-medium'
              }
            >
              {providerStatus?.geminiConfigured
                ? 'Live Key Active'
                : 'Simulation Fallback Available'}
            </strong>
          </span>
          <span className="text-slate-700" aria-hidden="true">
            ·
          </span>
          <span>
            Ollama Local:{' '}
            <strong
              className={
                providerStatus?.ollamaConfigured
                  ? 'text-sky-400 font-medium'
                  : 'text-slate-400 font-medium'
              }
            >
              {providerStatus?.ollamaConfigured ? 'Configured' : 'Not Configured'}
            </strong>
          </span>
          <span className="text-slate-700" aria-hidden="true">
            ·
          </span>
          <span>
            Groq Free Tier:{' '}
            <strong
              className={
                providerStatus?.groqConfigured
                  ? 'text-sky-400 font-medium'
                  : 'text-slate-400 font-medium'
              }
            >
              {providerStatus?.groqConfigured ? 'Configured' : 'Optional / Unset'}
            </strong>
          </span>
        </div>
        <div className="font-mono tabular-nums text-slate-400">
          Quota guard: {providerStatus?.rateLimiter.requestsLastMinute ?? 0}/
          {providerStatus?.rateLimiter.maxPerMinute ?? 36} req/min
        </div>
      </div>

      {/* Filter Bar */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <select
          aria-label="Filter by category"
          value={filterCategory}
          onChange={(e) => setFilterCategory(e.target.value)}
          className="bg-slate-900 border border-slate-800 rounded-md px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-sky-500"
        >
          <option value="all">All Categories</option>
          <option value="General reasoning">General reasoning</option>
          <option value="RAG evaluation">RAG evaluation</option>
          <option value="Instruction following">Instruction following</option>
          <option value="Agent workflows">Agent workflows</option>
          <option value="Tool calling">Tool calling</option>
          <option value="Safety">Safety</option>
          <option value="Coding">Coding</option>
        </select>

        <select
          aria-label="Filter by agent framework"
          value={filterFramework}
          onChange={(e) => setFilterFramework(e.target.value)}
          className="bg-slate-900 border border-slate-800 rounded-md px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-sky-500"
        >
          <option value="all">All Frameworks</option>
          <option value="LangGraph">LangGraph</option>
          <option value="LangChain">LangChain</option>
          <option value="CrewAI">CrewAI</option>
          <option value="AutoGen">AutoGen</option>
        </select>

        <select
          aria-label="Filter by benchmark dataset"
          value={filterDataset}
          onChange={(e) => setFilterDataset(e.target.value)}
          className="bg-slate-900 border border-slate-800 rounded-md px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-sky-500"
        >
          <option value="all">All Datasets</option>
          {datasets.map((ds) => (
            <option key={ds.id} value={ds.id}>
              {ds.name}
            </option>
          ))}
        </select>

        <select
          aria-label="Filter by execution origin"
          value={filterOrigin}
          onChange={(e) => setFilterOrigin(e.target.value)}
          className="bg-slate-900 border border-slate-800 rounded-md px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-sky-500"
        >
          <option value="all">All Execution Modes</option>
          <option value="live">Live API Only</option>
          <option value="local">Local Ollama Only</option>
          <option value="simulated">Simulated Demo Only</option>
        </select>

        <select
          aria-label="Filter by status"
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="bg-slate-900 border border-slate-800 rounded-md px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-sky-500"
        >
          <option value="all">All Statuses</option>
          <option value="completed">Completed</option>
          <option value="partial">Partial</option>
          <option value="failed">Failed</option>
        </select>

        <select
          aria-label="Filter by date range"
          value={filterDateRange}
          onChange={(e) => setFilterDateRange(e.target.value)}
          className="bg-slate-900 border border-slate-800 rounded-md px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-sky-500"
        >
          <option value="all">All Time</option>
          <option value="7d">Last 7 Days</option>
          <option value="30d">Last 30 Days</option>
        </select>
      </div>

      {/* Executive KPI Matrix (10 core metrics in clean 5x2 grid, hairline dividers) */}
      <div className="grid grid-cols-2 md:grid-cols-5 border border-slate-800/80 rounded-lg bg-slate-900/40 divide-y md:divide-y-0 md:divide-x divide-slate-800/80">
        <div className="p-4">
          <div className="text-xs text-slate-400">Models / Agents</div>
          <div className="mt-1.5 text-xl font-semibold font-mono tabular-nums text-slate-50">
            {models.length} <span className="text-slate-500 text-sm">/ {agents.length}</span>
          </div>
          <div className="mt-1 text-xs text-slate-500">
            {filteredRuns.length} total evaluation runs
          </div>
        </div>

        <div className="p-4">
          <div className="text-xs text-slate-400">Avg Evaluation Score</div>
          <div className="mt-1.5 text-xl font-semibold">
            <ScoreDisplay value={avgOverallScore} suffix="/100" />
          </div>
          <div className="mt-1 text-xs text-slate-500 font-mono tabular-nums">
            Success {successRateAvg.toFixed(1)}% · Fail {(100 - successRateAvg).toFixed(1)}%
          </div>
        </div>

        <div className="p-4">
          <div className="text-xs text-slate-400">Best-Performing LLM</div>
          <div className="mt-1.5 text-sm font-semibold text-slate-100 truncate">
            {bestModel ? bestModel.targetName : 'N/A'}
          </div>
          <div className="mt-1 text-xs text-slate-400">
            {bestModel ? (
              <>
                <ScoreDisplay value={bestModel.overallScore} /> ·{' '}
                <OriginLabel origin={bestModel.executionOrigin} />
              </>
            ) : (
              'No passing LLM'
            )}
          </div>
        </div>

        <div className="p-4">
          <div className="text-xs text-slate-400">Best-Performing Agent</div>
          <div className="mt-1.5 text-sm font-semibold text-slate-100 truncate">
            {bestAgent ? bestAgent.targetName : 'N/A'}
          </div>
          <div className="mt-1 text-xs text-slate-400">
            {bestAgent ? (
              <>
                <ScoreDisplay value={bestAgent.overallScore} /> ·{' '}
                <OriginLabel origin={bestAgent.executionOrigin} />
              </>
            ) : (
              'No passing Agent'
            )}
          </div>
        </div>

        <div className="p-4">
          <div className="text-xs text-slate-400">Safety & Compliance</div>
          <div className="mt-1.5 text-xl font-semibold">
            <ScoreDisplay value={avgSafetyScore} suffix="/100" />
          </div>
          <div className="mt-1 text-xs text-slate-500">
            Fastest: {fastestModel ? `${fastestModel.avgLatencyMs.toFixed(0)}ms` : 'N/A'} · Lowest cost:{' '}
            {lowestCostModel ? `$${lowestCostModel.totalCostUsd.toFixed(4)}` : 'N/A'}
          </div>
        </div>
      </div>

      {/* Secondary KPI Strip: Reliability, Fastest Model, Lowest Cost */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-4 bg-slate-900/40 border border-slate-800/80 rounded-lg flex items-center justify-between">
          <div>
            <div className="text-xs text-slate-400">Highest Reliability Score</div>
            <div className="mt-1 text-sm font-medium text-slate-100">
              {highestReliability?.targetName ?? 'N/A'}
            </div>
          </div>
          <div className="text-right font-mono tabular-nums">
            <div className="text-lg font-semibold text-emerald-400">
              {highestReliability ? `${highestReliability.stats.successRate.toFixed(1)}%` : 'N/A'}
            </div>
            <div className="text-xs text-slate-500">Task success rate</div>
          </div>
        </div>

        <div className="p-4 bg-slate-900/40 border border-slate-800/80 rounded-lg flex items-center justify-between">
          <div>
            <div className="text-xs text-slate-400">Fastest Evaluated Model</div>
            <div className="mt-1 text-sm font-medium text-slate-100">
              {fastestModel?.targetName ?? 'N/A'}
            </div>
          </div>
          <div className="text-right font-mono tabular-nums">
            <div className="text-lg font-semibold text-sky-300">
              {fastestModel ? `${fastestModel.avgLatencyMs.toFixed(0)} ms` : 'N/A'}
            </div>
            <div className="text-xs text-slate-500">
              TTFT {fastestModel ? `${fastestModel.avgTtftMs.toFixed(0)} ms` : 'N/A'}
            </div>
          </div>
        </div>

        <div className="p-4 bg-slate-900/40 border border-slate-800/80 rounded-lg flex items-center justify-between">
          <div>
            <div className="text-xs text-slate-400">Lowest-Cost Model</div>
            <div className="mt-1 text-sm font-medium text-slate-100">
              {lowestCostModel?.targetName ?? 'N/A'}
            </div>
          </div>
          <div className="text-right font-mono tabular-nums">
            <div className="text-lg font-semibold text-emerald-400">
              {lowestCostModel ? `$${lowestCostModel.totalCostUsd.toFixed(4)}` : 'N/A'}
            </div>
            <div className="text-xs text-slate-500">Zero-cost eligible tier</div>
          </div>
        </div>
      </div>

      {/* Performance Charts Row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="p-5 bg-slate-900/40 border border-slate-800/80 rounded-lg">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-semibold text-slate-100">
                LLM Model Performance Comparison
              </h2>
              <p className="text-xs text-slate-400">
                Weighted overall score (0–100) across evaluated model configurations
              </p>
            </div>
            <button
              onClick={() => onNavigate('model-comparison')}
              className="text-xs text-sky-400 hover:text-sky-300 cursor-pointer"
            >
              Compare Models
            </button>
          </div>
          <HorizontalBarChart
            items={llmResults.map((r) => ({
              label: r.targetName,
              sublabel: r.executionOrigin === 'live' ? 'Live API' : r.executionOrigin === 'local' ? 'Local' : 'Simulated Demo',
              value: r.overallScore ?? 0,
              flagged: !r.safetyGatePassed,
            }))}
          />
        </div>

        <div className="p-5 bg-slate-900/40 border border-slate-800/80 rounded-lg">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-semibold text-slate-100">
                AI Agent Performance Comparison
              </h2>
              <p className="text-xs text-slate-400">
                Trace-verified weighted score across autonomous agent workflows
              </p>
            </div>
            <button
              onClick={() => onNavigate('agent-comparison')}
              className="text-xs text-sky-400 hover:text-sky-300 cursor-pointer"
            >
              Compare Agents
            </button>
          </div>
          <HorizontalBarChart
            items={agentResults.map((r) => ({
              label: r.targetName,
              sublabel: r.providerOrFramework,
              value: r.overallScore ?? 0,
              flagged: !r.safetyGatePassed,
            }))}
          />
        </div>
      </div>

      {/* Scatter Plots: Quality vs Cost & Quality vs Latency */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="p-5 bg-slate-900/40 border border-slate-800/80 rounded-lg">
          <h2 className="text-sm font-semibold text-slate-100">
            Quality vs. Latency Trade-off
          </h2>
          <p className="text-xs text-slate-400 mb-3">
            Upper-left quadrant represents optimal high accuracy and low response latency
          </p>
          <ScatterPlotChart
            points={allResults.map((r) => ({
              id: `${r.runId}-${r.targetId}`,
              label: r.targetName,
              x: r.avgLatencyMs,
              y: r.overallScore ?? 0,
              origin: r.executionOrigin,
              flagged: !r.safetyGatePassed,
            }))}
            xLabel="Avg Latency (ms)"
            yLabel="Weighted Score"
            formatX={(v) => `${Math.round(v)} ms`}
            formatY={(v) => `${v.toFixed(1)}/100`}
          />
        </div>

        <div className="p-5 bg-slate-900/40 border border-slate-800/80 rounded-lg">
          <h2 className="text-sm font-semibold text-slate-100">
            Quality vs. Cost Efficiency
          </h2>
          <p className="text-xs text-slate-400 mb-3">
            Includes free-tier ($0.00) and token-normalized inference cost per evaluation run
          </p>
          <ScatterPlotChart
            points={allResults.map((r) => ({
              id: `${r.runId}-${r.targetId}-cost`,
              label: r.targetName,
              x: r.totalCostUsd,
              y: r.overallScore ?? 0,
              origin: r.executionOrigin,
              flagged: !r.safetyGatePassed,
            }))}
            xLabel="Run Cost (USD)"
            yLabel="Weighted Score"
            formatX={(v) => `$${v.toFixed(4)}`}
            formatY={(v) => `${v.toFixed(1)}/100`}
          />
        </div>
      </div>

      {/* Reliability Trend & Distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 p-5 bg-slate-900/40 border border-slate-800/80 rounded-lg">
          <h2 className="text-sm font-semibold text-slate-100">
            Reliability & Quality Trends Across Runs
          </h2>
          <p className="text-xs text-slate-400 mb-3">
            Tracks aggregate weighted scores alongside task completion success rates
          </p>
          <TrendLineChart points={trendPoints} />
        </div>

        <div className="p-5 bg-slate-900/40 border border-slate-800/80 rounded-lg">
          <h2 className="text-sm font-semibold text-slate-100">
            Score Distribution
          </h2>
          <p className="text-xs text-slate-400 mb-4">
            Evaluated targets grouped by deployment readiness tier
          </p>
          <div className="space-y-3">
            {scoreDistribution.map((b) => (
              <div key={b.label} className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-slate-300">{b.label}</span>
                  <span className="font-mono tabular-nums text-slate-200">{b.count}</span>
                </div>
                <div className="h-1.5 bg-slate-800 rounded-sm overflow-hidden">
                  <div
                    className="h-full bg-sky-400/80"
                    style={{
                      width: `${allResults.length ? (b.count / allResults.length) * 100 : 0}%`,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Separate Leaderboards: LLM Track & Agent Track */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-slate-900/40 border border-slate-800/80 rounded-lg overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-800/80 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-slate-100">
                LLM Ranking Leaderboard
              </h2>
              <p className="text-xs text-slate-400">Foundational & Instruction Track</p>
            </div>
            <button
              onClick={() => onNavigate('traces')}
              className="text-xs text-sky-400 hover:text-sky-300 cursor-pointer"
            >
              Inspect Traces
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-slate-400 border-b border-slate-800/80">
                <tr>
                  <th className="py-2.5 px-4 font-medium">Model</th>
                  <th className="py-2.5 px-3 font-medium">Origin</th>
                  <th className="py-2.5 px-3 font-medium text-right">Score</th>
                  <th className="py-2.5 px-3 font-medium text-right">Latency</th>
                  <th className="py-2.5 px-4 font-medium text-right">Readiness</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {[...llmResults]
                  .sort((a, b) => (b.overallScore ?? 0) - (a.overallScore ?? 0))
                  .map((r) => (
                    <tr key={`${r.runId}-${r.targetId}`} className="hover:bg-slate-800/30">
                      <td className="py-2.5 px-4 font-medium text-slate-200">
                        {r.targetName}
                      </td>
                      <td className="py-2.5 px-3">
                        <OriginLabel origin={r.executionOrigin as ExecutionOrigin} />
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <ScoreDisplay value={r.overallScore} />
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-300">
                        {Math.round(r.avgLatencyMs)}ms
                      </td>
                      <td className="py-2.5 px-4 text-right">
                        <SafetyGateLabel
                          passed={r.safetyGatePassed}
                          deploymentReady={r.deploymentReady}
                        />
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-slate-900/40 border border-slate-800/80 rounded-lg overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-800/80 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-slate-100">
                AI Agent Ranking Leaderboard
              </h2>
              <p className="text-xs text-slate-400">Autonomous Tool-Use & Workflow Track</p>
            </div>
            <button
              onClick={() => onNavigate('advisor')}
              className="text-xs text-sky-400 hover:text-sky-300 cursor-pointer"
            >
              Selection Advisor
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-slate-400 border-b border-slate-800/80">
                <tr>
                  <th className="py-2.5 px-4 font-medium">Agent</th>
                  <th className="py-2.5 px-3 font-medium">Origin</th>
                  <th className="py-2.5 px-3 font-medium text-right">Score</th>
                  <th className="py-2.5 px-3 font-medium text-right">Success</th>
                  <th className="py-2.5 px-4 font-medium text-right">Readiness</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {[...agentResults]
                  .sort((a, b) => (b.overallScore ?? 0) - (a.overallScore ?? 0))
                  .map((r) => (
                    <tr key={`${r.runId}-${r.targetId}`} className="hover:bg-slate-800/30">
                      <td className="py-2.5 px-4">
                        <div className="font-medium text-slate-200">{r.targetName}</div>
                        <div className="text-[11px] text-slate-500">
                          {r.providerOrFramework}
                        </div>
                      </td>
                      <td className="py-2.5 px-3">
                        <OriginLabel origin={r.executionOrigin as ExecutionOrigin} />
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <ScoreDisplay value={r.overallScore} />
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-300">
                        {r.stats.successRate.toFixed(0)}%
                      </td>
                      <td className="py-2.5 px-4 text-right">
                        <SafetyGateLabel
                          passed={r.safetyGatePassed}
                          deploymentReady={r.deploymentReady}
                        />
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
