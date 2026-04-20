package com.arcrobotics.ftclib.command;

public class WaitCommand extends CommandBase {
    public WaitCommand(long millis) {}
    @Override public boolean isFinished() { return false; }
}
