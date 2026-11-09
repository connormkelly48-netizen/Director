# Uncapped Player Development & Dynamic Growth System

Eliminates the legacy hard potential ceiling from every player and prospect in the game, replacing it with an uncapped dynamic growth engine where any player can ascend to a maximum of 99 overall rating through strong match ratings, consistent playing time, high form, and positive morale.

### User Review & Critical Decisions

> [!IMPORTANT]
> The fixed `potential` attribute (e.g. 50–99 cap) is completely deprecated. In its place, progression is fluid and momentum-driven, allowing any player in the footballing pyramid the authentic opportunity to achieve world-class 99 status if properly developed.

- **Confirmed Decision 1 (Growth Drivers)**: Progression is dynamically calculated using player match ratings, minutes/appearances, current form streaks (e.g., $\ge 6.8$), happiness, and an organic age curve (rapid development ages 16–23, prime stability 24–29, gradual physical adaptation 30+).
- **Confirmed Decision 2 (Youth Academy System)**: Replaces scouted min/max potential numbers (e.g. `74–91 Potential`) with scouted **Growth Momentum Tiers** (e.g., *Generational Talent*, *High Tempo*, *Steady Climber*, *Late Surge*) reflecting developmental acceleration rather than a pre-determined ceiling.
- **Confirmed Decision 3 (UI Table & Card Representation)**: Replaces the static `Pot` column in Squad, Transfers, and Dashboard views with a **Growth Momentum** indicator (e.g., 🚀 *Accelerating*, 📈 *Rising*, ⚖️ *Established*, 📉 *Cooling*) complete with sorting and tooltip details.

---

### 1. Overview & Core Concept

- **What It Does**: Unshackles player development across all clubs. No player is locked into a mediocre rating by an invisible pre-determined cap. Young prospects, lower-league gems, and breakout stars can perpetually improve season after season up to the maximum rating of 99, provided they receive regular playing time, stay in good form, and maintain high morale.
- **Target Audience / Persona**: Football directors and managers who value discovering hidden talent, nurturing academy graduates, and developing unexpected stars through smart management rather than simply buying high-potential metadata badges.
- **Key Value**: Delivers genuine football realism where development is driven by on-pitch accomplishment and managerial trust rather than static spreadsheet limits.

---

### 2. User Experience & Visual Design

- **Key User Flows**:
  - **Squad Overview**: Users inspect their squad list; instead of a static potential number that spoils a player's destiny, they see the dynamic **Growth Momentum** trajectory badge alongside their current `OVR`, age, and match form.
  - **Youth Academy Scouting**: Academy reports feature vibrant scouting breakdowns highlighting initial skill readiness and **Developmental Momentum** tiers (e.g. *Generational Talent*, *High Tempo*, *Diamond in the Rough*), showing how aggressively they will grow upon senior promotion.
  - **Weekly Digest & Simulation**: After matches, players with top ratings (7.0+) and consistent starts experience progression notifications; weekly digest recaps highlight breakouts who made overall rating jumps.
  - **Season Finale & Aging**: Annual aging applies natural growth boosts to younger players and allows prime performers to continue scaling upward toward 99, while veterans only decline if neglected or physically waning.

- **Visual Identity & Theme**:
  - *Aesthetic Direction*: Refined athletic data dashboard using dark slate surfaces (`#0f172a`, `#1e293b`), crisp hairline dividers, and high-legibility tabular metrics.
  - *Color Palette & Tokens*:
    - Neutral Canvas: Deep stadium slate (`bg-slate-950`, `bg-slate-900/60`).
    - Momentum Accelerating: Electric emerald (`text-emerald-400`, `bg-emerald-500/10`).
    - Momentum Rising: Vivid cyan (`text-cyan-400`, `bg-cyan-500/10`).
    - Momentum Stable / Prime: Slate silver (`text-slate-300`, `bg-slate-700/30`).
    - Momentum Cooling / Decline: Amber rose (`text-amber-400`, `text-rose-400`).
  - *Typography & Hierarchy*: High-impact sans-serif display headers paired with `tabular-nums` monospace numerical data for ratings and statistics. No code-style prefixes, zero decorative pulsing dots, and no static pill sandwiches.
  - *Component Styling & Layout*: Clean tabular views with responsive column sorting, single-line labels (`whitespace-nowrap`), and clean tooltip explainers.

---

### 3. Key Product Decisions & Trade-Offs

- **Decision 1: Removal of Hard Potential Capping in Simulation**:
  - *Chosen Approach*: Rewrite `processSquadProgression` and annual season aging in `simulationEngine.ts`. Growth checks evaluate `overall < 99` rather than `overall < potential`. Probability of growth scales with match form (bonus for $\ge 7.0$), appearances count, morale, youth age bracket (16–23 highest gain, 24–28 moderate gain, 29+ maintain/slow), and manager coaching.
  - *Why*: Directly satisfies the user's mandate that any player has the opportunity to reach 99 rating providing everything goes well.
  - *Alternatives Considered*: Raising potential to 99 for all players artificially without changing logic (inferior because it leaves confusing phantom potential fields and doesn't model performance-dependent growth momentum).

- **Decision 2: Growth Momentum Model (`growthMomentum`)**:
  - *Chosen Approach*: Introduce a computed or tracked dynamic status for each player: `'breakout'` (accelerating), `'rapid'` (rising fast), `'steady'` (consistent growth), `'prime'` (stable elite), or `'cooling'` (at risk of stagnation).
  - *Why*: Gives managers actionable tactical feedback on whether their training, match selection, and form are successfully elevating their players toward 99.

- **Decision 3: Youth Academy Scouting Overhaul**:
  - *Chosen Approach*: Replace `potentialMin`, `potentialMax`, and `truePotential` in `AcademyPlayer` with scouting traits and `developmentTempo` tiers (`'generational'`, `'rapid'`, `'steady'`, `'volatile'`). Scout reports give rich textual narratives on playstyle and growth trajectory.
  - *Why*: Maintains high scouting intrigue and decision-making without giving away a rigid mathematical cap.

---

### 4. Technical Architecture & Data Strategy

```
┌─────────────────────────────────────────────────────────────┐
│                       Simulation Engine                     │
│  - processSquadProgression() [Form + Minutes + 99 Max OVR]  │
│  - processSeasonTransition() [Annual Uncapped Aging Loop]   │
│  - generateYouthIntake() [Momentum Tiers + Scout Reports]   │
└──────────────────────────────┬──────────────────────────────┘
                               │
            ┌──────────────────┴──────────────────┐
            ▼                                     ▼
┌────────────────────────┐             ┌────────────────────────┐
│     Player Entity      │             │  AcademyPlayer Entity  │
│ - overall (40-99)      │             │ - overall (45-72)      │
│ - growthMomentum       │             │ - momentumTier         │
│ - (potential removed)  │             │ - (potential removed)  │
└───────────┬────────────┘             └───────────┬────────────┘
            │                                     │
            ▼                                     ▼
┌─────────────────────────────────────────────────────────────┐
│                         UI Views                            │
│ ├─ SquadView: Momentum Badges, 99 Ceiling Progress Bar      │
│ ├─ TransfersView: Scouted Momentum & Overall Target Sorting │
│ ├─ YouthAcademyView: Development Tiers & Scouting Reports   │
│ └─ DashboardView: Top Growth Risers & Development Feed     │
└─────────────────────────────────────────────────────────────┘
```

- **Data Model Updates (`src/types/game.ts`)**:
  - Deprecate `potential: number` on `Player`; add `growthMomentum?: 'breakout' | 'rapid' | 'steady' | 'prime' | 'cooling'`.
  - Remove `potentialMin`, `potentialMax`, `truePotential` on `AcademyPlayer`; add `momentumTier: 'Generational' | 'High Tempo' | 'Steady Climber' | 'Late Surge'`.
  - Update `clubsData.ts` to remove static `potential` definitions and replace them with initial growth trajectories.

- **Engine Updates (`src/services/simulationEngine.ts`)**:
  - `processSquadProgression`: Weekly checks allow overall growth up to 99 based on match form, appearances, and happiness.
  - `processSeasonTransition`: Annual youth and prime progression caps at 99.
  - `generateYouthIntake`: Generates prospects with momentum tiers and scout reports.
  - `promoteAcademyPlayer`: Seamlessly promotes prospects into senior players with dynamic starting momentum.

- **UI Updates (`SquadView`, `TransfersView`, `YouthAcademyView`, `DashboardView`, `SeasonFinaleModal`)**:
  - Update table headers from `POT` to `MOMENTUM` / `GROWTH`.
  - Render crisp momentum status chips with trend arrows and ratings out of 99.
  - Update Youth Academy cards to display the prospect's Development Tempo and Scout Assessment instead of min/max numerical bars.
