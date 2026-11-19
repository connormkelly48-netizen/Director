/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  Club,
  ClubDirector,
  DirectorPersonality,
  Owner,
  RecruitmentPhilosophy,
} from '../types/game';

/**
 * Data-driven Sporting Director seed structure.
 * An external JSON database of real/curated club directors can drop straight
 * into `EXTERNAL_DIRECTOR_DATABASE` keyed by `club.id` without changing any engine code.
 */
export interface DirectorDatabaseEntry {
  clubId: string;
  name: string;
  nationality: string;
  age: number;
  personality: DirectorPersonality;
  philosophy: RecruitmentPhilosophy;
  signingBias: ClubDirector['signingBias'];
}

const EXTERNAL_DIRECTOR_DATABASE: Record<string, DirectorDatabaseEntry> = {};

const DIRECTOR_FIRST_NAMES = [
  'Txiki', 'Monchi', 'Michael', 'Dan', 'Edu', 'Andrea', 'Jason', 'Stuart',
  'Richard', 'Dougie', 'Paul', 'Lee', 'Damien', 'Victor', 'Fabio', 'Beppe',
  'Luis', 'Sven', 'Christoph', 'Ralf', 'Gareth', 'Kieran', 'Marcus', 'Olivier',
  'Matteo', 'Henrik', 'Tomas', 'Niels', 'David', 'Graham', 'Mark', 'Neil',
];

const DIRECTOR_LAST_NAMES = [
  'Begiristain', 'Edwards', 'Ashworth', 'Gaspar', 'Berta', 'Wilcox', 'Webber',
  'Hughes', 'Freedman', 'Mitchell', 'Congerton', 'Comolli', 'Orta', 'Paratici',
  'Marotta', 'Campos', 'Mislintat', 'Freund', 'Rangnick', 'Whelan', 'Dowling',
  'McDermott', 'Roux', 'Giuntoli', 'Andersen', 'Rosicky', 'Kramer', 'Webber',
  'Barton', 'Fletcher', 'Reid', 'Callaghan',
];

const DIRECTOR_NATIONALITIES = [
  'England', 'Spain', 'Italy', 'Germany', 'Portugal', 'France',
  'Scotland', 'Netherlands', 'Belgium', 'Ireland', 'Wales', 'Denmark',
];

const PERSONALITY_POOL: DirectorPersonality[] = [
  'hands_off',
  'collaborative',
  'independent',
  'dictator',
];

const PHILOSOPHY_POOL: RecruitmentPhilosophy[] = [
  'moneyball_data',
  'youth_development',
  'domestic_grit',
  'marquee_stars',
];

function philosophyToSigningBias(philosophy: RecruitmentPhilosophy): ClubDirector['signingBias'] {
  switch (philosophy) {
    case 'youth_development':
      return 'youth';
    case 'moneyball_data':
      return 'value';
    case 'marquee_stars':
      return 'stars';
    case 'domestic_grit':
    default:
      return 'prime';
  }
}

export function createClubDirectorForClub(
  club: Club,
  owner?: Owner,
  usedNames?: Set<string>
): ClubDirector {
  const seeded = EXTERNAL_DIRECTOR_DATABASE[club.id];
  if (seeded) {
    return {
      id: `cd_${club.id}`,
      clubId: club.id,
      name: seeded.name,
      nationality: seeded.nationality,
      age: seeded.age,
      personality: seeded.personality,
      philosophy: seeded.philosophy,
      signingBias: seeded.signingBias,
    };
  }

  let candidateName = '';
  for (let attempt = 0; attempt < 25; attempt += 1) {
    const first = DIRECTOR_FIRST_NAMES[Math.floor(Math.random() * DIRECTOR_FIRST_NAMES.length)];
    const last = DIRECTOR_LAST_NAMES[Math.floor(Math.random() * DIRECTOR_LAST_NAMES.length)];
    const full = `${first} ${last}`;
    if (!usedNames || !usedNames.has(full)) {
      candidateName = full;
      usedNames?.add(full);
      break;
    }
  }
  if (!candidateName) {
    candidateName = `Alex ${club.shortName} Director`;
  }

  // Slight owner influence while keeping full personality distribution random across all 68 clubs
  const personalityRoll = Math.random();
  let personality: DirectorPersonality;
  if (owner?.involvement === 'micromanager' && personalityRoll < 0.35) {
    personality = 'dictator';
  } else if (owner?.involvement === 'hands_off' && personalityRoll < 0.35) {
    personality = 'hands_off';
  } else {
    personality = PERSONALITY_POOL[Math.floor(Math.random() * PERSONALITY_POOL.length)];
  }

  const philosophy =
    owner?.recruitmentPhilosophy ||
    PHILOSOPHY_POOL[Math.floor(Math.random() * PHILOSOPHY_POOL.length)];

  return {
    id: `cd_${club.id}`,
    clubId: club.id,
    name: candidateName,
    nationality:
      DIRECTOR_NATIONALITIES[Math.floor(Math.random() * DIRECTOR_NATIONALITIES.length)],
    age: 38 + Math.floor(Math.random() * 26),
    personality,
    philosophy,
    signingBias: philosophyToSigningBias(philosophy),
  };
}

export function assignClubDirectors(
  clubs: Club[],
  owners: Owner[] = []
): Record<string, ClubDirector> {
  const ownerById = new Map(owners.map(o => [o.id, o]));
  const usedNames = new Set<string>();
  const map: Record<string, ClubDirector> = {};

  clubs.forEach(club => {
    const owner = ownerById.get(club.ownerId);
    map[club.id] = createClubDirectorForClub(club, owner, usedNames);
  });

  return map;
}

export function getOrCreateClubDirector(
  clubDirectors: Record<string, ClubDirector>,
  club: Club,
  owner?: Owner
): ClubDirector {
  return clubDirectors[club.id] || createClubDirectorForClub(club, owner);
}
