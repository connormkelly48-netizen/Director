/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Club, ClubDirector, Director, DirectorGradeFactor, FormationId, GameMode, Lineup, Manager, MatchResult, Owner, Player, WeeklyDigest, PressHeadline, BoardroomMemo, DelegationMatrix, JobVacancy, SeasonSummary, SeasonAward, LeagueTier, AcademyPlayer, ProspectTrait, PlayerPosition, GrowthMomentum, MomentumTier, MoraleLevel, GameweekRecord, GameweekStandingsEntry, TransferRecord, TransferProposal, IncomingBid, ManagerSigningEvent, AcademyWireEvent, RetirementRecord, SeasonGraduateHighlight } from '../types/game';
import { TAKEOVER_CANDIDATES } from '../data/database';
import {
  YOUTH_ACADEMY_CONFIG,
  getAcademyRatingRangeForReputation,
} from '../config/youthAcademyConfig';
import {
  evaluatePlayerStyleFit,
  GeneratedTransferOffer,
  getTransferOffers,
  isTransferWindowOpen,
  parseFormation,
  selectStartingXI,
  expireTransferProposals,
  runManagerTransferActivity,
  runManagerContractRenewals,
} from './transferService';
import { computeTransferROI } from '../utils/transferRoi';
import {
  autoPickLineup,
  computeTeamRating,
  extractFormationNumber,
  getDefaultFormation,
  getSlotFit,
  prepareUserLineupForMatch,
  resolveClubLineup,
  syncLineupAfterSquadChange,
} from '../utils/lineup';
import { FORMATIONS } from '../data/formations';
import {
  appendManagerHistory,
  applyManagerReputationChange,
  deriveManagerAttributes,
  getManagerCareerStats,
  recordManagerMatchResult,
  selectBestAffordableManagerForAIClub,
} from './managerService';
import {
  runAISportingDirectorWeeklyActivity,
  runManagerModeSeasonEndRenewals,
} from './managerModeService';

export { parseFormation, selectStartingXI };

export interface SimulationModeOptions {
  gameMode?: GameMode;
  userManagerAdapter?: Manager;
  clubDirector?: ClubDirector;
}

// Helper to construct a validated TransferRecord
export function createTransferRecord(
  player: Pick<Player, 'id' | 'name' | 'position' | 'age' | 'overall' | 'wage' | 'contractYears'>,
  type: TransferRecord['type'],
  fromClubId: string | null,
  toClubId: string | null,
  fee: number,
  season: number,
  week: number,
  initiatedBy: TransferRecord['initiatedBy'] = 'director',
  note?: string
): TransferRecord {
  return {
    id: `tr_${season}_w${week}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    season,
    week,
    type,
    playerId: player.id,
    playerName: player.name,
    position: player.position,
    age: player.age,
    overall: player.overall,
    fromClubId,
    toClubId,
    fee,
    wage: player.wage,
    contractYears: player.contractYears,
    initiatedBy,
    note,
  };
}

// Helper to query available free agent managers strictly where clubId === null
export function getAvailableManagers(managers: Manager[]): Manager[] {
  return managers.filter(m => m.clubId === null);
}

// Helper to strictly filter clubs by league tier without slicing or hardcoded arrays
export function getClubsByTier(clubs: Club[], tier: LeagueTier): Club[] {
  return clubs.filter(c => c.tier === tier);
}

// Helper to derive MoraleLevel from happiness value
export function deriveMorale(happiness: number): MoraleLevel {
  if (happiness >= 85) return 'ecstatic';
  if (happiness >= 70) return 'happy';
  if (happiness >= 50) return 'content';
  if (happiness >= 30) return 'unhappy';
  return 'furious';
}

// Calculate team rating from starting XI taking into account getSlotFit penalties, tactical style fit, and +0.5% formation comfort
export function getTeamMatchRating(club: Club, manager?: Manager, cachedLineup?: Lineup): number {
  const lineup = cachedLineup ?? resolveClubLineup(club, manager);
  const def = FORMATIONS[lineup.formation] || FORMATIONS['4-3-3'];
  const healthyById = new Map(club.squad.filter(p => !p.isInjured).map(p => [p.id, p]));
  const seen = new Set<string>();
  let totalOvr = 0;
  let totalStyleBonus = 0;
  let starterCount = 0;

  for (let i = 0; i < def.slots.length; i++) {
    const pid = lineup.slots[i];
    if (!pid || seen.has(pid)) continue;
    const player = healthyById.get(pid);
    if (!player) continue;
    totalOvr += getSlotFit(player, def.slots[i].role).effectiveOverall;
    if (manager) {
      totalStyleBonus += evaluatePlayerStyleFit(manager, player).matchBonus;
    }
    seen.add(pid);
    starterCount += 1;
  }

  if (starterCount === 0) return 60;

  const avgOvr = totalOvr / starterCount;
  const avgStyleBonus = totalStyleBonus / starterCount;
  const mgrBonus = manager ? (manager.reputation / 100) * 4 : 0;
  const trustModifier = manager ? ((manager.trustInDirector - 50) / 100) * 3 : 0;
  const mgrAttrs = manager ? (manager.attributes ?? deriveManagerAttributes(manager)) : undefined;
  const attrModifier = mgrAttrs
    ? (mgrAttrs.tactical - 65) * 0.025 + (mgrAttrs.manManagement - 65) * 0.015
    : 0;

  let rating = avgOvr + avgStyleBonus + mgrBonus + trustModifier + attrModifier;

  // Formation comfort: +0.5% bonus if active formation matches manager's preferred formation (leading numbers)
  const preferredNumbers = extractFormationNumber(manager?.preferredFormation);
  if (preferredNumbers && preferredNumbers === lineup.formation) {
    rating *= 1.005;
  }

  return rating;
}

// Simulate a single football match with authentic starting XIs, form updates, assists, and injuries
export function simulateMatch(
  homeClub: Club,
  awayClub: Club,
  homeManager?: Manager,
  awayManager?: Manager,
  lineupCache?: Map<string, Lineup>,
  newlyInjuredIds?: Set<string>
): MatchResult {
  const homeLineup = lineupCache?.get(homeClub.id) ?? resolveClubLineup(homeClub, homeManager);
  const awayLineup = lineupCache?.get(awayClub.id) ?? resolveClubLineup(awayClub, awayManager);
  if (lineupCache) {
    lineupCache.set(homeClub.id, homeLineup);
    lineupCache.set(awayClub.id, awayLineup);
  }

  const homeXI = selectStartingXI(homeClub, homeManager, homeLineup);
  const awayXI = selectStartingXI(awayClub, awayManager, awayLineup);

  const homePower = getTeamMatchRating(homeClub, homeManager, homeLineup) + 3.5; // Home advantage
  const awayPower = getTeamMatchRating(awayClub, awayManager, awayLineup);

  const diff = (homePower - awayPower) / 10;
  
  // Poisson-like goal generation
  const homeExpected = Math.max(0.3, 1.4 + diff * 0.5);
  const awayExpected = Math.max(0.2, 1.1 - diff * 0.4);

  let homeGoals = 0;
  let awayGoals = 0;

  for (let i = 0; i < 5; i++) {
    if (Math.random() < homeExpected / 3.5) homeGoals++;
    if (Math.random() < awayExpected / 3.5) awayGoals++;
  }

  const events: MatchResult['events'] = [];

  // Track goals and assists this match for match rating calculations
  const goalsThisMatch = new Map<string, number>();
  const assistsThisMatch = new Map<string, number>();

  // Goal & assist events restricted strictly to the starting XI that played
  const assignScorersAndAssists = (
    starters: Player[],
    count: number,
    team: 'home' | 'away'
  ) => {
    if (starters.length === 0 || count === 0) return;

    const forwards = starters.filter(p => p.position === 'FWD');
    const midfielders = starters.filter(p => p.position === 'MID');
    const defenders = starters.filter(p => p.position === 'DEF');

    for (let g = 0; g < count; g++) {
      const min = Math.floor(Math.random() * 88) + 2;
      let scorer: Player;
      const roll = Math.random();
      if (roll < 0.72 && forwards.length > 0) {
        scorer = forwards[Math.floor(Math.random() * forwards.length)];
      } else if (roll < 0.92 && midfielders.length > 0) {
        scorer = midfielders[Math.floor(Math.random() * midfielders.length)];
      } else if (defenders.length > 0) {
        scorer = defenders[Math.floor(Math.random() * defenders.length)];
      } else {
        scorer = starters[0];
      }

      scorer.goals += 1;
      goalsThisMatch.set(scorer.id, (goalsThisMatch.get(scorer.id) || 0) + 1);

      events.push({
        minute: min,
        type: 'goal',
        player: scorer.name,
        team,
      });

      // Assign assist (~72% of goals have an assist)
      if (Math.random() < 0.72) {
        const potentialAssisters = starters.filter(p => p.id !== scorer.id);
        if (potentialAssisters.length > 0) {
          const assMids = potentialAssisters.filter(p => p.position === 'MID');
          const assFwds = potentialAssisters.filter(p => p.position === 'FWD');
          const assDefs = potentialAssisters.filter(p => p.position === 'DEF');
          const aRoll = Math.random();
          let assister: Player;
          if (aRoll < 0.58 && assMids.length > 0) {
            assister = assMids[Math.floor(Math.random() * assMids.length)];
          } else if (aRoll < 0.84 && assFwds.length > 0) {
            assister = assFwds[Math.floor(Math.random() * assFwds.length)];
          } else if (assDefs.length > 0) {
            assister = assDefs[Math.floor(Math.random() * assDefs.length)];
          } else {
            assister = potentialAssisters[Math.floor(Math.random() * potentialAssisters.length)];
          }
          assister.assists += 1;
          assistsThisMatch.set(assister.id, (assistsThisMatch.get(assister.id) || 0) + 1);
        }
      }
    }
  };

  assignScorersAndAssists(homeXI, homeGoals, 'home');
  assignScorersAndAssists(awayXI, awayGoals, 'away');

  // Clean sheets: award to GK and DEF when opponent scores 0
  if (awayGoals === 0) {
    homeXI.forEach(p => {
      if (p.position === 'GK' || p.position === 'DEF') {
        p.cleanSheets += 1;
      }
    });
  }
  if (homeGoals === 0) {
    awayXI.forEach(p => {
      if (p.position === 'GK' || p.position === 'DEF') {
        p.cleanSheets += 1;
      }
    });
  }

  // Injuries: each starter has about a 1.2% chance per match of an injury lasting 1-10 weeks
  const processStarterInjuries = (starters: Player[], team: 'home' | 'away') => {
    starters.forEach(p => {
      if (!p.isInjured && Math.random() < 0.012) {
        const roll = Math.random();
        let weeks: number;
        if (roll < 0.45) weeks = Math.floor(Math.random() * 2) + 1; // 1-2 weeks
        else if (roll < 0.75) weeks = Math.floor(Math.random() * 2) + 3; // 3-4 weeks
        else if (roll < 0.92) weeks = Math.floor(Math.random() * 3) + 5; // 5-7 weeks
        else weeks = Math.floor(Math.random() * 3) + 8; // 8-10 weeks

        p.isInjured = true;
        p.injuryWeeks = weeks;
        newlyInjuredIds?.add(p.id);

        events.push({
          minute: Math.floor(Math.random() * 80) + 8,
          type: 'injury',
          player: p.name,
          team,
        });
      }
    });
  };

  processStarterInjuries(homeXI, 'home');
  processStarterInjuries(awayXI, 'away');

  // Occasional yellow card (restricted strictly to the XI that actually played)
  if (Math.random() < 0.3) {
    const isHomeCard = Math.random() < 0.5;
    const pool = isHomeCard ? homeXI : awayXI;
    if (pool.length > 0) {
      const player = pool[Math.floor(Math.random() * pool.length)];
      events.push({
        minute: Math.floor(Math.random() * 85) + 5,
        type: 'yellow_card',
        player: player.name,
        team: isHomeCard ? 'home' : 'away',
      });
    }
  }

  events.sort((a, b) => a.minute - b.minute);

  // Post-match ratings, appearances, form, happiness & morale for both squads
  const updateSquadPostMatch = (
    club: Club,
    manager: Manager | undefined,
    starters: Player[],
    myScore: number,
    oppScore: number,
    hasCleanSheet: boolean
  ) => {
    const starterIds = new Set(starters.map(s => s.id));
    const isWin = myScore > oppScore;
    const isDraw = myScore === oppScore;
    const resultMod = isWin ? 0.4 : isDraw ? 0 : -0.4;

    // Starters
    starters.forEach(p => {
      p.appearances += 1;

      const pGoals = goalsThisMatch.get(p.id) || 0;
      const pAssists = assistsThisMatch.get(p.id) || 0;
      const cleanSheetMod = ((p.position === 'GK' || p.position === 'DEF') && hasCleanSheet) ? 0.4 : 0;
      const styleFit = evaluatePlayerStyleFit(manager, p);
      const momentumBias =
        p.growthMomentum === 'breakout' ? 0.25 :
        p.growthMomentum === 'prime' ? 0.15 :
        p.growthMomentum === 'rapid' ? 0.10 :
        p.growthMomentum === 'cooling' ? -0.15 : 0;
      const noise = (Math.random() * 1.2) - 0.6; // +/- 0.6

      const matchRating = Math.min(
        10.0,
        Math.max(4.0, Math.round((6.5 + resultMod + pGoals * 0.8 + pAssists * 0.5 + cleanSheetMod + styleFit.formBias + momentumBias + noise) * 10) / 10)
      );

      // Rolling form: form = form * 0.8 + matchRating * 0.2
      p.form = Math.min(10.0, Math.max(1.0, Math.round((p.form * 0.8 + matchRating * 0.2) * 10) / 10));

      // Light happiness & morale updates
      if (isWin) {
        p.happiness = Math.min(100, p.happiness + 2);
      } else if (isDraw) {
        p.happiness = Math.min(100, p.happiness + 1);
      } else {
        p.happiness = Math.max(30, p.happiness - 1);
      }
      if (p.happiness < 70) p.happiness += 1; // Playing regularly keeps starters content
      p.morale = deriveMorale(p.happiness);
      p.growthMomentum = computeGrowthMomentum(p);
    });

    // Bench or injured players in the squad (not in starting XI)
    club.squad.forEach(p => {
      if (!starterIds.has(p.id)) {
        // Drift slowly toward 6.5
        p.form = Math.min(10.0, Math.max(1.0, Math.round((p.form * 0.95 + 6.5 * 0.05) * 10) / 10));

        // High overall unused players slowly lose happiness
        if (p.overall >= 70 && !p.isInjured) {
          p.happiness = Math.max(15, p.happiness - 1);
        }
        p.morale = deriveMorale(p.happiness);
        p.growthMomentum = computeGrowthMomentum(p);
      }
    });
  };

  updateSquadPostMatch(homeClub, homeManager, homeXI, homeGoals, awayGoals, awayGoals === 0);
  updateSquadPostMatch(awayClub, awayManager, awayXI, awayGoals, homeGoals, homeGoals === 0);

  return {
    homeClubId: homeClub.id,
    awayClubId: awayClub.id,
    homeScore: homeGoals,
    awayScore: awayGoals,
    events,
  };
}

// Update club standings after match
export function applyMatchToClubs(match: MatchResult, homeClub: Club, awayClub: Club) {
  homeClub.played += 1;
  awayClub.played += 1;

  homeClub.goalsFor += match.homeScore;
  homeClub.goalsAgainst += match.awayScore;
  homeClub.goalDifference = homeClub.goalsFor - homeClub.goalsAgainst;

  awayClub.goalsFor += match.awayScore;
  awayClub.goalsAgainst += match.homeScore;
  awayClub.goalDifference = awayClub.goalsFor - awayClub.goalsAgainst;

  if (match.homeScore > match.awayScore) {
    homeClub.won += 1;
    homeClub.points += 3;
    awayClub.lost += 1;
    homeClub.form = ['W', ...homeClub.form.slice(0, 4)];
    awayClub.form = ['L', ...awayClub.form.slice(0, 4)];
  } else if (match.homeScore < match.awayScore) {
    awayClub.won += 1;
    awayClub.points += 3;
    homeClub.lost += 1;
    awayClub.form = ['W', ...awayClub.form.slice(0, 4)];
    homeClub.form = ['L', ...homeClub.form.slice(0, 4)];
  } else {
    homeClub.drawn += 1;
    awayClub.drawn += 1;
    homeClub.points += 1;
    awayClub.points += 1;
    homeClub.form = ['D', ...homeClub.form.slice(0, 4)];
    awayClub.form = ['D', ...awayClub.form.slice(0, 4)];
  }
}

// Compute dynamic growth momentum for any player based on age, form, and overall
export function computeGrowthMomentum(player: Player): GrowthMomentum {
  if (player.age <= 23) {
    if (player.form >= 7.2 && player.happiness >= 70) return 'breakout';
    if (player.form >= 6.7) return 'rapid';
    if (player.form < 6.2) return 'cooling';
    return 'steady';
  } else if (player.age <= 28) {
    if (player.overall >= 85 && player.form >= 7.0) return 'prime';
    if (player.form >= 7.4 && player.happiness >= 75) return 'breakout';
    if (player.form >= 6.8) return 'rapid';
    if (player.form < 6.1) return 'cooling';
    return 'steady';
  } else {
    // 29+
    if (player.overall >= 85 && player.form >= 7.0) return 'prime';
    if (player.form >= 7.4) return 'breakout';
    if (player.form < 6.3 || (player.age >= 32 && player.form < 6.7)) return 'cooling';
    return 'steady';
  }
}

// Player progression & regression engine - Uncapped dynamic 99 ceiling
// Balanced weekly chances so young players develop ~1-2 OVR per season
export function processSquadProgression(
  squad: Player[],
  newlyInjuredIds?: Set<string>
): { growthCount: number; declineCount: number } {
  let growthCount = 0;
  let declineCount = 0;

  squad.forEach(p => {
    // 1. Injury recovery runs only for pre-existing injuries (not sustained in this matchday)
    if (p.isInjured && !newlyInjuredIds?.has(p.id)) {
      if (p.injuryWeeks && p.injuryWeeks > 0) {
        p.injuryWeeks -= 1;
      }
      if (!p.injuryWeeks || p.injuryWeeks <= 0) {
        p.isInjured = false;
        p.injuryWeeks = 0;
      }
    }

    // 2. Growth (universal 99 ceiling, requires appearances > 0 this season)
    if (p.overall < 99 && p.appearances > 0) {
      let growthChance = 0;

      if (p.age <= 23) {
        if (p.form >= 7.0 && p.happiness >= 65) {
          growthChance = 0.035;
        } else if (p.form >= 6.6) {
          growthChance = 0.020;
        } else {
          growthChance = 0.008;
        }
      } else if (p.age <= 28) {
        if (p.form >= 7.3) {
          growthChance = 0.015;
        } else if (p.form >= 6.9) {
          growthChance = 0.008;
        }
      } else {
        // age 29+
        if (p.form >= 7.5) {
          growthChance = 0.006;
        }
      }

      if (growthChance > 0 && Math.random() < growthChance) {
        p.overall = Math.min(99, p.overall + 1);
        p.value = Math.round(p.value * 1.12);
        growthCount++;
      }
    }

    // 3. Veteran physical decline
    if (p.age >= 32 && p.form < 6.8 && Math.random() < 0.015) {
      if (p.overall > 45) {
        p.overall -= 1;
        p.value = Math.round(p.value * 0.88);
        declineCount++;
      }
    } else if (p.age >= 30 && p.age <= 31 && p.form < 6.0 && Math.random() < 0.008) {
      if (p.overall > 45) {
        p.overall -= 1;
        p.value = Math.round(p.value * 0.90);
        declineCount++;
      }
    }

    // Update dynamic growth momentum
    p.growthMomentum = computeGrowthMomentum(p);
  });

  return { growthCount, declineCount };
}

export interface PressHeadlineContext {
  recentTransfers?: TransferRecord[];
  ownerInterventionNote?: string;
}

function countLeadingFormStreak(form: ('W' | 'D' | 'L')[], target: 'W' | 'D' | 'L'): number {
  let count = 0;
  for (const r of form) {
    if (r === target) count++;
    else break;
  }
  return count;
}

// Generate the Sunday Press headlines based on real match, squad, transfer, and boardroom state
export function generatePressHeadlines(
  director: Director,
  club: Club,
  owner: Owner,
  manager: Manager | undefined,
  match: MatchResult | undefined,
  context: PressHeadlineContext = {}
): PressHeadline[] {
  const headlines: PressHeadline[] = [];
  const winStreak = countLeadingFormStreak(club.form, 'W');
  const lossStreak = countLeadingFormStreak(club.form, 'L');
  const unbeatenStreak = (() => {
    let c = 0;
    for (const r of club.form) {
      if (r === 'L') break;
      c++;
    }
    return c;
  })();

  if (match) {
    const isHome = match.homeClubId === club.id;
    const goalsFor = isHome ? match.homeScore : match.awayScore;
    const goalsAgainst = isHome ? match.awayScore : match.homeScore;
    const isWin = goalsFor > goalsAgainst;
    const isLoss = goalsFor < goalsAgainst;
    const goalEvents = match.events.filter(e => e.type === 'goal' && e.team === (isHome ? 'home' : 'away'));
    const heroScorer = goalEvents[0]?.player;

    if (isWin) {
      const margin = goalsFor - goalsAgainst;
      const winHeadline =
        winStreak >= 3
          ? `${club.name} extend winning run to ${winStreak} matches after ${goalsFor}-${goalsAgainst} victory`
          : margin >= 3
            ? `${club.name} dismantle rivals ${goalsFor}-${goalsAgainst}${heroScorer ? ` as ${heroScorer} stars` : ''}`
            : heroScorer
              ? `${heroScorer} fires ${club.name} to ${goalsFor}-${goalsAgainst} ${isHome ? 'home' : 'away'} win`
              : `${club.name} claim sharp ${goalsFor}-${goalsAgainst} result to climb the table`;
      headlines.push({
        title: winHeadline,
        source: 'The Sunday Athletic',
        category: 'match',
        sentiment: 'positive',
      });
      if (director.fanApproval < 50) {
        headlines.push({
          title: `Victory eases pressure on Director ${director.name} after recent terrace unrest`,
          source: 'Sky Sports News',
          category: 'fan_reaction',
          sentiment: 'positive',
        });
      }
    } else if (isLoss) {
      const lossHeadline =
        lossStreak >= 3
          ? `${club.name} slump to ${lossStreak} straight defeats after ${goalsFor}-${goalsAgainst} setback`
          : `${club.name} undone in ${goalsFor}-${goalsAgainst} loss as board expectation (${club.fanExpectation}) comes under scrutiny`;
      headlines.push({
        title: lossHeadline,
        source: 'Daily Football Mail',
        category: 'match',
        sentiment: 'negative',
      });
      if ((owner.patience === 'volatile' || owner.patience === 'impatient') && lossStreak >= 2) {
        headlines.push({
          title: `${owner.name} calls urgent recruitment review as ${club.shortName} slide continues`,
          source: 'The Guardian Football',
          category: 'boardroom',
          sentiment: 'negative',
        });
      }
    } else {
      headlines.push({
        title:
          unbeatenStreak >= 4
            ? `${club.name} stretch unbeaten run to ${unbeatenStreak} games with ${goalsFor}-${goalsAgainst} draw`
            : `${club.name} share spoils in ${goalsFor}-${goalsAgainst} draw`,
        source: 'BBC Sport',
        category: 'match',
        sentiment: 'neutral',
      });
    }
  }

  // Real squad state stories (unhappy players, injuries, expiring deals, new signings)
  const injuredKey = [...club.squad]
    .filter(p => p.isInjured)
    .sort((a, b) => b.overall - a.overall)[0];
  if (injuredKey) {
    headlines.push({
      title: `Injury blow at ${club.shortName}: ${injuredKey.name} (${injuredKey.overall} OVR) sidelined for ${injuredKey.injuryWeeks || 1} more week${(injuredKey.injuryWeeks || 1) === 1 ? '' : 's'}`,
      source: 'Club Medical Bulletin',
      category: 'crisis',
      sentiment: 'negative',
    });
  }

  const unhappyStar = [...club.squad]
    .filter(p => p.happiness < 45)
    .sort((a, b) => a.happiness - b.happiness)[0];
  if (unhappyStar) {
    headlines.push({
      title: `Dressing room tension: ${unhappyStar.name} (${unhappyStar.happiness}% morale) grows frustrated over role`,
      source: 'Training Ground Insider',
      category: 'crisis',
      sentiment: 'negative',
    });
  }

  const expiringCore = [...club.squad]
    .filter(p => !p.retiringAtSeasonEnd && p.contractYears <= 1 && p.overall >= 70)
    .sort((a, b) => b.overall - a.overall)[0];
  if (expiringCore && headlines.length < 4) {
    headlines.push({
      title: `Contract watch: ${expiringCore.name} enters final year at ${club.shortName} with clubs monitoring`,
      source: 'Transfer Notebook',
      category: 'transfer',
      sentiment: 'neutral',
    });
  }

  const recentSigning = (context.recentTransfers || []).find(
    tr => tr.type === 'signing' && tr.toClubId === club.id
  );
  if (recentSigning && headlines.length < 4) {
    const liveSigned = club.squad.find(p => p.id === recentSigning.playerId);
    if (liveSigned) {
      headlines.push({
        title: `New arrival ${liveSigned.name} (${liveSigned.roleDetail}) settles into ${club.shortName} plans`,
        source: 'Sky Sports Wire',
        category: 'transfer',
        sentiment: liveSigned.form >= 6.8 ? 'positive' : 'neutral',
      });
    }
  }

  if (context.ownerInterventionNote) {
    headlines.push({
      title: context.ownerInterventionNote,
      source: 'The Boardroom Wire',
      category: 'boardroom',
      sentiment: owner.approval < 50 ? 'negative' : 'neutral',
    });
  }

  if (manager && manager.trustInDirector < 40) {
    headlines.push({
      title: `Rift widens between Head Coach ${manager.name} and Sporting Director ${director.name} (Trust ${manager.trustInDirector}%)`,
      source: 'Fabrizio Romano Wire',
      category: 'crisis',
      sentiment: 'negative',
    });
  }

  if (owner.takeoverRisk > 40) {
    headlines.push({
      title: `Takeover Rumors: Consortium circles ${club.name} as ownership faces fan scrutiny`,
      source: 'Financial Times Sport',
      category: 'boardroom',
      sentiment: 'neutral',
    });
  }

  return headlines.slice(0, 5);
}

// Generate boardroom internal memo shaped by owner wealth, patience, involvement, and recruitment philosophy
export function generateBoardroomMemo(
  director: Director,
  club: Club,
  owner: Owner,
  manager: Manager | undefined,
  _match: MatchResult | undefined,
  ownerInterventionNote?: string
): BoardroomMemo {
  const winStreak = countLeadingFormStreak(club.form, 'W');
  const lossStreak = countLeadingFormStreak(club.form, 'L');
  const targetNote =
    owner.demandedTargets && owner.demandedTargets.length > 0
      ? ` Active mandate: ${owner.demandedTargets[0]}.`
      : '';
  const philosophyLabel = owner.recruitmentPhilosophy.replace(/_/g, ' ');

  if (lossStreak >= 3 || (owner.patience === 'volatile' && lossStreak >= 2)) {
    if (owner.approval < 42 || director.boardTrust <= 28) {
      return {
        author: owner.name,
        role: `Chairman · ${owner.involvement.replace('_', ' ')} (${owner.patience})`,
        content:
          owner.involvement === 'micromanager'
            ? `${lossStreak} defeats in a row will not stand. I am reviewing every line-up and ${philosophyLabel} target personally. Turn this around next matchday or I will restructure leadership immediately.${targetNote}`
            : `Our run of ${lossStreak} straight defeats has exhausted board patience. Without an immediate response on the pitch, your position as Sporting Director is untenable.`,
        tone: 'ultimatum',
        impactExplanation: ownerInterventionNote || 'Board trust is critically low; another defeat risks immediate dismissal.',
      };
    }
    return {
      author: owner.name,
      role: `Chairman · ${owner.wealth} ownership`,
      content: `This sequence of ${lossStreak} defeats falls below our ${club.fanExpectation} standard. Align recruitment strictly with our ${philosophyLabel} direction and steady the dugout with ${manager?.name || 'the coaching staff'}.${targetNote}`,
      tone: 'warning',
      impactExplanation: ownerInterventionNote || `Owner patience (${owner.patience}) is tightening.`,
    };
  }

  if (winStreak >= 3) {
    return {
      author: owner.name,
      role: `Chairman · ${owner.wealth} ownership`,
      content:
        owner.involvement === 'hands_off'
          ? `Three wins on the bounce proves our hands-off governance works. Keep delivering results and sticking to our ${philosophyLabel} vision.${targetNote}`
          : `Superb ${winStreak}-match winning surge! Squad cohesion and our ${philosophyLabel} direction are paying off on the pitch.${targetNote}`,
      tone: 'praising',
      impactExplanation: ownerInterventionNote || 'Board trust and fan approval surged by +5 points!',
    };
  }

  const expiringCount = club.squad.filter(p => !p.retiringAtSeasonEnd && p.contractYears <= 1).length;
  const budgetNote =
    owner.wealth === 'frugal'
      ? `Keep weekly wages inside £${(club.wageBudget / 1000).toFixed(0)}k and protect cash reserves (£${(club.balance / 1000000).toFixed(1)}M).`
      : `Continue building toward ${club.fanExpectation} within our ${philosophyLabel} remit.`;

  return {
    author: owner.name,
    role: `Chairman · ${owner.involvement.replace('_', ' ')}`,
    content:
      owner.involvement === 'hands_off'
        ? `Brief check-in: we trust your day-to-day handling of ${club.name}. ${expiringCount > 0 ? `${expiringCount} contract(s) need attention before summer. ` : ''}${budgetNote}`
        : `Weekly executive review: ${expiringCount > 0 ? `${expiringCount} senior contract(s) enter their final year. ` : ''}${budgetNote}${targetNote}`,
    tone: 'neutral',
    impactExplanation: ownerInterventionNote,
  };
}

export function evaluateOwnerSackDecision(
  director: Director,
  club: Club | undefined,
  owner: Owner | undefined
): { sacked: boolean; reason?: string } {
  if (!owner || !club) {
    if (director.boardTrust <= 0) {
      return {
        sacked: true,
        reason: 'Board trust reached 0% after sustained underperformance.',
      };
    }
    return { sacked: false };
  }

  const recentLosses = club.form.slice(0, 5).filter(r => r === 'L').length;
  const nearBottom = club.played >= 14 && (club.points / Math.max(1, club.played)) < 0.85;

  switch (owner.patience) {
    case 'volatile':
      if (director.boardTrust <= 15) {
        return {
          sacked: true,
          reason: `Volatile owner ${owner.name} pulled the trigger once board trust dropped to ${director.boardTrust}% (volatile threshold: <=15%).`,
        };
      }
      if (director.boardTrust <= 28 && club.played >= 10 && recentLosses >= 4) {
        return {
          sacked: true,
          reason: `Volatile owner ${owner.name} dismissed you after ${recentLosses} defeats in 5 matches with trust at ${director.boardTrust}%.`,
        };
      }
      return { sacked: false };

    case 'impatient':
      if (director.boardTrust <= 8) {
        return {
          sacked: true,
          reason: `Impatient owner ${owner.name} terminated your contract with board trust at ${director.boardTrust}% (impatient threshold: <=8%).`,
        };
      }
      if (director.boardTrust <= 18 && nearBottom) {
        return {
          sacked: true,
          reason: `Impatient owner ${owner.name} acted over relegation form (${club.points} pts in ${club.played} games) and ${director.boardTrust}% trust.`,
        };
      }
      return { sacked: false };

    case 'patient':
      if (director.boardTrust <= 0 && (owner.approval <= 15 || club.played >= 14)) {
        return {
          sacked: true,
          reason: `Patient owner ${owner.name} finally ended your tenure after board trust hit 0% and approval sank to ${owner.approval}%.`,
        };
      }
      return { sacked: false };

    case 'balanced':
    default:
      if (director.boardTrust <= 0) {
        return {
          sacked: true,
          reason: `Owner ${owner.name} dismissed you after board trust fell to 0%.`,
        };
      }
      return { sacked: false };
  }
}

export function evaluateWeeklyDelegationEffects(
  club: Club,
  manager: Manager | undefined,
  delegation: DelegationMatrix
): {
  trustDelta: number;
  moraleDelta: number;
  consequenceNote?: string;
} {
  if (!manager) return { trustDelta: 0, moraleDelta: 0 };

  const delegatedTransferCount =
    (delegation.transferSignings !== 'director' ? 1 : 0) +
    (delegation.transferSales !== 'director' ? 1 : 0) +
    (delegation.contractRenewals === 'manager' ? 1 : 0) +
    (delegation.youthPromotion === 'manager' ? 1 : 0);

  if (manager.controlDesire === 'head_coach') {
    if (delegation.tacticalStyle === 'manager_freedom' && delegatedTransferCount >= 2) {
      const trustDelta = delegatedTransferCount >= 4 ? 2 : 1;
      const moraleDelta = manager.trustInDirector >= 70 ? 2 : 1;
      return {
        trustDelta,
        moraleDelta,
        consequenceNote: `Giving Head Coach ${manager.name} tactical & squad autonomy boosted manager trust (+${trustDelta}) and dressing-room morale (+${moraleDelta}%).`,
      };
    }
    if (delegation.tacticalStyle === 'director_mandated' && delegatedTransferCount === 0) {
      return {
        trustDelta: -1,
        moraleDelta: -1,
        consequenceNote: `Tight director micromanagement dampened ${manager.name}'s dressing-room momentum (-1 trust, -1% morale).`,
      };
    }
    return { trustDelta: 0, moraleDelta: 0 };
  }

  if (manager.controlDesire === 'autocrat') {
    const fullyOverridden =
      delegation.tacticalStyle === 'director_mandated' ||
      (delegation.transferSignings === 'director' && delegation.transferSales === 'director');

    if (fullyOverridden) {
      const trustDelta =
        delegation.tacticalStyle === 'director_mandated' &&
        delegation.transferSignings === 'director' &&
        delegation.transferSales === 'director'
          ? -3
          : -2;
      const moraleDelta = manager.trustInDirector < 45 ? -1 : 0;
      return {
        trustDelta,
        moraleDelta,
        consequenceNote: `Autocrat ${manager.name} resents losing boardroom control (${trustDelta} trust${moraleDelta < 0 ? ', -1% morale' : ''}).`,
      };
    }

    if (delegation.tacticalStyle === 'manager_freedom' && delegatedTransferCount >= 2) {
      return {
        trustDelta: 1,
        moraleDelta: 1,
        consequenceNote: `${manager.name} thrives with full authority over tactics and transfers (+1 trust, +1% morale).`,
      };
    }
    return { trustDelta: 0, moraleDelta: 0 };
  }

  // Collaborator
  const sharedCount =
    (delegation.transferSignings === 'shared' ? 1 : 0) +
    (delegation.transferSales === 'shared' ? 1 : 0);
  if (sharedCount >= 1 && delegation.tacticalStyle === 'manager_freedom') {
    return {
      trustDelta: 1,
      moraleDelta: 0,
      consequenceNote: `Shared collaboration with ${manager.name} strengthened working alignment (+1 trust).`,
    };
  }
  if (delegation.tacticalStyle === 'director_mandated' && delegatedTransferCount === 0) {
    return {
      trustDelta: -1,
      moraleDelta: 0,
      consequenceNote: `Total director control irritated collaborator ${manager.name} (-1 trust).`,
    };
  }
  return { trustDelta: 0, moraleDelta: 0 };
}

function evaluateWeeklyOwnerIntervention(
  week: number,
  club: Club,
  owner: Owner,
  director: Director
): {
  updatedClub: Club;
  updatedOwner: Owner;
  updatedDirector: Director;
  interventionNote?: string;
} {
  const lossStreak = countLeadingFormStreak(club.form, 'L');
  const triggerChance =
    owner.involvement === 'micromanager'
      ? lossStreak >= 2 ? 0.55 : 0.30
      : owner.involvement === 'collaborative'
        ? lossStreak >= 2 ? 0.28 : 0.14
        : 0.05;

  if (week < 2 || Math.random() >= triggerChance) {
    return { updatedClub: club, updatedOwner: owner, updatedDirector: director };
  }

  const nextClub = { ...club };
  const nextOwner: Owner = {
    ...owner,
    demandedTargets: owner.demandedTargets ? [...owner.demandedTargets] : [],
  };
  const nextDirector = { ...director };

  // Wealthy/Oligarch emergency capital injection when struggling & short on transfer funds
  if (
    (owner.wealth === 'oligarch' || owner.wealth === 'wealthy') &&
    club.transferBudget < (club.tier === 1 ? 8_000_000 : club.tier === 2 ? 2_500_000 : 800_000) &&
    isTransferWindowOpen(week) &&
    club.played >= 2
  ) {
    const boost = owner.wealth === 'oligarch'
      ? club.tier === 1 ? 10_000_000 : club.tier === 2 ? 4_000_000 : 1_500_000
      : club.tier === 1 ? 5_000_000 : club.tier === 2 ? 2_000_000 : 750_000;
    nextClub.transferBudget += boost;
    nextClub.balance += boost;
    return {
      updatedClub: nextClub,
      updatedOwner: nextOwner,
      updatedDirector: nextDirector,
      interventionNote: `Owner ${owner.name} injected £${(boost / 1_000_000).toFixed(1)}M into the transfer war chest to accelerate our ${owner.recruitmentPhilosophy.replace(/_/g, ' ')} push.`,
    };
  }

  // Frugal owner austerity check after losses + heavy spending
  if (owner.wealth === 'frugal' && lossStreak >= 2 && director.netSpend > 0 && nextClub.transferBudget > 500_000) {
    const trim = Math.round(nextClub.transferBudget * 0.15);
    nextClub.transferBudget = Math.max(0, nextClub.transferBudget - trim);
    nextOwner.approval = Math.max(0, nextOwner.approval - 2);
    return {
      updatedClub: nextClub,
      updatedOwner: nextOwner,
      updatedDirector: nextDirector,
      interventionNote: `Frugal owner ${owner.name} trimmed the transfer budget by £${(trim / 1_000_000).toFixed(1)}M after ${lossStreak} defeats and net spending.`,
    };
  }

  // Philosophy-driven board directive added to demandedTargets
  const philosophyDirective =
    owner.recruitmentPhilosophy === 'youth_development'
      ? 'Promote or sign an U21 first-team contributor'
      : owner.recruitmentPhilosophy === 'marquee_stars'
        ? `Target a ${club.tier === 1 ? '81+' : club.tier === 2 ? '74+' : '66+'} OVR statement signing`
        : owner.recruitmentPhilosophy === 'moneyball_data'
          ? 'Keep all acquisitions at or below market valuation'
          : owner.recruitmentPhilosophy === 'domestic_grit'
            ? 'Maintain a 50%+ UK & Irish squad core'
            : `Deliver top-tier results aligned with ${club.fanExpectation}`;

  if (!nextOwner.demandedTargets!.includes(philosophyDirective)) {
    nextOwner.demandedTargets = [philosophyDirective, ...nextOwner.demandedTargets!].slice(0, 3);
    return {
      updatedClub: nextClub,
      updatedOwner: nextOwner,
      updatedDirector: nextDirector,
      interventionNote: `${owner.name} issued a boardroom directive: "${philosophyDirective}".`,
    };
  }

  if (owner.involvement === 'micromanager' && lossStreak >= 2) {
    nextDirector.boardTrust = Math.max(0, nextDirector.boardTrust - 2);
    nextOwner.approval = Math.max(0, nextOwner.approval - 2);
    return {
      updatedClub: nextClub,
      updatedOwner: nextOwner,
      updatedDirector: nextDirector,
      interventionNote: `Micromanager ${owner.name} docked 2 board trust over recent defeats and demanded tactical accountability.`,
    };
  }

  return { updatedClub: club, updatedOwner: owner, updatedDirector: director };
}

// Simulate realistic AI-to-AI transfers during active transfer windows (Summer: w1-6, Winter: w20-24)
export function simulateAITransfersForWeek(
  currentWeek: number,
  seasonYear: number,
  clubsMap: Map<string, Club>,
  directorClubId: string | null
): TransferRecord[] {
  const newTransfers: TransferRecord[] = [];
  if (!isTransferWindowOpen(currentWeek)) return newTransfers;

  // Decide how many AI deals to attempt this week (1 to 2 deals during open windows)
  const dealsToAttempt = Math.floor(Math.random() * 2) + 1;
  const aiClubs = Array.from(clubsMap.values()).filter(
    c => c.id !== directorClubId && c.transferBudget > 2000000 && c.squad.length < 25
  );

  for (let i = 0; i < dealsToAttempt; i++) {
    if (aiClubs.length < 2) break;
    const buyer = aiClubs[Math.floor(Math.random() * aiClubs.length)];
    if (!buyer || buyer.transferBudget < 1500000 || buyer.squad.length >= 25) continue;

    // Pick a selling AI club (different from buyer, maintaining minimum squad depth)
    const eligibleSellers = Array.from(clubsMap.values()).filter(
      c => c.id !== buyer.id && c.id !== directorClubId && c.squad.length > 20
    );
    if (eligibleSellers.length === 0) continue;
    const seller = eligibleSellers[Math.floor(Math.random() * eligibleSellers.length)];

    const buyerCurrentWages = buyer.squad.reduce((sum, p) => sum + p.wage, 0);
    const eligiblePlayers = seller.squad.filter(
      p =>
        p.value <= buyer.transferBudget &&
        p.value >= 400000 &&
        !p.isInjured &&
        !p.retiringAtSeasonEnd &&
        buyerCurrentWages + Math.round(p.wage * 1.15) <= buyer.wageBudget
    );
    if (eligiblePlayers.length === 0) continue;

    const targetPlayer = eligiblePlayers[Math.floor(Math.random() * eligiblePlayers.length)];
    const fee = Math.round(targetPlayer.value * (0.95 + Math.random() * 0.25));
    const offeredWage = Math.round(targetPlayer.wage * 1.15);

    if (
      buyer.transferBudget >= fee &&
      buyer.balance >= fee &&
      buyerCurrentWages + offeredWage <= buyer.wageBudget
    ) {
      buyer.transferBudget -= fee;
      buyer.balance -= fee;
      seller.transferBudget += fee;
      seller.balance += fee;

      // Transfer player between AI squads
      seller.squad = seller.squad.filter(p => p.id !== targetPlayer.id);
      const transferredPlayer: Player = {
        ...targetPlayer,
        clubId: buyer.id,
        wage: Math.round(targetPlayer.wage * 1.15),
        contractYears: 3,
        happiness: 80,
        morale: 'content',
      };
      buyer.squad.push(transferredPlayer);

      newTransfers.push({
        id: `tr_${seasonYear}_w${currentWeek}_${buyer.id}_${targetPlayer.id}_${Math.random().toString(36).substring(2, 6)}`,
        season: seasonYear,
        week: currentWeek,
        type: 'signing',
        playerId: targetPlayer.id,
        playerName: targetPlayer.name,
        position: targetPlayer.position,
        age: targetPlayer.age,
        overall: targetPlayer.overall,
        fromClubId: seller.id,
        toClubId: buyer.id,
        fee,
        wage: transferredPlayer.wage,
        contractYears: transferredPlayer.contractYears,
        initiatedBy: 'ai',
      });
    }
  }

  // AI clubs do not poach from each other's academies in this version.
  return newTransfers;
}

// Generate deterministic double round-robin pairings for a league tier on a given week
export function generatePairingsForWeek(
  clubIds: string[],
  week: number
): { homeId: string; awayId: string }[] {
  if (clubIds.length < 2) return [];

  const teams = [...clubIds];
  if (teams.length % 2 !== 0) {
    teams.push('__BYE__');
  }

  const n = teams.length;
  const halfRounds = n - 1;
  const cycleIndex = Math.max(0, week - 1) % (halfRounds * 2);
  const isSecondHalf = cycleIndex >= halfRounds;
  const round = cycleIndex % halfRounds;

  const rest = teams.slice(1);
  const rotated = [teams[0], ...rest.slice(round), ...rest.slice(0, round)];

  const pairings: { homeId: string; awayId: string }[] = [];
  for (let i = 0; i < n / 2; i++) {
    const a = rotated[i];
    const b = rotated[n - 1 - i];
    if (a === '__BYE__' || b === '__BYE__') continue;

    const flipFirstHalf = i === 0 ? round % 2 === 1 : (i + round) % 2 === 1;
    let homeId = flipFirstHalf ? b : a;
    let awayId = flipFirstHalf ? a : b;

    if (isSecondHalf) {
      [homeId, awayId] = [awayId, homeId];
    }

    pairings.push({ homeId, awayId });
  }

  return pairings;
}

// Advance simulation for 1 week across all 3 tiers (68 clubs)
export function advanceSimulationWeek(
  currentWeek: number,
  seasonYear: number,
  clubs: Club[],
  owners: Owner[],
  managers: Manager[],
  director: Director,
  delegation: DelegationMatrix,
  freeAgents: Player[] = [],
  transferHistory: TransferRecord[] = [],
  transferProposals: TransferProposal[] = [],
  modeOptions?: SimulationModeOptions
): {
  updatedClubs: Club[];
  updatedOwners: Owner[];
  updatedManagers: Manager[];
  updatedDirector: Director;
  updatedFreeAgents: Player[];
  digest: WeeklyDigest;
  gameweekRecord: GameweekRecord;
  newTransfers: TransferRecord[];
  updatedTransferProposals: TransferProposal[];
  newIncomingBids?: IncomingBid[];
} {
  const nextWeek = currentWeek + 1;
  const allResults: MatchResult[] = [];
  let playerMatch: MatchResult | undefined;

  // Deep copy each club with squad, form, academy, and lineup to protect React state
  const clubsMap = new Map<string, Club>();
  clubs.forEach(c => clubsMap.set(c.id, {
    ...c,
    squad: c.squad.map(p => ({ ...p })),
    form: [...c.form],
    academy: c.academy ? c.academy.map(a => ({ ...a })) : undefined,
    lineup: c.lineup
      ? {
          ...c.lineup,
          slots: [...c.lineup.slots],
          bench: [...c.lineup.bench],
        }
      : undefined,
  }));

  const ownersMap = new Map<string, Owner>();
  owners.forEach(o => ownersMap.set(o.id, {
    ...o,
    demandedTargets: o.demandedTargets ? [...o.demandedTargets] : undefined,
  }));

  const managersMap = new Map<string, Manager>();
  managers.forEach(m =>
    managersMap.set(m.id, {
      ...m,
      attributes: m.attributes ? { ...m.attributes } : deriveManagerAttributes(m),
    })
  );

  // AI clubs that lost their manager hire a replacement from the fixed pool within 1–4 weeks
  const aiManagerAppointmentHeadlines: PressHeadline[] = [];
  clubsMap.forEach(c => {
    if (c.id === director.currentClubId || c.managerId) {
      if (c.managerId && c.managerVacancyWeeksRemaining !== undefined) {
        c.managerVacancyWeeksRemaining = undefined;
      }
      return;
    }

    const currentCountdown =
      typeof c.managerVacancyWeeksRemaining === 'number'
        ? c.managerVacancyWeeksRemaining
        : 1 + Math.floor(Math.random() * 4);
    const nextCountdown = currentCountdown - 1;

    if (nextCountdown > 0) {
      c.managerVacancyWeeksRemaining = nextCountdown;
      return;
    }

    const hirePick = selectBestAffordableManagerForAIClub(
      c,
      Array.from(managersMap.values()),
      director.currentClubId
    );
    if (!hirePick) {
      c.managerVacancyWeeksRemaining = 1;
      return;
    }

    const prevEmployerId = hirePick.manager.clubId;
    if (prevEmployerId && prevEmployerId !== c.id) {
      const prevClub = clubsMap.get(prevEmployerId);
      if (prevClub) {
        prevClub.managerId = null;
        prevClub.managerVacancyWeeksRemaining = 1 + Math.floor(Math.random() * 4);
      }
    }

    c.managerId = hirePick.manager.id;
    c.balance = Math.max(0, c.balance - hirePick.costs.totalCost);
    c.managerVacancyWeeksRemaining = undefined;

    const hiredAiMgr = appendManagerHistory(
      {
        ...hirePick.manager,
        clubId: c.id,
        seasonsAtClub: 0,
        trustInDirector: 75,
        careerStats: getManagerCareerStats(hirePick.manager),
      },
      {
        season: seasonYear,
        week: currentWeek,
        type: 'appointed',
        title: `Appointed Head Coach of ${c.name}`,
        detail: `Hired by ${c.name} following a managerial vacancy.`,
        clubId: c.id,
        clubName: c.name,
      }
    );
    managersMap.set(hirePick.manager.id, hiredAiMgr);

    aiManagerAppointmentHeadlines.push({
      title: `${c.name} appoint ${hirePick.manager.name} as new Head Coach`,
      source: 'League Wire',
      category: 'boardroom',
      sentiment: 'neutral',
    });
  });

  // Per-week lineup cache:
  // - User's club runs prepareUserLineupForMatch (updates auto lineup for form/injuries or replaces injured manual starters with notice)
  // - AI clubs run autoPickLineup with their manager's preferred formation once per week
  const weeklyLineupCache = new Map<string, Lineup>();
  let matchFormation: FormationId | undefined;
  let matchTeamRating: number | undefined;
  let lineupNotices: string[] = [];

  const isManagerMode = modeOptions?.gameMode === 'manager';
  const userManagerAdapter = modeOptions?.userManagerAdapter;

  clubsMap.forEach(c => {
    const isMyClub = Boolean(director.currentClubId && c.id === director.currentClubId);
    const mgr = isMyClub && isManagerMode && userManagerAdapter
      ? userManagerAdapter
      : (c.managerId ? managersMap.get(c.managerId) : undefined);
    if (isMyClub) {
      const prepared = prepareUserLineupForMatch(c, mgr);
      c.lineup = prepared.lineup;
      lineupNotices = prepared.notices;
      matchFormation = prepared.lineup.formation;
      matchTeamRating = computeTeamRating(prepared.lineup, c.squad);
      weeklyLineupCache.set(c.id, prepared.lineup);
    } else {
      c.lineup = undefined;
      const aiLineup = autoPickLineup(c, getDefaultFormation(mgr), mgr);
      weeklyLineupCache.set(c.id, aiLineup);
    }
  });

  // Separate clubs by tier
  const tier1Ids = clubs.filter(c => c.tier === 1).map(c => c.id);
  const tier2Ids = clubs.filter(c => c.tier === 2).map(c => c.id);
  const tier3Ids = clubs.filter(c => c.tier === 3).map(c => c.id);

  const newlyInjuredIds = new Set<string>();

  const simulateTier = (tierClubIds: string[]) => {
    const pairings = generatePairingsForWeek(tierClubIds, currentWeek);
    pairings.forEach(({ homeId, awayId }) => {
      const homeClub = clubsMap.get(homeId)!;
      const awayClub = clubsMap.get(awayId)!;
      const homeMgr =
        isManagerMode && userManagerAdapter && homeClub.id === director.currentClubId
          ? userManagerAdapter
          : (homeClub.managerId ? managersMap.get(homeClub.managerId) : undefined);
      const awayMgr =
        isManagerMode && userManagerAdapter && awayClub.id === director.currentClubId
          ? userManagerAdapter
          : (awayClub.managerId ? managersMap.get(awayClub.managerId) : undefined);

      const res = simulateMatch(homeClub, awayClub, homeMgr, awayMgr, weeklyLineupCache, newlyInjuredIds);
      applyMatchToClubs(res, homeClub, awayClub);
      allResults.push(res);

      const homeOutcome: 'W' | 'D' | 'L' =
        res.homeScore > res.awayScore ? 'W' : res.homeScore < res.awayScore ? 'L' : 'D';
      const awayOutcome: 'W' | 'D' | 'L' =
        res.awayScore > res.homeScore ? 'W' : res.awayScore < res.homeScore ? 'L' : 'D';
      if (homeMgr && (!userManagerAdapter || homeMgr.id !== userManagerAdapter.id)) {
        managersMap.set(homeMgr.id, recordManagerMatchResult(homeMgr, homeOutcome, homeClub, seasonYear, currentWeek));
      }
      if (awayMgr && (!userManagerAdapter || awayMgr.id !== userManagerAdapter.id)) {
        managersMap.set(awayMgr.id, recordManagerMatchResult(awayMgr, awayOutcome, awayClub, seasonYear, currentWeek));
      }

      if (director.currentClubId && (homeId === director.currentClubId || awayId === director.currentClubId)) {
        playerMatch = res;
      }
    });
  };

  // Tier 1 plays 38 matches (20 clubs); Tier 2 & 3 play 46 matches (24 clubs)
  if (currentWeek <= 38) {
    simulateTier(tier1Ids);
  }
  if (currentWeek <= 46) {
    simulateTier(tier2Ids);
    simulateTier(tier3Ids);
  }

  // Player's club specifics
  const playerClub = director.currentClubId ? clubsMap.get(director.currentClubId) : undefined;
  const playerOwner = playerClub ? ownersMap.get(playerClub.ownerId) : undefined;
  const playerManager =
    playerClub && isManagerMode && userManagerAdapter
      ? userManagerAdapter
      : (playerClub && playerClub.managerId ? managersMap.get(playerClub.managerId) : undefined);

  let totalGrowth = 0;
  let totalDecline = 0;

  // Process player growth/decline and injury recovery for EVERY club each week
  clubsMap.forEach(club => {
    const { growthCount, declineCount } = processSquadProgression(club.squad, newlyInjuredIds);
    if (director.currentClubId && club.id === director.currentClubId) {
      totalGrowth = growthCount;
      totalDecline = declineCount;
    }
  });

  // Update Director trust & fan approval based on match
  const updatedDirector = { ...director };
  if (playerClub && playerOwner && playerMatch) {
    const isHome = playerMatch.homeClubId === playerClub.id;
    const goalsFor = isHome ? playerMatch.homeScore : playerMatch.awayScore;
    const goalsAgainst = isHome ? playerMatch.awayScore : playerMatch.homeScore;

    if (goalsFor > goalsAgainst) {
      updatedDirector.boardTrust = Math.min(100, updatedDirector.boardTrust + 4);
      updatedDirector.fanApproval = Math.min(100, updatedDirector.fanApproval + 5);
      playerOwner.approval = Math.min(100, playerOwner.approval + 4);
      if (playerManager) playerManager.trustInDirector = Math.min(100, playerManager.trustInDirector + 2);
    } else if (goalsFor < goalsAgainst) {
      const patiencePenalty = playerOwner.patience === 'volatile' ? 7 : playerOwner.patience === 'impatient' ? 5 : 3;
      updatedDirector.boardTrust = Math.max(0, updatedDirector.boardTrust - patiencePenalty);
      updatedDirector.fanApproval = Math.max(0, updatedDirector.fanApproval - 5);
      playerOwner.approval = Math.max(0, playerOwner.approval - patiencePenalty);

      // Blame engine: Owner decides whether to blame Director or Manager
      if (playerManager && playerManager.controlDesire === 'autocrat') {
        // Manager takes more heat from fans if he's an autocrat
        playerManager.trustInDirector = Math.max(0, playerManager.trustInDirector - 3);
      }
    } else {
      // Draw
      updatedDirector.boardTrust = Math.max(0, updatedDirector.boardTrust - 1);
    }
  }

  // Expire stale pending transfer proposals every week and whenever a transfer window shuts
  let updatedTransferProposals = expireTransferProposals(transferProposals, nextWeek, true);
  let updatedFreeAgents = freeAgents.map(fa => ({ ...fa }));

  // Check for Manager-Controlled / Shared Autonomous Transfer Activity during open transfer windows (Weeks 1-6, 20-24)
  let managerSigning: ManagerSigningEvent | undefined;
  let managerPressHeadlines: PressHeadline[] = [];
  const isWindowOpen = isTransferWindowOpen(currentWeek);
  const newTransfers = simulateAITransfersForWeek(currentWeek, seasonYear, clubsMap, director.currentClubId);
  const newIncomingBids: IncomingBid[] = [];
  let finalDirector = updatedDirector;

  const myClubId = finalDirector.currentClubId;
  const preDealPlayerClub = myClubId ? clubsMap.get(myClubId) : undefined;
  const preDealPlayerOwner = preDealPlayerClub ? ownersMap.get(preDealPlayerClub.ownerId) : undefined;
  const preDealPlayerManager =
    preDealPlayerClub && preDealPlayerClub.managerId
      ? managersMap.get(preDealPlayerClub.managerId)
      : undefined;

  if (!isManagerMode && myClubId && preDealPlayerClub && preDealPlayerManager && preDealPlayerOwner) {
    const managerActivity = runManagerTransferActivity({
      currentWeek,
      seasonYear,
      myClubId,
      owner: preDealPlayerOwner,
      manager: preDealPlayerManager,
      clubs: Array.from(clubsMap.values()),
      freeAgents: updatedFreeAgents,
      director: finalDirector,
      delegation,
      transferHistory: [...newTransfers, ...transferHistory],
      transferProposals: updatedTransferProposals,
    });

    clubsMap.clear();
    managerActivity.clubs.forEach(c => clubsMap.set(c.id, c));
    updatedFreeAgents = managerActivity.freeAgents;
    finalDirector = managerActivity.director;
    ownersMap.set(managerActivity.owner.id, managerActivity.owner);
    managersMap.set(managerActivity.manager.id, managerActivity.manager);
    updatedTransferProposals = managerActivity.updatedProposals;
    if (managerActivity.newTransfers.length > 0) {
      newTransfers.unshift(...managerActivity.newTransfers);
    }
    if (managerActivity.pressHeadlines.length > 0) {
      managerPressHeadlines = managerActivity.pressHeadlines;
    }
    managerSigning = managerActivity.managerSigning;
  } else if (isManagerMode && myClubId && modeOptions?.clubDirector && userManagerAdapter) {
    const aiDirActivity = runAISportingDirectorWeeklyActivity({
      currentWeek,
      seasonYear,
      userClubId: myClubId,
      clubDirector: modeOptions.clubDirector,
      clubs: Array.from(clubsMap.values()),
      freeAgents: updatedFreeAgents,
      owners: Array.from(ownersMap.values()),
      managerAdapter: userManagerAdapter,
      transferHistory: [...newTransfers, ...transferHistory],
    });
    clubsMap.clear();
    aiDirActivity.clubs.forEach(c => clubsMap.set(c.id, c));
    updatedFreeAgents = aiDirActivity.freeAgents;
    ownersMap.clear();
    aiDirActivity.owners.forEach(o => ownersMap.set(o.id, o));
    if (aiDirActivity.newTransfers.length > 0) {
      newTransfers.unshift(...aiDirActivity.newTransfers);
    }
    if (aiDirActivity.pressHeadlines.length > 0) {
      managerPressHeadlines.push(...aiDirActivity.pressHeadlines);
    }
  }

  const academyWire: AcademyWireEvent[] = [];

  // Check for Manager-Controlled Youth Academy Promotions for MY club only (Director Mode)
  const postTransferPlayerClub = myClubId ? clubsMap.get(myClubId) : undefined;
  const postTransferPlayerManager =
    postTransferPlayerClub && postTransferPlayerClub.managerId
      ? managersMap.get(postTransferPlayerClub.managerId)
      : undefined;

  if (!isManagerMode && myClubId && postTransferPlayerClub) {
    const youthActivity = runManagerYouthPromotion({
      myClubId,
      club: postTransferPlayerClub,
      manager: postTransferPlayerManager,
      currentWeek,
      seasonYear,
      delegation,
      transferHistory: [...newTransfers, ...transferHistory],
    });
    clubsMap.set(myClubId, youthActivity.updatedClub);
    if (youthActivity.reputationGain > 0) {
      finalDirector = {
        ...finalDirector,
        reputation: Math.min(100, finalDirector.reputation + youthActivity.reputationGain),
      };
    }
    if (youthActivity.newTransfers.length > 0) {
      newTransfers.unshift(...youthActivity.newTransfers);
      youthActivity.newTransfers.forEach(tr => {
        academyWire.push({
          id: `wire_${tr.id}`,
          kind: 'promotion',
          playerName: tr.playerName,
          position: tr.position,
          age: tr.age,
          overall: tr.overall,
          clubName: postTransferPlayerClub.name,
          detail: tr.note || `Promoted to ${postTransferPlayerClub.shortName} senior squad`,
        });
      });
    }
    if (youthActivity.pressHeadlines.length > 0) {
      managerPressHeadlines.push(...youthActivity.pressHeadlines);
    }
  }

  // Check for Manager-Controlled Contract Renewals for MY club only (Director Mode)
  const postYouthPlayerClub = myClubId ? clubsMap.get(myClubId) : undefined;
  const postYouthPlayerManager =
    postYouthPlayerClub && postYouthPlayerClub.managerId
      ? managersMap.get(postYouthPlayerClub.managerId)
      : undefined;

  if (!isManagerMode && myClubId && postYouthPlayerClub) {
    const renewalActivity = runManagerContractRenewals({
      myClubId,
      club: postYouthPlayerClub,
      manager: postYouthPlayerManager,
      currentWeek,
      seasonYear,
      delegation,
      transferHistory: [...newTransfers, ...transferHistory],
    });
    clubsMap.set(myClubId, renewalActivity.updatedClub);
    if (renewalActivity.newTransfers.length > 0) {
      newTransfers.unshift(...renewalActivity.newTransfers);
    }
    if (renewalActivity.pressHeadlines.length > 0) {
      managerPressHeadlines.push(...renewalActivity.pressHeadlines);
    }
  }

  // Run AI club academy promotions across all other 67 clubs
  const aiPromoResult = runAIAcademyPromotionsForWeek({
    currentWeek,
    seasonYear,
    clubsMap,
    directorClubId: myClubId,
    transferHistory: [...newTransfers, ...transferHistory],
  });
  if (aiPromoResult.newTransfers.length > 0) {
    newTransfers.unshift(...aiPromoResult.newTransfers);
  }
  if (aiPromoResult.wireEvents.length > 0) {
    academyWire.push(...aiPromoResult.wireEvents);
  }

  // Add notable AI poach deals from this week to the academy wire
  newTransfers
    .filter(tr => tr.initiatedBy === 'ai' && tr.note?.startsWith('Poached from '))
    .slice(0, 1)
    .forEach(tr => {
      const buyerClub = tr.toClubId ? clubsMap.get(tr.toClubId) : undefined;
      const sellerClub = tr.fromClubId ? clubsMap.get(tr.fromClubId) : undefined;
      if (buyerClub && sellerClub) {
        academyWire.push({
          id: `wire_poach_${tr.id}`,
          kind: 'poach',
          playerName: tr.playerName,
          position: tr.position,
          age: tr.age,
          overall: tr.overall,
          clubName: buyerClub.name,
          fromClubName: sellerClub.name,
          detail: `Signed from ${sellerClub.shortName} Academy for £${(tr.fee / 1000000).toFixed(2)}M compensation`,
        });
      }
    });

  // Process weekly veteran retirement announcements (Weeks 24-45)
  const retirementNoticeResult = processWeeklyRetirementNotices(
    currentWeek,
    clubsMap,
    myClubId
  );
  if (retirementNoticeResult.wireEvents.length > 0) {
    academyWire.push(...retirementNoticeResult.wireEvents);
  }
  if (retirementNoticeResult.pressHeadlines.length > 0) {
    managerPressHeadlines.push(...retirementNoticeResult.pressHeadlines);
  }

  // Re-read my club from the updated working map before doing anything else
  const latestPlayerClub = myClubId ? clubsMap.get(myClubId) : undefined;
  const latestPlayerOwner = latestPlayerClub ? ownersMap.get(latestPlayerClub.ownerId) : undefined;
  const latestPlayerManager =
    latestPlayerClub && isManagerMode && userManagerAdapter
      ? userManagerAdapter
      : (latestPlayerClub && latestPlayerClub.managerId ? managersMap.get(latestPlayerClub.managerId) : undefined);

  // Keep user's club lineup clean after match injuries, weekly recoveries, and autonomous transfers
  if (latestPlayerClub?.lineup) {
    latestPlayerClub.lineup = syncLineupAfterSquadChange(latestPlayerClub, latestPlayerManager);
  }

  // Check for organic incoming bids for user's club players during transfer windows (Director Mode)
  if (!isManagerMode && isWindowOpen && latestPlayerClub && latestPlayerClub.squad.length > 18 && Math.random() < 0.30) {
    const attractivePlayers = latestPlayerClub.squad.filter(
      p =>
        !p.isInjured &&
        !p.retiringAtSeasonEnd &&
        (p.form >= 7.0 || p.overall >= 73 || p.growthMomentum === 'breakout')
    );
    if (attractivePlayers.length > 0) {
      const targetPlayer = attractivePlayers[Math.floor(Math.random() * attractivePlayers.length)];
      const autoBids = offerPlayerToClubs(
        targetPlayer.id,
        targetPlayer.value,
        Array.from(clubsMap.values()),
        latestPlayerClub.id,
        currentWeek,
        seasonYear
      );
      if (autoBids.length > 0) {
        newIncomingBids.push(autoBids[0]);
      }
    }
  }

  // Apply weekly delegation trust & squad morale effects (Director Mode)
  let delegationNote: string | undefined;
  let delegationTrustDelta: number | undefined;
  if (!isManagerMode && latestPlayerClub && latestPlayerManager) {
    const delegationOutcome = evaluateWeeklyDelegationEffects(
      latestPlayerClub,
      latestPlayerManager,
      delegation
    );
    if (delegationOutcome.trustDelta !== 0) {
      latestPlayerManager.trustInDirector = Math.max(
        0,
        Math.min(100, latestPlayerManager.trustInDirector + delegationOutcome.trustDelta)
      );
      delegationTrustDelta = delegationOutcome.trustDelta;
    }
    if (delegationOutcome.moraleDelta !== 0) {
      latestPlayerClub.squad.forEach(p => {
        p.happiness = Math.max(15, Math.min(100, p.happiness + delegationOutcome.moraleDelta));
        p.morale = deriveMorale(p.happiness);
      });
    }
    delegationNote = delegationOutcome.consequenceNote;
  }

  // Apply weekly owner intervention driven by involvement, wealth & philosophy
  let ownerInterventionNote: string | undefined;
  let activeOwner = latestPlayerOwner;
  let activeClub = latestPlayerClub;
  if (latestPlayerClub && latestPlayerOwner) {
    const ownerStep = evaluateWeeklyOwnerIntervention(
      currentWeek,
      latestPlayerClub,
      latestPlayerOwner,
      finalDirector
    );
    activeClub = ownerStep.updatedClub;
    activeOwner = ownerStep.updatedOwner;
    finalDirector = ownerStep.updatedDirector;
    clubsMap.set(activeClub.id, activeClub);
    ownersMap.set(activeOwner.id, activeOwner);
    ownerInterventionNote = ownerStep.interventionNote;
  }

  // Create digest
  const recentCombinedTransfers = [...newTransfers, ...transferHistory].slice(0, 20);
  const pressHeadlines = activeClub && activeOwner
    ? generatePressHeadlines(finalDirector, activeClub, activeOwner, latestPlayerManager, playerMatch, {
        recentTransfers: recentCombinedTransfers,
        ownerInterventionNote,
      })
    : [];

  // Prepend manager transfer/board-veto headlines & AI manager appointments
  if (managerPressHeadlines.length > 0) {
    pressHeadlines.unshift(...managerPressHeadlines);
  }
  if (aiManagerAppointmentHeadlines.length > 0) {
    pressHeadlines.unshift(...aiManagerAppointmentHeadlines.slice(0, 2));
  }

  const boardroomMemo = activeClub && activeOwner
    ? generateBoardroomMemo(
        finalDirector,
        activeClub,
        activeOwner,
        latestPlayerManager,
        playerMatch,
        ownerInterventionNote
      )
    : {
        author: 'League Executive Board',
        role: 'Official Digest',
        content: `Matchday ${currentWeek} completed across all divisions.`,
        tone: 'neutral' as const,
      };

  // Apply the advertised 3-win streak +5 Board Trust & Fan Approval boost when the praising memo fires
  if (boardroomMemo.tone === 'praising') {
    finalDirector = {
      ...finalDirector,
      boardTrust: Math.min(100, finalDirector.boardTrust + 5),
      fanApproval: Math.min(100, finalDirector.fanApproval + 5),
    };
    if (activeOwner) {
      ownersMap.set(activeOwner.id, {
        ...activeOwner,
        approval: Math.min(100, activeOwner.approval + 5),
      });
    }
  }

  // Build dressing room snippet from live club state
  const dressingRoomSnippet = (() => {
    if (!activeClub) return 'Free-agent watch ongoing ahead of your next board appointment.';
    const parts: string[] = [];
    const avgHappiness = activeClub.squad.length > 0
      ? Math.round(activeClub.squad.reduce((s, p) => s + p.happiness, 0) / activeClub.squad.length)
      : 70;
    const winStreak = countLeadingFormStreak(activeClub.form, 'W');
    const lossStreak = countLeadingFormStreak(activeClub.form, 'L');
    const unhappyPlayer = [...activeClub.squad].filter(p => p.happiness < 45).sort((a, b) => a.happiness - b.happiness)[0];
    const injuredLeader = [...activeClub.squad].filter(p => p.isInjured).sort((a, b) => b.overall - a.overall)[0];
    const expiringLeader = [...activeClub.squad]
      .filter(p => !p.retiringAtSeasonEnd && p.contractYears <= 1)
      .sort((a, b) => b.overall - a.overall)[0];
    const latestSigning = newTransfers.find(tr => tr.type === 'signing' && tr.toClubId === activeClub.id);

    if (winStreak >= 3) {
      parts.push(`Confidence is soaring on a ${winStreak}-match winning run (avg morale ${avgHappiness}%).`);
    } else if (lossStreak >= 2) {
      parts.push(`Frustration is palpable in the camp after ${lossStreak} straight defeats (avg morale ${avgHappiness}%).`);
    } else {
      parts.push(
        avgHappiness >= 74
          ? `Mood in training is buoyant (${avgHappiness}% avg morale).`
          : avgHappiness >= 56
            ? `Squad spirit sits steady at ${avgHappiness}% avg morale.`
            : `Dressing-room harmony is fragile at ${avgHappiness}% avg morale.`
      );
    }

    if (unhappyPlayer) {
      parts.push(`${unhappyPlayer.name} (${unhappyPlayer.happiness}% happiness) is unsettled over playing time.`);
    } else if (injuredLeader) {
      parts.push(`Physios are working closely with ${injuredLeader.name} (${injuredLeader.injuryWeeks || 1}w left).`);
    } else if (latestSigning) {
      parts.push(`New signing ${latestSigning.playerName} joined the group smoothly.`);
    } else if (expiringLeader) {
      parts.push(`${expiringLeader.name} is seeking clarity on his final contract year.`);
    }

    if (latestPlayerManager) {
      parts.push(
        latestPlayerManager.trustInDirector >= 65
          ? `${latestPlayerManager.name} feels firmly backed by the board.`
          : latestPlayerManager.trustInDirector < 40
            ? `${latestPlayerManager.name} warns that boardroom friction is filtering onto the pitch.`
            : `${latestPlayerManager.name} is focused on preparing the ${latestPlayerManager.preferredFormation} XI.`
      );
    } else {
      parts.push('First-team coaches are holding sessions while the manager seat is vacant.');
    }

    return parts.slice(0, 3).join(' ');
  })();

  const digest: WeeklyDigest = {
    week: currentWeek,
    seasonYear,
    playerMatch,
    allResults,
    pressHeadlines,
    boardroomMemo,
    dressingRoomSnippet,
    playerGrowthCount: totalGrowth,
    playerDeclineCount: totalDecline,
    managerSigning,
    ...(playerMatch && matchFormation ? { matchFormation } : {}),
    ...(playerMatch && matchTeamRating !== undefined ? { matchTeamRating } : {}),
    ...(playerMatch && lineupNotices.length > 0 ? { lineupNotices } : {}),
    ...(academyWire.length > 0 ? { academyWire: academyWire.slice(0, 5) } : {}),
    ...(delegationNote ? { delegationNote } : {}),
    ...(delegationTrustDelta !== undefined ? { delegationTrustDelta } : {}),
    ...(ownerInterventionNote ? { ownerInterventionNote } : {}),
  };

  const standingsSnapshot: Record<string, GameweekStandingsEntry> = {};
  clubsMap.forEach(c => {
    standingsSnapshot[c.id] = {
      clubId: c.id,
      name: c.name,
      shortName: c.shortName,
      primaryColor: c.primaryColor,
      tier: c.tier,
      played: c.played,
      won: c.won,
      drawn: c.drawn,
      lost: c.lost,
      goalsFor: c.goalsFor,
      goalsAgainst: c.goalsAgainst,
      goalDifference: c.goalDifference,
      points: c.points,
      form: [...c.form],
    };
  });

  const gameweekRecord: GameweekRecord = {
    week: currentWeek,
    seasonYear,
    results: [...allResults],
    standingsSnapshot,
  };

  return {
    updatedClubs: Array.from(clubsMap.values()),
    updatedOwners: Array.from(ownersMap.values()),
    updatedManagers: Array.from(managersMap.values()),
    updatedDirector: finalDirector,
    updatedFreeAgents,
    digest,
    gameweekRecord,
    newTransfers,
    updatedTransferProposals,
    newIncomingBids,
  };
}

// Check for Dynamic Takeover Rumors & Completed Sales (copies owners first to prevent state mutation)
export function evaluateTakeoverEvents(
  week: number,
  clubs: Club[],
  owners: Owner[],
  director: Director
): { updatedOwners: Owner[]; newsAlert?: string } {
  const updatedOwners = owners.map(o => ({ ...o }));
  let newsAlert: string | undefined;

  if (week % 8 === 0) {
    const vulnerableIndex = updatedOwners.findIndex(
      o => o.takeoverRisk >= 30 && Math.random() < 0.4
    );

    if (vulnerableIndex !== -1) {
      const vulnerableOwner = updatedOwners[vulnerableIndex];
      const eligibleCandidates = TAKEOVER_CANDIDATES.filter(
        c => c.rumorWeek <= week && !owners.some(o => o.takeoverSourceId === c.id)
      );

      if (eligibleCandidates.length > 0) {
        const candidate = eligibleCandidates[Math.floor(Math.random() * eligibleCandidates.length)];
        const club = clubs.find(c => c.ownerId === vulnerableOwner.id);

        if (club) {
          updatedOwners[vulnerableIndex] = {
            id: vulnerableOwner.id,
            name: candidate.name,
            nationality: candidate.nationality,
            wealth: candidate.wealth,
            patience: candidate.patience,
            involvement: candidate.involvement,
            recruitmentPhilosophy: candidate.recruitmentPhilosophy,
            demandedTargets: candidate.demandedTargets ? [...candidate.demandedTargets] : undefined,
            description: candidate.description,
            approval: 75,
            takeoverRisk: 5,
            takeoverSourceId: candidate.id,
          };

          if (club.id === director.currentClubId) {
            newsAlert = `BREAKING: ${candidate.name} has completed a full takeover of ${club.name}! The new ownership brings a ${candidate.wealth} investment fund (${candidate.investorType}) and a strict ${candidate.recruitmentPhilosophy.replace('_', ' ')} vision.`;
          }
        }
      }
    }
  }

  return { updatedOwners, newsAlert };
}

// Generate Job Vacancies across pyramid with prestige-scaled reputation gates
export function generateJobVacancies(
  clubs: Club[],
  owners: Owner[],
  currentDirectorClubId: string | null,
  directorReputation?: number
): JobVacancy[] {
  const vacancies: JobVacancy[] = [];
  const ownersMap = new Map(owners.map(o => [o.id, o]));

  clubs.forEach(c => {
    if (c.id === currentDirectorClubId) return;
    const owner = ownersMap.get(c.ownerId);
    if (!owner) return;

    // Clubs struggling in bottom 4 or with low owner approval have vacancies
    const isUnderperforming = c.played > 6 && (c.points / c.played) < 1.0;
    const isOwnerFrustrated = owner.approval < 55;

    if (isUnderperforming || isOwnerFrustrated || c.id === 'reading' || c.id === 'sheffwed') {
      const repReq =
        c.tier === 1
          ? Math.max(66, Math.min(90, Math.round(52 + c.prestige * 0.42)))
          : c.tier === 2
            ? Math.max(46, Math.min(72, Math.round(32 + c.prestige * 0.46)))
            : Math.max(28, Math.min(54, Math.round(16 + c.prestige * 0.48)));

      const lockReason =
        directorReputation !== undefined && directorReputation < repReq
          ? `Needs reputation ${repReq}, you have ${directorReputation}`
          : undefined;

      vacancies.push({
        clubId: c.id,
        clubName: c.name,
        tier: c.tier,
        wageBudget: c.wageBudget,
        transferBudget: c.transferBudget,
        expectation: c.fanExpectation,
        ownerName: owner.name,
        ownerPatience: owner.patience,
        reputationRequired: repReq,
        ...(lockReason ? { lockReason } : {}),
      });
    }
  });

  return vacancies.sort((a, b) => a.tier - b.tier || a.reputationRequired - b.reputationRequired);
}

// Calculate the End of Season Review, Champions, Promotion, Relegation, and Board Appraisal
export function calculateSeasonSummary(
  seasonYear: number,
  clubs: Club[],
  director: Director,
  owner?: Owner,
  freeAgents: Player[] = [],
  transferHistory: TransferRecord[] = []
): SeasonSummary {
  const sortByTable = (tierClubs: Club[]) => {
    return [...tierClubs].sort((a, b) => b.points - a.points || b.goalDifference - a.goalDifference || b.goalsFor - a.goalsFor);
  };

  const t1 = sortByTable(clubs.filter(c => c.tier === 1));
  const t2 = sortByTable(clubs.filter(c => c.tier === 2));
  const t3 = sortByTable(clubs.filter(c => c.tier === 3));

  const tier1Award: SeasonAward = {
    tier: 1,
    tierName: 'Premier League',
    champion: t1[0],
    runnerUp: t1[1],
    promotedClubs: [],
    relegatedClubs: t1.slice(17, 20), // 18th, 19th, 20th
  };

  const tier2Award: SeasonAward = {
    tier: 2,
    tierName: 'Championship',
    champion: t2[0],
    runnerUp: t2[1],
    promotedClubs: t2.slice(0, 3), // 1st, 2nd, and 3rd
    relegatedClubs: t2.slice(21, 24), // 22nd, 23rd, 24th
  };

  const tier3Award: SeasonAward = {
    tier: 3,
    tierName: 'League One',
    champion: t3[0],
    runnerUp: t3[1],
    promotedClubs: t3.slice(0, 3), // 1st, 2nd, and 3rd
    relegatedClubs: t3.slice(21, 24), // 22nd, 23rd, 24th
  };

  // Find player's club
  const playerClub = director.currentClubId ? clubs.find(c => c.id === director.currentClubId) : undefined;
  const playerTier = playerClub?.tier || 1;
  const playerTierTable = playerTier === 1 ? t1 : playerTier === 2 ? t2 : t3;
  const playerPos = playerClub ? playerTierTable.findIndex(c => c.id === playerClub.id) + 1 : 10;

  // Check silverware
  let wonTrophy: string | undefined;
  if (playerClub) {
    if (playerTier === 1 && playerPos === 1) wonTrophy = `Premier League Champions ${seasonYear}/${seasonYear + 1}`;
    if (playerTier === 2 && playerPos === 1) wonTrophy = `Championship Winners ${seasonYear}/${seasonYear + 1}`;
    if (playerTier === 3 && playerPos === 1) wonTrophy = `League One Winners ${seasonYear}/${seasonYear + 1}`;
  }

  // Check promotion & relegation
  const isPromoted = (playerTier === 2 || playerTier === 3) && playerPos <= 3;
  const isRelegated = (playerTier === 1 && playerPos >= 18) || (playerTier === 2 && playerPos >= 22) || (playerTier === 3 && playerPos >= 22);

  // Compute 5-Factor Director Grade Breakdown
  const exp = playerClub?.fanExpectation || 'Mid-Table Safety';
  let leagueScore = 60;
  if (wonTrophy || isPromoted) {
    leagueScore = 98;
  } else if (isRelegated) {
    leagueScore = 10;
  } else if (exp === 'Title Contender') {
    leagueScore = playerPos <= 2 ? 92 : playerPos <= 4 ? 82 : playerPos <= 6 ? 68 : 40;
  } else if (exp === 'European Qualification') {
    leagueScore = playerPos <= 5 ? 90 : playerPos <= 7 ? 80 : playerPos <= 10 ? 66 : 45;
  } else if (exp === 'Automatic Promotion') {
    leagueScore = playerPos <= 3 ? 95 : playerPos <= 6 ? 76 : playerPos <= 10 ? 58 : 38;
  } else if (exp === 'Play-off Push') {
    leagueScore = playerPos <= 6 ? 88 : playerPos <= 10 ? 72 : playerPos <= 14 ? 56 : 40;
  } else if (exp === 'Mid-Table Safety') {
    leagueScore = playerPos <= 10 ? 86 : playerPos <= (playerTier === 1 ? 15 : 18) ? 72 : 52;
  } else if (exp === 'Avoid Relegation') {
    leagueScore = playerPos <= 12 ? 88 : playerPos <= (playerTier === 1 ? 17 : 21) ? 74 : 15;
  }

  // Factor 2: 2-Season Transfer ROI (20%)
  const roiSummary = playerClub
    ? computeTransferROI(playerClub.id, seasonYear, clubs, freeAgents, transferHistory)
    : null;
  let roiScore = 65;
  let roiDetail = 'No paid signings logged across the 2-season window.';
  if (roiSummary && roiSummary.activeCount > 0) {
    const avg = roiSummary.avgOvrDelta;
    roiScore = Math.max(25, Math.min(98, Math.round(62 + avg * 9)));
    roiDetail = `${roiSummary.activeCount} signing${roiSummary.activeCount === 1 ? '' : 's'} tracked · Avg ${avg >= 0 ? '+' : ''}${avg.toFixed(1)} OVR`;
  }

  // Factor 3: Net Spend & Treasury Discipline (15%)
  const clubSeasonTransfers = playerClub
    ? transferHistory.filter(tr => tr.season === seasonYear)
    : [];
  const seasonSpend = playerClub
    ? clubSeasonTransfers
        .filter(tr => tr.toClubId === playerClub.id && (tr.type === 'signing' || tr.type === 'release'))
        .reduce((sum, tr) => sum + tr.fee, 0)
    : 0;
  const seasonSales = playerClub
    ? clubSeasonTransfers
        .filter(tr => tr.fromClubId === playerClub.id && tr.type === 'sale')
        .reduce((sum, tr) => sum + tr.fee, 0)
    : 0;
  const netSpendSeason = seasonSpend - seasonSales;
  const balanceHealthy = (playerClub?.balance ?? 0) >= 0;
  let financeScore = 70;
  if (!balanceHealthy) {
    financeScore = 30;
  } else if (netSpendSeason <= 0) {
    financeScore = 90;
  } else if (owner?.wealth === 'frugal') {
    financeScore = netSpendSeason <= 10_000_000 ? 74 : 48;
  } else if (owner?.wealth === 'moderate') {
    financeScore = netSpendSeason <= 30_000_000 ? 76 : 56;
  } else {
    financeScore = netSpendSeason <= 75_000_000 ? 80 : 62;
  }
  const financeDetail = `Net ${netSpendSeason >= 0 ? `£${(netSpendSeason / 1_000_000).toFixed(1)}M spent` : `£${(Math.abs(netSpendSeason) / 1_000_000).toFixed(1)}M profit`} · Balance £${((playerClub?.balance || 0) / 1_000_000).toFixed(1)}M`;

  // Factor 4: Academy Pathways (15%)
  const academyPromotionsSeason = playerClub
    ? transferHistory.filter(
        tr => tr.season === seasonYear && tr.toClubId === playerClub.id && tr.type === 'promotion'
      ).length
    : 0;
  const academyStrongCount = (playerClub?.academy || []).filter(
    a => a.overall >= (playerTier === 1 ? 59 : playerTier === 2 ? 54 : 50)
  ).length;
  const academyScore = Math.max(
    40,
    Math.min(96, 52 + academyPromotionsSeason * 15 + Math.min(3, academyStrongCount) * 5)
  );
  const academyDetail = `${academyPromotionsSeason} senior promotion${academyPromotionsSeason === 1 ? '' : 's'} · ${academyStrongCount} high-grade scholar${academyStrongCount === 1 ? '' : 's'}`;

  // Factor 5: Board & Owner Trust (15%)
  const ownerApproval = owner?.approval ?? 65;
  const trustScore = Math.max(10, Math.min(100, Math.round(director.boardTrust * 0.55 + ownerApproval * 0.45)));
  const trustDetail = `Board Trust ${director.boardTrust}% · Owner Approval ${ownerApproval}%`;

  const gradeBreakdown: DirectorGradeFactor[] = [
    {
      id: 'league',
      label: 'League vs Expectation',
      score: leagueScore,
      weight: 35,
      detail: `#${playerPos} finish against "${exp}" target`,
    },
    {
      id: 'roi',
      label: 'Transfer ROI (2-Season)',
      score: roiScore,
      weight: 20,
      detail: roiDetail,
    },
    {
      id: 'finances',
      label: 'Net Spend & Cash',
      score: financeScore,
      weight: 15,
      detail: financeDetail,
    },
    {
      id: 'academy',
      label: 'Academy Pathways',
      score: academyScore,
      weight: 15,
      detail: academyDetail,
    },
    {
      id: 'trust',
      label: 'Board & Owner Trust',
      score: trustScore,
      weight: 15,
      detail: trustDetail,
    },
  ];

  const weightedTotal = Math.round(
    gradeBreakdown.reduce((sum, f) => sum + (f.score * f.weight) / 100, 0)
  );

  let directorGrade: SeasonSummary['directorGrade'] =
    weightedTotal >= 88 ? 'A+' :
    weightedTotal >= 76 ? 'A' :
    weightedTotal >= 62 ? 'B' :
    weightedTotal >= 46 ? 'C' :
    weightedTotal >= 30 ? 'D' : 'F';

  if (wonTrophy) directorGrade = 'A+';
  else if (isPromoted && directorGrade !== 'A+') directorGrade = 'A';
  else if (isRelegated) directorGrade = 'F';

  // Financial disbursements
  const prizeMoney = playerTier === 1 
    ? Math.max(10000000, 45000000 - (playerPos - 1) * 1800000) 
    : playerTier === 2 
    ? Math.max(3000000, 16000000 - (playerPos - 1) * 600000) 
    : Math.max(800000, 5000000 - (playerPos - 1) * 180000);

  const tvRevenue = playerTier === 1 ? 88000000 : playerTier === 2 ? 18000000 : 4000000;

  // Owner evaluation commentary grounded in strongest & weakest factors
  const ownerName = owner?.name || 'The Board';
  const sortedFactors = [...gradeBreakdown].sort((a, b) => b.score - a.score);
  const strongestFactor = sortedFactors[0];
  const weakestFactor = sortedFactors[sortedFactors.length - 1];
  let ownerEvaluation = '';

  if (directorGrade === 'A+' || directorGrade === 'A') {
    ownerEvaluation = `Outstanding campaign! ${ownerName} applauds our #${playerPos} finish (${weightedTotal}/100 overall score), led by ${strongestFactor.label} (${strongestFactor.score}/100). Additional summer capital has been unlocked.`;
  } else if (directorGrade === 'B') {
    ownerEvaluation = `A solid campaign at #${playerPos} (${weightedTotal}/100 score). Strong work on ${strongestFactor.label} (${strongestFactor.score}/100), though the board wants improvement in ${weakestFactor.label} (${weakestFactor.score}/100) next season.`;
  } else if (directorGrade === 'C' || directorGrade === 'D') {
    ownerEvaluation = `An underwhelming campaign finishing #${playerPos} (${weightedTotal}/100 score). ${weakestFactor.label} (${weakestFactor.score}/100) dragged down our assessment and requires urgent off-season correction.`;
  } else {
    ownerEvaluation = `CATASTROPHIC FAILURE. Relegation is a devastating financial and sporting disaster for ${playerClub?.name}. The board is convening an emergency review of all football operations.`;
  }

  const retirements = determineSeasonRetirements(clubs, freeAgents, director.currentClubId);

  const clubsById = new Map(clubs.map(c => [c.id, c]));
  const seasonPromotions = transferHistory.filter(
    tr => tr.season === seasonYear && tr.type === 'promotion' && tr.toClubId
  );
  const topLeagueGraduates: SeasonGraduateHighlight[] = seasonPromotions
    .map(tr => {
      const club = tr.toClubId ? clubsById.get(tr.toClubId) : undefined;
      if (!club) return null;
      return {
        playerId: tr.playerId,
        playerName: tr.playerName,
        clubId: club.id,
        clubName: club.name,
        clubTier: club.tier,
        position: tr.position,
        age: tr.age,
        overall: tr.overall,
      };
    })
    .filter((item): item is SeasonGraduateHighlight => item !== null)
    .sort((a, b) => b.overall - a.overall || a.age - b.age)
    .slice(0, 12);

  return {
    seasonYear,
    tier1: tier1Award,
    tier2: tier2Award,
    tier3: tier3Award,
    playerClubFinalPosition: playerPos,
    playerClubTier: playerTier,
    playerClubWonTrophy: wonTrophy,
    isPromoted,
    isRelegated,
    directorGrade,
    ownerEvaluation,
    prizeMoney,
    tvRevenue,
    graduatingProspects: playerClub?.academy || [],
    retirements,
    totalLeaguePromotions: seasonPromotions.length,
    topLeagueGraduates,
    gradeBreakdown,
    transferRoiDelta: roiSummary ? Number(roiSummary.avgOvrDelta.toFixed(1)) : 0,
    netSpendSeason,
    academyPromotionsSeason,
  };
}

const EMERGENCY_FIRST_NAMES = [
  'Liam', 'Oliver', 'Harry', 'Jack', 'George', 'Noah', 'Charlie', 'Jacob', 'Alfie', 'Freddie',
  'Oscar', 'Leo', 'Logan', 'Archie', 'Theo', 'Callum', 'Declan', 'Ethan', 'Hugo', 'Lucas',
  'Matteo', 'Julian', 'Rafael', 'Kieran', 'Sander', 'Tomas', 'Nathan', 'Gabriel', 'Henrik', 'Milo'
];
const EMERGENCY_LAST_NAMES = [
  'Smith', 'Jones', 'Taylor', 'Brown', 'Williams', 'Wilson', 'Johnson', 'Davies', 'Robinson', 'Wright',
  'Thompson', 'Evans', 'Walker', 'White', 'Roberts', 'Bennett', 'Harrison', 'Fraser', 'Moreau', 'Costa',
  'Lindqvist', 'Navarro', 'Keller', 'Okafor', 'Murphy', 'Byrne', 'McAllister', 'Richter', 'Ferreira', 'Bauer'
];
const ROLES_BY_POS: Record<PlayerPosition, string[]> = {
  GK: ['Sweeper Keeper', 'Shot Stopper', 'Commanding Goalkeeper'],
  DEF: ['Ball-Playing Defender', 'Stopper CB', 'No-Nonsense CB', 'Inverted Fullback', 'Wingback'],
  MID: ['Deep-Lying Playmaker', 'Box to Box', 'Ball-Winning Midfielder', 'Advanced Playmaker'],
  FWD: ['Target Man', 'Pressing Forward', 'Clinical Poacher', 'Inside Forward', 'Pacy Finisher'],
};

function pickUniqueName(usedNames?: Set<string>, firstPool = YOUTH_FIRST_NAMES, lastPool = YOUTH_LAST_NAMES): string {
  for (let attempts = 0; attempts < 250; attempts++) {
    const rf = firstPool[Math.floor(Math.random() * firstPool.length)];
    const rl = lastPool[Math.floor(Math.random() * lastPool.length)];
    const cand = `${rf} ${rl}`;
    if (!usedNames || !usedNames.has(cand)) {
      usedNames?.add(cand);
      return cand;
    }
  }
  const fallback = `${firstPool[Math.floor(Math.random() * firstPool.length)]} ${lastPool[Math.floor(Math.random() * lastPool.length)]}-${Math.floor(Math.random() * 90) + 10}`;
  usedNames?.add(fallback);
  return fallback;
}

function pickProspectNationality(tier: LeagueTier): string {
  const roll = Math.random();
  if (tier === 1) {
    if (roll < 0.48) return 'England';
    if (roll < 0.56) return 'Scotland';
    if (roll < 0.62) return 'Wales';
    if (roll < 0.66) return 'Ireland';
    const intl = ['France', 'Spain', 'Brazil', 'Portugal', 'Netherlands', 'Germany', 'Argentina', 'Norway', 'Belgium', 'Nigeria', 'Japan', 'Denmark'];
    return intl[Math.floor(Math.random() * intl.length)];
  }
  if (tier === 2) {
    if (roll < 0.60) return 'England';
    if (roll < 0.70) return 'Scotland';
    if (roll < 0.78) return 'Wales';
    if (roll < 0.85) return 'Ireland';
    if (roll < 0.89) return 'Northern Ireland';
    const intl = ['France', 'Netherlands', 'Sweden', 'Norway', 'Portugal', 'Nigeria', 'Ghana'];
    return intl[Math.floor(Math.random() * intl.length)];
  }
  if (roll < 0.68) return 'England';
  if (roll < 0.78) return 'Scotland';
  if (roll < 0.86) return 'Wales';
  if (roll < 0.93) return 'Ireland';
  return 'Northern Ireland';
}

function generateEmergencyFillerPlayer(
  club: Club,
  pos: PlayerPosition,
  usedNames: Set<string>
): Player {
  const name = pickUniqueName(usedNames, YOUTH_FIRST_NAMES, YOUTH_LAST_NAMES);
  const baseOvr = club.tier === 1 ? 70 : club.tier === 2 ? 64 : 58;
  const age = 18 + Math.floor(Math.random() * 3); // 18-20 recent graduate
  const ovr = Math.max(50, Math.min(80, baseOvr - 2 + Math.floor(Math.random() * 5)));
  const roleList = ROLES_BY_POS[pos];
  const role = roleList[Math.floor(Math.random() * roleList.length)];
  const valMultiplier = club.tier === 1 ? 800000 : club.tier === 2 ? 200000 : 50000;
  const val = Math.max(75000, Math.round(ovr * ovr * valMultiplier * 0.003));
  const wageMultiplier = club.tier === 1 ? 700 : club.tier === 2 ? 240 : 80;
  const wage = Math.round(ovr * wageMultiplier);

  return {
    id: `p_${club.id}_grad_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    name,
    nationality: pickProspectNationality(club.tier),
    age,
    position: pos,
    roleDetail: role,
    overall: ovr,
    growthMomentum: 'rapid',
    value: val,
    wage,
    contractYears: 3,
    form: 6.8,
    happiness: 80,
    morale: 'happy',
    goals: 0,
    assists: 0,
    appearances: 0,
    cleanSheets: 0,
    clubId: club.id,
    isInjured: false,
    injuryWeeks: 0,
  };
}

// Helper to replenish AI club squads up to minimum roster requirements
// Prioritizes promoting from the club's own Youth Academy first, then free agents, then graduate fallback
export function replenishAISquad(
  club: Club,
  freeAgentsPool: Player[],
  usedNames: Set<string>
): void {
  let gkCount = club.squad.filter(p => p.position === 'GK').length;
  let defCount = club.squad.filter(p => p.position === 'DEF').length;
  let midCount = club.squad.filter(p => p.position === 'MID').length;
  let fwdCount = club.squad.filter(p => p.position === 'FWD').length;

  const neededPositions: PlayerPosition[] = [];
  while (gkCount < 2) { neededPositions.push('GK'); gkCount++; }
  while (defCount < 6) { neededPositions.push('DEF'); defCount++; }
  while (midCount < 6) { neededPositions.push('MID'); midCount++; }
  while (fwdCount < 4) { neededPositions.push('FWD'); fwdCount++; }

  // Ensure at least 20 players total, capped at 25
  let totalProjected = club.squad.length + neededPositions.length;
  const outfieldRot: PlayerPosition[] = ['DEF', 'MID', 'FWD'];
  let rotIdx = 0;
  while (totalProjected < 20 && totalProjected < 25) {
    neededPositions.push(outfieldRot[rotIdx % 3]);
    rotIdx++;
    totalProjected++;
  }

  for (const pos of neededPositions) {
    if (club.squad.length >= 25) break;

    const currentWages = club.squad.reduce((sum, p) => sum + p.wage, 0);
    const wageHeadroom = Math.max(0, club.wageBudget - currentWages);
    const freeAgentCap = club.squad.length < 18 && wageHeadroom === 0 ? 2500 : wageHeadroom;

    // 1. Prioritize promoting an aged 17-18 prospect from the club's own Youth Academy
    const academyMatches = (club.academy || [])
      .filter(a => a.age >= 17 && a.position === pos)
      .sort((a, b) => b.overall - a.overall);
    if (academyMatches.length > 0) {
      const chosen = academyMatches[0];
      const promoWage = Math.min(getAcademyPromotionWage(club.tier), Math.max(1000, wageHeadroom));
      const promoted = buildPromotedPlayerFromProspect(chosen, club, promoWage, 3);
      club.squad.push(promoted);
      club.academy = (club.academy || []).filter(a => a.id !== chosen.id);
      continue;
    }

    // 2. Next try finding best free agent for this position within wage budget
    const eligible = freeAgentsPool
      .map((fa, idx) => ({ fa, idx }))
      .filter(item => item.fa.position === pos && item.fa.wage <= freeAgentCap)
      .sort((a, b) => b.fa.overall - a.fa.overall);

    if (eligible.length > 0) {
      const best = eligible[0];
      const signedPlayer = freeAgentsPool.splice(best.idx, 1)[0];
      signedPlayer.clubId = club.id;
      signedPlayer.contractYears = Math.floor(Math.random() * 3) + 2;
      signedPlayer.happiness = 75;
      signedPlayer.morale = 'content';
      signedPlayer.appearances = 0;
      signedPlayer.goals = 0;
      signedPlayer.assists = 0;
      signedPlayer.cleanSheets = 0;
      signedPlayer.isInjured = false;
      signedPlayer.injuryWeeks = 0;
      signedPlayer.retiringAtSeasonEnd = false;
      club.squad.push(signedPlayer);
    } else {
      // 3. Last resort: graduate an unlisted youth squad member capped to wage headroom
      const filler = generateEmergencyFillerPlayer(club, pos, usedNames);
      filler.wage = Math.min(filler.wage, Math.max(800, wageHeadroom));
      club.squad.push(filler);
    }
  }
}

// Weighted player retirement probability curve (ages 33-42; goalkeepers play longer)
export function getRetirementProbability(player: Player): number {
  if (player.age < 33) return 0;
  if (player.age >= 42 || player.retiringAtSeasonEnd) return 1;

  const index = Math.min(8, Math.max(0, player.age - 33));
  const outfieldCurve = [0.045, 0.09, 0.16, 0.25, 0.37, 0.51, 0.67, 0.81, 0.93];
  const gkCurve = [0.008, 0.016, 0.032, 0.065, 0.12, 0.21, 0.35, 0.55, 0.78];

  let prob = player.position === 'GK' ? gkCurve[index] : outfieldCurve[index];

  const modAgeThreshold = player.position === 'GK' ? 36 : 34;
  if (player.clubId === null && player.age >= modAgeThreshold) {
    prob += 0.12;
  }
  if (player.overall < 63 && player.age >= modAgeThreshold) {
    prob += 0.08;
  } else if (player.overall >= 82 && player.age <= 38) {
    prob *= 0.65;
  }

  return Math.max(0, Math.min(1, prob));
}

export function shouldPlayerRetire(player: Player): boolean {
  if (player.age < 33) return false;
  if (player.age >= 42 || player.retiringAtSeasonEnd) return true;
  return Math.random() < getRetirementProbability(player);
}

export function determineSeasonRetirements(
  clubs: Club[],
  freeAgents: Player[] = [],
  userClubId: string | null = null
): RetirementRecord[] {
  const retirements: RetirementRecord[] = [];

  clubs.forEach(club => {
    club.squad.forEach(p => {
      if (shouldPlayerRetire(p)) {
        retirements.push({
          playerId: p.id,
          name: p.name,
          nationality: p.nationality,
          age: p.age,
          position: p.position,
          overall: p.overall,
          clubId: club.id,
          clubName: club.name,
          clubShortName: club.shortName,
          clubTier: club.tier,
          appearances: p.appearances,
          goals: p.goals,
          assists: p.assists,
          cleanSheets: p.cleanSheets,
          isUserClub: Boolean(userClubId && club.id === userClubId),
        });
      }
    });
  });

  freeAgents.forEach(fa => {
    if (shouldPlayerRetire(fa)) {
      retirements.push({
        playerId: fa.id,
        name: fa.name,
        nationality: fa.nationality,
        age: fa.age,
        position: fa.position,
        overall: fa.overall,
        clubId: null,
        clubName: 'Free Agent',
        appearances: fa.appearances,
        goals: fa.goals,
        assists: fa.assists,
        cleanSheets: fa.cleanSheets,
        isUserClub: false,
      });
    }
  });

  return retirements.sort((a, b) => {
    if (a.isUserClub !== b.isUserClub) return a.isUserClub ? -1 : 1;
    if (b.overall !== a.overall) return b.overall - a.overall;
    return b.age - a.age;
  });
}

// Transition to next season (Infinite Multi-Season Loop)
export function advanceToNextSeason(
  summary: SeasonSummary,
  clubs: Club[],
  owners: Owner[],
  managers: Manager[],
  freeAgents: Player[],
  director: Director,
  delegation?: DelegationMatrix,
  transferHistory: TransferRecord[] = [],
  modeOptions?: SimulationModeOptions
): {
  newClubs: Club[];
  newOwners: Owner[];
  newManagers: Manager[];
  newFreeAgents: Player[];
  newDirector: Director;
  newSeasonYear: number;
  newTransfers: TransferRecord[];
} {
  const isManagerMode = modeOptions?.gameMode === 'manager';
  const seasonTransitionTransfers: TransferRecord[] = [];
  const updatedClubs = clubs.map(c => ({
    ...c,
    squad: c.squad.map(p => ({ ...p })),
    form: [...c.form],
    academy: c.academy ? c.academy.map(a => ({ ...a })) : undefined,
    lineup: c.lineup
      ? {
          ...c.lineup,
          slots: [...c.lineup.slots],
          bench: [...c.lineup.bench],
        }
      : undefined,
  }));
  const updatedFreeAgents = freeAgents.map(p => ({ ...p }));

  // Build deterministic retirement lookup from SeasonSummary (falling back to live weighted roll if absent)
  const hasSummaryRetirements = Array.isArray(summary.retirements);
  const retiringPlayerIds = new Set((summary.retirements || []).map(r => r.playerId));

  // Collect all currently used names to avoid duplicate generated names
  const usedNames = new Set<string>();
  updatedClubs.forEach(c => {
    c.squad.forEach(p => usedNames.add(p.name));
    (c.academy || []).forEach(a => usedNames.add(a.name));
  });
  updatedFreeAgents.forEach(fa => usedNames.add(fa.name));
  managers.forEach(m => usedNames.add(m.name));

  // Compute finishing table rank & merit prize money before resetting tables and applying tier moves
  const finishingPrizeByClubId = new Map<string, number>();
  ([1, 2, 3] as LeagueTier[]).forEach(tier => {
    const ranked = updatedClubs
      .filter(c => c.tier === tier)
      .sort((a, b) => b.points - a.points || b.goalDifference - a.goalDifference || b.goalsFor - a.goalsFor);
    ranked.forEach((c, idx) => {
      const pos = idx + 1;
      const prize =
        tier === 1
          ? Math.max(10000000, 45000000 - (pos - 1) * 1800000)
          : tier === 2
          ? Math.max(3000000, 16000000 - (pos - 1) * 600000)
          : Math.max(800000, 5000000 - (pos - 1) * 180000);
      finishingPrizeByClubId.set(c.id, prize);
    });
  });

  // 1. Process Promotions and Relegations across tiers
  summary.tier1.relegatedClubs.forEach(rel => {
    const club = updatedClubs.find(c => c.id === rel.id);
    if (club) club.tier = 2;
  });

  summary.tier2.promotedClubs.forEach(prom => {
    const club = updatedClubs.find(c => c.id === prom.id);
    if (club) club.tier = 1;
  });

  summary.tier2.relegatedClubs.forEach(rel => {
    const club = updatedClubs.find(c => c.id === rel.id);
    if (club) club.tier = 3;
  });

  summary.tier3.promotedClubs.forEach(prom => {
    const club = updatedClubs.find(c => c.id === prom.id);
    if (club) club.tier = 2;
  });

  // 2. Reset club tables, award TV money, process retirements, aging & youth intake
  updatedClubs.forEach(club => {
    const isUserClub = Boolean(director.currentClubId && club.id === director.currentClubId);

    club.played = 0;
    club.won = 0;
    club.drawn = 0;
    club.lost = 0;
    club.goalsFor = 0;
    club.goalsAgainst = 0;
    club.goalDifference = 0;
    club.points = 0;
    club.form = [];
    club.managerSacksThisSeason = 0;

    // Financial injection for new season (TV rights + earned merit prize money)
    const tvCash = club.tier === 1 ? 88000000 : club.tier === 2 ? 18000000 : 4000000;
    const meritPrize = isUserClub ? summary.prizeMoney : (finishingPrizeByClubId.get(club.id) ?? 0);
    const totalPayout = tvCash + meritPrize;
    club.balance += totalPayout;
    club.transferBudget += Math.round(totalPayout * 0.45);

    // 3. Retirements + annual aging & development
    const agedNonRetiringSquad: Player[] = [];
    club.squad.forEach(p => {
      const retires = hasSummaryRetirements
        ? retiringPlayerIds.has(p.id) || p.age >= 42
        : shouldPlayerRetire(p);
      if (retires) {
        return; // Player retires from football
      }

      const agedPlayer = applyNaturalAnnualGrowth({
        ...p,
        age: p.age + 1,
        retiringAtSeasonEnd: false,
        contractYears: Math.max(0, p.contractYears - 1),
        goals: 0,
        assists: 0,
        appearances: 0,
        cleanSheets: 0,
        isInjured: false,
        injuryWeeks: 0,
      });
      agedNonRetiringSquad.push(agedPlayer);
    });

    // If Coach-led renewals are active in Director Mode OR AI Sporting Director in Manager Mode, handle expiring contracts
    let postRenewalSquad = agedNonRetiringSquad;
    if (isUserClub && isManagerMode && modeOptions?.clubDirector) {
      const eosPass = runManagerModeSeasonEndRenewals(
        { ...club, squad: agedNonRetiringSquad },
        modeOptions.clubDirector,
        summary.seasonYear
      );
      postRenewalSquad = eosPass.updatedClub.squad;
      if (eosPass.renewalRecords.length > 0) {
        seasonTransitionTransfers.push(...eosPass.renewalRecords);
      }
    } else if (isUserClub && !isManagerMode && delegation?.contractRenewals === 'manager') {
      const clubManager = club.managerId ? managers.find(m => m.id === club.managerId) : undefined;
      const renewalPass = runManagerContractRenewals({
        myClubId: club.id,
        club: { ...club, squad: agedNonRetiringSquad },
        manager: clubManager,
        currentWeek: 46,
        seasonYear: summary.seasonYear,
        delegation,
        transferHistory,
        isSeasonEndPass: true,
      });
      postRenewalSquad = renewalPass.updatedClub.squad;
      if (renewalPass.newTransfers.length > 0) {
        seasonTransitionTransfers.push(...renewalPass.newTransfers);
      }
    }

    // Expired contracts handling
    const keptSquad: Player[] = [];
    postRenewalSquad.forEach(agedPlayer => {
      if (agedPlayer.contractYears === 0) {
        if (!isUserClub) {
          let reSignChance = 0.65;
          if (agedPlayer.overall >= 80) reSignChance += 0.20;
          else if (agedPlayer.overall >= 75) reSignChance += 0.10;
          if (agedPlayer.happiness < 60) reSignChance -= 0.25;
          if (agedPlayer.happiness < 45) reSignChance -= 0.20;
          if (agedPlayer.age >= 35) reSignChance -= 0.15;

          if (Math.random() < reSignChance) {
            agedPlayer.contractYears = Math.floor(Math.random() * 3) + 2;
            keptSquad.push(agedPlayer);
          } else {
            agedPlayer.clubId = null;
            updatedFreeAgents.push(agedPlayer);
          }
        } else {
          agedPlayer.clubId = null;
          updatedFreeAgents.push(agedPlayer);
        }
      } else {
        keptSquad.push(agedPlayer);
      }
    });

    club.squad = keptSquad;

    // Refill AI clubs to minimum squad shape (promoting from their own Youth Academy first)
    if (!isUserClub) {
      // Also allow AI clubs to proactively promote standout 17-18yo prospects into open spots
      const openSlots = Math.max(0, 24 - club.squad.length);
      if (openSlots > 0 && (club.academy?.length || 0) > 0) {
        const promoThreshold = club.tier === 1 ? 61 : club.tier === 2 ? 56 : 52;
        const standouts = (club.academy || [])
          .filter(a => a.age >= 17 && (a.overall >= promoThreshold || a.momentumTier === 'Generational Prodigy'))
          .sort((a, b) => b.overall - a.overall)
          .slice(0, Math.min(2, openSlots));
        standouts.forEach(prospect => {
          const promoWage = getAcademyPromotionWage(club.tier);
          const currentWages = club.squad.reduce((sum, pl) => sum + pl.wage, 0);
          if (club.squad.length < 25 && currentWages + promoWage <= club.wageBudget * 1.05) {
            club.squad.push(buildPromotedPlayerFromProspect(prospect, club, promoWage, 3));
            club.academy = (club.academy || []).filter(a => a.id !== prospect.id);
          }
        });
      }

      replenishAISquad(club, updatedFreeAgents, usedNames);
      club.lineup = undefined;
    } else if (club.lineup) {
      const clubManager =
        isManagerMode && modeOptions?.userManagerAdapter
          ? modeOptions.userManagerAdapter
          : (club.managerId ? managers.find(m => m.id === club.managerId) : undefined);
      club.lineup = syncLineupAfterSquadChange(club, clubManager);
    }

    // 4. Youth Academy annual aging & replenishment (same natural growth system as all players; 7 generated 1-2-2-2 + max 10 cap)
    const existingAcademy = (club.academy || []).map(a => normalizeAcademyPlayer(a, club));
    const retainedAcademy: AcademyPlayer[] = [];
    existingAcademy.forEach(p => {
      const nextAge = p.age + 1;
      if (nextAge <= YOUTH_ACADEMY_CONFIG.ageRange.max) {
        const baseAsPlayer = academyPlayerToPlayer({ ...p, age: nextAge }, club);
        const grown = applyNaturalAnnualGrowth(baseAsPlayer);
        retainedAcademy.push({
          ...p,
          age: nextAge,
          overall: grown.overall,
          value: grown.value,
          growthMomentum: grown.growthMomentum,
          form: grown.form,
          happiness: grown.happiness,
          morale: grown.morale,
        });
      } else if (p.overall >= 54 && updatedFreeAgents.length < 130) {
        // Release viable 19yo unpromoted academy graduates into free agency so talent circulates (no penalties)
        const baseWage = getAcademyPromotionWage(club.tier);
        updatedFreeAgents.push({
          ...academyPlayerToPlayer(p, club),
          id: `p_fa_acad_${p.id}`,
          age: nextAge,
          wage: Math.max(800, Math.round(baseWage * 0.75)),
          contractYears: 0,
          form: 6.5,
          happiness: 72,
          morale: 'content',
          clubId: null,
        });
      }
    });

    // Restore missing generated-style positions (1 GK, 2 DEF, 2 MID, 2 FWD) up to 7 generated, hard-capped at 10 total
    club.academy = replenishClubAcademy(
      { ...club, academy: retainedAcademy },
      summary.seasonYear + 1,
      usedNames
    );
  });

  // Clean the free agent pool each season: apply retirements (33-42), drop players under 54 OVR, and keep top 140
  const cleanedFreeAgents = updatedFreeAgents
    .filter(fa => {
      const retires = hasSummaryRetirements
        ? retiringPlayerIds.has(fa.id) || fa.age >= 42
        : shouldPlayerRetire(fa);
      if (retires) return false;
      if (fa.overall < 54) return false;
      if (fa.age >= 31 && fa.overall < 64) return false;
      return true;
    })
    .sort((a, b) => b.overall - a.overall || a.age - b.age)
    .slice(0, 140)
    .map(fa => ({
      ...fa,
      age: fa.age + 1,
      retiringAtSeasonEnd: false,
      goals: 0,
      assists: 0,
      appearances: 0,
      cleanSheets: 0,
    }));

  // 5. Age Managers (Fixed pool: managers never retire and no new managers are ever generated)
  const tierAwards = [summary.tier1, summary.tier2, summary.tier3];
  const championByClubId = new Map<string, { tierName: string; clubName: string; points: number }>();
  const promotedByClubId = new Map<string, { tierName: string; clubName: string }>();
  const relegatedByClubId = new Map<string, { tierName: string; clubName: string }>();

  tierAwards.forEach(award => {
    championByClubId.set(award.champion.id, {
      tierName: award.tierName,
      clubName: award.champion.name,
      points: award.champion.points,
    });
    award.promotedClubs.forEach(c => {
      promotedByClubId.set(c.id, { tierName: award.tierName, clubName: c.name });
    });
    award.relegatedClubs.forEach(c => {
      relegatedByClubId.set(c.id, { tierName: award.tierName, clubName: c.name });
    });
  });

  const updatedManagers = managers.map(m => {
    const baseAttrs = m.attributes ? { ...m.attributes } : deriveManagerAttributes(m);
    const stats = getManagerCareerStats(m);
    let repDelta = 0;
    let nextStats = { ...stats };
    let nextMgr: Manager = {
      ...m,
      age: m.age + 1,
      seasonsAtClub: m.clubId ? (m.seasonsAtClub ?? 0) + 1 : 0,
      attributes: baseAttrs,
      careerStats: nextStats,
    };

    if (m.clubId) {
      const champInfo = championByClubId.get(m.clubId);
      const promInfo = promotedByClubId.get(m.clubId);
      const relInfo = relegatedByClubId.get(m.clubId);

      if (champInfo) {
        repDelta = 2;
        nextStats = {
          ...nextStats,
          titlesWon: nextStats.titlesWon + 1,
          ...(promInfo ? { promotionsWon: nextStats.promotionsWon + 1 } : {}),
        };
        nextMgr = { ...nextMgr, careerStats: nextStats };
        nextMgr = appendManagerHistory(nextMgr, {
          season: summary.seasonYear,
          week: 46,
          type: 'league_title',
          title: `Won ${champInfo.tierName} Title`,
          detail: `Guided ${champInfo.clubName} to the ${summary.seasonYear}/${summary.seasonYear + 1} ${champInfo.tierName} championship (${champInfo.points} pts).`,
          clubId: m.clubId,
          clubName: champInfo.clubName,
        });
      } else if (promInfo) {
        repDelta = 1;
        nextStats = { ...nextStats, promotionsWon: nextStats.promotionsWon + 1 };
        nextMgr = { ...nextMgr, careerStats: nextStats };
        nextMgr = appendManagerHistory(nextMgr, {
          season: summary.seasonYear,
          week: 46,
          type: 'promotion',
          title: `Promoted with ${promInfo.clubName}`,
          detail: `Earned promotion from ${promInfo.tierName} in ${summary.seasonYear}/${summary.seasonYear + 1}.`,
          clubId: m.clubId,
          clubName: promInfo.clubName,
        });
      } else if (relInfo) {
        repDelta = -1;
        nextMgr = appendManagerHistory(nextMgr, {
          season: summary.seasonYear,
          week: 46,
          type: 'relegation',
          title: `Relegated with ${relInfo.clubName}`,
          detail: `Suffered relegation from ${relInfo.tierName} at the end of ${summary.seasonYear}/${summary.seasonYear + 1}.`,
          clubId: m.clubId,
          clubName: relInfo.clubName,
        });
      }
    }

    return repDelta !== 0 ? applyManagerReputationChange(nextMgr, repDelta) : nextMgr;
  });

  // 6. Update Director Record (grade + user retirement legacy; zero penalty for academy flops)
  const retirementLegacyRep = Math.min(
    3,
    (summary.retirements || []).filter(r => r.isUserClub && r.overall >= 74).length
  );
  const gradeRepDelta =
    summary.directorGrade === 'A+' ? 8 :
    summary.directorGrade === 'A' ? 5 :
    summary.directorGrade === 'B' ? 2 :
    summary.directorGrade === 'C' ? -2 :
    summary.directorGrade === 'D' ? -5 : -10;

  const newDirector: Director = {
    ...director,
    yearsInCharge: director.yearsInCharge + 1,
    reputation: Math.max(
      10,
      Math.min(100, director.reputation + gradeRepDelta + retirementLegacyRep)
    ),
    boardTrust: 80,
    fanApproval: summary.directorGrade === 'F' ? 40 : 75,
    trophiesWon: summary.playerClubWonTrophy 
      ? [...director.trophiesWon, summary.playerClubWonTrophy] 
      : director.trophiesWon,
  };

  return {
    newClubs: updatedClubs,
    newOwners: owners.map(o => ({ ...o, approval: 75 })),
    newManagers: updatedManagers,
    newFreeAgents: cleanedFreeAgents,
    newDirector,
    newSeasonYear: summary.seasonYear + 1,
    newTransfers: seasonTransitionTransfers,
  };
}

// ================= YOUTH ACADEMY ENGINE =================

const YOUTH_FIRST_NAMES = [
  'Leo', 'Harvey', 'Finley', 'Archie', 'Albie', 'Mason', 'Luca', 'Jude', 'Cole', 'Kobbie',
  'Rico', 'Lewis', 'Ethan', 'Bobby', 'Teddy', 'Isaac', 'Caleb', 'Liam', 'Zack', 'Mateo',
  'Kobe', 'Enzo', 'Kai', 'Felix', 'Jayden', 'Myles', 'Tyler', 'Dexter', 'Rowan', 'Brody',
  'Noah', 'Arthur', 'Oscar', 'Theo', 'Freddie', 'Ronnie', 'Elliott', 'Harrison', 'Ruben',
  'Callum', 'Declan', 'Sander', 'Matteo', 'Julian', 'Rafael', 'Kieran', 'Hugo', 'Lucas',
  'Seb', 'Toby', 'Max', 'Aiden', 'Dylan', 'Owen', 'Reece', 'Sam', 'Connor', 'Jamie',
  'Nolan', 'Ewan', 'Ciaran', 'Thiago', 'Soren', 'Bastian', 'Emil', 'Ibrahim', 'Malik', 'Tariq',
  'Kaito', 'Luka', 'Dario', 'Nico', 'Gavin', 'Callum', 'Bryn', 'Finn', 'Louie', 'Sonny'
];

const YOUTH_LAST_NAMES = [
  'Palmer', 'Mainoo', 'Lewis', 'Wharton', 'Bellingham', 'Gray', 'Miley', 'Colwill', 'Quansah', 'Gittens',
  'Hall', 'Anderson', 'Sterling', 'Chambers', 'Davenport', 'Gallagher', 'Carrington', 'Sinclair', 'Beckett', 'Vance',
  'Mercer', 'Keane', 'Brennan', 'Lockwood', 'Kavanagh', 'Huxley', 'Fairchild', 'Redmond', 'Thorne', 'Winter',
  'Ashford', 'Cross', 'Barrett', 'Harrington', 'Fletcher', 'Rowe', 'Preston', 'Somerset', 'Bennett', 'Fraser',
  'Moreau', 'Costa', 'Lindqvist', 'Navarro', 'Keller', 'Okafor', 'Murphy', 'Byrne', 'McAllister', 'Richter',
  'Ferreira', 'Bauer', 'Henderson', 'Pearson', 'Gillespie', 'Doyle', 'Nolan', 'Patel', 'Okonkwo', 'Diallo',
  'Delgado', 'Svensson', 'Bakker', 'Hansen', 'Kowalski', 'Novak', 'Almeida', 'Bianchi', 'Whitaker', 'Caldwell',
  'Galloway', 'Sutton', 'Langford', 'Beaumont', 'Walsh', 'Fitzgerald', 'Donnelly', 'Campbell', 'Stewart', 'Reid'
];

const PROSPECT_TRAITS: ProspectTrait[] = [
  'Generational Prodigy',
  'Driven Workhorse',
  'Raw Diamond',
  'Technical Magician',
  'Natural Leader',
  'Late Bloomer',
  'Relentless Engine',
];

const YOUTH_ROLES: Record<PlayerPosition, string[]> = {
  GK: ['Modern Sweeper Keeper', 'Reflex Shot-Stopper', 'Commanding Goalkeeper'],
  DEF: ['Ball-Playing Centre Back', 'High-Press Wingback', 'No-Nonsense Defender', 'Overlapping Fullback'],
  MID: ['Box-to-Box Dynamo', 'Deep Playmaker', 'Press-Resistant Engine', 'Creative Inverted Playmaker'],
  FWD: ['Clinical Poacher', 'High-Pressing Forward', 'Explosive Winger', 'Mobile Target Man'],
};

const SCOUT_NOTES: Record<ProspectTrait, string[]> = {
  'Generational Prodigy': [
    'Scouts across Europe are tracking this talent. Exceptional vision and composure beyond his years.',
    'Rare natural gift for reading the game. High ceiling, anticipated to reach international standard.',
  ],
  'Driven Workhorse': [
    'First to arrive and last to leave training. Relentless dedication and supreme stamina.',
    'Highly coachable and disciplined. Reliable tactical execution with high floor.',
  ],
  'Raw Diamond': [
    'Tremendous physical and technical flashes, but needs tactical polish and senior game-time maturity.',
    'Explosive unpredictability. Capable of world-class 99 rating if coached into consistent decision-making.',
  ],
  'Technical Magician': [
    'Effortless close control and quick-foot balance in tight channels. Thrives between the lines.',
    'Unlocks low blocks with incisive weighted passing. High creative flair.',
  ],
  'Natural Leader': [
    'Captained the youth ranks with calm authority. Vocal presence with elite tactical understanding.',
    'Brings calmness under pressure and galvanizes teammates around him.',
  ],
  'Late Bloomer': [
    'Under-the-radar prospect currently developing physical strength. Rapid growth curve anticipated in senior setup.',
    'Quietly improving every quarter. Coaches highlight his sharp tactical awareness.',
  ],
  'Relentless Engine': [
    'Covers huge ground each match. Relentless counter-pressing trigger who never shies away from a duel.',
    'Combative intensity and high motor. Excels in high-tempo pressing schemes.',
  ],
};

export function applyNaturalAnnualGrowth<
  T extends Pick<Player, 'age' | 'overall' | 'value' | 'form' | 'happiness' | 'growthMomentum'>
>(player: T): T {
  const updated = { ...player };
  if (updated.age <= 24 && updated.overall < 99) {
    const gain = Math.floor(Math.random() * 3) + 1;
    updated.overall = Math.min(99, updated.overall + gain);
    updated.value = Math.round(updated.value * 1.25);
  } else if (updated.age <= 29 && updated.overall < 99 && Math.random() < 0.45) {
    updated.overall = Math.min(99, updated.overall + 1);
    updated.value = Math.round(updated.value * 1.15);
  } else if (updated.age >= 32 && Math.random() < 0.5) {
    updated.overall = Math.max(45, updated.overall - Math.floor(Math.random() * 2) - 1);
    updated.value = Math.round(updated.value * 0.8);
  }
  updated.growthMomentum = computeGrowthMomentum({
    age: updated.age,
    overall: updated.overall,
    form: updated.form,
    happiness: updated.happiness,
  } as Player);
  return updated;
}

export function calculateAcademyPlayerValue(overall: number, tier: LeagueTier): number {
  const base = Math.pow(Math.max(44, overall) - 40, 2) * 1800;
  const tierMult = tier === 1 ? 1.4 : tier === 2 ? 1.0 : 0.65;
  return Math.max(100000, Math.round((base * tierMult) / 25000) * 25000);
}

export function normalizeAcademyPlayer(
  prospect: AcademyPlayer,
  club: Pick<Club, 'id' | 'tier'>
): AcademyPlayer {
  const form = typeof prospect.form === 'number' ? prospect.form : 6.5;
  const happiness = typeof prospect.happiness === 'number' ? prospect.happiness : 80;
  const morale: MoraleLevel = prospect.morale ?? deriveMorale(happiness);
  const value =
    typeof prospect.value === 'number' && prospect.value > 0
      ? prospect.value
      : calculateAcademyPlayerValue(prospect.overall, club.tier);
  const wage =
    typeof prospect.wage === 'number' && prospect.wage > 0
      ? prospect.wage
      : Math.max(500, Math.round(getAcademyPromotionWage(club.tier) * 0.5));
  const growthMomentum: GrowthMomentum =
    prospect.growthMomentum ??
    computeGrowthMomentum({
      age: prospect.age,
      overall: prospect.overall,
      form,
      happiness,
    } as Player);

  return {
    ...prospect,
    clubId: prospect.clubId ?? club.id,
    origin: prospect.origin ?? 'generated',
    form,
    happiness,
    morale,
    value,
    wage,
    contractYears: prospect.contractYears ?? 2,
    goals: prospect.goals ?? 0,
    assists: prospect.assists ?? 0,
    appearances: prospect.appearances ?? 0,
    cleanSheets: prospect.cleanSheets ?? 0,
    growthMomentum,
  };
}

export function academyPlayerToPlayer(
  prospect: AcademyPlayer,
  club: Pick<Club, 'id' | 'tier'>
): Player {
  const normalized = normalizeAcademyPlayer(prospect, club);
  return {
    id: normalized.id,
    name: normalized.name,
    nationality: normalized.nationality,
    age: normalized.age,
    position: normalized.position,
    roleDetail: normalized.roleDetail,
    overall: normalized.overall,
    growthMomentum: normalized.growthMomentum,
    value: normalized.value!,
    wage: normalized.wage!,
    contractYears: normalized.contractYears ?? 2,
    form: normalized.form!,
    happiness: normalized.happiness!,
    morale: normalized.morale!,
    goals: normalized.goals ?? 0,
    assists: normalized.assists ?? 0,
    appearances: normalized.appearances ?? 0,
    cleanSheets: normalized.cleanSheets ?? 0,
    clubId: club.id,
  };
}

const DEFAULT_GENERATED_POSITIONS: PlayerPosition[] = [
  'GK',
  'DEF',
  'DEF',
  'MID',
  'MID',
  'FWD',
  'FWD',
];

function createSingleAcademyPlayer(
  club: Club,
  seasonYear: number,
  pos: PlayerPosition,
  indexSeed: number,
  usedNames?: Set<string>
): AcademyPlayer {
  const name = pickUniqueName(usedNames, YOUTH_FIRST_NAMES, YOUTH_LAST_NAMES);
  const { min: minAge, max: maxAge } = YOUTH_ACADEMY_CONFIG.ageRange;
  const age = minAge + Math.floor(Math.random() * (maxAge - minAge + 1));
  const trait = PROSPECT_TRAITS[Math.floor(Math.random() * PROSPECT_TRAITS.length)];
  const roleList = YOUTH_ROLES[pos];
  const roleDetail = roleList[Math.floor(Math.random() * roleList.length)];

  const repBand = getAcademyRatingRangeForReputation(club.prestige);
  const span = Math.max(1, repBand.maxOverall - repBand.minOverall + 1);
  const overall = Math.max(
    YOUTH_ACADEMY_CONFIG.overallFloor,
    Math.min(
      YOUTH_ACADEMY_CONFIG.overallCeiling,
      repBand.minOverall + Math.floor(Math.random() * span)
    )
  );

  const form = 6.5;
  const happiness = 80;
  const morale = deriveMorale(happiness);
  const value = calculateAcademyPlayerValue(overall, club.tier);
  const wage = Math.max(500, Math.round(getAcademyPromotionWage(club.tier) * 0.5));
  const growthMomentum = computeGrowthMomentum({
    age,
    overall,
    form,
    happiness,
  } as Player);

  const momentumTier: MomentumTier =
    growthMomentum === 'breakout'
      ? 'Generational Prodigy'
      : growthMomentum === 'rapid'
        ? 'High Tempo'
        : 'Steady Climber';

  const notesList = SCOUT_NOTES[trait];
  const scoutReport = notesList[Math.floor(Math.random() * notesList.length)];

  return {
    id: `acad_${club.id}_${seasonYear}_${indexSeed}_${Math.random().toString(36).substring(2, 7)}`,
    name,
    nationality: pickProspectNationality(club.tier),
    age,
    position: pos,
    roleDetail,
    overall,
    origin: 'generated',
    growthMomentum,
    value,
    wage,
    contractYears: 2,
    form,
    happiness,
    morale,
    goals: 0,
    assists: 0,
    appearances: 0,
    cleanSheets: 0,
    momentumTier,
    trait,
    scoutReport,
    graduatingSeason: seasonYear,
    clubId: club.id,
  };
}

export function generateYouthIntake(
  club: Club,
  seasonYear: number,
  count: number = YOUTH_ACADEMY_CONFIG.generatedSlots,
  usedNames?: Set<string>,
  positionsOverride?: PlayerPosition[]
): AcademyPlayer[] {
  const positions =
    positionsOverride ??
    Array.from({ length: count }, (_, idx) => DEFAULT_GENERATED_POSITIONS[idx % DEFAULT_GENERATED_POSITIONS.length]);

  return positions.map((pos, idx) =>
    createSingleAcademyPlayer(club, seasonYear, pos, idx, usedNames)
  );
}

/**
 * Ensures a club's academy respects the hard cap of 10 players and restores
 * any missing generated-style slots so the 7-slot position split (1 GK, 2 DEF, 2 MID, 2 FWD)
 * is maintained while preserving up to 3 poached spots.
 */
export function replenishClubAcademy(
  club: Club,
  seasonYear: number,
  usedNames?: Set<string>
): AcademyPlayer[] {
  const current = (club.academy || [])
    .map(a => normalizeAcademyPlayer(a, club))
    .slice(0, YOUTH_ACADEMY_CONFIG.totalCapacity);

  const generatedCounts: Record<PlayerPosition, number> = {
    GK: 0,
    DEF: 0,
    MID: 0,
    FWD: 0,
  };

  current.forEach(p => {
    if (p.origin !== 'poached') {
      generatedCounts[p.position] += 1;
    }
  });

  const missingPositions: PlayerPosition[] = [];
  (['GK', 'DEF', 'MID', 'FWD'] as PlayerPosition[]).forEach(pos => {
    const target = YOUTH_ACADEMY_CONFIG.positionSplit[pos];
    const missing = Math.max(0, target - generatedCounts[pos]);
    for (let i = 0; i < missing; i++) {
      missingPositions.push(pos);
    }
  });

  const remainingCapacity = Math.max(0, YOUTH_ACADEMY_CONFIG.totalCapacity - current.length);
  const positionsToGenerate = missingPositions.slice(0, remainingCapacity);

  if (positionsToGenerate.length === 0) {
    return current;
  }

  const generated = generateYouthIntake(
    club,
    seasonYear,
    positionsToGenerate.length,
    usedNames,
    positionsToGenerate
  );

  return [...current, ...generated].slice(0, YOUTH_ACADEMY_CONFIG.totalCapacity);
}

function buildPromotedPlayerFromProspect(
  prospect: AcademyPlayer,
  club: Club,
  wage: number,
  contractYears: number
): Player {
  const asPlayer = academyPlayerToPlayer(prospect, club);
  return {
    ...asPlayer,
    id: `p_promoted_${prospect.id}_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`,
    wage,
    contractYears,
    happiness: 88,
    morale: 'ecstatic',
    goals: 0,
    assists: 0,
    appearances: 0,
    cleanSheets: 0,
    clubId: club.id,
  };
}

function processWeeklyRetirementNotices(
  currentWeek: number,
  clubsMap: Map<string, Club>,
  directorClubId: string | null
): { wireEvents: AcademyWireEvent[]; pressHeadlines: PressHeadline[] } {
  const wireEvents: AcademyWireEvent[] = [];
  const pressHeadlines: PressHeadline[] = [];

  if (currentWeek < 24 || currentWeek > 45) {
    return { wireEvents, pressHeadlines };
  }

  clubsMap.forEach(club => {
    const isUserClub = Boolean(directorClubId && club.id === directorClubId);
    club.squad.forEach(p => {
      if (p.age < 33 || p.retiringAtSeasonEnd) return;

      const baseProb = getRetirementProbability(p);
      // Higher-age players have a higher chance of announcing their farewell season in spring
      const weeklyNoticeChance = p.age >= 42 && currentWeek >= 36 ? 0.35 : baseProb * 0.032;

      if (Math.random() < weeklyNoticeChance) {
        p.retiringAtSeasonEnd = true;

        if (isUserClub || (p.overall >= 76 && wireEvents.length < 2)) {
          wireEvents.push({
            id: `wire_ret_${p.id}_w${currentWeek}`,
            kind: 'retirement_notice',
            playerName: p.name,
            position: p.position,
            age: p.age,
            overall: p.overall,
            clubName: club.name,
            detail: `Confirmed he will retire at the end of the season`,
          });
        }

        if (isUserClub) {
          pressHeadlines.push({
            title: `Veteran ${p.name} (${p.age}) announces he will retire from football at season's end`,
            source: 'The Sunday Athletic',
            category: 'boardroom',
            sentiment: 'neutral',
          });
        }
      }
    });
  });

  return { wireEvents, pressHeadlines };
}

function runAIAcademyPromotionsForWeek({
  currentWeek,
  seasonYear,
  clubsMap,
  directorClubId,
  transferHistory,
}: {
  currentWeek: number;
  seasonYear: number;
  clubsMap: Map<string, Club>;
  directorClubId: string | null;
  transferHistory: TransferRecord[];
}): { newTransfers: TransferRecord[]; wireEvents: AcademyWireEvent[] } {
  const newTransfers: TransferRecord[] = [];
  const wireEvents: AcademyWireEvent[] = [];

  const isActivePromoWindow =
    currentWeek === 1 ||
    (currentWeek >= 2 && currentWeek <= 6) ||
    (currentWeek >= 20 && currentWeek <= 24) ||
    currentWeek >= 45;

  clubsMap.forEach((club, clubId) => {
    if (clubId === directorClubId) return;
    if (club.squad.length >= 25) return;
    const academy = club.academy || [];
    if (academy.length === 0) return;

    const seasonPromos = transferHistory.filter(
      tr => tr.season === seasonYear && tr.toClubId === clubId && tr.type === 'promotion'
    ).length;
    if (seasonPromos >= 3) return;

    const healthyCounts: Record<PlayerPosition, number> = {
      GK: club.squad.filter(p => !p.isInjured && p.position === 'GK').length,
      DEF: club.squad.filter(p => !p.isInjured && p.position === 'DEF').length,
      MID: club.squad.filter(p => !p.isInjured && p.position === 'MID').length,
      FWD: club.squad.filter(p => !p.isInjured && p.position === 'FWD').length,
    };

    const needsDepth =
      club.squad.length < 21 ||
      healthyCounts.GK < 2 ||
      healthyCounts.DEF < 6 ||
      healthyCounts.MID < 6 ||
      healthyCounts.FWD < 4;

    if (!isActivePromoWindow && !(needsDepth && Math.random() < 0.25)) {
      return;
    }
    if (!needsDepth && Math.random() > 0.14) {
      return;
    }

    const tierThreshold = club.tier === 1 ? 61 : club.tier === 2 ? 56 : 52;
    const candidates = academy
      .filter(p => {
        if (p.age < 17) return false;
        const posNeed = healthyCounts[p.position] < MIN_YOUTH_POSITION_DEPTH[p.position];
        return (
          posNeed ||
          club.squad.length < 21 ||
          p.overall >= tierThreshold ||
          p.momentumTier === 'Generational Prodigy'
        );
      })
      .sort((a, b) => {
        const aNeed = healthyCounts[a.position] < MIN_YOUTH_POSITION_DEPTH[a.position] ? 1 : 0;
        const bNeed = healthyCounts[b.position] < MIN_YOUTH_POSITION_DEPTH[b.position] ? 1 : 0;
        if (aNeed !== bNeed) return bNeed - aNeed;
        return b.overall - a.overall;
      });

    if (candidates.length === 0) return;

    const prospect = candidates[0];
    const promoWage = getAcademyPromotionWage(club.tier);
    const currentWages = club.squad.reduce((acc, p) => acc + p.wage, 0);
    const allowedWage = needsDepth ? club.wageBudget * 1.05 : club.wageBudget;
    if (currentWages + promoWage > allowedWage) return;

    const result = promoteAcademyPlayer(club, prospect.id, promoWage, 3, undefined, {
      allowWageBudgetOverageFactor: needsDepth ? 1.05 : 1,
    });
    if (!result.success) return;

    clubsMap.set(clubId, result.updatedClub);
    const tr = createTransferRecord(
      result.promotedPlayer,
      'promotion',
      null,
      clubId,
      0,
      seasonYear,
      currentWeek,
      'ai',
      `Promoted from ${club.name} Youth Academy`
    );
    newTransfers.push(tr);

    if (
      wireEvents.length < 2 &&
      (prospect.overall >= 60 || prospect.momentumTier === 'Generational Prodigy')
    ) {
      wireEvents.push({
        id: `wire_ai_promo_${tr.id}`,
        kind: 'promotion',
        playerName: prospect.name,
        position: prospect.position,
        age: prospect.age,
        overall: prospect.overall,
        clubName: club.name,
        detail: `${prospect.momentumTier} graduated to ${club.shortName} first team`,
      });
    }
  });

  return { newTransfers, wireEvents };
}

export const MAX_USER_ACADEMY_CAPACITY = YOUTH_ACADEMY_CONFIG.totalCapacity;

export function calculatePoachCompensation(
  prospect: AcademyPlayer,
  sellingClub: Club
): number {
  if (typeof prospect.value === 'number' && prospect.value > 0) {
    return prospect.value;
  }
  return calculateAcademyPlayerValue(prospect.overall, sellingClub.tier);
}

export interface PoachEvaluationResult {
  ok: boolean;
  reason?: string;
  compensationFee: number;
  minAcceptableFee: number;
}

export function evaluatePoachProspect({
  prospect,
  sellingClub,
  buyingClub,
  owner,
  offeredFee,
  destination = 'academy',
  wage,
}: {
  prospect: AcademyPlayer;
  sellingClub: Club;
  buyingClub: Club;
  owner?: Owner;
  offeredFee: number;
  destination?: 'academy' | 'senior';
  wage?: number;
}): PoachEvaluationResult {
  const compensationFee = calculatePoachCompensation(prospect, sellingClub);
  const minAcceptableFee = Math.round((compensationFee * 0.9) / 25000) * 25000;

  if ((sellingClub.academy?.length || 0) <= 1) {
    return {
      ok: false,
      reason: `${sellingClub.name} refuse to leave their academy empty.`,
      compensationFee,
      minAcceptableFee,
    };
  }

  if (destination === 'academy' && (buyingClub.academy?.length || 0) >= YOUTH_ACADEMY_CONFIG.totalCapacity) {
    return {
      ok: false,
      reason: `Your Youth Academy is full (${YOUTH_ACADEMY_CONFIG.totalCapacity}/${YOUTH_ACADEMY_CONFIG.totalCapacity}). Promote, sell, or release a player first.`,
      compensationFee,
      minAcceptableFee,
    };
  }

  if (destination === 'senior') {
    const offeredWage = wage ?? getAcademyPromotionWage(buyingClub.tier);
    const currentWages = buyingClub.squad.reduce((acc, p) => acc + p.wage, 0);
    if (currentWages + offeredWage > buyingClub.wageBudget) {
      return {
        ok: false,
        reason: `Offered wage (£${(offeredWage / 1000).toFixed(1)}k/wk) exceeds club weekly wage headroom.`,
        compensationFee,
        minAcceptableFee,
      };
    }
  }

  if (offeredFee > buyingClub.transferBudget) {
    return {
      ok: false,
      reason: `Price (£${(offeredFee / 1000000).toFixed(2)}M) exceeds your transfer budget (£${(buyingClub.transferBudget / 1000000).toFixed(2)}M).`,
      compensationFee,
      minAcceptableFee,
    };
  }

  if (offeredFee > buyingClub.balance) {
    return {
      ok: false,
      reason: `Club cash reserves (£${(buyingClub.balance / 1000000).toFixed(2)}M) cannot cover this transfer fee.`,
      compensationFee,
      minAcceptableFee,
    };
  }

  if (offeredFee < minAcceptableFee) {
    return {
      ok: false,
      reason: `${sellingClub.name} rejected £${(offeredFee / 1000000).toFixed(2)}M. They require at least £${(minAcceptableFee / 1000000).toFixed(2)}M.`,
      compensationFee,
      minAcceptableFee,
    };
  }

  if (owner?.wealth === 'frugal' && offeredFee > buyingClub.transferBudget * 0.6) {
    return {
      ok: false,
      reason: `BOARD VETO: ${owner.name} blocked spending over 60% of the transfer budget on a single academy signing.`,
      compensationFee,
      minAcceptableFee,
    };
  }

  return {
    ok: true,
    compensationFee,
    minAcceptableFee,
  };
}

export function poachAcademyProspect({
  prospect,
  sellingClub,
  buyingClub,
  clubs,
  director,
  owner,
  manager,
  offeredFee,
  destination = 'academy',
  wage,
  contractYears,
  seasonYear,
  currentWeek,
  initiatedBy = 'director',
}: {
  prospect: AcademyPlayer;
  sellingClub: Club;
  buyingClub: Club;
  clubs: Club[];
  director: Director;
  owner?: Owner;
  manager?: Manager;
  offeredFee: number;
  destination?: 'academy' | 'senior';
  wage: number;
  contractYears: number;
  seasonYear: number;
  currentWeek: number;
  initiatedBy?: 'director' | 'manager';
}):
  | {
      success: true;
      updatedClubs: Club[];
      updatedDirector: Director;
      record: TransferRecord;
      message: string;
    }
  | { success: false; error: string } {
  const evaluation = evaluatePoachProspect({
    prospect,
    sellingClub,
    buyingClub,
    owner,
    offeredFee,
    destination,
    wage,
  });

  if (!evaluation.ok) {
    return { success: false, error: evaluation.reason || 'Unable to complete academy signing.' };
  }

  let transferPlayerForRecord: Player;
  let resultMsg = '';

  const updatedClubs = clubs.map(c => {
    if (c.id === sellingClub.id) {
      return {
        ...c,
        balance: c.balance + offeredFee,
        transferBudget: c.transferBudget + offeredFee,
        academy: (c.academy || []).filter(a => a.id !== prospect.id),
      };
    }

    if (c.id === buyingClub.id) {
      if (destination === 'academy') {
        const scholar: AcademyPlayer = normalizeAcademyPlayer(
          {
            ...prospect,
            clubId: buyingClub.id,
            origin: 'poached',
            graduatingSeason: seasonYear,
          },
          buyingClub
        );
        transferPlayerForRecord = academyPlayerToPlayer(scholar, buyingClub);
        resultMsg = `ACADEMY POACH: ${prospect.name} (${prospect.position}, Age ${prospect.age}) signed to ${buyingClub.name} Youth Academy for £${(offeredFee / 1000000).toFixed(2)}M.`;
        return {
          ...c,
          balance: Math.max(0, c.balance - offeredFee),
          transferBudget: Math.max(0, c.transferBudget - offeredFee),
          academy: [...(c.academy || []), scholar],
        };
      } else {
        const seniorPlayer = buildPromotedPlayerFromProspect(prospect, buyingClub, wage, contractYears);
        transferPlayerForRecord = seniorPlayer;
        resultMsg = `ACADEMY POACH: ${prospect.name} (${prospect.position}, Age ${prospect.age}) signed a ${contractYears}-year senior contract from ${sellingClub.name} Academy for £${(offeredFee / 1000000).toFixed(2)}M.`;
        const baseUpdated: Club = {
          ...c,
          balance: Math.max(0, c.balance - offeredFee),
          transferBudget: Math.max(0, c.transferBudget - offeredFee),
          squad: [...c.squad, seniorPlayer],
        };
        return baseUpdated.lineup
          ? { ...baseUpdated, lineup: syncLineupAfterSquadChange(baseUpdated, manager) }
          : baseUpdated;
      }
    }

    return c;
  });

  const recordPlayer =
    transferPlayerForRecord! ||
    academyPlayerToPlayer(prospect, buyingClub);

  const record = createTransferRecord(
    recordPlayer,
    'signing',
    sellingClub.id,
    buyingClub.id,
    offeredFee,
    seasonYear,
    currentWeek,
    initiatedBy,
    `Poached from ${sellingClub.name} Academy`
  );

  const updatedDirector: Director = {
    ...director,
    netSpend: director.netSpend + offeredFee,
  };

  return {
    success: true,
    updatedClubs,
    updatedDirector,
    record,
    message: resultMsg,
  };
}

export const MIN_YOUTH_POSITION_DEPTH: Record<PlayerPosition, number> = {
  GK: 2,
  DEF: 5,
  MID: 5,
  FWD: 3,
};

export const MAX_MANAGER_PROMOTIONS_PER_SEASON = 5;

export function getAcademyPromotionWage(tier: LeagueTier): number {
  return tier === 1 ? 5000 : tier === 2 ? 2500 : 1200;
}

export interface EvaluateProspectOptions {
  delegation?: DelegationMatrix;
  transferHistory?: TransferRecord[];
  seasonYear?: number;
  isSeasonEndPass?: boolean;
}

export interface EvaluateProspectResult {
  promote: boolean;
  reason: string;
  qualifiesByNeed?: boolean;
  qualifiesByQuality?: boolean;
}

export function evaluateProspect(
  prospect: AcademyPlayer,
  club: Club,
  _manager?: Manager,
  options: EvaluateProspectOptions = {}
): EvaluateProspectResult {
  if (options.delegation && options.delegation.youthPromotion !== 'manager') {
    return { promote: false, reason: 'not delegated' };
  }

  if (prospect.age < 17) {
    return { promote: false, reason: `age ${prospect.age}` };
  }

  const healthyCounts: Record<PlayerPosition, number> = {
    GK: club.squad.filter(p => !p.isInjured && p.position === 'GK').length,
    DEF: club.squad.filter(p => !p.isInjured && p.position === 'DEF').length,
    MID: club.squad.filter(p => !p.isInjured && p.position === 'MID').length,
    FWD: club.squad.filter(p => !p.isInjured && p.position === 'FWD').length,
  };

  const qualifiesByNeed =
    club.squad.length < 22 ||
    healthyCounts[prospect.position] < MIN_YOUTH_POSITION_DEPTH[prospect.position];

  const seasonEndOffset = options.isSeasonEndPass ? 4 : 0;
  const baseTierThreshold = club.tier === 1 ? 60 : club.tier === 2 ? 56 : 52;
  const tierThreshold = baseTierThreshold - seasonEndOffset;

  const sortedOverall = [...club.squad].sort((a, b) => b.overall - a.overall);
  const squad18Threshold =
    sortedOverall.length >= 18
      ? sortedOverall[17].overall - 8 - seasonEndOffset
      : Infinity;

  const qualifiesByQuality =
    prospect.overall >= tierThreshold || prospect.overall >= squad18Threshold;

  if (!qualifiesByNeed && !qualifiesByQuality) {
    return {
      promote: false,
      reason: 'below threshold',
      qualifiesByNeed: false,
      qualifiesByQuality: false,
    };
  }

  if (club.squad.length >= 25) {
    return {
      promote: false,
      reason: 'squad full',
      qualifiesByNeed,
      qualifiesByQuality,
    };
  }

  if (options.transferHistory !== undefined && options.seasonYear !== undefined) {
    const seasonManagerPromotions = options.transferHistory.filter(
      tr =>
        tr.season === options.seasonYear &&
        tr.toClubId === club.id &&
        tr.type === 'promotion' &&
        tr.initiatedBy === 'manager'
    ).length;

    if (seasonManagerPromotions >= MAX_MANAGER_PROMOTIONS_PER_SEASON) {
      return {
        promote: false,
        reason: 'limit reached',
        qualifiesByNeed,
        qualifiesByQuality,
      };
    }
  }

  const baseWage = getAcademyPromotionWage(club.tier);
  const currentWages = club.squad.reduce((acc, p) => acc + p.wage, 0);
  const allowedWageBudget =
    qualifiesByNeed && club.squad.length < 18
      ? club.wageBudget * 1.05
      : club.wageBudget;

  if (currentWages + baseWage > allowedWageBudget) {
    return {
      promote: false,
      reason: 'wage budget full',
      qualifiesByNeed,
      qualifiesByQuality,
    };
  }

  return {
    promote: true,
    reason: qualifiesByNeed ? 'squad need' : 'ready',
    qualifiesByNeed,
    qualifiesByQuality,
  };
}

export interface RunManagerYouthPromotionParams {
  myClubId: string;
  club: Club;
  manager?: Manager;
  currentWeek: number;
  seasonYear: number;
  delegation: DelegationMatrix;
  transferHistory: TransferRecord[];
}

export interface RunManagerYouthPromotionResult {
  updatedClub: Club;
  newTransfers: TransferRecord[];
  pressHeadlines: PressHeadline[];
  reputationGain: number;
}

export function runManagerYouthPromotion({
  myClubId,
  club,
  manager,
  currentWeek,
  seasonYear,
  delegation,
  transferHistory,
}: RunManagerYouthPromotionParams): RunManagerYouthPromotionResult {
  if (club.id !== myClubId) {
    return { updatedClub: club, newTransfers: [], pressHeadlines: [], reputationGain: 0 };
  }

  const isPreSeasonReview = currentWeek === 1;
  const isSeasonEndPass = currentWeek >= 45;
  const isDev =
    (typeof import.meta !== 'undefined' && Boolean(import.meta.env?.DEV)) ||
    (typeof process !== 'undefined' && process.env?.NODE_ENV !== 'production');

  const initialAcademy = club.academy || [];

  if (isDev && initialAcademy.length > 0) {
    for (const prospect of initialAcademy) {
      const evaluation = evaluateProspect(prospect, club, manager, {
        delegation,
        transferHistory,
        seasonYear,
        isSeasonEndPass,
      });
      console.log(
        `[YouthPromotion][S${seasonYear} W${currentWeek}] ${prospect.name} (${prospect.age}, ${prospect.position}, OVR ${prospect.overall}): promote=${evaluation.promote} | reason="${evaluation.reason}"`
      );
    }
  }

  if (delegation.youthPromotion !== 'manager' || !manager || club.managerId !== manager.id) {
    return { updatedClub: club, newTransfers: [], pressHeadlines: [], reputationGain: 0 };
  }

  if (initialAcademy.length === 0) {
    return { updatedClub: club, newTransfers: [], pressHeadlines: [], reputationGain: 0 };
  }

  const hasShortPosition = (c: Club): boolean => {
    const positions: PlayerPosition[] = ['GK', 'DEF', 'MID', 'FWD'];
    return positions.some(
      pos => c.squad.filter(p => !p.isInjured && p.position === pos).length < MIN_YOUTH_POSITION_DEPTH[pos]
    );
  };

  // Timing gates:
  // (1) Week 1: pre-season review with NO random chance
  // (2) Weeks 2-44: need-based runs with NO random chance when squad < 20 (or position short); quality-based has 25% weekly chance
  // (3) Week 45+ (before Season Finale): season-end pass with quality thresholds lowered by 4 and NO random chance
  const qualityAllowedThisWeek = isPreSeasonReview || isSeasonEndPass || Math.random() < 0.25;
  const needBypassRandom =
    isPreSeasonReview ||
    isSeasonEndPass ||
    club.squad.length < 20 ||
    hasShortPosition(club);

  let workingClub = club;
  const workingHistory = [...transferHistory];
  const newTransfers: TransferRecord[] = [];
  const pressHeadlines: PressHeadline[] = [];

  while (true) {
    const academy = workingClub.academy || [];
    if (academy.length === 0) break;

    const shortPositions = new Set<PlayerPosition>(
      (['GK', 'DEF', 'MID', 'FWD'] as PlayerPosition[]).filter(
        pos =>
          workingClub.squad.filter(p => !p.isInjured && p.position === pos).length <
          MIN_YOUTH_POSITION_DEPTH[pos]
      )
    );

    const evaluated = academy.map(prospect => ({
      prospect,
      evalResult: evaluateProspect(prospect, workingClub, manager, {
        delegation,
        transferHistory: workingHistory,
        seasonYear,
        isSeasonEndPass,
      }),
    }));

    const eligible = evaluated.filter(({ evalResult }) => {
      if (!evalResult.promote) return false;
      if (evalResult.qualifiesByNeed && (needBypassRandom || qualityAllowedThisWeek)) {
        return true;
      }
      if (evalResult.qualifiesByQuality && qualityAllowedThisWeek) {
        return true;
      }
      return false;
    });

    if (eligible.length === 0) break;

    // Prioritize prospects filling short positions first, then highest overall, then older
    eligible.sort((a, b) => {
      const aShort = shortPositions.has(a.prospect.position) ? 1 : 0;
      const bShort = shortPositions.has(b.prospect.position) ? 1 : 0;
      if (aShort !== bShort) return bShort - aShort;
      if (b.prospect.overall !== a.prospect.overall) {
        return b.prospect.overall - a.prospect.overall;
      }
      return b.prospect.age - a.prospect.age;
    });

    const chosen = eligible[0];
    const wage = getAcademyPromotionWage(workingClub.tier);
    const overageFactor =
      chosen.evalResult.qualifiesByNeed && workingClub.squad.length < 18 ? 1.05 : 1.0;

    const result = promoteAcademyPlayer(
      workingClub,
      chosen.prospect.id,
      wage,
      3,
      manager,
      { allowWageBudgetOverageFactor: overageFactor }
    );

    if (!result.success) {
      break;
    }

    workingClub = result.updatedClub;
    const record = createTransferRecord(
      result.promotedPlayer,
      'promotion',
      null,
      workingClub.id,
      0,
      seasonYear,
      currentWeek,
      'manager',
      `Promoted by Head Coach ${manager.name} from ${workingClub.name} Youth Academy`
    );
    newTransfers.push(record);
    workingHistory.unshift(record);

    pressHeadlines.push({
      title: `Head Coach promoted ${chosen.prospect.name} (${chosen.prospect.age}, ${chosen.prospect.position}, ${chosen.prospect.overall}) from the academy`,
      source: 'Club Academy Wire',
      category: 'transfer',
      sentiment: 'positive',
    });
  }

  // If manager wanted to promote someone but hit a hard limit (wage budget, squad cap, season limit),
  // add at most one digest headline per week explaining why.
  if (needBypassRandom || qualityAllowedThisWeek) {
    const blockedCandidates = (workingClub.academy || [])
      .map(prospect => ({
        prospect,
        evalResult: evaluateProspect(prospect, workingClub, manager, {
          delegation,
          transferHistory: workingHistory,
          seasonYear,
          isSeasonEndPass,
        }),
      }))
      .filter(
        ({ evalResult }) =>
          !evalResult.promote &&
          (evalResult.reason === 'wage budget full' ||
            evalResult.reason === 'squad full' ||
            evalResult.reason === 'limit reached')
      )
      .sort((a, b) => b.prospect.overall - a.prospect.overall);

    if (blockedCandidates.length > 0) {
      const topBlocked = blockedCandidates[0];
      const reasonText =
        topBlocked.evalResult.reason === 'wage budget full'
          ? 'the wage budget is full'
          : topBlocked.evalResult.reason === 'squad full'
            ? 'the 25-man squad is full'
            : `the ${MAX_MANAGER_PROMOTIONS_PER_SEASON}-promotion seasonal limit has been reached`;

      pressHeadlines.push({
        title: `Head Coach wanted to promote ${topBlocked.prospect.name} but ${reasonText}`,
        source: 'Club Academy Wire',
        category: 'transfer',
        sentiment: 'neutral',
      });
    }
  }

  const reputationGain = Math.min(
    3,
    newTransfers.reduce((sum, tr) => sum + (tr.overall >= 64 ? 2 : 1), 0)
  );

  return {
    updatedClub: workingClub,
    newTransfers,
    pressHeadlines,
    reputationGain,
  };
}

export function promoteAcademyPlayer(
  club: Club,
  academyPlayerId: string,
  wage: number,
  contractYears: number,
  manager?: Manager,
  options?: { allowWageBudgetOverageFactor?: number; unrestricted?: boolean }
): { success: true; updatedClub: Club; promotedPlayer: Player } | { success: false; error: string } {
  const unrestricted = Boolean(options?.unrestricted);

  if (!unrestricted) {
    if (club.squad.length >= 25) {
      return { success: false, error: 'First-team squad is at maximum 25-man roster capacity! Release or transfer a senior player first.' };
    }

    const currentWages = club.squad.reduce((acc, p) => acc + p.wage, 0);
    const effectiveWageBudget = club.wageBudget * (options?.allowWageBudgetOverageFactor ?? 1);
    if (currentWages + wage > effectiveWageBudget) {
      return { success: false, error: `Offered wage (£${(wage / 1000).toFixed(1)}k/wk) exceeds club weekly wage budget headroom!` };
    }
  }

  const academy = club.academy || [];
  const prospect = academy.find(p => p.id === academyPlayerId);
  if (!prospect) {
    return { success: false, error: 'Academy prospect not found.' };
  }

  const promotedPlayer = buildPromotedPlayerFromProspect(prospect, club, wage, contractYears);

  const updatedClubBase: Club = {
    ...club,
    squad: [...club.squad, promotedPlayer],
    academy: academy.filter(p => p.id !== academyPlayerId),
  };

  const updatedClub: Club = updatedClubBase.lineup
    ? {
        ...updatedClubBase,
        lineup: syncLineupAfterSquadChange(updatedClubBase, manager),
      }
    : updatedClubBase;

  return { success: true, updatedClub, promotedPlayer };
}

export function releaseAcademyPlayer(club: Club, academyPlayerId: string): Club {
  const academy = club.academy || [];
  return {
    ...club,
    academy: academy.filter(p => p.id !== academyPlayerId),
  };
}

/**
 * Reuses existing transferService getTransferOffers() to fetch real club bids for an academy player.
 */
export function getAcademySaleOffers(
  prospect: AcademyPlayer,
  sellerClub: Club,
  allClubs: Club[]
): GeneratedTransferOffer[] {
  const playerObj = academyPlayerToPlayer(prospect, sellerClub);
  return getTransferOffers(playerObj, allClubs, sellerClub.id);
}

/**
 * Sells an academy player to another club, reusing standard transfer ledger & club finance settlement.
 */
export function sellAcademyPlayer({
  prospect,
  sellerClub,
  buyingClub,
  clubs,
  director,
  fee,
  wage,
  seasonYear,
  currentWeek,
  initiatedBy = 'director',
}: {
  prospect: AcademyPlayer;
  sellerClub: Club;
  buyingClub: Club;
  clubs: Club[];
  director: Director;
  fee: number;
  wage: number;
  seasonYear: number;
  currentWeek: number;
  initiatedBy?: 'director' | 'manager';
}): {
  updatedClubs: Club[];
  updatedDirector: Director;
  soldPlayer: Player;
  record: TransferRecord;
} {
  if (!(sellerClub.academy || []).some(a => a.id === prospect.id)) {
    throw new Error(`${prospect.name} is no longer in ${sellerClub.name} Youth Academy.`);
  }
  if (buyingClub.squad.length >= 25) {
    throw new Error(`${buyingClub.name} already has a full 25-man squad.`);
  }

  const soldPlayer: Player = {
    ...academyPlayerToPlayer(prospect, sellerClub),
    clubId: buyingClub.id,
    wage,
    contractYears: 3,
    happiness: 85,
    morale: 'content',
  };

  const updatedClubs = clubs.map(c => {
    if (c.id === sellerClub.id) {
      return {
        ...c,
        academy: (c.academy || []).filter(a => a.id !== prospect.id),
        transferBudget: c.transferBudget + fee,
        balance: c.balance + fee,
      };
    }
    if (c.id === buyingClub.id) {
      const updatedBuyerBase: Club = {
        ...c,
        squad: [...c.squad, soldPlayer],
        transferBudget: Math.max(0, c.transferBudget - fee),
        balance: Math.max(0, c.balance - fee),
      };
      return updatedBuyerBase.lineup
        ? { ...updatedBuyerBase, lineup: syncLineupAfterSquadChange(updatedBuyerBase) }
        : updatedBuyerBase;
    }
    return c;
  });

  const updatedDirector: Director = {
    ...director,
    netSpend: director.netSpend - fee,
  };

  const record = createTransferRecord(
    soldPlayer,
    'sale',
    sellerClub.id,
    buyingClub.id,
    fee,
    seasonYear,
    currentWeek,
    initiatedBy,
    `Sold from ${sellerClub.name} Youth Academy`
  );

  return {
    updatedClubs,
    updatedDirector,
    soldPlayer,
    record,
  };
}

// ================= PLAYER SELLING & TRANSFER MARKET ENGINE =================

// Offer a player to rival AI clubs and generate competitive incoming bids
export function offerPlayerToClubs(
  playerId: string,
  askingPrice: number,
  clubs?: Club[],
  userClubId?: string,
  currentWeek: number = 1,
  seasonYear: number = 2026
): IncomingBid[] {
  if (!clubs || clubs.length === 0) return [];

  // Find player and selling club
  let sellingClub = userClubId ? clubs.find(c => c.id === userClubId) : undefined;
  let player: Player | undefined;

  if (sellingClub) {
    player = sellingClub.squad.find(p => p.id === playerId);
  } else {
    for (const c of clubs) {
      const p = c.squad.find(item => item.id === playerId);
      if (p) {
        player = p;
        sellingClub = c;
        break;
      }
    }
  }

  if (!player || !sellingClub || player.isInjured || player.retiringAtSeasonEnd) return [];

  const bids: IncomingBid[] = [];
  const candidateClubs = clubs.filter(c => c.id !== sellingClub!.id);

  for (const buyer of candidateClubs) {
    if (buyer.squad.length >= 25) continue;

    // 1. Position evaluation & tactical squad need
    const posPlayers = buyer.squad.filter(p => p.position === player!.position);
    let needsPosition = false;

    if (player.position === 'GK' && posPlayers.length < 3) needsPosition = true;
    else if (player.position === 'DEF' && posPlayers.length < 7) needsPosition = true;
    else if (player.position === 'MID' && posPlayers.length < 7) needsPosition = true;
    else if (player.position === 'FWD' && posPlayers.length < 5) needsPosition = true;

    // Or if player overall is a direct starting upgrade (+1 or more above the median of position)
    if (!needsPosition && posPlayers.length > 0) {
      const lowestOvr = Math.min(...posPlayers.map(p => p.overall));
      if (player.overall >= lowestOvr + 2) {
        needsPosition = true;
      }
    }

    if (!needsPosition) continue;

    // 2. League tier fit
    let tierFit = false;
    if (buyer.tier === 1 && player.overall >= 71) tierFit = true;
    else if (buyer.tier === 2 && player.overall >= 63 && player.overall <= 83) tierFit = true;
    else if (buyer.tier === 3 && player.overall >= 53 && player.overall <= 75) tierFit = true;

    if (!tierFit) continue;

    // 3. Financial affordability (verify buyer can pay actual offered wage & fee)
    const wageOffered = Math.round(player.wage * 1.12);
    const currentWages = buyer.squad.reduce((sum, p) => sum + p.wage, 0);
    const wageHeadroom = buyer.wageBudget - currentWages;
    if (wageHeadroom < wageOffered) continue;

    // Check if buyer has transfer budget for at least 85% of asking price
    const minOfferBudget = askingPrice * 0.82;
    if (buyer.transferBudget < minOfferBudget || buyer.balance < minOfferBudget) continue;

    // 4. Calculate realistic offer fee
    let offeredFee = askingPrice;
    if (askingPrice > player.value * 1.35) {
      // Counter-bid closer to true value + slight markup
      const counterRatio = 1.05 + Math.random() * 0.15;
      offeredFee = Math.round(player.value * counterRatio);
    } else if (askingPrice < player.value * 0.90) {
      // Bargain: club meets asking price immediately
      offeredFee = askingPrice;
    } else {
      // Realistic negotiation: 92% - 105% of asking price
      const discount = 0.92 + Math.random() * 0.13;
      offeredFee = Math.round(askingPrice * discount);
    }

    // Cap at buyer's maximum available budget
    offeredFee = Math.min(offeredFee, buyer.transferBudget, buyer.balance);
    if (offeredFee <= 0) continue;

    bids.push({
      id: `bid_${seasonYear}_w${currentWeek}_${buyer.id}_${player.id}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      playerId: player.id,
      playerName: player.name,
      playerPos: player.position,
      playerOverall: player.overall,
      playerAge: player.age,
      askingPrice,
      offeredFee,
      fromClubId: sellingClub.id,
      buyingClubId: buyer.id,
      buyingClubName: buyer.name,
      buyingClubTier: buyer.tier,
      wageOffered: Math.round(player.wage * 1.12),
      status: 'pending',
      createdWeek: currentWeek,
      season: seasonYear,
    });

    if (bids.length >= 3) break;
  }

  return bids.sort((a, b) => b.offeredFee - a.offeredFee);
}

// Execute player sale when an incoming bid is accepted by the user
export function acceptIncomingBid(
  bid: IncomingBid,
  clubs: Club[],
  director: Director,
  currentWeek: number = 1,
  seasonYear: number = 2026,
  sellerManager?: Manager
): {
  updatedClubs: Club[];
  updatedDirector: Director;
  newTransferRecord: TransferRecord;
} {
  const updatedClubs = clubs.map(c => ({
    ...c,
    squad: c.squad.map(p => ({ ...p })),
    form: [...c.form],
    academy: c.academy ? c.academy.map(a => ({ ...a })) : undefined,
    lineup: c.lineup
      ? {
          ...c.lineup,
          slots: [...c.lineup.slots],
          bench: [...c.lineup.bench],
        }
      : undefined,
  }));

  const sellingClub = updatedClubs.find(c => c.id === bid.fromClubId);
  const buyingClub = updatedClubs.find(c => c.id === bid.buyingClubId);

  if (!sellingClub) {
    throw new Error(`Selling club not found: ${bid.fromClubId}`);
  }

  const soldPlayer = sellingClub.squad.find(p => p.id === bid.playerId);
  if (!soldPlayer) {
    throw new Error(`Player not found in seller squad: ${bid.playerId}`);
  }
  if (buyingClub && buyingClub.squad.length >= 25) {
    throw new Error(`${buyingClub.name} already have a full 25-man squad and cannot complete this signing.`);
  }

  // 1. Remove player from user's club & credit fee to transferBudget and balance
  sellingClub.squad = sellingClub.squad.filter(p => p.id !== bid.playerId);
  sellingClub.transferBudget += bid.offeredFee;
  sellingClub.balance += bid.offeredFee;
  if (sellingClub.lineup) {
    sellingClub.lineup = syncLineupAfterSquadChange(sellingClub, sellerManager);
  }

  // 2. Deduct fee from buying club & add player to buying club squad
  if (buyingClub) {
    buyingClub.transferBudget = Math.max(0, buyingClub.transferBudget - bid.offeredFee);
    buyingClub.balance = Math.max(0, buyingClub.balance - bid.offeredFee);

    const transferredPlayer: Player = {
      ...soldPlayer,
      clubId: buyingClub.id,
      wage: bid.wageOffered || Math.round(soldPlayer.wage * 1.1),
      contractYears: 3,
      happiness: 85,
      morale: 'content',
    };
    buyingClub.squad.push(transferredPlayer);
    if (buyingClub.lineup) {
      buyingClub.lineup = syncLineupAfterSquadChange(buyingClub);
    }
  }

  // 3. Update Director finances (selling reduces net spend)
  const updatedDirector: Director = {
    ...director,
    netSpend: director.netSpend - bid.offeredFee,
    boardTrust: Math.min(100, director.boardTrust + 2),
    fanApproval: Math.min(100, director.fanApproval + (bid.offeredFee > soldPlayer.value * 1.2 ? 2 : 0)),
  };

  // 4. Log transfer record
  const newTransferRecord = createTransferRecord(
    {
      id: soldPlayer.id,
      name: soldPlayer.name,
      position: soldPlayer.position,
      age: soldPlayer.age,
      overall: soldPlayer.overall,
      wage: bid.wageOffered || Math.round(soldPlayer.wage * 1.1),
      contractYears: 3,
    },
    'sale',
    bid.fromClubId,
    bid.buyingClubId,
    bid.offeredFee,
    seasonYear,
    currentWeek,
    'director'
  );

  return {
    updatedClubs,
    updatedDirector,
    newTransferRecord,
  };
}
