/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { PlayerPosition } from '../types/game';

export interface AcademyReputationBand {
  minPrestige: number;
  label: string;
  minOverall: number;
  maxOverall: number;
}

/**
 * Centralized Youth Academy configuration.
 * Adjust reputation bands, squad capacity, and seasonal position split here.
 */
export const YOUTH_ACADEMY_CONFIG = {
  totalCapacity: 10,
  generatedSlots: 7,
  freePoachSlots: 3,
  positionSplit: {
    GK: 1,
    DEF: 2,
    MID: 2,
    FWD: 2,
  } as Record<PlayerPosition, number>,
  ageRange: {
    min: 15,
    max: 18,
  },
  overallFloor: 42,
  overallCeiling: 74,
  /**
   * Maps club reputation (club.prestige, 1-100) to starting overall rating range
   * for newly generated academy youngsters. Evaluated top-down (highest minPrestige match wins).
   */
  reputationToRating: [
    { minPrestige: 88, label: 'World-Class Academy', minOverall: 58, maxOverall: 68 },
    { minPrestige: 78, label: 'Elite Category 1', minOverall: 54, maxOverall: 64 },
    { minPrestige: 68, label: 'Established Category 1', minOverall: 50, maxOverall: 60 },
    { minPrestige: 56, label: 'Developing Category 2', minOverall: 47, maxOverall: 56 },
    { minPrestige: 0, label: 'Grassroots Category 3', minOverall: 44, maxOverall: 52 },
  ] as AcademyReputationBand[],
} as const;

export function getAcademyRatingRangeForReputation(prestige: number): AcademyReputationBand {
  for (const band of YOUTH_ACADEMY_CONFIG.reputationToRating) {
    if (prestige >= band.minPrestige) {
      return band;
    }
  }
  return YOUTH_ACADEMY_CONFIG.reputationToRating[
    YOUTH_ACADEMY_CONFIG.reputationToRating.length - 1
  ];
}
