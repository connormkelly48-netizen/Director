/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { FORMATIONS, FORMATION_IDS, ROLE_TO_POSITION } from '../data/formations';
import { loadDatabase } from '../data/database';
import { Club, FormationId, Lineup, Manager, Player, PlayerPosition, POSITION_ORDER, SlotRole } from '../types/game';

export type SlotFitLevel = 'natural' | 'good' | 'poor' | 'bad';

export interface SlotFitResult {
  effectiveOverall: number;
  penalty: number; // 0, -5, -12, -20, or -40
  fit: SlotFitLevel;
}

const NATURAL_ROLES: Record<SlotRole, readonly string[]> = {
  GK: ['Standard Keeper', 'Sweeper Keeper'],
  LB: ['Wingback', 'Defensive Fullback', 'Inverted Fullback', 'Inverted Wingback'],
  RB: ['Wingback', 'Defensive Fullback', 'Inverted Fullback', 'Inverted Wingback'],
  LWB: ['Wingback', 'Defensive Fullback', 'Inverted Fullback', 'Inverted Wingback'],
  RWB: ['Wingback', 'Defensive Fullback', 'Inverted Fullback', 'Inverted Wingback'],
  CB: ['Central Defender', 'Ball-Playing Defender', 'Wide Center Back'],
  CDM: ['Ball Winning Midfielder', 'Deep Lying Playmaker', 'Central Midfielder'],
  CM: ['Central Midfielder', 'Box to Box', 'Mezzala', 'Deep Lying Playmaker', 'Advanced Playmaker'],
  CAM: ['Attacking Midfielder', 'Advanced Playmaker'],
  LM: ['Winger', 'Inside Forward'],
  RM: ['Winger', 'Inside Forward'],
  LW: ['Winger', 'Inside Forward'],
  RW: ['Winger', 'Inside Forward'],
  ST: ['Advanced Forward', 'Target Forward', 'False Nine', 'Inside Forward'],
};

const BENCH_SIZE = 7;

export function getSlotFit(player: Player, slotRole: SlotRole): SlotFitResult {
  const slotPos = ROLE_TO_POSITION[slotRole];

  // Goalkeeper outfield or outfielder in goal
  if ((player.position === 'GK') !== (slotPos === 'GK')) {
    return {
      effectiveOverall: Math.max(25, player.overall - 40),
      penalty: -40,
      fit: 'bad',
    };
  }

  // Same coarse position
  if (player.position === slotPos) {
    if (NATURAL_ROLES[slotRole].includes(player.roleDetail)) {
      return {
        effectiveOverall: player.overall,
        penalty: 0,
        fit: 'natural',
      };
    }
    return {
      effectiveOverall: Math.max(25, player.overall - 5),
      penalty: -5,
      fit: 'good',
    };
  }

  // Adjacent coarse positions (DEF-MID or MID-FWD)
  const isAdjacent =
    (player.position === 'DEF' && slotPos === 'MID') ||
    (player.position === 'MID' && slotPos === 'DEF') ||
    (player.position === 'MID' && slotPos === 'FWD') ||
    (player.position === 'FWD' && slotPos === 'MID');

  if (isAdjacent) {
    return {
      effectiveOverall: Math.max(25, player.overall - 12),
      penalty: -12,
      fit: 'poor',
    };
  }

  // DEF <-> FWD
  return {
    effectiveOverall: Math.max(25, player.overall - 20),
    penalty: -20,
    fit: 'bad',
  };
}

export function extractFormationNumber(preferredFormation?: string): string | null {
  if (!preferredFormation) return null;
  const match = preferredFormation.match(/\b(\d-\d-\d(?:-\d)?)\b/);
  return match ? match[1] : null;
}

export function getDefaultFormation(manager?: Manager): FormationId {
  const leading = extractFormationNumber(manager?.preferredFormation);
  if (leading && (FORMATION_IDS as readonly string[]).includes(leading)) {
    return leading as FormationId;
  }
  return '4-3-3';
}

function getSelectionScore(
  player: Player,
  slotRole: SlotRole,
  hasEnoughNaturalForLine: boolean
): number {
  const slotPos = ROLE_TO_POSITION[slotRole];
  const { effectiveOverall } = getSlotFit(player, slotRole);
  const formBonus = Math.max(-1.5, Math.min(1.5, (player.form - 6.5) * 1.5));
  const outOfLinePenalty =
    hasEnoughNaturalForLine && player.position !== slotPos ? -30 : 0;
  return effectiveOverall + formBonus + outOfLinePenalty;
}

// Solves min-cost rectangular assignment for n rows <= m columns in O(n^2 * m)
function hungarianMinCost(cost: number[][]): number[] {
  const n = cost.length;
  if (n === 0) return [];
  const m = cost[0].length;
  const INF = 1e15;
  const u = new Array<number>(n + 1).fill(0);
  const v = new Array<number>(m + 1).fill(0);
  const p = new Array<number>(m + 1).fill(0);
  const way = new Array<number>(m + 1).fill(0);

  for (let i = 1; i <= n; i++) {
    p[0] = i;
    let j0 = 0;
    const minv = new Array<number>(m + 1).fill(INF);
    const used = new Array<boolean>(m + 1).fill(false);
    do {
      used[j0] = true;
      const i0 = p[j0];
      let delta = INF;
      let j1 = 0;
      for (let j = 1; j <= m; j++) {
        if (!used[j]) {
          const cur = cost[i0 - 1][j - 1] - u[i0] - v[j];
          if (cur < minv[j]) {
            minv[j] = cur;
            way[j] = j0;
          }
          if (minv[j] < delta) {
            delta = minv[j];
            j1 = j;
          }
        }
      }
      for (let j = 0; j <= m; j++) {
        if (used[j]) {
          u[p[j]] += delta;
          v[j] -= delta;
        } else {
          minv[j] -= delta;
        }
      }
      j0 = j1;
    } while (p[j0] !== 0);
    do {
      const j1 = way[j0];
      p[j0] = p[j1];
      j0 = j1;
    } while (j0 !== 0);
  }

  const result = new Array<number>(n).fill(-1);
  for (let j = 1; j <= m; j++) {
    if (p[j] > 0) result[p[j] - 1] = j - 1;
  }
  return result;
}

function pickBenchFromPool(pool: Player[], targetSize = BENCH_SIZE): string[] {
  const remaining = [...pool].sort((a, b) => b.overall - a.overall || b.form - a.form);
  const bench: Player[] = [];
  const usedIds = new Set<string>();

  const take = (predicate: (p: Player) => boolean, count: number) => {
    let taken = 0;
    for (const p of remaining) {
      if (taken >= count || bench.length >= targetSize) break;
      if (usedIds.has(p.id)) continue;
      if (predicate(p)) {
        bench.push(p);
        usedIds.add(p.id);
        taken += 1;
      }
    }
  };

  // Best backup GK, then 2 DEF, 2 MID, 2 FWD
  take(p => p.position === 'GK', 1);
  take(p => p.position === 'DEF', 2);
  take(p => p.position === 'MID', 2);
  take(p => p.position === 'FWD', 2);

  // Fill any leftover spots by highest overall (preferring outfielders before a 3rd GK)
  if (bench.length < targetSize) {
    take(p => p.position !== 'GK', targetSize - bench.length);
  }
  if (bench.length < targetSize) {
    take(() => true, targetSize - bench.length);
  }

  return bench.map(p => p.id);
}

export function autoPickLineup(
  club: Club,
  formation?: FormationId,
  manager?: Manager
): Lineup {
  const resolvedFormation = formation || getDefaultFormation(manager);
  const def = FORMATIONS[resolvedFormation];
  const available = club.squad.filter(p => !p.isInjured);

  const slotCount = def.slots.length;
  const slots: (string | null)[] = new Array(slotCount).fill(null);
  const usedIds = new Set<string>();

  if (available.length > 0 && slotCount > 0) {
    const availableByPos: Record<PlayerPosition, number> = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
    for (const p of available) {
      availableByPos[p.position] += 1;
    }

    const slotsByPos: Record<PlayerPosition, number> = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
    for (const s of def.slots) {
      slotsByPos[ROLE_TO_POSITION[s.role]] += 1;
    }

    const hasEnoughNatural = def.slots.map(s => {
      const pos = ROLE_TO_POSITION[s.role];
      return availableByPos[pos] >= slotsByPos[pos];
    });

    const COST_BASE = 200_000_000;
    const scoreWeight = (p: Player, slotIdx: number): number => {
      const s = getSelectionScore(p, def.slots[slotIdx].role, hasEnoughNatural[slotIdx]);
      return Math.round(s * 1000) * 1000 + p.overall;
    };

    if (available.length >= slotCount) {
      const cost = def.slots.map((_, sIdx) =>
        available.map(p => COST_BASE - scoreWeight(p, sIdx))
      );
      const assignment = hungarianMinCost(cost);
      for (let sIdx = 0; sIdx < slotCount; sIdx++) {
        const pIdx = assignment[sIdx];
        if (pIdx >= 0 && pIdx < available.length) {
          const chosen = available[pIdx];
          slots[sIdx] = chosen.id;
          usedIds.add(chosen.id);
        }
      }
    } else {
      const cost = available.map(p =>
        def.slots.map((_, sIdx) => COST_BASE - scoreWeight(p, sIdx))
      );
      const assignment = hungarianMinCost(cost);
      for (let pIdx = 0; pIdx < available.length; pIdx++) {
        const sIdx = assignment[pIdx];
        if (sIdx >= 0 && sIdx < slotCount) {
          const chosen = available[pIdx];
          slots[sIdx] = chosen.id;
          usedIds.add(chosen.id);
        }
      }
    }
  }

  const benchPool = available.filter(p => !usedIds.has(p.id));
  const bench = pickBenchFromPool(benchPool, BENCH_SIZE);

  return {
    formation: resolvedFormation,
    slots,
    bench,
    auto: true,
  };
}

export function computeTeamRating(lineup: Lineup, squad: Player[]): number {
  const def = FORMATIONS[lineup.formation] || FORMATIONS['4-3-3'];
  const byId = new Map(squad.map(p => [p.id, p]));

  let total = 0;
  let count = 0;
  for (let i = 0; i < def.slots.length; i++) {
    const pid = lineup.slots[i];
    if (!pid) continue;
    const player = byId.get(pid);
    if (!player) continue;
    total += getSlotFit(player, def.slots[i].role).effectiveOverall;
    count += 1;
  }

  if (count === 0) return 0;
  return Math.round(total / count);
}

export function sanitizeLineup(club: Club, manager?: Manager): Lineup {
  if (!club.lineup) {
    return autoPickLineup(club, getDefaultFormation(manager), manager);
  }

  const formation: FormationId = (FORMATION_IDS as readonly string[]).includes(club.lineup.formation)
    ? club.lineup.formation
    : getDefaultFormation(manager);
  const def = FORMATIONS[formation];

  const healthyById = new Map(
    club.squad.filter(p => !p.isInjured).map(p => [p.id, p])
  );
  const seen = new Set<string>();

  const slots: (string | null)[] = new Array(def.slots.length).fill(null);
  for (let i = 0; i < def.slots.length; i++) {
    const pid = club.lineup.slots[i];
    if (pid && healthyById.has(pid) && !seen.has(pid)) {
      slots[i] = pid;
      seen.add(pid);
    }
  }

  let bench: string[] = [];
  for (const pid of club.lineup.bench) {
    if (bench.length >= BENCH_SIZE) break;
    if (pid && healthyById.has(pid) && !seen.has(pid)) {
      bench.push(pid);
      seen.add(pid);
    }
  }

  // Refill empty XI slots from bench first, then reserves (best fit first)
  for (let i = 0; i < def.slots.length; i++) {
    if (slots[i] !== null) continue;
    const role = def.slots[i].role;

    let chosenId: string | null = null;
    if (bench.length > 0) {
      let bestScore = -Infinity;
      for (const bid of bench) {
        const bp = healthyById.get(bid);
        if (!bp) continue;
        const score = getSlotFit(bp, role).effectiveOverall * 100 + bp.overall;
        if (score > bestScore) {
          bestScore = score;
          chosenId = bid;
        }
      }
      if (chosenId) {
        bench = bench.filter(id => id !== chosenId);
      }
    }

    if (!chosenId) {
      let bestScore = -Infinity;
      for (const p of healthyById.values()) {
        if (seen.has(p.id)) continue;
        const score = getSlotFit(p, role).effectiveOverall * 100 + p.overall;
        if (score > bestScore) {
          bestScore = score;
          chosenId = p.id;
        }
      }
    }

    if (chosenId) {
      slots[i] = chosenId;
      seen.add(chosenId);
    }
  }

  // Top up bench to 7 from reserves when enough healthy players exist
  if (bench.length < BENCH_SIZE) {
    const reservePool = Array.from(healthyById.values()).filter(p => !seen.has(p.id));
    const additions = pickBenchFromPool(reservePool, BENCH_SIZE - bench.length);
    for (const id of additions) {
      if (bench.length < BENCH_SIZE && !seen.has(id)) {
        bench.push(id);
        seen.add(id);
      }
    }
  }

  return {
    formation,
    slots,
    bench,
    auto: Boolean(club.lineup.auto),
  };
}

export function changeFormation(
  lineup: Lineup,
  newFormation: FormationId,
  squad: Player[]
): Lineup {
  const def = FORMATIONS[newFormation];
  const healthyById = new Map(squad.filter(p => !p.isInjured).map(p => [p.id, p]));

  // Preserve current XI players without losing anyone
  const xiPlayers: Player[] = [];
  const xiSeen = new Set<string>();
  for (const pid of lineup.slots) {
    if (pid && healthyById.has(pid) && !xiSeen.has(pid)) {
      xiPlayers.push(healthyById.get(pid)!);
      xiSeen.add(pid);
    }
  }

  const newSlots: (string | null)[] = new Array(def.slots.length).fill(null);
  const assignedIds = new Set<string>();
  const unfilled = new Set<number>(def.slots.map((_, i) => i));

  // Assign current XI into new slots starting with scarcest natural fits
  while (unfilled.size > 0) {
    const remainingXI = xiPlayers.filter(p => !assignedIds.has(p.id));
    if (remainingXI.length === 0) break;

    let targetIdx = -1;
    let bestKey: [number, number, number] = [999, 999, 999];
    for (const idx of unfilled) {
      const role = def.slots[idx].role;
      const isGk = role === 'GK' ? 0 : 1;
      let nat = 0;
      let good = 0;
      for (const p of remainingXI) {
        const f = getSlotFit(p, role).fit;
        if (f === 'natural') nat += 1;
        if (f === 'natural' || f === 'good') good += 1;
      }
      const key: [number, number, number] = [isGk, nat, good];
      if (
        targetIdx === -1 ||
        key[0] < bestKey[0] ||
        (key[0] === bestKey[0] && key[1] < bestKey[1]) ||
        (key[0] === bestKey[0] && key[1] === bestKey[1] && key[2] < bestKey[2])
      ) {
        targetIdx = idx;
        bestKey = key;
      }
    }

    if (targetIdx === -1) break;
    const role = def.slots[targetIdx].role;
    let bestPlayer: Player | null = null;
    let bestScore = -Infinity;
    for (const p of remainingXI) {
      const fit = getSlotFit(p, role);
      const score = fit.effectiveOverall * 100 + p.overall;
      if (score > bestScore) {
        bestScore = score;
        bestPlayer = p;
      }
    }

    if (bestPlayer) {
      newSlots[targetIdx] = bestPlayer.id;
      assignedIds.add(bestPlayer.id);
    }
    unfilled.delete(targetIdx);
  }

  // Keep existing bench (and any extras from XI if any existed) up to 7
  const newBench: string[] = [];
  for (const p of xiPlayers) {
    if (!assignedIds.has(p.id) && newBench.length < BENCH_SIZE) {
      newBench.push(p.id);
      assignedIds.add(p.id);
    }
  }
  for (const bid of lineup.bench) {
    if (newBench.length >= BENCH_SIZE) break;
    if (bid && healthyById.has(bid) && !assignedIds.has(bid)) {
      newBench.push(bid);
      assignedIds.add(bid);
    }
  }

  return {
    formation: newFormation,
    slots: newSlots,
    bench: newBench,
    auto: false,
  };
}

export function getReserves(lineup: Lineup, squad: Player[]): Player[] {
  const activeIds = new Set<string>();
  for (const id of lineup.slots) {
    if (id) activeIds.add(id);
  }
  for (const id of lineup.bench) {
    if (id) activeIds.add(id);
  }

  return squad
    .filter(p => !activeIds.has(p.id))
    .sort((a, b) => {
      const posDiff = POSITION_ORDER[a.position] - POSITION_ORDER[b.position];
      if (posDiff !== 0) return posDiff;
      if (b.overall !== a.overall) return b.overall - a.overall;
      return a.name.localeCompare(b.name);
    });
}

export function getSurname(fullName: string): string {
  const trimmed = fullName.trim();
  if (!trimmed) return '';
  const parts = trimmed.split(/\s+/);
  if (parts.length <= 1) return trimmed;
  // Preserve multi-part surnames like "Van Dijk", "De Bruyne", "Di Maria"
  const prefixes = new Set(['van', 'von', 'de', 'del', 'della', 'di', 'da', 'dos', 'el', 'al', 'mac', 'mc', 'o']);
  if (parts.length >= 3 && prefixes.has(parts[parts.length - 2].toLowerCase())) {
    return `${parts[parts.length - 2]} ${parts[parts.length - 1]}`;
  }
  return parts[parts.length - 1];
}

export function getInitials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

/**
 * Resolves a usable match lineup for a club.
 * - Uses club.lineup directly when valid (preserving intentional manual placements).
 * - Replaces injured/missing/empty slots via sanitizeLineup when partial/stale.
 * - Falls back to autoPickLineup if lineup is missing, invalid, or completely empty.
 */
export function resolveClubLineup(club: Club, manager?: Manager): Lineup {
  const healthy = club.squad.filter(p => !p.isInjured);
  if (
    !club.lineup ||
    !(FORMATION_IDS as readonly string[]).includes(club.lineup.formation) ||
    !Array.isArray(club.lineup.slots) ||
    club.lineup.slots.length !== 11
  ) {
    return autoPickLineup(club, getDefaultFormation(manager), manager);
  }

  const healthyById = new Map(healthy.map(p => [p.id, p]));
  const seen = new Set<string>();
  let validCount = 0;
  let hasProblemSlot = false;

  for (let i = 0; i < 11; i++) {
    const pid = club.lineup.slots[i];
    if (!pid) {
      hasProblemSlot = true;
      continue;
    }
    if (!healthyById.has(pid) || seen.has(pid)) {
      hasProblemSlot = true;
      continue;
    }
    seen.add(pid);
    validCount += 1;
  }

  if (validCount === 0 && healthy.length > 0) {
    return autoPickLineup(club, club.lineup.formation, manager);
  }

  if (hasProblemSlot && validCount < Math.min(11, healthy.length)) {
    return sanitizeLineup(club, manager);
  }

  return club.lineup;
}

/**
 * Prepares the user club's lineup immediately before a match:
 * - If missing or invalid/empty, runs autoPickLineup.
 * - If auto is on, re-runs autoPickLineup for current form & injuries.
 * - If manual, replaces any injured (or missing) starter from bench then reserves,
 *   keeps auto=false, and emits digest notices for injured replacements.
 */
export function prepareUserLineupForMatch(
  club: Club,
  manager?: Manager
): { lineup: Lineup; notices: string[] } {
  const notices: string[] = [];
  const hasValidFormation =
    Boolean(club.lineup) &&
    (FORMATION_IDS as readonly string[]).includes(club.lineup!.formation);

  if (
    !club.lineup ||
    !hasValidFormation ||
    !Array.isArray(club.lineup.slots) ||
    club.lineup.slots.length !== 11
  ) {
    return {
      lineup: autoPickLineup(club, getDefaultFormation(manager), manager),
      notices,
    };
  }

  if (club.lineup.auto) {
    return {
      lineup: autoPickLineup(club, club.lineup.formation, manager),
      notices,
    };
  }

  // Manual mode
  const formation = club.lineup.formation;
  const def = FORMATIONS[formation];
  const squadById = new Map(club.squad.map(p => [p.id, p]));
  const healthyById = new Map(club.squad.filter(p => !p.isInjured).map(p => [p.id, p]));

  if (club.lineup.slots.every(id => !id)) {
    const picked = autoPickLineup(club, formation, manager);
    return {
      lineup: { ...picked, auto: false },
      notices,
    };
  }

  const seen = new Set<string>();
  const slots: (string | null)[] = new Array(11).fill(null);
  const slotsToFill: Array<{ idx: number; injuredPlayer?: Player }> = [];

  for (let i = 0; i < 11; i++) {
    const pid = club.lineup.slots[i];
    if (pid && healthyById.has(pid) && !seen.has(pid)) {
      slots[i] = pid;
      seen.add(pid);
    } else {
      const prevPlayer = pid ? squadById.get(pid) : undefined;
      slotsToFill.push({
        idx: i,
        injuredPlayer: prevPlayer?.isInjured ? prevPlayer : undefined,
      });
    }
  }

  let bench: string[] = [];
  for (const pid of club.lineup.bench) {
    if (bench.length >= BENCH_SIZE) break;
    if (pid && healthyById.has(pid) && !seen.has(pid)) {
      bench.push(pid);
      seen.add(pid);
    }
  }

  const coachLabel = manager?.name || 'Head Coach';

  for (const { idx, injuredPlayer } of slotsToFill) {
    const role = def.slots[idx].role;
    let chosen: Player | null = null;
    let fromBench = false;

    let bestBenchScore = -Infinity;
    for (const bid of bench) {
      const bp = healthyById.get(bid);
      if (!bp) continue;
      const score = getSlotFit(bp, role).effectiveOverall * 100 + bp.overall;
      if (score > bestBenchScore) {
        bestBenchScore = score;
        chosen = bp;
        fromBench = true;
      }
    }

    if (!chosen) {
      let bestResScore = -Infinity;
      for (const p of healthyById.values()) {
        if (seen.has(p.id)) continue;
        const score = getSlotFit(p, role).effectiveOverall * 100 + p.overall;
        if (score > bestResScore) {
          bestResScore = score;
          chosen = p;
        }
      }
    }

    if (chosen) {
      slots[idx] = chosen.id;
      seen.add(chosen.id);
      if (fromBench) {
        bench = bench.filter(id => id !== chosen!.id);
      }
      if (injuredPlayer) {
        notices.push(`${coachLabel} replaced injured ${injuredPlayer.name} with ${chosen.name}`);
      }
    }
  }

  if (bench.length < BENCH_SIZE) {
    const reservePool = Array.from(healthyById.values()).filter(p => !seen.has(p.id));
    const additions = pickBenchFromPool(reservePool, BENCH_SIZE - bench.length);
    for (const id of additions) {
      if (bench.length < BENCH_SIZE && !seen.has(id)) {
        bench.push(id);
        seen.add(id);
      }
    }
  }

  return {
    lineup: {
      formation,
      slots,
      bench,
      auto: false,
    },
    notices,
  };
}

/**
 * Keeps an existing club.lineup valid whenever the squad or manager changes.
 * - If auto is enabled, re-picks via autoPickLineup (and resets formation if requested).
 * - If manual, calls sanitizeLineup so existing starters/bench stay put and gaps refill cleanly.
 */
export function syncLineupAfterSquadChange(
  club: Club,
  manager?: Manager,
  options?: { resetFormationOnAuto?: boolean }
): Lineup | undefined {
  if (!club.lineup) return undefined;
  if (club.lineup.auto) {
    const formation = options?.resetFormationOnAuto
      ? getDefaultFormation(manager)
      : (FORMATION_IDS as readonly string[]).includes(club.lineup.formation)
        ? club.lineup.formation
        : getDefaultFormation(manager);
    return autoPickLineup(club, formation, manager);
  }
  return sanitizeLineup(club, manager);
}

/**
 * Dev-only self-test: builds Manchester United's auto lineup in 4-2-3-1 at the start of a new game
 * and logs the assignments, team rating, and bench to the console.
 */
export function runLineupSelfTest(): void {
  const isProd = typeof import.meta !== 'undefined' && Boolean(import.meta.env?.PROD);
  if (isProd) return;

  const { clubs, managers } = loadDatabase();
  const manUtd = clubs.find(c => c.id === 'manutd');
  if (!manUtd) {
    console.warn('[runLineupSelfTest] Manchester United not found in database.');
    return;
  }

  const manager = managers.find(m => m.id === manUtd.managerId);
  const lineup = autoPickLineup(manUtd, '4-2-3-1', manager);
  const def = FORMATIONS['4-2-3-1'];
  const byId = new Map(manUtd.squad.map(p => [p.id, p]));
  const teamRating = computeTeamRating(lineup, manUtd.squad);

  const lines = def.slots.map((slot, i) => {
    const pid = lineup.slots[i];
    const player = pid ? byId.get(pid) : undefined;
    const fit = player ? getSlotFit(player, slot.role) : null;
    const outOfLine = player ? player.position !== ROLE_TO_POSITION[slot.role] : false;
    return `  ${slot.role.padEnd(3)} -> ${player ? `${player.name} (${player.position}, ${player.roleDetail}, OVR ${player.overall}, Eff ${fit?.effectiveOverall}, Pen ${fit?.penalty}${outOfLine ? ', OUT OF LINE!' : ''})` : 'EMPTY'}`;
  });

  const benchList = lineup.bench.map(id => {
    const p = byId.get(id);
    return p ? `${p.name} (${p.position} ${p.overall})` : id;
  });

  console.log(
    `[runLineupSelfTest] Manchester United (4-2-3-1) | Team Rating: ${teamRating} OVR\n` +
      lines.join('\n') +
      `\n  Bench: ${benchList.join(', ')}`
  );
}
