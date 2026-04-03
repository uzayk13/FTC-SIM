interface Props {
  visible: boolean;
  onClose: () => void;
}

export function ControlsPanel({ visible, onClose }: Props) {
  if (!visible) return null;

  return (
    <div id="controls-panel" className="panel">
      <div className="controls-header">
        <h3>Controls</h3>
        <button className="controls-close" onClick={onClose}>&times;</button>
      </div>
      <div className="control-group">
        <h4>Movement</h4>
        <p><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> — Drive / Strafe</p>
        <p><kbd>Q</kbd><kbd>E</kbd> — Turn Left / Right</p>
        <p><kbd>Shift</kbd> — Boost</p>
      </div>
      <div className="control-group">
        <h4>Actions</h4>
        <p><kbd>Space</kbd> — Shoot</p>
        <p><kbd>Z</kbd><kbd>X</kbd> — Intake In / Out</p>
        <p><kbd>&uarr;</kbd><kbd>&darr;</kbd> — Shooter Pitch</p>
        <p><kbd>&larr;</kbd><kbd>&rarr;</kbd> — Shooter Yaw</p>
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
        <p><kbd>R</kbd> — Reset Robot</p>
        <p><kbd>H</kbd> — Toggle This Panel</p>
      </div>
      <div className="control-group">
        <h4>Gamepad</h4>
        <p>Left Stick — Drive / Strafe</p>
        <p>Right Stick — Turn / Pitch</p>
        <p>LB / RB — Intake In / Out</p>
        <p>A — Shoot</p>
        <p>B — Boost</p>
      </div>
    </div>
  );
}
