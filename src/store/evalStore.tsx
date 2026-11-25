import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  DEFAULT_SETTINGS,
  SEED_AGENTS,
  SEED_AUDIT_LOGS,
  SEED_DATASETS,
  SEED_MODELS,
  SEED_RUNS,
} from '../data/seedData';
import type {
  AgentConfig,
  AuditLogEntry,
  BenchmarkDataset,
  EvaluationRun,
  ModelConfig,
  PlatformSettings,
  ProviderStatusInfo,
} from '../shared/types';
import { computeWeightedScore } from '../shared/scoring';

const STORAGE_KEY = 'evalforge_ai_state_v1';

interface EvalState {
  models: ModelConfig[];
  agents: AgentConfig[];
  datasets: BenchmarkDataset[];
  runs: EvaluationRun[];
  settings: PlatformSettings;
  auditLogs: AuditLogEntry[];
}

interface EvalContextValue extends EvalState {
  providerStatus: ProviderStatusInfo | null;
  refreshProviderStatus: () => Promise<void>;
  addModel: (model: ModelConfig) => void;
  updateModel: (model: ModelConfig) => void;
  deleteModel: (id: string) => void;
  addAgent: (agent: AgentConfig) => void;
  updateAgent: (agent: AgentConfig) => void;
  deleteAgent: (id: string) => void;
  addDataset: (dataset: BenchmarkDataset) => void;
  updateDataset: (dataset: BenchmarkDataset) => void;
  deleteDataset: (id: string) => void;
  addRun: (run: EvaluationRun) => void;
  overrideTraceJudgeScore: (
    runId: string,
    traceId: string,
    score: number,
    note: string
  ) => void;
  updateSettings: (partial: Partial<PlatformSettings>) => void;
  logAudit: (action: string, target: string, details: string) => void;
  resetDemoData: () => void;
}

const EvalContext = createContext<EvalContextValue | null>(null);

function loadInitialState(): EvalState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<EvalState>;
      if (parsed.models && parsed.agents && parsed.datasets && parsed.runs) {
        return {
          models: parsed.models,
          agents: parsed.agents,
          datasets: parsed.datasets,
          runs: parsed.runs,
          settings: { ...DEFAULT_SETTINGS, ...(parsed.settings ?? {}) },
          auditLogs: parsed.auditLogs ?? SEED_AUDIT_LOGS,
        };
      }
    }
  } catch {
    // Fallback to seed state if storage corrupted
  }
  return {
    models: SEED_MODELS,
    agents: SEED_AGENTS,
    datasets: SEED_DATASETS,
    runs: SEED_RUNS,
    settings: DEFAULT_SETTINGS,
    auditLogs: SEED_AUDIT_LOGS,
  };
}

export function EvalProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<EvalState>(loadInitialState);
  const [providerStatus, setProviderStatus] = useState<ProviderStatusInfo | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Ignore storage quota errors
    }
  }, [state]);

  const refreshProviderStatus = async () => {
    try {
      const res = await fetch('/api/providers/status');
      if (res.ok) {
        const data = (await res.json()) as ProviderStatusInfo;
        setProviderStatus(data);
      }
    } catch {
      // Silent network retry tolerance
    }
  };

  useEffect(() => {
    refreshProviderStatus();
  }, []);

  const appendAudit = (
    prev: EvalState,
    action: string,
    target: string,
    details: string
  ): AuditLogEntry[] => [
    {
      id: `aud_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`,
      timestamp: new Date().toISOString(),
      actorRole: prev.settings.activeRole,
      action,
      target,
      details,
      environment: prev.settings.environment,
    },
    ...prev.auditLogs.slice(0, 99),
  ];

  const addModel = (model: ModelConfig) => {
    setState((prev) => ({
      ...prev,
      models: [model, ...prev.models],
      auditLogs: appendAudit(prev, 'MODEL_REGISTERED', model.name, `${model.provider} · ${model.modelId}`),
    }));
  };

  const updateModel = (model: ModelConfig) => {
    setState((prev) => ({
      ...prev,
      models: prev.models.map((m) => (m.id === model.id ? model : m)),
      auditLogs: appendAudit(prev, 'MODEL_UPDATED', model.name, `Updated version ${model.version}`),
    }));
  };

  const deleteModel = (id: string) => {
    setState((prev) => {
      const target = prev.models.find((m) => m.id === id);
      return {
        ...prev,
        models: prev.models.filter((m) => m.id !== id),
        auditLogs: appendAudit(prev, 'MODEL_REMOVED', target?.name ?? id, 'Deleted model configuration'),
      };
    });
  };

  const addAgent = (agent: AgentConfig) => {
    setState((prev) => ({
      ...prev,
      agents: [agent, ...prev.agents],
      auditLogs: appendAudit(prev, 'AGENT_REGISTERED', agent.name, `${agent.framework} · ${agent.planningStrategy}`),
    }));
  };

  const updateAgent = (agent: AgentConfig) => {
    setState((prev) => ({
      ...prev,
      agents: prev.agents.map((a) => (a.id === agent.id ? agent : a)),
      auditLogs: appendAudit(prev, 'AGENT_UPDATED', agent.name, `Updated ${agent.framework} configuration`),
    }));
  };

  const deleteAgent = (id: string) => {
    setState((prev) => {
      const target = prev.agents.find((a) => a.id === id);
      return {
        ...prev,
        agents: prev.agents.filter((a) => a.id !== id),
        auditLogs: appendAudit(prev, 'AGENT_REMOVED', target?.name ?? id, 'Deleted agent configuration'),
      };
    });
  };

  const addDataset = (dataset: BenchmarkDataset) => {
    setState((prev) => ({
      ...prev,
      datasets: [dataset, ...prev.datasets],
      auditLogs: appendAudit(prev, 'DATASET_CREATED', dataset.name, `${dataset.testCases.length} test cases (${dataset.version})`),
    }));
  };

  const updateDataset = (dataset: BenchmarkDataset) => {
    setState((prev) => ({
      ...prev,
      datasets: prev.datasets.map((d) => (d.id === dataset.id ? dataset : d)),
      auditLogs: appendAudit(prev, 'DATASET_UPDATED', dataset.name, `${dataset.testCases.length} test cases (${dataset.version})`),
    }));
  };

  const deleteDataset = (id: string) => {
    setState((prev) => {
      const target = prev.datasets.find((d) => d.id === id);
      return {
        ...prev,
        datasets: prev.datasets.filter((d) => d.id !== id),
        auditLogs: appendAudit(prev, 'DATASET_DELETED', target?.name ?? id, 'Removed dataset'),
      };
    });
  };

  const addRun = (run: EvaluationRun) => {
    setState((prev) => ({
      ...prev,
      runs: [run, ...prev.runs],
      auditLogs: appendAudit(
        prev,
        'EVALUATION_EXECUTED',
        run.name,
        `${run.track.toUpperCase()} · ${run.executionOrigin.toUpperCase()} · ${run.traces.length} traces`
      ),
    }));
  };

  const overrideTraceJudgeScore = (
    runId: string,
    traceId: string,
    score: number,
    note: string
  ) => {
    setState((prev) => {
      const runs = prev.runs.map((run) => {
        if (run.id !== runId) return run;
        const traces = run.traces.map((tr) => {
          if (tr.id !== traceId || !tr.judgeEvaluation) return tr;
          const updatedDims = { ...tr.dimensionScores };
          if (run.track === 'llm') {
            updatedDims.accuracy = score;
          } else {
            updatedDims.taskCompletion = score;
          }
          return {
            ...tr,
            dimensionScores: updatedDims,
            judgeEvaluation: {
              ...tr.judgeEvaluation,
              humanOverrideScore: score,
              humanOverrideNote: note,
            },
          };
        });

        // Recalculate summary scores for affected target
        const affectedTrace = traces.find((t) => t.id === traceId);
        const results = run.results.map((res) => {
          if (!affectedTrace || res.targetId !== affectedTrace.targetId) return res;
          const tTraces = traces.filter((t) => t.targetId === res.targetId);
          const newDims = { ...res.dimensionScores };
          if (run.track === 'llm') {
            const vals = tTraces
              .map((t) => t.dimensionScores.accuracy)
              .filter((v): v is number => typeof v === 'number');
            if (vals.length) {
              newDims.accuracy = Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10;
            }
          } else {
            const vals = tTraces
              .map((t) => t.dimensionScores.taskCompletion)
              .filter((v): v is number => typeof v === 'number');
            if (vals.length) {
              newDims.taskCompletion =
                Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10;
            }
          }
          const overallScore = computeWeightedScore(newDims, run.weightsSnapshot);
          return {
            ...res,
            dimensionScores: newDims,
            overallScore,
          };
        });

        return { ...run, traces, results };
      });

      return {
        ...prev,
        runs,
        auditLogs: appendAudit(
          prev,
          'HUMAN_SCORE_OVERRIDE',
          traceId,
          `Reviewer overrode score to ${score}: ${note}`
        ),
      };
    });
  };

  const updateSettings = (partial: Partial<PlatformSettings>) => {
    setState((prev) => ({
      ...prev,
      settings: { ...prev.settings, ...partial },
      auditLogs: appendAudit(prev, 'SETTINGS_UPDATED', 'Platform Governance', Object.keys(partial).join(', ')),
    }));
  };

  const logAudit = (action: string, target: string, details: string) => {
    setState((prev) => ({
      ...prev,
      auditLogs: appendAudit(prev, action, target, details),
    }));
  };

  const resetDemoData = () => {
    localStorage.removeItem(STORAGE_KEY);
    setState({
      models: SEED_MODELS,
      agents: SEED_AGENTS,
      datasets: SEED_DATASETS,
      runs: SEED_RUNS,
      settings: DEFAULT_SETTINGS,
      auditLogs: SEED_AUDIT_LOGS,
    });
  };

  return (
    <EvalContext.Provider
      value={{
        ...state,
        providerStatus,
        refreshProviderStatus,
        addModel,
        updateModel,
        deleteModel,
        addAgent,
        updateAgent,
        deleteAgent,
        addDataset,
        updateDataset,
        deleteDataset,
        addRun,
        overrideTraceJudgeScore,
        updateSettings,
        logAudit,
        resetDemoData,
      }}
    >
      {children}
    </EvalContext.Provider>
  );
}

export function useEvalStore() {
  const ctx = useContext(EvalContext);
  if (!ctx) throw new Error('useEvalStore must be used inside EvalProvider');
  return ctx;
}
