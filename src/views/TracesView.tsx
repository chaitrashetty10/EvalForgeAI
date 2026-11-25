import React, { useMemo, useState } from 'react';
import { Download, AlertTriangle, CheckCircle2, ArrowRight } from 'lucide-react';
import { OriginLabel, ScoreDisplay, SectionHeader } from '../components/OriginText';
import { maskPiiText } from '../shared/scoring';
import { useEvalStore } from '../store/evalStore';

export function TracesView({ initialRunId }: { initialRunId?: string }) {
  const { runs, settings, overrideTraceJudgeScore } = useEvalStore();

  const [selectedRunId, setSelectedRunId] = useState<string>(
    initialRunId || runs[0]?.id || ''
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [outcomeFilter, setOutcomeFilter] = useState<string>('all');
  const [maskPii, setMaskPii] = useState<boolean>(settings.maskPiiInTraces);

  const activeRun = runs.find((r) => r.id === selectedRunId) ?? runs[0];

  const filteredTraces = useMemo(() => {
    const list = activeRun?.traces ?? [];
    return list.filter((tr) => {
      if (outcomeFilter !== 'all' && tr.outcome !== outcomeFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          tr.targetName.toLowerCase().includes(q) ||
          tr.testCasePrompt.toLowerCase().includes(q) ||
          tr.finalResponse.toLowerCase().includes(q) ||
          tr.id.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [activeRun, outcomeFilter, searchQuery]);

  const [selectedTraceId, setSelectedTraceId] = useState<string>(
    filteredTraces[0]?.id ?? ''
  );

  const activeTrace =
    filteredTraces.find((t) => t.id === selectedTraceId) ?? filteredTraces[0];

  const [overrideScore, setOverrideScore] = useState<string>('');
  const [overrideNote, setOverrideNote] = useState<string>('');
  const [overrideSaved, setOverrideSaved] = useState(false);

  const formatText = (txt: string) => (maskPii ? maskPiiText(txt) : txt);

  const handleExportTrace = () => {
    if (!activeTrace) return;
    const blob = new Blob([JSON.stringify(activeTrace, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${activeTrace.id}_trace.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleApplyOverride = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeRun || !activeTrace) return;
    const num = Number(overrideScore);
    if (!Number.isFinite(num) || num < 0 || num > 100) return;
    overrideTraceJudgeScore(
      activeRun.id,
      activeTrace.id,
      Math.round(num),
      overrideNote.trim() || 'Human reviewer adjustment'
    );
    setOverrideScore('');
    setOverrideNote('');
    setOverrideSaved(true);
    setTimeout(() => setOverrideSaved(false), 2500);
  };

  const bottleneckStepIndex = useMemo(() => {
    if (!activeTrace || activeTrace.steps.length === 0) return -1;
    let maxLat = -1;
    let maxIdx = -1;
    for (const s of activeTrace.steps) {
      if (s.latencyMs > maxLat) {
        maxLat = s.latencyMs;
        maxIdx = s.stepIndex;
      }
    }
    return maxIdx;
  }, [activeTrace]);

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Observability & Execution Trace Viewer"
        subtitle="Inspect end-to-end prompts, agent planning timelines, sandboxed tool calls, deterministic checks, judge evidence, and latency bottlenecks."
        actions={
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={maskPii}
                onChange={(e) => setMaskPii(e.target.checked)}
                className="rounded border-slate-700 bg-slate-900 text-sky-500"
              />
              PII Masking
            </label>
            {activeTrace && (
              <button
                onClick={handleExportTrace}
                className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-md border border-slate-700 hover:border-slate-600 text-slate-200 cursor-pointer whitespace-nowrap"
              >
                <Download className="w-3.5 h-3.5" />
                Export JSON Trace
              </button>
            )}
          </div>
        }
      />

      {/* Search & Run Filter Bar */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <select
          aria-label="Select evaluation run"
          value={activeRun?.id ?? ''}
          onChange={(e) => {
            setSelectedRunId(e.target.value);
            const next = runs.find((r) => r.id === e.target.value);
            setSelectedTraceId(next?.traces[0]?.id ?? '');
          }}
          className="bg-slate-900 border border-slate-800 rounded-md px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-sky-500"
        >
          {runs.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name} ({r.traces.length} traces)
            </option>
          ))}
        </select>

        <input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search prompt, model/agent name, response, or trace ID..."
          className="bg-slate-900 border border-slate-800 rounded-md px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-sky-500"
        />

        <select
          aria-label="Filter by trace outcome"
          value={outcomeFilter}
          onChange={(e) => setOutcomeFilter(e.target.value)}
          className="bg-slate-900 border border-slate-800 rounded-md px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-sky-500"
        >
          <option value="all">All Outcomes</option>
          <option value="success">Success Only</option>
          <option value="partial">Partial Only</option>
          <option value="failed">Failed Only</option>
          <option value="safety_blocked">Safety Blocked Only</option>
        </select>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Trace List */}
        <div className="lg:col-span-4 space-y-2.5 max-h-[760px] overflow-y-auto pr-1">
          {filteredTraces.length === 0 ? (
            <div className="p-6 text-center text-xs text-slate-500 border border-slate-800 rounded-lg">
              No execution traces match your current filter.
            </div>
          ) : (
            filteredTraces.map((tr) => {
              const selected = tr.id === activeTrace?.id;
              const outcomeColor =
                tr.outcome === 'success'
                  ? 'text-emerald-400'
                  : tr.outcome === 'safety_blocked'
                    ? 'text-rose-400'
                    : tr.outcome === 'failed'
                      ? 'text-rose-400'
                      : 'text-amber-400';
              return (
                <div
                  key={tr.id}
                  onClick={() => setSelectedTraceId(tr.id)}
                  className={`p-3.5 rounded-lg border cursor-pointer transition-colors ${
                    selected
                      ? 'bg-slate-900 border-sky-500/70'
                      : 'bg-slate-900/40 border-slate-800/80 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="font-semibold text-slate-100 truncate">
                      {tr.targetName}
                    </span>
                    <span className={`font-medium shrink-0 ${outcomeColor}`}>
                      {tr.outcome.replace('_', ' ')}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-400 mt-1 line-clamp-2">
                    {formatText(tr.testCasePrompt)}
                  </div>
                  <div className="mt-2 flex items-center justify-between text-[11px] font-mono text-slate-500 tabular-nums">
                    <span>
                      {tr.totalLatencyMs}ms · {tr.totalTokens} tok
                    </span>
                    <OriginLabel origin={tr.executionOrigin} />
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Trace Inspector */}
        <div className="lg:col-span-8 bg-slate-900/40 border border-slate-800/80 rounded-lg p-5 space-y-6">
          {activeTrace ? (
            <>
              {/* Header & Telemetry */}
              <div className="border-b border-slate-800/80 pb-4 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h2 className="text-base font-semibold text-slate-100">
                      {activeTrace.targetName}
                    </h2>
                    <div className="text-xs text-slate-400 font-mono">
                      {activeTrace.id} · {activeTrace.modelVersion} ·{' '}
                      {new Date(activeTrace.timestamp).toLocaleString()}
                    </div>
                  </div>
                  <OriginLabel origin={activeTrace.executionOrigin} />
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 pt-2 text-xs">
                  <div>
                    <div className="text-slate-500">Total Latency</div>
                    <div className="font-mono tabular-nums text-slate-100">
                      {activeTrace.totalLatencyMs} ms
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-500">TTFT</div>
                    <div className="font-mono tabular-nums text-slate-100">
                      {activeTrace.ttftMs} ms
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-500">Tokens (In / Out)</div>
                    <div className="font-mono tabular-nums text-slate-100">
                      {activeTrace.inputTokens} / {activeTrace.outputTokens}
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-500">Throughput</div>
                    <div className="font-mono tabular-nums text-slate-100">
                      {activeTrace.tokensPerSec} tok/s
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-500">Est. Cost / Retries</div>
                    <div className="font-mono tabular-nums text-slate-100">
                      ${activeTrace.estimatedCostUsd.toFixed(5)} · {activeTrace.retries}r
                    </div>
                  </div>
                </div>
              </div>

              {activeTrace.safetyViolations.length > 0 && (
                <div className="p-3.5 bg-rose-950/40 border border-rose-800/70 rounded-md text-xs text-rose-200 space-y-1">
                  <div className="font-semibold flex items-center gap-2 text-rose-300">
                    <AlertTriangle className="w-4 h-4" />
                    Safety Gate Violation Recorded
                  </div>
                  {activeTrace.safetyViolations.map((v, i) => (
                    <div key={i}>· {v}</div>
                  ))}
                </div>
              )}

              {/* Visual Execution Timeline */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                    Execution Timeline
                  </h3>
                  <span className="text-[11px] text-slate-500">
                    User Request <ArrowRight className="inline w-3 h-3" /> Planning{' '}
                    <ArrowRight className="inline w-3 h-3" /> Tool Calls{' '}
                    <ArrowRight className="inline w-3 h-3" /> Final Response
                  </span>
                </div>

                <div className="space-y-2.5">
                  {activeTrace.steps.map((step) => {
                    const isBottleneck =
                      step.stepIndex === bottleneckStepIndex &&
                      activeTrace.steps.length > 2;
                    const borderColor =
                      step.status === 'error' || step.status === 'blocked'
                        ? 'border-rose-700/70 bg-rose-950/20'
                        : step.status === 'warning'
                          ? 'border-amber-700/60 bg-amber-950/15'
                          : 'border-slate-800 bg-slate-950/60';
                    return (
                      <div
                        key={step.stepIndex}
                        className={`p-3.5 rounded-md border ${borderColor}`}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-slate-500">
                              #{step.stepIndex}
                            </span>
                            <span className="font-semibold text-sky-300">
                              {step.phase}
                            </span>
                            <span className="text-slate-300">· {step.title}</span>
                          </div>
                          <div className="flex items-center gap-3 font-mono tabular-nums text-[11px]">
                            {isBottleneck && (
                              <span className="text-amber-400 font-sans font-medium">
                                Latency Bottleneck
                              </span>
                            )}
                            <span className="text-slate-400">{step.latencyMs}ms</span>
                            {step.tokensUsed > 0 && (
                              <span className="text-slate-500">
                                {step.tokensUsed} tok
                              </span>
                            )}
                          </div>
                        </div>
                        <pre className="mt-2 text-xs text-slate-300 whitespace-pre-wrap font-mono leading-relaxed break-words">
                          {formatText(step.content)}
                        </pre>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Deterministic Checks */}
              {activeTrace.deterministicChecks.length > 0 && (
                <div className="space-y-2.5 border-t border-slate-800/80 pt-4">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                    Deterministic Verification Checks
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                    {activeTrace.deterministicChecks.map((chk, idx) => (
                      <div
                        key={idx}
                        className="p-3 rounded-md bg-slate-950/60 border border-slate-800/80 text-xs"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium text-slate-200 flex items-center gap-1.5">
                            {chk.passed ? (
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                            ) : (
                              <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
                            )}
                            {chk.name}
                          </span>
                          <ScoreDisplay value={chk.score} decimals={0} />
                        </div>
                        <p className="mt-1 text-[11px] text-slate-400">{chk.details}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* LLM-as-a-Judge Evidence & Human Override */}
              {activeTrace.judgeEvaluation && (
                <div className="space-y-3 border-t border-slate-800/80 pt-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                      Blind Judge Evaluation & Evidence
                    </h3>
                    <span className="text-[11px] font-mono text-slate-500">
                      {activeTrace.judgeEvaluation.judgeModel} ·{' '}
                      {activeTrace.judgeEvaluation.judgeVersion} ·{' '}
                      {activeTrace.judgeEvaluation.positionOrder}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs bg-slate-950/60 border border-slate-800/80 p-3 rounded-md">
                    <div>
                      <div className="text-slate-500">Factual</div>
                      <ScoreDisplay
                        value={activeTrace.judgeEvaluation.factualCorrectnessScore}
                        decimals={0}
                      />
                    </div>
                    <div>
                      <div className="text-slate-500">Writing Quality</div>
                      <ScoreDisplay
                        value={activeTrace.judgeEvaluation.writingQualityScore}
                        decimals={0}
                      />
                    </div>
                    <div>
                      <div className="text-slate-500">Relevance</div>
                      <ScoreDisplay
                        value={activeTrace.judgeEvaluation.relevanceScore}
                        decimals={0}
                      />
                    </div>
                    <div>
                      <div className="text-slate-500">Groundedness</div>
                      <ScoreDisplay
                        value={activeTrace.judgeEvaluation.groundednessScore}
                        decimals={0}
                      />
                    </div>
                    <div>
                      <div className="text-slate-500">Agreement</div>
                      <span className="font-mono tabular-nums text-slate-200">
                        {activeTrace.judgeEvaluation.judgeAgreement !== null
                          ? `${Math.round(activeTrace.judgeEvaluation.judgeAgreement * 100)}%`
                          : 'N/A'}
                      </span>
                    </div>
                  </div>

                  <div className="text-xs text-slate-300 space-y-1">
                    <div className="text-slate-400 font-medium">Judge Rationale & Evidence:</div>
                    <p>{activeTrace.judgeEvaluation.rationale}</p>
                    {activeTrace.judgeEvaluation.evidence.map((ev, i) => (
                      <div
                        key={i}
                        className="text-[11px] font-mono text-slate-400 pl-2 border-l border-slate-700"
                      >
                        {formatText(ev)}
                      </div>
                    ))}
                    {activeTrace.judgeEvaluation.humanOverrideScore !== null && (
                      <div className="text-xs text-sky-300 pt-1">
                        Human Reviewer Override:{' '}
                        <strong className="font-mono">
                          {activeTrace.judgeEvaluation.humanOverrideScore}/100
                        </strong>{' '}
                        ({activeTrace.judgeEvaluation.humanOverrideNote})
                      </div>
                    )}
                  </div>

                  {/* Human Review Score Override Form */}
                  <form
                    onSubmit={handleApplyOverride}
                    className="flex flex-wrap items-center gap-2.5 pt-2"
                  >
                    <input
                      type="number"
                      min={0}
                      max={100}
                      placeholder="Override (0-100)"
                      value={overrideScore}
                      onChange={(e) => setOverrideScore(e.target.value)}
                      className="w-32 bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-xs font-mono text-slate-100 focus:outline-none focus:border-sky-500"
                    />
                    <input
                      placeholder="Reviewer justification note..."
                      value={overrideNote}
                      onChange={(e) => setOverrideNote(e.target.value)}
                      className="flex-1 min-w-[200px] bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-sky-500"
                    />
                    <button
                      type="submit"
                      className="px-3 py-1.5 text-xs font-medium rounded bg-slate-800 hover:bg-slate-700 text-sky-300 cursor-pointer"
                    >
                      Apply Human Override
                    </button>
                    {overrideSaved && (
                      <span className="text-xs text-emerald-400">Saved</span>
                    )}
                  </form>
                </div>
              )}
            </>
          ) : (
            <div className="py-12 text-center text-sm text-slate-500">
              Select a trace from the list to inspect execution steps and tool telemetry.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
