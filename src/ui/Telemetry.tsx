interface Props {
  data: Record<string, string>;
  cameraMode: string;
  codeRunning: boolean;
}

export function Telemetry({ data, cameraMode, codeRunning }: Props) {
  let telText = '';
  for (const [key, val] of Object.entries(data)) {
    telText += `${key}: ${val}\n`;
  }
  telText += `Camera: ${cameraMode}\n`;
  if (codeRunning) {
    telText += `OpMode: RUNNING\n`;
  }

  return (
    <div id="telemetry">
      <h4>Telemetry</h4>
      <pre id="telemetry-data">{telText}</pre>
    </div>
  );
}
