package com.qualcomm.robotcore.eventloop.opmode;

import com.qualcomm.robotcore.hardware.Gamepad;
import com.qualcomm.robotcore.hardware.HardwareMap;
import org.firstinspires.ftc.robotcore.external.Telemetry;
import com.qualcomm.robotcore.util.ElapsedTime;

public abstract class OpMode {
    public HardwareMap hardwareMap;
    public Telemetry telemetry;
    public Gamepad gamepad1;
    public Gamepad gamepad2;
    public ElapsedTime runtime = new ElapsedTime();

    public abstract void init();
    public void init_loop() {}
    public void start() {}
    public abstract void loop();
    public void stop() {}

    public double getRuntime() { return 0; }
    public void resetRuntime() {}
    public void requestOpModeStop() {}
}
