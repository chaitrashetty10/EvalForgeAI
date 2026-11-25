import React, { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { SectionHeader } from '../components/OriginText';
import type {
  AgentConfig,
  AgentFramework,
  AgentToolId,
} from '../shared/types';
import { useEvalStore } from '../store/evalStore';

const FRAMEWORKS: AgentFramework[] = [
  'LangGraph',
  'LangChain',
  'CrewAI',
  'AutoGen',
  'Semantic Kernel',
  'Custom Sandbox',
  'Workflow Engine',
];

const SANDBOX_TOOL_OPTIONS: Array<{
  id: AgentToolId;
  label: string;
  desc: string;
}> = [
  { id: 'knowledge_search', label: 'Knowledge Base Search', desc: 'Enterprise SLA & policy lookup' },
  { id: 'calculator', label: 'Safe Arithmetic Calculator', desc: 'Deterministic numeric evaluation' },
  { id: 'sql_query_sandbox', label: 'Sandboxed Order Lookup', desc: 'Read-only synthetic CRM & SLA records' },
  { id: 'ticket_api', label: 'Ticket & Refund API (Sensitive)', desc: 'Requires HITL approval for refunds >= $250' },
  { id: 'code_sandbox_check', label: 'Static Code & Schema Validator', desc: 'JSON & static safety checks' },
];

export function AgentsView({
  onRunAgentEval,
}: {
  onRunAgentEval: (agentId: string) => void;
}) {
  const { agents, models, addAgent, deleteAgent, settings } = useEvalStore();
  const [showForm, setShowForm] = useState(false);

  const [name, setName] = useState('');
  const [framework, setFramework] = useState<AgentFramework>('LangGraph');
  const [modelId, setModelId] = useState(models[0]?.id ?? 'mod_gemini_hydrogen');
  const [version, setVersion] = useState('v1.0.0');
  const [systemInstructions, setSystemInstructions] = useState(
    'You are an autonomous enterprise agent. Plan step-by-step, verify policies via knowledge_search, and escalate sensitive actions for human approval.'
  );
  const [selectedTools, setSelectedTools] = useState<AgentToolId[]>([
    'knowledge_search',
    'sql_query_sandbox',
    'calculator',
  ]);
  const [memoryConfig, setMemoryConfig] =
    useState<AgentConfig['memoryConfig']>('structured-scratchpad');
  const [planningStrategy, setPlanningStrategy] =
    useState<AgentConfig['planningStrategy']>('plan-and-execute');
  const [maxSteps, setMaxSteps] = useState(6);
  const [timeoutMs, setTimeoutMs] = useState(25000);
  const [retryPolicy, setRetryPolicy] =
    useState<AgentConfig['retryPolicy']>('exponential-1');
  const [requireRefundApproval, setRequireRefundApproval] = useState(true);

  const toggleTool = (id: AgentToolId) => {
    setSelectedTools((prev) =>
      prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    const newAgent: AgentConfig = {
      id: `agt_${Date.now().toString(36)}`,
      name: name.trim(),
      framework,
      modelId,
      version: version.trim() || 'v1.0.0',
      systemInstructions: systemInstructions.trim(),
      tools: selectedTools,
      memoryConfig,
      planningStrategy,
      maxSteps: Math.max(2, Math.min(12, Number(maxSteps) || 5)),
      timeoutMs: Math.max(5000, Number(timeoutMs) || 20000),
      retryPolicy,
      humanApprovalRequired: requireRefundApproval ? ['issue_refund'] : [],
      environment: settings.environment,
      createdAt: new Date().toISOString(),
      notes: 'Custom autonomous agent workflow configuration.',
    };
    addAgent(newAgent);
    setName('');
    setShowForm(false);
  };

  return (
    <div className="space-y-6">
      <SectionHeader
        title="AI Agent Configurations & Sandboxed Tools"
        subtitle="Configure autonomous workflows across LangGraph, LangChain, CrewAI, AutoGen, and Semantic Kernel with strictly sandboxed tools and human-in-the-loop governance."
        actions={
          <button
            onClick={() => setShowForm((v) => !v)}
            className="flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-md bg-sky-500 hover:bg-sky-400 text-slate-950 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            {showForm ? 'Close Form' : 'Register AI Agent'}
          </button>
        }
      />

      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="p-5 bg-slate-900/60 border border-slate-800 rounded-lg space-y-4"
        >
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <h2 className="text-sm font-semibold text-slate-100">
              Configure Autonomous Agent
            </h2>
            <span className="text-xs text-slate-400">
              All tools execute inside an isolated synthetic sandbox
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Agent Name</label>
              <input
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Enterprise Procurement Verifier"
                className="w-full bg-slate-950 border border-slate-800 rounded-md px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-sky-500"
              />
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-1">Agent Framework</label>
              <select
                value={framework}
                onChange={(e) => setFramework(e.target.value as AgentFramework)}
                className="w-full bg-slate-950 border border-slate-800 rounded-md px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-sky-500"
              >
                {FRAMEWORKS.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-1">Underlying LLM</label>
              <select
                value={modelId}
                onChange={(e) => setModelId(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-md px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-sky-500"
              >
                {models.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} ({m.provider})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-1">Planning Strategy</label>
              <select
                value={planningStrategy}
                onChange={(e) =>
                  setPlanningStrategy(e.target.value as AgentConfig['planningStrategy'])
                }
                className="w-full bg-slate-950 border border-slate-800 rounded-md px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-sky-500"
              >
                <option value="plan-and-execute">Plan-and-Execute</option>
                <option value="react">ReAct (Reason + Act)</option>
                <option value="reflexion">Reflexion (Self-Critique)</option>
                <option value="workflow-dag">Workflow DAG</option>
              </select>
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-1">Memory Configuration</label>
              <select
                value={memoryConfig}
                onChange={(e) =>
                  setMemoryConfig(e.target.value as AgentConfig['memoryConfig'])
                }
                className="w-full bg-slate-950 border border-slate-800 rounded-md px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-sky-500"
              >
                <option value="structured-scratchpad">Structured Scratchpad</option>
                <option value="sliding-window">Sliding Window</option>
                <option value="ephemeral">Ephemeral Single-Turn</option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Max Steps</label>
                <input
                  type="number"
                  min={2}
                  max={12}
                  value={maxSteps}
                  onChange={(e) => setMaxSteps(Number(e.target.value))}
                  className="w-full bg-slate-950 border border-slate-800 rounded-md px-3 py-2 text-xs font-mono text-slate-100 focus:outline-none focus:border-sky-500"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Timeout (ms)</label>
                <input
                  type="number"
                  step={1000}
                  value={timeoutMs}
                  onChange={(e) => setTimeoutMs(Number(e.target.value))}
                  className="w-full bg-slate-950 border border-slate-800 rounded-md px-3 py-2 text-xs font-mono text-slate-100 focus:outline-none focus:border-sky-500"
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Retry Policy</label>
              <select
                value={retryPolicy}
                onChange={(e) =>
                  setRetryPolicy(e.target.value as AgentConfig['retryPolicy'])
                }
                className="w-full bg-slate-950 border border-slate-800 rounded-md px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-sky-500"
              >
                <option value="exponential-2">Exponential Backoff (2 retries)</option>
                <option value="exponential-1">Exponential Backoff (1 retry)</option>
                <option value="none">No Automatic Retries</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Agent Version</label>
              <input
                value={version}
                onChange={(e) => setVersion(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-md px-3 py-2 text-xs font-mono text-slate-100 focus:outline-none focus:border-sky-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs text-slate-400 mb-1">
              System Instructions
            </label>
            <textarea
              rows={3}
              value={systemInstructions}
              onChange={(e) => setSystemInstructions(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-md px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-sky-500"
            />
          </div>

          <div>
            <div className="text-xs text-slate-400 mb-2">
              Authorized Sandboxed Tools
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
              {SANDBOX_TOOL_OPTIONS.map((t) => (
                <label
                  key={t.id}
                  className="flex items-start gap-2.5 p-2.5 bg-slate-950/60 border border-slate-800/80 rounded-md cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={selectedTools.includes(t.id)}
                    onChange={() => toggleTool(t.id)}
                    className="mt-0.5 rounded border-slate-700 bg-slate-900 text-sky-500"
                  />
                  <div className="text-xs">
                    <div className="font-medium text-slate-200">{t.label}</div>
                    <div className="text-slate-500">{t.desc}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>

          <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
            <input
              type="checkbox"
              checked={requireRefundApproval}
              onChange={(e) => setRequireRefundApproval(e.target.checked)}
              className="rounded border-slate-700 bg-slate-950 text-sky-500"
            />
            Require human-in-the-loop approval before executing sensitive actions (issue_refund)
          </label>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="px-4 py-2 text-xs font-medium text-slate-300 hover:text-white cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-xs font-semibold rounded-md bg-sky-500 hover:bg-sky-400 text-slate-950 cursor-pointer"
            >
              Save Agent Configuration
            </button>
          </div>
        </form>
      )}

      {/* Agent Configurations Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {agents.map((agent) => {
          const baseModel = models.find((m) => m.id === agent.modelId);
          return (
            <div
              key={agent.id}
              className="p-5 bg-slate-900/40 border border-slate-800/80 rounded-lg flex flex-col justify-between gap-4"
            >
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="text-base font-semibold text-slate-100">
                      {agent.name}
                    </h3>
                    <div className="text-xs text-slate-400 mt-0.5">
                      {agent.framework} · {agent.version} · Base:{' '}
                      <span className="text-slate-200">
                        {baseModel?.name ?? agent.modelId}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <button
                      onClick={() => onRunAgentEval(agent.id)}
                      className="px-3 py-1.5 text-xs font-medium rounded-md bg-slate-800 hover:bg-slate-700 text-sky-300 transition-colors cursor-pointer"
                    >
                      Run Trace Eval
                    </button>
                    {agents.length > 2 && (
                      <button
                        onClick={() => deleteAgent(agent.id)}
                        aria-label={`Delete ${agent.name}`}
                        className="text-slate-500 hover:text-rose-400 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                <p className="text-xs text-slate-400 leading-relaxed border-t border-slate-800/60 pt-3">
                  {agent.systemInstructions}
                </p>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1 text-xs">
                  <div>
                    <div className="text-slate-500">Strategy</div>
                    <div className="text-slate-200 font-medium mt-0.5">
                      {agent.planningStrategy}
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-500">Memory</div>
                    <div className="text-slate-200 font-medium mt-0.5">
                      {agent.memoryConfig}
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-500">Step / Timeout</div>
                    <div className="text-slate-200 font-mono tabular-nums mt-0.5">
                      {agent.maxSteps} steps · {agent.timeoutMs / 1000}s
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-500">HITL Gates</div>
                    <div className="text-slate-200 font-medium mt-0.5">
                      {agent.humanApprovalRequired.length
                        ? agent.humanApprovalRequired.join(', ')
                        : 'None'}
                    </div>
                  </div>
                </div>

                <div className="text-xs text-slate-400 pt-1">
                  <span className="text-slate-500">Sandboxed Tools: </span>
                  <span className="font-mono text-slate-300">
                    {agent.tools.join(' · ')}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
