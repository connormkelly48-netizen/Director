/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { SeasonSummary, Club, Director, Owner, AcademyPlayer } from '../types/game';
import { Trophy, ArrowRight, GraduationCap, Sparkles, Trash2, ArrowUpRight, CheckCircle2, AlertCircle } from 'lucide-react';
import { sounds } from '../services/soundEffects';
import { promoteAcademyPlayer, releaseAcademyPlayer } from '../services/simulationEngine';

interface SeasonFinaleModalProps {
  summary: SeasonSummary;
  playerClub: Club | undefined;
  director: Director;
  owner: Owner | undefined;
  onAdvanceToNextSeason: (stayAtClub: boolean) => void;
  onUpdateClub?: (updatedClub: Club) => void;
  onBackToMainMenu?: () => void;
}

export const SeasonFinaleModal: React.FC<SeasonFinaleModalProps> = ({
  summary,
  playerClub,
  director,
  owner,
  onAdvanceToNextSeason,
  onUpdateClub,
  onBackToMainMenu,
}) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'academy'>('overview');
  const [feedback, setFeedback] = useState<string | null>(null);

  const academyList: AcademyPlayer[] = playerClub?.academy || summary.graduatingProspects || [];
  const currentSquadWages = playerClub?.squad.reduce((acc, p) => acc + p.wage, 0) || 0;
  const wageSpace = playerClub ? Math.max(0, playerClub.wageBudget - currentSquadWages) : 0;
  const squadSlotsLeft = playerClub ? Math.max(0, 25 - playerClub.squad.length) : 0;

  const handlePromote = (prospect: AcademyPlayer) => {
    if (!playerClub || !onUpdateClub) return;
    const baseWage = playerClub.tier === 1 ? 5000 : playerClub.tier === 2 ? 2500 : 1200;
    const result = promoteAcademyPlayer(playerClub, prospect.id, baseWage, 3);

    if (!result.success) {
      sounds.playCrisis();
      setFeedback(result.error);
      return;
    }

    sounds.playSigningStamp();
    onUpdateClub(result.updatedClub);
    setFeedback(`PROMOTED: ${prospect.name} (${prospect.position}, Age ${prospect.age}) signed a 3-year professional senior contract at £${(baseWage / 1000).toFixed(1)}k/week!`);
  };

  const handleRelease = (prospect: AcademyPlayer) => {
    if (!playerClub || !onUpdateClub) return;
    sounds.playCrisis();
    const updated = releaseAcademyPlayer(playerClub, prospect.id);
    onUpdateClub(updated);
    setFeedback(`RELEASED: ${prospect.name} was let go from the academy setup.`);
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#070a0f]/90 backdrop-blur-xl flex items-center justify-center p-4 overflow-y-auto">
      <div className="w-full max-w-4xl bg-[#111827] border border-amber-400/30 rounded-2xl p-6 lg:p-8 shadow-2xl animate-in zoom-in-95 duration-200 space-y-6">
        
        {/* Header */}
        <div className="text-center border-b border-white/10 pb-5">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-amber-400/10 border border-amber-400/20 rounded-full text-amber-400 text-xs font-bold uppercase tracking-wider mb-2">
            <Trophy className="w-4 h-4" />
            <span>Season {summary.seasonYear}/{summary.seasonYear + 1} Concluded</span>
          </div>
          <h2 className="text-3xl lg:text-4xl font-black text-white tracking-tight">
            The Official Season Review
          </h2>
          <p className="text-slate-400 text-xs mt-1">
            Every club has played each other twice. Silverware has been hoisted, promotions and relegations ratified, and seasonal financial disbursements approved.
          </p>

          {/* Mode Tabs */}
          <div className="flex items-center justify-center gap-2 mt-4">
            <button
              onClick={() => {
                sounds.playClick();
                setActiveTab('overview');
              }}
              className={`px-4 py-2 text-xs font-bold rounded-lg border transition-all cursor-pointer ${
                activeTab === 'overview'
                  ? 'bg-amber-400 text-slate-950 border-amber-400 shadow-sm'
                  : 'bg-slate-900 border-white/10 text-slate-400 hover:text-white'
              }`}
            >
              League Review & Honors
            </button>
            <button
              onClick={() => {
                sounds.playClick();
                setActiveTab('academy');
              }}
              className={`px-4 py-2 text-xs font-bold rounded-lg border transition-all cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'academy'
                  ? 'bg-amber-400 text-slate-950 border-amber-400 shadow-sm'
                  : 'bg-slate-900 border-white/10 text-slate-400 hover:text-white'
              }`}
            >
              <GraduationCap className="w-3.5 h-3.5" />
              <span>Academy Graduation ({academyList.length} Prospects)</span>
            </button>
          </div>
        </div>

        {feedback && (
          <div className="p-3 bg-slate-900 border border-amber-400/40 rounded-xl text-xs text-amber-300 flex items-center justify-between">
            <span>{feedback}</span>
            <button onClick={() => setFeedback(null)} className="text-slate-400 hover:text-white ml-2">✕</button>
          </div>
        )}

        {/* Tab 1: Overview */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* Silverware & Director Performance Spotlight */}
            <div className="bg-gradient-to-r from-slate-900 via-slate-900/90 to-slate-900 border border-white/10 rounded-2xl p-6 relative overflow-hidden">
              {summary.playerClubWonTrophy && (
                <div className="absolute right-4 top-4 opacity-15 pointer-events-none">
                  <Trophy className="w-48 h-48 text-amber-400" />
                </div>
              )}

              <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-bold uppercase text-amber-400">
                      {summary.playerClubWonTrophy ? '🏆 Champions of the League!' : summary.isPromoted ? '🚀 Promotion Achieved!' : summary.isRelegated ? '⚠️ Relegation Suffered' : 'Season Objective Completed'}
                    </span>
                  </div>
                  <h3 className="text-2xl font-black text-white">
                    {playerClub?.name} · Finished #{summary.playerClubFinalPosition}
                  </h3>
                  <p className="text-xs text-slate-300 mt-1 max-w-xl italic font-serif leading-relaxed">
                    "{summary.ownerEvaluation}"
                  </p>
                </div>

                {/* Performance Grade Badge */}
                <div className="px-6 py-4 bg-black/50 border border-white/15 rounded-xl text-center shrink-0">
                  <span className="text-[10px] text-slate-400 uppercase tracking-wider block mb-0.5">Boardroom Grade</span>
                  <span className={`text-4xl font-black font-mono tracking-tight ${
                    summary.directorGrade === 'A+' ? 'text-amber-400' :
                    summary.directorGrade === 'A' ? 'text-emerald-400' :
                    summary.directorGrade === 'B' ? 'text-blue-400' :
                    summary.directorGrade === 'C' ? 'text-yellow-400' :
                    summary.directorGrade === 'D' ? 'text-orange-400' : 'text-rose-500'
                  }`}>
                    {summary.directorGrade}
                  </span>
                  <span className="text-[10px] text-slate-400 block mt-0.5">Evaluation</span>
                </div>
              </div>

              {/* Seasonal Financial Payout */}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 border-t border-white/10 pt-4 mt-5 text-xs font-mono">
                <div>
                  <span className="text-[10px] text-slate-400 uppercase block">Merit Prize Money</span>
                  <span className="text-base font-bold text-amber-400">£{(summary.prizeMoney / 1000000).toFixed(1)}M</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 uppercase block">Broadcasting TV Rights</span>
                  <span className="text-base font-bold text-emerald-400">£{(summary.tvRevenue / 1000000).toFixed(1)}M</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 uppercase block">Director Pedigree</span>
                  <span className="text-base font-bold text-blue-400">
                    {summary.directorGrade === 'A+' ? '+8 Reputation' : summary.directorGrade === 'A' ? '+5 Reputation' : summary.directorGrade === 'B' ? '+2 Reputation' : '-8 Reputation'}
                  </span>
                </div>
              </div>
            </div>

            {/* Division Honor Roll: Champions & Movement */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              
              {/* Premier League */}
              <div className="bg-slate-900/80 border border-white/10 rounded-xl p-4 space-y-2.5">
                <div className="flex items-center justify-between border-b border-white/5 pb-2">
                  <span className="text-xs font-bold text-white uppercase">Premier League</span>
                  <span className="text-[10px] font-mono text-amber-400 font-bold">Tier 1</span>
                </div>
                <div className="text-xs space-y-1.5">
                  <div>
                    <span className="text-[10px] text-slate-400 block">🏆 Champions:</span>
                    <span className="font-bold text-amber-300">{summary.tier1.champion.name}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 block">🥈 Runner-Up:</span>
                    <span className="font-medium text-slate-200">{summary.tier1.runnerUp.name}</span>
                  </div>
                  <div className="pt-1 border-t border-white/5">
                    <span className="text-[10px] text-rose-400 block font-semibold">⬇ Relegated to Championship:</span>
                    <div className="text-[11px] text-slate-300 flex flex-wrap gap-1 mt-0.5">
                      {summary.tier1.relegatedClubs.map(c => (
                        <span key={c.id} className="bg-slate-800 px-1.5 py-0.5 rounded text-[10px]">{c.shortName}</span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Championship */}
              <div className="bg-slate-900/80 border border-white/10 rounded-xl p-4 space-y-2.5">
                <div className="flex items-center justify-between border-b border-white/5 pb-2">
                  <span className="text-xs font-bold text-white uppercase">Championship</span>
                  <span className="text-[10px] font-mono text-blue-400 font-bold">Tier 2</span>
                </div>
                <div className="text-xs space-y-1.5">
                  <div>
                    <span className="text-[10px] text-slate-400 block">🏆 Champions:</span>
                    <span className="font-bold text-amber-300">{summary.tier2.champion.name}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-emerald-400 block font-semibold">⬆ Promoted to Premier League:</span>
                    <div className="text-[11px] text-slate-300 flex flex-wrap gap-1 mt-0.5">
                      {summary.tier2.promotedClubs.map(c => (
                        <span key={c.id} className="bg-emerald-950/60 border border-emerald-500/30 text-emerald-300 px-1.5 py-0.5 rounded text-[10px] font-bold">{c.shortName}</span>
                      ))}
                    </div>
                  </div>
                  <div className="pt-1 border-t border-white/5">
                    <span className="text-[10px] text-rose-400 block font-semibold">⬇ Relegated to League One:</span>
                    <div className="text-[11px] text-slate-300 flex flex-wrap gap-1 mt-0.5">
                      {summary.tier2.relegatedClubs.map(c => (
                        <span key={c.id} className="bg-slate-800 px-1.5 py-0.5 rounded text-[10px]">{c.shortName}</span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* League One */}
              <div className="bg-slate-900/80 border border-white/10 rounded-xl p-4 space-y-2.5">
                <div className="flex items-center justify-between border-b border-white/5 pb-2">
                  <span className="text-xs font-bold text-white uppercase">League One</span>
                  <span className="text-[10px] font-mono text-slate-400 font-bold">Tier 3</span>
                </div>
                <div className="text-xs space-y-1.5">
                  <div>
                    <span className="text-[10px] text-slate-400 block">🏆 Champions:</span>
                    <span className="font-bold text-amber-300">{summary.tier3.champion.name}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-emerald-400 block font-semibold">⬆ Promoted to Championship:</span>
                    <div className="text-[11px] text-slate-300 flex flex-wrap gap-1 mt-0.5">
                      {summary.tier3.promotedClubs.map(c => (
                        <span key={c.id} className="bg-emerald-950/60 border border-emerald-500/30 text-emerald-300 px-1.5 py-0.5 rounded text-[10px] font-bold">{c.shortName}</span>
                      ))}
                    </div>
                  </div>
                  <div className="pt-1 border-t border-white/5">
                    <span className="text-[10px] text-slate-500 block">⬇ Relegation zone ratified</span>
                  </div>
                </div>
              </div>

            </div>
          </div>
        )}

        {/* Tab 2: Academy Graduation Review */}
        {activeTab === 'academy' && (
          <div className="space-y-4">
            <div className="bg-slate-900 border border-white/10 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
              <div>
                <span className="text-amber-400 font-bold uppercase tracking-wider block text-[11px]">
                  Seasonal Academy Graduation Review
                </span>
                <span className="text-slate-300 mt-0.5 block">
                  Decide which graduating academy prospects will sign senior professional contracts or be let go before the summer transition.
                </span>
              </div>
              <div className="flex items-center gap-3 shrink-0 font-mono text-right">
                <div>
                  <span className="text-[10px] text-slate-400 block">Senior Squad</span>
                  <span className={`font-bold ${squadSlotsLeft === 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                    {playerClub?.squad.length} / 25
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 block">Wage Space</span>
                  <span className="font-bold text-amber-400">£{(wageSpace / 1000).toFixed(0)}k/wk</span>
                </div>
              </div>
            </div>

            {academyList.length === 0 ? (
              <div className="bg-slate-900/60 border border-white/10 rounded-xl p-8 text-center text-xs text-slate-400">
                <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
                <span>All academy prospects for this season have been processed. A new cohort will arrive in Season {summary.seasonYear + 1}.</span>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[360px] overflow-y-auto pr-1">
                {academyList.map(prospect => (
                  <div
                    key={prospect.id}
                    className="bg-slate-900 border border-white/10 hover:border-amber-400/30 rounded-xl p-4 flex flex-col justify-between space-y-3"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <span className="font-bold text-white text-sm block">{prospect.name}</span>
                          <div className="flex items-center gap-1.5 text-xs text-slate-400 mt-0.5">
                            <span className="font-semibold text-slate-300 font-mono">{prospect.position}</span>
                            <span aria-hidden="true">·</span>
                            <span className="font-mono">{prospect.age} yrs</span>
                            <span aria-hidden="true">·</span>
                            <span>{prospect.nationality}</span>
                          </div>
                        </div>
                        <span className="text-[10px] font-mono px-2 py-0.5 bg-white/5 border border-white/10 rounded text-slate-300">
                          {prospect.roleDetail}
                        </span>
                      </div>

                      <div className="mt-2 text-xs font-mono flex items-center justify-between bg-black/40 px-2.5 py-1.5 rounded-lg border border-white/5">
                        <span className="text-slate-400">Current OVR: <strong className="text-white">{prospect.overall}</strong> <span className="text-slate-500 text-[10px]">/ 99</span></span>
                        <span className="text-emerald-400 font-bold">{prospect.momentumTier}</span>
                      </div>

                      <div className="text-[11px] text-amber-300/90 font-medium mt-1.5">
                        ★ {prospect.trait}
                      </div>

                      <p className="text-[11px] text-slate-400 italic mt-1 line-clamp-2">
                        "{prospect.scoutReport}"
                      </p>
                    </div>

                    <div className="pt-2 border-t border-white/10 flex items-center justify-between gap-2">
                      <button
                        onClick={() => handleRelease(prospect)}
                        className="px-2.5 py-1 text-xs text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded transition-colors flex items-center gap-1 cursor-pointer font-medium"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Let Go</span>
                      </button>

                      <button
                        onClick={() => handlePromote(prospect)}
                        disabled={squadSlotsLeft === 0}
                        className="px-3 py-1 bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 disabled:opacity-50 text-slate-950 font-bold text-xs rounded-lg shadow-sm flex items-center gap-1 transition-all cursor-pointer active:scale-95"
                      >
                        <ArrowUpRight className="w-3.5 h-3.5" />
                        <span>Promote to Senior</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Action Choice: Continue at Club or Move to Job Market */}
        <div className="border-t border-white/10 pt-5 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="text-xs text-slate-400">
            <span>Next Campaign: <strong className="text-white font-mono">{summary.seasonYear + 1}/{summary.seasonYear + 2} Season</strong></span>
            <span className="block text-[11px] text-slate-500">Player ages will increment by 1 year, unpromoted 19yo prospects leave, and new intake arrives.</span>
          </div>

          <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
            {onBackToMainMenu && (
              <button
                onClick={() => {
                  sounds.playClick();
                  onBackToMainMenu();
                }}
                className="px-3.5 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-bold text-slate-300 hover:text-white rounded-xl transition-all cursor-pointer"
              >
                Back to Main Menu
              </button>
            )}

            <button
              onClick={() => {
                sounds.playClick();
                onAdvanceToNextSeason(false); // Move to job market
              }}
              className="w-full sm:w-auto px-4 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-bold text-slate-300 hover:text-white rounded-xl transition-all cursor-pointer"
            >
              Explore Job Market / Change Club
            </button>

            <button
              onClick={() => {
                sounds.playFanfare();
                onAdvanceToNextSeason(true); // Stay at current club
              }}
              className="w-full sm:w-auto px-6 py-2.5 bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-slate-950 font-extrabold text-xs rounded-xl shadow-lg shadow-amber-500/20 flex items-center justify-center gap-2 transition-all cursor-pointer active:scale-95"
            >
              <span>Begin Season {summary.seasonYear + 1} at {playerClub?.shortName || 'Club'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
