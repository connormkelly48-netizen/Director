/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Volume2, VolumeX, FastForward, Play, ShieldAlert, Award, ChevronDown, Home } from 'lucide-react';
import { Club, Director } from '../types/game';
import { sounds } from '../services/soundEffects';

interface HeaderProps {
  currentTab: string;
  setCurrentTab: (tab: string) => void;
  currentWeek: number;
  seasonYear: number;
  club: Club | undefined;
  director: Director;
  onAdvanceWeek: () => void;
  onFastForwardJan: () => void;
  onFastForwardSummer: () => void;
  onBackToMainMenu: () => void;
  isSimulating: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  currentTab,
  setCurrentTab,
  currentWeek,
  seasonYear,
  club,
  director,
  onAdvanceWeek,
  onFastForwardJan,
  onFastForwardSummer,
  onBackToMainMenu,
  isSimulating,
}) => {
  const [muted, setMuted] = useState(sounds.isMuted());
  const [showSimMenu, setShowSimMenu] = useState(false);

  const toggleSound = () => {
    const next = sounds.toggleMute();
    setMuted(next);
  };

  const navItems = [
    { id: 'dashboard', label: 'Executive Suite' },
    { id: 'boardroom', label: 'The Boardroom' },
    { id: 'responsibilities', label: 'Delegation & Staff' },
    { id: 'manager', label: 'Head Coach' },
    { id: 'squad', label: 'First Team' },
    { id: 'academy', label: 'Youth Academy' },
    { id: 'transfers', label: 'Transfers' },
    { id: 'jobs', label: 'Job Market' },
  ];

  return (
    <header className="sticky top-0 z-40 bg-[#0b0f17]/95 backdrop-blur-md border-b border-white/10 px-4 lg:px-8 py-3 transition-colors">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-6">
        
        {/* Zone 1: Single text element wordmark with club accent */}
        <div className="flex items-center gap-3 shrink-0">
          <div 
            className="w-9 h-9 rounded-lg flex items-center justify-center font-bold text-white shadow-inner text-sm border border-white/15"
            style={{ backgroundColor: club?.primaryColor || '#1e293b' }}
          >
            {club?.shortName || 'SD'}
          </div>
          <div className="leading-tight">
            <span className="text-base font-bold tracking-tight text-white block">
              THE BOARDROOM
            </span>
            <div className="flex items-center gap-1.5 text-xs text-slate-400">
              <span className="font-medium text-slate-300">{club?.name || 'Unemployed'}</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums text-amber-400">Wk {currentWeek}</span>
              <span aria-hidden="true">·</span>
              <span>{seasonYear}/{seasonYear + 1}</span>
            </div>
          </div>
        </div>

        {/* Zone 2: Navigation Links */}
        <nav className="hidden xl:flex items-center gap-1">
          {navItems.map(item => {
            const active = currentTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => {
                  sounds.playClick();
                  setCurrentTab(item.id);
                }}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all whitespace-nowrap cursor-pointer ${
                  active
                    ? 'bg-white/10 text-white shadow-sm border border-white/10'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </nav>

        {/* Zone 3: Primary Actions (Main Menu, Mute toggle, Advance, Fast Forward) */}
        <div className="flex items-center gap-2.5 shrink-0">
          {/* Back to Main Menu Button */}
          <button
            onClick={() => {
              sounds.playClick();
              onBackToMainMenu();
            }}
            title="Save and return to Main Menu"
            className="px-3 py-2 rounded-lg text-xs font-bold text-slate-200 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 hover:border-amber-400/40 flex items-center gap-1.5 transition-all cursor-pointer shadow-sm active:scale-95"
          >
            <Home className="w-3.5 h-3.5 text-amber-400" />
            <span className="hidden sm:inline">Main Menu</span>
          </button>

          <button
            onClick={toggleSound}
            title={muted ? 'Unmute Audio' : 'Mute Audio'}
            className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 border border-white/10 transition-colors"
          >
            {muted ? <VolumeX className="w-4 h-4 text-red-400" /> : <Volume2 className="w-4 h-4 text-emerald-400" />}
          </button>

          {/* Fast-Forward Dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowSimMenu(!showSimMenu)}
              disabled={isSimulating}
              className="px-2.5 py-2 text-xs font-medium text-slate-300 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg flex items-center gap-1.5 transition-colors disabled:opacity-50"
            >
              <FastForward className="w-3.5 h-3.5 text-amber-400" />
              <span className="hidden sm:inline">Jump</span>
              <ChevronDown className="w-3 h-3 text-slate-400" />
            </button>

            {showSimMenu && (
              <div 
                className="absolute right-0 mt-2 w-48 bg-[#161f30] border border-white/15 rounded-xl shadow-2xl py-1.5 z-50 animate-in fade-in zoom-in-95 duration-100"
                onClick={() => setShowSimMenu(false)}
              >
                <button
                  onClick={() => {
                    sounds.playWhistle();
                    onFastForwardJan();
                  }}
                  className="w-full text-left px-3.5 py-2 text-xs text-slate-200 hover:bg-white/10 flex items-center gap-2"
                >
                  <FastForward className="w-3.5 h-3.5 text-amber-400" />
                  <span>Sim to Jan Window (Wk 20)</span>
                </button>
                <button
                  onClick={() => {
                    sounds.playWhistle();
                    onFastForwardSummer();
                  }}
                  className="w-full text-left px-3.5 py-2 text-xs text-slate-200 hover:bg-white/10 flex items-center gap-2"
                >
                  <Award className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Sim to Season End / Summer</span>
                </button>
              </div>
            )}
          </div>

          {/* Primary Action Button: Sim Next Matchday OR Season Finale */}
          <button
            onClick={() => {
              sounds.playWhistle();
              onAdvanceWeek();
            }}
            disabled={isSimulating}
            className={`px-4 py-2 text-xs font-bold rounded-lg shadow-lg flex items-center gap-2 transition-all active:scale-95 disabled:opacity-50 cursor-pointer ${
              currentWeek >= 46
                ? 'bg-gradient-to-r from-amber-300 via-amber-400 to-amber-500 text-slate-950 shadow-amber-400/40 ring-2 ring-amber-400'
                : 'text-slate-950 bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 shadow-amber-500/20'
            }`}
          >
            {currentWeek >= 46 ? (
              <>
                <Award className="w-4 h-4 text-slate-950" />
                <span>{isSimulating ? 'Tabulating Season...' : 'End of Season Review'}</span>
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>{isSimulating ? 'Simulating Matchday...' : 'Advance Week'}</span>
              </>
            )}
          </button>
        </div>

      </div>

      {/* Mobile Navigation bar */}
      <div className="flex xl:hidden items-center gap-1 mt-2.5 overflow-x-auto pb-1 scrollbar-none">
        <button
          onClick={() => {
            sounds.playClick();
            onBackToMainMenu();
          }}
          className="px-2.5 py-1 text-xs font-bold rounded-md whitespace-nowrap bg-amber-400/15 border border-amber-400/30 text-amber-300 flex items-center gap-1 shrink-0"
        >
          <Home className="w-3 h-3 text-amber-400" />
          <span>Main Menu</span>
        </button>
        {navItems.map(item => (
          <button
            key={item.id}
            onClick={() => {
              sounds.playClick();
              setCurrentTab(item.id);
            }}
            className={`px-2.5 py-1 text-xs font-medium rounded-md whitespace-nowrap ${
              currentTab === item.id ? 'bg-white/15 text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>
    </header>
  );
};
