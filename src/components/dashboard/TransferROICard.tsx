/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { BarChart3, ArrowUpRight, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { TransferROISummary, formatTransferFee } from '../../utils/transferRoi';
import { sounds } from '../../services/soundEffects';

interface TransferROICardProps {
  summary: TransferROISummary;
  onInspect: () => void;
  onOpenTransfers: () => void;
}

export const TransferROICard: React.FC<TransferROICardProps> = ({
  summary,
  onInspect,
  onOpenTransfers,
}) => {
  const {
    previousSeason,
    currentSeason,
    totalFeesSpent,
    collectiveOvrDelta,
    costPerOvrPoint,
    activeCount,
    departedCount,
    bySeason,
  } = summary;

  const maxFee = Math.max(1, ...bySeason.map(b => b.feesSpent));
  const maxAbsDelta = Math.max(1, ...bySeason.map(b => Math.abs(b.collectiveOvrDelta)));

  const deltaTone =
    collectiveOvrDelta > 0
      ? 'text-emerald-400'
      : collectiveOvrDelta < 0
        ? 'text-rose-400'
        : 'text-slate-300';

  const DeltaIcon =
    collectiveOvrDelta > 0 ? TrendingUp : collectiveOvrDelta < 0 ? TrendingDown : Minus;

  const formattedDelta =
    collectiveOvrDelta > 0 ? `+${collectiveOvrDelta}` : `${collectiveOvrDelta}`;

  return (
    <section
      aria-label="Transfer ROI Analysis"
      className="bg-[#111827] border border-white/10 rounded-xl p-4 sm:p-5 flex flex-col justify-between h-full"
    >
      <div>
        {/* Card Header */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-3 mb-4">
          <div className="flex items-center gap-2 min-w-0">
            <BarChart3 className="w-4 h-4 text-amber-400 shrink-0" />
            <h3 className="text-xs font-bold text-white uppercase tracking-wider whitespace-nowrap">
              Transfer ROI
            </h3>
          </div>
          <span className="text-xs text-slate-400 font-mono whitespace-nowrap">
            {previousSeason}–{currentSeason} · {activeCount}{' '}
            {activeCount === 1 ? 'Paid Signing' : 'Paid Signings'}
          </span>
        </div>

        {activeCount === 0 ? (
          <div className="py-4 flex flex-col items-start justify-between gap-3">
            <div className="space-y-1">
              <p className="text-xs font-semibold text-slate-200">
                No Paid Signings in Last Two Seasons
              </p>
              <p className="text-xs text-slate-400 leading-relaxed max-w-[44ch]">
                Complete a paid transfer signing to track fees spent against overall rating progression across the league.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                sounds.playClick();
                onOpenTransfers();
              }}
              className="min-h-11 lg:min-h-9 px-3.5 py-2 bg-amber-400/10 hover:bg-amber-400/20 border border-amber-400/30 text-amber-300 text-xs font-semibold rounded-lg transition-colors cursor-pointer inline-flex items-center gap-1.5 whitespace-nowrap"
            >
              <span>Open Transfer Hub</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Primary Comparison Metrics */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <span className="text-xs sm:text-[11px] text-slate-400 uppercase tracking-wider block mb-1">
                  Fees Spent
                </span>
                <span className="text-lg lg:text-xl font-bold font-mono tabular-nums text-amber-400 block">
                  {formatTransferFee(totalFeesSpent)}
                </span>
                <span className="text-xs sm:text-[10px] text-slate-500 block mt-0.5">
                  2-season cash outlay
                </span>
              </div>

              <div>
                <span className="text-xs sm:text-[11px] text-slate-400 uppercase tracking-wider block mb-1">
                  Collective OVR Δ
                </span>
                <div className={`text-lg lg:text-xl font-bold font-mono tabular-nums flex items-center gap-1.5 ${deltaTone}`}>
                  <DeltaIcon className="w-4 h-4 shrink-0" />
                  <span>{formattedDelta} OVR</span>
                </div>
                <span className="text-xs sm:text-[10px] text-slate-400 font-mono tabular-nums block mt-0.5">
                  {costPerOvrPoint !== null
                    ? `${formatTransferFee(costPerOvrPoint)} / +1 OVR`
                    : collectiveOvrDelta < 0
                      ? 'Net rating depreciation'
                      : 'Neutral rating change'}
                </span>
              </div>
            </div>

            {/* Compact 2-Season Visual Comparison Bars */}
            <div className="bg-slate-900/60 border border-white/5 rounded-lg p-2.5 space-y-2">
              <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono">
                <span>Season Spend vs. OVR Δ</span>
                {departedCount > 0 && (
                  <span className="text-sky-400">{departedCount} tracked elsewhere</span>
                )}
              </div>

              <div className="space-y-2">
                {bySeason.map(bucket => {
                  const feeWidth = bucket.feesSpent > 0 ? Math.max(8, Math.round((bucket.feesSpent / maxFee) * 100)) : 0;
                  const deltaWidth =
                    bucket.collectiveOvrDelta !== 0
                      ? Math.max(8, Math.round((Math.abs(bucket.collectiveOvrDelta) / maxAbsDelta) * 100))
                      : 0;
                  const bucketDeltaStr =
                    bucket.collectiveOvrDelta > 0
                      ? `+${bucket.collectiveOvrDelta}`
                      : `${bucket.collectiveOvrDelta}`;

                  return (
                    <div key={bucket.season} className="grid grid-cols-12 items-center gap-2 text-[11px] font-mono">
                      <span className="col-span-3 text-slate-300 font-semibold tabular-nums truncate">
                        {bucket.label}
                      </span>

                      {/* Dual mini progress bars */}
                      <div className="col-span-5 space-y-1">
                        <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-amber-400 rounded-full transition-all duration-300"
                            style={{ width: `${feeWidth}%` }}
                          />
                        </div>
                        <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-300 ${
                              bucket.collectiveOvrDelta > 0
                                ? 'bg-emerald-400'
                                : bucket.collectiveOvrDelta < 0
                                  ? 'bg-rose-400'
                                  : 'bg-slate-600'
                            }`}
                            style={{ width: `${deltaWidth}%` }}
                          />
                        </div>
                      </div>

                      <div className="col-span-4 text-right tabular-nums leading-tight">
                        <span className="text-amber-300 block">
                          {bucket.feesSpent > 0 ? formatTransferFee(bucket.feesSpent, true) : '£0'}
                        </span>
                        <span
                          className={`block ${
                            bucket.collectiveOvrDelta > 0
                              ? 'text-emerald-400'
                              : bucket.collectiveOvrDelta < 0
                                ? 'text-rose-400'
                                : 'text-slate-500'
                          }`}
                        >
                          {bucket.signingsCount > 0 ? `${bucketDeltaStr} OVR` : '—'}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>

      {activeCount > 0 && (
        <div className="border-t border-white/10 pt-3 mt-4 flex items-center justify-between gap-2">
          <span className="text-xs sm:text-[11px] text-slate-400 font-mono tabular-nums">
            Avg {summary.avgOvrDelta >= 0 ? `+${summary.avgOvrDelta.toFixed(1)}` : summary.avgOvrDelta.toFixed(1)} OVR / signing
          </span>
          <button
            type="button"
            onClick={() => {
              sounds.playClick();
              onInspect();
            }}
            className="min-h-11 lg:min-h-0 px-2.5 py-1 text-xs font-semibold text-amber-400 hover:text-amber-300 hover:bg-amber-400/10 rounded-lg transition-colors cursor-pointer inline-flex items-center gap-1 whitespace-nowrap shrink-0"
          >
            <span>Inspect ROI</span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </section>
  );
};
