package com.qualcomm.robotcore.eventloop.opmode;

public abstract class LinearOpMode extends OpMode {
    public abstract void runOpMode() throws InterruptedException;

    public void waitForStart() {}
    public void sleep(long milliseconds) {}
    public void idle() {}
    public boolean opModeIsActive() { return true; }
    public boolean opModeInInit() { return false; }
    public boolean isStopRequested() { return false; }
    public boolean isStarted() { return false; }

    @Override public final void init() {}
    @Override public final void loop() {}
}
