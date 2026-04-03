interface Props {
  connected: boolean;
}

export function GamepadIndicator({ connected }: Props) {
  if (!connected) return null;

  return (
    <div id="gamepad-indicator">
      <span className="dot"></span> Gamepad Connected
    </div>
  );
}
