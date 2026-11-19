/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo, useState } from 'react';
import { Manager, ManagerMilestoneType } from '../types/game';
import { Award, Briefcase, Flame, TrendingDown, TrendingUp, Trophy, UserX } from 'lucide-react';
import { getManagerCareerStats, getManagerHistory } from '../services/managerService';

interface ManagerHistoryPanelProps {
  manager: Manager;
}

type HistoryFilter = 'all' | 'honours' | 'milestones' | 'moves';

function getMilestoneMeta(type: ManagerMilestoneType): {
  label: string;
  toneClass: string;
  Icon: React.ComponentType<{ className?: string }>;
} {
  switch (type) {
    case 'league_title':
      return { label: 'League Title', toneClass: 'text-amber-400', Icon: Trophy };
    case 'promotion':
      return { label: 'Promotion', toneClass: 'text-emerald-400', Icon: TrendingUp };
    case 'relegation':
      return { label: 'Relegation', toneClass: 'text-rose-400', Icon: TrendingDown };
    case 'wins_milestone':
      return { label: 'Win Milestone', toneClass: 'text-emerald-400', Icon: Award };
    case 'matches_milestone':
      return { label: 'Appearance Milestone', toneClass: 'text-blue-400', Icon: Flame };
    case 'sacked':
      return { label: 'Dismissal', toneClass: 'text-rose-400', Icon: UserX };
    case 'poached':
      return { label: 'Poached', toneClass: 'text-amber-300', Icon: Briefcase };
    case 'appointed':
    default:
      return { label: 'Appointment', toneClass: 'text-slate-200', Icon: Briefcase };
  }
}

export const ManagerHistoryPanel: React.FC<ManagerHistoryPanelProps> = ({ manager }) => {
  const [filter, setFilter] = useState<HistoryFilter>('all');
  const stats = useMemo(() => getManagerCareerStats(manager), [manager]);
  const history = useMemo(() => getManagerHistory(manager), [manager]);

  const winRate =
    stats.matchesManaged > 0 ? Math.round((stats.wins / stats.matchesManaged) * 100) : 0;

  const filteredHistory = useMemo(() => {
    if (filter === 'all') return history;
    if (filter === 'honours') {
      return history.filter(e => e.type === 'league_title' || e.type === 'promotion');
    }
    if (filter === 'milestones') {
      return history.filter(e => e.type === 'wins_milestone' || e.type === 'matches_milestone');
    }
    return history.filter(
      e => e.type === 'appointed' || e.type === 'poached' || e.type === 'sacked' || e.type === 'relegation'
    );
  }, [history, filter]);

  return (
    <div className="space-y-4">
      {/* Persistent Career Record Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 bg-slate-900/70 border border-white/10 rounded-xl p-4">
        <div>
          <span className="text-[11px] text-slate-400 block">Matches</span>
          <span className="text-base font-bold font-mono tabular-nums text-white">
            {stats.matchesManaged}
          </span>
        </div>
        <div>
          <span className="text-[11px] text-slate-400 block">W / D / L</span>
          <span className="text-base font-bold font-mono tabular-nums text-white">
            {stats.wins}-{stats.draws}-{stats.losses}
          </span>
        </div>
        <div>
          <span className="text-[11px] text-slate-400 block">Win Rate</span>
          <span className="text-base font-bold font-mono tabular-nums text-emerald-400">
            {winRate}%
          </span>
        </div>
        <div>
          <span className="text-[11px] text-slate-400 block">League Titles</span>
          <span className="text-base font-bold font-mono tabular-nums text-amber-400">
            {stats.titlesWon}
          </span>
        </div>
        <div>
          <span className="text-[11px] text-slate-400 block">Promotions</span>
          <span className="text-base font-bold font-mono tabular-nums text-emerald-400">
            {stats.promotionsWon}
          </span>
        </div>
        <div>
          <span className="text-[11px] text-slate-400 block">Times Sacked</span>
          <span className="text-base font-bold font-mono tabular-nums text-rose-400">
            {stats.timesSacked}
          </span>
        </div>
      </div>

      {/* Category Filter */}
      {history.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs text-slate-400">
            Logged Milestones:{' '}
            <strong className="font-mono tabular-nums text-white">{filteredHistory.length}</strong>
          </span>
          <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-900 border border-white/10 rounded-lg">
            {(
              [
                { id: 'all', label: 'All' },
                { id: 'honours', label: 'Honours' },
                { id: 'milestones', label: 'Win & Match' },
                { id: 'moves', label: 'Moves & Sacks' },
              ] as const
            ).map(tab => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setFilter(tab.id)}
                className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  filter === tab.id
                    ? 'bg-amber-400 text-slate-950 font-bold'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Milestone Log */}
      {filteredHistory.length === 0 ? (
        <div className="text-center py-8 bg-slate-900/40 rounded-xl border border-dashed border-white/10 space-y-1.5 px-4">
          <p className="text-xs font-semibold text-slate-300">
            {history.length === 0
              ? `No career milestones logged yet for ${manager.name}`
              : 'No milestones match this category filter'}
          </p>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            {history.length === 0
              ? 'League titles, promotions, win milestones (25, 50, 100+), appointments, and sackings are recorded automatically as seasons progress.'
              : 'Switch back to All to inspect the full career timeline.'}
          </p>
        </div>
      ) : (
        <div className="divide-y divide-white/10 border border-white/10 rounded-xl bg-slate-900/50">
          {filteredHistory.map(entry => {
            const { label, toneClass, Icon } = getMilestoneMeta(entry.type);
            return (
              <div key={entry.id} className="p-3.5 sm:p-4 flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 min-w-0">
                  <Icon className={`w-4 h-4 shrink-0 mt-0.5 ${toneClass}`} />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-slate-400">
                      <span className={`font-semibold ${toneClass}`}>{label}</span>
                      <span aria-hidden="true">·</span>
                      <span>{entry.clubName}</span>
                    </div>
                    <h4 className="text-xs sm:text-sm font-bold text-white mt-0.5">
                      {entry.title}
                    </h4>
                    <p className="text-xs text-slate-400 mt-0.5 leading-relaxed max-w-[75ch]">
                      {entry.detail}
                    </p>
                  </div>
                </div>
                <span className="text-[11px] font-mono tabular-nums text-slate-400 whitespace-nowrap shrink-0">
                  {entry.season}/{(entry.season + 1).toString().slice(-2)} · Wk {entry.week}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
