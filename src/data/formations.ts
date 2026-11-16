/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { FormationId, PlayerPosition, SlotRole } from '../types/game';

export interface FormationSlot {
  role: SlotRole;
  x: number; // 0 (left) to 100 (right)
  y: number; // 0 (attacking end) to 100 (own goal)
}

export interface FormationDefinition {
  id: FormationId;
  name: string;
  summary: string;
  slots: FormationSlot[];
}

export const ROLE_TO_POSITION: Record<SlotRole, PlayerPosition> = {
  GK: 'GK',
  LB: 'DEF',
  RB: 'DEF',
  CB: 'DEF',
  LWB: 'DEF',
  RWB: 'DEF',
  CDM: 'MID',
  CM: 'MID',
  CAM: 'MID',
  LM: 'MID',
  RM: 'MID',
  LW: 'FWD',
  RW: 'FWD',
  ST: 'FWD',
};

export const FORMATION_IDS: readonly FormationId[] = [
  '4-3-3',
  '4-2-3-1',
  '4-4-2',
  '4-4-1-1',
  '4-2-2-2',
  '4-1-4-1',
  '3-5-2',
  '3-4-3',
  '3-4-2-1',
  '5-3-2',
];

export const FORMATIONS: Record<FormationId, FormationDefinition> = {
  '4-3-3': {
    id: '4-3-3',
    name: '4-3-3',
    summary: '4 Def · 3 Mid · 3 Fwd',
    slots: [
      { role: 'GK', x: 50, y: 92 },
      { role: 'LB', x: 14, y: 72 },
      { role: 'CB', x: 36, y: 76 },
      { role: 'CB', x: 64, y: 76 },
      { role: 'RB', x: 86, y: 72 },
      { role: 'CM', x: 28, y: 52 },
      { role: 'CDM', x: 50, y: 58 },
      { role: 'CM', x: 72, y: 52 },
      { role: 'LW', x: 16, y: 26 },
      { role: 'ST', x: 50, y: 18 },
      { role: 'RW', x: 84, y: 26 },
    ],
  },
  '4-2-3-1': {
    id: '4-2-3-1',
    name: '4-2-3-1',
    summary: '4 Def · 2 CDM · 3 AM · 1 ST',
    slots: [
      { role: 'GK', x: 50, y: 92 },
      { role: 'LB', x: 13, y: 73 },
      { role: 'CB', x: 34, y: 77 },
      { role: 'CB', x: 66, y: 77 },
      { role: 'RB', x: 87, y: 73 },
      { role: 'CDM', x: 34, y: 57 },
      { role: 'CDM', x: 66, y: 57 },
      { role: 'LW', x: 16, y: 36 },
      { role: 'CAM', x: 50, y: 38 },
      { role: 'RW', x: 84, y: 36 },
      { role: 'ST', x: 50, y: 17 },
    ],
  },
  '4-4-2': {
    id: '4-4-2',
    name: '4-4-2',
    summary: '4 Def · 4 Mid · 2 ST',
    slots: [
      { role: 'GK', x: 50, y: 92 },
      { role: 'LB', x: 13, y: 73 },
      { role: 'CB', x: 34, y: 77 },
      { role: 'CB', x: 66, y: 77 },
      { role: 'RB', x: 87, y: 73 },
      { role: 'LM', x: 14, y: 48 },
      { role: 'CM', x: 38, y: 52 },
      { role: 'CM', x: 62, y: 52 },
      { role: 'RM', x: 86, y: 48 },
      { role: 'ST', x: 36, y: 21 },
      { role: 'ST', x: 64, y: 21 },
    ],
  },
  '4-4-1-1': {
    id: '4-4-1-1',
    name: '4-4-1-1',
    summary: '4 Def · 4 Mid · 1 CAM · 1 ST',
    slots: [
      { role: 'GK', x: 50, y: 92 },
      { role: 'LB', x: 13, y: 73 },
      { role: 'CB', x: 34, y: 77 },
      { role: 'CB', x: 66, y: 77 },
      { role: 'RB', x: 87, y: 73 },
      { role: 'LM', x: 14, y: 51 },
      { role: 'CM', x: 38, y: 54 },
      { role: 'CM', x: 62, y: 54 },
      { role: 'RM', x: 86, y: 51 },
      { role: 'CAM', x: 50, y: 35 },
      { role: 'ST', x: 50, y: 16 },
    ],
  },
  '4-2-2-2': {
    id: '4-2-2-2',
    name: '4-2-2-2',
    summary: '4 Def · 2 CDM · 2 CAM · 2 ST',
    slots: [
      { role: 'GK', x: 50, y: 92 },
      { role: 'LB', x: 13, y: 73 },
      { role: 'CB', x: 34, y: 77 },
      { role: 'CB', x: 66, y: 77 },
      { role: 'RB', x: 87, y: 73 },
      { role: 'CDM', x: 34, y: 57 },
      { role: 'CDM', x: 66, y: 57 },
      { role: 'CAM', x: 25, y: 37 },
      { role: 'CAM', x: 75, y: 37 },
      { role: 'ST', x: 36, y: 18 },
      { role: 'ST', x: 64, y: 18 },
    ],
  },
  '4-1-4-1': {
    id: '4-1-4-1',
    name: '4-1-4-1',
    summary: '4 Def · 1 CDM · 4 Mid · 1 ST',
    slots: [
      { role: 'GK', x: 50, y: 92 },
      { role: 'LB', x: 13, y: 73 },
      { role: 'CB', x: 34, y: 77 },
      { role: 'CB', x: 66, y: 77 },
      { role: 'RB', x: 87, y: 73 },
      { role: 'CDM', x: 50, y: 59 },
      { role: 'LM', x: 13, y: 38 },
      { role: 'CM', x: 37, y: 41 },
      { role: 'CM', x: 63, y: 41 },
      { role: 'RM', x: 87, y: 38 },
      { role: 'ST', x: 50, y: 18 },
    ],
  },
  '3-5-2': {
    id: '3-5-2',
    name: '3-5-2',
    summary: '3 CB · 5 Mid · 2 ST',
    slots: [
      { role: 'GK', x: 50, y: 92 },
      { role: 'CB', x: 24, y: 72 },
      { role: 'CB', x: 50, y: 74 },
      { role: 'CB', x: 76, y: 72 },
      { role: 'LWB', x: 12, y: 47 },
      { role: 'CDM', x: 33, y: 53 },
      { role: 'CAM', x: 50, y: 36 },
      { role: 'CDM', x: 67, y: 53 },
      { role: 'RWB', x: 88, y: 47 },
      { role: 'ST', x: 36, y: 17 },
      { role: 'ST', x: 64, y: 17 },
    ],
  },
  '3-4-3': {
    id: '3-4-3',
    name: '3-4-3',
    summary: '3 CB · 4 Mid · 3 Fwd',
    slots: [
      { role: 'GK', x: 50, y: 92 },
      { role: 'CB', x: 24, y: 72 },
      { role: 'CB', x: 50, y: 74 },
      { role: 'CB', x: 76, y: 72 },
      { role: 'LM', x: 13, y: 48 },
      { role: 'CM', x: 38, y: 52 },
      { role: 'CM', x: 62, y: 52 },
      { role: 'RM', x: 87, y: 48 },
      { role: 'LW', x: 18, y: 24 },
      { role: 'ST', x: 50, y: 17 },
      { role: 'RW', x: 82, y: 24 },
    ],
  },
  '3-4-2-1': {
    id: '3-4-2-1',
    name: '3-4-2-1',
    summary: '3 CB · 4 Mid · 2 CAM · 1 ST',
    slots: [
      { role: 'GK', x: 50, y: 92 },
      { role: 'CB', x: 24, y: 72 },
      { role: 'CB', x: 50, y: 74 },
      { role: 'CB', x: 76, y: 72 },
      { role: 'LWB', x: 12, y: 50 },
      { role: 'CM', x: 37, y: 54 },
      { role: 'CM', x: 63, y: 54 },
      { role: 'RWB', x: 88, y: 50 },
      { role: 'CAM', x: 31, y: 34 },
      { role: 'CAM', x: 69, y: 34 },
      { role: 'ST', x: 50, y: 16 },
    ],
  },
  '5-3-2': {
    id: '5-3-2',
    name: '5-3-2',
    summary: '5 Def · 3 Mid · 2 ST',
    slots: [
      { role: 'GK', x: 50, y: 92 },
      { role: 'LWB', x: 11, y: 63 },
      { role: 'CB', x: 30, y: 72 },
      { role: 'CB', x: 50, y: 74 },
      { role: 'CB', x: 70, y: 72 },
      { role: 'RWB', x: 89, y: 63 },
      { role: 'CM', x: 26, y: 44 },
      { role: 'CDM', x: 50, y: 50 },
      { role: 'CM', x: 74, y: 44 },
      { role: 'ST', x: 36, y: 19 },
      { role: 'ST', x: 64, y: 19 },
    ],
  },
};
