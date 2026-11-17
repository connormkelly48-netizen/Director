/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Club, Director, FormationId, Lineup, Manager, MatchResult, Owner, Player, WeeklyDigest, PressHeadline, BoardroomMemo, DelegationMatrix, JobVacancy, SeasonSummary, SeasonAward, LeagueTier, AcademyPlayer, ProspectTrait, PlayerPosition, GrowthMomentum, MomentumTier, MoraleLevel, GameweekRecord, GameweekStandingsEntry, TransferRecord, TransferProposal, IncomingBid, ManagerSigningEvent, AcademyWireEvent, RetirementRecord, SeasonGraduateHighlight } from '../types/game';
import { TAKEOVER_CANDIDATES } from '../data/database';
import {
  parseFormation,
  selectStartingXI,
  expireTransferProposals,
  runManagerTransferActivity,
  runManagerContractRenewals,
} from './transferService';
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

export { parseFormation, selectStartingXI };

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

// Calculate team rating from starting XI taking into account getSlotFit penalties and +0.5% formation comfort
export function getTeamMatchRating(club: Club, manager?: Manager, cachedLineup?: Lineup): number {
  const lineup = cachedLineup ?? resolveClubLineup(club, manager);
  const def = FORMATIONS[lineup.formation] || FORMATIONS['4-3-3'];
  const healthyById = new Map(club.squad.filter(p => !p.isInjured).map(p => [p.id, p]));
  const seen = new Set<string>();
  let totalOvr = 0;
  let starterCount = 0;

  for (let i = 0; i < def.slots.length; i++) {
    const pid = lineup.slots[i];
    if (!pid || seen.has(pid)) continue;
    const player = healthyById.get(pid);
    if (!player) continue;
    totalOvr += getSlotFit(player, def.slots[i].role).effectiveOverall;
    seen.add(pid);
    starterCount += 1;
  }

  if (starterCount === 0) return 60;

  const avgOvr = totalOvr / starterCount;
  const mgrBonus = manager ? (manager.reputation / 100) * 4 : 0;
  const trustModifier = manager ? ((manager.trustInDirector - 50) / 100) * 3 : 0;

  let rating = avgOvr + mgrBonus + trustModifier;

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
      const noise = (Math.random() * 1.2) - 0.6; // +/- 0.6

      const matchRating = Math.min(
        10.0,
        Math.max(4.0, Math.round((6.5 + resultMod + pGoals * 0.8 + pAssists * 0.5 + cleanSheetMod + noise) * 10) / 10)
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

  updateSquadPostMatch(homeClub, homeXI, homeGoals, awayGoals, awayGoals === 0);
  updateSquadPostMatch(awayClub, awayXI, awayGoals, homeGoals, homeGoals === 0);

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

// Generate the Sunday Press headlines based on match and boardroom climate
export function generatePressHeadlines(
  director: Director,
  club: Club,
  owner: Owner,
  manager: Manager | undefined,
  match: MatchResult | undefined
): PressHeadline[] {
  const headlines: PressHeadline[] = [];

  if (match) {
    const isHome = match.homeClubId === club.id;
    const goalsFor = isHome ? match.homeScore : match.awayScore;
    const goalsAgainst = isHome ? match.awayScore : match.homeScore;
    const isWin = goalsFor > goalsAgainst;
    const isLoss = goalsFor < goalsAgainst;

    if (isWin) {
      headlines.push({
        title: `${club.name} produce tactical masterclass in ${goalsFor}-${goalsAgainst} thriller!`,
        source: 'The Sunday Athletic',
        category: 'match',
        sentiment: 'positive',
      });
      if (director.fanApproval < 50) {
        headlines.push({
          title: `Director ${director.name} buys crucial breathing room as terrace discontent pauses`,
          source: 'Sky Sports News',
          category: 'fan_reaction',
          sentiment: 'positive',
        });
      }
    } else if (isLoss) {
      headlines.push({
        title: `CRISIS AT ${club.shortName}: Dismal ${goalsFor}-${goalsAgainst} defeat plunges club into turmoil`,
        source: 'Daily Football Mail',
        category: 'match',
        sentiment: 'negative',
      });
      if (owner.patience === 'volatile' || owner.patience === 'impatient') {
        headlines.push({
          title: `Boardroom Summit: Owner ${owner.name} reportedly furious with recruitment strategy`,
          source: 'The Guardian Football',
          category: 'boardroom',
          sentiment: 'negative',
        });
      }
    } else {
      headlines.push({
        title: `${club.name} grind out hard-fought ${goalsFor}-${goalsAgainst} stalemate`,
        source: 'BBC Sport',
        category: 'match',
        sentiment: 'neutral',
      });
    }
  }

  // Fan & Manager whispers
  if (manager && manager.trustInDirector < 40) {
    headlines.push({
      title: `Rift brewing between Manager ${manager.name} and Sporting Director over squad control`,
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

  return headlines;
}

// Generate boardroom internal memo and owner communication
export function generateBoardroomMemo(
  director: Director,
  club: Club,
  owner: Owner,
  manager: Manager | undefined,
  match: MatchResult | undefined
): BoardroomMemo {
  // Check winning / losing streaks
  const recentForm = club.form.slice(0, 3);
  const winCount = recentForm.filter(f => f === 'W').length;
  const lossCount = recentForm.filter(f => f === 'L').length;

  if (lossCount >= 3) {
    if (owner.approval < 40) {
      return {
        author: owner.name,
        role: 'Club Chairman / Majority Owner',
        content: `Three defeats on the spin is completely unacceptable for a club of our stature. The fans are screaming for accountability. If we do not see an immediate resurgence in our next match, I will have no hesitation in restructuring our entire football leadership. Consider this an official final notice.`,
        tone: 'ultimatum',
        impactExplanation: 'Board trust has dropped to critical levels. A defeat in the next round could lead to your immediate dismissal!',
      };
    } else {
      return {
        author: owner.name,
        role: 'Club Chairman / Majority Owner',
        content: `Our recent sequence of results is causing significant alarm in the boardroom. I have backed your transfer vision with substantial capital; now we need to see return on that investment on the pitch. Keep the manager focused.`,
        tone: 'warning',
        impactExplanation: 'Owner patience is wearing thin. Maintain close dialogue with your head coach.',
      };
    }
  }

  if (winCount >= 3) {
    return {
      author: owner.name,
      role: 'Club Chairman / Majority Owner',
      content: `Superb run of performances! The squad looks cohesive, our market decisions are vindicated, and morale around the training ground is tremendous. Keep pushing toward our seasonal targets.`,
      tone: 'praising',
      impactExplanation: 'Board trust and fan approval have surged by +5 points!',
    };
  }

  return {
    author: owner.name,
    role: 'Club Chairman / Majority Owner',
    content: `Weekly executive review completed. Squad balance looks adequate. Keep monitoring wage commitments and ensure our medical staff manages player fitness properly.`,
    tone: 'neutral',
  };
}

// Simulate realistic AI-to-AI transfers during active transfer windows (Summer: w1-6, Winter: w20-24)
export function simulateAITransfersForWeek(
  currentWeek: number,
  seasonYear: number,
  clubsMap: Map<string, Club>,
  directorClubId: string | null
): TransferRecord[] {
  const newTransfers: TransferRecord[] = [];
  const isWindowOpen = currentWeek <= 6 || (currentWeek >= 20 && currentWeek <= 24);
  if (!isWindowOpen) return newTransfers;

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

    const eligiblePlayers = seller.squad.filter(
      p => p.value <= buyer.transferBudget && p.value >= 400000 && !p.isInjured
    );
    if (eligiblePlayers.length === 0) continue;

    const targetPlayer = eligiblePlayers[Math.floor(Math.random() * eligiblePlayers.length)];
    const fee = Math.round(targetPlayer.value * (0.95 + Math.random() * 0.25));

    if (buyer.transferBudget >= fee && buyer.balance >= fee) {
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

  // Occasional AI-to-AI youth academy poach during open transfer windows
  if (Math.random() < 0.22 && aiClubs.length >= 2) {
    const poacher = aiClubs[Math.floor(Math.random() * aiClubs.length)];
    const poachTargets = Array.from(clubsMap.values()).filter(
      c =>
        c.id !== poacher.id &&
        c.id !== directorClubId &&
        (c.academy?.length || 0) > 2
    );
    if (poacher && poacher.squad.length < 24 && poachTargets.length > 0) {
      const seller = poachTargets[Math.floor(Math.random() * poachTargets.length)];
      const candidates = (seller.academy || []).filter(
        a => a.age >= 17 && (a.momentumTier === 'Generational Prodigy' || a.momentumTier === 'High Tempo' || a.overall >= 58)
      );
      if (candidates.length > 0) {
        const prospect = candidates[Math.floor(Math.random() * candidates.length)];
        const fee = calculatePoachCompensation(prospect, seller);
        const wage = getAcademyPromotionWage(poacher.tier);
        const currentWages = poacher.squad.reduce((sum, p) => sum + p.wage, 0);
        if (poacher.transferBudget >= fee && poacher.balance >= fee && currentWages + wage <= poacher.wageBudget) {
          poacher.transferBudget -= fee;
          poacher.balance -= fee;
          seller.transferBudget += fee;
          seller.balance += fee;
          seller.academy = (seller.academy || []).filter(a => a.id !== prospect.id);

          const poachedPlayer = buildPromotedPlayerFromProspect(prospect, poacher, wage, 4);
          poacher.squad.push(poachedPlayer);

          newTransfers.push(
            createTransferRecord(
              poachedPlayer,
              'signing',
              seller.id,
              poacher.id,
              fee,
              seasonYear,
              currentWeek,
              'ai',
              `Poached from ${seller.name} Youth Academy`
            )
          );
        }
      }
    }
  }

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
  transferProposals: TransferProposal[] = []
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
  owners.forEach(o => ownersMap.set(o.id, { ...o }));

  const managersMap = new Map<string, Manager>();
  managers.forEach(m => managersMap.set(m.id, { ...m }));

  // Per-week lineup cache:
  // - User's club runs prepareUserLineupForMatch (updates auto lineup for form/injuries or replaces injured manual starters with notice)
  // - AI clubs run autoPickLineup with their manager's preferred formation once per week
  const weeklyLineupCache = new Map<string, Lineup>();
  let matchFormation: FormationId | undefined;
  let matchTeamRating: number | undefined;
  let lineupNotices: string[] = [];

  clubsMap.forEach(c => {
    const mgr = c.managerId ? managersMap.get(c.managerId) : undefined;
    if (director.currentClubId && c.id === director.currentClubId) {
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
      const homeMgr = homeClub.managerId ? managersMap.get(homeClub.managerId) : undefined;
      const awayMgr = awayClub.managerId ? managersMap.get(awayClub.managerId) : undefined;

      const res = simulateMatch(homeClub, awayClub, homeMgr, awayMgr, weeklyLineupCache, newlyInjuredIds);
      applyMatchToClubs(res, homeClub, awayClub);
      allResults.push(res);

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
  const playerManager = playerClub && playerClub.managerId ? managersMap.get(playerClub.managerId) : undefined;

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

  // Expire stale pending transfer proposals every week
  let updatedTransferProposals = expireTransferProposals(transferProposals, currentWeek);
  let updatedFreeAgents = freeAgents.map(fa => ({ ...fa }));

  // Check for Manager-Controlled / Shared Autonomous Transfer Activity during open transfer windows (Weeks 1-6, 20-24)
  let managerSigning: ManagerSigningEvent | undefined;
  let managerPressHeadlines: PressHeadline[] = [];
  const isWindowOpen = currentWeek <= 6 || (currentWeek >= 20 && currentWeek <= 24);
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

  if (myClubId && preDealPlayerClub && preDealPlayerManager && preDealPlayerOwner) {
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
  }

  const academyWire: AcademyWireEvent[] = [];

  // Check for Manager-Controlled Youth Academy Promotions for MY club only
  const postTransferPlayerClub = myClubId ? clubsMap.get(myClubId) : undefined;
  const postTransferPlayerManager =
    postTransferPlayerClub && postTransferPlayerClub.managerId
      ? managersMap.get(postTransferPlayerClub.managerId)
      : undefined;

  if (myClubId && postTransferPlayerClub) {
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

  // Check for Manager-Controlled Contract Renewals for MY club only
  const postYouthPlayerClub = myClubId ? clubsMap.get(myClubId) : undefined;
  const postYouthPlayerManager =
    postYouthPlayerClub && postYouthPlayerClub.managerId
      ? managersMap.get(postYouthPlayerClub.managerId)
      : undefined;

  if (myClubId && postYouthPlayerClub) {
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
  const latestPlayerManager = latestPlayerClub && latestPlayerClub.managerId ? managersMap.get(latestPlayerClub.managerId) : undefined;

  // Keep user's club lineup clean after match injuries, weekly recoveries, and manager autonomous transfers
  if (latestPlayerClub?.lineup) {
    latestPlayerClub.lineup = syncLineupAfterSquadChange(latestPlayerClub, latestPlayerManager);
  }

  // Check for organic incoming bids for user's club players during transfer windows
  if (isWindowOpen && latestPlayerClub && latestPlayerClub.squad.length > 18 && Math.random() < 0.30) {
    const attractivePlayers = latestPlayerClub.squad.filter(
      p => !p.isInjured && (p.form >= 7.0 || p.overall >= 73 || p.growthMomentum === 'breakout')
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

  // Create digest
  const pressHeadlines = latestPlayerClub && latestPlayerOwner
    ? generatePressHeadlines(finalDirector, latestPlayerClub, latestPlayerOwner, latestPlayerManager, playerMatch)
    : [];

  // Prepend manager transfer/board-veto headlines
  if (managerPressHeadlines.length > 0) {
    pressHeadlines.unshift(...managerPressHeadlines);
  }

  const boardroomMemo = latestPlayerClub && latestPlayerOwner
    ? generateBoardroomMemo(finalDirector, latestPlayerClub, latestPlayerOwner, latestPlayerManager, playerMatch)
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
    if (latestPlayerOwner) {
      ownersMap.set(latestPlayerOwner.id, {
        ...latestPlayerOwner,
        approval: Math.min(100, latestPlayerOwner.approval + 5),
      });
    }
  }

  const dressingRoomSnippet = latestPlayerManager
    ? `Manager ${latestPlayerManager.name} reports squad morale is ${latestPlayerManager.trustInDirector > 60 ? 'high and aligned with board targets' : 'strained due to boardroom friction'}.`
    : 'No active manager currently in the dugout.';

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

// Generate Job Vacancies across pyramid
export function generateJobVacancies(clubs: Club[], owners: Owner[], currentDirectorClubId: string | null): JobVacancy[] {
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
      const repReq = c.tier === 1 ? 75 : c.tier === 2 ? 60 : 45;
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
      });
    }
  });

  return vacancies;
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

  // Compute Director grade
  let directorGrade: SeasonSummary['directorGrade'] = 'B';
  const exp = playerClub?.fanExpectation || 'Mid-Table Safety';

  if (wonTrophy) {
    directorGrade = 'A+';
  } else if (isPromoted) {
    directorGrade = 'A+';
  } else if (isRelegated) {
    directorGrade = 'F';
  } else if (exp === 'Title Contender') {
    directorGrade = playerPos <= 3 ? 'A' : playerPos <= 5 ? 'B' : 'D';
  } else if (exp === 'European Qualification') {
    directorGrade = playerPos <= 6 ? 'A' : playerPos <= 9 ? 'B' : 'C';
  } else if (exp === 'Automatic Promotion') {
    directorGrade = playerPos <= 3 ? 'A+' : playerPos <= 6 ? 'B' : 'D';
  } else if (exp === 'Play-off Push') {
    directorGrade = playerPos <= 6 ? 'A' : playerPos <= 10 ? 'B' : 'C';
  } else if (exp === 'Avoid Relegation') {
    directorGrade = !isRelegated ? (playerPos <= 12 ? 'A' : 'B') : 'F';
  }

  // Financial disbursements
  const prizeMoney = playerTier === 1 
    ? Math.max(10000000, 45000000 - (playerPos - 1) * 1800000) 
    : playerTier === 2 
    ? Math.max(3000000, 16000000 - (playerPos - 1) * 600000) 
    : Math.max(800000, 5000000 - (playerPos - 1) * 180000);

  const tvRevenue = playerTier === 1 ? 88000000 : playerTier === 2 ? 18000000 : 4000000;

  // Owner evaluation commentary
  const ownerName = owner?.name || 'The Board';
  let ownerEvaluation = '';

  if (directorGrade === 'A+' || directorGrade === 'A') {
    ownerEvaluation = `Outstanding campaign! ${ownerName} and the entire executive committee are thrilled with our finish at #${playerPos}. Your strategic acquisitions have transformed our club. Additional summer transfer capital has been unlocked.`;
  } else if (directorGrade === 'B') {
    ownerEvaluation = `A respectable season. We finished #${playerPos}, fulfilling our core targets. For the next campaign, the board expects us to build on this foundation and push for greater heights.`;
  } else if (directorGrade === 'C' || directorGrade === 'D') {
    ownerEvaluation = `A deeply underwhelming campaign. Finishing #${playerPos} has disappointed supporters and board members alike. Significant squad restructuring will be required in the summer.`;
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
    const wageHeadroom = Math.max(6000, club.wageBudget - currentWages);

    // 1. Prioritize promoting an aged 17-18 prospect from the club's own Youth Academy
    const academyMatches = (club.academy || [])
      .filter(a => a.age >= 17 && a.position === pos)
      .sort((a, b) => b.overall - a.overall);
    if (academyMatches.length > 0) {
      const chosen = academyMatches[0];
      const promoWage = getAcademyPromotionWage(club.tier);
      const promoted = buildPromotedPlayerFromProspect(chosen, club, promoWage, 3);
      club.squad.push(promoted);
      club.academy = (club.academy || []).filter(a => a.id !== chosen.id);
      continue;
    }

    // 2. Next try finding best free agent for this position within wage budget
    const eligible = freeAgentsPool
      .map((fa, idx) => ({ fa, idx }))
      .filter(item => item.fa.position === pos && item.fa.wage <= wageHeadroom)
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
      // 3. Last resort: graduate an unlisted youth squad member
      const filler = generateEmergencyFillerPlayer(club, pos, usedNames);
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
  transferHistory: TransferRecord[] = []
): {
  newClubs: Club[];
  newOwners: Owner[];
  newManagers: Manager[];
  newFreeAgents: Player[];
  newDirector: Director;
  newSeasonYear: number;
  newTransfers: TransferRecord[];
} {
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

      const agedPlayer = { ...p };
      agedPlayer.age += 1;
      agedPlayer.retiringAtSeasonEnd = false;
      agedPlayer.contractYears = Math.max(0, agedPlayer.contractYears - 1);
      agedPlayer.goals = 0;
      agedPlayer.assists = 0;
      agedPlayer.appearances = 0;
      agedPlayer.cleanSheets = 0;
      agedPlayer.isInjured = false;
      agedPlayer.injuryWeeks = 0;

      // Natural dynamic progression up to 99 max rating
      if (agedPlayer.age <= 24 && agedPlayer.overall < 99) {
        const gain = Math.floor(Math.random() * 3) + 1;
        agedPlayer.overall = Math.min(99, agedPlayer.overall + gain);
        agedPlayer.value = Math.round(agedPlayer.value * 1.25);
      } else if (agedPlayer.age <= 29 && agedPlayer.overall < 99 && Math.random() < 0.45) {
        agedPlayer.overall = Math.min(99, agedPlayer.overall + 1);
        agedPlayer.value = Math.round(agedPlayer.value * 1.15);
      } else if (agedPlayer.age >= 32 && Math.random() < 0.5) {
        agedPlayer.overall = Math.max(45, agedPlayer.overall - Math.floor(Math.random() * 2) - 1);
        agedPlayer.value = Math.round(agedPlayer.value * 0.8);
      }
      agedPlayer.growthMomentum = computeGrowthMomentum(agedPlayer);
      agedNonRetiringSquad.push(agedPlayer);
    });

    // If Coach-led renewals are active for user's club, give the Head Coach a final pass on expiring contracts before free-agency release
    let postRenewalSquad = agedNonRetiringSquad;
    if (isUserClub && delegation?.contractRenewals === 'manager') {
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
      const clubManager = club.managerId ? managers.find(m => m.id === club.managerId) : undefined;
      club.lineup = syncLineupAfterSquadChange(club, clubManager);
    }

    // 4. Youth Academy annual aging & replenishment
    const existingAcademy = club.academy || [];
    const retainedAcademy: AcademyPlayer[] = [];
    existingAcademy.forEach(p => {
      const nextAge = p.age + 1;
      if (nextAge <= 18) {
        const momentumGain = p.momentumTier === 'Generational Prodigy' ? 4 :
                             p.momentumTier === 'High Tempo' ? 3 :
                             p.momentumTier === 'Late Surge' ? 3 : 2;
        const ovrGain = Math.floor(Math.random() * momentumGain) + 1;
        retainedAcademy.push({
          ...p,
          age: nextAge,
          overall: Math.min(99, p.overall + ovrGain),
        });
      } else if (p.overall >= 56 && updatedFreeAgents.length < 130) {
        // Release viable 19yo unpromoted academy graduates into free agency so talent circulates
        const baseWage = getAcademyPromotionWage(club.tier);
        const valMultiplier = club.tier === 1 ? 750000 : club.tier === 2 ? 200000 : 55000;
        updatedFreeAgents.push({
          id: `p_fa_acad_${p.id}`,
          name: p.name,
          nationality: p.nationality,
          age: 19,
          position: p.position,
          roleDetail: p.roleDetail,
          overall: p.overall,
          growthMomentum: p.momentumTier === 'Generational Prodigy' ? 'breakout' : p.momentumTier === 'High Tempo' ? 'rapid' : 'steady',
          value: Math.max(45000, Math.round(p.overall * p.overall * valMultiplier * 0.0025)),
          wage: Math.max(800, Math.round(baseWage * 0.75)),
          contractYears: 0,
          form: 6.5,
          happiness: 72,
          morale: 'content',
          goals: 0,
          assists: 0,
          appearances: 0,
          cleanSheets: 0,
          clubId: null,
        });
      }
    });

    // Ingest new youth cohort (3 to 5 young prospects, ensuring 5-7 active prospects at every club)
    const targetCount = Math.max(3, 6 - retainedAcademy.length);
    const freshIntake = generateYouthIntake(club, summary.seasonYear + 1, targetCount, usedNames);
    club.academy = [...retainedAcademy, ...freshIntake];
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

  // 5. Age Managers
  const updatedManagers = managers.map(m => ({
    ...m,
    age: m.age + 1,
    contractYears: Math.max(0, m.contractYears - 1),
  }));

  // 6. Update Director Record
  const newDirector: Director = {
    ...director,
    yearsInCharge: director.yearsInCharge + 1,
    reputation: Math.max(10, Math.min(100, director.reputation + (
      summary.directorGrade === 'A+' ? 8 :
      summary.directorGrade === 'A' ? 5 :
      summary.directorGrade === 'B' ? 2 :
      summary.directorGrade === 'C' ? -2 :
      summary.directorGrade === 'D' ? -5 : -10
    ))),
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

export function generateYouthIntake(
  club: Club,
  seasonYear: number,
  count = 5,
  usedNames?: Set<string>
): AcademyPlayer[] {
  const prospects: AcademyPlayer[] = [];
  const positions: PlayerPosition[] = ['GK', 'DEF', 'DEF', 'MID', 'MID', 'FWD'];

  for (let i = 0; i < count; i++) {
    const pos = positions[i % positions.length];
    const name = pickUniqueName(usedNames, YOUTH_FIRST_NAMES, YOUTH_LAST_NAMES);
    const age = 15 + Math.floor(Math.random() * 4); // 15 to 18
    const trait = PROSPECT_TRAITS[Math.floor(Math.random() * PROSPECT_TRAITS.length)];
    const roleList = YOUTH_ROLES[pos];
    const roleDetail = roleList[Math.floor(Math.random() * roleList.length)];

    // Overall baseline influenced by club tier and prestige
    const prestigeMod = club.prestige >= 82 ? 2 : club.prestige <= 55 ? -1 : 0;
    const baseOvr = (club.tier === 1 ? 56 : club.tier === 2 ? 51 : 47) + prestigeMod;
    const traitBoost = trait === 'Generational Prodigy' ? 4 : 0;
    const overall = Math.max(45, Math.min(71, baseOvr + traitBoost + Math.floor(Math.random() * 9) - 3));

    // Determine growth momentum tier (replaces pre-determined potential caps)
    let momentumTier: MomentumTier = 'Steady Climber';
    if (trait === 'Generational Prodigy') {
      momentumTier = 'Generational Prodigy';
    } else if (trait === 'Late Bloomer') {
      momentumTier = 'Late Surge';
    } else if (trait === 'Technical Magician' || trait === 'Driven Workhorse') {
      momentumTier = Math.random() > 0.4 ? 'High Tempo' : 'Steady Climber';
    } else {
      const rand = Math.random();
      momentumTier = rand > 0.7 ? 'High Tempo' : rand > 0.3 ? 'Steady Climber' : 'Late Surge';
    }

    const notesList = SCOUT_NOTES[trait];
    const scoutReport = notesList[Math.floor(Math.random() * notesList.length)];

    prospects.push({
      id: `acad_${club.id}_${seasonYear}_${i}_${Math.random().toString(36).substring(2, 7)}`,
      name,
      nationality: pickProspectNationality(club.tier),
      age,
      position: pos,
      roleDetail,
      overall,
      momentumTier,
      trait,
      scoutReport,
      graduatingSeason: seasonYear,
      clubId: club.id,
    });
  }

  return prospects;
}

function buildPromotedPlayerFromProspect(
  prospect: AcademyPlayer,
  club: Club,
  wage: number,
  contractYears: number
): Player {
  const valMultiplier = club.tier === 1 ? 800000 : club.tier === 2 ? 220000 : 60000;
  const value = Math.max(50000, Math.round(prospect.overall * prospect.overall * valMultiplier * 0.003));

  const startingMomentum: GrowthMomentum =
    prospect.momentumTier === 'Generational Prodigy' ? 'breakout' :
    prospect.momentumTier === 'High Tempo' ? 'rapid' : 'steady';

  return {
    id: `p_promoted_${prospect.id}_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`,
    name: prospect.name,
    nationality: prospect.nationality,
    age: prospect.age,
    position: prospect.position,
    roleDetail: prospect.roleDetail,
    overall: prospect.overall,
    growthMomentum: startingMomentum,
    value,
    wage,
    contractYears,
    form: 6.8,
    happiness: 95,
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

export const MAX_USER_ACADEMY_CAPACITY = 12;

export function calculatePoachCompensation(
  prospect: AcademyPlayer,
  sellingClub: Club
): number {
  const base = Math.pow(Math.max(45, prospect.overall) - 40, 2) * 1800;
  const momentumMult =
    prospect.momentumTier === 'Generational Prodigy'
      ? 2.0
      : prospect.momentumTier === 'High Tempo'
        ? 1.4
        : prospect.momentumTier === 'Late Surge'
          ? 1.2
          : 1.0;
  const tierMult = sellingClub.tier === 1 ? 1.4 : sellingClub.tier === 2 ? 1.0 : 0.65;
  const ageMult = prospect.age <= 16 ? 1.15 : 1.0;

  const raw = base * momentumMult * tierMult * ageMult;
  return Math.max(100000, Math.round(raw / 25000) * 25000);
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
  destination,
  wage,
}: {
  prospect: AcademyPlayer;
  sellingClub: Club;
  buyingClub: Club;
  owner?: Owner;
  offeredFee: number;
  destination: 'academy' | 'senior';
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

  if (destination === 'senior' && prospect.age < 17) {
    return {
      ok: false,
      reason: `${prospect.name} is ${prospect.age} and must enter your Youth Academy until age 17.`,
      compensationFee,
      minAcceptableFee,
    };
  }

  if (destination === 'academy' && (buyingClub.academy?.length || 0) >= MAX_USER_ACADEMY_CAPACITY) {
    return {
      ok: false,
      reason: `Your Youth Academy is at maximum capacity (${MAX_USER_ACADEMY_CAPACITY} prospects). Promote or release a scholar first.`,
      compensationFee,
      minAcceptableFee,
    };
  }

  if (destination === 'senior') {
    if (buyingClub.squad.length >= 25) {
      return {
        ok: false,
        reason: `First-team squad is full at 25 players. Sign ${prospect.name} to your Youth Academy or free a senior slot.`,
        compensationFee,
        minAcceptableFee,
      };
    }
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
      reason: `Compensation (£${(offeredFee / 1000000).toFixed(2)}M) exceeds your transfer war chest (£${(buyingClub.transferBudget / 1000000).toFixed(2)}M).`,
      compensationFee,
      minAcceptableFee,
    };
  }

  if (offeredFee > buyingClub.balance) {
    return {
      ok: false,
      reason: `Club cash reserves (£${(buyingClub.balance / 1000000).toFixed(2)}M) cannot cover this compensation fee.`,
      compensationFee,
      minAcceptableFee,
    };
  }

  if (offeredFee < minAcceptableFee) {
    return {
      ok: false,
      reason: `${sellingClub.name} rejected £${(offeredFee / 1000000).toFixed(2)}M. Youth tribunal valuation requires at least £${(minAcceptableFee / 1000000).toFixed(2)}M.`,
      compensationFee,
      minAcceptableFee,
    };
  }

  if (owner?.wealth === 'frugal' && offeredFee > buyingClub.transferBudget * 0.6) {
    return {
      ok: false,
      reason: `BOARD VETO: ${owner.name} blocked spending over 60% of the transfer war chest on a single youth compensation fee.`,
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
  destination,
  wage,
  contractYears,
  seasonYear,
  currentWeek,
}: {
  prospect: AcademyPlayer;
  sellingClub: Club;
  buyingClub: Club;
  clubs: Club[];
  director: Director;
  owner?: Owner;
  manager?: Manager;
  offeredFee: number;
  destination: 'academy' | 'senior';
  wage: number;
  contractYears: number;
  seasonYear: number;
  currentWeek: number;
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
    return { success: false, error: evaluation.reason || 'Unable to complete youth compensation approach.' };
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
        const scholar: AcademyPlayer = {
          ...prospect,
          clubId: buyingClub.id,
          graduatingSeason: seasonYear,
        };
        transferPlayerForRecord = buildPromotedPlayerFromProspect(scholar, buyingClub, 0, 0);
        resultMsg = `POACH COMPLETED: ${prospect.name} (${prospect.position}, Age ${prospect.age}) joined ${buyingClub.name} Youth Academy for £${(offeredFee / 1000000).toFixed(2)}M compensation.`;
        return {
          ...c,
          balance: Math.max(0, c.balance - offeredFee),
          transferBudget: Math.max(0, c.transferBudget - offeredFee),
          academy: [...(c.academy || []), scholar],
        };
      } else {
        const seniorPlayer = buildPromotedPlayerFromProspect(prospect, buyingClub, wage, contractYears);
        transferPlayerForRecord = seniorPlayer;
        resultMsg = `POACH COMPLETED: ${prospect.name} (${prospect.position}, Age ${prospect.age}) signed a ${contractYears}-year senior contract from ${sellingClub.name} Academy for £${(offeredFee / 1000000).toFixed(2)}M compensation.`;
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

  // Fallback assignment in case TS control-flow analysis needs certainty
  const recordPlayer =
    transferPlayerForRecord! ||
    buildPromotedPlayerFromProspect(prospect, buyingClub, destination === 'senior' ? wage : 0, contractYears);

  const record = createTransferRecord(
    recordPlayer,
    'signing',
    sellingClub.id,
    buyingClub.id,
    offeredFee,
    seasonYear,
    currentWeek,
    'director',
    destination === 'academy'
      ? `Youth Academy compensation poach from ${sellingClub.name} (joined Academy)`
      : `Youth Academy compensation poach from ${sellingClub.name} (Senior Contract)`
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
    return { updatedClub: club, newTransfers: [], pressHeadlines: [] };
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
    return { updatedClub: club, newTransfers: [], pressHeadlines: [] };
  }

  if (initialAcademy.length === 0) {
    return { updatedClub: club, newTransfers: [], pressHeadlines: [] };
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

  return {
    updatedClub: workingClub,
    newTransfers,
    pressHeadlines,
  };
}

export function promoteAcademyPlayer(
  club: Club,
  academyPlayerId: string,
  wage: number,
  contractYears: number,
  manager?: Manager,
  options?: { allowWageBudgetOverageFactor?: number }
): { success: true; updatedClub: Club; promotedPlayer: Player } | { success: false; error: string } {
  if (club.squad.length >= 25) {
    return { success: false, error: 'First-team squad is at maximum 25-man roster capacity! Release or transfer a senior player first.' };
  }

  const currentWages = club.squad.reduce((acc, p) => acc + p.wage, 0);
  const effectiveWageBudget = club.wageBudget * (options?.allowWageBudgetOverageFactor ?? 1);
  if (currentWages + wage > effectiveWageBudget) {
    return { success: false, error: `Offered wage (£${(wage / 1000).toFixed(1)}k/wk) exceeds club weekly wage budget headroom!` };
  }

  const academy = club.academy || [];
  const prospect = academy.find(p => p.id === academyPlayerId);
  if (!prospect) {
    return { success: false, error: 'Academy prospect not found.' };
  }

  const valMultiplier = club.tier === 1 ? 800000 : club.tier === 2 ? 220000 : 60000;
  const value = Math.max(50000, Math.round(prospect.overall * prospect.overall * valMultiplier * 0.003));

  const startingMomentum: GrowthMomentum = 
    prospect.momentumTier === 'Generational Prodigy' ? 'breakout' :
    prospect.momentumTier === 'High Tempo' ? 'rapid' : 'steady';

  const promotedPlayer: Player = {
    id: `p_promoted_${prospect.id}_${Date.now()}`,
    name: prospect.name,
    nationality: prospect.nationality,
    age: prospect.age,
    position: prospect.position,
    roleDetail: prospect.roleDetail,
    overall: prospect.overall,
    growthMomentum: startingMomentum,
    value,
    wage,
    contractYears,
    form: 6.8,
    happiness: 95,
    morale: 'ecstatic',
    goals: 0,
    assists: 0,
    appearances: 0,
    cleanSheets: 0,
    clubId: club.id,
  };

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

  if (!player || !sellingClub) return [];

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

    // 3. Financial affordability
    const currentWages = buyer.squad.reduce((sum, p) => sum + p.wage, 0);
    const wageHeadroom = buyer.wageBudget - currentWages;
    if (wageHeadroom < player.wage * 0.85) continue;

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
