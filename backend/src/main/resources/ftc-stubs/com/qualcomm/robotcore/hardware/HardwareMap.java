package com.qualcomm.robotcore.hardware;

public class HardwareMap {
    public DeviceMapping<DcMotor> dcMotor = new DeviceMapping<>();
    public DeviceMapping<Servo> servo = new DeviceMapping<>();
    public DeviceMapping<CRServo> crservo = new DeviceMapping<>();

    public <T> T get(Class<T> classOrInterface, String deviceName) { return null; }

    public static class DeviceMapping<T> {
        public T get(String deviceName) { return null; }
    }
}
