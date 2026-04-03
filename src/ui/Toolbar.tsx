interface Props {
  onPlay: () => void;
  onPause: () => void;
  onReset: () => void;
  onControls: () => void;
  onFreecam: () => void;
}

export function Toolbar({ onPlay, onPause, onReset, onControls, onFreecam }: Props) {
  return (
    <div id="toolbar">
      <button id="btn-play" title="Start Match" onClick={onPlay}>&#9654;</button>
      <button id="btn-pause" title="Pause" onClick={onPause}>&#10074;&#10074;</button>
      <button id="btn-reset" title="Reset Field" onClick={onReset}>&#8634;</button>
      <button id="btn-controls" title="Controls" onClick={onControls}>&#9881;</button>
      <button id="btn-freecam" title="Toggle Freecam" onClick={onFreecam}>&#128247;</button>
    </div>
  );
}
