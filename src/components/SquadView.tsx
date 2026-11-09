/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Club, Player, PlayerPosition } from '../types/game';
import { Users, TrendingUp, AlertCircle, DollarSign, Shield, ArrowUpDown, Award, Trash2 } from 'lucide-react';
import { sounds } from '../services/soundEffects';

interface SquadViewProps {
  club: Club;
  onUpdateSquad: (updatedSquad: Player[], updatedClub: Club) => void;
}

export const SquadView: React.FC<SquadViewProps> = ({ club, onUpdateSquad }) => {
  const [selectedPos, setSelectedPos] = useState<PlayerPosition | 'ALL'>('ALL');
  const [sortField, setSortField] = useState<keyof Player>('overall');
  const [sortAsc, setSortAsc] = useState<boolean>(false);
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);
  const [renewWage, setRenewWage] = useState<number>(0);
  const [renewYears, setRenewYears] = useState<number>(3);
  const [feedback, setFeedback] = useState<string | null>(null);

  const filteredSquad = club.squad.filter(p => {
    if (selectedPos === 'ALL') return true;
    return p.position === selectedPos;
  });

  const sortedSquad = [...filteredSquad].sort((a, b) => {
    const valA = a[sortField];
    const valB = b[sortField];
    if (typeof valA === 'number' && typeof valB === 'number') {
      return sortAsc ? valA - valB : valB - valA;
    }
    if (typeof valA === 'string' && typeof valB === 'string') {
      return sortAsc ? valA.localeCompare(valB) : valB.localeCompare(valA);
    }
    return 0;
  });

  const toggleSort = (field: keyof Player) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(false);
    }
  };

  const handleOpenRenew = (p: Player) => {
    sounds.playClick();
    setSelectedPlayer(p);
    setRenewWage(Math.round(p.wage * 1.15));
    setRenewYears(Math.min(5, p.contractYears + 2));
  };

  const handleConfirmRenew = () => {
    if (!selectedPlayer) return;
    sounds.playSigningStamp();

    const wageDiff = renewWage - selectedPlayer.wage;
    const currentWages = club.squad.reduce((a, b) => a + b.wage, 0);

    if (currentWages + wageDiff > club.wageBudget) {
      setFeedback(`EXTENSION BLOCKED: New wage exceeds club weekly wage budget!`);
      return;
    }

    const updatedSquad = club.squad.map(p => {
      if (p.id === selectedPlayer.id) {
        return {
          ...p,
          wage: renewWage,
          contractYears: renewYears,
          happiness: Math.min(100, p.happiness + 15),
          morale: 'ecstatic' as const,
        };
      }
      return p;
    });

    onUpdateSquad(updatedSquad, club);
    setFeedback(`CONTRACT EXTENDED: ${selectedPlayer.name} has committed to a new ${renewYears}-year deal at £${(renewWage / 1000).toFixed(0)}k/week.`);
    setSelectedPlayer(null);
  };

  const handleReleasePlayer = (p: Player) => {
    sounds.playCrisis();
    const severance = p.wage * 26; // Half a year severance
    const updatedSquad = club.squad.filter(pl => pl.id !== p.id);
    const updatedClub: Club = {
      ...club,
      balance: Math.max(0, club.balance - severance),
    };

    onUpdateSquad(updatedSquad, updatedClub);
    setFeedback(`MUTUAL TERMINATION: ${p.name} has been released. Severance paid: £${(severance / 1000).toFixed(0)}k. Weekly wage space freed: £${(p.wage / 1000).toFixed(0)}k/wk.`);
    if (selectedPlayer?.id === p.id) setSelectedPlayer(null);
  };

  const currentWages = club.squad.reduce((acc, p) => acc + p.wage, 0);

  return (
    <div className="space-y-6">
      
      {/* Header */}
      <div className="bg-[#111827] border border-white/10 rounded-2xl p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold text-amber-400 uppercase tracking-wider mb-1">
              <Users className="w-4 h-4" />
              <span>First-Team Squad Management</span>
            </div>
            <h1 className="text-2xl lg:text-3xl font-extrabold text-white tracking-tight">
              Squad Roster & Player Growth
            </h1>
            <p className="text-slate-400 text-xs mt-1">
              Monitor development trajectories, manage contract renewals, and balance position depth.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <div className="px-4 py-2 bg-slate-900 border border-white/10 rounded-xl text-right">
              <span className="text-[10px] text-slate-400 uppercase block">Squad Count</span>
              <span className="text-lg font-bold font-mono text-white tabular-nums">
                {club.squad.length} / 25
              </span>
            </div>
            <div className="px-4 py-2 bg-slate-900 border border-white/10 rounded-xl text-right">
              <span className="text-[10px] text-slate-400 uppercase block">Weekly Wage Total</span>
              <span className="text-lg font-bold font-mono text-emerald-400 tabular-nums">
                £{(currentWages / 1000).toFixed(0)}k
              </span>
            </div>
          </div>
        </div>
      </div>

      {feedback && (
        <div className="p-4 rounded-xl bg-slate-900 border border-amber-400/30 text-xs text-amber-300 flex items-center justify-between">
          <span>{feedback}</span>
          <button onClick={() => setFeedback(null)} className="text-slate-400 hover:text-white cursor-pointer ml-3">✕</button>
        </div>
      )}

      {/* Position Filter Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
        {(['ALL', 'GK', 'DEF', 'MID', 'FWD'] as const).map(pos => (
          <button
            key={pos}
            onClick={() => {
              sounds.playClick();
              setSelectedPos(pos);
            }}
            className={`px-4 py-2 text-xs font-bold rounded-lg border transition-all cursor-pointer ${
              selectedPos === pos
                ? 'bg-amber-400 text-slate-950 border-amber-400 shadow-sm'
                : 'bg-slate-900/80 border-white/10 text-slate-400 hover:text-white'
            }`}
          >
            {pos === 'ALL' ? 'Full Squad' : pos === 'GK' ? 'Goalkeepers' : pos === 'DEF' ? 'Defenders' : pos === 'MID' ? 'Midfielders' : 'Forwards'}
          </button>
        ))}
      </div>

      {/* Squad Table */}
      <div className="bg-[#111827] border border-white/10 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead>
              <tr className="text-[10px] text-slate-500 border-b border-white/10 bg-slate-900/60 uppercase">
                <th onClick={() => toggleSort('name')} className="py-3 px-3 cursor-pointer hover:text-white">
                  Player Name
                </th>
                <th onClick={() => toggleSort('position')} className="py-3 px-2 cursor-pointer hover:text-white text-center">
                  Pos
                </th>
                <th onClick={() => toggleSort('age')} className="py-3 px-2 cursor-pointer hover:text-white text-center">
                  Age
                </th>
                <th onClick={() => toggleSort('overall')} className="py-3 px-2 cursor-pointer hover:text-white text-center">
                  OVR / 99
                </th>
                <th onClick={() => toggleSort('growthMomentum')} className="py-3 px-2 cursor-pointer hover:text-white text-center">
                  Momentum
                </th>
                <th onClick={() => toggleSort('value')} className="py-3 px-3 cursor-pointer hover:text-white text-right">
                  Valuation
                </th>
                <th onClick={() => toggleSort('wage')} className="py-3 px-3 cursor-pointer hover:text-white text-right">
                  Wage
                </th>
                <th onClick={() => toggleSort('contractYears')} className="py-3 px-2 cursor-pointer hover:text-white text-center">
                  Contract
                </th>
                <th onClick={() => toggleSort('form')} className="py-3 px-2 cursor-pointer hover:text-white text-center">
                  Form
                </th>
                <th onClick={() => toggleSort('goals')} className="py-3 px-2 cursor-pointer hover:text-white text-center">
                  G / A
                </th>
                <th className="py-3 px-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 font-sans">
              {sortedSquad.map(player => (
                <tr key={player.id} className="hover:bg-white/5 transition-colors">
                  <td className="py-3 px-3">
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full shrink-0 ${
                        player.age <= 22 ? 'bg-amber-400' : player.age >= 31 ? 'bg-slate-500' : 'bg-emerald-400'
                      }`} />
                      <div>
                        <span className="font-bold text-white block">{player.name}</span>
                        <span className="text-[10px] text-slate-400 font-mono">{player.roleDetail}</span>
                      </div>
                    </div>
                  </td>
                  <td className="py-3 px-2 text-center font-mono">
                    <span className="px-1.5 py-0.5 rounded text-[10px] bg-slate-800 text-slate-200 font-bold">
                      {player.position}
                    </span>
                  </td>
                  <td className="py-3 px-2 text-center font-mono text-slate-300 tabular-nums">
                    {player.age}
                  </td>
                  <td className="py-3 px-2 text-center font-mono font-bold text-amber-400 tabular-nums text-sm">
                    {player.overall}
                  </td>
                  <td className="py-3 px-2 text-center font-mono">
                    <span className={`text-[11px] font-semibold whitespace-nowrap ${
                      player.growthMomentum === 'breakout' ? 'text-emerald-400' :
                      player.growthMomentum === 'rapid' ? 'text-cyan-400' :
                      player.growthMomentum === 'prime' ? 'text-amber-400' :
                      player.growthMomentum === 'cooling' ? 'text-rose-400' :
                      'text-slate-300'
                    }`}>
                      {player.growthMomentum === 'breakout' ? '🚀 Breakout' :
                       player.growthMomentum === 'rapid' ? '📈 Rapid' :
                       player.growthMomentum === 'prime' ? '⭐ Prime' :
                       player.growthMomentum === 'cooling' ? '📉 Cooling' :
                       '⚖️ Steady'}
                    </span>
                  </td>
                  <td className="py-3 px-3 text-right font-mono font-medium text-slate-200 tabular-nums">
                    £{(player.value / 1000000).toFixed(1)}M
                  </td>
                  <td className="py-3 px-3 text-right font-mono font-medium text-emerald-400 tabular-nums">
                    £{(player.wage / 1000).toFixed(0)}k/wk
                  </td>
                  <td className="py-3 px-2 text-center font-mono text-slate-300 tabular-nums">
                    {player.contractYears} yrs
                  </td>
                  <td className="py-3 px-2 text-center font-mono font-bold text-slate-200 tabular-nums">
                    {player.form.toFixed(1)}
                  </td>
                  <td className="py-3 px-2 text-center font-mono text-slate-300 tabular-nums">
                    {player.goals} / {player.assists}
                  </td>
                  <td className="py-3 px-3 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        onClick={() => handleOpenRenew(player)}
                        className="px-2.5 py-1 text-[11px] font-semibold bg-white/5 hover:bg-white/10 border border-white/10 rounded text-slate-200 hover:text-white transition-all cursor-pointer"
                      >
                        Renew
                      </button>
                      <button
                        onClick={() => handleReleasePlayer(player)}
                        title="Release Player"
                        className="p-1 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 rounded transition-all cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Contract Renewal Modal */}
      {selectedPlayer && (
        <div className="fixed inset-0 z-50 bg-[#070a0f]/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-[#111827] border border-white/10 rounded-2xl p-6 shadow-2xl animate-in fade-in zoom-in-95">
            <div className="border-b border-white/10 pb-3 mb-4">
              <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wider block">
                Contract Negotiations
              </span>
              <h3 className="text-lg font-bold text-white">
                {selectedPlayer.name}
              </h3>
              <span className="text-xs text-slate-400 font-mono">
                Current: £{(selectedPlayer.wage / 1000).toFixed(0)}k/wk · {selectedPlayer.contractYears} years remaining
              </span>
            </div>

            <div className="space-y-4 mb-6">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Proposed Weekly Wage (£/week)
                </label>
                <input
                  type="number"
                  min={1000}
                  step={500}
                  value={renewWage}
                  onChange={e => setRenewWage(Number(e.target.value))}
                  className="w-full px-3.5 py-2.5 bg-slate-900 border border-white/10 rounded-lg text-white font-mono text-sm focus:outline-none focus:border-amber-400"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Contract Duration (Years)
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {[1, 2, 3, 5].map(yrs => (
                    <button
                      key={yrs}
                      type="button"
                      onClick={() => setRenewYears(yrs)}
                      className={`py-2 text-xs font-mono font-bold rounded-lg border ${
                        renewYears === yrs
                          ? 'bg-amber-400 text-slate-950 border-amber-400'
                          : 'bg-slate-900 border-white/10 text-slate-400 hover:text-white'
                      }`}
                    >
                      {yrs} Yrs
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => setSelectedPlayer(null)}
                className="px-4 py-2 text-xs font-medium text-slate-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmRenew}
                className="px-5 py-2 bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-slate-950 font-bold text-xs rounded-lg shadow-md transition-all cursor-pointer"
              >
                Finalize Contract Extension
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
