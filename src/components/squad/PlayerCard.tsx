/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { ArrowDown, ArrowUp, Plus } from 'lucide-react';
import { Player, SlotRole } from '../../types/game';
import { SlotFitLevel, getInitials, getSurname } from '../../utils/lineup';

export type PlayerCardVariant = 'pitch' | 'rack' | 'detail';

interface PlayerCardProps {
  player: Player;
  variant?: PlayerCardVariant;
  effectiveOverall?: number;
  penalty?: number;
  fitLevel?: SlotFitLevel;
  slotRole?: SlotRole;
  subLabel?: string;
  isSelected?: boolean;
  isSwapTarget?: boolean;
  isDropHovered?: boolean;
  layoutId?: string;
  onClick?: () => void;
  onPointerDown?: (e: React.PointerEvent<HTMLButtonElement>) => void;
  dropZone?: 'pitch' | 'bench' | 'reserve';
  dropIndex?: number;
}

interface TierStyle {
  background: string;
  borderColor: string;
  textColor: string;
  accentColor: string;
  isIconic?: boolean;
}

function getTierStyle(overall: number): TierStyle {
  if (overall >= 90) {
    return {
      background: 'linear-gradient(145deg, #4c1d95 0%, #7e22ce 48%, #b45309 100%)',
      borderColor: '#fde047',
      textColor: '#fefce8',
      accentColor: '#fde047',
      isIconic: true,
    };
  }
  if (overall >= 85) {
    return {
      background: 'linear-gradient(145deg, #0f4c5c 0%, #0284c7 52%, #0d9488 100%)',
      borderColor: '#38bdf8',
      textColor: '#f0f9ff',
      accentColor: '#7dd3fc',
    };
  }
  if (overall >= 75) {
    return {
      background: 'linear-gradient(145deg, #784809 0%, #d97706 50%, #92400e 100%)',
      borderColor: '#fbbf24',
      textColor: '#fffbeb',
      accentColor: '#fde68a',
    };
  }
  if (overall >= 65) {
    return {
      background: 'linear-gradient(145deg, #475569 0%, #94a3b8 50%, #334155 100%)',
      borderColor: '#e2e8f0',
      textColor: '#ffffff',
      accentColor: '#f1f5f9',
    };
  }
  return {
    background: 'linear-gradient(145deg, #643c1c 0%, #9a6033 50%, #432610 100%)',
    borderColor: '#d49463',
    textColor: '#ffedd5',
    accentColor: '#fed7aa',
  };
}

function getFitRingClass(fitLevel?: SlotFitLevel): string {
  switch (fitLevel) {
    case 'natural':
      return 'ring-2 ring-emerald-400/90';
    case 'poor':
      return 'ring-2 ring-amber-400';
    case 'bad':
      return 'ring-2 ring-rose-500';
    default:
      return '';
  }
}

export const PlayerCard: React.FC<PlayerCardProps> = ({
  player,
  variant = 'pitch',
  effectiveOverall,
  penalty = 0,
  fitLevel,
  subLabel,
  isSelected = false,
  isSwapTarget = false,
  isDropHovered = false,
  layoutId,
  onClick,
  onPointerDown,
  dropZone,
  dropIndex,
}) => {
  const prefersReducedMotion = useReducedMotion();
  const tier = getTierStyle(player.overall);
  const displayRating = variant === 'pitch' && effectiveOverall !== undefined ? effectiveOverall : player.overall;
  const surname = getSurname(player.name);
  const initials = getInitials(player.name);

  // Max 2 badges in priority order: injured > expiring contract > high form > low form
  const badges: Array<{ key: string; kind: 'injured' | 'contract' | 'formUp' | 'formDown'; label: string }> = [];
  if (player.isInjured) {
    badges.push({ key: 'inj', kind: 'injured', label: 'Injured' });
  }
  if (player.contractYears <= 1 && badges.length < 2) {
    badges.push({ key: 'exp', kind: 'contract', label: 'Contract expiring' });
  }
  if (player.form >= 7.5 && badges.length < 2) {
    badges.push({ key: 'fup', kind: 'formUp', label: 'Hot form' });
  } else if (player.form <= 5.5 && badges.length < 2) {
    badges.push({ key: 'fdn', kind: 'formDown', label: 'Poor form' });
  }

  const dimensionsClass =
    variant === 'pitch'
      ? 'w-[56px] h-[68px]'
      : variant === 'rack'
        ? 'w-[64px] h-[80px]'
        : 'w-[84px] h-[106px]';

  let ringClass = '';
  if (isSelected) {
    ringClass = 'ring-2 ring-amber-300 shadow-[0_0_18px_rgba(251,191,36,0.8)] scale-105';
  } else if (isDropHovered) {
    ringClass = 'ring-2 ring-amber-300 shadow-[0_0_14px_rgba(251,191,36,0.65)] scale-105';
  } else if (isSwapTarget) {
    ringClass = prefersReducedMotion
      ? 'ring-2 ring-amber-300/80'
      : 'ring-2 ring-amber-300/80 animate-pulse';
  } else if (variant === 'pitch') {
    ringClass = getFitRingClass(fitLevel);
  }

  const showPenaltyPill = variant === 'pitch' && penalty < 0;
  const isSeverePenalty = Math.abs(penalty) >= 12;
  const badgeSizeClass = variant === 'pitch' ? 'w-3.5 h-3.5' : 'w-4 h-4';
  const badgeIconClass = variant === 'pitch' ? 'w-2 h-2 stroke-[3]' : 'w-2.5 h-2.5 stroke-[3]';

  const cardContent = (
    <div
      className={`relative ${dimensionsClass} rounded-xl border select-none overflow-hidden shadow-lg transition-transform duration-150 ${ringClass}`}
      style={{
        background: tier.background,
        borderColor: tier.borderColor,
        color: tier.textColor,
      }}
    >
      {/* Subtle 90+ diagonal shine */}
      {tier.isIconic && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-30"
          style={{
            background:
              'linear-gradient(125deg, transparent 20%, rgba(254, 240, 138, 0.55) 48%, transparent 72%)',
          }}
        />
      )}

      {/* Top dark scrim for rating legibility */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-black/30 to-transparent"
      />

      {/* Top-left rating (alone) + position directly underneath */}
      <div className="relative z-10 flex flex-col items-start leading-none pl-1.5 pt-1 max-w-[32px]">
        <span
          className={`font-extrabold tabular-nums tracking-tight leading-none ${
            variant === 'pitch'
              ? 'text-sm'
              : variant === 'rack'
                ? 'text-base'
                : 'text-xl'
          }`}
          style={{ textShadow: '0 1px 2px rgba(0,0,0,0.65)' }}
        >
          {displayRating}
        </span>
        <span
          className={`font-bold uppercase tracking-tight leading-none mt-0.5 ${
            variant === 'pitch' ? 'text-[10px]' : 'text-xs'
          }`}
          style={{ color: tier.accentColor, textShadow: '0 1px 2px rgba(0,0,0,0.75)' }}
        >
          {player.position}
        </span>
      </div>

      {/* Top-right badges (max 2) */}
      {badges.length > 0 && (
        <div className="absolute top-1 right-1 z-20 flex flex-col items-end gap-0.5">
          {badges.map(badge => {
            if (badge.kind === 'injured') {
              return (
                <span
                  key={badge.key}
                  title={badge.label}
                  className={`${badgeSizeClass} rounded-full bg-rose-600 border border-white/70 flex items-center justify-center shadow`}
                >
                  <Plus className={`${badgeIconClass} text-white`} />
                </span>
              );
            }
            if (badge.kind === 'contract') {
              return (
                <span
                  key={badge.key}
                  title={badge.label}
                  className={`${badgeSizeClass} rounded-full bg-amber-400 border border-slate-950 text-slate-950 font-extrabold text-[10px] leading-none flex items-center justify-center shadow`}
                >
                  !
                </span>
              );
            }
            if (badge.kind === 'formUp') {
              return (
                <span
                  key={badge.key}
                  title={badge.label}
                  className={`${badgeSizeClass} rounded-full bg-emerald-500 border border-white/60 text-white flex items-center justify-center shadow`}
                >
                  <ArrowUp className={badgeIconClass} />
                </span>
              );
            }
            return (
              <span
                key={badge.key}
                title={badge.label}
                className={`${badgeSizeClass} rounded-full bg-rose-600 border border-white/60 text-white flex items-center justify-center shadow`}
              >
                <ArrowDown className={badgeIconClass} />
              </span>
            );
          })}
        </div>
      )}

      {/* Shirt & initials icon (shifted left on pitch when penalty pill is shown) */}
      <div
        aria-hidden="true"
        className={`absolute bottom-1 flex items-center pointer-events-none ${
          showPenaltyPill ? 'left-1 justify-start' : 'inset-x-0 justify-center'
        } ${variant === 'pitch' ? 'opacity-90' : 'opacity-95'}`}
      >
        <div className="relative flex items-center justify-center">
          <svg
            viewBox="0 0 36 32"
            className={
              variant === 'pitch'
                ? showPenaltyPill
                  ? 'w-6 h-5'
                  : 'w-7 h-6'
                : variant === 'rack'
                  ? 'w-9 h-8'
                  : 'w-12 h-11'
            }
          >
            <path
              d="M11 3 L14 6 C16 7.5 20 7.5 22 6 L25 3 L33 7.5 L30 14 L26 12.5 L26 29 L10 29 L10 12.5 L6 14 L3 7.5 Z"
              fill="rgba(15, 23, 42, 0.42)"
              stroke="rgba(255, 255, 255, 0.55)"
              strokeWidth="1.5"
              strokeLinejoin="round"
            />
          </svg>
          <span
            className={`absolute font-extrabold tracking-tight text-white/95 ${
              showPenaltyPill ? 'text-[9px]' : 'text-xs'
            }`}
            style={{ textShadow: '0 1px 2px rgba(0,0,0,0.8)' }}
          >
            {initials}
          </span>
        </div>
      </div>

      {/* Out-of-position penalty pill at bottom-right */}
      {showPenaltyPill && (
        <span
          className={`absolute bottom-1 right-1 z-20 px-1 py-0.5 rounded-full text-[10px] font-extrabold tabular-nums leading-none border shadow ${
            isSeverePenalty
              ? 'bg-rose-600 border-rose-200/80 text-white'
              : 'bg-amber-400 border-amber-100/80 text-slate-950'
          }`}
        >
          {penalty}
        </span>
      )}
    </div>
  );

  if (variant === 'detail') {
    return <div className="inline-flex flex-col items-center">{cardContent}</div>;
  }

  return (
    <motion.button
      type="button"
      layout={!prefersReducedMotion}
      layoutId={prefersReducedMotion ? undefined : layoutId}
      transition={{ type: 'spring', stiffness: 460, damping: 34 }}
      onClick={onClick}
      onPointerDown={onPointerDown}
      data-drop-zone={dropZone}
      data-drop-index={dropIndex !== undefined ? String(dropIndex) : undefined}
      data-drop-player-id={dropZone === 'reserve' ? player.id : undefined}
      aria-label={`${player.name}, ${player.position}, rating ${displayRating}${penalty < 0 ? `, penalty ${penalty}` : ''}${player.isInjured ? ', injured' : ''}`}
      aria-pressed={isSelected}
      className="group relative flex flex-col items-center justify-start focus:outline-none cursor-pointer touch-manipulation min-w-[44px] min-h-[44px]"
    >
      {cardContent}

      <span
        className={`mt-0.5 text-xs font-bold text-white leading-tight truncate text-center ${
          variant === 'pitch' ? 'max-w-[68px]' : 'max-w-[74px]'
        }`}
        style={{
          textShadow: '0 1px 3px rgba(0,0,0,0.95), 0 0 6px rgba(0,0,0,0.85)',
        }}
      >
        {surname}
      </span>

      {subLabel && (
        <span className="text-xs font-semibold text-slate-400 leading-tight truncate max-w-[74px]">
          {subLabel}
        </span>
      )}
    </motion.button>
  );
};

interface EmptySlotTokenProps {
  label: string;
  variant?: 'pitch' | 'bench';
  isSwapTarget?: boolean;
  isDropHovered?: boolean;
  onClick?: () => void;
  dropZone: 'pitch' | 'bench';
  dropIndex: number;
}

export const EmptySlotToken: React.FC<EmptySlotTokenProps> = ({
  label,
  variant = 'pitch',
  isSwapTarget = false,
  isDropHovered = false,
  onClick,
  dropZone,
  dropIndex,
}) => {
  const prefersReducedMotion = useReducedMotion();

  if (variant === 'bench') {
    return (
      <button
        type="button"
        onClick={onClick}
        data-drop-zone={dropZone}
        data-drop-index={String(dropIndex)}
        aria-label={`Empty ${label} slot`}
        className={`flex flex-col items-center justify-start cursor-pointer min-w-[44px] min-h-[44px] ${
          isDropHovered ? 'scale-105' : ''
        }`}
      >
        <div
          className={`w-[64px] h-[80px] rounded-xl border-2 border-dashed flex flex-col items-center justify-center gap-1 transition-colors ${
            isDropHovered
              ? 'border-amber-300 bg-amber-400/20 text-amber-200'
              : isSwapTarget
                ? `border-amber-400 bg-amber-400/15 text-amber-300 ${prefersReducedMotion ? '' : 'animate-pulse'}`
                : 'border-white/25 bg-slate-900/60 text-slate-300 hover:border-amber-400/60'
          }`}
        >
          <Plus className="w-5 h-5" />
        </div>
        <span className="mt-0.5 text-xs font-bold text-slate-400">{label}</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      data-drop-zone={dropZone}
      data-drop-index={String(dropIndex)}
      aria-label={`Empty ${label} slot`}
      className={`flex flex-col items-center justify-center cursor-pointer min-w-[48px] min-h-[48px] ${
        isDropHovered ? 'scale-105' : ''
      }`}
    >
      <div
        className={`w-[50px] h-[50px] rounded-full border-2 border-dashed flex items-center justify-center transition-colors shadow-inner ${
          isDropHovered
            ? 'border-amber-300 bg-amber-400/25 text-amber-200'
            : isSwapTarget
              ? `border-amber-300 bg-amber-400/20 text-amber-200 ${prefersReducedMotion ? '' : 'animate-pulse'}`
              : 'border-white/45 bg-black/30 text-white/85 hover:border-amber-300'
        }`}
      >
        <Plus className="w-5 h-5" />
      </div>
      <span
        className="mt-0.5 text-xs font-bold text-white leading-tight"
        style={{ textShadow: '0 1px 3px rgba(0,0,0,0.95)' }}
      >
        {label}
      </span>
    </button>
  );
};
