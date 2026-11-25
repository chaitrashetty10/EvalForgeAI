import React, { useState } from 'react';
import { Plus, Upload, Trash2 } from 'lucide-react';
import { SectionHeader } from '../components/OriginText';
import type {
  AgentToolId,
  BenchmarkCategory,
  BenchmarkDataset,
  SuccessCondition,
  TestCase,
} from '../shared/types';
import { useEvalStore } from '../store/evalStore';

const CATEGORIES: BenchmarkCategory[] = [
  'General reasoning',
  'Knowledge QA',
  'Instruction following',
  'RAG evaluation',
  'Coding',
  'Tool calling',
  'Agent workflows',
  'Safety',
  'Long context',
  'Enterprise tasks',
];

const SUCCESS_CONDITIONS: Array<{ id: SuccessCondition; label: string }> = [
  { id: 'contains_all', label: 'Contains Required Concepts' },
  { id: 'exact_match', label: 'Exact Ground-Truth Match' },
  { id: 'numeric_tolerance', label: 'Numeric Tolerance (±1%)' },
  { id: 'json_schema', label: 'JSON Schema Key Validation' },
  { id: 'tool_sequence', label: 'Tool Sequence Verification' },
  { id: 'safety_refusal', label: 'Safety / Injection Refusal' },
  { id: 'rubric_judge', label: 'Structured Rubric Judge' },
];

export function BenchmarksView({
  onRunBenchmark,
}: {
  onRunBenchmark: (datasetId: string, track: 'llm' | 'agent') => void;
}) {
  const { datasets, addDataset, updateDataset, deleteDataset } = useEvalStore();
  const [selectedDatasetId, setSelectedDatasetId] = useState<string>(
    datasets[0]?.id ?? ''
  );
  const [showNewDataset, setShowNewDataset] = useState(false);
  const [showAddCase, setShowAddCase] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // New dataset form
  const [dsName, setDsName] = useState('');
  const [dsCategory, setDsCategory] = useState<BenchmarkCategory>('Enterprise tasks');
  const [dsTrack, setDsTrack] = useState<'llm' | 'agent' | 'both'>('both');
  const [dsDesc, setDsDesc] = useState('');

  // New test case form
  const [tcPrompt, setTcPrompt] = useState('');
  const [tcGroundTruth, setTcGroundTruth] = useState('');
  const [tcExpected, setTcExpected] = useState('');
  const [tcRubric, setTcRubric] = useState('');
  const [tcCondition, setTcCondition] = useState<SuccessCondition>('contains_all');
  const [tcTags, setTcTags] = useState('enterprise, custom');
  const [tcTools, setTcTools] = useState('');

  const activeDataset =
    datasets.find((d) => d.id === selectedDatasetId) ?? datasets[0];

  const handleCreateDataset = (e: React.FormEvent) => {
    e.preventDefault();
    if (!dsName.trim()) return;
    const newDs: BenchmarkDataset = {
      id: `ds_${Date.now().toString(36)}`,
      name: dsName.trim(),
      version: 'v1.0',
      category: dsCategory,
      referenceSuite: 'Custom User Benchmark Suite',
      description: dsDesc.trim() || 'Custom evaluation dataset.',
      sourceType: 'custom-upload',
      targetTrack: dsTrack,
      createdAt: new Date().toISOString(),
      testCases: [
        {
          id: `tc_${Date.now().toString(36)}`,
          prompt:
            'Summarize the three mandatory requirements for enterprise SLA incident escalation in valid JSON with keys "tier", "slaHours", and "approvalRequired".',
          category: dsCategory,
          tags: ['initial', 'custom'],
          groundTruth: 'tier, slaHours, approvalRequired',
          expectedOutput: '{"tier":"P1","slaHours":4,"approvalRequired":true}',
          evaluationRubric: 'Valid JSON containing tier, slaHours, and approvalRequired.',
          successCondition: 'json_schema',
          expectedJsonKeys: ['tier', 'slaHours', 'approvalRequired'],
          difficulty: 'standard',
        },
      ],
    };
    addDataset(newDs);
    setSelectedDatasetId(newDs.id);
    setDsName('');
    setDsDesc('');
    setShowNewDataset(false);
  };

  const handleAddTestCase = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeDataset || !tcPrompt.trim()) return;
    const parsedTools = tcTools
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean) as AgentToolId[];

    const newCase: TestCase = {
      id: `tc_${Date.now().toString(36)}`,
      prompt: tcPrompt.trim(),
      category: activeDataset.category,
      tags: tcTags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
      groundTruth: tcGroundTruth.trim(),
      expectedOutput: tcExpected.trim() || tcGroundTruth.trim(),
      evaluationRubric:
        tcRubric.trim() || 'Verify correctness and adherence to constraints.',
      expectedTools: parsedTools.length > 0 ? parsedTools : undefined,
      successCondition: tcCondition,
      expectedJsonKeys:
        tcCondition === 'json_schema'
          ? tcGroundTruth
              .split(',')
              .map((k) => k.trim())
              .filter(Boolean)
          : undefined,
      difficulty: 'standard',
    };

    const bumpPatch = activeDataset.version.replace(
      /(\d+)$/,
      (m) => String(Number(m) + 1)
    );
    updateDataset({
      ...activeDataset,
      version: bumpPatch === activeDataset.version ? `${activeDataset.version}.1` : bumpPatch,
      testCases: [...activeDataset.testCases, newCase],
    });
    setTcPrompt('');
    setTcGroundTruth('');
    setTcExpected('');
    setTcRubric('');
    setTcTools('');
    setShowAddCase(false);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setUploadError(null);
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      let importedCases: TestCase[] = [];

      if (file.name.toLowerCase().endsWith('.json')) {
        const parsed = JSON.parse(text) as unknown;
        const arr = Array.isArray(parsed)
          ? parsed
          : (parsed as { testCases?: unknown[] }).testCases;
        if (!Array.isArray(arr)) {
          throw new Error('JSON file must be an array of test cases or contain a "testCases" array.');
        }
        importedCases = arr.map((item, idx) => {
          const row = item as Record<string, unknown>;
          return {
            id: String(row.id ?? `tc_imp_${idx + 1}`),
            prompt: String(row.prompt ?? ''),
            category: (row.category as BenchmarkCategory) || 'Enterprise tasks',
            tags: Array.isArray(row.tags) ? row.tags.map(String) : ['uploaded'],
            groundTruth: String(row.groundTruth ?? row.expectedOutput ?? ''),
            expectedOutput: String(row.expectedOutput ?? row.groundTruth ?? ''),
            evaluationRubric: String(row.evaluationRubric ?? 'Uploaded test case rubric'),
            successCondition:
              (row.successCondition as SuccessCondition) || 'contains_all',
            difficulty: 'standard',
          };
        });
      } else {
        // Basic CSV parser (header: prompt,groundTruth,expectedOutput,rubric,category)
        const lines = text
          .split(/\r?\n/)
          .map((l) => l.trim())
          .filter(Boolean);
        if (lines.length < 2) {
          throw new Error('CSV must include a header row and at least one data row.');
        }
        const headers = lines[0].split(',').map((h) => h.trim().toLowerCase());
        const promptIdx = headers.indexOf('prompt');
        const gtIdx = headers.indexOf('groundtruth');
        const expIdx = headers.indexOf('expectedoutput');
        const rubIdx = headers.indexOf('rubric');
        if (promptIdx === -1) {
          throw new Error('CSV header must include a "prompt" column.');
        }
        importedCases = lines.slice(1).map((line, idx) => {
          const cols = line.split(',').map((c) => c.trim().replace(/^"|"$/g, ''));
          return {
            id: `tc_csv_${idx + 1}`,
            prompt: cols[promptIdx] ?? '',
            category: 'Enterprise tasks',
            tags: ['csv-upload'],
            groundTruth: gtIdx >= 0 ? cols[gtIdx] ?? '' : '',
            expectedOutput: expIdx >= 0 ? cols[expIdx] ?? '' : gtIdx >= 0 ? cols[gtIdx] ?? '' : '',
            evaluationRubric: rubIdx >= 0 ? cols[rubIdx] ?? '' : 'Verify ground truth accuracy',
            successCondition: 'contains_all',
            difficulty: 'standard',
          };
        });
      }

      const validCases = importedCases.filter((c) => c.prompt.length > 0);
      if (validCases.length === 0) {
        throw new Error('No valid test cases with non-empty prompts found.');
      }

      const newDs: BenchmarkDataset = {
        id: `ds_imp_${Date.now().toString(36)}`,
        name: file.name.replace(/\.(json|csv)$/i, ''),
        version: 'v1.0',
        category: validCases[0].category,
        referenceSuite: 'User-Uploaded Evaluation Dataset',
        description: `Imported ${validCases.length} test cases from ${file.name}.`,
        sourceType: 'custom-upload',
        targetTrack: 'both',
        testCases: validCases,
        createdAt: new Date().toISOString(),
      };
      addDataset(newDs);
      setSelectedDatasetId(newDs.id);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Failed to parse file.');
    } finally {
      e.target.value = '';
    }
  };

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Benchmark & Test Dataset Management"
        subtitle="Manage built-in evaluation suites and custom CSV/JSON datasets. Internal suites are clearly labeled with their methodology without claiming official external leaderboard reproduction."
        actions={
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 px-3.5 py-2 text-xs font-medium rounded-md border border-slate-700 hover:border-slate-600 text-slate-200 cursor-pointer whitespace-nowrap shrink-0">
              <Upload className="w-3.5 h-3.5" />
              Import CSV / JSON
              <input
                type="file"
                accept=".csv,.json"
                onChange={handleFileUpload}
                className="hidden"
              />
            </label>
            <button
              onClick={() => setShowNewDataset((v) => !v)}
              className="flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-md bg-sky-500 hover:bg-sky-400 text-slate-950 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              New Dataset
            </button>
          </div>
        }
      />

      {uploadError && (
        <div className="p-3 bg-rose-950/40 border border-rose-800/70 rounded-md text-xs text-rose-300">
          Import Error: {uploadError}
        </div>
      )}

      {showNewDataset && (
        <form
          onSubmit={handleCreateDataset}
          className="p-5 bg-slate-900/60 border border-slate-800 rounded-lg space-y-4"
        >
          <h2 className="text-sm font-semibold text-slate-100">
            Create Custom Benchmark Dataset
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Dataset Name</label>
              <input
                required
                value={dsName}
                onChange={(e) => setDsName(e.target.value)}
                placeholder="e.g., Q4 FinOps Compliance Suite"
                className="w-full bg-slate-950 border border-slate-800 rounded-md px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-sky-500"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Category</label>
              <select
                value={dsCategory}
                onChange={(e) => setDsCategory(e.target.value as BenchmarkCategory)}
                className="w-full bg-slate-950 border border-slate-800 rounded-md px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-sky-500"
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Target Track</label>
              <select
                value={dsTrack}
                onChange={(e) => setDsTrack(e.target.value as 'llm' | 'agent' | 'both')}
                className="w-full bg-slate-950 border border-slate-800 rounded-md px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-sky-500"
              >
                <option value="both">Both LLM & Agent</option>
                <option value="llm">LLM Track Only</option>
                <option value="agent">Agent Track Only</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Description</label>
            <input
              value={dsDesc}
              onChange={(e) => setDsDesc(e.target.value)}
              placeholder="Purpose, evaluation methodology, and ground-truth standard"
              className="w-full bg-slate-950 border border-slate-800 rounded-md px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-sky-500"
            />
          </div>
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={() => setShowNewDataset(false)}
              className="px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-1.5 text-xs font-semibold rounded-md bg-sky-500 text-slate-950 cursor-pointer"
            >
              Create Dataset
            </button>
          </div>
        </form>
      )}

      {/* Split Layout: Dataset List (Left) + Test Cases Inspector (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-4 space-y-2.5">
          {datasets.map((ds) => {
            const active = ds.id === activeDataset?.id;
            return (
              <div
                key={ds.id}
                onClick={() => setSelectedDatasetId(ds.id)}
                className={`p-4 rounded-lg border cursor-pointer transition-colors ${
                  active
                    ? 'bg-slate-900 border-sky-500/70'
                    : 'bg-slate-900/40 border-slate-800/80 hover:border-slate-700'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="font-semibold text-sm text-slate-100">{ds.name}</div>
                  <span className="font-mono text-[11px] text-slate-400 shrink-0">
                    {ds.version}
                  </span>
                </div>
                <div className="mt-1 text-xs text-slate-400">
                  {ds.category} · {ds.testCases.length} cases ·{' '}
                  {ds.sourceType === 'custom-upload' ? 'User Upload' : 'Built-in'}
                </div>
                <div className="mt-1.5 text-[11px] text-slate-500">
                  {ds.referenceSuite}
                </div>
              </div>
            );
          })}
        </div>

        <div className="lg:col-span-8 bg-slate-900/40 border border-slate-800/80 rounded-lg p-5 space-y-5">
          {activeDataset ? (
            <>
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 border-b border-slate-800/80 pb-4">
                <div>
                  <h2 className="text-base font-semibold text-slate-100">
                    {activeDataset.name}{' '}
                    <span className="font-mono text-xs text-slate-400 font-normal">
                      ({activeDataset.version})
                    </span>
                  </h2>
                  <p className="text-xs text-slate-400 mt-1">
                    {activeDataset.description}
                  </p>
                  <div className="text-xs text-slate-500 mt-1">
                    Methodology: {activeDataset.referenceSuite} · Track: {activeDataset.targetTrack.toUpperCase()}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => setShowAddCase((v) => !v)}
                    className="px-3 py-1.5 text-xs font-medium rounded-md border border-slate-700 hover:border-slate-600 text-slate-200 cursor-pointer"
                  >
                    + Add Case
                  </button>
                  <button
                    onClick={() =>
                      onRunBenchmark(
                        activeDataset.id,
                        activeDataset.targetTrack === 'agent' ? 'agent' : 'llm'
                      )
                    }
                    className="px-3 py-1.5 text-xs font-semibold rounded-md bg-sky-500 hover:bg-sky-400 text-slate-950 cursor-pointer"
                  >
                    Evaluate Dataset
                  </button>
                  {activeDataset.sourceType === 'custom-upload' && (
                    <button
                      onClick={() => deleteDataset(activeDataset.id)}
                      aria-label="Delete dataset"
                      className="p-1.5 text-slate-500 hover:text-rose-400 cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>

              {showAddCase && (
                <form
                  onSubmit={handleAddTestCase}
                  className="p-4 bg-slate-950/80 border border-slate-800 rounded-md space-y-3"
                >
                  <div className="text-xs font-semibold text-slate-200">
                    Append Test Case (Automatically increments dataset version)
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Prompt</label>
                    <textarea
                      required
                      rows={2}
                      value={tcPrompt}
                      onChange={(e) => setTcPrompt(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 rounded px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-sky-500"
                    />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-slate-400 mb-1">
                        Ground Truth / Key Tokens
                      </label>
                      <input
                        required
                        value={tcGroundTruth}
                        onChange={(e) => setTcGroundTruth(e.target.value)}
                        placeholder="Comma-separated tokens or JSON keys"
                        className="w-full bg-slate-900 border border-slate-800 rounded px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-sky-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-400 mb-1">
                        Success Condition
                      </label>
                      <select
                        value={tcCondition}
                        onChange={(e) => setTcCondition(e.target.value as SuccessCondition)}
                        className="w-full bg-slate-900 border border-slate-800 rounded px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-sky-500"
                      >
                        {SUCCESS_CONDITIONS.map((sc) => (
                          <option key={sc.id} value={sc.id}>
                            {sc.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-slate-400 mb-1">
                        Expected Output Reference
                      </label>
                      <input
                        value={tcExpected}
                        onChange={(e) => setTcExpected(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-800 rounded px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-sky-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-400 mb-1">
                        Expected Agent Tools (comma-separated, optional)
                      </label>
                      <input
                        value={tcTools}
                        onChange={(e) => setTcTools(e.target.value)}
                        placeholder="knowledge_search, calculator"
                        className="w-full bg-slate-900 border border-slate-800 rounded px-3 py-2 text-xs font-mono text-slate-100 focus:outline-none focus:border-sky-500"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-slate-400 mb-1">Evaluation Rubric</label>
                      <input
                        value={tcRubric}
                        onChange={(e) => setTcRubric(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-800 rounded px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-sky-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-400 mb-1">Tags</label>
                      <input
                        value={tcTags}
                        onChange={(e) => setTcTags(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-800 rounded px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-sky-500"
                      />
                    </div>
                  </div>
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setShowAddCase(false)}
                      className="px-3 py-1.5 text-xs text-slate-400 cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="px-3.5 py-1.5 text-xs font-semibold rounded bg-sky-500 text-slate-950 cursor-pointer"
                    >
                      Save Test Case
                    </button>
                  </div>
                </form>
              )}

              <div className="divide-y divide-slate-800/70">
                {activeDataset.testCases.map((tc, i) => (
                  <div key={tc.id} className="py-4 first:pt-0 last:pb-0 space-y-2">
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="font-mono text-slate-400">
                        Case {i + 1} · {tc.id} · {tc.difficulty} · {tc.successCondition}
                      </span>
                      <span className="text-slate-500">{tc.tags.join(' · ')}</span>
                    </div>
                    <div className="text-xs text-slate-100 leading-relaxed">
                      {tc.prompt}
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-[11px] text-slate-400 pt-1">
                      <div>
                        <span className="text-slate-500">Ground Truth: </span>
                        <span className="font-mono text-slate-300">{tc.groundTruth}</span>
                      </div>
                      <div>
                        <span className="text-slate-500">Rubric: </span>
                        <span>{tc.evaluationRubric}</span>
                      </div>
                    </div>
                    {tc.expectedTools && tc.expectedTools.length > 0 && (
                      <div className="text-[11px] text-sky-400 font-mono">
                        Expected Tools: {tc.expectedTools.join(' → ')}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="text-sm text-slate-500 py-8 text-center">
              Select or create a benchmark dataset.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
