export const SAVE_STORAGE_KEY = 'the_boardroom_save_v2';
export const CURRENT_SAVE_VERSION = 3;

export interface SaveValidationResult {
  ok: boolean;
  error?: string;
  data?: Record<string, unknown>;
}

export function validateSaveJson(saveJson: string): SaveValidationResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(saveJson);
  } catch {
    return {
      ok: false,
      error: 'Invalid save file: the selected file is not valid JSON.',
    };
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return {
      ok: false,
      error: 'Invalid save file: expected a Boardroom save object.',
    };
  }

  const record = parsed as Record<string, unknown>;

  if (typeof record.saveVersion !== 'number') {
    return {
      ok: false,
      error: 'Invalid save file: missing saveVersion.',
    };
  }

  if (record.saveVersion !== 2 && record.saveVersion !== CURRENT_SAVE_VERSION) {
    return {
      ok: false,
      error: `Incompatible save version (${record.saveVersion}). Expected versions 2 or ${CURRENT_SAVE_VERSION}.`,
    };
  }

  if (!Array.isArray(record.clubs) || record.clubs.length === 0) {
    return {
      ok: false,
      error: 'Invalid save file: missing clubs data.',
    };
  }

  if (!Array.isArray(record.owners)) {
    return {
      ok: false,
      error: 'Invalid save file: missing owners data.',
    };
  }

  if (!Array.isArray(record.managers)) {
    return {
      ok: false,
      error: 'Invalid save file: missing managers data.',
    };
  }

  const isManagerMode = record.gameMode === 'manager';
  const director = record.director;
  const hasValidDirector =
    Boolean(director) &&
    typeof director === 'object' &&
    !Array.isArray(director) &&
    typeof (director as Record<string, unknown>).name === 'string';

  const managerCareer = record.managerCareer;
  const hasValidManagerCareer =
    Boolean(managerCareer) &&
    typeof managerCareer === 'object' &&
    !Array.isArray(managerCareer) &&
    Boolean((managerCareer as Record<string, unknown>).profile) &&
    typeof ((managerCareer as Record<string, unknown>).profile as Record<string, unknown>).name === 'string';

  if (isManagerMode) {
    if (!hasValidManagerCareer) {
      return {
        ok: false,
        error: 'Invalid save file: missing Manager Mode career profile.',
      };
    }
  } else if (!hasValidDirector) {
    return {
      ok: false,
      error: 'Invalid save file: missing director profile.',
    };
  }

  return { ok: true, data: record };
}
