import React, { useState } from 'react';
import { Club, Director, JobVacancy, Owner, Manager } from '../types/game';
import { Briefcase, Award, TrendingUp, Building2, Check, ArrowRight, UserX, AlertTriangle, ShieldCheck, UserCheck } from 'lucide-react';
import { sounds } from '../services/soundEffects';
import { Modal } from './ui/Modal';

interface JobMarketViewProps {
  director: Director;
  currentClub: Club | undefined;
  vacancies: JobVacancy[];
  allClubs: Club[];
  allOwners: Owner[];
  allManagers?: Manager[];
  currentManager?: Manager | undefined;
  onAcceptJob: (newClubId: string, updatedDirector: Director) => void;
  onResign: () => void;
  onHireManager?: (newManager: Manager | null, updatedDirector: Director, updatedClub: Club, updatedOwner: Owner) => void;
}

export const JobMarketView: React.FC<JobMarketViewProps> = ({
  director,
  currentClub,
  vacancies,
  allClubs,
  allOwners,
  allManagers,
  currentManager,
  onAcceptJob,
  onResign,
  onHireManager,
}) => {
  const [activeTab, setActiveTab] = useState<'director_vacancies' | 'available_managers'>('director_vacancies');
  const [selectedVacancy, setSelectedVacancy] = useState<JobVacancy | null>(null);
  const [interviewQuestion, setInterviewQuestion] = useState<{
    q: string;
    options: Array<{ text: string; fitsPhilosophy: string }>;
  } | null>(null);
  const [interviewResult, setInterviewResult] = useState<string | null>(null);
  const [canSignContract, setCanSignContract] = useState<boolean>(false);

  // Available Head Coaches / Managers filter states
  const [managerStyleFilter, setManagerStyleFilter] = useState<string>('all');
  const [managerSearchQuery, setManagerSearchQuery] = useState<string>('');
  const [managerFeedback, setManagerFeedback] = useState<string | null>(null);

  // Query strictly all available managers where clubId === null
  const availableManagers = (allManagers || []).filter(m => m.clubId === null);

  const filteredManagers = availableManagers.filter(m => {
    if (managerStyleFilter !== 'all' && m.tacticalStyle !== managerStyleFilter) return false;
    if (managerSearchQuery) {
      const q = managerSearchQuery.toLowerCase();
      if (!m.name.toLowerCase().includes(q) && !m.nationality.toLowerCase().includes(q)) {
        return false;
      }
    }
    return true;
  });

  const handleHireAvailableManager = (mgr: Manager) => {
    if (!currentClub || !onHireManager) return;
    const owner = allOwners.find(o => o.id === currentClub.ownerId);
    if (!owner) return;

    sounds.playSigningStamp();

    if (currentClub.wageBudget - currentClub.squad.reduce((a, b) => a + b.wage, 0) < mgr.wage) {
      setManagerFeedback(`HIRE FAILED: Insufficient weekly wage budget to meet ${mgr.name}'s demands (£${(mgr.wage / 1000).toFixed(0)}k/wk).`);
      return;
    }

    const updatedManager: Manager = {
      ...mgr,
      clubId: currentClub.id,
      trustInDirector: 75,
      contractYears: 3,
    };

    const updatedClub: Club = {
      ...currentClub,
      managerId: mgr.id,
    };

    const updatedDirector: Director = {
      ...director,
      boardTrust: Math.min(100, director.boardTrust + 5),
      fanApproval: Math.min(100, director.fanApproval + (mgr.reputation > 85 ? 10 : 4)),
    };

    const updatedOwner: Owner = {
      ...owner,
      approval: Math.min(100, owner.approval + 5),
    };

    setManagerFeedback(`APPOINTMENT CONFIRMED: ${mgr.name} has been appointed Head Coach of ${currentClub.name}!`);
    onHireManager(updatedManager, updatedDirector, updatedClub, updatedOwner);
  };

  const startInterview = (vac: JobVacancy) => {
    sounds.playClick();
    setSelectedVacancy(vac);
    setInterviewResult(null);
    setCanSignContract(false);

    const owner = allOwners.find(o => o.name === vac.ownerName);
    const ownerPhil = owner?.recruitmentPhilosophy || 'youth_development';

    setInterviewQuestion({
      q: `Chairman ${vac.ownerName}: "Welcome to ${vac.clubName}. Our objective is ${vac.expectation}. Given our financial parameters, what would be your primary recruitment directive in the upcoming window?"`,
      options: [
        {
          text: 'Leverage quantitative data analytics to identify undervalued talent with high resale multipliers.',
          fitsPhilosophy: 'moneyball_data',
        },
        {
          text: 'Invest aggressively in young academy prospects and give youth players extended first-team minutes.',
          fitsPhilosophy: 'youth_development',
        },
        {
          text: 'Target proven domestic leaders and battle-hardened veterans to secure immediate stability.',
          fitsPhilosophy: 'domestic_grit',
        },
        {
          text: 'Pursue marquee star signings that elevate our commercial stature and intimidate rivals.',
          fitsPhilosophy: 'marquee_stars',
        },
      ],
    });
  };

  const handleAnswer = (fitsPhilosophy: string) => {
    sounds.playClick();
    if (!selectedVacancy) return;
    const owner = allOwners.find(o => o.name === selectedVacancy.ownerName);
    const targetClub = allClubs.find(c => c.id === selectedVacancy.clubId);

    // Reputation check
    if (director.reputation < selectedVacancy.reputationRequired - 10) {
      sounds.playCrisis();
      setInterviewResult(`REJECTION: Chairman ${selectedVacancy.ownerName}: "We appreciate your interest, but the board requires an executive with higher pedigree for a club of our ambitions."`);
      return;
    }

    // Philosophical alignment check
    if (owner && owner.recruitmentPhilosophy === fitsPhilosophy) {
      sounds.playGavel();
      setInterviewResult(`INTERVIEW PASSED WITH DISTINCTION: Chairman ${selectedVacancy.ownerName}: "Your vision aligns impeccably with our strategic plan. The board is unanimous: we are offering you the Sporting Director contract!"`);
      setCanSignContract(true);
    } else {
      sounds.playClick();
      setInterviewResult(`OFFER EXTENDED: Chairman ${selectedVacancy.ownerName}: "While our philosophies differ slightly, your track record satisfies our criteria. We are prepared to offer you the post."`);
      setCanSignContract(true);
    }
  };

  const handleConfirmNewJob = () => {
    if (!selectedVacancy) return;
    sounds.playFanfare();

    const updatedDirector: Director = {
      ...director,
      currentClubId: selectedVacancy.clubId,
      contractYears: 3,
      boardTrust: 80,
      fanApproval: 75,
      salary: selectedVacancy.tier === 1 ? 55000 : selectedVacancy.tier === 2 ? 22000 : 7000,
    };

    onAcceptJob(selectedVacancy.clubId, updatedDirector);
    setSelectedVacancy(null);
  };

  return (
    <div className="space-y-6">
      
      {/* Header */}
      <div className="bg-[#111827] border border-white/10 rounded-2xl p-4 sm:p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold text-amber-400 uppercase tracking-wider mb-1">
              <Briefcase className="w-4 h-4" />
              <span>Director Career & Vacancy Board</span>
            </div>
            <h1 className="text-2xl lg:text-3xl font-extrabold text-white tracking-tight">
              Executive Career Suite & Job Market
            </h1>
            <p className="text-slate-400 text-xs mt-1 max-w-[75ch]">
              Review your executive pedigree, explore managerial vacancies, and interview with prospective club owners.
            </p>
          </div>

          {currentClub && (
            <button
              onClick={() => {
                sounds.playCrisis();
                onResign();
              }}
              className="w-full md:w-auto px-4 py-2 min-h-11 lg:min-h-0 bg-rose-500/10 hover:bg-rose-500/20 active:scale-[0.98] border border-rose-500/30 text-rose-300 font-bold text-xs rounded-xl flex items-center justify-center gap-2 transition-all cursor-pointer"
            >
              <UserX className="w-3.5 h-3.5" />
              <span>Resign from {currentClub.shortName}</span>
            </button>
          )}
        </div>
      </div>

      {/* Director CV Dossier */}
      <div className="bg-[#111827] border border-white/10 rounded-xl p-4 sm:p-6">
        <div className="border-b border-white/10 pb-3 mb-4">
          <h3 className="text-xs font-bold text-white uppercase tracking-wider">
            Curriculum Vitae: {director.name}
          </h3>
          <span className="text-xs sm:text-[11px] text-slate-400">
            Nationality: {director.nationality} · Age {director.age} · Philosophy: {director.philosophy}
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="bg-slate-900/80 border border-white/5 rounded-xl p-3.5">
            <span className="text-xs sm:text-[10px] text-slate-400 uppercase block mb-1">Global Reputation</span>
            <span className="text-xl font-bold font-mono text-amber-400 tabular-nums">
              {director.reputation} / 100
            </span>
          </div>

          <div className="bg-slate-900/80 border border-white/5 rounded-xl p-3.5">
            <span className="text-xs sm:text-[10px] text-slate-400 uppercase block mb-1">Current Club Post</span>
            <span className="text-sm font-bold text-white truncate block">
              {currentClub ? currentClub.name : 'Unemployed / Free Agent'}
            </span>
          </div>

          <div className="bg-slate-900/80 border border-white/5 rounded-xl p-3.5">
            <span className="text-xs sm:text-[10px] text-slate-400 uppercase block mb-1">Career Net Spend</span>
            <span className="text-xl font-bold font-mono text-emerald-400 tabular-nums">
              £{(director.netSpend / 1000000).toFixed(1)}M
            </span>
          </div>

          <div className="bg-slate-900/80 border border-white/5 rounded-xl p-3.5">
            <span className="text-xs sm:text-[10px] text-slate-400 uppercase block mb-1">Silverware & Trophies</span>
            <span className="text-xl font-bold font-mono text-blue-400 tabular-nums">
              {director.trophiesWon.length} Honours
            </span>
          </div>
        </div>
      </div>

      {/* Market Navigation Tabs */}
      <div className="flex flex-wrap items-center gap-2 border-b border-white/10 pb-3">
        <button
          onClick={() => setActiveTab('director_vacancies')}
          className={`px-4 py-2 min-h-11 lg:min-h-0 text-xs font-bold rounded-xl transition-all flex items-center gap-2 cursor-pointer ${
            activeTab === 'director_vacancies'
              ? 'bg-amber-400 text-slate-950 shadow-md shadow-amber-400/20'
              : 'bg-slate-900 text-slate-400 hover:text-white border border-white/5'
          }`}
        >
          <Briefcase className="w-3.5 h-3.5" />
          <span>Director Vacancies ({vacancies.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('available_managers')}
          className={`px-4 py-2 min-h-11 lg:min-h-0 text-xs font-bold rounded-xl transition-all flex items-center gap-2 cursor-pointer ${
            activeTab === 'available_managers'
              ? 'bg-amber-400 text-slate-950 shadow-md shadow-amber-400/20'
              : 'bg-slate-900 text-slate-400 hover:text-white border border-white/5'
          }`}
        >
          <UserCheck className="w-3.5 h-3.5" />
          <span>Available Head Coaches ({availableManagers.length})</span>
        </button>
      </div>

      {managerFeedback && (
        <div className="p-4 rounded-xl bg-slate-900 border border-amber-400/30 text-xs text-amber-300 flex items-center justify-between gap-2 animate-in fade-in">
          <span>{managerFeedback}</span>
          <button
            onClick={() => setManagerFeedback(null)}
            aria-label="Dismiss feedback"
            className="min-h-11 min-w-11 lg:min-h-0 lg:min-w-0 flex items-center justify-center rounded-lg text-slate-400 hover:text-white cursor-pointer shrink-0"
          >
            ✕
          </button>
        </div>
      )}

      {/* TAB 1: Available Vacancies List */}
      {activeTab === 'director_vacancies' && (
        <div className="bg-[#111827] border border-white/10 rounded-xl p-4 sm:p-6">
          <div className="border-b border-white/10 pb-3 mb-4 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                Vacant Sporting Director Positions
              </h3>
              <span className="text-xs sm:text-[11px] text-slate-400">
                Clubs currently recruiting sporting leadership across the 3 divisions
              </span>
            </div>
            <span className="text-xs text-amber-400 font-mono font-bold">
              {vacancies.length} Open Posts
            </span>
          </div>

          {vacancies.length === 0 ? (
            <div className="text-center py-8 text-xs text-slate-500">
              No director vacancies currently open. Advance simulation weeks to generate openings!
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-4">
              {vacancies.map(vac => (
                <div 
                  key={vac.clubId}
                  className="w-full bg-slate-900/80 border border-white/10 rounded-xl p-4 flex flex-col justify-between hover:border-white/20 transition-all"
                >
                  <div>
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <h4 className="text-base font-bold text-white">{vac.clubName}</h4>
                        <span className="text-xs text-slate-400">
                          {vac.tier === 1 ? 'Premier League' : vac.tier === 2 ? 'Championship' : 'League One'} · {vac.expectation}
                        </span>
                      </div>
                      <span className="text-xs sm:text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                        Req: {vac.reputationRequired} Rep
                      </span>
                    </div>

                    <div className="space-y-1 text-xs text-slate-300 my-2 pt-2 border-t border-white/5">
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400">Chairman:</span>
                        <span className="font-semibold text-slate-200">{vac.ownerName}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400">Owner Patience:</span>
                        <span className="font-semibold text-amber-400 capitalize">{vac.ownerPatience}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400">War Chest:</span>
                        <span className="font-mono text-white font-bold">£{(vac.transferBudget / 1000000).toFixed(1)}M</span>
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={() => startInterview(vac)}
                    className="w-full mt-3 py-2 min-h-11 lg:min-h-0 bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-slate-950 font-bold text-xs rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    <span>Attend Boardroom Interview</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: Available Head Coaches & Managers Market */}
      {activeTab === 'available_managers' && (
        <div className="bg-[#111827] border border-white/10 rounded-xl p-4 sm:p-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/10 pb-3 mb-4">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                  Available Head Coaches & Free Agent Managers
                </h3>
                <span className="px-2 py-0.5 rounded-full bg-amber-400/10 border border-amber-400/20 text-amber-400 font-mono text-xs sm:text-[10px] font-bold">
                  {filteredManagers.length} / {availableManagers.length} Available
                </span>
              </div>
              <span className="text-xs sm:text-[11px] text-slate-400">
                All 60 unattached tacticians (strictly clubId === null) available for interview and immediate appointment
              </span>
            </div>

            {/* Filter controls */}
            <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
              <input
                type="search"
                inputMode="search"
                value={managerSearchQuery}
                onChange={e => setManagerSearchQuery(e.target.value)}
                placeholder="Search coach..."
                className="px-3 py-2 min-h-11 lg:min-h-0 text-base md:text-xs bg-slate-900 border border-white/10 rounded-lg text-white placeholder-slate-500 w-full sm:w-44 focus:sm:w-52 transition-all"
              />
              <span className="text-xs text-slate-400">Style:</span>
              <select
                value={managerStyleFilter}
                onChange={e => setManagerStyleFilter(e.target.value)}
                className="px-3 py-2 min-h-11 lg:min-h-0 text-base md:text-xs bg-slate-900 border border-white/10 rounded-lg text-white flex-1 sm:flex-none"
              >
                <option value="all">All Tactical Styles</option>
                <option value="High Gegenpress">High Gegenpress</option>
                <option value="Tiki-Taka Possession">Tiki-Taka Possession</option>
                <option value="Direct Counter-Attack">Direct Counter-Attack</option>
                <option value="Pragmatic Low Block">Pragmatic Low Block</option>
                <option value="Fluid Wing Play">Fluid Wing Play</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-4">
            {filteredManagers.map(mgr => (
              <div 
                key={mgr.id}
                className="bg-slate-900/80 border border-white/10 rounded-xl p-4 flex flex-col justify-between hover:border-white/20 transition-all"
              >
                <div>
                  <div className="flex items-start justify-between mb-1.5">
                    <div>
                      <h4 className="text-sm font-bold text-white">{mgr.name}</h4>
                      <span className="text-xs sm:text-[11px] text-slate-400 block">{mgr.nationality} · Age {mgr.age}</span>
                    </div>
                    <span className="text-xs font-bold font-mono px-2 py-0.5 bg-amber-400/10 border border-amber-400/20 text-amber-400 rounded">
                      Rep {mgr.reputation}
                    </span>
                  </div>

                  <div className="space-y-1 text-xs text-slate-300 my-2 pt-2 border-t border-white/5">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">Tactics:</span>
                      <span className="font-semibold text-slate-200">{mgr.tacticalStyle}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">Preferred System:</span>
                      <span className="font-mono text-slate-200">{mgr.preferredFormation}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">Control Desire:</span>
                      <span className={`capitalize font-semibold ${
                        mgr.controlDesire === 'autocrat' ? 'text-rose-400' :
                        mgr.controlDesire === 'collaborator' ? 'text-amber-400' : 'text-emerald-400'
                      }`}>
                        {mgr.controlDesire}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">Wage Demand:</span>
                      <span className="font-mono text-emerald-400 font-bold">£{(mgr.wage / 1000).toFixed(0)}k/wk</span>
                    </div>
                  </div>

                  <p className="text-xs sm:text-[11px] text-slate-400 leading-snug italic font-serif mb-3 line-clamp-2">
                    "{mgr.profileSnippet}"
                  </p>
                </div>

                {currentClub && onHireManager ? (
                  <button
                    onClick={() => handleHireAvailableManager(mgr)}
                    className="w-full py-2 min-h-11 lg:min-h-0 bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-slate-950 font-bold text-xs rounded-lg transition-all cursor-pointer active:scale-95 flex items-center justify-center gap-1.5"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>Offer Contract ({mgr.name.split(' ')[0]})</span>
                  </button>
                ) : (
                  <div className="w-full py-1.5 text-center text-xs sm:text-[10px] text-slate-500 font-mono border border-white/5 rounded-lg">
                    Free Agent · Unattached
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Owner Interview Modal */}
      <Modal
        isOpen={Boolean(selectedVacancy && interviewQuestion)}
        onClose={() => setSelectedVacancy(null)}
        maxWidthClass="max-w-xl"
        ariaLabel={selectedVacancy ? `${selectedVacancy.clubName} Sporting Directorship Interview` : 'Boardroom Interview'}
        header={
          selectedVacancy && (
            <div>
              <span className="text-xs sm:text-[10px] font-bold text-amber-400 uppercase tracking-wider block">
                Boardroom Interview Session
              </span>
              <h3 className="text-xl font-extrabold text-white">
                {selectedVacancy.clubName} Sporting Directorship
              </h3>
              <span className="text-xs text-slate-400">
                Interviewer: Chairman {selectedVacancy.ownerName} ({selectedVacancy.ownerPatience} patience)
              </span>
            </div>
          )
        }
        footer={
          <div className="flex flex-wrap items-center justify-end gap-3">
            <button
              onClick={() => setSelectedVacancy(null)}
              className="px-4 py-2 min-h-11 lg:min-h-0 text-xs font-semibold text-slate-400 hover:text-white cursor-pointer"
            >
              Close
            </button>
            {canSignContract && (
              <button
                onClick={handleConfirmNewJob}
                className="px-6 py-2.5 min-h-11 lg:min-h-0 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-white font-extrabold text-xs rounded-xl shadow-lg shadow-emerald-500/20 transition-all cursor-pointer flex items-center gap-1.5"
              >
                <ShieldCheck className="w-4 h-4" />
                <span>Sign Executive Contract</span>
              </button>
            )}
          </div>
        }
      >
        {selectedVacancy && interviewQuestion && (
          <div>
            <p className="text-xs leading-relaxed text-slate-200 bg-slate-900/90 border border-white/5 p-4 rounded-xl mb-5 italic font-serif">
              "{interviewQuestion.q}"
            </p>

            {/* Answer Options */}
            {!interviewResult && (
              <div className="space-y-2.5">
                {interviewQuestion.options.map((opt, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleAnswer(opt.fitsPhilosophy)}
                    className="w-full p-3.5 min-h-11 bg-slate-900/60 hover:bg-slate-900 active:scale-[0.98] border border-white/10 hover:border-amber-400/50 rounded-xl text-left text-xs text-slate-300 hover:text-white transition-all cursor-pointer leading-snug"
                  >
                    <span className="font-bold text-amber-400 mr-2">{String.fromCharCode(65 + idx)}.</span>
                    {opt.text}
                  </button>
                ))}
              </div>
            )}

            {/* Result Display */}
            {interviewResult && (
              <div className="p-4 rounded-xl bg-slate-900 border border-white/10 text-xs text-slate-200 leading-relaxed">
                {interviewResult}
              </div>
            )}
          </div>
        )}
      </Modal>

    </div>
  );
};
