package com.qualcomm.robotcore.hardware;

public interface Servo {
    enum Direction { FORWARD, REVERSE }
    void setDirection(Direction direction);
    Direction getDirection();
    void setPosition(double position);
    double getPosition();
    void scaleRange(double min, double max);
}
