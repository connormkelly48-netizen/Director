/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { Club, Director, Owner, Manager, Player, PlayerPosition, DelegationMatrix, GrowthMomentum } from '../types/game';
import { 
  DollarSign, 
  Search, 
  Filter, 
  ShieldAlert, 
  CheckCircle, 
  AlertTriangle, 
  ArrowRight, 
  UserPlus, 
  X, 
  ArrowUpDown, 
  ArrowUp, 
  ArrowDown, 
  RotateCcw, 
  SlidersHorizontal, 
  ChevronLeft, 
  ChevronRight, 
  TrendingUp, 
  Sparkles,
  Coins,
  Shield
} from 'lucide-react';
import { sounds } from '../services/soundEffects';

interface TransfersViewProps {
  currentClub: Club;
  allClubs: Club[];
  freeAgents: Player[];
  director: Director;
  owner: Owner;
  manager: Manager | undefined;
  delegation: DelegationMatrix;
  onCompleteTransfer: (
    signedPlayer: Player,
    fee: number,
    updatedCurrentClub: Club,
    updatedSellingClub: Club | null,
    updatedDirector: Director,
    updatedOwner: Owner,
    updatedManager: Manager | undefined
  ) => void;
}

type SortField = 'overall' | 'age' | 'growthMomentum' | 'value' | 'wage' | 'name';
type SortDirection = 'asc' | 'desc';

const MOMENTUM_ORDER: Record<GrowthMomentum, number> = {
  breakout: 5,
  rapid: 4,
  prime: 3,
  steady: 2,
  cooling: 1,
};

export const TransfersView: React.FC<TransfersViewProps> = ({
  currentClub,
  allClubs,
  freeAgents,
  director,
  owner,
  manager,
  delegation,
  onCompleteTransfer,
}) => {
  // Search & Basic filters
  const [searchQuery, setSearchQuery] = useState('');
  const [filterTier, setFilterTier] = useState<number | 'FA' | 'all'>('all');
  const [filterPos, setFilterPos] = useState<PlayerPosition | 'ALL'>('ALL');
  
  // Advanced filters
  const [minAge, setMinAge] = useState<number>(16);
  const [maxAge, setMaxAge] = useState<number>(40);
  const [minOvr, setMinOvr] = useState<number>(40);
  const [maxOvr, setMaxOvr] = useState<number>(99);
  const [filterMomentum, setFilterMomentum] = useState<GrowthMomentum | 'ALL'>('ALL');
  const [onlyAffordableFee, setOnlyAffordableFee] = useState<boolean>(false);
  const [onlyAffordableWage, setOnlyAffordableWage] = useState<boolean>(false);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState<boolean>(false);

  // Sorting state (default: highest overall first)
  const [sortField, setSortField] = useState<SortField>('overall');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  // Pagination state
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(25);

  // Target player for negotiation
  const [targetPlayer, setTargetPlayer] = useState<{ player: Player; club: Club | null } | null>(null);

  // Negotiation state
  const [offerFee, setOfferFee] = useState<number>(0);
  const [offerWage, setOfferWage] = useState<number>(0);
  const [offerYears, setOfferYears] = useState<number>(3);
  const [negotiationStep, setNegotiationStep] = useState<'BID' | 'TERMS' | 'OWNER_CHECK' | 'SUCCESS'>('BID');
  const [feedback, setFeedback] = useState<string | null>(null);

  const currentWages = currentClub.squad.reduce((a, b) => a + b.wage, 0);
  const wageSpaceRemaining = Math.max(0, currentClub.wageBudget - currentWages);

  // Gather all players across the 68 clubs + free agents
  const allAvailablePlayers = useMemo(() => {
    const list: Array<{ player: Player; club: Club | null }> = [];

    freeAgents.forEach(fa => {
      list.push({ player: fa, club: null });
    });

    allClubs.forEach(c => {
      if (c.id === currentClub.id) return;
      c.squad.forEach(p => {
        list.push({ player: p, club: c });
      });
    });

    return list;
  }, [allClubs, freeAgents, currentClub.id]);

  // Count active non-default filters
  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (searchQuery.trim()) count++;
    if (filterTier !== 'all') count++;
    if (filterPos !== 'ALL') count++;
    if (minAge > 16 || maxAge < 40) count++;
    if (minOvr > 40 || maxOvr < 99) count++;
    if (filterMomentum !== 'ALL') count++;
    if (onlyAffordableFee) count++;
    if (onlyAffordableWage) count++;
    return count;
  }, [searchQuery, filterTier, filterPos, minAge, maxAge, minOvr, maxOvr, filterMomentum, onlyAffordableFee, onlyAffordableWage]);

  // Reset all filters
  const handleResetFilters = () => {
    sounds.playClick();
    setSearchQuery('');
    setFilterTier('all');
    setFilterPos('ALL');
    setMinAge(16);
    setMaxAge(40);
    setMinOvr(40);
    setMaxOvr(99);
    setFilterMomentum('ALL');
    setOnlyAffordableFee(false);
    setOnlyAffordableWage(false);
    setCurrentPage(1);
  };

  // Filter & Sort players
  const filteredAndSortedList = useMemo(() => {
    // 1. Filtering
    const filtered = allAvailablePlayers.filter(({ player, club }) => {
      // Search query (player name or club name)
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchesName = player.name.toLowerCase().includes(query);
        const matchesClub = club ? club.name.toLowerCase().includes(query) : 'free agent'.includes(query);
        const matchesRole = player.roleDetail.toLowerCase().includes(query);
        if (!matchesName && !matchesClub && !matchesRole) {
          return false;
        }
      }

      // Position filter
      if (filterPos !== 'ALL' && player.position !== filterPos) {
        return false;
      }

      // League / Tier filter
      if (filterTier === 'FA') {
        if (club !== null) return false;
      } else if (typeof filterTier === 'number') {
        if (club?.tier !== filterTier) return false;
      }

      // Age range filter
      if (player.age < minAge || player.age > maxAge) {
        return false;
      }

      // Rating / OVR range filter
      if (player.overall < minOvr || player.overall > maxOvr) {
        return false;
      }

      // Momentum filter
      if (filterMomentum !== 'ALL') {
        if (player.growthMomentum !== filterMomentum) {
          return false;
        }
      }

      // Affordability filters
      if (onlyAffordableFee) {
        const estimatedFee = club ? Math.round(player.value * 0.9) : 0;
        if (estimatedFee > currentClub.transferBudget) return false;
      }

      if (onlyAffordableWage) {
        const estimatedWage = Math.round(player.wage * 0.85);
        if (estimatedWage > wageSpaceRemaining) return false;
      }

      return true;
    });

    // 2. Sorting
    filtered.sort((a, b) => {
      let comparison = 0;

      switch (sortField) {
        case 'overall':
          comparison = a.player.overall - b.player.overall;
          break;
        case 'age':
          comparison = a.player.age - b.player.age;
          break;
        case 'growthMomentum': {
          const rankA = a.player.growthMomentum ? MOMENTUM_ORDER[a.player.growthMomentum] : 0;
          const rankB = b.player.growthMomentum ? MOMENTUM_ORDER[b.player.growthMomentum] : 0;
          comparison = rankA - rankB;
          break;
        }
        case 'value':
          comparison = a.player.value - b.player.value;
          break;
        case 'wage':
          comparison = a.player.wage - b.player.wage;
          break;
        case 'name':
          comparison = a.player.name.localeCompare(b.player.name);
          break;
        default:
          comparison = 0;
      }

      // Apply direction
      return sortDirection === 'desc' ? -comparison : comparison;
    });

    return filtered;
  }, [
    allAvailablePlayers,
    searchQuery,
    filterPos,
    filterTier,
    minAge,
    maxAge,
    minOvr,
    maxOvr,
    filterMomentum,
    onlyAffordableFee,
    onlyAffordableWage,
    currentClub.transferBudget,
    wageSpaceRemaining,
    sortField,
    sortDirection,
  ]);

  // Pagination calculation
  const totalItems = filteredAndSortedList.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const validCurrentPage = Math.min(currentPage, totalPages);
  
  const paginatedList = useMemo(() => {
    const start = (validCurrentPage - 1) * pageSize;
    return filteredAndSortedList.slice(start, start + pageSize);
  }, [filteredAndSortedList, validCurrentPage, pageSize]);

  // Handle column header clicks for instant sorting
  const handleSortToggle = (field: SortField) => {
    sounds.playClick();
    if (sortField === field) {
      // Toggle direction
      setSortDirection(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      // New field - default to most natural direction
      setSortField(field);
      // For age or name, ascending is often natural; for ratings/value/wage/momentum, descending is natural
      if (field === 'age' || field === 'name') {
        setSortDirection('asc');
      } else {
        setSortDirection('desc');
      }
    }
    setCurrentPage(1);
  };

  const handleOpenNegotiate = (item: { player: Player; club: Club | null }) => {
    sounds.playClick();
    setTargetPlayer(item);
    setOfferFee(item.club ? Math.round(item.player.value * 1.05) : 0);
    setOfferWage(Math.round(item.player.wage * 1.15) || 25000);
    setOfferYears(3);
    setNegotiationStep(item.club ? 'BID' : 'TERMS');
    setFeedback(null);
  };

  // Submit Bid to Selling Club
  const handleClubBid = () => {
    if (!targetPlayer) return;
    sounds.playClick();

    if (offerFee > currentClub.transferBudget) {
      setFeedback(`BID FAILED: You only have £${(currentClub.transferBudget / 1000000).toFixed(1)}M in your transfer war chest.`);
      return;
    }

    // Valuation check
    const minAcceptable = Math.round(targetPlayer.player.value * 0.9);
    if (offerFee < minAcceptable) {
      setFeedback(`BID REJECTED: ${targetPlayer.club?.name} deemed £${(offerFee / 1000000).toFixed(1)}M derisory. They require at least £${(targetPlayer.player.value / 1000000).toFixed(1)}M.`);
      return;
    }

    sounds.playGavel();
    setFeedback(`BID ACCEPTED: ${targetPlayer.club?.name} has accepted your £${(offerFee / 1000000).toFixed(1)}M proposal. Now agree personal terms with the player.`);
    setNegotiationStep('TERMS');
  };

  // Submit Personal Terms to Player
  const handlePersonalTerms = () => {
    if (!targetPlayer) return;
    sounds.playClick();

    if (currentWages + offerWage > currentClub.wageBudget) {
      setFeedback(`TERMS FAILED: Offering £${(offerWage / 1000).toFixed(0)}k/week breaches your weekly wage ceiling of £${(currentClub.wageBudget / 1000).toFixed(0)}k.`);
      return;
    }

    if (offerWage < targetPlayer.player.wage * 0.85) {
      setFeedback(`TERMS REJECTED: ${targetPlayer.player.name}'s agent demands at least £${(targetPlayer.player.wage / 1000).toFixed(0)}k/week to consider a move.`);
      return;
    }

    // Advance to Boardroom / Owner Approval
    setNegotiationStep('OWNER_CHECK');
  };

  // Final Owner Approval & Coach Friction Check
  const handleFinalizeSigning = () => {
    if (!targetPlayer) return;
    sounds.playSigningStamp();

    // Check Owner Veto Criteria
    let ownerVeto = false;
    let vetoReason = '';

    if (owner.recruitmentPhilosophy === 'youth_development' && targetPlayer.player.age >= 30) {
      if (owner.involvement === 'micromanager') {
        ownerVeto = true;
        vetoReason = `OWNER VETO: Chairman ${owner.name} has blocked the deal! "Our philosophy strictly prohibits signing players over 29 years old. We are an academy and youth resale institution."`;
      }
    }

    if (owner.wealth === 'frugal' && offerFee > currentClub.transferBudget * 0.6) {
      ownerVeto = true;
      vetoReason = `BOARD VETO: The financial committee vetoed the fee! Spending 60%+ of the transfer war chest on one individual violates board risk metrics.`;
    }

    if (ownerVeto) {
      sounds.playCrisis();
      setFeedback(vetoReason);
      return;
    }

    // Check Manager Friction: Did director override manager?
    let updatedManager = manager ? { ...manager } : undefined;
    if (manager && delegation.transferSignings === 'manager') {
      updatedManager!.trustInDirector = Math.max(0, updatedManager!.trustInDirector - 20);
    }

    // Construct newly signed player
    const signedPlayer: Player = {
      ...targetPlayer.player,
      id: `signed_${Date.now()}_${targetPlayer.player.id}`,
      clubId: currentClub.id,
      wage: offerWage,
      contractYears: offerYears,
      happiness: 85,
      morale: 'ecstatic',
    };

    const updatedCurrentClub: Club = {
      ...currentClub,
      transferBudget: currentClub.transferBudget - offerFee,
      balance: currentClub.balance - offerFee,
      squad: [signedPlayer, ...currentClub.squad],
    };

    let updatedSellingClub: Club | null = null;
    if (targetPlayer.club) {
      updatedSellingClub = {
        ...targetPlayer.club,
        transferBudget: targetPlayer.club.transferBudget + offerFee,
        balance: targetPlayer.club.balance + offerFee,
        squad: targetPlayer.club.squad.filter(p => p.id !== targetPlayer.player.id),
      };
    }

    const updatedDirector: Director = {
      ...director,
      netSpend: director.netSpend + offerFee,
      reputation: Math.min(100, director.reputation + (signedPlayer.overall > 82 ? 3 : 1)),
      boardTrust: Math.min(100, director.boardTrust + 2),
    };

    const updatedOwner: Owner = {
      ...owner,
      approval: Math.min(100, owner.approval + 2),
    };

    onCompleteTransfer(
      signedPlayer,
      offerFee,
      updatedCurrentClub,
      updatedSellingClub,
      updatedDirector,
      updatedOwner,
      updatedManager
    );

    setNegotiationStep('SUCCESS');
    sounds.playFanfare();
  };

  return (
    <div className="space-y-6">
      
      {/* Header & Financial War Chest Overview */}
      <div className="bg-[#111827] border border-white/10 rounded-2xl p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold text-amber-400 uppercase tracking-wider mb-1">
              <DollarSign className="w-4 h-4" />
              <span>Global Scouting & Transfer Market</span>
            </div>
            <h1 className="text-2xl lg:text-3xl font-extrabold text-white tracking-tight">
              Transfer Market & Negotiations
            </h1>
            <p className="text-slate-400 text-xs mt-1">
              Scout across the Premier League, Championship, League One, and Free Agents. Filter and sort by age, rating, potential, value, and wage.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="px-4 py-2 bg-slate-900 border border-white/10 rounded-xl text-right">
              <span className="text-[10px] text-slate-400 uppercase block">War Chest</span>
              <span className="text-lg font-bold font-mono text-amber-400 tabular-nums">
                £{(currentClub.transferBudget / 1000000).toFixed(2)}M
              </span>
            </div>
            <div className="px-4 py-2 bg-slate-900 border border-white/10 rounded-xl text-right">
              <span className="text-[10px] text-slate-400 uppercase block">Wage Space</span>
              <span className="text-lg font-bold font-mono text-emerald-400 tabular-nums">
                £{(wageSpaceRemaining / 1000).toFixed(0)}k/wk
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

      {/* Filter and Search Controls Card */}
      <div className="bg-[#111827] border border-white/10 rounded-xl p-4 space-y-4">
        
        {/* Top Controls Row: Search + Quick Selects + Sort + Toggle Filters */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
          
          {/* Search Input (4 cols) */}
          <div className="relative md:col-span-4 w-full">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
            <input
              type="text"
              placeholder="Search by player, club, or role..."
              value={searchQuery}
              onChange={e => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full pl-9 pr-3.5 py-2 bg-slate-900/90 border border-white/10 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-400"
            />
          </div>

          {/* Division / Tier Filter (2 cols) */}
          <div className="md:col-span-2">
            <select
              value={filterTier}
              onChange={e => {
                const val = e.target.value;
                setFilterTier(val === 'all' ? 'all' : val === 'FA' ? 'FA' : Number(val));
                setCurrentPage(1);
              }}
              className="w-full px-3 py-2 bg-slate-900 border border-white/10 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-amber-400"
            >
              <option value="all">All Divisions</option>
              <option value="1">Premier League</option>
              <option value="2">Championship</option>
              <option value="3">League One</option>
              <option value="FA">Free Agents</option>
            </select>
          </div>

          {/* Position Filter (2 cols) */}
          <div className="md:col-span-2">
            <select
              value={filterPos}
              onChange={e => {
                setFilterPos(e.target.value as PlayerPosition | 'ALL');
                setCurrentPage(1);
              }}
              className="w-full px-3 py-2 bg-slate-900 border border-white/10 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-amber-400"
            >
              <option value="ALL">All Positions</option>
              <option value="GK">Goalkeepers (GK)</option>
              <option value="DEF">Defenders (DEF)</option>
              <option value="MID">Midfielders (MID)</option>
              <option value="FWD">Forwards (FWD)</option>
            </select>
          </div>

          {/* Quick Sort Select (2 cols) */}
          <div className="md:col-span-2">
            <select
              value={`${sortField}_${sortDirection}`}
              onChange={e => {
                const [f, d] = e.target.value.split('_');
                setSortField(f as SortField);
                setSortDirection(d as SortDirection);
                setCurrentPage(1);
              }}
              className="w-full px-3 py-2 bg-slate-900 border border-amber-400/30 rounded-lg text-xs text-amber-300 font-semibold focus:outline-none focus:border-amber-400"
            >
              <option value="overall_desc">OVR: High to Low</option>
              <option value="overall_asc">OVR: Low to High</option>
              <option value="age_asc">Age: Youngest First</option>
              <option value="age_desc">Age: Oldest First</option>
              <option value="growthMomentum_desc">Momentum: Best Potential</option>
              <option value="growthMomentum_asc">Momentum: Cooling First</option>
              <option value="value_desc">Valuation: Highest First</option>
              <option value="value_asc">Valuation: Bargains First</option>
              <option value="wage_desc">Wage: Highest First</option>
              <option value="wage_asc">Wage: Lowest First</option>
              <option value="name_asc">Name: A to Z</option>
            </select>
          </div>

          {/* Filters Toggle Button & Clear (2 cols) */}
          <div className="md:col-span-2 flex items-center gap-2">
            <button
              onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
              className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
                showAdvancedFilters || activeFiltersCount > 0
                  ? 'bg-amber-400/15 border-amber-400/40 text-amber-300'
                  : 'bg-slate-900 border-white/10 text-slate-300 hover:text-white'
              }`}
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span>Filters</span>
              {activeFiltersCount > 0 && (
                <span className="w-4 h-4 rounded-full bg-amber-400 text-slate-950 font-bold text-[10px] flex items-center justify-center">
                  {activeFiltersCount}
                </span>
              )}
            </button>

            {activeFiltersCount > 0 && (
              <button
                onClick={handleResetFilters}
                title="Reset all filters"
                className="p-2 bg-slate-900 hover:bg-slate-800 border border-white/10 text-slate-400 hover:text-white rounded-lg transition-colors cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

        </div>

        {/* Expandable Advanced Filters Drawer */}
        {showAdvancedFilters && (
          <div className="pt-3 border-t border-white/10 grid grid-cols-1 md:grid-cols-4 gap-4 animate-in fade-in slide-in-from-top-2 duration-150">
            
            {/* Age Range Filter */}
            <div className="bg-slate-900/60 p-3 rounded-lg border border-white/5 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-300 font-semibold">Age Range</span>
                <span className="font-mono text-amber-400 font-bold">{minAge} – {maxAge} yrs</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] text-slate-400 block mb-0.5">Min Age</label>
                  <input
                    type="number"
                    min={15}
                    max={maxAge}
                    value={minAge}
                    onChange={e => {
                      setMinAge(Math.max(15, Math.min(Number(e.target.value), maxAge)));
                      setCurrentPage(1);
                    }}
                    className="w-full px-2 py-1 bg-slate-950 border border-white/10 rounded text-xs text-white font-mono"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-slate-400 block mb-0.5">Max Age</label>
                  <input
                    type="number"
                    min={minAge}
                    max={42}
                    value={maxAge}
                    onChange={e => {
                      setMaxAge(Math.min(42, Math.max(Number(e.target.value), minAge)));
                      setCurrentPage(1);
                    }}
                    className="w-full px-2 py-1 bg-slate-950 border border-white/10 rounded text-xs text-white font-mono"
                  />
                </div>
              </div>
              <div className="flex gap-1 pt-1">
                <button
                  type="button"
                  onClick={() => { setMinAge(16); setMaxAge(21); setCurrentPage(1); }}
                  className="px-2 py-0.5 text-[10px] bg-slate-800 hover:bg-slate-700 text-slate-300 rounded"
                >
                  U-21
                </button>
                <button
                  type="button"
                  onClick={() => { setMinAge(22); setMaxAge(28); setCurrentPage(1); }}
                  className="px-2 py-0.5 text-[10px] bg-slate-800 hover:bg-slate-700 text-slate-300 rounded"
                >
                  Prime (22-28)
                </button>
                <button
                  type="button"
                  onClick={() => { setMinAge(29); setMaxAge(40); setCurrentPage(1); }}
                  className="px-2 py-0.5 text-[10px] bg-slate-800 hover:bg-slate-700 text-slate-300 rounded"
                >
                  29+ Veteran
                </button>
              </div>
            </div>

            {/* Rating / OVR Range Filter */}
            <div className="bg-slate-900/60 p-3 rounded-lg border border-white/5 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-300 font-semibold">Overall Rating (OVR)</span>
                <span className="font-mono text-amber-400 font-bold">{minOvr} – {maxOvr}</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] text-slate-400 block mb-0.5">Min OVR</label>
                  <input
                    type="number"
                    min={40}
                    max={maxOvr}
                    value={minOvr}
                    onChange={e => {
                      setMinOvr(Math.max(40, Math.min(Number(e.target.value), maxOvr)));
                      setCurrentPage(1);
                    }}
                    className="w-full px-2 py-1 bg-slate-950 border border-white/10 rounded text-xs text-white font-mono"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-slate-400 block mb-0.5">Max OVR</label>
                  <input
                    type="number"
                    min={minOvr}
                    max={99}
                    value={maxOvr}
                    onChange={e => {
                      setMaxOvr(Math.min(99, Math.max(Number(e.target.value), minOvr)));
                      setCurrentPage(1);
                    }}
                    className="w-full px-2 py-1 bg-slate-950 border border-white/10 rounded text-xs text-white font-mono"
                  />
                </div>
              </div>
              <div className="flex gap-1 pt-1">
                <button
                  type="button"
                  onClick={() => { setMinOvr(70); setMaxOvr(99); setCurrentPage(1); }}
                  className="px-2 py-0.5 text-[10px] bg-slate-800 hover:bg-slate-700 text-slate-300 rounded"
                >
                  70+ OVR
                </button>
                <button
                  type="button"
                  onClick={() => { setMinOvr(75); setMaxOvr(99); setCurrentPage(1); }}
                  className="px-2 py-0.5 text-[10px] bg-slate-800 hover:bg-slate-700 text-slate-300 rounded"
                >
                  75+ OVR
                </button>
                <button
                  type="button"
                  onClick={() => { setMinOvr(80); setMaxOvr(99); setCurrentPage(1); }}
                  className="px-2 py-0.5 text-[10px] bg-slate-800 hover:bg-slate-700 text-slate-300 rounded"
                >
                  80+ Stars
                </button>
              </div>
            </div>

            {/* Growth Momentum Filter */}
            <div className="bg-slate-900/60 p-3 rounded-lg border border-white/5 space-y-2">
              <span className="text-slate-300 font-semibold text-xs block">Growth Momentum</span>
              <select
                value={filterMomentum}
                onChange={e => {
                  setFilterMomentum(e.target.value as GrowthMomentum | 'ALL');
                  setCurrentPage(1);
                }}
                className="w-full px-2.5 py-1.5 bg-slate-950 border border-white/10 rounded text-xs text-slate-200 focus:outline-none focus:border-amber-400"
              >
                <option value="ALL">All Momentums</option>
                <option value="breakout">🚀 Breakout Prodigy</option>
                <option value="rapid">📈 Rapid Climber</option>
                <option value="prime">⭐ Peak Prime</option>
                <option value="steady">⚖️ Steady Growth</option>
                <option value="cooling">📉 Cooling Down</option>
              </select>
              <p className="text-[10px] text-slate-500">
                Filter by trajectory to target high-resale prospects or battle-tested stars.
              </p>
            </div>

            {/* Affordability Quick Toggles */}
            <div className="bg-slate-900/60 p-3 rounded-lg border border-white/5 space-y-2">
              <span className="text-slate-300 font-semibold text-xs block">Budget Feasibility</span>
              <div className="space-y-1.5 pt-0.5">
                <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer select-none hover:text-white">
                  <input
                    type="checkbox"
                    checked={onlyAffordableFee}
                    onChange={e => {
                      setOnlyAffordableFee(e.target.checked);
                      setCurrentPage(1);
                    }}
                    className="w-3.5 h-3.5 rounded bg-slate-950 border-white/20 text-amber-400 focus:ring-0 focus:ring-offset-0 cursor-pointer"
                  />
                  <span>Within War Chest (£{(currentClub.transferBudget / 1000000).toFixed(1)}M)</span>
                </label>
                <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer select-none hover:text-white">
                  <input
                    type="checkbox"
                    checked={onlyAffordableWage}
                    onChange={e => {
                      setOnlyAffordableWage(e.target.checked);
                      setCurrentPage(1);
                    }}
                    className="w-3.5 h-3.5 rounded bg-slate-950 border-white/20 text-emerald-400 focus:ring-0 focus:ring-offset-0 cursor-pointer"
                  />
                  <span>Within Wage Space (£{(wageSpaceRemaining / 1000).toFixed(0)}k/wk)</span>
                </label>
              </div>
            </div>

          </div>
        )}

        {/* Results Counter & Active Filter Pills */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-xs">
          <div className="flex items-center gap-2 text-slate-400">
            <span>
              Found <strong className="text-white font-mono">{totalItems}</strong> targets matching criteria
            </span>
            {totalItems > 0 && (
              <span className="text-slate-500 font-mono text-[11px]">
                (Showing {(validCurrentPage - 1) * pageSize + 1}–{Math.min(validCurrentPage * pageSize, totalItems)})
              </span>
            )}
          </div>

          {/* Quick Active Filter Pills */}
          <div className="flex flex-wrap items-center gap-1.5">
            {filterTier !== 'all' && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 text-[10px] border border-white/10">
                Tier: {filterTier === 'FA' ? 'Free Agents' : filterTier === 1 ? 'Premier League' : filterTier === 2 ? 'Championship' : 'League One'}
                <button onClick={() => { setFilterTier('all'); setCurrentPage(1); }} className="hover:text-white ml-0.5">×</button>
              </span>
            )}
            {filterPos !== 'ALL' && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 text-[10px] border border-white/10">
                Pos: {filterPos}
                <button onClick={() => { setFilterPos('ALL'); setCurrentPage(1); }} className="hover:text-white ml-0.5">×</button>
              </span>
            )}
            {(minAge > 16 || maxAge < 40) && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 text-[10px] border border-white/10">
                Age: {minAge}–{maxAge}
                <button onClick={() => { setMinAge(16); setMaxAge(40); setCurrentPage(1); }} className="hover:text-white ml-0.5">×</button>
              </span>
            )}
            {(minOvr > 40 || maxOvr < 99) && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 text-[10px] border border-white/10">
                OVR: {minOvr}–{maxOvr}
                <button onClick={() => { setMinOvr(40); setMaxOvr(99); setCurrentPage(1); }} className="hover:text-white ml-0.5">×</button>
              </span>
            )}
            {filterMomentum !== 'ALL' && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 text-[10px] border border-white/10 capitalize">
                Momentum: {filterMomentum}
                <button onClick={() => { setFilterMomentum('ALL'); setCurrentPage(1); }} className="hover:text-white ml-0.5">×</button>
              </span>
            )}
            {onlyAffordableFee && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-400/20 text-amber-300 text-[10px] border border-amber-400/30">
                Fee Affordable
                <button onClick={() => { setOnlyAffordableFee(false); setCurrentPage(1); }} className="hover:text-white ml-0.5">×</button>
              </span>
            )}
            {onlyAffordableWage && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-400/20 text-emerald-300 text-[10px] border border-emerald-400/30">
                Wage Affordable
                <button onClick={() => { setOnlyAffordableWage(false); setCurrentPage(1); }} className="hover:text-white ml-0.5">×</button>
              </span>
            )}
          </div>
        </div>

      </div>

      {/* Market Results Table with Clickable Sort Headers */}
      <div className="bg-[#111827] border border-white/10 rounded-xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead>
              <tr className="text-[10px] text-slate-400 border-b border-white/10 bg-slate-900/80 uppercase select-none">
                
                {/* Player / Club Header */}
                <th 
                  onClick={() => handleSortToggle('name')}
                  className="py-3 px-3 cursor-pointer hover:bg-white/5 transition-colors"
                >
                  <div className="flex items-center gap-1.5">
                    <span className={sortField === 'name' ? 'text-amber-400 font-bold' : ''}>Player / Club</span>
                    {sortField === 'name' ? (
                      sortDirection === 'asc' ? <ArrowUp className="w-3 h-3 text-amber-400" /> : <ArrowDown className="w-3 h-3 text-amber-400" />
                    ) : (
                      <ArrowUpDown className="w-3 h-3 opacity-30 hover:opacity-100" />
                    )}
                  </div>
                </th>

                {/* Position */}
                <th className="py-3 px-2 text-center">Pos</th>

                {/* Age Header (Sortable) */}
                <th 
                  onClick={() => handleSortToggle('age')}
                  className="py-3 px-2 text-center cursor-pointer hover:bg-white/5 transition-colors"
                >
                  <div className="flex items-center justify-center gap-1">
                    <span className={sortField === 'age' ? 'text-amber-400 font-bold' : ''}>Age</span>
                    {sortField === 'age' ? (
                      sortDirection === 'asc' ? <ArrowUp className="w-3 h-3 text-amber-400" /> : <ArrowDown className="w-3 h-3 text-amber-400" />
                    ) : (
                      <ArrowUpDown className="w-3 h-3 opacity-30 hover:opacity-100" />
                    )}
                  </div>
                </th>

                {/* OVR Rating Header (Sortable) */}
                <th 
                  onClick={() => handleSortToggle('overall')}
                  className="py-3 px-2 text-center cursor-pointer hover:bg-white/5 transition-colors"
                >
                  <div className="flex items-center justify-center gap-1">
                    <span className={sortField === 'overall' ? 'text-amber-400 font-bold' : ''}>OVR / 99</span>
                    {sortField === 'overall' ? (
                      sortDirection === 'asc' ? <ArrowUp className="w-3 h-3 text-amber-400" /> : <ArrowDown className="w-3 h-3 text-amber-400" />
                    ) : (
                      <ArrowUpDown className="w-3 h-3 opacity-30 hover:opacity-100" />
                    )}
                  </div>
                </th>

                {/* Growth Momentum Header (Sortable) */}
                <th 
                  onClick={() => handleSortToggle('growthMomentum')}
                  className="py-3 px-2 text-center cursor-pointer hover:bg-white/5 transition-colors"
                >
                  <div className="flex items-center justify-center gap-1">
                    <span className={sortField === 'growthMomentum' ? 'text-amber-400 font-bold' : ''}>Momentum</span>
                    {sortField === 'growthMomentum' ? (
                      sortDirection === 'asc' ? <ArrowUp className="w-3 h-3 text-amber-400" /> : <ArrowDown className="w-3 h-3 text-amber-400" />
                    ) : (
                      <ArrowUpDown className="w-3 h-3 opacity-30 hover:opacity-100" />
                    )}
                  </div>
                </th>

                {/* Valuation Header (Sortable) */}
                <th 
                  onClick={() => handleSortToggle('value')}
                  className="py-3 px-3 text-right cursor-pointer hover:bg-white/5 transition-colors"
                >
                  <div className="flex items-center justify-end gap-1">
                    <span className={sortField === 'value' ? 'text-amber-400 font-bold' : ''}>Valuation</span>
                    {sortField === 'value' ? (
                      sortDirection === 'asc' ? <ArrowUp className="w-3 h-3 text-amber-400" /> : <ArrowDown className="w-3 h-3 text-amber-400" />
                    ) : (
                      <ArrowUpDown className="w-3 h-3 opacity-30 hover:opacity-100" />
                    )}
                  </div>
                </th>

                {/* Wage Header (Sortable) */}
                <th 
                  onClick={() => handleSortToggle('wage')}
                  className="py-3 px-3 text-right cursor-pointer hover:bg-white/5 transition-colors"
                >
                  <div className="flex items-center justify-end gap-1">
                    <span className={sortField === 'wage' ? 'text-amber-400 font-bold' : ''}>Current Wage</span>
                    {sortField === 'wage' ? (
                      sortDirection === 'asc' ? <ArrowUp className="w-3 h-3 text-amber-400" /> : <ArrowDown className="w-3 h-3 text-amber-400" />
                    ) : (
                      <ArrowUpDown className="w-3 h-3 opacity-30 hover:opacity-100" />
                    )}
                  </div>
                </th>

                <th className="py-3 px-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 font-sans">
              {paginatedList.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400">
                    <AlertTriangle className="w-8 h-8 text-amber-400/60 mx-auto mb-2" />
                    <p className="font-semibold text-white">No players found matching your criteria</p>
                    <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                      Try broadening your search term, adjusting age/rating limits, or clearing active filters.
                    </p>
                    <button
                      onClick={handleResetFilters}
                      className="mt-3 px-3 py-1.5 bg-amber-400/10 hover:bg-amber-400/20 border border-amber-400/30 text-amber-300 text-xs font-semibold rounded-lg transition-colors cursor-pointer"
                    >
                      Reset All Filters
                    </button>
                  </td>
                </tr>
              ) : (
                paginatedList.map(({ player, club }) => {
                  const isAffordableFee = club ? player.value * 0.9 <= currentClub.transferBudget : true;
                  const isAffordableWage = player.wage * 0.85 <= wageSpaceRemaining;

                  return (
                    <tr key={player.id} className="hover:bg-white/5 transition-colors group">
                      {/* Name & Club */}
                      <td className="py-3 px-3">
                        <div className="flex items-center gap-2">
                          <div 
                            className="w-2.5 h-2.5 rounded-full shrink-0 shadow-sm"
                            style={{ backgroundColor: club?.primaryColor || '#64748b' }}
                            title={club ? club.name : 'Free Agent'}
                          />
                          <div>
                            <span className="font-bold text-white block group-hover:text-amber-300 transition-colors">
                              {player.name}
                            </span>
                            <span className="text-[10px] text-slate-400 font-mono">
                              {club ? club.name : 'Free Agent'} · {player.roleDetail}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Position */}
                      <td className="py-3 px-2 text-center font-mono">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                          player.position === 'FWD' ? 'bg-rose-500/15 text-rose-300 border border-rose-500/30' :
                          player.position === 'MID' ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30' :
                          player.position === 'DEF' ? 'bg-blue-500/15 text-blue-300 border border-blue-500/30' :
                          'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                        }`}>
                          {player.position}
                        </span>
                      </td>

                      {/* Age */}
                      <td className="py-3 px-2 text-center font-mono text-slate-300 tabular-nums">
                        {player.age}
                      </td>

                      {/* OVR Rating */}
                      <td className="py-3 px-2 text-center font-mono font-bold tabular-nums text-sm">
                        <span className={`${
                          player.overall >= 85 ? 'text-amber-400 drop-shadow-[0_0_8px_rgba(251,191,36,0.5)]' :
                          player.overall >= 80 ? 'text-amber-300' :
                          player.overall >= 75 ? 'text-slate-100' :
                          'text-slate-400'
                        }`}>
                          {player.overall}
                        </span>
                      </td>

                      {/* Growth Momentum */}
                      <td className="py-3 px-2 text-center font-mono">
                        <span className={`text-[11px] font-semibold whitespace-nowrap ${
                          player.growthMomentum === 'breakout' ? 'text-emerald-400' :
                          player.growthMomentum === 'rapid' ? 'text-cyan-400' :
                          player.growthMomentum === 'prime' ? 'text-amber-400' :
                          player.growthMomentum === 'cooling' ? 'text-rose-400' :
                          'text-slate-400'
                        }`}>
                          {player.growthMomentum === 'breakout' ? '🚀 Breakout' :
                           player.growthMomentum === 'rapid' ? '📈 Rapid' :
                           player.growthMomentum === 'prime' ? '⭐ Prime' :
                           player.growthMomentum === 'cooling' ? '📉 Cooling' :
                           '⚖️ Steady'}
                        </span>
                      </td>

                      {/* Valuation */}
                      <td className="py-3 px-3 text-right font-mono font-medium tabular-nums">
                        <span className={club ? (isAffordableFee ? 'text-slate-200' : 'text-slate-500') : 'text-emerald-400 font-bold'}>
                          {club ? `£${(player.value / 1000000).toFixed(1)}M` : 'FREE'}
                        </span>
                      </td>

                      {/* Current Wage */}
                      <td className="py-3 px-3 text-right font-mono font-medium tabular-nums">
                        <span className={isAffordableWage ? 'text-emerald-400' : 'text-slate-500'}>
                          £{(player.wage / 1000).toFixed(0)}k/wk
                        </span>
                      </td>

                      {/* Approach Action Button */}
                      <td className="py-3 px-3 text-right">
                        <button
                          onClick={() => handleOpenNegotiate({ player, club })}
                          className="px-3 py-1.5 text-xs font-bold bg-amber-400/10 hover:bg-amber-400/20 border border-amber-400/30 text-amber-300 rounded-lg transition-all cursor-pointer whitespace-nowrap hover:scale-105"
                        >
                          Approach
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination & Page Controls */}
        {totalItems > 0 && (
          <div className="bg-slate-900/90 border-t border-white/10 px-4 py-3 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <span>Show</span>
              <select
                value={pageSize}
                onChange={e => {
                  setPageSize(Number(e.target.value));
                  setCurrentPage(1);
                }}
                className="px-2 py-1 bg-slate-950 border border-white/10 rounded text-xs text-slate-200 font-mono"
              >
                <option value={15}>15</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
              <span>per page</span>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                disabled={validCurrentPage <= 1}
                onClick={() => {
                  sounds.playClick();
                  setCurrentPage(p => Math.max(1, p - 1));
                }}
                className="p-1.5 bg-slate-950 hover:bg-slate-800 disabled:opacity-30 disabled:hover:bg-slate-950 border border-white/10 text-slate-300 rounded-lg transition-colors cursor-pointer disabled:cursor-not-allowed"
                title="Previous page"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              <span className="px-3 py-1 text-xs font-mono text-slate-300">
                Page <strong className="text-amber-400">{validCurrentPage}</strong> of {totalPages}
              </span>

              <button
                disabled={validCurrentPage >= totalPages}
                onClick={() => {
                  sounds.playClick();
                  setCurrentPage(p => Math.min(totalPages, p + 1));
                }}
                className="p-1.5 bg-slate-950 hover:bg-slate-800 disabled:opacity-30 disabled:hover:bg-slate-950 border border-white/10 text-slate-300 rounded-lg transition-colors cursor-pointer disabled:cursor-not-allowed"
                title="Next page"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Interactive Negotiation Modal */}
      {targetPlayer && (
        <div className="fixed inset-0 z-50 bg-[#070a0f]/85 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
          <div className="w-full max-w-lg bg-[#111827] border border-white/10 rounded-2xl p-6 shadow-2xl animate-in fade-in zoom-in-95">
            
            <div className="flex items-start justify-between border-b border-white/10 pb-3 mb-4">
              <div>
                <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wider block">
                  Transfer Negotiation Suite
                </span>
                <h3 className="text-xl font-extrabold text-white">
                  {targetPlayer.player.name}
                </h3>
                <span className="text-xs text-slate-400">
                  {targetPlayer.club ? targetPlayer.club.name : 'Free Agent'} · Overall {targetPlayer.player.overall} · Age {targetPlayer.player.age}
                </span>
              </div>
              <button 
                onClick={() => setTargetPlayer(null)}
                className="text-slate-400 hover:text-white p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Step Progress Indicators */}
            <div className="flex items-center justify-between text-xs font-semibold mb-6 border-b border-white/5 pb-3">
              <span className={negotiationStep === 'BID' ? 'text-amber-400 font-bold' : 'text-slate-500'}>
                1. Club Fee
              </span>
              <span>→</span>
              <span className={negotiationStep === 'TERMS' ? 'text-amber-400 font-bold' : 'text-slate-500'}>
                2. Player Terms
              </span>
              <span>→</span>
              <span className={negotiationStep === 'OWNER_CHECK' ? 'text-amber-400 font-bold' : 'text-slate-500'}>
                3. Owner Sign-Off
              </span>
            </div>

            {/* Step 1: Club Bid */}
            {negotiationStep === 'BID' && (
              <div className="space-y-4">
                <div className="bg-slate-900/80 border border-white/5 rounded-xl p-3.5 text-xs text-slate-300">
                  <span className="text-slate-400 block mb-1">Selling Club Valuation:</span>
                  <span className="text-base font-bold font-mono text-white">
                    £{(targetPlayer.player.value / 1000000).toFixed(2)}M
                  </span>
                  <span className="text-[11px] text-slate-500 block mt-1">
                    Your remaining transfer war chest: £{(currentClub.transferBudget / 1000000).toFixed(2)}M
                  </span>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Submit Formal Transfer Bid (£)
                  </label>
                  <input
                    type="number"
                    min={100000}
                    step={250000}
                    value={offerFee}
                    onChange={e => setOfferFee(Number(e.target.value))}
                    className="w-full px-3.5 py-2.5 bg-slate-900 border border-white/10 rounded-lg text-white font-mono text-sm focus:outline-none focus:border-amber-400"
                  />
                </div>

                <div className="flex justify-end pt-2">
                  <button
                    onClick={handleClubBid}
                    className="px-6 py-2.5 bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-slate-950 font-bold text-xs rounded-xl shadow-md transition-all cursor-pointer"
                  >
                    Submit Bid to {targetPlayer.club?.shortName}
                  </button>
                </div>
              </div>
            )}

            {/* Step 2: Personal Terms */}
            {negotiationStep === 'TERMS' && (
              <div className="space-y-4">
                <div className="bg-slate-900/80 border border-white/5 rounded-xl p-3.5 text-xs text-slate-300">
                  <span className="text-slate-400 block mb-1">Agent Expectations:</span>
                  <span className="text-sm font-bold font-mono text-emerald-400">
                    £{(targetPlayer.player.wage / 1000).toFixed(0)}k/week base salary
                  </span>
                  <span className="text-[11px] text-slate-500 block mt-1">
                    Your wage space remaining: £{(wageSpaceRemaining / 1000).toFixed(0)}k/wk
                  </span>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Offered Weekly Wage (£/week)
                  </label>
                  <input
                    type="number"
                    min={1000}
                    step={1000}
                    value={offerWage}
                    onChange={e => setOfferWage(Number(e.target.value))}
                    className="w-full px-3.5 py-2.5 bg-slate-900 border border-white/10 rounded-lg text-white font-mono text-sm focus:outline-none focus:border-amber-400"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Contract Length (Years)
                  </label>
                  <div className="grid grid-cols-4 gap-2">
                    {[1, 2, 3, 5].map(yrs => (
                      <button
                        key={yrs}
                        type="button"
                        onClick={() => setOfferYears(yrs)}
                        className={`py-2 text-xs font-mono font-bold rounded-lg border ${
                          offerYears === yrs
                            ? 'bg-amber-400 text-slate-950 border-amber-400'
                            : 'bg-slate-900 border-white/10 text-slate-400 hover:text-white'
                        }`}
                      >
                        {yrs} Yrs
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex justify-end pt-2">
                  <button
                    onClick={handlePersonalTerms}
                    className="px-6 py-2.5 bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-slate-950 font-bold text-xs rounded-xl shadow-md transition-all cursor-pointer"
                  >
                    Agree Personal Terms
                  </button>
                </div>
              </div>
            )}

            {/* Step 3: Owner Approval Check */}
            {negotiationStep === 'OWNER_CHECK' && (
              <div className="space-y-4">
                <div className="bg-slate-900/90 border border-white/10 rounded-xl p-4 text-xs space-y-2">
                  <div className="flex items-center justify-between border-b border-white/5 pb-2">
                    <span className="text-slate-400">Majority Owner:</span>
                    <span className="font-bold text-white">{owner.name}</span>
                  </div>
                  <div className="flex items-center justify-between border-b border-white/5 pb-2">
                    <span className="text-slate-400">Recruitment Philosophy:</span>
                    <span className="font-bold text-amber-400 capitalize">{owner.recruitmentPhilosophy.replace('_', ' ')}</span>
                  </div>
                  <div className="flex items-center justify-between border-b border-white/5 pb-2">
                    <span className="text-slate-400">Agreed Fee:</span>
                    <span className="font-mono font-bold text-white">£{(offerFee / 1000000).toFixed(2)}M</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Agreed Wage:</span>
                    <span className="font-mono font-bold text-emerald-400">£{(offerWage / 1000).toFixed(0)}k/wk ({offerYears} yrs)</span>
                  </div>
                </div>

                {owner.recruitmentPhilosophy === 'youth_development' && targetPlayer.player.age >= 30 && (
                  <div className="p-3 bg-amber-950/20 border border-amber-500/30 rounded-xl text-xs text-amber-300 flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                    <span>
                      Caution: {owner.name} demanded a <strong>Youth Development</strong> philosophy. Signing a {targetPlayer.player.age}-year-old player may risk an owner reprimand or veto!
                    </span>
                  </div>
                )}

                <div className="flex items-center justify-end gap-3 pt-2">
                  <button
                    onClick={() => setNegotiationStep('TERMS')}
                    className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white"
                  >
                    Back
                  </button>
                  <button
                    onClick={handleFinalizeSigning}
                    className="px-6 py-2.5 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-white font-extrabold text-xs rounded-xl shadow-lg shadow-emerald-500/20 transition-all cursor-pointer"
                  >
                    Sanction Transfer & Sign Contract
                  </button>
                </div>
              </div>
            )}

            {/* Success Celebration */}
            {negotiationStep === 'SUCCESS' && (
              <div className="text-center py-6 space-y-4">
                <CheckCircle className="w-12 h-12 text-emerald-400 mx-auto" />
                <h4 className="text-lg font-bold text-white">Deal Completed!</h4>
                <p className="text-xs text-slate-300 max-w-sm mx-auto">
                  {targetPlayer.player.name} is now officially registered in the {currentClub.name} first-team squad.
                </p>
                <button
                  onClick={() => setTargetPlayer(null)}
                  className="px-6 py-2.5 bg-white/10 hover:bg-white/20 text-white font-bold text-xs rounded-xl transition-all cursor-pointer"
                >
                  Return to Transfer Hub
                </button>
              </div>
            )}

          </div>
        </div>
      )}

    </div>
  );
};
