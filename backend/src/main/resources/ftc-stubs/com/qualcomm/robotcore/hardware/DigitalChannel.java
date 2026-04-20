package com.qualcomm.robotcore.hardware;

public interface DigitalChannel {
    enum Mode { INPUT, OUTPUT }
    boolean getState();
    void setState(boolean state);
    void setMode(Mode mode);
    Mode getMode();
}
