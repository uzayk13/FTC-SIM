import type { Engine } from '../core/Engine';

export class UIManager {
  engine: Engine;

  private timerEl: HTMLElement;
  private redScoreEl: HTMLElement;
  private blueScoreEl: HTMLElement;
  private phaseEl: HTMLElement;
  private telemetryEl: HTMLElement;
  private controlsPanel: HTMLElement;
  private codeStatusPanel: HTMLElement;

  constructor(engine: Engine) {
    this.engine = engine;

    this.timerEl = document.getElementById('timer')!;
    this.redScoreEl = document.getElementById('red-score')!;
    this.blueScoreEl = document.getElementById('blue-score')!;
    this.phaseEl = document.getElementById('match-phase')!;
    this.telemetryEl = document.getElementById('telemetry-data')!;
    this.controlsPanel = document.getElementById('controls-panel')!;
    this.codeStatusPanel = document.getElementById('code-status')!;

    this.bindButtons();
  }

  private bindButtons() {
    document.getElementById('btn-play')?.addEventListener('click', () => {
      this.engine.startMatch();
    });

    document.getElementById('btn-pause')?.addEventListener('click', () => {
      this.engine.togglePause();
    });

    document.getElementById('btn-reset')?.addEventListener('click', () => {
      this.engine.resetField();
    });

    document.getElementById('btn-controls')?.addEventListener('click', () => {
      this.controlsPanel.classList.toggle('hidden');
    });

    document.getElementById('btn-freecam')?.addEventListener('click', () => {
      this.engine.cameraController.toggleFreecam();
    });

    document.getElementById('btn-stop-code')?.addEventListener('click', () => {
      this.engine.codeRunner.stop();
    });
  }

  showCodeStatus() {
    this.codeStatusPanel.classList.remove('hidden');
  }

  update() {
    // Timer
    const totalSeconds = Math.max(0, Math.ceil(this.engine.matchTime));
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    this.timerEl.textContent = `${mins}:${secs.toString().padStart(2, '0')}`;

    // Scores
    this.redScoreEl.textContent = String(this.engine.redScore);
    this.blueScoreEl.textContent = String(this.engine.blueScore);

    // Phase
    this.phaseEl.textContent = this.engine.matchPhase;
    if (this.engine.paused) {
      this.phaseEl.textContent = 'PAUSED';
    }

    // Telemetry
    const tel = this.engine.robot.telemetry;
    const camMode = this.engine.cameraController.mode;
    let telText = '';
    for (const [key, val] of Object.entries(tel)) {
      telText += `${key}: ${val}\n`;
    }
    telText += `Camera: ${camMode}\n`;
    if (this.engine.codeRunner.running) {
      telText += `OpMode: RUNNING\n`;
    }
    this.telemetryEl.textContent = telText;
  }
}
