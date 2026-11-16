/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  Club,
  DelegationMatrix,
  Director,
  Lineup,
  Manager,
  ManagerSigningEvent,
  Owner,
  Player,
  PlayerPosition,
  PressHeadline,
  TransferProposal,
  TransferRecord,
} from '../types/game';
import { FORMATIONS } from '../data/formations';
import {
  getSlotFit,
  resolveClubLineup,
  syncLineupAfterSquadChange,
} from '../utils/lineup';

export const MIN_POSITION_DEPTH: Record<PlayerPosition, number> = {
  GK: 2,
  DEF: 5,
  MID: 5,
  FWD: 3,
};

export const MAX_TRANSFER_HISTORY_RECORDS = 500;
export const MAX_PENDING_PROPOSALS = 3;
export const MAX_MANAGER_SIGNINGS_PER_SEASON = 5;
export const MAX_MANAGER_SALES_PER_SEASON = 5;

export function capTransferHistory(records: TransferRecord[]): TransferRecord[] {
  if (records.length <= MAX_TRANSFER_HISTORY_RECORDS) return records;
  return records.slice(0, MAX_TRANSFER_HISTORY_RECORDS);
}

// Parse formation strings like "4-3-3 Holding", "4-2-3-1 Wide", "3-5-2 Direct" into outfield counts
export function parseFormation(formation?: string): { def: number; mid: number; fwd: number } {
  if (!formation) return { def: 4, mid: 4, fwd: 2 };
  const match = formation.match(/\b(\d)-(\d)-(\d)(?:-(\d))?\b/);
  if (match) {
    const d1 = parseInt(match[1], 10);
    const d2 = parseInt(match[2], 10);
    const d3 = parseInt(match[3], 10);
    const d4 = match[4] !== undefined ? parseInt(match[4], 10) : undefined;
    if (d4 !== undefined) {
      if (d1 + d2 + d3 + d4 === 10) {
        return { def: d1, mid: d2 + d3, fwd: d4 };
      }
    } else if (d1 + d2 + d3 === 10) {
      return { def: d1, mid: d2, fwd: d3 };
    }
  }
  return { def: 4, mid: 4, fwd: 2 };
}

// Select starting XI from club.lineup (or autoPickLineup for AI/missing lineups) with getSlotFit penalties
export function selectStartingXI(
  club: Club,
  manager?: Manager,
  cachedLineup?: Lineup
): Player[] {
  const available = club.squad.filter(p => !p.isInjured);
  if (available.length === 0) return [];

  const lineup = cachedLineup ?? resolveClubLineup(club, manager);
  const def = FORMATIONS[lineup.formation] || FORMATIONS['4-3-3'];
  const healthyById = new Map(available.map(p => [p.id, p]));

  const selected: Player[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < def.slots.length; i++) {
    const pid = lineup.slots[i];
    if (!pid || seen.has(pid)) continue;
    const player = healthyById.get(pid);
    if (!player) continue;

    player.effectiveOverall = getSlotFit(player, def.slots[i].role).effectiveOverall;
    selected.push(player);
    seen.add(player.id);
  }

  return selected;
}

export interface EvaluateSigningParams {
  player: Player;
  sellingClub: Club | null;
  buyingClub: Club;
  owner: Owner;
  fee: number;
  wage: number;
}

export interface EvaluateSigningResult {
  ok: boolean;
  reason?: string;
  failStage?: 'squad_cap' | 'budget' | 'selling_club' | 'wage_budget' | 'player_terms' | 'owner_veto';
  vetoedByOwner?: boolean;
}

export function evaluateSigning({
  player,
  sellingClub,
  buyingClub,
  owner,
  fee,
  wage,
}: EvaluateSigningParams): EvaluateSigningResult {
  // 1. 25-man squad cap
  if (buyingClub.squad.length >= 25) {
    return {
      ok: false,
      failStage: 'squad_cap',
      reason: `SQUAD FULL: ${buyingClub.name} already has 25 first-team players. Sell or release a player first.`,
    };
  }

  // 2. Transfer budget check
  if (fee > buyingClub.transferBudget) {
    return {
      ok: false,
      failStage: 'budget',
      reason: `BID FAILED: You only have £${(buyingClub.transferBudget / 1000000).toFixed(1)}M in your transfer war chest.`,
    };
  }

  // 3. Selling club acceptance (90% of valuation)
  if (sellingClub) {
    const minAcceptable = Math.round(player.value * 0.9);
    if (fee < minAcceptable) {
      return {
        ok: false,
        failStage: 'selling_club',
        reason: `BID REJECTED: ${sellingClub.name} deemed £${(fee / 1000000).toFixed(1)}M derisory. They require at least £${(player.value / 1000000).toFixed(1)}M.`,
      };
    }
  }

  // 4. Weekly wage budget check
  const currentWages = buyingClub.squad.reduce((sum, p) => sum + p.wage, 0);
  if (currentWages + wage > buyingClub.wageBudget) {
    return {
      ok: false,
      failStage: 'wage_budget',
      reason: `TERMS FAILED: Offering £${(wage / 1000).toFixed(0)}k/week breaches your weekly wage ceiling of £${(buyingClub.wageBudget / 1000).toFixed(0)}k.`,
    };
  }

  // 5. Player personal terms (85% of current wage)
  if (wage < player.wage * 0.85) {
    return {
      ok: false,
      failStage: 'player_terms',
      reason: `TERMS REJECTED: ${player.name}'s agent demands at least £${(player.wage / 1000).toFixed(0)}k/week to consider a move.`,
    };
  }

  // 6. Owner & Board Veto checks
  if (owner.recruitmentPhilosophy === 'youth_development' && player.age >= 30 && owner.involvement === 'micromanager') {
    return {
      ok: false,
      failStage: 'owner_veto',
      vetoedByOwner: true,
      reason: `OWNER VETO: Chairman ${owner.name} has blocked the deal! "Our philosophy strictly prohibits signing players over 29 years old. We are an academy and youth resale institution."`,
    };
  }

  if (owner.wealth === 'frugal' && fee > buyingClub.transferBudget * 0.6) {
    return {
      ok: false,
      failStage: 'owner_veto',
      vetoedByOwner: true,
      reason: `BOARD VETO: The financial committee vetoed the fee! Spending 60%+ of the transfer war chest on one individual violates board risk metrics.`,
    };
  }

  return { ok: true };
}

export interface CompleteSigningParams {
  player: Player;
  sellingClub: Club | null;
  buyingClub: Club;
  clubs: Club[];
  freeAgents: Player[];
  director: Director;
  owner: Owner;
  manager?: Manager;
  fee: number;
  wage: number;
  contractYears: number;
  season: number;
  week: number;
  initiatedBy: 'director' | 'manager' | 'shared';
  note?: string;
  trustDelta?: number;
}

export interface CompleteSigningResult {
  clubs: Club[];
  freeAgents: Player[];
  director: Director;
  owner: Owner;
  manager: Manager | undefined;
  signedPlayer: Player;
  updatedBuyingClub: Club;
  updatedSellingClub: Club | null;
  record: TransferRecord;
}

export function completeSigning({
  player,
  sellingClub,
  buyingClub,
  clubs,
  freeAgents,
  director,
  owner,
  manager,
  fee,
  wage,
  contractYears,
  season,
  week,
  initiatedBy,
  note,
  trustDelta = 0,
}: CompleteSigningParams): CompleteSigningResult {
  const signedPlayer: Player = {
    ...player,
    clubId: buyingClub.id,
    wage,
    contractYears,
    happiness: 85,
    morale: 'ecstatic',
  };

  const updatedBuyingClubBase: Club = {
    ...buyingClub,
    transferBudget: buyingClub.transferBudget - fee,
    balance: buyingClub.balance - fee,
    squad: [signedPlayer, ...buyingClub.squad],
  };
  const updatedBuyingClub: Club = updatedBuyingClubBase.lineup
    ? {
        ...updatedBuyingClubBase,
        lineup: syncLineupAfterSquadChange(updatedBuyingClubBase, manager),
      }
    : updatedBuyingClubBase;

  let updatedSellingClub: Club | null = null;
  if (sellingClub) {
    const updatedSellingBase: Club = {
      ...sellingClub,
      transferBudget: sellingClub.transferBudget + fee,
      balance: sellingClub.balance + fee,
      squad: sellingClub.squad.filter(p => p.id !== player.id),
    };
    updatedSellingClub = updatedSellingBase.lineup
      ? {
          ...updatedSellingBase,
          lineup: syncLineupAfterSquadChange(updatedSellingBase),
        }
      : updatedSellingBase;
  }

  const updatedClubs = clubs.map(c => {
    if (c.id === updatedBuyingClub.id) return updatedBuyingClub;
    if (updatedSellingClub && c.id === updatedSellingClub.id) return updatedSellingClub;
    return c;
  });

  const updatedFreeAgents = freeAgents.filter(fa => fa.id !== player.id);

  const updatedDirector: Director = {
    ...director,
    netSpend: director.netSpend + fee,
    reputation: Math.min(100, director.reputation + (signedPlayer.overall > 82 ? 3 : 1)),
    boardTrust: Math.min(100, director.boardTrust + 2),
  };

  const updatedOwner: Owner = {
    ...owner,
    approval: Math.min(100, owner.approval + 2),
  };

  const updatedManager = manager
    ? {
        ...manager,
        trustInDirector: Math.max(0, Math.min(100, manager.trustInDirector + trustDelta)),
      }
    : undefined;

  const record: TransferRecord = {
    id: `tr_${season}_w${week}_${signedPlayer.id}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    season,
    week,
    type: 'signing',
    playerId: signedPlayer.id,
    playerName: signedPlayer.name,
    position: signedPlayer.position,
    age: signedPlayer.age,
    overall: signedPlayer.overall,
    fromClubId: sellingClub ? sellingClub.id : null,
    toClubId: buyingClub.id,
    fee,
    wage,
    contractYears,
    initiatedBy,
    note,
  };

  return {
    clubs: updatedClubs,
    freeAgents: updatedFreeAgents,
    director: updatedDirector,
    owner: updatedOwner,
    manager: updatedManager,
    signedPlayer,
    updatedBuyingClub,
    updatedSellingClub,
    record,
  };
}

export interface GeneratedTransferOffer {
  club: Club;
  fee: number;
  wage: number;
}

function deterministicClubSpread(clubId: string, playerId: string): number {
  let hash = 0;
  const key = `${clubId}_${playerId}`;
  for (let i = 0; i < key.length; i++) {
    hash = (hash * 31 + key.charCodeAt(i)) % 997;
  }
  // Range [-0.04, +0.04]
  return ((hash / 996) - 0.5) * 0.08;
}

export function getTransferOffers(
  player: Player,
  clubs: Club[],
  sellerClubId: string
): GeneratedTransferOffer[] {
  const offers: GeneratedTransferOffer[] = [];

  for (const buyer of clubs) {
    if (buyer.id === sellerClubId) continue;
    if (buyer.squad.length >= 25) continue;

    // Factor in [0.85, 1.20] based on buyer prestige, player age, and player form
    const prestigeMod = ((buyer.prestige - 65) / 100) * 0.14;
    const ageMod =
      player.age <= 24 ? 0.07 :
      player.age <= 28 ? 0.03 :
      player.age <= 31 ? -0.03 : -0.08;
    const formMod = ((player.form - 6.5) / 3.5) * 0.09;
    const spread = deterministicClubSpread(buyer.id, player.id);

    const rawFactor = 0.98 + prestigeMod + ageMod + formMod + spread;
    const clampedFactor = Math.max(0.85, Math.min(1.2, rawFactor));
    const fee = Math.max(50000, Math.round(player.value * clampedFactor));

    if (buyer.transferBudget < fee) continue;

    offers.push({
      club: buyer,
      fee,
      wage: Math.round(player.wage * 1.1),
    });
  }

  offers.sort((a, b) => b.fee - a.fee);
  return offers.slice(0, 5);
}

export interface CompleteSaleParams {
  player: Player;
  sellerClub: Club;
  buyingClub: Club;
  clubs: Club[];
  director: Director;
  manager?: Manager;
  fee: number;
  wage?: number;
  season: number;
  week: number;
  initiatedBy: 'director' | 'manager' | 'shared';
  note?: string;
  trustDelta?: number;
}

export interface CompleteSaleResult {
  clubs: Club[];
  director: Director;
  manager: Manager | undefined;
  soldPlayer: Player;
  record: TransferRecord;
}

export function completeSale({
  player,
  sellerClub,
  buyingClub,
  clubs,
  director,
  manager,
  fee,
  wage,
  season,
  week,
  initiatedBy,
  note,
  trustDelta = 0,
}: CompleteSaleParams): CompleteSaleResult {
  const contractYears = 3;
  const agreedWage = wage ?? Math.round(player.wage * 1.1);

  const soldPlayer: Player = {
    ...player,
    clubId: buyingClub.id,
    wage: agreedWage,
    contractYears,
    happiness: 85,
    morale: 'content',
  };

  const updatedSellerBase: Club = {
    ...sellerClub,
    squad: sellerClub.squad.filter(p => p.id !== player.id),
    transferBudget: sellerClub.transferBudget + fee,
    balance: sellerClub.balance + fee,
  };
  const updatedSellerClub: Club = updatedSellerBase.lineup
    ? {
        ...updatedSellerBase,
        lineup: syncLineupAfterSquadChange(updatedSellerBase, manager),
      }
    : updatedSellerBase;

  const updatedBuyingBase: Club = {
    ...buyingClub,
    squad: [...buyingClub.squad, soldPlayer],
    transferBudget: Math.max(0, buyingClub.transferBudget - fee),
    balance: Math.max(0, buyingClub.balance - fee),
  };
  const updatedBuyingClub: Club = updatedBuyingBase.lineup
    ? {
        ...updatedBuyingBase,
        lineup: syncLineupAfterSquadChange(updatedBuyingBase),
      }
    : updatedBuyingBase;

  const updatedClubs = clubs.map(c => {
    if (c.id === updatedSellerClub.id) return updatedSellerClub;
    if (c.id === updatedBuyingClub.id) return updatedBuyingClub;
    return c;
  });

  const updatedDirector: Director = {
    ...director,
    netSpend: director.netSpend - fee,
  };

  const updatedManager = manager
    ? {
        ...manager,
        trustInDirector: Math.max(0, Math.min(100, manager.trustInDirector + trustDelta)),
      }
    : undefined;

  const record: TransferRecord = {
    id: `tr_${season}_w${week}_${player.id}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    season,
    week,
    type: 'sale',
    playerId: player.id,
    playerName: player.name,
    position: player.position,
    age: player.age,
    overall: player.overall,
    fromClubId: sellerClub.id,
    toClubId: buyingClub.id,
    fee,
    wage: agreedWage,
    contractYears,
    initiatedBy,
    note,
  };

  return {
    clubs: updatedClubs,
    director: updatedDirector,
    manager: updatedManager,
    soldPlayer,
    record,
  };
}

export interface DelegationDecisionCheck {
  requiresConfirm: boolean;
  mode: 'director' | 'manager' | 'shared_agreed' | 'shared_objected';
  trustDelta: number;
  title?: string;
  reason?: string;
}

export function evaluateDirectorSigningDelegation(
  club: Club,
  targetPlayer: Player,
  manager: Manager | undefined,
  delegation: DelegationMatrix
): DelegationDecisionCheck {
  if (!manager || delegation.transferSignings === 'director') {
    return { requiresConfirm: false, mode: 'director', trustDelta: 0 };
  }

  if (delegation.transferSignings === 'manager') {
    return {
      requiresConfirm: true,
      mode: 'manager',
      trustDelta: -20,
      title: 'Manager Control Override',
      reason: `Overriding your Head Coach (${manager.name}) on incoming signings will cost 20 trust.`,
    };
  }

  // 'shared' mode
  const posCount = club.squad.filter(p => p.position === targetPlayer.position).length;
  const belowMinDepth = posCount < MIN_POSITION_DEPTH[targetPlayer.position];
  const startingXI = selectStartingXI(club, manager);
  const startersAtPos = startingXI.filter(p => p.position === targetPlayer.position);
  const weakestStarterOvr = startersAtPos.length > 0 ? Math.min(...startersAtPos.map(p => p.overall)) : 0;

  const agrees = belowMinDepth || startersAtPos.length === 0 || targetPlayer.overall >= weakestStarterOvr - 2;

  if (agrees) {
    return {
      requiresConfirm: false,
      mode: 'shared_agreed',
      trustDelta: 1,
      reason: belowMinDepth
        ? `${manager.name} agrees: we are short at ${targetPlayer.position} (${posCount}/${MIN_POSITION_DEPTH[targetPlayer.position]} min).`
        : `${manager.name} agrees: ${targetPlayer.name} (${targetPlayer.overall} OVR) fits our first-team standard.`,
    };
  }

  return {
    requiresConfirm: true,
    mode: 'shared_objected',
    trustDelta: -10,
    title: `${manager.name} Objects to Signing`,
    reason: `${manager.name} objects: we already have ${posCount} ${targetPlayer.position} players and ${targetPlayer.name} (${targetPlayer.overall} OVR) sits more than 2 points below our weakest starter (${weakestStarterOvr} OVR).`,
  };
}

export function evaluateDirectorSaleDelegation(
  club: Club,
  player: Player,
  manager: Manager | undefined,
  delegation: DelegationMatrix
): DelegationDecisionCheck {
  if (!manager || delegation.transferSales === 'director') {
    return { requiresConfirm: false, mode: 'director', trustDelta: 0 };
  }

  if (delegation.transferSales === 'manager') {
    return {
      requiresConfirm: true,
      mode: 'manager',
      trustDelta: -15,
      title: 'Manager Control Override',
      reason: `Overriding your Head Coach (${manager.name}) on player sales will cost 15 trust.`,
    };
  }

  // 'shared' mode: agrees unless player is in starting XI or sale leaves position below minimum depth
  const startingXI = selectStartingXI(club, manager);
  const isStarter = startingXI.some(p => p.id === player.id);
  const posCountAfter = club.squad.filter(p => p.position === player.position && p.id !== player.id).length;
  const leavesBelowMin = posCountAfter < MIN_POSITION_DEPTH[player.position];

  if (!isStarter && !leavesBelowMin) {
    return {
      requiresConfirm: false,
      mode: 'shared_agreed',
      trustDelta: 1,
      reason: `${manager.name} agrees to sanction the sale of squad player ${player.name}.`,
    };
  }

  const reasons: string[] = [];
  if (isStarter) {
    reasons.push(`${player.name} is a key part of our Starting XI`);
  }
  if (leavesBelowMin) {
    reasons.push(`selling him leaves only ${posCountAfter} ${player.position} (minimum ${MIN_POSITION_DEPTH[player.position]})`);
  }

  return {
    requiresConfirm: true,
    mode: 'shared_objected',
    trustDelta: -10,
    title: `${manager.name} Objects to Sale`,
    reason: `${manager.name} objects: ${reasons.join(' and ')}.`,
  };
}

export function expireTransferProposals(
  proposals: TransferProposal[],
  currentWeek: number
): TransferProposal[] {
  return proposals.map(p =>
    p.status === 'pending' && currentWeek >= p.expiresWeek
      ? { ...p, status: 'expired' as const }
      : p
  );
}

export interface RunManagerTransferActivityParams {
  currentWeek: number;
  seasonYear: number;
  myClubId: string | null;
  owner: Owner;
  manager: Manager;
  clubs: Club[];
  freeAgents: Player[];
  director: Director;
  delegation: DelegationMatrix;
  transferHistory: TransferRecord[];
  transferProposals: TransferProposal[];
}

export interface RunManagerTransferActivityResult {
  clubs: Club[];
  freeAgents: Player[];
  director: Director;
  owner: Owner;
  manager: Manager;
  newTransfers: TransferRecord[];
  updatedProposals: TransferProposal[];
  pressHeadlines: PressHeadline[];
  managerSigning?: ManagerSigningEvent;
}

export interface VerifyManagerDealParams {
  kind: 'signing' | 'sale';
  myClubId: string;
  counterpartyClubId: string | null;
  playerId: string;
  beforeClubs: Club[];
  afterClubs: Club[];
  beforeFreeAgents: Player[];
  afterFreeAgents: Player[];
  record: TransferRecord;
}

export function verifyManagerDeal({
  kind,
  myClubId,
  counterpartyClubId,
  playerId,
  beforeClubs,
  afterClubs,
  beforeFreeAgents,
  afterFreeAgents,
  record,
}: VerifyManagerDealParams): boolean {
  const isDev =
    typeof import.meta !== 'undefined' && (import.meta as { env?: { DEV?: boolean } }).env
      ? Boolean((import.meta as { env?: { DEV?: boolean } }).env?.DEV)
      : typeof process !== 'undefined' && process.env?.NODE_ENV !== 'production';

  if (!isDev) return true;

  const errors: string[] = [];
  const beforeMyClub = beforeClubs.find(c => c.id === myClubId);
  const afterMyClub = afterClubs.find(c => c.id === myClubId);

  if (!beforeMyClub || !afterMyClub) {
    errors.push(`Missing myClub (${myClubId}) in before/after clubs`);
  } else if (kind === 'signing') {
    if (afterMyClub.squad.length !== beforeMyClub.squad.length + 1) {
      errors.push(
        `Expected myClub squad size +1 (${beforeMyClub.squad.length} -> ${beforeMyClub.squad.length + 1}), got ${afterMyClub.squad.length}`
      );
    }
    if (counterpartyClubId) {
      const beforeSeller = beforeClubs.find(c => c.id === counterpartyClubId);
      const afterSeller = afterClubs.find(c => c.id === counterpartyClubId);
      if (!beforeSeller || !afterSeller) {
        errors.push(`Missing selling club (${counterpartyClubId})`);
      } else if (afterSeller.squad.length !== beforeSeller.squad.length - 1) {
        errors.push(
          `Expected seller (${counterpartyClubId}) squad size -1 (${beforeSeller.squad.length} -> ${beforeSeller.squad.length - 1}), got ${afterSeller.squad.length}`
        );
      }
    } else if (afterFreeAgents.length !== beforeFreeAgents.length - 1) {
      errors.push(
        `Expected freeAgents length -1 (${beforeFreeAgents.length} -> ${beforeFreeAgents.length - 1}), got ${afterFreeAgents.length}`
      );
    }
    const signedPlayer = afterMyClub.squad.find(p => p.id === playerId);
    if (!signedPlayer) {
      errors.push(`Signed player ${playerId} not found in myClub (${myClubId}) squad`);
    } else if (signedPlayer.clubId !== myClubId) {
      errors.push(`Signed player clubId is ${signedPlayer.clubId}, expected ${myClubId}`);
    }
    if (record.fromClubId !== counterpartyClubId) {
      errors.push(`History record.fromClubId is ${record.fromClubId}, expected ${counterpartyClubId}`);
    }
    if (record.toClubId !== myClubId) {
      errors.push(`History record.toClubId is ${record.toClubId}, expected ${myClubId}`);
    }
  } else {
    if (afterMyClub.squad.length !== beforeMyClub.squad.length - 1) {
      errors.push(
        `Expected myClub squad size -1 (${beforeMyClub.squad.length} -> ${beforeMyClub.squad.length - 1}), got ${afterMyClub.squad.length}`
      );
    }
    if (!counterpartyClubId) {
      errors.push('Sale must have a non-null counterparty buying club');
    } else {
      const beforeBuyer = beforeClubs.find(c => c.id === counterpartyClubId);
      const afterBuyer = afterClubs.find(c => c.id === counterpartyClubId);
      if (!beforeBuyer || !afterBuyer) {
        errors.push(`Missing buying club (${counterpartyClubId})`);
      } else {
        if (afterBuyer.squad.length !== beforeBuyer.squad.length + 1) {
          errors.push(
            `Expected buyer (${counterpartyClubId}) squad size +1 (${beforeBuyer.squad.length} -> ${beforeBuyer.squad.length + 1}), got ${afterBuyer.squad.length}`
          );
        }
        const soldPlayer = afterBuyer.squad.find(p => p.id === playerId);
        if (!soldPlayer) {
          errors.push(`Sold player ${playerId} not found in buyer (${counterpartyClubId}) squad`);
        } else if (soldPlayer.clubId !== counterpartyClubId) {
          errors.push(`Sold player clubId is ${soldPlayer.clubId}, expected ${counterpartyClubId}`);
        }
      }
    }
    if (afterMyClub.squad.some(p => p.id === playerId)) {
      errors.push(`Sold player ${playerId} still present in myClub (${myClubId}) squad`);
    }
    if (record.fromClubId !== myClubId) {
      errors.push(`History record.fromClubId is ${record.fromClubId}, expected ${myClubId}`);
    }
    if (record.toClubId !== counterpartyClubId) {
      errors.push(`History record.toClubId is ${record.toClubId}, expected ${counterpartyClubId}`);
    }
  }

  if (errors.length > 0) {
    console.warn(`MANAGER DEAL CHECK FAILED (${kind}):`, errors.join('; '));
    return false;
  }

  console.log(
    `MANAGER DEAL OK (${kind}: ${record.playerName} | ${record.fromClubId ?? 'Free Agent'} -> ${record.toClubId ?? 'Released'})`
  );
  return true;
}

function getStyleBonus(manager: Manager, player: Player): number {
  switch (manager.tacticalStyle) {
    case 'High Gegenpress':
      return player.age <= 27 ? 2 : 0;
    case 'Tiki-Taka Possession':
      return player.position === 'MID' ? 1 : 0;
    case 'Direct Counter-Attack':
      return player.position === 'FWD' || player.position === 'DEF' ? 1 : 0;
    case 'Pragmatic Low Block':
      return player.age >= 27 ? 2 : 0;
    case 'Fluid Wing Play':
      return player.age <= 26 ? 1 : 0;
    default:
      return 0;
  }
}

function getOwnerPhilosophyBonus(owner: Owner, player: Player): number {
  switch (owner.recruitmentPhilosophy) {
    case 'youth_development':
      return player.age <= 23 ? 3 : 0;
    case 'marquee_stars':
      return player.overall >= 82 ? 3 : 0;
    case 'moneyball_data': {
      // Value-for-overall efficiency up to +3
      if (player.value <= 0) return 3;
      const valueInMillions = Math.max(0.25, player.value / 1_000_000);
      const efficiency = player.overall / valueInMillions;
      if (efficiency >= 25) return 3;
      if (efficiency >= 12) return 2;
      if (efficiency >= 6) return 1;
      return 0;
    }
    case 'domestic_grit':
      return player.nationality === 'England' ? 2 : 0;
    case 'trophies_now':
      return player.overall >= 78 ? 2 : 0;
    default:
      return 0;
  }
}

export function runManagerTransferActivity({
  currentWeek,
  seasonYear,
  myClubId,
  owner,
  manager,
  clubs,
  freeAgents,
  director,
  delegation,
  transferHistory,
  transferProposals,
}: RunManagerTransferActivityParams): RunManagerTransferActivityResult {
  const noOp: RunManagerTransferActivityResult = {
    clubs,
    freeAgents,
    director,
    owner,
    manager,
    newTransfers: [],
    updatedProposals: transferProposals,
    pressHeadlines: [],
  };

  // Strictly act ONLY for the director's managed club
  if (!myClubId || director.currentClubId !== myClubId) return noOp;
  const myClub = clubs.find(c => c.id === myClubId);
  if (!myClub || myClub.managerId !== manager.id) return noOp;

  // Never runs in weeks 44+ or outside active transfer windows (Weeks 1-6, 20-24)
  if (currentWeek >= 44) return noOp;
  const isWindowOpen = currentWeek <= 6 || (currentWeek >= 20 && currentWeek <= 24);
  if (!isWindowOpen) return noOp;

  const signingsDelegated = delegation.transferSignings === 'manager' || delegation.transferSignings === 'shared';
  const salesDelegated = delegation.transferSales === 'manager' || delegation.transferSales === 'shared';

  if (!signingsDelegated && !salesDelegated) return noOp;

  // Count this season's manager/shared signings and sales for myClubId only
  const seasonSigningsCount = transferHistory.filter(
    tr =>
      tr.season === seasonYear &&
      tr.toClubId === myClubId &&
      tr.type === 'signing' &&
      (tr.initiatedBy === 'manager' || tr.initiatedBy === 'shared')
  ).length;

  const seasonSalesCount = transferHistory.filter(
    tr =>
      tr.season === seasonYear &&
      tr.fromClubId === myClubId &&
      tr.type === 'sale' &&
      (tr.initiatedBy === 'manager' || tr.initiatedBy === 'shared')
  ).length;

  const pendingProposals = transferProposals.filter(p => p.status === 'pending');
  const pendingPlayerIds = new Set(pendingProposals.map(p => p.playerId));
  const pendingSigningsCount = pendingProposals.filter(p => p.kind === 'signing').length;
  const pendingSalesCount = pendingProposals.filter(p => p.kind === 'sale').length;
  const effectiveSignings = seasonSigningsCount + pendingSigningsCount;
  const effectiveSales = seasonSalesCount + pendingSalesCount;

  // Active during open transfer windows (higher probability early in the window before targets are met)
  const actionChance = seasonSigningsCount < 2 || seasonSalesCount < 1 ? 0.85 : 0.60;
  if (Math.random() >= actionChance) return noOp;

  const attemptSale = (targetClubId: string): RunManagerTransferActivityResult | null => {
    const club = clubs.find(c => c.id === targetClubId);
    if (!club) return null;
    if (!salesDelegated || seasonSalesCount >= MAX_MANAGER_SALES_PER_SEASON) return null;
    if (delegation.transferSales === 'shared' && pendingProposals.length >= MAX_PENDING_PROPOSALS) return null;

    const startingXI = selectStartingXI(club, manager);
    const starterIds = new Set(startingXI.map(p => p.id));
    const top14Ids = new Set(
      [...club.squad]
        .sort((a, b) => b.overall - a.overall)
        .slice(0, 14)
        .map(p => p.id)
    );

    const posCounts: Record<PlayerPosition, number> = {
      GK: club.squad.filter(p => p.position === 'GK').length,
      DEF: club.squad.filter(p => p.position === 'DEF').length,
      MID: club.squad.filter(p => p.position === 'MID').length,
      FWD: club.squad.filter(p => p.position === 'FWD').length,
    };

    const saleCandidates = club.squad.filter(p => {
      if (starterIds.has(p.id)) return false; // NEVER sells a starting-XI player
      if (posCounts[p.position] - 1 < MIN_POSITION_DEPTH[p.position]) return false; // NEVER below min depth
      if (pendingPlayerIds.has(p.id)) return false;

      const outsideTop14 = !top14Ids.has(p.id);
      const coolingVeteran = p.age >= 30 && p.growthMomentum === 'cooling';
      const unhappyNonStarter = p.happiness < 40 && !starterIds.has(p.id);
      return outsideTop14 || coolingVeteran || unhappyNonStarter;
    });

    if (saleCandidates.length === 0) return null;

    // Sort candidates: unhappy or cooling veterans first, then lowest OVR
    saleCandidates.sort((a, b) => a.overall - b.overall);

    for (const candidate of saleCandidates) {
      const offers = getTransferOffers(candidate, clubs, targetClubId);
      const validOffer = offers.find(
        o => o.club.id !== targetClubId && o.fee >= candidate.value * 0.85
      );
      if (!validOffer) continue;

      if (delegation.transferSales === 'manager') {
        const saleResult = completeSale({
          player: candidate,
          sellerClub: club,
          buyingClub: validOffer.club,
          clubs,
          director,
          manager,
          fee: validOffer.fee,
          wage: validOffer.wage,
          season: seasonYear,
          week: currentWeek,
          initiatedBy: 'manager',
          note: `Sold by Head Coach ${manager.name}`,
        });

        verifyManagerDeal({
          kind: 'sale',
          myClubId: targetClubId,
          counterpartyClubId: validOffer.club.id,
          playerId: candidate.id,
          beforeClubs: clubs,
          afterClubs: saleResult.clubs,
          beforeFreeAgents: freeAgents,
          afterFreeAgents: freeAgents,
          record: saleResult.record,
        });

        const headline: PressHeadline = {
          title: `Head Coach ${manager.name} sold ${candidate.name} to ${validOffer.club.name} for £${(validOffer.fee / 1000000).toFixed(1)}m`,
          source: 'Sky Sports Wire',
          category: 'transfer',
          sentiment: 'neutral',
        };

        return {
          clubs: saleResult.clubs,
          freeAgents,
          director: saleResult.director,
          owner,
          manager: saleResult.manager ?? manager,
          newTransfers: [saleResult.record],
          updatedProposals: transferProposals,
          pressHeadlines: [headline],
        };
      } else {
        // 'shared' mode: create TransferProposal for myClub
        const reason =
          candidate.happiness < 40
            ? `${candidate.name} is unsettled at the club and ${validOffer.club.name} have offered £${(validOffer.fee / 1000000).toFixed(1)}m.`
            : candidate.age >= 30 && candidate.growthMomentum === 'cooling'
              ? `${candidate.name} is slowing down at ${candidate.age} and ${validOffer.club.name} are offering £${(validOffer.fee / 1000000).toFixed(1)}m.`
              : `${candidate.name} is surplus to first-team requirements and ${validOffer.club.name} tabled £${(validOffer.fee / 1000000).toFixed(1)}m.`;

        const proposal: TransferProposal = {
          id: `prop_${seasonYear}_w${currentWeek}_${candidate.id}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          createdWeek: currentWeek,
          season: seasonYear,
          kind: 'sale',
          playerId: candidate.id,
          playerName: candidate.name,
          position: candidate.position,
          age: candidate.age,
          overall: candidate.overall,
          counterpartyClubId: validOffer.club.id,
          fee: validOffer.fee,
          wage: validOffer.wage,
          contractYears: 3,
          reason,
          status: 'pending',
          expiresWeek: currentWeek + 3,
        };

        return {
          clubs,
          freeAgents,
          director,
          owner,
          manager,
          newTransfers: [],
          updatedProposals: [proposal, ...transferProposals],
          pressHeadlines: [],
        };
      }
    }

    return null;
  };

  const attemptSigning = (targetClubId: string): RunManagerTransferActivityResult | null => {
    const club = clubs.find(c => c.id === targetClubId);
    if (!club) return null;
    if (!signingsDelegated || seasonSigningsCount >= MAX_MANAGER_SIGNINGS_PER_SEASON) return null;
    if (delegation.transferSignings === 'shared' && pendingProposals.length >= MAX_PENDING_PROPOSALS) return null;

    // If squad is full (25), look for a sale instead
    if (club.squad.length >= 25) {
      return attemptSale(targetClubId);
    }

    const currentWages = club.squad.reduce((sum, p) => sum + p.wage, 0);
    const wageSpace = club.wageBudget - currentWages;
    if (wageSpace <= 0) return null;

    const startingXI = selectStartingXI(club, manager);
    const positions: PlayerPosition[] = ['GK', 'DEF', 'MID', 'FWD'];

    const posNeeds = new Map<PlayerPosition, { belowMin: boolean; weakestStarterOvr: number }>();
    for (const pos of positions) {
      const count = club.squad.filter(p => p.position === pos).length;
      const starters = startingXI.filter(p => p.position === pos);
      const weakestStarterOvr = starters.length > 0 ? Math.min(...starters.map(p => p.overall)) : 0;
      posNeeds.set(pos, {
        belowMin: count < MIN_POSITION_DEPTH[pos],
        weakestStarterOvr,
      });
    }

    const maxAllowedFee =
      owner.wealth === 'frugal' ? club.transferBudget * 0.55 : club.transferBudget * 0.70;
    const candidates: Array<{
      player: Player;
      sellingClub: Club | null;
      score: number;
      priorityDepth: boolean;
      upgradeMargin: number;
    }> = [];

    const considerCandidate = (p: Player, sellingClub: Club | null) => {
      if (p.isInjured) return;
      if (pendingPlayerIds.has(p.id)) return;
      if (sellingClub && sellingClub.id === targetClubId) return;

      const need = posNeeds.get(p.position)!;
      const isUpgrade = need.weakestStarterOvr === 0 || p.overall >= need.weakestStarterOvr;
      const isDepthAddition = club.squad.length < 22 && p.overall >= need.weakestStarterOvr - 3;
      if (!need.belowMin && !isUpgrade && !isDepthAddition) return;

      const estFee = sellingClub ? p.value : 0;
      if (estFee > maxAllowedFee) return;

      const estWage = Math.max(p.wage, Math.round(p.wage * 1.1));
      if (estWage > wageSpace) return;

      const score = p.overall + getStyleBonus(manager, p) + getOwnerPhilosophyBonus(owner, p);
      candidates.push({
        player: p,
        sellingClub,
        score,
        priorityDepth: need.belowMin,
        upgradeMargin: p.overall - need.weakestStarterOvr,
      });
    };

    for (const fa of freeAgents) {
      considerCandidate(fa, null);
    }

    for (const otherClub of clubs) {
      if (otherClub.id === targetClubId) continue;
      if (otherClub.squad.length <= 15) continue;
      for (const p of otherClub.squad) {
        considerCandidate(p, otherClub);
      }
    }

    if (candidates.length === 0) return null;

    // Sort: positions below minimum depth first, then highest score
    candidates.sort((a, b) => {
      if (a.priorityDepth !== b.priorityDepth) return a.priorityDepth ? -1 : 1;
      return b.score - a.score;
    });

    const pressHeadlines: PressHeadline[] = [];
    const tries = Math.min(12, candidates.length);
    let loggedVeto = false;

    for (let i = 0; i < tries; i++) {
      const candidate = candidates[i];
      const rawFee = candidate.sellingClub
        ? Math.round(candidate.player.value * (0.95 + Math.random() * 0.15))
        : 0;
      // Keep bid within budget cap while meeting selling club minimum (0.9x)
      const bidFee = candidate.sellingClub ? Math.min(rawFee, Math.floor(maxAllowedFee)) : 0;
      const bidWage = Math.max(candidate.player.wage, Math.round(candidate.player.wage * 1.1));

      const evalResult = evaluateSigning({
        player: candidate.player,
        sellingClub: candidate.sellingClub,
        buyingClub: club,
        owner,
        fee: bidFee,
        wage: bidWage,
      });

      if (!evalResult.ok) {
        if (evalResult.vetoedByOwner && !loggedVeto) {
          loggedVeto = true;
          pressHeadlines.push({
            title: `Board blocks Head Coach's move for ${candidate.player.name}`,
            source: 'The Boardroom Wire',
            category: 'transfer',
            sentiment: 'negative',
          });
        }
        continue;
      }

      if (delegation.transferSignings === 'manager') {
        const result = completeSigning({
          player: candidate.player,
          sellingClub: candidate.sellingClub,
          buyingClub: club,
          clubs,
          freeAgents,
          director,
          owner,
          manager,
          fee: bidFee,
          wage: bidWage,
          contractYears: 3,
          season: seasonYear,
          week: currentWeek,
          initiatedBy: 'manager',
          note: `Signed by Head Coach ${manager.name}`,
          trustDelta: 1,
        });

        verifyManagerDeal({
          kind: 'signing',
          myClubId: targetClubId,
          counterpartyClubId: candidate.sellingClub ? candidate.sellingClub.id : null,
          playerId: candidate.player.id,
          beforeClubs: clubs,
          afterClubs: result.clubs,
          beforeFreeAgents: freeAgents,
          afterFreeAgents: result.freeAgents,
          record: result.record,
        });

        const fromLabel = candidate.sellingClub ? candidate.sellingClub.name : 'Free Agency';
        const feeText = bidFee > 0 ? `for £${(bidFee / 1000000).toFixed(1)}m` : 'on a free transfer';
        const signingHeadline: PressHeadline = {
          title: `Head Coach ${manager.name} signed ${candidate.player.name} from ${fromLabel} ${feeText}`,
          source: 'Sky Sports Wire',
          category: 'transfer',
          sentiment: 'positive',
        };

        const reason = candidate.priorityDepth
          ? `Reinforced our thin ${candidate.player.position} depth for our ${manager.preferredFormation} (${manager.tacticalStyle}) setup.`
          : `Brought in ${candidate.player.name} (${candidate.player.overall} OVR) as an immediate squad reinforcement at ${candidate.player.position}.`;

        return {
          clubs: result.clubs,
          freeAgents: result.freeAgents,
          director: result.director,
          owner: result.owner,
          manager: result.manager ?? manager,
          newTransfers: [result.record],
          updatedProposals: transferProposals,
          pressHeadlines: [signingHeadline],
          managerSigning: {
            player: result.signedPlayer,
            fee: bidFee,
            fromClubName: fromLabel,
            managerName: manager.name,
            reason,
          },
        };
      } else {
        // 'shared' mode: create TransferProposal for myClub
        const reason = candidate.priorityDepth
          ? `We're short at ${candidate.player.position} and ${candidate.player.name} (${candidate.player.overall} OVR) gives us essential depth.`
          : `${candidate.player.name} (${candidate.player.overall} OVR) strengthens our ${candidate.player.position} options for our ${manager.tacticalStyle} approach.`;

        const proposal: TransferProposal = {
          id: `prop_${seasonYear}_w${currentWeek}_${candidate.player.id}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          createdWeek: currentWeek,
          season: seasonYear,
          kind: 'signing',
          playerId: candidate.player.id,
          playerName: candidate.player.name,
          position: candidate.player.position,
          age: candidate.player.age,
          overall: candidate.player.overall,
          counterpartyClubId: candidate.sellingClub ? candidate.sellingClub.id : null,
          fee: bidFee,
          wage: bidWage,
          contractYears: 3,
          reason,
          status: 'pending',
          expiresWeek: currentWeek + 3,
        };

        return {
          clubs,
          freeAgents,
          director,
          owner,
          manager,
          newTransfers: [],
          updatedProposals: [proposal, ...transferProposals],
          pressHeadlines: [],
        };
      }
    }

    if (pressHeadlines.length > 0) {
      return {
        ...noOp,
        pressHeadlines,
      };
    }

    return null;
  };

  // Balance signings and sales when both are delegated, falling back if one yields no valid deal
  if (signingsDelegated && salesDelegated) {
    const preferSaleFirst =
      myClub.squad.length >= 25 ||
      (effectiveSignings >= 2 && effectiveSales === 0) ||
      (effectiveSignings > effectiveSales + 1 && Math.random() < 0.70);

    if (preferSaleFirst) {
      const saleOutcome = attemptSale(myClubId);
      if (saleOutcome) return saleOutcome;
      const signingOutcome = attemptSigning(myClubId);
      if (signingOutcome) return signingOutcome;
    } else {
      const signingOutcome = attemptSigning(myClubId);
      if (signingOutcome) return signingOutcome;
      const saleOutcome = attemptSale(myClubId);
      if (saleOutcome) return saleOutcome;
    }
    return noOp;
  }

  if (signingsDelegated) {
    const signingOutcome = attemptSigning(myClubId);
    if (signingOutcome) return signingOutcome;
  }

  if (salesDelegated) {
    const saleOutcome = attemptSale(myClubId);
    if (saleOutcome) return saleOutcome;
  }

  return noOp;
}
