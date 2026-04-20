package com.qualcomm.robotcore.hardware;

public interface DcMotorEx extends DcMotor {
    void setVelocity(double angularRate);
    double getVelocity();
    void setMotorEnable();
    void setMotorDisable();
    boolean isMotorEnabled();
}
