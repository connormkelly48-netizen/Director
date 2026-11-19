/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { Club, Director, GameMode, LeagueTier, Manager, ManagerCareerState, Owner } from '../types/game';
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
import { Modal } from './ui/Modal';
import { validateSaveJson } from '../utils/saveValidation';
import { PWAInstallButton } from './PWAInstallButton';

interface MainMenuProps {
  gameMode?: GameMode;
  director: Director | null;
  managerCareer?: ManagerCareerState | null;
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
  onStartNewManagerCareer?: () => void;
  onExportSave: () => void;
  onImportSave: (saveJson: string) => { ok: boolean; error?: string };
  onResetDatabase: () => void;
}

export const MainMenu: React.FC<MainMenuProps> = ({
  gameMode = 'director',
  director,
  managerCareer = null,
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
  onStartNewManagerCareer,
  onExportSave,
  onImportSave,
  onResetDatabase,
}) => {
  const [activeModal, setActiveModal] = useState<'none' | 'database' | 'handbook' | 'settings' | 'confirm_new' | 'confirm_reset'>('none');
  const [pendingModeChoice, setPendingModeChoice] = useState<GameMode>('director');
  const hasActiveCareer = gameMode === 'manager' ? Boolean(managerCareer) : Boolean(director);
  const displayWeek = Math.min(46, currentWeek);
  const [selectedDbTier, setSelectedDbTier] = useState<LeagueTier>(1);
  const [dbSearch, setDbSearch] = useState('');
  const [selectedDbClub, setSelectedDbClub] = useState<Club | null>(null);
  const [muted, setMuted] = useState(() => sounds.isMuted());
  const [importError, setImportError] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState<string | null>(null);
  const [pendingImportJson, setPendingImportJson] = useState<string | null>(null);

  useEffect(() => {
    return sounds.subscribe(setMuted);
  }, []);

  const toggleSound = () => {
    const next = sounds.toggleMute();
    setMuted(next);
  };

  const filteredDbClubs = useMemo(() => {
    const search = dbSearch.toLowerCase();
    return allClubs
      .filter(c => c.tier === selectedDbTier)
      .filter(c => c.name.toLowerCase().includes(search) || c.stadium.toLowerCase().includes(search));
  }, [allClubs, selectedDbTier, dbSearch]);

  const ownersById = useMemo(() => new Map(allOwners.map(o => [o.id, o])), [allOwners]);
  const managersById = useMemo(() => new Map(allManagers.map(m => [m.id, m])), [allManagers]);

  const handleFileImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    setImportError(null);
    setImportSuccess(null);
    setPendingImportJson(null);
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = typeof event.target?.result === 'string' ? event.target.result : '';
      const validation = validateSaveJson(text);
      if (!validation.ok) {
        setImportError(validation.error || 'Invalid save file format. Please verify the JSON file.');
        sounds.playCrisis();
        return;
      }
      setPendingImportJson(text);
    };
    reader.onerror = () => {
      setImportError('Failed to read the selected save file.');
      sounds.playCrisis();
    };
    reader.readAsText(file);
  };

  const confirmFileImport = () => {
    if (!pendingImportJson) return;
    const result = onImportSave(pendingImportJson);
    setPendingImportJson(null);
    if (result.ok) {
      sounds.playFanfare();
      setImportSuccess('Save file imported successfully! Career loaded.');
      setTimeout(() => {
        setActiveModal('none');
        setImportSuccess(null);
      }, 1200);
    } else {
      setImportError(result.error || 'Invalid save file format. Please verify the JSON file.');
      sounds.playCrisis();
    }
  };

  return (
    <div className="min-h-dvh bg-[#080c14] text-slate-100 flex flex-col justify-between relative overflow-x-hidden font-sans selection:bg-amber-500/20 selection:text-amber-200">
      
      {/* Background Ambience: Lightweight gradient on mobile, floodlight blurs on md+ */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div
          className="md:hidden absolute inset-0"
          style={{
            background: 'radial-gradient(circle at 15% 10%, rgba(245, 158, 11, 0.10), transparent 50%), radial-gradient(circle at 85% 45%, rgba(16, 185, 129, 0.06), transparent 50%)',
          }}
        />
        <div className="hidden md:block absolute -top-40 -left-40 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl" />
        <div className="hidden md:block absolute top-1/3 -right-40 w-[30rem] h-[30rem] bg-emerald-500/5 rounded-full blur-3xl" />
        <div className="hidden md:block absolute -bottom-40 left-1/3 w-96 h-96 bg-blue-500/5 rounded-full blur-3xl" />
        
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
      <header className="relative z-10 max-w-7xl 2xl:max-w-[1600px] w-full mx-auto safe-area-header pb-3 sm:py-6 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center font-black text-slate-950 text-base shadow-lg shadow-amber-500/20 border border-amber-300/40 shrink-0">
            TB
          </div>
          <div className="min-w-0">
            <span className="text-xs font-mono font-bold tracking-widest text-amber-400 uppercase block truncate">
              Director of Football
            </span>
            <span className="text-sm font-extrabold tracking-tight text-white block truncate">
              THE BOARDROOM SIMULATOR
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={toggleSound}
            title={muted ? 'Unmute Sound FX' : 'Mute Sound FX'}
            aria-label={muted ? 'Unmute Sound FX' : 'Mute Sound FX'}
            className="min-h-11 min-w-11 lg:min-h-0 lg:min-w-0 p-2.5 rounded-xl bg-white/5 hover:bg-white/10 active:scale-95 border border-white/10 text-slate-300 hover:text-white transition-all cursor-pointer flex items-center justify-center gap-2 text-xs font-semibold"
          >
            {muted ? <VolumeX className="w-4 h-4 text-rose-400" /> : <Volume2 className="w-4 h-4 text-emerald-400" />}
            <span className="hidden sm:inline">{muted ? 'Audio Muted' : 'Sound FX On'}</span>
          </button>
        </div>
      </header>

      {/* Main Center Content */}
      <main className="relative z-10 max-w-7xl 2xl:max-w-[1600px] w-full mx-auto safe-area-x py-4 sm:py-8 flex flex-col lg:flex-row items-center justify-between gap-8 lg:gap-12">
        
        {/* Left Column: Title Branding & Atmosphere */}
        <div className="w-full lg:w-1/2 space-y-5 sm:space-y-6 text-center lg:text-left">
          
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-amber-400/10 border border-amber-400/25 text-amber-300 text-xs font-bold uppercase tracking-wider max-w-full">
            <Sparkles className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">2026/27 Edition • 68 Real English Clubs</span>
          </div>

          <div className="space-y-2">
            <h1 className="text-3xl sm:text-5xl lg:text-6xl font-black text-white tracking-tight leading-none uppercase">
              The <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-300 via-amber-400 to-amber-500">Boardroom</span>
            </h1>
            <p className="text-base sm:text-xl font-light text-slate-300 tracking-wide font-sans">
              Sporting Director & Executive Simulation
            </p>
          </div>

          <p className="text-sm text-slate-400 leading-relaxed max-w-[65ch] mx-auto lg:mx-0 font-normal">
            Every Saturday is won in the boardroom. Shape recruitment philosophy, balance billionaire owner egos, delegate managerial responsibilities, navigate transfer windows, and build a multi-generational football empire across the Premier League, Championship, and League One.
          </p>

          {/* Quick Badges */}
          <div className="pt-1 flex flex-wrap items-center justify-center lg:justify-start gap-2 sm:gap-3 text-xs font-mono text-slate-400">
            <div className="flex items-center gap-1.5 bg-white/5 border border-white/10 px-3 py-1.5 rounded-lg">
              <Shield className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span>Full 46-Week Seasons</span>
            </div>
            <div className="flex items-center gap-1.5 bg-white/5 border border-white/10 px-3 py-1.5 rounded-lg">
              <TrendingUp className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span>Promotion & Relegation</span>
            </div>
            <div className="flex items-center gap-1.5 bg-white/5 border border-white/10 px-3 py-1.5 rounded-lg">
              <Users className="w-3.5 h-3.5 text-blue-400 shrink-0" />
              <span>Autonomous AI Transfers</span>
            </div>
          </div>
        </div>

        {/* Right Column: Menu Options & Active Career Card */}
        <div className="w-full lg:w-5/12 sm:max-w-md space-y-4">
          
          {/* Active Career Snapshot Card (if save exists in Director or Manager Mode) */}
          {gameMode === 'manager' && managerCareer ? (
            <div className="bg-gradient-to-b from-[#141d2e] to-[#0d1422] border-2 border-emerald-400/40 rounded-2xl p-4 sm:p-6 shadow-2xl shadow-emerald-500/10 relative overflow-hidden group">
              <div className="flex flex-wrap items-start justify-between gap-3 mb-4 relative z-10">
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className="w-11 h-11 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center font-bold text-white shadow-inner text-base border border-white/20 shrink-0"
                    style={{ backgroundColor: club?.primaryColor || '#1e293b' }}
                  >
                    {club?.shortName || 'MGR'}
                  </div>
                  <div className="min-w-0">
                    <span className="text-xs sm:text-[10px] font-bold font-mono tracking-wider uppercase text-emerald-400 block">
                      {managerCareer.isRetired
                        ? 'Retired Manager Career'
                        : club
                          ? 'Active Manager Mode'
                          : 'Unemployed Manager'}
                    </span>
                    <h3 className="text-lg sm:text-xl font-black text-white leading-tight truncate">
                      {club ? club.name : 'Free Agent Manager'}
                    </h3>
                    <div className="text-xs text-slate-300">
                      {managerCareer.profile.name} · Age {managerCareer.profile.age} · {managerCareer.profile.tacticalStyle}
                    </div>
                  </div>
                </div>

                <div className="text-left sm:text-right font-mono shrink-0">
                  <span className="text-xs text-slate-400 block">Campaign</span>
                  <span className="text-sm font-bold text-white">Wk {displayWeek} / 46</span>
                  <span className="text-xs sm:text-[10px] text-amber-400 block">{seasonYear}/{seasonYear + 1}</span>
                </div>
              </div>

              <div className="bg-black/40 border border-white/5 rounded-xl p-3 mb-5 space-y-2 text-xs font-mono relative z-10">
                <div className="flex justify-between items-center text-slate-300">
                  <span className="text-slate-400">Reputation:</span>
                  <span className="font-bold text-amber-400">{managerCareer.profile.reputation} / 100</span>
                </div>
                <div className="flex justify-between items-center text-slate-300">
                  <span className="text-slate-400">Seasons Managed:</span>
                  <span className="font-bold text-white">{managerCareer.seasonHistory.length}</span>
                </div>
                {club && (
                  <div className="flex justify-between items-center pt-1 border-t border-white/5">
                    <span className="text-slate-400">Board Trust:</span>
                    <span className="font-bold text-emerald-400">{managerCareer.boardTrust}%</span>
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={() => {
                  sounds.playWhistle();
                  onContinueCareer();
                }}
                className="w-full min-h-11 py-3.5 bg-gradient-to-r from-emerald-400 to-emerald-500 hover:from-emerald-300 hover:to-emerald-400 text-slate-950 font-black text-sm rounded-xl shadow-xl shadow-emerald-500/20 flex items-center justify-center gap-2.5 transition-all cursor-pointer active:scale-95"
              >
                <Play className="w-4 h-4 fill-current" />
                <span>{managerCareer.isRetired ? 'VIEW RETIREMENT ARCHIVE' : 'CONTINUE MANAGER CAREER'}</span>
              </button>
            </div>
          ) : director ? (
            <div className="bg-gradient-to-b from-[#141d2e] to-[#0d1422] border-2 border-amber-400/40 rounded-2xl p-4 sm:p-6 shadow-2xl shadow-amber-500/10 relative overflow-hidden group">
              <div 
                className="hidden md:block absolute top-0 right-0 w-32 h-32 rounded-full blur-2xl opacity-20 pointer-events-none"
                style={{ backgroundColor: club?.primaryColor || '#f59e0b' }}
              />

              <div className="flex flex-wrap items-start justify-between gap-3 mb-4 relative z-10">
                <div className="flex items-center gap-3 min-w-0">
                  <div 
                    className="w-11 h-11 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center font-bold text-white shadow-inner text-base border border-white/20 shrink-0"
                    style={{ backgroundColor: club?.primaryColor || '#1e293b' }}
                  >
                    {club?.shortName || 'FA'}
                  </div>
                  <div className="min-w-0">
                    <span className="text-xs sm:text-[10px] font-bold font-mono tracking-wider uppercase text-amber-400 block">
                      {club ? 'Active Directorship' : 'Unattached Free Agent'}
                    </span>
                    <h3 className="text-lg sm:text-xl font-black text-white leading-tight truncate">
                      {club ? club.name : 'Between Appointments'}
                    </h3>
                    <div className="text-xs text-slate-300">
                      {club
                        ? club.tier === 1 ? 'Premier League' : club.tier === 2 ? 'Championship' : 'League One'
                        : 'Seeking Sporting Director Post'}
                    </div>
                  </div>
                </div>

                <div className="text-left sm:text-right font-mono shrink-0">
                  <span className="text-xs text-slate-400 block">Campaign</span>
                  <span className="text-sm font-bold text-white">Wk {displayWeek} / 46</span>
                  <span className="text-xs sm:text-[10px] text-amber-400 block">{seasonYear}/{seasonYear + 1}</span>
                </div>
              </div>

              {/* Director Details */}
              <div className="bg-black/40 border border-white/5 rounded-xl p-3 mb-5 space-y-2 text-xs font-mono relative z-10">
                <div className="flex flex-wrap justify-between items-center gap-1 text-slate-300">
                  <span className="text-slate-400">Sporting Director:</span>
                  <span className="font-bold text-white text-right">{director.name} ({director.age}y, {director.nationality})</span>
                </div>
                <div className="flex flex-wrap justify-between items-center gap-1 text-slate-300">
                  <span className="text-slate-400">Philosophy:</span>
                  <span className="text-amber-300">{director.philosophy}</span>
                </div>
                {club ? (
                  <>
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
                  </>
                ) : (
                  <>
                    <div className="flex justify-between items-center pt-1 border-t border-white/5">
                      <span className="text-slate-400">Reputation:</span>
                      <span className="font-bold text-amber-400">{director.reputation} / 100</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-400">Silverware Won:</span>
                      <span className="text-emerald-400 font-bold">{director.trophiesWon.length} Honours</span>
                    </div>
                  </>
                )}
              </div>

              {/* Continue Button */}
              <button
                type="button"
                onClick={() => {
                  sounds.playWhistle();
                  onContinueCareer();
                }}
                className="w-full min-h-11 py-3.5 bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-slate-950 font-black text-sm rounded-xl shadow-xl shadow-amber-500/20 flex items-center justify-center gap-2.5 transition-all cursor-pointer active:scale-95 group-hover:shadow-amber-400/30"
              >
                <Play className="w-4 h-4 fill-current" />
                <span>CONTINUE CAREER</span>
              </button>
            </div>
          ) : null}

          {/* Mode Selection: Director Mode & Manager Mode */}
          <div className="space-y-2.5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => {
                  if (hasActiveCareer) {
                    sounds.playClick();
                    setPendingModeChoice('director');
                    setActiveModal('confirm_new');
                  } else {
                    sounds.playGavel();
                    onStartNewCareer();
                  }
                }}
                className={`min-h-11 p-3.5 rounded-xl border text-left transition-all cursor-pointer active:scale-[0.98] ${
                  !hasActiveCareer
                    ? 'bg-gradient-to-br from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 border-amber-300 text-slate-950 shadow-lg shadow-amber-500/20'
                    : 'bg-white/5 hover:bg-white/10 border-white/10 hover:border-amber-400/40 text-white'
                }`}
              >
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="text-xs font-black uppercase tracking-wider">Director Mode</span>
                  <Briefcase className={`w-4 h-4 ${!hasActiveCareer ? 'text-slate-950' : 'text-amber-400'}`} />
                </div>
                <p className={`text-[11px] leading-snug ${!hasActiveCareer ? 'text-slate-900 font-medium' : 'text-slate-400'}`}>
                  Run the boardroom, hire coaches, and lead transfers.
                </p>
              </button>

              {onStartNewManagerCareer && (
                <button
                  type="button"
                  onClick={() => {
                    if (hasActiveCareer) {
                      sounds.playClick();
                      setPendingModeChoice('manager');
                      setActiveModal('confirm_new');
                    } else {
                      sounds.playGavel();
                      onStartNewManagerCareer();
                    }
                  }}
                  className={`min-h-11 p-3.5 rounded-xl border text-left transition-all cursor-pointer active:scale-[0.98] ${
                    !hasActiveCareer
                      ? 'bg-emerald-500/15 hover:bg-emerald-500/25 border-emerald-400/45 text-white shadow-lg shadow-emerald-500/10'
                      : 'bg-white/5 hover:bg-white/10 border-white/10 hover:border-emerald-400/40 text-white'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="text-xs font-black uppercase tracking-wider">Manager Mode</span>
                    <Award className="w-4 h-4 text-emerald-400" />
                  </div>
                  <p className="text-[11px] leading-snug text-slate-300">
                    Set tactics & XI, request signings from an AI Director.
                  </p>
                </button>
              )}
            </div>

            {/* Club Pyramid Explorer */}
            <button
              type="button"
              onClick={() => {
                sounds.playClick();
                setActiveModal('database');
              }}
              className="w-full min-h-11 py-3 bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 text-slate-200 hover:text-white font-bold text-xs rounded-xl transition-all cursor-pointer flex items-center justify-between px-4"
            >
              <div className="flex items-center gap-3">
                <Database className="w-4 h-4 text-blue-400" />
                <span>Club Database & Pyramid Explorer</span>
              </div>
              <span className="text-xs sm:text-[10px] font-mono text-slate-400">68 Clubs</span>
            </button>

            {/* Director's Handbook / How to Play */}
            <button
              type="button"
              onClick={() => {
                sounds.playClick();
                setActiveModal('handbook');
              }}
              className="w-full min-h-11 py-3 bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 text-slate-200 hover:text-white font-bold text-xs rounded-xl transition-all cursor-pointer flex items-center justify-between px-4"
            >
              <div className="flex items-center gap-3">
                <BookOpen className="w-4 h-4 text-emerald-400" />
                <span>Director's Handbook & Game Guide</span>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-500" />
            </button>

            {/* Career Data & Settings */}
            <button
              type="button"
              onClick={() => {
                sounds.playClick();
                setActiveModal('settings');
              }}
              className="w-full min-h-11 py-3 bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 text-slate-200 hover:text-white font-bold text-xs rounded-xl transition-all cursor-pointer flex items-center justify-between px-4"
            >
              <div className="flex items-center gap-3">
                <Settings className="w-4 h-4 text-slate-400" />
                <span>Save Manager & Audio Settings</span>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-500" />
            </button>

            <PWAInstallButton variant="menu" />
          </div>

        </div>

      </main>

      {/* Footer & Atmospheric Quote */}
      <footer className="relative z-10 border-t border-white/5 bg-[#05080e]/80 max-md:backdrop-blur-none md:backdrop-blur-sm safe-area-x pt-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div className="max-w-7xl 2xl:max-w-[1600px] mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500 font-mono">
          <div className="italic text-center sm:text-left max-w-[75ch]">
            "A manager looks after Saturday. The sporting director builds the next decade."
          </div>
          <div className="flex items-center gap-4 text-xs sm:text-[11px]">
            <span>Version 2.0 Official</span>
            <span aria-hidden="true">·</span>
            <span className="text-emerald-400">Autosave Enabled</span>
          </div>
        </div>
      </footer>

      {/* MODAL 1: Confirm New Career Warning */}
      <Modal
        isOpen={activeModal === 'confirm_new'}
        onClose={() => setActiveModal('none')}
        maxWidthClass="max-w-md"
        borderClass="border-amber-400/30"
        backdropClass="bg-[#070a0f]/90"
        ariaLabel="Start New Career confirmation"
        footer={
          <div className="flex flex-wrap items-center justify-end gap-3">
            <button
              type="button"
              onClick={() => setActiveModal('none')}
              className="min-h-11 lg:min-h-0 px-4 py-2 bg-white/5 hover:bg-white/10 text-xs font-semibold text-slate-300 rounded-lg cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                sounds.playGavel();
                setActiveModal('none');
                if (pendingModeChoice === 'manager' && onStartNewManagerCareer) {
                  onStartNewManagerCareer();
                } else {
                  onStartNewCareer();
                }
              }}
              className="min-h-11 lg:min-h-0 px-4 py-2 bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-slate-950 font-bold text-xs rounded-lg shadow-md cursor-pointer"
            >
              Start {pendingModeChoice === 'manager' ? 'Manager Mode' : 'Director Mode'}
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="w-12 h-12 bg-amber-500/10 border border-amber-500/30 rounded-xl flex items-center justify-center mx-auto text-amber-400">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <div className="text-center">
            <h3 className="text-xl font-bold text-white">Start New Career?</h3>
            <p className="text-xs text-slate-300 mt-2 leading-relaxed">
              You have an ongoing {gameMode === 'manager' ? 'Manager Mode' : 'Director Mode'} save{' '}
              {club ? (
                <>
                  at <strong className="text-white">{club.name}</strong>
                </>
              ) : (
                <>
                  as a <strong className="text-white">free agent</strong>
                </>
              )}{' '}
              (Week {displayWeek}).
              Starting a new career will replace your current save.
            </p>
          </div>
        </div>
      </Modal>

      {/* MODAL 2: Club Database & Pyramid Explorer */}
      <Modal
        isOpen={activeModal === 'database'}
        onClose={() => setActiveModal('none')}
        maxWidthClass="max-w-5xl"
        borderClass="border-white/15"
        backdropClass="bg-[#070a0f]/90"
        ariaLabel="English Pyramid Club Database"
        header={
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-500/10 border border-blue-500/30 rounded-xl text-blue-400 shrink-0">
              <Database className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 className="text-lg sm:text-xl font-black text-white">English Pyramid Club Database</h3>
              <p className="text-xs text-slate-400">Browse all 68 clubs across 3 professional divisions with owners, budgets, and stadiums.</p>
            </div>
          </div>
        }
      >
        <div className="space-y-4">
          {/* Filter Controls */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div className="flex flex-wrap sm:flex-nowrap items-center gap-1 bg-slate-900 p-1 rounded-xl border border-white/10 w-full sm:w-auto">
              <button
                type="button"
                onClick={() => setSelectedDbTier(1)}
                className={`min-h-11 lg:min-h-0 px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                  selectedDbTier === 1 ? 'bg-amber-400 text-slate-950 shadow-sm' : 'text-slate-400 hover:text-white'
                }`}
              >
                Premier League (20)
              </button>
              <button
                type="button"
                onClick={() => setSelectedDbTier(2)}
                className={`min-h-11 lg:min-h-0 px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                  selectedDbTier === 2 ? 'bg-amber-400 text-slate-950 shadow-sm' : 'text-slate-400 hover:text-white'
                }`}
              >
                Championship (24)
              </button>
              <button
                type="button"
                onClick={() => setSelectedDbTier(3)}
                className={`min-h-11 lg:min-h-0 px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                  selectedDbTier === 3 ? 'bg-amber-400 text-slate-950 shadow-sm' : 'text-slate-400 hover:text-white'
                }`}
              >
                League One (24)
              </button>
            </div>

            <input
              type="search"
              inputMode="search"
              placeholder="Search club or stadium..."
              value={dbSearch}
              onChange={e => setDbSearch(e.target.value)}
              className="w-full sm:w-64 min-h-11 lg:min-h-0 px-3.5 py-2 bg-slate-900 border border-white/10 rounded-xl text-base md:text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-400"
            />
          </div>

          {/* Club Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-3">
            {filteredDbClubs.map(c => {
              const clubOwner = ownersById.get(c.ownerId);
              const clubManager = c.managerId ? managersById.get(c.managerId) : undefined;
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
                      <span className="text-xs sm:text-[10px] text-slate-400 block truncate">{c.stadium} ({c.capacity.toLocaleString()})</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs sm:text-[11px] font-mono border-t border-white/5 pt-2 text-slate-300">
                    <div>
                      <span className="text-xs sm:text-[9px] text-slate-400 block uppercase">War Chest</span>
                      <span className="font-bold text-amber-400">£{(c.transferBudget / 1000000).toFixed(1)}m</span>
                    </div>
                    <div>
                      <span className="text-xs sm:text-[9px] text-slate-400 block uppercase">Wage Budget</span>
                      <span className="font-bold text-emerald-400">£{(c.wageBudget / 1000).toFixed(0)}k/wk</span>
                    </div>
                    <div>
                      <span className="text-xs sm:text-[9px] text-slate-400 block uppercase">Owner</span>
                      <span className="text-white truncate block">{clubOwner?.name || 'Consortium'}</span>
                    </div>
                    <div>
                      <span className="text-xs sm:text-[9px] text-slate-400 block uppercase">Head Coach</span>
                      <span className="text-white truncate block">{clubManager?.name || 'Vacant'}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </Modal>

      {/* MODAL 3: Director's Handbook / How to Play */}
      <Modal
        isOpen={activeModal === 'handbook'}
        onClose={() => setActiveModal('none')}
        maxWidthClass="max-w-4xl"
        borderClass="border-white/15"
        backdropClass="bg-[#070a0f]/90"
        ariaLabel="The Sporting Director's Handbook"
        header={
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-400 shrink-0">
              <BookOpen className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 className="text-lg sm:text-xl font-black text-white">The Sporting Director's Handbook</h3>
              <p className="text-xs text-slate-400">Essential executive rules and gameplay mechanics for your career.</p>
            </div>
          </div>
        }
      >
        <div className="space-y-4 text-xs text-slate-300 leading-relaxed max-w-[75ch]">
          <div className="bg-slate-900/80 border border-white/10 rounded-xl p-4">
            <h4 className="text-sm font-bold text-amber-400 mb-1 flex items-center gap-2">
              <Briefcase className="w-4 h-4 shrink-0" />
              <span>1. The Role of the Sporting Director</span>
            </h4>
            <p>
              Unlike traditional manager games where you set match tactics and substitutions, in <strong className="text-white">The Boardroom</strong> you operate above the dugout. You manage long-term squad architecture, hire and fire head coaches, negotiate player contracts, handle boardroom budgets, and satisfy owner demands.
            </p>
          </div>

          <div className="bg-slate-900/80 border border-white/10 rounded-xl p-4">
            <h4 className="text-sm font-bold text-emerald-400 mb-1 flex items-center gap-2">
              <Building className="w-4 h-4 shrink-0" />
              <span>2. Board Trust & Sacking Criteria</span>
            </h4>
            <p>
              Your tenure is safeguarded by <strong className="text-white">Board Trust (0 - 100%)</strong>. Delivering on preseason targets, balancing wage budgets, and appointing a winning manager keeps trust high. If Board Trust drops to 0%, the owner will issue an extraordinary dismissal. You will be sacked with severance and enter the Job Market.
            </p>
          </div>

          <div className="bg-slate-900/80 border border-white/10 rounded-xl p-4">
            <h4 className="text-sm font-bold text-blue-400 mb-1 flex items-center gap-2">
              <Users className="w-4 h-4 shrink-0" />
              <span>3. Delegation Matrix & Managerial Tension</span>
            </h4>
            <p>
              Through <strong className="text-white">Delegation & Staff</strong>, assign incoming transfers and sales to <strong className="text-white">Director Exclusive</strong>, <strong className="text-white">Shared Consensus</strong>, or <strong className="text-white">Manager Control</strong>. In Shared mode during open windows (Weeks 1–6 & 20–24), your Head Coach submits Transfer Proposals (3-week expiry) to <strong className="text-white">Transfers &gt; Proposals</strong> (<span className="text-emerald-300">+2 Trust</span> on approval, <span className="text-rose-300">-3</span> on rejection), and forcing direct deals past his objections costs <span className="text-rose-300">-10 Trust</span>. In Manager Control, he executes up to 5 window signings and 5 surplus sales per season within budget and board vetoes—all logged in <strong className="text-white">Transfer History</strong>—while overriding him costs <span className="text-rose-300">-20 Trust</span> (signings) or <span className="text-rose-300">-15 Trust</span> (sales).
            </p>
          </div>

          <div className="bg-slate-900/80 border border-white/10 rounded-xl p-4">
            <h4 className="text-sm font-bold text-purple-400 mb-1 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 shrink-0" />
              <span>4. 46-Week Seasons & The Full Pyramid</span>
            </h4>
            <p>
              A full season consists of 46 matchdays where all clubs play each other twice. At Week 20, the January Transfer Window opens. At Week 46, the official Season Finale triggers with silverware, merit prize money, broadcasting TV rights, youth graduations, and automatic promotion/relegation between Premier League, Championship, and League One!
            </p>
          </div>
        </div>
      </Modal>

      {/* MODAL 4: Save Manager & Audio Settings */}
      <Modal
        isOpen={activeModal === 'settings'}
        onClose={() => {
          setActiveModal('none');
          setPendingImportJson(null);
          setImportError(null);
          setImportSuccess(null);
        }}
        maxWidthClass="max-w-lg"
        borderClass="border-white/15"
        backdropClass="bg-[#070a0f]/90"
        ariaLabel="Save Manager & Audio"
        header={
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-slate-800 border border-white/10 rounded-xl text-slate-300 shrink-0">
              <Settings className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 className="text-lg sm:text-xl font-black text-white">Save Manager & Audio</h3>
              <p className="text-xs text-slate-400">Export, import, or manage your career save data.</p>
            </div>
          </div>
        }
      >
        <div className="space-y-5">
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
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-slate-300">Sound Effects:</span>
              <button
                type="button"
                onClick={toggleSound}
                className={`min-h-11 lg:min-h-0 px-3 py-1.5 text-xs font-bold rounded-lg border flex items-center gap-1.5 cursor-pointer transition-all ${
                  !muted ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' : 'bg-white/5 border-white/10 text-slate-400'
                }`}
              >
                {!muted ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
                <span>{!muted ? 'Enabled' : 'Muted'}</span>
              </button>
            </div>

            {/* Sound Test Buttons */}
            <div className="pt-2 border-t border-white/5 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => sounds.playWhistle()}
                className="min-h-11 lg:min-h-0 px-3 py-1.5 bg-white/5 hover:bg-white/10 text-xs sm:text-[11px] text-slate-300 rounded border border-white/5 cursor-pointer"
              >
                Test Whistle
              </button>
              <button
                type="button"
                onClick={() => sounds.playGavel()}
                className="min-h-11 lg:min-h-0 px-3 py-1.5 bg-white/5 hover:bg-white/10 text-xs sm:text-[11px] text-slate-300 rounded border border-white/5 cursor-pointer"
              >
                Test Gavel
              </button>
              <button
                type="button"
                onClick={() => sounds.playFanfare()}
                className="min-h-11 lg:min-h-0 px-3 py-1.5 bg-white/5 hover:bg-white/10 text-xs sm:text-[11px] text-slate-300 rounded border border-white/5 cursor-pointer"
              >
                Test Fanfare
              </button>
            </div>
          </div>

          {/* Save File Export & Import */}
          <div className="bg-slate-900 border border-white/10 rounded-xl p-4 space-y-3">
            <span className="text-xs font-bold text-white uppercase tracking-wider block">Backup & Cloud Portability</span>
            <p className="text-xs sm:text-[11px] text-slate-400 leading-relaxed">
              Save files are automatically preserved in your browser's local storage. You can also export your save as a JSON file to transfer between devices.
            </p>

            {pendingImportJson && (
              <div className="p-3 bg-amber-500/10 border border-amber-400/35 rounded-xl space-y-2.5">
                <p className="text-xs font-semibold text-amber-200">
                  This replaces your current save. Continue?
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={confirmFileImport}
                    className="flex-1 min-h-11 lg:min-h-0 px-3 py-2 rounded-lg bg-amber-400 hover:bg-amber-300 text-slate-950 text-xs font-bold cursor-pointer"
                  >
                    Replace Save
                  </button>
                  <button
                    type="button"
                    onClick={() => setPendingImportJson(null)}
                    className="min-h-11 lg:min-h-0 px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 text-xs font-semibold cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 pt-1">
              <button
                type="button"
                onClick={() => {
                  sounds.playClick();
                  onExportSave();
                }}
                disabled={!hasActiveCareer}
                className="flex-1 min-h-11 lg:min-h-0 py-2 px-3 bg-white/5 hover:bg-white/10 disabled:opacity-40 border border-white/10 rounded-lg text-xs font-bold text-white flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5 text-amber-400" />
                <span>Export Save</span>
              </button>

              <label className="flex-1 min-h-11 lg:min-h-0 py-2 px-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-xs font-bold text-white flex items-center justify-center gap-1.5 cursor-pointer">
                <Upload className="w-3.5 h-3.5 text-emerald-400" />
                <span>Import Save</span>
                <input
                  type="file"
                  accept=".json,application/json"
                  onChange={handleFileImport}
                  className="hidden"
                />
              </label>
            </div>
          </div>

          {/* Reset Factory Database */}
          <div className="bg-rose-950/20 border border-rose-500/20 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <span className="text-xs font-bold text-rose-300 block">Reset Database</span>
              <span className="text-xs sm:text-[10px] text-slate-400">Clear all local saves and restore factory clubs</span>
            </div>
            <button
              type="button"
              onClick={() => {
                sounds.playClick();
                setActiveModal('confirm_reset');
              }}
              className="min-h-11 lg:min-h-0 px-3 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-300 text-xs font-bold rounded-lg cursor-pointer flex items-center justify-center gap-1 shrink-0"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset</span>
            </button>
          </div>
        </div>
      </Modal>

      {/* MODAL 5: Confirm Database Reset */}
      <Modal
        isOpen={activeModal === 'confirm_reset'}
        onClose={() => setActiveModal('settings')}
        maxWidthClass="max-w-md"
        borderClass="border-rose-500/30"
        backdropClass="bg-[#070a0f]/90"
        ariaLabel="Reset Factory Database confirmation"
        footer={
          <div className="flex flex-wrap items-center justify-end gap-3">
            <button
              type="button"
              onClick={() => {
                sounds.playClick();
                setActiveModal('settings');
              }}
              className="min-h-11 lg:min-h-0 px-4 py-2 bg-white/5 hover:bg-white/10 text-xs font-semibold text-slate-300 rounded-lg cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                sounds.playCrisis();
                onResetDatabase();
                setActiveModal('none');
              }}
              className="min-h-11 lg:min-h-0 px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs rounded-lg shadow-md cursor-pointer flex items-center gap-1.5"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset Database</span>
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="w-12 h-12 bg-rose-500/10 border border-rose-500/30 rounded-xl flex items-center justify-center mx-auto text-rose-400">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <div className="text-center">
            <h3 className="text-xl font-bold text-white">Reset Factory Database?</h3>
            <p className="text-xs text-slate-300 mt-2 leading-relaxed">
              This will permanently erase your local career save and restore all 68 English pyramid clubs, squads, and managers to their starting state.
            </p>
          </div>
        </div>
      </Modal>

    </div>
  );
};
