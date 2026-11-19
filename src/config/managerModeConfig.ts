/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { DirectorPersonality } from '../types/game';

export interface DirectorPersonalityConfig {
  id: DirectorPersonality;
  label: string;
  shortLabel: string;
  description: string;
  baseControl: number;
  effectiveControlCap: number;
  reputationBonusMultiplier: number;
  weeklySignChance: number;
  allowDirectSign: boolean;
  allowRequests: boolean;
}

export const MANAGER_MODE_CONFIG = {
  /**
   * Starting reputation = Math.max(minStartingReputation, club.prestige - startingReputationOffset)
   */
  startingReputationOffset: 20,
  minStartingReputation: 0,

  /**
   * Sporting Director control spectrum & autonomous recruitment rates
   */
  directors: {
    hands_off: {
      id: 'hands_off',
      label: 'Hands-Off Director',
      shortLabel: 'Hands-Off',
      description: 'Grants you direct signing authority within club budget and wage limits.',
      baseControl: 90,
      effectiveControlCap: 100,
      reputationBonusMultiplier: 0.2,
      weeklySignChance: 0.12,
      allowDirectSign: true,
      allowRequests: false,
    },
    collaborative: {
      id: 'collaborative',
      label: 'Collaborative Director',
      shortLabel: 'Collaborative',
      description: 'Treats your transfer target requests seriously while actively shaping the squad.',
      baseControl: 54,
      effectiveControlCap: 92,
      reputationBonusMultiplier: 0.4,
      weeklySignChance: 0.24,
      allowDirectSign: false,
      allowRequests: true,
    },
    independent: {
      id: 'independent',
      label: 'Independent Director',
      shortLabel: 'Independent',
      description: 'Pursues an independent recruitment strategy and only occasionally backs your requests.',
      baseControl: 24,
      effectiveControlCap: 72,
      reputationBonusMultiplier: 0.45,
      weeklySignChance: 0.34,
      allowDirectSign: false,
      allowRequests: true,
    },
    dictator: {
      id: 'dictator',
      label: 'Dictator Director',
      shortLabel: 'Dictator',
      description: 'You are strictly the Head Coach. Transfer requests are disabled; the director handles all deals.',
      baseControl: 0,
      effectiveControlCap: 0,
      reputationBonusMultiplier: 0,
      weeklySignChance: 0.42,
      allowDirectSign: false,
      allowRequests: false,
    },
  } satisfies Record<DirectorPersonality, DirectorPersonalityConfig>,

  /**
   * Reputation changes applied at the end of each season (and on sackings).
   * Tweak these weights in one place to rebalance progression.
   */
  reputation: {
    min: 0,
    max: 100,
    winWeight: 0.24,
    lossPenaltyWeight: 0.22,
    trophyBonus: 8,
    promotionBonus: 6,
    relegationPenalty: -9,
    yearOverYearPerPlace: 0.5,
    yearOverYearCap: 6,
    expectationMetBonus: 2,
    expectationExceededPerPlace: 0.45,
    expectationMissedPerPlace: 0.55,
    tierMultiplier: {
      1: 1.15,
      2: 1.0,
      3: 0.85,
    } as Record<1 | 2 | 3, number>,
    sackingPenalty: -8,
  },

  /**
   * Job offer generation rules at season end and during unemployment.
   */
  jobOffers: {
    employedMinOffers: 1,
    employedMaxOffers: 4,
    unemployedMinOffers: 2,
    unemployedMaxOffers: 4,
    sackingMaxOffers: 2,
    reputationMargin: 16,
    tier1PrestigeGateOffset: 14,
    tier2PrestigeGateOffset: 10,
  },

  /**
   * Age 80+ mortality / forced retirement odds at each season end.
   * 20% at age 80, rising by +3 percentage points each subsequent season.
   */
  mortality: {
    startAge: 80,
    baseChance: 0.2,
    annualIncrement: 0.03,
    maxChance: 1.0,
  },

  /**
   * Fixed-length manager contract rules in Manager Mode.
   */
  contracts: {
    minYears: 1,
    maxYears: 5,
    defaultStartingYears: {
      1: 3,
      2: 2,
      3: 2,
    } as Record<1 | 2 | 3, number>,
    tierWageFloor: {
      1: 22000,
      2: 9000,
      3: 3500,
    } as Record<1 | 2 | 3, number>,
    tierWageCeiling: {
      1: 280000,
      2: 65000,
      3: 20000,
    } as Record<1 | 2 | 3, number>,
    compensationBaseAnnualPct: 0.35,
    compensationPerExtraYearPct: 0.15,
    compensationMaxAnnualMultiple: 0.95,
  },

  /**
   * Director tab requests: cooldowns, receptivity penalty, and effect sizes.
   */
  directorRequests: {
    cooldownWeeks: {
      more_power: 12,
      less_power: 4,
      pay_rise: 16,
      new_contract: 16,
      transfer_budget: 12,
      public_backing: 10,
      mutual_termination: 6,
    },
    rejectionPenaltyIncrement: 12,
    rejectionPenaltyCap: 36,
    weeklyPenaltyDecay: 2,
    powerUpStep: 8,
    powerDownStep: 10,
    maxPowerModifier: 24,
    minPowerModifier: -40,
    payRiseTargetPct: 0.2,
    payRiseCounterPct: 0.1,
    transferBudgetBoostPct: 0.22,
    publicBackingWeeks: 6,
    publicBackingTrustBoost: 8,
    publicBackingTrustFloorProtection: 10,
  },
} as const;
