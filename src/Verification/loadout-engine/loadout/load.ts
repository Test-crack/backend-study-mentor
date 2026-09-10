/**
 * Reading a loadout off disk.
 *
 * Read as data rather than imported, so moving loadouts to a database later is a
 * storage swap rather than an engine change.
 */

import fs from 'fs';
import path from 'path';
import { validateLoadout, LoadoutError, type Loadout } from './schema';

export function loadLoadoutFromFile(filePath: string): Loadout {
  let text: string;
  try {
    text = fs.readFileSync(filePath, 'utf8');
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new LoadoutError(`could not read loadout at ${filePath}: ${message}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new LoadoutError(`loadout at ${filePath} is not valid JSON: ${message}`);
  }

  const loadout = parsed as Loadout;
  validateLoadout(loadout);
  return loadout;
}

/** The one loadout authored so far. */
export function ieltsDrillsLoadout(): Loadout {
  return loadLoadoutFromFile(path.join(__dirname, 'ielts-drills.json'));
}
