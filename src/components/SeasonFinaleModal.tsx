/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { SeasonSummary, Club, Director, Owner, Manager, AcademyPlayer, LeagueTier, TransferRecord } from '../types/game';
import { Trophy, ArrowRight, GraduationCap, Trash2, ArrowUpRight, CheckCircle2, Clock } from 'lucide-react';
import { sounds } from '../services/soundEffects';
import { promoteAcademyPlayer, releaseAcademyPlayer } from '../services/simulationEngine';
import { Modal } from './ui/Modal';

interface SeasonFinaleModalProps {
  summary: SeasonSummary;
  playerClub: Club | undefined;
  director: Director;
  owner: Owner | undefined;
  manager?: Manager;
  transferHistory?: TransferRecord[];
  onAdvanceToNextSeason: (stayAtClub: boolean) => void;
  onUpdateClub?: (updatedClub: Club) => void;
  onBackToMainMenu?: () => void;
}

export const SeasonFinaleModal: React.FC<SeasonFinaleModalProps> = ({
  summary,
  playerClub,
  manager,
  transferHistory = [],
  onAdvanceToNextSeason,
  onUpdateClub,
  onBackToMainMenu,
}) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'retirements' | 'academy'>('overview');
  const [retirementFilter, setRetirementFilter] = useState<'ALL' | 'CLUB' | LeagueTier>('ALL');
  const [feedback, setFeedback] = useState<string | null>(null);

  const academyList: AcademyPlayer[] = playerClub?.academy || summary.graduatingProspects || [];
  const retirementsList = summary.retirements || [];
  const topGraduates = summary.topLeagueGraduates || [];
  const filteredRetirements = retirementsList.filter(r => {
    if (retirementFilter === 'ALL') return true;
    if (retirementFilter === 'CLUB') return r.isUserClub;
    return r.clubTier === retirementFilter;
  });
  const currentSquadWages = playerClub?.squad.reduce((acc, p) => acc + p.wage, 0) || 0;
  const wageSpace = playerClub ? Math.max(0, playerClub.wageBudget - currentSquadWages) : 0;
  const squadSlotsLeft = playerClub ? Math.max(0, 25 - playerClub.squad.length) : 0;

  const handlePromote = (prospect: AcademyPlayer) => {
    if (!playerClub || !onUpdateClub) return;
    const baseWage = playerClub.tier === 1 ? 5000 : playerClub.tier === 2 ? 2500 : 1200;
    const result = promoteAcademyPlayer(playerClub, prospect.id, baseWage, 3, manager);

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
    <Modal
      isOpen={true}
      dismissible={false}
      showCloseButton={false}
      maxWidthClass="max-w-4xl"
      borderClass="border-amber-400/30"
      backdropClass="bg-[#070a0f]/90"
      ariaLabel="The Official Season Review"
      header={
        <div className="text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-amber-400/10 border border-amber-400/20 rounded-full text-amber-400 text-xs font-bold uppercase tracking-wider mb-1.5 sm:mb-2">
            <Trophy className="w-4 h-4 shrink-0" />
            <span>Season {summary.seasonYear}/{summary.seasonYear + 1} Concluded</span>
          </div>
          <h2 className="text-xl sm:text-3xl lg:text-4xl font-black text-white tracking-tight">
            The Official Season Review
          </h2>
          <p className="text-slate-400 text-xs mt-1 max-w-[75ch] mx-auto">
            Every club has played each other twice. Silverware has been hoisted, promotions and relegations ratified, and seasonal financial disbursements approved.
          </p>

          {/* Mode Tabs */}
          <div className="flex flex-wrap items-center justify-center gap-2 mt-3 sm:mt-4">
            <button
              type="button"
              onClick={() => {
                sounds.playClick();
                setActiveTab('overview');
              }}
              className={`min-h-11 lg:min-h-0 px-3.5 sm:px-4 py-2 text-xs font-bold rounded-lg border transition-all active:scale-95 cursor-pointer ${
                activeTab === 'overview'
                  ? 'bg-amber-400 text-slate-950 border-amber-400 shadow-sm'
                  : 'bg-slate-900 border-white/10 text-slate-400 hover:text-white'
              }`}
            >
              League Review & Honors
            </button>
            <button
              type="button"
              onClick={() => {
                sounds.playClick();
                setActiveTab('retirements');
              }}
              className={`min-h-11 lg:min-h-0 px-3.5 sm:px-4 py-2 text-xs font-bold rounded-lg border transition-all active:scale-95 cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'retirements'
                  ? 'bg-amber-400 text-slate-950 border-amber-400 shadow-sm'
                  : 'bg-slate-900 border-white/10 text-slate-400 hover:text-white'
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              <span>Retirements & Graduates ({retirementsList.length})</span>
            </button>
            <button
              type="button"
              onClick={() => {
                sounds.playClick();
                setActiveTab('academy');
              }}
              className={`min-h-11 lg:min-h-0 px-3.5 sm:px-4 py-2 text-xs font-bold rounded-lg border transition-all active:scale-95 cursor-pointer flex items-center gap-1.5 ${
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
      }
      footer={
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="text-xs text-slate-400">
            <span>Next Campaign: <strong className="text-white font-mono">{summary.seasonYear + 1}/{summary.seasonYear + 2} Season</strong></span>
            <span className="block text-xs sm:text-[11px] text-slate-500">Retiring veterans exit football, remaining players age +1 yr, AI academies replenish, and new intakes arrive.</span>
          </div>

          <div className="flex flex-wrap items-center gap-2 sm:gap-3 w-full sm:w-auto">
            {onBackToMainMenu && (
              <button
                type="button"
                onClick={() => {
                  sounds.playClick();
                  onBackToMainMenu();
                }}
                className="w-full sm:w-auto min-h-11 lg:min-h-0 px-3.5 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-bold text-slate-300 hover:text-white rounded-xl transition-all cursor-pointer"
              >
                Back to Main Menu
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                sounds.playClick();
                onAdvanceToNextSeason(false);
              }}
              className="w-full sm:w-auto min-h-11 lg:min-h-0 px-4 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-bold text-slate-300 hover:text-white rounded-xl transition-all cursor-pointer"
            >
              Explore Job Market / Change Club
            </button>

            <button
              type="button"
              onClick={() => {
                sounds.playFanfare();
                onAdvanceToNextSeason(true);
              }}
              className="w-full sm:w-auto min-h-11 lg:min-h-0 px-6 py-2.5 bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-slate-950 font-extrabold text-xs rounded-xl shadow-lg shadow-amber-500/20 flex items-center justify-center gap-2 transition-all cursor-pointer active:scale-95"
            >
              <span>Begin Season {summary.seasonYear + 1} at {playerClub?.shortName || 'Club'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      }
    >
      <div className="space-y-6">
        {feedback && (
          <div className="p-3 bg-slate-900 border border-amber-400/40 rounded-xl text-xs text-amber-300 flex items-center justify-between gap-2">
            <span>{feedback}</span>
            <button
              type="button"
              onClick={() => setFeedback(null)}
              aria-label="Dismiss notification"
              className="min-h-11 min-w-11 lg:min-h-0 lg:min-w-0 inline-flex items-center justify-center text-slate-400 hover:text-white ml-2 cursor-pointer shrink-0"
            >
              ✕
            </button>
          </div>
        )}

        {/* Tab 1: Overview */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* Silverware & Director Performance Spotlight */}
            <div className="bg-gradient-to-r from-slate-900 via-slate-900/90 to-slate-900 border border-white/10 rounded-2xl p-5 sm:p-6 relative overflow-hidden">
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
                  <h3 className="text-xl sm:text-2xl font-black text-white">
                    {playerClub?.name} · Finished #{summary.playerClubFinalPosition}
                  </h3>
                  <p className="text-xs text-slate-300 mt-1 max-w-xl italic font-serif leading-relaxed">
                    "{summary.ownerEvaluation}"
                  </p>
                </div>

                {/* Performance Grade Badge */}
                <div className="px-6 py-4 bg-black/50 border border-white/15 rounded-xl text-center shrink-0">
                  <span className="text-xs sm:text-[10px] text-slate-400 uppercase tracking-wider block mb-0.5">Boardroom Grade</span>
                  <span className={`text-4xl font-black font-mono tracking-tight ${
                    summary.directorGrade === 'A+' ? 'text-amber-400' :
                    summary.directorGrade === 'A' ? 'text-emerald-400' :
                    summary.directorGrade === 'B' ? 'text-blue-400' :
                    summary.directorGrade === 'C' ? 'text-yellow-400' :
                    summary.directorGrade === 'D' ? 'text-orange-400' : 'text-rose-500'
                  }`}>
                    {summary.directorGrade}
                  </span>
                  <span className="text-xs sm:text-[10px] text-slate-400 block mt-0.5">Evaluation</span>
                </div>
              </div>

              {/* Seasonal Financial Payout */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 border-t border-white/10 pt-4 mt-5 text-xs font-mono">
                <div>
                  <span className="text-xs sm:text-[10px] text-slate-400 uppercase block">Merit Prize Money</span>
                  <span className="text-base font-bold text-amber-400">£{(summary.prizeMoney / 1000000).toFixed(1)}M</span>
                </div>
                <div>
                  <span className="text-xs sm:text-[10px] text-slate-400 uppercase block">Broadcasting TV Rights</span>
                  <span className="text-base font-bold text-emerald-400">£{(summary.tvRevenue / 1000000).toFixed(1)}M</span>
                </div>
                <div>
                  <span className="text-xs sm:text-[10px] text-slate-400 uppercase block">Director Pedigree</span>
                  <span className="text-base font-bold text-blue-400">
                    {summary.directorGrade === 'A+'
                      ? '+8 Reputation'
                      : summary.directorGrade === 'A'
                      ? '+5 Reputation'
                      : summary.directorGrade === 'B'
                      ? '+2 Reputation'
                      : summary.directorGrade === 'C'
                      ? '-2 Reputation'
                      : summary.directorGrade === 'D'
                      ? '-5 Reputation'
                      : '-10 Reputation'}
                  </span>
                </div>
              </div>
            </div>

            {/* Head Coach Season Activity Summary */}
            {playerClub && (() => {
              const coachSeasonDeals = transferHistory.filter(
                tr =>
                  tr.season === summary.seasonYear &&
                  (tr.initiatedBy === 'manager' || tr.initiatedBy === 'shared') &&
                  (tr.toClubId === playerClub.id || tr.fromClubId === playerClub.id)
              );
              if (coachSeasonDeals.length === 0) return null;
              const signings = coachSeasonDeals.filter(tr => tr.type === 'signing' && tr.toClubId === playerClub.id);
              const sales = coachSeasonDeals.filter(tr => tr.type === 'sale' && tr.fromClubId === playerClub.id);
              const renewals = coachSeasonDeals.filter(tr => tr.type === 'renewal' && tr.toClubId === playerClub.id);
              const promotions = coachSeasonDeals.filter(tr => tr.type === 'promotion' && tr.toClubId === playerClub.id);

              return (
                <div className="bg-slate-900/80 border border-white/10 rounded-xl p-4 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/5 pb-2">
                    <span className="text-xs font-bold text-white uppercase tracking-wider">
                      Head Coach Business ({summary.seasonYear}/{summary.seasonYear + 1})
                    </span>
                    <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono">
                      {signings.length > 0 && <span className="text-emerald-400">{signings.length} Signed</span>}
                      {sales.length > 0 && <span className="text-blue-400">{sales.length} Sold</span>}
                      {renewals.length > 0 && <span className="text-amber-300">{renewals.length} Renewed</span>}
                      {promotions.length > 0 && <span className="text-purple-300">{promotions.length} Promoted</span>}
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-40 overflow-y-auto pr-1">
                    {coachSeasonDeals.slice(0, 12).map(tr => (
                      <div
                        key={tr.id}
                        className="bg-slate-950/60 border border-white/5 rounded-lg px-3 py-2 flex items-center justify-between gap-2 text-xs"
                      >
                        <div className="min-w-0">
                          <span className="font-bold text-white block truncate">{tr.playerName}</span>
                          <span className="text-[11px] text-slate-400 font-mono">
                            {tr.type.toUpperCase()} · {tr.position} · {tr.overall} OVR · Wk {tr.week}
                          </span>
                        </div>
                        <span className="font-mono font-bold text-amber-400 shrink-0">
                          {tr.type === 'renewal'
                            ? `${tr.contractYears}y`
                            : tr.fee > 0
                              ? `£${(tr.fee / 1000000).toFixed(1)}M`
                              : 'Free'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}

            {/* Division Honor Roll: Champions & Movement */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

              {/* Premier League */}
              <div className="bg-slate-900/80 border border-white/10 rounded-xl p-4 space-y-2.5">
                <div className="flex items-center justify-between border-b border-white/5 pb-2">
                  <span className="text-xs font-bold text-white uppercase">Premier League</span>
                  <span className="text-xs sm:text-[10px] font-mono text-amber-400 font-bold">Tier 1</span>
                </div>
                <div className="text-xs space-y-1.5">
                  <div>
                    <span className="text-xs sm:text-[10px] text-slate-400 block">🏆 Champions:</span>
                    <span className="font-bold text-amber-300">{summary.tier1.champion.name}</span>
                  </div>
                  <div>
                    <span className="text-xs sm:text-[10px] text-slate-400 block">🥈 Runner-Up:</span>
                    <span className="font-medium text-slate-200">{summary.tier1.runnerUp.name}</span>
                  </div>
                  <div className="pt-1 border-t border-white/5">
                    <span className="text-xs sm:text-[10px] text-rose-400 block font-semibold">⬇ Relegated to Championship:</span>
                    <div className="text-xs sm:text-[11px] text-slate-300 flex flex-wrap gap-1 mt-0.5">
                      {summary.tier1.relegatedClubs.map(c => (
                        <span key={c.id} className="bg-slate-800 px-1.5 py-0.5 rounded text-xs sm:text-[10px]">{c.shortName}</span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Championship */}
              <div className="bg-slate-900/80 border border-white/10 rounded-xl p-4 space-y-2.5">
                <div className="flex items-center justify-between border-b border-white/5 pb-2">
                  <span className="text-xs font-bold text-white uppercase">Championship</span>
                  <span className="text-xs sm:text-[10px] font-mono text-blue-400 font-bold">Tier 2</span>
                </div>
                <div className="text-xs space-y-1.5">
                  <div>
                    <span className="text-xs sm:text-[10px] text-slate-400 block">🏆 Champions:</span>
                    <span className="font-bold text-amber-300">{summary.tier2.champion.name}</span>
                  </div>
                  <div>
                    <span className="text-xs sm:text-[10px] text-emerald-400 block font-semibold">⬆ Promoted to Premier League:</span>
                    <div className="text-xs sm:text-[11px] text-slate-300 flex flex-wrap gap-1 mt-0.5">
                      {summary.tier2.promotedClubs.map(c => (
                        <span key={c.id} className="bg-emerald-950/60 border border-emerald-500/30 text-emerald-300 px-1.5 py-0.5 rounded text-xs sm:text-[10px] font-bold">{c.shortName}</span>
                      ))}
                    </div>
                  </div>
                  <div className="pt-1 border-t border-white/5">
                    <span className="text-xs sm:text-[10px] text-rose-400 block font-semibold">⬇ Relegated to League One:</span>
                    <div className="text-xs sm:text-[11px] text-slate-300 flex flex-wrap gap-1 mt-0.5">
                      {summary.tier2.relegatedClubs.map(c => (
                        <span key={c.id} className="bg-slate-800 px-1.5 py-0.5 rounded text-xs sm:text-[10px]">{c.shortName}</span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* League One */}
              <div className="bg-slate-900/80 border border-white/10 rounded-xl p-4 space-y-2.5">
                <div className="flex items-center justify-between border-b border-white/5 pb-2">
                  <span className="text-xs font-bold text-white uppercase">League One</span>
                  <span className="text-xs sm:text-[10px] font-mono text-slate-400 font-bold">Tier 3</span>
                </div>
                <div className="text-xs space-y-1.5">
                  <div>
                    <span className="text-xs sm:text-[10px] text-slate-400 block">🏆 Champions:</span>
                    <span className="font-bold text-amber-300">{summary.tier3.champion.name}</span>
                  </div>
                  <div>
                    <span className="text-xs sm:text-[10px] text-emerald-400 block font-semibold">⬆ Promoted to Championship:</span>
                    <div className="text-xs sm:text-[11px] text-slate-300 flex flex-wrap gap-1 mt-0.5">
                      {summary.tier3.promotedClubs.map(c => (
                        <span key={c.id} className="bg-emerald-950/60 border border-emerald-500/30 text-emerald-300 px-1.5 py-0.5 rounded text-xs sm:text-[10px] font-bold">{c.shortName}</span>
                      ))}
                    </div>
                  </div>
                  <div className="pt-1 border-t border-white/5">
                    <span className="text-xs sm:text-[10px] text-slate-500 block">⬇ Relegation zone ratified</span>
                  </div>
                </div>
              </div>

            </div>
          </div>
        )}

        {/* Tab 2: Retirements & Generational Turnover */}
        {activeTab === 'retirements' && (
          <div className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div className="bg-slate-900 border border-white/10 rounded-xl p-3.5">
                <span className="text-slate-400 block">Players Retiring (33–42)</span>
                <span className="text-xl font-extrabold font-mono text-white tabular-nums mt-0.5 block">
                  {retirementsList.length}
                </span>
              </div>
              <div className="bg-slate-900 border border-white/10 rounded-xl p-3.5">
                <span className="text-slate-400 block">My Club Retirees</span>
                <span className="text-xl font-extrabold font-mono text-amber-400 tabular-nums mt-0.5 block">
                  {retirementsList.filter(r => r.isUserClub).length}
                </span>
              </div>
              <div className="bg-slate-900 border border-white/10 rounded-xl p-3.5">
                <span className="text-slate-400 block">League Academy Promotions</span>
                <span className="text-xl font-extrabold font-mono text-emerald-400 tabular-nums mt-0.5 block">
                  {summary.totalLeaguePromotions ?? topGraduates.length}
                </span>
              </div>
            </div>

            {/* Retirements Filter & List */}
            <div className="bg-slate-900/80 border border-white/10 rounded-xl p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-bold text-white">End-of-Season Retirements Roll</h3>
                  <p className="text-xs text-slate-400">
                    Veterans hanging up their boots across all three divisions (ages 33–42; goalkeepers retire later on average).
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-950 border border-white/10 rounded-lg">
                  {([
                    { id: 'ALL', label: 'All' },
                    { id: 'CLUB', label: 'My Club' },
                    { id: 1, label: 'Tier 1' },
                    { id: 2, label: 'Tier 2' },
                    { id: 3, label: 'Tier 3' },
                  ] as const).map(opt => (
                    <button
                      key={String(opt.id)}
                      type="button"
                      onClick={() => setRetirementFilter(opt.id)}
                      className={`px-2.5 py-1 min-h-9 lg:min-h-0 text-xs font-semibold rounded transition-colors cursor-pointer whitespace-nowrap ${
                        retirementFilter === opt.id
                          ? 'bg-amber-400 text-slate-950'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {filteredRetirements.length === 0 ? (
                <div className="py-6 text-center text-xs text-slate-400">
                  No players in this filter are retiring at the conclusion of Season {summary.seasonYear}/{summary.seasonYear + 1}.
                </div>
              ) : (
                <div className="divide-y divide-white/5 max-h-72 overflow-y-auto pr-1">
                  {filteredRetirements.slice(0, 60).map(ret => (
                    <div
                      key={ret.playerId}
                      className="py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs"
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className={`font-bold ${ret.isUserClub ? 'text-amber-300' : 'text-white'}`}>
                            {ret.name}
                          </span>
                          <span className="text-slate-500 font-mono">
                            {ret.position} · Age {ret.age} · OVR {ret.overall}
                          </span>
                          {ret.isUserClub && (
                            <span className="text-amber-400 font-semibold">· Your Club</span>
                          )}
                        </div>
                        <div className="text-slate-400 mt-0.5">
                          {ret.clubName} · {ret.nationality}
                        </div>
                      </div>

                      <div className="text-right font-mono tabular-nums text-slate-300 shrink-0">
                        {ret.appearances} apps · {ret.position === 'GK' ? `${ret.cleanSheets} CS` : `${ret.goals}G ${ret.assists}A`}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* League-Wide Academy Graduates */}
            <div className="bg-slate-900/80 border border-white/10 rounded-xl p-4 space-y-3">
              <div>
                <h3 className="text-sm font-bold text-white">Notable Pyramid Academy Graduates</h3>
                <p className="text-xs text-slate-400">
                  Top youth prospects promoted into senior football across the Premier League, Championship, and League One this season.
                </p>
              </div>

              {topGraduates.length === 0 ? (
                <p className="text-xs text-slate-400 py-2">
                  Clubs will evaluate and promote fresh academy graduates during the upcoming summer transition.
                </p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                  {topGraduates.map(grad => (
                    <div
                      key={`${grad.playerId}_${grad.clubId}`}
                      className="bg-slate-950/60 border border-white/5 rounded-lg px-3 py-2.5 flex items-center justify-between gap-2 text-xs"
                    >
                      <div className="min-w-0">
                        <span className="font-bold text-white block truncate">{grad.playerName}</span>
                        <span className="text-slate-400">
                          {grad.clubName} · {grad.position} · Age {grad.age}
                        </span>
                      </div>
                      <span className="font-mono font-extrabold text-emerald-400 tabular-nums shrink-0">
                        {grad.overall} OVR
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab 3: Academy Graduation Review */}
        {activeTab === 'academy' && (
          <div className="space-y-4">
            <div className="bg-slate-900 border border-white/10 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
              <div>
                <span className="text-amber-400 font-bold uppercase tracking-wider block text-xs sm:text-[11px]">
                  Seasonal Academy Graduation Review
                </span>
                <span className="text-slate-300 mt-0.5 block">
                  Decide which graduating academy prospects will sign senior professional contracts or be let go before the summer transition.
                </span>
              </div>
              <div className="flex items-center gap-3 shrink-0 font-mono sm:text-right">
                <div>
                  <span className="text-xs sm:text-[10px] text-slate-400 block">Senior Squad</span>
                  <span className={`font-bold ${squadSlotsLeft === 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                    {playerClub?.squad.length} / 25
                  </span>
                </div>
                <div>
                  <span className="text-xs sm:text-[10px] text-slate-400 block">Wage Space</span>
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
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
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
                        <span className="text-xs sm:text-[10px] font-mono px-2 py-0.5 bg-white/5 border border-white/10 rounded text-slate-300">
                          {prospect.roleDetail}
                        </span>
                      </div>

                      <div className="mt-2 text-xs font-mono flex items-center justify-between bg-black/40 px-2.5 py-1.5 rounded-lg border border-white/5">
                        <span className="text-slate-400">Current OVR: <strong className="text-white">{prospect.overall}</strong> <span className="text-slate-500 text-xs sm:text-[10px]">/ 99</span></span>
                        <span className="text-emerald-400 font-bold">{prospect.momentumTier}</span>
                      </div>

                      <div className="text-xs sm:text-[11px] text-amber-300/90 font-medium mt-1.5">
                        ★ {prospect.trait}
                      </div>

                      <p className="text-xs sm:text-[11px] text-slate-400 italic mt-1 line-clamp-2">
                        "{prospect.scoutReport}"
                      </p>
                    </div>

                    <div className="pt-2 border-t border-white/10 flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => handleRelease(prospect)}
                        className="min-h-11 lg:min-h-0 px-2.5 py-1 text-xs text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded transition-colors flex items-center gap-1 cursor-pointer font-medium"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Let Go</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handlePromote(prospect)}
                        disabled={squadSlotsLeft === 0}
                        className="min-h-11 lg:min-h-0 px-3 py-1 bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 disabled:opacity-50 text-slate-950 font-bold text-xs rounded-lg shadow-sm flex items-center gap-1 transition-all cursor-pointer active:scale-95"
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
      </div>
    </Modal>
  );
};
