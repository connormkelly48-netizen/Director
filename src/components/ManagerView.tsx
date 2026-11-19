/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useState } from 'react';
import { Club, DelegationMatrix, Director, Manager, Owner } from '../types/game';
import { UserCheck, UserX, Flame, AlertTriangle, Search, ArrowUpDown, Users, History } from 'lucide-react';
import { sounds } from '../services/soundEffects';
import { getDelegationTrustPenalties } from '../services/transferService';
import {
  calculateHiringCosts,
  calculateManagerSeverance,
  calculateManagerSigningFee,
  deriveManagerAttributes,
  evaluateManagerWillingness,
  executeSackManager,
  formatCurrencyCompact,
  getManagerAverageRating,
  getManagerHistory,
  getSackBoardReaction,
} from '../services/managerService';
import { Modal } from './ui/Modal';
import { HireManagerModal } from './HireManagerModal';
import { ManagerHistoryPanel } from './ManagerHistoryPanel';
import { ManagerProfileModal } from './ManagerProfileModal';

interface ManagerViewProps {
  club: Club;
  allClubs: Club[];
  currentManager: Manager | undefined;
  allManagers: Manager[];
  director: Director;
  owner: Owner;
  delegation?: DelegationMatrix;
  seasonYear?: number;
  currentWeek?: number;
  onUpdateManager: (
    newManager: Manager | null,
    updatedDirector: Director,
    updatedClub: Club,
    updatedOwner: Owner,
    updatedRivalClub?: Club,
    updatedSackedManager?: Manager
  ) => void;
}

type ManagerSubTab = 'current' | 'market';
type IncumbentDetailTab = 'overview' | 'history';
type AvailabilityFilter = 'all' | 'free' | 'employed';
type WillingnessFilter = 'all' | 'willing';
type SortKey = 'reputation' | 'attributes' | 'wage' | 'signingFee';

export const ManagerView: React.FC<ManagerViewProps> = ({
  club,
  allClubs,
  currentManager,
  allManagers,
  director,
  owner,
  delegation,
  seasonYear = 2026,
  currentWeek = 1,
  onUpdateManager,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<ManagerSubTab>(currentManager ? 'current' : 'market');
  const [incumbentTab, setIncumbentTab] = useState<IncumbentDetailTab>('overview');
  const [selectedCandidate, setSelectedCandidate] = useState<Manager | null>(null);
  const [profileModal, setProfileModal] = useState<{ manager: Manager; initialTab: 'overview' | 'history' } | null>(null);
  const [showSackConfirm, setShowSackConfirm] = useState(false);

  const [availabilityFilter, setAvailabilityFilter] = useState<AvailabilityFilter>('all');
  const [filterStyle, setFilterStyle] = useState<string>('all');
  const [willingnessFilter, setWillingnessFilter] = useState<WillingnessFilter>('all');
  const [sortKey, setSortKey] = useState<SortKey>('reputation');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    setIncumbentTab('overview');
  }, [currentManager?.id]);

  const clubsById = useMemo(() => {
    const map = new Map<string, Club>();
    allClubs.forEach(c => map.set(c.id, c));
    return map;
  }, [allClubs]);

  const currentSeverance = useMemo(
    () => (currentManager ? calculateManagerSeverance(currentManager) : null),
    [currentManager]
  );

  const sackReactionPreview = useMemo(() => getSackBoardReaction(club), [club]);
  const canAffordSack = Boolean(currentSeverance && club.balance >= currentSeverance.totalSeverance);

  // Build enriched market list for ALL managers in the fixed pool
  const marketRows = useMemo(() => {
    return allManagers.map(mgr => {
      const attrs = mgr.attributes ?? deriveManagerAttributes(mgr);
      const avgAttr = getManagerAverageRating(attrs);
      const signingFee = calculateManagerSigningFee(mgr);
      const costs = calculateHiringCosts(mgr, mgr.wage);
      const employerClub = mgr.clubId ? clubsById.get(mgr.clubId) : undefined;
      const willingness = evaluateManagerWillingness(mgr, club, owner, mgr.wage, employerClub);

      return {
        mgr,
        attrs,
        avgAttr,
        signingFee,
        costs,
        employerClub,
        willingness,
      };
    });
  }, [allManagers, clubsById, club, owner]);

  const filteredMarketRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    return marketRows
      .filter(({ mgr, employerClub, willingness }) => {
        if (availabilityFilter === 'free' && mgr.clubId !== null) return false;
        if (availabilityFilter === 'employed' && mgr.clubId === null) return false;
        if (filterStyle !== 'all' && mgr.tacticalStyle !== filterStyle) return false;
        if (willingnessFilter === 'willing' && !willingness.willing) return false;
        if (q) {
          const clubName = employerClub ? employerClub.name.toLowerCase() : 'free agent';
          const matches =
            mgr.name.toLowerCase().includes(q) ||
            mgr.nationality.toLowerCase().includes(q) ||
            clubName.includes(q);
          if (!matches) return false;
        }
        return true;
      })
      .sort((a, b) => {
        if (sortKey === 'reputation') return b.mgr.reputation - a.mgr.reputation || b.avgAttr - a.avgAttr;
        if (sortKey === 'attributes') return b.avgAttr - a.avgAttr || b.mgr.reputation - a.mgr.reputation;
        if (sortKey === 'wage') return a.mgr.wage - b.mgr.wage;
        return a.signingFee - b.signingFee;
      });
  }, [marketRows, availabilityFilter, filterStyle, willingnessFilter, searchQuery, sortKey]);

  const freeAgentCount = useMemo(() => allManagers.filter(m => m.clubId === null).length, [allManagers]);

  const handleConfirmSack = () => {
    if (!currentManager) return;
    const result = executeSackManager({
      club,
      manager: currentManager,
      owner,
      director,
      seasonYear,
      currentWeek,
    });

    if (!result.ok) {
      sounds.playCrisis();
      setFeedback(result.error);
      setShowSackConfirm(false);
      return;
    }

    sounds.playCrisis();
    setShowSackConfirm(false);
    setFeedback(
      `MANAGER DISMISSED: ${currentManager.name} has left ${club.name}. Severance paid: ${formatCurrencyCompact(result.severance.totalSeverance)}. ${result.reaction.severityLabel}.`
    );
    onUpdateManager(
      null,
      result.updatedDirector,
      result.updatedClub,
      result.updatedOwner,
      undefined,
      result.updatedManager
    );
  };

  const handleConfirmHire = (
    newManager: Manager,
    updatedDirector: Director,
    updatedClub: Club,
    updatedOwner: Owner,
    updatedRivalClub?: Club
  ) => {
    setSelectedCandidate(null);
    setActiveSubTab('current');
    setFeedback(
      updatedRivalClub
        ? `APPOINTMENT CONFIRMED: ${newManager.name} has been recruited from ${updatedRivalClub.name} to lead ${club.name}!`
        : `APPOINTMENT CONFIRMED: ${newManager.name} has been appointed Head Coach of ${club.name}!`
    );
    onUpdateManager(newManager, updatedDirector, updatedClub, updatedOwner, updatedRivalClub);
  };

  const currentAttrs = currentManager ? (currentManager.attributes ?? deriveManagerAttributes(currentManager)) : null;

  return (
    <div className="space-y-6">
      {/* Header + Sub-Tab Switcher */}
      <div className="bg-[#111827] border border-white/10 rounded-xl p-4 sm:p-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold text-amber-400 mb-1">
              <UserCheck className="w-4 h-4 shrink-0" />
              <span>Head Coach Leadership & Recruitment</span>
            </div>
            <h1 className="text-2xl lg:text-3xl font-extrabold text-white tracking-tight">
              Head Coach Suite & Manager Market
            </h1>
            <p className="text-slate-400 text-xs mt-1 max-w-[75ch]">
              Fixed pool of {allManagers.length} managers · No contracts · Treasury Balance:{' '}
              <span className="font-mono tabular-nums text-emerald-400 font-semibold">
                {formatCurrencyCompact(club.balance)}
              </span>
            </p>
          </div>

          <div className="flex items-center gap-1 p-1 bg-slate-900 border border-white/10 rounded-lg self-start lg:self-auto">
            <button
              type="button"
              onClick={() => {
                sounds.playClick();
                setActiveSubTab('current');
              }}
              className={`px-3.5 py-2 min-h-10 lg:min-h-0 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activeSubTab === 'current'
                  ? 'bg-amber-400 text-slate-950 font-bold'
                  : 'text-slate-300 hover:text-white hover:bg-white/5'
              }`}
            >
              Current Head Coach
            </button>
            <button
              type="button"
              onClick={() => {
                sounds.playClick();
                setActiveSubTab('market');
              }}
              className={`px-3.5 py-2 min-h-10 lg:min-h-0 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activeSubTab === 'market'
                  ? 'bg-amber-400 text-slate-950 font-bold'
                  : 'text-slate-300 hover:text-white hover:bg-white/5'
              }`}
            >
              Manager Market ({allManagers.length})
            </button>
          </div>
        </div>
      </div>

      {feedback && (
        <div className="p-4 rounded-xl bg-slate-900 border border-amber-400/30 text-xs text-amber-300 flex items-center justify-between gap-2">
          <span className="max-w-[75ch]">{feedback}</span>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            aria-label="Dismiss feedback"
            className="min-h-10 min-w-10 lg:min-h-0 lg:min-w-0 flex items-center justify-center rounded-lg text-slate-400 hover:text-white cursor-pointer shrink-0"
          >
            ✕
          </button>
        </div>
      )}

      {/* SUB-TAB 1: Current Head Coach */}
      {activeSubTab === 'current' && (
        <div className="bg-[#111827] border border-white/10 rounded-xl p-4 sm:p-6">
          <div className="border-b border-white/10 pb-3 mb-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold text-white">Current Head Coach in Dugout</h2>
              <span className="text-xs text-slate-400">
                Coaching attributes, tactical identity, tenure, and severance terms
              </span>
            </div>
            {currentManager && currentSeverance && (
              <div className="flex flex-col items-stretch sm:items-end gap-1">
                <button
                  type="button"
                  disabled={!canAffordSack}
                  onClick={() => {
                    sounds.playClick();
                    setShowSackConfirm(true);
                  }}
                  className="px-4 py-2 min-h-11 lg:min-h-0 bg-rose-500/15 hover:bg-rose-500/25 disabled:bg-slate-900 disabled:text-slate-500 disabled:border-white/10 border border-rose-500/35 text-rose-300 font-bold text-xs rounded-lg flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:cursor-not-allowed whitespace-nowrap shrink-0"
                >
                  <UserX className="w-3.5 h-3.5" />
                  <span>Sack Manager ({formatCurrencyCompact(currentSeverance.totalSeverance)})</span>
                </button>
                {!canAffordSack && (
                  <span className="text-[11px] text-rose-400 font-mono tabular-nums">
                    Disabled: Treasury ({formatCurrencyCompact(club.balance)}) cannot cover {formatCurrencyCompact(currentSeverance.totalSeverance)} severance
                  </span>
                )}
              </div>
            )}
          </div>

          {currentManager && currentAttrs && currentSeverance ? (
            <div className="space-y-5">
              {/* Incumbent Sub-Navigation: Overview | History */}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-1 p-1 bg-slate-900 border border-white/10 rounded-lg">
                  <button
                    type="button"
                    onClick={() => {
                      sounds.playClick();
                      setIncumbentTab('overview');
                    }}
                    className={`px-3.5 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      incumbentTab === 'overview'
                        ? 'bg-amber-400 text-slate-950 font-bold'
                        : 'text-slate-300 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    Overview
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      sounds.playClick();
                      setIncumbentTab('history');
                    }}
                    className={`px-3.5 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer inline-flex items-center gap-1.5 ${
                      incumbentTab === 'history'
                        ? 'bg-amber-400 text-slate-950 font-bold'
                        : 'text-slate-300 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    <History className="w-3.5 h-3.5" />
                    <span>History ({getManagerHistory(currentManager).length})</span>
                  </button>
                </div>
              </div>

              {incumbentTab === 'history' ? (
                <ManagerHistoryPanel manager={currentManager} />
              ) : (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 space-y-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="text-xl sm:text-2xl font-extrabold text-white">{currentManager.name}</h3>
                    <div className="text-xs text-slate-400 mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span>{currentManager.nationality}</span>
                      <span aria-hidden="true">·</span>
                      <span>Age {currentManager.age}</span>
                      <span aria-hidden="true">·</span>
                      <span>{currentManager.tacticalStyle}</span>
                      <span aria-hidden="true">·</span>
                      <span>
                        Tenure: <strong className="text-slate-200 font-mono tabular-nums">{currentManager.seasonsAtClub ?? 0}</strong> full season{(currentManager.seasonsAtClub ?? 0) === 1 ? '' : 's'}
                      </span>
                    </div>
                  </div>
                  <div className="text-left sm:text-right">
                    <span className="text-xs text-slate-400 block">Reputation</span>
                    <span className="text-xl font-bold font-mono tabular-nums text-amber-400">
                      {currentManager.reputation} / 100
                    </span>
                  </div>
                </div>

                {/* Numeric Coaching Attributes */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 border-t border-white/10">
                  <div>
                    <span className="text-xs text-slate-400 block">Tactical</span>
                    <span className="text-lg font-bold font-mono tabular-nums text-white">{currentAttrs.tactical}</span>
                  </div>
                  <div>
                    <span className="text-xs text-slate-400 block">Coaching</span>
                    <span className="text-lg font-bold font-mono tabular-nums text-white">{currentAttrs.coaching}</span>
                  </div>
                  <div>
                    <span className="text-xs text-slate-400 block">Man Management</span>
                    <span className="text-lg font-bold font-mono tabular-nums text-white">{currentAttrs.manManagement}</span>
                  </div>
                  <div>
                    <span className="text-xs text-slate-400 block">Youth Development</span>
                    <span className="text-lg font-bold font-mono tabular-nums text-white">{currentAttrs.youthDevelopment}</span>
                  </div>
                </div>

                <p className="text-xs leading-relaxed text-slate-300 italic font-serif border-t border-white/10 pt-4 max-w-[75ch]">
                  &ldquo;{currentManager.profileSnippet}&rdquo;
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-3 border-t border-white/10 text-xs">
                  <div>
                    <span className="text-slate-400 block mb-0.5">Preferred Formation</span>
                    <span className="font-bold text-white font-mono">{currentManager.preferredFormation}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block mb-0.5">Control Appetite</span>
                    <span
                      className={`font-bold capitalize ${
                        currentManager.controlDesire === 'autocrat'
                          ? 'text-rose-400'
                          : currentManager.controlDesire === 'collaborator'
                          ? 'text-amber-400'
                          : 'text-emerald-400'
                      }`}
                    >
                      {currentManager.controlDesire.replace('_', ' ')}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block mb-0.5">Weekly Wage</span>
                    <span className="font-bold text-white font-mono tabular-nums">
                      £{(currentManager.wage / 1000).toFixed(1)}k/wk ({formatCurrencyCompact(currentSeverance.annualWage)}/yr)
                    </span>
                  </div>
                </div>
              </div>

              {/* Relationship & Severance Panel */}
              <div className="bg-slate-900/70 border border-white/10 rounded-xl p-4 flex flex-col justify-between space-y-4">
                <div>
                  <span className="text-xs font-bold text-slate-200 block mb-1 flex items-center gap-1.5">
                    <Flame className="w-4 h-4 text-amber-400" />
                    Chemistry with Sporting Director
                  </span>
                  <span className="text-xs text-slate-400 block mb-3">
                    Influenced by results and delegated responsibilities.
                  </span>

                  <div className="mb-3">
                    <div className="flex items-center justify-between text-xs font-mono tabular-nums mb-1">
                      <span className="text-slate-400">Trust Level</span>
                      <span
                        className={`font-bold ${
                          currentManager.trustInDirector > 70
                            ? 'text-emerald-400'
                            : currentManager.trustInDirector > 40
                            ? 'text-amber-400'
                            : 'text-rose-400'
                        }`}
                      >
                        {currentManager.trustInDirector}%
                      </span>
                    </div>
                    <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                      <div
                        className={`h-full transition-all duration-300 ${
                          currentManager.trustInDirector > 70
                            ? 'bg-emerald-400'
                            : currentManager.trustInDirector > 40
                            ? 'bg-amber-400'
                            : 'bg-rose-500'
                        }`}
                        style={{ width: `${currentManager.trustInDirector}%` }}
                      />
                    </div>
                  </div>

                  <p className="text-xs text-slate-400 leading-relaxed">
                    {currentManager.trustInDirector > 70
                      ? 'The coach feels fully supported and respects your strategic squad additions.'
                      : currentManager.trustInDirector > 40
                      ? 'Minor friction over playing time and tactical authority. Maintain caution.'
                      : 'Critical rift: the manager feels undermined and dressing-room morale is at risk.'}
                  </p>

                  {delegation && (() => {
                    const penalties = getDelegationTrustPenalties(currentManager);
                    const directorDuties = [
                      delegation.transferSignings === 'director',
                      delegation.transferSales === 'director',
                      delegation.tacticalStyle === 'director_mandated',
                    ].filter(Boolean).length;
                    const grantedDuties = [
                      delegation.transferSignings === 'manager',
                      delegation.transferSales === 'manager',
                      delegation.contractRenewals === 'manager',
                      delegation.youthPromotion === 'manager',
                      delegation.tacticalStyle === 'manager_freedom',
                    ].filter(Boolean).length;

                    return (
                      <div className="mt-3 pt-3 border-t border-white/10 space-y-1 text-xs">
                        <div className="flex items-center justify-between gap-2 text-slate-400">
                          <span className="font-semibold">Delegation Trade-off</span>
                          <span className="font-mono tabular-nums text-slate-300">
                            Override: <strong className="text-rose-400">{penalties.overrideSigning}</strong> /{' '}
                            <strong className="text-rose-400">{penalties.overrideSale}</strong>
                          </span>
                        </div>
                        <p className="text-slate-400 leading-snug">
                          {currentManager.controlDesire === 'autocrat' && directorDuties >= 2
                            ? `Friction Alert: ${currentManager.name} resents director control over ${directorDuties} core areas (-1 to -2 weekly Trust).`
                            : currentManager.controlDesire === 'head_coach' && grantedDuties >= 3
                            ? `Autonomy Bonus: ${currentManager.name} thrives with delegated freedom (+1 Trust & squad morale lift weekly).`
                            : currentManager.controlDesire === 'collaborator' &&
                              (delegation.transferSignings === 'shared' || delegation.transferSales === 'shared')
                            ? `Consensus Alignment: Shared transfer setup matches ${currentManager.name}'s collaborative approach.`
                            : `Balanced Authority: ${grantedDuties} coach-led duties · Override penalties scale with his ${currentManager.controlDesire.replace('_', ' ')} profile.`}
                        </p>
                      </div>
                    );
                  })()}
                </div>

                <div className="pt-3 border-t border-white/10 text-xs space-y-1">
                  <div className="flex items-center justify-between text-slate-400">
                    <span>Severance Fee</span>
                    <span className="font-mono tabular-nums font-bold text-white">
                      {formatCurrencyCompact(currentSeverance.totalSeverance)}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-500 font-mono tabular-nums">
                    50% annual ({formatCurrencyCompact(currentSeverance.baseSeverance)}) + {currentSeverance.fullSeasons} season tenure ({formatCurrencyCompact(currentSeverance.tenureBonus)})
                  </div>
                </div>
              </div>
            </div>
              )}
            </div>
          ) : (
            <div className="text-center py-10 bg-slate-900/50 rounded-xl border border-dashed border-white/10 space-y-3">
              <UserX className="w-10 h-10 text-slate-500 mx-auto" />
              <div>
                <h3 className="text-sm font-bold text-white">Dugout Currently Vacant</h3>
                <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
                  {club.name} has no active head coach. Browse the Manager Market to recruit a free agent or poach a manager from a rival club.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  sounds.playClick();
                  setActiveSubTab('market');
                }}
                className="px-4 py-2 min-h-11 lg:min-h-0 rounded-lg bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold text-xs cursor-pointer inline-flex items-center gap-1.5"
              >
                <Users className="w-3.5 h-3.5" />
                <span>Open Manager Market</span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* SUB-TAB 2: Manager Market (All 128 Managers) */}
      {activeSubTab === 'market' && (
        <div className="bg-[#111827] border border-white/10 rounded-xl p-4 sm:p-6 space-y-4">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-white/10 pb-4">
            <div>
              <h2 className="text-sm font-bold text-white">Global Manager Market</h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Showing <span className="font-mono tabular-nums text-white">{filteredMarketRows.length}</span> of{' '}
                <span className="font-mono tabular-nums text-white">{allManagers.length}</span> managers ·{' '}
                <span className="font-mono tabular-nums text-emerald-400">{freeAgentCount}</span> Free agents ·{' '}
                <span className="font-mono tabular-nums text-slate-300">{allManagers.length - freeAgentCount}</span> At clubs
              </p>
            </div>

            {currentManager && (
              <div className="px-3 py-2 rounded-lg bg-amber-950/30 border border-amber-500/30 text-xs text-amber-200 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                <span>
                  Current Head Coach: <strong>{currentManager.name}</strong>. Sack your incumbent before appointing a replacement.
                </span>
              </div>
            )}
          </div>

          {/* Search & Filter Toolbar */}
          <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1 p-1 bg-slate-900 border border-white/10 rounded-lg">
                {(
                  [
                    { id: 'all', label: 'All' },
                    { id: 'free', label: 'Free Agents' },
                    { id: 'employed', label: 'At Clubs' },
                  ] as const
                ).map(opt => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setAvailabilityFilter(opt.id)}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      availabilityFilter === opt.id
                        ? 'bg-amber-400 text-slate-950 font-bold'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-1 p-1 bg-slate-900 border border-white/10 rounded-lg">
                {(
                  [
                    { id: 'all', label: 'All Willingness' },
                    { id: 'willing', label: 'Willing Only' },
                  ] as const
                ).map(opt => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setWillingnessFilter(opt.id)}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      willingnessFilter === opt.id
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="relative flex-1 sm:flex-initial">
                <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="search"
                  inputMode="search"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Search name, nation, club..."
                  className="pl-8 pr-3 py-2 min-h-11 lg:min-h-0 text-base md:text-xs bg-slate-900 border border-white/10 rounded-lg text-white placeholder-slate-500 w-full sm:w-56"
                />
              </div>

              <select
                value={filterStyle}
                onChange={e => setFilterStyle(e.target.value)}
                aria-label="Filter by tactical style"
                className="px-3 py-2 min-h-11 lg:min-h-0 text-base md:text-xs bg-slate-900 border border-white/10 rounded-lg text-white"
              >
                <option value="all">All Styles</option>
                <option value="High Gegenpress">High Gegenpress</option>
                <option value="Tiki-Taka Possession">Tiki-Taka Possession</option>
                <option value="Direct Counter-Attack">Direct Counter-Attack</option>
                <option value="Pragmatic Low Block">Pragmatic Low Block</option>
                <option value="Fluid Wing Play">Fluid Wing Play</option>
              </select>

              <div className="flex items-center gap-1.5">
                <ArrowUpDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <select
                  value={sortKey}
                  onChange={e => setSortKey(e.target.value as SortKey)}
                  aria-label="Sort managers"
                  className="px-3 py-2 min-h-11 lg:min-h-0 text-base md:text-xs bg-slate-900 border border-white/10 rounded-lg text-white"
                >
                  <option value="reputation">Sort: Reputation</option>
                  <option value="attributes">Sort: Coaching Rating</option>
                  <option value="wage">Sort: Lowest Wage</option>
                  <option value="signingFee">Sort: Lowest Signing Fee</option>
                </select>
              </div>
            </div>
          </div>

          {filteredMarketRows.length === 0 ? (
            <div className="text-center py-10 bg-slate-900/40 rounded-xl border border-white/10 space-y-3">
              <p className="text-xs text-slate-400">No managers match your current filters.</p>
              <button
                type="button"
                onClick={() => {
                  setAvailabilityFilter('all');
                  setFilterStyle('all');
                  setWillingnessFilter('all');
                  setSearchQuery('');
                }}
                className="px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-semibold text-white cursor-pointer"
              >
                Reset Filters
              </button>
            </div>
          ) : (
            <>
              {/* Desktop Dense Table */}
              <div className="hidden lg:block overflow-x-auto border border-white/10 rounded-xl">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-900/90 border-b border-white/10 text-[11px] font-semibold text-slate-400">
                      <th className="py-3 px-3.5">Manager</th>
                      <th className="py-3 px-3">Attributes (TAC / COA / MAN / YTH)</th>
                      <th className="py-3 px-3 text-right">Rep</th>
                      <th className="py-3 px-3 text-right">Wage Demand</th>
                      <th className="py-3 px-3 text-right">Signing Fee</th>
                      <th className="py-3 px-3">Current Club</th>
                      <th className="py-3 px-3">Willingness to Join</th>
                      <th className="py-3 px-3.5 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {filteredMarketRows.map(({ mgr, attrs, signingFee, costs, employerClub, willingness }) => {
                      const isIncumbent = mgr.clubId === club.id;
                      const canAfford = club.balance >= costs.totalCost;

                      return (
                        <tr key={mgr.id} className="hover:bg-white/[0.03] transition-colors">
                          <td className="py-3 px-3.5 align-top">
                            <button
                              type="button"
                              onClick={() => {
                                sounds.playClick();
                                setProfileModal({ manager: mgr, initialTab: 'overview' });
                              }}
                              className="font-bold text-white hover:text-amber-400 transition-colors text-left cursor-pointer"
                            >
                              {mgr.name}
                            </button>
                            <div className="text-[11px] text-slate-400 mt-0.5">
                              {mgr.nationality} · Age {mgr.age} · {mgr.tacticalStyle} · {mgr.preferredFormation}
                            </div>
                          </td>
                          <td className="py-3 px-3 align-top">
                            <div className="font-mono tabular-nums text-slate-200 font-semibold">
                              {attrs.tactical} / {attrs.coaching} / {attrs.manManagement} / {attrs.youthDevelopment}
                            </div>
                            <div className="text-[11px] text-slate-400 capitalize mt-0.5">
                              {mgr.controlDesire.replace('_', ' ')}
                            </div>
                          </td>
                          <td className="py-3 px-3 align-top text-right font-mono tabular-nums font-bold text-amber-400">
                            {mgr.reputation}
                          </td>
                          <td className="py-3 px-3 align-top text-right font-mono tabular-nums">
                            <div className="text-white font-semibold">£{(mgr.wage / 1000).toFixed(1)}k/wk</div>
                            <div className="text-[11px] text-slate-400">{formatCurrencyCompact(costs.firstSeasonWage)}/yr</div>
                          </td>
                          <td className="py-3 px-3 align-top text-right font-mono tabular-nums">
                            <div className={canAfford ? 'text-slate-200 font-semibold' : 'text-rose-400 font-semibold'}>
                              {formatCurrencyCompact(signingFee)}
                            </div>
                            <div className="text-[11px] text-slate-400">
                              Total {formatCurrencyCompact(costs.totalCost)}
                            </div>
                          </td>
                          <td className="py-3 px-3 align-top">
                            {employerClub ? (
                              <span className="text-slate-200 font-medium">{employerClub.name}</span>
                            ) : (
                              <span className="text-emerald-400 font-medium">Free agent</span>
                            )}
                          </td>
                          <td className="py-3 px-3 align-top max-w-[260px]">
                            <div
                              className={`font-semibold ${
                                isIncumbent
                                  ? 'text-amber-400'
                                  : willingness.willing
                                  ? 'text-emerald-400'
                                  : 'text-rose-400'
                              }`}
                            >
                              {willingness.statusLabel}
                            </div>
                            {!willingness.willing && !isIncumbent && willingness.primaryReason && (
                              <div className="text-[11px] text-slate-400 mt-0.5 leading-snug">
                                {willingness.primaryReason}
                              </div>
                            )}
                            {!isIncumbent && !canAfford && (
                              <div className="text-[11px] text-rose-400 mt-0.5 leading-snug font-mono tabular-nums">
                                Budget below {formatCurrencyCompact(costs.totalCost)} total
                              </div>
                            )}
                          </td>
                          <td className="py-3 px-3.5 align-top text-right">
                            <div className="inline-flex items-center justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={() => {
                                  sounds.playClick();
                                  setProfileModal({ manager: mgr, initialTab: 'history' });
                                }}
                                title="View career history"
                                className="px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-semibold text-slate-300 hover:text-white whitespace-nowrap shrink-0 transition-colors cursor-pointer inline-flex items-center gap-1"
                              >
                                <History className="w-3 h-3" />
                                <span>History</span>
                              </button>
                              {isIncumbent ? (
                                <span className="text-[11px] font-semibold text-amber-400 px-1.5">Incumbent</span>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => {
                                    sounds.playClick();
                                    setSelectedCandidate(mgr);
                                  }}
                                  className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                                    willingness.willing && canAfford && !currentManager
                                      ? 'bg-amber-400 hover:bg-amber-300 text-slate-950'
                                      : 'bg-white/5 hover:bg-white/10 border border-white/10 text-slate-200'
                                  }`}
                                >
                                  Negotiate
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Mobile / Tablet List */}
              <div className="lg:hidden space-y-3">
                {filteredMarketRows.map(({ mgr, attrs, signingFee, costs, employerClub, willingness }) => {
                  const isIncumbent = mgr.clubId === club.id;
                  const canAfford = club.balance >= costs.totalCost;

                  return (
                    <div
                      key={mgr.id}
                      className="bg-slate-900/70 border border-white/10 rounded-xl p-4 space-y-3"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <button
                            type="button"
                            onClick={() => {
                              sounds.playClick();
                              setProfileModal({ manager: mgr, initialTab: 'overview' });
                            }}
                            className="text-sm font-bold text-white hover:text-amber-400 truncate block text-left cursor-pointer"
                          >
                            {mgr.name}
                          </button>
                          <p className="text-xs text-slate-400">
                            {mgr.nationality} · Age {mgr.age} · {employerClub ? employerClub.name : 'Free agent'}
                          </p>
                        </div>
                        <span className="font-mono tabular-nums text-xs font-bold text-amber-400 shrink-0">
                          Rep {mgr.reputation}
                        </span>
                      </div>

                      <div className="grid grid-cols-4 gap-2 text-center border-y border-white/10 py-2 text-xs font-mono tabular-nums">
                        <div>
                          <span className="text-[10px] text-slate-400 block">TAC</span>
                          <span className="font-bold text-white">{attrs.tactical}</span>
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-400 block">COA</span>
                          <span className="font-bold text-white">{attrs.coaching}</span>
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-400 block">MAN</span>
                          <span className="font-bold text-white">{attrs.manManagement}</span>
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-400 block">YTH</span>
                          <span className="font-bold text-white">{attrs.youthDevelopment}</span>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div>
                          <span className="text-slate-400 block">Wage Demand</span>
                          <span className="font-mono tabular-nums font-semibold text-white">
                            £{(mgr.wage / 1000).toFixed(1)}k/wk
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-400 block">Signing Fee (Total)</span>
                          <span className="font-mono tabular-nums font-semibold text-white">
                            {formatCurrencyCompact(signingFee)} ({formatCurrencyCompact(costs.totalCost)})
                          </span>
                        </div>
                      </div>

                      <div className="text-xs space-y-0.5">
                        <span
                          className={`font-semibold block ${
                            isIncumbent
                              ? 'text-amber-400'
                              : willingness.willing
                              ? 'text-emerald-400'
                              : 'text-rose-400'
                          }`}
                        >
                          {willingness.statusLabel}
                        </span>
                        {!willingness.willing && !isIncumbent && willingness.primaryReason && (
                          <span className="text-slate-400 block">{willingness.primaryReason}</span>
                        )}
                        {!isIncumbent && !canAfford && (
                          <span className="text-rose-400 block font-mono tabular-nums">
                            Budget below {formatCurrencyCompact(costs.totalCost)} total cost
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            sounds.playClick();
                            setProfileModal({ manager: mgr, initialTab: 'history' });
                          }}
                          className="min-h-11 px-3.5 py-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-slate-200 font-semibold text-xs cursor-pointer inline-flex items-center justify-center gap-1.5 shrink-0"
                        >
                          <History className="w-3.5 h-3.5" />
                          <span>History</span>
                        </button>
                        {!isIncumbent && (
                          <button
                            type="button"
                            onClick={() => {
                              sounds.playClick();
                              setSelectedCandidate(mgr);
                            }}
                            className="flex-1 min-h-11 py-2 rounded-lg bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold text-xs cursor-pointer"
                          >
                            Negotiate &amp; Inspect Terms
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}

      {/* Sack Manager Confirmation Modal */}
      <Modal
        isOpen={Boolean(showSackConfirm && currentManager && currentSeverance)}
        onClose={() => setShowSackConfirm(false)}
        maxWidthClass="max-w-lg"
        ariaLabel="Confirm Manager Dismissal"
        header={
          currentManager && (
            <div>
              <span className="text-xs font-semibold text-rose-400 block mb-0.5">
                Executive Dismissal Confirmation
              </span>
              <h2 className="text-xl font-extrabold text-white">Sack {currentManager.name}?</h2>
            </div>
          )
        }
        footer={
          <div className="flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={() => setShowSackConfirm(false)}
              className="px-4 py-2 min-h-11 lg:min-h-0 rounded-lg border border-white/10 text-xs font-semibold text-slate-300 hover:text-white hover:bg-white/5 cursor-pointer"
            >
              Keep Manager
            </button>
            <button
              type="button"
              disabled={!canAffordSack}
              onClick={handleConfirmSack}
              className="px-5 py-2 min-h-11 lg:min-h-0 rounded-lg bg-rose-500 hover:bg-rose-400 disabled:bg-slate-800 disabled:text-slate-500 text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer disabled:cursor-not-allowed"
            >
              <UserX className="w-4 h-4" />
              <span>Confirm Sack &amp; Pay Severance</span>
            </button>
          </div>
        }
      >
        {currentManager && currentSeverance && (
          <div className="space-y-4 text-xs">
            <p className="text-slate-300 leading-relaxed">
              Dismissing <strong className="text-white">{currentManager.name}</strong> immediately deducts the full severance payout from {club.name}&apos;s Club Treasury Balance and returns him to the free agent pool with a small reputation drop.
            </p>

            <div className="bg-slate-900/80 border border-white/10 rounded-xl p-4 space-y-2 font-mono tabular-nums">
              <div className="flex items-center justify-between text-slate-300">
                <span className="font-sans">Annual Wage</span>
                <span>{formatCurrencyCompact(currentSeverance.annualWage)}</span>
              </div>
              <div className="flex items-center justify-between text-slate-300">
                <span className="font-sans">Base Severance (50% annual)</span>
                <span>{formatCurrencyCompact(currentSeverance.baseSeverance)}</span>
              </div>
              <div className="flex items-center justify-between text-slate-300">
                <span className="font-sans">Tenure Add-on ({currentSeverance.fullSeasons} full seasons)</span>
                <span>+{formatCurrencyCompact(currentSeverance.tenureBonus)}</span>
              </div>
              <div className="flex items-center justify-between pt-2 border-t border-white/10 text-rose-400 font-bold">
                <span className="font-sans">Exact Severance Cost</span>
                <span>{formatCurrencyCompact(currentSeverance.totalSeverance)}</span>
              </div>
              <div className="flex items-center justify-between text-slate-400">
                <span className="font-sans">Treasury After Payout</span>
                <span className="text-white">
                  {formatCurrencyCompact(Math.max(0, club.balance - currentSeverance.totalSeverance))}
                </span>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-amber-950/30 border border-amber-500/30 text-amber-200 space-y-1">
              <div className="font-bold flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                <span>Boardroom Reaction</span>
              </div>
              <p className="text-amber-300/90">
                {sackReactionPreview.severityLabel}. Board confidence will drop from{' '}
                <strong className="font-mono tabular-nums">{owner.approval}%</strong> to{' '}
                <strong className="font-mono tabular-nums">
                  {Math.max(0, owner.approval + sackReactionPreview.ownerApprovalDelta)}%
                </strong>
                .
              </p>
            </div>
          </div>
        )}
      </Modal>

      {/* Hire Manager Negotiation Modal */}
      <HireManagerModal
        isOpen={Boolean(selectedCandidate)}
        onClose={() => setSelectedCandidate(null)}
        candidate={selectedCandidate}
        club={club}
        allClubs={allClubs}
        owner={owner}
        director={director}
        seasonYear={seasonYear}
        currentWeek={currentWeek}
        onConfirmHire={handleConfirmHire}
      />

      {/* Individual Manager Career Dossier & History Modal */}
      <ManagerProfileModal
        isOpen={Boolean(profileModal)}
        onClose={() => setProfileModal(null)}
        manager={profileModal?.manager ?? null}
        club={club}
        allClubs={allClubs}
        owner={owner}
        initialTab={profileModal?.initialTab ?? 'overview'}
        onNegotiate={mgr => setSelectedCandidate(mgr)}
      />
    </div>
  );
};
