/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  Club,
  Director,
  Manager,
  ManagerAttributes,
  ManagerCareerStats,
  ManagerHistoryEntry,
  Owner,
} from '../types/game';

export const EMPTY_MANAGER_CAREER_STATS: ManagerCareerStats = {
  matchesManaged: 0,
  wins: 0,
  draws: 0,
  losses: 0,
  titlesWon: 0,
  promotionsWon: 0,
  timesSacked: 0,
};

const WIN_MILESTONES = [25, 50, 100, 150, 200, 250, 300, 400, 500];
const MATCH_MILESTONES = [100, 250, 500, 750, 1000];

export function getManagerCareerStats(manager: Manager): ManagerCareerStats {
  const s = manager.careerStats;
  return {
    matchesManaged: s?.matchesManaged ?? 0,
    wins: s?.wins ?? 0,
    draws: s?.draws ?? 0,
    losses: s?.losses ?? 0,
    titlesWon: s?.titlesWon ?? 0,
    promotionsWon: s?.promotionsWon ?? 0,
    timesSacked: s?.timesSacked ?? 0,
  };
}

export function getManagerHistory(manager: Manager): ManagerHistoryEntry[] {
  if (!Array.isArray(manager.history)) return [];
  return [...manager.history].sort((a, b) => b.season - a.season || b.week - a.week);
}

export function appendManagerHistory(
  manager: Manager,
  entry: Omit<ManagerHistoryEntry, 'id'>
): Manager {
  const existing = Array.isArray(manager.history) ? manager.history : [];
  const nextEntry: ManagerHistoryEntry = {
    ...entry,
    id: `mh_${entry.season}_w${entry.week}_${entry.type}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
  };
  return {
    ...manager,
    history: [nextEntry, ...existing].slice(0, 60),
  };
}

export function recordManagerMatchResult(
  manager: Manager,
  outcome: 'W' | 'D' | 'L',
  club: Club,
  season: number,
  week: number
): Manager {
  const prevStats = getManagerCareerStats(manager);
  const nextMatches = prevStats.matchesManaged + 1;
  const nextWins = prevStats.wins + (outcome === 'W' ? 1 : 0);
  const nextDraws = prevStats.draws + (outcome === 'D' ? 1 : 0);
  const nextLosses = prevStats.losses + (outcome === 'L' ? 1 : 0);

  let updated: Manager = {
    ...manager,
    careerStats: {
      ...prevStats,
      matchesManaged: nextMatches,
      wins: nextWins,
      draws: nextDraws,
      losses: nextLosses,
    },
  };

  if (outcome === 'W' && WIN_MILESTONES.includes(nextWins)) {
    updated = appendManagerHistory(updated, {
      season,
      week,
      type: 'wins_milestone',
      title: `Reached ${nextWins} Career Wins`,
      detail: `Secured career victory #${nextWins} in charge of ${club.name}.`,
      clubId: club.id,
      clubName: club.name,
    });
  }

  if (MATCH_MILESTONES.includes(nextMatches)) {
    updated = appendManagerHistory(updated, {
      season,
      week,
      type: 'matches_milestone',
      title: `${nextMatches} Matches Managed`,
      detail: `Marked ${nextMatches} career league matches in the dugout while managing ${club.name}.`,
      clubId: club.id,
      clubName: club.name,
    });
  }

  return updated;
}

function hashString(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(value)));
}

export function deriveManagerAttributes(
  m: Pick<Manager, 'id' | 'reputation' | 'tacticalStyle' | 'controlDesire'>
): ManagerAttributes {
  const h = hashString(m.id || 'mgr_default');
  const rep = Number(m.reputation) || 60;
  const base = 38 + rep * 0.54;
  const j1 = ((h & 0xff) % 11) - 5;
  const j2 = (((h >>> 8) & 0xff) % 11) - 5;
  const j3 = (((h >>> 16) & 0xff) % 11) - 5;
  const j4 = (((h >>> 24) & 0xff) % 11) - 5;

  const styleBoost = {
    tactical: m.tacticalStyle === 'Tiki-Taka Possession' || m.tacticalStyle === 'Pragmatic Low Block' ? 3 : 0,
    coaching: m.tacticalStyle === 'High Gegenpress' || m.tacticalStyle === 'Fluid Wing Play' ? 3 : 0,
    manManagement: m.controlDesire === 'collaborator' ? 3 : m.controlDesire === 'autocrat' ? 1 : 0,
    youthDevelopment: m.controlDesire === 'head_coach' ? 4 : m.tacticalStyle === 'High Gegenpress' ? 2 : 0,
  };

  return {
    tactical: clamp(base + styleBoost.tactical + j1, 35, 97),
    coaching: clamp(base + styleBoost.coaching + j2, 35, 97),
    manManagement: clamp(base + styleBoost.manManagement + j3, 35, 97),
    youthDevelopment: clamp(base + styleBoost.youthDevelopment + j4, 35, 97),
  };
}

export function getManagerAverageRating(attributes: ManagerAttributes): number {
  return Math.round(
    (attributes.tactical + attributes.coaching + attributes.manManagement + attributes.youthDevelopment) / 4
  );
}

/**
 * Weekly wage demand curve tied to reputation (£/week).
 * Scales from ~£6,000/wk (rep 35) to ~£351,000/wk (rep 97).
 */
export function calculateManagerWageDemand(reputation: number): number {
  const clampedRep = Math.max(20, Math.min(99, reputation));
  const normalized = Math.max(0, clampedRep - 30) / 67;
  const rawWeekly = 6000 + Math.pow(normalized, 2.55) * 345000;
  return Math.max(5000, Math.round(rawWeekly / 500) * 500);
}

export function applyManagerReputationChange(manager: Manager, repDelta: number): Manager {
  const nextRep = clamp(manager.reputation + repDelta, 20, 99);
  if (nextRep === manager.reputation) return manager;

  const prevCurveWage = calculateManagerWageDemand(manager.reputation);
  const nextCurveWage = calculateManagerWageDemand(nextRep);
  const ratio = prevCurveWage > 0 ? nextCurveWage / prevCurveWage : 1;
  const adjustedWage = Math.max(5000, Math.round((manager.wage * ratio) / 500) * 500);

  return {
    ...manager,
    reputation: nextRep,
    wage: adjustedWage,
  };
}

export function calculateManagerAnnualWage(weeklyWage: number): number {
  return Math.max(0, Math.round(weeklyWage * 52));
}

export interface SeveranceBreakdown {
  annualWage: number;
  baseSeverance: number;
  tenureBonus: number;
  totalSeverance: number;
  fullSeasons: number;
  isCapped: boolean;
}

/**
 * Severance fee: manager's annual wage * 0.5, plus 10% of that per full season of tenure,
 * capped at 1.0 * annual wage.
 */
export function calculateManagerSeverance(manager: Manager): SeveranceBreakdown {
  const annualWage = calculateManagerAnnualWage(manager.wage);
  const baseSeverance = annualWage * 0.5;
  const fullSeasons = Math.max(0, Math.floor(manager.seasonsAtClub ?? 0));
  const rawTenureBonus = baseSeverance * 0.1 * fullSeasons;
  const uncapped = baseSeverance + rawTenureBonus;
  const totalSeverance = Math.round(Math.min(annualWage, uncapped));
  const isCapped = uncapped >= annualWage;

  return {
    annualWage,
    baseSeverance: Math.round(baseSeverance),
    tenureBonus: Math.round(Math.max(0, totalSeverance - Math.round(baseSeverance))),
    totalSeverance,
    fullSeasons,
    isCapped,
  };
}

/**
 * Signing fee: 25% of manager's annual wage, scaled up by their reputation.
 */
export function calculateManagerSigningFee(manager: Manager): number {
  const annualWage = calculateManagerAnnualWage(manager.wage);
  const reputationScale = 1 + Math.max(0, manager.reputation - 35) / 100;
  return Math.round(annualWage * 0.25 * reputationScale);
}

export interface HiringCostBreakdown {
  signingFee: number;
  offeredWeeklyWage: number;
  firstSeasonWage: number;
  totalCost: number;
}

export function calculateHiringCosts(manager: Manager, offeredWeeklyWage?: number): HiringCostBreakdown {
  const weekly = Math.max(1000, Math.round((offeredWeeklyWage ?? manager.wage) / 500) * 500);
  const signingFee = calculateManagerSigningFee(manager);
  const firstSeasonWage = calculateManagerAnnualWage(weekly);
  return {
    signingFee,
    offeredWeeklyWage: weekly,
    firstSeasonWage,
    totalCost: signingFee + firstSeasonWage,
  };
}

export interface ManagerWillingnessResult {
  willing: boolean;
  statusLabel: 'Current Manager' | 'Willing to Join' | 'Needs Higher Wage' | 'Unwilling';
  reasons: string[];
  primaryReason: string | null;
}

export function evaluateManagerWillingness(
  manager: Manager,
  targetClub: Club,
  owner: Owner,
  offeredWeeklyWage: number,
  currentEmployerClub?: Club
): ManagerWillingnessResult {
  if (manager.clubId === targetClub.id) {
    return {
      willing: false,
      statusLabel: 'Current Manager',
      reasons: ['Already managing this club.'],
      primaryReason: 'Already managing this club.',
    };
  }

  const reasons: string[] = [];

  // 1. Wage offer vs wage demand (a generous wage premium can slightly soften prestige gap)
  const wageRatio = manager.wage > 0 ? offeredWeeklyWage / manager.wage : 1;
  if (offeredWeeklyWage < manager.wage) {
    reasons.push(
      `Wage offer (£${(offeredWeeklyWage / 1000).toFixed(1)}k/wk) is below his £${(manager.wage / 1000).toFixed(1)}k/wk demand.`
    );
  }

  // 2. Club reputation check (club.prestige vs manager.reputation, plus rival stature if employed)
  const wagePrestigeOffset = wageRatio >= 1.25 ? 4 : wageRatio >= 1.12 ? 2 : 0;
  const effectivePrestige = targetClub.prestige + wagePrestigeOffset;
  const minRequiredPrestige = Math.max(45, manager.reputation - (manager.clubId ? 11 : 14));

  if (effectivePrestige < minRequiredPrestige) {
    reasons.push(
      `Club reputation (${targetClub.prestige}) is too low for his stature (requires ~${minRequiredPrestige}+).`
    );
  } else if (
    currentEmployerClub &&
    currentEmployerClub.prestige > targetClub.prestige + 6 &&
    wageRatio < 1.2
  ) {
    reasons.push(
      `Reluctant to leave ${currentEmployerClub.name} (Rep ${currentEmployerClub.prestige}) without a 20%+ wage raise.`
    );
  }

  // 3. Board confidence check (owner.approval)
  const requiredConfidence = manager.reputation >= 75 ? 45 : manager.reputation >= 55 ? 35 : 25;
  if (owner.approval < requiredConfidence) {
    reasons.push(
      `Board confidence (${owner.approval}%) is below his ${requiredConfidence}% minimum threshold.`
    );
  }

  if (reasons.length === 0) {
    return {
      willing: true,
      statusLabel: 'Willing to Join',
      reasons: [],
      primaryReason: null,
    };
  }

  const onlyWageIssue = reasons.length === 1 && offeredWeeklyWage < manager.wage;

  return {
    willing: false,
    statusLabel: onlyWageIssue ? 'Needs Higher Wage' : 'Unwilling',
    reasons,
    primaryReason: reasons[0],
  };
}

export interface SackBoardReaction {
  nextSackCount: number;
  ownerApprovalDelta: number;
  directorTrustDelta: number;
  fanApprovalDelta: number;
  severityLabel: string;
}

export function getSackBoardReaction(club: Club): SackBoardReaction {
  const prevSacks = club.managerSacksThisSeason ?? 0;
  const nextSackCount = prevSacks + 1;

  if (nextSackCount === 1) {
    return {
      nextSackCount,
      ownerApprovalDelta: -5,
      directorTrustDelta: -4,
      fanApprovalDelta: -4,
      severityLabel: 'Minor boardroom concern (-5% Board Confidence)',
    };
  }

  if (nextSackCount === 2) {
    return {
      nextSackCount,
      ownerApprovalDelta: -12,
      directorTrustDelta: -10,
      fanApprovalDelta: -8,
      severityLabel: 'Repeat sacking this season (-12% Board Confidence)',
    };
  }

  return {
    nextSackCount,
    ownerApprovalDelta: -20,
    directorTrustDelta: -16,
    fanApprovalDelta: -12,
    severityLabel: `Severe instability — ${nextSackCount}th sack this season (-20% Board Confidence)`,
  };
}

export function executeSackManager(params: {
  club: Club;
  manager: Manager;
  owner: Owner;
  director: Director;
  seasonYear?: number;
  currentWeek?: number;
}):
  | {
      ok: true;
      updatedClub: Club;
      updatedManager: Manager;
      updatedOwner: Owner;
      updatedDirector: Director;
      severance: SeveranceBreakdown;
      reaction: SackBoardReaction;
    }
  | { ok: false; error: string; severance: SeveranceBreakdown } {
  const { club, manager, owner, director, seasonYear = 2026, currentWeek = 1 } = params;
  const severance = calculateManagerSeverance(manager);

  if (club.balance < severance.totalSeverance) {
    return {
      ok: false,
      error: `Insufficient Club Treasury Balance (£${(club.balance / 1000000).toFixed(2)}M) to cover £${(severance.totalSeverance / 1000000).toFixed(2)}M severance.`,
      severance,
    };
  }

  const reaction = getSackBoardReaction(club);
  const prevStats = getManagerCareerStats(manager);
  const repAdjustedManager = applyManagerReputationChange(manager, -3);
  const sackedBase: Manager = {
    ...repAdjustedManager,
    clubId: null,
    seasonsAtClub: 0,
    trustInDirector: 65,
    careerStats: {
      ...prevStats,
      timesSacked: prevStats.timesSacked + 1,
    },
  };
  const updatedManager = appendManagerHistory(sackedBase, {
    season: seasonYear,
    week: currentWeek,
    type: 'sacked',
    title: `Sacked by ${club.name}`,
    detail: `Dismissed after ${severance.fullSeasons} full season${severance.fullSeasons === 1 ? '' : 's'} with a ${formatCurrencyCompact(severance.totalSeverance)} severance payout.`,
    clubId: club.id,
    clubName: club.name,
  });

  const updatedClub: Club = {
    ...club,
    managerId: null,
    balance: Math.max(0, club.balance - severance.totalSeverance),
    managerSacksThisSeason: reaction.nextSackCount,
  };

  const updatedOwner: Owner = {
    ...owner,
    approval: Math.max(0, Math.min(100, owner.approval + reaction.ownerApprovalDelta)),
  };

  const updatedDirector: Director = {
    ...director,
    boardTrust: Math.max(0, Math.min(100, director.boardTrust + reaction.directorTrustDelta)),
    fanApproval: Math.max(0, Math.min(100, director.fanApproval + reaction.fanApprovalDelta)),
  };

  return {
    ok: true,
    updatedClub,
    updatedManager,
    updatedOwner,
    updatedDirector,
    severance,
    reaction,
  };
}

export function executeHireManager(params: {
  club: Club;
  manager: Manager;
  offeredWeeklyWage: number;
  owner: Owner;
  director: Director;
  rivalClub?: Club;
  seasonYear?: number;
  currentWeek?: number;
}):
  | {
      ok: true;
      updatedClub: Club;
      updatedManager: Manager;
      updatedOwner: Owner;
      updatedDirector: Director;
      updatedRivalClub?: Club;
      costs: HiringCostBreakdown;
    }
  | { ok: false; error: string; costs: HiringCostBreakdown; willingness: ManagerWillingnessResult } {
  const {
    club,
    manager,
    offeredWeeklyWage,
    owner,
    director,
    rivalClub,
    seasonYear = 2026,
    currentWeek = 1,
  } = params;
  const costs = calculateHiringCosts(manager, offeredWeeklyWage);
  const willingness = evaluateManagerWillingness(manager, club, owner, costs.offeredWeeklyWage, rivalClub);

  if (club.managerId !== null) {
    return {
      ok: false,
      error: 'Your club already has an active Head Coach. Sack your current manager before appointing a replacement.',
      costs,
      willingness,
    };
  }

  if (club.balance < costs.totalCost) {
    return {
      ok: false,
      error: `Club Treasury Balance (£${(club.balance / 1000000).toFixed(2)}M) is below the £${(costs.totalCost / 1000000).toFixed(2)}M total cost (signing fee + first season wage).`,
      costs,
      willingness,
    };
  }

  if (!willingness.willing) {
    return {
      ok: false,
      error: willingness.reasons[0] || `${manager.name} declined the offer.`,
      costs,
      willingness,
    };
  }

  const appointedBase: Manager = {
    ...manager,
    clubId: club.id,
    seasonsAtClub: 0,
    wage: Math.max(manager.wage, costs.offeredWeeklyWage),
    trustInDirector: 75,
    careerStats: getManagerCareerStats(manager),
  };

  const updatedManager = appendManagerHistory(appointedBase, {
    season: seasonYear,
    week: currentWeek,
    type: rivalClub ? 'poached' : 'appointed',
    title: rivalClub
      ? `Poached by ${club.name} from ${rivalClub.name}`
      : `Appointed Head Coach of ${club.name}`,
    detail: `Signed on £${(appointedBase.wage / 1000).toFixed(1)}k/wk (${formatCurrencyCompact(costs.signingFee)} signing fee).`,
    clubId: club.id,
    clubName: club.name,
  });

  const updatedClub: Club = {
    ...club,
    managerId: manager.id,
    balance: Math.max(0, club.balance - costs.totalCost),
    managerVacancyWeeksRemaining: undefined,
  };

  let updatedRivalClub: Club | undefined;
  if (rivalClub && rivalClub.id !== club.id) {
    updatedRivalClub = {
      ...rivalClub,
      managerId: null,
      managerVacancyWeeksRemaining: 1 + Math.floor(Math.random() * 4), // 1-4 weeks
    };
  }

  const updatedOwner: Owner = {
    ...owner,
    approval: Math.min(100, owner.approval + 3),
  };

  const updatedDirector: Director = {
    ...director,
    boardTrust: Math.min(100, director.boardTrust + 3),
    fanApproval: Math.min(100, director.fanApproval + (manager.reputation >= 85 ? 8 : 4)),
  };

  return {
    ok: true,
    updatedClub,
    updatedManager,
    updatedOwner,
    updatedDirector,
    updatedRivalClub,
    costs,
  };
}

/**
 * Selects the best affordable manager from the fixed pool for an AI club.
 * Prioritizes free agents; respects total hiring cost (signing fee + 1st year wage <= club balance)
 * and club prestige bounds, falling back to the cheapest free agent if cash-strapped.
 */
export function selectBestAffordableManagerForAIClub(
  aiClub: Club,
  allManagers: Manager[],
  playerClubId: string | null
): { manager: Manager; costs: HiringCostBreakdown } | null {
  const candidates = allManagers.filter(m => m.clubId === null);
  const fallbackPool = candidates.length > 0
    ? candidates
    : allManagers.filter(m => m.clubId !== aiClub.id && m.clubId !== playerClubId);

  if (fallbackPool.length === 0) return null;

  const scoreCandidate = (m: Manager): number => {
    const avgAttr = getManagerAverageRating(m.attributes);
    return m.reputation * 1.4 + avgAttr * 0.6;
  };

  const affordableAndRealistic = fallbackPool
    .map(m => ({ manager: m, costs: calculateHiringCosts(m, m.wage) }))
    .filter(({ manager, costs }) => {
      const withinBudget = aiClub.balance >= costs.totalCost;
      const realisticPrestige = manager.reputation <= aiClub.prestige + 14;
      return withinBudget && realisticPrestige;
    })
    .sort((a, b) => scoreCandidate(b.manager) - scoreCandidate(a.manager));

  if (affordableAndRealistic.length > 0) {
    return affordableAndRealistic[0];
  }

  // Fallback: best affordable regardless of prestige gap
  const affordableAny = fallbackPool
    .map(m => ({ manager: m, costs: calculateHiringCosts(m, m.wage) }))
    .filter(({ costs }) => aiClub.balance >= costs.totalCost)
    .sort((a, b) => scoreCandidate(b.manager) - scoreCandidate(a.manager));

  if (affordableAny.length > 0) {
    return affordableAny[0];
  }

  // Last resort: cheapest free agent in the pool so AI never gets stuck without a manager
  const cheapest = fallbackPool
    .map(m => ({ manager: m, costs: calculateHiringCosts(m, m.wage) }))
    .sort((a, b) => a.costs.totalCost - b.costs.totalCost);

  return cheapest[0] ?? null;
}

export function formatCurrencyCompact(amount: number): string {
  if (Math.abs(amount) >= 1_000_000) {
    return `£${(amount / 1_000_000).toFixed(2)}M`;
  }
  return `£${Math.round(amount / 1_000).toLocaleString()}k`;
}
