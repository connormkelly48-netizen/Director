/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Club, Director, Manager, Owner } from '../types/game';
import { UserCheck, UserX, AlertTriangle, Briefcase, Award, Shield, Check, Flame } from 'lucide-react';
import { sounds } from '../services/soundEffects';

interface ManagerViewProps {
  club: Club;
  currentManager: Manager | undefined;
  allManagers: Manager[];
  director: Director;
  owner: Owner;
  onUpdateManager: (newManager: Manager | null, updatedDirector: Director, updatedClub: Club, updatedOwner: Owner) => void;
}

export const ManagerView: React.FC<ManagerViewProps> = ({
  club,
  currentManager,
  allManagers,
  director,
  owner,
  onUpdateManager,
}) => {
  const [selectedFreeAgent, setSelectedFreeAgent] = useState<Manager | null>(null);
  const [filterStyle, setFilterStyle] = useState<string>('all');
  const [feedback, setFeedback] = useState<string | null>(null);

  const freeAgents = allManagers.filter(m => m.clubId === null || m.clubId === undefined);
  const filteredFreeAgents = freeAgents.filter(m => {
    if (filterStyle === 'all') return true;
    return m.tacticalStyle === filterStyle;
  });

  // Handle sacking the current manager
  const handleSackManager = () => {
    if (!currentManager) return;
    sounds.playCrisis();

    const severance = currentManager.wage * 52 * Math.max(1, currentManager.contractYears);
    
    // Check owner reaction: Did owner like him?
    let ownerApprovalDelta = -5;
    let directorTrustDelta = -3;
    let fanApprovalDelta = -5;

    // If manager had high reputation and team was doing fine, owner blames director!
    if (currentManager.reputation > 85 && club.won >= club.lost) {
      ownerApprovalDelta = -18;
      directorTrustDelta = -15;
      fanApprovalDelta = -20;
      setFeedback(`SACKING CONTROVERSY: ${owner.name} and the supporters are furious you terminated ${currentManager.name}'s contract! Severance cost: £${(severance / 1000000).toFixed(2)}M.`);
    } else {
      setFeedback(`CONTRACT TERMINATED: ${currentManager.name} has been relieved of his duties. Severance payout: £${(severance / 1000000).toFixed(2)}M.`);
    }

    const updatedClub: Club = {
      ...club,
      managerId: null,
      balance: Math.max(0, club.balance - severance),
    };

    const updatedDirector: Director = {
      ...director,
      boardTrust: Math.max(0, director.boardTrust + directorTrustDelta),
      fanApproval: Math.max(0, director.fanApproval + fanApprovalDelta),
    };

    const updatedOwner: Owner = {
      ...owner,
      approval: Math.max(0, owner.approval + ownerApprovalDelta),
    };

    onUpdateManager(null, updatedDirector, updatedClub, updatedOwner);
  };

  // Handle hiring a new manager
  const handleHireManager = (mgr: Manager) => {
    sounds.playSigningStamp();

    // Check if club can afford wage
    if (club.wageBudget - club.squad.reduce((a, b) => a + b.wage, 0) < mgr.wage) {
      setFeedback(`HIRE FAILED: Insufficient weekly wage budget to meet ${mgr.name}'s £${(mgr.wage / 1000).toFixed(0)}k/week demands.`);
      return;
    }

    const updatedManager: Manager = {
      ...mgr,
      clubId: club.id,
      trustInDirector: 75,
      contractYears: 3,
    };

    const updatedClub: Club = {
      ...club,
      managerId: mgr.id,
    };

    const updatedDirector: Director = {
      ...director,
      boardTrust: Math.min(100, director.boardTrust + 5),
      fanApproval: Math.min(100, director.fanApproval + (mgr.reputation > 85 ? 10 : 4)),
    };

    const updatedOwner: Owner = {
      ...owner,
      approval: Math.min(100, owner.approval + 5),
    };

    setSelectedFreeAgent(null);
    setFeedback(`APPOINTMENT CONFIRMED: ${mgr.name} has been officially unveiled as the new Head Coach of ${club.name}!`);
    onUpdateManager(updatedManager, updatedDirector, updatedClub, updatedOwner);
  };

  return (
    <div className="space-y-6">
      
      {/* Header */}
      <div className="bg-[#111827] border border-white/10 rounded-2xl p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold text-amber-400 uppercase tracking-wider mb-1">
              <UserCheck className="w-4 h-4" />
              <span>Head Coach Leadership & Recruitment</span>
            </div>
            <h1 className="text-2xl lg:text-3xl font-extrabold text-white tracking-tight">
              Head Coach Suite & Manager Market
            </h1>
            <p className="text-slate-400 text-xs mt-1">
              Evaluate your current tactician, manage dressing room harmony, or recruit from the elite free agent market.
            </p>
          </div>
        </div>
      </div>

      {feedback && (
        <div className="p-4 rounded-xl bg-slate-900 border border-amber-400/30 text-xs text-amber-300 flex items-center justify-between animate-in fade-in">
          <span>{feedback}</span>
          <button onClick={() => setFeedback(null)} className="text-slate-400 hover:text-white cursor-pointer ml-3">✕</button>
        </div>
      )}

      {/* Incumbent Manager Spotlight */}
      <div className="bg-[#111827] border border-white/10 rounded-xl p-6">
        <div className="border-b border-white/10 pb-3 mb-4 flex items-center justify-between">
          <div>
            <span className="text-xs font-bold text-white uppercase tracking-wider block">
              Current Head Coach in Dugout
            </span>
            <span className="text-[11px] text-slate-400">
              Contract terms, tactical style, and relationship with Sporting Director
            </span>
          </div>
          {currentManager && (
            <button
              onClick={handleSackManager}
              className="px-3.5 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-300 font-bold text-xs rounded-lg flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <UserX className="w-3.5 h-3.5" />
              <span>Terminate Contract</span>
            </button>
          )}
        </div>

        {currentManager ? (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            <div className="lg:col-span-2 space-y-4">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-2xl font-extrabold text-white">{currentManager.name}</h2>
                  <span className="text-xs text-slate-400 font-medium">
                    {currentManager.nationality} · Age {currentManager.age} · {currentManager.tacticalStyle}
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-xs text-slate-400 block font-mono">Reputation</span>
                  <span className="text-xl font-bold font-mono text-amber-400">{currentManager.reputation} / 100</span>
                </div>
              </div>

              <p className="text-xs leading-relaxed text-slate-300 italic font-serif bg-slate-900/60 border border-white/5 p-3.5 rounded-xl">
                "{currentManager.profileSnippet}"
              </p>

              <div className="grid grid-cols-3 gap-3">
                <div className="bg-slate-900/80 border border-white/5 rounded-xl p-3">
                  <span className="text-[10px] text-slate-400 uppercase block mb-1">Preferred System</span>
                  <span className="text-xs font-bold text-white font-mono">{currentManager.preferredFormation}</span>
                </div>
                <div className="bg-slate-900/80 border border-white/5 rounded-xl p-3">
                  <span className="text-[10px] text-slate-400 uppercase block mb-1">Control Appetite</span>
                  <span className={`text-xs font-bold capitalize ${
                    currentManager.controlDesire === 'autocrat' ? 'text-rose-400' :
                    currentManager.controlDesire === 'collaborator' ? 'text-amber-400' : 'text-emerald-400'
                  }`}>
                    {currentManager.controlDesire}
                  </span>
                </div>
                <div className="bg-slate-900/80 border border-white/5 rounded-xl p-3">
                  <span className="text-[10px] text-slate-400 uppercase block mb-1">Contract Remainder</span>
                  <span className="text-xs font-bold text-white font-mono">{currentManager.contractYears} Years (£{(currentManager.wage / 1000).toFixed(0)}k/wk)</span>
                </div>
              </div>
            </div>

            {/* Relationship & Friction Meter */}
            <div className="bg-slate-900/90 border border-white/5 rounded-xl p-4 flex flex-col justify-between">
              <div>
                <span className="text-xs font-bold text-slate-200 block mb-1 flex items-center gap-1.5">
                  <Flame className="w-4 h-4 text-amber-400" />
                  Chemistry with Sporting Director
                </span>
                <span className="text-[11px] text-slate-400 block mb-3">
                  Influenced by results and whether you respect delegated responsibilities.
                </span>

                <div className="mb-3">
                  <div className="flex items-center justify-between text-xs font-mono mb-1">
                    <span className="text-slate-400">Trust Level:</span>
                    <span className={`font-bold ${
                      currentManager.trustInDirector > 70 ? 'text-emerald-400' :
                      currentManager.trustInDirector > 40 ? 'text-amber-400' : 'text-rose-400'
                    }`}>
                      {currentManager.trustInDirector}%
                    </span>
                  </div>
                  <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                    <div 
                      className={`h-full transition-all duration-300 ${
                        currentManager.trustInDirector > 70 ? 'bg-emerald-400' :
                        currentManager.trustInDirector > 40 ? 'bg-amber-400' : 'bg-rose-500'
                      }`}
                      style={{ width: `${currentManager.trustInDirector}%` }}
                    />
                  </div>
                </div>

                <p className="text-[11px] text-slate-400 leading-relaxed">
                  {currentManager.trustInDirector > 70
                    ? 'The coach feels fully supported and respects your strategic squad additions.'
                    : currentManager.trustInDirector > 40
                    ? 'Minor friction over playing time and tactical authority. Maintain caution.'
                    : 'CRITICAL RIFT: The manager feels undermined and is considering public leaks or immediate resignation!'}
                </p>
              </div>

              <div className="pt-3 border-t border-white/10 text-[10px] text-slate-500">
                Severance Value: £{((currentManager.wage * 52 * Math.max(1, currentManager.contractYears)) / 1000000).toFixed(2)}M
              </div>
            </div>

          </div>
        ) : (
          <div className="text-center py-10 bg-slate-900/50 rounded-xl border border-dashed border-white/10">
            <UserX className="w-10 h-10 text-slate-500 mx-auto mb-2" />
            <h3 className="text-sm font-bold text-white">Dugout Currently Vacant</h3>
            <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
              Your club has no active head coach. Team match ratings are suffering a penalty. Select an available manager from the market below.
            </p>
          </div>
        )}
      </div>

      {/* Available Managers Market */}
      <div className="bg-[#111827] border border-white/10 rounded-xl p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/10 pb-3 mb-4">
          <div>
            <h3 className="text-xs font-bold text-white uppercase tracking-wider">
              Available Free Agent Managers Market
            </h3>
            <span className="text-[11px] text-slate-400">
              Unattached world-class managers and tactical specialists available for hire
            </span>
          </div>

          {/* Tactical Style Filter */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400">Style:</span>
            <select
              value={filterStyle}
              onChange={e => setFilterStyle(e.target.value)}
              className="px-2.5 py-1 text-xs bg-slate-900 border border-white/10 rounded-lg text-white"
            >
              <option value="all">All Tactical Styles</option>
              <option value="High Gegenpress">High Gegenpress</option>
              <option value="Tiki-Taka Possession">Tiki-Taka Possession</option>
              <option value="Direct Counter-Attack">Direct Counter-Attack</option>
              <option value="Pragmatic Low Block">Pragmatic Low Block</option>
              <option value="Fluid Wing Play">Fluid Wing Play</option>
            </select>
          </div>
        </div>

        {/* Manager Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredFreeAgents.map(mgr => (
            <div 
              key={mgr.id}
              className="bg-slate-900/80 border border-white/10 rounded-xl p-4 flex flex-col justify-between hover:border-white/20 transition-all"
            >
              <div>
                <div className="flex items-start justify-between mb-1.5">
                  <div>
                    <h4 className="text-sm font-bold text-white">{mgr.name}</h4>
                    <span className="text-[11px] text-slate-400 block">{mgr.nationality} · Age {mgr.age}</span>
                  </div>
                  <span className="text-xs font-bold font-mono px-2 py-0.5 bg-amber-400/10 border border-amber-400/20 text-amber-400 rounded">
                    Rep {mgr.reputation}
                  </span>
                </div>

                <div className="space-y-1 text-xs text-slate-300 my-2 pt-2 border-t border-white/5">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Tactics:</span>
                    <span className="font-semibold text-slate-200">{mgr.tacticalStyle}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Control Desire:</span>
                    <span className={`capitalize font-semibold ${
                      mgr.controlDesire === 'autocrat' ? 'text-rose-400' :
                      mgr.controlDesire === 'collaborator' ? 'text-amber-400' : 'text-emerald-400'
                    }`}>
                      {mgr.controlDesire}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Wage Demand:</span>
                    <span className="font-mono text-emerald-400 font-bold">£{(mgr.wage / 1000).toFixed(0)}k/wk</span>
                  </div>
                </div>

                <p className="text-[11px] text-slate-400 leading-snug italic font-serif mb-3 line-clamp-2">
                  "{mgr.profileSnippet}"
                </p>
              </div>

              <button
                onClick={() => handleHireManager(mgr)}
                className="w-full py-2 bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-slate-950 font-bold text-xs rounded-lg transition-all cursor-pointer active:scale-95 flex items-center justify-center gap-1.5"
              >
                <Check className="w-3.5 h-3.5" />
                <span>Offer Contract ({mgr.name.split(' ')[0]})</span>
              </button>
            </div>
          ))}
        </div>

      </div>

    </div>
  );
};
