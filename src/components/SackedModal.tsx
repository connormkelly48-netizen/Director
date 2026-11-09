/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Club, Director, Owner } from '../types/game';
import { AlertOctagon, ArrowRight, ShieldAlert } from 'lucide-react';
import { sounds } from '../services/soundEffects';

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
    <div className="fixed inset-0 z-50 bg-[#070a0f]/95 backdrop-blur-xl flex items-center justify-center p-4">
      <div className="w-full max-w-lg bg-[#111827] border border-rose-500/40 rounded-2xl p-6 lg:p-8 shadow-2xl text-center animate-in zoom-in-95 duration-200">
        
        <div className="w-16 h-16 bg-rose-500/10 border border-rose-500/30 rounded-2xl flex items-center justify-center mx-auto mb-4 text-rose-400">
          <AlertOctagon className="w-8 h-8" />
        </div>

        <span className="text-[10px] font-bold tracking-wider uppercase text-rose-400 block mb-1">
          Official Notice of Contract Termination
        </span>

        <h2 className="text-2xl font-black text-white tracking-tight mb-2">
          Relieved of Directorship
        </h2>

        <div className="bg-slate-900/90 border border-white/5 rounded-xl p-4 text-xs text-slate-300 leading-relaxed font-serif italic mb-6 text-left">
          "Dear {director.name},<br/><br/>
          Following an emergency extraordinary session of the Board of Directors, Chairman {owner.name} and the executive committee have concluded that results and recruitment performance have fallen critically below the expectations established for {club.name}.<br/><br/>
          Your employment as Sporting Director has been terminated with immediate effect. In accordance with your contract, a severance disbursement of £{(severance / 1000).toFixed(0)}k has been authorized.<br/><br/>
          We wish you well in your future managerial endeavors."
        </div>

        <div className="flex items-center justify-between text-xs text-slate-400 border-t border-white/10 pt-4 mb-6 font-mono">
          <span>Severance Payout: <strong className="text-emerald-400">£{(severance / 1000).toFixed(0)}k</strong></span>
          <span>Reputation Impact: <strong className="text-rose-400">-8 Pts</strong></span>
        </div>

        <div className="space-y-2">
          <button
            onClick={() => {
              sounds.playClick();
              onEnterJobMarket();
            }}
            className="w-full py-3 bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-slate-950 font-extrabold text-xs rounded-xl shadow-lg transition-all cursor-pointer flex items-center justify-center gap-2 active:scale-95"
          >
            <span>Acknowledge Dismissal & View Vacancies</span>
            <ArrowRight className="w-4 h-4" />
          </button>

          {onBackToMainMenu && (
            <button
              onClick={() => {
                sounds.playClick();
                onBackToMainMenu();
              }}
              className="w-full py-2.5 bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white font-bold text-xs rounded-xl border border-white/10 transition-all cursor-pointer"
            >
              Back to Main Menu
            </button>
          )}
        </div>

      </div>
    </div>
  );
};
