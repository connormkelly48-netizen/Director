/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { Club, Player, PlayerPosition, POSITION_ORDER, IncomingBid, Manager, DelegationMatrix, Lineup, SlotRole } from '../types/game';
import { Trash2, Tag, Send, Filter, ArrowUp, ArrowDown, ChevronDown, ChevronUp, RotateCcw, Coins, AlertTriangle, Check, Info } from 'lucide-react';
import { sounds } from '../services/soundEffects';
import { Modal } from './ui/Modal';
import { getTransferOffers, evaluateDirectorSaleDelegation, GeneratedTransferOffer, DelegationDecisionCheck } from '../services/transferService';
import { autoPickLineup, getDefaultFormation, sanitizeLineup } from '../utils/lineup';
import { FORMATIONS } from '../data/formations';
import { PitchView } from './squad/PitchView';
import { PlayerSheet } from './squad/PlayerSheet';

const VIEW_MODE_STORAGE_KEY = 'boardroom_squad_view_mode';

interface SquadViewProps {
  club: Club;
  allClubs?: Club[];
  manager?: Manager;
  delegation?: DelegationMatrix;
  onUpdateSquad: (updatedSquad: Player[], updatedClub: Club) => void;
  onUpdateLineup?: (clubId: string, lineup: Lineup) => void;
  onSellPlayer?: (player: Player, buyingClub: Club, fee: number, wage: number, trustDelta?: number) => void;
  onReleasePlayer?: (player: Player, severance: number) => void;
  onOfferPlayerToClubs?: (playerId: string, askingPrice: number) => IncomingBid[];
}

interface SquadItemProps {
  player: Player;
  onInspect: (player: Player) => void;
  onOffer: (player: Player) => void;
  onSell: (player: Player) => void;
  onRenew: (player: Player) => void;
  onRelease: (player: Player) => void;
}

interface SquadMobileCardProps extends SquadItemProps {
  isExpanded: boolean;
  onToggleExpand: (playerId: string) => void;
}

const POSITION_FILTERS: readonly (PlayerPosition | 'ALL')[] = [
  'ALL',
  ...(['GK', 'DEF', 'MID', 'FWD'] as PlayerPosition[]).sort((a, b) => POSITION_ORDER[a] - POSITION_ORDER[b]),
];

const getMomentumLabel = (momentum: Player['growthMomentum']) => {
  switch (momentum) {
    case 'breakout': return '🚀 Breakout';
    case 'rapid': return '📈 Rapid';
    case 'prime': return '⭐ Prime';
    case 'cooling': return '📉 Cooling';
    default: return '⚖️ Steady';
  }
};

const getMomentumColorClass = (momentum: Player['growthMomentum']) => {
  switch (momentum) {
    case 'breakout': return 'text-emerald-400';
    case 'rapid': return 'text-cyan-400';
    case 'prime': return 'text-amber-400';
    case 'cooling': return 'text-rose-400';
    default: return 'text-slate-300';
  }
};

const SquadMobileCard = React.memo<SquadMobileCardProps>(({
  player,
  isExpanded,
  onToggleExpand,
  onInspect,
  onOffer,
  onSell,
  onRenew,
  onRelease,
}) => (
  <div className="bg-[#111827] border border-white/10 rounded-xl overflow-hidden">
    <button
      type="button"
      aria-expanded={isExpanded}
      onClick={() => onToggleExpand(player.id)}
      className="w-full p-4 text-left cursor-pointer active:scale-[0.99] transition-transform"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5 min-w-0">
          <span
            className={`w-2.5 h-2.5 rounded-full shrink-0 mt-1.5 ${
              player.age <= 22 ? 'bg-amber-400' : player.age >= 31 ? 'bg-slate-500' : 'bg-emerald-400'
            }`}
          />
          <div className="min-w-0">
            <span className="font-bold text-base text-white block truncate">{player.name}</span>
            <span className="text-xs text-slate-400 font-mono block truncate">
              {player.roleDetail} · {player.contractYears} yrs
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span className="px-2 py-0.5 rounded text-xs bg-slate-800 text-slate-200 font-bold font-mono">
            {player.position}
          </span>
          <span className="font-mono font-extrabold text-amber-400 text-lg tabular-nums">
            {player.overall}
          </span>
          {isExpanded ? (
            <ChevronUp className="w-4 h-4 text-slate-400" />
          ) : (
            <ChevronDown className="w-4 h-4 text-slate-400" />
          )}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-white/5 text-xs font-mono">
        <div>
          <span className="text-slate-400 block">Age</span>
          <span className="font-bold text-slate-200 tabular-nums">{player.age}</span>
        </div>
        <div>
          <span className="text-slate-400 block">Value</span>
          <span className="font-bold text-slate-200 tabular-nums">
            £{(player.value / 1000000).toFixed(1)}M
          </span>
        </div>
        <div className="text-right">
          <span className="text-slate-400 block">Wage</span>
          <span className="font-bold text-emerald-400 tabular-nums">
            £{(player.wage / 1000).toFixed(0)}k/wk
          </span>
        </div>
      </div>
    </button>

    {isExpanded && (
      <div className="px-4 pb-3 pt-2 border-t border-white/5 bg-slate-900/40 grid grid-cols-2 gap-3 text-xs font-mono">
        <div>
          <span className="text-slate-400 block">Momentum</span>
          <span className={`font-semibold ${getMomentumColorClass(player.growthMomentum)}`}>
            {getMomentumLabel(player.growthMomentum)}
          </span>
        </div>
        <div>
          <span className="text-slate-400 block">Form</span>
          <span className="font-bold text-slate-200 tabular-nums">{player.form.toFixed(1)}</span>
        </div>
        <div>
          <span className="text-slate-400 block">G / A</span>
          <span className="font-bold text-slate-200 tabular-nums">
            {player.goals} / {player.assists}
          </span>
        </div>
        <div>
          <span className="text-slate-400 block">Status & Morale</span>
          <span className={player.isInjured ? 'text-rose-400 font-bold' : 'text-emerald-400 font-semibold'}>
            {player.isInjured ? 'Injured' : 'Fit'} · {player.happiness}%
          </span>
        </div>
        <div className="col-span-2 pt-1">
          <button
            type="button"
            onClick={() => onInspect(player)}
            className="w-full min-h-11 px-3 py-2 text-xs font-bold bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-amber-300 flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <Info className="w-3.5 h-3.5" />
            <span>View Full Player Sheet</span>
          </button>
        </div>
      </div>
    )}

    <div className="px-4 py-3 bg-slate-900/60 border-t border-white/5 grid grid-cols-2 gap-2">
      <button
        type="button"
        onClick={() => onSell(player)}
        className="min-h-11 px-3 py-2 text-xs font-bold bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/35 text-emerald-300 rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5 active:scale-95"
      >
        <Coins className="w-3.5 h-3.5" />
        <span>Sell</span>
      </button>
      <button
        type="button"
        onClick={() => onOffer(player)}
        className="min-h-11 px-3 py-2 text-xs font-bold bg-amber-400/10 hover:bg-amber-400/20 border border-amber-400/30 text-amber-300 rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5 active:scale-95"
      >
        <Tag className="w-3.5 h-3.5" />
        <span>Offer</span>
      </button>
      <button
        type="button"
        onClick={() => onRenew(player)}
        className="min-h-11 px-3 py-2 text-xs font-bold bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-slate-200 hover:text-white transition-all cursor-pointer active:scale-95"
      >
        Renew
      </button>
      <button
        type="button"
        onClick={() => onRelease(player)}
        aria-label={`Release ${player.name}`}
        className="min-h-11 px-3 py-2 flex items-center justify-center gap-1.5 text-xs font-semibold text-rose-400 hover:text-rose-300 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 rounded-lg transition-all cursor-pointer active:scale-95"
      >
        <Trash2 className="w-3.5 h-3.5" />
        <span>Release</span>
      </button>
    </div>
  </div>
));
SquadMobileCard.displayName = 'SquadMobileCard';

const SquadTableRow = React.memo<SquadItemProps>(({
  player,
  onInspect,
  onOffer,
  onSell,
  onRenew,
  onRelease,
}) => (
  <tr
    onClick={() => onInspect(player)}
    className="group hover:bg-white/5 transition-colors cursor-pointer"
  >
    <td className="sticky left-0 z-10 bg-[#111827] group-hover:bg-[#192231] py-3 px-3 border-r border-white/5">
      <div className="flex items-center gap-2">
        <span className={`w-2 h-2 rounded-full shrink-0 ${
          player.age <= 22 ? 'bg-amber-400' : player.age >= 31 ? 'bg-slate-500' : 'bg-emerald-400'
        }`} />
        <div className="min-w-0">
          <span className="font-bold text-white block whitespace-nowrap">{player.name}</span>
          <span className="text-xs sm:text-[10px] text-slate-400 font-mono whitespace-nowrap">{player.roleDetail}</span>
        </div>
      </div>
    </td>
    <td className="py-3 px-2 text-center font-mono">
      <span className="px-1.5 py-0.5 rounded text-xs sm:text-[10px] bg-slate-800 text-slate-200 font-bold">
        {player.position}
      </span>
    </td>
    <td className="hidden lg:table-cell py-3 px-2 text-center font-mono text-slate-300 tabular-nums">
      {player.age}
    </td>
    <td className="py-3 px-2 text-center font-mono font-bold text-amber-400 tabular-nums text-sm">
      {player.overall}
    </td>
    <td className="hidden xl:table-cell py-3 px-2 text-center font-mono">
      <span className={`text-xs sm:text-[11px] font-semibold whitespace-nowrap ${getMomentumColorClass(player.growthMomentum)}`}>
        {getMomentumLabel(player.growthMomentum)}
      </span>
    </td>
    <td className="py-3 px-3 text-right font-mono font-medium text-slate-200 tabular-nums whitespace-nowrap">
      £{(player.value / 1000000).toFixed(1)}M
    </td>
    <td className="py-3 px-3 text-right font-mono font-medium text-emerald-400 tabular-nums whitespace-nowrap">
      £{(player.wage / 1000).toFixed(0)}k/wk
    </td>
    <td className="hidden lg:table-cell py-3 px-2 text-center font-mono text-slate-300 tabular-nums whitespace-nowrap">
      {player.contractYears} yrs
    </td>
    <td className="hidden lg:table-cell py-3 px-2 text-center font-mono font-bold text-slate-200 tabular-nums">
      {player.form.toFixed(1)}
    </td>
    <td className="hidden xl:table-cell py-3 px-2 text-center font-mono text-slate-300 tabular-nums whitespace-nowrap">
      {player.goals} / {player.assists}
    </td>
    <td className="py-3 px-3 text-right" onClick={e => e.stopPropagation()}>
      <div className="flex items-center justify-end gap-1.5">
        <button
          onClick={() => onSell(player)}
          title="Sell or Release Player"
          aria-label={`Sell ${player.name}`}
          className="px-2.5 py-1 min-h-11 lg:min-h-0 text-xs sm:text-[11px] font-semibold bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-300 rounded transition-all cursor-pointer flex items-center gap-1 active:scale-95"
        >
          <Coins className="w-3 h-3" />
          <span>Sell</span>
        </button>
        <button
          onClick={() => onOffer(player)}
          title="Offer to Rival Clubs / Transfer List"
          aria-label={`Offer ${player.name} to rival clubs`}
          className="px-2.5 py-1 min-h-11 lg:min-h-0 text-xs sm:text-[11px] font-semibold bg-amber-400/10 hover:bg-amber-400/20 border border-amber-400/30 text-amber-300 rounded transition-all cursor-pointer flex items-center gap-1 active:scale-95"
        >
          <Tag className="w-3 h-3" />
          <span>Offer</span>
        </button>
        <button
          onClick={() => onRenew(player)}
          className="px-2.5 py-1 min-h-11 lg:min-h-0 text-xs sm:text-[11px] font-semibold bg-white/5 hover:bg-white/10 border border-white/10 rounded text-slate-200 hover:text-white transition-all cursor-pointer active:scale-95"
        >
          Renew
        </button>
        <button
          onClick={() => onRelease(player)}
          title="Release Player"
          aria-label={`Release ${player.name}`}
          className="p-1.5 min-h-11 min-w-11 lg:min-h-0 lg:min-w-0 flex items-center justify-center text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 rounded transition-all cursor-pointer active:scale-95"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </td>
  </tr>
));
SquadTableRow.displayName = 'SquadTableRow';

export const SquadView: React.FC<SquadViewProps> = ({
  club,
  allClubs = [],
  manager,
  delegation,
  onUpdateSquad,
  onUpdateLineup,
  onSellPlayer,
  onReleasePlayer,
  onOfferPlayerToClubs,
}) => {
  const [viewMode, setViewMode] = useState<'pitch' | 'table'>(() => {
    try {
      const saved = localStorage.getItem(VIEW_MODE_STORAGE_KEY);
      return saved === 'table' ? 'table' : 'pitch';
    } catch {
      return 'pitch';
    }
  });
  const [selectedPos, setSelectedPos] = useState<PlayerPosition | 'ALL'>('ALL');
  const [sortField, setSortField] = useState<keyof Player>('overall');
  const [sortAsc, setSortAsc] = useState<boolean>(false);
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);
  const [inspectedPlayerId, setInspectedPlayerId] = useState<string | null>(null);
  const [renewWage, setRenewWage] = useState<number>(0);
  const [renewYears, setRenewYears] = useState<number>(3);
  const [offeringPlayer, setOfferingPlayer] = useState<Player | null>(null);
  const [askingPrice, setAskingPrice] = useState<number>(1000000);
  const [sellModalPlayer, setSellModalPlayer] = useState<Player | null>(null);
  const [pendingSaleConfirm, setPendingSaleConfirm] = useState<{
    offer: GeneratedTransferOffer;
    check: DelegationDecisionCheck;
  } | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [expandedPlayerId, setExpandedPlayerId] = useState<string | null>(null);
  const [showFilterSheet, setShowFilterSheet] = useState<boolean>(false);
  const [draftPos, setDraftPos] = useState<PlayerPosition | 'ALL'>('ALL');

  const activeFiltersCount = selectedPos === 'ALL' ? 0 : 1;

  const handleSetViewMode = (mode: 'pitch' | 'table') => {
    sounds.playClick();
    setViewMode(mode);
    try {
      localStorage.setItem(VIEW_MODE_STORAGE_KEY, mode);
    } catch {
      // Ignore storage errors
    }
  };

  const commitLineup = useCallback(
    (nextLineup: Lineup) => {
      if (onUpdateLineup) {
        onUpdateLineup(club.id, nextLineup);
      } else {
        onUpdateSquad(club.squad, { ...club, lineup: nextLineup });
      }
    },
    [club, onUpdateLineup, onUpdateSquad]
  );

  // Compute an always-valid lineup for rendering and sync back if missing/stale
  const resolvedLineup = useMemo<Lineup>(() => {
    if (!club.lineup) {
      return autoPickLineup(club, getDefaultFormation(manager), manager);
    }
    if (club.lineup.auto) {
      return autoPickLineup(club, club.lineup.formation, manager);
    }
    const healthyIds = new Set(club.squad.filter(p => !p.isInjured).map(p => p.id));
    const hasInvalidStarter =
      club.lineup.slots.length !== 11 ||
      club.lineup.slots.some(id => id !== null && !healthyIds.has(id));
    const hasInvalidBench = club.lineup.bench.some(id => !healthyIds.has(id));
    if (hasInvalidStarter || hasInvalidBench) {
      return sanitizeLineup(club, manager);
    }
    return club.lineup;
  }, [club, manager]);

  useEffect(() => {
    const current = club.lineup;
    const isSame =
      current &&
      current.formation === resolvedLineup.formation &&
      current.auto === resolvedLineup.auto &&
      current.slots.length === resolvedLineup.slots.length &&
      current.slots.every((v, i) => v === resolvedLineup.slots[i]) &&
      current.bench.length === resolvedLineup.bench.length &&
      current.bench.every((v, i) => v === resolvedLineup.bench[i]);

    if (!isSame) {
      commitLineup(resolvedLineup);
    }
  }, [club.lineup, resolvedLineup, commitLineup]);

  const currentWages = useMemo(() => club.squad.reduce((acc, p) => acc + p.wage, 0), [club.squad]);

  const positionCounts = useMemo(() => {
    const counts: Record<PlayerPosition | 'ALL', number> = {
      ALL: club.squad.length,
      GK: 0,
      DEF: 0,
      MID: 0,
      FWD: 0,
    };
    club.squad.forEach(p => {
      counts[p.position] = (counts[p.position] || 0) + 1;
    });
    return counts;
  }, [club.squad]);

  const filteredSquad = useMemo(() => {
    if (selectedPos === 'ALL') return club.squad;
    return club.squad.filter(p => p.position === selectedPos);
  }, [club.squad, selectedPos]);

  const sortedSquad = useMemo(() => {
    return [...filteredSquad].sort((a, b) => {
      if (sortField === 'position') {
        const posDiff = POSITION_ORDER[a.position] - POSITION_ORDER[b.position];
        if (posDiff !== 0) {
          return sortAsc ? posDiff : -posDiff;
        }
        if (b.overall !== a.overall) {
          return b.overall - a.overall;
        }
        return a.name.localeCompare(b.name);
      }
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
  }, [filteredSquad, sortField, sortAsc]);

  const toggleSort = (field: keyof Player) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(field === 'position' || field === 'name' || field === 'age');
    }
  };

  const renderSortArrow = (field: keyof Player) => {
    if (sortField !== field) return null;
    return sortAsc ? (
      <ArrowUp className="w-3 h-3 text-amber-400 shrink-0" />
    ) : (
      <ArrowDown className="w-3 h-3 text-amber-400 shrink-0" />
    );
  };

  const handleOpenFilterSheet = () => {
    sounds.playClick();
    setDraftPos(selectedPos);
    setShowFilterSheet(true);
  };

  const handleApplyFilterSheet = () => {
    sounds.playClick();
    setSelectedPos(draftPos);
    setShowFilterSheet(false);
  };

  const handleResetFilterSheet = () => {
    sounds.playClick();
    setDraftPos('ALL');
    setSelectedPos('ALL');
    setShowFilterSheet(false);
  };

  const handleToggleExpand = useCallback((playerId: string) => {
    sounds.playClick();
    setExpandedPlayerId(prev => (prev === playerId ? null : playerId));
  }, []);

  const handleOpenRenew = useCallback((p: Player) => {
    sounds.playClick();
    setSelectedPlayer(p);
    setRenewWage(Math.round(p.wage * 1.15));
    setRenewYears(Math.min(5, p.contractYears + 2));
  }, []);

  const handleConfirmRenew = () => {
    if (!selectedPlayer) return;
    sounds.playSigningStamp();

    const wageDiff = renewWage - selectedPlayer.wage;

    if (wageDiff > 0 && currentWages + wageDiff > club.wageBudget) {
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

  const handleReleasePlayer = useCallback((p: Player) => {
    sounds.playCrisis();
    const severance = p.wage * 26; // Half a year severance
    if (onReleasePlayer) {
      onReleasePlayer(p, severance);
    } else {
      const updatedSquad = club.squad.filter(pl => pl.id !== p.id);
      const updatedClub: Club = {
        ...club,
        balance: Math.max(0, club.balance - severance),
      };
      onUpdateSquad(updatedSquad, updatedClub);
    }

    setFeedback(`MUTUAL TERMINATION: ${p.name} has been released. Severance paid: £${(severance / 1000).toFixed(0)}k. Weekly wage space freed: £${(p.wage / 1000).toFixed(0)}k/wk.`);
    setSelectedPlayer(curr => (curr?.id === p.id ? null : curr));
    setSellModalPlayer(curr => (curr?.id === p.id ? null : curr));
    setPendingSaleConfirm(null);
  }, [club, onReleasePlayer, onUpdateSquad]);

  const handleOpenSellModal = useCallback((p: Player) => {
    sounds.playClick();
    setSellModalPlayer(p);
    setPendingSaleConfirm(null);
  }, []);

  const sellModalOffers = useMemo(() => {
    if (!sellModalPlayer || allClubs.length === 0) return [];
    return getTransferOffers(sellModalPlayer, allClubs, club.id);
  }, [sellModalPlayer, allClubs, club.id]);

  const executeDirectSale = (player: Player, offer: GeneratedTransferOffer, trustDelta: number) => {
    if (!onSellPlayer) return;
    onSellPlayer(player, offer.club, offer.fee, offer.wage, trustDelta);
    setFeedback(
      `SALE COMPLETED: ${player.name} sold to ${offer.club.name} for £${(offer.fee / 1000000).toFixed(2)}M.${
        trustDelta > 0 ? ` (${manager?.name} agreed, +${trustDelta} trust)` : trustDelta < 0 ? ` (${manager?.name} trust ${trustDelta})` : ''
      }`
    );
    setSellModalPlayer(null);
    setPendingSaleConfirm(null);
  };

  const handleAttemptAcceptOffer = (offer: GeneratedTransferOffer) => {
    if (!sellModalPlayer) return;
    sounds.playClick();

    if (!delegation) {
      executeDirectSale(sellModalPlayer, offer, 0);
      return;
    }

    const check = evaluateDirectorSaleDelegation(club, sellModalPlayer, manager, delegation);
    if (check.requiresConfirm) {
      setPendingSaleConfirm({ offer, check });
      return;
    }

    executeDirectSale(sellModalPlayer, offer, check.trustDelta);
  };

  const handleOpenOfferToClubs = useCallback((p: Player) => {
    sounds.playClick();
    setOfferingPlayer(p);
    setAskingPrice(p.value);
  }, []);

  const handleConfirmOfferToClubs = () => {
    if (!offeringPlayer) return;
    sounds.playGavel();

    if (!onOfferPlayerToClubs) {
      setFeedback(`Engine transfer listing is not connected.`);
      setOfferingPlayer(null);
      return;
    }

    const generatedBids = onOfferPlayerToClubs(offeringPlayer.id, askingPrice);

    if (generatedBids && generatedBids.length > 0) {
      setFeedback(`OFFERS RECEIVED: ${generatedBids.length} rival club${generatedBids.length > 1 ? 's' : ''} submitted bids for ${offeringPlayer.name}! Highest bid: £${(generatedBids[0].offeredFee / 1000000).toFixed(2)}M from ${generatedBids[0].buyingClubName}. Review offers in the Transfers Hub.`);
    } else {
      setFeedback(`MARKET INACTIVE: No rival clubs currently have the budget or tactical need for a ${offeringPlayer.position} at £${(askingPrice / 1000000).toFixed(2)}M. Try offering again with a lower valuation.`);
    }

    setOfferingPlayer(null);
  };

  const inspectedPlayer = useMemo(
    () => (inspectedPlayerId ? club.squad.find(p => p.id === inspectedPlayerId) ?? null : null),
    [inspectedPlayerId, club.squad]
  );

  const inspectedOccupancy = useMemo(() => {
    if (!inspectedPlayer) return { label: 'Reserves', slotRole: undefined as SlotRole | undefined };
    const slotIdx = resolvedLineup.slots.indexOf(inspectedPlayer.id);
    if (slotIdx !== -1) {
      const def = FORMATIONS[resolvedLineup.formation] || FORMATIONS['4-3-3'];
      const role = def.slots[slotIdx]?.role;
      return { label: role ? `${role} Starter` : 'Starting XI', slotRole: role };
    }
    if (resolvedLineup.bench.includes(inspectedPlayer.id)) {
      return { label: 'Substitutes Bench', slotRole: undefined };
    }
    return { label: 'Reserves', slotRole: undefined };
  }, [inspectedPlayer, resolvedLineup]);

  const handleInspectPlayer = useCallback((p: Player) => {
    sounds.playClick();
    setInspectedPlayerId(p.id);
  }, []);

  return (
    <div className="space-y-4">
      
      {/* Compact Page Title Header */}
      <div className="space-y-3">
        <div className="min-w-0">
          <h1 className="text-lg sm:text-xl font-extrabold text-white tracking-tight leading-tight">
            First-Team Squad
          </h1>
          <div className="flex items-center gap-2 text-xs text-slate-400 font-mono tabular-nums mt-0.5">
            <span className="text-slate-200 font-semibold">Squad {club.squad.length}/25</span>
            <span aria-hidden="true">·</span>
            <span className="text-emerald-400 font-semibold">£{(currentWages / 1000).toFixed(0)}k/wk</span>
          </div>
        </div>

        {/* Full-width 44px Pitch | Table segmented control on its own row */}
        <div
          role="tablist"
          aria-label="Squad view mode"
          className="w-full h-11 grid grid-cols-2 gap-1 p-1 bg-[#111827] border border-slate-800 rounded-xl"
        >
          <button
            type="button"
            role="tab"
            aria-selected={viewMode === 'pitch'}
            onClick={() => handleSetViewMode('pitch')}
            className={`h-full rounded-lg text-xs font-bold transition-colors cursor-pointer flex items-center justify-center ${
              viewMode === 'pitch'
                ? 'bg-amber-400 text-slate-950 shadow-sm'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            Pitch
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={viewMode === 'table'}
            onClick={() => handleSetViewMode('table')}
            className={`h-full rounded-lg text-xs font-bold transition-colors cursor-pointer flex items-center justify-center ${
              viewMode === 'table'
                ? 'bg-amber-400 text-slate-950 shadow-sm'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            Table
          </button>
        </div>
      </div>

      {feedback && (
        <div className="p-3.5 rounded-xl bg-slate-900 border border-amber-400/30 text-xs text-amber-300 flex items-center justify-between gap-2">
          <span className="max-w-[75ch]">{feedback}</span>
          <button
            onClick={() => setFeedback(null)}
            aria-label="Dismiss feedback"
            className="min-h-11 min-w-11 lg:min-h-0 lg:min-w-0 flex items-center justify-center rounded-lg text-slate-400 hover:text-white cursor-pointer shrink-0 active:scale-95"
          >
            ✕
          </button>
        </div>
      )}

      {viewMode === 'pitch' ? (
        <PitchView
          club={club}
          manager={manager}
          lineup={resolvedLineup}
          onChangeLineup={commitLineup}
          onSell={handleOpenSellModal}
          onOffer={handleOpenOfferToClubs}
          onRenew={handleOpenRenew}
          onRelease={handleReleasePlayer}
        />
      ) : (
        <div className="space-y-4">
      {/* Mobile & Tablet (< lg): Collapsed Filters Button */}
      <div className="flex lg:hidden items-center justify-between gap-2">
        <button
          type="button"
          onClick={handleOpenFilterSheet}
          className={`flex-1 min-h-11 px-4 py-2.5 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 cursor-pointer transition-all active:scale-95 ${
            activeFiltersCount > 0
              ? 'bg-amber-400/15 border-amber-400/40 text-amber-300'
              : 'bg-[#111827] border-white/10 text-slate-200 hover:text-white'
          }`}
        >
          <Filter className="w-4 h-4" />
          <span>Filters{selectedPos !== 'ALL' ? `: ${selectedPos}` : ''}</span>
          {activeFiltersCount > 0 && (
            <span className="w-5 h-5 rounded-full bg-amber-400 text-slate-950 font-bold text-xs flex items-center justify-center">
              {activeFiltersCount}
            </span>
          )}
        </button>
        {activeFiltersCount > 0 && (
          <button
            type="button"
            onClick={handleResetFilterSheet}
            aria-label="Reset squad filters"
            className="min-h-11 min-w-11 px-3 py-2 bg-[#111827] border border-white/10 text-slate-300 hover:text-white rounded-xl flex items-center justify-center gap-1.5 text-xs font-semibold cursor-pointer active:scale-95"
          >
            <RotateCcw className="w-4 h-4" />
            <span>Reset</span>
          </button>
        )}
      </div>

      {/* Desktop (lg+): Inline Position Filter Tabs */}
      <div className="hidden lg:flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
        {POSITION_FILTERS.map(pos => (
          <button
            key={pos}
            onClick={() => {
              sounds.playClick();
              setSelectedPos(pos);
            }}
            className={`px-4 py-2 text-xs font-bold rounded-lg border transition-all cursor-pointer whitespace-nowrap active:scale-95 ${
              selectedPos === pos
                ? 'bg-amber-400 text-slate-950 border-amber-400 shadow-sm'
                : 'bg-slate-900/80 border-white/10 text-slate-400 hover:text-white'
            }`}
          >
            {pos === 'ALL' ? 'Full Squad' : pos === 'GK' ? 'Goalkeepers' : pos === 'DEF' ? 'Defenders' : pos === 'MID' ? 'Midfielders' : 'Forwards'}
          </button>
        ))}
      </div>

      {/* Mobile (< md): Sort Controls + Card List */}
      <div className="md:hidden space-y-3">
        <div className="bg-[#111827] border border-white/10 rounded-xl p-3 flex items-center gap-2">
          <label htmlFor="squad-mobile-sort" className="text-xs font-semibold text-slate-400 whitespace-nowrap">
            Sort by
          </label>
          <select
            id="squad-mobile-sort"
            value={String(sortField)}
            onChange={e => {
              sounds.playClick();
              const nextField = e.target.value as keyof Player;
              setSortField(nextField);
              setSortAsc(nextField === 'position' || nextField === 'name' || nextField === 'age');
            }}
            className="flex-1 min-h-11 px-3 py-2 bg-slate-900 border border-white/10 rounded-lg text-base text-white font-semibold focus:outline-none focus:border-amber-400"
          >
            <option value="overall">OVR Rating</option>
            <option value="name">Player Name</option>
            <option value="position">Position</option>
            <option value="age">Age</option>
            <option value="growthMomentum">Momentum</option>
            <option value="value">Valuation</option>
            <option value="wage">Wage</option>
            <option value="contractYears">Contract Length</option>
            <option value="form">Form</option>
            <option value="goals">Goals</option>
          </select>
          <button
            type="button"
            onClick={() => {
              sounds.playClick();
              setSortAsc(prev => !prev);
            }}
            aria-label={sortAsc ? 'Sort ascending, tap for descending' : 'Sort descending, tap for ascending'}
            className="min-h-11 min-w-11 px-3 flex items-center justify-center gap-1 bg-slate-900 border border-white/10 rounded-lg text-amber-400 font-bold text-xs cursor-pointer active:scale-95"
          >
            {sortAsc ? <ArrowUp className="w-4 h-4" /> : <ArrowDown className="w-4 h-4" />}
            <span>{sortAsc ? 'Asc' : 'Desc'}</span>
          </button>
        </div>

        <div className="space-y-3">
          {sortedSquad.map(player => (
            <SquadMobileCard
              key={player.id}
              player={player}
              isExpanded={expandedPlayerId === player.id}
              onToggleExpand={handleToggleExpand}
              onInspect={handleInspectPlayer}
              onOffer={handleOpenOfferToClubs}
              onSell={handleOpenSellModal}
              onRenew={handleOpenRenew}
              onRelease={handleReleasePlayer}
            />
          ))}
        </div>
      </div>

      {/* Desktop/Tablet (md+): Squad Table */}
      <div className="hidden md:block bg-[#111827] border border-white/10 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead>
              <tr className="text-xs sm:text-[10px] text-slate-500 border-b border-white/10 bg-slate-900 uppercase">
                <th className="sticky left-0 z-20 bg-slate-900 py-1 px-3 border-r border-white/5">
                  <button type="button" onClick={() => toggleSort('name')} className="w-full min-h-11 lg:min-h-0 py-2 flex items-center justify-start gap-1 cursor-pointer hover:text-white uppercase">
                    <span className={sortField === 'name' ? 'text-amber-400 font-bold' : ''}>Player Name</span>
                    {renderSortArrow('name')}
                  </button>
                </th>
                <th className="py-1 px-2 text-center">
                  <button type="button" onClick={() => toggleSort('position')} className="w-full min-h-11 lg:min-h-0 py-2 flex items-center justify-center gap-1 cursor-pointer hover:text-white uppercase">
                    <span className={sortField === 'position' ? 'text-amber-400 font-bold' : ''}>Pos</span>
                    {renderSortArrow('position')}
                  </button>
                </th>
                <th className="hidden lg:table-cell py-1 px-2 text-center">
                  <button type="button" onClick={() => toggleSort('age')} className="w-full min-h-11 lg:min-h-0 py-2 flex items-center justify-center gap-1 cursor-pointer hover:text-white uppercase">
                    <span className={sortField === 'age' ? 'text-amber-400 font-bold' : ''}>Age</span>
                    {renderSortArrow('age')}
                  </button>
                </th>
                <th className="py-1 px-2 text-center">
                  <button type="button" onClick={() => toggleSort('overall')} className="w-full min-h-11 lg:min-h-0 py-2 flex items-center justify-center gap-1 cursor-pointer hover:text-white uppercase">
                    <span className={sortField === 'overall' ? 'text-amber-400 font-bold' : ''}>OVR / 99</span>
                    {renderSortArrow('overall')}
                  </button>
                </th>
                <th className="hidden xl:table-cell py-1 px-2 text-center">
                  <button type="button" onClick={() => toggleSort('growthMomentum')} className="w-full min-h-11 lg:min-h-0 py-2 flex items-center justify-center gap-1 cursor-pointer hover:text-white uppercase">
                    <span className={sortField === 'growthMomentum' ? 'text-amber-400 font-bold' : ''}>Momentum</span>
                    {renderSortArrow('growthMomentum')}
                  </button>
                </th>
                <th className="py-1 px-3 text-right">
                  <button type="button" onClick={() => toggleSort('value')} className="w-full min-h-11 lg:min-h-0 py-2 flex items-center justify-end gap-1 cursor-pointer hover:text-white uppercase">
                    <span className={sortField === 'value' ? 'text-amber-400 font-bold' : ''}>Valuation</span>
                    {renderSortArrow('value')}
                  </button>
                </th>
                <th className="py-1 px-3 text-right">
                  <button type="button" onClick={() => toggleSort('wage')} className="w-full min-h-11 lg:min-h-0 py-2 flex items-center justify-end gap-1 cursor-pointer hover:text-white uppercase">
                    <span className={sortField === 'wage' ? 'text-amber-400 font-bold' : ''}>Wage</span>
                    {renderSortArrow('wage')}
                  </button>
                </th>
                <th className="hidden lg:table-cell py-1 px-2 text-center">
                  <button type="button" onClick={() => toggleSort('contractYears')} className="w-full min-h-11 lg:min-h-0 py-2 flex items-center justify-center gap-1 cursor-pointer hover:text-white uppercase">
                    <span className={sortField === 'contractYears' ? 'text-amber-400 font-bold' : ''}>Contract</span>
                    {renderSortArrow('contractYears')}
                  </button>
                </th>
                <th className="hidden lg:table-cell py-1 px-2 text-center">
                  <button type="button" onClick={() => toggleSort('form')} className="w-full min-h-11 lg:min-h-0 py-2 flex items-center justify-center gap-1 cursor-pointer hover:text-white uppercase">
                    <span className={sortField === 'form' ? 'text-amber-400 font-bold' : ''}>Form</span>
                    {renderSortArrow('form')}
                  </button>
                </th>
                <th className="hidden xl:table-cell py-1 px-2 text-center">
                  <button type="button" onClick={() => toggleSort('goals')} className="w-full min-h-11 lg:min-h-0 py-2 flex items-center justify-center gap-1 cursor-pointer hover:text-white uppercase">
                    <span className={sortField === 'goals' ? 'text-amber-400 font-bold' : ''}>G / A</span>
                    {renderSortArrow('goals')}
                  </button>
                </th>
                <th className="py-3 px-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 font-sans">
              {sortedSquad.map(player => (
                <SquadTableRow
                  key={player.id}
                  player={player}
                  onInspect={handleInspectPlayer}
                  onOffer={handleOpenOfferToClubs}
                  onSell={handleOpenSellModal}
                  onRenew={handleOpenRenew}
                  onRelease={handleReleasePlayer}
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>
        </div>
      )}

      {/* Player Info Sheet (triggered from Table view) */}
      <PlayerSheet
        player={inspectedPlayer}
        occupancyLabel={inspectedOccupancy.label}
        slotRole={inspectedOccupancy.slotRole}
        mode="sheet"
        isOpen={Boolean(inspectedPlayer)}
        onClose={() => setInspectedPlayerId(null)}
        onSell={p => {
          setInspectedPlayerId(null);
          handleOpenSellModal(p);
        }}
        onOffer={p => {
          setInspectedPlayerId(null);
          handleOpenOfferToClubs(p);
        }}
        onRenew={p => {
          setInspectedPlayerId(null);
          handleOpenRenew(p);
        }}
        onRelease={p => {
          setInspectedPlayerId(null);
          handleReleasePlayer(p);
        }}
      />

      {/* Mobile Squad Filters Sheet Modal */}
      <Modal
        isOpen={showFilterSheet}
        onClose={() => setShowFilterSheet(false)}
        maxWidthClass="max-w-md"
        ariaLabel="Squad Position Filters"
        header={
          <div>
            <span className="text-xs font-bold text-amber-400 uppercase tracking-wider block">
              Squad Roster Filters
            </span>
            <h3 className="text-lg font-bold text-white">Filter by Position</h3>
          </div>
        }
        footer={
          <div className="flex flex-wrap items-center justify-between gap-2">
            <button
              type="button"
              onClick={handleResetFilterSheet}
              className="px-4 py-2.5 min-h-11 bg-slate-900 border border-white/10 text-xs font-semibold text-slate-300 hover:text-white rounded-xl cursor-pointer active:scale-95 flex items-center gap-1.5"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset</span>
            </button>
            <button
              type="button"
              onClick={handleApplyFilterSheet}
              className="px-5 py-2.5 min-h-11 bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-slate-950 font-extrabold text-xs rounded-xl shadow-md cursor-pointer active:scale-95"
            >
              Apply Filters
            </button>
          </div>
        }
      >
        <div className="grid grid-cols-1 gap-2">
          {POSITION_FILTERS.map(pos => (
            <button
              key={pos}
              type="button"
              onClick={() => {
                sounds.playClick();
                setDraftPos(pos);
              }}
              className={`w-full min-h-11 px-4 py-3 text-left text-sm font-bold rounded-xl border transition-all cursor-pointer active:scale-[0.98] flex items-center justify-between ${
                draftPos === pos
                  ? 'bg-amber-400 text-slate-950 border-amber-400'
                  : 'bg-slate-900 border-white/10 text-slate-300 hover:text-white'
              }`}
            >
              <span>
                {pos === 'ALL'
                  ? 'Full Squad'
                  : pos === 'GK'
                    ? 'Goalkeepers'
                    : pos === 'DEF'
                      ? 'Defenders'
                      : pos === 'MID'
                        ? 'Midfielders'
                        : 'Forwards'}
              </span>
              <span className="font-mono text-xs opacity-75">
                {positionCounts[pos]}
              </span>
            </button>
          ))}
        </div>
      </Modal>

      {/* Contract Renewal Modal */}
      <Modal
        isOpen={Boolean(selectedPlayer)}
        onClose={() => setSelectedPlayer(null)}
        maxWidthClass="max-w-md"
        ariaLabel={selectedPlayer ? `Contract Negotiations for ${selectedPlayer.name}` : 'Contract Negotiations'}
        header={
          selectedPlayer && (
            <div>
              <span className="text-xs sm:text-[10px] font-bold text-amber-400 uppercase tracking-wider block">
                Contract Negotiations
              </span>
              <h3 className="text-lg font-bold text-white">
                {selectedPlayer.name}
              </h3>
              <span className="text-xs text-slate-400 font-mono">
                Current: £{(selectedPlayer.wage / 1000).toFixed(0)}k/wk · {selectedPlayer.contractYears} years remaining
              </span>
            </div>
          )
        }
        footer={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <button
              onClick={() => setSelectedPlayer(null)}
              className="px-4 py-2 min-h-11 lg:min-h-0 text-xs font-medium text-slate-400 hover:text-white cursor-pointer"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirmRenew}
              className="px-5 py-2 min-h-11 lg:min-h-0 bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-slate-950 font-bold text-xs rounded-lg shadow-md transition-all cursor-pointer active:scale-95"
            >
              Finalize Contract Extension
            </button>
          </div>
        }
      >
        {selectedPlayer && (
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Proposed Weekly Wage (£/week)
              </label>
              <input
                type="number"
                inputMode="numeric"
                min={1000}
                step={500}
                value={renewWage}
                onChange={e => setRenewWage(Number(e.target.value))}
                className="w-full min-h-11 lg:min-h-0 px-3.5 py-2.5 bg-slate-900 border border-white/10 rounded-lg text-white font-mono text-base md:text-sm focus:outline-none focus:border-amber-400"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Contract Duration (Years)
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[1, 2, 3, 5].map(yrs => (
                  <button
                    key={yrs}
                    type="button"
                    onClick={() => setRenewYears(yrs)}
                    className={`py-2 min-h-11 lg:min-h-0 text-xs font-mono font-bold rounded-lg border cursor-pointer ${
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
        )}
      </Modal>

      {/* Offer to Clubs Modal */}
      <Modal
        isOpen={Boolean(offeringPlayer)}
        onClose={() => setOfferingPlayer(null)}
        maxWidthClass="max-w-lg"
        ariaLabel={offeringPlayer ? `Offer ${offeringPlayer.name} to Clubs` : 'Offer Player to Clubs'}
        header={
          offeringPlayer && (
            <div>
              <span className="text-xs sm:text-[10px] font-bold text-amber-400 uppercase tracking-wider block">
                Transfer Listing & Market Circulation
              </span>
              <h3 className="text-xl font-bold text-white">
                Offer {offeringPlayer.name} to Clubs
              </h3>
              <span className="text-xs text-slate-400 font-mono">
                {offeringPlayer.position} · Overall {offeringPlayer.overall} · Age {offeringPlayer.age} · Wage £{(offeringPlayer.wage / 1000).toFixed(0)}k/wk
              </span>
            </div>
          )
        }
        footer={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <button
              onClick={() => setOfferingPlayer(null)}
              className="px-4 py-2 min-h-11 lg:min-h-0 text-xs font-semibold text-slate-400 hover:text-white cursor-pointer"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirmOfferToClubs}
              className="px-5 py-2.5 min-h-11 lg:min-h-0 bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-slate-950 font-extrabold text-xs rounded-xl shadow-lg shadow-amber-500/20 flex items-center gap-2 cursor-pointer transition-all active:scale-95"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Circulate to Rival Clubs</span>
            </button>
          </div>
        }
      >
        {offeringPlayer && (
          <div className="space-y-4">
            {/* Financial Snapshot */}
            <div className="grid grid-cols-2 gap-3 bg-slate-900/80 border border-white/5 p-3.5 rounded-xl">
              <div>
                <span className="text-xs sm:text-[10px] text-slate-400 uppercase block font-mono">Market Valuation</span>
                <span className="text-base font-bold font-mono text-white">
                  £{(offeringPlayer.value / 1000000).toFixed(2)}M
                </span>
              </div>
              <div>
                <span className="text-xs sm:text-[10px] text-slate-400 uppercase block font-mono">Current Wage Relief</span>
                <span className="text-base font-bold font-mono text-emerald-400">
                  £{(offeringPlayer.wage / 1000).toFixed(0)}k/wk
                </span>
              </div>
            </div>

            {/* Asking Price Input */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Asking Price (£)
              </label>
              <input
                type="number"
                inputMode="numeric"
                min={50000}
                step={250000}
                value={askingPrice}
                onChange={e => setAskingPrice(Math.max(50000, Number(e.target.value)))}
                className="w-full min-h-11 lg:min-h-0 px-3.5 py-2.5 bg-slate-900 border border-white/10 rounded-lg text-white font-mono text-base md:text-sm focus:outline-none focus:border-amber-400"
              />
              <span className="text-xs sm:text-[11px] text-amber-400 font-mono block mt-1">
                £{(askingPrice / 1000000).toFixed(2)} Million
              </span>
            </div>

            {/* Quick Multiplier Presets */}
            <div>
              <label className="block text-xs sm:text-[11px] font-semibold text-slate-400 mb-1.5 uppercase">
                Valuation Presets
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[
                  { label: '80% Cut', mult: 0.8 },
                  { label: '100% Fair', mult: 1.0 },
                  { label: '125% Premium', mult: 1.25 },
                  { label: '150% High', mult: 1.5 },
                ].map(preset => {
                  const price = Math.round(offeringPlayer.value * preset.mult);
                  const isSelected = askingPrice === price;
                  return (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() => setAskingPrice(price)}
                      className={`py-2 px-1 min-h-11 lg:min-h-0 text-xs sm:text-[11px] font-mono rounded-lg border text-center transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-amber-400 text-slate-950 font-bold border-amber-400'
                          : 'bg-slate-900 border-white/10 text-slate-300 hover:text-white'
                      }`}
                    >
                      <span className="block font-semibold">{preset.label}</span>
                      <span className="text-xs sm:text-[10px] opacity-75">£{(price / 1000000).toFixed(1)}M</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="bg-slate-900/60 border border-white/5 rounded-xl p-3 text-xs text-slate-400 leading-relaxed">
              Circulating this player will prompt all rival AI clubs to evaluate their positional needs, tier requirements, and available budget. Bids will arrive immediately and appear in your <strong>Transfers &gt; Proposals</strong> hub.
            </div>
          </div>
        )}
      </Modal>

      {/* Sell / Release Player Popup Modal */}
      <Modal
        isOpen={Boolean(sellModalPlayer)}
        onClose={() => {
          setSellModalPlayer(null);
          setPendingSaleConfirm(null);
        }}
        maxWidthClass="max-w-lg"
        ariaLabel={sellModalPlayer ? `Sell or Release ${sellModalPlayer.name}` : 'Sell or Release Player'}
        header={
          sellModalPlayer && (
            <div>
              <span className="text-xs sm:text-[10px] font-bold text-emerald-400 uppercase tracking-wider block">
                Squad Outgoings & Contract Termination
              </span>
              <h3 className="text-xl font-bold text-white">
                {sellModalPlayer.name}
              </h3>
              <span className="text-xs text-slate-400 font-mono">
                {sellModalPlayer.position} · OVR {sellModalPlayer.overall} · Age {sellModalPlayer.age} · Value £{(sellModalPlayer.value / 1000000).toFixed(2)}M
              </span>
            </div>
          )
        }
        footer={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setSellModalPlayer(null);
                setPendingSaleConfirm(null);
              }}
              className="px-4 py-2 min-h-11 lg:min-h-0 text-xs font-semibold text-slate-400 hover:text-white cursor-pointer"
            >
              Close
            </button>
          </div>
        }
      >
        {sellModalPlayer && (
          <div className="space-y-5">
            {/* Delegation Override / Objection Confirmation Banner */}
            {pendingSaleConfirm && (
              <div className="bg-rose-950/35 border border-rose-500/40 rounded-xl p-4 space-y-3">
                <div className="flex items-start gap-2.5">
                  <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                  <div className="space-y-1 text-xs">
                    <span className="font-bold text-white block">
                      {pendingSaleConfirm.check.title || 'Head Coach Warning'}
                    </span>
                    <p className="text-slate-200 leading-relaxed">
                      {pendingSaleConfirm.check.mode === 'manager'
                        ? `Overriding your Head Coach will cost trust (${pendingSaleConfirm.check.trustDelta} trust).`
                        : pendingSaleConfirm.check.reason}
                    </p>
                    <p className="text-slate-400 font-mono">
                      Buyer: {pendingSaleConfirm.offer.club.name} · £{(pendingSaleConfirm.offer.fee / 1000000).toFixed(2)}M
                      {' · '}Trust impact: <span className="text-rose-400 font-bold">{pendingSaleConfirm.check.trustDelta}</span>
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setPendingSaleConfirm(null)}
                    className="min-h-11 px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-semibold text-slate-200 cursor-pointer active:scale-95"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      executeDirectSale(
                        sellModalPlayer,
                        pendingSaleConfirm.offer,
                        pendingSaleConfirm.check.trustDelta
                      )
                    }
                    className="min-h-11 px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold cursor-pointer active:scale-95"
                  >
                    Force it through ({pendingSaleConfirm.check.trustDelta} Trust)
                  </button>
                </div>
              </div>
            )}

            {/* Section 1: Sell Player (Offers from getTransferOffers) */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                  <Coins className="w-4 h-4" />
                  <span>Sell Player — Market Offers</span>
                </h4>
                <span className="text-xs font-mono text-slate-400">
                  {sellModalOffers.length} {sellModalOffers.length === 1 ? 'offer' : 'offers'}
                </span>
              </div>

              {sellModalOffers.length === 0 ? (
                <div className="bg-slate-900/70 border border-white/5 rounded-xl p-4 text-xs text-slate-400">
                  No clubs currently have the squad space and budget to make an immediate purchase offer for {sellModalPlayer.name}.
                </div>
              ) : (
                <div className="space-y-2">
                  {sellModalOffers.map(offer => {
                    const pctOfValue = sellModalPlayer.value > 0
                      ? Math.round((offer.fee / sellModalPlayer.value) * 100)
                      : 100;
                    return (
                      <div
                        key={offer.club.id}
                        className="bg-slate-900/80 border border-white/10 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span
                            className="w-3.5 h-3.5 rounded-full shrink-0 border border-white/20"
                            style={{ backgroundColor: offer.club.primaryColor }}
                          />
                          <div className="min-w-0">
                            <span className="text-sm font-bold text-white block truncate">
                              {offer.club.name}
                            </span>
                            <span className="text-xs font-mono text-slate-400 block">
                              {offer.club.tier === 1 ? 'Premier League' : offer.club.tier === 2 ? 'Championship' : 'League One'}
                              {' · '}
                              £{(offer.wage / 1000).toFixed(0)}k/wk
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0">
                          <div className="text-left sm:text-right font-mono">
                            <span className="text-sm font-extrabold text-emerald-400 tabular-nums block">
                              £{(offer.fee / 1000000).toFixed(2)}M
                            </span>
                            <span className="text-xs text-slate-400 tabular-nums">
                              {pctOfValue}% of value
                            </span>
                          </div>

                          <button
                            type="button"
                            onClick={() => handleAttemptAcceptOffer(offer)}
                            className="min-h-11 px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold text-xs flex items-center gap-1.5 cursor-pointer transition-all active:scale-95"
                          >
                            <Check className="w-3.5 h-3.5" />
                            <span>Accept</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Section 2: Release Player */}
            <div className="pt-4 border-t border-white/10 space-y-2.5">
              <h4 className="text-xs font-bold uppercase tracking-wider text-rose-400 flex items-center gap-1.5">
                <Trash2 className="w-4 h-4" />
                <span>Release Player (Mutual Termination)</span>
              </h4>
              <div className="bg-rose-950/15 border border-rose-500/20 rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="text-xs space-y-0.5">
                  <span className="text-slate-300 block">
                    Severance Cost: <strong className="font-mono text-rose-300">£{((sellModalPlayer.wage * 26) / 1000).toFixed(0)}k</strong> (26 weeks)
                  </span>
                  <span className="text-slate-400 block">
                    Wage Relief: <strong className="font-mono text-emerald-400">£{(sellModalPlayer.wage / 1000).toFixed(0)}k/wk</strong>
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => handleReleasePlayer(sellModalPlayer)}
                  className="min-h-11 px-4 py-2 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-rose-300 text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-all active:scale-95 shrink-0"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Release Player</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </Modal>

    </div>
  );
};
