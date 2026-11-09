/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type LeagueTier = 1 | 2 | 3; // 1 = Premier League, 2 = Championship, 3 = League One

export type PlayerPosition = 'GK' | 'DEF' | 'MID' | 'FWD';

export type MoraleLevel = 'ecstatic' | 'happy' | 'content' | 'unhappy' | 'furious';

export type GrowthMomentum = 'breakout' | 'rapid' | 'steady' | 'prime' | 'cooling';

export interface Player {
  id: string;
  name: string;
  nationality: string;
  age: number;
  position: PlayerPosition;
  roleDetail: string;
  overall: number; // 40 - 99 (Universal ceiling)
  growthMomentum?: GrowthMomentum;
  value: number; // In £
  wage: number; // In £/week
  contractYears: number;
  form: number; // 1.0 - 10.0
  happiness: number; // 0 - 100
  morale: MoraleLevel;
  goals: number;
  assists: number;
  appearances: number;
  cleanSheets: number;
  clubId: string | null; // null for free agents
  isInjured?: boolean;
  injuryWeeks?: number;
}

export type OwnerWealth = 'frugal' | 'moderate' | 'wealthy' | 'oligarch';
export type OwnerPatience = 'volatile' | 'impatient' | 'balanced' | 'patient';
export type OwnerInvolvement = 'hands_off' | 'collaborative' | 'micromanager';
export type RecruitmentPhilosophy = 
  | 'youth_development' 
  | 'marquee_stars' 
  | 'moneyball_data' 
  | 'domestic_grit' 
  | 'trophies_now';

export interface Owner {
  id: string;
  name: string;
  nationality: string;
  wealth: OwnerWealth;
  patience: OwnerPatience;
  involvement: OwnerInvolvement;
  recruitmentPhilosophy: RecruitmentPhilosophy;
  approval: number; // 0 - 100
  takeoverRisk: number; // 0 - 100
  demandedTargets?: string[];
  description: string;
}

export type TacticalStyle = 
  | 'High Gegenpress' 
  | 'Tiki-Taka Possession' 
  | 'Direct Counter-Attack' 
  | 'Pragmatic Low Block' 
  | 'Fluid Wing Play';

export type ControlDesire = 'autocrat' | 'collaborator' | 'head_coach';

export interface Manager {
  id: string;
  name: string;
  nationality: string;
  age: number;
  tacticalStyle: TacticalStyle;
  preferredFormation: string;
  controlDesire: ControlDesire;
  reputation: number; // 1 - 100
  trustInDirector: number; // 0 - 100
  wage: number; // £/week
  contractYears: number;
  clubId: string | null; // null = free agent
  profileSnippet: string;
}

export type ProspectTrait = 
  | 'Generational Prodigy'
  | 'Driven Workhorse'
  | 'Raw Diamond'
  | 'Technical Magician'
  | 'Natural Leader'
  | 'Late Bloomer'
  | 'Relentless Engine';

export type MomentumTier = 'Generational Prodigy' | 'High Tempo' | 'Steady Climber' | 'Late Surge';

export interface AcademyPlayer {
  id: string;
  name: string;
  nationality: string;
  age: number; // 15 - 18
  position: PlayerPosition;
  roleDetail: string;
  overall: number; // 46 - 72
  momentumTier: MomentumTier;
  trait: ProspectTrait;
  scoutReport: string;
  graduatingSeason: number;
}

export interface Club {
  id: string;
  name: string;
  shortName: string;
  tier: LeagueTier;
  primaryColor: string;
  secondaryColor: string;
  stadium: string;
  capacity: number;
  balance: number; // In £
  transferBudget: number; // In £
  wageBudget: number; // In £/week
  ownerId: string;
  managerId: string | null;
  squad: Player[];
  academy?: AcademyPlayer[];
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
  form: ('W' | 'D' | 'L')[];
  prestige: number; // 1 - 100
  fanExpectation: 'Avoid Relegation' | 'Mid-Table Safety' | 'Play-off Push' | 'Automatic Promotion' | 'European Qualification' | 'Title Contender';
}

export interface DelegationMatrix {
  transferSignings: 'director' | 'shared' | 'manager';
  transferSales: 'director' | 'shared' | 'manager';
  contractRenewals: 'director' | 'manager';
  youthPromotion: 'director' | 'manager';
  tacticalStyle: 'director_mandated' | 'manager_freedom';
}

export type DirectorPhilosophy = 
  | 'Moneyball Data' 
  | 'Galactico Star Power' 
  | 'Academy First' 
  | 'High-Press Purist' 
  | 'Pragmatic Veteran Balance';

export interface Director {
  name: string;
  age: number;
  nationality: string;
  favouriteClubId: string;
  currentClubId: string | null; // null if unemployed
  philosophy: DirectorPhilosophy;
  reputation: number; // 1 - 100
  yearsInCharge: number;
  trophiesWon: string[];
  boardTrust: number; // 0 - 100
  fanApproval: number; // 0 - 100
  contractYears: number;
  salary: number; // In £/week
  netSpend: number;
}

export interface MatchEvent {
  minute: number;
  type: 'goal' | 'yellow_card' | 'red_card' | 'injury';
  player: string;
  team: 'home' | 'away';
}

export interface MatchResult {
  homeClubId: string;
  awayClubId: string;
  homeScore: number;
  awayScore: number;
  events: MatchEvent[];
}

export interface PressHeadline {
  title: string;
  source: string;
  category: 'match' | 'transfer' | 'boardroom' | 'crisis' | 'fan_reaction';
  sentiment: 'positive' | 'neutral' | 'negative';
}

export interface BoardroomMemo {
  author: string;
  role: string;
  content: string;
  tone: 'praising' | 'neutral' | 'warning' | 'ultimatum';
  impactExplanation?: string;
}

export interface WeeklyDigest {
  week: number;
  seasonYear: number;
  playerMatch?: MatchResult;
  allResults: MatchResult[];
  pressHeadlines: PressHeadline[];
  boardroomMemo: BoardroomMemo;
  dressingRoomSnippet: string;
  playerGrowthCount: number;
  playerDeclineCount: number;
}

export interface TransferOffer {
  id: string;
  playerId: string;
  playerName: string;
  playerPos: PlayerPosition;
  playerOverall: number;
  fromClubId: string;
  toClubId: string;
  fee: number;
  offeredWage: number;
  contractYears: number;
  status: 'pending' | 'accepted' | 'rejected' | 'vetoed_by_owner' | 'vetoed_by_manager';
  vetoReason?: string;
}

export interface TakeoverConsortium {
  clubId: string;
  investorName: string;
  investorType: 'Sovereign Investment Fund' | 'Tech Venture Capitalist' | 'American Private Equity' | 'Supporters Consortium';
  wealth: OwnerWealth;
  patience: OwnerPatience;
  involvement: OwnerInvolvement;
  philosophy: RecruitmentPhilosophy;
  rumorWeek: number;
}

export interface JobVacancy {
  clubId: string;
  clubName: string;
  tier: LeagueTier;
  wageBudget: number;
  transferBudget: number;
  expectation: string;
  ownerName: string;
  ownerPatience: OwnerPatience;
  reputationRequired: number;
}

export interface SeasonAward {
  tier: LeagueTier;
  tierName: string;
  champion: Club;
  runnerUp: Club;
  promotedClubs: Club[];
  relegatedClubs: Club[];
}

export interface SeasonSummary {
  seasonYear: number;
  tier1: SeasonAward;
  tier2: SeasonAward;
  tier3: SeasonAward;
  playerClubFinalPosition: number;
  playerClubTier: LeagueTier;
  playerClubWonTrophy?: string;
  isPromoted: boolean;
  isRelegated: boolean;
  directorGrade: 'A+' | 'A' | 'B' | 'C' | 'D' | 'F';
  ownerEvaluation: string;
  prizeMoney: number;
  tvRevenue: number;
  graduatingProspects?: AcademyPlayer[];
}
