/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { MotionConfig } from 'motion/react';
import { ChevronDown, Info, MoreHorizontal, RotateCcw, Sparkles, Trash2, X } from 'lucide-react';
import { Club, FormationId, Lineup, Manager, Player, SlotRole } from '../../types/game';
import { FORMATIONS } from '../../data/formations';
import {
  autoPickLineup,
  changeFormation,
  computeTeamRating,
  getDefaultFormation,
  getReserves,
  getSlotFit,
} from '../../utils/lineup';
import { sounds } from '../../services/soundEffects';
import { EmptySlotToken, PlayerCard } from './PlayerCard';
import { FormationSheet } from './FormationSheet';
import { BenchStrip, SelectionTarget } from './BenchStrip';
import { ReservesGrid } from './ReservesGrid';
import { PlayerSheet } from './PlayerSheet';

interface PitchViewProps {
  club: Club;
  manager?: Manager;
  lineup: Lineup;
  onChangeLineup: (next: Lineup) => void;
  onSell: (player: Player) => void;
  onOffer: (player: Player) => void;
  onRenew: (player: Player) => void;
  onRelease: (player: Player) => void;
}

interface DragState {
  source: SelectionTarget;
  player: Player;
  x: number;
  y: number;
  active: boolean;
}

export const PitchView: React.FC<PitchViewProps> = ({
  club,
  manager,
  lineup,
  onChangeLineup,
  onSell,
  onOffer,
  onRenew,
  onRelease,
}) => {
  const [selection, setSelection] = useState<SelectionTarget | null>(null);
  const [showFormationSheet, setShowFormationSheet] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [mobileRackTab, setMobileRackTab] = useState<'bench' | 'reserves'>('bench');
  const [mobileInfoPlayerId, setMobileInfoPlayerId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [hoveredDropKey, setHoveredDropKey] = useState<string | null>(null);

  const menuRef = useRef<HTMLDivElement>(null);
  const toastTimerRef = useRef<number | null>(null);
  const suppressClickRef = useRef(false);

  const formationDef = FORMATIONS[lineup.formation] || FORMATIONS['4-3-3'];
  const managerFormation = useMemo(() => getDefaultFormation(manager), [manager]);

  const playersById = useMemo(
    () => new Map(club.squad.map(p => [p.id, p])),
    [club.squad]
  );

  const reserves = useMemo(
    () => getReserves(lineup, club.squad),
    [lineup, club.squad]
  );

  const teamRating = useMemo(
    () => computeTeamRating(lineup, club.squad),
    [lineup, club.squad]
  );

  const benchCount = useMemo(
    () => lineup.bench.filter(id => playersById.has(id)).length,
    [lineup.bench, playersById]
  );

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimerRef.current !== null) {
      window.clearTimeout(toastTimerRef.current);
    }
    toastTimerRef.current = window.setTimeout(() => {
      setToast(null);
    }, 2800);
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current !== null) {
        window.clearTimeout(toastTimerRef.current);
      }
    };
  }, []);

  // Close "..." menu on outside click
  useEffect(() => {
    if (!showMoreMenu) return;
    const handleOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMoreMenu(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [showMoreMenu]);

  // Clear selection if selected player is no longer in squad
  useEffect(() => {
    if (selection?.playerId && !playersById.has(selection.playerId)) {
      setSelection(null);
    }
  }, [playersById, selection]);

  const selectedPlayer: Player | null = useMemo(() => {
    if (!selection) return null;
    if (selection.zone === 'pitch' && selection.index !== undefined) {
      const id = lineup.slots[selection.index];
      return id ? playersById.get(id) ?? null : null;
    }
    if (selection.zone === 'bench' && selection.index !== undefined) {
      const id = lineup.bench[selection.index];
      return id ? playersById.get(id) ?? null : null;
    }
    if (selection.zone === 'reserve' && selection.playerId) {
      return playersById.get(selection.playerId) ?? null;
    }
    return null;
  }, [selection, lineup, playersById]);

  const selectedSlotInfo = useMemo(() => {
    if (!selection || !selectedPlayer) return { label: 'Reserves', slotRole: undefined as SlotRole | undefined };
    if (selection.zone === 'pitch' && selection.index !== undefined) {
      const role = formationDef.slots[selection.index]?.role;
      return { label: role ? `${role} Starter` : 'Starting XI', slotRole: role };
    }
    if (selection.zone === 'bench') {
      return { label: 'Substitutes Bench', slotRole: undefined };
    }
    return { label: 'Reserves', slotRole: undefined };
  }, [selection, selectedPlayer, formationDef]);

  const executeSwap = useCallback(
    (source: SelectionTarget, target: SelectionTarget) => {
      if (
        source.zone === target.zone &&
        source.index === target.index &&
        source.playerId === target.playerId
      ) {
        return;
      }

      const getPlayerAt = (t: SelectionTarget): Player | null => {
        if (t.zone === 'pitch' && t.index !== undefined) {
          const id = lineup.slots[t.index];
          return id ? playersById.get(id) ?? null : null;
        }
        if (t.zone === 'bench' && t.index !== undefined) {
          const id = lineup.bench[t.index];
          return id ? playersById.get(id) ?? null : null;
        }
        if (t.zone === 'reserve' && t.playerId) {
          return playersById.get(t.playerId) ?? null;
        }
        return null;
      };

      const sourcePlayer = getPlayerAt(source);
      const targetPlayer = getPlayerAt(target);

      // Block injured players from entering XI or Bench
      if (sourcePlayer?.isInjured && (target.zone === 'pitch' || target.zone === 'bench')) {
        sounds.playCrisis();
        showToast(`${sourcePlayer.name} is injured`);
        return;
      }
      if (targetPlayer?.isInjured && (source.zone === 'pitch' || source.zone === 'bench')) {
        sounds.playCrisis();
        showToast(`${targetPlayer.name} is injured`);
        return;
      }

      // Reserve <-> Reserve isn't a slot change; just switch selection
      if (source.zone === 'reserve' && target.zone === 'reserve') {
        if (targetPlayer) {
          setSelection(target);
        }
        return;
      }

      const nextSlots = [...lineup.slots];
      const nextBench = [...lineup.bench];

      const sourceId = sourcePlayer?.id ?? null;
      const targetId = targetPlayer?.id ?? null;

      if (source.zone === 'pitch' && target.zone === 'pitch') {
        if (source.index !== undefined && target.index !== undefined) {
          nextSlots[source.index] = targetId;
          nextSlots[target.index] = sourceId;
        }
      } else if (source.zone === 'bench' && target.zone === 'bench') {
        if (source.index !== undefined && target.index !== undefined) {
          const padded: (string | null)[] = Array.from({ length: 7 }, (_, i) => nextBench[i] ?? null);
          padded[source.index] = targetId;
          padded[target.index] = sourceId;
          const compact = padded.filter((id): id is string => Boolean(id));
          nextBench.splice(0, nextBench.length, ...compact);
        }
      } else if (source.zone === 'reserve') {
        if (!sourceId) return;
        if (target.zone === 'pitch' && target.index !== undefined) {
          nextSlots[target.index] = sourceId;
        } else if (target.zone === 'bench' && target.index !== undefined) {
          if (target.index < nextBench.length) {
            nextBench[target.index] = sourceId;
          } else if (nextBench.length < 7) {
            nextBench.push(sourceId);
          }
        }
      } else if (target.zone === 'reserve') {
        if (!targetId) return;
        if (source.zone === 'pitch' && source.index !== undefined) {
          nextSlots[source.index] = targetId;
        } else if (source.zone === 'bench' && source.index !== undefined) {
          nextBench[source.index] = targetId;
        }
      } else if (source.zone === 'pitch' && target.zone === 'bench') {
        if (source.index !== undefined && target.index !== undefined) {
          nextSlots[source.index] = targetId;
          if (targetId === null) {
            if (sourceId && nextBench.length < 7) {
              nextBench.push(sourceId);
            }
          } else if (sourceId) {
            nextBench[target.index] = sourceId;
          } else {
            nextBench.splice(target.index, 1);
          }
        }
      } else if (source.zone === 'bench' && target.zone === 'pitch') {
        if (source.index !== undefined && target.index !== undefined) {
          nextSlots[target.index] = sourceId;
          if (targetId) {
            nextBench[source.index] = targetId;
          } else {
            nextBench.splice(source.index, 1);
          }
        }
      }

      // Deduplicate just in case
      const seen = new Set<string>();
      const dedupedSlots = nextSlots.map(id => {
        if (!id || seen.has(id)) return null;
        seen.add(id);
        return id;
      });
      const dedupedBench = nextBench.filter(id => {
        if (!id || seen.has(id)) return false;
        seen.add(id);
        return true;
      }).slice(0, 7);

      sounds.playClick();
      onChangeLineup({
        ...lineup,
        slots: dedupedSlots,
        bench: dedupedBench,
        auto: false,
      });
      setSelection(null);
    },
    [lineup, playersById, onChangeLineup, showToast]
  );

  // Desktop pointer drag & drop
  const handlePointerStartDrag = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>, target: SelectionTarget, player: Player) => {
      if (e.pointerType !== 'mouse' || e.button !== 0) return;
      const startX = e.clientX;
      const startY = e.clientY;
      let dragging = false;

      const handleMove = (moveEvent: PointerEvent) => {
        const dx = moveEvent.clientX - startX;
        const dy = moveEvent.clientY - startY;
        if (!dragging && Math.hypot(dx, dy) > 8) {
          dragging = true;
          suppressClickRef.current = true;
          setDragState({
            source: target,
            player,
            x: moveEvent.clientX,
            y: moveEvent.clientY,
            active: true,
          });
        }
        if (dragging) {
          setDragState(prev => (prev ? { ...prev, x: moveEvent.clientX, y: moveEvent.clientY } : null));
          const elements = document.elementsFromPoint(moveEvent.clientX, moveEvent.clientY);
          const dropEl = elements.find(el => (el as HTMLElement).dataset?.dropZone) as HTMLElement | undefined;
          if (dropEl) {
            const z = dropEl.dataset.dropZone;
            const idx = dropEl.dataset.dropIndex;
            const pid = dropEl.dataset.dropPlayerId;
            setHoveredDropKey(z === 'reserve' ? `reserve:${pid}` : `${z}:${idx}`);
          } else {
            setHoveredDropKey(null);
          }
        }
      };

      const handleUp = (upEvent: PointerEvent) => {
        window.removeEventListener('pointermove', handleMove);
        window.removeEventListener('pointerup', handleUp);

        if (dragging) {
          const elements = document.elementsFromPoint(upEvent.clientX, upEvent.clientY);
          const dropEl = elements.find(el => (el as HTMLElement).dataset?.dropZone) as HTMLElement | undefined;
          if (dropEl) {
            const z = dropEl.dataset.dropZone as 'pitch' | 'bench' | 'reserve';
            const idx = dropEl.dataset.dropIndex !== undefined ? Number(dropEl.dataset.dropIndex) : undefined;
            const pid = dropEl.dataset.dropPlayerId;
            executeSwap(target, { zone: z, index: idx, playerId: pid });
          }
          setDragState(null);
          setHoveredDropKey(null);
          window.setTimeout(() => {
            suppressClickRef.current = false;
          }, 50);
        }
      };

      window.addEventListener('pointermove', handleMove);
      window.addEventListener('pointerup', handleUp);
    },
    [executeSwap]
  );

  const handleTapPitchSlot = (index: number, player: Player | null) => {
    if (suppressClickRef.current) return;
    if (!selection) {
      if (player) {
        sounds.playClick();
        setSelection({ zone: 'pitch', index, playerId: player.id });
      }
      return;
    }

    if (selection.zone === 'pitch' && selection.index === index) {
      sounds.playClick();
      setSelection(null);
      return;
    }

    executeSwap(selection, { zone: 'pitch', index, playerId: player?.id });
  };

  const handleTapBenchSlot = (index: number, player: Player | null) => {
    if (suppressClickRef.current) return;
    if (!selection) {
      if (player) {
        sounds.playClick();
        setSelection({ zone: 'bench', index, playerId: player.id });
      }
      return;
    }

    if (selection.zone === 'bench' && selection.index === index) {
      sounds.playClick();
      setSelection(null);
      return;
    }

    executeSwap(selection, { zone: 'bench', index, playerId: player?.id });
  };

  const handleTapReserve = (player: Player) => {
    if (suppressClickRef.current) return;
    if (!selection) {
      sounds.playClick();
      setSelection({ zone: 'reserve', playerId: player.id });
      return;
    }

    if (selection.zone === 'reserve' && selection.playerId === player.id) {
      sounds.playClick();
      setSelection(null);
      return;
    }

    if (selection.zone === 'reserve') {
      sounds.playClick();
      setSelection({ zone: 'reserve', playerId: player.id });
      return;
    }

    executeSwap(selection, { zone: 'reserve', playerId: player.id });
  };

  const handleSelectFormation = (newFormation: FormationId) => {
    if (newFormation === lineup.formation) return;
    const next = changeFormation(lineup, newFormation, club.squad);
    onChangeLineup(next);
    setSelection(null);
  };

  const handleToggleAuto = () => {
    sounds.playClick();
    if (lineup.auto) {
      onChangeLineup({ ...lineup, auto: false });
    } else {
      const picked = autoPickLineup(club, lineup.formation, manager);
      onChangeLineup(picked);
      setSelection(null);
    }
  };

  const handleBestXI = () => {
    sounds.playClick();
    const picked = autoPickLineup(club, lineup.formation, manager);
    onChangeLineup({ ...picked, auto: lineup.auto });
    setSelection(null);
    setShowMoreMenu(false);
  };

  const handleClearLineup = () => {
    sounds.playClick();
    onChangeLineup({
      ...lineup,
      slots: new Array(formationDef.slots.length).fill(null),
      auto: false,
    });
    setSelection(null);
    setShowMoreMenu(false);
  };

  const handleResetToManagerFormation = () => {
    sounds.playClick();
    const picked = autoPickLineup(club, managerFormation, manager);
    onChangeLineup(picked);
    setSelection(null);
    setShowMoreMenu(false);
  };

  const canSwapToPitchOrBench = Boolean(selection && !selectedPlayer?.isInjured);

  const mobileInfoPlayer = mobileInfoPlayerId ? playersById.get(mobileInfoPlayerId) ?? null : null;

  return (
    <MotionConfig reducedMotion="user">
      <div className="space-y-4">
        {/* Toast feedback (e.g., injured player blocked) */}
        {toast && (
          <div
            role="status"
            aria-live="polite"
            className="fixed bottom-20 lg:bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-xl bg-rose-950/95 border border-rose-500/50 text-rose-100 text-xs font-bold shadow-2xl whitespace-nowrap"
          >
            {toast}
          </div>
        )}

        {/* Two-column container on 1024px+, single column on mobile/tablet */}
        <div className="lg:grid lg:grid-cols-[minmax(0,440px)_1fr] xl:grid-cols-[minmax(0,540px)_1fr] lg:gap-6 lg:items-start space-y-4 lg:space-y-0">
          {/* LEFT COLUMN: Sticky Control Bar + Pitch + Selection Action Bar */}
          <div className="space-y-2.5">
            {/* Sticky Control Bar */}
            <div className="sticky top-[65px] lg:top-[115px] xl:top-[63px] z-30 bg-[#0b0f17] border border-slate-800 rounded-xl px-2.5 py-1.5 flex items-center justify-between gap-1.5 shadow-lg">
              {/* Formation button */}
              <button
                type="button"
                onClick={() => {
                  sounds.playClick();
                  setShowFormationSheet(true);
                }}
                className="min-h-11 px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-white/10 text-xs font-extrabold font-mono text-white flex items-center gap-1 cursor-pointer shrink-0 whitespace-nowrap"
              >
                <span>{lineup.formation}</span>
                <ChevronDown className="w-3.5 h-3.5 text-amber-400" />
              </button>

              {/* Team Rating */}
              <div className="flex items-baseline gap-1 px-1 shrink-0">
                <span className="text-xl sm:text-2xl font-extrabold font-mono text-white tabular-nums leading-none">
                  {teamRating}
                </span>
                <span className="text-xs font-bold text-amber-400 leading-none">OVR</span>
              </div>

              {/* Auto / Manual lineup chip */}
              <button
                type="button"
                onClick={handleToggleAuto}
                aria-pressed={lineup.auto}
                className={`min-h-11 px-2.5 py-1.5 rounded-lg border text-xs font-bold transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                  lineup.auto
                    ? 'bg-amber-400/20 border-amber-400/50 text-amber-300'
                    : 'bg-slate-900 border-white/15 text-slate-300 hover:text-white'
                }`}
              >
                {lineup.auto ? 'Auto' : 'Manual lineup'}
              </button>

              {/* "..." Overflow Menu */}
              <div className="relative shrink-0" ref={menuRef}>
                <button
                  type="button"
                  onClick={() => {
                    sounds.playClick();
                    setShowMoreMenu(prev => !prev);
                  }}
                  aria-label="Lineup actions"
                  aria-expanded={showMoreMenu}
                  className="min-h-11 min-w-11 flex items-center justify-center rounded-lg bg-slate-900 hover:bg-slate-800 border border-white/10 text-slate-300 hover:text-white cursor-pointer"
                >
                  <MoreHorizontal className="w-4 h-4" />
                </button>

                {showMoreMenu && (
                  <div className="absolute right-0 mt-1.5 w-60 bg-[#161f30] border border-white/15 rounded-xl shadow-2xl py-1.5 z-50">
                    <button
                      type="button"
                      onClick={handleBestXI}
                      className="w-full min-h-11 px-3.5 py-2 text-left text-xs font-semibold text-slate-200 hover:bg-white/10 flex items-center gap-2 cursor-pointer"
                    >
                      <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
                      <span>Best XI</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleClearLineup}
                      className="w-full min-h-11 px-3.5 py-2 text-left text-xs font-semibold text-slate-200 hover:bg-white/10 flex items-center gap-2 cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4 text-rose-400 shrink-0" />
                      <span>Clear lineup</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleResetToManagerFormation}
                      className="w-full min-h-11 px-3.5 py-2 text-left text-xs font-semibold text-slate-200 hover:bg-white/10 flex items-center gap-2 cursor-pointer"
                    >
                      <RotateCcw className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span>Reset to manager&apos;s formation ({managerFormation})</span>
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Pitch Canvas (8px side padding on mobile -> -mx-1 inside safe-area-x px-3) */}
            <div className="-mx-1 sm:mx-0">
              <div className="relative w-full max-w-[min(100%,calc(75dvh*0.75))] lg:max-w-[560px] aspect-[3/4] mx-auto select-none">
                {/* SVG Pitch Backdrop */}
                <div
                  className="absolute inset-0 rounded-2xl overflow-hidden border border-white/15 shadow-[inset_0_0_36px_rgba(0,0,0,0.45)]"
                  style={{
                    background: 'linear-gradient(180deg, #0f5132 0%, #14623f 50%, #0f5132 100%)',
                  }}
                >
                  <svg
                    viewBox="0 0 300 400"
                    preserveAspectRatio="none"
                    className="w-full h-full block"
                    aria-hidden="true"
                  >
                    <defs>
                      <linearGradient id="pitchGrassGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#0f5132" />
                        <stop offset="50%" stopColor="#14623f" />
                        <stop offset="100%" stopColor="#0f5132" />
                      </linearGradient>
                    </defs>
                    <rect x="0" y="0" width="300" height="400" fill="url(#pitchGrassGrad)" />

                    {/* 8 horizontal mowing stripes */}
                    {Array.from({ length: 8 }, (_, idx) => (
                      <rect
                        key={idx}
                        x="0"
                        y={idx * 50}
                        width="300"
                        height="50"
                        fill={idx % 2 === 0 ? 'rgba(255,255,255,0.035)' : 'rgba(0,0,0,0.05)'}
                      />
                    ))}

                    {/* Pitch markings (2px white lines at ~35% opacity) */}
                    <g fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="2">
                      {/* Touchlines & goal lines */}
                      <rect x="10" y="10" width="280" height="380" rx="2" />
                      {/* Halfway line */}
                      <line x1="10" y1="200" x2="290" y2="200" />
                      {/* Centre circle & spot */}
                      <circle cx="150" cy="200" r="34" />
                      <circle cx="150" cy="200" r="2.2" fill="rgba(255,255,255,0.35)" />

                      {/* Top penalty area & 6-yard goal area */}
                      <rect x="74" y="10" width="152" height="58" />
                      <rect x="112" y="10" width="76" height="21" />
                      <circle cx="150" cy="48" r="2" fill="rgba(255,255,255,0.35)" />
                      <path d="M 122 68 A 34 34 0 0 0 178 68" />

                      {/* Bottom penalty area & 6-yard goal area */}
                      <rect x="74" y="332" width="152" height="58" />
                      <rect x="112" y="369" width="76" height="21" />
                      <circle cx="150" cy="352" r="2" fill="rgba(255,255,255,0.35)" />
                      <path d="M 122 332 A 34 34 0 0 1 178 332" />

                      {/* Corner arcs */}
                      <path d="M 10 18 A 8 8 0 0 0 18 10" />
                      <path d="M 282 10 A 8 8 0 0 0 290 18" />
                      <path d="M 10 382 A 8 8 0 0 1 18 390" />
                      <path d="M 282 390 A 8 8 0 0 1 290 382" />
                    </g>
                  </svg>

                  {/* Subtle inner shadow */}
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 rounded-2xl shadow-[inset_0_0_40px_rgba(0,0,0,0.45)]"
                  />
                </div>

                {/* Positioned 11 Player Tokens */}
                {formationDef.slots.map((slot, index) => {
                  const playerId = lineup.slots[index];
                  const player = playerId ? playersById.get(playerId) ?? null : null;
                  const isSelected = selection?.zone === 'pitch' && selection.index === index;
                  const isDropHovered = hoveredDropKey === `pitch:${index}`;
                  const isSwapTarget = Boolean(selection && !isSelected && canSwapToPitchOrBench);
                  const fit = player ? getSlotFit(player, slot.role) : null;

                  return (
                    <div
                      key={index}
                      className="absolute z-10"
                      style={{
                        left: `${slot.x}%`,
                        top: `${slot.y}%`,
                        transform: 'translate(-50%, -50%)',
                      }}
                    >
                      {player ? (
                        <PlayerCard
                          player={player}
                          variant="pitch"
                          effectiveOverall={fit?.effectiveOverall}
                          penalty={fit?.penalty}
                          fitLevel={fit?.fit}
                          slotRole={slot.role}
                          isSelected={isSelected}
                          isSwapTarget={isSwapTarget}
                          isDropHovered={isDropHovered}
                          layoutId={`squad-player-${player.id}`}
                          dropZone="pitch"
                          dropIndex={index}
                          onClick={() => handleTapPitchSlot(index, player)}
                          onPointerDown={e =>
                            handlePointerStartDrag(e, { zone: 'pitch', index, playerId: player.id }, player)
                          }
                        />
                      ) : (
                        <EmptySlotToken
                          label={slot.role}
                          variant="pitch"
                          isSwapTarget={isSwapTarget}
                          isDropHovered={isDropHovered}
                          dropZone="pitch"
                          dropIndex={index}
                          onClick={() => handleTapPitchSlot(index, null)}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Bottom Selection Action Bar */}
            {selectedPlayer && (
              <div className="bg-[#111827] border border-amber-400/40 rounded-xl px-3 py-2 flex items-center justify-between gap-2 shadow-lg">
                <div className="min-w-0">
                  <p className="text-xs font-extrabold text-white truncate">{selectedPlayer.name}</p>
                  <p className="text-xs text-amber-300 truncate">
                    {selectedSlotInfo.label} · Tap another slot to swap
                  </p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      sounds.playClick();
                      setMobileInfoPlayerId(selectedPlayer.id);
                    }}
                    className="min-h-11 px-3 py-2 rounded-lg bg-amber-400 hover:bg-amber-300 text-slate-950 text-xs font-extrabold flex items-center gap-1 cursor-pointer"
                  >
                    <Info className="w-3.5 h-3.5" />
                    <span>Player Info</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      sounds.playClick();
                      setSelection(null);
                    }}
                    aria-label="Cancel selection"
                    className="min-h-11 px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-bold text-slate-200 flex items-center gap-1 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                    <span>Cancel</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* RIGHT COLUMN (Desktop) / TABBED RACK BELOW PITCH (Mobile/Tablet < 1024px) */}
          <div className="space-y-4">
            {/* Mobile/Tablet (< 1024px): Tabs "Substitutes 7" and "Reserves N" */}
            <div className="lg:hidden space-y-3">
              <div className="grid grid-cols-2 gap-1 p-1 bg-[#111827] border border-white/10 rounded-xl">
                <button
                  type="button"
                  onClick={() => {
                    sounds.playClick();
                    setMobileRackTab('bench');
                  }}
                  className={`min-h-11 px-3 py-2 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                    mobileRackTab === 'bench'
                      ? 'bg-amber-400 text-slate-950'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  Substitutes {benchCount}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    sounds.playClick();
                    setMobileRackTab('reserves');
                  }}
                  className={`min-h-11 px-3 py-2 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                    mobileRackTab === 'reserves'
                      ? 'bg-amber-400 text-slate-950'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  Reserves {reserves.length}
                </button>
              </div>

              {mobileRackTab === 'bench' ? (
                <BenchStrip
                  benchIds={lineup.bench}
                  playersById={playersById}
                  selection={selection}
                  canSwapToBench={canSwapToPitchOrBench}
                  hoveredDropKey={hoveredDropKey}
                  onSelectSlot={handleTapBenchSlot}
                  onPointerStartDrag={handlePointerStartDrag}
                />
              ) : (
                <ReservesGrid
                  reserves={reserves}
                  selection={selection}
                  hoveredDropKey={hoveredDropKey}
                  onSelectReserve={handleTapReserve}
                  onPointerStartDrag={handlePointerStartDrag}
                />
              )}
            </div>

            {/* Desktop (>= 1024px): Substitutes grid + Reserves grid + Selected Player detail panel */}
            <div className="hidden lg:block space-y-5">
              <section className="bg-[#111827] border border-white/10 rounded-2xl p-4 space-y-2.5">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-extrabold text-white">Substitutes ({benchCount}/7)</h2>
                  <span className="text-xs text-slate-400">Tap or drag to swap</span>
                </div>
                <BenchStrip
                  benchIds={lineup.bench}
                  playersById={playersById}
                  selection={selection}
                  canSwapToBench={canSwapToPitchOrBench}
                  hoveredDropKey={hoveredDropKey}
                  onSelectSlot={handleTapBenchSlot}
                  onPointerStartDrag={handlePointerStartDrag}
                />
              </section>

              <section className="bg-[#111827] border border-white/10 rounded-2xl p-4 space-y-2.5">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-extrabold text-white">Reserves ({reserves.length})</h2>
                  <span className="text-xs text-slate-400">Sorted by position & rating</span>
                </div>
                <ReservesGrid
                  reserves={reserves}
                  selection={selection}
                  hoveredDropKey={hoveredDropKey}
                  onSelectReserve={handleTapReserve}
                  onPointerStartDrag={handlePointerStartDrag}
                />
              </section>

              {/* Selected player's detail panel on desktop */}
              <PlayerSheet
                player={selectedPlayer}
                occupancyLabel={selectedSlotInfo.label}
                slotRole={selectedSlotInfo.slotRole}
                mode="panel"
                isOpen={true}
                onClose={() => setSelection(null)}
                onSell={onSell}
                onOffer={onOffer}
                onRenew={onRenew}
                onRelease={onRelease}
              />
            </div>
          </div>
        </div>

        {/* Floating drag ghost on desktop */}
        {dragState?.active && (
          <div
            className="fixed pointer-events-none z-50 opacity-90 scale-105"
            style={{
              left: dragState.x,
              top: dragState.y,
              transform: 'translate(-50%, -50%)',
            }}
          >
            <PlayerCard player={dragState.player} variant="pitch" />
          </div>
        )}

        {/* Formation Picker Bottom Sheet */}
        <FormationSheet
          isOpen={showFormationSheet}
          currentFormation={lineup.formation}
          managerFormation={managerFormation}
          onSelectFormation={handleSelectFormation}
          onClose={() => setShowFormationSheet(false)}
        />

        {/* Mobile Bottom Sheet / Explicit "Player Info" Sheet */}
        <PlayerSheet
          player={mobileInfoPlayer}
          occupancyLabel={selectedSlotInfo.label}
          slotRole={selectedSlotInfo.slotRole}
          mode="sheet"
          isOpen={Boolean(mobileInfoPlayer)}
          onClose={() => setMobileInfoPlayerId(null)}
          onSell={p => {
            setMobileInfoPlayerId(null);
            onSell(p);
          }}
          onOffer={p => {
            setMobileInfoPlayerId(null);
            onOffer(p);
          }}
          onRenew={p => {
            setMobileInfoPlayerId(null);
            onRenew(p);
          }}
          onRelease={p => {
            setMobileInfoPlayerId(null);
            onRelease(p);
          }}
        />
      </div>
    </MotionConfig>
  );
};
