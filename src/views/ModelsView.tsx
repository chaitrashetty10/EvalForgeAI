import React, { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { SectionHeader } from '../components/OriginText';
import type { DeploymentType, ModelConfig, ProviderId } from '../shared/types';
import { useEvalStore } from '../store/evalStore';

const PROVIDERS: Array<{ id: ProviderId; label: string; defaultEndpoint: string }> = [
  { id: 'google-gemini', label: 'Google Gemini (Free Tier SDK)', defaultEndpoint: 'Google AI Studio Server SDK' },
  { id: 'ollama', label: 'Ollama (Local Self-Hosted)', defaultEndpoint: 'http://127.0.0.1:11434 (OLLAMA_BASE_URL)' },
  { id: 'groq', label: 'Groq (Optional Free Tier)', defaultEndpoint: 'https://api.groq.com/openai/v1/chat/completions' },
  { id: 'openai-compatible', label: 'OpenAI-Compatible Endpoint', defaultEndpoint: 'Server-side env adapter' },
  { id: 'openai', label: 'OpenAI (Optional Commercial)', defaultEndpoint: 'Disabled by default (zero-cost policy)' },
  { id: 'anthropic', label: 'Anthropic Claude (Optional Commercial)', defaultEndpoint: 'Disabled by default (zero-cost policy)' },
  { id: 'meta-llama', label: 'Meta Llama', defaultEndpoint: 'Local / Groq Adapter' },
  { id: 'mistral', label: 'Mistral', defaultEndpoint: 'Local / Commercial Optional' },
  { id: 'deepseek', label: 'DeepSeek', defaultEndpoint: 'Local / Commercial Optional' },
];

export function ModelsView({
  onRunModelEval,
}: {
  onRunModelEval: (modelId: string) => void;
}) {
  const { models, addModel, deleteModel, providerStatus, settings } = useEvalStore();
  const [showForm, setShowForm] = useState(false);

  const [name, setName] = useState('');
  const [provider, setProvider] = useState<ProviderId>('google-gemini');
  const [modelId, setModelId] = useState('gemini-4-hydrogen');
  const [version, setVersion] = useState('1.0');
  const [endpoint, setEndpoint] = useState('Google AI Studio Server SDK');
  const [contextWindow, setContextWindow] = useState(128000);
  const [deploymentType, setDeploymentType] = useState<DeploymentType>('free-tier-cloud');
  const [pricingIn, setPricingIn] = useState(0);
  const [pricingOut, setPricingOut] = useState(0);
  const [notes, setNotes] = useState('');
  const [caps, setCaps] = useState({
    reasoning: true,
    coding: true,
    toolCalling: true,
    longContext: true,
    multilingual: true,
    multimodal: false,
  });

  const handleProviderChange = (nextProvider: ProviderId) => {
    setProvider(nextProvider);
    const meta = PROVIDERS.find((p) => p.id === nextProvider);
    if (meta) setEndpoint(meta.defaultEndpoint);
    if (nextProvider === 'ollama') {
      setDeploymentType('local-self-hosted');
      setPricingIn(0);
      setPricingOut(0);
    } else if (nextProvider === 'google-gemini' || nextProvider === 'groq') {
      setDeploymentType('free-tier-cloud');
      setPricingIn(0);
      setPricingOut(0);
    } else {
      setDeploymentType('commercial-api-optional');
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !modelId.trim()) return;
    const newModel: ModelConfig = {
      id: `mod_${Date.now().toString(36)}`,
      name: name.trim(),
      provider,
      modelId: modelId.trim(),
      version: version.trim() || '1.0',
      endpoint: endpoint.trim(),
      contextWindow: Number(contextWindow) || 32000,
      capabilities: caps,
      pricingPer1MInput: Number(pricingIn) || 0,
      pricingPer1MOutput: Number(pricingOut) || 0,
      deploymentType,
      enabledByDefault: deploymentType !== 'commercial-api-optional',
      environment: settings.environment,
      createdAt: new Date().toISOString(),
      notes: notes.trim() || 'Custom registered model configuration.',
    };
    addModel(newModel);
    setName('');
    setNotes('');
    setShowForm(false);
  };

  const getRuntimeReadiness = (m: ModelConfig) => {
    if (m.provider === 'google-gemini') {
      return providerStatus?.geminiConfigured
        ? { label: 'Live Gemini Ready', color: 'text-emerald-400' }
        : { label: 'Simulation Ready (Key Unset)', color: 'text-amber-400' };
    }
    if (m.provider === 'ollama') {
      return providerStatus?.ollamaConfigured
        ? { label: 'Local Ollama Ready', color: 'text-sky-400' }
        : { label: 'Simulation Ready (Local Unset)', color: 'text-amber-400' };
    }
    if (m.provider === 'groq') {
      return providerStatus?.groqConfigured
        ? { label: 'Live Groq Ready', color: 'text-emerald-400' }
        : { label: 'Simulation Ready (Optional)', color: 'text-amber-400' };
    }
    return { label: 'Simulation Mode (Zero-Cost Policy)', color: 'text-slate-400' };
  };

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Model Registry & Provider Adapters"
        subtitle="Provider-agnostic registry supporting Google Gemini free-tier models, local Ollama models, optional Groq free-tier, and commercial reference endpoints. API secrets remain strictly server-side."
        actions={
          <button
            onClick={() => setShowForm((v) => !v)}
            className="flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-md bg-sky-500 hover:bg-sky-400 text-slate-950 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            {showForm ? 'Close Form' : 'Register Model'}
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
              Register New Model Configuration
            </h2>
            <span className="text-xs text-slate-400">
              Zero-cost policy: API credentials are read from server environment variables only
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Display Name</label>
              <input
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Gemini 4 Hydrogen (Custom Prompt)"
                className="w-full bg-slate-950 border border-slate-800 rounded-md px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-sky-500"
              />
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-1">Provider Adapter</label>
              <select
                value={provider}
                onChange={(e) => handleProviderChange(e.target.value as ProviderId)}
                className="w-full bg-slate-950 border border-slate-800 rounded-md px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-sky-500"
              >
                {PROVIDERS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-1">Model Identifier</label>
              <input
                required
                value={modelId}
                onChange={(e) => setModelId(e.target.value)}
                placeholder="gemini-4-hydrogen or llama3.2:3b"
                className="w-full bg-slate-950 border border-slate-800 rounded-md px-3 py-2 text-xs font-mono text-slate-100 focus:outline-none focus:border-sky-500"
              />
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-1">Version Tag</label>
              <input
                value={version}
                onChange={(e) => setVersion(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-md px-3 py-2 text-xs font-mono text-slate-100 focus:outline-none focus:border-sky-500"
              />
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-1">Context Window (Tokens)</label>
              <input
                type="number"
                value={contextWindow}
                onChange={(e) => setContextWindow(Number(e.target.value))}
                className="w-full bg-slate-950 border border-slate-800 rounded-md px-3 py-2 text-xs font-mono text-slate-100 focus:outline-none focus:border-sky-500"
              />
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-1">Deployment Type</label>
              <select
                value={deploymentType}
                onChange={(e) => setDeploymentType(e.target.value as DeploymentType)}
                className="w-full bg-slate-950 border border-slate-800 rounded-md px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-sky-500"
              >
                <option value="free-tier-cloud">Free-Tier Cloud API</option>
                <option value="local-self-hosted">Local Self-Hosted (Ollama)</option>
                <option value="commercial-api-optional">Commercial Optional (Simulated)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-1">Endpoint / Adapter Route</label>
              <input
                value={endpoint}
                onChange={(e) => setEndpoint(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-md px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-sky-500"
              />
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-1">
                Input Cost ($ / 1M tokens)
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={pricingIn}
                onChange={(e) => setPricingIn(Number(e.target.value))}
                className="w-full bg-slate-950 border border-slate-800 rounded-md px-3 py-2 text-xs font-mono text-slate-100 focus:outline-none focus:border-sky-500"
              />
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-1">
                Output Cost ($ / 1M tokens)
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={pricingOut}
                onChange={(e) => setPricingOut(Number(e.target.value))}
                className="w-full bg-slate-950 border border-slate-800 rounded-md px-3 py-2 text-xs font-mono text-slate-100 focus:outline-none focus:border-sky-500"
              />
            </div>
          </div>

          <div>
            <div className="text-xs text-slate-400 mb-2">Supported Capabilities</div>
            <div className="flex flex-wrap gap-4 text-xs text-slate-300">
              {(Object.keys(caps) as Array<keyof typeof caps>).map((key) => (
                <label key={key} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={caps[key]}
                    onChange={(e) =>
                      setCaps((prev) => ({ ...prev, [key]: e.target.checked }))
                    }
                    className="rounded border-slate-700 bg-slate-950 text-sky-500"
                  />
                  <span className="capitalize">{key.replace(/([A-Z])/g, ' $1')}</span>
                </label>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs text-slate-400 mb-1">Architecture Notes</label>
            <input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Intended workload, quantization, or evaluation notes"
              className="w-full bg-slate-950 border border-slate-800 rounded-md px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-sky-500"
            />
          </div>

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
              Save Model Configuration
            </button>
          </div>
        </form>
      )}

      {/* Dense Enterprise Model Registry Table */}
      <div className="bg-slate-900/40 border border-slate-800/80 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-900/70 text-slate-400 border-b border-slate-800/80">
              <tr>
                <th className="py-3 px-4 font-medium">Model & Version</th>
                <th className="py-3 px-3 font-medium">Provider / Adapter</th>
                <th className="py-3 px-3 font-medium">Capabilities</th>
                <th className="py-3 px-3 font-medium text-right">Context</th>
                <th className="py-3 px-3 font-medium text-right">Pricing / 1M</th>
                <th className="py-3 px-3 font-medium">Runtime Status</th>
                <th className="py-3 px-4 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70">
              {models.map((m) => {
                const status = getRuntimeReadiness(m);
                const enabledCaps = Object.entries(m.capabilities)
                  .filter(([, v]) => v)
                  .map(([k]) => k)
                  .join(' · ');
                return (
                  <tr key={m.id} className="hover:bg-slate-800/30">
                    <td className="py-3.5 px-4">
                      <div className="font-semibold text-slate-100">{m.name}</div>
                      <div className="text-[11px] font-mono text-slate-400 mt-0.5">
                        {m.modelId} · v{m.version}
                      </div>
                    </td>
                    <td className="py-3.5 px-3">
                      <div className="text-slate-200">{m.provider}</div>
                      <div className="text-[11px] text-slate-500 truncate max-w-[200px]">
                        {m.endpoint}
                      </div>
                    </td>
                    <td className="py-3.5 px-3 text-slate-400 max-w-[220px]">
                      {enabledCaps || 'Standard Text'}
                    </td>
                    <td className="py-3.5 px-3 text-right font-mono tabular-nums text-slate-300">
                      {(m.contextWindow / 1000).toLocaleString()}k
                    </td>
                    <td className="py-3.5 px-3 text-right font-mono tabular-nums text-slate-300">
                      {m.pricingPer1MInput === 0 && m.pricingPer1MOutput === 0
                        ? '$0.00 (Free)'
                        : `$${m.pricingPer1MInput.toFixed(2)} / $${m.pricingPer1MOutput.toFixed(2)}`}
                    </td>
                    <td className="py-3.5 px-3">
                      <span className={`font-medium ${status.color}`}>{status.label}</span>
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <div className="inline-flex items-center gap-3">
                        <button
                          onClick={() => onRunModelEval(m.id)}
                          className="text-sky-400 hover:text-sky-300 font-medium cursor-pointer"
                        >
                          Evaluate
                        </button>
                        {models.length > 2 && (
                          <button
                            onClick={() => deleteModel(m.id)}
                            aria-label={`Delete ${m.name}`}
                            className="text-slate-500 hover:text-rose-400 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
