/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Player } from '../../types/game';
import { EmptySlotToken, PlayerCard } from './PlayerCard';

export interface SelectionTarget {
  zone: 'pitch' | 'bench' | 'reserve';
  index?: number;
  playerId?: string;
}

interface BenchStripProps {
  benchIds: string[];
  playersById: Map<string, Player>;
  selection: SelectionTarget | null;
  canSwapToBench: boolean;
  hoveredDropKey: string | null;
  onSelectSlot: (index: number, player: Player | null) => void;
  onPointerStartDrag: (e: React.PointerEvent<HTMLButtonElement>, target: SelectionTarget, player: Player) => void;
}

const BENCH_SLOTS = 7;

export const BenchStrip: React.FC<BenchStripProps> = ({
  benchIds,
  playersById,
  selection,
  canSwapToBench,
  hoveredDropKey,
  onSelectSlot,
  onPointerStartDrag,
}) => {
  const slots = Array.from({ length: BENCH_SLOTS }, (_, i) => {
    const id = benchIds[i];
    return id ? playersById.get(id) ?? null : null;
  });

  return (
    <div className="flex gap-2.5 overflow-x-auto snap-x snap-mandatory pb-2 pt-1 lg:grid lg:grid-cols-4 xl:grid-cols-7 lg:overflow-visible lg:snap-none">
      {slots.map((player, idx) => {
        const isSelected = selection?.zone === 'bench' && selection.index === idx;
        const isDropHovered = hoveredDropKey === `bench:${idx}`;
        const isSwapTarget = Boolean(selection && !isSelected && canSwapToBench);

        return (
          <div key={idx} className="snap-start shrink-0 flex flex-col items-center">
            {player ? (
              <PlayerCard
                player={player}
                variant="rack"
                subLabel="Bench"
                isSelected={isSelected}
                isSwapTarget={isSwapTarget}
                isDropHovered={isDropHovered}
                layoutId={`squad-player-${player.id}`}
                dropZone="bench"
                dropIndex={idx}
                onClick={() => onSelectSlot(idx, player)}
                onPointerDown={e =>
                  onPointerStartDrag(e, { zone: 'bench', index: idx, playerId: player.id }, player)
                }
              />
            ) : (
              <EmptySlotToken
                label="Bench"
                variant="bench"
                isSwapTarget={isSwapTarget}
                isDropHovered={isDropHovered}
                dropZone="bench"
                dropIndex={idx}
                onClick={() => onSelectSlot(idx, null)}
              />
            )}
          </div>
        );
      })}
    </div>
  );
};
