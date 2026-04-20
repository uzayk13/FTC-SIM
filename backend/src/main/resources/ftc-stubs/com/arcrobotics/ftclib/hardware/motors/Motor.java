package com.arcrobotics.ftclib.hardware.motors;

import com.qualcomm.robotcore.hardware.HardwareMap;

public class Motor {
    public enum ZeroPowerBehavior { UNKNOWN, BRAKE, FLOAT }
    public enum RunMode { RawPower, VelocityControl, PositionControl }

    public Motor(HardwareMap hMap, String id) {}
    public Motor(HardwareMap hMap, String id, double cpr, double rpm) {}

    public void set(double speed) {}
    public double get() { return 0; }
    public void setRunMode(RunMode runMode) {}
    public void setZeroPowerBehavior(ZeroPowerBehavior behavior) {}
    public int getCurrentPosition() { return 0; }
    public void setTargetPosition(int target) {}
    public void setInverted(boolean isInverted) {}
    public void resetEncoder() {}
    public void stopMotor() {}
    public double getVelocity() { return 0; }
    public void setPositionTolerance(double tolerance) {}
    public boolean atTargetPosition() { return false; }
}
