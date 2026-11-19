/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { Club, Director, Manager, Owner } from '../types/game';
import { Modal } from './ui/Modal';
import { AlertTriangle, CheckCircle2, UserCheck, XCircle } from 'lucide-react';
import {
  calculateHiringCosts,
  deriveManagerAttributes,
  evaluateManagerWillingness,
  executeHireManager,
  formatCurrencyCompact,
} from '../services/managerService';
import { sounds } from '../services/soundEffects';

interface HireManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  candidate: Manager | null;
  club: Club;
  allClubs: Club[];
  owner: Owner;
  director: Director;
  seasonYear?: number;
  currentWeek?: number;
  onConfirmHire: (
    newManager: Manager,
    updatedDirector: Director,
    updatedClub: Club,
    updatedOwner: Owner,
    updatedRivalClub?: Club
  ) => void;
}

export const HireManagerModal: React.FC<HireManagerModalProps> = ({
  isOpen,
  onClose,
  candidate,
  club,
  allClubs,
  owner,
  director,
  seasonYear = 2026,
  currentWeek = 1,
  onConfirmHire,
}) => {
  const [offeredWage, setOfferedWage] = useState<number>(candidate?.wage ?? 10000);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (candidate) {
      setOfferedWage(candidate.wage);
      setSubmitError(null);
    }
  }, [candidate]);

  const rivalClub = useMemo(() => {
    if (!candidate?.clubId || candidate.clubId === club.id) return undefined;
    return allClubs.find(c => c.id === candidate.clubId);
  }, [candidate, allClubs, club.id]);

  if (!candidate) return null;

  const attrs = candidate.attributes ?? deriveManagerAttributes(candidate);
  const minSliderWage = Math.max(2000, Math.round((candidate.wage * 0.6) / 500) * 500);
  const maxSliderWage = Math.max(minSliderWage + 10000, Math.round((candidate.wage * 1.6) / 500) * 500);
  const stepSize = candidate.wage >= 50000 ? 2500 : 500;

  const costs = calculateHiringCosts(candidate, offeredWage);
  const willingness = evaluateManagerWillingness(candidate, club, owner, costs.offeredWeeklyWage, rivalClub);

  const hasExistingManager = club.managerId !== null;
  const isCurrentIncumbent = candidate.clubId === club.id;
  const hasEnoughBudget = club.balance >= costs.totalCost;
  const shortfall = Math.max(0, costs.totalCost - club.balance);

  const canAppoint = !isCurrentIncumbent && !hasExistingManager && hasEnoughBudget && willingness.willing;

  const handleAppoint = () => {
    const res = executeHireManager({
      club,
      manager: candidate,
      offeredWeeklyWage: costs.offeredWeeklyWage,
      owner,
      director,
      rivalClub,
      seasonYear,
      currentWeek,
    });

    if (!res.ok) {
      sounds.playCrisis();
      setSubmitError(res.error);
      return;
    }

    sounds.playSigningStamp();
    onConfirmHire(res.updatedManager, res.updatedDirector, res.updatedClub, res.updatedOwner, res.updatedRivalClub);
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      maxWidthClass="max-w-2xl"
      ariaLabel={`Negotiate appointment with ${candidate.name}`}
      header={
        <div>
          <span className="text-xs font-semibold text-amber-400 block mb-0.5">
            Head Coach Appointment & Terms
          </span>
          <h2 className="text-xl font-extrabold text-white tracking-tight">
            {candidate.name}
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            {candidate.nationality} · Age {candidate.age} · Reputation {candidate.reputation}/100 ·{' '}
            {rivalClub ? `Currently at ${rivalClub.name}` : isCurrentIncumbent ? `Current Manager at ${club.name}` : 'Free agent'}
          </p>
        </div>
      }
      footer={
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="text-xs text-slate-400 font-mono tabular-nums">
            Total Upfront:{' '}
            <strong className={hasEnoughBudget ? 'text-white' : 'text-rose-400'}>
              {formatCurrencyCompact(costs.totalCost)}
            </strong>{' '}
            <span>/ Treasury {formatCurrencyCompact(club.balance)}</span>
          </div>
          <div className="flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 min-h-11 lg:min-h-0 rounded-lg border border-white/10 text-xs font-semibold text-slate-300 hover:text-white hover:bg-white/5 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!canAppoint}
              onClick={handleAppoint}
              className="px-5 py-2 min-h-11 lg:min-h-0 rounded-lg bg-amber-400 hover:bg-amber-300 disabled:bg-slate-800 disabled:text-slate-500 disabled:border disabled:border-white/10 text-slate-950 font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer disabled:cursor-not-allowed"
            >
              <UserCheck className="w-4 h-4" />
              <span>Appoint Manager</span>
            </button>
          </div>
        </div>
      }
    >
      <div className="space-y-5">
        {/* Coaching Attributes & Tactical Profile */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          <div className="bg-slate-900/80 border border-white/10 rounded-lg p-3">
            <span className="text-[11px] text-slate-400 block">Tactical</span>
            <span className="text-lg font-bold font-mono tabular-nums text-white">{attrs.tactical}</span>
          </div>
          <div className="bg-slate-900/80 border border-white/10 rounded-lg p-3">
            <span className="text-[11px] text-slate-400 block">Coaching</span>
            <span className="text-lg font-bold font-mono tabular-nums text-white">{attrs.coaching}</span>
          </div>
          <div className="bg-slate-900/80 border border-white/10 rounded-lg p-3">
            <span className="text-[11px] text-slate-400 block">Man Mgmt</span>
            <span className="text-lg font-bold font-mono tabular-nums text-white">{attrs.manManagement}</span>
          </div>
          <div className="bg-slate-900/80 border border-white/10 rounded-lg p-3">
            <span className="text-[11px] text-slate-400 block">Youth Dev</span>
            <span className="text-lg font-bold font-mono tabular-nums text-white">{attrs.youthDevelopment}</span>
          </div>
        </div>

        <div className="text-xs text-slate-300 flex flex-wrap items-center gap-x-3 gap-y-1 border-y border-white/10 py-2.5">
          <span>
            Style: <strong className="text-white">{candidate.tacticalStyle}</strong>
          </span>
          <span aria-hidden="true" className="text-slate-600">·</span>
          <span>
            Formation: <strong className="font-mono text-white">{candidate.preferredFormation}</strong>
          </span>
          <span aria-hidden="true" className="text-slate-600">·</span>
          <span>
            Control: <strong className="text-white capitalize">{candidate.controlDesire.replace('_', ' ')}</strong>
          </span>
        </div>

        {rivalClub && (
          <div className="p-3 rounded-lg bg-slate-900/80 border border-white/10 text-xs text-slate-300">
            Poaching from <strong className="text-white">{rivalClub.name}</strong> requires no extra compensation beyond the standard signing fee. {rivalClub.shortName} will appoint a replacement within 1–4 weeks.
          </div>
        )}

        {/* Wage Offer Controls */}
        <div className="bg-slate-900/70 border border-white/10 rounded-xl p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <label htmlFor="wage-offer-slider" className="text-xs font-bold text-white block">
                Weekly Wage Offer
              </label>
              <span className="text-xs text-slate-400">
                Manager demand: <span className="font-mono tabular-nums text-slate-200">£{(candidate.wage / 1000).toFixed(1)}k/wk</span>
              </span>
            </div>
            <div className="text-right">
              <span className="text-lg font-bold font-mono tabular-nums text-amber-400">
                £{(costs.offeredWeeklyWage / 1000).toFixed(1)}k/wk
              </span>
              <span className="text-[11px] text-slate-400 font-mono tabular-nums block">
                {formatCurrencyCompact(costs.firstSeasonWage)} / year
              </span>
            </div>
          </div>

          <input
            id="wage-offer-slider"
            type="range"
            min={minSliderWage}
            max={maxSliderWage}
            step={stepSize}
            value={Math.min(maxSliderWage, Math.max(minSliderWage, costs.offeredWeeklyWage))}
            onChange={e => {
              setSubmitError(null);
              setOfferedWage(Number(e.target.value));
            }}
            className="w-full accent-amber-400 cursor-pointer"
          />

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setOfferedWage(Math.max(minSliderWage, costs.offeredWeeklyWage - stepSize * 2))}
              className="px-2.5 py-1.5 rounded-md bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-mono text-slate-300 cursor-pointer"
            >
              -{formatCurrencyCompact(stepSize * 2)}
            </button>
            <button
              type="button"
              onClick={() => setOfferedWage(candidate.wage)}
              className="px-2.5 py-1.5 rounded-md bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-semibold text-amber-300 cursor-pointer"
            >
              Match Demand (£{(candidate.wage / 1000).toFixed(1)}k)
            </button>
            <button
              type="button"
              onClick={() => setOfferedWage(Math.round((candidate.wage * 1.15) / 500) * 500)}
              className="px-2.5 py-1.5 rounded-md bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-mono text-slate-300 cursor-pointer"
            >
              +15% Offer
            </button>
            <button
              type="button"
              onClick={() => setOfferedWage(Math.round((candidate.wage * 1.25) / 500) * 500)}
              className="px-2.5 py-1.5 rounded-md bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-mono text-slate-300 cursor-pointer"
            >
              +25% Offer
            </button>
          </div>
        </div>

        {/* Financial Summary */}
        <div className="bg-slate-900/70 border border-white/10 rounded-xl p-4 space-y-2 text-xs">
          <div className="flex items-center justify-between text-slate-300">
            <span>Signing Fee (25% annual demand × rep scale)</span>
            <span className="font-mono tabular-nums font-semibold text-white">
              {formatCurrencyCompact(costs.signingFee)}
            </span>
          </div>
          <div className="flex items-center justify-between text-slate-300">
            <span>First Season Wage Commitment (52 wks)</span>
            <span className="font-mono tabular-nums font-semibold text-white">
              {formatCurrencyCompact(costs.firstSeasonWage)}
            </span>
          </div>
          <div className="flex items-center justify-between pt-2 border-t border-white/10 font-bold">
            <span className="text-white">Total Upfront Cost</span>
            <span className={`font-mono tabular-nums ${hasEnoughBudget ? 'text-amber-400' : 'text-rose-400'}`}>
              {formatCurrencyCompact(costs.totalCost)}
            </span>
          </div>
          <div className="flex items-center justify-between text-slate-400">
            <span>Club Treasury Balance</span>
            <span className={`font-mono tabular-nums font-semibold ${hasEnoughBudget ? 'text-emerald-400' : 'text-rose-400'}`}>
              {formatCurrencyCompact(club.balance)}
            </span>
          </div>
        </div>

        {/* Willingness Check & Blocking Guards */}
        <div
          className={`p-3.5 rounded-xl border text-xs space-y-1.5 ${
            willingness.willing
              ? 'bg-emerald-950/25 border-emerald-500/30 text-emerald-200'
              : 'bg-rose-950/25 border-rose-500/30 text-rose-200'
          }`}
        >
          <div className="font-bold flex items-center gap-1.5">
            {willingness.willing ? (
              <>
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Willingness Check Passed — {candidate.name} is prepared to join {club.name}</span>
              </>
            ) : (
              <>
                <XCircle className="w-4 h-4 text-rose-400 shrink-0" />
                <span>Manager Refusal — {willingness.statusLabel}</span>
              </>
            )}
          </div>
          {!willingness.willing && (
            <ul className="list-disc pl-5 space-y-1 text-rose-300">
              {willingness.reasons.map((reason, idx) => (
                <li key={idx}>{reason}</li>
              ))}
            </ul>
          )}
        </div>

        {!hasEnoughBudget && (
          <div className="p-3 rounded-xl bg-rose-950/30 border border-rose-500/30 text-xs text-rose-300 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <span>
              Insufficient Club Treasury Balance: short by <strong className="font-mono tabular-nums">{formatCurrencyCompact(shortfall)}</strong> to cover the signing fee and first season&apos;s wage.
            </span>
          </div>
        )}

        {hasExistingManager && !isCurrentIncumbent && (
          <div className="p-3 rounded-xl bg-amber-950/30 border border-amber-500/30 text-xs text-amber-200 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <span>
              A club can only employ one manager at a time. Sack your current Head Coach first before appointing {candidate.name}.
            </span>
          </div>
        )}

        {submitError && (
          <div className="p-3 rounded-xl bg-rose-950/40 border border-rose-500/40 text-xs text-rose-200">
            {submitError}
          </div>
        )}
      </div>
    </Modal>
  );
};
