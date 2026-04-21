import { useMemo } from 'react';
import type { ProjectFile } from '../code-runner/CodeRunner';
import { scanGamepadUsage } from '../code-runner/GamepadUsageScanner';
import { displayKey, type Keymap, type AxisField, type ButtonField } from '../input/Keymap';

interface Props {
  visible: boolean;
  onClose: () => void;
  files: ProjectFile[];
  keymap: Keymap;
}

export function ControlsPanel({ visible, onClose, files, keymap }: Props) {
  const usage = useMemo(() => scanGamepadUsage(files), [files]);
  if (!visible) return null;

  return (
    <div id="controls-panel" className="panel">
      <div className="controls-header">
        <h3>Controls</h3>
        <button className="controls-close" onClick={onClose}>&times;</button>
      </div>

      <div className="control-group">
        <h4>From your code</h4>
        {usage.length === 0 ? (
          <p style={{ color: '#94a3b8', fontSize: 12 }}>
            No gamepad inputs detected in the uploaded code.
          </p>
        ) : (
          usage.map((u) => {
            const bindings = u.gamepad === 1 ? keymap.gamepad1 : keymap.gamepad2;
            const label = `gamepad${u.gamepad}.${u.field}`;
            if (u.isAxis) {
              const b = bindings.axes[u.field as AxisField];
              const isTrigger = u.field === 'left_trigger' || u.field === 'right_trigger';
              return (
                <p key={label}>
                  {isTrigger
                    ? <><kbd>{displayKey(b?.positive)}</kbd></>
                    : <><kbd>{displayKey(b?.positive)}</kbd>/<kbd>{displayKey(b?.negative)}</kbd></>
                  }
                  {' '}— {label}
                </p>
              );
            }
            const b = bindings.buttons[u.field as ButtonField];
            return (
              <p key={label}>
                <kbd>{displayKey(b?.key)}</kbd> — {label}
              </p>
            );
          })
        )}
      </div>

      <div className="control-group">
        <h4>Camera</h4>
        <p><kbd>F</kbd> — Toggle Freecam</p>
        <p><kbd>1</kbd><kbd>2</kbd><kbd>3</kbd> — Camera Presets</p>
        <p>Mouse Drag — Orbit Camera</p>
        <p>Scroll — Zoom In / Out</p>
      </div>

      <div className="control-group">
        <h4>Other</h4>
        <p><kbd>H</kbd> — Toggle This Panel</p>
      </div>
    </div>
  );
}
