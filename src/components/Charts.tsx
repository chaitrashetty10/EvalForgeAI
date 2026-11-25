import React, { useState } from 'react';

const SERIES_COLORS = ['#38BDF8', '#34D399', '#FBBF24', '#A78BFA', '#F472B6'];

export interface BarItem {
  label: string;
  sublabel?: string;
  value: number;
  maxValue?: number;
  flagged?: boolean;
}

export function HorizontalBarChart({
  items,
  unit = '',
}: {
  items: BarItem[];
  unit?: string;
}) {
  if (items.length === 0) {
    return (
      <div className="py-10 text-center text-sm text-slate-500">
        No evaluation metrics available for this filter.
      </div>
    );
  }

  return (
    <div className="space-y-3.5">
      {items.map((item, idx) => {
        const max = item.maxValue ?? 100;
        const pct = Math.max(0, Math.min(100, (item.value / max) * 100));
        return (
          <div key={`${item.label}-${idx}`} className="space-y-1.5">
            <div className="flex items-baseline justify-between gap-3 text-xs">
              <div className="min-w-0 truncate">
                <span className="font-medium text-slate-200">{item.label}</span>
                {item.sublabel && (
                  <span className="text-slate-500"> · {item.sublabel}</span>
                )}
              </div>
              <span
                className={`font-mono tabular-nums font-medium shrink-0 ${
                  item.flagged ? 'text-rose-400' : 'text-slate-200'
                }`}
              >
                {item.value.toFixed(1)}
                {unit}
              </span>
            </div>
            <div className="h-2 w-full bg-slate-800/80 rounded-sm overflow-hidden">
              <div
                className={`h-full transition-all duration-300 ${
                  item.flagged ? 'bg-rose-500/80' : 'bg-sky-400/85'
                }`}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export interface ScatterPoint {
  id: string;
  label: string;
  x: number;
  y: number;
  origin: string;
  flagged?: boolean;
}

export function ScatterPlotChart({
  points,
  xLabel,
  yLabel,
  formatX = (v) => v.toFixed(1),
  formatY = (v) => v.toFixed(1),
}: {
  points: ScatterPoint[];
  xLabel: string;
  yLabel: string;
  formatX?: (v: number) => string;
  formatY?: (v: number) => string;
}) {
  const [hovered, setHovered] = useState<ScatterPoint | null>(null);

  if (points.length === 0) {
    return (
      <div className="h-56 flex items-center justify-center text-sm text-slate-500">
        No data points to plot.
      </div>
    );
  }

  const width = 460;
  const height = 220;
  const padL = 46;
  const padR = 20;
  const padT = 18;
  const padB = 34;

  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs, minX + 0.0001);
  const minY = Math.max(0, Math.min(...ys) - 10);
  const maxY = 100;

  const scaleX = (x: number) => {
    if (maxX === minX) return padL + (width - padL - padR) / 2;
    return padL + ((x - minX) / (maxX - minX)) * (width - padL - padR);
  };
  const scaleY = (y: number) =>
    height - padB - ((y - minY) / Math.max(1, maxY - minY)) * (height - padT - padB);

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-56 overflow-visible">
        {[0, 0.25, 0.5, 0.75, 1].map((t) => {
          const yVal = minY + t * (maxY - minY);
          const yPos = scaleY(yVal);
          return (
            <g key={t}>
              <line
                x1={padL}
                x2={width - padR}
                y1={yPos}
                y2={yPos}
                stroke="#1E293B"
                strokeDasharray="2 3"
              />
              <text
                x={padL - 6}
                y={yPos + 3}
                textAnchor="end"
                className="fill-slate-500 text-[10px] font-mono tabular-nums"
              >
                {Math.round(yVal)}
              </text>
            </g>
          );
        })}

        <line
          x1={padL}
          x2={width - padR}
          y1={height - padB}
          y2={height - padB}
          stroke="#334155"
        />
        <line x1={padL} x2={padL} y1={padT} y2={height - padB} stroke="#334155" />

        <text
          x={(padL + width - padR) / 2}
          y={height - 6}
          textAnchor="middle"
          className="fill-slate-400 text-[10px]"
        >
          {xLabel}
        </text>
        <text
          x={12}
          y={(padT + height - padB) / 2}
          textAnchor="middle"
          transform={`rotate(-90 12 ${(padT + height - padB) / 2})`}
          className="fill-slate-400 text-[10px]"
        >
          {yLabel}
        </text>

        {points.map((pt, i) => {
          const cx = scaleX(pt.x);
          const cy = scaleY(pt.y);
          const color = pt.flagged
            ? '#FB7185'
            : SERIES_COLORS[i % SERIES_COLORS.length];
          return (
            <g
              key={pt.id}
              onMouseEnter={() => setHovered(pt)}
              onMouseLeave={() => setHovered(null)}
              className="cursor-pointer"
            >
              <circle
                cx={cx}
                cy={cy}
                r={hovered?.id === pt.id ? 7 : 5.5}
                fill={color}
                fillOpacity={0.85}
                stroke="#0B1120"
                strokeWidth={1.5}
              />
              <text
                x={cx + 8}
                y={cy + 3}
                className="fill-slate-300 text-[10px]"
              >
                {pt.label.slice(0, 18)}
              </text>
            </g>
          );
        })}
      </svg>

      {hovered && (
        <div className="mt-2 px-3 py-2 bg-slate-900/95 border border-slate-700 rounded text-xs flex items-center justify-between gap-4">
          <span className="font-medium text-slate-100">
            {hovered.label} <span className="text-slate-400">· {hovered.origin}</span>
          </span>
          <span className="font-mono tabular-nums text-sky-300">
            {xLabel}: {formatX(hovered.x)} · {yLabel}: {formatY(hovered.y)}
          </span>
        </div>
      )}
    </div>
  );
}

export interface RadarSeries {
  id: string;
  name: string;
  values: Array<number | null>;
}

export function RadarChart({
  axes,
  series,
}: {
  axes: string[];
  series: RadarSeries[];
}) {
  const size = 340;
  const cx = size / 2;
  const cy = size / 2;
  const radius = 112;
  const count = axes.length;

  const angleFor = (idx: number) => (Math.PI * 2 * idx) / count - Math.PI / 2;
  const pointAt = (idx: number, val: number) => {
    const r = (Math.max(0, Math.min(100, val)) / 100) * radius;
    const a = angleFor(idx);
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)] as const;
  };

  return (
    <div className="flex flex-col items-center">
      <svg viewBox={`0 0 ${size} ${size}`} className="w-full max-w-[340px]">
        {[20, 40, 60, 80, 100].map((ring) => {
          const pts = axes
            .map((_, i) => pointAt(i, ring).join(','))
            .join(' ');
          return (
            <polygon
              key={ring}
              points={pts}
              fill="none"
              stroke="#1E293B"
              strokeWidth={1}
            />
          );
        })}

        {axes.map((label, i) => {
          const [ex, ey] = pointAt(i, 100);
          const [lx, ly] = pointAt(i, 118);
          return (
            <g key={label}>
              <line x1={cx} y1={cy} x2={ex} y2={ey} stroke="#1E293B" />
              <text
                x={lx}
                y={ly}
                textAnchor={lx < cx - 10 ? 'end' : lx > cx + 10 ? 'start' : 'middle'}
                dominantBaseline="middle"
                className="fill-slate-400 text-[9.5px]"
              >
                {label.length > 16 ? `${label.slice(0, 15)}…` : label}
              </text>
            </g>
          );
        })}

        {series.map((s, sIdx) => {
          const color = SERIES_COLORS[sIdx % SERIES_COLORS.length];
          const pts = s.values
            .map((v, i) => pointAt(i, v ?? 0).join(','))
            .join(' ');
          return (
            <g key={s.id}>
              <polygon
                points={pts}
                fill={color}
                fillOpacity={0.14}
                stroke={color}
                strokeWidth={2}
              />
              {s.values.map((v, i) => {
                if (v === null) return null;
                const [px, py] = pointAt(i, v);
                return <circle key={i} cx={px} cy={py} r={3} fill={color} />;
              })}
            </g>
          );
        })}
      </svg>

      <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-1.5 mt-2 text-xs">
        {series.map((s, idx) => (
          <div key={s.id} className="flex items-center gap-2 text-slate-300">
            <span
              className="inline-block w-2.5 h-2.5 rounded-xs"
              style={{ backgroundColor: SERIES_COLORS[idx % SERIES_COLORS.length] }}
            />
            <span>{s.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function TrendLineChart({
  points,
}: {
  points: Array<{ label: string; score: number; reliability: number }>;
}) {
  if (points.length === 0) {
    return (
      <div className="h-44 flex items-center justify-center text-sm text-slate-500">
        Run multiple evaluations to inspect reliability trends.
      </div>
    );
  }

  const w = 440;
  const h = 175;
  const padL = 34;
  const padR = 16;
  const padT = 16;
  const padB = 28;

  const getX = (i: number) =>
    points.length === 1
      ? (w - padL - padR) / 2 + padL
      : padL + (i / (points.length - 1)) * (w - padL - padR);
  const getY = (val: number) =>
    h - padB - (Math.max(0, Math.min(100, val)) / 100) * (h - padT - padB);

  const scorePath = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${getX(i)} ${getY(p.score)}`)
    .join(' ');
  const relPath = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${getX(i)} ${getY(p.reliability)}`)
    .join(' ');

  return (
    <div>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-44">
        {[0, 25, 50, 75, 100].map((v) => (
          <g key={v}>
            <line
              x1={padL}
              x2={w - padR}
              y1={getY(v)}
              y2={getY(v)}
              stroke="#1E293B"
              strokeDasharray="2 3"
            />
            <text
              x={padL - 5}
              y={getY(v) + 3}
              textAnchor="end"
              className="fill-slate-500 text-[9.5px] font-mono"
            >
              {v}
            </text>
          </g>
        ))}

        <path d={scorePath} fill="none" stroke="#38BDF8" strokeWidth={2} />
        <path
          d={relPath}
          fill="none"
          stroke="#34D399"
          strokeWidth={1.75}
          strokeDasharray="4 3"
        />

        {points.map((p, i) => (
          <g key={i}>
            <circle cx={getX(i)} cy={getY(p.score)} r={3.5} fill="#38BDF8" />
            <circle cx={getX(i)} cy={getY(p.reliability)} r={3} fill="#34D399" />
            <text
              x={getX(i)}
              y={h - 8}
              textAnchor="middle"
              className="fill-slate-400 text-[9.5px]"
            >
              {p.label.slice(0, 12)}
            </text>
          </g>
        ))}
      </svg>
      <div className="flex items-center gap-5 text-xs text-slate-400 mt-1">
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-0.5 bg-sky-400 inline-block" /> Weighted Score
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-0.5 bg-emerald-400 inline-block" /> Success Rate %
        </span>
      </div>
    </div>
  );
}
