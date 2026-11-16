/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Club, Director, Owner } from '../types/game';
import { AlertOctagon, ArrowRight } from 'lucide-react';
import { sounds } from '../services/soundEffects';
import { Modal } from './ui/Modal';

interface SackedModalProps {
  club: Club;
  owner: Owner;
  director: Director;
  onEnterJobMarket: () => void;
  onBackToMainMenu?: () => void;
}

export const SackedModal: React.FC<SackedModalProps> = ({
  club,
  owner,
  director,
  onEnterJobMarket,
  onBackToMainMenu,
}) => {
  const severance = director.salary * 26; // 6 months severance

  return (
    <Modal
      isOpen={true}
      dismissible={false}
      showCloseButton={false}
      maxWidthClass="max-w-lg"
      borderClass="border-rose-500/40"
      backdropClass="bg-[#070a0f]/95"
      ariaLabel="Relieved of Directorship"
      footer={
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => {
              sounds.playClick();
              onEnterJobMarket();
            }}
            className="w-full min-h-11 py-3 bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-slate-950 font-extrabold text-xs rounded-xl shadow-lg transition-all cursor-pointer flex items-center justify-center gap-2 active:scale-95"
          >
            <span>Acknowledge Dismissal & View Vacancies</span>
            <ArrowRight className="w-4 h-4" />
          </button>

          {onBackToMainMenu && (
            <button
              type="button"
              onClick={() => {
                sounds.playClick();
                onBackToMainMenu();
              }}
              className="w-full min-h-11 py-2.5 bg-white/5 hover:bg-white/10 active:scale-95 text-slate-300 hover:text-white font-bold text-xs rounded-xl border border-white/10 transition-all cursor-pointer"
            >
              Back to Main Menu
            </button>
          )}
        </div>
      }
    >
      <div className="text-center space-y-4">
        <div className="w-16 h-16 bg-rose-500/10 border border-rose-500/30 rounded-2xl flex items-center justify-center mx-auto text-rose-400">
          <AlertOctagon className="w-8 h-8" />
        </div>

        <div>
          <span className="text-xs sm:text-[10px] font-bold tracking-wider uppercase text-rose-400 block mb-1">
            Official Notice of Contract Termination
          </span>

          <h2 className="text-2xl font-black text-white tracking-tight">
            Relieved of Directorship
          </h2>
        </div>

        <div className="bg-slate-900/90 border border-white/5 rounded-xl p-4 text-xs text-slate-300 leading-relaxed font-serif italic text-left max-w-[75ch] mx-auto">
          "Dear {director.name},<br/><br/>
          Following an emergency extraordinary session of the Board of Directors, Chairman {owner.name} and the executive committee have concluded that results and recruitment performance have fallen critically below the expectations established for {club.name}.<br/><br/>
          Your employment as Sporting Director has been terminated with immediate effect. In accordance with your contract, a severance disbursement of £{(severance / 1000).toFixed(0)}k has been authorized.<br/><br/>
          We wish you well in your future managerial endeavors."
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400 border-t border-white/10 pt-4 font-mono">
          <span>Severance Payout: <strong className="text-emerald-400">£{(severance / 1000).toFixed(0)}k</strong></span>
          <span>Reputation Impact: <strong className="text-rose-400">-8 Pts</strong></span>
        </div>
      </div>
    </Modal>
  );
};
