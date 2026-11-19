/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  Briefcase,
  Award,
  Trophy,
  Building2,
  ArrowRight,
  LogOut,
  ShieldAlert,
  TrendingUp,
  TrendingDown,
  FileText,
  FastForward,
  Check,
} from 'lucide-react';
import {
  Club,
  ManagerCareerState,
  ManagerJobOffer,
  ManagerSeasonRecord,
} from '../types/game';
import { MANAGER_MODE_CONFIG } from '../config/managerModeConfig';
import { Modal } from './ui/Modal';
import { ManagerSeasonReviewModal } from './ManagerSeasonReviewModal';
import { sounds } from '../services/soundEffects';

interface ManagerOffersModalProps {
  career: ManagerCareerState;
  currentClub: Club | undefined;
  seasonYear: number;
  currentWeek: number;
  isSackedUnemployment?: boolean;
  onStayAtClub?: () => void;
  onDeclineRenewalAndLeave?: () => void;
  onAcceptOffer: (offer: ManagerJobOffer) => void;
  onSimulateWhileUnemployed?: () => void;
  onBecomeSportingDirector: () => void;
  onRetire: () => void;
}

export const ManagerOffersModal: React.FC<ManagerOffersModalProps> = ({
  career,
  currentClub,
  seasonYear,
  currentWeek,
  isSackedUnemployment = false,
  onStayAtClub,
  onDeclineRenewalAndLeave,
  onAcceptOffer,
  onSimulateWhileUnemployed,
  onBecomeSportingDirector,
  onRetire,
}) => {
  const [inspectRecord, setInspectRecord] = useState<ManagerSeasonRecord | null>(null);

  const pendingEnd = career.pendingSeasonEnd;
  const offers = pendingEnd?.offers ?? career.activeOffers;
  const record = pendingEnd?.record ?? null;
  const sackedBanner = career.sackedBanner;
  const contractExpired = Boolean(pendingEnd?.contractExpired);
  const renewalOffer = pendingEnd?.renewalOffer;

  const isSeasonEndFlow = Boolean(pendingEnd && record);
  const canStayAtClub =
    isSeasonEndFlow &&
    Boolean(currentClub) &&
    Boolean(onStayAtClub) &&
    (!contractExpired || Boolean(renewalOffer?.offered));

  return (
    <>
      <Modal
        isOpen={true}
        dismissible={false}
        showCloseButton={false}
        maxWidthClass="max-w-4xl"
        borderClass={isSackedUnemployment ? 'border-rose-500/40' : 'border-amber-400/40'}
        backdropClass="bg-[#070a0f]/95"
        ariaLabel={isSeasonEndFlow ? 'End of Season Review and Offers' : 'Unemployed Manager Offer Hub'}
        header={
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <span
                className={`text-xs font-bold uppercase tracking-wider block mb-0.5 ${
                  isSackedUnemployment ? 'text-rose-400' : 'text-amber-400'
                }`}
              >
                {isSeasonEndFlow
                  ? `Season ${seasonYear}/${seasonYear + 1} Board Review & Offers`
                  : `Free Agent Manager · Season ${seasonYear}/${seasonYear + 1} Week ${currentWeek}`}
              </span>
              <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">
                {isSeasonEndFlow
                  ? record!.wasSacked
                    ? 'Dismissed & Off-Season Offers'
                    : `End of Season Review — ${record!.clubName}`
                  : 'Available Managerial Offers'}
              </h2>
            </div>

            <div className="flex items-center gap-3 bg-slate-900 border border-white/10 rounded-xl px-4 py-2 shrink-0">
              <div>
                <span className="text-[10px] uppercase tracking-wider text-slate-400 block">
                  Reputation
                </span>
                <span className="text-lg font-black font-mono text-amber-400 tabular-nums">
                  {career.profile.reputation} / 100
                </span>
              </div>
              <div className="h-8 w-px bg-white/10" />
              <div>
                <span className="text-[10px] uppercase tracking-wider text-slate-400 block">
                  Age
                </span>
                <span className="text-lg font-black font-mono text-white tabular-nums">
                  {career.profile.age}
                </span>
              </div>
            </div>
          </div>
        }
        footer={
          <div className="flex flex-wrap items-center justify-between gap-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  sounds.playClick();
                  onBecomeSportingDirector();
                }}
                className="min-h-11 px-4 py-2.5 bg-blue-500/15 hover:bg-blue-500/25 border border-blue-500/35 text-blue-300 font-bold text-xs rounded-xl flex items-center gap-1.5 cursor-pointer transition-all active:scale-95"
              >
                <Building2 className="w-4 h-4" />
                <span>Become Sporting Director</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  sounds.playCrisis();
                  onRetire();
                }}
                className="min-h-11 px-4 py-2.5 bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/35 text-rose-300 font-bold text-xs rounded-xl flex items-center gap-1.5 cursor-pointer transition-all active:scale-95"
              >
                <LogOut className="w-4 h-4" />
                <span>Retire from Management</span>
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2 ml-auto">
              {!isSeasonEndFlow && !currentClub && onSimulateWhileUnemployed && (
                <button
                  type="button"
                  onClick={() => {
                    sounds.playClick();
                    onSimulateWhileUnemployed();
                  }}
                  className="min-h-11 px-4 py-2.5 bg-slate-800 hover:bg-slate-700 border border-white/15 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 cursor-pointer transition-all active:scale-95"
                >
                  <FastForward className="w-4 h-4 text-amber-400" />
                  <span>{currentWeek <= 46 ? 'Simulate Next Week' : 'Advance to Season End'}</span>
                </button>
              )}

              {isSeasonEndFlow && currentClub && contractExpired && onDeclineRenewalAndLeave && (
                <button
                  type="button"
                  onClick={() => {
                    sounds.playClick();
                    onDeclineRenewalAndLeave();
                  }}
                  className="min-h-11 px-4 py-2.5 bg-slate-800 hover:bg-slate-700 border border-white/15 text-slate-200 font-bold text-xs rounded-xl flex items-center gap-1.5 cursor-pointer transition-all active:scale-95"
                >
                  <span>
                    {renewalOffer?.offered
                      ? 'Decline Renewal & Enter Free Agency'
                      : 'Enter Free Agency & Start Next Season'}
                  </span>
                </button>
              )}

              {canStayAtClub && currentClub && onStayAtClub && (
                <button
                  type="button"
                  onClick={() => {
                    sounds.playFanfare();
                    onStayAtClub();
                  }}
                  className="min-h-11 px-5 py-2.5 bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-slate-950 font-extrabold text-xs rounded-xl shadow-lg flex items-center gap-1.5 cursor-pointer transition-all active:scale-95"
                >
                  <Check className="w-4 h-4" />
                  <span>
                    {contractExpired && renewalOffer?.offered
                      ? `Renew (${renewalOffer.contractYears}y) & Stay at ${currentClub.shortName}`
                      : `Stay at ${currentClub.shortName} & Start Next Season`}
                  </span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        }
      >
        <div className="space-y-5">
          {/* Sacked Notice */}
          {sackedBanner && (
            <div className="bg-rose-950/40 border border-rose-500/35 rounded-xl p-4 flex items-start gap-3">
              <ShieldAlert className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <span className="text-xs font-extrabold uppercase tracking-wider text-rose-300 block">
                  Dismissed by {sackedBanner.clubName} (Week {sackedBanner.week})
                </span>
                <p className="text-xs text-rose-100/90 leading-relaxed">{sackedBanner.reason}</p>
                {typeof sackedBanner.compensation === 'number' && sackedBanner.compensation > 0 && (
                  <p className="text-xs font-mono font-bold text-emerald-300">
                    Mid-Contract Compensation Paid: £{(sackedBanner.compensation / 1000000).toFixed(2)}M
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Contract Expiry Notice (at season end when remaining contract hits 0) */}
          {isSeasonEndFlow && contractExpired && renewalOffer && (
            <div
              className={`rounded-xl p-4 border space-y-1.5 ${
                renewalOffer.offered
                  ? 'bg-emerald-950/35 border-emerald-500/40'
                  : 'bg-amber-950/35 border-amber-400/40'
              }`}
            >
              <span
                className={`text-xs font-extrabold uppercase tracking-wider block ${
                  renewalOffer.offered ? 'text-emerald-300' : 'text-amber-300'
                }`}
              >
                {renewalOffer.offered
                  ? 'Contract Expired — Renewal Offer on the Table'
                  : 'Contract Expired — Club Declined Renewal'}
              </span>
              <p className="text-xs text-slate-200 leading-relaxed">{renewalOffer.reason}</p>
              {renewalOffer.offered && (
                <p className="text-xs font-mono font-bold text-white">
                  Offered Renewal: {renewalOffer.contractYears} Year
                  {renewalOffer.contractYears === 1 ? '' : 's'} at £
                  {(renewalOffer.weeklyWage / 1000).toFixed(1)}k/wk
                </p>
              )}
            </div>
          )}

          {/* Season-End Summary Box */}
          {isSeasonEndFlow && record && (
            <div className="bg-slate-900/90 border border-white/10 rounded-2xl p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span
                    className="w-4 h-4 rounded-full shrink-0 border border-white/20"
                    style={{ backgroundColor: record.primaryColor }}
                  />
                  <div>
                    <h3 className="text-sm font-extrabold text-white">
                      {record.clubName} · Finished #{record.leaguePosition}/{record.totalTeams} ({record.leaguePoints} pts)
                    </h3>
                    <p className="text-xs text-slate-400 font-mono">
                      {record.won}W-{record.drawn}D-{record.lost}L
                      {record.trophiesWon.length > 0 ? ` · Trophy: ${record.trophiesWon.join(', ')}` : ''}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    sounds.playClick();
                    setInspectRecord(record);
                  }}
                  className="min-h-11 px-3.5 py-2 bg-white/5 hover:bg-white/10 border border-white/10 text-amber-300 text-xs font-bold rounded-xl flex items-center gap-1.5 cursor-pointer"
                >
                  <FileText className="w-4 h-4" />
                  <span>View Full Season Review</span>
                </button>
              </div>

              <p className="text-xs text-slate-200 leading-relaxed">{record.review.boardVerdict}</p>

              <div className="flex flex-wrap items-center gap-2 pt-1 text-xs font-mono">
                <span className="text-slate-400">Reputation Impact:</span>
                <span
                  className={`font-bold inline-flex items-center gap-1 ${
                    record.review.reputationDelta > 0
                      ? 'text-emerald-400'
                      : record.review.reputationDelta < 0
                        ? 'text-rose-400'
                        : 'text-slate-300'
                  }`}
                >
                  {record.review.reputationDelta > 0 ? (
                    <TrendingUp className="w-3.5 h-3.5" />
                  ) : record.review.reputationDelta < 0 ? (
                    <TrendingDown className="w-3.5 h-3.5" />
                  ) : null}
                  {record.review.reputationBefore} → {record.review.reputationAfter} (
                  {record.review.reputationDelta >= 0
                    ? `+${record.review.reputationDelta}`
                    : record.review.reputationDelta}
                  )
                </span>
              </div>
            </div>
          )}

          {/* Club Approaches */}
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                <Briefcase className="w-4 h-4" />
                <span>Club Approaches ({offers.length})</span>
              </h3>
              <span className="text-[11px] text-slate-400">
                {currentClub
                  ? 'Accept a new challenge below or decide your current contract'
                  : 'Free agent — accept any offer below to sign a new fixed-term contract'}
              </span>
            </div>

            {offers.length === 0 ? (
              <div className="bg-slate-900/70 border border-white/10 rounded-xl p-6 text-center text-xs text-slate-400">
                No new approaches this week. Stay in your current post or advance to receive fresh inquiries.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {offers.map(offer => {
                  const dirCfg = MANAGER_MODE_CONFIG.directors[offer.directorPersonality];
                  const tierName =
                    offer.clubTier === 1
                      ? 'Premier League'
                      : offer.clubTier === 2
                        ? 'Championship'
                        : 'League One';

                  return (
                    <div
                      key={offer.id}
                      className="bg-slate-900/90 border border-white/10 hover:border-amber-400/40 rounded-2xl p-4 flex flex-col justify-between gap-3 transition-colors"
                    >
                      <div className="space-y-2.5">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span
                              className="w-3.5 h-3.5 rounded-full shrink-0 border border-white/20"
                              style={{ backgroundColor: offer.primaryColor }}
                            />
                            <div className="min-w-0">
                              <h4 className="text-sm font-extrabold text-white truncate">
                                {offer.clubName}
                              </h4>
                              <span className="text-[11px] font-mono text-slate-400 block">
                                {tierName} · #{offer.leaguePosition} · Prestige {offer.clubPrestige}
                              </span>
                            </div>
                          </div>
                          {offer.isEmergencyOffer && (
                            <span className="px-2 py-0.5 rounded bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-[10px] font-bold uppercase shrink-0">
                              Lifeline
                            </span>
                          )}
                        </div>

                        <p className="text-xs text-slate-300 leading-relaxed">{offer.reason}</p>

                        <div className="grid grid-cols-2 gap-2 text-[11px] font-mono bg-slate-950/60 border border-white/5 rounded-xl p-2.5">
                          <div>
                            <span className="text-slate-500 block">Director</span>
                            <span className="text-white font-semibold truncate block">
                              {offer.directorName}
                            </span>
                            <span className="text-amber-300">{dirCfg.shortLabel} ({offer.effectiveControl}% say)</span>
                          </div>
                          <div>
                            <span className="text-slate-500 block">Board Patience</span>
                            <span className="text-white font-semibold capitalize">{offer.patience}</span>
                            <span className="text-slate-400 block truncate">{offer.expectation}</span>
                          </div>
                          <div>
                            <span className="text-slate-500 block">Contract Offered</span>
                            <span className="text-emerald-400 font-bold tabular-nums">
                              {offer.offeredContractYears ?? 2}y · £
                              {((offer.offeredWeeklyWage ?? 15000) / 1000).toFixed(1)}k/wk
                            </span>
                          </div>
                          <div>
                            <span className="text-slate-500 block">War Chest / Squad</span>
                            <span className="text-slate-200 font-bold tabular-nums">
                              £{(offer.transferBudget / 1000000).toFixed(1)}M · {offer.squadSize} ply
                            </span>
                          </div>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          sounds.playFanfare();
                          onAcceptOffer(offer);
                        }}
                        className="w-full min-h-11 px-4 py-2.5 bg-amber-400/15 hover:bg-amber-400 hover:text-slate-950 border border-amber-400/40 text-amber-300 font-extrabold text-xs rounded-xl flex items-center justify-center gap-1.5 cursor-pointer transition-all active:scale-95"
                      >
                        <Award className="w-4 h-4" />
                        <span>Accept Offer & Manage {offer.clubName}</span>
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </Modal>

      <ManagerSeasonReviewModal
        record={inspectRecord}
        onClose={() => setInspectRecord(null)}
      />
    </>
  );
};
