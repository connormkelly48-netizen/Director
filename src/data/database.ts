/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import db from './database.json';
import {
  AcademyPlayer,
  Club,
  ClubData,
  LeagueTier,
  Manager,
  Owner,
  Player,
  TakeoverCandidate,
} from '../types/game';
import { getManagerCareerStats } from '../services/managerService';
import { replenishClubAcademy } from '../services/simulationEngine';
import { YOUTH_ACADEMY_CONFIG } from '../config/youthAcademyConfig';

interface RawAcademyPlayer extends AcademyPlayer {
  clubId: string;
}

interface RawDatabase {
  meta: {
    schemaVersion: number;
    game: string;
    startSeason: number;
    notes: string;
  };
  clubs: ClubData[];
  owners: Owner[];
  managers: Manager[];
  players: Player[];
  academy: RawAcademyPlayer[];
}

function deepClone<T>(value: T): T {
  if (typeof structuredClone === 'function') {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value)) as T;
}

const rawDb = db as unknown as RawDatabase;

export const TAKEOVER_CANDIDATES: TakeoverCandidate[] = Object.freeze(
  deepClone(rawDb.owners)
    .filter((o): o is TakeoverCandidate & { status: 'takeover_candidate' } => o.status === 'takeover_candidate')
    .map(({ status: _status, ...candidate }) => Object.freeze(candidate) as TakeoverCandidate)
) as TakeoverCandidate[];

export function loadDatabase(): {
  clubs: Club[];
  owners: Owner[];
  managers: Manager[];
  freeAgents: Player[];
} {
  const cloned = deepClone(rawDb);

  const playersByClub = new Map<string, Player[]>();
  const freeAgents: Player[] = [];

  for (const player of cloned.players) {
    if (player.clubId) {
      const list = playersByClub.get(player.clubId) || [];
      list.push(player);
      playersByClub.set(player.clubId, list);
    } else {
      freeAgents.push(player);
    }
  }

  const academyByClub = new Map<string, AcademyPlayer[]>();
  for (const prospect of cloned.academy) {
    const { clubId, ...academyRecord } = prospect;
    if (clubId) {
      const list = academyByClub.get(clubId) || [];
      list.push({ ...academyRecord, clubId, origin: academyRecord.origin ?? 'generated' });
      academyByClub.set(clubId, list);
    }
  }

  const usedAcademyNames = new Set<string>(
    cloned.academy.map((p) => p.name)
  );

  const clubs: Club[] = cloned.clubs.map((c) => {
    const baseClub: Club = {
      ...c,
      tier: c.tier as LeagueTier,
      squad: playersByClub.get(c.id) || [],
      academy: academyByClub.get(c.id) || [],
      played: 0,
      won: 0,
      drawn: 0,
      lost: 0,
      goalsFor: 0,
      goalsAgainst: 0,
      goalDifference: 0,
      points: 0,
      form: [],
    };
    return {
      ...baseClub,
      academy: replenishClubAcademy(baseClub, cloned.meta.startSeason, usedAcademyNames),
    };
  });

  const owners: Owner[] = cloned.owners
    .filter((o) => o.status === 'current')
    .map(({ status: _status, ...owner }) => owner);

  const managers: Manager[] = cloned.managers.map((m) => ({
    ...m,
    careerStats: getManagerCareerStats(m),
    history: Array.isArray(m.history) ? m.history : [],
  }));

  // Quick sanity check on counts and referential integrity
  const ownerIds = new Set(owners.map((o) => o.id));
  const managerIds = new Set(managers.map((m) => m.id));

  if (clubs.length !== 68) {
    console.warn(`[database] Expected 68 clubs, got ${clubs.length}`);
  }
  if (owners.length !== 68) {
    console.warn(`[database] Expected 68 current owners, got ${owners.length}`);
  }
  if (managers.length !== 128) {
    console.warn(`[database] Expected 128 managers, got ${managers.length}`);
  }
  if (freeAgents.length !== 8) {
    console.warn(`[database] Expected 8 free agents, got ${freeAgents.length}`);
  }
  if (TAKEOVER_CANDIDATES.length !== 20) {
    console.warn(`[database] Expected 20 takeover candidates, got ${TAKEOVER_CANDIDATES.length}`);
  }

  for (const club of clubs) {
    if (!ownerIds.has(club.ownerId)) {
      console.warn(`[database] Club ${club.id} is missing valid owner (${club.ownerId})`);
    }
    if (!club.managerId || !managerIds.has(club.managerId)) {
      console.warn(`[database] Club ${club.id} is missing valid manager (${club.managerId})`);
    }
    if (!club.academy || club.academy.length < YOUTH_ACADEMY_CONFIG.generatedSlots) {
      console.warn(`[database] Club ${club.id} expected at least ${YOUTH_ACADEMY_CONFIG.generatedSlots} academy players, got ${club.academy?.length ?? 0}`);
    }
  }

  return {
    clubs,
    owners,
    managers,
    freeAgents,
  };
}
