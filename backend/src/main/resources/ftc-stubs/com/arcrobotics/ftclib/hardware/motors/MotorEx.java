package com.arcrobotics.ftclib.hardware.motors;

import com.qualcomm.robotcore.hardware.HardwareMap;

public class MotorEx extends Motor {
    public MotorEx(HardwareMap hMap, String id) { super(hMap, id); }
    public MotorEx(HardwareMap hMap, String id, double cpr, double rpm) { super(hMap, id, cpr, rpm); }
}
