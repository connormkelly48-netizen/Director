/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import {
  Volume2,
  VolumeX,
  FastForward,
  Play,
  Award,
  ChevronDown,
  ChevronUp,
  Home,
  LayoutDashboard,
  Building2,
  Sliders,
  UserCheck,
  Users,
  GraduationCap,
  ArrowLeftRight,
  Briefcase,
  MoreHorizontal,
  Download,
  Upload,
  WifiOff,
} from 'lucide-react';
import { Club, Director } from '../types/game';
import { sounds } from '../services/soundEffects';
import { Modal } from './ui/Modal';
import { useOnlineStatus } from '../utils/pwa';
import { validateSaveJson } from '../utils/saveValidation';
import { PWAInstallButton } from './PWAInstallButton';

interface HeaderProps {
  currentTab: string;
  setCurrentTab: (tab: string) => void;
  currentWeek: number;
  seasonYear: number;
  club: Club | undefined;
  director: Director;
  pendingProposalsCount?: number;
  onAdvanceWeek: () => void;
  onFastForwardJan: () => void;
  onFastForwardSummer: () => void;
  onBackToMainMenu: () => void;
  onExportSave: () => void;
  onImportSave: (saveJson: string) => { ok: boolean; error?: string };
  isSimulating: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  currentTab,
  setCurrentTab,
  currentWeek,
  seasonYear,
  club,
  director,
  pendingProposalsCount = 0,
  onAdvanceWeek,
  onFastForwardJan,
  onFastForwardSummer,
  onBackToMainMenu,
  onExportSave,
  onImportSave,
  isSimulating,
}) => {
  const [muted, setMuted] = useState(() => sounds.isMuted());
  const [showSimMenu, setShowSimMenu] = useState(false);
  const [showMobileStats, setShowMobileStats] = useState(false);
  const [showMoreSheet, setShowMoreSheet] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState<string | null>(null);
  const [pendingImportJson, setPendingImportJson] = useState<string | null>(null);
  const isOnline = useOnlineStatus();

  useEffect(() => {
    return sounds.subscribe(setMuted);
  }, []);

  const toggleSound = () => {
    const next = sounds.toggleMute();
    setMuted(next);
  };

  const closeMoreSheet = () => {
    setShowMoreSheet(false);
    setPendingImportJson(null);
    setImportError(null);
    setImportSuccess(null);
  };

  const handleMobileFileImport = (e: React.ChangeEvent<HTMLInputElement>) => {
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
        setImportError(validation.error || 'Invalid save file.');
        sounds.playCrisis();
        return;
      }
      setPendingImportJson(text);
    };
    reader.onerror = () => {
      setImportError('Failed to read the selected file.');
      sounds.playCrisis();
    };
    reader.readAsText(file);
  };

  const confirmMobileImport = () => {
    if (!pendingImportJson) return;
    const result = onImportSave(pendingImportJson);
    setPendingImportJson(null);
    if (result.ok) {
      sounds.playFanfare();
      setImportSuccess('Save imported successfully.');
      setTimeout(() => closeMoreSheet(), 900);
    } else {
      setImportError(result.error || 'Invalid save file.');
      sounds.playCrisis();
    }
  };

  const navItems = [
    { id: 'dashboard', label: 'Executive Suite', shortLabel: 'Home', icon: LayoutDashboard },
    { id: 'boardroom', label: 'The Boardroom', shortLabel: 'Board', icon: Building2 },
    { id: 'responsibilities', label: 'Delegation & Staff', shortLabel: 'Staff', icon: Sliders },
    { id: 'manager', label: 'Head Coach', shortLabel: 'Coach', icon: UserCheck },
    { id: 'squad', label: 'First Team', shortLabel: 'Squad', icon: Users },
    { id: 'academy', label: 'Youth Academy', shortLabel: 'Academy', icon: GraduationCap },
    { id: 'transfers', label: 'Transfers', shortLabel: 'Transfers', icon: ArrowLeftRight },
    { id: 'jobs', label: 'Job Market', shortLabel: 'Jobs', icon: Briefcase },
  ];

  const primaryMobileTabIds = ['dashboard', 'squad', 'transfers', 'boardroom'];
  const primaryMobileTabs = primaryMobileTabIds
    .map(id => navItems.find(item => item.id === id))
    .filter((item): item is (typeof navItems)[number] => Boolean(item));
  const secondaryMobileTabs = navItems.filter(item => !primaryMobileTabIds.includes(item.id));
  const isSecondaryTabActive = secondaryMobileTabs.some(item => item.id === currentTab);

  const currentWages = club ? club.squad.reduce((acc, p) => acc + p.wage, 0) : 0;
  const balanceLabel = club ? `£${(club.balance / 1000000).toFixed(1)}M` : '£0.0M';
  const isSeasonComplete = currentWeek > 46;
  const displayWeek = Math.min(46, currentWeek);

  return (
    <>
      <header className="sticky top-0 z-40 bg-[#0b0f17] border-b border-slate-800 safe-area-header pb-2.5 lg:pb-3 transition-colors">
        <div className="max-w-7xl 2xl:max-w-[1600px] mx-auto flex items-center justify-between gap-2 sm:gap-4 lg:gap-6">

          {/* Zone 1: Club wordmark & compact status */}
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 flex-1 lg:flex-initial lg:shrink-0">
            <div
              className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg flex items-center justify-center font-bold text-white shadow-inner text-xs sm:text-sm border border-white/15 shrink-0"
              style={{ backgroundColor: club?.primaryColor || '#1e293b' }}
            >
              {club?.shortName || 'SD'}
            </div>
            <div className="leading-tight min-w-0">
              <span className="hidden lg:block text-base font-bold tracking-tight text-white">
                THE BOARDROOM
              </span>
              <span className="lg:hidden text-sm font-bold tracking-tight text-white block truncate">
                {club?.name || 'Unemployed'}
              </span>
              <div className="flex items-center gap-1.5 text-xs text-slate-400 truncate">
                <span className="hidden lg:inline font-medium text-slate-300">{club?.name || 'Unemployed'}</span>
                <span className="hidden lg:inline" aria-hidden="true">·</span>
                <span className="font-mono tabular-nums text-amber-400">Wk {displayWeek}</span>
                <span aria-hidden="true">·</span>
                <span className="font-mono tabular-nums">{seasonYear}/{(seasonYear + 1).toString().slice(-2)}</span>
                {club && (
                  <>
                    <span className="lg:hidden" aria-hidden="true">·</span>
                    <span className="lg:hidden font-mono tabular-nums text-emerald-400 font-semibold">{balanceLabel}</span>
                  </>
                )}
                {!isOnline && (
                  <span
                    role="status"
                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-800 border border-amber-400/35 text-[10px] font-mono font-bold uppercase tracking-wider text-amber-300 shrink-0"
                  >
                    <WifiOff className="w-2.5 h-2.5 shrink-0" />
                    <span>Offline</span>
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Zone 2: Full Desktop Navigation Links (xl+ inline) */}
          <nav className="hidden xl:flex items-center gap-1" aria-label="Main navigation">
            {navItems.map(item => {
              const active = currentTab === item.id;
              const badgeCount = item.id === 'transfers' ? pendingProposalsCount : 0;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    sounds.playClick();
                    setCurrentTab(item.id);
                  }}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all whitespace-nowrap cursor-pointer inline-flex items-center gap-1.5 ${
                    active
                      ? 'bg-white/10 text-white shadow-sm border border-white/10'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
                  }`}
                >
                  <span>{item.label}</span>
                  {badgeCount > 0 && (
                    <span className="px-1.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-400 text-slate-950 leading-none">
                      {badgeCount}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          {/* Zone 3: Primary Actions */}
          <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
            {/* Desktop-only Main Menu, Mute, Jump */}
            <button
              type="button"
              onClick={() => {
                sounds.playClick();
                onBackToMainMenu();
              }}
              title="Save and return to Main Menu"
              className="hidden lg:flex px-3 py-2 rounded-lg text-xs font-bold text-slate-200 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 hover:border-amber-400/40 items-center gap-1.5 transition-all cursor-pointer shadow-sm active:scale-95"
            >
              <Home className="w-3.5 h-3.5 text-amber-400" />
              <span>Main Menu</span>
            </button>

            <button
              type="button"
              onClick={toggleSound}
              title={muted ? 'Unmute Audio' : 'Mute Audio'}
              aria-label={muted ? 'Unmute Audio' : 'Mute Audio'}
              className="hidden lg:flex p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 border border-white/10 transition-colors cursor-pointer"
            >
              {muted ? <VolumeX className="w-4 h-4 text-red-400" /> : <Volume2 className="w-4 h-4 text-emerald-400" />}
            </button>

            {/* Fast-Forward Dropdown (Desktop lg+) */}
            <div className="relative hidden lg:block">
              <button
                type="button"
                onClick={() => setShowSimMenu(!showSimMenu)}
                disabled={isSimulating}
                className="px-2.5 py-2 text-xs font-medium text-slate-300 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg flex items-center gap-1.5 transition-colors disabled:opacity-50 cursor-pointer"
              >
                <FastForward className="w-3.5 h-3.5 text-amber-400" />
                <span>Jump</span>
                <ChevronDown className="w-3 h-3 text-slate-400" />
              </button>

              {showSimMenu && (
                <div
                  className="absolute right-0 mt-2 w-52 bg-[#161f30] border border-white/15 rounded-xl shadow-2xl py-1.5 z-50 animate-in fade-in zoom-in-95 duration-100"
                  onClick={() => setShowSimMenu(false)}
                >
                  <button
                    type="button"
                    disabled={isSimulating || currentWeek >= 20}
                    onClick={() => {
                      sounds.playWhistle();
                      onFastForwardJan();
                    }}
                    className="w-full text-left px-3.5 py-2 text-xs text-slate-200 hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2 cursor-pointer"
                  >
                    <FastForward className="w-3.5 h-3.5 text-amber-400" />
                    <span>Sim to Jan Window (Wk 20)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      sounds.playWhistle();
                      onFastForwardSummer();
                    }}
                    className="w-full text-left px-3.5 py-2 text-xs text-slate-200 hover:bg-white/10 flex items-center gap-2 cursor-pointer"
                  >
                    <Award className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Sim to Season End / Summer</span>
                  </button>
                </div>
              )}
            </div>

            {/* Mobile/Tablet (< lg): Expandable secondary stats & quick controls toggle */}
            <button
              type="button"
              onClick={() => {
                sounds.playClick();
                setShowMobileStats(prev => !prev);
              }}
              aria-expanded={showMobileStats}
              aria-label="Toggle club stats and quick controls"
              className="lg:hidden min-h-11 min-w-11 flex items-center justify-center rounded-lg text-slate-300 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 transition-colors cursor-pointer"
            >
              {showMobileStats ? <ChevronUp className="w-4 h-4 text-amber-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
            </button>

            {/* Primary Action Button: Always reachable on mobile & desktop */}
            <button
              type="button"
              onClick={() => {
                sounds.playWhistle();
                onAdvanceWeek();
              }}
              disabled={isSimulating}
              className={`min-h-11 lg:min-h-0 px-3 sm:px-4 py-2 text-xs font-bold rounded-lg shadow-lg flex items-center gap-1.5 sm:gap-2 transition-all active:scale-95 disabled:opacity-50 cursor-pointer whitespace-nowrap ${
                isSeasonComplete
                  ? 'bg-gradient-to-r from-amber-300 via-amber-400 to-amber-500 text-slate-950 shadow-amber-400/40 ring-2 ring-amber-400'
                  : 'text-slate-950 bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 shadow-amber-500/20'
              }`}
            >
              {isSeasonComplete ? (
                <>
                  <Award className="w-4 h-4 text-slate-950 shrink-0" />
                  <span className="sm:hidden">{isSimulating ? 'Sim...' : 'Review'}</span>
                  <span className="hidden sm:inline">{isSimulating ? 'Tabulating Season...' : 'End of Season Review'}</span>
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5 fill-current shrink-0" />
                  <span className="sm:hidden">{isSimulating ? 'Sim...' : 'Advance'}</span>
                  <span className="hidden sm:inline">{isSimulating ? 'Simulating Matchday...' : 'Advance Week'}</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Full Header Navigation on lg (1024px - 1279px) */}
        <nav className="hidden lg:flex xl:hidden items-center flex-wrap gap-1 mt-2.5 pt-2.5 border-t border-white/10 max-w-7xl 2xl:max-w-[1600px] mx-auto" aria-label="Main navigation">
          {navItems.map(item => {
            const active = currentTab === item.id;
            const badgeCount = item.id === 'transfers' ? pendingProposalsCount : 0;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  sounds.playClick();
                  setCurrentTab(item.id);
                }}
                className={`px-2.5 py-1.5 text-xs font-semibold rounded-md transition-all whitespace-nowrap cursor-pointer inline-flex items-center gap-1.5 ${
                  active
                    ? 'bg-white/10 text-white shadow-sm border border-white/10'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
                }`}
              >
                <span>{item.label}</span>
                {badgeCount > 0 && (
                  <span className="px-1.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-400 text-slate-950 leading-none">
                    {badgeCount}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Collapsible Secondary Stats & Quick Controls on Mobile/Tablet (< lg) */}
        {showMobileStats && (
          <div className="lg:hidden mt-2.5 pt-2.5 border-t border-white/10 max-w-7xl mx-auto space-y-2.5">
            {club && (
              <div className="grid grid-cols-3 gap-2 text-xs font-mono">
                <div className="bg-slate-900/90 border border-white/10 rounded-lg px-2.5 py-1.5">
                  <span className="text-slate-400 block text-xs">War Chest</span>
                  <span className="text-amber-400 font-bold tabular-nums">£{(club.transferBudget / 1000000).toFixed(1)}M</span>
                </div>
                <div className="bg-slate-900/90 border border-white/10 rounded-lg px-2.5 py-1.5">
                  <span className="text-slate-400 block text-xs">Wages</span>
                  <span className="text-emerald-400 font-bold tabular-nums">£{(currentWages / 1000).toFixed(0)}k</span>
                </div>
                <div className="bg-slate-900/90 border border-white/10 rounded-lg px-2.5 py-1.5">
                  <span className="text-slate-400 block text-xs">Board Trust</span>
                  <span className="text-white font-bold tabular-nums">{director.boardTrust}%</span>
                </div>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={toggleSound}
                className="min-h-11 px-3 py-2 rounded-lg text-xs font-semibold text-slate-200 bg-white/5 hover:bg-white/10 border border-white/10 flex items-center gap-1.5 cursor-pointer"
              >
                {muted ? <VolumeX className="w-4 h-4 text-red-400" /> : <Volume2 className="w-4 h-4 text-emerald-400" />}
                <span>{muted ? 'Audio Muted' : 'Audio On'}</span>
              </button>

              <button
                type="button"
                disabled={isSimulating || currentWeek >= 20}
                onClick={() => {
                  sounds.playWhistle();
                  setShowMobileStats(false);
                  onFastForwardJan();
                }}
                className="min-h-11 px-3 py-2 rounded-lg text-xs font-semibold text-slate-200 bg-white/5 hover:bg-white/10 border border-white/10 flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              >
                <FastForward className="w-3.5 h-3.5 text-amber-400" />
                <span>Sim Jan (Wk 20)</span>
              </button>

              <button
                type="button"
                disabled={isSimulating}
                onClick={() => {
                  sounds.playWhistle();
                  setShowMobileStats(false);
                  onFastForwardSummer();
                }}
                className="min-h-11 px-3 py-2 rounded-lg text-xs font-semibold text-slate-200 bg-white/5 hover:bg-white/10 border border-white/10 flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
              >
                <Award className="w-3.5 h-3.5 text-emerald-400" />
                <span>Sim Season End</span>
              </button>
            </div>
          </div>
        )}
      </header>

      {/* Fixed Bottom Tab Bar (< lg) */}
      <nav
        aria-label="Mobile navigation"
        className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-[#0b0f17] border-t border-slate-800 safe-area-bottom-bar pt-1.5"
      >
        <div className="max-w-lg mx-auto grid grid-cols-5 gap-1">
          {primaryMobileTabs.map(item => {
            const Icon = item.icon;
            const active = currentTab === item.id;
            const badgeCount = item.id === 'transfers' ? pendingProposalsCount : 0;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  sounds.playClick();
                  setCurrentTab(item.id);
                }}
                className={`relative min-h-11 py-1.5 px-1 flex flex-col items-center justify-center gap-0.5 rounded-lg text-xs font-semibold transition-all active:scale-95 cursor-pointer ${
                  active
                    ? 'text-amber-400 bg-amber-400/10 border border-amber-400/25'
                    : 'text-slate-400 hover:text-slate-200 active:bg-white/5'
                }`}
              >
                <div className="relative">
                  <Icon className="w-4 h-4 shrink-0" />
                  {badgeCount > 0 && (
                    <span className="absolute -top-1.5 -right-2.5 min-w-4 h-4 px-1 rounded-full bg-amber-400 text-slate-950 text-[10px] font-mono font-extrabold flex items-center justify-center leading-none">
                      {badgeCount}
                    </span>
                  )}
                </div>
                <span className="truncate max-w-full leading-none">{item.shortLabel}</span>
              </button>
            );
          })}

          <button
            type="button"
            onClick={() => {
              sounds.playClick();
              setShowMoreSheet(true);
            }}
            aria-haspopup="dialog"
            aria-expanded={showMoreSheet}
            className={`min-h-11 py-1.5 px-1 flex flex-col items-center justify-center gap-0.5 rounded-lg text-xs font-semibold transition-all active:scale-95 cursor-pointer ${
              isSecondaryTabActive || showMoreSheet
                ? 'text-amber-400 bg-amber-400/10 border border-amber-400/25'
                : 'text-slate-400 hover:text-slate-200 active:bg-white/5'
            }`}
          >
            <MoreHorizontal className="w-4 h-4 shrink-0" />
            <span className="truncate max-w-full leading-none">More</span>
          </button>
        </div>
      </nav>

      {/* "More" Bottom Sheet for Remaining Tabs, Saves & Main Menu */}
      <Modal
        isOpen={showMoreSheet}
        onClose={closeMoreSheet}
        maxWidthClass="max-w-md"
        ariaLabel="More navigation options"
        header={
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-amber-400 block">
              Club Departments
            </span>
            <h2 className="text-lg font-extrabold text-white">More Navigation</h2>
          </div>
        }
      >
        <div className="space-y-2">
          {secondaryMobileTabs.map(item => {
            const Icon = item.icon;
            const active = currentTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  sounds.playClick();
                  setCurrentTab(item.id);
                  closeMoreSheet();
                }}
                className={`w-full min-h-12 px-4 py-3 rounded-xl border text-left text-sm font-bold flex items-center gap-3 transition-colors cursor-pointer ${
                  active
                    ? 'bg-amber-400/15 border-amber-400/40 text-amber-300'
                    : 'bg-slate-900/70 border-white/10 text-slate-200 hover:bg-white/10'
                }`}
              >
                <Icon className={`w-5 h-5 shrink-0 ${active ? 'text-amber-400' : 'text-slate-400'}`} />
                <span>{item.label}</span>
              </button>
            );
          })}

          <div className="pt-3 mt-3 border-t border-white/10 space-y-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block px-1">
              Save Backup
            </span>

            {importSuccess && (
              <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-xs text-emerald-300">
                ✓ {importSuccess}
              </div>
            )}

            {importError && (
              <div className="p-2.5 bg-rose-500/10 border border-rose-500/30 rounded-xl text-xs text-rose-300">
                ✕ {importError}
              </div>
            )}

            {pendingImportJson && (
              <div className="p-3 bg-amber-500/10 border border-amber-400/35 rounded-xl space-y-2.5">
                <p className="text-xs font-semibold text-amber-200">
                  This replaces your current save. Continue?
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={confirmMobileImport}
                    className="flex-1 min-h-10 px-3 py-2 rounded-lg bg-amber-400 hover:bg-amber-300 text-slate-950 text-xs font-bold cursor-pointer"
                  >
                    Replace Save
                  </button>
                  <button
                    type="button"
                    onClick={() => setPendingImportJson(null)}
                    className="min-h-10 px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 text-xs font-semibold cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  sounds.playClick();
                  onExportSave();
                }}
                className="min-h-12 px-3 py-2.5 rounded-xl bg-slate-900/70 hover:bg-white/10 border border-white/10 text-xs font-bold text-slate-100 flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                <Download className="w-4 h-4 text-amber-400 shrink-0" />
                <span>Export Save</span>
              </button>

              <label className="min-h-12 px-3 py-2.5 rounded-xl bg-slate-900/70 hover:bg-white/10 border border-white/10 text-xs font-bold text-slate-100 flex items-center justify-center gap-2 transition-colors cursor-pointer">
                <Upload className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Import Save</span>
                <input
                  type="file"
                  accept=".json,application/json"
                  onChange={handleMobileFileImport}
                  className="hidden"
                />
              </label>
            </div>

            <PWAInstallButton variant="sheet" />
          </div>

          <div className="pt-3 mt-3 border-t border-white/10">
            <button
              type="button"
              onClick={() => {
                sounds.playClick();
                closeMoreSheet();
                onBackToMainMenu();
              }}
              className="w-full min-h-12 px-4 py-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 hover:border-amber-400/40 text-left text-sm font-bold text-slate-100 flex items-center gap-3 transition-colors cursor-pointer"
            >
              <Home className="w-5 h-5 text-amber-400 shrink-0" />
              <span>Main Menu (Save & Exit)</span>
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
};
