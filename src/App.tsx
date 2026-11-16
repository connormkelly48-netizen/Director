/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Club, Director, DelegationMatrix, Manager, Owner, Player, WeeklyDigest, SeasonSummary, GameweekRecord, LeagueTier, TransferRecord, TransferProposal, IncomingBid, Lineup } from './types/game';
import { loadDatabase } from './data/database';
import { advanceSimulationWeek, evaluateTakeoverEvents, generateJobVacancies, calculateSeasonSummary, advanceToNextSeason, generateYouthIntake, offerPlayerToClubs, acceptIncomingBid, createTransferRecord } from './services/simulationEngine';
import { capTransferHistory, completeSigning, completeSale, evaluateSigning, verifyManagerDeal } from './services/transferService';
import { autoPickLineup, getDefaultFormation, syncLineupAfterSquadChange } from './utils/lineup';
import { Header } from './components/Header';
import { CharacterCreationModal } from './components/CharacterCreationModal';
import { DashboardView } from './components/DashboardView';
import { BoardroomView } from './components/BoardroomView';
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

const STORAGE_KEY = SAVE_STORAGE_KEY;

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

  if (!club.academy || club.academy.length === 0) {
    club.academy = generateYouthIntake(club, year);
  }
  return club;
}

export default function App() {
  const [isInitialized, setIsInitialized] = useState(false);
  const [inMainMenu, setInMainMenu] = useState(true);
  const [isCreatingCareer, setIsCreatingCareer] = useState(false);
  const [clubs, setClubs] = useState<Club[]>([]);
  const [owners, setOwners] = useState<Owner[]>([]);
  const [managers, setManagers] = useState<Manager[]>([]);
  const [freeAgents, setFreeAgents] = useState<Player[]>([]);
  const [director, setDirector] = useState<Director | null>(null);
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
  const [newsAlert, setNewsAlert] = useState<string | null>(null);
  const [seasonSummary, setSeasonSummary] = useState<SeasonSummary | null>(null);
  const [storageWarning, setStorageWarning] = useState<string | null>(null);

  const [delegation, setDelegation] = useState<DelegationMatrix>({
    transferSignings: 'director',
    transferSales: 'director',
    contractRenewals: 'director',
    youthPromotion: 'director',
    tacticalStyle: 'manager_freedom',
  });

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

        // Old saves are incompatible: if saveVersion is not 2, ignore, remove key, and start fresh at main menu
        if (!data || data.saveVersion !== 2) {
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
        const rawManagers: Manager[] = data.managers || [];
        const year = data.seasonYear || 2026;
        const dbData = loadDatabase();
        const hydratedClubs = rawClubs.map(c => migrateClubData(c, year, dbData.clubs));
        const migratedFreeAgents = Array.isArray(data.freeAgents)
          ? data.freeAgents.map(migratePlayerData)
          : [];
        const migratedHistory = Array.isArray(data.transferHistory)
          ? capTransferHistory(data.transferHistory.map(migrateTransferRecord))
          : [];

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
        setDelegation(data.delegation || {
          transferSignings: 'director',
          transferSales: 'director',
          contractRenewals: 'director',
          youthPromotion: 'director',
          tacticalStyle: 'manager_freedom',
        });
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
    if (!isInitialized || !director) return null;
    return {
      saveVersion: CURRENT_SAVE_VERSION,
      clubs,
      owners,
      managers,
      freeAgents,
      director,
      currentWeek,
      seasonYear,
      gameweekHistory,
      transferHistory,
      transferProposals,
      incomingBids,
      delegation,
    };
  }, [isInitialized, director, clubs, owners, managers, freeAgents, currentWeek, seasonYear, gameweekHistory, transferHistory, transferProposals, incomingBids, delegation]);

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

  // Derived current club, owner, manager
  const currentClub = useMemo(() => {
    if (!director || !director.currentClubId) return undefined;
    return clubs.find(c => c.id === director.currentClubId);
  }, [clubs, director]);

  const currentOwner = useMemo(() => {
    if (!currentClub) return undefined;
    return owners.find(o => o.id === currentClub.ownerId);
  }, [currentClub, owners]);

  const currentManager = useMemo(() => {
    if (!currentClub || !currentClub.managerId) return undefined;
    return managers.find(m => m.id === currentClub.managerId);
  }, [currentClub, managers]);

  // Generate job vacancies
  const vacancies = useMemo(() => {
    return generateJobVacancies(clubs, owners, director?.currentClubId || null);
  }, [clubs, owners, director]);

  const pendingProposalsCount = useMemo(
    () => transferProposals.filter(p => p.status === 'pending').length,
    [transferProposals]
  );

  // Character Creation Handler
  const handleCompleteSetup = (newDirector: Director, _startingClubId: string) => {
    sounds.playFanfare();
    immediateSaveOnNextCommitRef.current = true;
    setDirector(newDirector);
    setCurrentWeek(1);
    setCurrentTab('dashboard');
    setIsCreatingCareer(false);
    setInMainMenu(false);
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
  };

  const handleContinueCareer = () => {
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
    setGameweekHistory([]);
    setTransferHistory([]);
    setTransferProposals([]);
    setIncomingBids([]);
    setCurrentWeek(1);
    setSeasonYear(2026);
    setIsCreatingCareer(true);
    setInMainMenu(false);
  };

  const handleExportSave = () => {
    try {
      const payload = latestSavePayloadRef.current ?? (director ? {
        saveVersion: CURRENT_SAVE_VERSION,
        clubs,
        owners,
        managers,
        freeAgents,
        director,
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
      const importedDelegation: DelegationMatrix = data.delegation || delegation;

      setClubs(hydratedClubs);
      setOwners(data.owners as Owner[]);
      setManagers(data.managers as Manager[]);
      setFreeAgents(migratedFreeAgents);
      setDirector(data.director as Director);
      setCurrentWeek(week);
      setSeasonYear(year);
      setGameweekHistory(migratedGameweeks);
      setTransferHistory(migratedHistory);
      setTransferProposals(migratedProposals);
      setIncomingBids(migratedBids);
      if (data.delegation) setDelegation(importedDelegation);

      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
          saveVersion: CURRENT_SAVE_VERSION,
          clubs: hydratedClubs,
          owners: data.owners,
          managers: data.managers,
          freeAgents: migratedFreeAgents,
          director: data.director,
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
    setDirector(null);
    setCurrentWeek(1);
    setSeasonYear(2026);
    setGameweekHistory([]);
    setTransferHistory([]);
    setTransferProposals([]);
    setIncomingBids([]);
    setIsCreatingCareer(false);
    setInMainMenu(true);
  };

  // Advance Single Week Simulation
  const handleAdvanceWeek = () => {
    if (!director || isSimulating) return;

    // If season already completed (every team has played each other twice), show finale review
    if (currentWeek >= 46) {
      const summary = calculateSeasonSummary(seasonYear, clubs, director, currentOwner);
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
      if (newIncomingBids && newIncomingBids.length > 0) {
        setIncomingBids(prev => [...newIncomingBids, ...prev]);
      }

      const nextWeek = currentWeek + 1;
      setCurrentWeek(nextWeek);
      setWeeklyDigest(digest);
      setIsSimulating(false);

      // When week 46 is reached, every team has played each other twice -> Trigger Season Finale!
      if (nextWeek >= 46) {
        const latestClub = updatedDirector.currentClubId
          ? updatedClubs.find(c => c.id === updatedDirector.currentClubId)
          : undefined;
        const latestOwner = latestClub
          ? finalOwners.find(o => o.id === latestClub.ownerId)
          : currentOwner;
        const summary = calculateSeasonSummary(seasonYear, updatedClubs, updatedDirector, latestOwner);
        setSeasonSummary(summary);
        sounds.playFanfare();
        setNewsAlert(`SEASON ${seasonYear}/${seasonYear + 1} HAS COMPLETED! Every team has played each other twice.`);
      }

      // Check Sacking criteria: Board trust reaches 0
      if (updatedDirector.boardTrust <= 0 && updatedDirector.currentClubId) {
        setIsSacked(true);
        sounds.playCrisis();
      }
    }, 400);
  };

  // Fast-Forward to January Transfer Window (Week 20)
  const handleFastForwardJan = () => {
    if (!director || currentWeek >= 20 || isSimulating) return;
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
      iterClubs = res.updatedClubs;
      iterOwners = res.updatedOwners;
      iterManagers = res.updatedManagers;
      iterDirector = res.updatedDirector;
      iterFreeAgents = res.updatedFreeAgents;
      iterProposals = res.updatedTransferProposals;
      newRecords.push(res.gameweekRecord);
      if (res.newTransfers && res.newTransfers.length > 0) {
        newTransfersList.unshift(...res.newTransfers);
        iterHistory = capTransferHistory([...res.newTransfers, ...iterHistory]);
      }
      weekCounter++;
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
    setCurrentWeek(20);
    immediateSaveOnNextCommitRef.current = true;
    setIsSimulating(false);
    sounds.playFanfare();
    setNewsAlert(`JANUARY TRANSFER WINDOW IS NOW OPEN! The winter window is active. Review your war chest and scout reinforcements.`);
    setCurrentTab('transfers');
  };

  // Fast-Forward to Summer / Season End (Week 46 when every team has played each other twice)
  const handleFastForwardSummer = () => {
    if (!director || isSimulating) return;
    if (currentWeek >= 46) {
      const summary = calculateSeasonSummary(seasonYear, clubs, director, currentOwner);
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
      iterClubs = res.updatedClubs;
      iterOwners = res.updatedOwners;
      iterManagers = res.updatedManagers;
      iterDirector = res.updatedDirector;
      iterFreeAgents = res.updatedFreeAgents;
      iterProposals = res.updatedTransferProposals;
      newRecords.push(res.gameweekRecord);
      if (res.newTransfers && res.newTransfers.length > 0) {
        newTransfersList.unshift(...res.newTransfers);
        iterHistory = capTransferHistory([...res.newTransfers, ...iterHistory]);
      }
      weekCounter++;
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
    setCurrentWeek(46);
    immediateSaveOnNextCommitRef.current = true;
    setIsSimulating(false);

    const summary = calculateSeasonSummary(seasonYear, iterClubs, iterDirector, currentOwner);
    setSeasonSummary(summary);
    sounds.playFanfare();
    setNewsAlert(`SEASON ${seasonYear}/${seasonYear + 1} CONCLUDED! Every team has played each other twice. Review final standings.`);
  };

  // Advance to Next Season (Infinite Career Progression)
  const handleAdvanceToNextSeason = (stayAtClub: boolean) => {
    if (!seasonSummary || !director) return;

    const {
      newClubs,
      newOwners,
      newManagers,
      newFreeAgents,
      newDirector,
      newSeasonYear,
    } = advanceToNextSeason(
      seasonSummary,
      clubs,
      owners,
      managers,
      freeAgents,
      director
    );

    immediateSaveOnNextCommitRef.current = true;
    setClubs(newClubs);
    setOwners(newOwners);
    setManagers(newManagers);
    setFreeAgents(newFreeAgents);
    setSeasonYear(newSeasonYear);
    setCurrentWeek(1);
    setGameweekHistory([]);
    setSeasonSummary(null);

    if (stayAtClub && director.currentClubId) {
      setDirector(newDirector);
      setTransferProposals(prev => prev.map(p => (p.status === 'pending' ? { ...p, status: 'expired' as const } : p)));
      setCurrentTab('dashboard');
      setNewsAlert(`SEASON ${newSeasonYear}/${newSeasonYear + 1} HAS BEGUN! Promotions & relegations applied, TV cash disbursed, and the Summer Transfer Window is now open.`);
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
    updatedOwner: Owner
  ) => {
    if (newManager) {
      setManagers(prev => {
        const exists = prev.some(m => m.id === newManager.id);
        if (exists) {
          return prev.map(m => m.id === newManager.id ? newManager : m);
        }
        return [...prev, newManager];
      });
    }

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
    setClubs(prev => prev.map(c => c.id === syncedClub.id ? syncedClub : c));
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

  // Handle Youth Academy Update (also logs academy promotions to Transfer History)
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
            'director',
            `Promoted from ${updatedClub.name} Youth Academy`
          )
        );
        setTransferHistory(prev => capTransferHistory([...promoRecords, ...prev]));
      }
    }
    const syncedClub: Club = updatedClub.lineup
      ? { ...updatedClub, lineup: syncLineupAfterSquadChange(updatedClub, currentManager) }
      : updatedClub;
    setClubs(prev => prev.map(c => c.id === syncedClub.id ? syncedClub : c));
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
    setDirector(updatedDirector);
    setOwners(prev => prev.map(o => o.id === updatedOwner.id ? updatedOwner : o));
    if (updatedManager) {
      setManagers(prev => prev.map(m => m.id === updatedManager.id ? updatedManager : m));
    }
    setTransferHistory(prev => capTransferHistory([record, ...prev]));
  };

  // Sell player directly from SquadView Sell/Release popup
  const handleSellPlayerFromSquad = (
    player: Player,
    buyingClub: Club,
    fee: number,
    wage: number,
    trustDelta = 0
  ) => {
    if (!currentClub || !director) return;
    const result = completeSale({
      player,
      sellerClub: currentClub,
      buyingClub,
      clubs,
      director,
      manager: currentManager,
      fee,
      wage,
      season: seasonYear,
      week: currentWeek,
      initiatedBy: 'director',
    });

    if (trustDelta !== 0 && result.manager) {
      result.manager.trustInDirector = Math.max(0, Math.min(100, result.manager.trustInDirector + trustDelta));
    }

    setClubs(result.clubs);
    setDirector(result.director);
    if (result.manager) {
      setManagers(prev => prev.map(m => m.id === result.manager!.id ? result.manager! : m));
    }
    setTransferHistory(prev => capTransferHistory([result.record, ...prev]));
    setTransferProposals(prev => prev.map(p => (p.playerId === player.id && p.status === 'pending' ? { ...p, status: 'expired' as const } : p)));
    setIncomingBids(prev => prev.map(b => (b.playerId === player.id && b.status === 'pending' ? { ...b, status: 'rejected' as const } : b)));
    sounds.playSigningStamp();
    setNewsAlert(`TRANSFER AGREED: ${player.name} sold to ${buyingClub.name} for £${(fee / 1000000).toFixed(2)}M.`);
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
    const bids = offerPlayerToClubs(playerId, askingPrice, clubs, director.currentClubId, currentWeek, seasonYear);
    if (bids.length > 0) {
      setIncomingBids(prev => [...bids, ...prev]);
    }
    return bids;
  };

  // Accept incoming transfer bid (transfers player, credits fee, frees wage, logs history)
  const handleAcceptBid = (bidId: string, trustDelta = 0) => {
    if (!director?.currentClubId) return;
    const bid = incomingBids.find(b => b.id === bidId);
    if (!bid || bid.status !== 'pending') return;

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
    } catch (err) {
      console.error('Failed to accept transfer bid', err);
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
    setDirector(updatedDirector);
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
  if (inMainMenu && !isCreatingCareer) {
    return (
      <>
        <MainMenu
          director={director}
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
          onExportSave={handleExportSave}
          onImportSave={handleImportSave}
          onResetDatabase={handleResetDatabase}
        />
        <PWAStatusToast />
      </>
    );
  }

  // Character Creation (when starting a new career)
  if (isCreatingCareer || !director) {
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

  return (
    <div className="min-h-dvh bg-[#0b0f17] text-slate-100 flex flex-col font-sans selection:bg-amber-500/20 selection:text-amber-200 overflow-x-clip">
      
      {/* Top Bar Contract Navigation */}
      <Header
        currentTab={currentTab}
        setCurrentTab={setCurrentTab}
        currentWeek={currentWeek}
        seasonYear={seasonYear}
        club={currentClub}
        director={director}
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
            club={currentClub}
            director={director}
            owner={currentOwner}
            manager={currentManager}
            allClubs={clubs}
            currentWeek={currentWeek}
            seasonYear={seasonYear}
            gameweekHistory={gameweekHistory}
            onNavigate={setCurrentTab}
            onAdvanceWeek={handleAdvanceWeek}
            isSimulating={isSimulating}
          />
        )}

        <ErrorBoundary resetKey={currentTab}>
          {currentTab === 'boardroom' && currentClub && currentOwner && (
            <BoardroomView
              club={currentClub}
              owner={currentOwner}
              director={director}
              onUpdateClub={handleUpdateClubFromBoardroom}
            />
          )}

          {currentTab === 'responsibilities' && currentClub && (
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

          {currentTab === 'manager' && currentClub && currentOwner && (
            <ManagerView
              club={currentClub}
              currentManager={currentManager}
              allManagers={managers}
              director={director}
              owner={currentOwner}
              onUpdateManager={handleUpdateManager}
            />
          )}

          {currentTab === 'squad' && currentClub && (
            <SquadView
              club={currentClub}
              allClubs={clubs}
              manager={currentManager}
              delegation={delegation}
              onUpdateSquad={handleUpdateSquad}
              onUpdateLineup={handleUpdateLineup}
              onSellPlayer={handleSellPlayerFromSquad}
              onReleasePlayer={handleReleasePlayerFromSquad}
              onOfferPlayerToClubs={handleOfferPlayerToClubs}
            />
          )}

          {currentTab === 'academy' && currentClub && (
            <YouthAcademyView
              club={currentClub}
              seasonYear={seasonYear}
              onUpdateClub={handleUpdateClubFromAcademy}
            />
          )}

          {currentTab === 'transfers' && currentClub && currentOwner && (
            <TransfersView
              currentClub={currentClub}
              allClubs={clubs}
              freeAgents={freeAgents}
              director={director}
              owner={currentOwner}
              manager={currentManager}
              delegation={delegation}
              transferHistory={transferHistory}
              transferProposals={transferProposals}
              incomingBids={incomingBids}
              seasonYear={seasonYear}
              currentWeek={currentWeek}
              onCompleteTransfer={handleCompleteTransfer}
              onApproveProposal={handleApproveProposal}
              onRejectProposal={handleRejectProposal}
              onAcceptBid={handleAcceptBid}
              onRejectBid={handleRejectBid}
              onOfferPlayerToClubs={handleOfferPlayerToClubs}
            />
          )}

          {currentTab === 'jobs' && (
            <JobMarketView
              director={director}
              currentClub={currentClub}
              vacancies={vacancies}
              allClubs={clubs}
              allOwners={owners}
              allManagers={managers}
              currentManager={currentManager}
              onAcceptJob={handleAcceptJob}
              onResign={handleResign}
              onHireManager={handleUpdateManager}
            />
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
          director={director}
          owner={currentOwner}
          manager={currentManager}
          onClose={() => setWeeklyDigest(null)}
        />
      )}

      {isSacked && currentClub && currentOwner && (
        <SackedModal
          club={currentClub}
          owner={currentOwner}
          director={director}
          onEnterJobMarket={handleSackedEnterJobs}
          onBackToMainMenu={handleBackToMainMenu}
        />
      )}

      {seasonSummary && (
        <ErrorBoundary resetKey="season-finale">
          <SeasonFinaleModal
            summary={seasonSummary}
            playerClub={currentClub}
            director={director}
            owner={currentOwner}
            onAdvanceToNextSeason={handleAdvanceToNextSeason}
            onUpdateClub={handleUpdateClubFromAcademy}
            onBackToMainMenu={handleBackToMainMenu}
          />
        </ErrorBoundary>
      )}

    </div>
  );
}
