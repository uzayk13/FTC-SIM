package org.firstinspires.ftc.robotcore.external.navigation;

public enum DistanceUnit {
    MM, CM, METER, INCH;
    public double fromMm(double mm) { return mm; }
    public double fromInches(double inches) { return inches; }
    public double toMm(double distance) { return distance; }
    public double toInches(double distance) { return distance; }
}
