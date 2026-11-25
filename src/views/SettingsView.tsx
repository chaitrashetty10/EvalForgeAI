import React, { useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { SectionHeader } from '../components/OriginText';
import {
  AGENT_DIMENSION_LABELS,
  DEFAULT_AGENT_WEIGHTS,
  DEFAULT_LLM_WEIGHTS,
  LLM_DIMENSION_LABELS,
  sumWeights,
} from '../shared/scoring';
import type { AgentWeights, LLMWeights, UserRole } from '../shared/types';
import { useEvalStore } from '../store/evalStore';

export function SettingsView() {
  const { settings, updateSettings, auditLogs, resetDemoData } = useEvalStore();
  const [llmWeights, setLlmWeights] = useState<LLMWeights>(settings.llmWeights);
  const [agentWeights, setAgentWeights] = useState<AgentWeights>(
    settings.agentWeights
  );
  const [savedNotice, setSavedNotice] = useState<string | null>(null);

  const llmSum = sumWeights(llmWeights);
  const agentSum = sumWeights(agentWeights);

  const handleSaveWeights = () => {
    if (llmSum !== 100 || agentSum !== 100) return;
    updateSettings({ llmWeights, agentWeights });
    setSavedNotice('Scoring weights updated and verified at 100%.');
    setTimeout(() => setSavedNotice(null), 2500);
  };

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Scoring Governance, Safety Gates & Audit Settings"
        subtitle="Configure weighted evaluation rubrics (enforced 100% sum), critical safety gates, judge models, RBAC role simulation, and PII retention policies."
        actions={
          <button
            onClick={() => {
              resetDemoData();
              setLlmWeights(DEFAULT_LLM_WEIGHTS);
              setAgentWeights(DEFAULT_AGENT_WEIGHTS);
              setSavedNotice('Demo state restored to clean baseline.');
              setTimeout(() => setSavedNotice(null), 2500);
            }}
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-md border border-slate-700 hover:border-slate-600 text-slate-300 cursor-pointer whitespace-nowrap"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset Demo Data
          </button>
        }
      />

      {savedNotice && (
        <div className="p-3 bg-emerald-950/30 border border-emerald-800/60 rounded-md text-xs text-emerald-300">
          {savedNotice}
        </div>
      )}

      {/* Weighted Scoring Configuration */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="p-5 bg-slate-900/40 border border-slate-800/80 rounded-lg space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div>
              <h2 className="text-sm font-semibold text-slate-100">
                LLM Track Weights
              </h2>
              <p className="text-xs text-slate-400">
                Must total exactly 100%
              </p>
            </div>
            <span
              className={`font-mono tabular-nums text-xs font-semibold ${
                llmSum === 100 ? 'text-emerald-400' : 'text-rose-400'
              }`}
            >
              Total: {llmSum}%
            </span>
          </div>

          <div className="space-y-2.5">
            {(Object.keys(LLM_DIMENSION_LABELS) as Array<keyof LLMWeights>).map(
              (key) => (
                <div
                  key={key}
                  className="flex items-center justify-between gap-4 text-xs"
                >
                  <label className="text-slate-300">
                    {LLM_DIMENSION_LABELS[key]}
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={llmWeights[key]}
                      onChange={(e) =>
                        setLlmWeights((prev) => ({
                          ...prev,
                          [key]: Math.max(0, Number(e.target.value) || 0),
                        }))
                      }
                      className="w-20 bg-slate-950 border border-slate-800 rounded px-2.5 py-1 text-right font-mono tabular-nums text-slate-100"
                    />
                    <span className="text-slate-500">%</span>
                  </div>
                </div>
              )
            )}
          </div>
        </div>

        <div className="p-5 bg-slate-900/40 border border-slate-800/80 rounded-lg space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div>
              <h2 className="text-sm font-semibold text-slate-100">
                AI Agent Track Weights
              </h2>
              <p className="text-xs text-slate-400">
                Must total exactly 100%
              </p>
            </div>
            <span
              className={`font-mono tabular-nums text-xs font-semibold ${
                agentSum === 100 ? 'text-emerald-400' : 'text-rose-400'
              }`}
            >
              Total: {agentSum}%
            </span>
          </div>

          <div className="space-y-2.5">
            {(
              Object.keys(AGENT_DIMENSION_LABELS) as Array<keyof AgentWeights>
            ).map((key) => (
              <div
                key={key}
                className="flex items-center justify-between gap-4 text-xs"
              >
                <label className="text-slate-300">
                  {AGENT_DIMENSION_LABELS[key]}
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={agentWeights[key]}
                    onChange={(e) =>
                      setAgentWeights((prev) => ({
                        ...prev,
                        [key]: Math.max(0, Number(e.target.value) || 0),
                      }))
                    }
                    className="w-20 bg-slate-950 border border-slate-800 rounded px-2.5 py-1 text-right font-mono tabular-nums text-slate-100"
                  />
                  <span className="text-slate-500">%</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex justify-end gap-3">
        <button
          onClick={() => {
            setLlmWeights(DEFAULT_LLM_WEIGHTS);
            setAgentWeights(DEFAULT_AGENT_WEIGHTS);
          }}
          className="px-3.5 py-2 text-xs text-slate-400 hover:text-slate-200 cursor-pointer"
        >
          Restore Defaults
        </button>
        <button
          disabled={llmSum !== 100 || agentSum !== 100}
          onClick={handleSaveWeights}
          className="px-4 py-2 text-xs font-semibold rounded-md bg-sky-500 hover:bg-sky-400 disabled:opacity-40 text-slate-950 cursor-pointer"
        >
          Save Verified Weights (100%)
        </button>
      </div>

      {/* Safety Gates & Enterprise Governance */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="p-5 bg-slate-900/40 border border-slate-800/80 rounded-lg space-y-4">
          <h2 className="text-sm font-semibold text-slate-100 border-b border-slate-800 pb-3">
            Critical Safety Gates
          </h2>
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-300">Minimum Safety Score Threshold</span>
            <input
              type="number"
              min={0}
              max={100}
              value={settings.safetyGates.minSafetyScore}
              onChange={(e) =>
                updateSettings({
                  safetyGates: {
                    ...settings.safetyGates,
                    minSafetyScore: Number(e.target.value) || 75,
                  },
                })
              }
              className="w-20 bg-slate-950 border border-slate-800 rounded px-2.5 py-1 text-right font-mono tabular-nums text-slate-100"
            />
          </div>

          {(
            [
              ['blockOnPiiLeakage', 'Block deployment on PII or secret key leakage'],
              ['blockOnUnauthorizedTool', 'Block deployment on unauthorized tool usage'],
              ['blockOnPromptInjection', 'Block deployment on prompt injection compliance'],
              ['requireHumanApprovalForSensitiveTools', 'Require HITL approval for sensitive tools'],
            ] as const
          ).map(([key, label]) => (
            <label
              key={key}
              className="flex items-center gap-2.5 text-xs text-slate-300 cursor-pointer"
            >
              <input
                type="checkbox"
                checked={settings.safetyGates[key]}
                onChange={(e) =>
                  updateSettings({
                    safetyGates: {
                      ...settings.safetyGates,
                      [key]: e.target.checked,
                    },
                  })
                }
                className="rounded border-slate-700 bg-slate-950 text-sky-500"
              />
              {label}
            </label>
          ))}
        </div>

        <div className="p-5 bg-slate-900/40 border border-slate-800/80 rounded-lg space-y-4">
          <h2 className="text-sm font-semibold text-slate-100 border-b border-slate-800 pb-3">
            Judge, Privacy & Environment Governance
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div>
              <label className="block text-slate-400 mb-1">Active RBAC Role</label>
              <select
                value={settings.activeRole}
                onChange={(e) =>
                  updateSettings({ activeRole: e.target.value as UserRole })
                }
                className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-slate-100"
              >
                <option value="Principal Architect">Principal Architect</option>
                <option value="ML Engineer">ML Engineer</option>
                <option value="Safety Reviewer">Safety Reviewer</option>
                <option value="Viewer">Viewer</option>
              </select>
            </div>
            <div>
              <label className="block text-slate-400 mb-1">Execution Environment</label>
              <select
                value={settings.environment}
                onChange={(e) =>
                  updateSettings({
                    environment: e.target.value as 'sandbox' | 'staging',
                  })
                }
                className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-slate-100"
              >
                <option value="sandbox">Sandbox / Test</option>
                <option value="staging">Staging / Prod-Candidate</option>
              </select>
            </div>
            <div>
              <label className="block text-slate-400 mb-1">Judge Model (Free Tier)</label>
              <select
                value={settings.judgeModelId}
                onChange={(e) => updateSettings({ judgeModelId: e.target.value })}
                className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-slate-100"
              >
                <option value="gemini-4-hydrogen">gemini-4-hydrogen</option>
                <option value="gemini-3.1-flash-lite">gemini-3.1-flash-lite</option>
              </select>
            </div>
            <div>
              <label className="block text-slate-400 mb-1">Trace Retention (Days)</label>
              <input
                type="number"
                min={1}
                max={365}
                value={settings.retentionDays}
                onChange={(e) =>
                  updateSettings({ retentionDays: Number(e.target.value) || 30 })
                }
                className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 font-mono text-slate-100"
              />
            </div>
          </div>

          <div className="space-y-2 pt-1">
            <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={settings.enableLlmJudge}
                onChange={(e) =>
                  updateSettings({ enableLlmJudge: e.target.checked })
                }
                className="rounded border-slate-700 bg-slate-950 text-sky-500"
              />
              Enable blind LLM-as-a-Judge alongside deterministic checks
            </label>
            <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={settings.maskPiiInTraces}
                onChange={(e) =>
                  updateSettings({ maskPiiInTraces: e.target.checked })
                }
                className="rounded border-slate-700 bg-slate-950 text-sky-500"
              />
              Default PII & key redaction in execution traces
            </label>
          </div>
        </div>
      </div>

      {/* Audit Log */}
      <div className="bg-slate-900/40 border border-slate-800/80 rounded-lg overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-800/80">
          <h2 className="text-sm font-semibold text-slate-100">
            Governance Audit Trail
          </h2>
        </div>
        <div className="overflow-x-auto max-h-64">
          <table className="w-full text-left text-xs">
            <thead className="text-slate-400 border-b border-slate-800">
              <tr>
                <th className="py-2.5 px-4 font-medium">Timestamp</th>
                <th className="py-2.5 px-3 font-medium">Actor Role</th>
                <th className="py-2.5 px-3 font-medium">Action</th>
                <th className="py-2.5 px-3 font-medium">Target</th>
                <th className="py-2.5 px-4 font-medium">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {auditLogs.map((log) => (
                <tr key={log.id} className="hover:bg-slate-800/20">
                  <td className="py-2.5 px-4 font-mono tabular-nums text-slate-400">
                    {new Date(log.timestamp).toLocaleString()}
                  </td>
                  <td className="py-2.5 px-3 text-slate-300">{log.actorRole}</td>
                  <td className="py-2.5 px-3 font-mono text-sky-300">{log.action}</td>
                  <td className="py-2.5 px-3 text-slate-200">{log.target}</td>
                  <td className="py-2.5 px-4 text-slate-400">{log.details}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
