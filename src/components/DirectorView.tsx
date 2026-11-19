/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowDownCircle,
  ArrowUpCircle,
  Check,
  Clock,
  DollarSign,
  FileSignature,
  Flame,
  Handshake,
  Megaphone,
  Shield,
  TrendingUp,
  UserCheck,
  X,
} from 'lucide-react';
import {
  Club,
  ClubDirector,
  DirectorRequestStatus,
  DirectorRequestType,
  ManagerCareerState,
  Owner,
} from '../types/game';
import { MANAGER_MODE_CONFIG } from '../config/managerModeConfig';
import {
  calculateEffectiveControl,
  calculateManagerSackingCompensation,
  computeClubExpectedPosition,
  DIRECTOR_REQUEST_LABELS,
} from '../services/managerModeService';
import { calculateManagerAnnualWage, formatCurrencyCompact } from '../services/managerService';
import { sounds } from '../services/soundEffects';

interface DirectorViewProps {
  club: Club;
  allClubs: Club[];
  owner: Owner;
  career: ManagerCareerState;
  clubDirector: ClubDirector;
  seasonYear: number;
  currentWeek: number;
  onSubmitRequest: (requestType: DirectorRequestType) => {
    ok: boolean;
    message: string;
    status?: DirectorRequestStatus;
  };
  onRespondCounterOffer: (accept: boolean) => {
    ok: boolean;
    message: string;
  };
}

const REQUEST_ITEMS: Array<{
  type: DirectorRequestType;
  title: string;
  subtitle: string;
  description: string;
  accentClass: string;
  icon: typeof ArrowUpCircle;
}> = [
  {
    type: 'more_power',
    title: 'More Power',
    subtitle: 'Control Request',
    description: 'Ask the Sporting Director for greater influence over signings, sales, and renewals.',
    accentClass: 'text-amber-400',
    icon: ArrowUpCircle,
  },
  {
    type: 'less_power',
    title: 'Less Power',
    subtitle: 'Always Accepted',
    description: 'Hand control back to the Sporting Director. Always accepted and eases friction.',
    accentClass: 'text-sky-400',
    icon: ArrowDownCircle,
  },
  {
    type: 'pay_rise',
    title: 'Pay Rise',
    subtitle: 'Salary Review',
    description: 'Request higher weekly wages based on your reputation and club standing. Can yield a counter-offer.',
    accentClass: 'text-emerald-400',
    icon: DollarSign,
  },
  {
    type: 'new_contract',
    title: 'New Contract',
    subtitle: 'Contract Extension',
    description: 'Negotiate a longer fixed-term deal (up to 5 years) with updated terms or a counter-offer.',
    accentClass: 'text-blue-400',
    icon: FileSignature,
  },
  {
    type: 'transfer_budget',
    title: 'Transfer Budget Increase',
    subtitle: 'Recruitment Funds',
    description: 'Ask the director and ownership to unlock extra transfer budget for the war chest.',
    accentClass: 'text-amber-300',
    icon: TrendingUp,
  },
  {
    type: 'public_backing',
    title: 'Public Backing',
    subtitle: 'Board Pressure Relief',
    description: 'Request a public vote of confidence to lift trust and reduce sacking pressure for 6 weeks.',
    accentClass: 'text-emerald-300',
    icon: Megaphone,
  },
  {
    type: 'mutual_termination',
    title: 'Mutual Termination',
    subtitle: 'No Sacking Penalty',
    description: 'Ask to leave the club by mutual agreement, entering free agency without harming reputation.',
    accentClass: 'text-rose-400',
    icon: Handshake,
  },
];

function getStatusBadgeClass(status: DirectorRequestStatus): string {
  switch (status) {
    case 'accepted':
    case 'counter_accepted':
      return 'bg-emerald-500/15 border-emerald-500/35 text-emerald-300';
    case 'counter_offer':
      return 'bg-amber-500/15 border-amber-500/35 text-amber-300';
    case 'rejected':
    case 'counter_declined':
    default:
      return 'bg-rose-500/15 border-rose-500/35 text-rose-300';
  }
}

function getStatusLabel(status: DirectorRequestStatus): string {
  switch (status) {
    case 'accepted':
      return 'Accepted';
    case 'counter_offer':
      return 'Counter-Offer';
    case 'counter_accepted':
      return 'Counter Accepted';
    case 'counter_declined':
      return 'Counter Declined';
    case 'rejected':
    default:
      return 'Rejected';
  }
}

export const DirectorView: React.FC<DirectorViewProps> = ({
  club,
  allClubs,
  owner,
  career,
  clubDirector,
  seasonYear,
  currentWeek,
  onSubmitRequest,
  onRespondCounterOffer,
}) => {
  const [feedback, setFeedback] = useState<{
    message: string;
    tone: 'positive' | 'warning' | 'negative';
  } | null>(null);

  const dirCfg = MANAGER_MODE_CONFIG.directors[clubDirector.personality];
  const controlModifier = career.controlModifier ?? 0;
  const effectiveControl = calculateEffectiveControl(
    clubDirector.personality,
    career.profile.reputation,
    controlModifier
  );
  const baseControl = dirCfg.baseControl;
  const repBonus = Math.round(career.profile.reputation * dirCfg.reputationBonusMultiplier);
  const currentAbsWeek = seasonYear * 46 + currentWeek;
  const penalty = career.directorReceptivityPenalty ?? 0;
  const publicBackingWeeks = career.publicBackingWeeksRemaining ?? 0;
  const pendingCounter = career.pendingDirectorCounterOffer ?? null;
  const requestHistory = career.directorRequestHistory ?? [];
  const annualWage = calculateManagerAnnualWage(career.weeklyWage);
  const sackingCompensation = calculateManagerSackingCompensation(
    career.weeklyWage,
    career.contractYears,
    club.balance
  );

  const leagueSummary = useMemo(() => {
    const tierClubs = allClubs
      .filter(c => c.tier === club.tier)
      .sort((a, b) => b.points - a.points || b.goalDifference - a.goalDifference || b.goalsFor - a.goalsFor);
    const pos = Math.max(1, tierClubs.findIndex(c => c.id === club.id) + 1);
    const expected = computeClubExpectedPosition(club, tierClubs);
    return { pos, total: tierClubs.length, expected };
  }, [allClubs, club]);

  const handleRequestClick = (type: DirectorRequestType) => {
    const res = onSubmitRequest(type);
    const tone: 'positive' | 'warning' | 'negative' =
      res.status === 'accepted'
        ? 'positive'
        : res.status === 'counter_offer'
          ? 'warning'
          : 'negative';
    setFeedback({ message: res.message, tone });
  };

  const handleCounterResponse = (accept: boolean) => {
    const res = onRespondCounterOffer(accept);
    setFeedback({
      message: res.message,
      tone: res.ok ? 'positive' : 'warning',
    });
  };

  return (
    <div className="space-y-6">
      {/* Header Card (mirrors ManagerView header) */}
      <div className="bg-[#111827] border border-white/10 rounded-xl p-4 sm:p-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold text-amber-400 mb-1">
              <UserCheck className="w-4 h-4 shrink-0" />
              <span>Sporting Director Relations &amp; Contract</span>
            </div>
            <h1 className="text-2xl lg:text-3xl font-extrabold text-white tracking-tight">
              Director Suite &amp; Boardroom Requests
            </h1>
            <p className="text-slate-400 text-xs mt-1 max-w-[75ch]">
              {club.name} · Manager Say:{' '}
              <span className="font-mono tabular-nums text-amber-300 font-semibold">
                {effectiveControl}%
              </span>{' '}
              · Transfer War Chest:{' '}
              <span className="font-mono tabular-nums text-emerald-400 font-semibold">
                {formatCurrencyCompact(club.transferBudget)}
              </span>{' '}
              · Balance:{' '}
              <span className="font-mono tabular-nums text-slate-200 font-semibold">
                {formatCurrencyCompact(club.balance)}
              </span>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 self-start lg:self-auto">
            <div className="px-3.5 py-2 bg-slate-900 border border-white/10 rounded-xl text-xs font-mono">
              <span className="text-slate-400 block text-[10px] uppercase">Contract</span>
              <span
                className={`font-bold tabular-nums ${
                  career.contractYears <= 1 ? 'text-amber-400' : 'text-white'
                }`}
              >
                {career.contractYears} yr{career.contractYears === 1 ? '' : 's'} · £
                {(career.weeklyWage / 1000).toFixed(1)}k/wk
              </span>
            </div>
            <div className="px-3.5 py-2 bg-slate-900 border border-white/10 rounded-xl text-xs font-mono">
              <span className="text-slate-400 block text-[10px] uppercase">Director Mood</span>
              <span
                className={`font-bold tabular-nums ${
                  penalty === 0
                    ? 'text-emerald-400'
                    : penalty <= 15
                      ? 'text-amber-400'
                      : 'text-rose-400'
                }`}
              >
                {penalty === 0
                  ? 'Receptive'
                  : penalty <= 15
                    ? `Cautious (-${penalty})`
                    : `Frustrated (-${penalty})`}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Final-Year Contract Warning Banner */}
      {career.contractYears <= 1 && (
        <div className="bg-amber-950/35 border border-amber-400/40 rounded-xl p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <div className="text-xs text-amber-100 space-y-0.5">
            <span className="font-extrabold uppercase tracking-wider text-amber-300 block">
              Final Year of Contract
            </span>
            <p className="leading-relaxed">
              Your deal with {club.name} expires at the end of the {seasonYear}/{seasonYear + 1}{' '}
              season. Request a <strong className="text-white">New Contract</strong> below or finish
              strongly to earn a season-end renewal offer; otherwise you will become a free agent.
            </p>
          </div>
        </div>
      )}

      {/* Active Public Backing Notice */}
      {publicBackingWeeks > 0 && (
        <div className="bg-emerald-950/30 border border-emerald-500/35 rounded-xl p-4 flex items-start gap-3">
          <Megaphone className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
          <div className="text-xs text-emerald-100 space-y-0.5">
            <span className="font-extrabold uppercase tracking-wider text-emerald-300 block">
              Publicly Backed by {clubDirector.name} ({publicBackingWeeks} week
              {publicBackingWeeks === 1 ? '' : 's'} remaining)
            </span>
            <p className="leading-relaxed">
              The Sporting Director&apos;s public vote of confidence is shielding you from short-term
              board pressure while in place.
            </p>
          </div>
        </div>
      )}

      {/* Feedback Banner */}
      {feedback && (
        <div
          className={`p-4 rounded-xl border text-xs flex items-center justify-between gap-2 ${
            feedback.tone === 'positive'
              ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-200'
              : feedback.tone === 'warning'
                ? 'bg-amber-950/40 border-amber-400/40 text-amber-200'
                : 'bg-rose-950/40 border-rose-500/40 text-rose-200'
          }`}
        >
          <span className="max-w-[80ch] leading-relaxed font-medium">{feedback.message}</span>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            aria-label="Dismiss feedback"
            className="min-h-10 min-w-10 lg:min-h-0 lg:min-w-0 flex items-center justify-center rounded-lg text-slate-300 hover:text-white cursor-pointer shrink-0"
          >
            ✕
          </button>
        </div>
      )}

      {/* Pending Counter-Offer Card */}
      {pendingCounter && (
        <div className="bg-amber-950/30 border border-amber-400/50 rounded-xl p-4 sm:p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <span className="text-xs font-extrabold uppercase tracking-wider text-amber-300 block mb-0.5">
                Counter-Offer Awaiting Your Decision · Week {pendingCounter.week}
              </span>
              <h2 className="text-base sm:text-lg font-extrabold text-white">
                {clubDirector.name} Countered Your{' '}
                {DIRECTOR_REQUEST_LABELS[pendingCounter.requestType]} Request
              </h2>
              <p className="text-xs text-amber-100/90 mt-1">{pendingCounter.message}</p>
            </div>
            <div className="bg-slate-900/90 border border-white/10 rounded-xl px-4 py-2.5 text-xs font-mono shrink-0">
              <span className="text-slate-400 block">Proposed Terms</span>
              <span className="text-sm font-extrabold text-amber-300 tabular-nums">
                {pendingCounter.proposedContractYears} yr
                {pendingCounter.proposedContractYears === 1 ? '' : 's'} · £
                {(pendingCounter.proposedWeeklyWage / 1000).toFixed(1)}k/wk
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={() => {
                sounds.playSigningStamp();
                handleCounterResponse(true);
              }}
              className="min-h-11 px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold text-xs rounded-xl flex items-center gap-1.5 cursor-pointer transition-all active:scale-95"
            >
              <Check className="w-4 h-4" />
              <span>Accept Counter-Offer</span>
            </button>
            <button
              type="button"
              onClick={() => {
                sounds.playClick();
                handleCounterResponse(false);
              }}
              className="min-h-11 px-4 py-2 bg-slate-800 hover:bg-slate-700 border border-white/15 text-slate-200 font-bold text-xs rounded-xl flex items-center gap-1.5 cursor-pointer transition-all active:scale-95"
            >
              <X className="w-4 h-4" />
              <span>Decline &amp; Keep Current Terms</span>
            </button>
          </div>
        </div>
      )}

      {/* Main 3-Column Overview (mirrors ManagerView.tsx) */}
      <div className="bg-[#111827] border border-white/10 rounded-xl p-4 sm:p-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left 2 Cols: Sporting Director Dossier */}
          <div className="lg:col-span-2 space-y-5">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-white/10 pb-4">
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-amber-400 block mb-0.5">
                  Club Sporting Director
                </span>
                <h2 className="text-xl sm:text-2xl font-extrabold text-white">
                  {clubDirector.name}
                </h2>
                <div className="text-xs text-slate-400 mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  <span>{clubDirector.nationality}</span>
                  <span aria-hidden="true">·</span>
                  <span>Age {clubDirector.age}</span>
                  <span aria-hidden="true">·</span>
                  <span className="capitalize">
                    {clubDirector.philosophy.replace('_', ' ')} Philosophy
                  </span>
                </div>
              </div>

              <div className="text-left sm:text-right">
                <span className="text-xs text-slate-400 block">Personality Profile</span>
                <span className="inline-block mt-0.5 px-2.5 py-1 rounded-lg bg-slate-900 border border-amber-400/30 text-amber-300 text-xs font-bold">
                  {dirCfg.label}
                </span>
              </div>
            </div>

            <p className="text-xs leading-relaxed text-slate-300 italic font-serif max-w-[75ch]">
              &ldquo;{dirCfg.description}&rdquo;
            </p>

            {/* Manager Control Meter & Breakdown */}
            <div className="bg-slate-900/70 border border-white/10 rounded-xl p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-bold text-white uppercase tracking-wider">
                  Your Effective Managerial Control
                </span>
                <span className="text-lg font-black font-mono tabular-nums text-amber-400">
                  {effectiveControl}%
                </span>
              </div>
              <div className="w-full bg-slate-800 h-2.5 rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all duration-300 ${
                    effectiveControl >= 75
                      ? 'bg-emerald-400'
                      : effectiveControl >= 35
                        ? 'bg-amber-400'
                        : 'bg-rose-500'
                  }`}
                  style={{ width: `${effectiveControl}%` }}
                />
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1 text-xs font-mono">
                <div>
                  <span className="text-slate-400 block">Director Base</span>
                  <span className="font-bold text-white tabular-nums">{baseControl}%</span>
                </div>
                <div>
                  <span className="text-slate-400 block">Reputation Bonus</span>
                  <span className="font-bold text-blue-400 tabular-nums">+{repBonus}%</span>
                </div>
                <div>
                  <span className="text-slate-400 block">Power Shift</span>
                  <span
                    className={`font-bold tabular-nums ${
                      controlModifier > 0
                        ? 'text-emerald-400'
                        : controlModifier < 0
                          ? 'text-rose-400'
                          : 'text-slate-300'
                    }`}
                  >
                    {controlModifier >= 0 ? `+${controlModifier}%` : `${controlModifier}%`}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block">Effective Cap</span>
                  <span className="font-bold text-slate-200 tabular-nums">
                    {Math.min(100, Math.max(0, dirCfg.effectiveControlCap + Math.max(0, controlModifier)))}%
                  </span>
                </div>
              </div>
            </div>

            {/* Director & Club Alignment Metrics */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-1 text-xs">
              <div className="bg-slate-900/60 border border-white/5 rounded-xl p-3">
                <span className="text-slate-400 block mb-0.5">Signing Focus</span>
                <span className="font-bold text-white capitalize">
                  {clubDirector.signingBias} Targets
                </span>
                <span className="text-[11px] text-slate-500 block mt-0.5">
                  {dirCfg.allowDirectSign
                    ? 'Direct signings enabled'
                    : dirCfg.allowRequests || effectiveControl > 0
                      ? 'Evaluates transfer, sale & renewal requests'
                      : 'Controls all transfers directly'}
                </span>
              </div>

              <div className="bg-slate-900/60 border border-white/5 rounded-xl p-3">
                <span className="text-slate-400 block mb-0.5">League Standing</span>
                <span className="font-bold text-white font-mono tabular-nums">
                  #{leagueSummary.pos} / {leagueSummary.total}
                </span>
                <span className="text-[11px] text-slate-500 block mt-0.5 truncate">
                  Target: {leagueSummary.expected.label}
                </span>
              </div>

              <div className="bg-slate-900/60 border border-white/5 rounded-xl p-3">
                <span className="text-slate-400 block mb-0.5">Ownership Patience</span>
                <span className="font-bold text-white capitalize">{owner.patience}</span>
                <span className="text-[11px] text-slate-500 block mt-0.5 capitalize">
                  {owner.name} · {owner.wealth}
                </span>
              </div>
            </div>
          </div>

          {/* Right Col: Manager Contract & Relationship Status (mirrors ManagerView relationship panel) */}
          <div className="bg-slate-900/70 border border-white/10 rounded-xl p-4 flex flex-col justify-between space-y-4">
            <div className="space-y-4">
              <div>
                <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5 mb-1">
                  <Flame className="w-4 h-4 text-amber-400" />
                  <span>Board &amp; Director Standing</span>
                </span>
                <span className="text-xs text-slate-400 block mb-3">
                  Influenced by match results, reputation ({career.profile.reputation}/100), and recent requests.
                </span>

                <div className="mb-3">
                  <div className="flex items-center justify-between text-xs font-mono tabular-nums mb-1">
                    <span className="text-slate-400">Boardroom Trust</span>
                    <span
                      className={`font-bold ${
                        career.boardTrust > 65
                          ? 'text-emerald-400'
                          : career.boardTrust > 35
                            ? 'text-amber-400'
                            : 'text-rose-400'
                      }`}
                    >
                      {career.boardTrust}%
                    </span>
                  </div>
                  <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                    <div
                      className={`h-full transition-all duration-300 ${
                        career.boardTrust > 65
                          ? 'bg-emerald-400'
                          : career.boardTrust > 35
                            ? 'bg-amber-400'
                            : 'bg-rose-500'
                      }`}
                      style={{ width: `${career.boardTrust}%` }}
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between text-xs border-t border-white/10 pt-3">
                  <span className="text-slate-400">Director Receptivity</span>
                  <span
                    className={`font-mono font-bold ${
                      penalty === 0
                        ? 'text-emerald-400'
                        : penalty <= 15
                          ? 'text-amber-400'
                          : 'text-rose-400'
                    }`}
                  >
                    {penalty === 0 ? 'Normal (0 penalty)' : `Guarded (-${penalty} penalty)`}
                  </span>
                </div>
                {penalty > 0 && (
                  <p className="text-[11px] text-slate-400 mt-1 leading-snug">
                    Repeated rejections make {clubDirector.name} less accommodating. Penalty eases
                    by {MANAGER_MODE_CONFIG.directorRequests.weeklyPenaltyDecay} pts per simulated week.
                  </p>
                )}
              </div>

              {/* Contract Box */}
              <div className="border-t border-white/10 pt-4 space-y-2.5 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                    <Shield className="w-3.5 h-3.5 text-amber-400" />
                    <span>Your Manager Contract</span>
                  </span>
                  {career.contractYears <= 1 && (
                    <span className="px-2 py-0.5 rounded bg-amber-500/20 border border-amber-400/40 text-amber-300 text-[10px] font-bold uppercase">
                      Final Year
                    </span>
                  )}
                </div>

                <div className="flex items-center justify-between text-slate-300">
                  <span className="text-slate-400">Length Remaining</span>
                  <span className="font-mono font-bold text-white tabular-nums">
                    {career.contractYears} Season{career.contractYears === 1 ? '' : 's'}
                  </span>
                </div>

                <div className="flex items-center justify-between text-slate-300">
                  <span className="text-slate-400">Weekly Wage</span>
                  <span className="font-mono font-bold text-emerald-400 tabular-nums">
                    £{(career.weeklyWage / 1000).toFixed(1)}k/wk
                  </span>
                </div>

                <div className="flex items-center justify-between text-slate-300">
                  <span className="text-slate-400">Annual Value</span>
                  <span className="font-mono font-bold text-slate-200 tabular-nums">
                    {formatCurrencyCompact(annualWage)}/yr
                  </span>
                </div>
              </div>
            </div>

            <div className="pt-3 border-t border-white/10 text-xs space-y-1">
              <div className="flex items-center justify-between text-slate-400">
                <span>Sacking Compensation</span>
                <span className="font-mono tabular-nums font-bold text-white">
                  {formatCurrencyCompact(sackingCompensation)}
                </span>
              </div>
              <div className="text-[11px] text-slate-500">
                Paid by {club.shortName} if dismissed before your contract expires. Mutual termination waives severance with 0 rep penalty.
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Director Requests Grid (mirrors BoardroomView petitions) */}
      <div className="bg-[#111827] border border-white/10 rounded-xl p-4 sm:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-white/10 pb-3">
          <div>
            <h2 className="text-sm font-bold text-white">Submit Request to {clubDirector.name}</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Each request has an individual cooldown and is weighed against personality, reputation, recent results, and board patience.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {REQUEST_ITEMS.map(item => {
            const Icon = item.icon;
            const cooldownUntil = career.directorRequestCooldowns?.[item.type] ?? 0;
            const cooldownLeft = Math.max(0, cooldownUntil - currentAbsWeek);

            let extraBlockReason: string | null = null;
            if (pendingCounter) {
              extraBlockReason = 'Resolve counter-offer first';
            } else if (
              item.type === 'more_power' &&
              (effectiveControl >= 100 ||
                controlModifier >= MANAGER_MODE_CONFIG.directorRequests.maxPowerModifier)
            ) {
              extraBlockReason = 'At maximum control';
            } else if (item.type === 'less_power' && effectiveControl <= 0) {
              extraBlockReason = 'Already at 0% control';
            }

            const isDisabled = cooldownLeft > 0 || Boolean(extraBlockReason);

            return (
              <button
                key={item.type}
                type="button"
                disabled={isDisabled}
                onClick={() => handleRequestClick(item.type)}
                className="bg-slate-900/60 hover:bg-slate-900 border border-white/10 hover:border-amber-400/40 disabled:opacity-55 disabled:cursor-not-allowed rounded-xl p-4 text-left transition-all cursor-pointer group flex flex-col justify-between gap-3 min-h-[132px]"
              >
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className={`text-xs font-bold flex items-center gap-1.5 ${item.accentClass}`}>
                      <Icon className="w-4 h-4 shrink-0" />
                      <span>{item.subtitle}</span>
                    </span>

                    {cooldownLeft > 0 ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-800 border border-white/10 text-[10px] font-mono text-amber-300 shrink-0">
                        <Clock className="w-3 h-3" />
                        <span>{cooldownLeft}w</span>
                      </span>
                    ) : extraBlockReason ? (
                      <span className="px-2 py-0.5 rounded bg-slate-800 border border-white/10 text-[10px] font-mono text-slate-400 shrink-0">
                        {extraBlockReason}
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/25 text-[10px] font-mono text-emerald-300 shrink-0">
                        Ready
                      </span>
                    )}
                  </div>

                  <h3 className="text-sm font-extrabold text-white group-hover:text-amber-300 transition-colors">
                    {item.title}
                  </h3>
                  <p className="text-xs text-slate-400 leading-relaxed">{item.description}</p>
                </div>

                <div className="pt-2 border-t border-white/5 flex items-center justify-between text-[11px] font-mono text-slate-400">
                  <span>
                    Cooldown: {MANAGER_MODE_CONFIG.directorRequests.cooldownWeeks[item.type]} wks
                  </span>
                  {!isDisabled && (
                    <span className="text-amber-400 font-bold group-hover:translate-x-0.5 transition-transform">
                      Send Request →
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Request Status Log */}
      <div className="bg-[#111827] border border-white/10 rounded-xl p-4 sm:p-6 space-y-3">
        <div className="flex items-center justify-between gap-2 border-b border-white/10 pb-3">
          <h2 className="text-sm font-bold text-white">Recent Request Log</h2>
          <span className="text-xs font-mono text-slate-400">
            {requestHistory.length} recorded
          </span>
        </div>

        {requestHistory.length === 0 ? (
          <p className="text-xs text-slate-400 py-3">
            No requests submitted to {clubDirector.name} yet this spell.
          </p>
        ) : (
          <div className="space-y-2">
            {requestHistory.map(rec => (
              <div
                key={rec.id}
                className="bg-slate-900/70 border border-white/10 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
              >
                <div className="space-y-0.5 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-bold text-white">
                      {DIRECTOR_REQUEST_LABELS[rec.type]}
                    </span>
                    <span className="text-[11px] font-mono text-slate-400">
                      {rec.seasonYear}/{rec.seasonYear + 1} · Wk {rec.week}
                    </span>
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed">{rec.message}</p>
                </div>

                <span
                  className={`px-2.5 py-1 rounded-lg border text-[11px] font-bold uppercase shrink-0 self-start sm:self-center ${getStatusBadgeClass(
                    rec.status
                  )}`}
                >
                  {getStatusLabel(rec.status)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
