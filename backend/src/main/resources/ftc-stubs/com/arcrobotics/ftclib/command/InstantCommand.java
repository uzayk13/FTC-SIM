package com.arcrobotics.ftclib.command;

public class InstantCommand extends CommandBase {
    public InstantCommand() {}
    public InstantCommand(Runnable toRun, SubsystemBase... requirements) {}
    @Override public boolean isFinished() { return true; }
}
