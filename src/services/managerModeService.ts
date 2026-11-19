/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { MANAGER_MODE_CONFIG } from '../config/managerModeConfig';
import {
  Club,
  ClubDirector,
  Director,
  DirectorCounterOffer,
  DirectorPersonality,
  DirectorPhilosophy,
  DirectorRequestRecord,
  DirectorRequestStatus,
  DirectorRequestType,
  FormationId,
  GameweekRecord,
  LeagueTier,
  Manager,
  ManagerCareerState,
  ManagerContractRenewalOffer,
  ManagerJobOffer,
  ManagerKeyResult,
  ManagerModeProfile,
  ManagerPlayerRequestStatus,
  ManagerSeasonRecord,
  ManagerSeasonReview,
  ManagerSeasonTableRow,
  Owner,
  Player,
  PlayerPosition,
  RecruitmentPhilosophy,
  SeasonSummary,
  TacticalStyle,
  TransferRecord,
} from '../types/game';
import { assignClubDirectors, getOrCreateClubDirector } from './directorPersonalityService';
import { calculateManagerWageDemand } from './managerService';
import {
  completeSale,
  completeSigning,
  evaluatePlayerStyleFit,
  evaluateSigning,
  getTransferOffers,
  isTransferWindowOpen,
} from './transferService';
import { autoPickLineup, syncLineupAfterSquadChange } from '../utils/lineup';

export function calculateEffectiveControl(
  personality: DirectorPersonality,
  reputation: number,
  controlModifier = 0
): number {
  const cfg = MANAGER_MODE_CONFIG.directors[personality];
  if (!cfg) return 0;
  if (cfg.effectiveControlCap <= 0 && controlModifier <= 0) return 0;
  const effectiveCap = Math.min(100, Math.max(0, cfg.effectiveControlCap + Math.max(0, controlModifier)));
  const raw = cfg.baseControl + reputation * cfg.reputationBonusMultiplier + controlModifier;
  return Math.max(0, Math.min(effectiveCap, Math.round(raw)));
}

export function generateManagerContractTerms(
  club: Club,
  reputation: number,
  preferredYears?: number
): { contractYears: number; weeklyWage: number } {
  const cfg = MANAGER_MODE_CONFIG.contracts;
  const demandWage = calculateManagerWageDemand(Math.max(20, Math.min(99, reputation)));
  const tierFloor = cfg.tierWageFloor[club.tier] ?? 5000;
  const tierCeiling = cfg.tierWageCeiling[club.tier] ?? 50000;
  const prestigeScale = 0.75 + (club.prestige / 100) * 0.4;
  const scaledWage = Math.round((demandWage * prestigeScale) / 500) * 500;
  const weeklyWage = Math.max(tierFloor, Math.min(tierCeiling, scaledWage));

  let years = preferredYears ?? cfg.defaultStartingYears[club.tier] ?? 2;
  if (preferredYears === undefined) {
    if (reputation >= club.prestige + 8) years += 1;
    else if (reputation <= club.prestige - 25 && club.tier === 1) years = 2;
  }
  const contractYears = Math.max(cfg.minYears, Math.min(cfg.maxYears, years));
  return { contractYears, weeklyWage };
}

export function calculateManagerSackingCompensation(
  weeklyWage: number,
  contractYearsRemaining: number,
  clubBalance?: number
): number {
  if (weeklyWage <= 0 || contractYearsRemaining <= 0) return 0;
  const cfg = MANAGER_MODE_CONFIG.contracts;
  const annualWage = weeklyWage * 52;
  const multiplier = Math.min(
    cfg.compensationMaxAnnualMultiple,
    cfg.compensationBaseAnnualPct + Math.max(0, contractYearsRemaining - 1) * cfg.compensationPerExtraYearPct
  );
  const raw = Math.round(annualWage * multiplier);
  if (typeof clubBalance === 'number') {
    return Math.max(0, Math.min(raw, Math.round(Math.max(0, clubBalance))));
  }
  return raw;
}

export function normalizeManagerCareerState(
  career: ManagerCareerState,
  clubs: Club[]
): ManagerCareerState {
  const currentClub = career.currentClubId
    ? clubs.find(c => c.id === career.currentClubId)
    : undefined;
  let contractYears = career.contractYears;
  let weeklyWage = career.weeklyWage;

  if (currentClub) {
    if (typeof contractYears !== 'number' || contractYears <= 0) {
      contractYears = MANAGER_MODE_CONFIG.contracts.defaultStartingYears[currentClub.tier] ?? 2;
    }
    if (typeof weeklyWage !== 'number' || weeklyWage <= 0) {
      weeklyWage = generateManagerContractTerms(currentClub, career.profile.reputation, contractYears).weeklyWage;
    }
  } else {
    contractYears = 0;
    weeklyWage = 0;
  }

  return {
    ...career,
    contractYears,
    weeklyWage,
    controlModifier: typeof career.controlModifier === 'number' ? career.controlModifier : 0,
    directorReceptivityPenalty:
      typeof career.directorReceptivityPenalty === 'number' ? career.directorReceptivityPenalty : 0,
    directorRequestCooldowns: career.directorRequestCooldowns ?? {},
    directorRequestHistory: Array.isArray(career.directorRequestHistory)
      ? career.directorRequestHistory
      : [],
    pendingDirectorCounterOffer: career.pendingDirectorCounterOffer ?? null,
    publicBackingWeeksRemaining:
      typeof career.publicBackingWeeksRemaining === 'number' ? career.publicBackingWeeksRemaining : 0,
  };
}

export function getMortalityChance(age: number): number {
  const cfg = MANAGER_MODE_CONFIG.mortality;
  if (age < cfg.startAge) return 0;
  const raw = cfg.baseChance + (age - cfg.startAge) * cfg.annualIncrement;
  return Math.min(cfg.maxChance, Math.max(0, Number(raw.toFixed(2))));
}

export function rollAgeMortality(age: number): {
  triggered: boolean;
  chance: number;
} {
  const chance = getMortalityChance(age);
  if (chance <= 0) {
    return { triggered: false, chance: 0 };
  }
  return {
    triggered: Math.random() < chance,
    chance,
  };
}

export function getStartingReputationForClub(club: Club): number {
  return Math.max(
    MANAGER_MODE_CONFIG.minStartingReputation,
    Math.min(100, club.prestige - MANAGER_MODE_CONFIG.startingReputationOffset)
  );
}

export function styleToDefaultFormation(style: TacticalStyle): FormationId {
  switch (style) {
    case 'High Gegenpress':
      return '4-2-3-1';
    case 'Tiki-Taka Possession':
      return '4-3-3';
    case 'Direct Counter-Attack':
      return '3-5-2';
    case 'Pragmatic Low Block':
      return '5-3-2';
    case 'Fluid Wing Play':
      return '4-4-2';
    default:
      return '4-3-3';
  }
}

function toDirectorPhilosophy(
  philosophy?: RecruitmentPhilosophy,
  style?: TacticalStyle
): DirectorPhilosophy {
  switch (philosophy) {
    case 'moneyball_data':
      return 'Moneyball Data';
    case 'marquee_stars':
    case 'trophies_now':
      return 'Galactico Star Power';
    case 'youth_development':
      return 'Academy First';
    case 'domestic_grit':
      return 'Pragmatic Veteran Balance';
    default:
      return style === 'High Gegenpress' ? 'High-Press Purist' : 'Pragmatic Veteran Balance';
  }
}

export function toSimulationManagerAdapter(
  career: ManagerCareerState,
  club?: Club
): Manager {
  const { profile } = career;
  const baseAttr = Math.max(45, Math.min(95, Math.round(52 + profile.reputation * 0.4)));
  return {
    id: profile.id,
    name: profile.name,
    age: profile.age,
    nationality: profile.nationality,
    tacticalStyle: profile.tacticalStyle,
    preferredFormation: profile.preferredFormation,
    clubId: career.currentClubId,
    trustInDirector: career.boardTrust,
    wage:
      career.weeklyWage > 0
        ? career.weeklyWage
        : club
          ? (club.tier === 1 ? 65000 : club.tier === 2 ? 24000 : 8000)
          : 0,
    reputation: Math.max(10, Math.min(99, profile.reputation)),
    controlDesire: 'collaborator',
    seasonsAtClub: Math.max(1, profile.seasonsManaged + 1),
    attributes: {
      tactical: baseAttr,
      coaching: baseAttr,
      manManagement: Math.max(45, Math.min(95, Math.round((baseAttr + career.boardTrust) / 2))),
      youthDevelopment: Math.max(45, Math.min(92, baseAttr - 3)),
    },
    profileSnippet: `${profile.tacticalStyle} specialist managing in Manager Mode.`,
    careerStats: {
      matchesManaged: profile.wins + profile.draws + profile.losses,
      wins: profile.wins,
      draws: profile.draws,
      losses: profile.losses,
      titlesWon: profile.trophiesWon.length,
      promotionsWon: 0,
      timesSacked: profile.careerSackings,
    },
  };
}

/**
 * Lightweight synthetic Director object passed to simulationEngine so existing
 * weekly match, standings, and trust calculations target the player's club cleanly.
 */
export function toEngineDirectorAdapter(
  career: ManagerCareerState,
  club?: Club
): Director {
  const activeClubDir = club ? career.clubDirectors[club.id] : undefined;
  return {
    name: activeClubDir?.name || career.profile.name,
    age: activeClubDir?.age || career.profile.age,
    nationality: activeClubDir?.nationality || career.profile.nationality,
    favouriteClubId: club?.id || career.seasonHistory[0]?.clubId || 'arsenal',
    currentClubId: career.currentClubId,
    philosophy: toDirectorPhilosophy(activeClubDir?.philosophy, career.profile.tacticalStyle),
    reputation: Math.max(10, Math.min(100, career.profile.reputation)),
    yearsInCharge: career.profile.seasonsManaged + 1,
    trophiesWon: [...career.profile.trophiesWon],
    boardTrust: career.boardTrust,
    fanApproval: career.fanApproval,
    contractYears: career.contractYears ?? 2,
    salary: career.weeklyWage || (club ? (club.tier === 1 ? 55000 : club.tier === 2 ? 22000 : 7000) : 0),
    netSpend: 0,
  };
}

export function createManagerCareer(params: {
  name: string;
  nationality: string;
  age: number;
  tacticalStyle: TacticalStyle;
  startingClub: Club;
  clubs: Club[];
  owners: Owner[];
  managers: Manager[];
}): {
  career: ManagerCareerState;
  updatedClubs: Club[];
  updatedManagers: Manager[];
} {
  const startingReputation = getStartingReputationForClub(params.startingClub);
  const preferredFormation = styleToDefaultFormation(params.tacticalStyle);
  const clubDirectors = assignClubDirectors(params.clubs, params.owners);

  const profile: ManagerModeProfile = {
    id: 'user_manager',
    name: params.name.trim() || 'Alex Mercer',
    nationality: params.nationality.trim() || 'England',
    age: Math.max(24, Math.min(78, Math.round(params.age || 38))),
    startingAge: Math.max(24, Math.min(78, Math.round(params.age || 38))),
    tacticalStyle: params.tacticalStyle,
    preferredFormation,
    reputation: startingReputation,
    trophiesWon: [],
    wins: 0,
    draws: 0,
    losses: 0,
    seasonsManaged: 0,
    careerSackings: 0,
  };

  const startingContract = generateManagerContractTerms(params.startingClub, startingReputation);

  const career: ManagerCareerState = {
    profile,
    currentClubId: params.startingClub.id,
    contractYears: startingContract.contractYears,
    weeklyWage: startingContract.weeklyWage,
    boardTrust: 78,
    fanApproval: 76,
    previousSeasonFinish: null,
    clubDirectors,
    seasonHistory: [],
    activeOffers: [],
    playerRequests: [],
    controlModifier: 0,
    directorReceptivityPenalty: 0,
    directorRequestCooldowns: {},
    directorRequestHistory: [],
    pendingDirectorCounterOffer: null,
    publicBackingWeeksRemaining: 0,
    sackedBanner: null,
    pendingSeasonEnd: null,
    isRetired: false,
  };

  const adapterMgr = toSimulationManagerAdapter(career, params.startingClub);

  // Move any incumbent AI manager at the chosen starting club cleanly to free agency
  // so the fixed AI manager pool preserves its exact count & never retires/spawns.
  const updatedManagers = params.managers.map(m =>
    m.clubId === params.startingClub.id
      ? { ...m, clubId: null, seasonsAtClub: 0 }
      : m
  );

  // Keep club.managerId === null at the user's club so AI manager pool invariants stay clean
  // (we supply adapterMgr dynamically during match/UI calls and skip AI hiring for userClubId).
  const updatedClubs = params.clubs.map(c => {
    if (c.id !== params.startingClub.id) return c;
    const starterLineup = autoPickLineup(c, preferredFormation, adapterMgr);
    return {
      ...c,
      managerId: null,
      managerVacancyWeeksRemaining: undefined,
      lineup: starterLineup,
    };
  });

  return {
    career,
    updatedClubs,
    updatedManagers,
  };
}

export function computeClubExpectedPosition(
  club: Club,
  tierClubs: Club[]
): { targetRank: number; maxAcceptableRank: number; label: string } {
  const ordered = [...tierClubs].sort((a, b) => b.prestige - a.prestige);
  const rankIdx = Math.max(0, ordered.findIndex(c => c.id === club.id));
  const total = Math.max(1, ordered.length);
  const exp = (club.fanExpectation || '').toLowerCase();

  if (exp.includes('title') || exp.includes('champion')) {
    return { targetRank: 1, maxAcceptableRank: 3, label: club.fanExpectation };
  }
  if (exp.includes('top 4') || exp.includes('champions league')) {
    return { targetRank: 4, maxAcceptableRank: 6, label: club.fanExpectation };
  }
  if (exp.includes('automatic promotion')) {
    return { targetRank: 2, maxAcceptableRank: 4, label: club.fanExpectation };
  }
  if (exp.includes('promotion') || exp.includes('playoff')) {
    return { targetRank: 5, maxAcceptableRank: 8, label: club.fanExpectation };
  }
  if (exp.includes('europa') || exp.includes('top half')) {
    return { targetRank: Math.round(total * 0.4), maxAcceptableRank: Math.round(total * 0.55), label: club.fanExpectation };
  }
  if (exp.includes('survival') || exp.includes('avoid relegation')) {
    const safeLine = club.tier === 1 ? 17 : 21;
    return { targetRank: Math.max(1, safeLine - 2), maxAcceptableRank: safeLine, label: club.fanExpectation };
  }

  const prestigeTarget = Math.max(1, Math.min(total, rankIdx + 1));
  return {
    targetRank: prestigeTarget,
    maxAcceptableRank: Math.min(total, prestigeTarget + 3),
    label: club.fanExpectation || `Finish around #${prestigeTarget}`,
  };
}

export function evaluateManagerMidSeasonSacking(params: {
  career: ManagerCareerState;
  club: Club;
  owner: Owner;
  allClubs: Club[];
  currentWeek: number;
}): { sacked: boolean; reason?: string } {
  const { career, club, owner } = params;
  const recentLosses = club.form.slice(0, 5).filter(r => r === 'L').length;
  const recentDraws = club.form.slice(0, 5).filter(r => r === 'D').length;
  const ptsPerGame = club.played > 0 ? club.points / club.played : 1.5;

  const tierClubs = params.allClubs
    .filter(c => c.tier === club.tier)
    .sort((a, b) => b.points - a.points || b.goalDifference - a.goalDifference || b.goalsFor - a.goalsFor);
  const currentPos = Math.max(1, tierClubs.findIndex(c => c.id === club.id) + 1);
  const { targetRank, maxAcceptableRank } = computeClubExpectedPosition(club, tierClubs);
  const posGap = currentPos - maxAcceptableRank;

  const isPubliclyBacked = (career.publicBackingWeeksRemaining ?? 0) > 0;
  const effectiveTrust = Math.min(
    100,
    career.boardTrust + (isPubliclyBacked ? MANAGER_MODE_CONFIG.directorRequests.publicBackingTrustFloorProtection : 0)
  );
  const bufferedGap = posGap - (isPubliclyBacked ? 3 : 0);

  // Reuse owner.patience thresholds + expectation shortfall
  switch (owner.patience) {
    case 'volatile':
      if (effectiveTrust <= 18) {
        return {
          sacked: true,
          reason: `Volatile chairman ${owner.name} dismissed you after board trust collapsed to ${career.boardTrust}%.`,
        };
      }
      if (!isPubliclyBacked && club.played >= 8 && recentLosses >= 4 && bufferedGap >= 3) {
        return {
          sacked: true,
          reason: `${club.name} sit #${currentPos} (target #${targetRank}–#${maxAcceptableRank}) after ${recentLosses} defeats in 5 games; ${owner.name} lost patience immediately.`,
        };
      }
      return { sacked: false };

    case 'impatient':
      if (effectiveTrust <= 10) {
        return {
          sacked: true,
          reason: `Impatient owner ${owner.name} ended your tenure once board trust hit ${career.boardTrust}%.`,
        };
      }
      if (!isPubliclyBacked && club.played >= 12 && bufferedGap >= 5 && (recentLosses >= 4 || ptsPerGame < 0.9)) {
        return {
          sacked: true,
          reason: `Sitting #${currentPos} far adrift of ${club.name}'s ${club.fanExpectation} target triggered an urgent board dismissal.`,
        };
      }
      return { sacked: false };

    case 'patient':
      if (effectiveTrust <= 0 && club.played >= 16) {
        return {
          sacked: true,
          reason: `Even a patient board could no longer back the project at #${currentPos} with trust at 0%.`,
        };
      }
      return { sacked: false };

    case 'balanced':
    default:
      if (effectiveTrust <= 0) {
        return {
          sacked: true,
          reason: `Chairman ${owner.name} relieved you of duties after board trust fell to 0%.`,
        };
      }
      if (!isPubliclyBacked && club.played >= 18 && bufferedGap >= 6 && recentLosses + recentDraws >= 5 && effectiveTrust <= 20) {
        return {
          sacked: true,
          reason: `A prolonged winless run leaving ${club.name} in #${currentPos} exhausted the board's patience.`,
        };
      }
      return { sacked: false };
  }
}

export interface TargetRequestOutcome {
  accepted: boolean;
  reason: string;
  fee: number;
  wage: number;
  updatedClubs?: Club[];
  updatedFreeAgents?: Player[];
  updatedOwners?: Owner[];
  newRecord?: TransferRecord;
}

export function evaluateManagerTransferRequest(params: {
  player: Player;
  sellingClub: Club | null;
  buyingClub: Club;
  clubs: Club[];
  freeAgents: Player[];
  owners: Owner[];
  career: ManagerCareerState;
  clubDirector: ClubDirector;
  seasonYear: number;
  currentWeek: number;
}): TargetRequestOutcome {
  const {
    player,
    sellingClub,
    buyingClub,
    clubs,
    freeAgents,
    owners,
    career,
    clubDirector,
    seasonYear,
    currentWeek,
  } = params;

  const owner = owners.find(o => o.id === buyingClub.ownerId);
  if (!owner) {
    return { accepted: false, reason: 'Club board structure unavailable.', fee: 0, wage: 0 };
  }

  if (!isTransferWindowOpen(currentWeek)) {
    return {
      accepted: false,
      reason: 'Transfer window is closed (open Weeks 1–6 and 20–24).',
      fee: 0,
      wage: 0,
    };
  }

  const dirCfg = MANAGER_MODE_CONFIG.directors[clubDirector.personality];
  const effectiveControl = calculateEffectiveControl(
    clubDirector.personality,
    career.profile.reputation,
    career.controlModifier || 0
  );
  if (!dirCfg.allowRequests && !dirCfg.allowDirectSign && effectiveControl <= 0) {
    return {
      accepted: false,
      reason: `${clubDirector.name} operates as a Dictator and does not accept manager transfer requests.`,
      fee: 0,
      wage: 0,
    };
  }

  if (buyingClub.squad.length >= 25) {
    return {
      accepted: false,
      reason: `${clubDirector.name}: "Our 25-man squad is full. We cannot add ${player.name} without space."`,
      fee: 0,
      wage: 0,
    };
  }

  if (player.isInjured || player.retiringAtSeasonEnd) {
    return {
      accepted: false,
      reason: `${clubDirector.name}: "${player.name} fails our medical/retirement availability criteria right now."`,
      fee: 0,
      wage: 0,
    };
  }

  const proposedFee = sellingClub ? Math.round(player.value * 1.05) : 0;
  const proposedWage = Math.max(1000, Math.round(player.wage * 1.12));

  const validation = evaluateSigning({
    player,
    sellingClub,
    buyingClub,
    owner,
    fee: proposedFee,
    wage: proposedWage,
  });

  if (!validation.ok) {
    return {
      accepted: false,
      reason: `${clubDirector.name} rejected the request: ${validation.reason}`,
      fee: proposedFee,
      wage: proposedWage,
    };
  }

  const adapterMgr = toSimulationManagerAdapter(career, buyingClub);
  const styleFit = evaluatePlayerStyleFit(adapterMgr, player);

  // Philosophy & squad need modifier
  let affinityDelta = 0;
  if (clubDirector.philosophy === 'youth_development') {
    affinityDelta += player.age <= 22 ? 14 : player.age >= 30 ? -16 : 0;
  } else if (clubDirector.philosophy === 'marquee_stars') {
    affinityDelta += player.overall >= 78 ? 14 : player.overall < 68 ? -14 : 0;
  } else if (clubDirector.philosophy === 'moneyball_data') {
    affinityDelta +=
      player.growthMomentum === 'breakout' || player.growthMomentum === 'rapid'
        ? 14
        : player.age >= 31
          ? -12
          : 2;
  } else if (clubDirector.philosophy === 'domestic_grit') {
    affinityDelta += player.age >= 24 && player.age <= 30 ? 8 : 0;
  }

  if (styleFit.label === 'Ideal Fit') affinityDelta += 10;
  else if (styleFit.label === 'Strong Fit') affinityDelta += 5;
  else if (styleFit.label === 'Misfit') affinityDelta -= 10;

  // Guard against weak or wildly overpriced targets relative to tier
  const tierFloor = buyingClub.tier === 1 ? 68 : buyingClub.tier === 2 ? 61 : 54;
  if (player.overall < tierFloor) {
    affinityDelta -= 25;
  }

  const approvalChance = Math.max(8, Math.min(96, effectiveControl + affinityDelta));
  const accepted = Math.random() * 100 < approvalChance;

  if (!accepted) {
    const pushback =
      clubDirector.personality === 'independent'
        ? `${clubDirector.name} (${effectiveControl}% influence) declined your request for ${player.name}, preferring to stick to his own shortlist (${clubDirector.philosophy.replace('_', ' ')}).`
        : `${clubDirector.name} weighed your request (${effectiveControl}% influence) but passed on ${player.name} over value and ${clubDirector.philosophy.replace('_', ' ')} alignment.`;
    return {
      accepted: false,
      reason: pushback,
      fee: proposedFee,
      wage: proposedWage,
    };
  }

  const engineDir = toEngineDirectorAdapter(career, buyingClub);
  const result = completeSigning({
    player,
    sellingClub,
    buyingClub,
    clubs,
    freeAgents,
    director: engineDir,
    owner,
    manager: adapterMgr,
    fee: proposedFee,
    wage: proposedWage,
    contractYears: player.age >= 32 ? 2 : 4,
    season: seasonYear,
    week: currentWeek,
    initiatedBy: 'director',
    note: `Requested by ${career.profile.name} · Signed by Sporting Director ${clubDirector.name}`,
    trustDelta: 0,
  });

  return {
    accepted: true,
    reason: `${clubDirector.name} approved your request and signed ${player.name} (${proposedFee > 0 ? `£${(proposedFee / 1000000).toFixed(2)}M` : 'Free Transfer'}, £${(proposedWage / 1000).toFixed(0)}k/wk).`,
    fee: proposedFee,
    wage: proposedWage,
    updatedClubs: result.clubs,
    updatedFreeAgents: result.freeAgents,
    updatedOwners: owners.map(o => (o.id === result.owner.id ? result.owner : o)),
    newRecord: result.record,
  };
}

export function getManagerRequestWindowKey(seasonYear: number, week: number): string {
  if (week <= 6) return `${seasonYear}_summer`;
  if (week < 20) return `${seasonYear}_autumn`;
  if (week <= 24) return `${seasonYear}_january`;
  return `${seasonYear}_spring`;
}

export interface PlayerRequestOutcome {
  accepted: boolean;
  status: Exclude<ManagerPlayerRequestStatus, 'pending'>;
  reason: string;
  updatedClubs?: Club[];
  newRecord?: TransferRecord;
}

export function evaluateManagerSaleRequest(params: {
  player: Player;
  club: Club;
  clubs: Club[];
  career: ManagerCareerState;
  clubDirector: ClubDirector;
  seasonYear: number;
  currentWeek: number;
}): PlayerRequestOutcome {
  const { player, club, clubs, career, clubDirector, seasonYear, currentWeek } = params;

  if (!isTransferWindowOpen(currentWeek)) {
    return {
      accepted: false,
      status: 'ignored',
      reason: 'Transfer window is closed (open Weeks 1–6 and 20–24).',
    };
  }

  if (!club.squad.some(p => p.id === player.id)) {
    return {
      accepted: false,
      status: 'ignored',
      reason: `${player.name} is no longer registered in the ${club.name} first-team squad.`,
    };
  }

  if (player.isInjured || player.retiringAtSeasonEnd) {
    return {
      accepted: false,
      status: 'ignored',
      reason: player.isInjured
        ? `${clubDirector.name} declined to list ${player.name} while he is injured.`
        : `${clubDirector.name} declined to market ${player.name} ahead of his scheduled retirement.`,
    };
  }

  if (club.squad.length <= 16) {
    return {
      accepted: false,
      status: 'ignored',
      reason: `${clubDirector.name} refused to sanction a sale while the squad only has ${club.squad.length} players.`,
    };
  }

  const dirCfg = MANAGER_MODE_CONFIG.directors[clubDirector.personality];
  const effectiveControl = calculateEffectiveControl(
    clubDirector.personality,
    career.profile.reputation,
    career.controlModifier || 0
  );
  if (!dirCfg.allowRequests && !dirCfg.allowDirectSign && effectiveControl <= 0) {
    return {
      accepted: false,
      status: 'ignored',
      reason: `${clubDirector.name} operates as a Dictator and ignored your request to sell ${player.name}.`,
    };
  }

  const offers = getTransferOffers(player, clubs, club.id);
  if (offers.length === 0) {
    return {
      accepted: false,
      status: 'ignored',
      reason: `${clubDirector.name} circulated ${player.name}, but no rival club has the budget or space to bid right now.`,
    };
  }

  const topOffer = offers[0];
  const adapterMgr = toSimulationManagerAdapter(career, club);
  const styleFit = evaluatePlayerStyleFit(adapterMgr, player);

  let affinityDelta = 0;
  if (clubDirector.philosophy === 'youth_development') {
    affinityDelta += player.age >= 29 ? 12 : player.age <= 21 ? -14 : 0;
  } else if (clubDirector.philosophy === 'marquee_stars') {
    const marqueeFloor = club.tier === 1 ? 75 : club.tier === 2 ? 68 : 61;
    affinityDelta += player.overall >= 82 ? -14 : player.overall < marqueeFloor ? 10 : 0;
  } else if (clubDirector.philosophy === 'moneyball_data') {
    affinityDelta += topOffer.fee >= player.value ? 10 : -4;
    if (player.contractYears <= 1) affinityDelta += 10;
  } else if (clubDirector.philosophy === 'domestic_grit') {
    affinityDelta += player.age >= 31 ? 6 : 0;
  }

  if (styleFit.label === 'Misfit') affinityDelta += 8;
  else if (styleFit.label === 'Ideal Fit') affinityDelta -= 6;

  const approvalChance = Math.max(8, Math.min(96, effectiveControl + affinityDelta));
  const accepted = Math.random() * 100 < approvalChance;

  if (!accepted) {
    const pushback =
      clubDirector.personality === 'independent'
        ? `${clubDirector.name} (${effectiveControl}% influence) ignored your request to sell ${player.name}, preferring to manage departures on his own terms.`
        : `${clubDirector.name} weighed your sale request (${effectiveControl}% influence) but opted to keep ${player.name} for now.`;
    return {
      accepted: false,
      status: 'ignored',
      reason: pushback,
    };
  }

  const engineDir = toEngineDirectorAdapter(career, club);
  const saleResult = completeSale({
    player,
    sellerClub: club,
    buyingClub: topOffer.club,
    clubs,
    director: engineDir,
    manager: adapterMgr,
    fee: topOffer.fee,
    wage: topOffer.wage,
    season: seasonYear,
    week: currentWeek,
    initiatedBy: 'director',
    note: `Sale requested by ${career.profile.name} · Completed by Sporting Director ${clubDirector.name}`,
    trustDelta: 0,
  });

  return {
    accepted: true,
    status: 'accepted',
    reason: `${clubDirector.name} accepted your request and sold ${player.name} to ${topOffer.club.name} for £${(topOffer.fee / 1000000).toFixed(2)}M.`,
    updatedClubs: saleResult.clubs,
    newRecord: saleResult.record,
  };
}

export function evaluateManagerRenewalRequest(params: {
  player: Player;
  club: Club;
  clubs: Club[];
  career: ManagerCareerState;
  clubDirector: ClubDirector;
  seasonYear: number;
  currentWeek: number;
}): PlayerRequestOutcome {
  const { player, club, clubs, career, clubDirector, seasonYear, currentWeek } = params;

  if (!club.squad.some(p => p.id === player.id)) {
    return {
      accepted: false,
      status: 'ignored',
      reason: `${player.name} is no longer in the ${club.name} squad.`,
    };
  }

  if (player.retiringAtSeasonEnd) {
    return {
      accepted: false,
      status: 'ignored',
      reason: `${clubDirector.name} noted ${player.name} is retiring at season end and cannot sign an extension.`,
    };
  }

  if (player.contractYears >= 5) {
    return {
      accepted: false,
      status: 'ignored',
      reason: `${clubDirector.name} ignored the request — ${player.name} is already tied down for ${player.contractYears} years.`,
    };
  }

  const dirCfg = MANAGER_MODE_CONFIG.directors[clubDirector.personality];
  const effectiveControl = calculateEffectiveControl(
    clubDirector.personality,
    career.profile.reputation,
    career.controlModifier || 0
  );
  if (!dirCfg.allowRequests && !dirCfg.allowDirectSign && effectiveControl <= 0) {
    return {
      accepted: false,
      status: 'ignored',
      reason: `${clubDirector.name} operates as a Dictator and ignored your contract renewal request for ${player.name}.`,
    };
  }

  const usedWages = club.squad.reduce((sum, p) => sum + p.wage, 0);
  const wageHeadroom = club.wageBudget - usedWages;
  if (wageHeadroom < 0) {
    return {
      accepted: false,
      status: 'ignored',
      reason: `${clubDirector.name} declined to renew ${player.name} because weekly wages (£${(usedWages / 1000).toFixed(0)}k) already exceed the £${(club.wageBudget / 1000).toFixed(0)}k budget.`,
    };
  }

  const desiredBump = Math.max(500, Math.round(player.wage * 0.12));
  const bump = Math.min(wageHeadroom, desiredBump);
  const newWage = player.wage + Math.max(0, bump);
  const newYears = Math.min(5, Math.max(player.contractYears + 2, player.age >= 32 ? 2 : 3));
  const adapterMgr = toSimulationManagerAdapter(career, club);
  const styleFit = evaluatePlayerStyleFit(adapterMgr, player);

  let affinityDelta = 0;
  if (player.contractYears <= 1) affinityDelta += 16;
  if (clubDirector.philosophy === 'youth_development') {
    affinityDelta += player.age <= 24 ? 14 : player.age >= 31 ? -14 : 0;
  } else if (clubDirector.philosophy === 'marquee_stars') {
    affinityDelta += player.overall >= 79 ? 12 : player.overall < 68 ? -10 : 0;
  } else if (clubDirector.philosophy === 'moneyball_data') {
    affinityDelta +=
      player.growthMomentum === 'breakout' || player.growthMomentum === 'rapid'
        ? 12
        : player.growthMomentum === 'cooling'
          ? -10
          : 2;
  } else if (clubDirector.philosophy === 'domestic_grit') {
    affinityDelta += player.age >= 24 && player.age <= 30 ? 8 : 0;
  }

  if (styleFit.label === 'Ideal Fit') affinityDelta += 8;
  else if (styleFit.label === 'Strong Fit') affinityDelta += 4;
  else if (styleFit.label === 'Misfit') affinityDelta -= 10;

  const approvalChance = Math.max(8, Math.min(96, effectiveControl + affinityDelta));
  const accepted = Math.random() * 100 < approvalChance;

  if (!accepted) {
    const pushback =
      clubDirector.personality === 'independent'
        ? `${clubDirector.name} (${effectiveControl}% influence) ignored your renewal request for ${player.name}, preferring to reassess contracts later.`
        : `${clubDirector.name} weighed your renewal request (${effectiveControl}% influence) but held off extending ${player.name} under the ${clubDirector.philosophy.replace('_', ' ')} plan.`;
    return {
      accepted: false,
      status: 'ignored',
      reason: pushback,
    };
  }

  const renewedPlayer: Player = {
    ...player,
    wage: newWage,
    contractYears: newYears,
    happiness: Math.min(100, player.happiness + 15),
    morale: 'ecstatic',
  };

  const updatedClubs = clubs.map(c =>
    c.id === club.id
      ? {
          ...c,
          squad: c.squad.map(p => (p.id === player.id ? renewedPlayer : p)),
        }
      : c
  );

  const newRecord: TransferRecord = {
    id: `tr_${seasonYear}_w${currentWeek}_${player.id}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    season: seasonYear,
    week: currentWeek,
    type: 'renewal',
    playerId: player.id,
    playerName: player.name,
    position: player.position,
    age: player.age,
    overall: player.overall,
    fromClubId: club.id,
    toClubId: club.id,
    fee: 0,
    wage: newWage,
    contractYears: newYears,
    initiatedBy: 'director',
    note: `Renewal requested by ${career.profile.name} · Extended ${newYears}y at £${(newWage / 1000).toFixed(0)}k/wk by Sporting Director ${clubDirector.name}`,
  };

  return {
    accepted: true,
    status: 'accepted',
    reason: `${clubDirector.name} accepted your request and renewed ${player.name} for ${newYears} years at £${(newWage / 1000).toFixed(0)}k/wk.`,
    updatedClubs,
    newRecord,
  };
}

/**
 * Autonomous weekly AI Sporting Director recruitment & squad maintenance
 * for the player's club when playing in Manager Mode.
 */
export function runAISportingDirectorWeeklyActivity(params: {
  currentWeek: number;
  seasonYear: number;
  userClubId: string;
  clubDirector: ClubDirector;
  clubs: Club[];
  freeAgents: Player[];
  owners: Owner[];
  managerAdapter: Manager;
  transferHistory: TransferRecord[];
}): {
  clubs: Club[];
  freeAgents: Player[];
  owners: Owner[];
  newTransfers: TransferRecord[];
  pressHeadlines: Array<{
    title: string;
    source: string;
    category: 'transfer' | 'boardroom';
    sentiment: 'positive' | 'neutral' | 'negative';
  }>;
} {
  const {
    currentWeek,
    seasonYear,
    userClubId,
    clubDirector,
    clubs,
    freeAgents,
    owners,
    managerAdapter,
    transferHistory,
  } = params;

  const newTransfers: TransferRecord[] = [];
  const pressHeadlines: Array<{
    title: string;
    source: string;
    category: 'transfer' | 'boardroom';
    sentiment: 'positive' | 'neutral' | 'negative';
  }> = [];

  const clubIdx = clubs.findIndex(c => c.id === userClubId);
  if (clubIdx === -1) {
    return { clubs, freeAgents, owners, newTransfers, pressHeadlines };
  }

  let workingClubs = [...clubs];
  let workingFA = [...freeAgents];
  let workingOwners = [...owners];

  const myClub = workingClubs[clubIdx];
  const owner = workingOwners.find(o => o.id === myClub.ownerId);
  if (!owner) {
    return { clubs, freeAgents, owners, newTransfers, pressHeadlines };
  }

  const windowOpen = isTransferWindowOpen(currentWeek);
  const cfg = MANAGER_MODE_CONFIG.directors[clubDirector.personality];

  // 1. Contract renewals for key 1-year expiring stars during season
  if (currentWeek >= 10 && currentWeek <= 44 && currentWeek % 4 === 0) {
    const usedWages = myClub.squad.reduce((s, p) => s + p.wage, 0);
    const wageHeadroom = myClub.wageBudget - usedWages;
    const expiringStar = myClub.squad
      .filter(p => !p.retiringAtSeasonEnd && p.contractYears <= 1 && p.overall >= (myClub.tier === 1 ? 73 : myClub.tier === 2 ? 67 : 60))
      .sort((a, b) => b.overall - a.overall)[0];

    if (expiringStar && wageHeadroom > 0 && Math.random() < 0.55) {
      const bump = Math.min(wageHeadroom, Math.round(expiringStar.wage * 0.12));
      const newWage = expiringStar.wage + Math.max(0, bump);
      const newYears = expiringStar.age >= 32 ? 2 : 3;
      const renewedClub: Club = {
        ...myClub,
        squad: myClub.squad.map(p =>
          p.id === expiringStar.id
            ? { ...p, contractYears: newYears, wage: newWage, happiness: Math.min(100, p.happiness + 6) }
            : p
        ),
      };
      workingClubs = workingClubs.map(c => (c.id === myClub.id ? renewedClub : c));
      newTransfers.push({
        id: `tr_dir_ren_${seasonYear}_w${currentWeek}_${expiringStar.id}`,
        season: seasonYear,
        week: currentWeek,
        type: 'renewal',
        playerId: expiringStar.id,
        playerName: expiringStar.name,
        position: expiringStar.position,
        age: expiringStar.age,
        overall: expiringStar.overall,
        fromClubId: myClub.id,
        toClubId: myClub.id,
        fee: 0,
        wage: newWage,
        contractYears: newYears,
        initiatedBy: 'director',
        note: `Contract extended by Sporting Director ${clubDirector.name}`,
      });
    }
  }

  if (!windowOpen) {
    return {
      clubs: workingClubs,
      freeAgents: workingFA,
      owners: workingOwners,
      newTransfers,
      pressHeadlines,
    };
  }

  // 2. Weekly AI Sporting Director Signing (or Youth promotion if thin)
  const latestClub = workingClubs.find(c => c.id === userClubId)!;
  const alreadySignedThisWeek = transferHistory.some(
    tr => tr.season === seasonYear && tr.week === currentWeek && tr.toClubId === userClubId
  );

  if (!alreadySignedThisWeek && latestClub.squad.length < 25 && Math.random() < cfg.weeklySignChance) {
    const posCounts: Record<PlayerPosition, number> = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
    latestClub.squad.forEach(p => {
      posCounts[p.position] += 1;
    });
    const minCounts: Record<PlayerPosition, number> = { GK: 2, DEF: 6, MID: 5, FWD: 3 };
    const neededPos = (['GK', 'DEF', 'MID', 'FWD'] as PlayerPosition[]).find(
      pos => posCounts[pos] < minCounts[pos]
    );

    const usedWages = latestClub.squad.reduce((s, p) => s + p.wage, 0);
    const wageRemaining = Math.max(0, latestClub.wageBudget - usedWages);
    const targetOvrMin = latestClub.tier === 1 ? 72 : latestClub.tier === 2 ? 65 : 58;

    const candidates: Array<{ player: Player; sellingClub: Club | null; score: number }> = [];

    workingFA.forEach(p => {
      if (p.isInjured || p.retiringAtSeasonEnd) return;
      if (p.overall < targetOvrMin - 2) return;
      if (p.wage > wageRemaining) return;
      if (neededPos && p.position !== neededPos) return;
      let score = p.overall;
      if (clubDirector.philosophy === 'youth_development' && p.age <= 22) score += 8;
      if (clubDirector.philosophy === 'moneyball_data' && (p.growthMomentum === 'breakout' || p.growthMomentum === 'rapid')) score += 8;
      candidates.push({ player: p, sellingClub: null, score });
    });

    workingClubs.forEach(c => {
      if (c.id === latestClub.id || c.squad.length <= 18) return;
      c.squad.forEach(p => {
        if (p.isInjured || p.retiringAtSeasonEnd) return;
        if (p.overall < targetOvrMin) return;
        if (neededPos && p.position !== neededPos) return;
        const estFee = Math.round(p.value * 1.05);
        const estWage = Math.round(p.wage * 1.1);
        if (estFee > latestClub.transferBudget * 0.85) return;
        if (estWage > wageRemaining) return;

        let score = p.overall + 3;
        if (clubDirector.philosophy === 'youth_development' && p.age <= 22) score += 9;
        if (clubDirector.philosophy === 'marquee_stars' && p.overall >= 79) score += 10;
        if (clubDirector.philosophy === 'moneyball_data' && p.growthMomentum === 'breakout') score += 9;
        if (clubDirector.philosophy === 'domestic_grit' && p.age >= 24 && p.age <= 30) score += 6;
        if (evaluatePlayerStyleFit(managerAdapter, p).label === 'Ideal Fit') score += 3;
        candidates.push({ player: p, sellingClub: c, score });
      });
    });

    candidates.sort((a, b) => b.score - a.score);
    const chosen = candidates.slice(0, 5)[Math.floor(Math.random() * Math.min(5, candidates.length))];

    if (chosen) {
      const fee = chosen.sellingClub ? Math.round(chosen.player.value * 1.05) : 0;
      const wage = Math.max(1000, Math.round(chosen.player.wage * 1.1));
      const check = evaluateSigning({
        player: chosen.player,
        sellingClub: chosen.sellingClub,
        buyingClub: latestClub,
        owner,
        fee,
        wage,
      });

      if (check.ok) {
        const engineDir: Director = {
          name: clubDirector.name,
          age: clubDirector.age,
          nationality: clubDirector.nationality,
          favouriteClubId: latestClub.id,
          currentClubId: latestClub.id,
          philosophy: toDirectorPhilosophy(clubDirector.philosophy),
          reputation: 65,
          yearsInCharge: 2,
          trophiesWon: [],
          boardTrust: 75,
          fanApproval: 75,
          contractYears: 3,
          salary: 25000,
          netSpend: 0,
        };
        const res = completeSigning({
          player: chosen.player,
          sellingClub: chosen.sellingClub,
          buyingClub: latestClub,
          clubs: workingClubs,
          freeAgents: workingFA,
          director: engineDir,
          owner,
          manager: managerAdapter,
          fee,
          wage,
          contractYears: chosen.player.age >= 32 ? 2 : 4,
          season: seasonYear,
          week: currentWeek,
          initiatedBy: 'director',
          note: `Signed autonomously by Sporting Director ${clubDirector.name}`,
          trustDelta: 0,
        });
        workingClubs = res.clubs;
        workingFA = res.freeAgents;
        workingOwners = workingOwners.map(o => (o.id === res.owner.id ? res.owner : o));
        newTransfers.push(res.record);
        pressHeadlines.push({
          title: `${latestClub.shortName} Sporting Director ${clubDirector.name} completes deal for ${chosen.player.name}`,
          source: 'Club Wire',
          category: 'transfer',
          sentiment: 'positive',
        });
      }
    }
  }

  return {
    clubs: workingClubs,
    freeAgents: workingFA,
    owners: workingOwners,
    newTransfers,
    pressHeadlines,
  };
}

export function runManagerModeSeasonEndRenewals(
  club: Club,
  clubDirector: ClubDirector,
  seasonYear: number
): { updatedClub: Club; renewalRecords: TransferRecord[] } {
  const renewalRecords: TransferRecord[] = [];
  let usedWages = club.squad.reduce((s, p) => s + p.wage, 0);
  const updatedSquad = club.squad.map(p => {
    if (p.contractYears > 0 || p.retiringAtSeasonEnd) return p;

    let reSignChance = 0.68;
    if (p.overall >= 78) reSignChance += 0.2;
    else if (p.overall >= 72) reSignChance += 0.1;
    if (p.age >= 34) reSignChance -= 0.18;
    if (p.happiness < 50) reSignChance -= 0.2;

    if (usedWages + Math.round(p.wage * 0.08) <= club.wageBudget * 1.05 && Math.random() < reSignChance) {
      const newWage = Math.round(p.wage * 1.06);
      const newYears = p.age >= 32 ? 2 : 3;
      usedWages += newWage - p.wage;
      renewalRecords.push({
        id: `tr_dir_eos_ren_${seasonYear}_${p.id}`,
        season: seasonYear,
        week: 46,
        type: 'renewal',
        playerId: p.id,
        playerName: p.name,
        position: p.position,
        age: p.age,
        overall: p.overall,
        fromClubId: club.id,
        toClubId: club.id,
        fee: 0,
        wage: newWage,
        contractYears: newYears,
        initiatedBy: 'director',
        note: `Season-end renewal by Sporting Director ${clubDirector.name}`,
      });
      return {
        ...p,
        contractYears: newYears,
        wage: newWage,
      };
    }

    return p;
  });

  return {
    updatedClub: { ...club, squad: updatedSquad },
    renewalRecords,
  };
}

export function calculateSeasonEndReputation(params: {
  currentReputation: number;
  club: Club;
  finalPosition: number;
  tierClubs: Club[];
  wonTrophy?: string;
  isPromoted: boolean;
  isRelegated: boolean;
  previousSeasonFinish: ManagerCareerState['previousSeasonFinish'];
  wasSacked?: boolean;
}): {
  reputationBefore: number;
  reputationAfter: number;
  reputationDelta: number;
  reasons: string[];
} {
  const cfg = MANAGER_MODE_CONFIG.reputation;
  const {
    currentReputation,
    club,
    finalPosition,
    tierClubs,
    wonTrophy,
    isPromoted,
    isRelegated,
    previousSeasonFinish,
    wasSacked = false,
  } = params;

  const tierMult = cfg.tierMultiplier[club.tier] ?? 1.0;
  const reasons: string[] = [];
  let rawDelta = 0;

  // 1. Wins & losses record
  const winLossContribution =
    (club.won * cfg.winWeight - club.lost * cfg.lossPenaltyWeight) * tierMult;
  rawDelta += winLossContribution;
  reasons.push(
    `Match record (${club.won}W-${club.drawn}D-${club.lost}L): ${winLossContribution >= 0 ? '+' : ''}${winLossContribution.toFixed(1)}`
  );

  // 2. Expectations check
  const { targetRank, maxAcceptableRank } = computeClubExpectedPosition(club, tierClubs);
  if (finalPosition <= targetRank) {
    const beatBy = targetRank - finalPosition;
    const expGain = cfg.expectationMetBonus + beatBy * cfg.expectationExceededPerPlace;
    rawDelta += expGain;
    reasons.push(
      `Finished #${finalPosition} vs #${targetRank} board target: +${expGain.toFixed(1)}`
    );
  } else if (finalPosition > maxAcceptableRank) {
    const missBy = finalPosition - maxAcceptableRank;
    const expLoss = -(missBy * cfg.expectationMissedPerPlace);
    rawDelta += expLoss;
    reasons.push(
      `Missed expectation (#${finalPosition} vs #${maxAcceptableRank} min target): ${expLoss.toFixed(1)}`
    );
  } else {
    reasons.push(`Finished #${finalPosition} within board expectations: +0.0`);
  }

  // 3. Year-over-year progression or regression at the same club & division
  if (
    previousSeasonFinish &&
    previousSeasonFinish.clubId === club.id &&
    previousSeasonFinish.tier === club.tier
  ) {
    const diff = previousSeasonFinish.position - finalPosition;
    if (diff !== 0) {
      const yoyDelta = Math.max(
        -cfg.yearOverYearCap,
        Math.min(cfg.yearOverYearCap, diff * cfg.yearOverYearPerPlace)
      );
      rawDelta += yoyDelta;
      reasons.push(
        `${diff > 0 ? 'Improved' : 'Regressed'} ${Math.abs(diff)} places vs last season (#${previousSeasonFinish.position} -> #${finalPosition}): ${yoyDelta >= 0 ? '+' : ''}${yoyDelta.toFixed(1)}`
      );
    }
  }

  // 4. Trophies, promotion, relegation & dismissal
  if (wonTrophy) {
    rawDelta += cfg.trophyBonus;
    reasons.push(`Trophy won (${wonTrophy}): +${cfg.trophyBonus}`);
  }
  if (isPromoted && !wonTrophy) {
    rawDelta += cfg.promotionBonus;
    reasons.push(`Promotion secured: +${cfg.promotionBonus}`);
  }
  if (isRelegated) {
    rawDelta += cfg.relegationPenalty;
    reasons.push(`Relegation penalty: ${cfg.relegationPenalty}`);
  }
  if (wasSacked) {
    rawDelta += cfg.sackingPenalty;
    reasons.push(`Dismissed from post: ${cfg.sackingPenalty}`);
  }

  const roundedDelta = Math.round(rawDelta);
  const nextRep = Math.max(cfg.min, Math.min(cfg.max, currentReputation + roundedDelta));

  return {
    reputationBefore: currentReputation,
    reputationAfter: nextRep,
    reputationDelta: nextRep - currentReputation,
    reasons,
  };
}

export function extractSeasonReviewSnapshot(params: {
  club: Club;
  clubs: Club[];
  owners: Owner[];
  clubDirector: ClubDirector;
  gameweekHistory: GameweekRecord[];
  transferHistory: TransferRecord[];
  seasonYear: number;
  managerAge: number;
  summary: SeasonSummary;
  previousReputation: number;
  previousSeasonFinish: ManagerCareerState['previousSeasonFinish'];
  wasSacked?: boolean;
}): {
  record: ManagerSeasonRecord;
  reputationAfter: number;
} {
  const {
    club,
    clubs,
    owners,
    clubDirector,
    gameweekHistory,
    transferHistory,
    seasonYear,
    managerAge,
    summary,
    previousReputation,
    previousSeasonFinish,
    wasSacked = false,
  } = params;

  const owner = owners.find(o => o.id === club.ownerId);

  const tierClubs = clubs
    .filter(c => c.tier === club.tier)
    .sort((a, b) => b.points - a.points || b.goalDifference - a.goalDifference || b.goalsFor - a.goalsFor);

  const finalTable: ManagerSeasonTableRow[] = tierClubs.map(c => ({
    clubId: c.id,
    name: c.name,
    shortName: c.shortName,
    primaryColor: c.primaryColor,
    played: c.played,
    won: c.won,
    drawn: c.drawn,
    lost: c.lost,
    goalsFor: c.goalsFor,
    goalsAgainst: c.goalsAgainst,
    goalDifference: c.goalDifference,
    points: c.points,
  }));

  const leaguePosition = Math.max(1, finalTable.findIndex(r => r.clubId === club.id) + 1);
  const clubsById = new Map(clubs.map(c => [c.id, c]));

  // Collect all of this club's matches from current season's gameweekHistory
  const clubMatches: ManagerKeyResult[] = [];
  gameweekHistory
    .filter(gw => gw.seasonYear === seasonYear)
    .sort((a, b) => a.week - b.week)
    .forEach(gw => {
      const m = gw.results.find(
        r => r.homeClubId === club.id || r.awayClubId === club.id
      );
      if (!m) return;
      const isHome = m.homeClubId === club.id;
      const goalsFor = isHome ? m.homeScore : m.awayScore;
      const goalsAgainst = isHome ? m.awayScore : m.homeScore;
      const opponentId = isHome ? m.awayClubId : m.homeClubId;
      const opponentName = clubsById.get(opponentId)?.name || 'Rival';
      const outcome: 'W' | 'D' | 'L' =
        goalsFor > goalsAgainst ? 'W' : goalsFor < goalsAgainst ? 'L' : 'D';
      clubMatches.push({
        week: gw.week,
        opponentName,
        opponentId,
        isHome,
        goalsFor,
        goalsAgainst,
        outcome,
        label: `Week ${gw.week}`,
      });
    });

  // Select up to 4 key results: biggest win, worst defeat, highest-scoring thriller, season finale
  const pickedWeeks = new Set<number>();
  const keyResults: ManagerKeyResult[] = [];

  const biggestWin = [...clubMatches]
    .filter(m => m.outcome === 'W')
    .sort((a, b) => (b.goalsFor - b.goalsAgainst) - (a.goalsFor - a.goalsAgainst) || b.goalsFor - a.goalsFor)[0];
  if (biggestWin) {
    pickedWeeks.add(biggestWin.week);
    keyResults.push({ ...biggestWin, label: 'Statement Win' });
  }

  const heaviestDefeat = [...clubMatches]
    .filter(m => m.outcome === 'L')
    .sort((a, b) => (b.goalsAgainst - b.goalsFor) - (a.goalsAgainst - a.goalsFor) || b.goalsAgainst - a.goalsAgainst)[0];
  if (heaviestDefeat && !pickedWeeks.has(heaviestDefeat.week)) {
    pickedWeeks.add(heaviestDefeat.week);
    keyResults.push({ ...heaviestDefeat, label: 'Tough Defeat' });
  }

  const thriller = [...clubMatches]
    .filter(m => !pickedWeeks.has(m.week))
    .sort((a, b) => (b.goalsFor + b.goalsAgainst) - (a.goalsFor + a.goalsAgainst))[0];
  if (thriller) {
    pickedWeeks.add(thriller.week);
    keyResults.push({ ...thriller, label: 'High-Scoring Clash' });
  }

  const finale = clubMatches[clubMatches.length - 1];
  if (finale && !pickedWeeks.has(finale.week)) {
    pickedWeeks.add(finale.week);
    keyResults.push({ ...finale, label: 'Season Finale' });
  }

  keyResults.sort((a, b) => a.week - b.week);

  const topPlayer = [...club.squad].sort(
    (a, b) => b.goals - a.goals || b.assists - a.assists || b.overall - a.overall
  )[0];
  const topScorer = topPlayer
    ? {
        name: topPlayer.name,
        position: topPlayer.position,
        goals: topPlayer.goals,
        assists: topPlayer.assists,
        appearances: topPlayer.appearances,
      }
    : null;

  const wonTrophy = summary.playerClubWonTrophy;
  const trophiesWon = wonTrophy ? [wonTrophy] : [];

  const bestMoment = wonTrophy
    ? `Lifted the ${wonTrophy} trophy after finishing #${leaguePosition} with ${club.points} points.`
    : summary.isPromoted
      ? `Secured promotion out of the division finishing #${leaguePosition} on ${club.points} points.`
      : biggestWin
        ? `Thrashed ${biggestWin.opponentName} ${biggestWin.goalsFor}-${biggestWin.goalsAgainst} (${biggestWin.isHome ? 'Home' : 'Away'}) in Week ${biggestWin.week}.`
        : `Completed the ${seasonYear}/${seasonYear + 1} campaign with ${club.won} league victories.`;

  const worstMoment = wasSacked
    ? `Dismissed from ${club.name} following a difficult run against board expectations.`
    : summary.isRelegated
      ? `Suffered relegation after finishing #${leaguePosition} on ${club.points} points.`
      : heaviestDefeat
        ? `Fell ${heaviestDefeat.goalsFor}-${heaviestDefeat.goalsAgainst} to ${heaviestDefeat.opponentName} in Week ${heaviestDefeat.week}.`
        : `Experienced a demanding spell dropping points across ${club.lost} defeats.`;

  const directorTransfers = transferHistory.filter(
    tr =>
      tr.season === seasonYear &&
      (tr.toClubId === club.id || tr.fromClubId === club.id) &&
      (tr.initiatedBy === 'director' || tr.initiatedBy === 'manager')
  );

  const repResult = calculateSeasonEndReputation({
    currentReputation: previousReputation,
    club,
    finalPosition: leaguePosition,
    tierClubs,
    wonTrophy,
    isPromoted: summary.isPromoted,
    isRelegated: summary.isRelegated,
    previousSeasonFinish,
    wasSacked,
  });

  const { maxAcceptableRank } = computeClubExpectedPosition(club, tierClubs);
  const boardVerdict = wasSacked
    ? `Chairman ${owner?.name || 'The Board'} terminated your spell after results fell short of expectations.`
    : leaguePosition <= maxAcceptableRank
      ? `Chairman ${owner?.name || 'The Board'} praised your campaign (#${leaguePosition}, ${club.points} pts) under Sporting Director ${clubDirector.name}.`
      : `Chairman ${owner?.name || 'The Board'} noted disappointment finishing #${leaguePosition} behind the #${maxAcceptableRank} benchmark.`;

  const review: ManagerSeasonReview = {
    finalTable,
    keyResults,
    topScorer,
    bestMoment,
    worstMoment,
    directorTransfers,
    reputationBefore: repResult.reputationBefore,
    reputationAfter: repResult.reputationAfter,
    reputationDelta: repResult.reputationDelta,
    reputationReasons: repResult.reasons,
    boardVerdict,
  };

  const record: ManagerSeasonRecord = {
    seasonYear,
    age: managerAge,
    clubId: club.id,
    clubName: club.name,
    clubShortName: club.shortName,
    clubTier: club.tier,
    primaryColor: club.primaryColor,
    leaguePosition,
    totalTeams: finalTable.length,
    played: club.played,
    won: club.won,
    drawn: club.drawn,
    lost: club.lost,
    leaguePoints: club.points,
    trophiesWon,
    wasSacked,
    review,
  };

  return {
    record,
    reputationAfter: repResult.reputationAfter,
  };
}

export function generateManagerJobOffers(params: {
  reputation: number;
  currentClubId: string | null;
  clubs: Club[];
  clubDirectors: Record<string, ClubDirector>;
  owners: Owner[];
  justSacked?: boolean;
}): ManagerJobOffer[] {
  const {
    reputation,
    currentClubId,
    clubs,
    clubDirectors,
    owners,
    justSacked = false,
  } = params;

  const ownerById = new Map(owners.map(o => [o.id, o]));
  const cfg = MANAGER_MODE_CONFIG.jobOffers;
  const isUnemployed = currentClubId === null;

  // Build rank map per tier
  const rankByClubId = new Map<string, number>();
  ([1, 2, 3] as LeagueTier[]).forEach(tier => {
    clubs
      .filter(c => c.tier === tier)
      .sort((a, b) => b.points - a.points || b.goalDifference - a.goalDifference || b.prestige - a.prestige)
      .forEach((c, idx) => rankByClubId.set(c.id, idx + 1));
  });

  const eligiblePool = clubs.filter(c => {
    if (c.id === currentClubId) return false;
    const minNeeded = Math.max(0, c.prestige - cfg.reputationMargin);
    if (justSacked && c.tier === 1 && reputation < 70) return false;
    return reputation >= minNeeded || c.tier === 3;
  });

  // Weight toward clubs matching manager reputation
  const scored = eligiblePool
    .map(c => {
      const repFit = Math.max(1, 35 - Math.abs(c.prestige - (reputation + (justSacked ? 6 : 16))));
      const tierBoost =
        reputation >= 65 && c.tier === 1
          ? 20
          : reputation >= 35 && c.tier === 2
            ? 14
            : c.tier === 3
              ? 10
              : 2;
      const sackPenalty = justSacked && c.tier < 3 ? -12 : 0;
      return {
        club: c,
        weight: Math.max(1, repFit + tierBoost + sackPenalty + Math.random() * 14),
      };
    })
    .sort((a, b) => b.weight - a.weight);

  let targetCount = isUnemployed
    ? cfg.unemployedMinOffers +
      Math.floor(Math.random() * (cfg.unemployedMaxOffers - cfg.unemployedMinOffers + 1))
    : cfg.employedMinOffers +
      Math.floor(Math.random() * (cfg.employedMaxOffers - cfg.employedMinOffers + 1));

  if (justSacked) {
    targetCount = Math.min(targetCount, cfg.sackingMaxOffers);
  }
  if (reputation >= 72 && !justSacked) {
    targetCount = Math.min(cfg.employedMaxOffers, targetCount + 1);
  }

  const pickedClubs: Club[] = [];
  const candidates = scored.slice(0, Math.min(scored.length, 14));
  while (pickedClubs.length < targetCount && candidates.length > 0) {
    const idx = Math.floor(Math.random() * Math.min(candidates.length, 6));
    const [picked] = candidates.splice(idx, 1);
    if (picked) pickedClubs.push(picked.club);
  }

  // Guarantee at least one lower-tier club offer when unemployed so the player can never get stuck
  if (isUnemployed && !pickedClubs.some(c => c.tier === 3)) {
    const tier3Fallback = clubs
      .filter(c => c.tier === 3 && !pickedClubs.some(p => p.id === c.id))
      .sort((a, b) => a.prestige - b.prestige);
    if (tier3Fallback.length > 0) {
      const pick =
        tier3Fallback[Math.floor(Math.random() * Math.min(8, tier3Fallback.length))];
      if (pickedClubs.length >= targetCount && pickedClubs.length > 0) {
        pickedClubs[pickedClubs.length - 1] = pick;
      } else {
        pickedClubs.push(pick);
      }
    }
  }

  return pickedClubs.map((club, index) => {
    const owner = ownerById.get(club.ownerId);
    const dir = getOrCreateClubDirector(clubDirectors, club, owner);
    const effectiveControl = calculateEffectiveControl(dir.personality, reputation);
    const rank = rankByClubId.get(club.id) || 12;
    const isEmergency = isUnemployed && club.tier === 3 && index === pickedClubs.length - 1;
    const contractTerms = generateManagerContractTerms(club, reputation);

    return {
      id: `moffer_${club.id}_${Date.now()}_${index}`,
      clubId: club.id,
      clubName: club.name,
      clubTier: club.tier,
      clubPrestige: club.prestige,
      primaryColor: club.primaryColor,
      expectation: club.fanExpectation,
      patience: owner?.patience || 'balanced',
      directorName: dir.name,
      directorPersonality: dir.personality,
      effectiveControl,
      transferBudget: club.transferBudget,
      wageBudget: club.wageBudget,
      squadSize: club.squad.length,
      leaguePosition: rank,
      offeredContractYears: contractTerms.contractYears,
      offeredWeeklyWage: contractTerms.weeklyWage,
      reason: isEmergency
        ? `Emergency lower-tier lifeline from ${club.name} offering an immediate return to touchline management.`
        : justSacked
          ? `${club.name} are willing to hand you a fresh rebuild under Sporting Director ${dir.name}.`
          : `Impressed by your ${reputation} reputation, ${club.name} want you to lead their ${club.fanExpectation.toLowerCase()} campaign.`,
      isEmergencyOffer: isEmergency,
    };
  });
}

export function acceptManagerJobOffer(params: {
  career: ManagerCareerState;
  offer: ManagerJobOffer;
  clubs: Club[];
  managers: Manager[];
}): {
  updatedCareer: ManagerCareerState;
  updatedClubs: Club[];
  updatedManagers: Manager[];
} {
  const { career, offer, clubs, managers } = params;
  const targetClub = clubs.find(c => c.id === offer.clubId);
  if (!targetClub) {
    return { updatedCareer: career, updatedClubs: clubs, updatedManagers: managers };
  }

  const terms =
    typeof offer.offeredContractYears === 'number' &&
    offer.offeredContractYears >= 1 &&
    typeof offer.offeredWeeklyWage === 'number' &&
    offer.offeredWeeklyWage > 0
      ? {
          contractYears: Math.min(5, Math.max(1, offer.offeredContractYears)),
          weeklyWage: offer.offeredWeeklyWage,
        }
      : generateManagerContractTerms(targetClub, career.profile.reputation);

  const nextCareer: ManagerCareerState = {
    ...career,
    currentClubId: targetClub.id,
    contractYears: terms.contractYears,
    weeklyWage: terms.weeklyWage,
    boardTrust: 78,
    fanApproval: 76,
    activeOffers: [],
    playerRequests: [],
    controlModifier: 0,
    directorReceptivityPenalty: 0,
    directorRequestCooldowns: {},
    directorRequestHistory: [],
    pendingDirectorCounterOffer: null,
    publicBackingWeeksRemaining: 0,
    sackedBanner: null,
    pendingSeasonEnd: null,
  };

  const adapterMgr = toSimulationManagerAdapter(nextCareer, targetClub);

  // Move any incumbent AI head coach at the new club back to free agency cleanly
  const updatedManagers = managers.map(m =>
    m.clubId === targetClub.id ? { ...m, clubId: null, seasonsAtClub: 0 } : m
  );

  const updatedClubs = clubs.map(c => {
    if (c.id !== targetClub.id) return c;
    return {
      ...c,
      managerId: null,
      managerVacancyWeeksRemaining: undefined,
      lineup: syncLineupAfterSquadChange(
        {
          ...c,
          lineup: autoPickLineup(c, nextCareer.profile.preferredFormation, adapterMgr),
        },
        adapterMgr
      ),
    };
  });

  return {
    updatedCareer: nextCareer,
    updatedClubs,
    updatedManagers,
  };
}

/**
 * Losslessly converts the live Manager Mode world into playable Director Mode.
 * Preserves all clubs, squads, AI managers, season year, week, and transfer records.
 */
export function convertManagerCareerToDirectorMode(params: {
  career: ManagerCareerState;
  clubs: Club[];
}): {
  director: Director;
  updatedClubs: Club[];
} {
  const { career, clubs } = params;
  const currentClub = career.currentClubId
    ? clubs.find(c => c.id === career.currentClubId)
    : undefined;

  const director: Director = {
    name: career.profile.name,
    age: career.profile.age,
    nationality: career.profile.nationality,
    favouriteClubId: currentClub?.id || career.seasonHistory[0]?.clubId || clubs[0]?.id || 'arsenal',
    currentClubId: currentClub ? currentClub.id : null,
    philosophy: toDirectorPhilosophy(undefined, career.profile.tacticalStyle),
    reputation: Math.max(15, Math.min(100, career.profile.reputation)),
    yearsInCharge: career.profile.seasonsManaged,
    trophiesWon: [...career.profile.trophiesWon],
    boardTrust: currentClub ? career.boardTrust : 80,
    fanApproval: currentClub ? career.fanApproval : 75,
    contractYears: currentClub ? 3 : 0,
    salary: currentClub ? (currentClub.tier === 1 ? 55000 : currentClub.tier === 2 ? 22000 : 7000) : 0,
    netSpend: 0,
  };

  // Ensure the converted user club has no stale user_manager reference; it starts with
  // managerId = null so the new Director can appoint a Head Coach from the live Manager Market.
  const updatedClubs = clubs.map(c =>
    currentClub && c.id === currentClub.id
      ? {
          ...c,
          managerId: null,
          managerVacancyWeeksRemaining: 3,
        }
      : c
  );

  return {
    director,
    updatedClubs,
  };
}

export const DIRECTOR_REQUEST_LABELS: Record<DirectorRequestType, string> = {
  more_power: 'More Power',
  less_power: 'Less Power',
  pay_rise: 'Pay Rise',
  new_contract: 'New Contract',
  transfer_budget: 'Transfer Budget Increase',
  public_backing: 'Public Backing',
  mutual_termination: 'Mutual Termination',
};

function computeDirectorRequestReadiness(params: {
  career: ManagerCareerState;
  club: Club;
  clubs: Club[];
  owner: Owner;
  clubDirector: ClubDirector;
}): {
  readiness: number;
  effectiveControl: number;
  currentPos: number;
  targetRank: number;
  maxAcceptableRank: number;
} {
  const { career, club, clubs, owner, clubDirector } = params;
  const effectiveControl = calculateEffectiveControl(
    clubDirector.personality,
    career.profile.reputation,
    career.controlModifier || 0
  );

  const tierClubs = clubs
    .filter(c => c.tier === club.tier)
    .sort((a, b) => b.points - a.points || b.goalDifference - a.goalDifference || b.goalsFor - a.goalsFor);
  const currentPos = Math.max(1, tierClubs.findIndex(c => c.id === club.id) + 1);
  const { targetRank, maxAcceptableRank } = computeClubExpectedPosition(club, tierClubs);

  // 1. Personality factor
  const personalityBonus: Record<DirectorPersonality, number> = {
    hands_off: 18,
    collaborative: 8,
    independent: -8,
    dictator: -24,
  };

  // 2. Reputation & effective control factor
  const repControlBonus =
    Math.round(effectiveControl * 0.22) + Math.round((career.profile.reputation - 50) * 0.25);

  // 3. Recent form & league position
  const recentForm = club.form.slice(0, 5);
  const winsRecent = recentForm.filter(r => r === 'W').length;
  const lossesRecent = recentForm.filter(r => r === 'L').length;
  const formDelta = (winsRecent - lossesRecent) * 4;

  let positionDelta = 0;
  if (club.played >= 3) {
    if (currentPos <= targetRank) positionDelta = 10;
    else if (currentPos <= maxAcceptableRank) positionDelta = 4;
    else positionDelta = -Math.min(18, (currentPos - maxAcceptableRank) * 3);
  }

  // 4. Club patience
  const patienceBonus: Record<Owner['patience'], number> = {
    patient: 8,
    balanced: 2,
    impatient: -6,
    volatile: -12,
  };

  // 5. Receptivity penalty from repeated rejected requests
  const rejectionPenalty = career.directorReceptivityPenalty || 0;

  const readiness =
    (personalityBonus[clubDirector.personality] ?? 0) +
    repControlBonus +
    formDelta +
    positionDelta +
    (patienceBonus[owner.patience] ?? 0) -
    rejectionPenalty;

  return {
    readiness,
    effectiveControl,
    currentPos,
    targetRank,
    maxAcceptableRank,
  };
}

export interface DirectorRequestResult {
  status: DirectorRequestStatus;
  blockedByCooldownOrPending?: boolean;
  mutualTerminationCompleted?: boolean;
  message: string;
  updatedCareer: ManagerCareerState;
  updatedClubs?: Club[];
}

export function evaluateDirectorRequest(params: {
  requestType: DirectorRequestType;
  career: ManagerCareerState;
  club: Club;
  clubs: Club[];
  owner: Owner;
  allOwners?: Owner[];
  clubDirector: ClubDirector;
  seasonYear: number;
  currentWeek: number;
}): DirectorRequestResult {
  const {
    requestType,
    career,
    club,
    clubs,
    owner,
    allOwners,
    clubDirector,
    seasonYear,
    currentWeek,
  } = params;

  const reqCfg = MANAGER_MODE_CONFIG.directorRequests;
  const contractCfg = MANAGER_MODE_CONFIG.contracts;
  const currentAbsWeek = seasonYear * 46 + currentWeek;
  const normalized = normalizeManagerCareerState(career, clubs);

  if (normalized.pendingDirectorCounterOffer) {
    return {
      status: 'rejected',
      blockedByCooldownOrPending: true,
      message: `Respond to ${clubDirector.name}'s pending ${DIRECTOR_REQUEST_LABELS[normalized.pendingDirectorCounterOffer.requestType].toLowerCase()} counter-offer before submitting another request.`,
      updatedCareer: normalized,
    };
  }

  const cooldownUntil = normalized.directorRequestCooldowns?.[requestType] ?? 0;
  if (cooldownUntil > currentAbsWeek) {
    const weeksLeft = cooldownUntil - currentAbsWeek;
    return {
      status: 'rejected',
      blockedByCooldownOrPending: true,
      message: `${DIRECTOR_REQUEST_LABELS[requestType]} is on cooldown. Wait ${weeksLeft} more week${weeksLeft === 1 ? '' : 's'} before approaching ${clubDirector.name} again.`,
      updatedCareer: normalized,
    };
  }

  const { readiness, effectiveControl, currentPos } = computeDirectorRequestReadiness({
    career: normalized,
    club,
    clubs,
    owner,
    clubDirector,
  });

  const cooldownWeeks = reqCfg.cooldownWeeks[requestType] ?? 12;
  const nextCooldowns: Partial<Record<DirectorRequestType, number>> = {
    ...(normalized.directorRequestCooldowns ?? {}),
    [requestType]: currentAbsWeek + cooldownWeeks,
  };

  const makeRecord = (status: DirectorRequestStatus, message: string): DirectorRequestRecord => ({
    id: `dreq_${seasonYear}_w${currentWeek}_${requestType}_${Date.now()}`,
    type: requestType,
    status,
    seasonYear,
    week: currentWeek,
    message,
  });

  const appendHistory = (
    baseCareer: ManagerCareerState,
    status: DirectorRequestStatus,
    message: string
  ): DirectorRequestRecord[] => [
    makeRecord(status, message),
    ...(baseCareer.directorRequestHistory ?? []).slice(0, 14),
  ];

  // 2. Less power — ALWAYS accepted
  if (requestType === 'less_power') {
    if (effectiveControl <= 0) {
      return {
        status: 'rejected',
        blockedByCooldownOrPending: true,
        message: `${clubDirector.name} already holds full transfer control (your say is 0%).`,
        updatedCareer: normalized,
      };
    }
    const nextMod = Math.max(
      reqCfg.minPowerModifier,
      (normalized.controlModifier ?? 0) - reqCfg.powerDownStep
    );
    const nextControl = calculateEffectiveControl(
      clubDirector.personality,
      normalized.profile.reputation,
      nextMod
    );
    const msg = `${clubDirector.name} readily accepted your request to hand back authority. Your effective control dropped from ${effectiveControl}% to ${nextControl}%.`;
    const updatedCareer: ManagerCareerState = {
      ...normalized,
      controlModifier: nextMod,
      directorReceptivityPenalty: Math.max(0, (normalized.directorReceptivityPenalty ?? 0) - 4),
      directorRequestCooldowns: nextCooldowns,
      directorRequestHistory: appendHistory(normalized, 'accepted', msg),
    };
    return {
      status: 'accepted',
      message: msg,
      updatedCareer,
    };
  }

  // 1. More power
  if (requestType === 'more_power') {
    if (effectiveControl >= 100 || (normalized.controlModifier ?? 0) >= reqCfg.maxPowerModifier) {
      return {
        status: 'rejected',
        blockedByCooldownOrPending: true,
        message: `You already hold the maximum managerial authority available under ${clubDirector.name} (${effectiveControl}%).`,
        updatedCareer: normalized,
      };
    }
    const dictatorDrag = clubDirector.personality === 'dictator' ? -14 : 0;
    const chance = Math.max(10, Math.min(92, 42 + readiness + dictatorDrag));
    if (Math.random() * 100 < chance) {
      const nextMod = Math.min(
        reqCfg.maxPowerModifier,
        (normalized.controlModifier ?? 0) + reqCfg.powerUpStep
      );
      const nextControl = calculateEffectiveControl(
        clubDirector.personality,
        normalized.profile.reputation,
        nextMod
      );
      const msg = `${clubDirector.name} agreed to give you a louder voice in squad decisions. Effective control rose from ${effectiveControl}% to ${nextControl}%.`;
      const updatedCareer: ManagerCareerState = {
        ...normalized,
        controlModifier: nextMod,
        directorRequestCooldowns: nextCooldowns,
        directorRequestHistory: appendHistory(normalized, 'accepted', msg),
      };
      return { status: 'accepted', message: msg, updatedCareer };
    }

    const nextPenalty = Math.min(
      reqCfg.rejectionPenaltyCap,
      (normalized.directorReceptivityPenalty ?? 0) + reqCfg.rejectionPenaltyIncrement
    );
    const msg = `${clubDirector.name} (${MANAGER_MODE_CONFIG.directors[clubDirector.personality].shortLabel}) refused to cede further authority right now. Repeated rejections have soured receptivity.`;
    const updatedCareer: ManagerCareerState = {
      ...normalized,
      directorReceptivityPenalty: nextPenalty,
      directorRequestCooldowns: nextCooldowns,
      directorRequestHistory: appendHistory(normalized, 'rejected', msg),
    };
    return { status: 'rejected', message: msg, updatedCareer };
  }

  // 3. Pay rise (can accept, counter-offer, or reject)
  if (requestType === 'pay_rise') {
    const currentWage = normalized.weeklyWage;
    const tierCap = (contractCfg.tierWageCeiling[club.tier] ?? 65000) * 1.15;
    if (currentWage >= tierCap) {
      return {
        status: 'rejected',
        blockedByCooldownOrPending: true,
        message: `${clubDirector.name}: "Your £${(currentWage / 1000).toFixed(1)}k/wk salary is already at the top of ${club.name}'s pay structure."`,
        updatedCareer: normalized,
      };
    }

    const desiredWage = Math.min(
      Math.round(tierCap),
      Math.max(
        currentWage + 1000,
        Math.round((currentWage * (1 + reqCfg.payRiseTargetPct)) / 500) * 500
      )
    );
    const counterWage = Math.min(
      desiredWage - 500,
      Math.max(
        currentWage + 500,
        Math.round((currentWage * (1 + reqCfg.payRiseCounterPct)) / 500) * 500
      )
    );
    const wageStrain =
      club.squad.reduce((s, p) => s + p.wage, 0) > club.wageBudget * 0.96 ? -10 : 0;
    const score = 46 + readiness + wageStrain;

    if (score >= 66 || (score >= 54 && Math.random() * 100 < score)) {
      const msg = `${clubDirector.name} approved your pay rise! Weekly salary increased from £${(currentWage / 1000).toFixed(1)}k to £${(desiredWage / 1000).toFixed(1)}k/wk.`;
      const updatedCareer: ManagerCareerState = {
        ...normalized,
        weeklyWage: desiredWage,
        directorRequestCooldowns: nextCooldowns,
        directorRequestHistory: appendHistory(normalized, 'accepted', msg),
      };
      return { status: 'accepted', message: msg, updatedCareer };
    }

    if (score >= 34 && counterWage > currentWage) {
      const reqId = `dreq_${seasonYear}_w${currentWeek}_pay_rise_${Date.now()}`;
      const msg = `${clubDirector.name} turned down £${(desiredWage / 1000).toFixed(1)}k/wk but submitted a counter-offer of £${(counterWage / 1000).toFixed(1)}k/wk.`;
      const counterOffer: DirectorCounterOffer = {
        requestId: reqId,
        requestType: 'pay_rise',
        proposedWeeklyWage: counterWage,
        proposedContractYears: normalized.contractYears,
        message: msg,
        seasonYear,
        week: currentWeek,
      };
      const updatedCareer: ManagerCareerState = {
        ...normalized,
        pendingDirectorCounterOffer: counterOffer,
        directorRequestCooldowns: nextCooldowns,
        directorRequestHistory: appendHistory(normalized, 'counter_offer', msg),
      };
      return { status: 'counter_offer', message: msg, updatedCareer };
    }

    const nextPenalty = Math.min(
      reqCfg.rejectionPenaltyCap,
      (normalized.directorReceptivityPenalty ?? 0) + reqCfg.rejectionPenaltyIncrement
    );
    const msg = `${clubDirector.name} rejected your pay rise request, citing current results (#${currentPos}) and ${owner.patience} board expectations.`;
    const updatedCareer: ManagerCareerState = {
      ...normalized,
      directorReceptivityPenalty: nextPenalty,
      directorRequestCooldowns: nextCooldowns,
      directorRequestHistory: appendHistory(normalized, 'rejected', msg),
    };
    return { status: 'rejected', message: msg, updatedCareer };
  }

  // 4. New contract (can accept, counter-offer, or reject)
  if (requestType === 'new_contract') {
    const currentYears = normalized.contractYears;
    const currentWage = normalized.weeklyWage;
    const targetYears = Math.min(contractCfg.maxYears, Math.max(currentYears + 2, 3));
    const tierCap = (contractCfg.tierWageCeiling[club.tier] ?? 65000) * 1.1;
    const targetWage = Math.min(
      Math.round(tierCap),
      Math.max(currentWage, Math.round((currentWage * 1.12) / 500) * 500)
    );

    const counterYears = Math.min(
      contractCfg.maxYears,
      Math.max(currentYears + (currentYears < 4 ? 1 : 0), 2)
    );
    const counterWage = Math.min(
      Math.round(tierCap),
      Math.max(currentWage, Math.round((currentWage * 1.04) / 500) * 500)
    );

    const score = 48 + readiness;

    if (score >= 66 || (score >= 54 && Math.random() * 100 < score)) {
      const msg = `${clubDirector.name} agreed a new ${targetYears}-year contract at £${(targetWage / 1000).toFixed(1)}k/wk!`;
      const updatedCareer: ManagerCareerState = {
        ...normalized,
        contractYears: targetYears,
        weeklyWage: targetWage,
        directorRequestCooldowns: nextCooldowns,
        directorRequestHistory: appendHistory(normalized, 'accepted', msg),
      };
      return { status: 'accepted', message: msg, updatedCareer };
    }

    if (score >= 34 && (counterYears > currentYears || counterWage > currentWage)) {
      const reqId = `dreq_${seasonYear}_w${currentWeek}_new_contract_${Date.now()}`;
      const msg = `${clubDirector.name} countered with a shorter ${counterYears}-year deal at £${(counterWage / 1000).toFixed(1)}k/wk rather than committing to ${targetYears} years.`;
      const counterOffer: DirectorCounterOffer = {
        requestId: reqId,
        requestType: 'new_contract',
        proposedWeeklyWage: counterWage,
        proposedContractYears: counterYears,
        message: msg,
        seasonYear,
        week: currentWeek,
      };
      const updatedCareer: ManagerCareerState = {
        ...normalized,
        pendingDirectorCounterOffer: counterOffer,
        directorRequestCooldowns: nextCooldowns,
        directorRequestHistory: appendHistory(normalized, 'counter_offer', msg),
      };
      return { status: 'counter_offer', message: msg, updatedCareer };
    }

    const nextPenalty = Math.min(
      reqCfg.rejectionPenaltyCap,
      (normalized.directorReceptivityPenalty ?? 0) + reqCfg.rejectionPenaltyIncrement
    );
    const msg = `${clubDirector.name} postponed contract talks, insisting on stronger results before committing long-term.`;
    const updatedCareer: ManagerCareerState = {
      ...normalized,
      directorReceptivityPenalty: nextPenalty,
      directorRequestCooldowns: nextCooldowns,
      directorRequestHistory: appendHistory(normalized, 'rejected', msg),
    };
    return { status: 'rejected', message: msg, updatedCareer };
  }

  // 5. Transfer budget increase
  if (requestType === 'transfer_budget') {
    const minBoost = club.tier === 1 ? 6000000 : club.tier === 2 ? 2000000 : 600000;
    const wealthBonus =
      owner.wealth === 'oligarch'
        ? 14
        : owner.wealth === 'wealthy'
          ? 8
          : owner.wealth === 'frugal'
            ? -22
            : 0;
    const rawBoost = Math.max(
      minBoost,
      Math.round(Math.max(club.transferBudget, minBoost) * reqCfg.transferBudgetBoostPct)
    );
    const affordableBoost = Math.min(rawBoost, Math.round(club.balance * 0.3));

    if (affordableBoost < minBoost * 0.5 || owner.wealth === 'frugal' && readiness < 20) {
      const nextPenalty = Math.min(
        reqCfg.rejectionPenaltyCap,
        (normalized.directorReceptivityPenalty ?? 0) + reqCfg.rejectionPenaltyIncrement
      );
      const msg =
        owner.wealth === 'frugal'
          ? `${clubDirector.name} and ${owner.name} rejected the budget request under the club's frugal spending model.`
          : `${clubDirector.name} rejected the transfer budget increase — club reserves (£${(club.balance / 1000000).toFixed(1)}M) cannot absorb more spending right now.`;
      const updatedCareer: ManagerCareerState = {
        ...normalized,
        directorReceptivityPenalty: nextPenalty,
        directorRequestCooldowns: nextCooldowns,
        directorRequestHistory: appendHistory(normalized, 'rejected', msg),
      };
      return { status: 'rejected', message: msg, updatedCareer };
    }

    const chance = Math.max(10, Math.min(92, 44 + readiness + wealthBonus));
    if (Math.random() * 100 < chance) {
      const roundedBoost = Math.round(affordableBoost / 100000) * 100000;
      const updatedClubs = clubs.map(c =>
        c.id === club.id
          ? {
              ...c,
              transferBudget: c.transferBudget + roundedBoost,
            }
          : c
      );
      const msg = `${clubDirector.name} secured boardroom backing to add £${(roundedBoost / 1000000).toFixed(1)}M to the transfer budget!`;
      const updatedCareer: ManagerCareerState = {
        ...normalized,
        directorRequestCooldowns: nextCooldowns,
        directorRequestHistory: appendHistory(normalized, 'accepted', msg),
      };
      return {
        status: 'accepted',
        message: msg,
        updatedCareer,
        updatedClubs,
      };
    }

    const nextPenalty = Math.min(
      reqCfg.rejectionPenaltyCap,
      (normalized.directorReceptivityPenalty ?? 0) + reqCfg.rejectionPenaltyIncrement
    );
    const msg = `${clubDirector.name} declined to unlock extra transfer funds, advising you to work within the current £${(club.transferBudget / 1000000).toFixed(1)}M war chest.`;
    const updatedCareer: ManagerCareerState = {
      ...normalized,
      directorReceptivityPenalty: nextPenalty,
      directorRequestCooldowns: nextCooldowns,
      directorRequestHistory: appendHistory(normalized, 'rejected', msg),
    };
    return { status: 'rejected', message: msg, updatedCareer };
  }

  // 6. Public backing
  if (requestType === 'public_backing') {
    const chance = Math.max(15, Math.min(94, 48 + readiness));
    if (Math.random() * 100 < chance) {
      const nextTrust = Math.min(100, normalized.boardTrust + reqCfg.publicBackingTrustBoost);
      const msg = `${clubDirector.name} issued a public vote of confidence! Board trust rose to ${nextTrust}% and sacking pressure is eased for ${reqCfg.publicBackingWeeks} weeks.`;
      const updatedCareer: ManagerCareerState = {
        ...normalized,
        boardTrust: nextTrust,
        publicBackingWeeksRemaining: reqCfg.publicBackingWeeks,
        directorRequestCooldowns: nextCooldowns,
        directorRequestHistory: appendHistory(normalized, 'accepted', msg),
      };
      return { status: 'accepted', message: msg, updatedCareer };
    }

    const nextPenalty = Math.min(
      reqCfg.rejectionPenaltyCap,
      (normalized.directorReceptivityPenalty ?? 0) + reqCfg.rejectionPenaltyIncrement
    );
    const msg = `${clubDirector.name} declined to make a public statement of backing, leaving the pressure squarely on upcoming matchday results.`;
    const updatedCareer: ManagerCareerState = {
      ...normalized,
      directorReceptivityPenalty: nextPenalty,
      directorRequestCooldowns: nextCooldowns,
      directorRequestHistory: appendHistory(normalized, 'rejected', msg),
    };
    return { status: 'rejected', message: msg, updatedCareer };
  }

  // 7. Mutual termination (leaves club by agreement with NO sacking penalty on reputation)
  const strainedBoardBonus = normalized.boardTrust < 55 ? 16 : 0;
  const chance = Math.max(25, Math.min(96, 56 + Math.round(readiness * 0.45) + strainedBoardBonus));
  if (Math.random() * 100 < chance) {
    const offers = generateManagerJobOffers({
      reputation: normalized.profile.reputation,
      currentClubId: null,
      clubs,
      clubDirectors: normalized.clubDirectors,
      owners: allOwners && allOwners.length > 0 ? allOwners : [owner],
      justSacked: false,
    });
    const msg = `${clubDirector.name} and ${club.name} agreed to a mutual termination with full respect — no sacking penalty applied to your reputation.`;
    const updatedCareer: ManagerCareerState = {
      ...normalized,
      currentClubId: null,
      contractYears: 0,
      weeklyWage: 0,
      controlModifier: 0,
      publicBackingWeeksRemaining: 0,
      pendingDirectorCounterOffer: null,
      playerRequests: [],
      sackedBanner: null,
      activeOffers: offers,
      directorRequestCooldowns: {},
      directorReceptivityPenalty: 0,
      directorRequestHistory: appendHistory(normalized, 'accepted', msg),
    };
    return {
      status: 'accepted',
      mutualTerminationCompleted: true,
      message: msg,
      updatedCareer,
    };
  }

  const nextPenalty = Math.min(
    reqCfg.rejectionPenaltyCap,
    (normalized.directorReceptivityPenalty ?? 0) + reqCfg.rejectionPenaltyIncrement
  );
  const msg = `${clubDirector.name} rejected mutual termination for now, insisting you honour your remaining ${normalized.contractYears}-year contract.`;
  const updatedCareer: ManagerCareerState = {
    ...normalized,
    directorReceptivityPenalty: nextPenalty,
    directorRequestCooldowns: nextCooldowns,
    directorRequestHistory: appendHistory(normalized, 'rejected', msg),
  };
  return { status: 'rejected', message: msg, updatedCareer };
}

export function respondToDirectorCounterOffer(params: {
  career: ManagerCareerState;
  clubDirector: ClubDirector;
  accept: boolean;
  seasonYear: number;
  currentWeek: number;
}): {
  accepted: boolean;
  message: string;
  updatedCareer: ManagerCareerState;
} {
  const { career, clubDirector, accept, seasonYear, currentWeek } = params;
  const pending = career.pendingDirectorCounterOffer;
  if (!pending) {
    return {
      accepted: false,
      message: 'No pending counter-offer to respond to.',
      updatedCareer: career,
    };
  }

  if (accept) {
    const msg =
      pending.requestType === 'pay_rise'
        ? `Accepted ${clubDirector.name}'s counter-offer: salary updated to £${(pending.proposedWeeklyWage / 1000).toFixed(1)}k/wk.`
        : `Signed ${clubDirector.name}'s counter-offer: ${pending.proposedContractYears}-year contract at £${(pending.proposedWeeklyWage / 1000).toFixed(1)}k/wk.`;
    const rec: DirectorRequestRecord = {
      id: `dreq_resp_${seasonYear}_w${currentWeek}_${Date.now()}`,
      type: pending.requestType,
      status: 'counter_accepted',
      seasonYear,
      week: currentWeek,
      message: msg,
    };
    return {
      accepted: true,
      message: msg,
      updatedCareer: {
        ...career,
        contractYears: pending.proposedContractYears,
        weeklyWage: pending.proposedWeeklyWage,
        pendingDirectorCounterOffer: null,
        directorRequestHistory: [rec, ...(career.directorRequestHistory ?? []).slice(0, 14)],
      },
    };
  }

  const msg = `Declined ${clubDirector.name}'s counter-offer (${pending.proposedContractYears}y at £${(pending.proposedWeeklyWage / 1000).toFixed(1)}k/wk). Your existing terms remain unchanged.`;
  const rec: DirectorRequestRecord = {
    id: `dreq_resp_${seasonYear}_w${currentWeek}_${Date.now()}`,
    type: pending.requestType,
    status: 'counter_declined',
    seasonYear,
    week: currentWeek,
    message: msg,
  };
  return {
    accepted: false,
    message: msg,
    updatedCareer: {
      ...career,
      pendingDirectorCounterOffer: null,
      directorRequestHistory: [rec, ...(career.directorRequestHistory ?? []).slice(0, 14)],
    },
  };
}

export function evaluateManagerContractExpiryRenewal(params: {
  club: Club;
  clubs: Club[];
  owner?: Owner;
  clubDirector: ClubDirector;
  reputation: number;
  leaguePosition: number;
  isPromoted: boolean;
  isRelegated: boolean;
  wonTrophy?: string;
}): ManagerContractRenewalOffer {
  const {
    club,
    clubs,
    owner,
    clubDirector,
    reputation,
    leaguePosition,
    isPromoted,
    isRelegated,
    wonTrophy,
  } = params;

  const tierClubs = clubs.filter(c => c.tier === club.tier);
  const { targetRank, maxAcceptableRank } = computeClubExpectedPosition(club, tierClubs);

  let score = 55;
  if (wonTrophy) score += 28;
  if (isPromoted) score += 24;
  if (isRelegated) score -= 35;

  if (leaguePosition <= targetRank) score += 18;
  else if (leaguePosition <= maxAcceptableRank) score += 6;
  else score -= Math.min(28, (leaguePosition - maxAcceptableRank) * 4);

  score += Math.round((reputation - club.prestige) * 0.45);
  if (owner?.patience === 'patient') score += 8;
  else if (owner?.patience === 'volatile') score -= 8;

  const offered = score >= 45;
  if (!offered) {
    return {
      offered: false,
      contractYears: 0,
      weeklyWage: 0,
      reason: `${club.name} and Sporting Director ${clubDirector.name} opted not to renew your expiring contract after finishing #${leaguePosition}${isRelegated ? ' and suffering relegation' : ''}. You become a free agent with no sacking penalty.`,
    };
  }

  const desiredLength = wonTrophy || isPromoted ? 3 : leaguePosition <= targetRank ? 3 : 2;
  const terms = generateManagerContractTerms(club, reputation, desiredLength);
  return {
    offered: true,
    contractYears: terms.contractYears,
    weeklyWage: terms.weeklyWage,
    reason: `Impressed by your campaign (#${leaguePosition}), Sporting Director ${clubDirector.name} is ready to offer a new ${terms.contractYears}-year deal at £${(terms.weeklyWage / 1000).toFixed(1)}k/wk.`,
  };
}

