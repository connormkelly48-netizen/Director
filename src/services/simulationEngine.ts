/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Club, Director, Manager, MatchResult, Owner, Player, WeeklyDigest, PressHeadline, BoardroomMemo, DelegationMatrix, JobVacancy, TakeoverConsortium, SeasonSummary, SeasonAward, LeagueTier, AcademyPlayer, ProspectTrait, PlayerPosition, GrowthMomentum, MomentumTier } from '../types/game';
import { POTENTIAL_TAKEOVER_BUYERS } from '../data/clubsData';

// Generate weekly round-robin pairings for a list of club IDs
export function generatePairingsForWeek(clubIds: string[], week: number): Array<{ homeId: string; awayId: string }> {
  const n = clubIds.length;
  if (n % 2 !== 0) return [];
  const rounds = (n - 1) * 2;
  // If the week is beyond the double round-robin, all matches have been played
  if (week > rounds) return [];

  const currentRound = (week - 1);
  const isSecondHalf = currentRound >= (n - 1);
  const roundIdx = currentRound % (n - 1);

  const pairings: Array<{ homeId: string; awayId: string }> = [];
  const clubs = [...clubIds];

  // Berger tables round-robin rotation
  for (let i = 0; i < n / 2; i++) {
    const c1 = clubs[i];
    const c2 = clubs[n - 1 - i];
    
    // Rotate home/away
    if ((roundIdx + i) % 2 === 0) {
      pairings.push(isSecondHalf ? { homeId: c2, awayId: c1 } : { homeId: c1, awayId: c2 });
    } else {
      pairings.push(isSecondHalf ? { homeId: c1, awayId: c2 } : { homeId: c2, awayId: c1 });
    }
  }

  return pairings;
}

// Calculate team rating from top 11 available players
export function getTeamMatchRating(club: Club, manager?: Manager): number {
  const available = club.squad.filter(p => !p.isInjured).sort((a, b) => b.overall - a.overall);
  const starting11 = available.slice(0, 11);
  if (starting11.length === 0) return 60;

  const avgOvr = starting11.reduce((acc, p) => acc + p.overall, 0) / starting11.length;
  const mgrBonus = manager ? (manager.reputation / 100) * 4 : 0;
  const trustModifier = manager ? ((manager.trustInDirector - 50) / 100) * 3 : 0;

  return avgOvr + mgrBonus + trustModifier;
}

// Simulate a single football match
export function simulateMatch(
  homeClub: Club,
  awayClub: Club,
  homeManager?: Manager,
  awayManager?: Manager
): MatchResult {
  const homePower = getTeamMatchRating(homeClub, homeManager) + 3.5; // Home advantage
  const awayPower = getTeamMatchRating(awayClub, awayManager);

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

  // Goal events
  const assignScorers = (club: Club, count: number, team: 'home' | 'away') => {
    const forwards = club.squad.filter(p => p.position === 'FWD');
    const midfielders = club.squad.filter(p => p.position === 'MID');
    const defenders = club.squad.filter(p => p.position === 'DEF');

    for (let g = 0; g < count; g++) {
      const min = Math.floor(Math.random() * 88) + 2;
      let scorer: Player | undefined;
      const roll = Math.random();
      if (roll < 0.65 && forwards.length > 0) {
        scorer = forwards[Math.floor(Math.random() * forwards.length)];
      } else if (roll < 0.90 && midfielders.length > 0) {
        scorer = midfielders[Math.floor(Math.random() * midfielders.length)];
      } else if (defenders.length > 0) {
        scorer = defenders[Math.floor(Math.random() * defenders.length)];
      } else {
        scorer = club.squad[0];
      }

      if (scorer) {
        scorer.goals += 1;
        events.push({
          minute: min,
          type: 'goal',
          player: scorer.name,
          team,
        });
      }
    }
  };

  assignScorers(homeClub, homeGoals, 'home');
  assignScorers(awayClub, awayGoals, 'away');

  // Occasional card or injury
  if (Math.random() < 0.3) {
    const targetClub = Math.random() < 0.5 ? homeClub : awayClub;
    const player = targetClub.squad[Math.floor(Math.random() * targetClub.squad.length)];
    if (player) {
      events.push({
        minute: Math.floor(Math.random() * 85) + 5,
        type: 'yellow_card',
        player: player.name,
        team: targetClub.id === homeClub.id ? 'home' : 'away',
      });
    }
  }

  events.sort((a, b) => a.minute - b.minute);

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
// Any player has the opportunity to reach 99 rated provided everything goes well
export function processSquadProgression(squad: Player[]): { growthCount: number; declineCount: number } {
  let growthCount = 0;
  let declineCount = 0;

  squad.forEach(p => {
    // Universal 99 ceiling: no artificial potential cap
    if (p.overall < 99) {
      let growthChance = 0;

      if (p.age <= 23) {
        // High developmental curve for youth: match ratings, appearances, and morale drive rapid jumps
        if (p.form >= 7.0 && p.happiness >= 65) {
          growthChance = 0.35;
        } else if (p.form >= 6.6 && p.happiness >= 60) {
          growthChance = 0.22;
        } else if (p.appearances > 0) {
          growthChance = 0.12;
        }
      } else if (p.age <= 28) {
        // Prime development: regular playing time & stellar form can unlock world-class heights up to 99
        if (p.form >= 7.3 && p.happiness >= 70) {
          growthChance = 0.20;
        } else if (p.form >= 6.9 && p.happiness >= 65) {
          growthChance = 0.12;
        }
      } else {
        // Experienced veterans (29+): exceptional form and match influence can still raise them to 99
        if (p.form >= 7.5 && p.happiness >= 75) {
          growthChance = 0.14;
        }
      }

      if (growthChance > 0 && Math.random() < growthChance) {
        p.overall = Math.min(99, p.overall + 1);
        p.value = Math.round(p.value * 1.15);
        growthCount++;
      }
    }

    // Veteran physical decline - delayed if playing regularly and in high form
    if (p.age >= 32 && p.form < 6.8 && Math.random() < 0.15) {
      if (p.overall > 50) {
        p.overall -= 1;
        p.value = Math.round(p.value * 0.85);
        declineCount++;
      }
    }

    // Update dynamic growth momentum
    p.growthMomentum = computeGrowthMomentum(p);

    // Recover injuries
    if (p.isInjured && p.injuryWeeks) {
      p.injuryWeeks -= 1;
      if (p.injuryWeeks <= 0) {
        p.isInjured = false;
        p.injuryWeeks = 0;
      }
    }
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

// Advance simulation for 1 week across all 3 tiers (68 clubs)
export function advanceSimulationWeek(
  currentWeek: number,
  seasonYear: number,
  clubs: Club[],
  owners: Owner[],
  managers: Manager[],
  director: Director,
  delegation: DelegationMatrix
): {
  updatedClubs: Club[];
  updatedOwners: Owner[];
  updatedManagers: Manager[];
  updatedDirector: Director;
  digest: WeeklyDigest;
} {
  const nextWeek = currentWeek + 1;
  const allResults: MatchResult[] = [];
  let playerMatch: MatchResult | undefined;

  const clubsMap = new Map<string, Club>();
  clubs.forEach(c => clubsMap.set(c.id, { ...c }));

  const ownersMap = new Map<string, Owner>();
  owners.forEach(o => ownersMap.set(o.id, { ...o }));

  const managersMap = new Map<string, Manager>();
  managers.forEach(m => managersMap.set(m.id, { ...m }));

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

      const res = simulateMatch(homeClub, awayClub, homeMgr, awayMgr);
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

  // Process player growth/decline for player club
  if (playerClub) {
    const { growthCount, declineCount } = processSquadProgression(playerClub.squad);
    totalGrowth = growthCount;
    totalDecline = declineCount;
  }

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

  // Create digest
  const pressHeadlines = playerClub && playerOwner 
    ? generatePressHeadlines(updatedDirector, playerClub, playerOwner, playerManager, playerMatch) 
    : [];

  const boardroomMemo = playerClub && playerOwner 
    ? generateBoardroomMemo(updatedDirector, playerClub, playerOwner, playerManager, playerMatch) 
    : {
        author: 'League Executive Board',
        role: 'Official Digest',
        content: `Matchday ${currentWeek} completed across all divisions.`,
        tone: 'neutral' as const,
      };

  const dressingRoomSnippet = playerManager 
    ? `Manager ${playerManager.name} reports squad morale is ${playerManager.trustInDirector > 60 ? 'high and aligned with board targets' : 'strained due to boardroom friction'}.` 
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
  };

  return {
    updatedClubs: Array.from(clubsMap.values()),
    updatedOwners: Array.from(ownersMap.values()),
    updatedManagers: Array.from(managersMap.values()),
    updatedDirector,
    digest,
  };
}

// Check for Dynamic Takeover Rumors & Completed Sales
export function evaluateTakeoverEvents(
  week: number,
  clubs: Club[],
  owners: Owner[],
  director: Director
): { updatedOwners: Owner[]; newsAlert?: string } {
  const updatedOwners = [...owners];
  let newsAlert: string | undefined;

  // 10% chance per 8 weeks for a takeover to materialize for a club with high takeover risk
  if (week % 8 === 0) {
    const vulnerableOwner = updatedOwners.find(o => o.takeoverRisk >= 30 && Math.random() < 0.4);
    if (vulnerableOwner) {
      const consortium = POTENTIAL_TAKEOVER_BUYERS[Math.floor(Math.random() * POTENTIAL_TAKEOVER_BUYERS.length)];
      const club = clubs.find(c => c.ownerId === vulnerableOwner.id);

      if (club) {
        // Replace owner with consortium!
        vulnerableOwner.name = consortium.investorName;
        vulnerableOwner.wealth = consortium.wealth;
        vulnerableOwner.patience = consortium.patience;
        vulnerableOwner.involvement = consortium.involvement;
        vulnerableOwner.recruitmentPhilosophy = consortium.philosophy;
        vulnerableOwner.approval = 75;
        vulnerableOwner.takeoverRisk = 5;
        vulnerableOwner.description = `Newly installed owners: ${consortium.investorType}. They have injected fresh funds and demand adherence to their ${consortium.philosophy} philosophy.`;

        if (club.id === director.currentClubId) {
          newsAlert = `BREAKING: ${consortium.investorName} has completed a full takeover of ${club.name}! The new ownership brings a ${consortium.wealth} investment fund and a strict ${consortium.philosophy.replace('_', ' ')} vision.`;
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
  const updatedClubs = clubs.map(c => ({ ...c, squad: [...c.squad] }));
  const updatedFreeAgents = [...freeAgents];

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
        agedPlayer.overall = Math.max(50, agedPlayer.overall - Math.floor(Math.random() * 2) - 1);
        agedPlayer.value = Math.round(agedPlayer.value * 0.8);
      }
      agedPlayer.growthMomentum = computeGrowthMomentum(agedPlayer);

      // Expired contracts enter free agency
      if (agedPlayer.contractYears === 0) {
        agedPlayer.clubId = null;
        updatedFreeAgents.push(agedPlayer);
      } else {
        keptSquad.push(agedPlayer);
      }
    });

    club.squad = keptSquad;

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
    newFreeAgents: updatedFreeAgents,
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
  contractYears: number
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

  const updatedClub: Club = {
    ...club,
    squad: [...club.squad, promotedPlayer],
    academy: academy.filter(p => p.id !== academyPlayerId),
  };

  return { success: true, updatedClub, promotedPlayer };
}

export function releaseAcademyPlayer(club: Club, academyPlayerId: string): Club {
  const academy = club.academy || [];
  return {
    ...club,
    academy: academy.filter(p => p.id !== academyPlayerId),
  };
}
