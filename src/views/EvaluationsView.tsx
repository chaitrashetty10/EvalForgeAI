import React, { useEffect, useRef, useState } from 'react';
import { Play, AlertTriangle, CheckCircle2, Square } from 'lucide-react';
import {
  OriginLabel,
  SafetyGateLabel,
  ScoreDisplay,
  SectionHeader,
} from '../components/OriginText';
import type { EvaluationRun, ExecutionTrace } from '../shared/types';
import { useEvalStore } from '../store/evalStore';

interface StreamProgress {
  completed: number;
  total: number;
  targetName: string;
  testCaseId: string;
  outcome: ExecutionTrace['outcome'];
  latencyMs: number;
  error: string | null;
}

export function EvaluationsView({
  preselect,
  onInspectTraces,
}: {
  preselect?: { track?: 'llm' | 'agent'; targetId?: string; datasetId?: string } | null;
  onInspectTraces: (runId: string) => void;
}) {
  const {
    models,
    agents,
    datasets,
    runs,
    settings,
    providerStatus,
    addRun,
    refreshProviderStatus,
  } = useEvalStore();

  const [track, setTrack] = useState<'llm' | 'agent'>(preselect?.track ?? 'llm');
  const [selectedTargets, setSelectedTargets] = useState<string[]>(() => {
    if (preselect?.targetId) return [preselect.targetId];
    return ['mod_gemini_hydrogen', 'mod_gemini_flash_lite'];
  });
  const [datasetId, setDatasetId] = useState<string>(
    preselect?.datasetId ?? datasets[0]?.id ?? ''
  );
  const [execMode, setExecMode] = useState<'auto' | 'live' | 'local' | 'simulated'>(
    providerStatus?.geminiConfigured || providerStatus?.groqConfigured ? 'live' : 'simulated'
  );
  const modeTouchedRef = useRef(false);
  const [useLlmJudge, setUseLlmJudge] = useState<boolean>(false);
  const [repeatCount, setRepeatCount] = useState<number>(1);
  const [runName, setRunName] = useState<string>('');
  const [baselineRunId, setBaselineRunId] = useState<string>('');
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState<StreamProgress | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [selectedRunId, setSelectedRunId] = useState<string>(runs[0]?.id ?? '');
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!modeTouchedRef.current && providerStatus) {
      setExecMode(
        providerStatus.geminiConfigured || providerStatus.groqConfigured ? 'live' : 'simulated'
      );
    }
  }, [providerStatus]);

  useEffect(() => {
    if (preselect?.track) {
      setTrack(preselect.track);
      if (preselect.targetId) {
        setSelectedTargets([preselect.targetId]);
      } else if (preselect.track === 'agent') {
        setSelectedTargets(agents.slice(0, 2).map((a) => a.id));
      } else {
        setSelectedTargets(models.slice(0, 2).map((m) => m.id));
      }
    }
    if (preselect?.datasetId) {
      setDatasetId(preselect.datasetId);
    }
  }, [preselect, agents, models]);

  const handleTrackSwitch = (nextTrack: 'llm' | 'agent') => {
    setTrack(nextTrack);
    if (nextTrack === 'llm') {
      const cloudReadyModels = models.filter(
        (m) =>
          m.provider === 'google-gemini' ||
          (m.provider === 'ollama' &&
            (providerStatus?.ollamaConfigured || providerStatus?.groqConfigured)) ||
          (m.provider === 'groq' && providerStatus?.groqConfigured)
      );
      setSelectedTargets(
        (cloudReadyModels.length > 0 ? cloudReadyModels : models)
          .slice(0, 2)
          .map((m) => m.id)
      );
      const llmDs = datasets.find((d) => d.targetTrack !== 'agent');
      if (llmDs) setDatasetId(llmDs.id);
    } else {
      setSelectedTargets(agents.slice(0, 2).map((a) => a.id));
      const agtDs = datasets.find((d) => d.targetTrack !== 'llm');
      if (agtDs) setDatasetId(agtDs.id);
    }
  };

  const toggleTarget = (id: string) => {
    setSelectedTargets((prev) =>
      prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]
    );
  };

  const extractResponseError = async (resp: Response, fallbackLabel: string) => {
    const raw = await resp.text().catch(() => '');
    try {
      const parsed = JSON.parse(raw) as { error?: string };
      if (parsed.error) return parsed.error;
    } catch {
      // Non-JSON response (e.g. HTML error page from edge/proxy)
    }
    const statusInfo = resp.status ? ` (HTTP ${resp.status})` : '';
    return `${fallbackLabel}${statusInfo}`;
  };

  const executeStreamRun = async (overrideMode?: 'simulated') => {
    setErrorMsg(null);
    const dataset = datasets.find((d) => d.id === datasetId);
    if (!dataset) {
      setErrorMsg('Please select a valid benchmark dataset.');
      return;
    }
    if (selectedTargets.length === 0) {
      setErrorMsg(`Select at least one ${track === 'llm' ? 'model' : 'agent'} to evaluate.`);
      return;
    }

    const modeToUse = overrideMode ?? execMode;
    if (overrideMode) {
      modeTouchedRef.current = true;
      setExecMode(overrideMode);
    }

    const requestBody = JSON.stringify({
      runName:
        runName.trim() ||
        `${track === 'llm' ? 'LLM' : 'Agent'} Eval — ${dataset.name}`,
      track,
      mode: modeToUse,
      environment: settings.environment,
      dataset,
      models,
      agents,
      targetIds: selectedTargets,
      repeatCount,
      weights: track === 'llm' ? settings.llmWeights : settings.agentWeights,
      safetyGates: settings.safetyGates,
      enableLlmJudge: modeToUse === 'simulated' ? settings.enableLlmJudge : useLlmJudge,
      judgeModelId: settings.judgeModelId,
      baselineRunId: baselineRunId || null,
    });

    const controller = new AbortController();
    abortRef.current = controller;
    setIsRunning(true);
    setProgress({
      completed: 0,
      total: selectedTargets.length * dataset.testCases.length * repeatCount,
      targetName: 'Initializing adapters...',
      testCaseId: '',
      outcome: 'success',
      latencyMs: 0,
      error: null,
    });

    try {
      let completedRun: EvaluationRun | null = null;
      let shouldFallbackSync = false;

      const response = await fetch('/api/evaluations/run-stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: requestBody,
      });

      if (!response.ok || !response.body) {
        if (response.status === 404 || response.status === 405) {
          shouldFallbackSync = true;
        } else {
          throw new Error(await extractResponseError(response, 'Evaluation request failed'));
        }
      } else {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          const frames = buffer.split('\n\n');
          buffer = frames.pop() ?? '';

          for (const frame of frames) {
            const eventMatch = frame.match(/^event:\s*(.+)$/m);
            const dataMatch = frame.match(/^data:\s*(.+)$/m);
            if (!eventMatch || !dataMatch) continue;

            const eventName = eventMatch[1].trim();
            const payload = JSON.parse(dataMatch[1]) as Record<string, unknown>;

            if (eventName === 'progress') {
              setProgress(payload as unknown as StreamProgress);
            } else if (eventName === 'complete') {
              completedRun = (payload as { run: EvaluationRun }).run;
            } else if (eventName === 'error') {
              throw new Error(String(payload.error || 'Evaluation stream error'));
            }
          }
        }

        if (!completedRun) {
          shouldFallbackSync = true;
        }
      }

      if (shouldFallbackSync) {
        const syncResp = await fetch('/api/evaluations/run', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: requestBody,
        });
        if (!syncResp.ok) {
          throw new Error(await extractResponseError(syncResp, 'Evaluation request failed'));
        }
        const syncData = (await syncResp.json()) as { run?: EvaluationRun };
        if (syncData.run) {
          completedRun = syncData.run;
        }
      }

      if (!completedRun) {
        throw new Error('Evaluation did not return any run results.');
      }

      addRun(completedRun);
      setSelectedRunId(completedRun.id);
      setRunName('');
      await refreshProviderStatus();
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        setErrorMsg('Evaluation run cancelled by user.');
      } else {
        setErrorMsg(err instanceof Error ? err.message : 'Unexpected evaluation error.');
      }
    } finally {
      setIsRunning(false);
      setProgress(null);
      abortRef.current = null;
    }
  };

  const handleRunEvaluation = (e: React.FormEvent) => {
    e.preventDefault();
    executeStreamRun();
  };

  const handleCancelRun = () => {
    abortRef.current?.abort();
  };

  const inspectedRun = runs.find((r) => r.id === selectedRunId) ?? runs[0];
  const baselineRun = inspectedRun?.baselineRunId
    ? runs.find((r) => r.id === inspectedRun.baselineRunId)
    : null;

  const failedTraces = inspectedRun?.traces.filter((t) => t.outcome === 'failed' && t.error) ?? [];
  const uniqueErrors = Array.from(new Set(failedTraces.map((t) => `${t.targetName}: ${t.error}`)));

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Evaluation Engine & Run History"
        subtitle="Execute reproducible single or multi-target evaluations against selected benchmark datasets, stream live execution traces, and inspect regression deltas."
      />

      {/* Launch Evaluation Form */}
      <form
        onSubmit={handleRunEvaluation}
        className="p-5 bg-slate-900/50 border border-slate-800/80 rounded-lg space-y-5"
      >
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800/80 pb-4">
          <div className="flex items-center gap-1 p-1 bg-slate-950 border border-slate-800 rounded-md">
            <button
              type="button"
              onClick={() => handleTrackSwitch('llm')}
              className={`px-3.5 py-1.5 text-xs font-medium rounded transition-colors cursor-pointer whitespace-nowrap ${
                track === 'llm'
                  ? 'bg-sky-500 text-slate-950 font-semibold'
                  : 'text-slate-400 hover:text-slate-100'
              }`}
            >
              LLM Evaluation Track
            </button>
            <button
              type="button"
              onClick={() => handleTrackSwitch('agent')}
              className={`px-3.5 py-1.5 text-xs font-medium rounded transition-colors cursor-pointer whitespace-nowrap ${
                track === 'agent'
                  ? 'bg-sky-500 text-slate-950 font-semibold'
                  : 'text-slate-400 hover:text-slate-100'
              }`}
            >
              AI Agent Track
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-4 text-xs">
            <div className="flex items-center gap-2">
              <span className="text-slate-400">Mode:</span>
              <select
                value={execMode}
                onChange={(e) => {
                  modeTouchedRef.current = true;
                  setExecMode(e.target.value as 'auto' | 'live' | 'local' | 'simulated');
                }}
                className="bg-slate-950 border border-slate-800 rounded-md px-3 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-sky-500"
              >
                <option value="live">
                  Live Free-Tier API ({providerStatus?.geminiConfigured ? 'Gemini Active' : 'Requires Key'})
                </option>
                <option value="simulated">
                  Simulation Mode (Instant, Zero API Quota)
                </option>
                <option value="local">
                  Local Self-Hosted (Ollama)
                </option>
                <option value="auto">Auto-Route by Adapter</option>
              </select>
            </div>

            {execMode !== 'simulated' && (
              <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={useLlmJudge}
                  onChange={(e) => setUseLlmJudge(e.target.checked)}
                  className="rounded border-slate-700 bg-slate-950 text-sky-500"
                />
                <span>Use Gemini LLM Judge (+1 API call/case)</span>
              </label>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="md:col-span-2">
            <label className="block text-xs text-slate-400 mb-1">
              Benchmark Dataset
            </label>
            <select
              value={datasetId}
              onChange={(e) => setDatasetId(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-md px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-sky-500"
            >
              {datasets.map((ds) => (
                <option key={ds.id} value={ds.id}>
                  {ds.name} ({ds.version} · {ds.testCases.length} cases · {ds.category})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs text-slate-400 mb-1">
              Repeat Trials (Statistical CI)
            </label>
            <select
              value={repeatCount}
              onChange={(e) => setRepeatCount(Number(e.target.value))}
              className="w-full bg-slate-950 border border-slate-800 rounded-md px-3 py-2 text-xs font-mono text-slate-100 focus:outline-none focus:border-sky-500"
            >
              <option value={1}>1x Pass (Fast)</option>
              <option value={2}>2x Repeated Runs</option>
              <option value={3}>3x Repeated Runs</option>
            </select>
          </div>

          <div>
            <label className="block text-xs text-slate-400 mb-1">
              Regression Baseline (Optional)
            </label>
            <select
              value={baselineRunId}
              onChange={(e) => setBaselineRunId(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-md px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-sky-500"
            >
              <option value="">None</option>
              {runs
                .filter((r) => r.track === track)
                .map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-xs text-slate-400 mb-2">
            Select {track === 'llm' ? 'Models' : 'AI Agents'} to Benchmark Together
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {(track === 'llm' ? models : agents).map((item) => {
              const checked = selectedTargets.includes(item.id);
              let sub =
                'provider' in item
                  ? `${item.provider} · ${item.modelId}`
                  : `${item.framework} · ${item.planningStrategy}`;
              if ('provider' in item && item.provider === 'ollama' && !providerStatus?.ollamaConfigured) {
                sub = providerStatus?.groqConfigured
                  ? `${item.modelId} · Groq cloud fallback`
                  : `${item.modelId} · Local/Groq unset`;
              }
              return (
                <label
                  key={item.id}
                  className={`flex items-start gap-2.5 p-3 rounded-md border cursor-pointer transition-colors ${
                    checked
                      ? 'bg-slate-900 border-sky-500/70'
                      : 'bg-slate-950/60 border-slate-800/80 hover:border-slate-700'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleTarget(item.id)}
                    className="mt-0.5 rounded border-slate-700 bg-slate-900 text-sky-500"
                  />
                  <div className="min-w-0">
                    <div className="text-xs font-medium text-slate-100 truncate">
                      {item.name}
                    </div>
                    <div className="text-[11px] text-slate-500 truncate">{sub}</div>
                  </div>
                </label>
              );
            })}
          </div>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-2 border-t border-slate-800/80">
          <div className="flex-1 max-w-md">
            <input
              value={runName}
              onChange={(e) => setRunName(e.target.value)}
              placeholder="Optional run label (e.g., Release Candidate v2.1 Eval)"
              className="w-full bg-slate-950 border border-slate-800 rounded-md px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-sky-500"
            />
          </div>
          <div className="flex items-center gap-2.5 shrink-0">
            {isRunning && (
              <button
                type="button"
                onClick={handleCancelRun}
                className="flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium rounded-md border border-rose-700/70 text-rose-300 hover:bg-rose-950/40 cursor-pointer whitespace-nowrap"
              >
                <Square className="w-3 h-3" />
                Cancel Run
              </button>
            )}
            <button
              type="submit"
              disabled={isRunning}
              className="flex items-center justify-center gap-2 px-5 py-2.5 text-xs font-semibold rounded-md bg-sky-500 hover:bg-sky-400 disabled:opacity-50 text-slate-950 transition-colors cursor-pointer whitespace-nowrap"
            >
              <Play className="w-3.5 h-3.5" />
              {isRunning
                ? `Running (${progress?.completed ?? 0}/${progress?.total ?? '?'})...`
                : `Run ${track === 'llm' ? 'Model' : 'Agent'} Evaluation`}
            </button>
          </div>
        </div>

        {/* Real-time Streaming Progress Bar */}
        {isRunning && progress && (
          <div className="p-3.5 bg-slate-950/70 border border-slate-800 rounded-md space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-200 font-medium">
                {progress.completed === 0
                  ? 'Dispatching evaluation tasks...'
                  : `Latest: ${progress.targetName} · ${progress.testCaseId} (${progress.outcome}, ${progress.latencyMs}ms)`}
              </span>
              <span className="font-mono tabular-nums text-sky-300">
                {progress.completed} / {progress.total} traces
              </span>
            </div>
            <div className="h-1.5 w-full bg-slate-800 rounded-sm overflow-hidden">
              <div
                className="h-full bg-sky-400 transition-all duration-200"
                style={{
                  width: `${Math.max(4, (progress.completed / Math.max(1, progress.total)) * 100)}%`,
                }}
              />
            </div>
            {progress.error && (
              <div className="text-[11px] text-amber-300">{progress.error}</div>
            )}
          </div>
        )}

        {errorMsg && (
          <div className="p-3 bg-rose-950/40 border border-rose-800/70 rounded-md text-xs text-rose-300 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
            <button
              type="button"
              onClick={() => executeStreamRun('simulated')}
              className="px-3 py-1.5 text-xs font-medium rounded bg-slate-800 hover:bg-slate-700 text-slate-100 shrink-0 cursor-pointer"
            >
              Run in Simulation Mode
            </button>
          </div>
        )}
      </form>

      {/* Run History & Selected Run Details */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-4 space-y-2.5">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Historical Evaluation Runs ({runs.length})
          </h2>
          {runs.map((run) => {
            const active = run.id === inspectedRun?.id;
            return (
              <div
                key={run.id}
                onClick={() => setSelectedRunId(run.id)}
                className={`p-4 rounded-lg border cursor-pointer transition-colors ${
                  active
                    ? 'bg-slate-900 border-sky-500/70'
                    : 'bg-slate-900/40 border-slate-800/80 hover:border-slate-700'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="text-xs font-semibold text-slate-100 leading-snug">
                    {run.name}
                  </div>
                  <OriginLabel origin={run.executionOrigin} />
                </div>
                <div className="mt-1.5 text-[11px] text-slate-400">
                  {run.track.toUpperCase()} Track · {run.datasetName} ({run.datasetVersion})
                </div>
                <div className="mt-1 text-[11px] font-mono text-slate-500 tabular-nums">
                  {new Date(run.completedAt).toLocaleString()} · {run.traces.length} traces ·{' '}
                  {run.repeatCount}x repeat
                </div>
              </div>
            );
          })}
        </div>

        <div className="lg:col-span-8 bg-slate-900/40 border border-slate-800/80 rounded-lg p-5 space-y-5">
          {inspectedRun ? (
            <>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800/80 pb-4">
                <div>
                  <div className="flex items-center gap-3">
                    <h2 className="text-base font-semibold text-slate-100">
                      {inspectedRun.name}
                    </h2>
                    <OriginLabel origin={inspectedRun.executionOrigin} />
                  </div>
                  <div className="text-xs text-slate-400 mt-1">
                    Run ID: <span className="font-mono">{inspectedRun.id}</span> · Dataset:{' '}
                    {inspectedRun.datasetName} ({inspectedRun.datasetVersion}) · Status:{' '}
                    <span className="text-slate-200">{inspectedRun.status}</span>
                  </div>
                </div>
                <button
                  onClick={() => onInspectTraces(inspectedRun.id)}
                  className="px-3.5 py-2 text-xs font-medium rounded-md border border-slate-700 hover:border-sky-500 text-sky-300 transition-colors cursor-pointer shrink-0"
                >
                  Open Execution Traces ({inspectedRun.traces.length})
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="text-slate-400 border-b border-slate-800/80">
                    <tr>
                      <th className="py-2.5 px-3 font-medium">Target</th>
                      <th className="py-2.5 px-3 font-medium text-right">Score</th>
                      <th className="py-2.5 px-3 font-medium text-right">95% CI / σ</th>
                      <th className="py-2.5 px-3 font-medium text-right">Success</th>
                      <th className="py-2.5 px-3 font-medium text-right">Latency</th>
                      <th className="py-2.5 px-3 font-medium text-right">Regression Δ</th>
                      <th className="py-2.5 px-3 font-medium text-right">Safety Gate</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {inspectedRun.results.map((res) => {
                      const baseMatch = baselineRun?.results.find(
                        (b) => b.targetId === res.targetId
                      );
                      const delta =
                        baseMatch &&
                        baseMatch.overallScore !== null &&
                        res.overallScore !== null
                          ? Math.round((res.overallScore - baseMatch.overallScore) * 10) / 10
                          : null;

                      return (
                        <tr key={res.targetId} className="hover:bg-slate-800/30">
                          <td className="py-3 px-3">
                            <div className="font-semibold text-slate-100">
                              {res.targetName}
                            </div>
                            <div className="text-[11px] text-slate-500">
                              {res.providerOrFramework} ·{' '}
                              <OriginLabel origin={res.executionOrigin} />
                            </div>
                          </td>
                          <td className="py-3 px-3 text-right">
                            <ScoreDisplay value={res.overallScore} />
                          </td>
                          <td className="py-3 px-3 text-right font-mono tabular-nums text-slate-300">
                            {res.stats.ci95Low !== null && res.stats.ci95High !== null
                              ? `[${res.stats.ci95Low}, ${res.stats.ci95High}]`
                              : 'n=1'}{' '}
                            <span className="text-slate-500">· σ={res.stats.stdDev}</span>
                          </td>
                          <td className="py-3 px-3 text-right font-mono tabular-nums text-slate-300">
                            {res.stats.successRate.toFixed(1)}%
                          </td>
                          <td className="py-3 px-3 text-right font-mono tabular-nums text-slate-300">
                            {res.avgLatencyMs > 0 ? `${Math.round(res.avgLatencyMs)}ms` : 'N/A'}
                          </td>
                          <td className="py-3 px-3 text-right font-mono tabular-nums">
                            {delta === null ? (
                              <span className="text-slate-500">—</span>
                            ) : (
                              <span
                                className={
                                  delta >= 0 ? 'text-emerald-400' : 'text-rose-400'
                                }
                              >
                                {delta >= 0 ? `+${delta}` : delta}
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-3 text-right">
                            <SafetyGateLabel
                              passed={res.safetyGatePassed}
                              deploymentReady={res.deploymentReady}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Upstream API / Quota Errors Banner (when any traces errored) */}
              {uniqueErrors.length > 0 && (
                <div className="p-4 bg-amber-950/30 border border-amber-800/60 rounded-md space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-xs font-semibold text-amber-300 flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 shrink-0" />
                      API Execution / Quota Notice ({failedTraces.length} trace(s) failed)
                    </div>
                    <button
                      type="button"
                      onClick={() => executeStreamRun('simulated')}
                      className="px-3 py-1 text-xs font-medium rounded bg-amber-500/20 hover:bg-amber-500/30 border border-amber-600/50 text-amber-200 cursor-pointer"
                    >
                      Re-run in Simulation Mode
                    </button>
                  </div>
                  <div className="space-y-1 text-xs text-amber-200/90">
                    {uniqueErrors.map((errText, i) => (
                      <div key={i}>· {errText}</div>
                    ))}
                  </div>
                </div>
              )}

              {/* Safety Gate Findings */}
              {inspectedRun.results.some((r) => !r.safetyGatePassed) ? (
                <div className="p-4 bg-rose-950/30 border border-rose-800/60 rounded-md space-y-2">
                  <div className="text-xs font-semibold text-rose-300 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4" />
                    Mandatory Safety Gate Violations Detected
                  </div>
                  {inspectedRun.results
                    .filter((r) => !r.safetyGatePassed)
                    .map((r) => (
                      <div key={r.targetId} className="text-xs text-rose-200/90">
                        <strong>{r.targetName}:</strong> {r.safetyGateReasons.join(' · ')}
                      </div>
                    ))}
                </div>
              ) : (
                uniqueErrors.length === 0 && (
                  <div className="p-3 bg-emerald-950/20 border border-emerald-800/50 rounded-md text-xs text-emerald-300 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    <span>
                      All evaluated candidates in this run satisfied configured safety & compliance gates.
                    </span>
                  </div>
                )
              )}
            </>
          ) : (
            <div className="py-12 text-center text-sm text-slate-500">
              No evaluation runs found. Launch your first evaluation above.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
