/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  Shield,
  Award,
  TrendingUp,
  ChevronRight,
  ArrowLeft,
  Flame,
  Zap,
  Compass,
} from 'lucide-react';
import { Club, Owner, TacticalStyle } from '../types/game';
import { getStartingReputationForClub, styleToDefaultFormation } from '../services/managerModeService';
import { sounds } from '../services/soundEffects';
import { Modal } from './ui/Modal';

interface ManagerSetupModalProps {
  clubs: Club[];
  owners: Owner[];
  onComplete: (params: {
    name: string;
    nationality: string;
    age: number;
    tacticalStyle: TacticalStyle;
    startingClubId: string;
  }) => void;
  onBackToMainMenu?: () => void;
}

const TACTICAL_STYLES: Array<{
  id: TacticalStyle;
  title: string;
  desc: string;
  icon: typeof Shield;
}> = [
  {
    id: 'High Gegenpress',
    title: 'High Gegenpress',
    desc: 'Relentless territorial pressing and fast turnovers. Thrives with high-engine attackers and front-foot ball winners.',
    icon: Flame,
  },
  {
    id: 'Tiki-Taka Possession',
    title: 'Tiki-Taka Possession',
    desc: 'Short-passing control, ball-playing defenders, and technical midfielders dictating tempo.',
    icon: Compass,
  },
  {
    id: 'Direct Counter-Attack',
    title: 'Direct Counter-Attack',
    desc: 'Compact defensive block springing vertical counter-attacks into clinical forwards.',
    icon: Zap,
  },
  {
    id: 'Pragmatic Low Block',
    title: 'Pragmatic Low Block',
    desc: 'Disciplined defensive structure and set-piece resilience designed to grind out results.',
    icon: Shield,
  },
  {
    id: 'Fluid Wing Play',
    title: 'Fluid Wing Play',
    desc: 'Explosive wide combinations, overlapping wingbacks, and constant service into the box.',
    icon: TrendingUp,
  },
];

export const ManagerSetupModal: React.FC<ManagerSetupModalProps> = ({
  clubs,
  owners,
  onComplete,
  onBackToMainMenu,
}) => {
  const [name, setName] = useState('Marcus Sterling');
  const [nationality, setNationality] = useState('England');
  const [ageInput, setAgeInput] = useState('38');
  const [tacticalStyle, setTacticalStyle] = useState<TacticalStyle>('High Gegenpress');
  const [selectedTier, setSelectedTier] = useState<1 | 2 | 3>(2);
  const [startingClubId, setStartingClubId] = useState(() => {
    const tier2First = clubs.find(c => c.tier === 2);
    return tier2First?.id || clubs[0]?.id || 'manutd';
  });

  const filteredClubs = clubs.filter(c => c.tier === selectedTier);
  const selectedClub = clubs.find(c => c.id === startingClubId) || clubs[0];
  const selectedOwner = owners.find(o => o.id === selectedClub?.ownerId);
  const startingRep = selectedClub ? getStartingReputationForClub(selectedClub) : 0;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedClub) return;
    sounds.playGavel();

    const parsedAge = parseInt(ageInput, 10);
    const clampedAge = Number.isFinite(parsedAge)
      ? Math.min(78, Math.max(24, parsedAge))
      : 38;

    onComplete({
      name: name.trim() || 'Marcus Sterling',
      nationality: nationality.trim() || 'England',
      age: clampedAge,
      tacticalStyle,
      startingClubId: selectedClub.id,
    });
  };

  return (
    <Modal
      isOpen={true}
      dismissible={false}
      showCloseButton={false}
      maxWidthClass="max-w-4xl"
      backdropClass="bg-[#070a0f]/90"
      ariaLabel="Manager Mode Career Setup"
      header={
        <div>
          <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
            <div className="flex items-center gap-2 text-amber-400 text-xs font-bold tracking-wider uppercase">
              <Award className="w-4 h-4 shrink-0" />
              <span>Manager Mode Career Setup</span>
            </div>
            {onBackToMainMenu && (
              <button
                type="button"
                onClick={() => {
                  sounds.playClick();
                  onBackToMainMenu();
                }}
                className="min-h-11 lg:min-h-0 px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-bold text-slate-300 hover:text-white rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Back to Main Menu</span>
              </button>
            )}
          </div>
          <h2 className="text-xl sm:text-2xl lg:text-3xl font-extrabold text-white tracking-tight">
            Step Into the Touchline Technical Area
          </h2>
          <p className="text-slate-400 text-xs sm:text-sm mt-1">
            Pick your starting age, tactical style, and club. An AI Sporting Director will be assigned to every club to handle recruitment.
          </p>
        </div>
      }
      footer={
        selectedClub ? (
          <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mb-0.5">
                <span className="text-base sm:text-lg font-bold text-white">{selectedClub.name}</span>
                <span className="text-xs text-slate-400">
                  · Prestige {selectedClub.prestige}
                </span>
              </div>
              <div className="text-xs text-slate-300 flex flex-wrap items-center gap-x-3 gap-y-1">
                <span>
                  Starting Rep: <strong className="font-mono text-amber-400 tabular-nums">{startingRep}</strong>{' '}
                  <span className="text-slate-500">(Prestige - 20)</span>
                </span>
                <span>
                  Expectation: <strong className="text-white">{selectedClub.fanExpectation}</strong>
                </span>
                <span>
                  Patience: <strong className="text-slate-200 capitalize">{selectedOwner?.patience || 'balanced'}</strong>
                </span>
              </div>
            </div>

            <button
              type="submit"
              form="manager-creation-form"
              className="w-full md:w-auto min-h-11 px-6 py-3 bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-slate-950 font-extrabold text-sm rounded-xl shadow-xl shadow-amber-500/20 flex items-center justify-center gap-2 transition-all cursor-pointer active:scale-95 shrink-0"
            >
              <span>Take Charge at {selectedClub.shortName}</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        ) : undefined
      }
    >
      <form id="manager-creation-form" onSubmit={handleSubmit} className="space-y-6">
        {/* Identity Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
              Manager Name
            </label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              required
              className="w-full min-h-11 lg:min-h-0 px-3.5 py-2.5 bg-slate-900/90 border border-white/10 rounded-lg text-white text-base md:text-sm focus:outline-none focus:border-amber-400"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
              Starting Age (24–78)
            </label>
            <input
              type="number"
              inputMode="numeric"
              min={24}
              max={78}
              value={ageInput}
              onChange={e => setAgeInput(e.target.value)}
              onBlur={() => {
                const parsed = parseInt(ageInput, 10);
                setAgeInput(
                  String(Number.isFinite(parsed) ? Math.min(78, Math.max(24, parsed)) : 38)
                );
              }}
              required
              className="w-full min-h-11 lg:min-h-0 px-3.5 py-2.5 bg-slate-900/90 border border-white/10 rounded-lg text-white text-base md:text-sm font-mono focus:outline-none focus:border-amber-400"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
              Nationality
            </label>
            <input
              type="text"
              value={nationality}
              onChange={e => setNationality(e.target.value)}
              required
              className="w-full min-h-11 lg:min-h-0 px-3.5 py-2.5 bg-slate-900/90 border border-white/10 rounded-lg text-white text-base md:text-sm focus:outline-none focus:border-amber-400"
            />
          </div>
        </div>

        {/* Tactical Style Selection */}
        <div>
          <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
            <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
              Tactical Philosophy
            </label>
            <span className="text-xs font-mono text-amber-400">
              Default Formation: {styleToDefaultFormation(tacticalStyle)}
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {TACTICAL_STYLES.map(style => {
              const Icon = style.icon;
              const active = tacticalStyle === style.id;
              return (
                <button
                  key={style.id}
                  type="button"
                  onClick={() => {
                    sounds.playClick();
                    setTacticalStyle(style.id);
                  }}
                  className={`p-3.5 rounded-xl border text-left cursor-pointer transition-all active:scale-[0.98] ${
                    active
                      ? 'bg-amber-500/10 border-amber-400 text-white shadow-md shadow-amber-500/5'
                      : 'bg-slate-900/60 border-white/10 text-slate-400 hover:border-white/20 hover:text-slate-200'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <Icon
                      className={`w-4 h-4 shrink-0 ${
                        active ? 'text-amber-400' : 'text-slate-400'
                      }`}
                    />
                    <span className="text-xs font-bold text-slate-100">{style.title}</span>
                  </div>
                  <p className="text-xs sm:text-[11px] leading-relaxed text-slate-400">
                    {style.desc}
                  </p>
                </button>
              );
            })}
          </div>
        </div>

        {/* Club Selection */}
        <div className="border-t border-white/10 pt-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
            <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
              Select Starting Club (68 Clubs)
            </label>

            <div className="flex flex-wrap sm:flex-nowrap items-center gap-1 bg-slate-900 p-1 rounded-lg border border-white/10">
              {[
                { tier: 1 as const, label: 'Premier League (20)' },
                { tier: 2 as const, label: 'Championship (24)' },
                { tier: 3 as const, label: 'League One (24)' },
              ].map(t => (
                <button
                  key={t.tier}
                  type="button"
                  onClick={() => {
                    sounds.playClick();
                    setSelectedTier(t.tier);
                    const first = clubs.find(c => c.tier === t.tier);
                    if (first) setStartingClubId(first.id);
                  }}
                  className={`min-h-11 lg:min-h-0 px-3 py-1.5 text-xs font-semibold rounded-md transition-all cursor-pointer ${
                    selectedTier === t.tier
                      ? 'bg-amber-400 text-slate-950 shadow-sm'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2 max-h-56 overflow-y-auto p-1 scrollbar-thin">
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
                  className={`min-h-11 lg:min-h-0 p-2.5 rounded-lg border text-left transition-all cursor-pointer ${
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
                  <span className="text-[10px] font-mono text-slate-400 block mt-1">
                    Rep {getStartingReputationForClub(c)}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </form>
    </Modal>
  );
};
