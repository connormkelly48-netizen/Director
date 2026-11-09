/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Club, Director, Owner, Manager, MatchResult } from '../types/game';
import { Shield, TrendingUp, AlertCircle, Users, DollarSign, Calendar, Flame, CheckCircle, ArrowUpRight, GraduationCap } from 'lucide-react';
import { sounds } from '../services/soundEffects';

interface DashboardViewProps {
  club: Club | undefined;
  director: Director;
  owner: Owner | undefined;
  manager: Manager | undefined;
  allClubs: Club[];
  currentWeek: number;
  seasonYear: number;
  onNavigate: (tab: string) => void;
  onAdvanceWeek: () => void;
  isSimulating: boolean;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  club,
  director,
  owner,
  manager,
  allClubs,
  currentWeek,
  seasonYear,
  onNavigate,
  onAdvanceWeek,
  isSimulating,
}) => {
  if (!club) return null;

  const currentWages = club.squad.reduce((acc, p) => acc + p.wage, 0);
  const wageUsagePercent = Math.min(100, Math.round((currentWages / club.wageBudget) * 100));

  // Sort division clubs
  const sortedClubs = allClubs
    .filter(c => c.tier === club.tier)
    .sort((a, b) => b.points - a.points || b.goalDifference - a.goalDifference);
  
  const myPosition = sortedClubs.findIndex(c => c.id === club.id) + 1;

  return (
    <div className="space-y-6">
      
      {/* Top Executive Banner */}
      <div className="bg-[#111827] border border-white/10 rounded-2xl p-6 relative overflow-hidden">
        <div 
          className="absolute right-0 top-0 bottom-0 w-96 opacity-10 blur-3xl pointer-events-none"
          style={{ backgroundColor: club.primaryColor }}
        />

        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 relative z-10">
          
          {/* Identity & Status */}
          <div className="flex items-center gap-4">
            <div 
              className="w-16 h-16 rounded-2xl flex items-center justify-center font-black text-2xl text-white shadow-2xl border border-white/20"
              style={{ backgroundColor: club.primaryColor }}
            >
              {club.shortName}
            </div>
            <div>
              <div className="flex items-center gap-2 text-xs text-slate-400 mb-1">
                <span>{club.tier === 1 ? 'Premier League' : club.tier === 2 ? 'Championship' : 'League One'}</span>
                <span aria-hidden="true">·</span>
                <span>{club.stadium}</span>
                <span aria-hidden="true">·</span>
                <span className="text-amber-400 font-mono">Rank #{myPosition}</span>
              </div>
              <h1 className="text-2xl lg:text-3xl font-extrabold text-white tracking-tight">
                {club.name}
              </h1>
              <div className="flex items-center gap-2 mt-1 text-xs text-slate-300">
                <span>Director: <strong className="text-white">{director.name}</strong></span>
                <span aria-hidden="true">·</span>
                <span>Philosophy: <strong className="text-amber-400">{director.philosophy}</strong></span>
              </div>
            </div>
          </div>

          {/* Quick Simulation CTA */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                sounds.playClick();
                onNavigate('transfers');
              }}
              className="px-3.5 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-semibold text-slate-200 rounded-xl transition-all cursor-pointer whitespace-nowrap"
            >
              Transfer Hub
            </button>
            <button
              onClick={() => {
                sounds.playClick();
                onNavigate('academy');
              }}
              className="px-3.5 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-semibold text-slate-200 rounded-xl transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5"
            >
              <GraduationCap className="w-3.5 h-3.5 text-amber-400" />
              <span>Youth Academy</span>
            </button>
            <button
              onClick={() => {
                sounds.playWhistle();
                onAdvanceWeek();
              }}
              disabled={isSimulating}
              className={`px-6 py-2.5 text-xs font-extrabold rounded-xl shadow-lg flex items-center gap-2 transition-all cursor-pointer active:scale-95 disabled:opacity-50 ${
                currentWeek >= 46
                  ? 'bg-gradient-to-r from-amber-300 via-amber-400 to-amber-500 text-slate-950 shadow-amber-400/40 ring-2 ring-amber-400'
                  : 'bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-slate-950 shadow-amber-500/20'
              }`}
            >
              <span>{isSimulating ? 'Simulating...' : currentWeek >= 46 ? 'End of Season Review' : `Sim Matchday ${currentWeek}`}</span>
              <ArrowUpRight className="w-4 h-4" />
            </button>
          </div>

        </div>
      </div>

      {/* The Power Triangle: Board Trust, Fan Approval, Manager Alignment */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        
        {/* Board Trust */}
        <div 
          onClick={() => {
            sounds.playClick();
            onNavigate('boardroom');
          }}
          className="bg-[#111827] border border-white/10 rounded-xl p-4.5 cursor-pointer hover:border-white/20 transition-all group"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-slate-400 group-hover:text-slate-200 flex items-center gap-1.5">
              <Shield className="w-4 h-4 text-amber-400" />
              Board & Owner Trust
            </span>
            <span className="text-xs font-mono font-bold text-white tabular-nums">
              {director.boardTrust}%
            </span>
          </div>
          <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden mb-2">
            <div 
              className={`h-full transition-all duration-300 ${
                director.boardTrust > 65 ? 'bg-emerald-400' : director.boardTrust > 40 ? 'bg-amber-400' : 'bg-rose-500'
              }`}
              style={{ width: `${director.boardTrust}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-[11px] text-slate-400">
            <span>Owner: {owner?.name || 'Board'}</span>
            <span className="capitalize text-slate-300 font-medium">{owner?.patience} patience</span>
          </div>
        </div>

        {/* Fan Approval */}
        <div className="bg-[#111827] border border-white/10 rounded-xl p-4.5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-slate-400 flex items-center gap-1.5">
              <Users className="w-4 h-4 text-emerald-400" />
              Supporters Barometer
            </span>
            <span className="text-xs font-mono font-bold text-white tabular-nums">
              {director.fanApproval}%
            </span>
          </div>
          <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden mb-2">
            <div 
              className={`h-full transition-all duration-300 ${
                director.fanApproval > 65 ? 'bg-emerald-400' : director.fanApproval > 40 ? 'bg-amber-400' : 'bg-rose-500'
              }`}
              style={{ width: `${director.fanApproval}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-[11px] text-slate-400">
            <span>Expectation: {club.fanExpectation}</span>
            <span className="text-slate-300 font-medium">Terrace Sentiment</span>
          </div>
        </div>

        {/* Manager Relationship & Trust */}
        <div 
          onClick={() => {
            sounds.playClick();
            onNavigate('manager');
          }}
          className="bg-[#111827] border border-white/10 rounded-xl p-4.5 cursor-pointer hover:border-white/20 transition-all group"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-slate-400 group-hover:text-slate-200 flex items-center gap-1.5">
              <Flame className="w-4 h-4 text-blue-400" />
              Head Coach Chemistry
            </span>
            <span className="text-xs font-mono font-bold text-white tabular-nums">
              {manager ? `${manager.trustInDirector}%` : 'Vacant'}
            </span>
          </div>
          <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden mb-2">
            <div 
              className={`h-full transition-all duration-300 ${
                (manager?.trustInDirector || 0) > 65 ? 'bg-emerald-400' : (manager?.trustInDirector || 0) > 40 ? 'bg-amber-400' : 'bg-rose-500'
              }`}
              style={{ width: `${manager?.trustInDirector || 0}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-[11px] text-slate-400">
            <span>{manager ? manager.name : 'No Manager Hired'}</span>
            <span className="capitalize text-slate-300 font-medium">{manager?.controlDesire || 'N/A'}</span>
          </div>
        </div>

      </div>

      {/* Financial Ledger & Budget Meters */}
      <div className="bg-[#111827] border border-white/10 rounded-xl p-5">
        <div className="flex items-center justify-between border-b border-white/10 pb-3 mb-4">
          <div className="flex items-center gap-2">
            <DollarSign className="w-4 h-4 text-amber-400" />
            <h3 className="text-xs font-bold text-white uppercase tracking-wider">
              Executive Financial Ledger
            </h3>
          </div>
          <span className="text-xs text-slate-400 font-mono">PSR & Amortisation Safe</span>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <span className="text-[11px] text-slate-400 uppercase tracking-wider block mb-1">
              Transfer War Chest
            </span>
            <span className="text-lg lg:text-xl font-bold font-mono tabular-nums text-amber-400">
              £{(club.transferBudget / 1000000).toFixed(2)}M
            </span>
            <span className="text-[10px] text-slate-500 block mt-0.5">Available for transfer fees</span>
          </div>

          <div>
            <span className="text-[11px] text-slate-400 uppercase tracking-wider block mb-1">
              Weekly Wage Bill
            </span>
            <span className="text-lg lg:text-xl font-bold font-mono tabular-nums text-white">
              £{(currentWages / 1000).toFixed(0)}k <span className="text-xs text-slate-400 font-normal">/ £{(club.wageBudget / 1000).toFixed(0)}k</span>
            </span>
            <span className="text-[10px] text-slate-400 block mt-0.5 font-mono">
              {wageUsagePercent}% of allowed ceiling
            </span>
          </div>

          <div>
            <span className="text-[11px] text-slate-400 uppercase tracking-wider block mb-1">
              Club Treasury Balance
            </span>
            <span className="text-lg lg:text-xl font-bold font-mono tabular-nums text-emerald-400">
              £{(club.balance / 1000000).toFixed(2)}M
            </span>
            <span className="text-[10px] text-slate-500 block mt-0.5">Total club cash reserves</span>
          </div>

          <div>
            <span className="text-[11px] text-slate-400 uppercase tracking-wider block mb-1">
              Director Reputation
            </span>
            <span className="text-lg lg:text-xl font-bold font-mono tabular-nums text-blue-400">
              {director.reputation} / 100
            </span>
            <span className="text-[10px] text-slate-500 block mt-0.5">Global executive pedigree</span>
          </div>
        </div>
      </div>

      {/* Two Column: League Standings & Squad Pulse */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* League Standings (2 Columns wide) */}
        <div className="lg:col-span-2 bg-[#111827] border border-white/10 rounded-xl p-5">
          <div className="flex items-center justify-between border-b border-white/10 pb-3 mb-3">
            <div>
              <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                {club.tier === 1 ? 'Premier League' : club.tier === 2 ? 'Championship' : 'League One'} Standings
              </h3>
              <span className="text-[10px] text-slate-400">Matchday {currentWeek} Table</span>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-slate-400 font-mono">
              <span>Form:</span>
              <div className="flex items-center gap-1">
                {club.form.length === 0 ? (
                  <span className="text-slate-500">None yet</span>
                ) : (
                  club.form.map((f, i) => (
                    <span 
                      key={i} 
                      className={`w-4 h-4 rounded text-[9px] font-bold flex items-center justify-center text-white ${
                        f === 'W' ? 'bg-emerald-500' : f === 'D' ? 'bg-slate-600' : 'bg-rose-500'
                      }`}
                    >
                      {f}
                    </span>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead>
                <tr className="text-[10px] text-slate-500 border-b border-white/5 uppercase">
                  <th className="py-2 px-1">#</th>
                  <th className="py-2 px-2">Club</th>
                  <th className="py-2 px-1 text-center">P</th>
                  <th className="py-2 px-1 text-center">W</th>
                  <th className="py-2 px-1 text-center">D</th>
                  <th className="py-2 px-1 text-center">L</th>
                  <th className="py-2 px-1 text-center">GD</th>
                  <th className="py-2 px-2 text-right">Pts</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {sortedClubs.slice(0, 10).map((c, idx) => {
                  const isCurrent = c.id === club.id;
                  return (
                    <tr key={c.id} className={`${isCurrent ? 'bg-amber-400/10 font-bold text-amber-300' : 'text-slate-300 hover:bg-white/5'}`}>
                      <td className="py-2 px-1 text-slate-400">{idx + 1}</td>
                      <td className="py-2 px-2 font-sans flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: c.primaryColor }} />
                        <span className="truncate max-w-[140px]">{c.name}</span>
                      </td>
                      <td className="py-2 px-1 text-center tabular-nums">{c.played}</td>
                      <td className="py-2 px-1 text-center tabular-nums">{c.won}</td>
                      <td className="py-2 px-1 text-center tabular-nums">{c.drawn}</td>
                      <td className="py-2 px-1 text-center tabular-nums">{c.lost}</td>
                      <td className="py-2 px-1 text-center tabular-nums">{c.goalDifference > 0 ? `+${c.goalDifference}` : c.goalDifference}</td>
                      <td className="py-2 px-2 text-right font-bold text-white tabular-nums">{c.points}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Squad Spotlight & Key Assets */}
        <div className="bg-[#111827] border border-white/10 rounded-xl p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b border-white/10 pb-3 mb-3">
              <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                Top Squad Assets
              </h3>
              <button 
                onClick={() => onNavigate('squad')}
                className="text-[11px] text-amber-400 hover:text-amber-300 cursor-pointer font-semibold"
              >
                View Roster ({club.squad.length})
              </button>
            </div>

            <div className="space-y-3">
              {club.squad.slice(0, 5).map(player => (
                <div key={player.id} className="flex items-center justify-between text-xs border-b border-white/5 pb-2.5">
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-mono px-1 bg-slate-800 text-slate-300 rounded font-bold">{player.position}</span>
                      <span className="font-semibold text-white truncate max-w-[120px]">{player.name}</span>
                    </div>
                    <span className="text-[10px] text-slate-400 block mt-0.5">{player.roleDetail} · Age {player.age}</span>
                  </div>
                  <div className="text-right">
                    <span className="font-mono font-bold text-amber-400 text-sm">{player.overall}</span>
                    <span className="text-[10px] text-emerald-400/90 block font-mono font-medium">
                      {player.growthMomentum === 'breakout' ? '🚀 Breakout' : player.growthMomentum === 'rapid' ? '📈 Rapid' : player.growthMomentum === 'prime' ? '⭐ Prime' : player.growthMomentum === 'cooling' ? '📉 Cooling' : '⚖️ Steady'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="border-t border-white/10 pt-3 mt-4 text-[11px] text-slate-400 flex items-center justify-between">
            <span>Injuries: {club.squad.filter(p => p.isInjured).length}</span>
            <span>Squad Morale: <strong className="text-emerald-400 font-semibold">High</strong></span>
          </div>

        </div>

      </div>

    </div>
  );
};
