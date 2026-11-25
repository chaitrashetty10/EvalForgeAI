import React, { useState } from 'react';
import type { ExecutionOrigin } from '../shared/types';

export function OriginLabel({ origin }: { origin: ExecutionOrigin }) {
  const map: Record<ExecutionOrigin, { label: string; color: string }> = {
    live: { label: 'Live API', color: 'text-emerald-400' },
    local: { label: 'Local Execution', color: 'text-sky-400' },
    simulated: { label: 'Simulated Demo', color: 'text-amber-400' },
    historical: { label: 'Historical Record', color: 'text-slate-400' },
  };
  const info = map[origin] ?? map.simulated;
  return (
    <span className={`text-xs font-medium tracking-tight ${info.color}`}>
      {info.label}
    </span>
  );
}

export function SafetyGateLabel({
  passed,
  deploymentReady,
}: {
  passed: boolean;
  deploymentReady?: boolean;
}) {
  if (!passed) {
    return (
      <span className="text-xs font-semibold text-rose-400">
        Fails Safety Gate
      </span>
    );
  }
  if (deploymentReady === false) {
    return (
      <span className="text-xs font-medium text-amber-400">
        Needs Review
      </span>
    );
  }
  return (
    <span className="text-xs font-medium text-emerald-400">
      Deployment Ready
    </span>
  );
}

export function ScoreDisplay({
  value,
  suffix = '',
  decimals = 1,
}: {
  value: number | null | undefined;
  suffix?: string;
  decimals?: number;
}) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return <span className="font-mono tabular-nums text-slate-500">N/A</span>;
  }
  const color =
    value >= 85
      ? 'text-emerald-400'
      : value >= 70
        ? 'text-sky-300'
        : value >= 55
          ? 'text-amber-400'
          : 'text-rose-400';
  return (
    <span className={`font-mono tabular-nums font-medium ${color}`}>
      {value.toFixed(decimals)}
      {suffix}
    </span>
  );
}

export function SectionHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-5 border-b border-slate-800/80">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-50">
          {title}
        </h1>
        {subtitle && (
          <p className="mt-1 text-sm text-slate-400 max-w-3xl">{subtitle}</p>
        )}
      </div>
      {actions && <div className="flex items-center gap-3 shrink-0">{actions}</div>}
    </div>
  );
}
