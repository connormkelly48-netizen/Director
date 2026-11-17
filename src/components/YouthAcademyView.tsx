/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo, useState } from 'react';
import {
  Club,
  AcademyPlayer,
  PlayerPosition,
  Manager,
  DelegationMatrix,
  TransferRecord,
  Director,
  Owner,
  LeagueTier,
  MomentumTier,
} from '../types/game';
import {
  GraduationCap,
  Trash2,
  ArrowUpRight,
  ShieldCheck,
  Sparkles,
  AlertCircle,
  CheckCircle2,
  Search,
  RotateCcw,
  ArrowUpDown,
  Globe,
} from 'lucide-react';
import { sounds } from '../services/soundEffects';
import {
  calculatePoachCompensation,
  evaluatePoachProspect,
  evaluateProspect,
  getAcademyPromotionWage,
  MAX_USER_ACADEMY_CAPACITY,
  poachAcademyProspect,
  promoteAcademyPlayer,
  releaseAcademyPlayer,
} from '../services/simulationEngine';
import { Modal } from './ui/Modal';

interface YouthAcademyViewProps {
  club: Club;
  allClubs?: Club[];
  manager?: Manager;
  director?: Director;
  owner?: Owner;
  delegation?: DelegationMatrix;
  transferHistory?: TransferRecord[];
  seasonYear: number;
  currentWeek?: number;
  onUpdateClub: (updatedClub: Club) => void;
  onCompletePoach?: (
    updatedClubs: Club[],
    updatedDirector: Director,
    record: TransferRecord
  ) => void;
}

type AcademyTab = 'mine' | 'rivals';
type RivalSortField = 'overall' | 'fee' | 'age' | 'momentum';

interface RivalProspectRow {
  prospect: AcademyPlayer;
  sellingClub: Club;
  compensationFee: number;
}

const MOMENTUM_WEIGHT: Record<MomentumTier, number> = {
  'Generational Prodigy': 4,
  'High Tempo': 3,
  'Late Surge': 2,
  'Steady Climber': 1,
};

function getTierName(tier: LeagueTier): string {
  if (tier === 1) return 'Premier League';
  if (tier === 2) return 'Championship';
  return 'League One';
}

function getMomentumToneClass(tier: MomentumTier): string {
  if (tier === 'Generational Prodigy') return 'text-emerald-400';
  if (tier === 'High Tempo') return 'text-cyan-400';
  if (tier === 'Late Surge') return 'text-amber-400';
  return 'text-slate-300';
}

export const YouthAcademyView: React.FC<YouthAcademyViewProps> = ({
  club,
  allClubs = [],
  manager,
  director,
  owner,
  delegation,
  transferHistory,
  seasonYear,
  currentWeek = 1,
  onUpdateClub,
  onCompletePoach,
}) => {
  const [activeTab, setActiveTab] = useState<AcademyTab>('mine');
  const [selectedPos, setSelectedPos] = useState<PlayerPosition | 'ALL'>('ALL');
  const [selectedProspect, setSelectedProspect] = useState<AcademyPlayer | null>(null);
  const [promoteWage, setPromoteWage] = useState<number>(2500);
  const [promoteYears, setPromoteYears] = useState<number>(3);
  const [feedback, setFeedback] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Rival Academies Scouting Filters & Poach Modal State
  const [rivalSearch, setRivalSearch] = useState('');
  const [rivalTier, setRivalTier] = useState<LeagueTier | 'ALL'>('ALL');
  const [rivalPos, setRivalPos] = useState<PlayerPosition | 'ALL'>('ALL');
  const [rivalMomentum, setRivalMomentum] = useState<MomentumTier | 'ALL'>('ALL');
  const [rivalClubId, setRivalClubId] = useState<string>('ALL');
  const [rivalSort, setRivalSort] = useState<RivalSortField>('overall');
  const [rivalSortDir, setRivalSortDir] = useState<'asc' | 'desc'>('desc');

  const [poachTarget, setPoachTarget] = useState<RivalProspectRow | null>(null);
  const [poachFee, setPoachFee] = useState<number>(500000);
  const [poachDestination, setPoachDestination] = useState<'academy' | 'senior'>('academy');
  const [poachWage, setPoachWage] = useState<number>(2500);
  const [poachYears, setPoachYears] = useState<number>(4);
  const [poachError, setPoachError] = useState<string | null>(null);

  const academyList = club.academy || [];

  const filteredProspects = academyList.filter(p => {
    if (selectedPos === 'ALL') return true;
    return p.position === selectedPos;
  });

  const currentSquadWages = club.squad.reduce((acc, p) => acc + p.wage, 0);
  const wageSpace = Math.max(0, club.wageBudget - currentSquadWages);
  const squadSlotsLeft = Math.max(0, 25 - club.squad.length);

  const topProspect = [...academyList].sort((a, b) => {
    const diff = MOMENTUM_WEIGHT[b.momentumTier] - MOMENTUM_WEIGHT[a.momentumTier];
    if (diff !== 0) return diff;
    return b.overall - a.overall;
  })[0];

  // Build Rival Academies Directory
  const rivalClubs = useMemo(
    () =>
      allClubs
        .filter(c => c.id !== club.id)
        .sort((a, b) => a.tier - b.tier || a.name.localeCompare(b.name)),
    [allClubs, club.id]
  );

  const allRivalProspects = useMemo<RivalProspectRow[]>(() => {
    const rows: RivalProspectRow[] = [];
    for (const c of rivalClubs) {
      for (const prospect of c.academy || []) {
        rows.push({
          prospect,
          sellingClub: c,
          compensationFee: calculatePoachCompensation(prospect, c),
        });
      }
    }
    return rows;
  }, [rivalClubs]);

  const filteredRivals = useMemo(() => {
    const q = rivalSearch.trim().toLowerCase();
    const filtered = allRivalProspects.filter(({ prospect, sellingClub }) => {
      if (rivalTier !== 'ALL' && sellingClub.tier !== rivalTier) return false;
      if (rivalClubId !== 'ALL' && sellingClub.id !== rivalClubId) return false;
      if (rivalPos !== 'ALL' && prospect.position !== rivalPos) return false;
      if (rivalMomentum !== 'ALL' && prospect.momentumTier !== rivalMomentum) return false;
      if (q) {
        const hay = `${prospect.name} ${sellingClub.name} ${sellingClub.shortName} ${prospect.roleDetail} ${prospect.trait}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    filtered.sort((a, b) => {
      let cmp = 0;
      if (rivalSort === 'overall') cmp = a.prospect.overall - b.prospect.overall;
      else if (rivalSort === 'fee') cmp = a.compensationFee - b.compensationFee;
      else if (rivalSort === 'age') cmp = a.prospect.age - b.prospect.age;
      else cmp = MOMENTUM_WEIGHT[a.prospect.momentumTier] - MOMENTUM_WEIGHT[b.prospect.momentumTier];

      if (cmp === 0) cmp = a.prospect.overall - b.prospect.overall;
      return rivalSortDir === 'desc' ? -cmp : cmp;
    });

    return filtered;
  }, [allRivalProspects, rivalSearch, rivalTier, rivalClubId, rivalPos, rivalMomentum, rivalSort, rivalSortDir]);

  const hasActiveRivalFilters =
    rivalSearch.trim() !== '' ||
    rivalTier !== 'ALL' ||
    rivalClubId !== 'ALL' ||
    rivalPos !== 'ALL' ||
    rivalMomentum !== 'ALL';

  const resetRivalFilters = () => {
    sounds.playClick();
    setRivalSearch('');
    setRivalTier('ALL');
    setRivalClubId('ALL');
    setRivalPos('ALL');
    setRivalMomentum('ALL');
  };

  const handleOpenPromote = (prospect: AcademyPlayer) => {
    sounds.playClick();
    setSelectedProspect(prospect);
    setPromoteWage(getAcademyPromotionWage(club.tier));
    setPromoteYears(3);
  };

  const handleConfirmPromote = () => {
    if (!selectedProspect) return;

    const result = promoteAcademyPlayer(club, selectedProspect.id, promoteWage, promoteYears, manager);

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

  const handleOpenPoach = (row: RivalProspectRow) => {
    sounds.playClick();
    setPoachTarget(row);
    setPoachFee(row.compensationFee);
    setPoachDestination(
      row.prospect.age >= 17 && academyList.length >= MAX_USER_ACADEMY_CAPACITY
        ? 'senior'
        : 'academy'
    );
    setPoachWage(getAcademyPromotionWage(club.tier));
    setPoachYears(4);
    setPoachError(null);
  };

  const livePoachEvaluation = useMemo(() => {
    if (!poachTarget) return null;
    return evaluatePoachProspect({
      prospect: poachTarget.prospect,
      sellingClub: poachTarget.sellingClub,
      buyingClub: club,
      owner,
      offeredFee: poachFee,
      destination: poachDestination,
      wage: poachWage,
    });
  }, [poachTarget, club, owner, poachFee, poachDestination, poachWage]);

  const handleConfirmPoach = () => {
    if (!poachTarget || !director || !onCompletePoach) return;

    const result = poachAcademyProspect({
      prospect: poachTarget.prospect,
      sellingClub: poachTarget.sellingClub,
      buyingClub: club,
      clubs: allClubs,
      director,
      owner,
      manager,
      offeredFee: poachFee,
      destination: poachDestination,
      wage: poachWage,
      contractYears: poachYears,
      seasonYear,
      currentWeek,
    });

    if (!result.success) {
      sounds.playCrisis();
      setPoachError(result.error);
      return;
    }

    sounds.playSigningStamp();
    onCompletePoach(result.updatedClubs, result.updatedDirector, result.record);
    setFeedback({
      message: result.message,
      type: 'success',
    });
    setPoachTarget(null);
    setPoachError(null);
  };

  return (
    <div className="space-y-6">
      {/* Academy Header Banner */}
      <div className="bg-[#111827] border border-white/10 rounded-2xl p-4 sm:p-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold text-amber-400 mb-1">
              <GraduationCap className="w-4 h-4 shrink-0" />
              <span>Youth Development & Pyramid Scouting</span>
            </div>
            <h1 className="text-2xl lg:text-3xl font-extrabold text-white tracking-tight">
              {club.name} Youth Academy
            </h1>
            <p className="text-slate-400 text-xs mt-1 max-w-[75ch]">
              Develop homegrown scholars (ages 15–18), promote standout talent to the senior roster, or scout rival academies across all three divisions to poach emerging prodigies.
            </p>
            {delegation?.youthPromotion === 'manager' && (
              <p className="text-emerald-400 text-xs font-medium mt-1.5 flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
                <span>Head Coach will promote ready prospects automatically</span>
              </p>
            )}
          </div>

          {/* Quick Metrics */}
          <div className="grid grid-cols-3 gap-2.5 shrink-0">
            <div className="px-3.5 py-2 bg-slate-900 border border-white/10 rounded-xl text-right">
              <span className="text-xs text-slate-400 block">Academy</span>
              <span className="text-base font-bold font-mono text-white tabular-nums">
                {academyList.length} / {MAX_USER_ACADEMY_CAPACITY}
              </span>
            </div>
            <div className="px-3.5 py-2 bg-slate-900 border border-white/10 rounded-xl text-right">
              <span className="text-xs text-slate-400 block">Senior Slots</span>
              <span className={`text-base font-bold font-mono tabular-nums ${squadSlotsLeft === 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                {club.squad.length} / 25
              </span>
            </div>
            <div className="px-3.5 py-2 bg-slate-900 border border-white/10 rounded-xl text-right">
              <span className="text-xs text-slate-400 block">War Chest</span>
              <span className="text-base font-bold font-mono text-amber-400 tabular-nums">
                £{(club.transferBudget / 1000000).toFixed(1)}M
              </span>
            </div>
          </div>
        </div>

        {/* Workspace Mode Switch & Spotlight */}
        <div className="mt-5 pt-4 border-t border-white/10 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="inline-flex items-center gap-1 p-1 bg-slate-900 border border-white/10 rounded-xl w-full sm:w-auto">
            <button
              type="button"
              onClick={() => {
                sounds.playClick();
                setActiveTab('mine');
              }}
              className={`flex-1 sm:flex-initial min-h-11 lg:min-h-0 px-4 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer whitespace-nowrap flex items-center justify-center gap-2 ${
                activeTab === 'mine'
                  ? 'bg-amber-400 text-slate-950 shadow-sm'
                  : 'text-slate-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <GraduationCap className="w-3.5 h-3.5 shrink-0" />
              <span>My Academy ({academyList.length})</span>
            </button>
            <button
              type="button"
              onClick={() => {
                sounds.playClick();
                setActiveTab('rivals');
              }}
              className={`flex-1 sm:flex-initial min-h-11 lg:min-h-0 px-4 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer whitespace-nowrap flex items-center justify-center gap-2 ${
                activeTab === 'rivals'
                  ? 'bg-amber-400 text-slate-950 shadow-sm'
                  : 'text-slate-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <Globe className="w-3.5 h-3.5 shrink-0" />
              <span>Rival Academies ({allRivalProspects.length})</span>
            </button>
          </div>

          {topProspect && activeTab === 'mine' && (
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="text-amber-400 font-semibold flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 shrink-0" />
                <span>Top Scholar:</span>
              </span>
              <span className="font-bold text-white">{topProspect.name}</span>
              <span className="text-slate-500" aria-hidden="true">·</span>
              <span className="text-slate-300 font-mono">{topProspect.position}</span>
              <span className="text-slate-500" aria-hidden="true">·</span>
              <span className={`font-mono font-bold ${getMomentumToneClass(topProspect.momentumTier)}`}>
                {topProspect.momentumTier}
              </span>
            </div>
          )}

          {activeTab === 'rivals' && (
            <div className="text-xs text-slate-400 font-mono tabular-nums">
              Scouting {rivalClubs.length} Rival Academies · Annual Intake Wk 46
            </div>
          )}
        </div>
      </div>

      {/* Action / Error Notification */}
      {feedback && (
        <div
          className={`p-4 rounded-xl border text-xs flex items-center justify-between gap-2 transition-all ${
            feedback.type === 'error'
              ? 'bg-rose-950/40 border-rose-500/40 text-rose-300'
              : 'bg-emerald-950/40 border-emerald-500/40 text-emerald-300'
          }`}
        >
          <div className="flex items-center gap-2">
            {feedback.type === 'error' ? (
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
            ) : (
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
            )}
            <span>{feedback.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            aria-label="Dismiss notification"
            className="min-h-11 min-w-11 lg:min-h-0 lg:min-w-0 flex items-center justify-center rounded-lg text-slate-400 hover:text-white cursor-pointer font-mono shrink-0"
          >
            ✕
          </button>
        </div>
      )}

      {/* TAB 1: MY ACADEMY */}
      {activeTab === 'mine' && (
        <>
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-900 border border-white/10 rounded-xl max-w-full">
              {(['ALL', 'GK', 'DEF', 'MID', 'FWD'] as const).map(pos => (
                <button
                  key={pos}
                  type="button"
                  onClick={() => {
                    sounds.playClick();
                    setSelectedPos(pos);
                  }}
                  className={`px-3.5 py-1.5 min-h-11 lg:min-h-0 text-xs font-semibold rounded-lg transition-all cursor-pointer whitespace-nowrap ${
                    selectedPos === pos
                      ? 'bg-amber-400 text-slate-950 shadow-sm'
                      : 'text-slate-400 hover:text-white hover:bg-white/5'
                  }`}
                >
                  {pos === 'ALL'
                    ? 'All Academy'
                    : pos === 'GK'
                      ? 'Goalkeepers'
                      : pos === 'DEF'
                        ? 'Defenders'
                        : pos === 'MID'
                          ? 'Midfielders'
                          : 'Forwards'}
                </button>
              ))}
            </div>

            <div className="text-xs text-slate-400 flex items-center gap-2 font-mono tabular-nums">
              <span>Intake {seasonYear}/{seasonYear + 1}</span>
              <span className="text-slate-600" aria-hidden="true">·</span>
              <span>Wage Room £{(wageSpace / 1000).toFixed(0)}k/wk</span>
            </div>
          </div>

          {filteredProspects.length === 0 ? (
            <div className="bg-[#111827] border border-white/10 rounded-2xl p-12 text-center space-y-3">
              <GraduationCap className="w-12 h-12 text-slate-600 mx-auto" />
              <h3 className="text-base font-bold text-white">No Academy Prospects In This Position</h3>
              <p className="text-xs text-slate-400 max-w-md mx-auto">
                {selectedPos === 'ALL'
                  ? 'All prospects from this cohort have been promoted or released. Scout Rival Academies or wait for the next annual intake.'
                  : `There are currently no ${selectedPos} prospects in your academy.`}
              </p>
              <div className="flex items-center justify-center gap-2 pt-1">
                {selectedPos !== 'ALL' && (
                  <button
                    type="button"
                    onClick={() => setSelectedPos('ALL')}
                    className="min-h-11 lg:min-h-0 px-4 py-2 text-xs font-bold rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-slate-200 cursor-pointer"
                  >
                    Show All Positions
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setActiveTab('rivals')}
                  className="min-h-11 lg:min-h-0 px-4 py-2 text-xs font-bold rounded-lg bg-amber-400 hover:bg-amber-300 text-slate-950 cursor-pointer"
                >
                  Scout Rival Academies
                </button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
              {filteredProspects.map(prospect => {
                const evalResult = evaluateProspect(prospect, club, manager, {
                  transferHistory,
                  seasonYear,
                });
                const statusLabel = evalResult.promote
                  ? { label: 'Ready for promotion', className: 'text-emerald-400' }
                  : evalResult.reason.startsWith('age ')
                    ? { label: 'Too young', className: 'text-slate-400' }
                    : evalResult.reason === 'below threshold'
                      ? { label: 'Developing', className: 'text-slate-400' }
                      : { label: `Blocked: ${evalResult.reason}`, className: 'text-amber-300' };

                return (
                  <div
                    key={prospect.id}
                    className="bg-[#111827] border border-white/10 hover:border-amber-400/40 rounded-xl p-4 sm:p-5 transition-all flex flex-col justify-between space-y-4 group"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <h3 className="text-base font-bold text-white group-hover:text-amber-400 transition-colors truncate">
                            {prospect.name}
                          </h3>
                          <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-400 mt-0.5">
                            <span className="font-semibold text-slate-200 font-mono">{prospect.position}</span>
                            <span aria-hidden="true">·</span>
                            <span className="font-mono tabular-nums">{prospect.age} yrs</span>
                            <span aria-hidden="true">·</span>
                            <span>{prospect.nationality}</span>
                          </div>
                        </div>
                        <span className="text-lg font-extrabold font-mono text-white tabular-nums shrink-0">
                          {prospect.overall}
                        </span>
                      </div>

                      <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 text-xs">
                        <span className="text-slate-300 truncate">{prospect.roleDetail}</span>
                        <span className={`font-semibold ${statusLabel.className}`}>
                          {statusLabel.label}
                        </span>
                      </div>

                      <div className="mt-3 pt-3 border-t border-white/10 space-y-2">
                        <div className="flex items-center justify-between text-xs font-mono">
                          <span className="text-amber-400 font-medium">{prospect.trait}</span>
                          <span className={`font-bold ${getMomentumToneClass(prospect.momentumTier)}`}>
                            {prospect.momentumTier}
                          </span>
                        </div>

                        <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-amber-400 to-emerald-400 rounded-full transition-all"
                            style={{ width: `${(prospect.overall / 99) * 100}%` }}
                          />
                        </div>
                      </div>

                      <p className="mt-3 text-xs text-slate-400 leading-relaxed italic border-t border-white/5 pt-2">
                        "{prospect.scoutReport}"
                      </p>
                    </div>

                    <div className="pt-3 border-t border-white/10 flex flex-wrap items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => handleRelease(prospect)}
                        title="Let go of academy player"
                        className="px-2.5 py-1.5 min-h-11 lg:min-h-0 text-xs text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-all active:scale-95 flex items-center gap-1 cursor-pointer font-medium"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Release</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleOpenPromote(prospect)}
                        className="flex-1 sm:flex-initial justify-center px-3.5 py-1.5 min-h-11 lg:min-h-0 bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-slate-950 font-bold text-xs rounded-lg shadow-sm flex items-center gap-1.5 transition-all cursor-pointer active:scale-95 whitespace-nowrap"
                      >
                        <ArrowUpRight className="w-3.5 h-3.5" />
                        <span>Promote to Senior</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* TAB 2: RIVAL ACADEMIES SCOUTING & POACHING */}
      {activeTab === 'rivals' && (
        <div className="space-y-4">
          {/* Search & Filters Toolbar */}
          <div className="bg-[#111827] border border-white/10 rounded-2xl p-4 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-2.5">
              {/* Search */}
              <div className="relative lg:col-span-2">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="search"
                  value={rivalSearch}
                  onChange={e => setRivalSearch(e.target.value)}
                  placeholder="Search prospect, club, trait..."
                  className="w-full min-h-11 lg:min-h-9 pl-9 pr-3 py-1.5 bg-slate-900 border border-white/10 rounded-lg text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-amber-400"
                />
              </div>

              {/* Tier Filter */}
              <select
                aria-label="Filter by division"
                value={rivalTier}
                onChange={e => {
                  const val = e.target.value;
                  setRivalTier(val === 'ALL' ? 'ALL' : (Number(val) as LeagueTier));
                  setRivalClubId('ALL');
                }}
                className="min-h-11 lg:min-h-9 px-3 py-1.5 bg-slate-900 border border-white/10 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-amber-400"
              >
                <option value="ALL">All Divisions</option>
                <option value="1">Premier League</option>
                <option value="2">Championship</option>
                <option value="3">League One</option>
              </select>

              {/* Club Filter */}
              <select
                aria-label="Filter by rival club"
                value={rivalClubId}
                onChange={e => setRivalClubId(e.target.value)}
                className="min-h-11 lg:min-h-9 px-3 py-1.5 bg-slate-900 border border-white/10 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-amber-400"
              >
                <option value="ALL">All Rival Clubs</option>
                {rivalClubs
                  .filter(c => rivalTier === 'ALL' || c.tier === rivalTier)
                  .map(c => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.academy?.length || 0})
                    </option>
                  ))}
              </select>

              {/* Momentum Filter */}
              <select
                aria-label="Filter by momentum"
                value={rivalMomentum}
                onChange={e => setRivalMomentum(e.target.value as MomentumTier | 'ALL')}
                className="min-h-11 lg:min-h-9 px-3 py-1.5 bg-slate-900 border border-white/10 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-amber-400"
              >
                <option value="ALL">All Momentum Tiers</option>
                <option value="Generational Prodigy">Generational Prodigy</option>
                <option value="High Tempo">High Tempo</option>
                <option value="Late Surge">Late Surge</option>
                <option value="Steady Climber">Steady Climber</option>
              </select>

              {/* Sort Selector */}
              <div className="flex items-center gap-1.5">
                <select
                  aria-label="Sort prospects"
                  value={rivalSort}
                  onChange={e => setRivalSort(e.target.value as RivalSortField)}
                  className="flex-1 min-h-11 lg:min-h-9 px-3 py-1.5 bg-slate-900 border border-white/10 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-amber-400"
                >
                  <option value="overall">Sort: Overall</option>
                  <option value="fee">Sort: Compensation</option>
                  <option value="age">Sort: Age</option>
                  <option value="momentum">Sort: Momentum</option>
                </select>
                <button
                  type="button"
                  onClick={() => setRivalSortDir(d => (d === 'desc' ? 'asc' : 'desc'))}
                  aria-label="Toggle sort direction"
                  className="min-h-11 min-w-11 lg:min-h-9 lg:min-w-9 px-2.5 bg-slate-900 border border-white/10 hover:border-amber-400/40 rounded-lg text-slate-300 hover:text-white flex items-center justify-center cursor-pointer"
                >
                  <ArrowUpDown className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-900 border border-white/10 rounded-xl">
                {(['ALL', 'GK', 'DEF', 'MID', 'FWD'] as const).map(pos => (
                  <button
                    key={pos}
                    type="button"
                    onClick={() => {
                      sounds.playClick();
                      setRivalPos(pos);
                    }}
                    className={`px-3 py-1.5 min-h-10 lg:min-h-0 text-xs font-semibold rounded-lg transition-all cursor-pointer whitespace-nowrap ${
                      rivalPos === pos
                        ? 'bg-amber-400 text-slate-950'
                        : 'text-slate-400 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    {pos === 'ALL' ? 'All Pos' : pos}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-3 text-xs text-slate-400 font-mono tabular-nums">
                <span>{filteredRivals.length} prospects found</span>
                {hasActiveRivalFilters && (
                  <button
                    type="button"
                    onClick={resetRivalFilters}
                    className="inline-flex items-center gap-1 text-amber-400 hover:text-amber-300 font-sans font-semibold cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Reset Filters</span>
                  </button>
                )}
              </div>
            </div>
          </div>

          {filteredRivals.length === 0 ? (
            <div className="bg-[#111827] border border-white/10 rounded-2xl p-10 text-center space-y-3">
              <Globe className="w-10 h-10 text-slate-600 mx-auto" />
              <h3 className="text-base font-bold text-white">No Matching Rival Academy Prospects</h3>
              <p className="text-xs text-slate-400 max-w-md mx-auto">
                Adjust your division, club, position, or search filters to view emerging talent across the league.
              </p>
              {hasActiveRivalFilters && (
                <button
                  type="button"
                  onClick={resetRivalFilters}
                  className="min-h-11 lg:min-h-0 px-4 py-2 bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold text-xs rounded-lg cursor-pointer"
                >
                  Reset Filters
                </button>
              )}
            </div>
          ) : (
            <>
              {/* Desktop High-Density Scouting Table */}
              <div className="hidden lg:block bg-[#111827] border border-white/10 rounded-2xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-white/10 bg-slate-900/70 text-xs text-slate-400 font-semibold">
                        <th className="py-3 px-4">Prospect</th>
                        <th className="py-3 px-3">Club & Division</th>
                        <th className="py-3 px-3">Pos</th>
                        <th className="py-3 px-3 text-right">Age</th>
                        <th className="py-3 px-3 text-right">OVR</th>
                        <th className="py-3 px-3">Momentum & Trait</th>
                        <th className="py-3 px-3 text-right">Compensation</th>
                        <th className="py-3 px-4 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5 text-xs">
                      {filteredRivals.slice(0, 80).map(({ prospect, sellingClub, compensationFee }) => {
                        const canAfford = club.transferBudget >= compensationFee && club.balance >= compensationFee;
                        return (
                          <tr key={prospect.id} className="hover:bg-white/[0.03] transition-colors">
                            <td className="py-2.5 px-4">
                              <div className="font-bold text-white">{prospect.name}</div>
                              <div className="text-slate-400">
                                {prospect.roleDetail} · {prospect.nationality}
                              </div>
                            </td>
                            <td className="py-2.5 px-3">
                              <div className="flex items-center gap-2">
                                <span
                                  className="w-2.5 h-2.5 rounded-full shrink-0"
                                  style={{ backgroundColor: sellingClub.primaryColor }}
                                />
                                <span className="font-semibold text-slate-200">{sellingClub.name}</span>
                              </div>
                              <div className="text-slate-400 pl-4">{getTierName(sellingClub.tier)}</div>
                            </td>
                            <td className="py-2.5 px-3 font-mono font-bold text-slate-200">
                              {prospect.position}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-300">
                              {prospect.age}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono tabular-nums font-extrabold text-white">
                              {prospect.overall}
                            </td>
                            <td className="py-2.5 px-3">
                              <div className={`font-semibold ${getMomentumToneClass(prospect.momentumTier)}`}>
                                {prospect.momentumTier}
                              </div>
                              <div className="text-slate-400">{prospect.trait}</div>
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                              <span className={canAfford ? 'text-amber-400 font-bold' : 'text-slate-400 font-semibold'}>
                                £{(compensationFee / 1000000).toFixed(2)}M
                              </span>
                            </td>
                            <td className="py-2.5 px-4 text-right">
                              <button
                                type="button"
                                onClick={() => handleOpenPoach( { prospect, sellingClub, compensationFee } )}
                                className="px-3 py-1.5 bg-amber-400/15 hover:bg-amber-400/25 border border-amber-400/40 text-amber-300 font-bold text-xs rounded-lg transition-colors cursor-pointer whitespace-nowrap"
                              >
                                Make Approach
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {filteredRivals.length > 80 && (
                  <div className="px-4 py-2.5 border-t border-white/10 text-xs text-slate-400 text-center font-mono">
                    Showing top 80 of {filteredRivals.length} matching prospects. Narrow filters to inspect specific clubs.
                  </div>
                )}
              </div>

              {/* Mobile Prospect Cards */}
              <div className="lg:hidden grid grid-cols-1 md:grid-cols-2 gap-3">
                {filteredRivals.slice(0, 50).map(({ prospect, sellingClub, compensationFee }) => {
                  const canAfford = club.transferBudget >= compensationFee && club.balance >= compensationFee;
                  return (
                    <div
                      key={prospect.id}
                      className="bg-[#111827] border border-white/10 rounded-xl p-4 space-y-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h3 className="font-bold text-white text-base truncate">{prospect.name}</h3>
                          <p className="text-xs text-slate-400">
                            {sellingClub.name} · {getTierName(sellingClub.tier)}
                          </p>
                          <p className="text-xs text-slate-400 font-mono mt-0.5">
                            {prospect.position} · Age {prospect.age} · {prospect.nationality}
                          </p>
                        </div>
                        <span className="font-mono font-extrabold text-lg text-white tabular-nums shrink-0">
                          {prospect.overall}
                        </span>
                      </div>

                      <div className="flex items-center justify-between text-xs pt-2 border-t border-white/10">
                        <div>
                          <span className={`font-semibold block ${getMomentumToneClass(prospect.momentumTier)}`}>
                            {prospect.momentumTier}
                          </span>
                          <span className="text-slate-400">{prospect.trait}</span>
                        </div>
                        <div className="text-right font-mono tabular-nums">
                          <span className="text-slate-400 block">Compensation</span>
                          <span className={canAfford ? 'text-amber-400 font-bold' : 'text-slate-400 font-bold'}>
                            £{(compensationFee / 1000000).toFixed(2)}M
                          </span>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleOpenPoach({ prospect, sellingClub, compensationFee })}
                        className="w-full min-h-11 px-4 py-2 bg-amber-400/15 hover:bg-amber-400/25 border border-amber-400/40 text-amber-300 font-bold text-xs rounded-lg transition-colors cursor-pointer"
                      >
                        Make Approach
                      </button>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}

      {/* Promotion Contract Dialog Modal */}
      <Modal
        isOpen={Boolean(selectedProspect)}
        onClose={() => setSelectedProspect(null)}
        maxWidthClass="max-w-md"
        borderClass="border-amber-400/30"
        ariaLabel={selectedProspect ? `Promote ${selectedProspect.name}` : 'Promote Academy Prospect'}
        header={
          selectedProspect && (
            <div>
              <span className="text-xs font-bold text-amber-400 block">
                Academy Graduation Contract
              </span>
              <h3 className="text-xl font-bold text-white mt-0.5">
                Promote {selectedProspect.name}
              </h3>
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400 mt-1 font-mono">
                <span>{selectedProspect.position}</span>
                <span aria-hidden="true">·</span>
                <span>Age {selectedProspect.age}</span>
                <span aria-hidden="true">·</span>
                <span className="text-emerald-400 font-semibold">{selectedProspect.momentumTier}</span>
              </div>
            </div>
          )
        }
        footer={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setSelectedProspect(null)}
              className="px-4 py-2 min-h-11 lg:min-h-0 text-xs font-medium text-slate-400 hover:text-white transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirmPromote}
              disabled={club.squad.length >= 25 || promoteWage > wageSpace}
              className="px-5 py-2 min-h-11 lg:min-h-0 bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 disabled:opacity-50 text-slate-950 font-bold text-xs rounded-lg shadow-md transition-all cursor-pointer"
            >
              Ratify Contract
            </button>
          </div>
        }
      >
        {selectedProspect && (
          <div className="space-y-4">
            <div className="bg-slate-900 border border-white/10 rounded-xl p-3 text-xs space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Current Senior Squad</span>
                <span className={`font-mono font-bold tabular-nums ${club.squad.length >= 25 ? 'text-rose-400' : 'text-slate-200'}`}>
                  {club.squad.length} / 25 players
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Weekly Wage Headroom</span>
                <span className="font-mono font-bold text-emerald-400 tabular-nums">
                  £{(wageSpace / 1000).toFixed(1)}k/wk
                </span>
              </div>
            </div>

            {club.squad.length >= 25 && (
              <div className="p-3 bg-rose-950/40 border border-rose-500/40 rounded-xl text-xs text-rose-300 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                <span>Squad is full at 25 players. Sell or release a senior squad player first.</span>
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Offered Weekly Professional Wage (£/week)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    inputMode="numeric"
                    min={500}
                    max={25000}
                    step={250}
                    value={promoteWage}
                    onChange={e => setPromoteWage(Number(e.target.value))}
                    className="flex-1 min-h-11 lg:min-h-0 px-3.5 py-2 bg-slate-900 border border-white/10 rounded-lg text-white font-mono text-base md:text-sm focus:outline-none focus:border-amber-400"
                  />
                  <span className="text-xs text-slate-400 font-mono shrink-0 tabular-nums">
                    £{(promoteWage / 1000).toFixed(1)}k/wk
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Contract Duration
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {[1, 2, 3, 5].map(yrs => (
                    <button
                      key={yrs}
                      type="button"
                      onClick={() => setPromoteYears(yrs)}
                      className={`py-2 min-h-11 lg:min-h-0 text-xs font-mono font-bold rounded-lg border transition-colors cursor-pointer ${
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
          </div>
        )}
      </Modal>

      {/* Rival Academy Poach Compensation Modal */}
      <Modal
        isOpen={Boolean(poachTarget)}
        onClose={() => {
          setPoachTarget(null);
          setPoachError(null);
        }}
        maxWidthClass="max-w-lg"
        borderClass="border-amber-400/30"
        ariaLabel={poachTarget ? `Poach ${poachTarget.prospect.name}` : 'Youth Compensation Approach'}
        header={
          poachTarget && (
            <div>
              <span className="text-xs font-bold text-amber-400 block">
                Youth Compensation Approach
              </span>
              <h3 className="text-xl font-bold text-white mt-0.5">
                {poachTarget.prospect.name}
              </h3>
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400 mt-1 font-mono">
                <span>{poachTarget.sellingClub.name}</span>
                <span aria-hidden="true">·</span>
                <span>{poachTarget.prospect.position}</span>
                <span aria-hidden="true">·</span>
                <span>Age {poachTarget.prospect.age}</span>
                <span aria-hidden="true">·</span>
                <span className="text-white font-bold">OVR {poachTarget.prospect.overall}</span>
              </div>
            </div>
          )
        }
        footer={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setPoachTarget(null);
                setPoachError(null);
              }}
              className="px-4 py-2 min-h-11 lg:min-h-0 text-xs font-medium text-slate-400 hover:text-white cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirmPoach}
              disabled={!livePoachEvaluation?.ok || !director || !onCompletePoach}
              className="px-5 py-2 min-h-11 lg:min-h-0 bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 disabled:opacity-50 text-slate-950 font-bold text-xs rounded-lg shadow-md transition-all cursor-pointer"
            >
              Submit Compensation Offer
            </button>
          </div>
        }
      >
        {poachTarget && (
          <div className="space-y-4">
            {/* Scout Profile Summary */}
            <div className="bg-slate-900 border border-white/10 rounded-xl p-3.5 text-xs space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Momentum & Trait</span>
                <span className={`font-bold ${getMomentumToneClass(poachTarget.prospect.momentumTier)}`}>
                  {poachTarget.prospect.momentumTier} · {poachTarget.prospect.trait}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Transfer War Chest</span>
                <span className="font-mono font-bold text-amber-400 tabular-nums">
                  £{(club.transferBudget / 1000000).toFixed(2)}M
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Estimated Tribunal Valuation</span>
                <span className="font-mono font-bold text-white tabular-nums">
                  £{(poachTarget.compensationFee / 1000000).toFixed(2)}M
                </span>
              </div>
            </div>

            {/* Destination Choice */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Placement Upon Signing
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setPoachDestination('academy');
                    setPoachError(null);
                  }}
                  className={`p-3 rounded-xl border text-left transition-colors cursor-pointer ${
                    poachDestination === 'academy'
                      ? 'bg-amber-400/15 border-amber-400 text-white'
                      : 'bg-slate-900 border-white/10 text-slate-400 hover:text-white'
                  }`}
                >
                  <div className="text-xs font-bold">Youth Academy ({academyList.length}/{MAX_USER_ACADEMY_CAPACITY})</div>
                  <div className="text-xs text-slate-400 mt-0.5">No senior slot or weekly wage needed</div>
                </button>

                <button
                  type="button"
                  disabled={poachTarget.prospect.age < 17}
                  onClick={() => {
                    setPoachDestination('senior');
                    setPoachError(null);
                  }}
                  className={`p-3 rounded-xl border text-left transition-colors cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed ${
                    poachDestination === 'senior'
                      ? 'bg-amber-400/15 border-amber-400 text-white'
                      : 'bg-slate-900 border-white/10 text-slate-400 hover:text-white'
                  }`}
                >
                  <div className="text-xs font-bold">Senior Squad ({club.squad.length}/25)</div>
                  <div className="text-xs text-slate-400 mt-0.5">
                    {poachTarget.prospect.age < 17 ? 'Requires age 17+ for pro terms' : 'Immediate first-team eligibility'}
                  </div>
                </button>
              </div>
            </div>

            {/* Compensation Fee Offer */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Offered Compensation Fee (£)
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  inputMode="numeric"
                  min={50000}
                  step={25000}
                  value={poachFee}
                  onChange={e => {
                    setPoachFee(Number(e.target.value));
                    setPoachError(null);
                  }}
                  className="flex-1 min-h-11 lg:min-h-0 px-3.5 py-2 bg-slate-900 border border-white/10 rounded-lg text-white font-mono text-base md:text-sm focus:outline-none focus:border-amber-400"
                />
                <span className="text-xs font-mono text-amber-400 font-bold shrink-0 tabular-nums">
                  £{(poachFee / 1000000).toFixed(2)}M
                </span>
              </div>
            </div>

            {/* Senior Contract Terms if signing straight to first team */}
            {poachDestination === 'senior' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Weekly Wage (£/wk)
                  </label>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={500}
                    step={250}
                    value={poachWage}
                    onChange={e => setPoachWage(Number(e.target.value))}
                    className="w-full min-h-11 lg:min-h-0 px-3 py-2 bg-slate-900 border border-white/10 rounded-lg text-white font-mono text-sm focus:outline-none focus:border-amber-400"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Contract Length
                  </label>
                  <div className="grid grid-cols-4 gap-1.5">
                    {[2, 3, 4, 5].map(yrs => (
                      <button
                        key={yrs}
                        type="button"
                        onClick={() => setPoachYears(yrs)}
                        className={`min-h-11 lg:min-h-0 py-1.5 text-xs font-mono font-bold rounded-lg border cursor-pointer ${
                          poachYears === yrs
                            ? 'bg-amber-400 text-slate-950 border-amber-400'
                            : 'bg-slate-900 border-white/10 text-slate-400 hover:text-white'
                        }`}
                      >
                        {yrs}y
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Live Validation / Error Message */}
            {(poachError || (livePoachEvaluation && !livePoachEvaluation.ok)) && (
              <div className="p-3 bg-rose-950/40 border border-rose-500/40 rounded-xl text-xs text-rose-300 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
                <span>{poachError || livePoachEvaluation?.reason}</span>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
};
