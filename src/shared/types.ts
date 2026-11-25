export type ProviderId =
  | 'google-gemini'
  | 'groq'
  | 'ollama'
  | 'openai'
  | 'anthropic'
  | 'meta-llama'
  | 'mistral'
  | 'deepseek'
  | 'openai-compatible';

export type ExecutionOrigin = 'live' | 'local' | 'simulated' | 'historical';

export type DeploymentType =
  | 'free-tier-cloud'
  | 'local-self-hosted'
  | 'commercial-api-optional';

export type EnvironmentMode = 'sandbox' | 'staging';

export interface ModelCapabilities {
  reasoning: boolean;
  coding: boolean;
  toolCalling: boolean;
  longContext: boolean;
  multilingual: boolean;
  multimodal: boolean;
}

export interface ModelConfig {
  id: string;
  name: string;
  provider: ProviderId;
  modelId: string;
  version: string;
  endpoint: string;
  contextWindow: number;
  capabilities: ModelCapabilities;
  pricingPer1MInput: number;
  pricingPer1MOutput: number;
  deploymentType: DeploymentType;
  enabledByDefault: boolean;
  environment: EnvironmentMode;
  createdAt: string;
  notes: string;
}

export type AgentFramework =
  | 'LangGraph'
  | 'LangChain'
  | 'CrewAI'
  | 'AutoGen'
  | 'Semantic Kernel'
  | 'Custom Sandbox'
  | 'Workflow Engine';

export type AgentToolId =
  | 'knowledge_search'
  | 'calculator'
  | 'sql_query_sandbox'
  | 'ticket_api'
  | 'code_sandbox_check';

export interface AgentConfig {
  id: string;
  name: string;
  framework: AgentFramework;
  modelId: string;
  version: string;
  systemInstructions: string;
  tools: AgentToolId[];
  memoryConfig: 'ephemeral' | 'sliding-window' | 'structured-scratchpad';
  planningStrategy: 'react' | 'plan-and-execute' | 'reflexion' | 'workflow-dag';
  maxSteps: number;
  timeoutMs: number;
  retryPolicy: 'none' | 'exponential-1' | 'exponential-2';
  humanApprovalRequired: string[];
  environment: EnvironmentMode;
  createdAt: string;
  notes: string;
}

export type BenchmarkCategory =
  | 'General reasoning'
  | 'Knowledge QA'
  | 'Instruction following'
  | 'RAG evaluation'
  | 'Coding'
  | 'Tool calling'
  | 'Agent workflows'
  | 'Safety'
  | 'Long context'
  | 'Enterprise tasks';

export type SuccessCondition =
  | 'exact_match'
  | 'numeric_tolerance'
  | 'contains_all'
  | 'json_schema'
  | 'tool_sequence'
  | 'safety_refusal'
  | 'rubric_judge';

export interface TestCase {
  id: string;
  prompt: string;
  systemContext?: string;
  category: BenchmarkCategory;
  tags: string[];
  groundTruth: string;
  expectedOutput: string;
  evaluationRubric: string;
  inputVariables?: Record<string, string>;
  expectedTools?: AgentToolId[];
  forbiddenTools?: AgentToolId[];
  successCondition: SuccessCondition;
  expectedJsonKeys?: string[];
  forbiddenPatterns?: string[];
  difficulty: 'standard' | 'adversarial' | 'edge';
}

export interface BenchmarkDataset {
  id: string;
  name: string;
  version: string;
  category: BenchmarkCategory;
  referenceSuite: string;
  description: string;
  sourceType: 'builtin' | 'custom-upload';
  targetTrack: 'llm' | 'agent' | 'both';
  testCases: TestCase[];
  createdAt: string;
}

export interface LLMDimensionScores {
  accuracy: number | null;
  reasoning: number | null;
  instructionFollowing: number | null;
  contextUnderstanding: number | null;
  responseQuality: number | null;
  robustness: number | null;
  safety: number | null;
  technicalPerformance: number | null;
  costEfficiency: number | null;
  multilingualMultimodal?: number | null;
}

export interface AgentDimensionScores {
  taskCompletion: number | null;
  planningReasoning: number | null;
  toolCalling: number | null;
  executionReliability: number | null;
  memoryContext: number | null;
  autonomy: number | null;
  multiAgentCoordination: number | null;
  safetyGovernance: number | null;
  efficiency: number | null;
}

export interface LLMWeights {
  accuracy: number;
  reasoning: number;
  instructionFollowing: number;
  contextUnderstanding: number;
  responseQuality: number;
  robustness: number;
  safety: number;
  technicalPerformance: number;
  costEfficiency: number;
}

export interface AgentWeights {
  taskCompletion: number;
  planningReasoning: number;
  toolCalling: number;
  executionReliability: number;
  memoryContext: number;
  autonomy: number;
  multiAgentCoordination: number;
  safetyGovernance: number;
  efficiency: number;
}

export interface SafetyGateConfig {
  minSafetyScore: number;
  blockOnPiiLeakage: boolean;
  blockOnUnauthorizedTool: boolean;
  blockOnPromptInjection: boolean;
  requireHumanApprovalForSensitiveTools: boolean;
}

export interface ToolCallRecord {
  stepIndex: number;
  toolName: AgentToolId | string;
  argumentsJson: string;
  outputJson: string;
  success: boolean;
  latencyMs: number;
  authorized: boolean;
  requiresApproval?: boolean;
  error?: string;
}

export type TracePhase =
  | 'User Request'
  | 'Agent Planning'
  | 'Tool Selection'
  | 'Tool Execution'
  | 'Observation'
  | 'Replanning'
  | 'Final Response'
  | 'Error / Retry';

export interface TraceStep {
  stepIndex: number;
  phase: TracePhase;
  title: string;
  content: string;
  latencyMs: number;
  tokensUsed: number;
  status: 'ok' | 'warning' | 'error' | 'blocked';
  toolCall?: ToolCallRecord;
}

export interface DeterministicCheckResult {
  name: string;
  passed: boolean;
  score: number;
  details: string;
}

export interface JudgeEvaluation {
  judgeModel: string;
  judgeVersion: string;
  positionOrder: 'single-blind' | 'pairwise-A-first' | 'pairwise-B-first';
  factualCorrectnessScore: number;
  writingQualityScore: number;
  relevanceScore: number;
  completenessScore: number;
  groundednessScore: number;
  evidence: string[];
  rationale: string;
  judgeAgreement: number | null;
  humanOverrideScore: number | null;
  humanOverrideNote?: string;
}

export interface ExecutionTrace {
  id: string;
  runId: string;
  targetId: string;
  targetName: string;
  targetTrack: 'llm' | 'agent';
  executionOrigin: ExecutionOrigin;
  testCaseId: string;
  testCasePrompt: string;
  testCaseCategory: BenchmarkCategory;
  repeatIndex: number;
  timestamp: string;
  modelVersion: string;
  systemInstructions: string;
  finalResponse: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  ttftMs: number;
  totalLatencyMs: number;
  tokensPerSec: number;
  estimatedCostUsd: number;
  error: string | null;
  retries: number;
  outcome: 'success' | 'partial' | 'failed' | 'safety_blocked';
  steps: TraceStep[];
  toolCalls: ToolCallRecord[];
  deterministicChecks: DeterministicCheckResult[];
  judgeEvaluation: JudgeEvaluation | null;
  dimensionScores: Record<string, number | null>;
  safetyViolations: string[];
  environment: EnvironmentMode;
}

export interface StatSummary {
  sampleSize: number;
  repeatRuns: number;
  mean: number;
  median: number;
  stdDev: number;
  ci95Low: number | null;
  ci95High: number | null;
  min: number;
  max: number;
  successRate: number;
  failureRate: number;
  variance: number;
}

export interface RunTargetSummary {
  targetId: string;
  targetName: string;
  providerOrFramework: string;
  executionOrigin: ExecutionOrigin;
  overallScore: number | null;
  dimensionScores: Record<string, number | null>;
  stats: StatSummary;
  avgLatencyMs: number;
  avgTtftMs: number;
  avgTokensPerSec: number;
  avgSteps: number | null;
  totalTokens: number;
  totalCostUsd: number;
  costPerSuccessUsd: number | null;
  safetyGatePassed: boolean;
  safetyGateReasons: string[];
  deploymentReady: boolean;
}

export interface EvaluationRun {
  id: string;
  name: string;
  track: 'llm' | 'agent';
  executionOrigin: ExecutionOrigin;
  environment: EnvironmentMode;
  datasetId: string;
  datasetName: string;
  datasetVersion: string;
  targetIds: string[];
  repeatCount: number;
  status: 'completed' | 'running' | 'partial' | 'failed';
  startedAt: string;
  completedAt: string;
  baselineRunId: string | null;
  weightsSnapshot: LLMWeights | AgentWeights;
  safetyGateSnapshot: SafetyGateConfig;
  results: RunTargetSummary[];
  traces: ExecutionTrace[];
  notes?: string;
}

export type UserRole =
  | 'Principal Architect'
  | 'ML Engineer'
  | 'Safety Reviewer'
  | 'Viewer';

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  actorRole: UserRole;
  action: string;
  target: string;
  details: string;
  environment: EnvironmentMode;
}

export interface PlatformSettings {
  llmWeights: LLMWeights;
  agentWeights: AgentWeights;
  safetyGates: SafetyGateConfig;
  judgeModelId: string;
  enableLlmJudge: boolean;
  maskPiiInTraces: boolean;
  retentionDays: number;
  activeRole: UserRole;
  environment: EnvironmentMode;
}

export interface ProviderStatusInfo {
  geminiConfigured: boolean;
  groqConfigured: boolean;
  ollamaConfigured: boolean;
  ollamaEndpoint: string | null;
  rateLimiter: {
    activeRequests: number;
    maxConcurrent: number;
    requestsLastMinute: number;
    maxPerMinute: number;
  };
}
