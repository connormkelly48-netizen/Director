/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  AcademyPlayer,
  Club,
  Director,
  DirectorRequestStatus,
  DirectorRequestType,
  DelegationMatrix,
  GameMode,
  Manager,
  ManagerCareerState,
  ManagerJobOffer,
  ManagerPlayerRequest,
  ManagerPlayerRequestKind,
  ManagerSeasonRecord,
  Owner,
  Player,
  TacticalStyle,
  WeeklyDigest,
  SeasonSummary,
  GameweekRecord,
  LeagueTier,
  TransferRecord,
  TransferProposal,
  IncomingBid,
  Lineup,
} from './types/game';
import { loadDatabase } from './data/database';
import { advanceSimulationWeek, evaluateTakeoverEvents, evaluateOwnerSackDecision, generateJobVacancies, calculateSeasonSummary, advanceToNextSeason, MAX_USER_ACADEMY_CAPACITY, normalizeAcademyPlayer, offerPlayerToClubs, acceptIncomingBid, createTransferRecord, replenishClubAcademy, sellAcademyPlayer } from './services/simulationEngine';
import { capTransferHistory, completeSigning, completeSale, evaluateSigning, getTransferWindowLabel, isTransferWindowOpen, verifyManagerDeal } from './services/transferService';
import { deriveManagerAttributes, getManagerCareerStats } from './services/managerService';
import { getOrCreateClubDirector } from './services/directorPersonalityService';
import {
  acceptManagerJobOffer,
  calculateEffectiveControl,
  calculateManagerSackingCompensation,
  convertManagerCareerToDirectorMode,
  createManagerCareer,
  evaluateDirectorRequest,
  evaluateManagerContractExpiryRenewal,
  evaluateManagerMidSeasonSacking,
  evaluateManagerRenewalRequest,
  evaluateManagerSaleRequest,
  evaluateManagerTransferRequest,
  extractSeasonReviewSnapshot,
  generateManagerJobOffers,
  getManagerRequestWindowKey,
  normalizeManagerCareerState,
  respondToDirectorCounterOffer,
  rollAgeMortality,
  styleToDefaultFormation,
  TargetRequestOutcome,
  toEngineDirectorAdapter,
  toSimulationManagerAdapter,
} from './services/managerModeService';
import { autoPickLineup, getDefaultFormation, syncLineupAfterSquadChange } from './utils/lineup';
import { Header } from './components/Header';
import { CharacterCreationModal } from './components/CharacterCreationModal';
import { ManagerSetupModal } from './components/ManagerSetupModal';
import { ManagerOffersModal } from './components/ManagerOffersModal';
import { ManagerSeasonReviewModal } from './components/ManagerSeasonReviewModal';
import { ManagerRetirementView } from './components/ManagerRetirementView';
import { DashboardView } from './components/DashboardView';
import { BoardroomView } from './components/BoardroomView';
import { DirectorView } from './components/DirectorView';
import { ResponsibilitiesView } from './components/ResponsibilitiesView';
import { ManagerView } from './components/ManagerView';
import { SquadView } from './components/SquadView';
import { YouthAcademyView } from './components/YouthAcademyView';
import { TransfersView } from './components/TransfersView';
import { JobMarketView } from './components/JobMarketView';
import { SeasonFinaleModal } from './components/SeasonFinaleModal';
import { WeeklyDigestModal } from './components/WeeklyDigestModal';
import { SackedModal } from './components/SackedModal';
import { MainMenu } from './components/MainMenu';
import { sounds } from './services/soundEffects';
import { ErrorBoundary } from './components/ui/ErrorBoundary';
import { PWAStatusToast } from './components/PWAStatusToast';
import { CURRENT_SAVE_VERSION, SAVE_STORAGE_KEY, validateSaveJson } from './utils/saveValidation';
import { MANAGER_MODE_CONFIG } from './config/managerModeConfig';

const STORAGE_KEY = SAVE_STORAGE_KEY;

const DEFAULT_DELEGATION: DelegationMatrix = {
  transferSignings: 'director',
  transferSales: 'director',
  contractRenewals: 'director',
  youthPromotion: 'director',
  tacticalStyle: 'manager_freedom',
};

function normalizeDelegation(raw?: Partial<DelegationMatrix>): DelegationMatrix {
  return {
    transferSignings: raw?.transferSignings ?? DEFAULT_DELEGATION.transferSignings,
    transferSales: raw?.transferSales ?? DEFAULT_DELEGATION.transferSales,
    contractRenewals: raw?.contractRenewals ?? DEFAULT_DELEGATION.contractRenewals,
    youthPromotion: raw?.youthPromotion ?? DEFAULT_DELEGATION.youthPromotion,
    tacticalStyle: raw?.tacticalStyle ?? DEFAULT_DELEGATION.tacticalStyle,
  };
}

// Migrate individual player records from older saves or missing fields
function migratePlayerData(p: Partial<Player>): Player {
  return {
    id: p.id || `p_legacy_${Math.random().toString(36).substring(2, 7)}`,
    name: p.name || 'Unknown Player',
    nationality: p.nationality || 'England',
    age: typeof p.age === 'number' ? p.age : 24,
    position: p.position || 'MID',
    roleDetail: p.roleDetail || 'Squad Player',
    overall: typeof p.overall === 'number' ? p.overall : 70,
    growthMomentum: p.growthMomentum || 'steady',
    value: typeof p.value === 'number' ? p.value : 1000000,
    wage: typeof p.wage === 'number' ? p.wage : 10000,
    contractYears: typeof p.contractYears === 'number' ? p.contractYears : 2,
    form: typeof p.form === 'number' ? p.form : 6.8,
    happiness: typeof p.happiness === 'number' ? p.happiness : 75,
    morale: p.morale || 'content',
    goals: typeof p.goals === 'number' ? p.goals : 0,
    assists: typeof p.assists === 'number' ? p.assists : 0,
    appearances: typeof p.appearances === 'number' ? p.appearances : 0,
    cleanSheets: typeof p.cleanSheets === 'number' ? p.cleanSheets : 0,
    clubId: p.clubId !== undefined ? p.clubId : null,
    isInjured: Boolean(p.isInjured),
    injuryWeeks: typeof p.injuryWeeks === 'number' ? p.injuryWeeks : 0,
    ...(p.retiringAtSeasonEnd ? { retiringAtSeasonEnd: true } : {}),
  };
}

function migrateTransferRecord(tr: Partial<TransferRecord>): TransferRecord {
  return {
    id: tr.id || `tr_legacy_${Math.random().toString(36).substring(2, 7)}`,
    season: typeof tr.season === 'number' ? tr.season : 2026,
    week: typeof tr.week === 'number' ? tr.week : 1,
    type: tr.type || 'signing',
    playerId: tr.playerId || 'unknown_player',
    playerName: tr.playerName || 'Unknown Player',
    position: tr.position || 'MID',
    age: typeof tr.age === 'number' ? tr.age : 24,
    overall: typeof tr.overall === 'number' ? tr.overall : 70,
    fromClubId: tr.fromClubId !== undefined ? tr.fromClubId : null,
    toClubId: tr.toClubId !== undefined ? tr.toClubId : null,
    fee: typeof tr.fee === 'number' ? tr.fee : 0,
    wage: typeof tr.wage === 'number' ? tr.wage : 15000,
    contractYears: typeof tr.contractYears === 'number' ? tr.contractYears : 3,
    initiatedBy: tr.initiatedBy || 'director',
    note: tr.note,
  };
}

function migrateManagerData(m: Partial<Manager>): Manager {
  const tacticalStyle = m.tacticalStyle || 'Tiki-Taka Possession';
  const controlDesire = m.controlDesire || 'collaborator';
  const reputation = typeof m.reputation === 'number' ? m.reputation : 60;
  const id = m.id || `mgr_legacy_${Math.random().toString(36).substring(2, 7)}`;

  const baseAttributes = m.attributes &&
    typeof m.attributes.tactical === 'number' &&
    typeof m.attributes.coaching === 'number' &&
    typeof m.attributes.manManagement === 'number' &&
    typeof m.attributes.youthDevelopment === 'number'
    ? m.attributes
    : deriveManagerAttributes({ id, reputation, tacticalStyle, controlDesire });

  return {
    id,
    name: m.name || 'Unknown Manager',
    nationality: m.nationality || 'England',
    age: typeof m.age === 'number' ? m.age : 45,
    tacticalStyle,
    preferredFormation: m.preferredFormation || '4-3-3',
    controlDesire,
    reputation,
    trustInDirector: typeof m.trustInDirector === 'number' ? m.trustInDirector : 70,
    wage: typeof m.wage === 'number' ? m.wage : 20000,
    seasonsAtClub: typeof m.seasonsAtClub === 'number' ? m.seasonsAtClub : 0,
    attributes: baseAttributes,
    clubId: m.clubId !== undefined ? m.clubId : null,
    profileSnippet: m.profileSnippet || 'Experienced tactician.',
    careerStats: getManagerCareerStats(m as Manager),
    history: Array.isArray(m.history) ? m.history : [],
    ...(m.leagueLevel ? { leagueLevel: m.leagueLevel } : {}),
  };
}

// Migrate club records and hydrate squad/academy
// Strictly preserves club tier from database.json (Tier 1 = PL, Tier 2 = Championship, Tier 3 = League One)
function migrateClubData(c: Partial<Club>, year: number, dbClubs: Club[] = []): Club {
  const dbClub = dbClubs.find(dbC => dbC.id === c.id);
  // Tier must strictly come from database.json unless a future season completed promotions/relegations
  const canonicalTier = (dbClub ? dbClub.tier : (c.tier && [1, 2, 3].includes(c.tier) ? c.tier : 1)) as LeagueTier;
  const squad = Array.isArray(c.squad) ? c.squad.map(migratePlayerData) : [];
  const club: Club = {
    id: c.id || dbClub?.id || 'unknown_club',
    name: dbClub ? dbClub.name : (c.name || 'Club'),
    shortName: dbClub ? dbClub.shortName : (c.shortName || 'CLB'),
    tier: canonicalTier,
    primaryColor: dbClub ? dbClub.primaryColor : (c.primaryColor || '#1e293b'),
    secondaryColor: dbClub ? dbClub.secondaryColor : (c.secondaryColor || '#ffffff'),
    stadium: dbClub ? dbClub.stadium : (c.stadium || 'Home Ground'),
    capacity: dbClub ? dbClub.capacity : (c.capacity || 25000),
    balance: typeof c.balance === 'number' ? c.balance : (dbClub?.balance ?? 10000000),
    transferBudget: typeof c.transferBudget === 'number' ? c.transferBudget : (dbClub?.transferBudget ?? 5000000),
    wageBudget: typeof c.wageBudget === 'number' ? c.wageBudget : (dbClub?.wageBudget ?? 500000),
    ownerId: dbClub ? dbClub.ownerId : (c.ownerId || ''),
    managerId: c.managerId !== undefined ? c.managerId : (dbClub?.managerId ?? null),
    ...(typeof c.managerVacancyWeeksRemaining === 'number'
      ? { managerVacancyWeeksRemaining: c.managerVacancyWeeksRemaining }
      : {}),
    ...(typeof c.managerSacksThisSeason === 'number'
      ? { managerSacksThisSeason: c.managerSacksThisSeason }
      : {}),
    squad,
    academy: c.academy,
    ...(c.lineup ? { lineup: c.lineup } : {}),
    played: typeof c.played === 'number' ? c.played : 0,
    won: typeof c.won === 'number' ? c.won : 0,
    drawn: typeof c.drawn === 'number' ? c.drawn : 0,
    lost: typeof c.lost === 'number' ? c.lost : 0,
    goalsFor: typeof c.goalsFor === 'number' ? c.goalsFor : 0,
    goalsAgainst: typeof c.goalsAgainst === 'number' ? c.goalsAgainst : 0,
    goalDifference: typeof c.goalDifference === 'number' ? c.goalDifference : 0,
    points: typeof c.points === 'number' ? c.points : 0,
    form: Array.isArray(c.form) ? c.form : [],
    prestige: dbClub ? dbClub.prestige : (c.prestige || 70),
    fanExpectation: dbClub ? dbClub.fanExpectation : (c.fanExpectation || 'Mid-Table Safety'),
  };

  if (!Array.isArray(c.academy) || c.academy.length === 0) {
    club.academy = replenishClubAcademy(club, year);
  } else {
    club.academy = c.academy
      .map(a => normalizeAcademyPlayer(a, club))
      .slice(0, MAX_USER_ACADEMY_CAPACITY);
  }
  return club;
}

export default function App() {
  const [isInitialized, setIsInitialized] = useState(false);
  const [inMainMenu, setInMainMenu] = useState(true);
  const [gameMode, setGameMode] = useState<GameMode>('director');
  const [isCreatingCareer, setIsCreatingCareer] = useState(false);
  const [isCreatingManagerCareer, setIsCreatingManagerCareer] = useState(false);
  const [clubs, setClubs] = useState<Club[]>([]);
  const [owners, setOwners] = useState<Owner[]>([]);
  const [managers, setManagers] = useState<Manager[]>([]);
  const [freeAgents, setFreeAgents] = useState<Player[]>([]);
  const [director, setDirector] = useState<Director | null>(null);
  const [managerCareer, setManagerCareer] = useState<ManagerCareerState | null>(null);
  const [currentWeek, setCurrentWeek] = useState(1);
  const [seasonYear, setSeasonYear] = useState(2026);
  const [currentTab, setCurrentTab] = useState('dashboard');
  const [weeklyDigest, setWeeklyDigest] = useState<WeeklyDigest | null>(null);
  const [gameweekHistory, setGameweekHistory] = useState<GameweekRecord[]>([]);
  const [transferHistory, setTransferHistory] = useState<TransferRecord[]>([]);
  const [transferProposals, setTransferProposals] = useState<TransferProposal[]>([]);
  const [incomingBids, setIncomingBids] = useState<IncomingBid[]>([]);
  const [isSimulating, setIsSimulating] = useState(false);
  const [isSacked, setIsSacked] = useState(false);
  const [sackReason, setSackReason] = useState<string | null>(null);
  const [newsAlert, setNewsAlert] = useState<string | null>(null);
  const [seasonSummary, setSeasonSummary] = useState<SeasonSummary | null>(null);
  const [managerSeasonSummary, setManagerSeasonSummary] = useState<SeasonSummary | null>(null);
  const [showUnemployedModal, setShowUnemployedModal] = useState(false);
  const [reviewingSeasonRecord, setReviewingSeasonRecord] = useState<ManagerSeasonRecord | null>(null);
  const [storageWarning, setStorageWarning] = useState<string | null>(null);

  const [delegation, setDelegation] = useState<DelegationMatrix>(DEFAULT_DELEGATION);

  const debounceTimerRef = useRef<number | null>(null);
  const wasSimulatingRef = useRef(false);
  const immediateSaveOnNextCommitRef = useRef(false);

  // Load from local storage or generate fresh database directly from database.json
  useEffect(() => {
    try {
      void navigator.storage?.persist?.();
    } catch {
      // Ignore storage persistence errors on unsupported browsers
    }

    localStorage.removeItem('the_boardroom_save_v1');

    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const data = JSON.parse(saved);

        // Old saves are incompatible: accept saveVersion 2 (migrated) and CURRENT_SAVE_VERSION
        if (!data || (data.saveVersion !== 2 && data.saveVersion !== CURRENT_SAVE_VERSION)) {
          localStorage.removeItem(STORAGE_KEY);
          const { clubs: initClubs, owners: initOwners, managers: initManagers, freeAgents: initFA } = loadDatabase();
          setClubs(initClubs);
          setOwners(initOwners);
          setManagers(initManagers);
          setFreeAgents(initFA);
          setGameweekHistory([]);
          setTransferHistory([]);
          setTransferProposals([]);
          setIncomingBids([]);
          setIsInitialized(true);
          return;
        }

        const rawClubs: Club[] = data.clubs || [];
        const rawManagers: Manager[] = Array.isArray(data.managers)
          ? (data.managers as Partial<Manager>[]).map(migrateManagerData)
          : [];
        const year = data.seasonYear || 2026;
        const dbData = loadDatabase();
        const hydratedClubs = rawClubs.map(c => migrateClubData(c, year, dbData.clubs));
        const migratedFreeAgents = Array.isArray(data.freeAgents)
          ? data.freeAgents.map(migratePlayerData)
          : [];
        const migratedHistory = Array.isArray(data.transferHistory)
          ? capTransferHistory(data.transferHistory.map(migrateTransferRecord))
          : [];

        const savedMode: GameMode =
          data.gameMode === 'manager' && data.managerCareer ? 'manager' : 'director';

        const rawCareer =
          savedMode === 'manager' ? (data.managerCareer as ManagerCareerState) : null;
        setGameMode(savedMode);
        setManagerCareer(rawCareer ? normalizeManagerCareerState(rawCareer, hydratedClubs) : null);
        setClubs(hydratedClubs);
        setOwners(data.owners || []);
        setManagers(rawManagers);
        setFreeAgents(migratedFreeAgents);
        setDirector(data.director || null);
        setCurrentWeek(data.currentWeek || 1);
        setSeasonYear(year);
        setGameweekHistory(Array.isArray(data.gameweekHistory) ? data.gameweekHistory : []);
        setTransferHistory(migratedHistory);
        setTransferProposals(Array.isArray(data.transferProposals) ? data.transferProposals : []);
        setIncomingBids(Array.isArray(data.incomingBids) ? data.incomingBids : []);
        setDelegation(normalizeDelegation(data.delegation));
      } else {
        const { clubs: initClubs, owners: initOwners, managers: initManagers, freeAgents: initFA } = loadDatabase();
        setClubs(initClubs);
        setOwners(initOwners);
        setManagers(initManagers);
        setFreeAgents(initFA);
        setGameweekHistory([]);
        setTransferHistory([]);
        setTransferProposals([]);
        setIncomingBids([]);
      }
    } catch {
      const { clubs: initClubs, owners: initOwners, managers: initManagers, freeAgents: initFA } = loadDatabase();
      setClubs(initClubs);
      setOwners(initOwners);
      setManagers(initManagers);
      setFreeAgents(initFA);
      setGameweekHistory([]);
      setTransferHistory([]);
      setTransferProposals([]);
      setIncomingBids([]);
    }
    setIsInitialized(true);
  }, []);

  const savePayload = useMemo(() => {
    if (!isInitialized) return null;
    if (gameMode === 'manager') {
      if (!managerCareer) return null;
    } else if (!director) {
      return null;
    }
    return {
      saveVersion: CURRENT_SAVE_VERSION,
      gameMode,
      clubs,
      owners,
      managers,
      freeAgents,
      director,
      managerCareer,
      currentWeek,
      seasonYear,
      gameweekHistory,
      transferHistory,
      transferProposals,
      incomingBids,
      delegation,
    };
  }, [isInitialized, gameMode, director, managerCareer, clubs, owners, managers, freeAgents, currentWeek, seasonYear, gameweekHistory, transferHistory, transferProposals, incomingBids, delegation]);

  const latestSavePayloadRef = useRef(savePayload);
  latestSavePayloadRef.current = savePayload;

  const writeSavePayload = useCallback((payload: NonNullable<typeof savePayload> | null) => {
    if (debounceTimerRef.current !== null) {
      window.clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    if (!payload) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
      setStorageWarning(null);
    } catch (err) {
      console.warn('Storage quota warning: Failed to autosave game state to localStorage', err);
      setStorageWarning("Couldn't save. Export your save to keep your progress");
    }
  }, []);

  // Debounced autosave (~1s), skipping while week simulation is running and saving once when finished
  useEffect(() => {
    if (!savePayload) return;

    if (isSimulating) {
      wasSimulatingRef.current = true;
      if (debounceTimerRef.current !== null) {
        window.clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
      return;
    }

    if (wasSimulatingRef.current || immediateSaveOnNextCommitRef.current) {
      wasSimulatingRef.current = false;
      immediateSaveOnNextCommitRef.current = false;
      writeSavePayload(savePayload);
      return;
    }

    if (debounceTimerRef.current !== null) {
      window.clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = window.setTimeout(() => {
      debounceTimerRef.current = null;
      writeSavePayload(latestSavePayloadRef.current);
    }, 1000);

    return () => {
      if (debounceTimerRef.current !== null) {
        window.clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
    };
  }, [savePayload, isSimulating, writeSavePayload]);

  // Immediate save when the page is hidden or unloaded
  useEffect(() => {
    const flushSave = () => {
      if (latestSavePayloadRef.current) {
        writeSavePayload(latestSavePayloadRef.current);
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        flushSave();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pagehide', flushSave);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pagehide', flushSave);
    };
  }, [writeSavePayload]);

  const isManagerMode = gameMode === 'manager' && Boolean(managerCareer);

  // Derived current club, owner, manager, and active director adapter
  const currentClub = useMemo(() => {
    const targetId = isManagerMode ? managerCareer?.currentClubId : director?.currentClubId;
    if (!targetId) return undefined;
    return clubs.find(c => c.id === targetId);
  }, [clubs, director, isManagerMode, managerCareer]);

  const currentOwner = useMemo(() => {
    if (!currentClub) return undefined;
    return owners.find(o => o.id === currentClub.ownerId);
  }, [currentClub, owners]);

  const activeClubDirector = useMemo(() => {
    if (!isManagerMode || !managerCareer || !currentClub) return undefined;
    return getOrCreateClubDirector(managerCareer.clubDirectors, currentClub, currentOwner);
  }, [isManagerMode, managerCareer, currentClub, currentOwner]);

  const activeEffectiveControl = useMemo(() => {
    if (!isManagerMode || !managerCareer || !activeClubDirector) return 0;
    return calculateEffectiveControl(
      activeClubDirector.personality,
      managerCareer.profile.reputation,
      managerCareer.controlModifier || 0
    );
  }, [isManagerMode, managerCareer, activeClubDirector]);

  const activeManagerAdapter = useMemo(() => {
    if (!isManagerMode || !managerCareer) return undefined;
    return toSimulationManagerAdapter(managerCareer, currentClub);
  }, [isManagerMode, managerCareer, currentClub]);

  const currentManager = useMemo(() => {
    if (isManagerMode) return activeManagerAdapter;
    if (!currentClub || !currentClub.managerId) return undefined;
    return managers.find(m => m.id === currentClub.managerId);
  }, [isManagerMode, activeManagerAdapter, currentClub, managers]);

  const activeEngineDirector = useMemo(() => {
    if (isManagerMode && managerCareer) {
      return toEngineDirectorAdapter(managerCareer, currentClub);
    }
    return director;
  }, [isManagerMode, managerCareer, currentClub, director]);

  // Generate job vacancies (Director Mode)
  const vacancies = useMemo(() => {
    return generateJobVacancies(clubs, owners, director?.currentClubId || null, director?.reputation);
  }, [clubs, owners, director]);

  const pendingProposalsCount = useMemo(
    () => transferProposals.filter(p => p.status === 'pending').length,
    [transferProposals]
  );

  // Character Creation Handler (Director Mode)
  const handleCompleteSetup = (newDirector: Director, _startingClubId: string) => {
    sounds.playFanfare();
    immediateSaveOnNextCommitRef.current = true;
    setGameMode('director');
    setManagerCareer(null);
    setDirector(newDirector);
    setCurrentWeek(1);
    setCurrentTab('dashboard');
    setIsCreatingCareer(false);
    setIsCreatingManagerCareer(false);
    setInMainMenu(false);
  };

  // Manager Mode Setup Handler
  const handleCompleteManagerSetup = (params: {
    name: string;
    nationality: string;
    age: number;
    tacticalStyle: TacticalStyle;
    startingClubId: string;
  }) => {
    const startingClub = clubs.find(c => c.id === params.startingClubId) || clubs[0];
    if (!startingClub) return;

    const { career, updatedClubs, updatedManagers } = createManagerCareer({
      name: params.name,
      nationality: params.nationality,
      age: params.age,
      tacticalStyle: params.tacticalStyle,
      startingClub,
      clubs,
      owners,
      managers,
    });

    sounds.playFanfare();
    immediateSaveOnNextCommitRef.current = true;
    setGameMode('manager');
    setDirector(null);
    setManagerCareer(career);
    setClubs(updatedClubs);
    setManagers(updatedManagers);
    setCurrentWeek(1);
    setSeasonYear(2026);
    setCurrentTab('dashboard');
    setIsCreatingCareer(false);
    setIsCreatingManagerCareer(false);
    setShowUnemployedModal(false);
    setInMainMenu(false);
    setNewsAlert(
      `MANAGERIAL APPOINTMENT: Named Head Coach of ${startingClub.name} (Starting Reputation: ${career.profile.reputation}). Sporting Director: ${career.clubDirectors[startingClub.id]?.name}.`
    );
  };

  const handleSaveToLocalStorage = () => {
    if (!latestSavePayloadRef.current) return;
    writeSavePayload(latestSavePayloadRef.current);
  };

  const handleBackToMainMenu = () => {
    handleSaveToLocalStorage();
    sounds.playClick();
    setInMainMenu(true);
    setIsCreatingCareer(false);
    setIsCreatingManagerCareer(false);
  };

  const handleContinueCareer = () => {
    if (gameMode === 'manager') {
      if (!managerCareer) {
        setIsCreatingManagerCareer(true);
        setInMainMenu(false);
        return;
      }
      sounds.playWhistle();
      setInMainMenu(false);
      return;
    }
    if (!director) {
      setIsCreatingCareer(true);
      setInMainMenu(false);
      return;
    }
    sounds.playWhistle();
    setInMainMenu(false);
  };

  const handleStartNewCareer = () => {
    sounds.playGavel();
    const { clubs: initClubs, owners: initOwners, managers: initManagers, freeAgents: initFA } = loadDatabase();
    setClubs(initClubs);
    setOwners(initOwners);
    setManagers(initManagers);
    setFreeAgents(initFA);
    setDelegation(DEFAULT_DELEGATION);
    setGameMode('director');
    setManagerCareer(null);
    setGameweekHistory([]);
    setTransferHistory([]);
    setTransferProposals([]);
    setIncomingBids([]);
    setIsSacked(false);
    setSackReason(null);
    setWeeklyDigest(null);
    setSeasonSummary(null);
    setManagerSeasonSummary(null);
    setShowUnemployedModal(false);
    setReviewingSeasonRecord(null);
    setNewsAlert(null);
    setStorageWarning(null);
    setCurrentTab('dashboard');
    setCurrentWeek(1);
    setSeasonYear(2026);
    setIsCreatingManagerCareer(false);
    setIsCreatingCareer(true);
    setInMainMenu(false);
  };

  const handleStartNewManagerCareer = () => {
    sounds.playGavel();
    const { clubs: initClubs, owners: initOwners, managers: initManagers, freeAgents: initFA } = loadDatabase();
    setClubs(initClubs);
    setOwners(initOwners);
    setManagers(initManagers);
    setFreeAgents(initFA);
    setDelegation(DEFAULT_DELEGATION);
    setGameMode('manager');
    setDirector(null);
    setManagerCareer(null);
    setGameweekHistory([]);
    setTransferHistory([]);
    setTransferProposals([]);
    setIncomingBids([]);
    setIsSacked(false);
    setSackReason(null);
    setWeeklyDigest(null);
    setSeasonSummary(null);
    setManagerSeasonSummary(null);
    setShowUnemployedModal(false);
    setReviewingSeasonRecord(null);
    setNewsAlert(null);
    setStorageWarning(null);
    setCurrentTab('dashboard');
    setCurrentWeek(1);
    setSeasonYear(2026);
    setIsCreatingCareer(false);
    setIsCreatingManagerCareer(true);
    setInMainMenu(false);
  };

  const handleExportSave = () => {
    try {
      const hasCareer = gameMode === 'manager' ? Boolean(managerCareer) : Boolean(director);
      const payload = latestSavePayloadRef.current ?? (hasCareer ? {
        saveVersion: CURRENT_SAVE_VERSION,
        gameMode,
        clubs,
        owners,
        managers,
        freeAgents,
        director,
        managerCareer,
        currentWeek,
        seasonYear,
        gameweekHistory,
        transferHistory,
        transferProposals,
        incomingBids,
        delegation,
      } : null);
      if (!payload) return;

      const jsonStr = JSON.stringify(payload);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `boardroom-save-${seasonYear}-wk${currentWeek}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Export error', err);
    }
  };

  const handleImportSave = (saveJson: string): { ok: boolean; error?: string } => {
    const validation = validateSaveJson(saveJson);
    if (!validation.ok || !validation.data) {
      return { ok: false, error: validation.error || 'Invalid save file.' };
    }

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = validation.data as Record<string, any>;
      const importedMode: GameMode =
        data.gameMode === 'manager' && data.managerCareer ? 'manager' : 'director';
      const year = typeof data.seasonYear === 'number' ? data.seasonYear : 2026;
      const week = typeof data.currentWeek === 'number' ? data.currentWeek : 1;
      const dbData = loadDatabase();
      const hydratedClubs = (data.clubs as Partial<Club>[]).map(c => migrateClubData(c, year, dbData.clubs));
      const migratedFreeAgents = Array.isArray(data.freeAgents)
        ? data.freeAgents.map(migratePlayerData)
        : [];
      const migratedHistory = Array.isArray(data.transferHistory)
        ? capTransferHistory(data.transferHistory.map(migrateTransferRecord))
        : [];
      const migratedProposals = Array.isArray(data.transferProposals) ? data.transferProposals : [];
      const migratedGameweeks = Array.isArray(data.gameweekHistory) ? data.gameweekHistory : [];
      const migratedBids = Array.isArray(data.incomingBids) ? data.incomingBids : [];
      const migratedManagers = Array.isArray(data.managers)
        ? (data.managers as Partial<Manager>[]).map(migrateManagerData)
        : [];
      const importedDelegation: DelegationMatrix = data.delegation
        ? normalizeDelegation(data.delegation)
        : delegation;
      const importedManagerCareer =
        importedMode === 'manager'
          ? normalizeManagerCareerState(data.managerCareer as ManagerCareerState, hydratedClubs)
          : null;
      const importedDirector =
        importedMode === 'director' ? (data.director as Director) : null;

      setGameMode(importedMode);
      setClubs(hydratedClubs);
      setOwners(data.owners as Owner[]);
      setManagers(migratedManagers);
      setFreeAgents(migratedFreeAgents);
      setDirector(importedDirector);
      setManagerCareer(importedManagerCareer);
      setCurrentWeek(week);
      setSeasonYear(year);
      setGameweekHistory(migratedGameweeks);
      setTransferHistory(migratedHistory);
      setTransferProposals(migratedProposals);
      setIncomingBids(migratedBids);
      setDelegation(importedDelegation);
      setCurrentTab('dashboard');
      setSeasonSummary(null);
      setManagerSeasonSummary(null);
      setShowUnemployedModal(false);
      setReviewingSeasonRecord(null);

      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
          saveVersion: CURRENT_SAVE_VERSION,
          gameMode: importedMode,
          clubs: hydratedClubs,
          owners: data.owners,
          managers: migratedManagers,
          freeAgents: migratedFreeAgents,
          director: importedDirector,
          managerCareer: importedManagerCareer,
          currentWeek: week,
          seasonYear: year,
          gameweekHistory: migratedGameweeks,
          transferHistory: migratedHistory,
          transferProposals: migratedProposals,
          incomingBids: migratedBids,
          delegation: importedDelegation,
        }));
        setStorageWarning(null);
      } catch (saveErr) {
        console.warn('Storage quota warning: Failed to write imported save to localStorage', saveErr);
        setStorageWarning("Couldn't save. Export your save to keep your progress");
      }

      return { ok: true };
    } catch {
      return { ok: false, error: 'Failed to load imported save data.' };
    }
  };

  const handleResetDatabase = () => {
    if (debounceTimerRef.current !== null) {
      window.clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    wasSimulatingRef.current = false;
    immediateSaveOnNextCommitRef.current = false;
    setStorageWarning(null);
    localStorage.removeItem(STORAGE_KEY);
    const { clubs: initClubs, owners: initOwners, managers: initManagers, freeAgents: initFA } = loadDatabase();
    setClubs(initClubs);
    setOwners(initOwners);
    setManagers(initManagers);
    setFreeAgents(initFA);
    setDelegation(DEFAULT_DELEGATION);
    setGameMode('director');
    setDirector(null);
    setManagerCareer(null);
    setCurrentWeek(1);
    setSeasonYear(2026);
    setGameweekHistory([]);
    setTransferHistory([]);
    setTransferProposals([]);
    setIncomingBids([]);
    setIsSacked(false);
    setSackReason(null);
    setWeeklyDigest(null);
    setSeasonSummary(null);
    setManagerSeasonSummary(null);
    setShowUnemployedModal(false);
    setReviewingSeasonRecord(null);
    setNewsAlert(null);
    setCurrentTab('dashboard');
    setIsCreatingCareer(false);
    setIsCreatingManagerCareer(false);
    setInMainMenu(true);
  };

  // Core single-week simulation helper for Manager Mode
  const simulateOneManagerWeek = useCallback((params: {
    weekNum: number;
    year: number;
    clubsIn: Club[];
    ownersIn: Owner[];
    managersIn: Manager[];
    freeAgentsIn: Player[];
    careerIn: ManagerCareerState;
    historyIn: TransferRecord[];
    gameweeksIn: GameweekRecord[];
  }): {
    clubsOut: Club[];
    ownersOut: Owner[];
    managersOut: Manager[];
    freeAgentsOut: Player[];
    careerOut: ManagerCareerState;
    historyOut: TransferRecord[];
    gameweeksOut: GameweekRecord[];
    digest: WeeklyDigest;
    takeoverNews?: string;
    justSacked: boolean;
  } => {
    const { weekNum, year, clubsIn, ownersIn, managersIn, freeAgentsIn, careerIn, historyIn, gameweeksIn } = params;
    const club = careerIn.currentClubId ? clubsIn.find(c => c.id === careerIn.currentClubId) : undefined;
    const owner = club ? ownersIn.find(o => o.id === club.ownerId) : undefined;
    const clubDir = club ? getOrCreateClubDirector(careerIn.clubDirectors, club, owner) : undefined;
    const updatedDirectorsMap =
      club && clubDir && !careerIn.clubDirectors[club.id]
        ? { ...careerIn.clubDirectors, [club.id]: clubDir }
        : careerIn.clubDirectors;

    const engineDir = toEngineDirectorAdapter(careerIn, club);
    const userMgrAdapter = club ? toSimulationManagerAdapter(careerIn, club) : undefined;

    const res = advanceSimulationWeek(
      weekNum,
      year,
      clubsIn,
      ownersIn,
      managersIn,
      engineDir,
      DEFAULT_DELEGATION,
      freeAgentsIn,
      historyIn,
      [],
      {
        gameMode: 'manager',
        userManagerAdapter: userMgrAdapter,
        clubDirector: clubDir,
      }
    );

    const takeover = evaluateTakeoverEvents(
      weekNum + 1,
      res.updatedClubs,
      res.updatedOwners,
      res.updatedDirector
    );

    const nextHistory =
      res.newTransfers && res.newTransfers.length > 0
        ? capTransferHistory([...res.newTransfers, ...historyIn])
        : historyIn;
    const nextGameweeks = [
      ...gameweeksIn.filter(r => !(r.week === res.gameweekRecord.week && r.seasonYear === res.gameweekRecord.seasonYear)),
      res.gameweekRecord,
    ];

    let nextProfile = { ...careerIn.profile };
    if (club && res.digest.playerMatch) {
      const m = res.digest.playerMatch;
      const isHome = m.homeClubId === club.id;
      const gf = isHome ? m.homeScore : m.awayScore;
      const ga = isHome ? m.awayScore : m.homeScore;
      if (gf > ga) nextProfile = { ...nextProfile, wins: nextProfile.wins + 1 };
      else if (gf < ga) nextProfile = { ...nextProfile, losses: nextProfile.losses + 1 };
      else nextProfile = { ...nextProfile, draws: nextProfile.draws + 1 };
    }

    const publicBackingWeeks = Math.max(0, careerIn.publicBackingWeeksRemaining ?? 0);
    const adjustedBoardTrust =
      publicBackingWeeks > 0 && res.updatedDirector.boardTrust < careerIn.boardTrust
        ? Math.max(
            careerIn.boardTrust - 1,
            Math.ceil((careerIn.boardTrust + res.updatedDirector.boardTrust) / 2)
          )
        : res.updatedDirector.boardTrust;

    let nextCareer: ManagerCareerState = {
      ...careerIn,
      profile: nextProfile,
      boardTrust: adjustedBoardTrust,
      fanApproval: res.updatedDirector.fanApproval,
      clubDirectors: updatedDirectorsMap,
      publicBackingWeeksRemaining: Math.max(0, publicBackingWeeks - 1),
      directorReceptivityPenalty: Math.max(
        0,
        (careerIn.directorReceptivityPenalty ?? 0) -
          MANAGER_MODE_CONFIG.directorRequests.weeklyPenaltyDecay
      ),
    };

    let finalClubsOut = res.updatedClubs;
    let justSacked = false;
    if (club && clubDir) {
      const postClub = res.updatedClubs.find(c => c.id === club.id);
      const postOwner = postClub ? takeover.updatedOwners.find(o => o.id === postClub.ownerId) || owner : owner;
      if (postClub && postOwner) {
        const sackDecision = evaluateManagerMidSeasonSacking({
          career: nextCareer,
          club: postClub,
          owner: postOwner,
          allClubs: res.updatedClubs,
          currentWeek: weekNum,
        });

        if (sackDecision.sacked) {
          justSacked = true;
          const compensation = calculateManagerSackingCompensation(
            nextCareer.weeklyWage,
            nextCareer.contractYears,
            postClub.balance
          );
          if (compensation > 0) {
            finalClubsOut = res.updatedClubs.map(c =>
              c.id === postClub.id
                ? { ...c, balance: Math.max(0, c.balance - compensation) }
                : c
            );
          }

          const summary = calculateSeasonSummary(
            year,
            finalClubsOut,
            res.updatedDirector,
            postOwner,
            res.updatedFreeAgents,
            nextHistory
          );
          const snapshot = extractSeasonReviewSnapshot({
            club: finalClubsOut.find(c => c.id === postClub.id) || postClub,
            clubs: finalClubsOut,
            owners: takeover.updatedOwners,
            clubDirector: clubDir,
            gameweekHistory: nextGameweeks,
            transferHistory: nextHistory,
            seasonYear: year,
            managerAge: nextCareer.profile.age,
            summary,
            previousReputation: nextCareer.profile.reputation,
            previousSeasonFinish: nextCareer.previousSeasonFinish,
            wasSacked: true,
          });
          const offers = generateManagerJobOffers({
            reputation: snapshot.reputationAfter,
            currentClubId: null,
            clubs: finalClubsOut,
            clubDirectors: updatedDirectorsMap,
            owners: takeover.updatedOwners,
            justSacked: true,
          });
          nextCareer = {
            ...nextCareer,
            currentClubId: null,
            contractYears: 0,
            weeklyWage: 0,
            controlModifier: 0,
            publicBackingWeeksRemaining: 0,
            pendingDirectorCounterOffer: null,
            directorRequestCooldowns: {},
            directorReceptivityPenalty: 0,
            profile: {
              ...nextCareer.profile,
              reputation: snapshot.reputationAfter,
              careerSackings: nextCareer.profile.careerSackings + 1,
            },
            seasonHistory: [snapshot.record, ...nextCareer.seasonHistory],
            activeOffers: offers,
            playerRequests: [],
            sackedBanner: {
              clubId: postClub.id,
              clubName: postClub.name,
              reason: sackDecision.reason || `Dismissed by ${postClub.name} after results fell short.`,
              week: weekNum,
              compensation,
            },
          };
        }
      }
    }

    return {
      clubsOut: finalClubsOut,
      ownersOut: takeover.updatedOwners,
      managersOut: res.updatedManagers,
      freeAgentsOut: res.updatedFreeAgents,
      careerOut: nextCareer,
      historyOut: nextHistory,
      gameweeksOut: nextGameweeks,
      digest: res.digest,
      takeoverNews: takeover.newsAlert,
      justSacked,
    };
  }, []);

  // Finalize Season-End Snapshot + Mortality Check in Manager Mode
  const finalizeManagerSeasonEnd = useCallback((params: {
    clubsIn: Club[];
    ownersIn: Owner[];
    managersIn: Manager[];
    freeAgentsIn: Player[];
    careerIn: ManagerCareerState;
    historyIn: TransferRecord[];
    gameweeksIn: GameweekRecord[];
    year: number;
  }) => {
    const { clubsIn, ownersIn, managersIn, freeAgentsIn, careerIn, historyIn, gameweeksIn, year } = params;
    const club = careerIn.currentClubId ? clubsIn.find(c => c.id === careerIn.currentClubId) : undefined;
    const owner = club ? ownersIn.find(o => o.id === club.ownerId) : undefined;
    const engineDir = toEngineDirectorAdapter(careerIn, club);
    const summary = calculateSeasonSummary(year, clubsIn, engineDir, owner, freeAgentsIn, historyIn);

    // Check age 80+ mortality roll (20% at age 80, +3% each season)
    const mortality = rollAgeMortality(careerIn.profile.age);

    if (club) {
      const clubDir = getOrCreateClubDirector(careerIn.clubDirectors, club, owner);
      const snapshot = extractSeasonReviewSnapshot({
        club,
        clubs: clubsIn,
        owners: ownersIn,
        clubDirector: clubDir,
        gameweekHistory: gameweeksIn,
        transferHistory: historyIn,
        seasonYear: year,
        managerAge: careerIn.profile.age,
        summary,
        previousReputation: careerIn.profile.reputation,
        previousSeasonFinish: careerIn.previousSeasonFinish,
        wasSacked: false,
      });

      const updatedTrophies = summary.playerClubWonTrophy
        ? [...careerIn.profile.trophiesWon, summary.playerClubWonTrophy]
        : careerIn.profile.trophiesWon;

      if (mortality.triggered) {
        setManagerCareer({
          ...careerIn,
          profile: {
            ...careerIn.profile,
            reputation: snapshot.reputationAfter,
            trophiesWon: updatedTrophies,
            seasonsManaged: careerIn.profile.seasonsManaged + 1,
          },
          seasonHistory: [snapshot.record, ...careerIn.seasonHistory],
          pendingSeasonEnd: null,
          isRetired: true,
          retirementCause: 'age_mortality',
          retiredYear: year,
        });
        setManagerSeasonSummary(null);
        sounds.playCrisis();
        return;
      }

      const offers = generateManagerJobOffers({
        reputation: snapshot.reputationAfter,
        currentClubId: club.id,
        clubs: clubsIn,
        clubDirectors: careerIn.clubDirectors,
        owners: ownersIn,
        justSacked: false,
      });

      const remainingContractAfterSeason = Math.max(0, (careerIn.contractYears ?? 2) - 1);
      const contractExpired = remainingContractAfterSeason === 0;
      const renewalOffer = contractExpired
        ? evaluateManagerContractExpiryRenewal({
            club,
            clubs: clubsIn,
            owner,
            clubDirector: clubDir,
            reputation: snapshot.reputationAfter,
            leaguePosition: snapshot.record.leaguePosition,
            isPromoted: summary.isPromoted,
            isRelegated: summary.isRelegated,
            wonTrophy: summary.playerClubWonTrophy,
          })
        : undefined;

      setManagerCareer({
        ...careerIn,
        profile: {
          ...careerIn.profile,
          reputation: snapshot.reputationAfter,
          trophiesWon: updatedTrophies,
        },
        activeOffers: offers,
        pendingSeasonEnd: {
          summary,
          record: snapshot.record,
          offers,
          mortalityTriggered: mortality.triggered,
          mortalityChance: mortality.chance,
          contractExpired,
          renewalOffer,
        },
      });
      setManagerSeasonSummary(summary);
      sounds.playFanfare();
      setNewsAlert(
        contractExpired && renewalOffer && !renewalOffer.offered
          ? `SEASON ${year}/${year + 1} CONCLUDED! Your contract at ${club.name} expired without a renewal offer.`
          : `SEASON ${year}/${year + 1} CONCLUDED! Review your board verdict and off-season job approaches.`
      );
      return;
    }

    // Unemployed at season end
    if (mortality.triggered) {
      setManagerCareer({
        ...careerIn,
        isRetired: true,
        retirementCause: 'age_mortality',
        retiredYear: year,
      });
      sounds.playCrisis();
      return;
    }

    const nextSeasonRes = advanceToNextSeason(
      summary,
      clubsIn,
      ownersIn,
      managersIn,
      freeAgentsIn,
      engineDir,
      DEFAULT_DELEGATION,
      historyIn,
      { gameMode: 'manager' }
    );
    const refreshedOffers = generateManagerJobOffers({
      reputation: careerIn.profile.reputation,
      currentClubId: null,
      clubs: nextSeasonRes.newClubs,
      clubDirectors: careerIn.clubDirectors,
      owners: nextSeasonRes.newOwners,
      justSacked: careerIn.sackedBanner !== null,
    });
    setClubs(nextSeasonRes.newClubs);
    setOwners(nextSeasonRes.newOwners);
    setManagers(nextSeasonRes.newManagers);
    setFreeAgents(nextSeasonRes.newFreeAgents);
    if (nextSeasonRes.newTransfers.length > 0) {
      setTransferHistory(prev => capTransferHistory([...nextSeasonRes.newTransfers, ...prev]));
    }
    setSeasonYear(nextSeasonRes.newSeasonYear);
    setCurrentWeek(1);
    setGameweekHistory([]);
    setManagerCareer({
      ...careerIn,
      profile: {
        ...careerIn.profile,
        age: careerIn.profile.age + 1,
      },
      activeOffers: refreshedOffers,
      pendingSeasonEnd: null,
    });
    setShowUnemployedModal(true);
    sounds.playFanfare();
    setNewsAlert(`Season ${nextSeasonRes.newSeasonYear}/${nextSeasonRes.newSeasonYear + 1} has started with fresh managerial offers.`);
  }, []);

  // Advance Single Week Simulation
  const handleAdvanceWeek = () => {
    if (isSimulating) return;

    if (isManagerMode && managerCareer) {
      if (currentWeek > 46) {
        finalizeManagerSeasonEnd({
          clubsIn: clubs,
          ownersIn: owners,
          managersIn: managers,
          freeAgentsIn: freeAgents,
          careerIn: managerCareer,
          historyIn: transferHistory,
          gameweeksIn: gameweekHistory,
          year: seasonYear,
        });
        return;
      }

      setIsSimulating(true);
      setTimeout(() => {
        const step = simulateOneManagerWeek({
          weekNum: currentWeek,
          year: seasonYear,
          clubsIn: clubs,
          ownersIn: owners,
          managersIn: managers,
          freeAgentsIn: freeAgents,
          careerIn: managerCareer,
          historyIn: transferHistory,
          gameweeksIn: gameweekHistory,
        });

        let finalCareer = step.careerOut;
        const nextWeek = currentWeek + 1;

        // Refresh unemployed offers periodically if none left
        if (!step.justSacked && finalCareer.currentClubId === null && (nextWeek % 3 === 0 || finalCareer.activeOffers.length === 0)) {
          finalCareer = {
            ...finalCareer,
            activeOffers: generateManagerJobOffers({
              reputation: finalCareer.profile.reputation,
              currentClubId: null,
              clubs: step.clubsOut,
              clubDirectors: finalCareer.clubDirectors,
              owners: step.ownersOut,
              justSacked: finalCareer.sackedBanner !== null,
            }),
          };
        }

        if (step.takeoverNews) {
          setNewsAlert(step.takeoverNews);
        }
        setClubs(step.clubsOut);
        setOwners(step.ownersOut);
        setManagers(step.managersOut);
        setFreeAgents(step.freeAgentsOut);
        setTransferHistory(step.historyOut);
        setGameweekHistory(step.gameweeksOut);
        setManagerCareer(finalCareer);
        setCurrentWeek(nextWeek);
        setWeeklyDigest(finalCareer.currentClubId ? step.digest : null);
        setIsSimulating(false);

        if (step.justSacked) {
          setShowUnemployedModal(true);
          sounds.playCrisis();
          setNewsAlert(`DISMISSED: ${finalCareer.sackedBanner?.reason || 'Relieved of managerial duties.'}`);
        } else if (nextWeek > 46) {
          finalizeManagerSeasonEnd({
            clubsIn: step.clubsOut,
            ownersIn: step.ownersOut,
            managersIn: step.managersOut,
            freeAgentsIn: step.freeAgentsOut,
            careerIn: finalCareer,
            historyIn: step.historyOut,
            gameweeksIn: step.gameweeksOut,
            year: seasonYear,
          });
        }
      }, 300);
      return;
    }

    if (!director) return;

    // If all 46 weeks are already completed, show Season Finale review
    if (currentWeek > 46) {
      const summary = calculateSeasonSummary(seasonYear, clubs, director, currentOwner, freeAgents, transferHistory);
      setSeasonSummary(summary);
      sounds.playFanfare();
      return;
    }

    setIsSimulating(true);

    setTimeout(() => {
      const {
        updatedClubs,
        updatedOwners,
        updatedManagers,
        updatedDirector,
        updatedFreeAgents,
        digest,
        gameweekRecord,
        newTransfers,
        updatedTransferProposals,
        newIncomingBids,
      } = advanceSimulationWeek(
        currentWeek,
        seasonYear,
        clubs,
        owners,
        managers,
        director,
        delegation,
        freeAgents,
        transferHistory,
        transferProposals
      );

      // Check Takeover Events
      const { updatedOwners: finalOwners, newsAlert: takeoverNews } = evaluateTakeoverEvents(
        currentWeek + 1,
        updatedClubs,
        updatedOwners,
        updatedDirector
      );

      if (takeoverNews) {
        setNewsAlert(takeoverNews);
      }

      setClubs(updatedClubs);
      setOwners(finalOwners);
      setManagers(updatedManagers);
      setDirector(updatedDirector);
      setFreeAgents(updatedFreeAgents);
      setTransferProposals(updatedTransferProposals);
      setGameweekHistory(prev => [...prev.filter(r => r.week !== gameweekRecord.week), gameweekRecord]);
      if (newTransfers && newTransfers.length > 0) {
        setTransferHistory(prev => capTransferHistory([...newTransfers, ...prev]));
      }
      const nextWeek = currentWeek + 1;
      if (newIncomingBids && newIncomingBids.length > 0) {
        setIncomingBids(prev => [...newIncomingBids, ...prev]);
      } else if (!isTransferWindowOpen(nextWeek)) {
        setIncomingBids(prev => prev.map(b => (b.status === 'pending' ? { ...b, status: 'rejected' as const } : b)));
      }

      setCurrentWeek(nextWeek);
      setWeeklyDigest(digest);
      setIsSimulating(false);

      // Check Sacking criteria driven by Owner patience & trust threshold
      const latestClubForSack = updatedDirector.currentClubId
        ? updatedClubs.find(c => c.id === updatedDirector.currentClubId)
        : undefined;
      const latestOwnerForSack = latestClubForSack
        ? finalOwners.find(o => o.id === latestClubForSack.ownerId)
        : currentOwner;
      const sackDecision = updatedDirector.currentClubId
        ? evaluateOwnerSackDecision(updatedDirector, latestClubForSack, latestOwnerForSack)
        : { sacked: false };

      if (sackDecision.sacked) {
        setSackReason(sackDecision.reason || null);
        setIsSacked(true);
        sounds.playCrisis();
      } else if (nextWeek > 46) {
        // When week 46 finishes (nextWeek = 47), every team has played each other twice -> Trigger Season Finale
        const latestOwner = latestOwnerForSack;
        const nextHistory = newTransfers && newTransfers.length > 0
          ? capTransferHistory([...newTransfers, ...transferHistory])
          : transferHistory;
        const summary = calculateSeasonSummary(
          seasonYear,
          updatedClubs,
          updatedDirector,
          latestOwner,
          updatedFreeAgents,
          nextHistory
        );
        setSeasonSummary(summary);
        sounds.playFanfare();
        setNewsAlert(`SEASON ${seasonYear}/${seasonYear + 1} HAS COMPLETED! Every team has played each other twice.`);
      }
    }, 400);
  };

  // Fast-Forward to January Transfer Window (Week 20)
  const handleFastForwardJan = () => {
    if (currentWeek >= 20 || isSimulating) return;

    if (isManagerMode && managerCareer) {
      setIsSimulating(true);
      let iterClubs = clubs;
      let iterOwners = owners;
      let iterManagers = managers;
      let iterFA = freeAgents;
      let iterCareer = managerCareer;
      let iterHistory = transferHistory;
      let iterGameweeks = gameweekHistory;
      let weekCounter = currentWeek;
      let takeoverAlert: string | undefined;
      let sackedInSim = false;

      while (weekCounter < 20) {
        const step = simulateOneManagerWeek({
          weekNum: weekCounter,
          year: seasonYear,
          clubsIn: iterClubs,
          ownersIn: iterOwners,
          managersIn: iterManagers,
          freeAgentsIn: iterFA,
          careerIn: iterCareer,
          historyIn: iterHistory,
          gameweeksIn: iterGameweeks,
        });
        iterClubs = step.clubsOut;
        iterOwners = step.ownersOut;
        iterManagers = step.managersOut;
        iterFA = step.freeAgentsOut;
        iterCareer = step.careerOut;
        iterHistory = step.historyOut;
        iterGameweeks = step.gameweeksOut;
        if (step.takeoverNews) takeoverAlert = step.takeoverNews;
        weekCounter++;
        if (step.justSacked) {
          sackedInSim = true;
          break;
        }
      }

      setClubs(iterClubs);
      setOwners(iterOwners);
      setManagers(iterManagers);
      setFreeAgents(iterFA);
      setTransferHistory(iterHistory);
      setGameweekHistory(iterGameweeks);
      setManagerCareer(iterCareer);
      setCurrentWeek(weekCounter);
      immediateSaveOnNextCommitRef.current = true;
      setIsSimulating(false);

      if (sackedInSim) {
        setShowUnemployedModal(true);
        sounds.playCrisis();
        setNewsAlert(takeoverAlert || `DISMISSED: ${iterCareer.sackedBanner?.reason}`);
        return;
      }

      sounds.playFanfare();
      setNewsAlert(takeoverAlert ? `${takeoverAlert} — JANUARY TRANSFER WINDOW IS OPEN!` : 'JANUARY TRANSFER WINDOW IS NOW OPEN!');
      setCurrentTab('transfers');
      return;
    }

    if (!director) return;
    setIsSimulating(true);

    let iterClubs = [...clubs];
    let iterOwners = [...owners];
    let iterManagers = [...managers];
    let iterFreeAgents = [...freeAgents];
    let iterDirector = { ...director };
    let iterHistory = [...transferHistory];
    let iterProposals = [...transferProposals];
    let weekCounter = currentWeek;
    const newRecords: GameweekRecord[] = [];
    const newTransfersList: TransferRecord[] = [];
    const newBidsList: IncomingBid[] = [];
    let takeoverAlert: string | undefined;
    let sackedDuringSim = false;
    let sackReasonDuringSim: string | null = null;

    const startWeek = currentWeek;
    while (weekCounter < 20) {
      const res = advanceSimulationWeek(
        weekCounter,
        seasonYear,
        iterClubs,
        iterOwners,
        iterManagers,
        iterDirector,
        delegation,
        iterFreeAgents,
        iterHistory,
        iterProposals
      );
      const takeover = evaluateTakeoverEvents(
        weekCounter + 1,
        res.updatedClubs,
        res.updatedOwners,
        res.updatedDirector
      );
      iterClubs = res.updatedClubs;
      iterOwners = takeover.updatedOwners;
      iterManagers = res.updatedManagers;
      iterDirector = res.updatedDirector;
      iterFreeAgents = res.updatedFreeAgents;
      iterProposals = res.updatedTransferProposals;
      newRecords.push(res.gameweekRecord);
      if (res.newTransfers && res.newTransfers.length > 0) {
        newTransfersList.unshift(...res.newTransfers);
        iterHistory = capTransferHistory([...res.newTransfers, ...iterHistory]);
      }
      if (res.newIncomingBids && res.newIncomingBids.length > 0) {
        newBidsList.unshift(...res.newIncomingBids);
      }
      if (takeover.newsAlert) {
        takeoverAlert = takeover.newsAlert;
      }
      weekCounter++;

      const simClub = iterDirector.currentClubId
        ? iterClubs.find(c => c.id === iterDirector.currentClubId)
        : undefined;
      const simOwner = simClub ? iterOwners.find(o => o.id === simClub.ownerId) : undefined;
      const sackDecision = iterDirector.currentClubId
        ? evaluateOwnerSackDecision(iterDirector, simClub, simOwner)
        : { sacked: false };

      if (sackDecision.sacked) {
        sackedDuringSim = true;
        sackReasonDuringSim = sackDecision.reason || null;
        break;
      }
    }

    setClubs(iterClubs);
    setOwners(iterOwners);
    setManagers(iterManagers);
    setDirector(iterDirector);
    setFreeAgents(iterFreeAgents);
    setTransferProposals(iterProposals);
    setGameweekHistory(prev => {
      const weeks = new Set(newRecords.map(r => r.week));
      return [...prev.filter(r => !weeks.has(r.week)), ...newRecords];
    });
    if (newTransfersList.length > 0) {
      setTransferHistory(prev => capTransferHistory([...newTransfersList, ...prev]));
    }
    if (newBidsList.length > 0) {
      setIncomingBids(prev => [...newBidsList, ...prev]);
    }
    setCurrentWeek(weekCounter);
    immediateSaveOnNextCommitRef.current = true;
    setIsSimulating(false);

    if (sackedDuringSim) {
      if (takeoverAlert) setNewsAlert(takeoverAlert);
      setSackReason(sackReasonDuringSim);
      setIsSacked(true);
      sounds.playCrisis();
      return;
    }

    const myId = iterDirector.currentClubId;
    const coachDeals = myId
      ? newTransfersList.filter(
          tr =>
            (tr.initiatedBy === 'manager' || tr.initiatedBy === 'shared') &&
            (tr.toClubId === myId || tr.fromClubId === myId)
        )
      : [];
    const signingsCount = coachDeals.filter(tr => tr.type === 'signing' && tr.toClubId === myId).length;
    const salesCount = coachDeals.filter(tr => tr.type === 'sale' && tr.fromClubId === myId).length;
    const renewalsCount = coachDeals.filter(tr => tr.type === 'renewal' && tr.toClubId === myId).length;
    const promotionsCount = coachDeals.filter(tr => tr.type === 'promotion' && tr.toClubId === myId).length;
    const newProposalsCount = iterProposals.filter(
      p => p.status === 'pending' && p.createdWeek >= startWeek
    ).length;

    const activityParts: string[] = [];
    if (signingsCount > 0) activityParts.push(`${signingsCount} signing${signingsCount > 1 ? 's' : ''}`);
    if (salesCount > 0) activityParts.push(`${salesCount} sale${salesCount > 1 ? 's' : ''}`);
    if (renewalsCount > 0) activityParts.push(`${renewalsCount} contract renewal${renewalsCount > 1 ? 's' : ''}`);
    if (promotionsCount > 0) activityParts.push(`${promotionsCount} academy promotion${promotionsCount > 1 ? 's' : ''}`);
    if (newProposalsCount > 0) activityParts.push(`${newProposalsCount} transfer proposal${newProposalsCount > 1 ? 's' : ''}`);
    const activityText = activityParts.length > 0 ? ` Head Coach completed: ${activityParts.join(', ')}.` : '';

    sounds.playFanfare();
    setNewsAlert(
      takeoverAlert
        ? `${takeoverAlert} — JANUARY TRANSFER WINDOW IS NOW OPEN!${activityText}`
        : `JANUARY TRANSFER WINDOW IS NOW OPEN!${activityText || ' Review your war chest and scout reinforcements.'}`
    );
    setCurrentTab('transfers');
  };

  // Fast-Forward to Summer / Season End (Week 46 completed -> nextWeek 47)
  const handleFastForwardSummer = () => {
    if (isSimulating) return;

    if (isManagerMode && managerCareer) {
      if (currentWeek > 46) {
        finalizeManagerSeasonEnd({
          clubsIn: clubs,
          ownersIn: owners,
          managersIn: managers,
          freeAgentsIn: freeAgents,
          careerIn: managerCareer,
          historyIn: transferHistory,
          gameweeksIn: gameweekHistory,
          year: seasonYear,
        });
        return;
      }

      setIsSimulating(true);
      let iterClubs = clubs;
      let iterOwners = owners;
      let iterManagers = managers;
      let iterFA = freeAgents;
      let iterCareer = managerCareer;
      let iterHistory = transferHistory;
      let iterGameweeks = gameweekHistory;
      let weekCounter = currentWeek;
      let takeoverAlert: string | undefined;
      let sackedInSim = false;

      while (weekCounter <= 46) {
        const step = simulateOneManagerWeek({
          weekNum: weekCounter,
          year: seasonYear,
          clubsIn: iterClubs,
          ownersIn: iterOwners,
          managersIn: iterManagers,
          freeAgentsIn: iterFA,
          careerIn: iterCareer,
          historyIn: iterHistory,
          gameweeksIn: iterGameweeks,
        });
        iterClubs = step.clubsOut;
        iterOwners = step.ownersOut;
        iterManagers = step.managersOut;
        iterFA = step.freeAgentsOut;
        iterCareer = step.careerOut;
        iterHistory = step.historyOut;
        iterGameweeks = step.gameweeksOut;
        if (step.takeoverNews) takeoverAlert = step.takeoverNews;
        weekCounter++;
        if (step.justSacked) {
          sackedInSim = true;
          break;
        }
      }

      setClubs(iterClubs);
      setOwners(iterOwners);
      setManagers(iterManagers);
      setFreeAgents(iterFA);
      setTransferHistory(iterHistory);
      setGameweekHistory(iterGameweeks);
      setManagerCareer(iterCareer);
      setCurrentWeek(weekCounter);
      immediateSaveOnNextCommitRef.current = true;
      setIsSimulating(false);

      if (sackedInSim) {
        setShowUnemployedModal(true);
        sounds.playCrisis();
        setNewsAlert(takeoverAlert || `DISMISSED: ${iterCareer.sackedBanner?.reason}`);
        return;
      }

      finalizeManagerSeasonEnd({
        clubsIn: iterClubs,
        ownersIn: iterOwners,
        managersIn: iterManagers,
        freeAgentsIn: iterFA,
        careerIn: iterCareer,
        historyIn: iterHistory,
        gameweeksIn: iterGameweeks,
        year: seasonYear,
      });
      return;
    }

    if (!director) return;
    if (currentWeek > 46) {
      const summary = calculateSeasonSummary(seasonYear, clubs, director, currentOwner, freeAgents, transferHistory);
      setSeasonSummary(summary);
      sounds.playFanfare();
      return;
    }

    setIsSimulating(true);

    let iterClubs = [...clubs];
    let iterOwners = [...owners];
    let iterManagers = [...managers];
    let iterFreeAgents = [...freeAgents];
    let iterDirector = { ...director };
    let iterHistory = [...transferHistory];
    let iterProposals = [...transferProposals];
    let weekCounter = currentWeek;
    const newRecords: GameweekRecord[] = [];
    const newTransfersList: TransferRecord[] = [];
    const newBidsList: IncomingBid[] = [];
    let takeoverAlert: string | undefined;
    let sackedDuringSim = false;
    let sackReasonDuringSim: string | null = null;

    while (weekCounter <= 46) {
      const res = advanceSimulationWeek(
        weekCounter,
        seasonYear,
        iterClubs,
        iterOwners,
        iterManagers,
        iterDirector,
        delegation,
        iterFreeAgents,
        iterHistory,
        iterProposals
      );
      const takeover = evaluateTakeoverEvents(
        weekCounter + 1,
        res.updatedClubs,
        res.updatedOwners,
        res.updatedDirector
      );
      iterClubs = res.updatedClubs;
      iterOwners = takeover.updatedOwners;
      iterManagers = res.updatedManagers;
      iterDirector = res.updatedDirector;
      iterFreeAgents = res.updatedFreeAgents;
      iterProposals = res.updatedTransferProposals;
      newRecords.push(res.gameweekRecord);
      if (res.newTransfers && res.newTransfers.length > 0) {
        newTransfersList.unshift(...res.newTransfers);
        iterHistory = capTransferHistory([...res.newTransfers, ...iterHistory]);
      }
      if (res.newIncomingBids && res.newIncomingBids.length > 0) {
        newBidsList.unshift(...res.newIncomingBids);
      }
      if (takeover.newsAlert) {
        takeoverAlert = takeover.newsAlert;
      }
      weekCounter++;

      const simClub = iterDirector.currentClubId
        ? iterClubs.find(c => c.id === iterDirector.currentClubId)
        : undefined;
      const simOwner = simClub ? iterOwners.find(o => o.id === simClub.ownerId) : undefined;
      const sackDecision = iterDirector.currentClubId
        ? evaluateOwnerSackDecision(iterDirector, simClub, simOwner)
        : { sacked: false };

      if (sackDecision.sacked) {
        sackedDuringSim = true;
        sackReasonDuringSim = sackDecision.reason || null;
        break;
      }
    }

    setClubs(iterClubs);
    setOwners(iterOwners);
    setManagers(iterManagers);
    setDirector(iterDirector);
    setFreeAgents(iterFreeAgents);
    setTransferProposals(iterProposals);
    setGameweekHistory(prev => {
      const weeks = new Set(newRecords.map(r => r.week));
      return [...prev.filter(r => !weeks.has(r.week)), ...newRecords];
    });
    if (newTransfersList.length > 0) {
      setTransferHistory(prev => capTransferHistory([...newTransfersList, ...prev]));
    }
    if (newBidsList.length > 0) {
      setIncomingBids(prev => [...newBidsList, ...prev]);
    } else if (!isTransferWindowOpen(weekCounter)) {
      setIncomingBids(prev => prev.map(b => (b.status === 'pending' ? { ...b, status: 'rejected' as const } : b)));
    }
    setCurrentWeek(weekCounter);
    immediateSaveOnNextCommitRef.current = true;
    setIsSimulating(false);

    if (sackedDuringSim) {
      if (takeoverAlert) setNewsAlert(takeoverAlert);
      setSackReason(sackReasonDuringSim);
      setIsSacked(true);
      sounds.playCrisis();
      return;
    }

    const latestClub = iterDirector.currentClubId
      ? iterClubs.find(c => c.id === iterDirector.currentClubId)
      : undefined;
    const latestOwner = latestClub
      ? iterOwners.find(o => o.id === latestClub.ownerId)
      : currentOwner;
    const summary = calculateSeasonSummary(
      seasonYear,
      iterClubs,
      iterDirector,
      latestOwner,
      iterFreeAgents,
      iterHistory
    );
    setSeasonSummary(summary);
    sounds.playFanfare();

    const myId = iterDirector.currentClubId;
    const coachDeals = myId
      ? newTransfersList.filter(
          tr =>
            (tr.initiatedBy === 'manager' || tr.initiatedBy === 'shared') &&
            (tr.toClubId === myId || tr.fromClubId === myId)
        )
      : [];
    const signingsCount = coachDeals.filter(tr => tr.type === 'signing' && tr.toClubId === myId).length;
    const salesCount = coachDeals.filter(tr => tr.type === 'sale' && tr.fromClubId === myId).length;
    const renewalsCount = coachDeals.filter(tr => tr.type === 'renewal' && tr.toClubId === myId).length;
    const promotionsCount = coachDeals.filter(tr => tr.type === 'promotion' && tr.toClubId === myId).length;
    const activityParts: string[] = [];
    if (signingsCount > 0) activityParts.push(`${signingsCount} signing${signingsCount > 1 ? 's' : ''}`);
    if (salesCount > 0) activityParts.push(`${salesCount} sale${salesCount > 1 ? 's' : ''}`);
    if (renewalsCount > 0) activityParts.push(`${renewalsCount} contract renewal${renewalsCount > 1 ? 's' : ''}`);
    if (promotionsCount > 0) activityParts.push(`${promotionsCount} academy promotion${promotionsCount > 1 ? 's' : ''}`);
    const activityText = activityParts.length > 0 ? ` Head Coach completed: ${activityParts.join(', ')}.` : '';

    setNewsAlert(`SEASON ${seasonYear}/${seasonYear + 1} CONCLUDED!${activityText || ' Every team has played each other twice. Review final standings.'}`);
  };

  // Manager Mode: Stay at current club into next season
  const handleManagerStayAtClub = () => {
    if (!managerCareer || !managerCareer.pendingSeasonEnd || !managerSeasonSummary) return;
    const pendingEnd = managerCareer.pendingSeasonEnd;
    if (pendingEnd.contractExpired && !pendingEnd.renewalOffer?.offered) {
      return;
    }
    const pendingRecord = pendingEnd.record;
    const engineDir = toEngineDirectorAdapter(managerCareer, currentClub);
    const {
      newClubs,
      newOwners,
      newManagers,
      newFreeAgents,
      newSeasonYear,
      newTransfers,
    } = advanceToNextSeason(
      managerSeasonSummary,
      clubs,
      owners,
      managers,
      freeAgents,
      engineDir,
      DEFAULT_DELEGATION,
      transferHistory,
      {
        gameMode: 'manager',
        userManagerAdapter: activeManagerAdapter,
        clubDirector: activeClubDirector,
      }
    );

    const updatedClubAfterRollover = newClubs.find(c => c.id === pendingRecord.clubId);
    const nextAge = managerCareer.profile.age + 1;
    const nextContractYears =
      pendingEnd.contractExpired && pendingEnd.renewalOffer?.offered
        ? pendingEnd.renewalOffer.contractYears
        : Math.max(1, (managerCareer.contractYears ?? 2) - 1);
    const nextWeeklyWage =
      pendingEnd.contractExpired && pendingEnd.renewalOffer?.offered
        ? pendingEnd.renewalOffer.weeklyWage
        : managerCareer.weeklyWage;

    immediateSaveOnNextCommitRef.current = true;
    setClubs(newClubs);
    setOwners(newOwners);
    setManagers(newManagers);
    setFreeAgents(newFreeAgents);
    if (newTransfers.length > 0) {
      setTransferHistory(prev => capTransferHistory([...newTransfers, ...prev]));
    }
    setSeasonYear(newSeasonYear);
    setCurrentWeek(1);
    setGameweekHistory([]);
    setManagerSeasonSummary(null);
    setManagerCareer({
      ...managerCareer,
      contractYears: nextContractYears,
      weeklyWage: nextWeeklyWage,
      pendingDirectorCounterOffer: null,
      publicBackingWeeksRemaining: 0,
      profile: {
        ...managerCareer.profile,
        age: nextAge,
        seasonsManaged: managerCareer.profile.seasonsManaged + 1,
      },
      previousSeasonFinish: {
        clubId: pendingRecord.clubId,
        tier: updatedClubAfterRollover?.tier ?? pendingRecord.clubTier,
        position: pendingRecord.leaguePosition,
      },
      seasonHistory: [pendingRecord, ...managerCareer.seasonHistory],
      activeOffers: [],
      playerRequests: [],
      pendingSeasonEnd: null,
      sackedBanner: null,
    });
    setCurrentTab('dashboard');
    sounds.playSigningStamp();
    setNewsAlert(
      pendingEnd.contractExpired && pendingEnd.renewalOffer?.offered
        ? `SEASON ${newSeasonYear}/${newSeasonYear + 1} BEGINS! Renewed at ${pendingRecord.clubName} (${nextContractYears}y · £${(nextWeeklyWage / 1000).toFixed(1)}k/wk).`
        : `SEASON ${newSeasonYear}/${newSeasonYear + 1} BEGINS! Continuing at ${pendingRecord.clubName} (${nextContractYears}y left, Age ${nextAge}).`
    );
  };

  // Manager Mode: Leave into Free Agency when contract expires (no sacking penalty)
  const handleManagerDeclineRenewalAndLeave = () => {
    if (!managerCareer || !managerCareer.pendingSeasonEnd || !managerSeasonSummary) return;
    const pendingRecord = managerCareer.pendingSeasonEnd.record;
    const engineDir = toEngineDirectorAdapter(managerCareer, currentClub);
    const {
      newClubs,
      newOwners,
      newManagers,
      newFreeAgents,
      newSeasonYear,
      newTransfers,
    } = advanceToNextSeason(
      managerSeasonSummary,
      clubs,
      owners,
      managers,
      freeAgents,
      engineDir,
      DEFAULT_DELEGATION,
      transferHistory,
      {
        gameMode: 'manager',
        userManagerAdapter: activeManagerAdapter,
        clubDirector: activeClubDirector,
      }
    );

    const refreshedOffers = generateManagerJobOffers({
      reputation: managerCareer.profile.reputation,
      currentClubId: null,
      clubs: newClubs,
      clubDirectors: managerCareer.clubDirectors,
      owners: newOwners,
      justSacked: false,
    });
    const nextAge = managerCareer.profile.age + 1;

    immediateSaveOnNextCommitRef.current = true;
    setClubs(newClubs);
    setOwners(newOwners);
    setManagers(newManagers);
    setFreeAgents(newFreeAgents);
    if (newTransfers.length > 0) {
      setTransferHistory(prev => capTransferHistory([...newTransfers, ...prev]));
    }
    setSeasonYear(newSeasonYear);
    setCurrentWeek(1);
    setGameweekHistory([]);
    setManagerSeasonSummary(null);
    setManagerCareer({
      ...managerCareer,
      currentClubId: null,
      contractYears: 0,
      weeklyWage: 0,
      controlModifier: 0,
      publicBackingWeeksRemaining: 0,
      pendingDirectorCounterOffer: null,
      directorRequestCooldowns: {},
      directorReceptivityPenalty: 0,
      profile: {
        ...managerCareer.profile,
        age: nextAge,
        seasonsManaged: managerCareer.profile.seasonsManaged + 1,
      },
      previousSeasonFinish: {
        clubId: pendingRecord.clubId,
        tier: pendingRecord.clubTier,
        position: pendingRecord.leaguePosition,
      },
      seasonHistory: [pendingRecord, ...managerCareer.seasonHistory],
      activeOffers: refreshedOffers,
      playerRequests: [],
      pendingSeasonEnd: null,
      sackedBanner: null,
    });
    setShowUnemployedModal(true);
    setCurrentTab('manager_offers');
    sounds.playClick();
    setNewsAlert(`CONTRACT EXPIRED: Left ${pendingRecord.clubName} as a free agent with no reputation penalty.`);
  };

  // Manager Mode: Accept an offer (either from season-end modal or while unemployed)
  const handleAcceptManagerOffer = (offer: ManagerJobOffer) => {
    if (!managerCareer) return;

    // If accepting during season-end review, roll over the football world into the new season first
    if (managerCareer.pendingSeasonEnd && managerSeasonSummary) {
      const pendingRecord = managerCareer.pendingSeasonEnd.record;
      const engineDir = toEngineDirectorAdapter(managerCareer, currentClub);
      const rolled = advanceToNextSeason(
        managerSeasonSummary,
        clubs,
        owners,
        managers,
        freeAgents,
        engineDir,
        DEFAULT_DELEGATION,
        transferHistory,
        {
          gameMode: 'manager',
          userManagerAdapter: activeManagerAdapter,
          clubDirector: activeClubDirector,
        }
      );

      const careerWithRecord: ManagerCareerState = {
        ...managerCareer,
        profile: {
          ...managerCareer.profile,
          age: managerCareer.profile.age + 1,
          seasonsManaged: managerCareer.profile.seasonsManaged + 1,
        },
        previousSeasonFinish: {
          clubId: pendingRecord.clubId,
          tier: pendingRecord.clubTier,
          position: pendingRecord.leaguePosition,
        },
        seasonHistory: [pendingRecord, ...managerCareer.seasonHistory],
        pendingSeasonEnd: null,
      };

      const accepted = acceptManagerJobOffer({
        career: careerWithRecord,
        offer,
        clubs: rolled.newClubs,
        managers: rolled.newManagers,
      });

      immediateSaveOnNextCommitRef.current = true;
      setClubs(accepted.updatedClubs);
      setOwners(rolled.newOwners);
      setManagers(accepted.updatedManagers);
      setFreeAgents(rolled.newFreeAgents);
      if (rolled.newTransfers.length > 0) {
        setTransferHistory(prev => capTransferHistory([...rolled.newTransfers, ...prev]));
      }
      setSeasonYear(rolled.newSeasonYear);
      setCurrentWeek(1);
      setGameweekHistory([]);
      setManagerSeasonSummary(null);
      setManagerCareer(accepted.updatedCareer);
      setShowUnemployedModal(false);
      setCurrentTab('dashboard');
      sounds.playFanfare();
      setNewsAlert(`NEW APPOINTMENT: Appointed Head Coach of ${offer.clubName} for Season ${rolled.newSeasonYear}/${rolled.newSeasonYear + 1}!`);
      return;
    }

    const accepted = acceptManagerJobOffer({
      career: managerCareer,
      offer,
      clubs,
      managers,
    });
    immediateSaveOnNextCommitRef.current = true;
    setClubs(accepted.updatedClubs);
    setManagers(accepted.updatedManagers);
    setManagerCareer(accepted.updatedCareer);
    setShowUnemployedModal(false);
    setCurrentTab('dashboard');
    sounds.playFanfare();
    setNewsAlert(`NEW APPOINTMENT: Taken charge of ${offer.clubName} under Sporting Director ${offer.directorName}.`);
  };

  // Manager Mode: Retire voluntarily (preserves any unsaved pending season record)
  const handleRetireManager = () => {
    if (!managerCareer) return;
    const pendingRecord = managerCareer.pendingSeasonEnd?.record;
    const nextHistory = pendingRecord
      ? [pendingRecord, ...managerCareer.seasonHistory]
      : managerCareer.seasonHistory;

    immediateSaveOnNextCommitRef.current = true;
    setManagerCareer({
      ...managerCareer,
      profile: {
        ...managerCareer.profile,
        seasonsManaged: pendingRecord
          ? managerCareer.profile.seasonsManaged + 1
          : managerCareer.profile.seasonsManaged,
      },
      seasonHistory: nextHistory,
      pendingSeasonEnd: null,
      activeOffers: [],
      isRetired: true,
      retirementCause: 'voluntary',
      retiredYear: seasonYear,
    });
    setManagerSeasonSummary(null);
    setShowUnemployedModal(false);
    sounds.playFanfare();
  };

  // Manager Mode: Leave to become Sporting Director (converts live world directly into Director Mode)
  const handleBecomeSportingDirector = () => {
    if (!managerCareer) return;

    let baseClubs = clubs;
    let baseOwners = owners;
    let baseManagers = managers;
    let baseFreeAgents = freeAgents;
    let nextYear = seasonYear;
    let nextWeek = currentWeek;
    let rolledTransfers: TransferRecord[] = [];
    let resetGameweeks = false;

    if (managerCareer.pendingSeasonEnd && managerSeasonSummary) {
      const engineDir = toEngineDirectorAdapter(managerCareer, currentClub);
      const rolled = advanceToNextSeason(
        managerSeasonSummary,
        clubs,
        owners,
        managers,
        freeAgents,
        engineDir,
        DEFAULT_DELEGATION,
        transferHistory,
        {
          gameMode: 'manager',
          userManagerAdapter: activeManagerAdapter,
          clubDirector: activeClubDirector,
        }
      );
      baseClubs = rolled.newClubs;
      baseOwners = rolled.newOwners;
      baseManagers = rolled.newManagers;
      baseFreeAgents = rolled.newFreeAgents;
      nextYear = rolled.newSeasonYear;
      nextWeek = 1;
      rolledTransfers = rolled.newTransfers;
      resetGameweeks = true;
    }

    const converted = convertManagerCareerToDirectorMode({
      career: managerCareer,
      clubs: baseClubs,
    });

    immediateSaveOnNextCommitRef.current = true;
    setGameMode('director');
    setDirector(converted.director);
    setClubs(converted.updatedClubs);
    setOwners(baseOwners);
    setManagers(baseManagers);
    setFreeAgents(baseFreeAgents);
    if (rolledTransfers.length > 0) {
      setTransferHistory(prev => capTransferHistory([...rolledTransfers, ...prev]));
    }
    if (resetGameweeks) {
      setSeasonYear(nextYear);
      setCurrentWeek(nextWeek);
      setGameweekHistory([]);
    }
    setManagerCareer(null);
    setManagerSeasonSummary(null);
    setShowUnemployedModal(false);
    setTransferProposals([]);
    setIncomingBids([]);
    setCurrentTab(converted.director.currentClubId ? 'dashboard' : 'jobs');
    sounds.playFanfare();
    setNewsAlert(
      converted.director.currentClubId
        ? `BOARDROOM PROMOTION: Stepped up to become Sporting Director! Appoint a Head Coach in the Manager tab.`
        : `BOARDROOM TRANSITION: Entered Director Mode as a free-agent Sporting Director.`
    );
  };

  // Manager Mode: Change Tactical Style from SquadView
  const handleChangeManagerTacticalStyle = (style: TacticalStyle) => {
    if (!managerCareer) return;
    setManagerCareer({
      ...managerCareer,
      profile: {
        ...managerCareer.profile,
        tacticalStyle: style,
        preferredFormation: styleToDefaultFormation(style),
      },
    });
    setNewsAlert(`TACTICAL SHIFT: Adopted ${style} as your touchline blueprint.`);
  };

  // Manager Mode: Instant Target Request Evaluation
  const handleManagerRequestTarget = (player: Player, sellingClub: Club | null): TargetRequestOutcome => {
    if (!managerCareer || !currentClub || !activeClubDirector) {
      return { accepted: false, reason: 'Club context unavailable.', fee: 0, wage: 0 };
    }
    const outcome = evaluateManagerTransferRequest({
      player,
      sellingClub,
      buyingClub: currentClub,
      clubs,
      freeAgents,
      owners,
      career: managerCareer,
      clubDirector: activeClubDirector,
      seasonYear,
      currentWeek,
    });

    if (
      outcome.accepted &&
      outcome.updatedClubs &&
      outcome.updatedFreeAgents &&
      outcome.updatedOwners &&
      outcome.newRecord
    ) {
      setClubs(outcome.updatedClubs);
      setFreeAgents(outcome.updatedFreeAgents);
      setOwners(outcome.updatedOwners);
      setTransferHistory(prev => capTransferHistory([outcome.newRecord!, ...prev]));
    }
    return outcome;
  };

  // Manager Mode: Submit Sale or Renewal Request to the Sporting Director
  const pendingPlayerRequestId = useMemo(
    () => managerCareer?.playerRequests?.find(r => r.status === 'pending')?.id ?? null,
    [managerCareer?.playerRequests]
  );

  const playerRequestContextRef = useRef({
    managerCareer,
    currentClub,
    activeClubDirector,
    clubs,
    seasonYear,
    currentWeek,
  });
  playerRequestContextRef.current = {
    managerCareer,
    currentClub,
    activeClubDirector,
    clubs,
    seasonYear,
    currentWeek,
  };

  useEffect(() => {
    if (!pendingPlayerRequestId) return;
    const timer = window.setTimeout(() => {
      const ctx = playerRequestContextRef.current;
      if (!ctx.managerCareer || !ctx.currentClub || !ctx.activeClubDirector) return;
      const req = (ctx.managerCareer.playerRequests || []).find(r => r.id === pendingPlayerRequestId);
      if (!req || req.status !== 'pending') return;

      const targetPlayer = ctx.currentClub.squad.find(p => p.id === req.playerId);
      const outcome = targetPlayer
        ? req.kind === 'sale'
          ? evaluateManagerSaleRequest({
              player: targetPlayer,
              club: ctx.currentClub,
              clubs: ctx.clubs,
              career: ctx.managerCareer,
              clubDirector: ctx.activeClubDirector,
              seasonYear: ctx.seasonYear,
              currentWeek: ctx.currentWeek,
            })
          : evaluateManagerRenewalRequest({
              player: targetPlayer,
              club: ctx.currentClub,
              clubs: ctx.clubs,
              career: ctx.managerCareer,
              clubDirector: ctx.activeClubDirector,
              seasonYear: ctx.seasonYear,
              currentWeek: ctx.currentWeek,
            })
        : {
            accepted: false,
            status: 'ignored' as const,
            reason: `${req.playerName} is no longer available in the ${ctx.currentClub.name} squad.`,
          };

      setManagerCareer(prev =>
        prev
          ? {
              ...prev,
              playerRequests: (prev.playerRequests || []).map(item =>
                item.id === req.id
                  ? { ...item, status: outcome.status, message: outcome.reason }
                  : item
              ),
            }
          : prev
      );

      if (outcome.accepted && outcome.updatedClubs && outcome.newRecord) {
        setClubs(outcome.updatedClubs);
        setTransferHistory(prev => capTransferHistory([outcome.newRecord!, ...prev]));
        if (req.kind === 'sale') {
          setTransferProposals(prev =>
            prev.map(p => (p.playerId === req.playerId && p.status === 'pending' ? { ...p, status: 'expired' as const } : p))
          );
          setIncomingBids(prev =>
            prev.map(b => (b.playerId === req.playerId && b.status === 'pending' ? { ...b, status: 'rejected' as const } : b))
          );
        }
        sounds.playSigningStamp();
      } else {
        sounds.playCrisis();
      }
      setNewsAlert(outcome.reason);
    }, 350);

    return () => window.clearTimeout(timer);
  }, [pendingPlayerRequestId]);

  const submitManagerPlayerRequest = useCallback(
    (player: Player, kind: ManagerPlayerRequestKind) => {
      if (!managerCareer || !currentClub || !activeClubDirector) return;
      const windowKey = getManagerRequestWindowKey(seasonYear, currentWeek);
      const duplicate = (managerCareer.playerRequests || []).find(
        r => r.playerId === player.id && r.kind === kind && r.windowKey === windowKey
      );
      if (duplicate) {
        sounds.playCrisis();
        setNewsAlert(
          `DUPLICATE REQUEST BLOCKED: Already submitted a ${kind} request for ${player.name} this window (${duplicate.status}).`
        );
        return;
      }

      if (kind === 'sale' && !isTransferWindowOpen(currentWeek)) {
        sounds.playCrisis();
        setNewsAlert(`TRANSFER WINDOW CLOSED: ${getTransferWindowLabel(currentWeek)}. Sale requests require an open window.`);
        return;
      }

      const pendingReq: ManagerPlayerRequest = {
        id: `preq_${seasonYear}_w${currentWeek}_${kind}_${player.id}_${Date.now()}`,
        playerId: player.id,
        playerName: player.name,
        kind,
        status: 'pending',
        seasonYear,
        windowKey,
        week: currentWeek,
        message: `Sent to Sporting Director ${activeClubDirector.name} — awaiting response...`,
      };

      sounds.playClick();
      setManagerCareer(prev =>
        prev
          ? {
              ...prev,
              playerRequests: [...(prev.playerRequests || []), pendingReq],
            }
          : prev
      );
    },
    [managerCareer, currentClub, activeClubDirector, seasonYear, currentWeek]
  );

  const handleManagerRequestSale = useCallback(
    (player: Player) => submitManagerPlayerRequest(player, 'sale'),
    [submitManagerPlayerRequest]
  );

  const handleManagerRequestRenewal = useCallback(
    (player: Player) => submitManagerPlayerRequest(player, 'renewal'),
    [submitManagerPlayerRequest]
  );

  // Manager Mode: Director Tab Requests & Counter-Offers
  const handleSubmitDirectorRequest = useCallback(
    (
      requestType: DirectorRequestType
    ): { ok: boolean; message: string; status?: DirectorRequestStatus } => {
      if (!managerCareer || !currentClub || !currentOwner || !activeClubDirector) {
        return { ok: false, message: 'No active Sporting Director available.' };
      }
      const res = evaluateDirectorRequest({
        requestType,
        career: managerCareer,
        club: currentClub,
        clubs,
        owner: currentOwner,
        allOwners: owners,
        clubDirector: activeClubDirector,
        seasonYear,
        currentWeek,
      });

      immediateSaveOnNextCommitRef.current = true;
      setManagerCareer(res.updatedCareer);
      if (res.updatedClubs) {
        setClubs(res.updatedClubs);
      }

      if (res.blockedByCooldownOrPending) {
        sounds.playCrisis();
        return { ok: false, message: res.message, status: res.status };
      }

      if (res.mutualTerminationCompleted) {
        sounds.playClick();
        setShowUnemployedModal(true);
        setCurrentTab('manager_offers');
        setNewsAlert(res.message);
        return { ok: true, message: res.message, status: res.status };
      }

      if (res.status === 'accepted' || res.status === 'counter_offer') {
        sounds.playSigningStamp();
        if (
          requestType === 'transfer_budget' ||
          requestType === 'public_backing' ||
          requestType === 'pay_rise' ||
          requestType === 'new_contract'
        ) {
          setNewsAlert(res.message);
        }
      } else {
        sounds.playCrisis();
      }

      return { ok: res.status !== 'rejected', message: res.message, status: res.status };
    },
    [managerCareer, currentClub, currentOwner, activeClubDirector, clubs, owners, seasonYear, currentWeek]
  );

  const handleRespondDirectorCounterOffer = useCallback(
    (accept: boolean): { ok: boolean; message: string } => {
      if (!managerCareer || !activeClubDirector) {
        return { ok: false, message: 'No active Sporting Director available.' };
      }
      const res = respondToDirectorCounterOffer({
        career: managerCareer,
        clubDirector: activeClubDirector,
        accept,
        seasonYear,
        currentWeek,
      });
      immediateSaveOnNextCommitRef.current = true;
      setManagerCareer(res.updatedCareer);
      if (res.accepted) {
        sounds.playSigningStamp();
      } else {
        sounds.playClick();
      }
      setNewsAlert(res.message);
      return { ok: true, message: res.message };
    },
    [managerCareer, activeClubDirector, seasonYear, currentWeek]
  );

  // Advance to Next Season (Director Mode Infinite Career Progression)
  const handleAdvanceToNextSeason = (stayAtClub: boolean) => {
    if (!seasonSummary || !director) return;

    const {
      newClubs,
      newOwners,
      newManagers,
      newFreeAgents,
      newDirector,
      newSeasonYear,
      newTransfers,
    } = advanceToNextSeason(
      seasonSummary,
      clubs,
      owners,
      managers,
      freeAgents,
      director,
      delegation,
      transferHistory
    );

    immediateSaveOnNextCommitRef.current = true;
    setClubs(newClubs);
    setOwners(newOwners);
    setManagers(newManagers);
    setFreeAgents(newFreeAgents);
    if (newTransfers.length > 0) {
      setTransferHistory(prev => capTransferHistory([...newTransfers, ...prev]));
    }
    setSeasonYear(newSeasonYear);
    setCurrentWeek(1);
    setGameweekHistory([]);
    setSeasonSummary(null);

    if (stayAtClub && director.currentClubId) {
      setDirector(newDirector);
      setTransferProposals(prev => prev.map(p => (p.status === 'pending' ? { ...p, status: 'expired' as const } : p)));
      setCurrentTab('dashboard');
      const renewalNote =
        newTransfers.length > 0
          ? ` Head Coach completed ${newTransfers.length} off-season contract renewal${newTransfers.length > 1 ? 's' : ''}.`
          : '';
      setNewsAlert(`SEASON ${newSeasonYear}/${newSeasonYear + 1} HAS BEGUN! Promotions & relegations applied, TV cash disbursed, and the Summer Transfer Window is now open.${renewalNote}`);
    } else {
      // Step down and explore vacancies
      const resignedDirector = {
        ...newDirector,
        currentClubId: null,
        contractYears: 0,
      };
      setDirector(resignedDirector);
      setTransferProposals([]);
      setCurrentTab('jobs');
      setNewsAlert(`You have entered the Job Market for Season ${newSeasonYear}/${newSeasonYear + 1}. Select a club from the vacancy board to begin your new appointment!`);
    }

    sounds.playSigningStamp();
  };

  // Handle Boardroom Request Update
  const handleUpdateClubFromBoardroom = (updatedClub: Club, updatedDirector: Director, updatedOwner: Owner) => {
    setClubs(prev => prev.map(c => c.id === updatedClub.id ? updatedClub : c));
    setDirector(updatedDirector);
    setOwners(prev => prev.map(o => o.id === updatedOwner.id ? updatedOwner : o));
  };

  // Handle Manager Hire/Fire Update
  const handleUpdateManager = (
    newManager: Manager | null,
    updatedDirector: Director,
    updatedClub: Club,
    updatedOwner: Owner,
    updatedRivalClub?: Club,
    updatedSackedManager?: Manager
  ) => {
    const prevClub = clubs.find(c => c.id === updatedClub.id);
    const previousManagerId = prevClub?.managerId;

    setManagers(prev => {
      let next = prev.map(m => {
        if (updatedSackedManager && m.id === updatedSackedManager.id) {
          return updatedSackedManager;
        }
        // Release any incumbent manager attached to this club when sacked or replaced
        if ((m.clubId === updatedClub.id || (previousManagerId && m.id === previousManagerId)) && m.id !== newManager?.id) {
          return { ...m, clubId: null, seasonsAtClub: 0 };
        }
        if (newManager && m.id === newManager.id) {
          return newManager;
        }
        return m;
      });
      if (newManager && !next.some(m => m.id === newManager.id)) {
        next = [...next, newManager];
      }
      return next;
    });

    let nextLineup = updatedClub.lineup;
    if (nextLineup) {
      if (newManager && nextLineup.auto) {
        const preferredFormation = getDefaultFormation(newManager);
        nextLineup = autoPickLineup(updatedClub, preferredFormation, newManager);
      } else {
        nextLineup = syncLineupAfterSquadChange(updatedClub, newManager ?? undefined);
      }
    } else if (newManager) {
      nextLineup = autoPickLineup(updatedClub, getDefaultFormation(newManager), newManager);
    }

    const syncedClub: Club = nextLineup ? { ...updatedClub, lineup: nextLineup } : updatedClub;
    setClubs(prev =>
      prev.map(c => {
        if (c.id === syncedClub.id) return syncedClub;
        if (updatedRivalClub && c.id === updatedRivalClub.id) return updatedRivalClub;
        return c;
      })
    );
    setDirector(updatedDirector);
    setOwners(prev => prev.map(o => o.id === updatedOwner.id ? updatedOwner : o));
  };

  // Handle Squad Update (also logs contract renewals to Transfer History)
  const handleUpdateSquad = (updatedSquad: Player[], updatedClub: Club) => {
    const prevClub = clubs.find(c => c.id === updatedClub.id);
    if (prevClub && updatedSquad.length === prevClub.squad.length) {
      const prevById = new Map(prevClub.squad.map(p => [p.id, p]));
      const renewals: TransferRecord[] = [];
      for (const p of updatedSquad) {
        const oldP = prevById.get(p.id);
        if (oldP && (oldP.wage !== p.wage || oldP.contractYears !== p.contractYears)) {
          renewals.push(
            createTransferRecord(
              p,
              'renewal',
              updatedClub.id,
              updatedClub.id,
              0,
              seasonYear,
              currentWeek,
              'director',
              `Extended for ${p.contractYears}y at £${(p.wage / 1000).toFixed(0)}k/wk`
            )
          );
        }
      }
      if (renewals.length > 0) {
        setTransferHistory(prev => capTransferHistory([...renewals, ...prev]));
      }
    }
    const baseClub: Club = { ...updatedClub, squad: updatedSquad };
    const clubWithSquad: Club = baseClub.lineup
      ? { ...baseClub, lineup: syncLineupAfterSquadChange(baseClub, currentManager) }
      : baseClub;
    setClubs(prev => prev.map(c => c.id === clubWithSquad.id ? clubWithSquad : c));
  };

  const handleUpdateLineup = useCallback((clubId: string, lineup: Lineup) => {
    setClubs(prev => prev.map(c => (c.id === clubId ? { ...c, lineup } : c)));
  }, []);

  // Handle Youth Academy Update (works in both Director Mode and Manager Mode; flops have no reputation consequences)
  const handleUpdateClubFromAcademy = (updatedClub: Club) => {
    const prevClub = clubs.find(c => c.id === updatedClub.id);
    if (prevClub && updatedClub.squad.length > prevClub.squad.length) {
      const prevIds = new Set(prevClub.squad.map(p => p.id));
      const promoted = updatedClub.squad.filter(p => !prevIds.has(p.id));
      if (promoted.length > 0) {
        const promoRecords = promoted.map(p =>
          createTransferRecord(
            p,
            'promotion',
            null,
            updatedClub.id,
            0,
            seasonYear,
            currentWeek,
            isManagerMode ? 'manager' : 'director',
            `Promoted from ${updatedClub.name} Youth Academy`
          )
        );
        setTransferHistory(prev => capTransferHistory([...promoRecords, ...prev]));
        setNewsAlert(
          `ACADEMY GRADUATE: ${promoted.map(p => p.name).join(', ')} promoted to the first team.`
        );
      }
    }
    const syncedClub: Club = updatedClub.lineup
      ? { ...updatedClub, lineup: syncLineupAfterSquadChange(updatedClub, currentManager) }
      : updatedClub;
    setClubs(prev => prev.map(c => c.id === syncedClub.id ? syncedClub : c));
  };

  // Handle Rival Academy Prospect Poach (works in both Director Mode and Manager Mode)
  const handleCompleteAcademyPoach = (
    updatedClubs: Club[],
    updatedDirector: Director,
    record: TransferRecord
  ) => {
    setClubs(updatedClubs);
    if (!isManagerMode) {
      setDirector(updatedDirector);
    }
    setTransferHistory(prev => capTransferHistory([record, ...prev]));
    setNewsAlert(
      `YOUTH POACH: ${record.playerName} (${record.position}, Age ${record.age}) joined the academy for £${(record.fee / 1000000).toFixed(2)}M.`
    );
  };

  // Handle Selling an Academy Player (reuses transfer & sale settlement)
  const handleSellAcademyPlayer = (
    prospect: AcademyPlayer,
    buyingClub: Club,
    fee: number,
    wage: number
  ) => {
    if (!currentClub || !activeEngineDirector) return;
    if (!isTransferWindowOpen(currentWeek)) {
      setNewsAlert(`TRANSFER WINDOW CLOSED: ${getTransferWindowLabel(currentWeek)}. Academy sales are disabled until the window reopens.`);
      sounds.playCrisis();
      return;
    }
    try {
      const result = sellAcademyPlayer({
        prospect,
        sellerClub: currentClub,
        buyingClub,
        clubs,
        director: activeEngineDirector,
        fee,
        wage,
        seasonYear,
        currentWeek,
        initiatedBy: isManagerMode ? 'manager' : 'director',
      });
      setClubs(result.updatedClubs);
      if (!isManagerMode) {
        setDirector(result.updatedDirector);
      }
      setTransferHistory(prev => capTransferHistory([result.record, ...prev]));
      sounds.playSigningStamp();
      setNewsAlert(`ACADEMY SALE: ${prospect.name} sold to ${buyingClub.name} for £${(fee / 1000000).toFixed(2)}M.`);
    } catch (err) {
      setNewsAlert(err instanceof Error ? err.message : 'Unable to sell academy player.');
      sounds.playCrisis();
    }
  };

  // Handle Transfer Completion (using shared transferService result)
  const handleCompleteTransfer = (
    updatedClubs: Club[],
    updatedFreeAgents: Player[],
    updatedDirector: Director,
    updatedOwner: Owner,
    updatedManager: Manager | undefined,
    record: TransferRecord
  ) => {
    setClubs(updatedClubs);
    setFreeAgents(updatedFreeAgents);
    if (!isManagerMode) {
      setDirector(updatedDirector);
    }
    setOwners(prev => prev.map(o => o.id === updatedOwner.id ? updatedOwner : o));
    if (!isManagerMode && updatedManager) {
      setManagers(prev => prev.map(m => m.id === updatedManager.id ? updatedManager : m));
    }
    setTransferHistory(prev => capTransferHistory([record, ...prev]));
    setTransferProposals(prev => prev.map(p => (p.playerId === record.playerId && p.status === 'pending' ? { ...p, status: 'expired' as const } : p)));
    setIncomingBids(prev => prev.map(b => (b.playerId === record.playerId && b.status === 'pending' ? { ...b, status: 'rejected' as const } : b)));
  };

  // Sell player directly from SquadView Sell/Release popup
  const handleSellPlayerFromSquad = (
    player: Player,
    buyingClub: Club,
    fee: number,
    wage: number,
    trustDelta = 0
  ) => {
    if (!currentClub || !activeEngineDirector) return;
    if (!isTransferWindowOpen(currentWeek)) {
      setNewsAlert(`TRANSFER WINDOW CLOSED: ${getTransferWindowLabel(currentWeek)}. Player sales are disabled until the window reopens.`);
      sounds.playCrisis();
      return;
    }
    try {
      const result = completeSale({
        player,
        sellerClub: currentClub,
        buyingClub,
        clubs,
        director: activeEngineDirector,
        manager: isManagerMode ? undefined : currentManager,
        fee,
        wage,
        season: seasonYear,
        week: currentWeek,
        initiatedBy: isManagerMode ? 'manager' : 'director',
        trustDelta,
      });

      setClubs(result.clubs);
      if (!isManagerMode) {
        setDirector(result.director);
        if (result.manager) {
          setManagers(prev => prev.map(m => m.id === result.manager!.id ? result.manager! : m));
        }
      }
      setTransferHistory(prev => capTransferHistory([result.record, ...prev]));
      setTransferProposals(prev => prev.map(p => (p.playerId === player.id && p.status === 'pending' ? { ...p, status: 'expired' as const } : p)));
      setIncomingBids(prev => prev.map(b => (b.playerId === player.id && b.status === 'pending' ? { ...b, status: 'rejected' as const } : b)));
      sounds.playSigningStamp();
      setNewsAlert(`TRANSFER AGREED: ${player.name} sold to ${buyingClub.name} for £${(fee / 1000000).toFixed(2)}M.`);
    } catch (err) {
      setNewsAlert(err instanceof Error ? err.message : 'Unable to complete player sale.');
      sounds.playCrisis();
    }
  };

  // Release player from SquadView and log release record
  const handleReleasePlayerFromSquad = (player: Player, severance: number) => {
    if (!currentClub) return;
    const updatedSquad = currentClub.squad.filter(pl => pl.id !== player.id);
    const updatedBase: Club = {
      ...currentClub,
      balance: Math.max(0, currentClub.balance - severance),
      squad: updatedSquad,
    };
    const updatedClub: Club = updatedBase.lineup
      ? { ...updatedBase, lineup: syncLineupAfterSquadChange(updatedBase, currentManager) }
      : updatedBase;
    setClubs(prev => prev.map(c => c.id === updatedClub.id ? updatedClub : c));

    const releaseRecord = createTransferRecord(
      player,
      'release',
      currentClub.id,
      null,
      severance,
      seasonYear,
      currentWeek,
      'director',
      `Mutual termination (£${(severance / 1000).toFixed(0)}k severance)`
    );
    setTransferHistory(prev => capTransferHistory([releaseRecord, ...prev]));
    setTransferProposals(prev => prev.map(p => (p.playerId === player.id && p.status === 'pending' ? { ...p, status: 'expired' as const } : p)));
    setIncomingBids(prev => prev.map(b => (b.playerId === player.id && b.status === 'pending' ? { ...b, status: 'rejected' as const } : b)));
  };

  // Approve Manager Transfer Proposal ('shared' mode)
  const handleApproveProposal = (proposalId: string): { ok: boolean; error?: string } => {
    if (!currentClub || !currentOwner || !director) {
      return { ok: false, error: 'Club or boardroom context is unavailable.' };
    }
    if (!isTransferWindowOpen(currentWeek)) {
      return { ok: false, error: `Transfer window is shut (${getTransferWindowLabel(currentWeek)}).` };
    }
    const proposal = transferProposals.find(p => p.id === proposalId);
    if (!proposal || proposal.status !== 'pending') {
      return { ok: false, error: 'Proposal is no longer pending.' };
    }

    if (proposal.kind === 'signing') {
      const sellingClub = proposal.counterpartyClubId
        ? clubs.find(c => c.id === proposal.counterpartyClubId) || null
        : null;
      const targetPlayer = sellingClub
        ? sellingClub.squad.find(p => p.id === proposal.playerId)
        : freeAgents.find(p => p.id === proposal.playerId);

      if (!targetPlayer) {
        return { ok: false, error: `${proposal.playerName} is no longer available at the counterparty club or in free agency.` };
      }

      const validation = evaluateSigning({
        player: targetPlayer,
        sellingClub,
        buyingClub: currentClub,
        owner: currentOwner,
        fee: proposal.fee,
        wage: proposal.wage,
      });

      if (!validation.ok) {
        return { ok: false, error: validation.reason || 'Transfer is no longer valid under club constraints.' };
      }

      const result = completeSigning({
        player: targetPlayer,
        sellingClub,
        buyingClub: currentClub,
        clubs,
        freeAgents,
        director,
        owner: currentOwner,
        manager: currentManager,
        fee: proposal.fee,
        wage: proposal.wage,
        contractYears: proposal.contractYears,
        season: seasonYear,
        week: currentWeek,
        initiatedBy: 'shared',
        note: proposal.reason,
        trustDelta: 2,
      });

      verifyManagerDeal({
        kind: 'signing',
        myClubId: currentClub.id,
        counterpartyClubId: sellingClub ? sellingClub.id : null,
        playerId: targetPlayer.id,
        beforeClubs: clubs,
        afterClubs: result.clubs,
        beforeFreeAgents: freeAgents,
        afterFreeAgents: result.freeAgents,
        record: result.record,
      });

      setClubs(result.clubs);
      setFreeAgents(result.freeAgents);
      setDirector(result.director);
      setOwners(prev => prev.map(o => o.id === result.owner.id ? result.owner : o));
      if (result.manager) {
        setManagers(prev => prev.map(m => m.id === result.manager!.id ? result.manager! : m));
      }
      setTransferHistory(prev => capTransferHistory([result.record, ...prev]));
      setTransferProposals(prev => prev.map(p => p.id === proposalId ? { ...p, status: 'approved' as const } : p));
      sounds.playSigningStamp();
      setNewsAlert(`PROPOSAL APPROVED: ${proposal.playerName} joined ${currentClub.name} on joint agreement.`);
      return { ok: true };
    } else {
      // Sale proposal
      const player = currentClub.squad.find(p => p.id === proposal.playerId);
      if (!player) {
        return { ok: false, error: `${proposal.playerName} is no longer in your squad.` };
      }
      const buyingClub = proposal.counterpartyClubId
        ? clubs.find(c => c.id === proposal.counterpartyClubId)
        : undefined;
      if (!buyingClub) {
        return { ok: false, error: 'Buying club could not be found.' };
      }
      if (buyingClub.squad.length >= 25) {
        return { ok: false, error: `${buyingClub.name} now have a full 25-man squad and cannot complete this signing.` };
      }
      if (buyingClub.transferBudget < proposal.fee) {
        return { ok: false, error: `${buyingClub.name} no longer have £${(proposal.fee / 1000000).toFixed(2)}M in their transfer budget.` };
      }

      const result = completeSale({
        player,
        sellerClub: currentClub,
        buyingClub,
        clubs,
        director,
        manager: currentManager,
        fee: proposal.fee,
        wage: proposal.wage,
        season: seasonYear,
        week: currentWeek,
        initiatedBy: 'shared',
        note: proposal.reason,
        trustDelta: 2,
      });

      verifyManagerDeal({
        kind: 'sale',
        myClubId: currentClub.id,
        counterpartyClubId: buyingClub.id,
        playerId: player.id,
        beforeClubs: clubs,
        afterClubs: result.clubs,
        beforeFreeAgents: freeAgents,
        afterFreeAgents: freeAgents,
        record: result.record,
      });

      setClubs(result.clubs);
      setDirector(result.director);
      if (result.manager) {
        setManagers(prev => prev.map(m => m.id === result.manager!.id ? result.manager! : m));
      }
      setTransferHistory(prev => capTransferHistory([result.record, ...prev]));
      setTransferProposals(prev => prev.map(p => p.id === proposalId ? { ...p, status: 'approved' as const } : p));
      sounds.playSigningStamp();
      setNewsAlert(`SALE PROPOSAL APPROVED: ${proposal.playerName} sold to ${buyingClub.name} for £${(proposal.fee / 1000000).toFixed(2)}M.`);
      return { ok: true };
    }
  };

  // Reject Manager Transfer Proposal ('shared' mode: -3 trust)
  const handleRejectProposal = (proposalId: string) => {
    setTransferProposals(prev => prev.map(p => p.id === proposalId ? { ...p, status: 'rejected' as const } : p));
    if (currentManager) {
      setManagers(prev => prev.map(m =>
        m.id === currentManager.id
          ? { ...m, trustInDirector: Math.max(0, m.trustInDirector - 3) }
          : m
      ));
    }
    sounds.playCrisis();
  };

  // Offer player to rival clubs (generates matching incoming bids)
  const handleOfferPlayerToClubs = (playerId: string, askingPrice: number): IncomingBid[] => {
    if (!director?.currentClubId) return [];
    if (!isTransferWindowOpen(currentWeek)) {
      setNewsAlert(`TRANSFER WINDOW CLOSED: ${getTransferWindowLabel(currentWeek)}. You can list players again once the window opens.`);
      return [];
    }
    const bids = offerPlayerToClubs(playerId, askingPrice, clubs, director.currentClubId, currentWeek, seasonYear);
    if (bids.length > 0) {
      setIncomingBids(prev => [...bids, ...prev]);
    }
    return bids;
  };

  // Accept incoming transfer bid (transfers player, credits fee, frees wage, logs history)
  const handleAcceptBid = (bidId: string, trustDelta = 0): { ok: boolean; error?: string } => {
    if (!director?.currentClubId) {
      return { ok: false, error: 'No active club appointment.' };
    }
    if (!isTransferWindowOpen(currentWeek)) {
      return { ok: false, error: `Transfer window is shut (${getTransferWindowLabel(currentWeek)}).` };
    }
    const bid = incomingBids.find(b => b.id === bidId);
    if (!bid || bid.status !== 'pending') {
      return { ok: false, error: 'This transfer offer is no longer pending.' };
    }

    try {
      const { updatedClubs, updatedDirector, newTransferRecord } = acceptIncomingBid(
        bid,
        clubs,
        director,
        currentWeek,
        seasonYear,
        currentManager
      );

      setClubs(updatedClubs);
      setDirector(updatedDirector);
      if (trustDelta !== 0 && currentManager) {
        setManagers(prev => prev.map(m =>
          m.id === currentManager.id
            ? { ...m, trustInDirector: Math.max(0, Math.min(100, m.trustInDirector + trustDelta)) }
            : m
        ));
      }
      setTransferHistory(prev => capTransferHistory([newTransferRecord, ...prev]));
      setTransferProposals(prev => prev.map(p => (p.playerId === bid.playerId && p.status === 'pending' ? { ...p, status: 'expired' as const } : p)));
      setIncomingBids(prev => prev.map(b => {
        if (b.id === bidId) {
          return { ...b, status: 'accepted' as const };
        }
        // Invalidate other pending bids for the same player because he is now sold!
        if (b.playerId === bid.playerId && b.status === 'pending') {
          return { ...b, status: 'rejected' as const };
        }
        return b;
      }));
      sounds.playSigningStamp();
      setNewsAlert(`TRANSFER AGREED: ${bid.playerName} has officially transferred to ${bid.buyingClubName} for £${(bid.offeredFee / 1000000).toFixed(2)}M.`);
      return { ok: true };
    } catch (err) {
      console.error('Failed to accept transfer bid', err);
      const message = err instanceof Error ? err.message : 'Unable to complete incoming transfer bid.';
      setIncomingBids(prev => prev.map(b => (b.id === bidId ? { ...b, status: 'rejected' as const } : b)));
      setNewsAlert(message);
      sounds.playCrisis();
      return { ok: false, error: message };
    }
  };

  // Reject incoming transfer bid
  const handleRejectBid = (bidId: string) => {
    setIncomingBids(prev => prev.map(b => b.id === bidId ? { ...b, status: 'rejected' as const } : b));
    sounds.playCrisis();
  };

  // Handle Job Market Contract Sign
  const handleAcceptJob = (newClubId: string, updatedDirector: Director) => {
    const prevClubId = director?.currentClubId;
    setClubs(prev =>
      prev.map(c => {
        if (c.id === prevClubId && c.lineup) {
          const { lineup: _dropped, ...rest } = c;
          return rest;
        }
        if (c.id === newClubId) {
          const newMgr = c.managerId ? managers.find(m => m.id === c.managerId) : undefined;
          const nextLineup = c.lineup
            ? syncLineupAfterSquadChange(c, newMgr)
            : autoPickLineup(c, getDefaultFormation(newMgr), newMgr);
          return nextLineup ? { ...c, lineup: nextLineup } : c;
        }
        return c;
      })
    );
    const cleanDirector: Director = {
      ...updatedDirector,
      lastPetitionWeek: undefined,
      lastPetitionSeason: undefined,
    };
    setDirector(cleanDirector);
    setTransferProposals([]);
    setIncomingBids([]);
    setCurrentTab('dashboard');
    sounds.playFanfare();
  };

  // Handle Director Resignation
  const handleResign = () => {
    if (!director) return;
    sounds.playCrisis();
    const updatedDirector: Director = {
      ...director,
      currentClubId: null,
      contractYears: 0,
    };
    setDirector(updatedDirector);
    setTransferProposals([]);
    setIncomingBids([]);
    setCurrentTab('jobs');
  };

  // Sacked resolution -> Enter Job Market
  const handleSackedEnterJobs = () => {
    if (!director) return;
    const updatedDirector: Director = {
      ...director,
      currentClubId: null,
      contractYears: 0,
      reputation: Math.max(10, director.reputation - 8),
    };
    setDirector(updatedDirector);
    setTransferProposals([]);
    setIncomingBids([]);
    setIsSacked(false);
    setSackReason(null);
    setCurrentTab('jobs');
  };

  if (!isInitialized) {
    return (
      <div className="min-h-dvh bg-[#0b0f17] flex items-center justify-center text-slate-400 font-mono text-xs">
        Loading Boardroom Database...
      </div>
    );
  }

  // Main Menu Screen
  if (inMainMenu && !isCreatingCareer && !isCreatingManagerCareer) {
    return (
      <>
        <MainMenu
          gameMode={gameMode}
          director={director}
          managerCareer={managerCareer}
          club={currentClub}
          owner={currentOwner}
          manager={currentManager}
          currentWeek={currentWeek}
          seasonYear={seasonYear}
          allClubs={clubs}
          allOwners={owners}
          allManagers={managers}
          onContinueCareer={handleContinueCareer}
          onStartNewCareer={handleStartNewCareer}
          onStartNewManagerCareer={handleStartNewManagerCareer}
          onExportSave={handleExportSave}
          onImportSave={handleImportSave}
          onResetDatabase={handleResetDatabase}
        />
        <PWAStatusToast />
      </>
    );
  }

  // Manager Mode Setup
  if (isCreatingManagerCareer || (gameMode === 'manager' && !managerCareer)) {
    return (
      <div className="min-h-dvh bg-[#0b0f17]">
        <ManagerSetupModal
          clubs={clubs}
          owners={owners}
          onComplete={handleCompleteManagerSetup}
          onBackToMainMenu={() => {
            setIsCreatingManagerCareer(false);
            setInMainMenu(true);
          }}
        />
        <PWAStatusToast />
      </div>
    );
  }

  // Character Creation (Director Mode)
  if (isCreatingCareer || (!isManagerMode && !director)) {
    return (
      <div className="min-h-dvh bg-[#0b0f17]">
        <CharacterCreationModal
          clubs={clubs}
          owners={owners}
          onComplete={handleCompleteSetup}
          onBackToMainMenu={() => {
            setIsCreatingCareer(false);
            setInMainMenu(true);
          }}
        />
        <PWAStatusToast />
      </div>
    );
  }

  // Manager Mode Retirement / Career Archive Screen
  if (isManagerMode && managerCareer?.isRetired) {
    return (
      <>
        <ManagerRetirementView
          career={managerCareer}
          onStartNewCareer={handleStartNewManagerCareer}
          onBackToMainMenu={handleBackToMainMenu}
        />
        <PWAStatusToast />
      </>
    );
  }

  if (!activeEngineDirector) {
    return null;
  }

  return (
    <div className="min-h-dvh bg-[#0b0f17] text-slate-100 flex flex-col font-sans selection:bg-amber-500/20 selection:text-amber-200 overflow-x-clip">
      
      {/* Top Bar Contract Navigation */}
      <Header
        gameMode={gameMode}
        currentTab={currentTab}
        setCurrentTab={setCurrentTab}
        currentWeek={currentWeek}
        seasonYear={seasonYear}
        club={currentClub}
        director={activeEngineDirector}
        managerCareer={managerCareer}
        pendingProposalsCount={pendingProposalsCount}
        onAdvanceWeek={handleAdvanceWeek}
        onFastForwardJan={handleFastForwardJan}
        onFastForwardSummer={handleFastForwardSummer}
        onBackToMainMenu={handleBackToMainMenu}
        onExportSave={handleExportSave}
        onImportSave={handleImportSave}
        isSimulating={isSimulating}
      />

      {/* Breaking News Alert Banner */}
      {newsAlert && (
        <div className="bg-amber-400/10 border-b border-amber-400/20 safe-area-x py-2 text-xs text-amber-300 font-medium flex items-center justify-between">
          <div className="max-w-7xl 2xl:max-w-[1600px] mx-auto w-full flex items-center justify-between gap-2">
            <span className="min-w-0 max-w-[75ch]">📢 {newsAlert}</span>
            <button
              type="button"
              onClick={() => setNewsAlert(null)}
              aria-label="Dismiss news alert"
              className="min-h-11 min-w-11 lg:min-h-0 lg:min-w-0 inline-flex items-center justify-center text-amber-400 hover:text-white ml-2 cursor-pointer shrink-0 rounded-lg active:scale-95"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Main Viewport Content */}
      <main className="flex-1 max-w-7xl 2xl:max-w-[1600px] w-full mx-auto safe-area-x pt-4 sm:pt-6 pb-mobile-nav min-w-0">
        {currentTab === 'dashboard' && (
          <DashboardView
            gameMode={gameMode}
            club={currentClub}
            director={activeEngineDirector}
            managerCareer={managerCareer}
            clubDirector={activeClubDirector}
            owner={currentOwner}
            manager={currentManager}
            allClubs={clubs}
            freeAgents={freeAgents}
            transferHistory={transferHistory}
            currentWeek={currentWeek}
            seasonYear={seasonYear}
            gameweekHistory={gameweekHistory}
            onNavigate={tab => setCurrentTab(isManagerMode && tab === 'jobs' ? 'manager_offers' : tab)}
            onAdvanceWeek={handleAdvanceWeek}
            onRetireManager={isManagerMode ? handleRetireManager : undefined}
            onBecomeSportingDirector={isManagerMode ? handleBecomeSportingDirector : undefined}
            isSimulating={isSimulating}
          />
        )}

        <ErrorBoundary resetKey={currentTab}>
          {!currentClub && currentTab !== 'dashboard' && currentTab !== 'jobs' && currentTab !== 'manager_offers' && currentTab !== 'manager_history' && (
            <div className="bg-[#111827] border border-white/10 rounded-2xl p-6 sm:p-8 text-center space-y-4">
              <div className="space-y-1">
                <span className="text-xs font-bold uppercase tracking-wider text-amber-400 block">
                  {isManagerMode ? 'Free Agent Manager Status' : 'Unemployed Executive Status'}
                </span>
                <h2 className="text-xl sm:text-2xl font-extrabold text-white">
                  No Active Club Appointment
                </h2>
                <p className="text-xs sm:text-sm text-slate-400 max-w-md mx-auto">
                  {isManagerMode
                    ? 'Accept a managerial approach in the Job Market before accessing club tactics or transfer operations.'
                    : 'You must sign with a club in the Job Market before accessing club boardroom, squad, or transfer operations.'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  sounds.playClick();
                  setCurrentTab(isManagerMode ? 'manager_offers' : 'jobs');
                }}
                className="min-h-11 px-6 py-2.5 bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-slate-950 font-extrabold text-xs rounded-xl shadow-lg shadow-amber-500/20 cursor-pointer active:scale-95 transition-all"
              >
                {isManagerMode ? 'View Job Offers' : 'Open Job Market'}
              </button>
            </div>
          )}

          {!isManagerMode && currentTab === 'boardroom' && currentClub && currentOwner && director && (
            <BoardroomView
              club={currentClub}
              owner={currentOwner}
              director={director}
              currentWeek={currentWeek}
              seasonYear={seasonYear}
              onUpdateClub={handleUpdateClubFromBoardroom}
            />
          )}

          {!isManagerMode && currentTab === 'responsibilities' && currentClub && director && (
            <ResponsibilitiesView
              club={currentClub}
              allClubs={clubs}
              manager={currentManager}
              director={director}
              delegation={delegation}
              transferHistory={transferHistory}
              onUpdateDelegation={setDelegation}
            />
          )}

          {!isManagerMode && currentTab === 'manager' && currentClub && currentOwner && director && (
            <ManagerView
              club={currentClub}
              allClubs={clubs}
              currentManager={currentManager}
              allManagers={managers}
              director={director}
              owner={currentOwner}
              delegation={delegation}
              seasonYear={seasonYear}
              currentWeek={currentWeek}
              onUpdateManager={handleUpdateManager}
            />
          )}

          {currentTab === 'squad' && currentClub && (
            <SquadView
              gameMode={gameMode}
              club={currentClub}
              allClubs={clubs}
              manager={currentManager}
              delegation={delegation}
              seasonYear={seasonYear}
              currentWeek={currentWeek}
              tacticalStyle={managerCareer?.profile.tacticalStyle}
              directorPersonality={activeClubDirector?.personality}
              effectiveControl={activeEffectiveControl}
              playerRequests={isManagerMode ? (managerCareer?.playerRequests || []) : undefined}
              onChangeTacticalStyle={isManagerMode ? handleChangeManagerTacticalStyle : undefined}
              onUpdateSquad={handleUpdateSquad}
              onUpdateLineup={handleUpdateLineup}
              onSellPlayer={handleSellPlayerFromSquad}
              onReleasePlayer={handleReleasePlayerFromSquad}
              onOfferPlayerToClubs={handleOfferPlayerToClubs}
              onRequestSale={isManagerMode ? handleManagerRequestSale : undefined}
              onRequestRenewal={isManagerMode ? handleManagerRequestRenewal : undefined}
            />
          )}

          {currentTab === 'academy' && currentClub && activeEngineDirector && (
            <YouthAcademyView
              gameMode={gameMode}
              club={currentClub}
              allClubs={clubs}
              manager={currentManager}
              director={activeEngineDirector}
              owner={currentOwner}
              delegation={delegation}
              transferHistory={transferHistory}
              seasonYear={seasonYear}
              currentWeek={currentWeek}
              onUpdateClub={handleUpdateClubFromAcademy}
              onCompletePoach={handleCompleteAcademyPoach}
              onSellAcademyPlayer={handleSellAcademyPlayer}
            />
          )}

          {currentTab === 'transfers' && currentClub && currentOwner && (
            <TransfersView
              gameMode={gameMode}
              currentClub={currentClub}
              allClubs={clubs}
              freeAgents={freeAgents}
              director={activeEngineDirector}
              clubDirector={activeClubDirector}
              effectiveControl={activeEffectiveControl}
              managerReputation={managerCareer?.profile.reputation}
              owner={currentOwner}
              manager={currentManager}
              delegation={delegation}
              transferHistory={transferHistory}
              transferProposals={transferProposals}
              incomingBids={incomingBids}
              seasonYear={seasonYear}
              currentWeek={currentWeek}
              onCompleteTransfer={handleCompleteTransfer}
              onRequestTarget={isManagerMode ? handleManagerRequestTarget : undefined}
              onApproveProposal={handleApproveProposal}
              onRejectProposal={handleRejectProposal}
              onAcceptBid={handleAcceptBid}
              onRejectBid={handleRejectBid}
              onOfferPlayerToClubs={handleOfferPlayerToClubs}
            />
          )}

          {isManagerMode &&
            managerCareer &&
            currentTab === 'manager_director' &&
            currentClub &&
            currentOwner &&
            activeClubDirector && (
              <DirectorView
                club={currentClub}
                allClubs={clubs}
                owner={currentOwner}
                career={managerCareer}
                clubDirector={activeClubDirector}
                seasonYear={seasonYear}
                currentWeek={currentWeek}
                onSubmitRequest={handleSubmitDirectorRequest}
                onRespondCounterOffer={handleRespondDirectorCounterOffer}
              />
            )}

          {!isManagerMode && currentTab === 'jobs' && director && (
            <JobMarketView
              director={director}
              currentClub={currentClub}
              vacancies={vacancies}
              allClubs={clubs}
              allOwners={owners}
              allManagers={managers}
              currentManager={currentManager}
              seasonYear={seasonYear}
              currentWeek={currentWeek}
              onAcceptJob={handleAcceptJob}
              onResign={handleResign}
              onHireManager={handleUpdateManager}
            />
          )}

          {isManagerMode && managerCareer && currentTab === 'manager_history' && (
            <div className="space-y-4">
              <div className="bg-[#111827] border border-white/10 rounded-2xl p-4 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <span className="text-xs font-bold uppercase tracking-wider text-amber-400 block">
                    Touchline Archive
                  </span>
                  <h1 className="text-xl sm:text-2xl font-extrabold text-white">
                    {managerCareer.profile.name} — Season History
                  </h1>
                  <p className="text-xs text-slate-400 mt-1">
                    Tap any completed season to inspect final standings, key results, top scorer, best &amp; worst moments, and director transfers.
                  </p>
                </div>
                <div className="flex items-center gap-3 bg-slate-900 border border-white/10 rounded-xl px-4 py-2.5 font-mono text-xs shrink-0">
                  <div>
                    <span className="text-slate-400 block">Seasons</span>
                    <span className="text-base font-extrabold text-white tabular-nums">{managerCareer.seasonHistory.length}</span>
                  </div>
                  <div className="h-7 w-px bg-white/10" />
                  <div>
                    <span className="text-slate-400 block">Rep</span>
                    <span className="text-base font-extrabold text-amber-400 tabular-nums">{managerCareer.profile.reputation}</span>
                  </div>
                  <div className="h-7 w-px bg-white/10" />
                  <div>
                    <span className="text-slate-400 block">Trophies</span>
                    <span className="text-base font-extrabold text-emerald-400 tabular-nums">{managerCareer.profile.trophiesWon.length}</span>
                  </div>
                </div>
              </div>

              {managerCareer.seasonHistory.length === 0 ? (
                <div className="bg-[#111827] border border-white/10 rounded-2xl p-10 text-center space-y-2">
                  <p className="text-sm font-bold text-white">No Completed Seasons Yet</p>
                  <p className="text-xs text-slate-400 max-w-md mx-auto">
                    Complete your current {seasonYear}/{seasonYear + 1} campaign to record your first season review and reputation appraisal.
                  </p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {managerCareer.seasonHistory.map((rec, idx) => (
                    <button
                      key={`${rec.seasonYear}_${rec.clubId}_${idx}`}
                      type="button"
                      onClick={() => {
                        sounds.playClick();
                        setReviewingSeasonRecord(rec);
                      }}
                      className="w-full text-left bg-[#111827] hover:bg-slate-900 border border-white/10 hover:border-amber-400/40 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-colors cursor-pointer"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span
                          className="w-3.5 h-3.5 rounded-full shrink-0 border border-white/20"
                          style={{ backgroundColor: rec.primaryColor }}
                        />
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-xs font-mono text-amber-400 font-bold">
                              {rec.seasonYear}/{rec.seasonYear + 1} · Age {rec.age}
                            </span>
                            {rec.wasSacked && (
                              <span className="px-2 py-0.5 rounded bg-rose-500/15 border border-rose-500/30 text-rose-300 text-[10px] font-bold uppercase">
                                Dismissed
                              </span>
                            )}
                          </div>
                          <p className="text-sm sm:text-base font-extrabold text-white truncate">
                            {rec.clubName}
                          </p>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-4 text-xs font-mono shrink-0">
                        <div>
                          <span className="text-slate-400 block">Finish</span>
                          <span className="font-extrabold text-white tabular-nums">#{rec.leaguePosition}</span>
                        </div>
                        <div>
                          <span className="text-slate-400 block">Points</span>
                          <span className="font-extrabold text-emerald-400 tabular-nums">{rec.leaguePoints} pts</span>
                        </div>
                        <div>
                          <span className="text-slate-400 block">Trophies</span>
                          <span className="font-bold text-amber-300">
                            {rec.trophiesWon.length > 0 ? rec.trophiesWon.join(', ') : '—'}
                          </span>
                        </div>
                        <span className="px-3 py-1.5 rounded-lg bg-amber-400/15 border border-amber-400/30 text-amber-300 font-bold">
                          Review
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {isManagerMode && managerCareer && currentTab === 'manager_offers' && (
            <div className="space-y-4">
              <div className="bg-[#111827] border border-white/10 rounded-2xl p-4 sm:p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <span className="text-xs font-bold uppercase tracking-wider text-amber-400 block">
                    Managerial Job Market
                  </span>
                  <h1 className="text-xl sm:text-2xl font-extrabold text-white">
                    {currentClub ? `Currently Managing ${currentClub.name}` : 'Free Agent — Seeking Next Post'}
                  </h1>
                  <p className="text-xs text-slate-400 mt-1">
                    {currentClub
                      ? 'New club approaches arrive at season end (or immediately if you become a free agent).'
                      : 'Select an approach below to take charge immediately, simulate forward for fresh offers, or transition your career.'}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  {!currentClub && (
                    <button
                      type="button"
                      onClick={() => setShowUnemployedModal(true)}
                      className="min-h-11 px-4 py-2 bg-amber-400 hover:bg-amber-300 text-slate-950 font-extrabold text-xs rounded-xl cursor-pointer"
                    >
                      Open Offer Hub
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleBecomeSportingDirector}
                    className="min-h-11 px-4 py-2 bg-blue-500/15 hover:bg-blue-500/25 border border-blue-500/30 text-blue-300 font-bold text-xs rounded-xl cursor-pointer"
                  >
                    Become Sporting Director
                  </button>
                  <button
                    type="button"
                    onClick={handleRetireManager}
                    className="min-h-11 px-4 py-2 bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-rose-300 font-bold text-xs rounded-xl cursor-pointer"
                  >
                    Retire
                  </button>
                </div>
              </div>

              {managerCareer.activeOffers.length === 0 ? (
                <div className="bg-[#111827] border border-white/10 rounded-2xl p-10 text-center space-y-3">
                  <p className="text-sm font-bold text-white">No Open Offers Right Now</p>
                  <p className="text-xs text-slate-400 max-w-md mx-auto">
                    {currentClub
                      ? `Clubs weigh approaches at the end of the ${seasonYear}/${seasonYear + 1} season based on your ${managerCareer.profile.reputation} reputation.`
                      : 'Advance a week to receive new club inquiries.'}
                  </p>
                  {!currentClub && (
                    <button
                      type="button"
                      onClick={handleAdvanceWeek}
                      disabled={isSimulating}
                      className="min-h-11 px-5 py-2.5 bg-amber-400 hover:bg-amber-300 text-slate-950 font-extrabold text-xs rounded-xl cursor-pointer"
                    >
                      {isSimulating ? 'Simulating...' : 'Simulate Next Week'}
                    </button>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {managerCareer.activeOffers.map(offer => {
                    const dirCfg = MANAGER_MODE_CONFIG.directors[offer.directorPersonality];
                    return (
                      <div
                        key={offer.id}
                        className="bg-[#111827] border border-white/10 rounded-2xl p-4 space-y-3 flex flex-col justify-between"
                      >
                        <div className="space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2.5 min-w-0">
                              <span
                                className="w-3.5 h-3.5 rounded-full shrink-0"
                                style={{ backgroundColor: offer.primaryColor }}
                              />
                              <div className="min-w-0">
                                <h3 className="text-base font-extrabold text-white truncate">{offer.clubName}</h3>
                                <span className="text-xs font-mono text-slate-400">
                                  Tier {offer.clubTier} · #{offer.leaguePosition} · Prestige {offer.clubPrestige}
                                </span>
                              </div>
                            </div>
                            {offer.isEmergencyOffer && (
                              <span className="px-2 py-0.5 rounded bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-[10px] font-bold uppercase">
                                Lifeline
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-slate-300">{offer.reason}</p>
                          <div className="grid grid-cols-2 gap-2 text-xs font-mono bg-slate-900/70 border border-white/5 rounded-xl p-2.5">
                            <div>
                              <span className="text-slate-400 block">Director</span>
                              <span className="text-white font-bold">{offer.directorName}</span>
                              <span className="text-amber-300 block">{dirCfg.shortLabel} ({offer.effectiveControl}% say)</span>
                            </div>
                            <div>
                              <span className="text-slate-400 block">Board Patience</span>
                              <span className="text-white font-bold capitalize">{offer.patience}</span>
                              <span className="text-slate-400 block truncate">{offer.expectation}</span>
                            </div>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleAcceptManagerOffer(offer)}
                          className="w-full min-h-11 px-4 py-2.5 bg-amber-400 hover:bg-amber-300 text-slate-950 font-extrabold text-xs rounded-xl cursor-pointer"
                        >
                          Accept Offer &amp; Manage {offer.clubName}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </ErrorBoundary>
      </main>

      {/* Non-blocking LocalStorage Quota Warning Toast */}
      {storageWarning && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-20 lg:bottom-4 right-3 left-3 sm:left-auto sm:max-w-md z-50 bg-rose-950/95 border border-rose-500/40 text-rose-100 rounded-xl px-4 py-3 shadow-2xl flex items-center justify-between gap-2.5 text-xs"
        >
          <span className="min-w-0">{storageWarning}</span>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={handleExportSave}
              className="min-h-9 px-2.5 py-1 rounded-lg bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold cursor-pointer"
            >
              Export
            </button>
            <button
              type="button"
              onClick={() => setStorageWarning(null)}
              aria-label="Dismiss storage warning"
              className="min-h-9 min-w-9 flex items-center justify-center rounded-lg text-rose-300 hover:text-white cursor-pointer"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      <PWAStatusToast hasBottomNav />

      {/* Modals & Overlays */}
      {weeklyDigest && (
        <WeeklyDigestModal
          digest={weeklyDigest}
          club={currentClub}
          allClubs={clubs}
          director={activeEngineDirector}
          owner={currentOwner}
          manager={currentManager}
          onClose={() => setWeeklyDigest(null)}
        />
      )}

      {!isManagerMode && isSacked && currentClub && currentOwner && director && (
        <SackedModal
          club={currentClub}
          owner={currentOwner}
          director={director}
          sackReason={sackReason ?? undefined}
          onEnterJobMarket={handleSackedEnterJobs}
          onBackToMainMenu={handleBackToMainMenu}
        />
      )}

      {!isManagerMode && seasonSummary && director && (
        <ErrorBoundary resetKey="season-finale">
          <SeasonFinaleModal
            summary={seasonSummary}
            playerClub={currentClub}
            director={director}
            owner={currentOwner}
            manager={currentManager}
            transferHistory={transferHistory}
            onAdvanceToNextSeason={handleAdvanceToNextSeason}
            onUpdateClub={handleUpdateClubFromAcademy}
            onBackToMainMenu={handleBackToMainMenu}
          />
        </ErrorBoundary>
      )}

      {isManagerMode && managerCareer && (managerCareer.pendingSeasonEnd || (managerCareer.currentClubId === null && showUnemployedModal)) && (
        <ErrorBoundary resetKey="manager-offers">
          <ManagerOffersModal
            career={managerCareer}
            currentClub={currentClub}
            seasonYear={seasonYear}
            currentWeek={currentWeek}
            isSackedUnemployment={Boolean(managerCareer.sackedBanner && !managerCareer.pendingSeasonEnd)}
            onStayAtClub={managerCareer.pendingSeasonEnd ? handleManagerStayAtClub : undefined}
            onDeclineRenewalAndLeave={
              managerCareer.pendingSeasonEnd?.contractExpired
                ? handleManagerDeclineRenewalAndLeave
                : undefined
            }
            onAcceptOffer={handleAcceptManagerOffer}
            onSimulateWhileUnemployed={!managerCareer.pendingSeasonEnd ? handleAdvanceWeek : undefined}
            onBecomeSportingDirector={handleBecomeSportingDirector}
            onRetire={handleRetireManager}
          />
        </ErrorBoundary>
      )}

      {isManagerMode && (
        <ManagerSeasonReviewModal
          record={reviewingSeasonRecord}
          onClose={() => setReviewingSeasonRecord(null)}
        />
      )}

    </div>
  );
}
