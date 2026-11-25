import React, { useState } from 'react';
import {
  Activity,
  Bot,
  Compass,
  Cpu,
  Database,
  FileBarChart2,
  GitCompare,
  LayoutDashboard,
  Menu,
  PlayCircle,
  Settings,
  Terminal,
  X,
} from 'lucide-react';
import { EvalProvider, useEvalStore } from './store/evalStore';
import { AdvisorView } from './views/AdvisorView';
import { AgentsView } from './views/AgentsView';
import { BenchmarksView } from './views/BenchmarksView';
import { ComparisonView } from './views/ComparisonView';
import { EvaluationsView } from './views/EvaluationsView';
import { ModelsView } from './views/ModelsView';
import { OverviewView } from './views/OverviewView';
import { ReportsView } from './views/ReportsView';
import { SettingsView } from './views/SettingsView';
import { TracesView } from './views/TracesView';

type NavId =
  | 'overview'
  | 'models'
  | 'agents'
  | 'benchmarks'
  | 'evaluations'
  | 'model-comparison'
  | 'agent-comparison'
  | 'traces'
  | 'advisor'
  | 'reports'
  | 'settings';

const NAV_ITEMS: Array<{
  id: NavId;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'models', label: 'Models', icon: Cpu },
  { id: 'agents', label: 'AI Agents', icon: Bot },
  { id: 'benchmarks', label: 'Benchmarks', icon: Database },
  { id: 'evaluations', label: 'Evaluation Runs', icon: PlayCircle },
  { id: 'model-comparison', label: 'Model Comparison', icon: GitCompare },
  { id: 'agent-comparison', label: 'Agent Comparison', icon: Activity },
  { id: 'traces', label: 'Execution Traces', icon: Terminal },
  { id: 'advisor', label: 'Model Selection Advisor', icon: Compass },
  { id: 'reports', label: 'Reports', icon: FileBarChart2 },
  { id: 'settings', label: 'Settings', icon: Settings },
];

function EvalForgeShell() {
  const { settings } = useEvalStore();
  const [activeTab, setActiveTab] = useState<NavId>('overview');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [evalPreselect, setEvalPreselect] = useState<{
    track?: 'llm' | 'agent';
    targetId?: string;
    datasetId?: string;
  } | null>(null);
  const [traceRunId, setTraceRunId] = useState<string | undefined>(undefined);

  const activeNav = NAV_ITEMS.find((n) => n.id === activeTab) ?? NAV_ITEMS[0];

  const handleNavigate = (
    tab: string,
    payload?: { runId?: string; traceId?: string }
  ) => {
    setActiveTab(tab as NavId);
    if (payload?.runId) setTraceRunId(payload.runId);
    setMobileMenuOpen(false);
  };

  return (
    <div className="min-h-screen bg-[#0B1120] text-slate-100 flex">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex lg:flex-col lg:w-[248px] shrink-0 border-r border-slate-800/80 bg-[#0D1424]">
        <div className="h-14 px-5 flex items-center border-b border-slate-800/80">
          <span className="font-display text-base font-bold tracking-tight text-slate-50 whitespace-nowrap">
            EvalForge AI
          </span>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => {
                  setActiveTab(item.id);
                  if (item.id !== 'evaluations') setEvalPreselect(null);
                }}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-xs font-medium transition-colors cursor-pointer text-left ${
                  active
                    ? 'bg-slate-800/90 text-sky-300'
                    : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/40'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-slate-800/80 text-[11px] text-slate-500 space-y-1">
          <div className="text-slate-300 font-medium">{settings.activeRole}</div>
          <div>
            Env: {settings.environment === 'sandbox' ? 'Sandbox / Test' : 'Staging'}
          </div>
        </div>
      </aside>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-black/70"
            onClick={() => setMobileMenuOpen(false)}
          />
          <aside className="relative z-10 w-64 bg-[#0D1424] border-r border-slate-800 flex flex-col">
            <div className="h-14 px-4 flex items-center justify-between border-b border-slate-800">
              <span className="font-display text-base font-bold text-slate-50">
                EvalForge AI
              </span>
              <button
                onClick={() => setMobileMenuOpen(false)}
                aria-label="Close navigation"
                className="p-1 text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const active = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => handleNavigate(item.id)}
                    className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-md text-xs font-medium cursor-pointer text-left ${
                      active
                        ? 'bg-slate-800 text-sky-300'
                        : 'text-slate-400 hover:text-slate-100'
                    }`}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </nav>
          </aside>
        </div>
      )}

      {/* Main Workspace */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Bar Contract: Breadcrumb on Left, Single Primary Action on Right */}
        <header className="h-14 px-4 sm:px-8 border-b border-slate-800/80 bg-[#0B1120]/95 flex items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Open navigation"
              className="lg:hidden p-1.5 text-slate-400 hover:text-slate-100"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="text-xs text-slate-400 truncate">
              <span>EvalForge AI</span>
              <span className="mx-2 text-slate-600">/</span>
              <span className="text-slate-100 font-medium">{activeNav.label}</span>
            </div>
          </div>

          <button
            onClick={() => {
              setEvalPreselect(null);
              setActiveTab('evaluations');
            }}
            className="px-3.5 py-1.5 text-xs font-semibold rounded-md bg-sky-500 hover:bg-sky-400 text-slate-950 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            New Evaluation
          </button>
        </header>

        <main className="flex-1 p-4 sm:p-8 max-w-[1360px] w-full mx-auto">
          {activeTab === 'overview' && (
            <OverviewView onNavigate={handleNavigate} />
          )}

          {activeTab === 'models' && (
            <ModelsView
              onRunModelEval={(modelId) => {
                setEvalPreselect({ track: 'llm', targetId: modelId });
                setActiveTab('evaluations');
              }}
            />
          )}

          {activeTab === 'agents' && (
            <AgentsView
              onRunAgentEval={(agentId) => {
                setEvalPreselect({ track: 'agent', targetId: agentId });
                setActiveTab('evaluations');
              }}
            />
          )}

          {activeTab === 'benchmarks' && (
            <BenchmarksView
              onRunBenchmark={(datasetId, track) => {
                setEvalPreselect({ datasetId, track });
                setActiveTab('evaluations');
              }}
            />
          )}

          {activeTab === 'evaluations' && (
            <EvaluationsView
              preselect={evalPreselect}
              onInspectTraces={(runId) => {
                setTraceRunId(runId);
                setActiveTab('traces');
              }}
            />
          )}

          {activeTab === 'model-comparison' && <ComparisonView track="llm" />}
          {activeTab === 'agent-comparison' && <ComparisonView track="agent" />}
          {activeTab === 'traces' && <TracesView initialRunId={traceRunId} />}
          {activeTab === 'advisor' && <AdvisorView />}
          {activeTab === 'reports' && <ReportsView />}
          {activeTab === 'settings' && <SettingsView />}
        </main>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <EvalProvider>
      <EvalForgeShell />
    </EvalProvider>
  );
}
