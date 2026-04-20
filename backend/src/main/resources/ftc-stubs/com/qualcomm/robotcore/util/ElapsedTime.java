package com.qualcomm.robotcore.util;

public class ElapsedTime {
    public enum Resolution { SECONDS, MILLISECONDS }

    public ElapsedTime() {}
    public ElapsedTime(Resolution resolution) {}

    public double time() { return 0; }
    public double seconds() { return 0; }
    public double milliseconds() { return 0; }
    public void reset() {}
    public String toString() { return "0.0"; }
}
