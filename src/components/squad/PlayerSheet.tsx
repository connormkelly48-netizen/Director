/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect } from 'react';
import { Coins, Tag, Trash2, X, ShieldAlert, CheckCircle2, AlertTriangle, RefreshCw } from 'lucide-react';
import { Player, SlotRole } from '../../types/game';
import { getSlotFit, SlotFitResult } from '../../utils/lineup';
import { PlayerCard } from './PlayerCard';

interface PlayerSheetProps {
  player: Player | null;
  occupancyLabel: string;
  slotRole?: SlotRole;
  mode: 'panel' | 'sheet';
  isOpen: boolean;
  onClose: () => void;
  onSell: (player: Player) => void;
  onOffer: (player: Player) => void;
  onRenew: (player: Player) => void;
  onRelease: (player: Player) => void;
}

const getMomentumLabel = (momentum: Player['growthMomentum']) => {
  switch (momentum) {
    case 'breakout': return 'Breakout';
    case 'rapid': return 'Rapid';
    case 'prime': return 'Prime';
    case 'cooling': return 'Cooling';
    default: return 'Steady';
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

const getMoraleLabel = (morale: Player['morale']) => {
  return morale.charAt(0).toUpperCase() + morale.slice(1);
};

function renderFitSummary(fitResult: SlotFitResult | null, slotRole?: SlotRole, occupancyLabel?: string) {
  if (!fitResult || !slotRole) {
    return (
      <div className="bg-slate-900/80 border border-white/10 rounded-xl px-3.5 py-2.5 flex items-center justify-between text-xs">
        <span className="text-slate-400 font-semibold">Squad Role</span>
        <span className="font-bold text-slate-200">{occupancyLabel || 'Reserves'}</span>
      </div>
    );
  }

  const badge =
    fitResult.fit === 'natural'
      ? {
          icon: <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />,
          label: `Natural ${slotRole}`,
          color: 'text-emerald-400',
          border: 'border-emerald-500/30 bg-emerald-500/10',
        }
      : fitResult.fit === 'good'
        ? {
            icon: <CheckCircle2 className="w-4 h-4 text-sky-400 shrink-0" />,
            label: `Secondary ${slotRole} (${fitResult.penalty})`,
            color: 'text-sky-300',
            border: 'border-sky-500/30 bg-sky-500/10',
          }
        : fitResult.fit === 'poor'
          ? {
              icon: <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />,
              label: `Out of Position ${slotRole} (${fitResult.penalty})`,
              color: 'text-amber-300',
              border: 'border-amber-500/35 bg-amber-500/10',
            }
          : {
              icon: <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0" />,
              label: `Unnatural ${slotRole} (${fitResult.penalty})`,
              color: 'text-rose-300',
              border: 'border-rose-500/35 bg-rose-500/10',
            };

  return (
    <div className={`border rounded-xl px-3.5 py-2.5 flex items-center justify-between gap-2 text-xs ${badge.border}`}>
      <div className="flex items-center gap-2 min-w-0">
        {badge.icon}
        <span className={`font-bold truncate ${badge.color}`}>{badge.label}</span>
      </div>
      <span className="font-mono font-extrabold text-white tabular-nums shrink-0">
        {fitResult.effectiveOverall} Effective OVR
      </span>
    </div>
  );
}

export const PlayerSheet: React.FC<PlayerSheetProps> = ({
  player,
  occupancyLabel,
  slotRole,
  mode,
  isOpen,
  onClose,
  onSell,
  onOffer,
  onRenew,
  onRelease,
}) => {
  useEffect(() => {
    if (mode !== 'sheet' || !isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [mode, isOpen, onClose]);

  if (mode === 'panel') {
    if (!player) {
      return (
        <div className="bg-[#111827] border border-white/10 rounded-2xl p-5 text-center space-y-1.5">
          <p className="text-sm font-bold text-slate-200">Select a Player</p>
          <p className="text-xs text-slate-400">
            Tap any player on the pitch, bench, or reserves to inspect stats, slot fit, and contract actions.
          </p>
        </div>
      );
    }

    const fitResult = slotRole ? getSlotFit(player, slotRole) : null;
    const formPct = Math.max(0, Math.min(100, (player.form / 10) * 100));

    return (
      <div className="bg-[#111827] border border-white/10 rounded-2xl overflow-hidden">
        <div className="p-4 border-b border-white/10 flex items-start justify-between gap-3">
          <div className="flex items-center gap-3.5 min-w-0">
            <PlayerCard player={player} variant="detail" />
            <div className="min-w-0 space-y-1">
              <h3 className="text-lg font-extrabold text-white truncate">{player.name}</h3>
              <p className="text-xs font-semibold text-amber-400">
                {player.position} · {player.roleDetail}
              </p>
              <p className="text-xs text-slate-400">
                Age {player.age} · {player.nationality}
              </p>
              {player.isInjured && (
                <p className="text-xs font-bold text-rose-400">
                  Injured ({player.injuryWeeks ?? 1}w out)
                </p>
              )}
              {player.retiringAtSeasonEnd && (
                <p className="text-xs font-bold text-amber-300">
                  Retiring at Season End
                </p>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Clear selected player"
            className="min-h-11 min-w-11 flex items-center justify-center rounded-xl text-slate-400 hover:text-white hover:bg-white/10 cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {renderFitSummary(fitResult, slotRole, occupancyLabel)}

          {/* Form bar + Morale */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-slate-900/80 border border-white/5 rounded-xl p-3 space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400">Form</span>
                <span className="font-mono font-bold text-white tabular-nums">{player.form.toFixed(1)} / 10</span>
              </div>
              <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
                <div
                  className={`h-full rounded-full ${
                    player.form >= 7.5 ? 'bg-emerald-400' : player.form <= 5.5 ? 'bg-rose-500' : 'bg-amber-400'
                  }`}
                  style={{ width: `${formPct}%` }}
                />
              </div>
            </div>

            <div className="bg-slate-900/80 border border-white/5 rounded-xl p-3 space-y-1">
              <span className="text-xs text-slate-400 block">Morale</span>
              <span className="text-xs font-bold text-white block">
                {getMoraleLabel(player.morale)} ({player.happiness}%)
              </span>
            </div>
          </div>

          {/* Contract & Valuation */}
          <div className="grid grid-cols-2 gap-2.5 text-xs">
            <div className="bg-slate-900/70 border border-white/5 rounded-xl p-3">
              <span className="text-slate-400 block">Contract</span>
              <span className={`font-mono font-bold tabular-nums ${player.contractYears <= 1 ? 'text-amber-400' : 'text-white'}`}>
                {player.contractYears} {player.contractYears === 1 ? 'yr' : 'yrs'} · £{(player.wage / 1000).toFixed(0)}k/wk
              </span>
            </div>
            <div className="bg-slate-900/70 border border-white/5 rounded-xl p-3">
              <span className="text-slate-400 block">Market Value</span>
              <span className="font-mono font-bold text-emerald-400 tabular-nums">
                £{(player.value / 1000000).toFixed(2)}M
              </span>
            </div>
            <div className="bg-slate-900/70 border border-white/5 rounded-xl p-3">
              <span className="text-slate-400 block">Momentum</span>
              <span className={`font-bold ${getMomentumColorClass(player.growthMomentum)}`}>
                {getMomentumLabel(player.growthMomentum)}
              </span>
            </div>
            <div className="bg-slate-900/70 border border-white/5 rounded-xl p-3">
              <span className="text-slate-400 block">Season Stats</span>
              <span className="font-mono font-bold text-slate-200 tabular-nums">
                {player.appearances}A · {player.goals}G · {player.assists}A · {player.cleanSheets}CS
              </span>
            </div>
          </div>
        </div>

        <div className="p-4 pt-3 border-t border-white/10 bg-slate-900/50 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => onSell(player)}
            className="min-h-11 px-3 py-2 text-xs font-bold bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/35 text-emerald-300 rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5"
          >
            <Coins className="w-4 h-4" />
            <span>Sell</span>
          </button>
          <button
            type="button"
            onClick={() => onOffer(player)}
            className="min-h-11 px-3 py-2 text-xs font-bold bg-amber-400/10 hover:bg-amber-400/20 border border-amber-400/30 text-amber-300 rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5"
          >
            <Tag className="w-4 h-4" />
            <span>Offer</span>
          </button>
          <button
            type="button"
            onClick={() => onRenew(player)}
            className="min-h-11 px-3 py-2 text-xs font-bold bg-white/5 hover:bg-white/10 border border-white/10 text-slate-200 hover:text-white rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5"
          >
            <RefreshCw className="w-4 h-4" />
            <span>Renew</span>
          </button>
          <button
            type="button"
            onClick={() => onRelease(player)}
            className="min-h-11 px-3 py-2 text-xs font-bold bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/25 text-rose-300 rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5"
          >
            <Trash2 className="w-4 h-4" />
            <span>Release</span>
          </button>
        </div>
      </div>
    );
  }

  // Sheet mode: full-height scrollable bottom sheet on phones, right-hand side panel on desktop
  if (!isOpen || !player) return null;

  const fitResult = slotRole ? getSlotFit(player, slotRole) : null;
  const formPct = Math.max(0, Math.min(100, (player.form / 10) * 100));

  return (
    <div
      onClick={e => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-50 bg-[#070a0f]/80 flex items-end lg:items-stretch lg:justify-end safe-area-modal-backdrop"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`${player.name} details`}
        className="w-full lg:max-w-md bg-[#111827] border-t lg:border-t-0 lg:border-l border-white/15 rounded-t-3xl lg:rounded-none shadow-2xl max-h-[92dvh] lg:max-h-dvh lg:h-full flex flex-col overflow-hidden"
      >
        {/* Drag handle on mobile */}
        <div className="lg:hidden pt-2.5 pb-1 flex justify-center shrink-0">
          <div className="w-10 h-1.5 rounded-full bg-white/20" />
        </div>

        {/* Sticky Header */}
        <div className="shrink-0 px-4 sm:px-6 pt-2 lg:pt-5 pb-4 border-b border-white/10 flex items-start justify-between gap-3">
          <div className="flex items-center gap-3.5 min-w-0">
            <PlayerCard player={player} variant="detail" />
            <div className="min-w-0 space-y-1">
              <h3 className="text-lg font-extrabold text-white truncate">{player.name}</h3>
              <p className="text-xs font-bold text-amber-400">
                {player.position} · {player.roleDetail}
              </p>
              <p className="text-xs text-slate-300">
                Age {player.age} · {player.nationality}
              </p>
              {player.isInjured && (
                <p className="text-xs font-bold text-rose-400">
                  Injured · {player.injuryWeeks ?? 1} weeks remaining
                </p>
              )}
              {player.retiringAtSeasonEnd && (
                <p className="text-xs font-bold text-amber-300">
                  Retiring at Season End
                </p>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close player details"
            className="min-h-11 min-w-11 flex items-center justify-center rounded-xl text-slate-400 hover:text-white hover:bg-white/10 cursor-pointer shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 sm:px-6 py-4 space-y-4">
          {renderFitSummary(fitResult, slotRole, occupancyLabel)}

          {/* Form & Morale */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-slate-900/80 border border-white/10 rounded-xl p-3 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400 font-semibold">Form</span>
                <span className="font-mono font-bold text-white tabular-nums">{player.form.toFixed(1)} / 10</span>
              </div>
              <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
                <div
                  className={`h-full rounded-full ${
                    player.form >= 7.5 ? 'bg-emerald-400' : player.form <= 5.5 ? 'bg-rose-500' : 'bg-amber-400'
                  }`}
                  style={{ width: `${formPct}%` }}
                />
              </div>
            </div>

            <div className="bg-slate-900/80 border border-white/10 rounded-xl p-3 space-y-1">
              <span className="text-xs text-slate-400 font-semibold block">Morale</span>
              <span className="text-sm font-bold text-white block">
                {getMoraleLabel(player.morale)}
              </span>
              <span className="text-xs font-mono text-slate-400 tabular-nums">{player.happiness}% happiness</span>
            </div>
          </div>

          {/* Financials & Growth */}
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="bg-slate-900/80 border border-white/10 rounded-xl p-3 space-y-1">
              <span className="text-slate-400 font-semibold block">Contract</span>
              <span className={`text-sm font-mono font-bold tabular-nums block ${player.contractYears <= 1 ? 'text-amber-400' : 'text-white'}`}>
                {player.contractYears} {player.contractYears === 1 ? 'Year' : 'Years'}
              </span>
              <span className="text-xs font-mono text-emerald-400 tabular-nums">
                £{(player.wage / 1000).toFixed(0)}k / week
              </span>
            </div>

            <div className="bg-slate-900/80 border border-white/10 rounded-xl p-3 space-y-1">
              <span className="text-slate-400 font-semibold block">Market Value</span>
              <span className="text-sm font-mono font-bold text-white tabular-nums block">
                £{(player.value / 1000000).toFixed(2)}M
              </span>
              <span className={`text-xs font-bold block ${getMomentumColorClass(player.growthMomentum)}`}>
                {getMomentumLabel(player.growthMomentum)} Growth
              </span>
            </div>
          </div>

          {/* Season Statistics */}
          <div className="bg-slate-900/80 border border-white/10 rounded-xl p-3.5 space-y-2">
            <span className="text-xs font-bold text-slate-300 block">Season Record</span>
            <div className="grid grid-cols-4 gap-2 text-center">
              <div>
                <span className="text-xs text-slate-400 block">Apps</span>
                <span className="text-sm font-mono font-extrabold text-white tabular-nums">{player.appearances}</span>
              </div>
              <div>
                <span className="text-xs text-slate-400 block">Goals</span>
                <span className="text-sm font-mono font-extrabold text-amber-400 tabular-nums">{player.goals}</span>
              </div>
              <div>
                <span className="text-xs text-slate-400 block">Assists</span>
                <span className="text-sm font-mono font-extrabold text-emerald-400 tabular-nums">{player.assists}</span>
              </div>
              <div>
                <span className="text-xs text-slate-400 block">Clean Sh.</span>
                <span className="text-sm font-mono font-extrabold text-sky-400 tabular-nums">{player.cleanSheets}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Sticky Bottom Actions */}
        <div className="shrink-0 px-4 sm:px-6 pt-3 safe-area-modal-footer lg:pb-5 border-t border-white/10 bg-[#111827] grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => onSell(player)}
            className="min-h-11 px-3 py-2 text-xs font-bold bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/35 text-emerald-300 rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5"
          >
            <Coins className="w-4 h-4" />
            <span>Sell</span>
          </button>
          <button
            type="button"
            onClick={() => onOffer(player)}
            className="min-h-11 px-3 py-2 text-xs font-bold bg-amber-400/10 hover:bg-amber-400/20 border border-amber-400/30 text-amber-300 rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5"
          >
            <Tag className="w-4 h-4" />
            <span>Offer</span>
          </button>
          <button
            type="button"
            onClick={() => onRenew(player)}
            className="min-h-11 px-3 py-2 text-xs font-bold bg-white/5 hover:bg-white/10 border border-white/10 text-slate-200 hover:text-white rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5"
          >
            <RefreshCw className="w-4 h-4" />
            <span>Renew</span>
          </button>
          <button
            type="button"
            onClick={() => onRelease(player)}
            className="min-h-11 px-3 py-2 text-xs font-bold bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/25 text-rose-300 rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5"
          >
            <Trash2 className="w-4 h-4" />
            <span>Release</span>
          </button>
        </div>
      </div>
    </div>
  );
};
