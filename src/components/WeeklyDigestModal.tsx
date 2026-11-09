/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { WeeklyDigest, Club, Director, Owner, Manager } from '../types/game';
import { Newspaper, Building2, TrendingUp, AlertTriangle, CheckCircle, ArrowRight, Activity } from 'lucide-react';
import { sounds } from '../services/soundEffects';

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
  owner,
  manager,
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

  // Filter division standings for quick preview
  const divisionClubs = allClubs
    .filter(c => c.tier === (club?.tier || 1))
    .sort((a, b) => b.points - a.points || b.goalDifference - a.goalDifference);

  return (
    <div className="fixed inset-0 z-50 bg-[#070a0f]/85 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
      <div className="w-full max-w-3xl bg-[#111827] border border-white/10 rounded-2xl shadow-2xl p-6 lg:p-7 animate-in fade-in zoom-in-95 duration-150">
        
        {/* Digest Header */}
        <div className="flex items-center justify-between border-b border-white/10 pb-4 mb-5">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-amber-400/10 border border-amber-400/20 rounded-lg text-amber-400">
              <Newspaper className="w-5 h-5" />
            </div>
            <div>
              <div className="text-[11px] font-bold tracking-wider uppercase text-amber-400">
                Matchday {digest.week} · Boardroom & Media Dispatch
              </div>
              <h3 className="text-xl font-extrabold text-white">
                The Sunday Executive Review
              </h3>
            </div>
          </div>
          <div className="text-right">
            <span className="text-xs text-slate-400 block font-mono">Season {digest.seasonYear}/{digest.seasonYear + 1}</span>
            <span className="text-xs font-semibold text-slate-300">{club?.name}</span>
          </div>
        </div>

        {/* Match Result Spotlight */}
        {match && opponentClub && club && (
          <div className="bg-slate-900/90 border border-white/10 rounded-xl p-4 mb-5">
            <div className="flex items-center justify-between">
              
              {/* Home Team */}
              <div className="flex items-center gap-3 flex-1">
                <div 
                  className="w-8 h-8 rounded-full shrink-0 flex items-center justify-center text-xs font-bold text-white"
                  style={{ backgroundColor: isHome ? club.primaryColor : opponentClub.primaryColor }}
                >
                  {isHome ? club.shortName : opponentClub.shortName}
                </div>
                <div>
                  <span className={`text-sm font-bold block ${isHome ? 'text-amber-400' : 'text-slate-200'}`}>
                    {isHome ? club.name : opponentClub.name}
                  </span>
                  <span className="text-[10px] text-slate-500 uppercase tracking-wider">Home</span>
                </div>
              </div>

              {/* Score Display */}
              <div className="px-6 py-2 bg-black/40 border border-white/10 rounded-lg text-center shrink-0">
                <span className="text-2xl font-black font-mono tracking-tight text-white">
                  {match.homeScore} - {match.awayScore}
                </span>
                <span className={`text-[10px] font-bold block uppercase tracking-wider mt-0.5 ${
                  isWin ? 'text-emerald-400' : isLoss ? 'text-rose-400' : 'text-slate-400'
                }`}>
                  {isWin ? 'Victory' : isLoss ? 'Defeat' : 'Draw'}
                </span>
              </div>

              {/* Away Team */}
              <div className="flex items-center justify-end gap-3 flex-1 text-right">
                <div>
                  <span className={`text-sm font-bold block ${!isHome ? 'text-amber-400' : 'text-slate-200'}`}>
                    {!isHome ? club.name : opponentClub.name}
                  </span>
                  <span className="text-[10px] text-slate-500 uppercase tracking-wider">Away</span>
                </div>
                <div 
                  className="w-8 h-8 rounded-full shrink-0 flex items-center justify-center text-xs font-bold text-white"
                  style={{ backgroundColor: !isHome ? club.primaryColor : opponentClub.primaryColor }}
                >
                  {!isHome ? club.shortName : opponentClub.shortName}
                </div>
              </div>

            </div>

            {/* Match Events list */}
            {match.events.length > 0 && (
              <div className="border-t border-white/5 mt-3 pt-2 text-xs text-slate-400 flex flex-wrap gap-x-4 gap-y-1">
                {match.events.map((e, idx) => (
                  <span key={idx} className="flex items-center gap-1 font-mono">
                    <span className="text-amber-400">{e.minute}'</span>
                    <span>{e.type === 'goal' ? '⚽' : '🟨'}</span>
                    <span className="text-slate-200 font-sans">{e.player}</span>
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Boardroom Memo from Owner */}
        <div className={`p-4 rounded-xl border mb-5 ${
          digest.boardroomMemo.tone === 'ultimatum'
            ? 'bg-rose-950/30 border-rose-500/40 text-rose-200'
            : digest.boardroomMemo.tone === 'warning'
            ? 'bg-amber-950/30 border-amber-500/30 text-amber-200'
            : digest.boardroomMemo.tone === 'praising'
            ? 'bg-emerald-950/30 border-emerald-500/30 text-emerald-200'
            : 'bg-slate-900/60 border-white/10 text-slate-300'
        }`}>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Building2 className="w-4 h-4 text-amber-400" />
              <span className="text-xs font-bold text-white">Boardroom Memo from {digest.boardroomMemo.author}</span>
              <span className="text-[10px] text-slate-400 font-mono">· {digest.boardroomMemo.role}</span>
            </div>
            <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${
              digest.boardroomMemo.tone === 'ultimatum' ? 'bg-rose-500/20 text-rose-400' :
              digest.boardroomMemo.tone === 'warning' ? 'bg-amber-500/20 text-amber-400' :
              digest.boardroomMemo.tone === 'praising' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-800 text-slate-400'
            }`}>
              {digest.boardroomMemo.tone}
            </span>
          </div>
          <p className="text-xs leading-relaxed italic text-slate-300 font-serif">
            "{digest.boardroomMemo.content}"
          </p>
          {digest.boardroomMemo.impactExplanation && (
            <div className="mt-2 pt-2 border-t border-white/10 text-[11px] font-semibold text-amber-300 flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>{digest.boardroomMemo.impactExplanation}</span>
            </div>
          )}
        </div>

        {/* Two-Column: The Sunday Press Headlines & Dressing Room Pulse */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          
          {/* Sunday Press Wire */}
          <div className="bg-slate-900/60 border border-white/10 rounded-xl p-3.5">
            <span className="text-xs font-bold text-slate-200 block mb-2.5 flex items-center gap-1.5">
              <Newspaper className="w-3.5 h-3.5 text-slate-400" />
              Sunday Press & Backpages
            </span>
            <div className="space-y-2">
              {digest.pressHeadlines.map((h, i) => (
                <div key={i} className="text-xs border-b border-white/5 pb-2 last:border-0 last:pb-0">
                  <div className="flex items-center justify-between text-[10px] text-slate-400 mb-0.5">
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

            <div className="border-t border-white/10 pt-2.5 flex items-center justify-between text-xs font-mono">
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

        {/* Dismiss Button */}
        <div className="flex items-center justify-end">
          <button
            onClick={() => {
              sounds.playClick();
              onClose();
            }}
            className="px-6 py-2.5 bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-slate-950 font-extrabold text-xs rounded-xl shadow-lg shadow-amber-500/20 flex items-center gap-2 cursor-pointer transition-all active:scale-95"
          >
            <span>Proceed to Boardroom</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>

      </div>
    </div>
  );
};
