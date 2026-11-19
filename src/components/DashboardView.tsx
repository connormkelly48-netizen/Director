/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Club, ClubDirector, Director, GameMode, GameweekRecord, LeagueTier, Manager, ManagerCareerState, Owner, Player, TransferRecord } from '../types/game';
import { 
  Shield, 
  TrendingUp, 
  Users, 
  DollarSign, 
  Calendar, 
  Flame, 
  ArrowUpRight, 
  ChevronLeft,
  ChevronRight,
  Trophy,
  Maximize2,
  Minimize2,
  RefreshCw,
  ArrowUp,
  ArrowDown,
  ChevronDown,
  ChevronUp,
  Briefcase,
  Building2,
  LogOut,
} from 'lucide-react';
import { sounds } from '../services/soundEffects';
import { FORMATIONS } from '../data/formations';
import { computeTeamRating, resolveClubLineup } from '../utils/lineup';
import { computeTransferROI } from '../utils/transferRoi';
import { MANAGER_MODE_CONFIG } from '../config/managerModeConfig';
import { calculateEffectiveControl } from '../services/managerModeService';
import { TransferROICard } from './dashboard/TransferROICard';
import { TransferROIModal } from './dashboard/TransferROIModal';

interface DashboardViewProps {
  gameMode?: GameMode;
  club: Club | undefined;
  director: Director;
  managerCareer?: ManagerCareerState | null;
  clubDirector?: ClubDirector;
  owner: Owner | undefined;
  manager: Manager | undefined;
  allClubs: Club[];
  freeAgents?: Player[];
  transferHistory?: TransferRecord[];
  currentWeek: number;
  seasonYear: number;
  gameweekHistory?: GameweekRecord[];
  onNavigate: (tab: string) => void;
  onAdvanceWeek: () => void;
  onRetireManager?: () => void;
  onBecomeSportingDirector?: () => void;
  isSimulating: boolean;
}

interface TableRowData {
  id: string;
  name: string;
  shortName: string;
  primaryColor: string;
  tier: LeagueTier;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
  form: ('W' | 'D' | 'L')[];
}

const getZoneStyle = (rank: number, tier: LeagueTier, total: number) => {
  if (tier === 1) {
    if (rank <= 4) return { border: 'border-l-2 border-l-cyan-400', label: 'UCL' };
    if (rank === 5) return { border: 'border-l-2 border-l-amber-400', label: 'UEL' };
    if (rank > total - 3) return { border: 'border-l-2 border-l-rose-500', label: 'REL' };
  } else if (tier === 2) {
    if (rank <= 2) return { border: 'border-l-2 border-l-emerald-400', label: 'AUTO' };
    if (rank <= 6) return { border: 'border-l-2 border-l-sky-400', label: 'PO' };
    if (rank > total - 3) return { border: 'border-l-2 border-l-rose-500', label: 'REL' };
  } else if (tier === 3) {
    if (rank <= 2) return { border: 'border-l-2 border-l-emerald-400', label: 'AUTO' };
    if (rank <= 6) return { border: 'border-l-2 border-l-sky-400', label: 'PO' };
    if (rank > total - 4) return { border: 'border-l-2 border-l-rose-500', label: 'REL' };
  }
  return { border: 'border-l-2 border-l-transparent', label: '' };
};

interface StandingsCardProps {
  row: TableRowData;
  originalRank: number;
  isMyClub: boolean;
  zoneBorder: string;
  zoneLabel: string;
  isExpanded: boolean;
  onToggleExpand: (clubId: string) => void;
}

const StandingsMobileCard = React.memo<StandingsCardProps>(({
  row,
  originalRank,
  isMyClub,
  zoneBorder,
  zoneLabel,
  isExpanded,
  onToggleExpand,
}) => (
  <div
    className={`rounded-lg border overflow-hidden ${zoneBorder} ${
      isMyClub
        ? 'bg-amber-400/10 border-amber-400/30 text-amber-200'
        : 'bg-slate-950/60 border-white/10 text-slate-200'
    }`}
  >
    <button
      type="button"
      aria-expanded={isExpanded}
      onClick={() => onToggleExpand(row.id)}
      className="w-full min-h-11 px-3 py-3 text-left flex items-center justify-between gap-2 cursor-pointer active:scale-[0.99] transition-transform"
    >
      <div className="flex items-center gap-2.5 min-w-0">
        <span className="font-mono font-extrabold text-sm text-slate-300 tabular-nums w-6 shrink-0">
          #{originalRank}
        </span>
        <span
          className="w-2.5 h-2.5 rounded-full shrink-0"
          style={{ backgroundColor: row.primaryColor }}
        />
        <div className="min-w-0">
          <span className={`font-bold text-sm block truncate ${isMyClub ? 'text-amber-300' : 'text-white'}`}>
            {row.name}
            {isMyClub && <span className="text-xs text-amber-400 ml-1 uppercase">(You)</span>}
          </span>
          {zoneLabel && (
            <span className="text-xs font-mono text-slate-400">{zoneLabel}</span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3 shrink-0 font-mono text-xs">
        <div className="text-right">
          <span className="text-slate-400 block">P</span>
          <span className="font-semibold text-slate-200 tabular-nums">{row.played}</span>
        </div>
        <div className="text-right">
          <span className="text-slate-400 block">GD</span>
          <span className="font-semibold text-slate-200 tabular-nums">
            {row.goalDifference > 0 ? `+${row.goalDifference}` : row.goalDifference}
          </span>
        </div>
        <div className="text-right">
          <span className="text-slate-400 block">Pts</span>
          <span className="font-extrabold text-white text-sm tabular-nums">{row.points}</span>
        </div>
        {isExpanded ? (
          <ChevronUp className="w-4 h-4 text-slate-400" />
        ) : (
          <ChevronDown className="w-4 h-4 text-slate-400" />
        )}
      </div>
    </button>

    {isExpanded && (
      <div className="px-3 pb-3 pt-2 border-t border-white/10 bg-slate-900/60 flex flex-wrap items-center justify-between gap-3 text-xs font-mono">
        <div className="flex items-center gap-3 text-slate-300 tabular-nums">
          <span>W: <strong className="text-white">{row.won}</strong></span>
          <span>D: <strong className="text-white">{row.drawn}</strong></span>
          <span>L: <strong className="text-white">{row.lost}</strong></span>
          <span>GF/GA: <strong className="text-white">{row.goalsFor}/{row.goalsAgainst}</strong></span>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-slate-400 mr-1">Form:</span>
          {row.form && row.form.length > 0 ? (
            row.form.slice(-5).map((f, i) => (
              <span
                key={i}
                className={`w-5 h-5 rounded text-xs font-bold flex items-center justify-center text-white ${
                  f === 'W' ? 'bg-emerald-500' : f === 'D' ? 'bg-slate-600' : 'bg-rose-500'
                }`}
              >
                {f}
              </span>
            ))
          ) : (
            <span className="text-slate-500">-</span>
          )}
        </div>
      </div>
    )}
  </div>
));
StandingsMobileCard.displayName = 'StandingsMobileCard';

interface StandingsTableRowProps {
  row: TableRowData;
  originalRank: number;
  isMyClub: boolean;
  zoneBorder: string;
}

const StandingsTableRow = React.memo<StandingsTableRowProps>(({
  row,
  originalRank,
  isMyClub,
  zoneBorder,
}) => (
  <tr
    className={`group transition-colors ${
      isMyClub
        ? 'bg-amber-400/10 font-bold text-amber-300'
        : 'text-slate-300 hover:bg-white/5'
    }`}
  >
    {/* Position with Zone accent */}
    <td className={`sticky left-0 z-10 w-10 py-2 px-1.5 text-slate-400 font-bold ${
      isMyClub ? 'bg-[#252116]' : 'bg-[#151d2b] group-hover:bg-[#1e2839]'
    } ${zoneBorder}`}>
      {originalRank}
    </td>

    {/* Club Identity */}
    <td className={`sticky left-10 z-10 py-2 px-2 font-sans border-r border-white/5 ${
      isMyClub ? 'bg-[#252116]' : 'bg-[#151d2b] group-hover:bg-[#1e2839]'
    }`}>
      <div className="flex items-center gap-2">
        <span
          className="w-2.5 h-2.5 rounded-full shrink-0 shadow-sm"
          style={{ backgroundColor: row.primaryColor }}
        />
        <span className="truncate max-w-[130px] sm:max-w-[180px]">
          {row.name}
          {isMyClub && <span className="text-xs sm:text-[9px] text-amber-400 ml-1.5 font-bold uppercase">(You)</span>}
        </span>
      </div>
    </td>

    {/* P, W, D, L */}
    <td className="py-2 px-1 text-center tabular-nums text-slate-400">{row.played}</td>
    <td className="hidden lg:table-cell py-2 px-1 text-center tabular-nums text-slate-300">{row.won}</td>
    <td className="hidden lg:table-cell py-2 px-1 text-center tabular-nums text-slate-400">{row.drawn}</td>
    <td className="hidden lg:table-cell py-2 px-1 text-center tabular-nums text-slate-400">{row.lost}</td>

    {/* GD */}
    <td className="py-2 px-1 text-center tabular-nums font-semibold text-slate-300">
      {row.goalDifference > 0 ? `+${row.goalDifference}` : row.goalDifference}
    </td>

    {/* Pts */}
    <td className="py-2 px-2 text-right font-extrabold text-white tabular-nums">
      {row.points}
    </td>

    {/* Form Badges */}
    <td className="hidden xl:table-cell py-2 px-2 text-center">
      <div className="flex items-center justify-center gap-0.5">
        {row.form && row.form.length > 0 ? (
          row.form.slice(-5).map((f, i) => (
            <span
              key={i}
              className={`w-5 h-5 sm:w-3.5 sm:h-3.5 rounded text-xs sm:text-[8px] font-bold flex items-center justify-center text-white ${
                f === 'W' ? 'bg-emerald-500' : f === 'D' ? 'bg-slate-600' : 'bg-rose-500'
              }`}
            >
              {f}
            </span>
          ))
        ) : (
          <span className="text-xs sm:text-[10px] text-slate-600">-</span>
        )}
      </div>
    </td>
  </tr>
));
StandingsTableRow.displayName = 'StandingsTableRow';

export const DashboardView: React.FC<DashboardViewProps> = ({
  gameMode = 'director',
  club,
  director,
  managerCareer = null,
  clubDirector,
  owner,
  manager,
  allClubs,
  freeAgents = [],
  transferHistory = [],
  currentWeek,
  seasonYear,
  gameweekHistory = [],
  onNavigate,
  onAdvanceWeek,
  onRetireManager,
  onBecomeSportingDirector,
  isSimulating,
}) => {
  const isManagerMode = gameMode === 'manager';
  const isSeasonComplete = currentWeek > 46;
  const maxWeek = Math.max(1, Math.min(46, currentWeek));
  const displayWeek = Math.min(46, currentWeek);

  // Selected League Tier: dynamically defaults to user's active club tier
  const [selectedTier, setSelectedTier] = useState<LeagueTier>(club?.tier || 1);
  // Selected Gameweek for historical inspection
  const [selectedWeek, setSelectedWeek] = useState<number>(maxWeek);
  // Full division table expansion toggle
  const [isTableExpanded, setIsTableExpanded] = useState<boolean>(false);
  // Fixtures view filter: 'all' or 'director'
  const [fixtureFilter, setFixtureFilter] = useState<'all' | 'my_club'>('all');
  // Standings sort & mobile card expansion state
  const [expandedClubId, setExpandedClubId] = useState<string | null>(null);
  const [standingsSortField, setStandingsSortField] = useState<'rank' | 'name' | 'played' | 'won' | 'drawn' | 'lost' | 'goalDifference' | 'points'>('rank');
  const [standingsSortAsc, setStandingsSortAsc] = useState<boolean>(true);
  const [isRoiModalOpen, setIsRoiModalOpen] = useState<boolean>(false);

  // Dynamically follow the user's active club tier:
  // If the user changes jobs to a different tier, or their club gets promoted/relegated,
  // this view automatically follows them to their new active league tier.
  useEffect(() => {
    if (club?.tier) {
      setSelectedTier(club.tier);
    }
  }, [club?.id, club?.tier]);

  // Sync selected week when currentWeek increments during simulation
  useEffect(() => {
    setSelectedWeek(Math.max(1, Math.min(46, currentWeek)));
  }, [currentWeek]);

  const clubsById = useMemo(() => new Map(allClubs.map(c => [c.id, c])), [allClubs]);

  const currentWages = useMemo(() => {
    if (!club) return 0;
    return club.squad.reduce((acc, p) => acc + p.wage, 0);
  }, [club]);

  const wageUsagePercent = useMemo(() => {
    if (!club || club.wageBudget <= 0) return 0;
    return Math.min(100, Math.round((currentWages / club.wageBudget) * 100));
  }, [currentWages, club]);

  const activeInjuriesCount = useMemo(() => {
    if (!club) return 0;
    return club.squad.filter(p => p.isInjured).length;
  }, [club]);

  const squadSpotlight = useMemo(() => {
    if (!club) return [];
    return club.squad.slice(0, 8);
  }, [club]);

  const nextMatchLineup = useMemo(() => {
    if (!club) return null;
    return resolveClubLineup(club, manager);
  }, [club, manager]);

  const nextMatchTeamRating = useMemo(() => {
    if (!club || !nextMatchLineup) return 0;
    return computeTeamRating(nextMatchLineup, club.squad);
  }, [club, nextMatchLineup]);

  const nextMatchFormationDef = useMemo(() => {
    if (!nextMatchLineup) return FORMATIONS['4-3-3'];
    return FORMATIONS[nextMatchLineup.formation] || FORMATIONS['4-3-3'];
  }, [nextMatchLineup]);

  const transferRoiSummary = useMemo(() => {
    if (!club) return null;
    return computeTransferROI(club.id, seasonYear, allClubs, freeAgents, transferHistory);
  }, [club, seasonYear, allClubs, freeAgents, transferHistory]);

  // Determine historical record for selected week
  const isViewingLive = !isSeasonComplete && selectedWeek === currentWeek;
  const historicalRecord = useMemo(() => {
    if (isViewingLive) return undefined;
    return gameweekHistory.find(r => r.week === selectedWeek);
  }, [isViewingLive, gameweekHistory, selectedWeek]);

  // Construct table rows based on whether viewing live or past gameweek snapshot
  const sortedTableRows = useMemo(() => {
    let rows: TableRowData[] = [];

    if (isViewingLive || !historicalRecord) {
      // Live current standings
      rows = allClubs
        .filter(c => c.tier === selectedTier)
        .map(c => ({
          id: c.id,
          name: c.name,
          shortName: c.shortName,
          primaryColor: c.primaryColor,
          tier: c.tier,
          played: c.played,
          won: c.won,
          drawn: c.drawn,
          lost: c.lost,
          goalsFor: c.goalsFor,
          goalsAgainst: c.goalsAgainst,
          goalDifference: c.goalDifference,
          points: c.points,
          form: c.form,
        }));
    } else {
      // Historical standings snapshot for the searched gameweek
      const snapshot = historicalRecord.standingsSnapshot;
      rows = allClubs
        .filter(c => c.tier === selectedTier)
        .map(c => {
          const entry = snapshot[c.id];
          if (entry) {
            return {
              id: entry.clubId,
              name: entry.name || c.name,
              shortName: entry.shortName || c.shortName,
              primaryColor: entry.primaryColor || c.primaryColor,
              tier: entry.tier,
              played: entry.played,
              won: entry.won,
              drawn: entry.drawn,
              lost: entry.lost,
              goalsFor: entry.goalsFor,
              goalsAgainst: entry.goalsAgainst,
              goalDifference: entry.goalDifference,
              points: entry.points,
              form: entry.form,
            };
          }
          return {
            id: c.id,
            name: c.name,
            shortName: c.shortName,
            primaryColor: c.primaryColor,
            tier: c.tier,
            played: 0,
            won: 0,
            drawn: 0,
            lost: 0,
            goalsFor: 0,
            goalsAgainst: 0,
            goalDifference: 0,
            points: 0,
            form: [],
          };
        });
    }

    return rows.sort((a, b) => b.points - a.points || b.goalDifference - a.goalDifference || b.goalsFor - a.goalsFor);
  }, [allClubs, selectedTier, isViewingLive, historicalRecord]);

  // Director's managed club position in selected tier (if in this tier)
  const myPosition = useMemo(() => {
    if (!club || club.tier !== selectedTier) return null;
    const idx = sortedTableRows.findIndex(r => r.id === club.id);
    return idx >= 0 ? idx + 1 : null;
  }, [sortedTableRows, club, selectedTier]);

  // Filtered rows for Compact vs Full view
  const displayedTableRows = useMemo(() => {
    if (isTableExpanded) return sortedTableRows;

    // Compact mode: Top 7 clubs + Director's club (if outside top 7 and not in bottom 3) + Bottom 3
    if (sortedTableRows.length <= 12) return sortedTableRows;

    const top7 = sortedTableRows.slice(0, 7);
    const bottom3 = sortedTableRows.slice(-3);
    const displayedIds = new Set([...top7.map(r => r.id), ...bottom3.map(r => r.id)]);

    const result = [...top7];

    // If director's club is in this tier and not already displayed, add it in middle
    if (club && club.tier === selectedTier && !displayedIds.has(club.id)) {
      const myRow = sortedTableRows.find(r => r.id === club.id);
      if (myRow) {
        result.push(myRow);
        displayedIds.add(club.id);
      }
    }

    bottom3.forEach(r => {
      if (!displayedIds.has(r.id)) {
        result.push(r);
      }
    });

    // Re-sort according to table rank
    return result.sort((a, b) => b.points - a.points || b.goalDifference - a.goalDifference || b.goalsFor - a.goalsFor);
  }, [sortedTableRows, isTableExpanded, club, selectedTier]);

  const rankByClubId = useMemo(() => {
    const map = new Map<string, number>();
    sortedTableRows.forEach((row, idx) => map.set(row.id, idx + 1));
    return map;
  }, [sortedTableRows]);

  const finalTableRows = useMemo(() => {
    const list = [...displayedTableRows];
    if (standingsSortField === 'rank') {
      return standingsSortAsc ? list : list.reverse();
    }
    return list.sort((a, b) => {
      let cmp = 0;
      if (standingsSortField === 'name') {
        cmp = a.name.localeCompare(b.name);
      } else {
        cmp = a[standingsSortField] - b[standingsSortField];
      }
      return standingsSortAsc ? cmp : -cmp;
    });
  }, [displayedTableRows, standingsSortField, standingsSortAsc]);

  const handleStandingsSort = useCallback((field: 'rank' | 'name' | 'played' | 'won' | 'drawn' | 'lost' | 'goalDifference' | 'points') => {
    sounds.playClick();
    if (standingsSortField === field) {
      setStandingsSortAsc(prev => !prev);
    } else {
      setStandingsSortField(field);
      setStandingsSortAsc(field === 'rank' || field === 'name');
    }
  }, [standingsSortField]);

  const handleToggleExpandClub = useCallback((clubId: string) => {
    sounds.playClick();
    setExpandedClubId(prev => (prev === clubId ? null : clubId));
  }, []);

  // Gameweek Fixtures for selected tier
  const gameweekFixtures = useMemo(() => {
    if (!historicalRecord || !historicalRecord.results || !club) return [];

    const divisionMatches = historicalRecord.results.filter(m => {
      const home = clubsById.get(m.homeClubId);
      return home && home.tier === selectedTier;
    });

    if (fixtureFilter === 'my_club') {
      return divisionMatches.filter(m => m.homeClubId === club.id || m.awayClubId === club.id);
    }

    return divisionMatches;
  }, [historicalRecord, clubsById, selectedTier, fixtureFilter, club]);

  const handlePrevWeek = () => {
    if (selectedWeek > 1) {
      sounds.playClick();
      setSelectedWeek(selectedWeek - 1);
    }
  };

  const handleNextWeek = () => {
    if (selectedWeek < maxWeek) {
      sounds.playClick();
      setSelectedWeek(selectedWeek + 1);
    }
  };

  const handleJumpToCurrent = () => {
    sounds.playClick();
    setSelectedWeek(maxWeek);
  };

  if (!club) {
    return (
      <div className="space-y-6">
        <div className="bg-[#111827] border border-amber-400/30 rounded-2xl p-5 sm:p-8 space-y-6">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            <div className="flex items-start sm:items-center gap-4 min-w-0">
              <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-slate-900 border border-amber-400/30 flex items-center justify-center text-amber-400 shrink-0">
                <Briefcase className="w-7 h-7" />
              </div>
              <div className="min-w-0">
                <span className="text-xs font-bold font-mono uppercase tracking-wider text-amber-400 block mb-1">
                  Unattached Free Agent · Season {seasonYear}/{seasonYear + 1} · Wk {displayWeek} / 46
                </span>
                <h1 className="text-xl sm:text-2xl lg:text-3xl font-extrabold text-white tracking-tight">
                  {director.name}
                </h1>
                <p className="text-xs sm:text-sm text-slate-300 mt-1">
                  {director.nationality} · Age {director.age} · Philosophy: <strong className="text-amber-300">{director.philosophy}</strong>
                </p>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 shrink-0">
              <button
                type="button"
                onClick={() => {
                  sounds.playClick();
                  onNavigate('jobs');
                }}
                className="min-h-11 px-5 py-3 bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-slate-950 font-extrabold text-xs sm:text-sm rounded-xl shadow-lg shadow-amber-500/20 flex items-center justify-center gap-2 transition-all cursor-pointer active:scale-95 whitespace-nowrap"
              >
                <Briefcase className="w-4 h-4" />
                <span>Open Job Market</span>
                <ArrowUpRight className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={() => {
                  sounds.playWhistle();
                  onAdvanceWeek();
                }}
                disabled={isSimulating}
                className="min-h-11 px-4 py-3 bg-white/5 hover:bg-white/10 disabled:opacity-50 border border-white/10 text-slate-200 font-bold text-xs sm:text-sm rounded-xl flex items-center justify-center gap-2 transition-all cursor-pointer whitespace-nowrap"
              >
                <Calendar className="w-4 h-4 text-amber-400" />
                <span>
                  {isSimulating
                    ? 'Simulating...'
                    : isSeasonComplete
                    ? 'End of Season Review'
                    : `Advance Week (Wk ${displayWeek})`}
                </span>
              </button>
            </div>
          </div>

          <p className="text-xs sm:text-sm text-slate-400 leading-relaxed max-w-[75ch] border-t border-white/10 pt-4">
            You are currently without a club post. Review open Sporting Director vacancies in the Job Market or advance the calendar to generate new boardroom opportunities across the English pyramid.
          </p>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="bg-slate-900/80 border border-white/10 rounded-xl p-3.5">
              <span className="text-xs text-slate-400 uppercase block mb-1">Global Reputation</span>
              <span className="text-lg sm:text-xl font-bold font-mono text-amber-400 tabular-nums">
                {director.reputation} / 100
              </span>
            </div>
            <div className="bg-slate-900/80 border border-white/10 rounded-xl p-3.5">
              <span className="text-xs text-slate-400 uppercase block mb-1">Silverware Won</span>
              <span className="text-lg sm:text-xl font-bold font-mono text-blue-400 tabular-nums">
                {director.trophiesWon.length} Honours
              </span>
            </div>
            <div className="bg-slate-900/80 border border-white/10 rounded-xl p-3.5">
              <span className="text-xs text-slate-400 uppercase block mb-1">Career Net Spend</span>
              <span className="text-lg sm:text-xl font-bold font-mono text-emerald-400 tabular-nums">
                £{(director.netSpend / 1000000).toFixed(1)}M
              </span>
            </div>
            <div className="bg-slate-900/80 border border-white/10 rounded-xl p-3.5">
              <span className="text-xs text-slate-400 uppercase block mb-1">Years Active</span>
              <span className="text-lg sm:text-xl font-bold font-mono text-white tabular-nums">
                {director.yearsInCharge} Seasons
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      
      {/* Top Executive Banner */}
      <div className="bg-[#111827] border border-white/10 rounded-2xl p-4 sm:p-6 relative overflow-hidden">
        <div 
          className="hidden md:block absolute right-0 top-0 bottom-0 w-96 opacity-10 blur-3xl pointer-events-none"
          style={{ backgroundColor: club.primaryColor }}
        />

        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 relative z-10">
          
          {/* Identity & Status */}
          <div className="flex items-center gap-4 min-w-0">
            <div 
              className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl flex items-center justify-center font-black text-xl sm:text-2xl text-white shadow-2xl border border-white/20 shrink-0"
              style={{ backgroundColor: club.primaryColor }}
            >
              {club.shortName}
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-400 mb-1">
                <span>{club.tier === 1 ? 'Premier League' : club.tier === 2 ? 'Championship' : 'League One'}</span>
                <span aria-hidden="true">·</span>
                <span className="truncate">{club.stadium}</span>
                <span aria-hidden="true">·</span>
                <span className="text-amber-400 font-mono">Rank #{myPosition || 'N/A'}</span>
              </div>
              <h1 className="text-xl sm:text-2xl lg:text-3xl font-extrabold text-white tracking-tight truncate">
                {club.name}
              </h1>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-1 text-xs text-slate-300">
                <span>Director: <strong className="text-white">{director.name}</strong></span>
                <span aria-hidden="true">·</span>
                <span>Philosophy: <strong className="text-amber-400">{director.philosophy}</strong></span>
              </div>
            </div>
          </div>

          {/* Quick Simulation CTA */}
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => {
                sounds.playClick();
                onNavigate('transfers');
              }}
              className="px-3.5 py-2.5 min-h-11 lg:min-h-0 bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-semibold text-slate-200 rounded-xl transition-all cursor-pointer whitespace-nowrap"
            >
              Transfer Hub
            </button>
            <button
              onClick={() => {
                sounds.playClick();
                onAdvanceWeek();
              }}
              disabled={isSimulating}
              className="px-5 py-2.5 min-h-11 lg:min-h-0 bg-amber-400 hover:bg-amber-300 disabled:opacity-50 text-slate-950 text-xs font-extrabold rounded-xl transition-all shadow-lg shadow-amber-400/20 cursor-pointer flex items-center gap-2 whitespace-nowrap"
            >
              <Calendar className="w-4 h-4" />
              {isSimulating
                ? 'Simulating Week...'
                : isSeasonComplete
                ? 'End of Season Review'
                : `Simulate Matchday ${displayWeek}`}
            </button>
          </div>

        </div>
      </div>

      {/* Next Match Lineup Compact Card */}
      {nextMatchLineup && (
        <button
          type="button"
          onClick={() => {
            sounds.playClick();
            onNavigate('squad');
          }}
          className="w-full min-h-11 bg-[#111827] hover:bg-slate-900/90 border border-white/10 hover:border-amber-400/40 rounded-xl p-3 sm:p-4 flex items-center justify-between gap-3 sm:gap-4 text-left transition-all cursor-pointer active:scale-[0.99] focus-visible:outline-2 focus-visible:outline-amber-400"
        >
          <div className="flex items-center gap-3 sm:gap-4 min-w-0">
            {/* Mini 3:4 Pitch of 11 dots */}
            <svg
              viewBox="0 0 60 80"
              className="w-12 h-16 sm:w-14 sm:h-[74px] rounded-lg shrink-0 border border-white/15 shadow-inner"
              aria-hidden="true"
            >
              <defs>
                <linearGradient id="dash-mini-pitch" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#0f5132" />
                  <stop offset="100%" stopColor="#14623f" />
                </linearGradient>
              </defs>
              <rect width="60" height="80" rx="5" fill="url(#dash-mini-pitch)" />
              <g stroke="rgba(255,255,255,0.35)" strokeWidth="1.2" fill="none">
                <rect x="4" y="4" width="52" height="72" rx="2" />
                <line x1="4" y1="40" x2="56" y2="40" />
                <circle cx="30" cy="40" r="8" />
                <rect x="16" y="4" width="28" height="11" />
                <rect x="16" y="65" width="28" height="11" />
              </g>
              {nextMatchFormationDef.slots.map((slot, idx) => {
                const cx = 4 + (slot.x / 100) * 52;
                const cy = 4 + (slot.y / 100) * 72;
                const isGk = slot.role === 'GK';
                const hasPlayer = Boolean(nextMatchLineup.slots[idx]);
                return (
                  <circle
                    key={`${slot.role}-${idx}`}
                    cx={cx}
                    cy={cy}
                    r={isGk ? 2.8 : 2.5}
                    fill={hasPlayer ? (isGk ? '#38bdf8' : '#fbbf24') : 'rgba(255,255,255,0.28)'}
                    stroke="rgba(15,23,42,0.75)"
                    strokeWidth="0.7"
                  />
                );
              })}
            </svg>

            <div className="min-w-0">
              <div className="text-xs font-bold uppercase tracking-wider text-amber-400">
                Next Match Lineup
              </div>
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 mt-0.5">
                <span className="text-base sm:text-lg font-extrabold text-white font-mono tabular-nums">
                  {nextMatchLineup.formation}
                </span>
                <span className="text-slate-500 text-xs" aria-hidden="true">·</span>
                <span className="text-xs font-semibold text-slate-300">
                  {nextMatchLineup.auto ? 'Head Coach Auto' : 'Manual XI'}
                </span>
              </div>
              <div className="text-xs text-slate-400 truncate mt-0.5">
                {manager ? `${manager.name} (${manager.preferredFormation})` : 'Caretaker Setup'}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 sm:gap-4 shrink-0">
            <div className="text-right">
              <div className="text-xl sm:text-2xl font-black font-mono text-amber-400 tabular-nums leading-none">
                {nextMatchTeamRating}
              </div>
              <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mt-0.5">
                OVR
              </div>
            </div>
            <div className="flex items-center gap-1 text-xs font-semibold text-slate-300">
              <span className="hidden sm:inline">Pitch</span>
              <ArrowUpRight className="w-4 h-4 text-amber-400" />
            </div>
          </div>
        </button>
      )}

      {/* Board, Fan & Dressing Room Pulse */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        
        {/* Board Trust */}
        <div className="bg-[#111827] border border-white/10 rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-amber-400" />
              <span className="text-xs font-semibold text-slate-300">Boardroom Trust</span>
            </div>
            <span className="text-xs font-mono font-bold text-white tabular-nums">
              {director.boardTrust}%
            </span>
          </div>
          <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden mb-2">
            <div 
              className={`h-full transition-all duration-300 ${
                director.boardTrust > 65 ? 'bg-emerald-400' : director.boardTrust > 35 ? 'bg-amber-400' : 'bg-rose-500'
              }`}
              style={{ width: `${director.boardTrust}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-xs sm:text-[11px] text-slate-400 gap-2">
            <span>Owner: {owner?.name || 'Unknown'}</span>
            <span className="capitalize text-slate-300 font-medium">{owner?.patience || 'Balanced'} Patience</span>
          </div>
        </div>

        {/* Terrace & Fan Approval */}
        <div className="bg-[#111827] border border-white/10 rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-emerald-400" />
              <span className="text-xs font-semibold text-slate-300">Terrace Approval</span>
            </div>
            <span className="text-xs font-mono font-bold text-white tabular-nums">
              {director.fanApproval}%
            </span>
          </div>
          <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden mb-2">
            <div 
              className={`h-full transition-all duration-300 ${
                director.fanApproval > 65 ? 'bg-emerald-400' : director.fanApproval > 35 ? 'bg-amber-400' : 'bg-rose-500'
              }`}
              style={{ width: `${director.fanApproval}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-xs sm:text-[11px] text-slate-400 gap-2">
            <span>Target: {club.fanExpectation}</span>
            <span className="text-slate-300 font-medium">Prestige {club.prestige}</span>
          </div>
        </div>

        {/* Card 3: Manager Relationship (Director Mode) OR Sporting Director Dynamic (Manager Mode) */}
        {isManagerMode && managerCareer && clubDirector ? (
          (() => {
            const effectiveCtrl = calculateEffectiveControl(
              clubDirector.personality,
              managerCareer.profile.reputation,
              managerCareer.controlModifier || 0
            );
            return (
              <button
                type="button"
                onClick={() => {
                  sounds.playClick();
                  onNavigate('manager_director');
                }}
                className="bg-[#111827] hover:bg-slate-900/90 border border-white/10 hover:border-amber-400/40 rounded-xl p-4 text-left transition-colors cursor-pointer"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Users className="w-4 h-4 text-blue-400" />
                    <span className="text-xs font-semibold text-slate-300">Sporting Director</span>
                  </div>
                  <span className="text-xs font-mono font-bold text-amber-300 tabular-nums">
                    {effectiveCtrl}% Control
                  </span>
                </div>
                <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden mb-2">
                  <div
                    className="h-full transition-all duration-300 bg-blue-400"
                    style={{ width: `${effectiveCtrl}%` }}
                  />
                </div>
                <div className="flex items-center justify-between text-xs sm:text-[11px] text-slate-400 gap-2">
                  <span className="truncate">{clubDirector.name}</span>
                  <span className="text-slate-300 font-medium shrink-0">
                    {MANAGER_MODE_CONFIG.directors[clubDirector.personality].shortLabel}
                  </span>
                </div>
              </button>
            );
          })()
        ) : (
          <div className="bg-[#111827] border border-white/10 rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-blue-400" />
                <span className="text-xs font-semibold text-slate-300">Head Coach Synergy</span>
              </div>
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
            <div className="flex items-center justify-between text-xs sm:text-[11px] text-slate-400 gap-2">
              <span>{manager ? manager.name : 'No Manager Hired'}</span>
              <span className="capitalize text-slate-300 font-medium">{manager?.controlDesire || 'N/A'}</span>
            </div>
          </div>
        )}

      </div>

      {/* Manager Mode Career Actions Bar (Director / Become Sporting Director / Retire) */}
      {isManagerMode && managerCareer && (
        <div className="bg-[#111827] border border-white/10 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-400">
                Manager Career · Age {managerCareer.profile.age} · {managerCareer.profile.tacticalStyle}
              </span>
              {managerCareer.currentClubId && (
                <span
                  className={`px-2 py-0.5 rounded border text-[11px] font-mono font-bold ${
                    managerCareer.contractYears <= 1
                      ? 'bg-amber-500/15 border-amber-400/40 text-amber-300'
                      : 'bg-slate-900 border-white/10 text-slate-200'
                  }`}
                >
                  Contract: {managerCareer.contractYears}y · £{(managerCareer.weeklyWage / 1000).toFixed(1)}k/wk
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              {clubDirector
                ? MANAGER_MODE_CONFIG.directors[clubDirector.personality].description
                : 'Manage tactics, lineup, and transfer target requests.'}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => {
                sounds.playClick();
                onNavigate('manager_director');
              }}
              className="min-h-11 lg:min-h-0 px-3.5 py-2 rounded-xl bg-amber-400/15 hover:bg-amber-400/25 border border-amber-400/35 text-amber-300 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
            >
              <span>Director &amp; Contract</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
            {onBecomeSportingDirector && (
              <button
                type="button"
                onClick={() => {
                  sounds.playClick();
                  onBecomeSportingDirector();
                }}
                className="min-h-11 lg:min-h-0 px-3.5 py-2 rounded-xl bg-blue-500/15 hover:bg-blue-500/25 border border-blue-500/35 text-blue-300 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
              >
                <Building2 className="w-3.5 h-3.5" />
                <span>Become Sporting Director</span>
              </button>
            )}
            {onRetireManager && (
              <button
                type="button"
                onClick={() => {
                  sounds.playCrisis();
                  onRetireManager();
                }}
                className="min-h-11 lg:min-h-0 px-3.5 py-2 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/35 text-rose-300 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Retire</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Financial Ledger & Transfer ROI Row */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
        <div className="lg:col-span-7 bg-[#111827] border border-white/10 rounded-xl p-4 sm:p-5 flex flex-col justify-between">
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-3 mb-4">
              <div className="flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-amber-400" />
                <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                  Executive Financial Ledger
                </h3>
              </div>
              <span className="text-xs text-slate-400 font-mono">PSR & Amortisation Safe</span>
            </div>

            <div className="grid grid-cols-2 gap-4 sm:gap-5">
              <div>
                <span className="text-xs sm:text-[11px] text-slate-400 uppercase tracking-wider block mb-1">
                  Transfer War Chest
                </span>
                <span className="text-lg lg:text-xl font-bold font-mono tabular-nums text-amber-400">
                  £{(club.transferBudget / 1000000).toFixed(2)}M
                </span>
                <span className="text-xs sm:text-[10px] text-slate-500 block mt-0.5">Available for transfer fees</span>
              </div>

              <div>
                <span className="text-xs sm:text-[11px] text-slate-400 uppercase tracking-wider block mb-1">
                  Weekly Wage Bill
                </span>
                <span className="text-lg lg:text-xl font-bold font-mono tabular-nums text-white">
                  £{(currentWages / 1000).toFixed(0)}k <span className="text-xs text-slate-400 font-normal">/ £{(club.wageBudget / 1000).toFixed(0)}k</span>
                </span>
                <span className="text-xs sm:text-[10px] text-slate-400 block mt-0.5 font-mono">
                  {wageUsagePercent}% of allowed ceiling
                </span>
              </div>

              <div>
                <span className="text-xs sm:text-[11px] text-slate-400 uppercase tracking-wider block mb-1">
                  Club Treasury Balance
                </span>
                <span className="text-lg lg:text-xl font-bold font-mono tabular-nums text-emerald-400">
                  £{(club.balance / 1000000).toFixed(2)}M
                </span>
                <span className="text-xs sm:text-[10px] text-slate-500 block mt-0.5">Total club cash reserves</span>
              </div>

              <div>
                <span className="text-xs sm:text-[11px] text-slate-400 uppercase tracking-wider block mb-1">
                  {isManagerMode ? 'Manager Reputation' : 'Director Reputation'}
                </span>
                <span className="text-lg lg:text-xl font-bold font-mono tabular-nums text-blue-400">
                  {isManagerMode && managerCareer ? managerCareer.profile.reputation : director.reputation} / 100
                </span>
                <span className="text-xs sm:text-[10px] text-slate-500 block mt-0.5">
                  {isManagerMode ? 'Touchline standing & club stature' : 'Global executive pedigree'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {!isManagerMode && transferRoiSummary && (
          <div className="lg:col-span-5">
            <TransferROICard
              summary={transferRoiSummary}
              onInspect={() => setIsRoiModalOpen(true)}
              onOpenTransfers={() => onNavigate('transfers')}
            />
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* PYRAMID LEAGUE CENTRAL & GAMEWEEK HISTORY ARCHIVE                          */}
      {/* ========================================================================= */}
      <div className="bg-[#111827] border border-white/10 rounded-2xl p-4 sm:p-5 lg:p-6 space-y-6">
        
        {/* Tier Selector Bar & Expansion Action */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/10 pb-4">
          
          {/* Division Selector Tabs */}
          <div className="flex items-center gap-1.5 p-1 bg-slate-900/90 border border-white/10 rounded-xl overflow-x-auto max-w-full">
            <button
              onClick={() => {
                sounds.playClick();
                setSelectedTier(1);
              }}
              className={`px-3.5 py-2 min-h-11 lg:min-h-0 text-xs font-bold rounded-lg transition-all cursor-pointer whitespace-nowrap flex items-center gap-2 ${
                selectedTier === 1 
                  ? 'bg-amber-400 text-slate-950 shadow-md font-extrabold' 
                  : 'text-slate-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <Trophy className="w-3.5 h-3.5" />
              <span>Premier League</span>
              {club.tier === 1 && (
                <span className={`text-xs sm:text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider ${selectedTier === 1 ? 'bg-slate-950 text-amber-400' : 'bg-amber-400/20 text-amber-300'}`}>
                  My League
                </span>
              )}
              <span className={`text-xs sm:text-[10px] px-1.5 py-0.2 rounded font-mono ${selectedTier === 1 ? 'bg-slate-950/20 text-slate-950' : 'bg-slate-800 text-slate-400'}`}>
                20
              </span>
            </button>

            <button
              onClick={() => {
                sounds.playClick();
                setSelectedTier(2);
              }}
              className={`px-3.5 py-2 min-h-11 lg:min-h-0 text-xs font-bold rounded-lg transition-all cursor-pointer whitespace-nowrap flex items-center gap-2 ${
                selectedTier === 2 
                  ? 'bg-amber-400 text-slate-950 shadow-md font-extrabold' 
                  : 'text-slate-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <Shield className="w-3.5 h-3.5" />
              <span>Championship</span>
              {club.tier === 2 && (
                <span className={`text-xs sm:text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider ${selectedTier === 2 ? 'bg-slate-950 text-amber-400' : 'bg-amber-400/20 text-amber-300'}`}>
                  My League
                </span>
              )}
              <span className={`text-xs sm:text-[10px] px-1.5 py-0.2 rounded font-mono ${selectedTier === 2 ? 'bg-slate-950/20 text-slate-950' : 'bg-slate-800 text-slate-400'}`}>
                24
              </span>
            </button>

            <button
              onClick={() => {
                sounds.playClick();
                setSelectedTier(3);
              }}
              className={`px-3.5 py-2 min-h-11 lg:min-h-0 text-xs font-bold rounded-lg transition-all cursor-pointer whitespace-nowrap flex items-center gap-2 ${
                selectedTier === 3 
                  ? 'bg-amber-400 text-slate-950 shadow-md font-extrabold' 
                  : 'text-slate-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>League One</span>
              {club.tier === 3 && (
                <span className={`text-xs sm:text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider ${selectedTier === 3 ? 'bg-slate-950 text-amber-400' : 'bg-amber-400/20 text-amber-300'}`}>
                  My League
                </span>
              )}
              <span className={`text-xs sm:text-[10px] px-1.5 py-0.2 rounded font-mono ${selectedTier === 3 ? 'bg-slate-950/20 text-slate-950' : 'bg-slate-800 text-slate-400'}`}>
                24
              </span>
            </button>
          </div>

          {/* Table Expansion & Context Info */}
          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-2 text-xs text-slate-400 font-mono">
              <span>Season {seasonYear}/{seasonYear + 1}</span>
              <span aria-hidden="true">·</span>
              <span className={club.tier === selectedTier ? 'text-amber-400 font-bold' : 'text-slate-400'}>
                {club.tier === selectedTier ? `My Club: #${myPosition || 'N/A'}` : 'External Division'}
              </span>
            </div>

            <button
              onClick={() => {
                sounds.playClick();
                setIsTableExpanded(!isTableExpanded);
              }}
              className="px-3 py-1.5 min-h-11 lg:min-h-0 bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-semibold text-slate-200 rounded-lg transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap"
            >
              {isTableExpanded ? (
                <>
                  <Minimize2 className="w-3.5 h-3.5 text-amber-400" />
                  <span>Compact View</span>
                </>
              ) : (
                <>
                  <Maximize2 className="w-3.5 h-3.5 text-amber-400" />
                  <span>Full Table ({sortedTableRows.length})</span>
                </>
              )}
            </button>
          </div>

        </div>

        {/* Gameweek History Navigator Bar */}
        <div className="bg-slate-900/80 border border-white/10 rounded-xl p-4 flex flex-col md:flex-row items-center justify-between gap-4">
          
          {/* Left: Previous / Next & Stepper */}
          <div className="flex items-center gap-2 w-full md:w-auto justify-between md:justify-start">
            <button
              onClick={handlePrevWeek}
              disabled={selectedWeek <= 1}
              className="p-2 min-h-11 min-w-11 lg:min-h-0 lg:min-w-0 flex items-center justify-center bg-white/5 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed border border-white/10 rounded-lg text-slate-300 transition-all cursor-pointer active:scale-95"
              title="Previous Gameweek"
              aria-label="Previous Gameweek"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-2 font-mono">
              <span className="text-xs text-slate-400 uppercase tracking-wider">Gameweek</span>
              <input
                type="number"
                inputMode="numeric"
                aria-label="Selected Gameweek"
                min={1}
                max={maxWeek}
                value={selectedWeek}
                onChange={(e) => {
                  const val = parseInt(e.target.value, 10);
                  if (!isNaN(val)) {
                    setSelectedWeek(Math.max(1, Math.min(maxWeek, val)));
                  }
                }}
                className="w-16 min-h-11 lg:min-h-0 text-center px-2 py-1 bg-slate-950 border border-white/20 rounded text-amber-400 font-bold text-base md:text-sm tabular-nums focus:outline-none focus:border-amber-400"
              />
              <span className="text-xs text-slate-500">/ {maxWeek}</span>
            </div>

            <button
              onClick={handleNextWeek}
              disabled={selectedWeek >= maxWeek}
              className="p-2 min-h-11 min-w-11 lg:min-h-0 lg:min-w-0 flex items-center justify-center bg-white/5 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed border border-white/10 rounded-lg text-slate-300 transition-all cursor-pointer active:scale-95"
              title="Next Gameweek"
              aria-label="Next Gameweek"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Center: Range Slider for Rapid Scrubbing */}
          <div className="flex-1 w-full max-w-md flex items-center gap-3">
            <span className="text-xs sm:text-[10px] text-slate-500 font-mono">GW 1</span>
            <input
              type="range"
              aria-label="Scrub Gameweek History"
              min={1}
              max={maxWeek}
              value={selectedWeek}
              onChange={(e) => setSelectedWeek(parseInt(e.target.value, 10))}
              className="w-full min-h-11 lg:min-h-0 accent-amber-400 cursor-pointer h-2 bg-slate-800 rounded-lg"
            />
            <span className="text-xs sm:text-[10px] text-slate-500 font-mono">GW {maxWeek}</span>
          </div>

          {/* Right: Live vs Historical Status & Jump to Current */}
          <div className="flex items-center gap-2 w-full md:w-auto justify-end">
            {isSeasonComplete && selectedWeek === 46 ? (
              <span className="text-xs sm:text-[11px] font-mono text-emerald-400 flex items-center gap-1.5 px-2.5 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded-md">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                Season Complete (46/46)
              </span>
            ) : isViewingLive ? (
              <span className="text-xs sm:text-[11px] font-mono text-emerald-400 flex items-center gap-1.5 px-2.5 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded-md">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                Live Standings (GW {displayWeek})
              </span>
            ) : (
              <button
                onClick={handleJumpToCurrent}
                className="text-xs sm:text-[11px] font-mono text-amber-400 hover:text-amber-300 flex items-center gap-1.5 px-3 py-1.5 min-h-11 lg:min-h-0 bg-amber-400/10 hover:bg-amber-400/20 border border-amber-400/30 rounded-md transition-all cursor-pointer whitespace-nowrap active:scale-95"
              >
                <RefreshCw className="w-3 h-3" />
                {isSeasonComplete ? 'Jump to Final (GW 46)' : `Jump to Current (GW ${displayWeek})`}
              </button>
            )}
          </div>

        </div>

        {/* 2-Column Split: Standings Table (Left/Main on xl) & Gameweek Fixtures/Results (First on mobile, Right on xl) */}
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
          
          {/* Main Standings Table (Col span 7 in xl, order-2 below xl) */}
          <div className="xl:col-span-7 order-2 xl:order-1 min-w-0 bg-slate-900/60 border border-white/10 rounded-xl p-4 overflow-hidden">
            
            <div className="flex flex-wrap items-center justify-between border-b border-white/10 pb-3 mb-3 gap-2">
              <div>
                <h4 className="text-xs font-bold text-white uppercase tracking-wider flex flex-wrap items-center gap-2">
                  <span>{selectedTier === 1 ? 'Premier League' : selectedTier === 2 ? 'Championship' : 'League One'}</span>
                  <span className="text-xs sm:text-[10px] font-normal text-slate-400 font-mono">
                    {isSeasonComplete && selectedWeek === 46
                      ? '(Final Standings · GW 46)'
                      : isViewingLive
                      ? `(Live GW ${displayWeek})`
                      : `(Snapshot after GW ${selectedWeek})`}
                  </span>
                </h4>
                <span className="text-xs sm:text-[10px] text-slate-400">
                  Showing {displayedTableRows.length} of {sortedTableRows.length} Clubs
                </span>
              </div>

              {/* Table Legend (visible on all sizes) */}
              <div className="flex flex-wrap items-center gap-2 text-xs sm:text-[10px] text-slate-400 font-mono">
                {selectedTier === 1 ? (
                  <>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-cyan-400" /> UCL</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-amber-400" /> UEL</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-rose-500" /> Rel</span>
                  </>
                ) : (
                  <>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-emerald-400" /> Auto</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-sky-400" /> Play-offs</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-rose-500" /> Rel</span>
                  </>
                )}
              </div>
            </div>

            {/* Mobile (< md): Sort Controls + Standings Card List */}
            <div className="md:hidden space-y-2.5">
              <div className="flex items-center gap-2 bg-slate-950/70 border border-white/10 rounded-lg p-2">
                <label htmlFor="standings-mobile-sort" className="text-xs text-slate-400 font-semibold whitespace-nowrap pl-1">
                  Sort by
                </label>
                <select
                  id="standings-mobile-sort"
                  value={standingsSortField}
                  onChange={e => {
                    sounds.playClick();
                    const field = e.target.value as 'rank' | 'name' | 'played' | 'won' | 'drawn' | 'lost' | 'goalDifference' | 'points';
                    setStandingsSortField(field);
                    setStandingsSortAsc(field === 'rank' || field === 'name');
                  }}
                  className="flex-1 min-h-11 px-2.5 py-1.5 bg-slate-900 border border-white/10 rounded-lg text-base text-white font-semibold focus:outline-none focus:border-amber-400"
                >
                  <option value="rank">Position (#)</option>
                  <option value="points">Points</option>
                  <option value="goalDifference">Goal Difference</option>
                  <option value="won">Wins</option>
                  <option value="played">Played</option>
                  <option value="name">Club Name</option>
                </select>
                <button
                  type="button"
                  onClick={() => {
                    sounds.playClick();
                    setStandingsSortAsc(prev => !prev);
                  }}
                  aria-label={standingsSortAsc ? 'Sort ascending, tap for descending' : 'Sort descending, tap for ascending'}
                  className="min-h-11 min-w-11 px-2.5 flex items-center justify-center gap-1 bg-slate-900 border border-white/10 rounded-lg text-amber-400 text-xs font-bold cursor-pointer active:scale-95"
                >
                  {standingsSortAsc ? <ArrowUp className="w-4 h-4" /> : <ArrowDown className="w-4 h-4" />}
                </button>
              </div>

              <div className="space-y-2">
                {finalTableRows.map(row => {
                  const originalRank = rankByClubId.get(row.id) ?? 1;
                  const zone = getZoneStyle(originalRank, selectedTier, sortedTableRows.length);
                  return (
                    <StandingsMobileCard
                      key={row.id}
                      row={row}
                      originalRank={originalRank}
                      isMyClub={row.id === club.id}
                      zoneBorder={zone.border}
                      zoneLabel={zone.label}
                      isExpanded={expandedClubId === row.id}
                      onToggleExpand={handleToggleExpandClub}
                    />
                  );
                })}
              </div>
            </div>

            {/* Desktop/Tablet (md+): Standings Grid */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left text-xs font-mono">
                <thead>
                  <tr className="text-xs sm:text-[10px] text-slate-500 border-b border-white/5 uppercase bg-[#121a28]">
                    <th className="sticky left-0 z-20 bg-[#121a28] py-1 px-1 w-10">
                      <button type="button" onClick={() => handleStandingsSort('rank')} className="w-full min-h-11 lg:min-h-0 py-1.5 text-left cursor-pointer hover:text-white uppercase">
                        #
                      </button>
                    </th>
                    <th className="sticky left-10 z-20 bg-[#121a28] py-1 px-2 border-r border-white/5">
                      <button type="button" onClick={() => handleStandingsSort('name')} className="w-full min-h-11 lg:min-h-0 py-1.5 text-left cursor-pointer hover:text-white uppercase">
                        Club
                      </button>
                    </th>
                    <th className="py-1 px-1 text-center">
                      <button type="button" onClick={() => handleStandingsSort('played')} className="w-full min-h-11 lg:min-h-0 py-1.5 text-center cursor-pointer hover:text-white uppercase">
                        P
                      </button>
                    </th>
                    <th className="hidden lg:table-cell py-1 px-1 text-center">
                      <button type="button" onClick={() => handleStandingsSort('won')} className="w-full min-h-11 lg:min-h-0 py-1.5 text-center cursor-pointer hover:text-white uppercase">
                        W
                      </button>
                    </th>
                    <th className="hidden lg:table-cell py-1 px-1 text-center">
                      <button type="button" onClick={() => handleStandingsSort('drawn')} className="w-full min-h-11 lg:min-h-0 py-1.5 text-center cursor-pointer hover:text-white uppercase">
                        D
                      </button>
                    </th>
                    <th className="hidden lg:table-cell py-1 px-1 text-center">
                      <button type="button" onClick={() => handleStandingsSort('lost')} className="w-full min-h-11 lg:min-h-0 py-1.5 text-center cursor-pointer hover:text-white uppercase">
                        L
                      </button>
                    </th>
                    <th className="py-1 px-1 text-center">
                      <button type="button" onClick={() => handleStandingsSort('goalDifference')} className="w-full min-h-11 lg:min-h-0 py-1.5 text-center cursor-pointer hover:text-white uppercase">
                        GD
                      </button>
                    </th>
                    <th className="py-1 px-2 text-right">
                      <button type="button" onClick={() => handleStandingsSort('points')} className="w-full min-h-11 lg:min-h-0 py-1.5 text-right cursor-pointer hover:text-white uppercase">
                        Pts
                      </button>
                    </th>
                    <th className="hidden xl:table-cell py-2 px-2 text-center">Form</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {finalTableRows.map((row) => {
                    const originalRank = rankByClubId.get(row.id) ?? 1;
                    const zone = getZoneStyle(originalRank, selectedTier, sortedTableRows.length);
                    return (
                      <StandingsTableRow
                        key={row.id}
                        row={row}
                        originalRank={originalRank}
                        isMyClub={row.id === club.id}
                        zoneBorder={zone.border}
                      />
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Bottom summary and table expansion shortcut */}
            <div className="border-t border-white/10 pt-3 mt-3 flex flex-wrap items-center justify-between gap-2 text-xs sm:text-[11px] text-slate-400">
              <span>{selectedTier === 1 ? '38 Games Season' : '46 Games Season'}</span>
              <button
                onClick={() => {
                  sounds.playClick();
                  setIsTableExpanded(!isTableExpanded);
                }}
                className="min-h-11 lg:min-h-0 px-2 flex items-center text-amber-400 hover:text-amber-300 font-semibold cursor-pointer active:scale-95"
              >
                {isTableExpanded ? 'Show Top & Relegation Cut' : `Show All ${sortedTableRows.length} Teams`}
              </button>
            </div>

          </div>

          {/* Gameweek Fixtures & Scorelines Drawer (Col span 5 in xl, first on mobile/tablet) */}
          <div className="xl:col-span-5 order-1 xl:order-2 min-w-0 bg-slate-900/60 border border-white/10 rounded-xl p-4 flex flex-col justify-between">
            <div>
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-3 mb-3">
                <div>
                  <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                    <Calendar className="w-3.5 h-3.5 text-amber-400" />
                    <span>Gameweek {selectedWeek} Fixtures</span>
                  </h4>
                  <span className="text-xs sm:text-[10px] text-slate-400">
                    {selectedTier === 1 ? 'Premier League Results' : selectedTier === 2 ? 'Championship Results' : 'League One Results'}
                  </span>
                </div>

                {/* Fixture filter: All or Director's match */}
                {club.tier === selectedTier && (
                  <div className="flex items-center gap-1 p-0.5 bg-slate-950 rounded-lg text-xs sm:text-[10px] font-mono">
                    <button
                      onClick={() => setFixtureFilter('all')}
                      className={`px-2.5 py-1 min-h-11 lg:min-h-0 rounded cursor-pointer ${fixtureFilter === 'all' ? 'bg-amber-400 text-slate-950 font-bold' : 'text-slate-400 hover:text-white'}`}
                    >
                      All
                    </button>
                    <button
                      onClick={() => setFixtureFilter('my_club')}
                      className={`px-2.5 py-1 min-h-11 lg:min-h-0 rounded cursor-pointer ${fixtureFilter === 'my_club' ? 'bg-amber-400 text-slate-950 font-bold' : 'text-slate-400 hover:text-white'}`}
                    >
                      My Match
                    </button>
                  </div>
                )}
              </div>

              {/* Match list */}
              {isViewingLive ? (
                <div className="py-8 px-4 text-center text-slate-400 space-y-2">
                  <Flame className="w-6 h-6 text-amber-400 mx-auto opacity-70" />
                  <p className="text-xs font-semibold text-slate-200">
                    {selectedTier === 1 && currentWeek > 38
                      ? 'Premier League Regular Season Complete (38/38 Matches)'
                      : `Gameweek ${displayWeek} Kick-off Pending`}
                  </p>
                  <p className="text-xs sm:text-[11px] text-slate-500 max-w-xs mx-auto">
                    {selectedTier === 1 && currentWeek > 38
                      ? 'Premier League fixtures have concluded for this campaign. Advance the simulation to finish Championship and League One matchdays (Weeks 39–46).'
                      : 'These fixtures have not kicked off yet. Advance the weekly simulation to play out all scheduled matches across the pyramid!'}
                  </p>
                  <button
                    onClick={() => {
                      sounds.playClick();
                      onAdvanceWeek();
                    }}
                    disabled={isSimulating}
                    className="mt-3 px-4 py-2 min-h-11 lg:min-h-0 bg-amber-400 hover:bg-amber-300 disabled:opacity-50 text-slate-950 text-xs font-bold rounded-lg cursor-pointer"
                  >
                    Simulate Matchday {displayWeek}
                  </button>
                </div>
              ) : gameweekFixtures.length === 0 ? (
                <div className="py-8 text-center text-slate-500 text-xs font-mono">
                  No recorded matches for Gameweek {selectedWeek} in this division.
                </div>
              ) : (
                <div className="space-y-2 max-h-[460px] overflow-y-auto pr-1">
                  {gameweekFixtures.map((match, idx) => {
                    const homeClub = clubsById.get(match.homeClubId);
                    const awayClub = clubsById.get(match.awayClubId);
                    const isMyMatch = match.homeClubId === club.id || match.awayClubId === club.id;

                    const goalEvents = (match.events || []).filter(e => e.type === 'goal');

                    return (
                      <div
                        key={idx}
                        className={`p-2.5 rounded-lg border text-xs transition-all ${
                          isMyMatch 
                            ? 'bg-amber-400/10 border-amber-400/30' 
                            : 'bg-slate-950/70 border-white/5 hover:border-white/10'
                        }`}
                      >
                        {/* Scoreline */}
                        <div className="flex items-center justify-between font-mono">
                          {/* Home */}
                          <div className="flex items-center gap-1.5 flex-1 justify-end font-sans pr-2 min-w-0">
                            <span className="font-semibold text-white truncate max-w-[90px] sm:max-w-[120px] text-right">
                              {homeClub?.shortName || match.homeClubId}
                            </span>
                            <span 
                              className="w-2 h-2 rounded-full shrink-0" 
                              style={{ backgroundColor: homeClub?.primaryColor || '#94a3b8' }} 
                            />
                          </div>

                          {/* Result Badge */}
                          <div className="px-2.5 py-1 bg-slate-800 text-white font-extrabold rounded text-xs tabular-nums tracking-wider shrink-0 shadow-inner">
                            {match.homeScore} - {match.awayScore}
                          </div>

                          {/* Away */}
                          <div className="flex items-center gap-1.5 flex-1 justify-start font-sans pl-2 min-w-0">
                            <span 
                              className="w-2 h-2 rounded-full shrink-0" 
                              style={{ backgroundColor: awayClub?.primaryColor || '#94a3b8' }} 
                            />
                            <span className="font-semibold text-white truncate max-w-[90px] sm:max-w-[120px] text-left">
                              {awayClub?.shortName || match.awayClubId}
                            </span>
                          </div>
                        </div>

                        {/* Goal events preview if any */}
                        {goalEvents.length > 0 && (
                          <div className="mt-1.5 pt-1.5 border-t border-white/5 text-xs sm:text-[10px] text-slate-400 flex flex-wrap gap-x-2 gap-y-0.5 justify-center font-mono">
                            {goalEvents.map((ev, gIdx) => (
                              <span key={gIdx} className="text-slate-400">
                                ⚽ {ev.player} ({ev.minute}')
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="border-t border-white/10 pt-3 mt-4 text-xs sm:text-[10px] text-slate-400 flex items-center justify-between font-mono">
              <span>Division Fixtures: {gameweekFixtures.length} matches</span>
              <span>Gameweek {selectedWeek}</span>
            </div>
          </div>

        </div>

      </div>

      {/* Squad Spotlight & Key Assets */}
      <div className="bg-[#111827] border border-white/10 rounded-xl p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-3 mb-4">
          <div>
            <h3 className="text-xs font-bold text-white uppercase tracking-wider">
              Director's Squad Assets & Depth
            </h3>
            <span className="text-xs sm:text-[10px] text-slate-400">Primary Senior First Team Assets</span>
          </div>
          <button 
            onClick={() => onNavigate('squad')}
            className="min-h-11 lg:min-h-0 px-2 text-xs sm:text-[11px] text-amber-400 hover:text-amber-300 cursor-pointer font-semibold flex items-center gap-1 active:scale-95"
          >
            <span>Full Roster ({club.squad.length} Players)</span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-5 gap-3">
          {squadSpotlight.map(player => (
            <div key={player.id} className="bg-slate-900/60 border border-white/5 rounded-lg p-3 flex items-center justify-between text-xs">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs sm:text-[10px] font-mono px-1 bg-slate-800 text-slate-300 rounded font-bold">{player.position}</span>
                  <span className="font-semibold text-white truncate max-w-[110px]">{player.name}</span>
                </div>
                <span className="text-xs sm:text-[10px] text-slate-400 block mt-0.5">{player.roleDetail} · Age {player.age}</span>
              </div>
              <div className="text-right shrink-0 ml-2">
                <span className="font-mono font-bold text-amber-400 text-sm">{player.overall}</span>
                <span className="text-xs sm:text-[10px] text-emerald-400/90 block font-mono font-medium">
                  {player.growthMomentum === 'breakout' ? '🚀 Breakout' : player.growthMomentum === 'rapid' ? '📈 Rapid' : player.growthMomentum === 'prime' ? '⭐ Prime' : player.growthMomentum === 'cooling' ? '📉 Cooling' : '⚖️ Steady'}
                </span>
              </div>
            </div>
          ))}
        </div>

        <div className="border-t border-white/10 pt-3 mt-4 text-xs sm:text-[11px] text-slate-400 flex items-center justify-between gap-2">
          <span>Active Injuries: {activeInjuriesCount}</span>
          {(() => {
            const avgHappiness = club.squad.length > 0
              ? Math.round(club.squad.reduce((sum, p) => sum + p.happiness, 0) / club.squad.length)
              : 70;
            const moraleLabel = avgHappiness >= 75 ? 'High' : avgHappiness >= 58 ? 'Steady' : avgHappiness >= 42 ? 'Fragile' : 'Low';
            const moraleClass = avgHappiness >= 75 ? 'text-emerald-400' : avgHappiness >= 58 ? 'text-amber-300' : 'text-rose-400';
            return (
              <span>
                Squad Morale: <strong className={`${moraleClass} font-semibold`}>{moraleLabel} ({avgHappiness}%)</strong>
              </span>
            );
          })()}
        </div>
      </div>

      {transferRoiSummary && (
        <TransferROIModal
          isOpen={isRoiModalOpen}
          onClose={() => setIsRoiModalOpen(false)}
          summary={transferRoiSummary}
          clubName={club.name}
        />
      )}

    </div>
  );
};
