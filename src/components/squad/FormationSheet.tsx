/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Check } from 'lucide-react';
import { FORMATIONS, FORMATION_IDS } from '../../data/formations';
import { FormationId } from '../../types/game';
import { sounds } from '../../services/soundEffects';
import { Modal } from '../ui/Modal';

interface FormationSheetProps {
  isOpen: boolean;
  currentFormation: FormationId;
  managerFormation?: FormationId;
  onSelectFormation: (formation: FormationId) => void;
  onClose: () => void;
}

export const FormationSheet: React.FC<FormationSheetProps> = ({
  isOpen,
  currentFormation,
  managerFormation,
  onSelectFormation,
  onClose,
}) => {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      maxWidthClass="max-w-xl"
      ariaLabel="Select Team Formation"
      header={
        <div>
          <span className="text-xs font-bold text-amber-400 uppercase tracking-wider block">
            Tactical Shape
          </span>
          <h3 className="text-lg font-extrabold text-white">Choose Formation</h3>
        </div>
      }
    >
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {FORMATION_IDS.map(id => {
          const def = FORMATIONS[id];
          const isActive = id === currentFormation;
          const isCoachPreferred = id === managerFormation;

          return (
            <button
              key={id}
              type="button"
              onClick={() => {
                sounds.playClick();
                onSelectFormation(id);
                onClose();
              }}
              aria-pressed={isActive}
              className={`min-h-[120px] p-2.5 rounded-xl border text-left transition-all cursor-pointer flex flex-col gap-2 active:scale-[0.98] ${
                isActive
                  ? 'bg-amber-400/15 border-amber-400 shadow-md shadow-amber-500/10'
                  : 'bg-slate-900/80 border-white/10 hover:border-white/25 hover:bg-slate-900'
              }`}
            >
              <div className="flex items-center justify-between gap-1 w-full">
                <span className={`text-sm font-extrabold font-mono ${isActive ? 'text-amber-300' : 'text-white'}`}>
                  {def.name}
                </span>
                {isActive ? (
                  <Check className="w-4 h-4 text-amber-400 shrink-0" />
                ) : isCoachPreferred ? (
                  <span className="text-xs font-semibold text-emerald-400 shrink-0">Coach</span>
                ) : null}
              </div>

              {/* Mini SVG pitch diagram with 11 dots */}
              <div className="w-full aspect-[4/3] rounded-lg overflow-hidden border border-white/10 bg-[#0f5132]">
                <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="w-full h-full block">
                  <rect x="0" y="0" width="100" height="100" fill="#0f5132" />
                  <rect x="4" y="4" width="92" height="92" fill="none" stroke="rgba(255,255,255,0.28)" strokeWidth="1.5" />
                  <line x1="4" y1="50" x2="96" y2="50" stroke="rgba(255,255,255,0.25)" strokeWidth="1.2" />
                  <circle cx="50" cy="50" r="10" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="1.2" />
                  {def.slots.map((slot, idx) => (
                    <circle
                      key={idx}
                      cx={slot.x}
                      cy={slot.y}
                      r={isActive ? 4.4 : 4}
                      fill={isActive ? '#fbbf24' : '#ffffff'}
                      stroke="#0b0f17"
                      strokeWidth="1.2"
                    />
                  ))}
                </svg>
              </div>
            </button>
          );
        })}
      </div>
    </Modal>
  );
};
