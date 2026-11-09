/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { Club, Director, DelegationMatrix, Manager, Owner, Player, WeeklyDigest, JobVacancy, SeasonSummary } from './types/game';
import { generateFullClubDatabase } from './data/clubsData';
import { advanceSimulationWeek, evaluateTakeoverEvents, generateJobVacancies, calculateSeasonSummary, advanceToNextSeason, generateYouthIntake } from './services/simulationEngine';
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
import { WeeklyDigestModal } from './components/WeeklyDigestModal';
import { SackedModal } from './components/SackedModal';
import { SeasonFinaleModal } from './components/SeasonFinaleModal';
import { MainMenu } from './components/MainMenu';
import { sounds } from './services/soundEffects';

const STORAGE_KEY = 'the_boardroom_save_v1';

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
  const [isSimulating, setIsSimulating] = useState(false);
  const [isSacked, setIsSacked] = useState(false);
  const [newsAlert, setNewsAlert] = useState<string | null>(null);
  const [seasonSummary, setSeasonSummary] = useState<SeasonSummary | null>(null);

  const [delegation, setDelegation] = useState<DelegationMatrix>({
    transferSignings: 'director',
    transferSales: 'director',
    contractRenewals: 'director',
    youthPromotion: 'director',
    tacticalStyle: 'manager_freedom',
  });

  // Load from local storage or generate fresh database
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const data = JSON.parse(saved);
        const rawClubs: Club[] = data.clubs || [];
        const year = data.seasonYear || 2026;
        const hydratedClubs = rawClubs.map(c => {
          if (!c.academy || c.academy.length === 0) {
            return { ...c, academy: generateYouthIntake(c, year) };
          }
          return c;
        });
        setClubs(hydratedClubs);
        setOwners(data.owners || []);
        setManagers(data.managers || []);
        setFreeAgents(data.freeAgents || []);
        setDirector(data.director || null);
        setCurrentWeek(data.currentWeek || 1);
        setSeasonYear(year);
        setDelegation(data.delegation || {
          transferSignings: 'director',
          transferSales: 'director',
          contractRenewals: 'director',
          youthPromotion: 'director',
          tacticalStyle: 'manager_freedom',
        });
      } else {
        const { clubs: genClubs, owners: genOwners, managers: genManagers, freeAgents: genFA } = generateFullClubDatabase();
        setClubs(genClubs);
        setOwners(genOwners);
        setManagers(genManagers);
        setFreeAgents(genFA);
      }
    } catch {
      const { clubs: genClubs, owners: genOwners, managers: genManagers, freeAgents: genFA } = generateFullClubDatabase();
      setClubs(genClubs);
      setOwners(genOwners);
      setManagers(genManagers);
      setFreeAgents(genFA);
    }
    setIsInitialized(true);
  }, []);

  // Autosave when key states change
  useEffect(() => {
    if (!isInitialized || !director) return;
    try {
      const payload = {
        clubs,
        owners,
        managers,
        freeAgents,
        director,
        currentWeek,
        seasonYear,
        delegation,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // Storage quota safety
    }
  }, [clubs, owners, managers, freeAgents, director, currentWeek, seasonYear, delegation, isInitialized]);

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

  // Character Creation Handler
  const handleCompleteSetup = (newDirector: Director, startingClubId: string) => {
    sounds.playFanfare();
    setDirector(newDirector);
    setCurrentWeek(1);
    setCurrentTab('dashboard');
    setIsCreatingCareer(false);
    setInMainMenu(false);
  };

  const handleSaveToLocalStorage = () => {
    if (!director) return;
    try {
      const payload = {
        clubs,
        owners,
        managers,
        freeAgents,
        director,
        currentWeek,
        seasonYear,
        delegation,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // Storage quota safety
    }
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
    setIsCreatingCareer(true);
    setInMainMenu(false);
  };

  const handleExportSave = () => {
    try {
      const payload = {
        version: 1,
        savedAt: new Date().toISOString(),
        clubs,
        owners,
        managers,
        freeAgents,
        director,
        currentWeek,
        seasonYear,
        delegation,
      };
      const jsonStr = JSON.stringify(payload, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `boardroom_career_${director?.name.replace(/\s+/g, '_') || 'save'}_wk${currentWeek}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Export error', err);
    }
  };

  const handleImportSave = (saveJson: string): boolean => {
    try {
      const data = JSON.parse(saveJson);
      if (!data.clubs || !Array.isArray(data.clubs)) return false;
      const year = data.seasonYear || 2026;
      const hydratedClubs = data.clubs.map((c: Club) => {
        if (!c.academy || c.academy.length === 0) {
          return { ...c, academy: generateYouthIntake(c, year) };
        }
        return c;
      });

      setClubs(hydratedClubs);
      setOwners(data.owners || []);
      setManagers(data.managers || []);
      setFreeAgents(data.freeAgents || []);
      setDirector(data.director || null);
      setCurrentWeek(data.currentWeek || 1);
      setSeasonYear(year);
      if (data.delegation) setDelegation(data.delegation);

      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        clubs: hydratedClubs,
        owners: data.owners || [],
        managers: data.managers || [],
        freeAgents: data.freeAgents || [],
        director: data.director || null,
        currentWeek: data.currentWeek || 1,
        seasonYear: year,
        delegation: data.delegation,
      }));

      return true;
    } catch (err) {
      return false;
    }
  };

  const handleResetDatabase = () => {
    localStorage.removeItem(STORAGE_KEY);
    const { clubs: genClubs, owners: genOwners, managers: genManagers, freeAgents: genFA } = generateFullClubDatabase();
    setClubs(genClubs);
    setOwners(genOwners);
    setManagers(genManagers);
    setFreeAgents(genFA);
    setDirector(null);
    setCurrentWeek(1);
    setSeasonYear(2026);
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
        digest,
      } = advanceSimulationWeek(
        currentWeek,
        seasonYear,
        clubs,
        owners,
        managers,
        director,
        delegation
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

      const nextWeek = currentWeek + 1;
      setCurrentWeek(nextWeek);
      setWeeklyDigest(digest);
      setIsSimulating(false);

      // When week 46 is reached, every team has played each other twice -> Trigger Season Finale!
      if (nextWeek >= 46) {
        const summary = calculateSeasonSummary(seasonYear, updatedClubs, updatedDirector, currentOwner);
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
    let iterDirector = { ...director };
    let weekCounter = currentWeek;

    while (weekCounter < 20) {
      const res = advanceSimulationWeek(
        weekCounter,
        seasonYear,
        iterClubs,
        iterOwners,
        iterManagers,
        iterDirector,
        delegation
      );
      iterClubs = res.updatedClubs;
      iterOwners = res.updatedOwners;
      iterManagers = res.updatedManagers;
      iterDirector = res.updatedDirector;
      weekCounter++;
    }

    setClubs(iterClubs);
    setOwners(iterOwners);
    setManagers(iterManagers);
    setDirector(iterDirector);
    setCurrentWeek(20);
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
    let iterDirector = { ...director };
    let weekCounter = currentWeek;

    while (weekCounter <= 46) {
      const res = advanceSimulationWeek(
        weekCounter,
        seasonYear,
        iterClubs,
        iterOwners,
        iterManagers,
        iterDirector,
        delegation
      );
      iterClubs = res.updatedClubs;
      iterOwners = res.updatedOwners;
      iterManagers = res.updatedManagers;
      iterDirector = res.updatedDirector;
      weekCounter++;
    }

    setClubs(iterClubs);
    setOwners(iterOwners);
    setManagers(iterManagers);
    setDirector(iterDirector);
    setCurrentWeek(46);
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

    setClubs(newClubs);
    setOwners(newOwners);
    setManagers(newManagers);
    setFreeAgents(newFreeAgents);
    setSeasonYear(newSeasonYear);
    setCurrentWeek(1);
    setSeasonSummary(null);

    if (stayAtClub && director.currentClubId) {
      setDirector(newDirector);
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
    setClubs(prev => prev.map(c => c.id === updatedClub.id ? updatedClub : c));
    setDirector(updatedDirector);
    setOwners(prev => prev.map(o => o.id === updatedOwner.id ? updatedOwner : o));
  };

  // Handle Squad Update
  const handleUpdateSquad = (updatedSquad: Player[], updatedClub: Club) => {
    const clubWithSquad = { ...updatedClub, squad: updatedSquad };
    setClubs(prev => prev.map(c => c.id === clubWithSquad.id ? clubWithSquad : c));
  };

  // Handle Youth Academy Update
  const handleUpdateClubFromAcademy = (updatedClub: Club) => {
    setClubs(prev => prev.map(c => c.id === updatedClub.id ? updatedClub : c));
  };

  // Handle Transfer Completion
  const handleCompleteTransfer = (
    signedPlayer: Player,
    fee: number,
    updatedCurrentClub: Club,
    updatedSellingClub: Club | null,
    updatedDirector: Director,
    updatedOwner: Owner,
    updatedManager: Manager | undefined
  ) => {
    setClubs(prev => prev.map(c => {
      if (c.id === updatedCurrentClub.id) return updatedCurrentClub;
      if (updatedSellingClub && c.id === updatedSellingClub.id) return updatedSellingClub;
      return c;
    }));

    setFreeAgents(prev => prev.filter(fa => fa.id !== signedPlayer.id));
    setDirector(updatedDirector);
    setOwners(prev => prev.map(o => o.id === updatedOwner.id ? updatedOwner : o));
    if (updatedManager) {
      setManagers(prev => prev.map(m => m.id === updatedManager.id ? updatedManager : m));
    }
  };

  // Handle Job Market Contract Sign
  const handleAcceptJob = (newClubId: string, updatedDirector: Director) => {
    setDirector(updatedDirector);
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
    setIsSacked(false);
    setCurrentTab('jobs');
  };

  if (!isInitialized) {
    return (
      <div className="min-h-screen bg-[#0b0f17] flex items-center justify-center text-slate-400 font-mono text-xs">
        Loading Boardroom Database...
      </div>
    );
  }

  // Main Menu Screen
  if (inMainMenu && !isCreatingCareer) {
    return (
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
    );
  }

  // Character Creation (when starting a new career)
  if (isCreatingCareer || !director) {
    return (
      <div className="min-h-screen bg-[#0b0f17]">
        <CharacterCreationModal
          clubs={clubs}
          owners={owners}
          onComplete={handleCompleteSetup}
          onBackToMainMenu={() => {
            setIsCreatingCareer(false);
            setInMainMenu(true);
          }}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0b0f17] text-slate-100 flex flex-col font-sans selection:bg-amber-500/20 selection:text-amber-200">
      
      {/* Top Bar Contract Navigation */}
      <Header
        currentTab={currentTab}
        setCurrentTab={setCurrentTab}
        currentWeek={currentWeek}
        seasonYear={seasonYear}
        club={currentClub}
        director={director}
        onAdvanceWeek={handleAdvanceWeek}
        onFastForwardJan={handleFastForwardJan}
        onFastForwardSummer={handleFastForwardSummer}
        onBackToMainMenu={handleBackToMainMenu}
        isSimulating={isSimulating}
      />

      {/* Breaking News Alert Banner */}
      {newsAlert && (
        <div className="bg-amber-400/10 border-b border-amber-400/20 px-4 py-2 text-xs text-amber-300 font-medium flex items-center justify-between">
          <div className="max-w-7xl mx-auto w-full flex items-center justify-between">
            <span>📢 {newsAlert}</span>
            <button onClick={() => setNewsAlert(null)} className="text-amber-400 hover:text-white ml-3 cursor-pointer">✕</button>
          </div>
        </div>
      )}

      {/* Main Viewport Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 lg:px-8 py-6">
        {currentTab === 'dashboard' && (
          <DashboardView
            club={currentClub}
            director={director}
            owner={currentOwner}
            manager={currentManager}
            allClubs={clubs}
            currentWeek={currentWeek}
            seasonYear={seasonYear}
            onNavigate={setCurrentTab}
            onAdvanceWeek={handleAdvanceWeek}
            isSimulating={isSimulating}
          />
        )}

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
            manager={currentManager}
            director={director}
            delegation={delegation}
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
            onUpdateSquad={handleUpdateSquad}
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
            onCompleteTransfer={handleCompleteTransfer}
          />
        )}

        {currentTab === 'jobs' && (
          <JobMarketView
            director={director}
            currentClub={currentClub}
            vacancies={vacancies}
            allClubs={clubs}
            allOwners={owners}
            onAcceptJob={handleAcceptJob}
            onResign={handleResign}
          />
        )}
      </main>

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
        <SeasonFinaleModal
          summary={seasonSummary}
          playerClub={currentClub}
          director={director}
          owner={currentOwner}
          onAdvanceToNextSeason={handleAdvanceToNextSeason}
          onUpdateClub={handleUpdateClubFromAcademy}
          onBackToMainMenu={handleBackToMainMenu}
        />
      )}

    </div>
  );
}
