/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Club, Player, TransferRecord } from '../types/game';

export type TransferROIStatus = 'at_club' | 'other_club' | 'free_agent';

export interface TransferROISigningItem {
  record: TransferRecord;
  currentOverall: number;
  overallDelta: number;
  status: TransferROIStatus;
  currentClubName: string;
  currentClubShortName: string;
  currentClubColor: string;
  currentAge: number;
  currentValue: number;
}

export interface TransferROISeasonBucket {
  season: number;
  label: string;
  shortLabel: string;
  signingsCount: number;
  feesSpent: number;
  collectiveOvrDelta: number;
}

export interface TransferROISummary {
  clubId: string;
  previousSeason: number;
  currentSeason: number;
  totalFeesSpent: number;
  collectiveOvrDelta: number;
  avgOvrDelta: number;
  costPerOvrPoint: number | null;
  ovrPer10M: number | null;
  activeCount: number;
  atClubCount: number;
  departedCount: number;
  retiredExcludedCount: number;
  retiredFeesExcluded: number;
  bySeason: [TransferROISeasonBucket, TransferROISeasonBucket];
  items: TransferROISigningItem[];
}

export function formatTransferFee(fee: number, compact = false): string {
  if (fee >= 1_000_000) {
    return `£${(fee / 1_000_000).toFixed(compact ? 1 : 2)}M`;
  }
  if (fee >= 1_000) {
    return `£${Math.round(fee / 1_000)}k`;
  }
  return `£${Math.round(fee)}`;
}

export function formatSeasonSpan(season: number): string {
  const nextShort = String((season + 1) % 100).padStart(2, '0');
  return `${season}/${nextShort}`;
}

export function computeTransferROI(
  clubId: string,
  seasonYear: number,
  allClubs: Club[],
  freeAgents: Player[],
  transferHistory: TransferRecord[]
): TransferROISummary {
  const previousSeason = seasonYear - 1;
  const currentSeason = seasonYear;

  const activePlayerIndex = new Map<string, { player: Player; club: Club | null }>();
  for (const club of allClubs) {
    for (const player of club.squad) {
      activePlayerIndex.set(player.id, { player, club });
    }
  }
  for (const freeAgent of freeAgents) {
    if (!activePlayerIndex.has(freeAgent.id)) {
      activePlayerIndex.set(freeAgent.id, { player: freeAgent, club: null });
    }
  }

  const qualifyingRecords = transferHistory
    .filter(
      tr =>
        tr.type === 'signing' &&
        tr.toClubId === clubId &&
        tr.fee > 0 &&
        tr.season >= previousSeason &&
        tr.season <= currentSeason
    )
    .sort((a, b) => b.season - a.season || b.week - a.week);

  const items: TransferROISigningItem[] = [];
  let retiredExcludedCount = 0;
  let retiredFeesExcluded = 0;

  for (const record of qualifyingRecords) {
    const activeEntry = activePlayerIndex.get(record.playerId);
    if (!activeEntry) {
      retiredExcludedCount += 1;
      retiredFeesExcluded += record.fee;
      continue;
    }

    const { player: activePlayer, club: activeClub } = activeEntry;
    const status: TransferROIStatus =
      activeClub?.id === clubId
        ? 'at_club'
        : activeClub
          ? 'other_club'
          : 'free_agent';

    items.push({
      record,
      currentOverall: activePlayer.overall,
      overallDelta: activePlayer.overall - record.overall,
      status,
      currentClubName: activeClub ? activeClub.name : 'Free Agent',
      currentClubShortName: activeClub ? activeClub.shortName : 'FA',
      currentClubColor: activeClub ? activeClub.primaryColor : '#64748b',
      currentAge: activePlayer.age,
      currentValue: activePlayer.value,
    });
  }

  const totalFeesSpent = items.reduce((sum, item) => sum + item.record.fee, 0);
  const collectiveOvrDelta = items.reduce((sum, item) => sum + item.overallDelta, 0);
  const activeCount = items.length;
  const avgOvrDelta = activeCount > 0 ? collectiveOvrDelta / activeCount : 0;
  const costPerOvrPoint = collectiveOvrDelta > 0 ? totalFeesSpent / collectiveOvrDelta : null;
  const ovrPer10M =
    totalFeesSpent > 0 ? (collectiveOvrDelta / (totalFeesSpent / 1_000_000)) * 10 : null;

  const atClubCount = items.filter(i => i.status === 'at_club').length;
  const departedCount = activeCount - atClubCount;

  const buildBucket = (season: number): TransferROISeasonBucket => {
    const seasonItems = items.filter(i => i.record.season === season);
    return {
      season,
      label: formatSeasonSpan(season),
      shortLabel: String(season),
      signingsCount: seasonItems.length,
      feesSpent: seasonItems.reduce((sum, i) => sum + i.record.fee, 0),
      collectiveOvrDelta: seasonItems.reduce((sum, i) => sum + i.overallDelta, 0),
    };
  };

  return {
    clubId,
    previousSeason,
    currentSeason,
    totalFeesSpent,
    collectiveOvrDelta,
    avgOvrDelta,
    costPerOvrPoint,
    ovrPer10M,
    activeCount,
    atClubCount,
    departedCount,
    retiredExcludedCount,
    retiredFeesExcluded,
    bySeason: [buildBucket(previousSeason), buildBucket(currentSeason)],
    items,
  };
}
