interface Props {
  codeOutput: string;
  onStop: () => void;
}

export function CodeStatus({ codeOutput, onStop }: Props) {
  return (
    <div id="code-status" className="panel">
      <h3>OpMode</h3>
      <div id="code-output">{codeOutput}</div>
      <div className="btn-row">
        <button id="btn-stop-code" onClick={onStop}>Stop OpMode</button>
      </div>
    </div>
  );
}
