/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Club, Director, DirectorPhilosophy, Owner } from '../types/game';
import { Shield, Briefcase, Award, TrendingUp, Users, DollarSign, ChevronRight, ArrowLeft } from 'lucide-react';
import { sounds } from '../services/soundEffects';

interface CharacterCreationModalProps {
  clubs: Club[];
  owners: Owner[];
  onComplete: (director: Director, startingClubId: string) => void;
  onBackToMainMenu?: () => void;
}

const PHILOSOPHIES: Array<{ id: DirectorPhilosophy; title: string; desc: string; icon: typeof TrendingUp }> = [
  {
    id: 'Moneyball Data',
    title: 'Moneyball & Algorithmic Value',
    desc: 'Extract value through underlying data metrics (xG, progression per 90). Relentless resale profit and wage discipline.',
    icon: TrendingUp,
  },
  {
    id: 'Galactico Star Power',
    title: 'Galáctico & High Prestige',
    desc: 'Target elite marquee names, international champions, and massive commercial presence. High wage commitments.',
    icon: Award,
  },
  {
    id: 'Academy First',
    title: 'Cobham & La Masia Blueprint',
    desc: 'Heavily invest in youth scouting and promotion. Build a home-grown culture with immense long-term resale upside.',
    icon: Users,
  },
  {
    id: 'High-Press Purist',
    title: 'Tactical Purity & Gegenpressing',
    desc: 'Recruit only high-motor, ultra-fit athletes tailored for relentless territorial press and transitions.',
    icon: Shield,
  },
  {
    id: 'Pragmatic Veteran Balance',
    title: 'Pragmatic Steel & Experience',
    desc: 'Prioritize physical leaders, set-piece dominance, and battle-hardened veterans to guarantee immediate league survival.',
    icon: DollarSign,
  },
];

export const CharacterCreationModal: React.FC<CharacterCreationModalProps> = ({ clubs, owners, onComplete, onBackToMainMenu }) => {
  const [name, setName] = useState('Alexander Vance');
  const [age, setAge] = useState(42);
  const [nationality, setNationality] = useState('British');
  const [philosophy, setPhilosophy] = useState<DirectorPhilosophy>('Moneyball Data');
  const [selectedTier, setSelectedTier] = useState<1 | 2 | 3>(1);
  const [startingClubId, setStartingClubId] = useState('manutd');
  const [favouriteClubId, setFavouriteClubId] = useState('arsenal');

  const filteredClubs = clubs.filter(c => c.tier === selectedTier);
  const selectedClub = clubs.find(c => c.id === startingClubId) || clubs[0];
  const selectedOwner = owners.find(o => o.id === selectedClub?.ownerId);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sounds.playGavel();

    const director: Director = {
      name: name.trim() || 'Director',
      age: Number(age) || 40,
      nationality,
      favouriteClubId,
      currentClubId: selectedClub.id,
      philosophy,
      reputation: selectedClub.tier === 1 ? 75 : selectedClub.tier === 2 ? 60 : 45,
      yearsInCharge: 0,
      trophiesWon: [],
      boardTrust: 75,
      fanApproval: 70,
      contractYears: 3,
      salary: selectedClub.tier === 1 ? 45000 : selectedClub.tier === 2 ? 15000 : 5000,
      netSpend: 0,
    };

    onComplete(director, selectedClub.id);
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#070a0f]/90 backdrop-blur-xl flex items-center justify-center p-4 overflow-y-auto">
      <div className="w-full max-w-4xl bg-[#111827] border border-white/10 rounded-2xl shadow-2xl p-6 lg:p-8 animate-in fade-in zoom-in-95 duration-200">
        
        {/* Modal Header */}
        <div className="border-b border-white/10 pb-5 mb-6">
          <div className="flex items-center justify-between gap-4 mb-2">
            <div className="flex items-center gap-2 text-amber-400 text-xs font-bold tracking-wider uppercase">
              <Briefcase className="w-4 h-4" />
              <span>Sporting Director Career Setup</span>
            </div>
            {onBackToMainMenu && (
              <button
                type="button"
                onClick={() => {
                  sounds.playClick();
                  onBackToMainMenu();
                }}
                className="px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-bold text-slate-300 hover:text-white rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Back to Main Menu</span>
              </button>
            )}
          </div>
          <h2 className="text-2xl lg:text-3xl font-extrabold text-white tracking-tight">
            Appointment of Sporting Director
          </h2>
          <p className="text-slate-400 text-sm mt-1">
            Define your executive profile, recruitment philosophy, and starting appointment in the English football pyramid.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          
          {/* Identity Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                Full Name
              </label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                required
                className="w-full px-3.5 py-2.5 bg-slate-900/90 border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:border-amber-400"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                Age
              </label>
              <input
                type="number"
                min={28}
                max={75}
                value={age}
                onChange={e => setAge(Number(e.target.value))}
                required
                className="w-full px-3.5 py-2.5 bg-slate-900/90 border border-white/10 rounded-lg text-white text-sm font-mono focus:outline-none focus:border-amber-400"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                Boyhood Club
              </label>
              <select
                value={favouriteClubId}
                onChange={e => setFavouriteClubId(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-slate-900/90 border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:border-amber-400"
              >
                {clubs.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.tier === 1 ? 'PL' : c.tier === 2 ? 'CH' : 'L1'})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Philosophy Selection */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
              Core Recruitment & Sporting Philosophy
            </label>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {PHILOSOPHIES.map(p => {
                const Icon = p.icon;
                const active = philosophy === p.id;
                return (
                  <div
                    key={p.id}
                    onClick={() => {
                      sounds.playClick();
                      setPhilosophy(p.id);
                    }}
                    className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                      active
                        ? 'bg-amber-500/10 border-amber-400 text-white shadow-md shadow-amber-500/5'
                        : 'bg-slate-900/60 border-white/10 text-slate-400 hover:border-white/20 hover:text-slate-200'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1.5">
                      <Icon className={`w-4 h-4 ${active ? 'text-amber-400' : 'text-slate-400'}`} />
                      <span className="text-xs font-bold text-slate-200">{p.title}</span>
                    </div>
                    <p className="text-[11px] leading-relaxed text-slate-400">
                      {p.desc}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Starting Club Selection with Tier Filter */}
          <div className="border-t border-white/10 pt-5">
            <div className="flex items-center justify-between mb-3">
              <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                Select Starting Club (68 English Pyramid Clubs)
              </label>
              
              {/* Tier Filter Tabs */}
              <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-lg border border-white/10">
                <button
                  type="button"
                  onClick={() => {
                    sounds.playClick();
                    setSelectedTier(1);
                    const first = clubs.find(c => c.tier === 1);
                    if (first) setStartingClubId(first.id);
                  }}
                  className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${
                    selectedTier === 1 ? 'bg-amber-400 text-slate-950 shadow-sm' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Premier League (20)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    sounds.playClick();
                    setSelectedTier(2);
                    const first = clubs.find(c => c.tier === 2);
                    if (first) setStartingClubId(first.id);
                  }}
                  className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${
                    selectedTier === 2 ? 'bg-amber-400 text-slate-950 shadow-sm' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Championship (24)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    sounds.playClick();
                    setSelectedTier(3);
                    const first = clubs.find(c => c.tier === 3);
                    if (first) setStartingClubId(first.id);
                  }}
                  className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${
                    selectedTier === 3 ? 'bg-amber-400 text-slate-950 shadow-sm' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  League One (24)
                </button>
              </div>
            </div>

            {/* Club Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2 max-h-48 overflow-y-auto p-1 scrollbar-thin">
              {filteredClubs.map(c => {
                const active = startingClubId === c.id;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => {
                      sounds.playClick();
                      setStartingClubId(c.id);
                    }}
                    className={`p-2.5 rounded-lg border text-left transition-all cursor-pointer ${
                      active
                        ? 'bg-white/15 border-amber-400 text-white font-bold ring-1 ring-amber-400'
                        : 'bg-slate-900/60 border-white/5 text-slate-300 hover:border-white/20'
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      <div 
                        className="w-3 h-3 rounded-full shrink-0" 
                        style={{ backgroundColor: c.primaryColor }}
                      />
                      <span className="text-xs truncate">{c.name}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Selected Club Boardroom Dossier Preview */}
          {selectedClub && (
            <div className="bg-slate-900/80 border border-white/10 rounded-xl p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-lg font-bold text-white">{selectedClub.name}</span>
                  <span className="text-xs text-slate-400">· {selectedClub.stadium} ({selectedClub.capacity.toLocaleString()} cap)</span>
                </div>
                <div className="text-xs text-slate-300 flex flex-wrap items-center gap-x-4 gap-y-1">
                  <span>Transfer War Chest: <strong className="font-mono text-amber-400">£{(selectedClub.transferBudget / 1000000).toFixed(1)}m</strong></span>
                  <span>Wage Ceiling: <strong className="font-mono text-emerald-400">£{(selectedClub.wageBudget / 1000).toFixed(0)}k/wk</strong></span>
                  <span>Owner: <strong className="text-slate-200">{selectedOwner?.name}</strong> ({selectedOwner?.wealth} / {selectedOwner?.patience} patience)</span>
                </div>
              </div>

              <button
                type="submit"
                className="w-full md:w-auto px-6 py-3 bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-slate-950 font-extrabold text-sm rounded-xl shadow-xl shadow-amber-500/20 flex items-center justify-center gap-2 transition-all cursor-pointer active:scale-95"
              >
                <span>Sign Sporting Contract</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}

        </form>
      </div>
    </div>
  );
};
