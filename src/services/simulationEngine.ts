/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Club, Director, FormationId, Lineup, Manager, MatchResult, Owner, Player, WeeklyDigest, PressHeadline, BoardroomMemo, DelegationMatrix, JobVacancy, SeasonSummary, SeasonAward, LeagueTier, AcademyPlayer, ProspectTrait, PlayerPosition, GrowthMomentum, MomentumTier, MoraleLevel, GameweekRecord, GameweekStandingsEntry, TransferRecord, TransferProposal, IncomingBid, ManagerSigningEvent } from '../types/game';
import { TAKEOVER_CANDIDATES } from '../data/database';
import {
  parseFormation,
  selectStartingXI,
  expireTransferProposals,
  runManagerTransferActivity,
} from './transferService';
import {
  autoPickLineup,
  computeTeamRating,
  extractFormationNumber,
  getDefaultFormation,
  prepareUserLineupForMatch,
  resolveClubLineup,
  syncLineupAfterSquadChange,
} from '../utils/lineup';

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
  const starting11 = selectStartingXI(club, manager, lineup);
  if (starting11.length === 0) return 60;

  const avgOvr = starting11.reduce((acc, p) => acc + (p.effectiveOverall ?? p.overall), 0) / starting11.length;
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
  lineupCache?: Map<string, Lineup>
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
export function processSquadProgression(squad: Player[]): { growthCount: number; declineCount: number } {
  let growthCount = 0;
  let declineCount = 0;

  squad.forEach(p => {
    // 1. Injury recovery ALWAYS runs for every player
    if (p.isInjured) {
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
    c => c.id !== directorClubId && c.transferBudget > 2000000
  );

  for (let i = 0; i < dealsToAttempt; i++) {
    if (aiClubs.length < 2) break;
    const buyer = aiClubs[Math.floor(Math.random() * aiClubs.length)];
    if (!buyer || buyer.transferBudget < 1500000) continue;

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

  const simulateTier = (tierClubIds: string[]) => {
    const pairings = generatePairingsForWeek(tierClubIds, currentWeek);
    pairings.forEach(({ homeId, awayId }) => {
      const homeClub = clubsMap.get(homeId)!;
      const awayClub = clubsMap.get(awayId)!;
      const homeMgr = homeClub.managerId ? managersMap.get(homeClub.managerId) : undefined;
      const awayMgr = awayClub.managerId ? managersMap.get(awayClub.managerId) : undefined;

      const res = simulateMatch(homeClub, awayClub, homeMgr, awayMgr, weeklyLineupCache);
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
    const { growthCount, declineCount } = processSquadProgression(club.squad);
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
  owner?: Owner
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
  };
}

const EMERGENCY_FIRST_NAMES = ['Liam', 'Oliver', 'Harry', 'Jack', 'George', 'Noah', 'Charlie', 'Jacob', 'Alfie', 'Freddie', 'Oscar', 'Leo', 'Logan', 'Archie', 'Theo'];
const EMERGENCY_LAST_NAMES = ['Smith', 'Jones', 'Taylor', 'Brown', 'Williams', 'Wilson', 'Johnson', 'Davies', 'Robinson', 'Wright', 'Thompson', 'Evans', 'Walker', 'White', 'Roberts'];
const ROLES_BY_POS: Record<PlayerPosition, string[]> = {
  GK: ['Sweeper Keeper', 'Shot Stopper', 'Commanding Goalkeeper'],
  DEF: ['Ball-Playing Defender', 'Stopper CB', 'No-Nonsense CB', 'Inverted Fullback', 'Wingback'],
  MID: ['Deep-Lying Playmaker', 'Box to Box', 'Ball-Winning Midfielder', 'Advanced Playmaker'],
  FWD: ['Target Man', 'Pressing Forward', 'Clinical Poacher', 'Inside Forward', 'Pacy Finisher'],
};

function generateEmergencyFillerPlayer(
  club: Club,
  pos: PlayerPosition,
  usedNames: Set<string>
): Player {
  let name = '';
  let attempts = 0;
  while (attempts < 200) {
    const rf = EMERGENCY_FIRST_NAMES[Math.floor(Math.random() * EMERGENCY_FIRST_NAMES.length)];
    const rl = EMERGENCY_LAST_NAMES[Math.floor(Math.random() * EMERGENCY_LAST_NAMES.length)];
    const cand = `${rf} ${rl}`;
    if (!usedNames.has(cand)) {
      name = cand;
      usedNames.add(cand);
      break;
    }
    attempts++;
  }
  if (!name) {
    name = `${EMERGENCY_FIRST_NAMES[Math.floor(Math.random() * EMERGENCY_FIRST_NAMES.length)]} ${EMERGENCY_LAST_NAMES[Math.floor(Math.random() * EMERGENCY_LAST_NAMES.length)]} Jr`;
    usedNames.add(name);
  }

  const baseOvr = club.tier === 1 ? 74 : club.tier === 2 ? 68 : 62;
  const age = 19 + Math.floor(Math.random() * 5);
  const ovr = Math.max(50, Math.min(85, baseOvr - 2 + Math.floor(Math.random() * 5)));
  const roleList = ROLES_BY_POS[pos];
  const role = roleList[Math.floor(Math.random() * roleList.length)];
  const valMultiplier = club.tier === 1 ? 800000 : club.tier === 2 ? 200000 : 50000;
  const val = Math.round(ovr * ovr * valMultiplier * 0.003);
  const wageMultiplier = club.tier === 1 ? 1000 : club.tier === 2 ? 300 : 90;
  const wage = Math.round(ovr * wageMultiplier);

  return {
    id: `p_${club.id}_emg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    name,
    nationality: 'England',
    age,
    position: pos,
    roleDetail: role,
    overall: ovr,
    growthMomentum: 'steady',
    value: val,
    wage,
    contractYears: 2,
    form: 6.8,
    happiness: 75,
    morale: 'content',
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

    // Try finding best free agent for this position within wage budget
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
      club.squad.push(signedPlayer);
    } else {
      // Generate emergency youth filler player
      const filler = generateEmergencyFillerPlayer(club, pos, usedNames);
      club.squad.push(filler);
    }
  }
}

// Transition to next season (Infinite Multi-Season Loop)
export function advanceToNextSeason(
  summary: SeasonSummary,
  clubs: Club[],
  owners: Owner[],
  managers: Manager[],
  freeAgents: Player[],
  director: Director
): {
  newClubs: Club[];
  newOwners: Owner[];
  newManagers: Manager[];
  newFreeAgents: Player[];
  newDirector: Director;
  newSeasonYear: number;
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
  const updatedFreeAgents = freeAgents.map(p => ({ ...p }));

  // Collect all currently used names to avoid duplicate filler names
  const usedNames = new Set<string>();
  updatedClubs.forEach(c => c.squad.forEach(p => usedNames.add(p.name)));
  updatedFreeAgents.forEach(fa => usedNames.add(fa.name));
  managers.forEach(m => usedNames.add(m.name));

  // 1. Process Promotions and Relegations across tiers
  // Relegate PL bottom 3 to Championship (tier 2)
  summary.tier1.relegatedClubs.forEach(rel => {
    const club = updatedClubs.find(c => c.id === rel.id);
    if (club) club.tier = 2;
  });

  // Promote Championship top 3 to Premier League (tier 1)
  summary.tier2.promotedClubs.forEach(prom => {
    const club = updatedClubs.find(c => c.id === prom.id);
    if (club) club.tier = 1;
  });

  // Relegate Championship bottom 3 to League One (tier 3)
  summary.tier2.relegatedClubs.forEach(rel => {
    const club = updatedClubs.find(c => c.id === rel.id);
    if (club) club.tier = 3;
  });

  // Promote League One top 3 to Championship (tier 2)
  summary.tier3.promotedClubs.forEach(prom => {
    const club = updatedClubs.find(c => c.id === prom.id);
    if (club) club.tier = 2;
  });

  // 2. Reset club tables, award TV money and seasonal prize budgets
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

    // Financial injection for new season
    const tvCash = club.tier === 1 ? 85000000 : club.tier === 2 ? 16000000 : 3500000;
    club.balance += tvCash;
    club.transferBudget += Math.round(tvCash * 0.45);

    // 3. Player annual aging & development
    const keptSquad: Player[] = [];
    club.squad.forEach(p => {
      const agedPlayer = { ...p };
      agedPlayer.age += 1;
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
        // Prime age players can still scale to 99
        agedPlayer.overall = Math.min(99, agedPlayer.overall + 1);
        agedPlayer.value = Math.round(agedPlayer.value * 1.15);
      } else if (agedPlayer.age >= 32 && Math.random() < 0.5) {
        agedPlayer.overall = Math.max(45, agedPlayer.overall - Math.floor(Math.random() * 2) - 1);
        agedPlayer.value = Math.round(agedPlayer.value * 0.8);
      }
      agedPlayer.growthMomentum = computeGrowthMomentum(agedPlayer);

      // Expired contracts handling
      if (agedPlayer.contractYears === 0) {
        if (!isUserClub) {
          // AI clubs re-sign expiring players with ~65% chance (higher if >=80 OVR, lower if unhappy)
          let reSignChance = 0.65;
          if (agedPlayer.overall >= 80) reSignChance += 0.20;
          else if (agedPlayer.overall >= 75) reSignChance += 0.10;
          if (agedPlayer.happiness < 60) reSignChance -= 0.25;
          if (agedPlayer.happiness < 45) reSignChance -= 0.20;

          if (Math.random() < reSignChance) {
            agedPlayer.contractYears = Math.floor(Math.random() * 3) + 2; // 2 to 4 years
            keptSquad.push(agedPlayer);
          } else {
            agedPlayer.clubId = null;
            updatedFreeAgents.push(agedPlayer);
          }
        } else {
          // User manages their own club contracts
          agedPlayer.clubId = null;
          updatedFreeAgents.push(agedPlayer);
        }
      } else {
        keptSquad.push(agedPlayer);
      }
    });

    club.squad = keptSquad;

    // Refill AI clubs to minimum squad shape (2 GK, 6 DEF, 6 MID, 4 FWD, 20-25 players)
    if (!isUserClub) {
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
      // Prospects aged 19 leave the youth setup if unpromoted
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
      }
    });

    // Ingest new youth cohort (3 to 5 young prospects)
    const freshIntake = generateYouthIntake(club, summary.seasonYear + 1, Math.max(3, 6 - retainedAcademy.length));
    club.academy = [...retainedAcademy, ...freshIntake];
  });

  // Clean the free agent pool each season: retire players aged 37+ with overall < 70, and drop anyone under 52 OVR
  const cleanedFreeAgents = updatedFreeAgents.filter(fa => {
    if (fa.age >= 37 && fa.overall < 70) return false;
    if (fa.overall < 52) return false;
    return true;
  });

  // 5. Age Managers & Free Agents
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
  };
}

// ================= YOUTH ACADEMY ENGINE =================

const YOUTH_FIRST_NAMES = [
  'Leo', 'Harvey', 'Finley', 'Archie', 'Albie', 'Mason', 'Luca', 'Jude', 'Cole', 'Kobbie',
  'Rico', 'Lewis', 'Ethan', 'Bobby', 'Teddy', 'Isaac', 'Caleb', 'Liam', 'Zack', 'Mateo',
  'Kobe', 'Enzo', 'Kai', 'Felix', 'Jayden', 'Myles', 'Tyler', 'Dexter', 'Rowan', 'Brody',
  'Noah', 'Arthur', 'Oscar', 'Theo', 'Freddie', 'Ronnie', 'Elliott', 'Harrison', 'Ruben'
];

const YOUTH_LAST_NAMES = [
  'Palmer', 'Mainoo', 'Lewis', 'Wharton', 'Bellingham', 'Gray', 'Miley', 'Colwill', 'Quansah', 'Gittens',
  'Hall', 'Anderson', 'Sterling', 'Chambers', 'Davenport', 'Gallagher', 'Carrington', 'Sinclair', 'Beckett', 'Vance',
  'Mercer', 'Keane', 'Brennan', 'Lockwood', 'Kavanagh', 'Huxley', 'Fairchild', 'Redmond', 'Sinclair', 'Thorne',
  'Winter', 'Ashford', 'Cross', 'Barrett', 'Harrington', 'Fletcher', 'Rowe', 'Preston', 'Somerset'
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

export function generateYouthIntake(club: Club, seasonYear: number, count = 5): AcademyPlayer[] {
  const prospects: AcademyPlayer[] = [];
  const positions: PlayerPosition[] = ['GK', 'DEF', 'DEF', 'MID', 'MID', 'FWD'];

  for (let i = 0; i < count; i++) {
    const pos = positions[i % positions.length];
    const fName = YOUTH_FIRST_NAMES[Math.floor(Math.random() * YOUTH_FIRST_NAMES.length)];
    const lName = YOUTH_LAST_NAMES[Math.floor(Math.random() * YOUTH_LAST_NAMES.length)];
    const age = 15 + Math.floor(Math.random() * 4); // 15 to 18
    const trait = PROSPECT_TRAITS[Math.floor(Math.random() * PROSPECT_TRAITS.length)];
    const roleList = YOUTH_ROLES[pos];
    const roleDetail = roleList[Math.floor(Math.random() * roleList.length)];

    // Overall baseline influenced by club tier
    const baseOvr = club.tier === 1 ? 55 : club.tier === 2 ? 50 : 46;
    const overall = Math.max(45, Math.min(68, baseOvr + Math.floor(Math.random() * 9) - 3));

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
      name: `${fName} ${lName}`,
      nationality: Math.random() > 0.35 ? 'England' : Math.random() > 0.5 ? 'Scotland' : Math.random() > 0.5 ? 'Wales' : 'Northern Ireland',
      age,
      position: pos,
      roleDetail,
      overall,
      momentumTier,
      trait,
      scoutReport,
      graduatingSeason: seasonYear,
    });
  }

  return prospects;
}

export function promoteAcademyPlayer(
  club: Club,
  academyPlayerId: string,
  wage: number,
  contractYears: number,
  manager?: Manager
): { success: true; updatedClub: Club; promotedPlayer: Player } | { success: false; error: string } {
  if (club.squad.length >= 25) {
    return { success: false, error: 'First-team squad is at maximum 25-man roster capacity! Release or transfer a senior player first.' };
  }

  const currentWages = club.squad.reduce((acc, p) => acc + p.wage, 0);
  if (currentWages + wage > club.wageBudget) {
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
