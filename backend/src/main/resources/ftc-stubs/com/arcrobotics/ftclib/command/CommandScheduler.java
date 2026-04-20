package com.arcrobotics.ftclib.command;

public class CommandScheduler {
    private static final CommandScheduler instance = new CommandScheduler();
    public static CommandScheduler getInstance() { return instance; }

    public void schedule(CommandBase... commands) {}
    public void cancel(CommandBase... commands) {}
    public void cancelAll() {}
    public void run() {}
    public void reset() {}
    public void registerSubsystem(SubsystemBase... subsystems) {}
}
