import { useEffect, useRef, useState, useCallback } from 'react';
import { Engine } from '../core/Engine';
import type { ProjectFile } from '../code-runner/CodeRunner';
import { HUD } from './HUD';
import { Toolbar } from './Toolbar';
import { ControlsPanel } from './ControlsPanel';
import { CodeStatus } from './CodeStatus';
import { Telemetry } from './Telemetry';
import { GamepadIndicator } from './GamepadIndicator';
import type { Keymap } from '../input/Keymap';

interface Props {
  loadedFiles: ProjectFile[];
  keymap: Keymap;
}

export function SimulatorView({ loadedFiles, keymap }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<Engine | null>(null);

  const [matchTime, setMatchTime] = useState(150);
  const [redScore, setRedScore] = useState(0);
  const [blueScore, setBlueScore] = useState(0);
  const [matchPhase, setMatchPhase] = useState<string>('TELEOP');
  const [_paused, setPaused] = useState(false);
  const [telemetryData, setTelemetryData] = useState<Record<string, string>>({});
  const [cameraMode, setCameraMode] = useState('follow');
  const [codeRunning, setCodeRunning] = useState(false);
  const [codeOutput] = useState('');
  const [showControls, setShowControls] = useState(false);
  const [showCodeStatus, setShowCodeStatus] = useState(false);
  const [gamepadConnected, setGamepadConnected] = useState(false);

  // Initialize engine
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || engineRef.current) return;

    const engine = new Engine(canvas, keymap);
    engineRef.current = engine;
    (window as any).__engine = engine;
    engine.start();

    if (loadedFiles.length > 0) {
      engine.codeRunner.loadProject(loadedFiles);
      setShowCodeStatus(true);
    }

    // Poll engine state into React at 15fps (UI doesn't need 60fps updates)
    const interval = setInterval(() => {
      if (!engineRef.current) return;
      const e = engineRef.current;
      setMatchTime(e.matchTime);
      setRedScore(e.redScore);
      setBlueScore(e.blueScore);
      setMatchPhase(e.paused ? 'PAUSED' : e.matchPhase);
      setPaused(e.paused);
      setTelemetryData({ ...e.robot.telemetry });
      setCameraMode(e.cameraController.mode);
      setCodeRunning(e.codeRunner.running);

      // Check gamepad
      const gamepads = navigator.getGamepads();
      setGamepadConnected(gamepads.some(g => g !== null));
    }, 66);

    return () => {
      clearInterval(interval);
      engineRef.current?.dispose();
      engineRef.current = null;
    };
  }, []);

  const handleStartMatch = useCallback(() => engineRef.current?.startMatch(), []);
  const handleTogglePause = useCallback(() => engineRef.current?.togglePause(), []);
  const handleResetField = useCallback(() => engineRef.current?.resetField(), []);
  const handleToggleFreecam = useCallback(() => engineRef.current?.cameraController.toggleFreecam(), []);
  const handleStopCode = useCallback(() => engineRef.current?.codeRunner.stop(), []);

  // Keyboard shortcut for controls panel
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'TEXTAREA' || (e.target as HTMLElement)?.tagName === 'INPUT') return;
      if (e.code === 'KeyH') {
        setShowControls(prev => !prev);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  return (
    <div id="app">
      <canvas ref={canvasRef} id="simulator-canvas" />
      <div id="ui-overlay">
        <HUD
          matchTime={matchTime}
          redScore={redScore}
          blueScore={blueScore}
          matchPhase={matchPhase}
        />
        <ControlsPanel
          visible={showControls}
          onClose={() => setShowControls(false)}
          files={loadedFiles}
          keymap={keymap}
        />
        {showCodeStatus && (
          <CodeStatus
            codeOutput={codeOutput}
            onStop={handleStopCode}
          />
        )}
        <Toolbar
          onPlay={handleStartMatch}
          onPause={handleTogglePause}
          onReset={handleResetField}
          onControls={() => setShowControls(prev => !prev)}
          onFreecam={handleToggleFreecam}
        />
        <GamepadIndicator connected={gamepadConnected} />
        <Telemetry
          data={telemetryData}
          cameraMode={cameraMode}
          codeRunning={codeRunning}
        />
      </div>
    </div>
  );
}
