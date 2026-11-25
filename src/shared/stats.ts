import type { StatSummary } from './types';

export function calculateStatSummary(
  scores: number[],
  outcomes: Array<'success' | 'partial' | 'failed' | 'safety_blocked'>,
  repeatRuns: number
): StatSummary {
  const n = scores.length;
  if (n === 0) {
    return {
      sampleSize: 0,
      repeatRuns,
      mean: 0,
      median: 0,
      stdDev: 0,
      ci95Low: null,
      ci95High: null,
      min: 0,
      max: 0,
      successRate: 0,
      failureRate: 0,
      variance: 0,
    };
  }

  const sorted = [...scores].sort((a, b) => a - b);
  const mean = scores.reduce((a, b) => a + b, 0) / n;
  const median =
    n % 2 === 1 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2;

  const variance =
    n > 1
      ? scores.reduce((acc, s) => acc + Math.pow(s - mean, 2), 0) / (n - 1)
      : 0;
  const stdDev = Math.sqrt(variance);

  let ci95Low: number | null = null;
  let ci95High: number | null = null;
  if (n >= 2) {
    const tApprox = n < 5 ? 2.776 : n < 15 ? 2.201 : 1.96;
    const margin = tApprox * (stdDev / Math.sqrt(n));
    ci95Low = Math.max(0, Math.round((mean - margin) * 10) / 10);
    ci95High = Math.min(100, Math.round((mean + margin) * 10) / 10);
  }

  const successCount = outcomes.filter((o) => o === 'success').length;
  const failureCount = outcomes.filter(
    (o) => o === 'failed' || o === 'safety_blocked'
  ).length;

  return {
    sampleSize: n,
    repeatRuns,
    mean: Math.round(mean * 10) / 10,
    median: Math.round(median * 10) / 10,
    stdDev: Math.round(stdDev * 100) / 100,
    ci95Low,
    ci95High,
    min: Math.round(sorted[0] * 10) / 10,
    max: Math.round(sorted[n - 1] * 10) / 10,
    successRate: Math.round((successCount / outcomes.length) * 1000) / 10,
    failureRate: Math.round((failureCount / outcomes.length) * 1000) / 10,
    variance: Math.round(variance * 100) / 100,
  };
}

export interface ComparisonSignificance {
  status: 'statistically-meaningful' | 'inconclusive' | 'insufficient-sample';
  winnerId: string | null;
  runnerUpId: string | null;
  delta: number;
  explanation: string;
}

/**
 * Determines whether the top two candidates have a statistically meaningful difference
 * or if the comparison is inconclusive (overlapping 95% CIs or delta < pooled SE threshold).
 */
export function assessComparisonSignificance(
  candidates: Array<{ id: string; name: string; score: number | null; stats: StatSummary }>
): ComparisonSignificance {
  const valid = candidates
    .filter((c) => c.score !== null)
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));

  if (valid.length < 2) {
    return {
      status: 'insufficient-sample',
      winnerId: valid[0]?.id ?? null,
      runnerUpId: null,
      delta: 0,
      explanation: 'Select at least two evaluated targets to compute statistical significance.',
    };
  }

  const top = valid[0];
  const second = valid[1];
  const delta = Math.round(((top.score ?? 0) - (second.score ?? 0)) * 10) / 10;

  if (top.stats.sampleSize < 2 || second.stats.sampleSize < 2) {
    return {
      status: 'insufficient-sample',
      winnerId: null,
      runnerUpId: null,
      delta,
      explanation: `Sample size (n=${Math.min(top.stats.sampleSize, second.stats.sampleSize)}) is too small for confidence-interval significance testing. Run repeated trials or larger datasets.`,
    };
  }

  const topLow = top.stats.ci95Low ?? top.stats.mean;
  const secHigh = second.stats.ci95High ?? second.stats.mean;
  const overlap = topLow <= secHigh;
  const seCombined = Math.sqrt(
    Math.pow(top.stats.stdDev, 2) / top.stats.sampleSize +
      Math.pow(second.stats.stdDev, 2) / second.stats.sampleSize
  );

  if (overlap && delta < Math.max(2.5, seCombined * 1.96)) {
    return {
      status: 'inconclusive',
      winnerId: null,
      runnerUpId: null,
      delta,
      explanation: `Inconclusive comparison: ${top.name} (+${delta} pts over ${second.name}) falls within overlapping 95% confidence intervals ([${top.stats.ci95Low}, ${top.stats.ci95High}] vs [${second.stats.ci95Low}, ${second.stats.ci95High}]). Increase repeat runs before declaring a winner.`,
    };
  }

  return {
    status: 'statistically-meaningful',
    winnerId: top.id,
    runnerUpId: second.id,
    delta,
    explanation: `${top.name} leads ${second.name} by ${delta} points with non-overlapping confidence bounds (n=${top.stats.sampleSize}, σ=${top.stats.stdDev}).`,
  };
}
