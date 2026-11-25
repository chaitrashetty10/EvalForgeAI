import React, { useMemo, useState } from 'react';
import { Download, Printer } from 'lucide-react';
import {
  OriginLabel,
  SafetyGateLabel,
  ScoreDisplay,
  SectionHeader,
} from '../components/OriginText';
import { useEvalStore } from '../store/evalStore';

export function ReportsView() {
  const { runs, models, agents, logAudit } = useEvalStore();
  const [selectedRunId, setSelectedRunId] = useState<string>(runs[0]?.id ?? '');

  const activeRun = runs.find((r) => r.id === selectedRunId) ?? runs[0];

  const markdownReport = useMemo(() => {
    if (!activeRun) return '';
    const lines = [
      `# EvalForge AI — Evaluation Report`,
      ``,
      `- **Run Name:** ${activeRun.name}`,
      `- **Run ID:** ${activeRun.id}`,
      `- **Evaluation Track:** ${activeRun.track.toUpperCase()}`,
      `- **Execution Origin:** ${activeRun.executionOrigin.toUpperCase()}`,
      `- **Environment:** ${activeRun.environment}`,
      `- **Dataset:** ${activeRun.datasetName} (${activeRun.datasetVersion})`,
      `- **Repeat Trials:** ${activeRun.repeatCount}`,
      `- **Completed At:** ${activeRun.completedAt}`,
      ``,
      `## Comparative Results`,
      ``,
      `| Candidate | Origin | Weighted Score | 95% CI | Success Rate | Avg Latency | Cost (USD) | Safety Gate |`,
      `|---|---|---:|---|---:|---:|---:|---|`,
      ...activeRun.results.map(
        (r) =>
          `| ${r.targetName} | ${r.executionOrigin} | ${r.overallScore ?? 'N/A'} | ${
            r.stats.ci95Low !== null ? `[${r.stats.ci95Low}, ${r.stats.ci95High}]` : 'n=1'
          } | ${r.stats.successRate}% | ${Math.round(r.avgLatencyMs)}ms | $${r.totalCostUsd.toFixed(5)} | ${
            r.safetyGatePassed ? 'PASSED' : 'FAILED'
          } |`
      ),
      ``,
      `## Safety & Deployment Readiness Findings`,
      ``,
      ...activeRun.results.map((r) =>
        r.safetyGatePassed
          ? `- **${r.targetName}**: Passed all mandatory safety gates.`
          : `- **${r.targetName} (BLOCKED)**: ${r.safetyGateReasons.join('; ')}`
      ),
    ];
    return lines.join('\n');
  }, [activeRun]);

  const csvReport = useMemo(() => {
    if (!activeRun) return '';

    const escapeCsv = (val: string | number | boolean | null | undefined): string => {
      if (val === null || val === undefined) return 'N/A';
      let str = String(val);
      // Guard against spreadsheet formula injection on string values
      if (typeof val === 'string' && /^[=+\-@\t\r]/.test(str)) {
        str = `'${str}`;
      }
      if (/[",\n\r]/.test(str)) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const dimensionKeys = Array.from(
      new Set(activeRun.results.flatMap((r) => Object.keys(r.dimensionScores)))
    );

    const headers = [
      'Run ID',
      'Run Name',
      'Track',
      'Environment',
      'Dataset',
      'Dataset Version',
      'Completed At',
      'Target ID',
      'Candidate Name',
      'Provider / Framework',
      'Execution Origin',
      'Weighted Overall Score',
      'Sample Size',
      'Repeat Runs',
      'Mean Score',
      'Median Score',
      'Std Dev',
      '95% CI Low',
      '95% CI High',
      'Success Rate (%)',
      'Failure Rate (%)',
      'Avg Latency (ms)',
      'Avg TTFT (ms)',
      'Avg Tokens/sec',
      'Avg Steps',
      'Total Tokens',
      'Total Cost (USD)',
      'Cost Per Success (USD)',
      'Safety Gate Passed',
      'Deployment Ready',
      'Safety Gate Reasons',
      ...dimensionKeys.map((k) => `Dimension: ${k}`),
    ];

    const rows = activeRun.results.map((r) => [
      activeRun.id,
      activeRun.name,
      activeRun.track.toUpperCase(),
      activeRun.environment,
      activeRun.datasetName,
      activeRun.datasetVersion,
      activeRun.completedAt,
      r.targetId,
      r.targetName,
      r.providerOrFramework,
      r.executionOrigin,
      r.overallScore,
      r.stats.sampleSize,
      r.stats.repeatRuns,
      r.stats.mean,
      r.stats.median,
      r.stats.stdDev,
      r.stats.ci95Low,
      r.stats.ci95High,
      r.stats.successRate,
      r.stats.failureRate,
      Math.round(r.avgLatencyMs),
      Math.round(r.avgTtftMs),
      r.avgTokensPerSec,
      r.avgSteps,
      r.totalTokens,
      r.totalCostUsd,
      r.costPerSuccessUsd,
      r.safetyGatePassed ? 'PASSED' : 'FAILED',
      r.deploymentReady ? 'YES' : 'NO',
      r.safetyGateReasons.join('; '),
      ...dimensionKeys.map((k) => r.dimensionScores[k] ?? null),
    ]);

    return [
      headers.map(escapeCsv).join(','),
      ...rows.map((row) => row.map(escapeCsv).join(',')),
    ].join('\n');
  }, [activeRun]);

  const downloadFile = (content: string, filename: string, mime: string) => {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    logAudit('REPORT_EXPORTED', activeRun?.id ?? 'report', `Exported ${filename}`);
  };

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Evaluation Reports & System Architecture"
        subtitle="Export reproducible evaluation dossiers in CSV, Markdown, or JSON, inspect statistical findings, and review EvalForge AI's modular zero-cost architecture."
        actions={
          activeRun && (
            <div className="flex flex-wrap items-center gap-2.5">
              <button
                onClick={() =>
                  downloadFile(
                    csvReport,
                    `${activeRun.id}_summary.csv`,
                    'text/csv;charset=utf-8;'
                  )
                }
                className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-md border border-slate-700 hover:border-slate-600 text-slate-200 cursor-pointer whitespace-nowrap"
              >
                <Download className="w-3.5 h-3.5" />
                Export CSV
              </button>
              <button
                onClick={() =>
                  downloadFile(
                    markdownReport,
                    `${activeRun.id}_report.md`,
                    'text/markdown'
                  )
                }
                className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-md border border-slate-700 hover:border-slate-600 text-slate-200 cursor-pointer whitespace-nowrap"
              >
                <Download className="w-3.5 h-3.5" />
                Export Markdown
              </button>
              <button
                onClick={() =>
                  downloadFile(
                    JSON.stringify(activeRun, null, 2),
                    `${activeRun.id}_full_record.json`,
                    'application/json'
                  )
                }
                className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-md border border-slate-700 hover:border-slate-600 text-slate-200 cursor-pointer whitespace-nowrap"
              >
                <Download className="w-3.5 h-3.5" />
                Export JSON
              </button>
              <button
                onClick={() => window.print()}
                className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-md bg-sky-500 hover:bg-sky-400 text-slate-950 cursor-pointer whitespace-nowrap"
              >
                <Printer className="w-3.5 h-3.5" />
                Print Report
              </button>
            </div>
          )
        }
      />

      <div className="flex items-center gap-3">
        <span className="text-xs text-slate-400">Select Evaluation Run:</span>
        <select
          value={activeRun?.id ?? ''}
          onChange={(e) => setSelectedRunId(e.target.value)}
          className="bg-slate-900 border border-slate-800 rounded-md px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-sky-500"
        >
          {runs.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name} ({r.executionOrigin})
            </option>
          ))}
        </select>
      </div>

      {activeRun && (
        <div className="p-6 bg-slate-900/50 border border-slate-800/80 rounded-lg space-y-6">
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-800 pb-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-50">
                {activeRun.name}
              </h2>
              <div className="text-xs text-slate-400 mt-1">
                Dataset: {activeRun.datasetName} ({activeRun.datasetVersion}) · Track:{' '}
                {activeRun.track.toUpperCase()} · Sample Traces: {activeRun.traces.length} ·{' '}
                <OriginLabel origin={activeRun.executionOrigin} />
              </div>
            </div>
            <div className="text-right text-xs font-mono text-slate-400">
              <div>Registered Models: {models.length}</div>
              <div>Registered Agents: {agents.length}</div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-slate-400 border-b border-slate-800">
                <tr>
                  <th className="py-2.5 px-3 font-medium">Candidate</th>
                  <th className="py-2.5 px-3 font-medium">Origin</th>
                  <th className="py-2.5 px-3 font-medium text-right">Score</th>
                  <th className="py-2.5 px-3 font-medium text-right">Median / σ</th>
                  <th className="py-2.5 px-3 font-medium text-right">Success</th>
                  <th className="py-2.5 px-3 font-medium text-right">Latency</th>
                  <th className="py-2.5 px-3 font-medium text-right">Cost</th>
                  <th className="py-2.5 px-3 font-medium text-right">Readiness</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {activeRun.results.map((r) => (
                  <tr key={r.targetId}>
                    <td className="py-2.5 px-3 font-medium text-slate-100">
                      {r.targetName}
                    </td>
                    <td className="py-2.5 px-3">
                      <OriginLabel origin={r.executionOrigin} />
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      <ScoreDisplay value={r.overallScore} />
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-300">
                      {r.stats.median} / {r.stats.stdDev}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-300">
                      {r.stats.successRate}%
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-300">
                      {Math.round(r.avgLatencyMs)}ms
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-300">
                      ${r.totalCostUsd.toFixed(5)}
                    </td>
                    <td className="py-2.5 px-3 text-right">
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
      )}

      {/* Modular System Architecture Diagram */}
      <div className="p-6 bg-slate-900/40 border border-slate-800/80 rounded-lg space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-slate-100">
            EvalForge AI Modular Architecture Diagram
          </h2>
          <p className="text-xs text-slate-400">
            Zero-cost full-stack architecture separating browser presentation, server-side provider adapters, sandboxed agent tools, deterministic checks, and blind LLM-as-a-Judge.
          </p>
        </div>

        <svg viewBox="0 0 880 240" className="w-full h-auto">
          <defs>
            <marker
              id="arrow"
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 1 L 10 5 L 0 9 z" fill="#475569" />
            </marker>
          </defs>

          {/* Column 1: Client Layer */}
          <rect x="16" y="24" width="180" height="192" rx="6" fill="#0F172A" stroke="#334155" />
          <text x="106" y="48" textAnchor="middle" className="fill-sky-300 text-[11px] font-semibold">
            React + TS Client Layer
          </text>
          <text x="106" y="76" textAnchor="middle" className="fill-slate-300 text-[10px]">
            Dashboard & Leaderboards
          </text>
          <text x="106" y="102" textAnchor="middle" className="fill-slate-300 text-[10px]">
            Benchmarks & CSV/JSON
          </text>
          <text x="106" y="128" textAnchor="middle" className="fill-slate-300 text-[10px]">
            Trace Timeline & Overrides
          </text>
          <text x="106" y="154" textAnchor="middle" className="fill-slate-300 text-[10px]">
            Selection Advisor & Reports
          </text>
          <text x="106" y="186" textAnchor="middle" className="fill-slate-500 text-[9.5px]">
            LocalStorage History
          </text>

          {/* Column 2: Express Orchestrator */}
          <rect x="240" y="24" width="185" height="192" rx="6" fill="#0F172A" stroke="#334155" />
          <text x="332" y="48" textAnchor="middle" className="fill-sky-300 text-[11px] font-semibold">
            Evaluation Orchestrator
          </text>
          <text x="332" y="76" textAnchor="middle" className="fill-slate-300 text-[10px]">
            Express API (/api/evaluations)
          </text>
          <text x="332" y="102" textAnchor="middle" className="fill-slate-300 text-[10px]">
            Concurrency & Rate Limiter
          </text>
          <text x="332" y="128" textAnchor="middle" className="fill-slate-300 text-[10px]">
            Agent Loop & HITL Gates
          </text>
          <text x="332" y="154" textAnchor="middle" className="fill-slate-300 text-[10px]">
            Sandboxed Tools (5)
          </text>
          <text x="332" y="186" textAnchor="middle" className="fill-slate-500 text-[9.5px]">
            Server-Only Secrets
          </text>

          {/* Column 3: Model Adapters */}
          <rect x="470" y="24" width="180" height="192" rx="6" fill="#0F172A" stroke="#334155" />
          <text x="560" y="48" textAnchor="middle" className="fill-emerald-300 text-[11px] font-semibold">
            Model Provider Adapters
          </text>
          <text x="560" y="78" textAnchor="middle" className="fill-slate-300 text-[10px]">
            Gemini Free Tier (@google/genai)
          </text>
          <text x="560" y="106" textAnchor="middle" className="fill-slate-300 text-[10px]">
            Local Ollama (Self-Hosted)
          </text>
          <text x="560" y="134" textAnchor="middle" className="fill-slate-300 text-[10px]">
            Groq Free Tier (Optional)
          </text>
          <text x="560" y="162" textAnchor="middle" className="fill-amber-300 text-[10px]">
            Labeled Simulation Mode
          </text>

          {/* Column 4: Scoring & Judge */}
          <rect x="692" y="24" width="172" height="192" rx="6" fill="#0F172A" stroke="#334155" />
          <text x="778" y="48" textAnchor="middle" className="fill-sky-300 text-[11px] font-semibold">
            Scoring & Safety Engine
          </text>
          <text x="778" y="78" textAnchor="middle" className="fill-slate-300 text-[10px]">
            Deterministic Checks
          </text>
          <text x="778" y="106" textAnchor="middle" className="fill-slate-300 text-[10px]">
            Blind LLM-as-a-Judge
          </text>
          <text x="778" y="134" textAnchor="middle" className="fill-slate-300 text-[10px]">
            Weighted Scoring (0–100)
          </text>
          <text x="778" y="162" textAnchor="middle" className="fill-rose-300 text-[10px]">
            Safety Gates & 95% CI
          </text>

          <line x1="196" y1="120" x2="236" y2="120" stroke="#475569" strokeWidth="1.5" markerEnd="url(#arrow)" />
          <line x1="425" y1="120" x2="466" y2="120" stroke="#475569" strokeWidth="1.5" markerEnd="url(#arrow)" />
          <line x1="650" y1="120" x2="688" y2="120" stroke="#475569" strokeWidth="1.5" markerEnd="url(#arrow)" />
        </svg>
      </div>
    </div>
  );
}
