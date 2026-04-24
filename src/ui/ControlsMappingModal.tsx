import { useEffect, useMemo, useState } from 'react';
import type { ProjectFile } from '../code-runner/CodeRunner';
import { scanGamepadUsage, type GamepadUsage } from '../code-runner/GamepadUsageScanner';
import {
  defaultKeymap, emptyKeymap, loadSavedKeymap, saveKeymap,
  displayKey, RESERVED_KEYS,
  type Keymap, type GamepadBindings,
  type AxisField, type ButtonField,
} from '../input/Keymap';

interface Props {
  files: ProjectFile[];
  onStart: (keymap: Keymap) => void;
  onCancel: () => void;
}

type Slot =
  | { kind: 'axis'; gamepad: 1 | 2; field: AxisField; direction: 'positive' | 'negative' }
  | { kind: 'button'; gamepad: 1 | 2; field: ButtonField };

function slotId(s: Slot): string {
  return s.kind === 'axis'
    ? `gp${s.gamepad}-${s.field}-${s.direction}`
    : `gp${s.gamepad}-${s.field}`;
}

export function ControlsMappingModal({ files, onStart, onCancel }: Props) {
  const usage = useMemo(() => scanGamepadUsage(files), [files]);

  const [keymap, setKeymap] = useState<Keymap>(() => loadSavedKeymap() ?? defaultKeymap());
  const [rebinding, setRebinding] = useState<Slot | null>(null);
  const [conflictMsg, setConflictMsg] = useState<string>('');

  useEffect(() => {
    if (!rebinding) return;
    const handler = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.code === 'Escape') {
        setRebinding(null);
        setConflictMsg('');
        return;
      }
      if (RESERVED_KEYS.has(e.code)) {
        setConflictMsg(`${displayKey(e.code)} is reserved for camera/simulator controls.`);
        return;
      }
      assignKey(rebinding, e.code);
      setRebinding(null);
      setConflictMsg('');
    };
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [rebinding]);

  const assignKey = (slot: Slot, code: string) => {
    setKeymap((prev) => {
      const next: Keymap = JSON.parse(JSON.stringify(prev));
      const bindings = slot.gamepad === 1 ? next.gamepad1 : next.gamepad2;
      if (slot.kind === 'axis') {
        const ax = bindings.axes[slot.field] ?? {};
        ax[slot.direction] = code;
        bindings.axes[slot.field] = ax;
      } else {
        bindings.buttons[slot.field] = { key: code };
      }
      return next;
    });
  };

  const clearSlot = (slot: Slot) => {
    setKeymap((prev) => {
      const next: Keymap = JSON.parse(JSON.stringify(prev));
      const bindings = slot.gamepad === 1 ? next.gamepad1 : next.gamepad2;
      if (slot.kind === 'axis') {
        const ax = bindings.axes[slot.field];
        if (ax) {
          delete ax[slot.direction];
          if (!ax.positive && !ax.negative) delete bindings.axes[slot.field];
        }
      } else {
        delete bindings.buttons[slot.field];
      }
      return next;
    });
  };

  const resetToDefault = () => setKeymap(defaultKeymap());

  const handleStart = () => {
    saveKeymap(keymap);
    onStart(filterKeymapToUsage(keymap, usage));
  };

  const bindingFor = (slot: Slot): string | undefined => {
    const bindings = slot.gamepad === 1 ? keymap.gamepad1 : keymap.gamepad2;
    if (slot.kind === 'axis') return bindings.axes[slot.field]?.[slot.direction];
    return bindings.buttons[slot.field]?.key;
  };

  const collisions = useMemo(() => findCollisions(keymap), [keymap]);

  return (
    <div className="mapping-modal-backdrop">
      <div className="mapping-modal">
        <div className="mapping-header">
          <h2>Keyboard Bindings</h2>
          <p>
            {usage.length === 0
              ? "No gamepad inputs detected in the uploaded code. You can still start the simulator."
              : `The uploaded code uses ${usage.length} gamepad input${usage.length === 1 ? '' : 's'}. Click a key to rebind it.`}
          </p>
        </div>

        <div className="mapping-body">
          {usage.length === 0 ? (
            <div className="mapping-empty">
              No <code>gamepad1</code> or <code>gamepad2</code> references found.
            </div>
          ) : (
            <div className="mapping-list">
              {usage.map((u) => (
                <UsageRow
                  key={`${u.gamepad}.${u.field}`}
                  usage={u}
                  bindingFor={bindingFor}
                  onRebind={setRebinding}
                  onClear={clearSlot}
                  rebinding={rebinding}
                  collisions={collisions}
                />
              ))}
            </div>
          )}

          <div className="mapping-reserved">
            <h4>Reserved (cannot be rebound)</h4>
            <ul>
              <li><kbd>F</kbd> — Toggle freecam</li>
              <li><kbd>1</kbd> / <kbd>2</kbd> / <kbd>3</kbd> — Camera presets</li>
              <li><kbd>H</kbd> — Toggle controls panel</li>
              <li><kbd>Esc</kbd> — Cancel rebind</li>
            </ul>
          </div>
        </div>

        {rebinding && (
          <div className="mapping-capture-banner">
            Press any key to bind {slotLabel(rebinding)}. <kbd>Esc</kbd> to cancel.
            {conflictMsg && <div className="mapping-conflict">{conflictMsg}</div>}
          </div>
        )}

        <div className="mapping-footer">
          <button className="mapping-btn-secondary" onClick={onCancel}>← Back</button>
          <button className="mapping-btn-secondary" onClick={resetToDefault}>Reset to defaults</button>
          <div style={{ flex: 1 }} />
          <button className="mapping-btn-primary" onClick={handleStart}>Start Simulator →</button>
        </div>
      </div>
    </div>
  );
}

interface UsageRowProps {
  usage: GamepadUsage;
  bindingFor: (slot: Slot) => string | undefined;
  onRebind: (slot: Slot) => void;
  onClear: (slot: Slot) => void;
  rebinding: Slot | null;
  collisions: Set<string>;
}

function UsageRow({ usage, bindingFor, onRebind, onClear, rebinding, collisions }: UsageRowProps) {
  const isTrigger = usage.field === 'left_trigger' || usage.field === 'right_trigger';

  const slots: Slot[] = usage.isAxis
    ? isTrigger
      ? [{ kind: 'axis', gamepad: usage.gamepad, field: usage.field as AxisField, direction: 'positive' }]
      : [
          { kind: 'axis', gamepad: usage.gamepad, field: usage.field as AxisField, direction: 'positive' },
          { kind: 'axis', gamepad: usage.gamepad, field: usage.field as AxisField, direction: 'negative' },
        ]
    : [{ kind: 'button', gamepad: usage.gamepad, field: usage.field as ButtonField }];

  return (
    <div className="mapping-row">
      <div className="mapping-field">
        <div className="mapping-field-name">gamepad{usage.gamepad}.{usage.field}</div>
        {usage.usages[0] && (
          <div className="mapping-field-snippet" title={usage.usages.map(u => `${u.file}:${u.line}  ${u.snippet}`).join('\n')}>
            {usage.usages[0].file.split('/').pop()}:{usage.usages[0].line} — <code>{truncate(usage.usages[0].snippet, 70)}</code>
          </div>
        )}
      </div>
      <div className="mapping-slots">
        {slots.map((slot) => {
          const bound = bindingFor(slot);
          const isActive = rebinding && slotId(rebinding) === slotId(slot);
          const collides = bound ? collisions.has(bound) : false;
          return (
            <div key={slotId(slot)} className="mapping-slot-wrap">
              {slot.kind === 'axis' && !isTrigger && (
                <span className="mapping-direction">{slot.direction === 'positive' ? '+' : '−'}</span>
              )}
              <button
                className={`mapping-keybtn ${isActive ? 'active' : ''} ${collides ? 'collides' : ''}`}
                onClick={() => onRebind(slot)}
              >
                {isActive ? 'Press key…' : displayKey(bound)}
              </button>
              {bound && (
                <button
                  className="mapping-clear"
                  title="Unbind"
                  onClick={(e) => { e.stopPropagation(); onClear(slot); }}
                >×</button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function slotLabel(s: Slot): string {
  if (s.kind === 'axis') return `gamepad${s.gamepad}.${s.field} (${s.direction})`;
  return `gamepad${s.gamepad}.${s.field}`;
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n - 1) + '…';
}

function filterKeymapToUsage(km: Keymap, usage: GamepadUsage[]): Keymap {
  const next = emptyKeymap();
  for (const u of usage) {
    const src = u.gamepad === 1 ? km.gamepad1 : km.gamepad2;
    const dst = u.gamepad === 1 ? next.gamepad1 : next.gamepad2;
    if (u.isAxis) {
      const b = src.axes[u.field as AxisField];
      if (b) dst.axes[u.field as AxisField] = { ...b };
    } else {
      const b = src.buttons[u.field as ButtonField];
      if (b) dst.buttons[u.field as ButtonField] = { ...b };
    }
  }
  return next;
}

function findCollisions(km: Keymap): Set<string> {
  const counts = new Map<string, number>();
  const add = (k?: string) => { if (k) counts.set(k, (counts.get(k) ?? 0) + 1); };
  for (const gp of [km.gamepad1, km.gamepad2] as GamepadBindings[]) {
    for (const b of Object.values(gp.axes)) { add(b?.positive); add(b?.negative); }
    for (const b of Object.values(gp.buttons)) { add(b?.key); }
  }
  const out = new Set<string>();
  for (const [k, n] of counts) if (n > 1) out.add(k);
  return out;
}
