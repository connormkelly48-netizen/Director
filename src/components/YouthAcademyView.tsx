/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Club, AcademyPlayer, PlayerPosition, Player } from '../types/game';
import { GraduationCap, Award, Trash2, ArrowUpRight, ShieldCheck, Sparkles, AlertCircle, Users, CheckCircle2 } from 'lucide-react';
import { sounds } from '../services/soundEffects';
import { promoteAcademyPlayer, releaseAcademyPlayer } from '../services/simulationEngine';

interface YouthAcademyViewProps {
  club: Club;
  seasonYear: number;
  onUpdateClub: (updatedClub: Club) => void;
}

export const YouthAcademyView: React.FC<YouthAcademyViewProps> = ({
  club,
  seasonYear,
  onUpdateClub,
}) => {
  const [selectedPos, setSelectedPos] = useState<PlayerPosition | 'ALL'>('ALL');
  const [selectedProspect, setSelectedProspect] = useState<AcademyPlayer | null>(null);
  const [promoteWage, setPromoteWage] = useState<number>(2500);
  const [promoteYears, setPromoteYears] = useState<number>(3);
  const [feedback, setFeedback] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const academyList = club.academy || [];

  const filteredProspects = academyList.filter(p => {
    if (selectedPos === 'ALL') return true;
    return p.position === selectedPos;
  });

  // Calculate squad wage headroom
  const currentSquadWages = club.squad.reduce((acc, p) => acc + p.wage, 0);
  const wageSpace = Math.max(0, club.wageBudget - currentSquadWages);
  const squadSlotsLeft = Math.max(0, 25 - club.squad.length);

  // Top prospect by momentum and overall rating
  const topProspect = [...academyList].sort((a, b) => {
    const tierWeight = (t: string) => t === 'Generational Prodigy' ? 4 : t === 'High Tempo' ? 3 : t === 'Late Surge' ? 2 : 1;
    const diff = tierWeight(b.momentumTier) - tierWeight(a.momentumTier);
    if (diff !== 0) return diff;
    return b.overall - a.overall;
  })[0];

  const handleOpenPromote = (prospect: AcademyPlayer) => {
    sounds.playClick();
    setSelectedProspect(prospect);
    // Baseline wage for newly promoted prospect based on tier
    const baseOffer = club.tier === 1 ? 5000 : club.tier === 2 ? 2500 : 1200;
    setPromoteWage(baseOffer);
    setPromoteYears(3);
  };

  const handleConfirmPromote = () => {
    if (!selectedProspect) return;

    const result = promoteAcademyPlayer(club, selectedProspect.id, promoteWage, promoteYears);

    if (!result.success) {
      sounds.playCrisis();
      setFeedback({ message: result.error, type: 'error' });
      return;
    }

    sounds.playSigningStamp();
    onUpdateClub(result.updatedClub);
    setFeedback({
      message: `PROMOTION RATIFIED: ${selectedProspect.name} (${selectedProspect.position}, Age ${selectedProspect.age}) has signed a ${promoteYears}-year professional contract at £${(promoteWage / 1000).toFixed(1)}k/week!`,
      type: 'success',
    });
    setSelectedProspect(null);
  };

  const handleRelease = (prospect: AcademyPlayer) => {
    sounds.playCrisis();
    const updatedClub = releaseAcademyPlayer(club, prospect.id);
    onUpdateClub(updatedClub);
    setFeedback({
      message: `RELEASED: ${prospect.name} has been let go from the academy setup.`,
      type: 'success',
    });
    if (selectedProspect?.id === prospect.id) setSelectedProspect(null);
  };

  return (
    <div className="space-y-6">
      
      {/* Academy Header Banner */}
      <div className="bg-[#111827] border border-white/10 rounded-2xl p-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold text-amber-400 uppercase tracking-wider mb-1">
              <GraduationCap className="w-4 h-4" />
              <span>Youth Development & Academy Ranks</span>
            </div>
            <h1 className="text-2xl lg:text-3xl font-extrabold text-white tracking-tight">
              {club.name} Youth Academy
            </h1>
            <p className="text-slate-400 text-xs mt-1">
              Scout emerging prodigies (ages 15–18), evaluate developmental momentum toward 99 rating, and promote standout talent to the senior roster.
            </p>
          </div>

          {/* Quick Metrics */}
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="px-3.5 py-2 bg-slate-900 border border-white/10 rounded-xl text-right">
              <span className="text-[10px] text-slate-400 uppercase block">Active Prospects</span>
              <span className="text-base font-bold font-mono text-white tabular-nums">
                {academyList.length} Players
              </span>
            </div>
            <div className="px-3.5 py-2 bg-slate-900 border border-white/10 rounded-xl text-right">
              <span className="text-[10px] text-slate-400 uppercase block">Senior Squad Slots</span>
              <span className={`text-base font-bold font-mono tabular-nums ${squadSlotsLeft === 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                {club.squad.length} / 25
              </span>
            </div>
            <div className="px-3.5 py-2 bg-slate-900 border border-white/10 rounded-xl text-right">
              <span className="text-[10px] text-slate-400 uppercase block">Wage Room</span>
              <span className="text-base font-bold font-mono text-amber-400 tabular-nums">
                £{(wageSpace / 1000).toFixed(0)}k/wk
              </span>
            </div>
          </div>
        </div>

        {/* Top Prospect Spotlight Strip */}
        {topProspect && (
          <div className="mt-5 pt-4 border-t border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2">
              <span className="text-amber-400 font-bold uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5" />
                Featured Academy Prodigy:
              </span>
              <span className="font-bold text-white">{topProspect.name}</span>
              <span className="text-slate-500" aria-hidden="true">·</span>
              <span className="text-slate-300 font-mono">{topProspect.position}</span>
              <span className="text-slate-500" aria-hidden="true">·</span>
              <span className="text-amber-300 font-mono font-medium">{topProspect.trait}</span>
            </div>
            <div className="text-slate-400 font-mono text-[11px] flex items-center gap-2">
              <span>Momentum:</span>
              <span className="text-emerald-400 font-bold">{topProspect.momentumTier}</span>
              <span className="text-slate-500">·</span>
              <span className="text-amber-400 font-semibold">Max Ceiling: 99</span>
            </div>
          </div>
        )}
      </div>

      {/* Action / Error Notification */}
      {feedback && (
        <div className={`p-4 rounded-xl border text-xs flex items-center justify-between transition-all ${
          feedback.type === 'error'
            ? 'bg-rose-950/40 border-rose-500/40 text-rose-300'
            : 'bg-emerald-950/40 border-emerald-500/40 text-emerald-300'
        }`}>
          <div className="flex items-center gap-2">
            {feedback.type === 'error' ? (
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
            ) : (
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
            )}
            <span>{feedback.message}</span>
          </div>
          <button
            onClick={() => setFeedback(null)}
            className="text-slate-400 hover:text-white cursor-pointer ml-3 font-mono"
          >
            ✕
          </button>
        </div>
      )}

      {/* Position Filter Segmented Controls */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-1 p-1 bg-slate-900 border border-white/10 rounded-xl">
          {(['ALL', 'GK', 'DEF', 'MID', 'FWD'] as const).map(pos => (
            <button
              key={pos}
              onClick={() => {
                sounds.playClick();
                setSelectedPos(pos);
              }}
              className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer whitespace-nowrap ${
                selectedPos === pos
                  ? 'bg-amber-400 text-slate-950 shadow-sm'
                  : 'text-slate-400 hover:text-white hover:bg-white/5'
              }`}
            >
              {pos === 'ALL' ? 'All Academy' : pos === 'GK' ? 'Goalkeepers' : pos === 'DEF' ? 'Defenders' : pos === 'MID' ? 'Midfielders' : 'Forwards'}
            </button>
          ))}
        </div>

        <div className="text-xs text-slate-400 flex items-center gap-1.5 font-mono">
          <span>Intake Class:</span>
          <span className="text-slate-200 font-bold">{seasonYear}/{seasonYear + 1}</span>
          <span className="text-slate-600" aria-hidden="true">·</span>
          <span>Annual Intake at Week 46</span>
        </div>
      </div>

      {/* Prospects Grid */}
      {filteredProspects.length === 0 ? (
        <div className="bg-[#111827] border border-white/10 rounded-2xl p-12 text-center space-y-3">
          <GraduationCap className="w-12 h-12 text-slate-600 mx-auto" />
          <h3 className="text-base font-bold text-white">No Academy Prospects In This Position</h3>
          <p className="text-xs text-slate-400 max-w-md mx-auto">
            {selectedPos === 'ALL'
              ? 'All prospects from this cohort have been promoted or released. A fresh intake class will arrive at the conclusion of the season.'
              : `There are currently no ${selectedPos} prospects in the academy. Select 'All Academy' or wait for the next annual intake.`}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredProspects.map(prospect => (
            <div
              key={prospect.id}
              className="bg-[#111827] border border-white/10 hover:border-amber-400/40 rounded-xl p-5 transition-all flex flex-col justify-between space-y-4 group"
            >
              <div>
                {/* Header: Name, Position, Age */}
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="text-base font-bold text-white group-hover:text-amber-400 transition-colors">
                      {prospect.name}
                    </h3>
                    <div className="flex items-center gap-2 text-xs text-slate-400 mt-0.5">
                      <span className="font-semibold text-slate-300 font-mono">{prospect.position}</span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono tabular-nums">{prospect.age} yrs</span>
                      <span aria-hidden="true">·</span>
                      <span>{prospect.nationality}</span>
                    </div>
                  </div>

                  <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-white/5 border border-white/10 text-slate-300">
                    {prospect.roleDetail}
                  </span>
                </div>

                {/* Trait Tag */}
                <div className="mt-3">
                  <span className="text-[11px] font-medium text-amber-400 block">
                    ★ {prospect.trait}
                  </span>
                </div>

                {/* Ratings & Momentum Tier */}
                <div className="mt-3.5 space-y-2 bg-slate-900/80 border border-white/5 rounded-lg p-3">
                  <div className="flex items-center justify-between text-xs font-mono">
                    <span className="text-slate-400 text-[11px]">Current OVR</span>
                    <span className="font-bold text-white text-sm tabular-nums">
                      {prospect.overall} <span className="text-slate-500 text-[10px] font-normal">/ 99</span>
                    </span>
                  </div>

                  <div>
                    <div className="flex items-center justify-between text-[11px] font-mono mb-1.5">
                      <span className="text-slate-400">Development Momentum</span>
                      <span className={`font-bold ${
                        prospect.momentumTier === 'Generational Prodigy' ? 'text-emerald-400' :
                        prospect.momentumTier === 'High Tempo' ? 'text-cyan-400' :
                        prospect.momentumTier === 'Late Surge' ? 'text-amber-400' :
                        'text-slate-300'
                      }`}>
                        {prospect.momentumTier === 'Generational Prodigy' ? '⚡ Generational' :
                         prospect.momentumTier === 'High Tempo' ? '🚀 High Tempo' :
                         prospect.momentumTier === 'Late Surge' ? '🌊 Late Surge' :
                         '🌱 Steady'}
                      </span>
                    </div>

                    {/* Visual Progress toward 99 Ceiling Bar */}
                    <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden relative">
                      <div
                        className="h-full bg-gradient-to-r from-amber-400 to-emerald-400 rounded-full transition-all"
                        style={{ width: `${(prospect.overall / 99) * 100}%` }}
                      />
                    </div>
                    <div className="flex justify-between items-center text-[9px] text-slate-500 font-mono mt-1">
                      <span>Rating: {prospect.overall}</span>
                      <span>Ceiling: 99 OVR</span>
                    </div>
                  </div>
                </div>

                {/* Scout Report Prose */}
                <p className="mt-3 text-xs text-slate-400 leading-relaxed italic border-t border-white/5 pt-2">
                  "{prospect.scoutReport}"
                </p>
              </div>

              {/* Action Buttons */}
              <div className="pt-3 border-t border-white/10 flex items-center justify-between gap-2">
                <button
                  onClick={() => handleRelease(prospect)}
                  title="Let go of academy player"
                  className="px-2.5 py-1.5 text-xs text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors flex items-center gap-1 cursor-pointer font-medium"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Release</span>
                </button>

                <button
                  onClick={() => handleOpenPromote(prospect)}
                  className="px-3.5 py-1.5 bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-slate-950 font-bold text-xs rounded-lg shadow-sm flex items-center gap-1.5 transition-all cursor-pointer active:scale-95 whitespace-nowrap"
                >
                  <ArrowUpRight className="w-3.5 h-3.5" />
                  <span>Promote to Senior</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Promotion Contract Dialog Modal */}
      {selectedProspect && (
        <div className="fixed inset-0 z-50 bg-[#070a0f]/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-[#111827] border border-amber-400/30 rounded-2xl p-6 shadow-2xl animate-in fade-in zoom-in-95 space-y-4">
            
            <div className="border-b border-white/10 pb-3">
              <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wider block">
                Academy Graduation Contract
              </span>
              <h3 className="text-xl font-bold text-white mt-0.5">
                Promote {selectedProspect.name}
              </h3>
              <div className="flex items-center gap-2 text-xs text-slate-400 mt-1 font-mono">
                <span>{selectedProspect.position}</span>
                <span aria-hidden="true">·</span>
                <span>Age {selectedProspect.age}</span>
                <span aria-hidden="true">·</span>
                <span className="text-emerald-400 font-semibold">{selectedProspect.momentumTier} (Max 99 OVR)</span>
              </div>
            </div>

            {/* Roster & Budget Check */}
            <div className="bg-slate-900 border border-white/10 rounded-xl p-3 text-xs space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Current Senior Squad:</span>
                <span className={`font-mono font-bold ${club.squad.length >= 25 ? 'text-rose-400' : 'text-slate-200'}`}>
                  {club.squad.length} / 25 players
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Weekly Wage Headroom:</span>
                <span className="font-mono font-bold text-emerald-400">
                  £{(wageSpace / 1000).toFixed(1)}k/wk
                </span>
              </div>
            </div>

            {club.squad.length >= 25 && (
              <div className="p-3 bg-rose-950/40 border border-rose-500/40 rounded-xl text-xs text-rose-300 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                <span>Squad is full at 25 players! You must sell or release a senior squad player first.</span>
              </div>
            )}

            {/* Contract Negotiation Inputs */}
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Offered Weekly Professional Wage (£/week)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={500}
                    max={25000}
                    step={250}
                    value={promoteWage}
                    onChange={e => setPromoteWage(Number(e.target.value))}
                    className="flex-1 px-3.5 py-2 bg-slate-900 border border-white/10 rounded-lg text-white font-mono text-sm focus:outline-none focus:border-amber-400"
                  />
                  <span className="text-xs text-slate-400 font-mono shrink-0">
                    £{(promoteWage / 1000).toFixed(1)}k/wk
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Contract Duration
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {[1, 2, 3, 5].map(yrs => (
                    <button
                      key={yrs}
                      type="button"
                      onClick={() => setPromoteYears(yrs)}
                      className={`py-2 text-xs font-mono font-bold rounded-lg border transition-colors cursor-pointer ${
                        promoteYears === yrs
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

            {/* Modal Actions */}
            <div className="pt-3 border-t border-white/10 flex items-center justify-end gap-2">
              <button
                onClick={() => setSelectedProspect(null)}
                className="px-4 py-2 text-xs font-medium text-slate-400 hover:text-white transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmPromote}
                disabled={club.squad.length >= 25 || promoteWage > wageSpace}
                className="px-5 py-2 bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 disabled:opacity-50 text-slate-950 font-bold text-xs rounded-lg shadow-md transition-all cursor-pointer"
              >
                Ratify Professional Contract
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
};
