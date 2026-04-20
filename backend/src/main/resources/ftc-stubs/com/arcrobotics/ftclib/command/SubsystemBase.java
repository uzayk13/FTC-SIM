package com.arcrobotics.ftclib.command;

public abstract class SubsystemBase {
    public void periodic() {}
    public void setDefaultCommand(CommandBase defaultCommand) {}
    public CommandBase getDefaultCommand() { return null; }
}
