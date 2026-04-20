package com.arcrobotics.ftclib.command;

import com.qualcomm.robotcore.eventloop.opmode.LinearOpMode;

public abstract class CommandOpMode extends LinearOpMode {
    @Override
    public void runOpMode() throws InterruptedException {}
    public abstract void initialize();
    public void run() {}
    public void schedule(CommandBase... commands) {}
    public void register(SubsystemBase... subsystems) {}
    public void reset() {}
}
