/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo, useState, useEffect } from 'react';
import {
  BarChart3,
  TrendingUp,
  TrendingDown,
  Minus,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  ScatterChart,
  Info,
} from 'lucide-react';
import { Modal } from '../ui/Modal';
import {
  TransferROISigningItem,
  TransferROISummary,
  formatSeasonSpan,
  formatTransferFee,
} from '../../utils/transferRoi';
import { sounds } from '../../services/soundEffects';

interface TransferROIModalProps {
  isOpen: boolean;
  onClose: () => void;
  summary: TransferROISummary;
  clubName: string;
}

type ChartMode = 'scatter' | 'season_bars';
type SeasonFilter = 'all' | 'current' | 'previous';
type StatusFilter = 'all' | 'at_club' | 'departed';
type SortField = 'delta' | 'fee' | 'currentOverall' | 'season' | 'name';

export const TransferROIModal: React.FC<TransferROIModalProps> = ({
  isOpen,
  onClose,
  summary,
  clubName,
}) => {
  const [chartMode, setChartMode] = useState<ChartMode>('scatter');
  const [seasonFilter, setSeasonFilter] = useState<SeasonFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [sortField, setSortField] = useState<SortField>('delta');
  const [sortAsc, setSortAsc] = useState<boolean>(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && summary.items.length > 0 && !selectedId) {
      setSelectedId(summary.items[0].record.id);
    }
  }, [isOpen, summary.items, selectedId]);

  const filteredItems = useMemo(() => {
    return summary.items.filter(item => {
      if (seasonFilter === 'current' && item.record.season !== summary.currentSeason) {
        return false;
      }
      if (seasonFilter === 'previous' && item.record.season !== summary.previousSeason) {
        return false;
      }
      if (statusFilter === 'at_club' && item.status !== 'at_club') {
        return false;
      }
      if (statusFilter === 'departed' && item.status === 'at_club') {
        return false;
      }
      return true;
    });
  }, [summary.items, summary.currentSeason, summary.previousSeason, seasonFilter, statusFilter]);

  const sortedItems = useMemo(() => {
    const list = [...filteredItems];
    list.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case 'delta':
          cmp = a.overallDelta - b.overallDelta;
          break;
        case 'fee':
          cmp = a.record.fee - b.record.fee;
          break;
        case 'currentOverall':
          cmp = a.currentOverall - b.currentOverall;
          break;
        case 'season':
          cmp = a.record.season - b.record.season || a.record.week - b.record.week;
          break;
        case 'name':
          cmp = a.record.playerName.localeCompare(b.record.playerName);
          break;
      }
      return sortAsc ? cmp : -cmp;
    });
    return list;
  }, [filteredItems, sortField, sortAsc]);

  const filteredMetrics = useMemo(() => {
    const fees = filteredItems.reduce((sum, i) => sum + i.record.fee, 0);
    const delta = filteredItems.reduce((sum, i) => sum + i.overallDelta, 0);
    const avg = filteredItems.length > 0 ? delta / filteredItems.length : 0;
    const costPerPoint = delta > 0 ? fees / delta : null;
    return { fees, delta, avg, costPerPoint, count: filteredItems.length };
  }, [filteredItems]);

  const selectedItem: TransferROISigningItem | undefined = useMemo(() => {
    return (
      filteredItems.find(i => i.record.id === selectedId) ||
      filteredItems[0]
    );
  }, [filteredItems, selectedId]);

  const handleSort = (field: SortField) => {
    sounds.playClick();
    if (sortField === field) {
      setSortAsc(prev => !prev);
    } else {
      setSortField(field);
      setSortAsc(field === 'name');
    }
  };

  // Scatter Chart Coordinate Math
  const scatterGeometry = useMemo(() => {
    const width = 640;
    const height = 250;
    const pad = { top: 22, right: 24, bottom: 36, left: 48 };
    const plotW = width - pad.left - pad.right;
    const plotH = height - pad.top - pad.bottom;

    const maxFeeM = Math.max(
      1,
      ...filteredItems.map(i => i.record.fee / 1_000_000)
    );
    const xMax = Math.ceil(maxFeeM * 1.12);

    const deltas = filteredItems.map(i => i.overallDelta);
    const minDelta = Math.min(-2, ...deltas);
    const maxDelta = Math.max(3, ...deltas);
    const yMin = minDelta - 1;
    const yMax = maxDelta + 1;

    const xScale = (fee: number) =>
      pad.left + ((fee / 1_000_000) / xMax) * plotW;
    const yScale = (delta: number) =>
      pad.top + ((yMax - delta) / (yMax - yMin)) * plotH;

    const zeroY = yScale(0);

    return { width, height, pad, plotW, plotH, xMax, yMin, yMax, xScale, yScale, zeroY };
  }, [filteredItems]);

  const seasonBarGeometry = useMemo(() => {
    const width = 640;
    const height = 230;
    const pad = { top: 24, right: 56, bottom: 36, left: 56 };
    const plotW = width - pad.left - pad.right;
    const plotH = height - pad.top - pad.bottom;

    const buckets = summary.bySeason;
    const maxFee = Math.max(1, ...buckets.map(b => b.feesSpent));
    const maxAbsDelta = Math.max(2, ...buckets.map(b => Math.abs(b.collectiveOvrDelta)));

    return { width, height, pad, plotW, plotH, buckets, maxFee, maxAbsDelta };
  }, [summary.bySeason]);

  const renderDeltaBadge = (delta: number) => {
    if (delta > 0) {
      return (
        <span className="inline-flex items-center gap-1 font-mono font-bold text-emerald-400 tabular-nums">
          <TrendingUp className="w-3.5 h-3.5 shrink-0" />
          <span>+{delta}</span>
        </span>
      );
    }
    if (delta < 0) {
      return (
        <span className="inline-flex items-center gap-1 font-mono font-bold text-rose-400 tabular-nums">
          <TrendingDown className="w-3.5 h-3.5 shrink-0" />
          <span>{delta}</span>
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 font-mono font-bold text-slate-400 tabular-nums">
        <Minus className="w-3.5 h-3.5 shrink-0" />
        <span>0</span>
      </span>
    );
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      maxWidthClass="max-w-4xl"
      ariaLabel="Transfer ROI Analysis"
      header={
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-amber-400 shrink-0" />
            <h2 className="text-base sm:text-lg font-extrabold text-white tracking-tight">
              Transfer ROI Analysis
            </h2>
          </div>
          <p className="text-xs text-slate-400 font-mono">
            {clubName} · Paid Signings ({formatSeasonSpan(summary.previousSeason)} –{' '}
            {formatSeasonSpan(summary.currentSeason)}) · Tracked Across All League Clubs & Free Agents
          </p>
        </div>
      }
      footer={
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs text-slate-400 font-mono flex items-center gap-1.5">
            {summary.retiredExcludedCount > 0 ? (
              <>
                <Info className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span>
                  {summary.retiredExcludedCount}{' '}
                  {summary.retiredExcludedCount === 1 ? 'retired signing' : 'retired signings'} (
                  {formatTransferFee(summary.retiredFeesExcluded)}) excluded from active rating delta.
                </span>
              </>
            ) : (
              <span>All paid signings in the 2-season window are currently active.</span>
            )}
          </div>
          <button
            type="button"
            onClick={() => {
              sounds.playClick();
              onClose();
            }}
            className="min-h-11 lg:min-h-9 px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-semibold text-slate-200 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
          >
            Close
          </button>
        </div>
      }
    >
      <div className="space-y-5">
        {/* KPI Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-900/60 border border-white/10 rounded-xl p-3.5">
          <div>
            <span className="text-[11px] text-slate-400 uppercase tracking-wider block mb-0.5">
              Total Fees Spent
            </span>
            <span className="text-base sm:text-lg font-bold font-mono tabular-nums text-amber-400">
              {formatTransferFee(filteredMetrics.fees)}
            </span>
          </div>

          <div>
            <span className="text-[11px] text-slate-400 uppercase tracking-wider block mb-0.5">
              Collective OVR Δ
            </span>
            <div className="text-base sm:text-lg font-bold font-mono tabular-nums">
              {renderDeltaBadge(filteredMetrics.delta)}
            </div>
          </div>

          <div>
            <span className="text-[11px] text-slate-400 uppercase tracking-wider block mb-0.5">
              Cost Per +1 OVR
            </span>
            <span className="text-base sm:text-lg font-bold font-mono tabular-nums text-white">
              {filteredMetrics.costPerPoint !== null
                ? formatTransferFee(filteredMetrics.costPerPoint)
                : 'N/A'}
            </span>
          </div>

          <div>
            <span className="text-[11px] text-slate-400 uppercase tracking-wider block mb-0.5">
              Active Signings
            </span>
            <span className="text-base sm:text-lg font-bold font-mono tabular-nums text-slate-200">
              {filteredMetrics.count}{' '}
              <span className="text-xs font-normal text-slate-400">
                (avg {filteredMetrics.avg >= 0 ? `+${filteredMetrics.avg.toFixed(1)}` : filteredMetrics.avg.toFixed(1)})
              </span>
            </span>
          </div>
        </div>

        {/* Link to Season Finale Director Grade */}
        <div className="bg-amber-400/5 border border-amber-400/20 rounded-xl px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs">
          <span className="text-slate-300">
            <strong className="text-amber-300">End-of-Season Director Grade Link (20% Weight):</strong> The board scores your 2-season collective OVR delta ({summary.collectiveOvrDelta >= 0 ? `+${summary.collectiveOvrDelta}` : summary.collectiveOvrDelta} OVR) against total fees spent ({formatTransferFee(summary.totalFeesSpent)}).
          </span>
        </div>

        {/* Chart & Filter Toolbar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          {/* Chart Switcher */}
          <div className="inline-flex items-center gap-1 p-1 bg-slate-900 border border-white/10 rounded-lg self-start">
            <button
              type="button"
              onClick={() => {
                sounds.playClick();
                setChartMode('scatter');
              }}
              className={`min-h-10 lg:min-h-8 px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer inline-flex items-center gap-1.5 whitespace-nowrap ${
                chartMode === 'scatter'
                  ? 'bg-amber-400 text-slate-950 font-bold'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <ScatterChart className="w-3.5 h-3.5" />
              <span>Fee vs. OVR Impact</span>
            </button>
            <button
              type="button"
              onClick={() => {
                sounds.playClick();
                setChartMode('season_bars');
              }}
              className={`min-h-10 lg:min-h-8 px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer inline-flex items-center gap-1.5 whitespace-nowrap ${
                chartMode === 'season_bars'
                  ? 'bg-amber-400 text-slate-950 font-bold'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <BarChart3 className="w-3.5 h-3.5" />
              <span>Season Breakdown</span>
            </button>
          </div>

          {/* Season & Status Filters */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex items-center gap-1 p-1 bg-slate-900 border border-white/10 rounded-lg">
              {(
                [
                  { id: 'all', label: '2 Seasons' },
                  { id: 'previous', label: formatSeasonSpan(summary.previousSeason) },
                  { id: 'current', label: formatSeasonSpan(summary.currentSeason) },
                ] as const
              ).map(opt => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => {
                    sounds.playClick();
                    setSeasonFilter(opt.id);
                  }}
                  className={`min-h-10 lg:min-h-8 px-2.5 py-1 text-xs font-mono rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                    seasonFilter === opt.id
                      ? 'bg-white/15 text-white font-bold'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            <div className="inline-flex items-center gap-1 p-1 bg-slate-900 border border-white/10 rounded-lg">
              {(
                [
                  { id: 'all', label: `All (${summary.activeCount})` },
                  { id: 'at_club', label: `At Club (${summary.atClubCount})` },
                  { id: 'departed', label: `Elsewhere (${summary.departedCount})` },
                ] as const
              ).map(opt => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => {
                    sounds.playClick();
                    setStatusFilter(opt.id);
                  }}
                  className={`min-h-10 lg:min-h-8 px-2.5 py-1 text-xs font-mono rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                    statusFilter === opt.id
                      ? 'bg-white/15 text-white font-bold'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Interactive Visual Chart Panel */}
        <div className="bg-slate-900/60 border border-white/10 rounded-xl p-3 sm:p-4 space-y-3">
          {filteredItems.length === 0 ? (
            <div className="py-10 text-center text-xs text-slate-400 font-mono">
              No paid signings match the selected season and status filters.
            </div>
          ) : chartMode === 'scatter' ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
                <span>Fee Paid (£M) vs. OVR Rating Change (Select any point to inspect)</span>
                <div className="flex items-center gap-3 font-mono text-[11px]">
                  <span className="flex items-center gap-1.5 text-emerald-400">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 inline-block" />
                    At Club
                  </span>
                  <span className="flex items-center gap-1.5 text-sky-400">
                    <span className="w-2.5 h-2.5 rounded-full bg-sky-400 inline-block" />
                    Active Elsewhere
                  </span>
                </div>
              </div>

              <div className="w-full overflow-x-auto">
                <svg
                  viewBox={`0 0 ${scatterGeometry.width} ${scatterGeometry.height}`}
                  className="w-full min-w-[460px] h-auto select-none"
                  role="img"
                  aria-label="Scatter plot comparing transfer fees spent against player overall rating change"
                >
                  {/* Horizontal grid lines */}
                  {Array.from(
                    { length: scatterGeometry.yMax - scatterGeometry.yMin + 1 },
                    (_, idx) => scatterGeometry.yMin + idx
                  )
                    .filter(val => {
                      const span = scatterGeometry.yMax - scatterGeometry.yMin;
                      if (span <= 8) return true;
                      return val === 0 || val % 2 === 0;
                    })
                    .map(yVal => {
                      const y = scatterGeometry.yScale(yVal);
                      const isZero = yVal === 0;
                      return (
                        <g key={`y-${yVal}`}>
                          <line
                            x1={scatterGeometry.pad.left}
                            y1={y}
                            x2={scatterGeometry.width - scatterGeometry.pad.right}
                            y2={y}
                            stroke={isZero ? 'rgba(251, 191, 36, 0.45)' : 'rgba(255, 255, 255, 0.06)'}
                            strokeWidth={isZero ? 1.5 : 1}
                            strokeDasharray={isZero ? '4 4' : undefined}
                          />
                          <text
                            x={scatterGeometry.pad.left - 8}
                            y={y + 4}
                            textAnchor="end"
                            fill={isZero ? '#fbbf24' : '#94a3b8'}
                            fontSize="10"
                            fontFamily="JetBrains Mono, monospace"
                          >
                            {yVal > 0 ? `+${yVal}` : yVal}
                          </text>
                        </g>
                      );
                    })}

                  {/* X-axis ticks */}
                  {[0, 0.25, 0.5, 0.75, 1].map((frac, idx) => {
                    const feeVal = scatterGeometry.xMax * frac;
                    const x = scatterGeometry.pad.left + frac * scatterGeometry.plotW;
                    return (
                      <g key={`x-${idx}`}>
                        <line
                          x1={x}
                          y1={scatterGeometry.pad.top}
                          x2={x}
                          y2={scatterGeometry.height - scatterGeometry.pad.bottom}
                          stroke="rgba(255, 255, 255, 0.05)"
                          strokeWidth="1"
                        />
                        <text
                          x={x}
                          y={scatterGeometry.height - 12}
                          textAnchor="middle"
                          fill="#94a3b8"
                          fontSize="10"
                          fontFamily="JetBrains Mono, monospace"
                        >
                          £{feeVal.toFixed(feeVal >= 10 ? 0 : 1)}M
                        </text>
                      </g>
                    );
                  })}

                  {/* Axis Titles */}
                  <text
                    x={14}
                    y={scatterGeometry.pad.top + scatterGeometry.plotH / 2}
                    textAnchor="middle"
                    transform={`rotate(-90 14 ${scatterGeometry.pad.top + scatterGeometry.plotH / 2})`}
                    fill="#64748b"
                    fontSize="10"
                    fontFamily="Plus Jakarta Sans, sans-serif"
                  >
                    OVR Δ
                  </text>

                  {/* Data points */}
                  {filteredItems.map(item => {
                    const cx = scatterGeometry.xScale(item.record.fee);
                    const cy = scatterGeometry.yScale(item.overallDelta);
                    const isSelected = selectedItem?.record.id === item.record.id;
                    const fillColor =
                      item.status === 'at_club'
                        ? item.overallDelta >= 0
                          ? '#34d399'
                          : '#fb7185'
                        : '#38bdf8';

                    return (
                      <g
                        key={item.record.id}
                        className="cursor-pointer"
                        onClick={() => {
                          sounds.playClick();
                          setSelectedId(item.record.id);
                        }}
                      >
                        {isSelected && (
                          <circle
                            cx={cx}
                            cy={cy}
                            r={12}
                            fill="none"
                            stroke="#fbbf24"
                            strokeWidth={2}
                          />
                        )}
                        <circle
                          cx={cx}
                          cy={cy}
                          r={isSelected ? 7 : 5.5}
                          fill={fillColor}
                          stroke="#0f172a"
                          strokeWidth={1.5}
                        />
                        {isSelected && (
                          <text
                            x={Math.min(scatterGeometry.width - 70, Math.max(scatterGeometry.pad.left + 40, cx))}
                            y={cy > scatterGeometry.pad.top + 26 ? cy - 15 : cy + 20}
                            textAnchor="middle"
                            fill="#f8fafc"
                            fontSize="11"
                            fontWeight="700"
                            fontFamily="Plus Jakarta Sans, sans-serif"
                          >
                            {item.record.playerName}
                          </text>
                        )}
                      </g>
                    );
                  })}
                </svg>
              </div>

              {/* Selected Point Readout */}
              {selectedItem && (
                <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-white/10 text-xs">
                  <div className="flex flex-wrap items-center gap-2 min-w-0">
                    <span className="font-bold text-white">{selectedItem.record.playerName}</span>
                    <span className="text-slate-500" aria-hidden="true">·</span>
                    <span className="text-slate-300 font-mono">
                      {selectedItem.record.position} · Signed {formatSeasonSpan(selectedItem.record.season)} Wk{' '}
                      {selectedItem.record.week}
                    </span>
                    <span className="text-slate-500" aria-hidden="true">·</span>
                    <span className="text-slate-400">
                      Now at <strong className="text-slate-200">{selectedItem.currentClubName}</strong>
                    </span>
                  </div>
                  <div className="flex items-center gap-3 font-mono tabular-nums shrink-0">
                    <span className="text-amber-400 font-bold">
                      {formatTransferFee(selectedItem.record.fee)}
                    </span>
                    <span className="text-slate-300">
                      {selectedItem.record.overall} → {selectedItem.currentOverall} OVR
                    </span>
                    {renderDeltaBadge(selectedItem.overallDelta)}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
                <span>Season-by-Season Capital Spent vs. Collective Rating Change</span>
                <div className="flex items-center gap-3 font-mono text-[11px]">
                  <span className="flex items-center gap-1.5 text-amber-400">
                    <span className="w-2.5 h-2.5 rounded-sm bg-amber-400 inline-block" />
                    Fees Spent (£M)
                  </span>
                  <span className="flex items-center gap-1.5 text-emerald-400">
                    <span className="w-2.5 h-2.5 rounded-sm bg-emerald-400 inline-block" />
                    Net OVR Gain / Loss
                  </span>
                </div>
              </div>

              <div className="w-full overflow-x-auto">
                <svg
                  viewBox={`0 0 ${seasonBarGeometry.width} ${seasonBarGeometry.height}`}
                  className="w-full min-w-[440px] h-auto select-none"
                  role="img"
                  aria-label="Bar chart comparing transfer fees spent and collective overall rating change across the last two seasons"
                >
                  <line
                    x1={seasonBarGeometry.pad.left}
                    y1={seasonBarGeometry.height - seasonBarGeometry.pad.bottom}
                    x2={seasonBarGeometry.width - seasonBarGeometry.pad.right}
                    y2={seasonBarGeometry.height - seasonBarGeometry.pad.bottom}
                    stroke="rgba(255, 255, 255, 0.14)"
                    strokeWidth="1"
                  />

                  {seasonBarGeometry.buckets.map((bucket, idx) => {
                    const groupCenter =
                      seasonBarGeometry.pad.left +
                      ((idx + 0.5) / seasonBarGeometry.buckets.length) * seasonBarGeometry.plotW;
                    const barW = 54;
                    const gap = 14;
                    const feeH =
                      bucket.feesSpent > 0
                        ? Math.max(4, (bucket.feesSpent / seasonBarGeometry.maxFee) * seasonBarGeometry.plotH)
                        : 0;
                    const deltaH =
                      bucket.collectiveOvrDelta !== 0
                        ? Math.max(
                            4,
                            (Math.abs(bucket.collectiveOvrDelta) / seasonBarGeometry.maxAbsDelta) *
                              seasonBarGeometry.plotH
                          )
                        : 0;
                    const baseY = seasonBarGeometry.height - seasonBarGeometry.pad.bottom;
                    const feeX = groupCenter - barW - gap / 2;
                    const deltaX = groupCenter + gap / 2;
                    const deltaColor =
                      bucket.collectiveOvrDelta > 0
                        ? '#34d399'
                        : bucket.collectiveOvrDelta < 0
                          ? '#fb7185'
                          : '#64748b';
                    const deltaLabel =
                      bucket.collectiveOvrDelta > 0
                        ? `+${bucket.collectiveOvrDelta} OVR`
                        : `${bucket.collectiveOvrDelta} OVR`;

                    return (
                      <g key={bucket.season}>
                        {/* Fee bar */}
                        <rect
                          x={feeX}
                          y={baseY - feeH}
                          width={barW}
                          height={feeH}
                          rx={4}
                          fill="#fbbf24"
                        />
                        <text
                          x={feeX + barW / 2}
                          y={baseY - feeH - 7}
                          textAnchor="middle"
                          fill="#fcd34d"
                          fontSize="11"
                          fontWeight="700"
                          fontFamily="JetBrains Mono, monospace"
                        >
                          {formatTransferFee(bucket.feesSpent, true)}
                        </text>

                        {/* OVR delta bar */}
                        <rect
                          x={deltaX}
                          y={baseY - deltaH}
                          width={barW}
                          height={deltaH}
                          rx={4}
                          fill={deltaColor}
                        />
                        <text
                          x={deltaX + barW / 2}
                          y={baseY - deltaH - 7}
                          textAnchor="middle"
                          fill={deltaColor}
                          fontSize="11"
                          fontWeight="700"
                          fontFamily="JetBrains Mono, monospace"
                        >
                          {bucket.signingsCount > 0 ? deltaLabel : '0 OVR'}
                        </text>

                        {/* Season label */}
                        <text
                          x={groupCenter}
                          y={baseY + 20}
                          textAnchor="middle"
                          fill="#e2e8f0"
                          fontSize="12"
                          fontWeight="700"
                          fontFamily="JetBrains Mono, monospace"
                        >
                          {bucket.label} ({bucket.signingsCount})
                        </text>
                      </g>
                    );
                  })}
                </svg>
              </div>
            </div>
          )}
        </div>

        {/* Signed Players Ledger */}
        <div className="bg-slate-900/60 border border-white/10 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-white/10 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-xs font-bold text-white uppercase tracking-wider">
              Signed Players Breakdown ({sortedItems.length})
            </h3>
            <span className="text-xs text-slate-400 font-mono">
              Click any row or chart point to highlight
            </span>
          </div>

          {sortedItems.length === 0 ? (
            <div className="p-6 text-center text-xs text-slate-400 font-mono">
              No active paid signings match your current filter.
            </div>
          ) : (
            <>
              {/* Desktop Table */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-white/10 bg-slate-950/60 text-slate-400 font-mono text-[11px] uppercase">
                      <th className="py-2.5 px-3">
                        <button
                          type="button"
                          onClick={() => handleSort('name')}
                          className="inline-flex items-center gap-1 hover:text-white cursor-pointer"
                        >
                          <span>Player</span>
                          <ArrowUpDown className="w-3 h-3" />
                        </button>
                      </th>
                      <th className="py-2.5 px-3">
                        <button
                          type="button"
                          onClick={() => handleSort('season')}
                          className="inline-flex items-center gap-1 hover:text-white cursor-pointer"
                        >
                          <span>Signed</span>
                          <ArrowUpDown className="w-3 h-3" />
                        </button>
                      </th>
                      <th className="py-2.5 px-3 text-right">
                        <button
                          type="button"
                          onClick={() => handleSort('fee')}
                          className="inline-flex items-center justify-end gap-1 hover:text-white cursor-pointer ml-auto"
                        >
                          <span>Fee Paid</span>
                          <ArrowUpDown className="w-3 h-3" />
                        </button>
                      </th>
                      <th className="py-2.5 px-3 text-right">
                        <button
                          type="button"
                          onClick={() => handleSort('currentOverall')}
                          className="inline-flex items-center justify-end gap-1 hover:text-white cursor-pointer ml-auto"
                        >
                          <span>OVR Progression</span>
                          <ArrowUpDown className="w-3 h-3" />
                        </button>
                      </th>
                      <th className="py-2.5 px-3 text-right">
                        <button
                          type="button"
                          onClick={() => handleSort('delta')}
                          className="inline-flex items-center justify-end gap-1 hover:text-white cursor-pointer ml-auto"
                        >
                          <span>Net Δ</span>
                          {sortField === 'delta' ? (
                            sortAsc ? <ArrowUp className="w-3 h-3 text-amber-400" /> : <ArrowDown className="w-3 h-3 text-amber-400" />
                          ) : (
                            <ArrowUpDown className="w-3 h-3" />
                          )}
                        </button>
                      </th>
                      <th className="py-2.5 px-3">Current Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {sortedItems.map(item => {
                      const isSelected = selectedItem?.record.id === item.record.id;
                      return (
                        <tr
                          key={item.record.id}
                          onClick={() => {
                            sounds.playClick();
                            setSelectedId(item.record.id);
                          }}
                          className={`cursor-pointer transition-colors ${
                            isSelected ? 'bg-amber-400/10' : 'hover:bg-white/5'
                          }`}
                        >
                          <td className="py-2.5 px-3">
                            <div className="font-semibold text-white">{item.record.playerName}</div>
                            <div className="text-[11px] text-slate-400 font-mono">
                              {item.record.position} · Age {item.currentAge}
                            </div>
                          </td>
                          <td className="py-2.5 px-3 font-mono text-slate-300 tabular-nums whitespace-nowrap">
                            {formatSeasonSpan(item.record.season)} · Wk {item.record.week}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono font-bold text-amber-400 tabular-nums whitespace-nowrap">
                            {formatTransferFee(item.record.fee)}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono text-slate-200 tabular-nums whitespace-nowrap">
                            <span className="text-slate-400">{item.record.overall}</span>
                            <span className="mx-1.5 text-slate-500">→</span>
                            <span className="font-bold text-white">{item.currentOverall}</span>
                          </td>
                          <td className="py-2.5 px-3 text-right whitespace-nowrap">
                            {renderDeltaBadge(item.overallDelta)}
                          </td>
                          <td className="py-2.5 px-3">
                            <div className="flex items-center gap-2 min-w-0">
                              <span
                                className="w-2 h-2 rounded-full shrink-0"
                                style={{ backgroundColor: item.currentClubColor }}
                              />
                              <span
                                className={`truncate ${
                                  item.status === 'at_club' ? 'text-emerald-300 font-medium' : 'text-sky-300'
                                }`}
                              >
                                {item.status === 'at_club' ? 'At Club' : item.currentClubName}
                              </span>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Mobile Card List */}
              <div className="md:hidden divide-y divide-white/10">
                {sortedItems.map(item => {
                  const isSelected = selectedItem?.record.id === item.record.id;
                  return (
                    <button
                      key={item.record.id}
                      type="button"
                      onClick={() => {
                        sounds.playClick();
                        setSelectedId(item.record.id);
                      }}
                      className={`w-full p-3.5 text-left space-y-2 transition-colors cursor-pointer ${
                        isSelected ? 'bg-amber-400/10' : 'hover:bg-white/5'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="font-bold text-sm text-white truncate">
                            {item.record.playerName}
                          </div>
                          <div className="text-xs text-slate-400 font-mono">
                            {item.record.position} · {formatSeasonSpan(item.record.season)} Wk{' '}
                            {item.record.week} ·{' '}
                            <span className={item.status === 'at_club' ? 'text-emerald-300' : 'text-sky-300'}>
                              {item.status === 'at_club' ? 'At Club' : item.currentClubName}
                            </span>
                          </div>
                        </div>
                        <div className="shrink-0">{renderDeltaBadge(item.overallDelta)}</div>
                      </div>

                      <div className="flex items-center justify-between text-xs font-mono tabular-nums pt-1">
                        <span className="text-amber-400 font-bold">
                          Fee: {formatTransferFee(item.record.fee)}
                        </span>
                        <span className="text-slate-300">
                          OVR: {item.record.overall} → <strong className="text-white">{item.currentOverall}</strong>
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>
    </Modal>
  );
};
