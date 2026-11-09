/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Club, Director, Owner, Manager, LeagueTier } from '../types/game';
import {
  Play,
  PlusCircle,
  Database,
  BookOpen,
  Settings,
  Volume2,
  VolumeX,
  Award,
  Shield,
  Briefcase,
  Users,
  Building,
  TrendingUp,
  Download,
  Upload,
  RotateCcw,
  ChevronRight,
  ExternalLink,
  Sparkles,
  HelpCircle,
  FileText,
  AlertTriangle
} from 'lucide-react';
import { sounds } from '../services/soundEffects';

interface MainMenuProps {
  director: Director | null;
  club: Club | undefined;
  owner: Owner | undefined;
  manager: Manager | undefined;
  currentWeek: number;
  seasonYear: number;
  allClubs: Club[];
  allOwners: Owner[];
  allManagers: Manager[];
  onContinueCareer: () => void;
  onStartNewCareer: () => void;
  onExportSave: () => void;
  onImportSave: (saveJson: string) => boolean;
  onResetDatabase: () => void;
}

export const MainMenu: React.FC<MainMenuProps> = ({
  director,
  club,
  owner,
  manager,
  currentWeek,
  seasonYear,
  allClubs,
  allOwners,
  allManagers,
  onContinueCareer,
  onStartNewCareer,
  onExportSave,
  onImportSave,
  onResetDatabase,
}) => {
  const [activeModal, setActiveModal] = useState<'none' | 'database' | 'handbook' | 'settings' | 'confirm_new'>('none');
  const [selectedDbTier, setSelectedDbTier] = useState<LeagueTier>(1);
  const [dbSearch, setDbSearch] = useState('');
  const [selectedDbClub, setSelectedDbClub] = useState<Club | null>(null);
  const [muted, setMuted] = useState(sounds.isMuted());
  const [importError, setImportError] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState<string | null>(null);

  const toggleSound = () => {
    const next = sounds.toggleMute();
    setMuted(next);
  };

  const filteredDbClubs = allClubs
    .filter(c => c.tier === selectedDbTier)
    .filter(c => c.name.toLowerCase().includes(dbSearch.toLowerCase()) || c.stadium.toLowerCase().includes(dbSearch.toLowerCase()));

  const handleFileImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    setImportError(null);
    setImportSuccess(null);
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const success = onImportSave(text);
        if (success) {
          sounds.playFanfare();
          setImportSuccess('Save file imported successfully! Career loaded.');
          setTimeout(() => setActiveModal('none'), 1200);
        } else {
          setImportError('Invalid save file format. Please verify the JSON file.');
          sounds.playCrisis();
        }
      } catch (err) {
        setImportError('Failed to parse save file JSON.');
        sounds.playCrisis();
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="min-h-screen bg-[#080c14] text-slate-100 flex flex-col justify-between relative overflow-hidden font-sans selection:bg-amber-500/20 selection:text-amber-200">
      
      {/* Background Ambience: Subtle Stadium Floodlight Gradients and Grid */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute -top-40 -left-40 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl" />
        <div className="absolute top-1/3 -right-40 w-[30rem] h-[30rem] bg-emerald-500/5 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 left-1/3 w-96 h-96 bg-blue-500/5 rounded-full blur-3xl" />
        
        {/* Pitch Lines Accent Overlay */}
        <div 
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: `radial-gradient(circle at 50% 50%, #ffffff 1px, transparent 1px), linear-gradient(to right, #ffffff 1px, transparent 1px)`,
            backgroundSize: '40px 40px, 120px 120px',
          }}
        />
      </div>

      {/* Top Header Bar */}
      <header className="relative z-10 max-w-7xl w-full mx-auto px-6 py-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center font-black text-slate-950 text-base shadow-lg shadow-amber-500/20 border border-amber-300/40">
            TB
          </div>
          <div>
            <span className="text-xs font-mono font-bold tracking-widest text-amber-400 uppercase block">
              Director of Football
            </span>
            <span className="text-sm font-extrabold tracking-tight text-white block">
              THE BOARDROOM SIMULATOR
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={toggleSound}
            title={muted ? 'Unmute Sound FX' : 'Mute Sound FX'}
            className="p-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 hover:text-white transition-colors cursor-pointer flex items-center gap-2 text-xs font-semibold"
          >
            {muted ? <VolumeX className="w-4 h-4 text-rose-400" /> : <Volume2 className="w-4 h-4 text-emerald-400" />}
            <span className="hidden sm:inline">{muted ? 'Audio Muted' : 'Sound FX On'}</span>
          </button>
        </div>
      </header>

      {/* Main Center Content */}
      <main className="relative z-10 max-w-7xl w-full mx-auto px-6 py-8 flex flex-col lg:flex-row items-center justify-between gap-12">
        
        {/* Left Column: Title Branding & Atmosphere */}
        <div className="w-full lg:w-1/2 space-y-6 text-center lg:text-left">
          
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-amber-400/10 border border-amber-400/25 text-amber-300 text-xs font-bold uppercase tracking-wider">
            <Sparkles className="w-3.5 h-3.5" />
            <span>2026/27 Edition • 68 Real English Clubs</span>
          </div>

          <div className="space-y-2">
            <h1 className="text-4xl sm:text-6xl font-black text-white tracking-tight leading-none uppercase">
              The <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-300 via-amber-400 to-amber-500">Boardroom</span>
            </h1>
            <p className="text-lg sm:text-xl font-light text-slate-300 tracking-wide font-sans">
              Sporting Director & Executive Simulation
            </p>
          </div>

          <p className="text-sm text-slate-400 leading-relaxed max-w-xl mx-auto lg:mx-0 font-normal">
            Every Saturday is won in the boardroom. Shape recruitment philosophy, balance billionaire owner egos, delegate managerial responsibilities, navigate transfer windows, and build a multi-generational football empire across the Premier League, Championship, and League One.
          </p>

          {/* Quick Badges */}
          <div className="pt-2 flex flex-wrap items-center justify-center lg:justify-start gap-4 text-xs font-mono text-slate-400">
            <div className="flex items-center gap-1.5 bg-white/5 border border-white/10 px-3 py-1.5 rounded-lg">
              <Shield className="w-3.5 h-3.5 text-amber-400" />
              <span>Full 46-Week Seasons</span>
            </div>
            <div className="flex items-center gap-1.5 bg-white/5 border border-white/10 px-3 py-1.5 rounded-lg">
              <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
              <span>Promotion & Relegation</span>
            </div>
            <div className="flex items-center gap-1.5 bg-white/5 border border-white/10 px-3 py-1.5 rounded-lg">
              <Users className="w-3.5 h-3.5 text-blue-400" />
              <span>Autonomous AI Transfers</span>
            </div>
          </div>
        </div>

        {/* Right Column: Menu Options & Active Career Card */}
        <div className="w-full lg:w-5/12 max-w-md space-y-4">
          
          {/* Active Career Snapshot Card (if save/director exists) */}
          {director && club ? (
            <div className="bg-gradient-to-b from-[#141d2e] to-[#0d1422] border-2 border-amber-400/40 rounded-2xl p-6 shadow-2xl shadow-amber-500/10 relative overflow-hidden group">
              <div 
                className="absolute top-0 right-0 w-32 h-32 rounded-full blur-2xl opacity-20 pointer-events-none"
                style={{ backgroundColor: club.primaryColor || '#f59e0b' }}
              />

              <div className="flex items-start justify-between gap-4 mb-4 relative z-10">
                <div className="flex items-center gap-3">
                  <div 
                    className="w-12 h-12 rounded-xl flex items-center justify-center font-bold text-white shadow-inner text-base border border-white/20"
                    style={{ backgroundColor: club.primaryColor || '#1e293b' }}
                  >
                    {club.shortName}
                  </div>
                  <div>
                    <span className="text-[10px] font-bold font-mono tracking-wider uppercase text-amber-400 block">
                      Active Directorship
                    </span>
                    <h3 className="text-xl font-black text-white leading-tight">
                      {club.name}
                    </h3>
                    <div className="text-xs text-slate-300">
                      {club.tier === 1 ? 'Premier League' : club.tier === 2 ? 'Championship' : 'League One'}
                    </div>
                  </div>
                </div>

                <div className="text-right font-mono">
                  <span className="text-xs text-slate-400 block">Campaign</span>
                  <span className="text-sm font-bold text-white">Wk {currentWeek} / 46</span>
                  <span className="text-[10px] text-amber-400 block">{seasonYear}/{seasonYear + 1}</span>
                </div>
              </div>

              {/* Director Details */}
              <div className="bg-black/40 border border-white/5 rounded-xl p-3 mb-5 space-y-2 text-xs font-mono relative z-10">
                <div className="flex justify-between items-center text-slate-300">
                  <span className="text-slate-400">Sporting Director:</span>
                  <span className="font-bold text-white">{director.name} ({director.age}y, {director.nationality})</span>
                </div>
                <div className="flex justify-between items-center text-slate-300">
                  <span className="text-slate-400">Philosophy:</span>
                  <span className="text-amber-300">{director.philosophy}</span>
                </div>
                <div className="flex justify-between items-center pt-1 border-t border-white/5">
                  <span className="text-slate-400">Board Trust:</span>
                  <div className="flex items-center gap-2">
                    <div className="w-20 bg-slate-800 h-2 rounded-full overflow-hidden">
                      <div 
                        className={`h-full rounded-full ${
                          director.boardTrust > 60 ? 'bg-emerald-400' : director.boardTrust > 35 ? 'bg-amber-400' : 'bg-rose-500'
                        }`}
                        style={{ width: `${director.boardTrust}%` }}
                      />
                    </div>
                    <span className="font-bold text-white">{director.boardTrust}%</span>
                  </div>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">War Chest:</span>
                  <span className="text-emerald-400 font-bold">£{(club.transferBudget / 1000000).toFixed(1)}m</span>
                </div>
              </div>

              {/* Continue Button */}
              <button
                onClick={() => {
                  sounds.playWhistle();
                  onContinueCareer();
                }}
                className="w-full py-3.5 bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-slate-950 font-black text-sm rounded-xl shadow-xl shadow-amber-500/20 flex items-center justify-center gap-2.5 transition-all cursor-pointer active:scale-95 group-hover:shadow-amber-400/30"
              >
                <Play className="w-4 h-4 fill-current" />
                <span>CONTINUE CAREER</span>
              </button>
            </div>
          ) : null}

          {/* Primary Action Buttons List */}
          <div className="space-y-2.5">
            {/* If no career exists, Start New Career is primary highlighted */}
            {!director ? (
              <button
                onClick={() => {
                  sounds.playGavel();
                  onStartNewCareer();
                }}
                className="w-full py-4 bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-slate-950 font-black text-sm rounded-xl shadow-xl shadow-amber-500/20 flex items-center justify-center gap-2.5 transition-all cursor-pointer active:scale-95"
              >
                <Play className="w-4 h-4 fill-current" />
                <span>START NEW CAREER</span>
              </button>
            ) : (
              <button
                onClick={() => {
                  sounds.playClick();
                  setActiveModal('confirm_new');
                }}
                className="w-full py-3 bg-white/5 hover:bg-white/10 border border-white/10 hover:border-amber-400/40 text-slate-200 hover:text-white font-bold text-xs rounded-xl transition-all cursor-pointer flex items-center justify-between px-4"
              >
                <div className="flex items-center gap-3">
                  <PlusCircle className="w-4 h-4 text-amber-400" />
                  <span>Start New Career</span>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-500" />
              </button>
            )}

            {/* Club Pyramid Explorer */}
            <button
              onClick={() => {
                sounds.playClick();
                setActiveModal('database');
              }}
              className="w-full py-3 bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 text-slate-200 hover:text-white font-bold text-xs rounded-xl transition-all cursor-pointer flex items-center justify-between px-4"
            >
              <div className="flex items-center gap-3">
                <Database className="w-4 h-4 text-blue-400" />
                <span>Club Database & Pyramid Explorer</span>
              </div>
              <span className="text-[10px] font-mono text-slate-400">68 Clubs</span>
            </button>

            {/* Director's Handbook / How to Play */}
            <button
              onClick={() => {
                sounds.playClick();
                setActiveModal('handbook');
              }}
              className="w-full py-3 bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 text-slate-200 hover:text-white font-bold text-xs rounded-xl transition-all cursor-pointer flex items-center justify-between px-4"
            >
              <div className="flex items-center gap-3">
                <BookOpen className="w-4 h-4 text-emerald-400" />
                <span>Director's Handbook & Game Guide</span>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-500" />
            </button>

            {/* Career Data & Settings */}
            <button
              onClick={() => {
                sounds.playClick();
                setActiveModal('settings');
              }}
              className="w-full py-3 bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 text-slate-200 hover:text-white font-bold text-xs rounded-xl transition-all cursor-pointer flex items-center justify-between px-4"
            >
              <div className="flex items-center gap-3">
                <Settings className="w-4 h-4 text-slate-400" />
                <span>Save Manager & Audio Settings</span>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-500" />
            </button>
          </div>

        </div>

      </main>

      {/* Footer & Atmospheric Quote */}
      <footer className="relative z-10 border-t border-white/5 bg-[#05080e]/80 backdrop-blur-sm px-6 py-4">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500 font-mono">
          <div className="italic text-center sm:text-left">
            "A manager looks after Saturday. The sporting director builds the next decade."
          </div>
          <div className="flex items-center gap-4 text-[11px]">
            <span>Version 2.0 Official</span>
            <span aria-hidden="true">·</span>
            <span className="text-emerald-400">Autosave Enabled</span>
          </div>
        </div>
      </footer>

      {/* MODAL 1: Confirm New Career Warning */}
      {activeModal === 'confirm_new' && (
        <div className="fixed inset-0 z-50 bg-[#070a0f]/90 backdrop-blur-xl flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-[#111827] border border-amber-400/30 rounded-2xl p-6 shadow-2xl animate-in zoom-in-95 duration-150 space-y-4">
            <div className="w-12 h-12 bg-amber-500/10 border border-amber-500/30 rounded-xl flex items-center justify-center mx-auto text-amber-400">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div className="text-center">
              <h3 className="text-xl font-bold text-white">Start New Career?</h3>
              <p className="text-xs text-slate-300 mt-2 leading-relaxed">
                You have an ongoing career in progress as Sporting Director at <strong className="text-white">{club?.name || 'your club'}</strong> (Week {currentWeek}).
                Starting a new career will replace your current save.
              </p>
            </div>
            <div className="pt-3 border-t border-white/10 flex items-center justify-end gap-3">
              <button
                onClick={() => setActiveModal('none')}
                className="px-4 py-2 bg-white/5 hover:bg-white/10 text-xs font-semibold text-slate-300 rounded-lg cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  sounds.playGavel();
                  setActiveModal('none');
                  onStartNewCareer();
                }}
                className="px-4 py-2 bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-slate-950 font-bold text-xs rounded-lg shadow-md cursor-pointer"
              >
                Proceed & Create Character
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: Club Database & Pyramid Explorer */}
      {activeModal === 'database' && (
        <div className="fixed inset-0 z-50 bg-[#070a0f]/90 backdrop-blur-xl flex items-center justify-center p-4">
          <div className="w-full max-w-5xl bg-[#111827] border border-white/15 rounded-2xl shadow-2xl p-6 lg:p-8 max-h-[90vh] flex flex-col animate-in zoom-in-95 duration-150">
            
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-white/10 pb-4 mb-4 shrink-0">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-blue-500/10 border border-blue-500/30 rounded-xl text-blue-400">
                  <Database className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-xl font-black text-white">English Pyramid Club Database</h3>
                  <p className="text-xs text-slate-400">Browse all 68 clubs across 3 professional divisions with owners, budgets, and stadiums.</p>
                </div>
              </div>
              <button
                onClick={() => setActiveModal('none')}
                className="p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-lg cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Filter Controls */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mb-4 shrink-0">
              <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-xl border border-white/10 w-full sm:w-auto">
                <button
                  onClick={() => setSelectedDbTier(1)}
                  className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
                    selectedDbTier === 1 ? 'bg-amber-400 text-slate-950 shadow-sm' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Premier League (20)
                </button>
                <button
                  onClick={() => setSelectedDbTier(2)}
                  className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
                    selectedDbTier === 2 ? 'bg-amber-400 text-slate-950 shadow-sm' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Championship (24)
                </button>
                <button
                  onClick={() => setSelectedDbTier(3)}
                  className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
                    selectedDbTier === 3 ? 'bg-amber-400 text-slate-950 shadow-sm' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  League One (24)
                </button>
              </div>

              <input
                type="text"
                placeholder="Search club or stadium..."
                value={dbSearch}
                onChange={e => setDbSearch(e.target.value)}
                className="w-full sm:w-64 px-3.5 py-1.5 bg-slate-900 border border-white/10 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-400"
              />
            </div>

            {/* Club Cards Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 overflow-y-auto pr-1 flex-1">
              {filteredDbClubs.map(c => {
                const clubOwner = allOwners.find(o => o.id === c.ownerId);
                const clubManager = allManagers.find(m => m.id === c.managerId);
                return (
                  <div
                    key={c.id}
                    className="bg-slate-900/80 border border-white/10 hover:border-amber-400/40 rounded-xl p-4 transition-all"
                  >
                    <div className="flex items-center gap-3 mb-2.5">
                      <div
                        className="w-9 h-9 rounded-lg flex items-center justify-center font-bold text-white text-xs border border-white/20 shrink-0"
                        style={{ backgroundColor: c.primaryColor }}
                      >
                        {c.shortName}
                      </div>
                      <div className="min-w-0">
                        <span className="font-bold text-white text-sm block truncate">{c.name}</span>
                        <span className="text-[10px] text-slate-400 block truncate">{c.stadium} ({c.capacity.toLocaleString()})</span>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-[11px] font-mono border-t border-white/5 pt-2 text-slate-300">
                      <div>
                        <span className="text-[9px] text-slate-400 block uppercase">War Chest</span>
                        <span className="font-bold text-amber-400">£{(c.transferBudget / 1000000).toFixed(1)}m</span>
                      </div>
                      <div>
                        <span className="text-[9px] text-slate-400 block uppercase">Wage Budget</span>
                        <span className="font-bold text-emerald-400">£{(c.wageBudget / 1000).toFixed(0)}k/wk</span>
                      </div>
                      <div>
                        <span className="text-[9px] text-slate-400 block uppercase">Owner</span>
                        <span className="text-white truncate block">{clubOwner?.name || 'Consortium'}</span>
                      </div>
                      <div>
                        <span className="text-[9px] text-slate-400 block uppercase">Head Coach</span>
                        <span className="text-white truncate block">{clubManager?.name || 'Vacant'}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

          </div>
        </div>
      )}

      {/* MODAL 3: Director's Handbook / How to Play */}
      {activeModal === 'handbook' && (
        <div className="fixed inset-0 z-50 bg-[#070a0f]/90 backdrop-blur-xl flex items-center justify-center p-4">
          <div className="w-full max-w-4xl bg-[#111827] border border-white/15 rounded-2xl shadow-2xl p-6 lg:p-8 max-h-[85vh] flex flex-col animate-in zoom-in-95 duration-150">
            
            <div className="flex items-center justify-between border-b border-white/10 pb-4 mb-4 shrink-0">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-400">
                  <BookOpen className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-xl font-black text-white">The Sporting Director's Handbook</h3>
                  <p className="text-xs text-slate-400">Essential executive rules and gameplay mechanics for your career.</p>
                </div>
              </div>
              <button
                onClick={() => setActiveModal('none')}
                className="p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-lg cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="overflow-y-auto space-y-5 pr-2 flex-1 text-xs text-slate-300 leading-relaxed">
              
              <div className="bg-slate-900/80 border border-white/10 rounded-xl p-4">
                <h4 className="text-sm font-bold text-amber-400 mb-1 flex items-center gap-2">
                  <Briefcase className="w-4 h-4" />
                  <span>1. The Role of the Sporting Director</span>
                </h4>
                <p>
                  Unlike traditional manager games where you set match tactics and substitutions, in <strong className="text-white">The Boardroom</strong> you operate above the dugout. You manage long-term squad architecture, hire and fire head coaches, negotiate player contracts, handle boardroom budgets, and satisfy owner demands.
                </p>
              </div>

              <div className="bg-slate-900/80 border border-white/10 rounded-xl p-4">
                <h4 className="text-sm font-bold text-emerald-400 mb-1 flex items-center gap-2">
                  <Building className="w-4 h-4" />
                  <span>2. Board Trust & Sacking Criteria</span>
                </h4>
                <p>
                  Your tenure is safeguarded by <strong className="text-white">Board Trust (0 - 100%)</strong>. Delivering on preseason targets, balancing wage budgets, and appointing a winning manager keeps trust high. If Board Trust drops to 0%, the owner will issue an extraordinary dismissal. You will be sacked with severance and enter the Job Market.
                </p>
              </div>

              <div className="bg-slate-900/80 border border-white/10 rounded-xl p-4">
                <h4 className="text-sm font-bold text-blue-400 mb-1 flex items-center gap-2">
                  <Users className="w-4 h-4" />
                  <span>3. Delegation Matrix & Managerial Tension</span>
                </h4>
                <p>
                  Through the <strong className="text-white">Delegation & Staff</strong> tab, you decide whether player signings, sales, renewals, and tactics are retained by you, shared collaboratively, or delegated to the head coach. An autocratic manager will grow furious if you impose unwanted signings, while collaborative coaches appreciate shared recruitment.
                </p>
              </div>

              <div className="bg-slate-900/80 border border-white/10 rounded-xl p-4">
                <h4 className="text-sm font-bold text-purple-400 mb-1 flex items-center gap-2">
                  <TrendingUp className="w-4 h-4" />
                  <span>4. 46-Week Seasons & The Full Pyramid</span>
                </h4>
                <p>
                  A full season consists of 46 matchdays where all clubs play each other twice. At Week 20, the January Transfer Window opens. At Week 46, the official Season Finale triggers with silverware, merit prize money, broadcasting TV rights, youth graduations, and automatic promotion/relegation between Premier League, Championship, and League One!
                </p>
              </div>

            </div>

          </div>
        </div>
      )}

      {/* MODAL 4: Save Manager & Audio Settings */}
      {activeModal === 'settings' && (
        <div className="fixed inset-0 z-50 bg-[#070a0f]/90 backdrop-blur-xl flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-[#111827] border border-white/15 rounded-2xl shadow-2xl p-6 max-h-[85vh] flex flex-col animate-in zoom-in-95 duration-150 space-y-5">
            
            <div className="flex items-center justify-between border-b border-white/10 pb-4 shrink-0">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-slate-800 border border-white/10 rounded-xl text-slate-300">
                  <Settings className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-xl font-black text-white">Save Manager & Audio</h3>
                  <p className="text-xs text-slate-400">Export, import, or manage your career save data.</p>
                </div>
              </div>
              <button
                onClick={() => setActiveModal('none')}
                className="p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-lg cursor-pointer"
              >
                ✕
              </button>
            </div>

            {importSuccess && (
              <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-xs text-emerald-300">
                ✓ {importSuccess}
              </div>
            )}

            {importError && (
              <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-xs text-rose-300">
                ✕ {importError}
              </div>
            )}

            {/* Audio Toggle & Sound Test */}
            <div className="bg-slate-900 border border-white/10 rounded-xl p-4 space-y-3">
              <span className="text-xs font-bold text-white uppercase tracking-wider block">Sound & Audio</span>
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-300">Sound Effects:</span>
                <button
                  onClick={toggleSound}
                  className={`px-3 py-1.5 text-xs font-bold rounded-lg border flex items-center gap-1.5 cursor-pointer transition-all ${
                    !muted ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' : 'bg-white/5 border-white/10 text-slate-400'
                  }`}
                >
                  {!muted ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
                  <span>{!muted ? 'Enabled' : 'Muted'}</span>
                </button>
              </div>

              {/* Sound Test Buttons */}
              <div className="pt-2 border-t border-white/5 flex items-center gap-2">
                <button
                  onClick={() => sounds.playWhistle()}
                  className="px-2.5 py-1 bg-white/5 hover:bg-white/10 text-[11px] text-slate-300 rounded border border-white/5"
                >
                  Test Whistle
                </button>
                <button
                  onClick={() => sounds.playGavel()}
                  className="px-2.5 py-1 bg-white/5 hover:bg-white/10 text-[11px] text-slate-300 rounded border border-white/5"
                >
                  Test Gavel
                </button>
                <button
                  onClick={() => sounds.playFanfare()}
                  className="px-2.5 py-1 bg-white/5 hover:bg-white/10 text-[11px] text-slate-300 rounded border border-white/5"
                >
                  Test Fanfare
                </button>
              </div>
            </div>

            {/* Save File Export & Import */}
            <div className="bg-slate-900 border border-white/10 rounded-xl p-4 space-y-3">
              <span className="text-xs font-bold text-white uppercase tracking-wider block">Backup & Cloud Portability</span>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Save files are automatically preserved in your browser's local storage. You can also export your save as a JSON file to transfer between devices.
              </p>

              <div className="flex items-center gap-3 pt-1">
                <button
                  onClick={() => {
                    sounds.playClick();
                    onExportSave();
                  }}
                  disabled={!director}
                  className="flex-1 py-2 px-3 bg-white/5 hover:bg-white/10 disabled:opacity-40 border border-white/10 rounded-lg text-xs font-bold text-white flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5 text-amber-400" />
                  <span>Export Save (.JSON)</span>
                </button>

                <label className="flex-1 py-2 px-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-xs font-bold text-white flex items-center justify-center gap-1.5 cursor-pointer">
                  <Upload className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Import Save</span>
                  <input
                    type="file"
                    accept=".json"
                    onChange={handleFileImport}
                    className="hidden"
                  />
                </label>
              </div>
            </div>

            {/* Reset Factory Database */}
            <div className="bg-rose-950/20 border border-rose-500/20 rounded-xl p-4 flex items-center justify-between">
              <div>
                <span className="text-xs font-bold text-rose-300 block">Reset Database</span>
                <span className="text-[10px] text-slate-400">Clear all local saves and restore factory clubs</span>
              </div>
              <button
                onClick={() => {
                  if (confirm('Are you sure you want to reset all data and clear current career?')) {
                    sounds.playCrisis();
                    onResetDatabase();
                    setActiveModal('none');
                  }
                }}
                className="px-3 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-300 text-xs font-bold rounded-lg cursor-pointer flex items-center gap-1"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset</span>
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
};
