/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  Trophy,
  Award,
  Calendar,
  ChevronRight,
  RotateCcw,
  Home,
  ShieldAlert,
} from 'lucide-react';
import { ManagerCareerState, ManagerSeasonRecord } from '../types/game';
import { ManagerSeasonReviewModal } from './ManagerSeasonReviewModal';
import { sounds } from '../services/soundEffects';

interface ManagerRetirementViewProps {
  career: ManagerCareerState;
  onStartNewCareer: () => void;
  onBackToMainMenu: () => void;
}

export const ManagerRetirementView: React.FC<ManagerRetirementViewProps> = ({
  career,
  onStartNewCareer,
  onBackToMainMenu,
}) => {
  const [selectedRecord, setSelectedRecord] = useState<ManagerSeasonRecord | null>(null);
  const { profile, seasonHistory, retirementCause } = career;

  const isAgeMortality = retirementCause === 'age_mortality';
  const totalMatches = profile.wins + profile.draws + profile.losses;
  const winRate =
    totalMatches > 0 ? Math.round((profile.wins / totalMatches) * 100) : 0;

  return (
    <div className="min-h-screen bg-[#0b0f17] text-slate-200 px-4 sm:px-6 lg:px-8 py-8">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Career Banner */}
        <div
          className={`bg-[#111827] border rounded-2xl p-5 sm:p-8 space-y-5 ${
            isAgeMortality ? 'border-amber-400/35' : 'border-white/10'
          }`}
        >
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1.5">
              <span
                className={`text-xs font-bold uppercase tracking-wider inline-flex items-center gap-1.5 ${
                  isAgeMortality ? 'text-amber-400' : 'text-emerald-400'
                }`}
              >
                {isAgeMortality ? (
                  <>
                    <ShieldAlert className="w-4 h-4" />
                    <span>End of Life / Mandatory Retirement (Age {profile.age})</span>
                  </>
                ) : (
                  <>
                    <Award className="w-4 h-4" />
                    <span>Managerial Retirement Retrospective</span>
                  </>
                )}
              </span>

              <h1 className="text-2xl sm:text-4xl font-black text-white tracking-tight">
                {profile.name}
              </h1>
              <p className="text-xs sm:text-sm text-slate-400">
                {profile.nationality} · Started at Age {profile.startingAge} · Retired at Age{' '}
                {profile.age} ({career.retiredYear || 'Final Season'}) · {profile.tacticalStyle}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                onClick={() => {
                  sounds.playClick();
                  onBackToMainMenu();
                }}
                className="min-h-11 px-4 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 text-slate-200 font-bold text-xs rounded-xl flex items-center gap-1.5 cursor-pointer"
              >
                <Home className="w-4 h-4" />
                <span>Main Menu</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  sounds.playFanfare();
                  onStartNewCareer();
                }}
                className="min-h-11 px-5 py-2.5 bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-slate-950 font-extrabold text-xs rounded-xl shadow-lg flex items-center gap-1.5 cursor-pointer"
              >
                <RotateCcw className="w-4 h-4" />
                <span>Start New Career</span>
              </button>
            </div>
          </div>

          {isAgeMortality && (
            <div className="bg-amber-400/10 border border-amber-400/25 rounded-xl p-3.5 text-xs text-amber-200 leading-relaxed">
              At age {profile.age}, your remarkable touchline career has come to a natural end following the season-end health & mortality check. Your complete season chronicle is preserved below.
            </div>
          )}

          {/* Career Totals Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 pt-2">
            <div className="bg-slate-900/80 border border-white/10 rounded-xl p-3.5">
              <span className="text-[10px] uppercase tracking-wider text-slate-400 block">
                Seasons
              </span>
              <span className="text-xl font-black font-mono text-white tabular-nums">
                {seasonHistory.length}
              </span>
            </div>
            <div className="bg-slate-900/80 border border-white/10 rounded-xl p-3.5">
              <span className="text-[10px] uppercase tracking-wider text-slate-400 block">
                Match Record
              </span>
              <span className="text-lg font-black font-mono text-emerald-400 tabular-nums">
                {profile.wins}W-{profile.draws}D-{profile.losses}L
              </span>
            </div>
            <div className="bg-slate-900/80 border border-white/10 rounded-xl p-3.5">
              <span className="text-[10px] uppercase tracking-wider text-slate-400 block">
                Win Rate
              </span>
              <span className="text-xl font-black font-mono text-white tabular-nums">
                {winRate}%
              </span>
            </div>
            <div className="bg-slate-900/80 border border-white/10 rounded-xl p-3.5">
              <span className="text-[10px] uppercase tracking-wider text-slate-400 block">
                Trophies
              </span>
              <span className="text-xl font-black font-mono text-amber-400 tabular-nums">
                {profile.trophiesWon.length}
              </span>
            </div>
            <div className="bg-slate-900/80 border border-white/10 rounded-xl p-3.5 col-span-2 sm:col-span-1">
              <span className="text-[10px] uppercase tracking-wider text-slate-400 block">
                Final Rep
              </span>
              <span className="text-xl font-black font-mono text-blue-400 tabular-nums">
                {profile.reputation} / 100
              </span>
            </div>
          </div>
        </div>

        {/* Season-by-Season Chronicle */}
        <div className="bg-[#111827] border border-white/10 rounded-2xl p-5 sm:p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-3">
            <div>
              <h2 className="text-base font-extrabold text-white flex items-center gap-2">
                <Calendar className="w-4 h-4 text-amber-400" />
                <span>Career Season Chronicle ({seasonHistory.length})</span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Tap any season to open its complete league table, key results, top scorer, moments, and Sporting Director transfers.
              </p>
            </div>
          </div>

          {seasonHistory.length === 0 ? (
            <div className="bg-slate-900/70 border border-white/10 rounded-xl p-8 text-center text-xs text-slate-400">
              No completed seasons were recorded before retirement.
            </div>
          ) : (
            <div className="space-y-2.5">
              {[...seasonHistory].reverse().map((season, idx) => (
                <button
                  key={`${season.seasonYear}-${season.clubId}-${idx}`}
                  type="button"
                  onClick={() => {
                    sounds.playClick();
                    setSelectedRecord(season);
                  }}
                  className="w-full text-left bg-slate-900/80 hover:bg-slate-800/90 border border-white/10 hover:border-amber-400/40 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-all cursor-pointer active:scale-[0.99]"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span
                      className="w-3.5 h-3.5 rounded-full shrink-0 border border-white/20"
                      style={{ backgroundColor: season.primaryColor }}
                    />
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono font-bold text-xs text-amber-400 tabular-nums">
                          {season.seasonYear}/{season.seasonYear + 1}
                        </span>
                        <span className="text-xs font-mono text-slate-400">
                          Age {season.age}
                        </span>
                        <span className="text-sm font-extrabold text-white truncate">
                          {season.clubName}
                        </span>
                        {season.wasSacked && (
                          <span className="px-2 py-0.5 rounded bg-rose-500/15 border border-rose-500/30 text-rose-300 text-[10px] font-bold uppercase">
                            Sacked
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-3 mt-1 text-xs font-mono text-slate-300">
                        <span>
                          Pos: <strong className="text-white">#{season.leaguePosition}</strong>/{season.totalTeams}
                        </span>
                        <span>
                          Pts: <strong className="text-white">{season.leaguePoints}</strong>
                        </span>
                        <span className="text-slate-400">
                          {season.won}W-{season.drawn}D-{season.lost}L
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0">
                    {season.trophiesWon.length > 0 ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-400/15 border border-amber-400/30 text-amber-300 text-xs font-bold">
                        <Trophy className="w-3.5 h-3.5" />
                        <span>{season.trophiesWon.join(', ')}</span>
                      </span>
                    ) : (
                      <span className="text-xs text-slate-500 font-mono">No trophies</span>
                    )}
                    <ChevronRight className="w-4 h-4 text-slate-400" />
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <ManagerSeasonReviewModal
        record={selectedRecord}
        onClose={() => setSelectedRecord(null)}
      />
    </div>
  );
};
