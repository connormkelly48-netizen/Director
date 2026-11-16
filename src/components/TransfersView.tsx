import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { Club, Director, Owner, Manager, Player, PlayerPosition, POSITION_ORDER, DelegationMatrix, GrowthMomentum, TransferRecord, TransferProposal, IncomingBid } from '../types/game';
import { 
  DollarSign, 
  Search, 
  CheckCircle, 
  AlertTriangle, 
  ArrowRight, 
  X, 
  ArrowUpDown, 
  ArrowUp, 
  ArrowDown, 
  RotateCcw, 
  SlidersHorizontal, 
  ChevronLeft, 
  ChevronRight, 
  ChevronDown,
  ChevronUp,
  Coins,
  History,
  ArrowUpRight,
  ArrowDownLeft,
  Inbox,
  Tag,
  Check,
  Eye,
  Send,
  ClipboardCheck,
  UserCheck
} from 'lucide-react';
import { sounds } from '../services/soundEffects';
import { Modal } from './ui/Modal';
import {
  evaluateSigning,
  completeSigning,
  evaluateDirectorSigningDelegation,
  evaluateDirectorSaleDelegation,
  DelegationDecisionCheck,
} from '../services/transferService';

interface TransfersViewProps {
  currentClub: Club;
  allClubs: Club[];
  freeAgents: Player[];
  director: Director;
  owner: Owner;
  manager: Manager | undefined;
  delegation: DelegationMatrix;
  transferHistory?: TransferRecord[];
  transferProposals?: TransferProposal[];
  incomingBids?: IncomingBid[];
  seasonYear?: number;
  currentWeek?: number;
  onCompleteTransfer: (
    updatedClubs: Club[],
    updatedFreeAgents: Player[],
    updatedDirector: Director,
    updatedOwner: Owner,
    updatedManager: Manager | undefined,
    record: TransferRecord
  ) => void;
  onApproveProposal?: (proposalId: string) => { ok: boolean; error?: string };
  onRejectProposal?: (proposalId: string) => void;
  onAcceptBid?: (bidId: string, trustDelta?: number) => void;
  onRejectBid?: (bidId: string) => void;
  onOfferPlayerToClubs?: (playerId: string, askingPrice: number) => IncomingBid[];
}

type SortField = 'overall' | 'position' | 'age' | 'growthMomentum' | 'value' | 'wage' | 'name';
type SortDirection = 'asc' | 'desc';

const INITIAL_MARKET_VISIBLE_COUNT = 30;
const MARKET_PAGE_INCREMENT = 30;

const MOMENTUM_ORDER: Record<GrowthMomentum, number> = {
  breakout: 5,
  rapid: 4,
  prime: 3,
  steady: 2,
  cooling: 1,
};

const getMarketPosBadgeClass = (position: PlayerPosition) => {
  switch (position) {
    case 'FWD': return 'bg-rose-500/15 text-rose-300 border border-rose-500/30';
    case 'MID': return 'bg-amber-500/15 text-amber-300 border border-amber-500/30';
    case 'DEF': return 'bg-blue-500/15 text-blue-300 border border-blue-500/30';
    default: return 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30';
  }
};

const getMarketMomentumClass = (momentum?: GrowthMomentum) => {
  switch (momentum) {
    case 'breakout': return 'text-emerald-400';
    case 'rapid': return 'text-cyan-400';
    case 'prime': return 'text-amber-400';
    case 'cooling': return 'text-rose-400';
    default: return 'text-slate-300';
  }
};

const getMarketMomentumLabel = (momentum?: GrowthMomentum) => {
  switch (momentum) {
    case 'breakout': return '🚀 Breakout';
    case 'rapid': return '📈 Rapid';
    case 'prime': return '⭐ Prime';
    case 'cooling': return '📉 Cooling';
    default: return '⚖️ Steady';
  }
};

interface MarketRowProps {
  player: Player;
  club: Club | null;
  isAffordableFee: boolean;
  isAffordableWage: boolean;
  onNegotiate: (item: { player: Player; club: Club | null }) => void;
}

interface MarketMobileCardProps extends MarketRowProps {
  isExpanded: boolean;
  onToggleExpand: (playerId: string) => void;
}

const MarketMobileCard = React.memo<MarketMobileCardProps>(({
  player,
  club,
  isAffordableFee,
  isAffordableWage,
  isExpanded,
  onToggleExpand,
  onNegotiate,
}) => (
  <div className="bg-[#111827] border border-white/10 rounded-xl overflow-hidden shadow-lg">
    <button
      type="button"
      aria-expanded={isExpanded}
      onClick={() => onToggleExpand(player.id)}
      className="w-full p-4 text-left cursor-pointer active:scale-[0.99] transition-transform"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5 min-w-0">
          <div
            className="w-3 h-3 rounded-full shrink-0 mt-1.5 shadow-sm"
            style={{ backgroundColor: club?.primaryColor || '#64748b' }}
          />
          <div className="min-w-0">
            <span className="font-bold text-base text-white block truncate">{player.name}</span>
            <span className="text-xs text-slate-400 font-mono block truncate">
              {club ? club.name : 'Free Agent'} · {player.roleDetail}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span className={`px-2 py-0.5 rounded text-xs font-bold font-mono ${getMarketPosBadgeClass(player.position)}`}>
            {player.position}
          </span>
          <span
            className={`font-mono font-extrabold text-lg tabular-nums ${
              player.overall >= 85
                ? 'text-amber-400'
                : player.overall >= 80
                  ? 'text-amber-300'
                  : player.overall >= 75
                    ? 'text-slate-100'
                    : 'text-slate-400'
            }`}
          >
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
          <span className="text-slate-400 block">Valuation</span>
          <span
            className={`font-bold tabular-nums ${
              club ? (isAffordableFee ? 'text-slate-200' : 'text-slate-500') : 'text-emerald-400'
            }`}
          >
            {club ? `£${(player.value / 1000000).toFixed(1)}M` : 'FREE'}
          </span>
        </div>
        <div className="text-right">
          <span className="text-slate-400 block">Wage</span>
          <span className={`font-bold tabular-nums ${isAffordableWage ? 'text-emerald-400' : 'text-slate-500'}`}>
            £{(player.wage / 1000).toFixed(0)}k/wk
          </span>
        </div>
      </div>
    </button>

    {isExpanded && (
      <div className="px-4 pb-3 pt-2 border-t border-white/5 bg-slate-900/40 grid grid-cols-2 gap-3 text-xs font-mono">
        <div>
          <span className="text-slate-400 block">Momentum</span>
          <span className={`font-semibold ${getMarketMomentumClass(player.growthMomentum)}`}>
            {getMarketMomentumLabel(player.growthMomentum)}
          </span>
        </div>
        <div>
          <span className="text-slate-400 block">Division</span>
          <span className="text-slate-200 font-semibold">
            {club
              ? club.tier === 1
                ? 'Premier League'
                : club.tier === 2
                  ? 'Championship'
                  : 'League One'
              : 'Free Agent'}
          </span>
        </div>
        <div>
          <span className="text-slate-400 block">Fee Budget Fit</span>
          <span className={isAffordableFee ? 'text-emerald-400 font-semibold' : 'text-rose-400 font-semibold'}>
            {isAffordableFee ? 'Within War Chest' : 'Exceeds War Chest'}
          </span>
        </div>
        <div>
          <span className="text-slate-400 block">Wage Budget Fit</span>
          <span className={isAffordableWage ? 'text-emerald-400 font-semibold' : 'text-rose-400 font-semibold'}>
            {isAffordableWage ? 'Within Wage Cap' : 'Exceeds Wage Cap'}
          </span>
        </div>
      </div>
    )}

    <div className="px-4 py-3 bg-slate-900/60 border-t border-white/5">
      <button
        type="button"
        onClick={() => onNegotiate({ player, club })}
        className="w-full min-h-11 px-4 py-2 text-xs font-bold bg-amber-400/15 hover:bg-amber-400/25 border border-amber-400/40 text-amber-300 rounded-lg transition-all cursor-pointer active:scale-95"
      >
        Approach Player
      </button>
    </div>
  </div>
));
MarketMobileCard.displayName = 'MarketMobileCard';

const MarketTableRow = React.memo<MarketRowProps>(({
  player,
  club,
  isAffordableFee,
  isAffordableWage,
  onNegotiate,
}) => (
  <tr className="hover:bg-white/5 transition-colors group">
    {/* Name & Club */}
    <td className="sticky left-0 z-10 bg-[#111827] group-hover:bg-[#192231] py-3 px-3 border-r border-white/5">
      <div className="flex items-center gap-2">
        <div
          className="w-2.5 h-2.5 rounded-full shrink-0 shadow-sm"
          style={{ backgroundColor: club?.primaryColor || '#64748b' }}
          title={club ? club.name : 'Free Agent'}
        />
        <div className="min-w-0">
          <span className="font-bold text-white block group-hover:text-amber-300 transition-colors whitespace-nowrap">
            {player.name}
          </span>
          <span className="text-xs sm:text-[10px] text-slate-400 font-mono whitespace-nowrap">
            {club ? club.name : 'Free Agent'} · {player.roleDetail}
          </span>
        </div>
      </div>
    </td>

    {/* Position */}
    <td className="py-3 px-2 text-center font-mono">
      <span className={`px-1.5 py-0.5 rounded text-xs sm:text-[10px] font-bold ${getMarketPosBadgeClass(player.position)}`}>
        {player.position}
      </span>
    </td>

    {/* Age */}
    <td className="hidden lg:table-cell py-3 px-2 text-center font-mono text-slate-300 tabular-nums">
      {player.age}
    </td>

    {/* OVR Rating */}
    <td className="py-3 px-2 text-center font-mono font-bold tabular-nums text-sm">
      <span
        className={`${
          player.overall >= 85
            ? 'text-amber-400 drop-shadow-[0_0_8px_rgba(251,191,36,0.5)]'
            : player.overall >= 80
              ? 'text-amber-300'
              : player.overall >= 75
                ? 'text-slate-100'
                : 'text-slate-400'
        }`}
      >
        {player.overall}
      </span>
    </td>

    {/* Growth Momentum */}
    <td className="hidden xl:table-cell py-3 px-2 text-center font-mono">
      <span className={`text-xs sm:text-[11px] font-semibold whitespace-nowrap ${getMarketMomentumClass(player.growthMomentum)}`}>
        {getMarketMomentumLabel(player.growthMomentum)}
      </span>
    </td>

    {/* Valuation */}
    <td className="py-3 px-3 text-right font-mono font-medium tabular-nums whitespace-nowrap">
      <span className={club ? (isAffordableFee ? 'text-slate-200' : 'text-slate-500') : 'text-emerald-400 font-bold'}>
        {club ? `£${(player.value / 1000000).toFixed(1)}M` : 'FREE'}
      </span>
    </td>

    {/* Current Wage */}
    <td className="py-3 px-3 text-right font-mono font-medium tabular-nums whitespace-nowrap">
      <span className={isAffordableWage ? 'text-emerald-400' : 'text-slate-500'}>
        £{(player.wage / 1000).toFixed(0)}k/wk
      </span>
    </td>

    {/* Approach Action Button */}
    <td className="py-3 px-3 text-right">
      <button
        onClick={() => onNegotiate({ player, club })}
        className="px-3 py-1.5 min-h-11 lg:min-h-0 text-xs font-bold bg-amber-400/10 hover:bg-amber-400/20 border border-amber-400/30 text-amber-300 rounded-lg transition-all cursor-pointer whitespace-nowrap hover:scale-105 active:scale-95"
      >
        Approach
      </button>
    </td>
  </tr>
));
MarketTableRow.displayName = 'MarketTableRow';

interface BidItemProps {
  bid: IncomingBid;
  buyingClubColor: string;
  currentValue: number;
  onReview: (bid: IncomingBid) => void;
  onAccept: (bidId: string) => void;
  onReject: (bidId: string) => void;
}

const IncomingBidMobileCard = React.memo<BidItemProps>(({
  bid,
  buyingClubColor,
  currentValue,
  onReview,
  onAccept,
  onReject,
}) => (
  <div className="bg-[#111827] border border-white/10 rounded-xl p-4 space-y-3 shadow-lg">
    <div className="flex items-start justify-between gap-2">
      <div className="min-w-0">
        <span className="font-bold text-base text-white block truncate">{bid.playerName}</span>
        <span className="text-xs text-slate-400 font-mono block">
          {bid.playerPos} · OVR {bid.playerOverall} · Age {bid.playerAge}
        </span>
      </div>
      <span className={`px-2 py-0.5 rounded text-xs uppercase font-bold font-mono shrink-0 ${
        bid.status === 'accepted' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' :
        bid.status === 'rejected' ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30' :
        'bg-amber-400/20 text-amber-300 border border-amber-400/30'
      }`}>
        {bid.status}
      </span>
    </div>

    <div className="flex items-center gap-2 text-xs bg-slate-900/60 border border-white/5 rounded-lg px-3 py-2">
      <span
        className="w-2.5 h-2.5 rounded-full shrink-0"
        style={{ backgroundColor: buyingClubColor }}
      />
      <div className="min-w-0">
        <span className="font-bold text-slate-200 block truncate">{bid.buyingClubName}</span>
        <span className="text-xs text-slate-400 font-mono">
          {bid.buyingClubTier === 1 ? 'Premier League' : bid.buyingClubTier === 2 ? 'Championship' : 'League One'}
        </span>
      </div>
    </div>

    <div className="grid grid-cols-3 gap-2 text-xs font-mono pt-1 border-t border-white/5">
      <div>
        <span className="text-slate-400 block">Val / Ask</span>
        <span className="text-slate-200 font-semibold">£{(currentValue / 1000000).toFixed(2)}M</span>
      </div>
      <div>
        <span className="text-slate-400 block">Asking</span>
        <span className="text-slate-300">£{(bid.askingPrice / 1000000).toFixed(2)}M</span>
      </div>
      <div className="text-right">
        <span className="text-slate-400 block">Offered</span>
        <span className="text-emerald-400 font-extrabold text-sm">£{(bid.offeredFee / 1000000).toFixed(2)}M</span>
      </div>
    </div>

    <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-white/5">
      <button
        type="button"
        onClick={() => onReview(bid)}
        className="flex-1 min-h-11 px-3 py-2 text-xs font-semibold bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-slate-200 hover:text-white transition-all cursor-pointer flex items-center justify-center gap-1.5 active:scale-95"
      >
        <Eye className="w-3.5 h-3.5" />
        <span>Review</span>
      </button>

      {bid.status === 'pending' && (
        <>
          <button
            type="button"
            onClick={() => onAccept(bid.id)}
            className="flex-1 min-h-11 px-3 py-2 text-xs font-bold bg-emerald-500 hover:bg-emerald-400 text-white rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5 shadow-sm active:scale-95"
          >
            <Check className="w-3.5 h-3.5" />
            <span>Accept</span>
          </button>

          <button
            type="button"
            onClick={() => onReject(bid.id)}
            className="flex-1 min-h-11 px-3 py-2 text-xs font-semibold bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 text-rose-300 rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5 active:scale-95"
          >
            <X className="w-3.5 h-3.5" />
            <span>Reject</span>
          </button>
        </>
      )}
    </div>
  </div>
));
IncomingBidMobileCard.displayName = 'IncomingBidMobileCard';

const IncomingBidTableRow = React.memo<BidItemProps>(({
  bid,
  buyingClubColor,
  currentValue,
  onReview,
  onAccept,
  onReject,
}) => (
  <tr className="group hover:bg-white/5 transition-colors">
    <td className="sticky left-0 z-10 bg-[#111827] group-hover:bg-[#192231] py-3.5 px-4 border-r border-white/5">
      <span className="font-bold text-white block whitespace-nowrap">{bid.playerName}</span>
      <span className="text-xs sm:text-[10px] text-slate-400 font-mono whitespace-nowrap">
        Age {bid.playerAge} · Current Val: £{(currentValue / 1000000).toFixed(2)}M
      </span>
    </td>

    <td className="py-3.5 px-2 text-center font-mono">
      <span className="px-2 py-0.5 rounded text-xs sm:text-[10px] bg-slate-800 text-slate-200 font-bold">
        {bid.playerPos}
      </span>
    </td>

    <td className="hidden lg:table-cell py-3.5 px-2 text-center font-mono font-bold text-amber-400">
      {bid.playerOverall}
    </td>

    <td className="py-3.5 px-4 whitespace-nowrap">
      <div className="flex items-center gap-2">
        <span
          className="w-3 h-3 rounded-full shrink-0"
          style={{ backgroundColor: buyingClubColor }}
        />
        <div>
          <span className="font-bold text-slate-200 block">{bid.buyingClubName}</span>
          <span className="text-xs sm:text-[10px] text-slate-500 font-mono uppercase">
            {bid.buyingClubTier === 1 ? 'Premier League' : bid.buyingClubTier === 2 ? 'Championship' : 'League One'}
          </span>
        </div>
      </div>
    </td>

    <td className="hidden lg:table-cell py-3.5 px-3 text-right font-mono text-slate-400">
      £{(bid.askingPrice / 1000000).toFixed(2)}M
    </td>

    <td className="py-3.5 px-3 text-right font-mono font-extrabold text-sm text-emerald-400 whitespace-nowrap">
      £{(bid.offeredFee / 1000000).toFixed(2)}M
    </td>

    <td className="py-3.5 px-2 text-center font-mono">
      <span className={`px-2 py-0.5 rounded text-xs sm:text-[10px] uppercase font-bold ${
        bid.status === 'accepted' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' :
        bid.status === 'rejected' ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30' :
        'bg-amber-400/20 text-amber-300 border border-amber-400/30'
      }`}>
        {bid.status}
      </span>
    </td>

    <td className="py-3.5 px-4 text-right">
      <div className="flex items-center justify-end gap-1.5">
        <button
          onClick={() => onReview(bid)}
          className="px-2.5 py-1 min-h-11 lg:min-h-0 text-xs sm:text-[11px] font-semibold bg-white/5 hover:bg-white/10 border border-white/10 rounded text-slate-200 hover:text-white transition-all cursor-pointer flex items-center gap-1 active:scale-95"
        >
          <Eye className="w-3 h-3" />
          <span>Review</span>
        </button>

        {bid.status === 'pending' && (
          <>
            <button
              onClick={() => onAccept(bid.id)}
              className="px-2.5 py-1 min-h-11 lg:min-h-0 text-xs sm:text-[11px] font-bold bg-emerald-500 hover:bg-emerald-400 text-white rounded transition-all cursor-pointer flex items-center gap-1 shadow-sm active:scale-95"
            >
              <Check className="w-3 h-3" />
              <span>Accept</span>
            </button>

            <button
              onClick={() => onReject(bid.id)}
              className="px-2.5 py-1 min-h-11 lg:min-h-0 text-xs sm:text-[11px] font-semibold bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 text-rose-300 rounded transition-all cursor-pointer flex items-center gap-1 active:scale-95"
            >
              <X className="w-3 h-3" />
              <span>Reject</span>
            </button>
          </>
        )}
      </div>
    </td>
  </tr>
));
IncomingBidTableRow.displayName = 'IncomingBidTableRow';

interface HistoryItemProps {
  tr: TransferRecord;
  fromClubName: string | null;
  fromClubColor: string | null;
  toClubName: string | null;
  toClubColor: string | null;
  isFromMyClub: boolean;
  isToMyClub: boolean;
  managerName?: string;
}

const getTypeBadgeInfo = (type: TransferRecord['type']) => {
  switch (type) {
    case 'signing':
      return { label: 'Signing', className: 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' };
    case 'sale':
      return { label: 'Sale', className: 'bg-blue-500/20 text-blue-300 border border-blue-500/30' };
    case 'release':
      return { label: 'Release', className: 'bg-rose-500/20 text-rose-300 border border-rose-500/30' };
    case 'renewal':
      return { label: 'Renewal', className: 'bg-amber-400/20 text-amber-300 border border-amber-400/30' };
    case 'promotion':
      return { label: 'Promotion', className: 'bg-purple-500/20 text-purple-300 border border-purple-500/30' };
    default:
      return { label: 'Deal', className: 'bg-slate-800 text-slate-300 border border-white/10' };
  }
};

const getInitiatorLabel = (initiatedBy: TransferRecord['initiatedBy'], managerName?: string) => {
  if (initiatedBy === 'manager') {
    return `Initiated by: Head Coach${managerName ? ` (${managerName})` : ''}`;
  }
  if (initiatedBy === 'shared') {
    return 'Initiated by: Agreed together';
  }
  if (initiatedBy === 'ai') {
    return 'Initiated by: Rival Club';
  }
  return 'Initiated by: You';
};

const formatFromLabel = (tr: TransferRecord, fromClubName: string | null) => {
  if (fromClubName) return fromClubName;
  return tr.type === 'promotion' ? 'Academy' : 'Free Agent';
};

const formatToLabel = (tr: TransferRecord, toClubName: string | null) => {
  if (toClubName) return toClubName;
  return tr.type === 'release' ? 'Released' : 'Club';
};

const TransferHistoryMobileCard = React.memo<HistoryItemProps>(({
  tr,
  fromClubName,
  toClubName,
  isFromMyClub,
  isToMyClub,
  managerName,
}) => {
  const typeBadge = getTypeBadgeInfo(tr.type);
  const fromLabel = formatFromLabel(tr, fromClubName);
  const toLabel = formatToLabel(tr, toClubName);

  return (
    <div
      className={`rounded-xl border p-3.5 space-y-2.5 ${
        isToMyClub
          ? 'bg-emerald-500/5 border-emerald-500/25'
          : isFromMyClub
            ? 'bg-blue-500/5 border-blue-500/25'
            : 'bg-[#111827] border-white/10'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-bold text-sm text-white truncate">{tr.playerName}</span>
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${typeBadge.className}`}>
              {typeBadge.label}
            </span>
          </div>
          <span className="text-xs font-mono text-slate-400 block mt-0.5">
            {tr.position} · Age {tr.age} · OVR {tr.overall} · {tr.season}/{tr.season + 1} · Wk {tr.week}
          </span>
        </div>
        <span className="font-mono font-extrabold text-xs shrink-0">
          {tr.fee > 0 ? (
            <span className={tr.type === 'release' ? 'text-rose-400' : 'text-emerald-400'}>
              £{(tr.fee / 1000000).toFixed(2)}M{tr.type === 'release' ? ' sev.' : ''}
            </span>
          ) : (
            <span className="text-slate-400 font-normal">Free</span>
          )}
        </span>
      </div>

      <div className="flex items-center gap-1.5 text-xs pt-2 border-t border-white/5">
        <span className="text-slate-300 truncate">{fromLabel}</span>
        <ArrowRight className="w-3.5 h-3.5 text-slate-500 shrink-0" />
        <span className="text-white font-semibold truncate">{toLabel}</span>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono text-slate-400 pt-1">
        <span>
          £{(tr.wage / 1000).toFixed(0)}k/wk · {tr.contractYears} yrs
        </span>
        <span className={
          tr.initiatedBy === 'manager'
            ? 'text-amber-300'
            : tr.initiatedBy === 'shared'
              ? 'text-cyan-300'
              : tr.initiatedBy === 'ai'
                ? 'text-slate-400'
                : 'text-slate-300'
        }>
          {getInitiatorLabel(tr.initiatedBy, managerName)}
        </span>
      </div>
    </div>
  );
});
TransferHistoryMobileCard.displayName = 'TransferHistoryMobileCard';

const TransferHistoryTableRow = React.memo<HistoryItemProps>(({
  tr,
  fromClubName,
  fromClubColor,
  toClubName,
  toClubColor,
  isFromMyClub,
  isToMyClub,
  managerName,
}) => {
  const typeBadge = getTypeBadgeInfo(tr.type);
  const fromLabel = formatFromLabel(tr, fromClubName);
  const toLabel = formatToLabel(tr, toClubName);

  return (
    <tr
      className={`group transition-colors ${
        isToMyClub
          ? 'bg-emerald-500/5 hover:bg-emerald-500/10'
          : isFromMyClub
            ? 'bg-blue-500/5 hover:bg-blue-500/10'
            : 'hover:bg-white/[0.02]'
      }`}
    >
      <td className="py-3 px-4 font-mono text-slate-400 text-xs sm:text-[11px] whitespace-nowrap">
        <span>{tr.season}/{tr.season + 1}</span>
        <span className="text-slate-500 ml-1.5">Wk {tr.week}</span>
      </td>

      <td className="py-3 px-3 text-center whitespace-nowrap">
        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${typeBadge.className}`}>
          {typeBadge.label}
        </span>
      </td>

      <td className={`sticky left-0 z-10 py-3 px-4 border-r border-white/5 ${
        isToMyClub ? 'bg-[#101e23]' : isFromMyClub ? 'bg-[#101b2c]' : 'bg-[#111827] group-hover:bg-[#192231]'
      }`}>
        <span className="font-bold text-white block whitespace-nowrap">{tr.playerName}</span>
        <span className="text-[11px] text-slate-400 font-mono whitespace-nowrap">
          {tr.position} · Age {tr.age} · OVR {tr.overall}
        </span>
      </td>

      <td className="py-3 px-4 whitespace-nowrap">
        {fromClubName ? (
          <div className="flex items-center gap-2">
            <span
              className="w-2.5 h-2.5 rounded-full shrink-0"
              style={{ backgroundColor: fromClubColor || '#64748b' }}
            />
            <span className={`font-medium ${isFromMyClub ? 'text-amber-400 font-bold' : 'text-slate-300'}`}>
              {fromLabel}
            </span>
          </div>
        ) : (
          <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 text-[10px] font-mono">
            {fromLabel}
          </span>
        )}
      </td>

      <td className="py-3 px-2 text-center text-slate-500">
        <ArrowRight className="w-3.5 h-3.5 mx-auto" />
      </td>

      <td className="py-3 px-4 whitespace-nowrap">
        {toClubName ? (
          <div className="flex items-center gap-2">
            <span
              className="w-2.5 h-2.5 rounded-full shrink-0"
              style={{ backgroundColor: toClubColor || '#64748b' }}
            />
            <span className={`font-medium ${isToMyClub ? 'text-amber-400 font-bold' : 'text-slate-300'}`}>
              {toLabel}
            </span>
          </div>
        ) : (
          <span className="px-2 py-0.5 rounded bg-rose-500/15 text-rose-300 text-[10px] font-mono">
            {toLabel}
          </span>
        )}
      </td>

      <td className="py-3 px-4 text-right font-mono font-bold whitespace-nowrap">
        {tr.fee > 0 ? (
          <span className={tr.type === 'release' ? 'text-rose-400' : 'text-emerald-400'}>
            £{(tr.fee / 1000000).toFixed(2)}M
          </span>
        ) : (
          <span className="text-slate-400 font-normal">
            Free
          </span>
        )}
        <span className="block text-[10px] text-slate-400 font-normal">
          £{(tr.wage / 1000).toFixed(0)}k/wk · {tr.contractYears}y
        </span>
      </td>

      <td className="hidden lg:table-cell py-3 px-4 whitespace-nowrap text-[11px] font-mono">
        <span className={
          tr.initiatedBy === 'manager'
            ? 'text-amber-300'
            : tr.initiatedBy === 'shared'
              ? 'text-cyan-300'
              : tr.initiatedBy === 'ai'
                ? 'text-slate-400'
                : 'text-slate-300'
        }>
          {getInitiatorLabel(tr.initiatedBy, managerName)}
        </span>
      </td>
    </tr>
  );
});
TransferHistoryTableRow.displayName = 'TransferHistoryTableRow';

export const TransfersView: React.FC<TransfersViewProps> = ({
  currentClub,
  allClubs,
  freeAgents,
  director,
  owner,
  manager,
  delegation,
  transferHistory = [],
  transferProposals = [],
  incomingBids = [],
  seasonYear = 2026,
  currentWeek = 1,
  onCompleteTransfer,
  onApproveProposal,
  onRejectProposal,
  onAcceptBid,
  onRejectBid,
  onOfferPlayerToClubs,
}) => {
  // Main view tab: 'market' | 'history' | 'proposals'
  const [activeTab, setActiveTab] = useState<'market' | 'history' | 'proposals'>('market');

  // Proposals & Incoming Bids State
  const [proposalError, setProposalError] = useState<string | null>(null);
  const [bidsFilter, setBidsFilter] = useState<'all' | 'pending' | 'accepted' | 'rejected'>('all');
  const [selectedBidForReview, setSelectedBidForReview] = useState<IncomingBid | null>(null);
  const [pendingBidConfirm, setPendingBidConfirm] = useState<{
    bid: IncomingBid;
    check: DelegationDecisionCheck;
  } | null>(null);
  const [showOfferPlayerModal, setShowOfferPlayerModal] = useState<boolean>(false);
  const [playerToOffer, setPlayerToOffer] = useState<Player | null>(null);
  const [offerPriceInput, setOfferPriceInput] = useState<number>(1000000);

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

  // Mobile card expansion & filter bottom-sheet state
  const [expandedMarketId, setExpandedMarketId] = useState<string | null>(null);
  const [showFilterSheet, setShowFilterSheet] = useState<boolean>(false);
  const [draftSearch, setDraftSearch] = useState('');
  const [draftTier, setDraftTier] = useState<number | 'FA' | 'all'>('all');
  const [draftPos, setDraftPos] = useState<PlayerPosition | 'ALL'>('ALL');
  const [draftMinAge, setDraftMinAge] = useState<number>(16);
  const [draftMaxAge, setDraftMaxAge] = useState<number>(40);
  const [draftMinOvr, setDraftMinOvr] = useState<number>(40);
  const [draftMaxOvr, setDraftMaxOvr] = useState<number>(99);
  const [draftMomentum, setDraftMomentum] = useState<GrowthMomentum | 'ALL'>('ALL');
  const [draftAffordableFee, setDraftAffordableFee] = useState<boolean>(false);
  const [draftAffordableWage, setDraftAffordableWage] = useState<boolean>(false);

  // Sorting state (default: highest overall first)
  const [sortField, setSortField] = useState<SortField>('overall');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  // Progressive Show More count (starts at 30, resets on filter/sort changes)
  const [visibleMarketCount, setVisibleMarketCount] = useState<number>(INITIAL_MARKET_VISIBLE_COUNT);

  // Target player for negotiation
  const [targetPlayer, setTargetPlayer] = useState<{ player: Player; club: Club | null } | null>(null);

  // Negotiation state
  const [offerFee, setOfferFee] = useState<number>(0);
  const [offerWage, setOfferWage] = useState<number>(0);
  const [offerYears, setOfferYears] = useState<number>(3);
  const [negotiationStep, setNegotiationStep] = useState<'BID' | 'TERMS' | 'OWNER_CHECK' | 'SUCCESS'>('BID');
  const [signingConfirmCheck, setSigningConfirmCheck] = useState<DelegationDecisionCheck | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  // Transfer History filter states
  const [historyFilter, setHistoryFilter] = useState<'all' | 'in' | 'out'>('all');
  const [historyTypeFilter, setHistoryTypeFilter] = useState<'all' | TransferRecord['type']>('all');
  const [historyInitiatorFilter, setHistoryInitiatorFilter] = useState<'all' | 'director' | 'manager'>('all');
  const [historySeasonFilter, setHistorySeasonFilter] = useState<number | 'all'>('all');
  const [historySearchQuery, setHistorySearchQuery] = useState('');
  const [historyPage, setHistoryPage] = useState<number>(1);
  const historyPageSize = 25;

  // Reset progressive paging count whenever market filters or sort change
  useEffect(() => {
    setVisibleMarketCount(INITIAL_MARKET_VISIBLE_COUNT);
  }, [
    searchQuery,
    filterTier,
    filterPos,
    minAge,
    maxAge,
    minOvr,
    maxOvr,
    filterMomentum,
    onlyAffordableFee,
    onlyAffordableWage,
    sortField,
    sortDirection,
  ]);

  const clubsById = useMemo(() => new Map(allClubs.map(c => [c.id, c])), [allClubs]);
  const squadPlayerById = useMemo(() => new Map(currentClub.squad.map(p => [p.id, p])), [currentClub.squad]);

  const pendingProposals = useMemo(
    () => (transferProposals || []).filter(p => p.status === 'pending'),
    [transferProposals]
  );

  const resolvedProposals = useMemo(
    () => (transferProposals || []).filter(p => p.status !== 'pending').slice(0, 10),
    [transferProposals]
  );

  // Filtered Transfer History (newest first)
  const filteredTransferHistory = useMemo(() => {
    const q = historySearchQuery.trim().toLowerCase();
    const list = (transferHistory || []).filter(tr => {
      if (historyFilter === 'in' && tr.toClubId !== currentClub.id) return false;
      if (historyFilter === 'out' && tr.fromClubId !== currentClub.id) return false;
      if (historyTypeFilter !== 'all' && tr.type !== historyTypeFilter) return false;
      if (historyInitiatorFilter === 'director' && tr.initiatedBy !== 'director') return false;
      if (historyInitiatorFilter === 'manager' && tr.initiatedBy !== 'manager' && tr.initiatedBy !== 'shared') return false;
      if (historySeasonFilter !== 'all' && tr.season !== historySeasonFilter) return false;

      if (q) {
        const fromClub = tr.fromClubId ? clubsById.get(tr.fromClubId) : undefined;
        const toClub = tr.toClubId ? clubsById.get(tr.toClubId) : undefined;
        const matchPlayer = tr.playerName.toLowerCase().includes(q);
        const matchFrom =
          fromClub?.name.toLowerCase().includes(q) ||
          (!tr.fromClubId && ('free agent'.includes(q) || 'academy'.includes(q)));
        const matchTo = toClub?.name.toLowerCase().includes(q) || (!tr.toClubId && 'released'.includes(q));
        if (!matchPlayer && !matchFrom && !matchTo) return false;
      }

      return true;
    });

    return [...list].sort((a, b) => {
      if (b.season !== a.season) return b.season - a.season;
      return b.week - a.week;
    });
  }, [
    transferHistory,
    historyFilter,
    historyTypeFilter,
    historyInitiatorFilter,
    historySeasonFilter,
    historySearchQuery,
    currentClub.id,
    clubsById,
  ]);

  const paginatedTransferHistory = useMemo(() => {
    return filteredTransferHistory.slice((historyPage - 1) * historyPageSize, historyPage * historyPageSize);
  }, [filteredTransferHistory, historyPage]);

  // Available seasons in transfer history
  const availableSeasons = useMemo(() => {
    const seasons = new Set<number>((transferHistory || []).map(tr => tr.season));
    seasons.add(seasonYear);
    return Array.from(seasons).sort((a, b) => b - a);
  }, [transferHistory, seasonYear]);

  // Aggregate stats for Transfer History (scoped by selected season)
  const historyStats = useMemo(() => {
    const list = (transferHistory || []).filter(
      tr => historySeasonFilter === 'all' || tr.season === historySeasonFilter
    );
    const clubIn = list.filter(tr => tr.toClubId === currentClub.id && tr.type === 'signing');
    const clubOut = list.filter(tr => tr.fromClubId === currentClub.id && tr.type === 'sale');
    const totalSpent = clubIn.reduce((sum, tr) => sum + tr.fee, 0);
    const totalReceived = clubOut.reduce((sum, tr) => sum + tr.fee, 0);
    return {
      totalDeals: list.length,
      clubInCount: list.filter(tr => tr.toClubId === currentClub.id).length,
      clubOutCount: list.filter(tr => tr.fromClubId === currentClub.id).length,
      totalSpent,
      totalReceived,
      netSpend: totalSpent - totalReceived,
    };
  }, [transferHistory, historySeasonFilter, currentClub.id]);

  // Aggregate Incoming Bids summary & filtered slice
  const bidsSummary = useMemo(() => {
    let pendingCount = 0;
    let acceptedCount = 0;
    let rejectedCount = 0;
    let pendingFeeInflow = 0;
    let pendingWageFreed = 0;
    const filtered: IncomingBid[] = [];

    for (const b of incomingBids) {
      if (b.status === 'pending') {
        pendingCount++;
        pendingFeeInflow += b.offeredFee;
        pendingWageFreed += squadPlayerById.get(b.playerId)?.wage || 0;
      } else if (b.status === 'accepted') {
        acceptedCount++;
      } else if (b.status === 'rejected') {
        rejectedCount++;
      }
      if (bidsFilter === 'all' || b.status === bidsFilter) {
        filtered.push(b);
      }
    }

    return {
      pendingCount,
      acceptedCount,
      rejectedCount,
      pendingFeeInflow,
      pendingWageFreed,
      filtered,
    };
  }, [incomingBids, bidsFilter, squadPlayerById]);

  const currentWages = useMemo(() => currentClub.squad.reduce((a, b) => a + b.wage, 0), [currentClub.squad]);
  const wageSpaceRemaining = useMemo(() => Math.max(0, currentClub.wageBudget - currentWages), [currentClub.wageBudget, currentWages]);

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
    setVisibleMarketCount(INITIAL_MARKET_VISIBLE_COUNT);
  };

  const handleOpenFilterSheet = () => {
    sounds.playClick();
    setDraftSearch(searchQuery);
    setDraftTier(filterTier);
    setDraftPos(filterPos);
    setDraftMinAge(minAge);
    setDraftMaxAge(maxAge);
    setDraftMinOvr(minOvr);
    setDraftMaxOvr(maxOvr);
    setDraftMomentum(filterMomentum);
    setDraftAffordableFee(onlyAffordableFee);
    setDraftAffordableWage(onlyAffordableWage);
    setShowFilterSheet(true);
  };

  const handleApplyFilterSheet = () => {
    sounds.playClick();
    setSearchQuery(draftSearch);
    setFilterTier(draftTier);
    setFilterPos(draftPos);
    setMinAge(draftMinAge);
    setMaxAge(draftMaxAge);
    setMinOvr(draftMinOvr);
    setMaxOvr(draftMaxOvr);
    setFilterMomentum(draftMomentum);
    setOnlyAffordableFee(draftAffordableFee);
    setOnlyAffordableWage(draftAffordableWage);
    setVisibleMarketCount(INITIAL_MARKET_VISIBLE_COUNT);
    setShowFilterSheet(false);
  };

  const handleResetFilterSheet = () => {
    setDraftSearch('');
    setDraftTier('all');
    setDraftPos('ALL');
    setDraftMinAge(16);
    setDraftMaxAge(40);
    setDraftMinOvr(40);
    setDraftMaxOvr(99);
    setDraftMomentum('ALL');
    setDraftAffordableFee(false);
    setDraftAffordableWage(false);
    handleResetFilters();
    setShowFilterSheet(false);
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
        case 'position': {
          const posDiff = POSITION_ORDER[a.player.position] - POSITION_ORDER[b.player.position];
          if (posDiff !== 0) {
            return sortDirection === 'desc' ? -posDiff : posDiff;
          }
          if (b.player.overall !== a.player.overall) {
            return b.player.overall - a.player.overall;
          }
          return a.player.name.localeCompare(b.player.name);
        }
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

  // Progressive Market slice
  const totalItems = filteredAndSortedList.length;
  const displayedMarketList = useMemo(() => {
    return filteredAndSortedList.slice(0, visibleMarketCount);
  }, [filteredAndSortedList, visibleMarketCount]);
  const hasMoreMarket = displayedMarketList.length < totalItems;

  // Handle column header clicks for instant sorting
  const handleSortToggle = (field: SortField) => {
    sounds.playClick();
    if (sortField === field) {
      // Toggle direction
      setSortDirection(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      // New field - default to most natural direction
      setSortField(field);
      // For position, age, or name, ascending is natural; for ratings/value/wage/momentum, descending is natural
      if (field === 'position' || field === 'age' || field === 'name') {
        setSortDirection('asc');
      } else {
        setSortDirection('desc');
      }
    }
    setVisibleMarketCount(INITIAL_MARKET_VISIBLE_COUNT);
  };

  const handleToggleExpandMarket = useCallback((playerId: string) => {
    sounds.playClick();
    setExpandedMarketId(prev => (prev === playerId ? null : playerId));
  }, []);

  const handleOpenNegotiate = useCallback((item: { player: Player; club: Club | null }) => {
    sounds.playClick();
    setTargetPlayer(item);
    setOfferFee(item.club ? Math.round(item.player.value * 1.05) : 0);
    setOfferWage(Math.round(item.player.wage * 1.15) || 25000);
    setOfferYears(3);
    setNegotiationStep(item.club ? 'BID' : 'TERMS');
    setSigningConfirmCheck(null);
    setFeedback(null);
  }, []);

  const handleReviewBid = useCallback((bid: IncomingBid) => {
    sounds.playClick();
    setSelectedBidForReview(bid);
  }, []);

  const handleAcceptBidAction = useCallback((bidId: string) => {
    const bid = incomingBids.find(b => b.id === bidId);
    const player = bid ? squadPlayerById.get(bid.playerId) : undefined;
    if (bid && player) {
      const check = evaluateDirectorSaleDelegation(currentClub, player, manager, delegation);
      if (check.requiresConfirm) {
        sounds.playClick();
        setPendingBidConfirm({ bid, check });
        return;
      }
      sounds.playSigningStamp();
      onAcceptBid?.(bidId, check.trustDelta);
      return;
    }
    sounds.playSigningStamp();
    onAcceptBid?.(bidId, 0);
  }, [incomingBids, squadPlayerById, currentClub, manager, delegation, onAcceptBid]);

  const handleRejectBidAction = useCallback((bidId: string) => {
    sounds.playCrisis();
    onRejectBid?.(bidId);
  }, [onRejectBid]);

  // Submit Bid to Selling Club (uses shared evaluateSigning rules for squad cap, budget, and selling club valuation)
  const handleClubBid = () => {
    if (!targetPlayer) return;
    sounds.playClick();

    const validation = evaluateSigning({
      player: targetPlayer.player,
      sellingClub: targetPlayer.club,
      buyingClub: currentClub,
      owner,
      fee: offerFee,
      wage: targetPlayer.player.wage, // temporary valid wage so only club-level steps run first
    });

    if (!validation.ok && (validation.failStage === 'squad_cap' || validation.failStage === 'budget' || validation.failStage === 'selling_club')) {
      setFeedback(validation.reason || 'Transfer bid rejected.');
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

    const validation = evaluateSigning({
      player: targetPlayer.player,
      sellingClub: targetPlayer.club,
      buyingClub: currentClub,
      owner,
      fee: offerFee,
      wage: offerWage,
    });

    if (!validation.ok && validation.failStage !== 'owner_veto') {
      setFeedback(validation.reason || 'Personal terms could not be agreed.');
      return;
    }

    setSigningConfirmCheck(null);
    setNegotiationStep('OWNER_CHECK');
  };

  const executeCompleteSigning = (trustDelta: number) => {
    if (!targetPlayer) return;

    const result = completeSigning({
      player: targetPlayer.player,
      sellingClub: targetPlayer.club,
      buyingClub: currentClub,
      clubs: allClubs,
      freeAgents,
      director,
      owner,
      manager,
      fee: offerFee,
      wage: offerWage,
      contractYears: offerYears,
      season: seasonYear,
      week: currentWeek,
      initiatedBy: 'director',
      trustDelta,
    });

    onCompleteTransfer(
      result.clubs,
      result.freeAgents,
      result.director,
      result.owner,
      result.manager,
      result.record
    );

    setSigningConfirmCheck(null);
    setNegotiationStep('SUCCESS');
    sounds.playFanfare();
  };

  // Final Owner Approval & Delegation Check via shared transferService
  const handleFinalizeSigning = () => {
    if (!targetPlayer) return;

    const validation = evaluateSigning({
      player: targetPlayer.player,
      sellingClub: targetPlayer.club,
      buyingClub: currentClub,
      owner,
      fee: offerFee,
      wage: offerWage,
    });

    if (!validation.ok) {
      sounds.playCrisis();
      setFeedback(validation.reason || 'Transfer blocked by boardroom checks.');
      return;
    }

    const delegationCheck = evaluateDirectorSigningDelegation(
      currentClub,
      targetPlayer.player,
      manager,
      delegation
    );

    if (delegationCheck.requiresConfirm) {
      sounds.playClick();
      setSigningConfirmCheck(delegationCheck);
      return;
    }

    sounds.playSigningStamp();
    executeCompleteSigning(delegationCheck.trustDelta);
  };

  return (
    <div className="space-y-6">
      
      {/* Header & Financial War Chest Overview */}
      <div className="bg-[#111827] border border-white/10 rounded-2xl p-4 sm:p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold text-amber-400 uppercase tracking-wider mb-1">
              <DollarSign className="w-4 h-4" />
              <span>Global Scouting & Transfer Market</span>
            </div>
            <h1 className="text-2xl lg:text-3xl font-extrabold text-white tracking-tight">
              Transfer Market & Negotiations
            </h1>
            <p className="text-slate-400 text-xs mt-1 max-w-[75ch]">
              Scout across the Premier League, Championship, League One, and Free Agents. Filter and sort by age, rating, potential, value, and wage.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="px-4 py-2 bg-slate-900 border border-white/10 rounded-xl text-right">
              <span className="text-xs sm:text-[10px] text-slate-400 uppercase block">War Chest</span>
              <span className="text-lg font-bold font-mono text-amber-400 tabular-nums">
                £{(currentClub.transferBudget / 1000000).toFixed(2)}M
              </span>
            </div>
            <div className="px-4 py-2 bg-slate-900 border border-white/10 rounded-xl text-right">
              <span className="text-xs sm:text-[10px] text-slate-400 uppercase block">Wage Space</span>
              <span className="text-lg font-bold font-mono text-emerald-400 tabular-nums">
                £{(wageSpaceRemaining / 1000).toFixed(0)}k/wk
              </span>
            </div>
          </div>
        </div>
      </div>

      {feedback && (
        <div className="p-4 rounded-xl bg-slate-900 border border-amber-400/30 text-xs text-amber-300 flex items-center justify-between gap-2">
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

      {/* Main View Mode Selector: Market vs History vs Proposals */}
      <div className="flex flex-wrap items-center gap-2 border-b border-white/10 pb-3">
        <button
          onClick={() => {
            sounds.playClick();
            setActiveTab('market');
          }}
          className={`px-4 py-2.5 min-h-11 lg:min-h-0 text-xs font-bold rounded-xl transition-all flex items-center gap-2 cursor-pointer whitespace-nowrap ${
            activeTab === 'market'
              ? 'bg-amber-400 text-slate-950 shadow-md shadow-amber-400/20 font-extrabold'
              : 'bg-slate-900 text-slate-400 hover:text-white border border-white/5'
          }`}
        >
          <Search className="w-3.5 h-3.5" />
          <span>Market ({allAvailablePlayers.length})</span>
        </button>

        <button
          onClick={() => {
            sounds.playClick();
            setActiveTab('history');
          }}
          className={`px-4 py-2.5 min-h-11 lg:min-h-0 text-xs font-bold rounded-xl transition-all flex items-center gap-2 cursor-pointer whitespace-nowrap ${
            activeTab === 'history'
              ? 'bg-amber-400 text-slate-950 shadow-md shadow-amber-400/20 font-extrabold'
              : 'bg-slate-900 text-slate-400 hover:text-white border border-white/5'
          }`}
        >
          <History className="w-3.5 h-3.5" />
          <span>History ({transferHistory.length})</span>
          {historyStats.clubInCount + historyStats.clubOutCount > 0 && (
            <span className={`text-xs sm:text-[10px] px-1.5 py-0.5 rounded-full font-mono ${
              activeTab === 'history' ? 'bg-slate-950/20 text-slate-950' : 'bg-amber-400/20 text-amber-300'
            }`}>
              {historyStats.clubInCount + historyStats.clubOutCount} club
            </span>
          )}
        </button>

        <button
          onClick={() => {
            sounds.playClick();
            setActiveTab('proposals');
          }}
          className={`px-4 py-2.5 min-h-11 lg:min-h-0 text-xs font-bold rounded-xl transition-all flex items-center gap-2 cursor-pointer whitespace-nowrap ${
            activeTab === 'proposals'
              ? 'bg-amber-400 text-slate-950 shadow-md shadow-amber-400/20 font-extrabold'
              : 'bg-slate-900 text-slate-400 hover:text-white border border-white/5'
          }`}
        >
          <ClipboardCheck className="w-3.5 h-3.5" />
          <span>Proposals</span>
          {pendingProposals.length > 0 && (
            <span className={`text-xs sm:text-[10px] px-1.5 py-0.5 rounded-full font-mono font-bold ${
              activeTab === 'proposals' ? 'bg-slate-950 text-amber-400' : 'bg-amber-400 text-slate-950'
            }`}>
              {pendingProposals.length}
            </span>
          )}
          {bidsSummary.pendingCount > 0 && (
            <span className={`text-xs sm:text-[10px] px-1.5 py-0.5 rounded-full font-mono font-bold ${
              activeTab === 'proposals' ? 'bg-slate-950/20 text-slate-950' : 'bg-emerald-400/20 text-emerald-300'
            }`}>
              {bidsSummary.pendingCount} bids
            </span>
          )}
        </button>
      </div>

      {activeTab === 'market' && (
        <>
          {/* Mobile & Tablet (< lg): Collapsed Filters Button + Active Count */}
          <div className="lg:hidden bg-[#111827] border border-white/10 rounded-xl p-3 space-y-3">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleOpenFilterSheet}
                className={`flex-1 min-h-11 px-4 py-2.5 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 cursor-pointer transition-all active:scale-95 ${
                  activeFiltersCount > 0
                    ? 'bg-amber-400/15 border-amber-400/40 text-amber-300'
                    : 'bg-slate-900 border-white/10 text-slate-200 hover:text-white'
                }`}
              >
                <SlidersHorizontal className="w-4 h-4" />
                <span>Filters</span>
                {activeFiltersCount > 0 && (
                  <span className="w-5 h-5 rounded-full bg-amber-400 text-slate-950 font-bold text-xs flex items-center justify-center">
                    {activeFiltersCount}
                  </span>
                )}
              </button>

              {activeFiltersCount > 0 && (
                <button
                  type="button"
                  onClick={handleResetFilters}
                  aria-label="Reset all filters"
                  className="min-h-11 min-w-11 px-3 py-2 bg-slate-900 hover:bg-slate-800 border border-white/10 text-slate-300 hover:text-white rounded-xl flex items-center justify-center gap-1.5 text-xs font-semibold cursor-pointer active:scale-95"
                >
                  <RotateCcw className="w-4 h-4" />
                  <span>Reset</span>
                </button>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
              <span>
                Found <strong className="text-white font-mono">{totalItems}</strong> targets
              </span>
              {totalItems > 0 && (
                <span className="text-slate-500 font-mono">
                  Showing 1–{displayedMarketList.length} of {totalItems}
                </span>
              )}
            </div>
          </div>

          {/* Desktop (lg+): Inline Filter and Search Controls Card */}
          <div className="hidden lg:block bg-[#111827] border border-white/10 rounded-xl p-4 space-y-4">
        
        {/* Top Controls Row: Search + Quick Selects + Sort + Toggle Filters */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
          
          {/* Search Input (4 cols) */}
          <div className="relative md:col-span-4 w-full">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="search"
              inputMode="search"
              placeholder="Search by player, club, or role..."
              value={searchQuery}
              onChange={e => {
                setSearchQuery(e.target.value);
                setVisibleMarketCount(INITIAL_MARKET_VISIBLE_COUNT);
              }}
              className="w-full min-h-11 lg:min-h-0 pl-9 pr-3.5 py-2 bg-slate-900/90 border border-white/10 rounded-lg text-base md:text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-400"
            />
          </div>

          {/* Division / Tier Filter (2 cols) */}
          <div className="md:col-span-2">
            <select
              value={filterTier}
              onChange={e => {
                const val = e.target.value;
                setFilterTier(val === 'all' ? 'all' : val === 'FA' ? 'FA' : Number(val));
                setVisibleMarketCount(INITIAL_MARKET_VISIBLE_COUNT);
              }}
              className="w-full min-h-11 lg:min-h-0 px-3 py-2 bg-slate-900 border border-white/10 rounded-lg text-base md:text-xs text-slate-200 focus:outline-none focus:border-amber-400"
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
                setVisibleMarketCount(INITIAL_MARKET_VISIBLE_COUNT);
              }}
              className="w-full min-h-11 lg:min-h-0 px-3 py-2 bg-slate-900 border border-white/10 rounded-lg text-base md:text-xs text-slate-200 focus:outline-none focus:border-amber-400"
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
                setVisibleMarketCount(INITIAL_MARKET_VISIBLE_COUNT);
              }}
              className="w-full min-h-11 lg:min-h-0 px-3 py-2 bg-slate-900 border border-amber-400/30 rounded-lg text-base md:text-xs text-amber-300 font-semibold focus:outline-none focus:border-amber-400"
            >
              <option value="overall_desc">OVR: High to Low</option>
              <option value="overall_asc">OVR: Low to High</option>
              <option value="position_asc">Position: GK to FWD</option>
              <option value="position_desc">Position: FWD to GK</option>
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
              className={`flex-1 min-h-11 lg:min-h-0 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
                showAdvancedFilters || activeFiltersCount > 0
                  ? 'bg-amber-400/15 border-amber-400/40 text-amber-300'
                  : 'bg-slate-900 border-white/10 text-slate-300 hover:text-white'
              }`}
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span>Filters</span>
              {activeFiltersCount > 0 && (
                <span className="w-5 h-5 sm:w-4 sm:h-4 rounded-full bg-amber-400 text-slate-950 font-bold text-xs sm:text-[10px] flex items-center justify-center">
                  {activeFiltersCount}
                </span>
              )}
            </button>

            {activeFiltersCount > 0 && (
              <button
                onClick={handleResetFilters}
                title="Reset all filters"
                aria-label="Reset all filters"
                className="p-2 min-h-11 min-w-11 lg:min-h-0 lg:min-w-0 flex items-center justify-center bg-slate-900 hover:bg-slate-800 border border-white/10 text-slate-400 hover:text-white rounded-lg transition-colors cursor-pointer"
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
                  <label className="text-xs sm:text-[10px] text-slate-400 block mb-0.5">Min Age</label>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={15}
                    max={maxAge}
                    value={minAge}
                    onChange={e => {
                      setMinAge(Math.max(15, Math.min(Number(e.target.value), maxAge)));
                      setVisibleMarketCount(INITIAL_MARKET_VISIBLE_COUNT);
                    }}
                    className="w-full min-h-11 lg:min-h-0 px-2 py-1 bg-slate-950 border border-white/10 rounded text-base md:text-xs text-white font-mono"
                  />
                </div>
                <div>
                  <label className="text-xs sm:text-[10px] text-slate-400 block mb-0.5">Max Age</label>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={minAge}
                    max={42}
                    value={maxAge}
                    onChange={e => {
                      setMaxAge(Math.min(42, Math.max(Number(e.target.value), minAge)));
                      setVisibleMarketCount(INITIAL_MARKET_VISIBLE_COUNT);
                    }}
                    className="w-full min-h-11 lg:min-h-0 px-2 py-1 bg-slate-950 border border-white/10 rounded text-base md:text-xs text-white font-mono"
                  />
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5 pt-1">
                <button
                  type="button"
                  onClick={() => { setMinAge(16); setMaxAge(21); setVisibleMarketCount(INITIAL_MARKET_VISIBLE_COUNT); }}
                  className="px-2.5 py-1 min-h-11 lg:min-h-0 text-xs sm:text-[10px] bg-slate-800 hover:bg-slate-700 text-slate-300 rounded cursor-pointer"
                >
                  U-21
                </button>
                <button
                  type="button"
                  onClick={() => { setMinAge(22); setMaxAge(28); setVisibleMarketCount(INITIAL_MARKET_VISIBLE_COUNT); }}
                  className="px-2.5 py-1 min-h-11 lg:min-h-0 text-xs sm:text-[10px] bg-slate-800 hover:bg-slate-700 text-slate-300 rounded cursor-pointer"
                >
                  Prime (22-28)
                </button>
                <button
                  type="button"
                  onClick={() => { setMinAge(29); setMaxAge(40); setVisibleMarketCount(INITIAL_MARKET_VISIBLE_COUNT); }}
                  className="px-2.5 py-1 min-h-11 lg:min-h-0 text-xs sm:text-[10px] bg-slate-800 hover:bg-slate-700 text-slate-300 rounded cursor-pointer"
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
                  <label className="text-xs sm:text-[10px] text-slate-400 block mb-0.5">Min OVR</label>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={40}
                    max={maxOvr}
                    value={minOvr}
                    onChange={e => {
                      setMinOvr(Math.max(40, Math.min(Number(e.target.value), maxOvr)));
                      setVisibleMarketCount(INITIAL_MARKET_VISIBLE_COUNT);
                    }}
                    className="w-full min-h-11 lg:min-h-0 px-2 py-1 bg-slate-950 border border-white/10 rounded text-base md:text-xs text-white font-mono"
                  />
                </div>
                <div>
                  <label className="text-xs sm:text-[10px] text-slate-400 block mb-0.5">Max OVR</label>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={minOvr}
                    max={99}
                    value={maxOvr}
                    onChange={e => {
                      setMaxOvr(Math.min(99, Math.max(Number(e.target.value), minOvr)));
                      setVisibleMarketCount(INITIAL_MARKET_VISIBLE_COUNT);
                    }}
                    className="w-full min-h-11 lg:min-h-0 px-2 py-1 bg-slate-950 border border-white/10 rounded text-base md:text-xs text-white font-mono"
                  />
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5 pt-1">
                <button
                  type="button"
                  onClick={() => { setMinOvr(70); setMaxOvr(99); setVisibleMarketCount(INITIAL_MARKET_VISIBLE_COUNT); }}
                  className="px-2.5 py-1 min-h-11 lg:min-h-0 text-xs sm:text-[10px] bg-slate-800 hover:bg-slate-700 text-slate-300 rounded cursor-pointer"
                >
                  70+ OVR
                </button>
                <button
                  type="button"
                  onClick={() => { setMinOvr(75); setMaxOvr(99); setVisibleMarketCount(INITIAL_MARKET_VISIBLE_COUNT); }}
                  className="px-2.5 py-1 min-h-11 lg:min-h-0 text-xs sm:text-[10px] bg-slate-800 hover:bg-slate-700 text-slate-300 rounded cursor-pointer"
                >
                  75+ OVR
                </button>
                <button
                  type="button"
                  onClick={() => { setMinOvr(80); setMaxOvr(99); setVisibleMarketCount(INITIAL_MARKET_VISIBLE_COUNT); }}
                  className="px-2.5 py-1 min-h-11 lg:min-h-0 text-xs sm:text-[10px] bg-slate-800 hover:bg-slate-700 text-slate-300 rounded cursor-pointer"
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
                  setVisibleMarketCount(INITIAL_MARKET_VISIBLE_COUNT);
                }}
                className="w-full min-h-11 lg:min-h-0 px-2.5 py-1.5 bg-slate-950 border border-white/10 rounded text-base md:text-xs text-slate-200 focus:outline-none focus:border-amber-400"
              >
                <option value="ALL">All Momentums</option>
                <option value="breakout">🚀 Breakout Prodigy</option>
                <option value="rapid">📈 Rapid Climber</option>
                <option value="prime">⭐ Peak Prime</option>
                <option value="steady">⚖️ Steady Growth</option>
                <option value="cooling">📉 Cooling Down</option>
              </select>
              <p className="text-xs sm:text-[10px] text-slate-500">
                Filter by trajectory to target high-resale prospects or battle-tested stars.
              </p>
            </div>

            {/* Affordability Quick Toggles */}
            <div className="bg-slate-900/60 p-3 rounded-lg border border-white/5 space-y-2">
              <span className="text-slate-300 font-semibold text-xs block">Budget Feasibility</span>
              <div className="space-y-1.5 pt-0.5">
                <label className="flex items-center gap-2.5 min-h-11 lg:min-h-0 text-xs text-slate-300 cursor-pointer select-none hover:text-white">
                  <input
                    type="checkbox"
                    checked={onlyAffordableFee}
                    onChange={e => {
                      setOnlyAffordableFee(e.target.checked);
                      setVisibleMarketCount(INITIAL_MARKET_VISIBLE_COUNT);
                    }}
                    className="w-4 h-4 sm:w-3.5 sm:h-3.5 rounded bg-slate-950 border-white/20 text-amber-400 focus:ring-0 focus:ring-offset-0 cursor-pointer"
                  />
                  <span>Within War Chest (£{(currentClub.transferBudget / 1000000).toFixed(1)}M)</span>
                </label>
                <label className="flex items-center gap-2.5 min-h-11 lg:min-h-0 text-xs text-slate-300 cursor-pointer select-none hover:text-white">
                  <input
                    type="checkbox"
                    checked={onlyAffordableWage}
                    onChange={e => {
                      setOnlyAffordableWage(e.target.checked);
                      setVisibleMarketCount(INITIAL_MARKET_VISIBLE_COUNT);
                    }}
                    className="w-4 h-4 sm:w-3.5 sm:h-3.5 rounded bg-slate-950 border-white/20 text-emerald-400 focus:ring-0 focus:ring-offset-0 cursor-pointer"
                  />
                  <span>Within Wage Space (£{(wageSpaceRemaining / 1000).toFixed(0)}k/wk)</span>
                </label>
              </div>
            </div>

          </div>
        )}

        {/* Results Counter & Active Filter Pills */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-xs">
          <div className="flex flex-wrap items-center gap-2 text-slate-400">
            <span>
              Found <strong className="text-white font-mono">{totalItems}</strong> targets matching criteria
            </span>
            {totalItems > 0 && (
              <span className="text-slate-500 font-mono text-xs sm:text-[11px]">
                (Showing 1–{displayedMarketList.length} of {totalItems})
              </span>
            )}
          </div>

          {/* Quick Active Filter Pills */}
          <div className="flex flex-wrap items-center gap-1.5">
            {filterTier !== 'all' && (
              <button
                type="button"
                onClick={() => { setFilterTier('all'); setVisibleMarketCount(INITIAL_MARKET_VISIBLE_COUNT); }}
                className="inline-flex items-center gap-1.5 px-3 py-1 min-h-11 lg:min-h-0 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs sm:text-[10px] border border-white/10 cursor-pointer"
              >
                <span>Tier: {filterTier === 'FA' ? 'Free Agents' : filterTier === 1 ? 'Premier League' : filterTier === 2 ? 'Championship' : 'League One'}</span>
                <span aria-hidden="true">×</span>
              </button>
            )}
            {filterPos !== 'ALL' && (
              <button
                type="button"
                onClick={() => { setFilterPos('ALL'); setVisibleMarketCount(INITIAL_MARKET_VISIBLE_COUNT); }}
                className="inline-flex items-center gap-1.5 px-3 py-1 min-h-11 lg:min-h-0 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs sm:text-[10px] border border-white/10 cursor-pointer"
              >
                <span>Pos: {filterPos}</span>
                <span aria-hidden="true">×</span>
              </button>
            )}
            {(minAge > 16 || maxAge < 40) && (
              <button
                type="button"
                onClick={() => { setMinAge(16); setMaxAge(40); setVisibleMarketCount(INITIAL_MARKET_VISIBLE_COUNT); }}
                className="inline-flex items-center gap-1.5 px-3 py-1 min-h-11 lg:min-h-0 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs sm:text-[10px] border border-white/10 cursor-pointer"
              >
                <span>Age: {minAge}–{maxAge}</span>
                <span aria-hidden="true">×</span>
              </button>
            )}
            {(minOvr > 40 || maxOvr < 99) && (
              <button
                type="button"
                onClick={() => { setMinOvr(40); setMaxOvr(99); setVisibleMarketCount(INITIAL_MARKET_VISIBLE_COUNT); }}
                className="inline-flex items-center gap-1.5 px-3 py-1 min-h-11 lg:min-h-0 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs sm:text-[10px] border border-white/10 cursor-pointer"
              >
                <span>OVR: {minOvr}–{maxOvr}</span>
                <span aria-hidden="true">×</span>
              </button>
            )}
            {filterMomentum !== 'ALL' && (
              <button
                type="button"
                onClick={() => { setFilterMomentum('ALL'); setVisibleMarketCount(INITIAL_MARKET_VISIBLE_COUNT); }}
                className="inline-flex items-center gap-1.5 px-3 py-1 min-h-11 lg:min-h-0 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs sm:text-[10px] border border-white/10 capitalize cursor-pointer"
              >
                <span>Momentum: {filterMomentum}</span>
                <span aria-hidden="true">×</span>
              </button>
            )}
            {onlyAffordableFee && (
              <button
                type="button"
                onClick={() => { setOnlyAffordableFee(false); setVisibleMarketCount(INITIAL_MARKET_VISIBLE_COUNT); }}
                className="inline-flex items-center gap-1.5 px-3 py-1 min-h-11 lg:min-h-0 rounded-full bg-amber-400/20 hover:bg-amber-400/30 text-amber-300 hover:text-white text-xs sm:text-[10px] border border-amber-400/30 cursor-pointer"
              >
                <span>Fee Affordable</span>
                <span aria-hidden="true">×</span>
              </button>
            )}
            {onlyAffordableWage && (
              <button
                type="button"
                onClick={() => { setOnlyAffordableWage(false); setVisibleMarketCount(INITIAL_MARKET_VISIBLE_COUNT); }}
                className="inline-flex items-center gap-1.5 px-3 py-1 min-h-11 lg:min-h-0 rounded-full bg-emerald-400/20 hover:bg-emerald-400/30 text-emerald-300 hover:text-white text-xs sm:text-[10px] border border-emerald-400/30 cursor-pointer"
              >
                <span>Wage Affordable</span>
                <span aria-hidden="true">×</span>
              </button>
            )}
          </div>
        </div>

      </div>

      {/* Mobile (< md): Sort Bar + Market Card List */}
      <div className="md:hidden space-y-3">
        <div className="bg-[#111827] border border-white/10 rounded-xl p-3 flex items-center gap-2">
          <label htmlFor="market-mobile-sort" className="text-xs font-semibold text-slate-400 whitespace-nowrap">
            Sort by
          </label>
          <select
            id="market-mobile-sort"
            value={sortField}
            onChange={e => {
              sounds.playClick();
              const nextField = e.target.value as SortField;
              setSortField(nextField);
              setSortDirection(nextField === 'position' || nextField === 'age' || nextField === 'name' ? 'asc' : 'desc');
              setVisibleMarketCount(INITIAL_MARKET_VISIBLE_COUNT);
            }}
            className="flex-1 min-h-11 px-3 py-2 bg-slate-900 border border-white/10 rounded-lg text-base text-white font-semibold focus:outline-none focus:border-amber-400"
          >
            <option value="overall">OVR Rating</option>
            <option value="position">Position</option>
            <option value="value">Valuation</option>
            <option value="wage">Current Wage</option>
            <option value="age">Age</option>
            <option value="growthMomentum">Momentum</option>
            <option value="name">Player Name</option>
          </select>
          <button
            type="button"
            onClick={() => {
              sounds.playClick();
              setSortDirection(prev => (prev === 'asc' ? 'desc' : 'asc'));
              setVisibleMarketCount(INITIAL_MARKET_VISIBLE_COUNT);
            }}
            aria-label={sortDirection === 'asc' ? 'Sort ascending, tap for descending' : 'Sort descending, tap for ascending'}
            className="min-h-11 min-w-11 px-3 flex items-center justify-center gap-1 bg-slate-900 border border-white/10 rounded-lg text-amber-400 text-xs font-bold cursor-pointer active:scale-95"
          >
            {sortDirection === 'asc' ? <ArrowUp className="w-4 h-4" /> : <ArrowDown className="w-4 h-4" />}
            <span>{sortDirection === 'asc' ? 'Asc' : 'Desc'}</span>
          </button>
        </div>

        {displayedMarketList.length === 0 ? (
          <div className="bg-[#111827] border border-white/10 rounded-xl p-8 text-center text-slate-400 space-y-2">
            <AlertTriangle className="w-8 h-8 text-amber-400/60 mx-auto" />
            <p className="font-semibold text-white">No players found matching your criteria</p>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              Try broadening your search term, adjusting age/rating limits, or clearing active filters.
            </p>
            <button
              type="button"
              onClick={handleResetFilters}
              className="mt-2 px-4 py-2 min-h-11 bg-amber-400/10 hover:bg-amber-400/20 border border-amber-400/30 text-amber-300 text-xs font-semibold rounded-lg transition-colors cursor-pointer active:scale-95"
            >
              Reset All Filters
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {displayedMarketList.map(({ player, club }) => (
              <MarketMobileCard
                key={player.id}
                player={player}
                club={club}
                isAffordableFee={club ? player.value * 0.9 <= currentClub.transferBudget : true}
                isAffordableWage={player.wage * 0.85 <= wageSpaceRemaining}
                isExpanded={expandedMarketId === player.id}
                onToggleExpand={handleToggleExpandMarket}
                onNegotiate={handleOpenNegotiate}
              />
            ))}
          </div>
        )}
      </div>

      {/* Desktop/Tablet (md+): Market Results Table with Clickable Sort Headers */}
      <div className="hidden md:block bg-[#111827] border border-white/10 rounded-xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead>
              <tr className="text-xs sm:text-[10px] text-slate-400 border-b border-white/10 bg-slate-900 uppercase select-none">
                
                {/* Player / Club Header */}
                <th className="sticky left-0 z-20 bg-slate-900 py-1 px-3 border-r border-white/5">
                  <button
                    type="button"
                    onClick={() => handleSortToggle('name')}
                    className="w-full min-h-11 lg:min-h-0 py-2 flex items-center gap-1.5 cursor-pointer hover:text-white transition-colors uppercase"
                  >
                    <span className={sortField === 'name' ? 'text-amber-400 font-bold' : ''}>Player / Club</span>
                    {sortField === 'name' ? (
                      sortDirection === 'asc' ? <ArrowUp className="w-3 h-3 text-amber-400" /> : <ArrowDown className="w-3 h-3 text-amber-400" />
                    ) : (
                      <ArrowUpDown className="w-3 h-3 opacity-30 hover:opacity-100" />
                    )}
                  </button>
                </th>

                {/* Position */}
                <th className="py-3 px-2 text-center">Pos</th>

                {/* Age Header (Sortable) */}
                <th className="hidden lg:table-cell py-1 px-2 text-center">
                  <button
                    type="button"
                    onClick={() => handleSortToggle('age')}
                    className="w-full min-h-11 lg:min-h-0 py-2 flex items-center justify-center gap-1 cursor-pointer hover:text-white transition-colors uppercase"
                  >
                    <span className={sortField === 'age' ? 'text-amber-400 font-bold' : ''}>Age</span>
                    {sortField === 'age' ? (
                      sortDirection === 'asc' ? <ArrowUp className="w-3 h-3 text-amber-400" /> : <ArrowDown className="w-3 h-3 text-amber-400" />
                    ) : (
                      <ArrowUpDown className="w-3 h-3 opacity-30 hover:opacity-100" />
                    )}
                  </button>
                </th>

                {/* OVR Rating Header (Sortable) */}
                <th className="py-1 px-2 text-center">
                  <button
                    type="button"
                    onClick={() => handleSortToggle('overall')}
                    className="w-full min-h-11 lg:min-h-0 py-2 flex items-center justify-center gap-1 cursor-pointer hover:text-white transition-colors uppercase"
                  >
                    <span className={sortField === 'overall' ? 'text-amber-400 font-bold' : ''}>OVR / 99</span>
                    {sortField === 'overall' ? (
                      sortDirection === 'asc' ? <ArrowUp className="w-3 h-3 text-amber-400" /> : <ArrowDown className="w-3 h-3 text-amber-400" />
                    ) : (
                      <ArrowUpDown className="w-3 h-3 opacity-30 hover:opacity-100" />
                    )}
                  </button>
                </th>

                {/* Growth Momentum Header (Sortable) */}
                <th className="hidden xl:table-cell py-1 px-2 text-center">
                  <button
                    type="button"
                    onClick={() => handleSortToggle('growthMomentum')}
                    className="w-full min-h-11 lg:min-h-0 py-2 flex items-center justify-center gap-1 cursor-pointer hover:text-white transition-colors uppercase"
                  >
                    <span className={sortField === 'growthMomentum' ? 'text-amber-400 font-bold' : ''}>Momentum</span>
                    {sortField === 'growthMomentum' ? (
                      sortDirection === 'asc' ? <ArrowUp className="w-3 h-3 text-amber-400" /> : <ArrowDown className="w-3 h-3 text-amber-400" />
                    ) : (
                      <ArrowUpDown className="w-3 h-3 opacity-30 hover:opacity-100" />
                    )}
                  </button>
                </th>

                {/* Valuation Header (Sortable) */}
                <th className="py-1 px-3 text-right">
                  <button
                    type="button"
                    onClick={() => handleSortToggle('value')}
                    className="w-full min-h-11 lg:min-h-0 py-2 flex items-center justify-end gap-1 cursor-pointer hover:text-white transition-colors uppercase"
                  >
                    <span className={sortField === 'value' ? 'text-amber-400 font-bold' : ''}>Valuation</span>
                    {sortField === 'value' ? (
                      sortDirection === 'asc' ? <ArrowUp className="w-3 h-3 text-amber-400" /> : <ArrowDown className="w-3 h-3 text-amber-400" />
                    ) : (
                      <ArrowUpDown className="w-3 h-3 opacity-30 hover:opacity-100" />
                    )}
                  </button>
                </th>

                {/* Wage Header (Sortable) */}
                <th className="py-1 px-3 text-right">
                  <button
                    type="button"
                    onClick={() => handleSortToggle('wage')}
                    className="w-full min-h-11 lg:min-h-0 py-2 flex items-center justify-end gap-1 cursor-pointer hover:text-white transition-colors uppercase"
                  >
                    <span className={sortField === 'wage' ? 'text-amber-400 font-bold' : ''}>Current Wage</span>
                    {sortField === 'wage' ? (
                      sortDirection === 'asc' ? <ArrowUp className="w-3 h-3 text-amber-400" /> : <ArrowDown className="w-3 h-3 text-amber-400" />
                    ) : (
                      <ArrowUpDown className="w-3 h-3 opacity-30 hover:opacity-100" />
                    )}
                  </button>
                </th>

                <th className="py-3 px-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 font-sans">
              {displayedMarketList.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400">
                    <AlertTriangle className="w-8 h-8 text-amber-400/60 mx-auto mb-2" />
                    <p className="font-semibold text-white">No players found matching your criteria</p>
                    <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                      Try broadening your search term, adjusting age/rating limits, or clearing active filters.
                    </p>
                    <button
                      onClick={handleResetFilters}
                      className="mt-3 px-4 py-2 min-h-11 lg:min-h-0 bg-amber-400/10 hover:bg-amber-400/20 border border-amber-400/30 text-amber-300 text-xs font-semibold rounded-lg transition-colors cursor-pointer"
                    >
                      Reset All Filters
                    </button>
                  </td>
                </tr>
              ) : (
                displayedMarketList.map(({ player, club }) => (
                  <MarketTableRow
                    key={player.id}
                    player={player}
                    club={club}
                    isAffordableFee={club ? player.value * 0.9 <= currentClub.transferBudget : true}
                    isAffordableWage={player.wage * 0.85 <= wageSpaceRemaining}
                    onNegotiate={handleOpenNegotiate}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Progressive "Show more" Controls (shared across mobile card list and desktop table) */}
      {totalItems > 0 && (
        <div className="bg-[#111827] border border-white/10 rounded-xl px-4 py-3 flex flex-col sm:flex-row items-center justify-between gap-3">
          <span className="text-xs font-mono text-slate-400">
            Showing <strong className="text-white">{displayedMarketList.length}</strong> of{' '}
            <strong className="text-amber-400">{totalItems}</strong> targets
          </span>

          {hasMoreMarket ? (
            <button
              type="button"
              onClick={() => {
                sounds.playClick();
                setVisibleMarketCount(prev => Math.min(totalItems, prev + MARKET_PAGE_INCREMENT));
              }}
              className="w-full sm:w-auto min-h-11 lg:min-h-0 px-5 py-2.5 bg-amber-400/15 hover:bg-amber-400/25 border border-amber-400/30 text-amber-300 text-xs font-bold rounded-xl transition-all cursor-pointer active:scale-95"
            >
              Show more (+{Math.min(MARKET_PAGE_INCREMENT, totalItems - displayedMarketList.length)})
            </button>
          ) : (
            <span className="text-xs font-mono text-slate-500">All matching targets loaded</span>
          )}
        </div>
      )}
    </>
  )}

      {/* TAB 2: Proposals & Incoming Bids Hub */}
      {activeTab === 'proposals' && (
        <div className="space-y-8">

          {/* SECTION A: Head Coach Transfer Proposals ('shared' mode) */}
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h2 className="text-base font-extrabold text-white flex items-center gap-2">
                  <UserCheck className="w-4 h-4 text-amber-400" />
                  <span>Head Coach Transfer Proposals</span>
                  {pendingProposals.length > 0 && (
                    <span className="px-2 py-0.5 rounded-full bg-amber-400 text-slate-950 text-xs font-mono font-bold">
                      {pendingProposals.length} Pending
                    </span>
                  )}
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Joint recommendations submitted by {manager ? manager.name : 'your Head Coach'} under Shared Consensus. Proposals expire after 3 weeks.
                </p>
              </div>
            </div>

            {proposalError && (
              <div className="p-3.5 rounded-xl bg-rose-950/40 border border-rose-500/40 text-xs text-rose-200 flex items-center justify-between gap-2">
                <span>{proposalError}</span>
                <button
                  type="button"
                  onClick={() => setProposalError(null)}
                  className="min-h-11 min-w-11 lg:min-h-0 lg:min-w-0 flex items-center justify-center text-rose-300 hover:text-white cursor-pointer"
                >
                  ✕
                </button>
              </div>
            )}

            {pendingProposals.length === 0 ? (
              <div className="bg-[#111827] border border-white/10 rounded-xl p-6 text-center space-y-1.5">
                <p className="text-sm font-bold text-slate-200">No Pending Manager Proposals</p>
                <p className="text-xs text-slate-400 max-w-md mx-auto">
                  When Signings or Sales are set to <strong>Shared Consensus</strong> in Delegation &amp; Staff, your Head Coach will bring target signings and surplus sales here during transfer windows (Weeks 1–6 and 20–24).
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {pendingProposals.map(prop => {
                  const counterparty = prop.counterpartyClubId ? clubsById.get(prop.counterpartyClubId) : undefined;
                  const counterpartyLabel = counterparty
                    ? counterparty.name
                    : prop.kind === 'signing'
                      ? 'Free Agent'
                      : 'Buying Club';

                  return (
                    <div
                      key={prop.id}
                      className="bg-[#111827] border border-amber-400/30 rounded-xl p-4 space-y-3 shadow-lg"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                              prop.kind === 'signing'
                                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                : 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                            }`}>
                              {prop.kind === 'signing' ? 'Signing Proposal' : 'Sale Proposal'}
                            </span>
                            <span className="text-xs font-mono text-slate-400">
                              Expires Wk {prop.expiresWeek}
                            </span>
                          </div>
                          <h3 className="text-base font-extrabold text-white mt-1 truncate">
                            {prop.playerName}
                          </h3>
                          <span className="text-xs font-mono text-slate-400 block">
                            {prop.position} · Age {prop.age} · OVR {prop.overall} · {prop.kind === 'signing' ? 'From' : 'To'}: <strong className="text-slate-200">{counterpartyLabel}</strong>
                          </span>
                        </div>

                        <div className="text-right font-mono shrink-0">
                          <span className="text-sm font-extrabold text-amber-400 block tabular-nums">
                            {prop.fee > 0 ? `£${(prop.fee / 1000000).toFixed(2)}M` : 'FREE'}
                          </span>
                          <span className="text-xs text-emerald-400 block tabular-nums">
                            £{(prop.wage / 1000).toFixed(0)}k/wk · {prop.contractYears}y
                          </span>
                        </div>
                      </div>

                      <div className="bg-slate-900/70 border border-white/5 rounded-lg p-3 text-xs text-slate-200 italic">
                        "{prop.reason}"
                      </div>

                      <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => {
                            setProposalError(null);
                            onRejectProposal?.(prop.id);
                          }}
                          className="flex-1 sm:flex-initial min-h-11 px-4 py-2 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-rose-300 text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-all active:scale-95"
                        >
                          <X className="w-3.5 h-3.5" />
                          <span>Reject (-3 Trust)</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const res = onApproveProposal?.(prop.id);
                            if (res && !res.ok) {
                              sounds.playCrisis();
                              setProposalError(res.error || 'Cannot approve proposal under current club constraints.');
                            } else {
                              setProposalError(null);
                            }
                          }}
                          className="flex-1 sm:flex-initial min-h-11 px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-extrabold flex items-center justify-center gap-1.5 cursor-pointer transition-all active:scale-95"
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>Approve (+2 Trust)</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {resolvedProposals.length > 0 && (
              <div className="bg-slate-900/40 border border-white/5 rounded-xl p-3.5 space-y-2">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400 block">
                  Recent Resolved &amp; Expired Proposals
                </span>
                <div className="space-y-1.5">
                  {resolvedProposals.map(prop => (
                    <div key={prop.id} className="flex flex-wrap items-center justify-between gap-2 text-xs font-mono text-slate-400">
                      <span className="truncate">
                        {prop.kind === 'signing' ? 'Sign' : 'Sell'} <strong className="text-slate-200">{prop.playerName}</strong> ({prop.position}, {prop.overall} OVR)
                      </span>
                      <span className={`px-2 py-0.5 rounded uppercase text-[10px] font-bold ${
                        prop.status === 'approved'
                          ? 'bg-emerald-500/15 text-emerald-300'
                          : prop.status === 'rejected'
                            ? 'bg-rose-500/15 text-rose-300'
                            : 'bg-slate-800 text-slate-400'
                      }`}>
                        {prop.status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* SECTION B: Incoming Rival Bids (merged into Proposals tab) */}
          <div className="space-y-6 pt-6 border-t border-white/10">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h2 className="text-base font-extrabold text-white flex items-center gap-2">
                  <Inbox className="w-4 h-4 text-emerald-400" />
                  <span>Incoming Rival Bids</span>
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Formal offers received from rival clubs for your first-team squad.
                </p>
              </div>
            </div>

            {pendingBidConfirm && (
              <div className="bg-rose-950/35 border border-rose-500/40 rounded-xl p-4 space-y-3">
                <div className="flex items-start gap-2.5">
                  <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                  <div className="space-y-1 text-xs">
                    <span className="font-bold text-white block">
                      {pendingBidConfirm.check.title || 'Head Coach Warning'}
                    </span>
                    <p className="text-slate-200 leading-relaxed">
                      {pendingBidConfirm.check.mode === 'manager'
                        ? `Overriding your Head Coach will cost trust (${pendingBidConfirm.check.trustDelta} trust).`
                        : pendingBidConfirm.check.reason}
                    </p>
                    <p className="text-slate-400 font-mono">
                      Sale: {pendingBidConfirm.bid.playerName} to {pendingBidConfirm.bid.buyingClubName} · £{(pendingBidConfirm.bid.offeredFee / 1000000).toFixed(2)}M
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setPendingBidConfirm(null)}
                    className="min-h-11 px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-semibold text-slate-200 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      sounds.playSigningStamp();
                      onAcceptBid?.(pendingBidConfirm.bid.id, pendingBidConfirm.check.trustDelta);
                      setPendingBidConfirm(null);
                    }}
                    className="min-h-11 px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold cursor-pointer"
                  >
                    Force it through ({pendingBidConfirm.check.trustDelta} Trust)
                  </button>
                </div>
              </div>
            )}

          {/* Incoming Bids Financial & Activity Summary */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-[#111827] border border-white/10 rounded-xl p-4">
              <span className="text-xs sm:text-[10px] text-slate-400 uppercase tracking-wider block mb-1 flex items-center gap-1.5 text-amber-400">
                <Inbox className="w-3.5 h-3.5" />
                <span>Pending Inquiries</span>
              </span>
              <span className="text-xl font-bold font-mono text-amber-400">
                {bidsSummary.pendingCount} Active
              </span>
              <span className="text-xs sm:text-[11px] text-slate-500 block mt-1 font-mono">
                {incomingBids.length} total offers logged
              </span>
            </div>

            <div className="bg-[#111827] border border-white/10 rounded-xl p-4">
              <span className="text-xs sm:text-[10px] text-slate-400 uppercase tracking-wider block mb-1 flex items-center gap-1.5 text-emerald-400">
                <Coins className="w-3.5 h-3.5" />
                <span>Potential Fee Inflow</span>
              </span>
              <span className="text-xl font-bold font-mono text-emerald-400">
                £{(bidsSummary.pendingFeeInflow / 1000000).toFixed(2)}M
              </span>
              <span className="text-xs sm:text-[11px] text-slate-500 block mt-1 font-mono">
                Direct to War Chest & Balance
              </span>
            </div>

            <div className="bg-[#111827] border border-white/10 rounded-xl p-4">
              <span className="text-xs sm:text-[10px] text-slate-400 uppercase tracking-wider block mb-1 flex items-center gap-1.5 text-cyan-400">
                <DollarSign className="w-3.5 h-3.5" />
                <span>Potential Wage Space Freed</span>
              </span>
              <span className="text-xl font-bold font-mono text-cyan-400">
                £{(bidsSummary.pendingWageFreed / 1000).toFixed(0)}k/wk
              </span>
              <span className="text-xs sm:text-[11px] text-slate-500 block mt-1 font-mono">
                From pending sales
              </span>
            </div>

            <div className="bg-[#111827] border border-white/10 rounded-xl p-4 flex flex-col justify-between">
              <span className="text-xs sm:text-[10px] text-slate-400 uppercase tracking-wider block mb-1">
                Squad Transfer Listing
              </span>
              <button
                onClick={() => {
                  sounds.playClick();
                  if (currentClub.squad.length > 0) {
                    setPlayerToOffer(currentClub.squad[0]);
                    setOfferPriceInput(currentClub.squad[0].value);
                  }
                  setShowOfferPlayerModal(true);
                }}
                className="w-full py-2 min-h-11 lg:min-h-0 bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-slate-950 font-bold text-xs rounded-lg shadow-sm flex items-center justify-center gap-1.5 cursor-pointer transition-all active:scale-95"
              >
                <Tag className="w-3.5 h-3.5" />
                <span>Offer Player to Clubs</span>
              </button>
            </div>
          </div>

          {/* Filter Status Selector */}
          <div className="bg-[#111827] border border-white/10 rounded-xl p-3 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-1.5 bg-slate-900 border border-white/10 p-1 rounded-xl max-w-full">
              {(['all', 'pending', 'accepted', 'rejected'] as const).map(status => (
                <button
                  key={status}
                  onClick={() => {
                    sounds.playClick();
                    setBidsFilter(status);
                  }}
                  className={`px-3 py-1.5 min-h-11 lg:min-h-0 text-xs font-bold rounded-lg transition-all capitalize cursor-pointer ${
                    bidsFilter === status
                      ? 'bg-amber-400 text-slate-950 shadow-sm'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {status === 'all' ? `All Bids (${incomingBids.length})` :
                   status === 'pending' ? `Pending (${bidsSummary.pendingCount})` :
                   status === 'accepted' ? `Accepted (${bidsSummary.acceptedCount})` :
                   `Rejected (${bidsSummary.rejectedCount})`}
                </button>
              ))}
            </div>

            <span className="text-xs text-slate-400 font-mono">
              Review formal purchase bids submitted by rival AI managers
            </span>
          </div>

          {/* Bids Table / Empty State */}
          {bidsSummary.filtered.length === 0 ? (
            <div className="bg-[#111827] border border-white/10 rounded-2xl p-12 text-center space-y-3">
              <div className="w-12 h-12 rounded-full bg-slate-900 border border-white/10 flex items-center justify-center mx-auto text-slate-500">
                <Inbox className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-white">No Incoming Bids Found</h3>
              <p className="text-xs text-slate-400 max-w-md mx-auto">
                No rival clubs have currently submitted offers matching this filter. Go to the <strong>Squad</strong> tab or click "Offer Player to Clubs" above to circulate your players with custom valuations.
              </p>
              <button
                onClick={() => {
                  sounds.playClick();
                  if (currentClub.squad.length > 0) {
                    setPlayerToOffer(currentClub.squad[0]);
                    setOfferPriceInput(currentClub.squad[0].value);
                  }
                  setShowOfferPlayerModal(true);
                }}
                className="px-5 py-2.5 min-h-11 lg:min-h-0 bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold text-xs rounded-xl shadow transition-all cursor-pointer inline-flex items-center gap-1.5"
              >
                <Tag className="w-3.5 h-3.5" />
                <span>Transfer List a Squad Player</span>
              </button>
            </div>
          ) : (
            <>
              {/* Mobile (< md): Incoming Bids Card List */}
              <div className="md:hidden space-y-3">
                {bidsSummary.filtered.map(bid => {
                  const buyingClub = clubsById.get(bid.buyingClubId);
                  const playerInSquad = squadPlayerById.get(bid.playerId);
                  return (
                    <IncomingBidMobileCard
                      key={bid.id}
                      bid={bid}
                      buyingClubColor={buyingClub?.primaryColor || '#64748b'}
                      currentValue={playerInSquad?.value ?? bid.askingPrice}
                      onReview={handleReviewBid}
                      onAccept={handleAcceptBidAction}
                      onReject={handleRejectBidAction}
                    />
                  );
                })}
              </div>

              {/* Desktop/Tablet (md+): Incoming Bids Table */}
              <div className="hidden md:block bg-[#111827] border border-white/10 rounded-xl overflow-hidden shadow-xl">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs font-mono">
                    <thead>
                      <tr className="text-xs sm:text-[10px] text-slate-400 border-b border-white/10 bg-slate-900 uppercase select-none">
                        <th className="sticky left-0 z-20 bg-slate-900 py-3 px-4 border-r border-white/5">Player</th>
                        <th className="py-3 px-2 text-center">Pos</th>
                        <th className="hidden lg:table-cell py-3 px-2 text-center">OVR</th>
                        <th className="py-3 px-4">Bidding Club</th>
                        <th className="hidden lg:table-cell py-3 px-3 text-right">Asking Price</th>
                        <th className="py-3 px-3 text-right">Offered Fee</th>
                        <th className="py-3 px-2 text-center">Status</th>
                        <th className="py-3 px-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5 font-sans">
                      {bidsSummary.filtered.map(bid => {
                        const buyingClub = clubsById.get(bid.buyingClubId);
                        const playerInSquad = squadPlayerById.get(bid.playerId);
                        return (
                          <IncomingBidTableRow
                            key={bid.id}
                            bid={bid}
                            buyingClubColor={buyingClub?.primaryColor || '#64748b'}
                            currentValue={playerInSquad?.value ?? bid.askingPrice}
                            onReview={handleReviewBid}
                            onAccept={handleAcceptBidAction}
                            onReject={handleRejectBidAction}
                          />
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

          {/* Bid Review Modal */}
          <Modal
            isOpen={Boolean(selectedBidForReview)}
            onClose={() => setSelectedBidForReview(null)}
            maxWidthClass="max-w-lg"
            ariaLabel={selectedBidForReview ? `Offer from ${selectedBidForReview.buyingClubName}` : 'Transfer Bid Evaluation'}
            header={
              selectedBidForReview && (
                <div>
                  <span className="text-xs sm:text-[10px] font-bold text-amber-400 uppercase tracking-wider block">
                    Transfer Bid Evaluation
                  </span>
                  <h3 className="text-xl font-extrabold text-white">
                    Offer from {selectedBidForReview.buyingClubName}
                  </h3>
                  <span className="text-xs text-slate-400">
                    Tier: {selectedBidForReview.buyingClubTier === 1 ? 'Premier League' : selectedBidForReview.buyingClubTier === 2 ? 'Championship' : 'League One'}
                  </span>
                </div>
              )
            }
            footer={
              selectedBidForReview && (
                <div className="flex flex-wrap items-center justify-end gap-2.5">
                  <button
                    onClick={() => setSelectedBidForReview(null)}
                    className="px-4 py-2 min-h-11 lg:min-h-0 text-xs font-semibold text-slate-400 hover:text-white cursor-pointer"
                  >
                    Close
                  </button>

                  {selectedBidForReview.status === 'pending' && (
                    <>
                      <button
                        onClick={() => {
                          sounds.playCrisis();
                          onRejectBid?.(selectedBidForReview.id);
                          setSelectedBidForReview(null);
                        }}
                        className="px-4 py-2 min-h-11 lg:min-h-0 text-xs font-bold bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-rose-300 rounded-xl cursor-pointer transition-all"
                      >
                        Reject Offer
                      </button>

                      <button
                        onClick={() => {
                          const bidId = selectedBidForReview.id;
                          setSelectedBidForReview(null);
                          handleAcceptBidAction(bidId);
                        }}
                        className="px-6 py-2 min-h-11 lg:min-h-0 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-white font-extrabold text-xs rounded-xl shadow-lg shadow-emerald-500/20 cursor-pointer transition-all active:scale-95"
                      >
                        Accept & Sanction Transfer
                      </button>
                    </>
                  )}
                </div>
              )
            }
          >
            {selectedBidForReview && (
              <div className="space-y-4">
                {/* Player Summary Card */}
                <div className="bg-slate-900/80 border border-white/5 rounded-xl p-3.5 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="text-xs sm:text-[10px] text-slate-400 uppercase font-mono block">Player Under Offer</span>
                    <span className="text-base font-bold text-white block">{selectedBidForReview.playerName}</span>
                    <span className="text-xs text-slate-400 font-mono">
                      {selectedBidForReview.playerPos} · Age {selectedBidForReview.playerAge} · OVR {selectedBidForReview.playerOverall}
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-xs sm:text-[10px] text-slate-400 uppercase font-mono block">Your Asking Price</span>
                    <span className="text-sm font-bold font-mono text-slate-300">
                      £{(selectedBidForReview.askingPrice / 1000000).toFixed(2)}M
                    </span>
                  </div>
                </div>

                {/* Financial Injection Breakdown */}
                <div className="bg-slate-950/70 border border-white/5 rounded-xl p-4 space-y-2.5 text-xs">
                  <div className="flex items-center justify-between border-b border-white/5 pb-2 gap-2">
                    <span className="text-slate-400">Firm Transfer Fee Offered:</span>
                    <span className="font-mono font-extrabold text-base text-emerald-400">
                      £{(selectedBidForReview.offeredFee / 1000000).toFixed(2)}M
                    </span>
                  </div>

                  <div className="flex items-center justify-between border-b border-white/5 pb-2 gap-2">
                    <span className="text-slate-400">Funds Added to Transfer Budget:</span>
                    <span className="font-mono font-bold text-amber-300">
                      +£{(selectedBidForReview.offeredFee / 1000000).toFixed(2)}M
                    </span>
                  </div>

                  <div className="flex items-center justify-between border-b border-white/5 pb-2 gap-2">
                    <span className="text-slate-400">Funds Added to Bank Balance:</span>
                    <span className="font-mono font-bold text-amber-300">
                      +£{(selectedBidForReview.offeredFee / 1000000).toFixed(2)}M
                    </span>
                  </div>

                  <div className="flex items-center justify-between gap-2">
                    <span className="text-slate-400">Weekly Wage Headroom Unlocked:</span>
                    <span className="font-mono font-bold text-cyan-400">
                      +£{((currentClub.squad.find(p => p.id === selectedBidForReview.playerId)?.wage ?? 0) / 1000).toFixed(0)}k/week
                    </span>
                  </div>
                </div>

                {selectedBidForReview.offeredFee >= selectedBidForReview.askingPrice ? (
                  <div className="p-3 bg-emerald-950/30 border border-emerald-500/30 rounded-xl text-xs text-emerald-300 flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>{selectedBidForReview.buyingClubName} met or exceeded your asking price!</span>
                  </div>
                ) : (
                  <div className="p-3 bg-amber-950/30 border border-amber-500/30 rounded-xl text-xs text-amber-300 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                    <span>Counter-offer: £{((selectedBidForReview.askingPrice - selectedBidForReview.offeredFee) / 1000000).toFixed(2)}M under your asking valuation.</span>
                  </div>
                )}
              </div>
            )}
          </Modal>

          {/* Quick Offer Player to Clubs Modal */}
          <Modal
            isOpen={showOfferPlayerModal}
            onClose={() => setShowOfferPlayerModal(false)}
            maxWidthClass="max-w-lg"
            ariaLabel="Offer Player to Rival Clubs"
            header={
              <div>
                <span className="text-xs sm:text-[10px] font-bold text-amber-400 uppercase tracking-wider block">
                  Direct Market Circulation
                </span>
                <h3 className="text-xl font-extrabold text-white">
                  Offer Player to Rival Clubs
                </h3>
              </div>
            }
            footer={
              <div className="flex flex-wrap items-center justify-end gap-2.5">
                <button
                  onClick={() => setShowOfferPlayerModal(false)}
                  className="px-4 py-2 min-h-11 lg:min-h-0 text-xs font-semibold text-slate-400 hover:text-white cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    if (!playerToOffer || !onOfferPlayerToClubs) return;
                    sounds.playGavel();
                    const bids = onOfferPlayerToClubs(playerToOffer.id, offerPriceInput);
                    setShowOfferPlayerModal(false);
                    if (bids.length > 0) {
                      sounds.playFanfare();
                    }
                  }}
                  className="px-5 py-2.5 min-h-11 lg:min-h-0 bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-slate-950 font-extrabold text-xs rounded-xl shadow-lg shadow-amber-500/20 flex items-center gap-2 cursor-pointer transition-all active:scale-95"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Circulate to Rival Clubs</span>
                </button>
              </div>
            }
          >
            <div className="space-y-4">
              {/* Player Selector */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Select Squad Player
                </label>
                <select
                  value={playerToOffer?.id || ''}
                  onChange={e => {
                    const p = currentClub.squad.find(item => item.id === e.target.value);
                    if (p) {
                      setPlayerToOffer(p);
                      setOfferPriceInput(p.value);
                    }
                  }}
                  className="w-full min-h-11 lg:min-h-0 px-3.5 py-2.5 bg-slate-900 border border-white/10 rounded-lg text-white text-base md:text-xs font-sans focus:outline-none focus:border-amber-400"
                >
                  {currentClub.squad.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.position}, OVR {p.overall}) — Value: £{(p.value / 1000000).toFixed(2)}M, Wage: £{(p.wage / 1000).toFixed(0)}k/wk
                    </option>
                  ))}
                </select>
              </div>

              {playerToOffer && (
                <div className="grid grid-cols-2 gap-3 bg-slate-900/80 border border-white/5 p-3 rounded-xl">
                  <div>
                    <span className="text-xs sm:text-[10px] text-slate-400 uppercase block font-mono">Market Valuation</span>
                    <span className="text-base font-bold font-mono text-white">
                      £{(playerToOffer.value / 1000000).toFixed(2)}M
                    </span>
                  </div>
                  <div>
                    <span className="text-xs sm:text-[10px] text-slate-400 uppercase block font-mono">Current Wage</span>
                    <span className="text-base font-bold font-mono text-emerald-400">
                      £{(playerToOffer.wage / 1000).toFixed(0)}k/wk
                    </span>
                  </div>
                </div>
              )}

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
                  value={offerPriceInput}
                  onChange={e => setOfferPriceInput(Math.max(50000, Number(e.target.value)))}
                  className="w-full min-h-11 lg:min-h-0 px-3.5 py-2.5 bg-slate-900 border border-white/10 rounded-lg text-white font-mono text-base md:text-sm focus:outline-none focus:border-amber-400"
                />
                <span className="text-xs sm:text-[11px] text-amber-400 font-mono block mt-1">
                  £{(offerPriceInput / 1000000).toFixed(2)} Million
                </span>
              </div>

              {playerToOffer && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {[
                    { label: '80% Cut', mult: 0.8 },
                    { label: '100% Fair', mult: 1.0 },
                    { label: '125% Premium', mult: 1.25 },
                    { label: '150% High', mult: 1.5 },
                  ].map(preset => {
                    const price = Math.round(playerToOffer.value * preset.mult);
                    const isSelected = offerPriceInput === price;
                    return (
                      <button
                        key={preset.label}
                        type="button"
                        onClick={() => setOfferPriceInput(price)}
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
              )}
            </div>
          </Modal>
          </div>
        </div>
      )}

      {/* TAB 3: Transfer History Log */}
      {activeTab === 'history' && (
        <div className="space-y-6">
          {/* Season Summary Bar */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-[#111827] border border-white/10 rounded-xl p-4">
              <span className="text-xs sm:text-[10px] text-slate-400 uppercase tracking-wider block mb-1">
                {historySeasonFilter === 'all' ? 'All-Time Deals' : `${historySeasonFilter}/${historySeasonFilter + 1} Deals`}
              </span>
              <span className="text-xl font-bold font-mono text-white">
                {historyStats.totalDeals}
              </span>
              <span className="text-xs sm:text-[11px] text-slate-500 block mt-1">Across 3 divisions</span>
            </div>

            <div className="bg-[#111827] border border-white/10 rounded-xl p-4">
              <span className="text-xs sm:text-[10px] text-slate-400 uppercase tracking-wider block mb-1 flex items-center gap-1.5 text-emerald-400">
                <ArrowDownLeft className="w-3.5 h-3.5" />
                <span>Total Spent</span>
              </span>
              <span className="text-xl font-bold font-mono text-emerald-400">
                £{(historyStats.totalSpent / 1000000).toFixed(2)}M
              </span>
              <span className="text-xs sm:text-[11px] text-slate-400 block mt-1 font-mono">
                {historyStats.clubInCount} club incoming
              </span>
            </div>

            <div className="bg-[#111827] border border-white/10 rounded-xl p-4">
              <span className="text-xs sm:text-[10px] text-slate-400 uppercase tracking-wider block mb-1 flex items-center gap-1.5 text-blue-400">
                <ArrowUpRight className="w-3.5 h-3.5" />
                <span>Total Received</span>
              </span>
              <span className="text-xl font-bold font-mono text-blue-400">
                £{(historyStats.totalReceived / 1000000).toFixed(2)}M
              </span>
              <span className="text-xs sm:text-[11px] text-slate-400 block mt-1 font-mono">
                {historyStats.clubOutCount} club outgoing
              </span>
            </div>

            <div className="bg-[#111827] border border-white/10 rounded-xl p-4">
              <span className="text-xs sm:text-[10px] text-slate-400 uppercase tracking-wider block mb-1">
                Net Spend
              </span>
              <span className={`text-xl font-bold font-mono ${
                historyStats.netSpend > 0 ? 'text-amber-400' : 'text-emerald-400'
              }`}>
                £{(historyStats.netSpend / 1000000).toFixed(2)}M
              </span>
              <span className="text-xs sm:text-[11px] text-slate-500 block mt-1">
                {historySeasonFilter === 'all' ? 'All seasons' : `Season ${historySeasonFilter}/${historySeasonFilter + 1}`}
              </span>
            </div>
          </div>

          {/* Transfer History Filter Controls */}
          <div className="bg-[#111827] border border-white/10 rounded-xl p-4 space-y-3">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
              {/* Direction Filter Buttons */}
              <div className="flex flex-wrap items-center gap-1.5 p-1 bg-slate-900 border border-white/10 rounded-xl max-w-full">
                <button
                  onClick={() => {
                    sounds.playClick();
                    setHistoryFilter('all');
                    setHistoryPage(1);
                  }}
                  className={`px-3 py-1.5 min-h-11 lg:min-h-0 text-xs font-bold rounded-lg transition-all cursor-pointer whitespace-nowrap ${
                    historyFilter === 'all'
                      ? 'bg-amber-400 text-slate-950 font-extrabold shadow-sm'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  All Deals ({transferHistory.length})
                </button>

                <button
                  onClick={() => {
                    sounds.playClick();
                    setHistoryFilter('in');
                    setHistoryPage(1);
                  }}
                  className={`px-3 py-1.5 min-h-11 lg:min-h-0 text-xs font-bold rounded-lg transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                    historyFilter === 'in'
                      ? 'bg-emerald-500 text-white font-extrabold shadow-sm'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <ArrowDownLeft className="w-3.5 h-3.5" />
                  <span>My Club IN</span>
                </button>

                <button
                  onClick={() => {
                    sounds.playClick();
                    setHistoryFilter('out');
                    setHistoryPage(1);
                  }}
                  className={`px-3 py-1.5 min-h-11 lg:min-h-0 text-xs font-bold rounded-lg transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                    historyFilter === 'out'
                      ? 'bg-blue-500 text-white font-extrabold shadow-sm'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <ArrowUpRight className="w-3.5 h-3.5" />
                  <span>My Club OUT</span>
                </button>
              </div>

              {/* Type, Initiated by, Season & Search Filters */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:flex lg:flex-wrap items-center gap-2.5 w-full lg:w-auto">
                <select
                  aria-label="Filter by transfer type"
                  value={historyTypeFilter}
                  onChange={e => {
                    setHistoryTypeFilter(e.target.value as 'all' | TransferRecord['type']);
                    setHistoryPage(1);
                  }}
                  className="px-2.5 py-1.5 min-h-11 lg:min-h-0 bg-slate-900 border border-white/10 rounded-lg text-base md:text-xs text-white font-mono"
                >
                  <option value="all">All Types</option>
                  <option value="signing">Signing</option>
                  <option value="sale">Sale</option>
                  <option value="release">Release</option>
                  <option value="renewal">Renewal</option>
                  <option value="promotion">Promotion</option>
                </select>

                <select
                  aria-label="Filter by who initiated transfer"
                  value={historyInitiatorFilter}
                  onChange={e => {
                    setHistoryInitiatorFilter(e.target.value as 'all' | 'director' | 'manager');
                    setHistoryPage(1);
                  }}
                  className="px-2.5 py-1.5 min-h-11 lg:min-h-0 bg-slate-900 border border-white/10 rounded-lg text-base md:text-xs text-white font-mono"
                >
                  <option value="all">Initiated: All</option>
                  <option value="director">Initiated: Me</option>
                  <option value="manager">Initiated: Manager</option>
                </select>

                <select
                  aria-label="Filter by season"
                  value={historySeasonFilter}
                  onChange={e => {
                    const val = e.target.value;
                    setHistorySeasonFilter(val === 'all' ? 'all' : Number(val));
                    setHistoryPage(1);
                  }}
                  className="px-2.5 py-1.5 min-h-11 lg:min-h-0 bg-slate-900 border border-white/10 rounded-lg text-base md:text-xs text-white font-mono"
                >
                  <option value="all">All Seasons</option>
                  {availableSeasons.map(yr => (
                    <option key={yr} value={yr}>
                      {yr}/{yr + 1}
                    </option>
                  ))}
                </select>

                <div className="relative w-full sm:w-52">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="search"
                    inputMode="search"
                    placeholder="Filter player or club..."
                    value={historySearchQuery}
                    onChange={e => {
                      setHistorySearchQuery(e.target.value);
                      setHistoryPage(1);
                    }}
                    className="w-full min-h-11 lg:min-h-0 pl-8 pr-3 py-1.5 bg-slate-900 border border-white/10 rounded-lg text-base md:text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-400"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Mobile (< md): Transfer History Cards */}
          <div className="md:hidden space-y-2.5">
            {filteredTransferHistory.length === 0 ? (
              <div className="bg-[#111827] border border-white/10 rounded-xl py-10 px-4 text-center text-slate-500 font-mono text-xs">
                No transfer records match your current criteria.
              </div>
            ) : (
              paginatedTransferHistory.map(tr => {
                const fromClub = tr.fromClubId ? clubsById.get(tr.fromClubId) : undefined;
                const toClub = tr.toClubId ? clubsById.get(tr.toClubId) : undefined;
                return (
                  <TransferHistoryMobileCard
                    key={tr.id}
                    tr={tr}
                    fromClubName={fromClub?.name || null}
                    fromClubColor={fromClub?.primaryColor || null}
                    toClubName={toClub?.name || null}
                    toClubColor={toClub?.primaryColor || null}
                    isFromMyClub={tr.fromClubId === currentClub.id}
                    isToMyClub={tr.toClubId === currentClub.id}
                    managerName={manager?.name}
                  />
                );
              })
            )}
          </div>

          {/* Desktop/Tablet (md+): Transfer History Table */}
          <div className="hidden md:block bg-[#111827] border border-white/10 rounded-xl overflow-hidden shadow-xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-900 border-b border-white/10 text-xs sm:text-[11px] text-slate-400 uppercase font-mono tracking-wider">
                    <th className="py-3 px-4">Season / Wk</th>
                    <th className="py-3 px-3 text-center">Type</th>
                    <th className="sticky left-0 z-20 bg-slate-900 py-3 px-4 border-r border-white/5">Player</th>
                    <th className="py-3 px-4">From</th>
                    <th className="py-3 px-2 text-center"></th>
                    <th className="py-3 px-4">To</th>
                    <th className="py-3 px-4 text-right">Fee / Terms</th>
                    <th className="hidden lg:table-cell py-3 px-4">Initiated By</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 text-xs">
                  {filteredTransferHistory.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-slate-500 font-mono text-xs">
                        No transfer records match your current criteria.
                      </td>
                    </tr>
                  ) : (
                    paginatedTransferHistory.map(tr => {
                      const fromClub = tr.fromClubId ? clubsById.get(tr.fromClubId) : undefined;
                      const toClub = tr.toClubId ? clubsById.get(tr.toClubId) : undefined;
                      return (
                        <TransferHistoryTableRow
                          key={tr.id}
                          tr={tr}
                          fromClubName={fromClub?.name || null}
                          fromClubColor={fromClub?.primaryColor || null}
                          toClubName={toClub?.name || null}
                          toClubColor={toClub?.primaryColor || null}
                          isFromMyClub={tr.fromClubId === currentClub.id}
                          isToMyClub={tr.toClubId === currentClub.id}
                          managerName={manager?.name}
                        />
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Transfer History Pagination (shared between mobile cards and desktop table) */}
          {filteredTransferHistory.length > historyPageSize && (
            <div className="bg-[#111827] border border-white/10 rounded-xl px-4 py-3 flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="text-slate-400 font-mono text-xs sm:text-[11px]">
                Showing {Math.min((historyPage - 1) * historyPageSize + 1, filteredTransferHistory.length)} - {Math.min(historyPage * historyPageSize, filteredTransferHistory.length)} of {filteredTransferHistory.length} deals
              </span>

              <div className="flex items-center gap-1.5">
                <button
                  disabled={historyPage <= 1}
                  onClick={() => {
                    sounds.playClick();
                    setHistoryPage(p => Math.max(1, p - 1));
                  }}
                  aria-label="Previous history page"
                  className="p-1.5 min-h-11 min-w-11 lg:min-h-0 lg:min-w-0 flex items-center justify-center bg-slate-950 hover:bg-slate-800 disabled:opacity-30 border border-white/10 text-slate-300 rounded-lg transition-colors cursor-pointer disabled:cursor-not-allowed active:scale-95"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>

                <span className="px-3 py-1 font-mono text-slate-300">
                  Page <strong className="text-amber-400">{historyPage}</strong> of {Math.ceil(filteredTransferHistory.length / historyPageSize)}
                </span>

                <button
                  disabled={historyPage >= Math.ceil(filteredTransferHistory.length / historyPageSize)}
                  onClick={() => {
                    sounds.playClick();
                    setHistoryPage(p => Math.min(Math.ceil(filteredTransferHistory.length / historyPageSize), p + 1));
                  }}
                  aria-label="Next history page"
                  className="p-1.5 min-h-11 min-w-11 lg:min-h-0 lg:min-w-0 flex items-center justify-center bg-slate-950 hover:bg-slate-800 disabled:opacity-30 border border-white/10 text-slate-300 rounded-lg transition-colors cursor-pointer disabled:cursor-not-allowed active:scale-95"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Transfer Negotiation Suite Modal */}
      <Modal
        isOpen={Boolean(targetPlayer)}
        onClose={() => {
          setTargetPlayer(null);
          setSigningConfirmCheck(null);
        }}
        maxWidthClass="max-w-lg"
        ariaLabel={targetPlayer ? `Transfer Negotiation Suite: ${targetPlayer.player.name}` : 'Transfer Negotiation Suite'}
        header={
          targetPlayer && (
            <div>
              <span className="text-xs sm:text-[10px] font-bold text-amber-400 uppercase tracking-wider block">
                Transfer Negotiation Suite
              </span>
              <h3 className="text-xl font-extrabold text-white">
                {targetPlayer.player.name}
              </h3>
              <span className="text-xs text-slate-400">
                {targetPlayer.club ? targetPlayer.club.name : 'Free Agent'} · Overall {targetPlayer.player.overall} · Age {targetPlayer.player.age}
              </span>
            </div>
          )
        }
        footer={
          targetPlayer && (
            <div className="flex flex-wrap items-center justify-end gap-3">
              {negotiationStep === 'BID' && (
                <button
                  onClick={handleClubBid}
                  className="px-6 py-2.5 min-h-11 lg:min-h-0 bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-slate-950 font-bold text-xs rounded-xl shadow-md transition-all cursor-pointer"
                >
                  Submit Bid to {targetPlayer.club?.shortName}
                </button>
              )}
              {negotiationStep === 'TERMS' && (
                <button
                  onClick={handlePersonalTerms}
                  className="px-6 py-2.5 min-h-11 lg:min-h-0 bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-slate-950 font-bold text-xs rounded-xl shadow-md transition-all cursor-pointer"
                >
                  Agree Personal Terms
                </button>
              )}
              {negotiationStep === 'OWNER_CHECK' && !signingConfirmCheck && (
                <>
                  <button
                    onClick={() => setNegotiationStep('TERMS')}
                    className="px-4 py-2 min-h-11 lg:min-h-0 text-xs font-semibold text-slate-400 hover:text-white cursor-pointer"
                  >
                    Back
                  </button>
                  <button
                    onClick={handleFinalizeSigning}
                    className="px-6 py-2.5 min-h-11 lg:min-h-0 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-white font-extrabold text-xs rounded-xl shadow-lg shadow-emerald-500/20 transition-all cursor-pointer"
                  >
                    Sanction Transfer & Sign Contract
                  </button>
                </>
              )}
              {negotiationStep === 'OWNER_CHECK' && signingConfirmCheck && (
                <>
                  <button
                    onClick={() => {
                      setSigningConfirmCheck(null);
                      setTargetPlayer(null);
                    }}
                    className="px-4 py-2.5 min-h-11 lg:min-h-0 bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-semibold text-slate-200 rounded-xl cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => {
                      sounds.playSigningStamp();
                      executeCompleteSigning(signingConfirmCheck.trustDelta);
                    }}
                    className="px-5 py-2.5 min-h-11 lg:min-h-0 bg-rose-600 hover:bg-rose-500 text-white font-extrabold text-xs rounded-xl shadow-lg transition-all cursor-pointer"
                  >
                    Force it through ({signingConfirmCheck.trustDelta} Trust)
                  </button>
                </>
              )}
              {negotiationStep === 'SUCCESS' && (
                <button
                  onClick={() => setTargetPlayer(null)}
                  className="px-6 py-2.5 min-h-11 lg:min-h-0 bg-white/10 hover:bg-white/20 text-white font-bold text-xs rounded-xl transition-all cursor-pointer"
                >
                  Return to Transfer Hub
                </button>
              )}
            </div>
          )
        }
      >
        {targetPlayer && (
          <div>
            {/* Step Progress Indicators */}
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-semibold mb-6 border-b border-white/5 pb-3">
              <span className={negotiationStep === 'BID' ? 'text-amber-400 font-bold' : 'text-slate-500'}>
                1. Club Fee
              </span>
              <span aria-hidden="true">→</span>
              <span className={negotiationStep === 'TERMS' ? 'text-amber-400 font-bold' : 'text-slate-500'}>
                2. Player Terms
              </span>
              <span aria-hidden="true">→</span>
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
                  <span className="text-xs sm:text-[11px] text-slate-500 block mt-1">
                    Your remaining transfer war chest: £{(currentClub.transferBudget / 1000000).toFixed(2)}M
                  </span>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Submit Formal Transfer Bid (£)
                  </label>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={100000}
                    step={250000}
                    value={offerFee}
                    onChange={e => setOfferFee(Number(e.target.value))}
                    className="w-full min-h-11 lg:min-h-0 px-3.5 py-2.5 bg-slate-900 border border-white/10 rounded-lg text-white font-mono text-base md:text-sm focus:outline-none focus:border-amber-400"
                  />
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
                  <span className="text-xs sm:text-[11px] text-slate-500 block mt-1">
                    Your wage space remaining: £{(wageSpaceRemaining / 1000).toFixed(0)}k/wk
                  </span>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Offered Weekly Wage (£/week)
                  </label>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={1000}
                    step={1000}
                    value={offerWage}
                    onChange={e => setOfferWage(Number(e.target.value))}
                    className="w-full min-h-11 lg:min-h-0 px-3.5 py-2.5 bg-slate-900 border border-white/10 rounded-lg text-white font-mono text-base md:text-sm focus:outline-none focus:border-amber-400"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Contract Length (Years)
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {[1, 2, 3, 5].map(yrs => (
                      <button
                        key={yrs}
                        type="button"
                        onClick={() => setOfferYears(yrs)}
                        className={`py-2 min-h-11 lg:min-h-0 text-xs font-mono font-bold rounded-lg border cursor-pointer ${
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
              </div>
            )}

            {/* Step 3: Owner Approval Check */}
            {negotiationStep === 'OWNER_CHECK' && (
              <div className="space-y-4">
                <div className="bg-slate-900/90 border border-white/10 rounded-xl p-4 text-xs space-y-2">
                  <div className="flex items-center justify-between border-b border-white/5 pb-2 gap-2">
                    <span className="text-slate-400">Majority Owner:</span>
                    <span className="font-bold text-white">{owner.name}</span>
                  </div>
                  <div className="flex items-center justify-between border-b border-white/5 pb-2 gap-2">
                    <span className="text-slate-400">Recruitment Philosophy:</span>
                    <span className="font-bold text-amber-400 capitalize">{owner.recruitmentPhilosophy.replace('_', ' ')}</span>
                  </div>
                  <div className="flex items-center justify-between border-b border-white/5 pb-2 gap-2">
                    <span className="text-slate-400">Agreed Fee:</span>
                    <span className="font-mono font-bold text-white">£{(offerFee / 1000000).toFixed(2)}M</span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
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

                {signingConfirmCheck && (
                  <div className="p-3.5 bg-rose-950/40 border border-rose-500/40 rounded-xl text-xs space-y-2">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                      <div>
                        <span className="font-bold text-white block">
                          {signingConfirmCheck.title || 'Head Coach Warning'}
                        </span>
                        <p className="text-slate-200 mt-0.5 leading-relaxed">
                          {signingConfirmCheck.mode === 'manager'
                            ? `Overriding your Head Coach will cost trust (${signingConfirmCheck.trustDelta} trust).`
                            : signingConfirmCheck.reason}
                        </p>
                      </div>
                    </div>
                  </div>
                )}
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
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Mobile & Tablet (< lg): Transfer Market Filters Bottom-Sheet Modal */}
      <Modal
        isOpen={showFilterSheet}
        onClose={() => setShowFilterSheet(false)}
        maxWidthClass="max-w-lg"
        ariaLabel="Transfer Market Filters"
        header={
          <div>
            <span className="text-xs font-bold text-amber-400 uppercase tracking-wider block">
              Scouting & Market Filters
            </span>
            <h3 className="text-lg font-extrabold text-white">
              Filter Transfer Targets
            </h3>
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
        <div className="space-y-4">
          {/* Search */}
          <div>
            <label htmlFor="sheet-market-search" className="block text-xs font-semibold text-slate-300 mb-1">
              Player, Club, or Role
            </label>
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                id="sheet-market-search"
                type="search"
                inputMode="search"
                placeholder="Search by player, club, or role..."
                value={draftSearch}
                onChange={e => setDraftSearch(e.target.value)}
                className="w-full min-h-11 pl-9 pr-3.5 py-2 bg-slate-900 border border-white/10 rounded-lg text-base text-white placeholder-slate-500 focus:outline-none focus:border-amber-400"
              />
            </div>
          </div>

          {/* Division & Position */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="sheet-market-tier" className="block text-xs font-semibold text-slate-300 mb-1">
                Division
              </label>
              <select
                id="sheet-market-tier"
                value={draftTier}
                onChange={e => {
                  const val = e.target.value;
                  setDraftTier(val === 'all' ? 'all' : val === 'FA' ? 'FA' : Number(val));
                }}
                className="w-full min-h-11 px-3 py-2 bg-slate-900 border border-white/10 rounded-lg text-base text-slate-200 focus:outline-none focus:border-amber-400"
              >
                <option value="all">All Divisions</option>
                <option value="1">Premier League</option>
                <option value="2">Championship</option>
                <option value="3">League One</option>
                <option value="FA">Free Agents</option>
              </select>
            </div>

            <div>
              <label htmlFor="sheet-market-pos" className="block text-xs font-semibold text-slate-300 mb-1">
                Position
              </label>
              <select
                id="sheet-market-pos"
                value={draftPos}
                onChange={e => setDraftPos(e.target.value as PlayerPosition | 'ALL')}
                className="w-full min-h-11 px-3 py-2 bg-slate-900 border border-white/10 rounded-lg text-base text-slate-200 focus:outline-none focus:border-amber-400"
              >
                <option value="ALL">All Positions</option>
                <option value="GK">Goalkeepers (GK)</option>
                <option value="DEF">Defenders (DEF)</option>
                <option value="MID">Midfielders (MID)</option>
                <option value="FWD">Forwards (FWD)</option>
              </select>
            </div>
          </div>

          {/* Age Range */}
          <div className="bg-slate-900/60 p-3 rounded-lg border border-white/5 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-300 font-semibold">Age Range</span>
              <span className="font-mono text-amber-400 font-bold">{draftMinAge} – {draftMaxAge} yrs</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-slate-400 block mb-0.5">Min Age</label>
                <input
                  type="number"
                  inputMode="numeric"
                  min={15}
                  max={draftMaxAge}
                  value={draftMinAge}
                  onChange={e => setDraftMinAge(Math.max(15, Math.min(Number(e.target.value), draftMaxAge)))}
                  className="w-full min-h-11 px-2.5 py-1.5 bg-slate-950 border border-white/10 rounded text-base text-white font-mono"
                />
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-0.5">Max Age</label>
                <input
                  type="number"
                  inputMode="numeric"
                  min={draftMinAge}
                  max={42}
                  value={draftMaxAge}
                  onChange={e => setDraftMaxAge(Math.min(42, Math.max(Number(e.target.value), draftMinAge)))}
                  className="w-full min-h-11 px-2.5 py-1.5 bg-slate-950 border border-white/10 rounded text-base text-white font-mono"
                />
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5 pt-1">
              <button
                type="button"
                onClick={() => { setDraftMinAge(16); setDraftMaxAge(21); }}
                className="px-3 py-1.5 min-h-11 text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 rounded cursor-pointer active:scale-95"
              >
                U-21
              </button>
              <button
                type="button"
                onClick={() => { setDraftMinAge(22); setDraftMaxAge(28); }}
                className="px-3 py-1.5 min-h-11 text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 rounded cursor-pointer active:scale-95"
              >
                Prime (22-28)
              </button>
              <button
                type="button"
                onClick={() => { setDraftMinAge(29); setDraftMaxAge(40); }}
                className="px-3 py-1.5 min-h-11 text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 rounded cursor-pointer active:scale-95"
              >
                29+ Veteran
              </button>
            </div>
          </div>

          {/* OVR Range */}
          <div className="bg-slate-900/60 p-3 rounded-lg border border-white/5 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-300 font-semibold">Overall Rating (OVR)</span>
              <span className="font-mono text-amber-400 font-bold">{draftMinOvr} – {draftMaxOvr}</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-slate-400 block mb-0.5">Min OVR</label>
                <input
                  type="number"
                  inputMode="numeric"
                  min={40}
                  max={draftMaxOvr}
                  value={draftMinOvr}
                  onChange={e => setDraftMinOvr(Math.max(40, Math.min(Number(e.target.value), draftMaxOvr)))}
                  className="w-full min-h-11 px-2.5 py-1.5 bg-slate-950 border border-white/10 rounded text-base text-white font-mono"
                />
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-0.5">Max OVR</label>
                <input
                  type="number"
                  inputMode="numeric"
                  min={draftMinOvr}
                  max={99}
                  value={draftMaxOvr}
                  onChange={e => setDraftMaxOvr(Math.min(99, Math.max(Number(e.target.value), draftMinOvr)))}
                  className="w-full min-h-11 px-2.5 py-1.5 bg-slate-950 border border-white/10 rounded text-base text-white font-mono"
                />
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5 pt-1">
              <button
                type="button"
                onClick={() => { setDraftMinOvr(70); setDraftMaxOvr(99); }}
                className="px-3 py-1.5 min-h-11 text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 rounded cursor-pointer active:scale-95"
              >
                70+ OVR
              </button>
              <button
                type="button"
                onClick={() => { setDraftMinOvr(75); setDraftMaxOvr(99); }}
                className="px-3 py-1.5 min-h-11 text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 rounded cursor-pointer active:scale-95"
              >
                75+ OVR
              </button>
              <button
                type="button"
                onClick={() => { setDraftMinOvr(80); setDraftMaxOvr(99); }}
                className="px-3 py-1.5 min-h-11 text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 rounded cursor-pointer active:scale-95"
              >
                80+ Stars
              </button>
            </div>
          </div>

          {/* Growth Momentum */}
          <div>
            <label htmlFor="sheet-market-momentum" className="block text-xs font-semibold text-slate-300 mb-1">
              Growth Momentum
            </label>
            <select
              id="sheet-market-momentum"
              value={draftMomentum}
              onChange={e => setDraftMomentum(e.target.value as GrowthMomentum | 'ALL')}
              className="w-full min-h-11 px-3 py-2 bg-slate-900 border border-white/10 rounded-lg text-base text-slate-200 focus:outline-none focus:border-amber-400"
            >
              <option value="ALL">All Momentums</option>
              <option value="breakout">🚀 Breakout Prodigy</option>
              <option value="rapid">📈 Rapid Climber</option>
              <option value="prime">⭐ Peak Prime</option>
              <option value="steady">⚖️ Steady Growth</option>
              <option value="cooling">📉 Cooling Down</option>
            </select>
          </div>

          {/* Budget Feasibility */}
          <div className="bg-slate-900/60 p-3 rounded-lg border border-white/5 space-y-1.5">
            <span className="text-slate-300 font-semibold text-xs block mb-1">Budget Feasibility</span>
            <label className="flex items-center gap-2.5 min-h-11 text-xs text-slate-300 cursor-pointer select-none hover:text-white">
              <input
                type="checkbox"
                checked={draftAffordableFee}
                onChange={e => setDraftAffordableFee(e.target.checked)}
                className="w-5 h-5 rounded bg-slate-950 border-white/20 text-amber-400 focus:ring-0 focus:ring-offset-0 cursor-pointer"
              />
              <span>Within War Chest (£{(currentClub.transferBudget / 1000000).toFixed(1)}M)</span>
            </label>
            <label className="flex items-center gap-2.5 min-h-11 text-xs text-slate-300 cursor-pointer select-none hover:text-white">
              <input
                type="checkbox"
                checked={draftAffordableWage}
                onChange={e => setDraftAffordableWage(e.target.checked)}
                className="w-5 h-5 rounded bg-slate-950 border-white/20 text-emerald-400 focus:ring-0 focus:ring-offset-0 cursor-pointer"
              />
              <span>Within Wage Space (£{(wageSpaceRemaining / 1000).toFixed(0)}k/wk)</span>
            </label>
          </div>
        </div>
      </Modal>

    </div>
  );
};
