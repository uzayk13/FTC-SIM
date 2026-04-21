import type { ProjectFile } from './CodeRunner';
import {
  AXIS_FIELDS, BUTTON_FIELDS,
  type GamepadField, type GamepadIdx,
  isAxisField, isButtonField,
} from '../input/Keymap';

export interface GamepadUsage {
  gamepad: GamepadIdx;
  field: GamepadField;
  isAxis: boolean;
  usages: UsageSite[];
}

export interface UsageSite {
  file: string;
  line: number;
  snippet: string;
}

const KNOWN_FIELDS = new Set<string>([...AXIS_FIELDS, ...BUTTON_FIELDS]);

/**
 * Scan user project files for references to gamepad1.X / gamepad2.X.
 * Returns one entry per (gamepad, field) pair actually used, with the
 * source locations so the UI can show what each binding controls.
 */
export function scanGamepadUsage(files: ProjectFile[]): GamepadUsage[] {
  const map = new Map<string, GamepadUsage>();

  for (const file of files) {
    if (!/\.(java|kt|kts)$/i.test(file.path)) continue;
    const lines = file.content.split('\n');
    const re = /\bgamepad([12])\s*\.\s*([a-zA-Z_][a-zA-Z0-9_]*)/g;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (stripComments(line).indexOf('gamepad') === -1) continue;
      re.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(line)) !== null) {
        const gpNum = parseInt(m[1], 10) as GamepadIdx;
        const field = m[2];
        if (!KNOWN_FIELDS.has(field)) continue;

        const key = `${gpNum}.${field}`;
        let entry = map.get(key);
        if (!entry) {
          entry = {
            gamepad: gpNum,
            field: field as GamepadField,
            isAxis: isAxisField(field),
            usages: [],
          };
          map.set(key, entry);
        }
        if (entry.usages.length < 5) {
          entry.usages.push({
            file: file.path,
            line: i + 1,
            snippet: line.trim(),
          });
        }
      }
    }
  }

  return Array.from(map.values()).sort((a, b) => {
    if (a.gamepad !== b.gamepad) return a.gamepad - b.gamepad;
    const order = [...AXIS_FIELDS, ...BUTTON_FIELDS];
    return order.indexOf(a.field) - order.indexOf(b.field);
  });
}

/** Rough: drop contents of // line comments. Block comments not handled. */
function stripComments(line: string): string {
  const idx = line.indexOf('//');
  return idx === -1 ? line : line.slice(0, idx);
}

// Re-export so UI can reference without pulling Keymap types directly
export { isAxisField, isButtonField };
export type { GamepadField };
