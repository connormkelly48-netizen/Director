/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Club, Director, Manager, DelegationMatrix } from '../types/game';
import { Sliders, Shield, AlertTriangle, UserCheck, Flame, Info } from 'lucide-react';
import { sounds } from '../services/soundEffects';

interface ResponsibilitiesViewProps {
  club: Club;
  manager: Manager | undefined;
  director: Director;
  delegation: DelegationMatrix;
  onUpdateDelegation: (matrix: DelegationMatrix) => void;
}

export const ResponsibilitiesView: React.FC<ResponsibilitiesViewProps> = ({
  club,
  manager,
  director,
  delegation,
  onUpdateDelegation,
}) => {
  const updateMatrix = (key: keyof DelegationMatrix, val: string) => {
    sounds.playClick();
    onUpdateDelegation({
      ...delegation,
      [key]: val,
    });
  };

  return (
    <div className="space-y-6">
      
      {/* Header */}
      <div className="bg-[#111827] border border-white/10 rounded-2xl p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold text-amber-400 uppercase tracking-wider mb-1">
              <Sliders className="w-4 h-4" />
              <span>Operational Governance Matrix</span>
            </div>
            <h1 className="text-2xl lg:text-3xl font-extrabold text-white tracking-tight">
              Responsibilities & Delegation Matrix
            </h1>
            <p className="text-slate-400 text-xs mt-1">
              Configure the balance of sporting power between the Sporting Director and the Head Coach.
            </p>
          </div>
          
          {manager && (
            <div className="flex items-center gap-3">
              <div className="px-4 py-2 bg-slate-900 border border-white/10 rounded-xl text-right">
                <span className="text-[10px] text-slate-400 uppercase block">Head Coach Trust</span>
                <span className={`text-lg font-bold font-mono ${
                  manager.trustInDirector > 70 ? 'text-emerald-400' : manager.trustInDirector > 40 ? 'text-amber-400' : 'text-rose-500'
                }`}>
                  {manager.trustInDirector}%
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Warning / Rule Banner: Going behind the Manager's back */}
      <div className="bg-amber-400/5 border border-amber-400/20 rounded-xl p-4.5 flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
        <div className="text-xs space-y-1">
          <strong className="text-amber-300 font-bold block">
            The Golden Rule of Sporting Directorship:
          </strong>
          <p className="text-slate-300 leading-relaxed">
            If you delegate a responsibility to your manager (e.g. transfer recruitment or contract renewals) and subsequently <strong>override their authority</strong> or sign players behind their back, their trust will dwindle sharply (<span className="text-rose-400 font-semibold font-mono">-15% to -25%</span>). If trust falls below 25%, autocratic managers like Unai Emery or Antonio Conte will issue public ultimatums or tender their resignation!
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left 2 Cols: The Delegation Table */}
        <div className="lg:col-span-2 bg-[#111827] border border-white/10 rounded-xl p-6 space-y-6">
          <div className="border-b border-white/10 pb-3">
            <h3 className="text-xs font-bold text-white uppercase tracking-wider">
              Departmental Authority Breakdown
            </h3>
            <span className="text-[11px] text-slate-400">
              Select who holds primary decision-making authority for each operational duty.
            </span>
          </div>

          <div className="space-y-5">
            
            {/* 1. First Team Signings */}
            <div className="border-b border-white/5 pb-4">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <span className="text-xs font-bold text-white block">
                    First-Team Incoming Transfers
                  </span>
                  <span className="text-[11px] text-slate-400">
                    Identifying targets, submitting bids, and finalizing incoming agreements.
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: 'director', label: 'Director Exclusive', sub: 'You decide all signings' },
                  { id: 'shared', label: 'Shared Consensus', sub: 'Requires mutual approval' },
                  { id: 'manager', label: 'Manager Control', sub: 'Head Coach dictates targets' },
                ].map(opt => (
                  <button
                    key={opt.id}
                    onClick={() => updateMatrix('transferSignings', opt.id)}
                    className={`p-3 rounded-lg border text-left cursor-pointer transition-all ${
                      delegation.transferSignings === opt.id
                        ? 'bg-amber-400/10 border-amber-400 text-amber-300 font-bold'
                        : 'bg-slate-900/60 border-white/5 text-slate-400 hover:border-white/20'
                    }`}
                  >
                    <span className="text-xs block">{opt.label}</span>
                    <span className="text-[10px] text-slate-500 font-normal block mt-0.5">{opt.sub}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* 2. First Team Sales */}
            <div className="border-b border-white/5 pb-4">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <span className="text-xs font-bold text-white block">
                    First-Team Outgoings & Sales
                  </span>
                  <span className="text-[11px] text-slate-400">
                    Sanctioning departures, sales, and loan out arrangements.
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: 'director', label: 'Director Exclusive', sub: 'You cash in on players' },
                  { id: 'shared', label: 'Shared Consensus', sub: 'Joint sign-off required' },
                  { id: 'manager', label: 'Manager Control', sub: 'Coach protects his core' },
                ].map(opt => (
                  <button
                    key={opt.id}
                    onClick={() => updateMatrix('transferSales', opt.id)}
                    className={`p-3 rounded-lg border text-left cursor-pointer transition-all ${
                      delegation.transferSales === opt.id
                        ? 'bg-amber-400/10 border-amber-400 text-amber-300 font-bold'
                        : 'bg-slate-900/60 border-white/5 text-slate-400 hover:border-white/20'
                    }`}
                  >
                    <span className="text-xs block">{opt.label}</span>
                    <span className="text-[10px] text-slate-500 font-normal block mt-0.5">{opt.sub}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* 3. Contract Renewals */}
            <div className="border-b border-white/5 pb-4">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <span className="text-xs font-bold text-white block">
                    Contract Renewals & Wage Negotiations
                  </span>
                  <span className="text-[11px] text-slate-400">
                    Negotiating wage tiers, release clauses, and renewal lengths.
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                {[
                  { id: 'director', label: 'Sporting Director', sub: 'Disciplined wage structure' },
                  { id: 'manager', label: 'Head Coach Led', sub: 'Coach rewards his favorites' },
                ].map(opt => (
                  <button
                    key={opt.id}
                    onClick={() => updateMatrix('contractRenewals', opt.id)}
                    className={`p-3 rounded-lg border text-left cursor-pointer transition-all ${
                      delegation.contractRenewals === opt.id
                        ? 'bg-amber-400/10 border-amber-400 text-amber-300 font-bold'
                        : 'bg-slate-900/60 border-white/5 text-slate-400 hover:border-white/20'
                    }`}
                  >
                    <span className="text-xs block">{opt.label}</span>
                    <span className="text-[10px] text-slate-500 font-normal block mt-0.5">{opt.sub}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* 4. Academy Promotions */}
            <div className="border-b border-white/5 pb-4">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <span className="text-xs font-bold text-white block">
                    Youth Academy Promotions
                  </span>
                  <span className="text-[11px] text-slate-400">
                    Promoting academy graduates directly to first-team training.
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                {[
                  { id: 'director', label: 'Director Enforced', sub: 'Mandate academy pathways' },
                  { id: 'manager', label: 'Manager Discretion', sub: 'Coach promotes when ready' },
                ].map(opt => (
                  <button
                    key={opt.id}
                    onClick={() => updateMatrix('youthPromotion', opt.id)}
                    className={`p-3 rounded-lg border text-left cursor-pointer transition-all ${
                      delegation.youthPromotion === opt.id
                        ? 'bg-amber-400/10 border-amber-400 text-amber-300 font-bold'
                        : 'bg-slate-900/60 border-white/5 text-slate-400 hover:border-white/20'
                    }`}
                  >
                    <span className="text-xs block">{opt.label}</span>
                    <span className="text-[10px] text-slate-500 font-normal block mt-0.5">{opt.sub}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* 5. Tactical Philosophy */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <div>
                  <span className="text-xs font-bold text-white block">
                    Tactical Style & Formation Identity
                  </span>
                  <span className="text-[11px] text-slate-400">
                    Whether the club dictates a universal tactical identity or allows the coach full freedom.
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                {[
                  { id: 'director_mandated', label: 'Club DNA Mandate', sub: 'Director dictates formation/style' },
                  { id: 'manager_freedom', label: 'Total Tactical Freedom', sub: 'Coach decides all match tactics' },
                ].map(opt => (
                  <button
                    key={opt.id}
                    onClick={() => updateMatrix('tacticalStyle', opt.id)}
                    className={`p-3 rounded-lg border text-left cursor-pointer transition-all ${
                      delegation.tacticalStyle === opt.id
                        ? 'bg-amber-400/10 border-amber-400 text-amber-300 font-bold'
                        : 'bg-slate-900/60 border-white/5 text-slate-400 hover:border-white/20'
                    }`}
                  >
                    <span className="text-xs block">{opt.label}</span>
                    <span className="text-[10px] text-slate-500 font-normal block mt-0.5">{opt.sub}</span>
                  </button>
                ))}
              </div>
            </div>

          </div>
        </div>

        {/* Right Col: Head Coach Profile & Control Appetite */}
        <div className="bg-[#111827] border border-white/10 rounded-xl p-6 space-y-4">
          <div className="border-b border-white/10 pb-3">
            <span className="text-xs font-bold text-white uppercase tracking-wider block">
              Incumbent Head Coach
            </span>
            <span className="text-[11px] text-slate-400">
              Tactical profile and control appetite
            </span>
          </div>

          {manager ? (
            <div className="space-y-4">
              <div className="bg-slate-900/80 border border-white/5 rounded-xl p-4">
                <div className="flex items-center justify-between mb-1">
                  <h4 className="text-base font-bold text-white">{manager.name}</h4>
                  <span className="text-xs font-mono text-amber-400">Age {manager.age}</span>
                </div>
                <span className="text-xs text-slate-400 block mb-2">{manager.nationality} · {manager.tacticalStyle}</span>

                <div className="space-y-2 text-xs pt-2 border-t border-white/5">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Preferred Formation:</span>
                    <span className="font-mono text-slate-200">{manager.preferredFormation}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Control Appetite:</span>
                    <span className={`font-bold capitalize ${
                      manager.controlDesire === 'autocrat' ? 'text-rose-400' :
                      manager.controlDesire === 'collaborator' ? 'text-amber-400' : 'text-emerald-400'
                    }`}>
                      {manager.controlDesire}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Weekly Wage:</span>
                    <span className="font-mono text-slate-200">£{(manager.wage / 1000).toFixed(0)}k/wk</span>
                  </div>
                </div>
              </div>

              <div className="bg-slate-900/60 border border-white/5 rounded-xl p-4 text-xs text-slate-300 leading-relaxed font-serif italic">
                "{manager.profileSnippet}"
              </div>

              {manager.controlDesire === 'autocrat' && (
                <div className="p-3 bg-rose-950/20 border border-rose-500/30 rounded-xl text-xs text-rose-300 flex items-start gap-2">
                  <Flame className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                  <span>
                    Warning: {manager.name} is an <strong>Autocrat</strong>. Restricting his transfer control or mandating formations will cause friction and erode his chemistry with you quickly!
                  </span>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-8 text-xs text-slate-500">
              No manager currently employed. Head to the Head Coach tab to hire a tactician.
            </div>
          )}
        </div>

      </div>

    </div>
  );
};
