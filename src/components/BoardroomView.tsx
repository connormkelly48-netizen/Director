/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Club, Director, Owner, TakeoverConsortium } from '../types/game';
import { Building2, Shield, TrendingUp, AlertTriangle, DollarSign, Check, X, Users, Sparkles } from 'lucide-react';
import { sounds } from '../services/soundEffects';

interface BoardroomViewProps {
  club: Club;
  owner: Owner;
  director: Director;
  onUpdateClub: (updatedClub: Club, updatedDirector: Director, updatedOwner: Owner) => void;
}

export const BoardroomView: React.FC<BoardroomViewProps> = ({
  club,
  owner,
  director,
  onUpdateClub,
}) => {
  const [boardFeedback, setBoardFeedback] = useState<string | null>(null);

  // Handle board funding requests
  const handleRequest = (type: 'transfer' | 'wage' | 'facility') => {
    sounds.playGavel();

    if (owner.approval < 55) {
      setBoardFeedback(`${owner.name} rejected your request: "Current on-pitch performances do not justify further capital expenditure. Deliver results with the existing squad first."`);
      return;
    }

    if (owner.wealth === 'frugal') {
      setBoardFeedback(`${owner.name} rejected your request: "Our operational model requires strict self-sufficiency. We must generate capital through player sales before increasing budgets."`);
      return;
    }

    if (type === 'transfer') {
      const injection = club.tier === 1 ? 25000000 : club.tier === 2 ? 8000000 : 2500000;
      const updatedClub = {
        ...club,
        transferBudget: club.transferBudget + injection,
        balance: club.balance + injection,
      };
      const updatedOwner = { ...owner, approval: Math.max(0, owner.approval - 3) };
      onUpdateClub(updatedClub, director, updatedOwner);
      setBoardFeedback(`APPROVED: ${owner.name} has sanctioned an additional £${(injection / 1000000).toFixed(1)}M for your transfer war chest!`);
    } else if (type === 'wage') {
      const wageIncrease = club.tier === 1 ? 350000 : club.tier === 2 ? 100000 : 35000;
      const updatedClub = {
        ...club,
        wageBudget: club.wageBudget + wageIncrease,
      };
      const updatedOwner = { ...owner, approval: Math.max(0, owner.approval - 2) };
      onUpdateClub(updatedClub, director, updatedOwner);
      setBoardFeedback(`APPROVED: The board has increased the weekly wage ceiling by +£${(wageIncrease / 1000).toFixed(0)}k/week!`);
    } else {
      const cost = club.tier === 1 ? 15000000 : club.tier === 2 ? 5000000 : 1500000;
      if (club.balance < cost) {
        setBoardFeedback(`${owner.name}: "We do not currently have the treasury surplus for facility development."`);
        return;
      }
      const updatedClub = {
        ...club,
        balance: club.balance - cost,
        prestige: Math.min(100, club.prestige + 2),
      };
      const updatedDirector = { ...director, reputation: Math.min(100, director.reputation + 3) };
      onUpdateClub(updatedClub, updatedDirector, owner);
      setBoardFeedback(`SANCTIONED: Training ground modernization approved! Club prestige and director reputation improved.`);
    }
  };

  return (
    <div className="space-y-6">
      
      {/* Boardroom Header */}
      <div className="bg-[#111827] border border-white/10 rounded-2xl p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold text-amber-400 uppercase tracking-wider mb-1">
              <Building2 className="w-4 h-4" />
              <span>Executive Boardroom & Governance</span>
            </div>
            <h1 className="text-2xl lg:text-3xl font-extrabold text-white tracking-tight">
              Owner Dossier & Boardroom Relations
            </h1>
            <p className="text-slate-400 text-xs mt-1">
              Manage ownership expectations, negotiate budgetary expansion, and navigate takeover threats.
            </p>
          </div>
          
          <div className="flex items-center gap-3">
            <div className="px-4 py-2 bg-slate-900 border border-white/10 rounded-xl text-right">
              <span className="text-[10px] text-slate-400 uppercase block">Board Confidence</span>
              <span className={`text-lg font-bold font-mono ${
                owner.approval > 70 ? 'text-emerald-400' : owner.approval > 45 ? 'text-amber-400' : 'text-rose-500'
              }`}>
                {owner.approval}%
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Owner Profile Card */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left 2 Cols: Detailed Owner Profile */}
        <div className="lg:col-span-2 bg-[#111827] border border-white/10 rounded-xl p-6 space-y-5">
          <div className="flex items-start justify-between border-b border-white/10 pb-4">
            <div>
              <span className="text-[11px] font-bold tracking-wider uppercase text-amber-400 block mb-0.5">
                Current Majority Owner
              </span>
              <h2 className="text-xl font-extrabold text-white">
                {owner.name}
              </h2>
              <span className="text-xs text-slate-400 font-medium">
                {owner.nationality} Consortium · {club.name}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono px-2.5 py-1 bg-slate-900 border border-white/10 rounded-lg text-slate-300 capitalize">
                Wealth: <strong className="text-amber-400">{owner.wealth}</strong>
              </span>
            </div>
          </div>

          <p className="text-xs leading-relaxed text-slate-300 italic font-serif">
            "{owner.description}"
          </p>

          {/* Personality Breakdown Matrix */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="bg-slate-900/80 border border-white/5 rounded-xl p-3">
              <span className="text-[10px] text-slate-400 uppercase block mb-1">Patience Level</span>
              <span className="text-sm font-bold text-white capitalize">{owner.patience}</span>
              <span className="text-[10px] text-slate-500 block mt-0.5">
                {owner.patience === 'volatile' ? 'Sacks easily on losing streaks' :
                 owner.patience === 'impatient' ? 'Demands instant success' :
                 owner.patience === 'balanced' ? 'Reasonable review periods' : 'Long-term process support'}
              </span>
            </div>

            <div className="bg-slate-900/80 border border-white/5 rounded-xl p-3">
              <span className="text-[10px] text-slate-400 uppercase block mb-1">Involvement</span>
              <span className="text-sm font-bold text-white capitalize">{owner.involvement.replace('_', ' ')}</span>
              <span className="text-[10px] text-slate-500 block mt-0.5">
                {owner.involvement === 'micromanager' ? 'Demands specific transfers' :
                 owner.involvement === 'collaborative' ? 'Values consensus' : 'Gives director 100% autonomy'}
              </span>
            </div>

            <div className="bg-slate-900/80 border border-white/5 rounded-xl p-3">
              <span className="text-[10px] text-slate-400 uppercase block mb-1">Recruitment Model</span>
              <span className="text-sm font-bold text-amber-400 capitalize">{owner.recruitmentPhilosophy.replace('_', ' ')}</span>
              <span className="text-[10px] text-slate-500 block mt-0.5">Core criteria for signings</span>
            </div>
          </div>

          {/* Demanded Targets & Constraints */}
          {owner.demandedTargets && owner.demandedTargets.length > 0 && (
            <div className="bg-amber-400/5 border border-amber-400/20 rounded-xl p-4">
              <span className="text-xs font-bold text-amber-300 block mb-2 flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5" />
                Board Mandated Recruitment Criteria
              </span>
              <div className="flex flex-wrap gap-2">
                {owner.demandedTargets.map((target, idx) => (
                  <span key={idx} className="text-xs bg-slate-900 border border-white/10 px-3 py-1 rounded-md text-slate-200">
                    {target}
                  </span>
                ))}
              </div>
              <p className="text-[11px] text-slate-400 mt-2">
                Note: Signing players that contradict the owner's philosophy may trigger boardroom vetoes or disciplinary inquiries!
              </p>
            </div>
          )}

        </div>

        {/* Right Col: Takeover Threat & Club Sale Risk */}
        <div className="bg-[#111827] border border-white/10 rounded-xl p-6 flex flex-col justify-between">
          <div>
            <div className="border-b border-white/10 pb-3 mb-4">
              <span className="text-xs font-bold text-white uppercase tracking-wider block">
                Club Sale & Takeover Risk
              </span>
              <span className="text-[11px] text-slate-400">
                Consortium Rumors & Hostile Bids
              </span>
            </div>

            <div className="mb-4">
              <div className="flex items-center justify-between text-xs mb-1.5 font-mono">
                <span className="text-slate-400">Vulnerability Index:</span>
                <span className={`font-bold ${
                  owner.takeoverRisk > 50 ? 'text-rose-400' : owner.takeoverRisk > 25 ? 'text-amber-400' : 'text-emerald-400'
                }`}>
                  {owner.takeoverRisk}%
                </span>
              </div>
              <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                <div 
                  className={`h-full transition-all duration-300 ${
                    owner.takeoverRisk > 50 ? 'bg-rose-500' : owner.takeoverRisk > 25 ? 'bg-amber-400' : 'bg-emerald-400'
                  }`}
                  style={{ width: `${owner.takeoverRisk}%` }}
                />
              </div>
            </div>

            <div className="bg-slate-900/90 border border-white/5 rounded-xl p-3.5 text-xs text-slate-300 space-y-2">
              <div className="font-semibold text-slate-200 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                Takeover Dynamics
              </div>
              <p className="text-[11px] leading-relaxed text-slate-400">
                If the club is sold, incoming owners often bring their own executive sporting team. A sudden takeover could reshape your transfer budget or terminate your contract even if on-pitch results are strong.
              </p>
            </div>
          </div>

          <div className="mt-4 pt-4 border-t border-white/10 text-xs text-slate-400">
            <span>Ownership Status: <strong className="text-white">Active Management</strong></span>
          </div>
        </div>

      </div>

      {/* Interactive Board Funding Requests */}
      <div className="bg-[#111827] border border-white/10 rounded-xl p-6">
        <div className="border-b border-white/10 pb-3 mb-4">
          <h3 className="text-xs font-bold text-white uppercase tracking-wider">
            Formal Boardroom Petitions & Requests
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Submit formal funding appeals to the board. Approval depends on owner wealth, patience, and current board trust.
          </p>
        </div>

        {boardFeedback && (
          <div className="p-3.5 mb-4 rounded-xl bg-slate-900 border border-amber-400/30 text-xs text-amber-300 flex items-center justify-between">
            <span>{boardFeedback}</span>
            <button 
              onClick={() => setBoardFeedback(null)}
              className="text-slate-400 hover:text-white cursor-pointer ml-3"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          
          {/* Request Transfer Budget */}
          <div className="bg-slate-900/70 border border-white/5 rounded-xl p-4 flex flex-col justify-between">
            <div>
              <span className="text-xs font-bold text-white block mb-1">
                Request War Chest Expansion
              </span>
              <p className="text-[11px] text-slate-400 leading-relaxed mb-3">
                Appeal to the chairman for an emergency injection into the transfer fee budget for the current window.
              </p>
            </div>
            <button
              onClick={() => handleRequest('transfer')}
              className="w-full py-2 bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-bold text-amber-400 rounded-lg transition-all cursor-pointer"
            >
              Petition for Transfer Funds
            </button>
          </div>

          {/* Request Wage Ceiling */}
          <div className="bg-slate-900/70 border border-white/5 rounded-xl p-4 flex flex-col justify-between">
            <div>
              <span className="text-xs font-bold text-white block mb-1">
                Request Wage Ceiling Hike
              </span>
              <p className="text-[11px] text-slate-400 leading-relaxed mb-3">
                Raise the maximum allowable weekly wage budget to offer competitive terms to elite targets and key renewals.
              </p>
            </div>
            <button
              onClick={() => handleRequest('wage')}
              className="w-full py-2 bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-bold text-emerald-400 rounded-lg transition-all cursor-pointer"
            >
              Petition for Wage Hike
            </button>
          </div>

          {/* Upgrade Facilities */}
          <div className="bg-slate-900/70 border border-white/5 rounded-xl p-4 flex flex-col justify-between">
            <div>
              <span className="text-xs font-bold text-white block mb-1">
                Modernize Training Complex
              </span>
              <p className="text-[11px] text-slate-400 leading-relaxed mb-3">
                Invest club reserves into advanced analytics, gym facilities, and medical recovery suites to boost player growth.
              </p>
            </div>
            <button
              onClick={() => handleRequest('facility')}
              className="w-full py-2 bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-bold text-blue-400 rounded-lg transition-all cursor-pointer"
            >
              Commission Upgrade
            </button>
          </div>

        </div>

      </div>

    </div>
  );
};
