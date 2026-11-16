/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo } from 'react';
import { Club, Director, Manager, DelegationMatrix, TransferRecord } from '../types/game';
import { Sliders, AlertTriangle, Flame, Info, History, ArrowRightLeft } from 'lucide-react';
import { sounds } from '../services/soundEffects';

interface ResponsibilitiesViewProps {
  club: Club;
  allClubs?: Club[];
  manager: Manager | undefined;
  director: Director;
  delegation: DelegationMatrix;
  transferHistory?: TransferRecord[];
  onUpdateDelegation: (matrix: DelegationMatrix) => void;
}

export const ResponsibilitiesView: React.FC<ResponsibilitiesViewProps> = ({
  club,
  allClubs = [],
  manager,
  delegation,
  transferHistory = [],
  onUpdateDelegation,
}) => {
  const updateMatrix = (key: keyof DelegationMatrix, val: string) => {
    sounds.playClick();
    onUpdateDelegation({
      ...delegation,
      [key]: val,
    });
  };

  const clubNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of allClubs) {
      map.set(c.id, c.name);
    }
    map.set(club.id, club.name);
    return map;
  }, [allClubs, club.id, club.name]);

  const recentManagerDecisions = useMemo(() => {
    return transferHistory
      .filter(
        r =>
          (r.initiatedBy === 'manager' || r.initiatedBy === 'shared') &&
          (r.toClubId === club.id || r.fromClubId === club.id)
      )
      .slice(0, 5);
  }, [transferHistory, club.id]);

  const getSigningsExplanation = () => {
    if (delegation.transferSignings === 'director') {
      return 'You decide and finalize every signing yourself. The Head Coach never submits bids on his own, and no trust penalties apply.';
    }
    if (delegation.transferSignings === 'shared') {
      return 'During open windows (Weeks 1–6 & 20–24), the Head Coach submits up to 3 Transfer Proposals (3-week expiry) to Transfers > Proposals (+2 Trust if approved, -3 if rejected). Signing a player he objects to yourself costs -10 Trust (+1 if he agrees).';
    }
    return 'During open windows (Weeks 1–6 & 20–24), the Head Coach independently signs up to 5 players per season within board, budget, wage, and 25-man rules (+1 Trust each). Overriding him with your own signing costs -20 Trust.';
  };

  const getSalesExplanation = () => {
    if (delegation.transferSales === 'director') {
      return 'You control all outgoing sales and releases. The Head Coach never moves players out or objects to your sales.';
    }
    if (delegation.transferSales === 'shared') {
      return 'During open windows (Weeks 1–6 & 20–24), the Head Coach proposes surplus sales (never starters or below minimum depth) to Transfers > Proposals. Selling a starter or weakening depth yourself requires forcing it through (-10 Trust; +1 if he agrees).';
    }
    return 'During open windows (Weeks 1–6 & 20–24), the Head Coach independently sells surplus or unhappy non-starters (up to 5 per season, never starting XI or below minimum positional depth). Overriding him by selling a player yourself costs -15 Trust.';
  };

  return (
    <div className="space-y-6">
      
      {/* Header */}
      <div className="bg-[#111827] border border-white/10 rounded-2xl p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold text-amber-400 uppercase tracking-wider mb-1">
              <Sliders className="w-4 h-4" />
              <span>Operational Governance Matrix</span>
            </div>
            <h1 className="text-2xl lg:text-3xl font-extrabold text-white tracking-tight">
              Responsibilities & Delegation Matrix
            </h1>
            <p className="text-slate-400 text-xs mt-1">
              Configure the balance of sporting power between the Sporting Director and the Head Coach.
            </p>
          </div>
          
          {manager && (
            <div className="flex items-center gap-3">
              <div className="px-4 py-2 bg-slate-900 border border-white/10 rounded-xl text-right">
                <span className="text-xs sm:text-[10px] text-slate-400 uppercase block">Head Coach Trust</span>
                <span className={`text-lg font-bold font-mono ${
                  manager.trustInDirector > 70 ? 'text-emerald-400' : manager.trustInDirector > 40 ? 'text-amber-400' : 'text-rose-500'
                }`}>
                  {manager.trustInDirector}%
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Warning / Rule Banner: Going behind the Manager's back */}
      <div className="bg-amber-400/5 border border-amber-400/20 rounded-xl p-4 flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
        <div className="text-xs space-y-1 max-w-[75ch]">
          <strong className="text-amber-300 font-bold block">
            The Golden Rule of Sporting Directorship:
          </strong>
          <p className="text-slate-300 leading-relaxed">
            If you set signings or sales to <strong>Manager Control</strong> and bypass the Head Coach, overriding him costs{' '}
            <span className="text-rose-400 font-semibold font-mono">-20 Trust</span> on signings and{' '}
            <span className="text-rose-400 font-semibold font-mono">-15 Trust</span> on sales. In{' '}
            <strong>Shared Consensus</strong>, forcing through a contested move costs{' '}
            <span className="text-rose-400 font-semibold font-mono">-10 Trust</span>, while rejecting a proposal costs{' '}
            <span className="text-rose-400 font-semibold font-mono">-3 Trust</span>.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left 2 Cols: The Delegation Table */}
        <div className="lg:col-span-2 bg-[#111827] border border-white/10 rounded-xl p-4 sm:p-6 space-y-6">
          <div className="border-b border-white/10 pb-3">
            <h3 className="text-xs font-bold text-white uppercase tracking-wider">
              Departmental Authority Breakdown
            </h3>
            <span className="text-xs sm:text-[11px] text-slate-400">
              Select who holds primary decision-making authority for each operational duty.
            </span>
          </div>

          <div className="space-y-5">
            
            {/* 1. First Team Signings */}
            <div className="border-b border-white/5 pb-4 space-y-2.5">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-white block">
                    First-Team Incoming Transfers
                  </span>
                  <span className="text-xs sm:text-[11px] text-slate-400">
                    Identifying targets, submitting bids, and finalizing incoming agreements.
                  </span>
                </div>
              </div>

              <div className="flex flex-col divide-y divide-white/10 rounded-xl border border-white/10 overflow-hidden sm:grid sm:grid-cols-3 sm:gap-2 sm:divide-y-0 sm:border-0 sm:rounded-none sm:overflow-visible">
                {[
                  { id: 'director', label: 'Director Exclusive', sub: 'You decide all signings' },
                  { id: 'shared', label: 'Shared Consensus', sub: 'Proposals & mutual approval' },
                  { id: 'manager', label: 'Manager Control', sub: 'Head Coach signs targets' },
                ].map(opt => (
                  <button
                    key={opt.id}
                    type="button"
                    aria-pressed={delegation.transferSignings === opt.id}
                    onClick={() => updateMatrix('transferSignings', opt.id)}
                    className={`w-full p-3 min-h-11 lg:min-h-0 sm:rounded-lg sm:border text-left cursor-pointer transition-all active:scale-[0.99] ${
                      delegation.transferSignings === opt.id
                        ? 'bg-amber-400/15 sm:bg-amber-400/10 sm:border-amber-400 text-amber-300 font-bold'
                        : 'bg-slate-900/60 sm:border-white/5 text-slate-400 hover:border-white/20'
                    }`}
                  >
                    <span className="text-xs block">{opt.label}</span>
                    <span className="text-xs sm:text-[10px] text-slate-500 font-normal block mt-0.5">{opt.sub}</span>
                  </button>
                ))}
              </div>

              <div className="bg-slate-900/70 border border-white/5 rounded-lg px-3 py-2 flex items-start gap-2 text-xs text-slate-300 leading-relaxed">
                <Info className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                <span>{getSigningsExplanation()}</span>
              </div>
            </div>

            {/* 2. First Team Sales */}
            <div className="border-b border-white/5 pb-4 space-y-2.5">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-white block">
                    First-Team Outgoings & Sales
                  </span>
                  <span className="text-xs sm:text-[11px] text-slate-400">
                    Sanctioning departures, surplus sales, and protective squad rules.
                  </span>
                </div>
              </div>

              <div className="flex flex-col divide-y divide-white/10 rounded-xl border border-white/10 overflow-hidden sm:grid sm:grid-cols-3 sm:gap-2 sm:divide-y-0 sm:border-0 sm:rounded-none sm:overflow-visible">
                {[
                  { id: 'director', label: 'Director Exclusive', sub: 'You cash in on players' },
                  { id: 'shared', label: 'Shared Consensus', sub: 'Proposals & depth veto' },
                  { id: 'manager', label: 'Manager Control', sub: 'Coach sells surplus players' },
                ].map(opt => (
                  <button
                    key={opt.id}
                    type="button"
                    aria-pressed={delegation.transferSales === opt.id}
                    onClick={() => updateMatrix('transferSales', opt.id)}
                    className={`w-full p-3 min-h-11 lg:min-h-0 sm:rounded-lg sm:border text-left cursor-pointer transition-all active:scale-[0.99] ${
                      delegation.transferSales === opt.id
                        ? 'bg-amber-400/15 sm:bg-amber-400/10 sm:border-amber-400 text-amber-300 font-bold'
                        : 'bg-slate-900/60 sm:border-white/5 text-slate-400 hover:border-white/20'
                    }`}
                  >
                    <span className="text-xs block">{opt.label}</span>
                    <span className="text-xs sm:text-[10px] text-slate-500 font-normal block mt-0.5">{opt.sub}</span>
                  </button>
                ))}
              </div>

              <div className="bg-slate-900/70 border border-white/5 rounded-lg px-3 py-2 flex items-start gap-2 text-xs text-slate-300 leading-relaxed">
                <Info className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                <span>{getSalesExplanation()}</span>
              </div>
            </div>

            {/* 3. Contract Renewals */}
            <div className="border-b border-white/5 pb-4 space-y-2.5">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-white block">
                    Contract Renewals & Wage Negotiations
                  </span>
                  <span className="text-xs sm:text-[11px] text-slate-400">
                    Negotiating wage tiers, release clauses, and renewal lengths.
                  </span>
                </div>
              </div>

              <div className="flex flex-col divide-y divide-white/10 rounded-xl border border-white/10 overflow-hidden sm:grid sm:grid-cols-2 sm:gap-2 sm:divide-y-0 sm:border-0 sm:rounded-none sm:overflow-visible">
                {[
                  { id: 'director', label: 'Sporting Director', sub: 'Disciplined wage structure' },
                  { id: 'manager', label: 'Head Coach Led', sub: 'Coach rewards his favorites' },
                ].map(opt => (
                  <button
                    key={opt.id}
                    type="button"
                    aria-pressed={delegation.contractRenewals === opt.id}
                    onClick={() => updateMatrix('contractRenewals', opt.id)}
                    className={`w-full p-3 min-h-11 lg:min-h-0 sm:rounded-lg sm:border text-left cursor-pointer transition-all active:scale-[0.99] ${
                      delegation.contractRenewals === opt.id
                        ? 'bg-amber-400/15 sm:bg-amber-400/10 sm:border-amber-400 text-amber-300 font-bold'
                        : 'bg-slate-900/60 sm:border-white/5 text-slate-400 hover:border-white/20'
                    }`}
                  >
                    <span className="text-xs block">{opt.label}</span>
                    <span className="text-xs sm:text-[10px] text-slate-500 font-normal block mt-0.5">{opt.sub}</span>
                  </button>
                ))}
              </div>

              <div className="bg-slate-900/70 border border-white/5 rounded-lg px-3 py-2 flex items-start gap-2 text-xs text-slate-400 leading-relaxed">
                <Info className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                <span>
                  {delegation.contractRenewals === 'director'
                    ? 'You approve every contract extension and wage bump directly from the Squad screen.'
                    : 'Your preference is saved for Coach-led renewals; you can still negotiate extensions manually in Squad.'}
                </span>
              </div>
            </div>

            {/* 4. Academy Promotions */}
            <div className="border-b border-white/5 pb-4 space-y-2.5">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-white block">
                    Youth Academy Promotions
                  </span>
                  <span className="text-xs sm:text-[11px] text-slate-400">
                    Promoting academy graduates directly to first-team training.
                  </span>
                </div>
              </div>

              <div className="flex flex-col divide-y divide-white/10 rounded-xl border border-white/10 overflow-hidden sm:grid sm:grid-cols-2 sm:gap-2 sm:divide-y-0 sm:border-0 sm:rounded-none sm:overflow-visible">
                {[
                  { id: 'director', label: 'Director Enforced', sub: 'Mandate academy pathways' },
                  { id: 'manager', label: 'Manager Discretion', sub: 'Coach promotes when ready' },
                ].map(opt => (
                  <button
                    key={opt.id}
                    type="button"
                    aria-pressed={delegation.youthPromotion === opt.id}
                    onClick={() => updateMatrix('youthPromotion', opt.id)}
                    className={`w-full p-3 min-h-11 lg:min-h-0 sm:rounded-lg sm:border text-left cursor-pointer transition-all active:scale-[0.99] ${
                      delegation.youthPromotion === opt.id
                        ? 'bg-amber-400/15 sm:bg-amber-400/10 sm:border-amber-400 text-amber-300 font-bold'
                        : 'bg-slate-900/60 sm:border-white/5 text-slate-400 hover:border-white/20'
                    }`}
                  >
                    <span className="text-xs block">{opt.label}</span>
                    <span className="text-xs sm:text-[10px] text-slate-500 font-normal block mt-0.5">{opt.sub}</span>
                  </button>
                ))}
              </div>

              <div className="bg-slate-900/70 border border-white/5 rounded-lg px-3 py-2 flex items-start gap-2 text-xs text-slate-400 leading-relaxed">
                <Info className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                <span>
                  {delegation.youthPromotion === 'director'
                    ? 'You retain exclusive control over promoting Youth Academy prospects to senior contracts.'
                    : 'Your preference for Coach-led youth calls is recorded; manual promotions remain available in Youth Academy.'}
                </span>
              </div>
            </div>

            {/* 5. Tactical Philosophy */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-white block">
                    Tactical Style & Formation Identity
                  </span>
                  <span className="text-xs sm:text-[11px] text-slate-400">
                    Whether the club dictates a universal tactical identity or allows the coach full freedom.
                  </span>
                </div>
              </div>

              <div className="flex flex-col divide-y divide-white/10 rounded-xl border border-white/10 overflow-hidden sm:grid sm:grid-cols-2 sm:gap-2 sm:divide-y-0 sm:border-0 sm:rounded-none sm:overflow-visible">
                {[
                  { id: 'director_mandated', label: 'Club DNA Mandate', sub: 'Director dictates formation/style' },
                  { id: 'manager_freedom', label: 'Total Tactical Freedom', sub: 'Coach decides all match tactics' },
                ].map(opt => (
                  <button
                    key={opt.id}
                    type="button"
                    aria-pressed={delegation.tacticalStyle === opt.id}
                    onClick={() => updateMatrix('tacticalStyle', opt.id)}
                    className={`w-full p-3 min-h-11 lg:min-h-0 sm:rounded-lg sm:border text-left cursor-pointer transition-all active:scale-[0.99] ${
                      delegation.tacticalStyle === opt.id
                        ? 'bg-amber-400/15 sm:bg-amber-400/10 sm:border-amber-400 text-amber-300 font-bold'
                        : 'bg-slate-900/60 sm:border-white/5 text-slate-400 hover:border-white/20'
                    }`}
                  >
                    <span className="text-xs block">{opt.label}</span>
                    <span className="text-xs sm:text-[10px] text-slate-500 font-normal block mt-0.5">{opt.sub}</span>
                  </button>
                ))}
              </div>

              <div className="bg-slate-900/70 border border-white/5 rounded-lg px-3 py-2 flex items-start gap-2 text-xs text-slate-400 leading-relaxed">
                <Info className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                <span>
                  {delegation.tacticalStyle === 'director_mandated'
                    ? 'A board-mandated club DNA signals top-down identity, which can irritate autocratic Head Coaches.'
                    : 'Your Head Coach enjoys full touchline freedom with his preferred formation and tactical approach.'}
                </span>
              </div>
            </div>

          </div>
        </div>

        {/* Right Col: Head Coach Profile & Recent Manager Decisions */}
        <div className="space-y-6">
          <div className="bg-[#111827] border border-white/10 rounded-xl p-6 space-y-4">
            <div className="border-b border-white/10 pb-3">
              <span className="text-xs font-bold text-white uppercase tracking-wider block">
                Incumbent Head Coach
              </span>
              <span className="text-xs sm:text-[11px] text-slate-400">
                Tactical profile and control appetite
              </span>
            </div>

            {manager ? (
              <div className="space-y-4">
                <div className="bg-slate-900/80 border border-white/5 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-1">
                    <h4 className="text-base font-bold text-white">{manager.name}</h4>
                    <span className="text-xs font-mono text-amber-400">Age {manager.age}</span>
                  </div>
                  <span className="text-xs text-slate-400 block mb-2">{manager.nationality} · {manager.tacticalStyle}</span>

                  <div className="space-y-2 text-xs pt-2 border-t border-white/5">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">Preferred Formation:</span>
                      <span className="font-mono text-slate-200">{manager.preferredFormation}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">Control Appetite:</span>
                      <span className={`font-bold capitalize ${
                        manager.controlDesire === 'autocrat' ? 'text-rose-400' :
                        manager.controlDesire === 'collaborator' ? 'text-amber-400' : 'text-emerald-400'
                      }`}>
                        {manager.controlDesire}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">Weekly Wage:</span>
                      <span className="font-mono text-slate-200">£{(manager.wage / 1000).toFixed(0)}k/wk</span>
                    </div>
                  </div>
                </div>

                <div className="bg-slate-900/60 border border-white/5 rounded-xl p-4 text-xs text-slate-300 leading-relaxed font-serif italic">
                  "{manager.profileSnippet}"
                </div>

                {manager.controlDesire === 'autocrat' && (
                  <div className="p-3 bg-rose-950/20 border border-rose-500/30 rounded-xl text-xs text-rose-300 flex items-start gap-2">
                    <Flame className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                    <span>
                      Warning: {manager.name} is an <strong>Autocrat</strong>. Restricting his transfer control or mandating formations will cause friction and erode his chemistry with you quickly!
                    </span>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-8 text-xs text-slate-500">
                No manager currently employed. Head to the Head Coach tab to hire a tactician.
              </div>
            )}
          </div>

          {/* Recent Manager Decisions */}
          <div className="bg-[#111827] border border-white/10 rounded-xl p-6 space-y-4">
            <div className="border-b border-white/10 pb-3 flex items-center justify-between gap-2">
              <div>
                <span className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                  <History className="w-3.5 h-3.5 text-amber-400" />
                  <span>Recent Manager Decisions</span>
                </span>
                <span className="text-xs sm:text-[11px] text-slate-400 block mt-0.5">
                  Autonomous moves & approved joint deals
                </span>
              </div>
              <span className="text-xs font-mono text-slate-400">
                {recentManagerDecisions.length}
              </span>
            </div>

            {recentManagerDecisions.length === 0 ? (
              <div className="bg-slate-900/60 border border-white/5 rounded-xl p-4 text-xs text-slate-400 leading-relaxed">
                No Head Coach transfer signings, sales, or approved proposals yet. Set Signings or Sales to{' '}
                <strong className="text-slate-200">Manager Control</strong> or{' '}
                <strong className="text-slate-200">Shared Consensus</strong> during transfer windows (Weeks 1–6 & 20–24).
              </div>
            ) : (
              <div className="space-y-2.5">
                {recentManagerDecisions.map(rec => {
                  const fromLabel = rec.fromClubId ? (clubNameMap.get(rec.fromClubId) || rec.fromClubId) : 'Free Agent';
                  const toLabel = rec.toClubId ? (clubNameMap.get(rec.toClubId) || rec.toClubId) : 'Released';
                  const isSigning = rec.type === 'signing';
                  return (
                    <div
                      key={rec.id}
                      className="bg-slate-900/80 border border-white/5 rounded-xl p-3 space-y-1.5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span
                            className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded border shrink-0 ${
                              isSigning
                                ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                                : 'bg-blue-500/10 text-blue-300 border-blue-500/30'
                            }`}
                          >
                            {rec.type}
                          </span>
                          <span
                            className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded border shrink-0 ${
                              rec.initiatedBy === 'shared'
                                ? 'bg-amber-400/10 text-amber-300 border-amber-400/30'
                                : 'bg-slate-800 text-slate-300 border-white/10'
                            }`}
                          >
                            {rec.initiatedBy === 'shared' ? 'Agreed' : 'Coach'}
                          </span>
                        </div>
                        <span className="text-[11px] font-mono text-slate-400 shrink-0">
                          S{rec.season} · Wk {rec.week}
                        </span>
                      </div>

                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-bold text-white truncate">
                          {rec.playerName}{' '}
                          <span className="text-slate-400 font-normal">
                            ({rec.position} · {rec.overall} OVR)
                          </span>
                        </span>
                        <span className="text-xs font-mono font-bold text-amber-400 shrink-0">
                          {rec.fee > 0 ? `£${(rec.fee / 1000000).toFixed(2)}m` : 'Free'}
                        </span>
                      </div>

                      <div className="flex items-center gap-1 text-[11px] text-slate-400 truncate">
                        <ArrowRightLeft className="w-3 h-3 text-slate-500 shrink-0" />
                        <span className="truncate">
                          {fromLabel} → {toLabel}
                        </span>
                      </div>

                      {rec.note && (
                        <p className="text-[11px] text-slate-400 italic line-clamp-2">
                          "{rec.note}"
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

      </div>

    </div>
  );
};
