package com.qualcomm.robotcore.hardware;

import org.firstinspires.ftc.robotcore.external.navigation.AngleUnit;
import org.firstinspires.ftc.robotcore.external.navigation.AngularVelocity;
import org.firstinspires.ftc.robotcore.external.navigation.YawPitchRollAngles;

public interface IMU {
    boolean initialize(Parameters parameters);
    void resetYaw();
    YawPitchRollAngles getRobotYawPitchRollAngles();
    AngularVelocity getRobotAngularVelocity(AngleUnit angleUnit);

    class Parameters {
        public Parameters(Object imuOrientationOnRobot) {}
    }
}
