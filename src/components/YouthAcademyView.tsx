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
  GameMode,
  GrowthMomentum,
} from '../types/game';
import {
  GraduationCap,
  Trash2,
  ArrowUpRight,
  ShieldCheck,
  AlertCircle,
  CheckCircle2,
  Search,
  RotateCcw,
  ArrowUpDown,
  Globe,
  Coins,
} from 'lucide-react';
import { sounds } from '../services/soundEffects';
import {
  calculateAcademyPlayerValue,
  calculatePoachCompensation,
  evaluatePoachProspect,
  getAcademyPromotionWage,
  getAcademySaleOffers,
  MAX_USER_ACADEMY_CAPACITY,
  normalizeAcademyPlayer,
  poachAcademyProspect,
  promoteAcademyPlayer,
  releaseAcademyPlayer,
} from '../services/simulationEngine';
import {
  GeneratedTransferOffer,
  getTransferWindowLabel,
  isTransferWindowOpen,
} from '../services/transferService';
import { YOUTH_ACADEMY_CONFIG } from '../config/youthAcademyConfig';
import { Modal } from './ui/Modal';

interface YouthAcademyViewProps {
  gameMode?: GameMode;
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
  onSellAcademyPlayer?: (
    prospect: AcademyPlayer,
    buyingClub: Club,
    fee: number,
    wage: number
  ) => void;
}

type AcademyTab = 'mine' | 'poach';
type RivalSortField = 'overall' | 'fee' | 'age' | 'growth';

interface RivalProspectRow {
  prospect: AcademyPlayer;
  sellingClub: Club;
  compensationFee: number;
}

const POSITION_ORDER: Record<PlayerPosition, number> = {
  GK: 0,
  DEF: 1,
  MID: 2,
  FWD: 3,
};

const GROWTH_WEIGHT: Record<GrowthMomentum, number> = {
  breakout: 5,
  rapid: 4,
  prime: 3,
  steady: 2,
  cooling: 1,
};

function getGrowthLabel(momentum?: GrowthMomentum): string {
  switch (momentum) {
    case 'breakout':
      return 'Breakout';
    case 'rapid':
      return 'Rapid';
    case 'prime':
      return 'Prime';
    case 'cooling':
      return 'Cooling';
    default:
      return 'Steady';
  }
}

function getGrowthColorClass(momentum?: GrowthMomentum): string {
  switch (momentum) {
    case 'breakout':
      return 'text-emerald-400';
    case 'rapid':
      return 'text-cyan-400';
    case 'prime':
      return 'text-amber-400';
    case 'cooling':
      return 'text-rose-400';
    default:
      return 'text-slate-300';
  }
}

function getTierName(tier: LeagueTier): string {
  if (tier === 1) return 'Premier League';
  if (tier === 2) return 'Championship';
  return 'League One';
}

export const YouthAcademyView: React.FC<YouthAcademyViewProps> = ({
  gameMode = 'director',
  club,
  allClubs = [],
  manager,
  director,
  owner,
  delegation,
  seasonYear,
  currentWeek = 1,
  onUpdateClub,
  onCompletePoach,
  onSellAcademyPlayer,
}) => {
  const [activeTab, setActiveTab] = useState<AcademyTab>('mine');
  const [selectedPos, setSelectedPos] = useState<PlayerPosition | 'ALL'>('ALL');
  const [selectedProspect, setSelectedProspect] = useState<AcademyPlayer | null>(null);
  const [promoteWage, setPromoteWage] = useState<number>(() => getAcademyPromotionWage(club.tier));
  const [promoteYears, setPromoteYears] = useState<number>(3);
  const [sellTarget, setSellTarget] = useState<AcademyPlayer | null>(null);
  const [feedback, setFeedback] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Poach View Filters & Negotiation Modal State
  const [rivalSearch, setRivalSearch] = useState('');
  const [rivalTier, setRivalTier] = useState<LeagueTier | 'ALL'>('ALL');
  const [rivalPos, setRivalPos] = useState<PlayerPosition | 'ALL'>('ALL');
  const [rivalGrowth, setRivalGrowth] = useState<GrowthMomentum | 'ALL'>('ALL');
  const [rivalClubId, setRivalClubId] = useState<string>('ALL');
  const [rivalSort, setRivalSort] = useState<RivalSortField>('overall');
  const [rivalSortDir, setRivalSortDir] = useState<'asc' | 'desc'>('desc');

  const [poachTarget, setPoachTarget] = useState<RivalProspectRow | null>(null);
  const [poachFee, setPoachFee] = useState<number>(500000);
  const [poachError, setPoachError] = useState<string | null>(null);

  const isManagerMode = gameMode === 'manager';
  const windowOpen = isTransferWindowOpen(currentWeek);
  const windowLabel = getTransferWindowLabel(currentWeek);

  const academyList = useMemo(
    () =>
      (club.academy || [])
        .map(p => normalizeAcademyPlayer(p, club))
        .sort(
          (a, b) =>
            POSITION_ORDER[a.position] - POSITION_ORDER[b.position] ||
            b.overall - a.overall ||
            a.age - b.age
        ),
    [club]
  );

  const isAcademyFull = academyList.length >= MAX_USER_ACADEMY_CAPACITY;
  const freeSpots = Math.max(0, MAX_USER_ACADEMY_CAPACITY - academyList.length);
  const poachedCount = academyList.filter(p => p.origin === 'poached').length;
  const poachSpotsFree = Math.max(0, YOUTH_ACADEMY_CONFIG.freePoachSlots - poachedCount);

  const filteredProspects = useMemo(
    () =>
      academyList.filter(p => {
        if (selectedPos === 'ALL') return true;
        return p.position === selectedPos;
      }),
    [academyList, selectedPos]
  );

  const groupedByPosition = useMemo(() => {
    const groups: { pos: PlayerPosition; label: string; players: AcademyPlayer[] }[] = [
      { pos: 'GK', label: 'Goalkeepers', players: [] },
      { pos: 'DEF', label: 'Defenders', players: [] },
      { pos: 'MID', label: 'Midfielders', players: [] },
      { pos: 'FWD', label: 'Forwards', players: [] },
    ];
    const map = new Map<PlayerPosition, AcademyPlayer[]>(groups.map(g => [g.pos, g.players]));
    filteredProspects.forEach(p => {
      map.get(p.position)?.push(p);
    });
    return groups.filter(g => g.players.length > 0);
  }, [filteredProspects]);

  // Rival Academies Directory
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
      for (const rawProspect of c.academy || []) {
        const prospect = normalizeAcademyPlayer(rawProspect, c);
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
      if (rivalGrowth !== 'ALL' && (prospect.growthMomentum ?? 'steady') !== rivalGrowth) return false;
      if (q) {
        const hay = `${prospect.name} ${sellingClub.name} ${sellingClub.shortName} ${prospect.roleDetail} ${prospect.nationality}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    filtered.sort((a, b) => {
      let cmp = 0;
      if (rivalSort === 'overall') cmp = a.prospect.overall - b.prospect.overall;
      else if (rivalSort === 'fee') cmp = a.compensationFee - b.compensationFee;
      else if (rivalSort === 'age') cmp = a.prospect.age - b.prospect.age;
      else {
        cmp =
          GROWTH_WEIGHT[a.prospect.growthMomentum ?? 'steady'] -
          GROWTH_WEIGHT[b.prospect.growthMomentum ?? 'steady'];
      }

      if (cmp === 0) cmp = a.prospect.overall - b.prospect.overall;
      return rivalSortDir === 'desc' ? -cmp : cmp;
    });

    return filtered;
  }, [allRivalProspects, rivalSearch, rivalTier, rivalClubId, rivalPos, rivalGrowth, rivalSort, rivalSortDir]);

  const hasActiveRivalFilters =
    rivalSearch.trim() !== '' ||
    rivalTier !== 'ALL' ||
    rivalClubId !== 'ALL' ||
    rivalPos !== 'ALL' ||
    rivalGrowth !== 'ALL';

  const resetRivalFilters = () => {
    sounds.playClick();
    setRivalSearch('');
    setRivalTier('ALL');
    setRivalClubId('ALL');
    setRivalPos('ALL');
    setRivalGrowth('ALL');
  };

  const handleOpenPromote = (prospect: AcademyPlayer) => {
    sounds.playClick();
    setSelectedProspect(prospect);
    setPromoteWage(getAcademyPromotionWage(club.tier));
    setPromoteYears(3);
  };

  const handleConfirmPromote = () => {
    if (!selectedProspect) return;

    const result = promoteAcademyPlayer(
      club,
      selectedProspect.id,
      promoteWage,
      promoteYears,
      manager,
      { unrestricted: true }
    );

    if (!result.success) {
      sounds.playCrisis();
      setFeedback({ message: result.error, type: 'error' });
      return;
    }

    sounds.playSigningStamp();
    onUpdateClub(result.updatedClub);
    setFeedback({
      message: `PROMOTED: ${selectedProspect.name} (${selectedProspect.position}, Age ${selectedProspect.age}) joined the first team on a ${promoteYears}-year deal at £${(promoteWage / 1000).toFixed(1)}k/wk.`,
      type: 'success',
    });
    setSelectedProspect(null);
  };

  const handleRelease = (prospect: AcademyPlayer) => {
    sounds.playCrisis();
    const updatedClub = releaseAcademyPlayer(club, prospect.id);
    onUpdateClub(updatedClub);
    setFeedback({
      message: `RELEASED: ${prospect.name} has been released from the academy.`,
      type: 'success',
    });
    if (selectedProspect?.id === prospect.id) setSelectedProspect(null);
    if (sellTarget?.id === prospect.id) setSellTarget(null);
  };

  const saleOffers = useMemo<GeneratedTransferOffer[]>(() => {
    if (!sellTarget || !windowOpen) return [];
    return getAcademySaleOffers(sellTarget, club, allClubs);
  }, [sellTarget, windowOpen, club, allClubs]);

  const handleOpenSell = (prospect: AcademyPlayer) => {
    sounds.playClick();
    setSellTarget(prospect);
  };

  const handleAcceptSaleOffer = (offer: GeneratedTransferOffer) => {
    if (!sellTarget || !onSellAcademyPlayer) return;
    onSellAcademyPlayer(sellTarget, offer.club, offer.fee, offer.wage);
    setFeedback({
      message: `SOLD: ${sellTarget.name} sold to ${offer.club.name} for £${(offer.fee / 1000000).toFixed(2)}M.`,
      type: 'success',
    });
    setSellTarget(null);
  };

  const handleOpenPoach = (row: RivalProspectRow) => {
    sounds.playClick();
    if (isAcademyFull) {
      setFeedback({
        message: `Your Youth Academy is full (${MAX_USER_ACADEMY_CAPACITY}/${MAX_USER_ACADEMY_CAPACITY}). Promote, sell, or release a player first.`,
        type: 'error',
      });
      return;
    }
    setPoachTarget(row);
    setPoachFee(row.compensationFee);
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
      destination: 'academy',
    });
  }, [poachTarget, club, owner, poachFee]);

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
      destination: 'academy',
      wage: getAcademyPromotionWage(club.tier),
      contractYears: 3,
      seasonYear,
      currentWeek,
      initiatedBy: isManagerMode ? 'manager' : 'director',
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
              <span>Youth Development &amp; Academy Scouting</span>
            </div>
            <h1 className="text-2xl lg:text-3xl font-extrabold text-white tracking-tight">
              {club.name} Academy
            </h1>
            <p className="text-slate-400 text-xs mt-1 max-w-[75ch]">
              7 seasonal spots (1 GK, 2 DEF, 2 MID, 2 FWD) plus 3 open spots for poaching from rival clubs. Promote freely to the first team, sell, or release anytime.
            </p>
            {!isManagerMode && delegation?.youthPromotion === 'manager' && (
              <p className="text-emerald-400 text-xs font-medium mt-1.5 flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
                <span>Head Coach may also promote ready prospects automatically</span>
              </p>
            )}
          </div>

          {/* Quick Metrics */}
          <div className="grid grid-cols-3 gap-2 sm:gap-2.5 shrink-0">
            <div className="px-2.5 sm:px-3.5 py-2 bg-slate-900 border border-white/10 rounded-xl text-right min-w-0">
              <span className="text-xs text-slate-400 block truncate">Academy Spots</span>
              <span className={`text-sm sm:text-base font-bold font-mono tabular-nums ${isAcademyFull ? 'text-rose-400' : 'text-white'}`}>
                {academyList.length} / {MAX_USER_ACADEMY_CAPACITY}
              </span>
            </div>
            <div className="px-2.5 sm:px-3.5 py-2 bg-slate-900 border border-white/10 rounded-xl text-right min-w-0">
              <span className="text-xs text-slate-400 block truncate">Free Spots</span>
              <span className="text-sm sm:text-base font-bold font-mono text-emerald-400 tabular-nums">
                {freeSpots} ({poachSpotsFree} poach)
              </span>
            </div>
            <div className="px-2.5 sm:px-3.5 py-2 bg-slate-900 border border-white/10 rounded-xl text-right min-w-0">
              <span className="text-xs text-slate-400 block truncate">Transfer Budget</span>
              <span className="text-sm sm:text-base font-bold font-mono text-amber-400 tabular-nums">
                £{(club.transferBudget / 1000000).toFixed(1)}M
              </span>
            </div>
          </div>
        </div>

        {/* Workspace Tab Switch */}
        <div className="mt-5 pt-4 border-t border-white/10 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="inline-flex items-center gap-1 p-1 bg-slate-900 border border-white/10 rounded-xl w-full sm:w-auto">
            <button
              type="button"
              onClick={() => {
                sounds.playClick();
                setActiveTab('mine');
              }}
              className={`flex-1 sm:flex-initial min-h-11 lg:min-h-0 px-3 sm:px-4 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer whitespace-nowrap flex items-center justify-center gap-1.5 sm:gap-2 ${
                activeTab === 'mine'
                  ? 'bg-amber-400 text-slate-950 shadow-sm'
                  : 'text-slate-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <GraduationCap className="w-3.5 h-3.5 shrink-0" />
              <span>Academy ({academyList.length}/{MAX_USER_ACADEMY_CAPACITY})</span>
            </button>
            <button
              type="button"
              onClick={() => {
                sounds.playClick();
                setActiveTab('poach');
              }}
              className={`flex-1 sm:flex-initial min-h-11 lg:min-h-0 px-3 sm:px-4 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer whitespace-nowrap flex items-center justify-center gap-1.5 sm:gap-2 ${
                activeTab === 'poach'
                  ? 'bg-amber-400 text-slate-950 shadow-sm'
                  : 'text-slate-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <Globe className="w-3.5 h-3.5 shrink-0" />
              <span>Poach ({allRivalProspects.length})</span>
            </button>
          </div>

          <div className="text-xs text-slate-400 font-mono tabular-nums">
            {activeTab === 'mine'
              ? `Season ${seasonYear}/${seasonYear + 1} · First Team ${club.squad.length} Players`
              : `${rivalClubs.length} Rival Academies · ${freeSpots} Free Academy Spot${freeSpots === 1 ? '' : 's'}`}
          </div>
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

      {/* TAB 1: ACADEMY SQUAD BY POSITION */}
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
                    ? 'All Positions'
                    : pos === 'GK'
                      ? 'GK'
                      : pos === 'DEF'
                        ? 'DEF'
                        : pos === 'MID'
                          ? 'MID'
                          : 'FWD'}
                </button>
              ))}
            </div>

            <div className="text-xs text-slate-400 flex items-center gap-2 font-mono tabular-nums">
              <span>{windowOpen ? 'Transfer Window Open' : `Window Closed (${windowLabel})`}</span>
            </div>
          </div>

          {filteredProspects.length === 0 ? (
            <div className="bg-[#111827] border border-white/10 rounded-2xl p-10 text-center space-y-3">
              <GraduationCap className="w-12 h-12 text-slate-600 mx-auto" />
              <h3 className="text-base font-bold text-white">No Academy Players In This Position</h3>
              <p className="text-xs text-slate-400 max-w-md mx-auto">
                {selectedPos === 'ALL'
                  ? 'Your academy currently has open spots. Poach players from rival academies or wait for next season’s intake.'
                  : `There are currently no ${selectedPos} players in your academy.`}
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
                  onClick={() => setActiveTab('poach')}
                  className="min-h-11 lg:min-h-0 px-4 py-2 text-xs font-bold rounded-lg bg-amber-400 hover:bg-amber-300 text-slate-950 cursor-pointer"
                >
                  Open Poach View
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {groupedByPosition.map(group => (
                <section key={group.pos} className="space-y-3">
                  <div className="flex items-center justify-between border-b border-white/10 pb-2">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded bg-slate-800 border border-white/10 font-mono text-xs font-bold text-amber-400">
                        {group.pos}
                      </span>
                      <h2 className="text-sm font-bold text-white uppercase tracking-wider">
                        {group.label}
                      </h2>
                    </div>
                    <span className="text-xs font-mono text-slate-400 tabular-nums">
                      {group.players.length} player{group.players.length === 1 ? '' : 's'}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3.5">
                    {group.players.map(prospect => {
                      const marketValue =
                        prospect.value ?? calculateAcademyPlayerValue(prospect.overall, club.tier);
                      return (
                        <div
                          key={prospect.id}
                          className="bg-[#111827] border border-white/10 hover:border-amber-400/40 rounded-xl p-4 transition-all flex flex-col justify-between space-y-3.5"
                        >
                          <div>
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <div className="flex items-center gap-1.5">
                                  <h3 className="text-base font-bold text-white truncate">
                                    {prospect.name}
                                  </h3>
                                  {prospect.origin === 'poached' && (
                                    <span className="px-1.5 py-0.5 rounded bg-sky-500/15 border border-sky-400/30 text-[10px] font-bold uppercase text-sky-300 shrink-0">
                                      Poached
                                    </span>
                                  )}
                                </div>
                                <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-400 mt-0.5">
                                  <span className="font-semibold text-slate-200 font-mono">
                                    {prospect.position}
                                  </span>
                                  <span aria-hidden="true">·</span>
                                  <span className="font-mono tabular-nums">Age {prospect.age}</span>
                                  <span aria-hidden="true">·</span>
                                  <span className="truncate">{prospect.nationality}</span>
                                </div>
                              </div>
                              <div className="text-right shrink-0">
                                <span className="text-[10px] font-mono uppercase text-slate-400 block">
                                  OVR
                                </span>
                                <span className="text-lg font-extrabold font-mono text-white tabular-nums leading-none">
                                  {prospect.overall}
                                </span>
                              </div>
                            </div>

                            <div className="mt-3 pt-2.5 border-t border-white/10 grid grid-cols-2 gap-2 text-xs">
                              <div>
                                <span className="text-slate-400 block text-[11px]">Growth</span>
                                <span className={`font-bold ${getGrowthColorClass(prospect.growthMomentum)}`}>
                                  {getGrowthLabel(prospect.growthMomentum)}
                                </span>
                              </div>
                              <div className="text-right font-mono tabular-nums">
                                <span className="text-slate-400 block text-[11px] font-sans">Value</span>
                                <span className="text-amber-300 font-bold">
                                  £{(marketValue / 1000000).toFixed(2)}M
                                </span>
                              </div>
                            </div>

                            <div className="mt-2.5 w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-gradient-to-r from-amber-400 to-emerald-400 rounded-full transition-all"
                                style={{ width: `${(prospect.overall / 99) * 100}%` }}
                              />
                            </div>
                          </div>

                          <div className="pt-3 border-t border-white/10 flex flex-wrap items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleOpenPromote(prospect)}
                              className="flex-1 min-h-11 lg:min-h-0 px-2.5 py-1.5 bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-slate-950 font-bold text-xs rounded-lg shadow-sm flex items-center justify-center gap-1 transition-all cursor-pointer active:scale-95 whitespace-nowrap"
                            >
                              <ArrowUpRight className="w-3.5 h-3.5 shrink-0" />
                              <span>Promote</span>
                            </button>

                            {onSellAcademyPlayer && (
                              <button
                                type="button"
                                onClick={() => handleOpenSell(prospect)}
                                className="min-h-11 lg:min-h-0 px-2.5 py-1.5 bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-300 font-bold text-xs rounded-lg flex items-center justify-center gap-1 transition-colors cursor-pointer"
                              >
                                <Coins className="w-3.5 h-3.5 shrink-0" />
                                <span>Sell</span>
                              </button>
                            )}

                            <button
                              type="button"
                              onClick={() => handleRelease(prospect)}
                              title="Release academy player"
                              className="min-h-11 lg:min-h-0 px-2.5 py-1.5 text-xs text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 border border-white/10 rounded-lg transition-all active:scale-95 flex items-center justify-center gap-1 cursor-pointer font-medium"
                            >
                              <Trash2 className="w-3.5 h-3.5 shrink-0" />
                              <span>Release</span>
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
          )}
        </>
      )}

      {/* TAB 2: POACH RIVAL ACADEMY PLAYERS */}
      {activeTab === 'poach' && (
        <div className="space-y-4">
          {isAcademyFull && (
            <div className="p-4 bg-rose-950/40 border border-rose-500/40 rounded-xl text-xs text-rose-200 flex items-center gap-2.5">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>
                Your Youth Academy is at maximum capacity ({MAX_USER_ACADEMY_CAPACITY}/{MAX_USER_ACADEMY_CAPACITY}). Promote, sell, or release a player before poaching another youngster.
              </span>
            </div>
          )}

          {/* Search & Filters Toolbar */}
          <div className="bg-[#111827] border border-white/10 rounded-2xl p-4 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-2.5">
              <div className="relative lg:col-span-2">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="search"
                  value={rivalSearch}
                  onChange={e => setRivalSearch(e.target.value)}
                  placeholder="Search player, club, nationality..."
                  className="w-full min-h-11 lg:min-h-9 pl-9 pr-3 py-1.5 bg-slate-900 border border-white/10 rounded-lg text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-amber-400"
                />
              </div>

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

              <select
                aria-label="Filter by growth"
                value={rivalGrowth}
                onChange={e => setRivalGrowth(e.target.value as GrowthMomentum | 'ALL')}
                className="min-h-11 lg:min-h-9 px-3 py-1.5 bg-slate-900 border border-white/10 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-amber-400"
              >
                <option value="ALL">All Growth Rates</option>
                <option value="breakout">Breakout</option>
                <option value="rapid">Rapid</option>
                <option value="steady">Steady</option>
                <option value="cooling">Cooling</option>
              </select>

              <div className="flex items-center gap-1.5">
                <select
                  aria-label="Sort prospects"
                  value={rivalSort}
                  onChange={e => setRivalSort(e.target.value as RivalSortField)}
                  className="flex-1 min-h-11 lg:min-h-9 px-3 py-1.5 bg-slate-900 border border-white/10 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-amber-400"
                >
                  <option value="overall">Sort: Rating</option>
                  <option value="fee">Sort: Price</option>
                  <option value="age">Sort: Age</option>
                  <option value="growth">Sort: Growth</option>
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
                    className={`px-3 py-1.5 min-h-11 lg:min-h-0 text-xs font-semibold rounded-lg transition-all cursor-pointer whitespace-nowrap ${
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
                <span>{filteredRivals.length} players listed</span>
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
              <h3 className="text-base font-bold text-white">No Matching Academy Players</h3>
              <p className="text-xs text-slate-400 max-w-md mx-auto">
                Adjust your division, club, position, or search filters to browse other clubs&apos; academies.
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
              {/* Desktop Table */}
              <div className="hidden lg:block bg-[#111827] border border-white/10 rounded-2xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-white/10 bg-slate-900/70 text-xs text-slate-400 font-semibold">
                        <th className="py-3 px-4">Player</th>
                        <th className="py-3 px-3">Club &amp; Division</th>
                        <th className="py-3 px-3">Pos</th>
                        <th className="py-3 px-3 text-right">Age</th>
                        <th className="py-3 px-3 text-right">OVR</th>
                        <th className="py-3 px-3">Growth</th>
                        <th className="py-3 px-3 text-right">Price</th>
                        <th className="py-3 px-4 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5 text-xs">
                      {filteredRivals.slice(0, 100).map(({ prospect, sellingClub, compensationFee }) => {
                        const canAfford = club.transferBudget >= compensationFee && club.balance >= compensationFee;
                        return (
                          <tr key={prospect.id} className="hover:bg-white/[0.03] transition-colors">
                            <td className="py-2.5 px-4">
                              <div className="font-bold text-white">{prospect.name}</div>
                              <div className="text-slate-400">{prospect.nationality}</div>
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
                              <span className={`font-semibold ${getGrowthColorClass(prospect.growthMomentum)}`}>
                                {getGrowthLabel(prospect.growthMomentum)}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                              <span className={canAfford ? 'text-amber-400 font-bold' : 'text-slate-400 font-semibold'}>
                                £{(compensationFee / 1000000).toFixed(2)}M
                              </span>
                            </td>
                            <td className="py-2.5 px-4 text-right">
                              <button
                                type="button"
                                disabled={isAcademyFull}
                                onClick={() => handleOpenPoach({ prospect, sellingClub, compensationFee })}
                                className="px-3 py-1.5 bg-amber-400/15 hover:bg-amber-400/25 disabled:opacity-40 disabled:cursor-not-allowed border border-amber-400/40 text-amber-300 font-bold text-xs rounded-lg transition-colors cursor-pointer whitespace-nowrap"
                              >
                                {isAcademyFull ? 'Academy Full' : 'Poach'}
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {filteredRivals.length > 100 && (
                  <div className="px-4 py-2.5 border-t border-white/10 text-xs text-slate-400 text-center font-mono">
                    Showing top 100 of {filteredRivals.length} matching players. Use filters to narrow results.
                  </div>
                )}
              </div>

              {/* Mobile Cards */}
              <div className="lg:hidden grid grid-cols-1 md:grid-cols-2 gap-3">
                {filteredRivals.slice(0, 60).map(({ prospect, sellingClub, compensationFee }) => {
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
                          <span className="text-slate-400 block">Growth</span>
                          <span className={`font-semibold ${getGrowthColorClass(prospect.growthMomentum)}`}>
                            {getGrowthLabel(prospect.growthMomentum)}
                          </span>
                        </div>
                        <div className="text-right font-mono tabular-nums">
                          <span className="text-slate-400 block font-sans">Price</span>
                          <span className={canAfford ? 'text-amber-400 font-bold' : 'text-slate-400 font-bold'}>
                            £{(compensationFee / 1000000).toFixed(2)}M
                          </span>
                        </div>
                      </div>

                      <button
                        type="button"
                        disabled={isAcademyFull}
                        onClick={() => handleOpenPoach({ prospect, sellingClub, compensationFee })}
                        className="w-full min-h-11 px-4 py-2 bg-amber-400/15 hover:bg-amber-400/25 disabled:opacity-40 disabled:cursor-not-allowed border border-amber-400/40 text-amber-300 font-bold text-xs rounded-lg transition-colors cursor-pointer"
                      >
                        {isAcademyFull ? 'Academy Full (10/10)' : 'Make Poach Offer'}
                      </button>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}

      {/* Unrestricted Promote to First Team Modal */}
      <Modal
        isOpen={Boolean(selectedProspect)}
        onClose={() => setSelectedProspect(null)}
        maxWidthClass="max-w-md"
        borderClass="border-amber-400/30"
        ariaLabel={selectedProspect ? `Promote ${selectedProspect.name}` : 'Promote Academy Player'}
        header={
          selectedProspect && (
            <div>
              <span className="text-xs font-bold text-amber-400 block">
                First-Team Promotion
              </span>
              <h3 className="text-xl font-bold text-white mt-0.5">
                Promote {selectedProspect.name}
              </h3>
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400 mt-1 font-mono">
                <span>{selectedProspect.position}</span>
                <span aria-hidden="true">·</span>
                <span>Age {selectedProspect.age}</span>
                <span aria-hidden="true">·</span>
                <span className="text-white font-bold">OVR {selectedProspect.overall}</span>
                <span aria-hidden="true">·</span>
                <span className={getGrowthColorClass(selectedProspect.growthMomentum)}>
                  {getGrowthLabel(selectedProspect.growthMomentum)}
                </span>
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
              className="px-5 py-2 min-h-11 lg:min-h-0 bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-slate-950 font-bold text-xs rounded-lg shadow-md transition-all cursor-pointer"
            >
              Promote to First Team
            </button>
          </div>
        }
      >
        {selectedProspect && (
          <div className="space-y-4">
            <div className="bg-slate-900 border border-white/10 rounded-xl p-3 text-xs space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Current First-Team Size</span>
                <span className="font-mono font-bold text-slate-200 tabular-nums">
                  {club.squad.length} players
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Academy Spots After Promotion</span>
                <span className="font-mono font-bold text-emerald-400 tabular-nums">
                  {Math.max(0, academyList.length - 1)} / {MAX_USER_ACADEMY_CAPACITY}
                </span>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Weekly Wage (£/week)
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
                  <span className="text-xs font-mono text-emerald-400 font-bold shrink-0 tabular-nums">
                    £{(promoteWage / 1000).toFixed(1)}k/wk
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Contract Length (Years)
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {[2, 3, 4, 5].map(yrs => (
                    <button
                      key={yrs}
                      type="button"
                      onClick={() => setPromoteYears(yrs)}
                      className={`py-2 min-h-11 lg:min-h-0 text-xs font-mono font-bold rounded-lg border transition-all cursor-pointer ${
                        promoteYears === yrs
                          ? 'bg-amber-400 text-slate-950 border-amber-400 shadow-sm'
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

      {/* Sell Academy Player Modal */}
      <Modal
        isOpen={Boolean(sellTarget)}
        onClose={() => setSellTarget(null)}
        maxWidthClass="max-w-md"
        borderClass="border-emerald-400/30"
        ariaLabel={sellTarget ? `Sell ${sellTarget.name}` : 'Sell Academy Player'}
        header={
          sellTarget && (
            <div>
              <span className="text-xs font-bold text-emerald-400 block">
                Academy Player Sale
              </span>
              <h3 className="text-xl font-bold text-white mt-0.5">
                Sell {sellTarget.name}
              </h3>
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400 mt-1 font-mono">
                <span>{sellTarget.position}</span>
                <span aria-hidden="true">·</span>
                <span>Age {sellTarget.age}</span>
                <span aria-hidden="true">·</span>
                <span className="text-white font-bold">OVR {sellTarget.overall}</span>
                <span aria-hidden="true">·</span>
                <span className="text-amber-300">
                  Val £{((sellTarget.value ?? calculateAcademyPlayerValue(sellTarget.overall, club.tier)) / 1000000).toFixed(2)}M
                </span>
              </div>
            </div>
          )
        }
        footer={
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => setSellTarget(null)}
              className="px-4 py-2 min-h-11 lg:min-h-0 text-xs font-medium text-slate-400 hover:text-white cursor-pointer"
            >
              Close
            </button>
          </div>
        }
      >
        {sellTarget && (
          <div className="space-y-3">
            {!windowOpen ? (
              <div className="p-3.5 bg-slate-900 border border-white/10 rounded-xl text-xs text-slate-300 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-amber-400 mt-0.5" />
                <span>
                  Transfer window is currently closed ({windowLabel}). You can sell academy players when the transfer window is open.
                </span>
              </div>
            ) : saleOffers.length === 0 ? (
              <div className="p-4 bg-slate-900 border border-white/10 rounded-xl text-xs text-slate-400 text-center">
                No clubs currently have budget or squad room to bid for {sellTarget.name}.
              </div>
            ) : (
              <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                {saleOffers.map(offer => (
                  <div
                    key={offer.club.id}
                    className="p-3 bg-slate-900 border border-white/10 rounded-xl flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: offer.club.primaryColor }}
                        />
                        <span className="text-sm font-bold text-white truncate">
                          {offer.club.name}
                        </span>
                      </div>
                      <span className="text-xs text-slate-400 font-mono">
                        {getTierName(offer.club.tier)} · Offered £{(offer.fee / 1000000).toFixed(2)}M
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleAcceptSaleOffer(offer)}
                      className="min-h-10 px-3.5 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs rounded-lg shrink-0 cursor-pointer"
                    >
                      Accept
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Poach Negotiation Modal */}
      <Modal
        isOpen={Boolean(poachTarget)}
        onClose={() => {
          setPoachTarget(null);
          setPoachError(null);
        }}
        maxWidthClass="max-w-md"
        borderClass="border-amber-400/30"
        ariaLabel={poachTarget ? `Poach ${poachTarget.prospect.name}` : 'Poach Academy Player'}
        header={
          poachTarget && (
            <div>
              <span className="text-xs font-bold text-amber-400 block">
                Academy Poach Offer
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
              Confirm Poach Offer
            </button>
          </div>
        }
      >
        {poachTarget && (
          <div className="space-y-4">
            <div className="bg-slate-900 border border-white/10 rounded-xl p-3.5 text-xs space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Growth Rate</span>
                <span className={`font-bold ${getGrowthColorClass(poachTarget.prospect.growthMomentum)}`}>
                  {getGrowthLabel(poachTarget.prospect.growthMomentum)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Academy Spots</span>
                <span className="font-mono font-bold text-white tabular-nums">
                  {academyList.length} / {MAX_USER_ACADEMY_CAPACITY}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Transfer Budget</span>
                <span className="font-mono font-bold text-amber-400 tabular-nums">
                  £{(club.transferBudget / 1000000).toFixed(2)}M
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Asking Price</span>
                <span className="font-mono font-bold text-white tabular-nums">
                  £{(poachTarget.compensationFee / 1000000).toFixed(2)}M
                </span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Offered Fee (£)
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
