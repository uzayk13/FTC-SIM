package com.arcrobotics.ftclib.gamepad;

import com.qualcomm.robotcore.hardware.Gamepad;

public class GamepadEx {
    public GamepadEx(Gamepad gamepad) {}

    public double getLeftX() { return 0; }
    public double getLeftY() { return 0; }
    public double getRightX() { return 0; }
    public double getRightY() { return 0; }
    public boolean getButton(GamepadKeys.Button button) { return false; }
    public double getTrigger(GamepadKeys.Trigger trigger) { return 0; }
    public void readButtons() {}
    public boolean wasJustPressed(GamepadKeys.Button button) { return false; }
    public boolean wasJustReleased(GamepadKeys.Button button) { return false; }
    public boolean isDown(GamepadKeys.Button button) { return false; }
}
