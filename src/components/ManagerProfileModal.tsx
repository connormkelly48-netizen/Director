/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Club, Manager, Owner } from '../types/game';
import { Modal } from './ui/Modal';
import { ManagerHistoryPanel } from './ManagerHistoryPanel';
import {
  calculateHiringCosts,
  calculateManagerSigningFee,
  deriveManagerAttributes,
  evaluateManagerWillingness,
  formatCurrencyCompact,
  getManagerHistory,
} from '../services/managerService';
import { sounds } from '../services/soundEffects';

interface ManagerProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  manager: Manager | null;
  club: Club;
  allClubs: Club[];
  owner: Owner;
  initialTab?: 'overview' | 'history';
  onNegotiate?: (manager: Manager) => void;
}

export const ManagerProfileModal: React.FC<ManagerProfileModalProps> = ({
  isOpen,
  onClose,
  manager,
  club,
  allClubs,
  owner,
  initialTab = 'overview',
  onNegotiate,
}) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'history'>(initialTab);

  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
    }
  }, [isOpen, initialTab, manager?.id]);

  if (!manager) return null;

  const attrs = manager.attributes ?? deriveManagerAttributes(manager);
  const employerClub = manager.clubId ? allClubs.find(c => c.id === manager.clubId) : undefined;
  const isIncumbent = manager.clubId === club.id;
  const signingFee = calculateManagerSigningFee(manager);
  const costs = calculateHiringCosts(manager, manager.wage);
  const willingness = evaluateManagerWillingness(manager, club, owner, manager.wage, employerClub);
  const historyCount = getManagerHistory(manager).length;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      maxWidthClass="max-w-2xl"
      ariaLabel={`${manager.name} Manager Dossier`}
      header={
        <div>
          <span className="text-xs font-semibold text-amber-400 block mb-0.5">
            Manager Career Dossier
          </span>
          <h2 className="text-xl font-extrabold text-white tracking-tight">{manager.name}</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            {manager.nationality} · Age {manager.age} · Reputation{' '}
            <span className="font-mono tabular-nums text-amber-400 font-semibold">
              {manager.reputation}/100
            </span>{' '}
            · {employerClub ? employerClub.name : 'Free agent'}
          </p>
        </div>
      }
      footer={
        <div className="flex items-center justify-between gap-3">
          <div className="text-xs text-slate-400 font-mono tabular-nums">
            Demand: £{(manager.wage / 1000).toFixed(1)}k/wk · Signing Fee: {formatCurrencyCompact(signingFee)}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 min-h-11 lg:min-h-0 rounded-lg border border-white/10 text-xs font-semibold text-slate-300 hover:text-white hover:bg-white/5 cursor-pointer"
            >
              Close
            </button>
            {!isIncumbent && onNegotiate && (
              <button
                type="button"
                onClick={() => {
                  sounds.playClick();
                  onClose();
                  onNegotiate(manager);
                }}
                className="px-4 py-2 min-h-11 lg:min-h-0 rounded-lg bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold text-xs cursor-pointer"
              >
                Negotiate Terms
              </button>
            )}
          </div>
        </div>
      }
    >
      <div className="space-y-5">
        {/* Dossier Tab Switcher */}
        <div className="flex items-center gap-1 p-1 bg-slate-900 border border-white/10 rounded-lg w-fit">
          <button
            type="button"
            onClick={() => {
              sounds.playClick();
              setActiveTab('overview');
            }}
            className={`px-3.5 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
              activeTab === 'overview'
                ? 'bg-amber-400 text-slate-950 font-bold'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            Overview
          </button>
          <button
            type="button"
            onClick={() => {
              sounds.playClick();
              setActiveTab('history');
            }}
            className={`px-3.5 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
              activeTab === 'history'
                ? 'bg-amber-400 text-slate-950 font-bold'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            History ({historyCount})
          </button>
        </div>

        {activeTab === 'overview' ? (
          <div className="space-y-4 text-xs">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-slate-900/70 border border-white/10 rounded-lg p-3">
                <span className="text-[11px] text-slate-400 block">Tactical</span>
                <span className="text-lg font-bold font-mono tabular-nums text-white">{attrs.tactical}</span>
              </div>
              <div className="bg-slate-900/70 border border-white/10 rounded-lg p-3">
                <span className="text-[11px] text-slate-400 block">Coaching</span>
                <span className="text-lg font-bold font-mono tabular-nums text-white">{attrs.coaching}</span>
              </div>
              <div className="bg-slate-900/70 border border-white/10 rounded-lg p-3">
                <span className="text-[11px] text-slate-400 block">Man Mgmt</span>
                <span className="text-lg font-bold font-mono tabular-nums text-white">{attrs.manManagement}</span>
              </div>
              <div className="bg-slate-900/70 border border-white/10 rounded-lg p-3">
                <span className="text-[11px] text-slate-400 block">Youth Dev</span>
                <span className="text-lg font-bold font-mono tabular-nums text-white">{attrs.youthDevelopment}</span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 border-y border-white/10 py-3">
              <div>
                <span className="text-slate-400 block">Tactical Style</span>
                <span className="font-semibold text-white">{manager.tacticalStyle}</span>
              </div>
              <div>
                <span className="text-slate-400 block">Preferred Formation</span>
                <span className="font-mono font-semibold text-white">{manager.preferredFormation}</span>
              </div>
              <div>
                <span className="text-slate-400 block">Control Appetite</span>
                <span className="font-semibold text-white capitalize">
                  {manager.controlDesire.replace('_', ' ')}
                </span>
              </div>
            </div>

            <p className="text-slate-300 italic font-serif leading-relaxed max-w-[75ch]">
              &ldquo;{manager.profileSnippet}&rdquo;
            </p>

            {!isIncumbent && (
              <div className="bg-slate-900/70 border border-white/10 rounded-xl p-3.5 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Willingness to Join {club.shortName}</span>
                  <span className={willingness.willing ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>
                    {willingness.statusLabel}
                  </span>
                </div>
                {!willingness.willing && willingness.primaryReason && (
                  <p className="text-slate-400">{willingness.primaryReason}</p>
                )}
                <div className="flex items-center justify-between pt-1 border-t border-white/10 text-slate-400">
                  <span>Total Upfront Cost (Fee + 1st Season)</span>
                  <span className="font-mono tabular-nums text-white font-semibold">
                    {formatCurrencyCompact(costs.totalCost)}
                  </span>
                </div>
              </div>
            )}
          </div>
        ) : (
          <ManagerHistoryPanel manager={manager} />
        )}
      </div>
    </Modal>
  );
};
