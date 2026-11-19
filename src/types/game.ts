/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type LeagueTier = 1 | 2 | 3; // 1 = Premier League, 2 = Championship, 3 = League One

export type PlayerPosition = 'GK' | 'DEF' | 'MID' | 'FWD';

export const POSITION_ORDER: Record<PlayerPosition, number> = {
  GK: 0,
  DEF: 1,
  MID: 2,
  FWD: 3,
};

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
  retiringAtSeasonEnd?: boolean;
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

export type FanExpectation = 
  | 'Avoid Relegation' 
  | 'Mid-Table Safety' 
  | 'Play-off Push' 
  | 'Automatic Promotion' 
  | 'European Qualification' 
  | 'Title Contender';

export interface DatabaseMeta {
  schemaVersion: number;
  game: string;
  startSeason: number;
  notes: string;
}

export interface ClubData {
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
  prestige: number; // 1 - 100
  fanExpectation: FanExpectation;
  ownerId: string;
  managerId: string | null;
  managerVacancyWeeksRemaining?: number;
  managerSacksThisSeason?: number;
}

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
  takeoverSourceId?: string;
  status?: 'current' | 'takeover_candidate';
  investorType?: string;
  rumorWeek?: number;
}

export type TakeoverCandidate = Owner & {
  investorType: 'Sovereign Investment Fund' | 'Tech Venture Capitalist' | 'American Private Equity' | 'Supporters Consortium';
  rumorWeek: number;
};

export type TacticalStyle = 
  | 'High Gegenpress' 
  | 'Tiki-Taka Possession' 
  | 'Direct Counter-Attack' 
  | 'Pragmatic Low Block' 
  | 'Fluid Wing Play';

export type ControlDesire = 'autocrat' | 'collaborator' | 'head_coach';

export interface ManagerAttributes {
  tactical: number; // 1 - 99
  coaching: number; // 1 - 99
  manManagement: number; // 1 - 99
  youthDevelopment: number; // 1 - 99
}

export type ManagerMilestoneType =
  | 'appointed'
  | 'sacked'
  | 'poached'
  | 'league_title'
  | 'promotion'
  | 'relegation'
  | 'wins_milestone'
  | 'matches_milestone';

export interface ManagerHistoryEntry {
  id: string;
  season: number;
  week: number;
  type: ManagerMilestoneType;
  title: string;
  detail: string;
  clubId: string | null;
  clubName: string;
}

export interface ManagerCareerStats {
  matchesManaged: number;
  wins: number;
  draws: number;
  losses: number;
  titlesWon: number;
  promotionsWon: number;
  timesSacked: number;
}

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
  wage: number; // £/week demand
  seasonsAtClub: number; // Full seasons of tenure at current club
  attributes: ManagerAttributes;
  careerStats?: ManagerCareerStats;
  history?: ManagerHistoryEntry[];
  contractYears?: number; // Legacy save compatibility only; managers have no contracts
  clubId: string | null; // null = free agent
  profileSnippet: string;
  leagueLevel?: 1 | 2 | 3;
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
  overall: number; // 40 - 99
  origin?: 'generated' | 'poached';
  growthMomentum?: GrowthMomentum;
  value?: number;
  wage?: number;
  contractYears?: number;
  form?: number;
  happiness?: number;
  morale?: MoraleLevel;
  goals?: number;
  assists?: number;
  appearances?: number;
  cleanSheets?: number;
  momentumTier: MomentumTier;
  trait: ProspectTrait;
  scoutReport: string;
  graduatingSeason: number;
  clubId?: string;
}

export type FormationId =
  | '4-3-3'
  | '4-2-3-1'
  | '4-4-2'
  | '4-4-1-1'
  | '4-2-2-2'
  | '4-1-4-1'
  | '3-5-2'
  | '3-4-3'
  | '3-4-2-1'
  | '5-3-2';

export type SlotRole =
  | 'GK'
  | 'LB'
  | 'RB'
  | 'CB'
  | 'LWB'
  | 'RWB'
  | 'CDM'
  | 'CM'
  | 'CAM'
  | 'LM'
  | 'RM'
  | 'LW'
  | 'RW'
  | 'ST';

export interface Lineup {
  formation: FormationId;
  slots: (string | null)[];
  bench: string[];
  auto: boolean;
}

export interface Club extends ClubData {
  squad: Player[];
  academy?: AcademyPlayer[];
  lineup?: Lineup;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
  form: ('W' | 'D' | 'L')[];
}

export interface DatabaseSchema {
  meta: DatabaseMeta;
  clubs: ClubData[];
  owners: Owner[];
  managers: Manager[];
  players: Player[];
  academy: AcademyPlayer[];
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
  lastPetitionWeek?: number;
  lastPetitionSeason?: number;
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

export interface ManagerSigningEvent {
  player: Player;
  fee: number;
  fromClubName: string;
  managerName: string;
  reason: string;
}

export interface AcademyWireEvent {
  id: string;
  kind: 'promotion' | 'poach' | 'retirement_notice';
  playerName: string;
  position: PlayerPosition;
  age: number;
  overall: number;
  clubName: string;
  fromClubName?: string;
  detail: string;
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
  managerSigning?: ManagerSigningEvent;
  matchFormation?: FormationId;
  matchTeamRating?: number;
  lineupNotices?: string[];
  academyWire?: AcademyWireEvent[];
  delegationNote?: string;
  delegationTrustDelta?: number;
  ownerInterventionNote?: string;
}

export interface PlayerStyleFit {
  score: number;
  label: 'Ideal Fit' | 'Strong Fit' | 'Neutral' | 'Misfit';
  reason: string;
  matchBonus: number;
  formBias: number;
}

export interface OwnerAlignmentResult {
  status: 'aligned' | 'caution' | 'mismatch';
  approvalDelta: number;
  trustDelta: number;
  oneLineExplanation: string;
}

export interface DirectorGradeFactor {
  id: 'league' | 'roi' | 'finances' | 'academy' | 'trust';
  label: string;
  score: number;
  weight: number;
  detail: string;
}

export interface IncomingBid {
  id: string;
  playerId: string;
  playerName: string;
  playerPos: PlayerPosition;
  playerOverall: number;
  playerAge: number;
  askingPrice: number;
  offeredFee: number;
  fromClubId: string; // The user's club (seller)
  buyingClubId: string; // The AI club (buyer)
  buyingClubName: string;
  buyingClubTier: LeagueTier;
  wageOffered: number;
  status: 'pending' | 'accepted' | 'rejected';
  createdWeek: number;
  season: number;
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
  lockReason?: string;
}

export interface SeasonAward {
  tier: LeagueTier;
  tierName: string;
  champion: Club;
  runnerUp: Club;
  promotedClubs: Club[];
  relegatedClubs: Club[];
}

export interface RetirementRecord {
  playerId: string;
  name: string;
  nationality: string;
  age: number;
  position: PlayerPosition;
  overall: number;
  clubId: string | null;
  clubName: string;
  clubShortName?: string;
  clubTier?: LeagueTier;
  appearances: number;
  goals: number;
  assists: number;
  cleanSheets: number;
  isUserClub: boolean;
}

export interface SeasonGraduateHighlight {
  playerId: string;
  playerName: string;
  clubId: string;
  clubName: string;
  clubTier: LeagueTier;
  position: PlayerPosition;
  age: number;
  overall: number;
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
  retirements?: RetirementRecord[];
  totalLeaguePromotions?: number;
  topLeagueGraduates?: SeasonGraduateHighlight[];
  gradeBreakdown?: DirectorGradeFactor[];
  transferRoiDelta?: number;
  netSpendSeason?: number;
  academyPromotionsSeason?: number;
}

export interface GameweekStandingsEntry {
  clubId: string;
  name: string;
  shortName: string;
  primaryColor: string;
  tier: LeagueTier;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
  form: ('W' | 'D' | 'L')[];
}

export interface GameweekRecord {
  week: number;
  seasonYear: number;
  results: MatchResult[];
  standingsSnapshot: Record<string, GameweekStandingsEntry>;
}

export interface TransferRecord {
  id: string;
  season: number; // e.g. 2026
  week: number;
  type: 'signing' | 'sale' | 'release' | 'renewal' | 'promotion';
  playerId: string;
  playerName: string;
  position: PlayerPosition;
  age: number;
  overall: number;
  fromClubId: string | null; // null = free agent or academy
  toClubId: string | null; // null = released
  fee: number; // in £ (severance paid for releases)
  wage: number; // £/week
  contractYears: number;
  initiatedBy: 'director' | 'manager' | 'shared' | 'ai'; // shared = manager proposed and director approved; ai = rival AI club deal
  note?: string;
}

export interface TransferProposal {
  id: string;
  createdWeek: number;
  season: number;
  kind: 'signing' | 'sale';
  playerId: string;
  playerName: string;
  position: PlayerPosition;
  age: number;
  overall: number;
  counterpartyClubId: string | null;
  fee: number;
  wage: number;
  contractYears: number;
  reason: string;
  status: 'pending' | 'approved' | 'rejected' | 'expired';
  expiresWeek: number;
}

export type GameMode = 'director' | 'manager';

export type DirectorPersonality = 'hands_off' | 'collaborative' | 'independent' | 'dictator';

export interface ClubDirector {
  id: string;
  clubId: string;
  name: string;
  nationality: string;
  age: number;
  personality: DirectorPersonality;
  philosophy: RecruitmentPhilosophy;
  signingBias: 'youth' | 'prime' | 'value' | 'stars';
}

export interface ManagerModeProfile {
  id: string;
  name: string;
  nationality: string;
  age: number;
  startingAge: number;
  tacticalStyle: TacticalStyle;
  preferredFormation: FormationId;
  reputation: number; // 0 - 100
  trophiesWon: string[];
  wins: number;
  draws: number;
  losses: number;
  seasonsManaged: number;
  careerSackings: number;
}

export interface ManagerJobOffer {
  id: string;
  clubId: string;
  clubName: string;
  clubTier: LeagueTier;
  clubPrestige: number;
  primaryColor: string;
  expectation: string;
  patience: Owner['patience'];
  directorName: string;
  directorPersonality: DirectorPersonality;
  effectiveControl: number;
  transferBudget: number;
  wageBudget: number;
  squadSize: number;
  leaguePosition: number;
  offeredContractYears?: number;
  offeredWeeklyWage?: number;
  reason: string;
  isEmergencyOffer?: boolean;
}

export interface ManagerSeasonTableRow {
  clubId: string;
  name: string;
  shortName: string;
  primaryColor: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
}

export interface ManagerKeyResult {
  week: number;
  opponentName: string;
  opponentId: string;
  isHome: boolean;
  goalsFor: number;
  goalsAgainst: number;
  outcome: 'W' | 'D' | 'L';
  label: string;
}

export interface ManagerSeasonReview {
  finalTable: ManagerSeasonTableRow[];
  keyResults: ManagerKeyResult[];
  topScorer: {
    name: string;
    position: PlayerPosition;
    goals: number;
    assists: number;
    appearances: number;
  } | null;
  bestMoment: string;
  worstMoment: string;
  directorTransfers: TransferRecord[];
  reputationBefore: number;
  reputationAfter: number;
  reputationDelta: number;
  reputationReasons: string[];
  boardVerdict: string;
}

export interface ManagerSeasonRecord {
  seasonYear: number;
  age: number;
  clubId: string;
  clubName: string;
  clubShortName: string;
  clubTier: LeagueTier;
  primaryColor: string;
  leaguePosition: number;
  totalTeams: number;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  leaguePoints: number;
  trophiesWon: string[];
  wasSacked: boolean;
  review: ManagerSeasonReview;
}

export type ManagerPlayerRequestKind = 'sale' | 'renewal';
export type ManagerPlayerRequestStatus = 'pending' | 'accepted' | 'ignored';

export interface ManagerPlayerRequest {
  id: string;
  playerId: string;
  playerName: string;
  kind: ManagerPlayerRequestKind;
  status: ManagerPlayerRequestStatus;
  seasonYear: number;
  windowKey: string;
  week: number;
  message: string;
}

export type DirectorRequestType =
  | 'more_power'
  | 'less_power'
  | 'pay_rise'
  | 'new_contract'
  | 'transfer_budget'
  | 'public_backing'
  | 'mutual_termination';

export type DirectorRequestStatus =
  | 'accepted'
  | 'rejected'
  | 'counter_offer'
  | 'counter_accepted'
  | 'counter_declined';

export interface DirectorRequestRecord {
  id: string;
  type: DirectorRequestType;
  status: DirectorRequestStatus;
  seasonYear: number;
  week: number;
  message: string;
}

export interface DirectorCounterOffer {
  requestId: string;
  requestType: 'pay_rise' | 'new_contract';
  proposedWeeklyWage: number;
  proposedContractYears: number;
  message: string;
  seasonYear: number;
  week: number;
}

export interface ManagerContractRenewalOffer {
  offered: boolean;
  contractYears: number;
  weeklyWage: number;
  reason: string;
}

export interface ManagerCareerState {
  profile: ManagerModeProfile;
  currentClubId: string | null;
  contractYears: number; // Fixed 1-5 year contract while employed, 0 when free agent
  weeklyWage: number; // £/week while employed, 0 when free agent
  boardTrust: number;
  fanApproval: number;
  previousSeasonFinish: {
    clubId: string;
    tier: LeagueTier;
    position: number;
  } | null;
  clubDirectors: Record<string, ClubDirector>;
  seasonHistory: ManagerSeasonRecord[];
  activeOffers: ManagerJobOffer[];
  playerRequests?: ManagerPlayerRequest[];
  controlModifier?: number;
  directorReceptivityPenalty?: number;
  directorRequestCooldowns?: Partial<Record<DirectorRequestType, number>>;
  directorRequestHistory?: DirectorRequestRecord[];
  pendingDirectorCounterOffer?: DirectorCounterOffer | null;
  publicBackingWeeksRemaining?: number;
  sackedBanner?: {
    clubId: string;
    clubName: string;
    reason: string;
    week: number;
    compensation?: number;
  } | null;
  pendingSeasonEnd?: {
    summary: SeasonSummary;
    record: ManagerSeasonRecord;
    offers: ManagerJobOffer[];
    mortalityTriggered: boolean;
    mortalityChance: number;
    contractExpired?: boolean;
    renewalOffer?: ManagerContractRenewalOffer;
  } | null;
  isRetired: boolean;
  retirementCause?: 'voluntary' | 'age_mortality';
  retiredYear?: number;
}

export interface GameState {
  saveVersion: number;
  gameMode?: GameMode;
  clubs: Club[];
  owners: Owner[];
  managers: Manager[];
  freeAgents: Player[];
  director: Director | null;
  managerCareer?: ManagerCareerState | null;
  currentWeek: number;
  seasonYear: number;
  gameweekHistory: GameweekRecord[];
  delegation: DelegationMatrix;
  transferHistory: TransferRecord[];
  transferProposals?: TransferProposal[];
  incomingBids?: IncomingBid[];
}
