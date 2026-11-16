/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Player } from '../../types/game';
import { PlayerCard } from './PlayerCard';
import { SelectionTarget } from './BenchStrip';

interface ReservesGridProps {
  reserves: Player[];
  selection: SelectionTarget | null;
  hoveredDropKey: string | null;
  onSelectReserve: (player: Player) => void;
  onPointerStartDrag: (e: React.PointerEvent<HTMLButtonElement>, target: SelectionTarget, player: Player) => void;
}

export const ReservesGrid: React.FC<ReservesGridProps> = ({
  reserves,
  selection,
  hoveredDropKey,
  onSelectReserve,
  onPointerStartDrag,
}) => {
  if (reserves.length === 0) {
    return (
      <div className="bg-slate-900/60 border border-white/10 rounded-xl p-4 text-xs text-slate-400 text-center">
        All squad players are assigned to the Starting XI or Substitutes bench.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-y-3 gap-x-2 pt-1 justify-items-center">
      {reserves.map(player => {
        const isSelected = selection?.zone === 'reserve' && selection.playerId === player.id;
        const isDropHovered = hoveredDropKey === `reserve:${player.id}`;
        const canSwapFromPitchOrBench =
          Boolean(selection) &&
          selection?.zone !== 'reserve' &&
          !player.isInjured;

        return (
          <PlayerCard
            key={player.id}
            player={player}
            variant="rack"
            subLabel={player.isInjured ? `Inj ${player.injuryWeeks ?? 1}w` : player.roleDetail.split(' ')[0]}
            isSelected={isSelected}
            isSwapTarget={canSwapFromPitchOrBench}
            isDropHovered={isDropHovered}
            layoutId={`squad-player-${player.id}`}
            dropZone="reserve"
            onClick={() => onSelectReserve(player)}
            onPointerDown={e =>
              onPointerStartDrag(e, { zone: 'reserve', playerId: player.id }, player)
            }
          />
        );
      })}
    </div>
  );
};
