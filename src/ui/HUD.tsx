interface Props {
  matchTime: number;
  redScore: number;
  blueScore: number;
  matchPhase: string;
}

export function HUD({ matchTime, redScore, blueScore, matchPhase }: Props) {
  const totalSeconds = Math.max(0, Math.ceil(matchTime));
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;

  return (
    <div id="hud">
      <div id="timer">{mins}:{secs.toString().padStart(2, '0')}</div>
      <div id="score-display">
        <span className="alliance red">RED: <span id="red-score">{redScore}</span></span>
        <span className="alliance blue">BLUE: <span id="blue-score">{blueScore}</span></span>
      </div>
      <div id="match-phase">{matchPhase}</div>
    </div>
  );
}
