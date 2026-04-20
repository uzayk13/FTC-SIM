package com.arcrobotics.ftclib.drivebase;

import com.arcrobotics.ftclib.hardware.motors.Motor;

public class MecanumDrive {
    public MecanumDrive(Motor fl, Motor fr, Motor bl, Motor br) {}
    public void driveRobotCentric(double strafeSpeed, double forwardSpeed, double turnSpeed) {}
    public void driveFieldCentric(double strafeSpeed, double forwardSpeed, double turnSpeed, double heading) {}
    public void stop() {}
}
