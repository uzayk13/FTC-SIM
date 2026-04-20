package com.arcrobotics.ftclib.command;

public abstract class CommandBase {
    public void initialize() {}
    public void execute() {}
    public boolean isFinished() { return false; }
    public void end(boolean interrupted) {}
    public CommandBase withTimeout(long millis) { return this; }
    public CommandBase andThen(CommandBase... next) { return this; }
}
