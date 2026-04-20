package org.firstinspires.ftc.robotcore.external.navigation;

public enum AngleUnit {
    DEGREES, RADIANS;
    public double fromDegrees(double degrees) { return degrees; }
    public double fromRadians(double radians) { return radians; }
    public double toDegrees(double angle) { return angle; }
    public double toRadians(double angle) { return angle; }
    public double normalize(double angle) { return angle; }
}
