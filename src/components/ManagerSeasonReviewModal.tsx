/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  Trophy,
  TrendingUp,
  TrendingDown,
  Award,
  ArrowLeftRight,
  Calendar,
  Table,
  Star,
} from 'lucide-react';
import { ManagerSeasonRecord } from '../types/game';
import { Modal } from './ui/Modal';
import { sounds } from '../services/soundEffects';

interface ManagerSeasonReviewModalProps {
  record: ManagerSeasonRecord | null;
  onClose: () => void;
}

export const ManagerSeasonReviewModal: React.FC<ManagerSeasonReviewModalProps> = ({
  record,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'table' | 'transfers'>('overview');

  if (!record) return null;

  const { review } = record;
  const tierLabel =
    record.clubTier === 1
      ? 'Premier League'
      : record.clubTier === 2
        ? 'Championship'
        : 'League One';

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      maxWidthClass="max-w-4xl"
      borderClass="border-amber-400/35"
      ariaLabel={`Season Review ${record.seasonYear}/${record.seasonYear + 1}`}
      header={
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <span
              className="w-4 h-4 rounded-full shrink-0 border border-white/20"
              style={{ backgroundColor: record.primaryColor }}
            />
            <div className="min-w-0">
              <span className="text-xs font-bold uppercase tracking-wider text-amber-400 block">
                Season Review · {record.seasonYear}/{record.seasonYear + 1}
              </span>
              <h2 className="text-lg sm:text-xl font-black text-white truncate">
                {record.clubName} ({tierLabel})
              </h2>
              <p className="text-xs text-slate-400 font-mono">
                Age {record.age} · Finish #{record.leaguePosition}/{record.totalTeams} · {record.leaguePoints} pts ({record.won}W-{record.drawn}D-{record.lost}L)
                {record.wasSacked ? ' · Sacked Mid-Season' : ''}
              </p>
            </div>
          </div>
        </div>
      }
      footer={
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => {
              sounds.playClick();
              onClose();
            }}
            className="min-h-11 px-5 py-2.5 bg-amber-400 hover:bg-amber-300 text-slate-950 font-extrabold text-xs rounded-xl cursor-pointer transition-all active:scale-95"
          >
            Close Review
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Trophies & Reputation Summary Strip */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="bg-slate-900/90 border border-white/10 rounded-xl p-3.5">
            <span className="text-[11px] uppercase tracking-wider text-slate-400 block mb-1">
              League Finish
            </span>
            <div className="flex items-baseline justify-between">
              <span className="text-2xl font-black font-mono text-white tabular-nums">
                #{record.leaguePosition}
              </span>
              <span className="text-xs font-mono text-amber-400 font-bold tabular-nums">
                {record.leaguePoints} pts
              </span>
            </div>
          </div>

          <div className="bg-slate-900/90 border border-white/10 rounded-xl p-3.5">
            <span className="text-[11px] uppercase tracking-wider text-slate-400 block mb-1">
              Reputation Change
            </span>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-black font-mono text-white tabular-nums">
                {review.reputationAfter}
              </span>
              <span
                className={`text-xs font-mono font-bold tabular-nums inline-flex items-center gap-1 ${
                  review.reputationDelta > 0
                    ? 'text-emerald-400'
                    : review.reputationDelta < 0
                      ? 'text-rose-400'
                      : 'text-slate-400'
                }`}
              >
                {review.reputationDelta > 0 ? (
                  <TrendingUp className="w-3.5 h-3.5" />
                ) : review.reputationDelta < 0 ? (
                  <TrendingDown className="w-3.5 h-3.5" />
                ) : null}
                {review.reputationDelta >= 0 ? `+${review.reputationDelta}` : review.reputationDelta} (from {review.reputationBefore})
              </span>
            </div>
          </div>

          <div className="bg-slate-900/90 border border-white/10 rounded-xl p-3.5">
            <span className="text-[11px] uppercase tracking-wider text-slate-400 block mb-1">
              Honours Won
            </span>
            {record.trophiesWon.length > 0 ? (
              <div className="flex items-center gap-1.5 text-amber-400 font-bold text-sm">
                <Trophy className="w-4 h-4 shrink-0" />
                <span className="truncate">{record.trophiesWon.join(', ')}</span>
              </div>
            ) : (
              <span className="text-xs font-semibold text-slate-400">No major silverware</span>
            )}
          </div>
        </div>

        {/* Sub-tabs */}
        <div className="flex items-center gap-2 border-b border-white/10 pb-2.5 overflow-x-auto">
          <button
            type="button"
            onClick={() => {
              sounds.playClick();
              setActiveTab('overview');
            }}
            className={`px-3.5 py-2 min-h-11 sm:min-h-0 rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
              activeTab === 'overview'
                ? 'bg-amber-400 text-slate-950'
                : 'bg-slate-900 text-slate-300 hover:text-white border border-white/10'
            }`}
          >
            <Award className="w-3.5 h-3.5" />
            <span>Highlights & Results</span>
          </button>

          <button
            type="button"
            onClick={() => {
              sounds.playClick();
              setActiveTab('table');
            }}
            className={`px-3.5 py-2 min-h-11 sm:min-h-0 rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
              activeTab === 'table'
                ? 'bg-amber-400 text-slate-950'
                : 'bg-slate-900 text-slate-300 hover:text-white border border-white/10'
            }`}
          >
            <Table className="w-3.5 h-3.5" />
            <span>Final Table ({review.finalTable.length})</span>
          </button>

          <button
            type="button"
            onClick={() => {
              sounds.playClick();
              setActiveTab('transfers');
            }}
            className={`px-3.5 py-2 min-h-11 sm:min-h-0 rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
              activeTab === 'transfers'
                ? 'bg-amber-400 text-slate-950'
                : 'bg-slate-900 text-slate-300 hover:text-white border border-white/10'
            }`}
          >
            <ArrowLeftRight className="w-3.5 h-3.5" />
            <span>Director Transfers ({review.directorTransfers.length})</span>
          </button>
        </div>

        {activeTab === 'overview' && (
          <div className="space-y-4">
            {/* Board Verdict */}
            <div className="bg-slate-900/75 border border-white/10 rounded-xl p-3.5">
              <span className="text-[11px] font-bold uppercase tracking-wider text-amber-400 block mb-1">
                Boardroom Review
              </span>
              <p className="text-xs text-slate-200 leading-relaxed">{review.boardVerdict}</p>
              {review.reputationReasons.length > 0 && (
                <ul className="mt-2.5 pt-2.5 border-t border-white/10 grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-[11px] font-mono text-slate-300">
                  {review.reputationReasons.map((reason, idx) => (
                    <li key={idx} className="truncate">• {reason}</li>
                  ))}
                </ul>
              )}
            </div>

            {/* Best / Worst / Top Scorer */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="bg-emerald-500/5 border border-emerald-500/25 rounded-xl p-3.5 space-y-1">
                <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-400 block">
                  Best Moment
                </span>
                <p className="text-xs text-slate-200 leading-relaxed">{review.bestMoment}</p>
              </div>

              <div className="bg-rose-500/5 border border-rose-500/25 rounded-xl p-3.5 space-y-1">
                <span className="text-[11px] font-bold uppercase tracking-wider text-rose-400 block">
                  Worst Moment
                </span>
                <p className="text-xs text-slate-200 leading-relaxed">{review.worstMoment}</p>
              </div>

              <div className="bg-amber-400/5 border border-amber-400/25 rounded-xl p-3.5 space-y-1">
                <span className="text-[11px] font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1">
                  <Star className="w-3.5 h-3.5" />
                  <span>Top Scorer</span>
                </span>
                {review.topScorer ? (
                  <div className="text-xs text-slate-200">
                    <p className="font-bold text-white">{review.topScorer.name}</p>
                    <p className="font-mono text-slate-300 mt-0.5 tabular-nums">
                      {review.topScorer.goals} goals · {review.topScorer.assists} assists · {review.topScorer.appearances} apps
                    </p>
                  </div>
                ) : (
                  <p className="text-xs text-slate-400">No goalscorer data recorded.</p>
                )}
              </div>
            </div>

            {/* Key Results */}
            <div className="space-y-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-amber-400" />
                <span>Key Results</span>
              </h3>
              {review.keyResults.length === 0 ? (
                <p className="text-xs text-slate-400 bg-slate-900/60 border border-white/10 rounded-xl p-3">
                  No key fixtures recorded for this tenure.
                </p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {review.keyResults.map(res => (
                    <div
                      key={`${res.week}-${res.opponentId}`}
                      className="bg-slate-900/80 border border-white/10 rounded-xl p-3 flex items-center justify-between gap-2"
                    >
                      <div className="min-w-0">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400 block">
                          {res.label} · Week {res.week} ({res.isHome ? 'H' : 'A'})
                        </span>
                        <span className="text-xs font-bold text-white truncate block">
                          vs {res.opponentName}
                        </span>
                      </div>
                      <span
                        className={`px-2.5 py-1 rounded-lg font-mono font-extrabold text-xs shrink-0 tabular-nums ${
                          res.outcome === 'W'
                            ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                            : res.outcome === 'L'
                              ? 'bg-rose-500/15 text-rose-300 border border-rose-500/30'
                              : 'bg-slate-800 text-slate-300 border border-white/10'
                        }`}
                      >
                        {res.outcome} {res.goalsFor}-{res.goalsAgainst}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'table' && (
          <div className="bg-slate-900/70 border border-white/10 rounded-xl overflow-hidden">
            <div className="overflow-x-auto max-h-96">
              <table className="w-full text-left text-xs font-mono">
                <thead className="bg-slate-950 text-[10px] uppercase text-slate-400 sticky top-0">
                  <tr>
                    <th className="py-2.5 px-3">#</th>
                    <th className="py-2.5 px-3">Club</th>
                    <th className="py-2.5 px-2 text-center">P</th>
                    <th className="py-2.5 px-2 text-center">W</th>
                    <th className="py-2.5 px-2 text-center">D</th>
                    <th className="py-2.5 px-2 text-center">L</th>
                    <th className="py-2.5 px-2 text-center">GD</th>
                    <th className="py-2.5 px-3 text-right">Pts</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {review.finalTable.map((row, index) => {
                    const isMyClub = row.clubId === record.clubId;
                    return (
                      <tr
                        key={row.clubId}
                        className={isMyClub ? 'bg-amber-400/15 font-bold text-white' : 'text-slate-300'}
                      >
                        <td className="py-2 px-3 tabular-nums">{index + 1}</td>
                        <td className="py-2 px-3 font-sans">
                          <div className="flex items-center gap-2">
                            <span
                              className="w-2.5 h-2.5 rounded-full shrink-0"
                              style={{ backgroundColor: row.primaryColor }}
                            />
                            <span className={isMyClub ? 'text-amber-300 font-bold' : ''}>
                              {row.name}
                            </span>
                          </div>
                        </td>
                        <td className="py-2 px-2 text-center tabular-nums">{row.played}</td>
                        <td className="py-2 px-2 text-center tabular-nums">{row.won}</td>
                        <td className="py-2 px-2 text-center tabular-nums">{row.drawn}</td>
                        <td className="py-2 px-2 text-center tabular-nums">{row.lost}</td>
                        <td className="py-2 px-2 text-center tabular-nums">
                          {row.goalDifference >= 0 ? `+${row.goalDifference}` : row.goalDifference}
                        </td>
                        <td className="py-2 px-3 text-right font-extrabold text-white tabular-nums">
                          {row.points}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'transfers' && (
          <div className="space-y-2">
            {review.directorTransfers.length === 0 ? (
              <div className="bg-slate-900/70 border border-white/10 rounded-xl p-6 text-center text-xs text-slate-400">
                No director or club transfer business recorded in this season.
              </div>
            ) : (
              <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                {review.directorTransfers.map(tr => (
                  <div
                    key={tr.id}
                    className="bg-slate-900/80 border border-white/10 rounded-xl p-3 flex flex-wrap items-center justify-between gap-2 text-xs"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded bg-slate-800 text-amber-300 font-mono font-bold uppercase text-[10px]">
                          {tr.type}
                        </span>
                        <span className="font-bold text-white truncate">{tr.playerName}</span>
                        <span className="text-slate-400 font-mono">
                          {tr.position} · {tr.overall} OVR
                        </span>
                      </div>
                      {tr.note && (
                        <p className="text-[11px] text-slate-400 mt-1">{tr.note}</p>
                      )}
                    </div>
                    <div className="text-right font-mono shrink-0">
                      <span className="font-bold text-emerald-400 block tabular-nums">
                        {tr.fee > 0 ? `£${(tr.fee / 1000000).toFixed(2)}M` : 'FREE'}
                      </span>
                      <span className="text-[11px] text-slate-400 tabular-nums">
                        Wk {tr.week} · £{(tr.wage / 1000).toFixed(0)}k/wk
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
};
