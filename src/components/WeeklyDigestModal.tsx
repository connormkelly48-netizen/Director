/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { WeeklyDigest, Club, Director, Owner, Manager } from '../types/game';
import { Newspaper, Building2, TrendingUp, AlertTriangle, ArrowRight, Activity, UserPlus, GraduationCap } from 'lucide-react';
import { sounds } from '../services/soundEffects';
import { Modal } from './ui/Modal';

interface WeeklyDigestModalProps {
  digest: WeeklyDigest;
  club: Club | undefined;
  allClubs: Club[];
  director: Director;
  owner: Owner | undefined;
  manager: Manager | undefined;
  onClose: () => void;
}

export const WeeklyDigestModal: React.FC<WeeklyDigestModalProps> = ({
  digest,
  club,
  allClubs,
  director,
  onClose,
}) => {
  const match = digest.playerMatch;
  const isHome = match && club ? match.homeClubId === club.id : false;
  const opponentClub = match && club
    ? allClubs.find(c => c.id === (isHome ? match.awayClubId : match.homeClubId))
    : undefined;

  const myGoals = match ? (isHome ? match.homeScore : match.awayScore) : 0;
  const oppGoals = match ? (isHome ? match.awayScore : match.homeScore) : 0;
  const isWin = myGoals > oppGoals;
  const isLoss = myGoals < oppGoals;

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      maxWidthClass="max-w-3xl"
      ariaLabel="The Sunday Executive Review"
      header={
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="p-2 bg-amber-400/10 border border-amber-400/20 rounded-lg text-amber-400 shrink-0">
              <Newspaper className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="text-xs sm:text-[11px] font-bold tracking-wider uppercase text-amber-400">
                Matchday {digest.week} · Boardroom & Media Dispatch
              </div>
              <h3 className="text-lg sm:text-xl font-extrabold text-white">
                The Sunday Executive Review
              </h3>
            </div>
          </div>
          <div className="text-left sm:text-right shrink-0">
            <span className="text-xs text-slate-400 block font-mono">Season {digest.seasonYear}/{digest.seasonYear + 1}</span>
            <span className="text-xs font-semibold text-slate-300">{club?.name}</span>
          </div>
        </div>
      }
      footer={
        <div className="flex items-center justify-end">
          <button
            type="button"
            onClick={() => {
              sounds.playClick();
              onClose();
            }}
            className="w-full sm:w-auto min-h-11 px-6 py-2.5 bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-slate-950 font-extrabold text-xs rounded-xl shadow-lg shadow-amber-500/20 flex items-center justify-center gap-2 cursor-pointer transition-all active:scale-95"
          >
            <span>Proceed to Boardroom</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      }
    >
      <div className="space-y-5">
        {/* Manager Autonomous Signing Spotlight */}
        {digest.managerSigning && (
          <div className="bg-gradient-to-r from-amber-500/15 via-slate-900/90 to-amber-500/5 border border-amber-400/40 rounded-xl p-4 shadow-lg shadow-amber-400/5 animate-in fade-in slide-in-from-top-2 duration-200">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5">
              <div className="flex items-center gap-2 min-w-0">
                <div className="p-1.5 bg-amber-400/20 text-amber-300 rounded-lg border border-amber-400/30 shrink-0">
                  <UserPlus className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <span className="text-xs sm:text-[10px] font-black tracking-wider uppercase text-amber-400 block">
                    Manager Autonomous Transfer Deal
                  </span>
                  <h4 className="text-sm font-bold text-white">
                    {digest.managerSigning.managerName} Exercises Transfer Authority
                  </h4>
                </div>
              </div>
              <div className="text-right shrink-0">
                <span className="text-xs sm:text-[10px] text-slate-400 uppercase block font-mono">Transfer Fee</span>
                <span className="text-sm font-bold font-mono text-amber-300">
                  £{(digest.managerSigning.fee / 1000000).toFixed(2)}M
                </span>
              </div>
            </div>

            <div className="bg-slate-950/70 border border-white/5 rounded-lg p-3 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-full bg-amber-400/15 border border-amber-400/30 flex items-center justify-center font-bold text-amber-300 text-xs font-mono shrink-0">
                  {digest.managerSigning.player.position}
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-extrabold text-white text-sm">
                      {digest.managerSigning.player.name}
                    </span>
                    <span className="text-xs sm:text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 font-mono">
                      {digest.managerSigning.player.roleDetail}
                    </span>
                  </div>
                  <span className="text-xs text-slate-400">
                    Acquired from <strong className="text-slate-200">{digest.managerSigning.fromClubName}</strong> · Age {digest.managerSigning.player.age} · OVR <strong className="text-amber-400">{digest.managerSigning.player.overall}</strong>
                  </span>
                </div>
              </div>

              <div className="text-right text-xs font-mono shrink-0">
                <span className="text-emerald-400 font-bold block">
                  £{(digest.managerSigning.player.wage / 1000).toFixed(0)}k/wk
                </span>
                <span className="text-slate-500 text-xs sm:text-[10px]">
                  {digest.managerSigning.player.contractYears} yrs contract
                </span>
              </div>
            </div>

            <p className="text-xs text-slate-300 italic mt-2.5 font-serif pl-2 border-l-2 border-amber-400/40">
              "{digest.managerSigning.reason}"
            </p>
          </div>
        )}

        {/* Match Result Spotlight */}
        {match && opponentClub && club && (
          <div className="bg-slate-900/90 border border-white/10 rounded-xl p-4">
            <div className="flex items-center justify-between gap-2">

              {/* Home Team */}
              <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
                <div
                  className="w-8 h-8 rounded-full shrink-0 flex items-center justify-center text-xs font-bold text-white"
                  style={{ backgroundColor: isHome ? club.primaryColor : opponentClub.primaryColor }}
                >
                  {isHome ? club.shortName : opponentClub.shortName}
                </div>
                <div className="min-w-0">
                  <span className={`text-xs sm:text-sm font-bold block truncate ${isHome ? 'text-amber-400' : 'text-slate-200'}`}>
                    {isHome ? club.name : opponentClub.name}
                  </span>
                  <span className="text-xs sm:text-[10px] text-slate-500 uppercase tracking-wider">Home</span>
                </div>
              </div>

              {/* Score Display */}
              <div className="px-3 sm:px-6 py-2 bg-black/40 border border-white/10 rounded-lg text-center shrink-0">
                <span className="text-xl sm:text-2xl font-black font-mono tracking-tight text-white">
                  {match.homeScore} - {match.awayScore}
                </span>
                <span className={`text-xs sm:text-[10px] font-bold block uppercase tracking-wider mt-0.5 ${
                  isWin ? 'text-emerald-400' : isLoss ? 'text-rose-400' : 'text-slate-400'
                }`}>
                  {isWin ? 'Victory' : isLoss ? 'Defeat' : 'Draw'}
                </span>
              </div>

              {/* Away Team */}
              <div className="flex items-center justify-end gap-2 sm:gap-3 flex-1 min-w-0 text-right">
                <div className="min-w-0">
                  <span className={`text-xs sm:text-sm font-bold block truncate ${!isHome ? 'text-amber-400' : 'text-slate-200'}`}>
                    {!isHome ? club.name : opponentClub.name}
                  </span>
                  <span className="text-xs sm:text-[10px] text-slate-500 uppercase tracking-wider">Away</span>
                </div>
                <div
                  className="w-8 h-8 rounded-full shrink-0 flex items-center justify-center text-xs font-bold text-white"
                  style={{ backgroundColor: !isHome ? club.primaryColor : opponentClub.primaryColor }}
                >
                  {!isHome ? club.shortName : opponentClub.shortName}
                </div>
              </div>

            </div>

            {/* Match Lineup & Injury Replacement Summary */}
            {(digest.matchFormation || (digest.lineupNotices && digest.lineupNotices.length > 0)) && (
              <div className="border-t border-white/10 mt-3 pt-2.5 flex flex-col gap-1.5 text-xs">
                {digest.matchFormation && (
                  <div className="flex flex-wrap items-center justify-between gap-2 text-slate-300">
                    <span className="text-slate-400">Matchday Shape</span>
                    <div className="flex items-center gap-2 font-mono font-bold tabular-nums">
                      <span className="text-white">{digest.matchFormation}</span>
                      {digest.matchTeamRating !== undefined && (
                        <>
                          <span className="text-slate-600" aria-hidden="true">·</span>
                          <span className="text-amber-400">{digest.matchTeamRating} OVR</span>
                        </>
                      )}
                    </div>
                  </div>
                )}
                {digest.lineupNotices && digest.lineupNotices.length > 0 && (
                  <div className="space-y-1">
                    {digest.lineupNotices.map((notice, nIdx) => (
                      <div key={nIdx} className="flex items-start gap-1.5 text-amber-300">
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                        <span>{notice}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Match Events list */}
            {match.events.length > 0 && (
              <div className="border-t border-white/5 mt-3 pt-2 text-xs text-slate-400 flex flex-wrap gap-x-4 gap-y-1">
                {match.events.map((e, idx) => (
                  <span key={idx} className="flex items-center gap-1 font-mono">
                    <span className="text-amber-400">{e.minute}'</span>
                    <span>{e.type === 'goal' ? '⚽' : e.type === 'injury' ? '🏥' : e.type === 'red_card' ? '🟥' : '🟨'}</span>
                    <span className="text-slate-200 font-sans">{e.player}</span>
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Boardroom Memo from Owner */}
        <div className={`p-4 rounded-xl border ${
          digest.boardroomMemo.tone === 'ultimatum'
            ? 'bg-rose-950/30 border-rose-500/40 text-rose-200'
            : digest.boardroomMemo.tone === 'warning'
            ? 'bg-amber-950/30 border-amber-500/30 text-amber-200'
            : digest.boardroomMemo.tone === 'praising'
            ? 'bg-emerald-950/30 border-emerald-500/30 text-emerald-200'
            : 'bg-slate-900/60 border-white/10 text-slate-300'
        }`}>
          <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
            <div className="flex flex-wrap items-center gap-2">
              <Building2 className="w-4 h-4 text-amber-400 shrink-0" />
              <span className="text-xs font-bold text-white">Boardroom Memo from {digest.boardroomMemo.author}</span>
              <span className="text-xs sm:text-[10px] text-slate-400 font-mono">· {digest.boardroomMemo.role}</span>
            </div>
            <span className={`text-xs sm:text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${
              digest.boardroomMemo.tone === 'ultimatum' ? 'bg-rose-500/20 text-rose-400' :
              digest.boardroomMemo.tone === 'warning' ? 'bg-amber-500/20 text-amber-400' :
              digest.boardroomMemo.tone === 'praising' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-800 text-slate-400'
            }`}>
              {digest.boardroomMemo.tone}
            </span>
          </div>
          <p className="text-xs leading-relaxed italic text-slate-300 font-serif max-w-[75ch]">
            "{digest.boardroomMemo.content}"
          </p>
          {digest.boardroomMemo.impactExplanation && (
            <div className="mt-2 pt-2 border-t border-white/10 text-xs sm:text-[11px] font-semibold text-amber-300 flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              <span>{digest.boardroomMemo.impactExplanation}</span>
            </div>
          )}
        </div>

        {/* Two-Column: The Sunday Press Headlines & Dressing Room Pulse */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

          {/* Sunday Press Wire */}
          <div className="bg-slate-900/60 border border-white/10 rounded-xl p-3.5">
            <span className="text-xs font-bold text-slate-200 block mb-2.5 flex items-center gap-1.5">
              <Newspaper className="w-3.5 h-3.5 text-slate-400" />
              Sunday Press & Backpages
            </span>
            <div className="space-y-2">
              {digest.pressHeadlines.map((h, i) => (
                <div key={i} className="text-xs border-b border-white/5 pb-2 last:border-0 last:pb-0">
                  <div className="flex items-center justify-between text-xs sm:text-[10px] text-slate-400 mb-0.5">
                    <span>{h.source}</span>
                    <span className="capitalize">{h.category}</span>
                  </div>
                  <p className="font-medium text-slate-200 leading-snug">
                    {h.title}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Dressing Room & Training Development */}
          <div className="bg-slate-900/60 border border-white/10 rounded-xl p-3.5 flex flex-col justify-between">
            <div>
              <span className="text-xs font-bold text-slate-200 block mb-2.5 flex items-center gap-1.5">
                <Activity className="w-3.5 h-3.5 text-emerald-400" />
                Training Ground & Morale Wire
              </span>
              <p className="text-xs text-slate-300 leading-relaxed mb-3">
                {digest.dressingRoomSnippet}
              </p>
            </div>

            <div className="border-t border-white/10 pt-2.5 flex flex-wrap items-center justify-between gap-2 text-xs font-mono">
              <span className="text-emerald-400 flex items-center gap-1">
                <TrendingUp className="w-3.5 h-3.5" />
                {digest.playerGrowthCount} Talents Progressed
              </span>
              <span className="text-slate-400">
                Board Trust: <strong className="text-white">{director.boardTrust}%</strong>
              </span>
            </div>
          </div>

        </div>

        {/* Academy & Retirements Wire */}
        {digest.academyWire && digest.academyWire.length > 0 && (
          <div className="bg-slate-900/60 border border-white/10 rounded-xl p-3.5 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                <GraduationCap className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <span>Academy & Retirements Wire</span>
              </span>
              <span className="text-xs text-slate-400 font-mono tabular-nums">
                {digest.academyWire.length} updates
              </span>
            </div>

            <div className="divide-y divide-white/5">
              {digest.academyWire.map(item => (
                <div key={item.id} className="py-2 first:pt-0 last:pb-0 flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 text-xs">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span
                        className={`font-semibold ${
                          item.kind === 'retirement_notice'
                            ? 'text-rose-400'
                            : item.kind === 'poach'
                              ? 'text-amber-400'
                              : 'text-emerald-400'
                        }`}
                      >
                        {item.kind === 'retirement_notice'
                          ? 'Retiring Season End'
                          : item.kind === 'poach'
                            ? 'Youth Poach'
                            : 'Academy Promotion'}
                      </span>
                      <span className="text-slate-600" aria-hidden="true">·</span>
                      <span className="font-bold text-white">{item.playerName}</span>
                      <span className="text-slate-500 font-mono tabular-nums">
                        {item.position} · Age {item.age} · OVR {item.overall}
                      </span>
                    </div>
                    <p className="text-slate-400 mt-0.5">
                      {item.clubName} — {item.detail}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
};
